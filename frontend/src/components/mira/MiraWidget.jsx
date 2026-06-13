import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion as Motion, useMotionValue } from 'framer-motion';
import { X, Send, History, UserRound, Plus, ChevronDown, ChevronRight, ArrowLeft, Trash2, Copy, Check } from 'lucide-react';
import { springSnappy, springSoft, easeOutExpo } from '../../lib/motion';
import { useAuth } from '../../context/AuthContext';
import { getMiraPageContext } from './miraPageContext';

/**
 * MIRA — floating AI tutor widget.
 * A brand-mark launcher that lives on every page (mounted in Layout). Click it
 * to open a chat panel that posts to the backend POST /mira/chat and renders the
 * structured block response (walkthrough / callout / code / follow-ups).
 *
 * The walkthrough renderer mirrors mira_rf_walkthrough.html: a paced, stepped
 * lesson with a progress bar, per-step visual templates, an equation box, a
 * takeaway line, and follow-up chips.
 *
 * Three views inside the panel (header toggles):
 *   - chat:     the active conversation
 *   - history:  past conversations grouped Topic -> Subtopic (collapsible),
 *               persisted in localStorage per user (response meta.topic/subtopic)
 *   - profile:  plan tier badge + quota bars + build credits, from /mira/profile
 */

// ---------- scoped styles (mira- prefixed so they never collide with the app) ----------
const MIRA_CSS = `
.mira-root{--m-ink:#f8fafc;--m-muted:#94a3b8;--m-faint:#475569;--m-line:#1e293b;
  --m-line2:#334155;--m-shell:#0a0c14;--m-card:#0f1119;--m-hover:#1e1b4b;
  --m-primary:#6366f1;--m-primary-soft:rgba(99,102,241,0.15);--m-primary-line:rgba(99,102,241,0.4);
  --m-blue:#22d3ee;--m-purple:#a78bfa;--m-purple-bg:rgba(139,92,246,0.15);--m-purple-line:rgba(139,92,246,0.3);
  --m-green:#34d399;--m-green-bg:rgba(52,211,153,0.1);--m-green-line:rgba(52,211,153,0.25);
  --m-red:#f87171;--m-red-bg:rgba(248,113,113,0.1);--m-red-line:rgba(248,113,113,0.25);
  --m-panel:#0a0c14;--m-glow:rgba(34,211,238,0.4);
  font-family:'Geist',system-ui,-apple-system,sans-serif;}

/* The widget is strictly dark-mode styled for a premium feel */
.mira-launch{position:fixed;right:22px;bottom:22px;width:60px;height:60px;border-radius:50%;
  background:radial-gradient(circle at 30% 30%, #1a1040, #0c0e14);
  border:1px solid rgba(34,211,238,0.3);cursor:grab;display:flex;align-items:center;justify-content:center;
  box-shadow:0 8px 32px rgba(0,0,0,0.4), 0 0 15px rgba(34,211,238,0.15);
  z-index:2147483000;transition:all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);touch-action:none;
  user-select:none;-webkit-user-select:none;-webkit-user-drag:none}

.mira-launch *{pointer-events:none}
.mira-launch:active{cursor:grabbing;transform:scale(0.92)}
.mira-launch:hover{box-shadow:0 12px 40px rgba(0,0,0,0.5), 0 0 25px rgba(34,211,238,0.3); transform:translateY(-2px)}
.mira-launch .logo{width:34px;height:34px;transition:transform .15s ease; filter:drop-shadow(0 0 4px rgba(34,211,238,0.5))}
.mira-launch:hover .logo{transform:scale(1.08)}

.mira-panel{position:fixed;right:22px;bottom:94px;width:400px;max-width:calc(100vw - 28px);
  height:min(640px,calc(100vh - 120px));background:rgba(10,12,20,0.85);backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);
  border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1);
  z-index:2147483000;display:flex;flex-direction:column;overflow:hidden;color:var(--m-ink)}
  
.mira-view{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}

.mira-resize { position: absolute; z-index: 10; touch-action: none; }
.mira-resize.t { top: -4px; left: 10px; right: 10px; height: 8px; cursor: ns-resize; }
.mira-resize.b { bottom: -4px; left: 10px; right: 10px; height: 8px; cursor: ns-resize; }
.mira-resize.l { left: -4px; top: 10px; bottom: 10px; width: 8px; cursor: ew-resize; }
.mira-resize.r { right: -4px; top: 10px; bottom: 10px; width: 8px; cursor: ew-resize; }
.mira-resize.tl { top: -6px; left: -6px; width: 16px; height: 16px; cursor: nwse-resize; }
.mira-resize.tr { top: -6px; right: -6px; width: 16px; height: 16px; cursor: nesw-resize; }
.mira-resize.bl { bottom: -6px; left: -6px; width: 16px; height: 16px; cursor: nesw-resize; }
.mira-resize.br { bottom: -6px; right: -6px; width: 16px; height: 16px; cursor: nwse-resize; }

.mira-head{display:flex;align-items:center;gap:12px;padding:16px;background:rgba(15,17,25,0.9);
  cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;position:relative}
.mira-head:active{cursor:grabbing}
.mira-mark{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0));
  border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center}
.mira-mark .logo{width:20px;height:20px}
.mira-who{flex:1;min-width:0}
.mira-who .name{font-weight:700;font-size:16px;display:flex;gap:8px;align-items:center;letter-spacing:-0.01em}
.mira-dot{width:8px;height:8px;border-radius:50%;background:var(--m-green);box-shadow:0 0 8px var(--m-green)}
.mira-who .sub{font-size:12px;color:var(--m-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.mira-chip{font-size:11px;font-weight:600;color:var(--m-blue);background:var(--m-primary-soft);border:1px solid var(--m-primary-line);padding:4px 10px;border-radius:999px;flex:0 0 auto;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mira-head-actions{display:flex;align-items:center;gap:2px;flex:0 0 auto}
.mira-iconbtn, .mira-x{border:0;background:transparent;cursor:pointer;color:var(--m-muted);padding:8px;border-radius:10px;display:flex;transition:all .2s ease}
.mira-iconbtn:hover, .mira-x:hover{background:rgba(255,255,255,0.1);color:#fff}
.mira-iconbtn.on{background:var(--m-primary-soft);color:var(--m-primary)}

.mira-scroll{flex:1;overflow-y:auto;padding:20px 16px;display:flex;flex-direction:column;gap:16px}
.mira-scroll,.mira-hist,.mira-prof{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent}
.mira-scroll::-webkit-scrollbar,.mira-hist::-webkit-scrollbar,.mira-prof::-webkit-scrollbar{width:6px}
.mira-scroll::-webkit-scrollbar-thumb,.mira-hist::-webkit-scrollbar-thumb,.mira-prof::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px}

.mira-empty{margin:auto;display:flex;flex-direction:column;align-items:center;padding:14px 6px;
  animation:mira-empty-in .5s cubic-bezier(.22,1,.36,1) both}
@keyframes mira-empty-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
/* grounded shadow in the mark's own blue, not a neon halo; gentle float */
.mira-empty-logo{width:52px;height:52px;margin-bottom:18px;
  filter:drop-shadow(0 6px 14px rgba(37,99,235,.26));animation:mira-float 5s ease-in-out infinite}
@keyframes mira-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.mira-empty-title{color:var(--m-ink);font-size:21px;font-weight:700;margin-bottom:7px;letter-spacing:-.02em;text-align:center}
.mira-empty-title b{font-weight:800}
.mira-empty-sub{color:var(--m-muted);font-size:13.5px;margin-bottom:26px;text-align:center}
.mira-suggest{display:grid;grid-template-columns:1fr 1fr;gap:9px;width:100%}
/* token-driven against the widget's (always-dark) shell. shared by
   suggestion + follow-up chips. */
.mira-chip-btn{font:inherit;font-size:12px;font-weight:500;color:var(--m-ink);background:var(--m-card);
  border:1px solid var(--m-line2);border-radius:11px;padding:10px 12px;cursor:pointer;text-align:left;
  transition:border-color .18s ease,background .18s ease,transform .18s ease,box-shadow .18s ease;
  display:flex;align-items:center;gap:8px}
.mira-chip-btn:hover{border-color:var(--m-primary-line);background:var(--m-primary-soft);transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.32)}
.mira-chip-btn .ic{font-size:14px;opacity:.9;flex:0 0 auto}

.mira-msg-user{align-self:flex-end;max-width:85%;background:linear-gradient(135deg, #6366f1, #8b5cf6);
  color:#fff;font-weight:500;padding:12px 16px;border-radius:18px 18px 4px 18px;font-size:14px;line-height:1.5;
  box-shadow:0 4px 12px rgba(99,102,241,0.2)}
.mira-row{display:flex;gap:12px;align-items:flex-start}
.mira-msg-user,.mira-row{animation:mira-in .4s cubic-bezier(.16,1,.3,1) both}
@keyframes mira-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.mira-av{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;flex:0 0 auto;margin-top:2px}
.mira-av .logo{width:18px;height:18px}
.mira-grow{min-width:0;flex:1;display:flex;flex-direction:column;gap:12px}

.mira-voice{font-size:14.5px;line-height:1.6;color:#e2e8f0;overflow-wrap:break-word}
.mira-think{font-size:14px;color:var(--m-blue);display:flex;align-items:center;gap:10px;font-weight:500}
.mira-wave{display:flex;gap:4px;align-items:center}
.mira-wave i{width:4px;height:4px;border-radius:50%;background:currentColor;animation:mira-wave 1.2s ease-in-out infinite}
.mira-wave i:nth-child(2){animation-delay:0.15s}
.mira-wave i:nth-child(3){animation-delay:0.3s}
@keyframes mira-wave{0%,100%{transform:translateY(0);opacity:0.4}50%{transform:translateY(-4px);opacity:1}}

.mira-callout{border:1px solid var(--m-line2);border-radius:14px;padding:14px 16px;background:rgba(255,255,255,0.03)}
.mira-callout .ct{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;color:var(--m-blue)}
.mira-callout .cc{font-size:14px;line-height:1.6;color:#cbd5e1}
.mira-callout.def{border-color:var(--m-purple-line);background:var(--m-purple-bg)}.mira-callout.def .ct{color:var(--m-purple)}
.mira-callout.gotcha,.mira-callout.warning{border-color:var(--m-red-line);background:var(--m-red-bg)}.mira-callout.gotcha .ct,.mira-callout.warning .ct{color:var(--m-red)}

.mira-code{position:relative;background:#0c0e14;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:16px;overflow-x:auto}
.mira-code pre{margin:0;font-family:'Geist Mono',ui-monospace,monospace;font-size:13px;line-height:1.6;color:#f1f5f9;white-space:pre}
.mira-code .lang{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;font-weight:600}
.mira-copy{position:absolute;top:10px;right:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);
  color:#cbd5e1;border-radius:8px;padding:6px;cursor:pointer;display:flex;opacity:0;transition:all .2s ease}
.mira-code:hover .mira-copy,.mira-copy:focus-visible{opacity:1}
.mira-copy:hover{background:rgba(255,255,255,.15);color:#fff}
.mira-copy.ok{opacity:1;color:var(--m-green);border-color:var(--m-green-line);background:var(--m-green-bg)}

.mira-wt{border:1px solid var(--m-line2);border-radius:16px;background:rgba(255,255,255,0.02);overflow:hidden}
.mira-wt-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 0}
.mira-wt-step{font-size:13px;font-weight:600;color:#fff}
.mira-wt-title{font-size:13px;font-weight:600;color:var(--m-blue);text-align:right}
.mira-wt-bar{display:flex;gap:4px;padding:10px 16px 14px}
.mira-seg{height:4px;flex:1;border-radius:2px;background:rgba(255,255,255,0.1);transition:background .3s ease}
.mira-seg.done{background:rgba(255,255,255,0.8)}.mira-seg.cur{background:var(--m-primary)}
.mira-wt-body{padding:0 16px;animation:mira-step .3s cubic-bezier(.16,1,.3,1)}
@keyframes mira-step{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
.mira-lead{font-size:14.5px;line-height:1.6;margin:0 0 12px;color:#e2e8f0}.mira-lead b{font-weight:700;color:#fff}.mira-lead i{color:#94a3b8}

.mira-eq{border:1px solid var(--m-line2);border-radius:10px;padding:9px 11px;margin-top:9px;background:var(--m-card)}
.mira-eq .lab{font-size:10.5px;color:var(--m-faint);margin-bottom:4px}
.mira-eq .f{font-size:13.5px}.mira-eq .f .mono{font-family:'Geist Mono',ui-monospace,monospace;font-size:12.5px}
.mira-vis{background:var(--m-panel);border:1px solid var(--m-line);border-radius:10px;padding:14px 12px;margin-top:11px;display:flex;flex-direction:column;align-items:center;gap:10px}
.mira-cap{font-size:11.5px;color:var(--m-muted);text-align:center}
.mira-cc{display:flex;gap:8px;width:100%}
.mira-cc .card{flex:1;border:1px solid var(--m-line2);background:var(--m-card);border-radius:9px;padding:8px}
.mira-cc .card h4{margin:0 0 4px;font-size:11.5px}.mira-cc .card p{margin:0;font-size:10.5px;color:var(--m-muted);line-height:1.4}
.mira-cc .bad{background:var(--m-red-bg);border-color:var(--m-red-line)}.mira-cc .good{background:var(--m-green-bg);border-color:var(--m-green-line)}
.mira-p3{display:flex;flex-direction:column;gap:6px;width:100%}
.mira-p3 .st{display:flex;gap:8px;align-items:center;border:1px solid var(--m-line2);background:var(--m-card);border-radius:9px;padding:7px 9px;font-size:11.5px}
.mira-p3 .n{width:16px;height:16px;border-radius:50%;background:var(--m-purple-bg);color:var(--m-purple);font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.mira-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
.mira-node{border:1px solid var(--m-line2);background:var(--m-card);border-radius:9px;padding:7px 9px;text-align:center;min-width:48px}
.mira-node .l{font-size:12px;font-weight:600}.mira-node .s{font-size:9.5px;color:var(--m-muted)}
.mira-node.hl{background:var(--m-purple-bg);border-color:var(--m-purple-line)}.mira-node.hl .l{color:var(--m-purple)}
.mira-arrow{color:var(--m-faint)}
.mira-headline{background:var(--m-purple-bg);border:1px solid var(--m-purple-line);border-radius:9px;padding:7px 12px;text-align:center;width:100%}
.mira-headline .t{font-size:12.5px;font-weight:700;color:var(--m-purple)}
.mira-wt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:13px 13px 0;padding:11px 0 0;border-top:1px solid var(--m-line)}
.mira-sum{font-size:11.5px;font-style:italic;color:var(--m-muted);line-height:1.4}
.mira-nav{display:flex;gap:6px;flex:0 0 auto}
.mira-nbtn{font:inherit;font-size:12px;border:1px solid var(--m-line2);background:var(--m-card);color:var(--m-ink);border-radius:8px;padding:5px 11px;cursor:pointer;
  transition:background .15s ease,border-color .15s ease,filter .15s ease}
.mira-nbtn:hover:not(:disabled){background:var(--m-hover);border-color:var(--m-faint)}
.mira-nbtn:disabled{opacity:.4;cursor:default}.mira-nbtn.primary{background:var(--m-primary);border-color:var(--m-primary);color:#fff}
.mira-nbtn.primary:hover:not(:disabled){background:var(--m-primary);filter:brightness(1.1)}
.mira-wt-chips{display:flex;flex-wrap:wrap;gap:6px;padding:11px 13px 13px}

.mira-composer{padding:16px;background:rgba(10,12,20,0.95);border-top:1px solid rgba(255,255,255,0.08)}
.mira-inrow{display:flex;align-items:flex-end;gap:10px;background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:8px 8px 8px 16px;
  transition:all .2s ease;box-shadow:inset 0 1px 2px rgba(0,0,0,0.2)}
.mira-inrow:focus-within{border-color:var(--m-primary);box-shadow:0 0 0 2px rgba(99,102,241,0.2), inset 0 1px 2px rgba(0,0,0,0.2);background:rgba(255,255,255,0.08)}
/* High-specificity (.mira-root prefix) + !important so the app's global
   ".dark textarea" rule (background-color:#1a1a1a !important) can't paint a
   black box over the widget's transparent input — independent of CSS order. */
.mira-root .mira-inrow textarea{flex:1;background:transparent !important;border:0 !important;outline:0;resize:none;color:#fff !important;font:inherit;font-size:14px;max-height:100px;line-height:1.5;box-shadow:none !important;padding:4px 0}
.mira-root .mira-inrow textarea::placeholder{color:var(--m-faint) !important}
.mira-send{width:36px;height:36px;border-radius:18px;border:0;cursor:pointer;
  background:linear-gradient(135deg, #6366f1, #8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto;
  transition:all .2s ease;box-shadow:0 2px 8px rgba(99,102,241,0.4)}
.mira-send:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(99,102,241,0.5);filter:brightness(1.1)}
.mira-send:not(:disabled):active{transform:translateY(0) scale(0.95)}
.mira-send:disabled{opacity:0.4;cursor:default;background:rgba(255,255,255,0.1);box-shadow:none;color:var(--m-muted)}
.mira-quota{font-size:11px;color:var(--m-faint);text-align:center;margin-top:10px}

/* other panels */
.mira-hist, .mira-prof{flex:1;overflow-y:auto;padding:16px;background:rgba(10,12,20,0.5)}
.mira-htopic{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;cursor:pointer;font:inherit;font-size:14px;font-weight:700;color:#fff;padding:10px 8px;border-radius:10px;transition:background .2s ease}
.mira-htopic:hover{background:rgba(255,255,255,0.05)}
.mira-hitem{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:12px;cursor:pointer;font-size:13.5px;color:#cbd5e1;transition:all .2s ease;margin-bottom:2px}
.mira-hitem:hover{background:rgba(255,255,255,0.05);color:#fff}
.mira-hitem.active{background:rgba(99,102,241,0.15);color:#fff;border:1px solid rgba(99,102,241,0.3)}
.mira-hsubwrap{padding-left:12px;margin-bottom:4px}
.mira-hsub{font-size:10.5px;font-weight:700;color:var(--m-purple);text-transform:uppercase;letter-spacing:.04em;padding:7px 6px 3px}

.mira-prof-card{border:1px solid rgba(255,255,255,0.1);border-radius:16px;background:rgba(255,255,255,0.03);padding:16px;margin-bottom:16px}
.mira-prof-top{display:flex;align-items:center;gap:11px}
.mira-prof-top .mira-mark{width:34px;height:34px}.mira-prof-top .mira-mark .logo{width:22px;height:22px}
.mira-prof-name{flex:1;min-width:0}.mira-prof-name .n{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mira-prof-name .e{font-size:11.5px;color:var(--m-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mira-tier{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:4px 10px;border-radius:999px;flex:0 0 auto}
.mira-tier.free{background:var(--m-hover);color:var(--m-muted)}
.mira-tier.plus{background:var(--m-primary-soft);color:var(--m-blue)}
.mira-tier.pro{background:var(--m-purple-bg);color:var(--m-purple)}
.mira-prof-h{font-size:12px;font-weight:700;color:var(--m-ink);margin-bottom:11px;text-transform:uppercase;letter-spacing:.03em}
.mira-meter{margin-bottom:13px}.mira-meter:last-child{margin-bottom:0}
.mira-meter .lab{display:flex;justify-content:space-between;font-size:11.5px;color:var(--m-muted);margin-bottom:5px}
.mira-meter .lab b{color:var(--m-ink);font-weight:600}
.mira-bar{height:7px;border-radius:4px;background:var(--m-line);overflow:hidden}
.mira-bar>i{display:block;height:100%;border-radius:4px;background:var(--m-primary);transition:width .3s ease}
.mira-bar.warn>i{background:#e0a82e}.mira-bar.full>i{background:var(--m-red)}
.mira-credits{display:flex;align-items:baseline;gap:7px}
.mira-credits .big{font-size:26px;font-weight:800;color:var(--m-ink);line-height:1}
.mira-credits .sub{font-size:11.5px;color:var(--m-muted)}
.mira-prof-load{margin:auto;color:var(--m-muted);font-size:13px}

.mira-root button:focus-visible{outline:2px solid var(--m-primary);outline-offset:2px}

@media (max-width:520px){
  .mira-panel{right:10px;left:10px;bottom:94px;width:auto;max-width:none;height:min(620px,calc(100dvh - 110px))}
  .mira-launch{right:16px;bottom:calc(16px + env(safe-area-inset-bottom))}
  .mira-composer{padding-bottom:max(16px,env(safe-area-inset-bottom))}
}
@media (prefers-reduced-motion:reduce){
  .mira-root *,.mira-root *::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
  .mira-logo-draw, .mira-logo-glow { stroke-dashoffset: 0; animation: none; }
  .mira-logo-breathe, .mira-logo-stage, .mira-logo-shine { animation: none; opacity: 1; }
}

/* Animated Logo CSS */
.mira-logo-stage { animation: fadein .7s ease-out both; transform-box: fill-box; transform-origin: center; }
@keyframes fadein { from { opacity: 0; transform: scale(.86); } to { opacity: 1; transform: scale(1); } }
.mira-logo-breathe { animation: breathe 4.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
.mira-logo-draw { stroke-dasharray: 100; stroke-dashoffset: 100; animation: draw 1.5s .3s cubic-bezier(.55, 0, .2, 1) forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.mira-logo-glow { opacity: .5; stroke-dasharray: 100; stroke-dashoffset: 100; animation: draw 1.5s .3s cubic-bezier(.55, 0, .2, 1) forwards, gpulse 4.6s 1.7s ease-in-out infinite; }
@keyframes gpulse { 0%, 100% { opacity: .35; } 50% { opacity: .75; } }
.mira-logo-shine { opacity: 0; animation: show .5s 1.7s forwards; }
@keyframes show { to { opacity: 1; } }
.mira-logo.replay .mira-logo-stage, .mira-logo.replay .mira-logo-draw, .mira-logo.replay .mira-logo-glow, .mira-logo.replay .mira-logo-shine { animation: none; }
`;;

