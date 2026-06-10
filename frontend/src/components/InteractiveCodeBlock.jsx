import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { javascript } from '@codemirror/lang-javascript';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { githubLight } from '@uiw/codemirror-theme-github';
import { useTheme } from '../context/ThemeContext';
import { Play, Copy, Check, Terminal } from 'lucide-react';

// Code execution goes through the backend so it inherits auth + rate-limiting.
// The runner is no longer reachable from the public internet.
const API = import.meta.env.VITE_API_URL;
const getRunnerEndpoint = () => `${API}/submissions/run`;
const getAuthHeader = () => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const LANG_META = {
    python: {
        icon: '🐍',
        label: 'Python',
        color: '#5d8ede',
        extension: () => python(),
        runnerId: 'python',
    },
    sql: {
        icon: '🗄️',
        label: 'SQL',
        color: '#3fa9c9',
        extension: () => sql(),
        runnerId: null,
    },
    code: {
        icon: '📄',
        label: 'Code',
        color: '#9180e8',
        extension: () => javascript(),
        runnerId: 'javascript',
    },
    javascript: {
        icon: '⚡',
        label: 'JavaScript',
        color: '#e0a050',
        extension: () => javascript({ jsx: true }),
        runnerId: 'javascript',
    },
};

export default function InteractiveCodeBlock({ initialCode, language = 'python' }) {
    const { isDark } = useTheme();
    const [code, setCode] = useState(initialCode || '');
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState('idle');
    const [copied, setCopied] = useState(false);

    const meta = LANG_META[language] || LANG_META.code;
    const canRun = !!meta.runnerId;

    const copyCode = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const runCode = async () => {
        if (!canRun) return;
        setIsRunning(true);
        setStatus('running');
        setOutput('Running code...');
        try {
            const response = await fetch(getRunnerEndpoint(), {
                method: "POST",
                headers: { "Content-Type": "application/json", ...getAuthHeader() },
                body: JSON.stringify({
                    language: meta.runnerId,
                    code: code,
                    stdin: ""
                })
            });
            const result = await response.json();

            if (!response.ok) {
                setOutput(`Error: ${result?.error || result?.stderr || 'Request failed'}`);
                setStatus('error');
                return;
            }

            const stderr = result?.stderr || "";
            const stdout = result?.stdout || "";

            if (stderr) {
                setOutput(stderr);
                setStatus('error');
            } else if (!stdout) {
                setOutput('No output generated.');
                setStatus('idle');
            } else {
                setOutput(stdout);
                setStatus('success');
            }
        } catch (error) {
            setOutput(`Error: ${error.message || 'Unknown error'}`);
            setStatus('error');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div
            className="my-8 rounded-2xl overflow-hidden border transition-all duration-300 group"
            style={{
                borderColor: `${meta.color}33`,
                backgroundColor: isDark ? 'rgba(23, 23, 23, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(12px)',
                boxShadow: isDark
                    ? `0 20px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px ${meta.color}10`
                    : `0 20px 50px -12px rgba(0, 0, 0, 0.1), 0 0 20px ${meta.color}05`,
            }}
        >
            {/* Header / Title Bar */}
            <div
                className="flex items-center justify-between px-5 py-3 border-b"
                style={{
                    backgroundColor: isDark ? 'rgba(30, 30, 46, 0.4)' : 'rgba(248, 249, 250, 0.4)',
                    borderColor: `${meta.color}22`,
                }}
            >
                <div className="flex items-center gap-4">
                    {/* Traffic Lights */}
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(224,102,97,0.4)]" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(224,160,80,0.4)]" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(65,189,120,0.4)]" />
                    </div>

                    <div className="h-4 w-[1px] bg-neutral-500/20 mx-1" />

                    <div
                        className="flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider uppercase"
                        style={{
                            backgroundColor: `${meta.color}15`,
                            color: meta.color,
                            border: `1px solid ${meta.color}33`,
                        }}
                    >
                        {meta.icon} <span>{meta.label}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Copy Button */}
                    <button
                        onClick={copyCode}
                        className="p-2 rounded-lg transition-all hover:bg-neutral-500/10 text-muted-foreground active:scale-90"
                        title="Copy Code"
                    >
                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>

                    {/* Run Button */}
                    {canRun && (
                        <button
                            onClick={runCode}
                            disabled={isRunning}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group/btn shadow-lg"
                            style={{
                                background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
                                color: '#fff',
                                boxShadow: `0 4px 12px ${meta.color}44`,
                            }}
                        >
                            <Play
                                size={12}
                                fill={isRunning ? 'none' : 'currentColor'}
                                className={isRunning ? 'animate-pulse' : 'group-hover/btn:scale-110 transition-transform'}
                            />
                            {isRunning ? 'RUNNING...' : 'RUN CODE'}
                        </button>
                    )}
                </div>
            </div>

            {/* Editor Area */}
            <div className="relative">
                <div className="ide-editor-wrapper" style={{ minHeight: '160px', maxHeight: '500px', overflow: 'hidden' }}>
                    <CodeMirror
                        value={code}
                        theme={isDark ? dracula : githubLight}
                        extensions={[meta.extension()]}
                        onChange={(val) => setCode(val)}
                        basicSetup={{
                            lineNumbers: true,
                            foldGutter: true,
                            highlightActiveLine: true,
                            highlightActiveLineGutter: true,
                            syntaxHighlighting: true,
                            bracketMatching: true,
                            closeBrackets: true,
                            autocompletion: true,
                            tabSize: 4,
                        }}
                        style={{
                            fontSize: '14px',
                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                            height: '100%',
                        }}
                    />
                </div>
            </div>

            {/* Terminal / Output Area */}
            {canRun && (
                <div
                    className="border-t"
                    style={{
                        borderColor: `${meta.color}22`,
                        backgroundColor: isDark ? 'rgba(10, 10, 15, 0.6)' : 'rgba(250, 250, 252, 0.6)',
                    }}
                >
                    <div className="px-4 py-2 flex items-center gap-2 opacity-50">
                        <Terminal size={12} style={{ color: meta.color }} />
                        <span className="text-[10px] font-bold tracking-widest uppercase">Output Console</span>
                    </div>
                    <div
                        className="px-5 pb-4 pt-1 flex gap-3 font-mono text-sm overflow-auto custom-scrollbar"
                        style={{
                            minHeight: '60px',
                            maxHeight: '200px',
                        }}
                    >
                        <span style={{ color: meta.color, opacity: 0.8, userSelect: 'none' }} className="pt-0.5">λ</span>
                        <pre
                            className="flex-1 whitespace-pre-wrap text-xs leading-relaxed font-medium"
                            style={{
                                color: status === 'error' ? '#f87171'
                                    : status === 'success' ? '#34d399'
                                    : isDark ? '#d4d4d4' : '#4b5563',
                                margin: 0,
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                boxShadow: 'none',
                            }}
                        >
                            {output || <span className="italic opacity-30">Waiting for execution...</span>}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
