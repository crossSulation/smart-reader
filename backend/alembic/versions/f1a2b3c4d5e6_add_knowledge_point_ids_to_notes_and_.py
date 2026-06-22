"""add knowledge_point_ids to notes and flashcards

Revision ID: f1a2b3c4d5e6
Revises: 99e78cdfc55d
Create Date: 2026-06-22 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = '99e78cdfc55d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notes', sa.Column('knowledge_point_ids', sa.Text(), nullable=True))
    op.add_column('flashcards', sa.Column('knowledge_point_ids', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('flashcards', 'knowledge_point_ids')
    op.drop_column('notes', 'knowledge_point_ids')
