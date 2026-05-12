const formatMilliseconds = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function clearNode(node) {
  node.replaceChildren();
}

export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatCompact(ms) {
  return `${formatMilliseconds.format(ms)} ms`;
}

export function formatRatio(value) {
  return `${Math.round(value * 100)}%`;
}

export function shiftMoodValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric - 0.5 : null;
}

export function formatMoodValue(value) {
  const shifted = shiftMoodValue(value);
  return shifted == null ? "-" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(shifted);
}

export function chartLayout(container, { minHeight = 540 } = {}) {
  const width = Math.max(300, container.getBoundingClientRect().width || container.clientWidth || 300);
  const height = Math.max(minHeight, Math.round(width * 0.66));
  const margin = { top: 22, right: 24, bottom: 72, left: 60 };
  return {
    width,
    height,
    margin,
    innerWidth: width - margin.left - margin.right,
    innerHeight: height - margin.top - margin.bottom,
  };
}

export function createChartShell({ title, subtitle, legend = [] }) {
  const shell = document.createElement("article");
  shell.className = "chart-shell";

  const top = document.createElement("div");
  top.className = "chart-shell__top";

  const titleBox = document.createElement("div");
  const titleNode = document.createElement("div");
  titleNode.className = "chart-title";
  titleNode.textContent = title;
  const subtitleNode = document.createElement("div");
  subtitleNode.className = "chart-subtitle";
  subtitleNode.textContent = subtitle;
  titleBox.append(titleNode, subtitleNode);

  const legendNode = document.createElement("div");
  legendNode.className = "chart-legend";
  for (const item of legend) {
    const pill = document.createElement("div");
    pill.className = "legend-pill";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = item.color;
    const label = document.createElement("span");
    label.textContent = item.label;
    pill.append(swatch, label);
    legendNode.append(pill);
  }

  top.append(titleBox, legendNode);

  const chart = document.createElement("div");
  chart.className = "chart-root";

  shell.append(top, chart);
  return { shell, chart };
}

export function makeTooltip() {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  document.body.append(tooltip);

  return {
    element: tooltip,
    show(html, x, y) {
      tooltip.innerHTML = html;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.classList.add("is-visible");
    },
    hide() {
      tooltip.classList.remove("is-visible");
    },
    destroy() {
      tooltip.remove();
    },
  };
}
