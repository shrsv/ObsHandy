# AGENTS.md

Guidance for AI coding agents working in this repo.

## What this is

ObsHandy is an Obsidian desktop plugin that reads [Handy's](https://handy.computer) local
recording history (`history.db` SQLite + `recordings/` folder) and lets the user insert
recordings — audio only, or audio + transcript — into notes at the cursor, plus a browse/search
modal over the full history.

It never shells out to the Handy CLI (that only controls a *running instance*, no history
export) — all data access is direct SQLite reads via `sql.js` (WASM, no native bindings, so
nothing breaks across Electron/Obsidian version bumps).

## Layout

- `main.ts` — plugin entry: commands, ribbon icon, settings tab wiring.
- `src/handyDb.ts` — sql.js wrapper: opens `history.db` read-only, fresh buffer read per query
  (no persistent connection/watcher — avoids fighting Handy's own file lock).
- `src/insert.ts` — copies a recording's audio into the vault, builds the markdown block,
  inserts at the editor cursor.
- `src/settings.ts` — `HandySettings` shape, defaults (including per-OS Handy data dir
  auto-detection), the settings tab UI.
- `src/browserModal.ts` — searchable/paginated recordings list with inline audio preview.

## Conventions

- Desktop-only plugin (`isDesktopOnly: true` in manifest) — freely use Node `fs`/`path`, no
  need for mobile-safe fallbacks.
- Don't add a persistent DB connection or file watcher on `history.db`; read fresh on each
  command/modal-open instead (see rationale above).
- Keep `sql.js`'s `.wasm` binary shipped alongside `main.js` (loaded via `locateFile` pointing
  at the plugin's own directory) — never fetch it over the network at runtime.
- New settings go in `HandySettings` (`src/settings.ts`) with a sensible default in
  `DEFAULT_SETTINGS`, plus a corresponding `Setting` in `HandySettingTab.display()`.

## Build & release

- `make build` — production build (`main.js` + `sql-wasm.wasm`), matches CI.
- `make dev` — esbuild watch mode.
- `make check` — typecheck only, no emit.
- `make release VERSION=x.y.z` — bumps `manifest.json`/`versions.json`/`package.json`, commits,
  tags, and pushes; GitHub Actions (`.github/workflows/release.yml`) builds and publishes the
  release assets (`main.js`, `manifest.json`, `styles.css`, `sql-wasm.wasm`).

Always run `make check` (and `make build` if you touched build config) before committing.

## Testing

There's no automated test suite (small plugin, mostly I/O against an external app's files).
Verify manually against a real Handy install: point the plugin's "Handy data directory" setting
at the local Handy app-data folder and exercise the three commands plus the browse modal against
real `history.db` data.
