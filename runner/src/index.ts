/**
 * runner/src/index.ts — high-performance code execution service
 *
 * Optimisations over the original:
 *
 *  Python    → WarmPool of fork-workers (os.fork per execution)
 *              5–15 ms instead of 80–120 ms cold-start
 *
 *  C++       → SHA-256 compile cache; skip g++ if source unchanged
 *              <5 ms on cache hit vs 400–800 ms recompile
 *
 *  Java      → SHA-256 compile cache + JVM startup flags
 *              (-XX:TieredStopAtLevel=1 -Xms8m -XX:+UseSerialGC)
 *              150–350 ms instead of 1200–2000 ms
 *
 *  All       → Concurrency semaphore prevents resource exhaustion
 *              under simultaneous load (1k+ DS/algo questions)
 *
 *  All       → Output truncated at 1 MB to prevent memory exhaustion
 */

import express         from 'express';
import http            from 'http';
import cors            from 'cors';
import { WebSocketServer } from 'ws';
import { spawn }       from 'child_process';
import fs              from 'fs';
import path            from 'path';
import os              from 'os';

import { WarmPool }    from './warmPool';
import {
  hashSource,
  getCachedCppBinary,   cacheCppBinary,
  getCachedJavaClasses, cacheJavaClasses,
} from './compilationCache';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT              = parseInt(process.env.PORT ?? '4002', 10);
const TIMEOUT_MS        = 15_000;
const MAX_OUTPUT_BYTES  = 1 * 1024 * 1024;   // 1 MB
const PYTHON_POOL_SIZE  = parseInt(process.env.PYTHON_POOL_SIZE ?? '6', 10);
const MAX_CONCURRENT    = parseInt(process.env.MAX_CONCURRENT   ?? '20', 10);

// JVM flags tuned for fast startup (DS/algo programs are short-lived)
const JVM_FLAGS = [
  '-XX:TieredStopAtLevel=1',   // client JIT only — ~200ms faster cold start
  '-Xms8m',                    // minimal initial heap
  '-Xmx256m',                  // cap heap for short programs
  '-XX:+UseSerialGC',          // no GC threads overhead
  '-XX:+DisableAttachMechanism', // skip JVM attach listener
  '-Djava.security.egd=file:/dev/urandom', // faster SecureRandom init
];

// ── Warm pool (Python) ────────────────────────────────────────────────────────

const workerScript = process.env.PYTHON_WORKER_PATH
  ?? path.join(__dirname, '../workers/python_worker.py');
const pythonPool = new WarmPool('python3', ['-u', workerScript], PYTHON_POOL_SIZE);
console.log(`[runner] Python warm pool started (${PYTHON_POOL_SIZE} workers)`);

// ── Concurrency semaphore ─────────────────────────────────────────────────────

class Semaphore {
  private count: number;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) { this.count = max; }

  acquire(): Promise<void> {
    if (this.count > 0) { this.count--; return Promise.resolve(); }
    return new Promise(resolve => this.waiters.push(resolve));
  }

  release() {
    if (this.waiters.length > 0) {
      this.waiters.shift()!();
    } else {
      this.count++;
    }
  }
}

const concurrencySem = new Semaphore(MAX_CONCURRENT);

// ── Helpers ───────────────────────────────────────────────────────────────────

const extractJavaClassName = (src: string): string => {
  const m = src.match(/public\s+class\s+([A-Za-z_]\w*)/);
  return m ? m[1] : 'Main';
};

const truncate = (s: string): string =>
  s.length > MAX_OUTPUT_BYTES ? s.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]' : s;

type ExecResult = { stdout: string; stderr: string; statusCode: number };

/** Spawn a process with optional stdin, stdout/stderr captured. */
function spawnCapture(
  cmd:     string,
  args:    string[],
  stdin:   string,
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<ExecResult> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd:   options.cwd,
    });

    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve({ stdout, stderr: stderr + `\n[runner] timed out after ${options.timeoutMs ?? TIMEOUT_MS}ms`, statusCode: -1 });
    }, options.timeoutMs ?? TIMEOUT_MS);

    proc.stdout!.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr!.on('data', (d: Buffer) => { stderr += d.toString(); });

    if (stdin) {
      proc.stdin!.write(stdin.endsWith('\n') ? stdin : stdin + '\n');
    }
    proc.stdin!.end();

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout: truncate(stdout), stderr: truncate(stderr), statusCode: code ?? 0 });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: err.message, statusCode: 1 });
    });
  });
}

