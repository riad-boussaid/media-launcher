const { cpSync, existsSync, mkdirSync } = require("fs");
const { join } = require("path");

/**
 * The app-builder `appOutDir` layout differs on macOS: the Windows/Linux
 * `resources/` sibling lives inside `Media Launcher.app/Contents/Resources`.
 * The embedded server must be copied there so it is covered by the app bundle
 * signature and found via process.resourcesPath at runtime.
 */
function serverDestination(context) {
  if (context.electronPlatformName === "darwin") {
    const appName = `${context.packager.appInfo.productFilename}.app`;
    return join(
      context.appOutDir,
      appName,
      "Contents",
      "Resources",
      "server",
    );
  }
  return join(context.appOutDir, "resources", "server");
}

function afterPack(context) {
  const src = join(__dirname, "..", "server-dist");
  if (!existsSync(src)) {
    throw new Error("server-dist not found; run build:server before packaging.");
  }

  const dest = serverDestination(context);
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });

  if (!existsSync(join(dest, "index.js"))) {
    throw new Error(`Server entry missing after copy: ${join(dest, "index.js")}`);
  }
  console.log(`Copied server-dist to ${dest}`);
}

module.exports = afterPack;
