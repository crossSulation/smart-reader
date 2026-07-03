"""add credit_transactions and credit_packs tables

Revision ID: b5c6d7e8f9a0
Revises: a3b4c5d6e7f8
Create Date: 2026-07-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b5c6d7e8f9a0'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'credit_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('amount', sa.DECIMAL(precision=12, scale=4), nullable=False),
        sa.Column('balance_after', sa.DECIMAL(precision=12, scale=4), nullable=False),
        sa.Column('reference_type', sa.String(), nullable=True),
        sa.Column('reference_id', sa.Integer(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_credit_transactions_user_id'), 'credit_transactions', ['user_id'])

    op.create_table(
        'credit_packs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('credits', sa.Integer(), nullable=False),
        sa.Column('price_cents', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Integer(), server_default='1'),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_credit_packs_id'), 'credit_packs', ['id'])

    # Seed default credit packs
    op.execute(
        "INSERT INTO credit_packs (name, credits, price_cents, is_active, sort_order) VALUES "
        "('10K Pack', 10000, 0, 1, 1),"
        "('50K Pack', 50000, 0, 1, 2),"
        "('100K Pack', 100000, 0, 1, 3)"
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_credit_packs_id'), 'credit_packs')
    op.drop_table('credit_packs')
    op.drop_index(op.f('ix_credit_transactions_user_id'), 'credit_transactions')
    op.drop_table('credit_transactions')
