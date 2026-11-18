// WoT/Blitz-style scoped armor flashlight, painted on the vehicle itself (262). Scope state owns visibility; direct
// reticle contact only supplies the ordinary HUD marker.
//
// (274; the owner, 2026-11-18: "our hitbox shading is wrong and needs to update on enemy tanks when we're scoped on them
// based on their actual penetrability relative to when we currently look at them! same way our reticle knows whether to
// turn red or green") Every colour is the reticle's own verdict: the line from the muzzle to a point is asked of the
// reticle's solver (sim/aimPenetration.ts: the authority's closed collision cells at the target's pose, its spent ERA,
// then impact angle, normalization, ricochet and shatter, spaced and composite layers and the shell's falloff at that
// range) and banded as the reticle's ring is (sim/penVerdict.ts): green goes through, amber may, red will not. Each baked
// panel takes the verdict at its own centre; what the bake left to the per-point score takes its zone's, the verdict at
// the zone's largest clear sample. They follow the muzzle, the target's hull and turret, the loaded shell and spent ERA.
//
// Owner, 2026-10-27: "make highlighting simpler and generalized ... check how camos apply ... that camo changes colour
// depending on where the tank part is". Until 262 the flashlight was a translucent shell drawn over the cells' outer
// skin: the cells are convex slices hulled from the mesh, so a glacis came out as triangle fans and tents, plates
// zigzagged along hull triangles, cracks between slices drew as stripes, and skirts and ERA hid it. Now it is paint, as
// camo is: the vehicle's own armour and fitting paint takes, per fragment, the colour of the armour zone it lies in
// (vehicles/materials.ts ARMOR_PAINT: the authored plate — glacis, lower plate, cheek, mantlet, side, roof, rear — it
// lies nearest, inside whose outline and facing its way; a forward surface over the mantlet's footprint, the mantlet),
// with straight zone borders. Only what is seen is painted.
// Each zone's samples sit on the cells' faces the authority gives that plate.
//
// The paint rides the burn hook every battle vehicle's materials carry from the warm (prewarmBurn): no program of its
// own, nothing to compile on the first scope. This runtime fills each scoped vehicle's zone table (one small float
// texture) and its frames.

import * as THREE from 'three';
import { tankPoseFromState } from '../sim/armor.ts';
import type { ArmorCollisionCell, ArmorModel, ArmorPoseState } from '../sim/armor.ts';
import { AIM_REACH_M, aimArmorAlong, aimPenRatio } from '../sim/aimPenetration.ts';
import type { DamageShellSpec } from '../sim/damage.ts';
import { penVerdict, type PenVerdict } from '../sim/penVerdict.ts';
import { zonePlates, type ZonePlate } from '../sim/armorZones.ts';
import { bakePaintPanelSteps, panelBakeStats, type PanelBakeStats } from './armorPaintPanels.ts';
import {
  ARMOR_PAINT_PANEL_SLOTS as PANEL_SLOTS, ARMOR_PAINT_SET_SLOTS as SET_SLOTS, ARMOR_PAINT_ZONE_EDGES, ARMOR_PAINT_ZONE_TEXELS,
} from '../vehicles/materials.ts';

const SAMPLE_INTERVAL_MS = 110;
/**
 * (267) A refresh samples again only when the round's view of the vehicle moved: the muzzle, in the vehicle's hull, turret
 * and gun frames, further than this (m) or this share of the range (274: ~0.2°, the small angle step a verdict can turn
 * on); its ERA spent; the round changed; the bake added panels. A sniper and a target at rest pay nothing.
 */
const REFRESH_MOVE_M = 0.03;
const REFRESH_MOVE_SHARE = 0.0035;
/** The reticle's solver calls one frame spends, across every scoped vehicle (zones' samples and panels alike). */
const SAMPLE_BATCH_SIZE = 48;
/** (267) Whole panels of one zone whose centres share a cell this size (m) share a row: judged at the first's centre. */
const PANEL_ROW_CELL_M = 0.25;
/** A panel facing away from the muzzle this much (its facing · the unit line back to the muzzle) is not judged: the
 * round cannot meet it there, and it shows its zone's colour until it turns back into view. */
const PANEL_BACK_FACING = -0.1;
/** A target's reach past a point (m) when its armour carries no bounding radius: the line runs through the whole vehicle,
 * as the reticle's does, so a skirt's layers and the plate behind them are all read. */
const FALLBACK_RADIUS_M = 8;
/**
 * A zone aims at most this many samples, spread over the faces the authority gives its plate. A sample whose ray meets
 * other main armour first (a turret over the hull roof) counts only when none of the zone's is clear.
 */
const ZONE_SAMPLES = 3;
/**
 * The turret's envelope (its cells' bounds) grown by this (m) — up, out and fore-and-aft, where its ERA, cupola and
 * bustle stand proud of the cells — and by TURRET_ENVELOPE_FLOOR_M down, short of the hull roof round the ring: a
 * fragment inside it is painted in the turret frame.
 */
const TURRET_ENVELOPE_GROW_M = 0.25;
const TURRET_ENVELOPE_FLOOR_M = 0.05;
/** The bare barrel: a cylinder of this radius (m) along the gun, from this far (m) ahead of the turret and its mantlet. */
const BARREL_RADIUS_M = 0.15;
const BARREL_CLEAR_M = 0.05;

