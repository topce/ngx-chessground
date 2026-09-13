import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgnViewerStoreService } from './pgn-viewer-store.service';

describe('PgnViewerStoreService', () => {
	beforeEach(() => {
		localStorage.clear();
		TestBed.configureTestingModule({});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		delete (window as Window & { __desktop__?: unknown }).__desktop__;
		localStorage.clear();
	});

	describe('browser', () => {
		it('round-trips values through localStorage', () => {
			const store = TestBed.inject(PgnViewerStoreService);
			expect(store.isDesktop).toBe(false);

			store.set('viewer-state', { white: 'Carlsen' });

			expect(
				JSON.parse(localStorage.getItem('viewer-state') ?? 'null'),
			).toEqual({ white: 'Carlsen' });
			expect(store.get('viewer-state')).toEqual({ white: 'Carlsen' });
			// A second instance reads the same key straight from localStorage.
			expect(store.get('missing')).toBeNull();
		});

		it('removes values from the snapshot and localStorage', () => {
			const store = TestBed.inject(PgnViewerStoreService);
			store.set('viewer-state', { white: 'Carlsen' });

			store.remove('viewer-state');

			expect(store.get('viewer-state')).toBeNull();
			expect(localStorage.getItem('viewer-state')).toBeNull();
		});

		it('resolves hydrate immediately', async () => {
			const store = TestBed.inject(PgnViewerStoreService);
			store.set('viewer-state', { white: 'Carlsen' });

			await expect(store.hydrate(['viewer-state'])).resolves.toBeUndefined();
			await expect(store.whenReady()).resolves.toBeUndefined();
			expect(store.get('viewer-state')).toEqual({ white: 'Carlsen' });
		});
	});

	describe('desktop', () => {
		beforeEach(() => {
			(window as Window & { __desktop__?: unknown }).__desktop__ = {
				openFileDialog: () => null,
			};
		});

		it('hydrates from the local server state API', async () => {
			const fetchMock = vi.fn(
				async (_url: string, _init?: RequestInit) =>
					new Response(JSON.stringify({ white: 'Nakamura' }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					}),
			);
			vi.stubGlobal('fetch', fetchMock);

			const store = TestBed.inject(PgnViewerStoreService);
			expect(store.isDesktop).toBe(true);
			expect(store.get('viewer-state')).toBeNull();

			await store.hydrate(['viewer-state']);

			expect(fetchMock).toHaveBeenCalledWith('/api/state/viewer-state', {
				cache: 'no-store',
			});
			expect(store.get('viewer-state')).toEqual({ white: 'Nakamura' });
		});

		it('writes changes to the local server state API', async () => {
			const fetchMock = vi.fn(
				async (_url: string, _init?: RequestInit) =>
					new Response(null, { status: 204 }),
			);
			vi.stubGlobal('fetch', fetchMock);

			const store = TestBed.inject(PgnViewerStoreService);
			store.set('pgn-sources', { a: 1 });
			store.remove('pgn-sources');
			// Writes are queued per key; let the queue drain.
			await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

			expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/state/pgn-sources');
			expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
				method: 'PUT',
				body: JSON.stringify({ a: 1 }),
			});
			expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' });
		});

		it('starts from defaults when the server is unavailable', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => {
					throw new Error('offline');
				}),
			);

			const store = TestBed.inject(PgnViewerStoreService);
			await expect(store.hydrate(['viewer-state'])).resolves.toBeUndefined();
			expect(store.get('viewer-state')).toBeNull();
			expect(() => store.set('viewer-state', {})).not.toThrow();
		});
	});
});
