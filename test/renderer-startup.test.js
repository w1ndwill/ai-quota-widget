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

test("routes runtime dashboard labels through the translation dictionary", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "renderer.js"), "utf8");
  const runtimeStart = source.indexOf("function applyLang");
  const runtimeSource = source.slice(runtimeStart);

  assert.notEqual(runtimeStart, -1);
  assert.doesNotMatch(runtimeSource, /[\u4e00-\u9fff]/);
  for (const requiredTranslation of [
    'set("hitRateTitle", "hitRate")',
    'set("trendTitle", "trendTitle")',
    'set("heatTitle", "heatTitle")',
    'label: t("allModels")',
    'titleText = t("cumulativeToken")',
    't("unlimited")'
  ]) {
    assert.ok(source.includes(requiredTranslation), `missing translation wiring: ${requiredTranslation}`);
  }
});

test("keeps compact window and renderer dimensions synchronized", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  const cssSource = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "styles.css"), "utf8");

  assert.match(mainSource, /COMPACT_SIZE = \{ width: 336, height: 72 \}/);
  assert.match(cssSource, /body\.compact \{\s*width: 336px;\s*height: 72px;/);
  assert.match(cssSource, /body\.compact \.quota-side \{[\s\S]*?padding: 0 34px 0 0;/);
  assert.match(cssSource, /body\.compact \.quota-list \{[\s\S]*?gap: 8px;/);
});
