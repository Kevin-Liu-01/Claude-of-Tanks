/**
 * The automation path (2026-11-02 audit S3).
 *
 * The game used to branch on `navigator.webdriver` in six places (the boot gate auto-skip, the transition veils, the
 * battle and Garage scene watchdogs, the debug surface and the drive test), so every browser receipt certified the
 * automation path and a tool that wanted the player's had to spoof `Navigator.prototype.webdriver` (which also hid the
 * debug surface in a production build and let the run count as a player in telemetry). This module is the one reader,
 * and it reads only an explicit request: no module of the game sniffs the driver to pick its path.
 *
 * - `driven`: a driver controls the page and wants the QA surfaces (`window.__DEBUG`, the drive test, diagnostics).
 * - `harness`: the page takes the harness shortcuts: the boot's entry gate auto-skips (bootScreen.ts), transitions run
 *   their work synchronously with no veil (transition.ts), and the scene black watchdogs (battle and Garage) and the
 *   device-diag rescue stay off (main.ts). False is the player's path: every one of those runs as for a player.
 *
 * A page asks for its path: `window.__COT_AUTOMATION = 'player' | 'harness'` set before the page's scripts (an init
 * script), or `?automation=player|harness` in the URL. A page that asks for nothing is a player's page, whoever drives
 * it. Every page a tool's browser hands out asks for the harness path (tools/browser-launch.mjs launchGuardedBrowser
 * registers the request before the tool's first navigation, tools/game-readiness.mjs prepareToolBrowser); a receipt
 * that certifies the player's path asks for it instead (`requestAutomationPath(page, 'player')`, which runs after the
 * launcher's request and wins). docs/AUTOMATION-PATHS.md lists which tools take which path and how they enter a battle.
 * Analytics and telemetry keep their own bot exclusion on `navigator.webdriver` (a player-path receipt is still a
 * robot). Pure: `resolveAutomationMode` takes its probe; `automationMode()` reads the page.
 */

export type AutomationPath = 'player' | 'harness';

export interface AutomationMode {
  readonly driven: boolean;
  readonly harness: boolean;
  readonly path: AutomationPath;
  /** Where the path came from: the page flag, the URL, or none (a player's page). */
  readonly source: 'flag' | 'query' | 'none';
}

export interface AutomationProbe {
  /** `window.__COT_AUTOMATION`. */
  readonly flag?: unknown;
  /** `location.search`. */
  readonly search?: string;
}

const PATHS: readonly AutomationPath[] = ['player', 'harness'];
const isPath = (value: unknown): value is AutomationPath =>
  typeof value === 'string' && (PATHS as readonly string[]).includes(value);

/**
 * An explicit request. 'harness' is a driven page that takes the shortcuts. 'player' is a player's page in every
 * respect the game decides (no QA surfaces unless ?debug=1 or a dev server asks for them, as for any player, so a
 * cold-load receipt never times the test runtime); only analytics and telemetry still see the driver.
 */
function requested(value: AutomationPath, source: 'flag' | 'query'): AutomationMode {
  const harness = value === 'harness';
  return Object.freeze({ driven: harness, harness, path: value, source });
}

/** The page's mode from its probe: the page flag, then the URL; no request is a player's page. */
export function resolveAutomationMode({ flag, search = '' }: AutomationProbe = {}): AutomationMode {
  if (isPath(flag)) return requested(flag, 'flag');
  let query: string | null = null;
  try { query = new URLSearchParams(search || '').get('automation'); } catch { query = null; }
  if (isPath(query)) return requested(query, 'query');
  return Object.freeze({ driven: false, harness: false, path: 'player', source: 'none' });
}

type AutomationHost = typeof globalThis & { __COT_AUTOMATION?: unknown; location?: { search?: string } };

/**
 * This page's mode, from the page as it is now. The request is normally made before the page's scripts run; a tool
 * may also change it mid-page (tools/click-timeline.mjs boots driven, then takes the player's veils once the Garage is
 * up), so the shortcuts read it where each is decided, and only the QA surfaces (`driven`) are a boot decision.
 */
export function automationMode(): AutomationMode {
  const page = (typeof window !== 'undefined' ? window : globalThis) as AutomationHost;
  let search = '';
  try { search = page.location?.search || ''; } catch { search = ''; }
  return resolveAutomationMode({ flag: page.__COT_AUTOMATION, search });
}

/** The page takes the harness shortcuts (no entry gate, no transition veils, no scene watchdogs). */
export function harnessPath(): boolean {
  return automationMode().harness;
}
