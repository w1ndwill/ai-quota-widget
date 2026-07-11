"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiQuota", {
  read: () => ipcRenderer.invoke("quota:read"),
  refresh: () => ipcRenderer.invoke("quota:refresh"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:toggleAlwaysOnTop"),
  quitWindow: () => ipcRenderer.invoke("window:quit"),
  setCompact: (compact) => ipcRenderer.invoke("window:setCompact", compact),
  readDailyTokenHistory: () => ipcRenderer.invoke("tokens:dailyHistory"),
  readHourlyTokenHistory: () => ipcRenderer.invoke("tokens:hourlyHistory"),
  saveTrayIcon: (dataUrl) => ipcRenderer.send("tray:saveIcon", dataUrl),
  onUpdated: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("quota:updated", listener);
    return () => ipcRenderer.off("quota:updated", listener);
  }
});
