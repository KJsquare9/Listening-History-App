from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from api.parsers.base import BaseParser
from api.parsers.csv_parser import CSVParser
from api.parsers.spotify import SpotifyParser
from api.parsers.ytmusic import YTMusicParser


@dataclass(slots=True)
class ParserRegistry:
    parsers: dict[str, BaseParser]

    @classmethod
    def default(cls) -> "ParserRegistry":
        parsers = {
            SpotifyParser.format_id: SpotifyParser(),
            YTMusicParser.format_id: YTMusicParser(),
            CSVParser.format_id: CSVParser(),
        }
        return cls(parsers=parsers)

    def detect_format(self, filename: str | None, text: str) -> str:
        if filename:
            suffix = Path(filename).suffix.lower()
            if suffix == ".json":
                lower_name = Path(filename).name.lower()
                if "spotify" in lower_name or "streaminghistory" in lower_name:
                    return SpotifyParser.format_id
                if "yt" in lower_name or "music" in lower_name:
                    return YTMusicParser.format_id
            if suffix in {".csv", ".tsv"}:
                return CSVParser.format_id

        sample = text.lstrip()
        if sample.startswith("[") or sample.startswith("{"):
            lowered = sample[:12000].lower()
            if _looks_like_youtube(lowered):
                return YTMusicParser.format_id
            if _looks_like_spotify(lowered):
                return SpotifyParser.format_id
            try:
                payload = json.loads(sample)
            except json.JSONDecodeError:
                return SpotifyParser.format_id
            first = payload[0] if isinstance(payload, list) and payload else payload
            if isinstance(first, dict) and first.get("header") == "YouTube":
                return YTMusicParser.format_id
            return SpotifyParser.format_id

        return CSVParser.format_id

    def get(self, format_id: str) -> BaseParser:
        try:
            return self.parsers[format_id]
        except KeyError as exc:
            raise ValueError(f"Unsupported parser format: {format_id}") from exc


def _looks_like_spotify(text: str) -> bool:
    spotify_markers = (
        "trackname",
        "artistname",
        "spotify_uri",
        "master_metadata_track_name",
        "msplayed",
        "\"ts\"",
    )
    return any(marker in text for marker in spotify_markers)


def _looks_like_youtube(text: str) -> bool:
    youtube_markers = ("youtube", "youtube music", "subtitles", "videoid", "titleurl", "watch")
    return any(marker in text for marker in youtube_markers)
