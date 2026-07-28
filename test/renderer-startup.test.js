"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

test("initializes translations before renderer startup calls translated helpers", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "renderer.js"), "utf8");
  const i18nInitialization = source.indexOf("let i18n = I18N.zh;");
  const compactInitialization = source.indexOf("applyCompactState(isCompact);");

  assert.notEqual(i18nInitialization, -1);
  assert.notEqual(compactInitialization, -1);
  assert.ok(i18nInitialization < compactInitialization);
});
