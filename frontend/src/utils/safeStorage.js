/**
 * localStorage that can't crash the app.
 *
 * Browsers throw SecurityError on ANY localStorage access when storage is
 * blocked (strict private windows, embedded webviews, cookie-blocking
 * policies). AuthContext reads storage in its mount effect, and an effect
 * throw above the ErrorBoundary unmounts the entire tree — a blank white
 * site. Falls back to an in-memory store so auth simply behaves as
 * "not logged in" instead.
 */
const memory = new Map();

function storageAvailable() {
    try {
        window.localStorage.length;
        return true;
    } catch {
        return false;
    }
}
const hasStorage = storageAvailable();

export const safeStorage = {
    getItem(key) {
        if (!hasStorage) return memory.has(key) ? memory.get(key) : null;
        try { return window.localStorage.getItem(key); } catch { return null; }
    },
    setItem(key, value) {
        if (!hasStorage) { memory.set(key, String(value)); return; }
        try { window.localStorage.setItem(key, value); } catch { memory.set(key, String(value)); }
    },
    removeItem(key) {
        memory.delete(key);
        if (!hasStorage) return;
        try { window.localStorage.removeItem(key); } catch { /* already memory-cleared */ }
    },
};
