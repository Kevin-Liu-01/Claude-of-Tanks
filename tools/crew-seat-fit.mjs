// Crew seats for the combat anatomy (235): where a P50 (1.75 m) person sits at each crew station, in the role's posture,
// inside the vehicle's exact shell. tools/gen-combat-anatomy.mjs runs it on every calibration it writes and publishes
// the result as the row's `crewSeats`; finalizeCombatAnatomy applies them (the station box, the head, the posture and
// the body's hit shapes), so the player's fleet, every authority and the Gallery read the same literal numbers.
//
// The body is the Gallery mannequin's (src/gallery/anatomyCrew.ts: the same anthropometric segment table and joint
// chain), posed by role:
//   - drivers of modern MBTs recline (Leopard 2, Abrams, Challenger, Leclerc, the T-64/72/80/90 families, ...); other
//     drivers sit, reclining further only where the hull is too low;
//   - gunners, commanders and seated crew sit (hunched into the sight under a low roof); a loader stands where the
//     turret basket has the headroom, else sits.
// A station's seat is the placement nearest its authored station (the legacy combat box, reconciled to the measured
// frame) where the whole body (head, torso, thighs, shins, boots) lies 6 mm inside the shell, off the stowage and
// powerplant modules and the gun, and clear of the crew already seated. Each placement keeps the least tucked posture
// that fits, with the boots at most 20 cm over the floor under them (a seated person rests on a footrest or pedals; a
// standing loader on the basket floor). "Inside the shell" is armour at every turret yaw (crewShell): hull crew inside
// the hull; turret crew inside the turret, the hull under it at every yaw (the basket turns with the turret) or the
// turret ring between them. The hit shapes are held to the armour proper: the combat shells leave the gap between the
// hull's roof and the turret's floor open, so a capsule crossing it keeps only its pieces inside armour (crewArmour).
// HE splash strikes a body at three points (head, torso, lap: `blastPoints`). The station box is the largest box
// inside the shell, within the body's bounds, grown from its torso. The ring a seat first passes through is the opening
// over the turret axis; where no posture fits, a turret seat may reach across the ring's full width (domed roofs and
// floors keep the axis opening narrow) and a gunner, commander or operator in a hull crew capsule reclines like a
// driver. Where still none fits, the nearest best placement is kept and its shapes are trimmed into the armour
// (`trimmed`, with the outside share it started from).
// Pure numbers, no three.js; deterministic (fixed grids, fixed order).

import { stationSideSign } from '../src/vehicles/vehicleSide.ts';

const H = 1.75;
const SEG = Object.freeze({
  hipHalfWidth: 0.052 * H, spine: 0.296 * H, neck: 0.05 * H, headRadius: 0.061 * H,
  thigh: 0.251 * H, shin: 0.246 * H, ankle: 0.037 * H, foot: 0.152 * H,
});
const MARGIN = 0.006;
const FOOTREST_M = 0.2;
const ROUND = (value) => Number(value.toFixed(4));
const ROUND3 = (value) => Number(value.toFixed(3));

// [trunk, hip, knee, shoulder, elbow, neck] from the Gallery mannequin's role poses: base (least tucked) → most tucked.
const LADDERS = Object.freeze({
  // a reclined driver lies back with the legs reaching forward under the glacis to the pedals
  driverReclined: [[-0.55, 1.5, 1.25, 1.15, 0.35, -0.3], [-1.1, 1.75, 0.6, 1.3, 0.25, -0.35]],
  driverSeated: [[-0.15, 1.5, 1.3, 1.0, 0.5, -0.1], [-0.55, 1.5, 1.25, 1.15, 0.35, -0.3]],
  gunner: [[0.22, 1.52, 1.5, 0.72, 0.86, 0.18], [-0.2, 1.95, 2.3, 0.8, 0.8, 0.35]],
  commander: [[0.04, 1.5, 1.45, 0.34, 1.15, 0], [-0.3, 1.95, 2.3, 0.45, 1.1, 0.25]],
  loaderStanding: [[0.14, 0.22, 0.3, 0.55, 1.05, 0.12], [0.3, 1.2, 2.0, 0.6, 1.05, 0.2]],
  loaderSeated: [[0.12, 1.45, 1.5, 0.5, 1.0, 0.1], [-0.3, 1.95, 2.3, 0.55, 1.0, 0.25]],
  // leaning into the sight under a low roof: the head ~15 cm lower and forward
  seatedHunched: [[0.35, 1.6, 1.7, 0.6, 1.0, 0.3], [0.6, 1.9, 2.2, 0.6, 1.0, 0.45]],
});
const TUCKS = Object.freeze([0, 0.2, 0.4, 0.6, 0.8, 1]);

// Internal-layout families whose drivers recline (modern MBTs), and the ids of other families that do.
const RECLINED_DRIVER_LAYOUTS = new Set([
  'leopard', 'abrams', 'abramsX', 'ztz100HullCapsule', 'm1a3', 'westernTwoPart', 'arieteManual', 'merkava', 'nationalSmDiesel',
  'nationalSmTurbine', 'conceptAzHybrid', 'conceptMzHybrid', 'sovietAz', 'sovietMz', 'bustleAuto', 'fixedAuto',
  'kf51_evo', 'fictionalAuto', 'mbt70',
]);
const RECLINED_DRIVER_IDS = new Set([
  'chieftain5', 'chieftain3', 'chieftain_mk9', 'chieftain_mk10', 'k1a1', 'k1e1', 'amx40', 'amx40_proto', 'stb1',
]);
const SEATED_DRIVER_IDS = new Set(['leo1a5']);

/** The posture ladders a station may use, in preference order. */
export function crewPostureLadders(id, layoutKey, role, frame) {
  if (/driver/i.test(role) && !/assistant/i.test(role)) {
    const reclined = !SEATED_DRIVER_IDS.has(id) && (RECLINED_DRIVER_LAYOUTS.has(layoutKey) || RECLINED_DRIVER_IDS.has(id));
    return reclined ? ['driverReclined'] : ['driverSeated', 'driverReclined'];
  }
  if (/loader/i.test(role)) return frame === 'turret' ? ['loaderStanding', 'loaderSeated', 'seatedHunched'] : ['loaderSeated', 'seatedHunched'];
  if (/commander/i.test(role)) return ['commander', 'seatedHunched'];
  if (/radio|assistant/i.test(role)) return ['driverSeated', 'driverReclined'];
  return ['gunner', 'seatedHunched'];
}

/** Where none of those fits: a gunner, commander or operator in a hull crew capsule reclines like a driver. */
export function crewFallbackLadders(id, layoutKey, role, frame) {
  const ladders = crewPostureLadders(id, layoutKey, role, frame);
  return frame === 'hull' && !ladders.includes('driverReclined') && !/loader/i.test(role) ? [...ladders, 'driverReclined'] : ladders;
}

function poseParams(kind, tuck) {
  const [base, tucked] = LADDERS[kind];
  return base.map((value, index) => value + (tucked[index] - value) * tuck);
}

const up = (a) => [Math.cos(a), Math.sin(a)];
const down = (a) => [-Math.cos(a), Math.sin(a)];
const add = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s];

