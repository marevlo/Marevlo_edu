import { useEffect } from 'react';

/*
 * Content protection for the course + DS&Algo sections.
 *
 * IMPORTANT / HONEST LIMITATION: a browser CANNOT truly prevent screenshots.
 * OS screenshot tools, phone cameras, and screen recorders are outside the
 * page's control. This module provides (1) DETERRENTS — block right-click,
 * copy/cut, drag, and print/save shortcuts; blur content when the tab is
 * backgrounded; clear the clipboard + flash on PrintScreen — and (2) a
 * per-user WATERMARK so any screenshot that is taken is traceable to the
 * account that took it. Watermark = the real protection; the rest is friction.
 */

const STYLE_ID = 'mv-protect-style';

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .mv-watermark{position:fixed;inset:0;z-index:2147483000;pointer-events:none;
      background-repeat:repeat;opacity:.55;}
    .mv-screenguard{position:fixed;inset:0;z-index:2147483001;display:none;
      align-items:center;justify-content:center;text-align:center;padding:24px;
      background:rgba(12,15,22,.9);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      color:#fff;font:600 16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;}
    .mv-screenguard.show{display:flex;}
    .mv-protect-flash{position:fixed;inset:0;z-index:2147483002;background:#000;opacity:0;
      pointer-events:none;transition:opacity .12s ease;}
    .mv-protect-flash.on{opacity:1;}
  `;
  document.head.appendChild(s);
}

function watermarkUrl(text) {
  const t = String(text || 'Marevlo').slice(0, 64)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='200'>` +
    `<text x='18' y='112' transform='rotate(-28 170 100)' ` +
    `fill='rgba(120,120,120,0.16)' font-family='system-ui,Arial,sans-serif' ` +
    `font-size='15' font-weight='600'>${t}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function useContentProtection(opts = {}) {
  const { user, enabled = true } = opts;
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    ensureStyle();

    const label = (user && (user.email || user.username || user.name)) || 'Marevlo · protected';
    const stamp = new Date().toISOString().slice(0, 10);

    const wm = document.createElement('div');
    wm.className = 'mv-watermark';
    wm.style.backgroundImage = watermarkUrl(`${label} · ${stamp}`);
    document.body.appendChild(wm);

    const guard = document.createElement('div');
    guard.className = 'mv-screenguard';
    guard.textContent = 'Protected content is hidden while this tab is not in focus.';
    document.body.appendChild(guard);

    const flash = document.createElement('div');
    flash.className = 'mv-protect-flash';
    document.body.appendChild(flash);

    const block = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
    const onVis = () => guard.classList.toggle('show', document.hidden);
    const onKey = (e) => {
      const k = (e.key || '').toLowerCase();
      if (e.key === 'PrintScreen') {
        try { if (navigator.clipboard) navigator.clipboard.writeText(' '); } catch (_) { /* ignore */ }
        flash.classList.add('on');
        setTimeout(() => flash.classList.remove('on'), 250);
      }
      if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's' || k === 'u')) block(e);
    };

    document.addEventListener('contextmenu', block, true);
    document.addEventListener('copy', block, true);
    document.addEventListener('cut', block, true);
    document.addEventListener('dragstart', block, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('contextmenu', block, true);
      document.removeEventListener('copy', block, true);
      document.removeEventListener('cut', block, true);
      document.removeEventListener('dragstart', block, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVis);
      wm.remove(); guard.remove(); flash.remove();
    };
  }, [enabled, user]);
}

/* Best-effort: disable right-click / copy inside a same-origin iframe (course lesson). */
export function protectIframe(iframe) {
  try {
    const doc = iframe && iframe.contentDocument;
    if (!doc) return;
    const block = (e) => { e.preventDefault(); return false; };
    doc.addEventListener('contextmenu', block, true);
    doc.addEventListener('copy', block, true);
    doc.addEventListener('cut', block, true);
    if (doc.body) doc.body.style.userSelect = 'none';
  } catch (_) { /* cross-origin or not ready — watermark overlay still applies */ }
}
