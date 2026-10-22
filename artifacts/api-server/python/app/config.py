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
    demo_mode: bool = False
    llm_enabled: bool = False
    llm_model: str = "claude-opus-5-5"
    run_worker: bool = True

    @classmethod
    def from_env(cls) -> "Settings":
        demo = _env_bool("DEMO_MODE", cls.demo_mode)
        return cls(
            database_url=os.environ.get("DATABASE_URL", "sqlite:///./sejukguard-demo.db" if demo else cls.database_url),
            demo_mode=demo,
            llm_enabled=_env_bool("LLM_ENABLED", cls.llm_enabled),
            llm_model=os.environ.get("LLM_MODEL", cls.llm_model),
        )