// ---------- brand logo ----------
function Logo({ className = 'logo' }) {
  return (
    <svg 
      className={`${className} mira-logo`} 
      viewBox="0 0 260 260" 
      role="img" 
      aria-label="Mira logo" 
      xmlns="http://www.w3.org/2000/svg"
      onClick={(e) => {
        const svg = e.currentTarget;
        svg.classList.add('replay');
        void svg.offsetWidth; // force reflow
        svg.classList.remove('replay');
      }}
    >
      <defs>
        <radialGradient id="mira-bg" cx="50%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#20202b"/>
          <stop offset="100%" stopColor="#121217"/>
        </radialGradient>
        <radialGradient id="mira-spot" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#8484fb" stopOpacity="0.28"/>
          <stop offset="100%" stopColor="#8484fb" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="mira-mGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#5b5bf2"/>
          <stop offset="52%" stopColor="#7d7df7"/>
          <stop offset="100%" stopColor="#aeaefc"/>
        </linearGradient>
        <linearGradient id="mira-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0"/>
          <stop offset="0.43" stopColor="#fff" stopOpacity="0"/>
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.9"/>
          <stop offset="0.57" stopColor="#fff" stopOpacity="0"/>
          <stop offset="1" stopColor="#fff" stopOpacity="0"/>
          <animateTransform attributeName="gradientTransform" type="translate"
            from="-1.1 0" to="1.4 0" dur="3.2s" begin="1.6s" repeatCount="indefinite"/>
        </linearGradient>
        <filter id="mira-glow-anim" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4.5"/>
        </filter>
      </defs>

      <g className="mira-logo-stage">
        <circle cx="130" cy="130" r="96" fill="url(#mira-bg)"/>
        <circle cx="130" cy="130" r="96" fill="url(#mira-spot)"/>
        <circle cx="130" cy="130" r="95.5" fill="none" stroke="#2c2c38" strokeWidth="1"/>
        <circle cx="130" cy="130" r="95.5" fill="none" stroke="url(#mira-mGrad)" strokeWidth="2"
          strokeLinecap="round" strokeDasharray="46 250" opacity="0.55">
          <animateTransform attributeName="transform" type="rotate"
            from="0 130 130" to="360 130 130" dur="13s" repeatCount="indefinite"/>
        </circle>

        <g transform="translate(130,131) scale(1.72)">
          <g className="mira-logo-breathe">
            <path className="mira-logo-glow" d="M -34,30 L -22,-28 L 0,2 L 22,-28 L 34,30" pathLength="100"
              fill="none" stroke="url(#mira-mGrad)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" filter="url(#mira-glow-anim)"/>
            <path className="mira-logo-draw" d="M -34,30 L -22,-28 L 0,2 L 22,-28 L 34,30" pathLength="100"
              fill="none" stroke="url(#mira-mGrad)" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path className="mira-logo-shine" d="M -34,30 L -22,-28 L 0,2 L 22,-28 L 34,30"
              fill="none" stroke="url(#mira-shine)" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round"/>
          </g>
        </g>
      </g>
    </svg>
  );
}

