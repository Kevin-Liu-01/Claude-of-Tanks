/**
 * propCrush.ts — a prop a hull runs over gives where the hull meets it (destruction core lane, 2026-10-10; the owner:
 * "just let physics work"; the crush waves 350/352: a map vehicle flipped from its paint to the burnt wreck in one frame
 * at first contact, after the hull had driven a metre and more into it, and a hut came back unchanged from under the
 * tracks that crossed its heap).
 *
 * A crush field over the prop's footprint (its own frame, cells of CELL_M) holds, cell by cell, the lowest height a hull
 * has let stand there and the shove the hull has given there; the prop's own triangles are drawn through it. The hull
 * presses where it is now and every cell keeps the worst it has been given, so the prop gives at the hull's front as it
 * arrives (the band ahead of its glacis buckles and is pushed on), pancakes under the tracks behind it, splays at the
 * track edges, sags round all that (the droop: nothing stands higher than the crush beside it allows), and a heap
 * crossed again later is flattened further where the tracks cross it.
 *
 * Heavy plant (Lane C, 2026-10-15, the owner: "destroyed vehicles must crumple"; a 30-tonne dozer pressed flat to a slab
 * under a hull read as a model swap): a field may carry a floor, the share of the prop's height a hull cannot press it
 * below (its kind's data: the destructible type's crushFloor). Over a floor the body keeps more of its bulk, its upper
 * works rack over along the hull's travel and its panels buckle, so it ends a crumpled machine, not a pancake.
 *
 * Map cars (the car-wreck lane, 2026-10-20; Steinburg r5's blind critics, both: a run-over Golf "flattened into a wavy
 * tarp-like sheet with no readable wheels, arches or roofline"): a field may carry the car's anatomy (its belt line and
 * its wheels, vehicleAnatomy, read from its own geometry). Over it the hull's belly, between its tracks, leaves the
 * car its belly's clearance and only the tracks press it to the floor; what stands over a cap is pressed in order — the
 * greenhouse folds down onto the belt line first, the doors buckle into less of themselves, so the roof stays a roof on
 * top of the body — the panels fold in creases, the doors bow out and the roof racks over along the hull's travel; the
 * wheels are never squashed into the heap: they splay out about their outer foot as the cap over them comes down.
 *
 * Pure and deterministic: the field moves only with the hull poses it is given, and the crumple's breakup is hashed
 * from the vertex's rest place. The presentation draws this; the simulation's crush event stays the authority on
 * collision (props.ts: the record's obstacle is ghosted by the event, never by the press).
 */

/** The field's cell (m). */
const CRUSH_CELL_M = 0.2;
/** How far round the prop's footprint the field reaches (m): the splay and the shove leave the footprint a little. */
const MARGIN_M = 0.6;
/** Under the tracks: the floor a crushed body is pressed to (m over the prop's base), and the ramp of the hull's front
 *  (the idlers and the lower glacis ride over it: the cap rises toward the front edge). */
const FLOOR_M = 0.12;
const RAMP_M = 1.1;
const RAMP_H = 0.55;
/** The band ahead of the hull's front edge that its glacis meets first (m), its shove at the contact (m) and how far it
 *  presses that band down there (a share of the prop's height). */
const AHEAD_M = 0.55;
const PUSH_M = 0.2;
const AHEAD_SAG = 0.18;
/** The band beside the tracks (m): the splay outward (m) and the cap's rise across it. */
const SIDE_M = 0.5;
const SPLAY_M = 0.22;
/** The droop: no cell stands higher than its neighbour's cap plus this much a metre between them. */
const DROOP_SLOPE = 1.15;
/** What is left of the height over a cap (the pancake: the body above it squashed into this share of itself; wave 352:
 *  "a tidy flat heap" — a crushed body keeps some of its bulk). */
