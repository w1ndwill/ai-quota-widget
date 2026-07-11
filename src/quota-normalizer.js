"use strict";

function normalizeCodexQuota(response) {
  const snapshot = response?.rateLimitsByLimitId?.codex ?? response?.rateLimits;
  if (!snapshot) {
    return null;
  }

  const shortWindow = normalizeWindow(snapshot.primary, "5小时");
  const longWindow = normalizeWindow(snapshot.secondary, "周限额");
  const quotaCard = normalizeQuotaCard(snapshot, shortWindow, longWindow);
  const resetCard = normalizeResetCard(snapshot, quotaCard);
  const tokenStats = normalizeTokenStats(snapshot, response?.accountUsage, shortWindow, longWindow, response?.usageError);

  return {
    shortWindow,
    longWindow,
    quotaCard,
    resetCard,
    tokenStats,
    accountUsage: response?.accountUsage ?? null,
    usageError: response?.usageError ?? null,
    credits: snapshot.credits ?? null,
    planType: snapshot.planType ?? null,
    rawLimitName: snapshot.limitName ?? snapshot.limitId ?? null
  };
}

function normalizeWindow(window, fallbackLabel) {
  if (!window) {
    return null;
  }

  const usedPercent = clamp(window.usedPercent);
  return {
    label: labelForDuration(window.windowDurationMins, fallbackLabel),
    usedPercent,
    remainingPercent: clamp(100 - usedPercent),
    resetsAt: normalizeTimestamp(window.resetsAt),
    tokenLimit: readNumber(firstValue(window.tokenLimit, window.limit, window.maxTokens), null),
    tokensUsed: readNumber(firstValue(window.tokensUsed, window.used, window.usedTokens), null)
  };
}

function normalizeQuotaCard(snapshot, shortWindow, longWindow) {
  const individual = snapshot.individualLimit;
  if (individual) {
    const remainingPercent = clamp(readNumber(individual.remainingPercent, 0));
    return {
      title: snapshot.limitName ?? "Codex 额度卡",
      limit: readNumber(individual.limit, individual.limit ?? null),
      used: readNumber(individual.used, individual.used ?? null),
      remainingPercent,
      usedPercent: clamp(100 - remainingPercent),
      expiresAt: normalizeTimestamp(individual.resetsAt),
      source: "individualLimit"
    };
  }

  const expiry = firstTimestamp(snapshot.expiresAt, snapshot.expiry, snapshot.expires_at);
  if (expiry) {
    return {
      title: snapshot.limitName ?? "Codex 额度卡",
      limit: null,
      used: null,
      remainingPercent: null,
      usedPercent: null,
      expiresAt: expiry,
      source: "snapshot"
    };
  }

  const fallbackWindow = longWindow ?? shortWindow;
  if (!fallbackWindow) {
    return null;
  }

  return {
    title: "Codex 额度卡",
    limit: null,
    used: null,
    remainingPercent: fallbackWindow.remainingPercent,
    usedPercent: fallbackWindow.usedPercent,
    expiresAt: fallbackWindow.resetsAt,
    source: fallbackWindow === longWindow ? "secondary" : "primary"
  };
}

function normalizeResetCard(snapshot, quotaCard) {
  const credits = snapshot.credits;
  const countValue = firstValue(
    snapshot.resetCount,
    snapshot.resetsRemaining,
    snapshot.resetCredits,
    snapshot.reset_card_count,
    credits?.remaining,
    credits?.balance
  );
  const expiresAt = firstTimestamp(
    credits?.expiresAt,
    credits?.expires_at,
    credits?.resetsAt,
    credits?.resetAt,
    snapshot.resetCardExpiresAt,
    snapshot.resetExpiresAt,
    quotaCard?.expiresAt
  );

  if (!credits && countValue == null && !expiresAt) {
    return null;
  }

  return {
    hasCredits: credits?.hasCredits ?? countValue != null,
    unlimited: Boolean(credits?.unlimited),
    count: readNumber(countValue, null),
    countLabel: credits?.unlimited ? "无限" : countValue == null ? "--" : String(countValue),
    expiresAt,
    source: credits ? "credits" : "snapshot"
  };
}

