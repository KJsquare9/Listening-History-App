import { chartLayout, clearNode, createChartShell, makeTooltip, formatCompact, formatDuration } from "./shared.js";

export function mount(container, payload) {
  clearNode(container);
  const events = [...(payload.events ?? [])].sort((a, b) => b.ms_played - a.ms_played).slice(0, 12);
  const { shell, chart } = createChartShell({
    title: "Listening duration breakdown",
    subtitle: "Top plays ranked by milliseconds listened. This works for matched and unmatched tracks alike.",
    legend: [{ label: "ms played", color: "#68d2c9" }],
  });
  container.append(shell);

  if (!events.length) {
    chart.innerHTML = `<div class="empty-state" style="position:static; min-height: 520px;"><div class="empty-state__badge">No duration data</div><h3>No listening duration data is available.</h3><p>Upload a file with ms_played or msPlayed values to see the listening breakdown.</p></div>`;
    return;
  }

  const { width, height, margin, innerWidth, innerHeight } = chartLayout(container, { minHeight: 580 });
  const svg = d3.select(chart).append("svg").attr("viewBox", `0 0 ${width} ${height}`).classed("chart-svg", true);

  const x = d3.scaleLinear().domain([0, d3.max(events, (event) => event.ms_played) ?? 1]).nice().range([margin.left, margin.left + innerWidth]);
  const y = d3.scaleBand().domain(events.map((event) => event.track)).range([margin.top, margin.top + innerHeight]).padding(0.22);

  const grid = d3.axisBottom(x).ticks(5).tickSize(-innerHeight).tickFormat(() => "");
  svg.append("g").attr("transform", `translate(0,${margin.top + innerHeight})`).attr("class", "svg-grid").call(grid);

  const axes = svg.append("g").attr("class", "svg-axis");
  axes.append("g").attr("transform", `translate(0,${margin.top + innerHeight})`).call(d3.axisBottom(x).ticks(5).tickFormat((value) => formatDuration(value)));
  axes.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));

  svg
    .append("text")
    .attr("class", "svg-label")
    .attr("x", margin.left + innerWidth / 2)
    .attr("y", height - 14)
    .attr("text-anchor", "middle")
    .text("Duration");

  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", "durationGradient").attr("x1", "0%").attr("x2", "100%");
  gradient.append("stop").attr("offset", "0%").attr("stop-color", "#68d2c9");
  gradient.append("stop").attr("offset", "100%").attr("stop-color", "#f2b66d");

  const tooltip = makeTooltip();
  svg
    .append("g")
    .selectAll("rect")
    .data(events)
    .enter()
    .append("rect")
    .attr("x", margin.left)
    .attr("y", (event) => y(event.track))
    .attr("width", (event) => x(event.ms_played) - margin.left)
    .attr("height", y.bandwidth())
    .attr("rx", 12)
    .attr("fill", "url(#durationGradient)")
    .attr("fill-opacity", 0.9)
    .attr("stroke", "rgba(255,255,255,0.12)")
    .on("mousemove", (event, datum) => {
      tooltip.show(
        `<b>${datum.track}</b><br />${datum.artist}<br />${formatCompact(datum.ms_played)}<br />${datum.matched ? "Matched" : "Unmatched"}`,
        event.clientX + 16,
        event.clientY + 18,
      );
    })
    .on("mouseleave", () => tooltip.hide());

  svg
    .append("g")
    .selectAll("text")
    .data(events)
    .enter()
    .append("text")
    .attr("x", (event) => x(event.ms_played) + 10)
    .attr("y", (event) => y(event.track) + y.bandwidth() / 2 + 4)
    .attr("fill", "rgba(238,244,255,0.78)")
    .attr("font-size", 12)
    .attr("font-family", "Manrope, sans-serif")
    .text((event) => formatDuration(event.ms_played));

  tooltip.hide();
}

export function unmount() {}
