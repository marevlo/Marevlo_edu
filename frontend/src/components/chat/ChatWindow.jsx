import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, MoreVertical, Loader, Edit2, Trash2, X, Check, CheckCheck, Clock, Info, Smile, Paperclip, ChevronDown, Copy, CornerUpLeft, BellOff, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL;

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];

// "Last seen X ago" formatter
const formatLastSeen = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 120) return 'Last seen just now';
    if (diff < 3600) return `Last seen ${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `Last seen at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diff < 172800) return 'Last seen yesterday';
    return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
};

// Utility: Generate gradient color from username
const getGradientFromUsername = (username) => {
    if (!username) return 'linear-gradient(135deg, #6672e0, #9180e8)';
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) - hash) + username.charCodeAt(i);
        hash = hash & hash;
    }
    const colors = [
        'linear-gradient(135deg, #6672e0, #9180e8)',
        'linear-gradient(135deg, #41bd78, #14b8a6)',
        'linear-gradient(135deg, #e0a050, #f97316)',
        'linear-gradient(135deg, #e06661, #b988d6)',
        'linear-gradient(135deg, #3fa9c9, #0ea5e9)',
        'linear-gradient(135deg, #9180e8, #ab9df0)',
        'linear-gradient(135deg, #14b8a6, #3fa9c9)',
        'linear-gradient(135deg, #f97316, #e09a5e)',
    ];
    return colors[Math.abs(hash) % colors.length];
};

