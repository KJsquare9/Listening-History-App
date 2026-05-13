from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Iterable


_PARENS_RE = re.compile(r"\s*\([^)]*\)")
_FEATURE_RE = re.compile(r"\s*(?:-\s*)?(?:feat\.|featuring|with)\b.*$", re.IGNORECASE)
_PUNCT_RE = re.compile(r"[^a-z0-9]+")
_LEADING_ARTICLE_RE = re.compile(r"^(the|a|an)\s+", re.IGNORECASE)


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
    text = str(value).strip()
    if not text:
        raise ValueError("Empty timestamp")

    if text.isdigit():
        numeric = int(text)
        if numeric > 10_000_000_000:
            numeric = numeric / 1000
        return datetime.fromtimestamp(numeric, tz=timezone.utc)

    text = text.replace("\u202f", " ").replace("\xa0", " ")
    for candidate in candidates:
        try:
            parsed = datetime.strptime(text, candidate)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            continue
    try:
        iso_text = text.replace("Z", "+00:00") if text.endswith("Z") else text
        parsed = datetime.fromisoformat(iso_text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError as exc:  # pragma: no cover - defensive branch
        raise ValueError(f"Unsupported timestamp format: {value!r}") from exc


def normalize_text(value: str) -> str:
    text = str(value).lower().strip()
    text = _PARENS_RE.sub("", text)
    text = _FEATURE_RE.sub("", text)
    text = text.replace("&", " and ")
    text = text.replace("’", "'")
    text = _PUNCT_RE.sub(" ", text)
    text = " ".join(text.split())
    return _LEADING_ARTICLE_RE.sub("", text).strip()


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


def parse_int(value: object, default: int = 0) -> int:
    if value in {None, ""}:
        return default
    try:
        return max(0, int(float(str(value).replace(",", "").strip())))
    except (TypeError, ValueError):
        return default


def coerce_text(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return first_non_empty([value.get("name"), value.get("title"), value.get("text")])
    if isinstance(value, list):
        return first_non_empty(coerce_text(item) for item in value)
    text = str(value).strip()
    return text or None
