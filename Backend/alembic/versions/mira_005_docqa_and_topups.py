"""document Q&A tables + question top-ups + annual MIRA SKUs

- Creates mira_documents / mira_doc_chunks (PDF & course-lesson retrieval
  substrate; embeddings as JSON @1536-dim, pgvector is the later scale path).
- Creates mira_question_topups ("+250 questions" SKU; window-scoped, unique
  payment ref so PayU retries can't double-grant).
- Widens ck_entitlements_product to allow 'mira_plus_year' / 'mira_pro_year'
  (annual plans, fulfilled by billing catalog).

Revision ID: mira_005_docqa_and_topups
Revises: mira_004_daypass_and_dob
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "mira_005_docqa_and_topups"
down_revision = "mira_004_daypass_and_dob"
branch_labels = None
depends_on = None

_OLD = "product IN ('all_access','dsa','courses','mira_plus','mira_pro','mira_day')"
_NEW = ("product IN ('all_access','dsa','courses','mira_plus','mira_pro',"
        "'mira_day','mira_plus_year','mira_pro_year')")


def _json_type():
    # JSONB on Postgres, JSON-as-text elsewhere — mirrors app.core.sqltypes.JSONBType
    return sa.JSON().with_variant(sa.dialects.postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    with op.batch_alter_table("entitlements") as batch_op:
        batch_op.drop_constraint("ck_entitlements_product", type_="check")
        batch_op.create_check_constraint("ck_entitlements_product", _NEW)

    op.create_table(
        "mira_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scope", sa.String(length=16), nullable=False,
                  server_default="user"),
        sa.Column("owner_key", sa.String(length=64), nullable=False),
        sa.Column("lesson_id", sa.String(length=64), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False,
                  server_default=""),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False,
                  server_default="ready"),
        sa.Column("n_pages", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("n_chunks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embedder", sa.String(length=32), nullable=False,
                  server_default="local"),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.UniqueConstraint("scope", "owner_key", "content_hash",
                            name="uq_mira_doc_owner_hash"),
    )
    op.create_index("ix_mira_documents_owner", "mira_documents",
                    ["scope", "owner_key"])

    op.create_table(
        "mira_doc_chunks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("document_id", sa.Integer(),
                  sa.ForeignKey("mira_documents.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("page_end", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", _json_type(), nullable=False),
    )
    op.create_index("ix_mira_doc_chunks_doc", "mira_doc_chunks", ["document_id"])

    op.create_table(
        "mira_question_topups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("window_key", sa.String(length=128), nullable=False),
        sa.Column("questions", sa.Integer(), nullable=False),
        sa.Column("tokens", sa.Integer(), nullable=False),
        sa.Column("ref", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.UniqueConstraint("ref", name="uq_mira_qtopup_ref"),
    )
    op.create_index("ix_mira_qtopup_user_window", "mira_question_topups",
                    ["user_id", "window_key"])


def downgrade() -> None:
    op.drop_index("ix_mira_qtopup_user_window", table_name="mira_question_topups")
    op.drop_table("mira_question_topups")
    op.drop_index("ix_mira_doc_chunks_doc", table_name="mira_doc_chunks")
    op.drop_table("mira_doc_chunks")
    op.drop_index("ix_mira_documents_owner", table_name="mira_documents")
    op.drop_table("mira_documents")
    with op.batch_alter_table("entitlements") as batch_op:
        batch_op.drop_constraint("ck_entitlements_product", type_="check")
        batch_op.create_check_constraint("ck_entitlements_product", _OLD)
