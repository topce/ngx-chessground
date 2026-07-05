/**
 * ngx-chessground Desktop Adapter
 *
 * Injects desktop-specific capabilities into the Angular SPA running inside
 * a Deno Desktop webview:
 *
 * 1. Native file dialog — intercepts file input clicks, routes to OS dialog.
 * 2. Stockfish 18 — intercepts the stockfish Worker constructor and redirects
 *    it to the large multi-threaded Stockfish 18 WASM engine instead of the
 *    smaller browser stockfish.js.
 */
(function () {
  "use strict";

  // ── Native file dialog via server ──────────────────────────────

  async function nativeDialog(exts) {
    const res = await fetch("/api/open-file-dialog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extensions: exts }),
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || res.statusText);
    }
    return res.text();
  }

  window.__desktop__ = {
    openFileDialog: nativeDialog,
  };

  // ── Intercept file-label clicks globally ────────────────────────

  document.addEventListener("click", async function handler(e) {
    const label = e.target.closest(".file-input-label");
    if (!label) return;

    e.preventDefault();
    e.stopPropagation();

    const input = label.querySelector("input[type=file]");
    if (!input) return;

    const accept = (input.getAttribute("accept") || "")
      .replace(/^\./g, "")
      .split(/,\.?/)
      .filter(Boolean);

    try {
      const content = await nativeDialog(accept);
      if (!content) return;

      // Write to clipboard + click "Load from Clipboard"
      await navigator.clipboard.writeText(content);
      const allBtns = document.querySelectorAll("button.small-btn");
      for (const btn of allBtns) {
        if (btn.textContent?.trim() === "Load from Clipboard") {
          btn.click();
          break;
        }
      }
    } catch (err) {
      console.error("[desktop]", err);
    }
  }, true);

  // ── Stockfish 18: redirect Worker to large multi-threaded WASM ──

  /**
   * Intercept `new Worker('assets/stockfish/stockfish.js')` and load
   * the large multi-threaded Stockfish 18 WASM instead.
   *
   * Browser: assets/stockfish/stockfish.js (Stockfish ~10, single-thread)
   * Desktop: /desktop-stockfish/stockfish-18.js (Stockfish 18, multi-thread)
   */

  const BROWSER_STOCKFISH_URL = "assets/stockfish/stockfish.js";
  const DESKTOP_STOCKFISH_URL = "/desktop-stockfish/stockfish.js";

  var OriginalWorker = window.Worker;

  window.Worker = function PatchedWorker(url, options) {
    if (
      typeof url === "string" &&
      (url === BROWSER_STOCKFISH_URL ||
       url.endsWith("/" + BROWSER_STOCKFISH_URL) ||
       url.endsWith("/stockfish.js"))
    ) {
      console.log(
        "[desktop] Loading multi-threaded Stockfish 18 instead of browser stockfish.js"
      );
      return new OriginalWorker(DESKTOP_STOCKFISH_URL, options);
    }
    return new OriginalWorker(url, options);
  };

  // Copy static properties
  Object.setPrototypeOf(window.Worker, Object.getPrototypeOf(OriginalWorker));

  // ── Handle window close → quit app ─────────────────────────────
  // Deno Desktop webview may not terminate on window close.
  // Force quit via API on beforeunload.
  window.addEventListener("beforeunload", function () {
    navigator.sendBeacon("/api/quit", "");
  });
})();
