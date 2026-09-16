"""
Application Configuration
"""

import os
from typing import Optional
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables"""

    # App
    APP_NAME: str = "TeraShield"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    API_PREFIX: str = "/api/v1"

    # Database
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "5432"))
    DB_NAME: str = os.getenv("DB_NAME", "terashield")
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "postgres")

    @property
    def DATABASE_URL(self) -> str:
        """PostgreSQL database URL"""
        return f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Authentication
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Demo credentials (development only)
    DEMO_USER: str = "sih"
    DEMO_PASS: str = "sih2026"

    # Demo Emergency Response Team credentials (development only) — a
    # separate role with its own login and operational dashboard, not the
    # analytical admin portal.
    DEMO_RESCUE_USER: str = "rescue"
    DEMO_RESCUE_PASS: str = "rescue2026"

    # Google Earth Engine
    GEE_PROJECT: Optional[str] = os.getenv("GEE_PROJECT")
    GEE_CREDENTIALS: Optional[str] = os.getenv("GEE_CREDENTIALS")

    # File Storage
    DATA_DIR: str = os.getenv("DATA_DIR", "./data")
    OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "./data/processed")
    TEMP_DIR: str = os.getenv("TEMP_DIR", "./data/temp")

    # Hazard Intelligence
    USE_GEE: bool = os.getenv("USE_GEE", "false").lower() == "true"
    HAZARD_CACHE_MINUTES: int = int(os.getenv("HAZARD_CACHE_MINUTES", "60"))

    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://localhost",
        "*"  # For development only
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
