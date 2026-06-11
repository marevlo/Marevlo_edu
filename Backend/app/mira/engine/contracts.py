"""Per-intent response contracts and the walkthrough generation pipeline.

Given a Classification, build_contract() returns the system-prompt suffix that
makes the answer model produce the right SHAPE for that intent. The shared
identity (level, style, memory) is prepended by the caller.

The walkthrough pipeline (LEARN intent) is a 2-call design:
  call 1: plan + generate the whole walkthrough scaffold as structured JSON
  call 2 (cheap): not a model call — local visual-template selection per step
"""
from __future__ import annotations

import json
import re
from .intent import Intent, Classification


SHARED_IDENTITY = """You are MIRA, a tutor and engineering collaborator for
computer science, AI, and coding. You help learners understand and professionals
build. Be crisp — never pad. Adapt depth to the learner's level. Code must be
correct and runnable. Never refuse a CS/AI/coding request because of its domain.

OUTPUT FORMAT (critical — your reply is parsed as strict JSON):
- Reply with ONE JSON value only. No markdown fences, no text before or after it.
- Write everything in PLAIN TEXT. Write math in PLAIN WORDS, NEVER LaTeX. Do NOT
  use dollar signs or backslash commands such as \\sum, \\frac, \\alpha, \\theta —
  a backslash breaks the JSON and the whole answer fails. Write "sum of w_i*x_i + b"
  or "w·x + b", never "$\\sum w_i x_i + b$".

This learner:
- level on this topic: {level}
- explanation style that works for them: {style}
- what you know about them: {memory}
"""


# ---------- per-intent contracts ----------
_CONTRACTS = {
    Intent.LEARN: """
INTENT: LEARN — produce a paced WALKTHROUGH as a JSON object:
{"format":"walkthrough",
 "steps":[{"title":"<=6 words",
           "explanation":"<=3 short sentences, plain text",
           "takeaway":"1 sentence",
           "equations":[{"lab":"<=4 word label","f":"the formula in plain text/words, e.g. w·x + b — NEVER LaTeX, no dollar signs, no backslash commands"}],
           "visual":{"template":"...","labels":{...}}}],
 "follow_ups":["go deeper","compare","apply"]}

STEP COUNT — DYNAMIC, never a fixed number:
- Use as FEW or as MANY steps as the question genuinely needs: between {min_steps} and {max_steps}.
- A simple/narrow question may finish in {min_steps} steps; a hard, multi-part one earns up to {max_steps} (or one or two more if truly needed).
- Decide the count from the question's COMPLEXITY, not a target. NEVER pad to reach a number, NEVER compress to hit one — stop when the idea is complete.

ARC (stretch or compress it to fit the count you chose):
problem -> naive attempt -> insight -> mechanism -> (math, only if it warrants) -> ONE real-world example -> remember.
- Include exactly ONE "where this shows up in the real world" step.
- equations: use [] when the step needs none. Only show math when the level warrants it.
- follow_ups: exactly 3, tuned to their level (go deeper / compare / apply).

VISUAL — every step has exactly one. Pick the template that fits the step's idea and fill its labels EXACTLY this shape:
- "compare_cards": {"cap":"caption","cards":[{"cls":"good|bad","h":"<=4 words","p":"<=14 words"}]}  -> contrast a wrong way (bad) vs a right way (good); usually 2 cards.
- "process_3stage": {"cap":"caption","stages":["stage one","stage two","stage three"]}  -> a short ordered sequence (2-4 stages).
- "score": {"cap":"caption","flow":[{"l":"input","s":"detail"},{"l":"process","s":"detail","hl":1}],"headline":"the result line","score":"verdict line"}  -> input -> process -> outcome with a decisive/numeric result.
- "generic_box": {"cap":"one-line caption"}  -> fallback ONLY when none of the above fit.
Keep every label SHORT. Do NOT invent other template names or label keys.
""",
    Intent.PRACTICE: """
INTENT: PRACTICE — produce a laddered problem set as JSON:
{"format":"practice","pattern":"one-line shared pattern","problems":[
{"title","difficulty":"easy|medium|hard","description","hint","trap":null|"..."}]}
- 3 problems, easy -> medium -> hard, sharing one pattern (name it once).
- Give a HINT, never the full solution. Note one trap where relevant.
""",
    Intent.CODE_PLEASE: """
INTENT: CODE_PLEASE — give working code FIRST as JSON:
{"format":"code","language":"...","code":"...","why":"2-4 lines max",
"offer_explain":true}
- Lead with clean, runnable, idiomatic code in the requested language.
- Handle edge cases in the code. Keep 'why' short — they asked for code, not a lecture.
- Do NOT force a walkthrough.
""",
    Intent.BUILD: """
INTENT: BUILD — help on THEIR project. JSON:
{"format":"build","needs_scoping":bool,"questions":[<=2 sharp questions if scoping],
"plan":null|"short architecture note","code":null|"first working piece",
"assumptions":[...],"next":"what to build next"}
- If under-specified, ask <=2 sharp questions (stack? scope?) and set needs_scoping=true.
- If clear, give a working production-shaped piece + note assumptions + offer next.
- Treat them as a competent engineer. Build incrementally, never a giant dump.
""",
    Intent.DEBUG: """
INTENT: DEBUG — diagnose. JSON:
{"format":"debug","likely_cause":"...","fix":"corrected code or steps",
"why":"why it broke, brief","need_more":null|"the one thing you need to see"}
- If you can see the bug, name it and fix it. Else ask for the ONE specific thing.
""",
    Intent.OFF_TOPIC: """
INTENT: OFF_TOPIC — warm redirect. JSON:
{"format":"redirect","message":"..."}
- One short, warm message. Keep MIRA's identity (CS/AI/coding). No lecture.
- Invite them back to something technical.
""",
}


