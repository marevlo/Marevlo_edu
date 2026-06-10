/**
 * Course catalog generator — single source of truth.
 *
 * Walks public/cources/ for *.html lessons and emits src/data/courseCatalog.js:
 *   COURSE_TREE      nested cards (category > course > [track] > module leaf)
 *   COURSE_HTML_MAP  leafId -> served path (always a file that exists)
 *   COURSE_META      anyId  -> { label, group, category }
 *   COURSE_SIBLINGS  leafId -> [ordered sibling leaf ids]  (prev/next nav)
 *
 * Re-run any time content changes:  node scripts/generate-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const COURCES = path.join(PUBLIC, "cources");
const OUT = path.join(ROOT, "src/data/courseCatalog.js");

// ── Presentation overlay (top-level categories + gen-ai courses) ───────────────
// Folder name -> { label, icon, gradient, lineGradient, tag, tagColor }
const OVERLAY = {
  "generative_Ai":              { label: "Generative AI", icon: "Brain",       gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)", lineGradient: "from-indigo-500 via-purple-500 to-cyan-500", tag: "Hot 🔥", tagColor: "#ef4444" },
  "deep_learning":             { label: "Deep Learning",  icon: "Network",     gradient: "linear-gradient(135deg, #8b5cf6, #06b6d4)", lineGradient: "from-violet-500 via-purple-500 to-cyan-500", tag: "Expert", tagColor: "#8b5cf6" },
  "ml":                        { label: "Machine Learning", icon: "Brain",     gradient: "linear-gradient(135deg, #06b6d4, #6366f1)", lineGradient: "from-cyan-500 via-blue-500 to-indigo-500", tag: "Core", tagColor: "#06b6d4" },
  "pytorch":                   { label: "PyTorch",        icon: "Cpu",         gradient: "linear-gradient(135deg, #f97316, #ef4444)", lineGradient: "from-orange-500 via-red-500 to-rose-500", tag: "Hands-on", tagColor: "#f97316" },
  "stats":                     { label: "Statistics & Probability", icon: "FlaskConical", gradient: "linear-gradient(135deg, #0ea5e9, #14b8a6)", lineGradient: "from-sky-500 via-cyan-500 to-teal-500", tag: "Core", tagColor: "#0ea5e9" },
  "clus":                      { label: "Clustering",     icon: "Network",     gradient: "linear-gradient(135deg, #10b981, #06b6d4)", lineGradient: "from-emerald-500 via-teal-500 to-cyan-500", tag: "Data Science", tagColor: "#10b981" },
  "API security":             { label: "API Security",   icon: "Shield",      gradient: "linear-gradient(135deg, #f43f5e, #8b5cf6)", lineGradient: "from-rose-500 via-pink-500 to-violet-500", tag: "Security", tagColor: "#f43f5e" },
  // generative_Ai children (courses)
  "rag-final":                 { label: "RAG",            icon: "Database" },
  "agentic_ai":                { label: "Agentic AI",     icon: "Cpu" },
  "mcp":                       { label: "MCP",            icon: "Cpu" },
  "Tranformers":               { label: "Transformers",   icon: "Cpu" },
  "langgraph":                 { label: "LangGraph",      icon: "GitBranch" },
  "LLMOPS":                    { label: "LLMOps",         icon: "ServerCog" },
  "Prompt_engineering_improved": { label: "Prompt Engineering", icon: "Sparkles" },
};

// ── helpers ────────────────────────────────────────────────────────────────────
const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;

function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").trim();
}
function readTitle(absFile) {
  try {
    const head = fs.readFileSync(absFile, "utf8").slice(0, 4000);
    const m = head.match(TITLE_RE);
    if (!m) return null;
    // drop trailing site name after · | — (e.g. "… · NeuralNet Track", "… | Marevlo")
    let t = decodeEntities(m[1]).split(/\s+[·|]\s+/)[0].trim();
    return t || null;
  } catch { return null; }
}
const ACRONYMS = new Set([
  "rag", "ocr", "llm", "llms", "mcp", "dit", "vmi", "mfp", "dla", "gan", "gans",
  "cnn", "cnns", "rnn", "rnns", "mlp", "lstm", "gru", "moe", "ssm", "hpo",
  "api", "ai", "ml", "dl", "nlp", "gpt", "bert", "lcel", "rrf", "bm25", "hitl",
]);
function titleCaseWord(w) {
  const lw = w.toLowerCase();
  if (ACRONYMS.has(lw)) return w.toUpperCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}
function prettify(name) {
  let s = name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(titleCaseWord)
    .join(" ");
  // "Track 0 Foundation" -> "Track 0 · Foundation"; "Part 1 Foo" -> "Part 1 · Foo"
  s = s.replace(/^(Track|Part|Module)\s+(\d+(?:\.\d+)?)\s+(.+)$/i, "$1 $2 · $3");
  return s;
}
const usedIds = new Set();
function slugId(relPath) {
  let base = relPath.toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let id = base || "item";
  let n = 2;
  while (usedIds.has(id)) id = `${base}-${n++}`;
  usedIds.add(id);
  return id;
}
const isHtml = (f) => /\.html?$/i.test(f);
function hasHtmlDeep(abs) {
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) { if (hasHtmlDeep(path.join(abs, e.name))) return true; }
    else if (isHtml(e.name)) return true;
  }
  return false;
}

// ── recursive build ─────────────────────────────────────────────────────────────
const META = {};      // id -> { label, group, category }
const SIBLINGS = {};  // leafId -> [ids]
const HTML_MAP = {};  // leafId -> served path

function servedPath(absFile) {
  return "/" + path.relative(PUBLIC, absFile).split(path.sep).join("/");
}

function buildDir(abs, relFromCources, depth, categoryLabel) {
  const dirName = path.basename(abs);
  const ov = OVERLAY[dirName] || {};
  const label = ov.label || prettify(dirName);
  const id = slugId(relFromCources || dirName);

  const entries = fs.readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.name !== ".DS_Store")
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  const children = [];
  const leafIdsHere = [];
  for (const e of entries) {
    const childAbs = path.join(abs, e.name);
    const childRel = relFromCources ? `${relFromCources}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!hasHtmlDeep(childAbs)) continue;             // prune non-HTML branches
      const node = buildDir(childAbs, childRel, depth + 1, depth === 0 ? label : categoryLabel);
      children.push(node);
    } else if (isHtml(e.name)) {
      const leafId = slugId(childRel);
      const leafLabel = readTitle(childAbs) || prettify(e.name);
      HTML_MAP[leafId] = servedPath(childAbs);
      META[leafId] = { label: leafLabel, group: label, category: depth === 0 ? label : categoryLabel };
      leafIdsHere.push(leafId);
      children.push({
        id: leafId, label: leafLabel, isLeaf: true,
        iconName: "BookOpen", duration: "30m", level: "Intermediate",
      });
    }
  }
  // wire sibling lists for prev/next nav (leaves that share this parent)
  for (const lid of leafIdsHere) SIBLINGS[lid] = leafIdsHere;

  META[id] = { label, group: label, category: depth === 0 ? label : categoryLabel };

  const node = {
    id, label, isLeaf: false,
    iconName: ov.icon || (depth === 0 ? "Boxes" : "Layers"),
    description: `${label} — ${countLeaves(children)} lessons.`,
    level: "Intermediate",
    children,
  };
  if (depth === 0) {
    if (ov.gradient) node.gradient = ov.gradient;
    if (ov.lineGradient) node.lineGradient = ov.lineGradient;
    if (ov.tag) { node.tag = ov.tag; node.tagColor = ov.tagColor; }
  }
  return node;
}
function countLeaves(children) {
  let n = 0;
  for (const c of children) n += c.isLeaf ? 1 : countLeaves(c.children || []);
  return n;
}

// ── top level ─────────────────────────────────────────────────────────────────
const topEntries = fs.readdirSync(COURCES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== ".DS_Store")
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

const TREE = [];
for (const e of topEntries) {
  const abs = path.join(COURCES, e.name);
  if (!hasHtmlDeep(abs)) continue;
  TREE.push(buildDir(abs, e.name, 0, OVERLAY[e.name]?.label || prettify(e.name)));
}

// ── emit ─────────────────────────────────────────────────────────────────────
const banner = `// AUTO-GENERATED by scripts/generate-catalog.mjs — DO NOT EDIT BY HAND.\n// Re-run: node scripts/generate-catalog.mjs\n`;
const body =
  banner +
  `export const COURSE_TREE = ${JSON.stringify(TREE, null, 2)};\n\n` +
  `export const COURSE_HTML_MAP = ${JSON.stringify(HTML_MAP, null, 2)};\n\n` +
  `export const COURSE_META = ${JSON.stringify(META, null, 2)};\n\n` +
  `export const COURSE_SIBLINGS = ${JSON.stringify(SIBLINGS, null, 2)};\n`;
fs.writeFileSync(OUT, body);

const leafCount = Object.keys(HTML_MAP).length;
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
console.log(`  top categories : ${TREE.length}`);
console.log(`  leaf lessons   : ${leafCount}`);
console.log(`  tree nodes     : ${Object.keys(META).length}`);
TREE.forEach((t) => console.log(`   • ${t.label.padEnd(26)} ${countLeaves(t.children)} lessons`));
