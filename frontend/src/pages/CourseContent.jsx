import React, {
  useState, useEffect, useCallback, useRef, useMemo, memo,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  Maximize2, Minimize2, AlertTriangle,
  LayoutGrid, X, Clock,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useContentProtection, protectIframe } from "../utils/contentProtection";
import { COURSE_HTML_MAP, formatTitle, getGroup, getGroupSiblings } from "../data/courseMap";

// ─── Constants ────────────────────────────────────────────────────────────────

const WORDS_PER_MINUTE  = 200;
const FONT_SIZE_MIN     = 12;
const FONT_SIZE_MAX     = 24;
const FONT_SIZE_STEP    = 2;
const FONT_SIZE_DEFAULT = 16;
const TOPBAR_HEIGHT     = 52;
const MAX_RECENT        = 10;
const LS_RECENT_KEY     = "marevlo_recent";
const IFRAME_DARK_ID    = "mv-theme";
const IFRAME_FONT_ID    = "mv-font";


// ─── Shared style tokens ──────────────────────────────────────────────────────

const S = {
  primaryBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    padding: "6px 14px", borderRadius: "8px",
    background: "var(--color-primary-text)", color: "var(--color-app-bg)",
    border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600,
    flexShrink: 0,
  },
  outlineBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    padding: "8px 16px", borderRadius: "8px",
    border: "1px solid var(--color-border)", background: "transparent",
    cursor: "pointer", color: "var(--color-primary-text)",
    fontSize: "13px", fontWeight: 600,
  },
  iconBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "32px", height: "32px", borderRadius: "8px",
    border: "1px solid var(--color-border)", background: "transparent",
    cursor: "pointer", color: "var(--color-muted-text)",
    flexShrink: 0,
  },
  compactBtn: {
    display: "flex", alignItems: "center", gap: "3px",
    padding: "5px 9px", borderRadius: "8px",
    border: "1px solid var(--color-border)", background: "transparent",
    cursor: "pointer", color: "var(--color-primary-text)",
    fontSize: "11px", fontWeight: 600, flexShrink: 0,
  },
};

// ─── Pure utilities ───────────────────────────────────────────────────────────

