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
 *   queries and body flags are the pane's, drawn at the pane's HUD scale (game/couchPanes.ts couchHudScale);
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
  couchHudHidden, couchHudScale, couchHudTier, couchPaneLayout,
  type CouchHudTier, type CouchPaneLayout, type CouchPaneRect,
} from '../game/couchPanes.ts';
import { encodeAimIntent } from '../sim/aimIntent.ts';
import { shellAmmunitionCapacity } from '../sim/ammunition.ts';
import { rulesetUnlimitedFor } from '../sim/matchRuleset.ts';
import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import type { EventBus } from '../game/stateCore.ts';
import type { PostView } from '../engine/post.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { battleBands, setBattleSightShift } from '../ui/battleSight.ts';

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

/** The parts of the HUD each COUCH_HUD_PRIORITY entry names (the selectors a tier hides). */
const PART_SELECTORS: Readonly<Record<string, string>> = {
  hits: '.cot-dmglayer',
  objective: '.cot-top,.cot-mode-status',
  minimap: '.cot-minimap',
  consumables: '.cot-cons',
  messages: '.cot-killfeed,.cot-alert,.cot-si-toasthost',
  rosters: '.cot-pips,.cot-ear-rows,.cot-er',
  furniture: '.cot-net,.cot-hints,.cot-vehicle-controls,.cot-drive',
};

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
  tier: CouchHudTier | null;
  /** The hulls this pane's last draw showed (ids, receipts read them). */
  drawn: string[];
  dispose(): void;
}

/** What a receipt reads of one pane. */
export interface CouchPaneProbe {
  seat: number;
  entityId: string;
  team: string;
  rect: CouchPaneRect;
  doc: Document;
  hud: PaneHud | null;
  camera: PerspectiveCamera;
  rigMode: string;
  tier: CouchHudTier | null;
  drawn: readonly string[];
  /** The pane's HUD frame's spotting read (the minimap's and the markers'): its seat as the receiver. */
  hudSpotted(id: string): boolean;
}

export interface CouchPaneViews {
  /** The panes in seat order (receipts read them). */
  readonly panes: readonly CouchPaneProbe[];
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
export const LISTENER_HOLD_S = 1.5;

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
  const own = doc.createElement('style');
  own.textContent = 'html,body{background:transparent!important;margin:0;overflow:hidden}';
  doc.head.appendChild(own);
  const mirror = new MutationObserver((records) => {
    for (const record of records) for (const node of Array.from(record.addedNodes)) copy(node);
  });
  mirror.observe(document.head, { childList: true });
  const responsive = installResponsiveLayout(frame.contentWindow!, doc);
  return {
    frame,
    doc,
    dispose() {
      mirror.disconnect();
      responsive.destroy();
      frame.remove();
    },
  };
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
    if (!document.getElementById('cot-couch-panes-style')) {
      const style = document.createElement('style');
      style.id = 'cot-couch-panes-style';
      // the panes' HUD documents over the canvas (input passes through to nothing: the phones are the controllers); the
      // page's own battle HUD stands down while the split screen shows (the page's end screen is not under it)
      style.textContent = '.cot-couch-panes{position:fixed;inset:0;pointer-events:none;z-index:40}'
        + '.cot-couch-pane-hud{position:absolute;border:0;margin:0;padding:0;background:transparent;transform-origin:0 0;'
        + 'pointer-events:none;color-scheme:normal}'
        + '.cot-couch-spare{position:absolute;background:var(--surface-0,#0b0d10)}'
        + 'body.cot-couch-split .cot-hud{visibility:hidden!important}';
      document.head.appendChild(style);
    }
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
      const scale = couchHudScale(rect);
      const style = view.frame.style;
      style.left = `${rect.x}px`;
      style.top = `${rect.y}px`;
      style.width = `${scale.layoutWidth}px`;
      style.height = `${scale.layoutHeight}px`;
      style.transform = scale.scale === 1 ? '' : `scale(${scale.scale})`;
      const tier = couchHudTier(scale);
      if (tier !== view.tier) {
        view.tier = tier;
        view.doc.body.dataset.couchHud = tier;
        const hidden = couchHudHidden(tier).map((part) => PART_SELECTORS[part]).filter(Boolean);
        let rule = view.doc.getElementById('cot-couch-tier') as HTMLStyleElement | null;
        if (!rule) { rule = view.doc.createElement('style'); rule.id = 'cot-couch-tier'; view.doc.head.appendChild(rule); }
        rule.textContent = hidden.length ? `${hidden.join(',')}{display:none!important}` : '';
      }
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
      hud: null, damagePanel: null, cards: [], cardShells: null, minimapSrc: null, tier: null, drawn: [],
      dispose() {
        view.hud?.setMode('hidden');
        view.damagePanel?.clear();
        rig.release();
        paneDoc.dispose();
      },
    } satisfies PaneView);
    // a new battle's camera starts behind its own tank, along its gun
    rig.snapArcade(2, ((entity.state as { yaw?: number; turretYaw?: number } | null)?.yaw ?? 0)
      + ((entity.state as { turretYaw?: number } | null)?.turretYaw ?? 0), -0.17);
    return view;
  };

  const api: CouchPaneViews = {
    get panes() {
      return views.map((view, index): CouchPaneProbe => ({
        seat: view.seat, entityId: view.entity.id, team: view.entity.team,
        rect: layout?.panes[index] ?? { x: 0, y: 0, width: 0, height: 0 },
        doc: view.doc, hud: view.hud, camera: view.camera, rigMode: view.rig.mode, tier: view.tier, drawn: view.drawn,
        hudSpotted: (id) => view.hudFrame.frameInfo.spotting?.isSpotted(id) ?? true,
      }));
    },
    get layout() { return layout; },
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
