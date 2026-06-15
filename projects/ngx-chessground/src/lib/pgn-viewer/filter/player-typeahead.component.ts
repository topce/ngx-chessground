import {
	Component,
	computed,
	effect,
	input,
	model,
	output,
	signal,
} from '@angular/core';
import { highlightMatch, type TextSegment } from '../text-highlight';

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
export class PlayerTypeaheadComponent {
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
	}

	/** Opens the dropdown and resets selection index. */
	open(): void {
		this.isOpen.set(true);
		this.activeIndex.set(0);
	}

	/**
	 * Closes the dropdown after a delay to allow mousedown on items to fire first.
	 */
	close(): void {
		this.cancelClose();
		this.closeTimeout = setTimeout(() => {
			this.isOpen.set(false);
			this.closeTimeout = null;
		}, 200);
	}

	/** Selects a player suggestion, updates the value, and closes the dropdown. */
	select(player: string): void {
		this.cancelClose();
		this.value.set(player);
		this.isOpen.set(false);
		this.activeIndex.set(0);
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
}