/** The paint's tone of each of the reticle's verdicts (its ring's green, amber and red, deepened for the steel). */
const VERDICT_COLOR: Readonly<Record<PenVerdict, THREE.Color>> = {
  pen: new THREE.Color(0x48d985),
  marginal: new THREE.Color(0xf0aa35),
  nopen: new THREE.Color(0xe53d35),
};
const _world = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _back = new THREE.Vector3();
const _hullFrame = new THREE.Matrix4();
const _turretFrame = new THREE.Matrix4();
const _unscale = new THREE.Matrix4();
const _pose = {
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
};

export type ArmorOverlayModel = ArmorModel;

/** The visual's paint handles (vehicles/tankFactoryCore.ts armorPaint): the burn hook's uniforms and the rig groups. */
interface ArmorPaintHandles {
  uniforms: {
    uApOn: { value: number };
    uApHullInv: { value: THREE.Matrix4 };
    uApTurInv: { value: THREE.Matrix4 };
    uApTurMin: { value: THREE.Vector3 };
    uApTurMax: { value: THREE.Vector3 };
    uApHullC: { value: THREE.Vector3 };
    uApTurC: { value: THREE.Vector3 };
    uApHullH: { value: THREE.Vector3 };
    uApTurH: { value: THREE.Vector3 };
    uApGunInv: { value: THREE.Matrix4 };
    uApGun: { value: THREE.Vector2 };
    uApCounts: { value: THREE.Vector3 };
    uApZones: { value: THREE.DataTexture | null };
  };
  hull: THREE.Object3D;
  turret: THREE.Object3D | null;
  /** The gun's rig group (its trunnion; +z along the barrel), when it has one. */
  gun?: THREE.Object3D | null;
}

interface ArmorOverlayVisual {
  root: THREE.Object3D;
  armorPaint?(): ArmorPaintHandles | null;
}

export interface ArmorOverlayTarget {
  id: string;
  state?: ArmorPoseState | null;
  combat?: {
    destroyed?: boolean;
    eraSpent?: Set<string>;
  } | null;
  visual?: ArmorOverlayVisual | null;
  spec?: { armor?: ArmorOverlayModel } | null;
}

/** One zone's samples: frame-local points on the armour, the share each stands for, and which frame (0 hull, 1 turret). */
interface ZoneSamples {
  readonly points: readonly (readonly number[])[];
  readonly weights: readonly number[];
  readonly turret: boolean;
}

/** (267) A whole panel: its zone (template order), whether it rides the turret, and a frame-local point of it (its centre),
 * where the reticle's verdict is taken (274), and its mean facing in that frame (a unit normal scaled by how flat it is). */
