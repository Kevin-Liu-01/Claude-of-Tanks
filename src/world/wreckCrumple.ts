// src/world/wreckCrumple.ts — a destroyed tank's metal, deformed (destruction core lane, 2026-10-09; the owner: "destroyed
// vehicles should be crumpled not just turn rusty").
//
// The wreck bake (wrecks.ts) posed the factory's settled wreck — the turret popped or unseated, the gun drooped — and
// painted it char and oxide, but every plate stayed factory-flat. This module plans, from the posed hierarchy and the
// wreck's seed, the damage a burnt-out hull carries, and deforms each part's geometry in its own frame as the bake
// collects it:
//   - the hull and the turret take impact dents (round craters pushed in along the face they struck), and an ammo-rack
//     wreck's deck bulges from the blast inside it;
//   - the fenders over the tracks sag in torn runs, and the skirt plates hang out from their top edge;
//   - one track goes slack: its upper run sags onto the road wheels;
//   - the gun barrel bends — down under its own weight in the fire, or any way on a turret the blast threw.
// Every deformation is a continuous field of position in the part's frame (hull frame = the tank's root; the turret
// and the gun their rig groups), so the corners the bake splits keep meeting, and normals follow the field through its
// Jacobian, so a dent is seen in the light, not just in the outline. Collision is untouched: the bake collects its
// solids from the posed hierarchy before this runs, and every displacement stays within a few tenths of a metre.
//
// Deterministic in (hierarchy, seed, pop) on its own random stream; no allocation per vertex.

import * as THREE from 'three';
import { planBend, planCreases, planDents, wreckRandom, type WreckBend, type WreckCrease, type WreckDent } from '../vehicles/wreckDents.ts';

type PartName = 'hull' | 'gear' | 'turret' | 'gun';

type Dent = WreckDent;
interface Bulge { cx: number; cy: number; cz: number; r2: number; amp: number }
interface Segment { zc: number; half: number; amp: number }
/** Fenders over one track: they sag (and bend out a little) where a segment runs. */
interface Droop { side: number; xIn: number; xOut: number; yMin: number; segments: Segment[] }
/** Skirt plates outboard of one track: they swing out about their top edge where a segment runs (amp in radians). */
interface Hinge { side: number; xMin: number; hingeY: number; segments: Segment[] }
/** One track's upper run, slack over a stretch. */
interface Sag { side: number; xIn: number; yUpper: number; segment: Segment; out: number }
type Bend = WreckBend;
/** A deck caved in by the fire: plates over yMin sink straight down, deepest at (cx, cz), to nothing at R. */
interface Cave { cx: number; cz: number; r2: number; amp: number; yMin: number }
/** A vehicle's roof pressed in over a stretch: deepest on the centre line, fading down the pillars to the belt line. */
interface RoofSag { hw: number; zc: number; half: number; sag: number; yBelt: number; yTop: number }
/** One end of a vehicle pushed in (s = +1 the nose, −1 the tail), its upper panels buckled up as it shortened. */
interface EndCrush { s: number; zFace: number; zone: number; amount: number; buckle: number; yLo: number; yHi: number }

interface PartPlan {
  /** Root space -> the part's frame, and back. */
  toFrame: THREE.Matrix4;
  fromFrame: THREE.Matrix4;
  dents: Dent[];
  bulges: Bulge[];
  droops: Droop[];
  hinges: Hinge[];
  sags: Sag[];
  bend: Bend | null;
  roofs: RoofSag[];
  ends: EndCrush[];
  creases: WreckCrease[];
  caves: Cave[];
}

export interface WreckCrumplePlan {
  readonly parts: Partial<Record<PartName, PartPlan>>;
  readonly partOf: (mesh: THREE.Object3D) => PartName;
}

function rigOf(object: THREE.Object3D, root: THREE.Object3D): THREE.Object3D | null {
  for (let n: THREE.Object3D | null = object; n && n !== root; n = n.parent) if (/^rig_/.test(n.name)) return n;
  return null;
}

function partOfMesh(mesh: THREE.Object3D, root: THREE.Object3D): PartName {
  for (let n: THREE.Object3D | null = mesh; n && n !== root; n = n.parent) {
    if (n.name === 'rig_gun' || n.name === 'rig_recoil' || n.name === 'rig_muzzle') return 'gun';
    if (n.name === 'rig_turret') return 'turret';
  }
  return /^gear/.test(mesh.name) ? 'gear' : 'hull';
}

