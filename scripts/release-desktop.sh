#!/usr/bin/env bash
#
# Build the ngx-chessground desktop apps, package them into downloadable
# archives, and attach everything to a GitHub release. By default all four
# platforms are built and packaged — macOS arm64, Linux x86_64, Linux arm64 and
# Windows x86_64 — so a default run produces four assets; pass --platform
# (repeatable) to build only a subset.
#
# Portable bundles for macOS + Windows only, published immediately:
#   ./scripts/release-desktop.sh 22.6.0 --publish --platform macos --platform windows
#
# Add the Linux bundles to an existing release later (skips the tag, refreshes
# the notes, re-uploads and verifies):
#   ./scripts/release-desktop.sh 22.7.0 --publish --skip-build \
#     --platform linux --platform linux-arm64
#
# Example flow (draft release, portable bundles only):
#   ./scripts/release-desktop.sh 22.5.0
#
# Full flow (build installers too and publish immediately):
#   ./scripts/release-desktop.sh v22.5.0 --publish \
#     --installer dmg --installer msi --installer appimage
#
# Reuse an existing build (only package + release):
#   ./scripts/release-desktop.sh 22.5.0 --skip-build
#
# Re-running is safe: an existing release is updated in place rather than
# failing, and every asset is verified on GitHub after the upload.
#
# Options:
#   --skip-build      Reuse existing desktop artifacts (skip deno/ng builds)
#   --no-tag          Do not create/push the git tag (must already exist on origin)
#   --no-upload       Build & package only; do not touch GitHub
#   --publish         Publish the release immediately (default: create a draft)
#   --notes <file>    Release notes file (default: extract the CHANGELOG section)
#   --installer <t>   Also build an installer for t in: dmg msi appimage deb rpm
#                     (repeatable; requires a prior ng build in dist/)
#   --platform <p>    Only build/package/upload platform p in:
#                     macos linux linux-arm64 windows (repeatable; default: all)
#   --dry-run         Print every action without executing anything
#   -h | --help       Show this help
#
# Requirements: deno (>= 2.9), node + npm install, git, gh (logged in).
# The produced .app / installers are unsigned — macOS Gatekeeper will warn
# on first launch unless you codesign/notarize before distribution.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=""
DO_TAG=1
DO_UPLOAD=1
PUBLISH=0
SKIP_BUILD=0
DRY_RUN=0
NOTES_FILE=""
INSTALLERS=()
PLATFORMS=()

usage() {
  sed -n '2,44p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

info() { printf '\033[1;34m[release]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[release]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[release]\033[0m %s\n' "$*" >&2; exit 1; }

# Execute a command, or print it when --dry-run is active.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '\033[2m[dry-run]\033[0m %s\n' "$*"
  else
    "$@"
  fi
}

# True when no --platform filter was given, or when $1 is among the selected
# platforms (macos | linux | linux-arm64 | windows).
selected() {
  [ "${#PLATFORMS[@]}" -eq 0 ] && return 0
  local p
  for p in ${PLATFORMS[@]+"${PLATFORMS[@]}"}; do
    [ "$p" = "$1" ] && return 0
  done
  return 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    --skip-build) SKIP_BUILD=1 ;;
    --no-tag)     DO_TAG=0 ;;
    --no-upload)  DO_UPLOAD=0 ;;
    --publish)    PUBLISH=1 ;;
    --notes)      shift; [ $# -ge 1 ] || die "--notes requires a file path"; NOTES_FILE="$1" ;;
    --installer)  shift; [ $# -ge 1 ] || die "--installer requires a type"; INSTALLERS+=("$1") ;;
    --platform)   shift; [ $# -ge 1 ] || die "--platform requires a name"; PLATFORMS+=("$1") ;;
    --dry-run)    DRY_RUN=1 ;;
    -*)
      die "unknown option: $1 (see --help)" ;;
    *)
      [ -z "$VERSION" ] || die "unexpected extra argument: $1"
      VERSION="${1#v}"
      ;;
  esac
  shift
