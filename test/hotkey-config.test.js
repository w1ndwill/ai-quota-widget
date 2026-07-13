"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_HOTKEYS, normalizeHotkeys, findDuplicateHotkey } = require("../src/hotkey-config");

test("fills missing hotkey settings while preserving explicitly disabled shortcuts", () => {
  assert.deepEqual(normalizeHotkeys(null), DEFAULT_HOTKEYS);
  assert.deepEqual(normalizeHotkeys({ togglePanel: "" }), {
    ...DEFAULT_HOTKEYS,
    togglePanel: ""
  });
});

test("normalizes accelerator whitespace and detects duplicates case-insensitively", () => {
  const hotkeys = normalizeHotkeys({
    togglePanel: " Ctrl + Shift + Space ",
    toggleCompact: "ctrl+shift+space"
  });
  assert.equal(hotkeys.togglePanel, "Ctrl+Shift+Space");
  assert.equal(findDuplicateHotkey(hotkeys), "ctrl+shift+space");
});

test("allows every configured shortcut to be disabled", () => {
  const disabled = Object.fromEntries(Object.keys(DEFAULT_HOTKEYS).map((key) => [key, ""]));
  assert.deepEqual(normalizeHotkeys(disabled), disabled);
  assert.equal(findDuplicateHotkey(disabled), null);
});
