// WoT/Blitz-style scoped armor flashlight, painted on the vehicle itself (262). Every colour sample calls queryAimArmor
// + estimatePenRatio against the closed collision cells authoritative shell traces use, so it includes impact angle,
// normalization, ricochet, ERA, spaced armor, tracks and shell falloff. Scope state owns visibility; direct reticle
// contact only supplies the ordinary HUD marker.
//
// Owner, 2026-10-27: "make highlighting simpler and generalized ... check how camos apply ... that camo changes colour
// depending on where the tank part is". Until 262 the flashlight was a translucent shell drawn over the cells' outer
// skin: the cells are convex slices hulled from the mesh, so a glacis came out as triangle fans and tents, plates
// zigzagged along hull triangles, cracks between slices drew as stripes, and skirts and ERA hid it. Now it is paint, as
// camo is: the vehicle's own armour and fitting paint takes, per fragment, the colour of the armour zone it lies in
// (vehicles/materials.ts ARMOR_PAINT: the authored plate — glacis, lower plate, cheek, mantlet, side, roof, rear — it
// lies nearest, inside whose outline and facing its way; a forward surface over the mantlet's footprint, the mantlet),
// with straight zone borders. Only what is seen is painted.
// Each zone's colour is blended from a few samples on the cells' faces the authority gives that plate.
//
// The paint rides the burn hook every battle vehicle's materials carry from the warm (prewarmBurn): no program of its
// own, nothing to compile on the first scope. This runtime fills each scoped vehicle's zone table (one small float
// texture) and its frames.

import * as THREE from 'three';
import { queryAimArmor, tankPoseFromState } from '../sim/armor.ts';
import type { ArmorCollisionCell, ArmorModel, ArmorPoseState } from '../sim/armor.ts';
import { estimatePenRatio } from '../sim/damage.ts';
import type { AimArmorInfo, DamageShellSpec } from '../sim/damage.ts';
import { zonePlates } from '../sim/armorZones.ts';
import { ARMOR_PAINT_ZONE_EDGES, ARMOR_PAINT_ZONE_TEXELS } from '../vehicles/materials.ts';

const SAMPLE_INTERVAL_MS = 110;
const SAMPLE_BATCH_SIZE = 48;
const MAX_QUERY_M = 820;
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

const LOW = new THREE.Color(0xe53d35);
const MID = new THREE.Color(0xf0aa35);
const HIGH = new THREE.Color(0x48d985);
const _color = new THREE.Color();
const _world = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _frame = new THREE.Matrix4();
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

/** A spec's paint: its zones' table (planes and outlines; colours left blank), the turret envelope, the samples. */
interface PaintTemplate {
  readonly table: Float32Array;
  readonly hullZones: number;
  readonly turretZones: number;
  /** Mantlet footprints after the zones (a forward surface over one is its plate's). */
  readonly footprints: number;
  readonly turretMin: THREE.Vector3;
  readonly turretMax: THREE.Vector3;
  /** Each frame's cells' bounds, centre and half extents: their rounded box stands in for the cells' surface. */
  readonly hullCentre: THREE.Vector3;
  readonly turretCentre: THREE.Vector3;
  readonly hullHalf: THREE.Vector3;
  readonly turretHalf: THREE.Vector3;
  /** Gun-frame z where the bare barrel starts (just ahead of the turret's cells and its mantlet); NaN: no turret. */
  readonly barrelFrom: number;
  readonly samples: ZoneSamples[];
}

interface PanelBlend {
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
  sampleZone: number;
  samplePoint: number;
  blend: PanelBlend;
  nextSampleMs: number;
  lastShellSpec: DamageShellSpec | null;
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
  warm(): () => void;
  update(options: ArmorAimOverlayUpdateOptions): void;
  hide(): void;
  clear(): void;
  dispose(): void;
}

