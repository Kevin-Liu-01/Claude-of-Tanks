// Turret floor over the hull deck (turret-deck-gate-274). On the Leopard 2 prototype rebuild the owner saw a "turret looks
// like its glitching into hull": the turret's floor stood on the deck plane round its ring (the two z-fought as it
// turned), and forward fender bins taller than the turret's foot hid the ring from the side. No invariant tied the turret's
// floor to the deck under its ring: the geometry gate counts triangles, coplanarDepth.ts orders coplanar ties without
// flagging them, and the seat (turretSeatRace.ts) lifts the turret's surfaces outside the race only to within its own rise.
//
// For every turreted tank (rig_turret with a published ring receipt, combatAnatomyCalibration(id).turretRing), in the
// rig_hull frame on a 2.5 cm plan grid round the ring's axis:
//  (a) deck clearance, at YAWS turret bearings, round the turret's base (within the receipt's footR + BASE_MARGIN_M of
//      the ring's axis; a bustle or rack further out sweeping over engine-deck kit is reported apart, as `overhang`, and
//      never fails): past the race's rim, wherever the turret (rig_gun and the seat collar left out) lies over the hull, its lowest surface (faces, and edges sampled every cm) stands at least DECK_CLEAR_M over
//      the hull's highest top in that cell. Inside the rim the turret's floor may lie anywhere when the seat collar walls
//      it in (the basket hangs in the hull, out of sight); without a collar, no near-horizontal turret face and no edge
//      lying along the deck may stand within DECK_CLEAR_M over its top or less than ON_DECK_BURY_M under it. A patch
//      fails only where it reaches the turret's foot band (within FOOT_EDGE_M of the outermost low turret surface on its
//      bearing, at that yaw), where the eye meets it; one wholly under the turret's body (a hull plinth inside the shell,
//      a part hanging into the hull) is reported apart, as `hidden`, and never fails.
//  (b) props round the foot, at rest: per bearing the turret's foot is its outermost low surface (within FOOT_BAND_M of
//      the deck), its foot height the lowest turret surface within FOOT_EDGE_M of that edge that stands over the hull's
//      top (a floor buried in the hull just inside the wall is out of sight); no hull top the turret does
//      not cover, within PROP_MARGIN_M outside the foot, stands more than PROP_RISE_M over the foot.
// A failing cell counts only in an 8-connected patch of at least MIN_CELLS cells (a stray sliver is not a face). The fleet
// gate (fleetPassDefault, 274) fails (a), (b) past a hull's named exemption (ringZoneGuard.ts RING_ZONE_EXEMPT), and a
// recorded seat shortfall (turretSeatRace.ts: a foot the seat could not bring onto its plane), and names the ring-zone
// guard's parts in each row. Reads only: the yaw sweep restores the turret's quaternion and world matrices before it returns.
import * as THREE from 'three';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';
import { RING_ZONE_EXEMPT } from './ringZoneGuard.ts';

/** (a) The least clearance of the turret's lowest surface over the hull's top (m): out of the z-fight range, under the
 *  seat's 3 cm gap (turretSeatPlane.ts TURRET_SEAT_GAP_M) less the seat's 2 cm shortfall tolerance (turretSeatRace.ts
 *  SEAT_SHORT_TOL_M; coordinator ruling, 274: the gate at 1 cm). */
export const DECK_CLEAR_M = 0.01;
/** (a) inside the rim without a collar: a face further under the deck's top than this is in the hull, out of sight (m). */
export const ON_DECK_BURY_M = 0.06;
/** (b) How far outside the turret's foot a hull prop is read (m), and how far over the foot it may stand (m). */
export const PROP_MARGIN_M = 0.30;
export const PROP_RISE_M = 0.02;
export const YAWS = 16;
/** (a) The base zone reaches this far past the receipt's footR (the turret base's inscribed reach over the deck) (m). */
export const BASE_MARGIN_M = 0.25;
const FOOT_BAND_M = 0.35;
const FOOT_EDGE_M = 0.10;
/** (b) A turret surface further under the hull's top than this is inside the hull, not the visible foot (m). */
const VISIBLE_TOL_M = 0.005;
const MIN_CELLS = 4;
const CELL = 0.025;
const BEARINGS = 96;
/** A cell any part of which lies within this of the race's rim belongs to the rim (m): the pad plus half the cell's
 *  diagonal, so a skirt hugging the rim (the Leopard 2A5M's, 1 mm out and 3 cm into the ring well) stays with the rim. */
