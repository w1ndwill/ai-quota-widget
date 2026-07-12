"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// 缓存文件路径
function getCachePath() {
  if (process.env.HISTORY_ACCUMULATOR_PATH) {
    return process.env.HISTORY_ACCUMULATOR_PATH;
  }
  // 获取用户公共配置区
  const home = os.homedir();
  const dir = path.join(home, ".gemini", "antigravity");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "history_accumulator.json");
}

function loadCache() {
  const cachePath = getCachePath();
  try {
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, "utf8"));
    }
  } catch (e) {
    console.error("Failed to load history accumulator cache", e);
  }
  return { files: {} };
}

function saveCache(cache) {
  const cachePath = getCachePath();
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save history accumulator cache", e);
  }
}

// 增量文件扫描方法
function scanFilesIncrementally(filePaths, parseFile) {
  const cache = loadCache();
  let dirty = false;

  // 1. 比对当前存在的文件
  for (const filePath of filePaths) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue; // 文件打不开或不存在
    }

    const mtimeMs = stat.mtimeMs;
    const size = stat.size;

    const cachedItem = cache.files[filePath];
    if (cachedItem && cachedItem.mtimeMs === mtimeMs && cachedItem.size === size) {
      // 没变，直接跳过
      continue;
    }

    // 变了，或者新文件
    try {
      const parsedData = parseFile(filePath);
      cache.files[filePath] = {
        mtimeMs,
        size,
        data: parsedData
      };
      dirty = true;
    } catch (e) {
      console.error(`Failed to parse file: ${filePath}`, e);
    }
  }

  // 2. 清理已经在磁盘上不复存在的文件记录
  for (const cachedFile of Object.keys(cache.files)) {
    if (!fs.existsSync(cachedFile)) {
      delete cache.files[cachedFile];
      dirty = true;
    }
  }

  if (dirty) {
    saveCache(cache);
  }

  // 3. 只返回本次传入 filePaths 的最新解析数据
  const result = {};
  for (const filePath of filePaths) {
    const cachedItem = cache.files[filePath];
    if (cachedItem) {
      result[filePath] = cachedItem.data;
    }
  }
  return result;
}

module.exports = {
  scanFilesIncrementally,
  getCachePath
};
