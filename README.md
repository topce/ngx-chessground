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

---

## 🚀 Features

### 🛠️ Library Features
- 🧩 **Complete Angular Wrapper**: Seamlessly adds [ornicar/chessground](https://github.com/ornicar/chessground) into any Angular application.
- ⚡ **Full Compatibility**: All features from the original chessground library are preserved.
- 🆙 **Modern Angular**: Compatible with Angular 21 out of the box.

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

First, import the module:
```typescript
import { NgxChessgroundModule } from 'ngx-chessground';

@NgModule({
  imports: [
    NgxChessgroundModule
  ]
})
export class AppModule { }
```

Then use the component in your template:
```html
<ngx-chessground
  [width]="400"
  [height]="400"
  [config]="config">
</ngx-chessground>
```

---

## 📖 Documentation
To generate and view the detailed documentation locally:
```bash
npm run compodoc
```
The documentation server will start at `http://localhost:9090`

---

## 📊 Version Compatibility

| NgxChessground | Angular Framework |
|----------------|-------------------|
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
