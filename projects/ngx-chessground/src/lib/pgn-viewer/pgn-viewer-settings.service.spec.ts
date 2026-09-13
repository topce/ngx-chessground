import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_PERSISTED_FILTER_STATE,
	type PersistedViewerState,
	PGN_VIEWER_STATE_STORAGE_KEY,
	PGN_VIEWER_STATE_VERSION,
	PgnViewerSettingsService,
} from './pgn-viewer-settings.service';

function fullState(): PersistedViewerState {
	return {
		version: PGN_VIEWER_STATE_VERSION,
		url: 'lichess/broadcast/lichess_db_broadcast_2024-05.pgn.zst',
		lichessYear: 2024,
		lichessMonth: 5,
		filters: {
			...DEFAULT_PERSISTED_FILTER_STATE,
			white: 'Carlsen',
			result: ['1-0', '1/2-1/2'],
			ignoreColor: true,
			ratingEnabled: true,
			whiteRating: '2700',
			whiteRatingMax: '2900',
			timeControl: ['180+2'],
			byFenEnabled: true,
			fen: 'start-fen',
			sortAscending: true,
		},
	};
}

describe('PgnViewerSettingsService', () => {
	let service: PgnViewerSettingsService;

	beforeEach(() => {
		localStorage.clear();
		TestBed.configureTestingModule({});
		service = TestBed.inject(PgnViewerSettingsService);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('round-trips a full state through localStorage', () => {
		const state = fullState();
		service.save(state);

		expect(service.load()).toEqual(state);
	});

	it('returns null when nothing is stored', () => {
		expect(service.load()).toBeNull();
	});

	it('returns null for malformed JSON', () => {
		localStorage.setItem(PGN_VIEWER_STATE_STORAGE_KEY, '{not json');
		expect(service.load()).toBeNull();
	});

	it('returns null when the stored payload is not an object', () => {
		localStorage.setItem(PGN_VIEWER_STATE_STORAGE_KEY, '"a string"');
		expect(service.load()).toBeNull();
	});

	it('rejects payloads with a missing or incompatible version', () => {
		localStorage.setItem(
			PGN_VIEWER_STATE_STORAGE_KEY,
			JSON.stringify({ url: 'x', lichessYear: 2024, lichessMonth: 5 }),
		);
		expect(service.load()).toBeNull();

		localStorage.setItem(
			PGN_VIEWER_STATE_STORAGE_KEY,
			JSON.stringify({ version: PGN_VIEWER_STATE_VERSION + 1, filters: {} }),
		);
		expect(service.load()).toBeNull();
	});

	it('normalizes missing filter fields to their defaults', () => {
		localStorage.setItem(
			PGN_VIEWER_STATE_STORAGE_KEY,
			JSON.stringify({
				version: PGN_VIEWER_STATE_VERSION,
				url: 'custom.pgn',
				lichessYear: 2023,
				lichessMonth: 11,
				filters: { white: 'Nakamura', timeControl: ['300+0', 42] },
			}),
		);

		const state = service.load();
		expect(state).not.toBeNull();
		expect(state?.url).toBe('custom.pgn');
		expect(state?.lichessYear).toBe(2023);
		expect(state?.lichessMonth).toBe(11);
		expect(state?.filters.white).toBe('Nakamura');
		expect(state?.filters.timeControl).toEqual(['300+0']);
		expect(state?.filters.black).toBe(DEFAULT_PERSISTED_FILTER_STATE.black);
		expect(state?.filters.ratingEnabled).toBe(false);
		expect(state?.filters.result).toEqual([]);
	});

	it('ignores invalid scalar types in a stored payload', () => {
		localStorage.setItem(
			PGN_VIEWER_STATE_STORAGE_KEY,
			JSON.stringify({
				version: PGN_VIEWER_STATE_VERSION,
				url: 123,
				lichessYear: 'nope',
				lichessMonth: null,
				filters: {
					white: 7,
					moves: 'yes',
					timeControl: 'not-an-array',
				},
			}),
		);

		const state = service.load();
		expect(state?.url).toBe('');
		expect(state?.lichessYear).toBe(0);
		expect(state?.lichessMonth).toBe(0);
		expect(state?.filters.white).toBe('');
		expect(state?.filters.moves).toBe(false);
		expect(state?.filters.timeControl).toEqual([]);
	});

	it('clears the stored payload', () => {
		service.save(fullState());
		service.clear();
		expect(service.load()).toBeNull();
	});

	it('survives a localStorage that throws', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			},
			removeItem: () => {
				throw new Error('denied');
			},
		});

		// Writes still succeed in memory for this session, and clearing works
		// even though the backing store rejects every call.
		expect(() => service.save(fullState())).not.toThrow();
		expect(service.load()).not.toBeNull();
		expect(() => service.clear()).not.toThrow();
		expect(service.load()).toBeNull();
	});

	it('hydrates without touching localStorage in the browser', async () => {
		await expect(service.hydrate()).resolves.toBeUndefined();
		expect(service.load()).toBeNull();
	});
});
