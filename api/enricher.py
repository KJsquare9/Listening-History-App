from __future__ import annotations

import csv
from dataclasses import dataclass
from difflib import SequenceMatcher
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
        self.by_track: dict[str, list[SongRecord]] = {}
        self.normalized_pairs = [(normalize_text(record.track), normalize_text(record.artist), record) for record in records]
        for record in records:
            self.by_track.setdefault(normalize_text(record.track), []).append(record)

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
        return self.match(track, artist).record

    def match(self, track: str, artist: str) -> "MatchResult":
        exact = self.by_pair.get(pair_key(track, artist))
        if exact:
            return MatchResult(record=exact, confidence=1.0, method="exact_pair")

        normalized_track = normalize_text(track)
        normalized_artist = normalize_text(artist)
        same_title = self.by_track.get(normalized_track, [])
        if len(same_title) == 1:
            record = same_title[0]
            artist_score = _similarity(normalized_artist, normalize_text(record.artist))
            if artist_score >= 0.58:
                return MatchResult(record=record, confidence=round(0.78 + (artist_score * 0.16), 3), method="track_exact_artist_similar")
            return MatchResult(record=None, confidence=0.0, method=None, reason="artist_mismatch")

        best: tuple[float, SongRecord] | None = None
        for candidate_track, candidate_artist, record in self.normalized_pairs:
            track_score = _similarity(normalized_track, candidate_track)
            if track_score < 0.86:
                continue
            artist_score = _similarity(normalized_artist, candidate_artist)
            combined = (track_score * 0.72) + (artist_score * 0.28)
            if artist_score >= 0.52 and (best is None or combined > best[0]):
                best = (combined, record)

        if best and best[0] >= 0.84:
            return MatchResult(record=best[1], confidence=round(best[0], 3), method="fuzzy_pair")

        if same_title:
            return MatchResult(record=None, confidence=0.0, method=None, reason="ambiguous_track")
        return MatchResult(record=None, confidence=0.0, method=None, reason="not_in_song_dataset")


@dataclass(slots=True)
class MatchResult:
    record: SongRecord | None
    confidence: float
    method: str | None
    reason: str = "not_in_song_dataset"


class TrackEnricher:
    def __init__(self, dataset: SongDataset):
        self.dataset = dataset

    def enrich(self, events: list[NormalisedEvent]) -> tuple[list[NormalisedEvent], dict[str, float | int]]:
        matched_count = 0
        enriched_events: list[NormalisedEvent] = []
        unmatched_reasons: dict[str, int] = {}
        confidence_total = 0.0

        for event in events:
            match_result = self.dataset.match(event.track, event.artist)
            match = match_result.record
            if match is None:
                event.unmatched_reason = match_result.reason
                unmatched_reasons[event.unmatched_reason] = unmatched_reasons.get(event.unmatched_reason, 0) + 1
                enriched_events.append(event)
                continue

            if not _meets_minimum_play_threshold(event.ms_played, match.attributes.get("duration_ms")):
                event.unmatched_reason = "below_play_threshold"
                unmatched_reasons[event.unmatched_reason] = unmatched_reasons.get(event.unmatched_reason, 0) + 1
                continue

            matched_count += 1
            confidence_total += match_result.confidence
            event.valence = match.valence
            event.arousal = match.arousal
            event.matched = True
            event.match_confidence = match_result.confidence
            event.match_method = match_result.method
            event.attributes = match.as_dict()
            enriched_events.append(event)

        total = len(enriched_events)
        summary = {
            "total_events": total,
            "matched_events": matched_count,
            "unmatched_events": total - matched_count,
            "match_rate": round((matched_count / total) if total else 0.0, 3),
            "match_confidence_mean": round(confidence_total / matched_count, 3) if matched_count else 0.0,
            "total_ms_played": int(sum(event.ms_played for event in events)),
            "unmatched_reasons": unmatched_reasons,
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


def _similarity(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()
