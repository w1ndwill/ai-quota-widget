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
  resetRow: document.getElementById("resetRow"),
  resetCount: document.getElementById("resetCount"),
  resetExpiry: document.getElementById("resetExpiry"),
  resetDialog: document.getElementById("resetDialog"),
  resetDialogClose: document.getElementById("resetDialogClose"),
  resetDialogSummary: document.getElementById("resetDialogSummary"),
  resetDialogList: document.getElementById("resetDialogList"),
  tokenCardTitle: document.getElementById("tokenCardTitle"),
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
  heatDateEnd: document.getElementById("heatDateEnd"),
  tokenRangeToggle: document.getElementById("tokenRangeToggle"),
  tokenCardBody: document.getElementById("tokenCardBody")
};

let isCompact = localStorage.getItem("compact") === "1";
let tokenRange = localStorage.getItem("tokenRange") || "24h";
let isRefreshing = false;
let focusedCard = null;
let lastSnapshot = null;
let selectedModel = "all";
const chartSeries = new Map();
const HISTORY_VERSION = "2";
let history = readHistory();
let mergedModels = [];
let latestResetCredits = [];

elements.closeButton.addEventListener("click", () => window.aiQuota.quitWindow());
elements.compactButton.addEventListener("click", () => setCompact(!isCompact));
elements.refreshButton.addEventListener("click", refresh);
elements.resetRow.addEventListener("click", openResetDialog);
elements.resetRow.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openResetDialog();
});
elements.resetDialogClose.addEventListener("click", closeResetDialog);
elements.resetDialog.querySelector(".reset-dialog-backdrop").addEventListener("click", closeResetDialog);
elements.pinButton.addEventListener("click", async () => {
  const pinned = await window.aiQuota.toggleAlwaysOnTop();
  elements.pinButton.classList.toggle("active", pinned);
  elements.pinButton.title = pinned ? "取消置顶" : "置顶";
});
setupSettings();
setupModelSelect();
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
  if (event.key === "Escape") closeModelPicker();
  if (event.key === "Escape") clearCardFocus();
  if (event.key === "Escape") closeResetDialog();
});

window.aiQuota.onUpdated(render);
renderBar(elements.shortBar, 0, "gray");
renderBar(elements.longBar, 0, "gray");
setCompact(isCompact);
setupTokenRangeToggle();
generateAndSaveTrayIcon();
refresh();
// 历史图会同步扫描大量本地日志，延迟到额度首屏已经发起请求后再读取。
setTimeout(renderHistory, 800);
setInterval(refresh, 5 * 60_000);

async function setupSettings() {
  const panel = document.getElementById("settingsPanel");
  const langSelect = document.getElementById("langSelect");
  const themeSelect = document.getElementById("themeSelect");
  const cfgCodex = document.getElementById("cfgCodex");
  const cfgClaudeCode = document.getElementById("cfgClaudeCode");
  const cfgAntigravity = document.getElementById("cfgAntigravity");

  let config = { enableCodex: true, enableClaudeCode: true, enableAntigravity: true };
  try {
    const mainConfig = await window.aiQuota.readSettings();
    if (mainConfig) {
      config = { ...config, ...mainConfig };
    }
  } catch (e) {
    console.error("Failed to read settings from main process", e);
  }

  applyConfigEffects(config);
  document.body.classList.toggle("no-codex", !config.enableCodex);

  langSelect.value = localStorage.getItem("lang") || "zh";
  themeSelect.value = localStorage.getItem("theme") || "light";
  applyTheme(themeSelect.value);
  applyLang(langSelect.value);

  // Open settings
  document.getElementById("settingsButton").addEventListener("click", () => {
    langSelect.value = localStorage.getItem("lang") || "zh";
    themeSelect.value = localStorage.getItem("theme") || "light";
    cfgCodex.checked = config.enableCodex;
    cfgClaudeCode.checked = config.enableClaudeCode;
    cfgAntigravity.checked = config.enableAntigravity;

    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  });

  // Close
  function closeSettings() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  }
  document.getElementById("settingsClose").addEventListener("click", closeSettings);
  panel.querySelector(".settings-backdrop").addEventListener("click", closeSettings);

  // Save
  document.getElementById("settingsSave").addEventListener("click", async () => {
    const lang = langSelect.value;
    const theme = themeSelect.value;

    localStorage.setItem("lang", lang);
    localStorage.setItem("theme", theme);

    applyTheme(theme);
    applyLang(lang);

    const newConfig = {
      enableCodex: cfgCodex.checked,
      enableClaudeCode: cfgClaudeCode.checked,
      enableAntigravity: cfgAntigravity.checked
    };

    config = { ...config, ...newConfig };
    applyConfigEffects(config);
    document.body.classList.toggle("no-codex", !config.enableCodex);

    try {
      await window.aiQuota.saveSettings(newConfig);
    } catch (e) {
      console.error(e);
    }

    closeSettings();
    refresh();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closeSettings();
  });
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme === "dark" ? "dark" : "light";
  root.style.colorScheme = root.dataset.theme;
}

