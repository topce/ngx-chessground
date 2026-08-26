import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

		// Complete the UCI handshake so analysis commands are issued immediately.
		stockfishWorker.emit('uciok');
		expect(stockfishWorker.messages).toEqual([
			'uci',
			'setoption name MultiPV value 3',
			'isready',
		]);
		stockfishWorker.emit('readyok');

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
			broadcastName: '',
			filterByFen: false,
			targetFen: '',
			sortAscending: false,
			upsetEnabled: false,
			upsetWin: false,
			upsetDraw: false,
			minUpsetEloDiff: 0,
		};

		service.loadPgn('test-pgn', 1);
		service.filterGames(filterCriteria, 2);
		service.loadGame(4, 3);
		expect(service.analyzePosition('fen-string', 18)).toBe(true);

		expect(pgnWorker.messages).toEqual([
			{
				type: 'load',
				payload: {
					pgn: 'test-pgn',
					indexStartPositions: false,
					maxFenPlies: 30,
				},
				id: 1,
			},
			{ type: 'filter', payload: filterCriteria, id: 2 },
			{ type: 'loadGame', payload: 4, id: 3 },
		]);
		expect(stockfishWorker.messages).toEqual([
			'uci',
			'setoption name MultiPV value 3',
			'isready',
			'stop',
			'setoption name MultiPV value 3',
			'position fen fen-string',
			'go depth 18',
		]);

		const response: WorkerResponse = {
			type: 'filter',
			id: 2,
			payload: [4],
		};
		pgnWorker.emit(response);
		stockfishWorker.emit('bestmove e2e4');

		expect(onPgnMessage).toHaveBeenCalledWith(response);
		expect(onStockfishMessage).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();

		service.dispose();
		expect(pgnWorker.terminated).toBe(true);
		expect(stockfishWorker.messages[stockfishWorker.messages.length - 1]).toBe(
			'quit',
		);
		expect(stockfishWorker.terminated).toBe(true);
	});

	it('queues analysis until the UCI handshake completes', () => {
		const service = TestBed.inject(PgnViewerEngineService);
		const onStockfishMessage = vi.fn<(event: MessageEvent) => void>();
		service.initialize({
			onPgnMessage: vi.fn(),
			onStockfishMessage,
		});

		const [, stockfishWorker] = MockWorker.instances;

		// Before the engine is ready the request is queued, not sent.
		expect(service.analyzePosition('fen-early', 10)).toBe(true);
		expect(stockfishWorker.messages).toEqual(['uci']);

		// uciok configures the engine and asks for readiness.
		stockfishWorker.emit('uciok');
		expect(stockfishWorker.messages).toEqual([
			'uci',
			'setoption name MultiPV value 3',
			'isready',
		]);

		// readyok flushes the queued analysis.
		stockfishWorker.emit('readyok');
		expect(stockfishWorker.messages).toEqual([
			'uci',
			'setoption name MultiPV value 3',
			'isready',
			'stop',
			'setoption name MultiPV value 3',
			'position fen fen-early',
			'go depth 10',
		]);
		expect(onStockfishMessage).not.toHaveBeenCalled();
	});

	it('swallows stale output from an aborted search', () => {
		const service = TestBed.inject(PgnViewerEngineService);
		const onStockfishMessage = vi.fn<(event: MessageEvent) => void>();
		service.initialize({
			onPgnMessage: vi.fn(),
			onStockfishMessage,
		});

		const [, stockfishWorker] = MockWorker.instances;
		stockfishWorker.emit('uciok');
		stockfishWorker.emit('readyok');

		// Start the first search and receive one of its info lines.
		service.analyzePosition('fen-a', 18);
		stockfishWorker.emit('info depth 1 multipv 1 score cp 30 pv e2e4');
		expect(onStockfishMessage).toHaveBeenCalledTimes(1);

		// Abort it by starting a new search.
		service.analyzePosition('fen-b', 18);

		// Trailing output from the aborted search must be swallowed.
		stockfishWorker.emit('info depth 2 multipv 1 score cp 40 pv e2e4');
		stockfishWorker.emit('bestmove e2e4');
		expect(onStockfishMessage).toHaveBeenCalledTimes(1);

		// Output from the new search is forwarded normally.
		stockfishWorker.emit('info depth 1 multipv 1 score cp 50 pv d2d4');
		stockfishWorker.emit('bestmove d2d4');
		expect(onStockfishMessage).toHaveBeenCalledTimes(3);
		expect(onStockfishMessage.mock.calls.map((call) => call[0].data)).toEqual([
			'info depth 1 multipv 1 score cp 30 pv e2e4',
			'info depth 1 multipv 1 score cp 50 pv d2d4',
			'bestmove d2d4',
		]);
	});

	it('delivers loadGame responses with the correct correlation ID', () => {
		const service = TestBed.inject(PgnViewerEngineService);
		const onPgnMessage = vi.fn<(data: WorkerResponse) => void>();
		const onStockfishMessage = vi.fn();

		service.initialize({ onPgnMessage, onStockfishMessage });

		const [pgnWorker] = MockWorker.instances;

		// Send loadGame with id=5
		service.loadGame(2, 5);
		expect(pgnWorker.messages).toContainEqual({
			type: 'loadGame',
			payload: 2,
			id: 5,
		});

		// Emit response with matching ID
		const response: WorkerResponse = {
			type: 'loadGame',
			id: 5,
			payload: {
				moves: ['e4', 'd5'],
				pgn: '[White "Player"]\n\n1. e4 d5  *',
				evaluations: [null, null],
			},
		};
		pgnWorker.emit(response);
		expect(onPgnMessage).toHaveBeenCalledWith(response);

		// The stale-response guard (in the component) relies on this ID matching
		// the latest currentLoadGameId. If a stale response with an older ID
		// arrives out of order, it is ignored by the component.
	});

	it('forwards clearCache messages to the PGN worker', () => {
		const service = TestBed.inject(PgnViewerEngineService);
		service.initialize({
			onPgnMessage: vi.fn(),
			onStockfishMessage: vi.fn(),
		});

		const [pgnWorker] = MockWorker.instances;
		service.clearCache(42);

		expect(pgnWorker.messages).toContainEqual({
			type: 'clearCache',
			id: 42,
		});
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
