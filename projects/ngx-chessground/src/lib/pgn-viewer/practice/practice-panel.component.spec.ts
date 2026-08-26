import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { PracticeMove } from '../pgn-viewer.types';
import { PracticePanelComponent } from './practice-panel.component';

describe('PracticePanelComponent', () => {
	async function createComponent() {
		await TestBed.configureTestingModule({
			imports: [PracticePanelComponent],
		}).compileComponents();
		const fixture = TestBed.createComponent(PracticePanelComponent);
		await fixture.whenStable();
		return { fixture, element: fixture.nativeElement as HTMLElement };
	}

	function button(element: HTMLElement, title: string): HTMLButtonElement {
		const btn = element.querySelector<HTMLButtonElement>(`[title="${title}"]`);
		expect(btn, `button with title "${title}"`).not.toBeNull();
		return btn as HTMLButtonElement;
	}

	it('renders the idle state and turn-based hint', async () => {
		const { element } = await createComponent();
		expect(element.textContent).toContain('Practice');
		expect(element.textContent).toContain('Stockfish idle');
		expect(element.textContent).toContain('move the side to move');
	});

	it('renders analysis state with evaluation and best move', async () => {
		const { fixture, element } = await createComponent();
		fixture.componentRef.setInput('isAnalyzing', true);
		fixture.componentRef.setInput('evaluation', '+0.32');
		fixture.componentRef.setInput('bestMoveInfo', {
			move: 'e4',
			score: '+0.32',
			pv: [
				{ san: 'e4', fen: 'x' },
				{ san: 'e5', fen: 'y' },
			],
		});
		await fixture.whenStable();

		expect(element.textContent).toContain('Analyzing…');
		expect(element.textContent).toContain('e4');
		expect(element.textContent).toContain('e5');
	});

	it('shows the completed evaluation once analysis finishes', async () => {
		const { fixture, element } = await createComponent();
		fixture.componentRef.setInput('isAnalyzing', false);
		fixture.componentRef.setInput('evaluation', '+0.32');
		await fixture.whenStable();

		expect(element.textContent).toContain('Eval');
		expect(element.textContent).toContain('+0.32');
		expect(element.textContent).not.toContain('Stockfish idle');
	});

	it('renders move pairs with per-move evaluations', async () => {
		const { fixture, element } = await createComponent();
		const moves: PracticeMove[] = [
			{ san: 'e4', evaluation: '+0.32' },
			{ san: 'e5', evaluation: '-0.12' },
			{ san: 'Nf3', evaluation: null },
		];
		fixture.componentRef.setInput('moves', moves);
		await fixture.whenStable();

		expect(element.textContent).toContain('1.');
		expect(element.textContent).toContain('2.');
		expect(element.textContent).toContain('Nf3');
		const evals = element.querySelectorAll('.move-eval');
		expect(evals).toHaveLength(2);
	});

	it('renders the game-over result when provided', async () => {
		const { fixture, element } = await createComponent();
		fixture.componentRef.setInput('result', '1-0');
		await fixture.whenStable();
		expect(element.textContent).toContain('Game over: 1-0');
	});

	it('disables session and export actions when no moves were played', async () => {
		const { element } = await createComponent();
		expect(button(element, 'Take back the last practice move').disabled).toBe(
			true,
		);
		expect(
			button(element, 'Restart the practice session from its starting position')
				.disabled,
		).toBe(true);
		expect(
			button(element, 'Copy the move list to the clipboard').disabled,
		).toBe(true);
		expect(
			button(element, 'Copy the full PGN (with evaluations) to the clipboard')
				.disabled,
		).toBe(true);
		expect(
			button(element, 'Download the analysis as a PGN file').disabled,
		).toBe(true);
	});

	it('emits session and export events', async () => {
		const { fixture, element } = await createComponent();
		const component = fixture.componentInstance;
		const exitSpy = vi.spyOn(component.exit, 'emit');
		const undoSpy = vi.spyOn(component.undoMove, 'emit');
		const restartSpy = vi.spyOn(component.restart, 'emit');
		const reanalyzeSpy = vi.spyOn(component.reanalyze, 'emit');
		const copyFenSpy = vi.spyOn(component.copyFen, 'emit');
		const copyMovesSpy = vi.spyOn(component.copyMoves, 'emit');
		const copyPgnSpy = vi.spyOn(component.copyPgn, 'emit');
		const downloadSpy = vi.spyOn(component.downloadPgn, 'emit');

		fixture.componentRef.setInput('moves', [
			{ san: 'e4', evaluation: '+0.32' },
		]);
		await fixture.whenStable();

		button(
			element,
			'Leave practice mode and return to the loaded game',
		).click();
		button(element, 'Take back the last practice move').click();
		button(
			element,
			'Restart the practice session from its starting position',
		).click();
		button(element, 'Re-analyze the current position').click();
		button(element, 'Copy the current FEN to the clipboard').click();
		button(element, 'Copy the move list to the clipboard').click();
		button(
			element,
			'Copy the full PGN (with evaluations) to the clipboard',
		).click();
		button(element, 'Download the analysis as a PGN file').click();

		expect(exitSpy).toHaveBeenCalledOnce();
		expect(undoSpy).toHaveBeenCalledOnce();
		expect(restartSpy).toHaveBeenCalledOnce();
		expect(reanalyzeSpy).toHaveBeenCalledOnce();
		expect(copyFenSpy).toHaveBeenCalledOnce();
		expect(copyMovesSpy).toHaveBeenCalledOnce();
		expect(copyPgnSpy).toHaveBeenCalledOnce();
		expect(downloadSpy).toHaveBeenCalledOnce();
	});

	it('updates the depth model from the depth input', async () => {
		const { fixture } = await createComponent();
		fixture.componentInstance.onDepthChange({
			target: { value: '22' },
		} as unknown as Event);
		expect(fixture.componentInstance.depth()).toBe(22);
	});

	it('falls back to depth 1 for invalid depth input', async () => {
		const { fixture } = await createComponent();
		fixture.componentInstance.onDepthChange({
			target: { value: 'not-a-number' },
		} as unknown as Event);
		expect(fixture.componentInstance.depth()).toBe(1);
	});

	it('selects the FEN text when the FEN input is focused', async () => {
		const { element } = await createComponent();
		const input = element.querySelector<HTMLInputElement>('.fen-input');
		expect(input).not.toBeNull();
		const selectSpy = vi.spyOn(input as HTMLInputElement, 'select');
		(input as HTMLInputElement).dispatchEvent(new FocusEvent('focus'));
		expect(selectSpy).toHaveBeenCalledOnce();
	});
});
