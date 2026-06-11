import React, { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import ErrorBoundary from './ErrorBoundary';
import MiraWidget from './mira/MiraWidget';
import CookieConsent from './CookieConsent';

export default function Layout() {
    // Key the outlet on the top-level section (/courses, /feed, …) so route
    // changes get an enter animation, but sub-route navigation inside a
    // section (e.g. /courses/dsa → /courses/ml) doesn't remount the page.
    const location = useLocation();
    const section = location.pathname.split('/')[1] || 'home';

    return (
        <div className="h-screen flex flex-col font-sans transition-colors duration-200 overflow-hidden bg-background text-foreground">
            <Navigation />
            <div className="h-[68px] shrink-0" />
            <main className="flex-1 overflow-auto h-[calc(100vh-68px)]">
                <ErrorBoundary>
                    <Suspense fallback={<div className="flex items-center justify-center h-full w-full text-muted-foreground" style={{ fontSize: '14px' }}>Loading…</div>}>
                        <div key={section} className="route-enter h-full">
                            <Outlet />
                        </div>
                    </Suspense>
                </ErrorBoundary>
            </main>
            <MiraWidget />
            <CookieConsent />
        </div>
    );
}
