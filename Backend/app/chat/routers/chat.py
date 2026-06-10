"""Chat HTTP endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.chat.schemas.chat import (
    ChatDetailOut,
    ChatListOut,
    ChatOut,
    FollowOut,
    MessageCreate,
    MessageEdit,
    MessageOut,
    ReactionCreate,
    ReactionSummary,
    ReplyPreview,
    UserSearchOut,
)
from app.chat.services.chat_service import chat_service
from app.chat.services.connection_manager import connection_manager
from app.core.dependencies import get_current_user, get_db
from app.core.idempotency import IdempotencyContext, idempotency
from app.core.rate_limiting import limiter
from app.feed.schemas.post import format_relative_time

router = APIRouter(prefix="/chat", tags=["chat"])


def _msg_to_out(
    m, sender_username: str, is_read: bool = False, viewer_id: int | None = None
) -> MessageOut:
    reply_to = None
    if m.reply_to_id is not None and m.reply_to_msg is not None:
        parent = m.reply_to_msg
        parent_sender = parent.sender.username if parent.sender else "deleted_user"
        reply_to = ReplyPreview(
            id=parent.id,
            sender_username=parent_sender,
            content=(
                "[deleted]" if parent.is_deleted else parent.content[:200]
            ),
        )
    # Sender-only delete: hide from sender's view without affecting the
    # recipient.  deleted_for_sender is set when for_everyone=False.
    sender_self_deleted = getattr(m, "deleted_for_sender", False)
    show_as_deleted = m.is_deleted or (sender_self_deleted and viewer_id == m.sender_id)
    display_content = "[deleted]" if show_as_deleted else m.content

    # Group reactions by emoji; compute reacted_by_me for the viewer
    reaction_groups: dict[str, dict] = {}
    for r in (getattr(m, "reactions", None) or []):
        e = r.emoji
        reaction_groups.setdefault(e, {"emoji": e, "count": 0, "reacted_by_me": False})
        reaction_groups[e]["count"] += 1
        if viewer_id is not None and r.user_id == viewer_id:
            reaction_groups[e]["reacted_by_me"] = True
    reactions = [ReactionSummary(**v) for v in reaction_groups.values()]
    return MessageOut(
        id=m.id,
        sender_id=m.sender_id,
        sender_username=sender_username,
        content=display_content,
        is_edited=m.is_edited,
        is_deleted=show_as_deleted,
        deleted_for_everyone=m.deleted_for_everyone,
        reply_to_id=m.reply_to_id,
        reply_to=reply_to,
        reactions=reactions,
        created_at=m.created_at.isoformat(),
        time_ago=format_relative_time(m.created_at),
        session_id=m.session_id,
        log_id=m.log_id,
        is_read=is_read,
    )


# ── Chats ───────────────────────────────────────────────────────────────
@router.get("/chats", response_model=ChatListOut)
def list_chats(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = chat_service.list_chats(
        db, current_user_id=user.id, page=page, limit=limit
    )
    # Enrich with real-time online presence — in-memory, no DB round-trips.
    # other_user_last_seen_at is pre-loaded by the service from its bulk user fetch.
    for item in items:
        other_id = item["user_2_id"] if item["user_1_id"] == user.id else item["user_1_id"]
        item["other_user_online"] = connection_manager.is_user_online(other_id)
    return ChatListOut(
        chats=[ChatOut(**i) for i in items],
        pagination={
            "page": page,
            "limit": limit,
            "total_count": total,
            "total_pages": (total + limit - 1) // limit if limit else 0,
        },
    )


@router.get("/chats/{user_id}", response_model=ChatDetailOut)
def get_or_create_chat(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = chat_service.get_or_create_chat(
        db, current_user_id=user.id, other_user_id=user_id
    )
    messages = chat_service.get_chat_messages(db, chat=chat)
    # Bulk fetch usernames for participants
    from sqlalchemy import select
    from app.chat.models.chat import MessageRead

    users = {
        u.id: u
        for u in db.execute(
            select(User).where(User.id.in_([chat.user_1_id, chat.user_2_id]))
        ).scalars().all()
    }

    # Compute which of the current user's sent messages have been read by the other user
    other_user_id = chat.user_2_id if user.id == chat.user_1_id else chat.user_1_id
    msg_ids = [m.id for m in messages]
    read_ids: set[int] = set()
    if msg_ids:
        read_ids = set(
            db.execute(
                select(MessageRead.message_id)
                .where(MessageRead.message_id.in_(msg_ids))
                .where(MessageRead.reader_id == other_user_id)
            ).scalars().all()
        )

    u1_obj = users.get(chat.user_1_id)
    u2_obj = users.get(chat.user_2_id)
    return ChatDetailOut(
        id=chat.id,
        user_1_id=chat.user_1_id,
        user_2_id=chat.user_2_id,
        user_1_username=u1_obj.username if u1_obj else "deleted_user",
        user_2_username=u2_obj.username if u2_obj else "deleted_user",
        is_active=chat.is_active,
        messages=[
            _msg_to_out(
                m,
                m.sender.username if m.sender else "deleted_user",
                is_read=(m.id in read_ids),
                viewer_id=user.id,
            )
            for m in messages
        ],
        created_at=chat.created_at.strftime("%Y-%m-%d"),
    )


@router.post("/chats/{chat_id}/messages", response_model=MessageOut)
@limiter.limit("60/minute")
def send_message(
    request: Request,
    chat_id: int,
    body: MessageCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    idem: IdempotencyContext = Depends(idempotency),
):
    cached = idem.replay()
    if cached is not None:
        return cached

    msg, recipient = chat_service.send_message(
        db,
        chat_id=chat_id,
        sender_id=user.id,
        content=body.content,
        session_id=getattr(user, "session_id", None),
        reply_to_id=body.reply_to_id,
    )
    out = _msg_to_out(msg, user.username)

    # Push to both participants over WebSocket so all open tabs sync.
    payload = {
        "type": "new_message",
        "chat_id": chat_id,
        "message": {**out.model_dump(), "receiver_id": recipient},
    }
    background.add_task(connection_manager.send_to_user, recipient, payload)
    background.add_task(connection_manager.send_to_user, user.id, payload)

    idem.store(out)
    return out


@router.post("/chats/{chat_id}/typing", status_code=204)
@limiter.limit("60/minute")
def typing_indicator(
    request: Request,
    chat_id: int,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Broadcast a typing indicator to the other participant.

    Clients fire this at most once per keystroke burst (debounced on the
    frontend).  The server fans it out over WebSocket with no persistence.
    """
    chat = chat_service.get_chat_by_id(db, chat_id=chat_id, user_id=user.id)
    recipient = chat.user_1_id if chat.user_2_id == user.id else chat.user_2_id
    background.add_task(
        connection_manager.send_to_user,
        recipient,
        {"type": "typing_indicator", "user_id": user.id, "chat_id": chat_id},
    )


