import { chartLayout, clearNode, createChartShell, makeTooltip, formatCompact } from "./shared.js";

export function mount(container, payload) {
  clearNode(container);
  const matched = payload.matched_events ?? [];
  const { shell, chart } = createChartShell({
    title: "Valence and arousal over time",
    subtitle: "The same session expressed as two lines, letting mood shifts and spikes stay visible across the play order.",
    legend: [
      { label: "Valence", color: "#68d2c9" },
      { label: "Arousal", color: "#f2b66d" },
    ],
  });
  container.append(shell);

  if (!matched.length) {
    chart.innerHTML = `<div class="empty-state" style="position:static; min-height: 520px;"><div class="empty-state__badge">No matches</div><h3>No time-series data yet.</h3><p>Upload a file with tracks that exist in the internal song dataset, or load the demo session.</p></div>`;
    return;
  }

  const { width, height, margin, innerWidth, innerHeight } = chartLayout(container, { minHeight: 580 });
  const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${width} ${height}`).classed("chart-svg", true);
  const x = d3.scaleLinear().domain([0, Math.max(1, matched.length - 1)]).range([margin.left, margin.left + innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([margin.top + innerHeight, margin.top]);

  const gridX = d3.axisBottom(x).ticks(Math.min(8, matched.length)).tickSize(-innerHeight).tickFormat(() => "");
  const gridY = d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(() => "");
  svg.append("g").attr("transform", `translate(0,${margin.top + innerHeight})`).attr("class", "svg-grid").call(gridX);
  svg.append("g").attr("transform", `translate(${margin.left},0)`).attr("class", "svg-grid").call(gridY);

  const axes = svg.append("g").attr("class", "svg-axis");
  axes.append("g").attr("transform", `translate(0,${margin.top + innerHeight})`).call(d3.axisBottom(x).ticks(Math.min(8, matched.length)));
  axes.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));

  svg
    .append("text")
    .attr("class", "svg-label")
    .attr("x", margin.left + innerWidth / 2)
    .attr("y", height - 14)
    .attr("text-anchor", "middle")
    .text("Play order");

  svg
    .append("text")
    .attr("class", "svg-label")
    .attr("x", 18)
    .attr("y", margin.top + innerHeight / 2)
    .attr("text-anchor", "middle")
    .attr("transform", `rotate(-90,18,${margin.top + innerHeight / 2})`)
    .text("Mood score");

  const valenceLine = d3
    .line()
    .x((_, index) => x(index))
    .y((d) => y(d.valence))
    .curve(d3.curveMonotoneX);
  const arousalLine = d3
    .line()
    .x((_, index) => x(index))
    .y((d) => y(d.arousal))
    .curve(d3.curveMonotoneX);

  const area = d3
    .area()
    .x((_, index) => x(index))
    .y0(margin.top + innerHeight)
    .y1((d) => y(d.valence))
    .curve(d3.curveMonotoneX);

  const defs = svg.append("defs");
  const fill = defs.append("linearGradient").attr("id", "timeseriesFill").attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
  fill.append("stop").attr("offset", "0%").attr("stop-color", "rgba(104,210,201,0.35)");
  fill.append("stop").attr("offset", "100%").attr("stop-color", "rgba(104,210,201,0.04)");

  svg.append("path").datum(matched).attr("d", area).attr("fill", "url(#timeseriesFill)");
  svg.append("path").datum(matched).attr("d", valenceLine).attr("fill", "none").attr("stroke", "#68d2c9").attr("stroke-width", 3).attr("stroke-linecap", "round");
  svg.append("path").datum(matched).attr("d", arousalLine).attr("fill", "none").attr("stroke", "#f2b66d").attr("stroke-width", 3).attr("stroke-linecap", "round");

  const meanValence = d3.mean(matched, (d) => d.valence) ?? 0;
  const meanArousal = d3.mean(matched, (d) => d.arousal) ?? 0;

  svg.append("line").attr("x1", margin.left).attr("x2", margin.left + innerWidth).attr("y1", y(meanValence)).attr("y2", y(meanValence)).attr("stroke", "rgba(104,210,201,0.24)").attr("stroke-dasharray", "3 5");
  svg.append("line").attr("x1", margin.left).attr("x2", margin.left + innerWidth).attr("y1", y(meanArousal)).attr("y2", y(meanArousal)).attr("stroke", "rgba(242,182,109,0.24)").attr("stroke-dasharray", "3 5");

  const tooltip = makeTooltip();
  const points = svg.append("g").selectAll("g").data(matched).enter().append("g").attr("transform", (_, index) => `translate(${x(index)},${y(matched[index].valence)})`);

  points
    .append("circle")
    .attr("r", 4.8)
    .attr("fill", "#68d2c9")
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

  tooltip.hide();
}

export function unmount() {}
