// src/world/maps/mastKit.ts — guyed lattice masts and the corrugated sheet skin (the buildings and landmarks lane,
// 2026-10-10; the owner, on the relay station's roof mast: "look at this monstrosity" — two legs splaying apart, three
// rungs floating between them and the top pole hanging in the air over the gap).
//
// Every member is built between the points it joins, so it meets them: a leg runs from section joint to section joint,
// each girt and diagonal from one leg's centre line to the next (its ends buried in both legs), each guy from its
// anchor's turnbuckle to the leg it holds. A section's joint carries its bolted flange collars; the head plate caps the
// three legs; the pole stands in the head plate and the beacon sits on the pole. Nothing is placed by eye.
//
// The kit is renderer-agnostic about paint: the caller hands an `emit(geometry, colour, piece)` that paints the part
// (structureKit's vertex colours) and files it under a fracture piece (a section, the head, a guy, an anchor), so each
// piece's triangles stay one contiguous run once the caller merges its parts in order (fractureRuns below; the
// destructible lane's fracture anatomy reads runs, OBBs and links from there).
import * as THREE from 'three';

type Vec3 = readonly [number, number, number];
/** Paints a part and files it under a fracture piece; returns the part. */
type MastEmit = (geometry: THREE.BufferGeometry, colour: number, piece: string) => THREE.BufferGeometry;

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * A round member from `a` to `b` (radius `r`, `sides` facets; open-ended unless capped: a lattice member's ends are
 * buried in the members it joins). UVs run along the member at the light kit's 0.55 per metre.
 */
function strut(a: Vec3, b: Vec3, r: number, sides = 6, capped = false): THREE.BufferGeometry {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 1e-6)) throw new Error('strut: zero-length member');
  const geometry = new THREE.CylinderGeometry(r, r, length, sides, 1, !capped);
  const uv = geometry.getAttribute('uv');
  const around = Math.max(0.12, 2 * Math.PI * r * 0.55), along = Math.max(0.12, length * 0.55);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * along);
  _dir.set(dx / length, dy / length, dz / length);
  _q.setFromUnitVectors(UP, _dir);
  geometry.applyQuaternion(_q);
  geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return geometry;
}

/** A flat-faced bar of `w` × `t` section from `a` to `b` (a box turned onto the segment; `roll` about its own axis). */
export function bar(a: Vec3, b: Vec3, w: number, t: number, roll = 0): THREE.BufferGeometry {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 1e-6)) throw new Error('bar: zero-length member');
  const geometry = new THREE.BoxGeometry(w, length, t);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, t) * 0.55, uv.getY(i) * length * 0.55);
  if (roll) geometry.rotateY(roll);
  _dir.set(dx / length, dy / length, dz / length);
  _q.setFromUnitVectors(UP, _dir);
  geometry.applyQuaternion(_q);
  geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return geometry;
}

interface LatticeMastColours {
  leg: number;
  brace: number;
  joint: number;
  head: number;
  pole: number;
  beaconHousing: number;
  beacon: number;
  guy: number;
  turnbuckle: number;
  anchor: number;
  padeye: number;
  dish: number;
}

const GALVANISED_MAST: LatticeMastColours = Object.freeze({
  leg: 0x9aa1a5, brace: 0x8e9599, joint: 0x6f767b, head: 0x5f6569, pole: 0x7d8388,
  beaconHousing: 0x3b3f42, beacon: 0xc8692b, guy: 0x3e4245, turnbuckle: 0x575c60,
  anchor: 0x8b8b86, padeye: 0x4c5156, dish: 0xd9d9d2,
});

interface LatticeMastOptions {
  /** the mast's axis in the caller's frame */
  x: number;
  z: number;
  /** the top of whatever it stands on (the base plate sits on it) */
  baseY: number;
  /** the lattice's height, base plate to head plate (m) */
  height: number;
  /** the face width of the triangular section (m) */
  face: number;
  /** (round 6) a self-supporting tower's face width at its head: the legs taper straight from `face` at the base */
  topFace?: number;
  /** (round 6) each leg on its own base plate (the caller's footing under it), in place of the one plate under all three */
  footed?: boolean;
  /** section length between flanged joints (m) */
  section?: number;
  legRadius?: number;
  braceRadius?: number;
  /** the pole over the head plate (m) */
  pole?: number;
  /** the beacon's lens (night emission); the caller tags it (worldNightEmissionGeometry markWorldBeacon) */
  beacon?: (lens: THREE.BufferGeometry) => THREE.BufferGeometry;
  /** the guys: their anchors (one per leg, in leg order), each anchor's top surface y, and the lattice fractions they hold */
  guys?: { anchors: readonly Vec3[]; levels: readonly number[] };
  /** a dish on a side arm off this leg at this fraction of the lattice height */
  dish?: { leg: number; level: number; radius: number };
  colours?: LatticeMastColours;
  /** yaw of the triangle (radians): leg 0 points along +z when 0 */
  yaw?: number;
}

