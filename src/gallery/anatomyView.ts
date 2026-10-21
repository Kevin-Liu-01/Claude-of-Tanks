// Gallery anatomy view: the lazily loaded browser side of the Armor, Modules and Crew layers.
//
// gallery.ts imports this module through import() the first time an anatomy layer opens, so the Gallery's first load
// and the game's boot graph do not carry it. It mounts the anatomy scene (anatomyScene.ts) in the selected vehicle's
// combat frames, hides the exterior from the main pass and redraws it as a glass shell, and owns the layer toggles,
// the legend, the part badges (the keyboard path to every pick) and the inspection text.
import * as THREE from 'three';
import { t, formatNumber } from '../ui/i18n.ts';
import { uiIconSVG } from '../ui/uiIcons.ts';
import { TRACK_MODULES, plateMetricMm, type AnatomyArmor } from './anatomyData.ts';
import { ghostMaterials } from './anatomyMaterials.ts';
import {
  ANATOMY_SYSTEMS, ARMOR_LAYER_COLORS, ARMOR_METRICS, ARMOR_RAMP_TICKS, CREW_ROLE_COLORS, CREW_ROLE_LETTERS,
  SYSTEM_COLORS, armorRampGradient, armorRampPosition, type ArmorMetric,
} from './anatomyPalette.ts';
import { HIT_VOLUME_COLOR, buildAnatomyScene, type AnatomyPick, type AnatomyScene, type AnatomyToggles } from './anatomyScene.ts';

export type AnatomyMode = 'armor' | 'modules' | 'crew';
export type AnatomyToggle = keyof AnatomyToggles | 'exterior' | 'labels';
type ViewToggles = AnatomyToggles & { exterior: boolean; labels: boolean };

const CORE_BADGE_MODULES = new Set(['engine', 'transmission', 'fuelTank', 'ammoRack', 'autoloader', 'missileRack', 'feedSystem']);

/** Layer for exterior meshes while an anatomy layer is on: off the main pass, drawn only by the ghost passes. */
const EXTERIOR_LAYER = 3;

const DEFAULT_TOGGLES: Readonly<Record<AnatomyMode, ViewToggles>> = Object.freeze({
  armor: { armor: true, addOns: true, modules: false, crew: false, hits: false, exterior: true, labels: false },
  modules: { armor: false, addOns: false, modules: true, crew: true, hits: false, exterior: true, labels: true },
  crew: { armor: false, addOns: false, modules: false, crew: true, hits: false, exterior: true, labels: true },
});

/** The toggles each layer offers, in toolbar order. */
const ANATOMY_CHIPS: Readonly<Record<AnatomyMode, readonly AnatomyToggle[]>> = Object.freeze({
  armor: ['addOns', 'exterior'],
  modules: ['modules', 'crew', 'hits', 'exterior', 'labels'],
  crew: ['crew', 'modules', 'hits', 'exterior', 'labels'],
});

const CHIP_ICONS: Readonly<Record<AnatomyToggle, string>> = Object.freeze({
  armor: 'shield', addOns: 'armorFlashlight', modules: 'engine', crew: 'crew', hits: 'graphics', exterior: 'gallery', labels: 'info',
});

export interface AnatomyVehicle {
  id: string;
  /** Cache key: the vehicle and the specimen's armor state (stripped plates). */
  key: string;
  armor: AnatomyArmor;
  caliberMm: number;
  modern: boolean;
  root: THREE.Object3D;
}

interface AnatomyReadout { id: string; owner: string; title: string; details: string }

export interface AnatomyHost {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  viewport: HTMLElement;
  console: HTMLElement;
  legend: HTMLElement;
  onSelect(pick: AnatomyPick | null, readout: AnatomyReadout | null): void;
  onToggle(): void;
}

