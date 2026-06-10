#!/usr/bin/env python3
"""
python_worker.py — warm-fork Python executor.

The warm pool in warmPool.ts keeps N of these processes alive.
For every execution request:
  1. Parent reads a JSON line from stdin  { "code": "...", "stdin": "..." }
  2. Parent os.fork()s a child
  3. Child executes the user code with redirected stdout/stderr/stdin
  4. Child writes a JSON result line to the write end of a pipe and exits
  5. Parent reads the result, writes it to stdout, and loops back to step 1

Why fork() and not subprocess.Popen?
  fork() copies the already-initialised Python interpreter (~60-100 ms startup)
  into the child at ~1-2 ms.  Popen would pay the full interpreter boot cost again.
  That's the entire point of this architecture.

Security:
  Each user code run gets its own process (full isolation).
  The parent never executes user code — it just forks.
  RLIMIT_AS caps memory.  SIGALRM caps wall-clock time.
"""

import os, sys, json, signal, io, traceback, resource

TIMEOUT_SECS   = 12
MAX_OUTPUT_B   = 1 * 1024 * 1024   # 1 MB stdout limit per run
MAX_STDERR_B   = 64 * 1024          # 64 KB stderr limit
MAX_MEMORY_MB  = 256                # 256 MB virtual address space (default)

# ── child execution ────────────────────────────────────────────────────────────

def _run_child(code: str, stdin_data: str, write_fd: int, timeout_secs: int = TIMEOUT_SECS, memory_mb: int = MAX_MEMORY_MB) -> None:
    """Runs inside the forked child. Never returns (always os._exit)."""
    # Detach into a new session/process-group so the parent can SIGKILL the
    # ENTIRE subtree on timeout (killpg), not just this pid. Without this, any
    # grandchildren the user code spawns survive the timeout as orphans.
    try:
        os.setsid()
    except Exception:
        pass
    # Apply resource caps
    try:
        memory_bytes = memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    except Exception:
        pass
    # Cap total bytes any single file the child writes can reach (defends
    # /tmp and the shared compile cache against being filled by user code).
    try:
        max_file_bytes = 64 * 1024 * 1024  # 64 MB
        resource.setrlimit(resource.RLIMIT_FSIZE, (max_file_bytes, max_file_bytes))
    except Exception:
        pass

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    sys.stdin  = io.StringIO(stdin_data)
    sys.stdout = stdout_buf
    sys.stderr = stderr_buf

    exit_code = 0
    try:
        exec(compile(code, '<user>', 'exec'), {'__name__': '__main__'})  # noqa: S102
    except MemoryError:
        sys.stderr.write("Memory limit exceeded\n")
        exit_code = 1
    except SystemExit as e:
        exit_code = int(e.code) if isinstance(e.code, int) else 0
    except BaseException:                                                 # noqa: BLE001
        sys.stderr.write(traceback.format_exc())
        exit_code = 1

    result = json.dumps({
        'stdout':     stdout_buf.getvalue()[:MAX_OUTPUT_B],
        'stderr':     stderr_buf.getvalue()[:MAX_STDERR_B],
        'statusCode': exit_code,
    })

    try:
        os.write(write_fd, (result + '\n').encode())
    except Exception:
        pass
    os._exit(exit_code)

# ── parent logic ───────────────────────────────────────────────────────────────

def _run_in_fork(code: str, stdin_data: str, timeout_secs: int = TIMEOUT_SECS, memory_mb: int = MAX_MEMORY_MB) -> dict:
    r_fd, w_fd = os.pipe()
    pid = os.fork()

    if pid == 0:
        os.close(r_fd)
        _run_child(code, stdin_data, w_fd, timeout_secs, memory_mb)
        # _run_child always os._exit; this line is unreachable
        os._exit(1)

    # ── parent ────────────────────────────────────────────────────────────────
    os.close(w_fd)

    timed_out = False

    def _alarm_handler(signum, frame):     # noqa: ARG001
        nonlocal timed_out
        timed_out = True
        # Child called setsid(), so its pgid == its pid. Killing the group
        # takes down any descendants (e.g. an attempted fork bomb), not just
        # the direct child.
        try:
            os.killpg(pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    old_handler = signal.signal(signal.SIGALRM, _alarm_handler)
    signal.alarm(timeout_secs)

    chunks: list[bytes] = []
    with os.fdopen(r_fd, 'rb') as r:
        while True:
            chunk = r.read(4096)
            if not chunk:
                break
            chunks.append(chunk)

    signal.alarm(0)
    signal.signal(signal.SIGALRM, old_handler)

    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass

    if timed_out:
        return {'stdout': '', 'stderr': f'Timed out after {timeout_secs}s', 'statusCode': -1}

    raw = b''.join(chunks).decode('utf-8', errors='replace').strip()
    if not raw:
        return {'stdout': '', 'stderr': 'Worker produced no output', 'statusCode': 1}

    return json.loads(raw)

# ── main loop ─────────────────────────────────────────────────────────────────

def main() -> None:
    # Restore real stdio so our JSON protocol uses the original file descriptors
    real_stdin  = os.fdopen(sys.stdin.fileno(),  'rb', buffering=0)
    real_stdout = os.fdopen(sys.stdout.fileno(), 'wb', buffering=0)

    buf = b''
    while True:
        # Read until newline (one JSON request per line)
        while b'\n' not in buf:
            chunk = real_stdin.read(4096)
            if not chunk:
                return            # parent closed stdin → exit cleanly
            buf += chunk

        nl = buf.index(b'\n')
        line = buf[:nl]
        buf  = buf[nl + 1:]

        line = line.strip()
        if not line:
            continue

        try:
            req    = json.loads(line)
            timeout_ms = req.get('timeoutMs', TIMEOUT_SECS * 1000)
            timeout_secs = max(1, min(timeout_ms // 1000, 60))  # Convert to secs, min 1s, max 60s
            memory_mb = req.get('memoryMb', MAX_MEMORY_MB)
            result = _run_in_fork(req.get('code', ''), req.get('stdin', ''), timeout_secs, memory_mb)
        except Exception as e:
            result = {'stdout': '', 'stderr': str(e), 'statusCode': 1}

        real_stdout.write((json.dumps(result) + '\n').encode())
        real_stdout.flush()


if __name__ == '__main__':
    main()