/** Sagittal joints [y, z] relative to the pelvis (the Gallery mannequin's chain). */
function joints([trunk, hip, knee, , , neck]) {
  const pelvis = [0, 0];
  const shoulder = add(pelvis, up(trunk), SEG.spine);
  const neckTop = add(shoulder, up(trunk + neck), SEG.neck);
  const head = add(neckTop, up(trunk + neck), SEG.headRadius);
  const kneeP = add(pelvis, down(hip), SEG.thigh);
  const ankle = add(kneeP, down(hip - knee), SEG.shin);
  return {
    head,
    torsoA: add(pelvis, up(trunk), 0.05),
    torsoB: add(pelvis, up(trunk), SEG.spine * 0.78),
    pelvis,
    knee: kneeP,
    ankle,
    bootA: [ankle[0] - 0.04, ankle[1] - 0.05],
    bootB: [ankle[0] - 0.04, ankle[1] + 0.21],
  };
}

const TORSO_X = 0.07, THIGH_X = SEG.hipHalfWidth * 1.7, SHIN_X = SEG.hipHalfWidth * 1.75;
const HEAD_RADII = [0.115, 0.13, 0.125];

/** Hit shapes (relative to the pelvis, x lateral) and the boots (fit only). */
function bodyParts(params) {
  const j = joints(params);
  const at = (x, p) => [x, p[0], p[1]];
  const shapes = [{ kind: 'ellipsoid', center: at(0, j.head), radii: HEAD_RADII.slice() }];
  for (const x of [-TORSO_X, TORSO_X]) shapes.push({ kind: 'capsule', a: at(x, j.torsoA), b: at(x, j.torsoB), radius: 0.13 });
  for (const x of [-THIGH_X, THIGH_X]) shapes.push({ kind: 'capsule', a: at(x, j.pelvis), b: at(x, j.knee), radius: 0.075 });
  for (const x of [-SHIN_X, SHIN_X]) shapes.push({ kind: 'capsule', a: at(x, j.knee), b: at(x, j.ankle), radius: 0.055 });
  const boots = [-SHIN_X, SHIN_X].map((x) => ({ kind: 'capsule', a: at(x, j.bootA), b: at(x, j.bootB), radius: 0.045 }));
  return { shapes, boots, head: at(0, j.head) };
}

// Surface samples dense enough that the surface between them sags less than the fit's margin (12 around: 4.4 mm on a
// 13 cm torso), and the end caps sampled at every elevation (a cap straddling the turret ring's air gap is caught).
// Spheres of 26 directions about 9 points along a capsule's axis (and about an ellipsoid's centre) add interior points:
// the shell is a union of convex cells, so a surface inside it can still enclose a void a shot reaches.
const GRID_DIRS = (() => {
  const dirs = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    if (i || j || k) dirs.push([i, j, k].map((value) => value / Math.hypot(i, j, k)));
  }
  return dirs;
})();
const SPHERE_DIRS = (() => {
  const dirs = [[0, 1, 0], [0, -1, 0]];
  for (let i = 1; i < 8; i++) for (let j = 0; j < 12; j++) {
    const theta = (i / 8) * Math.PI, phi = (j / 12) * Math.PI * 2;
    dirs.push([Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)]);
  }
  return dirs;
})();

/** Surface samples of a shape (frame-relative offsets). */
export function shapeSurfaceSamples(shape) {
  const out = [];
  if (shape.kind === 'ellipsoid') {
    for (const d of [...SPHERE_DIRS, ...GRID_DIRS]) out.push(shape.center.map((value, axis) => value + d[axis] * shape.radii[axis]));
    return out;
  }
  for (let s = 0; s <= 8; s++) {
    const c = shape.a.map((value, index) => value + (shape.b[index] - value) * s / 8);
    for (const d of GRID_DIRS) out.push(c.map((value, index) => value + d[index] * shape.radius));
  }
  const axis = shape.b.map((value, index) => value - shape.a[index]);
  const length = Math.hypot(...axis);
  const dir = length > 1e-9 ? axis.map((value) => value / length) : [0, 1, 0];
  // two unit vectors perpendicular to the axis
  const helper = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = [dir[1] * helper[2] - dir[2] * helper[1], dir[2] * helper[0] - dir[0] * helper[2], dir[0] * helper[1] - dir[1] * helper[0]];
  const ul = Math.hypot(...u); u = u.map((value) => value / ul);
  const v = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
  const steps = Math.max(1, Math.ceil(length / 0.025));
  const r = shape.radius;
  const ring = (center, along, radius, count) => {
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2;
      const cu = Math.cos(angle) * radius, sv = Math.sin(angle) * radius;
      out.push(center.map((value, index) => value + dir[index] * along + u[index] * cu + v[index] * sv));
    }
  };
  for (let s = 0; s <= steps; s++) ring(shape.a.map((value, index) => value + axis[index] * s / steps), 0, r, 12);
  for (const [end, sign] of [[shape.a, -1], [shape.b, 1]]) {
    for (const [elevation, count] of [[Math.PI / 6, 12], [Math.PI / 3, 8]]) ring(end, sign * r * Math.sin(elevation), r * Math.cos(elevation), count);
    out.push(end.map((value, index) => value + dir[index] * sign * r));
  }
  return out;
}

// --- the shell, as y-intervals ------------------------------------------------------------------------------------
/** Cells of one frame in the crew's frame: [{ min, max, faces: [nx, ny, nz, c]… }], offset into that frame. */
function frameCells(cells, offset) {
  const out = (cells || []).map((cell) => {
    // faces flat: nx, ny, nz, c, shared — n·(p - offset) + c = n·p + (c - n·offset)
    const f = new Float64Array(cell.faces.length * 5);
    cell.faces.forEach((face, index) => f.set([face.normal[0], face.normal[1], face.normal[2],
      face.constant - (face.normal[0] * offset[0] + face.normal[1] * offset[1] + face.normal[2] * offset[2]), 0], index * 5));
    return {
      min: cell.min.map((value, axis) => value + offset[axis]),
      max: cell.max.map((value, axis) => value + offset[axis]),
      f,
    };
  });
  // A face another cell shares (coplanar, facing it) is a cut between slices, not armour: no margin there.
  for (const cell of out) for (let i = 0; i < cell.f.length; i += 5) {
    const shared = out.some((other) => {
      if (other === cell) return false;
      for (let j = 0; j < other.f.length; j += 5) {
        if (cell.f[i] * other.f[j] + cell.f[i + 1] * other.f[j + 1] + cell.f[i + 2] * other.f[j + 2] < -0.999
          && Math.abs(cell.f[i + 3] + other.f[j + 3]) < 2e-4) return true;
      }
      return false;
    });
    cell.f[i + 4] = shared ? 1 : 0;
  }
  return out;
}

