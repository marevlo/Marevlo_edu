"""Intent classification + domain boundary.

Every request is tagged before answering:
  - intent: LEARN / PRACTICE / CODE_PLEASE / BUILD / DEBUG / OFF_TOPIC
  - technical_core: is there a CS/AI/coding core at all?
  - in_core_domain: is it specifically CS / AI / coding (MIRA's domain)?
  - confidence: high/low — low triggers a one-tap disambiguation instead of a guess

Design: a fast RULES pass handles the obvious cases for free (no LLM call).
Only ambiguous cases fall through to an LLM classifier call. This keeps the
common path cheap and instant.

The domain decision (locked with Sid): MIRA serves CS, AI, and coding — the
whole of it. Adjacent fields only via their computing bridge (quantum COMPUTING
yes, ML-for-physics yes, pure physics no). Non-technical → warm redirect.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class Intent(str, Enum):
    LEARN = "LEARN"            # understand a concept -> walkthrough
    PRACTICE = "PRACTICE"      # drill problems -> stacked cards, hints
    CODE_PLEASE = "CODE_PLEASE"  # write me a self-contained thing -> code first
    BUILD = "BUILD"            # help on THEIR project -> scope then build
    DEBUG = "DEBUG"            # something's broken -> diagnostic
    OFF_TOPIC = "OFF_TOPIC"    # no computing core -> warm redirect


@dataclass
class Classification:
    intent: Intent
    technical_core: bool
    in_core_domain: bool
    confidence: str            # "high" | "low"
    concept_hint: str | None = None
    language: str | None = None
    is_their_project: bool = False
    # wants_code: the user expects runnable code in the answer (CODE/BUILD/DEBUG).
    # wants_explanation: they ALSO asked to understand it ("explain X and code it")
    #   -> the code answer teaches through the code instead of dumping it.
    wants_code: bool = False
    wants_explanation: bool = False
    # why this classification was produced — "rules" | "llm" |
    # "classifier_failed_or_uncertain" (the fail-open path). Audit/debug only.
    reason: str | None = None


# ---- vocabulary the rules pass keys on ----
_LEARN_CUES = ("what is", "what's", "explain", "how does", "how do", "how is",
               "how to", "how can i", "understand", "i don't get", "teach me",
               "intuition", "why does", "what are", "difference between", "compare")
_PRACTICE_CUES = ("give me problems", "practice", "quiz me", "exercises",
                  "problems to solve", "more like that", "drill", "leetcode",
                  "give me 3", "give me a few", "give me some", "problems that",
                  "practice problems", "more problems", "similar problems")
_CODE_PLEASE_CUES = ("code", "write a function", "implement", "write code",
                     "give me the code", "write me", "snippet", "one-liner")
# STRONG, unambiguous "produce code" requests. Unlike the bare word "code"
# (which appears in conceptual asks like "what is clean code"), these always
# mean: write me runnable code — even alongside an "explain" cue.
_STRONG_CODE_CUES = ("write a function", "write code", "write the code",
                     "write me", "give me the code", "give me code", "code for",
                     "the code for", "implement", "snippet", "one-liner",
                     "code it", "show me the code", "show me code")
_BUILD_CUES = ("my project", "my app", "office project", "build me", "build a",
               "build an", "help me build", "wire", "integrate", "for my",
               "in my", "production", "deploy", "set up a", "create an app",
               "backend for", "frontend for")
_DEBUG_CUES = ("error", "bug", "doesn't work", "not working", "fails", "failing",
               "why does my", "exception", "traceback", "nan", "crash", "broken",
               "returns none", "unexpected")

# computing domain vocabulary — broad CS/AI/coding
_CORE_DOMAIN = (
    # AI/ML/DS
    "transformer", "attention", "neural", "embedding", "gradient", "backprop",
    "llm", "rag", "fine-tun", "lora", "diffusion", "gan", "rl ", "reinforcement",
    "machine learning", "deep learning", "model", "dataset", "feature", "loss",
    "autoencoder", "clustering", "regression", "classifier", "nlp", "cnn", "rnn",
    "gnn", "graph neural", "bayesian", "bandit", "anomaly",
    # CS / coding
    "algorithm", "data structure", "array", "linked list", "tree", "graph",
    "hash", "hashmap", "hash-map", "hash map", "sort", "search", "recursion",
    "dynamic programming", "complexity", "big o", "python", "javascript", "java",
    "go ", "golang", "rust", "c++", "sql", "database", "api", "backend",
    "frontend", "react", "fastapi", "flask", "function", "class", "loop",
    "pointer", "memory", "thread", "async", "compiler", "operating system",
    "network", "tcp", "http", "security", "encryption", "injection",
    "authentication", "cache", "queue", "docker", "kubernetes", "git", "regex",
    "two sum", "two-sum", "2 sum", "2-sum", "3 sum", "3-sum", "binary search",
    "leetcode", "function", "code",
    # computing bridges into other fields
    "quantum comput", "quantum algorithm", "qubit",
    # ML systems / data engineering taxonomy (strict review #8)
    "ml", "ai", "genai", "generative ai", "pipeline", "data pipeline",
    "training pipeline", "inference pipeline", "etl", "elt", "feature store",
    "recommendation", "recommender", "recsys", "collaborative filtering",
    "ranking", "retrieval", "vector", "vector database", "vector db",
    "fine tuning", "prompt", "agent", "mlops", "deployment", "inference",
    "tokeniz", "quantization", "distillation", "transfer learning",
    # OOP / language concepts
    "oop", "object oriented", "object-oriented", "inheritance", "polymorphism",
    "encapsulation", "abstraction", "interface", "method", "constructor",
    "decorator", "generic", "closure", "lambda", "iterator", "generator",
    "exception", "module", "package", "dependency", "microservice",
)

# clearly NON-technical -> off topic
_OFF_TOPIC_CUES = ("recipe", "cook", "relationship", "girlfriend", "boyfriend",
                   "marketing strategy", "stock tip", "should i buy", "horoscope",
                   "weather", "movie", "song lyrics", "diet", "workout",
                   "investment advice", "will the market", "poem about")


def _normalize(text: str) -> str:
    """Lowercase + strip simple plurals so 'transformers'->'transformer',
    'embeddings'->'embedding', 'databases'->'database', 'apis'->'api'. This
    fixes the paid-trust bug where plural technical terms were wrongly
    redirected as off-topic."""
    t = text.lower().strip()
    words = []
    for w in re.findall(r"[a-z0-9+#-]+", t):
        # crude but effective de-pluralization for tech vocab
        if len(w) > 4 and w.endswith("ies"):
            w = w[:-3] + "y"
        elif len(w) > 4 and w.endswith("sses"):   # classes->class, passes->pass
            w = w[:-2]
        elif len(w) > 4 and w.endswith("es") and not w.endswith("ses"):
            w = w[:-2]
        elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        words.append(w)
    return " ".join(words)


def _has_any(text: str, cues) -> bool:
    return any(c in text for c in cues)


import re as _re
_DOMAIN_PATTERNS = None

def _looks_technical(text: str) -> bool:
    """Word-boundary match against domain vocab, on the NORMALIZED text so
    plurals match. Avoids both the 'api in capital' false positive AND the
    'transformers != transformer' false negative."""
    global _DOMAIN_PATTERNS
    if _DOMAIN_PATTERNS is None:
        pats = []
        for term in _CORE_DOMAIN:
            t = term.strip()
            if not t:
                continue
            if " " in t or "-" in t:
                pats.append(_re.escape(t))
            else:
                pats.append(r"\b" + _re.escape(t) + r"\b")
        _DOMAIN_PATTERNS = _re.compile("|".join(pats))
    norm = _normalize(text)
    return bool(_DOMAIN_PATTERNS.search(norm)) or bool(_DOMAIN_PATTERNS.search(text))


def classify_rules(message: str) -> Classification | None:
    """Fast rules pass. Returns a Classification if confident, else None
    (caller then falls through to the LLM classifier)."""
    t = message.lower().strip()

    # 1. clearly off-topic with no technical core
    if _has_any(t, _OFF_TOPIC_CUES) and not _looks_technical(t):
        return Classification(Intent.OFF_TOPIC, technical_core=False,
                              in_core_domain=False, confidence="high")

    technical = _looks_technical(t)

    # 2. DEBUG — strong, specific cues
    if _has_any(t, _DEBUG_CUES):
        return Classification(Intent.DEBUG, technical_core=True,
                              in_core_domain=technical, confidence="high" if technical else "low",
                              language=_detect_language(t))

    # 3. BUILD — "my project / build me an app" cues, but ONLY if there's a
    #    technical core. "build a perfume brand" / "set up a pooja room" are not
    #    BUILD just because they contain "build a" / "set up a".
    if _has_any(t, _BUILD_CUES):
        if technical:
            return Classification(Intent.BUILD, technical_core=True,
                                  in_core_domain=True, confidence="high",
                                  language=_detect_language(t), is_their_project=True)
        # build-ish phrasing but no technical core -> defer to LLM (low conf),
        # or redirect if clearly non-technical.
        if _has_any(t, _OFF_TOPIC_CUES):
            return Classification(Intent.OFF_TOPIC, technical_core=False,
                                  in_core_domain=False, confidence="high")
        return Classification(Intent.BUILD, technical_core=False,
                              in_core_domain=False, confidence="low",
                              is_their_project=True)

    # 4. PRACTICE
    if _has_any(t, _PRACTICE_CUES):
        return Classification(Intent.PRACTICE, technical_core=True,
                              in_core_domain=technical, confidence="high")

    # 5. CODE_PLEASE — an explicit request to PRODUCE code. A mixed ask
    #    ("explain X AND write the code") still routes here because code is the
    #    concrete deliverable, but flags wants_explanation so the answer teaches
    #    through the code instead of dumping it. A bare "code" mention WITHOUT a
    #    learn cue also lands here; "what is clean code" (learn cue + only the
    #    weak "code" mention, no strong request) correctly stays LEARN.
    has_learn = _has_any(t, _LEARN_CUES)
    if _has_any(t, _STRONG_CODE_CUES) or (_has_any(t, _CODE_PLEASE_CUES) and not has_learn):
        return Classification(Intent.CODE_PLEASE, technical_core=True,
                              in_core_domain=technical, confidence="high",
                              language=_detect_language(t),
                              concept_hint=_concept_hint(t),
                              wants_code=True, wants_explanation=has_learn)

    # 6. LEARN — explain/understand cues
    if has_learn:
        if technical:
            return Classification(Intent.LEARN, technical_core=True, in_core_domain=True,
                                  confidence="high", concept_hint=_concept_hint(t))
        # Not obviously technical. If it has a CLEAR non-technical cue, redirect
        # decisively. Otherwise it's an UNKNOWN term ("what are embeddings" before
        # the term is in our vocab) — do NOT high-confidence redirect; defer to the
        # LLM classifier (low confidence) so we don't reject real tech questions.
        if _has_any(t, _OFF_TOPIC_CUES):
            return Classification(Intent.OFF_TOPIC, technical_core=False,
                                  in_core_domain=False, confidence="high")
        return Classification(Intent.LEARN, technical_core=False,
                              in_core_domain=False, confidence="low",
                              concept_hint=_concept_hint(t))

    # 7. Bare technical term with no clear verb -> probably LEARN, but low confidence
    if technical:
        return Classification(Intent.LEARN, technical_core=True, in_core_domain=True,
                              confidence="low", concept_hint=_concept_hint(t))

    # nothing matched -> let the LLM decide
    return None


def is_explicit_off_topic(message: str) -> bool:
    """True only when the message has a clear NON-technical cue and no technical
    content (e.g. 'what's the weather'). Used to still redirect a genuinely
    off-topic ask even inside an in-domain context like a live problem page,
    while letting vague-but-on-task asks ('why isn't this working') through."""
    t = message.lower().strip()
    return _has_any(t, _OFF_TOPIC_CUES) and not _looks_technical(t)


def _detect_language(t: str) -> str | None:
    # order matters: check longer/overlapping names first ("javascript" before
    # "java", "typescript" before its substring) and return on first hit.
    for lang in ("javascript", "typescript", "python", "kotlin", "swift",
                 "golang", "java", "rust", "c++", "csharp", "c#", "php",
                 "ruby", "scala", "sql", "react", "go"):
        if lang in t:
            if lang == "golang":
                return "go"
            if lang == "csharp":
                return "c#"
            return lang
    return None


def _concept_hint(t: str) -> str | None:
    # cheap concept extraction for routing; real concept match happens in pipeline
    for c in ("two sum", "two-sum", "transformer", "attention", "backprop",
              "rag", "lora", "binary search", "dynamic programming",
              "sparse autoencoder", "embedding", "neural network"):
        if c in t:
            return c.replace(" ", "_").replace("-", "_")
    return None


# ---- LLM fallback classifier (only for ambiguous cases) ----
LLM_CLASSIFIER_SYSTEM = """You are MIRA's request router. Classify the message.
Output STRICT JSON only: {"intent": "...", "technical_core": bool,
"in_core_domain": bool, "concept_hint": str|null, "language": str|null,
"is_their_project": bool}.

intent ∈ [LEARN, PRACTICE, CODE_PLEASE, BUILD, DEBUG, OFF_TOPIC].
- LEARN: wants to understand a concept.
- PRACTICE: wants problems to drill.
- CODE_PLEASE: wants a self-contained piece of code written.
- BUILD: help on THEIR specific project/app.
- DEBUG: something is broken.
- OFF_TOPIC: no computer-science / AI / coding core.

in_core_domain = true only if the CORE is computer science, AI, or coding
(quantum computing = yes; ML-for-anything = yes; pure physics/finance/biology
with no computing core = false). Judge on the core, not the surface topic."""


def _fail_open(message: str = "") -> Classification:
    """The classifier could not produce a trustworthy verdict. FAIL OPEN to
    LEARN/low — never OFF_TOPIC. Cost asymmetry: answering a question that
    turns out off-topic costs a fraction of a rupee in tokens; refusing a
    paying user's legitimate question ("what is a monad?") costs the user.
    OFF_TOPIC requires POSITIVE evidence, not classifier failure."""
    return Classification(
        Intent.LEARN, technical_core=True, in_core_domain=True,
        confidence="low", concept_hint=_concept_hint(message.lower()),
        reason="classifier_failed_or_uncertain")


def _extract_json_obj(raw: str) -> dict | None:
    """Tolerant extraction of ONE JSON object from model output. Handles:
    a bare object; a JSON array (takes the first object element); ```json
    fences; prose before/after the JSON. Returns None if nothing usable."""
    import json
    if not raw or not raw.strip():
        return None
    t = raw.strip()
    # strip code fences anywhere (```json ... ``` or bare ```)
    t = _re.sub(r"```(?:json)?", "", t, flags=_re.I).strip()
    # 1) direct parse — object, or array containing an object
    try:
        d = json.loads(t)
        if isinstance(d, dict):
            return d
        if isinstance(d, list):
            for item in d:
                if isinstance(item, dict):
                    return item
            return None
    except Exception:
        pass
    # 2) first balanced {...} substring inside surrounding prose
    start = t.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(t)):
            c = t[i]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        d = json.loads(t[start:i + 1])
                        if isinstance(d, dict):
                            return d
                    except Exception:
                        pass
                    break
        start = t.find("{", start + 1)
    return None


def classify_llm(message: str, provider) -> Classification:
    """Used only when rules are uncertain. `provider` is an engine Provider.

    Failure policy (issue #4): ANY failure — provider error, timeout, malformed
    JSON, a JSON array instead of an object, missing keys, an unknown intent
    value — fails OPEN to LEARN/low via _fail_open(). OFF_TOPIC is returned
    only when the model POSITIVELY classifies the message as off-topic."""
    try:
        comp = provider.complete(LLM_CLASSIFIER_SYSTEM, message, max_tokens=200)
        if not getattr(comp, "ok", True):
            return _fail_open(message)
        d = _extract_json_obj(getattr(comp, "text", "") or "")
        if d is None:
            return _fail_open(message)
        raw_intent = str(d.get("intent", "LEARN")).strip().upper()
        try:
            intent = Intent(raw_intent)
        except ValueError:
            return _fail_open(message)
        if intent == Intent.OFF_TOPIC:
            # Positive off-topic verdict from the model. Belt-and-suspenders:
            # if the text plainly contains core technical vocabulary, the model
            # is wrong more often than the vocab is — fail open instead.
            if _looks_technical(message):
                return _fail_open(message)
            return Classification(
                Intent.OFF_TOPIC, technical_core=False, in_core_domain=False,
                confidence="high", reason="llm")
        return Classification(
            intent=intent,
            technical_core=bool(d.get("technical_core", True)),
            in_core_domain=bool(d.get("in_core_domain", True)),
            confidence="high",
            concept_hint=d.get("concept_hint"),
            language=d.get("language"),
            is_their_project=bool(d.get("is_their_project", False)),
            wants_code=bool(d.get("wants_code",
                                  intent in (Intent.CODE_PLEASE, Intent.BUILD, Intent.DEBUG))),
            wants_explanation=bool(d.get("wants_explanation", False)),
            reason="llm",
        )
    except Exception:
        return _fail_open(message)


def classify(message: str, provider=None) -> Classification:
    """Main entry: rules first (free), LLM only if rules are uncertain.

    Fallback policy (issue #4): when neither rules nor the LLM produce a
    confident verdict, fail OPEN to LEARN/low. OFF_TOPIC requires positive
    evidence — an explicit non-technical cue (is_explicit_off_topic) or a
    confident rules/LLM verdict — never mere uncertainty."""
    r = classify_rules(message)
    if r is not None and r.confidence == "high":
        return r
    if provider is not None:
        out = classify_llm(message, provider)
        # A failed/uncertain LLM pass must not downgrade a usable rules guess:
        # keep the rules intent (e.g. CODE_PLEASE w/ wants_code) but adopt the
        # fail-open domain so the pipeline doesn't redirect it.
        if (out.reason == "classifier_failed_or_uncertain" and r is not None
                and r.intent != Intent.OFF_TOPIC):
            from dataclasses import replace as _replace
            return _replace(r, in_core_domain=True, technical_core=True,
                            confidence="low",
                            reason="classifier_failed_or_uncertain")
        return out
    # No provider and rules uncertain:
    if r is not None and r.intent == Intent.OFF_TOPIC:
        return r
    if is_explicit_off_topic(message):
        return Classification(Intent.OFF_TOPIC, technical_core=False,
                              in_core_domain=False, confidence="high",
                              reason="rules")
    if r is not None:
        # a low-confidence non-off-topic rules guess: keep its intent but fail
        # open on domain so an unknown term ("what is a monad?") gets ANSWERED.
        from dataclasses import replace as _replace
        return _replace(r, in_core_domain=True, technical_core=True,
                        reason="classifier_failed_or_uncertain")
    return _fail_open(message)