function normalizeTokenStats(snapshot, accountUsage, shortWindow, longWindow, usageError) {
  const tokenUsage = firstValue(
    accountUsage,
    accountUsage?.usage,
    accountUsage?.tokenUsage,
    accountUsage?.token_usage,
    accountUsage?.summary,
    snapshot.tokenUsage,
    snapshot.tokens,
    snapshot.usage,
    snapshot.usageSummary,
    snapshot.quotaUsage
  );
  const scanned = scanUsageNumbers(tokenUsage);
  const input = readNumber(
    firstValue(
      tokenUsage?.input,
      tokenUsage?.inputTokens,
      tokenUsage?.input_tokens,
      tokenUsage?.promptTokens,
      tokenUsage?.prompt_tokens,
      tokenUsage?.uncachedInputTokens,
      tokenUsage?.uncached_input_tokens,
      snapshot.inputTokens,
      snapshot.promptTokens,
      scanned.input
    ),
    null
  );
  const cached = readNumber(
    firstValue(
      tokenUsage?.cached,
      tokenUsage?.cachedTokens,
      tokenUsage?.cached_tokens,
      tokenUsage?.cacheReadInputTokens,
      tokenUsage?.cache_read_input_tokens,
      tokenUsage?.cachedInputTokens,
      tokenUsage?.cached_input_tokens,
      snapshot.cachedTokens,
      snapshot.cacheReadInputTokens,
      scanned.cached
    ),
    null
  );
  const output = readNumber(
    firstValue(
      tokenUsage?.output,
      tokenUsage?.outputTokens,
      tokenUsage?.output_tokens,
      tokenUsage?.completionTokens,
      tokenUsage?.completion_tokens,
      snapshot.outputTokens,
      snapshot.completionTokens,
      scanned.output
    ),
    null
  );
  const total = readNumber(
    firstValue(
      tokenUsage?.total,
      tokenUsage?.totalTokens,
      tokenUsage?.total_tokens,
      tokenUsage?.tokensUsed,
      tokenUsage?.tokens_used,
      snapshot.totalTokens,
      snapshot.tokensUsed,
      scanned.total,
      longWindow?.tokensUsed,
      shortWindow?.tokensUsed
    ),
    sumKnown(input, cached, output)
  );
  const cacheHitRate = readNumber(
    firstValue(tokenUsage?.cacheHitRate, tokenUsage?.cache_hit_rate, tokenUsage?.hitRate, snapshot.cacheHitRate),
    deriveCacheHitRate(input, cached)
  );
  const limit = readNumber(
    firstValue(tokenUsage?.limit, tokenUsage?.tokenLimit, tokenUsage?.token_limit, snapshot.tokenLimit, longWindow?.tokenLimit, shortWindow?.tokenLimit),
    null
  );
  const source = accountUsage ? "account/usage/read" : tokenUsage ? "rateLimits" : total == null ? "none" : "window";

  return {
    input,
    cached,
    output,
    total,
    limit,
    cacheHitRate: cacheHitRate == null ? null : clamp(cacheHitRate),
    source,
    error: usageError ?? null
  };
}

function deriveCacheHitRate(input, cached) {
  if (!input && !cached) {
    return null;
  }
  const denominator = cached > input ? input + cached : input;
  return Math.round((cached / Math.max(1, denominator)) * 100);
}

function scanUsageNumbers(value, depth = 0, acc = { input: null, cached: null, output: null, total: null }) {
  if (!value || typeof value !== "object" || depth > 5) {
    return acc;
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (typeof item === "number" || (typeof item === "string" && item.trim() !== "")) {
      const number = readNumber(item, null);
      if (number == null) {
        continue;
      }
      if (normalized.includes("cache") && normalized.includes("token")) {
        acc.cached ??= number;
      } else if ((normalized.includes("input") || normalized.includes("prompt")) && normalized.includes("token")) {
        acc.input ??= number;
      } else if ((normalized.includes("output") || normalized.includes("completion")) && normalized.includes("token")) {
        acc.output ??= number;
      } else if (normalized.includes("total") && normalized.includes("token")) {
        acc.total ??= number;
      }
      continue;
    }
    if (item && typeof item === "object") {
      scanUsageNumbers(item, depth + 1, acc);
    }
  }
  return acc;
}

function labelForDuration(minutes, fallback) {
  if (!minutes) {
    return fallback;
  }
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  if (minutes < 60 * 24) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}小时`;
  }
  if (minutes % (60 * 24 * 7) === 0) {
    return "周限额";
  }
  const days = minutes / (60 * 24);
  return `${Number.isInteger(days) ? days : days.toFixed(1)}天`;
}

function firstTimestamp(...values) {
  for (const value of values) {
    const timestamp = normalizeTimestamp(value);
    if (timestamp) {
      return timestamp;
    }
  }
  return null;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeTimestamp(value) {
  const timestamp = readNumber(value, NaN);
  if (!Number.isFinite(timestamp) && typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function readNumber(value, fallback) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function sumKnown(...values) {
  const numbers = values.filter((value) => typeof value === "number");
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null;
}

function clamp(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

module.exports = {
  normalizeCodexQuota,
  normalizeWindow,
  normalizeTokenStats,
  labelForDuration,
  normalizeTimestamp
};
