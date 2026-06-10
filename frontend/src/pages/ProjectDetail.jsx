import React, { useState, useEffect } from 'react';
import {
    X, Eye, Heart, Clock, Github, ExternalLink, Download,
    Target, FlaskConical, Database, GraduationCap, BarChart2,
    CheckCircle, FileText, ChevronRight, ArrowUpRight, Code2,
    BookOpen, Layers, Star, ArrowLeft, Cpu, MessageSquare, Trophy,
    Copy, Check, Terminal
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ProjectComments from '../components/ProjectComments';
import ProjectLeaderboard from '../components/ProjectLeaderboard';

function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

const CATEGORY_ACCENTS = {
    'NLP':                  'from-cyan-500 to-indigo-500',
    'Graph Neural Networks':'from-emerald-500 to-teal-400',
    'Deep Learning':        'from-violet-500 to-purple-400',
    'Computer Vision':      'from-blue-500 to-cyan-400',
    'Document AI':          'from-orange-500 to-amber-400',
};
function getCategoryAccent(cat) {
    return CATEGORY_ACCENTS[cat] || 'from-indigo-500 to-cyan-500';
}

const TABS = [
    { id: 'overview',     label: 'Overview',     icon: BookOpen },
    { id: 'methodology',  label: 'Methodology',  icon: FlaskConical },
    { id: 'data',         label: 'Data',         icon: Database },
    { id: 'evaluation',   label: 'Evaluation',   icon: BarChart2 },
    { id: 'papers',       label: 'Papers',       icon: GraduationCap },
    { id: 'discussion',   label: 'Discussion',   icon: MessageSquare },
    { id: 'leaderboard',  label: 'Leaderboard',  icon: Trophy },
];

/* ─── Section heading ─────────────────────────────────── */
function SectionHeading({ icon: Icon, children, color = 'text-indigo-400' }) {
    return (
        <div className={`flex items-center gap-2 mb-4 text-[0.7rem] font-extrabold uppercase tracking-widest ${color}`}>
            <Icon size={13} />{children}
        </div>
    );
}

/* ─── Sidebar stat pill ───────────────────────────────── */
function StatPill({ icon: Icon, value, label, color }) {
    return (
        <div className="flex flex-col items-center gap-0.5 py-3 flex-1">
            <Icon size={16} className={color} />
            <span className="text-sm font-black text-[#e4e1ea]">{value}</span>
            <span className="text-[0.6rem] uppercase tracking-wider text-white/40">{label}</span>
        </div>
    );
}

/* ─── Tag pill ────────────────────────────────────────── */
const TAG_COLORS = {
    'NLP':           { bg:'rgba(63,169,201,0.12)',  text:'#5fc4dd', border:'rgba(63,169,201,0.3)' },
    'Deep Learning': { bg:'rgba(145,128,232,0.12)', text:'#ab9df0', border:'rgba(145,128,232,0.3)' },
    'Computer Vision':{ bg:'rgba(93,142,222,0.12)',text:'#60a5fa', border:'rgba(93,142,222,0.3)' },
    'GNN':           { bg:'rgba(65,189,120,0.12)', text:'#34d399', border:'rgba(65,189,120,0.3)' },
    'BERT':          { bg:'rgba(102,114,224,0.12)', text:'#98a0ed', border:'rgba(102,114,224,0.3)' },
    'LSTM':          { bg:'rgba(236,72,153,0.12)', text:'#dd9ec4', border:'rgba(236,72,153,0.3)' },
    'Document AI':   { bg:'rgba(249,115,22,0.12)', text:'#e09a5e', border:'rgba(249,115,22,0.3)' },
    'LayoutLM':      { bg:'rgba(234,179,8,0.12)',  text:'#fbbf24', border:'rgba(234,179,8,0.3)' },
    'Bioinformatics':{ bg:'rgba(65,189,120,0.12)',  text:'#4ade80', border:'rgba(65,189,120,0.3)' },
    'EdTech':        { bg:'rgba(251,191,36,0.12)', text:'#fcd34d', border:'rgba(251,191,36,0.3)' },
    'Advanced':      { bg:'rgba(224,102,97,0.12)',  text:'#f87171', border:'rgba(224,102,97,0.3)' },
};
function Tag({ tag }) {
    const s = TAG_COLORS[tag] || { bg:'rgba(161,161,170,0.12)', text:'#a1a1aa', border:'rgba(161,161,170,0.3)' };
    return (
        <span style={{ background:s.bg, color:s.text, border:`1px solid ${s.border}` }}
            className="px-2.5 py-0.5 rounded-full text-[0.68rem] font-semibold whitespace-nowrap">
            {tag}
        </span>
    );
}

/* ─── Overview Tab ────────────────────────────────────── */
function OverviewTab({ project, isDark }) {
    return (
        <div className="space-y-6">
            {/* Long description */}
            <div className="rounded-2xl p-6 bg-muted">
                <SectionHeading icon={BookOpen}>About This Project</SectionHeading>
                <p className="text-[0.9rem] leading-[1.85] text-muted-foreground">
                    {project.longDescription}
                </p>
            </div>

            {/* Research Question */}
            {project.question && (
                <div className="rounded-2xl p-6 border-l-4 border-primary bg-primary/[0.07] border border-primary/20">
                    <SectionHeading icon={Target}>Research Question</SectionHeading>
                    <p className="text-[0.88rem] leading-[1.8] italic font-medium text-primary">
                        {project.question}
                    </p>
                </div>
            )}
        </div>
    );
}

/* ─── Methodology Tab ─────────────────────────────────── */
function MethodologyTab({ project, isDark }) {
    return (
        <div className="space-y-4">
            {(project.methodology || []).map((step, i) => (
                <div key={i} className="flex gap-4 p-5 rounded-2xl bg-muted">
                    <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-[0.7rem] font-black text-white bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 mt-0.5">
                        {i + 1}
                    </div>
                    <div>
                        <p className="text-[0.88rem] leading-[1.75] text-muted-foreground">{step}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ─── Copy-to-clipboard hook ──────────────────────────── */
function useCopy(timeout = 1500) {
    const [copied, setCopied] = useState(null);
    const copy = (text, key) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), timeout);
        });
    };
    return { copied, copy };
}

function cliCommand(ds) {
    if (ds.source === 'HuggingFace') return `huggingface-cli download ${ds.name}`;
    if (ds.source === 'Kaggle')      return `kaggle datasets download -d ${ds.name}`;
    return null;
}

/* ─── Data Tab ────────────────────────────────────────── */
function DataTab({ project, isDark }) {
    const { copied, copy } = useCopy();
    return (
        <div className="space-y-6">
            {/* Datasets */}
            {project.datasets && (
                <div>
                    <SectionHeading icon={Database} color="text-cyan-400">Datasets Available</SectionHeading>
                    <div className="space-y-3">
                        {project.datasets.map((ds, i) => {
                            const cmd = cliCommand(ds);
                            return (
                                <div key={i} className="p-4 rounded-xl border bg-muted border-border transition-all">
                                    {/* Row 1: icon + name + source badge */}
                                    <div className="flex items-start gap-3 mb-3">
                                        <Database size={15} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-[0.83rem] font-bold text-foreground">{ds.name}</span>
                                                <span className="text-[0.62rem] font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">{ds.source}</span>
                                            </div>
                                            <p className="text-[0.78rem] leading-relaxed text-muted-foreground">{ds.desc}</p>
                                        </div>
                                    </div>

                                    {/* Row 2: CLI command + action buttons */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {cmd && (
                                            <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-1.5 rounded-lg font-mono text-[0.72rem] border bg-muted border-border text-muted-foreground">
                                                <Terminal size={11} className="flex-shrink-0" />
                                                <span className="truncate">{cmd}</span>
                                                <button
                                                    onClick={() => copy(cmd, `cli-${i}`)}
                                                    className={`flex-shrink-0 ml-auto transition-colors ${copied === `cli-${i}` ? 'text-emerald-400' : 'text-muted-foreground/70 hover:text-muted-foreground'}`}
                                                    title="Copy command">
                                                    {copied === `cli-${i}` ? <Check size={12} /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                        )}
                                        {ds.url !== '#' && (
                                            <a href={ds.url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors no-underline whitespace-nowrap">
                                                <ArrowUpRight size={13} /> Open Dataset
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Data Explanation */}
            {project.dataExplanation && (
                <div className="rounded-2xl p-5 border-l-4 border-amber-400 bg-amber-400/[0.06] border border-amber-400/20">
                    <SectionHeading icon={FileText} color="text-amber-400">Understanding the Data</SectionHeading>
                    <p className="text-[0.88rem] leading-[1.8] text-muted-foreground">{project.dataExplanation}</p>
                </div>
            )}
        </div>
    );
}

/* ─── Evaluation Tab ──────────────────────────────────── */
function EvaluationTab({ project, isDark }) {
    return (
        <div className="space-y-6">
            {/* Criteria */}
            {project.evaluation && (
                <div>
                    <SectionHeading icon={BarChart2} color="text-emerald-400">Evaluation Criteria</SectionHeading>
                    <div className="space-y-2.5">
                        {project.evaluation.map((c, i) => (
                            <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-muted">
                                <CheckCircle size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                                <span className="text-[0.88rem] leading-relaxed text-muted-foreground">{c}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Min Score */}
            {project.minimumScore && (
                <div className="rounded-2xl p-5 border-l-4 border-emerald-400 bg-emerald-400/[0.06] border border-emerald-400/20">
                    <SectionHeading icon={Target} color="text-emerald-400">Minimum Score Required</SectionHeading>
                    <p className="font-mono text-[0.88rem] font-bold leading-relaxed text-emerald-500">
                        {project.minimumScore}
                    </p>
                </div>
            )}
        </div>
    );
}

/* ─── Papers Tab ──────────────────────────────────────── */
function PapersTab({ project, isDark }) {
    return (
        <div className="space-y-3">
            <SectionHeading icon={GraduationCap} color="text-violet-400">Research Papers Referenced</SectionHeading>
            {(project.papers || []).map((p, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl border bg-muted border-border">
                    <ChevronRight size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
                    <span className="text-[0.88rem] leading-relaxed text-muted-foreground">{p}</span>
                </div>
            ))}
        </div>
    );
}

/* ─── Main component ──────────────────────────────────── */
export default function ProjectDetail({ project, isDark, onClose }) {
    const [activeTab, setActiveTab] = useState('overview');
    const [liked, setLiked] = useState(false);
    const [launching, setLaunching] = useState(false);
    const { apiCall } = useAuth();

    const openNotebook = async () => {
        if (launching) return;
        setLaunching(true);
        // Open the tab synchronously (no features arg, so we keep a real
        // window reference) and navigate it once the launch URL is back.
        const tab = window.open('about:blank', '_blank');
        try {
            const { url } = await apiCall('/notebook/launch', { method: 'POST' });
            if (tab && !tab.closed) {
                tab.opener = null;     // sever opener access ourselves
                tab.location.href = url;
            } else {
                // Popup blocked: fall back to navigating the current tab.
                window.location.href = url;
            }
        } catch (e) {
            if (tab && !tab.closed) tab.close();
            alert(e.message || 'Could not open notebook');
        } finally {
            setLaunching(false);
        }
    };

    useEffect(() => {
        const handle = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handle);
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', handle); document.body.style.overflow = ''; };
    }, [onClose]);

    if (!project) return null;
    const accent = getCategoryAccent(project.category);

    const tabContent = {
        overview:    <OverviewTab    project={project} isDark={isDark} />,
        methodology: <MethodologyTab project={project} isDark={isDark} />,
        data:        <DataTab        project={project} isDark={isDark} />,
        evaluation:  <EvaluationTab  project={project} isDark={isDark} />,
        papers:      <PapersTab      project={project} isDark={isDark} />,
        discussion:  <ProjectComments   projectId={project.id} isDark={isDark} />,
        leaderboard: <ProjectLeaderboard projectId={project.id} minimumScore={project.minimumScore} isDark={isDark} />,
    };

    return (
        <div className="fixed inset-0 z-[1000] flex flex-col overflow-hidden" style={{ animation: 'detailFadeIn 0.2s ease-out' }}>

            {/* ── Gradient Hero Header ─────────────────── */}
            <div className={`relative flex-shrink-0 bg-gradient-to-br ${accent} overflow-hidden`} style={{ minHeight: 220 }}>
                {/* Dark overlay */}
                <div className={`absolute inset-0 ${isDark ? 'bg-black/55' : 'bg-black/30'}`} />
                {/* Noise texture feel via radial */}
                <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 60%)' }} />

                {/* Top bar: back button + actions */}
                <div className="relative z-10 flex items-center justify-between px-6 pt-5 pb-2">
                    <button onClick={onClose} className="flex items-center gap-2 text-white/80 hover:text-white text-[0.82rem] font-semibold transition-colors group">
                        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                        Back to Projects
                    </button>
                    <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all hover:scale-105">
                        <X size={16} />
                    </button>
                </div>

                {/* Hero content */}
                <div className="relative z-10 px-6 pt-4 pb-8">
                    {/* Category + featured */}
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-[0.65rem] font-black uppercase tracking-[0.15em] text-white/70 bg-white/10 px-2.5 py-1 rounded-full">
                            {project.category}
                        </span>
                        {project.featured && (
                            <span className="text-[0.62rem] font-black uppercase tracking-widest text-white bg-gradient-to-r from-amber-500 to-red-500 px-2.5 py-1 rounded-full shadow-lg">
                                ⭐ Featured
                            </span>
                        )}
                    </div>

                    <h1 className="text-3xl md:text-4xl font-black text-white leading-tight tracking-tight mb-4 max-w-3xl">
                        {project.title}
                    </h1>

                    {/* Stats row */}
                    <div className="flex items-center gap-5 text-white/65 text-[0.82rem]">
                        <span className="flex items-center gap-1.5"><Eye size={14} />{fmtNum(project.views)} views</span>
                        <button onClick={() => setLiked(l => !l)} className={`flex items-center gap-1.5 transition-colors ${liked ? 'text-red-300' : 'text-white/65'}`}>
                            <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
                            {fmtNum(project.likes + (liked ? 1 : 0))} likes
                        </button>
                        <span className="flex items-center gap-1.5"><Clock size={13} />{project.lastUpdated}</span>
                    </div>
                </div>
            </div>

            {/* ── Sticky Tab Nav ───────────────────────── */}
            <div className="flex-shrink-0 border-b border-border z-10 bg-card">
                <div className="max-w-6xl mx-auto flex items-center gap-0 px-6 overflow-x-auto">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`flex items-center gap-2 px-4 py-3.5 text-[0.8rem] font-semibold border-b-2 transition-all whitespace-nowrap ${
                                activeTab === id
                                    ? 'border-primary text-indigo-400'
                                    : `border-transparent text-muted-foreground/70 hover:text-foreground`
                            }`}
                        >
                            <Icon size={13} />{label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Main scrollable body ─────────────────── */}
            <div className={`flex-1 overflow-y-auto ${isDark ? 'bg-background' : 'bg-muted'}`}>
                <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">

                    {/* Left: tab content */}
                    <div style={{ animation: 'detailSlideIn 0.25s ease-out' }}>
                        {tabContent[activeTab]}
                    </div>

                    {/* Right: sticky sidebar */}
                    <aside className="space-y-5">
                        {/* Action buttons */}
                        <div className="space-y-2.5">
                            <button
                                onClick={openNotebook}
                                disabled={launching}
                                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-[0.85rem] text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                                <ExternalLink size={15} /> {launching ? 'Opening…' : 'Open Notebook'}
                            </button>
                            <a href={project.githubUrl}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-[0.85rem] transition-all no-underline hover:scale-[1.02] bg-foreground text-background hover:bg-foreground/90">
                                <Github size={15} /> View on GitHub
                            </a>
                            <a href="#"
                                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-[0.85rem] transition-all no-underline hover:scale-[1.02] border bg-card border-border text-muted-foreground hover:bg-muted">
                                <Download size={15} /> Download
                            </a>
                        </div>

                        {/* Stats card */}
                        <div className="rounded-2xl overflow-hidden border bg-card border-border">
                            <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
                            <div className="flex divide-x divide-white/[0.06]">
                                <StatPill icon={Eye}   value={fmtNum(project.views)} label="Views"  color="text-cyan-400" />
                                <StatPill icon={Heart} value={fmtNum(project.likes)} label="Likes"  color="text-rose-400" />
                                <StatPill icon={Star}  value={project.featured ? '⭐' : '—'}        label="Status" color="text-amber-400" />
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="rounded-2xl p-4 border bg-card border-border">
                            <p className="text-[0.65rem] font-black uppercase tracking-widest mb-3 text-muted-foreground/70">Tags</p>
                            <div className="flex flex-wrap gap-2">
                                {project.tags.map(t => <Tag key={t} tag={t} />)}
                            </div>
                        </div>

                        {/* Tech Stack */}
                        <div className="rounded-2xl p-4 border bg-card border-border">
                            <div className="flex items-center gap-2 mb-3 text-[0.65rem] font-black uppercase tracking-widest text-muted-foreground/70">
                                <Cpu size={11} /> Tech Stack
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {project.techStack.map(t => (
                                    <span key={t} className="font-mono text-[0.75rem] font-semibold px-2.5 py-1 rounded-lg border bg-muted border-border text-muted-foreground">{t}</span>
                                ))}
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
