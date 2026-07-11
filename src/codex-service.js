"use strict";

const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { normalizeCodexQuota } = require("./quota-normalizer");

class CodexService extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.initialized = null;
    this.nextId = 1;
    this.pending = new Map();
    this.cacheFilePath = path.join(
      process.env.USERPROFILE || process.env.HOME || "",
      ".gemini",
      "antigravity",
      "quota_cache.json"
    );
    this.lastSnapshot = this.loadCache();
    this.lastError = null;
  }

  loadCache() {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const content = fs.readFileSync(this.cacheFilePath, "utf8");
        return JSON.parse(content);
      }
    } catch (e) {}
    return null;
  }

  saveCache(snapshot) {
    try {
      if (!snapshot) return;
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(snapshot), "utf8");
    } catch (e) {}
  }

  async readQuota() {
    await this.ensureStarted();
    const response = await this.request("account/rateLimits/read");
    let usage = null;
    let usageError = null;
    try {
      usage = await this.request("account/usage/read");
    } catch (error) {
      usageError = error.message;
    }
    const snapshot = normalizeCodexQuota({ ...response, accountUsage: usage, usageError });
    
    // Physics conflict correction:
    if (snapshot?.shortWindow) {
      const short = snapshot.shortWindow;
      const now = Date.now();
      if (short.usedPercent < 100 && short.resetsAt && now < short.resetsAt) {
        short.usedPercent = 100;
        short.remainingPercent = 0;
        if (snapshot.quotaCard) {
          snapshot.quotaCard.remainingPercent = 0;
          snapshot.quotaCard.usedPercent = 100;
        }
      }
    }

    // Anti-pollution: keep correct rate limits if fake ones are pulled during lock period
    if (this.lastSnapshot?.shortWindow && snapshot?.shortWindow) {
      const oldShort = this.lastSnapshot.shortWindow;
      const newShort = snapshot.shortWindow;
      const now = Date.now();
      if (oldShort.resetsAt && now < oldShort.resetsAt) {
        if (newShort.usedPercent < oldShort.usedPercent) {
          if (!newShort.resetsAt || newShort.resetsAt <= oldShort.resetsAt) {
            snapshot.shortWindow = this.lastSnapshot.shortWindow;
            snapshot.longWindow = this.lastSnapshot.longWindow;
            snapshot.quotaCard = this.lastSnapshot.quotaCard;
            snapshot.resetCard = this.lastSnapshot.resetCard;
          }
        }
      }
    }

    this.lastSnapshot = snapshot;
    this.saveCache(snapshot);
    this.lastError = null;
    return this.lastSnapshot;
  }

  getCachedQuota() {
    return this.lastSnapshot;
  }

  getLastError() {
    return this.lastError;
  }

  dispose() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Codex app-server stopped"));
    }
    this.pending.clear();
    if (this.process) {
      this.process.kill();
    }
    this.process = null;
    this.initialized = null;
  }

  async ensureStarted() {
    if (this.initialized) {
      return this.initialized;
    }

    this.initialized = new Promise((resolve, reject) => {
      const command = findCodexCommand();
      this.process = spawn(command, ["app-server"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });

      const stderrLines = [];
      const rl = readline.createInterface({ input: this.process.stdout });
      rl.on("line", (line) => this.handleLine(line));

      this.process.stderr.on("data", (chunk) => {
        const line = chunk.toString("utf8").trim();
        if (line) {
          stderrLines.push(line);
        }
      });

      this.process.on("error", (error) => {
        this.lastError = error.message;
        this.initialized = null;
        reject(error);
      });

      this.process.on("exit", (code) => {
        const message = `Codex app-server exited${code === null ? "" : ` with code ${code}`}`;
        this.lastError = stderrLines.at(-1) || message;
        this.process = null;
        this.initialized = null;
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error(this.lastError));
        }
        this.pending.clear();
      });

      this.request("initialize", {
        clientInfo: {
          name: "ai_quota_widget",
          title: "AI Quota Widget",
          version: "1.0.0"
        },
        capabilities: {
          experimentalApi: true
        }
      })
        .then(() => {
          this.notify("initialized", {});
          resolve();
        })
        .catch((error) => {
          this.lastError = error.message;
          this.initialized = null;
          reject(error);
        });
    });

    return this.initialized;
  }

  request(method, params, timeoutMs = 10000) {
    if (!this.process) {
      return Promise.reject(new Error("Codex app-server is not running"));
    }

    const id = this.nextId++;
    const payload = params === undefined ? { method, id, params: undefined } : { method, id, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method, params) {
    if (this.process) {
      this.process.stdin.write(`${JSON.stringify({ method, params })}\n`);
    }
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if (message.method === "account/rateLimits/updated") {
      const snapshot = normalizeCodexQuota({
        rateLimits: message.params?.rateLimits,
        accountUsage: this.lastSnapshot?.accountUsage ?? null,
        usageError: this.lastSnapshot?.usageError ?? null
      });

      // Physics conflict correction:
      if (snapshot?.shortWindow) {
        const short = snapshot.shortWindow;
        const now = Date.now();
        if (short.usedPercent < 100 && short.resetsAt && now < short.resetsAt) {
          short.usedPercent = 100;
          short.remainingPercent = 0;
          if (snapshot.quotaCard) {
            snapshot.quotaCard.remainingPercent = 0;
            snapshot.quotaCard.usedPercent = 100;
          }
        }
      }

      // Anti-pollution: ignore temporary rate limit pushes during lock period (e.g. mock results from routed models)
      if (this.lastSnapshot?.shortWindow && snapshot?.shortWindow) {
        const oldShort = this.lastSnapshot.shortWindow;
        const newShort = snapshot.shortWindow;
        const now = Date.now();
        if (oldShort.resetsAt && now < oldShort.resetsAt) {
          if (newShort.usedPercent < oldShort.usedPercent) {
            if (!newShort.resetsAt || newShort.resetsAt <= oldShort.resetsAt) {
              return;
            }
          }
        }
      }

      this.lastSnapshot = snapshot;
      this.saveCache(snapshot);
      this.emit("quota-updated", snapshot);
    }
  }
}

function findCodexCommand() {
  if (process.env.CODEX_BIN && fs.existsSync(process.env.CODEX_BIN)) {
    return process.env.CODEX_BIN;
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const binDir = path.join(localAppData, "OpenAI", "Codex", "bin");
    try {
      const candidates = fs
        .readdirSync(binDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(binDir, entry.name, "codex.exe"))
        .filter((candidate) => fs.existsSync(candidate))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      if (candidates[0]) {
        return candidates[0];
      }
    } catch {
      // Fall through to PATH lookup.
    }
  }

  return process.platform === "win32" ? "codex.exe" : "codex";
}

module.exports = {
  CodexService,
  findCodexCommand
};
