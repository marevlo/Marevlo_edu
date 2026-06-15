import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Code2, BookOpen, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/*
 * Job board unlock gate.
 *
 * Locked state redesigned to match the Marevlo design system (Plan / Courses
 * heroes): grid backdrop, indigo → cyan glows, eyebrow pill, gradient
 * headline, themed progress cards and gradient CTA. Everything is scoped
 * under `.mv-jobgate` and uses theme tokens so light/dark adapt automatically.
 * Gate logic (API call, thresholds, copy) is unchanged.
 */

const CSS = `
.mv-jobgate{
  --mv-line: rgba(15,23,42,.09);
  --mv-line-strong: rgba(15,23,42,.16);
  --mv-shadow: 0 1px 2px rgba(15,23,42,.04), 0 14px 34px -16px rgba(15,23,42,.20);
  --mv-shadow-lift: 0 2px 6px rgba(15,23,42,.06), 0 28px 60px -22px rgba(79,70,229,.30);

  position:relative; overflow:hidden;
  display:flex; align-items:center; justify-content:center;
  min-height:100%; width:100%; padding:48px 24px;
  font-family: var(--font-sans, "DM Sans", system-ui, sans-serif);
  color:var(--foreground); background:var(--background);
  line-height:1.5; -webkit-font-smoothing:antialiased;
}
.dark .mv-jobgate{
  --mv-line: rgba(255,255,255,.09);
  --mv-line-strong: rgba(255,255,255,.16);
  --mv-shadow: 0 1px 2px rgba(0,0,0,.3), 0 14px 34px -16px rgba(0,0,0,.55);
  --mv-shadow-lift: 0 2px 6px rgba(0,0,0,.4), 0 28px 60px -22px rgba(0,0,0,.65);
}
.mv-jobgate *{box-sizing:border-box;margin:0;padding:0}

/* ── backdrop: grid + glows (matches Plan / Courses heroes) ── */
.mv-jobgate .grid-bg{position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(148,163,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.06) 1px,transparent 1px);
  background-size:44px 44px;
  -webkit-mask-image:radial-gradient(circle at center,#000 20%,transparent 85%);
  mask-image:radial-gradient(circle at center,#000 20%,transparent 85%)}
.mv-jobgate .glow{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;opacity:.5}
.mv-jobgate .glow.a{top:-140px;left:8%;width:340px;height:340px;background:radial-gradient(circle,rgba(102,114,224,.45),transparent 65%)}
.mv-jobgate .glow.b{bottom:-160px;right:6%;width:360px;height:360px;background:radial-gradient(circle,rgba(63,169,201,.38),transparent 65%)}

.mv-jobgate .inner{position:relative;z-index:1;max-width:520px;width:100%;text-align:center}

/* ── lock badge (gradient ring) ── */
.mv-jobgate .lock-badge{display:inline-flex;align-items:center;justify-content:center;
  width:68px;height:68px;border-radius:20px;margin-bottom:18px;
  border:1.5px solid transparent;color:var(--primary);
  background:linear-gradient(var(--card),var(--card)) padding-box,
            linear-gradient(135deg,var(--primary),var(--secondary)) border-box;
  box-shadow:0 16px 38px -16px color-mix(in srgb,var(--primary) 55%,transparent)}

.mv-jobgate .eyebrow{display:inline-flex;align-items:center;gap:7px;margin-bottom:18px;padding:5px 14px;border-radius:999px;
  backdrop-filter:blur(8px);background:rgba(15,23,42,.04);border:1px solid rgba(15,23,42,.08);
  font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b}
.dark .mv-jobgate .eyebrow{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.09);color:rgba(255,255,255,.5)}

.mv-jobgate h1{font-weight:900;font-size:clamp(2rem,4.5vw,2.75rem);letter-spacing:-.03em;line-height:1.08;margin:0 0 12px;
  background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 35%,#0369a1 65%,#6672e0 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.dark .mv-jobgate h1{background:linear-gradient(135deg,#fff 0%,#e0e7ff 35%,#a5f3fc 65%,#98a0ed 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}

.mv-jobgate .lede{margin:0 auto 30px;max-width:420px;font-size:.93rem;line-height:1.7;color:#475569}
.dark .mv-jobgate .lede{color:rgba(255,255,255,.62)}
.mv-jobgate .lede strong{color:var(--foreground);font-weight:700}

/* ── progress cards ── */
.mv-jobgate .cards{display:flex;flex-direction:column;gap:14px;margin-bottom:28px;text-align:left}
.mv-jobgate .pcard{background:var(--card);border:1px solid var(--mv-line);border-radius:16px;padding:20px 22px;
  box-shadow:var(--mv-shadow);transition:transform .26s ease,box-shadow .26s ease,border-color .26s ease}
.mv-jobgate .pcard:hover{transform:translateY(-3px);box-shadow:var(--mv-shadow-lift);
  border-color:color-mix(in srgb,var(--primary) 35%,transparent)}
.mv-jobgate .pcard .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px}
.mv-jobgate .pcard .title{display:inline-flex;align-items:center;gap:9px;font-size:14px;font-weight:700;color:var(--foreground)}
.mv-jobgate .pcard .title .ic{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;
  color:var(--primary);background:color-mix(in srgb,var(--primary) 12%,transparent)}
.mv-jobgate .pcard .count{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--muted-foreground);white-space:nowrap}
.mv-jobgate .pcard .count.met{color:#41bd78}

.mv-jobgate .track{height:9px;border-radius:999px;background:var(--muted);overflow:hidden;
  box-shadow:inset 0 1px 2px rgba(15,23,42,.06)}
.dark .mv-jobgate .track{box-shadow:inset 0 1px 2px rgba(0,0,0,.4)}
.mv-jobgate .fill{height:100%;border-radius:999px;min-width:0;
  background:linear-gradient(90deg,#6672e0,#3fa9c9);
  transition:width .8s cubic-bezier(.4,0,.2,1)}
.mv-jobgate .fill.met{background:linear-gradient(90deg,#2fae6e,#41bd78)}

.mv-jobgate .pcard .status{font-size:12px;color:var(--muted-foreground);margin-top:9px}
.mv-jobgate .pcard .status.met{display:inline-flex;align-items:center;gap:5px;color:#41bd78;font-weight:600}

/* ── CTAs ── */
.mv-jobgate .ctas{display:flex;gap:12px}
.mv-jobgate .cta{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;
  font-family:inherit;font-weight:700;font-size:14px;padding:12px 16px;border-radius:12px;cursor:pointer;
  border:1px solid var(--mv-line-strong);background:transparent;color:var(--foreground);
  transition:background .2s,color .2s,border-color .2s,transform .1s,box-shadow .2s,filter .2s}
.mv-jobgate .cta:hover{border-color:color-mix(in srgb,var(--primary) 55%,transparent);
  background:color-mix(in srgb,var(--primary) 8%,transparent);color:var(--primary)}
.mv-jobgate .cta:active{transform:scale(.985)}
.mv-jobgate .cta.solid{background:linear-gradient(135deg,var(--primary),var(--secondary));border-color:transparent;color:#fff;
  box-shadow:0 12px 26px -12px color-mix(in srgb,var(--primary) 85%,transparent)}
.mv-jobgate .cta.solid:hover{filter:brightness(1.06);color:#fff;transform:translateY(-1px)}

/* ── loading state ── */
.mv-jobgate .checking{display:inline-flex;align-items:center;gap:10px;font-size:14px;color:var(--muted-foreground)}
.mv-jobgate .spinner{width:16px;height:16px;border-radius:50%;
  border:2px solid color-mix(in srgb,var(--primary) 25%,transparent);border-top-color:var(--primary);
  animation:mvSpin .7s linear infinite}
@keyframes mvSpin{to{transform:rotate(360deg)}}

/* ── motion ── */
.mv-jobgate .reveal{opacity:0;transform:translateY(14px);animation:mvRise .7s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes mvRise{to{opacity:1;transform:none}}

@media(max-width:480px){
  .mv-jobgate .ctas{flex-direction:column}
}
@media (prefers-reduced-motion: reduce){
  .mv-jobgate .reveal{animation:none;opacity:1;transform:none}
  .mv-jobgate .fill{transition:none}
}
`;

