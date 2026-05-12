// Researcher mode application
const CONFIG = {
  PARTICIPANT_ID_FIELD: "Participant_ID",
  DEFAULT_RANGE: { valenceMin: 0, valenceMax: 1, arousalMin: 0, arousalMax: 1 },
};

const state = {
  data: null,
  metadata: [],
  participants: [],
  fields: [],
  selectedFields: [],
  selectedParticipants: [],
  range: { ...CONFIG.DEFAULT_RANGE },
  activeRequestId: 0,
};

const elements = {
  uploadZone: document.getElementById("uploadZone"),
  fileInput: document.getElementById("fileInput"),
  selectFilesBtn: document.getElementById("selectFilesBtn"),
  demoBtn: document.getElementById("demoBtn"),
  statusMessage: document.getElementById("statusMessage"),
  analysisSection: document.getElementById("analysisSection"),
  participantCheckboxes: document.getElementById("participantCheckboxes"),
  fieldCheckboxes: document.getElementById("fieldCheckboxes"),
  resultsSection: document.getElementById("resultsSection"),
  summaryGrid: document.getElementById("summaryGrid"),
  analysisGrid: document.getElementById("analysisGrid"),
  trajectorySection: document.getElementById("trajectorySection"),
  trajectoryContainer: document.getElementById("trajectoryContainer"),
  valenceMin: document.getElementById("valenceMin"),
  valenceMax: document.getElementById("valenceMax"),
  arousalMin: document.getElementById("arousalMin"),
  arousalMax: document.getElementById("arousalMax"),
  rangeMessage: document.getElementById("rangeMessage"),
  resetResearchFilters: document.getElementById("resetResearchFilters"),
};

elements.selectFilesBtn.addEventListener("click", () => elements.fileInput.click());
elements.demoBtn.addEventListener("click", loadDemo);
elements.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));

elements.uploadZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.uploadZone.classList.add("is-dragging");
});

elements.uploadZone.addEventListener("dragleave", () => {
  elements.uploadZone.classList.remove("is-dragging");
});

elements.uploadZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.uploadZone.classList.remove("is-dragging");
  handleFiles(event.dataTransfer.files);
});

[elements.valenceMin, elements.valenceMax, elements.arousalMin, elements.arousalMax].forEach((input) => {
  input.addEventListener("input", applyRangeInputs);
});

elements.resetResearchFilters.addEventListener("click", () => {
  if (!state.data) return;
  state.selectedParticipants = state.participants.map((participant) => participant.id);
  state.selectedFields = chooseDefaultFields(state.fields, state.metadata);
  state.range = { ...CONFIG.DEFAULT_RANGE };
  renderControls();
  updateAnalysis();
});

wireResizeHandling();

async function handleFiles(fileList) {
  const requestId = beginRequest("Processing research files...");

  try {
    const files = Array.from(fileList ?? []).filter((file) => file?.name);
    if (!files.length) {
      showStatus("No files were selected.", "error");
      return;
    }

    const metadataFile = await findMetadataFile(files);
    if (!metadataFile) {
      showStatus(`No metadata CSV with a "${CONFIG.PARTICIPANT_ID_FIELD}" column was found.`, "error");
      return;
    }

    const metadata = parseCSV(await metadataFile.text());
    const participantIds = metadata.map((row) => row[CONFIG.PARTICIPANT_ID_FIELD]).filter(Boolean);
    const listeningFiles = files.filter((file) => file !== metadataFile && isSupportedListeningFile(file));
    const validation = validateResearchFiles(participantIds, listeningFiles);

    if (!validation.valid) {
      showStatus(validation.message, "error");
      return;
    }

    const formData = new FormData();
    formData.append("metadata", metadataFile, basename(metadataFile));
    listeningFiles.forEach((file) => formData.append("listening_files", file, basename(file)));

    const response = await fetch("/api/researcher/process", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await safeJson(response);
      showStatus(error.error || "Backend processing failed.", "error");
      return;
    }

    const data = await response.json();
    if (!isCurrentRequest(requestId)) return;
    applyDataset(data, "Uploaded research dataset");
    showStatus(`Loaded ${data.count} participants from uploaded research files.`, "success");
  } catch (error) {
    console.error(error);
    if (isCurrentRequest(requestId)) {
      showStatus(`Upload error: ${error.message}`, "error");
    }
  } finally {
    if (isCurrentRequest(requestId)) {
      finishRequest();
    }
  }
}

