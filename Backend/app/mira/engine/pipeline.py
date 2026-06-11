"""ChatPipeline — the end-to-end MIRA orchestrator for one question.

Order (matches the AWS spec):
  1. gate (quota)            2. load state
  3. analyze (depth, concept, repeat, trajectory-reward from last turn)
  4. cache check             5. decide action + prereq-walk
  6. route + failover        7. validate blocks (regenerate / prose fallback)
  8. answer                  9. learn (BKT, bandit, memory) + cache promote

This is provider-agnostic: GPT/MiniMax/Qwen/Sonnet/Opus all plug in via Router.
"""
from __future__ import annotations

import json
import random
from dataclasses import dataclass, field

from .cognitive import (UserState, Turn, classify_depth, trajectory_reward,
                        Depth, Style)
from .blocks import (validate_response, prose_fallback, build_system_prompt)
from .router import Router, ResponseCache


from .cognitive import (UserState, Turn, classify_depth, trajectory_reward,
                        Depth, Style)
from .blocks import (validate_response, prose_fallback, build_system_prompt)
from .router import Router, ResponseCache
from .knowledge import get_kb
from .embeddings import cosine as _cosine


# Open-domain knowledge base replaces the old hardcoded LATTICE.
# match_concept now handles ANY user phrasing and rejects off-domain questions.
def match_concept(q: str, kb=None):
    """Returns the KB MatchResult (concept_id, score, in_domain, domain).
    When a course KB is provided, matches against the course's concept lattice."""
    return (kb or get_kb()).match(q)


def cheap_embed(text: str) -> list[float]:
    """Question embedding for repeat-detection. Uses the same embedder as the KB."""
    return get_kb().embedder.embed(text)


# ---------- conversation context (multi-turn follow-ups) ----------
# A chat is multi-turn: "how to reverse a linked list" -> "provide me code" ->
# "explain step by step". Each later message is meaningless ALONE — "provide me
# code" has no concept and "explain step by step" looks off-domain. We resolve
# them against the conversation the FRONTEND sends (thread-accurate; server-side
# state.recent_questions is global per user and would bleed across threads).
_FOLLOWUP_CUES = (
    "step by step", "how it works", "how does it work", "how does that work",
    "go deeper", "explain it", "explain this", "explain that", "an example",
    "for example", "example of", "more on", "more about", "what about",
    "elaborate", "in more detail", "in detail", "make it simpler", "simpler",
    "provide me code", "give me the code", "give me code", "show me the code",
    "show me code", "the code", "code for it", "code for this", "code for that",
    "write the code", "in python", "in java", "in c++", "continue", "and then",
    "what next", "next step", "do that",
)


def _looks_like_followup(q: str) -> bool:
    """Does this message only make sense as a continuation of the prior turn?
    True for explicit follow-up phrasings and short pronoun-referential asks."""
    import re as _re
    t = (q or "").lower().strip()
    if any(c in t for c in _FOLLOWUP_CUES):
        return True
    # short, pronoun-referential ("show it", "why?", "do that for me")
    if len(t.split()) <= 8 and _re.search(r"\b(it|this|that|these|those|them|one)\b", t):
        return True
    return False


