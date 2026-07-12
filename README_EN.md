# AI Quota Widget

A desktop widget that monitors OpenAI Codex remaining quota and tracks local token consumption (Codex, Claude Code, and Antigravity) with precise estimates and cache hit rate analytics.

[中文版](README.md)

## 📋 Prerequisites

- **OS Support**: Windows 10/11. No Node.js installation is required for binary releases.
- **Codex Client**: Requires the official OpenAI Codex client to be installed and logged in. The program automatically auto-discovers `codex.exe` on your local machine; it does not store, upload, or share any account credentials.
- **Rate Limit API**: Quota numbers rely on Codex's local `app-server` interface. If Codex is logged out, offline, or experiencing network issues, the widget will flag "Refresh Failed" and preserve your last cached snapshot.
- **Token Logging**: Token usage statistics are scanned from local Codex, Claude Code, and Antigravity session history. If you have not used these tools, the token usage cards will display empty by default. (Note: If you only wish to track local Claude Code or Antigravity logs, the widget will degrade gracefully. The quota ring will show "Refresh Failed", but the token trend graphs and cumulative cards will continue to work perfectly).

## 🌟 Key Features

- **Official Quota Monitoring**: Displays the remaining percentage and resetting timers of your main Codex 5-hour and Weekly quota windows.
- **Detailed Reset Cards**: Highlights the count of available Reset Credits and the nearest expiration date. Click the card to view status, grant dates, and expiry dates for all active cards.
- **Cold-Start Snapshots**: Restores and displays the last known clean quota snapshots instantly upon launch, preventing empty displays while awaiting active API responses.
- **Proxy Anti-Pollution Shield**: Intercepts routed proxy traffic. When queries are redirected via tools like `ccswitch` to third-party endpoints (e.g., DeepSeek), the widget ignores incoming mock rate limits and locks the official quota display.
- **Multi-Dimensional Token Statistics**:
  - **Local Codex & Claude Code**: Scans and parses project session transcripts (including Claude Code). Supports `cache_read_input_tokens` and integrates message-ID deduplication to prevent double-counting.
  - **Antigravity Estimation**: Computes character counts from Antigravity session logs, incorporating a context-accumulation simulation baseline offset (35,000 characters) and a translation ratio of `CHARS_PER_TOKEN = 2.8` to match real API usage bills.
- **Intelligent Cache Hit Rate**: Computes cache hit rates for the last 24h and 7 days. Excludes Antigravity (which does not report cache parameters) from global hit rate calculations to prevent dilution of your main account's 91% cache hit rate. Single-model view displays "N/A" for uncacheable models.
- **Sleek & Fluid UI**:
  - **Expandable Width**: The model selector is widened to `185px` to fully accommodate long custom model labels.
  - **Pill Range Selector**: Switch between "24h" and "Cumulative" (All-Time) token ranges using a sliding pill toggle with smooth opacity transitions.
  - **Dark Theme Optimization**: Mutes the toggle button colors in the dark theme to soft translucent grays, preserving an elegant night-mode glassmorphic style.
  - **Single Instance Control**: Implements single-instance locking. Running a duplicate process automatically closes itself and focuses the existing widget.
- **High-Performance Incremental Scanning**: Implements a persistent metadata cache index (`history_accumulator.json`) in the user profile directory. Compares last modified times (`mtimeMs`) and file sizes, avoiding disk reads and JSON parsing for 99% of unchanged log files.

## 🛠️ Local Development

Requires Node.js 20 or higher.

```powershell
# Install dependencies
npm install

# Start development build
npm start

# Run unit tests
npm test
```

## 📦 Packaging

To compile a portable Win32 folder:

```powershell
npm run build:win
```

The output will be generated inside `release/win-unpacked/`. Double-click `AI 额度.exe` to run.

## 📁 Project Structure

```text
src/
  ├── main.js                        # Main process, cache controls, single-instance lock
  ├── preload.js                     # IPC context bridge
  ├── codex-service.js               # Quota logic, proxy anti-pollution shield
  ├── token-usage-service.js         # Codex & Claude Code parser and deduplicator
  ├── antigravity-token-service.js   # Antigravity cumulative simulator
  ├── quota-normalizer.js            # Unified data shape normalizer
  └── renderer/                      # Front-end UI (HTML, CSS, JS)
test/                                # Test suites
```

## 📄 License

[MIT](LICENSE)
