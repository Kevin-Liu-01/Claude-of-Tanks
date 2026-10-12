// src/world/maps/campKit.ts — the military light kits rebuilt member by member (the destructible-kits lane, round 4,
// 2026-10-11; the owner: "our destructible buildings like the shed and bunkers that need complete redesigns ... improving
// all buildings and their decorations to look as beautiful as possible").
//
// The checkpoint hut, the guard post, the command tent and the motor pool were a handful of boxes each (structureKit's
// first light kit). Each is now built as the thing it is: a clad cabin on its plinth with its windows, door, roof,
// gutter and porch; a guard cabin on braced legs with its ladder; a wall tent on its poles and guy lines; a steel shelter
// on its columns and beams over its pit; and (round 5) the field hospital's two wards with their red crosses, flag and
// stretcher, the desert tent's canvas to the ground with its rolled flaps, rug and fire ring. The writer is
// lightKitWriter.ts, shared with the town kits (townKit.ts). Each stands on the old one's solids (its body, posts, deck, drums and crate
// where the old ones were): structureKit keeps the old build for the collision, so every placement, footprint and
// collision shard stays where it was. Every part carries its piece (userData.piece, 'kind:name') so the settled wreck
// (legacyWreck.ts) breaks the kit by its walls, roofs and posts rather than by its hundreds of members; every member
// meets what holds it (kitConnectivity.selftest: no free bar ends, nothing floating); every roof plane carries its pitch
// receipt. Deterministic in the stream it is given (structureKit spends the old build's draws first: the draw law); the
// stream only paints, so the parts a settled wreck captures are the intact's own.
import * as THREE from 'three';
import { pitchRoofPlane, pitchSkillionRoof } from '../propGeometry.ts';
import {
  Kit, type Opening, type Piece, type Rng, type V3, type Weather, bar, bx, bxn, cladWall, cyl, displace, doorIn, hipRoof,
  hipShell, hoop, pane, prism, solid, windowIn,
} from './lightKitWriter.ts';

/** What the kits need of structureKit: its certifying merge (the connectivity receipt, the settled wreck's capture). */
export interface CampKitContext {
  merge(id: string, parts: THREE.BufferGeometry[]): THREE.BufferGeometry;
}

// ------------------------------------------------------------------------------------------------ the checkpoint hut

// The old hut's solids (structureKit makeCheckpointHut): the body 4.0 x 3.0 x 5.2 on the ground, its roof high over +x;
// side windows z +-1.35 at 1.45-2.45 m; the porch deck at the front (+z) 2.5 x 1.8 to z 4.35, its posts at x +-1.0
// z 4.15 to 2.25 m under a short roof falling from the wall.
const CH = { w: 4.0, d: 5.2, floor: 0.14, eaveLow: 2.86, eaveHigh: 3.22, over: 0.32, inset: 0.06, clad: 0.035 };
const CH_PITCH = Math.atan2(CH.eaveHigh - CH.eaveLow, CH.w);
const CH_PAL = {
  clad: 0x5d6457, trim: 0x343933, frame: 0x2a2e2b, door: 0x4b5243, roof: 0x4f5450, glass: 0x56707a, room: 0x2b2d2b,
  concrete: 0x8a877f, deck: 0x6e5c47, deck2: 0x655440, sign: 0xcfc8ae, red: 0x8e2b22, ink: 0x2b2b29, lamp: 0x272928,
  lens: 0xd8d2b8, pipe: 0x2d2b28, unit: 0x8d9089, fan: 0x2f312f, grille: 0x5d605b, handle: 0xa7aaa6, kick: 0x575b59,
};
/** The wall head over x (the roof's underside: low at -x). */
const chTop = (x: number): number => CH.eaveLow + (CH.eaveHigh - CH.eaveLow) * (x + CH.w / 2) / CH.w;

