"""
Shama Abidi PhD System — SQLAlchemy 2.0 Engine & Connection Pooling (`backend/app/db_session.py`)
Supports PostgreSQL (`postgresql+psycopg://...`) in production with connection pooling (`pool_pre_ping=True`)
and SQLite for local development/CI testing.
"""

from typing import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from backend.app.config import DATA_DIR, STORAGE_DIR, BACKUP_DIR, settings
from backend.app.models import Base


DATA_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

is_sqlite = settings.DATABASE_URL.startswith("sqlite")
engine_kwargs = {"pool_pre_ping": True}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_recycle"] = 1800

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

if is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_orm_schema() -> None:
    """Creates tables if not already migrated via Alembic."""
    Base.metadata.create_all(bind=engine)
