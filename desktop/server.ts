#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env

/// <reference lib="deno.ns" />

/**
 * Deno Desktop server for ngx-chessground.
 *
 * Serves the built Angular app and provides desktop-specific API endpoints
 * including file reading for PGN/ZIP files and the large Stockfish 19 WASM
 * engine.
 *
 * Usage:
 *   deno desktop desktop/server.ts
 *   deno task desktop:build
 */

// Directory containing this module. In a compiled `deno desktop` binary the
// module lives on Deno's in-memory virtual filesystem; `import.meta.dirname`
// gives the correct native path on every OS. `new URL(".", import.meta.url)
//   .pathname` must NOT be used here because on Windows it produces an invalid
// `/C:/...` path that cannot be opened.
const MODULE_DIR = import.meta.dirname;
const SEP = Deno.build.os === "windows" ? "\\" : "/";
const DIST_REL = ["dist", "ngx-chessground-example", "browser"].join(SEP);

const API_PREFIX = "/api";

// ── Quit when the app window is closed ──────────────────────────────
// `Deno.serve()` keeps the event loop alive forever, so the process would
// otherwise survive after the user closes the window. Adopt the implicit
// startup window and exit the process on its "close" event. (Deno.BrowserWindow
// is not yet part of the ambient `deno.ns` types, so access it defensively.)

/** Minimal view of `Deno.BrowserWindow` used by this server. */
interface DesktopWindow {
  addEventListener(type: string, listener: () => void): void;
  /** Runs code in the webview and resolves with its JSON-serializable result. */
  executeJs(code: string): Promise<unknown>;
  setPosition(x: number, y: number): void;
  setSize(width: number, height: number): void;
}

const denoGlobal = Deno as unknown as Record<string, unknown>;
if (typeof denoGlobal.BrowserWindow === "function") {
  const BrowserWindow = denoGlobal.BrowserWindow as new (options?: {
    title?: string;
    width?: number;
    height?: number;
  }) => DesktopWindow;
  const win = new BrowserWindow({
    title: "ngx-chessground",
    // A roomy initial size so the first paint is already close to the work
    // area; `maximizeWindow` then snaps it to the full work area.
    width: 1280,
    height: 860,
  });
  win.addEventListener("close", () => Deno.exit(0));
  void maximizeWindow(win);
}

/**
 * Fills the screen's work area on startup.
 *
 * `Deno.BrowserWindow` has no maximize/fullscreen option (the constructor only
 * accepts title/width/height/x/y/resizable/alwaysOnTop/frameless/noActivate/
 * transparentTitlebar in Deno 2.9), so the webview reports the available work
 * area — `screen.availLeft/Top/Width/Height`, which excludes the macOS menu bar
 * and the Dock/taskbar — and the native window is sized and moved to match.
 * That is what a maximized window looks like, while staying resizable and
 * without going fullscreen.
 *
 * `executeJs` needs a live document, so this retries briefly while the webview
 * boots and gives up silently if the page never becomes ready.
 */