export default function ChatWindow({ chatId: chatIdProp, userId, onBack }) {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [otherUser, setOtherUser] = useState(null);
    const [sending, setSending] = useState(false);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [actionMenuId, setActionMenuId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editDraft, setEditDraft] = useState('');
    const [showInfoPanel, setShowInfoPanel] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [firstUnreadId, setFirstUnreadId] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [emojiPickerMsgId, setEmojiPickerMsgId] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const unreadSepRef = useRef(null);
    const hasInitiallyScrolled = useRef(false);
    const swipeRef = useRef({ startX: 0, pointerId: null, el: null, iconEl: null, msgId: null, isOwn: false, done: false });
    const SWIPE_THRESHOLD = 56;
    const token = localStorage.getItem('access_token');
    const typingEmitRef = useRef(null);
    const observerRef = useRef(null);
    const observedMsgIds = useRef(new Set());
    const fetchAbortRef = useRef(null);
    const [pendingDelete, setPendingDelete] = useState(null); // { id, forEveryone } | null

    // Mutable ref for chatId so the WS listener always has the latest value
    const chatIdRef = useRef(chatIdProp);
    useEffect(() => { chatIdRef.current = chatIdProp; }, [chatIdProp]);

    // Auto-grow textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            const newHeight = Math.min(inputRef.current.scrollHeight, 120);
            inputRef.current.style.height = newHeight + 'px';
        }
    }, [input]);

    const fetchChat = useCallback(async () => {
        if (fetchAbortRef.current) fetchAbortRef.current.abort();
        const ctrl = new AbortController();
        fetchAbortRef.current = ctrl;
        try {
            setLoading(true);
            const response = await fetch(
                `${API_BASE}/chat/chats/${userId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    signal: ctrl.signal,
                }
            );
            if (response.ok) {
                const data = await response.json();
                setMessages(data.messages);
                if (data.id) chatIdRef.current = data.id;
                const otherId = data.user_1_id === user?.id ? data.user_2_id : data.user_1_id;
                setOtherUser({
                    id: otherId,
                    username: data.user_1_id === user?.id ? data.user_2_username : data.user_1_username,
                    isOnline: false,
                    last_seen_at: null,
                });
                try {
                    const statusResp = await fetch(
                        `${API_BASE}/chat/users/status?ids=${otherId}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    if (statusResp.ok) {
                        const statusData = await statusResp.json();
                        const s = statusData[otherId] || statusData[String(otherId)] || {};
                        setOtherUser(prev => prev ? {
                            ...prev,
                            isOnline: s.is_online ?? false,
                            last_seen_at: s.last_seen_at ?? null,
                        } : prev);
                    }
                } catch (_) {}
                const firstUnread = (data.messages || []).find(
                    m => m.sender_id !== user?.id && !m.is_read
                );
                if (firstUnread) setFirstUnreadId(firstUnread.id);
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Failed to load chat:', err);
        } finally {
            setLoading(false);
        }
    }, [userId, token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (userId) fetchChat();
        return () => fetchAbortRef.current?.abort();
    }, [userId, fetchChat]);

    // WebSocket listener
    useEffect(() => {
        const handleWsMessage = (event) => {
            const data = event.detail;

            if (data.type === 'new_message') {
                const currentChatId = chatIdRef.current;
                const msg = data.message;

                const isThisChat =
                    (currentChatId && String(data.chat_id) === String(currentChatId)) ||
                    msg.sender_id === userId ||
                    msg.receiver_id === userId;

                if (!isThisChat) return;

                if (!currentChatId && data.chat_id) {
                    chatIdRef.current = data.chat_id;
                }

                setMessages(prev => {
                    if (prev.find(m => m.id === msg.id)) return prev;

                    if (msg.sender_id === user?.id) {
                        const optimisticIdx = prev.findIndex(m =>
                            m._optimistic && m.content === msg.content && m.sender_id === msg.sender_id
                        );
                        if (optimisticIdx !== -1) {
                            const updated = [...prev];
                            updated[optimisticIdx] = msg;
                            return updated;
                        }
                    }

                    return [...prev, msg];
                });

                if (msg.sender_id !== user?.id && data.chat_id) {
                    fetch(`${API_BASE}/chat/chats/${data.chat_id}/messages/${msg.id}/read`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }).catch(() => {});
                }
            } else if (data.type === 'message_edited') {
                const updated = data.message;
                if (!updated) return;
                setMessages(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m)));
            } else if (data.type === 'message_deleted') {
                setMessages(prev => prev.map(m => (
                    m.id === data.message_id
                        ? { ...m, is_deleted: true, content: '[deleted]' }
                        : m
                )));
            } else if (data.type === 'read_receipt') {
                // Other user has read one of our messages — mark it as seen
                if (data.chat_id && String(data.chat_id) === String(chatIdRef.current)) {
                    setMessages(prev => prev.map(m =>
                        m.id === data.message_id ? { ...m, is_read: true } : m
                    ));
                }
            } else if (data.type === 'status_update') {
                if (data.user_id === userId) {
                    setOtherUser(prev => prev ? {
                        ...prev,
                        isOnline: data.status === 'online',
                        ...(data.last_seen_at ? { last_seen_at: data.last_seen_at } : {}),
                    } : prev);
                }
            } else if (data.type === 'reaction_update') {
                if (String(data.chat_id) === String(chatIdRef.current)) {
                    setMessages(prev => prev.map(m =>
                        m.id === data.message_id ? { ...m, reactions: data.reactions } : m
                    ));
                }
            } else if (data.type === 'typing_indicator') {
                if (data.user_id === userId) {
                    setIsTyping(true);
                    setTimeout(() => setIsTyping(false), 3000);
                }
            }
        };

        window.addEventListener('ws_message', handleWsMessage);
        return () => window.removeEventListener('ws_message', handleWsMessage);
    }, [userId, user?.id, token]);

    // Smart scroll: on initial load jump to first unread (or bottom); on subsequent updates scroll only if near bottom
    useEffect(() => {
        if (!messages.length) return;
        if (!hasInitiallyScrolled.current) {
            hasInitiallyScrolled.current = true;
            // Use a tiny delay so the DOM has rendered the separator ref
            setTimeout(() => {
                if (unreadSepRef.current) {
                    unreadSepRef.current.scrollIntoView({ behavior: 'instant', block: 'center' });
                } else {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
                }
            }, 60);
        } else {
            // New message — only auto-scroll if user is already near the bottom
            const el = scrollContainerRef.current;
            if (el) {
                const { scrollTop, scrollHeight, clientHeight } = el;
                if (scrollHeight - scrollTop - clientHeight < 220) {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
            }
        }
    }, [messages]);

    // Show scroll-to-bottom FAB when user scrolls up
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = el;
            setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 220);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    // Mark unread received messages as read once they scroll into view (50% threshold).
    useEffect(() => {
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const msgId = parseInt(entry.target.dataset.unreadMsgId, 10);
                    if (!msgId) return;
                    const cid = chatIdRef.current;
                    if (!cid) return;
                    fetch(`${API_BASE}/chat/chats/${cid}/messages/${msgId}/read`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    }).catch(() => {});
                    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_read: true } : m));
                    observerRef.current?.unobserve(entry.target);
                });
            },
            { threshold: 0.5 }
        );
        return () => observerRef.current?.disconnect();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const handleReconnect = () => { if (userId) fetchChat(); };
        window.addEventListener('ws_reconnected', handleReconnect);
        return () => window.removeEventListener('ws_reconnected', handleReconnect);
    }, [userId, fetchChat]);

    // Throttled typing indicator — at most one request per 2 s burst.
    const emitTyping = () => {
        const cid = chatIdRef.current;
        if (!cid) return;
        if (typingEmitRef.current) return; // already scheduled within window
        typingEmitRef.current = setTimeout(() => {
            typingEmitRef.current = null;
        }, 2000);
        fetch(`${API_BASE}/chat/chats/${cid}/typing`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {});
    };

    const handleSendMessage = async () => {
        if (!input.trim() || !userId) return;

        const messageContent = input.trim();
        setInput('');
        setReplyTo(null);
        setSending(true);

        // Optimistic: show the message immediately
        const optimisticMsg = {
            id: `_opt_${Date.now()}`,
            sender_id: user?.id,
            content: messageContent,
            created_at: new Date().toISOString(),
            time_ago: 'Just now',
            _optimistic: true,
            reply_to_id: replyTo?.id ?? null,
            reply_to: replyTo ? {
                id: replyTo.id,
                sender_username: replyTo.sender_username,
                content: replyTo.is_deleted ? '[deleted]' : replyTo.content,
            } : null,
        };
        setMessages(prev => [...prev, optimisticMsg]);

        try {
            // Resolve chatId if we don't have one yet (new chat)
            let currentChatId = chatIdRef.current;

            if (!currentChatId) {
                const chatResponse = await fetch(
                    `${API_BASE}/chat/chats/${userId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                if (chatResponse.ok) {
                    const chatData = await chatResponse.json();
                    currentChatId = chatData.id;
                    chatIdRef.current = currentChatId;
                }
            }

            // Send message via REST
            const response = await fetch(
                `${API_BASE}/chat/chats/${currentChatId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: messageContent,
                        ...(replyTo ? { reply_to_id: replyTo.id } : {}),
                    })
                }
            );

            if (response.ok) {
                const newMessage = await response.json();
                // Replace optimistic message with the real server response
                setMessages(prev => prev.map(m =>
                    m.id === optimisticMsg.id ? newMessage : m
                ));
            } else {
                // Remove optimistic message on failure
                setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
                setInput(messageContent);
            }
        } catch (err) {
            console.error('Failed to send message:', err);
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
            setInput(messageContent);
        } finally {
            setSending(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const startEdit = (message) => {
        setActionMenuId(null);
        setEditingId(message.id);
        setEditDraft(message.content);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditDraft('');
    };

    const handleCopy = (message) => {
        setActionMenuId(null);
        navigator.clipboard.writeText(message.content).then(() => {
            setCopiedId(message.id);
            setTimeout(() => setCopiedId(null), 1800);
        }).catch(() => {});
    };

    const saveEdit = async (message) => {
        const trimmed = editDraft.trim();
        if (!trimmed) {
            cancelEdit();
            return;
        }
        if (trimmed === message.content) {
            cancelEdit();
            return;
        }
        const chatId = chatIdRef.current;
        if (!chatId) {
            cancelEdit();
            return;
        }
        // Optimistic update
        setMessages(prev => prev.map(m => (
            m.id === message.id ? { ...m, content: trimmed, is_edited: true } : m
        )));
        cancelEdit();
        try {
            const response = await fetch(
                `${API_BASE}/chat/chats/${chatId}/messages/${message.id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: trimmed })
                }
            );
            if (response.ok) {
                const updated = await response.json();
                setMessages(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m)));
            } else {
                // Revert on failure
                setMessages(prev => prev.map(m => (
                    m.id === message.id ? { ...m, content: message.content, is_edited: message.is_edited } : m
                )));
            }
        } catch (err) {
            console.error('Failed to edit message:', err);
            setMessages(prev => prev.map(m => (
                m.id === message.id ? { ...m, content: message.content, is_edited: message.is_edited } : m
            )));
        }
    };

    const handleDelete = async (message) => {
        setActionMenuId(null);
        setPendingDelete(null);
        const chatId = chatIdRef.current;
        if (!chatId) return;
        const prevSnapshot = message;
        setMessages(prev => prev.map(m => (
            m.id === message.id ? { ...m, is_deleted: true, content: '[deleted]' } : m
        )));
        try {
            const response = await fetch(
                `${API_BASE}/chat/chats/${chatId}/messages/${message.id}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            if (!response.ok) {
                setMessages(prev => prev.map(m => (m.id === prevSnapshot.id ? prevSnapshot : m)));
            }
        } catch (err) {
            console.error('Failed to delete message:', err);
            setMessages(prev => prev.map(m => (m.id === prevSnapshot.id ? prevSnapshot : m)));
        }
    };

    const handleDeleteForEveryone = async (message) => {
        setActionMenuId(null);
        setPendingDelete(null);
        const chatId = chatIdRef.current;
        if (!chatId) return;
        const prevSnapshot = message;
        setMessages(prev => prev.map(m => (
            m.id === message.id ? { ...m, is_deleted: true, deleted_for_everyone: true, content: '[deleted]' } : m
        )));
        try {
            const response = await fetch(
                `${API_BASE}/chat/chats/${chatId}/messages/${message.id}?for_everyone=true`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                }
            );
            if (!response.ok) {
                setMessages(prev => prev.map(m => (m.id === prevSnapshot.id ? prevSnapshot : m)));
            }
        } catch (err) {
            console.error('Failed to delete message for everyone:', err);
            setMessages(prev => prev.map(m => (m.id === prevSnapshot.id ? prevSnapshot : m)));
        }
    };

    const handleReact = async (message, emoji) => {
        setEmojiPickerMsgId(null);
        const chatId = chatIdRef.current;
        if (!chatId) return;
        const alreadyReacted = (message.reactions || []).find(r => r.emoji === emoji && r.reacted_by_me);
        const prevReactions = message.reactions || []; // snapshot for revert on failure
        // Optimistic update
        setMessages(prev => prev.map(m => {
            if (m.id !== message.id) return m;
            const reactions = [...(m.reactions || [])];
            const idx = reactions.findIndex(r => r.emoji === emoji);
            if (alreadyReacted) {
                if (idx !== -1) {
                    const updated = { ...reactions[idx], count: reactions[idx].count - 1, reacted_by_me: false };
                    if (updated.count <= 0) return { ...m, reactions: reactions.filter((_, i) => i !== idx) };
                    return { ...m, reactions: reactions.map((r, i) => i === idx ? updated : r) };
                }
            } else {
                if (idx !== -1) {
                    return { ...m, reactions: reactions.map((r, i) => i === idx ? { ...r, count: r.count + 1, reacted_by_me: true } : r) };
                }
                return { ...m, reactions: [...reactions, { emoji, count: 1, reacted_by_me: true }] };
            }
            return m;
        }));
        try {
            if (alreadyReacted) {
                await fetch(
                    `${API_BASE}/chat/chats/${chatId}/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`,
                    { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
                );
            } else {
                await fetch(
                    `${API_BASE}/chat/chats/${chatId}/messages/${message.id}/reactions`,
                    {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ emoji }),
                    }
                );
            }
        } catch (err) {
            console.error('Reaction failed:', err);
            // Revert optimistic update so the UI stays in sync with the server
            setMessages(prev => prev.map(m =>
                m.id === message.id ? { ...m, reactions: prevReactions } : m
            ));
        }
    };

    return (
        <div className="h-full flex overflow-hidden" style={{ background: 'var(--color-app-bg)' }}>

            {/* ── MAIN CHAT COLUMN ── */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">

            {/* Header — glassmorphism + gradient accent */}
            <div
                className="flex-shrink-0 px-4 py-3 flex items-center justify-between gap-3 relative"
                style={{
                    background: 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-border)',
                    boxShadow: '0 4px 20px -8px rgba(102,114,224,0.18)',
                }}
            >
                {/* gradient accent line at top */}
                <span
                    aria-hidden
                    className="absolute top-0 left-0 right-0 h-0.5 rounded-b"
                    style={{ background: 'linear-gradient(90deg, #6672e0, #9180e8, #3fa9c9)' }}
                />

                {/* Left: back + avatar + name */}
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full hover:bg-[var(--color-surface-hover)] transition-all lg:hidden flex-shrink-0"
                    >
                        <ArrowLeft size={20} />
                    </button>

                    {/* Avatar with pulse ring when online */}
                    <div className="relative flex-shrink-0">
                        {otherUser?.isOnline && (
                            <span
                                aria-hidden
                                className="absolute inset-0 rounded-full"
                                style={{ animation: 'onlinePulseRing 2.4s ease-out infinite', border: '2px solid #41bd78', opacity: 0 }}
                            />
                        )}
                        <div
                            className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white"
                            style={{
                                background: getGradientFromUsername(otherUser?.username || '?'),
                                boxShadow: otherUser?.isOnline ? '0 0 0 3px rgba(65,189,120,0.2)' : '0 2px 8px rgba(0,0,0,0.15)',
                            }}
                        >
                            {otherUser?.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        {otherUser?.isOnline && (
                            <span
                                className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                                style={{ backgroundColor: '#41bd78', borderColor: 'var(--color-surface)', boxShadow: '0 0 6px #41bd78' }}
                            />
                        )}
                    </div>

                    <div className="min-w-0">
                        <h2
                            className="font-bold text-sm truncate leading-tight tracking-tight"
                            style={{
                                background: 'linear-gradient(135deg, var(--color-primary-text) 40%, #6672e0 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            }}
                        >
                            {otherUser?.username || 'User'}
                        </h2>
                        <div className="flex items-center gap-1.5 mt-0.5 h-4 overflow-hidden">
                            {isTyping ? (
                                <span className="text-xs font-semibold" style={{ color: 'var(--primary)', animation: 'statusBlink 1.2s ease-in-out infinite' }}>
                                    typing…
                                </span>
                            ) : (
                                <>
                                    {otherUser?.isOnline && (
                                        <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: '#41bd78', animation: 'statusBlink 2s ease-in-out infinite' }} />
                                    )}
                                    <p className="text-xs leading-tight truncate" style={{ color: otherUser?.isOnline ? '#41bd78' : 'var(--color-muted-text)', fontWeight: otherUser?.isOnline ? 500 : 400 }}>
                                        {otherUser?.isOnline ? 'Active now' : formatLastSeen(otherUser?.last_seen_at)}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: info + more (NO call/video) */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => setShowInfoPanel(p => !p)}
                        className="p-2 rounded-full transition-all duration-200"
                        style={{
                            color: showInfoPanel ? '#6672e0' : 'var(--color-muted-text)',
                            backgroundColor: showInfoPanel ? 'rgba(102,114,224,0.12)' : 'transparent',
                            boxShadow: showInfoPanel ? '0 0 0 2px rgba(102,114,224,0.3)' : 'none',
                        }}
                        title="Contact info"
                        onMouseEnter={e => { if (!showInfoPanel) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
                        onMouseLeave={e => { if (!showInfoPanel) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <Info size={20} />
                    </button>
                    <button
                        onPointerDown={(e) => { console.log('header more pointerdown'); e.stopPropagation(); }}
                        onMouseDown={(e) => { console.log('header more mousedown'); e.stopPropagation(); }}
                        onClick={(e) => { console.log('header more click'); e.stopPropagation(); setShowInfoPanel(p => !p); }}
                        className="p-2 rounded-full transition-all duration-200"
                        style={{ color: 'var(--color-muted-text)', zIndex: 60, pointerEvents: 'auto' }}
                        title="More options"
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <MoreVertical size={20} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollContainerRef}
                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4"
                style={{
                    background: 'var(--color-app-bg)',
                    backgroundImage: 'radial-gradient(circle, rgba(102,114,224,0.04) 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                }}
                onClick={() => { setActionMenuId(null); setEmojiPickerMsgId(null); setPendingDelete(null); }}
            >
                {loading && !messages.length && (
                    <div className="flex flex-col gap-5 py-6 px-1">
                        {/* Skeleton bubbles — received */}
                        <div className="flex justify-start items-end gap-2.5">
                            <div className="w-8 h-8 rounded-full chat-shimmer flex-shrink-0" />
                            <div className="flex flex-col gap-1.5">
                                <div className="w-52 h-10 chat-shimmer" style={{ borderRadius: '18px 18px 18px 4px' }} />
                                <div className="w-36 h-8 chat-shimmer" style={{ borderRadius: '4px 18px 18px 18px' }} />
                            </div>
                        </div>
                        {/* Skeleton bubbles — own */}
                        <div className="flex justify-end">
                            <div className="w-44 h-10 chat-shimmer" style={{ borderRadius: '18px 18px 4px 18px' }} />
                        </div>
                        {/* Skeleton bubbles — received */}
                        <div className="flex justify-start items-end gap-2.5">
                            <div className="w-8 h-8 rounded-full chat-shimmer flex-shrink-0" />
                            <div className="w-64 h-12 chat-shimmer" style={{ borderRadius: '18px 18px 18px 4px' }} />
                        </div>
                        {/* Skeleton bubbles — own */}
                        <div className="flex justify-end gap-1.5 flex-col items-end">
                            <div className="w-56 h-10 chat-shimmer" style={{ borderRadius: '18px 18px 4px 18px' }} />
                            <div className="w-32 h-8 chat-shimmer" style={{ borderRadius: '18px 18px 4px 18px' }} />
                        </div>
                        {/* Skeleton bubbles — received */}
                        <div className="flex justify-start items-end gap-2.5">
                            <div className="w-8 h-8 rounded-full chat-shimmer flex-shrink-0" />
                            <div className="w-40 h-8 chat-shimmer" style={{ borderRadius: '18px 18px 18px 4px' }} />
                        </div>
                    </div>
                )}

                {messages.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center h-full gap-5 pb-12">
                        {/* Avatar ring + pulse */}
                        <div className="relative">
                            <div
                                className="absolute inset-0 rounded-full opacity-20"
                                style={{
                                    background: getGradientFromUsername(otherUser?.username || '?'),
                                    transform: 'scale(1.35)',
                                    filter: 'blur(12px)',
                                    animation: 'emptyAvatarPulse 3s ease-in-out infinite',
                                }}
                            />
                            <div
                                className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white relative"
                                style={{
                                    background: getGradientFromUsername(otherUser?.username || '?'),
                                    boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
                                }}
                            >
                                {otherUser?.username?.[0]?.toUpperCase() || '?'}
                                {otherUser?.isOnline && (
                                    <span
                                        className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
                                        style={{ backgroundColor: '#41bd78', borderColor: 'var(--color-app-bg)', boxShadow: '0 0 8px #41bd78' }}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="text-center">
                            <h3 className="font-bold text-lg mb-1 text-foreground">
                                {otherUser?.username}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {otherUser?.isOnline
                                    ? '🟢 Active now — say hello!'
                                    : 'Send the first message 👋'}
                            </p>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                            <div
                                className="px-4 py-2 rounded-full text-xs font-medium"
                                style={{ background: 'rgba(102,114,224,0.1)', color: 'var(--primary)', border: '1px solid rgba(102,114,224,0.18)' }}
                            >
                                🔒 Private · Just between you two
                            </div>
                        </div>
                    </div>
                )}

                <div>
                    {messages.map((message, idx) => {
                        const isOwn = message.sender_id === user?.id;
                        const isDeleted = !!message.is_deleted;
                        const isEditing = editingId === message.id;
                        const canActOn = isOwn && !isDeleted && !message._optimistic;

                        const prevMsg = messages[idx - 1];
                        const nextMsg = messages[idx + 1];
                        const isFirstInGroup = !prevMsg || prevMsg.sender_id !== message.sender_id;
                        const isLastInGroup = !nextMsg || nextMsg.sender_id !== message.sender_id;

                        // Date separator: show when day changes
                        const msgDate = message.created_at ? new Date(message.created_at) : null;
                        const prevDate = prevMsg?.created_at ? new Date(prevMsg.created_at) : null;
                        const showDateSep = msgDate && prevDate &&
                            msgDate.toDateString() !== prevDate.toDateString();
                        const showTopDate = msgDate && !prevMsg;

                        // Bubble corner shaping (iMessage/WhatsApp style)
                        const ownRadius = `${isFirstInGroup ? '20px' : '5px'} 20px 20px ${isLastInGroup ? '20px' : '5px'}`;
                        const otherRadius = `20px ${isFirstInGroup ? '20px' : '5px'} ${isLastInGroup ? '5px' : '20px'} 20px`;

                        const formatDateSep = (d) => {
                            const today = new Date();
                            const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
                            if (d.toDateString() === today.toDateString()) return 'Today';
                            if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
                            return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
                        };

                        return (
                            <React.Fragment key={message.id}>
                                {/* Unread messages separator */}
                                {message.id === firstUnreadId && (
                                    <div
                                        ref={unreadSepRef}
                                        className="flex items-center gap-3 my-4"
                                        aria-label="New messages separator"
                                    >
                                        <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(102,114,224,0.5))' }} />
                                        <span
                                            className="text-[10px] font-semibold px-3 py-1 rounded-full flex items-center gap-1.5"
                                            style={{
                                                background: 'linear-gradient(135deg, #6672e0, #9180e8)',
                                                color: '#fff',
                                                boxShadow: '0 2px 8px rgba(102,114,224,0.35)',
                                                letterSpacing: '0.03em',
                                            }}
                                        >
                                            New messages ↓
                                        </span>
                                        <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(102,114,224,0.5), transparent)' }} />
                                    </div>
                                )}

                                {/* Date separator */}
                                {(showDateSep || showTopDate) && msgDate && (
                                    <div className="flex items-center gap-3 my-5">
                                        <span className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                                        <span
                                            className="text-[11px] font-medium px-3 py-1 rounded-full text-muted-foreground"
                                            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                                        >
                                            {formatDateSep(msgDate)}
                                        </span>
                                        <span className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                                    </div>
                                )}

                                <div
                                    id={`msg-${message.id}`}
                                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-4' : 'mt-0.5'} relative`}
                                    style={{ animation: `msgIn 0.25s ease-out both`, touchAction: 'pan-y' }}
                                    ref={el => {
                                        if (!el || message.is_read || isOwn || message._optimistic) return;
                                        if (observedMsgIds.current.has(message.id)) return;
                                        observedMsgIds.current.add(message.id);
                                        el.dataset.unreadMsgId = String(message.id);
                                        observerRef.current?.observe(el);
                                    }}
                                    onPointerDown={(e) => {
                                        if (isDeleted || message._optimistic) return;
                                        if (e.pointerType === 'mouse' && e.button !== 0) return;
                                        // If the pointerdown originated on an interactive control, don't capture
                                        const tgt = e.target;
                                        try {
                                            if (tgt && tgt.closest && tgt.closest('button, a, input, textarea, [role="button"]')) return;
                                        } catch (err) {
                                            // ignore DOM errors
                                        }
                                        e.currentTarget.setPointerCapture(e.pointerId);
                                        swipeRef.current = {
                                            startX: e.clientX,
                                            pointerId: e.pointerId,
                                            el: e.currentTarget,
                                            iconEl: e.currentTarget.querySelector('.swipe-reply-icon'),
                                            msgId: message.id,
                                            isOwn,
                                            done: false,
                                        };
                                    }}
                                    onPointerMove={(e) => {
                                        const ref = swipeRef.current;
                                        if (!ref.el || ref.msgId !== message.id) return;
                                        const dx = e.clientX - ref.startX;
                                        const inDir = ref.isOwn ? dx < 0 : dx > 0;
                                        if (!inDir) return;
                                        const absDx = Math.min(Math.abs(dx), 80);
                                        const sign = ref.isOwn ? -1 : 1;
                                        ref.el.style.transform = `translateX(${sign * absDx}px)`;
                                        ref.el.style.transition = 'none';
                                        if (ref.iconEl) {
                                            const progress = Math.min(absDx / SWIPE_THRESHOLD, 1);
                                            ref.iconEl.style.opacity = String(progress);
                                            ref.iconEl.style.transform = `scale(${0.65 + progress * 0.35})`;
                                        }
                                    }}
                                    onPointerUp={(e) => {
                                        const ref = swipeRef.current;
                                        if (!ref.el || ref.msgId !== message.id) return;
                                        const dx = e.clientX - ref.startX;
                                        ref.el.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
                                        ref.el.style.transform = 'translateX(0)';
                                        if (ref.iconEl) {
                                            ref.iconEl.style.transition = 'opacity 0.2s ease, transform 0.3s ease';
                                            ref.iconEl.style.opacity = '0';
                                            ref.iconEl.style.transform = 'scale(0.65)';
                                        }
                                        if (Math.abs(dx) >= SWIPE_THRESHOLD && !ref.done) {
                                            ref.done = true;
                                            setReplyTo(message);
                                            inputRef.current?.focus();
                                        }
                                        swipeRef.current = { startX: 0, pointerId: null, el: null, iconEl: null, msgId: null, isOwn: false, done: false };
                                    }}
                                    onPointerCancel={() => {
                                        const ref = swipeRef.current;
                                        if (!ref.el) return;
                                        ref.el.style.transition = 'transform 0.3s ease';
                                        ref.el.style.transform = 'translateX(0)';
                                        swipeRef.current = { startX: 0, pointerId: null, el: null, iconEl: null, msgId: null, isOwn: false, done: false };
                                    }}
                                >
                                    {/* Swipe-to-reply indicator icon */}
                                    {!isDeleted && !message._optimistic && (
                                        <div
                                            className="swipe-reply-icon absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center pointer-events-none"
                                            style={{
                                                [isOwn ? 'left' : 'right']: '2px',
                                                background: 'rgba(102,114,224,0.18)',
                                                color: 'var(--primary)',
                                                opacity: 0,
                                                transform: 'scale(0.65)',
                                                zIndex: 5,
                                            }}
                                            aria-hidden
                                        >
                                            <CornerUpLeft size={13} />
                                        </div>
                                    )}
                                    {/* Avatar slot (received only) */}
                                    {!isOwn && (
                                        <div className="w-8 flex-shrink-0 mr-2.5 flex items-end pb-0.5">
                                            {isLastInGroup ? (
                                                <div
                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                                    style={{ background: getGradientFromUsername(otherUser?.username || '?'), boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
                                                >
                                                    {otherUser?.username?.[0]?.toUpperCase() || '?'}
                                                </div>
                                            ) : null}
                                        </div>
                                    )}

                                    <div className="relative max-w-[68%] group">
                                        {/* Quick reactions bar — appears above bubble on hover */}
                                        {!isDeleted && !isEditing && (
                                            <div className={`absolute -top-9 pb-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 z-20 ${isOwn ? 'right-0' : 'left-0'}`}>
                                                {['❤️', '👍', '😂', '😮', '😢'].map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => handleReact(message, emoji)}
                                                        className="w-7 h-7 rounded-full flex items-center justify-center text-sm transition-transform hover:scale-125 active:scale-110"
                                                        style={{
                                                            background: 'var(--color-surface)',
                                                            border: '1px solid var(--color-border)',
                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
                                                        }}
                                                        aria-label={`React ${emoji}`}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Reply + React hover buttons for received messages (no dropdown for these) */}
                                        {!isOwn && !isDeleted && !isEditing && (
                                            <>
                                                <button
                                                    onClick={() => { setReplyTo(message); inputRef.current?.focus(); }}
                                                    className="absolute top-1 -right-16 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10 bg-card text-muted-foreground"
                                                    style={{
                                                        border: '1px solid var(--color-border)',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                                    }}
                                                    aria-label="Reply"
                                                    title="Reply"
                                                >
                                                    <CornerUpLeft size={12} />
                                                </button>
                                                <button
                                                    onClick={() => setEmojiPickerMsgId(emojiPickerMsgId === message.id ? null : message.id)}
                                                    className="absolute top-1 -right-24 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10 bg-card text-muted-foreground"
                                                    style={{
                                                        border: '1px solid var(--color-border)',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                                    }}
                                                    aria-label="React"
                                                    title="React"
                                                >
                                                    <Smile size={12} />
                                                </button>
                                            </>
                                        )}

                                        {/* Copy button for received messages */}
                                        {!isOwn && !isDeleted && !isEditing && (
                                            <button
                                                onClick={() => handleCopy(message)}
                                                className="absolute top-1 -right-8 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10 bg-card"
                                                style={{
                                                    color: copiedId === message.id ? '#41bd78' : 'var(--color-muted-text)',
                                                    border: '1px solid var(--color-border)',
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                                }}
                                                aria-label="Copy message"
                                                title="Copy"
                                            >
                                                {copiedId === message.id ? <Check size={12} /> : <Copy size={12} />}
                                            </button>
                                        )}

                                        {/* Hover action button */}
                                        {canActOn && !isEditing && (
                                            <button
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => { e.stopPropagation(); setActionMenuId(actionMenuId === message.id ? null : message.id); }}
                                                className="absolute top-1 -left-9 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                                style={{
                                                    zIndex: 60,
                                                    pointerEvents: 'auto',
                                                    backgroundColor: 'var(--color-surface)',
                                                    color: 'var(--color-muted-text)',
                                                    border: '1px solid var(--color-border)',
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                                }}
                                                aria-label="Message actions"
                                            >
                                                <MoreVertical size={13} />
                                            </button>
                                        )}

                                        {/* Dropdown */}
                                        {canActOn && actionMenuId === message.id && (
                                            <div
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute z-30 right-0 top-9 rounded-2xl shadow-2xl overflow-hidden"
                                                style={{
                                                    zIndex: 70,
                                                    pointerEvents: 'auto',
                                                    backgroundColor: 'var(--color-surface)',
                                                    border: '1px solid var(--color-border)',
                                                    minWidth: '140px',
                                                    backdropFilter: 'blur(12px)',
                                                    animation: 'dropdownIn 0.15s ease-out',
                                                }}
                                            >
                                                {/* Reply — available for own messages too */}
                                                {!isDeleted && (
                                                    <button
                                                        onClick={() => { setActionMenuId(null); setReplyTo(message); inputRef.current?.focus(); }}
                                                        className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm transition-colors text-foreground"
                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <CornerUpLeft size={14} /> Reply
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleCopy(message)}
                                                    className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm transition-colors"
                                                    style={{ color: copiedId === message.id ? '#41bd78' : 'var(--color-primary-text)' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <Copy size={14} /> {copiedId === message.id ? 'Copied!' : 'Copy'}
                                                </button>
                                                {!isDeleted && (
                                                    <button
                                                        onClick={() => { setActionMenuId(null); setEmojiPickerMsgId(emojiPickerMsgId === message.id ? null : message.id); }}
                                                        className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm transition-colors text-foreground"
                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <Smile size={14} /> React
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => startEdit(message)}
                                                    className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm transition-colors text-foreground"
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <Edit2 size={14} /> Edit
                                                </button>
                                                {pendingDelete?.id === message.id ? (
                                                    <div
                                                        className="px-3 py-2.5 border-t border-border"
                                                    >
                                                        <p className="text-[11px] mb-2 font-medium text-muted-foreground">
                                                            {pendingDelete.forEveryone ? 'Delete for everyone?' : 'Delete for yourself?'}
                                                        </p>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => pendingDelete.forEveryone ? handleDeleteForEveryone(message) : handleDelete(message)}
                                                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white"
                                                                style={{ background: '#e06661' }}
                                                            >
                                                                Delete
                                                            </button>
                                                            <button
                                                                onClick={() => setPendingDelete(null)}
                                                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-foreground"
                                                                style={{ background: 'var(--color-surface-hover)' }}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => setPendingDelete({ id: message.id, forEveryone: false })}
                                                            className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm transition-colors"
                                                            style={{ color: '#e06661' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(224,102,97,0.07)'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                        {(() => {
                                                            const createdAt = message.created_at ? new Date(message.created_at) : null;
                                                            const withinWindow = createdAt && (Date.now() - createdAt.getTime()) < 15 * 60 * 1000;
                                                            if (!withinWindow) return null;
                                                            return (
                                                                <button
                                                                    onClick={() => setPendingDelete({ id: message.id, forEveryone: true })}
                                                                    className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm transition-colors border-t border-border"
                                                                    style={{ color: '#e06661' }}
                                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(224,102,97,0.07)'}
                                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                >
                                                                    <Trash2 size={14} /> Delete for everyone
                                                                </button>
                                                            );
                                                        })()}
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* Bubble */}
                                        <div
                                            className="px-3.5 py-2.5 transition-transform duration-100 active:scale-[0.98]"
                                            title={message.created_at ? new Date(message.created_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : undefined}
                                            style={{
                                                background: isDeleted
                                                    ? 'var(--color-surface-hover)'
                                                    : isOwn
                                                        ? 'linear-gradient(135deg, #6672e0 0%, #7c3aed 100%)'
                                                        : 'var(--color-surface)',
                                                color: isDeleted
                                                    ? 'var(--color-muted-text)'
                                                    : isOwn ? '#fff' : 'var(--color-primary-text)',
                                                borderRadius: isOwn ? ownRadius : otherRadius,
                                                boxShadow: isDeleted
                                                    ? 'none'
                                                    : isOwn
                                                        ? '0 4px 14px rgba(102,114,224,0.35), 0 1px 3px rgba(0,0,0,0.1)'
                                                        : '0 1px 4px rgba(0,0,0,0.08)',
                                                opacity: message._optimistic ? 0.72 : 1,
                                                fontStyle: isDeleted ? 'italic' : 'normal',
                                                border: isOwn ? 'none' : '1px solid var(--color-border)',
                                            }}
                                        >
                                            {isEditing ? (
                                                <div className="flex flex-col gap-2 min-w-[180px]">
                                                    <textarea
                                                        value={editDraft}
                                                        onChange={(e) => setEditDraft(e.target.value)}
                                                        className="w-full px-2 py-1 rounded-lg text-sm resize-none focus:outline-none"
                                                        style={{
                                                            backgroundColor: 'rgba(255,255,255,0.15)',
                                                            color: isOwn ? '#fff' : 'var(--color-primary-text)',
                                                            border: '1px solid rgba(255,255,255,0.25)',
                                                            minHeight: '40px',
                                                        }}
                                                        rows={2}
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(message); }
                                                            else if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={cancelEdit} className="p-1.5 rounded-lg hover:opacity-80" aria-label="Cancel"><X size={13} /></button>
                                                        <button onClick={() => saveEdit(message)} className="p-1.5 rounded-lg hover:opacity-80" aria-label="Save"><Check size={13} /></button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Reply-to quote block */}
                                                    {message.reply_to && !isDeleted && (
                                                        <div
                                                            className="mb-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer"
                                                            style={{
                                                                background: isOwn
                                                                    ? 'rgba(255,255,255,0.15)'
                                                                    : 'rgba(102,114,224,0.08)',
                                                                borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.6)' : '#6672e0'}`,
                                                                maxWidth: '260px',
                                                            }}
                                                            onClick={() => {
                                                                // scroll to the original message
                                                                const el = document.getElementById(`msg-${message.reply_to.id}`);
                                                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            }}
                                                        >
                                                            <p className="text-[10px] font-semibold leading-tight truncate"
                                                                style={{ color: isOwn ? 'rgba(255,255,255,0.85)' : '#6672e0' }}>
                                                                {message.reply_to.sender_username}
                                                            </p>
                                                            <p className="text-[11px] leading-snug truncate mt-0.5"
                                                                style={{
                                                                    color: isOwn ? 'rgba(255,255,255,0.75)' : 'var(--color-muted-text)',
                                                                    fontStyle: message.reply_to.content === '[deleted]' ? 'italic' : 'normal',
                                                                }}>
                                                                {message.reply_to.content === '[deleted]' ? '🚫 Deleted message' : message.reply_to.content}
                                                            </p>
                                                        </div>
                                                    )}
                                                    <p className="break-words text-sm leading-relaxed">{message.content}</p>
                                                </>
                                            )}
                                        </div>

                                        {/* Timestamp row — last of group only */}
                                        {isLastInGroup && !isEditing && (
                                            <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {message.time_ago && message.time_ago !== 'null'
                                                        ? message.time_ago
                                                        : message.created_at
                                                            ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                            : ''}
                                                    {message.is_edited && !isDeleted && <span className="italic"> · edited</span>}
                                                </p>
                                                {isOwn && (
                                                    message._optimistic
                                                        ? <Clock size={11} style={{ flexShrink: 0 }} className="text-muted-foreground" title="Pending" />
                                                        : message.is_read
                                                            ? <CheckCheck size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} title="Seen" />
                                                            : <Check size={11} style={{ flexShrink: 0 }} className="text-muted-foreground" title="Sent" />
                                                )}
                                            </div>
                                        )}

                                        {/* Reaction bar */}
                                        {!isEditing && !isDeleted && (message.reactions || []).length > 0 && (
                                            <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                                {(message.reactions || []).map(r => (
                                                    <button
                                                        key={r.emoji}
                                                        onClick={() => handleReact(message, r.emoji)}
                                                        className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition-all hover:scale-110 active:scale-95"
                                                        style={{
                                                            background: r.reacted_by_me ? 'rgba(102,114,224,0.15)' : 'var(--color-surface)',
                                                            borderColor: r.reacted_by_me ? '#6672e0' : 'var(--color-border)',
                                                            color: r.reacted_by_me ? '#6672e0' : 'var(--color-muted-text)',
                                                        }}
                                                    >
                                                        <span>{r.emoji}</span>
                                                        <span className="font-medium ml-0.5">{r.count}</span>
                                                    </button>
                                                ))}
                                                {/* Add reaction button */}
                                                <button
                                                    onClick={() => setEmojiPickerMsgId(emojiPickerMsgId === message.id ? null : message.id)}
                                                    className="px-2 py-0.5 rounded-full text-xs border border-border transition-all hover:scale-110 active:scale-95 flex items-center text-muted-foreground"
                                                    style={{ background: 'var(--color-surface)' }}
                                                    title="Add reaction"
                                                >
                                                    <Smile size={11} />
                                                </button>
                                            </div>
                                        )}
                                        {/* Floating emoji picker */}
                                        {!isDeleted && emojiPickerMsgId === message.id && (
                                            <div
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => e.stopPropagation()}
                                                className={`absolute z-30 flex gap-1 p-2 rounded-2xl shadow-xl border bottom-full mb-1 ${isOwn ? 'right-0' : 'left-0'}`}
                                                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', zIndex: 70, pointerEvents: 'auto' }}
                                            >
                                                {REACTION_EMOJIS.map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => handleReact(message, emoji)}
                                                        className="text-xl hover:scale-125 transition-transform p-1 rounded-lg"
                                                        style={{ lineHeight: 1 }}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>

                {isTyping && (
                    <div className="flex justify-start mt-4">
                        <div className="w-8 flex-shrink-0 mr-2.5 flex items-end pb-0.5">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                style={{ background: getGradientFromUsername(otherUser?.username || '?') }}
                            >
                                {otherUser?.username?.[0]?.toUpperCase() || '?'}
                            </div>
                        </div>
                        <div
                            className="px-4 py-3"
                            style={{
                                background: 'var(--color-surface)',
                                borderRadius: '20px 20px 20px 5px',
                                border: '1px solid var(--color-border)',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                display: 'flex',
                                gap: '5px',
                                alignItems: 'center',
                            }}
                        >
                            <span className="typing-dot" style={{ animation: 'typingBounce 1.4s infinite' }} />
                            <span className="typing-dot" style={{ animation: 'typingBounce 1.4s infinite 0.2s' }} />
                            <span className="typing-dot" style={{ animation: 'typingBounce 1.4s infinite 0.4s' }} />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Dock */}
            <div
                className="flex-shrink-0 px-4 pb-4 pt-3 relative"
                style={{
                    background: 'var(--color-surface)',
                    borderTop: '1px solid var(--color-border)',
                    boxShadow: '0 -8px 24px -4px rgba(0,0,0,0.06)',
                }}
            >
                {/* Top gradient line when focused */}
                {isInputFocused && (
                    <span
                        aria-hidden
                        className="absolute top-0 left-8 right-8 h-px transition-opacity"
                        style={{ background: 'linear-gradient(90deg, transparent, #6672e0 40%, #9180e8 60%, transparent)' }}
                    />
                )}
                {/* Reply-to preview bar */}
                {replyTo && (
                    <div
                        className="flex items-center gap-2.5 px-3 py-2 mb-2 rounded-xl"
                        style={{
                            background: 'rgba(102,114,224,0.08)',
                            border: '1px solid rgba(102,114,224,0.2)',
                            animation: 'dropdownIn 0.15s ease-out',
                        }}
                    >
                        <CornerUpLeft size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--primary)' }}>
                                {replyTo.sender_id === user?.id ? 'You' : otherUser?.username}
                            </p>
                            <p className="text-xs truncate leading-snug text-muted-foreground" style={{ fontStyle: replyTo.is_deleted ? 'italic' : 'normal' }}>
                                {replyTo.is_deleted ? '[deleted]' : replyTo.content}
                            </p>
                        </div>
                        <button
                            onClick={() => setReplyTo(null)}
                            className="p-1 rounded-full flex-shrink-0 transition-colors text-muted-foreground"
                            aria-label="Cancel reply"
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <X size={13} />
                        </button>
                    </div>
                )}

                {/* Compose card */}
                <div
                    className="rounded-2xl overflow-hidden transition-all duration-200"
                    style={{
                        border: `1px solid ${isInputFocused ? 'rgba(102,114,224,0.5)' : 'var(--color-border)'}`,
                        boxShadow: isInputFocused
                            ? '0 0 0 3px rgba(102,114,224,0.1), 0 4px 20px rgba(102,114,224,0.12)'
                            : '0 1px 3px rgba(0,0,0,0.06)',
                        background: 'var(--color-surface-hover)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {/* Textarea */}
                    <div className="px-4 pt-3 pb-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => { setInput(e.target.value); emitTyping(); }}
                            onKeyDown={handleKeyPress}
                            onFocus={() => setIsInputFocused(true)}
                            onBlur={() => setIsInputFocused(false)}
                            placeholder="Write a message…"
                            className="w-full resize-none text-sm focus:outline-none bg-transparent custom-scrollbar text-foreground"
                            rows={1}
                            style={{
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                minHeight: '22px',
                                maxHeight: '120px',
                                lineHeight: '1.6',
                                padding: 0,
                                margin: 0,
                            }}
                            disabled={sending}
                        />
                    </div>

                    {/* Bottom toolbar row */}
                    <div className="flex items-center justify-between px-2 py-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
                        <div className="flex items-center gap-0.5">
                            <button
                                className="p-2 rounded-xl transition-colors text-muted-foreground"
                                title="Emoji"
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; e.currentTarget.style.color = '#e0a050'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-muted-text)'; }}
                            >
                                <Smile size={18} />
                            </button>
                            <button
                                className="p-2 rounded-xl transition-colors text-muted-foreground"
                                title="Attach file"
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; e.currentTarget.style.color = '#6672e0'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-muted-text)'; }}
                            >
                                <Paperclip size={18} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            {input.length > 9000 && (
                                <span
                                    className="text-[11px] font-medium tabular-nums transition-colors"
                                    style={{
                                        color: input.length > 9900 ? '#e06661' : input.length > 9500 ? '#e0a050' : 'var(--color-muted-text)',
                                    }}
                                >
                                    {10000 - input.length}
                                </span>
                            )}
                            <button
                                onClick={handleSendMessage}
                                disabled={!input.trim() || sending}
                                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all duration-200"
                                style={{
                                    background: input.trim() && !sending
                                        ? 'linear-gradient(135deg, #6672e0 0%, #7c3aed 100%)'
                                        : 'var(--color-border)',
                                    boxShadow: input.trim() && !sending
                                        ? '0 4px 16px rgba(102,114,224,0.45)'
                                        : 'none',
                                    cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
                                    opacity: input.trim() && !sending ? 1 : 0.4,
                                    transform: sending ? 'scale(0.88)' : input.trim() ? 'scale(1.05)' : 'scale(1)',
                                }}
                            >
                                {sending ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-3 mt-1.5">
                    <span className="text-[10px] text-muted-foreground" style={{ opacity: 0.6 }}>
                        <kbd className="font-mono">Enter</kbd> send · <kbd className="font-mono">Shift+Enter</kbd> newline
                    </span>
                </div>
            </div>

            {/* Scroll-to-bottom FAB */}
            {showScrollBtn && (
                <button
                    onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    className="absolute bottom-24 right-5 w-10 h-10 rounded-full flex items-center justify-center text-white transition-all duration-200 z-20 hover:scale-110 active:scale-95"
                    style={{
                        background: 'linear-gradient(135deg, #6672e0, #9180e8)',
                        boxShadow: '0 4px 18px rgba(102,114,224,0.5)',
                        animation: 'fabIn 0.2s ease-out',
                        position: 'absolute',
                    }}
                    aria-label="Scroll to latest message"
                >
                    <ChevronDown size={20} />
                    {(() => {
                        const cnt = messages.filter(m => m.sender_id !== user?.id && !m.is_read).length;
                        if (!cnt) return null;
                        return (
                            <span
                                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full text-[9px] font-bold flex items-center justify-center px-1"
                                style={{ background: '#e06661', color: '#fff', boxShadow: '0 2px 6px rgba(224,102,97,0.5)' }}
                            >
                                {cnt > 9 ? '9+' : cnt}
                            </span>
                        );
                    })()}
                </button>
            )}

            </div>{/* end main chat column */}

            {/* ── RIGHT INFO PANEL ── */}
            {showInfoPanel && (
                <div
                    className="w-72 flex-shrink-0 flex flex-col overflow-y-auto custom-scrollbar"
                    style={{
                        borderLeft: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        animation: 'panelSlideIn 0.22s ease-out',
                    }}
                >
                    {/* Hero banner */}
                    <div className="relative shrink-0">
                        <div
                            className="h-28 w-full"
                            style={{ background: getGradientFromUsername(otherUser?.username || '') }}
                        />
                        {/* Fade into surface */}
                        <div
                            className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
                            style={{ background: 'linear-gradient(to bottom, transparent, var(--color-surface))' }}
                        />
                        {/* Close */}
                        <button
                            onPointerDown={(e) => { console.log('info close pointerdown'); e.stopPropagation(); }}
                            onMouseDown={(e) => { console.log('info close mousedown'); e.stopPropagation(); }}
                            onClick={(e) => { console.log('info close click'); e.stopPropagation(); setShowInfoPanel(false); }}
                            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all"
                            style={{ background: 'rgba(0,0,0,0.35)', color: '#fff', zIndex: 80, pointerEvents: 'auto' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.6)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.35)'; }}
                        >
                            <X size={13} />
                        </button>
                        {/* Avatar floating over banner */}
                        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                            <div className="relative">
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white select-none"
                                    style={{
                                        background: getGradientFromUsername(otherUser?.username || ''),
                                        boxShadow: '0 0 0 4px var(--color-surface), 0 8px 24px rgba(0,0,0,0.25)',
                                    }}
                                >
                                    {otherUser?.username?.[0]?.toUpperCase() || '?'}
                                </div>
                                {otherUser?.isOnline && (
                                    <span
                                        className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
                                        style={{ backgroundColor: '#41bd78', borderColor: 'var(--color-surface)', boxShadow: '0 0 8px rgba(65,189,120,0.7)' }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Name + status + CTA */}
                    <div className="pt-12 pb-6 px-6 text-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <h3
                            className="font-bold text-lg mb-1 tracking-tight"
                            style={{
                                background: 'linear-gradient(135deg, var(--color-primary-text) 40%, #6672e0 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            }}
                        >
                            {otherUser?.username}
                        </h3>
                        <div
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-5"
                            style={{
                                background: otherUser?.isOnline ? 'rgba(65,189,120,0.1)' : 'var(--color-surface-hover)',
                                color: otherUser?.isOnline ? '#41bd78' : 'var(--color-muted-text)',
                                border: `1px solid ${otherUser?.isOnline ? 'rgba(65,189,120,0.25)' : 'var(--color-border)'}`,
                            }}
                        >
                            <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                    backgroundColor: otherUser?.isOnline ? '#41bd78' : '#6b7280',
                                    animation: otherUser?.isOnline ? 'statusBlink 2s ease-in-out infinite' : 'none',
                                }}
                            />
                            {otherUser?.isOnline
                                ? 'Active now'
                                : otherUser?.last_seen_at
                                    ? formatLastSeen(otherUser.last_seen_at)
                                    : 'Offline'}
                        </div>
                        <a
                            href={`/profile/${otherUser?.username}`}
                            className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-all duration-200"
                            style={{
                                background: 'linear-gradient(135deg, #6672e0, #7c3aed)',
                                color: '#fff',
                                boxShadow: '0 4px 16px rgba(102,114,224,0.35)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 22px rgba(102,114,224,0.5)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(102,114,224,0.35)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                            View full profile
                        </a>
                    </div>

                    {/* Actions */}
                    <div className="p-4 space-y-1.5">
                        <button
                            className="w-full px-4 py-3 rounded-2xl text-left flex items-center gap-3.5 transition-all duration-150"
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            <span
                                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(102,114,224,0.12)', color: '#6672e0' }}
                            >
                                <BellOff size={16} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-medium leading-none mb-0.5 text-foreground">Mute notifications</p>
                                <p className="text-xs text-muted-foreground">Hide alerts for this chat</p>
                            </div>
                        </button>
                        <button
                            className="w-full px-4 py-3 rounded-2xl text-left flex items-center gap-3.5 transition-all duration-150"
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(224,102,97,0.06)'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            <span
                                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(224,102,97,0.1)', color: '#e06661' }}
                            >
                                <ShieldOff size={16} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-medium leading-none mb-0.5" style={{ color: '#e06661' }}>Block or report</p>
                                <p className="text-xs" style={{ color: 'rgba(224,102,97,0.65)' }}>Restrict this user</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes chatShimmer {
                    0%   { background-position: -400px 0; }
                    100% { background-position:  400px 0; }
                }
                .chat-shimmer {
                    background: linear-gradient(
                        90deg,
                        var(--color-surface-hover) 0%,
                        rgba(255,255,255,0.08) 50%,
                        var(--color-surface-hover) 100%
                    );
                    background-size: 400px 100%;
                    animation: chatShimmer 1.6s linear infinite;
                }

                @keyframes msgIn {
                    from { opacity: 0; transform: translateY(8px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes dropdownIn {
                    from { opacity: 0; transform: translateY(-6px) scale(0.96); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes typingBounce {
                    0%, 60%, 100% { opacity: 0.45; transform: translateY(0); }
                    30%           { opacity: 1;    transform: translateY(-6px); }
                }
                @keyframes onlinePulseRing {
                    0%   { transform: scale(1);   opacity: 0.6; }
                    70%  { transform: scale(1.35); opacity: 0; }
                    100% { transform: scale(1.35); opacity: 0; }
                }
                @keyframes statusBlink {
                    0%, 100% { opacity: 1; }
                    50%      { opacity: 0.4; }
                }
                @keyframes panelSlideIn {
                    from { opacity: 0; transform: translateX(24px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes fabIn {
                    from { opacity: 0; transform: translateY(10px) scale(0.85); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes emptyAvatarPulse {
                    0%, 100% { transform: scale(1.35); opacity: 0.18; }
                    50%      { transform: scale(1.55); opacity: 0.08; }
                }
                @keyframes emptyPulse {
                    0%, 100% { transform: scale(1);   opacity: 0.5; }
                    50%       { transform: scale(1.12); opacity: 0.25; }
                }
                .typing-dot {
                    display: inline-block;
                    width: 7px; height: 7px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6672e0, #9180e8);
                }
                textarea::-webkit-scrollbar { width: 4px; }
                textarea::-webkit-scrollbar-track { background: transparent; }
                textarea::-webkit-scrollbar-thumb { background: rgba(102,114,224,0.3); border-radius: 2px; }
            `}</style>
        </div>
    );
}