function buildCheckpointHut(ctx: CampKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0xc4ec);
  const { w, d, floor, inset, clad } = CH, hw = w / 2, hd = d / 2, P = CH_PAL;
  const steel: Weather = { foot: 0.8, runs: 0.7, rust: 0.4, dust: 0.4 };
  const trimW: Weather = { foot: 0.6, runs: 0.4, rust: 0.6 };
  // the plinth, a cast slab a little proud of the walls and down into the ground
  k.add(bx(w + 0.24, floor + 0.08, d + 0.24).translate(0, (floor - 0.08) / 2, 0), P.concrete, 'ground:plinth',
    { w: { foot: 0.5, dust: 0.7 } });
  // the room: the dark inside the windows look into, the cladding on it
  k.add(prism([[-hw + inset, floor], [hw - inset, floor], [hw - inset, chTop(hw - inset) - 0.02], [-hw + inset, chTop(-hw + inset) - 0.02]],
    -hd + inset, hd - inset), P.room, 'block:cabin', { jitter: 0.02, inner: true });
  const side: Opening = { a0: -1.35, a1: 1.35, y0: 1.45, y1: 2.45 };
  const door: Opening = { a0: -0.2, a1: 0.7, y0: floor, y1: 2.14 };
  const front: Opening = { a0: -1.6, a1: -0.75, y0: 1.45, y1: 2.25 };
  const back: Opening = { a0: -0.45, a1: 0.45, y0: 1.6, y1: 2.3 };
  // (the cabin and its walls are one body in the wreck: it caves in and racks over as one, a crushed steel box)
  const E = 'block:cabin', W = E, N = E, S = E;
  cladWall(k, E, P.clad, steel, 'x', hw, clad, -hd, hd, floor, () => chTop(hw), [side]);
  cladWall(k, W, P.clad, steel, 'x', -hw, clad, -hd, hd, floor, () => chTop(-hw), [side]);
  cladWall(k, N, P.clad, steel, 'z', hd, clad, -hw, hw, floor, chTop, [door, front]);
  cladWall(k, S, P.clad, steel, 'z', -hd, clad, -hw, hw, floor, chTop, [back]);
  // the corner angles over the panels' edges (with the side walls) and the foot flashing on the plinth
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = chTop(sx * hw);
    k.add(bx(0.075, top - floor, 0.075).translate(sx * (hw - 0.0175), (floor + top) / 2, sz * (hd - 0.0175)), P.trim,
      sx > 0 ? E : W, { w: trimW });
  }
  for (const s of [-1, 1]) {
    k.add(bx(0.03, 0.11, d - 0.06).translate(s * (hw + 0.004), floor + 0.055, 0), P.trim, s > 0 ? E : W, { w: trimW });
    for (const [a0, a1] of s > 0 ? [[-hw + 0.03, door.a0 - 0.07], [door.a1 + 0.07, hw - 0.03]] : [[-hw + 0.03, hw - 0.03]]) {
      k.add(bx(a1 - a0, 0.11, 0.03).translate((a0 + a1) / 2, floor + 0.055, s * (hd + 0.004)), P.trim, s > 0 ? N : S, { w: trimW });
    }
  }
  // the windows, and a guard of bars over the back one
  for (const s of [-1, 1] as const) windowIn(k, s > 0 ? E : W, P.frame, P.glass, trimW, 'x', s * hw, side, 3, inset);
  windowIn(k, N, P.frame, P.glass, trimW, 'z', hd, front, 1, inset);
  windowIn(k, S, P.frame, P.glass, trimW, 'z', -hd, back, 1, inset);
  for (let i = 0; i < 5; i++) {
    const x = back.a0 + 0.09 + (back.a1 - back.a0 - 0.18) * i / 4;
    k.add(bx(0.018, back.y1 - back.y0 + 0.12, 0.018).translate(x, (back.y0 + back.y1) / 2, -hd - 0.04), P.frame, S, { w: trimW });
  }
  for (const y of [back.y0 - 0.05, back.y1 + 0.05]) {
    k.add(bx(back.a1 - back.a0 + 0.12, 0.03, 0.03).translate(0, y, -hd - 0.04), P.frame, S, { w: trimW });
  }
  // the door: its frame proud, the leaf a little in with its vision panel, kick plate, handle and hinges
  {
    const { a0, a1, y0, y1 } = door, zf = hd + 0.01, cs = 0.07, leafZ = hd - 0.03, xm = (a0 + a1) / 2;
    k.add(bx(a1 - a0 + 2 * cs, cs, 0.04).translate(xm, y1 + cs / 2, zf), P.frame, N, { w: trimW });
    for (const x of [a0 - cs / 2, a1 + cs / 2]) k.add(bx(cs, y1 - y0, 0.04).translate(x, (y0 + y1) / 2, zf), P.frame, N, { w: trimW });
    k.add(bx(a1 - a0, y1 - y0, 0.045, 0.5).translate(xm, (y0 + y1) / 2, leafZ), P.door, N, { w: steel });
    k.add(pane(0.3, 0.36, [0, 0, 1]).translate(xm, y1 - 0.45, leafZ + 0.024), P.glass, N, { jitter: 0.015 });
    k.add(bx(a1 - a0 - 0.08, 0.24, 0.008).translate(xm, y0 + 0.14, leafZ + 0.026), P.kick, N, { w: { foot: 1, rust: 0.5 } });
    k.add(bx(0.14, 0.03, 0.04).translate(a1 - 0.14, y0 + 0.98, leafZ + 0.042), P.handle, N);
    k.add(bx(0.05, 0.11, 0.035).translate(a1 - 0.08, y0 + 0.98, leafZ + 0.035), P.ink, N);
    for (const y of [y0 + 0.32, y1 - 0.32]) k.add(bx(0.035, 0.13, 0.055).translate(a0 + 0.012, y, leafZ + 0.025), P.frame, N);
  }
  // by the door: the sign, the fire extinguisher on its board, the lamp over the door and its conduit
  k.add(bx(0.62, 0.42, 0.02).translate(1.35, 1.72, hd + 0.01), P.sign, N, { w: { runs: 0.8, rust: 0.3 } });
  k.add(bx(0.62, 0.07, 0.022).translate(1.35, 1.89, hd + 0.012), P.red, N, { w: { rust: 0.3 } });
  for (const y of [1.66, 1.58]) k.add(bx(0.4, 0.035, 0.022).translate(1.35, y, hd + 0.012), P.ink, N);
  k.add(bx(0.14, 0.5, 0.025).translate(-0.47, 0.98, hd + 0.0125), P.trim, N, { w: trimW });
  k.add(cyl(0.075, 0.075, 0.42, 10).translate(-0.47, 0.98, hd + 0.1), P.red, N, { w: { rust: 0.2 } });
  k.add(cyl(0.03, 0.04, 0.08, 8).translate(-0.47, 1.23, hd + 0.1), P.ink, N);
  k.add(bx(0.16, 0.11, 0.17).translate(0.25, 2.34, hd + 0.085), P.lamp, N);
  k.add(bx(0.13, 0.015, 0.14).translate(0.25, 2.28, hd + 0.09), P.lens, N, { jitter: 0.01 });
  k.add(bx(0.03, chTop(0.25) - 2.395, 0.03).translate(0.25, (2.395 + chTop(0.25)) / 2, hd + 0.015), P.trim, N);
  // on the back wall, an air conditioner on its brackets with its fan, grille and drain
  {
    const z0 = -hd, ux = 1.15, uy = 1.82, A = 'small:aircon';
    k.add(bx(0.78, 0.52, 0.34, 0.3).translate(ux, uy, z0 - 0.17), P.unit, A, { w: { runs: 0.7, rust: 0.3, dust: 0.6 } });
    k.add(cyl(0.19, 0.19, 0.02, 14).rotateX(Math.PI / 2).translate(ux - 0.12, uy, z0 - 0.35), P.fan, A);
    for (let i = 0; i < 4; i++) k.add(bx(0.2, 0.012, 0.012).translate(ux + 0.24, uy - 0.15 + i * 0.1, z0 - 0.346), P.grille, A);
    for (const x of [ux - 0.3, ux + 0.3]) k.add(bar([x, uy - 0.28, z0 - 0.002], [x, uy - 0.28, z0 - 0.33], 0.04, 0.04), P.trim, A, { w: trimW });
    k.add(bx(0.03, uy - 0.26 - floor - 0.2, 0.03).translate(ux + 0.33, (uy - 0.26 + floor + 0.2) / 2, z0 - 0.02), P.pipe, A);
  }

  // the roof: profiled sheet down the slope (high over +x), its fascias round the eaves and verges, the gutter on the low
  // edge, the stovepipe through it and a whip antenna on its bracket
  const roofW = w + 2 * CH.over, roofD = d + 0.5, t = 0.035;
  const yMid = chTop(0) + t / 2 / Math.cos(CH_PITCH), yAt = (x: number): number => yMid + Math.tan(CH_PITCH) * x;
  k.add(pitchRoofPlane(bx(roofW / Math.cos(CH_PITCH), t, roofD, 0.6), 'x', -1, CH_PITCH, 'skillion').translate(0, yMid, 0),
    P.roof, 'sheet:roof', { uv: 'roof', w: { rust: 0.55, dust: 0.6, runs: 0.3 } });
  for (const sx of [-1, 1]) {
    const x = sx * (roofW / 2 - 0.015);
    k.add(bx(0.03, 0.16, roofD).translate(x, yAt(x) - 0.092, 0), P.trim, 'sheet:roof', { w: trimW });
  }
  for (const sz of [-1, 1]) {
    const x0 = -roofW / 2, x1 = roofW / 2;
    k.add(prism([[x0, yAt(x0) - 0.172], [x1, yAt(x1) - 0.172], [x1, yAt(x1) - 0.012], [x0, yAt(x0) - 0.012]],
      sz * roofD / 2 - 0.015, sz * roofD / 2 + 0.015), P.trim, 'sheet:roof', { w: trimW });
  }
  const gx = -roofW / 2 - 0.06, gy = yAt(-roofW / 2) - 0.15;
  k.add(bx(0.1, 0.075, roofD - 0.02).translate(gx, gy, 0), P.trim, 'sheet:roof', { w: trimW });
  for (const z of [-roofD / 2 + 0.6, 0, roofD / 2 - 0.6]) k.add(bx(0.07, 0.02, 0.03).translate(gx + 0.04, gy + 0.045, z), P.trim, 'sheet:roof');
  {
    const sx = 1.05, sz = -1.55, sy = yAt(sx);
    k.add(cyl(0.065, 0.065, 1.0, 10).translate(sx, sy + 0.48, sz), P.pipe, 'small:stovepipe', { w: { rust: 0.9 } });
    k.add(cyl(0.17, 0.12, 0.08, 10).translate(sx, sy + 1.02, sz), P.pipe, 'small:stovepipe', { w: { rust: 0.9 } });
    k.add(cyl(0.12, 0.12, 0.05, 10).translate(sx, sy + 0.02, sz), P.pipe, 'small:stovepipe', { w: { rust: 0.9 } });
    const ax = 1.75, az = 2.3, ay = yAt(ax);
    k.add(bx(0.1, 0.06, 0.1).translate(ax, ay + 0.03, az), P.trim, 'small:antenna');
    k.add(cyl(0.01, 0.016, 1.6, 6).translate(ax, ay + 0.06 + 0.8, az), P.ink, 'small:antenna');
  }
  // the downpipe from the gutter's back end to its splash block (thrown when the roof comes down)
  {
    const pz = -roofD / 2 + 0.3;
    k.add(cyl(0.035, 0.035, gy - 0.0375 - 0.05, 8).translate(gx, (gy - 0.0375 + 0.05) / 2, pz), P.trim, 'small:downpipe', { w: trimW });
    k.add(bx(0.32, 0.05, 0.22).translate(gx + 0.02, 0.025, pz), P.concrete, 'small:downpipe', { w: { dust: 0.6 } });
    for (const y of [0.8, 1.9]) k.add(bx(0.11, 0.025, 0.09).translate(gx + 0.045, y, pz), P.trim, 'small:downpipe');
  }

  // the porch: a deck of boards on joists, two posts and their beam, a short roof falling from a ledger on the wall
  {
    const z0 = hd + 0.12, z1 = 4.35, beamY = 2.24, postZ = 4.15, ledgerY = 2.5;
    for (const x of [-1.15, 0, 1.15]) k.add(bx(0.09, 0.1, z1 - z0).translate(x, 0.05, (z0 + z1) / 2), P.deck, 'ground:porch-deck', { w: { foot: 1 } });
    const boards = 7, bw = (z1 - z0) / boards;
    for (let i = 0; i < boards; i++) {
      k.add(bx(2.5, 0.04, bw - 0.014).translate(0, 0.12, z0 + bw * (i + 0.5)), i % 3 === 1 ? P.deck2 : P.deck, 'ground:porch-deck',
        { w: { foot: 0.5, dust: 0.6 } });
    }
    for (const s of [-1, 1]) {
      const piece: Piece = s < 0 ? 'post:porch-l' : 'post:porch-r';
      k.add(bx(0.1, beamY - 0.14, 0.1, 0.5).translate(s * 1.0, (beamY + 0.14) / 2, postZ), P.trim, piece, { w: trimW });
      k.add(bx(0.2, 0.012, 0.2).translate(s * 1.0, 0.146, postZ), P.trim, piece);
    }
    k.add(bx(2.3, 0.12, 0.1).translate(0, beamY + 0.06, postZ), P.trim, 'sheet:porch-roof', { w: trimW });
    k.add(bx(2.6, 0.1, 0.06).translate(0, ledgerY - 0.05, hd + 0.03), P.trim, 'sheet:porch-roof', { w: trimW });
    const run = postZ + 0.3 - hd, fall = Math.atan2(ledgerY - (beamY + 0.12), postZ - hd), tp = 0.03;
    const zc = hd + run / 2, yc = ledgerY - Math.tan(fall) * (zc - hd) + tp / 2 / Math.cos(fall);
    k.add(pitchSkillionRoof(bx(2.8, tp, run / Math.cos(fall), 0.45), 'z', 1, fall).translate(0, yc, zc), P.roof, 'sheet:porch-roof',
      { uv: 'sheet', w: { rust: 0.55, dust: 0.6 } });
    const yEdge = ledgerY - Math.tan(fall) * run;
    k.add(bx(2.8, 0.1, 0.03).translate(0, yEdge - 0.05, hd + run - 0.015), P.trim, 'sheet:porch-roof', { w: trimW });
  }
  return ctx.merge('checkpointhut', k.out);
}

/** The hut's caster for the cascades: its body, roof, porch roof and posts as solids. */
function checkpointHutShadow(): THREE.BufferGeometry {
  const { w, d, floor } = CH, hd = d / 2, roofW = w + 2 * CH.over, roofD = d + 0.5;
  return solid([
    bx(w, chTop(0) - floor, d).translate(0, (chTop(0) + floor) / 2, 0),
    bx(roofW / Math.cos(CH_PITCH), 0.2, roofD).rotateZ(CH_PITCH).translate(0, chTop(0) + 0.06, 0),
    bx(2.8, 0.14, 1.85).rotateX(0.09).translate(0, 2.42, hd + 0.93),
    bx(0.1, 2.1, 0.1).translate(-1.0, 1.19, 4.15), bx(0.1, 2.1, 0.1).translate(1.0, 1.19, 4.15),
  ]);
}

// ------------------------------------------------------------------------------------------------ the guard post

// The old post's solids (structureKit makeGuardPost): the cabin 3.2 x 2.6 x 3.2 standing 1.2 m up on four legs at
// x, z +-1.2, its window band at 2.53-3.18 m all round, a 3.9 m roof at 3.84-4.0 m and a ladder on the +x side.
const GP = { w: 3.2, floor: 1.2, plate: 0.04, top: 3.8, inset: 0.06, clad: 0.035, roofW: 3.9, roofH: 0.5, leg: 1.2 };
const GP_PAL = { ...CH_PAL, leg: 0x3b403a, brace: 0x454a42, rail: 0x3d423c, grate: 0x4a4f4a, roof: 0x4c514c };

