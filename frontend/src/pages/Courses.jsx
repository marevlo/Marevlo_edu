import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ChevronRight, Play, BookOpen, Layers, Brain,
    Database, FileText, Search, Zap, Globe, Code2,
    Cpu, GitBranch, FlaskConical, Video, Image, ScanText,
    Hash, Network, ServerCog, Sparkles, Home, ArrowLeft,
    Clock, Star, Lock, GraduationCap, Filter, X, ScanEye, MousePointer2,
    Shield, BookOpenCheck, Wrench, Award, AlertTriangle, Boxes
} from 'lucide-react';
import { COURSE_TREE as RAW_COURSE_TREE } from '../data/courseCatalog';
import ShowcaseCard from '../components/ShowcaseCard';

//  COURSE DATA TREE
//  isLeaf = true → navigates to course content

// Card tree is auto-generated from public/cources/ (scripts/generate-catalog.mjs).
// Icons arrive as string names; hydrate them into lucide components here.
const ICON_REGISTRY = {
    BookOpen, Layers, Brain, Database, FileText, Search, Zap, Globe, Code2,
    Cpu, GitBranch, FlaskConical, Video, Image, ScanText, Hash, Network,
    ServerCog, Sparkles, Star, Lock, GraduationCap, Filter, ScanEye,
    MousePointer2, Shield, BookOpenCheck, Wrench, Award, AlertTriangle, Boxes,
};
const hydrateIcons = (node) => ({
    ...node,
    icon: ICON_REGISTRY[node.iconName] ?? BookOpen,
    ...(node.children ? { children: node.children.map(hydrateIcons) } : {}),
});
const COURSE_TREE_BASE = RAW_COURSE_TREE.map(hydrateIcons);

//  HELPERS

const PROMOTED_DATA_SCIENCE_IDS = new Set([
    'ds-python',
    'statistics-probability',
    'deep-learning',
    'pytorch',
]);

const COURSE_TREE = COURSE_TREE_BASE.flatMap(node => {
    if (node.id !== 'data-science') return [node];

    const promotedCourses = node.children.filter(child => PROMOTED_DATA_SCIENCE_IDS.has(child.id));
    const remainingChildren = node.children.filter(child => !PROMOTED_DATA_SCIENCE_IDS.has(child.id));

    return [
        { ...node, children: remainingChildren },
        ...promotedCourses,
    ];
});

const LEVEL_COLORS = {
    'Beginner': { bg: 'rgba(65,189,120,0.12)', color: '#41bd78' },
    'Intermediate': { bg: 'rgba(224,160,80,0.12)', color: '#e0a050' },
    'Advanced': { bg: 'rgba(224,102,97,0.12)', color: '#e06661' },
    'Expert': { bg: 'rgba(145,128,232,0.12)', color: '#9180e8' },
};

// Count all leaf descendants
function countLeaves(node) {
    if (node.isLeaf) return 1;
    if (!node.children) return 0;
    return node.children.reduce((s, c) => s + countLeaves(c), 0);
}

// Walk path of ids to find a node
function findNode(tree, path) {
    if (!path.length) return null;
    let current = tree.find(n => n.id === path[0]);
    for (let i = 1; i < path.length; i++) {
        if (!current?.children) return null;
        current = current.children.find(n => n.id === path[i]);
    }
    return current;
}

//  COURSE CARD — thin adapter over the shared research-style ShowcaseCard.
//  Folder vs leaf behaviour and the dual Conceptual/Depth CTA live here;
//  all visuals live in components/ShowcaseCard.jsx.

