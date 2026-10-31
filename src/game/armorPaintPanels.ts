// The armour paint by panel (263). The per-point score (vehicles/materials.ts ARMOR_PAINT, sim/armorZones.ts) draws a
// zone border as a straight line wherever two plates' scores meet, and after 262's five blind rounds the one defect the
// critics still named was that line crossing a part: a diagonal through an ERA tile, a stair down a turret wedge, a cut
// across a skirt panel. Here every connected triangle cluster of a painted draw — the triangles that share its vertices:
// a box's face, a tile, a panel — takes one zone, the area-weighted majority of that same score over its triangles,
// written as the vertex attribute apZone (the zone + 1; PANEL_BARE for gear left bare; 0 the per-point score, as before),
// so a border falls on a panel's edge. Each part is judged in its own rig's frame (a hull part is hull armour at any yaw;
// what rides the turret or the gun is the turret's). A cluster with no majority goes by part (264, Main): a small one (a
// dome, a hatch) whole on its plurality, a large welded casting split at its creases, each piece voting again; a piece
// still split keeps the per-point score, as does a turret part by the barrel (the gun's elevation decides there). A spaced
// or external part outside the cells (a skirt, a box, the hull's rubber) takes the zone of the first main plate behind
// it, from the authority's own ray inward along its normal (264, Main): the shell meets that plate through it.
//
// (267; the owner, 2026-10-31: "not highlight stuff that wouldnt actually lead to the enemy tank taking damage like drone
// cages, props, machine guns etc.") The paint shows only what a round's damage reads. Gear stays bare whole: equipment
// (sights, launchers, roof stations), machine guns and their ammunition, the running gear, a camouflage suit. A part
// other than armour (the hull's and the turret's own, and its add-on ERA and applique) is armour only where it lies on
// what the authority traces: within FLUSH_M of the cells (a bolt, a boot, a link of track) or within LAYER_REACH_M of a
// plate the sim traces a round through (ERA, a spaced skirt or screen, external armour; never a drone screen, which the
// sim traces for drones only), a compact solid touching such a plate being that layer whole. A cage, a stowage box, a
// rack, a fender or a net standing off it is bare (a solid mostly off, whole), as it is air to the round.
//
// Baked in slices once the overlay primes a vehicle (the battle visual streamer's staging, else the overlay's own frames),
// once per geometry: copies of a spec share it. Each geometry is judged at one pose, its frames taken as it starts. Every
// painted geometry gets the attribute (zeros where it bakes nothing), so the draws a far LOD merges keep one vertex
// layout; a draw without it reads 0 (the hook's defaultAttributeValues).

import * as THREE from 'three';
import { tracedCollisionCells, type ArmorCollisionCell, type ArmorModel, type ArmorPlate, type TankArmorPose } from '../sim/armor.ts';
import { zoneAt, type ZonePlate } from '../sim/armorZones.ts';
import { gunFaceSplitPlate } from '../sim/gunFaceSplit.ts';
import { ARMOR_PAINT_PANEL_BARE as PANEL_BARE, ARMOR_PAINT_ZONE_ATTRIBUTE as PANEL_ZONE_ATTRIBUTE, armorPaintMode } from '../vehicles/materials.ts';

/** The share of a cluster's area its zone must hold to be baked; under it the cluster keeps the per-point score. */
export const PANEL_MAJORITY = 0.6;

/** What the bake needs of the overlay's template (game/armorAimOverlay.ts): the zones and the frames' boxes. */
export interface PanelTemplate {
  readonly zones: readonly ZonePlate[];
  readonly hullZones: number;
  readonly turretMin: THREE.Vector3;
  readonly turretMax: THREE.Vector3;
  readonly hullCentre: THREE.Vector3;
  readonly turretCentre: THREE.Vector3;
  readonly hullHalf: THREE.Vector3;
  readonly turretHalf: THREE.Vector3;
  readonly barrelFrom: number;
  readonly barrelRadius: number;
  /** (267) The index of a set of up to four zones in the template's table (-1: it is full): a panel split between them
   * names it. */
  zoneSet?(zones: readonly number[]): number;
}

/** (264) The authority the bake asks what lies behind a spaced or external part: the vehicle's pose as the sim reads it. */
export interface PanelAuthority {
  readonly pose: TankArmorPose;
}

/** Each template's zones by their plates' names (the authority's ray names the plate it meets). */
const zoneByPlate = new WeakMap<PanelTemplate, Map<string, number>>();
function zoneByPlateOf(template: PanelTemplate): Map<string, number> {
  let byName = zoneByPlate.get(template);
  if (!byName) {
    byName = new Map();
    template.zones.forEach((zone, index) => { const name = plateName(zone); if (name && !byName!.has(name)) byName!.set(name, index); });
    zoneByPlate.set(template, byName);
  }
  return byName;
}

export interface PanelFrames {
  readonly hull: THREE.Object3D;
  readonly turret: THREE.Object3D | null;
  readonly gun?: THREE.Object3D | null;
}

export interface PanelBakeStats {
  draws: number;
  geometries: number;
  triangles: number;
  /** Triangles whose cluster took one zone, was left bare, or kept the per-point score. */
  baked: number;
  bare: number;
  perPoint: number;
  /** Geometries drawn more than once (another place, another zone): zeros. */
  shared: number;
  /** The per-point triangles by why: no zone held the majority, the pose decides (live), no plate faces them. */
  perPointSplit: number;
  perPointLive: number;
  perPointNone: number;
  /** (264) Triangles of spaced or external parts that took the plate behind them, and the authority rays cast. */
  standoff: number;
  standoffRays: number;
  /** (267) Triangles left bare as gear (by role), and as parts standing off the armour; per-point ones naming a zone set;
   * far-LOD stand-ins given their sources' values. */
  gear: number;
  offArmour: number;
  sets: number;
  farStands: number;
  /** Clusters with no majority that were baked by part: whole (a small part's plurality) or split at their creases. */
  wholeParts: number;
  creaseParts: number;
  /** (measurePanelDisagreement) the painted area, the panels' share of it, and the part of that the per-point paint gives
   * another zone (m²). */
  paintedArea: number;
  bakedArea: number;
  disagreeArea: number;
  /** ... by why: the per-point paint leaves it bare or unpainted; it judges it in the other frame; another plate. */
  disagreeBare: number;
  disagreeFrame: number;
  disagreeZone: number;
  /** Clusters, and the votes they cast (one a flat cluster). */
  clusters: number;
  votes: number;
  /** The bake's own time, its slices and the longest (what a frame pays). */
  ms: number;
  slices: number;
  sliceMs: number;
}

// a triangle's vote: a zone (>= 0), or one of these
const VOTE_NONE = -1;
const VOTE_BARE = -2;
const VOTE_LIVE = -3;

/** Which armour model baked a geometry (same-spec copies share theirs); a geometry seen under another is zeroed. */
const bakedBy = new WeakMap<THREE.BufferGeometry, object | null>();
/** Each template's hull and turret zones apart (zoneAt takes one frame's). */
interface FrameZones {
  readonly hull: ZonePlate[];
  readonly turret: ZonePlate[];
}
const frameZones = new WeakMap<PanelTemplate, FrameZones>();
function frameZonesOf(template: PanelTemplate): FrameZones {
  let split = frameZones.get(template);
  if (!split) {
    split = { hull: template.zones.slice(0, template.hullZones), turret: template.zones.slice(template.hullZones) };
    frameZones.set(template, split);
  }
  return split;
}

/** One geometry's frames, as they stood when its bake started (a slice later the vehicle may have moved). */
interface PanelPose {
  readonly hullInv: THREE.Matrix4;
  readonly turretInv: THREE.Matrix4;
  readonly gunInv: THREE.Matrix4;
}
/** Triangles a slice of the bake takes before it yields. */
const SLICE_TRIANGLES = 1500;

const _unscale = new THREE.Matrix4();
const _normalWorld = new THREE.Matrix3();
const _b = new THREE.Vector3(), _c = new THREE.Vector3(), _from = new THREE.Vector3(), _dir = new THREE.Vector3();
const _centre = new THREE.Vector3(), _normal = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3();
const _g = new THREE.Vector3(), _n = new THREE.Vector3(), _box = new THREE.Vector3();

function frameInverse(group: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  _unscale.makeScale(1 / (group.scale.x || 1), 1 / (group.scale.y || 1), 1 / (group.scale.z || 1));
  return out.multiplyMatrices(group.matrixWorld, _unscale).invert();
}

