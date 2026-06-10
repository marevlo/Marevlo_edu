"""The cognitive core — the part that IS MIRA.

Pure math, no LLM calls, fully testable. This is what 'learns the user end to
end' without any neural training: it converges on one person from that person's
own questions in days, not months.

Three learners, all per-user:
  1. CognitiveTracker (BKT)  — what the user knows, inferred from question depth
  2. ThompsonBandit          — which explanation style works for this user
  3. TrajectoryReward        — did the last answer land? (implicit, no thumbs needed)
Plus PersonalMemory — plain-language observations injected into prompts.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ============================== question depth ==============================
class Depth(str, Enum):
    SURFACE = "surface"        # "what is X"
    STRUCTURAL = "structural"  # "how does X work"
    RELATIONAL = "relational"  # "how does X relate to Y"
    EVALUATIVE = "evaluative"  # "why is X better than Y"
    CREATIVE = "creative"      # "could we use X to do Z"


DEPTH_EVIDENCE = {  # likelihood ratio P(depth|known)/P(depth|unknown)
    Depth.SURFACE: 0.8, Depth.STRUCTURAL: 1.5, Depth.RELATIONAL: 3.0,
    Depth.EVALUATIVE: 5.0, Depth.CREATIVE: 8.0,
}


def classify_depth(q: str) -> Depth:
    """Heuristic-first depth classifier (cheap; an LLM/classifier can replace it)."""
    ql = q.lower()
    if any(k in ql for k in ("could we", "what if", "design a", "propose", "novel")):
        return Depth.CREATIVE
    if any(k in ql for k in ("why is", "better than", "trade-off", "tradeoff", "when should")):
        return Depth.EVALUATIVE
    if any(k in ql for k in ("relate", "difference between", "vs", "compared to", "connect")):
        return Depth.RELATIONAL
    if any(k in ql for k in ("how does", "how do", "how is", "walk me through", "steps")):
        return Depth.STRUCTURAL
    return Depth.SURFACE


# ============================== styles / bandit ==============================
class Style(str, Enum):
    ANALOGY = "analogy"
    VISUAL = "visual"
    MATH = "mathematical"
    CODE = "code"
    STORY = "storytelling"
    SOCRATIC = "socratic"


@dataclass
class BeliefState:
    """Per-concept P(known) for one user."""
    p_known: dict[str, float] = field(default_factory=dict)

    PRIOR = 0.2
    P_TRANSITION = 0.15
    MIN, MAX = 0.01, 0.99
    MASTERED = 0.85
    STRUGGLING = 0.25

    def get(self, concept: str) -> float:
        return self.p_known.get(concept, self.PRIOR)

    def update_from_depth(self, concept: str, depth: Depth, repeated: bool = False) -> float:
        """Bayesian update. If `repeated` (same question re-asked), suppress the
        learning bump — re-asking is not evidence of mastery (fixes the exploit)."""
        prior = self.get(concept)
        lr = DEPTH_EVIDENCE[depth]
        post = (prior * lr) / (prior * lr + (1 - prior))   # Bayes with likelihood ratio
        if not repeated:
            post = post + (1 - post) * self.P_TRANSITION    # learning transition
        post = max(self.MIN, min(self.MAX, post))
        self.p_known[concept] = post
        return post

    def update_negative(self, concept: str) -> float:
        """Strong counter-evidence: failed MCQ, explicit confusion."""
        prior = self.get(concept)
        lr = 0.15
        post = (prior * lr) / (prior * lr + (1 - prior))
        post = max(self.MIN, min(self.MAX, post))
        self.p_known[concept] = post
        return post

    def level(self, concept: str) -> str:
        p = self.get(concept)
        if p >= self.MASTERED: return "mastered"
        if p <= self.STRUGGLING: return "struggling"
        return "learning"


@dataclass
class BanditArm:
    alpha: float = 1.0
    beta: float = 1.0


@dataclass
class StyleBandit:
    """Thompson sampling over explanation styles, per user."""
    arms: dict[str, BanditArm] = field(default_factory=lambda: {s.value: BanditArm() for s in Style})

    def select(self, rng: random.Random) -> str:
        samples = {name: rng.betavariate(a.alpha, a.beta) for name, a in self.arms.items()}
        return max(samples, key=samples.get)

    def update(self, style: str, reward: float) -> None:
        """reward in [-1,1]. Positive bumps alpha, negative bumps beta, scaled."""
        arm = self.arms.setdefault(style, BanditArm())
        if reward >= 0:
            arm.alpha += reward
        else:
            arm.beta += -reward


# ======================= implicit trajectory reward =======================
@dataclass
class Turn:
    question: str
    depth: Depth
    concept: str
    style: str


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b: return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)); nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


CONFUSION_MARKERS = ("don't get", "dont get", "confused", "what do you mean",
                     "still don't", "i don't understand", "lost", "huh")


def trajectory_reward(prev: Turn | None, cur_q: str, cur_depth: Depth,
                      prev_emb: list[float] | None = None,
                      cur_emb: list[float] | None = None) -> float:
    """Infer whether the PREVIOUS answer landed, from the CURRENT question.
    No thumbs-up needed. Returns reward in [-1, 1] to update the bandit.

    Signals:
      + depth went up on the same topic  -> last answer worked
      + moved on to a new topic entirely -> probably satisfied
      - explicit confusion phrase         -> last answer failed
      - re-asked the same thing           -> last answer failed
    """
    if prev is None:
        return 0.0
    ql = cur_q.lower()
    if any(m in ql for m in CONFUSION_MARKERS):
        return -0.8
    continuity = cosine(prev_emb or [], cur_emb or [])
    same_topic = continuity > 0.6 if (prev_emb and cur_emb) else (prev.concept in cur_q.lower())
    depth_order = list(Depth)
    leveled_up = depth_order.index(cur_depth) > depth_order.index(prev.depth)
    if same_topic and leveled_up:
        return 0.7        # strongest positive: same topic, harder question
    if same_topic and not leveled_up and continuity > 0.92:
        return -0.5       # re-asking nearly identical question = didn't land
    if not same_topic:
        return 0.4        # moved on = mild positive (likely satisfied)
    return 0.1            # same topic, same depth = neutral-ish


# ============================== personal memory ==============================
@dataclass
class PersonalMemory:
    """Up to N plain-language observations about the user, injected into prompts."""
    observations: list[str] = field(default_factory=list)
    MAX = 30

    def add(self, obs: str) -> None:
        if obs in self.observations:
            return
        self.observations.append(obs)
        if len(self.observations) > self.MAX:
            self.observations.pop(0)  # FIFO; production: summarize+dedupe

    def as_prompt(self) -> str:
        if not self.observations:
            return "No prior observations about this user yet."
        return "What you know about this learner:\n- " + "\n- ".join(self.observations[-12:])


# ============================== depth dial ==============================
class DepthMode(str, Enum):
    """The learner-controlled depth dial. They can pull it any time, mid-session."""
    IDEA = "idea"          # just the intuition + the click
    BALANCED = "balanced"  # intuition + mechanism + key math
    DEEP = "deep"          # complete: full derivation, edge cases, why-behind-why


def default_depth_for(level: str) -> "DepthMode":
    if level == "struggling":
        return DepthMode.IDEA
    if level == "mastered":
        return DepthMode.DEEP
    return DepthMode.BALANCED


# ================== decision layer (challenge vs teach) ==================
class Pedagogy(str, Enum):
    CHALLENGE = "challenge"   # withhold, let the learner reach (engineer a click)
    TEACH = "teach"           # explain directly and generously
    SCAFFOLD = "scaffold"     # struggling: drop to a prerequisite first


@dataclass
class Decision:
    pedagogy: Pedagogy
    depth: "DepthMode"
    reason: str


def decide(level: str, p_known: float, depth_mode: "DepthMode",
           depth_kind: Depth, has_prereqs: bool, confident: bool,
           prior_turns: int = 0, just_failed: bool = False) -> Decision:
    """The brain. DEFAULT TO GENEROSITY: only withhold (challenge) when confident
    the learner can reach it. Uncertainty -> teach. This removes frustration.

    prior_turns: a brand-new learner (0 prior turns) is NEW, not 'struggling' —
      we teach them generously, we do not scaffold them down on question one.
    just_failed: never challenge a learner immediately after a wrong answer —
      that's the frustration trap. Teach warmly instead.
    """
    # SCAFFOLD only the genuinely STUCK: low mastery AND they've already engaged
    # (>=3 turns) AND prereqs exist. A first-timer is taught, not backed up.
    if (level == "struggling" and prior_turns >= 3 and has_prereqs
            and depth_kind == Depth.SURFACE):
        return Decision(Pedagogy.SCAFFOLD, DepthMode.IDEA,
                        "engaged learner is stuck on a definition; back up to a prereq")

    # never CHALLENGE right after a wrong answer, or on open-ended/creative asks —
    # those want warm direct teaching, not withholding.
    if just_failed or depth_kind == Depth.CREATIVE:
        return Decision(Pedagogy.TEACH, depth_mode,
                        "wrong-answer recovery or open-ended question -> teach warmly")

    # CHALLENGE: mid-mastery (has the pieces), confident, not asking for deep math
    ready = (0.45 <= p_known <= 0.8) and confident and depth_mode != DepthMode.DEEP
    if ready:
        return Decision(Pedagogy.CHALLENGE, depth_mode,
                        "has the pieces and confident enough to reach")

    return Decision(Pedagogy.TEACH, depth_mode,
                    "default to generosity: teach directly at chosen depth")


@dataclass
class UserState:
    """Everything MIRA knows about one user. This is the JSONB row in Postgres."""
    user_id: str
    tier: str = "free"
    beliefs: BeliefState = field(default_factory=BeliefState)
    bandit: StyleBandit = field(default_factory=StyleBandit)
    memory: PersonalMemory = field(default_factory=PersonalMemory)
    last_turn: Turn | None = None
    recent_questions: list[str] = field(default_factory=list)
    depth_mode: "DepthMode" = None  # set in __post_init__

    def __post_init__(self):
        if self.depth_mode is None:
            self.depth_mode = DepthMode.BALANCED

    def to_dict(self) -> dict:  # for Postgres JSONB persistence
        return {
            "user_id": self.user_id, "tier": self.tier,
            "beliefs": self.beliefs.p_known,
            "bandit": {k: [v.alpha, v.beta] for k, v in self.bandit.arms.items()},
            "observations": self.memory.observations,
            "recent_questions": self.recent_questions[-10:],
            "depth_mode": self.depth_mode.value,
            "last_turn": ({"question": self.last_turn.question,
                           "depth": self.last_turn.depth.value,
                           "concept": self.last_turn.concept,
                           "style": self.last_turn.style}
                          if self.last_turn else None),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "UserState":
        s = cls(user_id=d["user_id"], tier=d.get("tier", "free"))
        s.beliefs.p_known = d.get("beliefs", {})
        for k, (a, b) in d.get("bandit", {}).items():
            s.bandit.arms[k] = BanditArm(a, b)
        s.memory.observations = d.get("observations", [])
        s.recent_questions = d.get("recent_questions", [])
        s.depth_mode = DepthMode(d.get("depth_mode", "balanced"))
        lt = d.get("last_turn")
        if lt:
            s.last_turn = Turn(question=lt["question"], depth=Depth(lt["depth"]),
                               concept=lt["concept"], style=lt["style"])
        return s