const I18N = {
  zh: {
    resetSub: "可恢复 5 小时与周额度",
    trendTitle: "Token 消耗趋势",
    heatTitle: "每日Token消耗",
    hitRate: "命中率分析",
    modelUsage: "按模型 Token 用量",
    token24h: "近 24h Token",
    tokenInput: "输入",
    tokenCache: "缓存",
    tokenOutput: "输出",
    refreshTip: "手动刷新",
    pinTip: "置顶",
    unpinTip: "取消置顶",
    compactTip: "切换紧凑视图",
    expandTip: "展开完整视图",
    closeTip: "关闭",
    settingsTitle: "设置",
    langLabel: "语言 / Language",
    themeLabel: "主题",
    themeLight: "亮色",
    themeDark: "暗色",
    saveBtn: "保存",
    settingsClose: "关闭设置",
    allModels: "全部模型",
    unknownModel: "未知模型",
    sourceSectionTitle: "启用的数据源",
    labelCodex: "OpenAI Codex 额度与日志",
    labelClaudeCode: "Claude Code 本地日志",
    labelAntigravity: "Antigravity 会话估算",
    noData: "无数据",
    uncomputable: "无法分析",
    waitingData: "等待数据",
    refreshFailed: "读取失败",
    expireUnknown: "到期未知",
    resetCards: "重置卡",
    shortLabel: "5小时",
    weekLabel: "周限额",
    remaining: "剩余",
    low: "低",
    high: "高",
    hitExcellent: "优秀",
    hitGood: "良好",
    hitNormal: "一般",
    hitLow: "偏低",
    trend24Summary: "数据积累中",
    trend7Summary: "日消耗",
    trendHover: "悬浮曲线查看数值",
    sourceLocal: "本地会话",
    sourceAPI: "接口数据",
    sourceMerged: "Codex + Antigravity",
    sourceAG: "Antigravity · 估算",
    hitSummaryExcellent: "上下文复用极佳，输入成本被大幅削减。",
    hitSummaryGood: "上下文复用良好，有显著的成本节省效果。",
    hitSummaryMid: "缓存有贡献，仍可继续稳定提示词结构。",
    hitSummaryLow: "缓存复用偏少，长上下文任务成本更容易上升。",
    modelCount: (n) => `${n} 个模型`,
    noLocalData: "暂无本地会话数据",
    shellTitle: "点击空白处刷新",
    resetCount: (n) => `${n} 张`,
    resetCard: "重置卡",
    noResetCredits: "暂无重置卡",
    grantedAt: "获得时间",
    expiresAt: "到期时间",
    unknownTime: "未知",
    available: "可用",
    used: "已使用",
    expired: "已过期",
    unknownStatus: "未知状态",
    tokenCostSession: (n) => `近 24h · ${n} 会话`,
  },
  en: {
    resetSub: "Restores 5h & weekly quota",
    trendTitle: "Token Trend",
    heatTitle: "Daily Token Usage",
    hitRate: "Cache Hit Rate",
    modelUsage: "Token by Model",
    token24h: "24h Tokens",
    tokenInput: "Input",
    tokenCache: "Cache",
    tokenOutput: "Output",
    refreshTip: "Refresh",
    pinTip: "Pin",
    unpinTip: "Unpin",
    compactTip: "Compact view",
    expandTip: "Expand view",
    closeTip: "Close",
    settingsTitle: "Settings",
    langLabel: "Language",
    themeLabel: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    saveBtn: "Save",
    settingsClose: "Close settings",
    allModels: "All Models",
    unknownModel: "Unknown",
    sourceSectionTitle: "Data Sources",
    labelCodex: "OpenAI Codex Quota & Logs",
    labelClaudeCode: "Claude Code Local Logs",
    labelAntigravity: "Antigravity Session Estimates",
    noData: "No data",
    uncomputable: "N/A",
    waitingData: "Waiting",
    refreshFailed: "Refresh failed",
    expireUnknown: "Unknown",
    resetCards: "Reset Cards",
    shortLabel: "5 Hours",
    weekLabel: "Weekly",
    remaining: "Remaining",
    low: "Low",
    high: "High",
    hitExcellent: "Excellent",
    hitGood: "Good",
    hitNormal: "Average",
    hitLow: "Low",
    trend24Summary: "Accumulating",
    trend7Summary: "Daily",
    trendHover: "Hover to see values",
    sourceLocal: "Local sessions",
    sourceAPI: "API data",
    sourceMerged: "Codex + Antigravity",
    sourceAG: "Antigravity · Estimated",
    hitSummaryExcellent: "Outstanding cache reuse, significantly slashing input costs.",
    hitSummaryGood: "Strong context reuse keeps input costs low.",
    hitSummaryMid: "Cache helps, consider stabilizing prompt structure.",
    hitSummaryLow: "Low cache reuse may increase costs on long-context tasks.",
    modelCount: (n) => `${n} models`,
    noLocalData: "No local session data",
    shellTitle: "Click to refresh",
    resetCount: (n) => `${n} cards`,
    resetCard: "Reset card",
    noResetCredits: "No reset cards",
    grantedAt: "Granted",
    expiresAt: "Expires",
    unknownTime: "Unknown",
    available: "Available",
    used: "Used",
    expired: "Expired",
    unknownStatus: "Unknown status",
    tokenCostSession: (n) => `24h · ${n} sessions`,
  }
};
let i18n = I18N.zh;