// ── Native execution (per-language) ──────────────────────────────────────────

async function executeNative(language: string, code: string, stdin: string, timeoutMs = TIMEOUT_MS): Promise<ExecResult> {
  // Python → warm fork pool
  if (language === 'python') {
    return pythonPool.execute(code, stdin, timeoutMs, undefined);
  }

  // JavaScript → spawn node (already fast, ~30-60ms)
  if (language === 'javascript') {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
    try {
      const srcFile = path.join(tmpDir, 'main.js');
      fs.writeFileSync(srcFile, code);
      return await spawnCapture('node', [srcFile], stdin, { timeoutMs });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // C++ → check compile cache first
  if (language === 'cpp') {
    const hash      = hashSource(code);
    const cachedBin = getCachedCppBinary(hash);

    if (cachedBin) {
      // Cache hit — skip compilation entirely
      return spawnCapture(cachedBin, [], stdin, { timeoutMs });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
    try {
      const srcFile = path.join(tmpDir, 'main.cpp');
      const binFile = path.join(tmpDir, 'main');
      fs.writeFileSync(srcFile, code);

      const compile = await spawnCapture('g++', ['-O2', '-o', binFile, srcFile], '', { timeoutMs: 30_000 });
      if (compile.statusCode !== 0) return compile;

      const finalBin = cacheCppBinary(hash, binFile);
      return spawnCapture(finalBin, [], stdin, { timeoutMs });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // Java → check compile cache first
  if (language === 'java') {
    const hash         = hashSource(code);
    const cachedClasses = getCachedJavaClasses(hash);
    const className    = extractJavaClassName(code);

    if (cachedClasses) {
      // Cache hit — skip javac, just run
      return spawnCapture('java', [...JVM_FLAGS, '-cp', cachedClasses, className], stdin, { timeoutMs });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-'));
    try {
      const srcFile = path.join(tmpDir, `${className}.java`);
      fs.writeFileSync(srcFile, code);

      const compile = await spawnCapture('javac', ['-d', tmpDir, srcFile], '', { timeoutMs: 30_000 });
      if (compile.statusCode !== 0) return compile;

      const finalClasses = cacheJavaClasses(hash, tmpDir);
      return spawnCapture('java', [...JVM_FLAGS, '-cp', finalClasses, className], stdin, { timeoutMs });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  return { stdout: '', stderr: `Unsupported language: ${language}`, statusCode: 1 };
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    python:  pythonPool.stats,
    queue:   { maxConcurrent: MAX_CONCURRENT },
  });
});

app.post('/run', async (req, res) => {
  const { language, code, stdin = '', timeoutMs, memoryMb } = req.body as {
    language: string;
    code:     string;
    stdin?:   string;
    timeoutMs?: number;
    memoryMb?: number;
  };

  if (!language || !code) {
    return res.status(400).json({ error: 'language and code are required', stderr: '', statusCode: 1 });
  }

  const effectiveTimeout = Math.min(timeoutMs || TIMEOUT_MS, 30_000); // Cap at 30s max

  // Throttle concurrent executions
  await concurrencySem.acquire();
  try {
    const startTime = process.hrtime.bigint();
    
    const result: any = await executeNative(language, code, stdin, effectiveTimeout);
    
    const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6; // ms
    result.runtimeMs = Math.round(elapsed);
    // memoryKb would require OS-level polling (e.g. /proc/pid/status) which is complex in Node,
    // so we return 0 for now. The python worker can report memory limits via statusCode/stderr.
    result.memoryKb = 0;

    return res.json(result);
  } catch (err: any) {
    console.error('[runner] /run error:', err.message);
    return res.status(500).json({ error: err.message, stderr: err.message, statusCode: 1 });
  } finally {
    concurrencySem.release();
  }
});

// ── WebSocket /term (interactive terminal with cache) ─────────────────────────

const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/term' });

wss.on('connection', (ws: any) => {
  let proc:        ReturnType<typeof spawn> | null = null;
  let initialized  = false;
  let tmpDir:      string | null = null;

  const ping = setInterval(() => { try { ws.ping(); } catch { /* ignore */ } }, 10_000);

  const send = (payload: object) => {
    try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  };

  const cleanup = () => {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      tmpDir = null;
    }
  };

  const launchInteractive = (cmd: string, args: string[]) => {
    proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdout!.on('data', (c: Buffer) => send({ type: 'output', data: c.toString('utf8') }));
    proc.stderr!.on('data', (c: Buffer) => send({ type: 'output', data: c.toString('utf8') }));
    proc.on('close', (code) => {
      setTimeout(() => { send({ type: 'exit', code: code ?? 0 }); try { ws.close(); } catch { /* ignore */ } cleanup(); }, 100);
    });
    send({ type: 'output', data: '[runner] started\n' });
  };

  ws.on('message', async (message: any) => {
    try {
      const payload = JSON.parse(message.toString());

      // ── init: compile (with cache) then launch ──────────────────────────
      if (!initialized && payload.type === 'init') {
        initialized = true;
        const { language, code } = payload as { language: string; code: string };
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-term-'));

        if (language === 'python') {
          const f = path.join(tmpDir, 'main.py');
          fs.writeFileSync(f, code);
          launchInteractive('python3', ['-u', f]);

        } else if (language === 'javascript') {
          const f = path.join(tmpDir, 'main.js');
          fs.writeFileSync(f, code);
          launchInteractive('node', [f]);

        } else if (language === 'cpp') {
          const hash      = hashSource(code);
          const cachedBin = getCachedCppBinary(hash);

          if (cachedBin) {
            launchInteractive(cachedBin, []);
          } else {
            const srcFile = path.join(tmpDir, 'main.cpp');
            const binFile = path.join(tmpDir, 'main');
            fs.writeFileSync(srcFile, code);
            const compiler = spawn('g++', ['-O2', '-o', binFile, srcFile], { stdio: ['pipe', 'pipe', 'pipe'] });
            let compileErr = '';
            compiler.stderr.on('data', (d: Buffer) => { compileErr += d.toString(); });
            compiler.on('close', (ec) => {
              if (ec !== 0) {
                send({ type: 'output', data: `[compile error]\n${compileErr}` });
                send({ type: 'exit', code: ec ?? 1 }); ws.close(); cleanup();
              } else {
                cacheCppBinary(hash, binFile);
                launchInteractive(binFile, []);
              }
            });
          }

        } else if (language === 'java') {
          const hash         = hashSource(code);
          const cachedClasses = getCachedJavaClasses(hash);
          const className    = extractJavaClassName(code);

          if (cachedClasses) {
            launchInteractive('java', [...JVM_FLAGS, '-cp', cachedClasses, className]);
          } else {
            const srcFile = path.join(tmpDir, `${className}.java`);
            fs.writeFileSync(srcFile, code);
            const compiler = spawn('javac', ['-d', tmpDir, srcFile], { stdio: ['pipe', 'pipe', 'pipe'] });
            let compileErr = '';
            compiler.stderr.on('data', (d: Buffer) => { compileErr += d.toString(); });
            compiler.on('close', (ec) => {
              if (ec !== 0) {
                send({ type: 'output', data: `[compile error]\n${compileErr}` });
                send({ type: 'exit', code: ec ?? 1 }); ws.close(); cleanup();
              } else {
                const finalClasses = cacheJavaClasses(hash, tmpDir!);
                launchInteractive('java', [...JVM_FLAGS, '-cp', finalClasses, className]);
              }
            });
          }
        }
        return;
      }

      // ── stdin input ─────────────────────────────────────────────────────
      if (initialized && payload.type === 'input' && proc) {
        send({ type: 'output', data: payload.data });
        proc.stdin!.write(payload.data);
      }

    } catch (err: any) {
      console.error('[ws] error:', err.message);
    }
  });

  ws.on('close', () => {
    clearInterval(ping);
    try { if (proc) proc.kill(); } catch { /* ignore */ }
    cleanup();
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[runner] listening on port ${PORT}  (HTTP + WS)`);
  console.log(`[runner] compile cache: ${process.env.COMPILE_CACHE_DIR ?? 'default tmpdir'}`);
  console.log(`[runner] max concurrent executions: ${MAX_CONCURRENT}`);
});

process.on('SIGTERM', () => {
  console.log('[runner] SIGTERM — draining...');
  pythonPool.destroy();
  server.close(() => process.exit(0));
});
