// Researcher mode application
const CONFIG = {
  PARTICIPANT_ID_FIELD: "Participant_ID",
};

let state = {
  metadata: [],
  participants: [],
  fields: [],
  selectedFields: [],
  selectedParticipants: [],
  data: null,
};

const elements = {
  uploadZone: document.getElementById("uploadZone"),
  fileInput: document.getElementById("fileInput"),
  csvInput: document.getElementById("csvInput"),
  selectFilesBtn: document.getElementById("selectFilesBtn"),
  demoBtn: document.getElementById("demoBtn"),
  statusMessage: document.getElementById("statusMessage"),
  analysisSection: document.getElementById("analysisSection"),
  participantCheckboxes: document.getElementById("participantCheckboxes"),
  fieldCheckboxes: document.getElementById("fieldCheckboxes"),
  resultsSection: document.getElementById("resultsSection"),
  analysisGrid: document.getElementById("analysisGrid"),
  trajectorySection: document.getElementById("trajectorySection"),
  trajectoryContainer: document.getElementById("trajectoryContainer"),
};

// File upload handling
elements.selectFilesBtn.addEventListener("click", () => {
  elements.fileInput.click();
});

elements.demoBtn.addEventListener("click", loadDemo);

elements.uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  elements.uploadZone.classList.add("is-dragging");
});

elements.uploadZone.addEventListener("dragleave", () => {
  elements.uploadZone.classList.remove("is-dragging");
});

elements.uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  elements.uploadZone.classList.remove("is-dragging");
  handleFiles(e.dataTransfer.items);
});

elements.fileInput.addEventListener("change", (e) => {
  handleFiles(e.target.files);
});

async function handleFiles(fileList) {
  try {
    clearStatus();
    const files = Array.from(fileList);

    // Find CSV metadata file
    const csvFile = files.find((f) => f.name.endsWith(".csv") && !f.webkitRelativePath.includes("/"));

    if (!csvFile) {
      showStatus("No metadata CSV file found in root of folder.", "error");
      return;
    }

    // Parse CSV
    const csvText = await csvFile.text();
    const metadata = parseCSV(csvText);

    // Validate Participant_ID field
    if (!metadata.length || !metadata[0].hasOwnProperty(CONFIG.PARTICIPANT_ID_FIELD)) {
      showStatus(
        `Metadata CSV must contain a "${CONFIG.PARTICIPANT_ID_FIELD}" column. Found columns: ${Object.keys(metadata[0] || {}).join(", ")}`,
        "error"
      );
      return;
    }

    // Get listening history files and validate against Participant_IDs
    const listeningFiles = files.filter(
      (f) => !f.name.endsWith(".csv") && !f.webkitRelativePath.includes(".csv")
    );

    const participantIds = new Set(metadata.map((row) => row[CONFIG.PARTICIPANT_ID_FIELD]));
    const fileParticipants = new Set(
      listeningFiles.map((f) => f.name.replace(/\.(csv|json)$/i, ""))
    );

    // Validate match
    const missingFiles = Array.from(participantIds).filter((id) => !fileParticipants.has(id));
    const extraFiles = Array.from(fileParticipants).filter((id) => !participantIds.has(id));

    if (missingFiles.length > 0 || extraFiles.length > 0) {
      let errorMsg = `Data validation failed:\n`;
      if (missingFiles.length > 0) {
        errorMsg += `Missing listening history files for: ${missingFiles.join(", ")}\n`;
      }
      if (extraFiles.length > 0) {
        errorMsg += `Extra listening history files (not in metadata): ${extraFiles.join(", ")}\n`;
      }
      showStatus(errorMsg, "error");
      return;
    }

    showStatus(`Loaded ${metadata.length} participants with ${listeningFiles.length} listening history files.`, "success");

    // Send to backend
    const formData = new FormData();
    formData.append("metadata", csvFile);
    listeningFiles.forEach((f) => formData.append("listening_files", f));

    const response = await fetch("/api/researcher/process", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      showStatus(error.error || "Backend processing failed", "error");
      return;
    }

    state.data = await response.json();
    state.metadata = metadata;
    state.participants = Array.from(participantIds).sort();

    // Extract non-Participant_ID fields
    state.fields = Object.keys(metadata[0]).filter((k) => k !== CONFIG.PARTICIPANT_ID_FIELD);

    initializeControls();
    elements.analysisSection.style.display = "block";
    elements.resultsSection.style.display = "block";
    elements.trajectorySection.style.display = "block";

    updateAnalysis();
  } catch (error) {
    console.error(error);
    showStatus(`Upload error: ${error.message}`, "error");
  }
}

