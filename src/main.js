"use strict";

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { CodexService } = require("./codex-service");
const { readResetCredits } = require("./reset-credits-service");
const { readLocalTokenUsage, readTokenHistory } = require("./token-usage-service");
const { readLocalTokenUsage: readAntigravityUsage, readTokenHistory: readAntigravityHistory } = require("./antigravity-token-service");

// This lightweight dashboard has no WebGL/video workload. Software compositing avoids
// keeping a large GPU helper process resident while it waits in the tray.
app.disableHardwareAcceleration();

// Extreme memory optimizations: disable unneeded features and constrain V8 garbage collection
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-speech-api");
app.commandLine.appendSwitch("disable-webrtc");
app.commandLine.appendSwitch("js-flags", "--expose-gc --max-semi-space-size=1 --max-old-space-size=32");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});


// Configure portable userData directory inside project folder (D drive) instead of C drive
const appDir = app.isPackaged ? path.dirname(app.getPath("exe")) : app.getAppPath();
const userDataPath = path.join(appDir, ".userdata");
app.setPath("userData", userDataPath);
process.env.AI_QUOTA_USER_DATA_PATH = userDataPath;

const NORMAL_SIZE = { width: 760, height: 540 };
const COMPACT_SIZE = { width: 360, height: 76 };

let appConfig = {
  enableCodex: true,
  enableClaudeCode: true,
  enableAntigravity: true
};

const configPath = path.join(userDataPath, "config.json");
try {
  if (fs.existsSync(configPath)) {
    appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(configPath, "utf8")) };
  }
} catch (e) {
  console.error("Failed to load app config", e);
}

const codex = new CodexService();
let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    ...NORMAL_SIZE,
    minWidth: COMPACT_SIZE.width,
    minHeight: COMPACT_SIZE.height,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true, // Hide application from Dock / Windows Taskbar
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide(); // Hide the window instead of quitting when closed
    }
  });
}

function createTray() {
  const iconPath = path.join(app.getPath("userData"), "tray_icon.png");
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("AI 额度");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示", click: () => mainWindow?.show() },
      { label: "刷新", click: () => refreshAndPush() },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );

  // Toggle show/hide when tray icon is clicked
  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}


let cachedLocalUsage = null;
let cachedAntigravityUsage = null;
let lastLocalUsageTime = 0;
let lastAntigravityUsageTime = 0;
const CACHE_TTL = 15000; // 15 seconds cache
let cachedResetCredits = null;
let lastResetCreditsTime = 0;
const RESET_CREDITS_CACHE_TTL = 5 * 60_000;
const HISTORY_CACHE_TTL = 60_000;
const CUMULATIVE_CACHE_TTL = 5 * 60_000;
const historyCache = new Map();
const cumulativeCache = new Map();

function getCachedValue(cache, key, ttl, reader) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.at < ttl) {
    return cached.value;
  }

  const value = reader();
  cache.set(key, { at: now, value });
  return value;
}

function clearUsageCaches() {
  cachedLocalUsage = null;
  cachedAntigravityUsage = null;
  lastLocalUsageTime = 0;
  lastAntigravityUsageTime = 0;
  historyCache.clear();
  cumulativeCache.clear();
}

function readCachedHistory(source, model) {
  const key = `${source}:${model}`;
  const reader = source === "antigravity"
    ? () => readAntigravityHistory({ model, days: 45 })
    : () => readTokenHistory({ model, days: 45 });
  return getCachedValue(historyCache, key, HISTORY_CACHE_TTL, reader);
}

function readCachedCumulativeTokens(model) {
  return getCachedValue(cumulativeCache, model, CUMULATIVE_CACHE_TTL, () => {
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

    if (appConfig.enableClaudeCode) addHistory(readTokenHistory({ model, days: 9999 }));
    if (appConfig.enableAntigravity) addHistory(readAntigravityHistory({ model, days: 9999 }));
    return sum;
  });
}

async function readCachedResetCredits() {
  if (cachedResetCredits && Date.now() - lastResetCreditsTime < RESET_CREDITS_CACHE_TTL) {
    return cachedResetCredits;
  }
  const credits = await readResetCredits();
  cachedResetCredits = credits;
  lastResetCreditsTime = Date.now();
  return credits;
}