async function maximizeWindow(win: DesktopWindow): Promise<void> {
  const script =
    "[window.screen.availLeft ?? 0, window.screen.availTop ?? 0, window.screen.availWidth, window.screen.availHeight]";

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const area = await win.executeJs(script);
      if (Array.isArray(area) && area.length === 4) {
        const [left, top, width, height] = area.map(Number);
        if (width > 0 && height > 0) {
          win.setPosition(left, top);
          win.setSize(width, height);
          return;
        }
      }
    } catch {
      // Webview not ready yet — retry shortly.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Remote source for the lichess broadcast database (.pgn.zst monthly dumps).
// Same location scripts/download-lichess.js uses. Swap for a GitHub repo URL
// (e.g. https://raw.githubusercontent.com/<user>/<repo>/main/lichess) if you
// prefer to host the files there.
const LICHESS_BASE = "https://database.lichess.org/broadcast";

// ── Durable app storage ────────────────────────────────────────────────
// `deno desktop` points the webview at a random 127.0.0.1 port on every
// launch, so the webview origin — and with it localStorage and IndexedDB —
// is brand new each time. Anything that has to survive a restart is stored
// on disk here instead: small JSON state blobs (settings, source bookmarks)
// and the parsed PGN + FEN index cache.

/** Small JSON blobs written by the app (viewer state, source bookmarks). */
const STATE_DIR_NAME = "state";
/** Parsed PGN + FEN index cache files, keyed by content hash. */
const CACHE_DIR_NAME = "pgn-cache";
/** Largest accepted state blob. */
const MAX_STATE_BYTES = 4 * 1024 * 1024;
/** Largest accepted parsed-PGN cache file. */
const MAX_CACHE_BYTES = 1024 * 1024 * 1024;
/** How many parsed archives to keep on disk (least recently used evicted first). */
const MAX_CACHE_ENTRIES = 3;
/** Parsed archives older than this are pruned. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Stable per-user data directory for the app. Mirrors the platform
 * conventions so the cache survives rebuilds and app updates.
 *
 * `NGX_CHESSGROUND_DATA_DIR` overrides it (portable installs, tests).
 */
function appDataDir(): string {
  const override = Deno.env.get("NGX_CHESSGROUND_DATA_DIR");
  if (override) return override;

  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  if (Deno.build.os === "windows") {
    const base = Deno.env.get("APPDATA") ?? [home, "AppData", "Roaming"].join(SEP);
    return [base, "ngx-chessground"].join(SEP);
  }
  if (Deno.build.os === "darwin") {
    return [home, "Library", "Application Support", "ngx-chessground"].join(SEP);
  }
  const base = Deno.env.get("XDG_DATA_HOME") ?? [home, ".local", "share"].join(SEP);
  return [base, "ngx-chessground"].join(SEP);
}

const DATA_DIR = appDataDir();
const STATE_DIR = [DATA_DIR, STATE_DIR_NAME].join(SEP);
const CACHE_DIR = [DATA_DIR, CACHE_DIR_NAME].join(SEP);

async function ensureDir(dir: string): Promise<void> {
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch {
    /* already exists */
  }
}

/** Restricts a path segment to a safe character set (no traversal). */
function safeSegment(value: string): string | null {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
}

interface CacheFileInfo {
  name: string;
  size: number;
  mtime: number;
}

async function listCacheFiles(): Promise<CacheFileInfo[]> {
  const files: CacheFileInfo[] = [];
  try {
    for await (const entry of Deno.readDir(CACHE_DIR)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      const filePath = [CACHE_DIR, entry.name].join(SEP);
      try {
        const stat = await Deno.stat(filePath);
        files.push({
          name: entry.name,
          size: stat.size,
          mtime: stat.mtime?.getTime() ?? 0,
        });
      } catch {
        /* raced with another request */
      }
    }
  } catch {
    /* cache directory does not exist yet */
  }
  return files;
}

/** Drops expired archives and keeps only the most recently used ones. */
async function pruneCache(): Promise<void> {
  const files = await listCacheFiles();
  const now = Date.now();
  const keep = files
    .filter((f) => now - f.mtime <= CACHE_TTL_MS)
    .sort((a, b) => b.mtime - a.mtime);
  const remove = [
    ...files.filter((f) => !keep.includes(f)),
    ...keep.slice(MAX_CACHE_ENTRIES),
  ];
  for (const file of remove) {
    try {
      await Deno.remove([CACHE_DIR, file.name].join(SEP));
    } catch {
      /* already gone */
    }
  }
}

async function cacheInfo(): Promise<{ count: number; estimatedBytes: number }> {
  const files = await listCacheFiles();
  return {
    count: files.length,
    estimatedBytes: files.reduce((sum, f) => sum + f.size, 0),
  };
}


function getBuildDirs(): string[] {
  // server.ts lives in <root>/desktop/ and the Angular bundle is embedded at
  // <root>/dist/ngx-chessground-example/browser (dev mode uses the same layout
  // relative to the repo root).
  const fromModule = [
    MODULE_DIR,
    "..",
    "dist",
    "ngx-chessground-example",
    "browser",
  ].join(SEP);
  const fromCwd = DIST_REL;
  return [fromModule, fromCwd];
}

async function exists(path: string): Promise<boolean> {
  try { await Deno.stat(path); return true; } catch { return false; }
}

async function tryOpen(path: string): Promise<Deno.FsFile | null> {
  try { return await Deno.open(path, { read: true }); } catch { return null; }
}

// ── Main server ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // --- JSON API routes ---

  if (path === `${API_PREFIX}/debug` && req.method === "GET") {
    const dirs = getBuildDirs();
    const ex: Record<string, boolean> = {};
    for (const d of dirs) ex[d] = await exists([d, "index.html"].join(SEP));
    return Response.json({
      cwd: Deno.cwd(),
      moduleDir: MODULE_DIR,
      buildDirs: dirs, existence: ex,
      isDesktop: true,
    });
  }

  if (path === `${API_PREFIX}/desktop-info` && req.method === "GET") {
    return Response.json({
      platform: Deno.build.os, arch: Deno.build.arch,
      denoVersion: Deno.version.deno, v8Version: Deno.version.v8,
      tsVersion: Deno.version.typescript, isDesktop: true,
    });
  }

  if (path === `${API_PREFIX}/quit` && req.method === "POST") {
    // Force-quit: called via sendBeacon when window is closed
    setTimeout(() => Deno.exit(0), 100);
    return new Response("ok", { status: 200 });
  }

  if (path === `${API_PREFIX}/fen` && req.method === "GET") {
    return Response.json({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    });
  }

  // --- Durable state blobs (viewer settings, PGN source bookmarks) ---
  // Survives the per-launch webview origin change, unlike localStorage.

  if (path.startsWith(`${API_PREFIX}/state/`)) {
    const key = safeSegment(path.slice(`${API_PREFIX}/state/`.length));
    if (!key) return new Response("Bad key", { status: 400 });
    const file = [STATE_DIR, `${key}.json`].join(SEP);

    if (req.method === "GET") {
      const f = await tryOpen(file);
      if (!f) return new Response("Not Found", { status: 404 });
      return new Response(f.readable, {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = await req.arrayBuffer();
      if (body.byteLength > MAX_STATE_BYTES) {
        return new Response("Payload too large", { status: 413 });
      }
      try {
        await ensureDir(STATE_DIR);
        // Write-then-rename keeps the file readable if the app quits mid-write.
        const tmp = `${file}.tmp`;
        await Deno.writeFile(tmp, new Uint8Array(body));
        await Deno.rename(tmp, file);
      } catch (e) {
        return Response.json(
          { error: `Failed to store state: ${e}` },
          { status: 500 },
        );
      }
      return new Response(null, { status: 204 });
    }

    if (req.method === "DELETE") {
      try {
        await Deno.remove(file);
      } catch {
        /* already gone */
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  // --- Parsed PGN + FEN index cache (large, streamed to/from disk) ---

  if (path === `${API_PREFIX}/cache-info` && req.method === "GET") {
    return Response.json(await cacheInfo());
  }

  if (path === `${API_PREFIX}/cache` && req.method === "DELETE") {
    try {
      await Deno.remove(CACHE_DIR, { recursive: true });
    } catch {
      /* nothing cached */
    }
    return new Response(null, { status: 204 });
  }

  if (path.startsWith(`${API_PREFIX}/cache/`)) {
    const hash = safeSegment(path.slice(`${API_PREFIX}/cache/`.length));
    if (!hash) return new Response("Bad key", { status: 400 });
    const file = [CACHE_DIR, `${hash}.json`].join(SEP);

    if (req.method === "GET") {
      const f = await tryOpen(file);
      if (!f) return new Response("Not Found", { status: 404 });
      // Touch on read so the LRU pruning keeps archives that are in use.
      const now = new Date();
      try {
        await Deno.utime(file, now, now);
      } catch {
        /* best effort */
      }
      return new Response(f.readable, {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (!req.body) return new Response("Bad Request", { status: 400 });
      const declared = Number(req.headers.get("content-length") ?? "0");
      if (declared > MAX_CACHE_BYTES) {
        return new Response("Payload too large", { status: 413 });
      }

      const tmp = `${file}.tmp`;
      let written = 0;
      let tooLarge = false;
      try {
        await ensureDir(CACHE_DIR);
        const out = await Deno.open(tmp, {
          create: true,
          write: true,
          truncate: true,
        });
        await req.body
          .pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                written += chunk.byteLength;
                if (written > MAX_CACHE_BYTES) {
                  tooLarge = true;
                  controller.error(new Error("cache entry too large"));
                  return;
                }
                controller.enqueue(chunk);
              },
            }),
          )
          .pipeTo(out.writable);
        await Deno.rename(tmp, file);
      } catch (e) {
        try {
          await Deno.remove(tmp);
        } catch {
          /* nothing was written */
        }
        return tooLarge
          ? new Response("Payload too large", { status: 413 })
          : Response.json(
              { error: `Failed to store cache entry: ${e}` },
              { status: 500 },
            );
      }

      await pruneCache();
      return new Response(null, { status: 204 });
    }

    if (req.method === "DELETE") {
      try {
        await Deno.remove(file);
      } catch {
        /* already gone */
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  // --- Lichess broadcast database (streamed remotely, not bundled) ---
  // The 663MB lichess broadcast database is excluded from the desktop bundle
  // (see --exclude dist/.../browser/lichess in deno.json tasks). Requests to
  // /lichess/broadcast/*.pgn.zst are proxied from the public lichess database
  // server — the same source scripts/download-lichess.js uses.
  // To host the files elsewhere (e.g. a GitHub repo/release), change the
  // LICHESS_BASE constant below to that location.

  if (path.startsWith("/lichess/broadcast/")) {
    const file = path.replace("/lichess/broadcast/", "");
    // Sanitize: only allow alphanumeric, dash, dot
    if (!/^[a-zA-Z0-9_.-]+$/.test(file)) {
      return new Response("Not Found", { status: 404 });
    }

    const remote = `${LICHESS_BASE}/${file}`;
    try {
      // Forward Range headers so partial/streaming downloads work end-to-end
      const headers = new Headers();
      const range = req.headers.get("range");
      if (range) headers.set("range", range);
      const res = await fetch(remote, { redirect: "follow", headers });
      if (!res.ok) {
        return Response.json(
          { error: `Lichess file not found remotely: ${file}` },
          { status: res.status },
        );
      }
      return new Response(res.body, {
        status: res.status,
        headers: {
          "content-type": res.headers.get("content-type")
            ?? "application/octet-stream",
          "content-length": res.headers.get("content-length") ?? "",
          "content-range": res.headers.get("content-range") ?? "",
          "accept-ranges": res.headers.get("accept-ranges") ?? "bytes",
          "cache-control": "public, max-age=3600",
        },
      });
    } catch (e) {
      return Response.json(
        { error: `Failed to fetch ${file}: ${e}` },
        { status: 502 },
      );
    }
  }

  // --- Stockfish 19 WASM (large full-strength engine) ---
  // Served from the bundled desktop/stockfish-wasm/ directory.
  // The desktop-adapter.js intercepts the Worker constructor to load
  // this engine instead of the smaller browser stockfish.js.
  // NOTE: This is the single-threaded build, so no SharedArrayBuffer or
  // COOP/COEP headers are required. The webview serves from localhost.

  if (path.startsWith("/desktop-stockfish/")) {
    const file = path.replace("/desktop-stockfish/", "");
    // Sanitize: only allow alphanumeric, dash, dot
    if (!/^[a-zA-Z0-9_.-]+$/.test(file)) {
      return new Response("Not Found", { status: 404 });
    }

    const candidates = [
      [MODULE_DIR, "stockfish-wasm", file].join(SEP),
      [MODULE_DIR, "..", "stockfish-wasm", file].join(SEP),
    ];

    for (const candidate of candidates) {
      const f = await tryOpen(candidate);
      if (f) {
        const ext = file.split(".").pop()?.toLowerCase() ?? "";
        const contentType = ext === "wasm"
          ? "application/wasm"
          : ext === "js"
          ? "application/javascript; charset=utf-8"
          : "application/octet-stream";

        return new Response(f.readable, {
          headers: {
            "content-type": contentType,
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    return Response.json({ error: "Stockfish WASM file not found" }, { status: 404 });
  }

  // --- Desktop-native file dialog (via AppleScript on macOS) ---
  // WKWebView may not open file dialogs reliably. This endpoint uses
  // the OS-native file picker and returns the file contents.

  if (path === `${API_PREFIX}/open-file-dialog` && req.method === "POST") {
    let extensions: string[] = [];
    try {
      const body = await req.json();
      extensions = body.extensions || [];
    } catch { /* no body */ }

    try {
      const typeList = extensions.length > 0
        ? ` of type {${extensions.map((e: string) => `"${e}"`).join(", ")}}`
        : "";

      const cmd = new Deno.Command("osascript", {
        args: ["-e", `POSIX path of (choose file${typeList})`],
        stdout: "piped",
        stderr: "piped",
      });
      const { stdout } = await cmd.output();
      const filePath = new TextDecoder().decode(stdout).trim();

      if (!filePath) {
        return new Response(null, { status: 204 });
      }

      // ZIP files: extract the .pgn from the archive
      if (filePath.toLowerCase().endsWith(".zip")) {
        const pgn = await extractPgnFromZip(filePath);
        return new Response(pgn, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      // PGN / text files: read directly
      const content = await Deno.readTextFile(filePath);
      return new Response(content, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    } catch (e) {
      // osascript not available (non-macOS) or user cancelled
      return Response.json(
        { error: `File dialog not available: ${e}` },
        { status: 422 }
      );
    }
  }

  // --- Static file serving ---

  const filePath = path === "/" ? "/index.html" : path;
  const buildDirs = getBuildDirs();

  for (const dir of buildDirs) {
    const f = await tryOpen(`${dir}${filePath}`);
    if (f) return serveFile(f, filePath);
  }
  for (const dir of buildDirs) {
    const f = await tryOpen(`${dir}/index.html`);
    if (f) return serveFile(f, "/index.html");
  }

  return new Response("Not Found", { status: 404 });
});

// ── Helpers ────────────────────────────────────────────────────────────

function serveFile(file: Deno.FsFile, filePath: string): Response {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  // Inject desktop adapter into index.html
  if (filePath === "/index.html") {
    return serveIndexWithAdapter(file);
  }

  return new Response(file.readable, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

/**
 * Serve index.html with the desktop adapter script injected.
 * The adapter patches FileReader for PGN/ZIP and redirects the
 * Stockfish Worker to the large Stockfish 19 WASM.
 */
function serveIndexWithAdapter(file: Deno.FsFile): Response {
  let adapter = "";
  try {
    adapter = Deno.readTextFileSync([MODULE_DIR, "desktop-adapter.js"].join(SEP));
  } catch {
    adapter = "window.__desktop__ = { openFileDialog: () => null };";
  }

  const encoder = new TextEncoder();
  const scriptTag = encoder.encode(`<script>${adapter}</script>`);
  let injected = false;

  const transformer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (injected) {
        controller.enqueue(chunk);
        return;
      }
      const html = new TextDecoder().decode(chunk);
      const match = html.match(/<head[^>]*>/);
      if (match && match.index !== undefined) {
        const pos = match.index + match[0].length;
        const before = html.slice(0, pos);
        const after = html.slice(pos);
        controller.enqueue(encoder.encode(before));
        controller.enqueue(scriptTag);
        controller.enqueue(encoder.encode(after));
        injected = true;
      } else {
        controller.enqueue(chunk);
      }
    },
  });

  file.readable.pipeTo(transformer.writable);

  return new Response(transformer.readable, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

async function extractPgnFromZip(zipPath: string): Promise<string> {
  const listCmd = new Deno.Command("zipinfo", {
    args: ["-1", zipPath],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout: listOut } = await listCmd.output();
  const files = new TextDecoder().decode(listOut).split("\n");
  const pgnFile = files.find((f) =>
    f.toLowerCase().endsWith(".pgn") && !f.startsWith("__MACOSX")
  );
  if (!pgnFile) {
    throw new Error("No PGN file found in the ZIP archive");
  }
  const extractCmd = new Deno.Command("unzip", {
    args: ["-p", zipPath, pgnFile],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout: pgnOut } = await extractCmd.output();
  return new TextDecoder().decode(pgnOut);
}

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json",
  wasm: "application/wasm",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
  ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  manifest: "application/manifest+json",
  webmanifest: "application/manifest+json",
  map: "application/json",
};
