
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Star, BookOpen, Clock, ChevronRight, Moon, Sun, GraduationCap } from 'lucide-react';
import { PAPERS, TAG_COLORS, PAPER_HTML_MAP } from '../data/papers';

export default function ResearchPaperContent() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const iframeRef   = useRef(null);
  const cleanupRef  = useRef(null);

  const [readProgress, setReadProgress] = useState(0);
  const [isLoaded,     setIsLoaded]     = useState(false);
  const [paperTheme,   setPaperTheme]   = useState('dark');
  const [hasQuiz,      setHasQuiz]      = useState(false);

  const htmlFile = PAPER_HTML_MAP[slug] ?? null;
  const paper    = PAPERS.find(p => p.slug === slug) ?? null;
  const accent   = paper ? (TAG_COLORS[paper.tags[0]] || '#e0a050') : '#e0a050';

  /* Esc → back ---------------------------------------------------------- */
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') navigate('/research/papers'); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [navigate]);

  /* Cleanup scroll listener on unmount / slug change ------------------- */
  useEffect(() => () => cleanupRef.current?.(), [slug]);

  /* Track iframe scroll → reading progress ----------------------------- */
  const handleLoad = () => {
    setIsLoaded(true);
    cleanupRef.current?.();
    try {
      const iDoc = iframeRef.current?.contentDocument;
      const iWin = iframeRef.current?.contentWindow;
      if (!iDoc || !iWin) return;

      /* Consolidate the header: hide the paper's own internal navbar (the app
         already provides one), read its theme, and detect a quiz section. */
      try {
        if (!iDoc.getElementById('rpc-injected')) {
          const st = iDoc.createElement('style');
          st.id = 'rpc-injected';
          st.textContent =
            /* Hide the paper's own navbar — the app already provides one. */
            'nav{display:none!important}' +
            /* PERF fallback: the paper files themselves drop backdrop-filter at
               the source (style#rpc-perf-v1) so the blur is never painted. This
               mirror keeps any unpatched/older paper smooth in-app too — live
               backdrop blur on 13–18 layers is the main scroll/paint cost. */
            '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
          iDoc.head.appendChild(st);
        }
        // Dark is the default — force it every time a paper opens
        iDoc.documentElement.setAttribute('data-theme', 'dark');
        try { iWin.localStorage.setItem('paper-theme', 'dark'); } catch { /* ignore */ }
        setPaperTheme('dark');
        setHasQuiz(!!iDoc.querySelector('#squiz, #quiz, .quiz, [id*="quiz"]'));
      } catch { /* cross-origin or not ready — keep internal nav as fallback */ }

      /* Reading-progress tracking, rAF-throttled. The previous handler ran on
         every scroll event — each one forced a reflow (scrollHeight/clientHeight)
         AND a React re-render, which is its own source of scroll-time jank.
         Now we coalesce to at most one measurement per frame and only re-render
         when the rounded percentage actually changes. */
      const raf = iWin.requestAnimationFrame || window.requestAnimationFrame;
      const caf = iWin.cancelAnimationFrame || window.cancelAnimationFrame;
      let rafId = 0;
      let lastPct = -1;
      const measure = () => {
        rafId = 0;
        const el  = iDoc.documentElement;
        const top = el.scrollTop || iDoc.body?.scrollTop || 0;
        const h   = el.scrollHeight - el.clientHeight;
        const pct = h > 0 ? Math.min(100, Math.round((top / h) * 100)) : 0;
        if (pct !== lastPct) { lastPct = pct; setReadProgress(pct); }
      };
      const onScroll = () => { if (!rafId) rafId = raf(measure); };
      iWin.addEventListener('scroll', onScroll, { passive: true });
      cleanupRef.current = () => {
        try { iWin.removeEventListener('scroll', onScroll); } catch { /* ignore */ }
        try { if (rafId) caf(rafId); } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
  };

  /* Drive the paper's theme from the app navbar (iframe is same-origin) ---- */
  const togglePaperTheme = () => {
    try {
      const iDoc = iframeRef.current?.contentDocument;
      const iWin = iframeRef.current?.contentWindow;
      if (!iDoc) return;
      const next = iDoc.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      iDoc.documentElement.setAttribute('data-theme', next);
      try { iWin.localStorage.setItem('paper-theme', next); } catch { /* ignore */ }
      setPaperTheme(next);
    } catch { /* ignore */ }
  };

  /* Smooth-scroll the iframe to its quiz section ------------------------- */
  const jumpToQuiz = () => {
    try {
      const iDoc = iframeRef.current?.contentDocument;
      iDoc?.querySelector('#squiz, #quiz, .quiz, [id*="quiz"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { /* ignore */ }
  };

  /* ── 404 state ─────────────────────────────────────────────────────── */
  if (!htmlFile) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: '18px',
        background: 'var(--color-app-bg)',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '20px',
          background: 'rgba(224,160,80,0.07)', border: '1px solid rgba(224,160,80,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <BookOpen size={28} color="rgba(224,160,80,0.5)" />
        </div>
        <p style={{ fontSize: '15px', color: 'rgba(180,185,210,0.5)', fontWeight: 600 }}>
          Paper not found.
        </p>
        <button
          onClick={() => navigate('/research/papers')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '10px 20px', borderRadius: '100px',
            background: 'linear-gradient(135deg, rgba(224,160,80,0.12) 0%, rgba(224,160,80,0.05) 100%)',
            border: '1px solid rgba(224,160,80,0.25)',
            color: '#e0a050', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.5} /> Back to Papers
        </button>
      </div>
    );
  }

  /* ── Main layout ────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', viewTransitionName: 'paper-hero' }}>

      {/* ════════════════════════════════════════════════════════════════
          NAVBAR
          ════════════════════════════════════════════════════════════════ */}
      <nav style={{
        position: 'relative', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '11px',
        padding: '0 16px', height: '54px',
        background: 'linear-gradient(180deg, rgba(9,9,20,0.98) 0%, rgba(7,7,16,0.95) 100%)',
        backdropFilter: 'blur(28px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
        borderBottom: '1px solid rgba(255,255,255,0.065)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.35)',
      }}>

        {/* ── Left: Back button ──────────────────────────────────────── */}
        <button
          className="rpc-back"
          onClick={() => navigate('/research/papers')}
          title="Back to Papers (Esc)"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '7px 14px', borderRadius: '100px', flexShrink: 0,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(200,205,225,0.7)', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em',
            transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset',
          }}
        >
          <ArrowLeft size={13} strokeWidth={2.5} />
          Papers
        </button>

        {/* breadcrumb chevron */}
        <ChevronRight size={13} style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />

        {/* ── Center: Paper icon + title + meta ──────────────────────── */}
        {paper && (
          <>
            {/* Icon badge */}
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
              background: `linear-gradient(135deg, ${accent}18 0%, ${accent}08 100%)`,
              border: `1px solid ${accent}28`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 16px ${accent}14, 0 1px 0 rgba(255,255,255,0.05) inset`,
            }}>
              <BookOpen size={14} color={accent} />
            </div>

            {/* Title + authors */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '12.5px', fontWeight: 700,
                color: 'rgba(235,238,255,0.92)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                lineHeight: 1.2, letterSpacing: '-0.01em',
              }}>
                {paper.title}
              </div>
              <div style={{
                fontSize: '10.5px',
                color: 'rgba(160,165,190,0.5)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginTop: '2px', letterSpacing: '0.01em',
              }}>
                {paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ' et al.' : ''}
                &nbsp;·&nbsp;{paper.venue}&nbsp;·&nbsp;{paper.year}
              </div>
            </div>

            {/* Tag chips */}
            <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
              {paper.tags.slice(0, 2).map(tag => {
                const c = TAG_COLORS[tag] || accent;
                return (
                  <span key={tag} className="rpc-tag-chip" style={{
                    fontSize: '9.5px', fontWeight: 700, padding: '3px 9px',
                    borderRadius: '100px', color: c,
                    background: `${c}0e`, border: `1px solid ${c}22`,
                    letterSpacing: '0.03em', whiteSpace: 'nowrap',
                  }}>
                    {tag}
                  </span>
                );
              })}
            </div>

            {/* Star count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, opacity: 0.65 }}>
              <Star size={11} color="#fbbf24" fill="#fbbf24" />
              <span style={{ fontSize: '11px', color: 'rgba(200,205,225,0.7)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {paper.stars}
              </span>
            </div>
          </>
        )}

        {/* ── Right: actions ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: paper ? 0 : 'auto' }}>

          {/* Progress pill — appears once you start scrolling */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', borderRadius: '100px',
            background: readProgress > 0 ? `${accent}0e` : 'rgba(255,255,255,0.03)',
            border: readProgress > 0 ? `1px solid ${accent}22` : '1px solid rgba(255,255,255,0.07)',
            transition: 'all 0.3s ease',
            minWidth: '54px', justifyContent: 'center',
          }}>
            {readProgress > 0
              ? <><Clock size={9} color={accent} /><span style={{ fontSize: '10px', fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>{readProgress}%</span></>
              : <><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', animation: 'rpc-pulse 2s ease infinite' }} /><span style={{ fontSize: '9.5px', color: 'rgba(180,185,210,0.3)', fontWeight: 600 }}>0%</span></>
            }
          </div>

          {/* PDF / external link */}
          {paper?.url && paper.url !== '#' && (
            <a
              className="rpc-pdf"
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open original paper"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '7px 13px', borderRadius: '10px', textDecoration: 'none',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(200,205,225,0.55)',
                fontSize: '11.5px', fontWeight: 600,
                transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
                letterSpacing: '0.01em',
              }}
            >
              <ExternalLink size={11} />
              PDF
            </a>
          )}

          {/* Quiz jump — only if the paper has a quiz section */}
          {hasQuiz && (
            <button
              onClick={jumpToQuiz}
              title="Jump to quiz"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '7px 12px', borderRadius: '10px', cursor: 'pointer',
                background: `${accent}0e`, border: `1px solid ${accent}28`,
                color: accent, fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.01em',
                transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${accent}1c`; e.currentTarget.style.borderColor = `${accent}44`; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${accent}0e`; e.currentTarget.style.borderColor = `${accent}28`; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <GraduationCap size={12} />
              Quiz
            </button>
          )}

          {/* Theme toggle — drives the paper iframe (same-origin) */}
          <button
            className="rpc-iconbtn"
            onClick={togglePaperTheme}
            title={paperTheme === 'dark' ? 'Paper: switch to light' : 'Paper: switch to dark'}
            aria-label="Toggle paper theme"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '32px', height: '32px', borderRadius: '9px', cursor: 'pointer', flexShrink: 0,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(200,205,225,0.7)',
              transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
            }}
          >
            {paperTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Esc shortcut hint */}
          <kbd style={{
            fontSize: '9.5px', fontWeight: 700, padding: '3px 7px', borderRadius: '6px',
            background: 'rgba(255,255,255,0.04)', color: 'rgba(180,185,210,0.3)',
            border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'inherit',
            userSelect: 'none', letterSpacing: '0.02em',
          }}>Esc</kbd>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════════
          IFRAME — paper content
          ════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#07090c' }}>

        {/* Skeleton loader — mirrors the paper hero until the iframe loads.
            Papers always open in dark mode (handleLoad forces data-theme="dark"),
            so the skeleton is pinned to a dark backdrop regardless of the app's
            light/dark theme — otherwise the white shimmer is invisible on a
            light --color-app-bg and the loader looks like a blank screen. */}
        {!isLoaded && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'linear-gradient(180deg, #0a0a14 0%, #07070e 100%)', overflow: 'hidden',
            animation: 'rpc-fade 0.2s ease',
          }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '74px 40px 0', display: 'flex', flexDirection: 'column' }}>
              {/* kicker */}
              <div className="rpc-skel" style={{ width: '176px', height: '13px', marginBottom: '34px', opacity: 0.7 }} />
              {/* title lines */}
              <div className="rpc-skel" style={{ width: '86%', height: '40px', marginBottom: '15px' }} />
              <div className="rpc-skel" style={{ width: '64%', height: '40px', marginBottom: '40px' }} />
              {/* meta cards row (matches the 4-cell single-line layout) */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '40px', maxWidth: '760px' }}>
                {[2.4, 0.7, 1.3, 1.8].map((f, i) => (
                  <div key={i} className="rpc-skel" style={{ flex: `${f} 1 0`, height: '60px', borderRadius: '12px' }} />
                ))}
              </div>
              {/* abstract lines */}
              {[100, 97, 92].map((w, i) => (
                <div key={i} className="rpc-skel" style={{ width: `${w}%`, height: '13px', marginBottom: '13px', opacity: 0.6 }} />
              ))}
              {/* tag pills */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '22px' }}>
                {[74, 92, 80, 60].map((w, i) => (
                  <div key={i} className="rpc-skel" style={{ width: `${w}px`, height: '26px', borderRadius: '100px', opacity: 0.5 }} />
                ))}
              </div>
            </div>

            {/* subtle loading hint */}
            <div style={{
              position: 'absolute', bottom: '26px', left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: '9px',
              color: 'rgba(180,185,210,0.4)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.02em',
            }}>
              <div style={{
                width: '14px', height: '14px', borderRadius: '50%',
                border: `2px solid ${accent}33`, borderTopColor: accent,
                animation: 'rpc-spin 0.7s linear infinite',
              }} />
              Loading {paper?.title?.split(' ')[0]?.trim() ?? 'paper'}…
            </div>
          </div>
        )}

        {/* Iframe */}
        <iframe
          ref={iframeRef}
          src={htmlFile}
          title={paper?.title ?? slug}
          onLoad={handleLoad}
          style={{
            width: '100%', height: '100%',
            border: 'none', display: 'block',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.35s ease',
          }}
        />
      </div>
    </div>
  );
}
