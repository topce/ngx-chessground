# Deno Desktop — ngx-chessground

Native desktop builds for the [ngx-chessground](https://github.com/topce/ngx-chessground) Angular chessboard app using [Deno Desktop](https://docs.deno.com/runtime/desktop/).

Cross-compiles from a single machine to macOS, Linux, and Windows.

## Prerequisites

- **Deno canary** (≥ 2.9). Install with:
  ```sh
  curl -fsSL "https://dl.deno.land/canary/$(curl -sL https://dl.deno.land/canary-latest.txt)/deno-aarch64-apple-darwin.zip" -o /tmp/deno-canary.zip
  unzip -o /tmp/deno-canary.zip -d ~/.deno/bin/
  export PATH="$HOME/.deno/bin:$PATH"  # add to ~/.zshrc
  ```
- **Node.js & npm** (for building the Angular app)

## Quick Start

```sh
npm install --force
deno task desktop:build   # builds the Angular app (desktop config) + bundles
open ngx-chessground.app
```

---

## App Size

| Build | Size | What's included |
|-------|------|-----------------|
| **Before** | **744 MB** | Angular app (14 MB) + Deno runtime (~70 MB) + **lichess database (645 MB)** |
| **After** | **~120 MB** | Angular app (14 MB) + Deno runtime (~70 MB) + webview (~15 MB) |

The lichess database (`public/lichess/`) is **not copied or bundled** for desktop builds.
Desktop tasks build with the Angular `desktop` configuration
(`ng build --configuration production,desktop`), which ignores the `lichess/**` asset
folder — so the 663 MB of games never land in `dist/` and the Angular build stays fast.
The `--exclude dist/ngx-chessground-example/browser/lichess` flag in the `deno.json`
tasks remains as a safety net.

Instead, the desktop server (`desktop/server.ts`) **proxies** `/lichess/broadcast/*.pgn.zst`
requests to the public lichess database server (`https://database.lichess.org/broadcast/`) —
the same source `scripts/download-lichess.js` uses — so the app loads the data over the
network without bundling it. It's only needed on disk for the web app (served statically).

To host the files elsewhere (e.g. a GitHub repo/release), change the `LICHESS_BASE`
constant in `desktop/server.ts` and add `--allow-net` is already included in the tasks.

## Building for Desktop

### Single platform

| Task | Platform | Output |
|------|----------|--------|
| `deno task desktop:build` | macOS (arm64) | `ngx-chessground.app` |
| `deno task desktop:build:linux` | Linux (x86_64) | `ngx-chessground-linux/` |
| `deno task desktop:build:linux-arm64` | Linux (ARM64) | `ngx-chessground-linux-arm64/` |
| `deno task desktop:build:windows` | Windows (x86_64) | `ngx-chessground-windows/` |

### All platforms at once

```sh
deno task desktop:build:all
# or
npm run desktop:build:all
```

This produces bundles for macOS, Linux (x86_64 + ARM64), and Windows in one command.

### With npm

All `deno task` commands have npm equivalents:

```sh
npm run desktop:build             # macOS
npm run desktop:build:linux       # Linux x86_64
npm run desktop:build:windows     # Windows
npm run desktop:build:all         # All platforms
```

### Development mode

```sh
deno task desktop:dev   # dev build + hot-reload server
```

---

## Releasing to GitHub

[`scripts/release-desktop.sh`](../scripts/release-desktop.sh) automates the whole
release: it creates/pushes the `v<version>` tag, builds all four desktop bundles,
packages them into archives, and uploads them to a GitHub release.

```sh
# Draft release with the portable bundles (macOS, Linux x64/arm64, Windows)
npm run release:desktop -- 22.5.0

# Also build installers and publish immediately
npm run release:desktop -- 22.5.0 --publish \
  --installer dmg --installer msi --installer appimage

# Reuse the current build and only package + release (no rebuilds)
npm run release:desktop -- 22.5.0 --skip-build

# Dry-run: print everything it would do, execute nothing
npm run release:desktop -- 22.5.0 --dry-run
```

Notes:

- Release notes default to the matching `## [<version>]` section in
  `CHANGELOG.md`; override with `--notes <file>`.
- Releases are **drafts** by default — review on GitHub, then publish with
  `gh release edit v<version> --draft=false` (or pass `--publish`).
- Use `--no-upload` to build/package locally without touching GitHub.
- Requires `gh` (logged in), `deno` (>= 2.9) and `npm install --force` first.
- Artifacts are unsigned; macOS Gatekeeper warns on first launch unless you
  codesign/notarize before distribution.

## Building Installers

`deno desktop` can produce platform-native installers via the `--output` flag.

### macOS

```sh
# .dmg disk image
deno desktop ... --output ngx-chessground.dmg

# Signed .app (requires Apple Developer cert)
deno desktop ... --output ngx-chessground.app
```

### Linux

```sh
# AppImage (portable, no install needed)
deno desktop ... --output ngx-chessground.AppImage

# .deb package (Debian / Ubuntu)
deno desktop ... --output ngx-chessground.deb

# .rpm package (Fedora / RHEL / openSUSE)
deno desktop ... --output ngx-chessground.rpm
```

### Windows

```sh
# .msi installer
deno desktop ... --output ngx-chessground.msi
```

### Self-extracting / compressed builds

Add `--compress` to pack the payload into a self-extracting archive (unpacks on first launch):

```sh
deno desktop ... --compress xz --output ngx-chessground.AppImage
```

| Compressor | Description |
|------------|-------------|
| `xz` | Smallest, uses system `tar` (default) |
| `zstd` | Faster, needs `zstd` tool at runtime |

### Full installer build commands

```sh
# macOS .dmg
deno desktop --no-check \
  --exclude node_modules --exclude .opencode/node_modules --exclude coverage \
  --include dist/ngx-chessground-example/browser \
  --backend webview \
  --output ngx-chessground.dmg \
  desktop/server.ts

# Linux .deb
deno desktop --no-check \
  --exclude node_modules --exclude .opencode/node_modules --exclude coverage \
  --include dist/ngx-chessground-example/browser \
  --backend webview --target x86_64-unknown-linux-gnu \
  --output ngx-chessground.deb \
  desktop/server.ts

# Windows .msi
deno desktop --no-check \
  --exclude node_modules --exclude .opencode/node_modules --exclude coverage \
  --include dist/ngx-chessground-example/browser \
  --backend webview --target x86_64-pc-windows-msvc \
  --output ngx-chessground.msi \
  desktop/server.ts
```

---

## CLI Flags Reference

| Flag | Purpose |
|------|---------|
| `--no-check` | Skip TypeScript checking |
| `--backend <webview\|cef>` | Rendering engine (webview = small, CEF = consistent) |
| `--target <triple>` | Cross-compile target |
| `--all-targets` | Build for all supported platforms |
| `-o, --output <path>` | Output file (`.app`, `.dmg`, `.AppImage`, `.deb`, `.rpm`, `.msi`) |
| `--exclude <dir>` | Don't bundle this directory |
| `--include <dir>` | Embed this file/directory |
| `--compress <xz\|zstd>` | Self-extracting archive |
| `--hmr` | Hot module reload (dev) |
| `--icon <path>` | Custom icon (`.icns` for macOS, `.ico` for Windows, `.png` for Linux) |

### Target triples

| Target | Platform |
|--------|----------|
| `aarch64-apple-darwin` | macOS Apple Silicon (default) |
| `x86_64-apple-darwin` | macOS Intel |
| `x86_64-unknown-linux-gnu` | Linux x86_64 |
| `aarch64-unknown-linux-gnu` | Linux ARM64 |
| `x86_64-pc-windows-msvc` | Windows x86_64 |

---

## Configuration

Settings in [`deno.json`](../deno.json) under `"desktop"`:

```json
{
  "desktop": {
    "app": {
      "name": "ngx-chessground",
      "identifier": "com.github.topce.ngx-chessground"
    },
    "backend": "webview"
  }
}
```

| Field | Description |
|-------|-------------|
| `app.name` | Display name (window title, menu bar) |
| `app.identifier` | Bundle ID (required for notifications, code signing) |
| `backend` | `"webview"` (OS-native, small) or `"cef"` (Chromium, consistent) |

---

## Output Structure

Each build produces a self-contained directory:

```
ngx-chessground.app/                  # macOS bundle
  └── Contents/MacOS/
      ├── laufey_webview              # Native webview launcher
      └── ngx-chessground.dylib       # Compiled Deno server + assets

ngx-chessground-linux/                # Linux directory
  ├── laufey_webview                  # Webview binary
  ├── ngx-chessground-linux           # Launch script
  ├── ngx-chessground-linux.so        # Compiled runtime + assets
  └── com.github.topce.*.desktop      # Desktop entry file

ngx-chessground-windows/              # Windows directory
  ├── laufey_webview.exe              # Webview launcher
  ├── ngx-chessground-windows.bat     # Launch script
  └── ngx-chessground-windows.dll     # Compiled runtime + assets
```

---

## Architecture

```
desktop/server.ts                     # Deno.serve() — serves Angular SPA
dist/ngx-chessground-example/browser/ # Angular production build
deno.json                             # Desktop configuration + tasks
```

1. **Angular CLI** builds the app → `dist/ngx-chessground-example/browser/`
2. **`deno desktop`** compiles `server.ts` + embeds `dist/` into a native binary
3. **Webview** (OS-native WKWebView / WebKitGTK / WebView2) renders the UI
4. **`Deno.serve()`** binds to `127.0.0.1:PORT` — the webview navigates to it

## Server API

| Endpoint | Description |
|----------|-------------|
| `GET /api/fen` | Starting chess position FEN string |
| `GET /api/desktop-info` | Runtime info (platform, Deno version, TS version) |
| `GET /api/debug` | File resolution paths (dev troubleshooting) |
| `GET /*` | Angular SPA (static files + `index.html` fallback) |

## Troubleshooting

**Black screen on launch**: macOS Gatekeeper may block the unsigned app. Right-click `ngx-chessground.app` → Open, or run from terminal:
```sh
./ngx-chessground.app/Contents/MacOS/ngx-chessground
```

**Port in use**: Old instances may linger. Kill them:
```sh
kill $(ps aux | grep laufey | grep -v grep | awk '{print $2}')
```
