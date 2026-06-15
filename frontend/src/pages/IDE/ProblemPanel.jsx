import React, { useMemo, memo, useState, useEffect, Fragment } from 'react';
import {
    ThumbsUp, ThumbsDown, Lock, ChevronDown, Lightbulb, Code,
    BookOpen, Clock, HardDrive, Sparkles, Zap, BrainCircuit, Bug,
    Maximize2, Minimize2, ArrowLeft, Eye, Layers, Target, AlertTriangle,
    Link2, ListOrdered, Hash, Cpu, GraduationCap, Puzzle, ArrowRight, BarChart2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import TabBar from './TabBar';
import DiscussionSection from './DiscussionSection';
import { loadVizHtml, hasViz } from '../../visualizations/loader';

/* EXPLANATION PARSER — extracts every section from the raw text */
function parseExplanation(text) {
    if (!text) return null;
    const result = {
        prose: '', connectsTo: null, timeComplexity: null, spaceComplexity: null,
        mistakes: [], codePattern: null, algorithm: null,
        summaryTime: null, summarySpace: null,
    };

    const blocks = text.split(/\n\n/);
    let mainProse = blocks[0] || '';
    let algoBlock = '';
    let summaryBlock = '';

    for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i].trim();
        if (/^Step-by-step algorithm/i.test(b)) algoBlock = b;
        else if (/^Time:|^Space:/i.test(b)) summaryBlock = b;
        else mainProse += '\n\n' + b;
    }

    // Extract "connects to Lx" — multiple formats
    const connMatch = mainProse.match(/This\s+(?:\w+\s+)?connects?\s+to\s+(L\d)\s*([^.]*)\./i)
        || mainProse.match(/Connection to\s+(L\d)\s*:\s*([^.]*)\./i);
    if (connMatch) {
        result.connectsTo = { level: connMatch[1], reason: connMatch[2]?.trim() || '' };
        mainProse = mainProse.replace(connMatch[0], '');
    } else {
        const connAlt = mainProse.match(/Connection to\s+(?:higher level|level above)[:\s]*([^.]*)\./i);
        if (connAlt) {
            result.connectsTo = { level: null, reason: connAlt[1]?.trim() || '' };
            mainProse = mainProse.replace(connAlt[0], '');
        }
    }

    // Extract inline Time complexity — multiple formats
    const timeMatch = mainProse.match(/Time complexity\s*(?:is|of|:)\s*(O\([^)]+\))\s*[-–—]?\s*([^.]*)\./i)
        || mainProse.match(/(?:with|is|has)\s+(O\([^)]+\))\s+time(?:\s+complexity)?([^.]*)\./i);
    if (timeMatch) { result.timeComplexity = { value: timeMatch[1], note: timeMatch[2]?.trim()?.replace(/^[-–— ]+/, '') }; mainProse = mainProse.replace(timeMatch[0], ''); }

    // Extract inline Space complexity — multiple formats
    const spaceMatch = mainProse.match(/Space complexity\s*(?:is|of|:)\s*(O\([^)]+\))\s*[-–—]?\s*([^.]*)\./i)
        || mainProse.match(/(?:with|is|has|and)\s+(O\([^)]+\))\s+space(?:\s+complexity)?([^.]*)\./i);
    if (spaceMatch) { result.spaceComplexity = { value: spaceMatch[1], note: spaceMatch[2]?.trim()?.replace(/^[-–— ]+/, '') }; mainProse = mainProse.replace(spaceMatch[0], ''); }

    // Extract common mistakes
    const mistMatch = mainProse.match(/Common mistakes include:\s*(.*?)(?=\.\s*The real code|$)/is);
    if (mistMatch) {
        result.mistakes = mistMatch[1].split(/\d+\)/).filter(Boolean).map(s => s.replace(/,\s*$/, '').trim());
        mainProse = mainProse.replace(mistMatch[0], '');
    }

    // Extract code pattern
    const codeMatch = mainProse.match(/The real code pattern\s+(?:is|involves)\s+(.*?)\.(?:\s|$)/is);
    if (codeMatch) { result.codePattern = codeMatch[1].trim(); mainProse = mainProse.replace(codeMatch[0], ''); }

    result.prose = mainProse.replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();

    // Parse algorithm block
    if (algoBlock) {
        result.algorithm = algoBlock.split('\n').slice(1).filter(l => l.trim());
    }

    // Parse summary block
    if (summaryBlock) {
        const tM = summaryBlock.match(/Time:\s*(O\([^)]+\))\s*[-–]\s*(.*)/i);
        const sM = summaryBlock.match(/Space:\s*(O\([^)]+\))\s*[-–]\s*(.*)/i);
        if (tM) result.summaryTime = { value: tM[1], note: tM[2].trim() };
        if (sM) result.summarySpace = { value: sM[1], note: sM[2].trim() };
    }

    return result;
}

/* INLINE CODE HIGHLIGHTER — wraps technical terms in code style */
const InlineCode = ({ children }) => (
    <code style={{
        background: 'color-mix(in srgb, var(--color-primary-text) 6%, var(--color-surface))',
        padding: '1px 5px', borderRadius: 4, fontSize: '0.88em',
        fontFamily: "'JetBrains Mono', monospace",
        border: '1px solid color-mix(in srgb, var(--color-primary-text) 8%, transparent)',
        whiteSpace: 'nowrap',
    }}>{children}</code>
);