function buildGuardPost(ctx: CampKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0x6a2d);
  const P = GP_PAL, hw = GP.w / 2, L = GP.leg, y0 = GP.floor + GP.plate, top = GP.top, inset = GP.inset;
  const steel: Weather = { foot: 0.2, runs: 0.8, rust: 0.45, dust: 0.4 };
  const trimW: Weather = { runs: 0.4, rust: 0.6 };
  const legW: Weather = { foot: 0.9, rust: 0.7, runs: 0.3 };
  const legs: [number, number][] = [[-L, -L], [L, -L], [L, L], [-L, L]];
  const frameLo = GP.floor - 0.2;
  // the footings, four cast pads; the legs, square tubes on their base plates up to the floor frame
  for (const [x, z] of legs) k.add(bx(0.5, 0.2, 0.5).translate(x, 0.02, z), P.concrete, 'ground:footings', { w: { dust: 0.6 } });
  legs.forEach(([x, z], i) => {
    const piece: Piece = `post:leg-${i}`;
    k.add(bx(0.16, frameLo - 0.135, 0.16).translate(x, (frameLo + 0.135) / 2, z), P.leg, piece, { w: legW });
    k.add(bx(0.28, 0.015, 0.28).translate(x, 0.1275, z), P.leg, piece, { w: legW });
  });
  // braced in an X on every side, each brace with the leg at its foot (the two a little apart where they cross)
  const outward: V3[] = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
  for (let i = 0; i < 4; i++) {
    const a = legs[i], b = legs[(i + 1) % 4], n = outward[i];
    for (const [from, to, owner, off] of [[a, b, i, 0.009], [b, a, (i + 1) % 4, -0.009]] as const) {
      k.add(bar([from[0] + n[0] * off, 0.34, from[1] + n[2] * off], [to[0] + n[0] * off, frameLo - 0.14, to[1] + n[2] * off], 0.016, 0.07),
        P.brace, `post:leg-${owner}`, { w: legW });
    }
  }
  // the floor frame on the legs (main beams over them, edge beams round it) and the floor plate the cabin stands on
  const C: Piece = 'block:cabin', fy = (frameLo + GP.floor) / 2, fh = GP.floor - frameLo;
  for (const z of [-L, L]) k.add(bx(GP.w, fh, 0.14).translate(0, fy, z), P.leg, C, { w: legW });
  for (const x of [-hw + 0.06, hw - 0.06]) k.add(bx(0.12, fh, GP.w).translate(x, fy, 0), P.leg, C, { w: legW });
  for (const z of [-hw + 0.06, hw - 0.06]) k.add(bx(GP.w - 0.24, fh, 0.12).translate(0, fy, z), P.leg, C, { w: legW });
  k.add(bx(GP.w + 0.08, GP.plate, GP.w + 0.08).translate(0, GP.floor + GP.plate / 2, 0), P.trim, C, { w: trimW });
  // the cabin: its dark room, the cladding round a window band on every side and the door, the corner angles, the head
  k.add(bx(GP.w - 2 * inset, top - y0 - 0.02, GP.w - 2 * inset).translate(0, (y0 + top - 0.02) / 2, 0), P.room, C, { jitter: 0.02, inner: true });
  const band = { y0: 2.42, y1: 3.22 };
  const wide: Opening = { a0: -1.2, a1: 1.2, ...band };
  const door: Opening = { a0: 0.5, a1: 1.3, y0, y1: 3.22 };
  const narrow: Opening = { a0: -1.25, a1: 0.2, ...band };
  cladWall(k, C, P.clad, steel, 'x', -hw, GP.clad, -hw, hw, y0, () => top, [wide]);
  cladWall(k, C, P.clad, steel, 'x', hw, GP.clad, -hw, hw, y0, () => top, [narrow, door]);
  cladWall(k, C, P.clad, steel, 'z', hw, GP.clad, -hw, hw, y0, () => top, [wide]);
  cladWall(k, C, P.clad, steel, 'z', -hw, GP.clad, -hw, hw, y0, () => top, [wide]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(bx(0.075, top - y0, 0.075).translate(sx * (hw - 0.0175), (y0 + top) / 2, sz * (hw - 0.0175)), P.trim, C, { w: trimW });
  }
  for (const s of [-1, 1]) {
    k.add(bx(0.03, 0.1, GP.w).translate(s * (hw + 0.005), top - 0.05, 0), P.trim, C, { w: trimW });
    k.add(bx(GP.w, 0.1, 0.03).translate(0, top - 0.05, s * (hw + 0.005)), P.trim, C, { w: trimW });
  }
  // a rail round the cabin at the panels' joint, stopping at the door's frame
  k.add(bx(0.025, 0.05, GP.w).translate(-hw - 0.0125, 1.9, 0), P.trim, C, { w: trimW });
  k.add(bx(0.025, 0.05, door.a0 - 0.07 + hw).translate(hw + 0.0125, 1.9, (door.a0 - 0.07 - hw) / 2), P.trim, C, { w: trimW });
  for (const s of [-1, 1]) k.add(bx(GP.w + 0.05, 0.05, 0.025).translate(0, 1.9, s * (hw + 0.0125)), P.trim, C, { w: trimW });
  windowIn(k, C, P.frame, P.glass, trimW, 'x', -hw, wide, 3, inset);
  windowIn(k, C, P.frame, P.glass, trimW, 'z', hw, wide, 3, inset);
  windowIn(k, C, P.frame, P.glass, trimW, 'z', -hw, wide, 3, inset);
  windowIn(k, C, P.frame, P.glass, trimW, 'x', hw, narrow, 2, inset);
  doorIn(k, C, 'x', hw, door, trimW, steel, P);
  // the landing before the door on its beams and knee brace, its handrails; the ladder up to it (thrown when it falls)
  {
    const x0 = hw, x1 = hw + 0.7, z0 = 0.4, z1 = 1.4, ly = GP.floor + GP.plate;
    k.add(bx(x1 - x0, 0.04, z1 - z0).translate((x0 + x1) / 2, ly - 0.02, (z0 + z1) / 2), P.grate, C, { w: trimW });
    for (const z of [z0 + 0.08, z1 - 0.08]) k.add(bx(x1 - x0, 0.12, 0.08).translate((x0 + x1) / 2, ly - 0.1, z), P.leg, C, { w: legW });
    k.add(bx(0.06, 0.12, z1 - z0).translate(x1 - 0.03, ly - 0.1, (z0 + z1) / 2), P.leg, C, { w: legW });
    k.add(bar([x1 - 0.1, ly - 0.16, z1 - 0.08], [L, 0.55, L], 0.05, 0.05), P.brace, C, { w: legW });
    for (const z of [z0 + 0.03, z1 - 0.03]) {
      k.add(bx(0.045, 1.0, 0.045).translate(x1 - 0.03, ly + 0.5, z), P.rail, C, { w: trimW });
      for (const y of [ly + 0.5, ly + 0.98]) k.add(bar([x0, y, z], [x1 - 0.03, y, z], 0.04, 0.04), P.rail, C, { w: trimW });
    }
    for (const [za, zb] of [[z0 + 0.03, 0.7], [1.1, z1 - 0.03]]) {
      for (const y of [ly + 0.5, ly + 0.98]) k.add(bx(0.04, 0.04, zb - za).translate(x1 - 0.03, y, (za + zb) / 2), P.rail, C, { w: trimW });
    }
    const lx = x1 + 0.01, LD: Piece = 'small:ladder';
    for (const z of [0.7, 1.1]) k.add(bx(0.05, ly + 1.0, 0.05).translate(lx, (ly + 1.0) / 2, z), P.rail, LD, { w: { foot: 0.8, rust: 0.6 } });
    for (let i = 1; i <= 4; i++) k.add(cyl(0.016, 0.016, 0.4, 6).rotateX(Math.PI / 2).translate(lx, i * 0.27 - 0.04, 0.9), P.rail, LD, { w: { rust: 0.6 } });
  }
  // the hipped roof of profiled sheet down each face, the fascia round its eaves, the vent at its top; a searchlight on
  // its pedestal and a whip antenna (thrown when the roof comes down)
  // (its eaves a little under the walls' head, so the faces' undersides rest on it)
  const R: Piece = 'sheet:roof', rw = GP.roofW, rh = GP.roofH, ey = top - 0.054;
  const roofAt = (x: number, z: number): number => ey + rh * (1 - Math.max(Math.abs(x), Math.abs(z)) / (rw / 2));
  for (const f of hipShell(rw, rh, 0.03)) k.add(f.translate(0, ey, 0), P.roof, R, { uv: 'hip', w: { rust: 0.5, dust: 0.6, runs: 0.3 } });
  for (const s of [-1, 1]) {
    k.add(bx(0.025, 0.14, rw).translate(s * (rw / 2 - 0.0125), ey - 0.07, 0), P.trim, R, { w: trimW });
    k.add(bx(rw - 0.05, 0.14, 0.025).translate(0, ey - 0.07, s * (rw / 2 - 0.0125)), P.trim, R, { w: trimW });
  }
  k.add(cyl(0.1, 0.13, 0.12, 8).translate(0, ey + rh - 0.02, 0), P.trim, R, { w: trimW });
  k.add(cyl(0.16, 0.16, 0.025, 8).translate(0, ey + rh + 0.05, 0), P.trim, R, { w: trimW });
  {
    const sx = -1.45, sz = -0.9, sy = roofAt(sx, sz), SL: Piece = 'small:searchlight';
    k.add(bx(0.09, 0.24, 0.09).translate(sx, sy + 0.1, sz), P.lamp, SL);
    k.add(cyl(0.13, 0.15, 0.3, 10).rotateZ(Math.PI / 2).translate(sx - 0.05, sy + 0.3, sz), P.lamp, SL, { w: { rust: 0.3 } });
    k.add(cyl(0.12, 0.12, 0.012, 10).rotateZ(Math.PI / 2).translate(sx - 0.206, sy + 0.3, sz), P.lens, SL, { jitter: 0.01 });
    const AN: Piece = 'small:antenna';
    k.add(bx(0.08, 0.1, 0.08).translate(0.9, roofAt(0.9, 0.9) + 0.03, 0.9), P.trim, AN);
    k.add(cyl(0.01, 0.016, 1.5, 6).translate(0.9, roofAt(0.9, 0.9) + 0.08 + 0.75, 0.9), P.ink, AN);
  }
  return ctx.merge('guardpost', k.out);
}

function guardPostShadow(): THREE.BufferGeometry {
  const parts = [bx(GP.w, GP.top - (GP.floor - 0.2), GP.w).translate(0, (GP.top + GP.floor - 0.2) / 2, 0), hipRoof(GP.roofW, GP.roofH).translate(0, GP.top, 0),
    bx(0.7, 0.16, 1.0).translate(GP.w / 2 + 0.35, GP.floor - 0.04, 0.9)];
  for (const x of [-GP.leg, GP.leg]) for (const z of [-GP.leg, GP.leg]) parts.push(bx(0.16, 0.9, 0.16).translate(x, 0.55, z));
  return solid(parts);
}