function penetrationColor(ratio: number, out: THREE.Color): THREE.Color | null {
  if (!Number.isFinite(ratio)) return null;
  if (ratio <= 0.72) return out.copy(LOW);
  if (ratio < 1) return out.copy(LOW).lerp(MID, (ratio - 0.72) / 0.28);
  if (ratio < 1.35) return out.copy(MID).lerp(HIGH, (ratio - 1) / 0.35);
  return out.copy(HIGH);
}

const sub = (a: readonly number[], b: readonly number[]): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const distance = (a: readonly number[], b: readonly number[]): number => {
  const d = sub(a, b);
  return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
};

/** A cell face as a sample candidate: its centroid, its area and its plate. */
interface FaceSite { centroid: number[]; area: number; plate: unknown }

/** The outward faces of a frame's cells (the slice caps two cells share are left out) as sample candidates. */
function faceSites(cells: readonly ArmorCollisionCell[] | undefined): FaceSite[] {
  const sites: FaceSite[] = [];
  for (const cell of cells || []) {
    for (const face of cell.faces) {
      if (face.internal || face.indices.length < 3) continue;
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

function buildTemplate(armor: ArmorOverlayModel): PaintTemplate | null {
  const hull = zonePlates(armor.hullPlates);
  const turretCells = armor.collisionShells?.turret || [];
  const turret = turretCells.length ? zonePlates(armor.turretPlates) : [];
  if (!hull.length && !turret.length) return null;
  const zones = [...hull, ...turret];
  const footprints = zones.filter((zone) => zone.footprint).length;
  const table = new Float32Array((zones.length * ARMOR_PAINT_ZONE_TEXELS + footprints * 2) * 4);
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
  return { table, hullZones: hull.length, turretZones: turret.length, footprints, turretMin, turretMax, hullCentre, turretCentre,
    hullHalf, turretHalf, barrelFrom, samples };
}

/** The world → combat-frame matrix of a rig group: its world matrix without its own scale (combat frames carry none). */
function frameInverse(group: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  _unscale.makeScale(1 / (group.scale.x || 1), 1 / (group.scale.y || 1), 1 / (group.scale.z || 1));
  return out.multiplyMatrices(group.matrixWorld, _unscale).invert();
}

function blendedRatio(blend: PanelBlend): number {
  if (blend.clearWeight > 0) return blend.clear / blend.clearWeight;
  if (blend.hiddenWeight > 0) return blend.hidden / blend.hiddenWeight;
  return NaN;
}

/**
 * @returns {{prime:Function,warm:Function,update:Function,hide:Function,clear:Function,dispose:Function}}
 */
export function createArmorAimOverlay(): ArmorAimOverlayRuntime {
  const entries = new Map<string, ArmorOverlayEntry>();
  const visibleEntries: ArmorOverlayEntry[] = [];
  let sampleCursor = 0;

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
      blend: { clear: 0, clearWeight: 0, hidden: 0, hiddenWeight: 0 },
      nextSampleMs: -Infinity,
      lastShellSpec: null,
    };
    entries.set(target.id, entry);
    return entry;
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

  function hide(): void {
    if (!visibleEntries.length) return;
    for (const entry of entries.values()) {
      setVisible(entry, false);
      entry.inScope = false;
      entry.sampling = false;
    }
    visibleEntries.length = 0;
  }

  function paintZone(entry: ArmorOverlayEntry, zone: number, ratio: number): void {
    const color = penetrationColor(ratio, _color);
    const at = (zone * ARMOR_PAINT_ZONE_TEXELS + ARMOR_PAINT_ZONE_TEXELS - 1) * 4;
    if (color) { entry.table[at] = color.r; entry.table[at + 1] = color.g; entry.table[at + 2] = color.b; entry.table[at + 3] = 1; }
    else entry.table[at + 3] = 0;
  }

  function sampleBatch(
    entry: ArmorOverlayEntry,
    shellSpec: DamageShellSpec | null | undefined,
    muzzle: THREE.Vector3 | null | undefined,
  ): boolean {
    const target = entry.target;
    const armor = target.spec?.armor;
    if (!target?.state || !target?.combat || !armor || !shellSpec || !muzzle) return true;
    const pose = tankPoseFromState(target.state, _pose);
    const zones = entry.template.samples;
    const blend = entry.blend;
    let remaining = SAMPLE_BATCH_SIZE;
    let painted = false;
    while (entry.sampleZone < zones.length && remaining > 0) {
      const zone = zones[entry.sampleZone];
      if (entry.samplePoint === 0) {
        blend.clear = 0; blend.clearWeight = 0; blend.hidden = 0; blend.hiddenWeight = 0;
      }
      const owner = zone.turret ? entry.paint.turret : entry.paint.hull;
      if (owner) {
        _frame.multiplyMatrices(owner.matrixWorld, _unscale.makeScale(1 / (owner.scale.x || 1), 1 / (owner.scale.y || 1), 1 / (owner.scale.z || 1)));
      }
      while (entry.samplePoint < zone.points.length && remaining > 0) {
        const k = entry.samplePoint++;
        remaining--;
        if (!owner) continue;
        _world.fromArray(zone.points[k]).applyMatrix4(_frame);
        _dir.copy(_world).sub(muzzle);
        const reach = _dir.length();
        if (!(reach > 0.05) || reach > MAX_QUERY_M) continue;
        _dir.multiplyScalar(1 / reach);
        const maxDist = Math.min(MAX_QUERY_M, reach + 0.3);
        const info = queryAimArmor(muzzle, _dir, maxDist, pose, armor, target.combat.eraSpent) as AimArmorInfo | null;
        if (!info) continue;
        const ratio = estimatePenRatio(shellSpec, info.distM, info);
        if (!Number.isFinite(ratio)) continue;
        // clear: the ray's first main armour is the sample's own face (within 12 cm of it); else it saw another first
        const last = info.layers[info.layers.length - 1];
        const weight = zone.weights[k];
        if (last && last.plate.kind === 'main' && last.t * maxDist < reach - 0.12) {
          blend.hidden += ratio * weight; blend.hiddenWeight += weight;
        } else {
          blend.clear += ratio * weight; blend.clearWeight += weight;
        }
      }
      if (entry.samplePoint < zone.points.length) break;
      paintZone(entry, entry.sampleZone, blendedRatio(blend));
      painted = true;
      entry.sampleZone++;
      entry.samplePoint = 0;
    }
    if (painted) entry.texture.needsUpdate = true;
    return entry.sampleZone >= zones.length;
  }

  function addScopedTarget(candidate: ArmorOverlayTarget | null | undefined): void {
    if (!candidate || candidate.combat?.destroyed || !candidate.visual?.root?.visible) return;
    const entry = prime(candidate);
    if (!entry) return;
    entry.inScope = true;
    if (!entry.visible) {
      entry.sampling = false;
      entry.nextSampleMs = -Infinity;
    }
    setVisible(entry, true);
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
    sampleNowMs: number,
  ): void {
    for (const entry of visibleEntries) {
      if (entry.lastShellSpec !== shellSpec) {
        entry.lastShellSpec = shellSpec ?? null;
        entry.nextSampleMs = -Infinity;
        entry.sampling = false;
      }
      if (entry.sampling || sampleNowMs < entry.nextSampleMs) continue;
      entry.sampling = true;
      entry.sampleZone = 0;
      entry.samplePoint = 0;
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
    if (!enabled || !scoped) {
      hide();
      return;
    }

    collectScopedTargets(targets, target);
    if (!visibleEntries.length) return;

    const sampleNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : 0;
    prepareScopedSamples(shellSpec, sampleNowMs);
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
  }

  function dispose(): void {
    clear();
  }

  return { prime, warm, update, hide, clear, dispose };
}