/** Highlight technical terms within a sentence */
const formatSentence = (text) => {
    if (!text) return text;
    // Split on patterns that should be code-styled, preserve them
    const parts = text.split(/(O\([^)]+\)|array\[\w+\]|\w+\[\w+\]|n[\-\+\*\/]\d+|n²|n\^2|log\s*n|True|False|None|null|is_max|max_val|candidate_index|candidate_value|temp|arr\[\w*\]|start|end|mid|left_max|right_max|i\s*[!=<>]+\s*j)/g);
    return parts.map((part, i) => {
        if (/^(O\(|array\[|\w+\[|n[\-\+\*\/]|n²|n\^2|log\s*n|True$|False$|None$|null$|is_max|max_val|candidate_|temp$|arr\[|start$|end$|mid$|left_max|right_max|i\s*[!=<>])/.test(part)) {
            return <InlineCode key={i}>{part}</InlineCode>;
        }
        return part;
    });
};

/* PROSE RENDERER — transforms wall of text into semantic sections */
const ProseRenderer = ({ text }) => {
    if (!text) return null;

    // Split into sentences (handle abbreviations like e.g., i.e.)
    const raw = text.replace(/([.!?])\s+/g, '$1|||').split('|||').filter(s => s.trim().length > 5);

    // Classify each sentence
    const classified = raw.map(sentence => {
        const s = sentence.trim();
        if (/^(The intuition|Intuitively)/i.test(s))
            return { type: 'intuition', text: s };
        if (/^(The key insight|The core insight)/i.test(s))
            return { type: 'insight', text: s };
        if (/^(This works because|This is possible because|This is because)/i.test(s))
            return { type: 'reason', text: s };
        if (/^(The algorithm |The technique |The method )/i.test(s))
            return { type: 'mechanism', text: s };
        if (/^(In the context|This is used|This connects|This feeds|This enables)/i.test(s))
            return { type: 'context', text: s };
        return { type: 'body', text: s };
    });

    // Group consecutive same-type sentences
    const groups = [];
    for (const item of classified) {
        const last = groups[groups.length - 1];
        if (last && last.type === item.type) {
            last.sentences.push(item.text);
        } else {
            groups.push({ type: item.type, sentences: [item.text] });
        }
    }

    // Merge small body groups with neighbors
    const merged = [];
    for (const g of groups) {
        if (g.type === 'body' && merged.length > 0 && merged[merged.length - 1].type === 'body') {
            merged[merged.length - 1].sentences.push(...g.sentences);
        } else {
            merged.push(g);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {merged.map((group, gi) => {
                const joinedText = group.sentences.join(' ');

                // Intuition callout
                if (group.type === 'intuition' || group.type === 'insight') {
                    return (
                        <div key={gi} style={{
                            borderRadius: 8, padding: '12px 14px',
                            background: 'color-mix(in srgb, #e0a050 5%, var(--color-surface))',
                            borderLeft: '3px solid #e0a050',
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                        }}>
                            <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>💡</span>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#e0a050', marginBottom: 4 }}>
                                    {group.type === 'insight' ? 'Key Insight' : 'Intuition'}
                                </div>
                                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-primary-text)', margin: 0 }}>
                                    {formatSentence(joinedText.replace(/^(The intuition is( simple)?:?\s*|Intuitively,?\s*|The key insight is:?\s*)/i, ''))}
                                </p>
                            </div>
                        </div>
                    );
                }

                // Mechanism callout
                if (group.type === 'mechanism') {
                    return (
                        <div key={gi} style={{
                            borderRadius: 8, padding: '12px 14px',
                            background: 'color-mix(in srgb, #98a0ed 5%, var(--color-surface))',
                            borderLeft: '3px solid #98a0ed',
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                        }}>
                            <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚙️</span>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#98a0ed', marginBottom: 4 }}>How It Works</div>
                                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-primary-text)', margin: 0 }}>
                                    {formatSentence(joinedText)}
                                </p>
                            </div>
                        </div>
                    );
                }

                // Reason callout
                if (group.type === 'reason') {
                    return (
                        <div key={gi} style={{
                            borderRadius: 8, padding: '12px 14px',
                            background: 'color-mix(in srgb, #41bd78 5%, var(--color-surface))',
                            borderLeft: '3px solid #41bd78',
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                        }}>
                            <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>✅</span>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#41bd78', marginBottom: 4 }}>Why This Works</div>
                                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-primary-text)', margin: 0 }}>
                                    {formatSentence(joinedText.replace(/^(This works because|This is possible because)\s*/i, ''))}
                                </p>
                            </div>
                        </div>
                    );
                }

                // Context (connection to bigger picture)
                if (group.type === 'context') {
                    return (
                        <p key={gi} style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--color-muted-text)', margin: 0, fontStyle: 'italic' }}>
                            {formatSentence(joinedText)}
                        </p>
                    );
                }

                // Default body text
                return (
                    <p key={gi} style={{ fontSize: 13.5, lineHeight: 1.8, color: 'var(--color-primary-text)', margin: 0 }}>
                        {formatSentence(joinedText)}
                    </p>
                );
            })}
        </div>
    );
};