interface LatticeMastReceipt {
  legs: number;
  sections: number;
  members: number;
  guys: number;
  /** the beacon lens's top over the caller's frame (m) */
  top: number;
  /** the lattice's leg positions at the base, for anchors and guards */
  legBase: Vec3[];
}

/**
 * A guyed triangular lattice mast: a base plate, three legs in flanged sections, zig-zag diagonals on every face with a
 * girt at each section's ends, the head plate, the pole and the beacon, the guys from the legs to their anchors through
 * turnbuckles, and an optional dish on a side arm. Pieces: `mast-base`, `mast-section-<n>`, `mast-head`, `mast-guy-<k>`,
 * `mast-anchor-<k>`, `mast-dish`.
 */
export function buildLatticeMast(options: LatticeMastOptions, emit: MastEmit): LatticeMastReceipt {
  const c = options.colours ?? GALVANISED_MAST;
  const { x: cx, z: cz, baseY, height, face } = options;
  const sectionLength = options.section ?? 2.2;
  const rLeg = options.legRadius ?? 0.034, rBrace = options.braceRadius ?? 0.016, rGirt = rBrace * 1.15;
  const yaw = options.yaw ?? 0;
  const R = face / Math.sqrt(3), RTop = (options.topFace ?? face) / Math.sqrt(3);
  const legAngle = (i: number) => yaw + Math.PI / 2 + (i * 2 * Math.PI) / 3;
  const plate = 0.03, foot = baseY + plate, top = foot + height;
  // (a tapered tower's legs run straight from the base's radius to the head's; an untapered mast's stay at R)
  const radiusAt = (y: number) => (RTop === R ? R : R + (RTop - R) * Math.max(0, Math.min(1, (y - foot) / height)));
  const legAt = (i: number, y: number): Vec3 => [cx + Math.cos(legAngle(i)) * radiusAt(y), y, cz + Math.sin(legAngle(i)) * radiusAt(y)];
  let members = 0;
  if (options.footed) {
    // each leg's square base plate on its footing, the leg's shoe on it
    for (let i = 0; i < 3; i++) {
      const [lx, , lz] = legAt(i, foot);
      const shoe = new THREE.BoxGeometry(0.3, plate, 0.3);
      shoe.rotateY(-legAngle(i));
      emit(shoe.translate(lx, baseY + plate / 2, lz), c.head, 'mast-base');
      emit(new THREE.CylinderGeometry(rLeg * 1.6, rLeg * 1.9, 0.07, 6, 1).translate(lx, foot + 0.035, lz), c.joint, 'mast-base');
    }
  } else {
    // the base plate on its support, a bolt at each leg
    const basePlate = new THREE.CylinderGeometry(R * 1.55, R * 1.55, plate, 3, 1);
    basePlate.rotateY(yaw);
    emit(basePlate.translate(cx, baseY + plate / 2, cz), c.head, 'mast-base');
    for (let i = 0; i < 3; i++) {
      const [lx, , lz] = legAt(i, 0);
      emit(new THREE.CylinderGeometry(rLeg * 1.6, rLeg * 1.9, 0.07, 6, 1).translate(lx, foot + 0.035, lz), c.joint, 'mast-base');
    }
  }
  // the sections: legs, the flange collars at each joint, the girts at both ends, the zig-zag diagonals between
  const sections = Math.max(1, Math.ceil(height / sectionLength - 1e-6));
  for (let s = 0; s < sections; s++) {
    const y0 = foot + (s * height) / sections, y1 = foot + ((s + 1) * height) / sections, piece = `mast-section-${s}`;
    for (let i = 0; i < 3; i++) { emit(strut(legAt(i, y0), legAt(i, y1), rLeg, 6), c.leg, piece); members++; }
    if (s < sections - 1) {
      for (let i = 0; i < 3; i++) {
        const [lx, , lz] = legAt(i, y1);
        emit(new THREE.CylinderGeometry(rLeg * 2.0, rLeg * 2.0, 0.07, 6, 1).translate(lx, y1, lz), c.joint, piece);
      }
    }
    // (a tapered tower's panels by its face at the section's middle: the bracing keeps its angle as the legs close in)
    const panels = Math.max(2, Math.round((y1 - y0) / (RTop === R ? face : radiusAt((y0 + y1) / 2) * Math.sqrt(3))));
    const ph = (y1 - y0) / panels;
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      // the girts a few centimetres inside the section's ends, so the flange stays clear
      emit(strut(legAt(i, y0 + 0.05), legAt(j, y0 + 0.05), rGirt, 4), c.brace, piece);
      emit(strut(legAt(i, y1 - 0.05), legAt(j, y1 - 0.05), rGirt, 4), c.brace, piece);
      members += 2;
      for (let p = 0; p < panels; p++) {
        const ya = y0 + 0.05 + p * (ph - 0.1 / panels), yb = ya + ph - 0.1 / panels;
        const [from, to] = p % 2 === 0 ? [i, j] : [j, i];
        emit(strut(legAt(from, ya), legAt(to, yb), rBrace, 4), c.brace, piece);
        members++;
      }
    }
  }
  // the head plate over the legs, the pole standing in it, the beacon on the pole
  const headPlate = new THREE.CylinderGeometry(RTop * 1.35, RTop * 1.35, 0.04, 3, 1);
  headPlate.rotateY(yaw);
  emit(headPlate.translate(cx, top + 0.02, cz), c.head, 'mast-head');
  const poleLength = options.pole ?? 1.2, rPole = Math.max(0.035, rLeg * 1.2);
  emit(strut([cx, top + 0.02, cz], [cx, top + 0.04 + poleLength, cz], rPole, 8, true), c.pole, 'mast-head');
  const housingY = top + 0.04 + poleLength;
  emit(new THREE.CylinderGeometry(0.1, 0.075, 0.06, 10, 1).translate(cx, housingY + 0.03, cz), c.beaconHousing, 'mast-head');
  const lens = new THREE.CylinderGeometry(0.12, 0.12, 0.17, 10, 1).translate(cx, housingY + 0.06 + 0.085, cz);
  emit(options.beacon ? options.beacon(lens) : lens, c.beacon, 'mast-head');
  emit(new THREE.CylinderGeometry(0.04, 0.11, 0.05, 10, 1).translate(cx, housingY + 0.23 + 0.025, cz), c.beaconHousing, 'mast-head');
  const lensTop = housingY + 0.23 + 0.05;
  // the guys: from each anchor's padeye through a turnbuckle to the leg it holds, at each level
  let guys = 0;
  if (options.guys) {
    const { anchors, levels } = options.guys;
    anchors.forEach((anchor, k) => {
      const leg = k % 3, [ax, ay, az] = anchor;
      // the anchor block and its padeye turned to the mast
      emit(new THREE.BoxGeometry(0.34, 0.12, 0.34).translate(ax, ay + 0.06, az), c.anchor, `mast-anchor-${k}`);
      const toward = Math.atan2(cx - ax, cz - az);
      const eye = new THREE.BoxGeometry(0.035, 0.16, 0.12);
      eye.rotateY(toward);
      emit(eye.translate(ax, ay + 0.12 + 0.08, az), c.padeye, `mast-anchor-${k}`);
      const eyeTop: Vec3 = [ax, ay + 0.12 + 0.15, az];
      for (const level of levels) {
        const attach = legAt(leg, foot + height * level);
        const dx = attach[0] - eyeTop[0], dy = attach[1] - eyeTop[1], dz = attach[2] - eyeTop[2];
        const length = Math.hypot(dx, dy, dz);
        const along = (t: number): Vec3 => [eyeTop[0] + (dx * t) / length, eyeTop[1] + (dy * t) / length, eyeTop[2] + (dz * t) / length];
        // the turnbuckle's body from just past the padeye, the wire from its end to the leg's centre line
        emit(strut(along(-0.01), along(0.42), 0.022, 6, true), c.turnbuckle, `mast-guy-${guys}`);
        emit(strut(along(0.4), attach, 0.0085, 4), c.guy, `mast-guy-${guys}`);
        guys++;
      }
    });
  }
  // a dish on a side arm off a leg
  if (options.dish) {
    const { leg, level, radius } = options.dish;
    const y = foot + height * level, root = legAt(leg, y);
    const out = [Math.cos(legAngle(leg)), 0, Math.sin(legAngle(leg))] as const;
    const tip: Vec3 = [root[0] + out[0] * 0.42, y, root[2] + out[2] * 0.42];
    emit(strut(root, tip, 0.03, 6, true), c.joint, 'mast-dish');
    // the dish: a shallow cone open to the outside, its back on the arm's tip
    const dish = new THREE.CylinderGeometry(radius, radius * 0.22, radius * 0.38, 14, 1, true);
    dish.rotateZ(-Math.PI / 2);
    dish.rotateY(-legAngle(leg));
    const mid: Vec3 = [tip[0] + out[0] * radius * 0.19, y, tip[2] + out[2] * radius * 0.19];
    emit(dish.translate(mid[0], mid[1], mid[2]), c.dish, 'mast-dish');
    // its back cap, and the feed on its strut
    const back = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, 0.02, 14, 1);
    back.rotateZ(-Math.PI / 2);
    back.rotateY(-legAngle(leg));
    emit(back.translate(tip[0], tip[1], tip[2]), c.dish, 'mast-dish');
    const feed: Vec3 = [tip[0] + out[0] * radius * 0.85, y, tip[2] + out[2] * radius * 0.85];
    emit(strut(tip, feed, 0.012, 4, true), c.joint, 'mast-dish');
    // the feed horn at the boom's end, opening back into the dish
    const horn = new THREE.CylinderGeometry(0.035, 0.05, 0.09, 8, 1);
    horn.rotateZ(-Math.PI / 2);
    horn.rotateY(-legAngle(leg));
    emit(horn.translate(feed[0], feed[1], feed[2]), c.joint, 'mast-dish');
  }
  return { legs: 3, sections, members, guys, top: lensTop, legBase: [0, 1, 2].map((i) => legAt(i, foot)) };
}