const RIM_PAD_M = 0.01 + CELL * Math.SQRT1_2;
const COLLAR_NAME = 'turretSeatCollar';
/** Casemate and turretless designs: a rig_turret (a fixed superstructure, a pivot for the sim) but no ring on a deck, so
 *  no ring receipt and nothing to judge (coordinator, 274). Any other turreted tank without a receipt fails the audit. */
export const NO_TURRET_IDS = Object.freeze(['jpz_e100', 'strv103a', 'strv103b', 't95', 'udes03']);

function measurable(object) {
  if (!object.isMesh || object.isBatchedMesh || object.name === COLLAR_NAME) return false;
  const data = object.userData;
  if (data.interiorFill || data.authoredShadowProxy || data.vehicleMarking || data.turretRingPlate || data.turretSeatRace) return false;
  if (/_ghillie_/.test(object.name)) return false;
  if (!object.geometry?.getAttribute('position')) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((m) => !!m && m.visible !== false && m.colorWrite !== false
    && !(m.transparent && (m.opacity ?? 1) < 0.98) && !(m.alphaTest > 0));
}

function labelOf(object, stop) {
  const names = [];
  for (let at = object; at && at !== stop; at = at.parent) if (at.name) names.push(at.name);
  return names.reverse().join('/') || object.type;
}

const _m = new THREE.Matrix4(), _i = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(),
  _c = new THREE.Vector3(), _box = new THREE.Box3();

/** Every visible measurable mesh under owner (first LOD level, not under skip), each instance of an instanced mesh, that
 *  reaches the region, with its matrix to the hull frame: visit(mesh, matrix, label). */
function eachMesh(owner, hullInverse, skip, region, visit) {
  const stack = [owner];
  while (stack.length) {
    const object = stack.pop();
    if (object === skip || object.visible === false) continue;
    if (measurable(object)) {
      const label = labelOf(object, owner);
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.isInstancedMesh) {
        for (let k = 0; k < object.count; k++) {
          object.getMatrixAt(k, _i);
          _m.multiplyMatrices(hullInverse, object.matrixWorld).multiply(_i);
          if (_box.copy(object.geometry.boundingBox).applyMatrix4(_m).intersectsBox(region)) visit(object, _m, `${label}#${k}`);
        }
      } else {
        _m.multiplyMatrices(hullInverse, object.matrixWorld);
        if (_box.copy(object.geometry.boundingBox).applyMatrix4(_m).intersectsBox(region)) visit(object, _m, label);
      }
    }
    if (object.isLOD && object.levels?.length) { stack.push(object.levels[0].object); continue; }
    for (let i = object.children.length - 1; i >= 0; i--) stack.push(object.children[i]);
  }
}

function eachTriangle(mesh, matrix, visit) {
  const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  const start = mesh.geometry.drawRange?.start ?? 0;
  const count = Math.min(index ? index.count : position.count, start + (mesh.geometry.drawRange?.count ?? Infinity));
  const flip = matrix.determinant() < 0;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const twoSided = material?.side === THREE.DoubleSide;
  for (let k = start; k + 2 < count; k += 3) {
    _a.fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(matrix);
    _b.fromBufferAttribute(position, index ? index.getX(k + 1) : k + 1).applyMatrix4(matrix);
    _c.fromBufferAttribute(position, index ? index.getX(k + 2) : k + 2).applyMatrix4(matrix);
    visit(_a, _b, _c, flip, twoSided);
  }
}