/* EXPLANATION RENDERER — beautiful visual cards for each section */
const ExplanationView = ({ text }) => {
    // Support both formats: string (old/fallback) → parse with regex, object (new structured) → use directly
    const raw = (typeof text === 'string') ? parseExplanation(text) : text;
    if (!raw) return null;

    // Normalize field names: new JSON uses commonMistakes/summary, parser uses mistakes/summaryTime
    const s = {
        prose: raw.prose || null,
        connectsTo: raw.connectsTo || null,
        timeComplexity: raw.timeComplexity || null,
        spaceComplexity: raw.spaceComplexity || null,
        mistakes: raw.mistakes || raw.commonMistakes || [],
        codePattern: raw.codePattern || null,
        algorithm: raw.algorithm || [],
        summaryTime: raw.summaryTime || raw.summary?.time || null,
        summarySpace: raw.summarySpace || raw.summary?.space || null,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Smart Prose Renderer */}
            {s.prose && <ProseRenderer text={s.prose} />}

            {/* Connects To */}
            {s.connectsTo && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, background: 'color-mix(in srgb, #98a0ed 8%, transparent)', border: '1px solid color-mix(in srgb, #98a0ed 18%, transparent)', alignSelf: 'flex-start' }}>
                    <Link2 size={12} style={{ color: '#98a0ed' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#98a0ed' }}>Connects to {s.connectsTo.level}</span>
                    {s.connectsTo.reason && <span style={{ fontSize: 11, color: 'var(--color-muted-text)' }}>{s.connectsTo.reason}</span>}
                </div>
            )}

            {/* Complexity Badges */}
            {(s.timeComplexity || s.spaceComplexity) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {s.timeComplexity && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, background: 'color-mix(in srgb, #41bd78 8%, transparent)', border: '1px solid color-mix(in srgb, #41bd78 18%, transparent)' }}>
                            <Clock size={12} style={{ color: '#41bd78' }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#41bd78', fontFamily: 'monospace' }}>{s.timeComplexity.value}</span>
                            {s.timeComplexity.note && <span style={{ fontSize: 11, color: 'var(--color-muted-text)' }}>{s.timeComplexity.note}</span>}
                        </div>
                    )}
                    {s.spaceComplexity && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, background: 'color-mix(in srgb, #e0a050 8%, transparent)', border: '1px solid color-mix(in srgb, #e0a050 18%, transparent)' }}>
                            <HardDrive size={12} style={{ color: '#e0a050' }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#e0a050', fontFamily: 'monospace' }}>{s.spaceComplexity.value}</span>
                            {s.spaceComplexity.note && <span style={{ fontSize: 11, color: 'var(--color-muted-text)' }}>{s.spaceComplexity.note}</span>}
                        </div>
                    )}
                </div>
            )}

            {/* Common Mistakes */}
            {s.mistakes.length > 0 && (
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid color-mix(in srgb, #e06661 15%, transparent)' }}>
                    <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, #e06661 6%, transparent)', borderBottom: '1px solid color-mix(in srgb, #e06661 12%, transparent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={12} style={{ color: '#e06661' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#e06661' }}>Common Mistakes</span>
                    </div>
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {s.mistakes.map((m, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{ width: 18, height: 18, borderRadius: 5, background: 'color-mix(in srgb, #e06661 10%, transparent)', color: '#e06661', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                                <span style={{ fontSize: 13, color: 'var(--color-primary-text)', lineHeight: 1.55 }}>{m}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Code Pattern */}
            {s.codePattern && (
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                    <div style={{ padding: '8px 12px', background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Code size={12} style={{ color: 'var(--color-muted-text)' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted-text)' }}>Code Pattern</span>
                    </div>
                    <div style={{ padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-primary-text)' }}>{s.codePattern}</div>
                </div>
            )}

            {/* Step-by-Step Algorithm */}
            {s.algorithm && s.algorithm.length > 0 && (
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid color-mix(in srgb, #98a0ed 15%, transparent)' }}>
                    <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, #98a0ed 6%, transparent)', borderBottom: '1px solid color-mix(in srgb, #98a0ed 12%, transparent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ListOrdered size={12} style={{ color: '#98a0ed' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#98a0ed' }}>Step-by-Step Algorithm</span>
                    </div>
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {s.algorithm.map((line, i) => {
                            const indent = line.search(/\S/);
                            const numMatch = line.trim().match(/^(\d+)\./);
                            const isSubStep = indent >= 3;
                            return (
                                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', paddingLeft: Math.min(indent * 4, 32) }}>
                                    {numMatch && !isSubStep && (
                                        <span style={{ width: 18, height: 18, borderRadius: 5, background: 'color-mix(in srgb, #98a0ed 12%, transparent)', color: '#98a0ed', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{numMatch[1]}</span>
                                    )}
                                    {!numMatch && !isSubStep && <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-muted-text)', flexShrink: 0, marginTop: 7, opacity: 0.4 }} />}
                                    <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-primary-text)', fontFamily: /[={}()\[\]|><!]/.test(line) ? "'JetBrains Mono', monospace" : 'inherit' }}>
                                        {line.replace(/^\s*\d+\.\s*/, '').trim()}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Summary Complexity */}
            {(s.summaryTime || s.summarySpace) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {s.summaryTime && <div style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: 'monospace', background: 'color-mix(in srgb, #41bd78 8%, transparent)', color: '#41bd78', border: '1px solid color-mix(in srgb, #41bd78 18%, transparent)' }}>Time: {s.summaryTime.value} — {s.summaryTime.note}</div>}
                    {s.summarySpace && <div style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: 'monospace', background: 'color-mix(in srgb, #e0a050 8%, transparent)', color: '#e0a050', border: '1px solid color-mix(in srgb, #e0a050 18%, transparent)' }}>Space: {s.summarySpace.value} — {s.summarySpace.note}</div>}
                </div>
            )}
        </div>
    );
};

/* CONSTANTS */
const LADDER_META = [
    { label: 'Full Problem', icon: BookOpen, color: '#98a0ed' },
    { label: 'Key Sub-routine', icon: Puzzle, color: '#41bd78' },
    { label: 'Core Logic', icon: Lightbulb, color: '#e0a050' },
    { label: 'Building Block', icon: Cpu, color: '#b988d6' },
    { label: 'Basic Operation', icon: Hash, color: '#3fa9c9' },
    { label: 'Concept Foundation', icon: GraduationCap, color: '#9180e8' },
];

const getApproachColor = (name = '') => {
    const l = name.toLowerCase();
    if (l.includes('brute')) return '#e06661';
    if (l.includes('optimal') || l.includes('linear')) return '#41bd78';
    if (l.includes('dynamic') || l.includes('memo')) return '#9180e8';
    if (l.includes('divide')) return '#e0a050';
    return '#98a0ed';
};

const getApproachIcon = (name = '') => {
    const l = name.toLowerCase();
    if (l.includes('brute')) return <Bug size={13} />;
    if (l.includes('optimal') || l.includes('linear')) return <Zap size={13} />;
    if (l.includes('dynamic') || l.includes('memo')) return <BrainCircuit size={13} />;
    if (l.includes('divide')) return <Layers size={13} />;
    return <Lightbulb size={13} />;
};

const getDifficultyColor = (d) => ({ Easy: '#41bd78', Medium: '#e0a050', Hard: '#e06661' }[d] || 'var(--color-muted-text)');

/* VIZ FRAME — loads a self-contained animation bundled into the JS build.
 * Content is fetched via Vite's glob loader (NOT via a URL), then rendered
 * with srcdoc so it bypasses all server-side routing. */
const VizFrame = memo(({ topicKey, vizFile, exampleIndex }) => {
    const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
    const [html, setHtml] = useState(null);
    const [expanded, setExpanded] = useState(false);

    // Close the maximized view with Escape, and lock body scroll while open.
    useEffect(() => {
        if (!expanded) return;
        const onKey = (e) => { if (e.key === 'Escape') setExpanded(false); };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [expanded]);

    useEffect(() => {
        let cancelled = false;
        setStatus('loading');
        loadVizHtml(topicKey, vizFile).then(content => {
            if (cancelled) return;
            if (content && typeof content === 'string' && content.length > 0) {
                // Lock this frame to a single example.
                //  1. Shim URLSearchParams so .htm files that read ?example get the right index.
                //  2. After the .htm's own init runs, click the matching example button so the
                //     frame shows ONLY that example (the .htm files default to example 1 and
                //     otherwise only switch via their in-iframe buttons).
                //  3. Hide ONLY the preset Example switch buttons — keep the custom Load input
                //     so users can type their own input and test it. The React side owns which
                //     example each frame shows, so the preset switchers are redundant.
                //  4. Inject a global polish stylesheet (same palette, just prettier):
                //     floating cards, smooth transitions, glow on active cells, subtle bg depth.
                //     Targets the shared class conventions used across the viz files.
                const shim = `<style>
button[onclick*="loadExample"]{display:none!important}
/* Floating cards — lift panels off the pure-black background */
.info-cell,.info-panel,.log-panel,.action-panel,.result-display,.status-bar,.visual-container,.panel,.stack-container,.tiles-wrapper,.array-section,.string-display,.tree-container,.list-wrapper,.graph-area,.stack-area{
  border:1px solid rgba(255,255,255,0.07)!important;
  box-shadow:0 2px 10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.045)!important;
}
/* Smooth transitions — algorithm steps glide instead of snapping */
.info-cell,.dot,.result-display,[class*="tile"],[class*="cell"],[class*="node"],[class*="bar"]{
  transition:background-color .25s ease, box-shadow .25s ease, transform .2s ease, color .25s ease, border-color .25s ease!important;
}
/* Glow on the active/highlighted element */
.active,.highlight,.current,.visited,.found,.match,.pivot,.selected,.comparing,.processing{
  box-shadow:0 0 14px rgba(255,255,255,0.22)!important;
  filter:brightness(1.08);
  transform:scale(1.03);
}
/* Subtle background depth — still reads as pure black */
body{background:radial-gradient(115% 85% at 50% 0%, #0c0c0e 0%, #000 55%) fixed!important;}
<\/style><script>(function(){
var EX=${exampleIndex};
var p=new URLSearchParams();p.set('example',String(EX));
var orig=URLSearchParams;
window.URLSearchParams=function(s){return (s===undefined||s===window.location.search)?p:new orig(s);};
function pickExample(){
  var btns=[].slice.call(document.querySelectorAll('button')).filter(function(b){return (b.getAttribute('onclick')||'').indexOf('loadExample')!==-1;});
  var b=btns[EX]||btns[btns.length-1];
  if(b){b.click();}
}
window.addEventListener('load',function(){setTimeout(pickExample,0);});
})();<\/script>`;
                const patched = content.replace(/<head>/i, `<head>${shim}`);
                setHtml(patched);
                setStatus('ok');
            } else {
                setStatus('error');
            }
        }).catch(() => {
            if (!cancelled) setStatus('error');
        });
        return () => { cancelled = true; };
    }, [topicKey, vizFile, exampleIndex]);

    const frameHeight = expanded ? '100%' : 580;

    return (
        <div style={expanded ? {
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: '#000000',
            display: 'flex',
            flexDirection: 'column',
        } : {
            marginTop: 8,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
            background: '#000000',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            position: 'relative',
        }}>
            <div style={{
                padding: '8px 12px',
                background: 'color-mix(in srgb, #98a0ed 8%, var(--color-surface))',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChart2 size={12} style={{ color: '#98a0ed' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#98a0ed' }}>
                        Visualization · Example {exampleIndex + 1}
                    </span>
                </div>
                <button
                    onClick={() => setExpanded(v => !v)}
                    title={expanded ? 'Exit fullscreen (Esc)' : 'Maximize'}
                    aria-label={expanded ? 'Exit fullscreen' : 'Maximize'}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'var(--color-surface-hover)',
                        color: '#98a0ed',
                        border: '1px solid color-mix(in srgb, #98a0ed 30%, transparent)',
                        padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', outline: 'none',
                    }}
                >
                    {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    {expanded ? 'Exit' : 'Max'}
                </button>
            </div>

            {/* Loading overlay */}
            {status === 'loading' && (
                <div style={{ height: frameHeight, flex: expanded ? 1 : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: 12, gap: 8 }}>
                    <div style={{ width: 14, height: 14, border: '2px solid #30363d', borderTopColor: '#98a0ed', borderRadius: '50%', animation: 'pp-spin 0.8s linear infinite' }} />
                    Loading visualization…
                </div>
            )}

            {/* Error state — no bundled file found */}
            {status === 'error' && (
                <div style={{ height: frameHeight, flex: expanded ? 1 : 'none', padding: 14, fontSize: 12, color: '#e06661', background: 'rgba(224,102,97,0.06)', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700 }}>✗ No visualization available</div>
                    <div style={{ color: '#8b949e' }}>
                        Missing: <code style={{ fontFamily: 'monospace' }}>{topicKey}/{vizFile}</code>
                    </div>
                </div>
            )}

            {status === 'ok' && html && (
                <iframe
                    srcDoc={html}
                    style={{
                        width: '100%',
                        minWidth: 0,
                        height: frameHeight,
                        flex: expanded ? 1 : 'none',
                        border: 'none',
                        background: '#000000',
                        display: 'block',
                    }}
                    title={`Visualization Example ${exampleIndex + 1}`}
                    sandbox="allow-scripts"
                />
            )}
        </div>
    );
});
VizFrame.displayName = 'VizFrame';

/* PROBLEM PANEL */
const ProblemPanel = memo(({ problem, onBack, onActiveLadderChange, solvedLadders = {} }) => {
    const [activeTab, setActiveTab] = useState('description');
    const [selectedApproach, setSelectedApproach] = useState(0);
    const [unlockedLevels, setUnlockedLevels] = useState({});
    const [activeLadder, setActiveLadder] = useState(0);
    const [vote, setVote] = useState(null);
    const [readerMode, setReaderMode] = useState(null);
    const [vizOpen, setVizOpen] = useState({}); // { [exampleIndex]: boolean }

    const tabs = [
        { id: 'description', label: 'Description' },
        { id: 'approaches', label: 'Approaches' },
        { id: 'discussions', label: 'Discussions' },
    ];

    const approaches = useMemo(() => problem?.approaches || [], [problem]);

    useEffect(() => {
        if (approaches.length > 0) {
            const init = {};
            approaches.forEach(a => { init[a.id] = 1; });
            setUnlockedLevels(init);
            setActiveLadder(0);
            setSelectedApproach(0);
            setReaderMode(null);
        }
    }, [approaches]);

    const approach = approaches[selectedApproach];
    const ladders = approach?.ladders || [];
    const current = unlockedLevels[approach?.id] || 1;
    const lad = ladders[activeLadder] || null;
    const meta = lad ? (LADDER_META[lad.level] || LADDER_META[0]) : LADDER_META[0];
    const LIcon = meta.icon;

    // Emit active ladder data to parent (IDE.jsx) including approach context
    useEffect(() => {
        if (onActiveLadderChange && lad && activeTab === 'approaches') {
            onActiveLadderChange({ ladder: lad, approachId: approach?.id, ladderIndex: activeLadder });
        } else if (onActiveLadderChange && activeTab === 'description') {
            onActiveLadderChange(null);
        }
    }, [activeLadder, selectedApproach, activeTab, lad]);

    const unlockNext = () => {
        if (current < ladders.length) {
            setUnlockedLevels(prev => ({ ...prev, [approach.id]: current + 1 }));
        }
    };

    const selectLadder = (i) => {
        if ((i + 1) <= current) setActiveLadder(i);
    };

    const handleVote = (type) => setVote(prev => prev === type ? null : type);

    const dc = getDifficultyColor(problem?.difficulty);

    const fullDescription = useMemo(() => {
        if (!problem) return '';
        return `${problem.description || ''}\n\n### Judge Input Format\n\n> Each test case field is passed as **one JSON-serialized line** on stdin.\n> Your code must read from **stdin** and print the answer to **stdout**.\n> Click **Submit** to run against all test cases. Click **Run** to test with custom input.\n`;
    }, [problem]);

    const formatHint = (text) => {
        if (!text) return text;
        if (text.includes('\n')) return text;
        return text.replace(/(\s)(Step \d+:)/g, '\n$2').replace(/(\s)(Result:)/g, '\n\n$2').replace(/(\s)(Compare )/g, '\n  $2').trim();
    };

    const vizFile = problem._vizFile;
    const topicKey = problem._topicKey;
    const hasVisualization = hasViz(topicKey, vizFile);

    const renderVisualization = (exampleIndex) => {
        if (!hasVisualization) return null;
        return (
            <VizFrame
                topicKey={topicKey}
                vizFile={vizFile}
                exampleIndex={exampleIndex}
                key={`${topicKey}/${vizFile}#${exampleIndex}`}
            />
        );
    };

    if (!problem) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted-text)', fontSize: 14 }}>Select a problem to begin</div>;
    }

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <style>{`
                .pp-scroll::-webkit-scrollbar{width:6px} .pp-scroll::-webkit-scrollbar-track{background:transparent}
                .pp-scroll::-webkit-scrollbar-thumb{background-color:var(--color-border);border-radius:6px;border:1px solid transparent;background-clip:padding-box}
                .pp-scroll::-webkit-scrollbar-thumb:hover{background-color:var(--color-muted-text)}
                @keyframes pp-pulse{0%{transform:scale(.85);box-shadow:0 0 0 0 rgba(65,189,120,.4)}70%{transform:scale(1);box-shadow:0 0 0 5px rgba(65,189,120,0)}100%{transform:scale(.85);box-shadow:0 0 0 0 rgba(65,189,120,0)}}
                @keyframes pp-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
                @keyframes pp-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
                .pp-float{animation:pp-up .3s ease-out forwards}
                details>summary{list-style:none} details>summary::-webkit-details-marker{display:none}
            `}</style>

            {/* Tabs */}
            {!readerMode && <TabBar activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); setReaderMode(null); }} tabs={tabs} />}

            {/* Sticky Header */}
            {!readerMode && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary-text)', margin: 0, lineHeight: 1.35 }}>{problem.title}</h1>
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                            {[{ type: 'up', icon: ThumbsUp, color: '#41bd78', count: problem.likes || 0 }, { type: 'down', icon: ThumbsDown, color: '#e06661', count: problem.dislikes || 0 }].map(({ type, icon: Icon, color, count }) => {
                                const isActive = vote === type;
                                return (
                                    <button key={type} onClick={() => handleVote(type)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: isActive ? `color-mix(in srgb, ${color} 14%, transparent)` : 'var(--color-surface-hover)', color: isActive ? color : 'var(--color-muted-text)', border: `1px solid ${isActive ? `color-mix(in srgb, ${color} 30%, transparent)` : 'var(--color-border)'}`, padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
                                        <Icon size={12} fill={isActive ? 'currentColor' : 'none'} />{count + (isActive ? 1 : 0)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, color: dc, background: `color-mix(in srgb, ${dc} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${dc} 22%, transparent)`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{problem.difficulty}</span>
                        {problem.tags?.map(tag => <span key={tag} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'var(--color-surface-hover)', color: 'var(--color-muted-text)', border: '1px solid var(--color-border)' }}>{tag}</span>)}
                    </div>
                </div>
            )}

            {/* SCROLLABLE CONTENT */}
            <div className="pp-scroll" style={{ flex: 1, overflowY: 'auto', scrollBehavior: 'smooth' }}>

                {/* DESCRIPTION TAB */}
                {activeTab === 'description' && !readerMode && (
                    <div style={{ padding: '24px 26px' }}>
                        <div style={{ color: 'var(--color-primary-text)', fontSize: 14.5, lineHeight: 1.8 }}>
                            <ReactMarkdown components={{
                                code({ inline, className, children, ...props }) {
                                    return <code style={{ background: 'var(--color-surface-hover)', padding: '2px 6px', borderRadius: 5, fontSize: '0.88em', fontFamily: "'JetBrains Mono', monospace", border: '1px solid var(--color-border)' }} {...props}>{children}</code>;
                                }
                            }}>{fullDescription}</ReactMarkdown>
                        </div>

                        {/* Examples */}
                        {problem.examples?.length > 0 && (
                            <div style={{ marginTop: 32 }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <span style={{ width: 3, height: 16, borderRadius: 1, background: '#98a0ed' }} /> Examples
                                </h3>
                                {problem.examples.map((ex, i) => (
                                    <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                                        <div style={{ padding: '8px 14px', background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, color: 'var(--color-muted-text)' }}>Example {i + 1}</div>
                                        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted-text)', width: 50, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Input</span>
                                                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, flex: 1, background: 'color-mix(in srgb, var(--color-primary-text) 3%, var(--color-surface))', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)' }}>{ex.input}</code>
                                            </div>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted-text)', width: 50, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Output</span>
                                                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#41bd78', flex: 1, background: 'color-mix(in srgb, #41bd78 5%, var(--color-surface))', padding: '5px 10px', borderRadius: 6, border: '1px solid color-mix(in srgb, #41bd78 15%, transparent)' }}>{ex.output}</code>
                                            </div>
                                            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 2 }}>
                                                {ex.explanation && (
                                                    <details>
                                                        <summary style={{ fontSize: 11, fontWeight: 600, color: '#98a0ed', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Eye size={12} /> Show trace</summary>
                                                        <pre style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, background: 'var(--color-surface-hover)', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', monospace", border: '1px solid var(--color-border)', maxHeight: 240, overflow: 'auto' }}>{formatHint(ex.explanation)}</pre>
                                                    </details>
                                                )}
                                                {i < 2 && hasVisualization && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setVizOpen(prev => ({ ...prev, [i]: !prev[i] }))}
                                                        style={{
                                                            fontSize: 11, fontWeight: 600, color: '#98a0ed',
                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                            background: 'transparent', border: 'none', padding: 0,
                                                            fontFamily: 'inherit',
                                                        }}
                                                    >
                                                        <BarChart2 size={12} /> {vizOpen[i] ? 'Hide visualization' : 'Visualization'}
                                                    </button>
                                                )}
                                            </div>
                                            {vizOpen[i] && hasVisualization && renderVisualization(i)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Constraints */}
                        {problem.constraints?.length > 0 && (
                            <div style={{ marginTop: 28, paddingBottom: 24 }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <span style={{ width: 3, height: 16, borderRadius: 1, background: '#e0a050' }} /> Constraints
                                </h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                    {problem.constraints.map((c, i) => (
                                        <div key={i} style={{ padding: '5px 12px', borderRadius: 7, background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-primary-text)' }}>{c}</div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* APPROACHES TAB */}
                {activeTab === 'approaches' && !readerMode && approaches.length > 0 && (
                    <div>
                        {/* Approach Selector */}
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {approaches.map((a, i) => {
                                    const isA = selectedApproach === i;
                                    const c = getApproachColor(a.name);
                                    return (
                                        <button key={a.id} onClick={() => { setSelectedApproach(i); setActiveLadder(0); }}
                                            style={{ flex: '0 0 auto', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s', background: isA ? `color-mix(in srgb, ${c} 10%, var(--color-surface))` : 'var(--color-surface-hover)', color: isA ? c : 'var(--color-muted-text)', border: isA ? `1.5px solid color-mix(in srgb, ${c} 35%, transparent)` : '1px solid var(--color-border)', boxShadow: isA ? `0 2px 10px color-mix(in srgb, ${c} 12%, transparent)` : 'none' }}>
                                            {getApproachIcon(a.name)} {a.name.replace(/^Approach\s*\d+\s*:\s*/i, '').replace(/\s*O\([^)]+\)\s*$/, '')}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Complexity Cards */}
                        {approach && (
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 10 }}>
                                {[{ l: 'Time', v: approach.timeComplexity, c: '#41bd78', I: Clock }, { l: 'Space', v: approach.spaceComplexity, c: '#e0a050', I: HardDrive }].map(({ l, v, c, I }) => (
                                    <div key={l} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: `color-mix(in srgb, ${c} 5%, var(--color-surface))`, border: `1px solid color-mix(in srgb, ${c} 15%, transparent)`, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${c}14`, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I size={14} /></div>
                                        <div><div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'var(--color-muted-text)' }}>{l}</div><div style={{ color: c, fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>{v}</div></div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Summary */}
                        {approach?.summary && <div style={{ padding: '12px 18px', fontSize: 13, lineHeight: 1.65, borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted-text)' }}>{approach.summary}</div>}

                        {/* LADDER PROGRESS: L0 → L5 */}
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted-text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
                                Ladder Progress · <span style={{ color: '#41bd78' }}>{current}</span>/{ladders.length}
                                {(() => {
                                    const solvedSet = solvedLadders[approach?.id] || {};
                                    const solvedCount = Object.keys(solvedSet).filter(k => solvedSet[k]).length;
                                    return solvedCount > 0 ? (
                                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'color-mix(in srgb, #e0a050 12%, transparent)', color: '#e0a050', border: '1px solid color-mix(in srgb, #e0a050 20%, transparent)' }}>
                                            {solvedCount} solved
                                        </span>
                                    ) : null;
                                })()}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {ladders.map((l, i) => {
                                    const u = (i + 1) <= current;
                                    const isNext = (i + 1) === current + 1;
                                    const isActive = activeLadder === i;
                                    const isSolved = !!(solvedLadders[approach?.id] || {})[i];
                                    const m = LADDER_META[l.level] || LADDER_META[0];

                                    // 3 states: solved (gold) > unlocked (green) > locked (gray)
                                    const dotBg = isSolved ? '#e0a050' : u ? (isActive ? m.color : '#41bd78') : 'var(--color-surface-hover)';
                                    const dotColor = (isSolved || u) ? '#fff' : 'var(--color-muted-text)';
                                    const dotBorder = isActive && !isSolved ? `2px solid ${m.color}` : isSolved ? '2px solid #e0a050' : u ? 'none' : '1px solid var(--color-border)';
                                    const dotShadow = isSolved
                                        ? (isActive ? '0 0 0 3px rgba(224,160,80,0.2), 0 0 10px rgba(224,160,80,0.25)' : '0 0 8px rgba(224,160,80,0.2)')
                                        : isActive ? `0 0 0 3px color-mix(in srgb, ${m.color} 22%, transparent)` : u ? '0 0 8px rgba(65,189,120,.15)' : 'none';
                                    const lineBg = isSolved ? '#e0a050' : u ? '#41bd78' : 'var(--color-border)';

                                    return (
                                        <Fragment key={i}>
                                            <div
                                                onClick={() => selectLadder(i)}
                                                title={`L${l.level}: ${m.label}${isSolved ? ' ✓ Solved' : ''}`}
                                                style={{
                                                    width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 10, fontWeight: 800, cursor: u ? 'pointer' : 'default', transition: 'all .25s', position: 'relative', flexShrink: 0,
                                                    background: dotBg, color: dotColor, border: dotBorder, boxShadow: dotShadow,
                                                }}
                                            >
                                                {isNext && <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid #41bd78', animation: 'pp-pulse 2s infinite' }} />}
                                                <span style={{ zIndex: 1 }}>{isSolved ? '✓' : u ? `L${l.level}` : <Lock size={10} />}</span>
                                            </div>
                                            {i < ladders.length - 1 && <div style={{ flex: 1, height: 2, borderRadius: 1, background: lineBg, transition: 'background .3s' }} />}
                                        </Fragment>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ACTIVE LADDER CONTENT */}
                        {lad && (activeLadder + 1) <= current && (() => {
                            const isThisSolved = !!(solvedLadders[approach?.id] || {})[activeLadder];
                            return (
                                <div className="pp-float" key={`${approach?.id}-${activeLadder}`} style={{ padding: 16 }}>

                                    {/* Ladder Header Card */}
                                    <div style={{ borderRadius: 9, border: `1px solid ${isThisSolved ? 'color-mix(in srgb, #e0a050 30%, transparent)' : `color-mix(in srgb, ${meta.color} 22%, transparent)`}`, overflow: 'hidden', marginBottom: 16 }}>
                                        {/* Solved gold bar */}
                                        {isThisSolved && <div style={{ height: 3, background: 'linear-gradient(90deg, #e0a050, #eab308)' }} />}
                                        <div style={{ padding: '11px 14px', background: isThisSolved ? 'color-mix(in srgb, #e0a050 5%, transparent)' : `color-mix(in srgb, ${meta.color} 5%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{
                                                    width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, fontWeight: 800,
                                                    background: isThisSolved ? 'color-mix(in srgb, #e0a050 14%, transparent)' : `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                                                    color: isThisSolved ? '#e0a050' : meta.color,
                                                    border: `1px solid ${isThisSolved ? 'color-mix(in srgb, #e0a050 22%, transparent)' : `color-mix(in srgb, ${meta.color} 22%, transparent)`}`,
                                                }}>
                                                    {isThisSolved ? '✓' : `L${lad.level}`}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        {lad.title}
                                                        {isThisSolved && (
                                                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'color-mix(in srgb, #e0a050 12%, transparent)', color: '#e0a050', border: '1px solid color-mix(in srgb, #e0a050 22%, transparent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Solved</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: isThisSolved ? '#e0a050' : meta.color, fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <LIcon size={10} />{meta.label}
                                                        {lad.testCases && <span style={{ color: 'var(--color-muted-text)', fontWeight: 400 }}>· {lad.testCases.length} test cases</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={() => setReaderMode({ lad, i: activeLadder })} style={{ width: 26, height: 26, borderRadius: 6, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-muted-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', outline: 'none' }} title="Focus Mode"><Maximize2 size={12} /></button>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    {lad.desc && <p style={{ fontSize: 13, color: 'var(--color-muted-text)', lineHeight: 1.65, margin: '0 0 16px' }}>{lad.desc}</p>}

                                    {/* Examples */}
                                    {lad.examples && lad.examples.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted-text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <span style={{ width: 3, height: 12, borderRadius: 1, background: meta.color }} /> Examples
                                            </div>
                                            {lad.examples.map((ex, ei) => {
                                                return (
                                                    <div key={ei} style={{ borderRadius: 14, border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 8 }}>
                                                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                            <div style={{ display: 'flex', gap: 8 }}>
                                                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted-text)', width: 44, textTransform: 'uppercase', flexShrink: 0 }}>Input</span>
                                                                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flex: 1, wordBreak: 'break-word', color: 'var(--color-primary-text)' }}>{ex.input}</code>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 8 }}>
                                                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted-text)', width: 44, textTransform: 'uppercase', flexShrink: 0 }}>Output</span>
                                                                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#41bd78', flex: 1 }}>{ex.output}</code>
                                                            </div>
                                                            {ex.trace && (
                                                                <details>
                                                                    <summary style={{ fontSize: 11, fontWeight: 600, color: meta.color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Eye size={11} /> Trace</summary>
                                                                    <pre style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, background: 'var(--color-surface-hover)', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', monospace", border: '1px solid var(--color-border)', maxHeight: 180, overflow: 'auto' }}>{ex.trace}</pre>
                                                                </details>
                                                            )}

                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* FULL EXPLANATION — parsed into sections */}
                                    {lad.explanation && <ExplanationView text={lad.explanation} />}

                                    {/* Test Cases indicator */}
                                    {lad.testCases && lad.testCases.length > 0 && (
                                        <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 7, background: `color-mix(in srgb, ${meta.color} 5%, transparent)`, border: `1px solid color-mix(in srgb, ${meta.color} 14%, transparent)`, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                            <Target size={11} style={{ color: meta.color }} />
                                            <span style={{ fontWeight: 600, color: meta.color }}>{lad.testCases.length} test cases</span>
                                            <ArrowRight size={10} style={{ color: 'var(--color-muted-text)' }} />
                                            <span style={{ color: 'var(--color-muted-text)' }}>in testcase panel</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Unlock button */}
                        {current < ladders.length && (
                            <div style={{ padding: '0 16px 16px' }}>
                                <button onClick={unlockNext} style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #41bd78, #059669)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: '0 3px 12px rgba(65,189,120,.25)' }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 5px 16px rgba(65,189,120,.35)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(65,189,120,.25)'; }}
                                >
                                    <Sparkles size={15} /> Unlock L{ladders[current]?.level}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* DISCUSSIONS TAB */}
                {activeTab === 'discussions' && (
                    <DiscussionSection problem={problem} />
                )}

                {/* READER MODE */}
                {readerMode && (
                    <div className="pp-float">
                        <div style={{ position: 'sticky', top: 0, zIndex: 10, padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)', backdropFilter: 'blur(12px)' }}>
                            <button onClick={() => setReaderMode(null)} style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-primary-text)' }}><ArrowLeft size={14} /></button>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{approach?.name} · L{readerMode.lad.level}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary-text)' }}>{readerMode.lad.title}</div>
                            </div>
                        </div>
                        <div style={{ padding: '24px 28px' }}>
                            {readerMode.lad.desc && <p style={{ fontSize: 14, color: 'var(--color-muted-text)', lineHeight: 1.8, marginBottom: 20 }}>{readerMode.lad.desc}</p>}
                            {readerMode.lad.examples?.map((ex, i) => (
                                <div key={i} style={{ marginBottom: 14, borderRadius: 14, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                                    <div style={{ padding: '7px 14px', background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)', fontSize: 11, fontWeight: 600, color: 'var(--color-muted-text)' }}>Example {i + 1}</div>
                                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div><strong style={{ fontSize: 10, color: 'var(--color-muted-text)', textTransform: 'uppercase' }}>Input: </strong><code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{ex.input}</code></div>
                                        <div><strong style={{ fontSize: 10, color: 'var(--color-muted-text)', textTransform: 'uppercase' }}>Output: </strong><code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#41bd78' }}>{ex.output}</code></div>
                                        {ex.trace && <pre style={{ marginTop: 6, fontSize: 11, background: 'var(--color-surface-hover)', padding: '8px 10px', borderRadius: 6, whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6, border: '1px solid var(--color-border)' }}>{ex.trace}</pre>}
                                    </div>
                                </div>
                            ))}
                            {readerMode.lad.explanation && <ExplanationView text={readerMode.lad.explanation} />}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

ProblemPanel.displayName = 'ProblemPanel';
export default ProblemPanel;
