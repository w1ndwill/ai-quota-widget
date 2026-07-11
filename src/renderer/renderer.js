"use strict";

const elements = {
  shell: document.getElementById("shell"),
  updatedAt: document.getElementById("updatedAt"),
  compactButton: document.getElementById("compactButton"),
  compactIcon: document.getElementById("compactIcon"),
  refreshButton: document.getElementById("refreshButton"),
  pinButton: document.getElementById("pinButton"),
  closeButton: document.getElementById("closeButton"),
  quotaRing: document.getElementById("quotaRing"),
  shortRingTrack: document.getElementById("shortRingTrack"),
  shortRingArc: document.getElementById("shortRingArc"),
  longRingTrack: document.getElementById("longRingTrack"),
  longRingArc: document.getElementById("longRingArc"),
  ringShort: document.getElementById("ringShort"),
  ringLong: document.getElementById("ringLong"),
  shortLabel: document.getElementById("shortLabel"),
  shortValue: document.getElementById("shortValue"),
  shortBar: document.getElementById("shortBar"),
  shortReset: document.getElementById("shortReset"),
  shortResetCompact: document.getElementById("shortResetCompact"),
  longLabel: document.getElementById("longLabel"),
  longValue: document.getElementById("longValue"),
  longBar: document.getElementById("longBar"),
  longReset: document.getElementById("longReset"),
  longResetCompact: document.getElementById("longResetCompact"),
  resetCount: document.getElementById("resetCount"),
  resetExpiry: document.getElementById("resetExpiry"),
  totalTokens: document.getElementById("totalTokens"),
  inputTokens: document.getElementById("inputTokens"),
  cachedTokens: document.getElementById("cachedTokens"),
  outputTokens: document.getElementById("outputTokens"),
  tokenCost: document.getElementById("tokenCost"),
  inputSegment: document.getElementById("inputSegment"),
  cacheSegment: document.getElementById("cacheSegment"),
  outputSegment: document.getElementById("outputSegment"),
  cacheHitRate: document.getElementById("cacheHitRate"),
  hitDelta: document.getElementById("hitDelta"),
  hitSummary: document.getElementById("hitSummary"),
  trend24Summary: document.getElementById("trend24Summary"),
  trend7Summary: document.getElementById("trend7Summary"),
  trendDelta: document.getElementById("trendDelta"),
  trendTotal: document.getElementById("trendTotal"),
  trendAverage: document.getElementById("trendAverage"),
  hitTrendLabel: document.getElementById("hitTrendLabel"),
  hitHeatmap: document.getElementById("hitHeatmap"),
  heatTooltip: document.getElementById("heatTooltip"),
  heatDateStart: document.getElementById("heatDateStart"),
  heatDateEnd: document.getElementById("heatDateEnd")
};

let isCompact = localStorage.getItem("compact") === "1";
let isRefreshing = false;
let focusedCard = null;
const chartSeries = new Map();
const HISTORY_VERSION = "2";
let history = readHistory();