type Owner = 'hull' | 'turret' | 'gun';
function ownerOf(object: THREE.Object3D, frames: PanelFrames): Owner {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node === frames.gun) return 'gun';
    if (node === frames.turret) return 'turret';
    if (node === frames.hull) return 'hull';
  }
  return 'hull';
}

/**
 * The paint's own judgement at one world point with its world normal (materials.ts ARMOR_PAINT_DIFFUSE_GLSL, the same
 * terms): its frame, its normal leaned on the frame's cell box, the gear it leaves bare, then the zone (sim/armorZones.ts
 * zoneAt, the mantlet's footprint first).
 * - `perPoint` false (the bake): the frame is the part's own rig's: a hull part is hull armour at any yaw, what rides the
 *   turret or the gun is the turret's wherever it stands (the per-fragment paint cannot know a part's rig and takes the
 *   turret's frame inside its envelope: a hull deck under the turret's overhang changed zone with the yaw, a mantlet ahead
 *   of the envelope stood bare). VOTE_LIVE where the gun's elevation decides (a turret part by the barrel).
 * - `perPoint` true: exactly the per-fragment paint's rule (the frame by the envelope and the footprints), for the
 *   measure of where a panel and the per-point paint disagree.
 */
function vote(template: PanelTemplate, split: FrameZones, pose: PanelPose, barrel: boolean, mode: number,
  owner: Owner, world: THREE.Vector3, normalWorld: THREE.Vector3, perPoint = false): number {
  const zones = template.zones, hullN = template.hullZones;
  const hasTurret = zones.length > hullN;
  const t = _t.copy(world).applyMatrix4(pose.turretInv);
  let turret = hasTurret && t.x >= template.turretMin.x && t.y >= template.turretMin.y && t.z >= template.turretMin.z
    && t.x <= template.turretMax.x && t.y <= template.turretMax.y && t.z <= template.turretMax.z;
  let overFoot = false;
  for (let k = hullN; k < zones.length; k++) {
    const box = zones[k].footprint;
    if (box && t.x >= box.min[0] && t.y >= box.min[1] && t.z >= box.min[2] && t.x <= box.max[0] && t.y <= box.max[1] && t.z <= box.max[2]) overFoot = true;
  }
  turret = turret || overFoot;
  // the barrel, in the gun's frame: bare at any elevation; a turret part near it moves in and out with the gun
  if (barrel) {
    const g = _g.copy(world).applyMatrix4(pose.gunInv);
    const r2 = g.x * g.x + g.y * g.y;
    const inBarrel = g.z > template.barrelFrom && r2 < template.barrelRadius * template.barrelRadius;
    if (inBarrel && (perPoint || owner === 'gun')) return VOTE_BARE;
    if (!perPoint && owner === 'turret' && g.z > template.barrelFrom - 0.1 && r2 < (template.barrelRadius + 0.1) ** 2) return VOTE_LIVE;
  }
  if (!perPoint) {
    turret = owner !== 'hull' && hasTurret;
    if (owner === 'hull') overFoot = false;
  }
  const p = turret ? t : _p.copy(world).applyMatrix4(pose.hullInv);
  const n = _n.copy(normalWorld).transformDirection(turret ? pose.turretInv : pose.hullInv);
  const centre = turret ? template.turretCentre : template.hullCentre;
  const half = turret ? template.turretHalf : template.hullHalf;
  const hx = Math.max(half.x, 0.05), hy = Math.max(half.y, 0.05), hz = Math.max(half.z, 0.05);
  const qx = (p.x - centre.x) / hx, qy = (p.y - centre.y) / hy, qz = (p.z - centre.z) / hz;
  const box = _box.set(qx * qx * qx / hx, qy * qy * qy / hy, qz * qz * qz / hz);
  if (box.lengthSq() > 1e-12) box.normalize(); else box.set(0, 1, 0);
  if (mode > 1) n.copy(box);
  else {
    n.addScaledVector(box, 3);
    if (n.lengthSq() < 1e-6) n.copy(box); else n.normalize();
  }
  // the rest of the gear: weapon steel outside the turret's cells, what stands above the hull's cells or past their ends
  if (mode === 3 && turret && !overFoot && (Math.abs(t.x - template.turretCentre.x) > template.turretHalf.x + 0.05
    || Math.abs(t.y - template.turretCentre.y) > template.turretHalf.y + 0.05
    || Math.abs(t.z - template.turretCentre.z) > template.turretHalf.z + 0.05)) return VOTE_BARE;
  if (!turret && template.hullHalf.y > 0
    && (p.y > template.hullCentre.y + template.hullHalf.y + 0.1 || Math.abs(p.z - template.hullCentre.z) > template.hullHalf.z + 0.1)) return VOTE_BARE;
  const zone = zoneAt(turret ? split.turret : split.hull, p.x, p.y, p.z, n.x, n.y, n.z);
  return zone >= 0 ? zone + (turret ? hullN : 0) : VOTE_NONE;
}

function plateName(zone: ZonePlate | undefined): string {
  return String((zone?.plate as { name?: string } | undefined)?.name ?? '');
}

/** Whether a frame-local point lies within CELL_SLACK_M of a convex cell's inside. */
function insideCell(cell: ArmorCollisionCell, p: THREE.Vector3): boolean {
  if (p.x < cell.min[0] - CELL_SLACK_M || p.y < cell.min[1] - CELL_SLACK_M || p.z < cell.min[2] - CELL_SLACK_M
    || p.x > cell.max[0] + CELL_SLACK_M || p.y > cell.max[1] + CELL_SLACK_M || p.z > cell.max[2] + CELL_SLACK_M) return false;
  for (const face of cell.faces) {
    if (face.normal[0] * p.x + face.normal[1] * p.y + face.normal[2] * p.z + face.constant > CELL_SLACK_M) return false;
  }
  return true;
}

/** (267) How far a frame-local point stands outside the union of convex cells (<= 0 inside): per cell its farthest face
 * plane (a lower bound of the distance outside it), the least over the cells; a cell whose bounds lie farther than
 * FLUSH_M is passed over. */
function cellGap(cells: readonly ArmorCollisionCell[], p: THREE.Vector3): number {
  let best = Infinity;
  for (const cell of cells) {
    const dx = Math.max(cell.min[0] - p.x, 0, p.x - cell.max[0]);
    const dy = Math.max(cell.min[1] - p.y, 0, p.y - cell.max[1]);
    const dz = Math.max(cell.min[2] - p.z, 0, p.z - cell.max[2]);
    if (dx * dx + dy * dy + dz * dz > FLUSH_M * FLUSH_M) continue;
    let d = -Infinity;
    for (const face of cell.faces) d = Math.max(d, face.normal[0] * p.x + face.normal[1] * p.y + face.normal[2] * p.z + face.constant);
    if (d < best) best = d;
  }
  return best;
}

/** The face a segment (o + d·t, t in [0, 1]) enters a convex cell by, and where (sim/armor.ts intersectConvexCell). */
let _entryFace: ArmorCollisionCell['faces'][number] | null = null;
function enterCell(cell: ArmorCollisionCell, o: THREE.Vector3, d: THREE.Vector3): number {
  _entryFace = null;
  // the cell's bounds first
  let lo = 0, hi = 1;
  for (let axis = 0; axis < 3; axis++) {
    const oa = axis === 0 ? o.x : axis === 1 ? o.y : o.z, da = axis === 0 ? d.x : axis === 1 ? d.y : d.z;
    if (Math.abs(da) < 1e-12) { if (oa < cell.min[axis] || oa > cell.max[axis]) return -1; continue; }
    let a = (cell.min[axis] - oa) / da, b = (cell.max[axis] - oa) / da;
    if (a > b) { const swap = a; a = b; b = swap; }
    if (a > lo) lo = a;
    if (b < hi) hi = b;
    if (lo > hi) return -1;
  }
  let t0 = 0, t1 = 1;
  let entry: ArmorCollisionCell['faces'][number] | null = null;
  for (const face of cell.faces) {
    const n = face.normal;
    const distance = n[0] * o.x + n[1] * o.y + n[2] * o.z + face.constant;
    const denominator = n[0] * d.x + n[1] * d.y + n[2] * d.z;
    if (Math.abs(denominator) < 1e-12) { if (distance > 1e-7) return -1; continue; }
    const t = -distance / denominator;
    if (denominator < 0) { if (t > t0) { t0 = t; entry = face; } } else if (t < t1) t1 = t;
    if (t0 > t1 + 1e-8) return -1;
  }
  if (t1 < 0 || t0 > 1) return -1;
  _entryFace = entry;
  return Math.max(0, t0);
}

