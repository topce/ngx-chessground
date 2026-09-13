import { Injectable, inject } from '@angular/core';
import { PgnViewerStoreService } from './pgn-viewer-store.service';

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
	/**
	 * Whether the FEN index was actually built for this entry. `false`/absent
	 * means {@link fenCache} holds empty sets (indexing was disabled), so
	 * position filters cannot be served from this entry.
	 */
	indexed?: boolean;
	/** Max half-moves replayed per game when the FEN index was built. */
	maxFenPlies?: number;
}

/**
 * Maps a PGN source (URL) to the content hash under which its parsed games and
 * FEN index are stored in IndexedDB.
 *
 * The content hash alone cannot be computed without first downloading and
 * decompressing the archive, so this bookmark lets the application detect a
 * usable cache entry at startup and skip the download entirely.
 */
export interface PgnSourceCacheEntry {
	/** SHA-256 hash of the decompressed PGN content. */
	pgnHash: string;
	/** Whether the cached entry contains a built FEN index. */
	indexed: boolean;
	/** Max half-moves replayed per game for the cached FEN index. */
	maxFenPlies: number;
	/** When this mapping was recorded (epoch ms). */
	createdAt: number;
}

/**
 * Cache entry stored in IndexedDB, keyed by PGN content hash.
 */
interface CacheEntry {
	/** SHA-256 hash of the PGN content; also the object-store key. */
	pgnHash: string;
	/** The parsed games, metadata and FEN index. */
	data: CachedPgnData;
}

/** IndexedDB database holding parsed PGN collections. */
const DB_NAME = 'NgxChessgroundPgnCache';
/** Schema version; bump together with an `onupgradeneeded` migration. */
const DB_VERSION = 1;
/** Object store (and `createdAt` index) holding {@link CacheEntry} records. */
const STORE_NAME = 'pgn_cache';
/** Maximum age for cache entries: 7 days. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Maximum number of cache entries. Oldest are evicted first. */
const MAX_ENTRIES = 10;
/** `localStorage` key holding the URL → content-hash bookmark map. */
const SOURCE_MAP_STORAGE_KEY = 'ngx-chessground-pgn-sources';
/** Maximum number of remembered sources (oldest pruned first). */
const MAX_SOURCE_ENTRIES = 20;

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
	/** Durable store used for the URL → content-hash bookmark map. */
	private readonly store = inject(PgnViewerStoreService);
	/** Cached open handle, so the database is opened at most once. */
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
	 *
	 * On desktop the parsed archives live on disk behind the local server, so
	 * the figures come from `/api/cache-info` instead of IndexedDB.
	 */
	async getCacheInfo(): Promise<{ count: number; estimatedBytes: number }> {
		if (this.store.isDesktop) {
			try {
				const response = await fetch('/api/cache-info', { cache: 'no-store' });
				if (response.ok) {
					const info: unknown = await response.json();
					const record = info as { count?: unknown; estimatedBytes?: unknown };
					return {
						count: typeof record.count === 'number' ? record.count : 0,
						estimatedBytes:
							typeof record.estimatedBytes === 'number'
								? record.estimatedBytes
								: 0,
					};
				}
			} catch {
				// Server unavailable — report an empty cache.
			}
			return { count: 0, estimatedBytes: 0 };
		}

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

	/**
	 * Looks up the cached content hash for a PGN source without touching the
	 * content. Used to detect a cache hit before downloading the archive.
	 *
	 * @param source — Source identifier (typically the PGN URL).
	 * @returns The bookmark entry, or `null` when the source is not remembered.
	 */
	getSourceEntry(source: string): PgnSourceCacheEntry | null {
		const record = this.readSourceMap()[source];
		if (record === null || typeof record !== 'object') return null;
		const entry = record as Partial<PgnSourceCacheEntry>;
		if (typeof entry.pgnHash !== 'string' || entry.pgnHash.length === 0) {
			return null;
		}
		return {
			pgnHash: entry.pgnHash,
			indexed: entry.indexed === true,
			maxFenPlies:
				typeof entry.maxFenPlies === 'number' &&
				Number.isFinite(entry.maxFenPlies)
					? entry.maxFenPlies
					: 0,
			createdAt:
				typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
					? entry.createdAt
					: 0,
		};
	}

	/**
	 * Remembers which content hash backs a PGN source, so a later session can
	 * restore it from the cache without downloading and decompressing it again.
	 */
	setSourceEntry(source: string, entry: PgnSourceCacheEntry): void {
		const map = this.readSourceMap();
		map[source] = entry;
		this.store.set(SOURCE_MAP_STORAGE_KEY, this.pruneSourceMap(map));
	}

	/** Removes all source bookmarks (used when the PGN cache is cleared). */
	clearSourceEntries(): void {
		this.store.remove(SOURCE_MAP_STORAGE_KEY);
	}

	/**
	 * Fills the desktop snapshot with the source bookmarks from disk.
	 *
	 * A no-op in the browser. Hosts should await this before reading
	 * {@link getSourceEntry} at startup on desktop.
	 */
	hydrateSourceEntries(): Promise<void> {
		return this.store.hydrate([SOURCE_MAP_STORAGE_KEY]);
	}

	/** Reads the URL → hash map, tolerating absent or corrupt payloads. */
	private readSourceMap(): Record<string, unknown> {
		const stored = this.store.get<unknown>(SOURCE_MAP_STORAGE_KEY);
		return stored !== null && typeof stored === 'object'
			? (stored as Record<string, unknown>)
			: {};
	}

	/** Keeps only the {@link MAX_SOURCE_ENTRIES} most recently recorded sources. */
	private pruneSourceMap(
		map: Record<string, unknown>,
	): Record<string, unknown> {
		const entries = Object.entries(map);
		if (entries.length <= MAX_SOURCE_ENTRIES) return map;

		const sorted = entries.sort(([, a], [, b]) => {
			const aDate = (a as Partial<PgnSourceCacheEntry>)?.createdAt ?? 0;
			const bDate = (b as Partial<PgnSourceCacheEntry>)?.createdAt ?? 0;
			return bDate - aDate;
		});
		return Object.fromEntries(sorted.slice(0, MAX_SOURCE_ENTRIES));
	}
}
