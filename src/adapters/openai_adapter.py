"""
OpenAI API Proxy Adapter — Intercepts and secures LLM traffic.

This module provides a `handle_openai_chat_completion` function that:
  1. Intercepts `POST /v1/chat/completions`.
  2. Extracts prompt content from the request body.
  3. Uses L1/L2 engines to analyze the prompt for malice/injection.
  4. Blocks dangerous requests or forwards safe ones to the upstream provider.
  5. Supports SSE streaming responses.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from ..engine.semantic_analyzer import SemanticAnalyzer
from ..engine.static_analyzer import StaticAnalyzer
from ..models import ThreatLevel

logger = logging.getLogger("pangolin.openai")


class OpenAIAdapter:
    """
    Proxy adapter for OpenAI-compatible chat completion endpoints.
    """

    def __init__(
        self,
        upstream_base_url: str,
        static_analyzer: StaticAnalyzer,
        semantic_analyzer: SemanticAnalyzer,
        api_key: str | None = None,
    ) -> None:
        # Ensure upstream base URL doesn't have trailing slash
        self.upstream_url = upstream_base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=60.0)
        self.static_analyzer = static_analyzer
        self.semantic_analyzer = semantic_analyzer
        self.api_key = api_key

    async def close(self) -> None:
        await self.client.aclose()

    def _normalize_to_chat_completions(self, body: dict[str, Any]) -> dict[str, Any]:
        """
        Convert OpenAI Responses API format to Chat Completions format.

        Responses API uses ``input`` (list of messages or a string),
        while Chat Completions uses ``messages``.  This normalizer
        ensures the upstream (OpenRouter / any OpenAI-compatible
        provider) always receives a well-formed Chat Completions body.
        """
        if "messages" in body:
            return body  # already in Chat Completions format

        if "input" not in body:
            return body  # nothing to convert

        raw_input = body["input"]

        # input can be a plain string or a list of message objects
        if isinstance(raw_input, str):
            messages = [{"role": "user", "content": raw_input}]
        elif isinstance(raw_input, list):
            messages = []
            for item in raw_input:
                if isinstance(item, str):
                    messages.append({"role": "user", "content": item})
                elif isinstance(item, dict):
                    messages.append(item)
        else:
            messages = [{"role": "user", "content": str(raw_input)}]

        # Build a new body with ``messages`` instead of ``input``
        converted = {k: v for k, v in body.items() if k != "input"}
        converted["messages"] = messages

        # Responses API uses ``instructions`` for the system prompt
        if "instructions" in converted:
            messages.insert(0, {"role": "system", "content": converted.pop("instructions")})

        return converted

    async def handle_chat_completion(self, request: Request) -> StreamingResponse:
        """
        Handle POST /v1/chat/completions **and** POST /v1/responses.

        If the incoming body uses the Responses API schema (``input``
        field), it is transparently converted to Chat Completions
        format before analysis and upstream forwarding.
        """
        try:
            body = await request.json()
            logger.info(f"Incoming payload: {json.dumps(body)}")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        # Normalize: convert Responses API format → Chat Completions format
        body = self._normalize_to_chat_completions(body)

        messages = body.get("messages", [])
        if not messages:
            # Pass through empty requests or just forward them
            pass

        # 1. Extract content for analysis
        # We analyze the last user message usually, or all new content.
        # For simplicity, let's concat all user messages.
        # content can be a string OR a list of content parts (multi-modal format).
        def _extract_text(content: Any) -> str:
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return "\n".join(
                    part.get("text", "") if isinstance(part, dict) else str(part)
                    for part in content
                )
            return str(content) if content else ""

        user_content = "\n".join(
            [_extract_text(m.get("content", "")) for m in messages if m.get("role") == "user"]
        )

        # 2. L1 Analysis (Static)
        l1_result = self.static_analyzer.analyze(user_content)

        # Map L1 threat level to a verdict
        is_l1_blocked = l1_result.threat_level in (ThreatLevel.CRITICAL, ThreatLevel.HIGH)

        if is_l1_blocked:
            reason = f"Static Analysis: {', '.join(l1_result.matched_patterns)}"
            logger.warning(f"BLOCKED (L1) request: {reason}")
            raise HTTPException(status_code=403, detail=f"Firewall Blocked: {reason}")

        # 3. L2 Analysis (LangGraph 5-layer Pipeline)
        import uuid

        from ..engine.pipeline.runner import run_pre_llm_pipeline

        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

        pipeline_state = await run_pre_llm_pipeline(
            request_id=request_id,
            client_id="default_client",
            policy_name="balanced",
            model=body.get("model", "unknown"),
            messages=messages,
            temperature=body.get("temperature", 0.7),
            max_tokens=body.get("max_tokens"),
            stream=body.get("stream", False),
            api_key=None,
        )

        is_pipeline_blocked = pipeline_state.get("decision") == "BLOCK"

        if is_pipeline_blocked:
            reason = f"Security Pipeline: {pipeline_state.get('blocked_reason', 'Blocked by Firewall Policy')}"
            logger.warning(f"BLOCKED (Pipeline) request: {reason}")
            raise HTTPException(status_code=403, detail=f"Firewall Blocked: {reason}")
        # Build clean upstream headers — only forward safe headers to avoid
        # 400 errors from hop-by-hop or internal headers leaking through.
        # Build minimal upstream headers — do NOT forward client headers to
        # avoid Cloudflare / upstream rejecting unexpected or malformed headers.
        upstream_headers: dict[str, str] = {
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
        }

        request_api_key = request.headers.get("x-api-key", "").strip()
        if not request_api_key:
            auth_header = request.headers.get("authorization", "")
            if auth_header.lower().startswith("bearer "):
                request_api_key = auth_header[7:].strip()

        effective_api_key = request_api_key or self.api_key
        if effective_api_key:
            upstream_headers["Authorization"] = f"Bearer {effective_api_key}"

        # Forward HTTP-Referer and X-Title if present (OpenRouter ranking)
        for h in ("http-referer", "x-title"):
            v = request.headers.get(h)
            if v:
                upstream_headers[h] = v

        # We need to forward to the EXACT upstream endpoint.
        target_url = f"{self.upstream_url}/chat/completions"

        logger.info(f"Forwarding to upstream: {target_url} model={body.get('model')}")

        req = self.client.build_request(
            "POST",
            target_url,
            headers=upstream_headers,
            json=body,
        )

        r = await self.client.send(req, stream=True)

        # Log non-2xx responses for debugging
        if r.status_code >= 400:
            error_body = await r.aread()
            logger.error(
                f"Upstream returned {r.status_code}: {error_body[:500].decode(errors='replace')}"
            )
            return StreamingResponse(
                iter([error_body]),
                status_code=r.status_code,
                headers={"content-type": r.headers.get("content-type", "application/json")},
            )

        # Only forward safe response headers — do NOT forward transport-level
        # headers like transfer-encoding, content-encoding, content-length as
        # they conflict with ASGI/uvicorn's own framing and cause broken streams.
        safe_response_headers: dict[str, str] = {}
        _skip_response_headers = frozenset(
            {
                "transfer-encoding",
                "content-encoding",
                "content-length",
                "connection",
                "keep-alive",
            }
        )
        for key, value in r.headers.items():
            if key.lower() not in _skip_response_headers:
                safe_response_headers[key] = value

        # Use aiter_bytes() to get decoded (decompressed) content, since we
        # stripped content-encoding above.
        return StreamingResponse(
            r.aiter_bytes(),
            status_code=r.status_code,
            headers=safe_response_headers,
        )
