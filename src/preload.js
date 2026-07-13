"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiQuota", {
  read: () => ipcRenderer.invoke("quota:read"),
  refresh: () => ipcRenderer.invoke("quota:refresh"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:toggleAlwaysOnTop"),
  quitWindow: () => ipcRenderer.invoke("window:quit"),
  setCompact: (compact) => ipcRenderer.invoke("window:setCompact", compact),
  readTokenHistory: (model, source) => ipcRenderer.invoke("tokens:history", model, source),
  readAntigravityHistory: (model) => ipcRenderer.invoke("antigravity:history", model),
  readCumulativeTokens: (model) => ipcRenderer.invoke("tokens:cumulative", model),
  saveTrayIcon: (dataUrl) => ipcRenderer.send("tray:saveIcon", dataUrl),
  readSettings: () => ipcRenderer.invoke("settings:read"),
  saveSettings: (config) => ipcRenderer.invoke("settings:update", config),
  onUpdated: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("quota:updated", listener);
    return () => ipcRenderer.off("quota:updated", listener);
  }
});