function CourseCard({ node, onDrillDown, onStartLeaf, index = 0 }) {
    const Icon = node.icon ?? BookOpen;
    const isFolder = !node.isLeaf;
    const leafCount = isFolder ? countLeaves(node) : 0;
    const lvl = LEVEL_COLORS[node.level] ?? LEVEL_COLORS['Intermediate'];
    // Leaf nodes flagged with `hasDepthContent: true` get dual Conceptual/Depth buttons.
    const hasDepthContent = !!node.hasDepthContent;
    const tagline = node.tag || node.category || node.level || (isFolder ? 'Course Category' : 'Course');

    const chips = [];
    if (isFolder) chips.push({ icon: BookOpen, label: `${leafCount} lesson${leafCount !== 1 ? 's' : ''}` });
    if (node.duration) chips.push({ icon: Clock, label: node.duration });
    if (node.level) chips.push({ label: node.level, color: lvl.color });

    const actions = !isFolder && hasDepthContent
        ? [
            { icon: FileText, label: 'Conceptual', onClick: () => onStartLeaf(node, 'conceptual') },
            { icon: BookOpen, label: 'Depth', onClick: () => onStartLeaf(node, 'depth') },
        ]
        : [{
            icon: isFolder ? ChevronRight : Play,
            label: isFolder ? 'Explore' : 'Start',
            onClick: () => isFolder ? onDrillDown(node) : onStartLeaf(node),
        }];

    return (
        <ShowcaseCard
            index={index}
            icon={Icon}
            title={node.label}
            tagline={tagline}
            description={node.description || 'Explore this topic to learn more.'}
            chips={chips}
            actions={actions}
            onClick={() => isFolder ? onDrillDown(node) : onStartLeaf(node)}
        />
    );
}

//  ROOT CATEGORY HERO (top-level section header)

