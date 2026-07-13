"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Bump this whenever the parsed event format or parsing rules change.
const CACHE_VERSION = 4;
const SWEEP_INTERVAL_MS = 5 * 60_000;

function getCachePath() {
  if (process.env.HISTORY_ACCUMULATOR_PATH) {
    return process.env.HISTORY_ACCUMULATOR_PATH;
  }

  const userDataPath = process.env.AI_QUOTA_USER_DATA_PATH;
  if (userDataPath) {
    return path.join(userDataPath, "history_accumulator.json");
  }

  // Fallback for direct Node usage outside the Electron main process.
  return path.join(os.homedir(), ".gemini", "antigravity", "history_accumulator.json");
}

function emptyCache() {
  return { version: CACHE_VERSION, namespaces: {} };
}

function loadCache() {
  const cachePath = getCachePath();
  try {
    if (!fs.existsSync(cachePath)) return emptyCache();

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (cache?.version === CACHE_VERSION && cache.namespaces && typeof cache.namespaces === "object") {
      return cache;
    }
    console.warn("Ignoring incompatible history accumulator cache");
  } catch (error) {
    console.error("Failed to load history accumulator cache", error);
  }
  return emptyCache();
}

function saveCache(cache) {
  const cachePath = getCachePath();
  const dir = path.dirname(cachePath);
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(cache), "utf8");
    fs.renameSync(temporaryPath, cachePath);
  } catch (error) {
    console.error("Failed to save history accumulator cache", error);
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Ignore failed temporary-file cleanup.
    }
  }
}

function getNamespace(cache, namespace) {
  const existing = cache.namespaces[namespace];
  if (existing?.files && typeof existing.files === "object") {
    return existing;
  }

  const state = { files: {}, lastSweepAt: 0 };
  cache.namespaces[namespace] = state;
  return state;
}

function sweepDeletedFiles(state) {
  for (const cachedFile of Object.keys(state.files)) {
    if (!fs.existsSync(cachedFile)) {
      delete state.files[cachedFile];
    }
  }
  state.lastSweepAt = Date.now();
  return true;
}

function scanFilesIncrementally(filePaths, parseFile, { namespace = "default" } = {}) {
  const cache = loadCache();
  const state = getNamespace(cache, namespace);
  let dirty = false;

  for (const filePath of filePaths) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    const { mtimeMs, size } = stat;
    const cachedItem = state.files[filePath];
    if (cachedItem && cachedItem.mtimeMs === mtimeMs && cachedItem.size === size) {
      continue;
    }

    try {
      state.files[filePath] = { mtimeMs, size, data: parseFile(filePath) };
      dirty = true;
    } catch (error) {
      console.error(`Failed to parse file: ${filePath}`, error);
      // A changed file must never silently fall back to an older parsed result.
      if (cachedItem) {
        delete state.files[filePath];
        dirty = true;
      }
    }
  }

  const now = Date.now();
  if (!filePaths.length || now - (state.lastSweepAt || 0) >= SWEEP_INTERVAL_MS) {
    dirty = sweepDeletedFiles(state) || dirty;
  }

  if (dirty) saveCache(cache);

  const result = {};
  for (const filePath of filePaths) {
    const cachedItem = state.files[filePath];
    if (cachedItem) result[filePath] = cachedItem.data;
  }
  return result;
}

module.exports = {
  CACHE_VERSION,
  scanFilesIncrementally,
  getCachePath
};