/** The plan grid round the ring's axis, the hull's highest up-facing top per cell, and a raster for the turret. */
function hullGrid(hullRig, turretRig, receipt) {
  const hullInverse = hullRig.matrixWorld.clone().invert();
  const [sx, , sz] = receipt.seat;
  const deckY = receipt.deckY, rimR = receipt.rimR;
  const half = Math.max(1.2, (receipt.footR ?? rimR) + PROP_MARGIN_M + 1.6);
  const n = Math.ceil((2 * half) / CELL), x0 = sx - half, z0 = sz - half;
  const yLo = deckY - 0.6, yHi = deckY + 1.6;
  const region = new THREE.Box3(new THREE.Vector3(x0, yLo, z0), new THREE.Vector3(x0 + 2 * half, yHi, z0 + 2 * half));
  const hullTop = new Float32Array(n * n).fill(-Infinity), hullBy = new Int32Array(n * n).fill(-1);
  const labels = [];
  const raster = (a, b, c, onCell) => {
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
    if (maxX < x0 || minX > x0 + 2 * half || maxZ < z0 || minZ > z0 + 2 * half) return;
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(d) < 1e-14) return;
    const i0 = Math.max(0, Math.floor((minX - x0) / CELL)), i1 = Math.min(n - 1, Math.floor((maxX - x0) / CELL));
    const j0 = Math.max(0, Math.floor((minZ - z0) / CELL)), j1 = Math.min(n - 1, Math.floor((maxZ - z0) / CELL));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * CELL;
        const w0 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
        if (w0 < -1e-7) continue;
        const w1 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
        if (w1 < -1e-7 || w0 + w1 > 1 + 1e-7) continue;
        onCell(j * n + i, w0 * a.y + w1 * b.y + (1 - w0 - w1) * c.y);
      }
    }
  };
  // up-facing faces (a steep wall's face included, as measureTurretRing reads the deck)
  eachMesh(hullRig, hullInverse, turretRig, region, (mesh, matrix, label) => {
    const id = labels.push(`hull:${label}`) - 1;
    eachTriangle(mesh, matrix, (a, b, c, flip, twoSided) => {
      if (Math.max(a.y, b.y, c.y) < yLo || Math.min(a.y, b.y, c.y) > yHi) return;
      const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
      let ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const length = Math.hypot(nx, ny, nz);
      if (!(length > 1e-12)) return;
      if (flip) ny = -ny;
      if ((twoSided ? Math.abs(ny) : ny) < 0.02 * length) return;
      raster(a, b, c, (k, y) => { if (y <= yHi && y > hullTop[k]) { hullTop[k] = y; hullBy[k] = id; } });
    });
  });
  const baseR = (receipt.footR ?? rimR) + BASE_MARGIN_M;
  return { hullInverse, n, x0, z0, sx, sz, deckY, rimR, baseR, yLo, yHi, region, raster, hullTop, hullBy, labels };
}

/** The turret's lowest surface per cell (faces, and edges every cm), and inside the rim the face or deck-hugging edge
 *  nearest the hull's top within the on-deck band; at the turret's current pose. */
function turretGrid(grid, turretRig) {
  const { hullInverse, n, x0, z0, yLo, yHi, region, raster, hullTop, labels } = grid;
  turretRig.updateMatrixWorld(true);
  const low = new Float32Array(n * n).fill(Infinity), lowBy = new Int32Array(n * n).fill(-1);
  const onDeck = new Float32Array(n * n).fill(NaN), onDeckBy = new Int32Array(n * n).fill(-1);
  const gun = turretRig.getObjectByName('rig_gun') ?? null;
  const band = (k, y, id) => {
    if (!Number.isFinite(hullTop[k])) return;
    const d = y - hullTop[k];
    if (d > -ON_DECK_BURY_M && d < DECK_CLEAR_M && !(Math.abs(d) >= Math.abs(onDeck[k]))) { onDeck[k] = d; onDeckBy[k] = id; }
  };
  eachMesh(turretRig, hullInverse, gun, region, (mesh, matrix, label) => {
    const id = labels.indexOf(`turret:${label}`) >= 0 ? labels.indexOf(`turret:${label}`) : labels.push(`turret:${label}`) - 1;
    eachTriangle(mesh, matrix, (a, b, c) => {
      if (Math.max(a.y, b.y, c.y) < yLo || Math.min(a.y, b.y, c.y) > yHi) return;
      const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
      const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const flat = Math.abs(ny) >= 0.7 * Math.hypot(nx, ny, nz);
      raster(a, b, c, (k, y) => {
        if (y >= yLo && y < low[k]) { low[k] = y; lowBy[k] = id; }
        if (flat) band(k, y, id);
      });
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const steps = Math.max(1, Math.min(400, Math.ceil(Math.hypot(v.x - u.x, v.z - u.z) / 0.01)));
        const along = Math.abs(v.y - u.y) <= 0.01 + 0.2 * Math.hypot(v.x - u.x, v.z - u.z);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps, x = u.x + (v.x - u.x) * t, z = u.z + (v.z - u.z) * t, y = u.y + (v.y - u.y) * t;
          const i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const k = j * n + i;
          if (y >= yLo && y < low[k]) { low[k] = y; lowBy[k] = id; }
          if (along) band(k, y, id);
        }
      }
    });
  });
  return { low, lowBy, onDeck, onDeckBy };
}