def _history_from_ctx(ctx) -> list[dict]:
    """Normalize the frontend-supplied conversation history to a bounded list of
    {role: 'user'|'mira', content: str}. Caps length + size so a long thread
    can't blow the prompt budget."""
    h = getattr(ctx, "history", None)
    if not isinstance(h, list):
        return []
    out: list[dict] = []
    for m in h[-8:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if content and role in ("user", "mira", "assistant"):
            out.append({"role": "user" if role == "user" else "mira",
                        "content": content[:600]})
    return out


def _convo_prompt(history: list[dict]) -> str:
    """Render the recent turns as a plain transcript the answer model can read."""
    if not history:
        return ""
    lines = [("Learner" if m["role"] == "user" else "MIRA") + ": " + m["content"]
             for m in history]
    return "Conversation so far:\n" + "\n".join(lines)


def _page_context_from_ctx(ctx) -> str:
    """The live page context the frontend attached — e.g. the IDE problem
    statement + the user's current code + last run output. Bounded."""
    pc = getattr(ctx, "page_context", None)
    return pc.strip()[:8000] if isinstance(pc, str) and pc.strip() else ""


def _page_title(page_ctx: str) -> str:
    """Pull the problem title out of the page context (its first line is
    'Problem: <title>'), used to anchor concept matching for vague asks."""
    if not page_ctx:
        return ""
    first = page_ctx.splitlines()[0]
    return first.split(":", 1)[1].strip() if first.lower().startswith("problem:") else ""


@dataclass
class PipelineResult:
    blocks: list[dict]
    provider: str
    action: str
    concept: str
    depth: str
    cost_inr: float
    latency_ms: int
    cache_hit: bool
    reward_applied: float
    style_used: str
    served_from: str  # "model" | "cache" | "golden" | "prose_fallback"
    in_tokens: int = 0
    out_tokens: int = 0
    intent: str = "LEARN"       # the classified intent
    answer_format: str = "blocks"  # walkthrough | practice | code | build | debug | redirect | blocks
    needs_disambiguation: bool = False
    disambiguation_options: list = field(default_factory=list)
    # topic map (embedding-based, via taxonomy.classify_topic) — used to group
    # chat history Topic -> Subtopic on the frontend and in the usage audit.
    domain: str = "general"
    topic: str = "General"
    subtopic: str = "General"


@dataclass
class TurnContext:
    """Lightweight per-request context the SERVICE layer passes in. The pipeline
    does NOT enforce quota — that lives only in services/quota.py. These numbers
    are read-only inputs the GPT-slide uses to taper model cost with volume."""
    turns_used_this_period: int = 0
    monthly_turn_budget: int = 500


@dataclass
class ChatPipeline:
    router: Router
    cache: ResponseCache = field(default_factory=ResponseCache)
    rng: random.Random = field(default_factory=lambda: random.Random(7))

    def handle(self, state: UserState, question: str,
               ctx: "TurnContext | None" = None) -> PipelineResult:
        import time
        t0 = time.time()
        ctx = ctx or TurnContext(monthly_turn_budget=500)
        result_in_tokens = 0
        result_out_tokens = 0

        # NOTE: quota enforcement is NOT done here. The service layer (services/
        # quota.py) is the single source of truth and gates the request before
        # this method is ever called. The pipeline only produces answers.
        # 2. concept match (open-vocabulary, embedding-based). We no longer
        # refuse here — the intent classifier below makes the domain decision,
        # because it understands coding/CS/AI breadth better than concept-match.
        depth = classify_depth(question)
        # If the service injected a course-specific KB (built from the course's
        # concept lattice), match against it so course questions map to course
        # concepts instead of falling back to the built-in 16.
        course_kb = getattr(ctx, "course_kb", None)

        from .intent import classify as classify_intent, Intent
        from . import contracts as C
        # use the engine's cheapest provider for the rare LLM-fallback classify
        clf_provider = self.router.providers.get("qwen") or self.router.providers.get("mock")

        # 2a. CONVERSATION CONTEXT — resolve follow-ups against the thread the
        # frontend sent. "provide me code" / "explain step by step" carry no
        # concept and read as off-domain on their own; combined with the prior
        # turn they resolve to the real topic (e.g. reversing a linked list).
        history = _history_from_ctx(ctx)
        recent_user_texts = [m["content"] for m in history if m["role"] == "user"]
        if not recent_user_texts and state.recent_questions:
            recent_user_texts = state.recent_questions[-3:]  # fallback (not thread-accurate)
        prev_user_q = recent_user_texts[-1] if recent_user_texts else None
        is_followup = bool(prev_user_q) and _looks_like_followup(question)
        # span the recent USER turns, not just the immediately prior one, so the
        # topic survives a chain of contextless follow-ups ("provide me code" ->
        # "explain step by step") whose real subject is several turns back.
        ctx_query = ("\n".join(recent_user_texts[-4:] + [question])
                     if (recent_user_texts and is_followup) else question)

        # current page / problem context (IDE statement + the user's live code)
        page_ctx = _page_context_from_ctx(ctx)
        page_title = _page_title(page_ctx)
        on_problem = bool(page_ctx) or bool(getattr(ctx, "problem_id", None))

        # 2. concept match (open-vocabulary, embedding-based) — context-aware for
        # follow-ups so the topic carries over from the prior turn.
        match = match_concept(question, kb=course_kb)
        if is_followup and prev_user_q:
            combo = match_concept(ctx_query, kb=course_kb)
            # a follow-up's true topic is the prior topic: prefer the combined
            # match whenever it stays in-domain (or when the bare ask matched nothing).
            if combo.in_domain or not match.in_domain:
                match = combo
        # on a problem page, anchor a still-unmatched ask to the problem's title
        # ("I'm stuck" -> the concept of the problem they're solving).
        if (not match.in_domain) and page_title:
            pm = match_concept(f"{page_title}\n{question}", kb=course_kb)
            if pm.in_domain:
                match = pm
        concept = match.concept_id if match.in_domain else "general"
        cur_emb = cheap_embed(question)

        # 2b. INTENT CLASSIFICATION — decides the answer SHAPE. The ACTION
        # (CODE_PLEASE / LEARN / ...) comes from the current message; DOMAIN can
        # be inherited from the conversation so a continuation isn't redirected.
        cls = classify_intent(question, provider=clf_provider)
        if is_followup and (cls.intent == Intent.OFF_TOPIC or not cls.in_core_domain):
            cls_ctx = classify_intent(ctx_query, provider=clf_provider)
            if cls_ctx.in_core_domain:
                from dataclasses import replace as _replace
                # keep the current message's action verb unless it read as off-topic
                intent = cls_ctx.intent if cls.intent == Intent.OFF_TOPIC else cls.intent
                cls = _replace(cls, intent=intent, in_core_domain=True, technical_core=True)
        # on a live problem page, a vague ask ("why isn't this working", "I'm
        # stuck") reads as out-of-domain / off-topic but IS about the coding
        # problem in front of them. Rescue it — unless the message is EXPLICITLY
        # off-topic (e.g. 'what's the weather'), which still redirects.
        if on_problem and (cls.intent == Intent.OFF_TOPIC or not cls.in_core_domain):
            from .intent import is_explicit_off_topic
            from dataclasses import replace as _replace
            if not is_explicit_off_topic(question):
                if cls.intent == Intent.OFF_TOPIC:
                    _dbg_words = ("not work", "fails", "fail", "wrong", "stuck",
                                  "bug", "fix", "crash", "error", "exception", "broken")
                    is_dbg = any(w in question.lower() for w in _dbg_words)
                    new_intent = Intent.DEBUG if is_dbg else Intent.LEARN
                    cls = _replace(cls, intent=new_intent, in_core_domain=True, technical_core=True)
                else:
                    cls = _replace(cls, in_core_domain=True, technical_core=True)

        # off-domain by intent (belt-and-suspenders with the KB domain guard):
        if cls.intent == Intent.OFF_TOPIC or not cls.in_core_domain:
            return PipelineResult(
                C.domain_redirect_blocks(), "none", "redirect", concept,
                depth.value, 0.0, int((time.time() - t0) * 1000), False, 0.0,
                "none", "redirect", intent=cls.intent.value, answer_format="redirect")

        # low-confidence -> ask a one-tap disambiguation instead of guessing wrong
        if cls.confidence == "low" and clf_provider is not None:
            # (only disambiguate the genuinely ambiguous learn-vs-code case)
            pass  # handled inline below; we proceed with best guess for now

        repeated = False
        prev_emb = None
        if state.last_turn:
            prev_emb = cheap_embed(state.last_turn.question)
            from .cognitive import cosine
            if cosine(prev_emb, cur_emb) > 0.92:
                repeated = True

        # trajectory reward from the PREVIOUS turn -> update bandit for that style
        reward = trajectory_reward(state.last_turn, question, depth, prev_emb, cur_emb)
        if state.last_turn and reward != 0.0:
            state.bandit.update(state.last_turn.style, reward)

        # update beliefs from THIS question's depth
        state.beliefs.update_from_depth(concept, depth, repeated=repeated)
        level = state.beliefs.level(concept)

        # 5. decide pedagogy via the decision layer (challenge / teach / scaffold)
        from .cognitive import decide, Pedagogy
        p_known = state.beliefs.get(concept)
        kb = course_kb or get_kb()
        has_prereqs = kb.has_prereqs(concept)
        confident = len(state.recent_questions) >= 3 and (p_known <= 0.2 or p_known >= 0.45)
        # detect a wrong-answer recovery context from the trajectory reward
        just_failed = reward <= -0.5
        decision = decide(level, p_known, state.depth_mode, depth, has_prereqs, confident,
                          prior_turns=len(state.recent_questions), just_failed=just_failed)
        action = {Pedagogy.SCAFFOLD: "prereq_walk",
                  Pedagogy.CHALLENGE: "challenge",
                  Pedagogy.TEACH: "answer"}[decision.pedagogy]

        # pick style via bandit
        style = state.bandit.select(self.rng)

        # 4. cache check — SAFE caching only (strict review #8):
        #   - never cache BUILD / DEBUG / CODE_PLEASE (user/project-specific)
        #   - never cache answers grounded in the user's live page/code context
        #   - key includes intent + a normalized question hash so two different
        #     questions sharing concept/depth/style can't collide
        import hashlib as _hl
        _cacheable = cls.intent.value in ("LEARN", "PRACTICE") and not page_ctx
        _qhash = _hl.sha256(question.lower().strip().encode()).hexdigest()[:16]
        cache_key_depth = f"{cls.intent.value}:{depth.value}:{state.depth_mode.value}:{_qhash}"
        cached = self.cache.get(concept, cache_key_depth, style) if _cacheable else None
        if cached is not None:
            blocks, provider, served = cached, "cache", "cache"
            cost, lat = 0.0, int((time.time() - t0) * 1000)
            answer_fmt = "blocks"
        else:
            # 6. route + 7. answer — pass volume so GPT-share slides with usage
            turns_used = ctx.turns_used_this_period
            monthly_budget = ctx.monthly_turn_budget
            hard = (level == "mastered" or depth == Depth.CREATIVE
                    or decision.pedagogy == Pedagogy.CHALLENGE)
            lane = self.router.pick_lane(state.tier, action, hard=hard,
                                         turns_used=turns_used, monthly_budget=monthly_budget)
            # Per-intent contract drives the answer SHAPE (walkthrough/code/build/etc.)
            system = C.build_contract(cls, level, style, state.memory.as_prompt())
            base_user = question if action != "prereq_walk" else (
                f"The learner asked '{question}' but is struggling and missing prerequisites "
                f"{kb.prereqs_of(concept)}. Start by checking which prereq they know, "
                f"then explain from their floor, warmly. " + question)
            # Prepend the page/problem context + conversation transcript so the
            # model debugs the user's ACTUAL code on the problem they're looking at
            # and resolves references ("the code", "it") instead of inventing a new
            # subject.
            page_block = (
                "The learner is working on this problem in the IDE right now — treat it "
                "as the primary context: refer to THIS problem and debug THEIR code.\n"
                f"{page_ctx}" if page_ctx else "")
            convo = _convo_prompt(history)
            preamble = "\n\n".join(p for p in (page_block, convo) if p)
            if preamble:
                user_msg = (f"{preamble}\n\n---\n{base_user}\n\n"
                            "(Resolve references like 'it', 'this', or 'the code' from the "
                            "context above — answer about the SAME problem/topic the learner "
                            "is working on, not a new one.)")
            else:
                user_msg = base_user

            # intent-aware output budget — walkthroughs/builds are long structured
            # JSON; the default 1200 truncated them and forced a prose fallback.
            max_out = C.max_tokens_for(cls.intent)
            comp = self.router.complete(lane, system, user_msg, max_tokens=max_out)
            answer_fmt = "blocks"
            if comp.ok:
                # parse + validate the intent-specific JSON into renderable blocks.
                # parse_ok=False means the JSON was malformed/truncated beyond
                # repair — so we genuinely RETRY (the old code masked this because
                # the prose fallback looked like a successful non-empty result).
                blocks, answer_fmt, parse_ok = C.parse_structured_response(comp.text, cls.intent)
                if not parse_ok:
                    strict = system + (
                        "\n\nSTRICT: Output ONE valid JSON object ONLY — no prose, no "
                        "markdown fences. It MUST be COMPLETE and close every bracket.")
                    comp2 = self.router.complete(lane, strict, user_msg, max_tokens=max_out)
                    if comp2.ok:
                        b2, f2, ok2 = C.parse_structured_response(comp2.text, cls.intent)
                        if ok2:
                            blocks, answer_fmt, parse_ok, comp = b2, f2, True, comp2
                served = "model"
                provider, cost = comp.provider, comp.usage.cost_inr() if comp.usage else 0.0
                if comp.usage:
                    result_in_tokens = comp.usage.in_tokens
                    result_out_tokens = comp.usage.out_tokens
                # promote ONLY a clean parse — never cache a prose fallback, or the
                # broken answer would be replayed from cache for every repeat.
                if _cacheable and parse_ok:
                    self.cache.put(concept, cache_key_depth, style, blocks)  # LEARN/PRACTICE only
            else:
                # 9-floor: cache miss already happened, try golden answer
                golden = self.cache.golden_answer(concept)
                if golden:
                    blocks, provider, served, cost = golden, "golden", "golden", 0.0
                else:
                    blocks = [{"type": "callout", "variant": "warning", "title": "One moment",
                               "content": "I'm thinking slower than usual — your question is saved."}]
                    provider, served, cost = "none", "queued", 0.0
            lat = comp.latency_ms if comp.ok else int((time.time() - t0) * 1000)

        # 9. learn: record this turn + add a memory observation
        state.last_turn = Turn(question=question, depth=depth, concept=concept, style=style)
        state.recent_questions.append(question)
        if level == "struggling":
            state.memory.add(f"finds {concept} difficult; prefers building from prerequisites")
        elif depth in (Depth.EVALUATIVE, Depth.CREATIVE):
            state.memory.add(f"asks advanced ({depth.value}) questions about {concept}")
        state.memory.add(f"{style} explanations are being tried for them")

        # topic map for history grouping + audit. Reuse the concept's precomputed
        # embedding when it's a known KB concept; else fall back to the question
        # embedding we already computed. No extra embedding call for KB concepts.
        from .taxonomy import classify_topic
        _kb_concept = kb.concepts.get(concept)
        _topic_emb = (_kb_concept.embedding
                      if _kb_concept and _kb_concept.embedding else cur_emb)
        domain, topic, subtopic = classify_topic(
            concept, _topic_emb, domain_hint=(match.domain if match.in_domain else None))

        return PipelineResult(
            blocks=blocks, provider=provider, action=action, concept=concept,
            depth=depth.value, cost_inr=round(cost, 3), latency_ms=lat,
            cache_hit=(served == "cache"), reward_applied=round(reward, 2),
            style_used=style, served_from=served,
            in_tokens=result_in_tokens, out_tokens=result_out_tokens,
            intent=cls.intent.value, answer_format=answer_fmt,
            domain=domain, topic=topic, subtopic=subtopic)