elements.closeButton.addEventListener("click", () => window.aiQuota.quitWindow());
elements.compactButton.addEventListener("click", () => setCompact(!isCompact));
elements.refreshButton.addEventListener("click", refresh);
elements.pinButton.addEventListener("click", async () => {
  const pinned = await window.aiQuota.toggleAlwaysOnTop();
  elements.pinButton.classList.toggle("active", pinned);
  elements.pinButton.title = pinned ? "取消置顶" : "置顶";
});
setupRingLayers();
const trendCard = document.querySelector(".trend-card");
trendCard.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleCardFocus(trendCard);
});
trendCard.addEventListener("keydown", activateWithKeyboard);
elements.shell.addEventListener("click", (event) => {
  if (focusedCard && !event.target.closest(".is-focused")) {
    clearCardFocus();
    return;
  }
  if (event.target === elements.shell || event.target.classList.contains("panel")) {
    refresh();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") clearCardFocus();
});

window.aiQuota.onUpdated(render);
renderBar(elements.shortBar, 0, "gray");
renderBar(elements.longBar, 0, "gray");
renderHeatmap();
setCompact(isCompact);
generateAndSaveTrayIcon();
refresh();
setInterval(refresh, 5 * 60_000);

async function refresh() {
  if (isRefreshing) {
    return;
  }
  isRefreshing = true;
  document.body.classList.add("refreshing");
  try {
    render(await window.aiQuota.refresh());
  } finally {
    isRefreshing = false;
    document.body.classList.remove("refreshing");
  }
}

async function setCompact(compact) {
  clearCardFocus();
  isCompact = compact;
  localStorage.setItem("compact", compact ? "1" : "0");
  document.body.classList.toggle("compact", compact);
  elements.compactButton.title = compact ? "展开完整视图" : "切换为紧凑视图";
  elements.compactButton.setAttribute("aria-label", compact ? "展开完整视图" : "切换为紧凑视图");
  elements.compactButton.setAttribute("aria-pressed", String(compact));
  elements.compactIcon.setAttribute(
    "d",
    compact ? "M9 3H3v6M15 3h6v6M21 15v6h-6M3 15v6h6" : "M7 8h10v8H7z"
  );
  await window.aiQuota.setCompact(compact);
}


function render(snapshot) {
  const quota = snapshot?.quota;
  elements.updatedAt.textContent = snapshot?.error ? "读取失败" : formatTime(snapshot?.updatedAt ?? Date.now());
  elements.updatedAt.classList.toggle("error", Boolean(snapshot?.error));

  renderWindow("short", quota?.shortWindow, "5小时");
  renderWindow("long", quota?.longWindow, "周限额");
  renderRing(quota);
  renderResetCredits(snapshot?.resetCredits, quota?.resetCard);
  renderTokenStats(quota?.tokenStats);
  recordHistory(quota);
  renderTrend();
  renderHeatmap();
}

function renderWindow(prefix, quotaWindow, fallbackLabel) {
  const percent = quotaWindow?.remainingPercent;
  const tone = toneForPercent(percent);
  elements[`${prefix}Label`].textContent = quotaWindow?.label || fallbackLabel;
  elements[`${prefix}Value`].textContent = percent == null ? "--%" : `${percent}%`;
  elements[`${prefix}Reset`].textContent = quotaWindow?.resetsAt ? formatDateTime(quotaWindow.resetsAt) : "等待数据";
  elements[`${prefix}ResetCompact`].textContent = quotaWindow?.resetsAt ? formatCompactDate(quotaWindow.resetsAt) : "--";
  renderBar(elements[`${prefix}Bar`], percent, tone);
}

function renderRing(quota) {
  const short = quota?.shortWindow?.remainingPercent;
  const long = quota?.longWindow?.remainingPercent;
  elements.ringShort.textContent = short == null ? "--%" : `${short}%`;
  elements.ringLong.textContent = long == null ? "--%" : `${long}%`;
  elements.shortRingArc.style.strokeDasharray = `${clamp(short ?? 0)} 100`;
  elements.longRingArc.style.strokeDasharray = `${clamp(long ?? 0)} 100`;
  elements.shortRingArc.setAttribute("aria-label", `5 小时额度，剩余 ${short ?? "--"}%`);
  elements.longRingArc.setAttribute("aria-label", `7 天额度，剩余 ${long ?? "--"}%`);
}

function renderResetCredits(resetCredits, resetCard) {
  const availableCount = resetCredits?.availableCount ?? resetCard?.count;
  const first = resetCredits?.credits?.[0];
  const expiresAt = first?.expiresAt ?? resetCard?.expiresAt;
  elements.resetCount.textContent = availableCount == null ? "-- 张" : `${availableCount} 张`;
  elements.resetExpiry.textContent = expiresAt ? formatDateTime(expiresAt) : "到期未知";
}

function renderTokenStats(stats) {
  const hasTokenData =
    typeof stats?.input === "number" ||
    typeof stats?.cached === "number" ||
    typeof stats?.output === "number" ||
    typeof stats?.total === "number";
  const input = stats?.input ?? 0;
  const cached = stats?.cached ?? 0;
  const output = stats?.output ?? 0;
  const total = stats?.total ?? input + cached + output;
  const hitRate = stats?.cacheHitRate;

  elements.totalTokens.textContent = hasTokenData ? formatToken(total) : "--";
  elements.inputTokens.textContent = typeof stats?.input === "number" ? formatToken(input) : "--";
  elements.cachedTokens.textContent = typeof stats?.cached === "number" ? formatToken(cached) : "--";
  elements.outputTokens.textContent = typeof stats?.output === "number" ? formatToken(output) : "--";
  elements.tokenCost.textContent = hasTokenData
    ? stats?.source === "localSessions"
      ? `近 24h · ${stats.sessions ?? "--"} 会话`
      : "接口数据"
    : stats?.error
      ? "读取失败"
      : "接口未返回";
  elements.cacheHitRate.textContent = hitRate == null ? "--%" : `${hitRate}%`;
  elements.hitDelta.textContent = hitRate == null ? "暂无数据" : hitRate >= 60 ? "良好" : hitRate >= 30 ? "一般" : "偏低";
  elements.hitSummary.textContent =
    hitRate == null
      ? stats?.error
        ? `account/usage/read 未返回：${shortError(stats.error)}`
        : "当前 usage 接口没有返回输入、输出、缓存或命中率字段。"
      : hitSummary(hitRate);

  const uncachedInput = Math.max(0, input - cached);
  const knownTotal = Math.max(1, input + output);
  elements.inputSegment.style.width = hasTokenData ? `${(uncachedInput / knownTotal) * 100}%` : "0%";
  elements.cacheSegment.style.width = hasTokenData ? `${(cached / knownTotal) * 100}%` : "0%";
  elements.outputSegment.style.width = hasTokenData ? `${(output / knownTotal) * 100}%` : "0%";
}

function renderBar(bar, percent, tone) {
  bar.className = tone;
  bar.style.width = `${percent ?? 0}%`;
}

function recordHistory(quota) {
  const short = quota?.shortWindow?.remainingPercent;
  const long = quota?.longWindow?.remainingPercent;
  const token = quota?.tokenStats?.total;
  const hit = quota?.tokenStats?.cacheHitRate;
  if (short == null && long == null && token == null && hit == null) {
    return;
  }
  const last = history.at(-1);
  const now = Date.now();
  const entry = { t: now, short, long, token, hit };
  if (last && now - last.t < 60_000) {
    history[history.length - 1] = entry;
  } else {
    history.push(entry);
  }
  history = history.slice(-288);
  localStorage.setItem("quotaHistory", JSON.stringify(history));
}

async function renderTrend() {
  let daily;
  let hourly;
  try {
    [daily, hourly] = await Promise.all([
      window.aiQuota.readDailyTokenHistory(),
      window.aiQuota.readHourlyTokenHistory()
    ]);
  } catch {
    daily = {};
    hourly = [];
  }
  const now = Date.now();
  const recent = (Array.isArray(hourly) ? hourly : []).map((entry, index, values) => ({
    value: entry.total ?? 0,
    x: values.length <= 1 ? 1 : index / (values.length - 1),
    label: formatHourMinute(entry.t),
    fullLabel: `${formatDateTime(entry.t)}–${formatHourMinute(entry.t + 60 * 60_000)}`
  }));
  renderTokenChart("24", recent, [
    { x: 0, label: "24h 前" },
    { x: 0.5, label: "12h 前" },
    { x: 1, label: "现在" }
  ]);

  const today = new Date(now);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayData = daily[key] || { input: 0, cached: 0, output: 0, total: 0 };
    days.push({ value: dayData.total ?? 0, x: (6 - i) / 6, label: formatMonthDay(d), fullLabel: key });
  }
  renderTokenChart("7", days, [days[0], days[3], days[6]].map((day) => ({ x: day.x, label: day.label })));

  const current24 = recent.reduce((sum, hour) => sum + hour.value, 0);
  const weekTotal = days.reduce((sum, day) => sum + day.value, 0);
  elements.trend24Summary.textContent = recent.length ? `合计 ${formatToken(current24)}` : "等待刷新";
  elements.trend7Summary.textContent = `合计 ${formatToken(weekTotal)}`;
  elements.trendDelta.textContent = "24 小时 / 7 天";
  elements.trendTotal.textContent = `24h ${formatToken(current24)} · 7d ${formatToken(weekTotal)}`;
  elements.trendAverage.textContent = `7 天日均 ${formatToken(Math.round(weekTotal / 7))}`;
}


