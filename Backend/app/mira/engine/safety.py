"""Safety gate — runs BEFORE generation. MIRA teaches CS/AI/security, but must
not become an abuse assistant.

Philosophy: ALLOW defensive, educational, and own-code work. BLOCK requests
whose primary purpose is to attack, steal, or harm a system the user doesn't
own. The distinction is intent + target, not topic — "explain how SQL injection
works" is educational (allow); "write a script to dump the users table from
example.com" is an attack (block).

This is a rules-first gate (fast, free) intended to catch the clear cases. A
production deployment should ALSO pass ambiguous cases to an LLM safety
classifier; the hook for that is `needs_llm_review`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class SafetyVerdict:
    allowed: bool
    reason: str = ""
    needs_llm_review: bool = False


# Clear-block patterns: the PURPOSE is offensive use against others.
_BLOCK_PATTERNS = [
    # malware / ransomware / persistence
    r"\b(write|create|build|generate|make|give me)\b.{0,40}\b(malware|ransomware|trojan|keylogger|rootkit|botnet|worm|spyware)\b",
    r"\bransomware\b.{0,30}\b(encrypt|payload|extort)\b",
    r"\b(malware|backdoor)\b.{0,20}\bpersistence\b",
    r"\bpersist(ence)?\b.{0,25}\b(registry|startup|scheduled task|launchd|cron)\b.{0,25}\b(evade|hidden|stealth)\b",
    # reverse shell / C2
    r"\breverse shell\b",
    r"\b(bind|reverse)\b.{0,15}\bshell\b.{0,25}\b(payload|target|victim)\b",
    r"\bcommand\s*(and|&)\s*control\b|\bc2 server\b",
    # credential theft / phishing / spraying
    r"\b(phishing|phish)\b.{0,30}\b(kit|page|email|template|campaign|clone)\b",
    r"\b(steal|harvest|dump|exfiltrate|capture)\b.{0,30}\b(credential|password|cookie|session|token|card|hash)\b",
    r"\bcredential\b.{0,20}\b(steal|harvest|theft|stuffing|spray)\b",
    r"\bpassword\s*spray(ing)?\b",
    # exfiltration
    r"\b(exfiltrate|steal|smuggle|leak)\b.{0,25}\b(file|data|database|document)\b.{0,25}\b(out|from|server|network)\b",
    r"\bexfiltrat\w+\b",
    # exploitation against a target
    r"\b(exploit|attack|hack|breach|compromise|pwn)\b.{0,30}\b(this site|their server|the target|live site|production|example\.com|\.gov|\.bank|public ip)\b",
    r"\b(sql injection|xss|csrf|rce|ssrf)\b.{0,30}\b(payload|to attack|against|exploit|dump|extract)\b",
    r"\bpublic ip\b.{0,20}\bexploit\b|\bexploit\b.{0,20}\bpublic ip\b",
    # auth / control bypass
    r"\bbypass\b.{0,25}\b(authentication|auth|login|2fa|mfa|paywall|license|rate.?limit)\b",
    r"\b(crack|brute.?force)\b.{0,25}\b(password|hash|login|account)\b",
    r"\bdisable\b.{0,20}\b(antivirus|firewall|defender|edr|security)\b",
    r"\b(evade|bypass|defeat)\b.{0,20}\b(antivirus|edr|detection|sandbox)\b",
    # DDoS / abuse
    r"\b(ddos|dos attack|flood|stress)\b.{0,25}\b(script|tool|target|server|site)\b",
    r"\b(scrape|scraping)\b.{0,30}\b(bypass|evade|rotate proxies to avoid|circumvent rate|defeat captcha)\b",
    # prompt-injection / model abuse / jailbreak
    r"\b(prompt injection|jailbreak)\b.{0,30}\b(attack|payload|to bypass|prompt|the model|the system)\b",
    r"\bignore (your |all |previous )?(instructions|system prompt|guidelines)\b",
    r"\b(write|give|craft)\b.{0,25}\bjailbreak\b.{0,20}\bprompt\b",
]

# Defensive/educational signals that KEEP a borderline request allowed.
_ALLOW_SIGNALS = [
    r"\b(explain|understand|how does|what is|learn|study)\b",
    r"\b(prevent|defend|protect|mitigate|secure|harden|fix|patch)\b",
    r"\b(my own|my code|my app|my server|my project|test environment|ctf|capture the flag|sandbox|lab)\b",
    r"\b(detect|detection|monitoring|best practice)\b",
]

_BLOCK_RES = [re.compile(p, re.I) for p in _BLOCK_PATTERNS]
_ALLOW_RES = [re.compile(p, re.I) for p in _ALLOW_SIGNALS]


def check_safety(question: str) -> SafetyVerdict:
    """Fast pre-generation safety gate."""
    q = question.lower()

    blocked = any(r.search(q) for r in _BLOCK_RES)
    has_allow_signal = any(r.search(q) for r in _ALLOW_RES)

    if blocked:
        # An explicit defensive/educational framing can rescue a borderline hit,
        # BUT only if there's no live-target / theft / weaponization language.
        hard_block = re.search(
            r"\b(steal|harvest|exfiltrate|dump|capture)\b.{0,30}\b(credential|password|cookie|card|hash|file|data)\b"
            r"|\b(malware|ransomware|keylogger|botnet|rootkit|spyware)\b"
            r"|\breverse shell\b|\bc2 server\b|\bcommand and control\b"
            r"|\bphishing\b.{0,30}\b(kit|page|campaign|clone)\b"
            r"|\bpassword spray|\bexfiltrat"
            r"|\bdisable\b.{0,20}\b(antivirus|firewall|defender|edr)\b"
            r"|\bpersistence\b.{0,25}\b(stealth|hidden|evade)\b",
            q, re.I)
        if hard_block:
            return SafetyVerdict(False,
                "This looks like a request to build something for attacking, "
                "stealing, or harming systems. I can teach the defensive and "
                "educational side — how attacks work and how to prevent them — "
                "but I can't help build the attack itself.")
        if has_allow_signal:
            # defensive framing on a softer pattern -> allow, but flag for LLM review
            return SafetyVerdict(True, needs_llm_review=True)
        return SafetyVerdict(False,
            "I can help with the defensive and educational side of security "
            "(how it works, how to prevent it, securing your own code), but not "
            "with building tools to attack or gain unauthorized access.")

    return SafetyVerdict(True)


# ---- LLM safety classifier hook (rule + model, per strict review #5) -------
_SAFETY_CLASSIFIER_PROMPT = (
    "You are a safety classifier for a coding/AI tutor. Decide if the user request "
    "is asking you to BUILD or ENABLE an attack, malware, credential theft, "
    "unauthorized access, or abuse of a system they don't own. Educational "
    "explanations, defensive security, securing one's own code, and CTF/lab "
    "exercises are SAFE. Respond with exactly one word: BLOCK or ALLOW.")


def llm_safety_check(question: str, provider) -> SafetyVerdict:
    """Optional second layer: ask a model to classify ambiguous requests. Used
    when the rule layer flags needs_llm_review. Fails OPEN to the rule verdict on
    any error so the model can't accidentally unblock a hard rule hit."""
    try:
        comp = provider.complete(_SAFETY_CLASSIFIER_PROMPT, question, max_tokens=4)
        verdict = (comp.text or "").strip().upper()
        if "BLOCK" in verdict:
            return SafetyVerdict(False,
                "This request looks like it could enable harm. I can help with the "
                "defensive or educational side instead.")
        return SafetyVerdict(True)
    except Exception:
        # on any failure, defer to allow (the rule layer already passed it)
        return SafetyVerdict(True)


