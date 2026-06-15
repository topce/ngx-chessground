import { Component, computed, input } from '@angular/core';

/**
 * Vertical evaluation bar showing the current position evaluation.
 *
 * Displays a white/black gradient bar with a centered divider and
 * a floating text badge showing the current centipawn/mate score.
 * Supports flipping via CSS scaleY when the board orientation is flipped.
 *
 * @example
 * ```html
 * <evaluation-bar
 *   [evaluation]="currentEvaluation()"
 *   [flipped]="flipped()"
 * />
 * ```
 */
@Component({
	selector: 'evaluation-bar',
	templateUrl: './evaluation-bar.component.html',
	styleUrl: './evaluation-bar.component.css',
})
export class EvaluationBarComponent {
	/** Raw evaluation string (e.g. `"+1.23"`, `"#3"`, `"-M2"`) or null. */
	readonly evaluation = input<string | null>(null);

	/** Whether the board is flipped (black at bottom). Flips the bar. */
	readonly flipped = input<boolean>(false);

	/** Height percentage for the fill (0 = all black, 100 = all white, 50 = equal). */
	readonly barHeight = computed(() => {
		const evalStr = this.evaluation();
		if (!evalStr) return 50;

		if (evalStr.startsWith('#')) {
			const mateIn = parseInt(evalStr.substring(1), 10);
			if (mateIn > 0) return 100;
			if (mateIn < 0) return 0;
			return 50;
		}

		const evalNum = parseFloat(evalStr);
		if (Number.isNaN(evalNum)) return 50;

		const maxEval = 5.0;
		const clampedEval = Math.max(-maxEval, Math.min(maxEval, evalNum));
		return 50 + (clampedEval / maxEval) * 50;
	});

	/** Formatted evaluation string for the text badge (e.g. `"+1.23"`, `"M3"`, `"-M2"`). */
	readonly formattedEval = computed(() => {
		const raw = this.evaluation();
		if (!raw) return '—';

		if (raw.startsWith('#')) {
			const val = parseInt(raw.substring(1), 10);
			if (val > 0) return `M${val}`;
			if (val < 0) return `-M${Math.abs(val)}`;
			return '—';
		}

		const num = parseFloat(raw);
		if (Number.isNaN(num)) return '—';
		const rounded = Math.round(num * 100) / 100;
		if (rounded > 0) return `+${rounded.toFixed(2)}`;
		return rounded.toFixed(2);
	});

	/** CSS class for the evaluation fill based on advantage. */
	readonly evalClass = computed(() => {
		const evalStr = this.evaluation();
		if (!evalStr) return 'eval-equal';

		if (evalStr.startsWith('#')) {
			const val = parseInt(evalStr.substring(1), 10);
			if (val > 0) return 'eval-white';
			if (val < 0) return 'eval-black';
			return 'eval-equal';
		}

		const num = parseFloat(evalStr);
		if (Number.isNaN(num)) return 'eval-equal';

		if (num > 0.1) return 'eval-white';
		if (num < -0.1) return 'eval-black';
		return 'eval-equal';
	});

	/** Dynamic fill color using CSS variables for theme support. */
	readonly evalFillColor = computed(() => {
		// Use CSS custom properties so the fill adapts to light/dark theme
		const cls = this.evalClass();
		if (cls === 'eval-white') return 'var(--eval-fill-white, #ffffff)';
		if (cls === 'eval-black') return 'var(--eval-fill-black, #ffffff)';
		return 'var(--eval-fill-equal, #ffffff)';
	});
}