async function renderHeatmap() {
  let daily;
  try {
    daily = await window.aiQuota.readDailyTokenHistory();
  } catch {
    daily = {};
  }
  const today = new Date();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayData = daily[key];
    days.push({ date: key, token: dayData?.total ?? null, d });
  }

  const tokenValues = days.map((item) => item.token).filter((v) => typeof v === "number");
  const maxToken = Math.max(1, ...tokenValues);

  elements.hitHeatmap.innerHTML = "";
  for (const day of days) {
    const cell = document.createElement("span");
    cell.style.opacity = day.token == null ? "0.1" : String(0.2 + (Math.min(day.token, maxToken) / maxToken) * 0.8);
    cell.dataset.date = day.date;
    cell.dataset.token = day.token == null ? "" : formatToken(day.token);
    cell.dataset.label = `${day.d.getMonth() + 1}/${day.d.getDate()}`;
    elements.hitHeatmap.append(cell);
  }

  const lastToken = tokenValues.at(-1);
  elements.hitTrendLabel.textContent = lastToken == null ? "暂无数据" : `当前 ${formatToken(lastToken)}`;
  elements.heatDateStart.textContent = formatMonthDay(days[0].d);
  elements.heatDateEnd.textContent = formatMonthDay(days[days.length - 1].d);
}

