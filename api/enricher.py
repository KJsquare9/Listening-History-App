from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from api.parsers.base import NormalisedEvent
from api.utils import normalize_text, pair_key


@dataclass(slots=True)
class SongRecord:
    track: str
    artist: str
    valence: float
    arousal: float
    attributes: dict[str, str]

    def as_dict(self) -> dict[str, str | float]:
        payload: dict[str, str | float] = {
            "track": self.track,
            "artist": self.artist,
            "valence": self.valence,
            "arousal": self.arousal,
        }
        payload.update(self.attributes)
        return payload


class SongDataset:
    def __init__(self, records: list[SongRecord]):
        self.records = records
        self.by_pair = {pair_key(record.track, record.artist): record for record in records}
        self.by_track = {normalize_text(record.track): record for record in records}

    @classmethod
    def load(cls, csv_path: Path) -> "SongDataset":
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            records: list[SongRecord] = []
            for row in reader:
                track = (row.get("track") or "").strip()
                artist = (row.get("artist") or "").strip()
                if not track or not artist:
                    continue
                valence = float(row.get("valence", 0.0))
                arousal = float(row.get("arousal", 0.0))
                attributes = {
                    key: value
                    for key, value in row.items()
                    if key not in {"track", "artist", "valence", "arousal"} and value not in {None, ""}
                }
                records.append(SongRecord(track=track, artist=artist, valence=valence, arousal=arousal, attributes=attributes))
        return cls(records)

    def lookup(self, track: str, artist: str) -> SongRecord | None:
        exact = self.by_pair.get(pair_key(track, artist))
        if exact:
            return exact
        return self.by_track.get(normalize_text(track))


class TrackEnricher:
    def __init__(self, dataset: SongDataset):
        self.dataset = dataset

    def enrich(self, events: list[NormalisedEvent]) -> tuple[list[NormalisedEvent], dict[str, float | int]]:
        matched_count = 0
        enriched_events: list[NormalisedEvent] = []

        for event in events:
            match = self.dataset.lookup(event.track, event.artist)
            if match is None:
                enriched_events.append(event)
                continue

            matched_count += 1
            event.valence = match.valence
            event.arousal = match.arousal
            event.matched = True
            event.attributes = match.as_dict()
            enriched_events.append(event)

        total = len(events)
        summary = {
            "total_events": total,
            "matched_events": matched_count,
            "unmatched_events": total - matched_count,
            "match_rate": round((matched_count / total) if total else 0.0, 3),
            "total_ms_played": int(sum(event.ms_played for event in events)),
        }
        return enriched_events, summary
