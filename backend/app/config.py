"""
Shama Abidi PhD System — Production Configuration (`backend/app/config.py`)
Loads and validates environment variables with safe defaults and strict security settings.
"""

import os
from pathlib import Path
import secrets
from typing import List


ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT_DIR / "data"
STORAGE_DIR = ROOT_DIR / "storage" / "uploads"
UPLOAD_DIR = STORAGE_DIR
BACKUP_DIR = ROOT_DIR / "backups"


def _load_dotenv_file() -> None:
    env_file = ROOT_DIR / ".env"
    if env_file.exists():
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k] = v


_load_dotenv_file()


def _resolve_environment() -> str:
    return os.getenv("ENVIRONMENT", "development").strip().lower()


def _resolve_database_url(env: str) -> str:
    raw_url = os.getenv("DATABASE_URL", "").strip()
    if env == "production":
        if not raw_url:
            raise RuntimeError(
                "CRITICAL_CONFIGURATION_ERROR: DATABASE_URL is missing in production. "
                "Production requires a PostgreSQL connection (e.g. postgresql+psycopg://...). "
                "Application startup aborted."
            )
        if raw_url.startswith("sqlite"):
            raise RuntimeError(
                "CRITICAL_CONFIGURATION_ERROR: SQLite is not allowed in production. "
                "Please configure a PostgreSQL connection string. Application startup aborted."
            )
        return raw_url

    default_sqlite = f"sqlite:///{(DATA_DIR / 'shama_production_orm.db').as_posix()}"
    if not raw_url or "@postgres:" in raw_url or "asyncpg" in raw_url:
        return default_sqlite
    return raw_url


def _resolve_secret_key(env: str) -> str:
    raw = os.getenv("SECRET_KEY", "").strip()
    if not raw:
        if env == "production":
            raise RuntimeError(
                "CRITICAL_CONFIGURATION_ERROR: SECRET_KEY is not configured in production. "
                "Application startup aborted to prevent insecure execution."
            )
        return secrets.token_hex(32)
    if env == "production" and len(raw) < 32:
        raise RuntimeError("CRITICAL_CONFIGURATION_ERROR: Production SECRET_KEY must be >= 32 characters.")
    return raw


def _resolve_jwt_secret(env: str) -> str:
    raw = os.getenv("JWT_SECRET", "").strip()
    if not raw:
        if env == "production":
            raise RuntimeError(
                "CRITICAL_CONFIGURATION_ERROR: JWT_SECRET is not configured in production. "
                "Application startup aborted to prevent insecure token minting."
            )
        return secrets.token_hex(32)
    if env == "production" and len(raw) < 32:
        raise RuntimeError("CRITICAL_CONFIGURATION_ERROR: Production JWT_SECRET must be >= 32 characters.")
    return raw


def _resolve_cors_origins(env: str) -> List[str]:
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    if env == "production":
        prod_origins = os.getenv("PRODUCTION_FRONTEND_URL", "").strip()
        origins = [o.strip() for o in prod_origins.split(",") if o.strip()] if prod_origins else []
        if not origins:
            origins = ["https://shamaabidiphd.sbs", "https://www.shamaabidiphd.sbs"]
        return origins
    return [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]


class Settings:
    ENVIRONMENT: str = _resolve_environment()
    DATABASE_URL: str = _resolve_database_url(ENVIRONMENT)

    SECRET_KEY: str = _resolve_secret_key(ENVIRONMENT)
    JWT_SECRET: str = _resolve_jwt_secret(ENVIRONMENT)
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    INITIAL_ADMIN_EMAIL: str = os.getenv("INITIAL_ADMIN_EMAIL", "shamaabidiphd@gmail.com").strip().lower()
    INITIAL_ADMIN_PASSWORD: str = os.getenv("INITIAL_ADMIN_PASSWORD", "").strip()

    CORS_ALLOWED_ORIGINS: List[str] = _resolve_cors_origins(ENVIRONMENT)

    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
    AUTH_LOCKOUT_THRESHOLD: int = int(os.getenv("AUTH_LOCKOUT_THRESHOLD", "5"))
    AUTH_LOCKOUT_DURATION_MINUTES: int = int(os.getenv("AUTH_LOCKOUT_DURATION_MINUTES", "15"))

    MAX_REQUEST_SIZE_BYTES: int = int(os.getenv("MAX_REQUEST_SIZE_BYTES", str(2 * 1024 * 1024)))
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(10 * 1024 * 1024)))

    # Section 13: Email automation must be SAFE. Default: EMAIL_AUTOMATION_ENABLED=false
    EMAIL_AUTOMATION_ENABLED: bool = (
        os.getenv("EMAIL_AUTOMATION_ENABLED", "false").strip().lower() == "true"
    )
    SMTP_FROM: str = os.getenv("SMTP_FROM", "shamaabidiphd@gmail.com")
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")


settings = Settings()

