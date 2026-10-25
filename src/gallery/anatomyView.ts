// Gallery anatomy view: the lazily loaded browser side of the Armor, Modules and Crew layers.
//
// gallery.ts imports this module through import() the first time an anatomy layer opens, so the Gallery's first load
// and the game's boot graph do not carry it. It mounts the anatomy scene (anatomyScene.ts) in the selected vehicle's
// combat frames, hides the exterior from the main pass and redraws it as a glass shell, and owns the layer toggles,
// the legend, the part badges (the keyboard path to every pick) and the inspection text.
import * as THREE from 'three';
import { t, formatNumber } from '../ui/i18n.ts';
import { uiIconSVG } from '../ui/uiIcons.ts';
import { ensureStyle } from '../ui/styleLayers.ts';
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

function drawsNoColour(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every((material) => !material || material.colorWrite === false || (material.transparent && material.opacity === 0));
}

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

/** The legend's glyphs: each system keys with its module glyph and each crew role with its seat (07-gallery .legend). */
const SYSTEM_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  mobility: 'engine', ammunition: 'ammoRack', fuel: 'fuelTank', firepower: 'gun', electronics: 'radio',
});
const ROLE_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  commander: 'crewCommander', gunner: 'crewGunner', loader: 'crewLoader', driver: 'crewDriver', radio: 'radio',
});
/** Callout geometry in px: the first leader, each deeper step, and the label box the separation pass keeps apart. */
const CALLOUT_LEADER_PX = 56;
const CALLOUT_STEP_PX = 22;
/** The clear space between two stacked callout plates (the --s3 step). */
const CALLOUT_GAP_PX = 12;
const CALLOUT_MIN_PX = 14;
const CALLOUT_WIDTH_PX = 150;
const CALLOUT_HEIGHT_PX = 28;

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