// ------------------------------------------------------------------------------------------------ the command tent

// The old tent's solids (structureKit makeCommandTent): canvas walls 6.2 x 1.15 x 8.2 under a gable roof to 3.5 m,
// three poles through the ridge at z -3, 0, 3 to 3.8 m, a crate 2.4 x 0.9 x 0.9 at the front left (-1.55, 4.25); its
// mast (which stood through the roof's corner) now stands clear of the tent on its guys.
const CT = { w: 6.2, d: 8.2, wall: 1.15, ridge: 3.5, over: 0.14, t: 0.03 };
const CT_PITCH = Math.atan2(CT.ridge - CT.wall, CT.w / 2);
const CT_PAL = {
  wall: 0x6a6d4c, roof: 0x74775a, end: 0x676a4a, band: 0x4c5038, dark: 0x1d201a, mesh: 0x262a20, flap: 0x5c6042,
  pole: 0x3b3e35, rope: 0x8a8366, stake: 0x4a4436, wood: 0x7b6447, wood2: 0x6c5840, batten: 0x5a4a36, stencil: 0x2c2b23,
  mast: 0x3a3d36, radio: 0x4b5240, panel: 0x22241f, pipe: 0x2d2b28, cap: 0x2a2826,
};
/** 0 at the tent's frame stations along z (every 2.05 m from -4.1), 1 midway between them. */
const ctBay = (z: number): number => Math.sin(Math.PI * (z + CT.d / 2) / (CT.d / 4)) ** 2;
/** The roof's underside over x (its eaves at the walls' heads). */
const ctRoof = (x: number): number => CT.wall + (CT.w / 2 - Math.abs(x)) * Math.tan(CT_PITCH);

function buildCommandTent(ctx: CampKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0xc7e7);
  const P = CT_PAL, hw = CT.w / 2, hd = CT.d / 2, t = CT.t, T: Piece = 'block:tent';
  const canvas: Weather = { foot: 0.7, runs: 0.45, dust: 0.45, bleach: 0.8 };
  // the side walls, canvas hung from the eaves and bowed out a little between the frame's stations, a sod cloth along
  // their feet; a mesh window in each middle bay under its rolled-up flap
  for (const s of [-1, 1]) {
    const g = displace(bxn(t, CT.wall, CT.d, 1, 3, 20), (_x, y, z) => [s * 0.018 * Math.sin(Math.PI * (y + CT.wall / 2) / CT.wall) * ctBay(z), 0, 0]);
    k.add(g.translate(s * (hw - t / 2), CT.wall / 2, 0), P.wall, T, { uv: 'sheet', w: canvas });
    k.add(bx(0.012, 0.16, CT.d).translate(s * (hw + 0.004), 0.08, 0), P.band, T, { uv: 'sheet', w: { foot: 1 } });
    for (const zc of [-1.025, 1.025]) {
      k.add(bx(0.01, 0.48, 0.9).translate(s * (hw + 0.028), 0.74, zc), P.mesh, T, { uv: 'sheet', jitter: 0.03 });
      k.add(cyl(0.055, 0.055, 1.0, 8).rotateX(Math.PI / 2).translate(s * (hw + 0.07), 1.04, zc), P.flap, T, { uv: 'sheet', w: canvas });
      for (const dz of [-0.3, 0.3]) k.add(bx(0.012, 0.2, 0.035).translate(s * (hw + 0.13), 1.0, zc + dz), P.band, T);
    }
  }
  // the end walls, the door at the front under its rolled flap, a vent high in the back
  const pent: [number, number][] = [[-hw, 0], [hw, 0], [hw, CT.wall], [0, CT.ridge], [-hw, CT.wall]];
  for (const s of [-1, 1]) k.add(prism(pent, s > 0 ? hd - t : -hd, s > 0 ? hd : -hd + t), P.end, T, { uv: 'sheet', w: canvas });
  k.add(bx(1.5, 1.92, 0.01).translate(0, 0.96, hd + 0.006), P.dark, T, { jitter: 0.03 });
  for (const x of [-0.78, 0.78]) k.add(bx(0.07, 1.96, 0.014).translate(x, 0.98, hd + 0.008), P.band, T, { uv: 'sheet' });
  k.add(cyl(0.09, 0.09, 1.72, 10).rotateZ(Math.PI / 2).translate(0, 2.02, hd + 0.095), P.flap, T, { uv: 'sheet', w: canvas });
  for (const x of [-0.5, 0.5]) k.add(bx(0.04, 0.26, 0.014).translate(x, 1.98, hd + 0.19), P.band, T);
  k.add(bx(0.6, 0.34, 0.01).translate(0, 2.55, -hd - 0.006), P.mesh, T, { jitter: 0.03 });
  // the roof: two canvas planes from the ridge to past the eaves, sagging between the frame's rafters, a ridge cap; the
  // ridge pole's ends out through the gables; the three poles' spikes through the ridge
  const slope = (CT.w / 2) / Math.cos(CT_PITCH), rd = CT.d + 0.24, len = slope + CT.over;
  for (const s of [-1, 1]) {
    // (local x along the slope, from the ridge (-len/2 for +x, +len/2 for -x); y the canvas's normal)
    const g = displace(bxn(len, t, rd, 8, 1, 18), (x, _y, z) => {
      const u = (s > 0 ? x + len / 2 : len / 2 - x) / slope;
      return [0, u < 1 ? -0.07 * Math.sin(Math.PI * u) * ctBay(z) : 0, 0];
    });
    pitchRoofPlane(g, 'x', s > 0 ? 1 : -1, CT_PITCH, 'gable');
    // (seated: its underside through the ridge point and the walls' heads)
    const cx = s * (len / 2) * Math.cos(CT_PITCH) + s * (t / 2) * Math.sin(CT_PITCH), cy = CT.ridge - (len / 2) * Math.sin(CT_PITCH) + (t / 2) * Math.cos(CT_PITCH);
    k.add(g.translate(cx, cy, 0), P.roof, T, { uv: 'sheet', w: { ...canvas, foot: 0 } });
    // its seams over the rafters (where it does not sag) and its eave band, laid on it in its own frame
    const onRoof = (geo: THREE.BufferGeometry): THREE.BufferGeometry => geo.rotateZ(-s * CT_PITCH).translate(cx, cy, 0);
    for (const z of [-CT.d / 2, -CT.d / 4, 0, CT.d / 4, CT.d / 2]) {
      k.add(onRoof(bx(len, 0.006, 0.06).translate(0, t / 2 + 0.002, z)), P.band, T, { uv: 'sheet' });
    }
    k.add(onRoof(bx(0.2, 0.006, rd).translate(s * (len / 2 - 0.1), t / 2 + 0.002, 0)), P.band, T, { uv: 'sheet' });
  }
  k.add(bx(0.26, 0.02, rd).translate(0, CT.ridge + t / Math.cos(CT_PITCH) + 0.005, 0), P.band, T, { uv: 'sheet' });
  k.add(cyl(0.04, 0.04, CT.d + 0.24, 8).rotateX(Math.PI / 2).translate(0, CT.ridge - 0.045, 0), P.pole, T, { inner: true });
  for (const z of [-3, 0, 3]) {
    k.add(cyl(0.035, 0.035, CT.ridge + 0.3, 8).translate(0, (CT.ridge + 0.3) / 2, z), P.pole, T, { inner: true });
    k.add(cyl(0.05, 0.05, 0.05, 8).translate(0, CT.ridge + 0.32, z), P.pole, T);
  }
  // the guy lines from every station's eave to its stake, and from the ridge pole's ends
  const ex = hw + CT.over * Math.cos(CT_PITCH), ey = CT.wall - CT.over * Math.sin(CT_PITCH);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    const z = -hd + i * CT.d / 4, sx = s * (hw + 1.25);
    k.add(bar([s * ex, ey, z], [sx, 0.02, z], 0.014, 0.014), P.rope, T, { jitter: 0.03 });
    k.add(bx(0.035, 0.3, 0.035).rotateZ(-s * 0.35).translate(sx + s * 0.03, 0.09, z), P.stake, T);
  }
  for (const s of [-1, 1]) {
    k.add(bar([0, CT.ridge - 0.045, s * (hd + 0.12)], [0, 0.02, s * (hd + 1.4)], 0.014, 0.014), P.rope, T, { jitter: 0.03 });
    k.add(bx(0.035, 0.3, 0.035).rotateX(s * 0.35).translate(0, 0.09, s * (hd + 1.43)), P.stake, T);
  }
  // the stove's pipe through its jack on the -x side (thrown when the tent goes down)
  {
    const px = -1.7, pz = -2.6, py = ctRoof(px), SP: Piece = 'small:stove';
    k.add(cyl(0.065, 0.065, 1.05, 10).translate(px, py + 0.45, pz), P.pipe, SP, { w: { rust: 0.8 } });
    k.add(cyl(0.11, 0.09, 0.2, 10).translate(px, py + 1.06, pz), P.cap, SP, { w: { rust: 0.8 } });
    k.add(cyl(0.17, 0.17, 0.02, 10).rotateZ(CT_PITCH).translate(px, py + t / Math.cos(CT_PITCH) + 0.008, pz), P.band, SP);
  }
  // the crates at the front left: two long ones side by side, a third on them; battens, stencils and rope handles
  {
    const G: Piece = 'ground:crates', cz = 4.25;
    const crates: [number, number, number, number, number, number][] = [
      [-2.15, 0.24, cz, 1.12, 0.48, 0.82], [-0.95, 0.24, cz, 1.12, 0.48, 0.82], [-2.08, 0.67, cz - 0.02, 0.86, 0.38, 0.6]];
    crates.forEach(([x, y, z, w, h, d], i) => {
      k.add(bx(w, h, d).translate(x, y, z), i === 1 ? P.wood2 : P.wood, G, { uv: 'sheet', w: { foot: 0.5, dust: 0.6, runs: 0.4 } });
      for (const dx of [-w / 2 + 0.07, w / 2 - 0.07]) k.add(bx(0.06, h + 0.012, d + 0.012).translate(x + dx, y, z), P.batten, G, { uv: 'sheet' });
      k.add(bx(w * 0.42, h * 0.32, 0.006).translate(x, y + h * 0.08, z + d / 2 + 0.003), P.stencil, G);
      for (const dx of [-w / 2 - 0.012, w / 2 + 0.012]) k.add(bx(0.024, 0.04, 0.16).translate(x + dx, y + h * 0.15, z), P.stake, G);
    });
  }
  // the radio mast clear of the tent on three guys, its slanted crossarm with a whip at each end; its set at its foot
  {
    const M: Piece = 'post:mast', mx = 4.6, mz = -3.6, mh = 5.2;
    k.add(bx(0.3, 0.02, 0.3).translate(mx, 0.01, mz), P.mast, M);
    k.add(cyl(0.035, 0.045, mh, 8).translate(mx, mh / 2, mz), P.mast, M, { w: { foot: 0.6, rust: 0.4 } });
    const a: V3 = [mx - 0.6, mh - 0.18 + 0.6 * Math.tan(0.22), mz], b: V3 = [mx + 0.75, mh - 0.18 - 0.75 * Math.tan(0.22), mz];
    k.add(bar(a, b, 0.05, 0.05), P.mast, M);
    for (const e of [a, b]) k.add(cyl(0.008, 0.013, 1.1, 6).translate(e[0], e[1] + 0.55, e[2]), P.stencil, M);
    for (const ang of [0, 2.09, 4.19]) {
      const sx = mx + Math.cos(ang) * 1.45, sz = mz + Math.sin(ang) * 1.45;
      k.add(bar([mx, 3.9, mz], [sx, 0.02, sz], 0.012, 0.012), P.rope, 'small:guys', { jitter: 0.03 });
      k.add(bx(0.03, 0.26, 0.03).translate(sx, 0.08, sz), P.stake, 'ground:stakes');
    }
    const RB: Piece = 'ground:radio';
    k.add(bx(0.7, 0.46, 0.48).translate(4.05, 0.23, -2.65), P.radio, RB, { w: { foot: 0.6, dust: 0.6, runs: 0.5 } });
    k.add(bx(0.5, 0.26, 0.006).translate(4.05, 0.27, -2.65 + 0.243), P.panel, RB);
    k.add(cyl(0.01, 0.01, 0.22, 6).translate(4.3, 0.57, -2.6), P.stencil, RB);
  }
  return ctx.merge('commandtent', k.out);
}