const SQUASH = 0.17;
/** The crumple's breakup of a pressed surface (m), and how far a pressed body's sides bulge out as it flattens (m). */
const NOISE_M = 0.1;
const BULGE_M = 0.14;
/** Over a floor (heavy plant): the share of the height over the cap that stands (the crushed upper works keep their
 *  bulk), how far they rack over along the hull's travel per metre over the cap, the panels' buckle (m) and their
 *  breakup (m). */
const HEAVY = { squash: 0.42, rack: 0.5, buckle: 0.07, noise: 0.16 } as const;
/** Canvas (wave 352: "canvas never reads as cloth"): it lies flat, folds in soft waves, drapes down wide and is dragged on
 *  with the hull. */
const CLOTH = { squash: 0.06, noise: 0.03, fold: 0.07, foldK: 5.5, droop: 0.65, push: 0.55, lift: 1 };
/** A car (its anatomy on the field): the belly's clearance between the tracks (m over the base) and the tracks' share of
 *  the hull's half width; what is left of the body under the belt line and of the greenhouse over it once pressed; the
 *  panels' folds (m, and their pitch along and across, 1/m), the doors' bow (m), the roof's rack along the travel (m),
 *  the wheels' splay at the floor (rad) and the breakup's jitter (m). */
const CAR = { belly: 0.42, track: 0.34, body: 0.25, glass: 0.08, crease: 0.05, alongK: 1.6, acrossK: 1.9, bow: 0.12,
  rack: 0.2, splay: 1.15, jitter: 0.012 } as const;

/** A car's anatomy over its field (its own frame): its belt line and its wheels. */
export interface CrushVehicle {
  /** The belt line (the glass's foot, m over the base) and the top. */
  readonly belt: number;
  /** The wheels, packed [zc, yc, r, xIn, xOut, side] (side −1 left, +1 right; xIn/xOut the tyre's |x| span). */
  readonly wheels: Float32Array;
  /** Per vertex of the rest it was read from: the wheel it belongs to, or −1. */
  readonly wheelOf: Int8Array;
  /** Scratch: each wheel's cap over its hub, for one redraw (deformPositions). */
  readonly hubCap: Float32Array;
}

/**
 * A car's anatomy from its own rest positions and surface stream (vehicleMesh.ts `surf`: roughness, metalness, paint
 * mask, `scale` 255 for the normalized bytes): its belt line is the foot of its glass (the 5th percentile of the glass
 * heights over the lower third), its wheels the round clusters of rubber standing on the ground at its flanks. Null when
 * it has no surface stream. Allocates (once per copy, at the crush).
 */