/** The y-interval of the column (x, z) inside a convex cell, `margin` inside every armour face; null when empty. */
function cellColumn(cell, x, z, margin) {
  const pad = margin < 0 ? -margin : 1e-9;
  const min = cell.min, max = cell.max;
  if (x < min[0] - pad || x > max[0] + pad || z < min[2] - pad || z > max[2] + pad) return null;
  const sharedMargin = margin < -0.001 ? margin : -0.001;
  const f = cell.f;
  let lo = -Infinity, hi = Infinity;
  for (let i = 0; i < f.length; i += 5) {
    const ny = f[i + 1];
    const k = -(f[i + 4] ? sharedMargin : margin) - f[i + 3] - f[i] * x - f[i + 2] * z;
    if (ny > 1e-9) { const v = k / ny; if (v < hi) hi = v; }
    else if (ny < -1e-9) { const v = k / ny; if (v > lo) lo = v; }
    else if (k < 0) return null;
    if (lo > hi) return null;
  }
  return [lo, hi];
}

function unionIntervals(list) {
  if (list.length < 2) return list;
  list.sort((a, b) => a[0] - b[0]);
  const out = [list[0].slice()];
  for (let i = 1; i < list.length; i++) {
    const last = out[out.length - 1];
    if (list[i][0] <= last[1] + 1e-6) last[1] = Math.max(last[1], list[i][1]);
    else out.push(list[i].slice());
  }
  return out;
}

function intersectIntervals(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}

function subtractInterval(list, lo, hi) {
  const out = [];
  for (const [a, b] of list) {
    if (hi <= a || lo >= b) { out.push([a, b]); continue; }
    if (a < lo) out.push([a, lo]);
    if (hi < b) out.push([hi, b]);
  }
  return out;
}

/** Turret yaws a basket circle is measured at. */
const FIT_YAWS = Array.from({ length: 48 }, (_, index) => [Math.cos(index / 48 * Math.PI * 2), Math.sin(index / 48 * Math.PI * 2)]);
const BASKET_STEP_M = 0.01;

/**
 * The turret basket: per 1 cm of height (turret frame), the radius of the largest circle about the turret axis inside
 * the hull at every yaw (48 yaws, `margin` in). A point below the turret at radius r is armoured at every yaw where
 * both neighbouring heights hold r.
 */
function basketRadii(hullCells, margin) {
  let lo = Infinity, hi = -Infinity;
  for (const cell of hullCells) { lo = Math.min(lo, cell.min[1]); hi = Math.max(hi, cell.max[1]); }
  if (!Number.isFinite(lo)) return null;
  const y0 = Math.floor(lo / BASKET_STEP_M) * BASKET_STEP_M;
  const count = Math.ceil((hi - y0) / BASKET_STEP_M) + 1;
  const radii = new Float64Array(count);
  for (let k = 0; k < count; k++) radii[k] = largestCircle(hullCells, y0 + k * BASKET_STEP_M, margin);
  let top = -1;
  for (let k = 0; k < count; k++) if (radii[k] > 0) top = k;
  const byRadius = new Map();
  const lookup = (r) => {
    const key = Math.ceil(r / 0.005);
    let list = byRadius.get(key);
    if (!list) {
      const need = key * 0.005;
      list = [];
      for (let k = 0; k + 1 < count; k++) {
        if (radii[k] < need || radii[k + 1] < need) continue;
        const a = y0 + k * BASKET_STEP_M, b = a + BASKET_STEP_M;
        if (list.length && Math.abs(list[list.length - 1][1] - a) < 1e-9) list[list.length - 1][1] = b;
        else list.push([a, b]);
      }
      byRadius.set(key, list);
    }
    return list;
  };
  // the hull's roof over the axis, and the largest circle 5 cm under it: the ring opening is no wider
  return { lookup, roofY: top < 0 ? null : y0 + top * BASKET_STEP_M, topRadius: top < 5 ? 0 : radii[top - 5] };
}

/** The radius of the largest circle about the vertical axis through the origin inside `cells` at height y (48 yaws). */
function largestCircle(cells, y, margin) {
  const inside = (x, z) => cells.some((cell) => {
    const range = cellColumn(cell, x, z, margin);
    return range && y >= range[0] && y <= range[1];
  });
  const ring = (r) => FIT_YAWS.every(([c, s]) => inside(c * r, s * r));
  if (!ring(0)) return -1;
  let a = 0, b = 4;
  for (let i = 0; i < 14; i++) { const mid = (a + b) / 2; if (ring(mid)) a = mid; else b = mid; }
  return a;
}

/**
 * The armour a crew member sits inside, at every turret yaw (`frame` 'hull' | 'turret', frame-local points): the hull's
 * cells for hull crew; for turret crew the turret's cells, the hull's under the turret at every yaw (the basket), and the
 * turret ring's opening between them. `inside(p, margin)` is `margin` in from every face (negative: a tolerance out).
 */
export function crewShell(armor, frame) {
  return makeShell(armor, frame, 'full');
}

/**
 * The armour proper (crewShell without the turret ring's opening): the combat shells leave the gap between the hull's
 * roof and the turret's floor open, so a body may sit through the ring but its hit shapes stay out of the gap.
 */
export function crewArmour(armor, frame) {
  return makeShell(armor, frame, false);
}

/** How far under the hull's roof and over the turret's floor the full ring's radius is measured. */
const RING_DEPTH_M = 0.12;

/**
 * `ring`: false (the armour proper), 'axis' (the opening over the turret axis: the hull's roof to the turret's floor,
 * as wide as both hold 5 cm in) or 'full' (also the whole ring: out to the radius both hold RING_DEPTH_M in, between
 * the hull's top at each radius and the turret's bottom over it).
 * `limit` (266, seats only): the turret ring as built ({ ringR, deckY }, the calibration's turretRing). Turret crew keep
 * whatever lies under the turret within the ring's radius (the basket turns inside the race, never past it); hull crew
 * keep out of that cylinder under the deck where a basket turns (`basket`).
 */