function setupHeatmapTooltip() {
  const heatmap = elements.hitHeatmap;
  const tip = elements.heatTooltip;
  heatmap.addEventListener("mouseenter", (e) => {
    const cell = e.target;
    if (cell.tagName !== "SPAN") return;
    const label = cell.dataset.label;
    const token = cell.dataset.token;
    tip.textContent = token ? `${label} · ${token}` : `${label} · 无数据`;
    const wrapRect = heatmap.parentElement.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    tip.style.left = `${cellRect.left - wrapRect.left + cellRect.width / 2}px`;
    tip.style.bottom = `${wrapRect.bottom - cellRect.top + 6}px`;
    tip.classList.add("visible");
  }, true);
  heatmap.addEventListener("mouseleave", (e) => {
    if (e.target.tagName === "SPAN") {
      tip.classList.remove("visible");
    }
  }, true);
}
setupHeatmapTooltip();
setupTrendTooltips();

function shortError(error) {
  if (!error) {
    return "";
  }
  return String(error).replace(/^Error:\s*/, "").slice(0, 90);
}

function renderTokenChart(key, series, xTicks) {
  const plot = { left: 48, right: 408, top: 8, bottom: 88 };
  const maxValue = Math.max(1, ...series.map((item) => item.value));
  const points = series.map((item) => ({
    ...item,
    px: plot.left + item.x * (plot.right - plot.left),
    py: plot.bottom - (item.value / maxValue) * (plot.bottom - plot.top)
  }));
  const linePath = points.length
    ? points.map((point, index) => `${index ? "L" : "M"} ${point.px.toFixed(1)} ${point.py.toFixed(1)}`).join(" ")
    : "";
  const areaPath = points.length
    ? `${linePath} L ${points.at(-1).px.toFixed(1)} ${plot.bottom} L ${points[0].px.toFixed(1)} ${plot.bottom} Z`
    : "";

  document.getElementById(`trend${key}Line`).setAttribute("d", linePath);
  document.getElementById(`trend${key}Area`).setAttribute("d", areaPath);
  document.getElementById(`trend${key}Axes`).innerHTML = buildChartAxes(maxValue, xTicks, plot);
  chartSeries.set(key, { points, plot });
}

function buildChartAxes(maxValue, xTicks, plot) {
  const mid = maxValue / 2;
  const horizontal = [plot.top, (plot.top + plot.bottom) / 2, plot.bottom]
    .map((y) => `<path d="M${plot.left} ${y}H${plot.right}" />`)
    .join("");
  const yLabels = [
    { y: plot.top + 3, value: maxValue },
    { y: (plot.top + plot.bottom) / 2 + 3, value: mid },
    { y: plot.bottom + 3, value: 0 }
  ].map(({ y, value }) => `<text x="43" y="${y}" text-anchor="end">${formatToken(value)}</text>`).join("");
  const xLabels = xTicks.map((tick, index) => {
    const x = plot.left + tick.x * (plot.right - plot.left);
    const anchor = index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle";
    return `<text x="${x}" y="106" text-anchor="${anchor}">${tick.label}</text>`;
  }).join("");
  return `${horizontal}<path class="axis-line" d="M${plot.left} ${plot.top}V${plot.bottom}H${plot.right}" />${yLabels}${xLabels}`;
}

function setupTrendTooltips() {
  document.querySelectorAll(".chart-hit").forEach((hit) => {
    const key = hit.dataset.chart;
    hit.addEventListener("pointermove", (event) => showChartTooltip(key, event));
    hit.addEventListener("pointerleave", () => hideChartTooltip(key));
  });
}

