import React from 'react';

export default function Badge({ children, color = "bg-muted" }) {
    return (
        <span className={`${color} text-xs px-2 py-0.5 rounded text-foreground font-medium border border-border`}>
            {children}
        </span>
    );
}
