import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useScrollReveal, useActiveInView } from '../hooks/useScrollReveal';
import RevealText from '../components/RevealText';
import { ChevronRight, Layers, Users, Briefcase, Code, Terminal, Globe, ArrowUpRight, CheckCircle2, Zap, MessageSquare, Brain, Cpu, GitBranch, Film, Map, Puzzle, Lightbulb, TrendingUp, Target, Rocket, GraduationCap, Eye, Hammer, Wrench, Lock, Unlock, ListOrdered, Sparkles, Keyboard, Bot } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Animated Typing Terminal
const CODE_SNIPPETS = [
    {
        label: 'DSA · Best Time to Buy/Sell',
        file: 'best_time_to_buy_sell.py',
        color: '#41bd78',
        lines: [
            { indent: 0, tokens: [{ t: 'comment', v: '# Best Time to Buy & Sell, one pass' }] },
            { indent: 0, tokens: [{ t: 'keyword', v: 'def' }, { t: 'plain', v: ' ' }, { t: 'fn', v: 'max_profit' }, { t: 'plain', v: '(prices):' }] },
            { indent: 1, tokens: [{ t: 'plain', v: 'low, best = prices[0], 0' }] },
            { indent: 1, tokens: [{ t: 'keyword', v: 'for' }, { t: 'plain', v: ' p ' }, { t: 'keyword', v: 'in' }, { t: 'plain', v: ' prices[1:]:' }] },
            { indent: 2, tokens: [{ t: 'plain', v: 'low  = ' }, { t: 'fn', v: 'min' }, { t: 'plain', v: '(low, p)' }] },
            { indent: 2, tokens: [{ t: 'plain', v: 'best = ' }, { t: 'fn', v: 'max' }, { t: 'plain', v: '(best, p - low)' }] },
            { indent: 1, tokens: [{ t: 'keyword', v: 'return' }, { t: 'plain', v: ' best' }] },
        ],
    },
    {
        label: 'Course · Binary Trees',
        file: 'binary_tree.py',
        color: '#9180e8',
        lines: [
            { indent: 0, tokens: [{ t: 'comment', v: '# Binary Tree, taught step by step' }] },
            { indent: 0, tokens: [{ t: 'keyword', v: 'class' }, { t: 'plain', v: ' ' }, { t: 'fn', v: 'TreeNode' }, { t: 'plain', v: ':' }] },
            { indent: 1, tokens: [{ t: 'keyword', v: 'def' }, { t: 'plain', v: ' ' }, { t: 'fn', v: '__init__' }, { t: 'plain', v: '(self, val=0):' }] },
            { indent: 2, tokens: [{ t: 'plain', v: 'self.val   = val' }] },
            { indent: 2, tokens: [{ t: 'plain', v: 'self.left  = ' }, { t: 'keyword', v: 'None' }] },
            { indent: 2, tokens: [{ t: 'plain', v: 'self.right = ' }, { t: 'keyword', v: 'None' }] },
        ],
    },
    {
        label: 'Visualize · BFS',
        file: 'bfs_visualizer.py',
        color: '#3fa9c9',
        lines: [
            { indent: 0, tokens: [{ t: 'comment', v: '# BFS, watch it run step by step' }] },
            { indent: 0, tokens: [{ t: 'keyword', v: 'from' }, { t: 'plain', v: ' collections ' }, { t: 'keyword', v: 'import' }, { t: 'plain', v: ' deque' }] },
            { indent: 0, tokens: [{ t: 'keyword', v: 'def' }, { t: 'plain', v: ' ' }, { t: 'fn', v: 'bfs' }, { t: 'plain', v: '(graph, start):' }] },
            { indent: 1, tokens: [{ t: 'plain', v: 'queue, visited = ' }, { t: 'fn', v: 'deque' }, { t: 'plain', v: '([start]), {start}' }] },
            { indent: 1, tokens: [{ t: 'keyword', v: 'while' }, { t: 'plain', v: ' queue:' }] },
            { indent: 2, tokens: [{ t: 'plain', v: 'node = queue.' }, { t: 'fn', v: 'popleft' }, { t: 'plain', v: '()' }] },
            { indent: 2, tokens: [{ t: 'plain', v: 'visualize.' }, { t: 'fn', v: 'highlight' }, { t: 'plain', v: '(node)  ' }, { t: 'comment', v: '# 👁️ see it!' }] },
        ],
    },
];

function tokenColor(type) {
    switch (type) {
        case 'keyword': return '#cba6f7';   // violet-300 (brighter)
        case 'fn': return '#7dd3fc';   // sky-300 (brighter)
        case 'str': return '#fde047';   // yellow-300 (brighter)
        case 'comment': return '#8b94a3';   // slate, readable italic
        default: return '#f1f5f9';   // slate-100 (near-white)
    }
}

const BackgroundFx = React.memo(function BackgroundFx() {
    // Clean, calm backdrop: just a subtle grid. No particle canvas, no glowing
    // orbs — those read as "AI-generated". A faint grid adds structure without noise.
    return (
        <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
                backgroundImage: 'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
                backgroundSize: '44px 44px',
                maskImage: 'radial-gradient(circle at center, black 20%, transparent 90%)',
                opacity: 0.2,
            }}
        />
    );
});