interface WholePanel {
  readonly zone: number;
  readonly turret: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

/** A spec's paint: its zones' table (planes and outlines; colours left blank), the turret envelope, the samples. */
interface PaintTemplate {
  readonly table: Float32Array;
  /** The zones in table order (the hull's, then the turret's): the panel bake scores with them (armorPaintPanels.ts). */
  readonly zones: readonly ZonePlate[];
  readonly hullZones: number;
  readonly turretZones: number;
  /** Mantlet footprints after the zones (a forward surface over one is its plate's). */
  readonly footprints: number;
  /** (267) The zone sets after the footprints (the bake adds them: zoneSet), by their zones. */
  readonly sets: Map<string, number>;
  readonly setBase: number;
  zoneSet(zones: readonly number[]): number;
  /** (267) The whole panels (the bake adds them: wholePanel) and their rows after the sets' slots: [zone, r, g, b], r < 0
   * while the panel has no verdict (it reads its zone's colour). */
  readonly panels: WholePanel[];
  readonly panelBase: number;
  wholePanel(zone: number, point: readonly number[], facing?: readonly number[]): number;
  readonly turretMin: THREE.Vector3;
  readonly turretMax: THREE.Vector3;
  /** Each frame's cells' bounds, centre and half extents: their rounded box stands in for the cells' surface. */
  readonly hullCentre: THREE.Vector3;
  readonly turretCentre: THREE.Vector3;
  readonly hullHalf: THREE.Vector3;
  readonly turretHalf: THREE.Vector3;
  /** Gun-frame z where the bare barrel starts (just ahead of the turret's cells and its mantlet); NaN: no turret. */
  readonly barrelFrom: number;
  readonly barrelRadius: number;
  readonly samples: ZoneSamples[];
}

/** A zone's pick among its samples: the ratio of its heaviest clear one, else of its heaviest hidden one. */
interface ZonePick {
  clear: number;
  clearWeight: number;
  hidden: number;
  hiddenWeight: number;
}

interface ArmorOverlayEntry {
  target: ArmorOverlayTarget;
  paint: ArmorPaintHandles;
  template: PaintTemplate;
  table: Float32Array;
  texture: THREE.DataTexture;
  visible: boolean;
  inScope: boolean;
  sampling: boolean;
  /** The refresh's place: the zone and its sample, then the panel. */
  sampleZone: number;
  samplePoint: number;
  samplePanel: number;
  pick: ZonePick;
  nextSampleMs: number;
  lastShellSpec: DamageShellSpec | null;
  /** (267) The template's zone sets and whole panels this entry's table holds. */
  setsSynced: number;
  panelsSynced: number;
  /** (267) The view the last refresh sampled: the muzzle in the hull's, turret's and gun's frames, the ERA spent; and
   * whether there is one. */
  view: Float64Array;
  viewKnown: boolean;
}

interface ArmorAimOverlayUpdateOptions {
  enabled: boolean;
  scoped: boolean;
  targets?: readonly ArmorOverlayTarget[];
  target?: ArmorOverlayTarget | null;
  shellSpec?: DamageShellSpec | null;
  muzzle?: THREE.Vector3 | null;
  nowMs?: number;
}

export interface ArmorAimOverlayRuntime {
  prime(target: ArmorOverlayTarget | null | undefined): ArmorOverlayEntry | null;
  /** (263) Prime, then bake the vehicle's panels to the end, pausing between slices (the streamer's staging budget). */
  bakePanels(target: ArmorOverlayTarget | null | undefined, pause: () => Promise<void>): Promise<void>;
  warm(): () => void;
  update(options: ArmorAimOverlayUpdateOptions): void;
  hide(): void;
  clear(): void;
  dispose(): void;
}

const sub = (a: readonly number[], b: readonly number[]): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const distance = (a: readonly number[], b: readonly number[]): number => {
  const d = sub(a, b);
  return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
};

/** A convex outline's area (m²): its fan's cross products. */
function pieceArea(points: readonly (readonly number[])[]): number {
  let x = 0, y = 0, z = 0;
  for (let index = 1; index + 1 < points.length; index++) {
    const u = sub(points[index], points[0]), v = sub(points[index + 1], points[0]);
    x += u[1] * v[2] - u[2] * v[1]; y += u[2] * v[0] - u[0] * v[2]; z += u[0] * v[1] - u[1] * v[0];
  }
  return Math.sqrt(x * x + y * y + z * z) / 2;
}

/** A cell face as a sample candidate: its centroid, its area and its plate. */
interface FaceSite { centroid: number[]; area: number; plate: unknown }

/** The outward faces of a frame's cells (the slice caps two cells share are left out) as sample candidates. */
function faceSites(cells: readonly ArmorCollisionCell[] | undefined): FaceSite[] {
  const sites: FaceSite[] = [];
  const splits = new Set<unknown>();
  for (const cell of cells || []) {
    for (const face of cell.faces) {
      if (face.internal || face.indices.length < 3) continue;
      // (265) a plane only partly over the gun: a site per piece, each the plate a round meets there
      if (face.gunSplit) {
        if (splits.has(face.gunSplit)) continue;
        splits.add(face.gunSplit);
        for (const piece of face.gunSplit.pieces) {
          const area = pieceArea(piece.points);
          if (!(area > 1e-6)) continue;
          const centroid = [0, 0, 0];
          for (const point of piece.points) for (let axis = 0; axis < 3; axis++) centroid[axis] += point[axis] / piece.points.length;
          sites.push({ centroid, area, plate: piece.plate });
        }
        continue;
      }
      const [a, b, c] = face.indices.map((index) => cell.vertices[index]);
      const u = sub(b, a), v = sub(c, a);
      const cx = u[1] * v[2] - u[2] * v[1], cy = u[2] * v[0] - u[0] * v[2], cz = u[0] * v[1] - u[1] * v[0];
      const area = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
      if (!(area > 1e-6)) continue;
      sites.push({ centroid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], area, plate: face.plate });
    }
  }
  return sites;
}

/**
 * A zone's samples: the centroids of the largest cell faces the authority gives its plate, spread (each the farthest
 * from those taken), weighted by the area nearest each; a plate no face takes is sampled at its outline's centre. A face
 * inside the cells' union (another slice in front of it) is a sample that sees other armour first: it counts only when
 * none of the zone's is clear.
 */
function zoneSamples(
  sites: readonly FaceSite[],
  plate: unknown,
  outline: readonly (readonly number[])[],
  turret: boolean,
): ZoneSamples {
  const pieces = sites.filter((site) => site.plate === plate);
  if (!pieces.length) {
    const centre = [0, 0, 0];
    for (const point of outline) for (let axis = 0; axis < 3; axis++) centre[axis] += point[axis] / outline.length;
    return { points: [centre], weights: [1], turret };
  }
  pieces.sort((a, b) => b.area - a.area);
  const chosen = [pieces[0]];
  while (chosen.length < ZONE_SAMPLES) {
    let best = null as (typeof pieces)[number] | null, bestScore = 0;
    for (const piece of pieces) {
      if (chosen.includes(piece) || piece.area < pieces[0].area * 0.1) continue;
      let near = Infinity;
      for (const taken of chosen) near = Math.min(near, distance(piece.centroid, taken.centroid));
      const score = near * Math.sqrt(piece.area);
      if (score > bestScore) { bestScore = score; best = piece; }
    }
    if (!best) break;
    chosen.push(best);
  }
  let total = 0;
  const weights = chosen.map(() => 0);
  for (const piece of pieces) {
    let nearest = 0;
    for (let k = 1; k < chosen.length; k++) {
      if (distance(piece.centroid, chosen[k].centroid) < distance(piece.centroid, chosen[nearest].centroid)) nearest = k;
    }
    weights[nearest] += piece.area;
    total += piece.area;
  }
  return { points: chosen.map((piece) => piece.centroid), weights: weights.map((weight) => weight / total), turret };
}

