"""add_shared_book_fields

Revision ID: fb2c094d5c79
Revises: d9e0f1a2b3c4
Create Date: 2026-08-01 15:23:54.996878

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'fb2c094d5c79'
down_revision: Union[str, None] = 'd9e0f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.add_column(sa.Column("shared_by", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("original_book_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_books_original",
            "books",
            ["original_book_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_constraint("fk_books_original", type_="foreignkey")
        batch_op.drop_column("original_book_id")
        batch_op.drop_column("shared_by")