def max_tokens_for(intent) -> int:
    """Output-token budget per intent. A walkthrough is a long structured JSON
    object (many steps, each with explanation + takeaway + visual + equations);
    the old flat 1200 default truncated it mid-object, which made json.loads()
    fail and dropped the answer to a prose fallback. Give the long, structured
    intents room to CLOSE their JSON."""
    from .intent import Intent
    return {
        Intent.LEARN: 5000,        # walkthrough: up to ~9 steps of structured JSON
        Intent.BUILD: 4000,        # plan + a working code piece
        Intent.PRACTICE: 2500,     # 3 problems w/ hints
        Intent.CODE_PLEASE: 2500,  # code can be long
        Intent.DEBUG: 1500,
        Intent.OFF_TOPIC: 400,
    }.get(intent, 1500)


def step_range_for_level(level: str) -> tuple[int, int]:
    """(min, max) step band for a walkthrough. The MODEL picks the actual count
    WITHIN this band based on how complex the specific question is — an easy
    query lands near the min, a hard one stretches to the max. Level only sets
    the band (a struggling learner gets more room to scaffold; a mastered one
    gets a tighter, denser walkthrough)."""
    return {"struggling": (5, 9), "learning": (4, 8), "mastered": (3, 6)}.get(level, (4, 8))


def build_contract(cls: Classification, level: str, style: str, memory: str) -> str:
    identity = SHARED_IDENTITY.format(level=level, style=style, memory=memory)
    # Contracts contain literal JSON braces, so use targeted replaces for the
    # placeholders rather than str.format (which would choke on the braces).
    lo, hi = step_range_for_level(level)
    contract = (_CONTRACTS[cls.intent]
                .replace("{min_steps}", str(lo))
                .replace("{max_steps}", str(hi)))
    return identity + contract


# ---------- domain redirect (no model call needed) ----------
def domain_redirect_blocks() -> list[dict]:
    return [{"type": "callout", "variant": "idea", "title": "Outside my focus",
             "content": ("I'm built for computer science, AI, and coding. For that "
                         "one you'd want a general assistant. Anything technical I "
                         "can dig into with you?")}]


# ---------- convert structured LEARN output -> renderable walkthrough ----------
# These are the templates the frontend's vis() renderer actually knows how to
# draw. Anything else is coerced to "generic_box" (a captioned box) so the
# renderer never receives a template it can't paint. Keep this set in lockstep
# with the frontend renderer; the contract above only ever offers this set.
VISUAL_TEMPLATES = {
    "compare_cards",    # good-vs-bad contrast cards
    "process_3stage",   # short ordered sequence
    "score",            # input -> process -> outcome with a result
    "forest_vote",      # topic-specific (ensemble vote) — kept for compatibility
    "bagging",          # topic-specific (bootstrap -> trees -> vote)
    "generic_box",      # fallback: a single captioned box
}


