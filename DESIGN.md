# Design System: NGX Chessground — The Editorial Chess Club

## 1. Visual Theme & Atmosphere

A chess club reading room crossed with a precision instrument. Warm parchment surfaces, deep ink typography, and brass detailing — the mood is **refined, dramatic, and quietly atmospheric**, like a well-lit wood-paneled club where every object is exactly where it belongs.

- **Density: 6/10** ("Daily App → Cockpit") — the PGN Viewer is a focused cockpit (evaluation bar, move list, controls), while the Fischer and About pages breathe with gallery-like whitespace. Density comes from information architecture, never from clutter.
- **Variance: 6/10** ("Offset Asymmetric") — asymmetric split layouts, offset section headers, boards never dead-centered when paired with a control rail. Symmetry is reserved for the chessboard itself, which is the sacred object.
- **Motion: 5/10** ("Fluid CSS") — weighty, tactile motion. Pieces glide with mass; lists cascade; nothing bounces or bounces-in.
- **Atmosphere keywords:** warm, literate, tactile, disciplined, analog-tool. The page should feel like it could have been designed in a print shop in 1962 — then given a flawless software finish.

Everything is built around **one hero object: the chessboard**. The UI is a frame and a reading desk around it.

---

## 2. Color Palette & Roles

Single warm-neutral family (never mix warm and cool grays). One accent family: **Brass**. No pure black anywhere.

