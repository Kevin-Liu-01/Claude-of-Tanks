/**
 * Couch mode's split screen on the page (docs/COUCH-MODE.md phase 2). One pane per seated player, each with that
 * player's own camera and the normal battle HUD: the same HUD the solo battle shows (src/ui/hud.ts, its damage panel,
 * its minimap), one instance per pane, bound to the seat's tank, the seat's camera and the seat's spotting.
 *
 * Per pane:
 * - a camera rig (engine/cameraRig.ts, the solo camera) following the seat's tank, driven by its phone as the mouse and
 *   wheel drive the solo camera: the aim pad turns it, the scope tap toggles the gunner's sight, the zoom taps step it;
 *   the rig's sight lays the seat's gun (CouchSeatControls.layAim) as the solo camera lays the player's;
 * - an aim controller (game/aimController.ts) and a HUD frame runtime (game/battleHudFrameRuntime.ts) over a view of the
 *   battle whose player is the seat's tank: the per-view context (`viewGame`), so the HUD's player, camera and spotting
 *   are the seat's and nothing of the page's player leaks into it;
 * - a HUD mounted in its own document (an iframe laid over the pane, hud.ts HudView), so the HUD's bands, media
 *   queries and body flags are the pane's, at the solo HUD's own pixel size (never scaled: "dont squish the uis"), its
 *   parts given up from the end of one priority list while the pane cannot hold them (game/couchPanes.ts couchHudFitStep);
 * - a draw through the one post chain into the pane's rectangle of the one canvas (post.ts renderViews), with the
 *   pane's visibility: an enemy the seat's side has not spotted is hidden for that pane's draw only, and the seat's own
 *   tank is hidden only in its own gunner's sight.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig, type CameraRig, type CameraRigDeps } from '../engine/cameraRig.ts';
import { createAimController, type AimController, type AimControllerDependencies } from '../game/aimController.ts';
import { createBattleHudFrameRuntime, type BattleHudFrameRuntime } from '../game/battleHudFrameRuntime.ts';
import type { ShellCard } from '../game/playerBattleActions.ts';
import type { CouchCameraIntent, CouchSeatControls } from '../game/couchSeats.ts';
import {
  couchHudFitStep, couchPaneLayout,
  type CouchHudPart, type CouchHudPartBox, type CouchPaneLayout, type CouchPaneRect,
} from '../game/couchPanes.ts';
import { encodeAimIntent } from '../sim/aimIntent.ts';
import { shellAmmunitionCapacity } from '../sim/ammunition.ts';
import { rulesetUnlimitedFor } from '../sim/matchRuleset.ts';
import { ensureStyle } from '../ui/styleLayers.ts';
import type { EventBus } from '../game/stateCore.ts';
import type { PostView } from '../engine/post.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { battleBands, setBattleSightShift } from '../ui/battleSight.ts';
import { chaseStartPitch } from '../engine/chaseStart.ts';

type HudFrameOptions = Parameters<typeof createBattleHudFrameRuntime>[0];
type HudGame = HudFrameOptions['game'];
type HudEntity = HudGame['tanks'][number];
type HudModule = typeof import('../ui/hud.ts');
type DamagePanelModule = typeof import('../ui/damagePanel.ts');
type PaneHud = ReturnType<HudModule['initHud']>;
type PaneDamagePanel = ReturnType<DamagePanelModule['createDamagePanel']>;

/** A seat's tank as the panes read it (the HUD's tank, the camera's and the aim's). */
export type PaneEntity = HudEntity & {
  state: { pos: { x: number; y: number; z: number } } | null;
  input?: { aimPoint?: Vector3 | null };
  spec: HudEntity['spec'] & { gun: { shells: ReadonlyArray<PaneShellSpec> } };
};

interface PaneShellSpec {
  name: string;
  type: string;
  guided?: boolean;
  dmg: number;
  pen100Mm: number;
}

export interface CouchPaneSeat {
  seat: number;
  entity: PaneEntity;
}

