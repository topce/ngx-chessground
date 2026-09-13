import { InjectionToken } from '@angular/core';

/**
 * Severity of a viewer notification.
 *
 * `'error'` is used for failures the user must know about (a download that
 * failed, a clipboard that could not be read); `'info'` covers confirmations
 * such as "PGN cache cleared."
 */
export type PgnViewerNoticeLevel = 'info' | 'error';

/** A message the viewer wants to surface to the user. */
export interface PgnViewerNotice {
	/** Human-readable text, already localized by the viewer. */
	readonly message: string;
	/** How prominently the host should present it. */
	readonly level: PgnViewerNoticeLevel;
	/**
	 * Suggested display duration in milliseconds. `0` means "until dismissed".
	 * Hosts are free to ignore this.
	 */
	readonly durationMs: number;
}

/**
 * Host-provided sink for user-facing viewer notifications.
 *
 * The viewer deliberately does not depend on a UI toolkit: without a provider
 * it falls back to {@link consolePgnViewerNotifier}, and applications that want
 * snackbars, toasts or a live region provide {@link PGN_VIEWER_NOTIFIER}
 * themselves.
 *
 * @example
 * ```typescript
 * // Bridge to Angular Material, if the host already uses it.
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     {
 *       provide: PGN_VIEWER_NOTIFIER,
 *       useFactory: () => {
 *         const snackBar = inject(MatSnackBar);
 *         return {
 *           notify: ({ message, durationMs }) =>
 *             void snackBar.open(message, 'Dismiss', { duration: durationMs }),
 *         };
 *       },
 *     },
 *   ],
 * };
 * ```
 */
export interface PgnViewerNotifier {
	/** Presents a message to the user. Must not throw. */
	notify(notice: PgnViewerNotice): void;
}

/**
 * Default notifier used when the host provides none.
 *
 * Writes errors to `console.error` and informational messages to
 * `console.info`, so nothing is silently swallowed even in a host that never
 * wired up {@link PGN_VIEWER_NOTIFIER}.
 */
export const consolePgnViewerNotifier: PgnViewerNotifier = {
	notify({ message, level }): void {
		if (level === 'error') {
			console.error(`[ngx-chessground] ${message}`);
		} else {
			console.info(`[ngx-chessground] ${message}`);
		}
	},
};

/**
 * Injection token for the viewer's notification sink.
 *
 * Defaults to {@link consolePgnViewerNotifier}. Provide your own to route
 * viewer messages into the host's notification system.
 */
export const PGN_VIEWER_NOTIFIER = new InjectionToken<PgnViewerNotifier>(
	'PGN_VIEWER_NOTIFIER',
	{ providedIn: 'root', factory: () => consolePgnViewerNotifier },
);