async function readSnapshot() {
  const errors = [];
  let quota = null;
  let resetCredits = null;
  let localTokenUsage = null;
  let antigravityTokenUsage = null;
  let quotaError = null;

  const now = Date.now();

  if (appConfig.enableCodex) {
    quota = codex.getCachedQuota();
    const [quotaResult, resetResult] = await Promise.allSettled([
      codex.readQuota(),
      readCachedResetCredits()
    ]);

    if (quotaResult.status === "fulfilled") {
      quota = quotaResult.value;
    } else {
      errors.push(quotaResult.reason.message);
      quotaError = quotaResult.reason.message;
    }

    if (resetResult.status === "fulfilled") {
      resetCredits = resetResult.value;
    } else {
      errors.push(resetResult.reason.message);
    }
  }

  // Handle Antigravity Usage with 15s cache
  if (appConfig.enableAntigravity) {
    try {
      if (cachedAntigravityUsage && (now - lastAntigravityUsageTime < CACHE_TTL)) {
        antigravityTokenUsage = cachedAntigravityUsage;
      } else {
        antigravityTokenUsage = readAntigravityUsage();
        cachedAntigravityUsage = antigravityTokenUsage;
        lastAntigravityUsageTime = now;
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  // Handle Local Token Usage with 15s cache
  if (appConfig.enableClaudeCode) {
    try {
      if (cachedLocalUsage && (now - lastLocalUsageTime < CACHE_TTL)) {
        localTokenUsage = cachedLocalUsage;
      } else {
        localTokenUsage = readLocalTokenUsage();
        cachedLocalUsage = localTokenUsage;
        lastLocalUsageTime = now;
      }

      if (quota?.tokenStats && quota.tokenStats.total == null && localTokenUsage?.total != null) {
        quota = {
          ...quota,
          tokenStats: {
            ...quota.tokenStats,
            ...localTokenUsage,
            accountUsageError: quota.tokenStats.error ?? null,
            error: null
          }
        };
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  return {
    quota,
    resetCredits,
    localTokenUsage,
    antigravityTokenUsage,
    config: appConfig,
    // 重置卡和本地统计是辅助信息；它们失败时不能把一份成功的额度读数标成“刷新失败”。
    error: quotaError,
    errors,
    updatedAt: Date.now()
  };
}

async function refreshAndPush() {
  const snapshot = await readSnapshot();
  mainWindow?.webContents.send("quota:updated", snapshot);
  if (global.gc) {
    setTimeout(() => {
      try { global.gc(); } catch {}
    }, 400);
  }
  return snapshot;
}

function resizeWindow(compact) {
  if (!mainWindow) {
    return false;
  }
  const size = compact ? COMPACT_SIZE : NORMAL_SIZE;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }
  mainWindow.setMinimumSize(size.width, size.height);
  mainWindow.setMaximumSize(size.width, size.height);
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: size.width, height: size.height }, false);
  mainWindow.setContentSize(size.width, size.height);
  return Boolean(compact);
}

app.whenReady().then(() => {
  ipcMain.handle("quota:read", readSnapshot);
  ipcMain.handle("quota:refresh", refreshAndPush);
  ipcMain.handle("window:toggleAlwaysOnTop", () => {
    if (!mainWindow) {
      return false;
    }
    const next = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(next);
    return next;
  });
  ipcMain.handle("window:quit", () => {
    mainWindow?.hide();
    return true;
  });
  ipcMain.handle("window:setCompact", (_event, compact) => resizeWindow(Boolean(compact)));
  ipcMain.handle("tokens:history", (_event, model) => {
    try {
      if (!appConfig.enableClaudeCode) return { daily: {}, hourly: [] };
      return readCachedHistory("codex", model);
    } catch {
      return { daily: {}, hourly: [] };
    }
  });
  ipcMain.handle("antigravity:history", (_event, model) => {
    try {
      if (!appConfig.enableAntigravity) return { daily: {}, hourly: [] };
      return readCachedHistory("antigravity", model);
    } catch {
      return { daily: {}, hourly: [] };
    }
  });
  ipcMain.handle("tokens:cumulative", (_event, model) => {
    try {
      return readCachedCumulativeTokens(model);
    } catch {
      return null;
    }
  });
  ipcMain.handle("settings:read", () => appConfig);
  ipcMain.handle("settings:update", (_event, newConfig) => {
    appConfig = { ...appConfig, ...newConfig };
    clearUsageCaches();
    try {
      fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), "utf8");
    } catch {}
    if (!appConfig.enableCodex) {
      codex.dispose();
    }
    refreshAndPush();
    return true;
  });
  ipcMain.on("tray:saveIcon", (_event, dataUrl) => {
    try {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const iconPath = path.join(app.getPath("userData"), "tray_icon.png");
      if (!fs.existsSync(app.getPath("userData"))) {
        fs.mkdirSync(app.getPath("userData"), { recursive: true });
      }
      fs.writeFileSync(iconPath, base64Data, "base64");
      tray?.setImage(iconPath);
    } catch (e) {
      console.error("Failed to save tray icon:", e);
    }
  });

  codex.on("quota-updated", (quota) => {
    mainWindow?.webContents.send("quota:updated", {
      quota,
      resetCredits: null,
      error: null,
      errors: [],
      updatedAt: Date.now()
    });
  });

  // Pre-warm codex process before window is ready to reduce first-refresh latency
  codex.ensureStarted().catch(() => {});

  createWindow();
  createTray();
});

app.on("before-quit", () => {
  isQuitting = true;
  codex.dispose();
});

app.on("window-all-closed", () => {
  app.quit();
});