// Dijkstra Live Visualization
const DijkstraViz = React.memo(function DijkstraViz({ step, color }) {
    const nodes = [
        { id: 'A', x: 36, y: 40 },
        { id: 'B', x: 118, y: 10 },
        { id: 'C', x: 118, y: 70 },
        { id: 'D', x: 200, y: 40 },
    ];
    const edges = [
        { a: 'A', b: 'B', w: 1, mx: 72, my: 18 },
        { a: 'A', b: 'C', w: 4, mx: 72, my: 62 },
        { a: 'B', b: 'C', w: 2, mx: 118, my: 42 },
        { a: 'B', b: 'D', w: 5, mx: 162, my: 18 },
        { a: 'C', b: 'D', w: 1, mx: 162, my: 62 },
    ];
    const visitOrder = ['A', 'B', 'C', 'D'];
    const visited = step >= 4 ? visitOrder.slice(0, Math.min(step - 3, 4)) : [];
    const current = visited.length > 0 ? visited[visited.length - 1] : null;
    const allDone = visited.length === 4;
    const distMap = {};
    if (step >= 4) distMap['A'] = 0;
    if (step >= 5) distMap['B'] = 1;
    if (step >= 6) distMap['C'] = 3;
    if (step >= 7) distMap['D'] = 4;
    const spEdges = new Set(['A-B', 'B-C', 'C-D']);

    return (
        <div className="flex flex-col gap-2.5">
            <svg viewBox="0 0 236 82" className="w-full" style={{ maxHeight: 82 }}>
                {edges.map(({ a, b, w, mx, my }) => {
                    const nA = nodes.find(n => n.id === a);
                    const nB = nodes.find(n => n.id === b);
                    const key = `${a}-${b}`;
                    const isPath = allDone && spEdges.has(key);
                    const isActive = visited.includes(a) && visited.includes(b);
                    return (
                        <g key={key}>
                            <line x1={nA.x} y1={nA.y} x2={nB.x} y2={nB.y}
                                stroke={isPath ? color : isActive ? `${color}45` : 'rgba(255,255,255,0.08)'}
                                strokeWidth={isPath ? 2.5 : 1.5}
                                strokeDasharray={isPath ? '120' : 'none'}
                                style={{ animation: isPath ? 'dijkEdgeLight 0.6s ease-out forwards, dijkPathPulse 2s ease-in-out infinite 0.6s' : 'none', transition: 'stroke 0.5s' }} />
                            {step >= 2 && (
                                <text x={mx} y={my} textAnchor="middle" fill="#4b5563" fontSize="7.5" fontFamily="monospace">{w}</text>
                            )}
                        </g>
                    );
                })}
                {nodes.map(({ id, x, y }, ni) => {
                    const isVisited = visited.includes(id);
                    const isCurrent = id === current;
                    const fill = isCurrent ? color : isVisited ? '#41bd78' : 'rgba(255,255,255,0.05)';
                    const strokeC = isCurrent ? color : isVisited ? '#41bd78' : 'rgba(255,255,255,0.1)';
                    return (
                        <g key={id} style={{ animation: step >= 1 ? `dijkNodePop 0.35s cubic-bezier(0.34,1.56,0.64,1) ${ni * 80}ms both` : 'none' }}>
                            {isCurrent && (
                                <circle cx={x} cy={y} r={13} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6}
                                    style={{ animation: 'dijkRipple 1.2s ease-out infinite' }} />
                            )}
                            <circle cx={x} cy={y} r={13} fill={fill} stroke={strokeC} strokeWidth={2}
                                style={{ transition: 'fill 0.4s, stroke 0.4s' }} />
                            <text x={x} y={y + 4} textAnchor="middle" fill={isVisited || isCurrent ? '#fff' : '#6b7280'}
                                fontSize="10" fontWeight="800" style={{ transition: 'fill 0.3s' }}>{id}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="flex items-center gap-1.5" style={{ animation: step >= 3 ? 'dijkDistSlide 0.4s ease-out forwards' : 'none', opacity: step >= 3 ? 1 : 0 }}>
                <span className="text-[9px] text-neutral-500 font-mono w-10">dist:</span>
                <div className="flex gap-1.5">
                    {['A', 'B', 'C', 'D'].map(id => {
                        const d = distMap[id];
                        return (
                            <div key={id} className="flex flex-col items-center gap-0.5">
                                <span className="text-[8px] text-neutral-600 font-mono">{id}</span>
                                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                                    style={{
                                        background: d !== undefined ? `${color}20` : 'rgba(255,255,255,0.03)',
                                        color: d !== undefined ? color : '#374151',
                                        border: `1px solid ${d !== undefined ? color + '40' : 'rgba(255,255,255,0.06)'}`,
                                        transition: 'all 0.4s',
                                    }}>
                                    {d !== undefined ? d : '∞'}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {allDone && (
                    <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(65,189,120,0.12)', border: '1px solid rgba(65,189,120,0.3)', animation: 'dijkDistSlide 0.4s ease-out forwards' }}>
                        <span className="text-[9px] font-bold text-[#5dc389]">A→B→C→D = 4</span>
                    </div>
                )}
            </div>
        </div>
    );
});

// Binary Tree Live Visualization
const TreeViz = React.memo(function TreeViz({ step, color }) {
    const nodes = [
        { id: 'root', val: 10, x: 130, y: 18 },
        { id: 'left', val: 5, x: 65, y: 62 },
        { id: 'right', val: 15, x: 195, y: 62 },
    ];
    const edges = [['root', 'left'], ['root', 'right']];
    const visibleNodes = step >= 4 ? (step >= 5 ? (step >= 6 ? 3 : 2) : 1) : 0;

    return (
        <div className="flex flex-col items-center gap-2">
            <svg viewBox="0 0 260 95" className="w-full" style={{ maxHeight: 95 }}>
                {/* Edges - animated draw */}
                {edges.slice(0, Math.max(0, visibleNodes - 1)).map(([a, b], ei) => {
                    const nA = nodes.find(n => n.id === a);
                    const nB = nodes.find(n => n.id === b);
                    return (
                        <line key={a + b} x1={nA.x} y1={nA.y + 14} x2={nB.x} y2={nB.y - 14}
                            stroke={`${color}70`} strokeWidth={2.5} strokeDasharray="80"
                            style={{ animation: `treeEdgeGrow 0.6s ease-out ${ei * 150}ms forwards`, strokeDashoffset: 80 }} />
                    );
                })}
                {/* Nodes - animated drop */}
                {nodes.slice(0, visibleNodes).map((node, i) => (
                    <g key={node.id} style={{ '--node-glow': `${color}60`, animation: `treeNodeDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 200}ms both` }}>
                        {i === visibleNodes - 1 && (
                            <circle cx={node.x} cy={node.y} r={24} fill="none" stroke={color} strokeWidth={1.5} opacity={0.3}
                                style={{ animation: 'ping 1.5s ease-out infinite' }} />
                        )}
                        <circle cx={node.x} cy={node.y} r={16} fill={`${color}25`} stroke={color} strokeWidth={2}
                            style={{ animation: 'treeNodeGlow 2s ease-in-out infinite', filter: `drop-shadow(0 0 5px ${color}40)` }} />
                        <text x={node.x} y={node.y + 4.5} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">{node.val}</text>
                    </g>
                ))}
                {/* Labels - fade in */}
                {visibleNodes >= 1 && <text x={130} y={92} textAnchor="middle" fill="#6b7280" fontSize="8" fontFamily="monospace" style={{ animation: 'treeLabelFade 0.4s ease-out forwards' }}>root</text>}
                {visibleNodes >= 2 && <text x={65} y={92} textAnchor="middle" fill="#6b7280" fontSize="8" fontFamily="monospace" style={{ animation: 'treeLabelFade 0.4s ease-out 200ms forwards', opacity: 0 }}>.left</text>}
                {visibleNodes >= 3 && <text x={195} y={92} textAnchor="middle" fill="#6b7280" fontSize="8" fontFamily="monospace" style={{ animation: 'treeLabelFade 0.4s ease-out 200ms forwards', opacity: 0 }}>.right</text>}
            </svg>
            {step >= 3 && (
                <div className="flex gap-3">
                    {nodes.slice(0, visibleNodes).map((n, i) => (
                        <span key={n.id} className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                            style={{ background: `${color}15`, color, border: `1px solid ${color}30`, animation: `treeBadgeSlide 0.3s ease-out ${i * 100}ms both` }}>
                            val={n.val}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
});

// BFS Live Visualization
const BFSViz = React.memo(function BFSViz({ step, color }) {
    const gNodes = [
        { id: 'A', x: 40, y: 40 }, { id: 'B', x: 110, y: 15 },
        { id: 'C', x: 110, y: 65 }, { id: 'D', x: 180, y: 40 },
    ];
    const gEdges = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']];
    const visitOrder = ['A', 'B', 'C', 'D'];
    const visited = step >= 4 ? visitOrder.slice(0, Math.min(step - 3, 4)) : [];
    const current = visited.length > 0 ? visited[visited.length - 1] : null;
    const queue = step >= 4 ? visitOrder.filter(n => !visited.includes(n)).slice(0, 2) : [];

    return (
        <div className="flex flex-col gap-2.5">
            <svg viewBox="0 0 220 80" className="w-full" style={{ maxHeight: 80 }}>
                {/* Edges with animated flow */}
                {gEdges.map(([a, b]) => {
                    const nA = gNodes.find(n => n.id === a);
                    const nB = gNodes.find(n => n.id === b);
                    const active = visited.includes(a) && visited.includes(b);
                    return (
                        <line key={a + b} x1={nA.x} y1={nA.y} x2={nB.x} y2={nB.y}
                            stroke={active ? `${color}80` : 'rgba(255,255,255,0.08)'} strokeWidth={active ? 2.5 : 1.5}
                            strokeDasharray={active ? '100' : 'none'}
                            style={{ animation: active ? 'bfsEdgeFlow 0.6s ease-out forwards' : 'none', transition: 'stroke 0.4s' }} />
                    );
                })}
                {/* Nodes with ripples & breathing */}
                {gNodes.map(({ id, x, y }) => {
                    const isVisited = visited.includes(id);
                    const isCurrent = id === current;
                    const isQueued = queue.includes(id);
                    const fill = isCurrent ? color : isVisited ? '#41bd78' : isQueued ? '#9180e880' : 'rgba(255,255,255,0.06)';
                    return (
                        <g key={id} style={{ '--breathe-color': fill }}>
                            {/* Ripple rings on current */}
                            {isCurrent && (
                                <>
                                    <circle cx={x} cy={y} r={14} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6}
                                        style={{ animation: 'bfsRipple 1.2s ease-out infinite' }} />
                                    <circle cx={x} cy={y} r={14} fill="none" stroke={color} strokeWidth={1} opacity={0.4}
                                        style={{ animation: 'bfsRipple 1.2s ease-out 0.4s infinite' }} />
                                </>
                            )}
                            <circle cx={x} cy={y} r={14} fill={fill}
                                stroke={isCurrent ? color : isVisited ? '#41bd78' : isQueued ? '#9180e8' : 'rgba(255,255,255,0.12)'} strokeWidth={2}
                                style={{
                                    animation: (isCurrent || isVisited) ? 'bfsNodeBreathe 2s ease-in-out infinite' : 'none',
                                    transition: 'fill 0.4s, stroke 0.4s',
                                    transformOrigin: `${x}px ${y}px`,
                                }} />
                            <text x={x} y={y + 4} textAnchor="middle" fill={isVisited || isCurrent || isQueued ? '#fff' : '#6b7280'} fontSize="11" fontWeight="800"
                                style={{ transition: 'fill 0.3s' }}>{id}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                    <span className="text-[9px] text-neutral-500 font-mono">visited:</span>
                    <div className="flex gap-1">{visited.map((v, vi) => (
                        <span key={v} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(65,189,120,0.15)', color: '#41bd78', animation: `bfsBadgePop 0.3s ease-out ${vi * 80}ms both` }}>{v}</span>
                    ))}</div>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[9px] text-neutral-500 font-mono">queue:</span>
                    <div className="flex gap-1">{queue.length === 0
                        ? <span className="text-[9px] text-neutral-600 italic">∅</span>
                        : queue.map((q, qi) => (
                            <span key={q} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: `${color}20`, color, animation: `bfsQueueSlide 0.25s ease-out ${qi * 60}ms both` }}>{q}</span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
});

// Best Time to Buy & Sell — box-array visualization (matches old Two Sum card)
const StockViz = React.memo(function StockViz({ step, color }) {
    const prices = [7, 1, 5, 3, 6, 4];
    const buyIdx = 1;   // price 1 (lowest before the peak)
    const sellIdx = 4;  // price 6 (best sell)
    const profit = prices[sellIdx] - prices[buyIdx];
    // reveal boxes as the code "types", mark buy/sell once far enough in
    const revealed = Math.max(0, Math.min(step - 1, prices.length));
    const marked = step >= 6;
    const solved = step >= 7;

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
                <span className="text-[9px] text-neutral-400 font-mono w-9">prices</span>
                <div className="flex gap-1.5">
                    {prices.map((p, i) => {
                        const isBuy = marked && i === buyIdx;
                        const isSell = marked && i === sellIdx;
                        const active = isBuy || isSell;
                        const accent = isBuy ? '#3fa9c9' : isSell ? color : null;
                        return (
                            <div key={i} className="flex flex-col items-center gap-0.5"
                                style={{ animation: i < revealed ? `bfsBadgePop 0.3s ease-out ${i * 70}ms both` : 'none', opacity: i < revealed ? 1 : 0 }}>
                                <div className="rounded-lg flex items-center justify-center font-mono font-bold relative"
                                    style={{
                                        width: 30, height: 32, fontSize: 13,
                                        background: active ? `${accent}22` : 'rgba(255,255,255,0.06)',
                                        color: active ? accent : '#e2e8f0',
                                        border: `1.5px solid ${active ? accent : 'rgba(255,255,255,0.2)'}`,
                                        transition: 'all 0.4s',
                                    }}>
                                    {p}
                                    {isBuy && <span className="absolute -top-1.5 -right-1.5 text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-black" style={{ background: '#3fa9c9', color: '#06121a' }}>↓</span>}
                                    {isSell && <span className="absolute -top-1.5 -right-1.5 text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-black" style={{ background: color, color: '#06210f' }}>↑</span>}
                                </div>
                                <span className="text-[8px] text-neutral-400 font-mono">[{i}]</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex items-center gap-2" style={{ opacity: marked ? 1 : 0, transition: 'opacity 0.4s' }}>
                <span className="text-[9px] text-neutral-400 font-mono w-9">trade</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: '#3fa9c920', color: '#3fa9c9', border: '1px solid #3fa9c940' }}>buy @ {prices[buyIdx]}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>sell @ {prices[sellIdx]}</span>
            </div>

            {solved && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                    style={{ background: 'rgba(65,189,120,0.12)', border: '1px solid rgba(65,189,120,0.3)', animation: 'dijkDistSlide 0.4s ease-out forwards' }}>
                    <span className="text-[10px]">✅</span>
                    <span className="text-[11px] font-bold font-mono text-[#5dc389]">return {profit}</span>
                    <span className="ml-auto text-[9px] font-mono text-neutral-400">max profit = 6 − 1 = {profit}</span>
                </div>
            )}
        </div>
    );
});

// Snippet Visualizer Picker
const SnippetViz = React.memo(function SnippetViz({ snippetIdx, step, color }) {
    if (snippetIdx === 0) return <StockViz step={step} color={color} />;
    if (snippetIdx === 1) return <TreeViz step={step} color={color} />;
    return <BFSViz step={step} color={color} />;
});

// ── Hero: floating code-block 3D stage (CSS perspective + framer-motion) ──
const HERO_CHIPS = [
    { code: 'O(n log n)',   tag: 'optimal', color: '#9180e8', left: '-20%', top: '14%', z: 60, delay: 0.8 },
    { code: '{ }',          tag: 'hashmap', color: '#6672e0', left: '-15%', top: '70%', z: 40, delay: 1.4 },
    { code: '[ i, j ]',     tag: 'return',  color: '#e0a050', left: '103%', top: '10%', z: 56, delay: 1.1 },
    { code: 'git push',     tag: 'main',    color: '#41bd78', left: '101%', top: '74%', z: 38, delay: 0.4 },
];

function HeroCodeStage({ children }) {
    const reduce = useReducedMotion();
    const px = useMotionValue(0);
    const py = useMotionValue(0);
    const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [14, -14]), { stiffness: 120, damping: 18 });
    const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [-11, 11]), { stiffness: 120, damping: 18 });

    // Cache the bounding rect on hover-enter instead of measuring on every
    // mousemove — reading getBoundingClientRect per move forces a sync layout
    // reflow (the main cause of hero hover-lag).
    const rectRef = useRef(null);
    const cacheRect = (e) => { rectRef.current = e.currentTarget.getBoundingClientRect(); };
    const onMove = (e) => {
        if (reduce) return;
        const r = rectRef.current;
        if (!r) return;
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
    };
    const onLeave = () => { px.set(0); py.set(0); };

    return (
        <div className="relative" style={{ perspective: 1200 }} onMouseEnter={cacheRect} onMouseMove={onMove} onMouseLeave={onLeave}>
            <motion.div
                className="relative mx-auto"
                style={{ transformStyle: 'preserve-3d', scale: 0.82, rotateX: reduce ? 0 : rotateX, rotateY: reduce ? 0 : rotateY }}
            >
                {/* subtle depth shadow, pushed back on the Z axis */}
                <div className="absolute inset-0 rounded-3xl blur-2xl opacity-10 pointer-events-none"
                    style={{ background: 'var(--primary)', transform: 'translateZ(-80px)' }} />

                {/* the code terminal on the front plane */}
                <div style={{ transform: 'translateZ(24px)' }}>
                    {children}
                </div>

                {/* glassy code chips floating at varied depths */}
                {HERO_CHIPS.map((c) => (
                    <div key={c.code} className="absolute pointer-events-none select-none"
                        style={{ left: c.left, top: c.top, transform: `translateZ(${c.z}px)` }}>
                        <div style={{ animation: reduce ? 'none' : `float ${5 + c.z / 30}s ease-in-out ${c.delay}s infinite` }}>
                            <div className="rounded-lg px-3 py-2 border backdrop-blur-md"
                                style={{ background: 'rgba(15,17,23,0.9)', borderColor: `${c.color}55`, boxShadow: '0 10px 26px rgba(0,0,0,0.45)' }}>
                                <div className="font-mono text-xs font-bold leading-none" style={{ color: c.color }}>{c.code}</div>
                                <div className="font-mono text-[9px] mt-1 leading-none" style={{ color: '#cbd5e1' }}>{c.tag}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </motion.div>
        </div>
    );
}

function TypingTerminal() {
    const [snippetIdx, setSnippetIdx] = useState(0);
    const [visibleLines, setVisibleLines] = useState(0);
    const [phase, setPhase] = useState('typing'); // 'typing' | 'done'
    const timerRef = useRef(null);

    const snippet = CODE_SNIPPETS[snippetIdx];

    useEffect(() => {
        setVisibleLines(0);
        setPhase('typing');
    }, [snippetIdx]);

    useEffect(() => {
        clearTimeout(timerRef.current);
        if (phase === 'typing' && visibleLines < snippet.lines.length) {
            timerRef.current = setTimeout(() => setVisibleLines(v => v + 1), 220);
        } else if (phase === 'typing' && visibleLines >= snippet.lines.length) {
            setPhase('done');
        }
        return () => clearTimeout(timerRef.current);
    }, [phase, visibleLines, snippet.lines.length]);

    return (
        <div
            className="relative rounded-2xl overflow-hidden shadow-2xl border skew-y-1 hover:skew-y-0 transition-all duration-700"
            style={{
                background: '#0b0d12',
                borderColor: 'rgba(255,255,255,0.14)',
                boxShadow: '0 24px 55px rgba(0,0,0,0.5)',
            }}
        >

            {/* Title bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${snippet.color}40`, background: 'rgba(255,255,255,0.05)' }}>
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/70" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                    <div className="w-3 h-3 rounded-full bg-green-500/70" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: snippet.color }} />
                    <span className="font-mono text-xs" style={{ color: snippet.color }}>{snippet.file}</span>
                </div>
                <div className="flex gap-1.5">
                    {CODE_SNIPPETS.map((s, i) => (
                        <button key={i} onClick={() => setSnippetIdx(i)}
                            aria-label={`Show ${s.label} example`}
                            className="rounded-full transition-all duration-300 cursor-pointer hover:scale-150"
                            style={{ width: i === snippetIdx ? 18 : 7, height: 7, background: i === snippetIdx ? s.color : '#525c6b' }} />
                    ))}
                </div>
            </div>

            {/* Code body */}
            <div className="p-5 font-mono text-sm leading-7 min-h-[200px] font-medium">
                {snippet.lines.slice(0, visibleLines).map((line, li) => (
                    <div key={li} className="flex" style={{ paddingLeft: `${line.indent * 1.5}rem`, animation: `codeLineSlide 0.3s ease-out ${li * 40}ms both` }}>
                        <span className="select-none mr-4 text-xs" style={{ minWidth: '1.5rem', color: 'rgba(255,255,255,0.4)', animation: `lineNumFade 0.2s ease-out ${li * 40}ms both` }}>{li + 1}</span>
                        <span>
                            {line.tokens.length === 0 ? '\u00A0' : line.tokens.map((tok, ti) => (
                                <span
                                    key={ti}
                                    style={{
                                        color: tokenColor(tok.type !== undefined ? tok.type : tok.t),
                                        fontStyle: tok.t === 'comment' ? 'italic' : 'normal',
                                    }}
                                >{tok.v}</span>
                            ))}
                            {li === visibleLines - 1 && phase === 'typing' && (
                                <span className="inline-block w-[2px] h-[1.1em] ml-0.5 align-middle rounded-sm" style={{ background: snippet.color, animation: 'cursorBlink 0.8s step-end infinite', boxShadow: `0 0 6px ${snippet.color}` }} />
                            )}
                        </span>
                    </div>
                ))}
            </div>

            {/* Live Output Panel */}
            <div className="border-t px-5 py-4" style={{ borderColor: `${snippet.color}33`, background: 'rgba(255,255,255,0.035)', animation: visibleLines > 0 ? 'outputPanelReveal 0.4s ease-out forwards' : 'none' }}>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: visibleLines > 0 ? '#41bd78' : '#6b7280', animation: visibleLines > 0 ? 'vizBounce 1.5s ease-in-out infinite' : 'none' }} />
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: visibleLines > 0 ? '#41bd78' : '#6b7280' }}>
                        {phase === 'typing' ? 'Running...' : phase === 'done' ? 'Live Output' : 'Waiting...'}
                    </span>
                    <div className="flex-1 h-px relative overflow-hidden" style={{ background: `${snippet.color}15` }}>
                        {phase === 'typing' && (
                            <div className="absolute inset-0" style={{
                                background: `linear-gradient(90deg, transparent, ${snippet.color}40, transparent)`,
                                backgroundSize: '200% 100%',
                                animation: 'shimmerLine 1.5s linear infinite',
                            }} />
                        )}
                    </div>
                    <span className="text-[9px] font-mono font-bold" style={{ color: `${snippet.color}cc` }}>▸ run</span>
                </div>
                <SnippetViz snippetIdx={snippetIdx} step={visibleLines} color={snippet.color} />
            </div>

            {/* Topic badge */}
            <div className="px-5 pb-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: `${snippet.color}20`, color: snippet.color, border: `1px solid ${snippet.color}40` }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: snippet.color }} />
                    {snippet.label}
                </span>
                <span className="text-xs text-neutral-400 font-mono">marevlo.ai</span>
            </div>
        </div>
    );
}

// Animated Stat Counter
// BFS Visualizer Component
const BFS_NODES = [
    { id: 'A', x: 60, y: 75 },
    { id: 'B', x: 155, y: 30 },
    { id: 'C', x: 155, y: 120 },
    { id: 'D', x: 248, y: 55 },
    { id: 'E', x: 248, y: 100 },
];
const BFS_EDGES = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'E']];
const BFS_STEPS = [
    { current: null, visited: [], queue: ['A'], label: 'Start: enqueue A' },
    { current: 'A', visited: ['A'], queue: ['B', 'C'], label: 'Visit A → enqueue B, C' },
    { current: 'B', visited: ['A', 'B'], queue: ['C', 'D', 'E'], label: 'Visit B → enqueue D, E' },
    { current: 'C', visited: ['A', 'B', 'C'], queue: ['D', 'E'], label: 'Visit C → E already queued' },
    { current: 'D', visited: ['A', 'B', 'C', 'D'], queue: ['E'], label: 'Visit D: no new neighbours' },
    { current: 'E', visited: ['A', 'B', 'C', 'D', 'E'], queue: [], label: '✅ BFS complete! All visited' },
];

function BFSVisualizer({ isDark = false }) {
    const [step, setStep] = useState(0);
    const [paused, setPaused] = useState(false);
    const [rootRef, active] = useActiveInView();

    const cur = BFS_STEPS[step];

    // Infinite loop: advances every 1.1s, wraps with %.
    // Gated on `active` so it stops when the card is off-screen / tab hidden.
    useEffect(() => {
        if (paused || !active) return;
        const id = setInterval(() => {
            setStep(s => (s + 1) % BFS_STEPS.length);
        }, 1100);
        return () => clearInterval(id);
    }, [paused, active]);

    const nodeState = (id) => {
        if (cur.current === id) return 'current';
        if (cur.visited.includes(id)) return 'visited';
        if (cur.queue.includes(id)) return 'queued';
        return 'idle';
    };
    const nodeColor = { current: '#3fa9c9', visited: '#41bd78', queued: '#9180e8', idle: 'rgba(255,255,255,0.10)' };
    const nodeBorder = { current: '#3fa9c9', visited: '#41bd78', queued: '#9180e8', idle: 'rgba(255,255,255,0.15)' };
    const nodeText = { current: '#fff', visited: '#fff', queued: '#fff', idle: 'rgba(255,255,255,0.35)' };

    return (
        <div ref={rootRef} className="bento-reveal lg:col-span-5 rounded-3xl border overflow-hidden relative"
            style={{
                background: isDark ? '#14161d' : 'linear-gradient(145deg, #1a2440, #263457)',
                borderColor: isDark ? 'rgba(var(--secondary-rgb),0.35)' : 'rgba(93,142,222,0.28)'
            }}>
            <div className="p-6 relative z-10">

                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(var(--secondary-rgb),0.15)', border: '1px solid rgba(var(--secondary-rgb),0.4)' }}><Eye className="w-4 h-4" style={{ color: 'var(--secondary)' }} strokeWidth={2} /></div>
                    <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--secondary)' }}>Live Visualization</span>
                    <div className="ml-auto flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: paused ? '#e0a050' : 'var(--secondary)' }} />
                        <span className="text-[10px] font-semibold" style={{ color: paused ? '#e0a050' : 'var(--secondary)' }}>
                            {paused ? 'paused' : 'live'}
                        </span>
                    </div>
                </div>

                {/* Title + step */}
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <span className="text-sm font-extrabold text-white">BFS: Graph Traversal</span>
                        <span className="text-xs text-neutral-500 ml-2">Step {step + 1} / {BFS_STEPS.length}</span>
                    </div>
                </div>

                {/* Step description */}
                <div className="px-3 py-2 rounded-xl mb-3 text-xs font-semibold transition-all duration-300"
                    style={{ background: 'rgba(var(--secondary-rgb),0.08)', border: '1px solid rgba(var(--secondary-rgb),0.2)', color: '#8ed3e3' }}>
                    {cur.label}
                </div>

                {/* Graph SVG */}
                <div className="relative rounded-2xl overflow-hidden mb-3"
                    style={{ background: '#0d0d0d', border: '1px solid rgba(var(--secondary-rgb),0.15)', height: 158 }}>
                    <svg viewBox="0 0 310 158" className="w-full h-full">
                        {/* Edges */}
                        {BFS_EDGES.map(([a, b]) => {
                            const nA = BFS_NODES.find(n => n.id === a);
                            const nB = BFS_NODES.find(n => n.id === b);
                            const active = nodeState(a) !== 'idle' && nodeState(b) !== 'idle';
                            return (
                                <line key={a + b}
                                    x1={nA.x} y1={nA.y} x2={nB.x} y2={nB.y}
                                    stroke={active ? 'rgba(var(--secondary-rgb),0.55)' : 'rgba(255,255,255,0.07)'}
                                    strokeWidth={active ? 2 : 1.5}
                                    style={{ transition: 'stroke 0.5s' }}
                                />
                            );
                        })}
                        {/* Nodes */}
                        {BFS_NODES.map(({ id, x, y }) => {
                            const st = nodeState(id);
                            const c = nodeColor[st];
                            return (
                                <g key={id}>
                                    {/* pulse ring on current */}
                                    {st === 'current' && (
                                        <circle cx={x} cy={y} r={26} fill="none"
                                            stroke="#3fa9c9" strokeWidth="1.5" opacity="0.3"
                                            style={{ animation: 'ping 1s ease-out infinite' }} />
                                    )}
                                    <circle cx={x} cy={y} r={19} fill={c}
                                        stroke={nodeBorder[st]} strokeWidth={st === 'current' ? 3 : 2}
                                        style={{
                                            filter: st !== 'idle' ? `drop-shadow(0 0 5px ${c}66)` : 'none',
                                            transition: 'fill 0.5s, filter 0.5s'
                                        }}
                                    />
                                    <text x={x} y={y + 5} textAnchor="middle"
                                        fill={nodeText[st]} fontSize="13" fontWeight="800"
                                        style={{ transition: 'fill 0.5s' }}>
                                        {id}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>

                    {/* Continuous progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full"
                            style={{
                                width: `${((step) / (BFS_STEPS.length - 1)) * 100}%`,
                                background: 'linear-gradient(90deg,#6672e0,#3fa9c9)',
                                transition: 'width 0.5s ease'
                            }} />
                    </div>
                </div>

                {/* Queue display */}
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6672e050' }}>Queue:</span>
                    <div className="flex gap-1.5 flex-wrap flex-1">
                        {cur.queue.length === 0
                            ? <span className="text-[10px] text-neutral-400 italic">empty</span>
                            : cur.queue.map((q, i) => (
                                <span key={q + i} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: 'rgba(145,128,232,0.2)', color: '#ab9df0', border: '1px solid rgba(145,128,232,0.3)' }}>
                                    {q}
                                </span>
                            ))}
                    </div>
                    {/* Legend */}
                    <div className="flex gap-2 flex-shrink-0">
                        {[['Visited', '#41bd78'], ['Current', '#3fa9c9'], ['Queued', '#9180e8']].map(([l, c]) => (
                            <div key={l} className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                                <span className="text-[9px] text-neutral-400">{l}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Controls: just prev / pause-play / next + step dots */}
                <div className="flex items-center gap-2">
                    <button onClick={() => { setPaused(true); setStep(s => Math.max(0, s - 1)); }}
                        aria-label="Previous step"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white transition-colors text-sm"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>◀</button>

                    <button onClick={() => setPaused(p => !p)}
                        aria-label={paused ? 'Play animation' : 'Pause animation'}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold"
                        style={{ background: 'linear-gradient(135deg,var(--primary),var(--secondary))', color: '#fff', boxShadow: '0 0 14px rgba(var(--secondary-rgb),0.35)' }}>
                        {paused ? '▶ Play' : '⏸ Pause'}
                    </button>

                    <button onClick={() => { setPaused(true); setStep(s => Math.min(BFS_STEPS.length - 1, s + 1)); }}
                        aria-label="Next step"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white transition-colors text-sm"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>▶</button>

                    {/* Step dots */}
                    <div className="ml-auto flex gap-1.5 items-center">
                        {BFS_STEPS.map((_, i) => (
                            <button key={i}
                                aria-label={`Go to step ${i + 1}`}
                                onClick={() => { setPaused(true); setStep(i); }}
                                className="rounded-full transition-all duration-300"
                                style={{
                                    width: i === step ? 18 : 6,
                                    height: 6,
                                    background: i === step ? '#3fa9c9' : i < step ? '#41bd7855' : 'rgba(255,255,255,0.12)'
                                }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Personalized AI Tutor Component
const AI_LEVELS = [
    {
        id: 'beg',
        label: 'Beginner',
        query: 'Why does my loop run forever?',
        standard: 'Your while loop condition never becomes false. Make sure to increment the counter.',
        premium: 'Think of it like a treadmill that never stops! 🏃‍♂️\n\nYou are missing an update step:\n`count += 1`\n\nWant to try adding it?'
    },
    {
        id: 'int',
        label: 'Intermediate',
        query: 'How to optimize this nested loop?',
        standard: 'You can reduce O(n²) to O(n) by using a Hash Map for O(1) lookups.',
        premium: 'Great question! Nested loops are `O(n²)`. By trading space for time, we can use a **Hash Map**.\n\nImagine looking up a word in an index instead of reading the whole book. Want a hint?'
    },
    {
        id: 'adv',
        label: 'Advanced',
        query: 'When to use BFS over DFS?',
        standard: 'BFS uses more memory for wide trees, but guarantees shortest path in unweighted graphs.',
        premium: 'BFS guarantees the **shortest path**, but takes `O(V)` space for wide graphs.\n\nDFS is more memory-efficient `O(h)`. What specific graph structure are you dealing with?'
    }
];

// Research Lab Card — cycles through Marevlo's research tracks (paper → implementation)
const RESEARCH_TRACKS = [
    {
        tag: 'Recommender Systems',
        color: '#6672e0',
        paper: 'Deep Collaborative Filtering',
        venue: 'Track · Paper → Code',
        points: ['Sequential & session-based models', 'Context-aware CTR prediction'],
    },
    {
        tag: 'Agentic Search',
        color: '#3fa9c9',
        paper: 'Multi-Step Retrieval Planning',
        venue: 'Track · Paper → Code',
        points: ['Search-tool design', 'Web-search integration'],
    },
    {
        tag: 'Context Engineering',
        color: '#9180e8',
        paper: 'Dynamic Context Assembly',
        venue: 'Track · Paper → Code',
        points: ['System-prompt engineering', 'Few-shot & in-context learning'],
    },
];

function ResearchCard({ isDark = false }) {
    const [idx, setIdx] = useState(0);
    const [rootRef, active] = useActiveInView();

    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setIdx(i => (i + 1) % RESEARCH_TRACKS.length), 4000);
        return () => clearInterval(id);
    }, [active]);

    const cur = RESEARCH_TRACKS[idx];

    return (
        <div ref={rootRef} className="bento-reveal lg:col-span-3 rounded-3xl border overflow-hidden relative transition-all duration-500"
            style={{
                background: isDark ? '#14161d' : 'linear-gradient(145deg, #1a2440, #263457)',
                borderColor: `${cur.color}59`,
            }}>


            <div className="p-5 relative z-10 flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-500"
                        style={{ background: `${cur.color}26`, border: `1px solid ${cur.color}59` }}>
                        <Brain size={15} style={{ color: cur.color }} />
                    </div>
                    <span className="text-xs font-bold tracking-widest uppercase transition-colors duration-500" style={{ color: cur.color }}>
                        Research Lab
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[9px] font-bold text-white/80">
                        {RESEARCH_TRACKS.length} tracks
                    </span>
                </div>

                {/* Cycling research track "paper card" */}
                <div className="flex-1 mb-3 relative min-h-[145px]">
                    <div key={cur.tag} className="rounded-2xl p-4 h-full flex flex-col"
                        style={{
                            animation: 'slideUpFade 0.4s ease-out forwards',
                            background: `${cur.color}14`,
                            border: `1px solid ${cur.color}3d`,
                        }}>
                        <span className="inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mb-2.5"
                            style={{ background: `${cur.color}26`, color: cur.color, border: `1px solid ${cur.color}4d` }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cur.color }} />
                            {cur.tag}
                        </span>

                        <div className="text-sm font-extrabold text-white leading-snug">{cur.paper}</div>
                        <div className="text-[10px] text-neutral-400 font-mono mt-1 mb-3">{cur.venue}</div>

                        <div className="space-y-1.5 mt-auto">
                            {cur.points.map(p => (
                                <div key={p} className="flex items-center gap-2 text-[11px] text-neutral-300">
                                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="flex-shrink-0">
                                        <path d="M1 4L3.5 6.5L9 1" stroke={cur.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    {p}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer — paper → implementation */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl mt-auto"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span className="text-[11px] text-neutral-400 flex-1">From paper to implementation</span>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-500" style={{ background: cur.color }}>
                        <ArrowUpRight size={10} className="text-white" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function AITutorCard({ isDark = false }) {
    const [levelIdx, setLevelIdx] = useState(0);
    const [isPremium, setIsPremium] = useState(true);
    const [isThinking, setIsThinking] = useState(false);
    const [rootRef, active] = useActiveInView();

    // auto cycle levels with thinking phase (paused when off-screen / tab hidden)
    useEffect(() => {
        if (!active) return;
        let inner;
        const id = setInterval(() => {
            setLevelIdx(l => (l + 1) % AI_LEVELS.length);
            setIsThinking(true);
            inner = setTimeout(() => {
                setIsThinking(false);
            }, 1000); // 1 second thinking gap
        }, 4500);
        return () => { clearInterval(id); clearTimeout(inner); };
    }, [active]);

    const cur = AI_LEVELS[levelIdx];

    return (
        <div ref={rootRef} className="lg:col-span-3 rounded-3xl border overflow-hidden relative transition-all duration-500"
            style={{
                background: isDark ? '#14161d' : 'linear-gradient(145deg, #1a2440, #263457)',
                borderColor: isPremium ? 'rgba(145,128,232,0.35)' : 'rgba(var(--secondary-rgb),0.3)'
            }}>

            <div className="absolute -bottom-10 -right-10 w-48 h-48 rounded-full blur-[60px] opacity-20 pointer-events-none transition-colors duration-700 delay-100"
                style={{ background: isPremium ? 'radial-gradient(circle, #9180e8, #6672e0)' : 'radial-gradient(circle, #3fa9c9, #5d8ede)', transform: isThinking ? 'scale(1.2)' : 'scale(1)' }} />

            <div className="p-5 relative z-10 flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all duration-500 relative"
                        style={{
                            background: isPremium ? 'rgba(145,128,232,0.15)' : 'rgba(var(--secondary-rgb),0.15)',
                            border: `1px solid ${isPremium ? 'rgba(145,128,232,0.35)' : 'rgba(var(--secondary-rgb),0.35)'}`,
                            animation: isThinking ? (isPremium ? 'pulseRingPrem 1.5s infinite' : 'pulseRingStd 1.5s infinite') : 'none'
                        }}>
                        {isPremium ? '✨' : '🤖'}
                    </div>
                    <span className="text-xs font-bold tracking-widest uppercase transition-colors duration-500"
                        style={{ color: isPremium ? '#ab9df0' : 'var(--secondary)' }}>
                        {isPremium ? 'Premium AI' : 'Standard AI'}
                    </span>

                    {/* Mode Toggle */}
                    <button
                        onClick={() => { setIsPremium(!isPremium); setIsThinking(true); setTimeout(() => setIsThinking(false), 800); }}
                        className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] font-bold text-white transition-all cursor-pointer shadow-sm active:scale-95">
                        {isPremium ? 'Standard ⚡' : 'Premium ✨'}
                    </button>
                </div>

                {/* Chat area min-h to fit responses without jumping */}
                <div className="flex-1 space-y-3 mb-3 relative min-h-[145px]">
                    {/* User Message - Always visible after level change */}
                    <div key={cur.id + "user"} className="flex justify-end" style={{ animation: 'slideUpFade 0.3s ease-out forwards' }}>
                        <div className="bg-[#6672e0]/25 border border-[#6672e0]/35 rounded-2xl rounded-tr-sm px-3 py-2 text-[11px] text-white max-w-[85%] font-medium">
                            {cur.query}
                        </div>
                    </div>

                    {/* AI Response or Thinking */}
                    <div className="flex justify-start">
                        {isThinking ? (
                            <div key="thinking" className="rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1"
                                style={{
                                    background: isPremium ? 'rgba(145,128,232,0.1)' : 'rgba(var(--secondary-rgb),0.05)',
                                    border: `1px solid ${isPremium ? 'rgba(145,128,232,0.2)' : 'rgba(var(--secondary-rgb),0.15)'}`
                                }}>
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: isPremium ? '#ab9df0' : '#8ed3e3', animation: 'bounceDot 1s infinite' }} />
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: isPremium ? '#ab9df0' : '#8ed3e3', animation: 'bounceDot 1s infinite 0.2s' }} />
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: isPremium ? '#ab9df0' : '#8ed3e3', animation: 'bounceDot 1s infinite 0.4s' }} />
                            </div>
                        ) : (
                            <div key={cur.id + isPremium + "resp"} className="rounded-2xl rounded-tl-sm px-3 py-2 text-[11px] max-w-[95%] leading-relaxed"
                                style={{
                                    animation: 'slideUpFade 0.4s ease-out forwards',
                                    background: isPremium ? 'rgba(145,128,232,0.15)' : 'rgba(var(--secondary-rgb),0.1)',
                                    border: `1px solid ${isPremium ? 'rgba(145,128,232,0.3)' : 'rgba(var(--secondary-rgb),0.25)'}`,
                                    color: isPremium ? '#fff' : '#e2e8f0',
                                    boxShadow: isPremium ? '0 4px 20px rgba(145,128,232,0.15)' : 'none'
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: (isPremium ? cur.premium : cur.standard)
                                        .replace(/`([^`]+)`/g, `<span style="color:${isPremium ? '#dd9ec4' : '#8ed3e3'}; background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:4px; font-family:monospace; font-size:10px">$1</span>`)
                                        .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${isPremium ? '#ab9df0' : 'white'}">$1</strong>`)
                                        .replace(/\n/g, '<br/>')
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* Input bar */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl mt-auto transition-colors duration-500"
                    style={{ background: isThinking ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span className="text-[11px] text-neutral-500 flex-1">{isThinking ? 'AI is typing...' : 'Ask anything...'}</span>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-500"
                        style={{ background: isPremium ? '#9180e8' : 'var(--secondary)', transform: isThinking ? 'scale(0.8)' : 'scale(1)' }}>
                        <ArrowUpRight size={10} className="text-white" />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Approaches Card
const APPROACHES = [
    {
        name: 'Brute Force',
        icon: Hammer,
        tag: 'Simple',
        tagIcon: '○',
        time: 'O(n²)',
        timeBar: 22,
        space: 'O(1)',
        spaceBar: 95,
        timeRating: 'Slow',
        spaceRating: 'Minimal',
        desc: 'Try every pair of numbers. Simple to write but slow. It checks all combinations until a match is found.',
        when: 'Use as a baseline only. Always try to beat this.',
        code: [
            [{ t: 'keyword', v: 'for' }, { t: 'plain', v: ' i ' }, { t: 'keyword', v: 'in' }, { t: 'plain', v: ' range(len(nums)):' }],
            [{ t: 'keyword', v: '  for' }, { t: 'plain', v: ' j ' }, { t: 'keyword', v: 'in' }, { t: 'plain', v: ' range(i+1, len(nums)):' }],
            [{ t: 'keyword', v: '    if' }, { t: 'plain', v: ' nums[i] + nums[j] == target:' }],
            [{ t: 'keyword', v: '      return' }, { t: 'plain', v: ' [i, j]' }],
        ],
        accentFrom: '#e0a050',
        accentTo: '#e09a5e',
    },
    {
        name: 'Hash Map',
        icon: Zap,
        tag: 'Optimal',
        tagIcon: '★',
        time: 'O(n)',
        timeBar: 92,
        space: 'O(n)',
        spaceBar: 55,
        timeRating: 'Fast',
        spaceRating: 'Moderate',
        desc: 'Store each number in a hash map while scanning. For every new element, instantly check if the complement exists.',
        when: 'The go-to interview answer for unsorted arrays.',
        code: [
            [{ t: 'plain', v: 'seen = {}' }],
            [{ t: 'keyword', v: 'for' }, { t: 'plain', v: ' i, n ' }, { t: 'keyword', v: 'in' }, { t: 'fn', v: 'enumerate' }, { t: 'plain', v: '(nums):' }],
            [{ t: 'plain', v: '  diff = target - n' }],
            [{ t: 'keyword', v: '  if' }, { t: 'plain', v: ' diff ' }, { t: 'keyword', v: 'in' }, { t: 'plain', v: ' seen:' }],
            [{ t: 'keyword', v: '    return' }, { t: 'plain', v: ' [seen[diff], i]' }],
        ],
        accentFrom: '#6672e0',
        accentTo: '#9180e8',
    },
    {
        name: 'Two Pointers',
        icon: Target,
        tag: 'Sorted',
        tagIcon: '◈',
        time: 'O(n log n)',
        timeBar: 68,
        space: 'O(1)',
        spaceBar: 95,
        timeRating: 'Moderate',
        spaceRating: 'Minimal',
        desc: 'Sort first, then shrink the window with left & right pointers. Elegant and space-efficient.',
        when: 'Ideal when input is pre-sorted or memory is tight.',
        code: [
            [{ t: 'plain', v: 'nums.sort()' }],
            [{ t: 'plain', v: 'l, r = 0, len(nums) - 1' }],
            [{ t: 'keyword', v: 'while' }, { t: 'plain', v: ' l < r:' }],
            [{ t: 'plain', v: '  s = nums[l] + nums[r]' }],
            [{ t: 'keyword', v: '  if' }, { t: 'plain', v: ' s == target: ' }, { t: 'keyword', v: 'return' }, { t: 'plain', v: ' [l,r]' }],
        ],
        accentFrom: '#3fa9c9',
        accentTo: '#5d8ede',
    },
];

function ApproachesCard({ isDark = false }) {
    const [activeIdx, setActiveIdx] = useState(1);
    const [animKey, setAnimKey] = useState(0);
    const ap = APPROACHES[activeIdx];
    const [rootRef, active] = useActiveInView();

    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => {
            setActiveIdx(i => (i + 1) % APPROACHES.length);
            setAnimKey(k => k + 1);
        }, 4200);
        return () => clearInterval(id);
    }, [active]);

    const handleTab = (i) => { setActiveIdx(i); setAnimKey(k => k + 1); };

    const tokColor = (t) => ({ keyword: '#b39ae8', fn: '#8ed3e3', str: '#fcd34d', comment: '#4b5563', plain: '#e2e8f0' }[t] ?? '#e2e8f0');

    return (
        <div ref={rootRef} className="bento-reveal lg:col-span-5 rounded-3xl relative overflow-hidden"
            style={{
                background: isDark ? '#14161d' : 'linear-gradient(145deg, #1a2440, #263457)',
                border: '1px solid rgba(255,255,255,0.07)'
            }}>

            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-px transition-all duration-700"
                style={{ background: `linear-gradient(90deg, transparent, ${ap.accentFrom}, ${ap.accentTo}, transparent)` }} />

            <div className="relative z-10 p-6">

                {/* Header */}
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}><Lightbulb className="w-4 h-4 text-[#e3b568]" strokeWidth={2} /></div>
                    <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40">Multiple Approaches</span>
                    <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-md"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ap.accentFrom }} />
                        <span className="text-[9px] font-mono text-white/30">dijkstra.py</span>
                    </div>
                </div>

                {/* Question */}
                <p className="text-white/90 font-semibold text-sm mb-4">
                    How would you solve <span className="font-extrabold" style={{
                        background: `linear-gradient(135deg, ${ap.accentFrom}, ${ap.accentTo})`,
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
                    }}>Dijkstra's</span>?
                </p>

                {/* Tab Selector */}
                <div className="grid grid-cols-3 gap-1.5 mb-5 p-1 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {APPROACHES.map((a, i) => (
                        <button key={a.name} onClick={() => handleTab(i)}
                            className="flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer relative overflow-hidden"
                            style={{
                                background: i === activeIdx
                                    ? `linear-gradient(135deg, ${a.accentFrom}22, ${a.accentTo}18)`
                                    : 'transparent',
                                border: `1px solid ${i === activeIdx ? a.accentFrom + '50' : 'transparent'}`,
                                color: i === activeIdx ? '#fff' : 'rgba(255,255,255,0.3)',
                                boxShadow: i === activeIdx ? `0 0 20px ${a.accentFrom}22, inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
                                transform: i === activeIdx ? 'translateY(-1px)' : 'none',
                            }}>
                            <a.icon className="w-[18px] h-[18px]" style={{ color: i === activeIdx ? a.accentFrom : 'rgba(255,255,255,0.4)' }} strokeWidth={2} />
                            <span className="text-[10px] leading-tight text-center">{a.name}</span>
                            {i === activeIdx && (
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                                    style={{ background: `linear-gradient(90deg, ${a.accentFrom}, ${a.accentTo})` }} />
                            )}
                        </button>
                    ))}
                </div>

                {/* Active Card */}
                <div key={animKey} className="rounded-2xl mb-4 overflow-hidden"
                    style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid rgba(255,255,255,0.08)`,
                        animation: 'slideUpFade 0.35s ease-out forwards'
                    }}>

                    {/* Card header */}
                    <div className="flex items-center justify-between px-4 py-3"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: `linear-gradient(90deg, ${ap.accentFrom}12, ${ap.accentTo}08)` }}>
                        <div className="flex items-center gap-2">
                            <ap.icon className="w-5 h-5" style={{ color: ap.accentFrom }} strokeWidth={2} />
                            <span className="text-sm font-extrabold text-white">{ap.name}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                            style={{ background: `linear-gradient(135deg, ${ap.accentFrom}25, ${ap.accentTo}20)`, color: ap.accentFrom, border: `1px solid ${ap.accentFrom}40` }}>
                            {ap.tagIcon} {ap.tag}
                        </span>
                    </div>

                    <div className="px-4 py-3 space-y-3">
                        {/* Description */}
                        <p className="text-xs text-white/55 leading-relaxed">{ap.desc}</p>

                        {/* Complexity bars */}
                        <div className="space-y-2">
                            {[
                                { label: 'Time', val: ap.time, bar: ap.timeBar, rating: ap.timeRating },
                                { label: 'Space', val: ap.space, bar: ap.spaceBar, rating: ap.spaceRating },
                            ].map(({ label, val, bar, rating }) => (
                                <div key={label} className="flex items-center gap-3">
                                    <span className="text-[10px] font-semibold text-white/30 w-8 shrink-0">{label}</span>
                                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                                        <div className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${bar}%`, background: `linear-gradient(90deg, ${ap.accentFrom}, ${ap.accentTo})` }} />
                                    </div>
                                    <code className="text-[10px] font-mono text-white/60 w-16 text-right shrink-0">{val}</code>
                                    <span className="text-[9px] font-bold w-14 shrink-0" style={{ color: ap.accentFrom }}>{rating}</span>
                                </div>
                            ))}
                        </div>

                        {/* Code block */}
                        <div className="rounded-xl overflow-hidden" style={{ background: '#060610', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 rounded-full bg-red-500/50" />
                                    <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                                    <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                </div>
                                <span className="text-[9px] font-mono text-white/20 ml-1">{ap.name.toLowerCase().replace(' ', '_')}.py</span>
                                <div className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ap.accentFrom }} />
                            </div>
                            <div className="p-3 font-mono text-[11px] leading-[1.7] space-y-0.5">
                                {ap.code.map((line, li) => (
                                    <div key={li} className="flex">
                                        <span className="text-white/15 select-none mr-3 text-[9px] w-3 shrink-0">{li + 1}</span>
                                        <span>{line.map((tok, ti) => (
                                            <span key={ti} style={{ color: tokColor(tok.t) }}>{tok.v}</span>
                                        ))}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* When to use */}
                <div className="flex items-start gap-3 px-3.5 py-3 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${ap.accentFrom}10, ${ap.accentTo}08)`, border: `1px solid ${ap.accentFrom}25` }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: ap.accentFrom + '20' }}><MessageSquare className="w-3 h-3" style={{ color: ap.accentFrom }} strokeWidth={2.2} /></div>
                    <div>
                        <span className="text-[10px] font-bold tracking-wider uppercase block mb-0.5" style={{ color: ap.accentFrom }}>When to use</span>
                        <p className="text-[11px] text-white/50 leading-relaxed">{ap.when}</p>
                    </div>
                </div>

                {/* Step dots */}
                <div className="flex justify-center items-center gap-2 mt-4">
                    {APPROACHES.map((a, i) => (
                        <button key={i} onClick={() => handleTab(i)}
                            aria-label={`Show approach ${i + 1}`}
                            className="rounded-full cursor-pointer transition-all duration-400"
                            style={{
                                width: i === activeIdx ? 20 : 5,
                                height: 5,
                                background: i === activeIdx ? `linear-gradient(90deg, ${a.accentFrom}, ${a.accentTo})` : 'rgba(255,255,255,0.12)',
                                boxShadow: i === activeIdx ? `0 0 8px ${a.accentFrom}60` : 'none',
                            }} />
                    ))}
                </div>
            </div>
        </div>
    );
}

// Ladders Card
const LADDER_LEVELS = [
    { level: 0, label: 'Basic Operation', icon: Puzzle, color: '#3fa9c9', desc: 'The atomic action. e.g. "check if a key exists in a dict".' },
    { level: 1, label: 'Building Block', icon: Zap, color: '#9180e8', desc: 'Combine basic ops. e.g. "scan one pass and track a value".' },
    { level: 2, label: 'Core Logic', icon: Lightbulb, color: '#e0a050', desc: 'The heart of the approach. e.g. "lookup complement and store index".' },
    { level: 3, label: 'Key Sub-routine', icon: Wrench, color: '#41bd78', desc: 'Wrap the logic into a reusable sub-function.' },
    { level: 4, label: 'Full Problem', icon: Target, color: '#6672e0', desc: 'Assemble everything into the complete solution.' },
    { level: 5, label: 'Optimised Variant', icon: Rocket, color: '#b988d6', desc: 'Handle edge cases, constraints, and further optimisations.' },
];

const LADDER_EXAMPLE = [
    { level: 0, title: 'Represent the graph', hint: 'graph = {"A": [("B",1), ("C",4)]}', locked: false },
    { level: 1, title: 'BFS (no weights)', hint: 'queue = deque([src]); visited = {src}', locked: false },
    { level: 2, title: 'Add priority queue', hint: 'heap = [(0, src)]; dist = {src: 0}', locked: false },
    { level: 3, title: 'Relax each edge', hint: 'if d+w < dist.get(v, inf): update', locked: true },
    { level: 4, title: 'Full Dijkstra solution', hint: 'heapq.heappush(heap, (dist[v], v))', locked: true },
    { level: 5, title: 'Handle negative weights', hint: 'use Bellman-Ford for neg. edges', locked: true },
];

function LaddersCard({ isDark = false }) {
    const [activeLevel, setActiveLevel] = useState(2);
    const [unlocked, setUnlocked] = useState(3); // 0-2 unlocked (indices 0,1,2)

    const [rootRef, active] = useActiveInView();

    // auto-cycle through unlocked levels (paused when off-screen / tab hidden)
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => {
            setActiveLevel(l => l < unlocked - 1 ? l + 1 : 0);
        }, 2200);
        return () => clearInterval(id);
    }, [unlocked, active]);

    const handleUnlock = () => {
        if (unlocked < LADDER_LEVELS.length) setUnlocked(u => u + 1);
    };

    const ap = LADDER_LEVELS[activeLevel];
    const ex = LADDER_EXAMPLE[activeLevel];

    return (
        <div ref={rootRef} className="bento-reveal lg:col-span-7 rounded-3xl relative overflow-hidden"
            style={{
                background: isDark ? '#14161d' : 'linear-gradient(145deg, #1a2440, #263457)',
                border: '1px solid rgba(255,255,255,0.07)'
            }}>

            {/* Top accent */}
            <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent 5%, ${ap.color}80, transparent 95%)`, transition: 'background 0.5s' }} />

            <div className="relative z-10 p-7">

                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}><ListOrdered className="w-4 h-4 text-white/70" strokeWidth={2} /></div>
                        <div>
                            <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/35">Inside Every Approach</div>
                            <div className="text-lg font-extrabold text-white leading-tight">The Ladder System</div>
                        </div>
                    </div>
                    <p className="sm:ml-auto text-xs text-white/40 max-w-sm leading-relaxed">
                        Each approach is broken into <strong className="text-white/70">6 progressive levels</strong>. Start from the simplest building block and climb up to the full solution, unlocking one step at a time.
                    </p>
                </div>

                {/* Main layout: ladder rail left, detail right */}
                <div className="grid lg:grid-cols-12 gap-6">

                    {/* Left: Vertical Ladder Rail */}
                    <div className="lg:col-span-4">
                        <div className="relative">
                            {/* Vertical connector line */}
                            <div className="absolute left-[19px] top-5 bottom-5 w-px"
                                style={{ background: 'rgba(255,255,255,0.06)' }} />

                            <div className="space-y-2">
                                {LADDER_LEVELS.map((lvl, i) => {
                                    const isUnlocked = i < unlocked;
                                    const isActive = i === activeLevel;
                                    const isNext = i === unlocked;
                                    return (
                                        <button key={i}
                                            onClick={() => isUnlocked && setActiveLevel(i)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all duration-300 relative"
                                            style={{
                                                background: isActive ? `linear-gradient(90deg, ${lvl.color}18, transparent)` : 'transparent',
                                                border: `1px solid ${isActive ? lvl.color + '40' : 'transparent'}`,
                                                cursor: isUnlocked ? 'pointer' : 'default',
                                                opacity: !isUnlocked && !isNext ? 0.35 : 1,
                                            }}>
                                            {/* Node circle */}
                                            <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold relative z-10"
                                                style={{
                                                    background: isActive ? lvl.color : isUnlocked ? lvl.color + '25' : 'rgba(255,255,255,0.05)',
                                                    border: `2px solid ${isActive ? lvl.color : isUnlocked ? lvl.color + '60' : 'rgba(255,255,255,0.1)'}`,
                                                    color: isActive ? '#fff' : isUnlocked ? lvl.color : 'rgba(255,255,255,0.2)',
                                                    boxShadow: isActive ? `0 0 10px ${lvl.color}40` : 'none',
                                                    transition: 'all 0.35s',
                                                }}>
                                                {isUnlocked
                                                    ? <lvl.icon className="w-[18px] h-[18px]" strokeWidth={2} />
                                                    : <Lock className="w-4 h-4" strokeWidth={2} />}
                                            </div>
                                            {/* Label */}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isUnlocked ? lvl.color : 'rgba(255,255,255,0.2)' }}>L{lvl.level}</span>
                                                    {isNext && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#41bd7820', color: '#41bd78', border: '1px solid #41bd7840' }}>Next</span>}
                                                </div>
                                                <div className="text-xs font-semibold truncate" style={{ color: isActive ? '#fff' : isUnlocked ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }}>{lvl.label}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Unlock button */}
                            {unlocked < LADDER_LEVELS.length && (
                                <button onClick={handleUnlock}
                                    className="w-full mt-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-300 hover:-translate-y-0.5"
                                    style={{
                                        background: `linear-gradient(135deg, ${LADDER_LEVELS[unlocked].color}30, ${LADDER_LEVELS[unlocked].color}15)`,
                                        border: `1px solid ${LADDER_LEVELS[unlocked].color}50`,
                                        color: LADDER_LEVELS[unlocked].color,
                                        boxShadow: `0 4px 16px ${LADDER_LEVELS[unlocked].color}25`,
                                    }}>
                                    <Unlock className="w-3.5 h-3.5" strokeWidth={2.2} /> Unlock L{unlocked}: {LADDER_LEVELS[unlocked].label}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Right: Active Level Detail */}
                    <div className="lg:col-span-8 flex flex-col gap-4">

                        {/* Active level card */}
                        <div key={activeLevel} className="rounded-2xl overflow-hidden"
                            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.08)`, animation: 'slideUpFade 0.3s ease-out forwards' }}>

                            {/* Card top bar */}
                            <div className="px-5 py-3.5 flex items-center gap-3"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: `linear-gradient(90deg, ${ap.color}15, transparent)` }}>
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                                    style={{ background: ap.color + '20', border: `1px solid ${ap.color}40` }}><ap.icon className="w-[18px] h-[18px]" style={{ color: ap.color }} strokeWidth={2} /></div>
                                <div>
                                    <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: ap.color }}>Level {ap.level} · {ap.label}</div>
                                    <div className="text-sm font-bold text-white">{ex.title}</div>
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ap.color }} />
                                    <span className="text-[9px] font-mono text-white/25">hash_map.py</span>
                                </div>
                            </div>

                            <div className="p-5 space-y-4">
                                {/* Level description */}
                                <p className="text-sm text-white/55 leading-relaxed">{ap.desc}</p>

                                {/* Mini code hint */}
                                <div className="rounded-xl overflow-hidden" style={{ background: '#05050f', border: `1px solid ${ap.color}20` }}>
                                    <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${ap.color}15` }}>
                                        <div className="flex gap-1">
                                            <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(224,102,97,0.5)' }} />
                                            <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(224,160,80,0.5)' }} />
                                            <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(65,189,120,0.5)' }} />
                                        </div>
                                        <span className="text-[9px] font-mono text-white/20">L{ap.level}_hint.py</span>
                                    </div>
                                    <div className="p-4 font-mono text-[12px] leading-relaxed" style={{ color: ap.color }}>
                                        <span className="text-white/20 mr-3 text-[9px]">1</span>{ex.hint}
                                    </div>
                                </div>

                                {/* Progress dots showing all levels */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-white/25 font-semibold">Progress:</span>
                                    <div className="flex items-center gap-1.5 flex-1">
                                        {LADDER_LEVELS.map((lvl, i) => (
                                            <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-500"
                                                style={{
                                                    background: i < unlocked
                                                        ? (i <= activeLevel ? lvl.color : lvl.color + '40')
                                                        : 'rgba(255,255,255,0.07)',
                                                    boxShadow: i === activeLevel ? `0 0 6px ${lvl.color}50` : 'none',
                                                }} />
                                        ))}
                                    </div>
                                    <span className="text-[10px] font-bold" style={{ color: ap.color }}>{unlocked}/{LADDER_LEVELS.length}</span>
                                </div>
                            </div>
                        </div>

                        {/* Bottom row: 3 quick stat pills */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: 'Levels per approach', value: '6', sub: 'L0 → L5', icon: ListOrdered, c: '#6672e0' },
                                { label: 'Progressive unlock', value: '1 at a time', sub: 'earn your way up', icon: Unlock, c: '#41bd78' },
                                { label: 'Each level has', value: 'Tests + Hints', sub: 'with explanation', icon: Lightbulb, c: '#e0a050' },
                            ].map((stat) => (
                                <div key={stat.label} className="rounded-2xl p-4 flex flex-col gap-1"
                                    style={{ background: stat.c + '08', border: `1px solid ${stat.c}20` }}>
                                    <stat.icon className="w-[18px] h-[18px]" style={{ color: stat.c }} strokeWidth={2} />
                                    <div className="text-sm font-extrabold text-white">{stat.value}</div>
                                    <div className="text-[10px] font-semibold" style={{ color: stat.c }}>{stat.label}</div>
                                    <div className="text-[9px] text-white/30">{stat.sub}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── FeaturesSection ────────────────────────────────────────────────────────
const FEATURES = [
    { icon: Terminal, title: 'Interactive In-Browser IDE',    desc: 'Write, run, and debug Python, JS, C++ and more with zero setup. Instant feedback with syntax highlighting.', color: '#6672e0', tags: ['Multi-language', 'Real-time output', 'Auto-complete'] },
    { icon: Film, title: 'Live Algorithm Visualizer',     desc: 'Watch BFS, DFS, sorting, and DP animate in real time. Pause, step, rewind. Concepts click instantly.', color: '#3fa9c9', tags: ['Step-by-step', 'Interactive', '50+ algorithms'] },
    { icon: Users, title: 'Community & Social Feed',       desc: 'Share solutions, get peer code reviews, follow top solvers, and celebrate milestones together.', color: '#6672e0', tags: ['Code reviews', 'Discussions', 'Leaderboard'] },
    { icon: Map, title: 'Structured Learning Paths',    desc: 'Follow expert-curated paths: DSA → System Design → ML. No more guessing what to study next.', color: '#3fa9c9', tags: ['Curated', 'Progressive', 'Certified'] },
    { icon: Briefcase, title: 'Job Board',                     desc: 'Exclusive listings for junior-to-mid developers. Your Marevlo profile IS your portfolio.', color: '#6672e0', tags: ['Junior-friendly', 'Portfolio', 'Direct apply'] },
];

// Overshoot bezier — y-value past 1 makes entrances pop with a slight bounce.
const POP_EASE = [0.33, 1.42, 0.05, 0.96];

function FeatureCard({ feat, isDark, delay, className = '' }) {
    return (
        <motion.div
            className={`group relative p-6 rounded-3xl border overflow-hidden cursor-default ${className}`}
            style={{
                background: isDark ? 'linear-gradient(145deg,#14161d,#1a1d27)' : 'var(--card)',
                borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'var(--border)',
            }}
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.1 }}
            whileHover={{ y: -8, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
            transition={{ duration: 0.65, ease: POP_EASE, delay }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = `0 20px 60px -10px ${feat.color}25`}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 0 transparent'}>
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl"
                style={{ background: `radial-gradient(ellipse at top left, ${feat.color}10, transparent 60%)` }} />
            <div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, transparent, ${feat.color}, transparent)` }} />
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3"
                style={{ background: `${feat.color}15`, border: `1px solid ${feat.color}30` }}>
                <feat.icon className="w-6 h-6" style={{ color: feat.color }} strokeWidth={2} />
            </div>
            <h3 className="text-lg font-bold mb-2 text-foreground">{feat.title}</h3>
            <p className="text-sm leading-relaxed mb-4 text-muted-foreground">{feat.desc}</p>
            <div className="flex flex-wrap gap-1.5">
                {feat.tags.map(tag => (
                    <span key={tag} className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: `${feat.color}12`, color: feat.color, border: `1px solid ${feat.color}25` }}>
                        {tag}
                    </span>
                ))}
            </div>
        </motion.div>
    );
}

