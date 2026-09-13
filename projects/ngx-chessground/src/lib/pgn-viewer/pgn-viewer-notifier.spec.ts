import { describe, expect, it, vi } from 'vitest';
import {
	consolePgnViewerNotifier,
	PGN_VIEWER_NOTIFIER,
	type PgnViewerNotice,
} from './pgn-viewer-notifier';

describe('PgnViewerNotifier', () => {
	it('exposes a root-provided default so the token always resolves', () => {
		expect(PGN_VIEWER_NOTIFIER).toBeDefined();
		expect(consolePgnViewerNotifier).toBeTypeOf('object');
	});

	it('routes errors to console.error and info to console.info', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});

		consolePgnViewerNotifier.notify({
			message: 'Download failed',
			level: 'error',
			durationMs: 4000,
		});
		consolePgnViewerNotifier.notify({
			message: 'Cache cleared',
			level: 'info',
			durationMs: 4000,
		});

		expect(error).toHaveBeenCalledWith('[ngx-chessground] Download failed');
		expect(info).toHaveBeenCalledWith('[ngx-chessground] Cache cleared');

		error.mockRestore();
		info.mockRestore();
	});

	it('prefixes every message so the origin is unambiguous in a host console', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const notice: PgnViewerNotice = {
			message: 'boom',
			level: 'error',
			durationMs: 0,
		};

		consolePgnViewerNotifier.notify(notice);

		expect(error.mock.calls[0]?.[0]).toContain('[ngx-chessground]');
		error.mockRestore();
	});
});
