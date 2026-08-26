import { Injectable } from '@angular/core';
import type {
	FilterCriteria,
	LoadPayload,
	WorkerMessage,
	WorkerResponse,
} from './pgn-processor.worker';

/**
 * Callback interface for PGN viewer engine events.
 * Consumer components implement these handlers to react to worker messages.
 */
interface PgnViewerEngineCallbacks {
	/** Called when the PGN processor worker sends a response (parse, filter, load results). */
	onPgnMessage: (data: WorkerResponse) => void;
	/** Called when the Stockfish worker sends analysis output (UCI protocol messages). */
	onStockfishMessage: (event: MessageEvent) => void;
	/** Optional error handler for worker initialization failures. */
	onError?: (message: string, error?: unknown) => void;
}

/**
 * Service that manages Web Workers for background PGN processing and Stockfish analysis.
 *
 * Maintains two workers:
 * - **PGN processor** — parses/filters PGN data off the main thread using `pgn-processor.worker`.
 * - **Stockfish** — runs the Stockfish chess engine for position analysis via UCI protocol.
 *
 * Provided at root level so a single instance is shared across the application.
 * Callers must call {@link initialize} before using the service and {@link dispose} when done.
 */
@Injectable({
	providedIn: 'root',
})
export class PgnViewerEngineService {
	/** Web Worker for PGN parsing and filtering. */
	private pgnWorker: Worker | null = null;
	/** Web Worker running the Stockfish chess engine. */
	private stockfishWorker: Worker | null = null;
	/** True once Stockfish completes its UCI handshake (uciok → isready → readyok). */
	private stockfishReady = false;
	/** True while a `go` command is running and its `bestmove` has not arrived yet. */
	private searching = false;
	/**
	 * When true, drop engine output until the next `bestmove`. This swallows the
	 * trailing info + bestmove of a search that was aborted by `stop`, so it
	 * cannot be mistaken for the result of the search that replaced it.
	 */
	private ignoreUntilBestmove = false;
	/** Analysis request made while the engine was still booting; flushed once ready. */
	private pendingAnalysis: { fen: string; depth: number } | null = null;

	/**
	 * Creates and initializes both Web Workers.
	 *
	 * Disposes any existing workers first, then spawns new ones.
	 * The Stockfish worker is started in UCI mode immediately.
	 *
	 * @param callbacks — Event handlers for worker messages and errors.
	 * @returns `true` if workers were created successfully, `false` if Web Workers are unsupported.
	 */
	initialize(callbacks: PgnViewerEngineCallbacks): boolean {
		if (typeof Worker === 'undefined') {
			callbacks.onError?.('Web Workers are not supported in this environment.');
			return false;
		}

		this.dispose();
		this.stockfishReady = false;
		this.searching = false;
		this.ignoreUntilBestmove = false;
		this.pendingAnalysis = null;

		this.pgnWorker = new Worker(
			new URL('./pgn-processor.worker', import.meta.url),
		);
		this.pgnWorker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
			callbacks.onPgnMessage(data);
		};

		try {
			this.stockfishWorker = new Worker('assets/stockfish/stockfish.js');
			this.stockfishWorker.onmessage = (event: MessageEvent) => {
				const data = event.data;
				if (typeof data !== 'string') {
					callbacks.onStockfishMessage(event);
					return;
				}
				// Swallow the trailing output (info + bestmove) of a search that
				// was aborted by `stop`, until its `bestmove` closes it out.
				if (this.ignoreUntilBestmove) {
					if (data.startsWith('bestmove')) this.ignoreUntilBestmove = false;
					return;
				}
				// Drive the UCI handshake and queue analysis until ready.
				if (data.startsWith('uciok')) {
					this.stockfishWorker?.postMessage('setoption name MultiPV value 3');
					this.stockfishWorker?.postMessage('isready');
					return;
				}
				if (data.startsWith('readyok')) {
					this.stockfishReady = true;
					this.flushPendingAnalysis();
					return;
				}
				if (data.startsWith('bestmove')) {
					this.searching = false;
				}
				callbacks.onStockfishMessage(event);
			};
			this.stockfishWorker.postMessage('uci');
		} catch (error) {
			callbacks.onError?.('Failed to load Stockfish 18 worker.', error);
		}

