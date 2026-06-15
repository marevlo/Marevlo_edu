// Generates src/assets/problems-manifest.json — the lightweight index the
// problem-list views render from.
//
// Why: the list views only need ~6 small fields per problem, but importing
// every problem JSON to get them meant ~750 network requests / >3 MB on
// first visit to /problems. The manifest is one small file; full problem
// JSONs now load individually only when a problem is opened in the IDE
// (see utils/topicsLoader.js).
//
// Wired into `predev`/`prebuild` in package.json so it can't go stale.
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../src/assets');
const OUT_FILE = path.join(ASSETS_DIR, 'problems-manifest.json');

const dirents = await readdir(ASSETS_DIR, { withFileTypes: true });
const topicDirs = dirents.filter(d => d.isDirectory()).map(d => d.name).sort();

const entries = [];
for (const topic of topicDirs) {
    const files = (await readdir(path.join(ASSETS_DIR, topic)))
        .filter(f => f.toLowerCase().endsWith('.json'))
        .sort(); // mirror import.meta.glob's alphabetical enumeration
    for (const file of files) {
        const full = path.join(ASSETS_DIR, topic, file);
        let problem;
        try {
            problem = JSON.parse(await readFile(full, 'utf8'));
        } catch (err) {
            console.error(`SKIP (invalid JSON): ${topic}/${file} — ${err.message}`);
            continue;
        }
        const vizFile = file.replace(/\.json$/i, '');
        entries.push({
            id:         problem.id         ?? `../assets/${topic}/${file}`,
            title:      problem.title      || 'Untitled',
            difficulty: problem.difficulty || 'Medium',
            category:   problem.category   || topic,
            tags:       problem.tags       || [],
            likes:      problem.likes      ?? 0,
            vizFile,
            topicKey:   topic,
        });
    }
}

await writeFile(OUT_FILE, JSON.stringify(entries));
const kb = (Buffer.byteLength(JSON.stringify(entries)) / 1024).toFixed(1);
console.log(`problems-manifest.json: ${entries.length} problems across ${topicDirs.length} topics, ${kb} KB`);
