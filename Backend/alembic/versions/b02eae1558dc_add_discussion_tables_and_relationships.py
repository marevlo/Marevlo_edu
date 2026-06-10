"""Remove stale destructive autogenerate operations

Revision ID: b02eae1558dc
Revises: 6395c5c5c4d7
Create Date: 2026-05-16 10:39:46.990810

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = 'b02eae1558dc'
down_revision: Union[str, None] = '6395c5c5c4d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
