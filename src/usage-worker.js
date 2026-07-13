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

function readCumulative({ model = "all", enableClaudeCode = true, enableAntigravity = true }) {
  const sum = { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };
  const addHistory = (history) => {
    for (const value of Object.values(history.daily)) {
      sum.input += value.input || 0;
      sum.cached += value.cached || 0;
      sum.output += value.output || 0;
      sum.reasoning += value.reasoning || 0;
      sum.total += value.total || 0;
    }
  };

  if (enableClaudeCode) addHistory(readTokenHistory({ model, days: 9999 }));
  if (enableAntigravity) addHistory(readAntigravityHistory({ model, days: 9999 }));
  return sum;
}

function execute(operation, payload = {}) {
  switch (operation) {
    case "codexUsage":
      return readLocalTokenUsage();
    case "antigravityUsage":
      return readAntigravityUsage();
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
