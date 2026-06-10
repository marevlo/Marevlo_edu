import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

// ─── Animated Typing Code Editor ────────────────────────────────────────────
const SNIPPETS = [
    {
        label: 'Two Sum · Hash Map',
        file: 'two_sum.py',
        accent: '#9180e8',
        lines: [
            { indent: 0, tokens: [{ t: 'comment', v: '# Two Sum — O(n) solution' }] },
            { indent: 0, tokens: [{ t: 'kw', v: 'def' }, { t: 'p', v: ' ' }, { t: 'fn', v: 'two_sum' }, { t: 'p', v: '(nums, target):' }] },
            { indent: 1, tokens: [{ t: 'p', v: 'seen = {}' }] },
            { indent: 1, tokens: [{ t: 'kw', v: 'for' }, { t: 'p', v: ' i, n ' }, { t: 'kw', v: 'in' }, { t: 'p', v: ' ' }, { t: 'fn', v: 'enumerate' }, { t: 'p', v: '(nums):' }] },
            { indent: 2, tokens: [{ t: 'kw', v: 'if' }, { t: 'p', v: ' target - n ' }, { t: 'kw', v: 'in' }, { t: 'p', v: ' seen:' }] },
            { indent: 3, tokens: [{ t: 'kw', v: 'return' }, { t: 'p', v: ' [seen[target-n], i]' }] },
            { indent: 2, tokens: [{ t: 'p', v: 'seen[n] = i' }] },
        ],
    },
    {
        label: 'BFS · Graph Traversal',
        file: 'bfs.py',
        accent: '#3fa9c9',
        lines: [
            { indent: 0, tokens: [{ t: 'comment', v: '# BFS — Level-order traversal' }] },
            { indent: 0, tokens: [{ t: 'kw', v: 'from' }, { t: 'p', v: ' collections ' }, { t: 'kw', v: 'import' }, { t: 'p', v: ' deque' }] },
            { indent: 0, tokens: [{ t: 'kw', v: 'def' }, { t: 'p', v: ' ' }, { t: 'fn', v: 'bfs' }, { t: 'p', v: '(graph, start):' }] },
            { indent: 1, tokens: [{ t: 'p', v: 'q = ' }, { t: 'fn', v: 'deque' }, { t: 'p', v: '([start])' }] },
            { indent: 1, tokens: [{ t: 'p', v: 'visited = {start}' }] },
            { indent: 1, tokens: [{ t: 'kw', v: 'while' }, { t: 'p', v: ' q:' }] },
            { indent: 2, tokens: [{ t: 'p', v: 'node = q.' }, { t: 'fn', v: 'popleft' }, { t: 'p', v: '()' }] },
        ],
    },
    {
        label: 'DP · Fibonacci',
        file: 'fib_dp.py',
        accent: '#6672e0',
        lines: [
            { indent: 0, tokens: [{ t: 'comment', v: '# Fibonacci — O(n) with DP' }] },
            { indent: 0, tokens: [{ t: 'kw', v: 'def' }, { t: 'p', v: ' ' }, { t: 'fn', v: 'fib' }, { t: 'p', v: '(n):' }] },
            { indent: 1, tokens: [{ t: 'kw', v: 'if' }, { t: 'p', v: ' n <= 1: ' }, { t: 'kw', v: 'return' }, { t: 'p', v: ' n' }] },
            { indent: 1, tokens: [{ t: 'p', v: 'dp = [0] * (n + 1)' }] },
            { indent: 1, tokens: [{ t: 'p', v: 'dp[1] = 1' }] },
            { indent: 1, tokens: [{ t: 'kw', v: 'for' }, { t: 'p', v: ' i ' }, { t: 'kw', v: 'in' }, { t: 'p', v: ' ' }, { t: 'fn', v: 'range' }, { t: 'p', v: '(2, n+1):' }] },
            { indent: 2, tokens: [{ t: 'p', v: 'dp[i] = dp[i-1] + dp[i-2]' }] },
        ],
    },
];

const TOKEN_COLORS = {
    dark: { kw: '#b39ae8', fn: '#8ed3e3', str: '#fcd34d', comment: '#6b7280', p: '#e2e8f0' },
    light: { kw: '#7c3aed', fn: '#35879f', str: '#b45309', comment: '#94a3b8', p: '#1e293b' },
};

// ─── Graph Nodes for BFS Viz ────────────────────────────────────────────────
const GRAPH_NODES = [
    { id: 'A', x: 50, y: 35 }, { id: 'B', x: 130, y: 15 },
    { id: 'C', x: 130, y: 60 }, { id: 'D', x: 210, y: 35 }, { id: 'E', x: 210, y: 70 },
];
const GRAPH_EDGES = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['C', 'E']];

