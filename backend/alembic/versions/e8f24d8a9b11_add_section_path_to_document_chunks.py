"""Add section_path to document_chunks

Revision ID: e8f24d8a9b11
Revises: d5a97b8c1e22
Create Date: 2026-05-18 10:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8f24d8a9b11"
down_revision: Union[str, None] = "d5a97b8c1e22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("document_chunks") as batch_op:
        batch_op.add_column(sa.Column("section_path", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("document_chunks") as batch_op:
        batch_op.drop_column("section_path")