function commandTentShadow(): THREE.BufferGeometry {
  const hw = CT.w / 2, hd = CT.d / 2;
  return solid([
    bx(CT.w, CT.wall, CT.d).translate(0, CT.wall / 2, 0),
    prism([[-hw - 0.11, CT.wall - 0.09], [hw + 0.11, CT.wall - 0.09], [0, CT.ridge + 0.03]], -hd - 0.12, hd + 0.12),
    bx(0.08, 5.2, 0.08).translate(4.6, 2.6, -3.6),
    bx(2.4, 0.86, 0.82).translate(-1.55, 0.43, 4.25),
  ]);
}

// ------------------------------------------------------------------------------------------------ the motor pool

// The old pool's solids (structureKit makeMotorPool): six columns at x -4.5, 0, 4.5 and z +-5.75 up to a 9.8 x 12.3 m
// roof pitched 0.11 rad (high over +x, its underside 3.82 m over x 0), a 2 x 7 m pad in the middle, six drums at
// x +-3.1 z -3.7, 0, 3.7 and a crate 2.5 x 1.0 x 0.7 at (-3.0, -4.8).
const MP = { pitch: 0.11, cols: [-4.5, 0, 4.5], colZ: 5.75, roofW: 9.8, roofD: 12.3, sheet: 0.03, purlin: 0.12, truss: 0.6, chord: 0.1 };
/** The roof sheet's underside over x. */
const mpUnder = (x: number): number => 3.82 + Math.tan(MP.pitch) * x;
const MP_PAL = {
  steel: 0x4b524e, steel2: 0x58605b, roof: 0x6d736e, light: 0x9aa294, concrete: 0x8a877f, pit: 0x2c2a26, yellow: 0xc49a2a,
  wood: 0x7b6447, wood2: 0x6a563f, vice: 0x3d4850, red: 0x8e2b22, tyre: 0x1f1f1e, hub: 0x575a5c, can: 0x4a5a3a,
  chain: 0x3a3a38, hook: 0xb08a2a, shade: 0x3d4a3c, bulb: 0xe8e0c0, ink: 0x2a2a28, tin: 0x5d605a,
};
const DRUM_HEX = [0x4a5a3a, 0x7a2a22, 0x34506a, 0x5d605a, 0x4a5a3a, 0x6e5a2c];

