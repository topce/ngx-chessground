import { describe, expect, it } from 'vitest';
import type { GameMetadata } from './pgn-processor.worker';
import { isUpsetGame } from './upset';

function meta(partial: Partial<GameMetadata>): GameMetadata {
	return {
		number: 1,
		white: 'White Player',
		black: 'Black Player',
		result: '*',
		whiteElo: 0,
		blackElo: 0,
		...partial,
	};
}

describe('isUpsetGame', () => {
	it('accepts a weaker white player winning', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 2200, blackElo: 2500, result: '1-0' }),
				true,
				false,
				0,
			),
		).toBe(true);
	});

	it('accepts a weaker black player winning', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 2600, blackElo: 2400, result: '0-1' }),
				true,
				false,
				0,
			),
		).toBe(true);
	});

	it('accepts a weaker player drawing', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 2300, blackElo: 2700, result: '1/2-1/2' }),
				false,
				true,
				0,
			),
		).toBe(true);
	});

	it('rejects when the stronger player wins', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 2600, blackElo: 2400, result: '1-0' }),
				true,
				false,
				0,
			),
		).toBe(false);
	});

	it('rejects a draw when draws are not enabled', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 2200, blackElo: 2500, result: '½-½' }),
				true,
				false,
				0,
			),
		).toBe(false);
	});

	it('rejects when the rating gap is below the minimum', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 2400, blackElo: 2450, result: '1-0' }),
				true,
				false,
				100,
			),
		).toBe(false);
	});

	it('rejects games missing one player Elo', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 0, blackElo: 2500, result: '1-0' }),
				true,
				false,
				0,
			),
		).toBe(false);
	});

	it('rejects when no outcome is enabled', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 2200, blackElo: 2500, result: '1-0' }),
				false,
				false,
				0,
			),
		).toBe(false);
	});

	it('treats equal ratings as no upset', () => {
		expect(
			isUpsetGame(
				meta({ whiteElo: 2500, blackElo: 2500, result: '1-0' }),
				true,
				false,
				0,
			),
		).toBe(false);
		expect(
			isUpsetGame(
				meta({ whiteElo: 2500, blackElo: 2500, result: '0-1' }),
				true,
				false,
				0,
			),
		).toBe(false);
	});
});