done

[ -n "$VERSION" ] || die "missing version argument, e.g. ./scripts/release-desktop.sh 22.5.0"
case "$VERSION" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) die "invalid version '$VERSION' — expected e.g. 22.5.0 or v22.5.0" ;;
esac
[ "$PUBLISH" -eq 1 ] && [ "$DO_UPLOAD" -eq 0 ] && die "--publish conflicts with --no-upload"
for p in ${PLATFORMS[@]+"${PLATFORMS[@]}"}; do
  case "$p" in
    macos|linux|linux-arm64|windows) ;;
    *) die "unknown platform '$p' (macos | linux | linux-arm64 | windows)" ;;
  esac
done

TAG="v$VERSION"
ASSET_DIR="$ROOT/release-assets"

# ---------------------------------------------------------------------------
info "Preparing desktop release $TAG"

# --- Toolchain checks -------------------------------------------------------
command -v git  >/dev/null || die "git is required"
command -v node >/dev/null || die "node is required (run npm install first)"
command -v deno >/dev/null || die "deno is required (>= 2.9) — see desktop/README.md"
if [ "$DO_UPLOAD" -eq 1 ]; then
  command -v gh >/dev/null || die "gh CLI is required for --upload (default); use --no-upload to skip"
  gh auth status >/dev/null 2>&1 || die "not logged in to GitHub — run 'gh auth login'"
fi
if [ "$SKIP_BUILD" -eq 0 ] && [ ! -d node_modules/@angular/cli ]; then
  die "node_modules missing — run 'npm install --force' first"
fi

pkg_ver="$(node -p "require('./package.json').version" 2>/dev/null || true)"
if [ -n "$pkg_ver" ] && [ "$pkg_ver" != "$VERSION" ]; then
  warn "package.json version is $pkg_ver but releasing $VERSION"
fi