function buildMotorPool(ctx: CampKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0x3007);
  const P = MP_PAL, ch = MP.chord;
  const steel: Weather = { foot: 0.6, rust: 0.5, runs: 0.4 };
  const trussTop = (x: number): number => mpUnder(x) - MP.purlin, trussBot = (x: number): number => trussTop(x) - MP.truss;
  const cols = MP.cols.flatMap((x, xi) => [-MP.colZ, MP.colZ].map((z, zi) => ({ x, z, i: xi * 2 + zi })));
  // the footings; the columns, H sections on base plates up to cap plates under the trusses, a knee brace to each
  for (const c of cols) {
    k.add(bx(0.6, 0.25, 0.6).translate(c.x, 0, c.z), P.concrete, 'ground:footings', { w: { dust: 0.6 } });
    const piece: Piece = `post:col-${c.i}`, y0 = 0.145, y1 = trussBot(c.x), h = y1 - y0, ym = (y0 + y1) / 2;
    k.add(bx(0.36, 0.02, 0.36).translate(c.x, 0.135, c.z), P.steel, piece, { w: steel });
    for (const dz of [-0.1, 0.1]) k.add(bx(0.22, h, 0.018).translate(c.x, ym, c.z + dz), P.steel, piece, { w: steel });
    k.add(bx(0.012, h, 0.2).translate(c.x, ym, c.z), P.steel, piece, { w: steel });
    k.add(bx(0.3, 0.02, 0.3).translate(c.x, y1 - 0.01, c.z), P.steel, piece, { w: steel });
    const zin = -Math.sign(c.z);
    k.add(bar([c.x, y1 - 0.9, c.z], [c.x, y1 + ch / 2, c.z + zin * 0.95], 0.06, 0.06), P.steel, `small:knee-${c.i}`, { w: steel });
  }
  // rod bracing in the end frames, crossed in each bay (each rod with the column at its foot)
  for (const z of [-MP.colZ, MP.colZ]) for (let b = 0; b < 2; b++) {
    const xa = MP.cols[b], xb = MP.cols[b + 1], ia = b * 2 + (z > 0 ? 1 : 0), ib = (b + 1) * 2 + (z > 0 ? 1 : 0);
    k.add(bar([xa, 0.45, z - 0.11], [xb, trussBot(xb) - 0.35, z - 0.11], 0.025, 0.025), P.steel2, `small:rod-${ia}-${ib}`, { w: steel });
    k.add(bar([xb, 0.45, z + 0.11], [xa, trussBot(xa) - 0.35, z + 0.11], 0.025, 0.025), P.steel2, `small:rod-${ib}-${ia}`, { w: steel });
  }
  // the trusses along z on each column line: chords, posts and diagonals sloping toward the middle
  MP.cols.forEach((x, ti) => {
    const piece: Piece = `sheet:truss-${ti}`, top = trussTop(x), bot = trussBot(x), span = 2 * MP.colZ, n = 8;
    // (the top chord runs on to carry the end purlins, ending under them)
    k.add(bx(0.1, ch, MP.roofD - 0.43).translate(x, top - ch / 2, 0), P.steel2, piece, { w: steel });
    k.add(bx(0.1, ch, span + 0.1).translate(x, bot + ch / 2, 0), P.steel2, piece, { w: steel });
    for (let i = 0; i <= n; i++) {
      const z = -MP.colZ + span * i / n;
      k.add(bx(0.06, MP.truss - 2 * ch, 0.06).translate(x, (top + bot) / 2, z), P.steel2, piece, { w: steel });
      if (i === n) continue;
      const zb = -MP.colZ + span * (i + 1) / n, rise = i < n / 2;
      k.add(bar([x, rise ? bot + ch / 2 : top - ch / 2, z], [x, rise ? top - ch / 2 : bot + ch / 2, zb], 0.05, 0.05), P.steel2, piece, { w: steel });
    }
  });
  // the roof: purlins across the trusses, the profiled sheet down the slope with two courses of translucent sheet, the
  // gutter on the low edge, ties along the end frames' heads
  const R: Piece = 'sheet:roof', xA = -MP.roofW / 2, xB = MP.roofW / 2;
  for (let i = 0; i < 10; i++) {
    const z = -MP.roofD / 2 + 0.25 + (MP.roofD - 0.5) * i / 9;
    k.add(bar([xA, mpUnder(xA) - MP.purlin / 2, z], [xB, mpUnder(xB) - MP.purlin / 2, z], 0.07, MP.purlin), P.steel, R, { w: steel });
  }
  const sw = MP.roofW / Math.cos(MP.pitch), sy = mpUnder(0) + MP.sheet / 2 / Math.cos(MP.pitch);
  k.add(pitchRoofPlane(bxn(sw, MP.sheet, MP.roofD, 10, 1, 12), 'x', -1, MP.pitch, 'skillion').translate(0, sy, 0), P.roof, R,
    { uv: 'roof', w: { rust: 0.55, dust: 0.6, runs: 0.3 } });
  for (const [zc, xs] of [[-2.7, [-3.3, -0.1, 3.1]], [2.7, [-2.5, 0.7, 3.8]]] as const) for (const xc of xs) {
    const lw = 1.25 / Math.cos(MP.pitch), ly = sy + MP.sheet / 2 / Math.cos(MP.pitch) + 0.003 + Math.tan(MP.pitch) * xc;
    k.add(pitchRoofPlane(bx(lw, 0.006, 0.95), 'x', -1, MP.pitch, 'skillion').translate(xc, ly, zc), P.light, R, { uv: 'roof', w: { dust: 0.8 } });
  }
  const gx = xA - 0.07, gy = mpUnder(xA) - 0.05;
  k.add(bx(0.12, 0.09, MP.roofD - 0.04).translate(gx, gy, 0), P.steel2, R, { w: steel });
  for (const z of [-MP.colZ, MP.colZ]) {
    k.add(bar([MP.cols[0], trussBot(MP.cols[0]) - 0.07, z], [MP.cols[2], trussBot(MP.cols[2]) - 0.07, z], 0.08, 0.14), P.steel2, R, { w: steel });
  }
  for (const [di, z] of [-5.95, 5.95].entries()) {
    const DP: Piece = `small:downpipe-${di}`;
    k.add(cyl(0.045, 0.045, gy - 0.045 - 0.05, 8).translate(gx, (gy - 0.045 + 0.05) / 2, z), P.steel2, DP, { w: steel });
    k.add(bx(0.3, 0.05, 0.22).translate(gx, 0.025, z), P.concrete, DP, { w: { dust: 0.6 } });
  }
  // the inspection pit on the old pad: its curbs with hazard bars and steel nosings, its dark oily floor
  {
    const G: Piece = 'ground:pit';
    for (const s of [-1, 1]) k.add(bx(0.25, 0.25, 7.0).translate(s * 0.875, 0.05, 0), P.concrete, G, { w: { dust: 0.7, foot: 0.4 } });
    for (const s of [-1, 1]) k.add(bx(1.5, 0.25, 0.25).translate(0, 0.05, s * 3.375), P.concrete, G, { w: { dust: 0.7 } });
    k.add(bx(1.5, 0.06, 6.5).translate(0, -0.045, 0), P.pit, G, { jitter: 0.1 });
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
      k.add(bx(0.2, 0.006, 0.36).translate(s * 0.9, 0.178, -3.16 + i * 0.79), P.yellow, G, { w: { dust: 0.5, runs: 0.3 } });
    }
    for (const s of [-1, 1]) k.add(bx(0.05, 0.05, 6.5).translate(s * 0.77, 0.15, 0), P.steel, G, { w: steel });
  }
  // the drums on the old drums' spots, each with its rolling hoops and bung
  [[-3.1, -3.7], [-3.1, 0], [-3.1, 3.7], [3.1, -3.7], [3.1, 0], [3.1, 3.7]].forEach(([x, z], di) => {
    const D: Piece = `small:drum-${di}`, hex = DRUM_HEX[di];
    k.add(cyl(0.29, 0.29, 0.88, 12).translate(x, 0.44, z), hex, D, { w: { foot: 0.6, rust: 0.7, runs: 0.4, dust: 0.5 } });
    for (const y of [0.3, 0.6]) k.add(hoop(0.3, 0.035, 12).translate(x, y, z), hex, D, { w: { rust: 0.8 } });
    k.add(cyl(0.035, 0.035, 0.03, 6).translate(x + 0.15, 0.885, z + 0.08), P.ink, D);
  });
  // the workbench on the old crate's spot: its top, legs, aprons and shelf, a vice, a toolbox and a few tools
  {
    const W: Piece = 'small:bench', cx = -3.0, cz = -4.8;
    k.add(bx(2.5, 0.06, 0.7).translate(cx, 0.93, cz), P.wood, W, { w: { dust: 0.4 } });
    for (const dx of [-1.17, 1.17]) for (const dz of [-0.3, 0.3]) k.add(bx(0.06, 0.9, 0.06).translate(cx + dx, 0.45, cz + dz), P.steel, W, { w: steel });
    for (const dz of [-0.3, 0.3]) k.add(bx(2.34, 0.08, 0.03).translate(cx, 0.86, cz + dz), P.steel, W, { w: steel });
    k.add(bx(2.4, 0.03, 0.62).translate(cx, 0.25, cz), P.wood2, W);
    k.add(bx(0.18, 0.12, 0.22).translate(cx + 1.0, 1.02, cz + 0.2), P.vice, W);
    k.add(bx(0.24, 0.05, 0.05).translate(cx + 1.0, 1.05, cz + 0.33), P.vice, W);
    k.add(bx(0.5, 0.22, 0.25).translate(cx - 0.6, 0.375, cz), P.red, W, { w: { rust: 0.3 } });
    k.add(bx(0.3, 0.025, 0.04).translate(cx - 0.2, 0.9725, cz - 0.1), P.ink, W);
    k.add(bx(0.12, 0.08, 0.12).translate(cx + 0.3, 1.0, cz + 0.05), P.tin, W);
  }
  // the chain hoist over the pit and two lamps hung from the middle truss; a stack of tyres; jerrycans by the bench
  {
    const hb = trussBot(0), H: Piece = 'small:hoist';
    k.add(bx(0.03, hb - 2.2, 0.03).translate(0, (hb + 2.2) / 2, 0.72), P.chain, H);
    k.add(bx(0.16, 0.26, 0.12).translate(0, 2.07, 0.72), P.hook, H);
    k.add(bx(0.04, 0.14, 0.04).translate(0, 1.87, 0.72), P.chain, H);
    for (const [li, z] of [-2.88, 2.88].entries()) {
      const LP: Piece = `small:lamp-${li}`;
      k.add(bx(0.012, 0.6, 0.012).translate(0, hb - 0.3, z), P.ink, LP);
      k.add(new THREE.ConeGeometry(0.22, 0.16, 10, 1, true).translate(0, hb - 0.68, z), P.shade, LP);
      k.add(bx(0.07, 0.07, 0.07).translate(0, hb - 0.72, z), P.bulb, LP, { jitter: 0.01 });
    }
    const TY: Piece = 'small:tyres';
    for (let i = 0; i < 3; i++) {
      k.add(cyl(0.42, 0.42, 0.26, 14).translate(3.65, 0.13 + i * 0.26, 4.85), P.tyre, TY, { w: { dust: 0.5 } });
      k.add(cyl(0.19, 0.19, 0.27, 10).translate(3.65, 0.13 + i * 0.26, 4.85), P.hub, TY);
    }
    const JC: Piece = 'small:jerrycans';
    for (let i = 0; i < 3; i++) k.add(bx(0.17, 0.47, 0.34).translate(-1.5, 0.235, -5.1 + i * 0.38), P.can, JC, { w: { foot: 0.6, rust: 0.4 } });
  }
  return ctx.merge('motorpool', k.out);
}

function motorPoolShadow(): THREE.BufferGeometry {
  const sw = MP.roofW / Math.cos(MP.pitch), parts = [
    bx(sw, 0.16, MP.roofD).rotateZ(MP.pitch).translate(0, mpUnder(0) - 0.06, 0),
  ];
  for (const x of MP.cols) for (const z of [-MP.colZ, MP.colZ]) parts.push(bx(0.22, mpUnder(x) - 0.82, 0.22).translate(x, (mpUnder(x) - 0.82) / 2, z));
  for (const x of MP.cols) parts.push(bx(0.1, MP.truss, 2 * MP.colZ).translate(x, mpUnder(x) - MP.purlin - MP.truss / 2, 0));
  return solid(parts);
}

// ------------------------------------------------------------------------------------------------ the field hospital

// The old hospital's solids (structureKit makeFieldHospital): two canvas wards 4.5 x 1.05 x 8.8 at x -2.7 and 2.7 under
// gable roofs to 3.05 m, a pole to 3.3 m in the middle of each; a red-cross panel 2.15 m up between them at the front
// (z 4.48); cots inside.
const FH = { w: 4.5, d: 8.8, wall: 1.05, ridge: 3.05, over: 0.12, t: 0.03 };
const FH_PITCH = Math.atan2(FH.ridge - FH.wall, FH.w / 2);
const FH_PAL = {
  wall: 0x93866a, roof: 0xa49779, end: 0x8b7f64, band: 0x5f5946, dark: 0x1d1c18, mesh: 0x2a2922, flap: 0x857a60,
  pole: 0x3b3e35, rope: 0x8a8366, stake: 0x4a4436, white: 0xd9d6cc, red: 0x9b2a24, wood: 0x7b6447, batten: 0x5a4a36,
  steel: 0x55595a, cot: 0x5f6b4f, flag: 0xe2dfd5,
};

/**
 * One ward: canvas walls bowed between its frame's stations with a sod cloth, windows under rolled flaps, the end walls with
 * the door open under its rolled flap, the sagging roof with seams, eave bands and a ridge cap, a red cross on its outer
 * slope, the ridge pole and uprights, guy lines on its outer side and from the ridge pole's ends. Centred at x = cx.
 */
