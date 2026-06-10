// Lazy-loads visualization HTML files bundled into the JS build.
// Vite's import.meta.glob with `?raw` embeds the .htm content as strings
// (one chunk per file), fetched on demand. This bypasses ALL server-side
// routing — works on Vercel, Vite dev, anywhere.

const rawModules = import.meta.glob('./**/*.{htm,html}', {
    query: '?raw',
    import: 'default',
});

// Normalize keys to "topic/stem.ext" (strip the leading "./") so lookups are
// immune to any Vite version differences in how glob keys are prefixed.
const modules = {};
for (const [key, loader] of Object.entries(rawModules)) {
    modules[key.replace(/^\.\//, '')] = loader;
}

if (typeof window !== 'undefined') {
    const n = Object.keys(modules).length;
    if (n === 0) {
        console.warn('[viz-loader] 0 visualizations matched — RESTART the dev server (import.meta.glob is compile-time).');
    } else {
        console.log(`[viz-loader] ${n} visualizations loaded`);
    }
}

/**
 * Resolves the loader function for a topic + filename stem.
 * Tries .htm then .html.
 */
function resolve(topicKey, vizFile) {
    if (!topicKey || !vizFile) return null;
    return (
        modules[`${topicKey}/${vizFile}.htm`] ||
        modules[`${topicKey}/${vizFile}.html`] ||
        null
    );
}

/** Loads the raw HTML content. Returns Promise<string|null>. */
export async function loadVizHtml(topicKey, vizFile) {
    const loader = resolve(topicKey, vizFile);
    if (!loader) return null;
    try {
        return await loader();
    } catch (err) {
        console.warn(`[viz-loader] failed to load ${topicKey}/${vizFile}:`, err);
        return null;
    }
}

/** Returns true if a visualization exists for this topic+stem. */
export function hasViz(topicKey, vizFile) {
    return !!resolve(topicKey, vizFile);
}
