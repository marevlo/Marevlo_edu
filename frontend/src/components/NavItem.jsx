import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function NavItem({ label, to, onNavigate }) {
    const location = useLocation();
    const navigate = useNavigate();

    // Match nested routes too: "/research" stays active on "/research/papers".
    // "/" only matches exactly so the logo route doesn't light up everywhere.
    const isActive = to === '/'
        ? location.pathname === '/'
        : location.pathname === to || location.pathname.startsWith(to + '/');

    const handleClick = () => {
        navigate(to);
        onNavigate?.();
    };

    return (
        <button
            onClick={handleClick}
            aria-current={isActive ? 'page' : undefined}
            className={`group relative px-3.5 py-2 rounded-lg text-[13.5px] font-medium tracking-[0.01em] transition-colors duration-150 ${
                isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
        >
            {label}
            {isActive && (
                <motion.span
                    layoutId="nav-underline"
                    className="absolute bottom-0.5 left-3 right-3 h-[2px] rounded-full"
                    style={{ background: 'linear-gradient(90deg, var(--primary), var(--secondary))' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
            )}
        </button>
    );
}
