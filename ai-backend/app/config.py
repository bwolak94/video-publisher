from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Missing required fields raise ValidationError immediately
        case_sensitive=True,
    )

    # Required — missing value raises ValidationError on instantiation
    OPENAI_API_KEY: str

    # Optional with safe defaults
    REDIS_URL: str = "redis://localhost:6379"
    APP_ENV: Literal["dev", "test", "prod"] = "dev"
    APP_VERSION: str = "0.1.0"
    # Optional — only needed when NewsAPI source is enabled on a channel
    NEWSAPI_KEY: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance. Fails fast if required vars are missing."""
    return Settings()
