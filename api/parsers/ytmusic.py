from __future__ import annotations

import json
import re

from api.parsers.base import BaseParser, NormalisedEvent, ParseResult
from api.utils import coerce_text, first_non_empty, parse_int, parse_timestamp


_PLAYED_PREFIX_RE = re.compile(r"^(watched|played|listened to)\s+", re.IGNORECASE)


class YTMusicParser(BaseParser):
    format_id = "ytmusic"

    def parse_with_diagnostics(self, text: str, filename: str | None = None) -> ParseResult:
        result = ParseResult(parser=self.format_id)
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            result.add_warning("invalid_json", f"Could not decode YouTube Music JSON: {exc.msg}", row=exc.lineno)
            return result

        records = payload if isinstance(payload, list) else payload.get("items", payload.get("events", []))

        for index, record in enumerate(records, start=1):
            result.rows_seen += 1
            if not isinstance(record, dict):
                result.add_warning("invalid_record", "Skipped a non-object YouTube Music record.", row=index)
                continue
            title = first_non_empty([coerce_text(record.get("title")), coerce_text(record.get("track")), coerce_text(record.get("videoTitle")), coerce_text(record.get("titleUrl"))])
            title = _clean_title(title)
            artist = first_non_empty(
                [
                    coerce_text(record.get("artist")),
                    coerce_text(record.get("subtitles")),
                    coerce_text(record.get("details")),
                    coerce_text(record.get("channelName")),
                    coerce_text(record.get("header")),
                ]
            )
            timestamp_value = first_non_empty([coerce_text(record.get("time")), coerce_text(record.get("timestamp")), coerce_text(record.get("endTime"))])
            ms_played = parse_int(first_non_empty([record.get("msPlayed"), record.get("ms_played"), record.get("duration_ms"), 0]))
            if not (title and artist and timestamp_value):
                result.add_warning("missing_required_field", "Skipped row missing track, artist, or timestamp.", row=index)
                continue
            try:
                timestamp = parse_timestamp(timestamp_value)
            except ValueError as exc:
                result.add_warning("invalid_timestamp", str(exc), row=index, field="timestamp", value=timestamp_value)
                continue
            result.events.append(NormalisedEvent(track=title, artist=artist, timestamp=timestamp, ms_played=ms_played, source=self.format_id, raw=record))

        return result


def _clean_title(title: str | None) -> str | None:
    if not title:
        return None
    cleaned = _PLAYED_PREFIX_RE.sub("", title).strip()
    return cleaned or None
