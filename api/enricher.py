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
    attributes: dict[str, str | float | int]

    def as_dict(self) -> dict[str, str | float | int]:
        payload: dict[str, str | float | int] = {
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
                duration_value = row.get("duration_ms")
                if duration_value in {None, ""}:
                    duration_value = _estimate_duration_ms(row)
                attributes = {
                    key: value
                    for key, value in row.items()
                    if key not in {"track", "artist", "valence", "arousal", "duration_ms"} and value not in {None, ""}
                }
                attributes["duration_ms"] = duration_value
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

            if not _meets_minimum_play_threshold(event.ms_played, match.attributes.get("duration_ms")):
                continue

            matched_count += 1
            event.valence = match.valence
            event.arousal = match.arousal
            event.matched = True
            event.attributes = match.as_dict()
            enriched_events.append(event)

        total = len(enriched_events)
        summary = {
            "total_events": total,
            "matched_events": matched_count,
            "unmatched_events": total - matched_count,
            "match_rate": round((matched_count / total) if total else 0.0, 3),
            "total_ms_played": int(sum(event.ms_played for event in events)),
        }
        return enriched_events, summary


def _estimate_duration_ms(row: dict[str, str]) -> int:
    tempo_text = row.get("tempo") or row.get("energy") or "120"
    try:
        tempo = float(tempo_text)
    except (TypeError, ValueError):
        tempo = 120.0
    return int(max(120000, round(tempo * 1800)))


def _meets_minimum_play_threshold(ms_played: int, duration_value: str | float | int | None) -> bool:
    if duration_value in {None, ""}:
        return True

    try:
        duration_ms = int(float(duration_value))
    except (TypeError, ValueError):
        return True

    if duration_ms <= 0:
        return True

    return ms_played >= (duration_ms / 2)
