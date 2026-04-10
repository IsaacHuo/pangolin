from fastapi import Request, WebSocket
from fastapi.responses import JSONResponse
from ..exceptions import (
    FirewallException,
    InterceptionError,
    AnalysisTimeout,
    GatewayError,
    ConfigurationError,
)

async def firewall_exception_handler(request: Request, exc: FirewallException):
    status_code = 500
    if isinstance(exc, AnalysisTimeout):
        status_code = 504
    elif isinstance(exc, GatewayError):
        status_code = 502
    elif isinstance(exc, ConfigurationError):
        status_code = 400

    return JSONResponse(
        status_code=status_code,
        content={"error": exc.__class__.__name__, "message": str(exc)},
    )

def register_error_handlers(app):
    app.add_exception_handler(FirewallException, firewall_exception_handler)
from fastapi import Request, FastAPI
from fastapi.responses import JSONResponse
import logging

from src.exceptions import (
    AgentFirewallError,
    InterceptionError,
    AnalysisTimeout,
    GatewayError,
    AuthenticationError,
    BufferOverflowError
)

logger = logging.getLogger("agent_firewall.errors")

def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(InterceptionError)
    async def interception_error_handler(request: Request, exc: InterceptionError):
        logger.error(f"InterceptionError: {exc.message}")
        return JSONResponse(status_code=500, content={"error": exc.message, "code": exc.code})

    @app.exception_handler(AnalysisTimeout)
    async def analysis_timeout_handler(request: Request, exc: AnalysisTimeout):
        logger.error(f"AnalysisTimeout: {exc.message}")
        return JSONResponse(status_code=504, content={"error": exc.message, "code": exc.code})

    @app.exception_handler(GatewayError)
    async def gateway_error_handler(request: Request, exc: GatewayError):
        logger.error(f"GatewayError: {exc.message}")
        return JSONResponse(status_code=502, content={"error": exc.message, "code": exc.code})

    @app.exception_handler(AuthenticationError)
    async def auth_error_handler(request: Request, exc: AuthenticationError):
        logger.error(f"AuthenticationError: {exc.message}")
        return JSONResponse(status_code=401, content={"error": exc.message, "code": exc.code})

    @app.exception_handler(BufferOverflowError)
    async def buffer_overflow_handler(request: Request, exc: BufferOverflowError):
        logger.error(f"BufferOverflowError: {exc.message}")
        return JSONResponse(status_code=429, content={"error": exc.message, "code": exc.code})

    @app.exception_handler(AgentFirewallError)
    async def base_firewall_error_handler(request: Request, exc: AgentFirewallError):
        logger.error(f"AgentFirewallError: {str(exc)}")
        return JSONResponse(status_code=500, content={"error": "An internal firewall error occurred", "details": str(exc)})
