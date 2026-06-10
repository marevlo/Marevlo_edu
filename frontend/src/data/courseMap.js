// Compatibility layer over the auto-generated catalog (scripts/generate-catalog.mjs).
// Keeps the original public API consumed by CourseContent.jsx:
//   COURSE_HTML_MAP, formatTitle(id), getGroup(id), getGroupSiblings(id)
import {
  COURSE_HTML_MAP,
  COURSE_META,
  COURSE_SIBLINGS,
} from "./courseCatalog";

export { COURSE_HTML_MAP };
export const COURSE_KEYS = Object.keys(COURSE_HTML_MAP);

const ACRONYMS = new Set([
  "rag", "ocr", "dl", "mlp", "cnn", "rnn", "lstm", "gru",
  "gpt", "nlp", "mcp", "vmi", "mfp", "dit", "dla", "gan",
  "hpo", "bert", "moe", "ssm", "api", "ai", "ml", "llm",
]);

// Human label for an id. Prefers the generated meta (real <title>), else slug-cases.
export function formatTitle(id = "") {
  const meta = COURSE_META[id];
  if (meta?.label) return meta.label;
  return id
    .split(/[-_]/)
    .map((w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

// { label, category, prefix } — prefix doubles as the course id for progress tracking.
export function getGroup(id = "") {
  const meta = COURSE_META[id];
  if (meta) return { label: meta.group, category: meta.category, prefix: meta.group };
  return { label: formatTitle(id), category: "Course", prefix: id };
}

// Ordered sibling leaf ids (drives prev / next navigation).
export function getGroupSiblings(id = "") {
  return COURSE_SIBLINGS[id] ?? [id];
}
