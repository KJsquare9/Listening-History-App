from __future__ import annotations

from dataclasses import dataclass
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
            lowered = sample.lower()
            if "trackname" in lowered or "spotify_uri" in lowered or "endtime" in lowered:
                return SpotifyParser.format_id
            if "subtitles" in lowered or "videoid" in lowered or "watch" in lowered:
                return YTMusicParser.format_id
            return SpotifyParser.format_id

        return CSVParser.format_id

    def get(self, format_id: str) -> BaseParser:
        try:
            return self.parsers[format_id]
        except KeyError as exc:
            raise ValueError(f"Unsupported parser format: {format_id}") from exc
