import { describe, expect, it } from 'vitest';
import {
	isLichessBroadcastUrl,
	lichessBroadcastUrl,
	resolveBroadcastUrl,
} from './lichess-broadcast-url';

describe('lichessBroadcastUrl', () => {
	it('zero-pads single-digit months', () => {
		expect(lichessBroadcastUrl(2026, 3)).toBe(
			'lichess/broadcast/lichess_db_broadcast_2026-03.pgn.zst',
		);
	});

	it('leaves two-digit months untouched', () => {
		expect(lichessBroadcastUrl(2026, 12)).toBe(
			'lichess/broadcast/lichess_db_broadcast_2026-12.pgn.zst',
		);
	});
});

describe('isLichessBroadcastUrl', () => {
	it('recognises its own output', () => {
		expect(isLichessBroadcastUrl(lichessBroadcastUrl(2024, 7))).toBe(true);
	});

	it('rejects hand-entered and unrelated URLs', () => {
		expect(isLichessBroadcastUrl('https://example.com/my.pgn')).toBe(false);
		expect(isLichessBroadcastUrl('')).toBe(false);
		expect(
			isLichessBroadcastUrl(
				'lichess/broadcast/lichess_db_broadcast_24-1.pgn.zst',
			),
		).toBe(false);
	});
});

describe('resolveBroadcastUrl', () => {
	it('follows the picker when the field is empty', () => {
		expect(resolveBroadcastUrl({ year: 2026, month: 8 }, undefined)).toBe(
			lichessBroadcastUrl(2026, 8),
		);
	});

	it('follows the picker when the field holds a generated URL', () => {
		expect(
			resolveBroadcastUrl(
				{ year: 2026, month: 9 },
				lichessBroadcastUrl(2026, 8),
			),
		).toBe(lichessBroadcastUrl(2026, 9));
	});

	it('preserves a custom URL across picker changes', () => {
		const custom = 'https://example.com/tournament.pgn';
		expect(resolveBroadcastUrl({ year: 2026, month: 9 }, custom)).toBe(custom);
	});

	it('preserves a restored non-broadcast URL', () => {
		const restored = 'downloads/local-archive.pgn.zst';
		expect(resolveBroadcastUrl({ year: 2026, month: 9 }, restored)).toBe(
			restored,
		);
	});

	it('does not invent a URL when the picker is unset', () => {
		expect(resolveBroadcastUrl({ year: 0, month: 0 }, undefined)).toBe('');
		expect(resolveBroadcastUrl({ year: 2026, month: 0 }, undefined)).toBe('');
	});

	it('keeps the previous generated URL while the picker is unset', () => {
		const previous = lichessBroadcastUrl(2026, 8);
		expect(resolveBroadcastUrl({ year: 0, month: 0 }, previous)).toBe(previous);
	});
});