/** A mesh's vertices in a frame, for sampling: positions and normals, or null. */
function frameSamples(mesh: THREE.Mesh, toFrame: THREE.Matrix4, rootInv: THREE.Matrix4): { p: number[]; n: number[] } | null {
  const position = mesh.geometry?.attributes?.position;
  const normal = mesh.geometry?.attributes?.normal;
  if (!position || !normal) return null;
  const m = new THREE.Matrix4().multiplyMatrices(toFrame, new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld));
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const p: number[] = [], n: number[] = [];
  // every 7th corner is plenty to find a surface point (and keeps the plan cheap)
  for (let i = 0; i < position.count; i += 7) {
    v.fromBufferAttribute(position, i).applyMatrix4(m);
    w.fromBufferAttribute(normal, i).applyMatrix3(nm).normalize();
    p.push(v.x, v.y, v.z); n.push(w.x, w.y, w.z);
  }
  return p.length ? { p, n } : null;
}

function frameBox(meshes: THREE.Mesh[], toFrame: THREE.Matrix4, rootInv: THREE.Matrix4): THREE.Box3 | null {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const m = new THREE.Matrix4();
  for (const mesh of meshes) {
    const g = mesh.geometry;
    if (!g?.attributes?.position) continue;
    if (!g.boundingBox) g.computeBoundingBox();
    m.multiplyMatrices(toFrame, new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld));
    box.union(tmp.copy(g.boundingBox!).applyMatrix4(m));
  }
  return box.isEmpty() ? null : box;
}

function segments(rng: () => number, n: number, z0: number, z1: number, halfMin: number, halfMax: number, ampMin: number,
  ampMax: number): Segment[] {
  const list: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const half = halfMin + (halfMax - halfMin) * rng();
    list.push({ zc: z0 + half + (z1 - z0 - 2 * half) * rng(), half, amp: ampMin + (ampMax - ampMin) * rng() });
  }
  return list;
}

/**
 * Plan a posed wreck's damage (wrecks.ts calls it right after setDestroyed). Null when the hierarchy has no rig (a
 * vehicle this module does not know): the bake then keeps its plates as they were.
 */
