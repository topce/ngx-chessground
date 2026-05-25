import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	signal,
	effect,
	OnDestroy,
} from '@angular/core';
import { GMBJT_SONGS, GMBJT_PLAYLIST_URL, GMBJT_MUSIC_PAGE_URL } from './gmbjt-songs';
import type { GMBJTSong } from './gmbjt-songs';

@Component({
	selector: 'app-gmbjt-music-player',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './gmbjt-music-player.component.html',
	styleUrls: ['./gmbjt-music-player.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GMBJTMusicPlayerComponent implements OnDestroy {
	readonly songs = GMBJT_SONGS;
	readonly playlistUrl = GMBJT_PLAYLIST_URL;
	readonly musicPageUrl = GMBJT_MUSIC_PAGE_URL;

	/** Whether the music panel is expanded */
	readonly expanded = signal(false);

	/** Currently playing song index (null if stopped) */
	readonly currentIndex = signal<number | null>(null);

	/** Whether audio is currently playing */
	readonly isPlaying = signal(false);

	/** Volume level (0.0 – 1.0) */
	readonly volume = signal(0.5);

	/** Current playback time in seconds */
	readonly currentTime = signal(0);

	/** Audio duration in seconds */
	readonly duration = signal(0);

	private audio: HTMLAudioElement | null = null;
	private timeUpdateHandler: (() => void) | null = null;
	private loadedMetadataHandler: (() => void) | null = null;
	private endedHandler: (() => void) | null = null;

	constructor() {
		// Persist volume preference
		const savedVolume = localStorage.getItem('gmbjt-volume');
		if (savedVolume !== null) {
			this.volume.set(parseFloat(savedVolume));
		}

		effect(() => {
			const vol = this.volume();
			if (this.audio) {
				this.audio.volume = vol;
			}
			localStorage.setItem('gmbjt-volume', String(vol));
		});
	}

	get currentSong(): GMBJTSong | null {
		const idx = this.currentIndex();
		return idx !== null ? this.songs[idx] ?? null : null;
	}

	get progressPercent(): number {
		const ct = this.currentTime();
		const dur = this.duration();
		return dur > 0 ? (ct / dur) * 100 : 0;
	}

	get formattedTime(): string {
		const ct = Math.floor(this.currentTime());
		const min = Math.floor(ct / 60);
		const sec = ct % 60;
		return `${min}:${sec.toString().padStart(2, '0')}`;
	}

	get formattedDuration(): string {
		const dur = Math.floor(this.duration());
		const min = Math.floor(dur / 60);
		const sec = dur % 60;
		return isNaN(dur) ? '--:--' : `${min}:${sec.toString().padStart(2, '0')}`;
	}

	toggleExpanded(): void {
		this.expanded.update((v) => !v);
	}

	playSong(index: number): void {
		this.stopAudio();
		const song = this.songs[index];
		if (!song) return;

		this.currentIndex.set(index);
		const audio = new Audio(song.url);
		audio.volume = this.volume();
		audio.crossOrigin = 'anonymous';

		this.timeUpdateHandler = () => {
			this.currentTime.set(audio.currentTime);
		};
		this.loadedMetadataHandler = () => {
			this.duration.set(audio.duration);
		};
		this.endedHandler = () => {
			this.nextSong();
		};

		audio.addEventListener('timeupdate', this.timeUpdateHandler);
		audio.addEventListener('loadedmetadata', this.loadedMetadataHandler);
		audio.addEventListener('ended', this.endedHandler);

		audio.play().then(() => {
			this.isPlaying.set(true);
		}).catch(() => {
			this.isPlaying.set(false);
		});

		this.audio = audio;
	}

	togglePlayPause(): void {
		if (!this.audio) {
			// Start from first song if nothing loaded
			this.playSong(0);
			return;
		}

		if (this.isPlaying()) {
			this.audio.pause();
			this.isPlaying.set(false);
		} else {
			this.audio.play().then(() => {
				this.isPlaying.set(true);
			}).catch(() => {
				// ignored
			});
		}
	}

	nextSong(): void {
		const idx = this.currentIndex();
		if (idx === null) {
			this.playSong(0);
			return;
		}
		const next = (idx + 1) % this.songs.length;
		this.playSong(next);
	}

	prevSong(): void {
		const idx = this.currentIndex();
		if (idx === null) {
			this.playSong(0);
			return;
		}
		const prev = (idx - 1 + this.songs.length) % this.songs.length;
		this.playSong(prev);
	}

	seek(event: Event): void {
		const input = event.target as HTMLInputElement;
		const value = parseFloat(input.value);
		if (this.audio) {
			this.audio.currentTime = (value / 100) * this.duration();
		}
	}

	setVolume(event: Event): void {
		const input = event.target as HTMLInputElement;
		this.volume.set(parseFloat(input.value));
	}

	stopAudio(): void {
		if (this.audio) {
			if (this.timeUpdateHandler) {
				this.audio.removeEventListener('timeupdate', this.timeUpdateHandler);
			}
			if (this.loadedMetadataHandler) {
				this.audio.removeEventListener('loadedmetadata', this.loadedMetadataHandler);
			}
			if (this.endedHandler) {
				this.audio.removeEventListener('ended', this.endedHandler);
			}
			this.audio.pause();
			this.audio = null;
		}
		this.isPlaying.set(false);
	}

	ngOnDestroy(): void {
		this.stopAudio();
	}
}
