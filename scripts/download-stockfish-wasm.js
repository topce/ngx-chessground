/**
 * Download Stockfish 18 WASM (large multi-threaded engine) for the desktop app.
 *
 * Downloads stockfish-18.js + stockfish-18.wasm from the nmrugg/stockfish.js
 * GitHub releases to desktop/stockfish-wasm/ for bundling with Deno Desktop.
 *
 * These files provide a much stronger engine than the browser stockfish.js
 * (~100MB, multi-threaded, Stockfish 18 vs ~4MB, single-thread, Stockfish ~10).
 *
 * Usage:
 *   node scripts/download-stockfish-wasm.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const STOCKFISH_REPO = "nmrugg/stockfish.js";
const STOCKFISH_WASM_DIR = path.resolve(
  __dirname,
  "..",
  "desktop",
  "stockfish-wasm",
);

// Large single-threaded Stockfish 18 — runs everywhere, no SharedArrayBuffer needed.
// Other options: stockfish-18-lite-single (7MB), stockfish-18 (108MB multi-thread).
const FILES = ["stockfish-18-single.js", "stockfish-18-single.wasm"];
// The JS wrapper locates wasm by replacing .js → .wasm in its own URL.
// So stockfish.js → stockfish.wasm, which must match the files on disk.
const RENAME_MAP = {
  "stockfish-18-single.js": "stockfish.js",
  "stockfish-18-single.wasm": "stockfish.wasm",
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: { "User-Agent": "ngx-chessground-desktop-builder" } },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Invalid JSON: ${e.message}`));
            }
          });
        },
      )
      .on("error", reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(
        url,
        { headers: { "User-Agent": "ngx-chessground-desktop-builder" } },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            // Follow redirect
            file.close();
            fs.unlinkSync(destPath);
            return downloadFile(res.headers.location, destPath)
              .then(resolve)
              .catch(reject);
          }
          if (res.statusCode !== 200) {
            file.close();
            fs.unlinkSync(destPath);
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          const total = parseInt(res.headers["content-length"], 10);
          let downloaded = 0;

          res.on("data", (chunk) => {
            downloaded += chunk.length;
            if (total) {
              const pct = ((downloaded / total) * 100).toFixed(0);
              process.stdout.write(
                `\r  ${path.basename(destPath)}: ${pct}% (${(downloaded / 1024 / 1024).toFixed(0)}/${(total / 1024 / 1024).toFixed(0)} MB)`,
              );
            }
          });

          res.pipe(file);

          file.on("finish", () => {
            if (total) process.stdout.write("\n");
            resolve();
          });
        },
      )
      .on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}

async function main() {
  console.log("[download-stockfish-wasm] nmrugg/stockfish.js → desktop/stockfish-wasm/");

  // Ensure output directory exists
  fs.mkdirSync(STOCKFISH_WASM_DIR, { recursive: true });

  // Check if already downloaded (accounting for rename)
  let allExist = true;
  for (const file of FILES) {
    const renamed = RENAME_MAP[file] || file;
    const p = path.resolve(STOCKFISH_WASM_DIR, renamed);
    if (!fs.existsSync(p)) {
      allExist = false;
      break;
    }
  }

  if (allExist) {
    console.log(
      "[download-stockfish-wasm] All files already exist. Delete desktop/stockfish-wasm/ to force re-download.",
    );
    return;
  }

  // Fetch latest release
  console.log("[download-stockfish-wasm] Fetching latest release...");
  const release = await fetchJson(
    `https://api.github.com/repos/${STOCKFISH_REPO}/releases/latest`,
  );
  console.log(`[download-stockfish-wasm] Release: ${release.tag_name}`);

  // Download each file
  for (const file of FILES) {
    const asset = release.assets.find((a) => a.name === file);
    if (!asset) {
      console.error(`[download-stockfish-wasm] Asset "${file}" not found in release!`);
      console.error("Available assets:", release.assets.map((a) => a.name).join(", "));
      process.exit(1);
    }

    const dest = path.resolve(STOCKFISH_WASM_DIR, file);

    // Skip if exists and size matches
    if (fs.existsSync(dest) && fs.statSync(dest).size === asset.size) {
      console.log(`  ${file}: already downloaded (size matches)`);
      continue;
    }

    console.log(
      `  ${file}: downloading (${(asset.size / 1024 / 1024).toFixed(1)} MB)...`,
    );
    await downloadFile(asset.browser_download_url, dest);
  }

  console.log("[download-stockfish-wasm] ✓ All Stockfish 18 WASM files ready.");

  // Rename WASM to match what stockfish-18.js expects (it looks for "stockfish.wasm")
  for (const [from, to] of Object.entries(RENAME_MAP)) {
    const fromPath = path.resolve(STOCKFISH_WASM_DIR, from);
    const toPath = path.resolve(STOCKFISH_WASM_DIR, to);
    if (fs.existsSync(fromPath) && from !== to) {
      if (fs.existsSync(toPath) && fs.statSync(toPath).size === fs.statSync(fromPath).size) {
        fs.unlinkSync(fromPath); // remove duplicate
      } else {
        fs.renameSync(fromPath, toPath);
      }
    }
  }

  // Print sizes (after rename)
  for (const file of FILES) {
    const renamed = RENAME_MAP[file] || file;
    const p = path.resolve(STOCKFISH_WASM_DIR, renamed);
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      console.log(
        `  ${renamed}: ${(stat.size / 1024 / 1024).toFixed(1)} MB`,
      );
    } else {
      console.warn(`  ${renamed}: not found (rename issue)`);
    }
  }
}

main().catch((err) => {
  console.error("[download-stockfish-wasm] Failed:", err.message);
  process.exit(1);
});