function t(key, ...args) {
  let val = i18n[key];
  if (typeof val === "function") return val(...args);
  return val !== undefined ? val : key;
}

function applyLang(lang) {
  try {
    i18n = I18N[lang] || I18N.zh;
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    const set = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
    const attr = (id, key) => { const el = document.getElementById(id); if (el) el.title = t(key); };
    set("resetSub", "resetSub");
    set("langLabel", "langLabel");
    set("themeLabel", "themeLabel");
    set("settingsSave", "saveBtn");
    set("shortLabel", "shortLabel");
    set("longLabel", "weekLabel");
    const optLight = document.querySelector("#themeSelect option[value=light]");
    const optDark = document.querySelector("#themeSelect option[value=dark]");
    if (optLight) optLight.textContent = t("themeLight");
    if (optDark) optDark.textContent = t("themeDark");
    const st = document.querySelector(".settings-head strong");
    if (st) st.textContent = t("settingsTitle");
    set("resetDialogTitle", "resetCards");
    set("sourceSectionTitle", "sourceSectionTitle");
    set("labelCodex", "labelCodex");
    set("labelClaudeCode", "labelClaudeCode");
    set("labelAntigravity", "labelAntigravity");
    attr("refreshButton", "refreshTip");
    attr("pinButton", "pinTip");
    attr("compactButton", "compactTip");
    attr("closeButton", "closeTip");
    if (lastSnapshot) render(lastSnapshot);
  } catch(e) { /* don't crash on i18n */ }
}

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

