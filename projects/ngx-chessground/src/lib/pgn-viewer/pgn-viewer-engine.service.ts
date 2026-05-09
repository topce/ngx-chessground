import { Injectable } from '@angular/core';
import type {
	FilterCriteria,
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

		this.pgnWorker = new Worker(new URL('./pgn-processor.worker', import.meta.url));
		this.pgnWorker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
			callbacks.onPgnMessage(data);
		};

		try {
			this.stockfishWorker = new Worker('assets/stockfish/stockfish.js');
			this.stockfishWorker.onmessage = callbacks.onStockfishMessage;
			this.stockfishWorker.postMessage('uci');
		} catch (error) {
			callbacks.onError?.('Failed to load Stockfish worker.', error);
		}

		return true;
	}

	/**
	 * Sends raw PGN text to the parser worker for processing.
	 *
	 * @param pgn — Raw PGN string (supports multi-game, compressed formats).
	 * @param id — Correlation ID echoed back in the worker response for matching requests.
	 */
	loadPgn(pgn: string, id: number): void {
		this.pgnWorker?.postMessage({ type: 'load', payload: pgn, id });
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
	 * Stops any in-progress analysis before starting the new one.
	 *
	 * @param fen — FEN string of the position to analyze.
	 * @param depth — Search depth in plies.
	 * @returns `false` if the Stockfish worker is not available, `true` otherwise.
	 */
	analyzePosition(fen: string, depth: number): boolean {
		if (!this.stockfishWorker) {
			return false;
		}

		this.stockfishWorker.postMessage('stop');
		this.stockfishWorker.postMessage(`position fen ${fen}`);
		this.stockfishWorker.postMessage(`go depth ${depth}`);
		return true;
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
	}
}