def walkthrough_to_blocks(data: dict) -> list[dict]:
    """Turn the model's walkthrough JSON into ONE structured 'walkthrough' block
    that carries the full step array + follow-ups — the exact shape the frontend
    WalkthroughView paces through (steps[], follow_ups[]). We keep the real field
    names (explanation/takeaway/equations/visual) instead of flattening each step
    into a callout, so the rich per-step visuals survive to the renderer."""
    steps: list[dict] = []
    for i, step in enumerate(data.get("steps", [])):
        steps.append({
            "title": step.get("title", f"Step {i+1}"),
            "explanation": step.get("explanation", ""),
            "takeaway": step.get("takeaway", ""),
            # accept either the new equations[] or a legacy single equation string
            "equations": _normalize_equations(
                step.get("equations", step.get("equation"))),
            "visual": _validate_visual(step.get("visual")),
        })
    return [{
        "type": "walkthrough",
        "steps": steps,
        "follow_ups": (data.get("follow_ups") or [])[:3],
    }]


def _normalize_equations(eq) -> list[dict]:
    """Coerce whatever the model produced into a list of {lab, f} (the shape the
    renderer's equation box expects). Accepts: None/"" -> []; a bare string;
    a single {lab,f} dict; or a list mixing strings and dicts."""
    if not eq:
        return []
    if isinstance(eq, str):
        return [{"lab": "", "f": eq}]
    if isinstance(eq, dict):
        return [{"lab": eq.get("lab", ""), "f": eq.get("f", eq.get("equation", ""))}]
    out: list[dict] = []
    for e in eq:
        if isinstance(e, str) and e.strip():
            out.append({"lab": "", "f": e})
        elif isinstance(e, dict):
            f = e.get("f", e.get("equation", ""))
            if f:
                out.append({"lab": e.get("lab", ""), "f": f})
    return out


def _validate_visual(v) -> dict:
    """Always return a renderable visual. Unknown templates -> generic_box, and
    labels is forced to an object (the renderers index labels by key, never as a
    flat array)."""
    if not isinstance(v, dict):
        return {"template": "generic_box", "labels": {}}
    template = v.get("template", "generic_box")
    if template not in VISUAL_TEMPLATES:
        template = "generic_box"
    labels = v.get("labels")
    if not isinstance(labels, dict):
        # tolerate models that FLATTEN the label keys up onto the visual object
        # (e.g. {"template":..,"cap":..} instead of {"template":..,"labels":{"cap":..}})
        labels = {k: val for k, val in v.items() if k != "template"}
    return {"template": template, "labels": labels}


REQUIRED_FIELDS = {
    "callout": ["content"],
    "code": ["content"],
    "compare": ["columns"],
    "steps": ["items"],
    "check": ["question", "options"],
    "walkthrough": ["steps"],     # structured LEARN walkthrough (steps[] + follow_ups[])
    "_problem_card": ["title"],
    "_follow_ups": ["items"],
    "_scope_questions": ["items"],
    "text": ["content"],
}


def validate_blocks(blocks: list[dict]) -> list[dict]:
    """Server-side validation (strict review #10): drop/repair malformed blocks
    so the frontend never receives a block missing its required fields. Unknown
    block types and blocks missing required fields are dropped; if everything is
    dropped, return a single safe fallback callout."""
    clean = []
    for b in blocks:
        if not isinstance(b, dict) or "type" not in b:
            continue
        t = b["type"]
        req = REQUIRED_FIELDS.get(t)
        if req is None:
            # unknown type -> drop (never send "unknown block" to the user)
            continue
        if any(b.get(f) in (None, "", []) for f in req):
            continue
        # length guard: keep callout content crisp
        if t == "callout" and isinstance(b.get("content"), str) and len(b["content"]) > 1200:
            b["content"] = b["content"][:1200].rstrip() + "…"
        clean.append(b)
    if not clean:
        clean = [{"type": "callout", "variant": "idea", "title": "Answer",
                  "content": "Let me try that again — that response didn't come through cleanly."}]
    return clean


