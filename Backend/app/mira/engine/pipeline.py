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
        match = match_concept(question, kb=course_kb)
        concept = match.concept_id if match.in_domain else "general"
        cur_emb = cheap_embed(question)

        # 2b. INTENT CLASSIFICATION — decides the answer SHAPE
        from .intent import classify as classify_intent, Intent
        from . import contracts as C
        # use the engine's cheapest provider for the rare LLM-fallback classify
        clf_provider = self.router.providers.get("qwen") or self.router.providers.get("mock")
        cls = classify_intent(question, provider=clf_provider)

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
        #   - key includes intent + a normalized question hash so two different
        #     questions sharing concept/depth/style can't collide
        import hashlib as _hl
        _cacheable = cls.intent.value in ("LEARN", "PRACTICE")
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
            user_msg = question if action != "prereq_walk" else (
                f"The learner asked '{question}' but is struggling and missing prerequisites "
                f"{kb.prereqs_of(concept)}. Start by checking which prereq they know, "
                f"then explain from their floor, warmly. " + question)

            comp = self.router.complete(lane, system, user_msg)
            answer_fmt = "blocks"
            if comp.ok:
                # parse the structured, intent-specific JSON into renderable blocks
                parsed_blocks, answer_fmt = C.parse_structured_response(comp.text, cls.intent)
                if parsed_blocks:
                    blocks, served = parsed_blocks, "model"
                else:
                    comp2 = self.router.complete(lane, system + "\nSTRICT: valid JSON only.", user_msg)
                    if comp2.ok:
                        blocks, answer_fmt = C.parse_structured_response(comp2.text, cls.intent)
                        served, comp = "model", comp2
                    else:
                        blocks, served = prose_fallback(comp.text), "prose_fallback"
                provider, cost = comp.provider, comp.usage.cost_inr() if comp.usage else 0.0
                if comp.usage:
                    result_in_tokens = comp.usage.in_tokens
                    result_out_tokens = comp.usage.out_tokens
                if _cacheable:
                    self.cache.put(concept, cache_key_depth, style, blocks)  # promote (LEARN/PRACTICE only)
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

        return PipelineResult(
            blocks=blocks, provider=provider, action=action, concept=concept,
            depth=depth.value, cost_inr=round(cost, 3), latency_ms=lat,
            cache_hit=(served == "cache"), reward_applied=round(reward, 2),
            style_used=style, served_from=served,
            in_tokens=result_in_tokens, out_tokens=result_out_tokens,
            intent=cls.intent.value, answer_format=answer_fmt)