function FeaturesHeader() {
    const [ref, visible] = useScrollReveal(0.08);
    return (
        <div ref={ref} className="text-center mb-14"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.7s ease' }}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border mb-5"
                style={{ background: 'rgba(var(--primary-rgb),0.06)', borderColor: 'rgba(var(--primary-rgb),0.2)' }}>
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                <span className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--primary)' }}>Everything you need</span>
            </div>
            <h2 className="text-[2.5rem] md:text-[3.25rem] font-extrabold tracking-[-0.025em] mb-4 text-foreground">
                <RevealText segments={[
                    { text: 'Built for how' },
                    {
                        text: 'developers actually learn',
                        style: { background: 'linear-gradient(135deg,var(--primary),var(--secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' },
                    },
                ]} />
            </h2>
            <p className="max-w-[520px] mx-auto text-[1.05rem] leading-relaxed text-muted-foreground">
                Six tools, one platform. No tab-switching between YouTube, coding judges, Stack Overflow, and Discord.
            </p>
        </div>
    );
}

function FeaturesSection({ isDark }) {
    return (
        <section className="py-24 px-4 relative overflow-hidden" style={{ background: isDark ? 'transparent' : 'var(--muted)' }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${isDark ? 'rgba(var(--primary-rgb),0.07)' : 'rgba(var(--primary-rgb),0.04)'}, transparent)` }} />
            <div className="max-w-7xl mx-auto relative z-10">
                <FeaturesHeader />
                <div className="flex flex-wrap justify-center gap-5">
                    {FEATURES.map((feat, i) => (
                        <FeatureCard key={feat.title} feat={feat} isDark={isDark} delay={i * 0.09} className="w-full md:w-[calc(50%_-_10px)] lg:w-[calc(33.333%_-_13.34px)]" />
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─── MiraSection ────────────────────────────────────────────────────────────
const MIRA_POINTS = [
    { icon: Puzzle,     title: 'Adapts to your level', desc: 'Beginner-friendly or expert mode. MIRA detects where you are and adjusts instantly.' },
    { icon: Lightbulb,  title: 'Hints, not answers',   desc: 'Builds genuine understanding so you can solve the next hard problem on your own.' },
    { icon: TrendingUp, title: 'Tracks your progress', desc: 'Identifies weak patterns and nudges you toward them before your next interview.' },
];

function MiraSection({ isDark }) {
    const [ref, visible] = useScrollReveal(0.08);
    const reveal = (d = 0) => ({
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${d}s, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${d}s, box-shadow 0.3s ease`,
    });

    return (
        <section ref={ref} className="py-32 px-4 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse 70% 50% at 78% 8%, ${isDark ? 'rgba(145,128,232,0.10)' : 'rgba(145,128,232,0.06)'}, transparent)` }} />

            <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">

                {/* LEFT — chat demo */}
                <div style={reveal(0)}>
                    <div className="rounded-3xl border overflow-hidden relative"
                        style={{
                            background: isDark ? '#14161d' : 'linear-gradient(145deg,#1a2440,#263457)',
                            borderColor: 'rgba(145,128,232,0.35)',
                            boxShadow: '0 30px 70px -30px rgba(145,128,232,0.45)',
                        }}>
                        {/* header */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center relative flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg,#5fc4dd,#6672e0)' }}>
                                <Bot className="w-5 h-5 text-white" strokeWidth={2} />
                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                                    style={{ background: '#41bd78', borderColor: '#14161d' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-white">MIRA</div>
                                <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#41bd78' }} />
                                    Online · Adaptive AI Tutor
                                </div>
                            </div>
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                                style={{ background: 'rgba(145,128,232,0.18)', color: '#c5bdf2', border: '1px solid rgba(145,128,232,0.4)' }}>
                                <Sparkles className="w-3 h-3" /> Premium
                            </span>
                        </div>

                        {/* messages */}
                        <div className="p-5 space-y-3" style={{ minHeight: 256 }}>
                            <div className="flex justify-end">
                                <div className="rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] max-w-[80%] leading-relaxed text-white"
                                    style={{ background: 'linear-gradient(135deg,#6672e0,#5560cf)' }}>
                                    I don't understand recursion at all. Can you help?
                                </div>
                            </div>
                            <div className="flex gap-2.5 items-start">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{ background: 'linear-gradient(135deg,#5fc4dd,#6672e0)' }}>
                                    <Bot className="w-3.5 h-3.5 text-white" />
                                </div>
                                <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[13px] max-w-[85%] leading-relaxed"
                                    style={{ background: 'rgba(145,128,232,0.15)', border: '1px solid rgba(145,128,232,0.3)', color: '#ede9fe' }}>
                                    Of course! Think of recursion like Russian dolls 🪆: each doll contains a smaller version of itself. A function that calls <em>itself</em> is the same idea. Want to see it with factorial?
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <div className="rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] max-w-[80%] leading-relaxed text-white"
                                    style={{ background: 'linear-gradient(135deg,#6672e0,#5560cf)' }}>
                                    Yes! Show me with factorial.
                                </div>
                            </div>
                        </div>

                        {/* input */}
                        <div className="px-5 pb-5">
                            <div className="flex items-center gap-2 rounded-full px-4 py-2.5"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <span className="flex-1 text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Ask MIRA anything…</span>
                                <button className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer"
                                    style={{ background: 'linear-gradient(135deg,#9180e8,#6672e0)' }} aria-label="Send message">
                                    <ArrowUpRight className="w-4 h-4 text-white" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT — copy + points */}
                <div>
                    <div style={reveal(0.05)}>
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
                            style={{ background: 'rgba(145,128,232,0.08)', borderColor: 'rgba(145,128,232,0.3)' }}>
                            <Brain className="w-3.5 h-3.5" style={{ color: '#ab9df0' }} />
                            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#ab9df0' }}>Meet MIRA</span>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter mb-5 text-foreground leading-[1.05]">
                            An AI tutor that{' '}
                            <span style={{ background: 'linear-gradient(135deg,#9180e8 0%,#6672e0 55%,#3fa9c9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                                thinks like a teacher
                            </span>
                        </h2>
                        <p className="text-lg leading-relaxed mb-8 text-muted-foreground max-w-xl">
                            MIRA doesn't just give answers; it guides you toward them. Using the Socratic method and cognitive learning science, it meets you at your level and adapts in real time.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {MIRA_POINTS.map((point, i) => (
                            <div key={point.title}
                                style={{
                                    ...reveal(0.12 + i * 0.08),
                                    background: isDark ? 'rgba(255,255,255,0.03)' : 'var(--card)',
                                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'var(--border)'}`,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 16px 40px -18px rgba(145,128,232,0.4)'; e.currentTarget.style.borderColor = 'rgba(145,128,232,0.4)'; }}
                                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'var(--border)'; }}
                                className="flex items-start gap-4 p-4 rounded-2xl">
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'rgba(145,128,232,0.12)', border: '1px solid rgba(145,128,232,0.3)' }}>
                                    <point.icon className="w-5 h-5" style={{ color: '#ab9df0' }} strokeWidth={2} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold mb-1 text-foreground">{point.title}</h3>
                                    <p className="text-sm leading-relaxed text-muted-foreground">{point.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─── Main LandingPage ────────────────────────────────────────────────────────
export default function LandingPage({ onStart, onExplore }) {
    const { isDark } = useTheme();
    // One observer on the bento grid flips .bento-grid-visible; the cards'
    // .bento-reveal CSS (index.css) handles the staggered pop-in from there.
    const [bentoRef, bentoVisible] = useScrollReveal(0.08);
    return (
        <div className="overflow-y-auto h-full text-primary-text scroll-smooth bg-app-bg">

            {/* HERO */}
            <section className="relative pt-28 pb-32 px-4 overflow-hidden">
                <BackgroundFx />
                <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-14 items-center relative z-10">

                    {/* Left: Copy — staggered entrance */}
                    <div>
                        {/* Badge */}
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}>
                            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-7 border" style={{ background: 'rgba(var(--primary-rgb),0.07)', borderColor: 'rgba(var(--primary-rgb),0.2)' }}>
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--primary)' }} />
                                <span className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--primary)' }}>DSA · Courses · Visualize · AI Tutor</span>
                            </div>
                        </motion.div>

                        {/* Headline — masked word-by-word rise */}
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }}>
                            <h1 className="text-[3.5rem] md:text-[4.5rem] font-extrabold leading-[1.08] mb-6 tracking-[-0.03em] text-foreground">
                                <RevealText mode="mount" delay={0.15} stagger={0.07} duration={0.7} segments={[
                                    { text: 'Learn. Solve.' },
                                    { br: true },
                                    {
                                        text: 'Actually understand it.',
                                        style: {
                                            background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                                            backgroundSize: '200% 200%',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            animation: 'gradientShift 6s ease infinite',
                                        },
                                    },
                                ]} />
                            </h1>
                        </motion.div>

                        {/* Subtext */}
                        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.22 }}>
                            <p className="text-[1.1rem] mb-8 max-w-[480px] leading-[1.75] text-muted-foreground">
                                The{' '}
                                <span className="font-semibold text-foreground">curriculum</span>
                                , the{' '}
                                <span className="font-semibold text-foreground">tools</span>
                                , and the{' '}
                                <span className="font-semibold" style={{ color: 'var(--primary)' }}>community</span>
                                {' '}to go from beginner to confident problem solver, one concept at a time.
                            </p>
                        </motion.div>

                        {/* CTAs */}
                        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}>
                            <div className="flex flex-col sm:flex-row gap-3 mb-10">
                                <motion.button
                                    onClick={onStart}
                                    whileHover={{ y: -3 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: 'spring', stiffness: 450, damping: 20 }}
                                    className="group px-7 py-3.5 text-white rounded-xl font-bold text-base flex items-center justify-center relative overflow-hidden cursor-pointer"
                                    style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)', boxShadow: '0 4px 20px rgba(var(--primary-rgb),0.3), 0 1px 0 rgba(255,255,255,0.15) inset' }}
                                >
                                    <span className="relative z-10 flex items-center gap-2">
                                        Start for free
                                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                    </span>
                                </motion.button>
                                <motion.button
                                    onClick={onExplore}
                                    whileHover={{ y: -3 }}
                                    whileTap={{ scale: 0.97 }}
                                    transition={{ type: 'spring', stiffness: 450, damping: 20 }}
                                    className="px-7 py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer text-foreground"
                                    style={{ background: 'transparent', border: '1.5px solid var(--border)' }}
                                >
                                    Explore Community
                                </motion.button>
                            </div>
                        </motion.div>

                        {/* Social proof — keeps it credible without being clutter */}
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.42 }}>
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                                {[
                                    { icon: CheckCircle2, label: 'Free to start' },
                                    { icon: Zap, label: '1,000+ problems' },
                                    { icon: Brain, label: 'AI tutor 24/7' },
                                ].map(({ icon: Icon, label }) => (
                                    <div key={label} className="flex items-center gap-1.5">
                                        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
                                        <span className="text-sm font-medium text-muted-foreground">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>

                    {/* Right: Animated Typing Terminal */}
                    <motion.div
                        className="relative hidden lg:block"
                        initial={{ opacity: 0, y: 30, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
                    >
                        <HeroCodeStage>
                            <TypingTerminal />
                        </HeroCodeStage>
                    </motion.div>
                </div>
            </section>

            {/* MAREVLO ECOSYSTEM: PLATFORM IN ACTION */}
            <section className="relative pt-24 pb-32 px-4 overflow-hidden" style={{ background: isDark ? 'transparent' : 'var(--muted)' }}>
                <div className="max-w-7xl mx-auto px-4 relative z-10">

                    {/* Header — reveals when scrolled into view, not on page mount */}
                    <motion.div
                        className="text-center mb-14"
                        initial={{ opacity: 0, y: 28 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border mb-5"
                            style={{ background: 'rgba(var(--primary-rgb),0.06)', borderColor: 'rgba(var(--primary-rgb),0.2)' }}>
                            <Layers className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                            <span className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--primary)' }}>Platform in Action</span>
                        </div>
                        <h2 className="text-[2.75rem] md:text-[3.5rem] font-extrabold tracking-[-0.025em] mb-4 text-foreground">
                            <RevealText segments={[
                                { text: 'Everything you need,' },
                                {
                                    text: 'built inside one platform',
                                    style: {
                                        background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                                    },
                                },
                            ]} />
                        </h2>
                        <p className="max-w-xl mx-auto text-lg text-muted-foreground">
                            Not a collection of random resources. A tightly integrated system: courses, problems, approaches, visualizations, and an AI assistant, all working together.
                        </p>
                    </motion.div>

                    {/* BENTO GRID — staggered pop-in entrance via .bento-reveal */}
                    <div ref={bentoRef} className={`grid grid-cols-1 lg:grid-cols-12 grid-rows-auto gap-4 ${bentoVisible ? 'bento-grid-visible' : ''}`}>

                        {/* ROW 1: METHODOLOGY */}

                        {/* [1] Approaches */}
                        <ApproachesCard isDark={isDark} />

                        {/* [2] Ladders */}
                        <LaddersCard isDark={isDark} />

                        {/* ROW 2 */}

                        {/* [3] Visualization — ANIMATED BFSVisualizer */}
                        <BFSVisualizer isDark={isDark} />

                        {/* [4] Courses — PREMIUM DARK (col 4) */}
                        <div className="bento-reveal lg:col-span-4 rounded-3xl border overflow-hidden relative group hover:scale-[1.01] transition-transform duration-300"
                            style={{
                                background: isDark ? '#14161d' : 'linear-gradient(145deg, #1a2440, #263457)',
                                borderColor: 'rgba(var(--primary-rgb),0.3)'
                            }}>
                            <div className="p-6 relative z-10">
                                <div className="flex items-center gap-2 mb-5">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                                        style={{ background: 'rgba(var(--primary-rgb),0.2)', border: '1px solid rgba(var(--primary-rgb),0.4)' }}><GraduationCap className="w-4 h-4" style={{ color: 'var(--primary)' }} strokeWidth={2} /></div>
                                    <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--primary)' }}>Our Courses</span>
                                    <div className="ml-auto text-[10px] font-semibold text-neutral-500">4 tracks</div>
                                </div>

                                {/* Real Marevlo courses */}
                                <div className="space-y-2.5">
                                    {[
                                        { title: 'Generative AI', tag: 'Hot', lessons: 28, bar: 'linear-gradient(135deg,#6672e0,#5560cf)', tagC: '#6672e0', glow: '#6672e012' },
                                        { title: 'Data Science', tag: 'New', lessons: 34, bar: 'linear-gradient(135deg,#3fa9c9,#35879f)', tagC: '#3fa9c9', glow: '#3fa9c912' },
                                        { title: 'Clustering', tag: 'New', lessons: 12, bar: 'linear-gradient(135deg,#98a0ed,#6672e0)', tagC: '#98a0ed', glow: '#6672e00c' },
                                        { title: 'LangGraph', tag: 'New', lessons: 8, bar: 'linear-gradient(135deg,#5fc4dd,#3fa9c9)', tagC: '#5fc4dd', glow: '#3fa9c90c' },
                                    ].map(({ title, tag, lessons, bar, tagC, glow }) => (
                                        <div key={title}
                                            className="relative flex items-center gap-3 px-3 py-3 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                                            style={{ background: glow, border: `1px solid ${tagC}20` }}>

                                            {/* Left gradient bar */}
                                            <div className="w-1 h-9 rounded-full flex-shrink-0" style={{ background: bar, boxShadow: `0 0 8px ${tagC}60` }} />

                                            {/* Text */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold text-white truncate">{title}</div>
                                                <div className="text-[10px] text-neutral-400">{lessons} lessons</div>
                                            </div>

                                            {/* Tag */}
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                                                style={{ background: `${tagC}20`, color: tagC, border: `1px solid ${tagC}30` }}>{tag}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer hint */}
                                <div className="mt-4 flex items-center gap-1.5">
                                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                                    <span className="text-[10px] font-semibold px-2" style={{ color: 'var(--primary)' }}>+ more coming soon</span>
                                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                                </div>
                            </div>
                        </div>

                        {/* [5] Research Lab — MEDIUM (col 3) */}
                        <ResearchCard isDark={isDark} />

                        {/* ROW 3: ALL PROBLEMS */}

                        {/* [6] DSA Problems — LARGE dark card moved to bottom (col 12) */}
                        <div className="bento-reveal lg:col-span-12 rounded-[2rem] border overflow-hidden relative group transition-transform duration-300"
                            style={{
                                background: isDark ? '#14161d' : 'linear-gradient(145deg, #1a2440, #263457)',
                                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)',
                                boxShadow: isDark ? '0 20px 45px -24px rgba(0,0,0,0.7)' : '0 18px 40px -22px rgba(15,23,42,0.3)'
                            }}>
                            <div className="p-8 md:p-12 relative z-10 flex flex-col md:flex-row gap-12 items-center">
                                {/* Left desc */}
                                <div className="flex-1 relative">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm shadow-inner overflow-hidden relative"
                                            style={{ background: 'rgba(var(--primary-rgb),0.2)', border: '1px solid rgba(var(--primary-rgb),0.5)' }}>
                                            <div className="absolute inset-0 bg-gradient-to-tr from-[#6672e0]/40 to-transparent"></div>
                                            <Rocket className="relative z-10 w-4 h-4 text-white" strokeWidth={2} />
                                        </div>
                                        <span className="text-xs font-black tracking-[0.2em] uppercase bg-clip-text text-transparent bg-gradient-to-r from-[#a8aef0] to-[#7ccfe2]">Massive Question Bank</span>
                                    </div>
                                    <h3 className="text-4xl md:text-5xl font-extrabold mb-5 tracking-tight text-white leading-tight">
                                        1,000+ Interactive<br />
                                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#a8aef0] to-[#7ccfe2]">Challenges</span>
                                    </h3>
                                    <p className="text-neutral-300 text-sm md:text-base max-w-md mb-8 leading-relaxed font-medium">Dive into our massive syllabus covering every core pattern. Each question features stunning visualizers, multi-approach ladders, and an integrated AI IDE to keep you hooked.</p>

                                    <div className="flex flex-wrap gap-3">
                                        {[['1000+ Questions', '#6672e0'], ['Interactive IDE', '#3fa9c9'], ['Visualizers', '#6672e0']].map(([text, color]) => (
                                            <div key={text} className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all hover:-translate-y-1 cursor-default"
                                                style={{ background: `${color}15`, color: color, border: `1px solid ${color}40`, boxShadow: `0 4px 12px ${color}10` }}>
                                                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: color }}></div>
                                                {text}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right mini list */}
                                <div className="flex-1 w-full relative pt-2">
                                    <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[rgb(13,13,13)] to-transparent z-10 pointer-events-none rounded-b-3xl"></div>

                                    <div className="space-y-3 relative z-0">
                                        {[
                                            { num: '#42', name: 'Trapping Rain Water', diff: 'Hard', done: true, dc: '#e06661', views: '24k' },
                                            { num: '#105', name: 'Construct Binary Tree', diff: 'Medium', done: true, dc: '#e0a050', views: '18k' },
                                            { num: '#146', name: 'LRU Cache Design', diff: 'Medium', done: false, dc: '#e0a050', views: '45k' },
                                            { num: '#200', name: 'Number of Islands', diff: 'Medium', done: false, dc: '#e0a050', views: '32k' },
                                            { num: '#295', name: 'Find Median from Data', diff: 'Hard', done: false, dc: '#e06661', views: '12k' },
                                        ].map(({ num, name, diff, done, dc, views }, i) => (
                                            <div key={num} className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all duration-300 hover:bg-white/10 cursor-pointer ${i > 2 ? 'opacity-80' : ''} ${i > 3 ? 'opacity-40 blur-[1px]' : ''}`}
                                                style={{ border: '1px solid rgba(255,255,255,0.08)', transform: `translateX(${i * 6}px)` }}>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${done ? 'bg-[#6672e0]/20' : ''}`}
                                                    style={{ borderColor: done ? '#6672e0' : 'rgba(255,255,255,0.2)' }}>
                                                    {done && <div className="w-2 h-2 rounded-full bg-[#98a0ed]" />}
                                                    {!done && <div className="w-1.5 h-1.5 rounded-full bg-white/10 group-hover:bg-white/30 transition-colors" />}
                                                </div>
                                                <span className="text-neutral-400 text-xs font-mono w-8">{num}</span>
                                                <span className="text-neutral-200 text-sm font-semibold flex-1 tracking-wide">{name}</span>

                                                <div className="flex items-center gap-4">
                                                    <span className="text-[10px] font-bold px-3 py-1 rounded-lg shadow-sm"
                                                        style={{ background: `${dc}18`, color: dc, border: `1px solid ${dc}35` }}>{diff}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-center pt-8 relative z-20">
                                        <button className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#6672e0]/10 border border-[#6672e0]/30 text-[#a8aef0] text-sm font-bold tracking-wide hover:bg-[#6672e0]/20 hover:text-white transition-all hover:-translate-y-0.5 cursor-pointer">
                                            <span>Explore All 1000+ Problems</span>
                                            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            <FeaturesSection isDark={isDark} />

            {/* HOW IT WORKS */}
            <section className={`py-24 relative overflow-hidden ${isDark ? 'bg-black' : 'bg-primary/5'}`}>

                <div className="max-w-7xl mx-auto px-4 relative z-10">
                    <div className="text-center mb-20 flex flex-col items-center">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border mb-5"
                            style={{ background: 'rgba(var(--primary-rgb),0.06)', borderColor: 'rgba(var(--primary-rgb),0.2)' }}>
                            <GitBranch className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                            <span className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--primary)' }}>How it works</span>
                        </div>
                        <h2 className="text-[2.25rem] md:text-[3rem] font-extrabold mb-5 tracking-[-0.025em] text-foreground">
                            Your Path to{' '}
                            <span style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Mastery</span>
                        </h2>
                        <p className="text-[1.05rem] max-w-xl mx-auto leading-relaxed text-muted-foreground">
                            A structured workflow designed to take you from novice to expert through consistent practice and AI-driven feedback.
                        </p>
                    </div>

                    <div className="relative pt-10 pb-20">
                        {/* Staggered, overlapping animated floating cards */}
                        <div className="flex flex-col md:flex-row justify-center items-center gap-12 md:gap-0 relative z-10 md:h-[450px]">
                            {[
                                { step: "01", title: "Set Goals", desc: "Define your level & identify weak algorithmic spots.", icon: Target, color: "#6672e0", anim: "animate-float-1", offset: "md:-mt-32 md:z-10" },
                                { step: "02", title: "Practice", desc: "Solve adaptive challenges daily in our immersive IDE.", icon: Keyboard, color: "#5560cf", anim: "animate-float-2", offset: "md:mt-32 md:-ml-8 md:z-20" },
                                { step: "03", title: "Collaborate", desc: "Review multi-approach code with community peers.", icon: Users, color: "#5d8ede", anim: "animate-float-3", offset: "md:-mt-24 md:-ml-8 md:z-30" },
                                { step: "04", title: "Succeed", desc: "Crush those hard interviews and get verified.", icon: Rocket, color: "#3fa9c9", anim: "animate-float-4", offset: "md:mt-40 md:-ml-8 md:z-40" }
                            ].map((item, i) => (
                                <div key={i} className={`relative group w-full max-w-[300px] md:w-[280px] p-8 md:p-10 rounded-[2rem] transition-all duration-300 hover:-translate-y-2 hover:z-50 ${item.anim} ${item.offset}`}
                                    style={{
                                        background: isDark ? '#14161d' : 'var(--card)',
                                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'var(--border)'}`,
                                        boxShadow: isDark
                                            ? '0 20px 40px -24px rgba(0,0,0,0.7)'
                                            : '0 16px 36px -22px rgba(15,23,42,0.25)'
                                    }}>

                                    {/* Number Badge */}
                                    <div className={`absolute -top-5 -right-5 w-14 h-14 rounded-full flex items-center justify-center font-black text-lg text-white border-4 ${isDark ? 'border-black' : 'border-white'}`}
                                        style={{ background: item.color }}>
                                        {item.step}
                                    </div>

                                    {/* Icon & Content */}
                                    <div className="mb-6 w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:-translate-y-1"
                                        style={{ background: `${item.color}14`, border: `1px solid ${item.color}33` }}>
                                        <item.icon className="w-7 h-7" style={{ color: item.color }} strokeWidth={2} />
                                    </div>
                                    <h3 className="text-2xl font-black mb-3 tracking-tighter text-foreground">{item.title}</h3>
                                    <p className="text-sm leading-relaxed font-medium transition-colors text-muted-foreground group-hover:text-foreground">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Footer */}
            <section className={`py-28 relative overflow-hidden flex items-center justify-center border-t border-border`}
                style={{ background: isDark
                    ? 'radial-gradient(ellipse at bottom, #181830 0%, #08080f 100%)'
                    : 'radial-gradient(ellipse at bottom, #eef2ff 0%, var(--background) 100%)'
                }}>
                {/* Subtle dot grid */}
                <div className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: `radial-gradient(${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(102,114,224,0.08)'} 1px, transparent 1px)`,
                        backgroundSize: '28px 28px',
                        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%)',
                    }} />

                <div className="max-w-3xl mx-auto px-6 relative z-10 text-center flex flex-col items-center">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border mb-8"
                        style={{ background: 'rgba(var(--primary-rgb),0.06)', borderColor: 'rgba(var(--primary-rgb),0.2)' }}>
                        <Rocket className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
                        <span className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--primary)' }}>Get started today</span>
                    </div>

                    <h2 className="text-[2.5rem] md:text-[4rem] font-black mb-8 tracking-[-0.03em] leading-[1.08] text-foreground">
                        <RevealText segments={[
                            { text: 'Ready to level up?' },
                            {
                                text: 'Start coding today.',
                                style: {
                                    background: `linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)`,
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                },
                            },
                        ]} />
                    </h2>

                    <motion.button
                        onClick={onStart}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        className="group relative inline-flex items-center justify-center px-9 py-4 text-lg font-bold rounded-xl overflow-hidden cursor-pointer"
                        style={{
                            background: isDark ? '#fff' : 'linear-gradient(135deg, var(--primary), var(--secondary))',
                            color: isDark ? '#0a0c14' : '#fff',
                            boxShadow: isDark
                                ? '0 8px 24px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.1) inset'
                                : '0 8px 24px rgba(var(--primary-rgb),0.35), 0 1px 0 rgba(255,255,255,0.2) inset',
                        }}>
                        <span className="relative z-10 flex items-center gap-2.5">
                            Start building for free
                            <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </span>
                    </motion.button>

                    <p className="mt-6 text-sm text-muted-foreground">No credit card required. Free forever.</p>
                </div>
            </section>
        </div>
    );
}
