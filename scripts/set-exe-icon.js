// Sets the icon on the Windows launcher executable.
//
// `deno desktop` embeds the --icon file into the runtime DLL, but Windows reads
// the app/taskbar icon from the launcher .exe. This patches the .exe with the
// same .ico after the desktop build finishes.
//
// Usage: node scripts/set-exe-icon.js <path-to-exe> <path-to-icon.ico>
const { rcedit } = require("rcedit");

const [exePath, iconPath] = process.argv.slice(2);

if (!exePath || !iconPath) {
  console.error("Usage: node scripts/set-exe-icon.js <exe> <icon.ico>");
  process.exit(1);
}

rcedit(exePath, { icon: iconPath })
  .then(() => console.log(`Icon set on ${exePath}`))
  .catch((err) => {
    console.error(`Failed to set icon on ${exePath}:`, err);
    process.exit(1);
  });
