"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function readLocalTokenUsage({ now = Date.now(), days = 1, root = defaultSessionsRoot() } = {}) {
  const since = now - days * 24 * 60 * 60 * 1000;
  const recent = readRecentUsageEvents({ since, root });
  const sessions = new Set(recent.events.map((event) => event.file));
  const usages = recent.events.length ? recent.events : recent.fallbacks;

  const totals = usages.reduce(
    (acc, item) => {
      acc.input += item.input;
      acc.cached += item.cached;
      acc.output += item.output;
      acc.reasoning += item.reasoning;
      acc.total += item.total || item.input + item.output + item.reasoning;
      return acc;
    },
    { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 }
  );
  const modelUsage = summarizeModelUsage(usages);

  if (!usages.length) {
    return {
      source: "localSessions",
      input: null,
      cached: null,
      output: null,
      reasoning: null,
      total: null,
      cacheHitRate: null,
      modelUsage: [],
      sessions: 0,
      error: "No local Codex session usage found"
    };
  }

  return {
    source: "localSessions",
    input: totals.input,
    cached: totals.cached,
    output: totals.output,
    reasoning: totals.reasoning,
    total: totals.total,
    cacheHitRate: Math.round((totals.cached / Math.max(1, totals.input)) * 100),
    modelUsage,
    sessions: sessions.size || recent.fallbacks.length,
    since
  };
}

function readDailyTokenHistory({ now = Date.now(), days = 30, root = defaultSessionsRoot(), model = "all" } = {}) {
  const since = now - days * 24 * 60 * 60 * 1000;
  const dailyMap = {};
  const recent = readRecentUsageEvents({ since, root });
  for (const event of recent.events.filter((event) => matchesModel(event, model))) {
    addUsage(dailyMap, localDateKey(event.t), event);
  }
  for (const fallback of recent.fallbacks.filter((fallback) => matchesModel(fallback, model))) {
    addUsage(dailyMap, localDateKey(fallback.t), fallback);
  }
  return dailyMap;
}

function readHourlyTokenHistory({ now = Date.now(), hours = 24, root = defaultSessionsRoot(), model = "all" } = {}) {
  const hourMs = 60 * 60 * 1000;
  const since = now - hours * hourMs;
  const currentHour = Math.floor(now / hourMs) * hourMs;
  const firstHour = Math.floor(since / hourMs) * hourMs;
  const bucketCount = Math.floor((currentHour - firstHour) / hourMs) + 1;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    t: firstHour + index * hourMs,
    input: 0,
    cached: 0,
    output: 0,
    reasoning: 0,
    total: 0
  }));
  const recent = readRecentUsageEvents({ since, root });
  for (const event of recent.events.filter((event) => matchesModel(event, model))) {
    const index = Math.floor((event.t - firstHour) / hourMs);
    if (index >= 0 && index < buckets.length) addUsageToBucket(buckets[index], event);
  }
  for (const fallback of recent.fallbacks.filter((fallback) => matchesModel(fallback, model))) {
    const index = Math.floor((fallback.t - firstHour) / hourMs);
    if (index >= 0 && index < buckets.length) addUsageToBucket(buckets[index], fallback);
  }
  return buckets;
}

function readRecentUsageEvents({ since, root }) {
  const files = listJsonlFiles(root)
    .map((file) => ({ file, mtimeMs: safeStat(file)?.mtimeMs ?? 0 }))
    .filter((item) => item.mtimeMs >= since);
  const events = [];
  const fallbacks = [];
  for (const { file, mtimeMs } of files) {
    const allFileEvents = readUsageEvents(file);
    if (allFileEvents.length) {
      for (const event of allFileEvents) {
        if (event.t >= since) events.push({ file, ...event });
      }
      continue;
    }
    const usage = readLatestUsage(file);
    if (usage) fallbacks.push({ file, t: mtimeMs, model: "unknown", ...usage });
  }
  return { events, fallbacks };
}

function matchesModel(usage, model) {
  return model === "all" || (usage.model ?? "unknown") === model;
}

function readUsageEvents(file) {
  const events = [];
  let currentModel = null;
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      currentModel = readModelName(item) ?? currentModel;
      const timestamp = Date.parse(item?.timestamp);
      const usage = item?.payload?.info?.last_token_usage;
      if (Number.isFinite(timestamp) && usage) {
        events.push({ t: timestamp, model: currentModel ?? "unknown", ...normalizeUsage(usage) });
      }
    } catch {
      // Ignore partial or non-JSON lines.
    }
  }
  return events;
}

