import { CommonModule } from '@angular/common';
import {
	Component,
	computed,
	ElementRef,
	effect,
	OnDestroy,
	signal,
	viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
	GMBJT_MUSIC_PAGE_URL,
	GMBJT_PLAYLIST_URL,
	GMBJT_SONGS,
} from '../pgn-viewer/gmbjt-songs';

interface Track {
	title: string;
	artist: string;
	id: string;
	duration: number;
	sunoUrl: string;
}

/**
 * Suno locks down its audio (direct MP3 URLs return 403, clips are
 * DRM-encrypted), so playback goes through Suno's official embed player.
 * The embed always starts paused and exposes no control API, so:
 *
 *  - playback start is detected via the parent document's activeElement
 *    becoming the iframe (fires when the user clicks into the player),
 *  - the end of a track is derived from the song's known duration,
 *  - when the countdown elapses the component auto-advances to the next
 *    track (shuffle-aware). The freshly loaded embed still needs one click
 *    on its play button (Suno never autoplays), but skipping is automatic.
 */
@Component({
	selector: 'app-mini-player',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './mini-player.component.html',
	styleUrl: './mini-player.component.css',
})
export class MiniPlayerComponent implements OnDestroy {
	readonly playlist: Track[] = GMBJT_SONGS.map((s) => ({
		title: s.title,
		artist: s.author,
		id: s.id,
		duration: s.duration,
		sunoUrl: s.sunoUrl,
	}));

	// ── Template refs ──
	private readonly overlayRef =
		viewChild.required<ElementRef<HTMLElement>>('overlay');
	private readonly closeBtnRef =
		viewChild.required<ElementRef<HTMLElement>>('closeBtn');

	// ── State ──
	readonly currentIndex = signal(0);
	readonly isShuffled = signal(false);
	/** Whether the player strip is expanded (bottom sheet above the mini-bar). */
	readonly isOverlayOpen = signal(false);
	/** Whether the whole player (mini-bar + strip) is hidden. Closed by default. */
	readonly isHidden = signal(true);
	/**
	 * The strip stays mounted after the first open — we only collapse/expand it.
	 * Destroying it would unload the Suno iframe and stop background playback.
	 */
	readonly panelMounted = signal(false);
	/** Music session started at least once (drives the "live" dot in the bar). */
	readonly hasStarted = signal(false);
	private previousFocus: HTMLElement | null = null;
	private readonly focusableSelector =
		'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, textarea, select, iframe';

	private shuffleOrder: number[] = [];

	// ── Auto-advance engine ──
	/** When the user last started playback (ms epoch) — derived from iframe focus. */
	private playStartAt: number | null = null;
	private wasIframeFocused = false;
	private tickHandle: ReturnType<typeof setInterval> | null = null;

	// ── Exposed links ──
	readonly playlistUrl = GMBJT_PLAYLIST_URL;
	readonly musicPageUrl = GMBJT_MUSIC_PAGE_URL;

	// ── Computed ──
	readonly currentTrack = computed(() => this.playlist[this.currentIndex()]);
	readonly embedUrl = computed(() =>
		this.sanitizer.bypassSecurityTrustResourceUrl(
			`https://suno.com/embed/${this.currentTrack().id}`,
		),
	);

	constructor(private readonly sanitizer: DomSanitizer) {
		// QA hook: override all durations (seconds) to test auto-advance quickly.
		const override = Number(
			localStorage.getItem('mini-player-duration-override'),
		);
		if (override > 0) {
			this.playlist = this.playlist.map((t) => ({ ...t, duration: override }));
		}

		this.buildShuffleOrder();

		// Run the auto-advance clock only while the player strip is mounted.
		effect(() => {
			if (this.panelMounted()) {
				this.startAutoAdvance();
			} else {
				this.stopAutoAdvance();
			}
		});
	}

