# Wallex Withdrawal Status Monitor

Headless script that checks the "برداشت کوین" (coin withdrawal) status on [wallex.ir/services-status](https://wallex.ir/services-status) at a fixed interval and reports whether it's **ACTIVE** or **INACTIVE**.

Repository: [github.com/ilexiv/wallcheck](https://github.com/ilexiv/wallcheck)

Chrome runs in the background with no visible window, so this can sit in a terminal, a `tmux`/`screen` session, or run as a background service.

## How it works

Wallex's status page is rendered client-side, so a plain HTTP request only returns an empty page shell — the status text is added by JavaScript after the page loads. This script drives a real headless Chrome instance with [Puppeteer](https://pptr.dev/) so it sees the page the same way a browser would, then searches the rendered content for the "برداشت کوین" label and reads the Persian status word next to it: فعال (active) or غیرفعال (inactive).

One detail worth knowing: غیرفعال literally contains فعال as a substring (غیر is a "non-/un-" prefix), so the script always checks for غیرفعال first. Checking in the other order would make every status incorrectly match as "active."

## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- Google Chrome installed locally — the script uses your existing browser instead of downloading its own

## Setup

```bash
git clone https://github.com/ilexiv/wallcheck.git
cd wallcheck
npm install puppeteer-core
```

If Chrome isn't at `/usr/bin/google-chrome` on your system, find its actual path:

```bash
which google-chrome google-chrome-stable chromium chromium-browser
```

and set `CHROME_PATH` accordingly (see [Configuration](#configuration)).

## Usage

```bash
node wallex-monitor.js
```

The script checks immediately on startup, then every 30 seconds. Press `Ctrl+C` to stop — this shuts the Chrome process down cleanly rather than leaving it running in the background.

Example output:

```
Wallex withdrawal monitor started
URL: https://wallex.ir/services-status
Interval: 30s
Log file: /path/to/wallex-monitor.log
Press Ctrl+C to stop.

[02/07/2026, 17:10:00] Coin withdrawal: INACTIVE
[02/07/2026, 17:10:30] Coin withdrawal: INACTIVE
[02/07/2026, 17:11:00] Coin withdrawal: ACTIVE  ⚠ CHANGED
```

## Configuration

All settings are optional environment variables:

| Variable | Default | Description |
|---|---|---|
| `CHECK_INTERVAL_MS` | `30000` | Time between checks, in milliseconds |
| `CHROME_PATH` | `/usr/bin/google-chrome` | Path to your Chrome/Chromium executable |
| `WALLEX_URL` | `https://wallex.ir/services-status` | Page to monitor |
| `LOG_FILE` | `wallex-monitor.log` next to the script | Where results are logged |

Example — check every 10 seconds instead of 30:

```bash
CHECK_INTERVAL_MS=10000 node wallex-monitor.js
```

## Features

- **Color-coded terminal output** — green for active, red for inactive. Colors are automatically disabled when output isn't a terminal (e.g. redirected to a file).
- **Change detection** — a `⚠ CHANGED` marker appears only on the check where the status actually flips, and triggers a desktop notification via `notify-send` (Linux). If `notify-send` isn't installed, this is silently skipped and doesn't affect anything else.
- **Persistent logging** — every check is appended to a plain-text log file, so you still have a history after closing the terminal.
- **Auto-recovery** — if 5 checks in a row fail (network issue, Chrome crash, etc.), the script closes and relaunches the browser automatically.
- **No overlapping checks** — if a check ever takes longer than expected, the next scheduled check is skipped rather than piling up.

## Troubleshooting

**`Error: Cannot find module 'puppeteer-core'`**
Run `npm install puppeteer-core` in the repo root.

**Chrome fails to launch**
Confirm your Chrome path and set `CHROME_PATH` if it doesn't match the default:
```bash
which google-chrome google-chrome-stable chromium chromium-browser
```

**"Status not found" warnings**
Wallex changed the page's layout. Open the page, right-click the "برداشت کوین" row → Inspect, and update the selector logic in `findStatusOnPage` to match the new structure.

**Desktop notifications don't appear**
`notify-send` is Linux-only and needs `libnotify-bin` (or your distro's equivalent) installed. This is a non-critical feature — console and log output work regardless.

## Notes

- The script only reads publicly visible status text; it doesn't log in to or interact with any Wallex account.
- It uses `puppeteer-core` rather than `puppeteer` so it relies on your system's existing Chrome install instead of downloading its own copy — this avoids the CDN download failures that `puppeteer`'s bundled install can run into.