# --- 1. Tag -----------------------------------------------------------------
if [ "$DO_TAG" -eq 1 ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    info "would create and push tag $TAG if it does not exist"
  elif git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
    info "tag $TAG already exists locally"
  elif git ls-remote --tags origin "$TAG" 2>/dev/null | grep -q "refs/tags/$TAG\$"; then
    info "tag $TAG already exists on origin"
  else
    [ -n "$(git status --porcelain)" ] && die "git working tree is not clean — commit first or pass --no-tag"
    info "creating and pushing tag $TAG"
    run git tag -a "$TAG" -m "$TAG"
    run git push origin "$TAG"
  fi
else
  info "skipping tag creation (--no-tag)"
fi

# --- 2. Build ---------------------------------------------------------------
if [ "$SKIP_BUILD" -eq 1 ]; then
  info "reusing existing desktop artifacts (--skip-build)"
else
  info "building selected desktop apps… this takes a while"
  if selected macos;       then run deno task desktop:build; fi
  if selected linux;       then run deno task desktop:build:linux; fi
  if selected linux-arm64; then run deno task desktop:build:linux-arm64; fi
  if selected windows;     then run deno task desktop:build:windows; fi
fi

# --- 3. Package --------------------------------------------------------------
if [ "$DRY_RUN" -eq 0 ]; then
  rm -rf "$ASSET_DIR"
  mkdir -p "$ASSET_DIR"
fi

info "packaging portable bundles into $ASSET_DIR"

if selected macos; then
  if [ -d ngx-chessground.app ]; then
    if command -v ditto >/dev/null 2>&1; then
      run ditto -c -k --sequesterRsrc --keepParent ngx-chessground.app \
        "$ASSET_DIR/ngx-chessground-macos-arm64.zip"
    else
      run zip -rqy "$ASSET_DIR/ngx-chessground-macos-arm64.zip" ngx-chessground.app
    fi
  else
    warn "ngx-chessground.app not found — no macOS bundle to package (run without --skip-build)"
  fi
fi

if selected linux; then
  if [ -d ngx-chessground-linux ]; then
    run tar -czf "$ASSET_DIR/ngx-chessground-linux-x86_64.tar.gz" ngx-chessground-linux
  else
    warn "ngx-chessground-linux/ not found — no Linux x86_64 bundle"
  fi
fi

if selected linux-arm64; then
  if [ -d ngx-chessground-linux-arm64 ]; then
    run tar -czf "$ASSET_DIR/ngx-chessground-linux-aarch64.tar.gz" ngx-chessground-linux-arm64
  else
    warn "ngx-chessground-linux-arm64/ not found — no Linux arm64 bundle"
  fi
fi

if selected windows; then
  if [ -d ngx-chessground-windows ]; then
    if command -v zip >/dev/null 2>&1; then
      run zip -rqy "$ASSET_DIR/ngx-chessground-windows-x86_64.zip" ngx-chessground-windows
    else
      run tar -czf "$ASSET_DIR/ngx-chessground-windows-x86_64.tar.gz" ngx-chessground-windows
    fi
  else
    warn "ngx-chessground-windows/ not found — no Windows bundle"
  fi
fi

# --- 4. Optional installers ---------------------------------------------------
if [ "${#INSTALLERS[@]}" -gt 0 ]; then
  [ -f dist/ngx-chessground-example/browser/index.html ] \
    || die "dist/ngx-chessground-example/browser is missing — build first (--skip-build cannot produce installers)"

  base_args=(deno desktop --no-check
    --exclude node_modules --exclude .opencode/node_modules --exclude coverage
    --exclude dist/ngx-chessground-example/browser/lichess
    --include dist/ngx-chessground-example/browser
    --include desktop/desktop-adapter.js --include desktop/stockfish-wasm
    --icon desktop/icon.png --backend webview
    --allow-read --allow-write --allow-env --allow-net)

  for type in "${INSTALLERS[@]}"; do
    case "$type" in
      dmg)      triple="";                    out="$ASSET_DIR/ngx-chessground.dmg" ;;
      msi)      triple="x86_64-pc-windows-msvc"; out="$ASSET_DIR/ngx-chessground.msi" ;;
      appimage) triple="x86_64-unknown-linux-gnu"; out="$ASSET_DIR/ngx-chessground.AppImage" ;;
      deb)      triple="x86_64-unknown-linux-gnu"; out="$ASSET_DIR/ngx-chessground.deb" ;;
      rpm)      triple="x86_64-unknown-linux-gnu"; out="$ASSET_DIR/ngx-chessground.rpm" ;;
      *) die "unknown installer type '$type' (dmg | msi | appimage | deb | rpm)" ;;
    esac
    info "building $type installer…"
    extra_args=()
    [ -n "$triple" ] && extra_args+=(--target "$triple")
    if [ "${#extra_args[@]}" -gt 0 ]; then
      run "${base_args[@]}" "${extra_args[@]}" --output "$out" desktop/server.ts
    else
      run "${base_args[@]}" --output "$out" desktop/server.ts
    fi
  done
fi

# --- 5. GitHub release ---------------------------------------------------------
if [ "$DO_UPLOAD" -eq 0 ]; then
  info "done (--no-upload). Artifacts in $ASSET_DIR:"
  [ "$DRY_RUN" -eq 0 ] && ls -lh "$ASSET_DIR"
  exit 0
fi