	// ── Panel ──
	openOverlay(): void {
		this.previousFocus = document.activeElement as HTMLElement | null;
		this.panelMounted.set(true);
		this.hasStarted.set(true);
		this.isOverlayOpen.set(true);
		// The strip renders on the next change-detection cycle, so defer
		// focusing the close button until it exists.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => this.closeBtnRef()?.nativeElement.focus());
		});
	}

	closeOverlay(): void {
		this.isOverlayOpen.set(false);
		// The iframe stays mounted and keeps playing in the background.
		requestAnimationFrame(() => this.previousFocus?.focus());
	}

	toggleOverlay(): void {
		if (this.isOverlayOpen()) {
			this.closeOverlay();
		} else {
			this.openOverlay();
		}
	}

	/** Show the player (mini-bar + expanded strip). */
	showPlayer(): void {
		this.isHidden.set(false);
		this.openOverlay();
	}

	/** Fully hide the player and stop any background playback. */
	hidePlayer(): void {
		this.isHidden.set(true);
		this.isOverlayOpen.set(false);
		this.panelMounted.set(false);
	}

	/** Toggle the whole player between hidden and visible. */
	togglePlayer(): void {
		if (this.isHidden()) {
			this.showPlayer();
		} else {
			this.hidePlayer();
		}
	}

	onOverlayKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			this.closeOverlay();
			return;
		}
		if (event.key !== 'Tab') return;
		const overlay = this.overlayRef()?.nativeElement;
		if (!overlay) return;
		const focusable = overlay.querySelectorAll<HTMLElement>(
			this.focusableSelector,
		);
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey) {
			if (document.activeElement === first) {
				event.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}

	// ── Navigation ──
	next(): void {
		this.currentIndex.set(this.computeNextIndex());
		this.onTrackChanged();
	}

	prev(): void {
		const tracks = this.playlist;
		let prevIdx: number;

		if (this.isShuffled()) {
			const pos = this.shuffleOrder.indexOf(this.currentIndex());
			prevIdx =
				this.shuffleOrder[
					(pos - 1 + this.shuffleOrder.length) % this.shuffleOrder.length
				];
		} else {
			prevIdx = (this.currentIndex() - 1 + tracks.length) % tracks.length;
		}

		this.currentIndex.set(prevIdx);
		this.onTrackChanged();
	}

	toggleShuffle(): void {
		this.isShuffled.update((v) => !v);
		if (this.isShuffled()) this.buildShuffleOrder();
	}

	// ── Auto-advance ──
	private startAutoAdvance(): void {
		this.stopAutoAdvance();
		this.tickHandle = setInterval(() => this.tick(), 500);
	}

	private stopAutoAdvance(): void {
		if (this.tickHandle !== null) {
			clearInterval(this.tickHandle);
			this.tickHandle = null;
		}
	}

	private tick(): void {
		const iframe = this.overlayRef()?.nativeElement?.querySelector('iframe');
		const focused = !!iframe && document.activeElement === iframe;
		// Focus entering the Suno player means the user clicked inside it,
		// i.e. they pressed play (or restarted the track) — restart the clock.
		if (focused && !this.wasIframeFocused) {
			this.playStartAt = Date.now();
		}
		this.wasIframeFocused = focused;

		if (this.playStartAt === null) return;
		const track = this.currentTrack();
		if (track.duration <= 0) return;
		if (Date.now() - this.playStartAt >= track.duration * 1000) {
			this.playStartAt = null;
			this.advance();
		}
	}

	private advance(): void {
		this.currentIndex.set(this.computeNextIndex());
		this.onTrackChanged();
	}

	private onTrackChanged(): void {
		this.playStartAt = null;
		this.wasIframeFocused = false;
		// A freshly loaded Suno embed starts paused, so surface the strip so
		// the user can start the new track.
		if (!this.isOverlayOpen()) this.openOverlay();
	}

	private computeNextIndex(): number {
		const tracks = this.playlist;
		if (this.isShuffled()) {
			const pos = this.shuffleOrder.indexOf(this.currentIndex());
			return this.shuffleOrder[(pos + 1) % this.shuffleOrder.length];
		}
		return (this.currentIndex() + 1) % tracks.length;
	}

	// ── Helpers ──
	private buildShuffleOrder(): void {
		this.shuffleOrder = [...this.playlist.keys()];
		for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.shuffleOrder[i], this.shuffleOrder[j]] = [
				this.shuffleOrder[j],
				this.shuffleOrder[i],
			];
		}
	}

	ngOnDestroy(): void {
		this.stopAutoAdvance();
	}
}
