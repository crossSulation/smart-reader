"""sync weekly trend point schema

Revision ID: 9e9d04141607
Revises: e7e8dfc85356
Create Date: 2026-06-02 16:23:26.894909

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '9e9d04141607'
down_revision: Union[str, None] = 'e7e8dfc85356'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # WeeklyTrendPoint is a response schema model only; no DB table/column changes required.
    pass


def downgrade() -> None:
    pass
