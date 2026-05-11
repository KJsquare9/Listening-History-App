import { bindUploader } from "./uploader.js";
import * as trajectory from "./charts/va_trajectory.js";
import * as timeseries from "./charts/va_timeseries.js";
import * as cohorts from "./charts/cohort_compare.js";
import * as duration from "./charts/ms_played.js";
import { clearNode, formatDuration, formatRatio } from "./charts/shared.js";

const registry = [
  { id: "trajectory", label: "Trajectory", description: "Valence vs arousal path", module: trajectory },
  { id: "timeseries", label: "Time series", description: "Mood over the session", module: timeseries },
  { id: "groups", label: "Reference", description: "Reference comparison", module: cohorts },
  { id: "duration", label: "Duration", description: "Top listening blocks", module: duration },
];

const state = {
  payload: null,
  activeId: "trajectory",
  activeChart: null,
  dateFilter: {
    available: false,
    minDate: null,
    maxDate: null,
    startDate: null,
    endDate: null,
  },
};

const elements = {
  statusPill: document.getElementById("statusPill"),
  fileName: document.getElementById("fileName"),
  uploadState: document.getElementById("uploadState"),
  summaryCards: document.getElementById("summaryCards"),
  cohortStack: document.getElementById("cohortStack"),
  tabs: document.getElementById("vizTabs"),
  chartFrame: document.getElementById("chartFrame"),
  emptyState: document.getElementById("emptyState"),
  dropzone: document.getElementById("dropzone"),
  uploadInput: document.getElementById("uploadInput"),
  heroSparkline: document.getElementById("heroSparkline"),
  startDateInput: document.getElementById("startDateInput"),
  endDateInput: document.getElementById("endDateInput"),
  resetDateFilter: document.getElementById("resetDateFilter"),
  dateFilterMessage: document.getElementById("dateFilterMessage"),
};

const uploader = bindUploader({
  dropzone: elements.dropzone,
  input: elements.uploadInput,
  statusPill: elements.statusPill,
  fileName: elements.fileName,
  onFile: uploadFile,
  onDemo: loadDemo,
});

document.querySelectorAll("[data-action='demo']").forEach((button) => {
  button.addEventListener("click", loadDemo);
});

renderTabs();
renderSparkline();
wireDateFilterControls();
wireResizeHandling();
loadDemo();

function renderTabs() {
  clearNode(elements.tabs);
  registry.forEach((entry) => {
    const button = document.createElement("button");
    button.className = `tab${entry.id === state.activeId ? " is-active" : ""}`;
    button.type = "button";
    button.role = "tab";
    button.dataset.tab = entry.id;
    button.setAttribute("aria-selected", entry.id === state.activeId ? "true" : "false");
    button.textContent = entry.label;
    button.title = entry.description;
    button.addEventListener("click", () => setActiveChart(entry.id));
    elements.tabs.append(button);
  });
}

async function loadDemo() {
  uploader.setStatus("Loading demo session...");
  elements.uploadState.textContent = "Loading demo";
  try {
    const response = await fetch("/api/demo");
    if (!response.ok) {
      throw new Error(`Demo request failed (${response.status})`);
    }
    const payload = await response.json();
    applyPayload(payload, "Demo dataset");
    uploader.setStatus("Demo loaded");
    elements.uploadState.textContent = "Ready";
  } catch (error) {
    console.error(error);
    uploader.setStatus("Demo load failed");
    elements.uploadState.textContent = "Error";
  }
}

async function uploadFile(file) {
  elements.uploadState.textContent = "Uploading";
  uploader.setStatus(`Analyzing ${file.name}...`);

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/analyse", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    applyPayload(payload, file.name);
    uploader.setStatus(`Processed ${file.name}`);
    elements.uploadState.textContent = "Ready";
  } catch (error) {
    console.error(error);
    uploader.setStatus("Upload failed");
    elements.uploadState.textContent = "Failed";
  }
}

function applyPayload(payload, sourceLabel) {
  state.payload = payload;
  initializeDateFilterBounds(payload);
  elements.emptyState?.remove();
  renderSummary(payload, sourceLabel);
  renderReferenceGroups(payload);
  renderSparkline(getFilteredPayload(payload));
  renderTabs();
  setActiveChart(state.activeId, { preserveTabs: true });
}

