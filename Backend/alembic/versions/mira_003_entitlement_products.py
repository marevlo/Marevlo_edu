"""entitlements: allow MIRA products

MIRA is paid separately from courses, so the entitlement product vocabulary
gains 'mira_plus' and 'mira_pro'. This widens the ck_entitlements_product CHECK
constraint. Uses batch mode so it works on both Postgres (ALTER) and SQLite
(table rebuild).

Revision ID: mira_003_entitlement_products
Revises: mira_002_feature_tables
Create Date: 2026-06-06
"""
from __future__ import annotations

from alembic import op

revision = "mira_003_entitlement_products"
down_revision = "mira_002_feature_tables"
branch_labels = None
depends_on = None

_OLD = "product IN ('all_access','dsa','courses')"
_NEW = "product IN ('all_access','dsa','courses','mira_plus','mira_pro')"


def upgrade() -> None:
    with op.batch_alter_table("entitlements") as batch_op:
        batch_op.drop_constraint("ck_entitlements_product", type_="check")
        batch_op.create_check_constraint("ck_entitlements_product", _NEW)


def downgrade() -> None:
    with op.batch_alter_table("entitlements") as batch_op:
        batch_op.drop_constraint("ck_entitlements_product", type_="check")
        batch_op.create_check_constraint("ck_entitlements_product", _OLD)
