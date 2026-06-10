"""Discussion HTTP endpoints."""
from __future__ import annotations

from typing import Optional, Union

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db, get_optional_user
from app.core.exceptions import Forbidden
from app.discussions.schemas.discussion import (
    DiscussionCreate,
    DiscussionListOut,
    DiscussionOut,
    DiscussionUpdate,
    OnlineCountOut,
    ReactionCreate,
    ReplyCreate,
)
from app.discussions.services.discussion_service import discussion_service

router = APIRouter(
    prefix="/problems/{problem_id}/discussions", tags=["discussions"]
)


# Helper to parse problem_id (can be int or slug string)
def parse_problem_id(problem_id: str) -> Union[int, str]:
    """Try to parse as int, otherwise treat as slug."""
    try:
        return int(problem_id)
    except ValueError:
        return problem_id


# =====================================================================
# GET Endpoints (Discussion Posts)
# =====================================================================


@router.get(
    "",
    response_model=DiscussionListOut,
)
def list_discussions(
    problem_id: str = Path(...),
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    List all discussion posts for a problem.

    Accepts both numeric problem ID and problem slug.
    Unauthenticated users can read; auth state determines computed fields
    (is_upvoted, my_reactions).
    """
    problem_id = parse_problem_id(problem_id)
    posts = discussion_service.list_discussions(
        db, problem_id, current_user_id=user.id if user else None
    )

    # Convert models to response schemas
    post_responses = [
        DiscussionOut.from_model(post, current_user_id=user.id if user else None)
        for post in posts
    ]

    return DiscussionListOut(posts=post_responses)


# =====================================================================
# POST Endpoints (Create)
# =====================================================================


@router.post(
    "",
    response_model=DiscussionOut,
    status_code=201,
)
def create_discussion(
    problem_id: str = Path(...),
    data: DiscussionCreate = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new discussion post (authenticated users only)."""
    problem_id = parse_problem_id(problem_id)
    post = discussion_service.create_discussion(
        db,
        problem_id=problem_id,
        user_id=user.id,
        content=data.content,
        tag=data.tag,
        is_spoiler=data.is_spoiler,
    )
    return DiscussionOut.from_model(post, current_user_id=user.id)


# =====================================================================
# PATCH Endpoints (Update)
# =====================================================================


@router.patch(
    "/{post_id}",
    response_model=DiscussionOut,
)
def update_discussion(
    problem_id: str = Path(...),
    post_id: int = Path(..., gt=0),
    data: DiscussionUpdate = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update a discussion post (owner only, within 15 min).

    Only the author can edit their own posts within 15 minutes of creation.
    """
    post = discussion_service.update_discussion(
        db, post_id=post_id, user_id=user.id, content=data.content
    )
    return DiscussionOut.from_model(post, current_user_id=user.id)


# =====================================================================
# DELETE Endpoints
# =====================================================================


@router.delete(
    "/{post_id}",
    status_code=204,
)
def delete_discussion(
    problem_id: str = Path(...),
    post_id: int = Path(..., gt=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete a discussion post (owner only)."""
    discussion_service.delete_discussion(
        db, post_id=post_id, user_id=user.id
    )


# =====================================================================
# Upvote Endpoints
# =====================================================================


@router.post(
    "/{post_id}/upvote",
    status_code=200,
)
def toggle_upvote_post(
    problem_id: str = Path(...),
    post_id: int = Path(..., gt=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Toggle upvote on a discussion post (idempotent).

    Returns { "is_upvoted": bool }
    """
    is_upvoted = discussion_service.toggle_upvote_post(
        db, post_id=post_id, user_id=user.id
    )
    return {"is_upvoted": is_upvoted}


# =====================================================================
# Reply Endpoints
# =====================================================================


@router.post(
    "/{post_id}/replies",
    response_model=dict,
    status_code=201,
)
def create_reply(
    problem_id: str = Path(...),
    post_id: int = Path(..., gt=0),
    data: ReplyCreate = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Add a reply to a discussion post.

    Returns the newly created reply as ReplyOut.
    """
    from app.discussions.schemas.discussion import ReplyOut

    reply = discussion_service.create_reply(
        db, post_id=post_id, user_id=user.id, content=data.content
    )
    # Service already loaded relationships, just convert to response schema
    return ReplyOut.from_model(reply, current_user_id=user.id).model_dump()


@router.delete(
    "/{post_id}/replies/{reply_id}",
    status_code=204,
)
def delete_reply(
    problem_id: str = Path(...),
    post_id: int = Path(..., gt=0),
    reply_id: int = Path(..., gt=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete a reply (owner only)."""
    discussion_service.delete_reply(db, reply_id=reply_id, user_id=user.id)


# =====================================================================
# Reply Upvote Endpoints
# =====================================================================


@router.post(
    "/{post_id}/replies/{reply_id}/upvote",
    status_code=200,
)
def toggle_upvote_reply(
    problem_id: str = Path(...),
    post_id: int = Path(..., gt=0),
    reply_id: int = Path(..., gt=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Toggle upvote on a reply (idempotent).

    Returns { "is_upvoted": bool }
    """
    is_upvoted = discussion_service.toggle_upvote_reply(
        db, reply_id=reply_id, user_id=user.id
    )
    return {"is_upvoted": is_upvoted}


# =====================================================================
# Reaction Endpoints
# =====================================================================


@router.post(
    "/{post_id}/replies/{reply_id}/react",
    status_code=200,
)
def add_reaction(
    problem_id: str = Path(...),
    post_id: int = Path(..., gt=0),
    reply_id: int = Path(..., gt=0),
    data: ReactionCreate = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Toggle emoji reaction on a reply (idempotent).

    Valid emojis: 👍, 💡, 🤔, 😂

    Returns { "is_reacted": bool }
    """
    is_reacted = discussion_service.toggle_reaction(
        db, reply_id=reply_id, user_id=user.id, emoji=data.emoji
    )
    return {"is_reacted": is_reacted}


# =====================================================================
# Accept Answer Endpoint
# =====================================================================


@router.post(
    "/{post_id}/replies/{reply_id}/accept",
    status_code=200,
)
def mark_accepted(
    problem_id: str = Path(...),
    post_id: int = Path(..., gt=0),
    reply_id: int = Path(..., gt=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mark/unmark a reply as accepted (post owner only).

    Only the original post author can mark answers as accepted.
    Calling again on the same reply will unmark it.

    Returns { "is_accepted": bool }
    """
    reply = discussion_service.mark_accepted(
        db, post_id=post_id, reply_id=reply_id, user_id=user.id
    )
    return {"is_accepted": reply.is_accepted}
