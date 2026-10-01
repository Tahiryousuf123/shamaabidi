"""Add phd_opportunities table for Global Funded PhD Opportunity Search

Revision ID: 0002_add_phd_opportunities
Revises: 0001_initial_production_schema
Create Date: 2026-10-01 07:35:00
"""
from typing import Sequence, Union
from alembic import op
from backend.app.models import Base

revision: str = "0002_add_phd_opportunities"
down_revision: Union[str, None] = "0001_initial_production_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    pass