// ─── Mini BFS Visualization ─────────────────────────────────────────────────
function MiniGraphViz({ step, accent, isDark }) {
    const visitOrder = ['A', 'B', 'C', 'D', 'E'];
    const numVisited = step >= 3 ? Math.min(step - 2, visitOrder.length) : 0;
    const visited = visitOrder.slice(0, numVisited);
    const current = visited.length > 0 ? visited[visited.length - 1] : null;

    return (
        <svg viewBox="0 0 260 85" className="w-full" style={{ maxHeight: 80 }}>
            {GRAPH_EDGES.map(([a, b]) => {
                const nA = GRAPH_NODES.find(n => n.id === a);
                const nB = GRAPH_NODES.find(n => n.id === b);
                const active = visited.includes(a) && visited.includes(b);
                return (
                    <line key={a + b} x1={nA.x} y1={nA.y} x2={nB.x} y2={nB.y}
                        stroke={active ? `${accent}90` : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.1)')}
                        strokeWidth={active ? 2.5 : 1.5}
                        style={{ transition: 'all 0.5s' }} />
                );
            })}
            {GRAPH_NODES.map(({ id, x, y }) => {
                const isVisited = visited.includes(id);
                const isCurrent = id === current;
                const fill = isCurrent ? accent : isVisited ? '#41bd78' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)');
                const idleStroke = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
                return (
                    <g key={id}>
                        {isCurrent && (
                            <circle cx={x} cy={y} r={18} fill="none" stroke={accent} strokeWidth={1.5} opacity={0.4}
                                style={{ animation: 'authPing 1.2s ease-out infinite' }} />
                        )}
                        <circle cx={x} cy={y} r={14} fill={fill}
                            stroke={isCurrent ? accent : isVisited ? '#41bd78' : idleStroke}
                            strokeWidth={isCurrent ? 2.5 : 2}
                            style={{ filter: isVisited || isCurrent ? `drop-shadow(0 0 8px ${fill})` : 'none', transition: 'all 0.5s' }} />
                        <text x={x} y={y + 4} textAnchor="middle" fill={isVisited || isCurrent ? '#fff' : (isDark ? '#555' : '#64748b')}
                            fontSize="10" fontWeight="800">{id}</text>
                    </g>
                );
            })}
        </svg>
    );
}

// ─── Mini Array Viz (Two Sum) ───────────────────────────────────────────────
function MiniArrayViz({ step, accent, isDark }) {
    const arr = [2, 7, 11, 15];
    const scanning = step >= 3 ? Math.min(step - 2, arr.length) : 0;
    const found = scanning >= 2;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground font-mono w-10 shrink-0">arr =</span>
                <div className="flex gap-1 relative">
                    {arr.map((n, i) => {
                        const isMatch = found && (i === 0 || i === 1);
                        const isScanned = i < scanning;
                        return (
                            <div key={i} className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border transition-all duration-500"
                                style={{
                                    background: isMatch ? `${accent}26` : isScanned ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)') : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.65)'),
                                    borderColor: isMatch ? accent : isScanned ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)') : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.08)'),
                                    color: isMatch ? (isDark ? '#fff' : '#312e81') : isScanned ? (isDark ? '#ccc' : '#334155') : (isDark ? '#555' : '#64748b'),
                                    boxShadow: isMatch ? `0 0 12px ${accent}50` : 'none',
                                    transform: isMatch ? 'scale(1.1)' : 'scale(1)',
                                }}>
                                {n}
                            </div>
                        );
                    })}
                </div>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-md" style={{ background: `${accent}15`, color: accent }}>target=9</span>
            </div>
            {found && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(65,189,120,0.1)', border: '1px solid rgba(65,189,120,0.25)', animation: 'authSlideUp 0.3s ease-out' }}>
                    <span className="text-[10px]">✅</span>
                    <span className="text-[10px] font-bold text-green-400 font-mono">return [0, 1]</span>
                </div>
            )}
        </div>
    );
}

