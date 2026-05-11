# Functional Requirements

## Overview

The Listening History Atlas is a tool for visualising and analysing music listening history through valence-arousal psychology. This document outlines the core functional requirements of the system.

---

## User-Facing Features

### 1. Data Input

- **Upload listening history** from multiple formats: Spotify, YouTube Music, or generic CSV/TSV
- **Load demo session** with pre-loaded synthetic data for quick exploration
- **Automatic format detection** based on filename and content inspection
- **Error handling** for malformed or unsupported files with clear user feedback

### 2. Data Enrichment

- **Track lookup** against internal song dataset (track name + artist matching)
- **Valence-arousal enrichment** for each matched track from the internal dataset
- **Match rate reporting** showing what percentage of uploads matched the dataset
- **Attribute passthrough** to carry additional musical attributes (energy, tempo, mood, genre, etc.)

### 3. Data Filtering

- **Short-play filtering**: Automatically remove plays where `ms_played` is less than 50% of the track's actual duration to avoid accidental clicks
- **Adaptive thresholds** based on track metadata when available
- **Fallback estimation** when track duration is not present in the dataset

### 4. Visualisations

#### V-A Trajectory
- Plot the sequence of tracks as a path on the valence-arousal plane
- Show start and end points with clear labels
- Use a solid colour line to represent the flow over time
- Display track details (name, artist, valence, arousal, duration) on hover

#### Time Series
- Plot valence and arousal values over the listening session
- Use different line/area styles to distinguish the two dimensions
- Enable time-based brushing or zoom

#### Reference Comparison
- Overlay user listening pattern against one synthetic high-depression and one synthetic low-depression listener
- Show all three point clouds simultaneously
- Allow toggling which series' flow line is drawn (user, high, or low)
- Keep all dots visible regardless of selected flow line

#### Duration Breakdown
- Display top 12 tracks by milliseconds played
- Show listening duration for each track
- Sort by play time descending

### 5. Time Window Filtering

- **Date range selector** with calendar inputs for start and end dates
- **Default state** shows the full range of available timestamps
- **Validation** for:
  - Start date before end date
  - Both dates within available timestamp bounds
  - No valid timestamps in dataset
- **Real-time updates** to all charts when date range changes
- **Full range reset button** to restore default view

### 6. Summary Metrics

- **Session summary cards** displaying:
  - Total tracks in session
  - Match rate (percentage of tracks found in dataset)
  - Average valence
  - Average arousal
  - Session length (total milliseconds played)
- **Reference group cards** showing:
  - Listener profile designation (single synthetic listener)
  - Total tracks in reference group
  - Matched tracks in reference group

### 7. Data Privacy

- **No server-side storage** of user listening history
- **Session-only memory** for uploaded data
- **No signup or authentication** required
- **Stateless API** that returns responses and retains no data

---

## Technical Requirements

### Backend (Python/Flask)

- **Parser registry** supporting pluggable format detection and parsing
- **Format support**:
  - Spotify StreamingHistory JSON
  - YouTube Music Takeout JSON
  - Generic CSV/TSV with standard columns
- **Track enricher** that:
  - Looks up tracks in internal song dataset
  - Attaches valence, arousal, and attributes
  - Filters short plays based on duration threshold
  - Computes summary statistics
- **Reference group loader** that:
  - Loads synthetic listener data from CSV files
  - Caches data in memory to avoid repeated disk I/O
  - Supports multiple reference groups

### Frontend (HTML/D3.js)

- **Single-page application** with client-side rendering
- **Chart rendering** via D3.js with responsive layouts
- **Tab-based navigation** between visualisations
- **Chart registry** allowing modular, pluggable chart modules
- **Date filter state management** with validation and error messaging
- **Responsive design** adapting to mobile and desktop viewports

### Data Schema

#### NormalisedEvent
Every parsed event must normalise to:
- `track` (string): Track name
- `artist` (string): Artist name
- `timestamp` (ISO datetime): UTC play time
- `ms_played` (integer): Milliseconds played
- `matched` (boolean): Whether found in song dataset
- `valence` (float | null): 0–1 valence score
- `arousal` (float | null): 0–1 arousal score
- `attributes` (dict): Additional metadata

#### Song Record
Internal dataset entries must contain:
- `track` (string): Track name
- `artist` (string): Artist name
- `valence` (float): 0–1 valence score
- `arousal` (float): 0–1 arousal score
- `duration_ms` (integer): Track length in milliseconds
- Additional attributes freely passable to frontend

---

## Extension Points

### Adding a New Chart

1. Create a D3 module in `frontend/charts/` with:
   - `mount(container, filteredPayload)` function
   - `unmount()` function
2. Register in `frontend/app.js` registry with ID, label, and module reference
3. Chart appears automatically in tab navigation

### Adding a New Input Format

1. Create a parser in `api/parsers/` inheriting from `BaseParser`
2. Implement `parse(text, filename)` returning list of `NormalisedEvent`
3. Register in `api/registry.py` with format ID and detection rules
4. Parser is automatically available in upload flow

---

## Performance & Limits

- **In-memory caching** of reference group data to avoid repeated parsing
- **Client-side rendering** to avoid server load for visualisations
- **Date filtering** applied before chart rendering for responsive interaction
- **No hard limits** on session size, but performance degrades gracefully with large datasets (1000+ tracks)

---

## Error Handling

- **Unsupported file formats** → clear error message suggesting supported formats
- **Malformed input** → partial parsing with match rate reflected in summary
- **Missing timestamps** → date filter disabled with explanatory message
- **Track not found** → included in response but excluded from VA-based charts
- **Invalid date range** → inline error message blocking chart update

---

## Future Considerations

- Export/save session data as JSON
- User annotations (custom labels, notes on tracks)
- Statistical significance testing vs. reference groups
- Real-time upload progress for large files
- Dark/light theme toggle
- Keyboard shortcuts for chart navigation