export function vehicleAnatomy(rest: ArrayLike<number>, surf: ArrayLike<number> | null, scale: number, top: number, hw: number): CrushVehicle | null {
  if (!surf) return null;
  const count = Math.floor(rest.length / 3);
  const glass: number[] = [];
  const rubber: number[] = [];
  for (let v = 0; v < count; v++) {
    const rough = surf[v * 3] / scale, metal = surf[v * 3 + 1] / scale, paint = surf[v * 3 + 2] / scale;
    const x = rest[v * 3], y = rest[v * 3 + 1];
    if (rough < 0.12 && metal < 0.25 && paint < 0.05 && y > top * 0.35) glass.push(y);
    else if (rough > 0.8 && metal < 0.05 && paint < 0.05 && y < top * 0.55 && Math.abs(x) > hw * 0.35) rubber.push(v);
  }
  glass.sort((a, b) => a - b);
  const belt = glass.length >= 8 ? glass[Math.floor(glass.length * 0.05)] : top * 0.58;
  // the wheels: on each flank the rubber touching the ground gathers at the axles (a gap of 0.3 m splits two); each
  // wheel's radius is the median of its rubber's circle through the ground under its axle ((dz² + y²) / 2y), so a
  // moulding or a mud flap beside it never stretches it
  const wheels: number[] = [];
  for (const side of [-1, 1]) {
    const flank = rubber.filter((v) => Math.sign(rest[v * 3]) === side);
    const ground = flank.filter((v) => rest[v * 3 + 1] < 0.1).sort((a, b) => rest[a * 3 + 2] - rest[b * 3 + 2]);
    let start = 0;
    for (let k = 1; k <= ground.length; k++) {
      if (k < ground.length && rest[ground[k] * 3 + 2] - rest[ground[k - 1] * 3 + 2] < 0.3) continue;
      let z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
      for (let q = start; q < k; q++) {
        const v = ground[q], ax = Math.abs(rest[v * 3]), z = rest[v * 3 + 2];
        z0 = Math.min(z0, z); z1 = Math.max(z1, z); x0 = Math.min(x0, ax); x1 = Math.max(x1, ax);
      }
      start = k;
      const zc = (z0 + z1) / 2, radii: number[] = [];
      for (const v of flank) {
        const ax = Math.abs(rest[v * 3]), y = rest[v * 3 + 1], dz = rest[v * 3 + 2] - zc;
        if (y < 0.05 || ax < x0 - 0.06 || ax > x1 + 0.06 || Math.abs(dz) > 0.75) continue;
        const r = (dz * dz + y * y) / (2 * y);
        if (r > 0.15 && r < 0.8) radii.push(r);
      }
      if (radii.length < 8) continue;
      radii.sort((a, b) => a - b);
      const r = radii[Math.floor(radii.length / 2)];
      wheels.push(zc, r, r, x0, x1, side);
    }
  }
  const packed = new Float32Array(wheels);
  const wheelOf = new Int8Array(count).fill(-1);
  for (let v = 0; v < count; v++) {
    const x = rest[v * 3], y = rest[v * 3 + 1], z = rest[v * 3 + 2], ax = Math.abs(x);
    for (let w = 0; w < packed.length; w += 6) {
      const r = packed[w + 2] * 1.06, dz = z - packed[w], dy = y - packed[w + 1];
      if (Math.sign(x) === packed[w + 5] && ax > packed[w + 3] - 0.05 && ax < packed[w + 4] + 0.08 && dz * dz + dy * dy < r * r) {
        wheelOf[v] = w / 6;
        break;
      }
    }
  }
  return { belt: Math.max(top * 0.3, Math.min(top * 0.8, belt)), wheels: packed, wheelOf, hubCap: new Float32Array(packed.length / 6) };
}

/** A triangle wave of period 1 in [−1, 1]: a fold's crease (flat-shaded, its ridges read as folded sheet). */
function tri(t: number): number {
  return 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1;
}

/** One prop's field. */
export interface CrushField {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly cell: number;
  /** The prop's rest top (its own frame, m over its base). */
  readonly top: number;
  /** The lowest height a hull has let stand over each cell (Infinity: untouched). */
  readonly cap: Float32Array;
  /** The cap with its droop (settleField). */
  readonly eff: Float32Array;
  /** The shove each cell has been given (its own frame). */
  readonly pushX: Float32Array;
  readonly pushZ: Float32Array;
  /** Pressed at all, and whether the droop is stale. */
  touched: boolean;
  stale: boolean;
  /** Canvas: it drapes and drags (CLOTH). */
  readonly cloth: boolean;
  /** The share of `top` no hull presses it below (0: pressed to the floor; heavy plant: its kind's crushFloor). */
  readonly floor: number;
  /** The travel of the hull that last pressed it (unit, its own frame; 0, 0 untouched): the heavy body racks along it. */
  dirX: number;
  dirZ: number;
  /** A burst's dents (wave 351: a near miss must show): each a crater pushed in along its direction, packed
   *  [cx, cy, cz, dx, dy, dz, r, depth] in the prop's frame, at most MAX_DENTS (the deepest kept). */
  readonly dents: number[];
  /** A car's anatomy (CAR: its belly and tracks, its pressed layers, its wheels), or null. */
  readonly vehicle: CrushVehicle | null;
}

/** A prop keeps this many burst dents at most. */
const MAX_DENTS = 6;

/**
 * A burst's dent on the prop: at (cx, cy, cz), pushed in along (dx, dy, dz) (unit) by `depth` at its middle, falling off
 * over radius `r` as (1 − d²/r²)². Its own frame. Returns whether it was kept.
 */
