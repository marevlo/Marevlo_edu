import React, { useState, useEffect } from 'react';
import { Upload, X, Loader2, Film, AlertCircle, Check } from 'lucide-react';
import { reelsApi, putToS3 } from './reelsApi';

const MIN_D = 20, MAX_D = 300, MAX_BYTES = 150 * 1024 * 1024;
const TYPES = [
    ['concept_explainer', 'Concept explainer'], ['problem_walkthrough', 'Problem walkthrough'],
    ['common_mistake', 'Common mistake'], ['shortcut_intuition', 'Shortcut / intuition'],
    ['interview_style', 'Interview-style'], ['visual_intuition', 'Visual intuition'],
    ['code_explanation', 'Code explanation'], ['revision_bite', 'Revision bite'],
];
const LANGS = ['English', 'Hindi', 'Spanish', 'Portuguese', 'Mandarin', 'Japanese', 'French', 'German', 'Arabic'];

/* ReelUploadModal
   props:
     onClose()
     onUploaded(reel)
     defaultAnchors: prefill when opened from a problem/topic page, e.g.
       [{anchor_type:'problem', anchor_id:'53', label:'Maximum subarray'}]
*/
export default function ReelUploadModal({ onClose, onUploaded, defaultAnchors = [] }) {
    const [file, setFile] = useState(null);
    const [duration, setDuration] = useState(null);
    const [thumbBlob, setThumbBlob] = useState(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [reelType, setReelType] = useState('concept_explainer');
    const [difficulty, setDifficulty] = useState('Medium');
    const [language, setLanguage] = useState('English');
    const [transcript, setTranscript] = useState('');
    const [anchors, setAnchors] = useState(defaultAnchors);
    const [topics, setTopics] = useState([]);
    const [topicFilter, setTopicFilter] = useState('');
    const [declared, setDeclared] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');

    useEffect(() => { reelsApi.topics().then(setTopics).catch(() => {}); }, []);

    const probe = (f) => {
        setError('');
        if (!['video/mp4', 'video/webm'].includes(f.type)) return setError('Only MP4 or WebM is supported.');
        if (f.size > MAX_BYTES) return setError('Video exceeds the 150 MB limit.');
        const url = URL.createObjectURL(f);
        const vid = document.createElement('video');
        vid.preload = 'metadata'; vid.src = url;
        vid.onloadedmetadata = () => {
            const d = Math.round(vid.duration);
            if (d < MIN_D || d > MAX_D) { setError(`Reels must be ${MIN_D}s–${MAX_D / 60} min. Yours is ${d}s.`); URL.revokeObjectURL(url); return; }
            setFile(f); setDuration(d);
            vid.currentTime = Math.min(0.5, vid.duration / 2);
            vid.onseeked = () => {
                const c = document.createElement('canvas');
                c.width = vid.videoWidth; c.height = vid.videoHeight;
                c.getContext('2d').drawImage(vid, 0, 0);
                c.toBlob((b) => setThumbBlob(b), 'image/jpeg', 0.8);
                URL.revokeObjectURL(url);
            };
        };
        vid.onerror = () => { setError('Could not read this video file.'); URL.revokeObjectURL(url); };
    };

    const toggleTopicAnchor = (t) => {
        setAnchors((as) => {
            const i = as.findIndex((a) => a.anchor_type !== 'problem' && a.anchor_id === t.slug);
            if (i >= 0) return as.filter((_, j) => j !== i);
            return [...as, { anchor_type: t.kind === 'concept' ? 'concept' : 'topic', anchor_id: t.slug, label: t.name, source: 'creator' }];
        });
    };

    const submit = async () => {
        if (!file || !title.trim()) return setError('A valid video and a title are required.');
        if (anchors.length === 0) return setError('Pick at least one anchor — Eds must be wired to the learning graph.');
        if (!declared) return setError('Please confirm the rights declaration.');
        setBusy(true); setError('');
        try {
            const presign = await reelsApi.requestUpload({
                video_content_type: file.type, video_size: file.size,
                thumbnail_content_type: thumbBlob ? 'image/jpeg' : null,
                thumbnail_size: thumbBlob ? thumbBlob.size : null,
            });
            await putToS3(presign.video_upload_url, file, file.type, (p) => setProgress(Math.round(p * 0.9)));
            if (thumbBlob && presign.thumbnail_upload_url) {
                await putToS3(presign.thumbnail_upload_url, thumbBlob, 'image/jpeg', (p) => setProgress(90 + Math.round(p * 0.05)));
            }
            setProgress(96);
            const reel = await reelsApi.create({
                title: title.trim(), description: description.trim() || null,
                reel_type: reelType, difficulty, language,
                video_object_key: presign.video_object_key,
                thumbnail_object_key: thumbBlob ? presign.thumbnail_object_key : null,
                duration_seconds: duration, anchors, declared_rights: true,
                transcript_text: transcript.trim() || null,
            });
            setProgress(100);
            onUploaded?.(reel);
            onClose();
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
    };

    const cls = {
        in: 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-sm ' +
            'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none',
        chip: (on) => `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            on ? 'bg-indigo-600 border-indigo-600 text-white'
               : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-400'}`,
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                        <Film className="w-5 h-5 text-indigo-500" /> Upload an Ed
                    </h2>
                    <button onClick={onClose} disabled={busy} aria-label="Close"><X className="w-5 h-5" /></button>
                </div>

                {!file ? (
                    <label className="block border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8
                                      text-center cursor-pointer hover:border-indigo-400 transition-colors">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Choose an MP4 or WebM</p>
                        <p className="text-xs text-gray-500 mt-1">{MIN_D}s – {MAX_D / 60} min · max 150 MB · one concept per Ed</p>
                        <input type="file" accept="video/mp4,video/webm" className="hidden"
                            onChange={(e) => e.target.files?.[0] && probe(e.target.files[0])} />
                    </label>
                ) : (
                    <div className="text-sm bg-gray-100 dark:bg-zinc-800 rounded-lg p-3 flex items-center justify-between">
                        <span className="truncate flex items-center gap-2 text-gray-800 dark:text-gray-200">
                            <Check className="w-4 h-4 text-emerald-500" />{file.name} · {duration}s
                        </span>
                        <button onClick={() => { setFile(null); setDuration(null); setThumbBlob(null); }} disabled={busy}>
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <input className={`${cls.in} mt-4`} value={title} maxLength={140}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title — say what clicks, e.g. “Why dropping a negative prefix is always safe”" />
                <textarea className={`${cls.in} mt-2`} rows={2} maxLength={2000} value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional — what will the viewer understand after 60 seconds?" />

                <p className="text-[13px] font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">Video type</p>
                <div className="flex gap-2 flex-wrap">
                    {TYPES.map(([k, l]) => (
                        <button key={k} className={cls.chip(reelType === k)} onClick={() => setReelType(k)}>{l}</button>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                        <p className="text-[13px] font-semibold mb-2 text-gray-900 dark:text-gray-100">Difficulty</p>
                        <div className="flex gap-2">
                            {['Easy', 'Medium', 'Hard'].map((d) => (
                                <button key={d} className={cls.chip(difficulty === d)} onClick={() => setDifficulty(d)}>{d}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold mb-2 text-gray-900 dark:text-gray-100">Language</p>
                        <select className={cls.in} value={language} onChange={(e) => setLanguage(e.target.value)}>
                            {LANGS.map((l) => <option key={l}>{l}</option>)}
                        </select>
                    </div>
                </div>

                <p className="text-[13px] font-semibold mt-4 mb-1 text-gray-900 dark:text-gray-100">
                    Anchors <span className="font-normal text-gray-400">— required: wire this Ed to the learning graph</span>
                </p>
                {defaultAnchors.length > 0 && (
                    <p className="text-xs text-emerald-600 mb-2">
                        ✓ Pre-anchored from the page you came from{defaultAnchors[0]?.label ? `: ${defaultAnchors[0].label}` : ''}
                    </p>
                )}
                <input className={`${cls.in} mb-2`} value={topicFilter}
                    onChange={(e) => setTopicFilter(e.target.value)}
                    placeholder="Filter topics & concepts — e.g. transformers, graphs, RAG…" />
                <div className="max-h-44 overflow-y-auto pr-1">
                    {['topic', 'concept'].map((kind) => {
                        const items = topics.filter((t) => t.kind === kind &&
                            (t.name.toLowerCase().includes(topicFilter.toLowerCase()) ||
                             (t.parent || '').includes(topicFilter.toLowerCase())));
                        if (items.length === 0) return null;
                        return (
                            <div key={kind} className="mb-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                                    {kind === 'topic' ? 'Topics' : 'Concepts'}
                                </p>
                                <div className="flex gap-1.5 flex-wrap">
                                    {items.map((t) => (
                                        <button key={t.slug}
                                            className={cls.chip(anchors.some((a) => a.anchor_id === t.slug))}
                                            onClick={() => toggleTopicAnchor(t)}
                                            title={t.parent ? `under ${t.parent.replace(/-/g, ' ')}` : undefined}>
                                            {t.kind === 'concept' ? '◆ ' : ''}{t.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <p className="text-[13px] font-semibold mt-4 mb-1 text-gray-900 dark:text-gray-100">
                    Transcript <span className="font-normal text-gray-400">— optional now; powers search, captions & MIRA. Auto-generated once Whisper is wired.</span>
                </p>
                <textarea className={cls.in} rows={3} maxLength={20000} value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Paste what you say in the video (rough is fine)" />

                <label className="flex gap-2.5 items-start mt-4 text-[13px] text-gray-600 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 accent-indigo-600" checked={declared}
                        onChange={(e) => setDeclared(e.target.checked)} />
                    I confirm this is my original content or I have the right to upload it. Re-uploaded third-party
                    clips are removed; repeat violations restrict the account.
                </label>

                {error && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg p-2.5">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                    </div>
                )}
                {busy && (
                    <div className="mt-3 h-2 rounded-full bg-gray-200 dark:bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                )}

                <button onClick={submit} disabled={busy || !file || !title.trim() || !declared || anchors.length === 0}
                    className="w-full mt-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold
                               disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-indigo-700">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {busy ? `Uploading… ${progress}%` : 'Publish Ed'}
                </button>
                <p className="text-[11.5px] text-gray-400 mt-2 text-center">
                    Your Ed goes live immediately. You can see it any time in your studio.
                </p>
            </div>
        </div>
    );
}
