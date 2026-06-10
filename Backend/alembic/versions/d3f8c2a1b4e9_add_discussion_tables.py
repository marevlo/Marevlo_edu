"""Add discussion tables

Revision ID: d3f8c2a1b4e9
Revises: b02eae1558dc
Create Date: 2026-05-16 10:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3f8c2a1b4e9'
down_revision: Union[str, None] = 'b02eae1558dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create discussion_posts table
    op.create_table(
        'discussion_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('problem_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tag', sa.String(length=20), nullable=True),
        sa.Column('is_spoiler', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_edited', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('upvote_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['problem_id'], ['problems.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_disc_posts_problem_id', 'discussion_posts', ['problem_id'], unique=False)
    op.create_index('idx_disc_posts_user_id', 'discussion_posts', ['user_id'], unique=False)
    op.create_index('idx_disc_posts_created_at', 'discussion_posts', ['created_at'], unique=False)
    op.create_index('idx_disc_posts_deleted', 'discussion_posts', ['deleted_at'], unique=False)

    # Create discussion_post_upvotes table
    op.create_table(
        'discussion_post_upvotes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['post_id'], ['discussion_posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('post_id', 'user_id', name='uq_disc_post_upvote')
    )
    op.create_index('idx_disc_post_upvotes_post_id', 'discussion_post_upvotes', ['post_id'], unique=False)
    op.create_index('idx_disc_post_upvotes_user_id', 'discussion_post_upvotes', ['user_id'], unique=False)

    # Create discussion_replies table
    op.create_table(
        'discussion_replies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_accepted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('upvote_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['post_id'], ['discussion_posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_disc_replies_post_id', 'discussion_replies', ['post_id'], unique=False)
    op.create_index('idx_disc_replies_user_id', 'discussion_replies', ['user_id'], unique=False)
    op.create_index('idx_disc_replies_created_at', 'discussion_replies', ['created_at'], unique=False)
    op.create_index('idx_disc_replies_deleted', 'discussion_replies', ['deleted_at'], unique=False)

    # Create discussion_reply_upvotes table
    op.create_table(
        'discussion_reply_upvotes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reply_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['reply_id'], ['discussion_replies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reply_id', 'user_id', name='uq_disc_reply_upvote')
    )
    op.create_index('idx_disc_reply_upvotes_reply_id', 'discussion_reply_upvotes', ['reply_id'], unique=False)
    op.create_index('idx_disc_reply_upvotes_user_id', 'discussion_reply_upvotes', ['user_id'], unique=False)

    # Create discussion_reply_reactions table
    op.create_table(
        'discussion_reply_reactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('reply_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('emoji', sa.String(length=10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['reply_id'], ['discussion_replies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reply_id', 'user_id', 'emoji', name='uq_disc_reply_reaction')
    )
    op.create_index('idx_disc_reactions_reply_id', 'discussion_reply_reactions', ['reply_id'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_disc_reactions_reply_id', table_name='discussion_reply_reactions')
    op.drop_table('discussion_reply_reactions')
    op.drop_index('idx_disc_reply_upvotes_user_id', table_name='discussion_reply_upvotes')
    op.drop_index('idx_disc_reply_upvotes_reply_id', table_name='discussion_reply_upvotes')
    op.drop_table('discussion_reply_upvotes')
    op.drop_index('idx_disc_replies_deleted', table_name='discussion_replies')
    op.drop_index('idx_disc_replies_created_at', table_name='discussion_replies')
    op.drop_index('idx_disc_replies_user_id', table_name='discussion_replies')
    op.drop_index('idx_disc_replies_post_id', table_name='discussion_replies')
    op.drop_table('discussion_replies')
    op.drop_index('idx_disc_post_upvotes_user_id', table_name='discussion_post_upvotes')
    op.drop_index('idx_disc_post_upvotes_post_id', table_name='discussion_post_upvotes')
    op.drop_table('discussion_post_upvotes')
    op.drop_index('idx_disc_posts_deleted', table_name='discussion_posts')
    op.drop_index('idx_disc_posts_created_at', table_name='discussion_posts')
    op.drop_index('idx_disc_posts_user_id', table_name='discussion_posts')
    op.drop_index('idx_disc_posts_problem_id', table_name='discussion_posts')
    op.drop_table('discussion_posts')