// ─── Mini DP Table Viz (Fibonacci) ──────────────────────────────────────────
function MiniDPViz({ step, accent, isDark }) {
    const fib = [0, 1, 1, 2, 3, 5, 8];
    const filled = step >= 3 ? Math.min(step - 1, fib.length) : 0;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground font-mono w-10 shrink-0">dp =</span>
                <div className="flex gap-0.5">
                    {fib.map((v, i) => (
                        <div key={i} className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold border transition-all duration-500"
                            style={{
                                background: i < filled ? `${accent}${i === filled - 1 ? '26' : '15'}` : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.65)'),
                                borderColor: i < filled ? `${accent}60` : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.08)'),
                                color: i < filled ? (isDark ? '#fff' : '#334155') : (isDark ? '#444' : '#94a3b8'),
                                boxShadow: i === filled - 1 ? `0 0 10px ${accent}40` : 'none',
                            }}>
                            {i < filled ? v : '·'}
                        </div>
                    ))}
                </div>
            </div>
            {filled >= 5 && (
                <div className="text-[9px] font-mono px-2 py-1 rounded-md" style={{ background: `${accent}10`, color: accent, animation: 'authSlideUp 0.3s ease-out' }}>
                    dp[{filled - 1}] = dp[{filled - 2}] + dp[{filled - 3}] = {fib[filled - 1]}
                </div>
            )}
        </div>
    );
}

// ─── Viz Picker ─────────────────────────────────────────────────────────────
function SnippetViz({ idx, step, accent, isDark }) {
    if (idx === 0) return <MiniArrayViz step={step} accent={accent} isDark={isDark} />;
    if (idx === 1) return <MiniGraphViz step={step} accent={accent} isDark={isDark} />;
    return <MiniDPViz step={step} accent={accent} isDark={isDark} />;
}

// ─── Floating Stats ─────────────────────────────────────────────────────────
const STATS = [
    { value: '12k+', label: 'Developers', color: '#9180e8' },
    { value: '500+', label: 'Problems', color: '#3fa9c9' },
    { value: '50+', label: 'Courses', color: '#6672e0' },
];

