import { createChartShell, makeTooltip, formatCompact } from "./shared.js";

export function mount(container, payload) {
  container.innerHTML = "";
  const matched = payload.matched_events ?? [];

  const { shell, chart } = createChartShell({
    title: "V-A trajectory",
    subtitle: "Interactive time-based path through valence and arousal. Use the slider to replay your listening session.",
    legend: [
      { label: "Current song", color: "#68d2c9" },
      { label: "Path", color: "#68d2c9" },
    ],
  });
  container.append(shell);

  if (!matched.length) {
    chart.innerHTML = `<div class="empty-state" style="position:static; min-height: 520px;"><div class="empty-state__badge">No matches</div><h3>No matched tracks were found.</h3><p>The valence-arousal chart needs at least one lookup hit in the song dataset.</p></div>`;
    return;
  }

  const sortedEvents = [...matched].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const minTime = Date.parse(sortedEvents[0].timestamp);
  const maxTime = Date.parse(sortedEvents[sortedEvents.length - 1].timestamp);
  const averageValence = sortedEvents.reduce((sum, event) => sum + event.valence, 0) / sortedEvents.length;
  const averageArousal = sortedEvents.reduce((sum, event) => sum + event.arousal, 0) / sortedEvents.length;

  // Fixed graph size based on container height
  const graphSize = 240;
  const scale = graphSize / 300; // 300 is baseline

  const margin = { top: 8, right: 8, bottom: 20, left: 20 };
  const size = graphSize;
  const width = size + margin.left + margin.right;
  const height = size + margin.top + margin.bottom;

  const x = d3.scaleLinear().domain([0, 1]).range([margin.left, margin.left + size]);
  const y = d3.scaleLinear().domain([0, 1]).range([margin.top + size, margin.top]);

  const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${width} ${height}`).classed("chart-svg", true).classed("trajectory-svg", true);

  const body = document.createElement("div");
  body.className = "trajectory-layout";
  shell.insertBefore(body, chart);
  body.append(chart);

  const sidebar = document.createElement("aside");
  sidebar.className = "trajectory-sidebar";
  sidebar.innerHTML = `
    <div class="trajectory-sidebar__section">
      <div class="trajectory-sidebar__label">Overlay legend</div>
      <div class="trajectory-sidebar__row"><span class="trajectory-sidebar__swatch trajectory-sidebar__swatch--average"></span><span>Orange dotted circle</span></div>
      <div class="trajectory-sidebar__note">Represents the mean valence ${averageValence.toFixed(2)} and arousal ${averageArousal.toFixed(2)} across the selected time range.</div>
    </div>
    <div class="trajectory-sidebar__section">
      <div class="trajectory-sidebar__label">Session stats</div>
      <div class="trajectory-sidebar__stat"><span>Total songs</span><strong>${sortedEvents.length}</strong></div>
      <div class="trajectory-sidebar__stat"><span>Start song</span><strong>${sortedEvents[0].track}</strong></div>
      <div class="trajectory-sidebar__stat"><span>End song</span><strong>${sortedEvents[sortedEvents.length - 1].track}</strong></div>
    </div>
  `;
  body.append(sidebar);

  const gridX = d3.axisBottom(x).ticks(5).tickSize(-size).tickFormat(() => "");
  const gridY = d3.axisLeft(y).ticks(5).tickSize(-size).tickFormat(() => "");

  svg.append("g").attr("transform", `translate(0,${margin.top + size})`).attr("class", "svg-grid").call(gridX);
  svg.append("g").attr("transform", `translate(${margin.left},0)`).attr("class", "svg-grid").call(gridY);

  const axes = svg.append("g").attr("class", "svg-axis");
  axes.append("g").attr("transform", `translate(0,${margin.top + size})`).call(d3.axisBottom(x).ticks(5));
  axes.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));

  svg.append("text").attr("class", "svg-label").attr("x", margin.left + size / 2).attr("y", height + 14).attr("text-anchor", "middle").attr("font-size", `${9 * scale}px`).text("Valence");
  svg.append("text").attr("class", "svg-label").attr("x", -12).attr("y", margin.top + size / 2).attr("text-anchor", "end").attr("font-size", `${9 * scale}px`).attr("transform", `rotate(-90,-12,${margin.top + size / 2})`).text("Arousal");

  svg.append("line").attr("x1", x(0.5)).attr("x2", x(0.5)).attr("y1", margin.top).attr("y2", margin.top + size).attr("stroke", "rgba(255,255,255,0.12)").attr("stroke-dasharray", "4 6");
  svg.append("line").attr("y1", y(0.5)).attr("y2", y(0.5)).attr("x1", margin.left).attr("x2", margin.left + size).attr("stroke", "rgba(255,255,255,0.12)").attr("stroke-dasharray", "4 6");

  svg
    .append("circle")
    .attr("cx", x(averageValence))
    .attr("cy", y(averageArousal))
    .attr("r", 18 * scale)
    .attr("fill", "rgba(255, 166, 72, 0.12)")
    .attr("stroke", "rgba(255, 166, 72, 0.78)")
    .attr("stroke-width", 1.6 * scale)
    .attr("stroke-dasharray", "4 4")
    .attr("pointer-events", "none");

  const pathGroup = svg.append("g");
  const pointsGroup = svg.append("g");
  const currentPointGroup = svg.append("g");
  const tooltip = makeTooltip();

  const line = d3.line().x((d) => x(d.valence)).y((d) => y(d.arousal)).curve(d3.curveCatmullRom.alpha(0.5));

  const state = {
    currentIndex: 0,
    playhead: 0,
    isPlaying: false,
    lastFrameTime: Date.now(),
    songsPerSecond: 1.0,
  };

  const controls = document.createElement("div");
  controls.className = "trajectory-controls";
  controls.innerHTML = `
    <div class="trajectory-slider-wrapper">
      <input type="range" class="trajectory-slider" min="0" max="${sortedEvents.length - 1}" value="0" />
      <span class="trajectory-time-display"></span>
    </div>
    <div class="trajectory-speed-wrapper">
      <label class="trajectory-speed-label">Speed: <span class="trajectory-speed-value">1.0</span> songs/sec</label>
      <input type="range" class="trajectory-speed-slider" min="0.25" max="4" step="0.25" value="1" />
    </div>
    <div class="trajectory-buttons">
      <button class="trajectory-play-btn">Play</button>
      <button class="trajectory-reset-btn">Reset</button>
    </div>
    <div class="trajectory-song-display"></div>
  `;
  shell.append(controls);

  const slider = controls.querySelector(".trajectory-slider");
  const speedSlider = controls.querySelector(".trajectory-speed-slider");
  const speedValue = controls.querySelector(".trajectory-speed-value");
  const playBtn = controls.querySelector(".trajectory-play-btn");
  const resetBtn = controls.querySelector(".trajectory-reset-btn");
  const timeDisplay = controls.querySelector(".trajectory-time-display");
  const songDisplay = controls.querySelector(".trajectory-song-display");

  function renderStartEndMarkers() {
    const startEvent = sortedEvents[0];
    const endEvent = sortedEvents[sortedEvents.length - 1];
    const markersGroup = svg.append("g").attr("class", "trajectory-markers");

    if (startEvent) {
      markersGroup
        .append("circle")
        .attr("cx", x(startEvent.valence))
        .attr("cy", y(startEvent.arousal))
        .attr("r", 4 * scale)
        .attr("fill", "#4ade80")
        .attr("opacity", 0.8);
      markersGroup
        .append("text")
        .attr("class", "trajectory-marker-label")
        .attr("x", x(startEvent.valence) - 8 * scale)
        .attr("y", y(startEvent.arousal) - 6 * scale)
        .attr("font-size", `${8 * scale}px`)
        .text("Start");
    }

    if (endEvent && endEvent !== startEvent) {
      markersGroup
        .append("circle")
        .attr("cx", x(endEvent.valence))
        .attr("cy", y(endEvent.arousal))
        .attr("r", 4 * scale)
        .attr("fill", "#ff8b8b")
        .attr("opacity", 0.8);
      markersGroup
        .append("text")
        .attr("class", "trajectory-marker-label")
        .attr("x", x(endEvent.valence) + 8 * scale)
        .attr("y", y(endEvent.arousal) - 6 * scale)
        .attr("font-size", `${8 * scale}px`)
        .attr("text-anchor", "start")
        .text("End");
    }
  }

  function updateDisplay(index, syncPlayhead = true) {
    state.currentIndex = Math.min(Math.max(0, index), sortedEvents.length - 1);
    if (syncPlayhead) {
      state.playhead = state.currentIndex;
    }
    slider.value = state.currentIndex;

    const upToIndex = sortedEvents.slice(0, state.currentIndex + 1);

    pointsGroup.selectAll("*").remove();
    pointsGroup
      .selectAll("circle")
      .data(upToIndex)
      .enter()
      .append("circle")
      .attr("cx", (d) => x(d.valence))
      .attr("cy", (d) => y(d.arousal))
      .attr("r", 3 * scale)
      .attr("fill", "#68d2c9")
      .attr("fill-opacity", 0.7)
      .attr("stroke", "rgba(255,255,255,0.8)")
      .attr("stroke-width", 0.7 * scale)
      .on("mousemove", (event, d) => {
        tooltip.show(`<b>${d.track}</b><br />${d.artist}<br />Valence ${d.valence.toFixed(2)} · Arousal ${d.arousal.toFixed(2)}<br />${formatCompact(d.ms_played)}`, event.clientX + 16, event.clientY + 18);
      })
      .on("mouseleave", () => tooltip.hide());

    pathGroup.selectAll("*").remove();
    if (upToIndex.length > 1) {
      pathGroup.append("path").datum(upToIndex).attr("fill", "none").attr("stroke", "#68d2c9").attr("stroke-width", 2 * scale).attr("stroke-linecap", "round").attr("stroke-linejoin", "round").attr("d", line);
    }

    currentPointGroup.selectAll("*").remove();
    const currentEvent = sortedEvents[state.currentIndex];
    if (currentEvent) {
      currentPointGroup
        .append("circle")
        .attr("cx", x(currentEvent.valence))
        .attr("cy", y(currentEvent.arousal))
        .attr("r", 5 * scale)
        .attr("fill", "none")
        .attr("stroke", "#68d2c9")
        .attr("stroke-width", 1.5 * scale);

      const currentTime = Date.parse(currentEvent.timestamp);
      const percentage = ((currentTime - minTime) / (maxTime - minTime)) * 100;
      timeDisplay.textContent = `${percentage.toFixed(1)}% — ${currentEvent.timestamp}`;

      songDisplay.innerHTML = `
        <div class="trajectory-song-info">
          <div class="trajectory-song-title">${currentEvent.track}</div>
          <div class="trajectory-song-artist">${currentEvent.artist}</div>
          <div class="trajectory-song-values">VA: ${currentEvent.valence.toFixed(2)} / ${currentEvent.arousal.toFixed(2)}</div>
        </div>
      `;
    }
  }

  function animate() {
    if (!state.isPlaying) {
      return;
    }

    const now = Date.now();
    const deltaMs = now - state.lastFrameTime;
    state.lastFrameTime = now;

    state.playhead = Math.min(state.playhead + (state.songsPerSecond * deltaMs) / 1000, sortedEvents.length - 1);
    const nextIndex = Math.floor(state.playhead);

    state.currentIndex = nextIndex;

    if (state.currentIndex >= sortedEvents.length - 1) {
      state.isPlaying = false;
      playBtn.textContent = "Play";
    }

    updateDisplay(state.currentIndex, false);
    requestAnimationFrame(animate);
  }

  slider.addEventListener("input", (e) => {
    state.isPlaying = false;
    playBtn.textContent = "Play";
    updateDisplay(parseInt(e.target.value, 10));
  });

  speedSlider.addEventListener("input", (e) => {
    state.songsPerSecond = parseFloat(e.target.value);
    speedValue.textContent = state.songsPerSecond.toFixed(2);
  });

  playBtn.addEventListener("click", () => {
    if (state.currentIndex >= sortedEvents.length - 1) {
      state.currentIndex = 0;
      state.playhead = 0;
    }
    state.isPlaying = !state.isPlaying;
    playBtn.textContent = state.isPlaying ? "Pause" : "Play";
    state.lastFrameTime = Date.now();
    if (state.isPlaying) {
      animate();
    }
  });

  resetBtn.addEventListener("click", () => {
    state.isPlaying = false;
    state.currentIndex = 0;
    playBtn.textContent = "Play";
    updateDisplay(0);
  });

  renderStartEndMarkers();
  updateDisplay(0);
}

export function unmount() {}