function makeShell(armor, frame, ring, limit = null) {
  const pivot = armor.turretPivot || [0, 0, 0];
  const hull = armor.collisionShells?.hull || [];
  const turret = armor.collisionShells?.turret || [];
  // Hull crew stay inside the hull (the turret turns over them). Turret crew sit in the basket: inside the turret, or
  // inside the hull under it at every turret yaw (the part of the body below the turret turns with it).
  const own = frame === 'turret' ? frameCells(turret, [0, 0, 0]) : frameCells(hull, [0, 0, 0]);
  const swept = frame === 'turret' ? frameCells(hull, pivot.map((value) => -value)) : [];
  // The turret ring, from the geometry (margin 0): where the hull's roof and the turret's floor meet over the axis, the
  // opening between them is as wide as the smaller of the hull's circle under its roof and the turret's circle over its
  // floor. A margin insets its radius; the band overlaps the basket and the turret by 5 cm, so its ends need none.
  // Domed roofs and floors keep those circles small; the full ring is as wide as both hold RING_DEPTH_M in, and bridges
  // the gap between the hull's top at each radius (the basket's) and the turret's bottom over it.
  let opening = null;
  const ringOf = () => {
    if (opening) return opening;
    opening = { r: -Infinity, full: -Infinity, lo: 0, hi: 0 };
    const radii = swept.length ? basketRadii(swept, 0) : null;
    if (radii && radii.roofY !== null) {
      let floorY = Infinity;
      for (const cell of own) {
        const range = cellColumn(cell, 0, 0, 0);
        if (range) floorY = Math.min(floorY, range[0]);
      }
      if (Number.isFinite(floorY) && floorY - radii.roofY < 0.25) {
        opening = {
          r: Math.min(radii.topRadius, largestCircle(own, floorY + 0.05, 0)),
          full: Math.min(largestCircle(swept, radii.roofY - RING_DEPTH_M, 0), largestCircle(own, floorY + RING_DEPTH_M, 0)),
          lo: Math.min(radii.roofY, floorY) - 0.05,
          hi: Math.max(radii.roofY, floorY) + 0.05,
        };
      }
    }
    return opening;
  };
  const baskets = new Map();
  const basket = (margin) => {
    if (!baskets.has(margin)) baskets.set(margin, basketRadii(swept, margin));
    return baskets.get(margin);
  };
  return {
    cells: [...own, ...swept],
    /** The y-intervals of column (x, z) inside the shell. */
    column(x, z, margin = MARGIN) {
      const list = [];
      let turretBottom = Infinity;
      for (let index = 0; index < own.length; index++) {
        const range = cellColumn(own[index], x, z, margin);
        if (range) { list.push(range); turretBottom = Math.min(turretBottom, range[0]); }
      }
      if (swept.length && (!limit || Math.hypot(x, z) <= limit.ringR - margin)) {
        const radii = basket(margin);
        const r = Math.hypot(x, z);
        let hullTop = -Infinity;
        // (a tolerance, a negative margin, also extends the basket's 1 cm height steps: checks get their slack there too)
        if (radii) for (const range of radii.lookup(r)) {
          list.push(margin < 0 ? [range[0] + margin, range[1] - margin] : range.slice());
          hullTop = Math.max(hullTop, list[list.length - 1][1]);
        }
        const ringBand = ring ? ringOf() : null;
        if (ringBand && r <= ringBand.r - margin) list.push([ringBand.lo, ringBand.hi]);
        if (ring === 'full' && ringBand && r <= ringBand.full - margin && turretBottom > hullTop && turretBottom - hullTop < 0.25) {
          list.push([hullTop, turretBottom]);
        }
      }
      if (limit?.basket && frame === 'hull' && Math.hypot(x - pivot[0], z - pivot[2]) < limit.ringR + margin) {
        const above = list.map(([lo, hi]) => [Math.max(lo, limit.deckY), hi]).filter(([lo, hi]) => hi > lo);
        return unionIntervals(above);
      }
      return unionIntervals(list);
    },
    inside(p, margin = MARGIN) {
      for (const [lo, hi] of this.column(p[0], p[2], margin)) if (p[1] >= lo - 1e-9 && p[1] <= hi + 1e-9) return true;
      return false;
    },
  };
}

// --- obstacles ----------------------------------------------------------------------------------------------------
const HARD_OBSTACLES = new Set(['engine', 'transmission', 'autoloader', 'gun', 'gunMount']);
const SOFT_OBSTACLES = new Set(['ammoRack', 'fuelTank', 'feedSystem', 'missileRack']);

function obstacleBoxes(armor, frame, names) {
  const pivot = armor.turretPivot || [0, 0, 0];
  const out = [];
  for (const box of armor.modules || []) {
    if (!names.has(box.module) || box.external === true || box.roofGunFollow) continue;
    const parts = Array.isArray(box.parts) && box.parts.length ? box.parts : [box];
    const boxFrame = box.turretLocal || box.gunFollow ? 'turret' : 'hull';
    // (a gun-follow box is turret-local at rest: the trunnion frame is the turret pitched about the gun pivot)
    const shift = boxFrame === frame ? [0, 0, 0] : frame === 'turret' ? pivot.map((value) => -value) : pivot;
    for (const part of parts) {
      out.push({
        module: box.module,
        min: part.min.map((value, axis) => value + shift[axis]),
        max: part.max.map((value, axis) => value + shift[axis]),
      });
    }
  }
  return out;
}

// --- shape containment and overlap --------------------------------------------------------------------------------
export function pointInShape(shape, p, pad = 0) {
  if (shape.kind === 'ellipsoid') {
    let sum = 0;
    for (let axis = 0; axis < 3; axis++) sum += ((p[axis] - shape.center[axis]) / (shape.radii[axis] + pad)) ** 2;
    return sum <= 1;
  }
  const ab = shape.b.map((value, axis) => value - shape.a[axis]);
  const ap = p.map((value, axis) => value - shape.a[axis]);
  const lengthSq = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = lengthSq > 1e-12 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / lengthSq)) : 0;
  const d = ap.map((value, axis) => value - ab[axis] * t);
  return Math.hypot(...d) <= shape.radius + pad;
}

function translate(shape, offset) {
  if (shape.kind === 'ellipsoid') return { kind: 'ellipsoid', center: shape.center.map((value, axis) => value + offset[axis]), radii: shape.radii.slice() };
  return { kind: 'capsule', a: shape.a.map((value, axis) => value + offset[axis]), b: shape.b.map((value, axis) => value + offset[axis]), radius: shape.radius };
}

// --- a posed body --------------------------------------------------------------------------------------------------
const BODY_CACHE = new Map();
function posedBody(kind, tuck) {
  const key = `${kind}:${tuck}`;
  if (!BODY_CACHE.has(key)) {
    const params = poseParams(kind, tuck);
    const parts = bodyParts(params);
    const points = [...parts.shapes, ...parts.boots].flatMap(shapeSurfaceSamples);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of points) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], p[axis]); max[axis] = Math.max(max[axis], p[axis]); }
    BODY_CACHE.set(key, { kind, tuck, params, parts, points, min, max, center: min.map((value, axis) => (value + max[axis]) / 2) });
  }
  return BODY_CACHE.get(key);
}

/** The pelvis heights at which every body point lies inside the shell and outside the obstacles. */
function feasibleHeights(body, shell, obstacles, px, pz, state) {
  let feasible = [[-50, 50]];
  const order = state.order;
  for (let n = 0; n < order.length; n++) {
    const index = order[n];
    const p = body.points[index];
    const x = px + p[0], z = pz + p[2];
    let column = shell.column(x, z);
    for (const box of obstacles) {
      if (x > box.min[0] && x < box.max[0] && z > box.min[2] && z < box.max[2]) column = subtractInterval(column, box.min[1], box.max[1]);
    }
    feasible = intersectIntervals(feasible, column.map(([lo, hi]) => [lo - p[1], hi - p[1]]));
    if (!feasible.length) {
      // the point that emptied the set is tried first next time
      order.splice(n, 1); order.unshift(index);
      return feasible;
    }
  }
  return feasible;
}

/** The seat height: standing on the floor; seated as high as the boots may rise over the floor (a footrest). */
function chooseHeight(kind, feasible) {
  const [lo, hi] = feasible[0];
  if (kind === 'loaderStanding') return lo;
  return Math.min(hi, lo + FOOTREST_M);
}

