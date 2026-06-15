"""reels — software-engineering section topics

Revision ID: reels_v2_0004
Revises: reels_v2_0003

Idempotent: inserts only slugs not already present.
"""
from alembic import op
import sqlalchemy as sa

revision = "reels_v2_0004"
down_revision = "reels_v2_0003"
branch_labels = None
depends_on = None

TOPICS = [
    ('frontend', 'Frontend', 'topic', None),
    ('backend', 'Backend', 'topic', None),
    ('cybersecurity', 'Cybersecurity', 'topic', None),
    ('networking', 'Networking', 'topic', None),
    ('docker-containers', 'Docker & containers', 'topic', None),
    ('kubernetes', 'Kubernetes', 'topic', None),
    ('cloud-computing', 'Cloud computing', 'topic', None),
    ('devops-cicd', 'DevOps & CI/CD', 'topic', None),
    ('git-version-control', 'Git & version control', 'topic', None),
    ('linux-shell', 'Linux & shell', 'topic', None),
    ('apis-microservices', 'APIs & microservices', 'topic', None),
    ('testing-qa', 'Testing & QA', 'topic', None),
    ('mobile-development', 'Mobile development', 'topic', None),
]


def upgrade() -> None:
    conn = op.get_bind()
    existing = {r[0] for r in conn.execute(sa.text("SELECT slug FROM reel_topics"))}
    base = conn.execute(sa.text("SELECT COALESCE(MAX(sort_order), 0) FROM reel_topics")).scalar() or 0
    t = sa.table("reel_topics",
        sa.column("slug", sa.String), sa.column("name", sa.String),
        sa.column("kind", sa.String), sa.column("parent_slug", sa.String),
        sa.column("sort_order", sa.Integer), sa.column("is_active", sa.Boolean))
    new = [{"slug": s, "name": n, "kind": k, "parent_slug": p,
            "sort_order": base + i + 1, "is_active": True}
           for i, (s, n, k, p) in enumerate(TOPICS) if s not in existing]
    if new:
        op.bulk_insert(t, new)


def downgrade() -> None:
    pass  # additive seed