function applyConfigEffects(config) {
  if (!config) return;
  const btn = elements.compactButton || document.getElementById("compactButton");
  if (!config.enableCodex) {
    if (btn) btn.style.display = "none";
    if (isCompact) {
      setCompact(false);
    }
  } else {
    if (btn) btn.style.display = "";
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
  try {
    lastSnapshot = snapshot;
    if (snapshot?.config) {
      applyConfigEffects(snapshot.config);
      document.body.classList.toggle("no-codex", !snapshot.config.enableCodex);
    }
    const quota = snapshot?.quota;
    elements.updatedAt.textContent = snapshot?.error ? t("refreshFailed") : formatTime(snapshot?.updatedAt ?? Date.now());
    elements.updatedAt.classList.toggle("error", Boolean(snapshot?.error));
    elements.updatedAt.title = snapshot?.error ?? "";

    renderWindow("short", quota?.shortWindow, "5小时");
    renderWindow("long", quota?.longWindow, "周限额");
    renderRing(quota);
    renderResetCredits(snapshot?.resetCredits, quota?.resetCard);

    mergedModels = buildMergedModels(snapshot);
    const tokenData = getTokenForModel(snapshot, selectedModel);
    renderTokenStats(tokenData, mergedModels);

    recordHistory(quota);
    renderHistory();
  } catch (e) {
    elements.updatedAt.textContent = "ERR:" + (e.message || "").slice(0, 30);
    elements.updatedAt.classList.add("error");
  }
}

function setupTokenRangeToggle() {
  const toggle = elements.tokenRangeToggle;
  if (!toggle) return;
  const buttons = toggle.querySelectorAll(".range-btn");
  
  buttons.forEach((btn) => {
    const range = btn.dataset.range;
    if (range === tokenRange) {
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    }
  });

  setTimeout(updateToggleSlider, 100);
  window.addEventListener("resize", updateToggleSlider);

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const range = btn.dataset.range;
      if (range === tokenRange) return;

      tokenRange = range;
      localStorage.setItem("tokenRange", range);

      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      
      updateToggleSlider();

      elements.tokenCardBody.classList.add("switching");
      await new Promise((resolve) => setTimeout(resolve, 220));

      if (lastSnapshot) {
        const tokenData = getTokenForModel(lastSnapshot, selectedModel);
        await renderTokenStats(tokenData, mergedModels);
      }

      elements.tokenCardBody.classList.remove("switching");
    });
  });
}

function updateToggleSlider() {
  const toggle = elements.tokenRangeToggle;
  if (!toggle) return;
  const activeBtn = toggle.querySelector(".range-btn.active");
  const slider = toggle.querySelector(".range-slider");
  if (slider && activeBtn) {
    slider.style.width = `${activeBtn.offsetWidth}px`;
    slider.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
  }
}


function setupModelSelect() {
  const picker = document.createElement("div");
  const trigger = document.createElement("button");
  const label = document.createElement("span");
  const arrow = document.createElement("i");
  const menu = document.createElement("div");
  picker.className = "model-picker";
  trigger.className = "model-picker-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "\u9009\u62e9\u7edf\u8ba1\u6a21\u578b");
  label.className = "model-picker-label";
  arrow.className = "model-picker-arrow";
  menu.className = "model-picker-menu";
  menu.setAttribute("role", "listbox");
  trigger.append(label, arrow);
  picker.append(trigger, menu);
  elements.tokenCost.remove();
  document.querySelector(".window-actions").prepend(picker);
  elements.modelPicker = picker;
  elements.modelPickerTrigger = trigger;
  elements.modelPickerLabel = label;
  elements.modelPickerMenu = menu;
  document.querySelector(".model-usage-card")?.remove();

  trigger.addEventListener("click", () => {
    picker.classList.contains("open") ? closeModelPicker() : openModelPicker();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!picker.contains(event.target)) closeModelPicker();
  });
}

