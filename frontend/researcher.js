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
  fieldFilters: {},
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
  state.fieldFilters = {};
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
      showStatus(await responseErrorMessage(response, "Backend processing failed."), "error");
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
      showStatus(await responseErrorMessage(response, "Failed to load demo data."), "error");
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
  state.fieldFilters = {};
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

  const selectedData = getSelectedParticipantData();
  const filteredData = getFilteredResearchData(selectedData);
  renderResearchSummary(filteredData, sourceLabel);
  renderMetadataAnalysis(selectedData, state.selectedFields);
  renderTrajectories(filteredData);
}

function getSelectedParticipantData() {
  const selectedIds = new Set(state.selectedParticipants);
  const participants = state.data.participants.filter((participant) => selectedIds.has(participant.id));

  return { ...state.data, participants };
}

function getFilteredResearchData(sourceData = null) {
  const baseData = sourceData ?? getSelectedParticipantData();
  const activeFields = getActiveNumericFields();
  const participants = baseData.participants
    .filter((participant) => participantMatchesFieldFilters(participant, activeFields))
    .map((participant) => ({
      ...participant,
      filteredEvents: (participant.events ?? []).filter((event) => eventInEmotionalRange(event, state.range)),
    }));

  return { ...baseData, participants };
}

function getActiveNumericFields() {
  return state.selectedFields.filter((field) => getFieldType(field, state.metadata) === "numeric");
}

function participantMatchesFieldFilters(participant, activeFields) {
  return activeFields.every((field) => {
    const filter = getFieldFilter(field);
    const hasLower = filter.lower !== "" && Number.isFinite(Number(filter.lower));
    const hasUpper = filter.upper !== "" && Number.isFinite(Number(filter.upper));
    if (!hasLower && !hasUpper) return true;

    const rawValue = parseFloat(participant.metadata?.[field]);
    if (!Number.isFinite(rawValue)) return false;

    if (hasLower && rawValue < Number(filter.lower)) return false;
    if (hasUpper && rawValue > Number(filter.upper)) return false;
    return true;
  });
}

function getFieldFilter(field) {
  return state.fieldFilters[field] ?? { lower: "", upper: "" };
}

function setFieldFilter(field, nextFilter) {
  state.fieldFilters = {
    ...state.fieldFilters,
    [field]: {
      lower: nextFilter.lower ?? "",
      upper: nextFilter.upper ?? "",
    },
  };
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
    { label: "Avg valence", value: formatMoodValue(stats.meanValence), hint: "Average positivity across matched plays (expected VA range 0-1)" },
    { label: "Avg arousal", value: formatMoodValue(stats.meanArousal), hint: "Average energy across matched plays (displayed as -0.5 to 0.5)" },
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

  if (!numericFields.length) {
    elements.analysisGrid.innerHTML = '<div class="empty-message">Select at least one numeric field to plot. Categorical fields remain available in the controls, but they are not shown as distributions.</div>';
    return;
  }

  if (skippedFields.length) {
    const notice = document.createElement("div");
    notice.className = "chart-panel chart-panel--notice research-compare-panel";
    notice.innerHTML = `<div class="chart-panel__title">Categorical fields omitted</div><div class="chart-panel__note">${skippedFields.map(escapeHtml).join(", ")} are categorical, so they are not shown in the distribution charts.</div>`;
    elements.analysisGrid.append(notice);
  }

  numericFields.forEach((field) => {
    const panel = document.createElement("article");
    panel.className = "chart-panel metadata-panel research-dist-panel";
    const stats = computeFieldDistributionStats(data.participants, field);
    const filter = getFieldFilter(field);
    panel.innerHTML = `
      <div class="chart-panel__title">${escapeHtml(field)}</div>
      <div class="chart-panel__note">Raw-value histogram for this field. Use the threshold inputs to highlight the range you care about.</div>
    `;

    const controls = document.createElement("div");
    controls.className = "research-filter-controls";
    controls.innerHTML = `
      <div class="research-filter-controls__row">
        <label class="research-filter-field">
          <span>&gt;</span>
          <input type="number" step="any" data-field-filter="${escapeHtml(field)}" data-bound="lower" value="${escapeHtml(filter.lower)}" placeholder="${formatNumber(stats.min)}" />
        </label>
        <label class="research-filter-field">
          <span>&lt;</span>
          <input type="number" step="any" data-field-filter="${escapeHtml(field)}" data-bound="upper" value="${escapeHtml(filter.upper)}" placeholder="${formatNumber(stats.max)}" />
        </label>
      </div>
      <div class="research-filter-meta">
        <span>Min <b>${formatNumber(stats.min)}</b></span>
        <span>Max <b>${formatNumber(stats.max)}</b></span>
        <span>Mean <b>${formatNumber(stats.mean)}</b></span>
        <span>Selected <b>${stats.selectedCount}/${stats.totalCount}</b></span>
      </div>
    `;

    controls.querySelectorAll("input[data-field-filter]").forEach((input) => {
      input.addEventListener("input", () => {
        const next = getFieldFilter(field);
        const bound = input.dataset.bound;
        next[bound] = input.value;
        setFieldFilter(field, next);
        updateAnalysis();
      });
    });

    const chart = renderDistributionHistogram(field, data.participants, stats, filter);
    panel.append(controls, chart);
    elements.analysisGrid.append(panel);
  });
}