function overlapsPlaced(body, px, py, pz, placed) {
  for (const other of placed) {
    for (const p of body.points) {
      const q = [px + p[0], py + p[1], pz + p[2]];
      if (q[0] < other.min[0] || q[0] > other.max[0] || q[1] < other.min[1] || q[1] > other.max[1] || q[2] < other.min[2] || q[2] > other.max[2]) continue;
      for (const shape of other.shapes) if (pointInShape(shape, q)) return true;
    }
  }
  return false;
}

function boundsOf(shapes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const shape of shapes) for (const p of shapeSurfaceSamples(shape)) {
    for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], p[axis]); max[axis] = Math.max(max[axis], p[axis]); }
  }
  return { min, max };
}

/**
 * The station box: grown from the torso 1 cm a face at a time, up to the body's bounds, while each new face's 3 cm
 * samples stay inside the shell; of three growth orders (every face in turn, across before up and down, up and down
 * before across) the largest box. Never a corner through armour.
 */
function growBoxInShell(bounds, shell, seed) {
  const grow = (phases) => {
    const box = { min: seed.map((value) => value - 0.02), max: seed.map((value) => value + 0.02) };
    const faceInside = (axis, value) => {
      const [a, b] = [0, 1, 2].filter((other) => other !== axis);
      const na = Math.max(1, Math.round((box.max[a] - box.min[a]) / 0.03));
      const nb = Math.max(1, Math.round((box.max[b] - box.min[b]) / 0.03));
      for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
        const p = [0, 0, 0];
        p[axis] = value;
        p[a] = box.min[a] + (box.max[a] - box.min[a]) * i / na;
        p[b] = box.min[b] + (box.max[b] - box.min[b]) * j / nb;
        if (!shell.inside(p, 0)) return false;
      }
      return true;
    };
    for (const faces of phases) {
      const open = new Set(faces);
      while (open.size) {
        for (const face of faces) {
          if (!open.has(face)) continue;
          const axis = face >> 1, side = face & 1;
          const next = side ? Math.min(bounds.max[axis], box.max[axis] + 0.01) : Math.max(bounds.min[axis], box.min[axis] - 0.01);
          if (next === (side ? box.max[axis] : box.min[axis]) || !faceInside(axis, next)) { open.delete(face); continue; }
          if (side) box.max[axis] = next; else box.min[axis] = next;
        }
      }
    }
    return box;
  };
  const all = [0, 1, 2, 3, 4, 5], across = [0, 1, 4, 5], vertical = [2, 3];
  const volume = (box) => box.min.reduce((product, value, axis) => product * (box.max[axis] - value), 1);
  let best = null;
  for (const phases of [[all], [across, vertical, all], [vertical, across, all]]) {
    const box = grow(phases);
    if (!best || volume(box) > volume(best) + 1e-9) best = box;
  }
  return best;
}

/** Shrink a shape about its own centre until its samples are inside the shell (trimmed stations only). */
function trimShape(shape, shell) {
  const center = shape.kind === 'ellipsoid' ? shape.center : shape.a.map((value, axis) => (value + shape.b[axis]) / 2);
  const scaled = (s) => shape.kind === 'ellipsoid'
    ? { kind: 'ellipsoid', center: shape.center.slice(), radii: shape.radii.map((value) => value * s) }
    : {
      kind: 'capsule', radius: shape.radius * s,
      a: shape.a.map((value, axis) => center[axis] + (value - center[axis]) * s),
      b: shape.b.map((value, axis) => center[axis] + (value - center[axis]) * s),
    };
  const fits = (candidate) => shapeSurfaceSamples(candidate).every((p) => shell.inside(p, 0.006));
  if (fits(shape)) return shape;
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (fits(scaled(mid))) lo = mid; else hi = mid; }
  return lo > 0.15 ? scaled(lo) : null;
}

/** A head the trim would lose (its centre over a low roof) slides down, 2 cm at a time up to 30 cm, and shrinks to fit. */
function lowerHead(shape, shell) {
  let best = null;
  for (let drop = 0.02; drop <= 0.3 + 1e-9; drop += 0.02) {
    const moved = translate(shape, [0, -drop, 0]);
    const scaled = (s) => ({ kind: 'ellipsoid', center: moved.center.slice(), radii: moved.radii.map((value) => value * s) });
    const fits = (candidate) => shapeSurfaceSamples(candidate).every((p) => shell.inside(p, 0.006));
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (fits(scaled(mid))) lo = mid; else hi = mid; }
    if (lo > 0 && (!best || lo > best.lo + 1e-9)) best = { lo, shape: scaled(lo) };
    if (lo >= 0.5) break;
  }
  return best?.shape ?? null;
}

const roundShape = (shape) => shape.kind === 'ellipsoid'
  ? { kind: 'ellipsoid', center: shape.center.map(ROUND), radii: shape.radii.map(ROUND) }
  : { kind: 'capsule', a: shape.a.map(ROUND), b: shape.b.map(ROUND), radius: ROUND(shape.radius) };

/**
 * Seat one station. `anchor` is the station's legacy combat box (frame-local); `frame` 'hull' | 'turret'.
 * Returns the seat record (rounded) or null when the frame has no shell.
 */
