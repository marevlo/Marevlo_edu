import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, History, UserRound, Plus, ChevronDown, ChevronRight, ArrowLeft, Trash2 } from 'lucide-react';
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
.mira-root{--m-ink:#1a1a1a;--m-muted:#6b7280;--m-faint:#9ca3af;--m-line:#e5e7eb;
  --m-line2:#d8dae0;--m-shell:#fbfbfa;--m-primary:#4f46e5;--m-blue:#2563eb;
  --m-purple:#7c6df2;--m-purple-bg:#efeefe;--m-green:#16a34a;--m-green-bg:#e9f7ee;
  --m-green-line:#a7e3bf;--m-red:#b91c1c;--m-red-bg:#fdeeee;--m-panel:#f6f5f2;
  font-family:'Geist',system-ui,-apple-system,sans-serif;}
.mira-launch{position:fixed;right:22px;bottom:22px;width:54px;height:54px;border-radius:16px;
  background:#0c0e14;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;
  box-shadow:0 10px 30px rgba(0,0,0,.28);z-index:2147483000;transition:transform .15s ease}
.mira-launch:hover{transform:translateY(-2px) scale(1.04)}
.mira-launch .logo{width:30px;height:30px}
.mira-badge{position:absolute;top:-3px;right:-3px;width:13px;height:13px;border-radius:50%;
  background:#22d3ee;border:2px solid #0c0e14}
.mira-panel{position:fixed;right:22px;bottom:88px;width:400px;max-width:calc(100vw - 28px);
  height:min(640px,calc(100vh - 120px));background:var(--m-shell);border:1px solid var(--m-line);
  border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.22);z-index:2147483000;display:flex;
  flex-direction:column;overflow:hidden;color:var(--m-ink)}