@router.post("/chats/{chat_id}/messages/{message_id}/read")
@limiter.limit("120/minute")
def mark_read(
    request: Request,
    chat_id: int,
    message_id: int,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sender_id = chat_service.mark_read(db, message_id=message_id, reader_id=user.id)
    if sender_id is not None:
        background.add_task(
            connection_manager.send_to_user,
            sender_id,
            {
                "type": "read_receipt",
                "chat_id": chat_id,
                "message_id": message_id,
                "reader_id": user.id,
            },
        )
    return {"message": "ok"}


@router.patch("/chats/{chat_id}/messages/{message_id}", response_model=MessageOut)
def edit_message(
    chat_id: int,
    message_id: int,
    body: MessageEdit,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg, recipient = chat_service.edit_message(
        db,
        chat_id=chat_id,
        message_id=message_id,
        editor_id=user.id,
        content=body.content,
    )
    out = _msg_to_out(msg, user.username)
    payload = {"type": "message_edited", "chat_id": chat_id, "message": out.model_dump()}
    background.add_task(connection_manager.send_to_user, recipient, payload)
    background.add_task(connection_manager.send_to_user, user.id, payload)
    return out


@router.delete("/chats/{chat_id}/messages/{message_id}")
def delete_message(
    chat_id: int,
    message_id: int,
    background: BackgroundTasks,
    for_everyone: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg, recipient = chat_service.delete_message(
        db,
        chat_id=chat_id,
        message_id=message_id,
        deleter_id=user.id,
        for_everyone=for_everyone,
    )
    payload = {
        "type": "message_deleted",
        "chat_id": chat_id,
        "message_id": message_id,
        "deleted_for_everyone": msg.deleted_for_everyone,
    }
    # Always notify sender. Only notify recipient if deleted for everyone.
    background.add_task(connection_manager.send_to_user, user.id, payload)
    if msg.deleted_for_everyone:
        background.add_task(connection_manager.send_to_user, recipient, payload)
    return {"message": "ok"}


# ── Reactions ────────────────────────────────────────────────────────────
@router.post("/chats/{chat_id}/messages/{message_id}/reactions")
def add_reaction(
    chat_id: int,
    message_id: int,
    body: ReactionCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg, recipient = chat_service.add_reaction(
        db, chat_id=chat_id, message_id=message_id, user_id=user.id, emoji=body.emoji
    )
    my_reactions = chat_service.get_reactions_grouped(
        db, message_id=message_id, viewer_id=user.id
    )
    their_reactions = chat_service.get_reactions_grouped(
        db, message_id=message_id, viewer_id=recipient
    )
    background.add_task(
        connection_manager.send_to_user,
        user.id,
        {"type": "reaction_update", "chat_id": chat_id, "message_id": message_id, "reactions": my_reactions},
    )
    background.add_task(
        connection_manager.send_to_user,
        recipient,
        {"type": "reaction_update", "chat_id": chat_id, "message_id": message_id, "reactions": their_reactions},
    )
    return {"reactions": my_reactions}


@router.delete("/chats/{chat_id}/messages/{message_id}/reactions/{emoji}")
def remove_reaction(
    chat_id: int,
    message_id: int,
    emoji: str,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg, recipient = chat_service.remove_reaction(
        db, chat_id=chat_id, message_id=message_id, user_id=user.id, emoji=emoji
    )
    my_reactions = chat_service.get_reactions_grouped(
        db, message_id=message_id, viewer_id=user.id
    )
    their_reactions = chat_service.get_reactions_grouped(
        db, message_id=message_id, viewer_id=recipient
    )
    background.add_task(
        connection_manager.send_to_user,
        user.id,
        {"type": "reaction_update", "chat_id": chat_id, "message_id": message_id, "reactions": my_reactions},
    )
    background.add_task(
        connection_manager.send_to_user,
        recipient,
        {"type": "reaction_update", "chat_id": chat_id, "message_id": message_id, "reactions": their_reactions},
    )
    return {"reactions": my_reactions}


# ── User status ───────────────────────────────────────────────────────────
_MAX_STATUS_IDS = 50  # guard against huge IN(...) queries


@router.get("/users/status")
def get_users_status(
    ids: str = Query(..., description="Comma-separated user IDs"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user_ids = [int(i.strip()) for i in ids.split(",") if i.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ids parameter")
    if len(user_ids) > _MAX_STATUS_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many IDs — maximum {_MAX_STATUS_IDS} per request.",
        )
    users = db.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
    return {
        u.id: {
            "is_online": connection_manager.is_user_online(u.id),
            "last_seen_at": u.last_seen_at.isoformat() if u.last_seen_at else None,
        }
        for u in users
    }


# ── Follows ─────────────────────────────────────────────────────────────
@router.post("/users/{user_id}/follow", response_model=FollowOut)
def follow_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = chat_service.follow(db, follower_id=user.id, target_id=user_id)
    target = db.get(User, user_id)
    return FollowOut(
        id=f.id,
        follower_id=f.follower_id,
        following_id=f.following_id,
        follower_username=user.username,
        following_username=target.username if target else "",
        created_at=f.created_at.strftime("%Y-%m-%d"),
    )


@router.delete("/users/{user_id}/follow")
def unfollow_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat_service.unfollow(db, follower_id=user.id, target_id=user_id)
    return {"message": "Unfollowed"}


@router.get("/users/{user_id}/followers")
def get_followers(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = chat_service.list_followers(db, user_id)
    return {"user_id": user_id, "followers_count": len(items), "followers": items}


@router.get("/users/{user_id}/following")
def get_following(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = chat_service.list_following(db, user_id)
    return {"user_id": user_id, "following_count": len(items), "following": items}


@router.get("/users/search", response_model=list[UserSearchOut])
def search_users(
    q: str = Query(..., min_length=1, max_length=64),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return chat_service.search_users(db, q=q, exclude_user_id=user.id)