export function addDent(f: CrushField, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, r: number, depth: number): boolean {
  if (!(r > 0) || !(depth > 0)) return false;
  if (f.dents.length >= MAX_DENTS * 8) {
    // the shallowest goes when a deeper one comes
    let worst = -1, least = depth;
    for (let k = 0; k < f.dents.length; k += 8) if (f.dents[k + 7] < least) { least = f.dents[k + 7]; worst = k; }
    if (worst < 0) return false;
    f.dents.splice(worst, 8);
  }
  f.dents.push(cx, cy, cz, dx, dy, dz, r, depth);
  f.touched = true;
  return true;
}

/** A field over a footprint of half extents (hw, hl) about the prop's origin, its rest top `top` (`vehicle`: a car's
 *  anatomy, vehicleAnatomy). */
export function createCrushField(hw: number, hl: number, top: number, cell = CRUSH_CELL_M, cloth = false, floor = 0,
  vehicle: CrushVehicle | null = null): CrushField {
  const x0 = -hw - MARGIN_M, z0 = -hl - MARGIN_M;
  const nx = Math.max(2, Math.ceil((2 * (hw + MARGIN_M)) / cell) + 1);
  const nz = Math.max(2, Math.ceil((2 * (hl + MARGIN_M)) / cell) + 1);
  const n = nx * nz;
  const cap = new Float32Array(n).fill(Infinity);
  return { x0, z0, nx, nz, cell, top: Math.max(0.2, top), cap, eff: new Float32Array(n).fill(Infinity),
    pushX: new Float32Array(n), pushZ: new Float32Array(n), touched: false, stale: false, cloth, dents: [],
    floor: Math.max(0, Math.min(0.9, floor)), dirX: 0, dirZ: 0, vehicle };
}

/** Whether a hull rectangle (centre, unit forward, half extents; the prop's frame) meets the prop's box (half extents
 *  hw, hl about its origin), the band ahead of the hull's front included (its glacis meets it first). */
export function hullMeetsBox(cx: number, cz: number, fx: number, fz: number, halfLength: number, halfWidth: number,
  hw: number, hl: number): boolean {
  // separating axes: the box's two and the hull's two
  const L = halfLength + AHEAD_M * 0.5, ox = cx + fx * AHEAD_M * 0.5, oz = cz + fz * AHEAD_M * 0.5;
  const rx = -fz, rz = fx;
  // the box's axes
  const ex = Math.abs(fx) * L + Math.abs(rx) * halfWidth, ez = Math.abs(fz) * L + Math.abs(rz) * halfWidth;
  if (Math.abs(ox) > hw + ex || Math.abs(oz) > hl + ez) return false;
  // the hull's axes
  const pf = Math.abs(ox * fx + oz * fz), pr = Math.abs(ox * rx + oz * rz);
  if (pf > L + Math.abs(fx) * hw + Math.abs(fz) * hl) return false;
  if (pr > halfWidth + Math.abs(rx) * hw + Math.abs(rz) * hl) return false;
  return true;
}

/**
 * One hull's press on the field: its centre (cx, cz), unit forward (fx, fz) and half extents, all in the prop's frame.
 * Every cell keeps the lowest cap and the largest shove it has been given. Returns whether anything changed.
 */
