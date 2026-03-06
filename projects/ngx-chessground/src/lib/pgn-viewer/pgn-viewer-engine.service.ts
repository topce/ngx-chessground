import { Injectable } from '@angular/core';
import type {
	FilterCriteria,
	WorkerResponse,
} from './pgn-processor.worker';

interface PgnViewerEngineCallbacks {
	onPgnMessage: (data: WorkerResponse) => void;
	onStockfishMessage: (event: MessageEvent) => void;
	onError?: (message: string, error?: unknown) => void;
}

@Injectable({
	providedIn: 'root',
})
export class PgnViewerEngineService {
	private pgnWorker: Worker | null = null;
	private stockfishWorker: Worker | null = null;

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

	loadPgn(pgn: string, id: number): void {
		this.pgnWorker?.postMessage({ type: 'load', payload: pgn, id });
	}

	filterGames(payload: FilterCriteria, id: number): void {
		this.pgnWorker?.postMessage({ type: 'filter', payload, id });
	}

	loadGame(index: number, id: number): void {
		this.pgnWorker?.postMessage({ type: 'loadGame', payload: index, id });
	}

	analyzePosition(fen: string, depth: number): boolean {
		if (!this.stockfishWorker) {
			return false;
		}

		this.stockfishWorker.postMessage('stop');
		this.stockfishWorker.postMessage(`position fen ${fen}`);
		this.stockfishWorker.postMessage(`go depth ${depth}`);
		return true;
	}

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