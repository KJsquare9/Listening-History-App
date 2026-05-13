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
    match_confidence: float = 0.0
    match_method: str | None = None
    unmatched_reason: str | None = None
    attributes: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["timestamp"] = self.timestamp.isoformat()
        return payload


class BaseParser:
    format_id: ClassVar[str]

    def parse(self, text: str, filename: str | None = None) -> list[NormalisedEvent]:
        return self.parse_with_diagnostics(text, filename=filename).events

    def parse_with_diagnostics(self, text: str, filename: str | None = None) -> "ParseResult":
        raise NotImplementedError


@dataclass(slots=True)
class ParseWarning:
    code: str
    message: str
    row: int | None = None
    field: str | None = None
    value: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {key: value for key, value in asdict(self).items() if value is not None}


@dataclass(slots=True)
class ParseResult:
    events: list[NormalisedEvent] = field(default_factory=list)
    warnings: list[ParseWarning] = field(default_factory=list)
    rows_seen: int = 0
    parser: str = "unknown"

    @property
    def dropped_rows(self) -> int:
        return max(0, self.rows_seen - len(self.events))

    def add_warning(
        self,
        code: str,
        message: str,
        *,
        row: int | None = None,
        field: str | None = None,
        value: object | None = None,
    ) -> None:
        self.warnings.append(
            ParseWarning(
                code=code,
                message=message,
                row=row,
                field=field,
                value=None if value is None else str(value),
            )
        )

    def diagnostics(self) -> dict[str, Any]:
        return {
            "parser": self.parser,
            "rows_seen": self.rows_seen,
            "events_parsed": len(self.events),
            "rows_dropped": self.dropped_rows,
            "warnings": [warning.to_dict() for warning in self.warnings],
        }
