# Music Listening Analysis Tool

A browser-based tool for visualising music listening history through the lens of valence-arousal (VA) psychology. Upload your listening history (tracks and timestamps), and the tool automatically looks up each track in an internal song dataset, enriches it with VA and other musical attributes, and renders comparative visualisations against reference cohort data from depression-scale studies.

Users only need to provide their listening history. All musical attribute data is sourced internally — they never need to know it exists.

---

## Overview

The system is split into two parts:

- **Flask API (Python)** — accepts listening history file uploads, routes them through a parser registry, looks up each track in the internal song dataset to attach valence, arousal, and other attributes, and returns a single enriched JSON payload. Stateless: no user data is stored.
- **Browser frontend (HTML + D3.js)** — receives the enriched data and renders all visualisations client-side. Data lives only in session memory.

---

## Features

- V-A trajectory plot — track sequence as a path on the valence-arousal plane, colour-encoded by time
- V-A time series — valence and arousal plotted over the listening session
- Cohort comparison — user listening patterns overlaid against high-depression and low-depression reference distributions
- Listening duration breakdown — ms played per track or time bucket
- Pluggable parser registry — add support for new file formats (Spotify, YT Music, CSV, etc.) by dropping in a single parser module
- Pluggable visualisation registry — add new D3 charts by registering a single JS module

---

## Repository Structure

```
.
├── api/
│   ├── app.py                  # Flask app entry point
│   ├── router.py               # Upload endpoint, format detection
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
│   ├── songs.xlsx              # Internal song dataset: track/artist → valence, arousal, etc.
│   └── cohorts/                # Reference listening histories with depression scale scores
│       ├── high_depression/
│       └── low_depression/
│
├── frontend/
│   ├── index.html
│   ├── app.js                  # App state, viz registry, tab routing
│   ├── uploader.js             # File upload component
│   └── charts/
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
├── requirements.txt
└── README.md
```

---

## Data Formats Supported

| Format | Parser | Input file |
|---|---|---|
| Spotify | `spotify.py` | `StreamingHistory*.json` from Spotify data takeout |
| YT Music | `ytmusic.py` | `watch-history.json` from Google Takeout |
| Generic CSV | `csv_parser.py` | CSV/TSV with columns: `track`, `artist`, `timestamp`, `ms_played` |

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

Unmatched tracks are included in the response but excluded from VA-based visualisations. Match coverage is reported in the API response summary.

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

---

## Reference Data

- `data/songs.csv` — Synthetic internal song dataset mapping track/artist pairs to valence, arousal, and supporting musical attributes.
- `data/cohorts/` — Synthetic listening histories from two reference groups with depression-scale scores.

---

## Architecture

The system follows a C4-style layered design:

- **Context** — user uploads a listening history file from any supported platform; the tool enriches it internally and visualises it with no data retention.
- **Containers** — a stateless Flask API handles parsing and enrichment against internal datasets; a browser frontend handles all rendering.
- **Components** — two registries (Python parser registry, JS visualisation registry) are the sole extension points. Adding new formats or charts requires touching only those registries and their respective plugin directories.

Full C4 PlantUML diagrams are in `documentation/C4/puml code/`.