def parse_structured_response(raw: str, intent: Intent) -> tuple[list[dict], str, bool]:
    """Public parser: parse + VALIDATE before returning to the caller/frontend.
    Returns (blocks, format_name, ok) — `ok` is False when the model's output
    could not be parsed into structured blocks (a prose fallback was used), so
    the caller can decide to RETRY instead of silently serving a raw-JSON dump."""
    blocks, fmt, ok = _parse_structured_response_inner(raw, intent)
    return validate_blocks(blocks), fmt, ok


def _prose_block(text: str) -> list[dict]:
    return [{"type": "callout", "variant": "idea", "title": "Answer",
             "content": (text[:400] if text else "Let me try that again.")}]


def _parse_structured_response_inner(raw: str, intent: Intent) -> tuple[list[dict], str, bool]:
    """Parse the model's JSON output by intent into (blocks, format_name, ok).
    Tolerant of code fences, surrounding prose, and TRUNCATED JSON (the model
    running out of tokens mid-object) — see _loads_lenient. Returns ok=False with
    a prose fallback only when nothing structured could be recovered."""
    try:
        data = _loads_lenient(raw)
    except Exception:
        return (_prose_block(raw), "prose", False)

    # A bare list = already-formed block array (mock provider, or block-style output)
    if isinstance(data, list):
        return (data, "blocks", True)
    if not isinstance(data, dict):
        return (_prose_block(str(data)), "prose", False)

    fmt = data.get("format", "")
    if fmt == "walkthrough":
        steps = data.get("steps") or []
        if not steps:  # repaired down to nothing usable -> retry
            return (_prose_block(raw), "prose", False)
        # A real walkthrough is >= 3 steps (the contract's minimum). 1-2 steps is
        # almost always a truncation salvage — return it as the fallback, but mark
        # ok=False so the pipeline retries for a COMPLETE answer first.
        ok = len(steps) >= 3
        return walkthrough_to_blocks(data), "walkthrough", ok
    if fmt == "practice":
        return _practice_to_blocks(data), "practice", True
    if fmt == "code":
        return _code_to_blocks(data), "code", True
    if fmt == "build":
        return _build_to_blocks(data), "build", True
    if fmt == "debug":
        return _debug_to_blocks(data), "debug", True
    if fmt == "redirect":
        return ([{"type": "callout", "variant": "idea", "title": "Outside my focus",
                  "content": data.get("message", "")}], "redirect", True)
    # unknown format -> prose fallback, signal a retry
    return (_prose_block(str(data)), "prose", False)


def _loads_lenient(raw: str):
    """Parse JSON that may be wrapped in code fences, surrounded by prose, or
    TRUNCATED. Tries, in order: direct parse -> the {..}/[..] substring ->
    structural repair of a truncated object. Raises if all fail."""
    cleaned = (raw or "").strip()
    if "```" in cleaned:
        cleaned = cleaned.replace("```json", "").replace("```", "").strip()
    # 1) direct (also tolerates trailing commas, a common LLM slip)
    got = _try_json(cleaned)
    if got is not _SENTINEL:
        return got
    # 2) the largest {...} or [...] span (drops surrounding prose)
    s, e = _json_bounds(cleaned)
    if s != -1:
        got = _try_json(cleaned[s:e + 1])
        if got is not _SENTINEL:
            return got
    # 3) repair a truncated object (model ran out of tokens mid-JSON)
    repaired = _repair_truncated(cleaned)
    if repaired is not None:
        got = _try_json(repaired)
        if got is not _SENTINEL:
            return got
    raise ValueError("unparseable model output")


_SENTINEL = object()


def _try_json(text: str):
    """Try json.loads on the text and on progressively-sanitized variants that
    fix the JSON slips real models make: trailing commas, and — the big one —
    LaTeX backslashes (\\sum, \\alpha, \\frac) which are INVALID JSON escapes and
    otherwise blow up the whole parse. Returns _SENTINEL (not None — None is a
    valid JSON value) if nothing parses."""
    seen = set()
    for cand in (text,
                 _strip_trailing_commas(text),
                 _fix_invalid_escapes(text),
                 _fix_invalid_escapes(_strip_trailing_commas(text))):
        if cand in seen:
            continue
        seen.add(cand)
        try:
            return json.loads(cand)
        except Exception:
            continue
    return _SENTINEL


