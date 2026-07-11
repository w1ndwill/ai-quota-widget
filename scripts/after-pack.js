const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, "locales");
  if (!fs.existsSync(localesDir)) return;

  const keep = new Set(["en-US.pak", "zh-CN.pak"]);
  for (const file of fs.readdirSync(localesDir)) {
    if (!keep.has(file)) {
      fs.rmSync(path.join(localesDir, file), { force: true });
    }
  }
};
