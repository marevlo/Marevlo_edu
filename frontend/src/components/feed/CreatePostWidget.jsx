import React, { useState, useRef } from 'react';
import { Image, Calendar, Newspaper, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const MAX_IMAGES = 10;
const MAX_SIZE = 5 * 1024 * 1024;

export default function CreatePostWidget({ onPost, onOpenEventModal, onOpenArticleModal }) {
    const { user, uploadFeedImage } = useAuth();
    const [content, setContent] = useState("");
    // Each entry: { file, previewUrl }
    const [images, setImages] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const initial = (user?.name?.[0] || 'U').toUpperCase();

    const handleImageSelect = (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = ''; // allow re-picking the same file
        if (picked.length === 0) return;

        const remainingSlots = MAX_IMAGES - images.length;
        const accepted = [];
        for (const file of picked.slice(0, remainingSlots)) {
            if (!file.type.startsWith('image/')) continue;
            if (file.size > MAX_SIZE) {
                alert(`${file.name} is over 5 MB and was skipped`);
                continue;
            }
            accepted.push({ file, previewUrl: URL.createObjectURL(file) });
        }
        if (accepted.length === 0) return;
        setImages(prev => [...prev, ...accepted]);
    };

    const removeImage = (idx) => {
        setImages(prev => {
            const next = [...prev];
            const [removed] = next.splice(idx, 1);
            if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
            return next;
        });
    };

    const handleSubmit = async () => {
        if (uploading) return;
        if (!content.trim() && images.length === 0) return;

        let imageObjectKeys = [];
        if (images.length > 0) {
            setUploading(true);
            try {
                imageObjectKeys = await Promise.all(images.map(({ file }) => uploadFeedImage(file)));
            } catch (err) {
                alert('Image upload failed: ' + err.message);
                setUploading(false);
                return;
            }
            setUploading(false);
        }

        await onPost({
            content,
            imageObjectKeys,
        });

        // Cleanup local previews
        images.forEach(img => URL.revokeObjectURL(img.previewUrl));
        setContent("");
        setImages([]);
    };

    const canSubmit = !uploading && (content.trim() || images.length > 0);

    // Shared style for the composer "action" buttons (Media / Event / Article)
    const composerAction = "flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--color-surface-hover)] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

    return (
        <div className="bg-card border border-border rounded-2xl shadow-sm p-4 sm:p-5 relative overflow-hidden group transition-shadow duration-300 hover:shadow-md">
            {/* Brand accent that reveals on hover */}
            <div
                aria-hidden="true"
                className="absolute top-0 left-0 right-0 h-[3px] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: 'linear-gradient(90deg, #6672e0, #3fa9c9)' }}
            />

            <div className="flex gap-3 sm:gap-4 mb-4">
                <div
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-white text-lg shrink-0 shadow-md ring-2 ring-white/10"
                    style={{ background: 'linear-gradient(135deg, #6672e0, #3fa9c9)' }}
                    aria-hidden="true"
                >
                    {initial}
                </div>
                <div className="flex-1 min-w-0">
                    <label htmlFor="composer-textarea" className="sr-only">Write a post</label>
                    <textarea
                        id="composer-textarea"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="What's on your mind?"
                        className="w-full bg-transparent border border-border rounded-xl px-4 py-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground min-h-[84px] resize-none transition-colors duration-200 focus:border-[var(--primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_30%,transparent)] focus:bg-[var(--color-surface-hover)]"
                    />
                </div>
            </div>

            {/* Selected images preview — horizontal scroll for multi-image */}
            {images.length > 0 && (
                <div className="mb-4 sm:ml-16 mr-1 flex gap-2 overflow-x-auto pb-2">
                    {images.map((img, idx) => (
                        <div key={idx} className="relative shrink-0">
                            <img
                                src={img.previewUrl}
                                alt={`Selected attachment ${idx + 1} of ${images.length}`}
                                className="w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-xl border border-border"
                            />
                            <button
                                type="button"
                                onClick={() => removeImage(idx)}
                                aria-label={`Remove attachment ${idx + 1}`}
                                className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors duration-200"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex justify-between items-center gap-2 px-1 pt-3 border-t border-border">
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || images.length >= MAX_IMAGES}
                        className={composerAction}
                    >
                        <Image size={18} className="shrink-0" />
                        <span className="text-xs font-bold hidden sm:inline">
                            Media{images.length > 0 ? ` (${images.length}/${MAX_IMAGES})` : ''}
                        </span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleImageSelect}
                    />

                    <button type="button" onClick={onOpenEventModal} className={composerAction}>
                        <Calendar size={18} className="shrink-0" />
                        <span className="text-xs font-bold hidden sm:inline">Event</span>
                    </button>

                    <button type="button" onClick={onOpenArticleModal} className={composerAction}>
                        <Newspaper size={18} className="shrink-0" />
                        <span className="text-xs font-bold hidden sm:inline">Article</span>
                    </button>
                </div>

                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="px-6 py-2 rounded-full font-bold text-sm text-white shadow-md transition-all duration-200 flex items-center gap-2 enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                    style={{
                        background: canSubmit
                            ? 'linear-gradient(135deg, #6672e0, #3fa9c9)'
                            : 'var(--color-border)',
                        boxShadow: canSubmit ? '0 4px 14px rgba(102,114,224,0.35)' : 'none',
                    }}
                >
                    {uploading && <Loader2 size={15} className="animate-spin" />}
                    {uploading ? 'Uploading…' : 'Post'}
                </button>
            </div>
        </div>
    );
}
