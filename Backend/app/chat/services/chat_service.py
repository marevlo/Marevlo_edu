"""
Chat service.

Performance focus: list_chats had N+1+M queries in the old code (one per
chat for each of: user_1, user_2, last_message, two unread subqueries).
Here we do it in two queries — one for the page of chats (with users via
selectinload), one bulk query for unread counts grouped by chat_id.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, aliased, selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.auth.models.user import User, UserSession
from app.chat.models.chat import Chat, Follow, Message, MessageRead, MessageReaction
from app.common.activity_log import ActivityLog
from app.core.exceptions import Conflict, Forbidden, NotFound, ValidationError
from app.feed.schemas.post import format_relative_time

logger = logging.getLogger(__name__)


def _ordered_pair(a: int, b: int) -> Tuple[int, int]:
    return (a, b) if a < b else (b, a)


class ChatService:
    # ── Chats ───────────────────────────────────────────────────────────
    def list_chats(
        self,
        db: Session,
        *,
        current_user_id: int,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict], int]:
        from app.moderation.services.moderation_service import moderation_service

        hidden = moderation_service.hidden_user_ids_for(db, viewer_id=current_user_id)

        # Page of chats — eagerly load both users.
        base_filter = or_(Chat.user_1_id == current_user_id, Chat.user_2_id == current_user_id)
        # Exclude chats where the OTHER participant is blocked.
        if hidden:
            base_filter = and_(
                base_filter,
                ~Chat.user_1_id.in_(hidden),
                ~Chat.user_2_id.in_(hidden),
            )
        query = (
            select(Chat)
            .where(base_filter)
            .order_by(Chat.last_message_at.desc().nullslast(), Chat.id.desc())
        )
        total = db.execute(
            select(func.count(Chat.id)).where(base_filter)
        ).scalar() or 0

        chats = (
            db.execute(query.offset((page - 1) * limit).limit(limit))
            .scalars()
            .all()
        )
        if not chats:
            return [], total

        chat_ids = [c.id for c in chats]
        user_ids = list({c.user_1_id for c in chats} | {c.user_2_id for c in chats})

        # Bulk-load users in one query.
        users_by_id = {
            u.id: u
            for u in db.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
        }

        # Last message per chat — one query, window-functioned.
        # We use a simple correlated approach via DISTINCT ON for Postgres,
        # but to stay portable we fall back to two queries combined with a
        # subquery here. Simpler: fetch ids of latest messages per chat,
        # then load their content.
        latest_msg_subq = (
            select(Message.chat_id, func.max(Message.id).label("max_id"))
            .where(Message.chat_id.in_(chat_ids))
            .group_by(Message.chat_id)
            .subquery()
        )
        latest_msgs = (
            db.execute(
                select(Message)
                .join(latest_msg_subq, Message.id == latest_msg_subq.c.max_id)
            )
            .scalars()
            .all()
        )
        latest_by_chat = {m.chat_id: m for m in latest_msgs}

        # Unread counts — single grouped query.
        # Counts messages in user's chats NOT sent by them, with no row in
        # message_reads for them.
        read_alias = aliased(MessageRead)
        unread_query = (
            select(Message.chat_id, func.count(Message.id).label("cnt"))
            .outerjoin(
                read_alias,
                and_(
                    read_alias.message_id == Message.id,
                    read_alias.reader_id == current_user_id,
                ),
            )
            .where(Message.chat_id.in_(chat_ids))
            .where(Message.sender_id != current_user_id)
            .where(Message.is_deleted.is_(False))
            .where(read_alias.id.is_(None))
            .group_by(Message.chat_id)
        )
        unread_counts = {row.chat_id: int(row.cnt) for row in db.execute(unread_query).all()}

        out: list[dict] = []
        for c in chats:
            u1 = users_by_id.get(c.user_1_id)
            u2 = users_by_id.get(c.user_2_id)
            if not u1 or not u2:
                continue
            # Identify the other participant so the router doesn't need a DB round-trip.
            other_u = u2 if c.user_1_id == current_user_id else u1
            last = latest_by_chat.get(c.id)
            out.append(
                {
                    "id": c.id,
                    "user_1_id": c.user_1_id,
                    "user_2_id": c.user_2_id,
                    "user_1_username": u1.username,
                    "user_2_username": u2.username,
                    "is_active": c.is_active,
                    "last_message_preview": (
                        None if not last
                        else "[deleted]" if last.is_deleted
                        else None if (last.deleted_for_sender and last.sender_id == current_user_id)
                        else last.content[:100]
                    ),
                    "last_message_at": (
                        format_relative_time(c.last_message_at) if c.last_message_at else None
                    ),
                    "unread_count": unread_counts.get(c.id, 0),
                    "created_at": c.created_at.strftime("%Y-%m-%d"),
                    # Pre-computed so the router needs zero extra DB queries per item.
                    "other_user_last_seen_at": (
                        other_u.last_seen_at.isoformat() if other_u.last_seen_at else None
                    ),
                }
            )
        return out, total

    def get_chat_by_id(self, db: Session, *, chat_id: int, user_id: int) -> Chat:
        """Return a chat the caller is a participant of, or raise Forbidden."""
        chat = db.get(Chat, chat_id)
        if not chat:
            raise NotFound("Chat not found")
        if user_id not in (chat.user_1_id, chat.user_2_id):
            raise Forbidden("You are not a participant in this chat")
        return chat

    def get_or_create_chat(
        self, db: Session, *, current_user_id: int, other_user_id: int
    ) -> Chat:
        from app.moderation.services.moderation_service import moderation_service

        if current_user_id == other_user_id:
            raise ValidationError("Cannot chat with yourself")

        other = db.get(User, other_user_id)
        if not other or not other.is_usable():
            raise NotFound("User not found")

        if moderation_service.is_blocked_either_way(
            db, user_a=current_user_id, user_b=other_user_id
        ):
            raise Forbidden("You cannot start a chat with this user")

        u1, u2 = _ordered_pair(current_user_id, other_user_id)
        chat = db.execute(
            select(Chat).where(Chat.user_1_id == u1).where(Chat.user_2_id == u2)
        ).scalar_one_or_none()
        if chat is None:
            chat = Chat(user_1_id=u1, user_2_id=u2)
            db.add(chat)
            db.commit()
            db.refresh(chat)
        return chat

    def get_chat_messages(
        self, db: Session, *, chat: Chat, limit: int = 100
    ) -> list[Message]:
        return (
            db.execute(
                select(Message)
                .where(Message.chat_id == chat.id)
                .order_by(Message.created_at.asc(), Message.id.asc())
                .options(
                    selectinload(Message.sender),
                    selectinload(Message.reply_to_msg).selectinload(Message.sender),
                    selectinload(Message.reactions),
                )
                .limit(limit)
            )
            .scalars()
            .all()
        )

    def send_message(
        self,
        db: Session,
        *,
        chat_id: int,
        sender_id: int,
        content: str,
        session_id: Optional[int],
        reply_to_id: Optional[int] = None,
    ) -> Tuple[Message, int]:
        """Returns (message, recipient_user_id)."""
        from app.moderation.services.moderation_service import moderation_service

        chat = db.get(Chat, chat_id)
        if not chat:
            raise NotFound("Chat not found")
        if sender_id not in (chat.user_1_id, chat.user_2_id):
            raise Forbidden("You are not a participant in this chat")

        recipient = chat.user_1_id if chat.user_2_id == sender_id else chat.user_2_id
        if moderation_service.is_blocked_either_way(
            db, user_a=sender_id, user_b=recipient
        ):
            raise Forbidden("You cannot message this user")

        # Resolve session_id if not provided (e.g. older clients without `sid`).
        if session_id is None:
            session_id = (
                db.execute(
                    select(UserSession.id)
                    .where(UserSession.user_id == sender_id)
                    .where(UserSession.logout_time.is_(None))
                    .order_by(UserSession.login_time.desc())
                    .limit(1)
                ).scalar_one_or_none()
            )

        log = ActivityLog(
            user_id=sender_id,
            action="send_message",
            meta={"chat_id": chat_id, "content_length": len(content)},
        )
        db.add(log)
        db.flush()

        # Validate reply_to_id belongs to the same chat
        parent = None
        if reply_to_id is not None:
            parent = (
                db.execute(
                    select(Message)
                    .where(Message.id == reply_to_id)
                    .options(selectinload(Message.sender))
                )
                .scalar_one_or_none()
            )
            if not parent or parent.chat_id != chat_id:
                raise NotFound("Replied-to message not found in this chat")

        msg = Message(
            chat_id=chat_id,
            sender_id=sender_id,
            session_id=session_id,
            log_id=log.id,
            content=content,
            reply_to_id=reply_to_id,
        )
        db.add(msg)
        chat.last_message_at = datetime.now(timezone.utc)
        db.commit()

        db.refresh(msg)
        if parent is not None:
            set_committed_value(msg, "reply_to_msg", parent)
        set_committed_value(msg, "reactions", [])

        return msg, recipient

    def mark_read(
        self, db: Session, *, message_id: int, reader_id: int
    ) -> Optional[int]:
        """Returns sender_id if newly read; None if already read or message
        belongs to the reader.
        """
        from sqlalchemy.exc import IntegrityError

        msg = db.get(Message, message_id)
        if not msg:
            raise NotFound("Message not found")
        if msg.sender_id == reader_id:
            return None  # don't read-receipt your own messages
        chat = db.get(Chat, msg.chat_id)
        if not chat or reader_id not in (chat.user_1_id, chat.user_2_id):
            raise Forbidden("You are not a participant in this chat")

        existing = db.execute(
            select(MessageRead.id)
            .where(MessageRead.message_id == message_id)
            .where(MessageRead.reader_id == reader_id)
        ).scalar_one_or_none()
        if existing:
            return None

        try:
            db.add(MessageRead(message_id=message_id, reader_id=reader_id))
            db.commit()
        except IntegrityError:
            db.rollback()
            return None
        return msg.sender_id

    def edit_message(
        self,
        db: Session,
        *,
        chat_id: int,
        message_id: int,
        editor_id: int,
        content: str,
    ) -> Tuple[Message, int]:
        """Edit a message. Returns (message, recipient_user_id)."""
        msg = db.get(Message, message_id)
        if not msg or msg.chat_id != chat_id:
            raise NotFound("Message not found")
        if msg.sender_id != editor_id:
            raise Forbidden("Cannot edit another user's message")
        if msg.is_deleted:
            raise ValidationError("Cannot edit a deleted message")

        chat = db.get(Chat, chat_id)
        recipient = chat.user_1_id if chat.user_2_id == editor_id else chat.user_2_id

        msg.content = content
        msg.is_edited = True
        db.commit()
        msg = db.execute(
            select(Message)
            .where(Message.id == msg.id)
            .options(
                selectinload(Message.reply_to_msg).selectinload(Message.sender),
                selectinload(Message.reactions),
            )
        ).scalar_one()
        return msg, recipient

    def delete_message(
        self,
        db: Session,
        *,
        chat_id: int,
        message_id: int,
        deleter_id: int,
        for_everyone: bool = False,
    ) -> Tuple[Message, int]:
        """Soft-delete a message. Returns (message, recipient_user_id).

        for_everyone=True: visible as deleted by both users (max 15-min window).
        for_everyone=False: only the sender sees the deletion.
        """
        from datetime import timezone, timedelta

        msg = db.get(Message, message_id)
        if not msg or msg.chat_id != chat_id:
            raise NotFound("Message not found")
        if msg.sender_id != deleter_id:
            raise Forbidden("Cannot delete another user's message")

        chat = db.get(Chat, chat_id)
        recipient = chat.user_1_id if chat.user_2_id == deleter_id else chat.user_2_id

        if for_everyone:
            now = datetime.now(timezone.utc)
            created_at = msg.created_at if msg.created_at.tzinfo else msg.created_at.replace(tzinfo=timezone.utc)
            age_seconds = (now - created_at).total_seconds()
            if age_seconds > 900:  # 15-minute window
                raise ValidationError("Can only delete for everyone within 15 minutes of sending")
            # Public deletion: mark for everyone and overwrite content in DB
            msg.deleted_for_everyone = True
            msg.is_deleted = True
            msg.content = "[deleted]"
        else:
            # Sender-only hide: recipient can still read the original message.
            # Do NOT touch is_deleted or content — only flag the sender's view.
            msg.deleted_for_sender = True

        db.commit()
        db.refresh(msg)
        return msg, recipient

    # ── Reactions ────────────────────────────────────────────────────────
    # Allowed emojis — keep list short to prevent abuse (no Unicode injection)
    REACTION_EMOJIS: frozenset[str] = frozenset(
        {"👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"}
    )

    def get_reactions_grouped(
        self, db: Session, *, message_id: int, viewer_id: int
    ) -> list[dict]:
        """Return reaction summaries grouped by emoji with reacted_by_me flag."""
        rows = (
            db.execute(
                select(MessageReaction).where(MessageReaction.message_id == message_id)
            )
            .scalars()
            .all()
        )
        groups: dict[str, dict] = {}
        for r in rows:
            e = r.emoji
            groups.setdefault(e, {"emoji": e, "count": 0, "reacted_by_me": False})
            groups[e]["count"] += 1
            if r.user_id == viewer_id:
                groups[e]["reacted_by_me"] = True
        return list(groups.values())

    def add_reaction(
        self, db: Session, *, chat_id: int, message_id: int, user_id: int, emoji: str
    ) -> Tuple[Message, int]:
        if emoji not in self.REACTION_EMOJIS:
            raise ValidationError("Emoji not allowed")
        msg = db.get(Message, message_id)
        if not msg or msg.chat_id != chat_id:
            raise NotFound("Message not found")
        if msg.is_deleted:
            raise ValidationError("Cannot react to a deleted message")

        existing = db.execute(
            select(MessageReaction)
            .where(MessageReaction.message_id == message_id)
            .where(MessageReaction.user_id == user_id)
            .where(MessageReaction.emoji == emoji)
        ).scalar_one_or_none()
        if existing:
            raise Conflict("Already reacted with this emoji")

        chat = db.get(Chat, chat_id)
        recipient = chat.user_1_id if chat.user_2_id == user_id else chat.user_2_id

        db.add(MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji))
        db.commit()
        return msg, recipient

    def remove_reaction(
        self, db: Session, *, chat_id: int, message_id: int, user_id: int, emoji: str
    ) -> Tuple[Message, int]:
        msg = db.get(Message, message_id)
        if not msg or msg.chat_id != chat_id:
            raise NotFound("Message not found")

        existing = db.execute(
            select(MessageReaction)
            .where(MessageReaction.message_id == message_id)
            .where(MessageReaction.user_id == user_id)
            .where(MessageReaction.emoji == emoji)
        ).scalar_one_or_none()
        if not existing:
            raise NotFound("Reaction not found")

        chat = db.get(Chat, chat_id)
        recipient = chat.user_1_id if chat.user_2_id == user_id else chat.user_2_id

        db.delete(existing)
        db.commit()
        return msg, recipient

    # ── Follows ─────────────────────────────────────────────────────────
    def follow(self, db: Session, *, follower_id: int, target_id: int) -> Follow:
        if follower_id == target_id:
            raise ValidationError("Cannot follow yourself")
        target = db.get(User, target_id)
        if not target or not target.is_usable():
            raise NotFound("User not found")

        existing = db.execute(
            select(Follow)
            .where(Follow.follower_id == follower_id)
            .where(Follow.following_id == target_id)
        ).scalar_one_or_none()
        if existing:
            raise Conflict("Already following")
        f = Follow(follower_id=follower_id, following_id=target_id)
        db.add(f)
        db.commit()
        db.refresh(f)
        return f

    def unfollow(self, db: Session, *, follower_id: int, target_id: int) -> None:
        f = db.execute(
            select(Follow)
            .where(Follow.follower_id == follower_id)
            .where(Follow.following_id == target_id)
        ).scalar_one_or_none()
        if not f:
            raise NotFound("Not following this user")
        db.delete(f)
        db.commit()

    def list_followers(self, db: Session, user_id: int) -> list[dict]:
        rows = db.execute(
            select(Follow, User)
            .join(User, User.id == Follow.follower_id)
            .where(Follow.following_id == user_id)
            .order_by(Follow.created_at.desc())
        ).all()
        return [
            {"id": u.id, "username": u.username, "followed_at": f.created_at.strftime("%Y-%m-%d")}
            for f, u in rows
        ]

    def list_following(self, db: Session, user_id: int) -> list[dict]:
        rows = db.execute(
            select(Follow, User)
            .join(User, User.id == Follow.following_id)
            .where(Follow.follower_id == user_id)
            .order_by(Follow.created_at.desc())
        ).all()
        return [
            {"id": u.id, "username": u.username, "followed_at": f.created_at.strftime("%Y-%m-%d")}
            for f, u in rows
        ]

    def search_users(
        self, db: Session, *, q: str, exclude_user_id: int, limit: int = 10
    ) -> list[dict]:
        from app.moderation.services.moderation_service import moderation_service

        hidden = moderation_service.hidden_user_ids_for(db, viewer_id=exclude_user_id)
        excluded = hidden | {exclude_user_id}

        rows = (
            db.execute(
                select(User)
                .where(User.username.ilike(
                    f"%{q.replace(chr(92), chr(92)*2).replace('%', r'\%').replace('_', r'\_')}%",
                    escape='\\',
                ))
                .where(User.is_active.is_(True))
                .where(~User.id.in_(excluded))
                .where(User.deleted_at.is_(None))
                .limit(limit)
            )
            .scalars()
            .all()
        )
        return [{"id": u.id, "username": u.username} for u in rows]


chat_service = ChatService()
