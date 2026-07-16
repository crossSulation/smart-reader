"""add feedback column to ai_interactions

Revision ID: c7d8e9f0a1b2
Revises: b5c6d7e8f9a0
Create Date: 2026-07-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = 'b5c6d7e8f9a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ai_interactions', sa.Column('feedback', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('ai_interactions', 'feedback')
