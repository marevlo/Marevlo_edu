"""Block system — the answer styling. The model emits typed blocks (JSON);
we validate them against hard limits and either accept, regenerate, or fall
back to prose. Crispness is enforced HERE, by limits — not by pleading prompts.

Five block types in v1: callout, diagram, compare, steps, check.
"""
from __future__ import annotations

import json
from dataclasses import dataclass


# ---- limits (this is what enforces "crisp where it should be, full where it helps") ----
LIMITS = {
    "callout_content_chars": 280,      # raised: the one-idea box needs room to land
    "context_content_chars": 600,      # NEW: first-encounter teaching (anchor + motivation)
    "diagram_max_nodes": 7,
    "diagram_max_edges": 9,
    "diagram_note_words": 18,
    "compare_max_cols": 3,
    "compare_max_points": 4,
    "compare_point_words": 16,
    "steps_max": 6,
    "steps_body_chars": 160,
    "check_max_options": 4,
    "voice_chars": 500,                # NEW: connective tutor-voice between blocks
}


@dataclass
class ValidationResult:
    ok: bool
    blocks: list[dict]
    errors: list[str]


def _words(s: str) -> int:
    return len(s.split())


def validate_block(b: dict) -> list[str]:
    """Return list of error strings for one block ([] = valid)."""
    errs: list[str] = []
    t = b.get("type")
    if t == "callout":
        if b.get("variant") not in ("idea", "definition", "gotcha", "warning", "insight", "analogy"):
            errs.append("callout.variant invalid")
        if len(b.get("content", "")) > LIMITS["callout_content_chars"]:
            errs.append("callout.content too long")
    elif t == "context":  # NEW: first-encounter anchor + motivation
        if len(b.get("content", "")) > LIMITS["context_content_chars"]:
            errs.append("context.content too long")
    elif t == "voice":  # NEW: connective tutor-voice line between blocks
        if len(b.get("content", "")) > LIMITS["voice_chars"]:
            errs.append("voice.content too long")
    elif t == "diagram":
        nodes = b.get("nodes", []); edges = b.get("edges", [])
        if len(nodes) > LIMITS["diagram_max_nodes"]:
            errs.append("diagram too many nodes (split it)")
        if len(edges) > LIMITS["diagram_max_edges"]:
            errs.append("diagram too many edges")
        for n in nodes:
            if _words(n.get("note", "")) > LIMITS["diagram_note_words"]:
                errs.append("diagram note too long")
    elif t == "compare":
        cols = b.get("columns", [])
        if len(cols) > LIMITS["compare_max_cols"]:
            errs.append("compare too many columns")
        for c in cols:
            if len(c.get("points", [])) > LIMITS["compare_max_points"]:
                errs.append("compare too many points")
    elif t == "steps":
        items = b.get("items", [])
        if len(items) > LIMITS["steps_max"]:
            errs.append("too many steps (split it)")
        for it in items:
            if len(it.get("body", "")) > LIMITS["steps_body_chars"]:
                errs.append("step body too long")
    elif t == "check":
        if b.get("mode") not in ("mcq", "prereq"):
            errs.append("check.mode invalid")
        if len(b.get("options", [])) > LIMITS["check_max_options"]:
            errs.append("check too many options")
    else:
        errs.append(f"unknown block type: {t}")
    return errs


def validate_response(raw: str) -> ValidationResult:
    """Parse model output as a JSON block array and validate every block."""
    try:
        cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
        blocks = json.loads(cleaned)
        if not isinstance(blocks, list):
            return ValidationResult(False, [], ["response is not a JSON array"])
    except Exception as e:
        return ValidationResult(False, [], [f"JSON parse failed: {e}"])

    all_errs: list[str] = []
    good: list[dict] = []
    for b in blocks:
        errs = validate_block(b)
        if errs:
            all_errs.extend(errs)
        else:
            good.append(b)
    return ValidationResult(len(all_errs) == 0, good, all_errs)


def prose_fallback(text: str) -> list[dict]:
    """If structured generation fails twice, wrap plain prose as a text-ish
    callout so the user still gets an answer (never an error screen)."""
    return [{"type": "callout", "variant": "idea", "title": "Answer",
             "content": text[:200] if text else "Let me try that again."}]