function syncModelSelect(modelUsage) {
  const models = Array.isArray(modelUsage) ? modelUsage : [];
  const modelKeys = models.map((m) => m.sourceModel || m.model);
  const allowed = new Set(["all", ...modelKeys]);
  if (!allowed.has(selectedModel)) selectedModel = "all";
  elements.modelPickerMenu.replaceChildren();
  // Add "all" option
  const allOption = buildModelOption({ model: "all", label: "\u5168\u90e8\u6a21\u578b" });
  elements.modelPickerMenu.append(allOption);
  // Add each model with source prefix
  for (const item of models) {
    const opt = buildModelOption({
      model: item.sourceModel || item.model,
      label: item.displayLabel || `[${item.source}] ${item.model}`,
      source: item.source
    });
    elements.modelPickerMenu.append(opt);
  }
  // Update trigger label
  const sel = models.find((m) => (m.sourceModel || m.model) === selectedModel);
  elements.modelPickerLabel.textContent = selectedModel === "all" ? "\u5168\u90e8\u6a21\u578b" : (sel?.displayLabel || selectedModel);
}

function buildModelOption(item) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "model-picker-option";
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", String(item.model === selectedModel));
  option.classList.toggle("selected", item.model === selectedModel);
  option.textContent = item.label || item.model;
  if (item.source) option.dataset.source = item.source;
  option.addEventListener("click", () => {
    selectedModel = item.model;
    closeModelPicker();
    if (lastSnapshot) {
      const data = getTokenForModel(lastSnapshot, selectedModel);
      renderTokenStats(data, mergedModels);
    }
    renderHistory();
  });
  return option;
}

function modelLabel(item) {
  return item.label ?? (item.model === "unknown" ? "\u672a\u77e5\u6a21\u578b" : item.model);
}

function sourceLabel(stats) {
  if (!stats) return "\u65e0\u6570\u636e";
  const suffix = tokenRange === "cumulative" ? " · 累计" : "";
  if (stats.source === "antigravity") return "Antigravity \u00b7 \u4f30\u7b97" + suffix;
  if (stats.source === "merged") return "Codex + Antigravity" + suffix;
  return (stats.source === "localSessions" || stats.source === "localModel" ? "\u672c\u5730\u4f1a\u8bdd" : "\u63a5\u53e3\u6570\u636e") + suffix;
}

function openModelPicker() {
  elements.modelPicker.classList.add("open");
  elements.modelPickerTrigger.setAttribute("aria-expanded", "true");
}

function closeModelPicker() {
  if (!elements.modelPicker) return;
  elements.modelPicker.classList.remove("open");
  elements.modelPickerTrigger.setAttribute("aria-expanded", "false");
}

function buildMergedModels(snapshot) {
  const allModels = [];

  function addModels(list, sourceTag) {
    if (!Array.isArray(list)) return;
    for (const m of list) {
      allModels.push({
        ...m,
        source: sourceTag,
        sourceModel: `${sourceTag}:${m.model}`,
        displayLabel: `[${sourceTag}] ${m.model}`
      });
    }
  }

  addModels(snapshot?.localTokenUsage?.modelUsage, "C");
  addModels(snapshot?.quota?.tokenStats?.modelUsage, "C");
  addModels(snapshot?.antigravityTokenUsage?.modelUsage, "A");

  const seen = new Set();
  return allModels.filter((m) => {
    if (seen.has(m.sourceModel)) return false;
    seen.add(m.sourceModel);
    return true;
  }).sort((a, b) => b.total - a.total);
}

function getTokenForModel(snapshot, modelKey) {
  if (modelKey === "all") return mergeAllTokens(snapshot);
  const [source, ...rest] = modelKey.split(":");
  const model = rest.join(":");
  if (source === "C") return getSourceModelData(snapshot?.localTokenUsage, snapshot?.quota?.tokenStats, model, "codex");
  if (source === "A") return getSourceModelData(snapshot?.antigravityTokenUsage, null, model, "antigravity");
  return mergeAllTokens(snapshot);
}

function getSourceModelData(primary, fallback, model, source) {
  const modelData = primary?.modelUsage?.find((m) => m.model === model)
    || fallback?.modelUsage?.find((m) => m.model === model);
  if (modelData) return { ...modelData, source, cacheHitRate: (modelData.cached === null || modelData.cached === undefined || modelData.input === 0) ? null : Math.round((modelData.cached / modelData.input) * 100) };
  return null;
}