function computeFieldDistributionStats(participants, field) {
  const values = participants
    .map((participant) => parseFloat(participant.metadata?.[field]))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return {
      values: [],
      min: 0,
      max: 1,
      mean: null,
      totalCount: participants.length,
      selectedCount: 0,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const meanValue = mean(values);
  const selectedCount = participants.filter((participant) => participantMatchesSingleFieldFilter(participant, field)).length;

  return {
    values,
    min,
    max,
    mean: meanValue,
    totalCount: participants.length,
    selectedCount,
  };
}

function participantMatchesSingleFieldFilter(participant, field) {
  const filter = getFieldFilter(field);
  const lowerActive = filter.lower !== "" && Number.isFinite(Number(filter.lower));
  const upperActive = filter.upper !== "" && Number.isFinite(Number(filter.upper));
  if (!lowerActive && !upperActive) return true;

  const value = parseFloat(participant.metadata?.[field]);
  if (!Number.isFinite(value)) return false;
  if (lowerActive && value < Number(filter.lower)) return false;
  if (upperActive && value > Number(filter.upper)) return false;
  return true;
}

function renderDistributionHistogram(field, participants, stats, filter) {
  const colors = ["#68d2c9", "#f2b66d", "#ff8b8b", "#7cf0a6", "#b19cd9", "#87ceeb", "#ffa07a", "#ffd700", "#ff69b4", "#00ff7f"];
  const svgWidth = 340;
  const svgHeight = 198;
  const margin = { top: 12, right: 12, bottom: 56, left: 44 };
  const innerWidth = svgWidth - margin.left - margin.right;
  const innerHeight = svgHeight - margin.top - margin.bottom;
  const bins = 12;
  const rawMin = Number.isFinite(stats.min) ? stats.min : 0;
  const rawMax = Number.isFinite(stats.max) ? stats.max : 1;
  const domainMax = rawMax === rawMin ? rawMin + 1 : rawMax;
  const x = d3.scaleLinear().domain([rawMin, domainMax]).range([margin.left, margin.left + innerWidth]);
  const values = participants
    .map((participant) => ({
      participantId: participant.id,
      rawValue: parseFloat(participant.metadata?.[field]),
    }))
    .filter((entry) => Number.isFinite(entry.rawValue));

  const binWidth = (domainMax - rawMin) / bins;

  const binCounts = Array.from({ length: bins }, (_, index) => ({
    start: rawMin + (index * binWidth),
    end: index === bins - 1 ? domainMax : rawMin + ((index + 1) * binWidth),
    count: 0,
  }));

  values.forEach((entry) => {
    const offset = entry.rawValue - rawMin;
    const binIndex = Math.min(bins - 1, Math.max(0, Math.floor(offset / (binWidth || 1))));
    binCounts[binIndex].count += 1;
  });

  const maxCount = Math.max(1, ...binCounts.map((bin) => bin.count));
  const lowerActive = filter.lower !== "" && Number.isFinite(Number(filter.lower));
  const upperActive = filter.upper !== "" && Number.isFinite(Number(filter.upper));
  const hasFilter = lowerActive || upperActive;
  const selectionStart = lowerActive ? Number(filter.lower) : rawMin;
  const selectionEnd = upperActive ? Number(filter.upper) : domainMax;
  const clampedSelectionStart = Math.max(rawMin, Math.min(domainMax, Math.min(selectionStart, selectionEnd)));
  const clampedSelectionEnd = Math.max(rawMin, Math.min(domainMax, Math.max(selectionStart, selectionEnd)));
  const highlightColor = colors[0];

  const wrapper = document.createElement("div");
  wrapper.className = "research-dist-chart";

  const svg = d3.select(wrapper).append("svg").attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`).classed("research-dist-chart__svg", true);

  if (hasFilter) {
    svg
      .append("rect")
      .attr("x", x(clampedSelectionStart))
      .attr("y", margin.top)
      .attr("width", Math.max(2, x(clampedSelectionEnd) - x(clampedSelectionStart)))
      .attr("height", innerHeight)
      .attr("fill", "rgba(104, 210, 201, 0.08)")
      .attr("stroke", "rgba(104, 210, 201, 0.36)")
      .attr("stroke-dasharray", "4 4");
  }

  const yTicks = [...new Set([0, ...d3.ticks(0, maxCount, 4).map((value) => Math.round(value)), Math.round(maxCount)])]
    .filter((value) => value >= 0 && value <= Math.round(maxCount))
    .sort((a, b) => a - b);
  yTicks.forEach((countValue) => {
    const tickY = margin.top + innerHeight - ((countValue / Math.max(1, Math.round(maxCount))) * innerHeight);
    svg.append("line").attr("x1", margin.left).attr("x2", margin.left + innerWidth).attr("y1", tickY).attr("y2", tickY).attr("class", "research-line-grid");
    svg.append("text").attr("x", margin.left - 10).attr("y", tickY + 4).attr("text-anchor", "end").attr("class", "svg-label research-dist-label").text(countValue);
  });

  binCounts.forEach((bin) => {
    const barX = x(bin.start);
    const barWidth = Math.max(2, x(bin.end) - x(bin.start) - 2);
    const barHeight = (bin.count / maxCount) * innerHeight;
    const inRange = bin.end >= clampedSelectionStart && bin.start <= clampedSelectionEnd;

    svg
      .append("rect")
      .attr("x", barX)
      .attr("y", margin.top + innerHeight - barHeight)
      .attr("width", barWidth)
      .attr("height", barHeight)
      .attr("rx", 4)
      .attr("fill", inRange ? highlightColor : "rgba(238, 244, 255, 0.18)")
      .attr("opacity", inRange ? 0.88 : 0.45)
      .append("title")
      .text(`Value ${formatNumber(bin.start)} to ${formatNumber(bin.end)}\nCount ${bin.count}`);
  });

  const axisY = margin.top + innerHeight;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((step) => rawMin + ((domainMax - rawMin) * step));

  svg.append("line")
    .attr("x1", margin.left)
    .attr("x2", margin.left + innerWidth)
    .attr("y1", axisY)
    .attr("y2", axisY)
    .attr("class", "research-line-grid");

  xTicks.forEach((tickValue) => {
    const tickX = x(tickValue);
    svg.append("line")
      .attr("x1", tickX)
      .attr("x2", tickX)
      .attr("y1", axisY)
      .attr("y2", axisY + 4)
      .attr("class", "research-line-grid");
    svg.append("text")
      .attr("x", tickX)
      .attr("y", axisY + 16)
      .attr("text-anchor", "middle")
      .attr("class", "svg-label research-dist-label")
      .text(formatNumber(tickValue));
  });

  svg.append("text").attr("x", margin.left + innerWidth / 2).attr("y", svgHeight - 4).attr("text-anchor", "middle").attr("class", "svg-label research-dist-axis-label").text(field);
  svg.append("text").attr("transform", `translate(12 ${margin.top + innerHeight / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("class", "svg-label research-dist-axis-label").text("Count");

  const note = document.createElement("div");
  note.className = "research-dist-note";
  note.innerHTML = describeDistributionFilter(filter, stats);

  wrapper.append(note);
  return wrapper;
}

function describeDistributionFilter(filter, stats) {
  const hasLower = filter.lower !== "" && Number.isFinite(Number(filter.lower));
  const hasUpper = filter.upper !== "" && Number.isFinite(Number(filter.upper));

  if (hasLower && hasUpper) {
    const lower = Number(filter.lower);
    const upper = Number(filter.upper);
    if (lower > upper) {
      return `Thresholds are inverted. Lower threshold <b>${escapeHtml(filter.lower)}</b> is above upper threshold <b>${escapeHtml(filter.upper)}</b>; no participants will match until that is fixed.`;
    }
    return `Highlighting values from <b>${escapeHtml(filter.lower)}</b> to <b>${escapeHtml(filter.upper)}</b>.`;
  }

  if (hasLower) {
    return `Highlighting values greater than or equal to <b>${escapeHtml(filter.lower)}</b>.`;
  }

  if (hasUpper) {
    return `Highlighting values less than or equal to <b>${escapeHtml(filter.upper)}</b>.`;
  }

  return `No threshold applied yet. Enter a &gt; and/or &lt; value to shade the relevant area. Min <b>${formatNumber(stats.min)}</b> · Max <b>${formatNumber(stats.max)}</b>.`;
}

function renderTrajectories(data) {
  elements.trajectoryContainer.replaceChildren();

  if (!data.participants.length) {
    elements.trajectoryContainer.innerHTML = '<div class="empty-message">No users have been found.</div>';
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
    elements.trajectoryContainer.innerHTML = '<div class="empty-message">No users have been found.</div>';
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
  const x = d3.scaleLinear().domain([-0.5, 0.5]).range([margin.left, margin.left + size]);
  const y = d3.scaleLinear().domain([-0.5, 0.5]).range([margin.top + size, margin.top]);
  const colors = ["#68d2c9", "#f2b66d", "#ff8b8b", "#7cf0a6", "#b19cd9", "#87ceeb", "#ffa07a", "#ffd700", "#ff69b4", "#00ff7f"];

  drawTrajectoryScaffold(svg, { x, y, margin, size, width, height });

  const series = drawable.map((entry, index) => {
    const color = colors[index % colors.length];
    const coords = [...entry.events]
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .map((event, eventIndex, events) => ({
        ...event,
        valence: Number(event.valence),
        arousal: Number(event.arousal),
        progress: events.length <= 1 ? 1 : eventIndex / (events.length - 1),
      }))
      .filter((event) => Number.isFinite(event.valence) && Number.isFinite(event.arousal));

    const group = svg.append("g").attr("class", "participant-path");
    const pathNode = group
      .append("path")
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2.8)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.8);
    const pointsNode = group.append("g");

    const legendItem = document.createElement("div");
    legendItem.className = "trajectory-legend__item";
    legendItem.innerHTML = `
      <span class="legend-swatch" style="background:${color}"></span>
      <span class="legend-label"><b>${escapeHtml(entry.participant.id)}</b><small>${coords.length} points · volatility ${formatNumber(entry.stats.volatility)}</small></span>
    `;
    sideNode.append(legendItem);

    return {
      entry,
      color,
      coords,
      pathNode,
      pointsNode,
      line: d3
        .line()
        .x((event) => x(shiftMoodValue(event.valence)))
        .y((event) => y(shiftMoodValue(event.arousal)))
        .curve(coords.length >= 3 ? d3.curveCatmullRom.alpha(0.45) : d3.curveLinear),
    };
  });

  const controls = document.createElement("div");
  controls.className = "trajectory-controls";
  controls.innerHTML = `
    <div class="trajectory-slider-wrapper">
      <input type="range" class="trajectory-slider" min="0" max="100" step="1" value="100" />
      <span class="trajectory-time-display"></span>
    </div>
    <div class="trajectory-speed-wrapper">
      <label class="trajectory-speed-label">Speed: <span class="trajectory-speed-value">1.0x</span></label>
      <input type="range" class="trajectory-speed-slider" min="0.5" max="4" step="0.5" value="1" />
    </div>
    <div class="trajectory-buttons">
      <button type="button" class="trajectory-play-btn">Play</button>
      <button type="button" class="trajectory-reset-btn">Reset</button>
    </div>
    <div class="chart-panel__note trajectory-note">Timeline is normalized to 0-100% for each user so different listening spans are directly comparable.</div>
  `;
  elements.trajectoryContainer.append(controls);

  const slider = controls.querySelector(".trajectory-slider");
  const speedSlider = controls.querySelector(".trajectory-speed-slider");
  const speedValue = controls.querySelector(".trajectory-speed-value");
  const playBtn = controls.querySelector(".trajectory-play-btn");
  const resetBtn = controls.querySelector(".trajectory-reset-btn");
  const progressLabel = controls.querySelector(".trajectory-time-display");

  const playback = {
    progress: 1,
    speed: 1,
    playing: false,
    lastFrameTime: Date.now(),
  };

  function renderProgress(progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    playback.progress = clamped;
    slider.value = String(Math.round(clamped * 100));
    progressLabel.textContent = `Normalized progress: ${Math.round(clamped * 100)}%`;

    series.forEach((item) => {
      if (!item.coords.length) {
        item.pathNode.attr("d", null);
        item.pointsNode.selectAll("*").remove();
        return;
      }

      const lastIndex = Math.max(0, Math.floor(clamped * (item.coords.length - 1)));
      const visibleCoords = item.coords.slice(0, lastIndex + 1);
      item.pathNode.attr("d", visibleCoords.length >= 2 ? item.line(visibleCoords) : null);

      const points = item.pointsNode.selectAll("circle").data(visibleCoords, (event) => `${event.timestamp}-${event.track}-${event.artist}`);
      points.exit().remove();
      points
        .enter()
        .append("circle")
        .attr("r", 4)
        .attr("fill", item.color)
        .attr("stroke", "rgba(255,255,255,0.72)")
        .attr("stroke-width", 0.8)
        .merge(points)
        .attr("cx", (event) => x(shiftMoodValue(event.valence)))
        .attr("cy", (event) => y(shiftMoodValue(event.arousal)))
        .each(function addTitle(event) {
          d3.select(this)
            .selectAll("title")
            .data([event])
            .join("title")
            .text((datum) => `${item.entry.participant.id}: ${datum.track} by ${datum.artist}\nValence ${formatMoodValue(datum.valence)} · Arousal ${formatMoodValue(datum.arousal)}\nProgress ${Math.round(datum.progress * 100)}%`);
        });
    });
  }

  function animate() {
    if (!playback.playing) return;
    const now = Date.now();
    const deltaMs = now - playback.lastFrameTime;
    playback.lastFrameTime = now;

    playback.progress = Math.min(1, playback.progress + ((deltaMs / 1000) * 0.2 * playback.speed));
    renderProgress(playback.progress);

    if (playback.progress >= 1) {
      playback.playing = false;
      playBtn.textContent = "Play";
      return;
    }

    requestAnimationFrame(animate);
  }

  slider.addEventListener("input", () => {
    playback.playing = false;
    playBtn.textContent = "Play";
    renderProgress(Number(slider.value) / 100);
  });

  speedSlider.addEventListener("input", () => {
    playback.speed = Number(speedSlider.value);
    speedValue.textContent = `${playback.speed.toFixed(1)}x`;
  });

  playBtn.addEventListener("click", () => {
    if (playback.playing) {
      playback.playing = false;
      playBtn.textContent = "Play";
      return;
    }
    if (playback.progress >= 1) {
      playback.progress = 0;
      renderProgress(playback.progress);
    }
    playback.playing = true;
    playback.lastFrameTime = Date.now();
    playBtn.textContent = "Pause";
    requestAnimationFrame(animate);
  });

  resetBtn.addEventListener("click", () => {
    playback.playing = false;
    playBtn.textContent = "Play";
    renderProgress(0);
  });

  speedValue.textContent = `${playback.speed.toFixed(1)}x`;
  renderProgress(playback.progress);

  renderSkippedParticipants(data.participants, sideNode);
}

function drawTrajectoryScaffold(svg, { x, y, margin, size, width, height }) {
  for (let i = 0; i <= 5; i += 1) {
    const shiftedValue = -0.5 + (i / 5);
    svg.append("line").attr("x1", x(shiftedValue)).attr("y1", margin.top).attr("x2", x(shiftedValue)).attr("y2", margin.top + size).attr("class", "trajectory-grid");
    svg.append("line").attr("x1", margin.left).attr("y1", y(shiftedValue)).attr("x2", margin.left + size).attr("y2", y(shiftedValue)).attr("class", "trajectory-grid");
    svg.append("text").attr("x", x(shiftedValue)).attr("y", margin.top + size + 22).attr("text-anchor", "middle").attr("class", "svg-label").text(shiftedValue.toFixed(1));
    svg.append("text").attr("x", margin.left - 16).attr("y", y(shiftedValue) + 4).attr("text-anchor", "end").attr("class", "svg-label").text(shiftedValue.toFixed(1));
  }

  svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", margin.top).attr("y2", margin.top + size).attr("class", "trajectory-midline").attr("stroke", "rgba(255,255,255,0.42)").attr("stroke-width", 1.8);
  svg.append("line").attr("y1", y(0)).attr("y2", y(0)).attr("x1", margin.left).attr("x2", margin.left + size).attr("class", "trajectory-midline").attr("stroke", "rgba(255,255,255,0.42)").attr("stroke-width", 1.8);
  svg.append("text").attr("x", margin.left + size / 2).attr("y", height - 12).attr("text-anchor", "middle").attr("class", "svg-label").text("Valence (-0.5 to 0.5)");
  svg.append("text").attr("transform", "rotate(-90)").attr("x", -(margin.top + size / 2)).attr("y", 18).attr("text-anchor", "middle").attr("class", "svg-label").text("Arousal (-0.5 to 0.5)");
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

function shiftMoodValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric - 0.5 : null;
}

function formatMoodValue(value) {
  const shifted = shiftMoodValue(value);
  return shifted == null ? "-" : formatNumber(shifted);
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

async function responseErrorMessage(response, fallback) {
  try {
    const payload = await response.json();
    if (typeof payload.error === "string") return payload.error;
    if (payload.error?.message) return payload.error.message;
    return `${fallback} (${response.status})`;
  } catch {
    return `${fallback} (${response.status})`;
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
        renderTrajectories(getFilteredResearchData());
      }
    }, 140);
  });
}