const STYLE = `
.anatomy-bar{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;width:min(800px,100%);margin:0 auto 6px;pointer-events:auto}
.anatomy-bar[hidden]{display:none}
.anatomy-chip,.anatomy-seg button{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:5px 10px;border:1px solid rgba(174,190,197,.24);background:rgba(5,9,11,.9);color:#aeb8bb;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;backdrop-filter:blur(10px)}
.anatomy-chip svg,.anatomy-seg svg{width:14px;height:14px;flex:none}
.anatomy-chip[aria-pressed="true"]{border-color:rgba(255,189,92,.7);background:rgba(74,46,10,.88);color:#ffd08a}
.anatomy-chip:hover,.anatomy-seg button:hover{border-color:rgba(255,189,92,.5);color:#ffe2b4}
.anatomy-seg{display:inline-flex;border:1px solid rgba(174,190,197,.24)}
.anatomy-seg button{border:0;border-left:1px solid rgba(174,190,197,.18);min-width:58px;justify-content:center}
.anatomy-seg button:first-child{border-left:0}
.anatomy-seg button[aria-checked="true"]{background:rgba(74,46,10,.9);color:#ffd08a;box-shadow:inset 0 -2px 0 #f0a030}
#viewport .overlay-legend.anatomy-legend{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 10px}
#viewport .anatomy-legend .anatomy-ramp{display:grid;grid-template-columns:auto minmax(180px,300px);align-items:center;gap:8px;padding:5px 9px;background:rgba(5,9,11,.92);border:1px solid rgba(174,190,197,.2)}
#viewport .anatomy-legend .anatomy-ramp b{color:#d9dfe1;font-size:10px;letter-spacing:.06em;white-space:nowrap}
#viewport .anatomy-legend .anatomy-ramp-bar{position:relative;height:9px;border:1px solid rgba(0,0,0,.6)}
#viewport .anatomy-legend .anatomy-ramp-ticks{position:relative;height:12px;margin-top:3px}
#viewport .anatomy-legend .anatomy-ramp-ticks span{position:absolute;display:block;min-height:0;padding:0;border:0;background:none;transform:translateX(-50%);color:#9aa5a9;font:600 9px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:0;text-transform:none;white-space:nowrap}
#viewport .anatomy-legend .anatomy-key{display:inline-flex;align-items:center;gap:6px;min-height:22px;padding:4px 8px;background:rgba(5,9,11,.92);border:1px solid rgba(174,190,197,.2);color:#b5bfc2;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
#viewport .anatomy-legend .anatomy-key i{width:10px;height:10px;background:var(--key);box-shadow:0 0 0 1px rgba(0,0,0,.5)}
#viewport .anatomy-legend .anatomy-key svg{width:13px;height:13px;color:var(--key)}
.anatomy-badges{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden}
.anatomy-badges[hidden]{display:none}
.anatomy-badge{position:absolute;left:0;top:0;display:grid;place-items:center;width:26px;height:26px;margin:-13px 0 0 -13px;padding:0;border:2px solid var(--badge);border-radius:50%;background:rgba(6,9,11,.86);color:var(--badge);font:800 11px/1 "IBM Plex Mono",ui-monospace,monospace;pointer-events:auto;will-change:transform;box-shadow:0 2px 10px rgba(0,0,0,.5)}
.anatomy-badge svg{width:14px;height:14px}
.anatomy-badge[aria-pressed="true"]{background:#f0a030;border-color:#ffd08a;color:#1c1204}
.anatomy-badge.is-off{display:none}
@media (pointer:coarse){.anatomy-chip,.anatomy-seg button{min-height:40px;padding:6px 11px}.anatomy-badge{width:32px;height:32px;margin:-16px 0 0 -16px}}
body[data-cot-width='phone'] .anatomy-chip span,body[data-cot-width='compact'] .anatomy-chip span{display:none}
body[data-cot-width='phone'] .anatomy-bar,body[data-cot-width='compact'] .anatomy-bar{gap:3px;margin-bottom:4px}
body[data-cot-width='phone'] .anatomy-chip,body[data-cot-width='compact'] .anatomy-chip,
body[data-cot-width='phone'] .anatomy-seg button,body[data-cot-width='compact'] .anatomy-seg button{min-height:32px;padding:4px 8px;font-size:9px}
body[data-cot-width='phone'] .anatomy-seg button,body[data-cot-width='compact'] .anatomy-seg button{min-width:0}
body[data-cot-width='phone'] #viewport .overlay-legend.anatomy-legend{gap:3px 4px}
body[data-cot-width='phone'] #viewport .anatomy-legend .anatomy-ramp{grid-template-columns:auto minmax(0,1fr);gap:6px;width:100%;padding:3px 7px}
body[data-cot-width='phone'] #viewport .anatomy-legend .anatomy-ramp b{font-size:8.5px}
body[data-cot-width='phone'] #viewport .anatomy-legend .anatomy-ramp-ticks span{font-size:8px}
body[data-cot-width='phone'] #viewport .anatomy-legend .anatomy-ramp-ticks span[data-minor]{display:none}
body[data-cot-width='phone'] #viewport .anatomy-legend .anatomy-key{min-height:18px;gap:4px;padding:2px 5px;font-size:8.5px;letter-spacing:.03em}
body[data-cot-width='phone'] #viewport .anatomy-legend .anatomy-key i{width:8px;height:8px}
`;