function mergeAllTokens(snapshot) {
  let input = 0, cached = 0, output = 0, reasoning = 0, total = 0, hasData = false;
  let hitRateInput = 0;
  let hitRateCached = 0;

  function add(src, isAntigravity = false) {
    if (src?.total != null) {
      hasData = true;
      input += src.input || 0;
      cached += src.cached || 0;
      output += src.output || 0;
      reasoning += src.reasoning || 0;
      total += src.total || 0;

      // Exclude Antigravity from global hit rate calculation since it cannot analyze cache hit rate
      if (!isAntigravity && src.cached !== null && src.cached !== undefined) {
        hitRateInput += src.input || 0;
        hitRateCached += src.cached || 0;
      }
    }
  }

  const cs = snapshot?.quota?.tokenStats, cl = snapshot?.localTokenUsage;
  if (cs?.total != null) add(cs); else if (cl?.total != null) add(cl);
  add(snapshot?.antigravityTokenUsage, true);

  if (!hasData) return null;
  return {
    source: "merged",
    input,
    cached,
    output,
    reasoning,
    total,
    cacheHitRate: hitRateInput > 0 ? Math.round((hitRateCached / hitRateInput) * 100) : null,
    modelUsage: mergedModels,
    sessions: null
  };
}

function renderModelUsage(modelUsage) {
  const models = Array.isArray(modelUsage) ? modelUsage : [];
  elements.modelUsageList.replaceChildren();
  elements.modelUsageSummary.textContent = models.length ? t("modelCount", models.length) : "24h";
  if (!models.length) {
    const empty = document.createElement("span");
    empty.className = "model-empty";
    empty.textContent = t("noLocalData");
    elements.modelUsageList.append(empty);
    return;
  }
  for (const item of models) {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const total = document.createElement("b");
    name.textContent = item.model === "unknown" ? "未知模型（旧记录）" : item.model;
    total.textContent = formatToken(item.total);
    row.append(name, total);
    elements.modelUsageList.append(row);
  }
}

function renderWindow(prefix, quotaWindow, fallbackLabel) {
  const percent = quotaWindow?.remainingPercent;
  const tone = toneForPercent(percent);
  elements[`${prefix}Label`].textContent = quotaWindow?.label || fallbackLabel;
  elements[`${prefix}Value`].textContent = percent == null ? "--%" : `${percent}%`;
  elements[`${prefix}Reset`].textContent = quotaWindow?.resetsAt ? formatDateTime(quotaWindow.resetsAt) : t("waitingData");
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
  elements.shortRingArc.setAttribute("aria-label", `${t("shortLabel")} ${t("remaining")} ${short ?? "--"}%`);
  elements.longRingArc.setAttribute("aria-label", `${t("weekLabel")} ${t("remaining")} ${long ?? "--"}%`);
}

function renderResetCredits(resetCredits, resetCard) {
  if (Array.isArray(resetCredits?.credits)) {
    latestResetCredits = [...resetCredits.credits].sort(compareResetExpiry);
  }
  const availableCredits = latestResetCredits.filter((credit) => credit.status === "available");
  const availableCount = resetCredits?.availableCount ?? resetCard?.count ?? availableCredits.length;
  const nearest = (availableCredits.length ? availableCredits : latestResetCredits)[0];
  const expiresAt = nearest?.expiresAt ?? resetCard?.expiresAt;
  elements.resetCount.textContent = availableCount == null ? "--" : t("resetCount", availableCount);
  elements.resetExpiry.textContent = expiresAt ? formatDateTime(expiresAt) : t("expireUnknown");
}

function openResetDialog() {
  clearCardFocus();
  renderResetDialog();
  elements.resetDialog.classList.add("open");
  elements.resetDialog.setAttribute("aria-hidden", "false");
  elements.resetRow.setAttribute("aria-expanded", "true");
  elements.resetDialogClose.focus();
}

function closeResetDialog() {
  elements.resetDialog.classList.remove("open");
  elements.resetDialog.setAttribute("aria-hidden", "true");
  elements.resetRow.setAttribute("aria-expanded", "false");
}

