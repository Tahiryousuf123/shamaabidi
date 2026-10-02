"""
Shama Abidi PhD System — Production Configuration (`backend/app/config.py`)
Loads and validates environment variables with safe defaults and strict security settings.
"""

import hashlib
import os
from pathlib import Path
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


def _resolve_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL", "").strip()
    default_sqlite = f"sqlite:///{(DATA_DIR / 'shama_production_orm.db').as_posix()}"
    if not raw_url:
        return default_sqlite
    # If .env has the docker-compose internal hostname `@postgres:5432` while running on host OS, use local ORM DB
    if "@postgres:" in raw_url or "asyncpg" in raw_url:
        return default_sqlite
    return raw_url


class Settings:
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").lower()
    DATABASE_URL: str = _resolve_database_url()

    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        hashlib.sha256(b"shama-abidi-phd-system-secret-key-v5").hexdigest(),
    )
    JWT_SECRET: str = os.getenv(
        "JWT_SECRET",
        hashlib.sha256(b"shama-abidi-phd-system-jwt-secret-v5").hexdigest(),
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    CORS_ALLOWED_ORIGINS: List[str] = [
        o.strip()
        for o in os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "https://shamaabidiphd.sbs,https://www.shamaabidiphd.sbs,https://tahiryousuf123.github.io,https://aspnetaptech-cyber.github.io,http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000",
        ).split(",")
        if o.strip()
    ]

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
