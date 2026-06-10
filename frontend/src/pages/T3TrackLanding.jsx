import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const V = {
    accent: '#7c3aed',
    accent2: '#ab9df0',
    accent3: '#6672e0',
    shadowColor: 'rgba(124,58,237,0.42)',
    watermarkColor: 'rgba(124,58,237,0.06)',
    bgGradient: 'linear-gradient(145deg, #120522 0%, #22083a 45%, #16082b 100%)',
};

const COURSE_BASE = '/Research-courses/Recommender system 2';

const CONCEPTUAL_FILES = [
    'T3_M01_you_already_use_recsys.html',
    'T3_M02_four_eras.html',
    'T3_M03_data_lies.html',
    'T3_M04_six_problems.html',
    'T3_M05_answer_these.html',
    'T3_M06_first_recommender.html',
    'T3_M07_content_based.html',
    'T3_M08_collaborative_filtering.html',
    'T3_M09_item_knn.html',
    'T3_M10_similarity_metrics.html',
    'T3_M11_knn_bug.html',
    'T3_M12_user_knn.html',
    'T3_M13_hybrid.html',
    'T3_M14_mf_decomposition.html',
    'T3_M15_funksvd.html',
    'T3_M16_bpr.html',
    'T3_M17_wrmf.html',
    'T3_M18_mf_variants.html',
    'T3_M19_features_fm.html',
    'T3_M20_wide_deep.html',
    'T3_M21_ranking_layer.html',
    'T3_M22_sasrec.html',
    'T3_M23_lightgcn.html',
    'T3_M24_llm_recsys.html',
    'T3_M25_ncf.html',
    'T3_M26_model_zoo.html',
    'T3_M27_full_stack.html',
    'T3_M28_serving.html',
    'T3_M29_ab_testing.html',
    'T3_M30_feedback_loops.html',
    'T3_M31_mlops.html',
    'T3_M32_capstone_retrieval.html',
    'T3_M33_capstone_ranking.html',
    'T3_M34_capstone_finale.html',
];

const DEEP_FILES = [
    'T3_DEEP_M01.html',
    'T3_DEEP_M02.html',
    'T3_DEEP_M03.html',
    'T3_DEEP_M04.html',
    'T3_DEEP_M05.html',
    'T3_DEEP_M06.html',
    'T3_DEEP_M07.html',
    'T3_DEEP_M08.html',
    'T3_DEEP_M09.html',
    'T3_DEEP_M10.html',
    'T3_DEEP_M11.html',
    'T3_DEEP_M12.html',
    'T3_DEEP_M13.html',
    'T3_DEEP_M14.html',
    'T3_DEEP_M15.html',
    'T3_DEEP_M16.html',
    'T3_DEEP_M17.html',
    'T3_DEEP_M18.html',
    'T3_DEEP_M19.html',
    'T3_DEEP_M20.html',
    'T3_DEEP_M21.html',
    'T3_DEEP_M22.html',
    'T3_DEEP_M23.html',
    'T3_DEEP_M24.html',
    'T3_DEEP_M25.html',
    'T3_DEEP_M26.html',
    'T3_DEEP_M27.html',
    'T3_DEEP_M28.html',
    'T3_DEEP_M29.html',
    'T3_DEEP_M30.html',
];

const LAB_FILES = [
    'Lab_01_interaction_matrix.py',
    'Lab_02_popularity_cbf.py',
    'Lab_03_item_knn_shrinkage (1).py',
    'Lab_04_bpr_mf.py',
    'Lab_05_faiss_serving.py',
    'Lab_06_capstone_pipeline.py',
];

const STATS = [
    { num: '34', label: 'Conceptual' },
    { num: '30', label: 'Deep Dives' },
    { num: '6', label: 'Labs' },
    { num: '64', label: 'Total Lessons' },
];

