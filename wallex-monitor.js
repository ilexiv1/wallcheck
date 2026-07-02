const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const config = {
  url: process.env.WALLEX_URL || "https://wallex.ir/services-status",
  targetLabel: "برداشت کوین",
  checkIntervalMs: Number(process.env.CHECK_INTERVAL_MS) || 30000,
  chromePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  logFilePath: process.env.LOG_FILE || path.join(__dirname, "wallex-monitor.log"),
  navigationTimeoutMs: 30000,
  maxConsecutiveErrors: 5,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const isTerminal = Boolean(process.stdout.isTTY);

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function colorize(text, color) {
  return isTerminal ? `${color}${text}${colors.reset}` : text;
}

function currentTimestamp() {
  return new Date().toLocaleString("en-GB", { hour12: false });
}

function stripAnsiCodes(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function writeLogLine(text) {
  console.log(text);
  fs.appendFile(config.logFilePath, stripAnsiCodes(text) + "\n", () => {});
}

function sendDesktopNotification(title, message) {
  exec(`notify-send ${JSON.stringify(title)} ${JSON.stringify(message)}`, () => {});
}

const PERSIAN_INACTIVE = "غیرفعال";
const PERSIAN_ACTIVE = "فعال";

function toDisplayStatus(persianStatus) {
  if (persianStatus === PERSIAN_INACTIVE) return { label: "INACTIVE", color: colors.red };
  if (persianStatus === PERSIAN_ACTIVE) return { label: "ACTIVE", color: colors.green };
  return null;
}

async function findStatusOnPage(page, targetLabel) {
  return page.evaluate(
    (targetLabel, inactiveWord, activeWord) => {
      function matchStatusWord(text) {
        if (text.includes(inactiveWord)) return inactiveWord;
        if (text.includes(activeWord)) return activeWord;
        return null;
      }

      const textLeafElements = Array.from(document.querySelectorAll("body *")).filter(
        (el) => el.children.length === 0 && el.textContent.trim()
      );

      const targetElement = textLeafElements.find((el) => el.textContent.includes(targetLabel));
      if (!targetElement) return null;

      const row = targetElement.closest("tr, li, div") || targetElement.parentElement;
      if (!row) return null;

      const rowStatus = matchStatusWord(row.textContent);
      if (rowStatus) return rowStatus;

      const section = row.parentElement;
      return section ? matchStatusWord(section.textContent) : null;
    },
    targetLabel,
    PERSIAN_INACTIVE,
    PERSIAN_ACTIVE
  );
}

async function createBrowser() {
  return puppeteer.launch({
    headless: true,
    executablePath: config.chromePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

async function createPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(config.userAgent);
  return page;
}

async function runMonitor() {
  let browser = await createBrowser();
  let page = await createPage(browser);

  let lastStatusLabel = null;
  let consecutiveErrorCount = 0;
  let totalChecks = 0;
  let checkInProgress = false;
  let isShuttingDown = false;

  console.log(colorize("Wallex withdrawal monitor started", colors.bold));
  console.log(colorize(`URL: ${config.url}`, colors.gray));
  console.log(colorize(`Interval: ${config.checkIntervalMs / 1000}s`, colors.gray));
  console.log(colorize(`Log file: ${config.logFilePath}`, colors.gray));
  console.log(colorize("Press Ctrl+C to stop.\n", colors.gray));

  async function restartBrowser() {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    browser = await createBrowser();
    page = await createPage(browser);
  }

  async function checkStatusOnce() {
    if (checkInProgress) return;
    checkInProgress = true;
    totalChecks++;
    const time = currentTimestamp();

    try {
      await page.goto(config.url, { waitUntil: "networkidle2", timeout: config.navigationTimeoutMs });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const persianStatus = await findStatusOnPage(page, config.targetLabel);
      const displayStatus = toDisplayStatus(persianStatus);
      consecutiveErrorCount = 0;

      if (!displayStatus) {
        writeLogLine(colorize(`[${time}] Status not found — page structure may have changed.`, colors.yellow));
        return;
      }

      const hasChanged = lastStatusLabel !== null && lastStatusLabel !== displayStatus.label;
      let line = `${colorize(`[${time}]`, colors.gray)} Coin withdrawal: ${colorize(
        displayStatus.label,
        colors.bold + displayStatus.color
      )}`;
      if (hasChanged) line += colorize("  ⚠ CHANGED", colors.yellow);
      writeLogLine(line);

      if (hasChanged) {
        sendDesktopNotification("Wallex status changed", `Coin withdrawal is now ${displayStatus.label}`);
      }
      lastStatusLabel = displayStatus.label;
    } catch (err) {
      consecutiveErrorCount++;
      writeLogLine(colorize(`[${time}] Error checking page: ${err.message}`, colors.red));

      if (consecutiveErrorCount >= config.maxConsecutiveErrors) {
        writeLogLine(
          colorize(`Too many consecutive errors (${consecutiveErrorCount}) — restarting browser...`, colors.red)
        );
        await restartBrowser();
        consecutiveErrorCount = 0;
      }
    } finally {
      checkInProgress = false;
    }
  }

  await checkStatusOnce();
  const intervalId = setInterval(checkStatusOnce, config.checkIntervalMs);

  async function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(colorize("\nShutting down...", colors.gray));
    clearInterval(intervalId);
    await browser.close().catch(() => {});
    console.log(colorize(`Checked ${totalChecks} time(s). Goodbye.`, colors.gray));
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

runMonitor().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
