"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiQuota", {
  read: () => ipcRenderer.invoke("quota:read"),
  refresh: () => ipcRenderer.invoke("quota:refresh"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:toggleAlwaysOnTop"),
  quitWindow: () => ipcRenderer.invoke("window:quit"),
  setCompact: (compact) => ipcRenderer.invoke("window:setCompact", compact),
  readDailyTokenHistory: (model) => ipcRenderer.invoke("tokens:dailyHistory", model),
  readHourlyTokenHistory: (model) => ipcRenderer.invoke("tokens:hourlyHistory", model),
  readTokenHistory: (model) => ipcRenderer.invoke("tokens:history", model),
  saveTrayIcon: (dataUrl) => ipcRenderer.send("tray:saveIcon", dataUrl),
  onUpdated: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("quota:updated", listener);
    return () => ipcRenderer.off("quota:updated", listener);
  }
});
