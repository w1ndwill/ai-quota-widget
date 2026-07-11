"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  labelForDuration,
  normalizeCodexQuota,
  normalizeTimestamp
} = require("../src/quota-normalizer");
const { normalizeResetCredits } = require("../src/reset-credits-service");
const {
  normalizeUsage,
  readLatestUsage,
  readDailyTokenHistory,
  readHourlyTokenHistory
} = require("../src/token-usage-service");

test("normalizes Codex rate limit windows and quota card expiry", () => {
  const snapshot = normalizeCodexQuota({
    rateLimitsByLimitId: {
      codex: {
        limitName: "Codex Pro",
        primary: {
          usedPercent: 22.4,
          windowDurationMins: 300,
          resetsAt: 1800000000
        },
        secondary: {
          usedPercent: 76,
          windowDurationMins: 10080,
          resetsAt: 1800300000000
        },
        individualLimit: {
          limit: "1000",
          used: "300",
          remainingPercent: 70,
          resetsAt: 1800400000
        },
        planType: "pro"
      }
    }
  });

  assert.equal(snapshot.shortWindow.label, "5小时");
  assert.equal(snapshot.shortWindow.remainingPercent, 78);
  assert.equal(snapshot.longWindow.label, "周限额");
  assert.equal(snapshot.longWindow.remainingPercent, 24);
  assert.equal(snapshot.quotaCard.title, "Codex Pro");
  assert.equal(snapshot.quotaCard.remainingPercent, 70);
  assert.equal(snapshot.quotaCard.expiresAt, 1800400000000);
  assert.equal(snapshot.planType, "pro");
});

test("falls back to rateLimits and derives quota card from weekly reset", () => {
  const snapshot = normalizeCodexQuota({
    rateLimits: {
      primary: {
        usedPercent: 10,
        windowDurationMins: 300,
        resetsAt: 1800000000
      },
      secondary: {
        usedPercent: 35,
        windowDurationMins: 10080,
        resetsAt: 1800600000
      }
    }
  });

  assert.equal(snapshot.quotaCard.source, "secondary");
  assert.equal(snapshot.quotaCard.remainingPercent, 65);
  assert.equal(snapshot.quotaCard.expiresAt, 1800600000000);
});

test("normalizes token statistics from several common payload fields", () => {
  const snapshot = normalizeCodexQuota({
    rateLimits: {
      primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1800000000 },
      usage: {
        inputTokens: 1_000,
        cachedTokens: 3_000,
        outputTokens: 500
      }
    }
  });

  assert.equal(snapshot.tokenStats.input, 1000);
  assert.equal(snapshot.tokenStats.cached, 3000);
  assert.equal(snapshot.tokenStats.output, 500);
  assert.equal(snapshot.tokenStats.total, 4500);
  assert.equal(snapshot.tokenStats.cacheHitRate, 75);
});

test("normalizes token statistics from account usage response", () => {
  const snapshot = normalizeCodexQuota({
    rateLimits: {
      primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1800000000 }
    },
    accountUsage: {
      current_period: {
        input_tokens: 2_000,
        cache_read_input_tokens: 1_500,
        output_tokens: 700
      }
    }
  });

  assert.equal(snapshot.tokenStats.input, 2000);
  assert.equal(snapshot.tokenStats.cached, 1500);
  assert.equal(snapshot.tokenStats.output, 700);
  assert.equal(snapshot.tokenStats.total, 4200);
  assert.equal(snapshot.tokenStats.cacheHitRate, 75);
  assert.equal(snapshot.tokenStats.source, "account/usage/read");
});

test("keeps token usage errors visible without breaking quota", () => {
  const snapshot = normalizeCodexQuota({
    rateLimits: {
      primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1800000000 }
    },
    usageError: "codex account authentication required to read token usage"
  });

  assert.equal(snapshot.shortWindow.remainingPercent, 90);
  assert.equal(snapshot.tokenStats.error, "codex account authentication required to read token usage");
});

test("normalizes reset card hints from rate-limit payload credits", () => {
  const snapshot = normalizeCodexQuota({
    rateLimits: {
      primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1800000000 },
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: "2",
        expires_at: "2026-08-01T00:00:00Z"
      }
    }
  });

  assert.equal(snapshot.resetCard.count, 2);
  assert.equal(snapshot.resetCard.countLabel, "2");
  assert.equal(snapshot.resetCard.expiresAt, Date.parse("2026-08-01T00:00:00Z"));
});

test("normalizes wham reset credits response", () => {
  const snapshot = normalizeResetCredits({
    available_count: 1,
    credits: [
      {
        status: "available",
        title: "Full reset (Weekly + 5 hr)",
        granted_at: "2026-07-01T20:05:28Z",
        expires_at: "2026-07-31T20:05:28Z"
      }
    ]
  });

  assert.equal(snapshot.availableCount, 1);
  assert.equal(snapshot.credits[0].status, "available");
  assert.equal(snapshot.credits[0].title, "Full reset (Weekly + 5 hr)");
  assert.equal(snapshot.credits[0].grantedAt, Date.parse("2026-07-01T20:05:28Z"));
  assert.equal(snapshot.credits[0].expiresAt, Date.parse("2026-07-31T20:05:28Z"));
});