/** One template per armour model (one per spec): every vehicle of a spec shares the zones, only its colours are its own. */
const templates = new WeakMap<object, PaintTemplate | null>();
/** (263) The vehicles whose panels are baked or baking (armorPaintPanels.ts), and what the bake found. */
const panelBakes = new WeakMap<THREE.Object3D, PanelBakeStats>();
/** A frame's share of an unfinished bake (one the streamer did not drive to its end). */
const PANEL_BAKE_FRAME_MS = 1.5;

function buildTemplate(armor: ArmorOverlayModel): PaintTemplate | null {
  const hull = zonePlates(armor.hullPlates);
  const turretCells = armor.collisionShells?.turret || [];
  const turret = turretCells.length ? zonePlates(armor.turretPlates) : [];
  if (!hull.length && !turret.length) return null;
  const zones = [...hull, ...turret];
  const footprints = zones.filter((zone) => zone.footprint).length;
  const setBase = zones.length * ARMOR_PAINT_ZONE_TEXELS + footprints * 2;
  const panelBase = setBase + SET_SLOTS;
  const table = new Float32Array((panelBase + PANEL_SLOTS) * 4);
  let footAt = zones.length * ARMOR_PAINT_ZONE_TEXELS * 4;
  zones.forEach((zone, index) => {
    const base = index * ARMOR_PAINT_ZONE_TEXELS * 4;
    table.set([zone.normal[0], zone.normal[1], zone.normal[2], zone.offset], base);
    for (let e = 0; e < ARMOR_PAINT_ZONE_EDGES; e++) {
      const edge = zone.edges[e];
      table.set(edge ? [edge.normal[0], edge.normal[1], edge.normal[2], edge.offset] : [0, 0, 0, -1], base + (1 + e) * 4);
    }
    if (zone.footprint) {
      const { min, max } = zone.footprint;
      table.set([min[0], min[1], min[2], index, max[0], max[1], max[2], 0], footAt);
      footAt += 8;
    }
  });
  const turretMin = new THREE.Vector3(Infinity, Infinity, Infinity), turretMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const cell of turretCells) {
    turretMin.min(_world.fromArray(cell.min));
    turretMax.max(_world.fromArray(cell.max));
  }
  const turretCentre = turretCells.length ? turretMin.clone().add(turretMax).multiplyScalar(0.5) : new THREE.Vector3();
  const turretHalf = turretCells.length ? turretMax.clone().sub(turretMin).multiplyScalar(0.5) : new THREE.Vector3();
  // the turret's front: its cells' and its mantlet's, whichever stands further ahead
  let turretFront = turretMax.z;
  for (const zone of turret) {
    if (!zone.footprint) continue;
    for (const point of (zone.plate as { verts?: readonly (readonly number[])[] }).verts || []) turretFront = Math.max(turretFront, point[2]);
  }
  const barrelFrom = turretCells.length ? turretFront - (armor.gunPivot?.[2] ?? 0) + BARREL_CLEAR_M : NaN;
  const hullMin = new THREE.Vector3(Infinity, Infinity, Infinity), hullMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const cell of armor.collisionShells?.hull || []) {
    hullMin.min(_world.fromArray(cell.min));
    hullMax.max(_world.fromArray(cell.max));
  }
  const hullHalf = Number.isFinite(hullMin.x) ? hullMax.clone().sub(hullMin).multiplyScalar(0.5) : new THREE.Vector3();
  const hullCentre = Number.isFinite(hullMin.x) ? hullMin.add(hullMax).multiplyScalar(0.5) : new THREE.Vector3();
  if (turretCells.length) {
    turretMin.subScalar(TURRET_ENVELOPE_GROW_M);
    turretMin.y += TURRET_ENVELOPE_GROW_M - TURRET_ENVELOPE_FLOOR_M;
    turretMax.addScalar(TURRET_ENVELOPE_GROW_M);
  } else {
    turretMin.set(1, 1, 1); turretMax.set(-1, -1, -1);
  }
  const hullSites = faceSites(armor.collisionShells?.hull);
  const turretSites = faceSites(turretCells);
  const samples = zones.map((zone, index) => {
    const onTurret = index >= hull.length;
    const outline = ((zone.plate as { verts?: readonly (readonly number[])[] }).verts) || [];
    return zoneSamples(onTurret ? turretSites : hullSites, zone.plate, outline, onTurret);
  });
  const sets = new Map<string, number>();
  const zoneSet = (members: readonly number[]): number => {
    const sorted = [...members].sort((a, b) => a - b), key = sorted.join(',');
    let index = sets.get(key);
    if (index === undefined) {
      if (sets.size >= SET_SLOTS || !sorted.length || sorted.length > 4) return -1;
      index = sets.size;
      sets.set(key, index);
      table.set([0, 1, 2, 3].map((k) => sorted[k] ?? -1), (setBase + index) * 4);
    }
    return index;
  };
  // (267) a whole panel: its row holds its zone, and (274) the colour of the reticle's verdict at its centre once the
  // overlay has one. One row per zone and PANEL_ROW_CELL_M cell of the centre: every vehicle of a spec, whatever its own
  // geometry, names the same rows, and a casting cut into many small pieces shares a few hundred
  const panels: WholePanel[] = [];
  const panelRows = new Map<string, number>();
  const wholePanel = (zone: number, point: readonly number[], facing?: readonly number[]): number => {
    if (!(zone >= 0 && zone < zones.length)) return -1;
    const cell = (v: number): number => Math.floor(v / PANEL_ROW_CELL_M);
    const key = `${zone}:${cell(point[0])}:${cell(point[1])}:${cell(point[2])}`;
    let index = panelRows.get(key);
    if (index === undefined) {
      if (panels.length >= PANEL_SLOTS) return -1;
      index = panels.length;
      panelRows.set(key, index);
      panels.push({ zone, turret: zone >= hull.length, x: point[0], y: point[1], z: point[2],
        nx: facing?.[0] ?? 0, ny: facing?.[1] ?? 0, nz: facing?.[2] ?? 0 });
      table[(panelBase + index) * 4] = zone;
      table[(panelBase + index) * 4 + 1] = -1;
    }
    return index;
  };
  return { table, zones, hullZones: hull.length, turretZones: turret.length, footprints, sets, setBase, zoneSet, panels, panelBase,
    wholePanel, turretMin,
    turretMax, hullCentre, turretCentre, hullHalf, turretHalf, barrelFrom, barrelRadius: BARREL_RADIUS_M, samples };
}