function RootCategoryHero({ node }) {
    const Icon = node.icon ?? Brain;
    const totalLessons = countLeaves(node);
    return (
        <div className="relative rounded-2xl overflow-hidden mb-6 p-6"
            style={{ background: node.gradient || 'linear-gradient(135deg,#6672e0,#9180e8)', boxShadow: `0 8px 32px ${node.shadow || 'rgba(102,114,224,0.3)'}` }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ position: 'absolute', bottom: -20, left: '25%', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
            <div className="relative z-10 flex items-center gap-4">
                <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={28} color="#fff" />
                </div>
                <div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
                        Course Category
                    </div>
                    <h2 className="text-2xl font-extrabold text-white" style={{ letterSpacing: '-0.02em' }}>{node.label}</h2>
                    <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.82rem', marginTop: 2 }}>
                        {node.description || ''} &nbsp;·&nbsp; {totalLessons} lessons
                    </p>
                </div>
            </div>
        </div>
    );
}

//  BREADCRUMB

function Breadcrumb({ path, onNavigate }) {
    return (
        <div className="flex items-center gap-1.5 flex-wrap mb-6">
            <button
                onClick={() => onNavigate([])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--foreground)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
                <Home size={12} /> All Courses
            </button>

            {path.map((crumb, i) => (
                <React.Fragment key={crumb.id}>
                    <ChevronRight size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <button
                        onClick={() => onNavigate(path.slice(0, i + 1).map(c => c.id))}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                        style={{
                            background: i === path.length - 1 ? 'rgba(102,114,224,0.12)' : 'var(--muted)',
                            color: i === path.length - 1 ? 'var(--primary)' : 'var(--muted-foreground)',
                        }}
                        onMouseEnter={e => { if (i < path.length - 1) e.currentTarget.style.color = 'var(--foreground)'; }}
                        onMouseLeave={e => { if (i < path.length - 1) e.currentTarget.style.color = 'var(--muted-foreground)'; }}
                    >
                        {crumb.label}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
}

//  MAIN PAGE

export default function Courses() {
    const navigate = useNavigate();
    const location = useLocation();
    // pathIds = array of node IDs from root to current folder
    const [pathIds, setPathIds] = useState(location.state?.pathIds || []);
    const [search, setSearch] = useState('');
    const [activeLevels, setActiveLevels] = useState([]);
    const [showLevelFilters, setShowLevelFilters] = useState(false);
    const searchRef = useRef(null);

    const urlPathIds = React.useMemo(() => {
        const segments = location.pathname.split('/').filter(Boolean);
        if (segments[0] !== 'courses' || segments.length < 2) return [];
        return segments.slice(1);
    }, [location.pathname]);

    useEffect(() => {
        if (urlPathIds.length > 0) {
            setPathIds(urlPathIds);
            return;
        }

        setPathIds(location.state?.pathIds || []);
    }, [location.pathname, location.state, urlPathIds]);

    // Keyboard shortcut: Cmd/Ctrl+K → focus search
    React.useEffect(() => {
        const handler = e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const toggleLevel = level => {
        setActiveLevels(prev =>
            prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
        );
    };

    // Recursive search in COURSE_TREE
    const findMatches = (nodes, query, levels) => {
        let results = [];
        for (const node of nodes) {
            const matchesQuery = query === '' ||
                node.label.toLowerCase().includes(query) ||
                (node.description && node.description.toLowerCase().includes(query)) ||
                (node.tag && node.tag.toLowerCase().includes(query));

            const matchesLevel = levels.length === 0 || levels.includes(node.level);

            if (matchesQuery && matchesLevel && node.isLeaf) {
                results.push(node);
            }
            if (node.children) {
                results = [...results, ...findMatches(node.children, query, levels)];
            }
        }
        return results;
    };

    const filteredResults = React.useMemo(() => {
        if (!search.trim() && activeLevels.length === 0) return null;
        return findMatches(COURSE_TREE, search.toLowerCase(), activeLevels);
    }, [search, activeLevels]);

    // Resolve current items to display
    const getCurrentItems = () => {
        if (!pathIds.length) return COURSE_TREE; // top level
        const node = findNode(COURSE_TREE, pathIds);
        return node?.children ?? [];
    };

    // Resolve breadcrumb nodes
    const getBreadcrumbs = () => {
        const crumbs = [];
        for (let i = 0; i < pathIds.length; i++) {
            const node = findNode(COURSE_TREE, pathIds.slice(0, i + 1));
            if (node) crumbs.push(node);
        }
        return crumbs;
    };

    // Find the parent node if we're inside a folder
    const parentNode = pathIds.length ? findNode(COURSE_TREE, pathIds) : null;
    // Detect if current parent is the root topic
    const isInsideRootCategory = pathIds.length === 1;
    // Root category node (for hero)
    const rootCatNode = pathIds.length ? findNode(COURSE_TREE, [pathIds[0]]) : null;

    const syncCourseUrl = (ids) => {
        const nextPath = ids.length ? `/courses/${ids.join('/')}` : '/courses';
        navigate(nextPath, { state: { pathIds: ids } });
    };

    const handleDrillDown = (node) => {
        const nextIds = [...pathIds, node.id];
        setPathIds(nextIds);
        syncCourseUrl(nextIds);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleNavigate = (ids) => {
        setPathIds(ids);
        syncCourseUrl(ids);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleStartLeaf = (node, format = 'conceptual') => {
        navigate(`/course/${node.id}`, { state: { fromPathIds: pathIds, format } });
    };

    const currentItems = getCurrentItems();
    const breadcrumbs = getBreadcrumbs();
    const totalAllLessons = COURSE_TREE.reduce((s, n) => s + countLeaves(n), 0);

    return (
        <div className="min-h-screen w-full overflow-y-auto custom-scrollbar"
            style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>

            {/* Hero Section — full-width, outside container */}
            {!pathIds.length && (
                <div className="relative overflow-hidden border-b bg-card dark:bg-background border-black/[0.06] dark:border-white/[0.06]" style={{minHeight:'340px'}}>
                    {/* Subtle grid backdrop (matches the landing hero — calm, no glow) */}
                    <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{backgroundImage:'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',backgroundSize:'44px 44px',maskImage:'radial-gradient(circle at center, black 20%, transparent 90%)'}} />

                    <div className="relative z-10 text-center px-6 pt-12 pb-10 max-w-4xl mx-auto">
                        {/* Pill badge */}
                        <div className="page-hero-badge">
                            <GraduationCap size={10} style={{ color: '#3fa9c9' }} />
                            Structured Curriculum
                        </div>

                        <h1 className="text-5xl md:text-[3.75rem] font-black tracking-tight leading-none courses-hero-title-grad mb-3">
                            Course Library
                        </h1>

                        <p className="page-hero-sub">
                            Explore structured learning paths — from Python basics to production AI systems.
                        </p>

                        {/* Stat chips */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {[
                                { icon: <Layers size={13} />,    label: `${COURSE_TREE.length} Categories` },
                                { icon: <BookOpen size={13} />,  label: `${totalAllLessons} Lessons` },
                                { icon: <Sparkles size={13} />,  label: 'All Levels' },
                                { icon: <Zap size={13} />,       label: 'New Courses Weekly' },
                            ].map(({ icon, label }) => (
                                <div key={label} className="page-hero-chip">
                                    <span>{icon}</span>
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="page-container relative z-10 py-8 sm:py-12">

                {/* Breadcrumb (when inside a folder and not searching) */}
                {pathIds.length > 0 && !filteredResults && (
                    <Breadcrumb path={breadcrumbs} onNavigate={handleNavigate} />
                )}

                {/* Root category hero (shown when drilling into a category and not searching) */}
                {isInsideRootCategory && rootCatNode && !filteredResults && (
                    <RootCategoryHero node={rootCatNode} />
                )}

                {/* Section title for sub-folders (not searching) */}
                {parentNode && !isInsideRootCategory && !filteredResults && (
                    <div className="mb-6 flex items-center gap-3">
                        <button
                            onClick={() => handleNavigate(pathIds.slice(0, -1))}
                            className="p-2 rounded-xl transition-all duration-200"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(102,114,224,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--card)'}
                        >
                            <ArrowLeft size={16} style={{ color: '#6672e0' }} />
                        </button>
                        <div>
                            <h2 className="text-xl font-extrabold" style={{ color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
                                {parentNode.label}
                            </h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                {countLeaves(parentNode)} lesson{countLeaves(parentNode) !== 1 ? 's' : ''} in this section
                            </p>
                        </div>
                    </div>
                )}

                {/* Cards Grid */}
                {filteredResults ? (
                    <div>
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Search size={18} className="text-primary" />
                                Search Results ({filteredResults.length})
                            </h3>
                            <button onClick={() => { setSearch(''); setActiveLevels([]); }} className="text-sm text-primary hover:underline font-semibold">
                                Clear search
                            </button>
                        </div>
                        {filteredResults.length === 0 ? (
                            <div className="text-center py-20 rounded-2xl" style={{ border: '1px dashed var(--border)', background: 'rgba(102,114,224,0.03)' }}>
                                <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px', background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Search size={28} className="text-muted-text" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">No matches found</h3>
                                <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>Try different keywords or check your level filters.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {filteredResults.map((node, i) => (
                                    <CourseCard
                                        key={node.id}
                                        node={node}
                                        index={i}
                                        onDrillDown={handleDrillDown}
                                        onStartLeaf={handleStartLeaf}
                                        isRootCategory={false}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ) : currentItems.length === 0 ? (
                    <div className="text-center py-20 rounded-2xl" style={{ border: '1px dashed var(--border)', background: 'rgba(102,114,224,0.03)' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px', background: 'linear-gradient(135deg,#6672e0,#9180e8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(102,114,224,0.35)' }}>
                            <BookOpen size={28} color="#fff" />
                        </div>
                        <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>No courses yet</h3>
                        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>Courses are being added. Check back soon!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {currentItems.map((node, i) => (
                            <CourseCard
                                key={node.id}
                                node={node}
                                index={i}
                                onDrillDown={handleDrillDown}
                                onStartLeaf={handleStartLeaf}
                                isRootCategory={!pathIds.length}
                            />
                        ))}
                    </div>
                )}

                <div className="mt-12 text-center">
                    <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>More courses coming soon ✨</p>
                </div>
            </div>
        </div>
    );
}
