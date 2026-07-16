"""add fsrs_params to users and agent_memories table

Revision ID: d9e0f1a2b3c4
Revises: c7d8e9f0a1b2
Create Date: 2026-07-04 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9e0f1a2b3c4'
down_revision: Union[str, None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('fsrs_params', sa.Text(), nullable=True))
    op.create_table(
        'agent_memories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('book_id', sa.Integer(), sa.ForeignKey('books.id'), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('key_topics', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_memories_user_id'), 'agent_memories', ['user_id'])
    op.create_index(op.f('ix_agent_memories_book_id'), 'agent_memories', ['book_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_agent_memories_book_id'), 'agent_memories')
    op.drop_index(op.f('ix_agent_memories_user_id'), 'agent_memories')
    op.drop_table('agent_memories')
    op.drop_column('users', 'fsrs_params')
