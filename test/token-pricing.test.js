"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findModelPrice,
  estimateUsageCost,
  estimateTokenCost,
  formatUsd
} = require("../src/renderer/token-pricing");

test("calculates uncached input, cached input and output with the model's rates", () => {
  const result = estimateUsageCost({ input: 1_000_000, cached: 600_000, output: 100_000 }, "gpt-5.6-terra");
  assert.equal(result.usd, 2.65);
});

test("uses the cache-write rate when session logs expose cache creation tokens", () => {
  const result = estimateUsageCost({ input: 1_000_000, cached: 0, cacheWrite: 400_000, output: 0 }, "claude-sonnet-4-6");
  assert.equal(result.usd, 3.3);
});

test("matches provider model IDs and friendly Antigravity names", () => {
  assert.equal(findModelPrice("gpt-5.6-sol").label, "GPT-5.6 Sol");
  assert.equal(findModelPrice("gpt-5.1-codex-mini").input, 0.25);
  assert.equal(findModelPrice("Claude Sonnet 4.6 (Thinking)").label, "Claude Sonnet 4.x");
  assert.equal(findModelPrice("deepseek-v4-pro").cached, 0.003625);
});

test("adds per-model values and reports an honest partial estimate", () => {
  const result = estimateTokenCost({
    modelUsage: [
      { model: "gpt-5.6-luna", input: 1_000_000, cached: 0, output: 0 },
      { model: "private-model", input: 500_000, cached: 0, output: 0 }
    ]
  });
  assert.equal(result.usd, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.unknownModels, ["private-model"]);
});

test("bills separately estimated Antigravity reasoning as output", () => {
  const result = estimateUsageCost({
    source: "antigravity",
    input: 0,
    output: 100_000,
    reasoning: 50_000
  }, "gemini-3.5-flash");
  assert.equal(result.usd, 1.35);
});

test("formats small and regular USD values without hiding non-zero usage", () => {
  assert.equal(formatUsd(12.345), "$12.35");
  assert.equal(formatUsd(0.00421), "$0.0042");
  assert.equal(formatUsd(0.00001), "<$0.0001");
});