export function pressField(f: CrushField, cx: number, cz: number, fx: number, fz: number, halfLength: number, halfWidth: number): boolean {
  const reach = Math.hypot(halfLength + AHEAD_M, halfWidth + SIDE_M);
  const i0 = Math.max(0, Math.floor((cx - reach - f.x0) / f.cell)), i1 = Math.min(f.nx - 1, Math.ceil((cx + reach - f.x0) / f.cell));
  const j0 = Math.max(0, Math.floor((cz - reach - f.z0) / f.cell)), j1 = Math.min(f.nz - 1, Math.ceil((cz + reach - f.z0) / f.cell));
  if (i0 > i1 || j0 > j1) return false;
  let changed = false;
  // heavy plant: nothing pressed below its floor (the hull rides up on it)
  const least = f.floor * f.top;
  for (let j = j0; j <= j1; j++) {
    const pz = f.z0 + j * f.cell - cz;
    for (let i = i0; i <= i1; i++) {
      const px = f.x0 + i * f.cell - cx;
      const u = px * fx + pz * fz, v = -px * fz + pz * fx, av = Math.abs(v);
      if (u > halfLength + AHEAD_M || u < -halfLength || av > halfWidth + SIDE_M) continue;
      const k = j * f.nx + i;
      let cap = Infinity, push = 0, lat = 0;
      if (av <= halfWidth && u <= halfLength) {
        // under the hull: pressed to the floor, the ramp of its front edge letting a little more stand there (canvas is
        // dragged under the tracks too: it keeps being pulled on along the hull's travel)
        const s = halfLength - u;
        cap = FLOOR_M + RAMP_H * Math.max(0, 1 - s / RAMP_M);
        // a car: between the tracks the belly leaves it its clearance; only the tracks press it to the floor
        if (f.vehicle && av < halfWidth * (1 - CAR.track)) cap = Math.max(cap, CAR.belly);
        if (f.cloth) push = CLOTH.push * Math.max(0, 1 - s / (2 * halfLength)) * 0.8;
      } else if (av <= halfWidth) {
        // the band ahead of its front: the glacis meets it, shoves it on and bends it down a little
        const w = 1 - (u - halfLength) / AHEAD_M;
        cap = f.top * (1 - AHEAD_SAG * w);
        push = (f.cloth ? CLOTH.push : PUSH_M) * w;
      } else if (u <= halfLength) {
        // beside the tracks: splayed outward and pressed partway
        const w = 1 - (av - halfWidth) / SIDE_M;
        cap = FLOOR_M + 0.3 + (1 - w) * f.top;
        lat = SPLAY_M * w * (v < 0 ? -1 : 1);
      }
      if (cap < least) cap = least;
      if (cap < f.cap[k] - 1e-4) { f.cap[k] = cap; changed = true; }
      if (push > 0 || lat !== 0) {
        // the shove along the hull's travel and its splay across it, each kept at the largest it has been
        const along = f.pushX[k] * fx + f.pushZ[k] * fz, across = -f.pushX[k] * fz + f.pushZ[k] * fx;
        const nAlong = Math.max(along, push), nAcross = Math.abs(lat) > Math.abs(across) ? lat : across;
        const nx = fx * nAlong - fz * nAcross, nz = fz * nAlong + fx * nAcross;
        if (Math.abs(nx - f.pushX[k]) > 1e-4 || Math.abs(nz - f.pushZ[k]) > 1e-4) {
          f.pushX[k] = nx; f.pushZ[k] = nz; changed = true;
        }
      }
    }
  }
  if (changed) { f.touched = true; f.stale = true; f.dirX = fx; f.dirZ = fz; }
  return changed;
}

/** The droop: each cell's effective cap is the lowest of its own and its neighbours' plus the slope over the distance
 *  between them (a two-pass chamfer over the grid). */
function settleField(f: CrushField): void {
  const { nx, nz, cap, eff } = f;
  eff.set(cap);
  const slope = f.cloth ? CLOTH.droop : DROOP_SLOPE;
  const d1 = slope * f.cell, d2 = slope * f.cell * Math.SQRT2;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let e = eff[k];
      if (i > 0) e = Math.min(e, eff[k - 1] + d1);
      if (j > 0) {
        e = Math.min(e, eff[k - nx] + d1);
        if (i > 0) e = Math.min(e, eff[k - nx - 1] + d2);
        if (i + 1 < nx) e = Math.min(e, eff[k - nx + 1] + d2);
      }
      eff[k] = e;
    }
  }
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      let e = eff[k];
      if (i + 1 < nx) e = Math.min(e, eff[k + 1] + d1);
      if (j + 1 < nz) {
        e = Math.min(e, eff[k + nx] + d1);
        if (i + 1 < nx) e = Math.min(e, eff[k + nx + 1] + d2);
        if (i > 0) e = Math.min(e, eff[k + nx - 1] + d2);
      }
      eff[k] = e;
    }
  }
  f.stale = false;
}