async function loadDemo() {
  try {
    clearStatus();
    showStatus("Loading demo data...", "success");

    const response = await fetch("/api/researcher/demo");

    if (!response.ok) {
      const error = await response.json();
      showStatus(error.error || "Failed to load demo data", "error");
      return;
    }

    const data = await response.json();

    showStatus(`Demo loaded: ${data.count} participants with ${data.metadata_fields.length} metadata fields.`, "success");

    state.data = data;
    state.metadata = data.participants.map((p) => ({ Participant_ID: p.id, ...p.metadata }));
    state.participants = data.participants.map((p) => p.id).sort();
    state.fields = data.metadata_fields;

    initializeControls();
    elements.analysisSection.style.display = "block";
    elements.resultsSection.style.display = "block";
    elements.trajectorySection.style.display = "block";

    updateAnalysis();
  } catch (error) {
    console.error(error);
    showStatus(`Demo load error: ${error.message}`, "error");
  }
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }

  return rows;
}

function initializeControls() {
  // Participant checkboxes
  const participantContainer = elements.participantCheckboxes;
  participantContainer.innerHTML = "";
  state.participants.forEach((p) => {
    const div = document.createElement("div");
    div.className = "checkbox-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `participant-${p}`;
    input.value = p;
    input.checked = true; // All participants selected by default
    input.addEventListener("change", (e) => {
      state.selectedParticipants = Array.from(
        participantContainer.querySelectorAll("input:checked")
      ).map((i) => i.value);
      updateAnalysis();
    });
    const label = document.createElement("label");
    label.htmlFor = `participant-${p}`;
    label.textContent = p;
    div.append(input, label);
    participantContainer.append(div);
  });
  
  // Initialize selectedParticipants with all participants
  state.selectedParticipants = state.participants.slice();

  // Field checkboxes
  const fieldContainer = elements.fieldCheckboxes;
  fieldContainer.innerHTML = "";
  state.fields.forEach((field) => {
    const div = document.createElement("div");
    div.className = "checkbox-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `field-${field}`;
    input.value = field;
    input.addEventListener("change", (e) => {
      if (e.target.checked) {
        state.selectedFields.push(field);
      } else {
        state.selectedFields = state.selectedFields.filter((f) => f !== field);
      }
      updateAnalysis();
    });
    const label = document.createElement("label");
    label.htmlFor = `field-${field}`;
    label.textContent = field;
    div.append(input, label);
    fieldContainer.append(div);
  });
}

function updateAnalysis() {
  if (!state.data) return;

  const filteredData = {
    ...state.data,
    participants: state.selectedParticipants.length > 0
      ? state.data.participants.filter((p) => state.selectedParticipants.includes(p.id))
      : state.data.participants,
  };

  // Render combined normalized distribution if fields selected
  if (state.selectedFields.length > 0) {
    renderCombinedDistribution(filteredData, state.selectedFields);
  } else {
    elements.analysisGrid.innerHTML = '<div class="empty-message">Select fields to analyze</div>';
  }

  // Render trajectories with selected participants
  renderTrajectories(filteredData);
}

function renderCombinedDistribution(data, fields) {
  elements.analysisGrid.innerHTML = "";

  if (fields.length === 0) {
    elements.analysisGrid.innerHTML = '<div class="empty-message">Select fields to analyze</div>';
    return;
  }

  const panel = document.createElement("div");
  panel.className = "chart-panel";
  panel.style.gridColumn = "1 / -1";
  
  const title = document.createElement("div");
  title.className = "chart-panel__title";
  title.textContent = `Field Distribution (Normalized 0-1 Scale)`;
  
  const noteDiv = document.createElement("div");
  noteDiv.style.fontSize = "0.85rem";
  noteDiv.style.color = "var(--soft)";
  noteDiv.style.marginBottom = "var(--space-3)";
  noteDiv.style.padding = "var(--space-2) var(--space-3)";
  noteDiv.style.background = "rgba(104, 210, 201, 0.08)";
  noteDiv.style.borderRadius = "4px";
  noteDiv.textContent = "All values normalized to 0-1 range for comparison across different scales.";
  
  panel.append(title, noteDiv);
  
  // Create CSS-based distribution chart
  renderDistributionBars(data, fields, panel);
  
  elements.analysisGrid.append(panel);
}