// ---------- plain-text render (the model emits plain text — no HTML) ----------
// Rendered as text content (not innerHTML) so CS characters like < > & in
// explanations/formulas show literally instead of being parsed as markup.
function Text({ text, className }) {
  return <div className={className}>{text || ''}</div>;
}

// ---------- per-step visual templates (ported from the HTML mock) ----------
function Visual({ visual }) {
  if (!visual) return null;
  const { template, labels = {} } = visual;
  if (template === 'compare_cards') {
    return (
      <>
        {labels.cap && <div className="mira-cap">{labels.cap}</div>}
        <div className="mira-cc">
          {(labels.cards || []).map((c, k) => (
            <div key={k} className={`card ${c.cls === 'bad' ? 'bad' : c.cls === 'good' ? 'good' : ''}`}>
              <h4>{c.h}</h4><p>{c.p}</p>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (template === 'process_3stage') {
    return (
      <>
        {labels.cap && <div className="mira-cap">{labels.cap}</div>}
        <div className="mira-p3">
          {(labels.stages || []).map((s, k) => (
            <div key={k} className="st"><span className="n">{k + 1}</span><span>{s}</span></div>
          ))}
        </div>
      </>
    );
  }
  if (template === 'score') {
    return (
      <>
        {labels.cap && <div className="mira-cap">{labels.cap}</div>}
        <div className="mira-flow">
          {(labels.flow || []).map((n, k) => (
            <React.Fragment key={k}>
              {k ? <span className="mira-arrow">→</span> : null}
              <div className={`mira-node ${n.hl ? 'hl' : ''}`}>
                <div className="l">{n.l}</div>{n.s && <div className="s">{n.s}</div>}
              </div>
            </React.Fragment>
          ))}
        </div>
        {labels.headline && <div className="mira-headline"><div className="t">{labels.headline}</div></div>}
        {labels.score && <div className="mira-cap"><b>{labels.score}</b></div>}
      </>
    );
  }
  // generic_box / unknown -> just the caption
  return <div className="mira-cap">{labels.cap || ''}</div>;
}

// ---------- the paced walkthrough block ----------
function Walkthrough({ block, onFollow }) {
  const steps = block.steps || [];
  const [i, setI] = useState(0);
  const n = steps.length;
  if (!n) return null;
  const s = steps[Math.min(i, n - 1)];
  return (
    <div className="mira-wt">
      <div className="mira-wt-head">
        <span className="mira-wt-step">Step {i + 1} of {n}</span>
        <span className="mira-wt-title">{s.title}</span>
      </div>
      <div className="mira-wt-bar">
        {steps.map((_, k) => <div key={k} className={`mira-seg ${k < i ? 'done' : k === i ? 'cur' : ''}`} />)}
      </div>
      {/* keyed by step so the body re-mounts and plays its entrance per step */}
      <div className="mira-wt-body" key={i}>
        <Text className="mira-lead" text={s.explanation} />
        {(s.equations || []).map((e, k) => (
          <div key={k} className="mira-eq">
            {e.lab && <div className="lab">{e.lab}</div>}
            <Text className="f" text={e.f} />
          </div>
        ))}
        {s.visual && <div className="mira-vis"><Visual visual={s.visual} /></div>}
      </div>
      <div className="mira-wt-foot">
        <div className="mira-sum">{s.takeaway}</div>
        <div className="mira-nav">
          <button className="mira-nbtn" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
          <button className="mira-nbtn primary" disabled={i === n - 1} onClick={() => setI(i + 1)}>
            {i === n - 1 ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
      {(block.follow_ups || []).length > 0 && (
        <div className="mira-wt-chips">
          {block.follow_ups.map((f, k) => (
            <button key={k} className="mira-chip-btn" onClick={() => onFollow(f)}>{f} →</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- code block with copy-to-clipboard ----------
function CodeBlock({ block }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const copy = () => {
    navigator.clipboard?.writeText(block.content || '').then(() => {
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1600);
    }).catch(() => { /* clipboard unavailable (http / permissions) — stay quiet */ });
  };
  return (
    <div className="mira-code">
      {block.language && <div className="lang">{block.language}</div>}
      <button className={`mira-copy ${copied ? 'ok' : ''}`} onClick={copy} aria-label="Copy code">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <pre>{block.content}</pre>
    </div>
  );
}

// ---------- generic block dispatcher ----------
function Block({ block, onFollow }) {
  const t = block.type;
  if (t === 'walkthrough') return <Walkthrough block={block} onFollow={onFollow} />;
  if (t === 'callout') {
    const v = block.variant;
    const cls = v === 'definition' ? 'def' : (v === 'gotcha' || v === 'warning') ? 'gotcha' : '';
    return (
      <div className={`mira-callout ${cls}`}>
        {block.title && <div className="ct">{block.title}</div>}
        <Text className="cc" text={block.content} />
      </div>
    );
  }
  if (t === 'code') return <CodeBlock block={block} />;
  if (t === 'text') return <Text className="mira-voice" text={block.content} />;
  if (t === '_follow_ups' || t === '_scope_questions') {
    return (
      <div className="mira-chips">
        {(block.items || []).map((f, k) => (
          <button key={k} className="mira-chip-btn" onClick={() => onFollow(f)}>{f} →</button>
        ))}
      </div>
    );
  }
  if (t === '_problem_card') {
    return (
      <div className="mira-callout">
        <div className="ct">{block.title} · {block.difficulty}</div>
        <Text className="cc" text={block.description} />
        {block.hint && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--m-muted)' }}>💡 {block.hint}</div>}
      </div>
    );
  }
  if (t === 'compare') {
    return (
      <div className="mira-cc">
        {(block.columns || []).map((c, k) => (
          <div key={k} className="card">
            <h4>{c.header}</h4>
            {(c.points || []).map((p, j) => <p key={j}>• {p}</p>)}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

const SUGGESTIONS = [
  { text: 'Explain an Algorithm', icon: '🧠' },
  { text: 'Debug my Code', icon: '🐛' },
  { text: 'Time Complexity', icon: '⏱️' },
  { text: 'Walk me through this', icon: '👣' },
  { text: 'Compare approaches', icon: '⚖️' },
  { text: 'Give me a hint', icon: '💡' }
];

// ---------- route -> context (chip + course_id / problem_id passed to the backend) ----------
function deriveContext(pathname) {
  const courseM = pathname.match(/^\/course\/([^/]+)/);
  if (courseM) return { chip: 'Course', course_id: decodeURIComponent(courseM[1]) };
  if (pathname.startsWith('/courses')) return { chip: 'Courses' };
  // /problems/:topicId/:id  and  /ide/:id  -> carry the problem id as context
  const probM = pathname.match(/^\/problems\/[^/]+\/([^/]+)/) || pathname.match(/^\/ide\/([^/]+)/);
  if (probM) {
    const pid = decodeURIComponent(probM[1]);
    return { chip: `Problem ${pid}`, problem_id: pid };
  }
  if (pathname.startsWith('/problems') || pathname.startsWith('/ide')) return { chip: 'Problems' };
  if (pathname.startsWith('/project')) return { chip: 'Project' };
  if (pathname.startsWith('/research')) return { chip: 'Research' };
  return { chip: 'Marevlo' };
}

// Build a compact, bounded page-context string from the IDE's live state so
// MIRA can debug the user's ACTUAL code on the problem they're looking at.
function buildPageContext(page) {
  if (!page || page.kind !== 'problem') return null;
  const parts = [];
  if (page.title) parts.push(`Problem: ${page.title}`);
  if (page.statement) parts.push(`Statement: ${page.statement.slice(0, 1200)}`);
  if (page.language) parts.push(`Language: ${page.language}`);
  if (page.status && page.status !== 'idle') parts.push(`Last run status: ${page.status}`);
  if (page.output) parts.push(`Last output / error:\n${String(page.output).slice(0, 1200)}`);
  if (page.code && page.code.trim()) parts.push(`Their current code:\n${page.code.slice(0, 4000)}`);
  const text = parts.join('\n\n').trim();
  return text ? text.slice(0, 7500) : null;
}

// ---------- draggable launcher: device-level position, persisted ----------
// x/y are offsets from the launcher's bottom-right home (so they're ≤ 0).
const POS_KEY = 'mira:pos';
const LAUNCH_SIZE = 60; // must match .mira-launch width/height in MIRA_CSS

function loadPos() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    return p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ? { x: Math.min(0, p.x), y: Math.min(0, p.y) }
      : { x: 0, y: 0 };
  } catch { return { x: 0, y: 0 }; }
}

// ---------- localStorage-backed conversation history (per user) ----------
const threadsKey = (uid) => `mira:threads:${uid}`;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function loadThreads(uid) {
  try { return JSON.parse(localStorage.getItem(threadsKey(uid)) || '[]'); }
  catch { return []; }
}
function persistThreads(uid, threads) {
  try { localStorage.setItem(threadsKey(uid), JSON.stringify(threads)); } catch { /* quota / private mode */ }
}

// compact a MIRA response (blocks) into a short text line for conversation context
function blocksToText(blocks) {
  const parts = [];
  for (const b of blocks || []) {
    if (b.type === 'walkthrough') {
      const titles = (b.steps || []).map((s) => s.title).filter(Boolean).join('; ');
      const first = (b.steps || [])[0]?.explanation || '';
      parts.push(`Walkthrough on: ${titles}. ${first}`);
    } else if (b.type === 'callout') {
      parts.push([b.title, b.content].filter(Boolean).join(': '));
    } else if (b.type === 'code') {
      parts.push(`[provided ${b.language || ''} code]`);
    } else if (b.type === 'text') {
      parts.push(b.content || '');
    } else if (b.type === '_problem_card') {
      parts.push(b.title || '');
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 600);
}

// the last few turns of a thread, shaped for the backend's history field
function buildHistory(priorMessages) {
  return (priorMessages || [])
    .slice(-8)
    .map((m) => (m.role === 'user'
      ? { role: 'user', content: (m.text || '').slice(0, 600) }
      : { role: 'mira', content: blocksToText(m.blocks) }))
    .filter((m) => m.content);
}

// group threads Topic -> Subtopic, newest first, for the history view
function groupThreads(threads) {
  const ordered = [...threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const byTopic = new Map();
  for (const t of ordered) {
    const topic = t.topic || 'General';
    const sub = t.subtopic || 'General';
    if (!byTopic.has(topic)) byTopic.set(topic, new Map());
    const subs = byTopic.get(topic);
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub).push(t);
  }
  return [...byTopic.entries()].map(([topic, subs]) => ({
    topic,
    count: [...subs.values()].reduce((a, items) => a + items.length, 0),
    subs: [...subs.entries()].map(([subtopic, items]) => ({ subtopic, items })),
  }));
}

// ---------- history view ----------
function HistoryView({ threads, activeId, onOpen, onDelete }) {
  const groups = useMemo(() => groupThreads(threads), [threads]);
  const [collapsed, setCollapsed] = useState({});
  if (!threads.length) {
    return <div className="mira-hist-empty">No conversations yet.<br />Ask MIRA something to start one.</div>;
  }
  const toggle = (topic) => setCollapsed((c) => ({ ...c, [topic]: !c[topic] }));
  return (
    <div className="mira-hist">
      {groups.map((g) => {
        const open = !collapsed[g.topic];
        return (
          <div key={g.topic} className="mira-hgroup">
            <button className="mira-htopic" onClick={() => toggle(g.topic)}>
              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              {g.topic}
              <span className="cnt">{g.count}</span>
            </button>
            {open && g.subs.map((s) => (
              <div key={s.subtopic} className="mira-hsubwrap">
                {s.subtopic && s.subtopic !== g.topic && <div className="mira-hsub">{s.subtopic}</div>}
                {s.items.map((t) => (
                  <div
                    key={t.id}
                    className={`mira-hitem ${t.id === activeId ? 'active' : ''}`}
                    onClick={() => onOpen(t.id)}
                  >
                    <span className="txt">{t.title || 'Untitled'}</span>
                    <button
                      className="del"
                      aria-label="Delete conversation"
                      onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------- profile view ----------
function Meter({ label, used, total, unit }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const cls = pct >= 100 ? 'full' : pct >= 80 ? 'warn' : '';
  return (
    <div className="mira-meter">
      <div className="lab"><span>{label}</span><b>{used.toLocaleString()} / {total.toLocaleString()}{unit ? ` ${unit}` : ''}</b></div>
      <div className={`mira-bar ${cls}`}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function ProfileView({ profile, user }) {
  if (!profile) return <div className="mira-prof"><div className="mira-prof-load">Loading your profile…</div></div>;
  const access = profile.access || {};
  const q = profile.quota || {};
  const plan = (access.plan || q.plan || 'free').toLowerCase();
  const tierClass = plan === 'pro' ? 'pro' : plan === 'plus' ? 'plus' : 'free';
  const credits = q.build_credits != null ? q.build_credits : 0;
  const allotment = q.build_credit_allotment != null ? q.build_credit_allotment : (access.build_credit_limit || 0);
  return (
    <div className="mira-prof">
      <div className="mira-prof-card">
        <div className="mira-prof-top">
          <div className="mira-mark"><Logo /></div>
          <div className="mira-prof-name">
            <div className="n">{user?.name || user?.username || 'Learner'}</div>
            <div className="e">{user?.email || ''}</div>
          </div>
          <span className={`mira-tier ${tierClass}`}>{plan}</span>
        </div>
      </div>

      <div className="mira-prof-card">
        <div className="mira-prof-h">Usage this {q.window || 'period'}</div>
        <Meter label="Questions" used={q.approx_questions_used || 0} total={q.approx_questions_total || 0} />
        <Meter label="Tokens" used={q.tokens_used || 0} total={q.tokens_total || 0} />
      </div>

      <div className="mira-prof-card">
        <div className="mira-prof-h">Build credits</div>
        <div className="mira-credits">
          <span className="big">{credits}</span>
          <span className="sub">available{allotment ? ` · ${allotment} / period included` : ''}</span>
        </div>
      </div>
    </div>
  );
}

export default function MiraWidget() {
  const { user, apiCall } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('chat'); // 'chat' | 'history' | 'profile'
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState(null);
  const [profile, setProfile] = useState(null);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const abortRef = useRef(null); // cancels the in-flight /mira/chat request

  // drag state — launcher offset from its home corner, panel session offset
  const [initPos] = useState(loadPos);
  const x = useMotionValue(initPos.x);
  const y = useMotionValue(initPos.y);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const launchDrag = useRef(null); // active launcher gesture: press origin + base offsets
  const panelDrag = useRef(null); // active header-drag gesture
  const [anchor, setAnchor] = useState(null); // panel placement for the launcher's position
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [customSize, setCustomSize] = useState(null);

  const ctx = deriveContext(location.pathname);
  const uid = user?.id;

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId]
  );
  const messages = useMemo(() => activeThread?.messages || [], [activeThread]);

  // load this user's saved conversations once we know who they are
  useEffect(() => {
    if (uid == null) { setThreads([]); setActiveId(null); return; }
    setThreads(loadThreads(uid));
    setActiveId(null);
  }, [uid]);

  // persist whenever conversations change
  useEffect(() => {
    if (uid != null) persistThreads(uid, threads);
  }, [uid, threads]);

  // keep the chat scrolled to the latest message. Jump instantly while a
  // response is streaming (loading) — smooth-scrolling on every token stacks
  // animations and stutters; smooth only for the settled/new-message case.
  useEffect(() => {
    if (view === 'chat' && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: loading ? 'auto' : 'smooth' });
    }
  }, [messages, loading, open, view]);

  // Esc closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // put the cursor in the composer whenever the chat view is shown
  useEffect(() => {
    if (open && view === 'chat') taRef.current?.focus();
  }, [open, view]);

  // Popover-style placement for wherever the bubble sits, clamped on-screen:
  //  - vertical: above the bubble when there's room and it sits low, below
  //    when it sits high; if NEITHER fits (bubble at mid-height), open BESIDE
  //    it, vertically centered, so the panel never swallows the bubble
  //  - horizontal: screen thirds — left third aligns left edges, right third
  //    aligns right edges, middle third centers the panel on the bubble
  // The transform origin is the bubble's center in panel-local px, so the
  // open/close scale animation grows out of — and shrinks back into — it.
  const computeAnchor = useCallback(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const mobile = vw <= 520;
    const w = mobile ? vw - 20 : Math.min(400, vw - 28);
    const h = mobile ? Math.min(620, vh - 104) : Math.min(640, vh - 120);
    const gap = 12, m = 10;
    // launcher rect: fixed right/bottom 22 plus the (≤0) drag offsets
    const lLeft = vw - 22 - LAUNCH_SIZE + x.get();
    const lTop = vh - 22 - LAUNCH_SIZE + y.get();
    const lCx = lLeft + LAUNCH_SIZE / 2, lCy = lTop + LAUNCH_SIZE / 2;
    let left, top;
    if (mobile) {
      left = m;
      top = lCy > vh / 2 ? lTop - gap - h : lTop + LAUNCH_SIZE + gap;
    } else {
      const above = lTop - gap - m;
      const below = vh - (lTop + LAUNCH_SIZE) - gap - m;
      if (above >= h || below >= h) {
        top = (above >= h && (lCy >= vh / 2 || below < h))
          ? lTop - gap - h
          : lTop + LAUNCH_SIZE + gap;
        if (lCx < vw / 3) left = lLeft;
        else if (lCx > (2 * vw) / 3) left = lLeft + LAUNCH_SIZE - w;
        else left = lCx - w / 2;
      } else {
        left = lCx <= vw / 2 ? lLeft + LAUNCH_SIZE + gap : lLeft - gap - w;
        top = lCy - h / 2;
      }
    }
    left = Math.max(m, Math.min(left, vw - w - m));
    top = Math.max(m, Math.min(top, vh - h - m));
    const ox = Math.max(0, Math.min(w, lCx - left));
    const oy = Math.max(0, Math.min(h, lCy - top));
    return { left, top, w, h, origin: `${ox}px ${oy}px` };
  }, [x, y]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // keep the launcher (and an open panel) on-screen when the viewport changes
  useEffect(() => {
    x.set(Math.max(-(vp.w - LAUNCH_SIZE - 34), Math.min(0, x.get())));
    y.set(Math.max(-(vp.h - LAUNCH_SIZE - 34), Math.min(0, y.get())));
    if (open) setAnchor(computeAnchor());
  }, [vp, open, x, y, computeAnchor]);

  const launchBounds = useMemo(() => ({
    left: -(vp.w - LAUNCH_SIZE - 34), right: 0,
    top: -(vp.h - LAUNCH_SIZE - 34), bottom: 0,
  }), [vp]);

  const panelBounds = useMemo(() => anchor && {
    left: -(anchor.left - 10),
    right: vp.w - anchor.left - anchor.w - 10,
    top: -(anchor.top - 10),
    bottom: vp.h - anchor.top - anchor.h - 10,
  }, [anchor, vp]);

  const openPanel = useCallback(() => {
    px.set(0); py.set(0);
    setCustomSize(null);
    setAnchor(computeAnchor());
    setOpen(true);
  }, [computeAnchor, px, py]);

  // Hand-rolled drag + tap for the launcher (chat-heads pattern). Framer's
  // drag gesture left a stale transform-origin on the element after edge
  // drags; the whileHover/whileTap SCALE then pivoted around that bogus
  // origin and shifted the bubble out from under the pointer mid-click, so
  // pointerup landed on the page and the tap never fired. Owning the pointer
  // pipeline (capture → move → release) keeps the transform translate-only —
  // origin-independent — and makes tap simply "released within 8px".
  const onLaunchDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // without this, Chromium can start a native drag/selection on the inner
    // SVG mid-gesture and fire pointercancel, killing the drag after one move
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    launchDrag.current = { sx: e.clientX, sy: e.clientY, bx: x.get(), by: y.get(), moved: false, wasDrag: false };
  }, [x, y]);

  const onLaunchMove = useCallback((e) => {
    const d = launchDrag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    // Use a relaxed 6px dead-zone (was 12px) — reduces false drag-detection
    // from micro-jitter at screen edges and on trackpads
    if (!d.moved && Math.hypot(dx, dy) <= 6) return;
    d.moved = true;
    d.wasDrag = true;
    x.set(Math.max(launchBounds.left, Math.min(0, d.bx + dx)));
    y.set(Math.max(launchBounds.top, Math.min(0, d.by + dy)));
  }, [x, y, launchBounds]);

  const onLaunchUp = useCallback(() => {
    const d = launchDrag.current;
    launchDrag.current = null;
    if (!d) return;
    if (!d.wasDrag) {
      // This was a tap — open the panel.  onClick below handles the same path
      // as a fallback in case setPointerCapture mis-fires near screen edges.
      openPanel();
      return;
    }
    // Actual drag ended — persist the new launcher position
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: x.get(), y: y.get() })); } catch { /* private mode */ }
  }, [openPanel, x, y]);

  const onLaunchCancel = useCallback(() => { launchDrag.current = null; }, []);

  // header drag for the open panel — same hand-rolled pipeline
  const onHeadDown = useCallback((e) => {
    if (e.target.closest('button') || !panelBounds) return; // header buttons stay clickable
    e.preventDefault(); // block native drag/selection takeover (→ pointercancel)
    e.currentTarget.setPointerCapture(e.pointerId);
    panelDrag.current = { sx: e.clientX, sy: e.clientY, bx: px.get(), by: py.get() };
  }, [panelBounds, px, py]);

  const onHeadMove = useCallback((e) => {
    const d = panelDrag.current;
    if (!d || !panelBounds) return;
    px.set(Math.max(panelBounds.left, Math.min(panelBounds.right, d.bx + e.clientX - d.sx)));
    py.set(Math.max(panelBounds.top, Math.min(panelBounds.bottom, d.by + e.clientY - d.sy)));
  }, [panelBounds, px, py]);

  const onHeadUp = useCallback(() => { panelDrag.current = null; }, []);

  // Ctrl+. (Cmd+. on mac) toggles MIRA from anywhere — incl. while typing in
  // the IDE, since the listener is on window and the combo never inserts text
  useEffect(() => {
    if (!user) return;
    const onKey = (e) => {
      if (e.key === '.' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (open) setOpen(false);
        else openPanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, open, openPanel]);

  // fetch the profile lazily when its view is opened
  useEffect(() => {
    if (view !== 'profile' || profile || !user) return;
    let live = true;
    apiCall('/mira/profile')
      .then((p) => { if (live) setProfile(p); })
      .catch(() => { /* leave the loading state — profile is non-critical */ });
    return () => { live = false; };
  }, [view, profile, user, apiCall]);

  const send = useCallback(async (qRaw) => {
    const q = (qRaw ?? '').trim();
    if (!q || loading) return;
    setView('chat');
    // capture the conversation BEFORE we append this question — this is the
    // context the backend uses to resolve follow-ups ("provide me code" etc.)
    const history = buildHistory(messages);
    // attach the current page's live context (e.g. the IDE problem + the user's
    // code + last error) so MIRA can help solve THIS problem, not a generic one.
    const pageContext = buildPageContext(getMiraPageContext());
    const id = activeId || newId();
    if (!activeId) setActiveId(id);
    setThreads((prev) => {
      const exists = prev.some((t) => t.id === id);
      const base = exists ? prev : [{
        id, title: q.slice(0, 64), topic: 'General', subtopic: 'General',
        messages: [], createdAt: Date.now(), updatedAt: Date.now(),
      }, ...prev];
      return base.map((t) => t.id === id
        ? { ...t, messages: [...t.messages, { role: 'user', text: q }], updatedAt: Date.now() }
        : t);
    });
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    setLoading(true);
    // abort any prior in-flight request and start a fresh controller for this one
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await apiCall('/mira/chat', {
        method: 'POST',
        body: JSON.stringify({
          question: q,
          course_id: ctx.course_id || null,
          lesson_id: null,
          problem_id: ctx.problem_id || null,
          page_context: pageContext,
          history,
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return; // superseded/aborted mid-flight — drop the result
      const meta = res?.meta;
      setThreads((prev) => prev.map((t) => t.id === id ? {
        ...t,
        topic: meta?.topic || t.topic,
        subtopic: meta?.subtopic || t.subtopic,
        messages: [...t.messages, { role: 'mira', blocks: res?.blocks || [], meta }],
        updatedAt: Date.now(),
      } : t));
      if (meta?.quota) setQuota(meta.quota);
    } catch (e) {
      // an aborted request is intentional (New chat / switched thread) — stay silent
      if (e?.name === 'AbortError' || controller.signal.aborted) return;
      setThreads((prev) => prev.map((t) => t.id === id ? {
        ...t,
        messages: [...t.messages, {
          role: 'mira',
          blocks: [{ type: 'callout', variant: 'warning', title: 'Something went wrong', content: e.message || 'Please try again.' }],
        }],
        updatedAt: Date.now(),
      } : t));
    } finally {
      // only the CURRENT request clears the spinner — an aborted one must not
      // turn off loading for the request that superseded it
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [apiCall, activeId, ctx.course_id, ctx.problem_id, loading, messages]);

  // abort any in-flight request when the user navigates away from the active chat
  const abortInFlight = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setLoading(false);
  }, []);
  const newChat = useCallback(() => {
    abortInFlight();
    setActiveId(null); setView('chat'); setInput('');
  }, [abortInFlight]);
  const openThread = useCallback((id) => {
    abortInFlight();
    setActiveId(id); setView('chat');
  }, [abortInFlight]);
  const deleteThread = useCallback((id) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  // hidden until signed in — the backend requires an authenticated user
  if (!user) return null;

  const headerSub = view === 'history' ? 'Conversation history'
    : view === 'profile' ? 'Your plan & usage'
    : 'Adaptive tutor';

  const activeW = customSize?.w || anchor?.w;
  const activeH = customSize?.h || anchor?.h;
  const activeL = customSize?.left || anchor?.left;
  const activeT = customSize?.top || anchor?.top;

  const startResize = (dir) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = activeW, startH = activeH;
    const startL = activeL, startT = activeT;

    const onMove = (me) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      let newW = startW, newH = startH, newL = startL, newT = startT;

      if (dir.includes('l')) {
        newW = Math.max(300, Math.min(window.innerWidth - 40, startW - dx));
        newL = startL + (startW - newW);
      } else if (dir.includes('r')) {
        newW = Math.max(300, Math.min(window.innerWidth - startL - 20, startW + dx));
      }

      if (dir.includes('t')) {
        newH = Math.max(400, Math.min(window.innerHeight - 80, startH - dy));
        newT = startT + (startH - newH);
      } else if (dir.includes('b')) {
        newH = Math.max(400, Math.min(window.innerHeight - startT - 20, startH + dy));
      }
      setCustomSize({ w: newW, h: newH, left: newL, top: newT });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="mira-root">
      <style>{MIRA_CSS}</style>

      <AnimatePresence>
      {!open && (
        <Motion.button
          key="mira-launch"
          className="mira-launch"
          onPointerDown={onLaunchDown}
          onPointerMove={onLaunchMove}
          onPointerUp={onLaunchUp}
          onPointerCancel={onLaunchCancel}
          onClick={(e) => {
            // Fallback for cases where onPointerUp didn't fire (e.g. near screen
            // edges on some browsers). Only open if this click was NOT a drag.
            // Keyboard-generated clicks (e.detail === 0) always open.
            if (e.detail === 0 || !launchDrag.current?.wasDrag) openPanel();
          }}
          draggable={false}
          aria-label="Open MIRA tutor"
          title="MIRA — Ctrl+."
          style={{ x, y }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12, ease: 'easeIn' } }}
          transition={springSnappy}
        >
          <Logo />
        </Motion.button>
      )}

      {open && (
        <Motion.div
          key="mira-panel"
          className="mira-panel"
          role="dialog"
          aria-label="MIRA tutor"
          style={{
            x: px, y: py,
            left: activeL, top: activeT,
            width: activeW, height: activeH,
            right: 'auto', bottom: 'auto',
            transformOrigin: anchor?.origin || 'bottom right',
          }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.55, transition: { duration: 0.16, ease: 'easeIn' } }}
          transition={springSoft}
        >
          <div className="mira-resize tl" onPointerDown={startResize('tl')} />
          <div className="mira-resize t" onPointerDown={startResize('t')} />
          <div className="mira-resize tr" onPointerDown={startResize('tr')} />
          <div className="mira-resize r" onPointerDown={startResize('r')} />
          <div className="mira-resize br" onPointerDown={startResize('br')} />
          <div className="mira-resize b" onPointerDown={startResize('b')} />
          <div className="mira-resize bl" onPointerDown={startResize('bl')} />
          <div className="mira-resize l" onPointerDown={startResize('l')} />

          <div
            className="mira-head"
            onPointerDown={onHeadDown}
            onPointerMove={onHeadMove}
            onPointerUp={onHeadUp}
            onPointerCancel={onHeadUp}
          >
            {view !== 'chat' ? (
              <button className="mira-iconbtn" onClick={() => setView('chat')} aria-label="Back to chat"><ArrowLeft size={18} /></button>
            ) : (
              <div className="mira-mark"><Logo /></div>
            )}
            <div className="mira-who">
              <div className="name">MIRA <span className="mira-dot" /></div>
              <div className="sub">{headerSub}</div>
            </div>
            {view === 'chat' && <span className="mira-chip">{ctx.chip}</span>}
            <div className="mira-head-actions">
              <button className="mira-iconbtn" onClick={newChat} aria-label="New chat" title="New chat"><Plus size={18} /></button>
              <button className={`mira-iconbtn ${view === 'history' ? 'on' : ''}`} onClick={() => setView('history')} aria-label="History" title="History"><History size={17} /></button>
              <button className={`mira-iconbtn ${view === 'profile' ? 'on' : ''}`} onClick={() => setView('profile')} aria-label="Profile" title="Profile"><UserRound size={17} /></button>
              <button className="mira-x" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
          </div>

          {/* keyed by view so switching chat/history/profile plays an entrance */}
          <Motion.div
            key={view}
            className="mira-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: easeOutExpo }}
          >

          {view === 'history' && (
            <HistoryView threads={threads} activeId={activeId} onOpen={openThread} onDelete={deleteThread} />
          )}

          {view === 'profile' && <ProfileView profile={profile} user={user} />}

          {view === 'chat' && (
            <>
              <div className="mira-scroll" ref={scrollRef} aria-live="polite" aria-busy={loading}>
                {messages.length === 0 && !loading && (
                  <div className="mira-empty">
                    <Logo className="mira-empty-logo" />
                    <div className="mira-empty-title">Hi {user?.name?.split(' ')[0] || user?.username || 'Learner'}, I'm <b>MIRA</b></div>
                    <div className="mira-empty-sub">Your AI tutor.</div>
                    <div className="mira-suggest">
                      {SUGGESTIONS.map((s) => (
                        <button key={s.text} className="mira-chip-btn" onClick={() => send(s.text)}>
                          <span className="ic">{s.icon}</span> {s.text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  msg.role === 'user' ? (
                    <div key={idx} className="mira-msg-user">{msg.text}</div>
                  ) : (
                    <div key={idx} className="mira-row">
                      <div className="mira-av"><Logo /></div>
                      <div className="mira-grow">
                        {(msg.blocks || []).map((b, k) => <Block key={k} block={b} onFollow={send} />)}
                      </div>
                    </div>
                  )
                ))}

                {loading && (
                  <div className="mira-row">
                    <div className="mira-av"><Logo /></div>
                    <div className="mira-grow">
                      <div className="mira-think"><span className="mira-wave"><i /><i /><i /></span> Thinking…</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mira-composer">
                <div className="mira-inrow">
                  <textarea
                    ref={taRef}
                    rows={1}
                    placeholder="Ask MIRA…"
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(90, e.target.scrollHeight) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
                    }}
                  />
                  <button className="mira-send" disabled={!input.trim() || loading} onClick={() => send(input)} aria-label="Send">
                    <Send size={16} />
                  </button>
                </div>
                {quota && quota.approx_questions_total != null && (
                  <div className="mira-quota">
                    {Math.max(0, quota.approx_questions_total - (quota.approx_questions_used || 0))} questions left this {quota.window || 'period'}
                  </div>
                )}
              </div>
            </>
          )}

          </Motion.div>
        </Motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
