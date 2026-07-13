"use strict";

const DEFAULT_HOTKEYS = Object.freeze({
  togglePanel: "Ctrl+Shift+Space",
  toggleCompact: "Ctrl+Shift+M",
  refresh: "",
  togglePin: ""
});

const HOTKEY_KEYS = Object.freeze(Object.keys(DEFAULT_HOTKEYS));

function normalizeHotkeys(rawHotkeys) {
  if (!rawHotkeys || typeof rawHotkeys !== "object") return { ...DEFAULT_HOTKEYS };
  return Object.fromEntries(HOTKEY_KEYS.map((key) => {
    const value = rawHotkeys[key];
    if (value === "") return [key, ""];
    if (typeof value !== "string") return [key, DEFAULT_HOTKEYS[key]];
    return [key, value.split("+").map((part) => part.trim()).filter(Boolean).join("+")];
  }));
}

function findDuplicateHotkey(hotkeys) {
  const seen = new Map();
  for (const key of HOTKEY_KEYS) {
    const accelerator = hotkeys[key];
    if (!accelerator) continue;
    const canonical = accelerator.toLowerCase();
    if (seen.has(canonical)) return accelerator;
    seen.set(canonical, key);
  }
  return null;
}

module.exports = { DEFAULT_HOTKEYS, HOTKEY_KEYS, normalizeHotkeys, findDuplicateHotkey };
