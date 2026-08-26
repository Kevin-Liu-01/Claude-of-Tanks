import { createElement, ensureStyle } from './dom.js';
import { isAnyModalOpen } from './modal.js';
import { uiIconSVG } from './uiIcons.js';

interface SettingsInput {
  onAction(action: string, handler: () => void): unknown;
}

interface SettingsBus {
  on(event: string, handler: (payload?: unknown) => void): unknown;
}

export interface SettingsOptions {
  input: SettingsInput;
  bus?: SettingsBus;
  isBattleActive?: () => boolean;
  canLeaveBattle?: () => boolean;
  onLeaveBattle?: () => void;
  gearVisible?: () => boolean;
  isGamePaused?: () => boolean;
}

export interface SettingsRuntime {
  readonly root: HTMLElement;
  readonly gear: HTMLButtonElement;
  open(): void;
  close(options?: { noRelock?: boolean }): void;
  toggle(): void;
  isOpen(): boolean;
  showHints(): void;
}

interface SettingsModule {
  createSettings(options: SettingsOptions & {
    gear: HTMLButtonElement;
    registerMenuAction: false;
  }): SettingsRuntime;
}

interface SettingsAccessEnvironment {
  createGear(): HTMLButtonElement;
  modalOpen(): boolean;
  now(): number;
}

export interface SettingsAccess extends SettingsRuntime {
  preload(): Promise<SettingsRuntime>;
  readonly current: SettingsRuntime | null;
}

const TRIGGER_CSS = `
.cot-gear{position:fixed;top:60px;right:26px;z-index:62;width:42px;height:42px;display:none;
  align-items:center;justify-content:center;cursor:pointer;background:rgba(11,15,20,.8);
  border:1px solid rgba(146,164,180,.3);transition:border-color .12s;pointer-events:auto;}
.cot-gear:hover{border-color:rgba(240,176,74,.6);}
.cot-gear:hover svg path{fill:#f0b04a;}
`;

function createDefaultGear(): HTMLButtonElement {
  ensureStyle('cot-settings-trigger-style', TRIGGER_CSS);
  const gear = createElement('button', 'cot-gear') as HTMLButtonElement;
  gear.type = 'button';
  gear.setAttribute('aria-label', 'Settings');
  gear.innerHTML = uiIconSVG('settings', 22, '#9fb0bf');
  gear.title = 'Settings';
  document.body.appendChild(gear);
  return gear;
}

const DEFAULT_ENVIRONMENT: SettingsAccessEnvironment = {
  createGear: createDefaultGear,
  modalOpen: isAnyModalOpen,
  now: () => performance.now(),
};

const loadDefaultSettings = async (): Promise<SettingsModule> =>
  await import('./settings.js') as unknown as SettingsModule;

/**
 * Keep the exact settings trigger in the first garage frame while deferring
 * the large panel, bindings editor, graphics controls, and pause listeners
 * until direct settings or battle intent. Failed transfers remain retryable.
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
  const canOpen = () => !replayOwnsScreen() && !environment.modalOpen();

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
    }).catch((error: unknown) => {
      if (pending === request) pending = null;
      throw error;
    });
    pending = request;
    return request;
  };

  const open = () => {
    if (!canOpen()) return;
    void preload().then((runtime) => {
      if (canOpen() && !runtime.isOpen()) runtime.open();
    }).catch((error: unknown) => {
      console.error('[settings] failed to load', error);
    });
  };

  const access: SettingsAccess = {
    root: null as unknown as HTMLElement,
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

  Object.defineProperty(access, 'root', {
    enumerable: true,
    get: () => current?.root ?? null,
  });

  gear.addEventListener('click', open);
  options.input.onAction('settingsMenu', () => {
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
