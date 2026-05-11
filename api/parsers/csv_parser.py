from __future__ import annotations

import csv
from io import StringIO

from api.parsers.base import BaseParser, NormalisedEvent
from api.utils import first_non_empty, parse_timestamp


class CSVParser(BaseParser):
    format_id = "csv"

    def parse(self, text: str, filename: str | None = None) -> list[NormalisedEvent]:
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",\t;") if text.strip() else csv.excel
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(StringIO(text), dialect=dialect)
        events: list[NormalisedEvent] = []

        for record in reader:
            track = first_non_empty([record.get("track"), record.get("trackName"), record.get("track_name")])
            artist = first_non_empty([record.get("artist"), record.get("artistName"), record.get("artist_name")])
            timestamp_value = first_non_empty([record.get("timestamp"), record.get("endTime"), record.get("time")])
            ms_played = int(float(first_non_empty([record.get("ms_played"), record.get("msPlayed"), record.get("msPlayedMs"), 0]) or 0))
            if not (track and artist and timestamp_value):
                continue
            events.append(
                NormalisedEvent(
                    track=track,
                    artist=artist,
                    timestamp=parse_timestamp(timestamp_value),
                    ms_played=ms_played,
                    source=self.format_id,
                    raw=record,
                )
            )

        return events
