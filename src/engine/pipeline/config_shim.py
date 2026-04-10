import logging

from src.config import FirewallConfig, get_config

logger = logging.getLogger("agent_firewall.shim")

class SettingsShim:
    def __init__(self, firewall_config: FirewallConfig):
        self.firewall_config = firewall_config
        # Map settings required by ai-protector LangGraph nodes
        self.default_policy = "balanced"
        self.enable_llm_guard = getattr(firewall_config, "l2_enabled", True)
        self.enable_presidio = getattr(firewall_config, "l2_enabled", True)
        self.enable_nemo_guardrails = getattr(firewall_config, "l2_enabled", True)
        self.openai_api_key = getattr(firewall_config, "l2_api_key", "")
        self.embedding_model = "text-embedding-3-small" # Hardcoded for NeMo fallback
        self.scanner_timeout = getattr(firewall_config, "l2_timeout_seconds", 10.0)

    @property
    def log_level(self):
        return "INFO"

def get_settings():
    return SettingsShim(get_config())
