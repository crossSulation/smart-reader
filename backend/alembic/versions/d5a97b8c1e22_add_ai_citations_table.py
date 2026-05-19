"""Add ai_citations table

Revision ID: d5a97b8c1e22
Revises: c4b83e6a2f15
Create Date: 2026-05-15 00:03:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5a97b8c1e22"
down_revision: Union[str, None] = "c4b83e6a2f15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_citations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("interaction_id", sa.Integer(), nullable=False),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("chunk_id", sa.Integer(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["interaction_id"], ["ai_interactions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chunk_id"], ["document_chunks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_ai_citations_id"), "ai_citations", ["id"], unique=False)
    op.create_index(op.f("ix_ai_citations_interaction_id"), "ai_citations", ["interaction_id"], unique=False)
    op.create_index(op.f("ix_ai_citations_book_id"), "ai_citations", ["book_id"], unique=False)
    op.create_index(op.f("ix_ai_citations_chunk_id"), "ai_citations", ["chunk_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_citations_chunk_id"), table_name="ai_citations")
    op.drop_index(op.f("ix_ai_citations_book_id"), table_name="ai_citations")
    op.drop_index(op.f("ix_ai_citations_interaction_id"), table_name="ai_citations")
    op.drop_index(op.f("ix_ai_citations_id"), table_name="ai_citations")
    op.drop_table("ai_citations")
