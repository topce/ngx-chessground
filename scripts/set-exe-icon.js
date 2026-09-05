// Sets the icon on the Windows launcher executable.
//
// `deno desktop` embeds the --icon file into the runtime DLL, but Windows reads
// the app/taskbar icon from the launcher .exe. This patches the .exe with the
// same .ico after the desktop build finishes.
//
// rcedit drives a native .exe, which on macOS/Linux requires wine. When wine is
// not installed (the typical macOS cross-compile setup) the step is skipped
// with a warning instead of failing the whole desktop build — the bundle then
// ships with the stock launcher icon.
//
// Usage: node scripts/set-exe-icon.js <path-to-exe> <path-to-icon.ico>
const { spawnSync } = require("node:child_process");

const [exePath, iconPath] = process.argv.slice(2);

if (!exePath || !iconPath) {
  console.error("Usage: node scripts/set-exe-icon.js <exe> <icon.ico>");
  process.exit(1);
}

if (process.platform !== "win32") {
  const probe = spawnSync("sh", ["-c", "command -v wine64 || command -v wine"], {
    encoding: "utf8",
  });
  if (!probe.stdout.trim()) {
    console.warn(
      `Skipping icon patch for ${exePath}: rcedit needs 'wine' on ${process.platform} ` +
        "(install with 'brew install --cask wine-stable' or run on Windows).",
    );
    process.exit(0);
  }
}

const { rcedit } = require("rcedit");

rcedit(exePath, { icon: iconPath })
  .then(() => console.log(`Icon set on ${exePath}`))
  .catch((err) => {
    console.error(`Failed to set icon on ${exePath}:`, err);
    process.exit(1);
  });
