"""Immutable evidence of an authority-changing operation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class ProvenanceInput:
    subject_type: str
    subject_id: str
    activity: str
    input_digest: str | None
    output_digest: str | None
    actor: str
    details: Mapping[str, str]
