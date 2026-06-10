import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Disk-backed compile cache keyed by SHA-256(source).
 *
 * DS/algo workloads hit the same solutions repeatedly:
 *   - user fixes a bug and re-runs → same compiled artifact
 *   - multiple users solve the same problem → shared cache hit
 *
 * C++  : stores the compiled ELF binary
 * Java : stores the directory of .class files
 *
 * LRU eviction keeps the cache bounded.
 */

const CACHE_DIR =
  process.env.COMPILE_CACHE_DIR ?? path.join(os.tmpdir(), 'runner-compile-cache');

const MAX_ENTRIES = 400; // tune based on available disk

// ── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(): string {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  return CACHE_DIR;
}

export function hashSource(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex').slice(0, 24);
}

// Touch (update mtime) so LRU eviction sees this as recently used
function touch(p: string) {
  try {
    const now = new Date();
    fs.utimesSync(p, now, now);
  } catch { /* ignore */ }
}

// ── C++ ───────────────────────────────────────────────────────────────────────

export function getCachedCppBinary(hash: string): string | null {
  const p = path.join(ensureDir(), `cpp_${hash}`);
  if (fs.existsSync(p)) { touch(p); return p; }
  return null;
}

export function cacheCppBinary(hash: string, compiledBin: string): string {
  const dst = path.join(ensureDir(), `cpp_${hash}`);
  fs.copyFileSync(compiledBin, dst);
  fs.chmodSync(dst, 0o755);
  setImmediate(evict);
  return dst;
}

// ── Java ─────────────────────────────────────────────────────────────────────

export function getCachedJavaClasses(hash: string): string | null {
  const d = path.join(ensureDir(), `java_${hash}`);
  if (fs.existsSync(d)) { touch(d); return d; }
  return null;
}

export function cacheJavaClasses(hash: string, classDir: string): string {
  const dst = path.join(ensureDir(), `java_${hash}`);
  if (fs.existsSync(dst)) return dst;          // concurrent request already wrote it
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(classDir).filter(f => f.endsWith('.class'))) {
    fs.copyFileSync(path.join(classDir, f), path.join(dst, f));
  }
  setImmediate(evict);
  return dst;
}

// ── LRU eviction ─────────────────────────────────────────────────────────────

function evict() {
  try {
    const dir = ensureDir();
    const raw = fs.readdirSync(dir);
    if (raw.length <= MAX_ENTRIES) return;

    const entries = raw
      .map(name => {
        try { return { name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }; }
        catch { return null; }
      })
      .filter(Boolean) as { name: string; mtime: number }[];

    entries.sort((a, b) => a.mtime - b.mtime);          // oldest first
    for (const e of entries.slice(0, entries.length - MAX_ENTRIES)) {
      const p = path.join(dir, e.name);
      try {
        if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true });
        else fs.unlinkSync(p);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}
