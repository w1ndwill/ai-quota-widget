"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const outputOption = args.find((arg) => arg.startsWith("--config.directories.output="));
const outputRoot = path.resolve(
  projectRoot,
  outputOption ? outputOption.slice(outputOption.indexOf("=") + 1) : "release"
);
const userData = path.join(outputRoot, "win-unpacked", ".userdata");
const backup = path.join(projectRoot, ".cache", `build-userdata-${path.basename(outputRoot)}`);
let hasBackup = false;

try {
  if (fs.existsSync(userData)) {
    fs.rmSync(backup, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.cpSync(userData, backup, { recursive: true });
    hasBackup = true;
  } else if (fs.existsSync(backup)) {
    // Recover data left by an interrupted earlier build.
    hasBackup = true;
  }

  const cli = require.resolve("electron-builder/cli.js");
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  if (hasBackup && fs.existsSync(backup)) {
    fs.mkdirSync(path.dirname(userData), { recursive: true });
    fs.cpSync(backup, userData, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
}
