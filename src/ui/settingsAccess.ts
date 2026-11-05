import type { RuntimeValue } from '../runtimeTypes.ts';
import { createElement } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { isAnyModalOpen } from './modal.ts';
import { uiIconSVG } from './uiIcons.ts';
import { t } from './i18n.ts';
import { loadFailed, markLoadFailed, pressFailed } from './components/loadFailure.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';
import { battleInputOwnerFor, createBattleInputOwner } from './battleInputOwner.ts';
import type {
  SettingsOptions as SettingsPanelOptions,
  SettingsRuntime,
} from './settings.ts';

export type SettingsOptions = Omit<SettingsPanelOptions, 'gear' | 'registerMenuAction' | 'inputOwner'>;

type SettingsModule = typeof import('./settings.ts');

interface SettingsAccessEnvironment {
  createGear(): HTMLButtonElement;
  modalOpen(): boolean;
  now(): number;
  /** The battle entry's opaque loading cover is up (.cot-bl.on). */
  loadCovered?(): boolean;
}

interface SettingsAccess {
  readonly root: HTMLElement | null;
  readonly gear: HTMLButtonElement;
  open(): void;
  close(options?: { noRelock?: boolean }): void;
  toggle(): void;
  isOpen(): boolean;
  showHints(): void;
  preload(): Promise<SettingsRuntime>;
  readonly current: SettingsRuntime | null;
}

const TRIGGER_CSS = `
.cot-gear{position:fixed;top:60px;right:26px;z-index:62;width:42px;height:42px;display:none;
  align-items:center;justify-content:center;cursor:pointer;background:rgba(11,15,20,.8);
  border:1px solid rgba(146,164,180,.3);transition:border-color var(--dur-fast),color var(--dur-fast);pointer-events:auto;color:var(--ink-3);}
.cot-gear:hover{border-color:rgba(240,176,74,.6);color:#f0b04a;}
`;

function createDefaultGear(): HTMLButtonElement {
  ensureStyle('cot-settings-trigger-style', TRIGGER_CSS, 'surfaces');
  const gear = createElement('button', 'cot-gear') as HTMLButtonElement;
  gear.type = 'button';
  gear.setAttribute('aria-label', t('settings.gearAria'));
  gear.innerHTML = uiIconSVG('settings', 22);
  gear.dataset.tip = t('settings.gearAria');
  document.body.appendChild(gear);
  return gear;
}

const DEFAULT_ENVIRONMENT: SettingsAccessEnvironment = {
  createGear: createDefaultGear,
  modalOpen: isAnyModalOpen,
  now: () => performance.now(),
  loadCovered: () => !!document.querySelector('.cot-bl.on'),
};

const loadDefaultSettings = async (): Promise<SettingsModule> =>
  await import('./settings.ts');

/**
 * Keep the exact settings trigger in the first garage frame while deferring
 * the large panel, bindings editor, graphics controls, and pause listeners
 * until direct settings or battle intent. The panel's load (its chunk, then the panel built from it) is one
 * app/lazyChunk.ts chunk under the default policy, which the idle preload, every battle entry's preload and the gear
 * share. A failure is asked again by the next caller at once, then only past the backoff (2, 4, 8 ... s), never offline,
 * and a removed chunk shows the reload action. (Round 2 U35: a memo here cleared every failure, asked again at once by
 * each caller.) It is not an opener's chunk: the battle entry awaits it (soloBattleLoadingRuntime.ts preloadSettings), so
 * a failure kept for the document would fail every later battle (the F2 class, app/battleEntryLoadFailure.selftest.mjs).
 * The gear keeps the kit's opener rule for itself: a press never asks a failed chunk again, a press that fails or finds
 * the chunk failed marks the gear (the kit's error state, which needs no chunk), and its next press reloads the page once
 * online (components/loadFailure.ts), unless a later load built the panel, which it then opens.
 */
export function createSettingsAccess(
  options: SettingsOptions,
  load: () => Promise<SettingsModule> = loadDefaultSettings,
  environment: SettingsAccessEnvironment = DEFAULT_ENVIRONMENT,
): SettingsAccess {
  const gear = environment.createGear();
  let current: SettingsRuntime | null = null;
  // (2026-11-02 audit F4) the one battle input owner: a kill-cam replay AND a battle-ending camera beat own the screen
  // (the beat's skip listener does not stop the key, so the Esc that skips it reached this menu action), and the panel
  // reads the same owner for its own openings, veil and pointer-unlock path
  const inputOwner = options.bus
    ? battleInputOwnerFor(options.bus, { now: environment.now })
    : createBattleInputOwner({ now: environment.now });

  const updateTrigger = () => {
    if (current) return;
    gear.style.display = options.gearVisible?.() ? 'flex' : 'none';
  };
  // (2026-10-20, black-screen-228 round 2, D5) never under the battle entry's opaque loading cover: a pause panel there is
  // invisible, it pauses the battle behind the loader, and the entry held on PREPARING with the countdown frozen
  const canOpen = () => !inputOwner.presentationOwns() && !environment.modalOpen() && !environment.loadCovered?.();

  const chunk = createLazyChunk(() => load().then((module) => {
    current = module.createSettings({
      ...options,
      gear,
      registerMenuAction: false,
      inputOwner,
    });
    // a gear that a failed press marked is the built panel's now: its error state goes with the failure
    if (loadFailed(gear)) { delete gear.dataset.loadState; gear.removeAttribute('aria-description'); }
    return current;
  }), { now: environment.now });
  const preload = (): Promise<SettingsRuntime> => chunk.load();

  const open = () => {
    // a panel a later load built (a battle entry's preload, after a press that failed) opens: only a gear whose panel is
    // still not here reloads the page
    if ((!current && pressFailed(gear)) || !canOpen()) return;
    // and a press never asks again for a chunk another caller saw fail (the kit's opener rule): the gear says so now
    void (chunk.state === 'failed' ? Promise.reject<SettingsRuntime>(chunk.error) : preload()).then((runtime) => {
      if (canOpen() && !runtime.isOpen()) runtime.open();
    }).catch((error: RuntimeValue) => {
      console.error('[settings] failed to load', error);
      markLoadFailed([gear]);
    });
  };

  const access: SettingsAccess = {
    get root() { return current?.root ?? null; },
    gear,
    preload,
    open,
    close(closeOptions) { current?.close(closeOptions); },
    toggle() {
      if (current?.isOpen()) current.close();
      else open();
    },
    isOpen: () => current?.isOpen() ?? false,
    showHints: () => { current?.showHints(); },
    get current() { return current; },
  };

  gear.addEventListener('click', open);
  // the battle HUD's corner gear (hud.ts): the same opening as the settings key
  options.bus?.on('ui:openSettings', open);
  options.input.onAction('settingsMenu', (code) => {
    if (code === 'Escape' && options.isSpectating?.()) { options.input.releaseLock(); return; }
    if (!access.isOpen()) open();
  });
  options.bus?.on('phase:change', updateTrigger);
  updateTrigger();
  return access;
}
