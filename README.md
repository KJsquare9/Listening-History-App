# Music Listening Analysis Tool

A browser-based tool for visualising music listening history through the lens of valence-arousal (VA) psychology. Upload your listening history (tracks and timestamps), and the tool automatically looks up each track in an internal song dataset, enriches it with VA and other musical attributes, and renders comparative visualisations against reference cohort data from depression-scale studies.

Users only need to provide their listening history. All musical attribute data is sourced internally — they never need to know it exists.

---

## Overview

The system is split into two modes:

### User Mode
- Single user listening history analysis
- **Flask API (Python)** — accepts listening history file uploads, routes them through a parser registry, looks up each track in the internal song dataset to attach valence, arousal, and other attributes, and returns a single enriched JSON payload. Stateless: no user data is stored.
- **Browser frontend (HTML + D3.js)** — receives the enriched data and renders all visualisations client-side. Data lives only in session memory.
- **Diagnostics-first parsing** — malformed rows are reported as warnings instead of aborting the whole upload. API responses include parser counts, warning details, request IDs, and timing information.

### Researcher Mode
- Multi-user listening history analysis and comparison
- **Upload**: Drag-and-drop folder upload with metadata CSV file (Participant_ID required by default)
- **Validation**: Automatic file-name-to-Participant_ID matching
- **Analysis**: Distribution plots for metadata fields, multi-participant V-A trajectories, filtering by field and participant

Researcher Mode Details

The researcher interface supports multi-participant uploads and comparative visualisations. Key points:

- Frontend: `frontend/researcher.html` and `frontend/researcher.js` implement drag-and-drop upload, metadata validation, and the analysis UI (distribution plots and V–A trajectories).
- Backend: `POST /api/researcher/process` (implemented in `api/researcher.py`) parses the provided listening files, enriches events using the internal song dataset, and returns aggregated participant data and metadata field names for filtering.
- Demo data: a ready-made demo set lives in `data/research_demo/` for quick testing.

Data requirements and formats

- `metadata` CSV: must contain a column identifying each participant (default column name: `Participant_ID`).
- `listening_files`: one listening history file per participant. Supported formats: CSV/TSV (generic), Spotify JSON, YouTube Music JSON.

Example workflow

1. Place a `metadata.csv` file and the listening files named to match the participant IDs (filenames without extension) in a folder.
2. In Researcher Mode, either drop the folder into the upload area or use the file picker and submit.
3. The backend validates file-name ↔ participant ID matching, parses and enriches the events, and the frontend renders the analysis panels.

Configuration: changing the participant ID column

By default Researcher Mode looks for a metadata column named `Participant_ID`. To change this name you have two simple options:

- Quick edit (recommended for local testing): open `api/researcher.py` and change the top-level constant:

	1. Find the line near the top:

		 `PARTICIPANT_ID_FIELD = "Participant_ID"`

	2. Replace `"Participant_ID"` with your desired column name (for example `"ID"`), save and restart the Flask server.

- Runtime config (advanced): if you prefer not to edit the source, you can set a Flask config value before the researcher blueprint is used. Example (in `api/app.py`, before blueprint registration):

	```py
	app.config["PARTICIPANT_ID_FIELD"] = "YourColumnName"
	```

	Note: to use this approach you must also update `api/researcher.py` to read from `current_app.config` instead of the hard-coded constant (replace uses of `PARTICIPANT_ID_FIELD` with `current_app.config.get("PARTICIPANT_ID_FIELD", PARTICIPANT_ID_FIELD)`). The quick-edit method above is simpler and already supported.

See also: `data/research_demo/` for a working metadata example and matching participant files.

---

## Features

### User Mode
- V-A trajectory plot — track sequence as a path on the valence-arousal plane, colour-encoded by time
- V-A time series — valence and arousal plotted over the listening session
- Cohort comparison — user listening patterns overlaid against high-depression and low-depression reference distributions
- Listening duration breakdown — ms played per track or time bucket

### Researcher Mode
- Multi-participant data upload with Participant_ID validation
- Distribution plots for metadata fields (demographics, scores, etc.)
- Multi-participant V-A trajectory visualization with legend
- Interactive filtering by fields and participants
- Support for mixed file formats (CSV, JSON, TSV)

### Shared Features
- Pluggable parser registry — add support for new file formats (Spotify, YT Music, CSV, etc.) by dropping in a single parser module
- Pluggable visualisation registry — add new D3 charts by registering a single JS module
- Conservative fuzzy matching with confidence scores and unmatched reason categories
- Date-window filtering with synchronized summary cards and quick presets

---

## Repository Structure