function renderDistributionBars(data, fields, container) {
  const accentColors = ["#68d2c9", "#f2b66d", "#ff8b8b", "#7cf0a6", "#b19cd9", "#ffa07a", "#87ceeb", "#ffd700", "#ff69b4", "#00ff7f"];
  
  // Normalize each field
  const normalizedSeries = fields.map((field, idx) => {
    const values = data.participants.map((p) => {
      const meta = state.metadata.find((m) => m[CONFIG.PARTICIPANT_ID_FIELD] === p.id);
      return meta ? parseFloat(meta[field]) : null;
    }).filter((v) => v !== null && !isNaN(v));
    
    if (values.length === 0) return null;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    
    return {
      field,
      color: accentColors[idx % accentColors.length],
      normalized: values.map((v) => (v - min) / range)
    };
  }).filter(Boolean);
  
  if (normalizedSeries.length === 0) return;
  
  // Create bins
  const binCount = 10;
  const bins = Array(binCount).fill(0).map((_, i) => ({
    min: i / binCount,
    max: (i + 1) / binCount,
    counts: {}
  }));
  
  normalizedSeries.forEach((series) => {
    bins.forEach((bin) => {
      bin.counts[series.field] = series.normalized.filter(
        (v) => v >= bin.min && v < bin.max
      ).length;
    });
  });
  
  const maxCount = Math.max(...bins.map(b => Math.max(...Object.values(b.counts))));
  
  // Create chart container
  const chartContainer = document.createElement("div");
  chartContainer.style.cssText = `
    width: 100%;
    height: 400px;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    padding: 20px;
    background: rgba(255,255,255,0.02);
    border-radius: 8px;
    margin-bottom: 20px;
  `;
  
  // Create bars
  bins.forEach((bin, binIdx) => {
    const barGroup = document.createElement("div");
    barGroup.style.cssText = `
      flex: 1;
      display: flex;
      align-items: flex-end;
      gap: 1px;
      height: 100%;
    `;
    
    normalizedSeries.forEach((series) => {
      const count = bin.counts[series.field] || 0;
      const barHeight = (count / maxCount) * 100;
      
      const bar = document.createElement("div");
      bar.style.cssText = `
        flex: 1;
        height: ${barHeight}%;
        background: ${series.color};
        opacity: 0.8;
        border-radius: 2px 2px 0 0;
        transition: opacity 0.2s;
      `;
      bar.title = `${series.field}: ${count}`;
      barGroup.append(bar);
    });
    
    chartContainer.append(barGroup);
  });
  
  // Create legend
  const legend = document.createElement("div");
  legend.style.cssText = `
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    padding: 0 20px;
    margin-bottom: 20px;
  `;
  
  normalizedSeries.forEach((series) => {
    const item = document.createElement("div");
    item.style.cssText = `display: flex; align-items: center; gap: 8px; font-size: 0.9rem;`;
    
    const box = document.createElement("div");
    box.style.cssText = `width: 12px; height: 12px; background: ${series.color}; border-radius: 2px;`;
    
    const label = document.createElement("span");
    label.textContent = series.field;
    label.style.color = "var(--text)";
    
    item.append(box, label);
    legend.append(item);
  });
  
  container.append(chartContainer, legend);
}