function seatStation({ armor, anchor, frame, station, ladders, fallback, placed, limit }) {
  const shell = makeShell(armor, frame, 'axis', limit);
  if (!shell.cells.length) return null;
  const armour = makeShell(armor, frame, false);
  const center = anchor.min.map((value, axis) => (value + anchor.max[axis]) / 2);
  const side = stationSideSign(station);
  const obstacleSets = [
    { relaxed: null, boxes: obstacleBoxes(armor, frame, new Set([...HARD_OBSTACLES, ...SOFT_OBSTACLES])), crew: true, limbs: true },
    { relaxed: 'stowage', boxes: obstacleBoxes(armor, frame, HARD_OBSTACLES), crew: true, limbs: true },
    { relaxed: 'modules', boxes: [], crew: true, limbs: true },
    { relaxed: 'modules+crew', boxes: [], crew: false },
  ];
  // (249) a placement whose hit shapes, held to the armour, come to fewer than the crew receipt's head, torso, thighs
  // and shins (a pelvis in the turret ring's open gap loses both thighs to it) is passed over by the obstacle passes for
  // the next; the bare pass, the cascade's gate and last resort, keeps it
  const keepsLimbs = (candidate, py) => {
    const offset = [candidate.px, py, candidate.pz];
    let kept = 0;
    for (const shape of candidate.body.parts.shapes) kept += clipToArmour(translate(shape, offset), armour).length;
    return kept >= 5;
  };
  const coarse = (kinds) => {
    const candidates = [];
    kinds.forEach((kind, rank) => {
      for (const tuck of TUCKS) {
        // a standing loader may crouch, not squat: deeper than that he sits
        if (kind === 'loaderStanding' && tuck > 0.6) continue;
        const body = posedBody(kind, tuck);
        // the pelvis that centres the posed body on the station
        const ax = center[0] - body.center[0], az = center[2] - body.center[2];
        for (let ix = -8; ix <= 8; ix++) {
          const px = ax + ix * 0.05;
          // a side station keeps its side of the centreline (it may move outboard freely)
          if (side < 0 && ix > 0 && px > -0.05) continue;
          if (side > 0 && ix < 0 && px < 0.05) continue;
          for (let iz = -16; iz <= 16; iz++) {
            const pz = az + iz * 0.05;
            candidates.push({ body, kind, tuck, px, pz, ix, iz, cost: Math.abs(ix) * 0.05 + Math.abs(iz) * 0.05 * 0.7 + tuck * 0.35 + rank * 0.6 });
          }
        }
      }
    });
    return candidates.sort((a, b) => a.cost - b.cost || a.tuck - b.tuck || a.px - b.px || a.pz - b.pz);
  };
  // 1 cm and 0.05 of tuck around a near miss
  const fine = (near) => {
    const candidates = [];
    for (let dt = -4; dt <= 4; dt++) {
      const tuck = Math.round((near.tuck + dt * 0.05) * 100) / 100;
      if (tuck < 0 || tuck > 1 || (near.kind === 'loaderStanding' && tuck > 0.6)) continue;
      const body = posedBody(near.kind, tuck);
      for (let ix = -5; ix <= 5; ix++) for (let iz = -5; iz <= 5; iz++) {
        const px = near.px + ix * 0.01, pz = near.pz + iz * 0.01;
        candidates.push({ body, kind: near.kind, tuck, px, pz, ix, iz, cost: Math.abs(ix) * 0.01 + Math.abs(iz) * 0.007 + Math.abs(dt) * 0.0175 });
      }
    }
    return candidates.sort((a, b) => a.cost - b.cost || a.tuck - b.tuck || a.px - b.px || a.pz - b.pz);
  };
  const scan = (candidates, within, set) => {
    const states = new Map();
    for (const candidate of candidates) {
      const { body } = candidate;
      let state = states.get(body);
      if (!state) states.set(body, state = { order: body.points.map((_, index) => index) });
      const feasible = feasibleHeights(body, within, set.boxes, candidate.px, candidate.pz, state);
      if (!feasible.length) continue;
      let py = chooseHeight(candidate.kind, feasible);
      // a seat over a crew member already seated may rise within the feasible heights (a commander over his gunner)
      if (set.crew && overlapsPlaced(body, candidate.px, py, candidate.pz, placed)) {
        py = null;
        for (const [lo, hi] of feasible) {
          for (let y = lo; y <= hi + 1e-9 && py === null; y += 0.02) {
            if (!overlapsPlaced(body, candidate.px, y, candidate.pz, placed)) py = y;
          }
          if (py !== null) break;
        }
        if (py === null) continue;
      }
      if (set.limbs && !keepsLimbs(candidate, py)) continue;
      // (266) no pass seats a head the armour cannot hold (one in the ring's open gap clips to nothing)
      if (!clipToArmour(translate(body.parts.shapes[0], [candidate.px, py, candidate.pz]), armour).length) continue;
      return { candidate, py, relaxed: set.relaxed };
    }
    return null;
  };
  const cascade = (candidates, within) => {
    const bare = scan(candidates, within, obstacleSets[obstacleSets.length - 1]);
    if (!bare) return null;
    for (const set of obstacleSets.slice(0, -1)) {
      const found = scan(candidates, within, set);
      if (found) return found;
    }
    return bare;
  };
  // The armour alone first (a station where no posture fits it skips the obstacle passes); then the near misses around
  // the coarse placement that leaves most of the body inside.
  const attempt = (kinds, within) => {
    const candidates = coarse(kinds);
    const found = cascade(candidates, within);
    if (found) return { found, within };
    const best = bestEffortPlacement(candidates, within);
    if (!best) return null;
    const near = cascade(fine(best.candidate), within);
    return near ? { found: near, within } : { best, within };
  };
  // Where no posture fits, the fallback: a hull crew capsule's seat reclines, a turret seat reaches across the full
  // ring; then the best effort, trimmed.
  let result = attempt(ladders, shell);
  if (result?.found) return finishSeat({ ...result.found, shell, armour, trimmed: null });
  const wide = frame === 'turret' ? makeShell(armor, frame, 'full', limit) : shell;
  if (result && (fallback.length > ladders.length || wide !== shell)) {
    const second = attempt(fallback, wide);
    if (second?.found) return finishSeat({ ...second.found, shell: wide, armour, trimmed: null });
    if (second) result = second;
  }
  if (!result) return null;
  const { best, within } = result;
  const outside = 1 - best.inside / best.candidate.body.points.length;
  return finishSeat({ candidate: best.candidate, py: best.py, shell: within, armour, relaxed: 'modules+crew', trimmed: ROUND3(outside) });
}

/** The coarse placement (10 cm, three tucks) that leaves the most of the body inside the shell. */
function bestEffortPlacement(candidates, shell) {
  let best = null;
  for (const candidate of candidates) {
    if (candidate.ix % 2 || candidate.iz % 2 || ![0, 0.4, 1].includes(candidate.tuck)) continue;
    const { body } = candidate;
    const pelvisColumn = shell.column(candidate.px, candidate.pz, 0);
    if (!pelvisColumn.length) continue;
    // each point's column once; then count, per pelvis height, the points inside theirs
    const columns = body.points.map((p) => shell.column(candidate.px + p[0], candidate.pz + p[2]).map(([lo, hi]) => [lo - p[1], hi - p[1]]));
    const lo = pelvisColumn[0][0] - 0.3, hi = pelvisColumn[pelvisColumn.length - 1][1] + 0.3;
    for (let py = lo; py <= hi; py += 0.03) {
      let inside = 0;
      for (const column of columns) if (column.some(([a, b]) => py >= a && py <= b)) inside++;
      if (!best || inside > best.inside || (inside === best.inside && candidate.cost < best.candidate.cost)) best = { candidate, py, inside };
    }
  }
  return best;
}

const CLIP_MARGIN = 0.004;

/**
 * A hit shape held to the armour proper: a capsule crossing the turret ring's open gap keeps the longest piece from
 * each end that stays inside (a torso through the ring: the abdomen in the basket, the chest in the turret); a head is
 * shrunk, or slid down and shrunk, into it.
 */
function clipToArmour(shape, armour) {
  const valid = (candidate) => shapeSurfaceSamples(candidate).every((p) => armour.inside(p, CLIP_MARGIN));
  if (valid(shape)) return [shape];
  if (shape.kind === 'ellipsoid') {
    const fitted = trimShape(shape, armour) ?? lowerHead(shape, armour);
    return fitted ? [fitted] : [];
  }
  const length = Math.hypot(...shape.b.map((value, axis) => value - shape.a[axis]));
  const at = (t) => shape.a.map((value, axis) => value + (shape.b[axis] - value) * t);
  const piece = (from, to) => ({ kind: 'capsule', a: from, b: to, radius: shape.radius });
  const out = [];
  if (valid(piece(shape.a, shape.a))) {
    let good = 0, bad = 1;
    for (let i = 0; i < 12; i++) { const mid = (good + bad) / 2; if (valid(piece(shape.a, at(mid)))) good = mid; else bad = mid; }
    if (good * length >= 0.02) out.push(piece(shape.a, at(good)));
  }
  if (valid(piece(shape.b, shape.b))) {
    let good = 1, bad = 0;
    for (let i = 0; i < 12; i++) { const mid = (good + bad) / 2; if (valid(piece(at(mid), shape.b))) good = mid; else bad = mid; }
    if ((1 - good) * length >= 0.02) out.push(piece(at(good), shape.b));
  }
  return out;
}

