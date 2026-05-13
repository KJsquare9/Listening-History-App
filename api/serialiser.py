from __future__ import annotations

from typing import Any

from api.parsers.base import NormalisedEvent


def build_response(
    *,
    format_id: str,
    events: list[NormalisedEvent],
    summary: dict[str, Any],
    reference_groups: dict[str, Any],
    diagnostics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    matched_events = [event for event in events if event.matched]
    valences = [event.valence for event in matched_events if event.valence is not None]
    arousals = [event.arousal for event in matched_events if event.arousal is not None]

    summary = {
        **summary,
        "format": format_id,
        "matched_count": len(matched_events),
        "matched_ratio": round((len(matched_events) / len(events)) if events else 0.0, 3),
        "valence_mean": round(sum(valences) / len(valences), 3) if valences else None,
        "arousal_mean": round(sum(arousals) / len(arousals), 3) if arousals else None,
    }

    return {
        "ok": True,
        "summary": summary,
        "events": [event.to_dict() for event in events],
        "matched_events": [event.to_dict() for event in matched_events],
        "reference_groups": reference_groups,
        "diagnostics": diagnostics or {},
    }
