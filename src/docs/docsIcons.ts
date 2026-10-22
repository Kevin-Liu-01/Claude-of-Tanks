// Field-manual icon vocabulary (brand-ui BUI-F4). Copyright © 2026 Kevin B. Liu.
// Each docs key names the glyph that means it, from the shared sprite, in one of two tones: the accent for what a
// player meets in the game, steel for how it is engineered.

import { icon, type IconId } from '../ui/icons/icon.ts';

type DocsIconTone = 'accent' | 'steel';

interface DocsIconSpec {
  readonly id: IconId;
  readonly tone: DocsIconTone;
}

/** One typed visual vocabulary for the field manual. */
export const DOCS_ICON_SPECS = Object.freeze({
  manual: { id: 'manual', tone: 'accent' },
  github: { id: 'github', tone: 'steel' },
  fleet: { id: 'vehicle', tone: 'accent' },
  battlefields: { id: 'map', tone: 'accent' },
  simulation: { id: 'clock', tone: 'steel' },
  refresh: { id: 'performance', tone: 'steel' },
  overview: { id: 'layerModules', tone: 'steel' },
  rendering: { id: 'graphics', tone: 'steel' },
  vehicles: { id: 'vehicle', tone: 'accent' },
  combat: { id: 'fireGun', tone: 'accent' },
  worlds: { id: 'regionWoodland', tone: 'accent' },
  interface: { id: 'controller', tone: 'steel' },
  multiplayer: { id: 'signal', tone: 'accent' },
  performance: { id: 'performance', tone: 'steel' },
  mobile: { id: 'phone', tone: 'accent' },
  studio: { id: 'studio', tone: 'accent' },
  filming: { id: 'cameraPath', tone: 'accent' },
  gallery: { id: 'gallery', tone: 'accent' },
  verification: { id: 'check', tone: 'steel' },
  authority: { id: 'shield', tone: 'steel' },
  measured: { id: 'toolMeasure', tone: 'steel' },
  assets: { id: 'pixels', tone: 'steel' },
  specification: { id: 'battleRecord', tone: 'steel' },
  rig: { id: 'track', tone: 'steel' },
  anatomy: { id: 'layerXray', tone: 'accent' },
  release: { id: 'rocket', tone: 'steel' },
  runtimeData: { id: 'telemetry', tone: 'steel' },
  coordinates: { id: 'statRange', tone: 'steel' },
  build: { id: 'repair', tone: 'steel' },
  models: { id: 'toolHitbox', tone: 'steel' },
  ai: { id: 'battleBots', tone: 'accent' },
  audio: { id: 'sound', tone: 'accent' },
  quality: { id: 'statBest', tone: 'steel' },
  architecture: { id: 'battleLan', tone: 'steel' },
  isolation: { id: 'toolIsolate', tone: 'steel' },
  evidence: { id: 'toolPhoto', tone: 'steel' },
  memory: { id: 'paste', tone: 'steel' },
  landing: { id: 'deploy', tone: 'steel' },
  research: { id: 'optics', tone: 'steel' },
  construction: { id: 'layerMarkup', tone: 'steel' },
  iconPipeline: { id: 'brush', tone: 'steel' },
  critique: { id: 'freeLook', tone: 'steel' },
  perception: { id: 'visionInfrared', tone: 'accent' },
  navigation: { id: 'roleFlanker', tone: 'accent' },
  aiming: { id: 'scope', tone: 'accent' },
  teamwork: { id: 'team', tone: 'accent' },
  survival: { id: 'medkit', tone: 'accent' },
  spatial: { id: 'globe', tone: 'accent' },
  weapons: { id: 'gun', tone: 'accent' },
  mix: { id: 'music', tone: 'accent' },
  replay: { id: 'rematch', tone: 'accent' },
  loading: { id: 'reload', tone: 'steel' },
  profiling: { id: 'heartbeat', tone: 'steel' },
  optimization: { id: 'speed', tone: 'steel' },
  device: { id: 'gpu', tone: 'steel' },
  budgets: { id: 'statAverage', tone: 'steel' },
  armor: { id: 'layerArmor', tone: 'accent' },
  modes: { id: 'modeStandard', tone: 'accent' },
  garage: { id: 'garage', tone: 'accent' },
  accessibility: { id: 'player', tone: 'steel' },
  workflow: { id: 'statChain', tone: 'steel' },
  damage: { id: 'damage', tone: 'accent' },
  radio: { id: 'radio', tone: 'accent' },
} as const satisfies Readonly<Record<string, DocsIconSpec>>);

export type DocsIconKey = keyof typeof DOCS_ICON_SPECS;

export function docsIconKeys(): DocsIconKey[] {
  return Object.keys(DOCS_ICON_SPECS) as DocsIconKey[];
}

/** Fill decorative placeholders without changing their accessible text. */
export function mountDocsIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-doc-icon]').forEach((element) => {
    const key = element.dataset.docIcon as DocsIconKey | undefined;
    if (!key) return;
    const spec = DOCS_ICON_SPECS[key];
    if (!spec) return;
    element.classList.add('doc-icon', `tone-${spec.tone}`);
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = icon(spec.id, { size: 24 });
  });
}
