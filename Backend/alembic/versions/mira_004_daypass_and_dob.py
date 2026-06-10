"""day-pass product + user DOB / guardian-consent columns

- Widens ck_entitlements_product to allow 'mira_day' (the ₹99 day-pass).
- Adds date_of_birth, guardian_email, guardian_consent_at to users for DPDP
  minor handling.

Revision ID: mira_004_daypass_and_dob
Revises: mira_003_entitlement_products
Create Date: 2026-06-07
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "mira_004_daypass_and_dob"
down_revision = "mira_003_entitlement_products"
branch_labels = None
depends_on = None

_OLD = "product IN ('all_access','dsa','courses','mira_plus','mira_pro')"
_NEW = "product IN ('all_access','dsa','courses','mira_plus','mira_pro','mira_day')"


def upgrade() -> None:
    with op.batch_alter_table("entitlements") as batch_op:
        batch_op.drop_constraint("ck_entitlements_product", type_="check")
        batch_op.create_check_constraint("ck_entitlements_product", _NEW)

    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("guardian_email", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("guardian_consent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "guardian_consent_at")
    op.drop_column("users", "guardian_email")
    op.drop_column("users", "date_of_birth")

    with op.batch_alter_table("entitlements") as batch_op:
        batch_op.drop_constraint("ck_entitlements_product", type_="check")
        batch_op.create_check_constraint("ck_entitlements_product", _OLD)
