import {
	AfterViewInit,
	Component,
	computed,
	ElementRef,
	effect,
	input,
	model,
	OnDestroy,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { highlightMatch, type TextSegment } from '../text-highlight';

/** Inline styles applied to the dropdown when anchored to the viewer container. */
interface DropdownPosition {
	position: 'fixed';
	left: string;
	top: string;
	width: string;
	maxHeight: string;
	visibility?: 'hidden';
}

/** Vertical gap between the input and the open dropdown. */
const DROPDOWN_GAP = 4;
/** Maximum height of the dropdown before it scrolls internally. */
const DROPDOWN_MAX_HEIGHT = 440;
/** Minimum height the dropdown is allowed to shrink to. */
const DROPDOWN_MIN_HEIGHT = 160;
/** Below this much free space the dropdown flips to open upward. */
const OPEN_UP_THRESHOLD = 360;

/**
 * Reusable typeahead input for filtering by player name.
 *
 * Provides an autocomplete dropdown with keyboard navigation,
 * text highlighting of matched portions, and support for
 * closing via blur (with configurable delay) or Escape.
 *
 * @example
 * ```html
 * <player-typeahead
 *   [label]="'White'"
 *   [suggestions]="uniqueWhitePlayers()"
 *   [(value)]="filterWhite"
 *   (optionSelected)="onWhiteSelected($event)"
 * />
 * ```
 */
@Component({
	selector: 'player-typeahead',
	templateUrl: './player-typeahead.component.html',
	styleUrl: './player-typeahead.component.css',
})
export class PlayerTypeaheadComponent implements AfterViewInit, OnDestroy {
	/** Placeholder text for the input field. */
	readonly label = input.required<string>();

	/** Full list of player name suggestions. */
	readonly suggestions = input.required<string[]>();

	/** Two-way bound current filter value. */
	readonly value = model<string>('');

	/** Emitted when a suggestion is selected from the dropdown. */
	readonly optionSelected = output<string>();

	/** Whether the dropdown is open. */
	readonly isOpen = signal(false);

	/** Currently highlighted index in the dropdown. */
	readonly activeIndex = signal(0);

	/** Close timeout handle for delayed blur. */
	private closeTimeout: ReturnType<typeof setTimeout> | null = null;

	readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('input');
	readonly dropdownEl = viewChild<ElementRef<HTMLDivElement>>('dropdown');

	/** Inline styles anchoring the dropdown; null keeps the CSS fallback. */
	readonly dropdownPosition = signal<DropdownPosition | null>(null);
	/** Whether the dropdown opens above the input. */
	readonly openUp = signal(false);

	/**
	 * The viewer container that anchors the fixed-position dropdown.
	 * It establishes the containing block via layout containment
	 * (`container-type: inline-size`), letting the dropdown escape the
	 * left panel's scroll/clip context entirely.
	 */
	private containerEl: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private scrollCleanup: (() => void) | null = null;
	private rafId: number | null = null;

	/** Filtered suggestions based on current input value. */
	readonly filteredSuggestions = computed(() => {
		const query = this.value().toLowerCase().trim();
		if (!query) return this.suggestions();
		return this.suggestions().filter((p) => p.toLowerCase().includes(query));
	});

	constructor() {
		effect(() => {
			// Reset active index when suggestions change
			if (this.isOpen()) {
				this.activeIndex.set(0);
			}
		});
	}

	/**
	 * Handles input events, updating the value and keeping the dropdown open.
	 */
	onInput(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.value.set(value);
		this.cancelClose();
		this.isOpen.set(true);
		this.activeIndex.set(0);
		this.schedulePosition();
	}

	/** Opens the dropdown and resets selection index. */
	open(): void {
		this.isOpen.set(true);
		this.activeIndex.set(0);
		this.schedulePosition();
	}

	/**
	 * Closes the dropdown after a delay to allow mousedown on items to fire first.
	 */
	close(): void {
		this.cancelClose();
		this.closeTimeout = setTimeout(() => {
			this.isOpen.set(false);
			this.resetPosition();
			this.closeTimeout = null;
		}, 200);
	}

	/** Selects a player suggestion, updates the value, and closes the dropdown. */
	select(player: string): void {
		this.cancelClose();
		this.value.set(player);
		this.isOpen.set(false);
		this.activeIndex.set(0);
		this.resetPosition();
		this.optionSelected.emit(player);
	}

	/**
	 * Handles keyboard navigation in the dropdown.
	 * Arrow keys navigate, Enter selects, Escape closes.
	 */
	onKeydown(event: KeyboardEvent): void {
		const items = this.filteredSuggestions();
		if (!this.isOpen() || items.length === 0) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				this.isOpen.set(true);
				event.preventDefault();
				return;
			}
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				this.activeIndex.update((i) => (i < items.length - 1 ? i + 1 : 0));
				break;
			case 'ArrowUp':
				event.preventDefault();
				this.activeIndex.update((i) => (i > 0 ? i - 1 : items.length - 1));
				break;
			case 'Enter': {
				event.preventDefault();
				const selected = items[this.activeIndex()];
				if (selected) {
					this.select(selected);
				}
				break;
			}
			case 'Escape':
				this.isOpen.set(false);
				this.resetPosition();
				break;
		}
	}

	/**
	 * Splits text into match/non-match segments for highlighting.
	 * Delegates to the standalone {@link highlightMatch} utility.
	 */
	highlightText(text: string, query: string): TextSegment[] {
		return highlightMatch(text, query);
	}

	/** Cancels any pending close timeout. */
	private cancelClose(): void {
		if (this.closeTimeout) {
			clearTimeout(this.closeTimeout);
			this.closeTimeout = null;
		}
	}

	ngAfterViewInit(): void {
		const input = this.inputEl()?.nativeElement;
		if (!input) return;

		// Only anchor when the component is inside the PGN viewer.
		this.containerEl = input.closest(
			'.pgn-viewer-container',
		) as HTMLElement | null;
		if (!this.containerEl) return;

		// Reposition while any ancestor (left panel, main content, window) scrolls.
		const onScroll = () => this.schedulePosition();
		window.addEventListener('scroll', onScroll, true);
		this.scrollCleanup = () =>
			window.removeEventListener('scroll', onScroll, true);

		// Reposition when the viewer is resized (window, panel drag handles, media queries).
		this.resizeObserver = new ResizeObserver(() => this.schedulePosition());
		this.resizeObserver.observe(this.containerEl);
	}

	ngOnDestroy(): void {
		this.scrollCleanup?.();
		this.resizeObserver?.disconnect();
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
		}
	}

	/**
	 * Clears the anchored dropdown styles, restoring the CSS fallback
	 * (only relevant when the dropdown is closed).
	 */
	private resetPosition(): void {
		this.dropdownPosition.set(null);
		this.openUp.set(false);
	}

	/** Coalesces repositioning work into a single animation frame. */
	private schedulePosition(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
		}
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.positionDropdown();
		});
	}

	/**
	 * Anchors the dropdown to the input using fixed positioning relative to the
	 * viewer container, so it escapes the left panel's scroll/clip context.
	 * Opens upward when there is not enough room below the input.
	 */
	private positionDropdown(): void {
		if (!this.isOpen()) return;
		const input = this.inputEl()?.nativeElement;
		const container = this.containerEl;
		if (!input || !container) return;

		const inputRect = input.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		const gap = DROPDOWN_GAP;

		const spaceBelow = containerRect.bottom - inputRect.bottom - gap;
		const spaceAbove = inputRect.top - containerRect.top - gap;
		const openUp = spaceBelow < OPEN_UP_THRESHOLD && spaceAbove > spaceBelow;

		const maxHeight = Math.max(
			Math.min(DROPDOWN_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow),
			DROPDOWN_MIN_HEIGHT,
		);

		const width = inputRect.width;
		const maxLeft = Math.max(containerRect.width - width, 0);
		const left = Math.min(
			Math.max(inputRect.left - containerRect.left, 0),
			maxLeft,
		);

		if (!openUp) {
			// Opening down: the top offset is exact regardless of dropdown height.
			this.openUp.set(false);
			this.dropdownPosition.set({
				position: 'fixed',
				left: `${left}px`,
				top: `${inputRect.bottom - containerRect.top + gap}px`,
				width: `${width}px`,
				maxHeight: `${maxHeight}px`,
			});
			return;
		}

		// Opening up: measure the rendered height first, then anchor the bottom
		// edge to the input. The first paint is hidden to avoid a visible jump.
		this.openUp.set(true);
		this.dropdownPosition.set({
			position: 'fixed',
			left: `${left}px`,
			top: '0',
			width: `${width}px`,
			maxHeight: `${maxHeight}px`,
			visibility: 'hidden',
		});
		requestAnimationFrame(() => {
			const dropdown = this.dropdownEl()?.nativeElement;
			const height = dropdown?.offsetHeight ?? maxHeight;
			this.dropdownPosition.set({
				position: 'fixed',
				left: `${left}px`,
				top: `${Math.max(inputRect.top - containerRect.top - height - gap, 0)}px`,
				width: `${width}px`,
				maxHeight: `${maxHeight}px`,
			});
		});
	}
}
