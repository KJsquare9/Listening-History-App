from __future__ import annotations

from pathlib import Path

from flask import Flask, Response, send_from_directory

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
    )

    dataset = SongDataset.load(data_path / "songs.csv")
    enricher = TrackEnricher(dataset)
    app.config["SONG_DATASET"] = dataset
    app.config["TRACK_ENRICHER"] = enricher
    app.config["COHORT_LOADER"] = CohortLoader(data_path / "cohorts", enricher)

    app.register_blueprint(router)
    app.register_blueprint(researcher_bp)

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
