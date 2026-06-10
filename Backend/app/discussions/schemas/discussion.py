"""Discussion-related schemas."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


def format_relative_time(dt: Optional[datetime]) -> str:
    """Convert datetime to relative time string (e.g., '5m ago')."""
    if dt is None:
        return "Unknown"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = (datetime.now(timezone.utc) - dt).total_seconds()
    if diff < 60:
        return "Just now"
    if diff < 3600:
        return f"{int(diff // 60)}m ago"
    if diff < 86400:
        return f"{int(diff // 3600)}h ago"
    if diff < 604800:
        return f"{int(diff // 86400)}d ago"
    return dt.strftime("%b %d, %Y")


# =====================================================================
# Request Schemas
# =====================================================================


class DiscussionCreate(BaseModel):
    """Create a new discussion post."""
    content: str = Field(..., min_length=1, max_length=600)
    tag: Optional[str] = Field(
        None, pattern="^(question|approach|walkthrough|bug)$"
    )
    is_spoiler: bool = False


class DiscussionUpdate(BaseModel):
    """Update a discussion post (content only, within 15 min)."""
    content: str = Field(..., min_length=1, max_length=600)


class ReplyCreate(BaseModel):
    """Create a reply to a discussion post."""
    content: str = Field(..., min_length=1, max_length=300)


class ReactionCreate(BaseModel):
    """Add a reaction emoji to a reply."""
    emoji: str = Field(..., pattern="^(👍|💡|🤔|😂)$")


# =====================================================================
# Response Schemas
# =====================================================================


class ReplyOut(BaseModel):
    """Response schema for a discussion reply."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    author: str
    content: str
    upvotes: int  # from upvote_count
    isUpvoted: bool = False  # computed: did current user upvote?
    isAccepted: bool
    reactions: dict = Field(default_factory=dict)  # { "👍": 3, "💡": 1 }
    myReactions: list = Field(default_factory=list)  # ["👍"] — current user's reacts
    createdAt: datetime

    @staticmethod
    def from_model(reply, current_user_id: Optional[int] = None):
        """Manually construct ReplyOut from model + computed fields."""
        is_upvoted = False
        if current_user_id:
            is_upvoted = any(u.user_id == current_user_id for u in reply.upvotes)

        # Aggregate reaction counts: { emoji: count }
        reaction_map = {}
        my_reactions = []
        for reaction in reply.reactions:
            reaction_map[reaction.emoji] = reaction_map.get(reaction.emoji, 0) + 1
            if current_user_id and reaction.user_id == current_user_id:
                my_reactions.append(reaction.emoji)

        return ReplyOut(
            id=reply.id,
            author=reply.author.username,
            content=reply.content,
            upvotes=reply.upvote_count,
            isUpvoted=is_upvoted,
            isAccepted=reply.is_accepted,
            reactions=reaction_map,
            myReactions=my_reactions,
            createdAt=reply.created_at,
        )


class DiscussionOut(BaseModel):
    """Response schema for a full discussion post with replies."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    author: str
    content: str
    tag: Optional[str]
    isSpoiler: bool
    isPinned: bool
    isEdited: bool
    upvotes: int  # from upvote_count
    isUpvoted: bool = False  # computed
    replies: List[ReplyOut] = Field(default_factory=list)
    createdAt: datetime

    @staticmethod
    def from_model(post, current_user_id: Optional[int] = None):
        """Manually construct DiscussionOut from model + computed fields."""
        is_upvoted = False
        if current_user_id:
            is_upvoted = any(u.user_id == current_user_id for u in post.upvotes)

        # Map replies, excluding soft-deleted ones
        replies = [
            ReplyOut.from_model(r, current_user_id)
            for r in post.replies
            if r.deleted_at is None
        ]

        return DiscussionOut(
            id=post.id,
            author=post.author.username,
            content=post.content,
            tag=post.tag,
            isSpoiler=post.is_spoiler,
            isPinned=post.is_pinned,
            isEdited=post.is_edited,
            upvotes=post.upvote_count,
            isUpvoted=is_upvoted,
            replies=replies,
            createdAt=post.created_at,
        )


class DiscussionListOut(BaseModel):
    """Response for listing discussions."""
    posts: List[DiscussionOut]


class OnlineCountOut(BaseModel):
    """Response for online viewer count."""
    count: int