.mira-head{display:flex;align-items:center;gap:11px;padding:13px 14px;border-bottom:1px solid var(--m-line);background:#fff}
.mira-mark{width:30px;height:30px;border-radius:9px;background:#0c0e14;display:flex;align-items:center;justify-content:center}
.mira-mark .logo{width:20px;height:20px}
.mira-who{flex:1;min-width:0}.mira-who .name{font-weight:700;font-size:15px;display:flex;gap:7px;align-items:center}
.mira-dot{width:6px;height:6px;border-radius:50%;background:var(--m-green)}
.mira-who .sub{font-size:11.5px;color:var(--m-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mira-chip{font-size:11px;font-weight:600;color:var(--m-blue);background:#eef2ff;border:1px solid #dfe4ff;padding:3px 9px;border-radius:999px;flex:0 0 auto}
.mira-head-actions{display:flex;align-items:center;gap:1px;flex:0 0 auto}
.mira-iconbtn{border:0;background:transparent;cursor:pointer;color:var(--m-muted);padding:6px;border-radius:8px;display:flex}
.mira-iconbtn:hover{background:#f0f0ef;color:var(--m-ink)}
.mira-iconbtn.on{background:#eef2ff;color:var(--m-primary)}
.mira-x{border:0;background:transparent;cursor:pointer;color:var(--m-muted);padding:4px;border-radius:8px;display:flex}
.mira-x:hover{background:#f0f0ef;color:var(--m-ink)}
.mira-scroll{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:13px;background:var(--m-shell)}
.mira-empty{margin:auto;text-align:center;color:var(--m-muted);font-size:13px;line-height:1.6;padding:0 18px}
.mira-empty b{color:var(--m-ink)}
.mira-suggest{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:14px}
.mira-msg-user{align-self:flex-end;max-width:82%;background:var(--m-primary);color:#fff;font-weight:500;padding:9px 13px;border-radius:14px 14px 4px 14px;font-size:14px;line-height:1.45}
.mira-row{display:flex;gap:9px;align-items:flex-start}
.mira-av{width:25px;height:25px;border-radius:8px;background:#0c0e14;display:flex;align-items:center;justify-content:center;flex:0 0 auto;margin-top:2px}
.mira-av .logo{width:16px;height:16px}
.mira-grow{min-width:0;flex:1;display:flex;flex-direction:column;gap:10px}
.mira-voice{font-size:14px;line-height:1.55;color:var(--m-ink)}
.mira-think{font-size:13.5px;color:var(--m-muted);display:flex;align-items:center;gap:7px}
.mira-think .blink{width:7px;height:7px;border-radius:50%;background:var(--m-primary);animation:mira-pulse 1s infinite}
@keyframes mira-pulse{0%,100%{opacity:.3}50%{opacity:1}}

.mira-callout{border:1px solid var(--m-line2);border-radius:12px;padding:11px 13px;background:#fff}
.mira-callout .ct{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px;color:var(--m-blue)}
.mira-callout .cc{font-size:13.5px;line-height:1.55}
.mira-callout.def{border-color:#cfc9f7;background:var(--m-purple-bg)}.mira-callout.def .ct{color:var(--m-purple)}
.mira-callout.gotcha,.mira-callout.warning{border-color:#f3c9c9;background:var(--m-red-bg)}.mira-callout.gotcha .ct,.mira-callout.warning .ct{color:var(--m-red)}

.mira-code{background:#0c0e14;border-radius:12px;padding:12px 13px;overflow-x:auto}
.mira-code pre{margin:0;font-family:'Geist Mono',ui-monospace,monospace;font-size:12.5px;line-height:1.55;color:#e6e6e6;white-space:pre}
.mira-code .lang{font-size:10.5px;color:#8b8fa3;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}

.mira-chips{display:flex;flex-wrap:wrap;gap:7px}
.mira-chip-btn{font:inherit;font-size:12px;color:var(--m-blue);background:#fff;border:1px solid var(--m-line2);border-radius:8px;padding:6px 11px;cursor:pointer;text-align:left}
.mira-chip-btn:hover{border-color:var(--m-blue);background:#f7f8ff}

.mira-wt{border:1px solid var(--m-line2);border-radius:14px;background:#fff;overflow:hidden}
.mira-wt-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px 0}
.mira-wt-step{font-size:12px;font-weight:600}
.mira-wt-title{font-size:12px;font-weight:600;color:var(--m-blue);text-align:right}
.mira-wt-bar{display:flex;gap:4px;padding:8px 13px 12px}
.mira-seg{height:3px;flex:1;border-radius:2px;background:var(--m-line)}
.mira-seg.done{background:var(--m-ink)}.mira-seg.cur{background:var(--m-primary)}
.mira-wt-body{padding:0 13px}
.mira-lead{font-size:13.5px;line-height:1.6;margin:0 0 10px}.mira-lead b{font-weight:700}.mira-lead i{color:#444}
.mira-eq{border:1px solid var(--m-line2);border-radius:10px;padding:9px 11px;margin-top:9px;background:#fff}
.mira-eq .lab{font-size:10.5px;color:var(--m-faint);margin-bottom:4px}
.mira-eq .f{font-size:13.5px}.mira-eq .f .mono{font-family:'Geist Mono',ui-monospace,monospace;font-size:12.5px}
.mira-vis{background:var(--m-panel);border:1px solid var(--m-line);border-radius:10px;padding:14px 12px;margin-top:11px;display:flex;flex-direction:column;align-items:center;gap:10px}
.mira-cap{font-size:11.5px;color:var(--m-muted);text-align:center}
.mira-cc{display:flex;gap:8px;width:100%}
.mira-cc .card{flex:1;border:1px solid var(--m-line2);background:#fff;border-radius:9px;padding:8px}
.mira-cc .card h4{margin:0 0 4px;font-size:11.5px}.mira-cc .card p{margin:0;font-size:10.5px;color:var(--m-muted);line-height:1.4}
.mira-cc .bad{background:var(--m-red-bg);border-color:#f3c9c9}.mira-cc .good{background:var(--m-green-bg);border-color:var(--m-green-line)}
.mira-p3{display:flex;flex-direction:column;gap:6px;width:100%}
.mira-p3 .st{display:flex;gap:8px;align-items:center;border:1px solid var(--m-line2);background:#fff;border-radius:9px;padding:7px 9px;font-size:11.5px}
.mira-p3 .n{width:16px;height:16px;border-radius:50%;background:var(--m-purple-bg);color:var(--m-purple);font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.mira-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
.mira-node{border:1px solid var(--m-line2);background:#fff;border-radius:9px;padding:7px 9px;text-align:center;min-width:48px}
.mira-node .l{font-size:12px;font-weight:600}.mira-node .s{font-size:9.5px;color:var(--m-muted)}
.mira-node.hl{background:var(--m-purple-bg);border-color:#cfc9f7}.mira-node.hl .l{color:var(--m-purple)}
.mira-arrow{color:var(--m-faint)}
.mira-headline{background:var(--m-purple-bg);border:1px solid #cfc9f7;border-radius:9px;padding:7px 12px;text-align:center;width:100%}
.mira-headline .t{font-size:12.5px;font-weight:700;color:var(--m-purple)}
.mira-wt-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:13px 13px 0;padding:11px 0 0;border-top:1px solid var(--m-line)}
.mira-sum{font-size:11.5px;font-style:italic;color:var(--m-muted);line-height:1.4}
.mira-nav{display:flex;gap:6px;flex:0 0 auto}
.mira-nbtn{font:inherit;font-size:12px;border:1px solid var(--m-line2);background:#fff;border-radius:8px;padding:5px 11px;cursor:pointer}
.mira-nbtn:disabled{opacity:.4;cursor:default}.mira-nbtn.primary{background:var(--m-primary);border-color:var(--m-primary);color:#fff}
.mira-wt-chips{display:flex;flex-wrap:wrap;gap:6px;padding:11px 13px 13px}

.mira-composer{border-top:1px solid var(--m-line);padding:11px 12px;background:#fff}
.mira-inrow{display:flex;align-items:flex-end;gap:8px;background:transparent;border:1px solid var(--m-line2);border-radius:11px;padding:7px 8px 7px 12px}
.mira-inrow:focus-within{border-color:var(--m-primary)}
/* High-specificity + !important so the app's global ".dark textarea" rule
   (background-color:#1a1a1a !important) can't paint a black box over the
   widget's light, transparent input. */
.mira-root .mira-inrow textarea{flex:1;background:transparent !important;border:0 !important;outline:0;resize:none;color:var(--m-ink) !important;font:inherit;font-size:14px;max-height:90px;line-height:1.45;box-shadow:none !important}
.mira-root .mira-inrow textarea::placeholder{color:var(--m-faint) !important}
.mira-send{width:32px;height:32px;border-radius:8px;border:0;cursor:pointer;background:var(--m-primary);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.mira-send:disabled{opacity:.4;cursor:default}
.mira-quota{font-size:10.5px;color:var(--m-faint);text-align:center;margin-top:6px}

/* history view */
.mira-hist{flex:1;overflow-y:auto;padding:10px 10px;background:var(--m-shell)}
.mira-hist-empty{color:var(--m-muted);font-size:13px;text-align:center;margin-top:40px;line-height:1.6}
.mira-hgroup{margin-bottom:4px}
.mira-htopic{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;cursor:pointer;font:inherit;font-size:13px;font-weight:700;color:var(--m-ink);padding:8px 6px}
.mira-htopic:hover{background:#f0f0ef;border-radius:8px}
.mira-htopic .cnt{margin-left:auto;font-size:11px;font-weight:600;color:var(--m-faint)}
.mira-hsubwrap{padding-left:12px;margin-bottom:4px}
.mira-hsub{font-size:10.5px;font-weight:700;color:var(--m-purple);text-transform:uppercase;letter-spacing:.04em;padding:7px 6px 3px}
.mira-hitem{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:9px;cursor:pointer;font-size:13px;color:var(--m-ink)}
.mira-hitem:hover{background:#f0f0ef}
.mira-hitem.active{background:#eef2ff}
.mira-hitem .txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mira-hitem .del{opacity:0;border:0;background:transparent;cursor:pointer;color:var(--m-faint);padding:2px;display:flex;flex:0 0 auto}
.mira-hitem:hover .del{opacity:1}
.mira-hitem .del:hover{color:var(--m-red)}

/* profile view */
.mira-prof{flex:1;overflow-y:auto;padding:16px 14px;background:var(--m-shell);display:flex;flex-direction:column;gap:14px}
.mira-prof-card{border:1px solid var(--m-line2);border-radius:12px;background:#fff;padding:14px}
.mira-prof-top{display:flex;align-items:center;gap:11px}
.mira-prof-top .mira-mark{width:34px;height:34px}.mira-prof-top .mira-mark .logo{width:22px;height:22px}
.mira-prof-name{flex:1;min-width:0}.mira-prof-name .n{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mira-prof-name .e{font-size:11.5px;color:var(--m-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mira-tier{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:4px 10px;border-radius:999px;flex:0 0 auto}
.mira-tier.free{background:#f0f0ef;color:var(--m-muted)}
.mira-tier.plus{background:#eef2ff;color:var(--m-blue)}
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
`;

// ---------- brand logo ----------
function Logo({ className = 'logo' }) {
  return (
    <svg className={className} viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <linearGradient id="mira-mg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#67e8f9" /><stop offset="45%" stopColor="#22d3ee" />
          <stop offset="75%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#mira-mg)" strokeLinecap="round">
        <path d="M12 96 V44 C12 22 24 12 40 10" strokeWidth="6" />
        <path d="M24 96 V46 C24 30 32 22 46 19" strokeWidth="5" />
        <path d="M108 96 V44 C108 22 96 12 80 10" strokeWidth="6" />
        <path d="M96 96 V46 C96 30 88 22 74 19" strokeWidth="5" />
        <path d="M30 18 L60 78 L90 18" strokeWidth="7" />
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
      <div className="mira-wt-body">
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
  if (t === 'code') {
    return (
      <div className="mira-code">
        {block.language && <div className="lang">{block.language}</div>}
        <pre>{block.content}</pre>
      </div>
    );
  }
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

const SUGGESTIONS = ['Explain gradient descent', 'How does a hash map work?', 'What is Big-O notation?'];

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

  // keep the chat scrolled to the latest message
  useEffect(() => {
    if (view === 'chat' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open, view]);

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

  return (
    <div className="mira-root">
      <style>{MIRA_CSS}</style>

      {!open && (
        <button className="mira-launch" onClick={() => setOpen(true)} aria-label="Open MIRA tutor">
          <Logo />
          <span className="mira-badge" />
        </button>
      )}

      {open && (
        <div className="mira-panel" role="dialog" aria-label="MIRA tutor">
          <div className="mira-head">
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

          {view === 'history' && (
            <HistoryView threads={threads} activeId={activeId} onOpen={openThread} onDelete={deleteThread} />
          )}

          {view === 'profile' && <ProfileView profile={profile} user={user} />}

          {view === 'chat' && (
            <>
              <div className="mira-scroll" ref={scrollRef}>
                {messages.length === 0 && !loading && (
                  <div className="mira-empty">
                    Hi, I'm <b>MIRA</b> — your AI tutor for CS, AI & coding.<br />
                    Ask me anything and I'll walk you through it.
                    <div className="mira-suggest">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} className="mira-chip-btn" onClick={() => send(s)}>{s}</button>
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
                      <div className="mira-think"><span className="blink" /> MIRA is thinking…</div>
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
        </div>
      )}
    </div>
  );
}