```
.
├── api/
│   ├── app.py                  # Flask app entry point
│   ├── router.py               # User mode endpoint, format detection
│   ├── researcher.py           # Researcher mode endpoint (new)
│   ├── registry.py             # Parser registry
│   ├── parsers/
│   │   ├── base.py             # NormalisedEvent schema / base class
│   │   ├── spotify.py          # Spotify StreamingHistory parser
│   │   ├── ytmusic.py          # YT Music Takeout parser
│   │   └── csv_parser.py       # Generic CSV/TSV parser
│   ├── enricher.py             # Track attribute lookup against song dataset
│   ├── cohort_loader.py        # Reference cohort data loader
│   └── serialiser.py           # JSON response builder
│
├── data/
│   ├── songs.csv               # Internal song dataset: track/artist → valence, arousal, etc.
│   ├── cohorts/                # Reference listening histories with depression scale scores
│   │   ├── high_depression.csv
│   │   └── low_depression.csv
│   └── research_demo/          # Demo researcher data (new)
│       ├── participant_001.csv
│       ├── participant_002.csv
│       ├── participant_003.csv
│       └── metadata.csv
│
├── frontend/
│   ├── index.html              # Landing page (new)
│   ├── user.html               # User mode (renamed from index.html)
│   ├── researcher.html         # Researcher mode (new)
│   ├── researcher.js           # Researcher mode logic (new)
│   ├── app.js                  # User mode state and routing
│   ├── uploader.js             # File upload component
│   ├── styles.css              # Shared styles
│   └── charts/
│       ├── shared.js           # Shared chart utilities
│       ├── va_trajectory.js    # V-A plane trajectory chart
│       ├── va_timeseries.js    # V-A time series chart
│       ├── cohort_compare.js   # Cohort comparison chart
│       └── ms_played.js        # Listening duration chart
│
├── tests/
│   ├── test_parsers.py
│   ├── test_enricher.py
│   └── test_cohort_loader.py
│
├── documentation/              # C4 diagrams and architecture docs
│
├── requirements.txt
├── README.md
├── RESEARCHER_MODE.md          # Researcher mode documentation (new)
└── FUNCTIONAL_REQUIREMENTS.md
```

---

## Data Formats Supported

| Format | Parser | Input file |
|---|---|---|
| Spotify | `spotify.py` | `StreamingHistory*.json` from Spotify data takeout |
| YT Music | `ytmusic.py` | `watch-history.json` from Google Takeout |
| Generic CSV | `csv_parser.py` | CSV/TSV with columns: `track`, `artist`, `timestamp`, `ms_played` |

The parsers also accept common variants such as Spotify extended history fields (`ts`, `master_metadata_track_name`, `master_metadata_album_artist_name`, `ms_played`), YouTube Takeout title/subtitle objects, epoch timestamps, and CSV aliases such as `song`, `artists`, `played_at`, and `listened_ms`.

To add a new format, create a parser in `api/parsers/`, subclass `BaseParser`, and register it in `api/registry.py`. No other changes are needed.

---

## Normalised Event Schema

All parsers output a list of `NormalisedEvent` objects. The enricher then attaches track attributes from the internal song dataset before serialisation.

| Field | Type | Description |
|---|---|---|
| `track` | `str` | Track name |
| `artist` | `str` | Artist name |
| `timestamp` | `datetime` | UTC datetime of play |
| `ms_played` | `int` | Milliseconds played |
| `valence` | `float \| None` | Valence score from internal dataset (0–1). `null` if track not found. |
| `arousal` | `float \| None` | Arousal score from internal dataset (0–1). `null` if track not found. |
| `matched` | `bool` | Whether the track was found in the song dataset |
| `match_confidence` | `float` | Match confidence from 0–1. Exact matches are `1.0`; fuzzy matches are lower. |
| `match_method` | `str \| None` | Match strategy such as `exact_pair`, `track_exact_artist_similar`, or `fuzzy_pair`. |
| `unmatched_reason` | `str \| None` | Reason category such as `not_in_song_dataset`, `artist_mismatch`, `ambiguous_track`, or `below_play_threshold`. |

Unmatched tracks are included in the response but excluded from VA-based visualisations. Match coverage is reported in the API response summary.

---

## API Response Contract

Successful user-mode responses include the historical top-level fields plus an explicit status and diagnostics block:

```json
{
  "ok": true,
  "summary": {
    "total_events": 120,
    "matched_count": 91,
    "match_rate": 0.758,
    "match_confidence_mean": 0.97,
    "unmatched_reasons": { "not_in_song_dataset": 20 }
  },
  "events": [],
  "matched_events": [],
  "reference_groups": {},
  "diagnostics": {
    "request_id": "abc123",
    "elapsed_ms": 24.6,
    "parse": {
      "parser": "spotify",
      "rows_seen": 125,
      "events_parsed": 120,
      "rows_dropped": 5,
      "warnings": []
    }
  }
}
```