/** Flood-fill the flagged cells into 8-connected patches of at least MIN_CELLS. */
function patches(n, flagged) {
  const seen = new Uint8Array(n * n), out = [];
  for (const start of flagged.keys()) {
    if (seen[start]) continue;
    const cells = [], stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop();
      cells.push(k);
      const i = k % n, j = (k - i) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj, kk = jj * n + ii;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n || seen[kk] || !flagged.has(kk)) continue;
        seen[kk] = 1;
        stack.push(kk);
      }
    }
    if (cells.length >= MIN_CELLS) out.push(cells);
  }
  return out;
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const bearingDeg = (dx, dz) => Math.round(((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360);

function cellAt(grid, k) {
  const i = k % grid.n, j = (k - i) / grid.n;
  const dx = grid.x0 + (i + 0.5) * CELL - grid.sx, dz = grid.z0 + (j + 0.5) * CELL - grid.sz;
  return { dx, dz, r: Math.hypot(dx, dz) };
}

/** The turret's foot per bearing at one pose: its outermost low surface's radius and the lowest surface near it. With
 *  `overHull`, the foot's height reads only turret surfaces standing over the hull's top there: a floor or basket buried
 *  in the hull just inside the turret's wall (the M41's and the Puma's, 9 cm under the deck) is out of sight, not the foot. */
function footOf(grid, turret, overHull = false) {
  const { n, deckY, hullTop } = grid;
  const over = (k) => !overHull || !(turret.low[k] < hullTop[k] - VISIBLE_TOL_M);
  const footR = new Float64Array(BEARINGS), footY = new Float64Array(BEARINGS).fill(Infinity);
  const binOf = (p) => Math.min(BEARINGS - 1, Math.floor(((Math.atan2(p.dx, p.dz) + Math.PI) / (2 * Math.PI)) * BEARINGS));
  for (let k = 0; k < n * n; k++) {
    if (!(turret.low[k] <= deckY + FOOT_BAND_M)) continue;
    const p = cellAt(grid, k), b = binOf(p);
    if (p.r > footR[b]) footR[b] = p.r;
  }
  for (let k = 0; k < n * n; k++) {
    if (!(turret.low[k] <= deckY + FOOT_BAND_M) || !over(k)) continue;
    const p = cellAt(grid, k), b = binOf(p);
    if (p.r >= footR[b] - FOOT_EDGE_M && turret.low[k] < footY[b]) footY[b] = turret.low[k];
  }
  return { footR, footY, binOf };
}

/** (a) at one pose: the failing patches (reaching the turret's foot band), the hidden ones under its body, the overhang
 *  ones past the base zone, and the least clearance in the base zone. */
function judgeDeck(grid, turret, collared) {
  const { n, rimR, baseR, hullTop, hullBy, labels } = grid;
  const { footR, binOf } = footOf(grid, turret);
  const atFoot = (k) => { const p = cellAt(grid, k); return p.r >= footR[binOf(p)] - FOOT_EDGE_M; };
  const failing = new Map(), beyond = new Map(), by = new Map();
  let minClear = Infinity;
  for (let k = 0; k < n * n; k++) {
    if (cellAt(grid, k).r <= rimR + RIM_PAD_M) {
      if (collared || Number.isNaN(turret.onDeck[k])) continue;
      failing.set(k, turret.onDeck[k]);
      by.set(k, turret.onDeckBy[k]);
      continue;
    }
    if (!Number.isFinite(turret.low[k]) || !Number.isFinite(hullTop[k])) continue;
    const clear = turret.low[k] - hullTop[k], base = cellAt(grid, k).r <= baseR;
    if (base && clear < minClear) minClear = clear;
    if (clear < DECK_CLEAR_M) { (base ? failing : beyond).set(k, clear); by.set(k, turret.lowBy[k]); }
  }
  const describe = (map) => patches(n, map).map((cells) => {
    let worst = cells[0], inRim = 0, foot = 0, footClear = Infinity;
    for (const k of cells) {
      if (map.get(k) < map.get(worst)) worst = k;
      if (cellAt(grid, k).r <= rimR + RIM_PAD_M) inRim++;
      if (atFoot(k)) { foot++; footClear = Math.min(footClear, map.get(k)); }
    }
    const p = cellAt(grid, worst);
    return {
      cells: cells.length, inRim, atFoot: foot, clearM: round3(map.get(worst)),
      footClearM: Number.isFinite(footClear) ? round3(footClear) : null, r: round3(p.r), bearing: bearingDeg(p.dx, p.dz),
      turret: labels[by.get(worst)], hull: labels[hullBy[worst]],
    };
  }).sort((a, b) => a.clearM - b.clearM);
  const base = describe(failing);
  return {
    patches: base.filter((patch) => patch.atFoot >= MIN_CELLS).sort((a, b) => a.footClearM - b.footClearM), hidden: base.filter((patch) => patch.atFoot < MIN_CELLS),
    overhang: describe(beyond), minClear,
  };
}

/** (b) at rest: the hull's tops standing over the turret's foot just outside it. */
function judgeProps(grid, turret) {
  const { n, deckY, rimR, hullTop, hullBy, labels } = grid;
  const { footR, footY, binOf } = footOf(grid, turret, true);
  const tall = new Map();
  for (let k = 0; k < n * n; k++) {
    if (Number.isFinite(turret.low[k]) || !Number.isFinite(hullTop[k])) continue;
    const p = cellAt(grid, k), b = binOf(p);
    if (!(footR[b] > rimR) || !Number.isFinite(footY[b])) continue;
    if (p.r <= footR[b] || p.r > footR[b] + PROP_MARGIN_M) continue;
    const rise = hullTop[k] - footY[b];
    if (rise > PROP_RISE_M) tall.set(k, { rise, out: p.r - footR[b], foot: footY[b] - deckY });
  }
  const found = patches(n, tall).map((cells) => {
    let worst = cells[0];
    for (const k of cells) if (tall.get(k).rise > tall.get(worst).rise) worst = k;
    const p = cellAt(grid, worst), cell = tall.get(worst);
    const parts = [...new Set(cells.map((k) => labels[hullBy[k]]))];
    return {
      cells: cells.length, riseM: round3(cell.rise), outM: round3(cell.out), bearing: bearingDeg(p.dx, p.dz),
      footOverDeckM: round3(cell.foot), hull: parts.slice(0, 4).join(' | ') + (parts.length > 4 ? ` (+${parts.length - 4})` : ''),
    };
  }).sort((a, b) => b.riseM - a.riseM);
  const feet = [...footY].filter(Number.isFinite);
  return { patches: found, footMinOverDeckM: feet.length ? round3(Math.min(...feet) - deckY) : null };
}

/** Both checks on one build: { deck, deckYaws, worstYawDeg, minClearM, props, footMinOverDeckM, collared }, or null. */
export function measureTurretDeck(root, receipt) {
  const hullRig = root.getObjectByName('rig_hull'), turretRig = root.getObjectByName('rig_turret');
  if (!hullRig || !turretRig) return null;
  root.updateMatrixWorld(true);
  const grid = hullGrid(hullRig, turretRig, receipt);
  let collared = false;
  turretRig.traverse((object) => { if (object.name === COLLAR_NAME && object.visible !== false) collared = true; });
  const rest = turretRig.quaternion.clone();
  const axis = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  let props = null, worst = null, worstYaw = 0, yawsFailing = 0, minClear = Infinity, overhang = null, overhangYaws = 0,
    overhangYaw = 0, hidden = null;
  try {
    for (let step = 0; step < YAWS; step++) {
      // a turn about the ring's own (rig-local) vertical axis, as a traverse turns it
      turretRig.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis, (step / YAWS) * Math.PI * 2));
      const turret = turretGrid(grid, turretRig);
      if (step === 0) props = judgeProps(grid, turret);
      const deck = judgeDeck(grid, turret, collared);
      minClear = Math.min(minClear, deck.minClear);
      if (deck.patches.length) yawsFailing++;
      if (deck.overhang.length) overhangYaws++;
      if (deck.hidden.length && (!hidden || deck.hidden[0].clearM < hidden[0].clearM)) hidden = deck.hidden;
      if (deck.overhang.length && (!overhang || deck.overhang[0].clearM < overhang[0].clearM)) {
        overhang = deck.overhang;
        overhangYaw = Math.round((step / YAWS) * 360);
      }
      if (deck.patches.length && (!worst || deck.patches[0].footClearM < worst[0].footClearM
        || (deck.patches[0].footClearM === worst[0].footClearM && deck.patches.length > worst.length))) {
        worst = deck.patches;
        worstYaw = Math.round((step / YAWS) * 360);
      }
    }
  } finally {
    turretRig.quaternion.copy(rest);
    turretRig.updateMatrixWorld(true);
  }
  return {
    collared, deck: worst ?? [], deckYaws: yawsFailing, worstYawDeg: worst ? worstYaw : null,
    minClearM: Number.isFinite(minClear) ? round3(minClear) : null, overhang: overhang ?? [], overhangYaws,
    overhangYawDeg: overhang ? overhangYaw : null, hidden: hidden ?? [],
    props: props.patches, footMinOverDeckM: props.footMinOverDeckM,
  };
}

