# External Integrations

**Analysis Date:** 2026-05-02

## APIs & External Services

**Lichess Database (PGN Broadcasting):**
- Lichess open database of broadcasted chess games — provides monthly `.pgn.zst` (Zstandard-compressed PGN) files
  - URL: `https://database.lichess.org/broadcast/`
  - SDK/Client: No SDK — raw HTTPS download via Node.js `https` module (`scripts/download-lichess.js`) or browser `fetch()` API (`projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts:1084`)
  - Auth: None (public open data)
  - Dev proxy: `proxy.conf.json` maps `/lichess` → `https://database.lichess.org` for local development CORS avoidance

**Google Fonts:**
- Web font loading for `Open Sans` and `Roboto` families
  - URLs: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`
  - Used in: `projects/ngx-chessground-example/src/index.html:12-14`
  - Auth: None

**GitHub (Sponsors & Repository):**
- Links only — no programmatic API calls
  - GitHub Sponsors: `https://github.com/sponsors/topce`
  - Issues: `https://github.com/topce/ngx-chessground/issues/new`
  - PRs: `https://github.com/topce/ngx-chessground/pulls`
  - Used in: `sponsor-dialog.component.ts:27,51,59`

## Data Storage

**Databases:**
- No external database — all data is ephemeral and client-side only

**File Storage:**
- Local filesystem only (for downloaded Lichess broadcast files via the download script)
- Browser cache via Angular Service Worker (PWA): assets and app bundles cached in `ngsw-config.json`
- User-uploaded files: `.pgn` and `.zip` files processed entirely in-browser via `FileReader` API and `jszip`

**Caching:**
- Angular Service Worker (`@angular/service-worker`) for offline PWA support
  - Config: `projects/ngx-chessground-example/ngsw-config.json`
  - Asset prefetch mode for app core (`/*.css`, `/*.js`, `/index.html`, `/favicon.ico`)
  - Lazy install mode for image/font assets
  - No server-side or external caching layer

## Authentication & Identity

**Auth Provider:**
- None — the library and example app have no authentication mechanism
- No user accounts, no login, no identity management

## Monitoring & Observability

**Error Tracking:**
- None — no external error tracking service (no Sentry, Datadog, LogRocket, etc.)

**Logs:**
- Console-based logging only (`console.error` allowed per ESLint config: `"no-console": ["error", { "allow": ["error"] }]`)
- `MatSnackBar` used for user-facing error messages in the PGN viewer component

## CI/CD & Deployment

**Hosting:**
- GitHub Pages for the example application (`npm run deploy` → `angular-cli-ghpages`)
  - Base href: `/ngx-chessground/`
  - Builder: `angular-cli-ghpages:deploy` in `angular.json`

- npm Registry for library distribution
  - Script: `npm run publish:lib` (builds then `npm publish` from `dist/ngx-chessground/`)
  - Manual publish scripts: `publish.sh` (bash) and `publish.ps1` (PowerShell)

**CI Pipeline:**
- No CI/CD configuration detected
- `.github/` directory contains only `FUNDING.yml` (GitHub Sponsors configuration)
- No GitHub Actions workflows, no CircleCI, no Travis CI configs

## Environment Configuration

**Required env vars:**
- None — the application has no required environment variables
- Production mode is toggled via Angular's `environment.ts` file replacement at build time

**Secrets location:**
- No secrets management detected
- npm publish requires manual login (`npm login`) — no token stored in repository

## Webhooks & Callbacks

**Incoming:**
- None — no server-side endpoints

**Outgoing:**
- None — no programmatic outbound webhooks or API calls beyond user-initiated file downloads

---

*Integration audit: 2026-05-02*