function ProgressCard({ icon: Icon, title, completed, total, pct, unitLabel, delay }) {
    const met = pct >= 75;
    const remaining = Math.max(0, Math.ceil((0.75 * total) - completed));
    return (
        <div className="pcard reveal" style={{ animationDelay: delay }}>
            <div className="head">
                <span className="title">
                    <span className="ic"><Icon size={15} /></span>
                    {title}
                </span>
                <span className={`count${met ? ' met' : ''}`}>{completed} / {total} · {pct}%</span>
            </div>
            <div className="track">
                <div className={`fill${met ? ' met' : ''}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            {met
                ? <span className="status met"><CheckCircle2 size={13} /> Requirement met</span>
                : <div className="status">{remaining} more {unitLabel} to go</div>
            }
        </div>
    );
}

function LockedJobBoard({ problemsPct, problemsCompleted, problemsTotal, coursesPct, lessonsCompleted, lessonsTotal }) {
    const navigate = useNavigate();

    return (
        <div className="mv-jobgate">
            <style>{CSS}</style>
            <div className="grid-bg" aria-hidden="true" />
            <span className="glow a" aria-hidden="true" />
            <span className="glow b" aria-hidden="true" />

            <div className="inner">
                <div className="lock-badge reveal" style={{ animationDelay: '.05s' }}>
                    <Lock size={26} />
                </div>
                <div>
                    <div className="eyebrow reveal" style={{ animationDelay: '.1s' }}>
                        <Lock size={10} style={{ color: '#3fa9c9' }} />
                        Job Board · Locked
                    </div>
                </div>
                <h1 className="reveal" style={{ animationDelay: '.16s' }}>Jobs Locked</h1>
                <p className="lede reveal" style={{ animationDelay: '.22s' }}>
                    Complete <strong>75% of problems</strong> and <strong>75% of course lessons</strong> to unlock job opportunities.
                </p>

                <div className="cards">
                    <ProgressCard
                        icon={Code2}
                        title="Problems Solved"
                        completed={problemsCompleted}
                        total={problemsTotal}
                        pct={problemsPct}
                        unitLabel="problems"
                        delay=".3s"
                    />
                    <ProgressCard
                        icon={BookOpen}
                        title="Course Lessons"
                        completed={lessonsCompleted}
                        total={lessonsTotal}
                        pct={coursesPct}
                        unitLabel="lessons"
                        delay=".38s"
                    />
                </div>

                <div className="ctas reveal" style={{ animationDelay: '.46s' }}>
                    <button type="button" className="cta" onClick={() => navigate('/problems')}>
                        Go to Problems
                    </button>
                    <button type="button" className="cta solid" onClick={() => navigate('/courses')}>
                        Go to Courses <ArrowRight size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function JobBoardGuard({ children }) {
    const { user } = useAuth();
    const [status, setStatus] = useState(undefined);

    useEffect(() => {
        if (!user) return;
        setStatus(undefined);
        const controller = new AbortController();
        const token = localStorage.getItem('access_token');
        fetch(`${import.meta.env.VITE_API_URL}/unlock/job-board`, {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setStatus(data))
            .catch((err) => { if (err.name !== 'AbortError') setStatus(false); });
        return () => controller.abort();
    }, [user]);

    if (!user) return children;

    if (status === undefined) {
        return (
            <div className="mv-jobgate">
                <style>{CSS}</style>
                <span className="checking">
                    <span className="spinner" aria-hidden="true" />
                    Checking access…
                </span>
            </div>
        );
    }

    if (status === false || status.unlocked) return children;

    return (
        <LockedJobBoard
            problemsPct={status.problems.pct}
            problemsCompleted={status.problems.completed}
            problemsTotal={status.problems.total}
            coursesPct={status.courses.pct}
            lessonsCompleted={status.courses.lessons_completed}
            lessonsTotal={status.courses.lessons_total}
        />
    );
}