def _strip_trailing_commas(text: str) -> str:
    return re.sub(r",(\s*[}\]])", r"\1", text)


def _fix_invalid_escapes(text: str) -> str:
    r"""Double any backslash that is NOT a valid JSON escape, so model-emitted
    LaTeX like \sum / \alpha / \frac survives as a literal string instead of
    making json.loads reject the document. Valid JSON escapes are \" \\ \/ \b \f
    \n \r \t and \uXXXX — those are left untouched."""
    return re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", text)


def _json_bounds(s: str) -> tuple[int, int]:
    """(start, end) of the outermost JSON value: first {/[ to the matching last }/]."""
    starts = [i for i in (s.find("{"), s.find("[")) if i != -1]
    ends = [i for i in (s.rfind("}"), s.rfind("]")) if i != -1]
    if not starts or not ends:
        return (-1, -1)
    return (min(starts), max(ends))


def _repair_truncated(raw: str) -> str | None:
    """Best-effort repair of JSON truncated mid-stream. Walks the text tracking
    string state and bracket depth, rewinds to the LAST fully-completed container
    (e.g. the last complete walkthrough step), then closes the still-open parents.
    This salvages every complete element and drops the incomplete trailing one.
    Returns None if there's no complete container to fall back to."""
    start = _json_bounds(raw)[0]
    if start == -1:
        return None
    s = raw[start:]
    stack: list[str] = []
    in_str = esc = False
    best_end = -1            # index (exclusive) just after a completed container
    best_stack: list[str] = []
    for i, ch in enumerate(s):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if stack:
                stack.pop()
            best_end = i + 1          # a container just closed cleanly here
            best_stack = list(stack)  # parents still open at this point
    if best_end == -1:
        return None
    # close the still-open parents innermost-first
    return s[:best_end] + "".join(reversed(best_stack))


def _practice_to_blocks(d: dict) -> list[dict]:
    blocks = [{"type": "callout", "variant": "idea", "title": "The pattern",
               "content": d.get("pattern", "")}]
    for p in d.get("problems", []):
        blocks.append({"type": "_problem_card",
                       "title": p.get("title"), "difficulty": p.get("difficulty"),
                       "description": p.get("description"), "hint": p.get("hint"),
                       "trap": p.get("trap")})
    return blocks


def _code_to_blocks(d: dict) -> list[dict]:
    out = [{"type": "code", "language": d.get("language", ""), "content": d.get("code", "")}]
    if d.get("why"):
        out.append({"type": "callout", "variant": "idea", "title": "Why it works",
                    "content": d["why"]})
    if d.get("offer_explain"):
        out.append({"type": "_follow_ups", "items": ["Explain how it works step by step"]})
    return out


def _build_to_blocks(d: dict) -> list[dict]:
    out = []
    if d.get("needs_scoping") and d.get("questions"):
        out.append({"type": "callout", "variant": "idea", "title": "Let's scope it",
                    "content": "A couple of things so I build what fits your setup:"})
        out.append({"type": "_scope_questions", "items": d["questions"][:2]})
        return out
    if d.get("plan"):
        out.append({"type": "callout", "variant": "definition", "title": "The plan",
                    "content": d["plan"]})
    if d.get("code"):
        out.append({"type": "code", "language": "", "content": d["code"]})
    if d.get("assumptions"):
        out.append({"type": "callout", "variant": "gotcha", "title": "I assumed",
                    "content": "; ".join(d["assumptions"][:3])})
    if d.get("next"):
        out.append({"type": "_follow_ups", "items": [f"Next: {d['next']}"]})
    return out


def _debug_to_blocks(d: dict) -> list[dict]:
    if d.get("need_more"):
        return [{"type": "callout", "variant": "idea", "title": "Need one thing",
                 "content": d["need_more"]}]
    out = [{"type": "callout", "variant": "gotcha", "title": "Likely cause",
            "content": d.get("likely_cause", "")}]
    if d.get("fix"):
        out.append({"type": "code", "language": "", "content": d["fix"]})
    if d.get("why"):
        out.append({"type": "callout", "variant": "idea", "title": "Why",
                    "content": d["why"]})
    return out
