/**
 * Local cache for chat data with timestamp-based expiration
 */

const CACHE_KEY = 'algosphere_chat_cache';
const CACHE_TTL = 60000; // 60 seconds

class ChatCache {
    constructor(ttl = CACHE_TTL) {
        this.ttl = ttl;
    }

    getKey(userId) {
        return `${CACHE_KEY}_${userId}`;
    }

    /**
     * Get chats from cache if fresh, otherwise return null
     */
    getChats(userId) {
        const key = this.getKey(userId);
        const cached = localStorage.getItem(key);

        if (!cached) return null;

        try {
            const { data, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;

            if (age > this.ttl) {
                // Cache expired
                localStorage.removeItem(key);
                return null;
            }

            return data;
        } catch (e) {
            console.error('[ChatCache] Failed to parse cache:', e);
            return null;
        }
    }

    /**
     * Store chats in cache with current timestamp
     */
    setChats(userId, chats) {
        const key = this.getKey(userId);
        try {
            const payload = {
                data: chats,
                timestamp: Date.now()
            };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (e) {
            console.error('[ChatCache] Failed to cache:', e);
        }
    }

    /**
     * Clear cache for a user
     */
    clearChats(userId) {
        const key = this.getKey(userId);
        localStorage.removeItem(key);
    }

    /**
     * Update a single chat in cache (or add if not exists)
     */
    updateChat(userId, chatId, updates) {
        const chats = this.getChats(userId);
        if (!chats) return null;

        const updated = chats.map(chat =>
            chat.id === chatId ? { ...chat, ...updates } : chat
        );
        this.setChats(userId, updated);
        return updated;
    }

    /**
     * Check if cache is fresh (not expired)
     */
    isFresh(userId) {
        const key = this.getKey(userId);
        const cached = localStorage.getItem(key);

        if (!cached) return false;

        try {
            const { timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            return age < this.ttl;
        } catch {
            return false;
        }
    }
}

export const chatCache = new ChatCache();
