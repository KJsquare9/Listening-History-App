import { chartLayout, clearNode, createChartShell, makeTooltip } from "./shared.js";

function summarize(events) {
  const matched = events.filter((event) => event.matched);
  return {
    count: events.length,
    matched: matched.length,
    valenceMean: d3.mean(matched, (event) => event.valence) ?? 0,
    arousalMean: d3.mean(matched, (event) => event.arousal) ?? 0,
  };
}

export function mount(container, payload) {
  clearNode(container);
  const userEvents = payload.matched_events ?? [];
  const referenceGroups = payload.reference_groups ?? payload.cohorts ?? {};
  const high = referenceGroups.high_depression ?? { events: [], summary: {} };
  const low = referenceGroups.low_depression ?? { events: [], summary: {} };
  const highStats = summarize(high.events ?? []);
  const lowStats = summarize(low.events ?? []);

  const { shell, chart } = createChartShell({
    title: "Reference comparison",
    subtitle: "Compare the user session against one synthetic low-depression and one synthetic high-depression listener.",
    legend: [
      { label: "User session", color: "#68d2c9" },
      { label: "High depression reference", color: "#ff8b8b" },
      { label: "Low depression reference", color: "#f2b66d" },
      { label: "Selected flow line", color: "rgba(255,255,255,0.88)" },
    ],
  });
  container.append(shell);

  if (!userEvents.length && !(high.events?.length || low.events?.length)) {
    chart.innerHTML = `<div class="empty-state" style="position:static; min-height: 520px;"><div class="empty-state__badge">No reference data</div><h3>No comparison data is available.</h3><p>The API did not return any matched events or reference points.</p></div>`;
    return;
  }

  const { width, height, margin, innerWidth, innerHeight } = chartLayout(container, { minHeight: 580 });
  const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${width} ${height}`).classed("chart-svg", true);
  const allEvents = [...userEvents, ...(high.events ?? []), ...(low.events ?? [])].filter((event) => event.valence != null && event.arousal != null);

  const x = d3.scaleLinear().domain([0, 1]).range([margin.left, margin.left + innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([margin.top + innerHeight, margin.top]);

  const gridX = d3.axisBottom(x).ticks(5).tickSize(-innerHeight).tickFormat(() => "");
  const gridY = d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(() => "");
  svg.append("g").attr("transform", `translate(0,${margin.top + innerHeight})`).attr("class", "svg-grid").call(gridX);
  svg.append("g").attr("transform", `translate(${margin.left},0)`).attr("class", "svg-grid").call(gridY);

  const axes = svg.append("g").attr("class", "svg-axis");
  axes.append("g").attr("transform", `translate(0,${margin.top + innerHeight})`).call(d3.axisBottom(x).ticks(5));
  axes.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));

  svg
    .append("text")
    .attr("class", "svg-label")
    .attr("x", margin.left + innerWidth / 2)
    .attr("y", height - 14)
    .attr("text-anchor", "middle")
    .text("Valence");

  svg
    .append("text")
    .attr("class", "svg-label")
    .attr("x", 18)
    .attr("y", margin.top + innerHeight / 2)
    .attr("text-anchor", "middle")
    .attr("transform", `rotate(-90,18,${margin.top + innerHeight / 2})`)
    .text("Arousal");

  const tooltip = makeTooltip();
  const layer = svg.append("g");

  const series = {
    user: { label: "User session", events: userEvents, color: "#68d2c9", jitterSeed: 3, pointOpacity: 0.92, stroke: "rgba(255,255,255,0.9)" },
    high: { label: "High depression reference", events: high.events ?? [], color: "#ff8b8b", jitterSeed: 1, pointOpacity: 0.34, stroke: "transparent" },
    low: { label: "Low depression reference", events: low.events ?? [], color: "#f2b66d", jitterSeed: 2, pointOpacity: 0.34, stroke: "transparent" },
  };

  const controls = document.createElement("div");
  controls.className = "comparison-toggle";
  controls.innerHTML = `
    <span class="comparison-toggle__label">Draw flow for</span>
    <button type="button" class="comparison-toggle__button is-active" data-series="user">User</button>
    <button type="button" class="comparison-toggle__button" data-series="high">High depression</button>
    <button type="button" class="comparison-toggle__button" data-series="low">Low depression</button>
  `;
  shell.append(controls);

  const renderPoints = (events, color, label, jitterSeed = 0) => {
    const group = layer.append("g");
    group
      .selectAll("circle")
      .data(events.filter((event) => event.valence != null && event.arousal != null))
      .enter()
      .append("circle")
      .attr("cx", (event, index) => x(event.valence + Math.sin(index + jitterSeed) * 0.012))
      .attr("cy", (event, index) => y(event.arousal + Math.cos(index + jitterSeed) * 0.012))
      .attr("r", label === "User session" ? 6 : 5)
      .attr("fill", color)
      .attr("fill-opacity", label === "User session" ? 0.92 : 0.34)
      .attr("stroke", label === "User session" ? "rgba(255,255,255,0.9)" : "transparent")
      .attr("stroke-width", 1)
      .on("mousemove", (event, datum) => {
        tooltip.show(
          `<b>${datum.track}</b><br />${datum.artist}<br />Valence ${datum.valence.toFixed(2)} · Arousal ${datum.arousal.toFixed(2)}`,
          event.clientX + 16,
          event.clientY + 18,
        );
      })
      .on("mouseleave", () => tooltip.hide());
  };

  renderPoints(series.high.events, series.high.color, series.high.label, series.high.jitterSeed);
  renderPoints(series.low.events, series.low.color, series.low.label, series.low.jitterSeed);
  renderPoints(series.user.events, series.user.color, series.user.label, series.user.jitterSeed);

  const flowPath = svg.append("path").attr("fill", "none").attr("stroke-width", 3.2).attr("stroke-linecap", "round").attr("stroke-linejoin", "round");

  const createLine = d3
    .line()
    .x((event) => x(event.valence))
    .y((event) => y(event.arousal))
    .curve(d3.curveCatmullRom.alpha(0.55));

  const getOrderedPathEvents = (events) =>
    [...events]
      .filter((event) => event.valence != null && event.arousal != null)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const drawSelectedFlow = (key) => {
    const selected = series[key] ?? series.user;
    const pathEvents = getOrderedPathEvents(selected.events);
    if (pathEvents.length < 2) {
      flowPath.attr("d", null);
      return;
    }
    flowPath.attr("d", createLine(pathEvents)).attr("stroke", selected.color);
  };

  controls.querySelectorAll(".comparison-toggle__button").forEach((button) => {
    button.addEventListener("click", () => {
      controls.querySelectorAll(".comparison-toggle__button").forEach((node) => node.classList.remove("is-active"));
      button.classList.add("is-active");
      drawSelectedFlow(button.dataset.series);
    });
  });

  drawSelectedFlow("user");

  const note = document.createElement("div");
  note.className = "chart-note";
  note.innerHTML = `All three point clouds stay visible. Use the selector to draw one listener's flow line at a time.`;
  shell.append(note);

  const formatValue = (value) => (Number.isFinite(value) ? d3.format(".2f")(value) : "-");
  const userValence = d3.mean(userEvents, (event) => event.valence) ?? 0;
  const userArousal = d3.mean(userEvents, (event) => event.arousal) ?? 0;
  const summaryStrip = document.createElement("div");
  summaryStrip.className = "cohort-card__meta";
  summaryStrip.innerHTML = `
    <div><span>User average</span><b>${formatValue(userValence)}/${formatValue(userArousal)}</b></div>
    <div><span>High reference mean</span><b>${formatValue(highStats.valenceMean)}/${formatValue(highStats.arousalMean)}</b></div>
    <div><span>Low reference mean</span><b>${formatValue(lowStats.valenceMean)}/${formatValue(lowStats.arousalMean)}</b></div>
  `;
  shell.append(summaryStrip);
}

export function unmount() {}
