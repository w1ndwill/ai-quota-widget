"use strict";

const { parentPort } = require("node:worker_threads");
const {
  readLocalTokenUsage,
  readTokenHistory
} = require("./token-usage-service");
const {
  readLocalTokenUsage: readAntigravityUsage,
  readTokenHistory: readAntigravityHistory
} = require("./antigravity-token-service");

function readUsageWithModelCatalog(reader, payload = {}) {
  const usage = reader(payload);
  const catalog = reader({ ...payload, days: 45 });
  return { ...usage, modelCatalog: catalog.modelUsage || [] };
}

function parseSelection(selection = "all") {
  if (selection === "all") return { source: null, model: "all" };
  if (selection.startsWith("source:")) return { source: selection.slice("source:".length), model: "all" };
  const separator = selection.indexOf(":");
  if (separator > 0) {
    return { source: selection.slice(0, separator), model: selection.slice(separator + 1) || "all" };
  }
  return { source: null, model: selection };
}

function readCumulative({ selection = "all", model, source = null, enableCodex = true, enableClaudeCode = true, enableAntigravity = true }) {
  const selected = selection !== "all" || model == null
    ? parseSelection(selection)
    : { model, source };
  const sum = { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };
  let cacheInput = 0;
  let cacheKnown = false;
  const addHistory = (history, hasCacheData) => {
    for (const value of Object.values(history.daily)) {
      sum.input += value.input || 0;
      sum.output += value.output || 0;
      sum.reasoning += value.reasoning || 0;
      sum.total += value.total || 0;
      if (hasCacheData) {
        cacheKnown = true;
        cacheInput += value.input || 0;
        sum.cached += value.cached || 0;
      }
    }
  };

  const wantsAntigravity = !selected.source || selected.source === "antigravity";
  const wantsCodex = !selected.source || selected.source === "codex";
  const wantsClaude = !selected.source || selected.source === "claude";
  if (enableCodex && wantsCodex) addHistory(readTokenHistory({ model: selected.model, source: "codex", days: 9999 }), true);
  if (enableClaudeCode && wantsClaude) addHistory(readTokenHistory({ model: selected.model, source: "claude", days: 9999 }), true);
  if (enableAntigravity && wantsAntigravity) addHistory(readAntigravityHistory({ model: selected.model, days: 9999 }), false);
  return {
    ...sum,
    cached: cacheKnown ? sum.cached : null,
    cacheHitRate: cacheKnown && cacheInput > 0 ? Math.round((sum.cached / cacheInput) * 100) : null
  };
}

function execute(operation, payload = {}) {
  switch (operation) {
    case "codexUsage":
      return readUsageWithModelCatalog(readLocalTokenUsage, payload);
    case "antigravityUsage":
      return readUsageWithModelCatalog(readAntigravityUsage);
    case "codexHistory":
      return readTokenHistory(payload);
    case "antigravityHistory":
      return readAntigravityHistory(payload);
    case "cumulative":
      return readCumulative(payload);
    default:
      throw new Error(`Unknown usage worker operation: ${operation}`);
  }
}

parentPort.on("message", ({ id, operation, payload }) => {
  try {
    parentPort.postMessage({ id, result: execute(operation, payload) });
  } catch (error) {
    parentPort.postMessage({ id, error: error?.message || String(error) });
  }
});