/**
 * The same mast fallen across a wreck: `sections` lower sections lying along `heading` from (x, z), kinked at their
 * joint where they struck, their legs on the ground. Its own parts only (the caller's debris keeps its stream).
 */
export function buildFallenMast(
  options: { x: number; z: number; heading: number; face: number; sections: number; section?: number; kink?: number;
    colours?: LatticeMastColours; legRadius?: number; braceRadius?: number },
  emit: MastEmit,
): number {
  const c = options.colours ?? GALVANISED_MAST;
  const length = options.section ?? 2.2, rLeg = options.legRadius ?? 0.034, rBrace = options.braceRadius ?? 0.016;
  const R = options.face / Math.sqrt(3), kink = options.kink ?? 0.22;
  // the triangle across the run lies rolled a little off one face, its lowest leg resting on the ground
  const legAngle = (i: number) => Math.PI / 2 + (i * 2 * Math.PI) / 3 + 0.35;
  const lowest = Math.min(...[0, 1, 2].map((i) => Math.sin(legAngle(i))));
  let members = 0, heading = options.heading;
  let ox = options.x, oz = options.z;
  for (let s = 0; s < options.sections; s++) {
    const ux = Math.sin(heading), uz = Math.cos(heading), vx = Math.cos(heading), vz = -Math.sin(heading);
    const legAt = (i: number, t: number): Vec3 => {
      const a = legAngle(i), off = Math.cos(a) * R, up = (Math.sin(a) - lowest) * R + rLeg;
      return [ox + ux * t + vx * off, up, oz + uz * t + vz * off];
    };
    const piece = `mast-fallen-${s}`;
    for (let i = 0; i < 3; i++) { emit(strut(legAt(i, 0), legAt(i, length), rLeg, 6), c.leg, piece); members++; }
    const panels = Math.max(2, Math.round(length / options.face));
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      for (let p = 0; p < panels; p++) {
        const ta = (p / panels) * length, tb = ((p + 1) / panels) * length;
        const [from, to] = p % 2 === 0 ? [i, j] : [j, i];
        emit(strut(legAt(from, ta), legAt(to, tb), rBrace, 4), c.brace, piece);
        members++;
      }
    }
    ox += ux * length; oz += uz * length;
    heading += kink * (s % 2 === 0 ? 1 : -0.6);
  }
  return members;
}