export interface CouchPaneViewPorts {
  /** The page's battle (its tanks, spotting, clock and mode state): each pane reads it through a view of its own. */
  game: HudGame;
  /** The camera the post chain draws with: each pane's camera is copied onto it for that pane's draw. */
  camera: PerspectiveCamera;
  /** The canvas the panes divide (its parent hosts the panes' HUD documents). */
  canvas(): HTMLCanvasElement;
  post: { renderViews(dt: number, wallDt: number, views: readonly PostView[], beforeView: (index: number) => void): void };
  rig: Pick<CameraRigDeps, 'heightField' | 'raycast' | 'getCameraSettings'>;
  aim: Pick<AimControllerDependencies, 'worldRaycast' | 'computeDispersion'>;
  input: HudFrameOptions['input'];
  bus: EventBus;
  /** The HUD's modules (the battle HUD's chunk, already loaded by the battle). */
  loadHud(): Promise<{ hud: HudModule; damagePanel: DamagePanelModule }>;
  /** The battle's minimap (the page HUD's plate and the height field it was built on), once built. */
  minimap(): { heightField: Parameters<PaneHud['buildMinimapFromAsset']>[0]; src: string } | null;
  /** A seat's controls (its phone's), or null with no phone. */
  controls(seat: number): CouchSeatControls | null;
  /** The terrain's detail for the other panes' cameras besides seat 1's (map.ts setTerrainDetailFoci); null lets go. */
  detailFoci?(points: readonly { readonly x: number; readonly z: number }[] | null): void;
}

/** The page's player's events, which name no tank: a pane's HUD never hears them (each seat's phone acts for its tank). */
const PAGE_PLAYER_EVENTS = new Set([
  'ui:shellSelect', 'ui:shellSelectionChanged', 'ui:specialActionResult', 'ui:ammoSelectionDenied',
  'ui:specialActionDenied', 'ui:magazineReloadStarted', 'ui:magazineReloadDenied', 'ui:consumableUsed',
  'ui:consumableDenied', 'ui:armorOverlayState', 'ui:autoAimState', 'ui:minimapZoom', 'player:spotted',
  'spectate:begin', 'spectate:change', 'spectate:end', 'killcam:begin',
]);

/** The phone's aim units (padDesk.ts PAD_AIM_GAIN applied) in the solo camera's mouse pixels: the drag that turned a
 *  phase-1 seat's gun by 0.0035 rad a unit turns the pane's camera as far (engine/cameraRig.ts BASE_SENS 0.0022). */
const AIM_UNIT_PX = 0.0035 / 0.0022;

/** The HUD's panels each COUCH_HUD_PRIORITY entry names (the selectors a pane gives up; the sight, the hit layer and the
 *  messages are overlays the fit does not measure). */
const PART_SELECTORS: Readonly<Partial<Record<CouchHudPart, string>>> = {
  health: '.cot-dp',
  // (the slots and the consumables, not the tray: the tray holds both, and the consumables go before the ammunition)
  ammunition: '.cot-shell',
  speed: '.cot-drive',
  hits: '.cot-dmglayer',
  objective: '.cot-top .sc,.cot-top .tm-block,.cot-mode-status',
  messages: '.cot-killfeed,.cot-alert,.cot-si-toasthost',
  furniture: '.cot-vehicle-controls,.cot-net,.cot-hints',
  consumables: '.cot-con',
  minimap: '.cot-minimap',
  rosters: '.cot-ear,.cot-pips',
};
/** The parts whose panels the fit measures (the rest are overlays over the whole pane). */
const MEASURED_PARTS: readonly CouchHudPart[] = ['health', 'ammunition', 'speed', 'objective', 'furniture', 'consumables', 'minimap', 'rosters'];
/** Frames the HUD's own planner takes to lay out again after a part goes (its relayouts run on animation frames). */
const FIT_SETTLE_FRAMES = 4;
/** A fitted pane is measured again this often (a part that appeared later, a mode's tab). */
const FIT_RECHECK_FRAMES = 120;
/** The minimap's solo size before its zoom step (hud.ts .cot-minimap: 220 px x --mm-k). */
const MINIMAP_SOLO_PX = 220;

/** The panes' host over the canvas and the page HUD standing down (the page's document). */
const PANES_CSS = '.cot-couch-panes{position:fixed;inset:0;pointer-events:none;z-index:var(--z-hud-score)}'
  + '.cot-couch-pane-hud{position:absolute;border:0;margin:0;padding:0;background:transparent;transform-origin:0 0;'
  + 'pointer-events:none;color-scheme:normal}'
  + '.cot-couch-spare{position:absolute;background:var(--surface-scene)}'
  + 'body.cot-couch-split .cot-hud{visibility:hidden}';
/** A pane's own ground: the canvas shows through its document (the overrides layer outranks the page's html and body). */
const PANE_GROUND_CSS = 'html,body{background:transparent;margin:0;overflow:hidden}';