/** A hash in [-1, 1] of a rest place (the crumple's breakup: a prop crushed twice the same crumples the same). */
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(Math.round(x * 37) | 0, 73856093) ^ Math.imul(Math.round(y * 37) | 0, 19349663) ^ Math.imul(Math.round(z * 37) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** A field value at (x, z) in the prop's frame, bilinear (Infinity at an untouched corner reads as the prop's top). */
function sample(f: CrushField, a: Float32Array, x: number, z: number, empty: number): number {
  const gx = Math.max(0, Math.min(f.nx - 1.001, (x - f.x0) / f.cell)), gz = Math.max(0, Math.min(f.nz - 1.001, (z - f.z0) / f.cell));
  const i = Math.floor(gx), j = Math.floor(gz), tx = gx - i, tz = gz - j;
  const k = j * f.nx + i;
  const v00 = Number.isFinite(a[k]) ? a[k] : empty, v10 = Number.isFinite(a[k + 1]) ? a[k + 1] : empty;
  const v01 = Number.isFinite(a[k + f.nx]) ? a[k + f.nx] : empty, v11 = Number.isFinite(a[k + f.nx + 1]) ? a[k + f.nx + 1] : empty;
  return (v00 * (1 - tx) + v10 * tx) * (1 - tz) + (v01 * (1 - tx) + v11 * tx) * tz;
}

/**
 * Draw the prop's rest positions through its field into `out` (both xyz triples, the prop's frame). A vertex over its
 * cell's cap is pressed into a thin layer over it (the order of the heights kept, so a pancaked body is still the body,
 * crumpled), the shove moves it on (its upper parts most), and nothing goes under the prop's base.
 */