function renderResetDialog() {
  const cards = [...latestResetCredits].sort(compareResetExpiry);
  const availableCount = cards.filter((card) => card.status === "available").length;
  elements.resetDialogList.replaceChildren();
  elements.resetDialogSummary.textContent = cards.length ? `${t("available")} ${availableCount} · ${t("resetCount", cards.length)}` : t("noResetCredits");
  if (!cards.length) {
    const empty = document.createElement("p");
    empty.className = "reset-dialog-empty";
    empty.textContent = t("noResetCredits");
    elements.resetDialogList.append(empty);
    return;
  }
  for (const card of cards) {
    const item = document.createElement("article");
    item.className = "reset-credit-item";
    const head = document.createElement("div");
    const title = document.createElement("strong");
    const status = document.createElement("span");
    title.textContent = card.title || t("resetCard");
    status.textContent = resetStatusLabel(card.status);
    status.className = `reset-credit-status ${card.status === "available" ? "available" : "inactive"}`;
    head.append(title, status);
    const detail = document.createElement("p");
    detail.textContent = `${t("grantedAt")}：${card.grantedAt ? formatDateTime(card.grantedAt) : t("unknownTime")}\n${t("expiresAt")}：${card.expiresAt ? formatDateTime(card.expiresAt) : t("expireUnknown")}`;
    item.append(head, detail);
    elements.resetDialogList.append(item);
  }
}

function compareResetExpiry(a, b) {
  return (a.expiresAt ?? Number.POSITIVE_INFINITY) - (b.expiresAt ?? Number.POSITIVE_INFINITY);
}

function resetStatusLabel(status) {
  if (status === "available") return t("available");
  if (status === "used") return t("used");
  if (status === "expired") return t("expired");
  return status || t("unknownStatus");
}

