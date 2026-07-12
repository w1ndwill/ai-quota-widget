"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { scanFilesIncrementally, getCachePath } = require("../src/incremental-scan-engine");

test("incremental scanning system", async (t) => {
  const tmpDir = path.join(os.tmpdir(), `ai-quota-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  
  const cachePath = path.join(tmpDir, "history_accumulator_test.json");
  process.env.HISTORY_ACCUMULATOR_PATH = cachePath;

  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    delete process.env.HISTORY_ACCUMULATOR_PATH;
  });

  await t.test("should parse file on first scan and save cache", () => {
    const testFile = path.join(tmpDir, "test1.jsonl");
    fs.writeFileSync(testFile, "line1\nline2", "utf8");

    let parseCount = 0;
    const res = scanFilesIncrementally([testFile], (file) => {
      parseCount++;
      return { parsed: true, lines: 2 };
    });

    assert.strictEqual(parseCount, 1);
    assert.deepStrictEqual(res[testFile], { parsed: true, lines: 2 });
    assert.ok(fs.existsSync(cachePath));
  });

  await t.test("should skip parsing on second scan if file metadata is identical (cache hit)", () => {
    const testFile = path.join(tmpDir, "test1.jsonl");
    
    let parseCount = 0;
    const res = scanFilesIncrementally([testFile], (file) => {
      parseCount++;
      return { parsed: true, lines: 2 };
    });

    assert.strictEqual(parseCount, 0); // Cache hit! Skip parsing.
    assert.deepStrictEqual(res[testFile], { parsed: true, lines: 2 });
  });

  await t.test("should re-parse if file size has changed", () => {
    const testFile = path.join(tmpDir, "test1.jsonl");
    fs.writeFileSync(testFile, "line1\nline2\nline3", "utf8");

    let parseCount = 0;
    const res = scanFilesIncrementally([testFile], (file) => {
      parseCount++;
      return { parsed: true, lines: 3 };
    });

    assert.strictEqual(parseCount, 1);
    assert.deepStrictEqual(res[testFile], { parsed: true, lines: 3 });
  });

  await t.test("should sweep deleted files from cache index", () => {
    const testFile = path.join(tmpDir, "test1.jsonl");
    fs.unlinkSync(testFile);

    const res = scanFilesIncrementally([], () => {});
    assert.deepStrictEqual(res, {});

    const cacheContent = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    assert.deepStrictEqual(cacheContent.files, {});
  });
});
