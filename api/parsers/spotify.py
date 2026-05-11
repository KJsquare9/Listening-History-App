from __future__ import annotations

import json

from api.parsers.base import BaseParser, NormalisedEvent
from api.utils import first_non_empty, parse_timestamp


class SpotifyParser(BaseParser):
    format_id = "spotify"

    def parse(self, text: str, filename: str | None = None) -> list[NormalisedEvent]:
        payload = json.loads(text)
        records = payload if isinstance(payload, list) else payload.get("items", [])
        events: list[NormalisedEvent] = []

        for record in records:
            if not isinstance(record, dict):
                continue
            track = first_non_empty([record.get("trackName"), record.get("track")])
            artist = first_non_empty([record.get("artistName"), record.get("artist")])
            timestamp_value = first_non_empty([record.get("endTime"), record.get("timestamp")])
            ms_played = int(float(first_non_empty([record.get("msPlayed"), record.get("ms_played"), 0]) or 0))
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