const midpoint3 = (a, b) => a.map((value, axis) => (value + b[axis]) / 2);
const capsuleCentre = (shape) => midpoint3(shape.a, shape.b);

function finishSeat({ candidate, py, shell, armour, relaxed, trimmed }) {
  const { body, px, pz } = candidate;
  const offset = [px, py, pz];
  const posed = body.parts.shapes.map((shape) => translate(shape, offset));
  let shapes = posed;
  if (trimmed !== null) {
    // the head is never dropped: the Gallery pins the mannequin's head inside it
    const trimmedHead = trimShape(shapes[0], armour);
    shapes = [trimmedHead ?? lowerHead(shapes[0], armour), ...shapes.slice(1).map((shape) => trimShape(shape, armour))]
      .filter(Boolean);
  }
  shapes = shapes.flatMap((shape) => clipToArmour(shape, armour));
  if (shapes[0]?.kind !== 'ellipsoid') throw new Error('crew seat lost its head shape');
  const head = shapes[0].center.slice();
  const bounds = boundsOf([...shapes, ...body.parts.boots.map((shape) => translate(shape, offset))]);
  const torso = body.parts.shapes[1];
  const seed = torso.a.map((value, axis) => (value + body.parts.shapes[2].b[axis]) / 2 + offset[axis]);
  const box = growBoxInShell(bounds, shell, seed);
  // HE splash strikes the body as head, torso and lap however its hit shapes are split
  const blastPoints = [head, midpoint3(capsuleCentre(posed[1]), capsuleCentre(posed[2])), midpoint3(capsuleCentre(posed[3]), capsuleCentre(posed[4]))];
  const [trunk, hip, knee, shoulder, elbow, neck] = body.params.map(ROUND3);
  return {
    posture: { kind: candidate.kind, tuck: candidate.tuck, trunk, hip, knee, shoulder, elbow, neck },
    pelvis: offset.map(ROUND),
    head: head.map(ROUND),
    min: box.min.map(ROUND),
    max: box.max.map(ROUND),
    shapes: shapes.map(roundShape),
    blastPoints: blastPoints.map((point) => point.map(ROUND)),
    ...(relaxed ? { relaxed } : {}),
    ...(trimmed !== null ? { trimmed } : {}),
  };
}

/**
 * Seats for every crew station of a finalized probe spec (its crew boxes are the legacy stations; its collision shells
 * and modules come from the calibration being written). `layoutKey` picks the drivers' posture family; `ring` is the
 * calibration's turretRing (266: the ring/basket limit, which outranks the crew).
 */
export function fitCrewSeats(spec, layoutKey, ring = null) {
  const armor = spec.armor;
  const pivot = armor.turretPivot || [0, 0, 0];
  const placed = [];
  const seats = [];
  const basket = (armor.crew || []).some((anchor) => anchor.turretLocal);
  const limits = ring && Number.isFinite(ring.rimR) && Number.isFinite(ring.deckY) && (armor.collisionShells?.turret || []).length
    ? { turret: { ringR: ring.rimR }, hull: { ringR: ring.rimR, deckY: ring.deckY, basket } }
    : { turret: null, hull: null };
  for (const anchor of armor.crew || []) {
    const frame = anchor.turretLocal ? 'turret' : 'hull';
    const ladders = crewPostureLadders(spec.id, layoutKey, anchor.crew, frame);
    const fallback = crewFallbackLadders(spec.id, layoutKey, anchor.crew, frame);
    // the crew already seated, in this station's frame (turret at rest)
    const others = placed.map((entry) => {
      if (entry.frame === frame) return entry;
      const shift = frame === 'turret' ? pivot.map((value) => -value) : pivot;
      const shapes = entry.shapes.map((shape) => translate(shape, shift));
      return { frame, shapes, ...boundsOf(shapes) };
    });
    const seat = seatStation({ armor, anchor, frame, station: anchor.station, ladders, fallback, placed: others, limit: limits[frame] });
    if (!seat) continue;
    seats.push({ crew: anchor.crew, frame, ...seat });
    placed.push({ frame, shapes: seat.shapes, ...boundsOf(seat.shapes) });
  }
  return seats;
}

// --- module placement (266) ----------------------------------------------------------------------------------------
// One placement pass resolves the internal volumes against each other in a fixed order: the shell, then the turret
// ring and basket (fitCrewSeats' limits), then the crew (seated first, above), then the sketched modules from hard to
// soft. A module part is judged by the hit shape its box carries (combatAnatomy fits the shape inscribed in the box,
// and the Gallery draws the module over its shapes), not by the box's corners: each part keeps the largest box grown
// from its centre whose inscribed ellipsoid lies inside its frame's armour and clear of the crew's hit shapes and of the
// shapes of the modules placed before it. Measured volumes (the tracks, the ring, the gun, drawn receipts) never move. A
// transmission is carved out of the engine sketch it was derived from (one powerpack bay holds both, side by side); a
// carousel autoloader stays inside the ammunition it carries.
const MODULE_ORDER = Object.freeze(['transmission', 'engine', 'autoloader', 'feedSystem', 'missileRack', 'ammoRack',
  'fuelTank', 'radio', 'optics']);
const FIXED_MODULES = new Set(['trackL', 'trackR', 'turretRing', 'gun', 'gunMount', 'roofGun']);
/** Pairs placed through each other on purpose (later|earlier): the carousel's rounds are ammunition. */
const NESTED = new Set(['ammoRack|autoloader']);
const VOXEL_M = 0.03;
const CREW_PAD_M = 0.01;

const moduleKey = (box) => `${box.module}|${!!box.turretLocal}`;

/** Whether a module's place comes from the sketch (and so from this pass). */
function placeable(box, drawn) {
  return !FIXED_MODULES.has(box.module) && box.external !== true && !box.gunFollow && !box.roofGunFollow
    && !drawn.has(moduleKey(box));
}

/** The ellipsoid inscribed in a box. */
const inscribed = (box) => ({
  kind: 'ellipsoid',
  center: box.min.map((value, axis) => (value + box.max[axis]) / 2),
  radii: box.min.map((value, axis) => (box.max[axis] - value) / 2),
});

/**
 * The largest box grown from the free voxel nearest `part`'s centre, on a grid spanning `part` exactly, whose inscribed
 * ellipsoid holds no blocked voxel. `blocked(p)` names what holds a point inside the armour: 0 (nothing), 1 (crew) or 2
 * (a module); a column outside `column`'s intervals is outside the armour. Also returns the sketch's blocked shares.
 */
