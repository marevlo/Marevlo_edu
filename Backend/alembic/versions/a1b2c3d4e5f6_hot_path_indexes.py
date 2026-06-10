"""hot path indexes

Adds composite indexes for the hottest read paths:
- login / suspicious-login checks on user_sessions and activity_logs
- feed listing on posts
- moderation queues on post_reports and comment_reports
- discussions, courses, problems, submissions time-range queries

Revision ID: a1b2c3d4e5f6
Revises: bug_reports_002_updated_at_idx
Create Date: 2026-05-23
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "bug_reports_002_updated_at_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Auth & activity (login, suspicious login, audit trail)
    op.create_index(
        "idx_user_sessions_user_logout_login",
        "user_sessions",
        ["user_id", "logout_time", "login_time"],
    )
    op.create_index(
        "idx_activity_logs_user_action_created",
        "activity_logs",
        ["user_id", "action", "created_at"],
    )
    
    # Feed & posts
    op.create_index(
        "idx_posts_deleted_created",
        "posts",
        ["deleted_at", "created_at"],
    )
    op.create_index(
        "idx_posts_deleted_like",
        "posts",
        ["deleted_at", "like_count"],
    )
    
    # Moderation reports
    op.create_index(
        "idx_post_reports_status_created",
        "post_reports",
        ["status", "created_at"],
    )
    op.create_index(
        "idx_comment_reports_status_created",
        "comment_reports",
        ["status", "created_at"],
    )
    
    # Discussions (posts & replies)
    op.create_index(
        "idx_disc_posts_problem_created",
        "discussion_posts",
        ["problem_id", "created_at"],
    )
    op.create_index(
        "idx_disc_posts_deleted_created",
        "discussion_posts",
        ["deleted_at", "created_at"],
    )
    op.create_index(
        "idx_disc_posts_pinned_upvote",
        "discussion_posts",
        ["is_pinned", "upvote_count"],
    )
    op.create_index(
        "idx_disc_replies_post_created",
        "discussion_replies",
        ["post_id", "created_at"],
    )
    op.create_index(
        "idx_disc_replies_accepted_upvote",
        "discussion_replies",
        ["is_accepted", "upvote_count"],
    )
    
    # Courses
    op.create_index(
        "idx_course_comments_course_created",
        "course_comments",
        ["course_id", "created_at"],
    )
    op.create_index(
        "idx_course_reactions_user_id",
        "course_reactions",
        ["user_id"],
    )
    
    # Problems
    op.create_index(
        "idx_problems_created_at",
        "problems",
        ["created_at"],
    )
    op.create_index(
        "idx_problems_slug",
        "problems",
        ["slug"],
    )
    
    # Submissions
    op.create_index(
        "idx_submissions_submitted_at",
        "problem_submissions",
        ["submitted_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_submissions_submitted_at", table_name="problem_submissions")
    op.drop_index("idx_problems_slug", table_name="problems")
    op.drop_index("idx_problems_created_at", table_name="problems")
    op.drop_index("idx_course_reactions_user_id", table_name="course_reactions")
    op.drop_index("idx_course_comments_course_created", table_name="course_comments")
    op.drop_index("idx_disc_replies_accepted_upvote", table_name="discussion_replies")
    op.drop_index("idx_disc_replies_post_created", table_name="discussion_replies")
    op.drop_index("idx_disc_posts_pinned_upvote", table_name="discussion_posts")
    op.drop_index("idx_disc_posts_deleted_created", table_name="discussion_posts")
    op.drop_index("idx_disc_posts_problem_created", table_name="discussion_posts")
    op.drop_index("idx_comment_reports_status_created", table_name="comment_reports")
    op.drop_index("idx_post_reports_status_created", table_name="post_reports")
    op.drop_index("idx_posts_deleted_like", table_name="posts")
    op.drop_index("idx_posts_deleted_created", table_name="posts")
    op.drop_index("idx_activity_logs_user_action_created", table_name="activity_logs")
    op.drop_index("idx_user_sessions_user_logout_login", table_name="user_sessions")