async function renderTokenStats(stats, modelUsage) {
  syncModelSelect(modelUsage);

  let displayStats = stats;
  let titleText = t("token24h");

  if (tokenRange === "cumulative") {
    titleText = "累计 Token";
    const modelArg = selectedModel === "all" ? "all" : selectedModel.split(":").slice(1).join(":");
    try {
      const cumStats = await window.aiQuota.readCumulativeTokens(modelArg);
      if (cumStats) {
        displayStats = {
          ...cumStats,
          source: selectedModel === "all" ? "merged" : (selectedModel.startsWith("A:") ? "antigravity" : "codex"),
          cacheHitRate: (cumStats.cached == null || cumStats.input === 0) ? null : Math.round((cumStats.cached / cumStats.input) * 100)
        };
      }
    } catch (e) {
      console.error(e);
    }
  } else {
    const selectedUsage = selectedModel === "all" ? null : modelUsage?.find((item) => (item.sourceModel || item.model) === selectedModel);
    if (selectedUsage) {
      displayStats = {
        ...stats,
        ...selectedUsage,
        source: "localModel",
        cacheHitRate: (selectedUsage.cached == null || selectedUsage.input === 0) ? null : Math.round((selectedUsage.cached / selectedUsage.input) * 100)
      };
    }
  }

  elements.tokenCardTitle.textContent = titleText;
  stats = displayStats;

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
  document.getElementById("inputLabel").textContent = t("tokenInput");
  document.getElementById("cachedLabel").textContent = t("tokenCache");
  document.getElementById("outputLabel").textContent = t("tokenOutput");
  elements.tokenCost.textContent = hasTokenData
    ? sourceLabel(stats)
    : stats?.error
      ? t("refreshFailed")
      : t("noData");
  if (hitRate == null) {
    elements.cacheHitRate.classList.add("text-label");
    elements.cacheHitRate.textContent = t("uncomputable");
  } else {
    elements.cacheHitRate.classList.remove("text-label");
    elements.cacheHitRate.textContent = `${hitRate}%`;
  }
  elements.hitDelta.textContent = hitRate == null
    ? t("noData")
    : hitRate >= 85
      ? t("hitExcellent")
      : hitRate >= 60
        ? t("hitGood")
        : hitRate >= 30
          ? t("hitNormal")
          : t("hitLow");
  elements.hitSummary.textContent = hitRate == null
    ? (stats?.error ? `account/usage/read: ${shortError(stats.error)}` : t("noData"))
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

async function renderHistory() {
  const modelForRender = selectedModel;
  let daily = {};
  let hourly = [];

  if (modelForRender === "all") {
    try {
      const [codexData, agData] = await Promise.allSettled([
        window.aiQuota.readTokenHistory("all"),
        window.aiQuota.readAntigravityHistory("all")
      ]);
      daily = mergeDailyMaps(
        codexData.status === "fulfilled" ? codexData.value.daily : {},
        agData.status === "fulfilled" ? agData.value.daily : {}
      );
      hourly = mergeHourlyBuckets(
        codexData.status === "fulfilled" ? codexData.value.hourly : [],
        agData.status === "fulfilled" ? agData.value.hourly : []
      );
    } catch {
      daily = {};
      hourly = [];
    }
  } else {
    // Single model — determine source
    const [source] = modelForRender.split(":");
    try {
      let historyData;
      if (source === "A") {
        historyData = await window.aiQuota.readAntigravityHistory(modelForRender.split(":").slice(1).join(":"));
      } else {
        // Codex
        historyData = await window.aiQuota.readTokenHistory(modelForRender.split(":").slice(1).join(":"));
      }
      daily = historyData.daily;
      hourly = historyData.hourly;
    } catch {
      daily = {};
      hourly = [];
    }
  }

  if (modelForRender !== selectedModel) return;
  renderTrendWithData(daily, hourly);
  renderHeatmapWithData(daily);
}

function mergeDailyMaps(...maps) {
  const result = {};
  for (const map of maps) {
    for (const [key, val] of Object.entries(map)) {
      if (!result[key]) result[key] = { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };
      result[key].input += val.input || 0;
      result[key].cached += val.cached || 0;
      result[key].output += val.output || 0;
      result[key].reasoning += val.reasoning || 0;
      result[key].total += val.total || 0;
    }
  }
  return result;
}

function mergeHourlyBuckets(...bucketArrays) {
  const maxLen = Math.max(...bucketArrays.map((a) => a.length), 0);
  if (maxLen === 0) return [];
  // Use the bucket array with the most entries as the base, or create new
  const base = bucketArrays.find((a) => a.length === maxLen) || [];
  const result = base.map((b) => ({ ...b }));
  for (const buckets of bucketArrays) {
    if (buckets === base) continue;
    for (let i = 0; i < Math.min(result.length, buckets.length); i++) {
      result[i].input += buckets[i].input || 0;
      result[i].cached += buckets[i].cached || 0;
      result[i].output += buckets[i].output || 0;
      result[i].reasoning += buckets[i].reasoning || 0;
      result[i].total += buckets[i].total || 0;
    }
  }
  return result;
}

function renderTrendWithData(daily, hourly) {
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
  elements.trend24Summary.textContent = recent.length ? `∑ ${formatToken(current24)}` : t("trend24Summary");
  elements.trend7Summary.textContent = `∑ ${formatToken(weekTotal)}`;
  elements.trendDelta.textContent = "24h / 7d";
  elements.trendTotal.textContent = `24h ${formatToken(current24)} · 7d ${formatToken(weekTotal)}`;
  elements.trendAverage.textContent = `7d avg ${formatToken(Math.round(weekTotal / 7))}`;
}

function renderHeatmapWithData(daily) {
  const today = new Date();
  const days = [];
  for (let i = 41; i >= 0; i--) {
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
    cell.dataset.day = String(day.d.getDate());
    cell.dataset.token = day.token == null ? "" : formatToken(day.token);
    cell.dataset.label = `${day.d.getMonth() + 1}/${day.d.getDate()}`;
    elements.hitHeatmap.append(cell);
  }

  const lastToken = tokenValues.at(-1);
  elements.hitTrendLabel.textContent = lastToken == null ? t("noData") : formatToken(lastToken);
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
  if (hitRate >= 85) return t("hitSummaryExcellent");
  if (hitRate >= 60) return t("hitSummaryGood");
  if (hitRate >= 30) return t("hitSummaryMid");
  return t("hitSummaryLow");
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
