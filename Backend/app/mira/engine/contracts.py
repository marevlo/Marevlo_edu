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
from .intent import Intent, Classification


SHARED_IDENTITY = """You are MIRA, a tutor and engineering collaborator for
computer science, AI, and coding. You help learners understand and professionals
build. Be crisp — never pad. Adapt depth to the learner's level. Code must be
correct and runnable. Never refuse a CS/AI/coding request because of its domain.

This learner:
- level on this topic: {level}
- explanation style that works for them: {style}
- what you know about them: {memory}
"""


# ---------- per-intent contracts ----------
_CONTRACTS = {
    Intent.LEARN: """
INTENT: LEARN — produce a paced WALKTHROUGH as a JSON object:
{"format":"walkthrough","steps":[{"title","explanation","takeaway",
"visual":{"template","labels"},"equation":null|"..."}],"follow_ups":[3 strings]}
- {n_steps} steps (more if struggling, fewer if mastered).
- Arc: problem -> naive attempt -> insight -> mechanism -> real-world example -> remember.
- Include ONE "where this shows up in the real world" step.
- equation only if level warrants and concept needs it.
- follow_ups: 3 branches tuned to their level (deeper / compare / apply).
- Each explanation <= 3 short sentences. Each takeaway = 1 sentence.
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


def n_steps_for_level(level: str) -> int:
    return {"struggling": 8, "learning": 7, "mastered": 5}.get(level, 7)


def build_contract(cls: Classification, level: str, style: str, memory: str) -> str:
    identity = SHARED_IDENTITY.format(level=level, style=style, memory=memory)
    # Contracts contain literal JSON braces, so use a targeted replace for the
    # one placeholder rather than str.format (which would choke on the braces).
    contract = _CONTRACTS[cls.intent].replace("{n_steps}", str(n_steps_for_level(level)))
    return identity + contract


# ---------- domain redirect (no model call needed) ----------
def domain_redirect_blocks() -> list[dict]:
    return [{"type": "callout", "variant": "idea", "title": "Outside my focus",
             "content": ("I'm built for computer science, AI, and coding. For that "
                         "one you'd want a general assistant. Anything technical I "
                         "can dig into with you?")}]


# ---------- convert structured LEARN output -> renderable blocks ----------
VISUAL_TEMPLATES = {
    # template name -> how the frontend should render it (the renderer owns the SVG)
    "flow", "stack", "compare_cards", "weighted_arrows", "neuron_grid",
    "indexed_array", "process_3stage", "loss_equation", "map_trace",
    "complexity_table", "generic_box",
}


def walkthrough_to_blocks(data: dict) -> list[dict]:
    """Turn the model's walkthrough JSON into the block array the frontend renders.
    Each step becomes a callout (the explanation) + optional visual + takeaway.
    The frontend's WalkthroughView already paces an array of blocks."""
    blocks: list[dict] = []
    for i, step in enumerate(data.get("steps", [])):
        # one 'steps'-style block per walkthrough step keeps the renderer simple
        block = {
            "type": "callout",
            "variant": "definition" if i == 0 else "idea",
            "title": step.get("title", f"Step {i+1}"),
            "content": step.get("explanation", ""),
            "_takeaway": step.get("takeaway", ""),
            "_visual": _validate_visual(step.get("visual")),
            "_equation": step.get("equation"),
        }
        blocks.append(block)
    # attach follow-ups as a trailing meta block the UI shows as buttons
    fu = data.get("follow_ups", [])
    if fu:
        blocks.append({"type": "_follow_ups", "items": fu[:3]})
    return blocks


def _validate_visual(v) -> dict | None:
    if not isinstance(v, dict):
        return None
    template = v.get("template", "generic_box")
    if template not in VISUAL_TEMPLATES:
        template = "generic_box"
    return {"template": template, "labels": v.get("labels", {})}


REQUIRED_FIELDS = {
    "callout": ["content"],
    "code": ["content"],
    "compare": ["columns"],
    "steps": ["items"],
    "check": ["question", "options"],
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


def parse_structured_response(raw: str, intent: Intent) -> tuple[list[dict], str]:
    """Public parser: parse + VALIDATE before returning to the caller/frontend."""
    blocks, fmt = _parse_structured_response_inner(raw, intent)
    return validate_blocks(blocks), fmt


def _parse_structured_response_inner(raw: str, intent: Intent) -> tuple[list[dict], str]:
    """Parse the model's JSON output by intent into (blocks, format_name).
    Falls back to a prose callout if parsing fails."""
    try:
        cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
        data = json.loads(cleaned)
    except Exception:
        return ([{"type": "callout", "variant": "idea", "title": "Answer",
                  "content": raw[:400] if raw else "Let me try that again."}], "prose")

    # A bare list = already-formed block array (mock provider, or block-style output)
    if isinstance(data, list):
        return (data, "blocks")
    if not isinstance(data, dict):
        return ([{"type": "callout", "variant": "idea", "title": "Answer",
                  "content": str(data)[:400]}], "prose")

    fmt = data.get("format", "")
    if fmt == "walkthrough":
        return walkthrough_to_blocks(data), "walkthrough"
    if fmt == "practice":
        return _practice_to_blocks(data), "practice"
    if fmt == "code":
        return _code_to_blocks(data), "code"
    if fmt == "build":
        return _build_to_blocks(data), "build"
    if fmt == "debug":
        return _debug_to_blocks(data), "debug"
    if fmt == "redirect":
        return ([{"type": "callout", "variant": "idea", "title": "Outside my focus",
                  "content": data.get("message", "")}], "redirect")
    # unknown -> prose fallback
    return ([{"type": "callout", "variant": "idea", "title": "Answer",
              "content": str(data)[:400]}], "prose")


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
