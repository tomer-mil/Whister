"""Application configuration using pydantic-settings."""
from functools import lru_cache
from typing import Literal

from pydantic import PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Whist Score Keeper"
    app_version: str = "1.0.0"
    debug: bool = False
    environment: Literal["development", "staging", "production"] = "development"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1

    # Database
    database_url: PostgresDsn
    database_pool_size: int = 10
    database_max_overflow: int = 20
    database_pool_timeout: int = 30

    # Redis
    redis_url: RedisDsn
    redis_pool_size: int = 10

    # JWT
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # Security
    bcrypt_rounds: int = 12
    cors_origins: list[str] = ["http://localhost:3000"]

    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_default_requests: int = 100
    rate_limit_default_window_seconds: int = 60

    # Room settings
    room_code_length: int = 6
    room_ttl_hours: int = 24
    room_max_reconnect_seconds: int = 60

    @field_validator("cors_origins", mode="before")  # type: ignore
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