async function loadDemo() {
  const requestId = beginRequest("Loading demo research dataset...");

  try {
    const response = await fetch("/api/researcher/demo");
    if (!response.ok) {
      const error = await safeJson(response);
      showStatus(error.error || "Failed to load demo data.", "error");
      return;
    }

    const data = await response.json();
    if (!isCurrentRequest(requestId)) return;
    applyDataset(data, "Demo research dataset");
    showStatus(`Demo loaded: ${data.count} participants with ${data.metadata_fields.length} metadata fields.`, "success");
  } catch (error) {
    console.error(error);
    if (isCurrentRequest(requestId)) {
      showStatus(`Demo load error: ${error.message}`, "error");
    }
  } finally {
    if (isCurrentRequest(requestId)) {
      finishRequest();
    }
  }
}

function beginRequest(message) {
  const requestId = state.activeRequestId + 1;
  state.activeRequestId = requestId;
  showStatus(message, "success");
  elements.demoBtn.disabled = true;
  elements.selectFilesBtn.disabled = true;
  return requestId;
}

function isCurrentRequest(requestId) {
  return requestId === state.activeRequestId;
}

function finishRequest() {
  elements.demoBtn.disabled = false;
  elements.selectFilesBtn.disabled = false;
}

function applyDataset(data, sourceLabel) {
  const participants = normalizeParticipants(data.participants ?? []);
  state.data = { ...data, participants };
  state.metadata = participants.map((participant) => ({
    [CONFIG.PARTICIPANT_ID_FIELD]: participant.id,
    ...(participant.metadata ?? {}),
  }));
  state.participants = participants;
  state.fields = data.metadata_fields ?? inferMetadataFields(state.metadata);
  state.selectedParticipants = participants.map((participant) => participant.id);
  state.selectedFields = chooseDefaultFields(state.fields, state.metadata);
  state.range = { ...CONFIG.DEFAULT_RANGE };

  renderControls();
  revealAnalysisSections();
  updateAnalysis(sourceLabel);
}

