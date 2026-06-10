"""Model tier selection for MIRA's Claude usage during ingestion."""
from __future__ import annotations

from enum import Enum


class ModelTier(str, Enum):
    """Which Claude tier to use for a given task.

    HAIKU  — cheap, fast (classification, light extraction)
    SONNET — balanced (concept extraction — the ingestion default)
    OPUS   — heaviest reasoning (rarely needed at ingestion)
    """
    HAIKU = "haiku"
    SONNET = "sonnet"
    OPUS = "opus"
