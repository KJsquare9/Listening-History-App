from __future__ import annotations

import io

from api.app import create_app


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