function renderNormalizedDistribution(svg, data, fields) {
  // Extract and normalize values for each field
  const normalizedSeries = fields.map((field) => {
    const values = data.participants
      .map((p) => {
        const meta = state.metadata.find((m) => m[CONFIG.PARTICIPANT_ID_FIELD] === p.id);
        return meta ? parseFloat(meta[field]) : null;
      })
      .filter((v) => v !== null && !isNaN(v));

    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const normalized = values.map((v) => (v - min) / range);

    return {
      field,
      normalized,
      min,
      max,
    };
  }).filter(Boolean);

  if (normalizedSeries.length === 0) return;

  const margin = { top: 20, right: 60, bottom: 40, left: 50 };
  const width = svg.parentElement?.clientWidth || 800;
  const height = 400;

  // Create bins (0-1 scale, 10 bins)
  const binCount = 10;
  const binSize = 1 / binCount;

  // Initialize bins for each field
  const bins = Array.from({ length: binCount }, (_, i) => {
    const binMin = i * binSize;
    const binMax = (i + 1) * binSize;
    const counts = {};
    normalizedSeries.forEach((series) => {
      counts[series.field] = series.normalized.filter(
        (v) => v >= binMin && v < binMax
      ).length;
    });
    return { binMin, binMax, counts };
  });

  const maxCount = Math.max(
    ...normalizedSeries.map((s) =>
      Math.max(...bins.map((b) => b.counts[s.field] || 0))
    )
  );

  console.log("Distribution Debug:", {
    binCount: bins.length,
    normalizedSeries: normalizedSeries.length,
    maxCount,
    width,
    height,
    marginsLeft: margin.left,
    marginsRight: margin.right,
    firstBinCounts: bins[0]?.counts
  });

  const x = d3
    .scaleLinear()
    .domain([0, 1])
    .range([margin.left, width - margin.right]);

  const y = d3
    .scaleLinear()
    .domain([0, maxCount])
    .range([height - margin.bottom, margin.top]);

  const colors = d3.schemeCategory10;
  const accentColors = ["#68d2c9", "#f2b66d", "#ff8b8b", "#7cf0a6", "#b19cd9", "#ffa07a", "#87ceeb", "#ffd700", "#ff69b4", "#00ff7f"];

  // Clear SVG and set viewBox
  d3.select(svg).selectAll("*").remove();

  const svgElement = d3
    .select(svg)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("overflow", "visible");

  // Draw bars for each field
  let barCount = 0;
  normalizedSeries.forEach((series, seriesIdx) => {
    const color = accentColors[seriesIdx % accentColors.length];
    const barWidth = (binSize * (width - margin.left - margin.right)) / (normalizedSeries.length + 0.5);
    const offset = barWidth * seriesIdx;

    console.log(`Series ${seriesIdx} (${series.field}): barWidth=${barWidth}, offset=${offset}`);

    bins.forEach((bin, binIdx) => {
      const count = bin.counts[series.field] || 0;
      const xPos = x(bin.binMin) + offset;
      const yPos = y(count);
      const rectHeight = height - margin.bottom - y(count);
      
      if (binIdx === 0) {
        console.log(`  Bin 0: count=${count}, xPos=${xPos}, yPos=${yPos}, width=${barWidth}, height=${rectHeight}`);
      }
      
      svgElement
        .append("rect")
        .attr("x", xPos)
        .attr("y", yPos)
        .attr("width", barWidth)
        .attr("height", rectHeight)
        .attr("fill", color)
        .attr("fill-opacity", 0.8);
      
      barCount++;
    });
  });
  
  console.log(`Total bars drawn: ${barCount}`);

  // X axis - manual rendering
  svgElement.append("g").attr("transform", `translate(0,${height - margin.bottom})`);
  const xAxisGroup = svgElement.append("g").attr("transform", `translate(0,${height - margin.bottom})`);
  
  for (let i = 0; i <= 10; i++) {
    const val = i / 10;
    xAxisGroup
      .append("line")
      .attr("x1", x(val))
      .attr("y1", 0)
      .attr("x2", x(val))
      .attr("y2", 5)
      .attr("stroke", "rgba(238, 244, 255, 0.4)")
      .attr("stroke-width", 1);
    
    xAxisGroup
      .append("text")
      .attr("x", x(val))
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("fill", "rgba(238, 244, 255, 0.6)")
      .text(val.toFixed(1));
  }

  // Y axis - manual rendering
  const yAxisGroup = svgElement.append("g").attr("transform", `translate(${margin.left},0)`);
  const yTicks = Math.min(5, maxCount);
  for (let i = 0; i <= yTicks; i++) {
    const val = (i * maxCount) / yTicks;
    yAxisGroup
      .append("line")
      .attr("x1", -5)
      .attr("y1", y(val))
      .attr("x2", 0)
      .attr("y2", y(val))
      .attr("stroke", "rgba(238, 244, 255, 0.4)")
      .attr("stroke-width", 1);
    
    yAxisGroup
      .append("text")
      .attr("x", -10)
      .attr("y", y(val) + 3)
      .attr("text-anchor", "end")
      .style("font-size", "11px")
      .style("fill", "rgba(238, 244, 255, 0.6)")
      .text(Math.round(val));
  }

  // X axis label
  svgElement
    .append("text")
    .attr("x", margin.left + (width - margin.left - margin.right) / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "rgba(238, 244, 255, 0.6)")
    .text("Normalized Value");

  // Y axis label
  svgElement
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height - margin.top - margin.bottom) / 2 - margin.top)
    .attr("y", 15)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "rgba(238, 244, 255, 0.6)")
    .text("Count");

  // Legend
  normalizedSeries.forEach((series, idx) => {
    const color = colors[idx % colors.length];
    svgElement
      .append("rect")
      .attr("x", width - margin.right + 10)
      .attr("y", margin.top + idx * 20)
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", color)
      .attr("fill-opacity", 0.7);

    svgElement
      .append("text")
      .attr("x", width - margin.right + 30)
      .attr("y", margin.top + idx * 20 + 10)
      .style("font-size", "11px")
      .style("fill", color)
      .text(series.field);
  });
}

