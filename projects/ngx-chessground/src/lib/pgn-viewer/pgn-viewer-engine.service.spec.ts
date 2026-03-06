import { TestBed } from '@angular/core/testing';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { FilterCriteria, WorkerResponse } from './pgn-processor.worker';
import { PgnViewerEngineService } from './pgn-viewer-engine.service';

class MockWorker {
	static instances: MockWorker[] = [];

	readonly messages: unknown[] = [];
	onmessage: ((event: MessageEvent) => void) | null = null;
	terminated = false;

	constructor(readonly script: unknown) {
		MockWorker.instances.push(this);
	}

	postMessage(message: unknown): void {
		this.messages.push(message);
	}

	terminate(): void {
		this.terminated = true;
	}

	emit(data: unknown): void {
		this.onmessage?.({ data } as MessageEvent);
	}

	static reset(): void {
		MockWorker.instances = [];
	}
}

describe('PgnViewerEngineService', () => {
	beforeEach(() => {
		MockWorker.reset();
		vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);
		TestBed.configureTestingModule({});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('initializes workers, forwards messages, and disposes them', () => {
		const service = TestBed.inject(PgnViewerEngineService);
		const onPgnMessage = vi.fn<(data: WorkerResponse) => void>();
		const onStockfishMessage = vi.fn<(event: MessageEvent) => void>();
		const onError = vi.fn<(message: string, error?: unknown) => void>();

		expect(
			service.initialize({ onPgnMessage, onStockfishMessage, onError }),
		).toBe(true);
		expect(MockWorker.instances).toHaveLength(2);

		const [pgnWorker, stockfishWorker] = MockWorker.instances;
		expect(stockfishWorker.messages).toEqual(['uci']);

		const filterCriteria: FilterCriteria = {
			white: 'Carlsen',
			black: '',
			result: '1-0',
			moves: false,
			ignoreColor: false,
			targetMoves: [],
			minWhiteRating: 0,
			minBlackRating: 0,
			maxWhiteRating: 0,
			maxBlackRating: 0,
			eco: '',
			timeControl: '',
			event: '',
		};

		service.loadPgn('test-pgn', 1);
		service.filterGames(filterCriteria, 2);
		service.loadGame(4, 3);
		expect(service.analyzePosition('fen-string', 18)).toBe(true);

		expect(pgnWorker.messages).toEqual([
			{ type: 'load', payload: 'test-pgn', id: 1 },
			{ type: 'filter', payload: filterCriteria, id: 2 },
			{ type: 'loadGame', payload: 4, id: 3 },
		]);
		expect(stockfishWorker.messages).toEqual([
			'uci',
			'stop',
			'position fen fen-string',
			'go depth 18',
		]);

		const response: WorkerResponse = {
			type: 'filter',
			id: 2,
			payload: [4],
		};
		pgnWorker.emit(response);
		stockfishWorker.emit({ data: 'bestmove e2e4' });

		expect(onPgnMessage).toHaveBeenCalledWith(response);
		expect(onStockfishMessage).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();

		service.dispose();
		expect(pgnWorker.terminated).toBe(true);
		expect(
			stockfishWorker.messages[stockfishWorker.messages.length - 1],
		).toBe('quit');
		expect(stockfishWorker.terminated).toBe(true);
	});

	it('reports unsupported environments without workers', () => {
		vi.stubGlobal('Worker', undefined);
		const service = TestBed.inject(PgnViewerEngineService);
		const onError = vi.fn<(message: string, error?: unknown) => void>();

		expect(
			service.initialize({
				onPgnMessage: vi.fn(),
				onStockfishMessage: vi.fn(),
				onError,
			}),
		).toBe(false);
		expect(onError).toHaveBeenCalledWith(
			'Web Workers are not supported in this environment.',
		);
	});
});