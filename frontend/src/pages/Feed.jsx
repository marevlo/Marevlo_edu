import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Zap, Newspaper, Image, Calendar, PenTool, X, Users, Sparkles, Flame,
    Clock, CheckCircle2, AlertCircle, Info
} from 'lucide-react';
import FeedPost from '../components/feed/FeedPost';
import CreatePostWidget from '../components/feed/CreatePostWidget';
import TrendingProblems from '../components/TrendingProblems';
import MessengerWidget from '../components/feed/MessengerWidget';

const INITIAL_POSTS = [];
const API_BASE = import.meta.env.VITE_API_URL;

// Pointer-tilt is a fine-pointer, motion-OK enhancement only. On touch devices
// or when the user prefers reduced motion we render a plain static wrapper.
const TILT_ENABLED = typeof window !== 'undefined'
    && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function TiltCard({ children, intensity = 10 }) {
    const cardRef = useRef(null);
    const glareRef = useRef(null);
    const [hovered, setHovered] = useState(false);
    const [transform, setTransform] = useState('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');

    if (!TILT_ENABLED) {
        return <div className="relative">{children}</div>;
    }

    const handleMouseMove = (e) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -intensity;
        const rotateY = ((x - centerX) / centerX) * intensity;

        setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`);

        if (glareRef.current) {
            glareRef.current.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.15) 0%, transparent 60%)`;
        }
    };

    const handleMouseLeave = () => {
        setHovered(false);
        setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
    };

    return (
        <div
            ref={cardRef}
            className="relative transition-all duration-300"
            style={{
                transform: transform,
                transition: hovered ? 'transform 0.1s ease-out' : 'all 0.5s ease',
                transformStyle: 'preserve-3d',
                willChange: 'transform',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <div
                ref={glareRef}
                className="absolute inset-0 pointer-events-none rounded-2xl transition-opacity duration-300 z-50"
                style={{ opacity: hovered ? 1 : 0 }}
            />
            {children}
        </div>
    );
}

export default function Feed() {
    const token = localStorage.getItem('access_token');
    const [posts, setPosts] = useState(INITIAL_POSTS);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('latest');
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    // Article Modal State
    const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
    const [articleTitle, setArticleTitle] = useState("");
    const [articleContent, setArticleContent] = useState("");
    const [articleImage, setArticleImage] = useState(null);
    const articleFileInputRef = useRef(null);

    // Event Modal State
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [eventTitle, setEventTitle] = useState("");
    const [eventDate, setEventDate] = useState("");
    const [eventLocation, setEventLocation] = useState("");
    const [eventDescription, setEventDescription] = useState("");

    const showToast = useCallback((message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false }), 3000);
    }, []);

    const fetchPosts = useCallback(async () => {
        if (!token) { setLoading(false); return; }
        setLoading(true);
        try {
            const response = await fetch(
                `${API_BASE}/feed/posts?sort=${sortBy}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            if (!response.ok) {
                throw new Error('Failed to load feed');
            }
            const data = await response.json();
            setPosts(data.posts || []);
        } catch (err) {
            console.error(err);
            showToast('Failed to load feed', 'error');
        } finally {
            setLoading(false);
        }
    }, [sortBy, token, showToast]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // Close any open modal on Escape (standard dialog behavior)
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setIsArticleModalOpen(false);
                setIsEventModalOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const createPost = useCallback(async (payload, successMessage) => {
        if (!token) {
            showToast('Please login to post', 'error');
            return null;
        }
        try {
            const response = await fetch(
                `${API_BASE}/feed/posts`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }
            );
            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                throw new Error(errBody.detail || 'Failed to create post');
            }
            const created = await response.json();
            setPosts(prev => [created, ...prev]);
            showToast(successMessage, 'success');
            return created;
        } catch (err) {
            console.error(err);
            showToast(err.message || 'Failed to create post', 'error');
            return null;
        }
    }, [token, showToast]);

    const handleCreatePost = async (postData) => {
        await createPost(
            {
                content: postData.content,
                image_object_keys: postData.imageObjectKeys || [],
                type: 'post'
            },
            'Post shared!'
        );
    };

    const handleLike = async (postId) => {
        if (!token) return;
        try {
            const response = await fetch(
                `${API_BASE}/feed/posts/${postId}/like`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                }
            );
            if (!response.ok) throw new Error('Failed to like post');
            const data = await response.json();
            setPosts(prev => prev.map(post =>
                post.id === postId
                    ? { ...post, likes: data.likes, dislikes: data.dislikes ?? post.dislikes, likedByMe: data.likedByMe, dislikedByMe: data.dislikedByMe ?? false }
                    : post
            ));
        } catch (err) {
            console.error(err);
            showToast('Failed to like post', 'error');
        }
    };

    const handleDislike = async (postId) => {
        if (!token) return;
        try {
            const response = await fetch(
                `${API_BASE}/feed/posts/${postId}/dislike`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                }
            );
            if (!response.ok) throw new Error('Failed to dislike post');
            const data = await response.json();
            setPosts(prev => prev.map(post =>
                post.id === postId
                    ? { ...post, likes: data.likes, dislikes: data.dislikes, likedByMe: data.likedByMe ?? false, dislikedByMe: data.dislikedByMe }
                    : post
            ));
        } catch (err) {
            console.error(err);
            showToast('Failed to dislike post', 'error');
        }
    };

    const handleDeletePost = async (postId) => {
        if (!token) return;
        try {
            const response = await fetch(
                `${API_BASE}/feed/posts/${postId}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            if (!response.ok) {
                throw new Error('Failed to delete post');
            }
            setPosts(prev => prev.filter(p => p.id !== postId));
            showToast('Post deleted', 'info');
        } catch (err) {
            console.error(err);
            showToast('Failed to delete post', 'error');
        }
    };

    const handleRepost = async (post) => {
        const repost = await createPost(
            {
                content: `Reposted: ${post.content}`,
                type: 'repost'
            },
            'Reposted!'
        );
        if (repost) {
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, reposts: (p.reposts || 0) + 1 } : p));
        }
    };

    const handleFollowToggle = async (postAuthorUsername, isCurrentlyFollowing) => {
        if (!token) return;
        try {
            // Search for user ID
            const searchRes = await fetch(`${API_BASE}/chat/users/search?q=${postAuthorUsername}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!searchRes.ok) throw new Error('Failed to search user');
            const users = await searchRes.json();
            const targetUser = users.find(u => u.username === postAuthorUsername);
            if (!targetUser) {
                console.error('User not found:', postAuthorUsername);
                return;
            }

            const method = isCurrentlyFollowing ? 'DELETE' : 'POST';
            const followRes = await fetch(`${API_BASE}/chat/users/${targetUser.id}/follow`, {
                method,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!followRes.ok) throw new Error('Failed to toggle follow');

            // Update local state
            setPosts(prev => prev.map(p =>
                p.author === postAuthorUsername
                    ? { ...p, isFollowing: !isCurrentlyFollowing }
                    : p
            ));
            showToast(isCurrentlyFollowing ? 'Unfollowed' : 'Following', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to toggle follow', 'error');
        }
    };

    const handleAddComment = async (postId, commentText) => {
        if (!token) return;
        try {
            const response = await fetch(
                `${API_BASE}/feed/posts/${postId}/comments`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ content: commentText })
                }
            );
            if (!response.ok) {
                throw new Error('Failed to add comment');
            }
            const comment = await response.json();
            setPosts(prev => prev.map(post => {
                if (post.id === postId) {
                    return {
                        ...post,
                        comments: (post.comments || 0) + 1,
                        commentsList: [
                            ...(post.commentsList || []),
                            comment
                        ]
                    };
                }
                return post;
            }));
        } catch (err) {
            console.error(err);
            showToast('Failed to add comment', 'error');
        }
    };

    const handleImageSelect = (e, setImgState) => {
        const file = e.target.files[0];
        if (file) setImgState(URL.createObjectURL(file));
    };

    const handlePublishArticle = async () => {
        if (!articleTitle.trim() || !articleContent.trim()) { showToast('Please fill in title and content', 'error'); return; }
        const created = await createPost(
            {
                type: 'article',
                title: articleTitle,
                content: articleContent,
                image: articleImage
            },
            'Article published!'
        );
        if (created) {
            setArticleTitle("");
            setArticleContent("");
            setArticleImage(null);
            setIsArticleModalOpen(false);
        }
    };

    const handleCreateEvent = async () => {
        if (!eventTitle.trim() || !eventDate.trim()) { showToast('Please fill in title and date', 'error'); return; }
        const created = await createPost(
            {
                type: 'event',
                title: eventTitle,
                content: eventDescription,
                event_date: eventDate,
                event_location: eventLocation
            },
            'Event created!'
        );
        if (created) {
            setEventTitle("");
            setEventDate("");
            setEventLocation("");
            setEventDescription("");
            setIsEventModalOpen(false);
        }
    };

    return (
        <div
            className="flex-1 h-full w-full overflow-y-auto custom-scrollbar text-foreground"
            style={{
                backgroundColor: 'var(--color-app-bg)',
                transition: 'background-color 0.3s ease'
            }}
        >
            {/* Animated ambient background orbs */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="feed-orb feed-orb-1" />
                <div className="feed-orb feed-orb-2" />
                <div className="feed-orb feed-orb-3" />
            </div>

            <div className="relative z-10 py-6 sm:py-8 mx-auto w-[92%] sm:w-[88%] lg:w-[78%] max-w-[1180px]">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">

                    {/* LEFT COLUMN */}
                    <div className="space-y-5">

                        {/* Gradient Hero Header */}
                        <TiltCard>
                            <div className="relative rounded-2xl overflow-hidden p-6 sm:p-7 h-full" style={{
                                background: 'linear-gradient(135deg, #6672e0 0%, #3fa9c9 100%)',
                                boxShadow: '0 8px 32px rgba(102,114,224,0.35)'
                            }}>
                                {/* Decorative shapes */}
                                <div style={{
                                    position: 'absolute', top: '-30px', right: '-30px',
                                    width: '160px', height: '160px',
                                    borderRadius: '50%', opacity: 0.2,
                                    background: 'rgba(255,255,255,0.3)'
                                }} />
                                <div style={{
                                    position: 'absolute', bottom: '-20px', left: '30%',
                                    width: '80px', height: '80px',
                                    borderRadius: '50%', opacity: 0.15,
                                    background: 'rgba(255,255,255,0.4)'
                                }} />
                                <div className="relative z-10 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Sparkles size={16} style={{ color: 'rgba(255,255,255,0.85)' }} />
                                            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                                Marevlo Community
                                            </span>
                                        </div>
                                        <h1 className="text-2xl sm:text-3xl font-extrabold text-white" style={{ letterSpacing: '-0.03em', lineHeight: 1.15 }}>
                                            Your Feed
                                        </h1>
                                        <p style={{ color: 'rgba(255,255,255,0.75)', marginTop: '4px', fontSize: '0.9rem' }}>
                                            Share ideas, connect with peers &amp; inspire the community
                                        </p>
                                    </div>
                                    <div className="hidden sm:flex items-center justify-center"
                                        style={{
                                            width: 64, height: 64, borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.2)',
                                            border: '2px solid rgba(255,255,255,0.3)',
                                            backdropFilter: 'blur(8px)'
                                        }}>
                                        <Zap size={28} style={{ color: '#fff' }} />
                                    </div>
                                </div>
                            </div>
                        </TiltCard>

                        {/* Create Post Widget */}
                        <div className="transition-all duration-300 hover:shadow-xl" style={{ borderRadius: '1rem' }}>
                            <CreatePostWidget
                                onPost={handleCreatePost}
                                onOpenEventModal={() => setIsEventModalOpen(true)}
                                onOpenArticleModal={() => setIsArticleModalOpen(true)}
                            />
                        </div>

                        {/* Feed Controls */}
                        <div className="flex items-center justify-between px-1 flex-wrap gap-3">
                            <div className="flex items-center gap-2">
                                <div style={{
                                    width: 3, height: 18, borderRadius: 999,
                                    background: 'linear-gradient(180deg, #6672e0, #3fa9c9)'
                                }} />
                                <h6 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                    Recent Posts
                                </h6>
                            </div>

                            {/* Segmented sort control */}
                            <div role="tablist" aria-label="Sort posts" className="flex items-center gap-1 p-1 rounded-full" style={{
                                backgroundColor: 'var(--card)',
                                border: '1px solid var(--color-border)',
                                boxShadow: '0 2px 8px rgba(102,114,224,0.08)'
                            }}>
                                {[
                                    { key: 'latest', label: 'Latest', icon: Clock },
                                    { key: 'top', label: 'Trending', icon: Flame }
                                ].map((opt) => (
                                    <button
                                        key={opt.key}
                                        role="tab"
                                        aria-selected={sortBy === opt.key}
                                        onClick={() => setSortBy(opt.key)}
                                        className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                                        style={{
                                            background: sortBy === opt.key
                                                ? 'linear-gradient(135deg, #6672e0, #3fa9c9)'
                                                : 'transparent',
                                            color: sortBy === opt.key ? '#fff' : 'var(--muted-foreground)',
                                            boxShadow: sortBy === opt.key ? '0 2px 10px rgba(102,114,224,0.4)' : 'none',
                                            border: 'none',
                                        }}
                                    >
                                        <opt.icon size={14} />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Posts List */}
                        <div className="space-y-4">
                            {loading ? (
                                // Skeleton placeholders reserve layout space while the feed loads
                                [0, 1, 2].map(i => (
                                    <div key={i} className="bg-card border border-border rounded-2xl p-4 sm:p-5" aria-hidden="true">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-full feed-skel" />
                                            <div className="flex-1 space-y-2">
                                                <div className="h-3 w-1/3 rounded feed-skel" />
                                                <div className="h-2.5 w-1/4 rounded feed-skel" />
                                            </div>
                                        </div>
                                        <div className="mt-4 space-y-2">
                                            <div className="h-3 w-full rounded feed-skel" />
                                            <div className="h-3 w-5/6 rounded feed-skel" />
                                            <div className="h-3 w-2/3 rounded feed-skel" />
                                        </div>
                                    </div>
                                ))
                            ) : posts.length === 0 ? (
                                <div className="text-center py-16 sm:py-20 rounded-2xl" style={{
                                    border: '1px dashed var(--color-border)',
                                    background: 'linear-gradient(135deg, rgba(102,114,224,0.04) 0%, rgba(145,128,232,0.04) 100%)'
                                }}>
                                    {/* Icon row */}
                                    <div className="flex items-center justify-center gap-4 mb-5">
                                        {[
                                            { icon: <PenTool size={22} />, bg: 'linear-gradient(135deg,#6672e0,#3fa9c9)', shadow: 'rgba(102,114,224,0.4)' },
                                            { icon: <Newspaper size={30} />, bg: 'linear-gradient(135deg,#3fa9c9,#0ea5e9)', shadow: 'rgba(63,169,201,0.4)' },
                                            { icon: <Calendar size={22} />, bg: 'linear-gradient(135deg,#f43f5e,#b988d6)', shadow: 'rgba(244,63,94,0.4)' },
                                        ].map(({ icon, bg, shadow }, i) => (
                                            <div key={i} style={{
                                                width: i === 1 ? 68 : 48,
                                                height: i === 1 ? 68 : 48,
                                                borderRadius: '50%',
                                                background: bg,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff',
                                                boxShadow: `0 8px 20px ${shadow}`,
                                                transform: i === 0 ? 'rotate(-8deg) translateY(6px)' : i === 2 ? 'rotate(8deg) translateY(6px)' : 'none',
                                                transition: 'transform 0.3s'
                                            }}>
                                                {icon}
                                            </div>
                                        ))}
                                    </div>
                                    <h3 className="text-xl sm:text-2xl font-bold mb-2 text-foreground">
                                        Your feed is empty
                                    </h3>
                                    <p className="text-muted-foreground" style={{ maxWidth: 340, margin: '0 auto', fontSize: '0.9rem' }}>
                                        Be the first to share something amazing with the community!
                                    </p>
                                    <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
                                        <button
                                            onClick={() => setIsArticleModalOpen(true)}
                                            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 flex items-center justify-center gap-2"
                                            style={{
                                                background: 'linear-gradient(135deg, #6672e0, #3fa9c9)',
                                                boxShadow: '0 4px 16px rgba(102,114,224,0.4)'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                        >
                                            <PenTool size={16} /> Write Article
                                        </button>
                                        <button
                                            onClick={() => setIsEventModalOpen(true)}
                                            className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2"
                                            style={{
                                                background: 'linear-gradient(135deg, #f43f5e, #b988d6)',
                                                color: '#fff',
                                                boxShadow: '0 4px 16px rgba(244,63,94,0.35)'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                        >
                                            <Calendar size={16} /> Create Event
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // Order comes from the backend (?sort=) — don't re-sort/mutate state here
                                posts
                                    .map(post => (
                                        <div key={post.id}>
                                            <FeedPost
                                                post={{ ...post, onAddComment: handleAddComment }}
                                                onLike={handleLike}
                                                onDislike={handleDislike}
                                                onDelete={handleDeletePost}
                                                onRepost={handleRepost}
                                                onFollowToggle={handleFollowToggle}
                                            />
                                        </div>
                                    ))
                            )}
                        </div>
                    </div>

                    {/* RIGHT SIDEBAR */}
                    <aside className="hidden lg:flex flex-col gap-5 h-fit sticky top-24">

                        {/* Trending Problems Card */}
                        <TrendingProblems />

                        {/* Suggested People Card (Empty State for Backend) */}
                        <TiltCard>
                            <div className="rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl h-full bg-card" style={{
                                border: '1px solid var(--color-border)',
                            }}>
                                <div style={{ height: 4, background: 'linear-gradient(90deg, #6672e0, #3fa9c9)' }} />
                                <div className="p-5 sm:p-6">
                                    <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 30, height: 30, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #6672e0, #3fa9c9)',
                                            color: '#fff'
                                        }}>
                                            <Users size={15} />
                                        </span>
                                        <span className="text-foreground">People You May Know</span>
                                    </h3>
                                    <div className="text-center py-4 text-muted-foreground">
                                        <p className="text-xs italic">Sync suggestions will appear here soon.</p>
                                    </div>
                                </div>
                            </div>
                        </TiltCard>

                        {/* Quick Actions Card */}
                        <TiltCard>
                            <div className="rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl h-full bg-card" style={{
                                border: '1px solid var(--color-border)',
                            }}>
                                <div style={{ height: 4, background: 'linear-gradient(90deg, #6672e0, #3fa9c9)' }} />
                                <div className="p-5 sm:p-6">
                                    <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 30, height: 30, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #6672e0, #3fa9c9)',
                                            color: '#fff'
                                        }}>
                                            <Zap size={15} />
                                        </span>
                                        <span className="text-foreground">Quick Actions</span>
                                    </h3>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => setIsArticleModalOpen(true)}
                                            className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all duration-200"
                                            style={{ backgroundColor: 'rgba(102,114,224,0.1)', color: '#6672e0' }}
                                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(102,114,224,0.2)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(102,114,224,0.1)'; e.currentTarget.style.transform = 'translateX(0)'; }}
                                        >
                                            <PenTool size={16} /> Write an Article
                                        </button>
                                        <button
                                            onClick={() => setIsEventModalOpen(true)}
                                            className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all duration-200"
                                            style={{ backgroundColor: 'rgba(244,63,94,0.1)', color: '#f43f5e' }}
                                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(244,63,94,0.2)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(244,63,94,0.1)'; e.currentTarget.style.transform = 'translateX(0)'; }}
                                        >
                                            <Calendar size={16} /> Host an Event
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </TiltCard>

                        {/* Footer Links */}
                        <div className="flex flex-wrap gap-x-3 gap-y-2 text-[11px] px-2">
                            <Link
                                to="/about"
                                className="cursor-pointer hover:underline transition-colors duration-200 text-muted-foreground"
                            >
                                About
                            </Link>
                            <a
                                href="mailto:support@marevlo.com"
                                className="cursor-pointer hover:underline transition-colors duration-200 text-muted-foreground"
                            >
                                Help Center
                            </a>
                            <Link
                                to="/legal/privacy"
                                className="cursor-pointer hover:underline transition-colors duration-200 text-muted-foreground"
                            >
                                Privacy
                            </Link>
                            <Link
                                to="/legal/terms"
                                className="cursor-pointer hover:underline transition-colors duration-200 text-muted-foreground"
                            >
                                Terms
                            </Link>
                            <div className="text-[11px] text-muted-foreground" style={{ opacity: 0.6 }}>
                                © 2026 Marevlo
                            </div>
                        </div>
                    </aside>
                </div>
            </div>

            {/* TOAST NOTIFICATION */}
            {toast.show && (
                <div
                    role="status"
                    aria-live="polite"
                    className="fixed bottom-6 left-6 right-6 sm:right-auto sm:w-80 z-50"
                    style={{
                        background: toast.type === 'error'
                            ? 'linear-gradient(135deg,#e06661,#f43f5e)'
                            : toast.type === 'info'
                                ? 'linear-gradient(135deg,#5d8ede,#3fa9c9)'
                                : 'linear-gradient(135deg,#41bd78,#3fa9c9)',
                        color: '#fff',
                        borderRadius: '1rem',
                        padding: '1rem 1.25rem',
                        boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
                        animation: 'feedSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                        display: 'flex', alignItems: 'center', gap: '0.75rem'
                    }}
                >
                    {toast.type === 'error'
                        ? <AlertCircle size={20} className="shrink-0" />
                        : toast.type === 'info'
                            ? <Info size={20} className="shrink-0" />
                            : <CheckCircle2 size={20} className="shrink-0" />}
                    <p className="text-sm font-semibold">{toast.message}</p>
                </div>
            )}

            {/* WRITE ARTICLE MODAL */}
            {isArticleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={() => setIsArticleModalOpen(false)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="article-modal-title"
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] bg-card"
                        style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: '1.5rem',
                            animation: 'feedModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1)'
                        }}
                    >
                        {/* Modal header with gradient */}
                        <div style={{ height: 4, background: 'linear-gradient(90deg, #6672e0, #3fa9c9)', borderRadius: '1.5rem 1.5rem 0 0' }} />
                        <div className="p-5 sm:p-6 flex justify-between items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <h2 id="article-modal-title" className="text-xl font-bold flex items-center gap-2.5 text-foreground">
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'linear-gradient(135deg,#6672e0,#3fa9c9)', color: '#fff'
                                }}>
                                    <PenTool size={18} />
                                </span>
                                Write Article
                            </h2>
                            <button
                                onClick={() => setIsArticleModalOpen(false)}
                                aria-label="Close dialog"
                                className="p-2 rounded-xl hover:opacity-70 transition-opacity"
                                style={{ backgroundColor: 'var(--color-surface-hover)' }}
                            >
                                <X size={20} className="text-foreground" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-5">
                            {/* Cover Image */}
                            <div>
                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide text-muted-foreground">
                                    Cover Image
                                </label>
                                {articleImage ? (
                                    <div className="relative group">
                                        <img src={articleImage} alt="Cover" className="w-full h-48 object-cover rounded-2xl" style={{ border: '1px solid var(--color-border)' }} />
                                        <button
                                            onClick={() => setArticleImage(null)}
                                            className="absolute top-2 right-2 bg-black/60 p-2 rounded-full text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => articleFileInputRef.current?.click()}
                                        className="w-full h-36 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-200"
                                        style={{ borderColor: 'rgba(102,114,224,0.3)', backgroundColor: 'rgba(102,114,224,0.04)' }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#6672e0'; e.currentTarget.style.backgroundColor = 'rgba(102,114,224,0.1)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(102,114,224,0.3)'; e.currentTarget.style.backgroundColor = 'rgba(102,114,224,0.04)'; }}
                                    >
                                        <div style={{
                                            width: 44, height: 44, borderRadius: '50%',
                                            background: 'linear-gradient(135deg,rgba(102,114,224,0.2),rgba(145,128,232,0.2))',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Image size={20} style={{ color: '#6672e0' }} />
                                        </div>
                                        <span className="text-sm font-medium" style={{ color: '#6672e0' }}>
                                            Click to upload cover image
                                        </span>
                                    </div>
                                )}
                                <input type="file" ref={articleFileInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageSelect(e, setArticleImage)} />
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide text-muted-foreground">
                                    Title <span style={{ color: '#f43f5e' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter your headline..."
                                    value={articleTitle}
                                    onChange={(e) => setArticleTitle(e.target.value)}
                                    className="w-full py-3 text-lg font-bold focus:outline-none transition-colors text-foreground"
                                    style={{
                                        background: 'transparent',
                                        borderBottom: `2px solid ${articleTitle ? '#6672e0' : 'var(--color-border)'}`
                                    }}
                                />
                            </div>

                            {/* Content */}
                            <div>
                                <label className="block text-xs font-bold mb-2 uppercase tracking-wide text-muted-foreground">
                                    Content <span style={{ color: '#f43f5e' }}>*</span>
                                </label>
                                <textarea
                                    placeholder="Write your thoughts..."
                                    value={articleContent}
                                    onChange={(e) => setArticleContent(e.target.value)}
                                    className="w-full rounded-2xl p-4 min-h-[200px] focus:outline-none transition-all resize-none text-foreground"
                                    style={{
                                        backgroundColor: 'var(--color-surface-hover)',
                                        border: `1.5px solid ${articleContent ? '#6672e0' : 'var(--color-border)'}`,
                                    }}
                                />
                            </div>
                        </div>

                        <div className="p-5 sm:p-6 flex justify-end gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                            <button
                                onClick={() => setIsArticleModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                                style={{ color: 'var(--muted-foreground)', background: 'var(--color-surface-hover)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePublishArticle}
                                disabled={!articleTitle.trim() || !articleContent.trim()}
                                className="px-7 py-2.5 rounded-xl font-bold text-white text-sm transition-all duration-200"
                                style={{
                                    background: articleTitle.trim() && articleContent.trim()
                                        ? 'linear-gradient(135deg, #6672e0, #3fa9c9)'
                                        : 'var(--color-border)',
                                    boxShadow: articleTitle.trim() && articleContent.trim()
                                        ? '0 4px 16px rgba(102,114,224,0.4)'
                                        : 'none',
                                    opacity: articleTitle.trim() && articleContent.trim() ? 1 : 0.5,
                                    cursor: articleTitle.trim() && articleContent.trim() ? 'pointer' : 'not-allowed'
                                }}
                            >
                                <span className="inline-flex items-center gap-1.5"><Sparkles size={15} /> Publish</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE EVENT MODAL */}
            {isEventModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={() => setIsEventModalOpen(false)}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="event-modal-title"
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-lg shadow-2xl flex flex-col bg-card"
                        style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: '1.5rem',
                            animation: 'feedModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1)'
                        }}
                    >
                        <div style={{ height: 4, background: 'linear-gradient(90deg, #f43f5e, #b988d6)', borderRadius: '1.5rem 1.5rem 0 0' }} />
                        <div className="p-5 sm:p-6 flex justify-between items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <h2 id="event-modal-title" className="text-xl font-bold flex items-center gap-2.5 text-foreground">
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'linear-gradient(135deg,#f43f5e,#b988d6)', color: '#fff'
                                }}>
                                    <Calendar size={18} />
                                </span>
                                Create Event
                            </h2>
                            <button
                                onClick={() => setIsEventModalOpen(false)}
                                aria-label="Close dialog"
                                className="p-2 rounded-xl hover:opacity-70 transition-opacity"
                                style={{ backgroundColor: 'var(--color-surface-hover)' }}
                            >
                                <X size={20} className="text-foreground" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <input
                                placeholder="Event title *"
                                value={eventTitle}
                                onChange={(e) => setEventTitle(e.target.value)}
                                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-all text-foreground"
                                style={{
                                    backgroundColor: 'var(--color-surface-hover)',
                                    border: `1.5px solid ${eventTitle ? '#f43f5e' : 'var(--color-border)'}`
                                }}
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold mb-1 uppercase tracking-wide text-muted-foreground">Date & Time</label>
                                    <input
                                        type="datetime-local"
                                        value={eventDate}
                                        onChange={(e) => setEventDate(e.target.value)}
                                        className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all text-foreground"
                                        style={{
                                            backgroundColor: 'var(--color-surface-hover)',
                                            border: `1.5px solid ${eventDate ? '#f43f5e' : 'var(--color-border)'}`
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1 uppercase tracking-wide text-muted-foreground">Location</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Remote / NYC"
                                        value={eventLocation}
                                        onChange={(e) => setEventLocation(e.target.value)}
                                        className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all text-foreground"
                                        style={{
                                            backgroundColor: 'var(--color-surface-hover)',
                                            border: '1.5px solid var(--color-border)'
                                        }}
                                    />
                                </div>
                            </div>

                            <textarea
                                placeholder="Event details (optional)..."
                                value={eventDescription}
                                onChange={(e) => setEventDescription(e.target.value)}
                                className="w-full rounded-xl p-3.5 min-h-[100px] text-sm focus:outline-none transition-all resize-none text-foreground"
                                style={{
                                    backgroundColor: 'var(--color-surface-hover)',
                                    border: '1.5px solid var(--color-border)'
                                }}
                            />
                        </div>

                        <div className="p-5 sm:p-6 flex justify-end gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                            <button
                                onClick={() => setIsEventModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                                style={{ color: 'var(--muted-foreground)', background: 'var(--color-surface-hover)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateEvent}
                                disabled={!eventTitle.trim() || !eventDate}
                                className="px-7 py-2.5 rounded-xl font-bold text-white text-sm transition-all duration-200"
                                style={{
                                    background: eventTitle.trim() && eventDate
                                        ? 'linear-gradient(135deg, #f43f5e, #b988d6)'
                                        : 'var(--color-border)',
                                    boxShadow: eventTitle.trim() && eventDate
                                        ? '0 4px 16px rgba(244,63,94,0.4)'
                                        : 'none',
                                    opacity: eventTitle.trim() && eventDate ? 1 : 0.5,
                                    cursor: eventTitle.trim() && eventDate ? 'pointer' : 'not-allowed'
                                }}
                            >
                                <span className="inline-flex items-center gap-1.5"><Calendar size={15} /> Create Event</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MessengerWidget />
        </div>
    );
}
