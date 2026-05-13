from __future__ import annotations

import io
from pathlib import Path

from api.app import create_app
from api.parsers.csv_parser import CSVParser
from api.parsers.spotify import SpotifyParser
from api.utils import parse_timestamp


ROOT_PATH = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT_PATH / "data"


def test_demo_endpoint_returns_enriched_data():
    app = create_app()
    client = app.test_client()

    response = client.get("/api/demo")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"]["total_events"] > 0
    assert payload["summary"]["matched_count"] > 0
    assert payload["reference_groups"]["high_depression"]["summary"]["total_events"] > 0


def test_csv_upload_is_parsed_and_enriched():
    app = create_app()
    client = app.test_client()

    csv_text = """track,artist,timestamp,ms_played\nLove Story,Taylor Swift,2024-01-01 10:00:00,180000\nUnknown Song,Unknown Artist,2024-01-01 10:05:00,90000\n"""

    response = client.post(
        "/api/analyse",
        data={"file": (io.BytesIO(csv_text.encode("utf-8")), "sample.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"]["total_events"] == 2
    assert payload["summary"]["matched_count"] == 1
    assert payload["events"][0]["matched"] is True
    assert payload["events"][1]["matched"] is False


def test_short_listens_are_filtered_out_before_enrichment():
    app = create_app()
    client = app.test_client()

    match = app.config["SONG_DATASET"].lookup("Love Story", "Taylor Swift")
    assert match is not None
    duration_ms = int(float(match.attributes["duration_ms"]))
    short_ms = max(1, int(duration_ms / 2) - 1)
    long_ms = int(duration_ms / 2) + 1

    csv_text = f"""track,artist,timestamp,ms_played\nLove Story,Taylor Swift,2024-01-01 10:00:00,{short_ms}\nLove Story,Taylor Swift,2024-01-01 10:05:00,{long_ms}\n"""

    response = client.post(
        "/api/analyse",
        data={"file": (io.BytesIO(csv_text.encode("utf-8")), "sample.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["summary"]["total_events"] == 1
    assert payload["summary"]["matched_count"] == 1
    assert len(payload["events"]) == 1
    assert payload["events"][0]["ms_played"] == long_ms


def test_researcher_demo_returns_serialized_participant_events():
    app = create_app()
    client = app.test_client()

    response = client.get("/api/researcher/demo")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["count"] > 0
    assert payload["participants"]
    first_event = payload["participants"][0]["events"][0]
    assert isinstance(first_event["timestamp"], str)
    assert "track" in first_event
    assert "matched" in first_event


def test_researcher_process_accepts_csv_listening_files():
    app = create_app()
    client = app.test_client()

    metadata = "Participant_ID,Age,Group\np001,21,\"low, reference\"\np002,22,high\n"
    p001 = "track,artist,timestamp,ms_played\nLove Story,Taylor Swift,2024-01-01 10:00:00,240000\n"
    p002 = "track,artist,timestamp,ms_played\nUnknown Song,Unknown Artist,2024-01-01 10:05:00,90000\n"

    response = client.post(
        "/api/researcher/process",
        data={
            "metadata": (io.BytesIO(metadata.encode("utf-8")), "metadata.csv"),
            "listening_files": [
                (io.BytesIO(p001.encode("utf-8")), "p001.csv"),
                (io.BytesIO(p002.encode("utf-8")), "p002.csv"),
            ],
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["count"] == 2
    assert payload["participants"][0]["metadata"]["Group"] == "low, reference"
    assert payload["participants"][0]["events"][0]["matched"] is True


def test_user_upload_accepts_bundled_sample_listening_files():
    app = create_app()
    client = app.test_client()
    sample_files = [
        DATA_PATH / "sample_listening_data.csv",
        DATA_PATH / "research_demo" / "participant_001.csv",
        DATA_PATH / "cohorts" / "low_depression" / "low_depression.csv",
        DATA_PATH / "cohorts" / "high_depression" / "high_depression.csv",
    ]

    for sample_file in sample_files:
        response = client.post(
            "/api/analyse",
            data={"file": (io.BytesIO(sample_file.read_bytes()), sample_file.name)},
            content_type="multipart/form-data",
        )

        assert response.status_code == 200, sample_file
        payload = response.get_json()
        assert payload["ok"] is True
        assert payload["summary"]["total_events"] > 0, sample_file
        assert payload["diagnostics"]["parse"]["events_parsed"] > 0, sample_file
        assert payload["reference_groups"]["high_depression"]["summary"]["total_events"] > 0


def test_researcher_process_accepts_bundled_demo_folder_filenames():
    app = create_app()
    client = app.test_client()
    demo_path = DATA_PATH / "research_demo"
    listening_files = [
        (io.BytesIO(path.read_bytes()), f"research_demo/{path.name}")
        for path in sorted(demo_path.glob("participant_*.csv"))
    ]

    response = client.post(
        "/api/researcher/process",
        data={
            "metadata": (io.BytesIO((demo_path / "metadata.csv").read_bytes()), "research_demo/metadata.csv"),
            "listening_files": listening_files,
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["count"] == len(listening_files)
    assert all(participant["events"] for participant in payload["participants"])


def test_researcher_mode_demo_folder_uploads_cleanly():
    app = create_app()
    client = app.test_client()
    demo_path = DATA_PATH / "researcher_mode_demo"
    participant_paths = sorted(demo_path.glob("rm_*.csv"))

    response = client.post(
        "/api/researcher/process",
        data={
            "metadata": (io.BytesIO((demo_path / "metadata.csv").read_bytes()), "researcher_mode_demo/metadata.csv"),
            "listening_files": [
                (io.BytesIO(path.read_bytes()), f"researcher_mode_demo/{path.name}")
                for path in participant_paths
            ],
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["count"] == 8
    assert payload["metadata_fields"] == [
        "Age",
        "Gender",
        "Depression_Score",
        "Anxiety_Score",
        "Music_Engagement",
        "Therapy_Duration_Weeks",
        "Sleep_Quality",
        "Study_Group",
        "Primary_Genre",
    ]
    assert all(participant["summary"]["matched_events"] >= 12 for participant in payload["participants"])


def test_csv_parser_preserves_warnings_for_malformed_rows():
    parser = CSVParser()
    csv_text = """song,artists,played_at,listened_ms\nLove Story,Taylor Swift,2024-01-01T10:00:00Z,180000\nBroken,Taylor Swift,not-a-date,120000\n,Missing Track,2024-01-01,1000\n"""

    result = parser.parse_with_diagnostics(csv_text, filename="history.csv")

    assert len(result.events) == 1
    assert result.rows_seen == 3
    assert result.dropped_rows == 2
    assert {warning.code for warning in result.warnings} >= {"invalid_timestamp", "missing_required_field"}


def test_spotify_extended_history_fields_are_supported():
    parser = SpotifyParser()
    text = """[
      {"ts":"2024-02-01T12:34:56Z","master_metadata_track_name":"Love Story","master_metadata_album_artist_name":"Taylor Swift","ms_played":181000},
      {"ts":"bad","master_metadata_track_name":"Skip","master_metadata_album_artist_name":"Artist","ms_played":1}
    ]"""

    result = parser.parse_with_diagnostics(text, filename="Streaming_History_Audio_2024.json")

    assert len(result.events) == 1
    assert result.events[0].track == "Love Story"
    assert result.warnings[0].code == "invalid_timestamp"


def test_timestamp_parser_accepts_epoch_milliseconds():
    parsed = parse_timestamp("1704110400000")

    assert parsed.isoformat() == "2024-01-01T12:00:00+00:00"


def test_enrichment_exposes_fuzzy_match_confidence_and_reasons():
    app = create_app()
    client = app.test_client()
    csv_text = """track,artist,timestamp,ms_played\nLove Story (Taylor's Version),T Swift,2024-01-01 10:00:00,240000\nUnknown Song,Unknown Artist,2024-01-01 10:05:00,90000\n"""

    response = client.post(
        "/api/analyse",
        data={"file": (io.BytesIO(csv_text.encode("utf-8")), "sample.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    matched = payload["events"][0]
    assert matched["matched"] is True
    assert matched["match_confidence"] > 0.8
    assert matched["match_method"] in {"track_exact_artist_similar", "fuzzy_pair"}
    assert payload["events"][1]["unmatched_reason"] == "not_in_song_dataset"
    assert payload["diagnostics"]["parse"]["rows_seen"] == 2
