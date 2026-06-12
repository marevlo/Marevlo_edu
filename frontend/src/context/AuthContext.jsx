import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../utils/useWebSocket';
import { safeStorage } from '../utils/safeStorage';

/* eslint-disable react-refresh/only-export-components */

const AuthContext = createContext();

const API_BASE = import.meta.env.VITE_API_URL;

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profileStats, setProfileStats] = useState({ xp: 0, level: 1, streak: 0, rank: null, courses_completed: 0, problems_solved: 0 });
    const [achievements, setAchievements] = useState([]);
    const [profileData, setProfileData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Derived: userPoints alias for backwards compat
    const userPoints = profileStats.xp;

    useWebSocket(user);

    const logout = useCallback(() => {
        setUser(null);
        setProfileStats({ xp: 0, level: 1, streak: 0, rank: null, courses_completed: 0, problems_solved: 0 });
        setAchievements([]);
        setProfileData(null);
        safeStorage.removeItem('marevlo_user');
        safeStorage.removeItem('access_token');
        safeStorage.removeItem('refresh_token');
    }, []);

    const apiCall = useCallback(async (path, options = {}) => {
        let token = safeStorage.getItem('access_token');
        const makeRequest = async (t) => {
            // Don't set Content-Type for FormData — the browser must set it with the boundary
            const isFormData = options.body instanceof FormData;
            const headers = {
                ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
                ...(t ? { Authorization: `Bearer ${t}` } : {}),
                ...options.headers,
            };
            return fetch(`${API_BASE}${path}`, { ...options, headers });
        };

        let resp = await makeRequest(token);
        // Token expired - try to refresh once, then retry
        if (resp.status === 401) {
            const refreshToken = safeStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    const r = await fetch(`${API_BASE}/auth/refresh`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${refreshToken}` },
                    });
                    if (r.ok) {
                        const data = await r.json();
                        safeStorage.setItem('access_token', data.access_token);
                        safeStorage.setItem('refresh_token', data.refresh_token);
                        token = data.access_token;
                        resp = await makeRequest(token);
                    } else {
                        logout();
                        throw new Error('Session expired. Please login again.');
                    }
                } catch {
                    logout();
                    throw new Error('Session expired. Please login again.');
                }
            } else {
                logout();
                throw new Error('Session expired. Please login again.');
            }
        }

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }
        if (resp.status === 204) return null;

        const text = await resp.text();
        return text ? JSON.parse(text) : null;
    }, [logout]);

    // allSettled so a broken /achievements doesn't wipe out the avatar URL
    const refreshStats = useCallback(async () => {
        const [statsR, achievR, profR] = await Promise.allSettled([
            apiCall('/profile/stats'),
            apiCall('/profile/achievements'),
            apiCall('/profile/me'),
        ]);
        if (statsR.status === 'fulfilled') {
            setProfileStats(statsR.value);
            setUser(prev => prev ? { ...prev, xp: statsR.value.xp } : prev);
        } else {
            console.warn('stats fetch failed:', statsR.reason?.message);
        }
        if (achievR.status === 'fulfilled') {
            setAchievements(achievR.value);
        } else {
            console.warn('achievements fetch failed:', achievR.reason?.message);
        }
        if (profR.status === 'fulfilled') {
            setProfileData(profR.value);
        } else {
            console.warn('profile fetch failed:', profR.reason?.message);
        }
    }, [apiCall]);

    useEffect(() => {
        const storedUser = safeStorage.getItem('marevlo_user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch {
                safeStorage.removeItem('marevlo_user');
            }
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (user?.id) {
            refreshStats();
        }
    }, [user?.id, refreshStats]);

    useEffect(() => {
        if (!user) return;
        const interval = setInterval(async () => {
            const refreshToken = safeStorage.getItem('refresh_token');
            if (!refreshToken) return;
            try {
                const r = await fetch(`${API_BASE}/auth/refresh`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${refreshToken}` },
                });
                if (r.ok) {
                    const data = await r.json();
                    safeStorage.setItem('access_token', data.access_token);
                    safeStorage.setItem('refresh_token', data.refresh_token);
                } else {
                    logout();
                }
            } catch {
                // Network error - try again next interval
            }
        }, 13 * 60 * 1000);
        return () => clearInterval(interval);
    }, [user, logout]);

    useEffect(() => {
        if (!user) return;
        const onVisible = () => { if (document.visibilityState === 'visible') refreshStats(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [user, refreshStats]);

    const login = (userData) => {
        const username = userData.username || (userData.email ? userData.email.split('@')[0] : 'user');
        const displayName = userData.name || userData.username || 'User';
        const userObj = {
            id: userData.id,
            name: displayName,
            email: userData.email,
            username,
            handle: '@' + username.toLowerCase().replace(/\s+/g, ''),
        };
        setUser(userObj);
        safeStorage.setItem('marevlo_user', JSON.stringify(userObj));
    };

    const addPoints = (points = 50) => {
        setProfileStats(prev => ({ ...prev, xp: prev.xp + points }));
    };

    const updateUser = async (updates) => {
        // Local state update
        setUser(prev => {
            const updated = { ...prev, ...updates };
            safeStorage.setItem('marevlo_user', JSON.stringify(updated));
            return updated;
        });

        // Persist to backend (bio, location, headline, github_url, linkedin_url, skills, name, college, company, dob)
        const profileFields = ['bio', 'location', 'headline', 'github_url', 'linkedin_url', 'skills', 'name', 'college', 'college_year', 'company', 'dob'];
        const profileUpdates = {};
        profileFields.forEach(f => {
            if (updates[f] !== undefined) profileUpdates[f] = updates[f];
        });

        if (Object.keys(profileUpdates).length > 0) {
            try {
                const updated = await apiCall('/profile/me', {
                    method: 'PUT',
                    body: JSON.stringify(profileUpdates),
                });
                setProfileData(updated);
            } catch (e) {
                console.warn('Profile update failed:', e.message);
            }
        }
    };

    const uploadResume = async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        const data = await apiCall('/profile/resume', { method: 'POST', body: formData });
        setProfileData(prev => prev ? {
            ...prev,
            resume_url: data.resume_url,
            resume_filename: data.resume_filename || data.filename || prev.resume_filename,
        } : prev);
        return data;
    };

    const uploadAvatar = async (file) => {
        if (!file.type.startsWith('image/')) {
            throw new Error('Avatar must be an image');
        }
        if (file.size > 2 * 1024 * 1024) {
            throw new Error('Avatar must be 2 MB or smaller');
        }

        const { upload_url, object_key } = await apiCall('/profile/avatar/upload-url', {
            method: 'POST',
            body: JSON.stringify({ content_type: file.type, size: file.size }),
        });

        const putResp = await fetch(upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
        });
        if (!putResp.ok) {
            throw new Error(`S3 upload failed (${putResp.status})`);
        }

        const updated = await apiCall('/profile/avatar/confirm', {
            method: 'POST',
            body: JSON.stringify({ object_key }),
        });
        setProfileData(updated);
        setUser(prev => prev ? { ...prev, avatar: updated.avatar_url } : prev);
        return updated;
    };

    const deleteAvatar = async () => {
        const updated = await apiCall('/profile/avatar', { method: 'DELETE' });
        setProfileData(updated);
        setUser(prev => prev ? { ...prev, avatar: null } : prev);
        return updated;
    };

    const uploadFeedImage = async (file) => {
        if (!file.type.startsWith('image/')) {
            throw new Error('Image must be JPEG, PNG, or WebP');
        }
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('Image must be 5 MB or smaller');
        }

        const { upload_url, object_key } = await apiCall('/feed/posts/upload-url', {
            method: 'POST',
            body: JSON.stringify({ content_type: file.type, size: file.size }),
        });

        const putResp = await fetch(upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
        });
        if (!putResp.ok) {
            throw new Error(`Image upload failed (${putResp.status})`);
        }

        return object_key;
    };

    return (
        <AuthContext.Provider value={{
            user, userPoints, profileStats, achievements, profileData,
            login, logout, addPoints, updateUser, uploadResume, uploadAvatar, deleteAvatar,
            uploadFeedImage, refreshStats, apiCall, isLoading,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
