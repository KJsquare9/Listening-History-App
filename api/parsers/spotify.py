from __future__ import annotations

import json

from api.parsers.base import BaseParser, NormalisedEvent, ParseResult
from api.utils import coerce_text, first_non_empty, parse_int, parse_timestamp


class SpotifyParser(BaseParser):
    format_id = "spotify"

    def parse_with_diagnostics(self, text: str, filename: str | None = None) -> ParseResult:
        result = ParseResult(parser=self.format_id)
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            result.add_warning("invalid_json", f"Could not decode Spotify JSON: {exc.msg}", row=exc.lineno)
            return result

        records = payload if isinstance(payload, list) else payload.get("items", payload.get("records", []))

        for index, record in enumerate(records, start=1):
            result.rows_seen += 1
            if not isinstance(record, dict):
                result.add_warning("invalid_record", "Skipped a non-object Spotify record.", row=index)
                continue
            track = first_non_empty(
                [
                    coerce_text(record.get("master_metadata_track_name")),
                    coerce_text(record.get("trackName")),
                    coerce_text(record.get("track")),
                    coerce_text(record.get("track_name")),
                    coerce_text(record.get("name")),
                ]
            )
            artist = first_non_empty(
                [
                    coerce_text(record.get("master_metadata_album_artist_name")),
                    coerce_text(record.get("artistName")),
                    coerce_text(record.get("artist")),
                    coerce_text(record.get("artist_name")),
                ]
            )
            timestamp_value = first_non_empty([coerce_text(record.get("endTime")), coerce_text(record.get("ts")), coerce_text(record.get("timestamp"))])
            ms_played = parse_int(first_non_empty([record.get("msPlayed"), record.get("ms_played"), record.get("ms_played_ms"), record.get("duration_ms"), 0]))
            if not (track and artist and timestamp_value):
                result.add_warning("missing_required_field", "Skipped row missing track, artist, or timestamp.", row=index)
                continue
            try:
                timestamp = parse_timestamp(timestamp_value)
            except ValueError as exc:
                result.add_warning("invalid_timestamp", str(exc), row=index, field="timestamp", value=timestamp_value)
                continue
            result.events.append(
                NormalisedEvent(track=track, artist=artist, timestamp=timestamp, ms_played=ms_played, source=self.format_id, raw=record)
            )

        return result
