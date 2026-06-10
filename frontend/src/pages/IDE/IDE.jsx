import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Upload, Code, FileText, Terminal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useContentProtection } from '../../utils/contentProtection';
import { PYTHON_AUTORUN_WRAPPER, JS_AUTORUN_WRAPPER } from '../../utils/pythonWrapper';

// Import all separated components
import ProblemPanel from './ProblemPanel';
import CodeToolbar from './CodeToolbar';
import CodeEditor from './CodeEditor';
import TestcasePanel from './TestcasePanel';
import StatusNotification from './StatusNotification';
import ConsolePanel from './ConsolePanel';
import EmptyState from './EmptyState';
import DragHandle from './DragHandle';

const starterCodes = {
    cpp: "#include <iostream>\nusing namespace std;\n\nint main(){\n    cout << \"Hello\";\n}",
    java: "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello\");\n  }\n}",
    python: "print('Hello')",
    javascript: "console.log('Hello');"
};

/** Stable language list — defined outside component to avoid recreation on every render */
const LANGUAGES = [
    { id: 'cpp', name: 'C++' },
    { id: 'java', name: 'Java' },
    { id: 'python', name: 'Python' },
    { id: 'javascript', name: 'JavaScript' }
];

const API = import.meta.env.VITE_API_URL;

// Code execution goes through the backend (auth + rate-limit + audit), which
// proxies to the runner on the internal docker network. The runner port 4002
// is intentionally not exposed to the public internet.
const getRunnerEndpoint = () => `${API}/submissions/run`;
const getAuthHeader = () => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseExampleText = (text = '') => {
    if (!text || typeof text !== 'string') {
        return {
            input: '',
            expected_output: '',
            explanation: ''
        };
    }

    // Normalize newlines
    const normalized = text.replace(/\\n/g, '\n').replace(/\\\n/g, '\n');

    // More flexible regex patterns
    const inputMatch = normalized.match(/Input:\s*(.+?)(?=\nOutput:|Output:|$)/is);
    const outputMatch = normalized.match(/Output:\s*(.+?)(?=\nExplanation:|Explanation:|$)/is);
    const explanationMatch = normalized.match(/Explanation:\s*(.+?)$/is);

    return {
        input: (inputMatch?.[1] || '').trim(),
        expected_output: (outputMatch?.[1] || '').trim(),
        explanation: (explanationMatch?.[1] || '').trim()
    };
};

const getStarterCode = (problem, language) => {
    if (problem?.starter_code) {
        if (typeof problem.starter_code === 'string' && problem.starter_code.trim()) {
            return problem.starter_code;
        }
        if (typeof problem.starter_code === 'object') {
            const langCode = problem.starter_code[language];
            if (langCode && String(langCode).trim()) return langCode;
        }
    }

    const title = problem?.title || 'Graph Problem';
    const fallback = {
        java: `// ${title}\n// Read from STDIN, write to STDOUT\n\nimport java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        StringBuilder input = new StringBuilder();\n        String line;\n        while ((line = br.readLine()) != null) {\n            input.append(line).append(\"\\n\");\n        }\n        // TODO: parse input and solve\n        System.out.println(\"\");\n    }\n}\n`,
        python: `# ${title}\n# Read from STDIN, write to STDOUT\nimport sys\n\ndef solve(data: str) -> str:\n    # TODO: parse input and solve\n    return \"\"\n\nif __name__ == \"__main__\":\n    data = sys.stdin.read()\n    print(solve(data))\n`,
        javascript: `// ${title}\n// Read from STDIN, write to STDOUT\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8');\n\nfunction solve(data) {\n  // TODO: parse input and solve\n  return \"\";\n}\n\nprocess.stdout.write(String(solve(input)));\n`,
        cpp: `// ${title}\n// Read from STDIN, write to STDOUT\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    // TODO: parse input and solve\n    return 0;\n}\n`
    };

    return fallback[language] || fallback.python;
};