### Light Mode (default)
- **Parchment** (#F5F2EC) — Page canvas. The warm off-white everything sits on.
- **Pure Ivory** (#FFFFFF) — Surfaces: cards, panels, dialogs, board frame.
- **Linen** (#E6E0D6) — Secondary surface: hover fills, recessed wells, table striping.
- **Sanded Linen** (#DAD3C8) — Pressed/hover-deep surfaces, toggle tracks.
- **Ink** (#0D0D1A) — Primary text. A deep navy-black (NOT pure #000000). Headlines, move text, board coordinates.
- **Slate Ink** (#3D3D52) — Secondary text: descriptions, move comments, player names.
- **Faded Ink** (#5D5D6E) — Muted metadata: timestamps, ECO labels, panel counts.
- **Deep Brass** (#7A5F00) — **The single accent.** CTAs, active states, focus rings, selected toggle, last-move highlights. Saturation is controlled by depth, not glow — brass never leaves the 30–50% lightness band.
- **Brass Tint** (#F5EDD6) — Accent-tinted wells: selected-list backgrounds, "best move" chips, sponsor highlights.
- **Antique Red** (#B8312A) — Errors, danger, Stockfish "blunder" markers. Never decorative.
- **Line** (#C8C2B6) — 1px structural borders, hairlines, dividers.
- **Light Line** (#E0DCD2) — Softer dividers between dense rows.

### Dark Mode (mirror, same architecture)
- **Midnight** (#141420) — Page canvas.
- **Ink Surface** (#1E1E30) — Cards, panels, dialogs.
- **Dusk Surface** (#2A2A3E) — Wells, hover fills, table striping.
- **Moonlight Ink** (#E8E8EE) — Primary text.
- **Grey Moon** (#9A9AAA) — Secondary text.
- **Dimmer Moon** (#9090A4) — Muted metadata.
- **Bright Brass** (#D4A017) — The accent. Same role as Deep Brass.
- **Brass Dust** (#3A3520) — Accent-tinted wells in dark mode.
- **Line (dark)** (#3A3A4E) — Borders; hairlines never pure white.
- **Antique Red (dark)** (#E74C3C) — Errors.

### Rules
- **Exactly one accent.** Brass is for action and meaning only — never for large decorative areas or gradient text.
- Never use pure black (#000000); Ink is the floor.
- Never mix warm and cool grays in one view. Warm neutral + brass is the entire vocabulary.
- No neon, no outer glow on buttons, no purple/blue AI-gradient aesthetics anywhere.

---

## 3. Typography Rules

### App UI (PGN Viewer, Home, Play, Privacy — all software surfaces)
- **UI Sans: Geist** — body, labels, buttons, forms, navigation. Weight-driven hierarchy: 400 for body, 500 for emphasis, 600 for UI titles. Never below 400 for body copy.
- **Mono: JetBrains Mono** — ALL data: move numbers, SAN moves, ECO codes, time controls, timestamps, evaluation values, coordinates, panel counts, version numbers. Monospace is the "instrument face" of the app.
- Serif is **banned** on all software surfaces. No Georgia, Times, Garamond, Palatino.

### Editorial Surfaces only (Fischer bio, About page, large display moments)
- **Display Serif: Fraunces** (optical size set to "Display", weight 300–500, tight tracking) — hero headlines, pull quotes, the Fischer section titles. Fraunces is the only allowed serif — a distinctive, modern, high-contrast face with character. Never pair it with a generic serif or a second display face.
- Headline hierarchy is achieved through **weight, color, and size together** — not through screaming size alone.
- Body text: relaxed leading (1.6–1.7), max-width **65ch**.

### Scale (applies everywhere)
- Display/Editorial: `clamp(2rem, 5vw, 4rem)`, tracking `-0.02em`
- Page titles (h1): `1.75rem`, weight 700, tracking `-0.01em`
- Section labels (h2): `1.25rem`, weight 600
- Body: `0.875rem–1rem`, leading 1.6
- Mono data: `0.8125rem`, tabular figures, letter-spacing `0.01em`
- Meta/labels: `0.75rem`, uppercase, tracking `0.08em` — uppercase micro-labels are the app's signature "club plaque" detail
- **Banned fonts:** Inter, Roboto, and all generic system defaults for premium surfaces; generic serifs everywhere.

---

## 4. Component Stylings

* **Primary Button (Brass):** Flat fill in Deep Brass/Bright Brass, Ink-colored label, radius 8px, height 44px, padding 0 20px. Hover: shift one step toward lighter brass (e.g. #937200 light / #E8B830 dark). **Active: translateY(1px)** — tactile press, no glow, no scale. Focus ring: 3px brass outline, 2px offset.
* **Secondary Button (Ghost):** 1px Line border, Ink text, transparent fill. Hover: Parchment/Linen fill. Same press physics as primary. Never a gradient.
* **Icon/Text Toggle (unit lists, view toggles):** Full-width rows, radius 8px, 44px tall. Idle: Ink text on transparent. Selected: Brass Tint fill + Deep Brass text + 1px brass hairline. Hover: Linen fill. A small brass dot (4px) marks the selected state.
* **Toggle Switch (filters, auto-analysis):** Track 40×24px, Sanded Linen/Dusk Surface; knob 18px Pure Ivory with 1px Line; knob slides with 250ms spring. On state: track fills brass, knob keeps ivory.
* **Cards:** Used ONLY when elevation communicates hierarchy (board frame, game cards in the selector). Radius 20px, fill Pure Ivory, shadow `0 4px 12px rgba(13,13,26,0.10)` tinted to the ink hue. **In dense surfaces, replace cards with 1px Light Line top-dividers and negative space** — the move list, unit panels, and filter rails use borders, not cards.
* **Inputs & Selects:** Label above input (uppercase micro-label), optional helper below, error message below in Antique Red. Input: 1px Line border, radius 8px, height 44px, focus ring 3px brass. No floating labels. Invalid: 1px Antique Red border.
* **Game Selector (PGN Viewer header):** Horizontal scrollable rail of compact game chips — rank number (mono), player names (weight 500), ECO badge, time control. Chip: 1px Line, radius 12px, 44px tall. Active chip: brass hairline + Brass Tint. No equal 3-column card grid — the rail scrolls.
* **Evaluation Bar:** 8px-wide vertical bar, right of the board, fill White on top / Ink on bottom, center hairline at equality. While Stockfish analyzes: the bar's active half gains a **slow shimmer sweep** (perpetual micro-interaction, opacity-only, 2.4s loop). Eval value rendered in JetBrains Mono on a brass-tinted chip beside the bar.
* **Move List (PGN):** 2-column grid (White | Black), JetBrains Mono 0.8125rem, row height 32px, Light Line dividers. Current move: Brass Tint fill + Deep Brass text + brass left hairline. Comments below the move in Slate Ink, italic. Hover row: Linen fill.
* **Board Frame:** The board sits on a Pure Ivory plinth with radius 12px and the board shadow (`0 8px 32px rgba(13,13,26,0.14)`). Coordinates in JetBrains Mono, Faded Ink, outside the squares. The frame is calm — the board is the star.
* **Promotion Dialog:** Centered modal, radius 20px, Pure Ivory, 1px Line. Four large tappable piece choices (Queen, Rook, Bishop, Knight) in a single row, each 56px, hover: Linen, keyboard-accessible. No animation beyond a 200ms spring scale-in.
* **Loaders:** Board-shaped skeletal shimmer matching the exact board dimensions (64 squares grid, shimmer sweep across the frame). Lists load as shimmering rows matching their real height. **No circular spinners.**
* **Empty States:** Composed, illustrated compositions — e.g. "No games match these filters" rendered as a small monochrome board glyph with a brass pawn, a one-line explanation, and a Clear Filters ghost button. Never a bare "No data" string.
* **Sponsor Dialog:** Brass-tinted header strip, Ink headline in Fraunces, body in Geist, sponsor CTA in Brass fill. This is the one place a subtle brass glow (`0 0 20px rgba(166,124,0,0.18)`) is permitted — reserved exclusively for sponsorship moments.

---

## 5. Layout Principles

- **The Board Is Sacred:** On analysis surfaces (PGN Viewer, Play), the board occupies the largest stable zone — top-left or center-left, roughly 60% of content width, never shrunk below 320px. Control rails, filters, and the eval bar flank it. On mobile the board is always on top and full-width.
- **Asymmetric splits:** Board + control rail (60/40), never two mirrored halves. Section headers in editorial pages are offset — label rail left, content right — never centered.
- **No overlapping elements.** Every element owns its spatial zone. No absolute-positioned content stacking, no text over imagery.
- **No centered hero** on editorial pages: hero copy left-aligned, board or portrait right. Centering is reserved for dialogs only.
- **Grid, not flexbox math:** CSS Grid for all multi-zone layouts. No `calc()` percentage hacks, no magic-number fl*ex-basis.
- **Containment:** Content max-width 1400px, centered, with generous gutters (24px mobile / 48px desktop).
- **Full-height sections:** `min-h-[100dvh]` only — never `h-screen` (iOS Safari jump).
- **Vertical rhythm:** section gaps `clamp(3rem, 8vw, 6rem)`.
- **3-equal-cards rows are banned.** Feature rows, if any, use a 2-column zig-zag or an asymmetric grid (one large board card + one tall text card).

---

## 6. Responsive Rules

- **< 768px: strict single-column collapse.** Board first, controls below. No exceptions, no horizontal squeeze.
- **No horizontal scroll on mobile** — except the game-selector chip rail, which scrolls horizontally *by design* with `scroll-snap`.
- **Typography:** headlines scale via `clamp()`; body never below `0.875rem` (14px).
- **Touch targets:** every interactive element ≥ 44×44px.
- **Board:** always square, width = min(100vw − 32px, available height). Eval bar stays attached to the board's right edge.
- **Inline/photo typography** (Fischer page): images between headline words stack below the headline on mobile.
- **Navigation:** desktop horizontal links collapse into a full-width menu sheet with 44px rows.

---

## 7. Motion & Interaction

- **Spring physics default:** `stiffness: 100, damping: 20` — weighty, premium, no overshoot theatrics. No linear easing for any interaction.
- **Standard durations:** 150ms for hovers, 250ms for state changes, 400ms for surface transitions — all spring-backed.
- **Piece movement (chessground):** keep the library's native piece animations — they already animate `transform` only. Castling/under-promotion transitions feel physical, not floaty.
- **Perpetual micro-interactions (required on live surfaces):**
  - Evaluation bar shimmer sweep while Stockfish analyzes.
  - A brass "thinking" indicator (three mono dots, 1.2s staggered opacity loop) while analysis is pending.
  - Game selector chips: a slow brass hairline pulse on the currently-loading chip.
- **Staggered orchestration:** move lists, game chips, and unit lists never mount instantly — cascade reveal with 40ms per-item delay, opacity + 8px translateY only.
- **Performance rules:** animate exclusively `transform` and `opacity`. Never animate `top`, `left`, `width`, `height`. Grain/noise textures (if any) live on fixed pseudo-elements only, `pointer-events: none`.
- **Reduced motion:** all animation and transitions collapse to 0.01ms under `prefers-reduced-motion`.

---

## 8. Anti-Patterns (Banned — never do these)

- **No emojis anywhere in the UI.** (Monochrome chess glyphs ♞ ♟ are allowed only as inline typographic punctuation at text color — never colorful emoji, never as icons.)
- **No Inter, no Roboto, no generic system-font premium surfaces.**
- **No generic serifs** (Times New Roman, Georgia, Garamond, Palatino) — Fraunces is the only serif, and only on editorial surfaces.
- **No pure black (#000000)** anywhere; Ink (#0D0D1A) is the floor.
- **No neon / outer-glow shadows** — except the single sponsored-dialog exception.
- **No oversaturated accents** — brass never leaves the 30–50% lightness band.
- **No gradient text on large headers.**
- **No custom mouse cursors.**
- **No overlapping elements** — clean spatial separation, always.
- **No 3-column equal-card feature rows.**
- **No generic placeholder names** ("John Doe", "Acme", "Nexus"). Use real player names or [player] placeholders.
- **No fabricated data or statistics.** Never invent accuracy percentages, engine depths, Elo gains, game counts, "97% accuracy", response times, or any metric the product did not compute. If real data isn't available, render `[metric]` placeholders — e.g. "Engine depth [depth]". The Fischer page may reference real historical facts (game dates, opponents, openings) but must not invent analysis numbers.
- **No fake system/metric dashboards** — "BY THE NUMBERS", "KEY STATISTICS" cards filled with invented data are banned.
- **No `LABEL // YEAR` typography** — "SYSTEM // 2024" formatting is banned.
- **No AI copywriting clichés** — "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize".
- **No filler UI text** — "Scroll to explore", "Swipe down", bouncing chevrons, scroll arrows.
- **No broken image links** — use `picsum.photos` or SVG-generated visuals only.
- **No centered hero layouts** on editorial pages (variance > 4).
