"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { scanFilesIncrementally } = require("./incremental-scan-engine");

function readLocalTokenUsage({ now = Date.now(), days = 1, root = defaultSessionsRoot(), sources = null } = {}) {
  const since = now - days * 24 * 60 * 60 * 1000;
  const recent = readRecentUsageEvents({ since, root });
  const sessions = new Set(recent.events.map((event) => event.file));
  const eventFiles = new Set(recent.events.map((usage) => usage.file));
  const allUsages = [
    ...recent.events,
    ...recent.fallbacks.filter((usage) => !eventFiles.has(usage.file))
  ];
  const usages = Array.isArray(sources)
    ? allUsages.filter((usage) => sources.includes(usage.source))
    : allUsages;

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
      sessions: new Set(usages.map((usage) => usage.file)).size || sessions.size,
    since
  };
}

function readDailyTokenHistory({ now = Date.now(), days = 30, root = defaultSessionsRoot(), model = "all", source = null } = {}) {
  const since = now - days * 24 * 60 * 60 * 1000;
  const dailyMap = {};
  const recent = readRecentUsageEvents({ since, root });
  for (const event of recent.events.filter((event) => matchesModel(event, model, source))) {
    addUsage(dailyMap, localDateKey(event.t), event);
  }
  for (const fallback of recent.fallbacks.filter((fallback) => matchesModel(fallback, model, source))) {
    addUsage(dailyMap, localDateKey(fallback.t), fallback);
  }
  return dailyMap;
}

function readHourlyTokenHistory({ now = Date.now(), hours = 24, root = defaultSessionsRoot(), model = "all", source = null } = {}) {
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
  for (const event of recent.events.filter((event) => matchesModel(event, model, source))) {
    const index = Math.floor((event.t - firstHour) / hourMs);
    if (index >= 0 && index < buckets.length) addUsageToBucket(buckets[index], event);
  }
  for (const fallback of recent.fallbacks.filter((fallback) => matchesModel(fallback, model, source))) {
    const index = Math.floor((fallback.t - firstHour) / hourMs);
    if (index >= 0 && index < buckets.length) addUsageToBucket(buckets[index], fallback);
  }
  return buckets;
}

function readRecentUsageEvents({ since, root }) {
  const fileEntries = listJsonlFiles(root);
  const filePaths = fileEntries.map(({ file }) => file);
  const sourceByFile = new Map(fileEntries.map(({ file, source }) => [file, source]));
  const allParsedData = scanFilesIncrementally(filePaths, (file) => {
    const allFileEvents = readUsageEvents(file, sourceByFile.get(file));
    let fallback = null;
    if (!allFileEvents.length) {
      fallback = readLatestUsage(file);
    }
    return { events: allFileEvents, fallback };
  }, { namespace: "codex-and-claude" });

  const events = [];
  const fallbacks = [];

  for (const [file, data] of Object.entries(allParsedData)) {
    if (data.events && data.events.length) {
      for (const ev of data.events) {
        if (ev.t >= since) {
          events.push({ file, ...ev });
        }
      }
    } else if (data.fallback) {
      const stat = safeStat(file);
      const mtimeMs = stat?.mtimeMs ?? 0;
      if (mtimeMs >= since) {
        const source = sourceByFile.get(file);
        fallbacks.push({ file, t: mtimeMs, model: "unknown", ...(source ? { source } : {}), ...data.fallback });
      }
    }
  }

  return { events, fallbacks };
}

function matchesModel(usage, model, source = null) {
  const modelMatches = model === "all" || (usage.model ?? "unknown") === model;
  const sourceMatches = !source || source === "all" || usage.source === source;
  return modelMatches && sourceMatches;
}

