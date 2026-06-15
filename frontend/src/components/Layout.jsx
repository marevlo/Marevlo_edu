import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import ErrorBoundary from './ErrorBoundary';
import LogoLoader from './LogoLoader';
import { ReelsPill } from '../reels/ReelsBrowser';

// Chrome widgets that aren't part of first paint. Lazy-loading them keeps their
// JS (MiraWidget is ~1.3k lines and pulls framer-motion) out of the initial
// entry chunk, so the app shell parses faster. They mount after the first idle
// slot — see useDeferredMount — instead of competing with the route's render.
const MiraWidget = lazy(() => import('./mira/MiraWidget'));
const CookieConsent = lazy(() => import('./CookieConsent'));

// Returns true once the browser is idle after the initial render. requestIdleCallback
// isn't universal (older Safari), so fall back to a short timeout.
function useDeferredMount() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
        const cancel = window.cancelIdleCallback || clearTimeout;
        const id = schedule(() => setReady(true));
        return () => cancel(id);
    }, []);
    return ready;
}

export default function Layout() {
    // Key the outlet on the top-level section (/courses, /feed, …) so route
    // changes get an enter animation, but sub-route navigation inside a
    // section (e.g. /courses/dsa → /courses/ml) doesn't remount the page.
    const location = useLocation();
    const section = location.pathname.split('/')[1] || 'home';
    const deferredReady = useDeferredMount();

    return (
        <div className="h-screen flex flex-col font-sans transition-colors duration-200 overflow-hidden bg-background text-foreground">
            <Navigation />
            <div className="h-[68px] shrink-0" />
            <main id="main-scroll" className="flex-1 overflow-auto h-[calc(100vh-68px)]">
                <ErrorBoundary>
                    <Suspense fallback={<LogoLoader />}>
                        <div key={section} className="route-enter h-full">
                            <Outlet />
                        </div>
                    </Suspense>
                </ErrorBoundary>
            </main>
            <ReelsPill />
            {/* fallback={null}: these are passive overlays, so there's nothing to
                show while their chunks load — no loader flash. */}
            {deferredReady && (
                <Suspense fallback={null}>
                    <MiraWidget />
                    <CookieConsent />
                </Suspense>
            )}
        </div>
    );
}