function getWordCount(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getBackgroundLuminance(doc) {
  const parts =
    window.getComputedStyle(doc.body).backgroundColor.match(/\d+/g) ??
    ["255", "255", "255"];
  const [r, g, b] = parts.map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function persistRecentlyViewed(id, group) {
  try {
    const prev  = JSON.parse(localStorage.getItem(LS_RECENT_KEY) ?? "[]");
    const entry = { id, title: formatTitle(id), group: group.label, category: group.category, visitedAt: Date.now() };
    const next  = [entry, ...prev.filter((r) => r.id !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(LS_RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — non-fatal
  }
}

function injectDarkMode(doc, isDark) {
  doc.getElementById(IFRAME_DARK_ID)?.remove();
  if (!isDark) return;
  if (getBackgroundLuminance(doc) <= 0.5) return; // already dark

  const style = doc.createElement("style");
  style.id = IFRAME_DARK_ID;
  style.textContent = [
    "html { filter: invert(1) hue-rotate(180deg); }",
    "img, video, canvas, svg image { filter: invert(1) hue-rotate(180deg); }",
  ].join("\n");
  doc.head.appendChild(style);
}

function injectFontSize(doc, size) {
  doc.getElementById(IFRAME_FONT_ID)?.remove();
  if (size === FONT_SIZE_DEFAULT) return;

  const style = doc.createElement("style");
  style.id = IFRAME_FONT_ID;
  style.textContent = `html { font-size: ${size}px !important; }`;
  doc.head.appendChild(style);
}

// ─── Custom hooks ─────────────────────────────────────────────────────────────

function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
}

function useCourseData(htmlFile) {
  const [status,   setStatus]   = useState("idle");
  const [readTime, setReadTime] = useState(null);

  useEffect(() => {
    if (!htmlFile) { setStatus("idle"); setReadTime(null); return; }

    setStatus("loading");
    setReadTime(null);

    const controller = new AbortController();

    fetch(htmlFile, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => {
        const minutes = Math.max(1, Math.round(getWordCount(html) / WORDS_PER_MINUTE));
        setReadTime(minutes);
        setStatus("ready");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [htmlFile]);

  return { status, readTime };
}

function useIframeStyles(iframeRef, { isDark, fontSize, isLoaded }) {
  const inject = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc?.head) return;
      injectDarkMode(doc, isDark);
      injectFontSize(doc, fontSize);
    } catch {
      // Cross-origin or document not ready — silently skip
    }
  }, [iframeRef, isDark, fontSize]);

  useEffect(() => {
    if (isLoaded) inject();
  }, [isLoaded, inject]);

  return inject;
}

function useKeyboardShortcuts({ onBack, onNext, onEscapeAll }) {
  useEffect(() => {
    const handle = (e) => {
      if (e.key === "Escape") { onEscapeAll(); return; }
      if (e.altKey && e.key === "ArrowLeft")  { e.preventDefault(); onBack(); return; }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onBack, onNext, onEscapeAll]);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Spinner = () => (
  <div
    aria-hidden="true"
    style={{
      width: "18px", height: "18px", flexShrink: 0,
      border: "2px solid currentColor", borderTopColor: "transparent",
      borderRadius: "50%", animation: "cc-spin 0.7s linear infinite",
    }}
  />
);

const LoadingOverlay = memo(({ topOffset }) => (
  <div
    role="status"
    aria-label="Loading course content"
    style={{
      position: "absolute", inset: 0, top: topOffset, zIndex: 10,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--color-app-bg)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--color-muted-text)", fontSize: "14px", fontWeight: 500 }}>
      <Spinner />
      Loading module…
    </div>
  </div>
));
LoadingOverlay.displayName = "LoadingOverlay";

const ErrorView = memo(({ id, onBack, onSkipNext }) => (
  <div
    role="alert"
    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "24px" }}
  >
    <AlertTriangle size={36} aria-hidden="true" style={{ color: "#f87171" }} />
    <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-primary-text)", margin: 0 }}>
      Module not found
    </p>
    <p style={{ fontSize: "13px", color: "var(--color-muted-text)", margin: 0, textAlign: "center" }}>
      The file for{" "}
      <code style={{ background: "var(--color-surface-hover)", padding: "2px 6px", borderRadius: "4px" }}>
        {id}
      </code>{" "}
      could not be loaded.
    </p>
    <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
      <button onClick={onBack} style={S.outlineBtn}>
        <ArrowLeft size={13} aria-hidden="true" /> Back to Courses
      </button>
      {onSkipNext && (
        <button onClick={onSkipNext} style={S.primaryBtn}>
          Skip to Next <ChevronRight size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  </div>
));
ErrorView.displayName = "ErrorView";

const FullscreenPill = memo(({ onExit }) => (
  <button
    onClick={onExit}
    aria-label="Exit fullscreen"
    title="Exit fullscreen (Esc)"
    style={{
      position: "fixed", top: "14px", right: "16px", zIndex: 50,
      display: "flex", alignItems: "center", gap: "6px",
      padding: "6px 14px", borderRadius: "999px",
      background: "rgba(0,0,0,0.65)", color: "#fff",
      border: "1px solid rgba(255,255,255,0.15)",
      backdropFilter: "blur(8px)",
      cursor: "pointer", fontSize: "12px", fontWeight: 600,
    }}
  >
    <Minimize2 size={13} aria-hidden="true" /> Exit Fullscreen
  </button>
));
FullscreenPill.displayName = "FullscreenPill";

const ModuleMapPanel = memo(({ group, siblings, currentId, onClose, onNavigate, siblingIndex }) => {
  const progress = siblings.length > 1 ? (siblingIndex / (siblings.length - 1)) * 100 : 100;
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="cc-map-overlay"
        style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      />
      <aside
        aria-label={`${group.label} module list`}
        className="cc-map-panel"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "310px", zIndex: 50,
          display: "flex", flexDirection: "column",
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-24px 0 80px rgba(0,0,0,0.35)",
        }}
      >
        {/* Panel header */}
        <header style={{ padding: "18px 16px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-primary-text)", margin: 0, letterSpacing: "-0.015em", lineHeight: 1.3 }}>
                {group.label}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "2px 8px", borderRadius: "999px",
                  background: "rgba(102,114,224,0.12)", border: "1px solid rgba(102,114,224,0.25)",
                  fontSize: "10px", fontWeight: 600, color: "#98a0ed",
                }}>
                  {group.category}
                </span>
                <span style={{ fontSize: "11px", color: "var(--color-muted-text)" }}>
                  {siblings.length} module{siblings.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close module map"
              className="cc-icon-btn"
              style={{ ...S.iconBtn, flexShrink: 0, marginLeft: "8px" }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: "1px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "10px", color: "var(--color-muted-text)", fontVariantNumeric: "tabular-nums" }}>
                Module {siblingIndex + 1} of {siblings.length}
              </span>
              <span style={{ fontSize: "10px", fontWeight: 600, color: "#98a0ed", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(progress)}%
              </span>
            </div>
            <div style={{ height: "3px", borderRadius: "3px", background: "var(--color-surface-hover)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: "3px",
                width: `${progress}%`,
                background: "linear-gradient(90deg, #6672e0, #ab9df0)",
                transition: "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",
              }} />
            </div>
          </div>

          <div style={{ height: "1px", background: "var(--color-border)", margin: "14px -16px 0" }} />
        </header>

        {/* Module list */}
        <nav
          className="cc-map-scroll"
          aria-label="Module navigation"
          style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}
        >
          {siblings.map((sibId, idx) => {
            const isActive = sibId === currentId;
            return (
              <button
                key={sibId}
                onClick={() => onNavigate(sibId)}
                aria-current={isActive ? "page" : undefined}
                className="cc-map-item"
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  width: "100%", padding: "9px 12px", borderRadius: "10px",
                  border: isActive ? "1px solid rgba(102,114,224,0.35)" : "1px solid transparent",
                  cursor: "pointer", textAlign: "left", marginBottom: "1px",
                  background: isActive ? "linear-gradient(135deg, rgba(102,114,224,0.14), rgba(167,139,250,0.07))" : "transparent",
                  outline: "none",
                }}
              >
                <span style={{
                  fontSize: "9px", fontWeight: 700, fontFamily: "monospace",
                  color: isActive ? "#ab9df0" : "var(--color-muted-text)",
                  minWidth: "20px", textAlign: "right", flexShrink: 0,
                  fontVariantNumeric: "tabular-nums", letterSpacing: "0.03em",
                }}>
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span style={{
                  fontSize: "12px", fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--color-primary-text)" : "var(--color-muted-text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                  lineHeight: 1.4,
                }}>
                  {formatTitle(sibId)}
                </span>
                {isActive && (
                  <span aria-hidden="true" style={{
                    width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
                    background: "#98a0ed",
                    boxShadow: "0 0 8px rgba(129,140,248,0.7)",
                  }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Panel footer */}
        <footer style={{
          padding: "12px 16px", borderTop: "1px solid var(--color-border)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--color-surface)",
        }}>
          <span style={{ fontSize: "11px", color: "var(--color-muted-text)", fontVariantNumeric: "tabular-nums" }}>
            {siblingIndex + 1} / {siblings.length} &nbsp;·&nbsp; {group.label}
          </span>
        </footer>
      </aside>
    </>
  );
});
ModuleMapPanel.displayName = "ModuleMapPanel";

// ─── Main component ───────────────────────────────────────────────────────────

export default function CourseContent() {
  const { id }        = useParams();
  const navigate      = useNavigate();
  const location      = useLocation();
  const fromPathIds   = location.state?.fromPathIds ?? [];
  const iframeRef     = useRef(null);

  const [isLoaded,    setIsLoaded]    = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapOpen,     setMapOpen]     = useState(false);
  const [fontSize,    setFontSize]    = useState(FONT_SIZE_DEFAULT);

  const htmlFile = COURSE_HTML_MAP[id] ?? null;

  // Fire-and-forget: records lesson progress without blocking navigation
  const markLesson = useCallback((lessonId, courseId, lessonStatus) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    fetch(`${import.meta.env.VITE_API_URL}/learning/progress/${lessonId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ course_id: courseId, status: lessonStatus }),
    }).catch(() => {});
  }, []);

  // Derived navigation state — memoised to avoid recomputation on unrelated renders
  const { prevId, nextId, group, siblings, siblingIndex } = useMemo(() => {
    const sibs   = getGroupSiblings(id);
    const sibIdx = sibs.indexOf(id);
    return {
      prevId:       sibIdx > 0 ? sibs[sibIdx - 1] : null,
      nextId:       sibIdx < sibs.length - 1 ? sibs[sibIdx + 1] : null,
      group:        getGroup(id),
      siblings:     sibs,
      siblingIndex: sibIdx,
    };
  }, [id]);

  // Hooks
  const { isDark }          = useTheme();
  const { user }            = useAuth();
  useContentProtection({ user });  // watermark + screenshot deterrents for course content
  useLockBodyScroll();
  const { status, readTime } = useCourseData(htmlFile);
  const injectStyles        = useIframeStyles(iframeRef, { isDark, fontSize, isLoaded });

  const isError = status === "error";

  // Stable navigation callbacks
  const goBack = useCallback(
    () => navigate("/courses", { state: { pathIds: fromPathIds } }),
    [navigate, fromPathIds]
  );
  const goPrev = useCallback(
    () => prevId && navigate(`/course/${prevId}`, { state: { fromPathIds } }),
    [prevId, navigate, fromPathIds]
  );
  const goNext = useCallback(() => {
    if (!nextId) return;
    markLesson(id, group.prefix, 'completed');
    navigate(`/course/${nextId}`, { state: { fromPathIds } });
  }, [nextId, id, group.prefix, markLesson, navigate, fromPathIds]);

  useKeyboardShortcuts({
    onBack:      goBack,
    onNext:      goNext,
    onEscapeAll: useCallback(() => { setIsFullscreen(false); setMapOpen(false); }, []),
  });

  // Persist recently-viewed entry once the file is confirmed accessible
  useEffect(() => {
    if (htmlFile && status === "ready") {
      persistRecentlyViewed(id, group);
    }
  }, [id, htmlFile, status, group]);

  // Reset loaded state when course changes
  useEffect(() => { setIsLoaded(false); }, [id]);

  const handleIframeLoad = useCallback(() => {
    setIsLoaded(true);
    // Small delay lets the iframe document settle before style injection
    setTimeout(injectStyles, 60);
    protectIframe(iframeRef.current);  // disable right-click/copy inside the lesson
  }, [injectStyles]);

  const handleMapNavigate = useCallback((targetId) => {
    navigate(`/course/${targetId}`, { state: { fromPathIds } });
    setMapOpen(false);
  }, [navigate, fromPathIds]);

  // Mark lesson in_progress when content is ready
  useEffect(() => {
    if (status === 'ready') markLesson(id, group.prefix, 'in_progress');
  }, [id, status, group.prefix, markLesson]);

  const [markedDone, setMarkedDone] = useState(false);
  const handleMarkDone = useCallback(() => {
    markLesson(id, group.prefix, 'completed');
    setMarkedDone(true);
  }, [id, group.prefix, markLesson]);

  // Reset done state when navigating to a new lesson
  useEffect(() => { setMarkedDone(false); }, [id]);

  const decreaseFontSize = useCallback(() => setFontSize((s) => Math.max(FONT_SIZE_MIN, s - FONT_SIZE_STEP)), []);
  const increaseFontSize = useCallback(() => setFontSize((s) => Math.min(FONT_SIZE_MAX, s + FONT_SIZE_STEP)), []);

  // ── Guard: no HTML file registered for this ID ──────────────────────────────
  if (!htmlFile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "16px" }}>
        <AlertTriangle size={32} aria-hidden="true" style={{ color: "var(--color-muted-text)" }} />
        <p style={{ color: "var(--color-muted-text)", fontSize: "14px", margin: 0 }}>
          No content registered for this course ID.
        </p>
        <button onClick={goBack} style={S.outlineBtn}>
          <ArrowLeft size={14} aria-hidden="true" /> Back to Courses
        </button>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* Top bar */}
      {!isFullscreen && (
        <header
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", height: `${TOPBAR_HEIGHT}px`, flexShrink: 0,
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-surface)", gap: "8px",
          }}
        >
          {/* Left — back + divider + breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, overflow: "hidden" }}>
            <button onClick={goBack} title="Back to courses (Alt+←)" className="cc-back-btn" style={S.primaryBtn}>
              <ArrowLeft size={12} aria-hidden="true" /> Back
            </button>

            <div aria-hidden="true" style={{ width: "1px", height: "20px", background: "var(--color-border)", flexShrink: 0 }} />

            <nav aria-label="Course breadcrumb" style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, overflow: "hidden" }}>
              <span style={{ fontSize: "11px", color: "var(--color-muted-text)", whiteSpace: "nowrap" }}>
                {group.category}
              </span>
              <ChevronRight size={9} aria-hidden="true" style={{ color: "var(--color-border)", flexShrink: 0 }} />
              <span style={{ fontSize: "11px", color: "var(--color-muted-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}>
                {group.label}
              </span>
              <ChevronRight size={9} aria-hidden="true" style={{ color: "var(--color-border)", flexShrink: 0 }} />
              <span
                aria-current="page"
                style={{
                  fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                  color: "#98a0ed",
                  background: "rgba(102,114,224,0.12)",
                  border: "1px solid rgba(102,114,224,0.28)",
                  padding: "2px 9px", borderRadius: "999px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {siblingIndex + 1} / {siblings.length}
              </span>
            </nav>
          </div>

          {/* Right — controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>

            {/* Estimated read time */}
            {readTime != null && (
              <span style={{
                display: "flex", alignItems: "center", gap: "4px",
                fontSize: "10px", color: "var(--color-muted-text)",
                padding: "4px 9px", borderRadius: "7px",
                background: "var(--color-surface-hover)",
                whiteSpace: "nowrap",
              }}>
                <Clock size={10} aria-hidden="true" /> ~{readTime} min
              </span>
            )}

            <div aria-hidden="true" style={{ width: "1px", height: "18px", background: "var(--color-border)" }} />

            {/* Font size controls */}
            <div role="group" aria-label="Font size" style={{ display: "flex", alignItems: "center", gap: "1px" }}>
              <button
                onClick={decreaseFontSize}
                disabled={fontSize <= FONT_SIZE_MIN}
                aria-label="Decrease font size"
                className="cc-compact-btn"
                style={{ ...S.compactBtn, opacity: fontSize <= FONT_SIZE_MIN ? 0.3 : 1, padding: "5px 8px" }}
              >
                A−
              </button>
              <span
                aria-live="polite"
                style={{
                  fontSize: "10px", color: "var(--color-muted-text)",
                  minWidth: "30px", textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fontSize}px
              </span>
              <button
                onClick={increaseFontSize}
                disabled={fontSize >= FONT_SIZE_MAX}
                aria-label="Increase font size"
                className="cc-compact-btn"
                style={{ ...S.compactBtn, opacity: fontSize >= FONT_SIZE_MAX ? 0.3 : 1, padding: "5px 8px" }}
              >
                A+
              </button>
            </div>

            <div aria-hidden="true" style={{ width: "1px", height: "18px", background: "var(--color-border)" }} />

            {/* Prev / Next */}
            <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <button
                onClick={goPrev}
                disabled={!prevId}
                title={prevId ? `Previous: ${formatTitle(prevId)}` : undefined}
                aria-label={prevId ? `Previous module: ${formatTitle(prevId)}` : "No previous module"}
                className="cc-compact-btn"
                style={{ ...S.compactBtn, opacity: prevId ? 1 : 0.28, cursor: prevId ? "pointer" : "default" }}
              >
                <ChevronLeft size={12} aria-hidden="true" /> Prev
              </button>
              {nextId ? (
                <button
                  onClick={goNext}
                  title={`Next: ${formatTitle(nextId)}`}
                  aria-label={`Next module: ${formatTitle(nextId)}`}
                  className="cc-compact-btn"
                  style={S.compactBtn}
                >
                  Next <ChevronRight size={12} aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={handleMarkDone}
                  disabled={markedDone}
                  aria-label="Mark this module as complete"
                  className="cc-compact-btn"
                  style={{
                    ...S.compactBtn,
                    background: markedDone ? 'rgba(65,189,120,0.12)' : 'transparent',
                    borderColor: markedDone ? 'rgba(65,189,120,0.4)' : 'var(--color-border)',
                    color: markedDone ? '#41bd78' : 'var(--color-primary-text)',
                    opacity: markedDone ? 0.7 : 1,
                  }}
                >
                  {markedDone ? '✓ Done' : 'Mark Done'}
                </button>
              )}
            </div>

            <div aria-hidden="true" style={{ width: "1px", height: "18px", background: "var(--color-border)" }} />

            {/* Module map toggle */}
            <button
              onClick={() => setMapOpen((v) => !v)}
              aria-expanded={mapOpen}
              aria-label="Toggle module map"
              title="Module map"
              className="cc-icon-btn"
              style={{ ...S.iconBtn, background: mapOpen ? "rgba(102,114,224,0.12)" : "transparent", borderColor: mapOpen ? "rgba(102,114,224,0.35)" : "var(--color-border)" }}
            >
              <LayoutGrid size={14} aria-hidden="true" style={{ color: mapOpen ? "#98a0ed" : "inherit" }} />
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => setIsFullscreen(true)}
              aria-label="Enter fullscreen"
              title="Fullscreen (Esc to exit)"
              className="cc-icon-btn"
              style={S.iconBtn}
            >
              <Maximize2 size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
      )}

      {/* Fullscreen exit pill */}
      {isFullscreen && <FullscreenPill onExit={() => setIsFullscreen(false)} />}

      {/* Module map panel */}
      {mapOpen && (
        <ModuleMapPanel
          group={group}
          siblings={siblings}
          currentId={id}
          siblingIndex={siblingIndex}
          onClose={() => setMapOpen(false)}
          onNavigate={handleMapNavigate}
        />
      )}

      {/* Loading overlay */}
      {!isLoaded && !isError && (
        <LoadingOverlay topOffset={isFullscreen ? 0 : TOPBAR_HEIGHT} />
      )}

      {/* Error state */}
      {isError && (
        <ErrorView
          id={id}
          onBack={goBack}
          onSkipNext={nextId ? goNext : null}
        />
      )}

      {/* Course iframe */}
      {!isError && (
        <iframe
          key={id}
          ref={iframeRef}
          src={htmlFile}
          title={formatTitle(id)}
          onLoad={handleIframeLoad}
          allowFullScreen
          style={{
            flex: 1, border: "none", display: "block",
            opacity: isLoaded ? 1 : 0,
            transition: "opacity 220ms ease",
          }}
        />
      )}
    </div>
  );
}
