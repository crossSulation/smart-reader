"""add token_usage_logs and user credits

Revision ID: a3b4c5d6e7f8
Revises: f1a2b3c4d5e6
Create Date: 2026-07-03 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add credits columns to users table
    op.add_column('users', sa.Column(
        'credits', sa.DECIMAL(precision=12, scale=4),
        nullable=False, server_default='0'
    ))
    op.add_column('users', sa.Column(
        'monthly_credits_reset_at', sa.DateTime(timezone=True),
        nullable=True
    ))

    # Create token_usage_logs table
    op.create_table(
        'token_usage_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('interaction_id', sa.Integer(), sa.ForeignKey('ai_interactions.id'), nullable=True),
        sa.Column('capability', sa.String(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('prompt_tokens', sa.Integer(), server_default='0'),
        sa.Column('completion_tokens', sa.Integer(), server_default='0'),
        sa.Column('total_tokens', sa.Integer(), server_default='0'),
        sa.Column('credit_cost', sa.DECIMAL(precision=10, scale=4), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_token_usage_logs_user_id'), 'token_usage_logs', ['user_id'])
    op.create_index(op.f('ix_token_usage_logs_interaction_id'), 'token_usage_logs', ['interaction_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_token_usage_logs_interaction_id'), 'token_usage_logs')
    op.drop_index(op.f('ix_token_usage_logs_user_id'), 'token_usage_logs')
    op.drop_table('token_usage_logs')
    op.drop_column('users', 'monthly_credits_reset_at')
    op.drop_column('users', 'credits')