export function deformPositions(f: CrushField, rest: ArrayLike<number>, out: Float32Array): void {
  if (f.stale) settleField(f);
  const high = f.top + 10;
  const car = f.vehicle, halfWidth = -f.x0 - MARGIN_M;
  // each wheel's cap over its hub, once a redraw
  if (car) {
    for (let w = 0; w < car.hubCap.length; w++) {
      const o = w * 6;
      car.hubCap[w] = sample(f, f.eff, car.wheels[o + 5] * (car.wheels[o + 3] + car.wheels[o + 4]) * 0.5, car.wheels[o], high);
    }
  }
  for (let v = 0; v < rest.length; v += 3) {
    const x = rest[v], y = rest[v + 1], z = rest[v + 2];
    let cap = sample(f, f.eff, x, z, high);
    let ny = y, nx = x, nz = z;
    if (car) {
      const w = car.wheelOf[v / 3];
      if (w >= 0) {
        // a wheel splays out about its tyre's outer foot as the cap over its hub comes down (never squashed into the heap)
        const o = w * 6, side = car.wheels[o + 5], xOut = side * car.wheels[o + 4];
        const wheelTop = car.wheels[o + 1] + car.wheels[o + 2];
        const hub = car.hubCap[w];
        const k = Math.max(0, Math.min(1, (wheelTop - hub) / Math.max(0.2, wheelTop - FLOOR_M)));
        if (k > 0) {
          const a = CAR.splay * k * Math.sqrt(k), c = Math.cos(a), s = Math.sin(a), dx = x - xOut;
          nx = xOut + dx * c + side * y * s;
          ny = y * c - side * dx * s;
        }
        cap = hub;
      } else if (cap < high) {
        const pressed = Math.max(0, Math.min(1, (f.top - cap) / Math.max(0.2, f.top - FLOOR_M)));
        if (y > cap) {
          // pressed in order: the greenhouse folds down onto the belt line first, the body under it buckles into less of
          // itself (the roof stays on top of the doors, the doors on the sills)
          const bodyOver = Math.max(0, Math.min(y, car.belt) - cap), glassOver = Math.max(0, y - Math.max(car.belt, cap));
          ny = cap + bodyOver * CAR.body + glassOver * CAR.glass;
          const up = Math.min(1, (y - cap) / 0.3);
          // the panels fold in creases across the length and the width (the same rest place folds the same)
          const along = tri(z * CAR.alongK + x * 0.35 + 0.17), across = tri(x * CAR.acrossK - z * 0.25 + 0.61);
          ny += CAR.crease * pressed * up * (0.65 * along + 0.35 * across) + hash3(x, y, z) * CAR.jitter * pressed;
          // the doors bow out at the crushed body's waist, creased with it
          const flank = Math.max(0, Math.min(1, (Math.abs(x) / Math.max(0.3, halfWidth) - 0.55) / 0.4));
          const t = Math.min(1, (y - cap) / Math.max(0.3, f.top - cap));
          nx += Math.sign(x || 1) * flank * pressed * (CAR.bow * 4 * t * (1 - t) + CAR.crease * 0.7 * along);
          // the roof racks over along the hull's travel as the pillars fold
          if (y > car.belt) {
            const rack = CAR.rack * pressed * Math.min(1, (y - car.belt) / Math.max(0.2, f.top - car.belt));
            nx += f.dirX * rack; nz += f.dirZ * rack;
          }
        }
      }
      if (cap < high) {
        const px = sample(f, f.pushX, x, z, 0), pz = sample(f, f.pushZ, x, z, 0);
        if (px !== 0 || pz !== 0) {
          const lift = Math.max(0.25, Math.min(1, (y - FLOOR_M) / Math.max(0.4, f.top * 0.75)));
          nx += px * lift; nz += pz * lift;
        }
      }
    } else if (cap < high) {
      // the crumple's breakup where it is pressed (more where it was pressed further); canvas in soft folds instead
      const pressed = Math.max(0, Math.min(1, (f.top - cap) / f.top));
      if (f.cloth) cap += (Math.sin(x * CLOTH.foldK + z * 1.7) * 0.7 + Math.sin(z * CLOTH.foldK * 0.8 - x) * 0.3) * CLOTH.fold * pressed
        + hash3(x, y, z) * CLOTH.noise * pressed;
      else cap += hash3(x, y, z) * (f.floor > 0 ? HEAVY.noise : NOISE_M) * pressed;
      if (y > cap && f.floor > 0) {
        // heavy plant: the upper works squashed into less of themselves, racked over along the hull's travel (the higher,
        // the further), the panels buckled in waves across them
        const over = y - cap, deep = Math.min(1, pressed / Math.max(0.1, 1 - f.floor));
        ny = cap + over * HEAVY.squash;
        const rack = HEAVY.rack * over * HEAVY.squash * deep;
        nx += f.dirX * rack; nz += f.dirZ * rack;
        const buckle = HEAVY.buckle * deep * Math.sin(x * 5.1 + z * 3.7 + y * 2.3) * Math.sin(z * 4.3 - y * 6.1 + x * 1.9);
        nx += buckle * Math.sign(x || 1); ny += buckle * 0.6; nz += buckle * 0.4 * Math.sign(z || 1);
      } else if (y > cap) {
        ny = cap + (y - cap) * (f.cloth ? CLOTH.squash : SQUASH);
        // a body pressed flat bulges out at its sides (its roof and doors spread), canvas spreads more
        const spread = (f.cloth ? 1.5 : 1) * BULGE_M * pressed * Math.min(1, (y - cap) / Math.max(0.3, f.top * 0.6));
        const r = Math.hypot(x, z) || 1;
        nx += (x / r) * spread * Math.min(1, Math.abs(x) * 2); nz += (z / r) * spread * 0.35;
      }
      const px = sample(f, f.pushX, x, z, 0), pz = sample(f, f.pushZ, x, z, 0);
      if (px !== 0 || pz !== 0) {
        const lift = f.cloth ? CLOTH.lift : Math.max(0.25, Math.min(1, (y - FLOOR_M) / Math.max(0.4, f.top * 0.75)));
        nx += px * lift; nz += pz * lift;
      }
    }
    // a burst's dents: the panels facing it pushed in
    for (let k = 0; k < f.dents.length; k += 8) {
      const ex = x - f.dents[k], ey = y - f.dents[k + 1], ez = z - f.dents[k + 2], r = f.dents[k + 6];
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= r * r) continue;
      const q = 1 - d2 / (r * r), push = f.dents[k + 7] * q * q;
      nx += f.dents[k + 3] * push; ny += f.dents[k + 4] * push; nz += f.dents[k + 5] * push;
    }
    out[v] = nx; out[v + 1] = Math.max(0.015, ny); out[v + 2] = nz;
  }
}

