import io
import json
from flask import Blueprint, request, jsonify, current_app
from api.enricher import TrackEnricher

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
        from pathlib import Path
        
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
                print(f"Warning: Participant file not found for {participant_id}")
                continue
            
            try:
                file_content = participant_file.read_text(encoding="utf-8")
                format_id = registry.detect_format(str(participant_file), file_content)
                parser = registry.get(format_id)
                events = parser.parse(file_content, filename=str(participant_file))
                
                if not events:
                    continue
                
                enriched_events, summary = enricher.enrich(events)
                
                participants.append({
                    "id": participant_id,
                    "events": enriched_events,
                    "metadata": row,
                    "summary": summary,
                })
            except Exception as e:
                print(f"Error processing demo participant {participant_id}: {str(e)}")
                continue
        
        if not participants:
            return jsonify({"error": "No demo participants could be processed"}), 400
        
        return jsonify({
            "participants": participants,
            "metadata_fields": [k for k in metadata[0].keys() if k != PARTICIPANT_ID_FIELD],
            "count": len(participants),
        }), 200
    
    except Exception as e:
        print(f"Demo data error: {str(e)}")
        return jsonify({"error": str(e)}), 500

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
        metadata_text = metadata_file.read().decode("utf-8")
        metadata = parse_csv(metadata_text)
        
        # Validate Participant_ID field exists
        if not metadata or PARTICIPANT_ID_FIELD not in metadata[0]:
            return jsonify({"error": f"Metadata must contain {PARTICIPANT_ID_FIELD} column"}), 400
        
        # Validate file names match Participant_IDs
        participant_ids = set(row[PARTICIPANT_ID_FIELD] for row in metadata)
        file_names = set(f.filename.rsplit(".", 1)[0] for f in listening_files)
        
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
                participant_id = listening_file.filename.rsplit(".", 1)[0]
                
                # Parse listening history using registry
                file_content = listening_file.read().decode("utf-8")
                format_id = registry.detect_format(listening_file.filename, file_content)
                parser = registry.get(format_id)
                events = parser.parse(file_content, filename=listening_file.filename)
                
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
                    "events": enriched_events,
                    "metadata": participant_meta,
                    "summary": summary,
                })
            except Exception as e:
                # Log error but continue with other participants
                print(f"Error processing {listening_file.filename}: {str(e)}")
                continue
        
        if not participants:
            return jsonify({"error": "No participants could be processed successfully"}), 400
        
        return jsonify({
            "participants": participants,
            "metadata_fields": [k for k in metadata[0].keys() if k != PARTICIPANT_ID_FIELD],
            "count": len(participants),
        }), 200
    
    except Exception as e:
        print(f"Researcher data processing error: {str(e)}")
        return jsonify({"error": str(e)}), 500


def parse_csv(text):
    """Parse CSV text into list of dictionaries."""
    lines = text.strip().split("\n")
    if not lines:
        return []
    
    headers = [h.strip() for h in lines[0].split(",")]
    rows = []
    
    for line in lines[1:]:
        if not line.strip():
            continue
        values = [v.strip() for v in line.split(",")]
        row = {}
        for i, header in enumerate(headers):
            row[header] = values[i] if i < len(values) else ""
        rows.append(row)
    
    return rows
