from __future__ import annotations

from pathlib import Path
import logging
import time
import uuid

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

from api.cohort_loader import CohortLoader
from api.enricher import SongDataset, TrackEnricher
from api.registry import ParserRegistry
from api.router import router
from api.researcher import researcher_bp


def create_app() -> Flask:
    root_path = Path(__file__).resolve().parents[1]
    frontend_path = root_path / "frontend"
    data_path = root_path / "data"

    app = Flask(__name__, static_folder=None)
    app.config.update(
        ROOT_PATH=root_path,
        FRONTEND_PATH=frontend_path,
        DATA_PATH=data_path,
        PARSER_REGISTRY=ParserRegistry.default(),
        MAX_CONTENT_LENGTH=32 * 1024 * 1024,
    )
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    dataset = SongDataset.load(data_path / "songs.csv")
    enricher = TrackEnricher(dataset)
    app.config["SONG_DATASET"] = dataset
    app.config["TRACK_ENRICHER"] = enricher
    app.config["COHORT_LOADER"] = CohortLoader(data_path / "cohorts", enricher)

    app.register_blueprint(router)
    app.register_blueprint(researcher_bp)

    @app.before_request
    def start_request_trace() -> None:
        g.request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
        g.request_started_at = time.perf_counter()

    @app.after_request
    def finish_request_trace(response: Response) -> Response:
        elapsed_ms = round((time.perf_counter() - getattr(g, "request_started_at", time.perf_counter())) * 1000, 2)
        response.headers["X-Request-ID"] = getattr(g, "request_id", "")
        app.logger.info(
            "request_complete method=%s path=%s status=%s elapsed_ms=%s request_id=%s",
            request.method,
            request.path,
            response.status_code,
            elapsed_ms,
            getattr(g, "request_id", ""),
        )
        return response

    @app.errorhandler(RequestEntityTooLarge)
    def upload_too_large(error: RequestEntityTooLarge):
        return jsonify(_error_payload("upload_too_large", "Upload is larger than the configured 32 MB limit.", 413)), 413

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException):
        return jsonify(_error_payload("http_error", error.description, error.code or 500)), error.code or 500

    @app.errorhandler(Exception)
    def unexpected_error(error: Exception):
        app.logger.exception("unhandled_exception request_id=%s", getattr(g, "request_id", ""))
        return jsonify(_error_payload("internal_error", "An unexpected server error occurred.", 500)), 500

    @app.get("/")
    def index() -> Response:
        return send_from_directory(frontend_path, "index.html")

    @app.get("/frontend/<path:filename>")
    def frontend_assets(filename: str) -> Response:
        return send_from_directory(frontend_path, filename)

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)


def _error_payload(code: str, message: str, status: int) -> dict[str, object]:
    return {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
            "status": status,
            "request_id": getattr(g, "request_id", None),
        },
    }