// ═══════════════════════════════════════════════════════════════════════════
// ─── Main Component ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export default function AuthVisual() {
    const { isDark } = useTheme();
    const [snippetIdx, setSnippetIdx] = useState(0);
    const [visibleLines, setVisibleLines] = useState(0);
    const [phase, setPhase] = useState('typing');
    const timerRef = useRef(null);
    const snippet = SNIPPETS[snippetIdx];
    const tokenColors = isDark ? TOKEN_COLORS.dark : TOKEN_COLORS.light;
    const visualBg = isDark ? '#0a0b0f' : '#f8fafc';
    const gridLine = isDark ? 'rgba(148,163,184,0.05)' : 'rgba(15,23,42,0.055)';
    const terminalBg = isDark ? '#0d0d0d' : 'rgba(255,255,255,0.88)';
    const titleBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(248,250,252,0.9)';
    const outputBg = isDark ? 'rgba(255,255,255,0.01)' : 'rgba(248,250,252,0.8)';
    const inactiveDot = isDark ? '#333' : '#cbd5e1';
    const terminalShadow = isDark
        ? '0 20px 45px rgba(0,0,0,0.45)'
        : '0 20px 50px rgba(15,23,42,0.12)';

    // Reset on snippet change
    useEffect(() => {
        setVisibleLines(0);
        setPhase('typing');
    }, [snippetIdx]);

    // Typing animation
    useEffect(() => {
        clearTimeout(timerRef.current);
        if (phase === 'typing' && visibleLines < snippet.lines.length) {
            timerRef.current = setTimeout(() => setVisibleLines(v => v + 1), 280);
        } else if (phase === 'typing' && visibleLines >= snippet.lines.length) {
            setPhase('done');
            timerRef.current = setTimeout(() => {
                setSnippetIdx(i => (i + 1) % SNIPPETS.length);
            }, 2500);
        }
        return () => clearTimeout(timerRef.current);
    }, [phase, visibleLines, snippet.lines.length]);

    return (
        <div className="relative hidden w-0 flex-1 lg:flex items-center justify-center overflow-hidden transition-colors duration-300" style={{ background: visualBg }}>
            {/* ── Keyframes ── */}

            {/* ── Ambient Background: subtle grid only (matches the landing hero) ── */}
            <div className="absolute inset-0" aria-hidden="true" style={{
                backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
                backgroundSize: '44px 44px',
                maskImage: 'radial-gradient(circle at center, black 20%, transparent 90%)',
            }} />

            {/* ── Main Content ── */}
            <div className="relative z-10 w-full max-w-md px-8">

                {/* ── Terminal Editor ── */}
                <div className="rounded-2xl overflow-hidden border shadow-2xl"
                    style={{ background: terminalBg, borderColor: `${snippet.accent}30`, boxShadow: terminalShadow, transition: 'background 0.3s, border-color 1s, box-shadow 1s' }}>

                    {/* Title bar */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: `${snippet.accent}20`, background: titleBg }}>
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: snippet.accent }} />
                            <span className="font-mono text-[11px] transition-colors duration-700" style={{ color: snippet.accent }}>{snippet.file}</span>
                        </div>
                        <div className="flex gap-1">
                            {SNIPPETS.map((s, i) => (
                                <button key={i} onClick={() => setSnippetIdx(i)}
                                    className="rounded-full transition-all duration-300 cursor-pointer hover:scale-150"
                                    style={{ width: i === snippetIdx ? 16 : 6, height: 6, background: i === snippetIdx ? s.accent : inactiveDot }} />
                            ))}
                        </div>
                    </div>

                    {/* Code body */}
                    <div className="px-4 py-4 font-mono text-[12px] leading-6 min-h-[180px]">
                        {snippet.lines.slice(0, visibleLines).map((line, li) => (
                            <div key={`${snippetIdx}-${li}`} className="flex" style={{ paddingLeft: `${line.indent * 1.2}rem`, animation: `authCodeSlide 0.25s ease-out ${li * 30}ms both` }}>
                                <span className="text-foreground/80 select-none mr-3 text-[10px] w-4 text-right">{li + 1}</span>
                                <span>
                                    {line.tokens.map((tok, ti) => (
                                        <span key={ti} style={{ color: tokenColors[tok.t] || tokenColors.p, fontStyle: tok.t === 'comment' ? 'italic' : 'normal' }}>{tok.v}</span>
                                    ))}
                                    {li === visibleLines - 1 && phase === 'typing' && (
                                        <span className="inline-block w-[2px] h-[1em] ml-0.5 align-middle rounded-sm"
                                            style={{ background: snippet.accent, animation: 'authCursorBlink 0.8s step-end infinite', boxShadow: `0 0 6px ${snippet.accent}` }} />
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Live Output Panel */}
                    <div className="border-t px-4 py-3" style={{ borderColor: `${snippet.accent}15`, background: outputBg }}>
                        <div className="flex items-center gap-2 mb-2.5">
                            <div className="w-1.5 h-1.5 rounded-full"
                                style={{ background: phase === 'done' ? '#41bd78' : snippet.accent, animation: phase === 'typing' ? 'authGlowPulse 1s ease-in-out infinite' : 'none' }} />
                            <span className="text-[9px] font-bold tracking-[0.15em] uppercase"
                                style={{ color: phase === 'done' ? '#41bd78' : (isDark ? '#666' : '#64748b') }}>
                                {phase === 'typing' ? 'Running...' : '✓ Output'}
                            </span>
                            <div className="flex-1 h-px relative overflow-hidden" style={{ background: `${snippet.accent}10` }}>
                                {phase === 'typing' && (
                                    <div className="absolute inset-0" style={{
                                        background: `linear-gradient(90deg, transparent, ${snippet.accent}50, transparent)`,
                                        backgroundSize: '200% 100%', animation: 'authShimmer 1.5s linear infinite'
                                    }} />
                                )}
                            </div>
                        </div>
                        <SnippetViz idx={snippetIdx} step={visibleLines} accent={snippet.accent} isDark={isDark} />
                    </div>

                    {/* Topic badge */}
                    <div className="px-4 pb-3 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: `${snippet.accent}15`, color: snippet.accent, border: `1px solid ${snippet.accent}30` }}>
                            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: snippet.accent }} />
                            {snippet.label}
                        </span>
                        <span className="text-[10px] text-foreground/80 font-mono">marevlo.ai</span>
                    </div>
                </div>

                {/* ── Floating Stats Row ── */}
                <div className="flex gap-3 mt-6">
                    {STATS.map((stat, i) => (
                        <div key={i} className="flex-1 px-3 py-2.5 rounded-xl border text-center"
                            style={{
                                background: `${stat.color}08`, borderColor: `${stat.color}20`,
                                animation: `authFloat 3s ease-in-out ${i * 0.4}s infinite`
                            }}>
                            <div className="text-lg font-extrabold tracking-tight" style={{ color: stat.color }}>{stat.value}</div>
                            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{stat.label}</div>
                        </div>
                    ))}
                </div>

                {/* ── Tagline ── */}
                <div className="text-center mt-5">
                    <p className="text-[11px] text-muted-foreground font-medium">
                        Master algorithms. Build projects. Land jobs.
                    </p>
                </div>
            </div>
        </div>
    );
}
