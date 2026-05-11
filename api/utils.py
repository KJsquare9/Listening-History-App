from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Iterable


_PARENS_RE = re.compile(r"\s*\([^)]*\)")
_FEATURE_RE = re.compile(r"\s*(?:-\s*)?(?:feat\.|featuring|with)\b.*$", re.IGNORECASE)
_PUNCT_RE = re.compile(r"[^a-z0-9]+")


def parse_timestamp(value: str) -> datetime:
    candidates = (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S%z",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%YT%H:%M:%S",
    )
    text = value.strip()
    for candidate in candidates:
        try:
            parsed = datetime.strptime(text, candidate)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            continue
    try:
        if text.endswith("Z"):
            return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc)
        return datetime.fromisoformat(text).astimezone(timezone.utc)
    except ValueError as exc:  # pragma: no cover - defensive branch
        raise ValueError(f"Unsupported timestamp format: {value!r}") from exc


def normalize_text(value: str) -> str:
    text = value.lower().strip()
    text = _PARENS_RE.sub("", text)
    text = _FEATURE_RE.sub("", text)
    text = text.replace("&", " and ")
    text = text.replace("’", "'")
    text = _PUNCT_RE.sub(" ", text)
    return " ".join(text.split())


def normalize_artist(value: str) -> str:
    return normalize_text(value)


def pair_key(track: str, artist: str) -> str:
    return f"{normalize_text(track)}::{normalize_artist(artist)}"


def first_non_empty(values: Iterable[str | None]) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None
