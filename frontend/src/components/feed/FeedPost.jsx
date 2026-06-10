import React, { useState } from 'react';
import {
    MoreHorizontal, ThumbsUp, ThumbsDown, MessageSquare, Repeat, Send,
    Trash2, Calendar, MapPin, Globe
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function FeedPost({ post, onLike, onDislike, onDelete, onRepost, onFollowToggle }) {
    const { user } = useAuth();
    const [isCommentsExpanded, setIsCommentsExpanded] = useState(false);
    const [commentInput, setCommentInput] = useState("");
    const [activeDropdown, setActiveDropdown] = useState(false);

    const handleAddComment = () => {
        if (!commentInput.trim()) return;
        if (post.onAddComment) {
            post.onAddComment(post.id, commentInput);
        }
        setCommentInput("");
    };

    const avatarInitial = (post.avatar || post.author?.[0] || '?').toString().toUpperCase();
    const isOwnPost = post.author === user?.username;

    return (
        <article className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-shadow duration-300 hover:shadow-md">
            {/* Post Header */}
            <div className="p-4 flex items-start gap-3">
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm"
                    style={{ background: 'linear-gradient(135deg, #6672e0, #3fa9c9)' }}
                    aria-hidden="true"
                >
                    {avatarInitial}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-foreground hover:underline cursor-pointer truncate">
                                {post.author}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">{post.role}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <span>{post.time}</span>
                                <span aria-hidden="true">•</span>
                                <Globe size={10} aria-label="Public post" />
                            </div>
                        </div>
                        {!isOwnPost && (
                            <button
                                type="button"
                                onClick={() => onFollowToggle && onFollowToggle(post.author, post.isFollowing)}
                                aria-pressed={!!post.isFollowing}
                                className="shrink-0 mt-0.5 rounded-full text-[0.7rem] font-bold px-3 py-1 border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                                style={post.isFollowing ? {
                                    background: 'transparent',
                                    color: 'var(--muted-foreground)',
                                    borderColor: 'var(--color-border)',
                                } : {
                                    background: 'linear-gradient(135deg, #6672e0, #3fa9c9)',
                                    color: '#fff',
                                    borderColor: 'transparent',
                                }}
                            >
                                {post.isFollowing ? 'Following' : '+ Follow'}
                            </button>
                        )}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setActiveDropdown(!activeDropdown)}
                                aria-label="Post options"
                                aria-expanded={activeDropdown}
                                aria-haspopup="menu"
                                className="text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-[var(--color-surface-hover)] transition-colors duration-200"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                            {activeDropdown && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(false)} />
                                    <div role="menu" className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden animate-fade-in-up">
                                        {isOwnPost ? (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => { setActiveDropdown(false); onDelete && onDelete(post.id); }}
                                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-[var(--destructive)] hover:bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] flex items-center gap-2 transition-colors duration-200"
                                            >
                                                <Trash2 size={14} />
                                                Delete
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => setActiveDropdown(false)}
                                                className="w-full text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-[var(--color-surface-hover)] flex items-center gap-2 transition-colors duration-200"
                                            >
                                                <Globe size={14} />
                                                Report
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Post Content */}
            <div className="px-5 pb-3">
                {post.title && (
                    <h2 className="text-xl font-bold text-foreground mb-2 leading-tight">{post.title}</h2>
                )}

                {/* EVENT CARD */}
                {post.isEvent && post.eventDetails && (
                    <div className="mb-4 bg-[var(--color-surface-hover)] rounded-xl overflow-hidden border border-border">
                        <div className="h-1" style={{ background: 'linear-gradient(90deg, #6672e0, #3fa9c9)' }} />
                        <div className="p-4">
                            <h3 className="text-lg font-bold text-foreground mb-2">{post.eventDetails.title}</h3>
                            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Calendar size={16} />
                                    <span>{new Date(post.eventDetails.date).toLocaleString()}</span>
                                </div>
                                {post.eventDetails.location && (
                                    <div className="flex items-center gap-2">
                                        <MapPin size={16} />
                                        <span>{post.eventDetails.location}</span>
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                className="mt-4 w-full py-2.5 rounded-lg text-sm font-bold text-white transition-transform duration-200 hover:-translate-y-0.5"
                                style={{ background: 'linear-gradient(135deg, #6672e0, #3fa9c9)' }}
                            >
                                RSVP Now
                            </button>
                        </div>
                    </div>
                )}

                {post.content && (
                    <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>
                )}
            </div>

            {/* Post image attachments — single image or carousel */}
            {(() => {
                const imgs = (post.images && post.images.length > 0)
                    ? post.images
                    : (post.image ? [post.image] : []);
                if (imgs.length === 0) return null;
                if (imgs.length === 1) {
                    return (
                        <div className="mt-1">
                            <img src={imgs[0]} alt={`Attachment shared by ${post.author}`} loading="lazy" className="w-full h-auto max-h-[600px] object-cover border-y border-border" />
                        </div>
                    );
                }
                return (
                    <div className="mt-1 flex gap-1 overflow-x-auto snap-x snap-mandatory border-y border-border">
                        {imgs.map((src, i) => (
                            <img
                                key={i}
                                src={src}
                                alt={`Attachment ${i + 1} of ${imgs.length} shared by ${post.author}`}
                                loading="lazy"
                                className="w-full shrink-0 snap-center h-auto max-h-[600px] object-cover"
                            />
                        ))}
                    </div>
                );
            })()}

            {/* Engagement Stats */}
            <div className="px-5 py-3 flex items-center justify-between border-b border-border text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <div
                            className="p-1 rounded-full"
                            style={post.likedByMe ? { background: 'color-mix(in srgb, var(--primary) 16%, transparent)' } : undefined}
                        >
                            <ThumbsUp size={10} style={post.likedByMe ? { color: 'var(--primary)', fill: 'var(--primary)' } : undefined} className={post.likedByMe ? '' : 'text-muted-foreground'} />
                        </div>
                        <span>{post.likes || 0} {(post.likes === 1) ? 'like' : 'likes'}</span>
                    </div>
                    {(post.dislikes || 0) > 0 && (
                        <div className="flex items-center gap-1">
                            <ThumbsDown size={10} className={post.dislikedByMe ? "text-[var(--destructive)] fill-[var(--destructive)]" : "text-muted-foreground"} />
                            <span>{post.dislikes}</span>
                        </div>
                    )}
                </div>
                <div className="flex gap-4">
                    <button type="button" onClick={() => setIsCommentsExpanded(!isCommentsExpanded)} className="hover:text-foreground hover:underline transition-colors duration-200">{post.comments || 0} comments</button>
                    <span>{post.reposts || 0} reposts</span>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="px-2 py-1 flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => onLike && onLike(post.id)}
                    aria-pressed={!!post.likedByMe}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-colors duration-200 group hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                    style={post.likedByMe ? { color: 'var(--primary)' } : undefined}
                >
                    <ThumbsUp size={18} className="group-hover:scale-110 transition-transform duration-200" style={post.likedByMe ? { fill: 'var(--primary)' } : undefined} />
                    <span className="text-sm font-medium hidden sm:inline">Like</span>
                </button>
                <button
                    type="button"
                    onClick={() => onDislike && onDislike(post.id)}
                    aria-pressed={!!post.dislikedByMe}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-colors duration-200 group hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)]"
                    style={post.dislikedByMe ? { color: 'var(--destructive)' } : undefined}
                >
                    <ThumbsDown size={18} className="group-hover:scale-110 transition-transform duration-200" style={post.dislikedByMe ? { fill: 'var(--destructive)' } : undefined} />
                    <span className="text-sm font-medium hidden sm:inline">Dislike</span>
                </button>
                <button
                    type="button"
                    onClick={() => setIsCommentsExpanded(!isCommentsExpanded)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg hover:bg-[var(--color-surface-hover)] text-muted-foreground hover:text-foreground transition-colors duration-200 group"
                >
                    <MessageSquare size={18} className="group-hover:scale-110 transition-transform duration-200" />
                    <span className="text-sm font-medium hidden sm:inline">Comment</span>
                </button>
                <button
                    type="button"
                    onClick={() => onRepost && onRepost(post)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg hover:bg-[var(--color-surface-hover)] text-muted-foreground hover:text-foreground transition-colors duration-200 group"
                >
                    <Repeat size={18} className="group-hover:scale-110 transition-transform duration-200" />
                    <span className="text-sm font-medium hidden sm:inline">Repost</span>
                </button>
                <button
                    type="button"
                    aria-label="Send post"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg hover:bg-[var(--color-surface-hover)] text-muted-foreground hover:text-foreground transition-colors duration-200 group"
                >
                    <Send size={18} className="group-hover:scale-110 transition-transform duration-200" />
                    <span className="text-sm font-medium hidden sm:inline">Send</span>
                </button>
            </div>

            {/* Comment Section */}
            {isCommentsExpanded && (
                <div className="px-5 py-4 bg-[var(--color-surface-hover)] border-t border-border animate-fade-in">
                    <div className="space-y-4 mb-4">
                        {post.commentsList && post.commentsList.map(comment => (
                            <div key={comment.id} className="flex gap-3">
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                    style={{ background: 'linear-gradient(135deg, #6672e0, #3fa9c9)' }}
                                    aria-hidden="true"
                                >
                                    {(comment.author?.[0] || '?').toUpperCase()}
                                </div>
                                <div className="bg-card border border-border p-3 rounded-r-xl rounded-bl-xl flex-1 shadow-sm">
                                    <div className="flex justify-between items-center mb-1 gap-2">
                                        <span className="text-xs font-bold text-foreground truncate">{comment.author}</span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">{comment.time}</span>
                                    </div>
                                    <p className="text-xs text-foreground/80 leading-relaxed">{comment.content}</p>
                                </div>
                            </div>
                        ))}
                        {(!post.commentsList || post.commentsList.length === 0) && (
                            <div className="text-center py-4">
                                <p className="text-xs text-muted-foreground">No comments yet. Be the first to start the conversation!</p>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3 items-center">
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ background: 'linear-gradient(135deg, #6672e0, #3fa9c9)' }}
                            aria-hidden="true"
                        >
                            {(user?.name?.[0] || 'U').toUpperCase()}
                        </div>
                        <div className="flex-1 relative">
                            <label htmlFor={`comment-${post.id}`} className="sr-only">Add a comment</label>
                            <input
                                id={`comment-${post.id}`}
                                type="text"
                                placeholder="Add a comment..."
                                value={commentInput}
                                onChange={(e) => setCommentInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                                className="w-full bg-card border border-border rounded-full pl-4 pr-11 py-2.5 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-muted-foreground focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_30%,transparent)]"
                            />
                            <button
                                type="button"
                                onClick={handleAddComment}
                                disabled={!commentInput.trim()}
                                aria-label="Post comment"
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-white transition-opacity duration-200 disabled:opacity-40"
                                style={{ background: 'linear-gradient(135deg, #6672e0, #3fa9c9)' }}
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}
