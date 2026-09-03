import type { ActionId, InputSettings } from '../game/input.ts';
import type { UiIconId } from './uiIcons.ts';

export type SettingsIconTone = 'steel' | 'amber' | 'red' | 'green' | 'cyan' | 'violet';

export interface SettingsIconSpec {
  readonly id: UiIconId;
  readonly tone?: SettingsIconTone;
  readonly badge?: string;
}

export const SETTINGS_ACTION_ICONS = Object.freeze({
  forward: { id: 'moveForward' },
  back: { id: 'moveBack' },
  left: { id: 'steerLeft' },
  right: { id: 'steerRight' },
  handbrake: { id: 'handbrake', tone: 'amber' },
  selfRight: { id: 'reload', tone: 'amber' },
  fire: { id: 'fireGun', tone: 'red' },
  sniperToggle: { id: 'scope', tone: 'cyan' },
  shell1: { id: 'shell', tone: 'amber', badge: '1' },
  shell2: { id: 'shell', tone: 'amber', badge: '2' },
  shell3: { id: 'shell', tone: 'amber', badge: '3' },
  specialAction: { id: 'star', tone: 'amber' },
  reloadMagazine: { id: 'reload', tone: 'amber' },
  consumable1: { id: 'repair', tone: 'amber' },
  consumable2: { id: 'medkit', tone: 'green' },
  consumable3: { id: 'extinguisher', tone: 'red' },
  freeLook: { id: 'freeLook', tone: 'cyan' },
  freeCamera: { id: 'mouse', tone: 'cyan' },
  zoomIn: { id: 'zoomIn', tone: 'cyan' },
  zoomOut: { id: 'zoomOut', tone: 'cyan' },
  minimapZoom: { id: 'map', tone: 'green' },
  shotLog: { id: 'battleRecord', tone: 'cyan' },
  perfHud: { id: 'performance', tone: 'green' },
  settingsMenu: { id: 'settings' },
} satisfies Readonly<Record<ActionId, SettingsIconSpec>>);

export type SettingsOptionIconKey = keyof InputSettings | 'graphicsQuality';

export const SETTINGS_OPTION_ICONS = Object.freeze({
  sensitivity: { id: 'mouse' },
  invertY: { id: 'invertAim', tone: 'cyan' },
  sniperSensScale: { id: 'scope', tone: 'cyan' },
  aimSmoothing: { id: 'aimSmoothing', tone: 'cyan' },
  padSensitivity: { id: 'controller' },
  rmbMode: { id: 'mouse', tone: 'cyan' },
  aiDifficulty: { id: 'battleBots', tone: 'red' },
  showPerfMeter: { id: 'performance', tone: 'green' },
  showDebugHud: { id: 'telemetry', tone: 'violet' },
  showDirectionalHitValues: { id: 'damage', tone: 'red' },
  armorAimOverlay: { id: 'armorFlashlight' },
  volMaster: { id: 'sound', tone: 'cyan' },
  volEngine: { id: 'engine', tone: 'amber' },
  volCombat: { id: 'fireGun', tone: 'red' },
  volAmbience: { id: 'ambience', tone: 'green' },
  volUi: { id: 'music', tone: 'amber' },
  volVoice: { id: 'radio', tone: 'cyan' },
  alarmHeartbeat: { id: 'heartbeat', tone: 'red' },
  graphicsQuality: { id: 'graphics', tone: 'cyan' },
} satisfies Readonly<Record<SettingsOptionIconKey, SettingsIconSpec>>);
