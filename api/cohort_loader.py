from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from api.enricher import TrackEnricher
from api.parsers.base import NormalisedEvent
from api.utils import parse_timestamp


@dataclass(slots=True)
class CohortDataset:
    name: str
    events: list[NormalisedEvent]


class CohortLoader:
    def __init__(self, root: Path, enricher: TrackEnricher):
        self.root = root
        self.enricher = enricher
        self._cache: dict[str, dict[str, object]] | None = None

    def load(self) -> dict[str, dict[str, object]]:
        if self._cache is not None:
            return self._cache

        output: dict[str, dict[str, object]] = {}
        for cohort_name in ("high_depression", "low_depression"):
            cohort_path = self.root / cohort_name / f"{cohort_name}.csv"
            output[cohort_name] = self._load_single(cohort_name, cohort_path)
        self._cache = output
        return output

    def _load_single(self, cohort_name: str, csv_path: Path) -> dict[str, object]:
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            events: list[NormalisedEvent] = []
            for row in reader:
                event = NormalisedEvent(
                    track=row["track"],
                    artist=row["artist"],
                    timestamp=parse_timestamp(row["timestamp"]),
                    ms_played=int(float(row.get("ms_played", 0) or 0)),
                    source=cohort_name,
                    raw=row,
                )
                events.append(event)

        enriched_events, summary = self.enricher.enrich(events)
        return {
            "summary": summary,
            "events": [event.to_dict() for event in enriched_events],
        }
