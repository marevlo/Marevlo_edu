// Auto-run wrappers appended to user code when autoWrapReturn is enabled.
// Kept here so the templates can be updated without touching IDE.jsx.

export const PYTHON_AUTORUN_WRAPPER = `

# --- Auto runner: parse stdin assignments and call a likely function ---
import sys
import inspect
import ast

def _parse_assignments(text):
    text = (text or '').strip()
    if not text:
        return {}, []
    parts = []
    buf = []
    depth = 0
    in_str = False
    esc = False
    for ch in text:
        if in_str:
            buf.append(ch)
            if esc:
                esc = False
            elif ch == '\\\\':
                esc = True
            elif ch in ('"', "'"):
                in_str = False
            continue
        if ch in ('"', "'"):
            in_str = True
            buf.append(ch)
            continue
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth = max(0, depth - 1)
        if ch == ',' and depth == 0:
            part = ''.join(buf).strip()
            if part:
                parts.append(part)
            buf = []
        else:
            buf.append(ch)
    last = ''.join(buf).strip()
    if last:
        parts.append(last)
    result = {}
    ordered = []
    for part in parts:
        if '=' not in part:
            continue
        name, value = part.split('=', 1)
        name = name.strip()
        value = value.strip()
        try:
            parsed = ast.literal_eval(value)
            result[name] = parsed
            ordered.append(parsed)
        except Exception:
            result[name] = value
            ordered.append(value)
    return result, ordered

def _pick_function(funcs, vars_dict):
    if 'solve' in globals() and callable(globals().get('solve')):
        return globals()['solve'], 'solve'
    if 'main' in globals() and callable(globals().get('main')):
        return globals()['main'], 'main'
    if not funcs:
        return None, None
    if len(funcs) == 1:
        return funcs[0], funcs[0].__name__
    best = None
    best_score = -1
    for f in funcs:
        try:
            params = inspect.signature(f).parameters
            score = sum(1 for k in params.keys() if k in vars_dict)
            if score > best_score:
                best = f
                best_score = score
        except Exception:
            continue
    return best, best.__name__ if best else (None, None)

try:
    _stdin = sys.stdin.read()
    _vars, _ordered = _parse_assignments(_stdin)
    _funcs = [v for v in globals().values() if inspect.isfunction(v) and v.__module__ == '__main__']
    _fn, _name = _pick_function(_funcs, _vars)
    _res = None
    if _fn:
        try:
            _sig = inspect.signature(_fn)
            if _sig.parameters:
                _args = []
                _i = 0
                for k in _sig.parameters.keys():
                    if k in _vars:
                        _args.append(_vars.get(k))
                    elif _i < len(_ordered):
                        _args.append(_ordered[_i])
                        _i += 1
                    else:
                        _args.append(None)
                _res = _fn(*_args)
            else:
                _res = _fn()
        except Exception:
            _res = None
    elif 'solve' in globals():
        _res = solve(_stdin)
    print(_res)
except Exception:
    pass
`;

export const JS_AUTORUN_WRAPPER = `

// --- Auto print return value if solve(data) exists ---
try {
  if (typeof solve === 'function') {
    const fs = require('fs');
    const _data = fs.readFileSync(0, 'utf8');
    const _res = solve(_data);
    if (_res !== undefined) process.stdout.write(String(_res));
  }
} catch (e) {}
`;
