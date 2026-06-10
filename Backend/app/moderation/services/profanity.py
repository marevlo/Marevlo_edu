"""
Naive profanity filter.

Design goals:
  - Block obvious slurs and crude obscenities at content-creation time.
  - Be replaceable — `contains_profanity()` is the only public function;
    swap implementations (Perspective API, OpenAI moderation, etc.) without
    touching callers.
  - Cheap normalization: NFKD strip + leetspeak fold + whitespace squash, so
    'sh!t', 'shít', 's h i t' all match a single 'shit' entry.

This intentionally errs on the side of FALSE NEGATIVES — better to let
borderline through than to block 'classic' or 'scunthorpe'. Reports + admin
moderation handle the rest.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable

# Keep the list small and unambiguous. Add via PR review, not casually.
# All entries should be ASCII lowercase after normalize().
DEFAULT_BLOCKLIST: tuple[str, ...] = (
    # Slurs (we keep the actual list out of public docs; this is a starter set).
    "fuck",
    "shit",
    "asshole",
    "bitch",
    "cunt",
    "dick",
    "bastard",
    # Severe slurs — frontend never autocompletes; the moderation queue is
    # the secondary backstop.
    "nigger",
    "faggot",
    "retard",
)

_LEET_MAP = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})
_NON_ALPHA = re.compile(r"[^a-z]+")


def _normalize(text: str) -> str:
    """Strip accents, fold leetspeak, squash non-letters."""
    if not text:
        return ""
    # Unicode NFKD: decomposes accented chars so we can drop the combining marks.
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    lowered = ascii_only.lower().translate(_LEET_MAP)
    # Collapse anything that isn't a letter to a single space, then squeeze.
    return _NON_ALPHA.sub(" ", lowered).strip()


def contains_profanity(text: str, *, blocklist: Iterable[str] = DEFAULT_BLOCKLIST) -> bool:
    norm = _normalize(text)
    if not norm:
        return False
    # Word-boundary match — 'classic' must not trip on 'ass', 'scunthorpe' on 'cunt'.
    padded = f" {norm} "
    if any(f" {term} " in padded for term in blocklist):
        return True
    # Letter-spaced obfuscation: 's h i t' → squash single-letter tokens into
    # contiguous words and re-check. This catches 'f u c k' but doesn't trip
    # on a normal sentence (which has multi-letter words separating).
    tokens = norm.split()
    squashed_parts: list[str] = []
    buf: list[str] = []
    for tok in tokens:
        if len(tok) == 1:
            buf.append(tok)
        else:
            if buf:
                squashed_parts.append("".join(buf))
                buf = []
            squashed_parts.append(tok)
    if buf:
        squashed_parts.append("".join(buf))
    squashed = " ".join(squashed_parts)
    if squashed != norm:
        padded2 = f" {squashed} "
        return any(f" {term} " in padded2 for term in blocklist)
    return False
