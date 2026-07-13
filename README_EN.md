# AI Quota Widget

A desktop widget for monitoring the available Codex quota and local token usage from Codex, Claude Code, and Antigravity.

[中文版本](README.md)

## Screenshots

### Quota and token overview

![AI Quota dashboard](docs/images/dashboard-overview.png)

The dashboard brings together quota status, 24-hour and cumulative token use, trend charts, a daily heatmap, and cache-hit analysis. The values in the screenshot are local sample data; actual content depends on the clients and session logs available on the machine.

### Filter models by source

![Model source filter](docs/images/model-source-filter.png)

Models are grouped by source. Expand or collapse Codex, Claude Code, and Antigravity, choose a source-level `All` entry to aggregate that source, or drill down to an individual model.

### Data sources and appearance

![Data-source and appearance settings](docs/images/settings-data-sources.png)

Enable Codex, Claude Code, and Antigravity independently, then switch the language and light or dark theme in the widget.

### Compact mode

![Compact mode](docs/images/compact-mode.png)

Compact mode keeps only the quota summary for a long-running, always-on-top desktop view. Use the button on the right to restore the full panel.

## Before using a release

- **Windows 10/11** is supported. Release builds do not require Node.js.
- Install and sign in to the official Codex desktop client first. The application locates `codex.exe` on the current machine only; it does not embed, upload, or share account credentials.
- Quota data comes from Codex's local `app-server`. If Codex is signed out, the interface version is incompatible, or the service is unavailable, the widget preserves the most recent snapshot and reports a read failure.
- Token statistics read existing local session logs from Codex, Claude Code, and Antigravity. A missing client or unused source simply appears without data. When Codex cannot be found, local Claude Code and Antigravity token statistics continue to work; only the official quota area reports a read failure.

> Do not hard-code a developer's absolute `codex.exe` path into a release. Installation paths and client versions differ by machine, so the application discovers a usable local path at runtime.

## Key features

- **Official quota monitoring**: Shows the currently available Codex weekly quota and reset time. The removed five-hour window is shown as unlimited so it cannot be confused with the weekly quota.
- **Reliable quota reads**: Reads the local Codex `app-server`; a failed read is explicitly marked instead of presenting stale data as current.
- **Reset-card details**: Shows the available reset-card count and nearest expiry. Click for the complete card list, including status, grant date, and expiry date.
- **Cold-start snapshots**: Restores the latest quota snapshot while a live read is still in progress.
- **Multi-source token statistics**:
  - **Codex and Claude Code**: Parses local project transcripts, supports `cache_read_input_tokens`, and deduplicates by message ID to avoid double counting.
  - **Antigravity estimation**: Parses local Antigravity sessions and estimates context accumulation using a baseline offset and `CHARS_PER_TOKEN = 2.8`.
- **Cache-hit analysis**: Shows 24-hour and cumulative cache-hit rates where the provider exposes cache metrics. Antigravity-only selections correctly show “Unavailable” instead of a misleading `0%`.
- **Model source hierarchy**: Dynamically sizes the selector to the longest visible label, supports source-level aggregation and collapsible source groups, and avoids a horizontal scrollbar.
- **High-performance incremental scanning**: Uses a persistent metadata index and a 15-second disk-I/O cache to avoid re-reading unchanged logs during frequent refreshes.

## Local development

Node.js 20 or newer is required.

```powershell
# Install dependencies
npm install

# Start the development build
npm start

# Run unit tests
npm test
```

## Packaging

Build the unpacked Windows application:

```powershell
npm run build:win
```

The output is written to `release/win-unpacked/`.

Build the installable release package:

```powershell
npm run release:win
```

Release artifacts are written to `release/`. See [CHANGELOG.md](CHANGELOG.md) for version history.

## Project structure

```text
src/
  |- main.js                        # Main process, cache control, single-instance lock
  |- preload.js                     # IPC bridge
  |- codex-service.js               # Codex app-server quota reads and snapshots
  |- token-usage-service.js         # Codex and Claude Code log parsing/deduplication
  |- antigravity-token-service.js   # Antigravity context accumulation estimator
  |- quota-normalizer.js            # Shared quota data normalization
  `- renderer/                      # Front-end UI (HTML / CSS / JS)
test/                               # Unit tests
```

## License

[MIT](LICENSE)
