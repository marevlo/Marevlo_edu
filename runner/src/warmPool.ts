import { spawn, ChildProcess } from 'child_process';

export interface RunResult {
  stdout: string;
  stderr: string;
  statusCode: number;
}

interface QueueItem {
  code:    string;
  stdin:   string;
  timeoutMs?: number;
  memoryMb?: number;
  resolve: (r: RunResult) => void;
  timer:   NodeJS.Timeout;
}

// ── single worker wrapper ─────────────────────────────────────────────────────

/**
 * Wraps a single persistent child process.
 *
 * Protocol (line-delimited JSON over stdio):
 *   IN  → {"code":"...","stdin":"..."}
 *   OUT → {"stdout":"...","stderr":"...","statusCode":0}
 *
 * One request in-flight at a time; the WarmPool manages concurrency.
 */
class PoolWorker {
  proc!: ChildProcess;
  busy = false;

  private readBuf = '';
  private pendingResolve?: (r: RunResult) => void;
  private dead = false;

  constructor(
    private readonly cmd:       string,
    private readonly args:      string[],
    private readonly onFreed:   () => void,
  ) {
    this.spawn();
  }

  private spawn(): void {
    this.proc = spawn(this.cmd, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.readBuf += chunk.toString('utf8');
      const nl = this.readBuf.indexOf('\n');
      if (nl === -1) return;

      const line     = this.readBuf.slice(0, nl);
      this.readBuf   = this.readBuf.slice(nl + 1);

      const resolve  = this.pendingResolve;
      this.pendingResolve = undefined;
      this.busy = false;

      if (resolve) {
        try {
          resolve(JSON.parse(line) as RunResult);
        } catch {
          resolve({ stdout: '', stderr: 'Worker returned malformed JSON', statusCode: 1 });
        }
        this.onFreed();
      }
    });

    this.proc.on('exit', () => {
      if (this.dead) return;

      // Resolve any pending request with an error
      const resolve = this.pendingResolve;
      this.pendingResolve = undefined;
      this.busy = false;
      if (resolve) {
        resolve({ stdout: '', stderr: 'Worker process exited unexpectedly', statusCode: 1 });
        this.onFreed();
      }

      // Respawn
      setTimeout(() => this.spawn(), 250);
    });
  }

  execute(code: string, stdin: string, timeoutMs?: number, memoryMb?: number): Promise<RunResult> {
    this.busy = true;
    return new Promise(resolve => {
      this.pendingResolve = resolve;
      const payload = JSON.stringify({ code, stdin, timeoutMs, memoryMb });
      try {
        this.proc.stdin!.write(payload + '\n');
      } catch {
        this.pendingResolve = undefined;
        this.busy = false;
        resolve({ stdout: '', stderr: 'Failed to write to worker stdin', statusCode: 1 });
      }
    });
  }

  destroy() {
    this.dead = true;
    try { this.proc.kill(); } catch { /* ignore */ }
  }
}

// ── pool ──────────────────────────────────────────────────────────────────────

/**
 * WarmPool — N persistent PoolWorker processes.
 *
 * Requests are dispatched to a free worker immediately.
 * If all workers are busy, the request is queued with a timeout.
 */
export class WarmPool {
  private readonly workers: PoolWorker[];
  private readonly queue:   QueueItem[] = [];

  constructor(
    cmd:      string,
    args:     string[],
    poolSize: number,
  ) {
    this.workers = Array.from({ length: poolSize }, () =>
      new PoolWorker(cmd, args, () => this.drainQueue()),
    );
  }

  private drainQueue() {
    if (this.queue.length === 0) return;
    const worker = this.workers.find(w => !w.busy);
    if (!worker) return;

    const item = this.queue.shift()!;
    clearTimeout(item.timer);
    worker.execute(item.code, item.stdin, item.timeoutMs, item.memoryMb).then(item.resolve);
  }

  execute(code: string, stdin: string, timeoutMs = 20_000, memoryMb?: number): Promise<RunResult> {
    const worker = this.workers.find(w => !w.busy);
    if (worker) {
      return worker.execute(code, stdin, timeoutMs, memoryMb);
    }

    // All workers busy — queue the request
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex(i => i.resolve === resolve);
        if (idx !== -1) this.queue.splice(idx, 1);
        resolve({ stdout: '', stderr: 'Queue timeout: too many concurrent requests', statusCode: -1 });
      }, timeoutMs);

      this.queue.push({ code, stdin, timeoutMs, memoryMb, resolve, timer });
    });
  }

  get stats() {
    return {
      poolSize: this.workers.length,
      busy:     this.workers.filter(w => w.busy).length,
      queued:   this.queue.length,
    };
  }

  destroy() {
    this.workers.forEach(w => w.destroy());
  }
}