function find(parent: Int32Array, v: number): number {
  while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
  return v;
}
function union(parent: Int32Array, a: number, b: number): void {
  const ra = find(parent, a), rb = find(parent, b);
  if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
}

/** Positions weld on a 0.2 mm grid (a key per cell). */
const WELD_PER_M = 5000;
const WELD_SPAN = 131072;
/** A cluster whose normals all lie within ~1.8° of its first is flat: one vote at its area-weighted centre. */
const FLAT_DOT = 0.9995;
/** A curved cluster votes on at most this many of its triangles (an even stride). */
const MAX_VOTES = 32;
/** A flat cluster of at most this many triangles votes on three points a triangle; a larger one once at its centre. */
const FLAT_SAMPLED = 8;
/** (264) A part's centre this far outside every cell of its frame (m) is a spaced or external part; its inward ray starts
 * this far out along its normal. */
const CELL_SLACK_M = 0.03;
const STANDOFF_REACH_M = 1.5;
/** One ray answers every spaced part within this cell of its frame (m) facing the same way; a part smaller than
 * STANDOFF_MIN_M2 (a bolt, a rivet) asks only the answers already cast. A ray counts as this many triangles of a slice. */
const STANDOFF_CELL_M = 0.15;
const STANDOFF_MIN_M2 = 0.002;
const STANDOFF_RAY_COST = 12;
/** A spaced solid at most this far across its triangles' centres (m: a pod, a drum, a box) is one part, its plate the one
 * behind its largest face; a larger one (a merged side's whole assembly) answers face by face. */
const SOLID_PART_M = 2;

/** (267) A part standing farther than FLUSH_M (m) off the cells, and farther than LAYER_REACH_M off every layer plate (a
 * skirt's or an ERA tile's visible face stands up to that far off the plate the sim traces for it), is bare. */
const FLUSH_M = 0.08;
const LAYER_REACH_M = 0.15;
/** behindZone's verdict besides a zone: the part is no standoff (its own vote decides). */
const BEHIND_VOTE = -1;
/** (267) Where a judged part stands: on the armour (the cells), at a layer plate, or off both. */
const ON_ARMOUR = 0;
const AT_LAYER = 1;
const OFF_ARMOUR = 2;
/** A camouflage suit's draws (ghillieSuit.ts: `<id>_ghillie_<owner>_net|leaves`). */
const SUIT_MESH = /_ghillie_(?:hull|turret|gun)_(?:net|leaves)$/;

/** (267) A draw of gear no round's damage reads: equipment (combatHitboxRole), a machine gun or its ammunition, the
 * running gear, a suit. */
function gearDraw(mesh: THREE.Object3D): boolean {
  if (SUIT_MESH.test(mesh.name)) return true;
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
    const data = node.userData;
    if (data.appearanceRole === 'machineGun' || data.appearanceRole === 'ammoBox' || data.runningGear === true) return true;
    if (data.combatHitboxRole) return data.combatHitboxRole === 'equipment' && node.name !== 'turretPermanentMarkingSurface';
  }
  return false;
}
/** (267) Whether a draw is armour: the hull's or the turret's own (the cells are hulled from it) or its add-on armour (ERA,
 * applique: what stands in front of the cells takes the plate behind it, as 264 has it). Never judged standing off. */
function armourDraw(mesh: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
    const role = node.userData.combatHitboxRole;
    if (role) return role === 'armor' || role === 'externalArmor';
  }
  return false;
}

/** (267) The plates besides the cells a round meets (ERA, spaced, external), per frame, frame-local: fan triangles (nine
 * numbers each) and their box grown by LAYER_REACH_M. */
interface LayerPlates { readonly tris: Float64Array; readonly boxes: Float64Array; readonly count: number }
const layersOf = new WeakMap<object, readonly [LayerPlates, LayerPlates, LayerPlates]>();
function layerPlatesOf(model: ArmorModel): readonly [LayerPlates, LayerPlates, LayerPlates] {
  let layers = layersOf.get(model);
  if (layers) return layers;
  const lists: number[][][][] = [[], [], []];
  const take = (plates: readonly ArmorPlate[] | undefined, frame: number): void => {
    for (const plate of plates ?? []) {
      if ((plate.kind || 'main') === 'main' || !(plate.verts?.length >= 3)) continue;
      lists[plate.gunFollow ? 2 : frame].push(plate.verts as unknown as number[][]);
    }
  };
  take(model.hullPlates, 0);
  take(model.turretPlates, 1);
  layers = lists.map((plates) => {
    const triangles = plates.reduce((sum, verts) => sum + verts.length - 2, 0);
    const tris = new Float64Array(triangles * 9), boxes = new Float64Array(triangles * 6);
    let at = 0;
    for (const verts of plates) {
      for (let k = 1; k + 1 < verts.length; k++, at++) {
        const corners = [verts[0], verts[k], verts[k + 1]];
        for (let axis = 0; axis < 3; axis++) {
          let lo = Infinity, hi = -Infinity;
          for (let c = 0; c < 3; c++) {
            tris[at * 9 + c * 3 + axis] = corners[c][axis];
            lo = Math.min(lo, corners[c][axis]); hi = Math.max(hi, corners[c][axis]);
          }
          boxes[at * 6 + axis] = lo - LAYER_REACH_M; boxes[at * 6 + 3 + axis] = hi + LAYER_REACH_M;
        }
      }
    }
    return { tris, boxes, count: triangles };
  }) as unknown as readonly [LayerPlates, LayerPlates, LayerPlates];
  layersOf.set(model, layers);
  return layers;
}
/** The squared distance from a point to one of a list's triangles (Ericson, Real-Time Collision Detection 5.1.5). */
function triangleDistanceSq(tris: Float64Array, k: number, px: number, py: number, pz: number): number {
  const o = k * 9;
  const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
  const abx = tris[o + 3] - ax, aby = tris[o + 4] - ay, abz = tris[o + 5] - az;
  const acx = tris[o + 6] - ax, acy = tris[o + 7] - ay, acz = tris[o + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let u = 0, v = 0;
  if (d1 <= 0 && d2 <= 0) { u = 0; v = 0; } else {
    const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz;
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) { u = 1; v = 0; } else if (d6 >= 0 && d5 <= d6) { u = 0; v = 1; }
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); v = 0; }
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) { u = 0; v = d2 / (d2 - d6); }
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 1 - w; v = w; }
    else { const denominator = 1 / (va + vb + vc); u = vb * denominator; v = vc * denominator; }
  }
  const qx = ax + abx * u + acx * v - px, qy = ay + aby * u + acy * v - py, qz = az + abz * u + acz * v - pz;
  return qx * qx + qy * qy + qz * qz;
}
/** Whether a frame-local point lies within LAYER_REACH_M of a layer plate of that frame. */
function nearLayer(layers: LayerPlates, p: THREE.Vector3): boolean {
  const { tris, boxes, count } = layers;
  for (let k = 0; k < count; k++) {
    const b = k * 6;
    if (p.x < boxes[b] || p.y < boxes[b + 1] || p.z < boxes[b + 2] || p.x > boxes[b + 3] || p.y > boxes[b + 4] || p.z > boxes[b + 5]) continue;
    if (triangleDistanceSq(tris, k, p.x, p.y, p.z) <= LAYER_REACH_M * LAYER_REACH_M) return true;
  }
  return false;
}

/** A cluster with no majority under this area (m²: a dome, a hatch, a lamp's casing) takes its plurality as one part;
 * a larger one (a welded hull or turret casting) is split at its creases and each piece votes again. */
const SMALL_PART_M2 = 0.5;
const PLURALITY = 0.4;
/** A large part (at least SMALL_PART_M2: a hull side, a glacis) needs this share to be baked whole, else it keeps the
 * per-point border: one face two plates share (an upper and a lower side on one flat side) shows where they meet, as the
 * authority's shell meets them (the 264 agreement census: panels lost the IFVs' flat sides). Its flat faces vote on up to
 * LARGE_FLAT_POINTS points a triangle, spread by area. */
const LARGE_MAJORITY = 0.85;
/** (267) A split piece names the zones holding at least SET_MEMBER of its area, at most four, when they and the area no
 * zone faces hold SET_SHARE of it: the paint scores those zones alone. */
