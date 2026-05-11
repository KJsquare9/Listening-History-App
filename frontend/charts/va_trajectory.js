import { chartLayout, clearNode, createChartShell, makeTooltip, formatCompact } from "./shared.js";

export function mount(container, payload) {
  clearNode(container);
  const matched = payload.matched_events ?? [];
  const { shell, chart } = createChartShell({
    title: "V-A trajectory",
    subtitle: "A time-ordered path through valence and arousal. Later plays shift from cool to warm gradients.",
    legend: [
      { label: "Start", color: "#68d2c9" },
      { label: "End", color: "#ff8b8b" },
      { label: "Flow direction (start to end)", color: "linear-gradient(90deg, #68d2c9, #ff8b8b)" },
    ],
  });
  container.append(shell);

  if (!matched.length) {
    chart.innerHTML = `<div class="empty-state" style="position:static; min-height: 520px;"><div class="empty-state__badge">No matches</div><h3>No matched tracks were found.</h3><p>The valence-arousal chart needs at least one lookup hit in the song dataset.</p></div>`;
    return;
  }

  const { width, height, margin, innerWidth, innerHeight } = chartLayout(container, { minHeight: 580 });
  const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${width} ${height}`).classed("chart-svg", true);

  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", "trajectoryGradient")
    .attr("x1", "0%")
    .attr("y1", "100%")
    .attr("x2", "100%")
    .attr("y2", "0%");

  gradient.append("stop").attr("offset", "0%").attr("stop-color", "#68d2c9");
  gradient.append("stop").attr("offset", "55%").attr("stop-color", "#f2b66d");
  gradient.append("stop").attr("offset", "100%").attr("stop-color", "#ff8b8b");

  const x = d3.scaleLinear().domain([0, 1]).range([margin.left, margin.left + innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([margin.top + innerHeight, margin.top]);

  const line = d3
    .line()
    .x((d) => x(d.valence))
    .y((d) => y(d.arousal))
    .curve(d3.curveCatmullRom.alpha(0.5));

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

  svg.append("line").attr("x1", x(0.5)).attr("x2", x(0.5)).attr("y1", margin.top).attr("y2", margin.top + innerHeight).attr("stroke", "rgba(255,255,255,0.12)").attr("stroke-dasharray", "4 6");
  svg.append("line").attr("y1", y(0.5)).attr("y2", y(0.5)).attr("x1", margin.left).attr("x2", margin.left + innerWidth).attr("stroke", "rgba(255,255,255,0.12)").attr("stroke-dasharray", "4 6");

  svg.append("path").datum(matched).attr("fill", "none").attr("stroke", "url(#trajectoryGradient)").attr("stroke-width", 4).attr("stroke-linecap", "round").attr("stroke-linejoin", "round").attr("d", line);

  const tooltip = makeTooltip();
  svg
    .append("g")
    .selectAll("circle")
    .data(matched)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.valence))
    .attr("cy", (d) => y(d.arousal))
    .attr("r", (d, index) => (index === 0 || index === matched.length - 1 ? 7 : 5))
    .attr("fill", (d, index) => d3.interpolateRgb("#68d2c9", "#ff8b8b")(index / Math.max(1, matched.length - 1)))
    .attr("stroke", "rgba(255,255,255,0.8)")
    .attr("stroke-width", 1)
    .on("mousemove", (event, d) => {
      tooltip.show(
        `<b>${d.track}</b><br />${d.artist}<br />Valence ${d.valence.toFixed(2)} · Arousal ${d.arousal.toFixed(2)}<br />${formatCompact(d.ms_played)}`,
        event.clientX + 16,
        event.clientY + 18,
      );
    })
    .on("mouseleave", () => tooltip.hide());

  const startEvent = matched[0];
  const endEvent = matched[matched.length - 1];
  if (startEvent) {
    svg
      .append("text")
      .attr("class", "svg-label")
      .attr("x", x(startEvent.valence) + 10)
      .attr("y", y(startEvent.arousal) - 10)
      .text("Start");
  }

  if (endEvent && endEvent !== startEvent) {
    svg
      .append("text")
      .attr("class", "svg-label")
      .attr("x", x(endEvent.valence) + 10)
      .attr("y", y(endEvent.arousal) - 10)
      .text("End");
  }

  tooltip.hide();
}

export function unmount() {}
