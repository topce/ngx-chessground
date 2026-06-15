import { DecimalPipe } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
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
	readonly isLoading = input<boolean>(false);
	readonly loadingProgress = input<number>(0);
	readonly loadingStatus = input<string>('');
	readonly cacheInfo = input<{ count: number; estimatedBytes: number } | null>(
		null,
	);

	readonly pgnInput = model<string>('');
	readonly urlInput = model<string>('');
	readonly indexStartPositions = model<boolean>(false);
	readonly maxFenPlies = model<number>(30);

	// ---- Lichess Date Picker ----
	readonly lichessYear = model<number>(new Date().getFullYear());
	readonly lichessMonth = model<number>(1);

	// ---- Events ----
	readonly loadPgnString = output<string>();
	readonly clearPgnCache = output<void>();
	readonly refreshCacheInfo = output<void>();
	readonly loadFromLichess = output<void>();
	readonly loadFromUrl = output<void>();
	readonly loadFromClipboardEvent = output<void>();
	readonly copyToClipboardEvent = output<void>();

	// ---- Lichess helpers ----
	get years(): number[] {
		const currentYear = new Date().getFullYear();
		const years: number[] = [];
		for (let y = 2020; y <= currentYear; y++) {
			years.push(y);
		}
		return years;
	}

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

	onLichessYearChange(event: Event): void {
		const value = parseInt((event.target as HTMLSelectElement).value, 10);
		this.lichessYear.set(value);
		const availableMonths = this.months;
		if (!availableMonths.includes(this.lichessMonth())) {
			this.lichessMonth.set(availableMonths[availableMonths.length - 1] || 1);
		}
	}

	onLichessMonthChange(event: Event): void {
		const value = parseInt((event.target as HTMLSelectElement).value, 10);
		this.lichessMonth.set(value);
	}

	onPgnInputChange(event: Event): void {
		const value = (event.target as HTMLTextAreaElement).value;
		this.pgnInput.set(value);
	}

	onUrlInputChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.urlInput.set(value);
	}

	onIndexStartPositionsChange(event: Event): void {
		this.indexStartPositions.set((event.target as HTMLInputElement).checked);
	}

	onMaxFenPliesChange(event: Event): void {
		const value = parseInt((event.target as HTMLInputElement).value, 10);
		if (!Number.isNaN(value) && value >= 1) {
			this.maxFenPlies.set(value);
		}
	}

	async onPgnZipSelected(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const zip = await loadZipAsync(file);
			const pgnFile = Object.values(zip.files).find((f) =>
				f.name.endsWith('.pgn'),
			);
			if (pgnFile) {
				const content = await pgnFile.async('string');
				this.loadPgnString.emit(content);
			}
		} catch (e) {
			console.error('Error loading zip file:', e);
		}
	}

	onPgnFileSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0];
		this.handleFileRead(file);
	}

	private handleFileRead(file: File): void {
		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			if (content) {
				this.loadPgnString.emit(content);
			}
		};
		reader.readAsText(file);
	}

	/** Tracks expanded/collapsed state. */
	readonly expanded = model<boolean>(true);

	toggleExpanded(): void {
		this.expanded.update((v) => !v);
	}
}
