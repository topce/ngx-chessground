#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env

/// <reference lib="deno.ns" />

/**
 * Deno Desktop server for ngx-chessground.
 *
 * Serves the built Angular app and provides desktop-specific API endpoints
 * including file reading for PGN/ZIP files and the large multi-threaded
 * Stockfish 18 WASM engine.
 *
 * Usage:
 *   deno desktop desktop/server.ts
 *   deno task desktop:build
 */

const MODULE_DIR = new URL(".", import.meta.url).pathname;
const API_PREFIX = "/api";

// Remote source for the lichess broadcast database (.pgn.zst monthly dumps).
// Same location scripts/download-lichess.js uses. Swap for a GitHub repo URL
// (e.g. https://raw.githubusercontent.com/<user>/<repo>/main/lichess) if you
// prefer to host the files there.
const LICHESS_BASE = "https://database.lichess.org/broadcast";

function getBuildDirs(): string[] {
  const fromModule = MODULE_DIR.endsWith("/desktop/")
    ? `${MODULE_DIR.replace(/\/desktop\/$/, "")}/dist/ngx-chessground-example/browser`
    : `${MODULE_DIR}dist/ngx-chessground-example/browser`;
  const fromCwd = `dist/ngx-chessground-example/browser`;
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
    for (const d of dirs) ex[d] = await exists(`${d}/index.html`);
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

  // --- Stockfish 18 WASM (large multi-threaded engine) ---
  // Served from the bundled desktop/stockfish-wasm/ directory.
  // The desktop-adapter.js intercepts the Worker constructor to load
  // this engine instead of the smaller browser stockfish.js.
  // NOTE: These files require the SharedArrayBuffer + COOP/COEP headers.
  // The webview serves from localhost so CORS is not an issue.

  if (path.startsWith("/desktop-stockfish/")) {
    const file = path.replace("/desktop-stockfish/", "");
    // Sanitize: only allow alphanumeric, dash, dot
    if (!/^[a-zA-Z0-9_.-]+$/.test(file)) {
      return new Response("Not Found", { status: 404 });
    }

    const candidates = [
      `${MODULE_DIR}stockfish-wasm/${file}`,
      `${MODULE_DIR}../stockfish-wasm/${file}`,
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
 * Stockfish Worker to the large multi-threaded Stockfish 18 WASM.
 */
function serveIndexWithAdapter(file: Deno.FsFile): Response {
  let adapter = "";
  try {
    adapter = Deno.readTextFileSync(MODULE_DIR + "desktop-adapter.js");
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
