const { cpSync, existsSync } = require("fs");
const { join } = require("path");

function afterPack(context) {
  const src = join(__dirname, "..", "server-dist");
  const dest = join(context.appOutDir, "resources", "server");

  if (!existsSync(src)) {
    console.error("server-dist not found, run build:server first");
    return;
  }

  cpSync(src, dest, { recursive: true, dereference: true });
  console.log("Copied server-dist to resources/server");
}

module.exports = afterPack;