/** Classes of the page's body a pane's document never copies: they are each view's own. */
const VIEW_OWN_BODY_CLASSES = new Set(['cot-spectating', 'cot-gun-dry', 'cot-hud-aerial', 'cot-couch-split']);

interface PaneView {
  seat: number;
  entity: PaneEntity;
  camera: PerspectiveCamera;
  rig: CameraRig;
  aim: AimController;
  hudFrame: BattleHudFrameRuntime;
  frame: HTMLIFrameElement;
  doc: Document;
  hud: PaneHud | null;
  damagePanel: PaneDamagePanel | null;
  cards: ShellCard[];
  cardShells: unknown;
  minimapSrc: string | null;
  /** The fit: the parts given up, frames until the planner has laid out again, whether the pane holds what it shows, and
   *  whether its core fits at all (false: the core alone overlaps or leaves the pane). */
  dropped: Set<CouchHudPart>;
  /** The fit's last measure and the parts its last step found in a clash (receipts read them). */
  lastBoxes: CouchHudPartBox[];
  lastClash: readonly CouchHudPart[];
  /** Every clash the fit found since this size began (receipts read it: what a pane gave up, and why). */
  clashLog: string[];
  fitWait: number;
  fitted: boolean;
  coreFits: boolean;
  /** The hulls this pane's last draw showed (ids, receipts read them). */
  drawn: string[];
  dispose(): void;
}

/** What a receipt reads of one pane. */
interface CouchPaneProbe {
  seat: number;
  entityId: string;
  team: string;
  rect: CouchPaneRect;
  doc: Document;
  hud: PaneHud | null;
  camera: PerspectiveCamera;
  rigMode: string;
  /** The HUD parts this pane gave up to fit (from the end of the priority list), whether it fits, whether its core does. */
  dropped: readonly CouchHudPart[];
  fitted: boolean;
  coreFits: boolean;
  /** The fit's last measure of the parts' panels, and the parts its last clash named. */
  boxes: readonly CouchHudPartBox[];
  clash: readonly CouchHudPart[];
  clashLog: readonly string[];
  drawn: readonly string[];
  /** The pane's HUD frame's spotting read (the minimap's and the markers'): its seat as the receiver. */
  hudSpotted(id: string): boolean;
  /** The seat's HUD shows GUN TRAVEL LIMIT (the gun held at its limit past the label's dwell). */
  atGunLimit: boolean;
}

export interface CouchPaneViews {
  /** The panes in seat order (receipts read them). */
  readonly panes: readonly CouchPaneProbe[];
  /** Every pane's camera but seat 1's (seat 1's is the page's camera): the world's detail is every pane's. */
  extraViews(): readonly PerspectiveCamera[];
  /** The last frame's split-screen work on the main thread, ms: every pane's HUD frame, and every pane's draw. */
  readonly timing: { readonly hudMs: number; readonly drawMs: number };
  readonly layout: CouchPaneLayout | null;
  /** This battle's seats: a pane each (a new battle's seats replace the last's panes). */
  seat(seats: readonly CouchPaneSeat[]): void;
  /** The frame's camera work, before the world updates: every pane's rig, and the page's camera at seat 1's pane. */
  frame(dtSeconds: number): void;
  /** The frame's draw: every pane's HUD frame, then every pane through the post chain. */
  render(dtSeconds: number, wallDtSeconds: number): void;
  /**
   * The seat the room hears (docs/COUCH-MODE.md "Panes' HUD and sound"): one mix, the solo mix of the most recent
   * shooter among the seats, held LISTENER_HOLD_S after its shot so a burst of fire does not swing the room's sound
   * between seats; seat 1 before anyone fires. Its pane camera's facing is the mix's.
   */
  listenerFocus(): { readonly entity: PaneEntity; readonly forward: Vector3 } | null;
  /** Take the panes down (the battle ended, the split screen was let go). */
  dispose(): void;
}

/** How long the room's mix stays with a seat after its shot before another seat's shot may take it. */
const LISTENER_HOLD_S = 1.5;

const _origin = new Vector3();

