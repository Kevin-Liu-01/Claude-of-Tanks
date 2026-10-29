import type { ActionId, InputSettings } from '../game/input.ts';
import type { UiIconId } from './uiIcons.ts';

type SettingsIconTone = 'steel' | 'amber' | 'red' | 'green' | 'cyan' | 'violet';

export interface SettingsIconSpec {
  readonly id: UiIconId;
  readonly tone?: SettingsIconTone;
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
  shell1: { id: 'shell', tone: 'amber' },
  shell2: { id: 'shell', tone: 'amber' },
  shell3: { id: 'shell', tone: 'amber' },
  // the vehicle's and a flight's actions take the vehicle-action table's glyphs (src/game/vehicleActions.ts), as the HUD's
  // controls row and the Garage do
  specialAction: { id: 'track', tone: 'amber' },
  atgm: { id: 'missileRack', tone: 'red' },
  reloadMagazine: { id: 'autoloader', tone: 'amber' },
  drone: { id: 'modeDrone', tone: 'cyan' },
  smoke: { id: 'smoke', tone: 'steel' },
  lights: { id: 'lightbulb', tone: 'amber' },
  roofGun: { id: 'roofGun', tone: 'amber' },
  aerialVision: { id: 'visionInfrared', tone: 'green' },
  supplyAmmo: {id:'ammoRack',tone:'amber'},
  supplyHeal: {id:'medkit',tone:'green'},
  consumable1: { id: 'repair', tone: 'amber' },
  consumable2: { id: 'medkit', tone: 'green' },
  consumable3: { id: 'extinguisher', tone: 'red' },
  freeLook: { id: 'freeLook', tone: 'cyan' },
  freeCamera: { id: 'mouse', tone: 'cyan' },
  zoomIn: { id: 'zoomIn', tone: 'cyan' },
  zoomOut: { id: 'zoomOut', tone: 'cyan' },
  minimapZoom: { id: 'map', tone: 'green' },
  autoAim: { id: 'autoAim', tone: 'amber' },
  hitboxOverlay: { id: 'armorFlashlight' },
  shotLog: { id: 'battleRecord', tone: 'cyan' },
  perfHud: { id: 'performance', tone: 'green' },
  networkPanel: { id: 'signal', tone: 'cyan' },
  leaveBattle: { id: 'garage', tone: 'red' },
  rangeReset: { id: 'reload', tone: 'green' },
  rangeMoving: { id: 'modeProving', tone: 'amber' },
  settingsMenu: { id: 'settings' },
} satisfies Readonly<Record<ActionId, SettingsIconSpec>>);

type SettingsOptionIconKey = keyof InputSettings | 'graphicsQuality' | 'battleTimes' | 'foliageSeeThrough';

export const SETTINGS_OPTION_ICONS = Object.freeze({
  sensitivity: { id: 'mouse' },
  invertY: { id: 'invertAim', tone: 'cyan' },
  sniperSensScale: { id: 'scope', tone: 'cyan' },
  aimSmoothing: { id: 'aimSmoothing', tone: 'cyan' },
  padSensitivity: { id: 'controller' },
  rmbMode: { id: 'mouse', tone: 'cyan' },
  aiDifficulty: { id: 'battleBots', tone: 'red' },
  showPerfMeter: { id: 'performance', tone: 'green' },
  hideBattleUi: { id: 'graphics', tone: 'cyan' },
  isometricView: { id: 'map', tone: 'cyan' },
  showDebugHud: { id: 'telemetry', tone: 'violet' },
  showDirectionalHitValues: { id: 'blocked', tone: 'red' },
  armorAimOverlay: { id: 'armorFlashlight' },
  volMaster: { id: 'sound', tone: 'cyan' },
  volEngine: { id: 'engine', tone: 'amber' },
  volCombat: { id: 'fireGun', tone: 'red' },
  volAmbience: { id: 'ambience', tone: 'green' },
  volUi: { id: 'music', tone: 'amber' },
  volVoice: { id: 'radio', tone: 'cyan' },
  alarmHeartbeat: { id: 'heartbeat', tone: 'red' },
  crewVoice: { id: 'radio', tone: 'amber' },
  audioConcussion: { id: 'soundOff', tone: 'red' },
  graphicsQuality: { id: 'graphics', tone: 'cyan' },
  battleTimes: { id: 'timeDay', tone: 'amber' },
  foliageSeeThrough: { id: 'regionWoodland', tone: 'green' }, // item 259: Graphics › See-through foliage
  // battle-camera-264: Gameplay › Camera (the chase camera's height, distance, shoulder, framing and lens)
  cameraHeight: { id: 'altitude', tone: 'cyan' },
  cameraDistance: { id: 'zoomOut', tone: 'cyan' },
  cameraShoulder: { id: 'cameraPath', tone: 'cyan' },
  cameraFraming: { id: 'zoomFit', tone: 'cyan' },
  cameraFov: { id: 'optics', tone: 'cyan' },
} satisfies Readonly<Record<SettingsOptionIconKey, SettingsIconSpec>>);