function renderSummary(payload, sourceLabel) {
  const summary = payload.summary ?? {};
  const cards = [
    { label: "Tracks", value: summary.total_events ?? 0, hint: `Matched ${summary.matched_count ?? 0} of ${summary.total_events ?? 0}` },
    { label: "Match rate", value: formatRatio(summary.match_rate ?? 0), hint: `Source: ${sourceLabel}` },
    { label: "Valence avg", value: formatNumber(summary.valence_mean), hint: "Internal song dataset" },
    { label: "Arousal avg", value: formatNumber(summary.arousal_mean), hint: `Session length ${formatDuration(summary.total_ms_played ?? 0)}` },
  ];

  clearNode(elements.summaryCards);
  cards.forEach((card) => {
    const node = document.createElement("article");
    node.className = "stat-card";
    node.innerHTML = `
      <span class="stat-card__label">${card.label}</span>
      <span class="stat-card__value">${card.value}</span>
      <span class="stat-card__hint">${card.hint}</span>
    `;
    elements.summaryCards.append(node);
  });
}

function renderReferenceGroups(payload) {
  const referenceGroups = payload.reference_groups ?? payload.cohorts ?? {};
  const high = referenceGroups.high_depression ?? {};
  const low = referenceGroups.low_depression ?? {};
  const summaries = [
    {
      title: "High depression",
      tone: "rgba(255, 139, 139, 0.18)",
      border: "rgba(255, 139, 139, 0.28)",
      summary: high.summary ?? {},
    },
    {
      title: "Low depression",
      tone: "rgba(242, 182, 109, 0.18)",
      border: "rgba(242, 182, 109, 0.28)",
      summary: low.summary ?? {},
    },
  ];

  clearNode(elements.cohortStack);
  summaries.forEach((entry) => {
    const node = document.createElement("article");
    node.className = "cohort-card";
    node.style.background = `linear-gradient(180deg, ${entry.tone}, rgba(255,255,255,0.03))`;
    node.style.borderColor = entry.border;
    node.innerHTML = `
      <strong>${entry.title}</strong>
      <div class="cohort-card__meta">
        <div><span>Listener profile</span><b>Single synthetic listener</b></div>
        <div><span>Total tracks</span><b>${entry.summary.total_events ?? 0}</b></div>
        <div><span>Matched tracks</span><b>${entry.summary.matched_events ?? 0}</b></div>
      </div>
    `;
    elements.cohortStack.append(node);
  });
}

