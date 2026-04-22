"""Add embedding columns to document_chunks

Revision ID: b3a92d5f1e04
Revises: a2f81c3e7d19
Create Date: 2026-04-20 00:01:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3a92d5f1e04'
down_revision: Union[str, None] = 'a2f81c3e7d19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('document_chunks') as batch_op:
        batch_op.add_column(sa.Column('embedding', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('embedding_model', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('document_chunks') as batch_op:
        batch_op.drop_column('embedding_model')
        batch_op.drop_column('embedding')
