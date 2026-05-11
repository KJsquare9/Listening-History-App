from __future__ import annotations

from pathlib import Path

from flask import Blueprint, current_app, jsonify, request

from api.serialiser import build_response


router = Blueprint("router", __name__)


@router.get("/api/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok"}, 200


@router.get("/api/demo")
def demo() -> tuple[dict[str, object], int]:
    app = current_app._get_current_object()
    demo_path = Path(app.config["ROOT_PATH"]) / "data" / "sample_listening_data.csv"
    with demo_path.open("r", encoding="utf-8") as handle:
        payload = _analyse_text(app, handle.read(), demo_path.name)
    return jsonify(payload), 200


@router.post("/api/analyse")
def analyse() -> tuple[dict[str, object], int]:
    app = current_app._get_current_object()
    uploaded = request.files.get("file")
    if uploaded and uploaded.filename:
        text = uploaded.read().decode("utf-8-sig", errors="replace")
        payload = _analyse_text(app, text, uploaded.filename)
        return jsonify(payload), 200

    if request.args.get("demo") == "1" or request.form.get("demo") == "1":
        demo_path = Path(app.config["ROOT_PATH"]) / "data" / "sample_listening_data.csv"
        with demo_path.open("r", encoding="utf-8") as handle:
            payload = _analyse_text(app, handle.read(), demo_path.name)
        return jsonify(payload), 200

    return jsonify({"error": "Upload a file or request /api/demo"}), 400


def _analyse_text(app, text: str, filename: str | None):
    registry = app.config["PARSER_REGISTRY"]
    enricher = app.config["TRACK_ENRICHER"]
    cohort_loader = app.config["COHORT_LOADER"]

    format_id = registry.detect_format(filename, text)
    parser = registry.get(format_id)
    events = parser.parse(text, filename=filename)
    enriched_events, summary = enricher.enrich(events)
    reference_groups = cohort_loader.load()
    return build_response(format_id=format_id, events=enriched_events, summary=summary, reference_groups=reference_groups)
