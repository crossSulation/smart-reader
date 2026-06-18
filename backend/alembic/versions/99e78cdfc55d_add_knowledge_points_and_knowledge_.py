"""add knowledge_points and knowledge_links tables

Revision ID: 99e78cdfc55d
Revises: 9e9d04141607
Create Date: 2026-06-17 18:02:26.264176

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '99e78cdfc55d'
down_revision: Union[str, None] = '9e9d04141607'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('knowledge_points',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(), nullable=False),
    sa.Column('aliases', sa.Text(), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('source_chunk_ids', sa.Text(), nullable=True),
    sa.Column('entity_type', sa.String(), nullable=False, server_default='concept'),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_knowledge_points_id'), 'knowledge_points', ['id'], unique=False)
    op.create_index(op.f('ix_knowledge_points_user_id'), 'knowledge_points', ['user_id'], unique=False)
    op.create_table('knowledge_links',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('source_kp_id', sa.Integer(), nullable=False),
    sa.Column('target_kp_id', sa.Integer(), nullable=False),
    sa.Column('relation_type', sa.String(), nullable=False, server_default='related_to'),
    sa.Column('weight', sa.Float(), nullable=False, server_default='1.0'),
    sa.Column('evidence_chunk_ids', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['source_kp_id'], ['knowledge_points.id'], ),
    sa.ForeignKeyConstraint(['target_kp_id'], ['knowledge_points.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_knowledge_links_id'), 'knowledge_links', ['id'], unique=False)
    op.create_index(op.f('ix_knowledge_links_source_kp_id'), 'knowledge_links', ['source_kp_id'], unique=False)
    op.create_index(op.f('ix_knowledge_links_target_kp_id'), 'knowledge_links', ['target_kp_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_knowledge_links_target_kp_id'), table_name='knowledge_links')
    op.drop_index(op.f('ix_knowledge_links_source_kp_id'), table_name='knowledge_links')
    op.drop_index(op.f('ix_knowledge_links_id'), table_name='knowledge_links')
    op.drop_table('knowledge_links')
    op.drop_index(op.f('ix_knowledge_points_user_id'), table_name='knowledge_points')
    op.drop_index(op.f('ix_knowledge_points_id'), table_name='knowledge_points')
    op.drop_table('knowledge_points')
