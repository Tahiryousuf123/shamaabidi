"""Initial 26-table production schema for Shama Abidi PhD System

Revision ID: 0001_initial_production_schema
Revises: None
Create Date: 2026-09-30 06:35:00
"""

from typing import Sequence, Union
from alembic import op
from backend.app.models import Base

revision: str = "0001_initial_production_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