export function planWreckCrumple(root: THREE.Object3D, seed: number, pop: boolean): WreckCrumplePlan | null {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const rigs = new Map<string, THREE.Object3D>();
  const meshes: Record<PartName, THREE.Mesh[]> = { hull: [], gear: [], turret: [], gun: [] };
  const named = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    if (/^rig_/.test(o.name) && !rigs.has(o.name)) rigs.set(o.name, o);
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || !o.visible) return;
    meshes[partOfMesh(o, root)].push(o);
    const list = named.get(o.name) ?? [];
    list.push(o);
    named.set(o.name, list);
  });
  const hullRig = rigs.get('rig_hull');
  if (!hullRig) return null;
  const rng = wreckRandom((seed ^ 0x0c0ffee5) | 0);
  const frameOf = (rig: THREE.Object3D | undefined): { toFrame: THREE.Matrix4; fromFrame: THREE.Matrix4 } => {
    const fromFrame = rig ? new THREE.Matrix4().multiplyMatrices(rootInv, rig.matrixWorld) : new THREE.Matrix4();
    return { fromFrame, toFrame: fromFrame.clone().invert() };
  };
  const blank = (rig: THREE.Object3D | undefined): PartPlan => ({ ...frameOf(rig), dents: [], bulges: [], droops: [], hinges: [], sags: [],
    bend: null, roofs: [], ends: [], creases: [], caves: [] });
  const parts: Partial<Record<PartName, PartPlan>> = {};

  // ---- the hull: dents, the deck's bulge on an ammo-rack wreck, fenders and skirts over the tracks ----------------
  const hull = blank(hullRig);
  const hullMain = (named.get('hull') ?? meshes.hull).filter((m) => rigOf(m, root) === hullRig);
  const hullSamples = hullMain.length ? frameSamples(hullMain[0], hull.toFrame, rootInv) : null;
  const armor = named.get('hullExternalArmor')?.[0];
  const hullBox = frameBox(hullMain, hull.toFrame, rootInv);
  const hullMid = hullBox ? hullBox.getCenter(new THREE.Vector3()) : null;
  // (2026-10-09, after the first wave's frames: 8-20 cm dimples on a hull seen at 13 m read as shading, not damage) deeper,
  // wider dents and folded creases, the deck caved in by the fire or bulged by an ammo-rack blast, and on some the glacis
  // pushed in
  planDents(hullSamples, 6 + Math.floor(rng() * 4), 0.6, 1.25, 0.14, 0.3, rng, hull.dents, hullMid);
  if (armor) planDents(frameSamples(armor, hull.toFrame, rootInv), 2 + Math.floor(rng() * 3), 0.45, 0.9, 0.1, 0.22, rng, hull.dents, hullMid);
  planCreases(hullSamples, 3 + Math.floor(rng() * 3), 0.45, 1.0, 0.25, 0.5, 0.1, 0.22, rng, hull.creases, hullMid);
  if (hullBox) {
    const r = 0.38 * (hullBox.max.z - hullBox.min.z);
    const cz = (hullBox.min.z + hullBox.max.z) * 0.5 - 0.15 * (hullBox.max.z - hullBox.min.z) + (rng() - 0.5) * 0.8;
    // an ammo-rack blast bulges the deck out from inside; a burnt-out hull's deck caves straight down into it
    if (pop) hull.bulges.push({ cx: (rng() - 0.5) * 0.4, cy: hullBox.max.y - 0.35, cz, r2: r * r, amp: 0.14 + rng() * 0.1 });
    else hull.caves.push({ cx: (rng() - 0.5) * 0.4, cz, r2: r * r * 0.8, amp: -(0.2 + rng() * 0.18), yMin: hullBox.max.y - 0.75 });
    if (rng() < 0.5) {
      const height = hullBox.max.y - hullBox.min.y;
      hull.ends.push({ s: 1, zFace: hullBox.max.z, zone: 0.9 + rng() * 0.5, amount: 0.15 + rng() * 0.2, buckle: 0.06 + rng() * 0.08,
        yLo: hullBox.min.y + height * 0.35, yHi: hullBox.min.y + height * 0.75 });
    }
  }
  const bandL = named.get('gearTrackBandL')?.[0], bandR = named.get('gearTrackBandR')?.[0];
  const gear = blank(hullRig);
  for (const [band, side] of [[bandL, -1], [bandR, 1]] as const) {
    if (!band) continue;
    const box = frameBox([band], hull.toFrame, rootInv);
    if (!box) continue;
    const xIn = side < 0 ? -box.max.x : box.min.x, xOut = side < 0 ? -box.min.x : box.max.x;
    const top = box.max.y, z0 = box.min.z, z1 = box.max.z;
    // the fenders over it sag in one to three torn runs
    hull.droops.push({ side, xIn, xOut: xOut + 0.2, yMin: top - 0.12,
      segments: segments(rng, 1 + Math.floor(rng() * 3), z0, z1, 0.5, 1.2, 0.18, 0.45) });
    // the skirt plates outboard of it hang out from their top edge in one or two runs
    hull.hinges.push({ side, xMin: xOut - 0.1, hingeY: top + 0.22,
      segments: segments(rng, 1 + Math.floor(rng() * 2), z0, z1, 0.6, 1.4, 0.25, 0.6) });
  }
  // one track goes slack over a stretch: its upper run sags onto the road wheels (and on some hangs out)
  if (rng() < 0.9) {
    const band = rng() < 0.5 ? bandL : bandR;
    const side = band === bandL ? -1 : 1;
    const box = band ? frameBox([band], hull.toFrame, rootInv) : null;
    if (box) {
      const xIn = side < 0 ? -box.max.x : box.min.x;
      const sag = 0.22 + rng() * 0.2;
      gear.sags.push({ side, xIn, yUpper: box.max.y - 0.3, out: 0.08 + rng() * 0.22,
        segment: segments(rng, 1, box.min.z, box.max.z, 1.1, 2.0, sag, sag)[0] });
    }
  }
  parts.hull = hull;
  parts.gear = gear;

  // ---- the turret: dents ----------------------------------------------------------------------------------------
  const turretRig = rigs.get('rig_turret');
  if (turretRig) {
    const turret = blank(turretRig);
    const main = named.get('turret')?.find((m) => rigOf(m, root) === turretRig) ?? meshes.turret[0];
    const box = main ? frameBox([main], turret.toFrame, rootInv) : null;
    const middle = box ? box.getCenter(new THREE.Vector3()) : null;
    const samples = main ? frameSamples(main, turret.toFrame, rootInv) : null;
    planDents(samples, 4 + Math.floor(rng() * 3), 0.4, 0.9, 0.1, 0.24, rng, turret.dents, middle);
    planCreases(samples, 2 + Math.floor(rng() * 2), 0.35, 0.8, 0.2, 0.4, 0.08, 0.18, rng, turret.creases, middle);
    parts.turret = turret;
  }

  // ---- the gun: the barrel bends past a point along it -----------------------------------------------------------
  const gunRig = rigs.get('rig_gun');
  const barrel = named.get('gun')?.[0];
  if (gunRig && barrel) {
    const gun = blank(gunRig);
    const box = frameBox([barrel], gun.toFrame, rootInv);
    // down under its own weight in the fire, or any way on a turret the blast threw
    if (box) gun.bend = planBend(box.min.z, box.max.z, rng, pop);
    parts.gun = gun;
  }
  return { parts, partOf: (mesh) => partOfMesh(mesh, root) };
}

// ---- the field and its Jacobian ---------------------------------------------------------------------------------

const D = [0, 0, 0];
const J = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // row-major: J[r*3+c] = d(p + delta)_r / dp_c

