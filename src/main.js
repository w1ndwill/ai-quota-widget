"use strict";

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require("electron");
const { Worker } = require("node:worker_threads");
const path = require("node:path");
const fs = require("node:fs");
const { CodexService } = require("./codex-service");
const { readResetCredits } = require("./reset-credits-service");

// This lightweight dashboard has no WebGL/video workload. Software compositing avoids
// keeping a large GPU helper process resident while it waits in the tray.
app.disableHardwareAcceleration();

// These features are not used by the dashboard and can keep background helpers resident.
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-speech-api");
app.commandLine.appendSwitch("disable-webrtc");

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
const historyPending = new Map();
const cumulativePending = new Map();
let snapshotInFlight = null;
let usageWorker = null;
let usageWorkerNextId = 1;
const usageWorkerPending = new Map();

function clearUsageCaches() {
  cachedLocalUsage = null;
  cachedAntigravityUsage = null;
  lastLocalUsageTime = 0;
  lastAntigravityUsageTime = 0;
  historyCache.clear();
  cumulativeCache.clear();
}

function getUsageWorker() {
  if (usageWorker) return usageWorker;

  const worker = new Worker(path.join(__dirname, "usage-worker.js"));
  worker.unref();
  worker.on("message", ({ id, result, error }) => {
    const pending = usageWorkerPending.get(id);
    if (!pending) return;
    usageWorkerPending.delete(id);
    if (error) pending.reject(new Error(error));
    else pending.resolve(result);
  });
  worker.on("error", (error) => {
    if (usageWorker === worker) resetUsageWorker(error);
  });
  worker.on("exit", (code) => {
    if (usageWorker === worker) {
      resetUsageWorker(new Error(`Usage worker exited with code ${code}`));
    }
  });
  usageWorker = worker;
  return worker;
}

function resetUsageWorker(error) {
  usageWorker = null;
  for (const pending of usageWorkerPending.values()) {
    pending.reject(error);
  }
  usageWorkerPending.clear();
}

function readUsageInWorker(operation, payload) {
  const worker = getUsageWorker();
  const id = usageWorkerNextId++;
  return new Promise((resolve, reject) => {
    usageWorkerPending.set(id, { resolve, reject });
    worker.postMessage({ id, operation, payload });
  });
}

async function readCachedLocalUsage(now) {
  if (cachedLocalUsage && now - lastLocalUsageTime < CACHE_TTL) {
    return cachedLocalUsage;
  }
  cachedLocalUsage = await readUsageInWorker("codexUsage");
  lastLocalUsageTime = Date.now();
  return cachedLocalUsage;
}

async function readCachedAntigravityUsage(now) {
  if (cachedAntigravityUsage && now - lastAntigravityUsageTime < CACHE_TTL) {
    return cachedAntigravityUsage;
  }
  cachedAntigravityUsage = await readUsageInWorker("antigravityUsage");
  lastAntigravityUsageTime = Date.now();
  return cachedAntigravityUsage;
}

async function readCachedHistory(source, model) {
  const key = `${source}:${model}`;
  const cached = historyCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < HISTORY_CACHE_TTL) {
    return cached.value;
  }

  const pending = historyPending.get(key);
  if (pending) return pending;

  const operation = source === "antigravity" ? "antigravityHistory" : "codexHistory";
  const promise = readUsageInWorker(operation, { model, days: 45 })
    .then((value) => {
      historyCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => historyPending.delete(key));
  historyPending.set(key, promise);
  return promise;
}

async function readCachedCumulativeTokens(model) {
  const cached = cumulativeCache.get(model);
  const now = Date.now();
  if (cached && now - cached.at < CUMULATIVE_CACHE_TTL) {
    return cached.value;
  }

  const pending = cumulativePending.get(model);
  if (pending) return pending;

  const promise = readUsageInWorker("cumulative", {
    model,
    enableClaudeCode: appConfig.enableClaudeCode,
    enableAntigravity: appConfig.enableAntigravity
  })
    .then((value) => {
      cumulativeCache.set(model, { at: Date.now(), value });
      return value;
    })
    .finally(() => cumulativePending.delete(model));
  cumulativePending.set(model, promise);
  return promise;
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

  // Parse local logs in a worker so a large transcript cannot block Electron's main loop.
  const [antigravityResult, localResult] = await Promise.allSettled([
    appConfig.enableAntigravity ? readCachedAntigravityUsage(now) : Promise.resolve(null),
    appConfig.enableClaudeCode ? readCachedLocalUsage(now) : Promise.resolve(null)
  ]);
  if (antigravityResult.status === "fulfilled") {
    antigravityTokenUsage = antigravityResult.value;
  } else {
    errors.push(antigravityResult.reason.message);
  }
  if (localResult.status === "fulfilled") {
    localTokenUsage = localResult.value;
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
  } else {
    errors.push(localResult.reason.message);
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

function readSnapshotOnce() {
  if (!snapshotInFlight) {
    snapshotInFlight = readSnapshot().finally(() => {
      snapshotInFlight = null;
    });
  }
  return snapshotInFlight;
}

async function refreshAndPush() {
  const snapshot = await readSnapshotOnce();
  mainWindow?.webContents.send("quota:updated", snapshot);
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
  ipcMain.handle("quota:read", readSnapshotOnce);
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
  ipcMain.handle("tokens:history", async (_event, model) => {
    try {
      if (!appConfig.enableClaudeCode) return { daily: {}, hourly: [] };
      return await readCachedHistory("codex", model);
    } catch {
      return { daily: {}, hourly: [] };
    }
  });
  ipcMain.handle("antigravity:history", async (_event, model) => {
    try {
      if (!appConfig.enableAntigravity) return { daily: {}, hourly: [] };
      return await readCachedHistory("antigravity", model);
    } catch {
      return { daily: {}, hourly: [] };
    }
  });
  ipcMain.handle("tokens:cumulative", async (_event, model) => {
    try {
      return await readCachedCumulativeTokens(model);
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
  if (usageWorker) {
    usageWorker.terminate();
    usageWorker = null;
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
