"""grading_engine_updates

Revision ID: 6395c5c5c4d7
Revises: profile_003_student_fields
Create Date: 2026-05-15 12:04:17.243642

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6395c5c5c4d7'
down_revision: Union[str, None] = 'profile_003_student_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('problems', sa.Column('time_limit_s', sa.Float(), nullable=True, server_default='2.0'))
    op.add_column('problems', sa.Column('memory_limit_mb', sa.Integer(), nullable=True, server_default='256'))
    op.add_column('problem_submissions', sa.Column('total_test_cases', sa.Integer(), nullable=True))
    op.execute("UPDATE problem_submissions SET status = 'wrong_answer' WHERE status = 'rejected'")


def downgrade() -> None:
    op.drop_column('problem_submissions', 'total_test_cases')
    op.drop_column('problems', 'memory_limit_mb')
    op.drop_column('problems', 'time_limit_s')
