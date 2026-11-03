// game-readiness.mjs — how the harnesses ask the game for its path and wait on its state (2026-11-02 audit S3).
//
// Automation path. The game reads its automation path in one place (src/app/automationPath.ts). With no request, a
// page under navigator.webdriver takes the harness path: the entry gate auto-skips, transitions run with no veil, and
// the scene watchdogs and device-diag rescue stay off. A receipt that must certify the player's path asks for it with
// `requestAutomationPath(page, 'player')` before navigating (never by hiding navigator.webdriver, which also lied to
// analytics and telemetry). docs/AUTOMATION-PATHS.md lists which tools take which path and how they enter a battle;
// tools/game-readiness.selftest.mjs keeps that page true.

/** The paths the game understands (src/app/automationPath.ts AutomationPath). */
export const AUTOMATION_PATHS = Object.freeze(['player', 'harness']);

function assertPath(path) {
  if (!AUTOMATION_PATHS.includes(path)) throw new TypeError(`unknown automation path ${String(path)} (player | harness)`);
}

/** The init-script source that makes the request, for a tool whose probe is one script string. */
export function automationPathScript(path) {
  assertPath(path);
  return `window.__COT_AUTOMATION = ${JSON.stringify(path)};`;
}

/** Ask the game for its automation path before the page's scripts run (puppeteer's evaluateOnNewDocument). */
export async function requestAutomationPath(page, path) {
  assertPath(path);
  await page.evaluateOnNewDocument((value) => { window.__COT_AUTOMATION = value; }, path);
}