const wrapCodeForRun = (language, code, autoWrapReturn) => {
    if (!autoWrapReturn) return code;
    if (language === 'python') return code + PYTHON_AUTORUN_WRAPPER;
    if (language === 'javascript') return code + JS_AUTORUN_WRAPPER;
    return code;
};

/**
 * useDrag — lightweight drag-to-resize hook (no external deps)
 * direction: 'horizontal' (left/right %) or 'vertical' (top/bottom %)
 * min/max: percent limits
 */
function useDrag(initial = 40, min = 20, max = 75, direction = 'horizontal') {
    const [size, setSize] = useState(initial);
    const dragging = useRef(false);
    const containerRef = useRef(null);

    const onMouseDown = useCallback((e) => {
        e.preventDefault();
        dragging.current = true;
        document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
    }, [direction]);

    useEffect(() => {
        const onMove = (e) => {
            if (!dragging.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const pct = direction === 'horizontal'
                ? ((e.clientX - rect.left) / rect.width) * 100
                : ((e.clientY - rect.top) / rect.height) * 100;
            setSize(Math.min(Math.max(pct, min), max));
        };
        const onUp = () => {
            dragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [min, max, direction]);

    return { containerRef, size, onMouseDown };
}

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return isMobile;
}

// Converts a structured JSON test case input object to a stdin string.
// e.g. { nums: [2,7,11,15], target: 9 } → "[2, 7, 11, 15]\n9"
const testCaseInputToStdin = (input) => {
    if (typeof input === 'string') return input;
    if (input === null || input === undefined) return '';
    // Always JSON-serialize each field value — one per line.
    // This gives a consistent, predictable stdin format the user can parse.
    return Object.values(input).map(v => JSON.stringify(v)).join('\n');
};

// Normalize Python None/True/False and re-stringify JSON for canonical comparison
const normalizeOutput = (output) => {
    if (output === null || output === undefined) return '';
    let s = String(output).trim();
    // Normalize Python None → null, True → true, False → false
    s = s.replace(/\bNone\b/g, 'null');
    s = s.replace(/\bTrue\b/g, 'true');
    s = s.replace(/\bFalse\b/g, 'false');
    // Try to parse as JSON and re-stringify for canonical form
    try {
        const parsed = JSON.parse(s);
        s = JSON.stringify(parsed);
    } catch (e) {
        // Not valid JSON, keep as-is but remove trailing newlines
    }
    return s;
};

export default function IDE({ problem, judgeTestCases = [], onBack, onNext, onSolved }) {
    const { user } = useAuth();
    useContentProtection({ user });  // watermark + screenshot deterrents for the DS&Algo IDE
    const isMobile = useIsMobile();
    const [selectedLanguage, setSelectedLanguage] = useState('java');
    const [code, setCode] = useState(starterCodes[selectedLanguage]);
    const [output, setOutput] = useState("");
    const [testResults, setTestResults] = useState([]);
    const [status, setStatus] = useState('idle'); // idle | running | success | error
    const [attempts, setAttempts] = useState(0);
    const [discussError, setDiscussError] = useState(null);
    const [activeTestcase, setActiveTestcase] = useState(0);
    const [testcases, setTestcases] = useState([]);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const [stdin, setStdin] = useState('');
    const [useCustomInput, setUseCustomInput] = useState(false);
    const [autoWrapReturn, setAutoWrapReturn] = useState(true);
    const [activeTestTab, setActiveTestTab] = useState('testcase');
    const [activeLadder, setActiveLadder] = useState(null); // Current ladder from Approaches tab
    const [solvedLadders, setSolvedLadders] = useState({}); // { approachId: { ladderIndex: true } }
    const [isRunning, setIsRunning] = useState(false);

    const [activeMobileTab, setActiveMobileTab] = useState('problem'); // 'problem', 'editor', 'testcases'

    const handleActiveLadderChange = useCallback((data) => {
        if (data && data.ladder && data.ladder.testCases && data.ladder.testCases.length > 0) {
            setActiveLadder(data); // { ladder, approachId, ladderIndex }
            setTestcases(data.ladder.testCases.map(tc => ({
                input: String(tc.input ?? '').trim(),
                expected_output: String(tc.expected ?? tc.expected_output ?? '').trim(),
            })));
            setActiveTestcase(0);
            setTestResults([]);
            setActiveTestTab('testcase');
        } else if (!data && problem?.examples?.length > 0) {
            setActiveLadder(null);
            setTestcases(problem.examples.map(ex => ({
                input: String(ex.input ?? '').trim(),
                expected_output: String(ex.output ?? '').trim(),
                explanation: String(ex.explanation ?? '').trim(),
            })));
            setActiveTestcase(0);
            setTestResults([]);
            setActiveTestTab('testcase');
        } else {
            setActiveLadder(data || null);
        }
    }, [problem]);

    // Stable callbacks — no deps on volatile state, safe to memoize
    const handleClearPrefill  = useCallback(() => setDiscussError(null), []);
    const handleToggleConsole = useCallback(() => setIsConsoleOpen(prev => !prev), []);

    const hDrag = useDrag(40, 20, 72, 'horizontal');
    const vDrag = useDrag(65, 25, 80, 'vertical');

    useEffect(() => {
        const handler = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                runCode(true);   // Ctrl+Shift+Enter → Submit
            } else if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                runCode(false);  // Ctrl+Enter → Run
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, selectedLanguage, useCustomInput, stdin, autoWrapReturn, testcases]);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).catch(() => {
            console.warn("Clipboard not supported");
        });
    };

    const handleReset = () => {
        setCode(getStarterCode(problem, selectedLanguage));
    };

    const handleLanguageChange = (lang) => {
        setSelectedLanguage(lang);
        setCode(getStarterCode(problem, lang));
    };

    /**
     * Helper: Get numeric backend problem ID
     * Returns problem.id if it's already numeric
     * Otherwise fetches from backend by slug or title
     */
    const getNumericProblemId = async (prob) => {
        if (!prob) return null;
        
        // If problem.id is already a number, use it directly
        if (Number.isInteger(Number(prob.id))) {
            return Number(prob.id);
        }

        // Try to fetch from backend
        const token = localStorage.getItem('access_token');
        if (!token) return null;

        try {
            // Fetch problems from backend (paginate safely)
            let offset = 0;
            const limit = 100;
            
            while (offset < 500) {  // Reasonable safety limit
                const res = await fetch(`${API}/problems?limit=${limit}&offset=${offset}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                
                if (!res.ok) break;
                
                const problems = await res.json();
                if (!problems || problems.length === 0) break;
                
                // Try to find by slug first (most reliable)
                if (prob.slug) {
                    const found = problems.find(p => p.slug === prob.slug);
                    if (found && Number.isInteger(Number(found.id))) return Number(found.id);
                }
                
                // Then try by title (less reliable)
                const found = problems.find(p => p.title === prob.title);
                if (found && Number.isInteger(Number(found.id))) return Number(found.id);
                
                offset += limit;
            }
        } catch (err) {
            console.warn('Error fetching backend problems:', err);
        }

        return null;
    };

    useEffect(() => {
        setCode(getStarterCode(problem, selectedLanguage));
        setOutput("");
        setStatus('idle');
        setAttempts(0);
        setStdin('');
        setUseCustomInput(false);
        setAutoWrapReturn(true);
        setActiveTestTab('testcase');
        setTestResults([]);
        setActiveLadder(null);
        setSolvedLadders({});

        // Build testcase rows from the problem schema used in assets.
        // Prefer direct input/output fields, with fallback to legacy example_text parsing.
        if (problem && problem.examples && problem.examples.length > 0) {
            setTestcases(problem.examples.map((ex) => {
                if (ex && (ex.input !== undefined || ex.output !== undefined || ex.explanation !== undefined)) {
                    return {
                        input: String(ex.input ?? '').trim(),
                        expected_output: String(ex.output ?? '').trim(),
                        explanation: String(ex.explanation ?? '').trim(),
                    };
                }
                return parseExampleText(ex?.example_text);
            }));
        } else {
            setTestcases([]);
        }
    }, [problem]);

    const runSingle = async (stdinValue) => {
        const codeToRun = wrapCodeForRun(selectedLanguage, code, autoWrapReturn);
        const response = await fetch(getRunnerEndpoint(), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeader() },
            body: JSON.stringify({
                language: selectedLanguage || 'python',
                code: codeToRun,
                stdin: stdinValue || ""
            })
        });
        const result = await response.json();
        return { response, result };
    };

    const handleTestTabChange = (tab) => {
        setActiveTestTab(tab);
        if (tab === 'result' && !isRunning) {
            runCode(true);
        }
    };

    const runCode = async (isSubmission = false) => {
        // Validate we have code to run
        if (!code || code.trim() === '') {
            setOutput("Error: No code to run. Write some code first!");
            setStatus('error');
            return;
        }

        setIsRunning(true);
        setStatus('running');
        setOutput("Running code...");
        setIsConsoleOpen(true);
        setTestResults([]);

        try {
            if (isSubmission) {
                // SUBMIT MODE: Send to backend server-side judge
                setOutput("Submitting to judge...");
                
                const token = localStorage.getItem('access_token');
                if (!token) {
                    setOutput("Error: Not authenticated. Cannot submit.");
                    setStatus('error');
                    setIsRunning(false);
                    return;
                }
                
                // Get numeric problem ID
                const numericProblemId = await getNumericProblemId(problem);
                if (!numericProblemId) {
                    setOutput("Error: Could not identify problem. This asset problem may not be linked to a backend problem.");
                    setStatus('error');
                    setIsRunning(false);
                    return;
                }

                try {
                    const submitResponse = await fetch(`${API}/submissions/submit`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            problem_id: numericProblemId,
                            language: selectedLanguage || 'python',
                            code: code,
                        }),
                    });

                    if (!submitResponse.ok) {
                        const errText = await submitResponse.text();
                        setOutput(`Error: Failed to submit (${submitResponse.status})\n${errText}`);
                        setStatus('error');
                        setIsRunning(false);
                        return;
                    }

                    const submission = await submitResponse.json();
                    const submissionStatus = submission.status;
                    const testsPassed = submission.test_cases_passed || 0;
                    const totalTests = submission.total_test_cases || 0;

                    let outputMsg = '';
                    let uiStatus = 'error';

                    switch (submissionStatus) {
                        case 'accepted':
                            outputMsg = `✓ Accepted!\nAll ${totalTests} test case${totalTests !== 1 ? 's' : ''} passed.`;
                            uiStatus = 'success';
                            break;
                        case 'wrong_answer':
                            outputMsg = `✗ Wrong Answer\nPassed ${testsPassed} of ${totalTests} test cases.`;
                            uiStatus = 'error';
                            break;
                        case 'time_limit_exceeded':
                            outputMsg = `✗ Time Limit Exceeded\nCode took too long to execute.`;
                            uiStatus = 'error';
                            break;
                        case 'memory_limit_exceeded':
                            outputMsg = `✗ Memory Limit Exceeded\nCode used too much memory.`;
                            uiStatus = 'error';
                            break;
                        case 'runtime_error':
                            outputMsg = `✗ Runtime Error\nCode crashed during execution.`;
                            uiStatus = 'error';
                            break;
                        case 'compile_error':
                            outputMsg = `✗ Compilation Error\nFailed to compile code.`;
                            uiStatus = 'error';
                            break;
                        default:
                            outputMsg = `✗ Submission Error\nStatus: ${submissionStatus}`;
                            uiStatus = 'error';
                    }

                    setOutput(outputMsg);
                    setStatus(uiStatus);
                    setActiveTestTab('result');

                    if (uiStatus === 'success') {
                        handleSubmissionResult(true);
                    } else {
                        handleSubmissionResult(false);
                    }

                } catch (err) {
                    const errorMsg = err?.message || 'Unknown error occurred';
                    setOutput(`Error: ${errorMsg}`);
                    setStatus('error');
                    handleSubmissionResult(false);
                }

                setIsRunning(false);
                return;
            }

            // RUN MODE: Just execute code and show output, NO verdict
            const activeTc = testcases[activeTestcase];
            const stdinValue = useCustomInput ? stdin : (activeTc?.input || '');
            const { response, result } = await runSingle(stdinValue);

            if (!response.ok) {
                const msg = result?.error || result?.stderr || `Request failed (${response.status})`;
                setOutput(`Error: ${msg}`);
                setStatus('error');
                return;
            }

            const stdout = result?.stdout || "";
            const stderr = result?.stderr || "";

            if (stderr) {
                setOutput(stderr);
                setStatus('error');
            } else if (!stdout) {
                setOutput("No output generated.");
                setStatus('idle');
            } else {
                setOutput(stdout);
                // Run mode: set to 'idle' — no verdict popup
                setStatus('idle');
            }
        } catch (error) {
            const errorMsg = error?.message || 'Unknown error occurred';
            setOutput(`Error: ${errorMsg}`);
            setStatus('error');
        } finally {
            setIsRunning(false);
        }
    };

    const handleSubmissionResult = (isSuccess) => {
        if (isSuccess) {
            setStatus('success');
            // Mark the current ladder as solved
            if (activeLadder && activeLadder.approachId != null && activeLadder.ladderIndex != null) {
                setSolvedLadders(prev => ({
                    ...prev,
                    [activeLadder.approachId]: {
                        ...(prev[activeLadder.approachId] || {}),
                        [activeLadder.ladderIndex]: true,
                    },
                }));
            }
            if (onSolved) onSolved();
        } else {
            setStatus('error');
            setAttempts(prev => prev + 1);
        }
    };

    if (!problem) {
        return <EmptyState />;
    }

    return (
        <div className="flex flex-col h-full overflow-hidden relative" style={{ background: 'var(--color-app-bg)' }}>
            {/* Header - Global CodeToolbar */}
            <CodeToolbar
                selectedLanguage={selectedLanguage}
                languages={LANGUAGES}
                onLanguageChange={handleLanguageChange}
                onCopy={handleCopy}
                onReset={handleReset}
            />

            <div className="flex-1 flex overflow-hidden relative" style={{ padding: '8px' }}>
                {isMobile ? (
                    <div className="flex-1 flex flex-col h-full">
                        {activeMobileTab === 'problem' && (
                            <div className="flex-1 overflow-hidden w-full">
                                <ProblemPanel
                                    problem={problem}
                                    onBack={onBack}
                                    onActiveLadderChange={handleActiveLadderChange}
                                    solvedLadders={solvedLadders}
                                    attempts={attempts}
                                    prefillError={discussError}
                                    onClearPrefill={handleClearPrefill}
                                />
                            </div>
                        )}
                        {activeMobileTab === 'editor' && (
                            <div className="flex-1 overflow-hidden w-full">
                                <CodeEditor code={code} onChange={setCode} language={selectedLanguage} />
                            </div>
                        )}
                        {activeMobileTab === 'testcases' && (
                            <div className="flex-1 overflow-hidden w-full">
                                <TestcasePanel
                                    testcases={testcases}
                                    activeTestcase={activeTestcase}
                                    onTestcaseChange={setActiveTestcase}
                                    activeTab={activeTestTab}
                                    onTabChange={handleTestTabChange}
                                    testResults={testResults}
                                    onRun={() => runCode(false)}
                                    onSubmit={() => runCode(true)}
                                    isRunning={isRunning}
                                    onDiscussError={(ctx) => { setDiscussError(ctx); setActiveMobileTab('problem'); }}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div ref={hDrag.containerRef} className="flex flex-1 h-full" style={{ position: 'relative' }}>
                        <div style={{ width: `${hDrag.size}%`, minWidth: '240px', height: '100%', flexShrink: 0, overflow: 'hidden', borderRadius: 14, border: '1px solid var(--color-border)' }}>
                            <ProblemPanel
                                problem={problem}
                                onBack={onBack}
                                onActiveLadderChange={handleActiveLadderChange}
                                solvedLadders={solvedLadders}
                                attempts={attempts}
                                prefillError={discussError}
                                onClearPrefill={handleClearPrefill}
                            />
                        </div>

                        {/* ↔ Horizontal drag handle */}
                        <DragHandle direction="horizontal" onMouseDown={hDrag.onMouseDown} />

                        <div ref={vDrag.containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ height: `${vDrag.size}%`, minHeight: '80px', overflow: 'hidden', position: 'relative', borderRadius: 14, border: '1px solid var(--color-border)' }}>
                                <CodeEditor code={code} onChange={setCode} language={selectedLanguage} />
                            </div>

                            {/* ↕ Vertical drag handle */}
                            <DragHandle direction="vertical" onMouseDown={vDrag.onMouseDown} />

                            <div style={{ flex: 1, minHeight: '80px', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 14, border: '1px solid var(--color-border)' }}>
                                <div className="flex-1 overflow-hidden">
                                    <TestcasePanel
                                        testcases={testcases}
                                        activeTestcase={activeTestcase}
                                        onTestcaseChange={setActiveTestcase}
                                        activeTab={activeTestTab}
                                        onTabChange={handleTestTabChange}
                                        testResults={testResults}
                                        onRun={() => runCode(false)}
                                        onSubmit={() => runCode(true)}
                                        isRunning={isRunning}
                                        onDiscussError={setDiscussError}
                                    />
                                </div>
                                <ConsolePanel
                                    output={output}
                                    status={status}
                                    isExpanded={isConsoleOpen}
                                    onToggle={handleToggleConsole}
                                    stdin={stdin}
                                    onStdinChange={setStdin}
                                    useCustomInput={useCustomInput}
                                    onToggleCustomInput={setUseCustomInput}
                                    autoWrapReturn={autoWrapReturn}
                                    onToggleAutoWrap={setAutoWrapReturn}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isMobile && (
                <>
                    <div className={`fixed bottom-20 right-4 flex flex-col gap-3 z-50 transition-transform duration-300 ${activeMobileTab === 'problem' ? 'translate-y-24 opacity-0' : 'translate-y-0 opacity-100'}`}>
                        <button onClick={() => runCode(false)} disabled={isRunning} className="flex items-center justify-center w-12 h-12 rounded-full text-white shadow-lg active:scale-95 transition-all" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary-text)' }}>
                            <Play size={20} fill={isRunning ? "none" : "currentColor"} />
                        </button>
                        <button onClick={() => runCode(true)} disabled={isRunning} className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-600 text-white shadow-lg active:scale-95 transition-all">
                            <Upload size={20} />
                        </button>
                    </div>
                    <div className="h-16 border-t flex items-center justify-around shrink-0 z-40" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                        <button onClick={() => setActiveMobileTab('problem')} className="flex flex-col items-center gap-1 p-2" style={{ color: activeMobileTab === 'problem' ? 'var(--color-primary-text)' : 'var(--color-muted-text)' }}>
                            <FileText size={20} />
                            <span className="text-[10px] font-medium">Problem</span>
                        </button>
                        <button onClick={() => setActiveMobileTab('editor')} className="flex flex-col items-center gap-1 p-2" style={{ color: activeMobileTab === 'editor' ? 'var(--color-primary-text)' : 'var(--color-muted-text)' }}>
                            <Code size={20} />
                            <span className="text-[10px] font-medium">Code</span>
                        </button>
                        <button onClick={() => setActiveMobileTab('testcases')} className="flex flex-col items-center gap-1 p-2" style={{ color: activeMobileTab === 'testcases' ? 'var(--color-primary-text)' : 'var(--color-muted-text)' }}>
                            <Terminal size={20} />
                            <span className="text-[10px] font-medium">Testcases</span>
                        </button>
                    </div>
                </>
            )}

            {/* Status Notifications */}
            <StatusNotification
                status={status}
                attempts={attempts}
                onNext={onNext}
                onDismiss={() => setStatus('idle')}
            />
        </div>
    );
}