function prettifyTitle(fileName) {
    const withoutExt = fileName.replace(/\.(html|py)$/i, '');
    const withoutPrefix = withoutExt
        .replace(/^T3_M\d+_/, '')
        .replace(/^T3_DEEP_M\d+/, 'deep module')
        .replace(/^Lab_\d+_/, '');

    const normalized = withoutPrefix
        .replace(/\(1\)/g, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const acronyms = new Map([
        ['knn', 'kNN'],
        ['mf', 'MF'],
        ['bpr', 'BPR'],
        ['wrmf', 'WRMF'],
        ['fm', 'FM'],
        ['ncf', 'NCF'],
        ['llm', 'LLM'],
        ['recsys', 'Recsys'],
        ['sasrec', 'SASRec'],
        ['lightgcn', 'LightGCN'],
        ['funksvd', 'FunkSVD'],
        ['mlops', 'MLOps'],
        ['ab', 'A/B'],
        ['cbf', 'CBF'],
        ['faiss', 'FAISS'],
    ]);

    return normalized
        .split(' ')
        .map((word) => {
            const lower = word.toLowerCase();
            if (acronyms.has(lower)) return acronyms.get(lower);
            if (!word) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

function ModuleCard({ item, type, openAsset }) {
    const [hovered, setHovered] = useState(false);

    const typeStyles = {
        conceptual: {
            border: `${V.accent}55`,
            glow: 'rgba(124,58,237,0.28)',
        },
        deep: {
            border: 'rgba(102,114,224,0.6)',
            glow: 'rgba(102,114,224,0.24)',
        },
        lab: {
            border: 'rgba(65,189,120,0.6)',
            glow: 'rgba(65,189,120,0.2)',
        },
    };

    const style = typeStyles[type];

    return (
        <div
            className="t3-section-card"
            style={{
                borderRadius: '22px',
                padding: '24px',
                background: 'linear-gradient(145deg, #1b0b36 0%, #1a0831 40%, #150627 100%)',
                border: `1px solid ${hovered ? style.border : `${V.accent}40`}`,
                boxShadow: hovered ? `0 28px 80px ${style.glow}` : '0 16px 52px rgba(124,58,237,0.14)',
                transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
                transition: 'all 0.22s ease',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '292px',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={{
                position: 'absolute',
                top: '-36px',
                right: '-30px',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                filter: 'blur(34px)',
                background: style.glow,
                pointerEvents: 'none',
            }} />

            <div style={{
                position: 'absolute',
                right: '12px',
                top: '-8px',
                fontSize: '92px',
                fontWeight: 900,
                lineHeight: 1,
                color: V.watermarkColor,
                letterSpacing: '-0.05em',
                userSelect: 'none',
                pointerEvents: 'none',
            }}>
                {item.code.slice(1)}
            </div>

            <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
                fontWeight: 700,
                color: V.accent2,
                border: `1px solid ${V.accent}55`,
                background: `${V.accent}20`,
                marginBottom: '14px',
                position: 'relative',
                zIndex: 1,
            }}>
                {item.code.slice(1)}
            </div>

            <h3 style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                color: '#f5f3ff',
                lineHeight: 1.3,
                marginBottom: '8px',
                position: 'relative',
                zIndex: 1,
            }}>
                {item.title}
            </h3>

            <p style={{
                margin: '0 0 14px',
                color: 'rgba(215,205,242,0.72)',
                fontSize: '0.95rem',
                lineHeight: 1.6,
                minHeight: '46px',
                position: 'relative',
                zIndex: 1,
            }}>
                {item.subtitle}
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', position: 'relative', zIndex: 1 }}>
                {item.tags.map((tag) => (
                    <span key={tag} style={{
                        borderRadius: '8px',
                        padding: '4px 10px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11px',
                        color: '#c5bdf2',
                        border: `1px solid ${V.accent}45`,
                        background: `${V.accent}18`,
                    }}>
                        {tag}
                    </span>
                ))}
            </div>

            <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', position: 'relative', zIndex: 1 }}>
                <button
                    type="button"
                    onClick={() => openAsset(item.file, item.id)}
                    style={{
                        borderRadius: '12px',
                        border: `1px solid ${V.accent}45`,
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(233,226,255,0.9)',
                        height: '44px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                    }}
                >
                    <span style={{
                        display: 'inline-grid',
                        placeItems: 'center',
                        width: '20px',
                        height: '20px',
                        borderRadius: '6px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#1b102f',
                        background: `linear-gradient(135deg, ${V.accent}, ${V.accent2})`,
                    }}>
                        {type === 'deep' ? 'D' : type === 'lab' ? 'L' : 'M'}
                    </span>
                    {type === 'deep' ? 'Deep Dive' : type === 'lab' ? 'Open Lab' : 'Conceptual'}
                </button>

                <button
                    type="button"
                    disabled={!item.secondaryFile}
                    onClick={() => item.secondaryFile && openAsset(item.secondaryFile, item.secondaryId)}
                    style={{
                        borderRadius: '12px',
                        border: `1px solid ${item.secondaryFile ? `${V.accent}45` : 'rgba(255,255,255,0.2)'}`,
                        background: item.secondaryFile ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                        color: item.secondaryFile ? 'rgba(233,226,255,0.9)' : 'rgba(220,220,235,0.45)',
                        height: '44px',
                        fontWeight: 700,
                        cursor: item.secondaryFile ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                    }}
                >
                    <span style={{
                        display: 'inline-grid',
                        placeItems: 'center',
                        width: '20px',
                        height: '20px',
                        borderRadius: '6px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11px',
                        fontWeight: 700,
                        color: item.secondaryFile ? '#c5bdf2' : 'rgba(220,220,235,0.45)',
                        border: `1px solid ${item.secondaryFile ? V.accent2 : 'rgba(255,255,255,0.2)'}`,
                    }}>
                        {type === 'lab' ? 'P' : type === 'deep' ? 'M' : 'D'}
                    </span>
                    {type === 'lab' ? 'Practice' : type === 'deep' ? 'Conceptual' : 'Deep Dive'}
                </button>
            </div>
        </div>
    );
}

function sectionData(files, type) {
    return files.map((file, index) => {
        const moduleNumber = String(index + 1).padStart(2, '0');
        const code = type === 'deep' ? `D${moduleNumber}` : type === 'lab' ? `L${moduleNumber}` : `M${moduleNumber}`;
        const defaultTags = type === 'deep'
            ? ['~2h', 'deep dive', 'math + systems']
            : type === 'lab'
                ? ['python', 'hands-on', 'implementation']
                : ['~3h', '8 sections', '6 quiz'];

        let secondaryFile = null;
        let secondaryId = null;
        let id = null;
        if (type === 'conceptual') {
            id = `rs2-m${moduleNumber}`;
            if (index < DEEP_FILES.length) { secondaryFile = DEEP_FILES[index]; secondaryId = `rs2-d${moduleNumber}`; }
        } else if (type === 'deep') {
            id = `rs2-d${moduleNumber}`;
            if (index < CONCEPTUAL_FILES.length) { secondaryFile = CONCEPTUAL_FILES[index]; secondaryId = `rs2-m${moduleNumber}`; }
        } else if (type === 'lab') {
            id = `rs2-l${moduleNumber}`;
        }

        return {
            file,
            id,
            code,
            title: prettifyTitle(file),
            subtitle: type === 'conceptual'
                ? 'Core theory, intuition, and practical reasoning for this module.'
                : type === 'deep'
                    ? 'Advanced expansion with derivations, design tradeoffs, and implementation depth.'
                    : 'Coding-first exercise to implement and test concepts from the main track.',
            tags: defaultTags,
            secondaryFile,
            secondaryId,
        };
    });
}

export default function T3TrackLanding() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('conceptual');

    const conceptualModules = useMemo(() => sectionData(CONCEPTUAL_FILES, 'conceptual'), []);
    const deepModules = useMemo(() => sectionData(DEEP_FILES, 'deep'), []);
    const labModules = useMemo(() => sectionData(LAB_FILES, 'lab'), []);

    const tabContent = {
        conceptual: { label: 'Conceptual Modules', items: conceptualModules, type: 'conceptual' },
        deep: { label: 'Deep Dive Modules', items: deepModules, type: 'deep' },
        lab: { label: 'Labs', items: labModules, type: 'lab' },
    };

    const openAsset = (fileName, moduleId) => {
        if (moduleId) {
            navigate(`/research/course/${moduleId}`);
        } else {
            const encodedUrl = encodeURI(`${COURSE_BASE}/${fileName}`);
            window.open(encodedUrl, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <>

            <div className="overflow-y-auto h-full text-foreground" style={{ backgroundColor: 'var(--color-app-bg)' }}>
                <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '40px 24px 96px' }}>

                    <button
                        onClick={() => navigate('/research/courses')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            marginBottom: '48px', padding: '10px 18px',
                            borderRadius: '14px', fontSize: '0.82rem', fontWeight: 600,
                            background: `${V.accent}14`, border: `1px solid ${V.accent}33`,
                            color: V.accent2, cursor: 'pointer', transition: 'all 0.25s',
                        }}
                    >
                        <ArrowLeft size={16} /> Back to Courses
                    </button>

                    <div
                        style={{
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: '24px',
                            background: V.bgGradient,
                            boxShadow: `0 16px 48px ${V.shadowColor.replace('0.42', '0.15')}`,
                            padding: '28px',
                            marginBottom: '32px',
                        }}
                    >
                        <div style={{
                            position: 'absolute',
                            right: '16px',
                            top: '8px',
                            fontSize: '120px',
                            fontWeight: 900,
                            lineHeight: 1,
                            color: V.watermarkColor,
                            letterSpacing: '-0.06em',
                            userSelect: 'none',
                            pointerEvents: 'none',
                        }}>
                            03
                        </div>

                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '4px 12px',
                                borderRadius: '999px',
                                background: `${V.accent}1F`,
                                border: `1px solid ${V.accent}4D`,
                                marginBottom: '14px',
                            }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: V.accent2 }} />
                                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: V.accent2 }}>
                                    Retrieval, Ranking & GenAI Recsys
                                </span>
                            </div>

                            <h1 style={{
                                fontSize: 'clamp(2rem,4.6vw,3.4rem)',
                                fontWeight: 900,
                                lineHeight: 1.08,
                                letterSpacing: '-0.03em',
                                marginBottom: '12px',
                                color: '#efedff',
                            }}>
                                Recommender System
                            </h1>

                            <p style={{ color: 'rgba(200,200,240,0.8)', fontSize: '0.96rem', maxWidth: '640px', lineHeight: 1.7 }}>
                                Normal course format with three sections. Conceptual modules cover foundations and system design, Deep Dive modules add advanced depth, and Labs package applied implementation work.
                            </p>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                                {STATS.map((st) => (
                                    <div key={st.label} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '8px 14px', borderRadius: '999px',
                                        background: 'rgba(255,255,255,0.08)',
                                        border: '1px solid rgba(255,255,255,0.16)',
                                    }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f1ebff' }}>{st.num}</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(245,240,255,0.76)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                            {st.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        {[
                            { key: 'conceptual', label: 'Conceptual (34)' },
                            { key: 'deep', label: 'Deep Dive (25)' },
                            { key: 'lab', label: 'Labs (6)' },
                        ].map((tab) => {
                            const isActive = activeTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    className="t3-tab"
                                    onClick={() => setActiveTab(tab.key)}
                                    style={{
                                        background: isActive ? `${V.accent}26` : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${isActive ? `${V.accent}66` : 'rgba(255,255,255,0.15)'}`,
                                        color: isActive ? V.accent2 : 'var(--color-muted-text)',
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <h2 className="text-foreground" style={{
                            margin: 0,
                            fontSize: '1.18rem',
                            letterSpacing: '-0.01em',
                        }}>
                            {tabContent[activeTab].label}
                        </h2>
                        <span className="text-muted-foreground" style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '12px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '999px',
                            padding: '5px 10px',
                        }}>
                            {tabContent[activeTab].items.length} cards
                        </span>
                    </div>

                    <div className="t3-grid">
                        {tabContent[activeTab].items.map((item) => (
                            <ModuleCard
                                key={item.file}
                                item={item}
                                type={tabContent[activeTab].type}
                                openAsset={openAsset}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