		return true;
	}

	/**
	 * Sends raw PGN text and indexing options to the parser worker for processing.
	 *
	 * Supports IndexedDB caching via `pgnHash`. When provided, the worker
	 * checks its cache first and skips re-parsing if a valid entry exists.
	 *
	 * @param pgn — Raw PGN string (supports multi-game, compressed formats).
	 * @param id — Correlation ID echoed back in the worker response for matching requests.
	 * @param pgnHash — Optional SHA-256 hash for IndexedDB cache restore.
	 * @param indexStartPositions — Whether to include the starting position FEN in the index.
	 * @param maxFenPlies — Max half-moves to replay when building the FEN cache.
	 */
	loadPgn(
		pgn: string,
		id: number,
		pgnHash?: string,
		indexStartPositions: boolean = false,
		maxFenPlies: number = 30,
	): void {
		const payload: LoadPayload = {
			pgn,
			indexStartPositions,
			maxFenPlies,
		};
		const msg: WorkerMessage & { pgnHash?: string } = {
			type: 'load',
			payload,
			id,
		};
		if (pgnHash) {
			msg.pgnHash = pgnHash;
		}
		this.pgnWorker?.postMessage(msg);
	}

	/**
	 * Filters the parsed game list by the given criteria.
	 *
	 * @param payload — Filter criteria (player names, ECO, draw inclusion, opening moves, ratings).
	 * @param id — Correlation ID echoed back in the worker response.
	 */
	filterGames(payload: FilterCriteria, id: number): void {
		this.pgnWorker?.postMessage({ type: 'filter', payload, id });
	}

	/**
	 * Loads the full move data for a specific game by its index in the parsed list.
	 *
	 * @param index — Zero-based index of the game to load.
	 * @param id — Correlation ID echoed back in the worker response.
	 */
	loadGame(index: number, id: number): void {
		this.pgnWorker?.postMessage({ type: 'loadGame', payload: index, id });
	}

	/**
	 * Sends a FEN position to Stockfish for analysis at the given search depth.
	 *
	 * Stops any in-progress analysis before starting the new one. If the engine
	 * has not finished booting yet, the request is queued and issued once the
	 * UCI handshake completes.
	 *
	 * @param fen — FEN string of the position to analyze.
	 * @param depth — Search depth in plies.
	 * @returns `false` if the Stockfish worker is not available, `true` otherwise.
	 */
	analyzePosition(fen: string, depth: number): boolean {
		if (!this.stockfishWorker) {
			return false;
		}
		if (!this.stockfishReady) {
			// Engine still booting: remember the latest request and run it once
			// `readyok` arrives instead of silently dropping it.
			this.pendingAnalysis = { fen, depth };
			return true;
		}
		this.sendAnalysis(fen, depth);
		return true;
	}

	/**
	 * Aborts any in-flight search and starts a new one for `fen`.
	 */
	private sendAnalysis(fen: string, depth: number): void {
		if (!this.stockfishWorker) return;
		// If a search is still running, `stop` will make Stockfish emit a final
		// `bestmove` for it. Mark that output as stale so it is swallowed and
		// cannot be confused with the new search's result.
		if (this.searching) this.ignoreUntilBestmove = true;
		this.stockfishWorker.postMessage('stop');
		this.stockfishWorker.postMessage('setoption name MultiPV value 3');
		this.stockfishWorker.postMessage(`position fen ${fen}`);
		this.stockfishWorker.postMessage(`go depth ${depth}`);
		this.searching = true;
	}

	/** Runs the queued analysis request once the engine reports ready. */
	private flushPendingAnalysis(): void {
		if (!this.pendingAnalysis) return;
		const { fen, depth } = this.pendingAnalysis;
		this.pendingAnalysis = null;
		this.sendAnalysis(fen, depth);
	}

	/**
	 * Sends a message to the PGN worker to clear all cached data from IndexedDB.
	 */
	clearCache(id: number): void {
		this.pgnWorker?.postMessage({ type: 'clearCache', id });
	}

	/**
	 * Terminates both workers and releases resources.
	 *
	 * Sends a 'quit' command to Stockfish before terminating to allow
	 * the engine to shut down gracefully.
	 */
	dispose(): void {
		this.pgnWorker?.terminate();
		this.pgnWorker = null;

		if (this.stockfishWorker) {
			this.stockfishWorker.postMessage('quit');
			this.stockfishWorker.terminate();
			this.stockfishWorker = null;
		}

		this.stockfishReady = false;
		this.searching = false;
		this.ignoreUntilBestmove = false;
		this.pendingAnalysis = null;
	}
}