artifacts=()
if [ "$DRY_RUN" -eq 0 ]; then
  for f in "$ASSET_DIR"/*; do
    [ -f "$f" ] && artifacts+=("$f")
  done
else
  # Dry-run: best-effort artifact names for the summary.
  if selected macos;       then artifacts+=("$ASSET_DIR/ngx-chessground-macos-arm64.zip"); fi
  if selected linux;       then artifacts+=("$ASSET_DIR/ngx-chessground-linux-x86_64.tar.gz"); fi
  if selected linux-arm64; then artifacts+=("$ASSET_DIR/ngx-chessground-linux-aarch64.tar.gz"); fi
  if selected windows;     then artifacts+=("$ASSET_DIR/ngx-chessground-windows-x86_64.zip"); fi
fi
[ "${#artifacts[@]}" -gt 0 ] || die "no artifacts were produced — run the build first"

# Release notes: explicit file, else the CHANGELOG section, else a generic note.
NOTES_TMP="$(mktemp)"
trap 'rm -f "$NOTES_TMP"' EXIT
if [ -n "$NOTES_FILE" ]; then
  [ -f "$NOTES_FILE" ] || die "notes file not found: $NOTES_FILE"
  if [ "$DRY_RUN" -eq 0 ]; then cp "$NOTES_FILE" "$NOTES_TMP"; fi
else
  notes="$(awk -v v="$VERSION" '
    index($0, "## [" v "]") == 1 { show = 1; next }
    show && /^## \[/ { exit }
    show { print }
  ' CHANGELOG.md)"
  if [ -z "$notes" ]; then
    notes="Desktop release $TAG. See the CHANGELOG for details."
  fi
  if [ "$DRY_RUN" -eq 0 ]; then printf '%s\n' "$notes" > "$NOTES_TMP"; fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  info "would create or update release $TAG (title + notes) $([ "$PUBLISH" -eq 1 ] && echo '(published)' || echo '(--draft)')"
  info "would upload:"
  for a in "${artifacts[@]}"; do printf '   - %s\n' "$(basename "$a")"; done
  echo
  info "dry-run finished — nothing was executed."
  exit 0
fi

# Re-running a release is expected (a build can fail, the upload can time out, a
# platform can be added later), so an existing release is updated in place
# instead of failing the whole run with "release already exists".
if gh release view "$TAG" >/dev/null 2>&1; then
  info "release $TAG already exists — refreshing title and notes"
  if [ "$PUBLISH" -eq 1 ]; then
    gh release edit "$TAG" --title "$TAG" --notes-file "$NOTES_TMP" --draft=false
  else
    gh release edit "$TAG" --title "$TAG" --notes-file "$NOTES_TMP"
  fi
else
  info "creating $([ "$PUBLISH" -eq 1 ] && echo 'release' || echo 'draft release') $TAG"
  if [ "$PUBLISH" -eq 1 ]; then
    gh release create "$TAG" --title "$TAG" --notes-file "$NOTES_TMP"
  else
    gh release create "$TAG" --title "$TAG" --notes-file "$NOTES_TMP" --draft
  fi
fi

info "uploading ${#artifacts[@]} artifact(s) to $TAG"
gh release upload "$TAG" "${artifacts[@]}" --clobber

info "uploaded:"
for a in "${artifacts[@]}"; do printf '   - %s (%s)\n' "$(basename "$a")" "$(du -h "$a" | cut -f1)"; done

# --- 6. Verify ----------------------------------------------------------------
# A GitHub API hiccup can create the release without storing its assets (or with
# only some of them), so never trust the upload command's exit code alone.

info "verifying assets on $TAG"
remote_assets="$(gh release view "$TAG" --json assets \
  --jq '.assets[] | select(.state == "uploaded") | .name' 2>/dev/null || true)"
missing=0
for a in "${artifacts[@]}"; do
  name="$(basename "$a")"
  if printf '%s\n' "$remote_assets" | grep -qxF "$name"; then
    printf '   \033[1;32m✓\033[0m %s\n' "$name"
  else
    printf '   \033[1;31m✗\033[0m %s (missing)\n' "$name"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  die "verification failed — not every artifact is attached to $TAG. Re-run this script to retry the upload."
fi

info "release verified: $(gh release view "$TAG" --json url --jq '.url' 2>/dev/null || echo "$TAG")"

if [ "$PUBLISH" -eq 0 ]; then
  echo
  info "release $TAG created as a DRAFT. Review and publish it with:"
  echo "   gh release view $TAG"
  echo "   gh release edit $TAG --draft=false"
fi

info "done."
