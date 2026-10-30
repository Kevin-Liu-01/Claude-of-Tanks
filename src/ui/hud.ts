import { isRapidFireHit } from '../game/weaponHitKind.ts';
import { botCallsign, PLAYER_CALLSIGN } from './botCallsigns.ts';
import { accumulateDamage, canAccumulateDamage, DAMAGE_BURST_GAP_MS, type DamageNumberBurst } from './damageNumberBurst.ts';
import { BattleKillLedger } from '../game/battleEventStats.ts';
import { killPresentation } from './killPresentation.ts';
import { killSourceIdentity, vehicleName } from './killSourceIdentity.ts';
import { createVehicleStatusStrip } from './vehicleStatus.ts';
import { drawAerialMinimap } from './aerialMinimap.ts';
import { createAerialHud } from './aerialHud.ts';
import { createVehicleCooldownReader } from './vehicleControlCooldown.ts';
import { createSpecialActionPresentationReader, depletedMissileLabel, magazineFeedEmpty } from './vehicleSpecialAction.ts';
import type { AerialView } from '../sim/aerialCombat.ts';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
// src/ui/hud.ts — battle HUD overlay: dispersion/reload reticle, shell
// selector with ammo counts, consumable slots, penetration indicator, sniper
// scope, team panels ("ears") + score/timer plate, spotting-driven enemy
// nameplates and minimap, kill feed, damage log, damage numbers, hit-direction
// indicator. DOM/canvas only — no scene objects.
// Contract: docs/ARCHITECTURE.md §3.7.1.
import * as THREE from 'three';
import { captureMinimapScene, requireSceneMinimap, type MinimapCaptureReceipt } from './minimapCapturePolicy.ts';
import { createElement as el, datumAttr, markDatum } from './dom.ts';
import type { DatumKey } from './surfaceRegistry.ts';
import { ensureStyle } from './styleLayers.ts';
import { isAnyModalOpen } from './modal.ts';
import { installBattleHudLayout, MAX_BATTLE_NOTIFICATIONS, objectiveCopyOver } from './battleHudLayout.ts';
import { createPreBattleOverlay } from './preBattleOverlay.ts';
import { mountSpectateAllies, spectatorCardModel, spectatorSwitcherMarkup, spectatorSwitcherStyles } from './spectatorSwitcher.ts';
import { fillDriveTelemetry, isDriveSampleDue } from './driveTelemetry.ts';
import { createRetainedAmmunitionSlot, type RetainedAmmunitionSlot } from './hudAmmunitionPresentation.ts';
import { createRetainedConsumableSlot, type RetainedConsumableSlot } from './hudConsumablePresentation.ts';
import { arrangeVehicleControls, isJumpMode } from './vehicleControlOrder.ts';
import { vehicleAction } from '../game/vehicleActions.ts';
import { DESKTOP_OUTPUT_PIXEL_BUDGET } from '../engine/resolutionPolicy.ts';
import { createUiCanvas, scratchCanvas, type UiCanvas } from './uiCanvas.ts';
import { consumableIconSVG } from './equipIcons.ts';
import { createCanvasText, type CanvasText, type CanvasTextStyle } from './canvasText.ts';
import { formatNumber, getLocale, t } from './i18n.ts';
import { droneControl } from './droneControlState.ts';
import { battleSightShift } from './battleSight.ts';
import type { EventBus } from '../game/stateCore.ts';
import type { TankState } from '../sim/movement.ts';
import { canSelfRightTank } from '../sim/rollover.ts';
// RULESETS (2026-09-14): the clock, the objective targets and the pre-battle rule lines read the
// same table the sim applies (sim/matchRuleset.ts)
import { RULESET_SCORE_TARGETS, matchRulesetFor, rulesetLines, type MatchRuleset } from '../sim/matchRuleset.ts';
import { GAME_MODE_DEFINITIONS, isPracticeMode, normalizeGameMode } from '../sim/gameModeCatalog.ts';
import { markersStandOnSpawns, objectiveMarkers, type ObjectiveMarker, type ObjectiveStateView } from './minimapObjectives.ts';
import {
  OBJECTIVE_PALETTE, badgeLetter, drawBallGlyph, drawCheck, drawGoalGlyph, drawHexBadge, drawLaneGlyph, drawPennant,
  drawPickupGlyph, drawProgressArc, drawSpawnGlyph, laneLetter, sideColor, sideFill, type GlyphLetter,
} from './objectiveGlyphs.ts';
import { shellTypeCode, shellTypeLabel } from './shellLabels.ts';
// the proving ground's range card (2026-10-17): loaded the first time a frame carries the range (updateRangeCard)
import type { RangeCardState } from './provingRangeCard.ts';
import type { CombatState } from '../sim/damage.ts';
import type {
  SpecialActionKind,
  SpecialActionSpec,
  SpecialActionState,
} from '../sim/specialActionPolicy.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';
import type { DamagePanelController } from './damagePanel.ts';
import type { DriveTelemetry } from './driveTelemetry.ts';
import type { HitEventPresentation } from './hitEventFormat.ts';
import type { ShotInfoRuntime } from './shotInfo.ts';
import type { BattleNoticePort } from './battleNotices.ts';
import type { SpectatorCardPayload } from './spectatorSwitcher.ts';
import { SHORELINE_SEGMENTS, shorelineRadiusAt } from '../world/shoreline.ts';
import {
  minimapAngleForDirection,
  minimapYawForHeading,
  projectWorldToMinimap,
} from './minimapOrientation.ts';

export type HudMode = 'battle' | 'sniper' | 'hidden';
type Vec3Tuple = readonly [number, number, number];

interface ReloadView {
  t: number;
  totalS: number;
  kind?: string;
}

interface MagazineView {
  rounds?: number;
  capacity?: number;
  /** A guided rack salvo group (sim/magazineIndicator): its group reload is the launcher's own 'shell' cycle. */
  launcher?: boolean;
  /** Rounds of `capacity` that stowage can still load (aimController; absent = all of them). */
  feed?: number;
}

interface AimWarningView {
  blockedDistM?: number | null;
  blockedLabel?: boolean;
  gunLimitSpec?: boolean;
  selfRightLabel?: string | null;
}

interface AimWarningState {
  visible: boolean;
  kind: string;
  text: string;
}

interface HitConfirmState {
  visible: boolean;
  opacity: number;
  radius: number;
  length: number;
  halfWidth: number;
  flash: number;
}

interface ReticleAnchorInput {
  gunX?: number | null;
  gunY?: number | null;
  cx?: number | null;
  cy?: number | null;
  singleReticle?: boolean;
}

interface ReticleAnchorState {
  x: number | null;
  y: number | null;
  single: boolean;
}

interface AutoloaderHudState {
  capacity: number;
  rounds: number;
  visibleShells: number;
  readyShells: number;
  /** Visible shells stowage can still fill; the rest draw as hollow, spent slots. */
  feedShells: number;
  overflow: number;
  fullReload: boolean;
  loadProgress: number;
  intraClip: boolean;
  reloading: boolean;
  /** The selected weapon holds no round at all: every shell hollow, struck, no fill. */
  dry: boolean;
}

interface AutoloaderShellPose {
  y: number;
  rotation: number;
}

interface HudShellCard {
  name?: string;
  type?: string;
  dmg?: number;
  penLabel?: string | number;
  count?: number;
  /** Round 32 (owner 2026-09-21, Turbo Ball): the ruleset carries unlimited rounds — the slot shows ∞, never empties. */
  unlimited?: boolean;
}

interface HudAimInput {
  point?: THREE.Vector3 | null;
  distM?: number | null;
  dispersionRadM?: number | null;
  penRatio?: number | null;
  blockedDistM?: number | null;
  blockedLabel?: boolean;
  gunMarker?: THREE.Vector3 | null;
  gunDistM?: number | null;
  gunTargetId?: string | null;
  singleReticle?: boolean;
  atGunLimit?: boolean;
  gunLimitSpec?: boolean;
  reload?: ReloadView;
  magazine?: MagazineView | null;
  shellSlot?: number;
  ammoSelectionPending?: boolean;
  shells?: HudShellCard[];
  zoom?: number;
}

interface HudAimView {
  cx: number;
  cy: number;
  radPx: number;
  penRatio: number | null;
  distM: number | null;
  blockedDistM: number | null;
  blockedLabel: boolean;
  gunX: number | null;
  gunY: number | null;
  gunDistM: number | null;
  gunTargetId: string | null;
  singleReticle: boolean;
  atGunLimit: boolean;
  gunLimitSpec: boolean;
  selfRightLabel: string | null;
  reload: ReloadView;
  ammoSelectionPending: boolean;
  magazine: MagazineView | null;
  zoom: number;
  dispRadM: number | null;
}

interface HudTankVisual {
  turretTopWorld?(out: THREE.Vector3): void;
  /** (ac130-fx-228 r2) the camera rig hides the player's own vehicle while its lens (a scope, the gunship's gimbal) is the camera */
  root?: { visible: boolean };
}

export interface HudTank {
  aerial?: AerialView;
  input?: {shellSlot:number};
  id: string;
  team?: string;
  isPlayer?: boolean;
  modeActive?: boolean;
  displayName?: string;
  /** Jev commander (2026-09-25): 'jev' tags a bot under Jev's orders in the roster ear. */
  brain?: string;
  state?: TankState | null;
  combat?: CombatState | null;
  spec?: (FleetTankSpec & SpecialActionSpec) | null;
  visual?: HudTankVisual | null;
  specialAction?: SpecialActionState | null;
}

type HudTargetTank = HudTank & { state: TankState; combat: CombatState };

export interface ConcealmentView {
  spotted?: boolean;
  inBush?: boolean;
  fired?: boolean;
  camo?: number;
}

export interface HudSpottingView {
  player?: ConcealmentView | null;
  isSpotted(id: string): boolean;
}

// tactical map 2026-09-15: the objective arrays (flags, zones, ball, goals, pickups, spawns)
// ride along structurally from the sim's presentation state for the minimap markers.
export interface HudMatchModeState extends ObjectiveStateView {
  support?:{ammoReadyInS:number;healReadyInS:number};
  escort?: {alive:number;total:number;rescued:number;required:number;progress:number};
  boss?: { id?: string; hp: number; maxHp: number };
  infection?: { survivors: number; infected: number };
  weaponStage?: { index: number; total: number; name: string; kills: number; required: number };
  /** proving ground: the range's lanes and its card (sim/matchModes.ts ProvingRangePresentation) */
  range?: RangeCardState | null;
  id?: string;
  label?: string;
  perspectiveTeam?: 'alpha' | 'bravo';
  score?: Partial<Record<'alpha' | 'bravo', number>>;
  target?: number;
  playerAmmo?: number;
  playerAmmoCapacity?: number;
  horde?: { wave?: number; alive?: number; nextWaveInS?: number; total?: number; queued?: number; remaining?: number;
    special?: 'runner' | 'swarm' | null } | null;
  line?: { index?: number; total?: number; holdS?: number } | null;
}

export interface HudFrame {
  timeS: number;
  pingMs?: number;
  mode?: HudMode;
  camera?: THREE.PerspectiveCamera | null;
  player?: HudTank | null;
  tanks?: HudTank[];
  rosterTanks?: HudTank[];
  aim?: HudAimInput;
  spotting?: HudSpottingView | null;
  matchModeState?: HudMatchModeState | null;
  /** Ruleset clock in seconds (null = no clock); undefined lets the HUD derive it from the mode. */
  timeLimitS?: number | null;
  selfRightKeyLabel?: string;
  /** Every key cap from the live bindings (game/battleKeyCaps.ts, by action id): the tray's shell digits and consumables,
   *  the minimap's and the gear's read it (the controls row's come in auxiliaryKeyLabels). */
  keyCaps?: Readonly<Record<string, string>>;
  auxiliaryKeyLabels?: {smoke:string;lights:string;roofGun:string;missile?:string;atgm?:string;reloadMagazine?:string;specialAction?:string;drone?:string;aerialVision?:string;supplyAmmo?:string;supplyHeal?:string;rangeReset?:string;rangeMoving?:string};
}

interface HudHeightField {
  size?: number;
  minY: number;
  maxY: number;
  getHeightAt(x: number, z: number): number;
  getGroundType(x: number, z: number): string;
}

interface MapDisc { x: number; z: number; r: number }
interface MapBuilding {
  x: number;
  z: number;
  w?: number;
  d?: number;
  yaw?: number;
  rot?: number;
}
interface HudMinimapFeatures {
  roads?: Array<Array<readonly [number, number]>>;
  buildings?: MapBuilding[];
  tacticalBeats?: MapBuilding[];
  treeClusters?: MapDisc[];
  /** Discs the world draws liquid water in (World.getMinimapFeatures, world/minimapWaterPatches.ts): the only water. */
  liquidPatches?: MapDisc[];
  /** Discs with no liquid anywhere: bog, salt pan or takyr flat — or ice where the map's wet layer is (`iceLake`). */
  softPatches?: MapDisc[];
  iceLake?: boolean;
  /**
   * The water a player can see (World.getVisibleWaterRaster, world/visibleWater.ts): when present it is the plate's
   * water, the water sheet's cell for cell, and the liquid discs' contours are not painted.
   */
  visibleWater?: HudVisibleWater | null;
}

/** world/visibleWater.ts VisibleWaterRaster: `cells`² row by row from the square's (−x, −z) corner, 0 dry. */
interface HudVisibleWater {
  readonly size: number;
  readonly cells: number;
  readonly cellM: number;
  readonly water: Uint8Array;
}

interface HudMinimapPalette {
  base: readonly number[];
  hard: readonly number[];
  soft: readonly number[];
  forest: string;
  forestStroke: string;
  water: string;
  waterStroke: string;
  /** Dry lake/marsh discs (bog, salt pan, takyr flat): ground-toned, a keyline and no waterline rim. */
  bog: string;
  bogStroke: string;
  /** The same discs frozen, on a map whose wet layer is ice (splat.iceLake). */
  ice: string;
  iceStroke: string;
  roadCasing: string;
  roadFill: string;
  buildingFill: string;
}

interface HudMinimapSnapshot {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  exclude?: THREE.Object3D[];
  requireTextured?: boolean;
}

interface HudHitEvent extends HitEventPresentation {
  attackerId?: string | null;
  targetId?: string | null;
  pos: Vec3Tuple;
  localDir?: Vec3Tuple | null;
  damage: number;
  dmgRoll?: number;
  modulesHit?: ReadonlyArray<{ newState?: string }>;
  crewHit?: readonly string[];
}

interface HudEventPayload extends SpectatorCardPayload, Partial<HudHitEvent> {
  /** ui:minimapZoom: the map's size step to set (none: M's toggle of the large step). */
  step?: number;
  /** spectate:begin/change: who may be watched, in the stepping order (killcam.ts; the bar's picker of allies). */
  allies?: readonly string[];
  destroyed?: boolean;
  id?: string;
  /** tank:spotted: who lit the tank (spotting.ts), when the sim names a spotter. */
  spotterId?: string | null;
  /** aps:intercept: whose round the struck tank's APS charge met. */
  shooterId?: string;
  killerId?: string;
  name?: string;
  vehicle?: string;
  cause?: 'shot' | 'fire' | 'ammorack' | 'ram' | 'impact' | 'fall';
  /** (ac130-fx-228) what the kill was made with when not the killer's vehicle (the authority's sim/aerialCombat.ts killSourceOf) */
  source?: 'ac130' | 'drone';
  timeS?: number;
  on?: boolean;
  shells?: string[];
  consumables?: string[];
  specialAction?: string;
  minimapZoom?: string;
  settingsMenu?: string;
  active?: boolean;
  reason?: string;
  slot?: number;
  fallbackSlot?: number;
  guided?: boolean;
  readyAt?: number;
  cooldownS?: number;
  /** A consumable's uses left (null is unlimited); the loadout's item per slot (the catalog, 2026-10-26). */
  charges?: number | null;
  items?: readonly string[];
  remainingS?: number;
  targetName?: string;
  by?: string;
  ammoAdded?: number;
  wave?: number;
  line?: number;
  total?: number;
  nextWaveInS?: number;
  team?: string;
  module?: string;
  state?: string;
  repaired?: boolean;
  /** battle endings (2026-09-25): 'ending:begin' / 'ending:done' — the beat and its caption */
  beat?: string;
  captionKey?: string | null;
  captionValues?: Record<string, string> | null;
  clockFlash?: boolean;
}

interface HitDirection {
  wx: number;
  wz: number;
  kind: 'pen' | 'bounce' | 'he';
  outcomeId: string;
  mergeKey: string;
  label: string;
  labelColor: string;
  numeric: boolean;
  crit: boolean;
  dmg: number;
  amount: number;
  t0: number;
  re: boolean;
  _screenAng: number | null;
}

interface IncomingHitOrigin { x: number; z: number }

interface HitIndicatorFrameState {
  playerX: number;
  playerZ: number;
  rightX: number;
  rightZ: number;
  forwardX: number;
  forwardZ: number;
  centerX: number;
  centerY: number;
  minDimension: number;
  radius: number;
  thickness: number;
}

interface HitIndicatorPaintState {
  age: number;
  angle: number;
  alpha: number;
  growth: number;
  halfAngle: number;
  thickness: number;
  rimHalfAngle: number;
  bodyColor: string;
  bodyAlpha: number;
  rimColor: string;
  rimAlpha: number;
}

interface MinimapBlip {
  x: number;
  y: number;
  yaw: number;
  fill: string;
  s: number;
  a: number;
  fixed: boolean;
}

interface TargetPlateRect { cx: number; hw: number; top: number; bottom: number }
interface EarRow {
  root: HTMLDivElement;
  hp: HTMLElement;
  ic: HTMLElement;
  kills: HTMLElement;
  lastKills: number;
  ally: boolean;
  lastFrac: number;
  wasDead: boolean | null;
  wasSpotted: boolean | null;
  me: boolean;
}
interface TeamTally {
  allyAlive: number;
  allyTotal: number;
  enemyAlive: number;
  enemyTotal: number;
}
interface HpBar {
  root: HTMLDivElement;
  /** On the player's side (its bar gives way to an enemy's where the two would cross). */
  ally: boolean;
  /** The name line (whoever holds the hull, or its vehicle where none does) and the vehicle line under it. */
  cs: HTMLElement;
  nm: HTMLElement;
  fill: HTMLElement;
  lastFrac: number;
  lastCallsign: string;
  lastName: string;
  layoutW: number;
  /** Its box's height: the vehicle line leaves it with no callsign over it (.solo) and on a short window. */
  layoutH: number;
  solo: boolean;
  /** The transform last written and whether the plate shows. */
  lastTransform: string;
  shown: boolean;
  /** The name changed while the bar was hidden: measured once it shows (updateHpBarLabel). */
  measure: boolean;
  /** This frame's projected anchor, range, lift off the tank's top and scale (updateHpBars places the nearest first). */
  sx: number;
  sy: number;
  dist: number;
  lift: number;
  k: number;
  /** Where a slide moved it off its seat (hpBarSlide), the frames it waits before another search where none seated it,
   *  and the pointer's offset last written (it stays over the tank). */
  seatDx: number;
  seatDy: number;
  slideWait: number;
  lastPointerDx: number;
}
interface SpotMemory {
  vis: boolean;
  lastT: number;
  lastX: number;
  lastZ: number;
  lastYaw: number;
  ever: boolean;
}
interface LiveDamageNumber {
  x: number; y: number;
  element: HTMLDivElement;
  burst?: DamageNumberBurst;
  timer?: ReturnType<typeof setTimeout>;
}
interface HitMark { t0: number; bounced: boolean; blockedRapid?: boolean }
interface SpawnFlag { x: number; z: number; color: string; fill?: string; side: 'own' | 'enemy' }

interface ReticlePaintState {
  valid: boolean;
  mode: string;
  w: number;
  h: number;
  cx: number;
  cy: number;
  radPx: number;
  gunX: number | null;
  gunY: number | null;
  penRatio: number | null;
  distM: number | null;
  blockedDistM: number | null;
  gunDistM: number | null;
  gunTargetId: string | null;
  aimTargetId: string | null;
  singleReticle: boolean;
  atGunLimit: boolean;
  gunLimitSpec: boolean;
  selfRightLabel: string | null;
  zoom: number;
  reloadKind: string;
  ammoSelectionPending: boolean;
  magazineCapacity: number;
  magazineRounds: number;
  magazineLauncher: boolean;
  magazineFeed: number;
  shellType: string;
  shellCount: number;
  shellUnlimited: boolean;
  /** The last paint showed a reload running (the sweep, a countdown or a filling round). */
  reloading: boolean;
  /** The furniture the last paint kept clear of (sightFurniture.version). */
  furniture: number;
  drawnR: number;
}

interface ReticleDrawState {
  cx: number;
  cy: number;
  radius: number;
  circleX: number;
  circleY: number;
  sniper: boolean;
  blocked: boolean;
  limited: boolean;
  reloadFraction: number;
  reloading: boolean;
  /** The selected weapon is out of rounds (reticleWeaponDry): no sweep, countdown or ready pulse. */
  dry: boolean;
  gunColor: string;
  ringColor: string;
  zoomScale: number;
  markerLineWidth: number;
  centerClearanceRadius: number;
  single: boolean;
  magazine: AutoloaderHudState | null;
  magazineBottomY: number;
  /** Half the painted rack's width (0 without a rack): the compact sniper stack sets its countdown beside it. */
  magazineHalfW: number;
  /** The rack shells' lowest ink, their dark contours included (0 without a rack): the countdown starts under it. */
  magazineInkBottomY: number;
  /** The reload countdown's lowest ink this frame (0 without one): the scope readouts and the aim warning start under it. */
  countdownBottomY: number;
  /** The reload countdown's right edge this frame (0 without one): a scope readout row set beside the column under the
   *  marker starts past it (sniperReadoutStack). */
  countdownRightX: number;
  /** The canvas aim warning's baseline this frame (0 without one; placeAimWarning): the scope readouts start under its
   *  chip. */
  warningY: number;
  /** The warning chip's centre and width (a cramped scope sets the chip beside its readout line: sniperReadoutStack). */
  warningX: number;
  warningW: number;
  /** The highest ink of a mark set over the ring this frame (Infinity with none; sightColumnTop): what goes over the sight
   *  later (the countdown, the scope row, the warning chip) stays over it. */
  aboveTopY: number;
  /** The range tag's top when it hangs at the 1:30 over the sight (Infinity at its 4:30; sniperDistanceTag): a warning
   *  chip set over the sight stays over it. */
  tagTopY: number;
}

interface HudFrameUpdateState {
  advancing: boolean;
  camera: THREE.PerspectiveCamera | null;
  dt: number;
}

interface SceneRenderable extends THREE.Object3D {
  isMesh?: boolean;
  isSprite?: boolean;
  geometry?: THREE.BufferGeometry;
}

interface ShellSlotButton extends HTMLButtonElement {
  _icon: UiCanvas;
}

interface AlertOptions { tone?: string; icon?: string }
/** A name in Latin type alone (the kill feed's .lat: Chinese's lifted label sizes are for Chinese text, gauntlet r8). */
const LATIN_CALLSIGN = /^[\x20-\x7e\u00a0-\u024f]+$/;
/** An alert's tone as the kit's notice severities name it (components/notice.ts). */
const ALERT_SEVERITY: Readonly<Record<string, 'info' | 'success' | 'warning' | 'error'>> = {
  danger: 'error', warning: 'warning', success: 'success', info: 'info',
};
/** How long an alert shows (ms). */
const ALERT_HOLD_MS = 2400;
/** The alert band's order: a higher severity takes the band from a lower one, which waits again (NoticeQueue). */
const ALERT_PRIORITY: Readonly<Record<'info' | 'success' | 'warning' | 'error', number>> = { error: 3, warning: 2, success: 1, info: 1 };
/** A waiting alert older than this is dropped rather than shown late: the battle has moved on. */
const ALERT_STALE_MS = 3000;

/** Watch mode's drone on the minimap (watch-mode-243): its ground point and the lens's heading. */
export interface HudWatchDrone {
  x: number;
  z: number;
}

export interface HudRuntime {
  root: HTMLDivElement;
  /** Watch mode: the drone's pose while flying (no tank is the HUD's own), null while riding, driving or playing. */
  setWatchDrone(pose: HudWatchDrone | null): void;
  /**
   * Watch mode: the side a spectator reads the battle from (the watched seat's team while flying or riding), null while
   * driving or playing. The score, rosters, pips, plates, minimap and kill feed keep that frame whichever tank is ridden.
   */
  setWatchSide(team: string | null): void;
  shotInfo: ShotInfoRuntime;
  /** (UI-LOCKDOWN A) the sight's words and figures, DOM over its canvas: receipts read the last repaint's runs. */
  sightText: Pick<CanvasText, 'placed'>;
  forceHitMark(bounced?: boolean): void;
  getHitArcs(): Array<{
    kind: string;
    outcomeId: string;
    label: string;
    crit: boolean;
    dmg: number;
    amount: number;
    screenAngRad: number | null;
    ageS: number;
  }>;
  getSpectateBar(): { shown: boolean; nick: string | null; vehicle: string | null };
  stageSpectateBar(payload?: HudEventPayload): void;
  warmShotCards(specIds: readonly string[]): void;
  preBattleCountdown(secondsLeft: number, warmPending?: boolean): void;
  setPreBattleWaiting(waiting: boolean): void;
  /** Rule lines shown under the countdown (the ruleset's deviations from Standard); null clears. */
  setPreBattleRules(ruleset: MatchRuleset | null): void;
  setMode(mode: HudMode): void;
  update(frame: HudFrame): void;
  buildMinimap(
    heightField: HudHeightField,
    features?: HudMinimapFeatures | null,
    palette?: Partial<HudMinimapPalette> | null,
    snapshot?: HudMinimapSnapshot | null,
  ): void;
  preloadMinimapAsset(src: string): Promise<HTMLImageElement>;
  buildMinimapFromAsset(heightField: HudHeightField, src: string): Promise<boolean>;
  exportMinimapBackground(type?: string, quality?: number, requireTextured?: boolean): string | null;
  getMinimapCaptureReceipt(): MinimapCaptureReceipt | null;
  setDamagePanel(panel: DamagePanelController): void;
  forceAimDisplay(frame: HudAimInput): void;
}

interface HudMinimapDebugState {
  rotationRad: number;
  rotationDeg: number;
  orientationSource: 'north-up';
  headingUp: false;
  northUp: true;
  backgroundKind: 'none' | 'image' | 'canvas';
  backgroundReady: boolean;
  backingWidth: number;
  backingHeight: number;
}

interface HudReticleMagazineDebugState {
  shellCount: number;
  y: number | null;
  rounds: number;
  capacity: number;
  overflow: number;
  fullReload: boolean;
  loadProgress: number;
  reloading: boolean;
  curved: true;
  outerRotationRad: number;
  centerDropPx: number;
}

interface HudReticleDebugState {
  mode: HudMode;
  singleReticle: boolean;
  w: number;
  h: number;
  zoom: number;
  distM: number | null;
  dispRadM: number | null;
  radPx: number;
  smoothRadPx: number;
  drawnR: number;
  gunOutside: boolean;
  desiredX: number;
  desiredY: number;
  gunX: number | null;
  gunY: number | null;
  circleX: number;
  circleY: number;
  gunOffsetPx: number | null;
  atGunLimit: boolean;
  gunTargetId: string | null;
  penRatio: number | null;
  cameraMarkerColor: string | null;
  gunMarkerColor: string | null;
  magazineIndicator: HudReticleMagazineDebugState | null;
  floorPx: number;
  ceilPx: number;
}

interface HudDebugSurface {
  getHitArcs(): ReturnType<HudRuntime['getHitArcs']>;
  getSpectateBar(): ReturnType<HudRuntime['getSpectateBar']>;
  stageSpectateBar(payload?: HudEventPayload): void;
  getMinimapBackgroundDataUrl(type?: string, quality?: number): string | null;
  getMinimapState(): HudMinimapDebugState;
  getReticleState(): HudReticleDebugState;
}

declare global {
  interface Window {
    __HUD_DEBUG?: HudDebugSurface;
    __HUD_HIDE_ZOOM_PLATE?: boolean;
  }
}

function requireCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('[hud] Canvas2D context unavailable');
  return context;
}

function requireElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`[hud] missing required element: ${selector}`);
  return element;
}

function isHudHitEvent(payload: HudEventPayload): payload is HudEventPayload & HudHitEvent {
  return Array.isArray(payload.pos)
    && payload.pos.length >= 3
    && payload.pos.every((value) => Number.isFinite(value))
    && Number.isFinite(payload.damage);
}

// --- palette (locked colors per ARCHITECTURE §3.7.1) ---
const PEN_GREEN = '#7ee87e';
/** The zoom readout's rules: the ring's green, translucent. */
const ZOOM_RULE_INK = 'rgba(126,232,126,0.5)';
const PEN_ORANGE = '#f0b04a';
const PEN_RED = '#f05a5a';
const PEN_NONE = 'rgba(236,242,248,0.95)';
/** The team inks a canvas paints (brand-ui H1): the team tokens under the player's colour preset, re-read only when the
 *  preset changes (tokenEpoch), so the minimap's blips follow the same Own/Enemy pair as every CSS team mark. */
const TEAM_INK = { epoch: -1, own: '', enemy: '' };
function teamInk(): typeof TEAM_INK {
  const epoch = tokenEpoch();
  if (epoch !== TEAM_INK.epoch) {
    TEAM_INK.epoch = epoch;
    TEAM_INK.own = liveToken('team-own');
    TEAM_INK.enemy = liveToken('team-enemy');
  }
  return TEAM_INK;
}
// WoT sight grammar: the DISPERSION CIRCLE is a thin DASHED pale-green ring
// in arcade — only the central gun marker carries the penetration color.
// r4: desaturated toward pale white-green + thinner strokes — the old
// saturated mint at 2px read as WoT Blitz/mobile, not the PC client.
// r5-2: sniper mode carries its OWN skin (round critique: "sniper is a
// reskin-less copy of arcade") — a brighter, heavier green sight, the way
// WoT's sniper reticle visibly outweighs the arcade one.
const CIRCLE_COL = 'rgba(208,233,211,0.85)';
const SNIPER_COL = 'rgba(140,242,140,0.95)';      // sniper circle + furniture
const RELOAD_ACCENT = 'rgba(240,160,48,0.95)';    // reload sweep + countdown
// Owner 2026-10-17 (out of ammo): a spent weapon's ink. The DOM controls read the same danger as --hud-danger.
const DRY_ACCENT = 'rgba(240,90,90,0.92)';
const DRY_RING = 'rgba(214,120,112,0.62)';
/** The least gap between the dispersion ring's stroke and any mark under the marker — an empty mark (sightMarkTop), the
 *  rack and the reload countdown (ringGap; critic r6: the desktop scope's countdown sat on the ring, a phone's clip
 *  touched it). */
const SIGHT_MARK_RING_GAP = 3;
/** How far a scope cross arm's under-stroke reaches either side of its line (paintScopeSkeleton: 2.4 px wide). */
const SCOPE_ARM_REACH = 1.2;
/** Where the scope's cross arms end, 1.55 radii out (the r4 short skeleton; paintScopeSkeleton). */
const scopeArmEnd = (radius: number): number => radius * 1.55 + 3;
/** How far the ring's stroke reaches past its radius: the dark halo under-pass, circleLw + 1.5 wide (drawReticle). */
const RING_STROKE_REACH = 1.5;
/** A rack shell's dark contour reaches 1.5 px past its outline; a turned outer shell (AUTOLOADER_HUD_OUTER_ROTATION)
 *  reaches at most 1.1 px wider and 0.4 px higher than an upright one (magazineShellBox). */
const RACK_CONTOUR = 1.5;
const RACK_TURN_X = 1.1;
const RACK_TURN_Y = 0.4;
/** The countdown's numeral: 16 px, its digits 0.74 of that above the baseline and 0.08 below (the capture's text box). */
const COUNTDOWN_SIZE = 16;
const COUNTDOWN_ASCENT = COUNTDOWN_SIZE * 0.74;
const COUNTDOWN_DESCENT = COUNTDOWN_SIZE * 0.08;
/** The least gap between the countdown and the rack above it (critic r6: the digits' tops touched the clip's shells). */
const COUNTDOWN_RACK_GAP = 3;
/** How far the scope's range tag keeps beside a countdown on its row: twice the tag's own word space (about 8 px
 *  between 200 and m), so the two read as two groups (critic r7: "3.2 s200 m"). Nearer, the countdown drops under it. */
const TAG_GROUP_GAP = 16;
/** The aim warning's chip: how far its ink, its 1 px outline included, reaches over the text baseline and under it
 *  (paintAimWarning strokes a path 0.5 px inside these; r10 critic: the outline's ink came 2.5 px from the ring). The
 *  touch chip seated under the sight is this box, 24 px tall (battleHudLayout.css data-seat). */
const AIM_WARNING_CHIP_ABOVE = 14;
const AIM_WARNING_CHIP_BELOW = 10;
/** Half the scope vision switch's height: aerialHud.css seats it beside the sight, level with the marker (48 px tall on
 *  a mouse layout; on touch its four views two by two, 94 px). The warning chip set above the sight keeps over its band
 *  (sniperChipAboveY): a wide chip reaches past the switch's inner edge (80 px from the marker on a short window). */
const SCOPE_VISION_HALF_H = 24;
const SCOPE_VISION_TOUCH_HALF_H = 47;
/** How far right of the aim point the hit confirmation's 4:30 shard reaches once settled (hitConfirmVisualState). */
const HIT_SHARD_CLEAR = Math.ceil(0.7071 * (18.5 + 13) + 3.5);
/** How the scope's readout row sets its zoom plate and the warning chip, and where its line goes (sniperReadoutStack). */
type SniperRowMode = 'stack' | 'zoomBeside' | 'chipBeside' | 'rowBeside' | 'rowAbove';
/** The touch warning chip the reticle seats under the sight (placeAimWarning): its width (a portrait under 375 px wide
 *  narrows it, clear of the speedometer beside the sight at 360x640), its height the canvas chip's
 *  (AIM_WARNING_CHIP_ABOVE + _BELOW, 24 px; battleHudLayout.css data-seat). */
// (the touch detection's width, so the chip and the notices stacked under the sight are one column: gauntlet r3 and r4)
const TOUCH_WARNING_W = 180;
const TOUCH_WARNING_NARROW_W = 156;
/** The scope row's places, tried in order (sniperReadoutStack): its mode, the warning chip set over the sight (else under
 *  the column or beside the line), the zoom plate left out; the last flag marks a place only a chip makes different.
 *  rowBeside sets the chip over the sight whenever there is one (under the column it would push the row under it). Over
 *  the ring the row is the line alone: the zoom plate beside it set the row 96 px off the sight's axis at 568x256, the
 *  countdown under the line and the range tag by the ring between them (gauntlet r14). */
const SNIPER_ROW_PLACES: readonly (readonly [SniperRowMode, boolean, boolean, boolean])[] = [
  ['stack', false, false, false], ['zoomBeside', false, false, false], ['chipBeside', false, false, true],
  ['stack', true, false, true], ['zoomBeside', true, false, true], ['rowBeside', false, false, false],
  ['rowAbove', false, true, false], ['rowAbove', true, true, true], ['stack', false, true, false], ['stack', true, true, true],
];
/** The reticle's text faces, built once (a canvas font set every repaint from a template would build a string each time). */
const FONT_COUNTDOWN = `700 ${COUNTDOWN_SIZE}px ${FONT_COND}`;
const FONT_COUNTDOWN_UNIT = `500 11px ${FONT_COND}`;
const FONT_SCOPE_ZOOM = `700 16px ${FONT_COND}`;
const FONT_SCOPE_COUNT = `700 13.5px ${FONT_COND}`;
const FONT_SCOPE_TYPE = `700 11px ${FONT_COND}`;
const FONT_RANGE_TAG = `600 11.5px ${FONT_COND}`;
// (the mouse layout's chip at 13 px, a step under the centre notices' 15 and over their 11 px touch type, battleHudLayout.css)
const FONT_AIM_WARNING = `700 13px ${FONT_COND}`;
const AIM_WARNING_TRACK_PX = 13 * 0.08;
const FONT_RACK_OVERFLOW = `700 11px ${FONT_COND}`;
/** (UI-LOCKDOWN A) the sight's text runs, DOM over its canvas (canvasText.ts): five hit labels and their crit words
 *  (2i, 2i + 1), then the readouts. */
const SIGHT_TEXT_HIT = 0;
const SIGHT_TEXT_COUNTDOWN = 10, SIGHT_TEXT_COUNTDOWN_UNIT = 11, SIGHT_TEXT_OVERFLOW = 12;
const SIGHT_TEXT_AMMO_COUNT = 13, SIGHT_TEXT_AMMO_TYPE = 14, SIGHT_TEXT_RANGE = 15, SIGHT_TEXT_ZOOM = 16;
/** The sight's word labels' floor: --battle-fs-11, 11 px, which zh-CN lifts to 13 (tokens.css; a hit's word, CRIT). */
const sightWordFloorPx = (): number => (getLocale().startsWith('zh') ? 13 : 11);
/** A lane marker's letter is part of its 11 px minimap glyph (drawLaneGlyph), sized with the glyph like the hex badges'
 *  letters, not reading text (the 11 px type floor is for labels a player reads). */
const LANE_GLYPH_LETTER_PX = 8;
/** The struck round that leads the compact sniper readout line (paintSniperAmmoReadout). */
const COMPACT_DRY_ROUND_W = 6;
const COMPACT_DRY_ROUND_H = 14;
/** The reticle's reload and empty-weapon inks by role (hudAmmoOutPaint.selftest reads the painted canvas by them). */
export const RETICLE_AMMO_INK = Object.freeze({ reload: RELOAD_ACCENT, dry: DRY_ACCENT, dryRing: DRY_RING,
  cycling: 'rgba(174,184,192,0.9)' });
export const AUTOLOADER_HUD_SHELLS = 4;
const AUTOLOADER_HUD_ARC_DEPTH = 2.25;
const AUTOLOADER_HUD_OUTER_ROTATION = 0.14;
const AUTOLOADER_SHELL_RELOADING = RETICLE_AMMO_INK.cycling;
export const HIT_CONFIRM_LIFETIME_S = 1.4;
/** (ac130-fx-228 r3) the gunship's hit-confirm canvas (CSS px, square): the mark reaches ~40 px from its centre (the
 *  entry shards 29 + 8.5 + the 2.1 pad; the blocked-round diamond at +30/-37) */
const HIT_MARK_BOX_PX = 96;

/** Exact value printed on an incoming direction arc. */
export function directionalHitAmount(
  hit: Pick<HudHitEvent, 'damage' | 'dmgRoll'>,
  blocked = false,
): number {
  const raw = blocked ? hit.dmgRoll : hit.damage;
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw || 0)) : 0;
}

/**
 * Damage and splash values are core hit feedback. The Interface option adds
 * the authoritative pre-mitigation roll to blocked outcome words.
 */
export function directionalHitValueVisible(
  enabled: boolean,
  amount: number,
  kind: HitDirection['kind'],
): boolean {
  return amount > 0 && (kind !== 'bounce' || enabled);
}

/**
 * Convert physical aim constraints into one stable, player-facing warning.
 * Bore obstruction remains a reticle tint, without a muzzle-block text overlay.
 */
export function aimWarningState(
  view: AimWarningView | null | undefined,
  out: AimWarningState | null = null,
): AimWarningState {
  const state = out || { visible: false, kind: '', text: '' };
  state.visible = false;
  state.kind = '';
  state.text = '';
  if (view?.selfRightLabel) {
    state.kind = 'rollover';
    state.visible = true;
    state.text = t('hud.aimWarning.selfRight', { key: view.selfRightLabel });
  } else if (view?.gunLimitSpec) {
    state.kind = 'limit';
    state.visible = true;
    state.text = t('hud.gunTravelLimit');
  }
  return state;
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Resolve the hit-confirm animation without allocating in the live HUD loop.
 * The four shards snap inward immediately, hold long enough to read, then
 * fade in place. Reduced motion keeps their position fixed throughout.
 */
export function hitConfirmVisualState(
  ageS: number,
  reducedMotion = false,
  out: HitConfirmState | null = null,
): HitConfirmState {
  const state = out || {
    visible: false, opacity: 0, radius: 18.5, length: 13, halfWidth: 3.5, flash: 0,
  };
  state.visible = Number.isFinite(ageS) && ageS >= 0 && ageS <= HIT_CONFIRM_LIFETIME_S;
  if (!state.visible) {
    state.opacity = 0;
    state.radius = 18.5;
    state.length = 13;
    state.halfWidth = 3.5;
    state.flash = 0;
    return state;
  }

  const enterT = Math.min(1, ageS / 0.14);
  const enterEase = 1 - Math.pow(1 - enterT, 3);
  const releaseT = Math.max(0, Math.min(1,
    (ageS - 0.34) / (HIT_CONFIRM_LIFETIME_S - 0.34)));
  const fade = ageS <= 0.34 ? 1 : 1 - smoothstep01(releaseT);

  state.opacity = (0.62 + 0.38 * enterEase) * fade;
  state.radius = reducedMotion ? 18.5 : 29 - 10.5 * enterEase;
  state.length = reducedMotion ? 13 : 8.5 + 4.5 * enterEase;
  state.halfWidth = reducedMotion ? 3.5 : 2.7 + 0.8 * enterEase;
  state.flash = reducedMotion ? 0 : 1 - smoothstep01(ageS / 0.2);
  return state;
}

/** Remaining reload fraction, or a full unavailable ring while selection is pending. A dry weapon loads nothing. */
export function reloadHudFraction(reload: ReloadView | null | undefined, pending = false, dry = false): number {
  if (pending) return 1;
  if (dry) return 0;
  const totalS = reload?.totalS ?? 0;
  const remainingS = reload?.t ?? 0;
  if (!(totalS > 0) || !(remainingS > 0.001)) return 0;
  return Math.max(0, Math.min(1, remainingS / totalS));
}

/** A pending host selection has no truthful countdown yet. */
export function reloadHudCountdown(reload: ReloadView, pending = false): string {
  if (pending) return 'SWITCHING';
  return reload.t >= 10 ? `${Math.ceil(reload.t)}` : reload.t.toFixed(1);
}

export function reloadHudReadyPulse(wasReloading: boolean, reloading: boolean, pending = false): boolean {
  return !pending && wasReloading && !reloading;
}

/**
 * Owner 2026-10-17: "if you are out of ammo, the reload indicators should have a special edge case, including
 * autoloader/missile indicators." The selected weapon is dry when its card holds no round, loaded or stowed, under a
 * finite loadout. The simulation refuses to select an empty slot and falls back after the last round, so a dry
 * selection means every channel is spent. The ruleset's unlimited-rounds mark on the card never runs dry; a pending
 * host selection keeps its own read. Allocation-free (the reticle reads it every frame).
 */
export function reticleWeaponDry(shell: HudShellCard | null | undefined, pending = false): boolean {
  if (pending || !shell || shell.unlimited === true || shell.count == null) return false;
  const raw = Number(shell.count);
  return (Number.isFinite(raw) ? Math.floor(raw) : 0) <= 0;
}

export function ammunitionSelectionLabel(name: string, count: number, selected: boolean, pending = false): string {
  // round 32: a non-finite count is unlimited ammunition (Turbo Ball) — "unlimited rounds", never ", empty"
  const unlimited = !Number.isFinite(count);
  const rounds = unlimited ? t('hud.ammo.unlimited') : count;
  const empty = !unlimited && count <= 0 ? t('hud.ammo.empty') : '';
  if (pending && selected) return t('hud.ammo.switchingAria', { name, count: rounds, empty });
  if (selected) return t('hud.ammo.selectedAria', { name, count: rounds, empty });
  return t('hud.ammo.selectAria', { name, count: rounds, empty });
}

interface EdgeAnchor {
  x: number;
  y: number;
}

// Single-reticle gun mark that leaves the frame rides this far inside the edge.
export const RETICLE_EDGE_MARGIN_PX = 40;

/**
 * round 32 (owner 2026-09-21: "the double reticles is really annoying"): a
 * single-reticle vehicle has no camera cross to fall back on, so a gun mark
 * that leaves the frame — the arcade orbit swung past the arc, or the bore
 * behind the eye — rides the frame edge on the gun's side instead of snapping
 * to screen centre and back (measured 833 px jumps on the Strv 103).
 * `csX/csY` are the mark's camera-space coordinates (x right, y up); `sx/sy`
 * its raw screen projection, valid only when `inFront`.
 */
export function edgeAnchorFor(
  w: number,
  h: number,
  csX: number,
  csY: number,
  inFront: boolean,
  sx: number,
  sy: number,
  margin: number,
  out: EdgeAnchor | null = null,
): EdgeAnchor {
  const anchor = out || { x: 0, y: 0 };
  const dx = inFront ? sx - w * 0.5 : csX;
  const dy = inFront ? sy - h * 0.5 : -csY;
  const halfW = Math.max(1, w * 0.5 - margin);
  const halfH = Math.max(1, h * 0.5 - margin);
  const scale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
  if (scale <= 1e-9) {
    anchor.x = w * 0.5;
    anchor.y = h * 0.5;
    return anchor;
  }
  // a mark behind the eye has no pixel offset, only a side: always push it out to the margin
  const k = !inFront || scale > 1 ? 1 / scale : 1;
  anchor.x = w * 0.5 + dx * k;
  anchor.y = h * 0.5 + dy * k;
  return anchor;
}

/**
 * Resolve the sight anchor without allocating in the live HUD loop. Fixed-mount
 * vehicles (casemate or hydraulic) expose one gun-true sight; turreted tanks
 * retain the separate camera request and physical gun markers.
 */
export function resolveReticleAnchor(
  view: ReticleAnchorInput | null | undefined,
  out: ReticleAnchorState | null = null,
): ReticleAnchorState {
  const result = out || { x: null, y: null, single: false };
  const gunPlaced = Number.isFinite(view?.gunX) && Number.isFinite(view?.gunY);
  result.single = !!view?.singleReticle && gunPlaced;
  result.x = (result.single ? view?.gunX : view?.cx) ?? null;
  result.y = (result.single ? view?.gunY : view?.cy) ?? null;
  return result;
}

/**
 * Normalize authoritative magazine state for the compact reticle indicator.
 * The HUD draws the actual capacity through four shells; larger magazines
 * retain an exact overflow read without turning a four-round rack into +1.
 */
export function autoloaderHudState(
  magazine: MagazineView | null | undefined,
  reload: ReloadView | null | undefined,
  out: AutoloaderHudState | null = null,
  dry = false,
): AutoloaderHudState | null {
  const capacity = Math.max(0, (magazine?.capacity ?? 0) | 0);
  if (capacity <= 1) return null;
  // Owner 2026-10-17 (out of ammo): only rounds stowage can still load ever fill; a dry weapon fills none.
  const feedRaw = magazine?.feed;
  const feedable = dry ? 0
    : feedRaw == null || !(feedRaw < capacity) ? capacity : Math.max(0, Math.floor(feedRaw));
  const rounds = Math.max(0, Math.min(feedable, (magazine?.rounds ?? 0) | 0));
  const reloadTotalS = reload?.totalS ?? 0;
  const reloadRemainingS = reload?.t ?? 0;
  // A cannon magazine reloads as a 'magazine' cycle; a guided rack salvo group (round 41) reloads through the
  // launcher's own 'shell' cycle — both fill the indicator's shells with the same progress read.
  const groupReload = reload?.kind === 'magazine' || (magazine?.launcher === true && reload?.kind === 'shell');
  const fullReload = groupReload && feedable > 0 && reloadTotalS > 0 && reloadRemainingS > 0.001;
  const loadProgress = fullReload
    ? Math.max(0, Math.min(1, 1 - reloadRemainingS / reloadTotalS))
    : 0;
  const state = out || {
    capacity: 0,
    rounds: 0,
    visibleShells: 0,
    readyShells: 0,
    feedShells: 0,
    overflow: 0,
    fullReload: false,
    loadProgress: 0,
    intraClip: false,
    reloading: false,
    dry: false,
  };
  state.capacity = capacity;
  state.rounds = rounds;
  state.visibleShells = Math.min(AUTOLOADER_HUD_SHELLS, capacity);
  state.readyShells = Math.min(state.visibleShells, rounds);
  state.feedShells = Math.min(state.visibleShells, feedable);
  state.overflow = Math.max(0, rounds - state.visibleShells);
  state.fullReload = fullReload;
  state.loadProgress = loadProgress;
  state.intraClip = !dry && reload?.kind === 'intraClip' && reloadRemainingS > 0.001;
  state.reloading = !dry && reloadRemainingS > 0.001;
  state.dry = dry;
  return state;
}

export function autoloaderHudShellPose(
  index: number,
  shellCount: number,
  out: AutoloaderShellPose | null = null,
): AutoloaderShellPose {
  const count = Math.max(1, Math.min(AUTOLOADER_HUD_SHELLS, shellCount | 0));
  const safeIndex = Math.max(0, Math.min(count - 1, index | 0));
  const center = (count - 1) * 0.5;
  const normalized = center > 0 ? (safeIndex - center) / center : 0;
  const pose = out || { y: 0, rotation: 0 };
  pose.y = (1 - Math.abs(normalized)) * AUTOLOADER_HUD_ARC_DEPTH;
  pose.rotation = -normalized * AUTOLOADER_HUD_OUTER_ROTATION;
  return pose;
}

interface MarkBox { x0: number; y0: number; x1: number; y1: number }
const rackShellBoxScratch: MarkBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
/** The box of a rack shell's dark contour (magazineShellPath turned by `rotation` about its centre, padded 1.5 px). */
function magazineShellBox(cx: number, cy: number, rotation: number, shellW: number, shellH: number, out: MarkBox): MarkBox {
  const cos = Math.cos(rotation); const sin = Math.sin(rotation);
  const hw = shellW * 0.5; const hh = shellH * 0.5;
  out.x0 = Infinity; out.y0 = Infinity; out.x1 = -Infinity; out.y1 = -Infinity;
  for (let k = 0; k < 7; k++) {
    // magazineShellPath's seven points, relative to the shell's centre
    const px = (k === 0 ? 0 : k <= 2 ? hw : k === 3 ? shellW * 0.22 : k === 4 ? -shellW * 0.22 : -hw);
    const py = (k === 0 ? -hh : k === 1 || k === 6 ? shellH * 0.28 - hh : k === 2 || k === 5 ? shellH * 0.82 - hh : hh);
    const x = cx + px * cos - py * sin; const y = cy + px * sin + py * cos;
    if (x < out.x0) out.x0 = x; if (x > out.x1) out.x1 = x; if (y < out.y0) out.y0 = y; if (y > out.y1) out.y1 = y;
  }
  out.x0 -= 1.5; out.y0 -= 1.5; out.x1 += 1.5; out.y1 += 1.5;
  return out;
}

function magazineShellPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shellW: number,
  shellH: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + shellW * 0.5, y);
  ctx.lineTo(x + shellW, y + shellH * 0.28);
  ctx.lineTo(x + shellW, y + shellH * 0.82);
  ctx.lineTo(x + shellW * 0.72, y + shellH);
  ctx.lineTo(x + shellW * 0.28, y + shellH);
  ctx.lineTo(x, y + shellH * 0.82);
  ctx.lineTo(x, y + shellH * 0.28);
  ctx.closePath();
}

function hitConfirmShardPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ca: number,
  sa: number,
  radius: number,
  length: number,
  halfWidth: number,
  pad = 0,
): void {
  const px = -sa;
  const py = ca;
  const inner = radius - pad;
  const near = radius + length * 0.28;
  const far = radius + length * 0.78;
  const outer = radius + length + pad;
  const shoulderWidth = halfWidth + pad;
  const tailWidth = halfWidth * 0.45 + pad * 0.55;

  ctx.beginPath();
  ctx.moveTo(cx + ca * inner, cy + sa * inner);
  ctx.lineTo(cx + ca * near + px * shoulderWidth, cy + sa * near + py * shoulderWidth);
  ctx.lineTo(cx + ca * far + px * tailWidth, cy + sa * far + py * tailWidth);
  ctx.lineTo(cx + ca * outer, cy + sa * outer);
  ctx.lineTo(cx + ca * far - px * tailWidth, cy + sa * far - py * tailWidth);
  ctx.lineTo(cx + ca * near - px * shoulderWidth, cy + sa * near - py * shoulderWidth);
  ctx.closePath();
}
// MOBILE-UX r1 (owner: "don't let the reticle grow too large — it should only
// show the actual hit zones of shells"): the dispersion circle now draws the
// TRUE 2σ cone. computeDispersionRadM is the radius shells are re-rolled
// into (ballistics.applyDispersion never places a shot outside it), and
// aimView.radPx is that radius projected at the aim distance under the LIVE
// zoomed FOV — so the ring carries the same angular truth at every zoom step.
// The old ×3.2 stylization, the 0.7 post-shot display pulse (the sim's
// afterShot bloom already rides bloomF → radPx) and the 34 px floor drew
// cones the shells never fly. What remains is a pure DISPLAY clamp:
//   floor   — a usable aiming mark when the true cone is sub-pixel at range;
//   ceiling — full bloom on a close target (or high sniper magnification)
//             can never balloon past ~15% of the frame's short side.
const RET_FLOOR_PX = 11;
const RET_CEIL_FRAC = 0.15;
// Shared type system (see src/ui/fonts.ts): FONT_COND drives the numeral/label
// hierarchy (weight floor 500); readouts that tick in place take the .num class.
import { FONT_STACK, FONT_COND, ensureFonts } from './fonts.ts';
import { A11Y } from './accessibilityPreferences.ts';
import { uiIconSVG } from './uiIcons.ts';
import type { IconId } from './icons/icon.ts';
// the alert band's line is the kit's notice queue (premiere-site's primitive, components/notice.ts)
import { NoticeQueue, type QueuedToast } from './components/notice.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';
import { setAttr, setData, setDisabled, setHidden, setText } from './domWrite.ts';
import { CONSUMABLE_READY_MARK, cooldownRemaining } from '../game/consumables.ts';
import {
  BATTLE_CONSUMABLES_EVENT, CONSUMABLE_ICONS, DEFAULT_CONSUMABLE_LOADOUT, consumableNameKey, isConsumableId,
  type ConsumableId,
} from '../game/consumableLoadout.ts';
import { consumableTiming } from '../sim/matchRuleset.ts';
// Pre-rendered tank icons (tools/genIcons.mjs): side silhouettes drive the
// kill feed + ambient nameplates. Minimap blips and team-panel rows use the
// vector vehicle-silhouette/arrow language instead (WoT reads shape + heading, not
// per-vehicle profiles, at those sizes).
import { maskIcon } from './icons.ts';
import { liveToken } from './tokens/tokens.ts';
import { tokenEpoch } from './tokens/tokenSelection.ts';
import { moduleAlertLabel } from './moduleRegistry.ts';
import { tierNumeral } from '../techTree/tiers.ts';
// SHOT-INFO SECTION: combat-intelligence panels (shot cards, armor diagrams,
// incoming toasts, shot log, session stats) — logic lives in src/ui/shotInfo.ts.
import { createShotInfo } from './shotInfo.ts';
// brand-ui H3: the team strip under the score and the kill ribbon (the direction's 06-battle-hud.html .pips, .sectors,
// .ribbon)
import { createTeamPips } from './hudTeamPips.ts';
import { createKillRibbon } from './hudKillRibbon.ts';
import { plateObstacles, sightFurniture, sightFurnitureGap, sightFurnitureRise, sightNoticeCuts, sightNoticeGap, worldPlateGap,
  worldPlateSink } from './sightFurniture.ts';
import { hitOutcomeFor, incomingHitFeedbackFor } from './hitEventFormat.ts';
import {
  SPECIAL_ACTION_KINDS,
  guidedMissileSlot,
  specialActionIsActive,
} from '../sim/specialActions.ts';

// module-scope scratch (no per-frame allocation)
const _mInv = new THREE.Matrix4();
const _cs = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _edgeAnchor: EdgeAnchor = { x: 0, y: 0 }; // single-sight frame-edge fallback (round 32)
const _tmp = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _reticleAnchor: ReticleAnchorState = { x: 0, y: 0, single: false };
const aimWarningScratch: AimWarningState = { visible: false, kind: '', text: '' };
/** The parked chip's id in the battle's notice region (battleNotices.ts: the kit's notice, UI-LOCKDOWN B14). */
const AIM_NOTICE_ID = 'cot-aim-warning';
// (the region loads with the first parked chip, as the pointer lock's notice loads it: pointerLockFeedbackRuntime.ts)
let aimNoticePort: Promise<BattleNoticePort> | null = null;
const aimNotices: BattleNoticePort = {
  show(options) {
    aimNoticePort ??= import('./battleNotices.ts').then((module) => module.battleNotices);
    void aimNoticePort.then((port) => { port.show(options); }, () => {});
  },
  dismiss(id) {
    if (aimNoticePort) void aimNoticePort.then((port) => { port.dismiss(id); }, () => {});
  },
};
const MODULE_ALERT_ICON_IDS = new Set([
  'gun', 'turretRing', 'gunMount', 'autoloader', 'feedSystem', 'missileRack', 'roofGun',
  'engine', 'transmission', 'fuelTank', 'ammoRack', 'radio', 'optics',
]);

function moduleAlertIcon(moduleId: string): string {
  if (moduleId === 'trackL' || moduleId === 'trackR') return 'track';
  return MODULE_ALERT_ICON_IDS.has(moduleId) ? moduleId : 'damage';
}

// spotting model (WoT-style): max spot range + persistence after LOS is lost
// camo_spotting r3: import the sim's constants instead of duplicating them —
// hardcoded copies drifted on every retune (persist 4 vs the sim's 5).
import { MAX_SPOT_RANGE_M as SPOT_RANGE_M, SPOT_LINGER_S as SPOT_PERSIST_S }
  from '../sim/spotting.ts';
// SPOTTING SECTION: single source of truth for the sixth-sense timing —
// the lamp fuse/window MUST match the sim's getConcealment display gate.
import { SIXTH_SENSE_DELAY_S, SIXTH_SENSE_SHOW_S } from '../sim/spotting.ts';
// The battle clock is the ruleset's: the frame carries timeLimitS (solo), otherwise the mode's own
// ruleset answers; null means no clock (Endless Horde counts up).
function battleClockLimitS(frame: HudFrame, modeId: string | null | undefined): number | null {
  if (frame.timeLimitS !== undefined) return frame.timeLimitS;
  return matchRulesetFor(normalizeGameMode(modeId || 'standard')).timeLimitS;
}

function clockText(frame: HudFrame, limitS: number | null): string {
  return limitS == null ? fmtTimer(frame.timeS) : fmtTimer(limitS - frame.timeS);
}

// Default shell card data (used only when a forced screenshot aim view arrives
// before any live frame — matches the m1a1_abrams_hc default player loadout).
const DEFAULT_SHELLS: HudShellCard[] = [
  { name: 'M829A4', type: 'APFSDS', dmg: 540, penLabel: '750 mm' },
  { name: 'M830A1', type: 'HEAT', dmg: 480, penLabel: '600 mm' },
  { name: 'M1147', type: 'HE', dmg: 600, penLabel: '60 mm' },
];

// slot underline per shell CLASS (r6-2): silver = kinetic (AP/APCR/APFSDS),
// orange = chemical (HEAT), olive = high-explosive — WoT's ammo color read
const SHELL_CLASS_UNDERLINE: Readonly<Record<string, string>> = {
  AP: 'rgba(205,216,226,.85)', APCR: 'rgba(205,216,226,.85)',
  APFSDS: 'rgba(205,216,226,.85)',
  HEAT: 'rgba(240,138,74,.9)', HE: 'rgba(154,165,90,.9)',
};
const SHELL_DEFAULT_COUNT: Readonly<Record<string, number>> = {
  AP: 24, APCR: 20, APFSDS: 24, HEAT: 16, HE: 12,
};

export function ammunitionSlotViewState(
  shell: HudShellCard | null | undefined,
  selected = false,
): { count: number; empty: boolean; selected: boolean; unlimited: boolean } {
  const fallback = SHELL_DEFAULT_COUNT[String(shell?.type || '')] ?? 20;
  const raw = shell?.count != null ? Number(shell.count) : fallback;
  const count = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
  // round 32: unlimited rounds (Turbo Ball) keep the loadout shape but never read as empty
  const unlimited = shell?.unlimited === true;
  return { count, empty: !unlimited && count <= 0, selected: !!selected, unlimited };
}

/** What the shell selector and the sniper readout print for a slot: the count, or ∞ under unlimited rounds. */
function ammunitionCountText(shell: HudShellCard | null | undefined): string {
  const view = ammunitionSlotViewState(shell);
  return view.unlimited ? '∞' : String(view.count);
}

function shellCount(shell: HudShellCard): number {
  return ammunitionSlotViewState(shell).count;
}

// Roster identity: WoT rows read "Nickname (Vehicle)" with a tier numeral. Bot nicknames come from botCallsigns.ts,
// assigned over the frame's tanks in their order (the battle load's cards name them alike), the player is Claude.
const PLAYER_NICK = PLAYER_CALLSIGN;

// minimap grid letters (WoT convention skips "I")
const GRID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];

// hud_ui r5 MAJOR: ONE monochrome silhouette language across the whole tray —
// every consumable is a flat white ~85%-alpha pictogram with no second color
// and no per-icon shading (the old red-cross medkit / red extinguisher read
// as mixed-style clip-art next to the shells). Color lives ONLY in the shell
// type labels and the selected-slot border.
const TRAY_INK = 'rgba(238,244,250,0.86)';
// The consumables (2026-10-26, the catalog: sim/consumableRules.ts): each tile shows its slot's item. The battle
// announces the player's loadout (BATTLE_CONSUMABLES_EVENT) and the tiles swap their glyph and names; the item ids and
// their names stay apart, so the sim/network layer never depends on i18n.
const CONSUMABLE_KEYS = ['4', '5', '6'] as const;
const consumableLabel = (id: string): string => t(consumableNameKey(id));
// (the item's badge, framed in its category's colour: one icon source per item, the Garage's and the tray's, Main 261)
const consumableSvg = (id: ConsumableId): string => consumableIconSVG(id, 20, TRAY_INK);

// Procedural shell artwork for the ammo slots: one consistent silhouette
// language across the loadout — every icon is a vertical projectile of the
// SAME height, drawn as a flat white ~85%-alpha silhouette (matching the
// consumable pictograms). Only the nose/body profile differs (the WoT read):
//   AP/APCR  sharp ogive           HEAT  tapered cone + standoff probe
//   APFSDS   finned dart in sabot  HE    fat blunt round-nose
/** The shell artwork's design square: each tray's CSS sizes the canvas (46 px × --shell-k) and uiCanvas maps it there. */
const SHELL_ICON_UNITS = 46;
function drawShellIcon(c: CanvasRenderingContext2D, type: string): void {
  const S = SHELL_ICON_UNITS;
  c.clearRect(0, 0, S, S);
  const cx = S / 2;
  const TOP = 4, BOT = 42; // shared silhouette extents — uniform set

  // body path per type (projectile silhouette, tip at TOP, base at BOT)
  function bodyPath(): void {
    c.beginPath();
    if (type === 'APFSDS') {
      const rw = 2.0; // rod half-width
      c.moveTo(cx, TOP);                       // needle tip
      c.lineTo(cx + rw, TOP + 7);
      c.lineTo(cx + rw, BOT - 7);
      c.lineTo(cx + rw + 4.5, BOT);            // right fin
      c.lineTo(cx + rw + 4.5, BOT); c.lineTo(cx + 1, BOT - 1.5);
      c.lineTo(cx - 1, BOT - 1.5); c.lineTo(cx - rw - 4.5, BOT); // left fin
      c.lineTo(cx - rw, BOT - 7);
      c.lineTo(cx - rw, TOP + 7);
    } else if (type === 'HEAT') {
      // r6-2 (round critique: "HEAT and HE read as the same blunt cylinder"):
      // HEAT is now an unmistakable SPIKE — slim standoff probe into one
      // long straight cone that only reaches full caliber at the boat-tail
      c.moveTo(cx - 1.2, TOP);                 // probe cap
      c.lineTo(cx + 1.2, TOP);
      c.lineTo(cx + 1.2, TOP + 5);             // standoff probe
      c.lineTo(cx + 2.8, TOP + 7);             // cone shoulder
      c.lineTo(cx + 6.2, BOT - 5);             // long straight taper
      c.lineTo(cx + 6.2, BOT - 2.5);
      c.lineTo(cx + 4.6, BOT);                 // boat-tail
      c.lineTo(cx - 4.6, BOT);
      c.lineTo(cx - 6.2, BOT - 2.5);
      c.lineTo(cx - 6.2, BOT - 5);
      c.lineTo(cx - 2.8, TOP + 7);
      c.lineTo(cx - 1.2, TOP + 5);
    } else if (type === 'HE') {
      // r6-2: FAT drum with a nearly flat dome + fuze step — max contrast
      // against the HEAT spike and the kinetic ogives
      c.moveTo(cx - 9, BOT);
      c.lineTo(cx - 9, TOP + 16);
      c.quadraticCurveTo(cx - 8.6, TOP + 7, cx - 3.4, TOP + 4.6); // blunt shoulder
      c.lineTo(cx - 2.2, TOP + 2.2);           // fuze step
      c.lineTo(cx + 2.2, TOP + 2.2);
      c.lineTo(cx + 3.4, TOP + 4.6);
      c.quadraticCurveTo(cx + 8.6, TOP + 7, cx + 9, TOP + 16);
      c.lineTo(cx + 9, BOT);
    } else {
      // AP / APCR: classic sharp ogive
      const hw = type === 'APCR' ? 6 : 7;
      c.moveTo(cx - hw, BOT);
      c.lineTo(cx - hw, TOP + 13);
      c.quadraticCurveTo(cx - hw * 0.82, TOP + 4, cx, TOP);
      c.quadraticCurveTo(cx + hw * 0.82, TOP + 4, cx + hw, TOP + 13);
      c.lineTo(cx + hw, BOT);
    }
    c.closePath();
  }

  // fill: ONE flat white ~85%-alpha silhouette (hud_ui r5 MAJOR — the old
  // steel gradient with per-type color tints and orange bands read as
  // mixed-style clip-art). Only the nose/body PROFILE distinguishes the
  // types; color is reserved for the type text label and the selected-slot
  // border.
  bodyPath();
  c.fillStyle = 'rgba(238,244,250,0.86)';
  c.fill();
  // knocked-out driving-band grooves (shape detail without a second color):
  // kinetic ogives + HE carry a base band; HEAT wears its classic MID-BODY
  // ring so the cone reads segmented (r6-2 distinct-silhouette pass)
  if (type !== 'APFSDS') {
    c.save();
    bodyPath();
    c.clip();
    c.globalCompositeOperation = 'destination-out';
    if (type === 'HEAT') c.fillRect(cx - 8, 23.5, 16, 1.6);
    else c.fillRect(cx - 10, BOT - 8.5, 20, 1.6);
    if (type === 'HE') c.fillRect(cx - 10, BOT - 12.5, 20, 1.2);
    c.restore();
  }
  // APFSDS: sabot petals in the SAME ink, dimmer, so the dart reads through
  if (type === 'APFSDS') {
    c.fillStyle = 'rgba(238,244,250,0.5)';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 2.6, 17);
      c.lineTo(cx + s * 7.2, 24);
      c.lineTo(cx + s * 7.2, 31);
      c.lineTo(cx + s * 3.2, 27.5);
      c.closePath();
      c.fill();
    }
  }
  // crisp dark keyline of uniform weight unifies the set on the slot plate
  bodyPath();
  c.strokeStyle = 'rgba(8,12,16,0.7)';
  c.lineWidth = 1;
  c.stroke();
}

// Team-panel row icon: the tank's actual side-profile silhouette (generated
// from the shipped model by tools/genIcons.mjs), tinted via CSS mask.
// Unspotted enemies dim to a ghost of the same shape (WoT reads "known but
// not visible").

const HUD_CSS = `
.cot-hud{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:${FONT_STACK};isolation:isolate;
  --hud-panel:var(--hud-plate,rgba(13,16,20,.92));--hud-edge:var(--line-3,rgba(246,243,236,.24));
  --hud-muted:var(--ink-3,#9a9a95);--hud-text:var(--ink-1,#f6f3ec);--hud-action:var(--accent,#f0a030);--hud-danger:var(--danger);
  --hud-own:var(--team-own);--hud-enemy:var(--team-enemy);
  --hud-plate-ring:var(--battle-plate-shadow);
  --hud-layer-world:var(--z-hud-world,6);--hud-layer-sight:var(--z-hud-sight,8);--hud-layer-status:var(--z-hud-status,18);
  --hud-layer-controls:var(--z-hud-controls,24);--hud-layer-score:var(--z-hud-score,30);
  -webkit-user-select:none;user-select:none;color:var(--hud-text);overflow:hidden;}
/* (the kit picker's parts keep the kit's own box: this surface reset outranks its components layer, and zeroed the
   spectator bar's list rows to their edges; :where keeps the reset's weight where it applies) */
.cot-hud :where(:not(.cot-c-picker, .cot-c-picker *)){box-sizing:border-box;margin:0;padding:0;}
.cot-ret{position:absolute;z-index:var(--hud-layer-sight);inset:0;width:100%;height:100%;display:block;}
.cot-ret-text{z-index:var(--hud-layer-sight);}
/* (ac130-fx-228 r3) the gunship's hit-confirm mark: its own small canvas on the sight (hud.ts paintAerialHitMark) */
.cot-hitmark{position:absolute;z-index:var(--hud-layer-sight);left:0;top:0;width:${HIT_MARK_BOX_PX}px;height:${HIT_MARK_BOX_PX}px;
  display:none;pointer-events:none;}
/* The score plate (brand-ui H1, the direction's 06-battle-hud.html .score): a trapezoid on the HUD plate hung from the
   window's top edge (owner 2026-10-24: "make the trapezoid on top of score be attached to top of screen"), hugging what
   it holds (owner 2026-10-25: "AND MAKE THIS TOP THING LESS SO BIG AND WIDE"): each side's points beside a short bar of
   its share of what wins it, the clock between them, and the team strip's pips along its lower edge where they show
   (hudTeamPips.ts). It is the top band's height (--hud-band-h), as the corner plates beside it are (the mission plate
   left, the readout and the settings gear right: battleHudLayout.css). */
.cot-hud{--hud-band-h:44px;}
.cot-top{position:absolute;z-index:var(--hud-layer-score);top:0;left:50%;transform:translateX(-50%);
  width:max-content;max-width:min(400px,calc(100vw - 24px));min-height:var(--hud-band-h);
  display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-content:center;align-items:center;
  column-gap:var(--s3);row-gap:3px;padding:var(--s1) 30px 5px;isolation:isolate;overflow:hidden;
  background:var(--hud-plate);border-radius:0;
  clip-path:polygon(0 0,100% 0,calc(100% - 16px) 100%,16px 100%);}

.cot-top .sc,.cot-top .tm-block{position:relative;z-index:1;}
.cot-top .sc{display:flex;align-items:center;justify-content:flex-end;gap:var(--s2);min-width:0;}
.cot-top .sc.enemy{flex-direction:row-reverse;}
/* the side carries the team; a label shows only where it says more (the Horde's wave and remaining) */
.cot-top .team-label[data-default]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
.cot-top .team-label,.cot-top .tm-label{font-family:${FONT_COND};font-size:var(--battle-fs-11);font-weight:700;
  line-height:1;letter-spacing:var(--track-label-s);text-transform:uppercase;color:var(--ink-3);white-space:nowrap;}
/* (two figures' width held, so a score reaching 10 does not widen the plate) */
.cot-top .fg,.cot-top .fe,.cot-top .fh b{font-family:${FONT_COND};font-size:24px;font-weight:700;line-height:1;
  letter-spacing:0;min-width:2ch;}
.cot-top .fg{color:var(--hud-own);text-align:right;}
/* (the Horde's wave is no side's score: in the ink, the hostiles left beside it in the enemy's, gauntlet r4) */
.cot-top .fg.wave{color:var(--ink-1);}
/* (and no gauge either side, each keeping its place: a team-blue dash by the wave number measured nothing, gauntlet r5; the
   wave's own bar alone left the plate lopsided and the wave against the clock, "3 1:00", r6) */
.cot-top:has(.fg.wave) .sc .bar{visibility:hidden;}
.cot-top .fe{color:var(--hud-enemy);white-space:nowrap;}
/* each side's share of what wins it (the kills of the other side's tanks, or the mode's score target), drawn by
   transform alone and written only when the score moves; the track carries its side's ink, so an early score reads as
   a gauge, never as an empty slot (H1 critics), and any point on the board shows a stub (setScoreBars) */
.cot-top .sc .bar{position:relative;flex:none;width:28px;height:3px;overflow:hidden;
  background:color-mix(in srgb,var(--hud-own) 24%,transparent);}
.cot-top .sc.enemy .bar{background:color-mix(in srgb,var(--hud-enemy) 24%,transparent);}
.cot-top .sc .bar i{display:block;height:100%;transform:scaleX(var(--p,0));transform-origin:left;
  transition:transform var(--dur-base) var(--ease-enter);}
.cot-top .sc.ally .bar i{background:var(--hud-own);}
.cot-top .sc.enemy .bar i{background:var(--hud-enemy);transform-origin:right;}
.cot-top .fe .of{font-size:.5em;font-weight:700;letter-spacing:0;margin-left:2px;opacity:.82;}
.cot-top .fh{display:none;align-items:center;gap:var(--s2);}
.cot-top .fh b{min-width:0;color:var(--hud-enemy);}
.cot-top .tm-block{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;}
.cot-top .tm-block .tm{order:1;}.cot-top .tm-block .tm-label{order:2;}
.cot-top .tm-label{font-family:var(--font-body);font-weight:500;letter-spacing:0;text-transform:none;color:var(--ink-3);}
.cot-top .tm-label:empty{display:none;}
.cot-top .tm{font:500 18px/1 var(--font-mono);color:var(--ink-1);letter-spacing:.02em;}
/* battle endings (2026-09-25): the clock flashes amber through the time's-up beat */
.cot-top.times-up .tm{color:var(--warn);animation:cotTimesUp var(--dur-screen) steps(1,end) 7;}
.cot-top.times-up .tm-label{color:var(--warn);}
@keyframes cotTimesUp{50%{opacity:.18;}}
.cot-mode-status{position:absolute;z-index:var(--hud-layer-score);top:64px;left:50%;transform:translateX(-50%);
  min-height:28px;display:none;align-items:center;gap:var(--s2);padding:5px 11px;color:var(--ink-1);
  background:var(--hud-plate);border:1px solid var(--line-2);box-shadow:0 5px 14px oklch(from var(--surface-scene) l c h / .38);
  font:700 var(--battle-fs-11) ${FONT_COND};letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;}
.cot-mode-status.show{display:flex}.cot-mode-status .mi,.cot-mode-status .mi svg{display:block;width:15px;height:15px}
.cot-mode-status .mi{color:var(--mode-ink,var(--accent))}.cot-mode-status .mv{color:var(--ink-1);}
/* the mission plate (brand-ui H3, the direction's .mission): under the score it is the objective row; the corner seat
   (battleHudLayout.css data-objective-seat=corner) shows the mode's name over it, the link's ping and the Tab key */
.cot-mode-status .mt{display:contents}.cot-mode-status :is(.mn,.cot-c-kbd){display:none}
/* Compact player telemetry: bare HUD text (no box, no border), as the
   multiplayer network strip beside it in the same corner row. The
   engineering dashboard folds this strip into its richer top-right panel
   instead of allowing two readouts to overlap. */
.cot-net{position:absolute;z-index:var(--hud-layer-controls);top:8px;right:10px;display:flex;align-items:center;
  min-height:28px;padding:var(--s1) 0;font-family:${FONT_COND};
  text-transform:uppercase;text-shadow:0 1px 3px var(--surface-scene),0 0 5px var(--surface-scene);}
.cot-net-unit{min-width:42px;display:grid;grid-template-columns:auto auto;align-items:baseline;
  justify-content:center;column-gap:var(--s1);color:var(--ink-1);}
.cot-net-unit+.cot-net-unit{margin-left:7px;padding-left:var(--s2);}
.cot-net .metric{font-size:var(--battle-fs-11);font-weight:700;line-height:1;letter-spacing:.02em;}
.cot-net .label{font-size:var(--battle-fs-11);font-weight:700;line-height:1;letter-spacing:.03em;color:var(--ink-2);}
.cot-net-unit.good .metric{color:var(--ok)}.cot-net-unit.warn .metric{color:var(--warn)}
.cot-net-unit.bad .metric{color:var(--danger)}.cot-net-unit.local .metric{color:var(--ink-2);font-size:var(--battle-fs-11);letter-spacing:.01em}
body.cot-debug-hud .cot-net{display:none!important;}
/* (249, the owner's performance push) The plates are their own layout and paint roots: a count, a name or a row that
   changes relayouts and repaints its plate, never the HUD around it. Paint containment only where nothing draws past
   the plate (the ammo slots' hover cards do: layout only there; the controls row's buttons are static, and their
   overlays place against the row, so they keep no containment). */
.cot-top,.cot-ear,.cot-kill-lane,.cot-net,.cot-mode-status{contain:layout paint;}
.cot-shell,.cot-con,.cot-minimap{contain:layout;}
/* The top-right corner (hud.ts netEl): the readout's units once measured (.metered), the link's ping in a networked
   battle (the meter's own ping cell carries it while that shows), the settings gear and its key. */
.cot-net-units{display:flex;align-items:center;}
.cot-net:not(.metered) .cot-net-units{display:none;}
.cot-hud-gear{display:inline-flex;align-items:center;gap:var(--s2);height:32px;padding:0 var(--s1);border:0;border-radius:var(--r1);
  background:transparent;color:var(--ink-2);font:inherit;cursor:pointer;pointer-events:auto;}
.cot-hud-gear:hover{color:var(--ink-1);}
.cot-hud-gear .cot-c-kbd{display:none;font-size:var(--battle-fs-11);}
.cot-net.metered .cot-hud-gear{padding-left:var(--s3);border-left:1px solid var(--line-2);border-radius:0;}
/* One link readout (owner 2026-10-25: "the ping or wifi is duplicated in the top right"; Main's ruling): in a networked
   battle the network strip owns the link (multiplayerStatus.ts sets body.cot-mp-battle while it is up: its health, seat and
   roster, and its details panel), so the corner drops its link chip and the meter reads its fps alone. A body class, never
   a body:has() (a whole-page restyle on every write). Solo battles keep the corner as it was. */
body.cot-mp-battle .cot-net-unit.ping{display:none;}
body.cot-mp-battle .cot-net:not(.metered) .cot-hud-gear{padding-left:var(--s1);border-left:0;border-radius:var(--r1);}
/* touch: the readout keeps its own place (battleHudLayout.css), the gear is the toolbar's (touchControls.ts) */
body.cot-touch-layout .cot-net:not(.metered){display:none;}
body.cot-touch-layout .cot-hud-gear{display:none;}
/* Circular analog speedometer beside the damage schematic. The 270° sweep
   leaves a quiet lower gap for the numeric speed and physical limit. */
.cot-drive{position:absolute;z-index:var(--hud-layer-controls);left:169px;bottom:16px;
  width:108px;height:108px;border-radius:50%;pointer-events:none;overflow:hidden;
  contain:layout paint style;
  font-family:${FONT_COND};color:var(--ink-1);
  background:var(--hud-plate);border:0;box-shadow:var(--hud-plate-ring);}
.cot-drive .dial{position:absolute;inset:5px;border-radius:50%;isolation:isolate;
  background:transparent;}
.cot-drive .dial::after{content:'';position:absolute;z-index:0;inset:7px;border-radius:50%;
  background:var(--fill-faint);box-shadow:var(--ring-1);}
.cot-drive .arc{position:absolute;z-index:1;inset:0;width:100%;height:100%;overflow:visible;}
.cot-drive .arc circle{fill:none;stroke-width:3;}
.cot-drive .arc-track{stroke:var(--fill-scale);stroke-dasharray:75 25;}
.cot-drive .arc-value{stroke:var(--ink-1);stroke-dasharray:0 100;
  }
.cot-drive .arc-red{stroke:var(--danger);stroke-dasharray:15 85;stroke-dashoffset:-60;}
.cot-drive .ticks{position:absolute;z-index:2;inset:0;border-radius:50%;}
.cot-drive .ticks i{position:absolute;left:calc(50% - .5px);top:8px;width:1px;height:6px;
  transform-origin:50% 41px;transform:rotate(calc(-135deg + var(--tick) * 13.5deg));
  background:var(--ink-2);}
.cot-drive .ticks i:nth-child(5n + 1){left:calc(50% - 1px);width:2px;height:9px;background:var(--ink-1);}
.cot-drive .ticks i:nth-last-child(-n + 5){background:var(--danger);}
.cot-drive .needle{position:absolute;z-index:2;left:50%;top:50%;width:2px;height:35px;
  margin:-35px 0 0 -1px;transform-origin:50% 100%;rotate:-135deg;
  transition:rotate var(--dur-instant) linear;will-change:transform;
  background:var(--danger);}
.cot-drive .hub{position:absolute;z-index:4;left:50%;top:50%;width:8px;height:8px;
  margin:-4px 0 0 -4px;border-radius:50%;background:var(--ink-1);border:2px solid var(--danger);}
.cot-drive .speed{position:absolute;z-index:3;left:0;right:0;top:58px;text-align:center;
  font-size:26px;line-height:1;font-weight:700;letter-spacing:-.04em;}
/* The unit sits in the upper face under the 12 o'clock tick, so the lower gap holds the speed and the scale's two
   ends, each just under its arc end and clear of the ticks (11 px labels; the dial is 108 px). */
.cot-drive .unit{position:absolute;z-index:3;left:0;right:0;top:25px;text-align:center;
  font-size:var(--battle-fs-11);font-weight:700;letter-spacing:.05em;color:var(--ink-2);}
.cot-drive .zero,.cot-drive .limit{position:absolute;z-index:3;bottom:12px;font-size:var(--battle-fs-11);
  line-height:1;}.cot-drive .zero{left:25px;color:var(--ink-3)}.cot-drive .limit{right:25px;color:var(--danger)}
@media (prefers-reduced-motion:reduce){
  .cot-drive .arc-value,.cot-drive .needle{transition:none;}
}
.cot-ear{position:absolute;z-index:var(--hud-layer-status);top:var(--hud-ears-top,calc(var(--hud-band-h) + 8px));width:194px;display:flex;flex-direction:column;gap:1px;max-height:28vh;}
.cot-ear.l{left:0;}
.cot-ear.r{right:0;top:var(--hud-roster-top-right,var(--hud-ears-top,calc(var(--hud-band-h) + 8px)));}
.cot-ear .hd{flex-shrink:0;font-size:var(--battle-fs-11);font-weight:700;letter-spacing:.13em;color:var(--ink-3);
  font-family:${FONT_COND};
  text-transform:uppercase;padding:var(--s1) 10px;display:flex;justify-content:space-between;
  text-shadow:var(--battle-text-halo);}
/* (the sides' counts are the score plate's pips where they show: hudTeamPips.ts .cot-top .cot-pips-row) */
body:not(.cot-touch-layout):is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall']) .cot-hud.pips-count:not(.range-mode):not(.aerial-active) .cot-ear .hd .al{visibility:hidden}
.cot-ear.l .hd{border-left:2px solid var(--hud-own);}
.cot-ear.r .hd{border-right:2px solid var(--hud-enemy);text-align:right;}
.cot-er{display:flex;align-items:center;gap:5px;padding:3px 10px var(--s1) var(--s2);font-size:var(--battle-fs-11);
  font-weight:600;letter-spacing:.02em;color:var(--ink-1);position:relative;
  text-shadow:var(--battle-text-halo);}
/* The rows carry no plate (owner 2026-10-24: "dont have the black background behind allied or enemy tanks"): the
   team's edge, the silhouette's own shadow and the names' halo hold them over the battlefield. */
.cot-ear.l .cot-er{border-left:2px solid var(--hud-own);}
/* battle_hud r1: the right ear is a TRUE mirror of the left — row-reverse
   flips the flex order but not the padding, so the enemy silhouette sat
   10px off its edge vs the ally's 8px. Mirrored padding keeps both panels'
   row metrics identical. */
.cot-ear.r .cot-er{padding:3px var(--s2) var(--s1) 10px;
  border-right:2px solid var(--hud-enemy);flex-direction:row-reverse;}
.cot-er .ic{width:var(--ear-ic-w,29px);height:14px;flex:0 0 auto;display:block;
  filter:drop-shadow(0 1px 1px oklch(from var(--surface-scene) l c h / .78));}
/* Generated side silhouettes face right. Mirror only the enemy ear so both
   rosters point inward toward the battlefield instead of toward the bezel. */
.cot-ear.r .cot-er .ic{transform:scaleX(-1);}
.cot-ear.l .cot-er .ic{color:var(--hud-own);}.cot-ear.r .cot-er .ic{color:var(--hud-enemy);}
.cot-er .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;
  display:flex;flex-direction:column;gap:0;line-height:1.15;}
.cot-ear.r .cot-er .n{text-align:right;align-items:flex-end;}
.cot-er .n .nick{font-size:var(--battle-fs-11);font-weight:700;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;max-width:100%;}
.cot-er .n .veh{font-size:var(--battle-fs-11);font-weight:600;color:var(--ink-3);letter-spacing:0em;
  font-family:${FONT_COND};text-transform:uppercase;
  max-width:100%;display:flex;gap:var(--s1);align-items:baseline;}
.cot-ear.r .cot-er .n .veh{justify-content:flex-end;}
/* r7: BARE roman tier numeral next to the vehicle name (WoT) — the boxed
   badge chips read as foreign UI furniture in the blind side-by-side.
   battle_hud r1: the numeral gets a fixed column (min-width covers 'VIII')
   so tiers ALIGN down the panel instead of ragged-leading each name; on the
   right ear it mirrors to the outer edge (order swap) so both panels carry
   an aligned tier column on their outboard side. */
.cot-er .n .veh .tier{flex:0 0 auto;font-weight:700;color:var(--ink-2);
  font-style:normal;letter-spacing:.04em;min-width:23px;}
.cot-ear.r .cot-er .n .veh .tier{order:2;text-align:right;}
.cot-er .n .veh .vn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* Jev commander (2026-09-25): the tag a Jev-commanded bot carries beside its vehicle name */
.cot-er .n .veh .brain{flex:0 0 auto;font-style:normal;font-weight:700;font-size:var(--battle-fs-11);letter-spacing:.01em;
  color:var(--info);border:1px solid var(--line-3);border-radius:3px;padding:0 3px;line-height:1.3;}
.cot-er .n .veh .brain[hidden]{display:none;}
.cot-er.me .n .nick{color:var(--accent-hi);}
/* r5-2: per-row HP moved OFF the full-width underline (round critique:
   "thin HP strip under every row is XVM-mod flavor, not stock WoT") onto a
   slim vertical gauge hugging each row's INNER edge — quiet enough to pass
   as panel furniture, still carries the health read. Fill grows upward. */
.cot-er .hpm{position:absolute;top:2px;bottom:2px;width:3px;
  background:var(--line-1);display:flex;flex-direction:column;
  justify-content:flex-end;}
.cot-ear.l .cot-er .hpm{right:0;}
.cot-ear.r .cot-er .hpm{left:0;}
.cot-er .hpm i{display:block;width:100%;height:100%;}
.cot-ear.l .cot-er .hpm i{background:var(--hud-own);}
.cot-ear.r .cot-er .hpm i{background:var(--hud-enemy);}
.cot-er.unlit{opacity:.8;filter:saturate(.65);}
/* battle_hud r1: clearer dead-row read — the strike runs through BOTH name
   lines (nick + vehicle) and the row keeps enough alpha (.38 -> .45) for the
   red strike itself to stay legible; the side accent bar desaturates so
   living rows pop against the dead ones. */
.cot-er.dead{opacity:.45;}
/* Lists through fourteen; larger teams use the silhouette grid. */
.cot-ear.dense{gap:0;}
.cot-ear-rows{min-height:0;overflow-y:auto;overscroll-behavior:contain;
  scrollbar-width:none;pointer-events:auto;}
.cot-ear-rows::-webkit-scrollbar{display:none}
.cot-ear-rows:focus-visible{outline:1px solid var(--focus-ink);outline-offset:-1px}
.cot-ear.dense .hd{padding:3px var(--s2);}
.cot-ear.dense .cot-er{padding:1px var(--s2) 2px 6px;font-size:var(--battle-fs-11);}
.cot-ear.dense.r .cot-er{padding:1px 6px 2px var(--s2);}
.cot-ear.dense{--ear-ic-w:22px}.cot-ear.dense .cot-er .ic{height:11px;}
.cot-ear.dense .cot-er .n .nick{font-size:var(--battle-fs-11);}
.cot-ear.dense .cot-er .n .veh{font-size:var(--battle-fs-11);}
.cot-er.dead .n .nick,.cot-er.dead .n .veh .vn{
  text-decoration:line-through;text-decoration-color:var(--danger);}
.cot-ear.l .cot-er.dead{border-left-color:color-mix(in srgb,var(--hud-own) 30%,transparent);}
.cot-ear.r .cot-er.dead{border-right-color:color-mix(in srgb,var(--hud-enemy) 30%,transparent);}
.cot-er.dead .hpm{display:none;}
/* (the player's own health is the hull panel's figure alone: UI-LOCKDOWN B5) */
.cot-er.me .hpm{visibility:hidden;}
/* Crowded rosters become a compact silhouette grid; names remain available
   to assistive reading and in each tile's native hover description. */
.cot-ear.icon-grid .cot-ear-rows{display:grid;grid-template-columns:repeat(var(--roster-columns,4),minmax(0,1fr));
  grid-template-rows:repeat(var(--roster-rows,4),minmax(0,1fr));
  height:calc(var(--roster-rows,4) * 35px + 3px);overflow:hidden;
  gap:2px;padding:2px 1px;align-content:stretch;}
.cot-hud .cot-ear.icon-grid .cot-er{height:auto;min-height:0;padding:1px 3px;
  justify-content:center;overflow:hidden;}
.cot-hud .cot-ear.icon-grid .cot-er .ic{width:28px;height:16px;max-width:100%;max-height:100%;}
.cot-ear.icon-grid .cot-er .n{position:absolute;width:1px;height:1px;padding:0;
  overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
.cot-ear.icon-grid .cot-er.me{background:var(--accent-wash);border-color:var(--accent);}
.cot-ear.icon-grid .cot-er.dead::after{content:"";position:absolute;width:70%;height:1px;
  background:var(--danger);transform:rotate(-25deg);pointer-events:none;}
.cot-killfeed{position:absolute;z-index:var(--hud-layer-status);top:52px;left:210px;display:flex;flex-direction:column;
  gap:5px;align-items:flex-start;max-width:420px;}
.cot-kf{display:flex;gap:7px;align-items:center;padding:5px var(--s4) 5px var(--s3);font-size:12.5px;line-height:1.2;
  letter-spacing:.03em;text-shadow:var(--battle-text-halo);border-radius:var(--r1);
  transition:opacity var(--cot-motion-slow) var(--cot-ease-out);opacity:1;
  box-sizing:border-box;max-width:100%;min-width:0;overflow:hidden;white-space:nowrap;}
.cot-kf.out{opacity:0;}
/* (a row the target plate crosses stands aside while it shows, hud.ts yieldFeedRows) */
.cot-kf.yield{visibility:hidden;}
/* (the names take their own width, so a row's marks follow its callsigns: a flex-filling victim pushed the crew mark
   90 px off its row, gauntlet r3; the right lane packs to its edge) */
.cot-kf .k,.cot-kf .v{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cot-kill-lane.r .cot-kf{justify-content:flex-end;}
/* callsigns in the display voice at the row's size; the docked desktop feed sets the direction's 13 px */
.cot-kf .k,.cot-kf .v{font-family:${FONT_COND};font-weight:600;line-height:1;}
body:is([data-cot-width='laptop'],[data-cot-width='desktop']):not(.cot-touch-layout) .cot-kf :is(.k,.v){font-size:var(--battle-fs-13);}
.cot-kill-lane.l .cot-kf .k,.cot-kill-lane.r .cot-kf .v{color:var(--text-own);}
.cot-kill-lane.r .cot-kf .k,.cot-kill-lane.l .cot-kf .v{color:var(--text-enemy);}
.cot-kill-lane.l .cot-kf .ksi,.cot-kill-lane.r .cot-kf .vsi{color:var(--hud-own);}
.cot-kill-lane.r .cot-kf .ksi,.cot-kill-lane.l .cot-kf .vsi{color:var(--hud-enemy);}
/* the player's own kills and deaths: the player's word in the accent's ink (no plate and no stripe: the feed is bare
   text over the battlefield on both sides, as the rosters are) */
.cot-kill-lane .cot-kf[data-relation=you] .k,.cot-kill-lane .cot-kf[data-relation=victim] .v,
/* (the ridden tank's own name alone, the other in its side's ink: both in the accent, a Watch row's enemy victim read as
   an ally, gauntlet r18) */
.cot-kill-lane .cot-kf[data-relation=ridden][data-ridden=k] .k,.cot-kill-lane .cot-kf[data-relation=ridden][data-ridden=v] .v{color:var(--accent-hi);}
/* (the player's own word never gives way: the other callsign takes the cut, gauntlet r1 at 390 portrait read "Y.") */
.cot-kf[data-relation=you] .k,.cot-kf[data-relation=victim] .v{flex:none;}
.cot-kf .d{display:inline-flex;align-items:center;justify-content:center;line-height:1;color:var(--ink-2);font-weight:500;font-size:11.5px;text-transform:uppercase;letter-spacing:var(--track-label-s);flex:0 0 auto;}
.cot-kf .c{color:var(--accent-hi);font-size:var(--battle-fs-11);letter-spacing:.05em;font-weight:700;flex:0 0 auto;}
.cot-kf .d>svg,.cot-kf .relation>svg{display:block;flex:none;}
.cot-kf .si{width:30px;height:12px;flex:0 0 auto;align-self:center;display:inline-block;}
.cot-kf .vsi{transform:scaleX(-1);}
.cot-kf .cot-flag{flex:none;align-self:center;display:block;border-radius:1px;box-shadow:var(--flag-ring);}
.cot-kf .si.src{display:inline-flex;align-items:center;justify-content:center;height:16px;}
.cot-kf .si.src>svg{display:block;flex:none;}
.cot-dmglayer{position:absolute;z-index:calc(var(--hud-layer-world) + 1);inset:0;}
${spectatorSwitcherStyles}
/* brand-ui 245: the battle layout's touch and roster rules that only matter once the HUD is up ride this lazy sheet, not
   the boot CSS (battleHudLayout.css); their selectors keep the layout sheet's weight */
/* the status chips hug the panel's right edge at their own width: a strip the panel's width began 5 px off the joystick,
   inside its 8 px margin, so the dock lifted it 102 px onto the alt-fire button (statusDockBottom) */
body[data-cot-battle-layout][data-cot-width][data-cot-height].cot-touch-layout .cot-vehicle-status{left:auto;right:0;width:auto}
/* the narrow touch strip (112-150 px, phone, compact, tight): 32 px chips (status, not controls: their tooltip is the
   tap), so the strip sits on the panel under the round buttons' labels (AUTO AIM, SCOPE end 12 px above it) */
body[data-cot-battle-layout][data-cot-width][data-cot-height].cot-touch-layout:is([data-cot-width='phone'],[data-cot-width='compact'],[data-cot-height-density='tight']) .cot-status-box{
  flex:0 0 32px;width:32px;height:32px;min-width:32px;min-height:32px;padding:var(--s1)}
body[data-cot-battle-layout][data-cot-width][data-cot-height].cot-touch-layout:is([data-cot-width='phone'],[data-cot-width='compact'],[data-cot-height-density='tight']) .cot-status-box svg{
  width:18px;height:18px}
/* brand-ui 245 (less text): at rest a roster row is its silhouette and its commander, one line; Tab's held roster
   (rosters-expanded) adds each vehicle and its tier */
body[data-cot-battle-layout][data-cot-width][data-cot-height] .cot-hud:not(.rosters-expanded) .cot-ear:not(.icon-grid) .cot-er .n .veh{display:none}
body[data-cot-battle-layout][data-cot-width][data-cot-height] .cot-hud:not(.rosters-expanded) .cot-ear:not(.icon-grid) .cot-er .n .nick{font-size:var(--battle-fs-12)}
/* brand-ui 245: flying Watch mode's drone on touch, its bar (watchHud.ts) rests on the floor (a watcher spectates: the
   virtual stick it once rode 170 px above is hidden, battleHudLayout.css .cot-spectating, and the bar floated over 170 px of
   nothing, gauntlet r3); a short landscape tucks it under the score, as riding does */
html[data-watch=drone] body[data-cot-battle-layout][data-cot-height='short'].cot-touch-layout .cot-watch{top:var(--hud-watch-top,calc(var(--inset-top) + 40px));bottom:auto}
/* the coordinator's 11 px floor (246): no HUD text under 11 px on any device. A label that cannot fit there reads as its
   glyph or its state's ink, its words in its title and for a screen reader; a figure stays visible (.num). The systems
   row: a control's name is its glyph, a count it shows (a cooldown, the smoke charges) a figure, as a touch tile shows it */
.cot-vehicle-controls>button .sl:not([data-count]){position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cot-vehicle-controls>button:not(:has(.sl[data-count],.system-status:not(:empty))) .si{grid-column:1 / 3}
.cot-vehicle-controls>button .system-status:not(:empty){display:block}
.cot-vehicle-controls>button .sl[data-count]~.system-status{display:none}
/* a recalled drone's tile on the touch strip keeps the Returning cue (aerialHud.css data-phase=returning: its amber ink
   and underline) over the strip tile's plate ring (battleHudLayout.css), by specificity alone (droneReturningCascade.selftest.mjs): at
   (0,5,3) it outranks the strip's tile at (0,5,2) and yields to the action dock's own cue at (0,6,2) */
html body[data-cot-battle-layout].cot-touch-layout .cot-vehicle-controls>button.cot-drone-control[data-phase=returning]{opacity:1;color:var(--accent-hi);box-shadow:inset 0 -2px oklch(from var(--accent-hi) l c h / .6)}
/* the side kill lanes: an ammo-rack kill's cause is its glyph (its word in the glyph's label and title) */
body[data-cot-battle-layout] .cot-kill-lane .cot-kf .d b{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
/* the aim chip's glyph beside its words; a compact chip (the short landscapes, the narrowest portraits: battleHudLayout.css,
   beside the media queries that size it) keeps the glyph */
.cot-aim-warning:not([hidden]){display:flex;align-items:center;justify-content:center;gap:6px}
.cot-aim-warning .g{display:flex;flex:none;color:var(--notice-tone)}.cot-aim-warning .g svg{display:block;width:16px;height:16px}
/* a compact alert keeps its words, two 11 px lines in the touch planner's compact width (battleHudLayout.css
   alert-compact: gauntlet r3 found a notice reduced to its glyph in a square); a mouse window that seats its alert in the
   9 px type's reserves (mouseNoticePlan.ts ALERT_RESERVE_9) is its glyph beside that media query in battleHudLayout.css */
/* while spectating, the DEAD player's own-tank furniture is meaningless and
   collides with the bar — shell tray, damage panel (+ its camo lamp) and the
   reticle canvas hide; team panels / minimap / killfeed stay (that is the
   information a spectator wants). Removed with the bar (spectate:end). */
body.cot-spectating .cot-shells,body.cot-spectating .cot-special,body.cot-spectating .cot-dp,
body.cot-spectating .cot-drive,
body.cot-spectating .cot-ret-text,body.cot-spectating .cot-ret,body.cot-spectating .cot-hitmark{display:none !important;}
.cot-dmgnum{position:absolute;font-family:${FONT_COND};font-weight:700;font-size:var(--battle-fs-18);
  letter-spacing:-.02em;color:var(--accent-hi);white-space:nowrap;text-transform:uppercase;
  text-shadow:-1px 0 var(--surface-nav),1px 0 var(--surface-nav),0 -1px var(--surface-nav),0 2px var(--surface-nav);
  animation:cotFloat calc(var(--dur-stage) * 2.4) cubic-bezier(.2,.6,.3,1) forwards;will-change:transform,opacity;}
.cot-dmgnum.burst{animation:none;opacity:1;transform:translate(-50%,-30%);}
.cot-dmgnum.burst-ending{animation:cotBurstFade calc(var(--dur-stage) * 1.4) ease-out forwards;}
@media (prefers-reduced-motion:reduce){.cot-dmgnum,.cot-dmgnum.burst-ending{animation:none}}
@keyframes cotBurstFade{from{opacity:1;transform:translate(-50%,-30%)}to{opacity:0;transform:translate(-50%,-190%)}}
.cot-dmgnum.miss{color:var(--ink-2);font-size:var(--battle-fs-13);font-weight:700;letter-spacing:.1em;}
.cot-dmgnum .crit{position:absolute;left:50%;bottom:calc(100% + 1px);transform:translateX(-50%);
  font-size:var(--battle-fs-11);font-weight:700;letter-spacing:var(--battle-track-status);color:var(--accent);margin:0;}
@keyframes cotFloat{0%{opacity:0;transform:translate(-50%,-30%)}10%{opacity:1}
  70%{opacity:.95}100%{opacity:0;transform:translate(-50%,-190%)}}
.cot-alert{position:absolute;z-index:var(--hud-layer-controls);left:50%;bottom:23%;max-width:calc(100vw - 32px);min-height:28px;
  display:flex;align-items:center;justify-content:center;gap:var(--s2);padding:var(--s1) var(--s3);box-sizing:border-box;
  transform:translate(-50%,7px);font-family:var(--hud-font);font-size:var(--battle-fs-13);font-weight:700;
  letter-spacing:var(--track-label-s);text-align:center;text-transform:uppercase;color:var(--ink-1);white-space:nowrap;
  text-shadow:0 1px 3px oklch(from var(--surface-scene) l c h / .9);opacity:0;
  transition:opacity var(--cot-motion-base) var(--cot-ease-out),
    transform var(--cot-motion-base) var(--cot-ease-out);}
.cot-alert-icon{width:16px;height:16px;display:grid;place-items:center;flex:0 0 auto;color:var(--notice-tone);}
.cot-alert-icon svg{display:block;width:16px;height:16px;}
.cot-alert-copy{min-width:0;overflow:hidden;text-overflow:ellipsis;}
.cot-alert-bound{white-space:nowrap;}
.cot-alert-count{flex:none;color:var(--ink-3);font:600 var(--battle-fs-12)/1 var(--font-data);letter-spacing:0;}
.cot-alert-count:empty{display:none;}
/* respawn (owner 2026-09-15): in a mode that revives the player the death is a count, not a
   hand-off — kicker + numeral in the pre-battle style, a little lower so the wreck stays visible.
   Hidden the instant the revive lands (mode:respawn) or the battle ends. */
.cot-revive{position:absolute;z-index:var(--hud-layer-status);left:50%;top:30%;transform:translateX(-50%);
  width:min(390px,calc(100vw - 32px));display:grid;grid-template-rows:30px 92px;row-gap:7px;
  justify-items:center;text-align:center;pointer-events:none;
  opacity:0;transition:opacity var(--cot-motion-fast) var(--cot-ease-out);}
.cot-revive.on{opacity:1;}
.cot-revive .k{display:inline-block;padding:7px 18px 6px;font-family:${FONT_COND};font-size:17px;font-weight:700;
  line-height:1;letter-spacing:.3em;text-indent:.3em;text-transform:uppercase;color:var(--accent-hi);
  text-shadow:-1px -1px 0 oklch(from var(--surface-scene) l c h / .98),1px -1px 0 oklch(from var(--surface-scene) l c h / .98),-1px 1px 0 oklch(from var(--surface-scene) l c h / .98),1px 1px 0 oklch(from var(--surface-scene) l c h / .98),
    0 2px 8px rgba(0,0,0,.9),0 0 16px rgba(240,160,48,.24);}
.cot-revive .n{font-family:${FONT_COND};font-size:84px;font-weight:700;line-height:92px;color:var(--ink-1);
  text-shadow:-2px -2px 0 oklch(from var(--surface-scene) l c h / .98),2px -2px 0 oklch(from var(--surface-scene) l c h / .98),-2px 2px 0 oklch(from var(--surface-scene) l c h / .98),2px 2px 0 oklch(from var(--surface-scene) l c h / .98),
    0 3px 14px rgba(0,0,0,.9);}
/* battle_countdown r4 (owner 2026-10-21: "the 3 2 1 area can be a lot better but regardless it needs to be in center of
   screen"): a dial on the centre line just over the crosshair, the rules panel on that line under the sight (both placed
   by countdownPlace.ts). The numeral (Chakra Petch) sits in a ring that drains over each second on a soft dark disc that
   holds on bright skies; each second scales in, the release says GO with the ring full and widening as it fades. No
   kicker while counting (its line stays for screen readers); PREPARING and WAITING show their line under the dial.
   Pure overlay: pointer-events none, no page layout impact. */
.cot-prebattle{--pb-d:164px;--pb-ink:var(--accent-hi);position:absolute;z-index:var(--hud-layer-status);left:50%;top:30%;
  transform:translateX(-50%);transform-origin:50% 0;display:grid;grid-template-columns:var(--pb-d);
  grid-template-rows:var(--pb-d);justify-items:center;align-items:center;text-align:center;pointer-events:none;
  opacity:0;transition:opacity var(--cot-motion-slow) var(--cot-ease-out);}
.cot-prebattle.on{opacity:1;}
.cot-prebattle::before{content:'';grid-area:1/1;width:100%;height:100%;border-radius:50%;
  background:radial-gradient(closest-side,var(--battle-veil),oklch(from var(--surface-nav) l c h / .46) 70%,transparent);}
.cot-prebattle .ring{grid-area:1/1;width:100%;height:100%;overflow:visible;}
.cot-prebattle .ring circle{fill:none;}
.cot-prebattle .trk{stroke:oklch(from var(--accent-hi) .95 .051 h / .16);stroke-width:2.5;}
.cot-prebattle .tks{stroke:oklch(from var(--accent-hi) .95 .051 h / .5);stroke-width:2.5;stroke-dasharray:.5 9.5;}
.cot-prebattle .arc{stroke:var(--pb-ink);stroke-width:3;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:0;
  filter:drop-shadow(0 0 3px oklch(from var(--accent) l c h / .6));}
.cot-prebattle .n{grid-area:1/1;position:relative;top:.03em;font:700 100px/1 var(--font-ui);letter-spacing:0;
  white-space:nowrap;color:var(--ink-1);text-shadow:0 2px 14px oklch(from var(--surface-scene) l c h / .6),0 0 2px oklch(from var(--surface-scene) l c h / .75);}
.cot-prebattle .k{grid-area:2/1;margin-top:var(--s2);font:600 var(--battle-fs-14)/1.2 var(--font-ui);letter-spacing:.14em;text-indent:.14em;
  text-transform:uppercase;white-space:nowrap;color:var(--accent-hi);text-shadow:0 1px 3px oklch(from var(--surface-scene) l c h / .9),0 0 10px oklch(from var(--surface-scene) l c h / .6);}
.cot-prebattle:not(.preparing,.waiting) .k{position:absolute;width:1px;height:1px;margin:0;overflow:hidden;clip-path:inset(50%);}
.cot-prebattle .n.tick{animation:cot-pb-pop var(--cot-motion-slow) var(--cot-ease-out);}
.cot-prebattle .n.tick-alt{animation:cot-pb-pop-alt var(--cot-motion-slow) var(--cot-ease-out);}
.cot-prebattle .n.tick~.ring .arc{animation:cot-pb-drain 1s linear both;}
.cot-prebattle .n.tick-alt~.ring .arc{animation:cot-pb-drain-alt 1s linear both;}
.cot-prebattle.preparing .arc{stroke-dasharray:18 82;animation:cot-pb-chase calc(var(--dur-stage) * 1.7) linear infinite;}
.cot-prebattle .n.go{font-size:60px;letter-spacing:.04em;text-indent:.04em;color:var(--pb-ink);}
.cot-prebattle.rollout .n~.ring .arc{animation:none;stroke-dashoffset:0;}
.cot-prebattle.rollout .ring,.cot-prebattle.rollout::before{animation:cot-pb-burst calc(var(--dur-screen) * 2.5) var(--cot-ease-out) both;}
.cot-prebattle.waiting{grid-template-columns:auto;grid-template-rows:auto;}
.cot-prebattle.waiting::before,.cot-prebattle.waiting .ring{display:none;}
.cot-prebattle.waiting .n{font-size:40px;letter-spacing:var(--track-label-s);text-indent:.08em;}
@keyframes cot-pb-pop{from{transform:scale(1.45);opacity:0;}to{transform:scale(1);opacity:1;}}
@keyframes cot-pb-pop-alt{from{transform:scale(1.45);opacity:0;}to{transform:scale(1);opacity:1;}}
@keyframes cot-pb-drain{from{stroke-dashoffset:0;}to{stroke-dashoffset:-100;}}
@keyframes cot-pb-drain-alt{from{stroke-dashoffset:0;}to{stroke-dashoffset:-100;}}
@keyframes cot-pb-chase{from{stroke-dashoffset:0;}to{stroke-dashoffset:-100;}}
@keyframes cot-pb-burst{to{transform:scale(1.35);opacity:0;}}
/* The rules (matchRuleset.ts rulesetLines): one calm panel, values in the data voice. */
.cot-prebattle-rules{position:absolute;z-index:var(--hud-layer-status);left:50%;top:calc(50% - var(--hud-sight-shift,0px) + 84px);transform:translateX(-50%);
  transform-origin:50% 0;box-sizing:border-box;width:max-content;max-width:min(840px,calc(100vw - 32px));display:flex;
  flex-wrap:wrap;justify-content:center;gap:7px 20px;padding:10px 20px;border:1px solid var(--line-2);
  border-radius:var(--r1);background:var(--hud-plate);box-shadow:0 10px 30px oklch(from var(--surface-scene) l c h / .32);font:600 var(--battle-fs-13)/1.25 var(--font-ui);
  letter-spacing:.07em;text-transform:uppercase;color:var(--ink-2);pointer-events:none;opacity:0;visibility:hidden;
  transition:opacity var(--cot-motion-slow) var(--cot-ease-out),visibility 0s linear var(--cot-motion-slow);}
.cot-prebattle-rules:empty{display:none;}
.cot-prebattle.on:not(.rollout,.waiting)~.cot-prebattle-rules:not(.unplaced){opacity:1;visibility:visible;transition-delay:0s;}
.cot-prebattle-rules>span{display:inline-flex;align-items:baseline;gap:.4em;white-space:nowrap;}
.cot-prebattle-rules b{font:500 var(--battle-fs-13)/1.25 var(--font-mono);letter-spacing:0;color:var(--accent-hi);}
@media (prefers-reduced-motion:reduce){
  .cot-prebattle .n.tick,.cot-prebattle .n.tick-alt{animation:none;}
  .cot-prebattle .n~.ring .arc,.cot-prebattle.preparing .arc{animation:none;}
  .cot-prebattle.rollout .ring,.cot-prebattle.rollout::before{animation:none;}
}
.cot-alert.show{opacity:1;transform:translate(-50%,0);}
.cot-jump{position:absolute;z-index:var(--hud-layer-controls);left:50%;bottom:150px;transform:translateX(-50%);display:none;align-items:center;gap:var(--s2);padding:6px var(--s3);border:1px solid var(--line-2);border-radius:var(--r1);background:var(--hud-plate);color:var(--ink-1);font:600 var(--battle-fs-12)/1 var(--hud-font,system-ui);letter-spacing:.14em;text-transform:uppercase;pointer-events:none}
.cot-jump.on{display:flex}
.cot-jump .sk{padding:2px 6px;border:1px solid var(--line-3);border-radius:var(--r1);font-weight:700;color:var(--ink-2)}
.cot-jump .si{display:inline-flex;color:var(--accent-hi)}.cot-jump .si svg{width:18px;height:18px}
.cot-special{position:absolute;z-index:var(--hud-layer-controls);left:50%;bottom:88px;transform:translateX(-50%);
  min-width:164px;min-height:42px;padding:5px var(--s3) 5px var(--s2);display:none;
  grid-template-columns:24px 1fr auto;align-items:center;gap:7px;pointer-events:auto;
  cursor:pointer;color:var(--ink-1);background:var(--hud-plate);
  border:1px solid var(--line-2);border-bottom:2px solid var(--line-3);border-radius:var(--r1);
  box-shadow:0 5px 16px oklch(from var(--surface-scene) l c h / .42);
  font-family:${FONT_COND};text-transform:uppercase;
  transition:transform var(--dur-instant) ease-out;}
.cot-special.show{display:grid;}
.cot-special:hover{border-color:var(--accent);color:var(--accent-hi);}
.cot-special:active{transform:translateX(-50%) scale(.97);}
.cot-special.active{border-color:var(--accent);color:var(--accent-hi);
  background:linear-gradient(var(--accent-wash),var(--accent-wash)),var(--hud-plate);box-shadow:inset 0 0 0 1px var(--accent);}
.cot-special.empty{color:var(--ink-4);border-color:var(--line-1);background:var(--hud-plate);box-shadow:none;}
.cot-special.empty .si{filter:grayscale(1);opacity:.42;}
.cot-special.deny{animation:cotAmmoDeny var(--dur-screen) ease-out 2;}
.cot-special.pending .si{animation:cotSpecialPulse var(--dur-stage) ease-in-out infinite alternate;}
@media (prefers-reduced-motion:reduce){.cot-special.deny,.cot-special.pending .si{animation:none}}
.cot-special .si{display:flex;align-items:center;justify-content:center;}
.cot-special .si svg{width:22px;height:22px;display:block;}
.cot-special .sl{font-size:var(--battle-fs-11);font-weight:700;letter-spacing:var(--battle-track-status);white-space:nowrap;text-align:left;}
.cot-special .sk{font-size:var(--battle-fs-11);font-weight:700;color:var(--ink-3);border:1px solid var(--line-3);
  padding:1px var(--s1);line-height:13px;}
.cot-special.active .sk{color:var(--accent-hi);border-color:var(--accent);}
.cot-special:focus-visible,.cot-shell:focus-visible,.cot-con:focus-visible{outline:2px solid var(--focus-ink);outline-offset:2px;}
@keyframes cotSpecialPulse{from{opacity:.45}to{opacity:1}}
.cot-shells{position:absolute;z-index:var(--hud-layer-controls);bottom:16px;left:50%;transform:translateX(-50%);display:flex;
  gap:6px;pointer-events:auto;align-items:flex-end;}
/* The reticle already prints SWITCHING; this live region must not occupy the
   special-action control's space above the ammo tray. */
.cot-ammo-switching{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);
  white-space:nowrap;pointer-events:none;}
.cot-shell{width:64px;height:64px;background:var(--hud-plate);
  border:1px solid var(--line-2);border-bottom:2px solid var(--line-2);border-radius:var(--r1);
  appearance:none;color:inherit;font:inherit;padding:0;cursor:pointer;position:relative;
  box-shadow:var(--hud-plate-ring);
  transition:transform var(--dur-instant) ease-out;}
.cot-shell:active{transform:scale(.97);}
.cot-shell.sel .ty{color:var(--accent);}
.cot-shell .tchev{display:none;}
.cot-shell.sel{border-color:var(--accent);border-bottom-color:var(--accent);
  background:linear-gradient(var(--accent-wash),var(--accent-wash)),var(--hud-plate);
  box-shadow:var(--ring-accent),var(--hud-plate-ring);}
/* Out of ammo (owner 2026-10-17; critic r3: a grey 0 over a thin edge read as disabled): an empty slot reads OUT the
   way the phone's does — struck through on a danger edge, its 0 in the danger ink. */
.cot-shell.empty{color:var(--ink-4);border-color:var(--line-1);border-bottom-color:var(--hud-danger);
  background:var(--hud-plate);box-shadow:inset 0 -2px 0 var(--hud-danger);}
.cot-shell.empty::before{content:'';position:absolute;left:16px;right:16px;top:calc(50% - .75px);height:1.5px;
  border-radius:1px;background:var(--hud-danger);box-shadow:0 0 0 1px oklch(from var(--surface-nav) l c h / .851);transform:rotate(-45deg);z-index:2;}
.cot-shell.empty canvas,.cot-shell.empty .ty,.cot-shell.empty .clr{filter:grayscale(1);opacity:.34;}
.cot-shell.empty .key{color:var(--ink-4);border-color:var(--line-1);}
.cot-shell.empty .cnt{color:var(--hud-danger);}
.cot-shell.deny{animation:cotAmmoDeny var(--dur-screen) ease-out 2;}
:is(.cot-special,.cot-shell).deny{border-color:var(--danger);background:linear-gradient(180deg,oklch(from var(--danger) .29 .099 h / .96),var(--hud-plate-strong));
  color:var(--danger)}
@keyframes cotAmmoDeny{0%,100%{transform:translateX(0)}30%{transform:translateX(-2px)}70%{transform:translateX(2px)}}
@media (prefers-reduced-motion:reduce){.cot-shell.deny{animation:none}}
/* (the slot's type reads in its label's ink: the r6-2 class underline under it, silver or olive under an amber HE, said the
   same in a second colour and was a coloured edge, gauntlet r2) */
.cot-shell .clr{display:none;}
/* the shell sits 3 px high so its tail keeps clear of the type label (critic r4b: the fins came within 2 px of APFSDS) */
/* At the 11 px type floor one row cannot hold a type label and its count (APFSDS alone is 41 px of the 62 px slot), so
   every tray sets them as the stacked and touch trays already did: the key top-left, the count top-right, the type label
   along the floor, and the shell between them, scaled to stand 3 px clear of the label's ink and of a three-digit count
   (the HE drum's shoulder is the widest top). */
.cot-shell canvas{position:absolute;left:50%;top:50%;width:calc(46px * var(--shell-k,.78));height:calc(46px * var(--shell-k,.78));transform:translate(-50%,-50%);}
/* The reload shade (.cool, z-index 3) dims the slot's picture, never its marks: the key, the count and the type label
   sit above it, as the consumables' do (critic r7: on the stacked and touch trays the count takes the top-right corner,
   under the shade's top-anchored edge, and a reloading 24 read about 2:1 on its panel while the ∞ beside it stayed
   white). */
.cot-shell .key{position:absolute;top:2px;left:2px;font:500 var(--battle-fs-fig-11)/13px var(--font-data);color:var(--ink-2);
  letter-spacing:0;background:var(--hud-plate);
  border:0;border-radius:var(--control-radius);box-shadow:var(--ring-3);padding:0 3px;z-index:4;}
.cot-shell.sel .key{color:var(--accent-hi);border-color:var(--accent);}
/* the count takes the top-right corner, 3 px in from the slot's edge */
.cot-shell .cnt{position:absolute;top:2px;right:3px;font-size:var(--battle-fs-15);line-height:13px;font-weight:700;
  font-family:var(--hud-font);
  color:var(--ink-1);letter-spacing:.02em;z-index:4;}
/* Owner 2026-10-17 (endless ammo): the ammo ∞ reads as a count — the glyph draws small, so it is set larger, in the
   numeral ink, above the reload shade like every count. */
.cot-shell.unlimited .cnt{font-size:19px;line-height:13px;color:var(--hud-text);z-index:4;}
/* (the type code is Latin in every locale, so it is set in the display face whose Latin it is: a zh document's UI stack
   drew it a fallback face wider, past its tile, gauntlet r2) */
.cot-shell .ty{position:absolute;bottom:2px;left:4px;right:3px;font-size:var(--battle-fs-fig-11);font-weight:700;
  font-family:var(--font-display);color:var(--ink-2);
  letter-spacing:0;white-space:nowrap;z-index:4;}
/* (the codes at the face's own tracking, as every label: tightened, APFSDS's letters touched, gauntlet r7) */
/* A count of three digits or more (an autocannon's 180) sets a step smaller in its corner. */
.cot-shell.wide .cnt{right:3px;font-size:var(--battle-fs-12);letter-spacing:0;}
.cot-shell .cool{position:absolute;left:0;right:0;top:0;height:0;
  background:var(--battle-veil);pointer-events:none;z-index:3;}
.cot-shell .tip{display:none;position:absolute;bottom:70px;left:50%;transform:translateX(-50%);
  white-space:nowrap;background:var(--hud-plate-strong);border:1px solid var(--line-2);border-radius:var(--r1);
  padding:5px 9px 6px;font-size:var(--battle-fs-11);color:var(--ink-2);letter-spacing:.02em;z-index:5;
  box-shadow:0 4px 14px oklch(from var(--surface-scene) l c h / .5);text-align:center;}
.cot-shell .tip b{color:var(--ink-1);font-weight:600;}
.cot-shell .tip .tnm{font-size:var(--battle-fs-11);font-weight:600;color:var(--ink-1);margin-bottom:2px;}
@media (hover:hover) and (pointer:fine){
  .cot-shell:hover{border-color:var(--line-control);}
  .cot-shell:hover .tip{display:block;}
}
/* Equipment uses the same target size as ammo so every bottom-tray action is
   equally easy to acquire. The divider and smaller pictograms preserve the
   ammo/equipment grouping without shrinking the buttons themselves. */
.cot-consep{width:1px;align-self:stretch;background:var(--line-2);margin:2px 6px;}
/* MOBILE-UX r1: the consumables live in their own container so the mobile
   tier can re-park them as a right-edge thumb column (touchControls.ts).
   display:contents = the wrapper generates NO box on desktop — the slots
   stay direct flex items of the tray, pixel-identical to the old markup. */
.cot-cons{display:contents;}
.cot-con{width:64px;height:64px;position:relative;cursor:pointer;
  background:var(--hud-plate);
  border:1px solid var(--line-2);border-bottom:2px solid var(--line-2);border-radius:var(--r1);
  appearance:none;color:inherit;font:inherit;padding:0;display:flex;align-items:center;justify-content:center;
  box-shadow:var(--hud-plate-ring);
  transition:transform var(--dur-instant) ease-out;}
.cot-con svg{width:26px;height:26px;display:block;}
.cot-con:active{transform:scale(.97);}
@media (hover:hover) and (pointer:fine){.cot-con:hover{border-color:var(--line-control);}}
.cot-con .key{position:absolute;top:3px;left:4px;font:500 var(--battle-fs-fig-11)/12px var(--font-data);color:var(--ink-2);
  letter-spacing:0;
  border:0;border-radius:var(--control-radius);box-shadow:var(--ring-3);padding:0 3px;z-index:2;}
/* (its count in the corner every count of the rack and the controls takes, the top right: under the glyph at the bottom
   right it was the one count off that corner, gauntlet r18) */
.cot-con .cnt{position:absolute;top:2px;right:4px;font-size:var(--battle-fs-11);font-weight:700;
  font-family:${FONT_COND};letter-spacing:-.01em;color:var(--ink-1);z-index:2;}
.cot-con .cool{position:absolute;inset:0;display:none;
  background:conic-gradient(var(--battle-veil) var(--cool,0%),transparent 0);z-index:1;pointer-events:none;}
/* the consumable the moment calls for (the direction's .tile.sugg): a repair kit while a module is down, a medkit while
   a crew member is out, the extinguisher while the tank burns */
.cot-con.sugg:not(.cooling){border-color:var(--accent);}
.cot-con.cooling{border-color:var(--line-1);cursor:not-allowed;}
.cot-con.used{opacity:.35;filter:grayscale(1);}
/* a charged item with no uses left this life (the catalog, 2026-10-26) */
.cot-con.empty{opacity:.35;filter:grayscale(1);cursor:not-allowed;}
.cot-con.deny{border-color:var(--danger);animation:cotConDeny var(--dur-screen);}
@keyframes cotConDeny{0%,100%{transform:translateX(0)}30%{transform:translateX(-2px)}70%{transform:translateX(2px)}}
@media (prefers-reduced-motion:reduce){.cot-con.deny{animation:none}}
.aerial-drone .cot-shells{visibility:hidden}
.cot-shell[hidden]{display:none!important}
.cot-aerial-readout{position:absolute;top:calc(50% + 64px);left:50%;transform:translateX(-50%);max-width:80vw;color:var(--ink-1);font:700 var(--battle-fs-11) var(--font-mono);letter-spacing:var(--track-label-s);text-align:center;pointer-events:none;text-shadow:0 1px 3px var(--surface-scene)}
.cot-aerial-readout[hidden]{display:none}
/* the proving ground: no sides to count (the rosters and the two scores leave; the clock keeps its place) */
.range-mode .cot-ear,.range-mode .cot-top .sc{visibility:hidden!important}
.realistic-mode .hprow,.realistic-mode .hptrack,.realistic-mode .hpm,.realistic-mode .cot-hpb .tr,.realistic-mode .cot-tgt .hp,.realistic-mode .cot-tgt .tr{display:none!important}

body[data-cot-height-density='tight'] .cot-aerial-readout{top:calc(50% + 38px);font-size:var(--battle-fs-11)}
.cot-hpbars{position:absolute;z-index:var(--hud-layer-world);inset:0;}
.cot-hpb{position:absolute;width:128px;text-align:center;will-change:transform;transform-origin:50% 100%;
  contain:layout paint style;transform:translate3d(0,0,0);display:flex;flex-direction:column;
  text-shadow:var(--battle-control-label-halo);}
/* one block on the tank (owner 2026-10-27): the name line, the silhouette and whoever holds the hull, the vehicle under
   it in the quieter ink, the bar the block's width and the side's pointer; a hull with no callsign keeps the vehicle on
   the name line alone (.solo); a short or narrow window's bar keeps only the name (.short: a phone's narrow band between
   its panels, where the zh floor's 13 px callsign and its silhouette met the ammunition card; the tank under the gun
   keeps its vehicle line on the target plate). Its lines are as tall as their type (the zh floor's names had met the vehicle
   line), and its height is measured with its copy (measureHpBar). */
.cot-hpb .nm{height:1.3em;padding:1px 7px 0;font-size:var(--battle-fs-11);font-weight:700;letter-spacing:.045em;color:var(--hud-enemy);
  font-family:${FONT_COND};white-space:nowrap;
  display:flex;align-items:center;justify-content:center;gap:5px;
  background:none;}
.cot-hpb.ally .nm{color:var(--hud-own);}
/* (the name itself on the plate's axis, the silhouette hung before it, its box its drawn image, 2:1: the plates critic
   found the name 12 px right of the bar, points and pointer while the silhouette and name centred as one) */
.cot-hpb .nm .nw{position:relative;flex:0 0 auto;display:block;}
.cot-hpb .nm .si{position:absolute;right:100%;top:50%;width:22px;height:11px;margin:-5.5px 4px 0 0;display:block;}
/* (the silhouettes edged dark as the letters beside them are haloed: the ally's sat at 1.9:1 on snow, critic r3) */
.cot-hpb .nm .si,.cot-tgt .cg{filter:drop-shadow(0 0 1px var(--surface-scene)) drop-shadow(0 0 1px var(--surface-scene))
  drop-shadow(0 1px 1px var(--surface-scene));}
.cot-hpb .nm span{display:block;min-width:0;flex:0 0 auto;overflow:visible;text-overflow:clip;}
.cot-hpb .vh{height:1.2em;padding:0 7px;font:600 var(--battle-fs-11)/1.2 ${FONT_COND};letter-spacing:.045em;color:var(--ink-2);
  white-space:nowrap;}
/* (the quiet lines' halo doubled, so they hold over snow where their ink is the snow's own value) */
.cot-hpb .vh,.cot-tgt .mt,.cot-tgt .hp{text-shadow:var(--battle-control-label-halo),var(--battle-control-label-halo);}
.cot-hpb.solo .vh,.cot-hpbars.short .cot-hpb .vh{display:none;}
.cot-hpbars.short .cot-hpb .nm{padding-inline:5px;letter-spacing:.03em;}
.cot-hpbars.short .cot-hpb .nm .si{display:none;}
.cot-hpbars.short .cot-hpb .tr{margin-inline:5px;}
/* (the ally's chevron closer in on a short window, its shadow still inside the box: the bar fits the band between a
   phone's panels and the target plate; the enemy's diamond keeps its margins, its tip and ring off the box's edge, which
   had stood flush on a consumable button, markers r20m4) */
.cot-hpbars.short .cot-hpb.ally::after{margin-bottom:2px;}
/* one bar for both plates: the strong plate's track inside a light hairline (it holds against a night sky) and its shadow */
.cot-hpb .tr,.cot-tgt .tr{background:var(--hud-plate-strong);border:1px solid var(--line-3);
  box-shadow:0 2px 4px oklch(from var(--surface-scene) l c h / .72);position:relative;overflow:hidden;}
.cot-hpb .tr{flex:none;height:6px;margin:2px 7px 0;}
.cot-hpb .fl{height:100%;width:100%;transform-origin:0 50%;background:var(--hud-enemy);transition:transform var(--dur-fast) linear;}
.cot-hpb.ally .fl{background:var(--hud-own);}
/* the side under the bar in shape and colour, never colour alone (INTERACTION-REDESIGN bar line 6): the enemy's diamond,
   the target plate's, and the ally's chevron, each whole inside the bar's box (the 31 px box cut the old pointer) */
/* (the enemy's diamond ringed as the target plate's, so it holds its shape over snow, its ring inside the painted box) */
.cot-hpb::after{content:"";display:block;flex:none;width:6px;height:6px;margin:4px auto;transform:rotate(45deg);
  translate:var(--hpb-anch-dx,0px) 0;
  background:var(--hud-enemy);box-shadow:var(--battle-mark-ring);}
/* (the ally's chevron the diamond's weight, edged dark as the diamond is ringed: it read as half the mark, critic r3) */
.cot-hpb.ally::after{width:0;height:0;margin-top:2px;transform:none;background:none;box-shadow:none;
  filter:drop-shadow(0 0 1px var(--surface-scene)) drop-shadow(0 1px 1px var(--surface-scene));
  border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--hud-own);}
/* Over-target marker (brand-ui 242, the direction's 06-battle-hud .tgt): one compact plate row on the target — its
   silhouette facing the player, the callsign, the tier and vehicle, the range — over the hull bar and its
   points, the enemy's diamond pointing into the tank. A stable-height instrument follows the exact projected turret
   roof; its width changes only when its copy does, so names stay whole without steady-state frame reflow. The plate is
   the row alone: the instrument around it paints nothing over the battlefield. No nation flag on any marker over a tank
   (owner 2026-10-26, "dont show flags inn inn game enemy markers (*or friends s)"): the side reads in the silhouette's
   and the bar's colour and the diamond's shape; the rosters, the load card, the scoreboard and the report keep them. */
.cot-tgt{position:absolute;z-index:var(--hud-layer-world);width:128px;text-align:center;display:none;
  will-change:transform;contain:layout paint style;transform:translate3d(0,0,0);text-shadow:var(--battle-control-label-halo);}
.cot-tgt .bk{padding:0;background:none;display:flex;flex-direction:column;align-items:center;}
/* the name line: the silhouette and whoever holds the hull (the callsign, the player's name, a proving lane's name); each
   line as tall as its type's glyphs, so the zh floor's lines keep en's spacing and no glyph stands past the plate's
   painted edge (at 15 px the name rose 1 px over it, battle-hud-overlap) */
.cot-tgt .pl{position:relative;height:1.4em;font-size:var(--battle-fs-13);display:flex;align-items:center;}
/* (the name itself on the plate's axis, the silhouette hung before it, its box its drawn image, 2:1, its empty rear
   beside the name) */
.cot-tgt .cg{position:absolute;right:100%;top:50%;width:28px;height:14px;margin:-7px 2px 0 0;color:var(--hud-enemy);
  transform:scaleX(-1);}
/* (the zh floor sets the hull bars' names at 13 px: the name under the gun a size over them, and on a large window as far
   over them as en's 15 px over its 11) */
:lang(zh-CN) .cot-tgt .pl{font-size:var(--battle-fs-14);}
:lang(zh-CN) .cot-tgt.lg .pl{font-size:var(--battle-fs-18);}
.cot-tgt .nick{flex:none;font:600 1em/1 var(--hud-font);color:var(--ink-1);
  white-space:nowrap;overflow:visible;text-overflow:clip;}
/* (the tier and the vehicle in the UI face, "IX · T-90AM", as every vehicle line: the data face set it apart, r15) */
.cot-tgt .mt{height:1.35em;margin-top:.1em;font-size:var(--battle-fs-12);display:flex;align-items:center;gap:var(--s1);}
.cot-tgt .tier{flex:none;font:600 1em/1 var(--font-ui);color:var(--ink-2);}
.cot-tgt .veh{flex:none;font:500 1em/1 var(--font-ui);color:var(--ink-2);
  white-space:nowrap;overflow:visible;text-overflow:clip;}
.cot-tgt .veh::before,.cot-tgt .rng::before{content:'·';margin-right:var(--s1);font-family:var(--font-ui);}
.cot-tgt .rng{flex:none;font:500 1em/1 var(--font-data);color:var(--ink-2);}
.cot-tgt .rng:empty{display:none;}
/* (in the scope the range is the sight's own tag: the plate leaves it, UI-LOCKDOWN B8) */
html[data-cot-scoped] .cot-tgt .rng{display:none;}
/* the hull bar the block's width, its points directly under it, quiet on the battlefield */
/* (the bar spans the text block, measured with the copy: the silhouette hangs before it, outside its span) */
.cot-tgt .tr{align-self:center;width:100%;height:6px;margin-top:5px;}
.cot-tgt .fl{height:100%;background:var(--hud-enemy);}
.cot-tgt .hp{height:1.35em;margin-top:2px;font:500 var(--battle-fs-11)/1.35 var(--font-data);color:var(--ink-1);
  white-space:nowrap;}
/* (its rotated tip and ring inside the plate's painted box, the plate paints contained; clear of the points' slash) */
.cot-tgt .anch{flex:none;width:10px;height:10px;margin:6px 0 4px;transform:translateX(var(--tgt-anch-dx,0px)) rotate(45deg);background:var(--hud-enemy);
  box-shadow:var(--battle-mark-ring);}
/* hung under the sight (positionTargetPlate): the diamond over the name, pointing up at the tank */
.cot-tgt.below .anch{order:-1;margin:4px 0 6px;}
/* the name alone (.tightest) keeps its diamond 4 px closer to the name, its tip's side unchanged (a zh name took 38 px of
   568x256's 37 px band over the ring; measureTargetPlate reads each level's height as laid out) */
.cot-tgt.tightest:not(.below) .anch{margin-top:2px;}
.cot-tgt.tightest.below .anch{margin-bottom:2px;}
/* under a panel it sank beneath on a phone (positionTargetPlate) the vehicle line stands down, then the points, then the
   bar: the name stays */
.cot-tgt.tight .mt,.cot-tgt.tighter .hp,.cot-tgt.tightest .tr{display:none;}
/* a large window steps the plate up (.lg, resize: it keeps the phone's floor everywhere else) */
.cot-tgt.lg .pl{font-size:var(--battle-fs-15);}
.cot-tgt.lg .cg{width:32px;height:16px;margin:-8px 2px 0 0;}
.cot-tgt.lg .mt{font-size:var(--battle-fs-14);margin-top:.2em;}
.cot-tgt.lg .tr{height:7px;margin-top:7px;}
.cot-tgt.lg .hp{font-size:var(--battle-fs-13);margin-top:4px;}
.cot-tgt.lg .anch{width:12px;height:12px;margin:7px 0 5px;}
.cot-tgt.lg.below .anch{margin:5px 0 7px;}
/* The tactical map on its plate (brand-ui H3, the direction's .mm). On the wide mouse layouts the plate's padding holds a
   header over the map, the battlefield's name beside the map key's cap, so the map itself keeps its square. */
/* (the plate's size steps with the map key, --mm-k (the zoom below); its insets are --mm-p*, and a map shown large
   enough to hold them keeps its grid's coordinates in a gutter outside the grid (.grid): numbers along the top, letters
   down the left, gauntlet r3 found "1" and "A" sharing the corner cell and the range ring through the numbers) */
.cot-minimap{position:absolute;z-index:var(--hud-layer-controls);right:16px;bottom:16px;width:calc(220px * var(--mm-k,1));height:calc(220px * var(--mm-k,1));
  --mm-pt:0px;--mm-pr:0px;--mm-pb:0px;--mm-pl:0px;--mm-g:0px;
  padding:calc(var(--mm-pt) + var(--mm-g)) var(--mm-pr) var(--mm-pb) calc(var(--mm-pl) + var(--mm-g));
  border:0;border-radius:var(--r1);background:var(--hud-plate);box-shadow:var(--hud-plate-ring);}
.cot-minimap canvas{display:block;width:100%;height:100%;}
.cot-minimap .cot-mm-letters{inset:calc(var(--mm-pt) + var(--mm-g)) var(--mm-pr) var(--mm-pb) calc(var(--mm-pl) + var(--mm-g));}
.cot-mm-gx,.cot-mm-gy{display:none}
.cot-minimap.grid{--mm-g:14px}
.cot-minimap.grid :is(.cot-mm-gx,.cot-mm-gy){position:absolute;display:grid;place-items:center;pointer-events:none;
  font:600 var(--battle-fs-fig-11)/1 var(--hud-font);color:var(--ink-3)}
.cot-mm-gx{left:calc(var(--mm-pl) + var(--mm-g));right:var(--mm-pr);top:var(--mm-pt);height:var(--mm-g);grid-template-columns:repeat(10,minmax(0,1fr))}
.cot-mm-gy{top:calc(var(--mm-pt) + var(--mm-g));bottom:var(--mm-pb);left:var(--mm-pl);width:var(--mm-g);grid-template-rows:repeat(10,minmax(0,1fr))}
.cot-mm-hd{display:none}
body:not(.cot-touch-layout):is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall']) .cot-minimap{
  box-sizing:content-box;--mm-pt:var(--s6);--mm-pr:var(--s2);--mm-pb:var(--s2);--mm-pl:var(--s2);}
body:not(.cot-touch-layout):is([data-cot-width='laptop'],[data-cot-width='desktop']):is([data-cot-height='standard'],[data-cot-height='tall']) .cot-mm-hd{
  position:absolute;left:8px;right:8px;top:6px;height:20px;display:flex;align-items:center;justify-content:space-between;gap:var(--s2);
  font:600 var(--battle-fs-13)/1 var(--hud-font);color:var(--ink-1);white-space:nowrap;}
.cot-mm-hd .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;}
.cot-mm-hd .cot-c-kbd{flex:none;height:19px;min-width:19px;padding:0 5px;font-size:var(--battle-fs-11);}
/* (the size control: the map's glyph and its key cap on the header's line, the kit's ring on hover and focus) */
.cot-mm-size{flex:none;display:inline-flex;align-items:center;gap:var(--s1);height:22px;padding:0 2px 0 var(--s1);border:0;
  border-radius:var(--control-radius);background:none;color:var(--ink-2);font:inherit;cursor:pointer;pointer-events:auto;}
.cot-mm-size:hover{color:var(--ink-1);box-shadow:var(--ring-3);}
.cot-mm-size:focus-visible{outline:2px solid var(--focus-ink);outline-offset:1px;}
.cot-mm-size[aria-pressed='true']{color:var(--accent-hi);}
body.cot-touch-layout .cot-minimap{pointer-events:auto;cursor:pointer;}
/* Detection is one compact instrument, revealed after the authoritative
   sixth-sense delay. A finite entry sweep replaces the old forever-pulsing
   bulb, keeping motion quiet while the state remains active. */
/* (the centre notices' one plate, the alert's and the gun chip's: 28 px, the 13 px label, a 16 px glyph, each as wide as
   its words; DETECTED stood 32 px over a 38 px alert and a 24 px chip in three type styles, gauntlet r5) */
.cot-sixth{position:absolute;z-index:var(--hud-layer-controls);top:12%;left:50%;
  width:max-content;max-width:min(248px,calc(100vw - 28px));min-height:28px;transform:translate(-50%,-6px);
  display:grid;grid-template-columns:16px auto;justify-content:center;gap:var(--s2);align-items:center;
  padding:var(--s1) var(--s3);box-sizing:border-box;color:var(--ink-1);
  opacity:0;transition:opacity var(--cot-motion-fast) var(--cot-ease-out),
    transform var(--cot-motion-base) var(--cot-ease-out);pointer-events:none;}
.cot-sixth.on{opacity:1;transform:translate(-50%,0);
  animation:cotDetectedIn var(--cot-motion-slow) var(--cot-ease-out) 1;}
.cot-sixth .sig{display:grid;place-items:center;color:var(--notice-tone);}
.cot-sixth .sig svg{width:16px;height:16px;display:block;}
.cot-sixth .copy{min-width:0;padding:0;display:flex;flex-direction:column;gap:3px;}
.cot-sixth .lb{font:700 var(--battle-fs-13)/1 var(--hud-font);letter-spacing:var(--track-label-s);text-transform:uppercase;color:var(--ink-1);}
/* the lamp and its label read alone (owner 2026-10-22: no secondary labels); the line stays for a screen reader */
.cot-sixth .sub{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
/* The battle's notices on the kit's notice grammar (components/notice.ts; owner 2026-10-25: "make notifications a lot
   better...stop using the box with one border colored"): one strong HUD plate ringed all round, the severity in its
   glyph's tone and, for a warning or an error, a faint wash of it on the plate; the words keep the plate's ink. No
   stripe and no one-sided border (hudNotices.selftest.mjs holds the HUD to it). */
.cot-hud [data-severity]{--notice-tone:var(--text-accent);}
.cot-hud [data-severity=success]{--notice-tone:var(--text-ok);}
.cot-hud [data-severity=warning]{--notice-tone:var(--text-warn);}
.cot-hud [data-severity=error]{--notice-tone:var(--text-danger);}
.cot-hud [data-severity=info]{--notice-tone:var(--text-accent);}
/* ... on the HUD's own notice plate (owner 2026-10-25: "i wonder if we should make notificatison special shapes, like
   hexagons, again"): every battle notice the same long hexagon, the score plate's and the mission plate's slant at both
   ends, its edge and its fill two layers under the words (a ring cannot follow a clip) */
.cot-sixth,.cot-alert,.cot-aim-warning{--notice-cut:polygon(var(--notice-point) 0,calc(100% - var(--notice-point)) 0,100% 50%,
  calc(100% - var(--notice-point)) 100%,var(--notice-point) 100%,0 50%);--notice-point:8px;--notice-fill:var(--hud-plate-strong);
  --notice-line:var(--line-2);border:0;border-radius:0;background:none;box-shadow:none;isolation:isolate;}
:is(.cot-sixth,.cot-alert,.cot-aim-warning)::before,:is(.cot-sixth,.cot-alert,.cot-aim-warning)::after{content:'';position:absolute;
  z-index:-1;pointer-events:none;clip-path:var(--notice-cut);}
:is(.cot-sixth,.cot-alert,.cot-aim-warning)::before{inset:0;background:var(--notice-line);}
:is(.cot-sixth,.cot-alert,.cot-aim-warning)::after{inset:1px;background:var(--notice-fill);}
:is(.cot-sixth,.cot-alert,.cot-aim-warning)[data-severity=warning]{--notice-fill:color-mix(in srgb,var(--text-warn) 7%,var(--hud-plate-strong));}
:is(.cot-sixth,.cot-alert,.cot-aim-warning)[data-severity=error]{--notice-fill:color-mix(in srgb,var(--text-danger) 9%,var(--hud-plate-strong));}
@keyframes cotDetectedIn{from{opacity:0;transform:translate(-50%,-6px)}to{opacity:1;transform:translate(-50%,0)}}
@media(prefers-reduced-motion:reduce){.cot-sixth.on{animation:none}}

`;

function penColor(r: number | null | undefined): string {
  if (r == null || !isFinite(r)) return PEN_NONE;
  return r >= 1.15 ? PEN_GREEN : r >= 0.85 ? PEN_ORANGE : PEN_RED;
}

function fmtTimer(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * The Horde's status line under the live ruleset (else the mode's own table): unlimited rounds drop the ammunition
 * count, which could only read full.
 */
/** How far a touch may travel on a vehicle-row tile and still act on its lift (UI-06: farther is a swipe to aim). */
const TAP_SLOP_PX = 10;
/** The least share a score bar shows once its side has scored: about 5 px of the 96 px bar. */
const SCORE_BAR_STUB = 0.05;

/** The objective's progress as its " · " parts, each count's figures held together: a short landscape's compact form
 *  stacks the parts in the side seat (battleHudLayout.css data-objective-seat). A tab too narrow for the parts on one line
 *  stacks them too, one a line without their dots (gauntlet r2: a wrap left "0 ALIVE" over "· 0/1 SAFE"); its width is
 *  the planner's (--hud-objective-width), its copy estimated at the 11 px caps' advance, so nothing is measured. */
function setObjectiveValue(target: HTMLElement, copy: string, marks: readonly (DatumKey | null)[] = []): void {
  target.replaceChildren();
  copy.split(' · ').forEach((part, index) => {
    const seg = Object.assign(document.createElement('span'), { className: 'seg' });
    // (a part that is a datum of its own: the Frontline's hostiles, surfaceRegistry.ts)
    const mark = marks[index];
    if (mark) markDatum(seg, mark);
    if (index) {
      target.append(' ');
      seg.append(Object.assign(document.createElement('span'), { className: 'sep', textContent: '·\u00a0' }));
    }
    seg.append(part.replace(/ \/ /g, ' / '));
    target.append(seg);
  });
  const width = parseFloat(document.body?.style?.getPropertyValue?.('--hud-objective-width') || '') || OBJECTIVE_DEFAULT_W;
  // (a class, which the planner observes, so its re-seat follows the taller tab; toggle with its force writes nothing when
  // unchanged)
  const over = objectiveCopyOver(target, copy, width);
  const tab = target.closest?.('.cot-mode-status');
  tab?.classList.toggle('stacked', copy.includes(' · ') && over);
  // (a copy of one part too wide for the tab wraps between its words: the drone's "CONFIRM 750 KILLS" ran under the tab's
  // slanted edge on the touch windows, gauntlet r16)
  tab?.classList.toggle('wraps', !copy.includes(' · ') && over);
}
/** The Frontline objective's parts (line, wave, hostiles): the hostiles are a datum of their own (surfaceRegistry.ts). */
const FRONTLINE_MARKS: readonly (DatumKey | null)[] = [null, null, 'hostiles'];
/** The objective panel's default width (battleHudLayout.css). */
const OBJECTIVE_DEFAULT_W = 278;

export function hordeStatusCopy(modeState: HudMatchModeState, liveRuleset: MatchRuleset | null): string {
  const horde = modeState.horde;
  const wave = String(horde?.wave || 1), alive = String(horde?.remaining ?? horde?.alive ?? 0);
  const rules = (liveRuleset?.mode === modeState.id ? liveRuleset : null) ?? matchRulesetFor(normalizeGameMode(modeState.id));
  if (rules.ammo === 'unlimited') return t('hud.modeStatus.hordeWave', { wave, alive });
  return t('hud.modeStatus.horde', {
    wave, alive, ammo: String(modeState.playerAmmo ?? '—'), capacity: String(modeState.playerAmmoCapacity ?? '—'),
  });
}

/**
 * Create the battle HUD overlay and subscribe it to the event bus.
 * @param {{on:Function,off:Function,emit:Function}} bus - injected event bus (§1.5).
 * @returns {{setMode:Function,update:Function,buildMinimap:Function,setDamagePanel:Function,forceAimDisplay:Function,root:HTMLElement}} Hud
 */
export function initHud(bus: EventBus): HudRuntime {
  ensureFonts();
  ensureStyle('cot-hud-style', HUD_CSS, 'surfaces');

  const root = el('div', 'cot-hud');
  document.body.appendChild(root);
  installBattleHudLayout(root);
  // The nations' flags (flags.ts, the Garage's and the load screen's, already the game's own chunk): imported on demand so
  // this module stays Node-loadable, as battleLoad.ts loads them; a Node receipt's feed and ribbon go without flags.
  let flagHtml: ((nation: string) => string) | null = null;
  import('./flags.ts').then(({ flagIconHTML }) => { flagHtml = (nation) => flagIconHTML(nation, 16, 12); }, () => {});

  const touchAimWarning = el('div', 'cot-aim-warning', root);
  touchAimWarning.hidden = true;
  touchAimWarning.setAttribute('role', 'status');
  // the chip's glyph and words: a compact chip (battleHudLayout.css, the 11 px floor) reads as its glyph alone, the words
  // for a screen reader and in its title
  const touchAimWarningGlyph = el('span', 'g', touchAimWarning);
  touchAimWarningGlyph.setAttribute('aria-hidden', 'true');
  const touchAimWarningText = el('span', 'tx', touchAimWarning);
  // (UI-LOCKDOWN A) the sight and the gunship's mark size through uiCanvas: each store is its box × the capped ratio,
  // released while the HUD or the mark is hidden; a box change repaints the sight (the reuse signature drops)
  const retSurface = createUiCanvas(root, 'cot-ret', {
    maxPixels: DESKTOP_OUTPUT_PIXEL_BUDGET,
    initialBox: () => [root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight],
    onResize: () => { reticlePaint.valid = false; scopeGrad = null; scopeGradZoom = -1; },
  });
  const ctx = retSurface.context;
  // its words and figures: DOM runs over it, placed where the canvas drew them (the reload countdown is the 'reload' datum)
  const sightText = createCanvasText(root, 'cot-ret-text');
  markDatum(sightText.run(SIGHT_TEXT_COUNTDOWN), 'reload').classList.add('cot-ret-reload');
  const markSurface = createUiCanvas(root, 'cot-hitmark', { initialBox: () => [HIT_MARK_BOX_PX, HIT_MARK_BOX_PX] });
  const markCanvas = markSurface.canvas;
  const markCtx = markSurface.context;
  let markShown = false, markX = NaN, markY = NaN;
  const on = (event: string, listener: (payload: HudEventPayload) => void): (() => void) =>
    bus.on(event, (payload) => listener(payload as HudEventPayload));
  const hpLayer = el('div', 'cot-hpbars', root);
  // (the floating numbers over the hits are the damage dealt's one place, however many fly at once: UI-LOCKDOWN B16)
  const dmgLayer = markDatum(el('div', 'cot-dmglayer', root), 'damage-dealt');

  // --- over-target marker plate (WoT aiming loop feedback) ---
  /** The room the plate keeps past the range it shows, for its figures to grow by two, in its line's type size. */
  const TARGET_RANGE_EM = 1.2;
  /** How far a plate sunk under a panel stands below it (positionTargetPlate). */
  const PLATE_SINK_GAP = 6;
  /** The target plate's band search (targetPlateBand): its step down the column, what a level of lines costs, and what a
   *  seat that leaves no hull bar's width beside it in its band costs (owner: at least one hull bar on every window). */
  const TARGET_BAND_STEP = 4, TARGET_BAND_LEVEL_COST = 60, TARGET_BAND_CROWD_COST = 60;
  /** The target plate's tightest level, its name alone (targetPlateHeightAt), the classes of its levels, and the gap it
   *  keeps off the sight's ring as drawn on the band search's second pass. */
  const TARGET_TIGHTEST = 3, TARGET_TIGHT_CLASSES = ['tight', 'tighter', 'tightest'], TARGET_ON_RING_GAP = 1;
  /** How far in from the plate's ends its tank's x stays when a band seat slides it (its diamond within the plate). */
  const TARGET_ANCHOR_INSET = 12;
  /** How far a hull bar keeps off the sight's ring, off the target plate and off the HUD's furniture (its pointer had
   *  stood flush on a consumable button, markers r20m4). */
  const HP_BAR_RING_GAP = 4, HP_BAR_PLATE_GAP = 2, HP_BAR_FURNITURE_GAP = 2;
  /** A hull bar's slide where its own seat is not clear (hpBarSlide): its steps along its row and up its column, how far
   *  under its seat it may stand (its pointer still on the tank's top), and the frames a bar no slide seated waits before
   *  it searches again (the search is the bar pass's dearest work). */
  const HP_BAR_SLIDE_STEP_X = 4, HP_BAR_SLIDE_STEP_Y = 1, HP_BAR_SLIDE_DOWN = 6, HP_BAR_SLIDE_RETRY = 6;
  /** The narrowest block (its bar never shorter), and its height as composed in full (measured on each new copy). */
  const TARGET_PLATE_MIN_W = 128, TARGET_PLATE_H = 68;
  /** From this large a window (the desktop width band and the tall height band) the plate steps up a size (.lg). */
  const TARGET_PLATE_LARGE_W = 1440, TARGET_PLATE_LARGE_H = 900;
  const tgtEl = el('div', 'cot-tgt', root);
  // (one block on the marker, owner 2026-10-27: the name line, the tier, vehicle and range under it, the bar the
  // block's width, its points under the bar and the diamond; no part keeps a slot it does not fill)
  tgtEl.innerHTML = `<div class="bk"><div class="pl"><span class="cg"></span><b class="nick"></b></div>` +
    `<div class="mt"><span class="tier"></span><span class="veh"></span><span class="rng num"></span></div>` +
    `<div class="tr"><div class="fl"></div></div><div class="hp num"></div><div class="anch"></div></div>`;
  const tgtRefs = {
    rng: requireElement<HTMLElement>(tgtEl, '.rng'),
    nick: requireElement<HTMLElement>(tgtEl, '.nick'),
    tier: requireElement<HTMLElement>(tgtEl, '.tier'),
    veh: requireElement<HTMLElement>(tgtEl, '.veh'),
    fl: requireElement<HTMLElement>(tgtEl, '.fl'),
    tr: requireElement<HTMLElement>(tgtEl, '.tr'),
    hp: requireElement<HTMLElement>(tgtEl, '.hp'),
    cg: requireElement<HTMLElement>(tgtEl, '.cg'),
    bk: requireElement<HTMLElement>(tgtEl, '.bk'),
    pl: requireElement<HTMLElement>(tgtEl, '.pl'),
    mt: requireElement<HTMLElement>(tgtEl, '.mt'),
  };
  let tgtLastVehicleId: string | null = null; // cached silhouette key (avoid repeated mask writes)
  let tgtLastRangeM = -2; // the range shown, whole metres (-1: no player to range from)
  let tgtShown = false;
  let tgtRect: TargetPlateRect | null = null; // screen-px rect of the shown plate (sniper hairline gap)
  // (one rect reused every frame, and the plate's move held until the reticle canvas has drawn: a style write before
  // the canvas's font changes forces a style recalc inside the frame, 249)
  const tgtRectScratch: TargetPlateRect = { cx: 0, hw: 0, top: 0, bottom: 0 };
  let tgtTransform = '';
  let tgtPendingTransform: string | null = null;
  let tgtBelow = false, tgtPendingBelow = false; // the plate hung under the sight (positionTargetPlate), as written
  let tgtLastHp = -1, tgtLastMaxHp = -1; // the hull points shown
  let tgtPlateWidth = TARGET_PLATE_MIN_W; // measured from its copy whenever the copy changes (updateTargetPlateCopy)
  let tgtPlateHeight = TARGET_PLATE_H; // the block as composed: the bar and its points leave it in the realistic mode
  let tgtMeasure = false; // its size step changed (resize): measured again with the next frame's copy
  let tgtRangeChars = 0; // the range copy's length when measured (updateTargetPlateRange)
  // the vehicle line's and the points' shares of the height, which a plate sunk under a panel leaves (.tight, .tighter)
  let tgtMetaHeight = 0, tgtPointsHeight = 0, tgtBarHeight = 0;
  const tgtLevelHeight = [0, 0, 0, 0]; // its height at each tight level as laid out (measureTargetPlate)
  let tgtTight = 0, tgtPendingTight = 0; // 0 whole, 1 tight, 2 tighter, 3 the name alone: as written, and as placed
  let tgtAnchorDx = 0, tgtPendingAnchorDx = 0; // the diamond's offset from the plate's centre (a band seat), as written
  let laneNameNumber = -1, laneName = ''; // the proving ground's lane name, written when the laid lane changes
  let aimTargetId: string | null = null;
  /** Whether the player has given or taken a hit this battle (re-armed when the HUD hides between battles). */
  let playerEngaged = false;
  let lastTanksRef: HudTank[] | null = null;  // roster snapshot for the forced-still target scan
  let forcedStill = false;  // true between forceAimDisplay and the next update
  let dmgPanelRef: DamagePanelController | null = null;   // mounted damage panel (turret-bearing feed)

  // --- top score/timer plate ---
  // Scores and clock retain a fixed footprint regardless of roster size.
  const topPlate = markDatum(el('div', 'cot-top', root), 'score');
  topPlate.innerHTML = `<div class="sc ally"><span class="team-label" data-default>${t('hud.team.ally')}</span>` +
    `<b class="fg">0</b><i class="bar" aria-hidden="true"><i></i></i></div>` +
    `<div class="tm-block"><span class="tm-label"></span><span class="tm num"${datumAttr('clock')}>15:00</span></div>` +
    `<div class="sc enemy"><span class="team-label" data-default>${t('hud.team.enemy')}</span>` +
    `<b class="fe">0</b><i class="bar" aria-hidden="true"><i></i></i>` +
    // (the Frontline's hostiles, Horde-style, where its objective drops them: battleHudLayout.css, Main 254)
    `<span class="fh"${datumAttr('hostiles')}><b class="num"></b><span class="team-label">${t('hud.remaining')}</span></span></div>`;
  const fgEl = requireElement<HTMLElement>(topPlate, '.fg');
  const feEl = requireElement<HTMLElement>(topPlate, '.fe');
  const fhValueEl = requireElement<HTMLElement>(topPlate, '.fh b');
  const tmEl = requireElement<HTMLElement>(topPlate, '.tm');
  const allyBarEl = requireElement<HTMLElement>(topPlate, '.sc.ally .bar');
  const enemyBarEl = requireElement<HTMLElement>(topPlate, '.sc.enemy .bar');
  /** Each side's share of what wins it, 0 to 1, on its bar (written with the score, never per frame); any point on the
   *  board shows at least a stub (H1 critics: early bars read empty). */
  const barShare = (share: number): string => String(share > 0 ? Math.min(1, Math.max(SCORE_BAR_STUB, share)) : 0);
  const setScoreBars = (own: number, enemy: number): void => {
    allyBarEl.style.setProperty('--p', barShare(own));
    enemyBarEl.style.setProperty('--p', barShare(enemy));
  };
  const allyLabelEl = requireElement<HTMLElement>(topPlate, '.sc.ally .team-label');
  const enemyLabelEl = requireElement<HTMLElement>(topPlate, '.sc.enemy .team-label');
  const timerLabelEl = requireElement<HTMLElement>(topPlate, '.tm-label');
  const modeStatusEl = el('div', 'cot-mode-status', root);
  modeStatusEl.setAttribute('role', 'status');
  // the mission plate (brand-ui H3): the mode's glyph and the objective; in the corner seat the mode's name over the
  // objective and the rosters' Tab key beside them (the link's ping is the top-right corner's, below)
  modeStatusEl.innerHTML = `<span class="mi"></span><span class="mt"><b class="mn"${datumAttr('mode-name')}></b><span class="mv"${datumAttr('objective')}></span></span>`
    + `<kbd class="cot-c-kbd" aria-hidden="true">TAB</kbd>`;
  const modeStatusIcon = requireElement<HTMLElement>(modeStatusEl, '.mi');
  const modeStatusName = requireElement<HTMLElement>(modeStatusEl, '.mn');
  const modeStatusValue = requireElement<HTMLElement>(modeStatusEl, '.mv');
  let lastModeStatus = '';
  // the team strip: a silhouette pip per tank along the score plate's lower edge, a chip per capture zone under it
  // (hudTeamPips.ts)
  const teamPips = createTeamPips(root, topPlate);
  const pipsRow = requireElement<HTMLElement>(topPlate, '.cot-pips-row');
  const standardModeStatus: HudMatchModeState = {id:'standard',target:0};
  // proving ground (2026-10-17): the range card, a lazy chunk; its buttons reach the session through the bus
  let rangeCard: ReturnType<typeof import('./provingRangeCard.ts').createProvingRangeCard> | null = null;
  let rangeCardLoad: Promise<void> | null = null;
  let objectiveTeam: 'alpha' | 'bravo' = 'alpha';

  // --- the top-right corner (owner 2026-10-24: "right should have fps and other data like that"; "have a way to access
  // settings view"): the fps/ping readout while the player shows it (Interface: the performance meter), the link's ping
  // in a networked battle, then the settings gear and its key. The mouse layouts hang it from the corner as a plate;
  // touch keeps the readout's own place and the toolbar's gear (touchControls.ts). ---
  const netEl = el('div', 'cot-net', root);
  const netUnits = el('span', 'cot-net-units', netEl);
  netUnits.setAttribute('role', 'status');
  netUnits.setAttribute('aria-label', t('hud.net.perfAria'));
  // (each readout names its datum, UI-LOCKDOWN part B: one visible element a datum, the overlap receipt's duplicate check)
  netUnits.innerHTML = `<span class="cot-net-unit fps"${datumAttr('fps')}><b class="metric num">—</b><span class="label">${t('hud.net.fps')}</span></span>` +
    `<span class="cot-net-unit ping"${datumAttr('link')}><b class="metric">${t('hud.net.local')}</b><span class="label">${t('hud.net.link')}</span></span>`;
  const gearBtn = el('button', 'cot-hud-gear', netEl);
  gearBtn.type = 'button';
  gearBtn.dataset.uiSound = 'press';
  gearBtn.setAttribute('aria-label', t('touch.settingsAria'));
  gearBtn.dataset.tip = ''; // the kit's hover tip shows its name (the key cap is its only text)
  gearBtn.innerHTML = `${uiIconSVG('settings', 18)}<kbd class="cot-c-kbd" aria-hidden="true">Esc</kbd>`;
  const gearKey = requireElement<HTMLElement>(gearBtn, '.cot-c-kbd');
  // the same opening as the settings key (settingsAccess.ts: ui:openSettings)
  gearBtn.addEventListener('click', () => bus.emit('ui:openSettings', {}));
  const netFpsUnit = requireElement<HTMLElement>(netUnits, '.fps');
  const netPingUnit = requireElement<HTMLElement>(netUnits, '.ping');
  const netFpsValue = requireElement<HTMLElement>(netFpsUnit, '.metric');
  const netPingValue = requireElement<HTMLElement>(netPingUnit, '.metric');
  const netPingLabel = requireElement<HTMLElement>(netPingUnit, '.label');
  // the readout's units show once live frames are measured (.metered); the gear always
  let netFrames = 0;       // consecutive live frames since last mode switch
  let netLastMs = 0;       // wall-clock of previous update (fps EMA only)
  let netLastPaintMs = 0;  // DOM values update at 4 Hz, not every render frame
  let netEmaDt = 1 / 60;
  // The player's Interface preference on every device (off by default, brand-ui SPEC 12.1.6): touch layouts no longer
  // force the readout on.
  let netOptIn = false;
  function updateNetReadout(frame: HudFrame): void {
    if (!netOptIn) return;
    const now = performance.now();
    if (netLastMs > 0) {
      const dt = Math.min(0.25, (now - netLastMs) / 1000);
      netEmaDt += (dt - netEmaDt) * 0.08;
    }
    netLastMs = now;
    netFrames++;
    // forced screenshot frames run a single update after setMode — they keep
    // the deterministic default text; live battles settle onto measured fps.
    if (netFrames < 30 || now - netLastPaintMs < 250) return;
    netLastPaintMs = now;
    netEl.classList.toggle('metered', true);
    const fps = Math.max(1, Math.min(999, Math.round(1 / netEmaDt)));
    // Local play has no transport hop and reports 0 ms. Multiplayer forwards
    // the runtime client's measured RTT; never synthesize a decorative ping.
    const ping = Math.max(0, Math.min(999, Math.round(Number(frame?.pingMs) || 0)));
    // (the meter costs a few compared writes four times a second: only what changed is written)
    setText(netFpsValue, String(fps));
    setAttr(netFpsUnit, 'class', `cot-net-unit fps ${fps >= 50 ? 'good' : fps >= 28 ? 'warn' : 'bad'}`);
    setText(netPingValue, ping > 0 ? String(ping) : t('hud.net.local'));
    netPingValue.classList.toggle('num', ping > 0); // a ticking ms readout; the local link stays a word
    setText(netPingLabel, ping > 0 ? t('hud.net.ms') : t('hud.net.link'));
    setAttr(netPingUnit, 'class', `cot-net-unit ping ${ping <= 0 ? 'local' : ping < 80 ? 'good' : ping < 160 ? 'warn' : 'bad'}`);
    setAttr(netUnits, 'aria-label', ping > 0
      ? t('hud.net.ariaLive', { fps, ping })
      : t('hud.net.ariaLocal', { fps }));
  }

  // Player speedometer: the inexpensive, compositor-owned needle samples at
  // 30 Hz, the thin SVG arc at 20 Hz, and text at 10 Hz. CSS bridges those
  // samples, so motion stays responsive without putting DOM work on every RAF.
  const driveEl = el('div', 'cot-drive', root);
  driveEl.setAttribute('role', 'status');
  driveEl.setAttribute('aria-label', t('hud.drive.aria'));
  const driveTicks = Array.from({ length: 21 }, (_, index) =>
    `<i style="--tick:${index}"></i>`).join('');
  driveEl.innerHTML = `<div class="dial"><svg class="arc" viewBox="0 0 100 100" aria-hidden="true">` +
    `<g transform="rotate(135 50 50)"><circle class="arc-track" cx="50" cy="50" r="45" pathLength="100"/>` +
    `<circle class="arc-value" cx="50" cy="50" r="45" pathLength="100"/>` +
    `<circle class="arc-red" cx="50" cy="50" r="45" pathLength="100"/></g></svg>` +
    `<span class="ticks">${driveTicks}</span></div>` +
    `<div class="needle"></div><div class="hub"></div>` +
    `<strong class="speed num" data-drive-speed${datumAttr('speed')}>0</strong><span class="unit">${t('hud.drive.kmh')}</span>` +
    `<span class="zero">0</span><span class="limit" data-drive-limit>—</span>`;
  const driveSpeedEl = requireElement<HTMLElement>(driveEl, '[data-drive-speed]');
  const driveLimitEl = requireElement<HTMLElement>(driveEl, '[data-drive-limit]');
  const driveArcEl = requireElement<SVGCircleElement>(driveEl, '.arc-value');
  const driveNeedleEl = requireElement<HTMLElement>(driveEl, '.needle');
  const driveModel: DriveTelemetry = {
    speedKmh: 0,
    direction: 'HOLD',
    limitKmh: 0,
    speedRatio: 0,
    sweepDeg: 0,
    sweepLength: 0,
    needleDeg: -135,
  };
  let drivePlayerId: string | null = null;
  let driveLastTimeS = -1;
  let driveLastNeedleS = -1;
  let driveLastArcS = -1;
  let driveLastTextS = -1;
  let driveSpeedKmh = -1;
  let driveLimitKmh = -1;
  let driveSweepMilli = -1;
  let driveNeedleMilli = -999000;

  function updateDriveReadout(player: HudTank | null | undefined, timeS: number): void {
    const state = player?.state;
    if (!state) return;
    const nowS = Number.isFinite(timeS) ? timeS : 0;
    const freshRun = player.id !== drivePlayerId || nowS < driveLastTimeS;
    if (freshRun) {
      drivePlayerId = player.id;
      driveLastNeedleS = -1;
      driveLastArcS = -1;
      driveLastTextS = -1;
    }
    driveLastTimeS = nowS;
    const needleDue = freshRun || isDriveSampleDue(nowS, driveLastNeedleS, 1 / 30);
    const arcDue = freshRun || isDriveSampleDue(nowS, driveLastArcS, 1 / 20);
    const textDue = freshRun || isDriveSampleDue(nowS, driveLastTextS, 0.1);
    if (!needleDue && !arcDue && !textDue) return;

    fillDriveTelemetry(driveModel, state, player.spec);
    if (textDue) {
      driveLastTextS = nowS;
      if (driveModel.speedKmh !== driveSpeedKmh) {
        driveSpeedKmh = driveModel.speedKmh;
        driveSpeedEl.textContent = String(driveSpeedKmh);
      }
      if (driveModel.limitKmh !== driveLimitKmh) {
        driveLimitKmh = driveModel.limitKmh;
        driveLimitEl.textContent = String(driveLimitKmh);
      }
    }
    if (arcDue) {
      driveLastArcS = nowS;
      const sweepMilli = Math.round(driveModel.sweepLength * 1000);
      if (sweepMilli !== driveSweepMilli) {
        driveSweepMilli = sweepMilli;
        driveArcEl.style.strokeDasharray = `${sweepMilli / 1000} 100`;
      }
    }
    if (needleDue) {
      driveLastNeedleS = nowS;
      const needleMilli = Math.round(driveModel.needleDeg * 1000);
      if (needleMilli !== driveNeedleMilli) {
        driveNeedleMilli = needleMilli;
        driveNeedleEl.style.rotate = `${needleMilli / 1000}deg`;
      }
    }
  }

  // --- team panels ("ears") ---
  const earL = el('div', 'cot-ear l', root);
  const earR = el('div', 'cot-ear r', root);
  earL.innerHTML = `<div class="hd"><span class="tl">${t('hud.team.ally')}</span><span class="al num"></span></div>`;
  earR.innerHTML = `<div class="hd"><span class="al num"></span><span class="tl">${t('hud.team.enemies')}</span></div>`;
  const allyAliveEl = requireElement<HTMLElement>(earL, '.al');
  const enemyAliveEl = requireElement<HTMLElement>(earR, '.al');
  const allyTitleEl = requireElement<HTMLElement>(earL, '.hd .tl');
  const enemyTitleEl = requireElement<HTMLElement>(earR, '.hd .tl');
  const allyRoster = el('div', 'cot-ear-rows', earL);
  const enemyRoster = el('div', 'cot-ear-rows', earR);
  for (const [list, label] of [[allyRoster, t('hud.team.ally')], [enemyRoster, t('hud.team.enemies')]] as const) {
    list.tabIndex = 0;
    list.setAttribute('role', 'region');
    list.setAttribute('aria-label', label);
    list.addEventListener('keydown', event => { if (!document.pointerLockElement) event.stopPropagation(); });
    list.addEventListener('keyup', event => { if (!document.pointerLockElement) event.stopPropagation(); });
  }
  const killLedger = new BattleKillLedger();
  /** (ac130-fx-228) the combatants flying the gunship: their vehicle is the AC-130 (its icon in the silhouette's place) */
  const aircraftById = new Set<string>();
  const earRows = new Map<string, EarRow>(); // tank id -> { root, hp, dead, name }
  // Tab holds the rosters open, or toggles them when the player chose toggle for it (hold-or-toggle, Accessibility),
  // while the battle has the cursor; with the cursor free (paused, the report up) Tab moves the keyboard's focus, as
  // everywhere else (INTERACTION-REDESIGN C: captured on the window, no HUD button and no report button was reachable).
  window.addEventListener('keydown', event => {
    if (event.code !== 'Tab' || mode === 'hidden' || !document.pointerLockElement || document.body.classList.contains('cot-si-report')
        || isAnyModalOpen() || document.querySelector('.cot-settings.open') ||
        (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],.cot-room-chat'))) return;
    event.preventDefault();
    if (!A11Y.toggles.has('rosters')) root.classList.add('rosters-expanded');
    else if (!event.repeat) root.classList.toggle('rosters-expanded');
  }, true);
  const collapseRosters = (): void => { root.classList.remove('rosters-expanded'); };
  window.addEventListener('keyup', event => { if (event.code === 'Tab' && !A11Y.toggles.has('rosters')) collapseRosters(); }, true);
  window.addEventListener('blur', collapseRosters);

  const killfeed = markDatum(el('div', 'cot-killfeed', root), 'kill-feed');
  const killLeft = el('div', 'cot-kill-lane l', killfeed);
  const killRight = el('div', 'cot-kill-lane r', killfeed);
  // the player's kills and what they earned, centre low (hudKillRibbon.ts)
  const killRibbon = createKillRibbon(root);

  // ===================== SPECTATE BAR (killcam_endscreen r1) ================
  // Driven by killcam.ts's ally-spectate controller over the bus (additive
  // spectate:begin/change/end events). The GARAGE action adopts the
  // integration end button's existing click handler — either where main.ts
  // built it (.cot-end) or where the end screen reparented it ([data-es-action="garage"]).
  const specBar = el('div', 'cot-spec', root);
  specBar.innerHTML = spectatorSwitcherMarkup();
  specBar.setAttribute('role', 'region');
  specBar.setAttribute('aria-label', t('spectator.spectating'));
  const specWho = markDatum(requireElement<HTMLElement>(specBar, '.who'), 'watched');
  const specNick = requireElement<HTMLElement>(specBar, '.nick');
  const specVeh = requireElement<HTMLElement>(specBar, '.veh');
  const specIndex = requireElement<HTMLElement>(specBar, '.idx');
  const specPortrait = requireElement<HTMLImageElement>(specBar, '.portrait img');
  requireElement<HTMLButtonElement>(specBar, '.cycle.prev').addEventListener('click', () => {
    bus.emit('spectate:cycle', { direction: -1 });
    bus.emit('ui:click', {});
  });
  requireElement<HTMLButtonElement>(specBar, '.cycle.next').addEventListener('click', () => {
    bus.emit('spectate:cycle', { direction: 1 });
    bus.emit('ui:click', {});
  });
  requireElement<HTMLButtonElement>(specBar, '.gar').addEventListener('click', () => {
    const btn = document.querySelector<HTMLButtonElement>('.cot-end button')
      || document.querySelector<HTMLButtonElement>('.cot-es [data-es-action="garage"]');
    if (btn) btn.click(); // existing endOverlayRuntime Garage handler
  });
  // (the plate's picker of allies: the one chosen is watched, as Q and E step to it)
  const specAllies = mountSpectateAllies(specBar, (id) => {
    bus.emit('spectate:select', { id });
    bus.emit('ui:click', {});
  });
  function specPopulate(p: HudEventPayload, first: boolean): void {
    const ent = (lastTanksRef || []).find((t) => t && t.id === p.id) || null;
    // (each ally by the rosters' callsign, its tier and vehicle under it, as the plate reads)
    specAllies.update((p.allies ?? []).map((id) => {
      const ally = (lastTanksRef || []).find((t) => t && t.id === id) || null;
      const allyTier = ally?.spec?.id ? tierNumeral(ally.spec.id) : '';
      const vehicle = ally?.spec?.name ?? '';
      return { id, name: ally ? nickFor(ally) : String(id), vehicle: allyTier && vehicle ? `${allyTier} · ${vehicle}` : vehicle, specId: ally?.spec?.id };
    }), p.id ?? null);
    const card = spectatorCardModel(p);
    // same nickname the team panels show for this entity (nickById-backed)
    specNick.textContent = ent ? nickFor(ent) : (p.name || p.vehicle || String(p.id));
    const numeral = p.specId ? tierNumeral(p.specId) : '';
    const tier = numeral ? `${numeral} · ` : '';
    specVeh.textContent = `${tier}${p.vehicle || t('hud.spec.unknownVehicle')}`;
    specIndex.textContent = card.position;
    specIndex.hidden = !card.position;
    specNick.dataset.tip = specNick.textContent || '';
    specVeh.dataset.tip = specVeh.textContent || '';
    for (const button of specBar.querySelectorAll<HTMLButtonElement>('.cycle')) button.disabled = (p.count ?? 0) < 2;
    specPortrait.src = card.icon;
    specPortrait.hidden = !card.icon;
    specBar.classList.add('show');
    document.body.classList.add('cot-spectating'); // own-tank furniture off
    if (first) {
      void specBar.offsetWidth; // arm the slide-in transition from the parked pose
      specBar.classList.add('in');
    } else {
      specWho.classList.remove('sw');
      void specWho.offsetWidth;
      specWho.classList.add('sw'); // retarget pulse
    }
  }
  function specHide(): void {
    specAllies.close();
    specBar.classList.remove('in');
    document.body.classList.remove('cot-spectating');
    setTimeout(() => {
      if (!specBar.classList.contains('in')) specBar.classList.remove('show');
    }, 350);
  }
  on('spectate:begin', (p) => specPopulate(p, true));
  on('spectate:change', (p) => specPopulate(p, false));
  on('spectate:end', () => specHide());
  // =================== END SPECTATE BAR =====================================

  // ========================= SHOT-INFO SECTION ==============================
  // Combat intelligence (WoT damage-log mod class): shot cards with armor
  // diagrams for the player's connecting shots, incoming-hit toasts, a
  // collapsible last-6-shots + received-damage log (rebindable 'shotLog'
  // action -> bus 'ui:shotLog'), and the end-of-battle session stats.
  // All rendering/bookkeeping lives in src/ui/shotInfo.ts; the HUD only
  // mounts the layer and forwards player identity + lifecycle below.
  const shotInfo = createShotInfo(bus);
  shotInfo.setTeamResolver((id) => teamById.get(id));
  root.appendChild(shotInfo.root);
  // ======================= END SHOT-INFO SECTION ============================
  // battle_countdown r4: pre-battle freeze overlay — the numeral, the dial's ring after it (its drain keys off the
  // numeral's tick class), the status line; the rules panel a sibling (countdownPlace.ts places both)
  const preBattleEl = el('div', 'cot-prebattle', root);
  const pbNum = el('div', 'n', preBattleEl);
  preBattleEl.insertAdjacentHTML('beforeend', '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">'
    + '<circle class="trk" cx="50" cy="50" r="45"/><circle class="tks" cx="50" cy="50" r="49.5" pathLength="120"/>'
    + '<circle class="arc" cx="50" cy="50" r="45" pathLength="100" transform="rotate(-90 50 50)"/></svg>');
  const pbKick = el('div', 'k', preBattleEl);
  pbKick.textContent = t('hud.battleBeginsIn');
  // batch 19: the rules of engagement — one line per ruleset rule, Standard shows none
  const pbRules = el('div', 'cot-prebattle-rules', root);
  pbRules.setAttribute('aria-label', t('hud.preBattleRules'));
  const preBattleOverlay = createPreBattleOverlay(preBattleEl, pbKick, pbNum);
  // respawn (owner 2026-09-15): the revive count replaces the death hand-off to spectate/garage
  const reviveEl = el('div', 'cot-revive', root);
  reviveEl.setAttribute('aria-live', 'polite');
  const rvKick = el('div', 'k', reviveEl);
  const rvNum = el('div', 'n num', reviveEl);
  let liveRuleset: MatchRuleset | null = null;
  let reviveTimer: ReturnType<typeof setInterval> | null = null;
  let reviveUntil = 0;
  const reviveCountdown = {
    hide(): void {
      if (reviveTimer !== null) clearInterval(reviveTimer);
      reviveTimer = null;
      reviveEl.classList.remove('on');
    },
    /** A destroyed player in a reviving mode sees the seconds to the revive, never a garage bar. */
    onDestroyed(id: string | null | undefined): void {
      if (playerId == null || id !== playerId) return;
      reviveCountdown.start();
    },
    /** Frame-driven fallback: a death the bus never announced (debug kills) still counts down. */
    observe(dead: boolean): void {
      if (dead && reviveTimer === null) reviveCountdown.start();
      else if (!dead && reviveTimer !== null) reviveCountdown.hide();
    },
    start(): void {
      const respawnS = liveRuleset?.respawnS;
      if (respawnS == null) return;
      reviveCountdown.hide();
      reviveUntil = performance.now() + respawnS * 1000;
      rvKick.textContent = t('hud.revive.kicker');
      const tick = (): void => {
        const left = Math.max(1, Math.ceil((reviveUntil - performance.now()) / 1000));
        rvNum.textContent = String(left);
      };
      tick();
      reviveEl.classList.add('on');
      reviveTimer = setInterval(tick, 100);
    },
  };

  const alertEl = markDatum(el('div', 'cot-alert', root), 'notices');
  alertEl.setAttribute('role', 'status');
  alertEl.setAttribute('aria-live', 'polite');
  const alertIconEl = el('span', 'cot-alert-icon', alertEl);
  const alertCopyEl = el('span', 'cot-alert-copy', alertEl);
  const alertCountEl = el('span', 'cot-alert-count num', alertEl);
  alertEl.dataset.severity = 'warning';

  // ========================= SPOTTING SECTION ===============================
  // Sixth-sense lamp: 'player:spotted' (src/game/state.ts spotting wiring)
  // arms a 3 s fuse; when it burns down the bulb lights for 8 s. Its sound is
  // the audio engine's (a recorded alert through the mixer, so it follows the
  // volume and mute settings). Battle restarts reset the lamp (sim clock
  // restarts at 0).
  const sixthEl = el('div', 'cot-sixth', root);
  sixthEl.dataset.severity = 'warning';
  sixthEl.innerHTML = `<span class="sig">${uiIconSVG('lightbulb', 24)}</span>` +
    `<span class="copy"><span class="lb">${t('hud.sixth.label')}</span>` +
    `<span class="sub">${t('hud.sixth.sub')}</span></span>`;
  let sixthPendingS = -1; // sim time the lamp should light (spot time + 3 s)
  let sixthUntilS = -1;
  let sixthOn = false;
  /** On the proving ground the hulls are targets, not observers: no sixth sense (updateRangeCard keeps it). */
  let rangeActive = false;
  /** The proving ground's lanes this frame (updateRangeCard): the plate over a lane's hull names the lane. */
  let rangeLanes: RangeCardState['lanes'] | null = null;
  on('player:spotted', ({ timeS = 0 }) => {
    if (rangeActive) return;
    if (sixthPendingS < 0 && !(sixthOn && timeS < sixthUntilS - SIXTH_SENSE_DELAY_S)) {
      sixthPendingS = timeS + SIXTH_SENSE_DELAY_S;
    }
  });
  function updateSixthSense(timeS: number): void {
    if (sixthPendingS >= 0 && timeS >= sixthPendingS) {
      sixthPendingS = -1;
      sixthUntilS = timeS + SIXTH_SENSE_SHOW_S;
      if (!sixthOn) { sixthOn = true; sixthEl.classList.add('on'); }
    }
    if (sixthOn && (timeS > sixthUntilS || timeS < sixthUntilS - SIXTH_SENSE_SHOW_S - 1)) {
      sixthOn = false;
      sixthEl.classList.remove('on');
    }
  }

  const vehicleStatus = createVehicleStatusStrip();
  // ======================= END SPOTTING SECTION =============================

  // --- shell selector + consumables ---
  const controlsRow = el('div', 'cot-vehicle-controls', root);
  controlsRow.setAttribute('role','group'); controlsRow.setAttribute('aria-label',t('systems.title'));
  /** Binds a control of the row. A mouse acts on its press and suppresses the compatibility mouse event: while the
   *  game owns pointer lock a bubbled Mouse0 is the fire binding, and a click reaching window would fire the cannon
   *  alongside the action. A touch acts on its lift within TAP_SLOP_PX of where it began (UI-06): a swipe to aim that
   *  starts on a tile acts on nothing. Keyboard activation is a click with detail 0 and no press. */
  const bindControl = (button: HTMLButtonElement, act: () => void): void => {
    let touchId = -1, touchX = 0, touchY = 0;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.pointerType === 'mouse') { act(); return; }
      touchId = event.pointerId; touchX = event.clientX; touchY = event.clientY;
    });
    button.addEventListener('pointerup', (event) => {
      if (event.pointerId !== touchId) return;
      touchId = -1;
      event.stopPropagation();
      if (Math.hypot(event.clientX - touchX, event.clientY - touchY) <= TAP_SLOP_PX) act();
    });
    button.addEventListener('pointercancel', () => { touchId = -1; });
    button.addEventListener('click', (event) => { event.stopPropagation(); if (event.detail === 0) act(); });
  };
  // The row's tiles are the vehicle-action table's (src/game/vehicleActions.ts), each on its own key on every vehicle
  // (owner 2026-10-25: "consistent which keys do what and their order with each other"): the suspension (E) on a
  // hydropneumatic hull, the ATGM (Q) beside a conventional round, the magazine reload (C) on an autoloader.
  const specialButton = el('button', 'cot-special', controlsRow);
  specialButton.type = 'button';
  specialButton.hidden = true;
  specialButton.innerHTML = `<span class="si">${uiIconSVG(vehicleAction('suspension').glyph, 22, 'currentColor')}</span>`
    + `<span class="sl">${t(vehicleAction('suspension').label)}</span><span class="sk">E</span><small class="system-status"></small>`;
  specialButton.dataset.tip = t(vehicleAction('suspension').help);
  bindControl(specialButton, () => { if (!specialButton.hidden && !specialButton.disabled) bus.emit('ui:specialAction', {}); });
  // Owner (2026-09-16, Turbo Ball): the jump keycap shows only in rulesets with a jump launch.
  const jumpHint = el('button', 'cot-jump', controlsRow);
  jumpHint.type = 'button';
  bindControl(jumpHint, () => bus.emit('ui:selfRight', {}));
  // round 30 (owner 2026-09-20): a rocket marks the jump — it is a boost now, on the ground or in the air
  jumpHint.innerHTML = `<span class="si">${uiIconSVG('rocket', 18)}</span><span class="sl"></span><span class="sk">F</span><small class="system-status"></small>`;
  const jumpLabel = requireElement<HTMLElement>(jumpHint, '.sl');
  jumpLabel.textContent=t('hud.jump');
  jumpHint.setAttribute('aria-label', t('hud.jump'));
  jumpHint.dataset.tip = t('hud.jump'); // (its name reads as its glyph at the 11 px floor: the word in the hover tip)
  const jumpKey = requireElement<HTMLElement>(jumpHint, '.sk');
  const specialLabel = requireElement<HTMLElement>(specialButton, '.sl');
  const specialKey = requireElement<HTMLElement>(specialButton, '.sk');
  const specialStatus = requireElement<HTMLElement>(specialButton, 'small');
  const readSpecialAction = createSpecialActionPresentationReader();
  let specialKind: SpecialActionKind = SPECIAL_ACTION_KINDS.NONE;

  const droneButton = el('button', 'cot-auxiliary cot-drone-control', controlsRow); droneButton.type = 'button'; droneButton.hidden = true;
  droneButton.innerHTML = `<span class="si">${uiIconSVG('modeDrone',18)}</span><span class="sl"></span><span class="sk">V</span>`;
  droneButton.setAttribute('aria-label', t('systems.drone.help'));
  droneButton.dataset.tip = t('systems.drone.help');
  bindControl(droneButton, () => { if (!droneButton.disabled) bus.emit('ui:drone', {}); });
  const droneLabel = requireElement<HTMLElement>(droneButton, '.sl'), droneKey = requireElement<HTMLElement>(droneButton, '.sk');
  // The drone altimeter reads the same terrain height field as the spotting line-of-sight tests (set on map load).
  const aerialHud = createAerialHud(root,bus,() => heightFieldRef);
  const missileButton=el('button','cot-auxiliary',controlsRow);missileButton.type='button';missileButton.hidden=true;
  missileButton.innerHTML=`<span class="si">${uiIconSVG('missileRack',18)}</span><span class="sl">${t('systems.atgm')}</span><span class="sk">Q</span><small class="system-status"></small>`;
  missileButton.dataset.tip=t('systems.atgm.help');
  const missileLabel=requireElement<HTMLElement>(missileButton,'.sl'),missileKey=requireElement<HTMLElement>(missileButton,'.sk');
  let missilePlayer:HudTank|null|undefined=null,previousConventionalSlot=0;
  function toggleExtraMissile(){
    if(missileButton.hidden||missileButton.disabled||!missilePlayer)return;
    const slot=guidedMissileSlot(missilePlayer.spec);
    if(slot<0)return;
    bus.emit('ui:shellSelect',{slot:(missilePlayer.input?.shellSlot??missilePlayer.combat?.shellSlot)===slot?previousConventionalSlot:slot});
  }
  bindControl(missileButton, toggleExtraMissile);
  // Q (input.ts 'atgm', playerBattleActions.ts) toggles the same way the tile does
  bus.on('ui:atgmToggle', toggleExtraMissile);
  const reloadButton=el('button','cot-auxiliary cot-reload-control',controlsRow);reloadButton.type='button';reloadButton.hidden=true;
  reloadButton.innerHTML=`<span class="si">${uiIconSVG('autoloader',18)}</span><span class="sl">${t(vehicleAction('reload').label)}</span><span class="sk">C</span><small class="system-status"></small>`;
  reloadButton.dataset.tip=t(vehicleAction('reload').help);reloadButton.setAttribute('aria-label',t(vehicleAction('reload').label));
  const reloadLabel=requireElement<HTMLElement>(reloadButton,'.sl'),reloadKey=requireElement<HTMLElement>(reloadButton,'.sk');
  bindControl(reloadButton, () => { if (!reloadButton.hidden && !reloadButton.disabled) bus.emit('ui:magazineReload', {}); });
  let defaultLightsOn=false;
  bus.on('auxiliary:defaultLights',payload=>{defaultLightsOn=!!(payload as {on:boolean}).on;});
  const auxiliaryButtons = (['smoke','lights','roofGun'] as const).map(action=>{
    const button=el('button','cot-auxiliary',controlsRow);button.type='button';button.hidden=true;
    button.innerHTML=`<span class="si">${uiIconSVG(action==='lights'?'lightbulb':action,18)}</span><span class="sl">${t(`systems.${action}`)}</span><span class="sk"></span><small class="system-status num"></small>`;
    const help=t(`systems.${action}.help`);button.dataset.tip=help;button.setAttribute('aria-label',help);
    bindControl(button, () => { if (!button.disabled) bus.emit(`ui:${action==='lights' ? 'lightsToggle' : action}`, {}); });
    return {action,button,help,label:button.querySelector<HTMLElement>('.sl')!,status:button.querySelector('small')!,key:button.querySelector<HTMLElement>('.sk')!};
  });
  // Owner (2026-10-14): one ordering for the row (vehicleControlOrder.ts); a jump mode puts the jump farthest left.
  const auxiliaryButton=(action:'smoke'|'lights'|'roofGun')=>auxiliaryButtons.find(item=>item.action===action)!.button;
  // (each cap names its action, for the battle key caps' receipt: tools/battle-key-caps.browser.mjs)
  for (const [cap, action] of [[jumpKey, 'selfRight'], [specialKey, 'specialAction'], [missileKey, 'atgm'], [reloadKey, 'reloadMagazine'],
    [droneKey, 'drone'], ...auxiliaryButtons.map(({ key, action: id }) => [key, id] as const)] as const) cap.dataset.keyCap = action;
  const vehicleControls={jump:jumpHint,suspension:specialButton,atgm:missileButton,reload:reloadButton,drone:droneButton,
    smoke:auxiliaryButton('smoke'),lights:auxiliaryButton('lights'),roofGun:auxiliaryButton('roofGun')};
  let controlsJumpMode:boolean|null=null;
  function setControlsJumpMode(on:boolean):void{
    jumpHint.classList.toggle('on',on);
    if(controlsJumpMode===on)return;
    controlsJumpMode=on;
    arrangeVehicleControls(controlsRow,vehicleControls,on);
  }
  setControlsJumpMode(false);
  // UI-06: where a touch row holds fewer whole tiles than its controls, its last place pages through the rest
  // (battleHudLayout.ts writes the pages); a tap anywhere off the row returns it to its first page.
  const moreButton = el('button', 'cot-systems-more', controlsRow);
  moreButton.type = 'button';
  moreButton.hidden = true;
  moreButton.innerHTML = `<span class="si">${uiIconSVG('chevronRight', 18)}</span>`;
  moreButton.setAttribute('aria-label', t('systems.more'));
  const setControlsPage = (page: number): void => {
    if (controlsRow.dataset.page === String(page)) return;
    controlsRow.dataset.page = String(page);
    window.dispatchEvent(new Event('cot-hud-relayout'));
  };
  bindControl(moreButton, () => setControlsPage((Number(controlsRow.dataset.page) + 1) % Math.max(1, Number(controlsRow.dataset.pages) || 1)));
  window.addEventListener('pointerdown', (event) => {
    if (Number(controlsRow.dataset.page) > 0 && !controlsRow.contains(event.target as Node)) setControlsPage(0);
  }, true);
  /** A control's caption: its name, or a count it is showing (a cooldown), which a touch tile shows alone. */
  const setControlText = (label: Element, text: string, count: boolean): void => {
    setText(label, text);
    label.toggleAttribute('data-count', count);
    // a count is a figure (the .num voice); a name reads as the control's glyph (battleHudLayout.css, the 11 px floor)
    label.classList.toggle('num', count);
  };
  const reloadForSlot=createVehicleCooldownReader();
  function updateSpecialAction(player: HudTank | null | undefined, aim: HudAimInput | null | undefined = null): void {
    const canControl=!!player?.combat&&!player.combat.destroyed;
    setDisabled(jumpHint,!canControl);
    setHidden(controlsRow,!player);
    const flight = player?.aerial;
    setHidden(droneButton, flight?.kind !== 'drone');
    // Owner 2026-10-14: the authority refuses a recall before the drone's feed and holds the dock while the recalled
    // airframe flies home and lands; the countdown below runs to the relaunch.
    const drone = droneControl(flight, canControl);
    setDisabled(droneButton, drone.disabled);
    setData(droneButton, 'phase', drone.phase);
    droneButton.classList.toggle('active', !!flight?.active);
    setAttr(droneButton, 'aria-pressed', String(!!flight?.active));
    const droneWait = !flight?.active && (flight?.cooldownS ?? 0) > 0;
    setControlText(droneLabel, flight?.active ? t('systems.drone.return') : droneWait ? `${Math.ceil(flight!.cooldownS)}s` : t('systems.drone'), droneWait);

    root.classList.toggle('aerial-active', !!flight?.active);
    // (perf-249) the key hints leave a flight by this class on the body (settings.ts), not body:has(.cot-hud.aerial-active):
    // a body subject made every write anywhere in the page re-match the rule and restyle the whole page (~1,300 elements,
    // ~11 ms a frame, forced at the reticle's first canvas font). This root is the page's one HUD and never leaves it.
    document.body.classList.toggle('cot-hud-aerial', !!flight?.active);
    root.classList.toggle('aerial-drone', flight?.kind === 'drone' && flight.active);
    const kit=auxiliaryCapabilities(player?.spec), state=player?.combat?.auxiliary;
    for(const {action,button,help,label,status} of auxiliaryButtons){
      setHidden(button,!(action==='smoke'?kit?.smoke.length:action==='lights'?kit?.lights:kit?.guns.length));
      const cooldown=Math.max(0,Math.ceil((state?.smokeReadyAt||0)-lastTimeS));
      const active=action==='roofGun'?!!state?.gunOn:action==='lights'?(state?.lights===1 || (state?.lights!==0 && defaultLightsOn)):false;
      button.classList.toggle('active',active);
      if(action!=='smoke')setAttr(button,'aria-pressed',String(active));
      setDisabled(button,!canControl||(action==='roofGun'&&player?.combat?.modules?.roofGun?.state==='red')||(action==='smoke'&&(cooldown>0||state?.smokeCharges===0)));
      const smokeWait=action==='smoke'&&state?.smokeCharges!==0&&cooldown>0;
      setControlText(label,action==='smoke' && state?.smokeCharges===0 ? '0'
        : smokeWait ? t('systems.cooldown',{seconds:cooldown}) : t(`systems.${action}`),smokeWait);
      // (the charges left, as a shell slot counts its rounds: "3 / 3" would not fit a tile sharing a 900 px window's
      // rack six ways, gauntlet r3)
      setText(status,action==='smoke'?String(state?.smokeCharges??3):'');
      if(action==='smoke')setAttr(button,'aria-label',`${help} ${status.textContent}${cooldown?' · '+label.textContent:''}`);
    }
    const descriptor = readSpecialAction(player?.spec);
    if (descriptor) {
      previousConventionalSlot = Math.max(0, player?.spec?.gun?.shells.findIndex(shell => !shell.guided) ?? 0);
      specialKind = descriptor.kind;
      const suspension = specialKind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM;
      specialLabel.dataset.short = t(vehicleAction('suspension').label);
      specialButton.setAttribute('aria-label', specialLabel.dataset.short);
      specialButton.classList.toggle('show', suspension);
      specialButton.hidden = !suspension;
    }
    missilePlayer=player;
    const extraMissileSlot=guidedMissileSlot(player?.spec);
    setHidden(missileButton,extraMissileSlot<0||!player?.spec?.gun?.shells.some(shell=>!shell.guided));
    const autoloaded=!!player?.spec?.gun?.autoloader;
    setHidden(reloadButton,!autoloaded);
    const combat=player?.combat;
    const emptyMissileLabel=depletedMissileLabel(combat,extraMissileSlot,player?.spec?.gun?.shells[extraMissileSlot]);
    const missileEmpty=emptyMissileLabel!==null;
    setDisabled(missileButton,!canControl||missileEmpty);
    // Owner 2026-10-17 (out of ammo): a spent launcher shows its struck icon in the danger ink; the count is spoken only.
    missileButton.classList.toggle('empty',missileEmpty);
    const missileSelected=player?.combat?.shellSlot===extraMissileSlot;
    if(player?.combat&&!missileSelected)previousConventionalSlot=player.combat.shellSlot;
    missileButton.classList.toggle('active',missileSelected&&!missileEmpty);setAttr(missileButton,'aria-pressed',String(missileSelected));
    const action = player?.specialAction;
    // Missile selection is ordinary ammunition state. Keep the E shortcut
    // visibly latched for as long as that slot remains selected; 1/2/3 are
    // the only actions that clear it. True modes continue to use action.active.
    const active = specialActionIsActive(action, player?.combat?.shellSlot);
    // Weapon channels keep the missile timer accurate even while the cannon is selected.
    const missileWait=extraMissileSlot>=0?Math.ceil(reloadForSlot(combat,extraMissileSlot,lastTimeS) || 0):0;
    setControlText(missileLabel,!missileEmpty&&missileWait>0?t('systems.cooldown',{seconds:missileWait}):t('systems.atgm'),!missileEmpty&&missileWait>0);
    setAttr(missileButton, 'aria-label', emptyMissileLabel ? `${t('garage.shellType.ATGM')} ${emptyMissileLabel}` : t('garage.shellType.ATGM'));
    // A magazine reload with nothing stowed to load is spent: no countdown, no pointless reload.
    // This frame's cards (the tray reads them after this update): the ruleset's unlimited mark never reads spent.
    const cards=aim?.shells??lastShells;
    const reloadEmpty=autoloaded&&magazineFeedEmpty(combat,player?.spec,cards?.[aim?.shellSlot??localSlot]?.unlimited===true);
    const reloadWait=autoloaded&&!reloadEmpty?Math.ceil(combat?.gunReload?.t??combat?.reload.t??0):0;
    // (a magazine reload's seconds are the reticle's countdown: the control keeps its word, busy, UI-LOCKDOWN B6)
    setControlText(reloadLabel,t(vehicleAction('reload').label),reloadWait>0);
    reloadButton.classList.toggle('empty',reloadEmpty);
    setDisabled(reloadButton,!canControl||!autoloaded||reloadEmpty);
    const suspension = specialKind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM;
    setControlText(specialLabel,specialLabel.dataset.short||'',false);
    setText(specialStatus, '');
    specialButton.classList.toggle('active', active&&suspension);
    // (toggle with its force writes nothing when unchanged; remove() always rewrites the class attribute)
    specialButton.classList.toggle('pending', false);
    setDisabled(specialButton, !canControl || !suspension);
    setAttr(specialButton, 'aria-pressed', active&&suspension ? 'true' : 'false');
  }

  const shellBox = markDatum(el('div', 'cot-shells', root), 'ammo');
  const ammoSwitchingStatus = el('span', 'cot-ammo-switching', shellBox);
  ammoSwitchingStatus.setAttribute('role', 'status');
  ammoSwitchingStatus.setAttribute('aria-live', 'polite');
  ammoSwitchingStatus.setAttribute('aria-label', t('hud.ammo.waitingForHostAria'));
  ammoSwitchingStatus.hidden = true;
  shellBox.setAttribute('role', 'group');
  shellBox.setAttribute('aria-label', t('hud.ammunition.aria'));
  const slotEls: ShellSlotButton[] = [];
  const slotPresentations: RetainedAmmunitionSlot[] = [];
  let touchAmmoOpen = false;
  let renderedTouchAmmoOpen: boolean | undefined;
  // the open rack is a transient surface (components/surfaceStack.ts): opening it closes the spectate list or a menu, and a
  // press outside it is the stack's
  const ammoRackSurface: TransientSurface = { id: 'hud-ammo-rack', element: () => shellBox, close: () => setTouchAmmoOpen(false) };
  function setTouchAmmoOpen(open: boolean): void {
    const touch = document.body.classList.contains('cot-touch-layout');
    touchAmmoOpen = !!open && touch;
    if (touchAmmoOpen) openSurface(ammoRackSurface, shellBox); else closeSurface(ammoRackSurface);
    if (renderedTouchAmmoOpen !== touchAmmoOpen) {
      shellBox.classList.toggle('touch-open', touchAmmoOpen);
      renderedTouchAmmoOpen = touchAmmoOpen;
    }
    let rank = 0;
    for (const slot of slotPresentations) {
      slot.layout(touch, touchAmmoOpen, slot.selected ? 0 : ++rank);
    }
  }
  function activateShellSlot(index: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const touch = document.body.classList.contains('cot-touch-layout');
    if (touch && !touchAmmoOpen) {
      setTouchAmmoOpen(true);
      return;
    }
    if (touch) setTouchAmmoOpen(false);
    bus.emit('ui:shellSelect', { slot: index });
    bus.emit('ui:click', {});
  }
  for (let i = 0; i < 3; i++) {
    const s = el('button', 'cot-shell', shellBox) as ShellSlotButton;
    s.type = 'button';
    s.innerHTML = `<div class="key">${i + 1}</div><div class="cnt"></div><div class="ty"></div>` +
      `<div class="clr"></div><span class="tchev" aria-hidden="true">${uiIconSVG('chevronLeft', 14)}</span>` +
      `<div class="tip"><div class="tnm"></div>${t('hud.shell.pen')} <b class="p"></b> &nbsp;&middot;&nbsp; ${t('hud.shell.dmg')} <b class="d"></b></div>` +
      `<div class="cool"></div>`;
    let iconType = '';
    s._icon = createUiCanvas(null, '', {
      units: [SHELL_ICON_UNITS, SHELL_ICON_UNITS],
      draw: (c) => { if (iconType) drawShellIcon(c, iconType); },
    });
    requireElement<HTMLElement>(s, '.key').after(s._icon.canvas);
    slotPresentations.push(createRetainedAmmunitionSlot({
      index: i,
      elements: {
        button: s,
        type: requireElement<HTMLElement>(s, '.ty'),
        underline: requireElement<HTMLElement>(s, '.clr'),
        name: requireElement<HTMLElement>(s, '.tnm'),
        penetration: requireElement<HTMLElement>(s, '.p'),
        damage: requireElement<HTMLElement>(s, '.d'),
        count: requireElement<HTMLElement>(s, '.cnt'),
        cooldown: requireElement<HTMLElement>(s, '.cool'),
      },
      locale: getLocale,
      drawIcon: (type) => { iconType = type; s._icon.redraw(); },
      typeLabel: shellTypeCode,
      count: shellCount,
      selectionLabel: ammunitionSelectionLabel,
      underlineColors: SHELL_CLASS_UNDERLINE,
    }));
    s.addEventListener('pointerdown', (event) => {
      if (document.body.classList.contains('cot-touch-layout')) activateShellSlot(i, event);
    });
    s.addEventListener('click', (event) => {
      if (document.body.classList.contains('cot-touch-layout') && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      activateShellSlot(i, event);
    });
    slotEls.push(s);
  }
  setTouchAmmoOpen(false);
  const conSep = el('div', 'cot-consep', shellBox);
  // MOBILE-UX r1: consumables get their own wrapper (desktop: display:contents
  // — no box, no layout change; mobile tier re-parks it as a vertical column)
  const conBox = markDatum(el('div', 'cot-cons', shellBox), 'consumables');
  const conEls: HTMLButtonElement[] = [];
  const conSlots: RetainedConsumableSlot[] = [];
  const conReadyAt = [0, 0, 0];
  const conItems: ConsumableId[] = [...DEFAULT_CONSUMABLE_LOADOUT];
  const conCooldownS = conItems.map((id) => consumableTiming(id).cooldownS);
  /** Uses left this life per slot (null is unlimited). */
  const conCharges: (number | null)[] = conItems.map((id) => consumableTiming(id).charges);
  const conMark = (i: number): string => conCharges[i] == null ? CONSUMABLE_READY_MARK : String(conCharges[i]);
  /** A tile's retained slot over its current item (made again when the item changes, so its label memo starts fresh). */
  const conSlotFor = (i: number, s: HTMLButtonElement): RetainedConsumableSlot => createRetainedConsumableSlot({
    elements: {
      button: s,
      count: requireElement<HTMLElement>(s, '.cnt'),
      cooldown: requireElement<HTMLElement>(s, '.cool'),
    },
    locale: getLocale,
    readyMark: () => conMark(i),
    readyLabel: () => t('hud.consumable.ready', { name: consumableLabel(conItems[i]!) }),
    coolingLabel: (seconds) => t('hud.consumable.cooling', { name: consumableLabel(conItems[i]!), seconds }),
  });
  for (let i = 0; i < CONSUMABLE_KEYS.length; i++) {
    const id = conItems[i]!;
    const s = el('button', 'cot-con', conBox);
    s.type = 'button';
    s.dataset.tip = consumableLabel(id);
    s.dataset.item = id;
    s.setAttribute('aria-label', t('hud.consumable.ready', { name: consumableLabel(id) }));
    s.innerHTML = `<div class="key">${CONSUMABLE_KEYS[i]}</div>${consumableSvg(id)}` +
      `<div class="cnt">${conMark(i)}</div><div class="cool"></div>`;
    conSlots.push(conSlotFor(i, s));
    const activateConsumable = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      bus.emit('ui:consumable', { slot: i });
    };
    s.addEventListener('pointerdown', (event) => {
      if (document.body.classList.contains('cot-touch-layout')) activateConsumable(event);
    });
    s.addEventListener('click', (event) => {
      if (document.body.classList.contains('cot-touch-layout') && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      activateConsumable(event);
    });
    conEls.push(s);
  }

  /** A slot takes another item: its glyph, names, cooldown and uses (the key cap a rebind set stays). */
  function setConsumableTile(i: number, id: ConsumableId): void {
    const s = conEls[i];
    if (!s) return;
    conItems[i] = id;
    const timing = consumableTiming(id);
    conCooldownS[i] = timing.cooldownS;
    conCharges[i] = timing.charges;
    conReadyAt[i] = 0;
    s.dataset.tip = consumableLabel(id);
    s.dataset.item = id;
    const glyph = s.querySelector('svg');
    const holder = document.createElement('div');
    holder.innerHTML = consumableSvg(id);
    if (glyph && holder.firstElementChild) glyph.replaceWith(holder.firstElementChild);
    s.classList.remove('used', 'deny', 'empty');
    conSlots[i] = conSlotFor(i, s);
    conSlots[i]!.render(0, conCooldownS[i]!);
  }
  on(BATTLE_CONSUMABLES_EVENT, (payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : null;
    if (!items) return;
    for (let i = 0; i < conEls.length && i < items.length; i++) {
      if (isConsumableId(items[i])) setConsumableTile(i, items[i]);
    }
  });

  function updateConsumableCooldowns(timeS: number): void {
    for (let i = 0; i < conSlots.length; i++) {
      conSlots[i].render(cooldownRemaining(timeS, conReadyAt[i]), conCooldownS[i]);
    }
  }
  /** The consumable the moment calls for (the direction's suggested tile, on the tungsten hairline): the repair kit while
   *  a module is knocked out, first aid while a crew member is down, the extinguisher while the tank burns. Each slot's
   *  class is written only when it changes. */
  const conSuggested = [false, false, false];
  function suggestConsumable(slot: number, on: boolean): void {
    if (conSuggested[slot] === on || !conEls[slot]) return;
    conSuggested[slot] = on;
    conEls[slot].classList.toggle('sugg', on);
  }
  function updateConsumableSuggestions(combat: CombatState | null | undefined): void {
    let moduleDown = false, crewDown = false, burning = false;
    if (combat && !combat.destroyed) {
      const modules = combat.modules;
      for (const name in modules) if (modules[name as keyof typeof modules]?.state === 'red') { moduleDown = true; break; }
      for (const name in combat.crew) if (!combat.crew[name]) { crewDown = true; break; }
      burning = !!combat.fire?.burning;
    }
    // each tile by its item: a repair while a module is out, first aid while a crew member is down, a fire kit while
    // the tank burns
    for (let i = 0; i < conItems.length; i++) {
      const id = conItems[i];
      suggestConsumable(i, id === 'repair' || id === 'repair_large' ? moduleDown
        : id === 'first_aid' ? crewDown
          : id === 'extinguisher' || id === 'fire_suppression' ? burning : false);
    }
  }

  // --- minimap ---
  const mmWrap = el('div', 'cot-minimap', root);
  // (UI-LOCKDOWN A) the map draws in its 220-unit square, stretched by uiCanvas over the plate's box at the capped ratio:
  // every size step (--mm-k) and layout gets a store of its own size, released while the plate is hidden
  const MM = 220;
  const mmSurface = createUiCanvas(mmWrap, '', { units: [MM, MM], onResize: () => { mmDirty = true; } });
  // the glyphs' letters (zones, sectors, lanes): DOM over the map, in its units scaled to the plate (canvasText.ts)
  const mmLetters = createCanvasText(mmWrap, 'cot-mm-letters');
  // the map plate's header on the wide mouse layouts: the battlefield's name and the map key (the direction's .mm .hd)
  const mmHead = el('div', 'cot-mm-hd', mmWrap);
  // (its key cap is the size control's, INTERACTION-REDESIGN C: the large map had a key and no control)
  mmHead.innerHTML = `<span class="nm"${datumAttr('map-name')}></span>`
    + `<button type="button" class="cot-mm-size" aria-pressed="false" aria-label="${t('hud.map.large')}">`
    + `${uiIconSVG('zoomIn', 14)}<kbd class="cot-c-kbd" aria-hidden="true">M</kbd></button>`;
  const mmName = requireElement<HTMLElement>(mmHead, '.nm');
  const mmKey = requireElement<HTMLElement>(mmHead, '.cot-c-kbd');
  const mmSize = requireElement<HTMLButtonElement>(mmHead, '.cot-mm-size');
  // the grid's coordinates, WoT's convention: numbers are the columns (1 west to 0 east, along the top), letters the rows
  // (A north to K south, down the left), in the plate's gutter (the CSS above)
  const mmCols = el('div', 'cot-mm-gx', mmWrap), mmRows = el('div', 'cot-mm-gy', mmWrap);
  mmCols.setAttribute('aria-hidden', 'true'); mmRows.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 10; i++) { el('span', '', mmCols).textContent = String((i + 1) % 10); el('span', '', mmRows).textContent = GRID_LETTERS[i]; }
  /** The baked underlay's texels per map unit: a texture, independent of the screen (the plate draws it scaled). */
  const MM_BAKE_RATIO = 2;
  const mmCtx = mmSurface.context;
  // Canvas for the procedural/bake path, HTMLImageElement for production.
  // Keeping the decoded baked image as the draw source avoids iPad Safari's
  // memory-pressure canvas purge, which left live blips over a blank panel.
  let mmBg: HTMLCanvasElement | HTMLImageElement | null = null;
  let mmCaptureReceipt: MinimapCaptureReceipt | null = null;

  // --- internal state ---
  let mode: HudMode = 'hidden';
  let directionalHitValuesEnabled = false;
  let mmLastPaintMs = -1e9; // minimap repaint throttle (PERF: 15 Hz, 30 Hz while the view turns; updateMinimapIfDue)
  let mmDirty = true; // force an immediate minimap paint on the next update()
  // The grid's coordinates show on a plate large enough for a cell to hold one at the HUD's 11 px floor (the coordinator,
  // 246): under 140 px (the phones') the grid keeps its lines alone. The gutter they take shrinks a border-box plate's map,
  // so the plate shows them from 150 px and drops them under 140 (no flicker at the edge). Its observer keeps layout reads
  // out of the frame loop.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver((entries) => {
      const shown = entries[entries.length - 1]?.borderBoxSize?.[0]?.inlineSize ?? MM;
      const grid = mmWrap.classList.contains('grid');
      if (grid ? shown < 140 : shown >= 150) mmWrap.classList.toggle('grid', !grid);
    }).observe(mmWrap);
  }
  let mmBuildGeneration = 0;
  const minimapAssetCache = new Map<string, Promise<HTMLImageElement>>();
  const minimapForestX = new Float32Array(12);
  const minimapForestY = new Float32Array(12);
  let w = 1, h = 1;
  let scopeGrad: CanvasGradient | null = null;
  let scopeGradZoom = -1;
  let scopeFadeMs = -1; // scope-shadow fade-in start (perf.now ms; -1 = settled)
  let scopePrevMode: HudMode = 'hidden'; // transition detector for the fade
  let lastCamera: THREE.PerspectiveCamera | null = null;
  let lastTimeS = 0;
  let playerId: string | null = null;
  let smoothRadPx = 40;
  let wasReloading = false; // reload-complete edge detector (ready pulse)
  let readyPulseT = -1;     // sim time the reload-dot sweep finished draining
  let localSlot = 0;
  let forced: HudAimInput | null = null; // partial FrameInfo.aim override (cleared by next update)
  let lastShells: HudShellCard[] = DEFAULT_SHELLS;
  // The alert band (the kit's NoticeQueue, components/notice.ts, on the planners' one slot): one alert shows at a time; a
  // repeat raises its count and restarts its time, a higher severity takes the band (the alert it displaces waits again),
  // an alert that waited past ALERT_STALE_MS is dropped, and the game's pause holds the time.
  let alertTimer: ReturnType<typeof setTimeout> | null = null;
  let alertSerial = 0;
  const alertBorn = new Map<string, number>();
  const alertQueue = new NoticeQueue(1, () => performance.now(), {
    show: (toast) => paintAlert(toast),
    update: (toast) => paintAlert(toast),
    hide: () => { alertEl.classList.remove('show'); },
  });
  let heightFieldRef: HudHeightField | null = null; // for spotting line-of-sight tests
  const nameById = new Map<string, string>();
  const teamById = new Map<string, string | undefined>();
  const specIdById = new Map<string, string>(); // entity id -> tank spec id (icon lookups)
  const callsignById = new Map<string, string>(); // entity id -> the callsign the rosters show (feed, ribbon)
  const nationById = new Map<string, string>(); // entity id -> its vehicle's nation (flags)
  // incoming-hit direction wedges (hitind r1, on the killcam_endscreen r1
  // world-anchoring): SHOOTER world pos + impact kind — screen angle re-projected
  // per frame from the camera basis so the wedges counter-rotate with the
  // camera (see pushHitDirection root-cause note). `re` marks a merged
  // repeat (re-pulse attack); max 5 live entries.
  const hitDirs: HitDirection[] = [];
  const incomingHitOrigin: IncomingHitOrigin = { x: 0, z: 0 };
  const hitIndicatorFrameScratch: HitIndicatorFrameState = {
    playerX: 0, playerZ: 0,
    rightX: 0, rightZ: 0, forwardX: 0, forwardZ: 0,
    centerX: 0, centerY: 0, minDimension: 0, radius: 0, thickness: 0,
  };
  const hitIndicatorPaintScratch: HitIndicatorPaintState = {
    age: 0, angle: 0, alpha: 0, growth: 0, halfAngle: 0, thickness: 0,
    rimHalfAngle: 0, bodyColor: '', bodyAlpha: 0, rimColor: '', rimAlpha: 0,
  };
  const liveNums: LiveDamageNumber[] = [];
  let hitMark: HitMark | null = null;
  const hitConfirmScratch: HitConfirmState = {
    visible: false, opacity: 0, radius: 18.5, length: 13, halfWidth: 3.5, flash: 0,
  };
  let lastMagazineIndicatorY: number | null = null;
  let lastMagazineIndicatorState: AutoloaderHudState | null = null;
  const magazineHudScratch: AutoloaderHudState = {
    capacity: 0, rounds: 0, visibleShells: 0, readyShells: 0, feedShells: 0, overflow: 0,
    fullReload: false, loadProgress: 0, intraClip: false, reloading: false, dry: false,
  };
  const magazineShellPoseScratch: AutoloaderShellPose = { y: 0, rotation: 0 };
  /** The scope's readout line (sniperReadoutLine; `label` is the count and its space, rebuilt only when the count does). */
  const sniperLineScratch = { count: '', label: ' ', type: '', countW: 0, typeW: 0, round: 0 };
  const sniperStackScratch = { y: 0, lineX: 0, zoomX: 0, zoomY: 0 };
  /** The scope row's parts for this repaint (sniperReadoutStack fills it; settleSniperRow reads it): no closure per frame.
   *  `best*` hold the place that reached least far into the furniture (the last resort). */
  const sniperRowScratch = { lineW: 0, zoomW: 0, chipW: 0, lineTop: 0, lineFoot: 0, lineOver: 0, lineLeft: 0, zoomLeft: 0, chipRight: 0,
    besideLeft: 0, chipAbove: false, noZoom: false, chipOverY: 0, mode: 'stack' as SniperRowMode,
    bestClear: -Infinity, bestMode: 'stack' as SniperRowMode, bestChipAbove: false, bestNoZoom: false };
  /** One part of the scope row (sniperRowPart). */
  const sniperPartScratch = { x0: 0, x1: 0, top: 0, foot: 0 };
  /** The seated touch warning chip's last written place (paintAimWarning writes the DOM only when it moves). */
  const touchWarningSeat = { seated: false, x: NaN, y: NaN, w: NaN };
  const sniperTagScratch = { text: '', metres: NaN, x0: 0, x1: 0, y: 0, y0: 0, y1: 0 };
  // The boxes the reticle's marks took this frame (noteSightInk; prepareReticleDraw empties it): the scope's cross arms
  // and mil ticks yield to them (paintScopeSkeleton, r10f).
  const sightInk = { count: 0, boxes: Array.from({ length: 24 }, () => ({ x0: 0, y0: 0, x1: 0, y1: 0 })) };
  // (the cut runs of one cross arm: start and end pairs, sorted in place)
  const scopeCutScratch = new Float64Array(2 * 80);
  const reticleDrawScratch: ReticleDrawState = {
    cx: 0, cy: 0, radius: RET_FLOOR_PX, circleX: 0, circleY: 0,
    sniper: false, blocked: false, limited: false,
    reloadFraction: 0, reloading: false, dry: false,
    gunColor: PEN_NONE, ringColor: CIRCLE_COL,
    zoomScale: 1, markerLineWidth: 1.6, centerClearanceRadius: 14,
    single: false, magazine: null, magazineBottomY: 0, magazineHalfW: 0, magazineInkBottomY: 0, countdownBottomY: 0,
    countdownRightX: 0, warningY: 0, warningX: 0, warningW: 0, aboveTopY: Infinity, tagTopY: Infinity,
  };
  const hudFrameUpdateScratch: HudFrameUpdateState = {
    advancing: false,
    camera: null,
    dt: 1 / 60,
  };
  const hpPool = new Map<string, HpBar>(); // tank id -> { root, fill, nm, lastFrac }
  const spotById = new Map<string, SpotMemory>(); // tank id -> { vis, lastT, lastX, lastZ, ever }
  let mapWorldSize = 1024;
  let lastScore = '';
  let lastTimer = '';
  let lastTimerLabel = '';
  let spawnFlags: SpawnFlag[] | null = null; // team spawn markers, set per battle

  /** Clear every transient combat-feedback owner at a round/phase boundary. */
  function resetCombatPresentation(): void {
    hitDirs.length = 0;
    hitMark = null;
    for (const number of liveNums) clearTimeout(number.timer);
    liveNums.length = 0;
    dmgLayer.replaceChildren();
    killLeft.replaceChildren();
    killRight.replaceChildren();
    killRibbon.clear();
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }
    // (the waiting line first, so emptying the band shows nothing from it)
    for (const toast of [...alertQueue.waiting, ...alertQueue.shown]) alertQueue.remove(toast.id);
    alertBorn.clear();
    alertEl.classList.remove('show', 'danger', 'warning', 'success', 'info');
  }

  /** The HUD's own side changed mid-battle (Watch mode: a seat taken on the other side, or left): re-seat the sides. */
  /** The ears' titles: yours and the enemy's, or a spectator's sides by name. */
  function titleSides(): void {
    const own = t(watchSide !== null ? 'hud.side.alpha' : 'hud.team.ally');
    const enemy = t(watchSide !== null ? 'hud.side.bravo' : 'hud.team.enemies');
    allyTitleEl.textContent = own;
    enemyTitleEl.textContent = enemy;
    allyRoster.setAttribute('aria-label', own);
    enemyRoster.setAttribute('aria-label', enemy);
  }

  function reseatSides(): void {
    for (const row of earRows.values()) row.root.remove();
    earRows.clear();
    for (const [, bar] of hpPool) bar.root.remove();
    hpPool.clear();
    lastScore = '';
    mmDirty = true;
  }

  // The sight's layout box (projection and placement, CSS px). Its backing store is uiCanvas's: the box × min(DPR, 2)
  // within the renderer's 4K budget (a DPR-3 phone keeps the 2x raster: the sight repaints every frame), sized in
  // retSurface.begin() from the observer's box, so a resize, a DPR flip or a hidden HUD never leaves an old store.
  function resize(): void {
    w = root.clientWidth || window.innerWidth;
    h = root.clientHeight || window.innerHeight;
    // (the target plate a size up on a large window, measured again at the next target frame)
    const large = w >= TARGET_PLATE_LARGE_W && h >= TARGET_PLATE_LARGE_H;
    if (large !== tgtEl.classList.contains('lg')) {
      tgtEl.classList.toggle('lg', large);
      // (a shown plate measured again now: a still view sends no frame after a resize, gauntlet watch-drone at 1440x900)
      if (tgtShown) measureTargetPlate();
      else tgtMeasure = true;
    }
    scopeGrad = null;
    scopeGradZoom = -1;
  }
  window.addEventListener('resize', resize);
  // (battle-camera-264) and once responsiveLayout.ts has sized the root for the new window: read at the resize alone, a
  // rotated phone's sight kept the old width (the aim point projected on the portrait centre in landscape, its reticle off
  // where the shell goes) until the next resize
  window.addEventListener('cot:layoutchange', resize);
  resize();
  root.style.display = 'none'; // starts hidden until setMode/update

  function selectSlot(i: number): void {
    localSlot = i;
    for (let k = 0; k < 3; k++) slotPresentations[k].select(k === i);
    setTouchAmmoOpen(false);
  }

  // ---------- projection ----------
  let _sx = 0, _sy = 0, _sVisible = false, _sDist = 0;
  function project(camera: THREE.PerspectiveCamera, x: number, y: number, z: number): void {
    _cs.set(x, y, z).applyMatrix4(_mInv);
    _sDist = -_cs.z;
    if (_cs.z > -0.3) { _sVisible = false; return; }
    _ndc.copy(_cs).applyMatrix4(camera.projectionMatrix);
    _sx = (_ndc.x * 0.5 + 0.5) * w;
    _sy = (-_ndc.y * 0.5 + 0.5) * h;
    _sVisible = _sx > -200 && _sx < w + 200 && _sy > -200 && _sy < h + 200;
  }

  function pxPerMeterAt(camera: THREE.PerspectiveCamera | null | undefined, dist: number): number {
    const fov = (camera && camera.fov ? camera.fov : 60) * Math.PI / 180;
    return (h * 0.5) / (Math.tan(fov * 0.5) * Math.max(dist, 1));
  }

  // ---------- spotting ----------
  function hasLOS(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ): boolean {
    if (!heightFieldRef) return true;
    const steps = 16;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const gy = y0 + (y1 - y0) * t;
      const gh = heightFieldRef.getHeightAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (gh > gy + 0.9) return false;
    }
    return true;
  }

  function spotMemoryFor(tank: HudTank): SpotMemory {
    const existing = spotById.get(tank.id);
    if (existing) return existing;
    const memory: SpotMemory = {
      vis: false,
      lastT: -1e9,
      lastX: 0,
      lastZ: 0,
      lastYaw: 0,
      ever: false,
    };
    spotById.set(tank.id, memory);
    return memory;
  }

  function rememberSpottedPose(memory: SpotMemory, state: TankState): void {
    memory.lastX = state.pos.x;
    memory.lastZ = state.pos.z;
    memory.lastYaw = state.yaw;
  }

  function fallbackTankVisible(
    playerState: TankState,
    tankState: TankState,
  ): boolean {
    const dx = tankState.pos.x - playerState.pos.x;
    const dz = tankState.pos.z - playerState.pos.z;
    if (Math.hypot(dx, dz) > SPOT_RANGE_M) return false;
    return hasLOS(
      playerState.pos.x,
      playerState.pos.y + 2.6,
      playerState.pos.z,
      tankState.pos.x,
      tankState.pos.y + 1.9,
      tankState.pos.z,
    );
  }

  function updateSpotMemory(
    memory: SpotMemory,
    state: TankState,
    seen: boolean,
    authoritative: boolean,
    timeS: number,
  ): void {
    if (seen) {
      memory.lastT = timeS;
      memory.ever = true;
      rememberSpottedPose(memory, state);
    }
    memory.vis = authoritative ? seen : seen || timeS - memory.lastT < SPOT_PERSIST_S;
    // Hidden contacts retain the last observed pose, including during fallback linger.
  }

  function updateSpotting(frame: HudFrame): void {
    const player = frame.player;
    if (!player?.state) return;
    const tanks = frame.tanks || [];
    const spotting = frame.spotting?.isSpotted ? frame.spotting : null;
    for (let i = 0; i < tanks.length; i++) {
      const tank = tanks[i];
      if (!tank?.state || tank.isPlayer || tank.team === ownSide()) continue;
      // Wave reserves are off the battlefield. Discard their previous wave's
      // contact so reactivation cannot resurrect a stale map position.
      if (tank.modeActive === false) {
        spotById.delete(tank.id);
        continue;
      }
      if (tank.combat?.destroyed) {
        // Wreck crosses are drawn separately. A dead tank's contact must never
        // survive into its next life at an unseen respawn point.
        spotById.delete(tank.id);
        continue;
      }
      const memory = spotMemoryFor(tank);
      // SPOTTING SECTION: when the concealment sim is wired in (frame.spotting
      // from src/sim/spotting.ts via main.ts) it is the single source of truth
      // — camo values, bushes, fire bloom and the 5 s linger all live there.
      // The legacy range+terrain-LOS model below stays as the fallback for
      // forced screenshot frames and headless fixtures.
      const seen = spotting
        ? spotting.isSpotted(tank.id)
        : fallbackTankVisible(player.state, tank.state);
      updateSpotMemory(memory, tank.state, seen, !!spotting, frame.timeS);
    }
  }

  function isSpotted(id: string): boolean {
    const sp = spotById.get(id);
    return sp ? sp.vis : true;
  }

  // ---------- team panels + score plate ----------
  const nickById = new Map<string, string>(); // entity id -> stable bot nickname (per battle)
  function nickFor(t: HudTank): string {
    if (t.displayName) return t.displayName;
    if (t.isPlayer) return PLAYER_NICK;
    let nick = nickById.get(t.id);
    if (!nick) {
      nick = botCallsign(t.id, t.spec?.id ?? null, new Set(nickById.values()));
      nickById.set(t.id, nick);
    }
    return nick;
  }

  let lastAllyRosterCount = -1;
  let lastEnemyRosterCount = -1;
  function setRosterLayout(ear: HTMLElement, count: number): void {
    ear.dataset.count = String(count);
    ear.style.setProperty('--roster-count', String(Math.max(1, count)));
    ear.classList.toggle('dense', count > 10);
    ear.classList.toggle('icon-grid', count > 14);
    if (count > 14) {
      const columns = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(count))));
      ear.style.setProperty('--roster-columns', String(columns));
      ear.style.setProperty('--roster-rows', String(Math.ceil(count / columns)));
    }
  }
  const rosterIds: string[] = [];
  const rosterPlayers: boolean[] = [];
  const rosterTeams: Array<string | undefined> = [];
  const teamTally: TeamTally = {
    allyAlive: 0,
    allyTotal: 0,
    enemyAlive: 0,
    enemyTotal: 0,
  };

  function rosterChanged(tanks: HudTank[]): boolean {
    let validIndex = 0;
    for (const tank of tanks) {
      if (!tank?.spec) continue;
      if (rosterIds[validIndex] !== tank.id || rosterPlayers[validIndex] !== !!tank.isPlayer || rosterTeams[validIndex] !== tank.team) {
        return true;
      }
      validIndex++;
    }
    return validIndex !== rosterIds.length;
  }

  function rebuildRosterIdentity(tanks: HudTank[]): void {
    rosterIds.length = 0;
    rosterPlayers.length = 0;
    rosterTeams.length = 0;
    for (const tank of tanks) {
      if (!tank?.spec) continue;
      rosterIds.push(tank.id);
      rosterPlayers.push(!!tank.isPlayer);
      rosterTeams.push(tank.team);
    }
  }

  function syncRosterIdentity(tanks: HudTank[]): void {
    if (!rosterChanged(tanks)) return;
    rebuildRosterIdentity(tanks);
    for (const row of earRows.values()) row.root.remove();
    earRows.clear();
    nickById.clear();
    assignNicknames(tanks);
    lastScore = '';
  }

  /** The bots' nicknames over the battle's tanks in their order (botCallsigns.ts rosterCallsigns' walk), before any
   *  surface asks for one, so the order the HUD's parts ask in never reorders them. */
  function assignNicknames(tanks: readonly HudTank[]): void {
    for (const tank of tanks) if (tank && !tank.displayName && !tank.isPlayer) nickFor(tank);
  }

  function createEarRow(tank: HudTank, ally: boolean): EarRow {
    const spec = tank.spec!;
    const rootEl = el('div', 'cot-er');
    rootEl.innerHTML = `<span class="ic" aria-hidden="true"></span>` +
      `<span class="n"><span class="nick"></span>` +
      `<span class="veh"><i class="tier"></i><span class="vn"></span><i class="brain" hidden></i></span></span>` +
      `<span class="kills num" hidden></span><div class="hpm"><i></i></div>`;
    const iconEl = requireElement<HTMLElement>(rootEl, '.ic');
    const aircraft = tank.aerial?.kind === 'gunship' ? killSourceIdentity('ac130') : null;
    const vehicle = vehicleName(tank);
    // the silhouette takes its ear's team ink from the sheet (.cot-ear.l / .r .cot-er .ic)
    if (aircraft) iconEl.innerHTML = uiIconSVG(aircraft.icon, 24, 'currentColor');
    else {
      maskIcon(iconEl, spec.id, 'side_silhouette', 'currentColor');
      // (each silhouette ends at its box's inner edge, by the name, whatever its length: centred, a long hull started 5 px
      // further out than the short ones under it, gauntlet r5; the enemy ear's mirror turns the inner edge to its left)
      iconEl.style.maskPosition = iconEl.style.webkitMaskPosition = 'right center';
    }
    const me = !!tank.isPlayer || tank.id === riddenId();
    if (me) rootEl.classList.add('me');
    requireElement<HTMLElement>(rootEl, '.tier').textContent = aircraft ? '' : tierNumeral(spec.id) || '–';
    requireElement<HTMLElement>(rootEl, '.nick').textContent = nickFor(tank);
    requireElement<HTMLElement>(rootEl, '.vn').textContent = vehicle;
    rootEl.dataset.tip = `${nickFor(tank)} · ${vehicle}`;
    // Jev commander (2026-09-25): a bot under Jev's orders carries a small tag beside its vehicle
    const brainEl = requireElement<HTMLElement>(rootEl, '.brain');
    brainEl.textContent = t('hud.brain.jev');
    brainEl.dataset.tip = t('hud.brain.jevTitle');
    brainEl.hidden = tank.brain !== 'jev';
    (ally ? allyRoster : enemyRoster).appendChild(rootEl);
    const row = {
      root: rootEl,
      hp: requireElement<HTMLElement>(rootEl, '.hpm i'),
      ic: iconEl,
      kills: requireElement<HTMLElement>(rootEl, '.kills'),
      lastKills: -1,
      ally,
      lastFrac: -1,
      wasDead: null,
      wasSpotted: null,
      me,
    };
    earRows.set(tank.id, row);
    return row;
  }

  function updateEarRow(tank: HudTank, ally: boolean, dead: boolean): void {
    const row = earRows.get(tank.id) || createEarRow(tank, ally);
    const me = !!tank.isPlayer || tank.id === riddenId();
    if (me !== row.me) {
      row.root.classList.toggle('me', me);
      row.me = me;
    }
    const kills = killLedger.count(tank.id);
    if (kills !== row.lastKills) {
      row.lastKills = kills;
      row.kills.textContent = String(kills);
      row.kills.hidden = kills === 0;
      row.kills.setAttribute('aria-label', t('hud.roster.kills', { count: kills }));
      row.root.dataset.tip = `${nickFor(tank)} · ${vehicleName(tank)} · ${t('hud.roster.kills', { count: kills })}`;
    }
    if (dead !== row.wasDead) {
      row.root.classList.toggle('dead', dead);
      row.wasDead = dead;
    }
    if (!ally) {
      const spotted = dead || isSpotted(tank.id);
      if (spotted !== row.wasSpotted) {
        row.root.classList.toggle('unlit', !spotted);
        row.wasSpotted = spotted;
      }
    }
    if (!tank.combat || dead) return;
    const fraction = Math.max(0, Math.min(1, tank.combat.hp / tank.combat.maxHp));
    if (Math.abs(fraction - row.lastFrac) <= 0.005) return;
    row.hp.style.height = `${(fraction * 100).toFixed(1)}%`;
    row.lastFrac = fraction;
  }

  function resetTeamTally(): void {
    teamTally.allyAlive = 0;
    teamTally.allyTotal = 0;
    teamTally.enemyAlive = 0;
    teamTally.enemyTotal = 0;
  }

  function tallyTank(ally: boolean, dead: boolean): void {
    if (ally) {
      teamTally.allyTotal++;
      if (!dead) teamTally.allyAlive++;
      return;
    }
    teamTally.enemyTotal++;
    if (!dead) teamTally.enemyAlive++;
  }

  function updateRosterRows(tanks: HudTank[]): TeamTally {
    syncRosterIdentity(tanks);
    resetTeamTally();
    for (const tank of tanks) {
      if (!tank?.spec) continue;
      const ally = tank.team === ownSide() || !!tank.isPlayer;
      const dead = !!tank.combat?.destroyed;
      tallyTank(ally, dead);
      updateEarRow(tank, ally, dead);
    }
    if (teamTally.allyTotal !== lastAllyRosterCount) {
      setRosterLayout(earL, teamTally.allyTotal);
      lastAllyRosterCount = teamTally.allyTotal;
    }
    if (teamTally.enemyTotal !== lastEnemyRosterCount) {
      setRosterLayout(earR, teamTally.enemyTotal);
      lastEnemyRosterCount = teamTally.enemyTotal;
    }
    root.classList.toggle('compact-shot-report', Math.max(teamTally.allyTotal, teamTally.enemyTotal) >= 14);
    // spectating, the ridden tank is ringed on its own side (never counted as the watcher's)
    teamPips.updateTeams(tanks, ownSide(), watchSide !== null ? null : playerId, riddenId());
    // (the pips' row counts the sides where it shows: the rosters' own "5 / 6" yields to it, UI-LOCKDOWN B4; a side too
    // long for its pips hides the row, and the rosters' counts are the only ones again)
    const pipsCount = !pipsRow.hidden;
    if (root.classList.contains('pips-count') !== pipsCount) root.classList.toggle('pips-count', pipsCount);
    return teamTally;
  }

  function updateTimer(label: string, value: string): void {
    if (label !== lastTimerLabel) {
      timerLabelEl.textContent = label;
      lastTimerLabel = label;
    }
    if (value !== lastTimer) {
      tmEl.textContent = value;
      lastTimer = value;
    }
  }

  /** The clock's label: only a wave's countdown, which the clock alone would read as the match's time. The others went
   *  (owner 2026-10-22, "cut ... secondary labels"): the target ("First 750", "Capture 3") repeated the objective's
   *  progress line, and "Time", "Elapsed", "Survive" and "Take the line" labelled what the clock and the objective show. */
  function modeTimerLabel(waiting: boolean): string {
    return waiting ? t('hud.timer.nextWave') : '';
  }

  function additionalModeStatusCopy(modeState: HudMatchModeState): string | null {
    if (modeState.range) return t(modeState.range.moving ? 'hud.modeStatus.provingMoving' : 'hud.modeStatus.proving', { lanes: modeState.range.lanes.length });
    if (modeState.id === 'juggernaut') return t(modeState.boss?.id === playerRef?.id ? 'hud.modeStatus.juggernautBoss' : 'hud.modeStatus.juggernaut', { hp: Math.ceil(modeState.boss?.hp ?? 0), max: Math.ceil(modeState.boss?.maxHp ?? 0) });
    if (modeState.id === 'infected') return t('hud.modeStatus.infected', { survivors: modeState.infection?.survivors ?? 0, infected: modeState.infection?.infected ?? 0 });
    if(modeState.id==='ac130'){const e=modeState.escort;return t('hud.modeStatus.ac130',{alive:e?.alive??0,rescued:e?.rescued??0,required:e?.required??1,progress:Math.round((e?.progress??0)*100)});}
    if (modeState.id === 'realistic') return t(`hud.modeStatus.${modeState.id}`);
    if (modeState.id === 'drone') return t('hud.modeStatus.drone', { target: modeState.target ?? 20 });
    if (modeState.id === 'gun_game') { const stage = modeState.weaponStage; return t('hud.modeStatus.gun_game', { stage: (stage?.index ?? 0) + 1, total: stage?.total ?? 5, name: stage?.name ?? '', kills: stage?.kills ?? 0, required: stage?.required ?? 2 }); }
    return null;
  }

  // (the objective names the win condition, never the side's own score: "CONTROL 2 / 750" repeated the score plate's 2,
  // UI-LOCKDOWN B3; the Horde's waves and the special modes' own figures are the plate's no figure)
  function modeStatusCopy(modeState: HudMatchModeState): string {
    const special = additionalModeStatusCopy(modeState);
    if (special !== null) return special;
    if (modeState.id === 'standard') return t('hud.modeStatus.eliminate', {target:String(modeState.target || 0)});
    if (modeState.id === 'capture_the_flag') {
      return t('hud.modeStatus.flags', { target: String(modeState.target || 3) });
    }
    if (modeState.id === 'zone_control' || modeState.id === 'mars') {
      return t('hud.modeStatus.control', { target: String(modeState.target || RULESET_SCORE_TARGETS.zone_control) });
    }
    if (modeState.id === 'turbo_ball') {
      return t('hud.modeStatus.goals', { target: String(modeState.target || 5) });
    }
    if (modeState.id === 'frontline_assault') {
      const line = modeState.line;
      return t('hud.modeStatus.assault', {
        line: String(Math.min((line?.index ?? 0) + 1, line?.total ?? 3)), total: String(line?.total ?? 3),
        wave: String(modeState.horde?.wave || 1), alive: String(modeState.horde?.alive || 0),
      });
    }
    return hordeStatusCopy(modeState, liveRuleset);
  }

  function modeStatusIconName(modeId: string): string {
    // the mode's own icon where its definition names one the status chip has no table entry for (the practice modes)
    if (isPracticeMode(modeId)) return GAME_MODE_DEFINITIONS[modeId].icon;
    const icon = { juggernaut: 'modeJuggernaut', infected: 'modeInfected', realistic: 'modeRealistic', gun_game: 'modeGunGame', drone: 'modeDrone', ac130: 'modeAc130' }[modeId];
    if (icon) return icon;
    if (modeId === 'standard') return 'modeStandard';
    if (modeId === 'capture_the_flag') return 'modeFlag';
    if (modeId === 'mars') return 'modeMars';
    if (modeId === 'zone_control') return 'modeZones';
    if (modeId === 'frontline_assault') return 'modeFrontline';
    if (modeId === 'turbo_ball') return 'modeTurbo';
    return 'modeHorde';
  }

  function updateModeStatus(modeState: HudMatchModeState): void {
    const copy = modeStatusCopy(modeState);
    const status = `${modeState.id}|${copy}`;
    if (status === lastModeStatus) return;
    modeStatusIcon.innerHTML = uiIconSVG(modeStatusIconName(modeState.id || ''), 15, 'currentColor');
    const modeId = normalizeGameMode(modeState.id);
    modeStatusEl.dataset.mode = modeId;
    // (the glyph in the mode's own hue, components.css data-mode-tone: owner 2026-10-25)
    modeStatusEl.dataset.modeTone = modeId;
    const modeName = t(`playMenu.matchMode.${modeId}.label`);
    modeStatusEl.dataset.tip = modeName;
    modeStatusName.textContent = modeName;
    setObjectiveValue(modeStatusValue, copy, modeId === 'frontline_assault' ? FRONTLINE_MARKS : []);
    // A Standard battle has no objective beyond the score: its plate shows only in the corner seat, where it is the
    // mission plate (battleHudLayout.css .quiet), never as a second row under the score. The Horde's plate shows in every
    // seat as the mode's name, its wave and those left being the score plate's (gauntlet r1: "WAVE 3 · 12 HOSTILES" under
    // "WAVE 3 ... 12 LEFT"; Main 253: hidden outside the corner seat, the Horde had no objective at all)
    modeStatusEl.classList.toggle('quiet', modeState.id === 'standard');
    modeStatusEl.classList.add('show');
    lastModeStatus = status;
  }

  function updateModeScore(
    frame: HudFrame,
    modeState: HudMatchModeState,
    tally: TeamTally,
  ): void {
    const ownTeam = modeState.perspectiveTeam === 'bravo' ? 'bravo' : 'alpha';
    objectiveTeam = ownTeam;
    const enemyTeam = ownTeam === 'alpha' ? 'bravo' : 'alpha';
    const horde = modeState.id === 'endless_horde' ? modeState.horde : null;
    // the Horde (gameplay-modes-228): WAVE 7 on the own side, the hostiles still to destroy of the wave's total on the other
    const ownScore = horde ? String(horde.wave || 1) : Math.round(modeState.score?.[ownTeam] || 0);
    const remaining = horde ? Math.round(horde.remaining ?? horde.alive ?? 0) : 0;
    const enemyScore = horde
      ? (horde.total ? `${remaining} / ${horde.total}` : String(remaining))
      : Math.round(modeState.score?.[enemyTeam] || 0);
    // (integ 254) the Frontline's hostiles ride the plate (.fh), so a change in them alone redraws it (a wave spawning
    // changed neither score nor tally, and the plate held 0 LEFT under "3 HOSTILES")
    const frontlineAlive = modeState.id === 'frontline_assault' ? Math.round(modeState.horde?.alive || 0) : 0;
    const score = `${modeState.id}|${ownScore}:${enemyScore}|${tally.allyAlive}/${tally.allyTotal}|${tally.enemyAlive}/${tally.enemyTotal}|${frontlineAlive}`;
    if (score !== lastScore) {
      fgEl.textContent = String(ownScore);
      fgEl.classList.toggle('wave', !!horde);
      feEl.textContent = horde && horde.total ? String(remaining) : String(enemyScore);
      // the wave's total rides small beside the count still standing, so "30 / 30" fits the score slot on one line
      if (horde && horde.total) {
        const of = document.createElement('small');
        of.className = 'of';
        of.textContent = `/${horde.total}`;
        feEl.appendChild(of);
      }
      // the Horde has no race to a target: its bar shows the wave still standing; a mode's bars race to its target
      const target = modeState.target || 0;
      if (horde) setScoreBars(0, horde.total ? remaining / horde.total : 0);
      else setScoreBars(target > 0 ? Number(ownScore) / target : 0, target > 0 ? Number(enemyScore) / target : 0);
      allyLabelEl.textContent = horde ? (horde.special ? t(`hud.waveSpecial.${horde.special}`) : t('hud.wave')) : allyLabel();
      enemyLabelEl.textContent = horde ? t('hud.remaining') : enemyLabel();
      allyLabelEl.toggleAttribute('data-default', !horde);
      enemyLabelEl.toggleAttribute('data-default', !horde);
      // (the Frontline's hostiles on the enemy side, shown where its objective drops them: battleHudLayout.css)
      const frontline = modeState.id === 'frontline_assault';
      topPlate.classList.toggle('frontline', frontline);
      if (frontline) fhValueEl.textContent = String(frontlineAlive);
      allyAliveEl.textContent = `${tally.allyAlive} / ${tally.allyTotal}`;
      enemyAliveEl.textContent = `${tally.enemyAlive} / ${tally.enemyTotal}`;
      lastScore = score;
    }
    const waitS = horde ? Math.ceil(horde.nextWaveInS || 0) : 0;
    const limitS = battleClockLimitS(frame, modeState.id);
    const timer = waitS > 0 ? `${waitS}s` : clockText(frame, limitS);
    updateTimer(modeTimerLabel(waitS > 0), timer);
    updateModeStatus(modeState);
  }

  function updateStandardScore(frame: HudFrame, tally: TeamTally): void {
    const allyKills = tally.enemyTotal - tally.enemyAlive;
    const enemyKills = tally.allyTotal - tally.allyAlive;
    standardModeStatus.target = tally.enemyTotal;
    updateModeStatus(standardModeStatus);
    const score = `${allyKills}:${enemyKills}|${tally.allyAlive}/${tally.allyTotal}|${tally.enemyAlive}/${tally.enemyTotal}`;
    if (score !== lastScore) {
      fgEl.textContent = String(allyKills);
      feEl.textContent = String(enemyKills);
      setScoreBars(tally.enemyTotal ? allyKills / tally.enemyTotal : 0, tally.allyTotal ? enemyKills / tally.allyTotal : 0);
      allyLabelEl.textContent = allyLabel();
      enemyLabelEl.textContent = enemyLabel();
      allyLabelEl.toggleAttribute('data-default', true);
      enemyLabelEl.toggleAttribute('data-default', true);
      allyAliveEl.textContent = `${tally.allyAlive} / ${tally.allyTotal}`;
      enemyAliveEl.textContent = `${tally.enemyAlive} / ${tally.enemyTotal}`;
      lastScore = score;
    }
    const limitS = battleClockLimitS(frame, 'standard');
    updateTimer('', clockText(frame, limitS));
  }

  function updateTeams(frame: HudFrame): void {
    // Network presentation may omit hidden enemies from `frame.tanks`; the
    // policy-safe roster still owns the score and team ears.
    const tanks = frame.rosterTanks || frame.tanks || [];
    const tally = updateRosterRows(tanks);
    const modeState = frame.matchModeState;
    if (modeState?.id && modeState.id !== 'standard') {
      updateModeScore(frame, modeState, tally);
      return;
    }
    updateStandardScore(frame, tally);
  }

  // ---------- reticle / scope canvas ----------
  // WoT sniper mode: FULL-SCREEN view — no telescope mask, no black scope
  // tunnel (that is budget-FPS sniper grammar, hud_ui r2 major). The scene
  // stays visible edge to edge. r7 MAJOR: the mode still failed the blind
  // side-by-side because nothing about it was visibly "sniper" at 1080p —
  // the r6 9%-corner shade was invisible and the reticle was the arcade
  // circle verbatim. Sniper identity now comes from three cues WoT ships:
  //   1. a SOFT DARK VIGNETTE (~18% at the extreme corners, nothing by
  //      mid-frame — still no ring boundary, no tunnel);
  //   2. FULL-WIDTH HAIRLINES — 1px cross lines running from the screen
  //      edges up to the dispersion circle's rim (interior stays clean);
  //   3. the zoom readout just below the scope ammunition line (drawReticle).
  // brand-ui H5 (the direction's 06b-sniper-optic .vig, SPEC 12.2.6): the vignette is the direction's, an ellipse 75 % of
  // the width by 70 % of the height, clear to 55 % of it and .42 at its rim; the blue chromatic fringe it replaces is
  // gone (no chromatic aberration). The magnification no longer tightens it.
  function ensureScopeGradients(zoom: number): void {
    if (scopeGrad && scopeGradZoom === zoom) return;
    scopeGrad = ctx.createRadialGradient(0, 0, w * 0.75 * 0.55, 0, 0, w * 0.75);
    scopeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    scopeGrad.addColorStop(1, 'rgba(0,0,0,0.42)');
    scopeGradZoom = zoom;
  }

  function scopeFadeAlpha(): number {
    if (scopeFadeMs < 0) return 1;
    const alpha = Math.min(1, (performance.now() - scopeFadeMs) / 100);
    if (alpha >= 1) scopeFadeMs = -1;
    return alpha;
  }

  function paintScopeVignette(alpha: number): void {
    if (!scopeGrad) return;
    const lensCx = w / 2;
    const lensCy = h / 2;
    const scaleY = (h * 0.7) / (w * 0.75);
    ctx.save();
    ctx.translate(lensCx, lensCy);
    ctx.scale(1, scaleY);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = scopeGrad;
    ctx.fillRect(-lensCx, -lensCy / scaleY, w, h / scaleY);
    ctx.restore();
  }

  /** How far a scope cross arm's run stops short of a mark or a panel on its line, and a mil tick keeps from one. */
  const SCOPE_CUT_GAP = 5;
  const SCOPE_TICK_GAP = 2;
  let scopeCutCount = 0;

  /** Adds the box's span along a cross arm's line (`across`: its y on a horizontal arm, its x on a vertical one) to the
   *  run's cuts, `pad` either side, where the box crosses that line. */
  function addScopeCut(horizontal: boolean, across: number, x0: number, y0: number, x1: number, y1: number, pad: number): void {
    if (across < (horizontal ? y0 : x0) - pad || across > (horizontal ? y1 : x1) + pad) return;
    if (scopeCutCount * 2 >= scopeCutScratch.length) return;
    scopeCutScratch[scopeCutCount * 2] = (horizontal ? x0 : y0) - pad;
    scopeCutScratch[scopeCutCount * 2 + 1] = (horizontal ? x1 : y1) + pad;
    scopeCutCount++;
  }

  /** Appends a cross arm's run from `a` to `b` along its line, cut around every mark this frame (sightInk), the HUD's
   *  furniture, the centre notices shown and the over-target plate on that line. */
  function appendScopeRun(horizontal: boolean, a: number, b: number, across: number): void {
    scopeCutCount = 0;
    for (let i = 0; i < sightInk.count; i++) {
      const box = sightInk.boxes[i];
      addScopeCut(horizontal, across, box.x0, box.y0, box.x1, box.y1, SCOPE_CUT_GAP);
    }
    for (let i = 0; i < sightFurniture.count; i++) {
      const box = sightFurniture.boxes[i];
      addScopeCut(horizontal, across, box.x0, box.y0, box.x1, box.y1, SCOPE_CUT_GAP);
    }
    // (and the centre notices while they show: the arm ends under the alert rather than meeting it, 1024x600)
    for (let i = 0; i < sightNoticeCuts.count; i++) {
      const box = sightNoticeCuts.boxes[i];
      addScopeCut(horizontal, across, box.x0, box.y0, box.x1, box.y1, SCOPE_CUT_GAP);
    }
    const plate = tgtShown ? tgtRect : null;
    if (plate) addScopeCut(horizontal, across, plate.cx - plate.hw, plate.top, plate.cx + plate.hw, plate.bottom, 5);
    const cuts = scopeCutScratch;
    for (let i = 1; i < scopeCutCount; i++) {
      const start = cuts[i * 2];
      const end = cuts[i * 2 + 1];
      let j = i - 1;
      while (j >= 0 && cuts[j * 2] > start) { cuts[j * 2 + 2] = cuts[j * 2]; cuts[j * 2 + 3] = cuts[j * 2 + 1]; j--; }
      cuts[j * 2 + 2] = start;
      cuts[j * 2 + 3] = end;
    }
    let from = a;
    for (let i = 0; i < scopeCutCount && from < b; i++) {
      const start = cuts[i * 2];
      const end = cuts[i * 2 + 1];
      if (end <= from) continue;
      if (start >= b) break;
      if (start - from > 1) appendScopeSegment(horizontal, from, start, across);
      from = Math.max(from, end);
    }
    if (b - from > 1) appendScopeSegment(horizontal, from, b, across);
  }

  function appendScopeSegment(horizontal: boolean, a: number, b: number, across: number): void {
    if (horizontal) { ctx.moveTo(a, across); ctx.lineTo(b, across); }
    else { ctx.moveTo(across, a); ctx.lineTo(across, b); }
  }

  /** Whether a mil tick's box keeps SCOPE_TICK_GAP from every mark this frame, the furniture and the over-target plate. */
  function scopeTickClear(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let i = 0; i < sightInk.count; i++) {
      const box = sightInk.boxes[i];
      if (Math.max(box.x0 - x1, x0 - box.x1, box.y0 - y1, y0 - box.y1) < SCOPE_TICK_GAP) return false;
    }
    return sightFurnitureGap(x0, y0, x1, y1) >= SCOPE_TICK_GAP;
  }

  function paintScopeCrossArms(
    cx: number,
    cy: number,
    gap: number,
    armEnd: number,
    color: string,
    lineWidth: number,
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    appendScopeRun(true, cx - armEnd, cx - gap, cy + 0.5);
    appendScopeRun(true, cx + gap, cx + armEnd, cy + 0.5);
    appendScopeRun(false, cy - armEnd, cy - gap, cx + 0.5);
    appendScopeRun(false, cy + gap, cy + armEnd, cx + 0.5);
    ctx.stroke();
  }

  function paintScopeMilTicks(
    cx: number,
    cy: number,
    spacing: number,
    count: number,
    color: string,
    lineWidth: number,
    ring: number,
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (let i = 1; i <= count; i++) {
      const distance = i * spacing;
      const tick = i % 2 === 0 ? 4.5 : 3;
      // (and each one left out where its bar would meet the ring, from its middle to its ends: a short window's 14 px ring
      // took the first ticks' bars on its dashes at 568x256, gauntlet r17)
      const margin = RING_STROKE_REACH + SIGHT_MARK_RING_GAP + lineWidth / 2;
      if (distance - margin < ring && Math.hypot(distance, tick) + margin > ring) continue;
      const reach = tick + lineWidth / 2;
      // (each tick left out where it would meet a mark: the rack, the struck round, the countdown under the marker)
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        const y = cy + side * distance + 0.5;
        if (scopeTickClear(cx - reach, y - lineWidth / 2, cx + reach, y + lineWidth / 2)) { ctx.moveTo(cx - tick, y); ctx.lineTo(cx + tick, y); }
        const x = cx + side * distance + 0.5;
        if (scopeTickClear(x - lineWidth / 2, cy - reach, x + lineWidth / 2, cy + reach)) { ctx.moveTo(x, cy - tick); ctx.lineTo(x, cy + tick); }
      }
    }
    ctx.stroke();
  }

  function drawScope(view: HudAimView): void {
    const zoom = view.zoom || 2;
    ensureScopeGradients(zoom);
    paintScopeVignette(scopeFadeAlpha());
    // (the cross arms and mil ticks come after the reticle's marks, which they yield to: paintScopeSkeleton)
  }

  /**
   * The scope's cross arms and mil ticks, painted once the reticle has placed its marks (r10f, the notices critic: the
   * right arm ran through the Daylight vision plate, the lower post across the gun travel chip, a mil tick across the
   * rack onto the struck round). Each arm's run is cut SCOPE_CUT_GAP around every mark this frame (sightInk), the HUD's
   * furniture (the vision plate among it) and the over-target plate; a tick that would come within SCOPE_TICK_GAP of one is
   * left out.
   *
   * SHORT cross arms off the dispersion-circle rim (r4 MAJOR): vanilla WoT sniper mode has NO full-screen crosshair (the r8
   * edge-to-edge hairlines read as a third-party mod / generic FPS scope). The arms start at the circle rim and stop at
   * ~1.55x the circle radius, so the sight furniture stays central: circle + ticks + short cross skeleton. They follow the
   * actual server-aim projection (while the cursor-follow camera eases onto a newly selected point the scope stays
   * truthful instead of showing a second cross at screen centre); the optical vignette stays centred on the lens.
   */
  function paintScopeSkeleton(view: HudAimView): void {
    const zoom = view.zoom || 2;
    const anchor = resolveReticleAnchor(view, _reticleAnchor);
    const cx = anchor.x ?? view.cx;
    const cy = anchor.y ?? view.cy;
    ctx.globalAlpha = scopeFadeAlpha();
    const radius = clampRetR(smoothRadPx);
    // (the arms start 3 px off the ring's stroke and their own under-stroke: at radius + 3 their caps met its dashes at
    // 844x390, gauntlet r17)
    const gap = radius + RING_STROKE_REACH + SIGHT_MARK_RING_GAP + 1.2;
    const armEnd = scopeArmEnd(radius);
    // the direction's optic ink (06b-sniper-optic .optic): paper lines over a graphite under-stroke, no green tint
    paintScopeCrossArms(cx, cy, gap, armEnd, 'rgba(5,6,8,0.55)', 2.4);
    paintScopeCrossArms(cx, cy, gap, armEnd, 'rgba(246,243,236,0.78)', 1.1);
    const mil = THREE.MathUtils.clamp(8 + zoom * 1.2, 11, 22);
    const maxMil = Math.min(3, Math.max(1, Math.floor((armEnd - 4) / mil)));
    paintScopeMilTicks(cx, cy, mil, maxMil, 'rgba(5,6,8,0.6)', 2.2, radius);
    paintScopeMilTicks(cx, cy, mil, maxMil, 'rgba(246,243,236,0.86)', 0.9, radius);
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------------
  // INCOMING-FIRE WEDGES (hitind r1 — owner: indicators "much better and more
  // like the actual world of tanks"). Each hit paints a tapered CRESCENT ring
  // segment around screen center at the shooter's camera-relative bearing —
  // bright inner rim, radial glow falling off outward, pointed tips — the WoT
  // damage-arc read. Per-class span/weight/palette/decay so a mere bounce is
  // instantly distinguishable from real damage:
  //   pen    — bold red wedge, ~64° span, heavy body, ~4 s decay
  //   he     — amber splash wedge, widest (~76°), mid weight, ~3 s decay
  //   bounce — thin steel-white arc, ~44° span, light body, ~2.5 s decay
  // Crits ride the pen wedge as a hot core flash (~2 Hz, first ~1.4 s) — no
  // separate class. Numbers/chevrons no longer ride the arcs: WoT keeps the
  // received-damage figures live in shotInfo's one canonical incoming feed.
  const ARC_IN_S = 0.12; // shared fast pulse-in attack
  const ARC_CLASS = {
    pen: {
      holdS: 0.9, fadeS: 3.0, half: 0.56, thickF: 0.92,
      rim: '255,126,92', body: '246,58,38', rimA: 0.95, bodyA: 0.60,
    },
    he: {
      holdS: 0.7, fadeS: 2.2, half: 0.66, thickF: 0.78,
      rim: '255,198,100', body: '250,146,42', rimA: 0.90, bodyA: 0.50,
    },
    bounce: {
      holdS: 0.5, fadeS: 1.9, half: 0.38, thickF: 0.60,
      rim: '234,244,252', body: '168,192,214', rimA: 0.95, bodyA: 0.44,
    },
  };
  const ARC_SEGS = 22; // crescent outline resolution

  // tapered crescent path: the inner edge rides the ring at R0; the outer
  // edge lifts to R0+thick at the wedge center and returns to R0 at the tips
  // (gradient fill handles the radial falloff, the taper the angular one —
  // never a cheap solid triangle)
  function wedgePath(
    cx: number,
    cy: number,
    cAng: number,
    half: number,
    R0: number,
    thick: number,
  ): void {
    ctx.beginPath();
    for (let i = 0; i <= ARC_SEGS; i++) {
      const a = cAng + (-1 + (2 * i) / ARC_SEGS) * half;
      const x = cx + Math.cos(a) * R0;
      const y = cy + Math.sin(a) * R0;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = ARC_SEGS; i >= 0; i--) {
      const u = -1 + (2 * i) / ARC_SEGS;
      const a = cAng + u * half;
      // 0.5 exponent: near-uniform band through the middle, quick taper at
      // the tips — WoT's arc is a BAND with soft ends, not a bulging lens
      const R = R0 + thick * Math.pow(Math.max(0, 1 - u * u), 0.5);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    ctx.closePath();
  }

  function prepareHitIndicatorFrame(): HitIndicatorFrameState | null {
    const camera = lastCamera;
    const playerState = playerRef?.state;
    if (!camera || !playerState) return null;
    const elements = camera.matrixWorld.elements;
    let rightX = elements[0];
    let rightZ = elements[2];
    let forwardX = -elements[8];
    let forwardZ = -elements[10];
    const rightLength = Math.hypot(rightX, rightZ);
    const forwardLength = Math.hypot(forwardX, forwardZ);
    if (rightLength < 1e-4 || forwardLength < 1e-4) return null;
    rightX /= rightLength;
    rightZ /= rightLength;
    forwardX /= forwardLength;
    forwardZ /= forwardLength;
    const frame = hitIndicatorFrameScratch;
    frame.playerX = playerState.pos.x;
    frame.playerZ = playerState.pos.z;
    frame.rightX = rightX;
    frame.rightZ = rightZ;
    frame.forwardX = forwardX;
    frame.forwardZ = forwardZ;
    frame.centerX = w / 2;
    // (round the battle sight where the chase framing raises it, battleSight.ts; the scope's is the centre)
    frame.centerY = mode === 'sniper' ? h / 2 : h / 2 - battleSightShift();
    frame.minDimension = Math.min(w, h);
    const drawnRadius = clampRetR(smoothRadPx);
    frame.radius = Math.min(
      Math.max(frame.minDimension * 0.185, drawnRadius + 26),
      frame.minDimension * 0.30,
    );
    frame.thickness = Math.min(Math.max(frame.minDimension * 0.115, 64), 118);
    return frame;
  }

  function expireHitIndicators(timeS: number): void {
    for (let i = hitDirs.length - 1; i >= 0; i--) {
      const indicator = hitDirs[i];
      const arcClass = ARC_CLASS[indicator.kind];
      const age = timeS - indicator.t0;
      if (age > ARC_IN_S + arcClass.holdS + arcClass.fadeS || age < 0) {
        hitDirs.splice(i, 1);
      }
    }
  }

  function prepareHitIndicatorPaint(
    indicator: HitDirection,
    timeS: number,
    frame: HitIndicatorFrameState,
  ): HitIndicatorPaintState | null {
    const dx = indicator.wx - frame.playerX;
    const dz = indicator.wz - frame.playerZ;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-3) return null;
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const relativeAngle = Math.atan2(
      normalX * frame.rightX + normalZ * frame.rightZ,
      normalX * frame.forwardX + normalZ * frame.forwardZ,
    );
    indicator._screenAng = relativeAngle;
    const paint = hitIndicatorPaintScratch;
    paint.age = timeS - indicator.t0;
    paint.angle = relativeAngle - Math.PI / 2;
    const arcClass = ARC_CLASS[indicator.kind];
    if (paint.age < ARC_IN_S) {
      const attack = paint.age / ARC_IN_S;
      const start = indicator.re ? 0.8 : 0.55;
      paint.alpha = attack;
      paint.growth = start + (1.05 - start) * (1 - (1 - attack) * (1 - attack));
    } else {
      paint.growth = 1.05 - 0.05 * Math.min(1, (paint.age - ARC_IN_S) / 0.14);
      const fade = paint.age - ARC_IN_S - arcClass.holdS;
      paint.alpha = fade <= 0
        ? 1
        : Math.pow(Math.max(0, 1 - fade / arcClass.fadeS), 1.35);
    }
    paint.halfAngle = arcClass.half * paint.growth;
    const damageWeight = indicator.kind === 'bounce'
      ? 0
      : Math.min(1, (indicator.dmg || 0) / 520);
    paint.thickness = frame.thickness * arcClass.thickF
      * (0.74 + 0.40 * damageWeight) * paint.growth;
    paint.rimHalfAngle = paint.halfAngle * 0.82;
    paint.bodyColor = arcClass.body;
    paint.bodyAlpha = arcClass.bodyA;
    paint.rimColor = arcClass.rim;
    paint.rimAlpha = arcClass.rimA;
    return paint;
  }

  function paintHitIndicatorBody(
    frame: HitIndicatorFrameState,
    paint: HitIndicatorPaintState,
  ): void {
    wedgePath(
      frame.centerX,
      frame.centerY,
      paint.angle,
      paint.halfAngle,
      frame.radius,
      paint.thickness,
    );
    let gradient = ctx.createRadialGradient(
      frame.centerX, frame.centerY, frame.radius,
      frame.centerX, frame.centerY, frame.radius + paint.thickness,
    );
    gradient.addColorStop(0, `rgba(8,11,14,${(0.40 * paint.alpha).toFixed(3)})`);
    gradient.addColorStop(0.55, `rgba(8,11,14,${(0.16 * paint.alpha).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(8,11,14,0)');
    ctx.fillStyle = gradient;
    ctx.fill();
    gradient = ctx.createRadialGradient(
      frame.centerX, frame.centerY, frame.radius,
      frame.centerX, frame.centerY, frame.radius + paint.thickness,
    );
    gradient.addColorStop(0, `rgba(${paint.bodyColor},${(paint.bodyAlpha * paint.alpha).toFixed(3)})`);
    gradient.addColorStop(0.32, `rgba(${paint.bodyColor},${(paint.bodyAlpha * 0.62 * paint.alpha).toFixed(3)})`);
    gradient.addColorStop(1, `rgba(${paint.bodyColor},0)`);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function strokeHitIndicatorArc(
    frame: HitIndicatorFrameState,
    paint: HitIndicatorPaintState,
    color: string,
    lineWidth: number,
    radiusOffset: number,
    halfAngle: number,
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(
      frame.centerX,
      frame.centerY,
      frame.radius + radiusOffset,
      paint.angle - halfAngle,
      paint.angle + halfAngle,
    );
    ctx.stroke();
  }

  function paintHitIndicatorRim(
    indicator: HitDirection,
    frame: HitIndicatorFrameState,
    paint: HitIndicatorPaintState,
  ): void {
    ctx.lineCap = 'butt';
    strokeHitIndicatorArc(
      frame,
      paint,
      `rgba(8,11,14,${(0.70 * paint.alpha).toFixed(3)})`,
      4.6,
      1,
      paint.rimHalfAngle,
    );
    strokeHitIndicatorArc(
      frame,
      paint,
      `rgba(${paint.rimColor},${(paint.rimAlpha * paint.alpha).toFixed(3)})`,
      2.3,
      1,
      paint.rimHalfAngle,
    );
    if (paint.age < 0.25 && A11Y.flash > 0) {
      // the white bloom of a fresh hit, scaled by the player's flash intensity (Accessibility)
      const flash = (1 - paint.age / 0.25) * A11Y.flash;
      ctx.globalCompositeOperation = 'lighter';
      strokeHitIndicatorArc(
        frame,
        paint,
        `rgba(255,236,220,${(0.55 * flash * paint.alpha).toFixed(3)})`,
        3.4,
        1,
        paint.rimHalfAngle * 0.9,
      );
      ctx.globalCompositeOperation = 'source-over';
    }
    if (indicator.crit && indicator.kind !== 'bounce' && paint.age < 1.4) {
      const pulse = 0.55 + 0.45 * Math.sin(paint.age * Math.PI * 4);
      ctx.globalCompositeOperation = 'lighter';
      strokeHitIndicatorArc(
        frame,
        paint,
        `rgba(255,216,164,${(0.8 * pulse * paint.alpha).toFixed(3)})`,
        3.2,
        3.5,
        paint.halfAngle * 0.34,
      );
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function paintHitIndicatorLabel(
    indicator: HitDirection,
    frame: HitIndicatorFrameState,
    paint: HitIndicatorPaintState,
    slot: number,
  ): void {
    const showBlockedAmount = !indicator.numeric && directionalHitValueVisible(
      directionalHitValuesEnabled,
      indicator.amount,
      indicator.kind,
    );
    const label = showBlockedAmount ? `${indicator.label} · ${indicator.amount}` : indicator.label;
    const fontPx = indicator.numeric
      ? Math.round(Math.min(Math.max(frame.minDimension * 0.023, 14), 19))
      : Math.round(Math.min(Math.max(
        frame.minDimension * (label.length > 13 ? 0.015 : 0.018),
        sightWordFloorPx(), // the HUD's 11 px floor (the coordinator, 246), 13 in Chinese
      ), 14));
    const valueRadius = frame.radius + paint.thickness + (indicator.numeric ? 14 : 16);
    ctx.save();
    ctx.font = `700 ${fontPx}px ${FONT_COND}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    const labelHalf = ctx.measureText(label).width / 2;
    const x = Math.min(Math.max(
      frame.centerX + Math.cos(paint.angle) * valueRadius,
      labelHalf + 8,
    ), w - labelHalf - 8);
    const y = Math.min(Math.max(
      frame.centerY + Math.sin(paint.angle) * valueRadius,
      fontPx + 8,
    ), h - fontPx - 8);
    ctx.globalAlpha = Math.min(1, 0.98 * paint.alpha);
    ctx.lineWidth = indicator.numeric ? 4.6 : 4;
    ctx.strokeStyle = 'rgba(5,8,11,0.94)';
    ctx.fillStyle = indicator.labelColor;
    // (UI-LOCKDOWN A) DOM over the sight, as the canvas drew it: this font, ink and alpha over a halo of this width
    sightText.placeAs(slot, label, x, y, ctx, ctx.lineWidth);
    if (indicator.crit && indicator.numeric) {
      const critRadius = valueRadius + fontPx + 5;
      const critFontPx = Math.max(sightWordFloorPx(), Math.round(fontPx * 0.55)); // the 11 px floor (13 in Chinese)
      ctx.font = `700 ${critFontPx}px ${FONT_COND}`;
      // A localized word behind a drawn diamond (never a Latin-only code; BUI-F8): 暴击 in zh, CRIT in en.
      const crit = t('hud.dmg.crit');
      const mark = critFontPx * 0.32;
      const critHalf = ctx.measureText(crit).width / 2 + mark * 1.4;
      const critX = Math.min(Math.max(
        frame.centerX + Math.cos(paint.angle) * critRadius,
        critHalf + 8,
      ), w - critHalf - 8);
      const critY = Math.min(Math.max(
        frame.centerY + Math.sin(paint.angle) * critRadius,
        critFontPx + 8,
      ), h - critFontPx - 8);
      ctx.lineWidth = 3.4;
      const wordX = critX + mark * 1.4;
      const markX = critX - critHalf + mark;
      ctx.fillStyle = '#ffd0a8';
      sightText.placeAs(slot + 1, crit, wordX, critY, ctx, ctx.lineWidth);
      ctx.beginPath();
      ctx.moveTo(markX, critY - mark); ctx.lineTo(markX + mark, critY);
      ctx.lineTo(markX, critY + mark); ctx.lineTo(markX - mark, critY); ctx.closePath();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHitIndicators(timeS: number): void {
    if (!hitDirs.length) return;
    const frame = prepareHitIndicatorFrame();
    if (!frame) return;
    expireHitIndicators(timeS);
    for (let i = 0; i < hitDirs.length; i++) {
      const indicator = hitDirs[i];
      const paint = prepareHitIndicatorPaint(indicator, timeS, frame);
      if (!paint) continue;
      paintHitIndicatorBody(frame, paint);
      paintHitIndicatorRim(indicator, frame, paint);
      paintHitIndicatorLabel(indicator, frame, paint, SIGHT_TEXT_HIT + i * 2);
    }
    ctx.lineCap = 'butt';
  }

  // Hit-confirm marker: four tapered lock shards snapping toward the reticle
  // when one of the player's shells connects (amber = damage, steel = block).
  // Drawn into `g` about (cx, cy): the full-screen sight, or the gunship's own bounded mark canvas (paintAerialHitMark).
  function drawHitMark(g: CanvasRenderingContext2D, cx: number, cy: number, timeS: number): void {
    if (!hitMark) return;
    const age = timeS - hitMark.t0;
    // Reduce motion is the player's choice or the OS while they follow it (accessibilityPreferences.ts).
    const visual = hitConfirmVisualState(age, A11Y.reduceMotion, hitConfirmScratch);
    if (!visual.visible) { hitMark = null; return; }

    const baseColor = hitMark.bounced ? '202,218,232' : '255,166,48';
    const highlightColor = hitMark.bounced ? '241,247,252' : '255,235,190';
    g.save();
    // (under 300 px tall the mark a fifth smaller about the aim point: its lower shards met the systems row 28 px under
    // the sight at 568x256, gauntlet r10)
    if (h < 300) { g.translate(cx, cy); g.scale(0.8, 0.8); g.translate(-cx, -cy); }
    g.lineJoin = 'miter';
    if (hitMark.blockedRapid) {
      const x = cx + 30, y = cy - 30;
      g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y - 3);
      g.lineTo(x + 5, y + 3); g.lineTo(x, y + 7);
      g.lineTo(x - 5, y + 3); g.lineTo(x - 6, y - 3); g.closePath();
      g.fillStyle = `rgba(5,8,12,${visual.opacity})`; g.fill();
      g.strokeStyle = `rgba(202,218,232,${visual.opacity})`; g.lineWidth = 1.5; g.stroke();
    }

    // A padded near-black silhouette keeps the confirmation clean over snow,
    // muzzle flash and bright sand without turning it into a heavy black X.
    g.fillStyle = `rgba(5,8,12,${(visual.opacity * 0.86).toFixed(3)})`;
    for (let q = 0; q < 4; q++) {
      const ang = Math.PI / 4 + q * Math.PI / 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      hitConfirmShardPath(g, cx, cy, ca, sa,
        visual.radius, visual.length, visual.halfWidth, 2.1);
      g.fill();
    }

    g.fillStyle = `rgba(${baseColor},${visual.opacity.toFixed(3)})`;
    for (let q = 0; q < 4; q++) {
      const ang = Math.PI / 4 + q * Math.PI / 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      hitConfirmShardPath(g, cx, cy, ca, sa,
        visual.radius, visual.length, visual.halfWidth);
      g.fill();

      // A short hot facet gives each shard depth while retaining a compact,
      // instrument-like silhouette instead of a soft mobile-game glow.
      const px = -sa, py = ca;
      const hi0 = visual.radius + visual.length * 0.3;
      const hi1 = visual.radius + visual.length * 0.72;
      g.strokeStyle = `rgba(${highlightColor},${(visual.opacity * 0.9).toFixed(3)})`;
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(cx + ca * hi0 + px * 0.65, cy + sa * hi0 + py * 0.65);
      g.lineTo(cx + ca * hi1 + px * 0.25, cy + sa * hi1 + py * 0.25);
      g.stroke();
    }

    // Brief center spark marks the exact impact acknowledgement. It vanishes
    // before the hold phase and is disabled entirely under reduced motion.
    if (visual.flash * A11Y.flash > 0.001) {
      const sparkAlpha = visual.opacity * visual.flash * A11Y.flash;
      const sparkR = 3.5 + 2.5 * visual.flash;
      g.strokeStyle = `rgba(5,8,12,${(sparkAlpha * 0.75).toFixed(3)})`;
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(cx - sparkR, cy - sparkR);
      g.lineTo(cx + sparkR, cy + sparkR);
      g.moveTo(cx + sparkR, cy - sparkR);
      g.lineTo(cx - sparkR, cy + sparkR);
      g.stroke();
      g.strokeStyle = `rgba(${highlightColor},${sparkAlpha.toFixed(3)})`;
      g.lineWidth = 1.2;
      g.stroke();
    }
    g.restore();
  }

  // WoT dual-element system: a fixed central GUN MARKER (pen-color-coded)
  // plus a separate DISPERSION CIRCLE that blooms with movement/firing and
  // converges while holding the aim. The sim folds hull/turret movement AND
  // the post-shot snap into dispersionRadM (state.bloomF; fireRecoil applies
  // afterShot instantly), so the target radius IS the true 2σ cone projected
  // at the aim distance — no stylization multiplier, no display-side fire
  // pulse (MOBILE-UX r1, owner: "only show the actual hit zones of shells";
  // constants + rationale at RET_FLOOR_PX/RET_CEIL_FRAC). The [floor,
  // ceiling] clamp is applied at DRAW time (clampRetR) so smoothing eases
  // toward the truth and the clamp can never amplify it.
  /** The ring's target radius, on an eighth-pixel grid: the simulation's bloom decays toward its rest without end, and
   *  every mark placed off the ring (the seated touch chip's style among them) would follow its creep by 1e-7 px a frame
   *  for good (r10 critic). On the grid the ring settles, and the marks with it. */
  function reticleTargetR(view: HudAimView): number {
    return Math.round(view.radPx * 8) / 8;
  }
  // Display clamp for the DRAWN dispersion-circle radius — the single
  // authority every consumer reads (circle, sniper hairline gaps, hit-wedge
  // ring, nameplate avoidance), so all sight furniture agrees on the size.
  function retCeilPx(): number { return Math.min(w, h) * RET_CEIL_FRAC; }
  function clampRetR(r: number): number {
    return Math.max(RET_FLOOR_PX, Math.min(r, retCeilPx()));
  }
  let lastDrawnR = RET_FLOOR_PX;   // actual radius painted by drawReticle
  let lastGunOutside = false;      // actual gun marker lies outside dispersion radius
  let lastCircleX = 0, lastCircleY = 0;
  let lastCameraMarkerCol: string | null = PEN_NONE;
  let lastGunMarkerCol: string | null = PEN_NONE;

  // A settled reticle is usually pixel-identical for dozens of frames while
  // a parked/reloading-ready tank holds aim. Keep the live canvas (no bitmap
  // resampling or visual downgrade), but avoid clearing and replaying its
  // several hundred 2D path operations until an input actually changes.
  // Transient arcs, confirmations, reloads, scope fades and radius smoothing
  // deliberately bypass this cache so their animation remains full-rate.
  const reticlePaint: ReticlePaintState = {
    valid: false, mode: '', w: 0, h: 0,
    cx: 0, cy: 0, radPx: 0, gunX: null, gunY: null,
    penRatio: null, distM: null, blockedDistM: null,
    gunDistM: null, gunTargetId: null, aimTargetId: null,
    singleReticle: false, atGunLimit: false, gunLimitSpec: false,
    selfRightLabel: null,
    zoom: 1, reloadKind: '', ammoSelectionPending: false, magazineCapacity: 0, magazineRounds: 0,
    magazineLauncher: false, magazineFeed: -1,
    shellType: '', shellCount: 0, shellUnlimited: false, reloading: false, furniture: -1, drawnR: 0,
  };
  // A reticle at rest reuses its paint; a face that finishes loading after that paint (measured and drawn in the
  // fallback) repaints it (r10 critic: a scope readout painted before the webfont kept the condensed fallback face).
  document.fonts?.addEventListener?.('loadingdone', () => { reticlePaint.valid = false; });
  /** The reticle's weapon is the selected card (renderShells runs before the canvas paints). */
  function selectedWeaponDry(view: HudAimView): boolean {
    return reticleWeaponDry((lastShells && lastShells[localSlot]) || DEFAULT_SHELLS[0], view.ammoSelectionPending);
  }
  const magazineFeedKey = (magazine: MagazineView | null): number =>
    magazine?.feed == null || !Number.isFinite(magazine.feed) ? -1 : magazine.feed | 0;
  const nearPaint = (
    a: number | null,
    b: number | null,
    eps = 0.02,
  ): boolean => (a == null && b == null)
    || (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)
      && Math.abs(a - b) <= eps);
  function reticleGeometryMatches(view: HudAimView): boolean {
    return reticlePaint.mode === mode
      && reticlePaint.w === w
      && reticlePaint.h === h
      && reticlePaint.furniture === sightFurniture.version
      && nearPaint(reticlePaint.cx, view.cx)
      && nearPaint(reticlePaint.cy, view.cy)
      && nearPaint(reticlePaint.radPx, view.radPx, 0.01)
      && nearPaint(reticlePaint.gunX, view.gunX)
      && nearPaint(reticlePaint.gunY, view.gunY)
      && nearPaint(reticlePaint.drawnR, lastDrawnR, 0.01);
  }
  function reticleAimStateMatches(view: HudAimView): boolean {
    return nearPaint(reticlePaint.penRatio, view.penRatio, 0.001)
      && nearPaint(reticlePaint.distM, view.distM, 0.25)
      && nearPaint(reticlePaint.blockedDistM, view.blockedDistM, 0.05)
      && nearPaint(reticlePaint.gunDistM, view.gunDistM, 0.05)
      && reticlePaint.gunTargetId === view.gunTargetId
      && reticlePaint.aimTargetId === aimTargetId
      && reticlePaint.singleReticle === !!view.singleReticle
      && reticlePaint.atGunLimit === !!view.atGunLimit
      && reticlePaint.gunLimitSpec === !!view.gunLimitSpec
      && reticlePaint.selfRightLabel === view.selfRightLabel
      && nearPaint(reticlePaint.zoom, view.zoom || 1, 0.001);
  }
  function reticleWeaponStateMatches(view: HudAimView): boolean {
    const shell = (lastShells && lastShells[localSlot]) || DEFAULT_SHELLS[0];
    const magazine = view.magazine;
    return reticlePaint.reloadKind === (view.reload?.kind || '')
      && reticlePaint.ammoSelectionPending === view.ammoSelectionPending
      && reticlePaint.magazineCapacity === ((magazine?.capacity ?? 0) | 0)
      && reticlePaint.magazineRounds === ((magazine?.rounds ?? 0) | 0)
      && reticlePaint.magazineLauncher === (magazine?.launcher === true)
      && reticlePaint.magazineFeed === magazineFeedKey(magazine)
      // The dry state needs no key of its own: reticleWeaponDry reads only this card's count and unlimited mark
      // and the pending flag, all compared here (owner 2026-10-17, out of ammo).
      && reticlePaint.shellType === (shell.type || '')
      && reticlePaint.shellCount === shellCount(shell)
      && reticlePaint.shellUnlimited === (shell.unlimited === true);
  }
  function reticleCanReuse(view: HudAimView): boolean {
    if (!reticlePaint.valid || hitDirs.length || hitMark || readyPulseT >= 0 || scopeFadeMs >= 0) return false;
    // ... and the first frame after one ends repaints too, whatever its reload kind reads (critic r9b: a clip's cycle
    // read t 0 under the same kind, reused the last cycling paint and left the chambered round part-filled)
    if (reticlePaint.reloading || reloadHudFraction(view.reload, false, selectedWeaponDry(view)) > 0) return false;
    const targetR = clampRetR(reticleTargetR(view));
    if (Math.abs(targetR - smoothRadPx) > 0.01) return false;
    return reticleGeometryMatches(view)
      && reticleAimStateMatches(view)
      && reticleWeaponStateMatches(view);
  }
  function captureReticlePaint(view: HudAimView): void {
    const shell = (lastShells && lastShells[localSlot]) || DEFAULT_SHELLS[0];
    const mag = view.magazine;
    reticlePaint.valid = true;
    reticlePaint.mode = mode; reticlePaint.w = w; reticlePaint.h = h; reticlePaint.furniture = sightFurniture.version;
    reticlePaint.cx = view.cx; reticlePaint.cy = view.cy; reticlePaint.radPx = view.radPx;
    reticlePaint.gunX = view.gunX; reticlePaint.gunY = view.gunY;
    reticlePaint.penRatio = view.penRatio; reticlePaint.distM = view.distM;
    reticlePaint.blockedDistM = view.blockedDistM; reticlePaint.gunDistM = view.gunDistM;
    reticlePaint.gunTargetId = view.gunTargetId; reticlePaint.aimTargetId = aimTargetId;
    reticlePaint.singleReticle = !!view.singleReticle;
    reticlePaint.atGunLimit = !!view.atGunLimit; reticlePaint.gunLimitSpec = !!view.gunLimitSpec;
    reticlePaint.selfRightLabel = view.selfRightLabel;
    reticlePaint.zoom = view.zoom || 1; reticlePaint.reloadKind = view.reload?.kind || '';
    reticlePaint.ammoSelectionPending = view.ammoSelectionPending;
    reticlePaint.magazineCapacity = (mag?.capacity ?? 0) | 0;
    reticlePaint.magazineRounds = (mag?.rounds ?? 0) | 0;
    reticlePaint.magazineLauncher = mag?.launcher === true;
    reticlePaint.magazineFeed = magazineFeedKey(mag);
    reticlePaint.shellType = shell.type || ''; reticlePaint.shellCount = shellCount(shell);
    reticlePaint.shellUnlimited = shell.unlimited === true;
    // (the reuse check's own reading: a shell switch's SWITCHING window repaints only as the reload it shows runs)
    reticlePaint.reloading = reloadHudFraction(view.reload, false, selectedWeaponDry(view)) > 0;
    reticlePaint.drawnR = lastDrawnR;
  }

  function strokeReticleCircle(cx: number, cy: number, radius: number): void {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function paintReticleMarker(
    cx: number,
    cy: number,
    scale: number,
    centerRadius: number,
    reach = 8 * scale,
  ): void {
    const inner = 2.8 * scale;
    const outer = Math.min(8 * scale, reach);
    ctx.beginPath();
    if (outer > inner + 1) {
      ctx.moveTo(cx - outer, cy + 0.5); ctx.lineTo(cx - inner, cy + 0.5);
      ctx.moveTo(cx + inner, cy + 0.5); ctx.lineTo(cx + outer, cy + 0.5);
      ctx.moveTo(cx + 0.5, cy - outer); ctx.lineTo(cx + 0.5, cy - inner);
      ctx.moveTo(cx + 0.5, cy + inner); ctx.lineTo(cx + 0.5, cy + outer);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, centerRadius * Math.min(scale, 1.35), 0, Math.PI * 2);
    ctx.fill();
  }

  function reticleGunColor(view: HudAimView, draw: ReticleDrawState): string {
    if (draw.blocked) return PEN_RED;
    if (draw.limited) return 'rgba(160,170,180,0.95)';
    const gunOnTarget = aimTargetId != null
      && (forcedStill || view.gunTargetId === aimTargetId);
    return penColor(gunOnTarget ? view.penRatio : null);
  }

  function reticleRingColor(draw: ReticleDrawState): string {
    if (draw.blocked) return PEN_RED;
    if (draw.limited) return 'rgba(160,170,180,0.95)';
    if (draw.dry) return DRY_RING;
    return draw.sniper ? SNIPER_COL : CIRCLE_COL;
  }

  function prepareReticleDraw(view: HudAimView, dt: number): ReticleDrawState {
    const state = reticleDrawScratch;
    const anchor = resolveReticleAnchor(view, _reticleAnchor);
    state.cx = anchor.x ?? view.cx;
    state.cy = anchor.y ?? view.cy;
    state.single = anchor.single;
    const targetRadius = reticleTargetR(view);
    smoothRadPx += (targetRadius - smoothRadPx) * (1 - Math.exp(-14 * dt));
    // (the ease's last eighth of a pixel, one step of the target's grid, snaps: its tail would move every mark placed off
    // the ring, and the seated touch chip's style, a fraction of a pixel a frame for good; r10 critic)
    if (Math.abs(targetRadius - smoothRadPx) <= 0.125) smoothRadPx = targetRadius;
    state.radius = clampRetR(smoothRadPx);
    state.circleX = view.gunX ?? state.cx;
    state.circleY = view.gunY ?? state.cy;
    lastDrawnR = state.radius;
    lastGunOutside = view.gunX != null && view.gunY != null
      && Math.hypot(view.gunX - state.cx, view.gunY - state.cy) > state.radius;
    lastCircleX = state.circleX;
    lastCircleY = state.circleY;

    state.sniper = mode === 'sniper';
    state.dry = selectedWeaponDry(view);
    state.reloadFraction = reloadHudFraction(view.reload, view.ammoSelectionPending, state.dry);
    state.reloading = state.reloadFraction > 0;
    state.blocked = view.blockedDistM != null;
    state.limited = !state.blocked && view.atGunLimit;
    state.gunColor = reticleGunColor(view, state);
    state.ringColor = reticleRingColor(state);
    state.zoomScale = state.sniper
      ? Math.min(1.8, 1.1 + 0.085 * (view.zoom || 8))
      : 1;
    state.markerLineWidth = (state.sniper ? 1.8 : 1.6)
      * Math.min(state.zoomScale, 1.4);
    state.centerClearanceRadius = 14 + (state.zoomScale - 1) * 9;
    state.magazine = null;
    state.magazineBottomY = 0;
    state.magazineHalfW = 0;
    state.magazineInkBottomY = 0;
    state.countdownBottomY = 0;
    state.countdownRightX = 0;
    state.warningY = 0;
    state.warningW = 0;
    state.aboveTopY = Infinity;
    sightInk.count = 0;
    state.tagTopY = Infinity;
    return state;
  }

  function paintAutoloaderMagazine(view: HudAimView, draw: ReticleDrawState): void {
    const magazine = view.ammoSelectionPending ? null
      : autoloaderHudState(view.magazine, view.reload, magazineHudScratch, draw.dry);
    draw.magazine = magazine;
    draw.magazineBottomY = 0;
    if (!magazine) {
      lastMagazineIndicatorY = null;
      lastMagazineIndicatorState = null;
      return;
    }

    const shellW = draw.sniper ? 6.5 : 5.5;
    const shellH = draw.sniper ? 16 : 14;
    const gap = draw.sniper ? 4 : 3.5;
    const visibleShells = magazine.visibleShells;
    const totalW = visibleShells * shellW + (visibleShells - 1) * gap;
    // A struck rack spans its arc and strike (paintDrySlash: 3 px past the rack, 2 px past the shells). A live one keeps
    // its shells' contours SIGHT_MARK_RING_GAP from the ring's stroke where it sits, or drops below the ring (critic r6:
    // a phone's clip touched its small ring).
    let y0 = draw.cy + draw.centerClearanceRadius + 6;
    if (magazine.dry) y0 = sightColumnTop(draw, totalW * 0.5 + 5, AUTOLOADER_HUD_ARC_DEPTH + shellH + 3,
      sightMarkTop(draw, totalW * 0.5 + 5, AUTOLOADER_HUD_ARC_DEPTH + shellH + 3));
    else {
      for (let i = 0; i < visibleShells; i++) {
        const pose = autoloaderHudShellPose(i, visibleShells, magazineShellPoseScratch);
        const box = magazineShellBox(draw.cx + (i - (visibleShells - 1) * 0.5) * (shellW + gap), y0 + pose.y + shellH * 0.5,
          pose.rotation, shellW, shellH, rackShellBoxScratch);
        if (ringGap(draw, box.x0, box.y0, box.x1, box.y1) < SIGHT_MARK_RING_GAP) {
          y0 = belowRing(draw) + RACK_TURN_Y + RACK_CONTOUR;
          break;
        }
      }
      // (its contours 1.5 px past the shells, the turned outer shells 1.1 px wider and 0.4 px lower)
      y0 = sightColumnTop(draw, totalW * 0.5 + RACK_TURN_X + RACK_CONTOUR, AUTOLOADER_HUD_ARC_DEPTH + shellH + RACK_CONTOUR + RACK_TURN_Y,
        y0, RACK_CONTOUR);
    }
    draw.magazineBottomY = y0 + shellH;
    draw.magazineHalfW = totalW * 0.5;
    // (its shells turned on their arc, their contours, a struck rack's strike 3 px past it)
    noteSightInk(draw.cx - totalW * 0.5 - RACK_TURN_X - RACK_CONTOUR - 3, y0 - AUTOLOADER_HUD_ARC_DEPTH - RACK_CONTOUR - 3,
      draw.cx + totalW * 0.5 + RACK_TURN_X + RACK_CONTOUR + 3, y0 + shellH + AUTOLOADER_HUD_ARC_DEPTH + RACK_CONTOUR + 3);
    lastMagazineIndicatorY = y0;
    lastMagazineIndicatorState = magazine;
    const shellInk = magazine.reloading ? AUTOLOADER_SHELL_RELOADING : RELOAD_ACCENT;
    const shellOutline = magazine.reloading
      ? 'rgba(174,184,192,0.64)'
      : 'rgba(240,160,48,0.7)';
    // Between two rounds of a clip (or a salvo rack's missiles) the round being chambered — the next to fire, the last
    // ready slot — fills from its base as the cycle runs, so it is whole the moment the gun is ready; the slot of the
    // round just fired stays empty (critic r3: filling that one showed a round loading back in, then vanishing). The
    // rack shows the cycle itself, so no numeral sits under it (the countdown jammed the rack against the ring).
    const chambering = magazine.intraClip ? magazine.readyShells - 1 : -1;
    const cycle = chambering >= 0 && view.reload && view.reload.totalS > 0
      ? Math.max(0, Math.min(1, 1 - view.reload.t / view.reload.totalS))
      : 0;

    for (let i = 0; i < visibleShells; i++) {
      const pose = autoloaderHudShellPose(i, visibleShells, magazineShellPoseScratch);
      const shellCx = draw.cx + (i - (visibleShells - 1) * 0.5) * (shellW + gap);
      const shellCy = y0 + pose.y + shellH * 0.5;
      draw.magazineBottomY = Math.max(draw.magazineBottomY, y0 + pose.y + shellH);
      draw.magazineInkBottomY = Math.max(draw.magazineInkBottomY,
        magazineShellBox(shellCx, shellCy, pose.rotation, shellW, shellH, rackShellBoxScratch).y1);
      const ready = i < magazine.readyShells && i !== chambering;
      // Owner 2026-10-17 (out of ammo): a slot stowage can no longer fill is spent — hollow, in the danger ink, never
      // loading; the reload fill spreads over the shells that will actually load.
      const spent = i >= magazine.feedShells;
      const loading = spent ? 0
        : magazine.fullReload ? Math.max(0, Math.min(1, magazine.loadProgress * magazine.feedShells - i))
          : i === chambering ? cycle : 0;
      ctx.save();
      ctx.translate(shellCx, shellCy);
      ctx.rotate(pose.rotation);
      const x = -shellW * 0.5;
      const y = -shellH * 0.5;
      magazineShellPath(ctx, x, y, shellW, shellH);
      ctx.strokeStyle = 'rgba(5,8,11,0.88)';
      ctx.lineWidth = 3;
      ctx.stroke();
      magazineShellPath(ctx, x, y, shellW, shellH);
      ctx.fillStyle = 'rgba(7,11,14,0.52)';
      ctx.fill();
      if (spent) {
        magazineShellPath(ctx, x, y, shellW, shellH);
        ctx.strokeStyle = DRY_ACCENT;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (ready || loading > 0) {
        ctx.save();
        magazineShellPath(ctx, x, y, shellW, shellH);
        ctx.clip();
        ctx.fillStyle = shellInk;
        const fillH = ready ? shellH : shellH * loading;
        ctx.fillRect(x - 1, y + shellH - fillH, shellW + 2, fillH + 1);
        ctx.restore();
      }
      magazineShellPath(ctx, x, y, shellW, shellH);
      ctx.strokeStyle = ready || loading > 0 ? shellInk : shellOutline;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    if (magazine.overflow > 0) {
      ctx.fillStyle = shellInk;
      ctx.font = FONT_RACK_OVERFLOW;
      ctx.textAlign = 'left';
      // 3 px past the turned outer shell's contour (the capture's rack gap)
      sightText.placeAs(SIGHT_TEXT_OVERFLOW, `+${magazine.overflow}`, draw.cx + totalW * 0.5 + RACK_TURN_X + RACK_CONTOUR + 3,
        y0 + shellH, ctx);
      ctx.textAlign = 'center';
    }
    if (magazine.dry) paintDrySlash(draw.cx, y0 + AUTOLOADER_HUD_ARC_DEPTH * 0.5 + shellH * 0.5, totalW * 0.5 + 3, shellH * 0.5 + 2);
  }

  /** The out-of-ammo strike: one diagonal through the spent rack or round, over a dark contour. */
  function paintDrySlash(cx: number, cy: number, halfW: number, halfH: number): void {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy + halfH);
    ctx.lineTo(cx + halfW, cy - halfH);
    ctx.strokeStyle = 'rgba(5,8,11,0.88)';
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.strokeStyle = DRY_ACCENT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /**
   * Owner 2026-10-17: a single-shot gun with no round left shows one hollow, struck round where the reload countdown
   * would run — never a sweep, countdown or ready pulse that reads as a loaded gun.
   */
  function paintDryRound(draw: ReticleDrawState): void {
    // The compact sniper stack has no room under the marker: its readout carries the struck round (critic r3).
    if (!draw.dry || draw.magazine || compactSniperStack(draw)) return;
    const shellW = draw.sniper ? 8 : 7;
    const shellH = draw.sniper ? 19 : 17;
    // the strike reaches 4 px past the round, 1 px past its ends, and its round cap 1.7 px further (paintStruckRound)
    const top = sightColumnTop(draw, shellW * 0.5 + 6, shellH + 3, sightMarkTop(draw, shellW * 0.5 + 6, shellH + 3));
    paintStruckRound(draw.cx - shellW * 0.5, top, shellW, shellH);
    noteSightInk(draw.cx - shellW * 0.5 - 6, top - 3, draw.cx + shellW * 0.5 + 6, top + shellH + 3);
    draw.magazineBottomY = top + shellH;
  }

  /**
   * Where the empty mark under the marker starts (a struck rack or round, `halfW` either side of the sight's centre,
   * `markH` tall). A ring wide enough to hold the mark keeps it under the marker; a smaller one — a phone's, unscoped —
   * would run its sparse danger dashes through the mark in the same red (critic r3), so the mark drops below the ring,
   * as the scope's readout line sits below its ring.
   */
  function sightMarkTop(draw: ReticleDrawState, halfW: number, markH: number): number {
    const top = draw.cy + draw.centerClearanceRadius + 6;
    // The mark's strike reaches 3 px above its top; the ring's stroke and halo 1.5 px past its radius; 3 px apart at the
    // least, wherever the ring sits (r8: the gun's ring off the screen's centre, a lagging lay, crossed a mark the old
    // lower-arc test passed).
    return ringGap(draw, draw.cx - halfW, top - 3, draw.cx + halfW, top + markH) < SIGHT_MARK_RING_GAP ? belowRing(draw) + 3 : top;
  }

  /** The first row SIGHT_MARK_RING_GAP below the ring's stroke (its halo included), and on the scope below its lower
   *  cross arm too where that holds (scopeArmGap). */
  function belowRing(draw: ReticleDrawState): number {
    const ring = draw.circleY + draw.radius + RING_STROKE_REACH;
    return (lowerArmHolds(draw) ? Math.max(ring, draw.cy + scopeArmEnd(draw.radius) + SCOPE_ARM_REACH) : ring) + SIGHT_MARK_RING_GAP;
  }

  /** The lowest row anything set over the sight may reach: the ring's stroke, the marker's clear centre and any mark
   *  already set over the ring this frame, whichever is highest. */
  function aboveSightTop(draw: ReticleDrawState): number {
    return Math.min(draw.circleY - draw.radius - RING_STROKE_REACH, draw.cy - draw.centerClearanceRadius, draw.aboveTopY);
  }

  /**
   * How far a box keeps from the scope's lower cross arm (paintScopeSkeleton: from the ring's gap to scopeArmEnd, its
   * under-stroke SCOPE_ARM_REACH either side; negative where it runs through the box), on a scope over 430 px tall: the
   * marks under the sight keep off it as off the ring (gauntlet r12: the reload time took the lower arm's place at
   * 1280x720, 1024x600 and 900x700, the sight one arm short). The compact stack of the short windows keeps the arm's
   * yielding: there the marks have no room under its end.
   */
  function scopeArmGap(draw: ReticleDrawState, x0: number, y0: number, x1: number, y1: number): number {
    const dx = Math.max(draw.cx - SCOPE_ARM_REACH - x1, 0, x0 - draw.cx - SCOPE_ARM_REACH);
    const dy = Math.max(draw.cy + draw.radius + 3 - y1, 0, y0 - draw.cy - scopeArmEnd(draw.radius));
    return dx > 0 || dy > 0 ? Math.hypot(dx, dy) : -1;
  }

  /** Whether the scope's lower arm counts as the sight's furniture this frame (scopeArmGap). */
  function lowerArmHolds(draw: ReticleDrawState): boolean {
    return draw.sniper && h > 430;
  }

  /**
   * Where a mark under the marker goes when the HUD's furniture sits under it (sightFurniture.ts; critic r9: on the
   * smallest phones a rack or struck round dropped below a wide ring ran into the systems row at 568x290 and the left
   * FIRE button at 320x568): the mark, `halfW` either side of the sight's centre, its ink from `reach` over `top` to
   * `markH` under it, stays at `top` while it keeps 3 px from every panel and control; otherwise it goes over the ring,
   * 3 px over its stroke and the marker's clear centre, where that keeps clear.
   */
  function sightColumnTop(draw: ReticleDrawState, halfW: number, markH: number, top: number, reach = 3): number {
    const x0 = draw.cx - halfW;
    const x1 = draw.cx + halfW;
    if (sightFurnitureGap(x0, top - reach, x1, top + markH) >= SIGHT_MARK_RING_GAP) return top;
    const above = aboveSightTop(draw) - SIGHT_MARK_RING_GAP - markH;
    if (sightFurnitureGap(x0, above - reach, x1, above + markH) < SIGHT_MARK_RING_GAP) return top;
    draw.aboveTopY = Math.min(draw.aboveTopY, above - reach);
    return above;
  }

  /** How far a box keeps from the ring's stroke (negative: the ring runs through it). */
  function ringGap(draw: ReticleDrawState, x0: number, y0: number, x1: number, y1: number): number {
    const { circleX: x, circleY: y, radius: r } = draw;
    const near = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
    const far = Math.max(Math.hypot(x0 - x, y0 - y), Math.hypot(x1 - x, y0 - y), Math.hypot(x0 - x, y1 - y), Math.hypot(x1 - x, y1 - y));
    const ring = Math.max(near - (r + RING_STROKE_REACH), r - RING_STROKE_REACH - far);
    // (on a scope over 430 px tall its lower cross arm is the ring's furniture too)
    return lowerArmHolds(draw) ? Math.min(ring, scopeArmGap(draw, x0, y0, x1, y1)) : ring;
  }

  /** One hollow round in the empty ink, struck through, over a dark contour. */
  function paintStruckRound(x: number, y: number, shellW: number, shellH: number): void {
    magazineShellPath(ctx, x, y, shellW, shellH);
    ctx.strokeStyle = 'rgba(5,8,11,0.88)';
    ctx.lineWidth = 3;
    ctx.stroke();
    magazineShellPath(ctx, x, y, shellW, shellH);
    ctx.fillStyle = 'rgba(7,11,14,0.52)';
    ctx.fill();
    ctx.strokeStyle = DRY_ACCENT;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    paintDrySlash(x + shellW * 0.5, y + shellH * 0.5, shellW * 0.5 + 4, shellH * 0.5 + 1);
  }

  /**
   * Short landscape screens stack the sniper readouts right under the scope (sniperReadoutStack), level with the
   * furniture under the marker. There the struck round rides the readout line and the rack's countdown sits beside it.
   */
  function compactSniperStack(draw: ReticleDrawState): boolean {
    return draw.sniper && h <= 430;
  }

  function paintReadyPulse(draw: ReticleDrawState): void {
    if (readyPulseT < 0) return;
    const age = lastTimeS - readyPulseT;
    if (age < 0 || age >= 0.4) {
      readyPulseT = -1;
      return;
    }
    if (forcedStill) return;
    ctx.globalAlpha = 0.95 * (1 - age / 0.4);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = draw.markerLineWidth + 0.6;
    paintReticleMarker(draw.cx, draw.cy, draw.zoomScale, 1.1, markerArmReach(draw));
  }

  /** How far the centre marker's arms reach: 3 px inside the ring's stroke (through the scope on a short window the ring,
   *  some 14 px, ran over the arms' 8 px x the zoom's 1.8, gauntlet r17). */
  function markerArmReach(draw: ReticleDrawState): number {
    return draw.radius - RING_STROKE_REACH - SIGHT_MARK_RING_GAP - draw.markerLineWidth;
  }

  function paintPhysicalGunMarker(view: HudAimView, draw: ReticleDrawState): void {
    if (draw.single) return;
    if (view.gunX == null || view.gunY == null) {
      lastGunMarkerCol = PEN_NONE;
      return;
    }
    const scale = 0.9 * draw.zoomScale;
    lastGunMarkerCol = draw.gunColor;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(6,9,12,0.9)';
    ctx.fillStyle = 'rgba(6,9,12,0.9)';
    ctx.lineWidth = draw.markerLineWidth * 0.9 + 1.3;
    paintReticleMarker(view.gunX, view.gunY, scale, 1.1);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = draw.gunColor;
    ctx.fillStyle = draw.gunColor;
    ctx.lineWidth = draw.markerLineWidth * 0.9;
    paintReticleMarker(view.gunX, view.gunY, scale, 1.1);
  }

  function paintReloadCountdown(view: HudAimView, draw: ReticleDrawState): void {
    // A clip's cycle shows on the rack itself (its next shell fills); only a gun or a whole rack reloading counts.
    if (!draw.reloading || draw.magazine?.intraClip) return;
    const text = reloadHudCountdown(view.reload, view.ammoSelectionPending);
    ctx.fillStyle = RELOAD_ACCENT;
    ctx.font = FONT_COUNTDOWN;
    const textW = ctx.measureText(text).width;
    ctx.font = FONT_COUNTDOWN_UNIT;
    const unit = view.ammoSelectionPending ? '' : ' s';
    const unitW = ctx.measureText(unit).width;
    const height = COUNTDOWN_ASCENT + COUNTDOWN_DESCENT;
    // The compact sniper stack sets a rack's countdown beside it, left (the range tag hangs off the right rim), when the
    // ring keeps clear of it there; so does a taller scope whose countdown under the rack would push the readout line
    // (its digits 3 px under the countdown's) past where it rests above the controls (critic r7: 431 to 525 px tall).
    let x = draw.cx - draw.magazineHalfW - 7 - textW - unitW;
    let y = draw.magazineBottomY - 2;
    const underRackSinks = draw.sniper
      && draw.magazineInkBottomY + COUNTDOWN_RACK_GAP + height + 3 + 10 > sniperReadoutFloor();
    const beside = !!draw.magazine && (compactSniperStack(draw) || underRackSinks)
      && ringGap(draw, x, y - COUNTDOWN_ASCENT, x + textW + unitW, y + COUNTDOWN_DESCENT) >= SIGHT_MARK_RING_GAP;
    if (!beside) {
      // Centred under the rack, its digits 3 px under the shells' contours (critic r6: their tops touched the clip), or
      // under the marker; below the ring when its stroke would come within SIGHT_MARK_RING_GAP of the digits (critic r6:
      // the desktop scope's countdown sat on the ring's dashes).
      let top = draw.magazine ? draw.magazineInkBottomY + COUNTDOWN_RACK_GAP
        : draw.cy + draw.centerClearanceRadius + 15 - COUNTDOWN_ASCENT;
      x = draw.cx - (textW + unitW) / 2;
      if (ringGap(draw, x, top, x + textW + unitW, top + height) < SIGHT_MARK_RING_GAP) top = Math.max(top, belowRing(draw));
      // critic r7 (a small ring on the touch scope read "3.2 s200 m"): where the scope's range tag hangs level with the
      // countdown and nearer than TAG_GROUP_GAP beside it, the countdown drops under the tag, so the two never read as
      // one line.
      const tag = sniperDistanceTag(view, draw);
      // (within the marks' 3 px of the tag too: set under the lower arm, a countdown came 0.24 px under it, r12)
      if (tag && top < tag.y1 + SIGHT_MARK_RING_GAP && top + height > tag.y0 && tag.x0 - (x + textW + unitW) < TAG_GROUP_GAP) {
        top = Math.max(top, tag.y1 + SIGHT_MARK_RING_GAP);
        // (dropping can carry it onto a ring that sits under the marker, the gun's lay off the centre)
        if (ringGap(draw, x, top, x + textW + unitW, top + height) < SIGHT_MARK_RING_GAP) top = Math.max(top, belowRing(draw));
      }
      y = top + COUNTDOWN_ASCENT;
      // Where the HUD's furniture sits there (critic r9: a phone's left FIRE button, a short landscape's systems row), it
      // goes beside the rack, left, or over the sight (over the ring and any mark set over it), where that keeps clear.
      if (sightFurnitureGap(x, top, x + textW + unitW, top + height) < SIGHT_MARK_RING_GAP) {
        const sideX = draw.cx - draw.magazineHalfW - 7 - textW - unitW;
        const sideY = draw.magazineBottomY - 2;
        // (over a range tag hung at the 1:30 too, where it would sit on the countdown's row within a group gap)
        const tagNear = tag && tag.y1 < draw.cy && tag.x0 - (x + textW + unitW) < TAG_GROUP_GAP;
        // (and through a scope over 430 px tall over its upper cross arm's end, as the readout row, where that keeps clear:
        // over the ring alone the countdown took the arm's place at 320x568, gauntlet r19)
        const ringTop = Math.min(aboveSightTop(draw), tagNear ? tag.y0 - SIGHT_MARK_RING_GAP : Infinity) - SIGHT_MARK_RING_GAP - height;
        const armTop = draw.sniper && h > 430
          ? Math.min(ringTop, draw.cy - scopeArmEnd(draw.radius) - SCOPE_ARM_REACH - SIGHT_MARK_RING_GAP - height) : ringTop;
        // (never raised under a gun-limit chip, which stacks over it wider than its figures: it came 2 px from the map at
        // 360x640, the paint receipt)
        const overTop = armTop < ringTop && !aimWarningState(view, aimWarningScratch).visible
          && sightFurnitureGap(x, armTop, x + textW + unitW, armTop + height) >= SIGHT_MARK_RING_GAP ? armTop : ringTop;
        if (draw.magazine && ringGap(draw, sideX, sideY - COUNTDOWN_ASCENT, sideX + textW + unitW, sideY + COUNTDOWN_DESCENT)
          >= SIGHT_MARK_RING_GAP && sightFurnitureGap(sideX, sideY - COUNTDOWN_ASCENT, sideX + textW + unitW,
          sideY + COUNTDOWN_DESCENT) >= SIGHT_MARK_RING_GAP) {
          x = sideX;
          y = sideY;
        } else if (sightFurnitureGap(x, overTop, x + textW + unitW, overTop + height) >= SIGHT_MARK_RING_GAP) {
          y = overTop + COUNTDOWN_ASCENT;
          draw.aboveTopY = Math.min(draw.aboveTopY, overTop);
        }
      }
    }
    draw.countdownBottomY = y + COUNTDOWN_DESCENT;
    draw.countdownRightX = x + textW + unitW;
    noteSightInk(x, y - COUNTDOWN_ASCENT, x + textW + unitW, y + COUNTDOWN_DESCENT);
    ctx.textAlign = 'left';
    ctx.font = FONT_COUNTDOWN;
    sightText.placeAs(SIGHT_TEXT_COUNTDOWN, text, x, y, ctx);
    ctx.font = FONT_COUNTDOWN_UNIT;
    sightText.placeAs(SIGHT_TEXT_COUNTDOWN_UNIT, unit, x + textW, y, ctx);
    ctx.textAlign = 'center';
  }

  /**
   * The scope's readout stack: the readout line, and the zoom plate sniperZoomDrop() under it. The line rests under the
   * ring, above the controls (sniperReadoutFloor), and rises from that rest past the furniture under it (a small portrait
   * phone's FIRE button sits under the sight); short landscape keeps the stack close to the scope (critic r3, 844x390 /
   * 932x430 / 667x375). What is under the marker always wins over where the line would rest (critic r7: from 431 to about
   * 525 px tall the rest clamp put the line on the rack's countdown, the rack itself and the struck round): its digits
   * (10 px over its baseline) keep 3 px under the rack or the struck round (a struck rack's strike reaches 2.4 px under
   * the shells, a struck round's 2.7, a live rack's contour 1.5), the countdown, the aim warning's chip and the range tag
   * where it hangs over the stack's columns; the line and the zoom plate keep 3 px from the ring's stroke, or the stack
   * drops below the ring. Every part of the row, and the chip, then keeps 3 px from the HUD's panels and controls, which
   * the layout measures (sightFurniture.ts; critic r9: the floors once modelled here as constants missed the consumables
   * column at 667x375, the left FIRE button on small portrait phones and the touch warning chip). Where the stack would
   * reach one, the row tries, in order: the zoom plate beside the line, right of it, TAG_GROUP_GAP apart; the warning chip
   * joining the row, left of the line; the chip above the ring (sniperChipAboveY), the row settling without it; the line
   * and the plate right of the column under the marker (rowBeside: the rack or the struck round, dropped below a ring just
   * wide enough to cross it, and the countdown under it); the row above the ring, the chip over it (rowAbove); and last
   * the line alone, the zoom plate left out (the view itself shows the zoom), under the column or above the ring. Where
   * nothing keeps clear (the widest rings on the smallest windows), the row takes the place that reaches least far into
   * the furniture. The scope's vision switch is furniture too: it sits beside the sight, past the widest ring
   * (aerialHud.css), or in its mirror seat when a shot report covers it (battleHudLayout seatScopeVision).
   */
  function sniperReadoutStack(view: HudAimView, draw: ReticleDrawState): typeof sniperStackScratch {
    const stack = sniperStackScratch;
    const row = sniperRowScratch;
    const line = sniperReadoutLine(draw);
    row.lineW = line.round + line.countW + line.typeW;
    ctx.font = FONT_SCOPE_ZOOM;
    // the plate's rules reach 32 px past its text, and their 1.2 px stroke 0.6 px past their ends
    row.zoomW = ctx.measureText(sniperZoomText(view)).width + 24 + 40 + 1.2;
    row.chipW = draw.warningY ? draw.warningW : 0;
    // The line stays centred under the marker. How far each part's ink reaches over and under the row's baseline: the
    // line's digits 10 and 1.1 (the compact stack's struck round, leading the line, 14.7 and 4.7 with its strike's dark
    // contour), the
    // zoom plate's 11.9 and 1.3, the warning chip's AIM_WARNING_CHIP_ABOVE and _BELOW.
    row.lineTop = line.round ? 14.7 : 10;
    row.lineFoot = line.round ? 4.7 : 1.1;
    // (and the struck round's strike 3.75 px past the round's left edge with its 1.5 px stroke: the row rose clear of what
    // its round's box kept from and left the strike 1.25 px from a centred controls row at 800x400)
    row.lineOver = line.round ? 4 : 0;
    row.chipRight = draw.cx - row.lineW / 2 - TAG_GROUP_GAP;
    // the column under the marker: a struck rack's strike 3 px past the rack (2 px past its shells), a live rack's
    // contours 1.5 px past it, the scope's struck round (8 px wide, its strike 6 px past its middle), the countdown
    const column = Math.max(draw.magazine ? draw.magazineHalfW + (draw.dry ? 5 : 2) : draw.dry ? 10 : 0,
      draw.countdownRightX - draw.cx);
    row.besideLeft = draw.cx + column + TAG_GROUP_GAP;
    row.bestClear = -Infinity;
    const tag = sniperDistanceTag(view, draw);
    // (over 430 px tall the line rests a fixed step under the lower cross arm's end: under a 96 px floor it stood 8 px
    // under the arm at 1920 and 30 to 55 px under it at 1280, 1024 and 390x844, a label off the lens, gauntlet r12)
    const rest = h <= 300 ? draw.cy + 32
      : h <= 430 ? draw.cy + 48
        : Math.min(draw.cy + Math.max(draw.radius * 1.02 + 24,
          scopeArmEnd(draw.radius) + SCOPE_ARM_REACH + SIGHT_MARK_RING_GAP + row.lineTop + 1), sniperReadoutFloor());
    const chip = row.chipW > 0;
    let seated = false;
    for (let i = 0; i < SNIPER_ROW_PLACES.length && !seated; i++) {
      // (read by index: no iterator a repaint)
      const place = SNIPER_ROW_PLACES[i];
      if (place[3] && !chip) continue;
      seated = trySniperRow(draw, tag, rest, place[0], place[1] || (place[0] === 'rowBeside' && chip), place[2]);
    }
    if (!seated) trySniperRow(draw, tag, rest, row.bestMode, row.bestChipAbove, row.bestNoZoom);
    const mode = row.mode;
    if (row.chipAbove) {
      draw.warningY = mode === 'rowAbove' ? row.chipOverY : sniperChipAboveY(draw);
      draw.warningX = draw.cx;
    } else if (mode === 'chipBeside') {
      draw.warningY = stack.y;
      draw.warningX = row.chipRight - row.chipW / 2;
    }
    stack.lineX = row.lineLeft + line.round;
    stack.zoomX = mode === 'stack' ? draw.cx : row.zoomLeft + row.zoomW / 2;
    stack.zoomY = mode === 'stack' ? stack.y + sniperZoomDrop() : stack.y;
    return stack;
  }

  /** Seats the scope row in `mode` (the chip above the ring or over the row with `chipAbove`, the zoom plate left out
   *  with `noZoom`) and says whether it keeps 3 px from the furniture there; the place that reaches least far is kept
   *  for the last resort (sniperReadoutStack). */
  function trySniperRow(draw: ReticleDrawState, tag: typeof sniperTagScratch | null, rest: number, mode: SniperRowMode,
    chipAbove: boolean, noZoom: boolean): boolean {
    const row = sniperRowScratch;
    row.mode = mode;
    row.chipAbove = chipAbove;
    row.noZoom = noZoom;
    const y = settleSniperRow(draw, tag, rest, mode);
    sniperStackScratch.y = y;
    const clear = sniperRowClearance(draw, y, mode);
    if (clear > row.bestClear) {
      row.bestClear = clear;
      row.bestMode = mode;
      row.bestChipAbove = chipAbove;
      row.bestNoZoom = noZoom;
    }
    return clear >= SIGHT_MARK_RING_GAP;
  }

  /** Where the scope row's line and zoom plate start in `mode`: the line centred under (or over) the marker, the plate
   *  right of it (TAG_GROUP_GAP apart) unless it hangs under the line; 'rowBeside' starts the line past the column under
   *  the marker. */
  function sniperRowPlace(draw: ReticleDrawState, mode: SniperRowMode): void {
    const row = sniperRowScratch;
    row.lineLeft = mode === 'rowBeside' ? row.besideLeft : draw.cx - row.lineW / 2;
    row.zoomLeft = row.lineLeft + row.lineW + TAG_GROUP_GAP;
  }

  /** One part of the scope row in `mode` (0 the line, 1 the zoom plate, 2 the chip beside the line): its columns and how
   *  far its ink reaches over and under the row's baseline (a plate hung under the line reaches under it only). False
   *  when the row has no such part. */
  function sniperRowPart(draw: ReticleDrawState, part: number, mode: SniperRowMode): boolean {
    const row = sniperRowScratch;
    const out = sniperPartScratch;
    if (part === 0) {
      out.x0 = row.lineLeft - row.lineOver; out.x1 = row.lineLeft + row.lineW; out.top = row.lineTop; out.foot = row.lineFoot;
      return true;
    }
    if (part === 1) {
      if (row.noZoom) return false;
      const drop = mode === 'stack' ? sniperZoomDrop() : 0;
      out.x0 = mode === 'stack' ? draw.cx - row.zoomW / 2 : row.zoomLeft;
      out.x1 = out.x0 + row.zoomW; out.top = 11.9 - drop; out.foot = drop + 1.3;
      return true;
    }
    if (mode !== 'chipBeside') return false;
    out.x0 = row.chipRight - row.chipW; out.x1 = row.chipRight; out.top = AIM_WARNING_CHIP_ABOVE; out.foot = AIM_WARNING_CHIP_BELOW;
    return true;
  }

  /** How far the scope row's ink reaches over its baseline in `mode` (sniperRowPart). */
  function sniperRowTop(draw: ReticleDrawState, mode: SniperRowMode): number {
    let top = -Infinity;
    for (let part = 0; part < 3; part++) if (sniperRowPart(draw, part, mode)) top = Math.max(top, sniperPartScratch.top);
    return top;
  }

  /** How far the scope row's ink reaches under its baseline in `mode` (sniperRowPart). */
  function sniperRowFoot(draw: ReticleDrawState, mode: SniperRowMode): number {
    let foot = -Infinity;
    for (let part = 0; part < 3; part++) if (sniperRowPart(draw, part, mode)) foot = Math.max(foot, sniperPartScratch.foot);
    return foot;
  }

  /** The row's baseline at or over `y` that keeps every part 3 px over the furniture under it (sightFurnitureRise). */
  function sniperRowRise(draw: ReticleDrawState, y: number, mode: SniperRowMode): number {
    for (let pass = 0; pass < 2; pass++) {
      for (let part = 0; part < 3; part++) {
        if (!sniperRowPart(draw, part, mode)) continue;
        const p = sniperPartScratch;
        // (a part hung under the line rises with it: what starts under the line's top is under the part too)
        y = Math.min(y, sightFurnitureRise(p.x0, p.x1, y, p.top, p.foot, SIGHT_MARK_RING_GAP,
          Math.max(p.top, sniperRowScratch.lineTop)));
      }
    }
    return y;
  }

  /** The lowest baseline that keeps the row's ink (`top` over it) 3 px under a mark whose foot is at `foot` (0: none). */
  function sniperUnder(foot: number, top: number): number {
    return foot ? foot + 3 + top : 0;
  }

  /** The scope row's baseline over the sight ('rowAbove'): its foot 3 px over the ring's stroke, the marker's clear centre
   *  and `armTop`, then risen past what sits level with the marker under it (the vision switch); a chip goes over the row
   *  (over a chip placeAimWarning already set over the sight, where the row leaves it be). */
  function sniperRowOver(draw: ReticleDrawState, tag: typeof sniperTagScratch | null, mode: SniperRowMode, top: number,
    armTop: number): number {
    const row = sniperRowScratch;
    const chipOver = !row.chipAbove && draw.warningY > 0 && draw.warningY < draw.cy;
    let y = Math.min(aboveSightTop(draw), armTop, chipOver ? draw.warningY - AIM_WARNING_CHIP_ABOVE : Infinity)
      - SIGHT_MARK_RING_GAP - sniperRowFoot(draw, mode);
    // (over the range tag too, where it hangs over the sight beside the row's columns)
    if (tag && tag.y1 < draw.cy) {
      let right = -Infinity;
      for (let part = 0; part < 3; part++) if (sniperRowPart(draw, part, mode)) right = Math.max(right, sniperPartScratch.x1);
      if (tag.x0 < right + 3) y = Math.min(y, tag.y0 - SIGHT_MARK_RING_GAP - sniperRowFoot(draw, mode));
    }
    y = sniperRowRise(draw, y, mode);
    row.chipOverY = Math.min(y - top, draw.tagTopY) - SIGHT_MARK_RING_GAP - AIM_WARNING_CHIP_BELOW;
    return y;
  }

  /** Whether the scope row over the sight at baseline `y`, and the chip over it, keep the marks' gap from the HUD's
   *  furniture (settleSniperRow's seat over the upper arm, kept only where it does). */
  function sniperRowAboveClear(draw: ReticleDrawState, y: number, mode: SniperRowMode): boolean {
    for (let part = 0; part < 3; part++) {
      if (!sniperRowPart(draw, part, mode)) continue;
      const p = sniperPartScratch;
      if (sightFurnitureGap(p.x0, y - p.top, p.x1, y + p.foot) < SIGHT_MARK_RING_GAP) return false;
    }
    const half = draw.warningW / 2;
    return !(draw.warningY > 0 && half > 0) || sightFurnitureGap(draw.cx - half, sniperRowScratch.chipOverY - AIM_WARNING_CHIP_ABOVE,
      draw.cx + half, sniperRowScratch.chipOverY + AIM_WARNING_CHIP_BELOW) >= SIGHT_MARK_RING_GAP;
  }

  /** The scope row's baseline in `mode` from its rest `y` (sniperReadoutStack): risen past the furniture under it, then
   *  the lowest at or under that keeping every gap to the marks under the marker and the ring; above the ring, the
   *  nearest over it ('rowAbove'). */
  function settleSniperRow(draw: ReticleDrawState, tag: typeof sniperTagScratch | null, y: number, mode: SniperRowMode): number {
    const row = sniperRowScratch;
    sniperRowPlace(draw, mode);
    const top = sniperRowTop(draw, mode);
    if (mode === 'rowAbove') {
      // (on a scope over 430 px tall over the upper cross arm's end, as the marks under the sight keep off the lower one:
      // over the ring alone the line took the upper arm's place at 320x568, gauntlet r18; over the ring where that
      // seat, or the chip over it, would meet the HUD's furniture: the chip came 2 px from the map at 360x640)
      if (h > 430) {
        const raised = sniperRowOver(draw, tag, mode, top, draw.cy - scopeArmEnd(draw.radius) - SCOPE_ARM_REACH);
        if (sniperRowAboveClear(draw, raised, mode)) return raised;
      }
      return sniperRowOver(draw, tag, mode, top, Infinity);
    }
    y = sniperRowRise(draw, y, mode);
    let right = -Infinity;
    for (let part = 0; part < 3; part++) if (sniperRowPart(draw, part, mode)) right = Math.max(right, sniperPartScratch.x1);
    // (beside the column under the marker, the row is clear of the rack, the struck round and the countdown)
    const column = mode !== 'rowBeside';
    const chipInColumn = mode !== 'chipBeside' && !row.chipAbove && draw.warningY > 0;
    y = Math.max(y, column ? sniperUnder(draw.magazineBottomY && draw.magazineBottomY + (draw.dry ? 3 : 2), top) : 0,
      column ? sniperUnder(draw.countdownBottomY, top) : 0,
      chipInColumn ? sniperUnder(draw.warningY + AIM_WARNING_CHIP_BELOW, top) : 0,
      tag && tag.x0 < right + 3 ? sniperUnder(tag.y1, top) : 0);
    for (let part = 0; part < 3; part++) {
      if (!sniperRowPart(draw, part, mode)) continue;
      const p = sniperPartScratch;
      if (ringGap(draw, p.x0, y - p.top, p.x1, y + p.foot) < SIGHT_MARK_RING_GAP) {
        y = Math.max(y, belowRing(draw) + top);
        break;
      }
    }
    return y;
  }

  /** How far the scope row seated at baseline `y` in `mode`, and the warning chip wherever it sits, keep from the HUD's
   *  panels and controls (sightFurniture.ts) and from the screen's edges. */
  function sniperRowClearance(draw: ReticleDrawState, y: number, mode: SniperRowMode): number {
    const row = sniperRowScratch;
    let clear = Infinity;
    for (let part = 0; part < 3; part++) {
      if (!sniperRowPart(draw, part, mode)) continue;
      const p = sniperPartScratch;
      clear = Math.min(clear, sniperMarkClearance(p.x0, y - p.top, p.x1, y + p.foot));
    }
    if (row.chipW && mode !== 'chipBeside') {
      const chipY = row.chipAbove ? (mode === 'rowAbove' ? row.chipOverY : sniperChipAboveY(draw)) : draw.warningY;
      const x0 = draw.cx - row.chipW / 2;
      const x1 = draw.cx + row.chipW / 2;
      const y0 = chipY - AIM_WARNING_CHIP_ABOVE;
      const y1 = chipY + AIM_WARNING_CHIP_BELOW;
      clear = Math.min(clear, sniperMarkClearance(x0, y0, x1, y1));
      // ... and the row's parts 3 px from the chip itself, wherever each sits (a place that sets one on the other is the
      // worst of all, not a last resort)
      for (let part = 0; part < 3; part++) {
        if (!sniperRowPart(draw, part, mode)) continue;
        const p = sniperPartScratch;
        clear = Math.min(clear, Math.max(x0 - p.x1, p.x0 - x1, y0 - (y + p.foot), (y - p.top) - y1));
      }
    }
    return clear;
  }

  /** How far a mark's box keeps from the furniture and the screen's edges. */
  function sniperMarkClearance(x0: number, y0: number, x1: number, y1: number): number {
    return Math.min(sightFurnitureGap(x0, y0, x1, y1), x0, y0, w - x1, h - y1);
  }

  /** The warning chip's baseline above the sight (the scope's last resort, sniperReadoutStack): its foot 3 px over the
   *  ring's stroke, the marker's clear centre, any mark set over the ring, the vision switch level with the marker beside
   *  it and the range tag hung at the 1:30, whichever is highest (the gun's ring can sit off the marker, under it: a small
   *  ring lagging low sends the chip here too). */
  function sniperChipAboveY(draw: ReticleDrawState): number {
    // (two by two on a touch layout, the lit view alone on one under 300 px tall or 340 px wide: aerialHud.css)
    const half = document.body.classList.contains('cot-touch-layout') && h > 300 && w > 340
      ? SCOPE_VISION_TOUCH_HALF_H : SCOPE_VISION_HALF_H;
    const top = Math.min(aboveSightTop(draw), draw.cy - half, draw.tagTopY);
    return top - SIGHT_MARK_RING_GAP - AIM_WARNING_CHIP_BELOW;
  }

  /** The lowest the scope readout line rests on a screen over 430 px tall, clear of the controls under it. */
  function sniperReadoutFloor(): number {
    return h - 176;
  }

  /** How far the zoom plate's baseline sits under the readout line's. */
  function sniperZoomDrop(): number {
    return h <= 300 ? 18 : 24;
  }

  let sniperZoomValue = NaN;
  let sniperZoomLabel = '';
  /** The zoom plate's text (rebuilt only when the zoom steps). */
  function sniperZoomText(view: HudAimView): string {
    const zoom = view.zoom || 8;
    if (zoom !== sniperZoomValue) {
      sniperZoomValue = zoom;
      sniperZoomLabel = `×${zoom.toFixed(1)}`;
    }
    return sniperZoomLabel;
  }

  /** The scope readout line's parts and widths: [struck round] count type. */
  function sniperReadoutLine(draw: ReticleDrawState): typeof sniperLineScratch {
    const line = sniperLineScratch;
    const shell = (lastShells && lastShells[localSlot]) || DEFAULT_SHELLS[0];
    const count = ammunitionCountText(shell);
    if (count !== line.count) {
      line.count = count;
      line.label = `${count} `;
    }
    line.type = shell.type || '';
    ctx.font = FONT_SCOPE_COUNT;
    line.countW = ctx.measureText(line.label).width;
    ctx.font = FONT_SCOPE_TYPE;
    line.typeW = ctx.measureText(line.type).width;
    // Out of ammo on the compact stack, the struck round leads the line: [round] 0 APFSDS.
    line.round = draw.dry && !draw.magazine && compactSniperStack(draw) ? COMPACT_DRY_ROUND_W + 8 : 0;
    return line;
  }

  /** The scope's range tag (null without a range): its text, origin and text box. It hangs at the 4:30 of a ring the
   *  drawn radius around the marker (the screen's centre, not the gun's own ring when a lagging lay displaces it). */
  function sniperDistanceTag(view: HudAimView, draw: ReticleDrawState): typeof sniperTagScratch | null {
    if (!draw.sniper || view.distM == null || !Number.isFinite(view.distM)) return null;
    const tag = sniperTagScratch;
    const offset = 0.7071 * (draw.radius + 9);
    // A small ring hangs the tag level with the rack (the compact stack, and a portrait phone's scope: critic r3, the
    // strike ended 1.5 px from the tag): it starts past the rack and its strike, 5 px clear of the strike's end.
    const rackClear = draw.magazine ? draw.magazineHalfW + 10 - 4 : 0;
    const metres = Math.round(view.distM);
    if (metres !== tag.metres) {
      tag.metres = metres;
      tag.text = `${metres} m`;
    }
    // (and past the hit confirmation's settled shards, which reach 0.7071 x (18.5 + 13) px along the diagonal and 3.5 px
    // across: on a phone's small ring the 4:30 shard met the tag's first digit, gauntlet r3)
    tag.x0 = draw.cx + Math.max(offset, rackClear, HIT_SHARD_CLEAR) + 4;
    tag.y = draw.cy + offset + 12;
    ctx.font = FONT_RANGE_TAG;
    tag.x1 = tag.x0 + ctx.measureText(tag.text).width;
    tag.y0 = tag.y - 11.5 * 0.74;
    tag.y1 = tag.y + 11.5 * 0.08;
    draw.tagTopY = Infinity;
    // Where the HUD's furniture sits at the 4:30 (critic r9: a short landscape's systems row under a wide ring), the tag
    // hangs at the 1:30 instead, its foot as far over the marker as its top was under it, when that keeps clear.
    if (sightFurnitureGap(tag.x0, tag.y0, tag.x1, tag.y1) < SIGHT_MARK_RING_GAP) {
      const y = draw.cy - offset - 3.5 - 11.5 * 0.08;
      if (sightFurnitureGap(tag.x0, y - 11.5 * 0.74, tag.x1, y + 11.5 * 0.08) >= SIGHT_MARK_RING_GAP) {
        tag.y = y;
        tag.y0 = y - 11.5 * 0.74;
        tag.y1 = y + 11.5 * 0.08;
        draw.tagTopY = tag.y0;
      }
    }
    return tag;
  }

  function paintSniperAmmoReadout(draw: ReticleDrawState, x: number, y: number): void {
    if (draw.blocked) return;
    const { label, type, countW, round } = sniperReadoutLine(draw);
    if (round) paintStruckRound(x - round, y - COMPACT_DRY_ROUND_H + 2, COMPACT_DRY_ROUND_W, COMPACT_DRY_ROUND_H);
    ctx.textAlign = 'left';
    ctx.font = FONT_SCOPE_COUNT;
    ctx.fillStyle = draw.dry ? DRY_ACCENT : 'rgba(226,236,244,0.92)';
    sightText.placeAs(SIGHT_TEXT_AMMO_COUNT, label, x, y, ctx);
    ctx.font = FONT_SCOPE_TYPE;
    ctx.fillStyle = 'rgba(159,176,191,0.9)';
    sightText.placeAs(SIGHT_TEXT_AMMO_TYPE, type, x + countW, y, ctx);
    ctx.textAlign = 'center';
  }

  function paintSniperDistance(view: HudAimView, draw: ReticleDrawState): void {
    const tag = sniperDistanceTag(view, draw);
    if (!tag) return;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(208,221,232,0.8)';
    ctx.font = FONT_RANGE_TAG;
    sightText.placeAs(SIGHT_TEXT_RANGE, tag.text, tag.x0, tag.y, ctx);
    ctx.textAlign = 'center';
  }

  function paintSniperZoom(view: HudAimView, x: number, y: number): void {
    if (window.__HUD_HIDE_ZOOM_PLATE) return;
    // Keep the familiar zoom line directly beneath ammunition, not over the
    // target or detached down beside the vehicle console.
    const text = sniperZoomText(view);
    // (in the ring's own green, its rules a translucent one: a paler green of its own beside the ring read as two greens,
    // gauntlet r4)
    ctx.font = FONT_SCOPE_ZOOM;
    ctx.fillStyle = PEN_GREEN;
    sightText.placeAs(SIGHT_TEXT_ZOOM, text, x, y, ctx);
    const halfWidth = ctx.measureText(text).width / 2 + 12;
    ctx.strokeStyle = ZOOM_RULE_INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - halfWidth - 20, y - 5.5);
    ctx.lineTo(x - halfWidth, y - 5.5);
    ctx.moveTo(x + halfWidth, y - 5.5);
    ctx.lineTo(x + halfWidth + 20, y - 5.5);
    ctx.stroke();
  }

  function paintSniperReadouts(view: HudAimView, draw: ReticleDrawState): void {
    if (!draw.sniper) return;
    const stack = sniperReadoutStack(view, draw);
    paintSniperAmmoReadout(draw, stack.lineX, stack.y);
    paintSniperDistance(view, draw);
    if (!sniperRowScratch.noZoom) paintSniperZoom(view, stack.zoomX, stack.zoomY);
    // (the row's line and zoom plate, its rules included, and the range tag, for the cross arms to yield to)
    for (let part = 0; part < 2; part++) {
      if (!sniperRowPart(draw, part, sniperRowScratch.mode)) continue;
      const p = sniperPartScratch;
      noteSightInk(p.x0, stack.y - p.top, p.x1, stack.y + p.foot);
    }
    const tag = sniperDistanceTag(view, draw);
    if (tag) noteSightInk(tag.x0, tag.y0, tag.x1, tag.y1);
  }

  /** Notes a box the reticle's marks took this frame (sightInk): the scope's cross arms and mil ticks keep off it. */
  function noteSightInk(x0: number, y0: number, x1: number, y1: number): void {
    if (sightInk.count >= sightInk.boxes.length) return;
    const box = sightInk.boxes[sightInk.count++];
    box.x0 = x0; box.y0 = y0; box.x1 = x1; box.y1 = y1;
  }

  /** Whether a touch layout's warning chip sits under the sight, seated by the reticle (a portrait, or a landscape 550 px
   *  tall or more; a shorter landscape parks it in the left lane under the map: battleHudLayout.css). */
  function touchWarningSeated(): boolean {
    // (a short landscape parks it beside the map, and so does a portrait phone 340 px wide or less, where every seat by
    // the sight met the left FIRE button, the map or the speedometer: r10g, the coordinator; the struck round or rack
    // still shows the empty gun there)
    // (a mouse layout always seats it there)
    return !document.body.classList.contains('cot-touch-layout') || (!(w > h && h < 550) && !(h >= w && w <= 340));
  }

  /**
   * Where the aim warning sits this frame: its baseline under the marker, and its chip 3 px under the rack or an empty
   * mark that dropped below a small ring (sightMarkTop; a strike reaches 3 px under it, a live rack's contour 2), the
   * countdown and, on the scope, the range tag, and 3 px from the ring. The scope's readout line and zoom plate then
   * start under the chip. Every layout shows the DOM chip (the kit's notice plate), which the reticle seats there, the
   * canvas chip's height (critic r9: at 50% + 48 px the phone's chip met the scope's
   * countdown and a rack dropped below a wide ring), unless a short landscape or a portrait phone 340 px wide or less
   * parks it under the map.
   */
  function placeAimWarning(view: HudAimView, draw: ReticleDrawState): void {
    const warning = aimWarningState(view, aimWarningScratch);
    const touch = document.body.classList.contains('cot-touch-layout');
    if (!warning.visible || (touch && !touchWarningSeated())) return;
    const tag = sniperDistanceTag(view, draw);
    if (touch) draw.warningW = w < 375 && h >= w ? TOUCH_WARNING_NARROW_W : TOUCH_WARNING_W;
    else {
      ctx.font = FONT_AIM_WARNING;
      // (the label's tracking too, the centre notices' .08em: battleHudLayout.css .cot-aim-warning)
      draw.warningW = Math.ceil(ctx.measureText(warning.text).width + warning.text.length * AIM_WARNING_TRACK_PX) + 62;
    }
    draw.warningX = draw.cx;
    const marks = Math.max(draw.magazineBottomY ? draw.magazineBottomY + (draw.dry ? 3 : 2) + 3 + AIM_WARNING_CHIP_ABOVE : 0,
      draw.countdownBottomY ? draw.countdownBottomY + 3 + AIM_WARNING_CHIP_ABOVE : 0,
      tag ? tag.y1 + 3 + AIM_WARNING_CHIP_ABOVE : 0);
    let y = Math.max(draw.cy + Math.max(62, draw.radius + 24), marks);
    // ... and 3 px from the ring's stroke wherever the ring sits (the gun's ring follows a lagging lay off the centre)
    const half = draw.warningW / 2;
    if (ringGap(draw, draw.cx - half, y - AIM_WARNING_CHIP_ABOVE, draw.cx + half, y + AIM_WARNING_CHIP_BELOW) < SIGHT_MARK_RING_GAP) {
      y = Math.max(y, belowRing(draw) + AIM_WARNING_CHIP_ABOVE);
    }
    // ... and over the sight where the HUD's furniture sits there and over it reaches less far into it (critic r9: a small
    // portrait phone's left FIRE button under the sight); the scope's row may still move it (sniperReadoutStack). A touch
    // chip first rises to just under the ring, the marker's clear centre and the marks under it (r10e: at 320x568 the seat
    // over the sight, where the DETECTED notice shows, was taken for a small ring that leaves room under it)
    let best = sightFurnitureGap(draw.cx - half, y - AIM_WARNING_CHIP_ABOVE, draw.cx + half, y + AIM_WARNING_CHIP_BELOW);
    if (best < SIGHT_MARK_RING_GAP && touch) {
      const seat = y;
      const near = Math.max(belowRing(draw) + AIM_WARNING_CHIP_ABOVE,
        draw.cy + draw.centerClearanceRadius + 6 + AIM_WARNING_CHIP_ABOVE, marks);
      const clear = sightFurnitureGap(draw.cx - half, near - AIM_WARNING_CHIP_ABOVE, draw.cx + half, near + AIM_WARNING_CHIP_BELOW);
      if (near < y && clear > best) { best = clear; y = near; }
      // ... or 3 px under what its seat met (a portrait phone's vision switch, its views two by two, reached 1 px over the
      // chip's seat under the sight at 390x844)
      let under = seat;
      for (let i = 0; i < sightFurniture.count; i++) {
        const box = sightFurniture.boxes[i];
        if (box.x0 < draw.cx + half && box.x1 > draw.cx - half && box.y0 < seat + AIM_WARNING_CHIP_BELOW
          && box.y1 + SIGHT_MARK_RING_GAP > seat - AIM_WARNING_CHIP_ABOVE) {
          under = Math.max(under, box.y1 + SIGHT_MARK_RING_GAP + AIM_WARNING_CHIP_ABOVE);
        }
      }
      const underClear = sightFurnitureGap(draw.cx - half, under - AIM_WARNING_CHIP_ABOVE, draw.cx + half, under + AIM_WARNING_CHIP_BELOW);
      if (under > seat && under + AIM_WARNING_CHIP_BELOW <= h - 4 && underClear > best) { best = underClear; y = under; }
    }
    if (best < SIGHT_MARK_RING_GAP) {
      const over = sniperChipAboveY(draw);
      if (sightFurnitureGap(draw.cx - half, over - AIM_WARNING_CHIP_ABOVE, draw.cx + half, over + AIM_WARNING_CHIP_BELOW)
        > best) y = over;
    }
    draw.warningY = y;
  }

  /** Seats the touch warning chip where placeAimWarning (or the scope row) put it: its box the canvas chip's, its left
   *  edge, top and width written only when they move. */
  function seatTouchWarning(seated: boolean, draw: ReticleDrawState): void {
    const seat = touchWarningSeat;
    if (seated !== seat.seated) {
      seat.seated = seated;
      if (seated) touchAimWarning.dataset.seat = 'sight';
      else delete touchAimWarning.dataset.seat;
      seat.x = NaN; seat.y = NaN; seat.w = NaN;
    }
    if (!seated) return;
    const x = draw.warningX - draw.warningW / 2;
    const y = draw.warningY - AIM_WARNING_CHIP_ABOVE;
    if (x !== seat.x) { seat.x = x; touchAimWarning.style.setProperty('--hud-aim-warning-x', `${x}px`); }
    if (y !== seat.y) { seat.y = y; touchAimWarning.style.setProperty('--hud-aim-warning-y', `${y}px`); }
    if (draw.warningW !== seat.w) { seat.w = draw.warningW; touchAimWarning.style.setProperty('--hud-aim-warning-w', `${draw.warningW}px`); }
  }

  /** The parked chip's notice: raised with its words, changed when they change, dismissed when it goes or seats (only
   *  then: the reticle repaints every frame), its glyph the chip's. */
  let aimNoticeText = '';
  function syncAimNotice(warning: AimWarningState | null): void {
    const text = warning?.text ?? '';
    if (text === aimNoticeText) return;
    aimNoticeText = text;
    if (!warning || !text) { aimNotices.dismiss(AIM_NOTICE_ID); return; }
    aimNotices.show({
      id: AIM_NOTICE_ID, className: 'cot-aim-notice', severity: warning.kind === 'blocked' ? 'error' : 'warning',
      icon: warning.kind === 'rollover' ? 'rematch' : warning.kind === 'blocked' ? 'alert' : 'turretRing',
      // (over the network's, which a touch layout gives a screen reader alone: multiplayerStatus.ts)
      text, durationMs: null, dismissible: false, priority: 2,
    });
  }

  function paintAimWarning(view: HudAimView, draw: ReticleDrawState): void {
    const warning = aimWarningState(view, aimWarningScratch);
    // (the chip is the kit's notice plate in every layout, the DOM chip the reticle seats: a mouse layout's canvas drew a
    // pointed hex with its own stroke and glyph beside the touch layout's plate, gauntlet r3)
    const touchWarning = warning.visible;
    const seated = touchWarning && draw.warningY > 0 && touchWarningSeated();
    // (UI-LOCKDOWN B14) where a layout parks the chip off the sight it is the kit's notice in the battle's region, which
    // the planner seats where the chip parked (battleHudLayout.css); the DOM chip is then the reticle's mark alone
    const parked = touchWarning && !touchWarningSeated();
    syncAimNotice(parked ? warning : null);
    // A seated chip yields to the sixth-sense notice (sightFurniture.ts sightNotice, published on a touch layout only):
    // where its place runs into the notice it waits hidden until the notice goes. The notice never moves it: it comes and
    // goes, and the places clear of it ran into the furniture instead (r10e: at 320x568 the left FIRE button, 22 px deep
    // at 16 m, 33 at 24 m)
    const yielded = seated && sightNoticeGap(draw.warningX - draw.warningW / 2, draw.warningY - AIM_WARNING_CHIP_ABOVE,
      draw.warningX + draw.warningW / 2, draw.warningY + AIM_WARNING_CHIP_BELOW) < SIGHT_MARK_RING_GAP;
    const shown = touchWarning && !parked && !yielded;
    if (touchAimWarning.hidden === shown) touchAimWarning.hidden = !shown;
    // (the chip, canvas or seated, for the scope's cross arms to yield to; its seat even while it waits hidden for the
    // notice, which moves no mark)
    if (seated || (!touchWarning && warning.visible && draw.warningY > 0)) {
      noteSightInk(draw.warningX - draw.warningW / 2, draw.warningY - AIM_WARNING_CHIP_ABOVE,
        draw.warningX + draw.warningW / 2, draw.warningY + AIM_WARNING_CHIP_BELOW);
    }
    if (touchWarning) {
      if (touchAimWarningText.textContent !== warning.text) {
        touchAimWarningText.textContent = warning.text;
        touchAimWarning.dataset.tip = warning.text;
      }
      if (touchAimWarning.dataset.kind !== warning.kind) {
        touchAimWarning.dataset.kind = warning.kind;
        // (a gun at its travel limit is a warning, the detection's and the alerts' wash and glyph tone: as info its plate
        // was the one cool plate among the warm ones, gauntlet r4)
        touchAimWarning.dataset.severity = warning.kind === 'blocked' ? 'error' : 'warning';
        // (a blocked gun is an error, in the kit's error glyph: the sprite's alert)
        touchAimWarningGlyph.innerHTML = uiIconSVG(warning.kind === 'rollover' ? 'rematch' : warning.kind === 'blocked' ? 'alert' : 'turretRing', 14);
      }
      seatTouchWarning(seated, draw);
      return;
    }
  }

  function drawReticle(view: HudAimView, dt: number): void {
    const draw = prepareReticleDraw(view, dt);
    const { cx, cy, radius: r, circleX: ccx, circleY: ccy } = draw;
    // Conventional tanks keep a screen-center CAMERA marker plus the physical
    // gun mark. A hydraulic fixed gun collapses both onto the reachable shot
    // point because there is no independent turret lay to communicate.
    const sniper = draw.sniper;
    const cameraCol = view.atGunLimit ? PEN_RED : PEN_NONE;
    const reloadFrac = draw.reloadFraction;
    const isReloading = draw.reloading;

    // --- dispersion circle: ONE thin DASHED ring (stock WoT's aim circle),
    // NO outer tick marks. r7-2 MAJOR (round critique: "16-20 chunky
    // round-capped dashes read as a UI loading spinner, not gunnery
    // optics"): the ring is now 32/40 FINE hard-ended segments at a 1.3 to
    // 1.5 px stroke — fine-ruled instrument marks whose count stays stable
    // through bloom/shrink. The dark under-stroke survives (sunlit-road
    // legibility) but slims to a hairline halo.
    // Out of ammo (owner 2026-10-17) the ring stays an aiming mark but thins to sparse, muted danger dashes.
    const segN = draw.dry ? (sniper ? 20 : 16) : sniper ? 40 : 32;
    const segPeriod = (2 * Math.PI * r) / segN;
    const dashLen = Math.max(2.5, segPeriod * 0.52);
    const dashGap = Math.max(1.5, segPeriod - dashLen);
    const circleLw = sniper ? 1.5 : 1.3;
    ctx.lineCap = 'butt';
    ctx.setLineDash([dashLen, dashGap]);
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = 'rgba(0,0,0,0.62)'; // dark halo under-pass
    ctx.lineWidth = circleLw + 1.5;
    strokeReticleCircle(ccx, ccy, r);
    ctx.globalAlpha = 0.97;
    // BLOCKED-SHOT INDICATOR (controls_gunnery r2): the muzzle→aim path is
    // obstructed short of the aim point — WoT's red reticle on a blocked gun
    // line. The circle flips red so the player never fires into a crest.
    // GUN-LIMIT (r2): gun pinned by the mechanical pitch limit
    // / casemate arc — the circle greys out so an unconverged lay is visibly
    // not-ready even though the path itself is clear.
    const gunCol = draw.gunColor;
    const ringCol = draw.ringColor;
    ctx.strokeStyle = ringCol;
    ctx.fillStyle = ringCol;
    ctx.lineWidth = circleLw;
    strokeReticleCircle(ccx, ccy, r);
    // RELOAD PROGRESS LIVES IN THE DISPERSION DOTS. The old second circle
    // around the center marker duplicated the same state and cluttered the
    // point of aim after every shot. The remaining fraction now paints an
    // amber, clockwise dotted sweep directly over the truthful dispersion
    // ring: full at fire, draining back to the normal aim dots at ready.
    if (isReloading) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = RELOAD_ACCENT;
      ctx.lineWidth = circleLw + 0.8;
      ctx.beginPath();
      ctx.arc(ccx, ccy, r, -Math.PI / 2, -Math.PI / 2 + reloadFrac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // --- primary marker: a SMALL CLEAN CROSS (short gapped arms + a fine
    // center dot). It is camera-neutral for conventional tanks and gun-colored
    // for the single-reticle hydraulic layout.
    // r7-2 MAJOR (round critique: "the
    // white center cross is oversized relative to the circle and sits on a
    // faint dark backing disc"): the whole marker shrinks ~40% (arms 13 px
    // → 8 px, strokes 2.4 → 1.6), the ink under-pass thins to a hairline
    // contour at half alpha, and the canvas shadow is OFF for the marker —
    // the accumulated dark passes were what fused into the backing disc.
    // hud_ui r5: the marker SCALES with zoom in sniper mode — at x8 a fixed
    // 8px cross would be lost on the target's hull.
    const zs = draw.zoomScale;
    // round 32 (owner 2026-09-21): the single fixed-mount sight is the ONLY
    // marker, so it also carries the camera cross's red "gun cannot get
    // there" read when a limit pins it (a lag is never a limit — movement.ts
    // fixedMountYawPinned); the grey ring still marks the unconverged lay.
    const primaryMarkerCol = draw.single
      ? (draw.limited ? PEN_RED : gunCol)
      : cameraCol;
    lastCameraMarkerCol = draw.single ? null : cameraCol;
    lastGunMarkerCol = draw.single ? primaryMarkerCol : PEN_NONE;
    ctx.shadowBlur = 0;
    // The dotted sweep, countdown numeral and ready-pulse edge detector all
    // read the same canonical reload state.
    // Out of ammo (owner 2026-10-17) disarms it too: a weapon that turns dry mid-reload never flashes ready.
    if (view.ammoSelectionPending || draw.dry) readyPulseT = -1;
    else if (reloadHudReadyPulse(wasReloading, isReloading)) readyPulseT = lastTimeS;
    wasReloading = !view.ammoSelectionPending && isReloading; // a dry weapon is never reloading (reloadHudFraction)
    const markLw = draw.markerLineWidth;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(6,9,12,0.9)';
    ctx.fillStyle = 'rgba(6,9,12,0.9)';
    ctx.lineWidth = markLw + 1.2;
    const markerReach = markerArmReach(draw);
    paintReticleMarker(cx, cy, zs, 1.6, markerReach);
    ctx.globalAlpha = 0.97;
    ctx.strokeStyle = primaryMarkerCol;
    ctx.fillStyle = primaryMarkerCol;
    ctx.lineWidth = markLw;
    paintReticleMarker(cx, cy, zs, 1.1, markerReach);

    // Layout clearance for the center marker's magazine/countdown furniture;
    // no circle is drawn here (reload progress is on the dispersion dots).
    // Magazine autoloader ready-rack: up to four shells curve directly
    // UNDER the center marker. The outer rounds tilt inward and sit slightly
    // above the middle round, forming a shallow ready-rack arc.
    // Orange means ready; both intra-clip cycling and full-magazine loading
    // turn the rack neutral gray. A full reload fills the silhouettes from
    // the base upward while the timer counts down.
    // A magazine larger than the four-shell visual window keeps an exact
    // +N overflow label instead of silently losing authoritative state.
    paintAutoloaderMagazine(view, draw);
    paintDryRound(draw);
    // ready pulse (r7): the moment the reload-dot sweep clears, the center marker
    // flashes white for ~0.4 s — WoT's unmistakable "gun ready" beat.
    // r8 MAJOR: never in a forced still — with timeS frozen the flash held at
    // full alpha in every captured frame and painted the pen-colored marker
    // ready-pulse WHITE (the canonical sniper shot lost its green pen read).
    paintReadyPulse(draw);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // PRIMARY GUN MARKER: the colored marker and dispersion circle share the
    // barrel's real reachable point. It draws even when aligned, overlaying a
    // colored center dot on the neutral camera cross; when a gun limit pins,
    // it separates and stays at the point where the next shell will go.
    paintPhysicalGunMarker(view, draw);
    ctx.globalAlpha = 1;

    // Scope readouts stay around the aiming point: ammunition and magnification
    // below, with range beside the lower-right rim.
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    paintReloadCountdown(view, draw);
    placeAimWarning(view, draw);
    // r4 (WoT arcade furniture): sniper-only readouts — vanilla WoT arcade
    // carries no text under the reticle. r6-2 (round critique: "the
    // 24 APFSDS / 300 m / x8.0 stack floats at ~62% screen height"): the
    // three-line mid-frame column is gone —
    //   - chambered count: ONE compact line hugging the circle's lower rim
    //   - distance: a small corner tag hanging off the reticle's 4:30 rim
    //   - zoom factor: directly beneath ammunition, clear of vehicle controls
    paintSniperReadouts(view, draw);
    paintAimWarning(view, draw);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  // ---------- shell selector ----------
  function renderShells(shells: HudShellCard[] | null | undefined, slot: number, pending = false): void {
    for (let i = 0; i < 3; i++) {
      const unavailable = !!shells?.length && !shells[i];
      if (slotEls[i].hidden !== unavailable) slotEls[i].hidden = unavailable;
      slotPresentations[i].render(shells?.[i] || DEFAULT_SHELLS[i], i === slot, pending);
    }
    if (ammoSwitchingStatus.hidden === pending) {
      ammoSwitchingStatus.textContent = pending ? t('hud.ammo.switching') : '';
      ammoSwitchingStatus.hidden = !pending;
    }
    setTouchAmmoOpen(touchAmmoOpen);
    localSlot = slot;
  }

  // dim/sweep the active shell plate during reload (WoT ammo-plate feedback)
  function updateShellCooldown(reload: ReloadView | null | undefined, slot: number, pending = false): void {
    for (let i = 0; i < 3; i++) {
      if (i === slot && pending) {
        slotPresentations[i].setCooldown('100%');
      } else if (i === slot && reload && reload.totalS > 0 && reload.t > 0.001 && !reticleWeaponDry(lastShells?.[i])) {
        slotPresentations[i].setCooldown(`${((reload.t / reload.totalS) * 100).toFixed(1)}%`);
      } else {
        slotPresentations[i].setCooldown('0');
      }
    }
  }

  // ---------- world-space tank nameplates ----------
  const hpBarsSeen = new Set<HpBar>();
  /** The frame's bars in view, nearest first, and the boxes of those placed (updateHpBars: reused, never reallocated). */
  const hpBarOrder: HpBar[] = [];
  const hpBarPlaced = Array.from({ length: 96 }, () => ({ x0: 0, y0: 0, x1: 0, y1: 0 }));
  /** A hull bar's box until measured (.cot-hpb: the name and vehicle lines, the bar and the side's pointer; solo). */
  const HP_BAR_H = 52, HP_BAR_SOLO_H = 39, HP_BAR_SHORT_H = 36;
  /** Under this tall or this wide (the short height band, the phone width band) every bar keeps its name alone (.short):
   *  a portrait phone's 390 px held no two-line bar beside its panels (battle-hud-overlap's staged markers, 390x844). */
  const HP_BAR_VEHICLE_MIN_H = 520, HP_BAR_VEHICLE_MIN_W = 520;
  let hpBarsShort = false;
  /** Inside this range a plate stands further off its tank's top (plateLift) and a hull bar a size up (plateNear). */
  const PLATE_LIFT_RANGE_M = 320;
  /** A hull bar at point-blank range draws this much larger than one at the range's end (never on a short window). */
  const HP_BAR_NEAR_SCALE = 0.08;
  function shouldShowHpBar(tank: HudTank | null | undefined): tank is HudTank & {
    combat: CombatState;
  } {
    if (!tank || isSelf(tank) || !tank.combat || tank.combat.destroyed) return false;
    if (tank.id === aimTargetId) return false;
    // the proving ground: the lanes stand in a row down the sightline, so their plates would stack; the range card names
    // every hull and the laid one keeps its own target plate
    if (rangeActive) return false;
    return tank.team === ownSide() || isSpotted(tank.id);
  }

  function projectHpBarAnchor(tank: HudTank, camera: THREE.PerspectiveCamera): boolean {
    if (tank.visual?.turretTopWorld) {
      tank.visual.turretTopWorld(_tmp);
    } else if (tank.state?.pos) {
      _tmp.copy(tank.state.pos);
      _tmp.y += tank.spec?.dims?.heightM ?? 2.5;
    } else {
      return false;
    }
    project(camera, _tmp.x, _tmp.y, _tmp.z);
    return _sVisible && _sDist <= SPOT_RANGE_M + 60;
  }

  function createHpBar(tank: HudTank): HpBar {
    const ally = tank.team === ownSide();
    const rootEl = el('div', ally ? 'cot-hpb ally' : 'cot-hpb', hpLayer);
    // (hidden until placed: a bar the declutter holds back showed unplaced at the window's corner, gauntlet r15)
    rootEl.style.display = 'none';
    rootEl.innerHTML = `<div class="nm"><b class="nw"><i class="si"></i><span></span></b></div><div class="vh"></div>`
      + `<div class="tr"><div class="fl"></div></div>`;
    if (tank.spec) {
      maskIcon(
        requireElement<HTMLElement>(rootEl, '.si'),
        tank.spec.id,
        'side_silhouette',
        'currentColor',
      );
    }
    const bar: HpBar = {
      root: rootEl,
      ally,
      cs: requireElement<HTMLElement>(rootEl, '.nm span'),
      nm: requireElement<HTMLElement>(rootEl, '.vh'),
      fill: requireElement<HTMLElement>(rootEl, '.fl'),
      lastFrac: -1,
      lastCallsign: '',
      lastName: '',
      layoutW: 128,
      lastTransform: '',
      shown: false,
      measure: false,
      sx: 0,
      sy: 0,
      dist: 0,
      lift: 0,
      k: 1,
      seatDx: 0,
      seatDy: 0,
      slideWait: 0,
      lastPointerDx: 0,
      layoutH: HP_BAR_H,
      solo: false,
    };
    hpPool.set(tank.id, bar);
    return bar;
  }

  function updateHpBarLabel(bar: HpBar, tank: HudTank): void {
    const name = tank.spec?.name ?? tank.id;
    // (the callsign, the player's name or the lane's; a hull with none keeps its vehicle alone on the line)
    const callsign = plateNameFor(tank);
    const solo = callsign === name;
    if (bar.lastName === name && bar.lastCallsign === callsign) return;
    bar.cs.textContent = callsign;
    bar.nm.textContent = solo ? '' : name;
    bar.root.classList.toggle('solo', solo);
    bar.solo = solo;
    bar.lastCallsign = callsign;
    bar.lastName = name;
    // (measured shown: a hidden bar's name measures nothing, the target plate's own trap, r14)
    bar.measure = true;
    // (a hidden bar is placed at the height its lines will have: the two-line default kept a short window's one-line bars
    // out of every gap, so none ever showed to be measured, battle-hud-layout's phones; and a rest height 3 px over a
    // bar's own kept it out of 568x256's one gap, markers r20)
    if (bar.shown) measureHpBar(bar);
    else measureHiddenHpBar(bar);
  }

  /** A hidden bar measured laid out but unseen (a bar hidden with display measures nothing), so the seat it first takes
   *  is the one its lines fill; read with its copy or the window's band only, never per frame. */
  function measureHiddenHpBar(bar: HpBar): void {
    const style = bar.root.style;
    style.visibility = 'hidden';
    style.display = 'flex';
    measureHpBar(bar);
    style.display = 'none';
    style.visibility = '';
  }

  /** A bar's height before it is measured: one line on a short window or with no callsign, else two. */
  function hpBarRestH(bar: HpBar): number {
    return hpBarsShort ? HP_BAR_SHORT_H : bar.solo ? HP_BAR_SOLO_H : HP_BAR_H;
  }

  function measureHpBar(bar: HpBar): void {
    bar.measure = false;
    // the wider of its lines (the name with the silhouette's room on both sides, the name on the axis; the vehicle) and
    // their padding
    const vehicle = bar.solo || hpBarsShort ? 0 : Math.ceil(bar.nm.scrollWidth);
    const measured = hpBarsShort ? Math.ceil(bar.cs.scrollWidth) + 10
      : Math.max(Math.ceil(bar.cs.scrollWidth) + 2 * (22 + 4), vehicle) + 14;
    bar.layoutW = Math.max(128, Math.min(280, measured));
    bar.root.style.width = `${bar.layoutW}px`;
    // (its height as its lines compose it, the zh floor's taller, read with the widths)
    bar.layoutH = Math.ceil(bar.root.offsetHeight) || hpBarRestH(bar);
  }

  function positionHpBar(bar: HpBar): void {
    const plateX = bar.sx + bar.seatDx - bar.layoutW * 0.5;
    const plateY = bar.sy - bar.layoutH - bar.lift + bar.seatDy;
    // (its pointer back over the tank where a slide moved the bar along its row: in the bar's own px, before its scale)
    const pointerDx = bar.seatDx === 0 ? 0 : Math.round(-bar.seatDx / bar.k);
    if (pointerDx !== bar.lastPointerDx) {
      bar.root.style.setProperty('--hpb-anch-dx', `${pointerDx}px`);
      bar.lastPointerDx = pointerDx;
    }
    // (written only when it moves, to the tenth of a pixel; shown once; scaled about its foot, a near hull's a size up.
    // No fade with range: the side's colour stays its token, the plates critic found far names at 2.9:1)
    const transform = `translate3d(${plateX.toFixed(1)}px,${plateY.toFixed(1)}px,0) scale(${bar.k.toFixed(2)})`;
    if (transform !== bar.lastTransform) {
      bar.root.style.transform = transform;
      bar.lastTransform = transform;
    }
    if (!bar.shown) { bar.root.style.display = 'flex'; bar.shown = true; }
    if (bar.measure) measureHpBar(bar);
  }

  function updateHpBarFill(bar: HpBar, combat: CombatState): void {
    const fraction = Math.max(0, Math.min(1, combat.hp / combat.maxHp));
    if (Math.abs(fraction - bar.lastFrac) <= 0.001) return;
    bar.fill.style.transform = `scaleX(${fraction.toFixed(3)})`;
    bar.lastFrac = fraction;
  }

  function updateHpBars(frame: HudFrame): void {
    const camera = frame.camera;
    if (!camera) return;
    const seen = hpBarsSeen;
    seen.clear();
    const short = h < HP_BAR_VEHICLE_MIN_H || w < HP_BAR_VEHICLE_MIN_W;
    if (short !== hpBarsShort) {
      hpBarsShort = short;
      hpLayer.classList.toggle('short', short);
      for (const bar of hpPool.values()) {
        bar.measure = true;
        if (!bar.shown) measureHiddenHpBar(bar);
      }
    }
    const tanks = frame.tanks || [];
    const order = hpBarOrder;
    order.length = 0;
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!shouldShowHpBar(t) || !projectHpBarAnchor(t, camera)) continue;
      const bar = hpPool.get(t.id) ?? createHpBar(t);
      bar.sx = _sx; bar.sy = _sy; bar.dist = _sDist; bar.lift = plateLift(_sDist, 10, 2);
      bar.k = hpBarsShort ? 1 : 1 + HP_BAR_NEAR_SCALE * plateNear(_sDist);
      updateHpBarLabel(bar, t);
      updateHpBarFill(bar, t.combat);
      // (the enemy's first, then the nearest: where two would cross, the enemy's keeps its place; an insertion into the
      // frame's short list, no sort allocation)
      let at = order.length;
      order.push(bar);
      while (at > 0) {
        const ahead = order[at - 1];
        if (ahead.ally === bar.ally ? ahead.dist <= bar.dist : !ahead.ally) break;
        order[at] = ahead; at--;
      }
      order[at] = bar;
    }
    // Decluttered (gauntlet r15: the bars of tanks close in view struck through each other's labels, and a panel or the
    // target plate covered a bar under it): the enemies' first and the nearest first, a bar that would cross one shown,
    // the target plate, the HUD's furniture or the plates' obstacles (sightFurniture, measured each relayout) waits
    // hidden until it clears.
    hpBarRingOut = lastDrawnR + HP_BAR_RING_GAP;
    let count = 0;
    for (let i = 0; i < order.length; i++) {
      const bar = order[i];
      const half = bar.layoutW * bar.k * 0.5, y1 = bar.sy - bar.lift;
      const x0 = bar.sx - half, x1 = bar.sx + half, y0 = y1 - bar.layoutH * bar.k;
      if (count >= hpBarPlaced.length) break;
      // Its seat over its tank where clear, else the nearest clear one a slide finds (a short phone's panels took every
      // bar's seat at 568x256 and the window showed none: owner, at least one hull bar on every window, markers r20)
      const lastDx = bar.seatDx, lastDy = bar.seatDy;
      bar.seatDx = 0; bar.seatDy = 0;
      if (!hpBarClear(x0, y0, x1, y1, count)) {
        if (bar.slideWait > 0) { bar.slideWait--; continue; }
        if (!hpBarSlide(bar, x0, y0, x1, y1, count, lastDx, lastDy)) { bar.slideWait = HP_BAR_SLIDE_RETRY; continue; }
      }
      const box = hpBarPlaced[count++];
      box.x0 = x0 + bar.seatDx; box.y0 = y0 + bar.seatDy; box.x1 = x1 + bar.seatDx; box.y1 = y1 + bar.seatDy;
      seen.add(bar);
      positionHpBar(bar);
    }
    for (const bar of hpPool.values()) {
      if (!seen.has(bar) && bar.shown) { bar.root.style.display = 'none'; bar.shown = false; }
    }
  }

  /** The sight's ring as drawn and the gap a hull bar keeps off it, this frame's (updateHpBars). */
  let hpBarRingOut = 0;
  /** Whether a hull bar's box is clear: whole on the screen (a zh bar's end showed at the window's edge, the plates
   *  critic), HP_BAR_FURNITURE_GAP off the HUD's furniture and the plates' obstacles, HP_BAR_PLATE_GAP off the target
   *  plate, off the sight's ring as drawn (the reticle is painted, not laid out, and an ally's name crossed its dashes,
   *  r20) and off the `count` bars placed. */
  function hpBarClear(x0: number, y0: number, x1: number, y1: number, count: number): boolean {
    if (x0 < 0 || x1 > w || y0 < 0 || y1 > h || worldPlateGap(x0, y0, x1, y1) < HP_BAR_FURNITURE_GAP) return false;
    const g = HP_BAR_PLATE_GAP, plate = tgtShown ? tgtRect : null;
    if (plate && x0 < plate.cx + plate.hw + g && x1 > plate.cx - plate.hw - g && y0 < plate.bottom + g && y1 > plate.top - g) return false;
    const r = hpBarRingOut;
    if (x0 < lastCircleX + r && x1 > lastCircleX - r && y0 < lastCircleY + r && y1 > lastCircleY - r) return false;
    for (let k = 0; k < count; k++) {
      const other = hpBarPlaced[k];
      if (x0 < other.x1 && x1 > other.x0 && y0 < other.y1 && y1 > other.y0) return false;
    }
    return true;
  }

  /** The nearest clear seat for a hull bar whose own is not: along its row with its tank's x inside its span
   *  (TARGET_ANCHOR_INSET from either end, its pointer moved over the tank), up its column as far as its own height and
   *  down HP_BAR_SLIDE_DOWN; last frame's (`lastDx`, `lastDy`) while it holds, so a bar between two seats of a cost does
   *  not flap. Sets the bar's seatDx and seatDy and answers true where one is clear. */
  function hpBarSlide(bar: HpBar, x0: number, y0: number, x1: number, y1: number, count: number, lastDx: number, lastDy: number): boolean {
    const width = x1 - x0, height = y1 - y0;
    const lo = Math.max(0, bar.sx - width + TARGET_ANCHOR_INSET) - x0, hi = Math.min(w - width, bar.sx - TARGET_ANCHOR_INSET) - x0;
    if (lo > hi) return false;
    if ((lastDx !== 0 || lastDy !== 0) && lastDx >= lo && lastDx <= hi && lastDy >= -height && lastDy <= HP_BAR_SLIDE_DOWN
      && hpBarClear(x0 + lastDx, y0 + lastDy, x1 + lastDx, y1 + lastDy, count)) {
      bar.seatDx = lastDx; bar.seatDy = lastDy;
      return true;
    }
    let bestCost = Infinity;
    // (its rows on whole pixels: a zh bar fitted 568x256's gap under the plate to the pixel, and a seat at y 134.4 stepped
    // past it)
    const align = Math.round(y0) - y0;
    for (let dy = align - Math.ceil(height); dy <= HP_BAR_SLIDE_DOWN; dy += HP_BAR_SLIDE_STEP_Y) {
      // (along the row from its seat outward, both ways: the first clear seat each way is that way's nearest)
      for (let side = -1; side <= 1; side += 2) {
        for (let step = side < 0 ? 0 : 1; ; step++) {
          const dx = Math.max(lo, Math.min(hi, side * step * HP_BAR_SLIDE_STEP_X));
          const cost = Math.abs(dy) + Math.abs(dx) * 0.5;
          if (cost >= bestCost) break;
          if (hpBarClear(x0 + dx, y0 + dy, x1 + dx, y1 + dy, count)) {
            bestCost = cost; bar.seatDx = dx; bar.seatDy = dy;
            break;
          }
          if (dx === (side < 0 ? lo : hi)) break;
        }
      }
    }
    return bestCost < Infinity;
  }

  // ---------- over-target marker ----------
  // WoT core aiming-loop feedback: when the gun ray terminates on an enemy
  // vehicle, that tank carries a marker plate (nickname, tier + vehicle, HP
  // bar with numerals) and its ambient nameplate hides. Gate: the vehicle's
  // projected center sits inside the dispersion circle (or a 70px floor) AND
  // the aim distance lands on the hull — a tank far BEHIND the aim point
  // never lights up. Live battles additionally require the target to be
  // spotted; forced screenshot stills trust the recipe (vehicle is rendered).
  function isAimTargetCandidate(tank: HudTank | null | undefined): tank is HudTargetTank {
    if (!tank || isSelf(tank) || !tank.state || !tank.combat || tank.combat.destroyed) return false;
    if (tank.team === (playerRef?.team ?? 'player')) return false;
    return forcedStill || isSpotted(tank.id);
  }

  function findExactGunTarget(tanks: HudTank[]): HudTargetTank | null {
    const targetId = aimView.gunTargetId;
    if (forcedStill || targetId == null) return null;
    for (let i = 0; i < tanks.length; i++) {
      const tank = tanks[i];
      if (tank?.id === targetId && isAimTargetCandidate(tank)) return tank;
    }
    return null;
  }

  function findScreenAimTarget(
    tanks: HudTank[],
    camera: THREE.PerspectiveCamera,
  ): HudTargetTank | null {
    if (!forcedStill && aimView.gunTargetId != null) return null;
    const radius = Math.max(26, Math.min(smoothRadPx, Math.min(w, h) * 0.42));
    const gatePx = Math.max(radius * 1.15, 70);
    let best: HudTargetTank | null = null;
    let bestPx = Infinity;
    for (let i = 0; i < tanks.length; i++) {
      const tank = tanks[i];
      if (!isAimTargetCandidate(tank)) continue;
      const heightM = tank.spec?.dims?.heightM ?? 2.4;
      project(camera, tank.state.pos.x, tank.state.pos.y + heightM * 0.55, tank.state.pos.z);
      if (!_sVisible) continue;
      const radiusM = tank.spec?.armor?.boundingRadiusM ?? 6;
      if (Math.abs(_sDist - (aimView.distM ?? 0)) > radiusM + 16) continue;
      const distancePx = Math.hypot(_sx - aimView.cx, _sy - aimView.cy);
      if (distancePx >= gatePx || distancePx >= bestPx) continue;
      best = tank;
      bestPx = distancePx;
    }
    return best;
  }

  function selectAimTarget(): HudTargetTank | null {
    const camera = lastCamera;
    if (!camera || mode === 'hidden' || aimView.distM == null) return null;
    return findExactGunTarget(lastTanksRef || [])
      ?? findScreenAimTarget(lastTanksRef || [], camera);
  }

  function showTargetPlate(): void {
    if (tgtShown) return;
    tgtEl.style.display = 'block';
    tgtShown = true;
  }

  function hideTargetPlate(): void {
    aimTargetId = null;
    tgtLastRangeM = -2;
    if (tgtShown) {
      tgtEl.style.display = 'none';
      tgtShown = false;
    }
    tgtRect = null;
  }

  function projectTargetPlateAnchor(
    target: HudTargetTank,
    camera: THREE.PerspectiveCamera,
  ): boolean {
    if (target.visual?.turretTopWorld) {
      target.visual.turretTopWorld(_tmp);
    } else {
      _tmp.copy(target.state.pos);
      _tmp.y += target.spec?.dims?.heightM ?? 2.5;
    }
    project(camera, _tmp.x, _tmp.y, _tmp.z);
    return _sVisible;
  }

  /** The proving ground's name for a lane's hull ("Lane 2 · Target"), or null off the range or off its lanes. */
  function provingLaneLabel(targetId: string): string | null {
    const lanes = rangeActive ? rangeLanes : null;
    if (!lanes) return null;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].targetId !== targetId) continue;
      const lane = lanes[i].index + 1;
      if (lane !== laneNameNumber) { laneNameNumber = lane; laneName = t('hud.target.lane', { n: String(lane) }); }
      return laneName;
    }
    return null;
  }

  /** The name line every plate carries: a lane's name on the proving ground, else the callsign, else the vehicle. */
  function plateNameFor(tank: HudTank): string {
    return provingLaneLabel(tank.id) ?? (nickFor(tank) || tank.spec?.name || String(tank.id));
  }

  function updateTargetPlateCopy(target: HudTargetTank): void {
    const nickname = plateNameFor(target);
    const tier = target.spec ? tierNumeral(target.spec.id) : '–';
    const name = target.spec?.name ?? String(target.id);
    let copyChanged = false;
    if (tgtRefs.nick.textContent !== nickname) {
      tgtRefs.nick.textContent = nickname;
      copyChanged = true;
    }
    if (tgtRefs.tier.textContent !== tier) tgtRefs.tier.textContent = tier;
    if (tgtRefs.veh.textContent !== name) {
      tgtRefs.veh.textContent = name;
      copyChanged = true;
    }
    if (!copyChanged && !tgtMeasure) return;
    // (measured shown: a hidden plate's spans measure nothing, so it kept its floor and cut the callsign and the vehicle
    // at both ends on each new target; the gauntlet's markers frames)
    showTargetPlate();
    // the hull points at their widest (they only fall from full), under the bar
    const full = formatNumber(Math.round(target.combat.maxHp));
    tgtRefs.hp.textContent = `${full} / ${full}`;
    tgtLastHp = -1;
    measureTargetPlate();
  }

  /** The plate's size from the copy it shows: on a new copy, and when a resize steps its size (resize). */
  function measureTargetPlate(): void {
    tgtMeasure = false;
    // (measured whole: a plate sunk under a panel had left its vehicle line)
    if (tgtTight) { tgtEl.classList.remove(...TARGET_TIGHT_CLASSES); tgtTight = 0; }
    // the block is its widest line: the name line (the silhouette, its gap and the name, as laid out), the tier, vehicle
    // and range's reserve, or the points; the bar spans it, so it is never narrower than its floor
    // (the vehicle line's type size and its margin, read once here; a stub window has no computed style)
    const computed = typeof getComputedStyle === 'function';
    const meta = computed ? getComputedStyle(tgtRefs.mt) : null, points = computed ? getComputedStyle(tgtRefs.hp) : null;
    const metaFont = parseFloat(meta?.fontSize ?? '') || 12, metaMargin = parseFloat(meta?.marginTop ?? '') || 0;
    // (the name with the silhouette's room on both sides, the name on the axis)
    const nameWidth = Math.ceil(tgtRefs.nick.scrollWidth) + 2 * (Math.ceil(tgtRefs.cg.offsetWidth || 0) + 2);
    const metaWidth = Math.ceil(tgtRefs.mt.scrollWidth) + Math.ceil(metaFont * TARGET_RANGE_EM);
    tgtRangeChars = tgtRefs.rng.textContent?.length ?? 0;
    const textWidth = Math.max(Math.ceil(tgtRefs.nick.scrollWidth), metaWidth, Math.ceil(tgtRefs.hp.scrollWidth));
    tgtPlateWidth = Math.max(TARGET_PLATE_MIN_W, Math.min(440, Math.max(nameWidth, textWidth) + 8));
    tgtEl.style.width = `${tgtPlateWidth}px`;
    // (the bar the text block's width, never under the plate's floor less its silhouette's room)
    tgtRefs.tr.style.width = `${Math.min(tgtPlateWidth, Math.max(TARGET_PLATE_MIN_W - 40, textWidth + 8))}px`;
    // (its height as composed and the vehicle line's share, read with the widths on a new copy only, never per frame)
    tgtPlateHeight = Math.max(32, Math.ceil(tgtRefs.bk.offsetHeight) || TARGET_PLATE_H);
    tgtMetaHeight = Math.ceil((tgtRefs.mt.offsetHeight || 0) + metaMargin);
    tgtPointsHeight = Math.ceil((tgtRefs.hp.offsetHeight || 0) + (parseFloat(points?.marginTop ?? '') || 0));
    const bar = computed ? getComputedStyle(tgtRefs.tr) : null;
    tgtBarHeight = Math.ceil((tgtRefs.tr.offsetHeight || 0) + (parseFloat(bar?.marginTop ?? '') || 0));
    // (and each tight level's as laid out: the lines it sheds and, its name alone, the diamond's closer margin; the shares
    // summed had missed a zh plate's by 2 px, which 568x256's band over the ring did not have)
    tgtLevelHeight[0] = tgtPlateHeight;
    for (let level = 1; level <= TARGET_TIGHTEST; level++) {
      tgtEl.classList.add(TARGET_TIGHT_CLASSES[level - 1]);
      tgtLevelHeight[level] = Math.ceil(tgtRefs.bk.offsetHeight) || 0;
    }
    tgtEl.classList.remove(...TARGET_TIGHT_CLASSES);
  }

  /** The plate's height at a tight level: whole, without its vehicle line, without its points, the name alone (as laid
   *  out, else its lines' shares where none was: a stub window). */
  function targetPlateHeightAt(level: number): number {
    return tgtLevelHeight[level] || tgtPlateHeight - (level > 0 ? tgtMetaHeight : 0) - (level > 1 ? tgtPointsHeight : 0)
      - (level > 2 ? tgtBarHeight : 0);
  }

  /** How near a hull stands, 1 at point-blank range to 0 from PLATE_LIFT_RANGE_M out. */
  function plateNear(distM: number): number {
    return Math.max(0, Math.min(1, 1 - distM / PLATE_LIFT_RANGE_M));
  }

  /** How far a plate stands off the tank's top: further for a near hull, which fills more of the view. */
  function plateLift(distM: number, near: number, far: number): number {
    return Math.round(far + (near - far) * plateNear(distM));
  }

  function positionTargetPlate(): void {
    const halfWidth = tgtPlateWidth * 0.5;
    let plateH = tgtPlateHeight;
    const targetX = Math.max(halfWidth + 4, Math.min(w - halfWidth - 4, _sx));
    let x0 = targetX - halfWidth, x1 = targetX + halfWidth;
    // (the diamond's offset from the plate's centre, where a band seat slid the plate: it stays over the tank)
    let anchorDx = 0;
    let bottom = Math.max(plateH + 8, Math.min(h - 12, _sy - plateLift(_sDist, 20, 10)));
    // Over the tank where the HUD leaves it clear. Else sunk under what it met (a feed row, Watch's bar: the plates
    // critic, r20), whole or without its vehicle line, its diamond no lower than the tank's top; else hung under the sight's
    // ring, its diamond pointing up at the tank (a portrait phone's controls row and a landscape's ammunition card covered
    // its name, gauntlet r15).
    let below = false, tight = 0;
    if (worldPlateGap(x0, bottom - plateH, x1, bottom, true) < 0) {
      const top = worldPlateSink(x0, bottom - plateH, x1, bottom) + PLATE_SINK_GAP;
      // (its foot no lower than the tank's top, nor on the sight's ring where it stands over the sight)
      const ringR = clampRetR(smoothRadPx);
      const overSight = x0 < aimView.cx + ringR && x1 > aimView.cx - ringR && _sy <= aimView.cy;
      const floor = Math.min(h - 12, _sy + 4, overSight ? aimView.cy - ringR - PLATE_SINK_GAP : Infinity);
      const under = aimView.cy + ringR + 12 + plateH;
      // whole, without its vehicle line, then without its points too (the bar still tells the hull's share)
      let placed = false;
      for (let level = 0; level <= 2; level++) {
        if (level > 0 && tgtMetaHeight <= 0) break;
        const height = targetPlateHeightAt(level);
        if (top + height > floor || worldPlateGap(x0, top, x1, top + height, true) < 0) continue;
        plateH = height;
        bottom = top + height;
        tight = level;
        placed = true;
        break;
      }
      if (!placed && under <= h - 12 && worldPlateGap(x0, under - plateH, x1, under, true) >= 0) {
        bottom = under;
        below = true;
        placed = true;
      }
      // Else the nearest clear band in its column, whole or without its lines, down to its name alone (the smallest phones:
      // owner 2026-10-27, "always have names"), on the world rather than on a panel, off the ring as drawn (at 568x256 and
      // 320x568 none of the three seats was clear and the plate stood over the score and the systems row, markers r20)
      if (!placed) {
        const seat = targetPlateBand(x0, tgtPlateWidth, _sx, bottom, false) ?? targetPlateBand(x0, tgtPlateWidth, _sx, bottom, true);
        if (seat) {
          plateH = seat.height;
          bottom = seat.bottom;
          tight = seat.level;
          below = bottom - plateH > _sy;
          x0 = seat.x0;
          x1 = x0 + tgtPlateWidth;
          anchorDx = Math.round(_sx - (x0 + halfWidth));
        }
      }
    }
    tgtPendingBelow = below;
    tgtPendingTight = tight;
    tgtPendingAnchorDx = anchorDx;
    const transform = `translate3d(${x0.toFixed(1)}px,${(bottom - plateH).toFixed(1)}px,0)`;
    tgtPendingTransform = transform === tgtTransform ? null : transform;
    tgtRectScratch.cx = x0 + halfWidth; tgtRectScratch.hw = halfWidth; tgtRectScratch.top = bottom - plateH; tgtRectScratch.bottom = bottom;
    tgtRect = tgtRectScratch;
  }

  /** The target plate's band search (targetPlateBand): a band's blocked spans, and the seat it found. */
  const bandSpanX0 = new Float64Array(48), bandSpanX1 = new Float64Array(48);
  let bandSpans = 0;
  const bandSeat = { x0: 0, bottom: 0, height: 0, level: 0 };
  /** The rows of each span the band holds (bandOverlap, bandLeavesBar), and the margin every span keeps. */
  const bandSpanY0 = new Float64Array(48), bandSpanY1 = new Float64Array(48);
  const bandPad = 2;
  function blockBand(x0: number, x1: number, y0: number, y1: number, top: number, bottom: number): void {
    if (y0 < bottom + bandPad && y1 > top - bandPad && bandSpans < bandSpanX0.length) {
      // (2 px off each: a plate flush on a panel's edge read as touching it, the probe's sub-pixel boxes)
      bandSpanX0[bandSpans] = x0 - bandPad; bandSpanX1[bandSpans] = x1 + bandPad;
      bandSpanY0[bandSpans] = y0 - bandPad; bandSpanY1[bandSpans] = y1 + bandPad;
      bandSpans++;
    }
  }
  /** Whether a seat at `x0` in the band's rows `top` to `bottom` leaves a hull bar of the last pass a run beside it that
   *  its slide reaches (hpBarSlide: its tank's x inside the bar, its rows in reach of the band's): the runs either side
   *  go to the nearest span or the window's edge. */
  function bandLeavesBar(x0: number, width: number, top: number, bottom: number): boolean {
    let left = 0, right = w;
    for (let k = 0; k < bandSpans; k++) {
      if (bandSpanY0[k] >= bottom || bandSpanY1[k] <= top) continue;
      if (bandSpanX1[k] <= x0) left = Math.max(left, bandSpanX1[k]);
      else if (bandSpanX0[k] >= x0 + width) right = Math.min(right, bandSpanX0[k]);
    }
    const g = HP_BAR_PLATE_GAP;
    for (let i = 0; i < hpBarOrder.length; i++) {
      const bar = hpBarOrder[i], barW = bar.layoutW * bar.k, barH = bar.layoutH * bar.k;
      const foot = bar.sy - bar.lift;
      if (foot - 2 * barH > bottom || foot + HP_BAR_SLIDE_DOWN < top) continue;
      const lo = bar.sx - barW + TARGET_ANCHOR_INSET, hi = bar.sx - TARGET_ANCHOR_INSET;
      if (Math.max(lo, left) <= Math.min(hi, x0 - g - barW) || Math.max(lo, x0 + width + g) <= Math.min(hi, right - barW)) return true;
    }
    return false;
  }
  /** How much of the band's boxes a plate at `x0` would cover (0: it fits). */
  function bandOverlap(x0: number, width: number, top: number, bottom: number): number {
    let area = 0;
    for (let k = 0; k < bandSpans; k++) {
      const dx = Math.min(x0 + width, bandSpanX1[k]) - Math.max(x0, bandSpanX0[k]);
      const dy = Math.min(bottom, bandSpanY1[k]) - Math.max(top, bandSpanY0[k]);
      if (dx > 0 && dy > 0) area += dx * dy;
    }
    return area;
  }

  /** The clear band nearest the target plate's seat over the tank, the plate sliding along it with the tank's x inside
   *  its span (TARGET_ANCHOR_INSET from either end, its diamond moved over the tank): whole where one holds it, else
   *  without its vehicle line, its points, then its bar; never on the sight's ring as drawn. A seat that leaves no hull
   *  bar in view a run beside it costs TARGET_BAND_CROWD_COST (at 568x256 the plate stood mid-band, the runs either side
   *  too short for a bar, and the window showed none: markers r20). `onRing`: the second pass, the plate
   *  let stand TARGET_ON_RING_GAP off the ring as drawn, and where no band is clear even so, its name alone where it covers
   *  least. Null where the window leaves it no span, or where the first pass finds no clear band. */
  function targetPlateBand(x0: number, width: number, tankX: number, desired: number, onRing: boolean): typeof bandSeat | null {
    let bestCost = Infinity, leastArea = Infinity, leastCost = Infinity;
    let leastX0 = 0, leastBottom = 0, leastHeight = 0;
    const lo = Math.max(4, tankX - width + TARGET_ANCHOR_INSET), hi = Math.min(w - 4 - width, tankX - TARGET_ANCHOR_INSET);
    if (lo > hi) return null;
    // (the ring's box takes the spans' margin too: on the second pass, that margin comes off its radius)
    const ringR = onRing ? lastDrawnR + TARGET_ON_RING_GAP - bandPad : lastDrawnR + PLATE_SINK_GAP;
    for (let level = 0; level <= TARGET_TIGHTEST; level++) {
      if (level > 0 && tgtMetaHeight <= 0) break;
      const height = targetPlateHeightAt(level);
      for (let top = 8; top + height <= h - 12; top += TARGET_BAND_STEP) {
        const bottom = top + height;
        bandSpans = 0;
        for (let i = 0; i < sightFurniture.count; i++) {
          const box = sightFurniture.boxes[i];
          blockBand(box.x0, box.x1, box.y0, box.y1, top, bottom);
        }
        for (let i = 0; i < plateObstacles.count; i++) {
          if (plateObstacles.soft[i]) continue;
          const box = plateObstacles.boxes[i];
          blockBand(box.x0, box.x1, box.y0, box.y1, top, bottom);
        }
        blockBand(lastCircleX - ringR, lastCircleX + ringR, lastCircleY - ringR, lastCircleY + ringR, top, bottom);
        // the plate where it stands, else flush against either side of each span the band holds
        for (let k = -1; k < bandSpans; k++) {
          for (let side = 0; side < (k < 0 ? 1 : 2); side++) {
            const at = k < 0 ? Math.min(hi, Math.max(lo, x0)) : side ? bandSpanX1[k] : bandSpanX0[k] - width;
            if (at < lo || at > hi) continue;
            const covered = bandOverlap(at, width, top, bottom);
            const near = Math.abs(bottom - desired) + Math.abs(at - x0) * 0.5;
            if (covered > 0) {
              // (the name alone where it covers least, nearest its seat: the fallback where no band is clear)
              if (onRing && level === TARGET_TIGHTEST && (covered < leastArea || (covered === leastArea && near < leastCost))) {
                leastArea = covered; leastCost = near; leastX0 = at; leastBottom = bottom; leastHeight = height;
              }
              continue;
            }
            // (a tight plate by its tank before a whole one far from it: a line's worth of distance a level)
            let cost = near + level * TARGET_BAND_LEVEL_COST;
            if (cost >= bestCost) continue;
            if (hpBarOrder.length && !bandLeavesBar(at, width, top, bottom)) cost += TARGET_BAND_CROWD_COST;
            if (cost >= bestCost) continue;
            bestCost = cost;
            bandSeat.x0 = at; bandSeat.bottom = bottom; bandSeat.height = height; bandSeat.level = level;
          }
        }
      }
    }
    if (bestCost < Infinity) return bandSeat;
    if (leastArea === Infinity) return null;
    bandSeat.x0 = leastX0; bandSeat.bottom = leastBottom; bandSeat.height = leastHeight; bandSeat.level = TARGET_TIGHTEST;
    return bandSeat;
  }

  /** The range from the player's tank, in whole metres, written before the copy is measured (updateTargetPlate): a range
   *  grown past the room the plate keeps for it has the plate measured again. */
  function updateTargetPlateRange(target: HudTargetTank): void {
    const from = playerRef?.state?.pos;
    const to = target.state.pos;
    const rangeM = from ? Math.round(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)) : -1;
    if (rangeM === tgtLastRangeM) return;
    const copy = rangeM >= 0 ? t('hud.target.range', { m: String(rangeM) }) : '';
    tgtRefs.rng.textContent = copy;
    tgtLastRangeM = rangeM;
    if (copy.length > tgtRangeChars + 2) tgtMeasure = true;
  }

  function updateTargetPlateContent(target: HudTargetTank): void {
    const vehicleId = target.spec?.id ?? null;
    if (vehicleId && vehicleId !== tgtLastVehicleId) {
      maskIcon(tgtRefs.cg, vehicleId, 'side_silhouette', 'currentColor');
      tgtLastVehicleId = vehicleId;
    }
    const fraction = Math.max(0, Math.min(1, target.combat.hp / target.combat.maxHp));
    const hpWidth = `${(fraction * 100).toFixed(1)}%`;
    if (tgtRefs.fl.style.width !== hpWidth) tgtRefs.fl.style.width = hpWidth;
    // (the hull points as the HUD's hull readout writes them, "1,674 / 2,700": written when they change, the locale's
    // formatter never per frame)
    const hp = Math.max(0, Math.round(target.combat.hp)), maxHp = Math.round(target.combat.maxHp);
    if (hp !== tgtLastHp || maxHp !== tgtLastMaxHp) {
      tgtRefs.hp.textContent = `${formatNumber(hp)} / ${formatNumber(maxHp)}`;
      tgtLastHp = hp;
      tgtLastMaxHp = maxHp;
    }
    showTargetPlate();
    const bar = hpPool.get(target.id);
    if (bar?.shown) { bar.root.style.display = 'none'; bar.shown = false; }
  }

  /** The kill feed's rows the shown target plate crosses stand aside while it shows (sightFurniture.ts plateObstacles:
   *  the plates critic, r20, found the feed's rows on its name at 844x390); a class write only where one changes. */
  function yieldFeedRows(): void {
    const plate = tgtShown ? tgtRect : null;
    for (let i = 0; i < plateObstacles.count; i++) {
      const node = plateObstacles.soft[i] ? plateObstacles.nodes[i] as HTMLElement | null : null;
      if (!node?.classList) continue;
      const box = plateObstacles.boxes[i];
      const meets = !!plate && box.x0 < plate.cx + plate.hw + PLATE_SINK_GAP && box.x1 > plate.cx - plate.hw - PLATE_SINK_GAP
        && box.y0 < plate.bottom + PLATE_SINK_GAP && box.y1 > plate.top - PLATE_SINK_GAP;
      plateObstacles.yielded[i] = meets;
      if (node.classList.contains('yield') !== meets) node.classList.toggle('yield', meets);
    }
  }

  /** The target plate's move held by positionTargetPlate, written once the reticle canvas has drawn. */
  function flushTargetPlateMove(): void {
    yieldFeedRows();
    if (tgtPendingBelow !== tgtBelow) { tgtEl.classList.toggle('below', tgtPendingBelow); tgtBelow = tgtPendingBelow; }
    if (tgtPendingAnchorDx !== tgtAnchorDx) {
      if (tgtPendingAnchorDx) tgtEl.style.setProperty('--tgt-anch-dx', `${tgtPendingAnchorDx}px`);
      else tgtEl.style.removeProperty('--tgt-anch-dx');
      tgtAnchorDx = tgtPendingAnchorDx;
    }
    if (tgtPendingTight !== tgtTight) {
      tgtEl.classList.toggle('tight', tgtPendingTight > 0);
      tgtEl.classList.toggle('tighter', tgtPendingTight > 1);
      tgtEl.classList.toggle('tightest', tgtPendingTight > 2);
      tgtTight = tgtPendingTight;
    }
    if (tgtPendingTransform === null) return;
    tgtEl.style.transform = tgtPendingTransform;
    tgtTransform = tgtPendingTransform;
    tgtPendingTransform = null;
  }

  function updateTargetPlate(): void {
    const target = selectAimTarget();
    const camera = lastCamera;
    if (!target || !camera) {
      hideTargetPlate();
      return;
    }
    aimTargetId = target.id;
    // r5: anchor a FIXED 24px above the vehicle's screen-space top (turret
    // top) — the old +1.4 m world offset ballooned to ~140px of float at x8
    // sniper zoom, detaching the plate from its vehicle. The chevron in the
    // plate's own footer points down into that gap.
    if (!projectTargetPlateAnchor(target, camera)) {
      hideTargetPlate();
      return;
    }
    updateTargetPlateRange(target);
    updateTargetPlateCopy(target);
    positionTargetPlate();
    updateTargetPlateContent(target);
  }

  // ---------- minimap ----------
  // PERF: write-through scratch — worldToMap is called per blip/ping/vertex on
  // every 20 Hz repaint; every call site destructures immediately (verified),
  // so a shared 2-element array is safe and allocation-free.
  const _wm: [number, number] = [0, 0];
  function worldToMap(x: number, z: number): [number, number] {
    projectWorldToMinimap(x, z, mapWorldSize, MM, _wm);
    return _wm;
  }

  // r6 (hud_ui): REAL top-down capture of the battle scene as the minimap
  // underlay — WoT minimaps are stylized orthographic renders of the actual
  // map, and the hand-authored blob cartography read as painted dabs next to
  // it. One ortho render into an offscreen target at map load (main.ts passes
  // {renderer, scene, exclude} through buildMinimap); any failure falls back
  // to the procedural cartography below, so the harness can never go dark.
  function renderTopDownSnap(
    snap: HudMinimapSnapshot | null | undefined,
    N0: number,
  ): HTMLCanvasElement | null {
    return captureMinimapScene(snap?.requireTextured === true, () => {
      if (!snap || !snap.renderer || !snap.scene) return null;
      // r7: SUPERSAMPLE the one-time capture at 2x the display resolution —
      // the caller downsamples it, anti-aliasing tree crowns/road edges into
      // the higher-detail satellite look the flat 1x pass lacked.
      const N = N0 * 2;
      const { renderer, scene, exclude } = snap;
      if (snap.requireTextured && renderer.getContext().isContextLost()) {
        throw new Error('WebGL context is lost during minimap capture');
      }
      const half = mapWorldSize / 2;
      // A straight down-look with +Z as screen-up naturally puts world -X on
      // screen-right (Three.js's right-handed lookAt basis). Keep that native
      // handedness: it is also the battle camera's mouse-right direction.
      const cam = new THREE.OrthographicCamera(-half, half, half, -half, 10, 2400);
      cam.position.set(0, 900, 0);
      cam.up.set(0, 0, 1);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld(true);
      const buf = new Uint8Array(N * N * 4);
      const oldTarget = renderer.getRenderTarget();
      const oldFog = scene.fog;
      const rt = new THREE.WebGLRenderTarget(N, N, { depthBuffer: true });
      const hidden: THREE.Object3D[] = [];
      // 2026-10-14 (the Kestrel water re-bake): a passing cloud's shadow is
      // weather, not map — the volumetric layer's shade map (cloudShadeMap.ts,
      // its on switch in w) baked dark smears across the steppe, desert and
      // mine plates. Off for the capture, restored after.
      const cloudShade: THREE.Vector4 | undefined = scene.userData.cloudShadeUniforms?.uCotCloudShade?.value;
      const cloudShadeOn = cloudShade ? cloudShade.w : 0;
      try {
        rt.texture.colorSpace = THREE.SRGBColorSpace;
        scene.fog = null;
        if (cloudShade) cloudShade.w = 0;
        if (Array.isArray(exclude)) {
          for (const o of exclude) {
            if (o && o.visible !== false) { o.visible = false; hidden.push(o); }
          }
        }
        // auto-hide sky-scale shells (sky dome, cloud decks, horizon ring):
        // their infinite-deck shaders happily paint clouds/haze OVER the map
        // in a straight-down render (depth-independent transparents). Anything
        // whose world-space bounding radius rivals the whole map is scenery
        // shell, not map content.
        const _ws = new THREE.Vector3();
        scene.traverse((node) => {
          const o = node as SceneRenderable;
          if (!o.visible || (!o.isMesh && !o.isSprite)) return;
          const g = o.geometry;
          if (!g) return;
          if (!g.boundingSphere && g.computeBoundingSphere) g.computeBoundingSphere();
          const bs = g.boundingSphere;
          if (!bs || !isFinite(bs.radius)) return;
          o.getWorldScale(_ws);
          const rw = bs.radius * Math.max(Math.abs(_ws.x), Math.abs(_ws.y), Math.abs(_ws.z));
          if (rw > mapWorldSize * 0.9) { o.visible = false; hidden.push(o); }
        });
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf);
      } finally {
        renderer.setRenderTarget(oldTarget);
        scene.fog = oldFog;
        if (cloudShade) cloudShade.w = cloudShadeOn;
        for (const o of hidden) o.visible = true;
        rt.dispose();
      }
      const c = scratchCanvas(N, N);
      const x2 = requireCanvasContext(c);
      const img = x2.createImageData(N, N);
      // GL pixel rows come bottom-up, so undo only the vertical readback flip.
      // Preserve the down-look camera's horizontal basis and force opaque
      // alpha (background texels write alpha 0).
      const dd = img.data;
      for (let y = 0; y < N; y++) {
        const src = (N - 1 - y) * N * 4;
        const dst = y * N * 4;
        for (let x3 = 0; x3 < N; x3++) {
          const s = src + x3 * 4;
          const o = dst + x3 * 4;
          dd[o] = buf[s]; dd[o + 1] = buf[s + 1]; dd[o + 2] = buf[s + 2];
          dd[o + 3] = 255;
        }
      }
      x2.putImageData(img, 0, 0);
      return c;
    });
  }

  // MAP-CONFIG WIRING: per-map minimap palette (src/world/maps/*.js cfg.minimap)
  const MM_PALETTE_DEFAULT: HudMinimapPalette = {
    base: [70, 94, 52], hard: [104, 96, 78], soft: [48, 70, 54],
    forest: 'rgba(36,64,30,0.82)', forestStroke: 'rgba(22,40,18,0.9)',
    water: 'rgba(50,84,82,0.7)', waterStroke: 'rgba(28,48,48,0.8)',
    bog: 'rgba(90,80,50,0.7)', bogStroke: 'rgba(50,46,30,0.62)',
    ice: 'rgba(158,190,214,0.85)', iceStroke: 'rgba(104,134,158,0.9)',
    roadCasing: 'rgba(46,40,28,0.9)', roadFill: 'rgba(196,178,140,0.95)',
    buildingFill: '#ccd1d9',
  };
  /** The pale band just inside a liquid waterline (tactical map 2026-09-15); dry ground and ice never carry one. */
  const MINIMAP_WATERLINE_RIM = 'rgb(204,234,240)';

  // Mean luminance of a capture (32x32 downsample): snow, salt and sand maps
  // keep a gentler curve so their highlights survive the contrast lift.
  function captureLuminance(capture: HTMLCanvasElement): number {
    const probe = scratchCanvas(32, 32);
    const pctx = requireCanvasContext(probe);
    pctx.drawImage(capture, 0, 0, 32, 32);
    const data = pctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return sum / (32 * 32 * 255);
  }

  function paintCapturedMinimapUnderlay(
    context: CanvasRenderingContext2D,
    capture: HTMLCanvasElement,
    size: number,
  ): void {
    // tactical map 2026-09-15: a cartographic tone curve instead of the flat
    // brightness lift — deeper contrast and richer saturation on the vegetated
    // maps, a gentler curve where the ground is already bright.
    const bright = captureLuminance(capture) > 0.58;
    context.imageSmoothingQuality = 'high';
    context.filter = bright
      ? 'saturate(1.08) brightness(1.04) contrast(1.08)'
      : 'saturate(1.12) brightness(1.08) contrast(1.10)';
    context.drawImage(capture, 0, 0, size, size);
    context.filter = 'none';
  }

  // tactical map 2026-09-15: hillshade from the height field over the underlay
  // — light from the map's upper-left, shade on the slopes facing away — so
  // ridges, valleys and the settlement plateau read as relief instead of
  // texture noise. Alpha-encoded at a quarter of the map resolution (the
  // field is smooth at that pitch) and scaled up with smoothing.
  function paintMinimapRelief(
    context: CanvasRenderingContext2D,
    heightField: HudHeightField,
    size: number,
  ): void {
    const cells = Math.max(24, Math.round(size / 6));
    const relief = scratchCanvas(cells, cells);
    const rctx = requireCanvasContext(relief);
    const image = rctx.createImageData(cells, cells);
    const data = image.data;
    const half = mapWorldSize / 2;
    const step = mapWorldSize / cells;
    const reach = step * 2; // a wide stencil reads hills, not the texture-scale wrinkles
    const gain = 1.7 / (2 * reach); // slope per metre -> shade
    for (let row = 0; row < cells; row++) {
      const z = half - (row + 0.5) * step;
      for (let column = 0; column < cells; column++) {
        const x = half - (column + 0.5) * step;
        // map-right is world -x, map-up is world +z
        const dRight = heightField.getHeightAt(x - reach, z) - heightField.getHeightAt(x + reach, z);
        const dUp = heightField.getHeightAt(x, z + reach) - heightField.getHeightAt(x, z - reach);
        // sun in the upper-left: ground rising toward the lower-right is lit
        const lit = Math.max(-1, Math.min(1, (dRight - dUp) * gain));
        const o = (row * cells + column) * 4;
        const tone = lit > 0 ? 255 : 0;
        data[o] = tone; data[o + 1] = tone; data[o + 2] = tone;
        data[o + 3] = Math.round(Math.abs(lit) * (lit > 0 ? 48 : 80));
      }
    }
    rctx.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(relief, 0, 0, size, size);
  }

  function paintProceduralMinimapTerrain(
    context: CanvasRenderingContext2D,
    heightField: HudHeightField,
    palette: HudMinimapPalette,
    size: number,
  ): void {
    const image = context.createImageData(size, size);
    const data = image.data;
    const half = mapWorldSize / 2;
    const step = mapWorldSize / size;
    const range = Math.max(1e-3, heightField.maxY - heightField.minY);
    for (let row = 0; row < size; row++) {
      const z = half - (row + 0.5) * step;
      for (let column = 0; column < size; column++) {
        const x = half - (column + 0.5) * step;
        const height = heightField.getHeightAt(x, z);
        const deltaX = heightField.getHeightAt(x + step * 2, z)
          - heightField.getHeightAt(x - step * 2, z);
        const deltaZ = heightField.getHeightAt(x, z + step * 2)
          - heightField.getHeightAt(x, z - step * 2);
        let shade = Math.max(0.55, Math.min(1.2, 0.88 - deltaX * 0.05 + deltaZ * 0.05));
        shade = Math.round(shade * 5) / 5;
        const tone = Math.round(((height - heightField.minY) / range) * 5) / 5;
        const ground = heightField.getGroundType(x, z);
        const color = ground === 'hard'
          ? palette.hard
          : ground === 'soft' ? palette.soft : palette.base;
        const offset = (row * size + column) * 4;
        data[offset] = (color[0] + tone * 42) * shade;
        data[offset + 1] = (color[1] + tone * 42) * shade;
        data[offset + 2] = (color[2] + tone * 30) * shade;
        data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }

  /** One class of lake/marsh discs (water, bog or ice) filled to its shoreline contour in `fill`. */
  function fillMinimapPatches(
    context: CanvasRenderingContext2D,
    patches: MapDisc[] | undefined,
    fill: string,
  ): void {
    if (!patches?.length) return;
    context.fillStyle = fill;
    // One nonzero fill unions consistently wound lake lobes: overlapping
    // construction patches must not add dark seams or double their opacity.
    // The terrain shoreline supplies the bank detail without a diagram border.
    context.beginPath();
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      // Project every WORLD-space shoreline vertex through the same -X/right,
      // +Z/up basis as the terrain raster and tank markers. Offsetting a map
      // circle by +cos(angle) would mirror the asymmetric capes and coves.
      for (let vertex = 0; vertex < SHORELINE_SEGMENTS; vertex++) {
        const angle = vertex / SHORELINE_SEGMENTS * Math.PI * 2;
        const radius = shorelineRadiusAt(patch, angle);
        const point = worldToMap(patch.x + Math.cos(angle) * radius,
          patch.z + Math.sin(angle) * radius);
        if (vertex === 0) context.moveTo(point[0], point[1]);
        else context.lineTo(point[0], point[1]);
      }
      context.closePath();
    }
    context.fill();
  }

  function mixedForestFill(color: string): string {
    const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/
      .exec(color);
    if (!match) return color;
    const red = Math.round(+match[1] + (52 - +match[1]) * 0.35);
    const green = Math.round(+match[2] + (60 - +match[2]) * 0.35);
    const blue = Math.round(+match[3] + (48 - +match[3]) * 0.35);
    const alpha = match[4] != null ? +match[4] : 1;
    return `rgba(${red},${green},${blue},${(alpha * 0.8).toFixed(2)})`;
  }

  function buildForestPolygon(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    offsetX: number,
    offsetY: number,
    scale: number,
  ): void {
    context.beginPath();
    for (let i = 0; i < minimapForestX.length; i++) {
      const x = centerX + (minimapForestX[i] - centerX) * scale + offsetX;
      const y = centerY + (minimapForestY[i] - centerY) * scale + offsetY;
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
  }

  function paintForestCluster(
    context: CanvasRenderingContext2D,
    cluster: MapDisc,
    palette: HudMinimapPalette,
    captured: boolean,
    forestFill: string,
  ): void {
    const point = worldToMap(cluster.x, cluster.z);
    const centerX = point[0];
    const centerY = point[1];
    const seed = Math.abs(Math.sin(cluster.x * 12.9898 + cluster.z * 78.233) * 43758.5453);
    const seedUnit = seed - Math.floor(seed);
    const radius = Math.max(2.2, (cluster.r / mapWorldSize) * MM) * (0.82 + seedUnit * 0.4);
    for (let i = 0; i < minimapForestX.length; i++) {
      const angle = (i / minimapForestX.length) * Math.PI * 2;
      const jitteredRadius = radius * (0.62 + 0.46 * Math.abs(Math.sin(seed + i * 2.3))
        + 0.14 * Math.sin(seed * 3.1 + i * 5.7));
      minimapForestX[i] = centerX + Math.cos(angle) * jitteredRadius;
      minimapForestY[i] = centerY + Math.sin(angle) * jitteredRadius
        * (0.86 + 0.12 * Math.sin(seed * 1.7));
    }
    if (captured) context.filter = 'blur(0.5px)';
    buildForestPolygon(context, centerX, centerY, 0.8, 1.1, 1);
    context.fillStyle = captured ? 'rgba(8,14,7,0.18)' : 'rgba(8,14,7,0.28)';
    context.fill();
    buildForestPolygon(context, centerX, centerY, 0, 0, 1);
    context.globalAlpha = (0.68 + seedUnit * 0.24) * (captured ? 0.72 : 1);
    context.fillStyle = forestFill;
    context.fill();
    if (!captured) {
      context.globalAlpha = 0.42;
      context.strokeStyle = palette.forestStroke;
      context.lineWidth = 0.45;
      context.stroke();
    }
    context.globalAlpha = 1;
    buildForestPolygon(context, centerX, centerY, -0.5, -0.7, 0.55);
    context.fillStyle = `rgba(106,140,74,${captured ? 0.1 : 0.22})`;
    context.fill();
    if (captured) context.filter = 'none';
  }

  function paintMinimapForests(
    context: CanvasRenderingContext2D,
    clusters: MapDisc[] | undefined,
    palette: HudMinimapPalette,
    captured: boolean,
  ): void {
    if (!clusters) return;
    context.lineJoin = 'round';
    const forestFill = captured ? mixedForestFill(palette.forest) : palette.forest;
    for (let i = 0; i < clusters.length; i++) {
      paintForestCluster(context, clusters[i], palette, captured, forestFill);
    }
  }

  function paintMinimapRoadPass(
    context: CanvasRenderingContext2D,
    roads: Array<Array<readonly [number, number]>>,
    color: string,
    lineWidth: number,
  ): void {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
      const road = roads[roadIndex];
      context.beginPath();
      for (let pointIndex = 0; pointIndex < road.length; pointIndex++) {
        const point = worldToMap(road[pointIndex][0], road[pointIndex][1]);
        if (pointIndex === 0) context.moveTo(point[0], point[1]);
        else context.lineTo(point[0], point[1]);
      }
      context.stroke();
    }
  }

  function paintMinimapRoads(
    context: CanvasRenderingContext2D,
    roads: Array<Array<readonly [number, number]>> | undefined,
    palette: HudMinimapPalette,
  ): void {
    if (!roads) return;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    paintMinimapRoadPass(context, roads, palette.roadCasing, 3.8);
    paintMinimapRoadPass(context, roads, palette.roadFill, 2);
    context.lineCap = 'butt';
  }

  function darkBuildingFill(color: string): string {
    if (color[0] !== '#' || color.length !== 7) return 'rgb(56,50,42)';
    const value = parseInt(color.slice(1), 16);
    return `rgb(${(((value >> 16) & 255) * 0.32) | 0},`
      + `${(((value >> 8) & 255) * 0.32) | 0},${((value & 255) * 0.32) | 0})`;
  }

  function paintMinimapBuildings(
    context: CanvasRenderingContext2D,
    buildings: MapBuilding[] | undefined,
    palette: HudMinimapPalette,
  ): void {
    if (!buildings) return;
    const fill = darkBuildingFill(palette.buildingFill);
    context.strokeStyle = 'rgba(198,208,218,0.4)';
    context.lineWidth = 0.7;
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i];
      const point = worldToMap(building.x, building.z);
      const width = Math.max(4, ((building.w ?? 0) / mapWorldSize) * MM);
      const depth = Math.max(4, ((building.d ?? 0) / mapWorldSize) * MM);
      context.save();
      context.translate(point[0], point[1]);
      context.rotate(-(building.rot || building.yaw || 0));
      context.globalAlpha = 0.9;
      context.fillStyle = fill;
      context.fillRect(-width / 2, -depth / 2, width, depth);
      context.globalAlpha = 1;
      if (width * depth >= 26) context.strokeRect(-width / 2, -depth / 2, width, depth);
      context.restore();
    }
  }

  // tactical map 2026-09-15: water reads as water — a soft pale rim just inside
  // the shore and a dark keyline just outside it, following the UNION of the
  // lake and marsh patches (a river is a chain of overlapping discs; stroking
  // each disc drew a string of beads). Built from masks: A = the union fill,
  // B = A blurred; inside band = A minus B, outside band = B minus A.
  // 2026-10-14: the pale rim is the waterline, so only liquid water passes one
  // (`rim` null for bog, salt and ice discs: their keyline alone).
  function paintMinimapShorelines(
    context: CanvasRenderingContext2D,
    patches: MapDisc[] | undefined,
    keyline: string,
    rim: string | null,
  ): void {
    if (!patches?.length) return;
    const [union, uctx] = minimapLayer(context);
    uctx.setTransform(context.getTransform());
    uctx.beginPath();
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      for (let vertex = 0; vertex < SHORELINE_SEGMENTS; vertex++) {
        const angle = vertex / SHORELINE_SEGMENTS * Math.PI * 2;
        const radius = shorelineRadiusAt(patch, angle);
        const point = worldToMap(patch.x + Math.cos(angle) * radius,
          patch.z + Math.sin(angle) * radius);
        if (vertex === 0) uctx.moveTo(point[0], point[1]);
        else uctx.lineTo(point[0], point[1]);
      }
      uctx.closePath();
    }
    uctx.fillStyle = '#fff';
    uctx.fill();
    paintMinimapShoreBands(context, union, keyline, rim);
  }

  /** A blank layer at the target canvas's device resolution (identity transform). */
  function minimapLayer(context: CanvasRenderingContext2D): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const canvas = scratchCanvas(context.canvas.width, context.canvas.height);
    return [canvas, requireCanvasContext(canvas)];
  }

  /** The keyline outside a white union mask and, for liquid water, the pale waterline rim inside it. */
  function paintMinimapShoreBands(
    context: CanvasRenderingContext2D,
    union: HTMLCanvasElement,
    keyline: string,
    rim: string | null,
  ): void {
    const width = context.canvas.width;
    const height = context.canvas.height;
    const scale = Math.max(1, Math.abs(context.getTransform().a) || 1);
    const [blurred, bctx] = minimapLayer(context);
    bctx.filter = `blur(${(1.9 * scale).toFixed(2)}px)`;
    bctx.drawImage(union, 0, 0);
    bctx.filter = 'none';
    const band = (base: HTMLCanvasElement, subtract: HTMLCanvasElement, tint: string): HTMLCanvasElement => {
      const [canvas, ctx] = minimapLayer(context);
      ctx.drawImage(base, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(subtract, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, width, height);
      return canvas;
    };
    const rimBand = rim ? band(union, blurred, rim) : null;
    const keylineBand = band(blurred, union, keyline);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (rimBand) {
      context.globalAlpha = 0.55;
      context.drawImage(rimBand, 0, 0);
    }
    context.globalAlpha = 0.9;
    context.drawImage(keylineBand, 0, 0);
    context.restore();
  }

  /**
   * The world's visible-water raster (world/visibleWater.ts) as a white mask at the target's device resolution: one
   * texel a cell, opaque where the world shows water, laid through the same -X/right, +Z/up basis as the terrain
   * underlay, the discs and the tank markers (the texel axes are worldToMap's, so no mirror can creep in), filtered
   * down to the plate (a 2 m cell is finer than its 2.3 m pixel: the edge comes out anti-aliased).
   */
  function visibleWaterMask(context: CanvasRenderingContext2D, raster: HudVisibleWater): HTMLCanvasElement | null {
    const cells = raster.cells;
    if (!(cells > 0) || raster.water.length !== cells * cells) return null;
    const texels = scratchCanvas(cells, cells);
    const tctx = requireCanvasContext(texels);
    const image = tctx.createImageData(cells, cells);
    const data = image.data;
    let any = false;
    for (let k = 0; k < raster.water.length; k++) {
      if (!raster.water[k]) continue;
      const o = k * 4;
      data[o] = 255; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = 255;
      any = true;
    }
    if (!any) return null;
    tctx.putImageData(image, 0, 0);
    const x0 = -raster.size / 2, z0 = -raster.size / 2;
    const [ox, oy] = worldToMap(x0, z0);
    const [ix, iy] = worldToMap(x0 + raster.cellM, z0);
    const [jx, jy] = worldToMap(x0, z0 + raster.cellM);
    const [mask, mctx] = minimapLayer(context);
    mctx.setTransform(context.getTransform());
    mctx.transform(ix - ox, iy - oy, jx - ox, jy - oy, ox, oy);
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(texels, 0, 0);
    return mask;
  }

  /** The water a player can see: the raster's cells in the water fill, its keyline and the pale waterline rim. */
  function paintVisibleWater(
    context: CanvasRenderingContext2D,
    raster: HudVisibleWater,
    palette: HudMinimapPalette,
  ): void {
    const mask = visibleWaterMask(context, raster);
    if (!mask) return;
    const [fill, fctx] = minimapLayer(context);
    fctx.drawImage(mask, 0, 0);
    fctx.globalCompositeOperation = 'source-in';
    fctx.fillStyle = palette.water;
    fctx.fillRect(0, 0, fill.width, fill.height);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(fill, 0, 0);
    context.restore();
    paintMinimapShoreBands(context, mask, palette.waterStroke, MINIMAP_WATERLINE_RIM);
  }

  // 2026-10-14 (owner, Kestrel: "a bunch of water spots by spawn even though
  // you can't actually see any water"): water only where the world draws a
  // liquid sheet. The dry discs go first — a bog, salt pan or takyr flat in
  // the map's ground tones, ice on an iceLake map — with a keyline and no
  // waterline rim, so they still mark the slow ground; water paints over them.
  // 2026-10-15 (phase 2): the water itself is the world's visible-water raster
  // where the world hands one over — the water sheet's own cells: no waterline
  // wider than the water, no wet causeway, and the canals outside every disc.
  // The liquid discs' contours remain the fallback for a world without one.
  function paintMinimapWaterLayers(
    context: CanvasRenderingContext2D,
    features: HudMinimapFeatures,
    palette: HudMinimapPalette,
  ): void {
    const frozen = !!features.iceLake;
    fillMinimapPatches(context, features.softPatches, frozen ? palette.ice : palette.bog);
    paintMinimapShorelines(context, features.softPatches, frozen ? palette.iceStroke : palette.bogStroke, null);
    if (features.visibleWater) {
      paintVisibleWater(context, features.visibleWater, palette);
      return;
    }
    fillMinimapPatches(context, features.liquidPatches, palette.water);
    paintMinimapShorelines(context, features.liquidPatches, palette.waterStroke, MINIMAP_WATERLINE_RIM);
  }

  function buildMinimapBg(
    heightField: HudHeightField,
    features?: HudMinimapFeatures | null,
    palette?: Partial<HudMinimapPalette> | null,
    snap?: HudMinimapSnapshot | null,
  ): void {
    const pal = { ...MM_PALETTE_DEFAULT, ...(palette || {}) };
    heightFieldRef = heightField;
    mapWorldSize = heightField && heightField.size ? heightField.size : 1024;
    const N = MM * MM_BAKE_RATIO;
    // r6: preferred underlay is the one-time ortho capture of the REAL scene
    // (terrain, forests, roads, buildings as actually rendered); the sampled
    // procedural cartography below survives as the no-renderer fallback.
    const snapBg = snap ? renderTopDownSnap(snap, N) : null;
    // Fallback path only: terrain underlay sampled at full device resolution
    // and POSTERIZED into flat tone bands (cartography, not a blurred photo).
    // With a snap the real capture is the underlay, and the vector feature
    // overlays below still draw on top — the tree billboards are edge-on
    // (invisible) in a straight-down render, so the forest polygons carry
    // canopy just like WoT's stylized aerial tiles.
    const bg = scratchCanvas(N, N);
    const bctx = requireCanvasContext(bg);
    if (snapBg) paintCapturedMinimapUnderlay(bctx, snapBg, N);
    else paintProceduralMinimapTerrain(bctx, heightField, pal, N);
    paintMinimapRelief(bctx, heightField, N);

    // compose feature layers at device resolution (vector coords in CSS px)
    const out = scratchCanvas(N, N);
    const octx = requireCanvasContext(out);
    octx.drawImage(bg, 0, 0); // 1:1 texels — no resampling blur
    octx.setTransform(MM_BAKE_RATIO, 0, 0, MM_BAKE_RATIO, 0, 0);

    const f = features || {};
    paintMinimapWaterLayers(octx, f, pal);
    // tree clusters: irregular forest polygons — r7 SATELLITE READ, r4
    // DE-STICKER pass: the repeated dark-outlined octagons read as clipart
    // dabs. Each stand is now a 12-vertex lumpy polygon whose per-vertex
    // jitter, overall size and fill alpha all derive from the cluster's
    // actual scatter position, the heavy keyline drops to a faint half-alpha
    // hairline, and the shadow/crown offsets shrink so the stands melt into
    // the painted underlay like WoT's aerial tiles.
    paintMinimapForests(octx, f.treeClusters, pal, !!snapBg);
    // roads: dark casing pass + solid tan ribbon pass — r7: wider casing so
    // every road carries a visible dark edge line (satellite read) instead
    // of a pale unbordered ribbon
    paintMinimapRoads(octx, f.roads, pal);
    // buildings: DARK footprints with a faint light keyline (r8 — WoT draws
    // structures dark on its aerial tiles; the pale chips scattered through
    // villages read as unexplained white unit markers at a glance). The
    // per-map palette fill is darkened to ~1/3 so each biome keeps its hue
    // (adobe stays warm, town blocks stay grey). Small structures get a 4px
    // floor so clusters merge into readable blocks.
    paintMinimapBuildings(octx, f.buildings, pal);
    mmBg = out;
    mmCaptureReceipt = { source: snapBg ? 'scene' : 'procedural',
      generation: mmBuildGeneration, width: out.width, height: out.height };
  }

  function preloadMinimapAsset(src: string): Promise<HTMLImageElement> {
    if (!src) return Promise.reject(new Error('Missing minimap asset URL'));
    let pending = minimapAssetCache.get(src);
    if (pending) return pending;
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load minimap asset: ${src}`));
      image.src = src;
      if (typeof image.decode === 'function') {
        image.decode().then(() => resolve(image), () => { /* onload/onerror owns fallback */ });
      }
    }).catch((error) => {
      if (minimapAssetCache.get(src) === pending) minimapAssetCache.delete(src);
      throw error;
    });
    minimapAssetCache.set(src, pending);
    return pending;
  }

  async function installMinimapAsset(
    heightField: HudHeightField,
    src: string,
    generation: number,
  ): Promise<boolean> {
    const image = await preloadMinimapAsset(src);
    if (generation !== mmBuildGeneration) return false;
    heightFieldRef = heightField;
    mapWorldSize = heightField && heightField.size ? heightField.size : 1024;
    if (generation !== mmBuildGeneration) return false;
    // Draw the decoded asset directly. A second offscreen canvas duplicates
    // the pixels and can be silently purged by iPadOS Safari under WebGL
    // pressure; the retained Image remains re-decodable by the browser.
    mmCaptureReceipt = { source: 'asset', generation,
      width: image.naturalWidth, height: image.naturalHeight };
    mmBg = image;
    drawMinimapBackground();
    mmDirty = true;
    return true;
  }

  // Shared minimap chrome: 10x10 grid, coordinate strips, inner vignette —
  // drawn over BOTH underlay styles (ortho capture and procedural fallback).
  let mmVignette: CanvasGradient | null = null;
  function minimapVignette(octx: CanvasRenderingContext2D): CanvasGradient {
    if (mmVignette) return mmVignette;
    const gradient = octx.createRadialGradient(MM / 2, MM / 2, MM * 0.44, MM / 2, MM / 2, MM * 0.76);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.32)');
    mmVignette = gradient;
    return gradient;
  }

  function drawMinimapChrome(octx: CanvasRenderingContext2D): void {
    // grid 10x10 — tactical map 2026-09-15: a light hairline over a dark one,
    // so the grid reads on snow and in dark forest alike
    octx.lineWidth = 1;
    octx.strokeStyle = 'rgba(0,0,0,0.20)';
    octx.beginPath();
    for (let i = 1; i < 10; i++) {
      octx.moveTo(i * MM / 10 + 1, 0); octx.lineTo(i * MM / 10 + 1, MM);
      octx.moveTo(0, i * MM / 10 + 1); octx.lineTo(MM, i * MM / 10 + 1);
    }
    octx.stroke();
    octx.strokeStyle = 'rgba(236,244,252,0.17)';
    octx.lineWidth = 0.7;
    octx.beginPath();
    for (let i = 1; i < 10; i++) {
      octx.moveTo(i * MM / 10 + 0.5, 0); octx.lineTo(i * MM / 10 + 0.5, MM);
      octx.moveTo(0, i * MM / 10 + 0.5); octx.lineTo(MM, i * MM / 10 + 0.5);
    }
    octx.stroke();
    // (the grid's coordinates are the plate's, in its gutter: .cot-mm-gx/.cot-mm-gy)
    octx.textAlign = 'left';
    octx.textBaseline = 'alphabetic';
    // corner vignette (cached gradient): the plate darkens toward the frame
    octx.fillStyle = minimapVignette(octx);
    octx.fillRect(0, 0, MM, MM);
    // inner frame: dark keyline under a chalk hairline
    octx.strokeStyle = 'rgba(0,0,0,0.55)';
    octx.lineWidth = 2;
    octx.strokeRect(1, 1, MM - 2, MM - 2);
    octx.strokeStyle = 'rgba(226,236,246,0.24)';
    octx.lineWidth = 1;
    octx.strokeRect(0.5, 0.5, MM - 1, MM - 1);
  }

  // The chrome never changes, so it renders once into its own layer at the
  // plate's device size and each paint copies it 1:1 (two grid strokes, the
  // full-plate vignette and two keylines become one drawImage). The layer
  // re-renders every MM_CHROME_REFRESH paints, whenever its context reads
  // lost and whenever the plate's store changes size (uiCanvas: a size step, a
  // layout, a DPR flip), so a backing store a browser purged under memory
  // pressure (iPadOS Safari, a lost GPU context) heals within seconds; the
  // raster itself stays the decoded image (above). No layer context: the
  // chrome draws direct.
  const MM_CHROME_REFRESH = 120;
  let mmChrome: HTMLCanvasElement | null = null;
  let mmChromeCtx: CanvasRenderingContext2D | null = null;
  let mmChromePaints = MM_CHROME_REFRESH;
  function minimapChromeLayer(): HTMLCanvasElement | null {
    const store = mmSurface.canvas;
    if (!mmChrome) {
      mmChrome = scratchCanvas(store.width, store.height);
      mmChromeCtx = mmChrome.getContext('2d');
    }
    const lctx = mmChromeCtx;
    if (!lctx) return null;
    const resized = mmChrome.width !== store.width || mmChrome.height !== store.height;
    if (resized) { mmChrome.width = store.width; mmChrome.height = store.height; }
    if (resized || ++mmChromePaints > MM_CHROME_REFRESH || lctx.isContextLost?.()) {
      mmChromePaints = 1;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, mmChrome.width, mmChrome.height);
      lctx.setTransform(store.width / MM, 0, 0, store.height / MM, 0, 0);
      drawMinimapChrome(lctx);
    }
    return mmChrome;
  }

  /** The plate's underlay and chrome; false (nothing drawn) while the plate is hidden. */
  function drawMinimapBackground(): boolean {
    if (!mmSurface.begin()) return false;
    mmCtx.fillStyle = '#0b100e';
    mmCtx.fillRect(0, 0, MM, MM);
    if (mmBg) {
      // The battlefield raster is a fixed north-up survey. Keep it in the
      // exact coordinate system used by worldToMap; only tank arrows and the
      // camera cone rotate as the player looks around.
      mmCtx.drawImage(mmBg, 0, 0, MM, MM);
    }
    const chrome = minimapChromeLayer();
    if (!chrome) { drawMinimapChrome(mmCtx); return true; }
    mmCtx.setTransform(1, 0, 0, 1, 0, 0);
    mmCtx.drawImage(chrome, 0, 0);
    mmSurface.begin(); // back to the map's 220-unit transform
    return true;
  }

  // Team spawn flags (mode objective markers for annihilation): captured from
  // the rosters' first battle frame, when every tank still sits on its spawn.
  function captureSpawnFlags(frame: HudFrame): void {
    const tanks = frame.tanks || [];
    let ax = 0, az = 0, an = 0, ex = 0, ez = 0, en = 0;
    for (const t of tanks) {
      if (!t || !t.state) continue;
      if (t.team === ownSide() || t.isPlayer) { ax += t.state.pos.x; az += t.state.pos.z; an++; }
      else { ex += t.state.pos.x; ez += t.state.pos.z; en++; }
    }
    if (!an || !en) return;
    // r4: each base carries a team-tinted cap fill so BOTH bases read on the
    // map (the old white 7% fill made the own-base marker invisible under
    // the ally blip cluster at spawn — the map read one-sided). The tints are
    // the team inks every blip and objective glyph shares (brand-ui H1).
    spawnFlags = [
      { x: ax / an, z: az / an, color: sideColor('own'), fill: sideFill('own'), side: 'own' },
      { x: ex / en, z: ez / en, color: sideColor('enemy'), fill: sideFill('enemy'), side: 'enemy' },
    ];
  }

  // minimap blip: WoT's vanilla marker language is ARROWS — a directional
  // vehicle arrow (nose forward, swept tail notch) rotated to hull heading.
  // Player = larger white arrow, allies and enemies in their team inks (r3: tinted
  // top-down silhouettes at 15 px read as directionless discs).
  function drawArrowBlip(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    yaw: number,
    fill: string,
    s: number,
    alpha: number,
  ): void {
    c.save();
    c.translate(x, y);
    c.rotate(minimapYawForHeading(yaw));
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(0, -s);                       // nose
    c.lineTo(s * 0.74, s * 0.9);           // right tail
    c.lineTo(0, s * 0.42);                 // tail notch
    c.lineTo(-s * 0.74, s * 0.9);          // left tail
    c.closePath();
    c.fillStyle = fill;
    // r7-2 (round critique: "ally arrows merge with the own-base ring into
    // one green blob at spawn"): heavier near-black keyline so each arrow
    // keeps its own edge even when parked on the green base ring.
    c.strokeStyle = 'rgba(4,8,6,0.95)';
    c.lineWidth = 1.4;
    c.lineJoin = 'round';
    c.fill();
    c.stroke();
    c.restore();
  }

  // Owner rule (2026-09-25): blips sit exactly on their projected world
  // position and MAY overlap — the per-id jitter and the pairwise separation
  // pass that used to keep co-located markers apart made them wiggle around
  // each other; each arrow keeps its own heading instead.
  // PERF r3: minimap blip record pool (see drawMinimap)
  const _liveBlipPool: MinimapBlip[] = [];
  let _liveBlipCount = 0;
  function pushLiveBlip(
    x: number,
    y: number,
    yaw: number,
    fill: string,
    s: number,
    a: number,
    fixed: boolean,
  ): void {
    let b = _liveBlipPool[_liveBlipCount];
    if (!b) { b = { x: 0, y: 0, yaw: 0, fill: '', s: 0, a: 0, fixed: false }; _liveBlipPool[_liveBlipCount] = b; }
    b.x = x; b.y = y; b.yaw = yaw; b.fill = fill; b.s = s; b.a = a; b.fixed = fixed;
    _liveBlipCount++;
  }

  // Last-known contacts keep the vehicle's last observed heading. A hollow,
  // muted arrow distinguishes stale intelligence from a live filled arrow.
  function drawGhostMarker(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    yaw: number,
  ): void {
    c.save();
    c.translate(x, y);
    c.rotate(minimapYawForHeading(yaw));
    const s = 5.5;
    c.globalAlpha = 0.7;
    c.beginPath();
    c.moveTo(0, -s);
    c.lineTo(s * 0.74, s * 0.9);
    c.lineTo(0, s * 0.42);
    c.lineTo(-s * 0.74, s * 0.9);
    c.closePath();
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(8,12,16,0.9)';
    c.lineWidth = 3;
    c.stroke();
    c.strokeStyle = '#e5a19b';
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }

  function drawMinimapBases(playerMapX: number, playerMapY: number): void {
    if (!spawnFlags) return;
    for (let i = 0; i < spawnFlags.length; i++) {
      const flag = spawnFlags[i];
      const point = worldToMap(flag.x, flag.z);
      const x = point[0];
      const y = point[1];
      const dimmed = Math.hypot(x - playerMapX, y - playerMapY) < 15;
      mmCtx.save();
      if (dimmed) mmCtx.globalAlpha = 0.55;
      // The same tank-and-return glyph marks spawns on the map and in world, the enemy's on its diamond (a side is shape
      // and colour, never colour alone: INTERACTION-REDESIGN bar line 6).
      drawSpawnGlyph(mmCtx, x, y, 10, flag.color, flag.fill || 'rgba(240,246,252,0.07)', flag.side);
      mmCtx.restore();
    }
  }

  // tactical map 2026-09-15: mode objectives on the map from the shared marker
  // derivation (ui/minimapObjectives.ts) in the shared glyph language — spawns,
  // flag bases and flags, lettered capture zones with control arcs, numbered
  // Frontline sectors (taken / active / locked), Turbo goals and ball, horde
  // caches. Pulses breathe on the frame clock; a marker under the player arrow
  // fades like the bases do.
  /** (UI-LOCKDOWN A) a map glyph's letter: DOM over the plate, its 220 units scaled to the plate's box. */
  const mapLetter: GlyphLetter = { x: 0, y: 0, px: 0, color: '', halo: 0 };
  const mapLetterStyle: CanvasTextStyle = {
    font: '', color: '', align: 'center', baseline: 'middle', alpha: 1, haloWidth: 0, halo: OBJECTIVE_PALETTE.keyline,
  };
  const mapLetterFonts = new Map<number, string>();
  let mmLetterSlot = 0;
  function placeMapLetter(label: string | undefined, letter: GlyphLetter, fontUnits: number): void {
    if (!label) return;
    const k = mmSurface.width / MM;
    const px = Math.round(fontUnits * k * 10) / 10;
    let font = mapLetterFonts.get(px);
    if (!font) { font = `700 ${px}px ${FONT_COND}`; mapLetterFonts.set(px, font); }
    mapLetterStyle.font = font;
    mapLetterStyle.color = letter.color;
    mapLetterStyle.alpha = mmCtx.globalAlpha;
    mapLetterStyle.haloWidth = letter.halo * k;
    mmLetters.place(mmLetterSlot++, label, letter.x * k, letter.y * k, mapLetterStyle);
  }

  function drawMinimapObjectives(
    markers: readonly ObjectiveMarker[],
    timeS: number,
    playerMapX: number,
    playerMapY: number,
    playerDown: boolean,
  ): void {
    const breath = 0.5 + 0.5 * Math.sin(timeS * 5.2);
    for (const marker of markers) {
      const point = worldToMap(marker.x, marker.z);
      const inset = marker.kind === 'spawn' ? 11 : 7;
      const x = Math.max(inset, Math.min(MM - inset, point[0]));
      const y = Math.max(inset, Math.min(MM - inset, point[1]));
      const color = sideColor(marker.side);
      const fill = sideFill(marker.side);
      const nearPlayer = Math.hypot(x - playerMapX, y - playerMapY) < 14;
      const halo = (radius: number, strength: number): void => {
        mmCtx.beginPath();
        mmCtx.arc(x, y, radius + breath * 3.5, 0, Math.PI * 2);
        mmCtx.lineWidth = 2;
        mmCtx.strokeStyle = color;
        mmCtx.globalAlpha = strength * (1 - breath);
        mmCtx.stroke();
        mmCtx.globalAlpha = 1;
      };
      mmCtx.save();
      switch (marker.kind) {
        case 'spawn': {
          const reviving = marker.status === 'respawn' && marker.side === 'own' && playerDown;
          if (nearPlayer && !reviving) mmCtx.globalAlpha = 0.6;
          if (reviving) halo(12, 0.6);
          drawSpawnGlyph(mmCtx, x, y, 8.5, color, fill, marker.side === 'enemy' ? 'enemy' : 'own');
          break;
        }
        case 'flagBase': {
          if (nearPlayer) mmCtx.globalAlpha = 0.7;
          mmCtx.beginPath();
          mmCtx.arc(x, y, 10, 0, Math.PI * 2);
          mmCtx.fillStyle = fill;
          mmCtx.fill();
          mmCtx.lineWidth = 3.6;
          mmCtx.strokeStyle = OBJECTIVE_PALETTE.keyline;
          mmCtx.stroke();
          if (marker.status === 'away') mmCtx.setLineDash([4, 3]);
          mmCtx.lineWidth = 2;
          mmCtx.strokeStyle = color;
          mmCtx.stroke();
          mmCtx.setLineDash([]);
          break;
        }
        case 'flag': {
          if (marker.pulse) halo(8, 0.55);
          if (marker.status === 'dropped') {
            mmCtx.setLineDash([2.5, 2.5]);
            mmCtx.lineWidth = 1.2;
            mmCtx.strokeStyle = color;
            mmCtx.beginPath();
            mmCtx.arc(x, y, 7.5, 0, Math.PI * 2);
            mmCtx.stroke();
            mmCtx.setLineDash([]);
          }
          drawPennant(mmCtx, x, y + 4, 15, color);
          break;
        }
        case 'zone':
        case 'sector': {
          const locked = marker.status === 'locked';
          const taken = marker.status === 'taken';
          // zones can sit ~100 m apart (22 px here): keep the badges from overlapping
          const r = taken ? 7.5 : marker.kind === 'zone' ? 8.5 : 9.5;
          if (locked) mmCtx.globalAlpha = 0.72;
          if (marker.pulse) halo(r + 3, 0.5);
          drawHexBadge(mmCtx, x, y, r, { fill, stroke: color, ringWidth: 2, dashed: marker.side === 'contested' || locked });
          placeMapLetter(marker.label, badgeLetter(x, y, r, OBJECTIVE_PALETTE.chalk, mapLetter), taken ? 8.5 : 10);
          const progress = marker.progress ?? 0;
          if (progress > 0.01 && progress < 0.995 && marker.progressSide) {
            drawProgressArc(mmCtx, x, y, r + 3.4, progress, sideColor(marker.progressSide), 2);
          }
          if (taken) drawCheck(mmCtx, x + r * 0.7, y + r * 0.7, 5, color);
          break;
        }
        case 'goal':
          if (nearPlayer) mmCtx.globalAlpha = 0.7;
          drawGoalGlyph(mmCtx, x, y, 9, color, fill);
          break;
        case 'ball':
          halo(5, 0.35);
          drawBallGlyph(mmCtx, x, y, 5.2);
          break;
        case 'pickup':
          drawPickupGlyph(mmCtx, x, y, 6, marker.status === 'heal' ? 'heal' : 'ammo');
          break;
        case 'lane':
          drawLaneGlyph(mmCtx, x, y, 6.5);
          placeMapLetter(marker.label, laneLetter(x, y, 6.5, mapLetter), LANE_GLYPH_LETTER_PX);
          break;
        default:
          break;
      }
      mmCtx.restore();
    }
  }

  function drawDestroyedMinimapTank(state: TankState): void {
    const point = worldToMap(state.pos.x, state.pos.z);
    mmCtx.strokeStyle = 'rgba(140,140,140,0.85)';
    mmCtx.lineWidth = 1.4;
    mmCtx.beginPath();
    mmCtx.moveTo(point[0] - 3.5, point[1] - 3.5);
    mmCtx.lineTo(point[0] + 3.5, point[1] + 3.5);
    mmCtx.moveTo(point[0] + 3.5, point[1] - 3.5);
    mmCtx.lineTo(point[0] - 3.5, point[1] + 3.5);
    mmCtx.stroke();
  }

  function pushTankMinimapBlip(tank: HudTank, state: TankState): void {
    const ally = tank.team === ownSide();
    const ink = teamInk();
    if (ally) {
      const point = worldToMap(state.pos.x, state.pos.z);
      pushLiveBlip(point[0], point[1], state.yaw, ink.own, 5, 0.95, false);
      return;
    }
    const spotted = spotById.get(tank.id);
    if (spotted?.vis) {
      const point = worldToMap(state.pos.x, state.pos.z);
      pushLiveBlip(point[0], point[1], state.yaw, ink.enemy, 5, 0.95, false);
    } else if (spotted?.ever) {
      const point = worldToMap(spotted.lastX, spotted.lastZ);
      drawGhostMarker(mmCtx, point[0], point[1], spotted.lastYaw);
    }
  }

  function collectMinimapTankBlips(tanks: HudTank[]): void {
    _liveBlipCount = 0;
    for (let i = 0; i < tanks.length; i++) {
      const tank = tanks[i];
      const state = tank?.state;
      if (!tank || !state || isSelf(tank) || tank.modeActive === false) continue;
      if (tank.combat?.destroyed) {
        drawDestroyedMinimapTank(state);
        continue;
      }
      pushTankMinimapBlip(tank, state);
    }
  }

  function drawPlayerMinimapOverlay(
    state: TankState,
    camera: THREE.PerspectiveCamera | null | undefined,
  ): void {
    const point = worldToMap(state.pos.x, state.pos.z);
    const x = point[0];
    const y = point[1];
    mmCtx.strokeStyle = 'rgba(240,246,252,0.35)';
    mmCtx.setLineDash([3, 3]);
    mmCtx.beginPath();
    mmCtx.arc(x, y, SPOT_RANGE_M * (MM / mapWorldSize), 0, Math.PI * 2);
    mmCtx.stroke();
    mmCtx.setLineDash([]);
    if (camera) {
      _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
      const cameraAngle = minimapAngleForDirection(_fwd.x, _fwd.z);
      const wedgeRadius = 36;
      mmCtx.fillStyle = 'rgba(235,245,255,0.15)';
      mmCtx.beginPath();
      mmCtx.moveTo(x, y);
      mmCtx.arc(x, y, wedgeRadius, cameraAngle - 0.42, cameraAngle + 0.42);
      mmCtx.closePath();
      mmCtx.fill();
      mmCtx.strokeStyle = 'rgba(240,248,255,0.35)';
      mmCtx.lineWidth = 0.8;
      mmCtx.beginPath();
      mmCtx.moveTo(x, y);
      mmCtx.lineTo(
        x + Math.cos(cameraAngle - 0.42) * wedgeRadius,
        y + Math.sin(cameraAngle - 0.42) * wedgeRadius,
      );
      mmCtx.moveTo(x, y);
      mmCtx.lineTo(
        x + Math.cos(cameraAngle + 0.42) * wedgeRadius,
        y + Math.sin(cameraAngle + 0.42) * wedgeRadius,
      );
      mmCtx.stroke();
    }
    const turretAngle = minimapYawForHeading(state.yaw + state.turretYaw);
    mmCtx.strokeStyle = 'rgba(235,245,255,0.75)';
    mmCtx.lineWidth = 1.2;
    mmCtx.beginPath();
    mmCtx.moveTo(x, y);
    mmCtx.lineTo(x + Math.sin(turretAngle) * 15, y - Math.cos(turretAngle) * 15);
    mmCtx.stroke();
    pushLiveBlip(
      x,
      y,
      state.yaw,
      '#f2f8ff',
      6.6,
      1,
      true,
    );
  }

  /** Watch mode's drone: the lens's view wedge over a small diamond at its ground point (no tank of its own). */
  function drawWatchDroneMarker(pose: HudWatchDrone, camera: THREE.PerspectiveCamera | null | undefined): void {
    const point = worldToMap(pose.x, pose.z);
    const x = point[0], y = point[1];
    if (camera) {
      _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
      const angle = minimapAngleForDirection(_fwd.x, _fwd.z);
      mmCtx.fillStyle = 'rgba(235,245,255,0.18)';
      mmCtx.beginPath();
      mmCtx.moveTo(x, y);
      mmCtx.arc(x, y, 44, angle - 0.55, angle + 0.55);
      mmCtx.closePath();
      mmCtx.fill();
    }
    mmCtx.fillStyle = '#f2f8ff';
    mmCtx.strokeStyle = 'rgba(8,12,16,0.9)';
    mmCtx.lineWidth = 1.4;
    mmCtx.beginPath();
    mmCtx.moveTo(x, y - 5.5);
    mmCtx.lineTo(x + 5.5, y);
    mmCtx.lineTo(x, y + 5.5);
    mmCtx.lineTo(x - 5.5, y);
    mmCtx.closePath();
    mmCtx.stroke();
    mmCtx.fill();
  }

  // Every arrow is drawn exactly where its tank projects (clamped only at the
  // map frame), rotated to its own hull heading; the player arrow is fixed
  // and drawn last so it always sits on top.
  function paintMinimapBlips(): void {
    let playerBlip: MinimapBlip | null = null;
    for (let i = 0; i < _liveBlipCount; i++) {
      const blip = _liveBlipPool[i];
      if (blip.fixed) {
        playerBlip = blip;
        continue;
      }
      blip.x = Math.max(21, Math.min(MM - 5, blip.x));
      blip.y = Math.max(14, Math.min(MM - 5, blip.y));
      drawArrowBlip(mmCtx, blip.x, blip.y, blip.yaw, blip.fill, blip.s, blip.a);
    }
    if (!playerBlip) return;
    drawArrowBlip(
      mmCtx,
      playerBlip.x,
      playerBlip.y,
      playerBlip.yaw,
      playerBlip.fill,
      playerBlip.s,
      playerBlip.a,
    );
  }

  function drawMinimap(frame: HudFrame): void {
    if (!drawMinimapBackground()) return;
    mmLetters.begin();
    mmLetterSlot = 0;
    const tanks = frame.tanks || [];
    const player = frame.player;
    // player map position first — base rings fade while the arrow sits on them
    let plMapX = NaN, plMapY = NaN;
    if (player?.state) {
      const pm = worldToMap(player.aerial?.active?player.aerial.x:player.state.pos.x, player.aerial?.active?player.aerial.z:player.state.pos.z);
      plMapX = pm[0]; plMapY = pm[1];
    }
    // Team bases sit under vehicle contacts, using the shared team-tinted
    // tank-and-return glyph. Vehicle arrows remain on top of the base marker.
    // r6/r6-2/r7-2 history: both bases carry the identical full-weight
    // treatment and a base under the player arrow drops to 55 %.
    // tactical map 2026-09-15: modes whose objectives stand on the spawns
    // (flag bases, goals) or that carry their own spawn markers skip the
    // generic base rings; every other objective is drawn by kind.
    const markers = objectiveMarkers(frame.matchModeState);
    if (spawnFlags && !markersStandOnSpawns(markers)) drawMinimapBases(plMapX, plMapY);
    // the sector chips under the score read the same markers, at the map's own cadence (15 to 30 Hz)
    teamPips.updateSectors(markers);
    if (markers.length) {
      drawMinimapObjectives(markers, frame.timeS, plMapX, plMapY, !!player?.combat?.destroyed);
    }
    // enemy / ally blips (spotting-gated for live enemies)
    // r5: live arrow blips are COLLECTED first, then drawn (player arrow
    // fixed, drawn last). Owner rule (2026-09-25): no separation pass — the
    // r5/r7 relax-to-13.5 px nudge and the per-id jitter made co-located
    // arrows wiggle around each other; arrows now overlap where their tanks
    // overlap and each keeps its own heading (the near-black keyline keeps
    // every arrow's edge readable on a stack).
    // PERF (performance_budget r3): pooled blip records — this redraw runs
    // at 20 Hz and the array + per-blip objects were the last steady
    // allocations in the HUD hot loop (worldToMap already returns a reused
    // module tuple). Pool indexes are stable within one redraw.
    collectMinimapTankBlips(tanks);
    // player: spot-range circle + view wedge + arrow. r4: the white
    // render-range SQUARE is gone — at 500 m on a 1 km map its edges sliced
    // across the terrain and read as a stray playable-bounds frame floating
    // inset from the map border (the panel frame IS the map bound).
    if (watchDrone) drawWatchDroneMarker(watchDrone, frame.camera);
    else if (player?.state && !player.aerial?.active) drawPlayerMinimapOverlay(player.state, frame.camera);
    // clamp inside the map frame and draw the player arrow LAST so it always
    // sits on top.
    paintMinimapBlips();
    if(player?.state&&player.aerial?.active){
      _fwd.set(0,0,-1);if(frame.camera)_fwd.transformDirection(frame.camera.matrixWorld);
      drawAerialMinimap(mmCtx,player.aerial,player.state.pos,frame.aim?.point,_fwd,worldToMap,MM/mapWorldSize);
    }
    mmLetters.end();
  }

  // ---------- bus feeds ----------
  function pushKill(payload: HudEventPayload): void {
    // (ac130-fx-228) the kill's source as the authority stamped it: an AC-130's or a drone's kill names its platform (and
    // shows its icon), the player keeping the kill; a gunship pilot's own vehicle is the AC-130 whatever the source
    const source = killSourceIdentity(payload.source)
      ?? (payload.killerId && aircraftById.has(payload.killerId) ? killSourceIdentity('ac130') : null);
    // callsign first (SPEC 12.2.3): the player is You; the vehicles ride as flag and silhouette, named in the title
    // spectating a watched battle nobody is You: the feed is the battle's, its lanes the sides, the ridden tank's kills
    // and death only highlighted
    const viewerId = watchSide !== null ? null : playerId;
    const ridden = riddenId();
    const callsign = (id: string | null | undefined): string | null =>
      !id ? null : id === viewerId ? t('hud.feed.you') : callsignById.get(id) ?? null;
    const killer = source?.label || callsign(payload.killerId) || (payload.killerId ? nameById.get(payload.killerId) : null)
      || t('hud.enemy');
    const victim = callsign(payload.id) || (payload.id ? nameById.get(payload.id) : null) || payload.specId || t('hud.tankFallback');
    const killerVehicle = source ? '' : payload.killerId ? nameById.get(payload.killerId) ?? '' : '';
    const victimVehicle = (payload.id ? nameById.get(payload.id) : null) || payload.specId || '';
    const ownTeam = watchSide ?? teamById.get(playerId || '');
    const alliedKill = ownTeam !== undefined && !!payload.killerId && teamById.get(payload.killerId) === ownTeam;
    const lane = alliedKill ? killLeft : killRight;
    const presentation = killPresentation({ cause: payload.cause, drone: source?.source === 'drone',
      killerId: payload.killerId, victimId: payload.id || '', playerId: viewerId,
      killerTeam: teamById.get(payload.killerId || ''), victimTeam: teamById.get(payload.id || '') });
    // side-profile silhouettes of the actual tanks flank the names (the platform's icon for a gunship's or drone's kill)
    const kSpec = source ? null : payload.killerId ? specIdById.get(payload.killerId) : null;
    const vSpec = (payload.id ? specIdById.get(payload.id) : null) || payload.specId;
    const kNation = kSpec && payload.killerId ? nationById.get(payload.killerId) : null;
    const vNation = payload.id ? nationById.get(payload.id) : null;
    const flag = (nation: string | null | undefined): string => nation && flagHtml ? flagHtml(nation) : '';
    // the player's own kill of an enemy (not a gunship's or a drone's: the feed names the platform) takes the ribbon, and
    // where the ribbon shows it the feed leaves it out: one kill, one place (UI-LOCKDOWN B1)
    if (payload.id && playerId && payload.killerId === playerId && presentation.relation === 'you') {
      killRibbon.kill({ id: payload.id, callsign: victim, vehicle: victimVehicle, flag: flag(vNation), specId: vSpec || null },
        presentation);
      // (a gunship's or a drone's kill keeps its row: the feed names the platform, the ribbon does not)
      if (!source && killRibbon.shows()) return;
    }
    const item = el('div', 'cot-kf', lane);
    item.dataset.killCause = presentation.cause;
    if (source) item.dataset.killSource = source.source;
    if (presentation.relation) item.dataset.relation = presentation.relation;
    else if (ridden && (payload.killerId === ridden || payload.id === ridden)) {
      item.dataset.relation = 'ridden';
      item.dataset.ridden = payload.killerId === ridden ? 'k' : 'v';
    }
    item.dataset.tip = [killerVehicle && `${killer} · ${killerVehicle}`, presentation.label, victimVehicle && `${victim} · ${victimVehicle}`,
      presentation.relationLabel].filter(Boolean).join(' · ');
    item.innerHTML = `<span class="k"></span>` + flag(kNation) +
      (source ? `<span class="si ksi src" aria-hidden="true">${uiIconSVG(source.icon, 16, 'currentColor')}</span>`
        : kSpec ? `<span class="si ksi"></span>` : '') +
      `<span class="d" aria-label="${presentation.label}">${uiIconSVG(presentation.icon, 16)}${presentation.cause === 'ammorack' ? `<b>${presentation.label}</b>` : ''}</span>` +
      (vSpec ? `<span class="si vsi"></span>` : '') + flag(vNation) + `<span class="v"></span>` +
      (presentation.relation ? `<span class="relation" aria-label="${presentation.relationLabel}">${uiIconSVG(presentation.relationIcon, 13)}</span>` : '');
    // both silhouettes take their side's team ink from the lane (.cot-kill-lane.l / .r)
    if (kSpec) maskIcon(requireElement<HTMLElement>(item, '.ksi'), kSpec, 'side_silhouette', 'currentColor');
    if (vSpec) maskIcon(requireElement<HTMLElement>(item, '.vsi'), vSpec, 'side_silhouette', 'currentColor');
    const killerEl = requireElement<HTMLElement>(item, '.k'), victimEl = requireElement<HTMLElement>(item, '.v');
    killerEl.textContent = killer;
    victimEl.textContent = victim;
    // (a callsign in Latin type keeps the Latin size and tracking in Chinese: battleHudLayout.css .lat; its run marked Latin,
    // which zh-CN's letter-spacing 0 does not reach: tracked 0 there, the same name ran 7 px shorter and was cut later than
    // in en-US, gauntlet r12)
    for (const [el, name] of [[killerEl, killer], [victimEl, victim]] as const) {
      const latin = LATIN_CALLSIGN.test(name);
      el.classList.toggle('lat', latin);
      if (latin) el.lang = 'und-Latn';
      else el.removeAttribute('lang');
    }
    lane.prepend(item);
    while (lane.children.length > MAX_BATTLE_NOTIFICATIONS) lane.lastChild?.remove();
    setTimeout(() => item.classList.add('out'), 5200);
    setTimeout(() => { if (item.parentNode) item.remove(); }, 6200);
  }

  function removeDamageNumber(number: LiveDamageNumber): void {
    clearTimeout(number.timer);
    number.element.remove();
    const index = liveNums.indexOf(number);
    if (index !== -1) liveNums.splice(index, 1);
  }

  function placeDamageNumber(number: LiveDamageNumber): void {
    let x = _sx, y = _sy;
    for (let guard = 0; guard < 8; guard++) {
      const clash = liveNums.find(n => n !== number && Math.abs(n.x - x) < 72 && Math.abs(n.y - y) < 24);
      if (!clash) break;
      y = clash.y - 26;
    }
    number.x = Math.min(Math.max(x, 90), w - 90);
    number.y = Math.min(Math.max(y, 40), h - 60);
    number.element.style.left = `${number.x.toFixed(0)}px`;
    number.element.style.top = `${number.y.toFixed(0)}px`;
  }

  function paintDamageNumber(number: LiveDamageNumber, hit: HudHitEvent, rapid: boolean): void {
    const d = number.element;
    const damage = number.burst?.damage ?? hit.damage;
    d.textContent = `-${damage < 1 ? Number(damage.toFixed(1)) : Math.round(damage)}`;
    if (number.burst?.critical) el('span', 'crit', d).textContent = t('hud.dmg.crit');
    clearTimeout(number.timer);
    d.classList.remove('burst-ending');
    d.classList.toggle('burst', rapid);
    if (rapid) {
      number.timer = setTimeout(() => {
        d.classList.remove('burst'); d.classList.add('burst-ending');
        number.timer = setTimeout(() => removeDamageNumber(number), 1000);
      }, DAMAGE_BURST_GAP_MS);
    } else number.timer = setTimeout(() => removeDamageNumber(number), 1800);
  }

  function pushDamageNumber(hit: HudHitEvent): void {
    if (!lastCamera || mode === 'hidden') return;
    const rapid = isRapidFireHit(hit);
    // Automatic fire confirms blocks at the reticle, never as a cloud of zeroes.
    if (rapid && !(hit.damage > 0)) return;
    if (!(hit.damage > 0) && !document.body.classList.contains('cot-touch-layout')) return;
    project(lastCamera, hit.pos[0], hit.pos[1] + 1.5, hit.pos[2]);
    if (!_sVisible) return;
    const now = performance.now();
    let number = rapid ? liveNums.find(n => n.burst && canAccumulateDamage(n.burst, hit, now)) : undefined;
    if (!number) {
      while (liveNums.length >= 12) removeDamageNumber(liveNums[0]);
      number = { x: _sx, y: _sy, element: el('div', 'cot-dmgnum', dmgLayer) };
      liveNums.push(number);
    }
    if (hit.damage > 0) {
      number.burst = accumulateDamage(number.burst, hit, now) ?? undefined;
      paintDamageNumber(number, hit, rapid);
    } else {
      const outcome = hitOutcomeFor(hit), d = number.element;
      d.classList.add('miss'); d.dataset.outcome = outcome.id;
      d.style.color = outcome.color; d.textContent = outcome.label;
      const owner = number;
      number.timer = setTimeout(() => removeDamageNumber(owner), 1800);
    }
    placeDamageNumber(number);
  }

  /**
   * INCOMING-HIT DIRECTION (killcam_endscreen r1 rebuild — owner: indicators
   * "in actually correct direction"). Root cause of the old wrong arcs:
   *   1. WRONG SOURCE — the bearing was computed from the IMPACT POINT on
   *      the player's own hull relative to hull center: the struck FACE's
   *      bearing, not the shooter's. A shot from front-right that resolved
   *      on the front-left cheek plate pointed the arc LEFT, and an HE
   *      splash (pos = terrain burst) pointed anywhere.
   *   2. MIRRORED MAPPING — canvas arcs run clockwise in a y-down frame;
   *      `ang - PI/2` painted a screen-LEFT shooter on the RIGHT edge.
   * Now the SHOOTER's world position is stored (attacker entity when live in
   * the roster; else the event's hull-local shell direction inverted into
   * world space — sim data, nothing guessed) and every draw frame projects
   * it into the CAMERA basis: screenAngle = atan2(dot(toShooter, camRight),
   * dot(toShooter, camFwd)) — players orient by camera, and the arc
   * counter-rotates as the camera turns, like the minimap wedge.
   * When neither source exists the arc is OMITTED rather than lied about.
   */
  function resolveIncomingHitOrigin(
    hit: HudHitEvent,
    playerState: TankState,
    out: IncomingHitOrigin,
  ): boolean {
    if (hit.attackerId != null && lastTanksRef) {
      for (let i = 0; i < lastTanksRef.length; i++) {
        const attacker = lastTanksRef[i];
        if (attacker?.id !== hit.attackerId || !attacker.state) continue;
        out.x = attacker.state.pos.x;
        out.z = attacker.state.pos.z;
        return true;
      }
    }
    if (!hit.localDir) return false;
    const yaw = playerState.yaw || 0;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const travelX = hit.localDir[0] * cosYaw + hit.localDir[2] * sinYaw;
    const travelZ = -hit.localDir[0] * sinYaw + hit.localDir[2] * cosYaw;
    const length = Math.hypot(travelX, travelZ);
    if (length <= 1e-4) return false;
    out.x = playerState.pos.x - (travelX / length) * 180;
    out.z = playerState.pos.z - (travelZ / length) * 180;
    return true;
  }

  function mergeIncomingHitDirection(
    kind: HitDirection['kind'],
    mergeKey: string,
    origin: IncomingHitOrigin,
    playerState: TankState,
    damage: number,
    amount: number,
    numeric: boolean,
    critical: boolean,
  ): boolean {
    const angle = Math.atan2(
      origin.x - playerState.pos.x,
      origin.z - playerState.pos.z,
    );
    for (let i = 0; i < hitDirs.length; i++) {
      const existing = hitDirs[i];
      if (existing.kind !== kind || existing.mergeKey !== mergeKey) continue;
      const existingAngle = Math.atan2(
        existing.wx - playerState.pos.x,
        existing.wz - playerState.pos.z,
      );
      let separation = Math.abs(angle - existingAngle) % (Math.PI * 2);
      if (separation > Math.PI) separation = Math.PI * 2 - separation;
      if (separation >= 0.35) continue;
      existing.wx = origin.x;
      existing.wz = origin.z;
      existing.dmg += damage;
      existing.amount += amount;
      if (numeric) existing.label = `-${existing.amount}`;
      existing.crit = existing.crit || critical;
      existing.t0 = lastTimeS;
      existing.re = true;
      return true;
    }
    return false;
  }

  function pushHitDirection(hit: HudHitEvent, playerEnt: HudTank | null): void {
    if (!playerEnt?.state) return;
    const playerState = playerEnt.state;
    if (!resolveIncomingHitOrigin(hit, playerState, incomingHitOrigin)) return;
    // visual language tiers (drawHitIndicators): red damage wedge / thin
    // steel deflect arc / amber splash wedge; crits ride the damage wedge
    // as a hot core flash
    const dmg = Number.isFinite(hit.damage) ? Math.max(0, hit.damage || 0) : 0;
    // a 0-damage PENETRATION that cost a module/crewman is still damage-in —
    // it keeps the red wedge (+ crit flash), never the deflect read
    const outcome = hitOutcomeFor(hit);
    const feedback = incomingHitFeedbackFor(hit);
    const kind = feedback.kind;
    const amount = directionalHitAmount(hit, kind === 'bounce' && outcome.blocked);
    // repeat fire from (nearly) the same bearing RE-PULSES the existing wedge
    // — refresh its timer, pool the damage weight — instead of stacking a
    // second copy on top (WoT read; ~20° merge window per class)
    if (mergeIncomingHitDirection(
      kind,
      feedback.mergeKey,
      incomingHitOrigin,
      playerState,
      dmg,
      amount,
      feedback.numeric,
      feedback.critical,
    )) return;
    hitDirs.push({
      wx: incomingHitOrigin.x,
      wz: incomingHitOrigin.z,
      kind,
      outcomeId: feedback.outcomeId,
      mergeKey: feedback.mergeKey,
      label: feedback.label,
      labelColor: feedback.color,
      numeric: feedback.numeric,
      crit: feedback.critical,
      dmg, amount,
      t0: lastTimeS, re: false, _screenAng: null,
    });
    // hard cap: 5 simultaneous wedges — drop the oldest, never visual soup
    while (hitDirs.length > 5) hitDirs.shift();
  }

  function showAlert(text: string, { tone = 'warning', icon = 'info' }: AlertOptions = {}): void {
    const severity = ALERT_SEVERITY[tone] ?? 'warning';
    const now = performance.now();
    dropStaleAlerts(now);
    // (a fresh id each time and the words as the dedupe key: a repeat counts on the alert it repeats, "×3")
    const toast = alertQueue.push(`alert-${++alertSerial}`, { text, icon: icon as IconId, severity, dedupeKey: `${severity}|${text}`,
      priority: ALERT_PRIORITY[severity], durationMs: ALERT_HOLD_MS, dismissible: false });
    alertBorn.set(toast.id, now);
    scheduleAlert();
  }
  /** Paints the band's one alert: its words (a wrapped alert breaks before a separator, never after it: each dot and the
   *  word after it share a nowrap span, their space an ordinary one, r10f; a no-break space there set narrower than the
   *  space before the dot, "EMPTY ·SELECT", and a word joiner after an ordinary space left the break in Chrome, r10g),
   *  the severity's glyph and wash (the kit's notice grammar: an error wears the sprite's alert and is assertive), and its
   *  count. */
  function paintAlert(toast: QueuedToast): void {
    const { text, severity = 'warning' } = toast.options;
    const parts = text.split(' · ');
    // (a compact alert reads as its glyph: its words in the live region and in the hover tip)
    alertEl.dataset.tip = text;
    alertCopyEl.replaceChildren(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      const space = parts[i].indexOf(' ');
      const bound = document.createElement('span');
      bound.className = 'cot-alert-bound';
      bound.textContent = `· ${space < 0 ? parts[i] : parts[i].slice(0, space)}`;
      alertCopyEl.append(' ', bound, space < 0 ? '' : parts[i].slice(space));
    }
    alertIconEl.innerHTML = uiIconSVG(severity === 'error' ? 'alert' : toast.options.icon ?? 'info', 18);
    setText(alertCountEl, toast.count > 1 ? `×${toast.count}` : '');
    setData(alertEl, 'severity', severity);
    setAttr(alertEl, 'role', severity === 'error' ? 'alert' : 'status');
    alertEl.classList.add('show');
  }
  /** Drops the waiting alerts that have waited too long. */
  function dropStaleAlerts(now: number): void {
    for (const toast of [...alertQueue.waiting]) {
      if (now - (alertBorn.get(toast.id) ?? now) <= ALERT_STALE_MS) continue;
      alertQueue.remove(toast.id);
      alertBorn.delete(toast.id);
    }
  }
  /** Runs the band's clock: the shown alert's time out, then the next in line (unless it waited too long). */
  function scheduleAlert(): void {
    if (alertTimer) clearTimeout(alertTimer);
    alertTimer = null;
    const next = alertQueue.nextDeadline();
    if (next === null) return;
    alertTimer = setTimeout(() => {
      alertTimer = null;
      dropStaleAlerts(performance.now());
      for (const id of alertQueue.expired()) { alertQueue.remove(id); alertBorn.delete(id); }
      scheduleAlert();
    }, Math.ceil(next));
  }
  on('ui:pause', ({ on: paused }) => {
    alertQueue.pause(!!paused);
    scheduleAlert();
  });

  let playerRef: HudTank | null = null;
  // watch mode (watch-mode-243): flying the drone, no tank is the HUD's own; riding along, the ridden one is
  let watchDrone: HudWatchDrone | null = null;
  /** The HUD's own tank: the player's, or the one a watcher rides (the frame's player), never one while flying. */
  const isSelf = (tank: HudTank): boolean => !!tank.isPlayer || (!watchDrone && tank === playerRef);
  // Watch mode's spectator frame (setWatchSide): the side the HUD reads as its own, and the ridden tank it highlights
  let watchSide: string | null = null;
  let lastOwnSide: string | null = null;
  const ownSide = (): string => watchSide ?? playerRef?.team ?? 'player';
  const riddenId = (): string | null => watchSide !== null && !watchDrone ? playerRef?.id ?? null : null;
  const allyLabel = (): string => t(watchSide !== null ? 'hud.side.alpha' : 'hud.allies');
  const enemyLabel = (): string => t(watchSide !== null ? 'hud.side.bravo' : 'hud.enemy');
  on('tank:destroyed', (p) => {
    if (!p.id || !killLedger.record(p.id, p.killerId, teamById.get(p.id), teamById.get(p.killerId || ''))) return;
    spotById.delete(p.id);
    pushKill(p);
    reviveCountdown.onDestroyed(p.id);
  });
  // Shell hotkeys route through input.ts actions only (main.ts emits this) —
  // the HUD renders selection state from the bus instead of its own listener.
  on('ui:shellSelect', ({ slot }) => {
    if (slot != null && !slotEls[slot]?.classList.contains('empty')) selectSlot(slot);
  });
  // E applies the ATGM toggle in gameplay first, then emits this
  // presentation-only synchronization event. Re-emitting ui:shellSelect would
  // select the same cannon slot twice and could start an accidental magazine
  // reload when the previous round is restored.
  on('ui:shellSelectionChanged', ({ slot }) => {
    if (slot != null) selectSlot(slot);
  });
  on('ui:perfMeter', (p) => {
    netOptIn = !!(p && p.on);
    if (!netOptIn) { netEl.classList.remove('metered'); netFrames = 0; netLastPaintMs = 0; }
  });
  on('ui:directionalHitValues', (p) => {
    directionalHitValuesEnabled = !!(p && p.on);
  });
  // Live key caps (game/battleKeyCaps.ts, through the frame; owner 2026-10-28: "make sure to relabel if a person changes
  // it in settings"): the tray's shell digits and consumables, the minimap's and the gear's, written when the caps change
  // (a rebind, mid-battle from the pause menu too, or the layout turning pad or keyboard). The controls row's come in
  // the frame's auxiliaryKeyLabels.
  let shownKeyCaps: Readonly<Record<string, string>> | null = null;
  function applyKeyCaps(caps: Readonly<Record<string, string>>): void {
    if (caps === shownKeyCaps) return;
    shownKeyCaps = caps;
    const write = (key: Element | null | undefined, action: string): void => {
      if (!(key instanceof HTMLElement)) return;
      key.dataset.keyCap = action; // (for the battle key caps' receipt: tools/battle-key-caps.browser.mjs)
      key.textContent = caps[action] ?? '';
    };
    for (let i = 0; i < 3 && i < slotEls.length; i++) write(slotEls[i].querySelector('.key'), `shell${i + 1}`);
    for (let i = 0; i < 3 && i < conEls.length; i++) write(conEls[i].querySelector('.key'), `consumable${i + 1}`);
    write(mmKey, 'minimapZoom');
    write(gearKey, 'settingsMenu');
  }
  on('ui:specialActionResult', ({ kind, active }) => {
    if (kind === SPECIAL_ACTION_KINDS.GUIDED_MISSILE) {
      showAlert(t(active
        ? 'hud.alert.atgmSelected'
        : 'hud.alert.atgmDeselected'), {
        icon: active ? 'missileRack' : 'shell', tone: active ? 'success' : 'info',
      });
    }
    else if (kind === SPECIAL_ACTION_KINDS.HYDROPNEUMATIC_AIM) {
      showAlert(t(active
        ? 'hud.alert.suspensionAimEngaged'
        : 'hud.alert.suspensionAimDisengaged'),
        { icon: 'gunMount', tone: active ? 'success' : 'info' });
    } else if (kind === SPECIAL_ACTION_KINDS.MAGAZINE_RELOAD) {
      showAlert(t('hud.alert.magazineReloadStarted'), { icon: 'shell' });
    }
  });
  function pulseAmmoDenied(slot: number | null | undefined, includeSpecial = false): void {
    const target = slot != null ? slotEls[slot] : null;
    if (target) {
      target.classList.remove('deny');
      void target.offsetWidth;
      target.classList.add('deny');
    }
    if (includeSpecial) {
      missileButton.classList.remove('deny');
      void missileButton.offsetWidth;
      missileButton.classList.add('deny');
    }
  }
  on('ui:ammoSelectionDenied', ({ slot, guided }) => {
    pulseAmmoDenied(slot, !!guided);
    showAlert(guided
      ? t('hud.alert.missilesDepleted')
      : t('hud.alert.ammoTypeEmpty'), {
      icon: guided ? 'missileRack' : 'shell', tone: 'danger',
    });
  });
  on('ui:specialActionDenied', ({ reason, slot }) => {
    if (reason === 'AMMO_EMPTY') {
      pulseAmmoDenied(slot, true);
      showAlert(t('hud.alert.missilesDepleted'), { icon: 'missileRack', tone: 'danger' });
      return;
    }
    showAlert(reason === 'MAGAZINE_RELOADING' ? t('hud.alert.magazineReloadInProgress')
        : reason === 'MAGAZINE_FULL' ? t('hud.alert.magazineAlreadyFull')
          : t('hud.alert.specialActionUnavailable'), { icon: 'clock', tone: 'info' });
  });
  on('ui:magazineReloadStarted', () => showAlert(t('hud.alert.magazineReloadStarted'), { icon: 'shell' }));
  on('ui:magazineReloadDenied', ({ reason }) => {
    showAlert(reason === 'MAGAZINE_RELOADING' ? t('hud.alert.magazineReloadInProgress')
      : reason === 'MAGAZINE_FULL' ? t('hud.alert.magazineAlreadyFull')
        : t('hud.alert.magazineReloadUnavailable'), { icon: reason === 'MAGAZINE_FULL' ? 'check' : 'clock', tone: 'info' });
  });
  on('ui:consumableUsed', ({ slot, readyAt, cooldownS, charges }) => {
    if (slot == null || readyAt == null || cooldownS == null) return;
    const s = conEls[slot];
    if (!s) return;
    conReadyAt[slot] = readyAt;
    conCooldownS[slot] = cooldownS;
    if (charges !== undefined) {
      conCharges[slot] = charges;
      s.classList.toggle('empty', charges === 0);
    }
    updateConsumableCooldowns(lastTimeS);
    const id = conItems[slot]!;
    showAlert(t('hud.alert.consumableUsed', { name: consumableLabel(id) }), { icon: CONSUMABLE_ICONS[id], tone: 'success' });
  });
  on('ui:consumableDenied', ({ slot, reason, remainingS }) => {
    if (slot == null) return;
    const id = conItems[slot] ?? 'repair';
    if (reason === 'NOTHING') {
      // what the item had nothing to do for; a timed item already running says it is on
      const key = id === 'extinguisher' ? 'hud.alert.noFireToExtinguish'
        : id === 'first_aid' ? 'hud.alert.crewUnharmed'
          : id === 'repair' || id === 'repair_large' || id === 'track_links' ? 'hud.alert.nothingToRepair'
            : 'hud.alert.consumableNotNeeded';
      showAlert(t(key, { name: consumableLabel(id) }), { icon: CONSUMABLE_ICONS[id], tone: 'info' });
    } else if (reason === 'EMPTY') {
      showAlert(t('hud.consumable.empty', { name: consumableLabel(id) }), { icon: CONSUMABLE_ICONS[id], tone: 'info' });
    } else if (reason === 'COOLDOWN') {
      showAlert(t('hud.alert.consumableReadyIn', { seconds: Math.ceil(remainingS || 0) }),
        { icon: 'clock', tone: 'info' });
    } else if (reason === 'RULESET') {
      showAlert(t('hud.alert.consumablesDisabled'), { icon: 'info', tone: 'info' });
    }
    const s = conEls[slot];
    if (s) { s.classList.remove('deny'); void s.offsetWidth; s.classList.add('deny'); }
  });
  on('ui:consumableReset', () => {
    for (let i = 0; i < conEls.length; i++) {
      conReadyAt[i] = 0;
      const timing = consumableTiming(conItems[i]!);
      conCooldownS[i] = timing.cooldownS;
      conCharges[i] = timing.charges;
      conEls[i].classList.remove('empty');
      // Render through the retained slot so its memo cannot diverge from the
      // tray; only the click-feedback classes are outside its ownership.
      conSlots[i].render(0, conCooldownS[i]);
      conEls[i].classList.remove('used', 'deny');
    }
  });
  // an APS charge met a round (sim/consumableRules.ts): the crew it saved, or the shooter whose round it stopped
  on('aps:intercept', ({ id, shooterId }) => {
    if (playerId == null) return;
    if (id === playerId) showAlert(t('hud.alert.apsInterceptedOwn'), { icon: CONSUMABLE_ICONS.aps_charge, tone: 'success' });
    else if (shooterId === playerId) showAlert(t('hud.alert.apsInterceptedShot'), { icon: CONSUMABLE_ICONS.aps_charge });
  });
  // round 30: the armour-overlay key confirms its state the way the auto-aim lock does
  on('ui:armorOverlayState', ({ on }) => {
    showAlert(t(on ? 'hud.alert.armorOverlayOn' : 'hud.alert.armorOverlayOff'), { icon: 'armorFlashlight', tone: on ? 'success' : 'info' });
  });
  on('ui:autoAimState', ({ on, targetName, reason }) => {
    if (on) showAlert(t('hud.alert.autoAimOn', { name: String(targetName || t('hud.alert.autoAimTarget')).toUpperCase() }),
      { icon: 'autoAim', tone: 'success' });
    else if (reason) showAlert(reason, { icon: 'autoAim', tone: 'info' });
  });
  on('ammo:empty', ({ id }) => {
    if (playerId == null || id === playerId) {
      showAlert(t('hud.alert.ammoTypeEmpty'), {
        icon: 'shell', tone: 'danger',
      });
    }
  });
  on('ammo:depleted', ({ id, slot, fallbackSlot }) => {
    if (playerId != null && id !== playerId) return;
    if (fallbackSlot != null && fallbackSlot >= 0) selectSlot(fallbackSlot);
    const guided = slot != null && lastShells?.[slot]?.type === 'ATGM';
    showAlert(guided
      ? t('hud.alert.missilesDepletedNext')
      : fallbackSlot != null && fallbackSlot >= 0
        ? t('hud.alert.ammoDepletedNext')
        : t('hud.alert.allAmmoDepleted'), {
      icon: guided ? 'missileRack' : 'shell', tone: 'danger',
    });
  });
  on('mode:pickup_collected', ({ by, kind, ammoAdded }) => {
    if (playerId != null && by !== playerId) return;
    const amount = Math.max(0, Number(ammoAdded) || 0);
    showAlert(kind === 'heal'
      ? t('hud.alert.fieldRepairAcquired')
      : t('hud.alert.ammoAcquired', { amount }), {
      icon: kind === 'heal' ? 'repair' : 'shell', tone: 'success',
    });
  });
  on('mode:wave_started', ({ wave }) => {
    showAlert(t('hud.alert.waveInbound', { wave: Math.max(1, Number(wave) || 1) }), {
      icon: 'modeHorde', tone: 'warning',
    });
  });
  on('mode:flag_captured', ({ team }) => {
    const allied = team === objectiveTeam;
    showAlert(t(allied ? 'hud.alert.alliedFlagCapture' : 'hud.alert.enemyFlagCapture'), {
      icon: 'modeFlag', tone: allied ? 'success' : 'danger',
    });
  });
  on('mode:zone_captured', ({ team }) => {
    const allied = team === objectiveTeam;
    if (allied) killRibbon.zone();
    showAlert(t(allied ? 'hud.alert.sectorSecured' : 'hud.alert.sectorLost'), {
      icon: 'modeZones', tone: allied ? 'success' : 'danger',
    });
  });
  // the personal stream's spots (the direction's 06-battle-hud .stream): each enemy the player lit
  on('tank:spotted', ({ id, spotterId }) => {
    if (spotterId != null && playerId != null && spotterId === playerId && id !== playerId) killRibbon.spot();
  });
  on('mode:goal_scored', ({ team }) => {
    const allied = team === objectiveTeam;
    showAlert(t(allied ? 'hud.alert.alliedGoal' : 'hud.alert.enemyGoal'), {
      icon: 'modeTurbo', tone: allied ? 'success' : 'danger',
    });
  });
  // battle endings (2026-09-25): the director's camera beat (battleResultPresentationRuntime) — the clock
  // flashes for time's up and the beat's caption rides the alert strip; the class clears when the beat ends
  on('ending:begin', ({ clockFlash, captionKey, captionValues }) => {
    topPlate.classList.toggle('times-up', !!clockFlash);
    if (captionKey) showAlert(t(captionKey, captionValues || {}), { icon: clockFlash ? 'clock' : 'battleRecord', tone: 'info' });
  });
  on('ending:done', () => { topPlate.classList.remove('times-up'); });
  // batch 19 (2026-09-14): the remaining mode events reach the player — sectors taken, waves cleared
  // (with the repair), respawns, the flag changing hands, caches dropping
  on('mode:line_advanced', ({ line, total }) => {
    showAlert(t('hud.alert.lineTaken', { line: Math.max(1, Number(line) || 1), total: Math.max(1, Number(total) || 3) }), {
      icon: 'modeFrontline', tone: 'success',
    });
  });
  on('mode:wave_cleared', ({ wave }) => {
    // (the next wave's countdown is the clock's, never the alert's as well: UI-LOCKDOWN B19)
    showAlert(t('hud.alert.waveCleared', { wave: Math.max(1, Number(wave) || 1) }), {
      icon: 'repair', tone: 'success',
    });
  });
  on('mode:respawn', ({ id }) => {
    if (id) killLedger.respawn(id);
    // All tanks, not just the player: events can skip the intermediate dead frame.
    if (id) spotById.delete(id);
    if (playerId != null && id !== playerId) return;
    reviveCountdown.hide();
    showAlert(t('hud.alert.respawned'), { icon: 'rematch', tone: 'info' });
  });
  on('mode:flag_taken', ({ team }) => {
    // the payload names the flag's owner: our flag taken means the enemy carries it
    const ours = team === objectiveTeam;
    showAlert(t(ours ? 'hud.alert.flagTakenEnemy' : 'hud.alert.flagTakenAllied'), {
      icon: 'modeFlag', tone: ours ? 'danger' : 'success',
    });
  });
  on('mode:flag_dropped', ({ team }) => {
    const ours = team === objectiveTeam;
    showAlert(t(ours ? 'hud.alert.flagDroppedEnemy' : 'hud.alert.flagDroppedAllied'), {
      icon: 'modeFlag', tone: ours ? 'success' : 'warning',
    });
  });
  on('mode:flag_returned', ({ team }) => {
    const ours = team === objectiveTeam;
    showAlert(t(ours ? 'hud.alert.flagReturnedAllied' : 'hud.alert.flagReturnedEnemy'), {
      icon: 'modeFlag', tone: ours ? 'success' : 'info',
    });
  });
  on('mode:pickup_spawned', ({ kind }) => {
    showAlert(t(kind === 'heal' ? 'hud.alert.repairCacheDropped' : 'hud.alert.ammoCacheDropped'), {
      icon: kind === 'heal' ? 'repair' : 'shell', tone: 'info',
    });
  });
  // Minimap size cycle (3 steps) — the canvas keeps its fixed 2x internal
  // resolution; CSS scales it, so blips/labels stay proportionate.
  // (the steps scale every layout's own plate size, --mm-k: a fixed 300 px lost to the phones' sizes and the 32vh cap, so
  // gauntlet r3's large map grew 10 px at 1280 and not at all at 1024x600; data-zoom names the step for the probes)
  // INTERACTION-REDESIGN C (the census's large-map row: a three-size cycle on M alone, forgotten, two presses back from
  // large): M, the plate's size control and a tap on a touch layout's map toggle the large step and the size the map
  // rests at; a step named by the event ({ step }) is set as it is (the probes' sizes); the size is remembered.
  const MM_SCALES = [0.75, 1, 1.5];
  const MM_LARGE = MM_SCALES.length - 1;
  const MM_SIZE_KEY = 'cot.hud.mapSize';
  let mmSizeIdx = 1;
  try {
    const saved = Number(localStorage.getItem(MM_SIZE_KEY) ?? NaN);
    if (Number.isInteger(saved) && saved >= 0 && saved <= MM_LARGE) mmSizeIdx = saved;
  } catch { /* no storage: the default size */ }
  let mmRest = mmSizeIdx < MM_LARGE ? mmSizeIdx : 1;
  const setMapSize = (step: number, remember: boolean): void => {
    mmSizeIdx = step;
    if (step < MM_LARGE) mmRest = step;
    mmWrap.style.setProperty('--mm-k', String(MM_SCALES[step]));
    mmWrap.dataset.zoom = String(step);
    mmSize.setAttribute('aria-pressed', step === MM_LARGE ? 'true' : 'false');
    mmSize.innerHTML = `${uiIconSVG(step === MM_LARGE ? 'zoomOut' : 'zoomIn', 14)}`;
    mmSize.append(mmKey);
    if (remember) try { localStorage.setItem(MM_SIZE_KEY, String(step)); } catch { /* no storage */ }
  };
  setMapSize(mmSizeIdx, false);
  on('ui:minimapZoom', (payload) => {
    const step = typeof payload?.step === 'number' ? Math.max(0, Math.min(MM_LARGE, Math.round(payload.step)))
      : mmSizeIdx === MM_LARGE ? mmRest : MM_LARGE;
    setMapSize(step, true);
  });
  mmSize.addEventListener('click', () => { bus.emit('ui:minimapZoom', {}); });
  // (a touch layout's map is its own control: a tap on it toggles the large step; it has no header)
  mmWrap.addEventListener('click', (event) => {
    if (!document.body.classList.contains('cot-touch-layout') || (event.target instanceof Element && event.target.closest('.cot-mm-size'))) return;
    bus.emit('ui:minimapZoom', {});
  });
  on('shell:hit', (hit) => {
    if (!isHudHitEvent(hit)) return;
    // the player's first hit given or taken this battle: the first battles' controls strip has done its work (settings.ts)
    if (!playerEngaged && playerId != null && (hit.attackerId === playerId || hit.targetId === playerId)) {
      playerEngaged = true;
      bus.emit('ui:playerEngaged', {});
    }
    if (playerId != null && hit.attackerId === playerId && hit.targetId && hit.targetId !== playerId) {
      pushDamageNumber(hit);
      killRibbon.damage(hit.targetId, hit.damage);
      // Zero-damage and pass-through outcomes use the steel confirmation;
      // damaging/module outcomes use amber. Copy belongs to the canonical
      // ballistic card (or the compact touch impact label), never this shard.
      const bounced = hitOutcomeFor(hit).confirmTone === 'deflect';
      hitMark = { t0: lastTimeS, bounced, blockedRapid: isRapidFireHit(hit) && hitOutcomeFor(hit).blocked };
    }
    if (playerId != null && hit.targetId === playerId) {
      pushHitDirection(hit, playerRef);
    }
  });
  on('module:state', (p) => {
    if (playerId == null || p.id !== playerId || p.state === 'ok') return;
    const moduleId = p.module || '';
    const label = moduleAlertLabel(moduleId);
    const icon = moduleAlertIcon(moduleId);
    // repaired:true = auto-repair finished (red → yellow). This used to toast
    // '<MODULE> DAMAGED' — a recovery announced as fresh damage (the audio
    // layer already said 'repairs' over it). WoT language: 'Track repaired'.
    // (a module damaged or knocked out is the status chip's appearing over the damage panel, never an alert as well:
    // UI-LOCKDOWN B2, the registry's ruling; the repair finishing still says so)
    if (p.repaired) showAlert(t('hud.alert.moduleRepaired', { label }), { icon, tone: 'success' });
  });

  // ---------- aim view assembly ----------
  const aimView: HudAimView = {
    cx: 0, cy: 0, radPx: 40, penRatio: null, distM: null, blockedDistM: null,
    blockedLabel: false, // gameplay_feel r7: dwell-gated PATH BLOCKED text
    gunX: null, gunY: null, gunDistM: null, gunTargetId: null,
    singleReticle: false,
    atGunLimit: false, gunLimitSpec: false,
    selfRightLabel: null,
    reload: { t: 0, totalS: 1, kind: 'ready' }, ammoSelectionPending: false, magazine: null, zoom: 1,
    dispRadM: null, // MOBILE-UX r1: last assembled sim dispersion (probe seam)
  };

  function copyAimViewState(aim: HudAimInput): void {
    aimView.dispRadM = aim.dispersionRadM ?? null;
    aimView.penRatio = aim.penRatio ?? null;
    aimView.gunDistM = aim.gunDistM ?? null;
    aimView.gunTargetId = aim.gunTargetId ?? null;
    aimView.singleReticle = !!aim.singleReticle;
    aimView.blockedDistM = aim.blockedDistM ?? null;
    aimView.blockedLabel = !!aim.blockedLabel;
    aimView.distM = aim.distM ?? null;
    aimView.atGunLimit = !!aim.atGunLimit;
    aimView.gunLimitSpec = !!aim.gunLimitSpec;
    aimView.reload = aim.reload || aimView.reload;
    aimView.ammoSelectionPending = aim.ammoSelectionPending === true;
    aimView.magazine = aim.magazine || null;
    aimView.zoom = aim.zoom || 1;
    aimView.gunX = null;
    aimView.gunY = null;
  }

  function projectAimPoint(
    camera: THREE.PerspectiveCamera | null | undefined,
    aim: HudAimInput,
  ): boolean {
    if (!camera || !aim.point?.isVector3) return false;
    project(camera, aim.point.x, aim.point.y, aim.point.z);
    if (!_sVisible) return false;
    aimView.cx = _sx;
    aimView.cy = _sy;
    const distance = aim.distM ?? _sDist;
    aimView.radPx = (aim.dispersionRadM ?? 1.5) * pxPerMeterAt(camera, distance);
    return true;
  }

  function placeFallbackAimPoint(
    camera: THREE.PerspectiveCamera | null | undefined,
    aim: HudAimInput,
  ): void {
    aimView.cx = w / 2;
    aimView.cy = h / 2;
    aimView.radPx = aim.dispersionRadM != null && aim.distM != null
      ? aim.dispersionRadM * pxPerMeterAt(camera, aim.distM)
      : Math.min(w, h) * 0.05;
  }

  function projectGunMarker(
    camera: THREE.PerspectiveCamera | null | undefined,
    aim: HudAimInput,
  ): void {
    if (!camera || !aim.gunMarker?.isVector3) return;
    project(camera, aim.gunMarker.x, aim.gunMarker.y, aim.gunMarker.z);
    if (!aim.singleReticle) {
      // a turreted tank keeps its separate gun mark and simply drops it off-screen, as before
      if (!_sVisible) return;
      aimView.gunX = _sx;
      aimView.gunY = _sy;
      return;
    }
    // round 32: the single sight never leaves the frame (see edgeAnchorFor) —
    // it slides onto the margin as soon as it crosses it and stays there,
    // rather than travelling 200 px off-screen and snapping back.
    edgeAnchorFor(w, h, _cs.x, _cs.y, _cs.z <= -0.3, _sx, _sy, RETICLE_EDGE_MARGIN_PX, _edgeAnchor);
    aimView.gunX = _edgeAnchor.x;
    aimView.gunY = _edgeAnchor.y;
  }

  function assembleAimView(
    camera: THREE.PerspectiveCamera | null | undefined,
    aim: HudAimInput,
  ): void {
    copyAimViewState(aim);
    if (!projectAimPoint(camera, aim)) placeFallbackAimPoint(camera, aim);
    projectGunMarker(camera, aim);
  }

  function renderCanvas(dt: number, force = false): void {
    if (!force && reticleCanReuse(aimView)) return;
    // (UI-LOCKDOWN A) no store while the HUD is hidden: nothing to paint (its next shown frame repaints in full)
    // (the parked chip's notice, outside the HUD's root, goes with the sight: hidden, cleared or flying)
    if (!retSurface.begin()) {
      reticlePaint.valid = false;
      hideAerialHitMark();
      sightText.clear();
      syncAimNotice(null);
      return;
    }
    ctx.clearRect(0, 0, w, h);
    // Clearing for a cinematic/garage invalidates the pixels represented by
    // the last battle signature. Without this reset, returning to an
    // otherwise-identical aim state could reuse the signature while the
    // actual canvas remained blank.
    if (mode === 'hidden') {
      reticlePaint.valid = false;
      hideAerialHitMark();
      sightText.clear();
      syncAimNotice(null);
      return;
    }
    // (the sight's text runs follow its repaints: a reused frame keeps them, a repaint places them again)
    sightText.begin();
    const aerial = !!playerRef?.aerial?.active;
    if (mode === 'sniper' && !aerial) drawScope(aimView);
    drawHitIndicators(lastTimeS);
    if (!aerial) drawReticle(aimView, dt);
    else syncAimNotice(null);
    if (mode === 'sniper' && !aerial) paintScopeSkeleton(aimView);
    if (aerial) paintAerialHitMark(lastTimeS);
    else { hideAerialHitMark(); drawHitMark(ctx, aimView.cx, aimView.cy, lastTimeS); }
    sightText.end();
    captureReticlePaint(aimView);
  }

  // (ac130-fx-228 r3, the critic's "tan wash while the 30 mm fires", on the base build too) through the gunship's lens the
  // full-screen sight canvas holds nothing but the hit-confirm mark, and in the films (under load) the compositor showed
  // that canvas for a frame or two as one magnified patch of the mark's centre spark — the spark's cream over its dark
  // under-stroke (0.75 of its alpha) to within 1 % at day and night — a flat cream veil over the lens and the gunship's
  // console. The gunship's mark draws into its own small canvas on the sight instead, so nothing it paints, or the
  // compositor makes of it, can leave that box; the ground sight keeps the full-screen canvas it always fills.
  function paintAerialHitMark(timeS: number): void {
    if (!hitMark) { hideAerialHitMark(); return; }
    const x = Math.round(aimView.cx - HIT_MARK_BOX_PX / 2), y = Math.round(aimView.cy - HIT_MARK_BOX_PX / 2);
    if (x !== markX || y !== markY) { markX = x; markY = y; markCanvas.style.transform = `translate(${x}px,${y}px)`; }
    if (!markShown) { markShown = true; markCanvas.style.display = 'block'; markSurface.measureNow(); }
    // (UI-LOCKDOWN A) a hidden mark holds no store: it reads its box the frame it shows
    if (!markSurface.begin()) return;
    markCtx.clearRect(0, 0, HIT_MARK_BOX_PX, HIT_MARK_BOX_PX);
    drawHitMark(markCtx, HIT_MARK_BOX_PX / 2, HIT_MARK_BOX_PX / 2, timeS);
    if (!hitMark) { hideAerialHitMark(); return; }
  }
  function hideAerialHitMark(): void {
    if (!markShown) return;
    markShown = false;
    markCanvas.style.display = 'none';
    markCtx.clearRect(0, 0, HIT_MARK_BOX_PX, HIT_MARK_BOX_PX);
  }

  // Sniper keeps the ARCADE grading untouched: real WoT sniper mode is the
  // same scene at a narrow FOV — no saturation/contrast push, no green cast.
  // (An earlier saturate/contrast CSS filter on the scene canvas made the
  // verdant sniper frame read acid-green; guard against any stale filter.)
  let sceneCanvasEl: HTMLCanvasElement | null = null;
  function sceneCanvas(): HTMLCanvasElement | null {
    if (!sceneCanvasEl || !sceneCanvasEl.isConnected) {
      const app = document.getElementById('app');
      sceneCanvasEl = app ? app.querySelector<HTMLCanvasElement>('canvas') : null;
    }
    return sceneCanvasEl;
  }
  /** Out of ammo (critic r3, advisory): the selected gun is dry. The touch layer dims its FIRE buttons by this class
   * (touchControls.ts), in colour only. A hidden HUD never marks it. */
  let gunDryMarked = false;
  function markGunDry(dry: boolean): void {
    if (gunDryMarked === dry) return;
    gunDryMarked = dry;
    document.body.classList.toggle('cot-gun-dry', dry);
  }

  let rootShown = false;
  function applyMode(): void {
    if (mode === 'hidden') playerEngaged = false;
    if (mode === 'hidden') {document.documentElement.classList.remove('cot-thermal-flight');document.documentElement.dataset.flight='';markGunDry(false);}
    root.style.display = mode === 'hidden' ? 'none' : 'block';
    // (UI-LOCKDOWN A) a HUD just shown paints in this task (a screenshot's forced frame, the HUD editor's preview): its
    // canvases read their boxes now rather than at the observer's next report (one layout read per show)
    if (rootShown !== (mode !== 'hidden')) {
      rootShown = mode !== 'hidden';
      if (rootShown) { retSurface.measureNow(); mmSurface.measureNow(); }
    }
    // the layout owner holds a medal card placed clear of the battle sight only while the scope is up (battleHudLayout.ts);
    // the flag sits on the document element, so a scope toggle relayouts nothing unless such a card waits on it
    document.documentElement.toggleAttribute('data-cot-scoped', mode === 'sniper');
    // scope shadow fades in over ~0.1 s on ENTERING sniper (movement §9.2)
    if (mode === 'sniper' && scopePrevMode !== 'sniper') scopeFadeMs = performance.now();
    scopePrevMode = mode;
    const sc = sceneCanvas();
    if (sc && sc.style.filter) sc.style.filter = '';
  }

  function updateDamagePanelPose(camera: THREE.PerspectiveCamera | null): void {
    if (!dmgPanelRef || !playerRef?.state) return;
    const activeCamera = camera || lastCamera;
    const elements = activeCamera?.matrixWorld?.elements ?? null;
    const cameraYaw = elements ? Math.atan2(-elements[8], -elements[10]) : 0;
    dmgPanelRef.setPose(
      playerRef.state.yaw || 0,
      playerRef.state.turretYaw || 0,
      cameraYaw,
    );
  }

  function indexHudTankNames(tanks: HudTank[]): void {
    for (let i = 0; i < tanks.length; i++) {
      const tank = tanks[i];
      if (!tank?.spec) continue;
      // (ac130-fx-228) one identity for every row: a gunship pilot's vehicle is the AC-130
      const gunship = tank.aerial?.kind === 'gunship';
      nameById.set(tank.id, gunship ? vehicleName(tank) : tank.spec.name);
      teamById.set(tank.id, tank.team);
      specIdById.set(tank.id, tank.spec.id);
      callsignById.set(tank.id, nickFor(tank));
      nationById.set(tank.id, tank.spec.nation);
      if (gunship) aircraftById.add(tank.id);
    }
  }

  function prepareHudFrame(frame: HudFrame): HudFrameUpdateState {
    const state = hudFrameUpdateScratch;
    state.advancing = frame.timeS !== lastTimeS;
    if (state.advancing) {
      forced = null;
      forcedStill = false;
    }
    state.camera = frame.camera ?? null;
    lastCamera = state.camera || lastCamera;
    lastTanksRef = frame.tanks || lastTanksRef;
    state.dt = Math.max(0, Math.min(0.1, frame.timeS - lastTimeS)) || 1 / 60;
    lastTimeS = frame.timeS;
    updateConsumableCooldowns(lastTimeS);
    if (frame.mode && frame.mode !== mode) {
      mode = frame.mode;
      applyMode();
      mmDirty = true;
    }
    playerRef = frame.player || playerRef;
    // flying the watch drone, the frame's tank is only its anchor: no kill reads "You", no hit is the HUD's own
    if (frame.player) playerId = watchDrone ? null : frame.player.id;
    // the HUD's frame moved (a watcher started spectating, took a seat on the other side, or left it): the rosters,
    // their titles and the plates re-seat
    const side = watchSide === null ? ownSide() : `watch:${ownSide()}`;
    if (side !== lastOwnSide) {
      if (lastOwnSide !== null) reseatSides();
      lastOwnSide = side;
      titleSides();
    }
    setText(jumpKey, frame.selfRightKeyLabel ?? 'F');
    if(frame.matchModeState?.id)setControlsJumpMode(isJumpMode(liveRuleset?.mode===frame.matchModeState.id?liveRuleset:matchRulesetFor(normalizeGameMode(frame.matchModeState.id))));
    if(frame.keyCaps)applyKeyCaps(frame.keyCaps);
    if(frame.auxiliaryKeyLabels){
      for(const item of auxiliaryButtons)setText(item.key,frame.auxiliaryKeyLabels[item.action]);
      setText(missileKey,frame.auxiliaryKeyLabels.atgm ?? 'Q');
      setText(reloadKey,frame.auxiliaryKeyLabels.reloadMagazine ?? 'C');
      setText(specialKey,frame.auxiliaryKeyLabels.specialAction ?? 'E');
      setText(droneKey,frame.auxiliaryKeyLabels.drone ?? 'V');
    }
    root.classList.toggle('realistic-mode', frame.matchModeState?.id === 'realistic');
    updateRangeCard(frame);
    updateSpecialAction(frame.player || playerRef, frame.aim);
    const flier = frame.player || playerRef;
    aerialHud.update(flier,frame.timeS,state.camera?.fov ?? 55,frame.aim?.distM ?? 0,mode !== 'hidden',frame.auxiliaryKeyLabels?.drone ?? 'V',state.camera?.userData.thermalFlight===true,frame.auxiliaryKeyLabels?.aerialVision ?? 'I',frame.matchModeState?.support,{ammo:frame.auxiliaryKeyLabels?.supplyAmmo||'J',heal:frame.auxiliaryKeyLabels?.supplyHeal||'K'},mode==='sniper',frame.matchModeState?.escort,
      flier?.aerial?.kind !== 'gunship' || flier.visual?.root?.visible === false);
    updateDriveReadout(frame.player || playerRef, frame.timeS);
    updateDamagePanelPose(state.camera);
    shotInfo.setPlayer(playerId, frame.timeS, objectiveTeam);
    indexHudTankNames(frame.tanks || []);
    return state;
  }

  /** The proving ground's range card: the loaded round against every lane, the lane the gun is laid on lit. */
  function updateRangeCard(frame: HudFrame): void {
    const range = frame.matchModeState?.range;
    if (rangeActive !== !!range) root.classList.toggle('range-mode', !!range);
    rangeActive = !!range;
    rangeLanes = range ? range.lanes : null;
    if (!range) { rangeCard?.hide(); return; }
    if (!rangeCard) {
      rangeCardLoad ??= import('./provingRangeCard.ts').then((module) => {
        rangeCard = module.createProvingRangeCard(root, (type) => bus.emit(type, {}));
      // (asked once: a chunk that did not arrive is not asked for again in this document, and a frame's retry logged each frame)
      }).catch((error) => { console.error('[hud] range card failed to load', error); });
      return;
    }
    const player = frame.player || playerRef;
    const slot = player?.combat?.shellSlot ?? 0;
    rangeCard.update({
      range, shellSlot: slot,
      shellName: player?.spec?.gun?.shells?.[slot]?.name || shellTypeLabel(player?.spec?.gun?.shells?.[slot]?.type || ''),
      // the range from the muzzle along the bore (the shot's own flight distance), not the camera ray's
      laidTargetId: frame.aim?.gunTargetId ?? null, laidRangeM: frame.aim?.gunDistM ?? frame.aim?.distM ?? null,
      hullX: player?.state?.pos.x ?? null, hullZ: player?.state?.pos.z ?? null,
      resetKey: frame.auxiliaryKeyLabels?.rangeReset ?? 'R', movingKey: frame.auxiliaryKeyLabels?.rangeMoving ?? 'Y',
    });
  }

  function updateHudWorldPanels(frame: HudFrame, camera: THREE.PerspectiveCamera | null): void {
    if (camera) {
      camera.updateMatrixWorld();
      _mInv.copy(camera.matrixWorld).invert();
    }
    if (!spawnFlags) captureSpawnFlags(frame);
    updateSpotting(frame);
    updateTeams(frame);
    updateNetReadout(frame);
    updateConsumableSuggestions(frame.player?.aerial?.active ? null : frame.player?.combat);
    updateSixthSense(frame.timeS);
    vehicleStatus.update(frame.player?.aerial?.active ? null : frame.player?.combat, frame.spotting?.player);
  }

  function updateAimPresentation(frame: HudFrame, state: HudFrameUpdateState): void {
    const aim = (!state.advancing && forced) ? forced : (frame.aim || {});
    assembleAimView(state.camera, aim);
    reviveCountdown.observe(frame.player?.combat?.destroyed === true);
    aimView.selfRightLabel = frame.player?.combat?.destroyed !== true &&
      canSelfRightTank(frame.player?.state)
      ? (frame.selfRightKeyLabel || 'F')
      : null;
    if (aim.shells) lastShells = aim.shells;
    const slot = aim.shellSlot ?? localSlot;
    renderShells(lastShells, slot, aim.ammoSelectionPending);
    markGunDry(reticleWeaponDry(lastShells?.[slot], aim.ammoSelectionPending));
    updateTargetPlate();
    renderCanvas(state.dt);
    // The frame's moving writes after the canvas has drawn (its font changes find the style clean): the target plate's
    // move, the reload sweep, the hull bars over the tanks.
    flushTargetPlateMove();
    updateShellCooldown(aim.reload, slot, aim.ammoSelectionPending);
    if (state.camera) updateHpBars(frame);
  }

  /** The camera's heading at the minimap's last paint (radians), to tell a turning view from a still one. */
  let mmLastYaw = NaN;
  function updateMinimapIfDue(frame: HudFrame): void {
    const nowMs = performance.now();
    // 15 Hz while the view holds its heading, 30 Hz while it turns (the arrows' headings follow it), at once when an
    // event dirtied the map (the 249 performance pass: it was 20 Hz throughout)
    const e = frame.camera?.matrixWorld.elements;
    const yaw = e ? Math.atan2(-e[8], -e[10]) : NaN;
    const turn = Math.abs(Math.atan2(Math.sin(yaw - mmLastYaw), Math.cos(yaw - mmLastYaw)));
    const interval = turn > 0.05 ? 33 : 66;
    if (!mmDirty && nowMs - mmLastPaintMs < interval) return;
    drawMinimap(frame);
    mmDirty = false;
    mmLastPaintMs = nowMs;
    mmLastYaw = yaw;
  }

  // ---------- public API ----------
  const hud: HudRuntime = {
    root,
    shotInfo, // SHOT-INFO SECTION: exposed for tests/debug hooks
    sightText,

    /**
     * Stage a deterministic hit-confirm marker (controls_gunnery r3 test
     * hook — real shots kept missing during captures, so the marker's visual
     * weight was unverifiable). Draws through the exact drawHitMark path.
     * @param {boolean} [bounced=false] steel block shards instead of amber
     */
    forceHitMark(bounced = false) {
      hitMark = { t0: lastTimeS, bounced: !!bounced };
    },

    /**
     * killcam_endscreen r1 probe hook: live incoming-hit direction arcs.
     * screenAngRad is the camera-relative bearing the LAST rendered frame
     * used (0 = camera forward, + = screen right) — the known-bearing probe
     * asserts it against an independently computed expectation.
     * @returns {Array<{kind:string,outcomeId:string,label:string,crit:boolean,dmg:number,amount:number,screenAngRad:?number,ageS:number}>}
     */
    getHitArcs() {
      return hitDirs.map((d) => ({
        kind: d.kind,
        outcomeId: d.outcomeId,
        label: d.label,
        crit: !!d.crit,
        dmg: d.dmg || 0,
        amount: d.amount || 0,
        screenAngRad: d._screenAng,
        ageS: Math.round((lastTimeS - d.t0) * 1000) / 1000,
      }));
    },

    /** Spectate-bar introspection for probes (visible + identity). */
    getSpectateBar() {
      return {
        shown: specBar.classList.contains('show') && specBar.classList.contains('in'),
        nick: specNick.textContent,
        vehicle: specVeh.textContent,
      };
    },

    /** Deterministic presentation seam used by the screenshot harness. */
    stageSpectateBar(payload: HudEventPayload = {}) {
      specPopulate({
        id: payload.id || 'spectator-preview',
        name: payload.name || 'SteppeWolf_71',
        vehicle: payload.vehicle || 'M1A2 SEP v3',
        specId: payload.specId || 'm1a1_abrams_fep',
        count: payload.count,
        index: payload.index,
        allies: payload.allies,
      }, true);
    },

    /** PERF (perf-r2): pre-bake shot-card schematics for a fielded roster
     * while the battle loading screen holds the frame (shotInfo owns the
     * cache; see warmSchematics there). @param {string[]} specIds */
    warmShotCards(specIds: readonly string[]) { shotInfo.warmSchematics(specIds); },

    /**
     * battle_countdown r1: drive the pre-battle freeze overlay. Called every
     * held frame with the remaining seconds; the crossing call (0) flashes
     * ROLL OUT! and fades the overlay. Repeated calls are cheap — the DOM
     * only updates when the displayed second changes.
     * @param {number} secondsLeft remaining hold (0 = released)
     */
    preBattleCountdown(secondsLeft: number, warmPending = false) {
      preBattleOverlay.countdown(secondsLeft, warmPending);
    },

    setPreBattleWaiting(waiting: boolean) { preBattleOverlay.setWaiting(waiting); },

    setPreBattleRules(ruleset: MatchRuleset | null) {
      liveRuleset = ruleset;
      reviveCountdown.hide();
      // Owner (2026-09-16): a ruleset without consumables (Turbo Ball) shows no consumable slots — the
      // separator and the three keycaps leave the shell selector instead of reading as "∞" spares.
      jumpLabel.textContent = t('hud.jump');
      setControlsJumpMode(isJumpMode(ruleset));
      // round 30: the touch layer shows its rocket button in the same rulesets
      bus.emit('ui:jumpAvailable', { on: false });
      const noConsumables = ruleset?.consumables === false;
      // inline display: the wrapper's own display rule (contents / mobile column) would outrank [hidden]
      conSep.style.display = noConsumables ? 'none' : '';
      conBox.style.display = noConsumables ? 'none' : '';
      pbRules.replaceChildren();
      // the proving ground's rules show on the range itself (its card, its boards): no rule chips over the count
      if (!ruleset || ruleset.provingGround) return;
      for (const line of rulesetLines(ruleset)) {
        // (the battle's clock is the score plate's, which shows the whole limit before the start: UI-LOCKDOWN B20)
        if (line.key === 'clock') continue;
        const chip = document.createElement('span');
        if (line.key === 'enemyNation') chip.textContent = t('rules.line.enemyNation', { value: t(`campaign.enemy.${line.values.value}`) });
        else {
          // numbers in the data voice: each numeric value is marked through the template, then set apart in a <b>
          const marked: Record<string, string> = {};
          for (const [k, v] of Object.entries(line.values)) marked[k] = /\d/.test(v) ? `\u0001${v}\u0002` : v;
          const parts = t(`rules.line.${line.key}`, marked).split(/[\u0001\u0002]/);
          for (let i = 0; i < parts.length; i++) {
            const text = parts[i].trim();
            if (!text) continue;
            if (i % 2) el('b', '', chip).textContent = text;
            else chip.append(text);
          }
        }
        pbRules.appendChild(chip);
      }
    },

    /**
     * Switch overall HUD mode.
     * @param {'battle'|'sniper'|'hidden'} m
     */
    setMode(m: HudMode) {
      const wasHidden = mode === 'hidden';
      mode = m;
      applyMode();
      mmDirty = true; // guarantee a minimap draw on the next update()
      // net readout: forced screenshot frames (single update after setMode)
      // stay clean — hide the readout and reset the live counter
      netEl.classList.remove('metered');
      netFrames = 0;
      netLastMs = 0;
      netLastPaintMs = 0;
      if (m === 'hidden') {
        vehicleStatus.clear();
        collapseRosters();
        preBattleOverlay.reset();
        setTouchAmmoOpen(false);
        ctx.clearRect(0, 0, w, h);
        hideAerialHitMark();
        sightText.clear();
        aimTargetId = null;
        if (tgtShown) { tgtEl.style.display = 'none'; tgtShown = false; }
        // spectate bar never survives leaving the battlefield
        specBar.classList.remove('in', 'show');
        document.body.classList.remove('cot-spectating');
        resetCombatPresentation();
      }
      // SHOT-INFO SECTION: lifecycle forwarding (reset per battle, hide the
      // end-of-battle stats card when the HUD leaves the battlefield).
      if (m === 'hidden') shotInfo.hideStats();
      if (m === 'battle' && wasHidden) shotInfo.reset();
      if (m === 'battle' && wasHidden) {
        resetCombatPresentation();
        killLedger.clear(); aircraftById.clear();
        // fresh battle: drop spotting memory, nicknames and team rosters
        spotById.clear();
        nickById.clear();
        spawnFlags = null; // re-capture from the new battle's spawn frame
        // SPOTTING SECTION: disarm the sixth-sense lamp (sim clock restarts)
        sixthPendingS = -1;
        sixthUntilS = -1;
        sixthOn = false;
        sixthEl.classList.remove('on');
        for (const row of earRows.values()) row.root.remove();
        earRows.clear();
        rosterIds.length = 0;
        rosterPlayers.length = 0;
        rosterTeams.length = 0;
        for (const [, bar] of hpPool) bar.root.remove();
        hpPool.clear();
        lastScore = '';
        lastTimer = '';
        lastTimerLabel = '';
      }
    },

    /**
     * Per-render-frame HUD refresh.
     * @param {FrameInfo} frame - see ARCHITECTURE §3.7.1.
     */
    update(frame: HudFrame) {
      // r5: only an ADVANCING frame supersedes a forced screenshot display.
      // Shot mode (main.ts, controls_gunnery r5) now re-runs hud.update every
      // frozen tick with an identical timeS — those re-runs must not clear
      // forceAimDisplay state, or the staged over-target plate hides (the
      // frozen spotting sim never saw the teleported target). Live battles
      // always advance timeS, so real frames still supersede immediately.
      if (!nickById.size && frame.tanks?.length) assignNicknames(frame.tanks);
      const state = prepareHudFrame(frame);
      if (mode === 'hidden') { ctx.clearRect(0, 0, w, h); hideAerialHitMark(); sightText.clear(); return; }
      updateHudWorldPanels(frame, state.camera);
      updateAimPresentation(frame, state);
      updateMinimapIfDue(frame);
    },

    /**
     * Render the static minimap background once at battle start.
     * @param {HeightField} heightField
     * @param {{roads:Array,buildings:Array,treeClusters:Array,liquidPatches:Array,softPatches:Array,iceLake:boolean,visibleWater?:object}} features - World.getMinimapFeatures() result, with World.getVisibleWaterRaster() as `visibleWater`.
     * @param {object} [palette] per-map minimap palette override.
     * @param {{renderer:THREE.WebGLRenderer,scene:THREE.Scene,exclude?:THREE.Object3D[]}} [snap]
     *   optional live-scene handles for the one-time top-down ortho capture
     *   (tank roots in `exclude` are hidden during the capture).
     */
    buildMinimap(
      heightField: HudHeightField,
      features?: HudMinimapFeatures | null,
      palette?: Partial<HudMinimapPalette> | null,
      snap?: HudMinimapSnapshot | null,
    ) {
      mmBuildGeneration++;
      mmCaptureReceipt = null;
      buildMinimapBg(heightField, features, palette, snap);
      drawMinimapBackground();
      mmDirty = true;
    },

    preloadMinimapAsset,

    buildMinimapFromAsset(heightField: HudHeightField, src: string) {
      const generation = ++mmBuildGeneration;
      // the baked plate is the battlefield's own (minimapAssetUrl.ts: /minimaps/<map id>.webp), so it names the map
      const mapId = /\/minimaps\/([a-z0-9_]+)\.webp/.exec(src)?.[1];
      mmName.textContent = mapId ? t(`map.${mapId}`) : '';
      return installMinimapAsset(heightField, src, generation);
    },

    getMinimapCaptureReceipt: () => mmCaptureReceipt ? { ...mmCaptureReceipt } : null,

    setWatchSide(team: string | null) { watchSide = team; },

    setWatchDrone(pose: HudWatchDrone | null) {
      if (!pose) { if (watchDrone) { watchDrone = null; mmDirty = true; } return; }
      // the pose moves in place at the minimap's own cadence; only taking off repaints at once
      if (!watchDrone) { watchDrone = { x: pose.x, z: pose.z }; mmDirty = true; return; }
      watchDrone.x = pose.x;
      watchDrone.z = pose.z;
    },

    exportMinimapBackground(type = 'image/webp', quality = 0.92, requireTextured = false) {
      if (requireTextured) requireSceneMinimap(mmCaptureReceipt, mmBuildGeneration);
      if (!mmBg) return null;
      if (mmBg instanceof HTMLCanvasElement) return mmBg.toDataURL(type, quality);
      const out = scratchCanvas(mmBg.naturalWidth || MM * MM_BAKE_RATIO, mmBg.naturalHeight || MM * MM_BAKE_RATIO);
      requireCanvasContext(out).drawImage(mmBg, 0, 0, out.width, out.height);
      return out.toDataURL(type, quality);
    },

    /**
     * Mount the damage panel instance into the HUD layer.
     * @param {{root:HTMLElement}} panel - createDamagePanel() result.
     */
    setDamagePanel(panel: DamagePanelController) {
      if (panel && panel.root && panel.root.parentNode !== root) {
        root.appendChild(panel.root);
        // Conditions travel with the damage panel, including custom HUD placement.
        panel.root.appendChild(vehicleStatus.root);
        // r5-2: keep a handle so update() can feed the live turret bearing
        // into the panel's rotating turret/barrel schematic
        dmgPanelRef = panel;
      }
    },

    /**
     * Deterministic screenshot hook: immediately display the given partial aim
     * state (reticle centered on screen if no world point/camera is known).
     * Stays until the next update(frame).
     * @param {object} f - partial FrameInfo.aim.
     */
    forceAimDisplay(f: HudAimInput) {
      scopeFadeMs = -1; // deterministic still: scope shadow fully settled
      const nextForced: HudAimInput = { ...f };
      forced = nextForced;
      forcedStill = true; // target plate trusts the recipe's aim state
      // r8 MAJOR: disarm the reload-complete ready pulse and sync its edge
      // detector to the STAGED reload — a previous view's mid-reload preset
      // otherwise trips the edge here and the frozen-clock pulse whites out
      // the penetration marker in every captured frame.
      readyPulseT = -1;
      const frl = nextForced.reload;
      wasReloading = !!(frl && frl.totalS > 0 && frl.t > 0.001);
      assembleAimView(lastCamera, nextForced);
      // no bloom animation in a forced still — land directly on the target
      // radius (including the post-shot bloom read from the reload state)
      smoothRadPx = reticleTargetR(aimView);
      if (nextForced.shells) lastShells = nextForced.shells;
      const slot = nextForced.shellSlot != null ? nextForced.shellSlot : localSlot;
      renderShells(lastShells, slot, nextForced.ammoSelectionPending);
      updateShellCooldown(nextForced.reload, slot, nextForced.ammoSelectionPending);
      updateTargetPlate(); // over-target marker for the vehicle under the gun
      renderCanvas(1, true); // after the plate: hairlines gap around its rect
      flushTargetPlateMove();
    },
  };

  // killcam_endscreen r1: probe seam — main.ts exposes no hud handle on
  // __DEBUG, so the direction-arc / spectate-bar assertions read this
  // hud-owned hook (introspection only, no control surface).
  if (typeof window !== 'undefined') {
    window.__HUD_DEBUG = {
      getHitArcs: () => hud.getHitArcs(),
      getSpectateBar: () => hud.getSpectateBar(),
      stageSpectateBar: (payload) => hud.stageSpectateBar(payload),
      getMinimapBackgroundDataUrl: (type, quality) =>
        hud.exportMinimapBackground(type, quality),
      getMinimapState: () => ({
        capture: hud.getMinimapCaptureReceipt(),
        rotationRad: 0,
        rotationDeg: 0,
        orientationSource: 'north-up',
        headingUp: false,
        northUp: true,
        backgroundKind: !mmBg ? 'none'
          : mmBg instanceof HTMLImageElement ? 'image' : 'canvas',
        backgroundReady: !!mmBg && (mmBg instanceof HTMLImageElement
          ? mmBg.complete && mmBg.naturalWidth > 0
          : mmBg.width > 0 && mmBg.height > 0),
        backingWidth: mmSurface.canvas.width,
        backingHeight: mmSurface.canvas.height,
      }),
      // MOBILE-UX r1 probe seam (introspection only): everything the reticle
      // clamp math consumed and produced on the LAST drawn frame, so a
      // numeric gate can assert drawnR == clamp(projection, floor, ceiling)
      // and radPx == dispRadM · pxPerMeter(distM) under the live zoomed FOV.
      getReticleState: () => ({
        mode,
        singleReticle: aimView.singleReticle,
        w,
        h,
        zoom: aimView.zoom || 1,
        distM: aimView.distM,
        dispRadM: aimView.dispRadM,
        radPx: aimView.radPx,
        smoothRadPx,
        drawnR: lastDrawnR,
        gunOutside: lastGunOutside,
        desiredX: aimView.cx,
        desiredY: aimView.cy,
        gunX: aimView.gunX,
        gunY: aimView.gunY,
        circleX: lastCircleX,
        circleY: lastCircleY,
        gunOffsetPx: aimView.gunX == null || aimView.gunY == null
          ? null : Math.hypot(aimView.gunX - aimView.cx, aimView.gunY - aimView.cy),
        atGunLimit: aimView.atGunLimit,
        gunTargetId: aimView.gunTargetId,
        penRatio: aimView.penRatio,
        cameraMarkerColor: lastCameraMarkerCol,
        gunMarkerColor: lastGunMarkerCol,
        magazineIndicator: lastMagazineIndicatorState ? {
          shellCount: lastMagazineIndicatorState.visibleShells,
          y: lastMagazineIndicatorY,
          rounds: lastMagazineIndicatorState.rounds,
          capacity: lastMagazineIndicatorState.capacity,
          overflow: lastMagazineIndicatorState.overflow,
          fullReload: lastMagazineIndicatorState.fullReload,
          loadProgress: lastMagazineIndicatorState.loadProgress,
          reloading: lastMagazineIndicatorState.reloading,
          curved: true,
          outerRotationRad: AUTOLOADER_HUD_OUTER_ROTATION,
          centerDropPx: autoloaderHudShellPose(
            Math.floor((lastMagazineIndicatorState.visibleShells - 1) * 0.5),
            lastMagazineIndicatorState.visibleShells,
            magazineShellPoseScratch,
          ).y,
        } : null,
        floorPx: RET_FLOOR_PX,
        ceilPx: retCeilPx(),
      }),
    };
  }

  return hud;
}