function growFreeBox(part, column, blocked) {
  const n = [0, 1, 2].map((axis) => Math.max(1, Math.ceil((part.max[axis] - part.min[axis]) / VOXEL_M - 1e-9)));
  const step = [0, 1, 2].map((axis) => (part.max[axis] - part.min[axis]) / n[axis]);
  const free = new Uint8Array(n[0] * n[1] * n[2]);
  const at = (i, j, k) => (i * n[1] + j) * n[2] + k;
  const walls = [];
  let outside = 0, crew = 0, modules = 0;
  for (let i = 0; i < n[0]; i++) for (let k = 0; k < n[2]; k++) {
    const x = part.min[0] + (i + 0.5) * step[0], z = part.min[2] + (k + 0.5) * step[2];
    const intervals = column(x, z);
    for (let j = 0; j < n[1]; j++) {
      const y = part.min[1] + (j + 0.5) * step[1];
      const by = intervals.some(([lo, hi]) => y >= lo && y <= hi) ? blocked([x, y, z]) : 3;
      if (by === 0) { free[at(i, j, k)] = 1; continue; }
      walls.push(i, j, k);
      if (by === 1) crew++; else if (by === 2) modules++; else outside++;
    }
  }
  const total = n[0] * n[1] * n[2];
  const shares = { outside: outside / total, crew: crew / total, modules: modules / total };
  let seed = null, best = Infinity;
  for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let k = 0; k < n[2]; k++) {
    if (!free[at(i, j, k)]) continue;
    const d = ((i + 0.5 - n[0] / 2) * step[0]) ** 2 + ((j + 0.5 - n[1] / 2) * step[1]) ** 2 + ((k + 0.5 - n[2] / 2) * step[2]) ** 2;
    if (d < best - 1e-12) { best = d; seed = [i, j, k]; }
  }
  if (!seed) return { box: null, shares };
  // a box (voxel index range [lo, hi)) is clear when no blocked voxel centre lies in its inscribed ellipsoid
  const clear = (lo, hi) => {
    const c = [0, 1, 2].map((axis) => (lo[axis] + hi[axis]) / 2);
    const h = [0, 1, 2].map((axis) => (hi[axis] - lo[axis]) / 2);
    for (let w = 0; w < walls.length; w += 3) {
      const di = (walls[w] + 0.5 - c[0]) / h[0];
      if (di * di > 1) continue;
      const dj = (walls[w + 1] + 0.5 - c[1]) / h[1];
      if (di * di + dj * dj > 1) continue;
      const dk = (walls[w + 2] + 0.5 - c[2]) / h[2];
      if (di * di + dj * dj + dk * dk <= 1) return false;
    }
    return true;
  };
  const grow = (phases) => {
    const lo = seed.slice(), hi = seed.map((value) => value + 1);
    for (const faces of phases) {
      const open = new Set(faces);
      while (open.size) {
        for (const face of faces) {
          if (!open.has(face)) continue;
          const axis = face >> 1, up = face & 1;
          if (up ? hi[axis] >= n[axis] : lo[axis] <= 0) { open.delete(face); continue; }
          if (up) hi[axis]++; else lo[axis]--;
          if (!clear(lo, hi)) { if (up) hi[axis]--; else lo[axis]++; open.delete(face); }
        }
      }
    }
    return { lo, hi };
  };
  const all = [0, 1, 2, 3, 4, 5], across = [0, 1, 4, 5], vertical = [2, 3];
  const volume = ({ lo, hi }) => (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
  let grown = null;
  for (const phases of [[all], [across, vertical, all], [vertical, across, all]]) {
    const candidate = grow(phases);
    if (!grown || volume(candidate) > volume(grown)) grown = candidate;
  }
  const edge = (axis, index) => (index === n[axis] ? part.max[axis] : part.min[axis] + index * step[axis]);
  return {
    box: { min: [0, 1, 2].map((axis) => ROUND(edge(axis, grown.lo[axis]))), max: [0, 1, 2].map((axis) => ROUND(edge(axis, grown.hi[axis]))) },
    shares,
  };
}

/**
 * The module seats of a finalized probe spec whose crew `seats` are fitted (fitCrewSeats): every sketched module's
 * parts, placed in MODULE_ORDER. `drawn` holds the keys (`module|turretLocal`) of drawn module receipts, which stay.
 * Returns { seats, report }: the published records and, per module, the share of its sketch's box that lay outside its
 * armour, under crew or under modules placed before it, and the share of the box it kept (a sketch that loses much of
 * itself is listed as a data fix, not only shrunk).
 */
export function placeModules(spec, seats, { drawn = new Set(), ring = null } = {}) {
  const armor = spec.armor;
  const pivot = armor.turretPivot || [0, 0, 0];
  const turretLimit = ring && Number.isFinite(ring.rimR) && (armor.collisionShells?.turret || []).length ? { ringR: ring.rimR } : null;
  const shells = { hull: makeShell(armor, 'hull', false), turret: makeShell(armor, 'turret', false, turretLimit) };
  const toFrame = (frame, from) => (frame === from ? [0, 0, 0] : frame === 'turret' ? pivot.map((value) => -value) : pivot);
  const order = (box) => { const rank = MODULE_ORDER.indexOf(box.module); return rank < 0 ? MODULE_ORDER.length : rank; };
  const modules = (armor.modules || []).filter((box) => placeable(box, drawn))
    .map((box, index) => ({ box, index })).sort((a, b) => order(a.box) - order(b.box) || a.index - b.index).map(({ box }) => box);
  const placed = [];
  const out = [];
  const report = [];
  for (const box of modules) {
    const frame = box.turretLocal ? 'turret' : 'hull';
    const crewShapes = seats.flatMap((seat) => seat.shapes.map((shape) => translate(shape, toFrame(frame, seat.frame))));
    const earlier = placed.filter((entry) => !NESTED.has(`${box.module}|${entry.module}`))
      .flatMap((entry) => entry.parts.map((part) => translate(inscribed(part), toFrame(frame, entry.frame))));
    const blocked = (p) => (crewShapes.some((shape) => pointInShape(shape, p, CREW_PAD_M)) ? 1
      : earlier.some((shape) => pointInShape(shape, p)) ? 2 : 0);
    const column = (x, z) => shells[frame].column(x, z, 0);
    const parts = [];
    let sketched = 0, kept = 0, outside = 0, crew = 0, moduleShare = 0;
    for (const part of box.parts?.length ? box.parts : [box]) {
      const size = part.min.reduce((product, value, axis) => product * (part.max[axis] - value), 1);
      const { box: grown, shares } = growFreeBox(part, column, blocked);
      sketched += size;
      outside += shares.outside * size;
      crew += shares.crew * size;
      moduleShare += shares.modules * size;
      if (!grown) continue;
      parts.push(grown);
      kept += grown.min.reduce((product, value, axis) => product * (grown.max[axis] - value), 1);
    }
    const share = (value) => ROUND3(sketched > 0 ? value / sketched : 0);
    report.push({ module: box.module, frame, sketchedL: ROUND3(sketched * 1000), kept: share(kept), outside: share(outside), crew: share(crew), modules: share(moduleShare), unplaced: !parts.length });
    if (!parts.length) continue;
    placed.push({ module: box.module, frame, parts });
    out.push({ module: box.module, turretLocal: !!box.turretLocal, parts });
  }
  return { seats: out, report };
}