function normalizeParticipants(participants) {
  return [...participants]
    .filter((participant) => participant?.id)
    .map((participant) => ({
      ...participant,
      events: [...(participant.events ?? [])].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
      metadata: participant.metadata ?? {},
      summary: participant.summary ?? {},
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function revealAnalysisSections() {
  elements.analysisSection.hidden = false;
  elements.resultsSection.hidden = false;
  elements.trajectorySection.hidden = false;
}

function renderControls() {
  renderParticipantControls();
  renderFieldControls();
  syncRangeInputs();
}

function renderParticipantControls() {
  elements.participantCheckboxes.replaceChildren();

  if (!state.participants.length) {
    elements.participantCheckboxes.innerHTML = '<div class="empty-message empty-message--compact">No participants available.</div>';
    return;
  }

  state.participants.forEach((participant) => {
    const stats = computeParticipantStats(participant);
    const label = document.createElement("label");
    label.className = "checkbox-item researcher-choice";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = participant.id;
    input.checked = state.selectedParticipants.includes(participant.id);
    input.addEventListener("change", () => {
      state.selectedParticipants = Array.from(elements.participantCheckboxes.querySelectorAll("input:checked")).map((node) => node.value);
      updateAnalysis();
    });

    const copy = document.createElement("span");
    copy.innerHTML = `<b>${escapeHtml(participant.id)}</b><small>${stats.matchedEvents}/${stats.totalEvents} matched · ${formatRatio(stats.matchRate)}</small>`;

    label.append(input, copy);
    elements.participantCheckboxes.append(label);
  });
}

function renderFieldControls() {
  elements.fieldCheckboxes.replaceChildren();

  if (!state.fields.length) {
    elements.fieldCheckboxes.innerHTML = '<div class="empty-message empty-message--compact">No metadata fields available.</div>';
    return;
  }

  state.fields.forEach((field) => {
    const type = getFieldType(field, state.metadata);
    const label = document.createElement("label");
    label.className = "checkbox-item researcher-choice";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = field;
    input.checked = state.selectedFields.includes(field);
    input.addEventListener("change", () => {
      state.selectedFields = Array.from(elements.fieldCheckboxes.querySelectorAll("input:checked")).map((node) => node.value);
      updateAnalysis();
    });

    const copy = document.createElement("span");
    copy.innerHTML = `<b>${escapeHtml(field)}</b><small>${type}</small>`;

    label.append(input, copy);
    elements.fieldCheckboxes.append(label);
  });
}

function applyRangeInputs() {
  const nextRange = {
    valenceMin: clampNumber(elements.valenceMin.value, 0, 1),
    valenceMax: clampNumber(elements.valenceMax.value, 0, 1),
    arousalMin: clampNumber(elements.arousalMin.value, 0, 1),
    arousalMax: clampNumber(elements.arousalMax.value, 0, 1),
  };

  if (nextRange.valenceMin > nextRange.valenceMax || nextRange.arousalMin > nextRange.arousalMax) {
    elements.rangeMessage.textContent = "Minimum values cannot be greater than maximum values.";
    elements.rangeMessage.classList.add("is-error");
    return;
  }

  state.range = nextRange;
  elements.rangeMessage.classList.remove("is-error");
  elements.rangeMessage.textContent = describeRange(nextRange);
  updateAnalysis();
}

function syncRangeInputs() {
  elements.valenceMin.value = state.range.valenceMin;
  elements.valenceMax.value = state.range.valenceMax;
  elements.arousalMin.value = state.range.arousalMin;
  elements.arousalMax.value = state.range.arousalMax;
  elements.rangeMessage.classList.remove("is-error");
  elements.rangeMessage.textContent = describeRange(state.range);
}

function updateAnalysis(sourceLabel = null) {
  if (!state.data) return;

  const filteredData = getFilteredData();
  renderResearchSummary(filteredData, sourceLabel);
  renderMetadataAnalysis(filteredData, state.selectedFields);
  renderTrajectories(filteredData);
}

function getFilteredData() {
  const selectedIds = new Set(state.selectedParticipants);
  const participants = state.data.participants
    .filter((participant) => selectedIds.has(participant.id))
    .map((participant) => ({
      ...participant,
      filteredEvents: (participant.events ?? []).filter((event) => eventInEmotionalRange(event, state.range)),
    }));

  return { ...state.data, participants };
}

function eventInEmotionalRange(event, range) {
  if (!event.matched || event.valence == null || event.arousal == null) return false;
  const valence = Number(event.valence);
  const arousal = Number(event.arousal);
  return (
    Number.isFinite(valence) &&
    Number.isFinite(arousal) &&
    valence >= range.valenceMin &&
    valence <= range.valenceMax &&
    arousal >= range.arousalMin &&
    arousal <= range.arousalMax
  );
}

function renderResearchSummary(data, sourceLabel) {
  const stats = computeAggregateStats(data.participants);
  const cards = [
    { label: "Participants", value: stats.participantCount, hint: sourceLabel ?? "Selected research sample" },
    { label: "Matched tracks", value: `${stats.matchedEvents}/${stats.totalEvents}`, hint: `${formatRatio(stats.matchRate)} usable for V-A analysis` },
    { label: "Avg valence", value: formatNumber(stats.meanValence), hint: "Average positivity across matched plays" },
    { label: "Avg arousal", value: formatNumber(stats.meanArousal), hint: "Average energy across matched plays" },
  ];

  elements.summaryGrid.replaceChildren();
  cards.forEach((card) => {
    const node = document.createElement("article");
    node.className = "stat-card research-stat";
    node.innerHTML = `
      <span class="stat-card__label">${card.label}</span>
      <span class="stat-card__value">${card.value}</span>
      <span class="stat-card__hint">${card.hint}</span>
    `;
    elements.summaryGrid.append(node);
  });
}

function renderMetadataAnalysis(data, fields) {
  elements.analysisGrid.replaceChildren();

  if (!data.participants.length) {
    elements.analysisGrid.innerHTML = '<div class="empty-message">No participants selected. Select at least one participant to analyze.</div>';
    return;
  }

  if (!fields.length) {
    elements.analysisGrid.innerHTML = '<div class="empty-message">Select metadata fields to compare participant groups.</div>';
    return;
  }
  const numericFields = fields.filter((field) => getFieldType(field, state.metadata) === "numeric");
  const skippedFields = fields.filter((field) => getFieldType(field, state.metadata) !== "numeric");

  const panel = document.createElement("article");
  panel.className = "chart-panel metadata-panel research-compare-panel";
  panel.innerHTML = `
    <div class="chart-panel__title">Normalized metadata comparison</div>
    <div class="chart-panel__note">All values are normalized to a 0-1 scale within each feature. Each line represents one selected field, and each dot is a participant.</div>
  `;

  if (!numericFields.length) {
    panel.insertAdjacentHTML("beforeend", '<div class="empty-message empty-message--compact">Select at least one numeric field to plot. Categorical fields are listed in the controls but are not drawn in this line chart.</div>');
    elements.analysisGrid.append(panel);
    return;
  }

  if (skippedFields.length) {
    const note = document.createElement("div");
    note.className = "chart-panel__note research-compare-panel__note";
    note.textContent = `Categorical fields not plotted: ${skippedFields.join(", ")}.`;
    panel.append(note);
  }

  renderNormalizedFieldComparison(panel, data.participants, numericFields);
  elements.analysisGrid.append(panel);
}

function renderNormalizedFieldComparison(panel, participants, fields) {
  const colors = ["#68d2c9", "#f2b66d", "#ff8b8b", "#7cf0a6", "#b19cd9", "#87ceeb", "#ffa07a", "#ffd700", "#ff69b4", "#00ff7f"];
  const series = fields
    .map((field, index) => {
      const values = participants
        .map((participant) => {
          const rawValue = parseFloat(participant.metadata?.[field]);
          return Number.isFinite(rawValue) ? rawValue : null;
        })
        .filter((value) => value != null);

      if (!values.length) return null;

      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      const points = participants
        .map((participant) => {
          const rawValue = parseFloat(participant.metadata?.[field]);
          if (!Number.isFinite(rawValue)) return null;
          return {
            participantId: participant.id,
            rawValue,
            normalizedValue: (rawValue - min) / range,
          };
        })
        .filter(Boolean);

      return {
        field,
        min,
        max,
        points,
        color: colors[index % colors.length],
      };
    })
    .filter(Boolean);

  if (!series.length) {
    panel.insertAdjacentHTML("beforeend", '<div class="empty-message empty-message--compact">No numeric values were available for the selected fields.</div>');
    return;
  }

  const shell = document.createElement("div");
  shell.className = "research-line-chart-shell";

  const chartWrap = document.createElement("div");
  chartWrap.className = "research-line-chart";
  shell.append(chartWrap);

  const legend = document.createElement("div");
  legend.className = "research-line-legend";
  series.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "research-line-legend__item";
    item.innerHTML = `
      <span class="legend-swatch" style="background:${entry.color}"></span>
      <span class="research-line-legend__label">
        <b>${escapeHtml(entry.field)}</b>
        <small>${formatNumber(entry.min)} to ${formatNumber(entry.max)} on a normalized 0-1 scale</small>
      </span>
    `;
    legend.append(item);
  });

  const participantIds = participants.map((participant) => participant.id);
  const margin = { top: 24, right: 24, bottom: 100, left: 64 };
  const width = Math.max(840, participantIds.length * 88);
  const height = 420;

  const svg = d3.select(chartWrap).append("svg").attr("viewBox", `0 0 ${width} ${height}`).classed("research-line-chart__svg", true);
  const x = d3.scalePoint().domain(participantIds).range([margin.left, width - margin.right]).padding(0.45);
  const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);

  for (let index = 0; index <= 5; index += 1) {
    const value = index / 5;
    svg.append("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y(value)).attr("y2", y(value)).attr("class", "research-line-grid");
    svg.append("text").attr("x", margin.left - 10).attr("y", y(value) + 4).attr("text-anchor", "end").attr("class", "svg-label").text(value.toFixed(1));
  }

  participantIds.forEach((participantId) => {
    svg.append("line").attr("x1", x(participantId)).attr("x2", x(participantId)).attr("y1", margin.top).attr("y2", height - margin.bottom).attr("class", "research-line-grid research-line-grid--vertical");
    svg
      .append("text")
      .attr("x", x(participantId))
      .attr("y", height - margin.bottom + 22)
      .attr("text-anchor", "end")
      .attr("transform", `rotate(-32 ${x(participantId)} ${height - margin.bottom + 22})`)
      .attr("class", "svg-label research-line-label")
      .text(participantId);
  });

  const line = d3
    .line()
    .defined((point) => point && Number.isFinite(point.normalizedValue))
    .x((point) => x(point.participantId))
    .y((point) => y(point.normalizedValue))
    .curve(d3.curveMonotoneX);

  series.forEach((entry) => {
    const group = svg.append("g").attr("class", "research-line-series");
    group
      .append("path")
      .datum(entry.points)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", entry.color)
      .attr("stroke-width", 2.8)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.88);

    group
      .selectAll("circle")
      .data(entry.points)
      .enter()
      .append("circle")
      .attr("cx", (point) => x(point.participantId))
      .attr("cy", (point) => y(point.normalizedValue))
      .attr("r", 4.5)
      .attr("fill", entry.color)
      .attr("stroke", "rgba(255,255,255,0.8)")
      .attr("stroke-width", 0.8)
      .append("title")
      .text((point) => `${entry.field} · ${point.participantId}\nRaw ${formatNumber(point.rawValue)} · Normalized ${formatNumber(point.normalizedValue)}`);
  });

  svg.append("text").attr("x", margin.left + (width - margin.left - margin.right) / 2).attr("y", height - 4).attr("text-anchor", "middle").attr("class", "svg-label").text("Participants");
  svg
    .append("text")
    .attr("transform", `translate(20 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("class", "svg-label")
    .text("Normalized value (0-1)");

  shell.append(legend);
  panel.append(shell);
}

function renderTrajectories(data) {
  elements.trajectoryContainer.replaceChildren();

  if (!data.participants.length) {
    elements.trajectoryContainer.innerHTML = '<div class="empty-message">No participants selected. The trajectory view needs at least one selected participant.</div>';
    return;
  }

  const drawable = data.participants
    .map((participant) => ({
      participant,
      events: participant.filteredEvents ?? [],
      stats: computeParticipantStats(participant, participant.filteredEvents ?? []),
    }))
    .filter((entry) => entry.events.length >= 2);

  if (!drawable.length) {
    elements.trajectoryContainer.innerHTML = '<div class="empty-message">No selected participant has at least two matched tracks inside the current emotional range.</div>';
    renderSkippedParticipants(data.participants);
    return;
  }

  const shell = document.createElement("div");
  shell.className = "trajectory-layout";
  const chartNode = document.createElement("div");
  chartNode.className = "trajectory-chart";
  const sideNode = document.createElement("aside");
  sideNode.className = "trajectory-side";
  shell.append(chartNode, sideNode);
  elements.trajectoryContainer.append(shell);

  const margin = { top: 26, right: 24, bottom: 54, left: 60 };
  const containerWidth = Math.max(320, chartNode.clientWidth || elements.trajectoryContainer.clientWidth || 800);
  const size = Math.max(300, Math.min(680, containerWidth - margin.left - margin.right));
  const width = size + margin.left + margin.right;
  const height = size + margin.top + margin.bottom;

  const svg = d3.select(chartNode).append("svg").attr("viewBox", `0 0 ${width} ${height}`).classed("chart-svg", true);
  const x = d3.scaleLinear().domain([0, 1]).range([margin.left, margin.left + size]);
  const y = d3.scaleLinear().domain([0, 1]).range([margin.top + size, margin.top]);
  const colors = ["#68d2c9", "#f2b66d", "#ff8b8b", "#7cf0a6", "#b19cd9", "#87ceeb", "#ffa07a", "#ffd700", "#ff69b4", "#00ff7f"];

  drawTrajectoryScaffold(svg, { x, y, margin, size, width, height });

  drawable.forEach((entry, index) => {
    const color = colors[index % colors.length];
    const coords = entry.events.map((event) => ({
      ...event,
      valence: Number(event.valence),
      arousal: Number(event.arousal),
    }));
    const line = d3
      .line()
      .x((event) => x(event.valence))
      .y((event) => y(event.arousal))
      .curve(coords.length >= 3 ? d3.curveCatmullRom.alpha(0.45) : d3.curveLinear);

    const group = svg.append("g").attr("class", "participant-path");
    group
      .append("path")
      .datum(coords)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2.8)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.8);

    group
      .selectAll("circle")
      .data(coords)
      .enter()
      .append("circle")
      .attr("cx", (event) => x(event.valence))
      .attr("cy", (event) => y(event.arousal))
      .attr("r", 4)
      .attr("fill", color)
      .attr("stroke", "rgba(255,255,255,0.72)")
      .attr("stroke-width", 0.8)
      .append("title")
      .text((event) => `${entry.participant.id}: ${event.track} by ${event.artist}\nValence ${formatNumber(event.valence)} · Arousal ${formatNumber(event.arousal)}`);

    const legendItem = document.createElement("div");
    legendItem.className = "trajectory-legend__item";
    legendItem.innerHTML = `
      <span class="legend-swatch" style="background:${color}"></span>
      <span class="legend-label"><b>${escapeHtml(entry.participant.id)}</b><small>${entry.events.length} points · volatility ${formatNumber(entry.stats.volatility)}</small></span>
    `;
    sideNode.append(legendItem);
  });

  renderSkippedParticipants(data.participants, sideNode);
}

function drawTrajectoryScaffold(svg, { x, y, margin, size, width, height }) {
  for (let i = 0; i <= 5; i += 1) {
    const value = i / 5;
    svg.append("line").attr("x1", x(value)).attr("y1", margin.top).attr("x2", x(value)).attr("y2", margin.top + size).attr("class", "trajectory-grid");
    svg.append("line").attr("x1", margin.left).attr("y1", y(value)).attr("x2", margin.left + size).attr("y2", y(value)).attr("class", "trajectory-grid");
    svg.append("text").attr("x", x(value)).attr("y", margin.top + size + 22).attr("text-anchor", "middle").attr("class", "svg-label").text(value.toFixed(1));
    svg.append("text").attr("x", margin.left - 14).attr("y", y(value) + 4).attr("text-anchor", "end").attr("class", "svg-label").text(value.toFixed(1));
  }

  svg.append("line").attr("x1", x(0.5)).attr("x2", x(0.5)).attr("y1", margin.top).attr("y2", margin.top + size).attr("class", "trajectory-midline");
  svg.append("line").attr("y1", y(0.5)).attr("y2", y(0.5)).attr("x1", margin.left).attr("x2", margin.left + size).attr("class", "trajectory-midline");
  svg.append("text").attr("x", margin.left + size / 2).attr("y", height - 12).attr("text-anchor", "middle").attr("class", "svg-label").text("Valence (positivity)");
  svg.append("text").attr("transform", "rotate(-90)").attr("x", -(margin.top + size / 2)).attr("y", 18).attr("text-anchor", "middle").attr("class", "svg-label").text("Arousal (energy)");
}

function renderSkippedParticipants(participants, container = elements.trajectoryContainer) {
  const skipped = participants.filter((participant) => (participant.filteredEvents ?? []).length < 2);
  if (!skipped.length) return;

  const note = document.createElement("div");
  note.className = "chart-panel__note trajectory-note";
  note.textContent = `${skipped.length} selected participant${skipped.length === 1 ? "" : "s"} had fewer than two matched points in the current range.`;
  container.append(note);
}

function computeAggregateStats(participants) {
  const participantStats = participants.map((participant) => computeParticipantStats(participant, participant.filteredEvents));
  const matchedEvents = participants.flatMap((participant) => participant.filteredEvents ?? []);
  const totalEvents = participants.reduce((sum, participant) => sum + (participant.events?.length ?? 0), 0);

  return {
    participantCount: participants.length,
    totalEvents,
    matchedEvents: matchedEvents.length,
    matchRate: totalEvents ? matchedEvents.length / totalEvents : 0,
    meanValence: mean(matchedEvents.map((event) => Number(event.valence))),
    meanArousal: mean(matchedEvents.map((event) => Number(event.arousal))),
    meanVolatility: mean(participantStats.map((stats) => stats.volatility)),
  };
}

function computeParticipantStats(participant, eventsOverride = null) {
  const totalEvents = participant.events?.length ?? 0;
  const matched = eventsOverride ?? (participant.events ?? []).filter((event) => eventInEmotionalRange(event, CONFIG.DEFAULT_RANGE));
  const volatility = computeVolatility(matched);

  return {
    totalEvents,
    matchedEvents: matched.length,
    matchRate: totalEvents ? matched.length / totalEvents : 0,
    meanValence: mean(matched.map((event) => Number(event.valence))),
    meanArousal: mean(matched.map((event) => Number(event.arousal))),
    volatility,
  };
}

function computeVolatility(events) {
  if (!events || events.length < 2) return null;
  let total = 0;
  let steps = 0;
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    const distance = Math.hypot(Number(current.valence) - Number(previous.valence), Number(current.arousal) - Number(previous.arousal));
    if (Number.isFinite(distance)) {
      total += distance;
      steps += 1;
    }
  }
  return steps ? total / steps : null;
}

async function findMetadataFile(files) {
  const csvFiles = files.filter((file) => basename(file).toLowerCase().endsWith(".csv"));
  const likely = csvFiles.find((file) => basename(file).toLowerCase() === "metadata.csv");
  if (likely) return likely;

  for (const file of csvFiles) {
    const preview = await file.text();
    const [header = ""] = preview.split(/\r?\n/, 1);
    if (header.split(",").map((cell) => cell.trim()).includes(CONFIG.PARTICIPANT_ID_FIELD)) {
      return file;
    }
  }
  return null;
}

function validateResearchFiles(participantIds, listeningFiles) {
  const expected = new Set(participantIds);
  const actual = new Set(listeningFiles.map((file) => basename(file).replace(/\.(csv|json|tsv)$/i, "")));
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));

  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`Missing listening files for: ${missing.join(", ")}`);
    if (extra.length) parts.push(`Files not found in metadata: ${extra.join(", ")}`);
    return { valid: false, message: parts.join("\n") };
  }

  return { valid: true, message: "" };
}

function parseCSV(text) {
  const rows = [];
  const parsedRows = parseCsvRows(text);
  const [headers, ...records] = parsedRows;
  if (!headers) return rows;

  records.forEach((record) => {
    if (!record.some((value) => value.trim())) return;
    const row = {};
    headers.forEach((header, index) => {
      row[header.trim()] = (record[index] ?? "").trim();
    });
    rows.push(row);
  });
  return rows;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function inferMetadataFields(metadata) {
  const first = metadata[0] ?? {};
  return Object.keys(first).filter((key) => key !== CONFIG.PARTICIPANT_ID_FIELD);
}

function chooseDefaultFields(fields, metadata) {
  const numeric = fields.filter((field) => getFieldType(field, metadata) === "numeric");
  return (numeric.length ? numeric : fields).slice(0, 3);
}

function getFieldType(field, metadata) {
  const values = metadata.map((row) => row[field]).filter((value) => value !== "" && value != null);
  if (!values.length) return "empty";
  return values.every((value) => Number.isFinite(parseFloat(value))) ? "numeric" : "categorical";
}

function isSupportedListeningFile(file) {
  return /\.(csv|tsv|json)$/i.test(basename(file));
}

function basename(file) {
  return (file.webkitRelativePath || file.name).split("/").pop();
}

function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function clampNumber(value, min, max) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function describeRange(range) {
  return `Valence ${range.valenceMin.toFixed(2)}-${range.valenceMax.toFixed(2)} · Arousal ${range.arousalMin.toFixed(2)}-${range.arousalMax.toFixed(2)}`;
}

function formatNumber(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatRatio(value) {
  return `${Math.round((Number.isFinite(value) ? value : 0) * 100)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function showStatus(message, type) {
  const div = document.createElement("div");
  div.className = `status-message ${type}`;
  div.textContent = message;
  elements.statusMessage.replaceChildren(div);
}

function wireResizeHandling() {
  let resizeHandle = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeHandle);
    resizeHandle = window.setTimeout(() => {
      if (state.data) {
        renderTrajectories(getFilteredData());
      }
    }, 140);
  });
}
