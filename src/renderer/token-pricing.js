"use strict";

(function exposeTokenPricing(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TokenPricing = api;
})(typeof globalThis === "object" ? globalThis : null, () => {
  const MILLION = 1_000_000;

  // Standard text API prices in USD per 1M tokens, updated 2026-07-18.
  // Request-level surcharges (long context, regional routing, tools and cache
  // storage) cannot be inferred from local session logs and are not included.
  const MODEL_PRICES = [
    price("GPT-5.6 Sol", /^gpt-5\.6(?:-sol)?(?:-\d{4}-\d{2}-\d{2})?$/, 5, 0.5, 30),
    price("GPT-5.6 Terra", /^gpt-5\.6-terra(?:-\d{4}-\d{2}-\d{2})?$/, 2.5, 0.25, 15),
    price("GPT-5.6 Luna", /^gpt-5\.6-luna(?:-\d{4}-\d{2}-\d{2})?$/, 1, 0.1, 6),
    price("GPT-5.5 Pro", /^gpt-5\.5-pro(?:-\d{4}-\d{2}-\d{2})?$/, 30, 30, 180),
    price("GPT-5.5", /^gpt-5\.5(?:-\d{4}-\d{2}-\d{2})?$/, 5, 0.5, 30),
    price("GPT-5.4 Pro", /^gpt-5\.4-pro(?:-\d{4}-\d{2}-\d{2})?$/, 30, 30, 180),
    price("GPT-5.4 mini", /^gpt-5\.4-mini(?:-\d{4}-\d{2}-\d{2})?$/, 0.75, 0.075, 4.5),
    price("GPT-5.4 nano", /^gpt-5\.4-nano(?:-\d{4}-\d{2}-\d{2})?$/, 0.2, 0.02, 1.25),
    price("GPT-5.4", /^gpt-5\.4(?:-\d{4}-\d{2}-\d{2})?$/, 2.5, 0.25, 15),
    price("GPT-5.3 Codex", /^gpt-5\.3-(?:codex|chat-latest)$/, 1.75, 0.175, 14),
    price("GPT-5.2", /^gpt-5\.2(?:-codex|-chat-latest)?$/, 1.75, 0.175, 14),
    price("GPT-5.1 Codex mini", /^gpt-5\.1-codex-mini$/, 0.25, 0.025, 2),
    price("GPT-5.1", /^gpt-5\.1(?:-codex(?:-max)?|-chat-latest)?$/, 1.25, 0.125, 10),
    price("Codex mini", /^codex-mini-latest$/, 1.5, 0.375, 6),
    price("GPT-5 mini", /^gpt-5-mini(?:-\d{4}-\d{2}-\d{2})?$/, 0.25, 0.025, 2),
    price("GPT-5 nano", /^gpt-5-nano(?:-\d{4}-\d{2}-\d{2})?$/, 0.05, 0.005, 0.4),
    price("GPT-5", /^gpt-5(?:-codex|-chat-latest|-\d{4}-\d{2}-\d{2})?$/, 1.25, 0.125, 10),
    price("GPT-4.1 mini", /^gpt-4\.1-mini(?:-\d{4}-\d{2}-\d{2})?$/, 0.4, 0.1, 1.6),
    price("GPT-4.1 nano", /^gpt-4\.1-nano(?:-\d{4}-\d{2}-\d{2})?$/, 0.1, 0.025, 0.4),
    price("GPT-4.1", /^gpt-4\.1(?:-\d{4}-\d{2}-\d{2})?$/, 2, 0.5, 8),
    price("GPT-4o mini", /^gpt-4o-mini(?:-\d{4}-\d{2}-\d{2})?$/, 0.15, 0.075, 0.6),
    price("GPT-4o", /^gpt-4o(?:-\d{4}-\d{2}-\d{2})?$/, 2.5, 1.25, 10),

    price("Claude Fable 5", /claude-fable-5(?:\b|-)/, 10, 1, 50),
    price("Claude Mythos 5", /claude-mythos(?:-preview)?-5(?:\b|-)/, 10, 1, 50),
    price("Claude Opus 4.5+", /claude-opus-4[-.](?:5|6|7|8)(?:\b|-)/, 5, 0.5, 25),
    price("Claude Opus 4\/4.1", /claude-opus-4(?:[-.]1)?(?:\b|-)/, 15, 1.5, 75),
    price("Claude Sonnet 5", /claude-sonnet-5(?:\b|-)/, 2, 0.2, 10),
    price("Claude Sonnet 4.x", /claude-sonnet-4(?:[-.][0-9])?(?:\b|-)/, 3, 0.3, 15),
    price("Claude Haiku 4.5", /claude-haiku-4[-.]5(?:\b|-)/, 1, 0.1, 5),
    price("Claude 3.5 Sonnet", /claude-(?:3[-.]5-sonnet|sonnet-3[-.]5)(?:\b|-)/, 3, 0.3, 15),
    price("Claude 3.5 Haiku", /claude-(?:3[-.]5-haiku|haiku-3[-.]5)(?:\b|-)/, 0.8, 0.08, 4),
    price("Claude 3 Opus", /claude-(?:3-opus|opus-3)(?:\b|-)/, 15, 1.5, 75),
    price("Claude 3 Haiku", /claude-(?:3-haiku|haiku-3)(?:\b|-)/, 0.25, 0.03, 1.25),

    price("Gemini 3.5 Flash", /gemini-3[-.]5-flash(?:\b|-)/, 1.5, 0.15, 9),
    price("Gemini 3.1 Pro", /gemini-3[-.]1-pro(?:-preview)?(?:\b|-)/, 2, 0.2, 12),
    price("Gemini 3.1 Flash-Lite", /gemini-3[-.]1-flash-lite(?:\b|-)/, 0.25, 0.025, 1.5),
    price("Gemini 3 Flash", /gemini-3-flash(?:-preview)?(?:\b|-)/, 0.5, 0.05, 3),
    price("Gemini 2.5 Pro", /gemini-2[-.]5-pro(?:\b|-)/, 1.25, 0.125, 10),
    price("Gemini 2.5 Flash-Lite", /gemini-2[-.]5-flash-lite(?:\b|-)/, 0.1, 0.01, 0.4),
    price("Gemini 2.5 Flash", /gemini-2[-.]5-flash(?:\b|-)/, 0.3, 0.03, 2.5),

    price("DeepSeek V4 Pro", /deepseek-v4-pro(?:\b|-)/, 0.435, 0.003625, 0.87),
    price("DeepSeek V4 Flash", /deepseek-v4-flash(?:\b|-)/, 0.14, 0.0028, 0.28)
  ];

  function price(label, pattern, input, cached, output) {
    const cacheWrite = /^(?:Claude|GPT-5\.6)/.test(label) ? input * 1.25 : input;
    return Object.freeze({ label, pattern, input, cached, cacheWrite, output });
  }

  function normalizeModelName(model) {
    return String(model || "")
      .trim()
      .toLowerCase()
      .replace(/^models\//, "")
      .replace(/^anthropic[.:/]/, "")
      .replace(/[_\s]+/g, "-");
  }

  function findModelPrice(model) {
    const normalized = normalizeModelName(model);
    if (!normalized || normalized === "unknown") return null;
    return MODEL_PRICES.find((item) => item.pattern.test(normalized)) || null;
  }

  function estimateUsageCost(usage, model = usage?.model) {
    const modelPrice = findModelPrice(model);
    if (!modelPrice) return null;

    const input = tokenNumber(usage?.input);
    const cached = Math.min(input, tokenNumber(usage?.cached));
    const cacheWrite = Math.min(Math.max(0, input - cached), tokenNumber(usage?.cacheWrite));
    const uncached = Math.max(0, input - cached - cacheWrite);
    const reasoning = usage?.source === "antigravity" ? tokenNumber(usage?.reasoning) : 0;
    const output = tokenNumber(usage?.output) + reasoning;
    const usd = (
      uncached * modelPrice.input
      + cached * modelPrice.cached
      + cacheWrite * modelPrice.cacheWrite
      + output * modelPrice.output
    ) / MILLION;

    return {
      usd,
      model: modelPrice.label,
      input,
      cached,
      cacheWrite,
      output,
      tokens: input + output
    };
  }

  function estimateTokenCost(stats, fallbackModel = stats?.model) {
    if (!stats) return emptyEstimate();
    const items = Array.isArray(stats.modelUsage) && stats.modelUsage.length
      ? stats.modelUsage
      : [{ ...stats, model: fallbackModel }];
    const result = emptyEstimate();

    for (const item of items) {
      const model = item?.model || fallbackModel || "unknown";
      const cost = estimateUsageCost(item, model);
      const tokens = usageTokenCount(item);
      result.totalTokens += tokens;
      if (!cost) {
        if (tokens > 0 && !result.unknownModels.includes(model)) result.unknownModels.push(model);
        continue;
      }
      result.usd += cost.usd;
      result.pricedTokens += tokens;
      result.pricedModels += 1;
    }

    result.complete = result.pricedModels > 0 && result.unknownModels.length === 0;
    return result;
  }

  function emptyEstimate() {
    return { usd: 0, pricedModels: 0, pricedTokens: 0, totalTokens: 0, unknownModels: [], complete: false };
  }

  function usageTokenCount(usage) {
    const input = tokenNumber(usage?.input);
    const output = tokenNumber(usage?.output);
    const reasoning = usage?.source === "antigravity" ? tokenNumber(usage?.reasoning) : 0;
    return input + output + reasoning;
  }

  function tokenNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function formatUsd(value) {
    if (!Number.isFinite(value) || value < 0) return "--";
    if (value === 0) return "$0.00";
    if (value < 0.0001) return "<$0.0001";
    const digits = value < 0.01 ? 4 : value < 1 ? 3 : 2;
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }

  return Object.freeze({ findModelPrice, estimateUsageCost, estimateTokenCost, formatUsd });
});