const SET_MEMBER = 0.01;
const SET_SHARE = 0.98;
const LARGE_FLAT_POINTS = 16;
const LARGE_FLAT_POINT_M2 = 0.05;
/** Adjacent triangles whose faces turn more than ~30° apart lie on two sides of a crease. */
const CREASE_DOT = 0.866;

/** A baked triangle as a lane measure reads it: its world centre and normal, its area, its part (the draw and its
 * cluster), and the plate its panel shows and the plate the per-point paint would (null: bare or unpainted). */
export interface PanelSample {
  readonly x: number; readonly y: number; readonly z: number;
  readonly nx: number; readonly ny: number; readonly nz: number;
  readonly area: number;
  readonly part: string;
  readonly panel: string;
  readonly point: string | null;
  /** Whether the panel's plate, and the per-point paint's, is the turret's (else the hull's). */
  readonly panelTurret: boolean;
  readonly pointTurret: boolean;
}
/** (lane tools) Also measure where a panel's zone and the per-point paint's disagree (bakedArea, disagreeArea), and hand
 * each baked triangle to `sink`; null stops it. */
let measureDisagreement = false;
let panelSink: ((sample: PanelSample) => void) | null = null;
export function measurePanels(sink: ((sample: PanelSample) => void) | null): void {
  measureDisagreement = !!sink;
  panelSink = sink;
}