function ward(k: Kit, T: Piece, cx: number, outer: 1 | -1, canvas: Weather): void {
  const { w, d, wall, ridge, over, t } = FH, hw = w / 2, hd = d / 2, pitch = FH_PITCH, P = FH_PAL;
  const bay = (z: number): number => Math.sin(Math.PI * (z + hd) / (d / 4)) ** 2;
  const put = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(cx, 0, 0);
  for (const s of [-1, 1]) {
    const g = displace(bxn(t, wall, d, 1, 2, 16), (_x, y, z) => [s * 0.016 * Math.sin(Math.PI * (y + wall / 2) / wall) * bay(z), 0, 0]);
    k.add(put(g.translate(s * (hw - t / 2), wall / 2, 0)), P.wall, T, { uv: 'sheet', w: canvas });
    k.add(put(bx(0.012, 0.15, d).translate(s * (hw + 0.004), 0.075, 0)), P.band, T, { uv: 'sheet', w: { foot: 1 } });
    for (const zc of [-1.1, 1.1]) {
      k.add(put(bx(0.01, 0.42, 0.8).translate(s * (hw + 0.026), 0.62, zc)), P.mesh, T, { uv: 'sheet', jitter: 0.03 });
      k.add(put(cyl(0.05, 0.05, 0.9, 8).rotateX(Math.PI / 2).translate(s * (hw + 0.064), 0.9, zc)), P.flap, T, { uv: 'sheet', w: canvas });
    }
  }
  const pent: [number, number][] = [[-hw, 0], [hw, 0], [hw, wall], [0, ridge], [-hw, wall]];
  for (const s of [-1, 1]) k.add(put(prism(pent, s > 0 ? hd - t : -hd, s > 0 ? hd : -hd + t)), P.end, T, { uv: 'sheet', w: canvas });
  k.add(put(bx(1.3, 1.85, 0.01).translate(0, 0.925, hd + 0.006)), P.dark, T, { jitter: 0.03 });
  for (const x of [-0.68, 0.68]) k.add(put(bx(0.07, 1.9, 0.014).translate(x, 0.95, hd + 0.008)), P.band, T, { uv: 'sheet' });
  k.add(put(cyl(0.085, 0.085, 1.5, 10).rotateZ(Math.PI / 2).translate(0, 1.94, hd + 0.09)), P.flap, T, { uv: 'sheet', w: canvas });
  k.add(put(bx(0.5, 0.3, 0.01).translate(0, 2.2, -hd - 0.006)), P.mesh, T, { jitter: 0.03 });
  const slope = hw / Math.cos(pitch), rd = d + 0.2, len = slope + over;
  for (const s of [-1, 1] as const) {
    const sag = (x: number, z: number): number => {
      const u = (s > 0 ? x + len / 2 : len / 2 - x) / slope;
      return u < 1 ? -0.06 * Math.sin(Math.PI * u) * bay(z) : 0;
    };
    const g = displace(bxn(len, t, rd, 6, 1, 16), (x, _y, z) => [0, sag(x, z), 0]);
    pitchRoofPlane(g, 'x', s, pitch, 'gable');
    const rx = s * (len / 2) * Math.cos(pitch) + s * (t / 2) * Math.sin(pitch), ry = ridge - (len / 2) * Math.sin(pitch) + (t / 2) * Math.cos(pitch);
    k.add(put(g.translate(rx, ry, 0)), P.roof, T, { uv: 'sheet', w: { ...canvas, foot: 0 } });
    const onRoof = (geo: THREE.BufferGeometry): THREE.BufferGeometry => put(geo.rotateZ(-s * pitch).translate(rx, ry, 0));
    for (const z of [-hd, -hd / 2, 0, hd / 2, hd]) k.add(onRoof(bx(len, 0.006, 0.06).translate(0, t / 2 + 0.002, z)), P.band, T, { uv: 'sheet' });
    k.add(onRoof(bx(0.18, 0.006, rd).translate(s * (len / 2 - 0.09), t / 2 + 0.002, 0)), P.band, T, { uv: 'sheet' });
    if (s === outer) {
      // the red cross on its white ground, painted on the canvas (following its sag)
      const xm = s * (slope / 2 - len / 2), lay = (gw: number, gd: number, lift: number): THREE.BufferGeometry =>
        displace(bxn(gw, 0.004, gd, 6, 1, 6).translate(xm, t / 2 + lift, 0), (x, _y, z) => [0, sag(x, z), 0]);
      k.add(onRoof(lay(1.7, 1.7, 0.003)), P.white, T, { uv: 'sheet', w: { runs: 0.3 } });
      k.add(onRoof(lay(1.24, 0.38, 0.006)), P.red, T, { uv: 'sheet' });
      k.add(onRoof(lay(0.38, 1.24, 0.006)), P.red, T, { uv: 'sheet' });
    }
  }
  k.add(put(bx(0.24, 0.02, rd).translate(0, ridge + t / Math.cos(pitch) + 0.005, 0)), P.band, T, { uv: 'sheet' });
  k.add(put(cyl(0.04, 0.04, d + 0.2, 8).rotateX(Math.PI / 2).translate(0, ridge - 0.045, 0)), P.pole, T, { inner: true });
  for (const z of [-hd + 0.12, hd - 0.12]) k.add(put(cyl(0.035, 0.035, ridge - 0.04, 8).translate(0, (ridge - 0.04) / 2, z)), P.pole, T, { inner: true });
  k.add(put(cyl(0.04, 0.04, 3.3, 8).translate(0, 1.65, 0)), P.pole, T, { inner: true });
  k.add(put(cyl(0.05, 0.05, 0.05, 8).translate(0, 3.3, 0)), P.pole, T);
  const ex = hw + over * Math.cos(pitch), ey = wall - over * Math.sin(pitch);
  for (let i = 0; i < 5; i++) {
    const z = -hd + i * d / 4, sx = outer * (hw + 1.2);
    k.add(put(bar([outer * ex, ey, z], [sx, 0.02, z], 0.014, 0.014)), P.rope, T, { jitter: 0.03 });
    k.add(put(bx(0.035, 0.3, 0.035).rotateZ(-outer * 0.35).translate(sx + outer * 0.03, 0.09, z)), P.stake, T);
  }
  for (const s of [-1, 1]) {
    k.add(put(bar([0, ridge - 0.045, s * (hd + 0.1)], [0, 0.02, s * (hd + 1.3)], 0.014, 0.014)), P.rope, T, { jitter: 0.03 });
    k.add(put(bx(0.035, 0.3, 0.035).rotateX(s * 0.35).translate(0, 0.09, s * (hd + 1.33))), P.stake, T);
  }
}

function buildFieldHospital(ctx: CampKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0xf1e5);
  const P = FH_PAL, hd = FH.d / 2, canvas: Weather = { foot: 0.7, runs: 0.45, dust: 0.5, bleach: 0.9 };
  ward(k, 'block:ward-l', -2.7, -1, canvas);
  ward(k, 'block:ward-r', 2.7, 1, canvas);
  // the red-cross flag on its pole between the wards' fronts
  {
    const F: Piece = 'post:flag', fz = hd + 0.3, top = 3.6;
    k.add(bx(0.24, 0.02, 0.24).translate(0, 0.01, fz), P.steel, F);
    k.add(cyl(0.03, 0.035, top, 8).translate(0, top / 2, fz), P.pole, F, { w: { foot: 0.6 } });
    k.add(cyl(0.05, 0.05, 0.05, 8).translate(0, top + 0.02, fz), P.pole, F);
    const fy = top - 0.38;
    k.add(bxn(0.9, 0.6, 0.012, 4, 3, 1).translate(0.48, fy, fz), P.flag, F, { w: { runs: 0.4 } });
    for (const s of [-1, 1]) {
      k.add(bx(0.5, 0.15, 0.004).translate(0.48, fy, fz + s * 0.008), P.red, F);
      k.add(bx(0.15, 0.5, 0.004).translate(0.48, fy, fz + s * 0.008), P.red, F);
    }
  }
  // a stretcher on two trestles before the left ward's door; supply crates by the right ward's
  {
    const S: Piece = 'small:stretcher', sx = -2.7, sz = hd + 1.3;
    for (const dz of [-0.8, 0.8]) {
      for (const dx of [-0.25, 0.25]) k.add(bar([sx + dx, 0.02, sz + dz - 0.18], [sx + dx * 0.8, 0.615, sz + dz], 0.035, 0.035), P.wood, S);
      for (const dx of [-0.25, 0.25]) k.add(bar([sx + dx, 0.02, sz + dz + 0.18], [sx + dx * 0.8, 0.615, sz + dz], 0.035, 0.035), P.wood, S);
      k.add(bx(0.56, 0.04, 0.06).translate(sx, 0.637, sz + dz), P.wood, S);
    }
    for (const dx of [-0.26, 0.26]) k.add(cyl(0.022, 0.022, 1.66, 6).rotateX(Math.PI / 2).translate(sx + dx, 0.68, sz), P.wood, S);
    k.add(bxn(0.5, 0.02, 1.6, 2, 1, 6).translate(sx, 0.69, sz), P.cot, S, { uv: 'sheet', w: { dust: 0.5 } });
  }
  {
    const G: Piece = 'ground:crates', cz = hd + 0.9;
    const boxes: [number, number, number, number, number, number][] = [
      [3.4, 0.22, cz, 0.8, 0.44, 0.55], [4.25, 0.22, cz + 0.1, 0.8, 0.44, 0.55], [3.8, 0.6, cz + 0.05, 0.7, 0.32, 0.5]];
    for (const [x, y, z, w, h, d] of boxes) {
      k.add(bx(w, h, d).translate(x, y, z), P.white, G, { uv: 'sheet', w: { foot: 0.6, dust: 0.6, runs: 0.5 } });
      k.add(bx(w * 0.36, h * 0.16, 0.006).translate(x, y + h * 0.05, z + d / 2 + 0.003), P.red, G);
      k.add(bx(w * 0.12, h * 0.5, 0.006).translate(x, y + h * 0.05, z + d / 2 + 0.003), P.red, G);
    }
  }
  return ctx.merge('fieldhospital', k.out);
}

function fieldHospitalShadow(): THREE.BufferGeometry {
  const { w, d, wall, ridge } = FH, hw = w / 2, hd = d / 2, parts: THREE.BufferGeometry[] = [];
  for (const cx of [-2.7, 2.7]) {
    parts.push(bx(w, wall, d).translate(cx, wall / 2, 0));
    parts.push(prism([[-hw - 0.09, wall - 0.08], [hw + 0.09, wall - 0.08], [0, ridge + 0.03]], -hd - 0.1, hd + 0.1).translate(cx, 0, 0));
  }
  parts.push(bx(0.06, 3.6, 0.06).translate(0, 1.8, hd + 0.3), bx(0.9, 0.6, 0.02).translate(0.48, 3.22, hd + 0.3));
  return solid(parts);
}

// ------------------------------------------------------------------------------------------------ the desert tent

// The old tent's solids (structureKit makeDesertTent): a ridge tent 5.2 wide and 7.6 long to 2.8 m, its canvas down to the
// ground both sides; a pole at each end to 3.4 m (z +-3.95); four corner guys; a mat 3.8 x 2.2 before its front (+z).
const DT = { w: 5.2, d: 7.6, ridge: 2.8, t: 0.03, poleZ: 3.95, poleTop: 3.4 };
const DT_PITCH = Math.atan2(DT.ridge, DT.w / 2);
const DT_PAL = {
  roof: 0xb39c74, end: 0xa8916b, band: 0x7c6a4c, dark: 0x1e1b16, flap: 0x9e8862, pole: 0x5a4a36, rope: 0x9b8f70,
  stake: 0x4a4436, rug: 0x7e2f22, rugA: 0x2f3f5f, rugB: 0xcdbf9a, rugC: 0x241d18, cushion: 0x6a2420, cushion2: 0x2c3a58,
  brass: 0x9a7a3a, stone: 0x8a7f6c, char: 0x26211c, can: 0x4f5a3a,
};

