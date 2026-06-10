import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/* eslint-disable react-refresh/only-export-components */

const ThemeContext = createContext(null);
const STORAGE_KEY = 'marevlo-theme';

function getStoredIsDark() {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(STORAGE_KEY) === 'dark';
    } catch {
        return document.documentElement.classList.contains('dark');
    }
}

export function ThemeProvider({ children }) {
    const [isDark, setIsDarkState] = useState(getStoredIsDark);
    const transitionTimerRef = useRef(null);

    const beginThemeTransaction = useCallback(() => {
        if (typeof document === 'undefined') return;

        const root = document.documentElement;
        root.classList.add('theme-switching');

        if (transitionTimerRef.current) {
            window.clearTimeout(transitionTimerRef.current);
        }

        transitionTimerRef.current = window.setTimeout(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    root.classList.remove('theme-switching');
                    transitionTimerRef.current = null;
                });
            });
        }, 0);
    }, []);

    // Use useLayoutEffect for instant theme application (no flash)
    useLayoutEffect(() => {
        const root = document.documentElement;

        if (isDark) {
            root.classList.add('dark');
            root.style.colorScheme = 'dark';
        } else {
            root.classList.remove('dark');
            root.style.colorScheme = 'light';
        }

        try {
            localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
        } catch {
            // Non-fatal when storage is blocked.
        }
    }, [isDark]);

    // Apply theme immediately on page load (before React hydrates)
    useEffect(() => {
        const savedIsDark = getStoredIsDark();
        if (savedIsDark) {
            document.documentElement.classList.add('dark');
        }

        const handleStorage = (event) => {
            if (event.key !== STORAGE_KEY) return;
            beginThemeTransaction();
            setIsDarkState(event.newValue === 'dark');
        };

        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('storage', handleStorage);
            if (transitionTimerRef.current) {
                window.clearTimeout(transitionTimerRef.current);
            }
            document.documentElement.classList.remove('theme-switching');
        };
    }, [beginThemeTransaction]);

    const setTheme = useCallback((nextIsDark) => {
        beginThemeTransaction();
        setIsDarkState(nextIsDark);
    }, [beginThemeTransaction]);

    const toggleTheme = useCallback(() => {
        setTheme(!isDark);
    }, [isDark, setTheme]);

    const value = useMemo(() => ({
        isDark,
        theme: isDark ? 'dark' : 'light',
        toggleTheme,
        setDark: () => setTheme(true),
        setLight: () => setTheme(false),
        setTheme,
    }), [isDark, setTheme, toggleTheme]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