function renderSparkline(payload = null) {
  clearNode(elements.heroSparkline);
  const values = (payload?.matched_events ?? []).slice(0, 18).map((event) => event.valence ?? 0.5);
  const sparkValues = values.length > 2 ? values : [0.35, 0.52, 0.63, 0.48, 0.58, 0.71, 0.66, 0.8];
  const width = 300;
  const height = 120;
  const margin = { top: 12, right: 10, bottom: 18, left: 10 };
  const svg = d3.select(elements.heroSparkline).append("svg").attr("viewBox", `0 0 ${width} ${height}`).style("width", "100%").style("height", "100%");
  const x = d3.scaleLinear().domain([0, sparkValues.length - 1]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
  const line = d3.line().x((d, index) => x(index)).y((d) => y(d)).curve(d3.curveMonotoneX);
  svg.append("path").datum(sparkValues).attr("d", line).attr("fill", "none").attr("stroke", "url(#sparklineGradient)").attr("stroke-width", 4).attr("stroke-linecap", "round");
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", "sparklineGradient");
  gradient.append("stop").attr("offset", "0%").attr("stop-color", "#68d2c9");
  gradient.append("stop").attr("offset", "100%").attr("stop-color", "#f2b66d");
}

function formatNumber(value) {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function setActiveChart(id, { preserveTabs = false } = {}) {
  const next = registry.find((entry) => entry.id === id) ?? registry[0];
  state.activeId = next.id;

  if (state.activeChart?.module?.unmount) {
    state.activeChart.module.unmount();
  }

  state.activeChart = next;
  if (!preserveTabs) {
    renderTabs();
  }

  if (!state.payload) {
    return;
  }

  clearNode(elements.chartFrame);
  next.module.mount(elements.chartFrame, getFilteredPayload(state.payload));

  Array.from(elements.tabs.querySelectorAll(".tab")).forEach((button) => {
    const isActive = button.dataset.tab === next.id;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function wireDateFilterControls() {
  elements.startDateInput.addEventListener("change", applyDateFilterFromInputs);
  elements.endDateInput.addEventListener("change", applyDateFilterFromInputs);
  elements.resetDateFilter.addEventListener("click", () => {
    if (!state.dateFilter.available) {
      return;
    }
    state.dateFilter.startDate = state.dateFilter.minDate;
    state.dateFilter.endDate = state.dateFilter.maxDate;
    elements.startDateInput.value = state.dateFilter.startDate;
    elements.endDateInput.value = state.dateFilter.endDate;
    setDateFilterMessage(`Showing full range: ${state.dateFilter.minDate} to ${state.dateFilter.maxDate}`);
    refreshVisualsAfterDateFilter();
  });
}

function initializeDateFilterBounds(payload) {
  const timestamps = (payload.events ?? [])
    .map((event) => Date.parse(event.timestamp))
    .filter((value) => Number.isFinite(value));

  if (!timestamps.length) {
    state.dateFilter.available = false;
    state.dateFilter.minDate = null;
    state.dateFilter.maxDate = null;
    state.dateFilter.startDate = null;
    state.dateFilter.endDate = null;
    elements.startDateInput.value = "";
    elements.endDateInput.value = "";
    elements.startDateInput.disabled = true;
    elements.endDateInput.disabled = true;
    elements.resetDateFilter.disabled = true;
    setDateFilterMessage("No valid timestamps found in this dataset.", true);
    return;
  }

  const minDate = toDateInputValue(Math.min(...timestamps));
  const maxDate = toDateInputValue(Math.max(...timestamps));
  state.dateFilter.available = true;
  state.dateFilter.minDate = minDate;
  state.dateFilter.maxDate = maxDate;
  state.dateFilter.startDate = minDate;
  state.dateFilter.endDate = maxDate;

  elements.startDateInput.disabled = false;
  elements.endDateInput.disabled = false;
  elements.resetDateFilter.disabled = false;
  elements.startDateInput.min = minDate;
  elements.startDateInput.max = maxDate;
  elements.endDateInput.min = minDate;
  elements.endDateInput.max = maxDate;
  elements.startDateInput.value = minDate;
  elements.endDateInput.value = maxDate;
  setDateFilterMessage(`Showing full range: ${minDate} to ${maxDate}`);
}

function applyDateFilterFromInputs() {
  if (!state.dateFilter.available) {
    return;
  }

  const minDate = state.dateFilter.minDate;
  const maxDate = state.dateFilter.maxDate;
  const startValue = elements.startDateInput.value || minDate;
  const endValue = elements.endDateInput.value || maxDate;

  if (startValue < minDate || startValue > maxDate) {
    setDateFilterMessage(`Start date must be between ${minDate} and ${maxDate}.`, true);
    return;
  }

  if (endValue < minDate || endValue > maxDate) {
    setDateFilterMessage(`End date must be between ${minDate} and ${maxDate}.`, true);
    return;
  }

  if (endValue < startValue) {
    setDateFilterMessage("End date cannot be earlier than start date.", true);
    return;
  }

  state.dateFilter.startDate = startValue;
  state.dateFilter.endDate = endValue;
  elements.startDateInput.value = startValue;
  elements.endDateInput.value = endValue;
  setDateFilterMessage(`Showing ${startValue} to ${endValue}`);
  refreshVisualsAfterDateFilter();
}

function refreshVisualsAfterDateFilter() {
  if (!state.payload) {
    return;
  }
  setActiveChart(state.activeId, { preserveTabs: true });
  renderSparkline(getFilteredPayload(state.payload));
}

function getFilteredPayload(payload) {
  if (!state.dateFilter.available || !state.dateFilter.startDate || !state.dateFilter.endDate) {
    return payload;
  }

  const startMs = Date.parse(`${state.dateFilter.startDate}T00:00:00.000Z`);
  const endMs = Date.parse(`${state.dateFilter.endDate}T23:59:59.999Z`);
  const inRange = (event) => {
    const time = Date.parse(event.timestamp);
    return Number.isFinite(time) && time >= startMs && time <= endMs;
  };

  return {
    ...payload,
    events: (payload.events ?? []).filter(inRange),
    matched_events: (payload.matched_events ?? []).filter(inRange),
  };
}

function setDateFilterMessage(text, isError = false) {
  elements.dateFilterMessage.textContent = text;
  elements.dateFilterMessage.classList.toggle("is-error", Boolean(isError));
}

function toDateInputValue(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function wireResizeHandling() {
  let resizeHandle = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeHandle);
    resizeHandle = window.setTimeout(() => {
      if (state.payload) {
        setActiveChart(state.activeId, { preserveTabs: true });
      }
      renderSparkline(state.payload);
    }, 120);
  });
}