function summarizeModelUsage(usages) {
  const models = new Map();
  for (const usage of usages) {
    const model = usage.model || "unknown";
    if (!models.has(model)) {
      models.set(model, { model, input: 0, cached: 0, output: 0, reasoning: 0, total: 0 });
    }
    addUsageToBucket(models.get(model), usage);
  }
  return [...models.values()].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model));
}

function readModelName(item) {
  const model = item?.payload?.model ?? item?.payload?.info?.model ?? item?.payload?.collaboration_mode?.settings?.model;
  return typeof model === "string" && model.trim() ? model.trim() : null;
}

function addUsage(map, key, usage) {
  if (!map[key]) map[key] = { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };
  addUsageToBucket(map[key], usage);
}

function addUsageToBucket(bucket, usage) {
  bucket.input += usage.input;
  bucket.cached += usage.cached;
  bucket.output += usage.output;
  bucket.reasoning += usage.reasoning || 0;
  bucket.total += usage.total || usage.input + usage.output + (usage.reasoning || 0);
}

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readLatestUsage(file) {
  let latest = null;
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const item = JSON.parse(line);
      const usage = item?.payload?.info?.total_token_usage ?? item?.payload?.info?.last_token_usage;
      if (usage) {
        latest = normalizeUsage(usage);
      }
    } catch {
      // Ignore partial or non-JSON lines.
    }
  }
  return latest;
}

function normalizeUsage(usage) {
  const input = readNumber(usage.input_tokens, 0);
  const cached = readNumber(usage.cached_input_tokens, 0);
  const output = readNumber(usage.output_tokens, 0);
  const reasoning = readNumber(usage.reasoning_output_tokens, 0);
  const total = readNumber(usage.total_tokens, input + cached + output + reasoning);
  return { input, cached, output, reasoning, total };
}

function listJsonlFiles(root) {
  const result = [];
  const roots = (Array.isArray(root) ? root : [root]).filter((item) => item && fs.existsSync(item));
  const stack = [...roots];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(file);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        result.push(file);
      }
    }
  }
  return result;
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function readNumber(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function readTokenHistory({ now = Date.now(), days = 45, hours = 24, root = defaultSessionsRoot(), model = "all" } = {}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const dailySince = now - days * dayMs;
  const hourlySince = now - hours * hourMs;
  const recent = readRecentUsageEvents({ since: dailySince, root });

  const dailyMap = {};
  for (const event of recent.events.filter((event) => matchesModel(event, model))) {
    addUsage(dailyMap, localDateKey(event.t), event);
  }
  for (const fallback of recent.fallbacks.filter((fallback) => matchesModel(fallback, model))) {
    addUsage(dailyMap, localDateKey(fallback.t), fallback);
  }

  const currentHour = Math.floor(now / hourMs) * hourMs;
  const firstHour = Math.floor(hourlySince / hourMs) * hourMs;
  const bucketCount = Math.floor((currentHour - firstHour) / hourMs) + 1;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    t: firstHour + index * hourMs,
    input: 0,
    cached: 0,
    output: 0,
    reasoning: 0,
    total: 0
  }));

  for (const event of recent.events) {
    if (event.t >= hourlySince && matchesModel(event, model)) {
      const index = Math.floor((event.t - firstHour) / hourMs);
      if (index >= 0 && index < buckets.length) addUsageToBucket(buckets[index], event);
    }
  }
  for (const fallback of recent.fallbacks) {
    if (fallback.t >= hourlySince && matchesModel(fallback, model)) {
      const index = Math.floor((fallback.t - firstHour) / hourMs);
      if (index >= 0 && index < buckets.length) addUsageToBucket(buckets[index], fallback);
    }
  }

  return { daily: dailyMap, hourly: buckets };
}

function defaultSessionsRoot() {
  return [
    path.join(os.homedir(), ".codex", "sessions"),
    path.join(os.homedir(), ".codex", "archived_sessions")
  ];
}

module.exports = {
  readLocalTokenUsage,
  readLatestUsage,
  readUsageEvents,
  normalizeUsage,
  readDailyTokenHistory,
  readHourlyTokenHistory,
  readTokenHistory
};