/** Flat normals: each triangle's own, written to its vertices (a shared vertex takes its last triangle's). */
export function flatNormals(position: ArrayLike<number>, index: ArrayLike<number> | null, normal: Float32Array): void {
  const tris = index ? index.length / 3 : position.length / 9;
  for (let t = 0; t < tris; t++) {
    const a = index ? index[t * 3] : t * 3, b = index ? index[t * 3 + 1] : t * 3 + 1, c = index ? index[t * 3 + 2] : t * 3 + 2;
    const ax = position[a * 3], ay = position[a * 3 + 1], az = position[a * 3 + 2];
    const ux = position[b * 3] - ax, uy = position[b * 3 + 1] - ay, uz = position[b * 3 + 2] - az;
    const vx = position[c * 3] - ax, vy = position[c * 3 + 1] - ay, vz = position[c * 3 + 2] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 1e-12)) continue;
    nx /= l; ny /= l; nz /= l;
    normal[a * 3] = nx; normal[a * 3 + 1] = ny; normal[a * 3 + 2] = nz;
    normal[b * 3] = nx; normal[b * 3 + 1] = ny; normal[b * 3 + 2] = nz;
    normal[c * 3] = nx; normal[c * 3 + 1] = ny; normal[c * 3 + 2] = nz;
  }
}

/** A battle tank's contact half width (m): the hull a car's unseen crush is swept with (its belly and tracks). */
const TANK_HALF_WIDTH_M = 1.8;

/**
 * A crush the presentation never saw a hull make (a remote or late event, a hull out of view): a hull of the record's
 * width plus a margin crossing it along (dirX, dirZ) in its own frame, from its near edge to its far one; `k` (0..1) how
 * far along. Writes the hull's centre and forward into `out` [cx, cz, fx, fz, halfLength, halfWidth]. `tank`: a car's
 * crush, swept by a battle tank's own width across its middle (its belly and its tracks where they fall), not a hull
 * wide enough to flatten all of it.
 */
export function sweepPose(hw: number, hl: number, dirX: number, dirZ: number, k: number, out: number[], tank = false): number[] {
  const l = Math.hypot(dirX, dirZ) || 1;
  const fx = dirX / l, fz = dirZ / l;
  // the prop's extent along the travel, and a hull wide enough to cross all of it
  const along = Math.abs(fx) * hw + Math.abs(fz) * hl, across = Math.abs(fz) * hw + Math.abs(fx) * hl;
  // (a car longer across the travel than a tank is wide — a truck, a van crossed side on — is swept whole: the ends a
  // tank's width left standing rose from its ruts as ramps)
  const halfLength = 3.4, halfWidth = tank && across <= TANK_HALF_WIDTH_M + 0.4 ? TANK_HALF_WIDTH_M : Math.max(1.7, across + 0.2);
  const start = -along - halfLength - AHEAD_M, end = along + halfLength;
  const s = start + (end - start) * Math.max(0, Math.min(1, k));
  out[0] = fx * s; out[1] = fz * s; out[2] = fx; out[3] = fz; out[4] = halfLength; out[5] = halfWidth;
  return out;
}
