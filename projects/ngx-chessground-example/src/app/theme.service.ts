import { Injectable, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ngx-chessground-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly html = this.document.documentElement;

  readonly theme = signal<Theme>(this.loadInitialTheme());

  constructor() {
    // Reactively apply theme to <html data-theme>
    effect(() => {
      const current = this.theme();
      this.html.setAttribute('data-theme', current);
      try {
        localStorage.setItem(STORAGE_KEY, current);
      } catch {
        // localStorage unavailable (SSR / privacy mode) — no-op
      }
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
  }

  private loadInitialTheme(): Theme {
    // 1. Stored preference
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      // ignore
    }

    // 2. System preference
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return 'light';
  }
}
