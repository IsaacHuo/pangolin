class FirewallException(Exception):
    """Base exception for all Pangolin errors."""
    pass

class InterceptionError(FirewallException):
    """Raised when interception or analysis fails."""
    pass

class AnalysisTimeout(InterceptionError):
    """Raised when semantic or static analysis times out."""
    pass

class GatewayError(FirewallException):
    """Raised when communication with the upstream gateway fails."""
    pass

class ConfigurationError(FirewallException):
    """Raised when configuration is invalid or missing."""
    pass
class AgentFirewallError(Exception):
    """Base exception for all Pangolin errors."""
    pass

class InterceptionError(AgentFirewallError):
    """Raised when an error occurs during interception."""
    def __init__(self, message: str, code: str = "intercept_error"):
        super().__init__(message)
        self.code = code

class AnalysisTimeout(AgentFirewallError):
    """Raised when an analysis (e.g., L2) times out."""
    def __init__(self, message: str = "Analysis timed out"):
        super().__init__(message)
        self.code = "analysis_timeout"

class GatewayError(AgentFirewallError):
    """Raised for gateway communication or discovery issues."""
    def __init__(self, message: str, code: str = "gateway_error"):
        super().__init__(message)
        self.code = code

class AuthenticationError(AgentFirewallError):
    """Raised when authentication fails."""
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message)
        self.code = "auth_error"

class BufferOverflowError(AgentFirewallError):
    """Raised when a session buffer is full."""
    def __init__(self, message: str = "Session buffer overflow"):
        super().__init__(message)
        self.code = "buffer_overflow"