BLOCK_SCHEMA_FOR_PROMPT = """
Reply as a JSON array of blocks. Allowed blocks:
- {"type":"voice","content":"<=500 chars"}  — the TUTOR'S VOICE: a conversational line that carries the explanation and connects blocks. This is you *talking* to the learner, not a labeled box. Use it to open, to transition ("okay, so why does this matter?"), and to land points.
- {"type":"context","content":"<=600 chars"}  — for a FIRST-ENCOUNTER concept: real-world anchor + why it exists + motivation. ("ChatGPT, Translate, Copilot are all transformers. Before 2017, models read word-by-word, slow and forgetful...")
- {"type":"callout","variant":"idea|definition|gotcha|warning|insight|analogy","title":"<=6 words","content":"<=2 sentences"}
- {"type":"diagram","layout":"flow|stack|compare","nodes":[{"id","label":"<=4 words","note":"<=18 words"}],"edges":[{"from","to","label?"}]}  (<=7 nodes; model gives the GRAPH not positions)
- {"type":"compare","columns":[{"header":"<=4 words","points":["<=16 words", ...up to 4]}]}  (<=3 columns)
- {"type":"steps","items":[{"title":"<=5 words","body":"<=1 sentence"}]}  (<=6 steps; use for derivations too)
- {"type":"check","mode":"mcq|prereq|predict","question":"<=1 sentence","options":[{"id","label"}]}  — for "predict" mode, ALWAYS include a "just show me" option so the reach is escapable.
"""

VOICE_GUIDE = """
HOW TO TEACH (this is what makes MIRA different from a chatbot that just answers):
- Open with a HOOK or a real-world anchor, never a cold definition. Create curiosity first.
- Let your VOICE run THROUGH the blocks — short conversational lines that carry one idea into the next. The blocks are your whiteboard; the voice is you talking while you draw.
- EARN the math. Never drop a naked formula. Build to it in plain words first, then show the symbols, then break each term back down. The formula should feel like a sentence the learner already understood.
- Sustain ONE strong analogy rather than scattering weak ones.
- Anticipate confusion: "here's where everyone gets stuck..." with the fix.
- Warmth and momentum: "this is the beautiful part", "don't flinch, I'll translate every piece".
NEVER produce a wall of text — stage everything with blocks so the eye always has a rest.
"""

PEDAGOGY_GUIDE = {
    "challenge": "The learner has the pieces and is ready. WITHHOLD the key step and make them REACH for it with a check(mode=predict) — BUT always include a 'just show me' option (no pressure). If they guess wrong, be warm: name what was RIGHT about their guess, then gently correct. A reached answer creates the 'click'.",
    "teach": "Teach directly and generously at the chosen depth. Do not withhold — the learner isn't in a spot to be challenged, so just explain well.",
    "scaffold": "The learner is struggling. Do NOT re-explain louder. Acknowledge warmly, then check which prerequisite they know (check mode=prereq), and rebuild from their floor.",
}

DEPTH_GUIDE = {
    "idea": "DEPTH = just the idea. Intuition, a vivid analogy, the click. Hold the math back explicitly ('we'll get to the formula once this feels solid'). Short.",
    "balanced": "DEPTH = balanced. Intuition + the mechanism + the key formula, earned. Medium length.",
    "deep": "DEPTH = deep dive. COMPLETE treatment: full derivation term-by-term with shapes, edge cases, the stability/why details most courses skip, and the design trade-off behind the choice. Be thorough — this learner wants mastery.",
}


def build_system_prompt(level: str, style: str, memory_prompt: str,
                        depth_mode: str = "balanced", pedagogy: str = "teach") -> str:
    return f"""You are MIRA, a tutor for AI/ML/DS/DSA only. You teach like a brilliant human tutor — warm, generous, and adaptive — NOT like a chatbot that recites.

This learner:
- Current level on the topic: {level}.
- Explanation style that works for them: {style}.
- {memory_prompt}

{DEPTH_GUIDE.get(depth_mode, DEPTH_GUIDE['balanced'])}

PEDAGOGY for this turn: {PEDAGOGY_GUIDE.get(pedagogy, PEDAGOGY_GUIDE['teach'])}

{VOICE_GUIDE}

{BLOCK_SCHEMA_FOR_PROMPT}

End by leaning forward — a check, or a forward-path question, or (if the concept has more parts) by showing what's left to explore. NEVER quiz on something you introduced in the same turn. Output JSON only."""
