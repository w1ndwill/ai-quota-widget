"use strict";

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { CodexService } = require("./codex-service");
const { readResetCredits } = require("./reset-credits-service");
const { readLocalTokenUsage, readTokenHistory } = require("./token-usage-service");
const { readLocalTokenUsage: readAntigravityUsage, readTokenHistory: readAntigravityHistory } = require("./antigravity-token-service");


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

const NORMAL_SIZE = { width: 760, height: 540 };
const COMPACT_SIZE = { width: 360, height: 76 };

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
  let quota = codex.getCachedQuota();
  let resetCredits = null;
  let localTokenUsage = null;
  let antigravityTokenUsage = null;

  const now = Date.now();

  const [quotaResult, resetResult] = await Promise.allSettled([
    codex.readQuota(),
    readCachedResetCredits()
  ]);

  if (quotaResult.status === "fulfilled") {
    quota = quotaResult.value;
  } else {
    errors.push(quotaResult.reason.message);
  }

  if (resetResult.status === "fulfilled") {
    resetCredits = resetResult.value;
  } else {
    errors.push(resetResult.reason.message);
  }

  // Handle Antigravity Usage with 15s cache
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

  // Handle Local Token Usage with 15s cache
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

  return {
    quota,
    resetCredits,
    localTokenUsage,
    antigravityTokenUsage,
    // 重置卡和本地统计是辅助信息；它们失败时不能把一份成功的额度读数标成“刷新失败”。
    error: quotaResult.status === "rejected" ? quotaResult.reason.message : null,
    errors,
    updatedAt: Date.now()
  };
}

async function refreshAndPush() {
  const snapshot = await readSnapshot();
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
      return readTokenHistory({ model, days: 45 });
    } catch {
      return { daily: {}, hourly: [] };
    }
  });
  ipcMain.handle("antigravity:history", (_event, model) => {
    try {
      return readAntigravityHistory({ model, days: 45 });
    } catch {
      return { daily: {}, hourly: [] };
    }
  });
  ipcMain.handle("tokens:cumulative", (_event, model) => {
    try {
      const codex = readTokenHistory({ model, days: 9999 });
      const ag = readAntigravityHistory({ model, days: 9999 });
      const sum = { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };
      for (const d of [codex.daily, ag.daily]) {
        for (const v of Object.values(d)) {
          sum.input += v.input || 0;
          sum.cached += v.cached || 0;
          sum.output += v.output || 0;
          sum.reasoning += v.reasoning || 0;
          sum.total += v.total || 0;
        }
      }
      return sum;
    } catch {
      return null;
    }
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
