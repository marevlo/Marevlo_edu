// Reels API client — matches the platform convention:
// raw fetch + VITE_API_URL + Bearer access_token from localStorage.
const API_BASE = import.meta.env.VITE_API_URL;

function headers(json = false) {
    const h = {};
    const token = localStorage.getItem('access_token');
    if (token) h.Authorization = `Bearer ${token}`;
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

async function req(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...headers(!!options.body), ...(options.headers || {}) },
    });
    if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Request failed (${res.status})`);
    }
    return res.json();
}

export const reelsApi = {
    topics: () => req('/reels/topics'),
    railForProblem: (problemId, topicSlugs = []) =>
        req(`/reels/rail/problem/${problemId}?topics=${encodeURIComponent(topicSlugs.join(','))}`),
    railForTopic: (slug) => req(`/reels/rail/topic/${encodeURIComponent(slug)}`),
    feed: (page = 1, limit = 10, source = 'floater') =>
        req(`/reels/feed?page=${page}&limit=${limit}&source=${source}`),
    search: (q) => req(`/reels/search?q=${encodeURIComponent(q)}`),
    watch: (slug) => req(`/reels/watch/${encodeURIComponent(slug)}`),

    requestUpload: (body) => req('/reels/upload-url', { method: 'POST', body: JSON.stringify(body) }),
    create: (body) => req('/reels', { method: 'POST', body: JSON.stringify(body) }),
    mine: () => req('/reels/mine'),

    like: (id) => req(`/reels/${id}/like`, { method: 'POST' }),
    save: (id) => req(`/reels/${id}/save`, { method: 'POST' }),
    view: (id, body) => req(`/reels/${id}/view`, { method: 'POST', body: JSON.stringify(body) }),
    ctaClick: (id, source) => req(`/reels/${id}/cta-click`, { method: 'POST', body: JSON.stringify({ source }) }),
    unlockProblem: (id) => req(`/reels/${id}/unlock-problem`, { method: 'POST' }),
    report: (id, reason, description) =>
        req(`/reels/${id}/report`, { method: 'POST', body: JSON.stringify({ reason, description }) }),

    // ── comments (Phase 2) ──
    comments: (reelId, page = 1) => req(`/reels/${reelId}/comments?page=${page}`),
    postComment: (reelId, body, parentId = null) =>
        req(`/reels/${reelId}/comments`, { method: 'POST', body: JSON.stringify({ body, parent_id: parentId }) }),
    likeComment: (commentId) => req(`/reels/comments/${commentId}/like`, { method: 'POST' }),
    deleteComment: (commentId) => req(`/reels/comments/${commentId}`, { method: 'DELETE' }),

    // ── social (Phase 2) ──
    followCreator: (userId) => req(`/reels/creators/${userId}/follow`, { method: 'POST' }),
    followingFeed: (page = 1, limit = 10) => req(`/reels/following/feed?page=${page}&limit=${limit}`),

    admin: {
        queues: () => req('/reels/admin/queues'),
        queue: (status, page = 1) => req(`/reels/admin/queue/${status}?page=${page}`),
        act: (id, action, reason, notes) =>
            req(`/reels/admin/${id}/action`, { method: 'POST', body: JSON.stringify({ action, reason, notes }) }),
        setAnchors: (id, anchors) =>
            req(`/reels/admin/${id}/anchors`, { method: 'PUT', body: JSON.stringify({ anchors }) }),
        reports: (status = 'open') => req(`/reels/admin/reports?status=${status}`),
        resolveReport: (id, outcome) =>
            req(`/reels/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ outcome }) }),
        audit: (reelId) => req(`/reels/admin/audit${reelId ? `?reel_id=${reelId}` : ''}`),
    },
};

// Direct-to-S3 PUT with progress (presigned URL).
export function putToS3(url, blob, contentType, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(blob);
    });
}

// Share helpers — public watch URLs are the growth loop.
export function publicReelUrl(slug) {
    return `${window.location.origin}/reels/${slug}`;
}
export function shareReel(reel) {
    const url = publicReelUrl(reel.slug);
    if (navigator.share) {
        return navigator.share({ title: reel.title, text: `${reel.title} — 60-second explainer on Marevlo`, url })
            .catch(() => {});
    }
    return navigator.clipboard.writeText(url);
}
