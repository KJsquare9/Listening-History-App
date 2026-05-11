from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, ClassVar


@dataclass(slots=True)
class NormalisedEvent:
    track: str
    artist: str
    timestamp: datetime
    ms_played: int
    source: str = "unknown"
    raw: dict[str, Any] = field(default_factory=dict)
    valence: float | None = None
    arousal: float | None = None
    matched: bool = False
    attributes: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["timestamp"] = self.timestamp.isoformat()
        return payload


class BaseParser:
    format_id: ClassVar[str]

    def parse(self, text: str, filename: str | None = None) -> list[NormalisedEvent]:
        raise NotImplementedError