function showChartTooltip(key, event) {
  const state = chartSeries.get(key);
  if (!state?.points.length) return;
  const svg = document.getElementById(`trend${key}Chart`);
  const rect = svg.getBoundingClientRect();
  const svgX = ((event.clientX - rect.left) / rect.width) * 420;
  const point = state.points.reduce((closest, candidate) =>
    Math.abs(candidate.px - svgX) < Math.abs(closest.px - svgX) ? candidate : closest
  );
  const cursor = document.getElementById(`trend${key}Cursor`);
  const dot = document.getElementById(`trend${key}Point`);
  cursor.setAttribute("x1", point.px);
  cursor.setAttribute("x2", point.px);
  dot.setAttribute("cx", point.px);
  dot.setAttribute("cy", point.py);
  cursor.classList.add("visible");
  dot.classList.add("visible");

  const tooltip = document.getElementById(`trend${key}Tooltip`);
  const shell = tooltip.parentElement.getBoundingClientRect();
  tooltip.textContent = `${point.fullLabel} · ${formatToken(point.value)} Token`;
  tooltip.style.left = `${Math.max(72, Math.min(shell.width - 72, event.clientX - shell.left))}px`;
  tooltip.style.top = `${Math.max(4, event.clientY - shell.top - 34)}px`;
  tooltip.classList.add("visible");
}

function hideChartTooltip(key) {
  document.getElementById(`trend${key}Cursor`).classList.remove("visible");
  document.getElementById(`trend${key}Point`).classList.remove("visible");
  document.getElementById(`trend${key}Tooltip`).classList.remove("visible");
}

function setupRingLayers() {
  const layers = [
    [[elements.shortRingTrack, elements.shortRingArc], "short"],
    [[elements.longRingTrack, elements.longRingArc], "long"]
  ];
  for (const [targets, key] of layers) {
    for (const target of targets) target.addEventListener("pointerenter", () => setRingLayer(key));
    targets[1].addEventListener("focus", () => setRingLayer(key));
  }
  elements.quotaRing.addEventListener("pointerleave", () => setRingLayer(null));
  elements.quotaRing.addEventListener("focusout", (event) => {
    if (!elements.quotaRing.contains(event.relatedTarget)) setRingLayer(null);
  });
}

function setRingLayer(key) {
  elements.quotaRing.classList.toggle("ring-focus-short", key === "short");
  elements.quotaRing.classList.toggle("ring-focus-long", key === "long");
}

function activateWithKeyboard(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggleCardFocus(event.currentTarget.closest(".interactive-card"));
}

function toggleCardFocus(card) {
  if (isCompact || !card) return;
  if (focusedCard === card) {
    clearCardFocus();
    return;
  }
  clearCardFocus();
  focusedCard = card;
  card.classList.add("is-focused");
  document.querySelector(".panel").classList.add("focus-mode");
  card.setAttribute("aria-expanded", "true");
}

function clearCardFocus() {
  if (!focusedCard) return;
  focusedCard.classList.remove("is-focused");
  focusedCard.setAttribute("aria-expanded", "false");
  document.querySelector(".panel").classList.remove("focus-mode");
  focusedCard = null;
}

function readHistory() {
  try {
    if (localStorage.getItem("quotaHistoryVersion") !== HISTORY_VERSION) {
      localStorage.setItem("quotaHistoryVersion", HISTORY_VERSION);
      localStorage.removeItem("quotaHistory");
      return [];
    }
    const value = JSON.parse(localStorage.getItem("quotaHistory") || "[]");
    return Array.isArray(value) ? value.slice(-288) : [];
  } catch {
    return [];
  }
}

function toneForPercent(percent) {
  if (percent == null) {
    return "gray";
  }
  if (percent < 20) {
    return "red";
  }
  if (percent < 50) {
    return "yellow";
  }
  return "green";
}

function hitSummary(hitRate) {
  if (hitRate >= 70) {
    return "上下文复用充分，输入成本压力较低。";
  }
  if (hitRate >= 40) {
    return "缓存有贡献，仍可继续稳定提示结构。";
  }
  return "缓存复用偏少，长上下文任务成本更容易上升。";
}

function formatToken(value) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${trimNumber(value / 1_000_000)}M`;
  }
  if (abs >= 1_000) {
    return `${trimNumber(value / 1_000)}K`;
  }
  return String(Math.round(value));
}

function trimNumber(value) {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}

function clamp(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(timestamp);
}

function formatHourMinute(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp);
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp);
}

function formatCompactDate(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp);
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function generateAndSaveTrayIcon() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    
    const grad = ctx.createLinearGradient(0, 0, 16, 16);
    grad.addColorStop(0, "#6757e7");
    grad.addColorStop(1, "#53c987");
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(0, 0, 16, 16, 4.5);
    } else {
      ctx.rect(0, 0, 16, 16);
    }
    ctx.fill();
    
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(8, 8, 2.2, 0, Math.PI * 2);
    ctx.fill();
    
    const iconDataUrl = canvas.toDataURL("image/png");
    window.aiQuota.saveTrayIcon(iconDataUrl);
  } catch (e) {
    console.error("Failed to generate tray icon:", e);
  }
}