/**
 * The fleet audit ({ check, finish }). `report` collects every turreted tank's row (the read-only fleet table) and never
 * fails (each row's `fails` says whether the gate would); `carry` maps an id to what it may keep until its fix lands
 * ({ deck, props } patch counts, and shortfall: true for a recorded seat shortfall); `exclude` ids are measured but never
 * fail (a tank another lane owns).
 */
export function createTurretDeckAudit({ report = null, carry = {}, exclude = [] } = {}) {
  let turreted = 0;
  const missing = [];
  const failures = [];
  return {
    check(id, tank) {
      const root = tank.root;
      if (!root.getObjectByName('rig_turret')) return;
      const receipt = combatAnatomyCalibration(id)?.turretRing;
      if (NO_TURRET_IDS.includes(id)) { report?.push({ id, noTurret: true }); return; }
      if (!receipt || !(receipt.rimR > 0.15)) { missing.push(id); report?.push({ id, noReceipt: true }); return; }
      const verdict = measureTurretDeck(root, receipt);
      if (!verdict) return;
      turreted++;
      // the builder's own seat knobs (turretSeatRace.ts), so a row names the setting that left a surface low
      const own = root.getObjectByName('rig_turret').userData;
      const knobs = Object.fromEntries(['turretSeatKeepR', 'turretSeatRiseM', 'turretSeatReadM', 'turretSeatMinY',
        'turretSeatCollar'].filter((key) => own[key] !== undefined).map((key) => [key, own[key]]));
      // what the seat could not lift (turretSeatRace.ts seatFootBand) and the hull parts the ring-zone guard caught
      // (ringZoneGuard.ts), so a failing row names its cause
      const shortfall = own.turretSeatShortfall ?? null;
      const ringZone = root.getObjectByName('rig_hull')?.userData.ringZoneViolations ?? [];
      const row = { id, deckY: receipt.deckY, rimR: receipt.rimR, footR: receipt.footR, baseR: round3((receipt.footR ?? receipt.rimR) + BASE_MARGIN_M), knobs,
        ...(shortfall ? { shortfall } : {}), ...(ringZone.length ? { ringZone } : {}), ...verdict };
      report?.push(row);
      // (b) a hull the photos show standing over the foot (ringZoneGuard.ts RING_ZONE_EXEMPT) passes up to its named rise
      const exempt = RING_ZONE_EXEMPT[id];
      const props = exempt ? verdict.props.filter((patch) => patch.riseM > exempt.riseM) : verdict.props;
      if (exempt) row.exempt = exempt.reason;
      const allowed = carry[id] ?? { deck: 0, props: 0, shortfall: false };
      row.fails = verdict.deck.length > allowed.deck || props.length > allowed.props || (!!shortfall && !allowed.shortfall);
      if (row.fails && !exclude.includes(id)) failures.push(row);
    },
    finish() {
      if (report) return;
      if (missing.length) throw new Error(`turretDeck: turreted tanks without a ring receipt: ${missing.join(', ')}`);
      if (failures.length) {
        throw new Error(`turretDeck: ${failures.length} tank(s) with a turret face within ${DECK_CLEAR_M} m of the deck, `
          + `a hull prop over the turret's foot or a seat shortfall:\n${failures.map((row) => JSON.stringify(row)).join('\n')}`);
      }
      if (turreted < 150) throw new Error(`turretDeck: coverage regressed (${turreted} turreted tanks)`);
    },
  };
}
