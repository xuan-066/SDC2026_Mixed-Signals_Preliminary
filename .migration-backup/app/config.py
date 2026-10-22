import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    database_url: str = "sqlite:///./sejukguard.db"
    demo_mode: bool = True
    llm_enabled: bool = False
    llm_model: str = "claude-opus-5-5"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.environ.get("DATABASE_URL", cls.database_url),
            demo_mode=_env_bool("DEMO_MODE", cls.demo_mode),
            llm_enabled=_env_bool("LLM_ENABLED", cls.llm_enabled),
            llm_model=os.environ.get("LLM_MODEL", cls.llm_model),
        )
