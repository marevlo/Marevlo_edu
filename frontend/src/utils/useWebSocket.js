import { useState, useEffect, useCallback, useRef } from 'react';

const HTTP_URL = import.meta.env.VITE_API_URL;
const WS_URL = HTTP_URL ? HTTP_URL.replace('http://', 'ws://').replace('https://', 'wss://') : 'ws://localhost:8000';

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Obtain a one-shot WS ticket from the server.
 * Falls back to the raw token (dev-only path on the server) if the
 * ticket endpoint is unreachable, so local dev still works without Redis.
 */
async function fetchWsTicket(token) {
    try {
        const resp = await fetch(`${HTTP_URL}/auth/ws-ticket`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
            const data = await resp.json();
            return { type: 'ticket', value: data.ticket };
        }
    } catch (_) {
        // network error — fall through to token fallback
    }
    // Dev fallback: server accepts ?token= when ENV != prod
    return { type: 'token', value: token };
}

export function useWebSocket(user) {
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnectTimeout = useRef(null);
    const reconnectAttempts = useRef(0);
    const isMounted = useRef(true);

    const connect = useCallback(async () => {
        const token = localStorage.getItem('access_token');
        if (!token || !isMounted.current) return;

        if (
            wsRef.current?.readyState === WebSocket.OPEN ||
            wsRef.current?.readyState === WebSocket.CONNECTING
        ) {
            return;
        }

        // Always use ticket auth (falls back to ?token= in dev if ticket fails)
        const auth = await fetchWsTicket(token);
        if (!isMounted.current) return;

        const param = auth.type === 'ticket'
            ? `ticket=${encodeURIComponent(auth.value)}`
            : `token=${encodeURIComponent(auth.value)}`;

        const ws = new WebSocket(`${WS_URL}/chat/ws?${param}`);
        wsRef.current = ws;

        ws.onopen = () => {
            if (!isMounted.current) { ws.close(); return; }
            const wasReconnect = reconnectAttempts.current > 0;
            reconnectAttempts.current = 0;
            setIsConnected(true);
            if (reconnectTimeout.current) {
                clearTimeout(reconnectTimeout.current);
                reconnectTimeout.current = null;
            }
            // let chat components re-fetch any messages missed during the disconnect
            if (wasReconnect) {
                window.dispatchEvent(new CustomEvent('ws_reconnected'));
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                window.dispatchEvent(new CustomEvent('ws_message', { detail: data }));
            } catch (err) {
                console.error('Failed to parse websocket message', err);
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
            if (wsRef.current === ws) {
                wsRef.current = null;
            }
            if (
                isMounted.current &&
                localStorage.getItem('access_token') &&
                reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS
            ) {
                const delay = RECONNECT_DELAY * Math.min(2 ** reconnectAttempts.current, 16);
                reconnectAttempts.current += 1;
                reconnectTimeout.current = setTimeout(connect, delay);
            }
        };

        ws.onerror = () => {
            // onclose fires automatically after onerror; don't double-close.
        };
    }, []); // stable — no deps captured

    useEffect(() => {
        isMounted.current = true;
        if (user) {
            connect();
        }
        return () => {
            isMounted.current = false;
            if (reconnectTimeout.current) {
                clearTimeout(reconnectTimeout.current);
                reconnectTimeout.current = null;
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user, connect]);

    const sendMessage = useCallback((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
        }
    }, []);

    return { isConnected, sendMessage };
}