function smooth(e0: number, e1: number, x: number): [number, number] {
  if (x <= e0) return [0, 0];
  if (x >= e1) return [1, 0];
  const t = (x - e0) / (e1 - e0);
  return [t * t * (3 - 2 * t), (6 * t * (1 - t)) / (e1 - e0)];
}

/** Σ amp·(1 − u²)², u = (z − zc)/half, and its z-derivative. */
function runs(list: Segment[], z: number): [number, number] {
  let v = 0, d = 0;
  for (const s of list) {
    const u = (z - s.zc) / s.half;
    if (u <= -1 || u >= 1) continue;
    const q = 1 - u * u;
    v += s.amp * q * q;
    d += s.amp * 2 * q * (-2 * u) / s.half;
  }
  return [v, d];
}

function evaluate(plan: PartPlan, x: number, y: number, z: number): boolean {
  D[0] = D[1] = D[2] = 0;
  J[0] = 1; J[1] = 0; J[2] = 0; J[3] = 0; J[4] = 1; J[5] = 0; J[6] = 0; J[7] = 0; J[8] = 1;
  let moved = false;
  for (const d of plan.dents) {
    const ex = x - d.cx, ey = y - d.cy, ez = z - d.cz;
    const r2 = ex * ex + ey * ey + ez * ez;
    if (r2 >= d.r2) continue;
    const q = 1 - r2 / d.r2, w = q * q * d.depth, g = (-4 * q / d.r2) * d.depth;
    D[0] += d.dx * w; D[1] += d.dy * w; D[2] += d.dz * w;
    J[0] += d.dx * g * ex; J[1] += d.dx * g * ey; J[2] += d.dx * g * ez;
    J[3] += d.dy * g * ex; J[4] += d.dy * g * ey; J[5] += d.dy * g * ez;
    J[6] += d.dz * g * ex; J[7] += d.dz * g * ey; J[8] += d.dz * g * ez;
    moved = true;
  }
  for (const b of plan.bulges) {
    const ex = x - b.cx, ey = y - b.cy, ez = z - b.cz;
    const r2 = ex * ex + ey * ey + ez * ez;
    if (r2 >= b.r2 || r2 < 1e-6) continue;
    // radial: amp·(1 − r²/R²)² along e/|e|, written e·f(r) with f = amp·q²/r; J = f·I + e ⊗ e·f'(r)/r
    const r = Math.sqrt(r2), q = 1 - r2 / b.r2, f = b.amp * q * q / r;
    const fr = b.amp * (-4 * q / b.r2 - q * q / r2) / r;
    D[0] += ex * f; D[1] += ey * f; D[2] += ez * f;
    J[0] += f + ex * fr * ex; J[1] += ex * fr * ey; J[2] += ex * fr * ez;
    J[3] += ey * fr * ex; J[4] += f + ey * fr * ey; J[5] += ey * fr * ez;
    J[6] += ez * fr * ex; J[7] += ez * fr * ey; J[8] += f + ez * fr * ez;
    moved = true;
  }
  for (const dr of plan.droops) {
    const sx = dr.side * x;
    if (sx <= dr.xIn || y <= dr.yMin) continue;
    const [h, dh] = runs(dr.segments, z);
    if (h === 0 && dh === 0) continue;
    const [gx, dgx] = smooth(dr.xIn, dr.xOut, sx), [gy, dgy] = smooth(dr.yMin, dr.yMin + 0.12, y);
    const k = h * gx * gy;
    if (k === 0 && dgx === 0) continue;
    // down, and out a little
    D[1] -= k; D[0] += dr.side * 0.35 * k;
    const dkx = h * dgx * dr.side * gy, dky = h * gx * dgy, dkz = dh * gx * gy;
    J[3] -= dkx; J[4] -= dky; J[5] -= dkz;
    J[0] += dr.side * 0.35 * dkx; J[1] += dr.side * 0.35 * dky; J[2] += dr.side * 0.35 * dkz;
    moved = true;
  }
  for (const hg of plan.hinges) {
    const sx = hg.side * x;
    if (sx <= hg.xMin - 0.06 || y >= hg.hingeY) continue;
    const [theta, dtheta] = runs(hg.segments, z);
    if (theta === 0 && dtheta === 0) continue;
    const [gx, dgx] = smooth(hg.xMin - 0.06, hg.xMin + 0.06, sx);
    const arm = hg.hingeY - y;
    // out about the top edge, and up as it swings (the plate's arc)
    const k = arm * theta * gx;
    D[0] += hg.side * k; D[1] += 0.5 * arm * theta * theta * gx;
    J[0] += hg.side * arm * theta * dgx * hg.side; J[1] += hg.side * (-theta * gx); J[2] += hg.side * arm * dtheta * gx;
    J[3] += 0.5 * arm * theta * theta * dgx * hg.side; J[4] += -0.5 * theta * theta * gx; J[5] += arm * theta * dtheta * gx;
    moved = true;
  }
  for (const sg of plan.sags) {
    const sx = sg.side * x;
    if (sx <= sg.xIn - 0.08 || y <= sg.yUpper) continue;
    const [h, dh] = runs([sg.segment], z);
    if (h === 0 && dh === 0) continue;
    const [gy, dgy] = smooth(sg.yUpper, sg.yUpper + 0.2, y);
    const k = h * gy, out = sg.out / Math.max(1e-6, sg.segment.amp);
    D[1] -= k; D[0] += sg.side * out * k;
    J[4] -= h * dgy; J[5] -= dh * gy;
    J[1] += sg.side * out * h * dgy; J[2] += sg.side * out * dh * gy;
    moved = true;
  }
  for (const rf of plan.roofs) {
    if (y <= rf.yBelt) continue;
    const ax = 1 - (x / rf.hw) * (x / rf.hw);
    if (ax <= 0) continue;
    const u = (z - rf.zc) / rf.half;
    if (u <= -1 || u >= 1) continue;
    const q = 1 - u * u, bz = q * q, dbz = 2 * q * (-2 * u) / rf.half;
    const [gy, dgy] = smooth(rf.yBelt, rf.yTop, y);
    D[1] -= rf.sag * ax * bz * gy;
    J[3] -= rf.sag * (-2 * x / (rf.hw * rf.hw)) * bz * gy; J[4] -= rf.sag * ax * bz * dgy; J[5] -= rf.sag * ax * dbz * gy;
    moved = true;
  }
  for (const en of plan.ends) {
    const u = en.s * (z - en.zFace) / en.zone + 1;
    if (u <= 0) continue;
    const uc = Math.min(1, u);
    const [w, dw] = smooth(0, 1, uc);
    // the buckle lifts a band between yLo and yHi (the bonnet, the glacis), never what stands above it (a roof)
    const midY = (en.yLo + en.yHi) * 0.5;
    const [up, dup] = smooth(en.yLo, midY, y), [down, ddown] = smooth(midY, en.yHi, y);
    const gy = up * (1 - down), dgy = dup * (1 - down) - up * ddown;
    const lift = en.buckle * 4 * uc * (1 - uc);
    D[2] -= en.s * en.amount * w; D[1] += lift * gy;
    J[8] -= en.amount * dw / en.zone;
    J[5] += en.buckle * 4 * (1 - 2 * uc) * (en.s / en.zone) * gy; J[4] += lift * dgy;
    moved = true;
  }
  for (const cv of plan.caves) {
    if (y <= cv.yMin) continue;
    const ex = x - cv.cx, ez = z - cv.cz, rho2 = ex * ex + ez * ez;
    if (rho2 >= cv.r2) continue;
    const q = 1 - rho2 / cv.r2;
    const [g, dg] = smooth(cv.yMin, cv.yMin + 0.3, y);
    const dy = cv.amp * q * q * g;
    D[1] += dy;
    const dq = cv.amp * 2 * q * g * (-2 / cv.r2);
    J[3] += dq * ex; J[5] += dq * ez; J[4] += cv.amp * q * q * dg;
    moved = true;
  }
  for (const cr of plan.creases) {
    const ex = x - cr.cx, ey = y - cr.cy, ez = z - cr.cz;
    const along = ex * cr.tx + ey * cr.ty + ez * cr.tz;
    const u = along / cr.half;
    if (u <= -1 || u >= 1) continue;
    const off = ex * cr.dx + ey * cr.dy + ez * cr.dz;
    if (off <= -0.6 || off >= 0.6) continue;
    // r: e in the plate, across the fold (e − along·t − off·d)
    const rx = ex - along * cr.tx - off * cr.dx, ry = ey - along * cr.ty - off * cr.dy, rz = ez - along * cr.tz - off * cr.dz;
    const across = Math.hypot(rx, ry, rz);
    if (across >= cr.w) continue;
    const fa = 1 - across / cr.w, q = 1 - u * u, fl = q * q, fd = 1 - Math.abs(off) / 0.6;
    const g = cr.depth * fa * fl * fd;
    D[0] += cr.dx * g; D[1] += cr.dy * g; D[2] += cr.dz * g;
    // ∇g = depth·(∇fa·fl·fd + fa·∇fl·fd + fa·fl·∇fd); ∇fa = −r̂/w, ∇fl = 2q(−2u)/half·t, ∇fd = −sign(off)/0.6·d
    const inv = across > 1e-6 ? 1 / across : 0;
    const ka = -cr.depth * fl * fd / cr.w * inv, kl = cr.depth * fa * fd * (2 * q * (-2 * u) / cr.half);
    const kd = -cr.depth * fa * fl * Math.sign(off) / 0.6;
    const gx = ka * rx + kl * cr.tx + kd * cr.dx, gy = ka * ry + kl * cr.ty + kd * cr.dy, gz = ka * rz + kl * cr.tz + kd * cr.dz;
    J[0] += cr.dx * gx; J[1] += cr.dx * gy; J[2] += cr.dx * gz;
    J[3] += cr.dy * gx; J[4] += cr.dy * gy; J[5] += cr.dy * gz;
    J[6] += cr.dz * gx; J[7] += cr.dz * gy; J[8] += cr.dz * gz;
    moved = true;
  }
  const b = plan.bend;
  if (b && z > b.z0) {
    const t = z - b.z0, v = b.kappa * t * t, dv = 2 * b.kappa * t;
    D[0] += b.ux * v; D[1] += b.uy * v;
    J[2] += b.ux * dv; J[5] += b.uy * dv;
    moved = true;
  }
  return moved;
}