// Plate and station ids as words (catalog.ts's technicalLabel, kept local: importing catalog.ts here would split it
// and tankLabels into chunks shared with the game page and add a request to the game's first load).
function technicalLabel(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

function moduleName(module: string): string { return t(`garage.module.${module}`); }
function crewName(crew: string): string { return t(`garage.crew.${crew}`); }
function ownerName(frame: string): string { return t(`gallery.anatomy.owner.${frame}`); }

function dimensions(min: readonly number[], max: readonly number[]): string {
  return [0, 1, 2].map((axis) => formatNumber(Math.abs(max[axis] - min[axis]), { maximumFractionDigits: 2 })).join(' × ');
}

/** Inspection text for a pick: every number is the combat data itself, in metres and millimetres. */
function anatomyReadout(pick: AnatomyPick, metric: ArmorMetric): AnatomyReadout {
  if (pick.kind === 'armor') {
    const plate = pick.surface.plate;
    const frame = pick.surface.frame;
    const id = `${frame[0].toUpperCase()}${String(pick.index + 1).padStart(2, '0')}`;
    if (pick.surface.layer === 'era') {
      return {
        id, owner: ownerName(frame), title: technicalLabel(String(plate.name || '').replaceAll('_', ' ')),
        details: t('gallery.anatomy.detail.era', {
          physical: Number(plate.physicalMm || 0),
          reduction: Math.round(Number(plate.era?.keReduction || 0) * 100),
          flat: Number(plate.era?.ceFlatMm || 0),
        }),
      };
    }
    return {
      id, owner: ownerName(frame), title: technicalLabel(String(plate.name || '').replaceAll('_', ' ')),
      details: t('gallery.anatomy.detail.armor', {
        layer: t(`gallery.anatomy.layer.${pick.surface.layer}`),
        ke: plateMetricMm(plate, 'ke'), ce: plateMetricMm(plate, 'ce'), physical: plateMetricMm(plate, 'physical'),
        metric: t(`gallery.anatomy.metric.${metric}`),
      }),
    };
  }
  if (pick.kind === 'module') {
    const part = pick.part;
    return {
      id: `M${String(part.index + 1).padStart(2, '0')}${part.parts > 1 ? `.${part.part + 1}` : ''}`,
      owner: ownerName(part.frame),
      title: moduleName(part.module),
      details: t('gallery.anatomy.detail.module', {
        system: t(`gallery.anatomy.system.${part.system}`),
        dimensions: dimensions(part.min, part.max),
        parts: part.parts > 1 ? t('gallery.anatomy.detail.parts', { part: part.part + 1, count: part.parts }) : '',
      }),
    };
  }
  if (pick.kind === 'crew') {
    const station = pick.station;
    return {
      id: `C${station.index + 1}`,
      owner: ownerName(station.frame),
      title: crewName(station.crew),
      details: t('gallery.anatomy.detail.crew', {
        station: technicalLabel(String(station.volume.station || station.frame).replace(/([a-z])([A-Z])/g, '$1 $2')),
        dimensions: dimensions(station.volume.min, station.volume.max),
      }),
    };
  }
  return {
    id: 'B', owner: ownerName('gun'), title: moduleName('gun'),
    details: t('gallery.anatomy.detail.barrel', {
      length: formatNumber(pick.lengthM, { maximumFractionDigits: 2 }),
      diameter: Math.round(pick.radiusM * 2000),
    }),
  };
}

export interface AnatomyView {
  readonly mode: AnatomyMode | null;
  readonly count: number;
  show(mode: AnatomyMode, vehicle: AnatomyVehicle): void;
  hide(): void;
  /** Called by the render loop instead of renderer.render while a layer is on. */
  render(): void;
  update(): void;
  pickAt(clientX: number, clientY: number): boolean;
  hoverAt(clientX: number, clientY: number): void;
  clearHover(): void;
  select(key: string | null): void;
  setToggle(toggle: AnatomyToggle, value: boolean): void;
  setMetric(metric: ArmorMetric): void;
  setStates(state: (pick: AnatomyPick) => 'ok' | 'yellow' | 'red' | 'removed'): void;
  plateCenterWorld(name: string, target: THREE.Vector3): boolean;
  state(): Record<string, unknown>;
  release(): void;
  dispose(): void;
}

function pickKey(pick: AnatomyPick | null): string | null {
  if (!pick) return null;
  if (pick.kind === 'armor') return pick.surface.plate.name ? `plate:${pick.surface.plate.name}` : `surface:${pick.index}`;
  if (pick.kind === 'module') return `module:${pick.part.module}`;
  if (pick.kind === 'crew') return `crew:${pick.station.crew}`;
  return 'module:gun';
}

export function createAnatomyView(host: AnatomyHost): AnatomyView {
  const style = document.createElement('style');
  style.dataset.galleryAnatomy = '';
  style.textContent = STYLE;
  document.head.append(style);
  const bar = document.createElement('div');
  bar.className = 'anatomy-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('gallery.anatomy.toolbarAria'));
  bar.hidden = true;
  host.console.insertBefore(bar, host.legend);
  const badges = document.createElement('div');
  badges.className = 'anatomy-badges';
  badges.setAttribute('aria-label', t('gallery.anatomy.badgesAria'));
  badges.hidden = true;
  host.viewport.append(badges);
  const { depth, ghost } = ghostMaterials();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const scratch = new THREE.Vector3();
  const toggles: Record<AnatomyMode, ViewToggles> = {
    armor: { ...DEFAULT_TOGGLES.armor }, modules: { ...DEFAULT_TOGGLES.modules }, crew: { ...DEFAULT_TOGGLES.crew },
  };
  // A phone stage is too small for a dozen part badges at once: they start off there (the Labels chip brings them back).
  if (globalThis.matchMedia?.('(max-width: 700px)').matches) { toggles.modules.labels = false; toggles.crew.labels = false; }
  let metric: ArmorMetric = 'ke';
  let mode: AnatomyMode | null = null;
  let anatomy: AnatomyScene | null = null;
  let vehicle: AnatomyVehicle | null = null;
  let selected: AnatomyPick | null = null;
  let hoverPending: { x: number; y: number } | null = null;
  let visiblePickables: THREE.Object3D[] = [];
  const hidden = new Map<THREE.Object3D, { mask: number; visible: boolean }>();
  const badgeItems: Array<{ element: HTMLButtonElement; anchor: AnatomyScene['anchors'][number]; kind: 'module' | 'crew' }> = [];

  function hideExterior(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (object === anatomy?.frames.root || hidden.has(object)) return;
      if (object instanceof THREE.Mesh) {
        hidden.set(object, { mask: object.layers.mask, visible: object.visible });
        object.layers.set(EXTERIOR_LAYER);
      } else if (object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
        hidden.set(object, { mask: object.layers.mask, visible: object.visible });
        object.visible = false;
      }
    });
  }

  function restoreExterior(): void {
    for (const [object, saved] of hidden) {
      object.layers.mask = saved.mask;
      object.visible = saved.visible;
    }
    hidden.clear();
  }

  function current(): ViewToggles { return toggles[mode || 'armor']; }

  function applyToggles(): void {
    if (!anatomy || !mode) return;
    const view = current();
    anatomy.setToggles({ armor: view.armor, addOns: view.addOns, modules: view.modules, crew: view.crew, hits: view.hits });
    const visible = new Set<THREE.Object3D>();
    anatomy.frames.root.traverseVisible((object) => { visible.add(object); });
    visiblePickables = anatomy.pickables.filter((object) => visible.has(object));
    // Module badges name the core systems only; crew letters belong to the Crew layer. Fewer, unstacked badges.
    for (const item of badgeItems) {
      const pick = item.anchor.pick;
      const on = view.labels && (item.kind === 'module'
        ? view.modules && pick.kind === 'module' && CORE_BADGE_MODULES.has(pick.part.module)
        : view.crew && mode === 'crew');
      item.element.classList.toggle('is-off', !on);
    }
    badges.hidden = !view.labels;
    renderBar();
    renderLegend();
  }

  function renderBar(): void {
    if (!mode) { bar.hidden = true; return; }
    bar.hidden = false;
    const view = current();
    const items: HTMLElement[] = [];
    if (mode === 'armor') {
      const seg = document.createElement('div');
      seg.className = 'anatomy-seg';
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', t('gallery.anatomy.metricAria'));
      for (const value of ARMOR_METRICS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', String(metric === value));
        button.dataset.anatomyMetric = value;
        button.title = t(`gallery.anatomy.metricTitle.${value}`);
        button.textContent = t(`gallery.anatomy.metric.${value}`);
        seg.append(button);
      }
      items.push(seg);
    }
    for (const toggle of ANATOMY_CHIPS[mode]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'anatomy-chip';
      button.dataset.anatomyToggle = toggle;
      button.setAttribute('aria-pressed', String(view[toggle]));
      button.title = t(`gallery.anatomy.toggle.${toggle}`);
      button.innerHTML = uiIconSVG(CHIP_ICONS[toggle], 14);
      const label = document.createElement('span');
      label.textContent = t(`gallery.anatomy.toggle.${toggle}`);
      button.append(label);
      items.push(button);
    }
    const focused = (document.activeElement as HTMLElement | null)?.dataset;
    bar.replaceChildren(...items);
    const again = focused?.anatomyToggle ? bar.querySelector<HTMLElement>(`[data-anatomy-toggle="${focused.anatomyToggle}"]`)
      : focused?.anatomyMetric ? bar.querySelector<HTMLElement>(`[data-anatomy-metric="${focused.anatomyMetric}"]`) : null;
    again?.focus({ preventScroll: true });
  }

  function renderLegend(): void {
    if (!mode) return;
    const view = current();
    host.legend.classList.add('anatomy-legend');
    const entries: HTMLElement[] = [];
    const key = (label: string, color: string, icon?: string) => {
      const item = document.createElement('span');
      item.className = 'anatomy-key';
      item.style.setProperty('--key', color);
      if (icon) item.innerHTML = uiIconSVG(icon, 13); else item.append(document.createElement('i'));
      item.append(label);
      return item;
    };
    if (mode === 'armor') {
      const ramp = document.createElement('div');
      ramp.className = 'anatomy-ramp';
      const title = document.createElement('b');
      title.textContent = t('gallery.anatomy.legend.mm', { metric: t(`gallery.anatomy.metric.${metric}`) });
      const scale = document.createElement('div');
      const barElement = document.createElement('div');
      barElement.className = 'anatomy-ramp-bar';
      barElement.style.background = `linear-gradient(90deg, ${armorRampGradient()})`;
      const ticks = document.createElement('div');
      ticks.className = 'anatomy-ramp-ticks';
      for (const mm of ARMOR_RAMP_TICKS) {
        const tick = document.createElement('span');
        tick.style.left = `${(armorRampPosition(mm) * 100).toFixed(1)}%`;
        tick.textContent = mm >= 1200 ? `${formatNumber(mm)}+` : formatNumber(mm);
        if (![0, 100, 300, 650, 1200].includes(mm)) tick.dataset.minor = '';
        ticks.append(tick);
      }
      scale.append(barElement, ticks);
      ramp.append(title, scale);
      entries.push(ramp);
      if (view.addOns) {
        const layers = new Set(anatomy?.surfaces.map((surface) => surface.layer) || []);
        for (const layer of ['era', 'spaced', 'external', 'housing'] as const) {
          if (layers.has(layer)) entries.push(key(t(`gallery.anatomy.layer.${layer}`), ARMOR_LAYER_COLORS[layer]));
        }
      }
    } else {
      const present = new Set(anatomy?.parts.filter((part) => !TRACK_MODULES.has(part.module)).map((part) => part.system) || []);
      for (const system of ANATOMY_SYSTEMS) {
        if (system === 'crew' || !view.modules || !present.has(system)) continue;
        entries.push(key(t(`gallery.anatomy.system.${system}`), SYSTEM_COLORS[system]));
      }
      if (view.crew) {
        // The Crew layer keys its role colours (helmet bands and tinted figures), one key per role on board.
        const roles = [...new Set(anatomy?.stations.map((station) => station.role) || [])];
        for (const role of (['commander', 'gunner', 'loader', 'driver', 'radio'] as const).filter((entry) => roles.includes(entry))) {
          entries.push(key(t(`gallery.anatomy.role.${role}`), CREW_ROLE_COLORS[role]));
        }
      }
      if (view.hits) entries.push(key(t('gallery.anatomy.toggle.hits'), HIT_VOLUME_COLOR));
    }
    host.legend.replaceChildren(...entries);
  }

  function buildBadges(): void {
    badgeItems.length = 0;
    badges.replaceChildren();
    if (!anatomy) return;
    const seen = new Set<string>();
    const roleCount = new Map<string, number>();
    for (const anchor of anatomy.anchors) {
      const pick = anchor.pick;
      if (pick.kind !== 'module' && pick.kind !== 'crew') continue;
      // One badge per logical module: multi-part modules (vision blocks, roof weapon) badge their first part.
      const logical = pickKey(pick) || anchor.key;
      if (seen.has(logical)) continue;
      seen.add(logical);
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'anatomy-badge';
      element.dataset.anatomyPart = logical;
      element.setAttribute('aria-pressed', 'false');
      if (pick.kind === 'module') {
        element.style.setProperty('--badge', SYSTEM_COLORS[pick.part.system]);
        element.innerHTML = uiIconSVG(/^track[LR]$/.test(pick.part.module) ? 'track' : pick.part.module, 14);
        element.setAttribute('aria-label', moduleName(pick.part.module));
        element.title = moduleName(pick.part.module);
      } else {
        element.style.setProperty('--badge', CREW_ROLE_COLORS[pick.station.role]);
        // A second crew member in one role (assistant loader, second weapon operator) reads L2, G2.
        const count = (roleCount.get(pick.station.role) || 0) + 1;
        roleCount.set(pick.station.role, count);
        element.textContent = `${CREW_ROLE_LETTERS[pick.station.role]}${count > 1 ? count : ''}`;
        element.setAttribute('aria-label', crewName(pick.station.crew));
        element.title = crewName(pick.station.crew);
      }
      badges.append(element);
      badgeItems.push({ element, anchor, kind: pick.kind });
    }
  }

  function setSelected(pick: AnatomyPick | null, announce = true): void {
    selected = pick;
    anatomy?.select(pick);
    const key = pickKey(pick);
    for (const item of badgeItems) item.element.setAttribute('aria-pressed', String(item.element.dataset.anatomyPart === key));
    if (announce) host.onSelect(pick, pick ? anatomyReadout(pick, metric) : null);
  }

  function findPick(key: string | null): AnatomyPick | null {
    if (!anatomy || !key) return null;
    if (key.startsWith('plate:')) {
      const name = key.slice(6);
      const index = anatomy.surfaces.findIndex((surface) => surface.plate.name === name);
      return index >= 0 ? { kind: 'armor', surface: anatomy.surfaces[index], index } : null;
    }
    if (key.startsWith('module:')) {
      const part = anatomy.parts.find((entry) => entry.module === key.slice(7));
      return part ? { kind: 'module', part } : null;
    }
    if (key.startsWith('crew:')) {
      const station = anatomy.stations.find((entry) => entry.crew === key.slice(5));
      return station ? { kind: 'crew', station } : null;
    }
    return null;
  }

  function raycastAt(clientX: number, clientY: number): AnatomyPick | null {
    if (!anatomy || !visiblePickables.length) return null;
    const rect = host.renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, host.camera);
    const hit = raycaster.intersectObjects(visiblePickables, false)[0];
    return hit ? anatomy.pick(hit) : null;
  }

  bar.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.anatomyMetric) view.setMetric(button.dataset.anatomyMetric as ArmorMetric);
    else if (button.dataset.anatomyToggle) {
      const toggle = button.dataset.anatomyToggle as AnatomyToggle;
      view.setToggle(toggle, !current()[toggle]);
    }
  });
  bar.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (!target.dataset.anatomyMetric || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const index = ARMOR_METRICS.indexOf(metric) + (event.key === 'ArrowRight' ? 1 : -1);
    view.setMetric(ARMOR_METRICS[(index + ARMOR_METRICS.length) % ARMOR_METRICS.length]);
    bar.querySelector<HTMLElement>(`[data-anatomy-metric="${metric}"]`)?.focus();
  });
  badges.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.anatomy-badge');
    if (!button) return;
    const pick = findPick(button.dataset.anatomyPart || null);
    setSelected(pickKey(selected) === button.dataset.anatomyPart ? null : pick);
  });
  badges.addEventListener('pointerover', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.anatomy-badge');
    anatomy?.isolate(button ? findPick(button.dataset.anatomyPart || null) : null);
  });
  badges.addEventListener('pointerout', () => anatomy?.isolate(null));
  badges.addEventListener('focusin', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.anatomy-badge');
    anatomy?.isolate(button ? findPick(button.dataset.anatomyPart || null) : null);
  });
  badges.addEventListener('focusout', () => anatomy?.isolate(null));

  const view: AnatomyView = {
    get mode() { return mode; },
    get count() {
      if (!anatomy || !mode) return 0;
      const v = current();
      return (v.armor ? anatomy.surfaces.filter((surface) => surface.layer === 'main').length : 0)
        + (v.addOns ? anatomy.surfaces.filter((surface) => surface.layer !== 'main').length : 0)
        + (v.modules ? anatomy.parts.filter((part) => !TRACK_MODULES.has(part.module)).length : 0)
        + (v.crew ? anatomy.stations.length : 0);
    },
    show(nextMode, nextVehicle) {
      const rebuilt = !anatomy || vehicle?.key !== nextVehicle.key;
      if (rebuilt) {
        const keep = pickKey(selected);
        anatomy?.dispose();
        restoreExterior();
        vehicle = nextVehicle;
        anatomy = buildAnatomyScene(nextVehicle.armor, { caliberMm: nextVehicle.caliberMm, modern: nextVehicle.modern, metric });
        anatomy.frames.root.matrixAutoUpdate = false;
        host.scene.add(anatomy.frames.root);
        buildBadges();
        selected = findPick(keep);
      }
      if (mode !== nextMode) setSelected(null, false);
      mode = nextMode;
      if (anatomy) anatomy.frames.root.visible = true;
      hideExterior(nextVehicle.root);
      applyToggles();
      view.update();
      anatomy?.select(selected);
    },
    hide() {
      mode = null;
      restoreExterior();
      if (anatomy) anatomy.frames.root.visible = false;
      bar.hidden = true;
      badges.hidden = true;
      host.legend.classList.remove('anatomy-legend');
      setSelected(null, false);
    },
    render() {
      const { renderer, scene, camera } = host;
      if (anatomy) anatomy.frames.root.visible = !!mode;
      renderer.render(scene, camera);
      if (!mode || !current().exterior) return;
      const autoClear = renderer.autoClear;
      const mask = camera.layers.mask;
      const override = scene.overrideMaterial;
      renderer.autoClear = false;
      camera.layers.set(EXTERIOR_LAYER);
      scene.overrideMaterial = depth;
      renderer.render(scene, camera);
      scene.overrideMaterial = ghost;
      // Armor: a faint shell for context. X-ray: a visible glass veil, so internals read as inside the hull.
      ghost.uniforms.uRim.value = mode === 'armor' ? 0.3 : 0.5;
      ghost.uniforms.uFill.value = mode === 'armor' ? 0.035 : 0.11;
      renderer.render(scene, camera);
      scene.overrideMaterial = override;
      camera.layers.mask = mask;
      renderer.autoClear = autoClear;
    },
    update() {
      if (!anatomy || !vehicle || !mode) return;
      const root = vehicle.root;
      root.updateMatrixWorld();
      anatomy.frames.root.matrix.copy(root.matrixWorld);
      anatomy.frames.root.matrixWorldNeedsUpdate = true;
      anatomy.syncPose(root.getObjectByName('rig_turret')?.rotation.y || 0, -(root.getObjectByName('rig_gun')?.rotation.x || 0));
      anatomy.frames.root.updateMatrixWorld(true);
      if (hoverPending) {
        const { x, y } = hoverPending;
        hoverPending = null;
        const pick = raycastAt(x, y);
        anatomy.isolate(pick && pick.kind !== 'armor' ? pick : null);
        host.renderer.domElement.style.cursor = pick ? 'pointer' : '';
      }
      if (badges.hidden) return;
      const width = host.renderer.domElement.clientWidth, height = host.renderer.domElement.clientHeight;
      for (const item of badgeItems) {
        if (item.element.classList.contains('is-off')) continue;
        scratch.copy(item.anchor.local).applyMatrix4(item.anchor.object.matrixWorld).project(host.camera);
        const visible = scratch.z > -1 && scratch.z < 1 && Math.abs(scratch.x) < 1.1 && Math.abs(scratch.y) < 1.1;
        item.element.style.visibility = visible ? '' : 'hidden';
        if (visible) {
          item.element.style.transform = `translate(${((scratch.x + 1) / 2 * width).toFixed(1)}px, ${((1 - scratch.y) / 2 * height).toFixed(1)}px)`;
        }
      }
    },
    pickAt(clientX, clientY) {
      if (!mode) return false;
      setSelected(raycastAt(clientX, clientY));
      return true;
    },
    hoverAt(clientX, clientY) { if (mode) hoverPending = { x: clientX, y: clientY }; },
    clearHover() {
      hoverPending = null;
      anatomy?.isolate(null);
      host.renderer.domElement.style.cursor = '';
    },
    select(key) { if (mode) setSelected(findPick(key)); },
    setToggle(toggle, value) {
      if (!mode) return;
      current()[toggle] = value;
      applyToggles();
      host.onToggle();
    },
    setMetric(next) {
      if (!ARMOR_METRICS.includes(next) || next === metric) return;
      metric = next;
      anatomy?.setMetric(metric);
      if (selected) host.onSelect(selected, anatomyReadout(selected, metric));
      renderBar();
      renderLegend();
      host.onToggle();
    },
    setStates(state) { anatomy?.setStates(state); },
    plateCenterWorld(name, target) {
      const center = anatomy?.plateCenter(name);
      if (!center) return false;
      target.copy(center.local).applyMatrix4(center.object.matrixWorld);
      return true;
    },
    state() {
      return {
        mode, metric, key: vehicle?.key || null,
        toggles: mode ? { ...current() } : null,
        selected: pickKey(selected),
        counts: anatomy ? {
          surfaces: anatomy.surfaces.length, parts: anatomy.parts.length, crew: anatomy.stations.length,
          ...anatomy.stats(),
        } : null,
      };
    },
    release() {
      view.hide();
      anatomy?.dispose();
      anatomy = null;
      vehicle = null;
      badgeItems.length = 0;
      badges.replaceChildren();
      visiblePickables = [];
    },
    dispose() {
      view.release();
      depth.dispose();
      ghost.dispose();
      bar.remove();
      badges.remove();
      style.remove();
    },
  };
  return view;
}