/** Build a seat's shell cards (playerBattleActions.ts's, for a tank that is not the page's player). */
function syncCards(view: PaneView, game: HudGame): void {
  const shells = view.entity.spec.gun.shells;
  const combat = view.entity.combat as { ammo?: readonly number[] } | null | undefined;
  const unlimited = rulesetUnlimitedFor(game.ruleset as Parameters<typeof rulesetUnlimitedFor>[0], view.entity as never);
  if (view.cardShells !== shells) {
    view.cardShells = shells;
    view.cards.length = 0;
    for (const shell of shells) {
      view.cards.push({ name: shell.name, type: shell.guided ? 'ATGM' : shell.type, dmg: shell.dmg,
        penLabel: `${Math.round(shell.pen100Mm)} mm`, count: shellAmmunitionCapacity(shell as never) });
    }
  }
  for (let slot = 0; slot < view.cards.length; slot++) {
    view.cards[slot].count = Math.max(0, Math.floor(combat?.ammo?.[slot] || 0));
    if (unlimited) view.cards[slot].unlimited = true;
    else if (view.cards[slot].unlimited) delete view.cards[slot].unlimited;
  }
}

/** A seat's bus: the battle's events less the page's player's, and nothing the pane's HUD says reaches the page. */
function seatBus(bus: EventBus): EventBus {
  return {
    on: (event, listener) => (PAGE_PLAYER_EVENTS.has(event) ? () => {} : bus.on(event, listener)),
    off: (event, listener) => bus.off(event, listener),
    emit: () => {},
  };
}

/** A pane's own document: an iframe over the pane, carrying the page's style sheets, laid out at the HUD's layout size. */
function createPaneDocument(host: HTMLElement): { frame: HTMLIFrameElement; doc: Document; dispose(): void } {
  const frame = document.createElement('iframe');
  frame.className = 'cot-couch-pane-hud';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  host.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  doc.close();
  // the page's language, theme and flags (less the view's own), then its style sheets, kept in step as the page adds more
  for (const { name, value } of Array.from(document.documentElement.attributes)) {
    if (name !== 'style' && name !== 'data-cot-scoped' && name !== 'data-flight' && name !== 'data-watch') {
      doc.documentElement.setAttribute(name, value);
    }
  }
  for (const name of Array.from(document.body.classList)) if (!VIEW_OWN_BODY_CLASSES.has(name)) doc.body.classList.add(name);
  const copy = (node: Node): void => {
    if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === 'stylesheet')) {
      doc.head.appendChild(node.cloneNode(true));
    }
  };
  for (const node of Array.from(document.head.children)) copy(node);
  ensureStyle('cot-couch-pane-ground', PANE_GROUND_CSS, 'overrides', doc);
  const mirror = new MutationObserver((records) => {
    for (const record of records) for (const node of Array.from(record.addedNodes)) copy(node);
  });
  mirror.observe(document.head, { childList: true });
  // the solo HUD's sizes (Kevin, 2026-11-11: "dont squish the uis"): the pane's document takes the page's own bands,
  // never a narrow window's, and the layout keeps the solo tray (battleHudLayout.ts data-couch-pane); its places still
  // anchor to the pane's own edges (syncPaneViewport)
  doc.body.setAttribute('data-couch-pane', '');
  return {
    frame,
    doc,
    dispose() {
      mirror.disconnect();
      frame.remove();
    },
  };
}

/** The page's responsive bands, copied onto a pane's body (the solo HUD's sizes), and the pane's own viewport size. */
const BAND_KEYS = ['cotWidth', 'cotHeight', 'cotWidthDensity', 'cotHeightDensity', 'cotOrientation', 'cotInput', 'cotPanels', 'cotViewport'] as const;
function syncPaneViewport(view: PaneView, rect: CouchPaneRect): void {
  const body = view.doc.body;
  for (const key of BAND_KEYS) {
    const value = document.body.dataset[key];
    if (value === undefined) delete body.dataset[key];
    else if (body.dataset[key] !== value) body.dataset[key] = value;
  }
  const root = view.doc.documentElement.style;
  root.setProperty('--cot-viewport-width', `${rect.width}px`);
  root.setProperty('--cot-viewport-height', `${rect.height}px`);
  root.setProperty('--cot-ui-scale', document.documentElement.style.getPropertyValue('--cot-ui-scale') || '1');
  view.doc.defaultView?.dispatchEvent(new Event('cot:layoutchange'));
}

/** The parts a pane gave up, hidden in its own document (the overrides layer outranks the HUD's own layout rules). */
function applyDropped(view: PaneView): void {
  for (const sheet of Array.from(view.doc.querySelectorAll('style[id^="cot-couch-fit-"]'))) sheet.remove();
  const hidden = [...view.dropped].map((part) => PART_SELECTORS[part]).filter(Boolean);
  if (hidden.length) ensureStyle(`cot-couch-fit-${[...view.dropped].join('-')}`, `${hidden.join(',')}{display:none}`, 'overrides', view.doc);
}