test("reads local Codex session token usage", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-bar-usage-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "rollout.jsonl");
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ type: "event_msg", payload: { msg: "ignore" } }),
      JSON.stringify({
        type: "turn_context",
        payload: {
          info: {
            total_token_usage: {
              input_tokens: 120,
              cached_input_tokens: 80,
              output_tokens: 40,
              reasoning_output_tokens: 10,
              total_tokens: 250
            }
          }
        }
      })
    ].join("\n"),
    "utf8"
  );

  assert.deepEqual(readLatestUsage(file), {
    input: 120,
    cached: 80,
    output: 40,
    reasoning: 10,
    total: 250
  });
  assert.equal(normalizeUsage({ input_tokens: "1", output_tokens: "2" }).total, 3);
});

test("calculates cache hit rate from the cached portion of input tokens", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-bar-cache-rate-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "rollout.jsonl");
  fs.writeFileSync(
    file,
    JSON.stringify({
      type: "turn_context",
      payload: {
        info: {
          total_token_usage: {
            input_tokens: 1_000,
            cached_input_tokens: 750,
            output_tokens: 100,
            total_tokens: 1_100
          }
        }
      }
    }),
    "utf8"
  );

  const { readLocalTokenUsage } = require("../src/token-usage-service");
  const usage = readLocalTokenUsage({ root: dir });
  assert.equal(usage.cacheHitRate, 75);
});

test("groups token increments by event time instead of file modification time", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-bar-daily-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const eventTime = Date.parse("2026-07-10T12:15:00Z");
  const file = path.join(dir, "rollout.jsonl");
  fs.writeFileSync(file, JSON.stringify({
    timestamp: new Date(eventTime).toISOString(),
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        last_token_usage: {
          input_tokens: 900,
          cached_input_tokens: 700,
          output_tokens: 100,
          total_tokens: 1_000
        }
      }
    }
  }), "utf8");

  const date = new Date(eventTime);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const daily = readDailyTokenHistory({ now: eventTime + 2 * 60 * 60_000, root: dir });
  const hourly = readHourlyTokenHistory({ now: eventTime + 30 * 60_000, root: dir });
  assert.equal(daily[key].total, 1_000);
  assert.equal(hourly.reduce((sum, bucket) => sum + bucket.total, 0), 1_000);
});

test("groups local token usage by the model active when each event was recorded", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { readLocalTokenUsage } = require("../src/token-usage-service");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-bar-model-usage-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const now = Date.parse("2026-07-11T12:00:00Z");
  const event = (model, total) => [
    { timestamp: new Date(now).toISOString(), type: "turn_context", payload: { model } },
    { timestamp: new Date(now + 1).toISOString(), type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: total, total_tokens: total } } } }
  ];
  fs.writeFileSync(path.join(dir, "rollout.jsonl"), [...event("gpt-5.6-terra", 120), ...event("gpt-5.5-mini", 80)].map(JSON.stringify).join("\n"));

  const usage = readLocalTokenUsage({ now: now + 60_000, root: dir });
  assert.deepEqual(usage.modelUsage.map(({ model, total }) => ({ model, total })), [
    { model: "gpt-5.6-terra", total: 120 },
    { model: "gpt-5.5-mini", total: 80 }
  ]);
  const daily = readDailyTokenHistory({ now: now + 60_000, root: dir, model: "gpt-5.5-mini" });
  const hourly = readHourlyTokenHistory({ now: now + 60_000, root: dir, model: "gpt-5.5-mini" });
  const date = new Date(now);
  const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  assert.equal(daily[dayKey].total, 80);
  assert.equal(hourly.reduce((sum, bucket) => sum + bucket.total, 0), 80);
});

test("formats duration labels", () => {
  assert.equal(labelForDuration(45, "fallback"), "45分钟");
  assert.equal(labelForDuration(90, "fallback"), "1.5小时");
  assert.equal(labelForDuration(10080, "fallback"), "周限额");
  assert.equal(labelForDuration(null, "fallback"), "fallback");
});

test("normalizes second and millisecond timestamps", () => {
  assert.equal(normalizeTimestamp(1800000000), 1800000000000);
  assert.equal(normalizeTimestamp(1800000000000), 1800000000000);
  assert.equal(normalizeTimestamp(null), null);
});

test("reads Claude Code projects session log with message.model, message.usage and deduplicates", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { readLocalTokenUsage } = require("../src/token-usage-service");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-code-usage-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const now = Date.parse("2026-07-11T12:00:00Z");
  const file = path.join(dir, "session.jsonl");
  fs.writeFileSync(
    file,
    [
      JSON.stringify({
        timestamp: new Date(now).toISOString(),
        message: {
          id: "msg-1",
          model: "deepseek-v4-pro",
          usage: {
            input_tokens: 100,
            output_tokens: 20
          }
        }
      }),
      JSON.stringify({
        timestamp: new Date(now + 1).toISOString(),
        message: {
          id: "msg-1",
          model: "deepseek-v4-pro",
          usage: {
            input_tokens: 100,
            output_tokens: 20
          }
        }
      }),
      JSON.stringify({
        timestamp: new Date(now + 2).toISOString(),
        message: {
          id: "msg-2",
          model: "deepseek-v4-pro",
          usage: {
            input_tokens: 200,
            cache_read_input_tokens: 500,
            output_tokens: 30
          }
        }
      })
    ].join("\n"),
    "utf8"
  );

  const usage = readLocalTokenUsage({ now: now + 60_000, root: dir });
  assert.equal(usage.input, 800); // 100 + (200 + 500) = 800
  assert.equal(usage.cached, 500);
  assert.equal(usage.output, 50);
  assert.equal(usage.total, 850);
  assert.deepEqual(usage.modelUsage, [
    { model: "deepseek-v4-pro", input: 800, cached: 500, output: 50, reasoning: 0, total: 850 }
  ]);
});
