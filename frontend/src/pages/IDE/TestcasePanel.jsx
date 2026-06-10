import React, { useRef, useEffect, useState } from 'react';
import { Play, Upload, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';

/**
 * TestcasePanel — Premium scrollable test case panel.
 * Props:
 *   testcases: [{ input, expected_output|expected }]
 *   activeTestcase, onTestcaseChange
 *   activeTab ('testcase'|'result'), onTabChange
 *   testResults: [{ passed, message, category }]
 *   onRun, onSubmit, isRunning
 */
const TestcasePanel = ({
    testcases = [], activeTestcase = 0, onTestcaseChange,
    activeTab = 'testcase', onTabChange, testResults = [],
    onRun, onSubmit, isRunning
}) => {
    const scrollRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 2);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };

    useEffect(() => {
        checkScroll();
        const el = scrollRef.current;
        if (el) el.addEventListener('scroll', checkScroll, { passive: true });
        return () => el?.removeEventListener('scroll', checkScroll);
    }, [testcases]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el?.children[activeTestcase]) {
            el.children[activeTestcase].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [activeTestcase]);

    const scroll = (dir) => scrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });

    const getStatus = (idx) => {
        if (!testResults || !testResults[idx]) return 'pending';
        return testResults[idx].passed ? 'passed' : 'failed';
    };

    const statusColor = { passed: '#41bd78', failed: '#e06661', pending: 'var(--color-muted-text)' };
    const hasResults = testResults && testResults.length > 0;

    // Normalize: testcases might have expected_output OR expected
    const getExpected = (tc) => tc?.expected_output || tc?.expected || '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-surface)' }}>

            {/* Header: Tabs + Run/Submit */}
            <div style={{
                display: 'flex', alignItems: 'center', padding: '0 14px',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                minHeight: 44,
                gap: 4,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 0 }}>
                    {['testcase', 'result'].map(tab => {
                        const isActive = activeTab === tab;
                        const label = tab === 'testcase' ? 'Testcase' : 'Test Result';
                        const allPassed = hasResults && testResults.every(r => r.passed);
                        return (
                            <button key={tab} onClick={() => onTabChange?.(tab)} style={{
                                fontSize: 13, fontWeight: isActive ? 600 : 500, padding: '12px 14px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: isActive ? 'var(--color-primary-text)' : 'var(--color-muted-text)',
                                position: 'relative', transition: 'color 0.18s ease', outline: 'none',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-primary-text)'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-muted-text)'; }}
                            >
                                {label}
                                {tab === 'result' && hasResults && (
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: allPassed ? '#41bd78' : '#e06661', flexShrink: 0 }} />
                                )}
                                {isActive && <div style={{ position: 'absolute', bottom: -1, left: 14, right: 14, height: 2, background: 'var(--color-primary-text)', opacity: 0.85, borderRadius: '2px 2px 0 0' }} />}
                            </button>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={onRun} disabled={isRunning} className={isRunning ? 'tc-running' : ''}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', borderRadius: 8,
                            fontSize: 13, fontWeight: 600,
                            background: 'var(--color-surface-hover)',
                            color: isRunning ? 'var(--color-muted-text)' : 'var(--color-primary-text)',
                            border: '1px solid var(--color-border)',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            transition: 'all 0.18s ease',
                        }}
                        onMouseEnter={e => { if (!isRunning) { e.currentTarget.style.borderColor = 'var(--color-muted-text)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--color-surface-hover) 80%, var(--color-border))'; }}}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                    >
                        <Play size={13} fill={isRunning ? 'none' : 'currentColor'} /> Run
                    </button>
                    <button onClick={onSubmit} disabled={isRunning} className={isRunning ? 'tc-running' : ''}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', borderRadius: 8,
                            fontSize: 13, fontWeight: 600,
                            background: '#41bd78',
                            color: '#fff', border: 'none',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            transition: 'all 0.18s ease',
                            boxShadow: '0 1px 8px rgba(65,189,120,0.22)',
                            opacity: isRunning ? 0.7 : 1,
                        }}
                        onMouseEnter={e => { if (!isRunning) { e.currentTarget.style.background = '#059669'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(65,189,120,0.35)'; }}}
                        onMouseLeave={e => { e.currentTarget.style.background = '#41bd78'; e.currentTarget.style.boxShadow = '0 1px 8px rgba(65,189,120,0.22)'; }}
                    >
                        <Upload size={13} /> Submit
                    </button>
                </div>
            </div>

            {/* Scrollable Case Chips */}
            <div style={{ position: 'relative', borderBottom: '1px solid var(--color-border)', padding: '7px 0' }}>
                {canScrollLeft && (
                    <button onClick={() => scroll(-1)} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, zIndex: 5, background: 'linear-gradient(to right, var(--color-surface) 55%, transparent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted-text)' }}>
                        <ChevronLeft size={14} />
                    </button>
                )}
                {canScrollRight && (
                    <button onClick={() => scroll(1)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 28, zIndex: 5, background: 'linear-gradient(to left, var(--color-surface) 55%, transparent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted-text)' }}>
                        <ChevronRight size={14} />
                    </button>
                )}
                <div ref={scrollRef} className="tc-scroll" style={{ display: 'flex', gap: 6, padding: '0 14px', overflowX: 'auto' }}>
                    {testcases.map((_, idx) => {
                        const isActive = activeTestcase === idx;
                        const status = getStatus(idx);
                        const color = statusColor[status];
                        return (
                            <button key={idx} onClick={() => onTestcaseChange(idx)} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 8,
                                fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                background: isActive
                                    ? 'var(--color-surface-hover)'
                                    : status !== 'pending' ? `color-mix(in srgb, ${color} 8%, var(--color-surface))` : 'var(--color-surface)',
                                color: status === 'passed' ? '#41bd78' : status === 'failed' ? '#e06661' : isActive ? 'var(--color-primary-text)' : 'var(--color-muted-text)',
                                border: isActive
                                    ? '1px solid var(--color-border)'
                                    : `1px solid ${status !== 'pending' ? `color-mix(in srgb, ${color} 20%, transparent)` : 'var(--color-border)'}`,
                            }}>
                                {status === 'passed' && <Check size={11} strokeWidth={3} />}
                                {status === 'failed' && <X size={11} strokeWidth={3} />}
                                {status === 'pending' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'var(--color-primary-text)' : 'var(--color-border)', opacity: isActive ? 0.8 : 1 }} />}
                                Case {idx + 1}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }} className="premium-scrollbar">
                {activeTab === 'testcase' ? (
                    testcases && testcases[activeTestcase] ? (
                        <>
                            {[{ label: 'Input', val: testcases[activeTestcase].input, c: '#98a0ed' },
                              { label: 'Expected Output', val: getExpected(testcases[activeTestcase]), c: '#41bd78' }
                            ].map(({ label, val, c }) => (
                                <div key={label}>
                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted-text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ width: 3, height: 12, borderRadius: 1, background: c }} />{label}
                                    </div>
                                    <div style={{ background: 'color-mix(in srgb, var(--color-primary-text) 3%, var(--color-surface))', borderRadius: 8, padding: '10px 12px', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13, color: 'var(--color-primary-text)', border: '1px solid var(--color-border)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                        {val || '(empty)'}
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <div style={{ color: 'var(--color-muted-text)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
                            No test cases available.
                        </div>
                    )
                ) : (
                    hasResults ? (
                        <>
                            {(() => {
                                const passed = testResults.filter(r => r.passed).length;
                                const total = testResults.length;
                                const allPassed = passed === total;
                                return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: allPassed ? 'color-mix(in srgb, #41bd78 8%, var(--color-surface))' : 'color-mix(in srgb, #e06661 8%, var(--color-surface))', border: `1px solid ${allPassed ? 'rgba(65,189,120,.2)' : 'rgba(224,102,97,.2)'}` }}>
                                        <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: allPassed ? '#41bd7820' : '#e0666120', color: allPassed ? '#41bd78' : '#e06661' }}>
                                            {allPassed ? <Check size={17} strokeWidth={3} /> : <X size={17} strokeWidth={3} />}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: allPassed ? '#41bd78' : '#e06661' }}>{allPassed ? 'All Tests Passed' : `${total - passed} of ${total} Failed`}</div>
                                            <div style={{ fontSize: 12, color: 'var(--color-muted-text)', marginTop: 2 }}>{passed}/{total} passed</div>
                                        </div>
                                    </div>
                                );
                            })()}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {testResults.map((r, idx) => (
                                    <div key={idx} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${r.passed ? 'rgba(65,189,120,.18)' : 'rgba(224,102,97,.18)'}`, background: 'var(--color-surface)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: r.passed ? 'color-mix(in srgb, #41bd78 5%, var(--color-surface))' : 'color-mix(in srgb, #e06661 5%, var(--color-surface))', borderBottom: r.message ? `1px solid ${r.passed ? 'rgba(65,189,120,.12)' : 'rgba(224,102,97,.12)'}` : 'none' }}>
                                            <span style={{ width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.passed ? '#41bd78' : '#e06661', color: '#fff' }}>
                                                {r.passed ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                                            </span>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-text)' }}>Case {idx + 1}</span>
                                            {r.category && r.category !== 'success' && (
                                                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 3, background: 'color-mix(in srgb, #e06661 10%, transparent)', color: '#e06661', marginLeft: 'auto' }}>
                                                    {r.category === 'error' ? 'Runtime Error' : r.category === 'stderr' ? 'Exec Error' : r.category === 'mismatch' ? 'Wrong Answer' : r.category === 'no-expected' ? 'No Expected' : ''}
                                                </span>
                                            )}
                                        </div>
                                        {r.message && (
                                            <pre style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', margin: 0, color: 'var(--color-primary-text)', padding: '10px 12px', lineHeight: 1.5, maxHeight: 120, overflow: 'auto' }}>
                                                {r.message}
                                            </pre>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{ color: 'var(--color-muted-text)', fontSize: 13, textAlign: 'center', paddingTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <Upload size={26} style={{ opacity: 0.3 }} />
                            Click <strong>Submit</strong> to run all test cases.
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default TestcasePanel;
