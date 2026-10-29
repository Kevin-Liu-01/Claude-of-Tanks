import type { RuntimeValue } from '../runtimeTypes.ts';
import { createElement } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { isAnyModalOpen } from './modal.ts';
import { uiIconSVG } from './uiIcons.ts';
import { t } from './i18n.ts';
import { markLoadFailed, pressFailed } from './components/loadFailure.ts';
import type {
  SettingsOptions as SettingsPanelOptions,
  SettingsRuntime,
} from './settings.ts';

export type SettingsOptions = Omit<SettingsPanelOptions, 'gear' | 'registerMenuAction'>;

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
 * until direct settings or battle intent. A transfer that failed is forgotten (a panel that threw for another reason
 * may build next time), but a chunk that did not arrive is not asked for again in this document: the gear keeps the kit's
 * error state, which needs no chunk, and its next press reloads the page once online (components/loadFailure.ts).
 */
export function createSettingsAccess(
  options: SettingsOptions,
  load: () => Promise<SettingsModule> = loadDefaultSettings,
  environment: SettingsAccessEnvironment = DEFAULT_ENVIRONMENT,
): SettingsAccess {
  const gear = environment.createGear();
  let current: SettingsRuntime | null = null;
  let pending: Promise<SettingsRuntime> | null = null;
  let killcamActive = false;
  let killcamDoneAt = -Infinity;

  const updateTrigger = () => {
    if (current) return;
    gear.style.display = options.gearVisible?.() ? 'flex' : 'none';
  };
  const replayOwnsScreen = () => killcamActive || environment.now() - killcamDoneAt < 250;
  // (2026-10-20, black-screen-228 round 2, D5) never under the battle entry's opaque loading cover: a pause panel there is
  // invisible, it pauses the battle behind the loader, and the entry held on PREPARING with the countdown frozen
  const canOpen = () => !replayOwnsScreen() && !environment.modalOpen() && !environment.loadCovered?.();

  const preload = (): Promise<SettingsRuntime> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    const request = load().then((module) => {
      current = module.createSettings({
        ...options,
        gear,
        registerMenuAction: false,
      });
      return current;
    }).catch((error: RuntimeValue) => {
      if (pending === request) pending = null;
      throw error;
    });
    pending = request;
    return request;
  };

  const open = () => {
    if (pressFailed(gear) || !canOpen()) return;
    void preload().then((runtime) => {
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
  options.bus?.on('killcam:begin', () => {
    killcamActive = true;
  });
  options.bus?.on('killcam:done', () => {
    killcamActive = false;
    killcamDoneAt = environment.now();
  });
  updateTrigger();
  return access;
}
