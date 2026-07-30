from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for single-user xuesen backend."""

    model_config = SettingsConfigDict(
        env_prefix="XUESEN_",
        env_file=".env",
        extra="ignore",
    )

    # SQLite database
    database_url: str = "sqlite+aiosqlite:///./xuesen_data/backend.db"
    
    # CORS origins for frontend
    allowed_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    
    # Storage
    storage_root: Path = Path("./xuesen_data/blobs")
    
    # Auto create schema on startup
    auto_create_schema: bool = True
    
    # AI / LLM configuration
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: int = 60

    @property
    def origin_set(self) -> frozenset[str]:
        return frozenset(origin.rstrip("/") for origin in self.allowed_origins)
