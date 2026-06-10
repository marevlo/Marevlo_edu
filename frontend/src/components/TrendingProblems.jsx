import React, { useEffect, useState } from 'react';
import { Flame, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loadAllTopics } from '../utils/topicsLoader';

export default function TrendingProblems() {
    const navigate = useNavigate();
    const [topProblems, setTopProblems] = useState([]);

    useEffect(() => {
        loadAllTopics().then(topics => {
            const allProblems = topics.flatMap(t => t.problems);
            // Sort by likes descending, safely checking both direct likes and _raw.likes
            const sorted = allProblems
                .sort((a, b) => {
                    const likesA = a.likes || a._raw?.likes || 0;
                    const likesB = b.likes || b._raw?.likes || 0;
                    return likesB - likesA;
                })
                .slice(0, 3);
            setTopProblems(sorted);
        }).catch(err => console.error("Failed to load problems for trending:", err));
    }, []);

    const getDifficultyStyles = (difficulty) => {
        switch (difficulty?.toLowerCase()) {
            case 'easy': return { diff: 'Easy', color: '#41bd78' };
            case 'medium': return { diff: 'Medium', color: '#e0a050' };
            case 'hard': return { diff: 'Hard', color: '#e06661' };
            default: return { diff: 'Easy', color: '#41bd78' };
        }
    };

    // Show skeletons or a loading state if empty, but we can just return null or the shell
    if (topProblems.length === 0) {
        return (
            <div className="rounded-2xl overflow-hidden transition-all duration-300" style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
            }}>
                <div style={{ height: 4, background: 'linear-gradient(90deg, #6672e0, #3fa9c9)' }} />
                <div className="p-5 sm:p-6 opacity-50">
                    <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                        <Flame size={15} /> Trending Problems
                    </h3>
                    <div className="text-xs">Loading trending data...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl" style={{
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
        }}>
            <div style={{ height: 4, background: 'linear-gradient(90deg, #6672e0, #3fa9c9)' }} />
            <div className="p-5 sm:p-6">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6672e0, #9180e8)',
                        color: '#fff'
                    }}>
                        <Flame size={15} />
                    </span>
                    <span className="text-foreground">Trending Problems</span>
                </h3>
                <div className="space-y-3">
                    {topProblems.map((problem, index) => {
                        const style = getDifficultyStyles(problem.difficulty || problem._raw?.difficulty);
                        return (
                            <div key={problem.id} onClick={() => navigate(`/ide/${problem.id}`)} className="flex items-center justify-between py-2 px-3 rounded-xl transition-all duration-200" style={{
                                backgroundColor: 'var(--color-surface-hover)',
                                cursor: 'pointer'
                            }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(102,114,224,0.1)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'}
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="text-muted-foreground" style={{ fontSize: '0.7rem', fontWeight: 700, width: 24, flexShrink: 0 }}>#{index + 1}</span>
                                    <span className="truncate text-foreground" style={{ fontSize: '0.82rem', fontWeight: 600 }}>{problem.title}</span>
                                </div>
                                <span style={{
                                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
                                    color: style.color, background: `${style.color}18`, padding: '2px 8px', borderRadius: 999, flexShrink: 0
                                }}>
                                    {style.diff}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <button
                    onClick={() => navigate('/problems')}
                    className="w-full mt-4 text-xs font-bold py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1"
                    style={{
                        background: 'linear-gradient(135deg, rgba(102,114,224,0.12), rgba(145,128,232,0.12))',
                        color: 'var(--primary)',
                        border: '1px solid rgba(102,114,224,0.25)'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'linear-gradient(135deg,#6672e0,#9180e8)';
                        e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(102,114,224,0.12), rgba(145,128,232,0.12))';
                        e.currentTarget.style.color = '#6672e0';
                    }}
                >
                    View all problems <ArrowRight size={13} />
                </button>
            </div>
        </div>
    );
}