/**
 * Give a plate corners to bend (2026-10-09, after the first frames: a hull is built of boxes, a plate of four corners has
 * nothing to dent in its middle, and a dent centred on a corner only tilted the plate): split every triangle edge longer
 * than `maxEdge` at its midpoint until none is — the split point is the edge's alone, so two triangles that share an edge
 * split it alike and the refined surface stays closed under the field. Every attribute is interpolated. Non-indexed out;
 * the input is left as it was. Only a part with features is refined (a part the plan leaves alone keeps its triangles).
 */
export function refineForCrumple(plan: WreckCrumplePlan | null, geometry: THREE.BufferGeometry, mesh: THREE.Object3D,
  maxEdge = 0.4): THREE.BufferGeometry {
  if (!plan || /InteriorFill/.test(mesh.name)) return geometry;
  // the budget (a map draws its hulks in one mesh): the armour shell and the gun take most, the tracks some, the dressing
  // little — a wreck grows by about a sixth
  const maxTriangles = /^(hull|turret|hullExternalArmor|turretExternalArmor|gun|gunMount)$/.test(mesh.name) ? 2500
    : /^gearTrackBand/.test(mesh.name) ? 900 : 400;
  const part = plan.parts[plan.partOf(mesh)];
  if (!part) return geometry;
  // where the field acts, in the part's frame: a sphere per feature (a triangle outside them all keeps its corners; the
  // field is nil at their rims, so the refined patch meets its unrefined neighbours without a gap)
  const spheres: number[] = [];
  const sphere = (x: number, y: number, z: number, r: number) => { spheres.push(x, y, z, r + maxEdge); };
  for (const d of part.dents) sphere(d.cx, d.cy, d.cz, Math.sqrt(d.r2));
  for (const c of part.creases) sphere(c.cx, c.cy, c.cz, Math.max(c.half, c.w));
  for (const b of part.bulges) sphere(b.cx, b.cy, b.cz, Math.sqrt(b.r2));
  for (const cv of part.caves) sphere(cv.cx, cv.yMin + 0.4, cv.cz, Math.sqrt(cv.r2));
  for (const dr of part.droops) for (const sg of dr.segments) sphere(dr.side * (dr.xIn + dr.xOut) * 0.5, dr.yMin + 0.2, sg.zc, sg.half + (dr.xOut - dr.xIn));
  for (const hg of part.hinges) for (const sg of hg.segments) sphere(hg.side * (hg.xMin + 0.3), hg.hingeY - 0.5, sg.zc, sg.half + 0.8);
  for (const sa of part.sags) sphere(sa.side * (sa.xIn + 0.3), sa.yUpper + 0.2, sa.segment.zc, sa.segment.half + 0.6);
  const refineAll = !!part.bend || part.ends.length > 0 || part.roofs.length > 0;
  if (!spheres.length && !refineAll) return geometry;
  const toFrame = part.toFrame.elements;
  const near = (cx: number, cy: number, cz: number, r: number): boolean => {
    if (refineAll) return true;
    const x = toFrame[0] * cx + toFrame[4] * cy + toFrame[8] * cz + toFrame[12];
    const y = toFrame[1] * cx + toFrame[5] * cy + toFrame[9] * cz + toFrame[13];
    const z = toFrame[2] * cx + toFrame[6] * cy + toFrame[10] * cz + toFrame[14];
    for (let i = 0; i < spheres.length; i += 4) {
      const dx = x - spheres[i], dy = y - spheres[i + 1], dz = z - spheres[i + 2], rr = r + spheres[i + 3];
      if (dx * dx + dy * dy + dz * dz < rr * rr) return true;
    }
    return false;
  };
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.attributes.position as THREE.BufferAttribute;
  const names = Object.keys(source.attributes).filter((n) => !(source.attributes[n] as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute);
  const sizes = names.map((n) => (source.attributes[n] as THREE.BufferAttribute).itemSize);
  const stride = sizes.reduce((a, b) => a + b, 0);
  const posOffset = names.indexOf('position') >= 0 ? sizes.slice(0, names.indexOf('position')).reduce((a, b) => a + b, 0) : 0;
  const max2 = maxEdge * maxEdge;
  const vertices = position.count;
  // every vertex's attributes, interleaved (one pass), and the output grown in place
  const src = new Float64Array(vertices * stride);
  for (let k = 0, o = 0; k < names.length; o += sizes[k], k++) {
    const array = (source.attributes[names[k]] as THREE.BufferAttribute).array, size = sizes[k];
    for (let i = 0; i < vertices; i++) for (let c = 0; c < size; c++) src[i * stride + o + c] = array[i * size + c] as number;
  }
  let out = new Float64Array(Math.max(stride * 3, src.length + stride * 3 * 64)), used = 0;
  const emit = (tri: Float64Array) => {
    if (used + tri.length > out.length) { const grown = new Float64Array(out.length * 2); grown.set(out.subarray(0, used)); out = grown; }
    out.set(tri, used); used += tri.length;
  };
  const triangles = vertices / 3;
  let made = 0;
  const p = posOffset, s3 = stride * 3;
  const stack: Float64Array[] = [];
  for (let t = 0; t < triangles; t++) {
    stack.push(src.slice(t * s3, t * s3 + s3));
    while (stack.length) {
      const tri = stack.pop()!;
      const ax = tri[p], ay = tri[p + 1], az = tri[p + 2];
      const bx = tri[stride + p], by = tri[stride + p + 1], bz = tri[stride + p + 2];
      const cx = tri[2 * stride + p], cy = tri[2 * stride + p + 1], cz = tri[2 * stride + p + 2];
      const ab = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
      const bc = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2;
      const ca = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2;
      const longest = Math.max(ab, bc, ca);
      if (longest <= max2 || made >= maxTriangles
        || !near((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, Math.sqrt(longest) * 0.6)) { emit(tri); continue; }
      made++;
      // bisect the longest edge (ties in a fixed order, so a shared edge is split the same way from both sides)
      const e = ab === longest ? 0 : bc === longest ? 1 : 2;
      const i0 = e, i1 = (e + 1) % 3, i2 = (e + 2) % 3;
      const m = new Float64Array(stride);
      for (let c = 0; c < stride; c++) m[c] = (tri[i0 * stride + c] + tri[i1 * stride + c]) * 0.5;
      const first = new Float64Array(s3), second = new Float64Array(s3);
      // first: (v[i0], m, v[i2]); second: (m, v[i1], v[i2]) — the winding kept
      const put = (dst: Float64Array, slot: number, from: Float64Array, at: number) => { dst.set(from.subarray(at * stride, at * stride + stride), slot * stride); };
      const order = [i0, i1, i2];
      // keep the original winding: write the triangles in the order the source's corners run
      for (let slot = 0; slot < 3; slot++) {
        const v = order.indexOf(slot);
        if (slot === i1) first.set(m, slot * stride); else put(first, slot, tri, slot);
        if (slot === i0) second.set(m, slot * stride); else put(second, slot, tri, slot);
        void v;
      }
      stack.push(first, second);
    }
  }
  if (!made) { if (source !== geometry) source.dispose(); return geometry; }
  const count = used / stride;
  const refined = new THREE.BufferGeometry();
  for (let k = 0, o = 0; k < names.length; o += sizes[k], k++) {
    const attr = source.attributes[names[k]] as THREE.BufferAttribute, size = sizes[k];
    const Ctor = (attr.array as Float32Array).constructor as new (n: number) => Float32Array;
    const array = new Ctor(count * size);
    for (let i = 0; i < count; i++) for (let c = 0; c < size; c++) array[i * size + c] = out[i * stride + o + c];
    refined.setAttribute(names[k], new THREE.BufferAttribute(array, size, attr.normalized));
  }
  refined.userData = { ...geometry.userData };
  if (source !== geometry) source.dispose();
  return refined;
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _to3 = new THREE.Matrix3();
const _from3 = new THREE.Matrix3();

/**
 * Deform one collected geometry (already in the wreck root's space) by its part's plan: positions through the field,
 * normals through the field's cofactor (the inverse transpose, unnormalised). `mesh` names the part.
 */
export function crumpleWreckGeometry(plan: WreckCrumplePlan | null, geometry: THREE.BufferGeometry, mesh: THREE.Object3D): void {
  if (!plan) return;
  const part = plan.parts[plan.partOf(mesh)];
  if (part) applyPart(part, geometry);
}

function applyPart(part: PartPlan, geometry: THREE.BufferGeometry): void {
  if (!part.dents.length && !part.bulges.length && !part.droops.length && !part.hinges.length && !part.sags.length && !part.bend
    && !part.roofs.length && !part.ends.length && !part.creases.length && !part.caves.length) return;
  const position = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!position) return;
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  _to3.setFromMatrix4(part.toFrame);
  _from3.setFromMatrix4(part.fromFrame);
  for (let i = 0; i < position.count; i++) {
    _v.fromBufferAttribute(position, i).applyMatrix4(part.toFrame);
    if (!evaluate(part, _v.x, _v.y, _v.z)) continue;
    _v.set(_v.x + D[0], _v.y + D[1], _v.z + D[2]).applyMatrix4(part.fromFrame);
    position.setXYZ(i, _v.x, _v.y, _v.z);
    if (!normal) continue;
    _n.fromBufferAttribute(normal, i).applyMatrix3(_to3);
    // cofactor of J (row-major) applied to n: the normal transform of the deformation
    const a = J[0], bb = J[1], c = J[2], d = J[3], e = J[4], f = J[5], g = J[6], h = J[7], k = J[8];
    const nx = (e * k - f * h) * _n.x + (f * g - d * k) * _n.y + (d * h - e * g) * _n.z;
    const ny = (c * h - bb * k) * _n.x + (a * k - c * g) * _n.y + (bb * g - a * h) * _n.z;
    const nz = (bb * f - c * e) * _n.x + (c * d - a * f) * _n.y + (a * e - bb * d) * _n.z;
    _n.set(nx, ny, nz).applyMatrix3(_from3).normalize();
    normal.setXYZ(i, _n.x, _n.y, _n.z);
  }
  position.needsUpdate = true;
  if (normal) normal.needsUpdate = true;
}

/**
 * A burnt-out map vehicle's body deformed (civilianVehicleKit.ts, the burnt build; +Z the nose, the lowest tyre on
 * y = 0): the roof pressed in over the cabin, dents along the flanks and ends, and on some one end pushed in with its
 * bonnet or tail buckled up. In the geometry's own frame, deterministic in the seed; the role's collision comes from its
 * intact coarse build and does not move.
 */
export function crumpleBurntVehicle(geometry: THREE.BufferGeometry, seed: number): void {
  const position = geometry.attributes.position as THREE.BufferAttribute | undefined;
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  if (!position || !normal) return;
  geometry.computeBoundingBox();
  const b = (geometry.userData.bodyBox as THREE.Box3 | undefined) ?? geometry.boundingBox!;
  const rng = wreckRandom((seed ^ 0x5ca7ab1e) | 0);
  const identity = new THREE.Matrix4();
  const part: PartPlan = { toFrame: identity, fromFrame: identity, dents: [], bulges: [], droops: [], hinges: [], sags: [], bend: null,
    roofs: [], ends: [], creases: [], caves: [] };
  const top = geometry.boundingBox!.max.y, hw = Math.max(-b.min.x, b.max.x), length = b.max.z - b.min.z;
  // the roof, pressed in over the cabin (once or twice along it)
  const roofs = 1 + (rng() < 0.4 ? 1 : 0);
  for (let i = 0; i < roofs; i++) {
    const half = (0.55 + rng() * 0.6) * Math.max(0.6, length / 4.2);
    part.roofs.push({ hw: hw * 1.05, zc: b.min.z + half * 0.6 + (length - half * 1.2) * rng(), half,
      sag: (0.18 + rng() * 0.22) * Math.max(0.7, top / 1.5), yBelt: top * 0.55, yTop: top });
  }
  // dents on the flanks and the ends
  const samples: { p: number[]; n: number[] } = { p: [], n: [] };
  for (let i = 0; i < position.count; i += 5) {
    samples.p.push(position.getX(i), position.getY(i), position.getZ(i));
    samples.n.push(normal.getX(i), normal.getY(i), normal.getZ(i));
  }
  planDents(samples, 4 + Math.floor(rng() * 4), 0.35, 0.7, 0.08, 0.2, rng, part.dents, b.getCenter(new THREE.Vector3()), true);
  // off the wheels: a dent's centre on the body, above the tyres
  part.dents = part.dents.filter((d) => d.cy > 0.45);
  // one end pushed in on some
  if (rng() < 0.6) {
    const s = rng() < 0.6 ? 1 : -1;
    part.ends.push({ s, zFace: s > 0 ? b.max.z : b.min.z, zone: 0.7 + rng() * 0.4, amount: 0.2 + rng() * 0.25,
      buckle: 0.05 + rng() * 0.07, yLo: top * 0.35, yHi: top * 0.6 });
  }
  const before = geometry.boundingBox!.max.y;
  applyPart(part, geometry);
  geometry.computeBoundingBox();
  // never taller than it stood (a role's height allowance is the intact build's)
  const after = geometry.boundingBox!.max.y;
  if (after > before + 1e-6) {
    const k = before / after;
    for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) * k);
    position.needsUpdate = true;
    geometry.computeBoundingBox();
  }
  geometry.computeBoundingSphere();
}
