"""Add ai_interactions table

Revision ID: c4b83e6a2f15
Revises: b3a92d5f1e04
Create Date: 2026-04-20 00:02:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4b83e6a2f15'
down_revision: Union[str, None] = 'b3a92d5f1e04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_interactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('book_id', sa.Integer(), nullable=False),
        sa.Column('interaction_type', sa.String(), nullable=False),
        sa.Column('query', sa.Text(), nullable=True),
        sa.Column('response', sa.Text(), nullable=False),
        sa.Column('provider', sa.String(), nullable=True),
        sa.Column('chunks_used', sa.Integer(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('(CURRENT_TIMESTAMP)'),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ai_interactions_id'), 'ai_interactions', ['id'], unique=False)
    op.create_index(op.f('ix_ai_interactions_user_id'), 'ai_interactions', ['user_id'], unique=False)
    op.create_index(op.f('ix_ai_interactions_book_id'), 'ai_interactions', ['book_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_ai_interactions_book_id'), table_name='ai_interactions')
    op.drop_index(op.f('ix_ai_interactions_user_id'), table_name='ai_interactions')
    op.drop_index(op.f('ix_ai_interactions_id'), table_name='ai_interactions')
    op.drop_table('ai_interactions')