Errors use:

```json
{
  "ok": false,
  "error": {
    "code": "missing_upload",
    "message": "Upload a file or request /api/demo.",
    "status": 400,
    "request_id": "abc123"
  }
}
```

Uploads are limited to 32 MB by Flask configuration. The backend remains stateless and does not persist uploaded listening histories.

---

## Internal Song Dataset

`data/songs.xlsx` is the researcher-maintained lookup table. It maps track and artist names to musical attributes. At minimum it must contain:

| Column | Description |
|---|---|
| `track` | Track name (used for matching) |
| `artist` | Artist name (used for matching) |
| `valence` | Valence score (0–1) |
| `arousal` | Arousal score (0–1) |

Additional attribute columns can be added freely — the enricher will pass them through to the response payload, and new visualisations can consume them without any changes to the parser or enricher logic.

---

## Adding a New Visualisation

1. Create a new D3 module in `frontend/charts/`, exporting a `mount(container, data)` and `unmount()` function.
2. Register it in the `VizRegistry` in `frontend/app.js` with an ID and display label.
3. It will appear automatically in the navigation tabs.

---

## Setup & Installation

### Prerequisites

- Python 3.11+
- A modern browser

### Backend and frontend

The app is served by Flask and does not require a JS build step.

```bash
python -m pip install -r requirements.txt
python -m flask --app api.app run
```

Open `http://127.0.0.1:5000` in your browser.

### Demo data

If you do not have an export file yet, click **Load demo session**. The demo uses synthetic pseudo-data stored in `data/songs.csv` and the cohort CSVs under `data/cohorts/`.

### Running tests

```bash
python -m pytest
```

No JavaScript build step or frontend framework is required. Current runtime dependencies are intentionally small: Flask for the API and pytest for tests; the browser loads D3 directly.

---

## Reference Data

- `data/songs.csv` — Synthetic internal song dataset mapping track/artist pairs to valence, arousal, and supporting musical attributes.
- `data/cohorts/` — Synthetic listening histories from two reference groups with depression-scale scores.

---

## Architecture

The system design has been documented in a C4-style layered design:

- **Context** — user uploads a listening history file from any supported platform; the tool enriches it internally and visualises it with no data retention.
- **Containers** — a stateless Flask API handles parsing and enrichment against internal datasets; a browser frontend handles all rendering.
- **Components** — two registries (Python parser registry, JS visualisation registry) are the sole extension points. Adding new formats or charts requires touching only those registries and their respective plugin directories.

Full C4 PlantUML diagrams are in `documentation/C4/puml code/`.

---

## Extending The App

This project is intentionally built to be friendly to change. The main extension points are the parser registry on the backend and the visualisation registry on the frontend.

### Add a new visualisation

1. Create a new module in `frontend/charts/`.
2. Export a `mount(container, data)` function and an `unmount()` function.
3. Register the module in `frontend/app.js` so it appears as a new tab.

### Add a new data format

1. Create a parser in `api/parsers/` that converts the new file into `NormalisedEvent` objects.
2. Subclass `BaseParser` and implement `parse_with_diagnostics(text, filename=None)`.
3. Return a `ParseResult` so malformed rows can be surfaced as warnings.
4. Register the parser in `api/registry.py` with a format id and detection rules.

If you follow those two patterns, the rest of the app should continue working without extra wiring.

---

## Engineering Notes

- Parser robustness: row-level warnings preserve useful data from imperfect exports. Do not raise on a single bad row unless the whole file is unreadable.
- Matching: exact track+artist matches are preferred; fuzzy matching is intentionally conservative to avoid misleading false positives.
- Observability: every request receives an `X-Request-ID` response header, structured timing logs, and parse diagnostics in the JSON payload.
- Performance: cohort reference data and song lookup indexes are cached in process. The backend keeps uploaded datasets in memory only for the request.
- Frontend state: the active payload is filtered client-side; summary cards, sparklines, and D3 charts read from the same filtered payload to stay synchronized.

## Future Scalability

- Stream very large uploads into temporary row iterators instead of reading the full file into memory.
- Add optional server-side pagination/downsampling for chart-heavy sessions above roughly 50k events.
- Move song metadata into SQLite or DuckDB if the internal catalog grows beyond CSV-friendly size.
- Add golden-file parser fixtures for real Spotify and Google Takeout exports as the supported schema set expands.
- Add Playwright smoke tests for upload, filtering, and chart tab changes.