/** The measured parts' panels in a pane's document (each part's shown elements' union box). */
function measureParts(doc: Document): CouchHudPartBox[] {
  const boxes: CouchHudPartBox[] = [];
  const win = doc.defaultView;
  for (const part of MEASURED_PARTS) {
    // one box per panel: a part's panels in different corners (the systems row and the network chip) are not one box
    for (const element of Array.from(doc.querySelectorAll<HTMLElement>(PART_SELECTORS[part] ?? ''))) {
      if (!element.getClientRects().length) continue;
      const style = win?.getComputedStyle(element);
      if (style && (style.visibility === 'hidden' || Number(style.opacity) === 0)) continue;
      const box = element.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      let squeezed = false;
      if (part === 'minimap' && style) {
        const k = parseFloat(style.getPropertyValue('--mm-k')) || 1;
        squeezed = box.width < MINIMAP_SOLO_PX * k - 2;
      }
      boxes.push({ part, x0: box.left, y0: box.top, x1: box.right, y1: box.bottom, squeezed });
    }
  }
  return boxes;
}

/** One frame of a pane's fit: measure once the planner has settled, give up the next part while it does not fit. */
function fitPane(view: PaneView, rect: CouchPaneRect): void {
  if (!view.hud) return;
  if (view.fitWait > 0) { view.fitWait--; return; }
  view.lastBoxes = measureParts(view.doc);
  const pairs: string[] = [];
  const step = couchHudFitStep(view.lastBoxes, rect.width, rect.height, view.dropped, pairs);
  if (step.drop) view.clashLog.push(`${pairs.join(' ')} -> ${step.drop}`);
  view.coreFits = step.coreFits;
  if (step.clashing.length) view.lastClash = step.clashing;
  view.fitted = step.fits;
  if (step.drop) {
    view.dropped.add(step.drop);
    applyDropped(view);
    view.fitWait = FIT_SETTLE_FRAMES;
  } else {
    view.fitWait = FIT_RECHECK_FRAMES;
  }
}

