from __future__ import annotations

import csv
from io import StringIO

from api.parsers.base import BaseParser, NormalisedEvent, ParseResult
from api.utils import first_non_empty, parse_int, parse_timestamp


FIELD_ALIASES = {
    "track": {"track", "trackname", "track_name", "song", "songname", "song_title", "title", "master_metadata_track_name"},
    "artist": {"artist", "artistname", "artist_name", "artist(s)", "artists", "album_artist", "master_metadata_album_artist_name"},
    "timestamp": {"timestamp", "time", "played_at", "playedat", "endtime", "end_time", "date", "datetime", "ts"},
    "ms_played": {"ms_played", "msplayed", "msplayedms", "milliseconds", "duration_ms", "play_duration_ms", "listened_ms"},
}


class CSVParser(BaseParser):
    format_id = "csv"

    def parse_with_diagnostics(self, text: str, filename: str | None = None) -> ParseResult:
        result = ParseResult(parser=self.format_id)
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",\t;") if text.strip() else csv.excel
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(StringIO(text), dialect=dialect)
        if not reader.fieldnames:
            result.add_warning("missing_header", "CSV file does not contain a readable header row.")
            return result

        columns = _infer_columns(reader.fieldnames)
        missing = [field for field in ("track", "artist", "timestamp") if columns.get(field) is None]
        if missing:
            result.add_warning("schema_inference_failed", f"Could not infer required columns: {', '.join(missing)}.")

        for index, record in enumerate(reader, start=2):
            result.rows_seen += 1
            if not any((value or "").strip() for value in record.values()):
                continue
            track = _cell(record, columns.get("track"))
            artist = _cell(record, columns.get("artist"))
            timestamp_value = _cell(record, columns.get("timestamp"))
            ms_played = parse_int(_cell(record, columns.get("ms_played")))
            if not (track and artist and timestamp_value):
                result.add_warning("missing_required_field", "Skipped row missing track, artist, or timestamp.", row=index)
                continue
            try:
                timestamp = parse_timestamp(timestamp_value)
            except ValueError as exc:
                result.add_warning("invalid_timestamp", str(exc), row=index, field=columns.get("timestamp"), value=timestamp_value)
                continue
            result.events.append(NormalisedEvent(track=track, artist=artist, timestamp=timestamp, ms_played=ms_played, source=self.format_id, raw=record))

        return result


def _normalise_header(value: str) -> str:
    return "".join(char.lower() for char in value.strip() if char.isalnum() or char in {"_", "(", ")"})


def _infer_columns(fieldnames: list[str]) -> dict[str, str | None]:
    normalised = {_normalise_header(field): field for field in fieldnames}
    columns: dict[str, str | None] = {}
    for canonical, aliases in FIELD_ALIASES.items():
        columns[canonical] = next((original for key, original in normalised.items() if key in aliases), None)
    return columns


def _cell(record: dict[str, str], column: str | None) -> str | None:
    if not column:
        return None
    return first_non_empty([record.get(column)])
