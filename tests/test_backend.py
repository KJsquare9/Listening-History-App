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
