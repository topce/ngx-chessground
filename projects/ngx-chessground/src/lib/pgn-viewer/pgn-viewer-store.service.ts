import { Injectable } from '@angular/core';
import { isDesktopRuntime } from './desktop-runtime';

/**
 * Durable JSON key/value store for the PGN viewer.
 *
 * - **Browser** — `localStorage`, synchronous and unchanged.
 * - **Desktop** — the local app server's `/api/state/<key>` endpoints, because
 *   the Deno Desktop webview is served from a random localhost port on every
 *   launch and therefore gets a fresh `localStorage`/`IndexedDB` each time.
 *
 * Reads are synchronous through an in-memory snapshot. In the browser the
 * snapshot is filled on demand from `localStorage`; on desktop it is filled by
 * {@link hydrate}, which the viewer awaits before loading games.
 */
@Injectable({ providedIn: 'root' })
export class PgnViewerStoreService {
	/** Whether the durable backend is the desktop app's on-disk API. */
	private readonly desktop = isDesktopRuntime();
	/** Synchronous snapshot of every key read or written this session. */
	private readonly memory = new Map<string, unknown>();
	/** Serializes writes per key so an earlier value can never land last. */
	private readonly writeQueue = new Map<string, Promise<void>>();
	/** In-flight (or completed) {@link hydrate} call; `null` until first use. */
	private hydration: Promise<void> | null = null;

	/** `true` when this store is backed by the desktop app's on-disk API. */
	get isDesktop(): boolean {
		return this.desktop;
	}

	/**
	 * Reads a previously stored value.
	 *
	 * @returns The parsed value, or `null` when the key is unknown.
	 */
	get<T>(key: string): T | null {
		if (this.memory.has(key)) return this.memory.get(key) as T;
		if (!this.desktop) {
			const value = this.readLocal(key);
			if (value !== null) {
				this.memory.set(key, value);
				return value as T;
			}
		}
		return null;
	}

	/** Stores a value, writing through to the active backend. */
	set(key: string, value: unknown): void {
		this.memory.set(key, value);
		if (this.desktop) {
			this.queueServerWrite(key, value);
		} else {
			this.writeLocal(key, value);
		}
	}

	/** Removes a value from both the snapshot and the active backend. */
	remove(key: string): void {
		this.memory.delete(key);
		if (this.desktop) {
			this.queueServerRequest(key, 'DELETE');
			return;
		}
		try {
			localStorage.removeItem(key);
		} catch {
			// Storage unavailable — nothing to remove.
		}
	}

	/**
	 * Fills the in-memory snapshot from the active backend.
	 *
	 * A no-op in the browser (localStorage is synchronous) and idempotent on
	 * desktop. Resolve {@link whenReady} before reading values that must be
	 * available at startup.
	 */
	hydrate(keys: readonly string[]): Promise<void> {
		if (!this.desktop) {
			for (const key of keys) this.get(key);
			return Promise.resolve();
		}
		if (!this.hydration) {
			this.hydration = Promise.all(
				keys.map((key) => this.fetchServer(key)),
			).then(() => undefined);
		}
		return this.hydration;
	}

	/** Resolves once {@link hydrate} has completed (immediately if not called). */
	whenReady(): Promise<void> {
		return this.hydration ?? Promise.resolve();
	}

	/** Loads one key from the desktop server into the snapshot. */
	private async fetchServer(key: string): Promise<void> {
		try {
			const response = await fetch(this.serverUrl(key), {
				cache: 'no-store',
			});
			if (!response.ok) return;
			this.memory.set(key, await response.json());
		} catch {
			// Server unavailable — start from defaults instead of failing startup.
		}
	}

	/** Enqueues a JSON write so writes for one key stay ordered. */
	private queueServerWrite(key: string, value: unknown): void {
		this.queueServerRequest(key, 'PUT', JSON.stringify(value));
	}

	/**
	 * Enqueues a request for a key after any request already in flight for it.
	 */
	private queueServerRequest(
		key: string,
		method: 'PUT' | 'DELETE',
		body?: string,
	): void {
		const previous = this.writeQueue.get(key) ?? Promise.resolve();
		const next = previous.then(async () => {
			try {
				await fetch(this.serverUrl(key), {
					method,
					headers: body ? { 'content-type': 'application/json' } : undefined,
					body,
					keepalive: true,
				});
			} catch {
				// Best effort: a lost write only costs one restart's settings.
			}
		});
		this.writeQueue.set(key, next);
	}

	/** Builds the desktop endpoint URL for one state key. */
	private serverUrl(key: string): string {
		return `/api/state/${encodeURIComponent(key)}`;
	}

	/** Reads and parses one key from `localStorage`, tolerating corruption. */
	private readLocal(key: string): unknown | null {
		try {
			const raw = localStorage.getItem(key);
			return raw === null ? null : JSON.parse(raw);
		} catch {
			return null;
		}
	}

	/** Serializes and writes one key to `localStorage`; failures are ignored. */
	private writeLocal(key: string, value: unknown): void {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {
			// Storage unavailable or full — persistence is best-effort.
		}
	}
}
