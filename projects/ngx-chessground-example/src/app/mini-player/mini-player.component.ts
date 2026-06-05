import { Component, computed, effect, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GMBJT_SONGS, GMBJT_PLAYLIST_URL, GMBJT_MUSIC_PAGE_URL } from '../pgn-viewer/gmbjt-songs';

interface Track {
  title: string;
  artist: string;
  duration: number;
  url: string;
}

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
    duration: 0, // will be set from loadedmetadata
    url: s.url,
  }));

  // ── State ──
  readonly currentIndex = signal(0);
  readonly isPlaying = signal(false);
  readonly isShuffled = signal(false);
  readonly playAll = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(0.5);
  readonly isOverlayOpen = signal(false);

  private audio: HTMLAudioElement | null = null;
  private shuffleOrder: number[] = [];
  private timeHandler: (() => void) | null = null;
  private metaHandler: (() => void) | null = null;
  private endedHandler: (() => void) | null = null;

  // ── Exposed links ──
  readonly playlistUrl = GMBJT_PLAYLIST_URL;
  readonly musicPageUrl = GMBJT_MUSIC_PAGE_URL;

  // ── Computed ──
  readonly currentTrack = computed(() => this.playlist[this.currentIndex()]);
  readonly progress = computed(() => {
    const dur = this.duration();
    if (dur <= 0) return 0;
    return (this.currentTime() / dur) * 100;
  });
  readonly formattedCurrent = computed(() => this.formatTime(this.currentTime()));
  readonly formattedDuration = computed(() => this.formatTime(this.duration()));

  constructor() {
    this.buildShuffleOrder();

    const saved = localStorage.getItem('mini-player-volume');
    if (saved) this.volume.set(parseFloat(saved));

    effect(() => {
      if (this.audio) this.audio.volume = this.volume();
      localStorage.setItem('mini-player-volume', String(this.volume()));
    });
  }

  // ── Overlay ──
  openOverlay(): void { this.isOverlayOpen.set(true); }
  closeOverlay(): void { this.isOverlayOpen.set(false); }

  // ── Playback ──
  togglePlay(event?: Event): void {
    event?.stopPropagation();
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  private play(): void {
    if (!this.audio) {
      this.playIndex(this.currentIndex());
      return;
    }
    this.audio.play().then(() => this.isPlaying.set(true)).catch(() => {});
  }

  private pause(): void {
    this.audio?.pause();
    this.isPlaying.set(false);
  }

  playIndex(index: number): void {
    this.stopAudio();
    const track = this.playlist[index];
    if (!track || !track.url) return;

    this.currentIndex.set(index);
    this.currentTime.set(0);
    this.duration.set(0);

    const audio = new Audio(track.url);
    audio.volume = this.volume();
    audio.crossOrigin = 'anonymous';

    this.timeHandler = () => this.currentTime.set(audio.currentTime);
    this.metaHandler = () => this.duration.set(audio.duration);
    this.endedHandler = () => this.next();

    audio.addEventListener('timeupdate', this.timeHandler);
    audio.addEventListener('loadedmetadata', this.metaHandler);
    audio.addEventListener('ended', this.endedHandler);

    audio.play().then(() => this.isPlaying.set(true)).catch(() => {});
    this.audio = audio;
  }

  next(event?: Event): void {
    event?.stopPropagation();
    const tracks = this.playlist;
    let nextIdx: number;

    if (this.isShuffled()) {
      const pos = this.shuffleOrder.indexOf(this.currentIndex());
      nextIdx = this.shuffleOrder[(pos + 1) % this.shuffleOrder.length];
    } else if (this.playAll() || this.currentIndex() < tracks.length - 1) {
      nextIdx = (this.currentIndex() + 1) % tracks.length;
    } else {
      return;
    }

    this.playIndex(nextIdx);
  }

  prev(event?: Event): void {
    event?.stopPropagation();
    if (this.currentTime() > 3) {
      if (this.audio) this.audio.currentTime = 0;
      this.currentTime.set(0);
      return;
    }

    const tracks = this.playlist;
    let prevIdx: number;

    if (this.isShuffled()) {
      const pos = this.shuffleOrder.indexOf(this.currentIndex());
      prevIdx = this.shuffleOrder[(pos - 1 + this.shuffleOrder.length) % this.shuffleOrder.length];
    } else {
      prevIdx = (this.currentIndex() - 1 + tracks.length) % tracks.length;
    }

    this.playIndex(prevIdx);
  }

  toggleShuffle(): void {
    this.isShuffled.update((v) => !v);
    if (this.isShuffled()) this.buildShuffleOrder();
  }

  togglePlayAll(): void {
    this.playAll.update((v) => !v);
  }

  seek(event: MouseEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const dur = this.duration();
    if (this.audio && dur > 0) {
      this.audio.currentTime = x * dur;
      this.currentTime.set(this.audio.currentTime);
    }
  }

  // ── Helpers ──
  private buildShuffleOrder(): void {
    this.shuffleOrder = [...this.playlist.keys()];
    for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
    }
  }

  private stopAudio(): void {
    if (this.audio) {
      if (this.timeHandler) this.audio.removeEventListener('timeupdate', this.timeHandler);
      if (this.metaHandler) this.audio.removeEventListener('loadedmetadata', this.metaHandler);
      if (this.endedHandler) this.audio.removeEventListener('ended', this.endedHandler);
      this.audio.pause();
      this.audio = null;
    }
    this.isPlaying.set(false);
  }

  private formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  ngOnDestroy(): void {
    this.stopAudio();
  }
}