// The direction's own rules (07-gallery .subs, .legend, .co and its crew rings) on the kit and tokens; the chips and the
// metric switch are the kit's (.cot-c-chip, .cot-c-seg), which the Gallery page loads with components.css.
const STYLE = `
.subs{display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto}
.subs[hidden]{display:none}
.subs .cot-c-chip{height:28px;font-size:max(var(--fs-floor-11),var(--fs-12));background:var(--hud-plate)}
.subs .cot-c-seg{align-items:stretch;padding:2px;background:var(--hud-plate)}
/* the segments fill their frame when a touch row stretches it to the chips' height */
.subs .cot-c-seg__opt{height:auto;min-height:24px;padding:0 10px;font-size:max(var(--fs-floor-11),var(--fs-12))}
#viewport .legend.anatomy-legend{gap:6px}
#viewport .anatomy-legend .anatomy-ramp{display:grid;grid-template-columns:auto minmax(160px,260px);align-items:center;gap:8px}
/* a stacked stage is a third of the window's height: the ramp keeps to the size of a chip row so it stays off the model */
@media (width < 1100px){#viewport .anatomy-legend .anatomy-ramp{grid-template-columns:auto minmax(96px,140px)}}
#viewport .anatomy-legend .anatomy-ramp b{color:var(--ink-2);font:500 max(var(--fs-floor-11),var(--fs-12))/1 var(--font-body);white-space:nowrap}
#viewport .anatomy-legend .anatomy-ramp-bar{position:relative;height:8px;box-shadow:var(--ring-1)}
#viewport .anatomy-legend .anatomy-ramp-ticks{position:relative;height:12px;margin-top:4px}
#viewport .anatomy-legend .anatomy-ramp-ticks span{position:absolute;transform:translateX(-50%);color:var(--ink-3);font:500 max(var(--fs-floor-11),var(--fs-11))/1 var(--font-data);
  white-space:nowrap}
#viewport .anatomy-legend .anatomy-ramp-ticks span:first-child{transform:none}
#viewport .anatomy-legend .anatomy-ramp-ticks span:last-child{transform:translateX(-100%)}
/* the ramp names its two ends only: a middle figure ran into the last one on a narrow ramp */
#viewport .anatomy-legend .anatomy-ramp-ticks span:not(:first-child):not(:last-child){display:none}
#viewport .anatomy-legend .anatomy-key{display:flex;align-items:center;gap:8px;color:var(--ink-2);font:500 max(var(--fs-floor-11),var(--fs-12))/1 var(--font-body)}
#viewport .anatomy-legend .anatomy-key i{width:10px;height:10px;background:var(--key);box-shadow:var(--flag-ring)}
#viewport .anatomy-legend .anatomy-key svg{width:15px;height:15px;color:var(--key)}
.anatomy-badges{position:absolute;inset:0;z-index:var(--z-hud-world);pointer-events:none;overflow:hidden}
.anatomy-badges[hidden]{display:none}
.co,.co-crew{position:absolute;left:0;top:0;padding:0;border:0;pointer-events:auto;will-change:transform}
.co{display:flex;align-items:center;gap:7px;height:28px;padding:0 9px;border-radius:var(--r1);background:var(--hud-plate);box-shadow:var(--e1);
  color:var(--ink-1);font:600 max(var(--fs-floor-11),var(--fs-12))/1 var(--font-display);white-space:nowrap;translate:-50% calc(-100% - var(--co-len))}
.co svg{width:15px;height:15px;color:var(--co-tone)}
.co::before{content:'';position:absolute;left:50%;top:100%;width:1px;height:var(--co-len);background:var(--ink-3)}
.co::after{content:'';position:absolute;left:50%;top:calc(100% + var(--co-len));width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;
  background:var(--ink-1);box-shadow:var(--gallery-dot-ring)}
.co.co--down{translate:-50% var(--co-len)}
.co.co--down::before{top:auto;bottom:100%}
.co.co--down::after{top:auto;bottom:calc(100% + var(--co-len));margin:0 0 -5px -5px}
.co[aria-pressed="true"]{background:var(--gallery-callout-on);box-shadow:var(--ring-accent)}
.co[aria-pressed="true"]::after{background:var(--accent)}
.co-crew{display:grid;place-items:center;width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid var(--co-tone);border-radius:50%;
  background:var(--hud-plate);color:var(--co-tone);font:600 max(var(--fs-floor-11),var(--fs-11))/1 var(--font-data)}
.co-crew[aria-pressed="true"]{background:var(--accent);border-color:var(--accent-hi);color:var(--ink-on-accent)}
.co.is-off,.co-crew.is-off{display:none}
@media (pointer:coarse){.subs .cot-c-chip{height:40px}.co-crew{width:32px;height:32px;margin:-16px 0 0 -16px}}
@media (width < 768px){.subs .cot-c-chip{width:36px;padding:0;justify-content:center}.subs .cot-c-chip span{display:none}
  #viewport .anatomy-legend .anatomy-ramp{grid-column:1/-1;grid-template-columns:auto minmax(0,1fr);width:100%}
}
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
  /**
   * Build the vehicle's layer off screen and link its programs before it first draws (click-perf-248: the first
   * Armor/Modules/Crew press per tank compiled them in its first frame). Resolves once they are linked; a layer already
   * showing another vehicle state is rebuilt in place by show instead.
   */
  prepare(vehicle: AnatomyVehicle): Promise<void>;
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
  const style = ensureStyle('cot-gallery-anatomy-style', STYLE, 'surfaces');
  style.dataset.galleryAnatomy = '';
  const bar = document.createElement('div');
  bar.className = 'subs';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('gallery.anatomy.toolbarAria'));
  bar.hidden = true;
  host.console.insertBefore(bar, host.legend);
  const badges = document.createElement('div');
  badges.className = 'anatomy-badges';
  badges.dataset.tipOff = '';
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
  // `length` is the callout's leader in px as last written (0: not yet), so a frame only writes the ones that move
  // `width` is the plate's measured width (0 until it first shows), read once, never in a frame's layout
  const badgeItems: Array<{ element: HTMLButtonElement; anchor: AnatomyScene['anchors'][number]; kind: 'module' | 'crew'; length: number; width: number }> = [];
  // the stage's toolbar foot (the layer chips), read again only when the stage changes size: no label stands above it
  let toolbarFoot = 0, footFor = '';
  let toolsBox: { left: number; right: number; top: number } | null = null;
  // a label below its anchor that would sit on the turntable and photo buttons
  const crossesTools = (x: number, y: number, length: number, width: number): boolean => !!toolsBox
    && x + width / 2 > toolsBox.left && x - width / 2 < toolsBox.right && y + length + CALLOUT_HEIGHT_PX > toolsBox.top;
  const placed: Array<{ item: typeof badgeItems[number]; x: number; y: number; up: boolean; length: number }> = [];

  function hideExterior(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (object === anatomy?.frames.root || hidden.has(object)) return;
      // The glass shell is what the camera draws: shadow casters stay off both passes (243: the gun's convex shadow
      // proxy, mantlet and barrel in one hull, drew as a grey wedge over every barrel).
      if (!object.layers.test(host.camera.layers) || object.userData.shadowOnly) return;
      if (object instanceof THREE.Mesh) {
        hidden.set(object, { mask: object.layers.mask, visible: object.visible });
        // a mesh that paints nothing (depth-only stock, a fully transparent picker) would only draw as glass: it goes
        if (drawsNoColour(object)) object.visible = false;
        else object.layers.set(EXTERIOR_LAYER);
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

  /** The vehicle's anatomy scene, built once per vehicle state (its key) and kept off screen until a layer shows it. */
  function ensureScene(nextVehicle: AnatomyVehicle): void {
    if (anatomy && vehicle?.key === nextVehicle.key) return;
    const keep = pickKey(selected);
    anatomy?.dispose();
    restoreExterior();
    vehicle = nextVehicle;
    linked = null;
    anatomy = buildAnatomyScene(nextVehicle.armor, { caliberMm: nextVehicle.caliberMm, modern: nextVehicle.modern, metric });
    anatomy.frames.root.matrixAutoUpdate = false;
    anatomy.frames.root.visible = false;
    host.scene.add(anatomy.frames.root);
    buildBadges();
    selected = findPick(keep);
  }

  // The layer's programs, linked before it first draws: the anatomy's own materials, and the depth and glass overrides
  // as they draw over each exterior mesh (KHR_parallel_shader_compile where the GPU has it). Once per vehicle state.
  let linked: Promise<void> | null = null;
  function linkPrograms(exteriorRoot: THREE.Object3D): Promise<void> {
    if (!anatomy) return Promise.resolve();
    const { renderer, scene, camera } = host;
    const waits: Promise<unknown>[] = [renderer.compileAsync(anatomy.frames.root, camera, scene)];
    // the meshes hideExterior moves to the glass pass
    const exterior: Array<{ mesh: THREE.Mesh; material: THREE.Mesh['material'] }> = [];
    exteriorRoot.traverse((object) => {
      if (object instanceof THREE.Mesh && object.layers.test(camera.layers) && !object.userData.shadowOnly
        && !drawsNoColour(object)) exterior.push({ mesh: object, material: object.material });
    });
    // compile() reads each object's own material, never scene.overrideMaterial: the exterior wears each override for
    // one synchronous submission and has its paint back before anything draws. The passes draw on the exterior layer,
    // where no light is (lights gather by camera.layers in both render and compile), so they link with that mask.
    const mask = camera.layers.mask;
    camera.layers.set(EXTERIOR_LAYER);
    try {
      for (const override of [depth, ghost]) {
        for (const entry of exterior) entry.mesh.material = override;
        try {
          waits.push(renderer.compileAsync(exteriorRoot, camera, scene));
        } finally {
          for (const entry of exterior) entry.mesh.material = entry.material;
        }
      }
    } finally {
      camera.layers.mask = mask;
    }
    return Promise.all(waits).then(() => undefined, () => undefined);
  }

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
      seg.className = 'cot-c-seg';
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', t('gallery.anatomy.metricAria'));
      for (const value of ARMOR_METRICS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cot-c-seg__opt';
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', String(metric === value));
        button.tabIndex = metric === value ? 0 : -1;
        button.dataset.uiSound = 'select';
        button.dataset.anatomyMetric = value;
        button.dataset.tip = t(`gallery.anatomy.metricTitle.${value}`);
        button.textContent = t(`gallery.anatomy.metric.${value}`);
        seg.append(button);
      }
      items.push(seg);
    }
    for (const toggle of ANATOMY_CHIPS[mode]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cot-c-chip';
      button.dataset.anatomyToggle = toggle;
      button.dataset.uiSound = 'toggle';
      button.setAttribute('aria-pressed', String(view[toggle]));
      button.setAttribute('aria-label', t(`gallery.anatomy.toggle.${toggle}`));
      button.innerHTML = uiIconSVG(CHIP_ICONS[toggle], 15);
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
      if (icon) item.innerHTML = uiIconSVG(icon, 15); else item.append(document.createElement('i'));
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
      // the major ticks alone (the UI gauntlet: 650, 900 and 1,200+ printed into each other on a 260 px bar); the last
      // sits right-aligned at the bar's end, and a tick within 12 % of it would print into it
      const lastAt = armorRampPosition(ARMOR_RAMP_TICKS[ARMOR_RAMP_TICKS.length - 1]);
      for (const mm of ARMOR_RAMP_TICKS) {
        if (![0, 100, 300, 650, 1200].includes(mm)) continue;
        if (mm !== ARMOR_RAMP_TICKS[ARMOR_RAMP_TICKS.length - 1] && lastAt - armorRampPosition(mm) < 0.12) continue;
        const tick = document.createElement('span');
        tick.style.left = `${(armorRampPosition(mm) * 100).toFixed(1)}%`;
        tick.textContent = mm >= 1200 ? `${formatNumber(mm)}+` : formatNumber(mm);
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
        entries.push(key(t(`gallery.anatomy.system.${system}`), SYSTEM_COLORS[system], SYSTEM_GLYPHS[system]));
      }
      if (view.crew) {
        // The Crew layer keys its role colours (helmet bands and tinted figures), one key per role on board.
        const roles = [...new Set(anatomy?.stations.map((station) => station.role) || [])];
        for (const role of (['commander', 'gunner', 'loader', 'driver', 'radio'] as const).filter((entry) => roles.includes(entry))) {
          entries.push(key(t(`gallery.anatomy.role.${role}`), CREW_ROLE_COLORS[role], ROLE_GLYPHS[role]));
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
      element.dataset.anatomyPart = logical;
      element.setAttribute('aria-pressed', 'false');
      if (pick.kind === 'module') {
        // a module's callout (07-gallery .co): its system-tinted glyph and its name on a plate, on a leader off its anchor
        element.className = 'co';
        element.style.setProperty('--co-tone', SYSTEM_COLORS[pick.part.system]);
        element.innerHTML = uiIconSVG(/^track[LR]$/.test(pick.part.module) ? 'track' : pick.part.module, 15);
        element.append(moduleName(pick.part.module));
      } else {
        // a crew station: the direction's ring, in its role's colour round the role's letter
        element.className = 'co-crew';
        element.style.setProperty('--co-tone', CREW_ROLE_COLORS[pick.station.role]);
        // A second crew member in one role (assistant loader, second weapon operator) reads L2, G2.
        const count = (roleCount.get(pick.station.role) || 0) + 1;
        roleCount.set(pick.station.role, count);
        // the seat's mark in the page's language (zh: 长 炮 装 驾 通), the letter where a catalog has none
        const mark = t(`gallery.crew.mark.${pick.station.role}`);
        element.textContent = `${mark.startsWith('gallery.') ? CREW_ROLE_LETTERS[pick.station.role] : mark}${count > 1 ? count : ''}`;
        element.setAttribute('aria-label', crewName(pick.station.crew));
        element.title = crewName(pick.station.crew);
      }
      badges.append(element);
      badgeItems.push({ element, anchor, kind: pick.kind, length: 0, width: 0 });
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
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-anatomy-part]');
    if (!button) return;
    const pick = findPick(button.dataset.anatomyPart || null);
    setSelected(pickKey(selected) === button.dataset.anatomyPart ? null : pick);
  });
  badges.addEventListener('pointerover', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-anatomy-part]');
    anatomy?.isolate(button ? findPick(button.dataset.anatomyPart || null) : null);
  });
  badges.addEventListener('pointerout', () => anatomy?.isolate(null));
  badges.addEventListener('focusin', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-anatomy-part]');
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
    async prepare(nextVehicle) {
      if (mode && !(anatomy && vehicle?.key === nextVehicle.key)) return;
      ensureScene(nextVehicle);
      linked ??= linkPrograms(nextVehicle.root);
      await linked;
    },
    show(nextMode, nextVehicle) {
      ensureScene(nextVehicle);
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
      if (footFor !== `${width}x${height}`) {
        footFor = `${width}x${height}`;
        toolbarFoot = bar.offsetHeight ? bar.offsetTop + bar.offsetHeight + CALLOUT_GAP_PX : 0;
        const tools = host.viewport.querySelector<HTMLElement>('.tools');
        const box = tools?.offsetHeight ? tools.getBoundingClientRect() : null, canvas = host.renderer.domElement.getBoundingClientRect();
        toolsBox = box ? { left: box.left - canvas.left - CALLOUT_GAP_PX, right: box.right - canvas.left + CALLOUT_GAP_PX, top: box.top - canvas.top - CALLOUT_GAP_PX } : null;
        for (const item of badgeItems) item.width = 0;
      }
      placed.length = 0;
      let callout = 0;
      for (const item of badgeItems) {
        if (item.element.classList.contains('is-off')) continue;
        scratch.copy(item.anchor.local).applyMatrix4(item.anchor.object.matrixWorld).project(host.camera);
        const visible = scratch.z > -1 && scratch.z < 1 && Math.abs(scratch.x) < 1.1 && Math.abs(scratch.y) < 1.1;
        item.element.style.visibility = visible ? '' : 'hidden';
        if (!visible) continue;
        const x = (scratch.x + 1) / 2 * width, y = (1 - scratch.y) / 2 * height;
        item.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        if (item.kind !== 'module') continue;
        if (!item.width) item.width = item.element.offsetWidth;
        // the direction's leaders: alternate callouts above and below their anchors, three lengths deep; one that would
        // reach over the layer chips stands below its anchor instead
        let up = callout % 2 === 0;
        const length = CALLOUT_LEADER_PX + (callout % 3) * CALLOUT_STEP_PX;
        if (up && y - length - CALLOUT_HEIGHT_PX < toolbarFoot) up = false;
        if (!up && crossesTools(x, y, length, item.width) && y - length - CALLOUT_HEIGHT_PX >= toolbarFoot) up = true;
        placed.push({ item, x, y, up, length });
        callout++;
      }
      // and its greedy separation, top to bottom: a label that would overlap one placed above it moves down (a label above
      // its anchor shortens its leader, one below lengthens it); a label above that cannot shorten enough turns below its
      // anchor, so two plates never touch
      const labelY = (entry: typeof placed[number]): number => entry.y + (entry.up ? -1 : 1) * (entry.length + CALLOUT_HEIGHT_PX / 2);
      const clear = CALLOUT_HEIGHT_PX + CALLOUT_GAP_PX;
      placed.sort((a, b) => labelY(a) - labelY(b));
      for (let i = 0; i < placed.length; i++) {
        for (let j = 0; j < i; j++) {
          const dy = labelY(placed[i]) - labelY(placed[j]);
          const reach = placed[i].item.width && placed[j].item.width
            ? (placed[i].item.width + placed[j].item.width) / 2 + CALLOUT_GAP_PX : CALLOUT_WIDTH_PX;
          if (Math.abs(placed[i].x - placed[j].x) >= reach || dy >= clear) continue;
          const push = clear - dy;
          if (!placed[i].up) placed[i].length += push;
          else if (placed[i].length - push >= CALLOUT_MIN_PX) placed[i].length -= push;
          else {
            placed[i].up = false;
            placed[i].length = Math.max(CALLOUT_MIN_PX, labelY(placed[j]) + clear - placed[i].y - CALLOUT_HEIGHT_PX / 2);
          }
        }
        // a label pushed down onto the turntable and photo buttons stands above its anchor on the shortest leader, when
        // that spot is clear of the chips and of every label already placed
        if (!placed[i].up && crossesTools(placed[i].x, placed[i].y, placed[i].length, placed[i].item.width)) {
          const liftY = placed[i].y - CALLOUT_MIN_PX - CALLOUT_HEIGHT_PX / 2;
          let free = liftY - CALLOUT_HEIGHT_PX / 2 >= toolbarFoot;
          for (let j = 0; free && j < i; j++) {
            const reach = placed[i].item.width && placed[j].item.width
              ? (placed[i].item.width + placed[j].item.width) / 2 + CALLOUT_GAP_PX : CALLOUT_WIDTH_PX;
            if (Math.abs(placed[i].x - placed[j].x) < reach && Math.abs(liftY - labelY(placed[j])) < clear) free = false;
          }
          if (free) { placed[i].up = true; placed[i].length = CALLOUT_MIN_PX; }
        }
        const { item, up, length } = placed[i];
        const rounded = Math.round(length);
        if (rounded !== item.length) { item.length = rounded; item.element.style.setProperty('--co-len', `${rounded}px`); }
        item.element.classList.toggle('co--down', !up);
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