function renderTrajectories(data) {
  elements.trajectoryContainer.innerHTML = "";

  if (data.participants.length === 0) {
    elements.trajectoryContainer.innerHTML = '<div class="empty-message">No participants selected</div>';
    return;
  }

  const margin = { top: 30, right: 80, bottom: 40, left: 50 };
  const containerWidth = elements.trajectoryContainer.clientWidth || 800;
  const size = Math.min(500, containerWidth - 80);
  const width = size + margin.left + margin.right;
  const height = size + margin.top + margin.bottom;

  const x = d3.scaleLinear().domain([0, 1]).range([margin.left, margin.left + size]);
  const y = d3.scaleLinear().domain([0, 1]).range([margin.top + size, margin.top]);

  const svg = d3
    .select(elements.trajectoryContainer)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("max-width", "100%")
    .style("height", "auto");

  // Create a separate HTML legend container for nicer styling
  const legendContainer = document.createElement("div");
  legendContainer.className = "trajectory-legend";
  // Position legend at right of the plot
  elements.trajectoryContainer.appendChild(legendContainer);
  // Grid and axes - manual rendering
  for (let i = 0; i <= 5; i++) {
    const val = i / 5;
    // Vertical grid lines
    svg
      .append("line")
      .attr("x1", x(val))
      .attr("y1", margin.top)
      .attr("x2", x(val))
      .attr("y2", margin.top + size)
      .attr("stroke-dasharray", "2,2")
      .attr("stroke", "rgba(255,255,255,0.1)");
    
    // Horizontal grid lines
    svg
      .append("line")
      .attr("x1", margin.left)
      .attr("y1", y(val))
      .attr("x2", margin.left + size)
      .attr("y2", y(val))
      .attr("stroke-dasharray", "2,2")
      .attr("stroke", "rgba(255,255,255,0.1)");
  }
  
  // X axis labels
  for (let i = 0; i <= 5; i++) {
    const val = i / 5;
    svg
      .append("text")
      .attr("x", x(val))
      .attr("y", margin.top + size + 20)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("fill", "rgba(238, 244, 255, 0.6)")
      .text(val.toFixed(1));
  }
  
  // Y axis labels
  for (let i = 0; i <= 5; i++) {
    const val = i / 5;
    svg
      .append("text")
      .attr("x", margin.left - 15)
      .attr("y", y(val) + 4)
      .attr("text-anchor", "end")
      .style("font-size", "11px")
      .style("fill", "rgba(238, 244, 255, 0.6)")
      .text(val.toFixed(1));
  }

  // Center lines
  svg
    .append("line")
    .attr("x1", x(0.5))
    .attr("x2", x(0.5))
    .attr("y1", margin.top)
    .attr("y2", margin.top + size)
    .attr("stroke", "rgba(255,255,255,0.12)")
    .attr("stroke-dasharray", "4 6");

  svg
    .append("line")
    .attr("y1", y(0.5))
    .attr("y2", y(0.5))
    .attr("x1", margin.left)
    .attr("x2", margin.left + size)
    .attr("stroke", "rgba(255,255,255,0.12)")
    .attr("stroke-dasharray", "4 6");

  // Draw axes with labels
  // X axis line
  svg
    .append("line")
    .attr("x1", margin.left)
    .attr("y1", margin.top + size)
    .attr("x2", margin.left + size)
    .attr("y2", margin.top + size)
    .attr("stroke", "rgba(238, 244, 255, 0.3)")
    .attr("stroke-width", 2);

  // Y axis line
  svg
    .append("line")
    .attr("x1", margin.left)
    .attr("y1", margin.top)
    .attr("x2", margin.left)
    .attr("y2", margin.top + size)
    .attr("stroke", "rgba(238, 244, 255, 0.3)")
    .attr("stroke-width", 2);

  const line = d3
    .line()
    .x((d) => x(d.valence))
    .y((d) => y(d.arousal))
    .curve(d3.curveCatmullRom.alpha(0.5));

  const colors = d3.schemeCategory10;

  data.participants.forEach((participant, idx) => {
    if (!participant.events || participant.events.length === 0) return;

    // Filter events to only matched tracks with numeric valence/arousal
    const validEvents = participant.events
      .filter((e) => e.matched === true && e.valence != null && e.arousal != null)
      .map((e) => ({ ...e, valence: Number(e.valence), arousal: Number(e.arousal) }))
      .filter((e) => isFinite(e.valence) && isFinite(e.arousal));

    if (validEvents.length < 2) return;

    const color = colors[idx % colors.length];
    const pathGroup = svg.append("g");

    // Remove consecutive duplicate points to avoid curve generation issues
    const uniqueEvents = validEvents.filter((d, i) => {
      if (i === 0) return true;
      const prev = validEvents[i - 1];
      return !(Number(prev.valence) === Number(d.valence) && Number(prev.arousal) === Number(d.arousal));
    });

    if (uniqueEvents.length < 2) return; // nothing to draw

    // Compute screen coordinates and guard against any NaNs
    const coords = uniqueEvents.map((d) => ({
      valence: Number(d.valence),
      arousal: Number(d.arousal),
      cx: x(Number(d.valence)),
      cy: y(Number(d.arousal)),
    }));

    if (coords.some((c) => !isFinite(c.cx) || !isFinite(c.cy))) {
      return; // skip drawing this participant if any coordinate invalid
    }

    // Choose a curve type: CatmullRom for 3+ points, linear otherwise
    const useCurve = coords.length >= 3;
    const lineGenerator = d3
      .line()
      .x((d) => x(d.valence))
      .y((d) => y(d.arousal))
      .curve(useCurve ? d3.curveCatmullRom.alpha(0.5) : d3.curveLinear);

    // Draw line using precomputed coords (manual polyline to avoid curve-control NaNs)
    const pathD = coords.map((c, i) => (i === 0 ? `M${c.cx},${c.cy}` : `L${c.cx},${c.cy}`)).join(" ");
    pathGroup
      .append("path")
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2.5)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0.9)
      .attr("d", pathD);

    // Draw points
    pathGroup
      .selectAll("circle")
      .data(coords)
      .enter()
      .append("circle")
      .attr("cx", (d) => d.cx)
      .attr("cy", (d) => d.cy)
      .attr("r", 3.5)
      .attr("fill", color)
      .attr("opacity", 0.9);

    // Add an entry to the HTML legend
    const item = document.createElement("div");
    item.className = "trajectory-legend__item";
    item.innerHTML = `<span class=\"legend-swatch\" style=\"background:${color}\"></span><span class=\"legend-label\">${participant.id}</span>`;
    legendContainer.appendChild(item);
  });

  // X axis label
  svg
    .append("text")
    .attr("x", margin.left + size / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .style("fill", "rgba(238, 244, 255, 0.7)")
    .style("font-weight", "500")
    .text("Valence (Positivity)");

  // Y axis label
  svg
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + size / 2))
    .attr("y", 15)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .style("fill", "rgba(238, 244, 255, 0.7)")
    .style("font-weight", "500")
    .text("Arousal (Energy)");
}

function showStatus(message, type) {
  const div = document.createElement("div");
  div.className = `status-message ${type}`;
  div.textContent = message;
  elements.statusMessage.innerHTML = "";
  elements.statusMessage.append(div);
}

function clearStatus() {
  elements.statusMessage.innerHTML = "";
}
