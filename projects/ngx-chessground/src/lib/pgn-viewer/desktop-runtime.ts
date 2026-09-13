/**
 * Desktop (Deno) runtime detection.
 *
 * The packaged desktop app serves the same Angular bundle as the web app, but
 * `desktop/server.ts` injects `desktop/desktop-adapter.js` into the page, which
 * exposes a `window.__desktop__` marker before the bundle runs.
 *
 * This matters for persistence: Deno Desktop points the webview at a random
 * localhost port on every launch, so the webview origin — and with it
 * `localStorage` and `IndexedDB` — is new each time. Only in the desktop
 * runtime do the viewer's settings and its parsed-game cache therefore go
 * through the local server's on-disk `/api/state` and `/api/cache` endpoints.
 * In a regular browser everything keeps using web storage.
 */

/** Shape of the marker object injected by the desktop adapter. */
export interface DesktopMarker {
	/**
	 * Opens the host's native file picker.
	 *
	 * @param extensions — Allowed file extensions, e.g. `['.pgn', '.zip']`.
	 * @returns The chosen path, or `null` when the user cancelled.
	 */
	openFileDialog?(extensions: string[]): Promise<string | null>;
}

/** Returns `true` when running inside the Deno Desktop webview. */
export function isDesktopRuntime(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		(window as Window & { __desktop__?: DesktopMarker }).__desktop__ !==
		undefined
	);
}
