import { DecimalPipe } from '@angular/common';
import {
	booleanAttribute,
	Component,
	input,
	model,
	output,
} from '@angular/core';
import { loadAsync as loadZipAsync } from 'jszip';

/**
 * Load & Cache panel for the PGN viewer — right sidebar bottom section.
 *
 * Provides:
 * - PGN text input textarea with clipboard buttons
 * - FEN indexing options (start positions, max plies)
 * - Cache management (clear, info)
 * - File-based loading (ZIP, PGN file picker)
 * - Lichess database date picker (year/month)
 * - URL-based loading with support for .zst compressed files
 * - Loading progress bar with status message
 *
 * @example
 * ```html
 * <load-cache-panel
 *   [isLoading]="isLoading()"
 *   [loadingProgress]="loadingProgress()"
 *   [loadingStatus]="loadingStatus()"
 *   [cacheInfo]="cacheInfo()"
 *   (loadPgnString)="loadPgnString($event)"
 *   (clearPgnCache)="clearPgnCache()"
 * />
 * ```
 */
@Component({
	selector: 'load-cache-panel',
	imports: [DecimalPipe],
	templateUrl: './load-cache-panel.component.html',
	styleUrl: './load-cache-panel.component.css',
})
export class LoadCachePanelComponent {
	// ---- Input State ----
	/** Whether a load is in progress. */
	readonly isLoading = input(false, { transform: booleanAttribute });
	/** Load progress, 0-100. */
	readonly loadingProgress = input<number>(0);
	/** Human-readable description of the current load step. */
	readonly loadingStatus = input<string>('');
	/** Cached-entry count and estimated size, or `null` while unknown. */
	readonly cacheInfo = input<{ count: number; estimatedBytes: number } | null>(
		null,
	);

	/** PGN text typed or pasted into the panel (two-way). */
	readonly pgnInput = model<string>('');
	/** PGN source URL typed into the panel (two-way). */
	readonly urlInput = model<string>('');
	/** Whether to build a starting-position FEN index (two-way). */
	readonly indexStartPositions = model<boolean>(false);
	/** Max half-moves replayed per game when indexing (two-way). */
	readonly maxFenPlies = model<number>(30);

	// ---- Lichess Date Picker ----
	/** Selected Lichess archive year (two-way). */
	readonly lichessYear = model<number>(new Date().getFullYear());
	/** Selected Lichess archive month, 1-12 (two-way). */
	readonly lichessMonth = model<number>(1);

	// ---- Events ----
	/** PGN text is ready to be parsed; emits the text. */
	readonly loadPgnString = output<string>();
	/** The user asked to clear the PGN cache. */
	readonly clearPgnCache = output<void>();
	/** The user asked to refresh the cache statistics. */
	readonly refreshCacheInfo = output<void>();
	/** The user asked to load the selected Lichess month. */
	readonly loadFromLichess = output<void>();
	/** The user asked to load the URL in the input. */
	readonly loadFromUrl = output<void>();
	/** The user asked to load PGN text from the clipboard. */
	readonly loadFromClipboardEvent = output<void>();
	/** The user asked to copy the PGN text to the clipboard. */
	readonly copyToClipboardEvent = output<void>();
	/**
	 * A local file could not be read or contained no PGN entry.
	 *
	 * The panel is presentational and has no access to user-facing
	 * notification, so the container turns this into a message.
	 */
	readonly fileLoadFailed = output<string>();

	// ---- Lichess helpers ----
	/**
	 * Selectable archive years, oldest first.
	 *
	 * The lower bound matches the earliest Lichess monthly broadcast archive;
	 * the upper bound is the current year.
	 */
	get years(): number[] {
		const currentYear = new Date().getFullYear();
		const years: number[] = [];
		for (let y = 2020; y <= currentYear; y++) {
			years.push(y);
		}
		return years;
	}

	/**
	 * Selectable months for the selected year.
	 *
	 * A past year offers all twelve; the current year offers only the months
	 * that have already ended, because a broadcast archive is published after
	 * the month closes.
	 */
	get months(): number[] {
		const selectedYear = this.lichessYear();
		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth(); // 0-indexed

		if (selectedYear < currentYear) {
			return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
		} else if (selectedYear === currentYear) {
			const months: number[] = [];
			for (let m = 1; m <= currentMonth; m++) {
				months.push(m);
			}
			return months;
		}
		return [];
	}

	/** Applies the selected year and clamps the month to an available one. */
	onLichessYearChange(event: Event): void {
		const value = parseInt((event.target as HTMLSelectElement).value, 10);
		this.lichessYear.set(value);
		const availableMonths = this.months;
		if (!availableMonths.includes(this.lichessMonth())) {
			this.lichessMonth.set(availableMonths[availableMonths.length - 1] || 1);
		}
	}

	/** Applies the selected month. */
	onLichessMonthChange(event: Event): void {
		const value = parseInt((event.target as HTMLSelectElement).value, 10);
		this.lichessMonth.set(value);
	}

	/** Applies the edited PGN text. */
	onPgnInputChange(event: Event): void {
		const value = (event.target as HTMLTextAreaElement).value;
		this.pgnInput.set(value);
	}

	/** Applies the edited source URL. */
	onUrlInputChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.urlInput.set(value);
	}

	/** Applies the starting-position indexing checkbox. */
	onIndexStartPositionsChange(event: Event): void {
		this.indexStartPositions.set((event.target as HTMLInputElement).checked);
	}

	/** Applies the indexing replay window, ignoring values below 1. */
	onMaxFenPliesChange(event: Event): void {
		const value = parseInt((event.target as HTMLInputElement).value, 10);
		if (!Number.isNaN(value) && value >= 1) {
			this.maxFenPlies.set(value);
		}
	}

	/** Extracts the first `.pgn` entry from a chosen zip archive and emits it. */
	async onPgnZipSelected(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const zip = await loadZipAsync(file);
			const pgnFile = Object.values(zip.files).find((f) =>
				f.name.toLowerCase().endsWith('.pgn'),
			);
			if (!pgnFile) {
				this.fileLoadFailed.emit(`No PGN file found in "${file.name}".`);
				return;
			}
			this.loadPgnString.emit(await pgnFile.async('string'));
		} catch {
			this.fileLoadFailed.emit(`Could not read "${file.name}".`);
		}
	}

	/** Emits the text of a chosen `.pgn` file. */
	onPgnFileSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		this.handleFileRead(input.files[0]);
	}

	/** Reads a file as UTF-8 text and emits it, or reports the failure. */
	private handleFileRead(file: File): void {
		file
			.text()
			.then((content) => {
				if (content) this.loadPgnString.emit(content);
				else this.fileLoadFailed.emit(`"${file.name}" is empty.`);
			})
			.catch(() => this.fileLoadFailed.emit(`Could not read "${file.name}".`));
	}

	/** Whether the load & cache panel is expanded (two-way). */
	readonly expanded = model<boolean>(true);

	/** Expands or collapses the load & cache panel. */
	toggleExpanded(): void {
		this.expanded.update((v) => !v);
	}
}
