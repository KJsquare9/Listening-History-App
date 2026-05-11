from __future__ import annotations

import json

from api.parsers.base import BaseParser, NormalisedEvent
from api.utils import first_non_empty, parse_timestamp


class YTMusicParser(BaseParser):
    format_id = "ytmusic"

    def parse(self, text: str, filename: str | None = None) -> list[NormalisedEvent]:
        payload = json.loads(text)
        records = payload if isinstance(payload, list) else payload.get("items", payload.get("events", []))
        events: list[NormalisedEvent] = []

        for record in records:
            if not isinstance(record, dict):
                continue
            title = first_non_empty([record.get("title"), record.get("track"), record.get("videoTitle")])
            artist = first_non_empty(
                [
                    record.get("artist"),
                    record.get("subtitles", [{}])[0].get("name") if isinstance(record.get("subtitles"), list) and record.get("subtitles") else None,
                    record.get("channelName"),
                ]
            )
            timestamp_value = first_non_empty([record.get("time"), record.get("timestamp"), record.get("endTime")])
            ms_played = int(float(first_non_empty([record.get("msPlayed"), record.get("ms_played"), 0]) or 0))
            if not (title and artist and timestamp_value):
                continue
            events.append(
                NormalisedEvent(
                    track=title,
                    artist=artist,
                    timestamp=parse_timestamp(timestamp_value),
                    ms_played=ms_played,
                    source=self.format_id,
                    raw=record,
                )
            )

        return events
