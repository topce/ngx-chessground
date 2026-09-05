<div align="center">
  <h1>♟️ NgxChessground</h1>
  <p><strong>The premier Angular wrapper for the world-class open-source chess UI library.</strong></p>

  [![npm version](https://badge.fury.io/js/ngx-chessground.svg)](https://badge.fury.io/js/ngx-chessground)
  [![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://opensource.org/licenses/GPL-3.0) 
  [![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%23EA4AAA.svg?logo=github&logoColor=white)](https://github.com/sponsors/topce)
  
  <br />
  <h3>
    <a href="https://topce.github.io/ngx-chessground/">Live Demo</a>
    <span> | </span>
    <a href="https://github.com/topce/ngx-chessground/issues">Report a Bug</a>
  </h3>
</div>

<hr />

## 💖 Sponsor this Project

If you are a chess lover and find this project useful, please consider sponsoring it to support further development! 

**[👉 Sponsor on GitHub](https://github.com/sponsors/topce)**

Your support helps me maintain the library, add new features, and keep the application up-to-date with the latest Angular and Chessground releases.

✨ **Sponsor Perk**: Sponsors can request to have their favorite or "evergreen" chess game permanently added to the demo application's built-in game list! 

<div align="center">
  <a href="https://github.com/topce/ngx-chessground/pulls">
    <img src="https://img.shields.io/badge/♟️_Your_Evergreen_Game_Could_Be_Here!-Submit_PR-%23EA4AAA?style=for-the-badge" alt="Submit your evergreen game PR" />
  </a>
</div>

**How to add your game:**
1. Sponsor the project via [GitHub Sponsors](https://github.com/sponsors/topce).
2. Submit a Pull Request (PR) to this repository.
3. In your PR, include the **PGN file**, brief **game details**, and your **Sponsor Name**.

---

## 🚀 Features

### 🛠️ Library Features
- 🧩 **Standalone Components**: `NgxChessgroundComponent`, `NgxChessgroundTableComponent`, `NgxPgnViewerComponent` — all standalone, import-ready.
- ⚡ **Full chessground API Access**: The `runFunction` input gives you direct access to the chessground `Api` for complete control over board state, moves, animations, and events.
- 📦 **Pre-built Unit Presets**: `initial`, `castling`, `playVsRandom`, `playFullRandom`, `slowAnim`, and more — pre-configured board setups ready to drop in.
- 🔧 **Utility Functions**: Exported helpers — `toDests()`, `toColor()`, `playOtherSide()`, `aiPlay()` — for building custom chess UIs.
- 🎨 **Promotion Dialog**: Built-in Material dialog for pawn promotion selection with queen/rook/bishop/knight options.
- 🆙 **Modern Angular**: Standalone components, signal-based inputs, compatible with Angular 22 out of the box.

### 🎮 Application Features (PGN Viewer & Demo)
- 📖 **Comprehensive PGN Viewer**: Load and navigate through complex chess games effortlessly.
- ⏪ **Game Replay Options**:
  - Step-by-step manual replay.
  - Real-time replay (watch exactly as the game was played).
  - Proportional replay (fit to one minute or predefined speeds).
  - Customizable minimum time delay between moves.
- 🔍 **Advanced Filtering**:
  - Filter by ECO codes, player names, and time controls.
  - Dynamically filter games by playing the specific starting opening moves on the board!
  - Include or exclude drawn games instantly.
- 🤖 **Stockfish Integration ("Stop on error")**:
  - Background game analysis via Stockfish web worker.
  - Auto-halts replays when a blunder or significant error occurs.
  - Instantly reveals Stockfish's suggested best move and Principal Variation (PV) lines.
- 💡 **ECO Moves Tooltips**: Hover over ECO codes to see the exact opening move sequence.
- 🎭 **Play Against Yourself**: A specialized mode for analyzing positions or practicing openings like Robert James Fischer.
- 📱 **Mobile-Ready**: Responsive design with interactive elements tailored for all devices.
- 📥 **Progressive Web App (PWA)**: Installable as a standalone app directly on your device.

---

## 📚 How to Use the Application

The demo application (`ngx-chessground-example`) is a powerful tool for exploring chess games and features. Here are a few guides to get you started:

<details>
<summary><strong>📱 Install as SPA (PWA)</strong></summary>

1. Open the [live demo](https://topce.github.io/ngx-chessground/) in a supported browser (e.g., Chrome, Edge, Safari).
2. Look for the "Install" icon in the address bar (or in your browser's menu options: "Install App" or "Add to Home Screen").
3. Click Install and the application will be available on your desktop/home screen, working offline where applicable.
</details>

<details>
<summary><strong>♟️ Filter by Starting Opening Moves</strong></summary>

1. Load a PGN file containing multiple games.
2. In the "**Filter by Starting Moves**" section, check the enable box.
3. Use the board to play the specific opening moves you want to filter by (e.g., `1. e4 e5`).
4. Click the "**Filter**" button. The application will instantly list only the games matching that exact opening sequence.
</details>

<details>
<summary><strong>🤖 Use "Stop on error" (Stockfish Integration)</strong></summary>

1. Load a game into the PGN Viewer.
2. Toggle the "**Stop on error**" checkbox.
3. Start the auto-replay.
4. The application analyzes the game utilizing the built-in Stockfish web worker. If a significant mistake is detected, the replay will automatically halt.
5. The UI will display Stockfish's suggested best move and the optimal continuation line (PV), allowing you to study the critical moment.
</details>

---

## 🖥️ Desktop Apps (Windows & macOS)

The demo application also ships as **native desktop apps** for Windows and macOS — the full PGN viewer with Stockfish analysis running locally, no browser tab needed. Prebuilt portable bundles are attached to every [GitHub Release](https://github.com/topce/ngx-chessground/releases).

| Platform | Download (latest release) | Requirements |
|----------|---------------------------|--------------|
| 🍎 macOS (Apple Silicon) | [`ngx-chessground-macos-arm64.zip`](https://github.com/topce/ngx-chessground/releases/latest/download/ngx-chessground-macos-arm64.zip) | macOS 10.15+ on an Apple Silicon Mac (M1/M2/M3/M4) |
| 🪟 Windows (64-bit) | [`ngx-chessground-windows-x86_64.zip`](https://github.com/topce/ngx-chessground/releases/latest/download/ngx-chessground-windows-x86_64.zip) | Windows 10/11 (x64) + Microsoft Edge WebView2 runtime (preinstalled on Windows 11 / most Windows 10) |

> ⚠️ **Unsigned builds**: the desktop bundles are **not signed**, so Windows SmartScreen and macOS Gatekeeper will show a **one-time warning** on first launch. The apps are built from this repository's public source code, are fully portable, and only run a local web server on `127.0.0.1` to serve the UI.

<details>
<summary><strong>🍎 Install on macOS</strong></summary>

1. Download [`ngx-chessground-macos-arm64.zip`](https://github.com/topce/ngx-chessground/releases/latest/download/ngx-chessground-macos-arm64.zip).
2. Double-click the archive to unzip it — you'll get **`ngx-chessground.app`**.
3. *(Optional)* Drag `ngx-chessground.app` into your **Applications** folder.
4. **First launch only** — Gatekeeper blocks the unsigned app, so **Control-click** (right-click) the app and choose **Open** → **Open**, or click **Open** in the "Apple could not verify" dialog that appears when you double-click it.
5. The app window opens and loads the newest available Lichess broadcast / the demo game.

*To skip the Gatekeeper prompt entirely (optional):*
```bash
xattr -dr com.apple.quarantine /Applications/ngx-chessground.app
```

> Requires an **Apple Silicon** Mac (M-series). The macOS bundle is built for `arm64` only; an Intel build is not currently published — Intel Mac users can use the [live demo / PWA](https://topce.github.io/ngx-chessground/) instead.
</details>

<details>
<summary><strong>🪟 Install on Windows</strong></summary>

1. Download [`ngx-chessground-windows-x86_64.zip`](https://github.com/topce/ngx-chessground/releases/latest/download/ngx-chessground-windows-x86_64.zip).
2. Right-click the archive → **Extract All…** — you'll get the **`ngx-chessground-windows`** folder. Keep it as one folder: the `.exe` needs the `.dll` beside it.
3. Open the folder and double-click **`ngx-chessground-windows.exe`**.
4. If SmartScreen shows "Windows protected your PC", click **More info** → **Run anyway** (unsigned build).
5. The app window opens and loads the newest available Lichess broadcast / the demo game. Pin it to the taskbar or create a shortcut for quick access.

> No installation required — it's a portable app, and the bundled Stockfish engine runs locally for analysis. If the window stays blank, make sure the **Microsoft Edge WebView2 Runtime** is installed (see [Microsoft's WebView2 page](https://developer.microsoft.com/microsoft-edge/webview2/)).
</details>

> Want to run it on **Linux** or build it from source? See [`desktop/README.md`](./desktop/README.md) for the `deno task desktop:build` commands and all supported targets (Linux x86_64/arm64 included).

---

## 🏗️ Repository Structure

This repository contains two robust projects:

1. 📦 **ngx-chessground** - The core Angular library.
2. 🕹️ **ngx-chessground-example** - The fully-featured demo application and PGN viewer.

---

## 📦 Installation

### For Users
Install the library in your Angular project via npm:
```bash
npm install ngx-chessground chess.js chessground snabbdom
```

### For Contributors
Clone and set up the development environment quickly:
```bash
git clone https://github.com/topce/ngx-chessground.git
cd ngx-chessground
npm install
npm start
```

---

## 💻 Usage Quick Start

All components are **standalone** — import them directly.

```typescript
import { Component, signal } from '@angular/core';
import { NgxChessgroundComponent } from 'ngx-chessground';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [NgxChessgroundComponent],
  template: `<ngx-chessground [runFunction]="myFn()" />`
})
export class BoardComponent {
  groundApi = signal<Api | null>(null);

  myFn = signal<(el: HTMLElement) => Api>((el) => {
    const api = Chessground(el, {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      orientation: 'white',
      movable: { free: true, color: 'both' }
    });
    this.groundApi.set(api);
    return api;
  });
}
```

The `runFunction` input receives the mounted DOM element and returns a chessground `Api` instance — giving you full control over board configuration.

For PGN viewing, use the pre-built viewer component:

```html
<ngx-pgn-viewer
  [pgn]="pgnString"
  [highlightLastMove]="true"
/>
```

> See the [**library README**](./projects/ngx-chessground/README.md) for comprehensive API documentation covering all components, services, unit presets, and utility functions.

---

## 📖 Documentation

Comprehensive API documentation is available in the [library README](./projects/ngx-chessground/README.md).

To generate and view detailed Compodoc documentation locally:
```bash
npm run compodoc
```
The documentation server will start at `http://localhost:9090`

---

## 📊 Version Compatibility

| NgxChessground | Angular Framework |
|----------------|-------------------|
| **22.x**       | 22.x              |
| **21.x**       | 21.x              |
| **20.x**       | 20.x              |
| **19.x**       | 19.x              |
| **18.x**       | 18.x              |
| **17.x**       | 17.x              |
| **16.x**       | 16.x              |
| **15.x**       | 15.x              |



---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! 
Feel free to check out the [issues page](https://github.com/topce/ngx-chessground/issues) or submit a Pull Request.

---

## 📄 License

Released under the **GPL-3.0** License (or later).

## 🙏 Acknowledgments

- **[Stockfish](https://github.com/official-stockfish/Stockfish)** — The bundled engine is copyright © T. Romstad, M. Costalba, J. Kiiski, G. Linscott and contributors. GPLv3.
- **[stockfish.js](https://github.com/nmrugg/stockfish.js)** — JS/WebAssembly build by [nmrugg](https://github.com/nmrugg) (© Chess.com, LLC). GPLv3.
- **[chessground](https://github.com/lichess-org/chessground)** — Chess board UI by [Thibault Duplessis (ornicar)](https://github.com/ornicar). GPL-3.0-or-later.
- **[chess.js](https://github.com/jhlywa/chess.js)** — Chess rules and move validation by [Jeff Hlywa](https://github.com/jhlywa). BSD-2-Clause.
- **[chessops](https://github.com/niklasf/chessops)** — Chess operations library by [Niklas Fiekas](https://github.com/niklasf). GPL-3.0-or-later.
- **[snabbdom](https://github.com/snabbdom/snabbdom)** — Virtual DOM used by chessground, by [Simon Friis Vindum](https://github.com/paldepind). MIT.
- **[fzstd](https://github.com/101arrowz/fzstd)** — Zstandard decompression for compressed PGN, by [Arjun Barrett](https://github.com/101arrowz). MIT.
- **[jszip](https://github.com/Stuk/jszip)** — ZIP archive support for PGN files, by [Stuart Knightley](https://github.com/Stuk). MIT / GPL-3.0-or-later.
