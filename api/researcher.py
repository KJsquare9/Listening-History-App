from __future__ import annotations

import csv
from io import StringIO
from pathlib import Path, PurePath

from flask import Blueprint, request, jsonify, current_app, g

researcher_bp = Blueprint("researcher", __name__, url_prefix="/api/researcher")

# Configurable Participant ID field name
PARTICIPANT_ID_FIELD = "Participant_ID"

@researcher_bp.route("/demo", methods=["GET"])
def demo_researcher_data():
    """
    Return demo researcher data with sample participants.
    Uses pre-loaded sample data from data/research_demo/.
    """
    try:
        app = current_app._get_current_object()
        data_path = Path(app.config["DATA_PATH"]) / "research_demo"
        registry = app.config["PARSER_REGISTRY"]
        enricher = app.config["TRACK_ENRICHER"]
        
        # Load metadata
        metadata_file = data_path / "metadata.csv"
        if not metadata_file.exists():
            return jsonify({"error": "Demo metadata file not found"}), 400
        
        metadata_text = metadata_file.read_text(encoding="utf-8")
        metadata = parse_csv(metadata_text)
        
        if not metadata or PARTICIPANT_ID_FIELD not in metadata[0]:
            return jsonify({"error": f"Demo metadata must contain {PARTICIPANT_ID_FIELD} column"}), 400
        
        # Load and process participant files
        participants = []
        for row in metadata:
            participant_id = row[PARTICIPANT_ID_FIELD]
            participant_file = data_path / f"{participant_id}.csv"
            
            if not participant_file.exists():
                current_app.logger.warning("demo_participant_file_missing participant_id=%s request_id=%s", participant_id, getattr(g, "request_id", ""))
                continue
            
            try:
                file_content = participant_file.read_text(encoding="utf-8")
                format_id = registry.detect_format(str(participant_file), file_content)
                parser = registry.get(format_id)
                parse_result = parser.parse_with_diagnostics(file_content, filename=str(participant_file))
                events = parse_result.events
                
                if not events:
                    continue
                
                enriched_events, summary = enricher.enrich(events)
                
                participants.append({
                    "id": participant_id,
                    "events": [event.to_dict() for event in enriched_events],
                    "metadata": row,
                    "summary": summary,
                    "diagnostics": parse_result.diagnostics(),
                })
            except Exception as e:
                current_app.logger.exception("demo_participant_processing_failed participant_id=%s request_id=%s", participant_id, getattr(g, "request_id", ""))
                continue
        
        if not participants:
            return jsonify({"error": "No demo participants could be processed"}), 400
        
        return jsonify({
            "ok": True,
            "participants": participants,
            "metadata_fields": [k for k in metadata[0].keys() if k != PARTICIPANT_ID_FIELD],
            "count": len(participants),
        }), 200
    
    except Exception as e:
        current_app.logger.exception("researcher_demo_failed request_id=%s", getattr(g, "request_id", ""))
        return jsonify({"ok": False, "error": {"code": "researcher_demo_failed", "message": str(e), "status": 500}}), 500

@researcher_bp.route("/process", methods=["POST"])
def process_researcher_data():
    """
    Process multi-participant research data.
    
    Expects:
    - metadata: CSV file with Participant_ID column
    - listening_files: Multiple listening history files (one per participant)
    
    Returns:
    - Aggregated participant data with enriched listening histories
    """
    try:
        app = current_app._get_current_object()
        registry = app.config["PARSER_REGISTRY"]
        enricher = app.config["TRACK_ENRICHER"]
        
        # Get uploaded files
        if "metadata" not in request.files:
            return jsonify({"error": "No metadata CSV file uploaded"}), 400
        
        metadata_file = request.files["metadata"]
        listening_files = request.files.getlist("listening_files")
        
        if not listening_files:
            return jsonify({"error": "No listening history files uploaded"}), 400
        
        # Parse metadata CSV
        metadata_text = metadata_file.read().decode("utf-8-sig", errors="replace")
        metadata = parse_csv(metadata_text)
        
        # Validate Participant_ID field exists
        if not metadata or PARTICIPANT_ID_FIELD not in metadata[0]:
            return jsonify({"error": f"Metadata must contain {PARTICIPANT_ID_FIELD} column"}), 400
        
        # Validate file names match Participant_IDs
        participant_ids = {row[PARTICIPANT_ID_FIELD] for row in metadata if row.get(PARTICIPANT_ID_FIELD)}
        file_names = {_participant_id_from_filename(f.filename) for f in listening_files if f.filename}
        
        missing = participant_ids - file_names
        extra = file_names - participant_ids
        
        if missing or extra:
            msg = f"File validation failed. "
            if missing:
                msg += f"Missing: {', '.join(missing)}. "
            if extra:
                msg += f"Extra: {', '.join(extra)}."
            return jsonify({"error": msg}), 400
        
        # Process each participant
        participants = []
        for listening_file in listening_files:
            try:
                # Get participant ID from filename
                participant_id = _participant_id_from_filename(listening_file.filename)
                
                # Parse listening history using registry
                file_content = listening_file.read().decode("utf-8-sig", errors="replace")
                format_id = registry.detect_format(listening_file.filename, file_content)
                parser = registry.get(format_id)
                parse_result = parser.parse_with_diagnostics(file_content, filename=listening_file.filename)
                events = parse_result.events
                
                if not events:
                    continue
                
                # Enrich events
                enriched_events, summary = enricher.enrich(events)
                
                # Get metadata for this participant
                participant_meta = next(
                    (row for row in metadata if row[PARTICIPANT_ID_FIELD] == participant_id),
                    {}
                )
                
                participants.append({
                    "id": participant_id,
                    "events": [event.to_dict() for event in enriched_events],
                    "metadata": participant_meta,
                    "summary": summary,
                    "diagnostics": parse_result.diagnostics(),
                })
            except Exception as e:
                # Log error but continue with other participants
                current_app.logger.exception("participant_processing_failed filename=%s request_id=%s", listening_file.filename, getattr(g, "request_id", ""))
                continue
        
        if not participants:
            return jsonify({"error": "No participants could be processed successfully"}), 400
        
        return jsonify({
            "ok": True,
            "participants": participants,
            "metadata_fields": [k for k in metadata[0].keys() if k != PARTICIPANT_ID_FIELD],
            "count": len(participants),
        }), 200
    
    except Exception as e:
        current_app.logger.exception("researcher_processing_failed request_id=%s", getattr(g, "request_id", ""))
        return jsonify({"ok": False, "error": {"code": "researcher_processing_failed", "message": str(e), "status": 500}}), 500


def parse_csv(text: str) -> list[dict[str, str]]:
    """Parse CSV text into list of dictionaries."""
    if not text.strip():
        return []

    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",\t;")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(StringIO(text), dialect=dialect)
    return [
        {
            (key or "").strip(): (value or "").strip()
            for key, value in row.items()
            if key is not None
        }
        for row in reader
        if any((value or "").strip() for value in row.values())
    ]


def _participant_id_from_filename(filename: str) -> str:
    """Return the file stem while tolerating browser folder-upload paths."""
    clean_name = PurePath(str(filename).replace("\\", "/")).name
    return clean_name.rsplit(".", 1)[0]