/** The world → combat-frame matrix of a rig group: its world matrix without its own scale (combat frames carry none). */
function frameInverse(group: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  _unscale.makeScale(1 / (group.scale.x || 1), 1 / (group.scale.y || 1), 1 / (group.scale.z || 1));
  return out.multiplyMatrices(group.matrixWorld, _unscale).invert();
}

function pickedRatio(pick: ZonePick): number {
  return pick.clearWeight > 0 ? pick.clear : pick.hiddenWeight > 0 ? pick.hidden : NaN;
}

/** A combat frame's world matrix (its rig group's, without the group's own scale). */
function frameMatrix(group: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  return out.multiplyMatrices(group.matrixWorld, _unscale.makeScale(1 / (group.scale.x || 1), 1 / (group.scale.y || 1), 1 / (group.scale.z || 1)));
}

/**
 * @returns {{prime:Function,warm:Function,update:Function,hide:Function,clear:Function,dispose:Function}}
 */
export function createArmorAimOverlay(): ArmorAimOverlayRuntime {
  const entries = new Map<string, ArmorOverlayEntry>();
  const visibleEntries: ArmorOverlayEntry[] = [];
  let sampleCursor = 0;
  /** Bakes under way, oldest first. */
  const bakes: Array<{ root: THREE.Object3D; stats: PanelBakeStats; work: Generator<void, PanelBakeStats, void> }> = [];
  /**
   * (265; the world-reds lane, Main) Primed vehicles whose panels wait: a battle with the overlay off never pays for them.
   * They bake when asked (bakePanels: the streamer's staging, the overlay on) or in the frames' share once it is on.
   */
  const unbaked = new Set<ArmorOverlayEntry>();

  function prime(target: ArmorOverlayTarget | null | undefined): ArmorOverlayEntry | null {
    if (!target?.id || !target.visual?.root) return null;
    const existing = entries.get(target.id);
    if (existing) return existing;
    const armor = target.spec?.armor;
    const paint = target.visual.armorPaint?.() ?? null;
    if (!armor || !paint) return null;
    let template = templates.get(armor);
    if (template === undefined) { template = buildTemplate(armor); templates.set(armor, template); }
    if (!template) return null;
    const table = template.table.slice();
    const texture = new THREE.DataTexture(table, table.length / 4, 1, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const entry: ArmorOverlayEntry = {
      target, paint, template, table, texture,
      visible: false,
      inScope: false,
      sampling: false,
      sampleZone: 0,
      samplePoint: 0,
      samplePanel: 0,
      pick: { clear: 0, clearWeight: 0, hidden: 0, hiddenWeight: 0 },
      nextSampleMs: -Infinity,
      lastShellSpec: null,
      setsSynced: template.sets.size,
      panelsSynced: template.panels.length,
      view: new Float64Array(10),
      viewKnown: false,
    };
    entries.set(target.id, entry);
    unbaked.add(entry);
    return entry;
  }

  /** (263) An entry's panels, once a vehicle, in slices (bakePanels or the frames' share): copies of a spec share the geometry's. */
  function queueBake(entry: ArmorOverlayEntry): void {
    unbaked.delete(entry);
    const root = entry.target.visual?.root, armor = entry.target.spec?.armor;
    if (!root || !armor || panelBakes.has(root)) return;
    const stats = panelBakeStats();
    panelBakes.set(root, stats);
    root.userData.armorPaintPanels = stats;
    // the authority's pose for the spaced parts' inward rays (the streamer has synced the visual to the same state)
    const authority = entry.target.state ? { pose: tankPoseFromState(entry.target.state) } : null;
    bakes.push({ root, stats, work: bakePaintPanelSteps(root, entry.template, entry.paint, armor, stats, authority) });
  }

  async function bakePanels(target: ArmorOverlayTarget | null | undefined, pause: () => Promise<void>): Promise<void> {
    const entry = prime(target);
    if (!entry || !target?.visual) return;
    queueBake(entry);
    const root = target.visual.root;
    for (;;) {
      const at = bakes.findIndex((bake) => bake.root === root);
      if (at < 0) return;
      if (bakes[at].work.next().done) { bakes.splice(at, 1); return; }
      await pause();
    }
  }

  /** The frame's share of the bakes still under way. */
  function advanceBakes(): void {
    if (!bakes.length) return;
    const until = performance.now() + PANEL_BAKE_FRAME_MS;
    while (bakes.length && performance.now() < until) {
      if (bakes[0].work.next().done) bakes.shift();
    }
  }

  // the paint rides the burn hook's programs (compiled with every battle vehicle's warm): nothing to expose here
  function warm(): () => void {
    return () => {};
  }

  function setVisible(entry: ArmorOverlayEntry | null, visible: boolean): void {
    if (!entry || entry.visible === visible) return;
    entry.visible = visible;
    const u = entry.paint.uniforms;
    if (visible) {
      u.uApZones.value = entry.texture;
      u.uApCounts.value.set(entry.template.hullZones, entry.template.turretZones, entry.template.footprints);
      u.uApTurMin.value.copy(entry.template.turretMin);
      u.uApTurMax.value.copy(entry.template.turretMax);
      u.uApHullC.value.copy(entry.template.hullCentre);
      u.uApTurC.value.copy(entry.template.turretCentre);
      u.uApHullH.value.copy(entry.template.hullHalf);
      u.uApTurH.value.copy(entry.template.turretHalf);
      const barrel = entry.paint.gun && Number.isFinite(entry.template.barrelFrom);
      u.uApGun.value.set(barrel ? entry.template.barrelFrom : 0, barrel ? BARREL_RADIUS_M : 0);
    }
    u.uApOn.value = visible ? 1 : 0;
  }

  /** (267) The zone sets its spec's bake has named since this entry's table was cut. */
  function syncSets(entry: ArmorOverlayEntry): void {
    const { sets, setBase, table } = entry.template;
    if (entry.setsSynced === sets.size) return;
    entry.table.set(table.subarray(setBase * 4, (setBase + sets.size) * 4), setBase * 4);
    entry.setsSynced = sets.size;
    entry.texture.needsUpdate = true;
  }

  /** (267) The whole panels its spec's bake has named since this entry's table was cut: their zones, no verdict yet. A
   * scoped vehicle refreshes at once to judge them (274). */
  function syncPanels(entry: ArmorOverlayEntry): void {
    const { panels, panelBase, table } = entry.template;
    if (entry.panelsSynced === panels.length) return;
    entry.table.set(table.subarray((panelBase + entry.panelsSynced) * 4, (panelBase + panels.length) * 4), (panelBase + entry.panelsSynced) * 4);
    entry.panelsSynced = panels.length;
    entry.viewKnown = false;
    entry.nextSampleMs = -Infinity;
    entry.texture.needsUpdate = true;
  }

  /** The vehicle's frames this frame (its hull and turret move under the paint). */
  function syncFrames(entry: ArmorOverlayEntry): void {
    const { hull, turret, uniforms } = entry.paint;
    hull.updateWorldMatrix(true, false);
    frameInverse(hull, uniforms.uApHullInv.value);
    if (turret) {
      turret.updateWorldMatrix(true, false);
      frameInverse(turret, uniforms.uApTurInv.value);
    }
    const gun = entry.paint.gun;
    if (gun) {
      gun.updateWorldMatrix(true, false);
      frameInverse(gun, uniforms.uApGunInv.value);
    }
  }

  /** (267) Whether the round's view of the vehicle moved since the last refresh; records the view when it did. */
  function viewMoved(entry: ArmorOverlayEntry, muzzle: THREE.Vector3 | null | undefined): boolean {
    if (!muzzle) return true;
    const u = entry.paint.uniforms, view = entry.view;
    const range = _world.copy(muzzle).applyMatrix4(u.uApHullInv.value).length();
    const reach = Math.max(REFRESH_MOVE_M, REFRESH_MOVE_SHARE * range);
    let moved = !entry.viewKnown || view[9] !== (entry.target.combat?.eraSpent?.size ?? 0);
    for (let frame = 0; frame < 3; frame++) {
      const inverse = frame === 0 ? u.uApHullInv.value : frame === 1 ? u.uApTurInv.value : u.uApGunInv.value;
      _world.copy(muzzle).applyMatrix4(inverse);
      const at = frame * 3;
      if (!moved && (_world.x - view[at]) ** 2 + (_world.y - view[at + 1]) ** 2 + (_world.z - view[at + 2]) ** 2 > reach * reach) moved = true;
    }
    if (!moved) return false;
    for (let frame = 0; frame < 3; frame++) {
      const inverse = frame === 0 ? u.uApHullInv.value : frame === 1 ? u.uApTurInv.value : u.uApGunInv.value;
      _world.copy(muzzle).applyMatrix4(inverse);
      view[frame * 3] = _world.x; view[frame * 3 + 1] = _world.y; view[frame * 3 + 2] = _world.z;
    }
    view[9] = entry.target.combat?.eraSpent?.size ?? 0;
    entry.viewKnown = true;
    return true;
  }

  function hide(): void {
    if (!visibleEntries.length) return;
    for (const entry of entries.values()) {
      setVisible(entry, false);
      entry.inScope = false;
      entry.sampling = false;
    }
    visibleEntries.length = 0;
  }

  function writeVerdict(entry: ArmorOverlayEntry, at: number, ratio: number): void {
    const verdict = penVerdict(ratio);
    if (!verdict) { entry.table[at] = -1; return; }
    const color = VERDICT_COLOR[verdict];
    entry.table[at] = color.r; entry.table[at + 1] = color.g; entry.table[at + 2] = color.b;
  }

  /** A zone's colour (its last texel: rgb, a = 1 when it has a verdict). */
  function paintZone(entry: ArmorOverlayEntry, zone: number, ratio: number): void {
    const at = (zone * ARMOR_PAINT_ZONE_TEXELS + ARMOR_PAINT_ZONE_TEXELS - 1) * 4;
    writeVerdict(entry, at, ratio);
    entry.table[at + 3] = penVerdict(ratio) ? 1 : 0;
  }

  /**
   * The reticle's ratio along the line from the muzzle to a world point on the target (NaN: none), as the reticle reads
   * it when laid on that point (game/aimController.ts): the same solver, the line run through the whole vehicle. Leaves
   * the last call's armour in `lastInfo` for the zones' clear test.
   */
  let lastInfo: ReturnType<typeof aimArmorAlong> = null;
  let lastReach = 0;
  function ratioAt(state: ArmorPoseState, armor: ArmorOverlayModel, eraSpent: ReadonlySet<string> | undefined,
    shellSpec: DamageShellSpec, muzzle: THREE.Vector3, point: THREE.Vector3): number {
    lastInfo = null;
    _dir.copy(point).sub(muzzle);
    const reach = _dir.length();
    if (!(reach > 0.05) || reach > AIM_REACH_M) return NaN;
    _dir.multiplyScalar(1 / reach);
    lastReach = reach;
    lastInfo = aimArmorAlong(muzzle, _dir, Math.min(AIM_REACH_M, reach + (armor.boundingRadiusM ?? FALLBACK_RADIUS_M)), state, armor,
      eraSpent, _pose);
    return lastInfo ? aimPenRatio(shellSpec, lastInfo) : NaN;
  }

  /** One frame's share of an entry's refresh: its zones' samples, then its whole panels. True when it is done. */
  function sampleBatch(
    entry: ArmorOverlayEntry,
    shellSpec: DamageShellSpec | null | undefined,
    muzzle: THREE.Vector3 | null | undefined,
  ): boolean {
    const target = entry.target;
    const armor = target.spec?.armor;
    if (!target?.state || !target?.combat || !armor || !shellSpec || !muzzle) return true;
    const { hull, turret } = entry.paint;
    frameMatrix(hull, _hullFrame);
    if (turret) frameMatrix(turret, _turretFrame);
    const zones = entry.template.samples;
    const pick = entry.pick;
    let remaining = SAMPLE_BATCH_SIZE;
    let painted = false;
    while (entry.sampleZone < zones.length && remaining > 0) {
      const zone = zones[entry.sampleZone];
      if (entry.samplePoint === 0) { pick.clear = 0; pick.clearWeight = 0; pick.hidden = 0; pick.hiddenWeight = 0; }
      const owner = zone.turret ? turret : hull;
      while (entry.samplePoint < zone.points.length && remaining > 0) {
        const k = entry.samplePoint++;
        remaining--;
        if (!owner) continue;
        _world.fromArray(zone.points[k]).applyMatrix4(zone.turret ? _turretFrame : _hullFrame);
        const ratio = ratioAt(target.state, armor, target.combat.eraSpent, shellSpec, muzzle, _world);
        if (!Number.isFinite(ratio) || !lastInfo) continue;
        // clear: the line's first main armour is the sample's own face (within 12 cm of it); else it met another first (a
        // layer's t is along the solver's whole line, AIM_REACH_M)
        const last = lastInfo.layers[lastInfo.layers.length - 1];
        const weight = zone.weights[k];
        if (last && last.plate.kind === 'main' && last.t * AIM_REACH_M < lastReach - 0.12) {
          if (weight > pick.hiddenWeight) { pick.hidden = ratio; pick.hiddenWeight = weight; }
        } else if (weight > pick.clearWeight) { pick.clear = ratio; pick.clearWeight = weight; }
      }
      if (entry.samplePoint < zone.points.length) break;
      paintZone(entry, entry.sampleZone, pickedRatio(pick));
      painted = true;
      entry.sampleZone++;
      entry.samplePoint = 0;
    }
    const { panels, panelBase } = entry.template;
    const count = Math.min(entry.panelsSynced, panels.length);
    while (entry.sampleZone >= zones.length && entry.samplePanel < count && remaining > 0) {
      const panel = panels[entry.samplePanel], at = (panelBase + entry.samplePanel) * 4 + 1;
      entry.samplePanel++;
      remaining--;
      if (panel.turret && !turret) { entry.table[at] = -1; continue; }
      const frame = panel.turret ? _turretFrame : _hullFrame;
      _world.set(panel.x, panel.y, panel.z).applyMatrix4(frame);
      _dir.set(panel.nx, panel.ny, panel.nz).transformDirection(frame).multiplyScalar(Math.hypot(panel.nx, panel.ny, panel.nz));
      _back.copy(muzzle).sub(_world);
      const backLength = _back.length();
      if (backLength > 1e-6 && _dir.dot(_back) < PANEL_BACK_FACING * backLength) {
        if (entry.table[at] >= 0) { entry.table[at] = -1; painted = true; }
        remaining++;
        continue;
      }
      writeVerdict(entry, at, ratioAt(target.state, armor, target.combat.eraSpent, shellSpec, muzzle, _world));
      painted = true;
    }
    if (painted) entry.texture.needsUpdate = true;
    return entry.sampleZone >= zones.length && entry.samplePanel >= count;
  }

  function addScopedTarget(candidate: ArmorOverlayTarget | null | undefined): void {
    if (!candidate || candidate.combat?.destroyed || !candidate.visual?.root?.visible) return;
    const entry = prime(candidate);
    if (!entry) return;
    entry.inScope = true;
    if (!entry.visible) {
      entry.sampling = false;
      entry.nextSampleMs = -Infinity;
      entry.viewKnown = false;
    }
    setVisible(entry, true);
    syncSets(entry);
    syncPanels(entry);
    syncFrames(entry);
    visibleEntries.push(entry);
  }

  function collectScopedTargets(
    targets: ArmorOverlayTarget[] | readonly ArmorOverlayTarget[] | null | undefined,
    target: ArmorOverlayTarget | null | undefined,
  ): void {
    visibleEntries.length = 0;
    for (const entry of entries.values()) entry.inScope = false;
    if (Array.isArray(targets)) {
      for (const candidate of targets) addScopedTarget(candidate);
    } else {
      addScopedTarget(target);
    }
    for (const entry of entries.values()) {
      if (entry.inScope) continue;
      setVisible(entry, false);
      entry.sampling = false;
    }
  }

  function prepareScopedSamples(
    shellSpec: DamageShellSpec | null | undefined,
    muzzle: THREE.Vector3 | null | undefined,
    sampleNowMs: number,
  ): void {
    for (const entry of visibleEntries) {
      if (entry.lastShellSpec !== shellSpec) {
        entry.lastShellSpec = shellSpec ?? null;
        entry.nextSampleMs = -Infinity;
        entry.sampling = false;
        entry.viewKnown = false;
      }
      if (entry.sampling || sampleNowMs < entry.nextSampleMs) continue;
      if (!viewMoved(entry, muzzle)) { entry.nextSampleMs = sampleNowMs + SAMPLE_INTERVAL_MS; continue; }
      entry.sampling = true;
      entry.sampleZone = 0;
      entry.samplePoint = 0;
      entry.samplePanel = 0;
    }
  }

  function sampleNextScopedEntry(
    shellSpec: DamageShellSpec | null | undefined,
    muzzle: THREE.Vector3 | null | undefined,
    sampleNowMs: number,
  ): void {
    // Keep the original global one-batch-per-frame query budget while
    // rotating across every visible scoped enemy.
    for (let offset = 0; offset < visibleEntries.length; offset++) {
      const index = (sampleCursor + offset) % visibleEntries.length;
      const entry = visibleEntries[index];
      if (!entry.sampling) continue;
      if (sampleBatch(entry, shellSpec, muzzle)) {
        entry.sampling = false;
        entry.nextSampleMs = sampleNowMs + SAMPLE_INTERVAL_MS;
      }
      sampleCursor = (index + 1) % visibleEntries.length;
      return;
    }
  }

  function update({
    enabled,
    scoped,
    targets,
    target,
    shellSpec,
    muzzle,
    nowMs,
  }: ArmorAimOverlayUpdateOptions): void {
    if (enabled) {
      for (const entry of unbaked) queueBake(entry);
      advanceBakes();
    }
    if (!enabled || !scoped) {
      hide();
      return;
    }

    collectScopedTargets(targets, target);
    if (!visibleEntries.length) return;

    const sampleNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : 0;
    prepareScopedSamples(shellSpec, muzzle, sampleNowMs);
    sampleNextScopedEntry(shellSpec, muzzle, sampleNowMs);
  }

  function clear(): void {
    hide();
    for (const entry of entries.values()) {
      if (entry.paint.uniforms.uApZones.value === entry.texture) entry.paint.uniforms.uApZones.value = null;
      entry.texture.dispose();
    }
    entries.clear();
    visibleEntries.length = 0;
    sampleCursor = 0;
    // (2026-11-02 audit, 01-game-1 item 11) a bake cut off here never finished: its vehicle forgets it. The latch is set
    // at the queue, so a cut-off root (a pooled hull kept across battles, battleVisualPool.ts) was refused for the
    // session, and the scope painted the parts the bake never reached without their zones; its next prime bakes it
    // again, keeping the geometries it reached (armorPaintPanels.ts bakedBy)
    for (const bake of bakes) {
      bake.work.return(bake.stats);
      if (panelBakes.get(bake.root) === bake.stats) panelBakes.delete(bake.root);
      if (bake.root.userData.armorPaintPanels === bake.stats) delete bake.root.userData.armorPaintPanels;
    }
    bakes.length = 0;
    unbaked.clear();
  }

  function dispose(): void {
    clear();
  }

  return { prime, bakePanels, warm, update, hide, clear, dispose };
}