/** A three-component attribute's values as a plain array (a copy when it is interleaved or normalized). */
function plain(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): ArrayLike<number> | null {
  if (!attribute) return null;
  const direct = attribute as THREE.BufferAttribute;
  if (!(attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !direct.normalized && direct.itemSize === 3) return direct.array;
  const out = new Float32Array(attribute.count * 3);
  for (let v = 0; v < attribute.count; v++) { out[v * 3] = attribute.getX(v); out[v * 3 + 1] = attribute.getY(v); out[v * 3 + 2] = attribute.getZ(v); }
  return out;
}

/** A geometry's clusters: each triangle's (`parent`, a union-find over triangles), each vertex's welded twin (`canon`: one
 * vertex per welded corner), and the triangles' corners. */
interface Clusters {
  readonly parent: Int32Array;
  /** Each triangle's solid (a union-find joined across every shared edge, creases too: a box with all its faces). */
  readonly solid: Int32Array;
  readonly canon: Int32Array;
  readonly triangles: number;
  readonly corner: (t: number, k: number) => number;
  readonly indexed: boolean;
}

/**
 * The parts of a geometry: triangles joined across every edge they share (corners welded by position) where their faces
 * turn less than a crease (CREASE_DOT), so a part is a surface its creases bound: a box's faces stay apart, a faceted
 * dome, a bevel's run or a smooth casting holds together (264: a dome drawn flat-shaded voted facet by facet). An indexed
 * geometry's triangles that share a vertex stay together too (one value a vertex). A yield every SLICE_TRIANGLES.
 */
function* clusters(geometry: THREE.BufferGeometry): Generator<void, Clusters, void> {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const count = position.count;
  const canon = new Int32Array(count);
  const triangles = Math.floor((index ? index.count : count) / 3);
  const parent = new Int32Array(triangles), solid = new Int32Array(triangles);
  for (let t = 0; t < triangles; t++) parent[t] = solid[t] = t;
  const corner = index ? (t: number, k: number) => index.getX(t * 3 + k) : (t: number, k: number) => t * 3 + k;
  const p = plain(position)!;
  // corners welded by position (0.2 mm)
  const heads = new Map<number, number>();
  const half = WELD_SPAN / 2;
  for (let v = 0; v < count; v++) {
    const key = ((Math.round(p[v * 3] * WELD_PER_M) + half) * WELD_SPAN + Math.round(p[v * 3 + 1] * WELD_PER_M) + half)
      * WELD_SPAN + Math.round(p[v * 3 + 2] * WELD_PER_M) + half;
    const head = heads.get(key);
    if (head === undefined) { heads.set(key, v); canon[v] = v; } else canon[v] = head;
    if (v % (SLICE_TRIANGLES * 3) === SLICE_TRIANGLES * 3 - 1) yield;
  }
  // each triangle's face direction (local: a rigid frame keeps the angles)
  const face = new Float64Array(triangles * 3);
  for (let t = 0; t < triangles; t++) {
    const a = corner(t, 0) * 3, b = corner(t, 1) * 3, c = corner(t, 2) * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const wx = p[c] - p[a], wy = p[c + 1] - p[a + 1], wz = p[c + 2] - p[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length > 1e-18) { face[t * 3] = nx / length; face[t * 3 + 1] = ny / length; face[t * 3 + 2] = nz / length; }
  }
  // across each shared edge, short of a crease
  const edges = new Map<number, number>();
  for (let t = 0; t < triangles; t++) {
    for (let e = 0; e < 3; e++) {
      const a = canon[corner(t, e)], b = canon[corner(t, (e + 1) % 3)];
      if (a === b) continue;
      const key = a < b ? a * count + b : b * count + a;
      const other = edges.get(key);
      if (other === undefined) { edges.set(key, t); continue; }
      union(solid, t, other);
      if (face[t * 3] * face[other * 3] + face[t * 3 + 1] * face[other * 3 + 1] + face[t * 3 + 2] * face[other * 3 + 2] >= CREASE_DOT) {
        union(parent, t, other);
      }
    }
    if (t % SLICE_TRIANGLES === SLICE_TRIANGLES - 1) yield;
  }
  // an indexed geometry: the triangles that share a vertex, together
  if (index) {
    const owner = new Int32Array(count).fill(-1);
    for (let t = 0; t < triangles; t++) {
      for (let k = 0; k < 3; k++) {
        const v = corner(t, k);
        if (owner[v] < 0) owner[v] = t; else { union(parent, owner[v], t); union(solid, owner[v], t); }
      }
    }
  }
  return { parent, solid, canon, triangles, corner, indexed: !!index };
}

/**
 * Bake the panels of one vehicle in slices (a yield every SLICE_TRIANGLES): every single-material, non-instanced draw the
 * paint colours gets the apZone attribute. `stats` fills as it goes. Allocates per geometry, once; nothing per frame.
 */
export function* bakePaintPanelSteps(
  root: THREE.Object3D, template: PanelTemplate, frames: PanelFrames, armor: object, stats: PanelBakeStats,
  authority: PanelAuthority | null = null,
): Generator<void, PanelBakeStats, void> {
  const model = armor as ArmorModel;
  // the cells the authority traces (sealed as it seals them)
  const cellsOf = {
    hull: tracedCollisionCells(model.collisionShells?.hull) ?? [], turret: tracedCollisionCells(model.collisionShells?.turret) ?? [],
  };
  const byPlate = zoneByPlateOf(template);
  const layers = layerPlatesOf(model);
  // the spaced parts' answers, by frame, cell and facing (one vehicle's bake)
  const behindCache = new Map<string, number>();
  const split = frameZonesOf(template);
  const barrel = !!frames.gun && Number.isFinite(template.barrelFrom) && template.barrelRadius > 0;
  const users = new Map<THREE.BufferGeometry, THREE.Mesh[]>();
  const farStands: THREE.Mesh[] = [];
  const farOwners = new Set<THREE.Object3D>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean };
    if (!mesh.isMesh || mesh.isBatchedMesh || Array.isArray(mesh.material) || !mesh.material) return;
    if (armorPaintMode(mesh.material) < 1 || !mesh.geometry?.getAttribute('position')) return;
    // (267) an instanced draw is never baked; gear (a suspension joint's bosses) is bare at every instance
    if (mesh.isInstancedMesh) {
      if (gearDraw(mesh) && !mesh.geometry.getAttribute(PANEL_ZONE_ATTRIBUTE)) {
        const count = mesh.geometry.getAttribute('position').count;
        mesh.geometry.setAttribute(PANEL_ZONE_ATTRIBUTE, new THREE.BufferAttribute(new Int8Array(count).fill(PANEL_BARE), 1, false));
        stats.gear += Math.floor((mesh.geometry.index ? mesh.geometry.index.count : count) / 3);
      }
      return;
    }
    // (267) a far-LOD stand-in (vehicles/farLod.ts) merges its owner's parts with no part's role: it takes, vertex by
    // vertex, what its sources baked (each of its vertices is one of theirs, in the owner's frame), after them
    if (mesh.userData.farLod && mesh.parent) { farStands.push(mesh); farOwners.add(mesh.parent); return; }
    const list = users.get(mesh.geometry);
    if (list) list.push(mesh); else users.set(mesh.geometry, [mesh]);
  });
  // (267) the far owners' sources' baked values, by owner, owner-frame position (0.1 mm) and normal band (the far
  // clustering's: each axis in five), the first of each as the clustering keeps it, and by position alone
  const nearValues = new Map<THREE.Object3D, Map<string, number>>();
  const ownerKey = (x: number, y: number, z: number): string => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const band = (value: number): number => Math.max(0, Math.min(4, Math.round((value + 1) * 2)));
  const bandKey = (n: THREE.Vector3): string => `|${band(n.x) * 25 + band(n.y) * 5 + band(n.z)}`;
  const recordNear = (mesh: THREE.Mesh, values: Int8Array): void => {
    if (!mesh.parent || !farOwners.has(mesh.parent)) return;
    let byPosition = nearValues.get(mesh.parent);
    if (!byPosition) nearValues.set(mesh.parent, byPosition = new Map());
    mesh.updateMatrix();
    _normalWorld.getNormalMatrix(mesh.matrix);
    const position = mesh.geometry.getAttribute('position'), normal = mesh.geometry.getAttribute('normal');
    for (let v = 0; v < position.count; v++) {
      _t.fromBufferAttribute(position, v).applyMatrix4(mesh.matrix);
      const key = ownerKey(_t.x, _t.y, _t.z);
      if (!byPosition.has(key)) byPosition.set(key, values[v]);
      if (!normal) continue;
      const banded = key + bandKey(_n.fromBufferAttribute(normal, v).applyMatrix3(_normalWorld).normalize());
      if (!byPosition.has(banded)) byPosition.set(banded, values[v]);
    }
  };
  const pose: PanelPose = { hullInv: new THREE.Matrix4(), turretInv: new THREE.Matrix4(), gunInv: new THREE.Matrix4() };
  // a tally of one cluster's votes by area (VOTE_LIVE .. the last zone), and the slots it touched
  const tally = new Float64Array(template.zones.length + 3);
  const touched: number[] = [];
  // (267) a split piece's zone set
  const members: number[] = [];
  let sliceStarted = performance.now(), sliceWork = 0, rayWork = 0;
  const yieldSlice = (): void => {
    const took = performance.now() - sliceStarted;
    stats.ms += took;
    stats.sliceMs = Math.max(stats.sliceMs, Math.round(took * 10) / 10);
    stats.slices++;
    sliceWork = 0;
  };
  const spend = (triangles: number): boolean => {
    sliceWork += triangles;
    if (sliceWork < SLICE_TRIANGLES) return false;
    yieldSlice();
    return true;
  };
  for (const [geometry, meshes] of users) {
    if (!geometry.getAttribute('position')) continue;
    stats.draws += meshes.length;
    const position = geometry.getAttribute('position');
    const was = bakedBy.get(geometry);
    if (was === armor || (was === null && geometry.getAttribute(PANEL_ZONE_ATTRIBUTE))) {
      // baked before (a copy of this spec): its values still stand for this vehicle's far stand-ins
      const done = geometry.getAttribute(PANEL_ZONE_ATTRIBUTE) as THREE.BufferAttribute | undefined;
      if (done?.array instanceof Int8Array) for (const mesh of meshes) recordNear(mesh, done.array);
      continue;
    }
    stats.geometries++;
    const values = new Int8Array(position.count);
    const sharedElsewhere = meshes.length > 1 || (was !== undefined && was !== armor);
    if (meshes.every(gearDraw)) {
      // (267) gear, wherever it is drawn: bare whole
      const triangles = Math.floor((geometry.index ? geometry.index.count : position.count) / 3);
      values.fill(PANEL_BARE);
      stats.triangles += triangles;
      stats.bare += triangles;
      stats.gear += triangles;
    } else if (sharedElsewhere) {
      stats.shared++;
      stats.perPoint += Math.floor((geometry.index ? geometry.index.count : position.count) / 3);
    } else {
      const mesh = meshes[0];
      // this geometry's pose: its frames and its own matrix, now
      mesh.updateWorldMatrix(true, false);
      frames.hull.updateWorldMatrix(true, false);
      frames.turret?.updateWorldMatrix(true, false);
      frames.gun?.updateWorldMatrix(true, false);
      frameInverse(frames.hull, pose.hullInv);
      if (frames.turret) frameInverse(frames.turret, pose.turretInv); else pose.turretInv.copy(pose.hullInv);
      if (frames.gun) frameInverse(frames.gun, pose.gunInv); else pose.gunInv.copy(pose.turretInv);
      const welding = clusters(geometry);
      let welded = welding.next();
      while (!welded.done) { yieldSlice(); yield; sliceStarted = performance.now(); welded = welding.next(); }
      const { parent, solid, canon, triangles, corner, indexed } = welded.value;
      stats.triangles += triangles;
      const mode = armorPaintMode(mesh.material as THREE.Material);
      const owner = ownerOf(mesh, frames);
      // (267) armour (its own and its add-on) is never air; every other part standing off it is judged
      const judgeStandoff = !armourDraw(mesh);
      const p = plain(position)!, n = plain(geometry.getAttribute('normal'));
      const m = mesh.matrixWorld.elements;
      _normalWorld.getNormalMatrix(mesh.matrixWorld);
      const q = _normalWorld.elements;
      // each triangle's world centre, normal and area, and its cluster
      const centres = new Float64Array(triangles * 3), normals = new Float64Array(triangles * 3), faces = new Float64Array(triangles * 3);
      const areas = new Float64Array(triangles);
      const roots = new Int32Array(triangles);
      for (let t = 0; t < triangles; t++) {
        const i0 = corner(t, 0) * 3, i1 = corner(t, 1) * 3, i2 = corner(t, 2) * 3;
        // the local centre and edges, then the world (the matrix is affine: a centre maps as a point, edges as vectors)
        const lx = (p[i0] + p[i1] + p[i2]) / 3, ly = (p[i0 + 1] + p[i1 + 1] + p[i2 + 1]) / 3, lz = (p[i0 + 2] + p[i1 + 2] + p[i2 + 2]) / 3;
        centres[t * 3] = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        centres[t * 3 + 1] = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        centres[t * 3 + 2] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        const bx = p[i1] - p[i0], by = p[i1 + 1] - p[i0 + 1], bz = p[i1 + 2] - p[i0 + 2];
        const cx = p[i2] - p[i0], cy = p[i2 + 1] - p[i0 + 1], cz = p[i2 + 2] - p[i0 + 2];
        _b.set(m[0] * bx + m[4] * by + m[8] * bz, m[1] * bx + m[5] * by + m[9] * bz, m[2] * bx + m[6] * by + m[10] * bz);
        _c.set(m[0] * cx + m[4] * cy + m[8] * cz, m[1] * cx + m[5] * cy + m[9] * cz, m[2] * cx + m[6] * cy + m[10] * cz);
        _normal.crossVectors(_b, _c);
        areas[t] = _normal.length() / 2;
        if (areas[t] > 0) { faces[t * 3] = _normal.x / (2 * areas[t]); faces[t * 3 + 1] = _normal.y / (2 * areas[t]); faces[t * 3 + 2] = _normal.z / (2 * areas[t]); }
        if (n) {
          const nx = n[i0] + n[i1] + n[i2], ny = n[i0 + 1] + n[i1 + 1] + n[i2 + 1], nz = n[i0 + 2] + n[i1 + 2] + n[i2 + 2];
          _normal.set(q[0] * nx + q[3] * ny + q[6] * nz, q[1] * nx + q[4] * ny + q[7] * nz, q[2] * nx + q[5] * ny + q[8] * nz);
        }
        const length = _normal.length();
        if (length > 1e-8) _normal.multiplyScalar(1 / length);
        normals[t * 3] = _normal.x; normals[t * 3 + 1] = _normal.y; normals[t * 3 + 2] = _normal.z;
        roots[t] = find(parent, t);
        if (spend(1)) { yield; sliceStarted = performance.now(); }
      }
      // the triangles in cluster order (a counting sort on the root triangle)
      const starts = new Int32Array(triangles + 1);
      for (let t = 0; t < triangles; t++) starts[roots[t] + 1]++;
      for (let v = 0; v < triangles; v++) starts[v + 1] += starts[v];
      const order = new Int32Array(triangles), fill = starts.slice(0, triangles);
      for (let t = 0; t < triangles; t++) order[fill[roots[t]]++] = t;
      // (264) each solid's largest face (its area-weighted centre and normal): a spaced solid takes the plate behind that
      // face on all its faces, so a pod, a drum or a box stays one part (the round-9 critic: boxes split face by face)
      const faceArea = new Float64Array(triangles), faceSum = new Float64Array(triangles * 6);
      for (let t = 0; t < triangles; t++) {
        const r = roots[t], a = areas[t];
        faceArea[r] += a;
        faceSum[r * 6] += centres[t * 3] * a; faceSum[r * 6 + 1] += centres[t * 3 + 1] * a; faceSum[r * 6 + 2] += centres[t * 3 + 2] * a;
        faceSum[r * 6 + 3] += normals[t * 3] * a; faceSum[r * 6 + 4] += normals[t * 3 + 1] * a; faceSum[r * 6 + 5] += normals[t * 3 + 2] * a;
      }
      const solidBest = new Map<number, number>(), solidArea = new Map<number, number>();
      const solidBox = new Map<number, Float64Array>();
      for (let t = 0; t < triangles; t++) {
        const s = find(solid, t);
        let box = solidBox.get(s);
        if (!box) solidBox.set(s, box = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]));
        for (let axis = 0; axis < 3; axis++) {
          const v = centres[t * 3 + axis];
          if (v < box[axis]) box[axis] = v;
          if (v > box[axis + 3]) box[axis + 3] = v;
        }
        if (roots[t] !== t) continue;
        solidArea.set(s, (solidArea.get(s) ?? 0) + faceArea[t]);
        const best = solidBest.get(s);
        if (best === undefined || faceArea[t] > faceArea[best]) solidBest.set(s, t);
      }
      const compact = (s: number): boolean => {
        const box = solidBox.get(s);
        return !!box && Math.hypot(box[3] - box[0], box[4] - box[1], box[5] - box[2]) <= SOLID_PART_M;
      };
      if (spend(triangles >> 3)) { yield; sliceStarted = performance.now(); }
      // the zone of the first main plate behind a part standing outside every cell of its frame, or BEHIND_VOTE
      const behindZone = (x: number, y: number, z: number, nx: number, ny: number, nz: number, area: number): number => {
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (!(length > 1e-9) || !authority) return BEHIND_VOTE;
        nx /= length; ny /= length; nz /= length;
        const local = _p.set(x, y, z).applyMatrix4(owner === 'hull' ? pose.hullInv : pose.turretInv);
        // inside a cell (its convex faces, not its bounds: a slice's box spans the air beside a sloped side): no standoff
        for (const cell of owner === 'hull' ? cellsOf.hull : cellsOf.turret) if (insideCell(cell, local)) return BEHIND_VOTE;
        const ln = _n.set(nx, ny, nz).transformDirection(owner === 'hull' ? pose.hullInv : pose.turretInv);
        const key = `${owner === 'hull' ? 'h' : 't'}${Math.round(local.x / STANDOFF_CELL_M)},${Math.round(local.y / STANDOFF_CELL_M)},${Math.round(local.z / STANDOFF_CELL_M)}`
          + `|${Math.round(ln.x * 2)},${Math.round(ln.y * 2)},${Math.round(ln.z * 2)}`;
        const known = behindCache.get(key);
        if (known !== undefined) return known;
        if (area < STANDOFF_MIN_M2) return BEHIND_VOTE;
        const zone = castBehind(x, y, z, nx, ny, nz);
        behindCache.set(key, zone);
        return zone;
      };
      // (267) where a world point stands: ON_ARMOUR within FLUSH_M of a cell of either frame, AT_LAYER within
      // LAYER_REACH_M of a layer plate (in the frame each rides), else OFF_ARMOUR
      const standing = (x: number, y: number, z: number): number => {
        const h = _t.set(x, y, z).applyMatrix4(pose.hullInv);
        if (cellGap(cellsOf.hull, h) <= FLUSH_M) return ON_ARMOUR;
        if (nearLayer(layers[0], h)) return AT_LAYER;
        const t = _t.set(x, y, z).applyMatrix4(pose.turretInv);
        if (cellGap(cellsOf.turret, t) <= FLUSH_M) return ON_ARMOUR;
        if (nearLayer(layers[1], t)) return AT_LAYER;
        return nearLayer(layers[2], _t.set(x, y, z).applyMatrix4(pose.gunInv)) ? AT_LAYER : OFF_ARMOUR;
      };
      // (267) a judged draw's parts standing off the armour: a cluster whose centre does, and a solid most of whose area
      // does (a cage, a net, a rack), bare whole; a compact solid any of whose clusters lies at a layer plate is that
      // layer (an ERA brick, a thick skirt section: the plate runs through it), painted whole
      let offCluster: Uint8Array | null = null;
      const solidOff = new Map<number, number>(), solidLayer = new Set<number>();
      if (judgeStandoff && authority && owner !== 'gun' && (cellsOf.hull.length || cellsOf.turret.length)) {
        offCluster = new Uint8Array(triangles);
        for (let t = 0; t < triangles; t++) {
          const a = faceArea[t];
          if (roots[t] !== t || !(a > 0)) continue;
          const where = standing(faceSum[t * 6] / a, faceSum[t * 6 + 1] / a, faceSum[t * 6 + 2] / a);
          const s = find(solid, t);
          if (where === OFF_ARMOUR) {
            offCluster[t] = 1;
            solidOff.set(s, (solidOff.get(s) ?? 0) + a);
          } else if (where === AT_LAYER) solidLayer.add(s);
          if (spend(2)) { yield; sliceStarted = performance.now(); }
        }
      }
      // the authority's own test (sim/armor.ts intersectConvexCell): the segment from outside the part to as far behind it,
      // against every cell of both frames, the plate of the face it enters first; that entry must lie behind the part
      const castBehind = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => {
        rayWork += STANDOFF_RAY_COST;
        stats.standoffRays++;
        let bestT = Infinity, bestPlate: { name?: string } | null = null;
        for (let frame = 0; frame < 2; frame++) {
          const cells = frame === 0 ? cellsOf.hull : cellsOf.turret;
          if (!cells.length) continue;
          const inv = frame === 0 ? pose.hullInv : pose.turretInv;
          const o = _from.set(x + nx * STANDOFF_REACH_M, y + ny * STANDOFF_REACH_M, z + nz * STANDOFF_REACH_M).applyMatrix4(inv);
          const d = _dir.set(x - nx * STANDOFF_REACH_M, y - ny * STANDOFF_REACH_M, z - nz * STANDOFF_REACH_M).applyMatrix4(inv).sub(o);
          for (const cell of cells) {
            const t = enterCell(cell, o, d);
            if (t >= 0 && t < bestT && _entryFace) {
              bestT = t;
              // (265) a face only partly over the gun: the piece the entry lies in, as the authority reads it
              const split = _entryFace.gunSplit;
              bestPlate = (split ? gunFaceSplitPlate(split, o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) : _entryFace.plate) as { name?: string };
            }
          }
        }
        // the part stands at the segment's middle: the plate must lie behind it, never in front of it
        if (!bestPlate || bestT < 0.5 - CELL_SLACK_M / (2 * STANDOFF_REACH_M)) return BEHIND_VOTE;
        return byPlate.get(String(bestPlate.name ?? '')) ?? BEHIND_VOTE;
      };
      const cast = (t: number, weight: number): void => {
        const slot = vote(template, split, pose, barrel, mode, owner, _centre.set(centres[t * 3], centres[t * 3 + 1], centres[t * 3 + 2]),
          _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2])) + 3;
        if (tally[slot] === 0) touched.push(slot);
        tally[slot] += weight;
        stats.votes++;
      };
      // a cluster with no majority, by part: a small one whole on its plurality (a dome, a hatch); a large one (a welded
      // casting) split at its creases, each piece voting on all its triangles and taking its majority, or its plurality
      // when it is small; a piece still split keeps the per-point score
      function* resolveParts(start: number, end: number, total: number): Generator<void, void, void> {
        const count = end - start;
        const tv = new Int16Array(count);
        for (let k = 0; k < count; k++) {
          const t = order[start + k];
          tv[k] = areas[t] > 0 ? vote(template, split, pose, barrel, mode, owner, _centre.set(centres[t * 3], centres[t * 3 + 1], centres[t * 3 + 2]),
            _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2])) : VOTE_NONE;
          if (spend(4)) { yield; sliceStarted = performance.now(); }
        }
        stats.votes += count;
        const part = new Int32Array(count);
        let parts = 1;
        if (total >= SMALL_PART_M2 && !indexed) {
          part.fill(-1);
          parts = 0;
          // the triangles across each welded edge, then the pieces a crease bounds
          const edges = new Map<number, number>(), across = new Int32Array(count * 3).fill(-1), span = position.count;
          for (let k = 0; k < count; k++) {
            const t = order[start + k];
            for (let e = 0; e < 3; e++) {
              const a = canon[corner(t, e)], b = canon[corner(t, (e + 1) % 3)];
              const key = a < b ? a * span + b : b * span + a;
              const other = edges.get(key);
              if (other === undefined) edges.set(key, k * 3 + e);
              else { across[k * 3 + e] = Math.floor(other / 3); across[other] = k; }
            }
          }
          const stack: number[] = [];
          for (let k = 0; k < count; k++) {
            if (part[k] >= 0) continue;
            part[k] = parts;
            stack.push(k);
            while (stack.length) {
              const j = stack.pop()!, tj = order[start + j] * 3;
              for (let e = 0; e < 3; e++) {
                const o = across[j * 3 + e];
                if (o < 0 || part[o] >= 0) continue;
                const to = order[start + o] * 3;
                if (faces[tj] * faces[to] + faces[tj + 1] * faces[to + 1] + faces[tj + 2] * faces[to + 2] < CREASE_DOT) continue;
                part[o] = parts;
                stack.push(o);
              }
            }
            parts++;
          }
        }
        // each piece in turn (a counting sort on its number), its area by vote
        const first = new Int32Array(parts + 1);
        for (let k = 0; k < count; k++) first[part[k] + 1]++;
        for (let k = 0; k < parts; k++) first[k + 1] += first[k];
        const inPart = new Int32Array(count), at = first.slice(0, parts);
        for (let k = 0; k < count; k++) inPart[at[part[k]]++] = k;
        for (let piece = 0; piece < parts; piece++) {
          touched.length = 0;
          let voted = 0;
          for (let i = first[piece]; i < first[piece + 1]; i++) {
            const k = inPart[i], area = areas[order[start + k]];
            if (!(area > 0)) continue;
            const slot = tv[k] + 3;
            if (tally[slot] === 0) touched.push(slot);
            tally[slot] += area;
            voted += area;
          }
          let top = VOTE_NONE, topArea = -1, setArea = 0, noneArea = 0;
          members.length = 0;
          for (const slot of touched) {
            const key = slot - 3, area = tally[slot];
            if (area > topArea || (area === topArea && key > top)) { top = key; topArea = area; }
            if (key >= 0 && area >= SET_MEMBER * voted) { members.push(key); setArea += area; }
            else if (key === VOTE_NONE) noneArea += area;
            tally[slot] = 0;
          }
          // a piece is never baked bare here: a collar round the bore whose barrel share wins keeps the per-point score,
          // which leaves only the barrel's cylinder bare (the round-5 critic: the ZTZ-99A's collar untinted)
          let value = voted > 0 && topArea >= (voted >= SMALL_PART_M2 ? LARGE_MAJORITY : PANEL_MAJORITY) * voted && top >= 0 && top < 127 ? top + 1 : 0;
          if (value === 0 && voted < SMALL_PART_M2 && top >= 0 && top < 127 && topArea >= PLURALITY * voted) value = top + 1;
          // (267) a piece split between a few zones keeps the per-point borders on its face, naming the zones: the paint
          // scores those alone; one no zone faces anywhere is bare
          if (value === 0 && voted > 0 && template.zoneSet && setArea + noneArea >= SET_SHARE * voted) {
            if (!members.length) value = PANEL_BARE;
            else if (members.length <= 4) {
              const set = template.zoneSet(members);
              if (set >= 0) { value = PANEL_BARE - 1 - set; stats.sets += first[piece + 1] - first[piece]; }
            }
          }
          const kept = first[piece + 1] - first[piece];
          if (value > 0 || value === PANEL_BARE) { if (parts > 1) stats.creaseParts++; else stats.wholeParts++; }
          if (value > 0) stats.baked += kept; else if (value === PANEL_BARE) stats.bare += kept;
          else {
            stats.perPoint += kept;
            if (top === VOTE_LIVE) stats.perPointLive += kept;
            else if (top === VOTE_NONE) stats.perPointNone += kept;
            else stats.perPointSplit += kept;
          }
          if (value === 0) continue;
          for (let i = first[piece]; i < first[piece + 1]; i++) {
            const t = order[start + inPart[i]];
            values[corner(t, 0)] = value; values[corner(t, 1)] = value; values[corner(t, 2)] = value;
          }
        }
      }
      // per cluster: a flat one votes once at its area-weighted centre, a curved one on an even stride of its triangles;
      // the largest vote wins if it holds PANEL_MAJORITY of the area voted
      for (let start = 0; start < triangles;) {
        const cluster = roots[order[start]];
        let end = start;
        while (end < triangles && roots[order[end]] === cluster) end++;
        if (offCluster) {
          const s = find(solid, cluster);
          if (!(solidLayer.has(s) && compact(s)) && (offCluster[cluster] || (solidOff.get(s) ?? 0) > 0.5 * (solidArea.get(s) ?? Infinity))) {
            for (let k = start; k < end; k++) {
              const t = order[k];
              values[corner(t, 0)] = PANEL_BARE; values[corner(t, 1)] = PANEL_BARE; values[corner(t, 2)] = PANEL_BARE;
            }
            stats.clusters++;
            stats.bare += end - start;
            stats.offArmour += end - start;
            const kept = end - start;
            start = end;
            if (spend(kept)) { yield; sliceStarted = performance.now(); }
            continue;
          }
        }
        const first = order[start];
        let flat = true, total = 0, cx = 0, cy = 0, cz = 0;
        for (let k = start; k < end; k++) {
          const t = order[k], area = areas[t];
          total += area;
          cx += centres[t * 3] * area; cy += centres[t * 3 + 1] * area; cz += centres[t * 3 + 2] * area;
          if (flat && normals[t * 3] * normals[first * 3] + normals[t * 3 + 1] * normals[first * 3 + 1]
            + normals[t * 3 + 2] * normals[first * 3 + 2] < FLAT_DOT) flat = false;
        }
        touched.length = 0;
        let voted = 0;
        const large = total >= SMALL_PART_M2;
        if (total > 0 && flat && end - start > FLAT_SAMPLED && !large) {
          const slot = vote(template, split, pose, barrel, mode, owner, _centre.set(cx / total, cy / total, cz / total),
            _normal.set(normals[first * 3], normals[first * 3 + 1], normals[first * 3 + 2])) + 3;
          touched.push(slot);
          tally[slot] = voted = total;
          stats.votes++;
        } else if (total > 0 && flat) {
          // a flat panel by its area: a small one (a box's face, a mantlet's front) on three points a triangle, halfway
          // from its centre to each corner, so the barrel's bare cylinder takes the face only if it covers most of it; a
          // large one on up to LARGE_FLAT_POINTS points a triangle, so a border two plates draw across it shows
          const stride = Math.max(1, Math.ceil((end - start) / MAX_VOTES));
          for (let k = start; k < end; k += stride) {
            const t = order[k];
            if (!(areas[t] > 0)) continue;
            const count = large ? Math.min(LARGE_FLAT_POINTS, Math.max(3, Math.ceil(areas[t] / LARGE_FLAT_POINT_M2))) : 3;
            const i0 = corner(t, 0) * 3, i1 = corner(t, 1) * 3, i2 = corner(t, 2) * 3;
            for (let c = 0; c < count; c++) {
              // points of a fixed low-discrepancy pattern over the triangle (count 3: halfway to each corner)
              let u: number, w: number;
              if (count === 3) { u = c === 0 ? 2 / 3 : 1 / 6; w = c === 1 ? 2 / 3 : 1 / 6; } else {
                u = (c + 0.5) / count; w = ((c * 0.618034) % 1);
                if (u + w > 1) { u = 1 - u; w = 1 - w; }
              }
              const lx = p[i0] + (p[i1] - p[i0]) * u + (p[i2] - p[i0]) * w;
              const ly = p[i0 + 1] + (p[i1 + 1] - p[i0 + 1]) * u + (p[i2 + 1] - p[i0 + 1]) * w;
              const lz = p[i0 + 2] + (p[i1 + 2] - p[i0 + 2]) * u + (p[i2 + 2] - p[i0 + 2]) * w;
              _centre.set(lx, ly, lz).applyMatrix4(mesh.matrixWorld);
              const slot = vote(template, split, pose, barrel, mode, owner, _centre,
                _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2])) + 3;
              if (tally[slot] === 0) touched.push(slot);
              tally[slot] += areas[t] / count;
              stats.votes++;
            }
            voted += areas[t];
          }
        } else if (total > 0) {
          const stride = Math.max(1, Math.ceil((end - start) / MAX_VOTES));
          for (let k = start; k < end; k += stride) { const t = order[k]; if (areas[t] > 0) { cast(t, areas[t]); voted += areas[t]; } }
        }
        let top = VOTE_NONE, topArea = -1;
        for (const slot of touched) {
          const key = slot - 3, area = tally[slot];
          if (area > topArea || (area === topArea && key > top)) { top = key; topArea = area; }
          tally[slot] = 0;
        }
        let value = voted > 0 && topArea >= (large ? LARGE_MAJORITY : PANEL_MAJORITY) * voted && top !== VOTE_LIVE && top !== VOTE_NONE && top < 127
          ? top === VOTE_BARE ? PANEL_BARE : top + 1 : 0;
        const kept = end - start;
        stats.clusters++;
        // (264, Main) a spaced or external part outside the cells (a skirt, a box, the hull's rubber, external armour)
        // takes the zone of the first main plate behind it, which the shell meets through it: one authority ray inward
        // along its normal. Gear the paint leaves bare stays bare; what rides the gun is the turret's armour already
        if (authority && value !== PANEL_BARE && top !== VOTE_LIVE && owner !== 'gun' && total > 0) {
          const s = find(solid, cluster), whole = compact(s), best = whole ? solidBest.get(s) ?? cluster : cluster, a = faceArea[best];
          if (a > 0) {
            const f = best * 6;
            const behind = behindZone(faceSum[f] / a, faceSum[f + 1] / a, faceSum[f + 2] / a, faceSum[f + 3], faceSum[f + 4], faceSum[f + 5],
              whole ? solidArea.get(s) ?? a : a);
            if (behind >= 0) { value = behind + 1; stats.standoff += kept; }
          }
        }
        if (value === 0 && voted > 0 && top !== VOTE_LIVE) {
          yield* resolveParts(start, end, total);
          start = end;
          continue;
        }
        if (value > 0) stats.baked += kept; else if (value === PANEL_BARE) stats.bare += kept;
        else {
          stats.perPoint += kept;
          if (top === VOTE_LIVE) stats.perPointLive += kept;
          else if (top === VOTE_NONE) stats.perPointNone += kept;
          else stats.perPointSplit += kept;
        }
        if (value !== 0) {
          for (let k = start; k < end; k++) {
            const t = order[k];
            values[corner(t, 0)] = value; values[corner(t, 1)] = value; values[corner(t, 2)] = value;
          }
        }
        start = end;
        const rays = rayWork;
        rayWork = 0;
        if (spend(rays + (flat ? kept * (kept > FLAT_SAMPLED ? 1 : 3) : Math.min(kept, MAX_VOTES) * 4))) { yield; sliceStarted = performance.now(); }
      }
      if (measureDisagreement) {
        for (let t = 0; t < triangles; t++) {
          const value = values[corner(t, 0)];
          if (!(areas[t] > 0)) continue;
          stats.paintedArea += areas[t];
          const zone = vote(template, split, pose, barrel, mode, owner, _centre.set(centres[t * 3], centres[t * 3 + 1], centres[t * 3 + 2]),
            _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2]), true);
          // every painted triangle, so both paints are scored on one population: the panel version shows its zone where
          // it bakes one, the per-point zone where it keeps the score, nothing where it is bare
          const shown = value > 0 ? value - 1 : value === 0 ? zone : -1;
          panelSink?.({
            x: centres[t * 3], y: centres[t * 3 + 1], z: centres[t * 3 + 2],
            nx: normals[t * 3], ny: normals[t * 3 + 1], nz: normals[t * 3 + 2],
            area: areas[t], part: `${mesh.name || mesh.parent?.name || 'mesh'}#${roots[t]}`,
            panel: shown >= 0 ? plateName(template.zones[shown]) : '', point: zone >= 0 ? plateName(template.zones[zone]) : null,
            panelTurret: shown >= template.hullZones, pointTurret: zone >= template.hullZones,
          });
          if (spend(4)) { yield; sliceStarted = performance.now(); }
          if (!(value > 0)) continue;
          stats.bakedArea += areas[t];
          if (zone !== value - 1) {
            stats.disagreeArea += areas[t];
            if (zone < 0) stats.disagreeBare += areas[t];
            else if ((zone >= template.hullZones) !== (value - 1 >= template.hullZones)) stats.disagreeFrame += areas[t];
            else stats.disagreeZone += areas[t];
          }
          if (spend(4)) { yield; sliceStarted = performance.now(); }
        }
      }
    }
    // into the attribute the build seeded (tankFactoryCore seedArmorPaintPanels), else a new one
    const seeded = geometry.getAttribute(PANEL_ZONE_ATTRIBUTE) as THREE.BufferAttribute | undefined;
    if (seeded && seeded.count === position.count && seeded.array instanceof Int8Array) {
      seeded.array.set(values);
      seeded.needsUpdate = true;
    } else geometry.setAttribute(PANEL_ZONE_ATTRIBUTE, new THREE.BufferAttribute(values, 1, false));
    bakedBy.set(geometry, sharedElsewhere ? null : armor);
    for (const mesh of meshes) recordNear(mesh, values);
  }
  // (267) the far stand-ins: each vertex its source's value (0, the per-point paint, where none matches)
  for (const stand of farStands) {
    const geometry = stand.geometry, position = geometry.getAttribute('position');
    const byPosition = nearValues.get(stand.parent!), normal = geometry.getAttribute('normal');
    const values = new Int8Array(position.count);
    stand.updateMatrix();
    _normalWorld.getNormalMatrix(stand.matrix);
    for (let v = 0; v < position.count; v++) {
      _t.fromBufferAttribute(position, v).applyMatrix4(stand.matrix);
      const key = ownerKey(_t.x, _t.y, _t.z);
      const banded = normal ? byPosition?.get(key + bandKey(_n.fromBufferAttribute(normal, v).applyMatrix3(_normalWorld).normalize())) : undefined;
      values[v] = banded ?? byPosition?.get(key) ?? 0;
    }
    const seeded = geometry.getAttribute(PANEL_ZONE_ATTRIBUTE) as THREE.BufferAttribute | undefined;
    if (seeded && seeded.count === position.count && seeded.array instanceof Int8Array) {
      seeded.array.set(values);
      seeded.needsUpdate = true;
    } else geometry.setAttribute(PANEL_ZONE_ATTRIBUTE, new THREE.BufferAttribute(values, 1, false));
    bakedBy.set(geometry, armor);
    stats.farStands++;
    if (spend(position.count >> 2)) { yield; sliceStarted = performance.now(); }
  }
  const took = performance.now() - sliceStarted;
  stats.sliceMs = Math.max(stats.sliceMs, Math.round(took * 10) / 10);
  stats.ms = Math.round((stats.ms + took) * 10) / 10;
  return stats;
}

/** An empty tally for bakePaintPanelSteps. */
export function panelBakeStats(): PanelBakeStats {
  return { draws: 0, geometries: 0, triangles: 0, baked: 0, bare: 0, perPoint: 0, shared: 0, standoff: 0, standoffRays: 0, gear: 0, offArmour: 0, sets: 0, farStands: 0, perPointSplit: 0, perPointLive: 0, perPointNone: 0, wholeParts: 0, creaseParts: 0, paintedArea: 0, bakedArea: 0, disagreeBare: 0, disagreeFrame: 0, disagreeZone: 0,
    disagreeArea: 0, clusters: 0, votes: 0, ms: 0, slices: 0, sliceMs: 0 };
}

/** The whole bake at once (tools and receipts). */
export function bakePaintPanels(root: THREE.Object3D, template: PanelTemplate, frames: PanelFrames, armor: object,
  authority: PanelAuthority | null = null): PanelBakeStats {
  const work = bakePaintPanelSteps(root, template, frames, armor, panelBakeStats(), authority);
  for (;;) { const next = work.next(); if (next.done) return next.value; }
}
