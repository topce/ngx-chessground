import { Injectable } from '@angular/core';

/**
 * Serialized form of the worker's cached state for IndexedDB persistence.
 *
 * The FEN cache is stored as `[gameIndex, normalizedFen[]][]` (serialized
 * from `Map<number, Set<string>>`) so it survives structured clone.
 */
export interface CachedPgnData {
	/** Raw PGN text for each game, split by `[Event ...]` header. */
	games: string[];
	/** Parsed metadata for each game (headers only, no move data). */
	gameMetadata: import('./pgn-processor.worker').GameMetadata[];
	/**
	 * Serialized FEN position cache.
	 * Each entry: `[gameIndex, normalizedFenString[]]`.
	 * The FEN strings are normalized (4-field: piece placement, active color,
	 * castling, en passant) and deduplicated per game.
	 */
	fenCache: [number, string[]][];
	/** When this cache entry was created (epoch ms). */
	createdAt: number;
}

/**
 * Cache entry stored in IndexedDB, keyed by PGN content hash.
 */
interface CacheEntry {
	pgnHash: string;
	data: CachedPgnData;
}

const DB_NAME = 'NgxChessgroundPgnCache';
const DB_VERSION = 1;
const STORE_NAME = 'pgn_cache';
/** Maximum age for cache entries: 7 days. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Maximum number of cache entries. Oldest are evicted first. */
const MAX_ENTRIES = 10;

/**
 * Service for caching parsed PGN data (games, metadata, FEN positions) in
 * IndexedDB. Allows re-opening a previously loaded PGN without re-parsing
 * the entire file.
 *
 * Uses raw IndexedDB (no external dependency). Provided at root level so a
 * single database connection is shared across the application.
 */
@Injectable({ providedIn: 'root' })
export class PgnCacheService {
	private dbPromise: Promise<IDBDatabase> | null = null;

	/**
	 * Opens (or creates) the IndexedDB database and returns a handle.
	 */
	private async getDb(): Promise<IDBDatabase> {
		if (this.dbPromise) return this.dbPromise;

		this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, {
						keyPath: 'pgnHash',
					});
					store.createIndex('createdAt', 'data.createdAt', {
						unique: false,
					});
				}
			};

			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(new Error(`IndexedDB open error: ${request.error}`));
		});

		return this.dbPromise;
	}

	/**
	 * Computes a SHA-256 hex digest of the given string using the
	 * SubtleCrypto API.
	 */
	async hashPgn(pgn: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(pgn);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	/**
	 * Retrieves cached PGN data by hash, or `null` if not found or expired.
	 *
	 * @param pgnHash — SHA-256 hash of the original PGN string.
	 * @param ttlMs — Time-to-live in milliseconds (default 7 days).
	 */
	async getCached(
		pgnHash: string,
		ttlMs = DEFAULT_TTL_MS,
	): Promise<CachedPgnData | null> {
		try {
			const db = await this.getDb();
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			const request = store.get(pgnHash);

			const result = await new Promise<CacheEntry | undefined>(
				(resolve, reject) => {
					request.onsuccess = () => resolve(request.result ?? undefined);
					request.onerror = () => reject(request.error);
				},
			);

			if (!result) return null;

			// Check TTL
			const age = Date.now() - result.data.createdAt;
			if (age > ttlMs) {
				// Expired — remove it
				this.deleteEntry(pgnHash);
				return null;
			}

			return result.data;
		} catch {
			return null;
		}
	}

	/**
	 * Stores parsed PGN data in the cache, keyed by the PGN content hash.
	 *
	 * Automatically evicts the oldest entries when the cache exceeds
	 * {@link MAX_ENTRIES}.
	 */
	async setCache(pgnHash: string, data: CachedPgnData): Promise<void> {
		try {
			const db = await this.getDb();

			// Evict old entries if over limit
			await this.evictIfNeeded(db);

			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			store.put({ pgnHash, data } as CacheEntry);

			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} catch {
			// Silently ignore storage errors (e.g. quota exceeded)
		}
	}

	/**
	 * Deletes a single cache entry by hash.
	 */
	private async deleteEntry(pgnHash: string): Promise<void> {
		try {
			const db = await this.getDb();
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			store.delete(pgnHash);
		} catch {
			// Silently ignore
		}
	}

	/**
	 * Evicts the oldest entries when the store exceeds {@link MAX_ENTRIES}.
	 */
	private async evictIfNeeded(db: IDBDatabase): Promise<void> {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const countRequest = store.count();

		const count = await new Promise<number>((resolve, reject) => {
			countRequest.onsuccess = () => resolve(countRequest.result);
			countRequest.onerror = () => reject(countRequest.error);
		});

		if (count < MAX_ENTRIES) return;

		// Need to evict oldest entries
		const index = store.index('createdAt');
		const range = IDBKeyRange.lowerBound(0);
		const cursorRequest = index.openCursor(range, 'next');

		const toDelete: string[] = [];
		await new Promise<void>((resolve, reject) => {
			cursorRequest.onsuccess = () => {
				const cursor = cursorRequest.result;
				if (cursor) {
					toDelete.push((cursor.value as CacheEntry).pgnHash);
					if (toDelete.length < count - MAX_ENTRIES + 1) {
						cursor.continue();
					} else {
						resolve();
					}
				} else {
					resolve();
				}
			};
			cursorRequest.onerror = () => reject(cursorRequest.error);
		});

		if (toDelete.length === 0) return;

		// Delete in a separate write transaction
		const deleteTx = db.transaction(STORE_NAME, 'readwrite');
		const deleteStore = deleteTx.objectStore(STORE_NAME);
		for (const hash of toDelete) {
			deleteStore.delete(hash);
		}
	}

	/**
	 * Removes all cached PGN data from IndexedDB.
	 */
	async clearCache(): Promise<void> {
		try {
			const db = await this.getDb();
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			store.clear();
			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
		} catch {
			// Silently ignore
		}
	}

	/**
	 * Returns the number of cached entries and their total estimated size.
	 */
	async getCacheInfo(): Promise<{ count: number; estimatedBytes: number }> {
		try {
			const db = await this.getDb();
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			const countRequest = store.count();

			const count = await new Promise<number>((resolve, reject) => {
				countRequest.onsuccess = () => resolve(countRequest.result);
				countRequest.onerror = () => reject(countRequest.error);
			});

			// Estimate size by serializing all entries
			let estimatedBytes = 0;
			const cursorRequest = store.openCursor();
			await new Promise<void>((resolve, reject) => {
				cursorRequest.onsuccess = () => {
					const cursor = cursorRequest.result;
					if (cursor) {
						const json = JSON.stringify(cursor.value);
						estimatedBytes += new TextEncoder().encode(json).length;
						cursor.continue();
					} else {
						resolve();
					}
				};
				cursorRequest.onerror = () => reject(cursorRequest.error);
			});

			return { count, estimatedBytes };
		} catch {
			return { count: 0, estimatedBytes: 0 };
		}
	}
}
