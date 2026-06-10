/**
 * topicsLoader.js
 * Dynamically loads all problem JSON files from src/assets/** using Vite's
 * import.meta.glob and groups them into topic objects for ProblemList.jsx.
 *
 * Expected topic shape:
 *   { id, name, icon, problems: [{ id, title, difficulty, category, ... }] }
 */

// Lazily import every JSON file nested under src/assets/
// Using lazy (non-eager) glob so the 750 JSON files are NOT bundled into the main chunk.
// They are loaded on demand when loadAllTopics() is first called.
const modules = import.meta.glob('../assets/**/*.json');

// Map folder names (lowercase kebab-case) to display names + emoji icons.
// Folder naming convention: all lowercase, words separated by hyphens.
// Viz folder names mirror asset folder names exactly under public/visualizations/.
const TOPIC_META = {
  'arrays':                 { name: 'Arrays',                 icon: '📊' },
  'binary-trees':           { name: 'Binary Trees',           icon: '🌳' },
  'dynamic-programming':    { name: 'Dynamic Programming',    icon: '⚡' },
  'graph':                  { name: 'Graph',                  icon: '🕸️' },
  'linked-list':            { name: 'Linked List',            icon: '🔗' },
  'maths':                  { name: 'Maths',                  icon: '➗' },
  'recursion':              { name: 'Recursion',              icon: '🔄' },
  'searching-and-sorting':  { name: 'Searching & Sorting',    icon: '🔍' },
  'stack-queue-and-heap':   { name: 'Stacks, Queues & Heaps', icon: '📚' },
  'string':                 { name: 'String',                 icon: '🔤' },
  'trie':                   { name: 'Trie',                   icon: '🌿' },
};

/**
 * Parses the glob path to extract the topic folder name.
 * e.g. "../assets/binary-trees/01_foo.json" → "binary-trees"
 */
function extractTopicKey(path) {
  // path looks like: ../assets/FOLDER_NAME/filename.json
  const parts = path.split('/');
  // parts: ['..', 'assets', 'FOLDER_NAME', 'filename.json']
  if (parts.length >= 4) {
    return parts[2];  // already lowercase kebab-case after folder rename
  }
  return 'other';
}

let cachedTopics = null;
const LOAD_BATCH_SIZE = 24;

/**
 * Loads all topics by grouping the lazily-imported JSON modules by folder.
 * Results are cached after the first call — subsequent calls are instant.
 */
export async function loadAllTopics() {
  if (cachedTopics) return cachedTopics;

  const entries = Object.entries(modules);
  const loaded = [];

  for (let i = 0; i < entries.length; i += LOAD_BATCH_SIZE) {
    const batch = entries.slice(i, i + LOAD_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(([path, loader]) => loader().then(mod => ({ path, problem: mod.default ?? mod })))
    );
    loaded.push(...batchResults);
  }

  const topicsMap = {};
  for (const { path, problem } of loaded) {
    const topicKey = extractTopicKey(path);

    if (!topicsMap[topicKey]) {
      const meta = TOPIC_META[topicKey] || {
        name: topicKey.charAt(0).toUpperCase() + topicKey.slice(1),
        icon: '📁',
      };
      topicsMap[topicKey] = {
        id: topicKey,
        name: meta.name,
        icon: meta.icon,
        problems: [],
      };
    }

    // Extract the filename stem (e.g. "01_binary_tree_cameras") for viz URL building
    const parts = path.split('/');
    const vizFile = parts[parts.length - 1].replace(/\.json$/i, '');

    // Extract just the lightweight fields needed for the list view
    topicsMap[topicKey].problems.push({
      id:         problem.id         || path,
      title:      problem.title      || 'Untitled',
      difficulty: problem.difficulty || 'Medium',
      category:   problem.category   || topicKey,
      tags:       problem.tags       || [],
      // Visualization helpers — used by ProblemPanel to build the iframe src
      _vizFile:   vizFile,
      _topicKey:  topicKey,
      // Keep the full problem data attached so the IDE can use it later
      _raw: problem,
    });
  }

  // Sort topics alphabetically, then sort problems within each topic by filename order
  cachedTopics = Object.values(topicsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return cachedTopics;
}