function readUsageEvents(file, source = null) {
  const events = [];
  let currentModel = null;
  const content = fs.readFileSync(file, "utf8");
  const seenMessageIds = new Set();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      currentModel = readModelName(item) ?? currentModel;
      const timestamp = Date.parse(item?.timestamp);
      const usage = item?.payload?.info?.last_token_usage ?? item?.message?.usage;
      const messageId = item?.message?.id;
      if (Number.isFinite(timestamp) && usage) {
        if (messageId) {
          if (seenMessageIds.has(messageId)) continue;
          seenMessageIds.add(messageId);
        }
        events.push({ t: timestamp, model: currentModel ?? "unknown", ...(source ? { source } : {}), ...normalizeUsage(usage) });
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
    const source = usage.source || "";
    const key = `${source}\u0000${model}`;
    if (!models.has(key)) {
      models.set(key, { model, ...(source ? { source } : {}), input: 0, cached: 0, output: 0, reasoning: 0, total: 0 });
    }
    addUsageToBucket(models.get(key), usage);
  }
  return [...models.values()].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model));
}

function readModelName(item) {
  const model = item?.message?.model ?? item?.payload?.model ?? item?.payload?.info?.model ?? item?.payload?.collaboration_mode?.settings?.model;
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
      const usage = item?.payload?.info?.total_token_usage ?? item?.payload?.info?.last_token_usage ?? item?.message?.usage;
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
  const cached = readNumber(usage.cached_input_tokens ?? usage.cache_read_input_tokens, 0);
  let input = readNumber(usage.input_tokens, 0);
  if (usage.cache_read_input_tokens !== undefined || usage.cacheReadInputTokens !== undefined) {
    input = input + cached;
  }
  const output = readNumber(usage.output_tokens, 0);
  const reasoning = readNumber(usage.reasoning_output_tokens, 0);
  const total = readNumber(usage.total_tokens, input + output + reasoning);
  return { input, cached, output, reasoning, total };
}

function listJsonlFiles(root) {
  const result = [];
  const roots = (Array.isArray(root) ? root : [root])
    .filter((item) => item && fs.existsSync(item))
    .map((item) => ({ path: item, source: sourceForRoot(item) }));
  const stack = [...roots];
  while (stack.length) {
    const { path: dir, source } = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push({ path: file, source });
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        result.push({ file, source });
      }
    }
  }
  return result;
}

function sourceForRoot(root) {
  const normalized = path.normalize(root).toLowerCase();
  if (normalized.includes(path.normalize(path.join(".claude", "projects")).toLowerCase())) return "claude";
  if (normalized.includes(path.normalize(".codex").toLowerCase())) return "codex";
  return null;
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

function readTokenHistory({ now = Date.now(), days = 45, hours = 24, root = defaultSessionsRoot(), model = "all", source = null } = {}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const dailySince = now - days * dayMs;
  const hourlySince = now - hours * hourMs;
  const recent = readRecentUsageEvents({ since: dailySince, root });

  const dailyMap = {};
  for (const event of recent.events.filter((event) => matchesModel(event, model, source))) {
    addUsage(dailyMap, localDateKey(event.t), event);
  }
  for (const fallback of recent.fallbacks.filter((fallback) => matchesModel(fallback, model, source))) {
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
    if (event.t >= hourlySince && matchesModel(event, model, source)) {
      const index = Math.floor((event.t - firstHour) / hourMs);
      if (index >= 0 && index < buckets.length) addUsageToBucket(buckets[index], event);
    }
  }
  for (const fallback of recent.fallbacks) {
    if (fallback.t >= hourlySince && matchesModel(fallback, model, source)) {
      const index = Math.floor((fallback.t - firstHour) / hourMs);
      if (index >= 0 && index < buckets.length) addUsageToBucket(buckets[index], fallback);
    }
  }

  return { daily: dailyMap, hourly: buckets };
}

function defaultSessionsRoot() {
  return [
    path.join(os.homedir(), ".codex", "sessions"),
    path.join(os.homedir(), ".codex", "archived_sessions"),
    path.join(os.homedir(), ".claude", "projects")
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
