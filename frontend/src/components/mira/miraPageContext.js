/**
 * MIRA page-context bridge.
 *
 * MiraWidget is mounted globally (in Layout) and can't read a specific page's
 * local state directly. Pages that have rich, MIRA-relevant context (the IDE:
 * the problem statement, the user's live code, the last run output) publish it
 * here via setMiraPageContext(); the widget reads it at send time and attaches
 * it to /mira/chat so MIRA can answer "why is my code failing?" in context.
 *
 * Decoupled on purpose: pages only import setMiraPageContext (a single call in
 * an effect), the widget only reads getMiraPageContext(). No prop drilling, no
 * shared provider, no re-render coupling.
 */

let _ctx = null;

/** Publish the current page's context (or null to clear, e.g. on unmount). */
export function setMiraPageContext(ctx) {
  _ctx = ctx && typeof ctx === 'object' ? { ...ctx } : null;
}

/** Read the latest published page context (null if none). */
export function getMiraPageContext() {
  return _ctx;
}