function buildDesertTent(ctx: CampKitContext, rng: Rng): THREE.BufferGeometry {
  const k = new Kit(rng, 0xde57);
  const { w, d, ridge, t } = DT, hw = w / 2, hd = d / 2, pitch = DT_PITCH, P = DT_PAL, T: Piece = 'block:tent';
  const canvas: Weather = { foot: 0.8, runs: 0.35, dust: 0.7, bleach: 1.0 };
  // the two canvas planes from the ridge to the ground, sagging between the ridge and the hem, and between the poles; their
  // hems along the ground and the seams down them
  const slope = hw / Math.cos(pitch), rd = d;
  const sagOf = (s: number) => (x: number, z: number): number => {
    const u = (s > 0 ? x + slope / 2 : slope / 2 - x) / slope;
    return -0.09 * Math.sin(Math.PI * u) * (0.55 + 0.45 * Math.sin(Math.PI * (z + hd) / d));
  };
  const rxOf = (s: number): number => s * (slope / 2) * Math.cos(pitch) + s * (t / 2) * Math.sin(pitch);
  const ry = ridge - (slope / 2) * Math.sin(pitch) + (t / 2) * Math.cos(pitch);
  /** The canvas's top at the middle of its slope (side s), at z: where a guy's loop is sewn on. */
  const loopAt = (s: number, z: number): V3 => {
    const lift = t / 2 + sagOf(s)(0, z);
    return [rxOf(s) + s * Math.sin(pitch) * lift, ry + Math.cos(pitch) * lift, z];
  };
  for (const s of [-1, 1] as const) {
    const sag = sagOf(s);
    const g = displace(bxn(slope, t, rd, 8, 1, 14), (x, _y, z) => [0, sag(x, z), 0]);
    pitchRoofPlane(g, 'x', s, pitch, 'gable');
    const rx = rxOf(s);
    k.add(g.translate(rx, ry, 0), P.roof, T, { uv: 'sheet', w: canvas });
    const onRoof = (geo: THREE.BufferGeometry): THREE.BufferGeometry => geo.rotateZ(-s * pitch).translate(rx, ry, 0);
    for (const z of [-hd / 2, 0, hd / 2]) {
      k.add(onRoof(displace(bxn(slope, 0.006, 0.05, 8, 1, 1).translate(0, t / 2 + 0.002, z), (x, _y, zz) => [0, sag(x, zz), 0])), P.band, T, { uv: 'sheet' });
    }
    k.add(onRoof(bx(0.2, 0.006, rd).translate(s * (slope / 2 - 0.1), t / 2 + 0.002, 0)), P.band, T, { uv: 'sheet', w: { foot: 1 } });
  }
  k.add(bx(0.22, 0.02, rd).translate(0, ridge + t / Math.cos(pitch) + 0.005, 0), P.band, T, { uv: 'sheet' });
  // the back closed; the front open, its two flaps rolled up the edges, the dark inside, a rug's edge at the threshold
  k.add(prism([[-hw, 0], [hw, 0], [0, ridge]], -hd, -hd + t), P.end, T, { uv: 'sheet', w: canvas });
  k.add(prism([[-hw + 0.2, 0.01], [hw - 0.2, 0.01], [0, ridge - 0.25]], hd - 0.45, hd - 0.44), P.dark, T, { jitter: 0.03 });
  for (const s of [-1, 1]) {
    const a: V3 = [s * 0.12, ridge - 0.1, hd + 0.03], b: V3 = [s * (hw - 0.25), 0.22, hd + 0.03];
    k.add(bar(a, b, 0.16, 0.16), P.flap, T, { uv: 'sheet', w: canvas });
    for (const f of [0.3, 0.7]) {
      const m: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      k.add(bx(0.03, 0.2, 0.03).translate(m[0], m[1], m[2] + 0.1), P.rope, T);
    }
  }
  // the ridge pole out past both ends to the poles; the poles; guys from their heads, and down each side to stakes
  k.add(cyl(0.04, 0.04, 2 * DT.poleZ, 8).rotateX(Math.PI / 2).translate(0, ridge - 0.045, 0), P.pole, T, { inner: true });
  for (const s of [-1, 1]) {
    const Pp: Piece = s > 0 ? 'post:pole-f' : 'post:pole-b', z = s * DT.poleZ;
    k.add(cyl(0.05, 0.055, DT.poleTop, 8).translate(0, DT.poleTop / 2, z), P.pole, Pp, { w: { foot: 0.7 } });
    k.add(cyl(0.065, 0.065, 0.06, 8).translate(0, DT.poleTop + 0.02, z), P.pole, Pp);
    k.add(bar([0, DT.poleTop - 0.05, z], [0, 0.02, s * (hd + 1.45)], 0.014, 0.014), P.rope, T, { jitter: 0.03 });
    k.add(bx(0.035, 0.3, 0.035).rotateX(s * 0.35).translate(0, 0.09, s * (hd + 1.48)), P.stake, T);
    for (const z2 of [-2.5, 0, 2.5]) {
      const from = loopAt(s, z2), to: V3 = [s * (hw + 0.95), 0.02, z2];
      k.add(bar(from, to, 0.014, 0.014), P.rope, T, { jitter: 0.03 });
      k.add(bx(0.035, 0.3, 0.035).rotateZ(-s * 0.35).translate(to[0] + s * 0.03, 0.09, z2), P.stake, T);
    }
  }
  // the rug before the door in its bands, cushions, a tray with its teapot
  {
    const R: Piece = 'ground:rug', rz = hd + 1.2;
    k.add(bxn(3.8, 0.025, 2.2, 6, 1, 4).translate(0, 0.0125, rz), P.rug, R, { w: { dust: 0.8, foot: 0.3 } });
    for (const [dz, hex] of [[-0.85, P.rugA], [-0.6, P.rugB], [0.6, P.rugB], [0.85, P.rugA]] as const) {
      k.add(bx(3.7, 0.004, 0.12).translate(0, 0.027, rz + dz), hex, R, { w: { dust: 0.8 } });
    }
    for (const dx of [-1.5, 1.5]) k.add(bx(0.18, 0.004, 2.0).translate(dx, 0.027, rz), P.rugC, R, { w: { dust: 0.8 } });
    [[-1.0, -0.6, P.cushion], [-0.35, -0.75, P.cushion2], [1.1, -0.55, P.cushion]].forEach(([x, dz, hex]) => {
      k.add(displace(bxn(0.55, 0.16, 0.4, 3, 1, 3).translate(x as number, 0.025 + 0.08, rz + (dz as number)),
        (xx, yy, zz) => [0, (yy > 0.1 ? 0.03 : 0) * Math.cos((xx - (x as number)) * 4) * Math.cos((zz - rz - (dz as number)) * 5), 0]), hex as number, R, { w: { dust: 0.5 } });
    });
    k.add(cyl(0.26, 0.26, 0.03, 14).translate(0.2, 0.025 + 0.13, rz + 0.1), P.brass, R, { w: { rust: 0.3 } });
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09;
      k.add(bx(0.03, 0.12, 0.03).translate(0.2 + Math.cos(a) * 0.18, 0.025 + 0.06, rz + 0.1 + Math.sin(a) * 0.18), P.brass, R);
    }
    k.add(cyl(0.06, 0.08, 0.14, 10).translate(0.25, 0.175 + 0.07, rz + 0.12), P.brass, R, { w: { rust: 0.4 } });
  }
  // the fire ring off to the side: its stones and the charred sticks in it
  {
    const F: Piece = 'ground:fire', fx = 3.4, fz = 2.8;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      k.add(bx(0.2, 0.13, 0.16).rotateY(a).translate(fx + Math.cos(a) * 0.42, 0.065, fz + Math.sin(a) * 0.42), P.stone, F, { w: { dust: 0.7 } });
    }
    for (const [a, l] of [[0.3, 0.6], [1.9, 0.55], [3.4, 0.5]]) {
      k.add(bar([fx - Math.cos(a) * l / 2, 0.025, fz - Math.sin(a) * l / 2], [fx + Math.cos(a) * l / 2, 0.045, fz + Math.sin(a) * l / 2], 0.05, 0.05), P.char, F);
    }
  }
  // two jerrycans against the tent's side
  for (const dz of [-0.6, -0.15]) {
    k.add(bx(0.17, 0.47, 0.34).translate(hw + 0.35, 0.235, dz), P.can, 'small:jerrycans', { w: { foot: 0.6, rust: 0.4, dust: 0.6 } });
  }
  return ctx.merge('deserttent', k.out);
}

function desertTentShadow(): THREE.BufferGeometry {
  const { w, d, ridge, poleZ, poleTop } = DT, hw = w / 2, hd = d / 2;
  return solid([
    prism([[-hw, 0], [hw, 0], [0, ridge + 0.03]], -hd, hd),
    bx(0.1, poleTop, 0.1).translate(0, poleTop / 2, poleZ), bx(0.1, poleTop, 0.1).translate(0, poleTop / 2, -poleZ),
  ]);
}

// ------------------------------------------------------------------------------------------------ the kits

/** A redesigned kit: its build from its own stream (the old build's draws already spent) and its caster. */
export interface CampKitBuilders {
  build(rng: Rng): THREE.BufferGeometry;
  /** Solids in its own shape for the cascades: plain position, normal and uv, no stream draws. */
  shadow(): THREE.BufferGeometry;
}

export const CAMP_KIT_IDS = ['checkpointhut', 'guardpost', 'commandtent', 'motorpool', 'fieldhospital', 'deserttent'] as const;
export type CampKitId = typeof CAMP_KIT_IDS[number];

/** The redesigned military light kits by id, merged through structureKit's certifying merge. */
export function createCampKits(ctx: CampKitContext): Record<CampKitId, CampKitBuilders> {
  return {
    checkpointhut: { build: (rng) => buildCheckpointHut(ctx, rng), shadow: checkpointHutShadow },
    guardpost: { build: (rng) => buildGuardPost(ctx, rng), shadow: guardPostShadow },
    commandtent: { build: (rng) => buildCommandTent(ctx, rng), shadow: commandTentShadow },
    motorpool: { build: (rng) => buildMotorPool(ctx, rng), shadow: motorPoolShadow },
    fieldhospital: { build: (rng) => buildFieldHospital(ctx, rng), shadow: fieldHospitalShadow },
    deserttent: { build: (rng) => buildDesertTent(ctx, rng), shadow: desertTentShadow },
  };
}
