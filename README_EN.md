# AI Quota Widget

A Windows desktop widget for viewing Codex quota and local token usage from Codex, Claude Code, and Antigravity.

[中文](README.md) · [Download](https://github.com/w1ndwill/ai-quota-widget/releases)

## Screenshots

### Quota and usage overview

![AI Quota dashboard](docs/images/dashboard-overview.png)

View Codex quota, reset cards, 24-hour and cumulative token usage, trends, a daily heatmap, and cache-hit rates.

### Filter models by source

![Model source filter](docs/images/model-source-filter.png)

Aggregate or filter model usage by Codex, Claude Code, and Antigravity.

### Data sources and appearance

![Data-source and appearance settings](docs/images/settings-data-sources.png)

Enable each data source independently and configure the language, theme, and global shortcuts.

### Compact mode

![Compact mode](docs/images/compact-mode.png)

Keep only the quota summary in a small always-on-top window.

## Features

- Reads the current account quota and reset time from the local Codex `app-server`.
- Shows reset-card counts, status, and expiry details.
- Calculates token usage from local Codex and Claude Code session logs.
- Estimates token usage from local Antigravity sessions; this is not official billing data.
- Provides model filters, trend charts, a daily heatmap, and cache-hit rates where available.
- Supports tray operation, always-on-top and compact modes, and single-instance startup.
- Supports configurable shortcuts for panel visibility, compact mode, refresh, and always-on-top.

Default shortcuts:

- `Ctrl+Shift+Space`: show or hide the main panel
- `Ctrl+Shift+M`: toggle compact mode

## Getting started

1. Download the Windows installer from [Releases](https://github.com/w1ndwill/ai-quota-widget/releases).
2. To view official Codex quota, install and sign in to the Codex desktop app first.
3. Start AI Quota Widget. It finds the local `codex.exe` automatically.

If Codex is unavailable, local Claude Code and Antigravity usage statistics still work while the Codex quota area reports a read failure. An unused or unavailable data source simply has no usage data.

The application reads session files for the current user only. Settings and caches are stored in the `.userdata` folder beside the application.

## Development

Node.js 20 or newer is required.

```powershell
npm install
npm start
npm test
```

Build the unpacked Windows application:

```powershell
npm run build:win
```

Build the Windows installer:

```powershell
npm run release:win
```

Build artifacts are written to `release/`. See [CHANGELOG.md](CHANGELOG.md) for version history.

## Project structure

```text
src/      Application source
test/     Automated tests
docs/     Documentation images
scripts/  Build scripts
```

## License

[MIT](LICENSE)
