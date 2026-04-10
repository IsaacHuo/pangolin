from __future__ import annotations
import time

import logging
from typing import Any
from .config import FirewallConfig
from .engine.static_analyzer import StaticAnalyzer
from .engine.semantic_analyzer import SemanticAnalyzer, LlmClassifier, MockClassifier
from .engine.agent_scan_integration import AgentScanAnalyzer
from .audit.logger import AuditLogger
from .dashboard.ws_handler import DashboardHub
from .adapters.sse_adapter import SseAdapter, WebSocketAdapter
from .adapters.openai_adapter import OpenAIAdapter
from .adapters.session_manager import SessionManager
from .models import DashboardEvent, AuditEntry

logger = logging.getLogger("pangolin")


class AppState:
    """Container for all shared application state."""

    @staticmethod
    def _derive_openai_upstream(l2_endpoint: str) -> str:
        """Map a chat/completions endpoint to its OpenAI-compatible base URL."""
        if "/chat/completions" in l2_endpoint:
            return l2_endpoint.replace("/chat/completions", "")
        return "https://openrouter.ai/api/v1"

    def __init__(self, config: FirewallConfig) -> None:
        self.config = config
        self.static_analyzer = StaticAnalyzer(config.blocked_commands)
        # Use LlmClassifier if L2 is enabled, else Mock
        self.semantic_analyzer = SemanticAnalyzer(
            classifier=LlmClassifier(config) if config.l2_enabled else MockClassifier(),
            config=config,
        )
        self.agent_scan_analyzer = AgentScanAnalyzer(
            enabled=config.agent_scan_enabled,
            mode=config.agent_scan_mode,
            api_key=config.agent_scan_api_key,
            cache_ttl=config.agent_scan_cache_ttl,
        )
        self.session_manager = SessionManager(config)
        self.audit_logger = AuditLogger(config.audit_log_path)
        self.dashboard_hub = DashboardHub()
        self.sse_adapter = SseAdapter(
            upstream_base_url=f"http://{config.upstream_host}:{config.upstream_port}",
            session_manager=self.session_manager,
            static_analyzer=self.static_analyzer,
            semantic_analyzer=self.semantic_analyzer,
            agent_scan_analyzer=self.agent_scan_analyzer,
            emit_dashboard_event=self._emit_dashboard,
            emit_audit_entry=self._emit_audit,
        )
        self.ws_adapter = WebSocketAdapter(
            upstream_ws_url=f"ws://{config.upstream_host}:{config.upstream_port}/ws",
            session_manager=self.session_manager,
            static_analyzer=self.static_analyzer,
            semantic_analyzer=self.semantic_analyzer,
            agent_scan_analyzer=self.agent_scan_analyzer,
            emit_dashboard_event=self._emit_dashboard,
            emit_audit_entry=self._emit_audit,
        )

        # Initialize OpenAI proxy using L2 configuration as upstream hint
        openai_upstream = self._derive_openai_upstream(config.l2_model_endpoint)

        self.openai_adapter = OpenAIAdapter(
            upstream_base_url=openai_upstream,
            static_analyzer=self.static_analyzer,
            semantic_analyzer=self.semantic_analyzer,
            api_key=config.l2_api_key,
        )

        
        if config.feishu_enabled and config.feishu_app_id:
            feishu_config = FeishuConfig(
                app_id=config.feishu_app_id,
                app_secret=config.feishu_app_secret,
                encrypt_key=config.feishu_encrypt_key or None,
                verification_token=config.feishu_verification_token or None,
                model=config.feishu_model,
                upstream_url=config.feishu_upstream_url,
            )
            self.feishu_adapter = FeishuAdapter(
                config=feishu_config,
                static_analyzer=self.static_analyzer,
                semantic_analyzer=self.semantic_analyzer,
                upstream_url=openai_upstream,
                emit_dashboard_event=self._emit_dashboard,
                emit_audit_entry=self._emit_audit,
            )

        # Initialize storage
        from .storage.jsonl import JsonlStorage

        self.storage = JsonlStorage(config.storage_path)

        self._start_time = time.time()

    async def reload_config(self, updates: dict[str, Any]) -> None:
        """Update the configuration and re-initialize downstream services."""
        # Convert frozen dataclass to dict, update with the partial changes, then re-create
        new_config_dict = asdict(self.config)
        new_config_dict.update(updates)

        # Coerce types if necessary (e.g. list from JSON to frozenset)
        if "blocked_commands" in new_config_dict and isinstance(
            new_config_dict["blocked_commands"], list
        ):
            new_config_dict["blocked_commands"] = frozenset(new_config_dict["blocked_commands"])

        self.config = FirewallConfig(**new_config_dict)

        # Re-initialize only the parts that depend on the updated config
        # (For L1, we handle separately through the /rules endpoints if needed,
        # but here we synchronize the whole config's blocked_commands as well).
        if "blocked_commands" in updates:
            self.static_analyzer = StaticAnalyzer(self.config.blocked_commands)

        l2_runtime_keys = {
            "l2_enabled",
            "l2_api_key",
            "l2_model",
            "l2_model_endpoint",
            "l2_timeout_seconds",
        }
        if any(key in updates for key in l2_runtime_keys):
            # Shutdown old client if it's LlmClassifier
            await self.semantic_analyzer.close()

            self.semantic_analyzer = SemanticAnalyzer(
                classifier=LlmClassifier(self.config)
                if self.config.l2_enabled
                else MockClassifier(),
                config=self.config,
            )

        # Update adapters with refreshed analyzer refs and runtime auth/upstream.
        self.openai_adapter.upstream_url = self._derive_openai_upstream(
            self.config.l2_model_endpoint
        ).rstrip("/")
        self.openai_adapter.api_key = self.config.l2_api_key
        self.openai_adapter.static_analyzer = self.static_analyzer
        self.openai_adapter.semantic_analyzer = self.semantic_analyzer

        self.sse_adapter.static_analyzer = self.static_analyzer
        self.sse_adapter.semantic_analyzer = self.semantic_analyzer
        self.ws_adapter.static_analyzer = self.static_analyzer
        self.ws_adapter.semantic_analyzer = self.semantic_analyzer

        if self.feishu_adapter:
            self.feishu_adapter.static_analyzer = self.static_analyzer
            self.feishu_adapter.semantic_analyzer = self.semantic_analyzer
            self.feishu_adapter.upstream_url = self.openai_adapter.upstream_url

    async def _emit_dashboard(self, event: DashboardEvent) -> None:
        await self.dashboard_hub.broadcast(event)

    async def _emit_audit(self, entry: AuditEntry) -> None:
        await self.audit_logger.log(entry)

    @property
    def uptime_seconds(self) -> float:
        return time.time() - self._start_time