interface CorrugatedFaceOptions {
  width: number;
  y0: number;
  y1: number;
  /** rib pitch (m) */
  pitch?: number;
  /** profile depth: the crests at z = 0, the valleys at z = -depth */
  depth?: number;
  /** the crest's flat width (m) */
  crest?: number;
  /** a vertex colour from the point (local x along the face, y) */
  colourAt: (x: number, y: number) => THREE.Color;
}

/**
 * A trapezoidal sheet skin across one face, in its own frame: across x from -width/2 to width/2, up y from y0 to y1, the
 * crests at z = 0 and the valleys `depth` behind. Flat-faceted (each facet its own normal), so the ribs read in light
 * and shade at any distance; UVs at the light kit's 0.55 per metre; welded by position (one solid per face).
 */
export function corrugatedFace(options: CorrugatedFaceOptions): THREE.BufferGeometry {
  const pitch = options.pitch ?? 0.2, depth = options.depth ?? 0.03, crest = options.crest ?? 0.05;
  const slope = Math.min(0.03, (pitch - crest) / 4), valley = pitch - crest - 2 * slope;
  const half = options.width / 2;
  const ribs = Math.max(1, Math.round(options.width / pitch));
  const step = options.width / ribs, k = step / pitch;
  // the profile's points across the face: valley, rise, crest, fall, ...
  const profile: Array<[number, number]> = [[-half, -depth]];
  for (let r = 0; r < ribs; r++) {
    const x0 = -half + r * step;
    profile.push([x0 + (valley / 2) * k, -depth], [x0 + (valley / 2 + slope) * k, 0],
      [x0 + (valley / 2 + slope + crest) * k, 0], [x0 + (valley / 2 + 2 * slope + crest) * k, -depth]);
  }
  profile.push([half, -depth]);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colours: number[] = [];
  const { y0, y1 } = options;
  for (let i = 0; i + 1 < profile.length; i++) {
    const [xa, za] = profile[i], [xb, zb] = profile[i + 1];
    if (Math.hypot(xb - xa, zb - za) < 1e-6) continue;
    // the facet's outward normal (its profile segment turned toward +z)
    const nx = -(zb - za), nz = xb - xa, nl = Math.hypot(nx, nz) || 1;
    const quad: Array<[number, number, number]> = [[xa, y0, za], [xb, y0, zb], [xb, y1, zb], [xa, y0, za], [xb, y1, zb], [xa, y1, za]];
    for (const [px, py, pz] of quad) {
      positions.push(px, py, pz);
      normals.push(nx / nl, 0, nz / nl);
      uvs.push((px + half) * 0.55, py * 0.55);
      const colour = options.colourAt(px, py);
      colours.push(colour.r, colour.g, colour.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

/** One fracture piece's contiguous triangle run in a merged geometry (merged in the parts' order). */
interface FractureRun {
  piece: string;
  firstTriangle: number;
  triangleCount: number;
}

/**
 * The contiguous triangle runs of each piece in the merge of `parts` (structureKit merges in order, non-indexed): a
 * piece whose parts are not consecutive throws, so a builder can never scatter one piece through another's.
 */
export function fractureRuns(parts: readonly THREE.BufferGeometry[], pieces: readonly string[]): FractureRun[] {
  if (parts.length !== pieces.length) throw new Error('fractureRuns: one piece per part');
  const runs: FractureRun[] = [];
  const closed = new Set<string>();
  let triangle = 0;
  for (let i = 0; i < parts.length; i++) {
    const geometry = parts[i];
    const triangles = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    const piece = pieces[i], last = runs[runs.length - 1];
    if (last && last.piece === piece) last.triangleCount += triangles;
    else {
      if (closed.has(piece)) throw new Error(`fractureRuns: piece ${piece} is not contiguous`);
      if (last) closed.add(last.piece);
      runs.push({ piece, firstTriangle: triangle, triangleCount: triangles });
    }
    triangle += triangles;
  }
  return runs;
}