export function createCouchPaneViews(ports: CouchPaneViewPorts): CouchPaneViews {
  const views: PaneView[] = [];
  let layout: CouchPaneLayout | null = null;
  let layoutKey = '';
  let host: HTMLDivElement | null = null;
  let spareEls: HTMLDivElement[] = [];
  const intent: CouchCameraIntent = { aimDx: 0, aimDy: 0, sniperToggles: 0, zoom: 0 };
  const camInput = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };
  const baseVisible: boolean[] = [];
  let hudModules: { hud: HudModule; damagePanel: DamagePanelModule } | null = null;
  let generation = 0;
  /** The room's mix: the seat it hears and when that seat last fired (performance.now ms). */
  let heard: PaneView | null = null;
  let heardShotMs = -Infinity;
  const listenerForward = new Vector3();
  const detailFoci: { x: number; z: number }[] = [];
  const timing = { hudMs: 0, drawMs: 0 };
  const extra: PerspectiveCamera[] = [];
  const listener = { entity: null as unknown as PaneEntity, forward: listenerForward };
  ports.bus.on('shell:fired', (payload) => {
    const shooter = payload && typeof payload === 'object' ? Reflect.get(payload, 'shooterId') : null;
    const view = views.find((candidate) => candidate.entity.id === shooter);
    if (!view) return;
    const now = performance.now();
    if (view !== heard && now - heardShotMs < LISTENER_HOLD_S * 1000) return;
    heard = view;
    heardShotMs = now;
  });

  const ensureHost = (): HTMLDivElement => {
    if (host?.isConnected) return host;
    // the panes' HUD documents over the canvas (input passes through to nothing: the phones are the controllers); the
    // page's own battle HUD stands down while the split screen shows (the page's end screen is not under it)
    ensureStyle('cot-couch-panes-style', PANES_CSS, 'surfaces');
    host = document.createElement('div');
    host.className = 'cot-couch-panes';
    const parent = ports.canvas().parentElement ?? document.body;
    parent.appendChild(host);
    document.body.classList.add('cot-couch-split');
    return host;
  };

  const placePanes = (): void => {
    const canvas = ports.canvas();
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const key = `${views.length}:${width}x${height}`;
    if (key === layoutKey && layout) return;
    layoutKey = key;
    layout = couchPaneLayout(views.length, width, height);
    const box = ensureHost();
    views.forEach((view, index) => {
      const rect = layout!.panes[index];
      // the solo HUD's own pixel size: the pane's document is the pane's size, never scaled
      const style = view.frame.style;
      style.left = `${rect.x}px`;
      style.top = `${rect.y}px`;
      style.width = `${rect.width}px`;
      style.height = `${rect.height}px`;
      syncPaneViewport(view, rect);
      // a new size fits again from the whole HUD
      view.dropped.clear();
      view.clashLog.length = 0;
      applyDropped(view);
      view.fitWait = FIT_SETTLE_FRAMES;
      view.fitted = false;
      view.coreFits = true;
      view.camera.aspect = rect.width / Math.max(1, rect.height);
      view.camera.updateProjectionMatrix();
    });
    for (const spare of spareEls) spare.remove();
    spareEls = layout.spares.map((rect) => {
      const spare = document.createElement('div');
      spare.className = 'cot-couch-spare';
      Object.assign(spare.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      box.appendChild(spare);
      return spare;
    });
  };

  const disposeViews = (): void => {
    heard = null;
    heardShotMs = -Infinity;
    for (const view of views) view.dispose();
    views.length = 0;
    for (const spare of spareEls) spare.remove();
    spareEls = [];
    layout = null;
    layoutKey = '';
  };

  const mountHud = (view: PaneView, modules: { hud: HudModule; damagePanel: DamagePanelModule }): void => {
    const hud = modules.hud.initHud(seatBus(ports.bus), { mount: view.doc.body });
    const damagePanel = modules.damagePanel.createDamagePanel({ telemetry: null });
    hud.setDamagePanel(damagePanel);
    hud.shotInfo.setPlayer(view.entity.id);
    const visual = (view.entity as { visual?: RuntimeValue }).visual;
    damagePanel.setTank(view.entity.spec as never, (visual ?? null) as never);
    hud.setMode('battle');
    view.hud = hud;
    view.damagePanel = damagePanel;
  };

  const createView = (seat: CouchPaneSeat): PaneView => {
    const { entity } = seat;
    const main = ports.camera;
    const camera = new PerspectiveCamera(main.fov, main.aspect, main.near, main.far);
    camera.position.copy(main.position);
    camera.quaternion.copy(main.quaternion);
    // the per-view context: the battle as this seat's view reads it, its player the seat's tank (every other field is
    // the page's battle, read live through the prototype)
    const viewGame = Object.create(ports.game, {
      player: { get: () => entity, enumerable: true },
    }) as HudGame;
    const view = {} as PaneView;
    const spotting = (): HudGame['spotting'] => ports.game.spotting;
    const aim = createAimController({
      getGame: () => viewGame as never,
      getRig: () => view.rig,
      worldRaycast: ports.aim.worldRaycast,
      targetVisible: (target) => {
        const spot = spotting();
        return !spot || spot.isSpotted(target.id, entity.team, entity as never);
      },
      getShellCards: () => view.cards,
      computeDispersion: ports.aim.computeDispersion,
    });
    const rig = createCameraRig(camera, {
      heightField: ports.rig.heightField,
      raycast: ports.rig.raycast,
      aimRaycast: aim.raycast,
      getPlayer: () => (entity.state ? entity as never : null),
      getCameraSettings: ports.rig.getCameraSettings,
      // the solo chase framing, solved on this pane's own HUD bands and raising this pane's own sight (battleSight.ts)
      getChaseBands: () => battleBands(view.doc),
      publishSightShift: (px) => setBattleSightShift(px, view.doc),
    });
    const hudFrame = createBattleHudFrameRuntime({
      game: viewGame,
      camera,
      rig,
      input: ports.input,
      aimController: aim,
      armorAimOverlay: { update() {}, hide() {} } as never,
      killcam: { isActive: () => false, spectate: { active: false, targetId: null } },
      muzzleScratch: new Vector3(),
      getHud: () => view.hud,
      getDamagePanel: () => view.damagePanel,
    });
    const paneDoc = createPaneDocument(ensureHost());
    Object.assign(view, {
      seat: seat.seat, entity, camera, rig, aim, hudFrame, frame: paneDoc.frame, doc: paneDoc.doc,
      hud: null, damagePanel: null, cards: [], cardShells: null, minimapSrc: null, drawn: [],
      dropped: new Set<CouchHudPart>(), lastBoxes: [], lastClash: [], clashLog: [], fitWait: FIT_SETTLE_FRAMES, fitted: false, coreFits: true,
      dispose() {
        view.hud?.setMode('hidden');
        view.damagePanel?.clear();
        rig.release();
        paneDoc.dispose();
      },
    } satisfies PaneView);
    // a new battle's camera starts behind its own tank, along its gun
    // (the hull's attitude: sim/movement.ts _spring, positive nose up)
    const pose = entity.state as { yaw?: number; turretYaw?: number; _spring?: { pitch?: number } } | null;
    rig.snapArcade(2, (pose?.yaw ?? 0) + (pose?.turretYaw ?? 0),
      chaseStartPitch(pose?._spring?.pitch, (entity.spec as { gunDepressionDeg?: number }).gunDepressionDeg));
    return view;
  };

  const api: CouchPaneViews = {
    get panes() {
      return views.map((view, index): CouchPaneProbe => ({
        seat: view.seat, entityId: view.entity.id, team: view.entity.team,
        rect: layout?.panes[index] ?? { x: 0, y: 0, width: 0, height: 0 },
        doc: view.doc, hud: view.hud, camera: view.camera, rigMode: view.rig.mode, drawn: view.drawn,
        dropped: [...view.dropped], fitted: view.fitted, coreFits: view.coreFits, boxes: view.lastBoxes, clash: view.lastClash, clashLog: view.clashLog,
        hudSpotted: (id) => view.hudFrame.frameInfo.spotting?.isSpotted(id) ?? true,
        atGunLimit: !!view.hudFrame.frameInfo.aim.gunLimitSpec,
      }));
    },
    get layout() { return layout; },
    get timing() { return timing; },
    extraViews() {
      extra.length = Math.max(0, views.length - 1);
      for (let i = 1; i < views.length; i++) extra[i - 1] = views[i].camera;
      return extra;
    },
    seat(seats) {
      disposeViews();
      const mine = ++generation;
      for (const seat of seats) views.push(createView(seat));
      placePanes();
      const mount = (modules: { hud: HudModule; damagePanel: DamagePanelModule }): void => {
        if (mine !== generation) return;
        for (const view of views) if (!view.hud) mountHud(view, modules);
      };
      if (hudModules) mount(hudModules);
      else void ports.loadHud().then((modules) => { hudModules = modules; mount(modules); },
        (error) => console.error('[couch] the panes\' HUD did not load', error));
    },
    frame(dt) {
      if (!views.length) return;
      placePanes();
      // the battle's verdict and report are the page's (one for the room): the panes' HUDs stand down under them
      const over = (ports.game as { result?: unknown }).result != null;
      if (host && host.hidden !== over) {
        host.hidden = over;
        // the page's HUD carries the verdict (its ending plate): it comes back for the report
        document.body.classList.toggle('cot-couch-split', !over);
      }
      for (const view of views) {
        const controls = ports.controls(view.seat);
        if (controls) controls.drainCamera(intent);
        else { intent.aimDx = 0; intent.aimDy = 0; intent.sniperToggles = 0; intent.zoom = 0; }
        if (intent.sniperToggles % 2 === 1 && !view.entity.combat?.destroyed) {
          if (view.rig.mode === 'ARCADE') view.rig.enterSniper();
          else view.rig.exitSniper(true);
        }
        fitPane(view, layout!.panes[views.indexOf(view)]);
        camInput.mouseDX = intent.aimDx * AIM_UNIT_PX;
        camInput.mouseDY = intent.aimDy * AIM_UNIT_PX;
        camInput.wheel = intent.zoom;
        view.rig.update(dt, camInput);
        // the pane's sight lays the seat's gun, as the solo camera lays the player's
        const pos = view.entity.state?.pos;
        if (controls && pos) {
          _origin.set(pos.x, pos.y, pos.z);
          const laid = encodeAimIntent(_origin, view.rig.aimPoint);
          controls.layAim(laid.aimYaw, laid.aimPitch, laid.aimDistance);
        }
      }
      // the terrain's chunk detail is every pane's (its nearest camera); the world's other one-camera systems (vehicle
      // detail, the near trees, the grass ring, the shadow cascades) follow seat 1's pane, the page's camera
      detailFoci.length = views.length - 1;
      for (let i = 1; i < views.length; i++) {
        const at = detailFoci[i - 1] ??= { x: 0, z: 0 };
        at.x = views[i].camera.position.x;
        at.z = views[i].camera.position.z;
      }
      ports.detailFoci?.(detailFoci);
      copyCamera(views[0].camera, ports.camera);
    },
    render(dt, wallDt) {
      if (!views.length || !layout) return;
      const hudStart = performance.now();
      const inBattle = ports.game.phase === 'battle';
      for (const view of views) {
        syncCards(view, ports.game);
        if (view.hud) {
          if (!view.minimapSrc) {
            const minimap = ports.minimap();
            if (minimap) {
              view.minimapSrc = minimap.src;
              void view.hud.buildMinimapFromAsset(minimap.heightField, minimap.src);
            }
          }
          view.hudFrame.update(inBattle, false);
        }
      }
      const drawStart = performance.now();
      timing.hudMs = drawStart - hudStart;
      const tanks = ports.game.tanks;
      baseVisible.length = tanks.length;
      for (let i = 0; i < tanks.length; i++) {
        const root = (tanks[i].visual as { root?: { visible: boolean } } | null | undefined)?.root;
        baseVisible[i] = !!root?.visible;
      }
      try {
        ports.post.renderViews(dt, wallDt, layout.panes, (index) => {
          const view = views[index];
          copyCamera(view.camera, ports.camera);
          applyPaneVisibility(view, tanks, baseVisible, views, ports.game);
          view.drawn.length = 0;
          for (const tank of tanks) {
            if ((tank.visual as { root?: { visible: boolean } } | null | undefined)?.root?.visible) view.drawn.push(tank.id);
          }
        });
      } finally {
        for (let i = 0; i < tanks.length; i++) {
          const root = (tanks[i].visual as { root?: { visible: boolean } } | null | undefined)?.root;
          if (root) root.visible = baseVisible[i];
        }
        copyCamera(views[0].camera, ports.camera);
        timing.drawMs = performance.now() - drawStart;
      }
    },
    listenerFocus() {
      const view = heard && views.includes(heard) ? heard : views[0];
      if (!view) return null;
      listener.entity = view.entity;
      view.camera.getWorldDirection(listenerForward);
      return listener;
    },
    dispose() {
      generation++;
      disposeViews();
      ports.detailFoci?.(null);
      host?.remove();
      host = null;
      document.body.classList.remove('cot-couch-split');
      // the page's camera takes the whole canvas's shape again
      const canvas = ports.canvas();
      const camera = ports.camera;
      camera.aspect = (canvas.clientWidth || window.innerWidth) / Math.max(1, canvas.clientHeight || window.innerHeight);
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
  };
  return api;
}

/** One pane's visibility (docs/COUCH-MODE.md "Drawing several views"): its seat's own tank hides only in its own gunner's
 *  sight; an enemy of the seat's side is drawn only while that side has it spotted (the seat as the receiver, the solo
 *  rule with this seat as the player); every other hull as the presentation left it. */
function applyPaneVisibility(view: PaneView, tanks: HudGame['tanks'], base: readonly boolean[], all: readonly PaneView[],
  game: HudGame): void {
  const seatTeam = view.entity.team;
  const spotting = game.spotting;
  for (let i = 0; i < tanks.length; i++) {
    const tank = tanks[i];
    const root = (tank.visual as { root?: { visible: boolean } } | null | undefined)?.root;
    if (!root) continue;
    if (tank === view.entity) { root.visible = view.rig.mode !== 'SNIPER'; continue; }
    const seated = all.some((other) => other.entity === tank);
    if (tank.team !== seatTeam && spotting && !tank.combat?.destroyed) {
      root.visible = (seated || base[i]) && spotting.isSpotted(tank.id, seatTeam, view.entity as never);
      continue;
    }
    root.visible = seated ? true : base[i];
  }
}

function copyCamera(from: PerspectiveCamera, to: PerspectiveCamera): void {
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
  to.fov = from.fov;
  to.aspect = from.aspect;
  to.near = from.near;
  to.far = from.far;
  to.zoom = from.zoom;
  if (from.view) to.setViewOffset(from.view.fullWidth, from.view.fullHeight, from.view.offsetX, from.view.offsetY,
    from.view.width, from.view.height);
  else if (to.view) to.clearViewOffset();
  Object.assign(to.userData, from.userData);
  to.updateProjectionMatrix();
  to.updateMatrixWorld(true);
}
