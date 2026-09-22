# ObsHandy

Obsidian plugin to pull recordings and transcripts from [Handy](https://handy.computer) into your notes.

Reads Handy's local `history.db` (SQLite) and `recordings/` folder directly — no Handy CLI involvement needed.

## Features

- **Insert latest recording (audio)** — copies the newest Handy recording into your vault and embeds it under the cursor.
- **Insert latest recording (transcript only)** — inserts just the transcript text, using a configurable template.
- **Insert latest recording (audio + transcript)** — both, using a configurable template.
- **Browse recordings...** — a searchable list of all recordings with inline audio preview and transcript preview; insert any one of them (audio only, transcript only, or both) under the cursor.

## Install

### Option A — BRAT (recommended, no manual files)

1. Install the **BRAT** community plugin from Obsidian's Community Plugins browser (Settings → Community plugins → Browse → search "BRAT").
2. Open BRAT's settings → "Add beta plugin".
3. Paste this repo's URL: `https://github.com/shrsv/ObsHandy`.
4. BRAT downloads the latest release and installs it. Future updates: BRAT → "Check for updates".
5. Enable "ObsHandy" under Settings → Community plugins.

### Option B — Manual

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](../../releases/latest).
2. Create the folder `<your-vault>/.obsidian/plugins/obs-handy/` and place the three files inside it.
3. In Obsidian: Settings → Community plugins → turn off "Restricted mode" if needed → enable "ObsHandy".

## Setup

Open Settings → ObsHandy and confirm the **Handy data directory** — it's auto-detected per OS:

- Windows: `%APPDATA%\com.pais.handy`
- macOS: `~/Library/Application Support/com.pais.handy`
- Linux: `~/.local/share/com.pais.handy`

Override it if your Handy data lives elsewhere.

## Development

```
npm install
npm run dev    # watch build
npm run build  # production build
```

To cut a release: bump the version (`npm version patch|minor|major`), push the tag, and GitHub Actions builds and publishes the release assets automatically.
