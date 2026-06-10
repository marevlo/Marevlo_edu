import React, { memo } from 'react';
import './DragHandle.css';

/**
 * DragHandle — Resize grip between IDE panels.
 * direction: 'horizontal' (col-resize) | 'vertical' (row-resize)
 * Uses pure CSS :hover so no JS event handlers or querySelector hacks.
 */
const DragHandle = memo(({ direction, onMouseDown }) => (
    <div
        onMouseDown={onMouseDown}
        className={`ide-drag-handle ide-drag-handle--${direction}`}
        title="Drag to resize"
        aria-hidden="true"
    >
        <div className="ide-drag-line" />
        <div className="ide-drag-pill" />
    </div>
));

DragHandle.displayName = 'DragHandle';
export default DragHandle;