def safety_block_blocks(reason: str) -> list[dict]:
    """The block array returned when a request is refused on safety grounds."""
    return [{"type": "callout", "variant": "warning",
             "title": "I can't help with that",
             "content": reason}]


def check_safety_all(question: str, history: list[dict] | None = None,
                     page_context: str | None = None,
                     doc_context: str | None = None) -> SafetyVerdict:
    """Issue #11: the safety gate must cover EVERY channel that reaches the
    model prompt, not just the current question. The client-supplied history
    (including forgeable 'mira'-role turns) and the page context are pasted
    verbatim into the prompt — blocked content moved into a history entry
    previously sailed straight through.

    Policy: the QUESTION's verdict carries its needs_llm_review flag (the
    caller may run the LLM second layer on it). History/page-context entries
    are checked with the rules gate only — a HARD rule hit in any of them
    blocks the turn; soft hits there do not (they are context, not the ask)."""
    v = check_safety(question)
    if not v.allowed:
        return v
    extra_texts: list[str] = []
    for m in (history or []):
        c = (m or {}).get("content") if isinstance(m, dict) else None
        if isinstance(c, str) and c.strip():
            extra_texts.append(c)
    if isinstance(page_context, str) and page_context.strip():
        extra_texts.append(page_context)
    # uploaded-document excerpts are a prompt channel too — a hard-block
    # phrase inside the PDF must not ride into the model via retrieval.
    if isinstance(doc_context, str) and doc_context.strip():
        extra_texts.append(doc_context)
    for t in extra_texts:
        hv = check_safety(t)
        if not hv.allowed:
            return SafetyVerdict(False,
                "Part of this conversation's context contains a request to "
                "build something for attacking, stealing, or harming systems. "
                "I can teach the defensive and educational side, but I can't "
                "continue with that thread. Start a fresh question and I'll help.")
    return v
