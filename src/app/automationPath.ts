/**
 * The automation path (2026-11-02 audit S3).
 *
 * The game used to branch on `navigator.webdriver` in six places (the boot gate auto-skip, the transition veils, the
 * battle and Garage scene watchdogs, the debug surface and the drive test), so every browser receipt certified the
 * automation path and a tool that wanted the player's had to spoof `Navigator.prototype.webdriver` (which also hid the
 * debug surface in a production build and let the run count as a player in telemetry). This module is the one reader.
 *
 * - `driven`: a driver controls the page and wants the QA surfaces (`window.__DEBUG`, the drive test, diagnostics).
 * - `harness`: the page takes the harness shortcuts: the boot's entry gate auto-skips (bootScreen.ts), transitions run
 *   their work synchronously with no veil (transition.ts), and the scene black watchdogs (battle and Garage) and the
 *   device-diag rescue stay off (main.ts). False is the player's path: every one of those runs as for a player.
 *
 * A page asks for its path explicitly: `window.__COT_AUTOMATION = 'player' | 'harness'` set before the page's scripts
 * (a tool's evaluateOnNewDocument), or `?automation=player|harness` in the URL. With no request, a page under
 * `navigator.webdriver` takes the harness path (the default every receipt was written against); any other page is a
 * player's. A tool asks with `requestAutomationPath(page, path)` (tools/game-readiness.mjs); docs/AUTOMATION-PATHS.md
 * lists which tools take which path and how they enter a battle. Analytics and telemetry keep their own bot exclusion
 * on `navigator.webdriver` (a player-path receipt is still a robot). Pure: `resolveAutomationMode` takes its probe;
 * `automationMode()` reads the page.
 */

export type AutomationPath = 'player' | 'harness';

export interface AutomationMode {
  readonly driven: boolean;
  readonly harness: boolean;
  readonly path: AutomationPath;
  /** Where the path came from: the page flag, the URL, navigator.webdriver's default, or none (a player's page). */
  readonly source: 'flag' | 'query' | 'webdriver' | 'none';
}

export interface AutomationProbe {
  /** `window.__COT_AUTOMATION`. */
  readonly flag?: unknown;
  /** `location.search`. */
  readonly search?: string;
  /** `navigator.webdriver`. */
  readonly webdriver?: boolean;
}

const PATHS: readonly AutomationPath[] = ['player', 'harness'];
const isPath = (value: unknown): value is AutomationPath =>
  typeof value === 'string' && (PATHS as readonly string[]).includes(value);

/**
 * An explicit request. 'harness' is a driven page that takes the shortcuts. 'player' is a player's page in every
 * respect the game decides (no QA surfaces unless ?debug=1 or a dev server asks for them, as for any player, so a
 * cold-load receipt never times the test runtime); only analytics and telemetry still see navigator.webdriver.
 */
function requested(value: AutomationPath, source: 'flag' | 'query'): AutomationMode {
  const harness = value === 'harness';
  return Object.freeze({ driven: harness, harness, path: value, source });
}

/** The page's mode from its probe: an explicit request first, then navigator.webdriver's default. */
export function resolveAutomationMode({ flag, search = '', webdriver = false }: AutomationProbe = {}): AutomationMode {
  if (isPath(flag)) return requested(flag, 'flag');
  let query: string | null = null;
  try { query = new URLSearchParams(search || '').get('automation'); } catch { query = null; }
  if (isPath(query)) return requested(query, 'query');
  if (webdriver === true) return Object.freeze({ driven: true, harness: true, path: 'harness', source: 'webdriver' });
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
  const webdriver = typeof navigator !== 'undefined' && navigator?.webdriver === true;
  return resolveAutomationMode({ flag: page.__COT_AUTOMATION, search, webdriver });
}

/** The page takes the harness shortcuts (no entry gate, no transition veils, no scene watchdogs). */
export function harnessPath(): boolean {
  return automationMode().harness;
}
