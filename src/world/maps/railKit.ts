// src/world/maps/railKit.ts — industrial + maritime landmark builders for the
// maps r1 battlefields (railyard, coastal). Registered into props.ts
// BUILDER_BY_NAME through maps/urbanKit.ts URBAN_BUILDERS (same zero-props.ts-
// change contract as the desert bazaar kit):
//   make<X>(rng, buckets, wallBucket?) -> {w, d, h}
// pushing THREE.BufferGeometry into buckets.{plaster,stone,roof,wood,dark,
// glass,baked}. 'stone' is BRICK on railyard (sourcedTextures swap), 'baked'
// is the matte vertex-colored bucket (containers, tar decks).

import * as THREE from 'three';
import { markWorldLantern } from '../worldNightEmissionGeometry.ts';
import {
  box, gableAttic, gablePrism as createGablePrism, gableSlabSeat, jitterUV, pitchRoofPlane, scaleUV, slabBox,
} from '../propGeometry.ts';
import {
  INDUSTRIAL_CLADDING,
  structureBuildContext,
  type GeometryBuckets,
  type StructureBuilder,
  type StructureDimensions,
} from './exteriorDetailKit.ts';
// (the container rows' own kit: maps/containerRowKit.ts; the row stays in this kit's table and is re-exported)
import { makeContainerRow } from './containerRowKit.ts';
import { terraceLayout, terraceUnits } from './terraceLayout.ts';

const gablePrism = (width: number, height: number, depth: number): THREE.BufferGeometry => (
  createGablePrism(width, height, depth, 0.5)
);

/** Flat vertex paint (with slight per-vertex value jitter) for the matte
 * vertex-colored 'baked' bucket — the container/tar-deck material. */
function paintGeo(
  geo: THREE.BufferGeometry,
  rng: () => number,
  r: number,
  g: number,
  b: number,
  jitter = 0.06,
): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 1 + (rng() - 0.5) * jitter * 2;
    col[i * 3] = Math.min(1, r * v);
    col[i * 3 + 1] = Math.min(1, g * v);
    col[i * 3 + 2] = Math.min(1, b * v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// =============================================================================
// RAIL YARD BUILDERS
// =============================================================================

/** A part new to the builder's stream: it takes no draws from the shared stream (props.ts jitterBuildingUvs). */
function dressing<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.uvJitter = 'none';
  return geo;
}

// follow-up 3 (2026-09-26): the cladding liveries are shared with the other industrial halls (exteriorDetailKit
// INDUSTRIAL_CLADDING) — on a snow map the sheet is frosted pale grey with oxide trims and eave snow ledges
const WAREHOUSE_CLADDING_HEX = INDUSTRIAL_CLADDING.sheet;
const WAREHOUSE_CLADDING_HEX_SNOW = INDUSTRIAL_CLADDING.sheetSnow;
const WAREHOUSE_TRIM_HEX_SNOW = INDUSTRIAL_CLADDING.trimSnow;
const WAREHOUSE_SNOW_HEX = INDUSTRIAL_CLADDING.snow;
const WAREHOUSE_DOOR_HEX = 0x5f6d6a;       // roller shutters, grey-green
const WAREHOUSE_DOOR_HEX_STEEL = 0x8b5a3c; // on a sheet hall the shutters are the oxide red of the plant

/**
 * Freight warehouse: long hall, shallow gable in grey sheeting, roller shutters on the street face over a loading
 * dock, clerestory window band, roof ridge vents. The rail yard's bread-and-butter block. Round 75: the dock gets
 * a skillion canopy on two posts, rubber bumpers and shutter guide posts; the roof gets ridge skylights and eave
 * gutters; the street gable a painted sign board; and on a map that authors industrialCladding 'steel' the walls
 * and gables are corrugated sheet (structureMetal) instead of brick — the plinth, dock and the seeded draws are
 * the same as before (new parts take none; re-bucketed parts keep theirs), so the plan keeps every later placement.
 */
export function makeWarehouse(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const context = structureBuildContext(buckets);
  const steelClad = context?.cladding === 'steel' && !!buckets.structureMetal;
  const snowClad = steelClad && !!context?.snowCap;
  const parts: GeometryBuckets = {
    plaster: [], plaster2: [], stone: [], roof: [], wood: [], dark: [], baked: [], structureMetal: [],
  };
  if (buckets.glass) parts.glass = [];
  const pane = parts.glass || parts.dark;
  const drawnW = 13.5 + rng() * 3, drawnD = 21 + rng() * 5, wallH = 5.4 + rng() * 0.8, roofH = 1.9;
  // maps lane B (2026-10-03): an authored plot sets the footprint (Kestrel Airfield's cargo-hangar plot); the draws stay
  const w = context?.plot?.w ?? drawnW, d = context?.plot?.d ?? drawnD;
  const local = forkRng((drawnW - 13.5) / 3 * 0.61 + (drawnD - 21) / 5 * 0.29 + (wallH - 5.4) / 0.8 * 0.07);
  parts.stone.push(box(w + 0.4, 1.1, d + 0.4).translate(0, -0.1, 0));
  const wallBucket = steelClad ? parts.structureMetal! : parts.stone;
  const wall = box(w, wallH, d, 0.55).translate(0, wallH / 2, 0);
  const gableA = gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16);
  const gableB = gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16);
  for (const shell of [wall, gableA, gableB]) {
    if (steelClad) { paintHex(shell, local, snowClad ? WAREHOUSE_CLADDING_HEX_SNOW : WAREHOUSE_CLADDING_HEX, 1, 0.03); shell.userData.uvJitter = 'consume'; }
    wallBucket.push(shell);
  }
  // (the buildings stream, 2026-10-13: each slab's underside on the gable's own slope, the hall closed under them; the
  // slabs stood 5 cm over the wall tops and buried the skylights)
  const seat = gableSlabSeat(w / 2, roofH, 0.4, 0.13), ang = seat.pitch;
  parts.dark.push(gableAttic(w, roofH, d).translate(0, wallH, 0));
  for (const side of [-1, 1]) {
    const slab = box(seat.length, 0.13, d + 0.7, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, ang, 'gable');
    slab.translate(-side * seat.out, wallH + seat.up, 0);
    parts.roof.push(slab);
    // ridge skylights: two glazed strips a metre down each roof plane
    for (const sz of [-d * 0.22, d * 0.2]) {
      // 6 cm glazing: the pitch audit regresses a slab's centre plane through its corners, and a thick narrow box
      // biases that slope (0.14 m on 0.95 m read 0.005 rad off the receipt)
      const light = dressing(box(0.95, 0.06, 2.6, 0.5));
      pitchRoofPlane(light, 'x', -side as -1 | 1, ang, 'gable');
      light.translate(-side * 1.15, wallH + roofH - 1.15 * Math.tan(ang) + 0.12, sz);
      pane.push(light);
    }
    // eave gutter on the long wall
    const gutter = dressing(new THREE.CylinderGeometry(0.065, 0.065, d + 0.5, 7, 1).rotateX(Math.PI / 2));
    gutter.translate(side * (w / 2 + 0.46), wallH - 0.04, 0);
    parts.dark.push(gutter);
  }
  // ridge vents (dark monitor boxes along the ridge line)
  for (let k = 0; k < 3; k++) {
    const vz = -d / 3 + k * (d / 3);
    parts.dark.push(box(0.8, 0.55, 2.6).translate(0, wallH + roofH + 0.22, vz));
  }
  // roller shutters on the street face (+z), each between two guide posts under the old rail
  for (const dx of [-w * 0.22, w * 0.22]) {
    const shutter = box(3.1, 3.6, 0.14, 0.8).translate(dx, 1.8, d / 2 + 0.09);
    paintHex(shutter, local, steelClad ? WAREHOUSE_DOOR_HEX_STEEL : WAREHOUSE_DOOR_HEX, 1, 0.03);
    shutter.userData.uvJitter = 'consume'; // the timber leaf's four draws, kept
    parts.structureMetal!.push(shutter);
    parts.dark.push(box(3.5, 0.16, 0.10).translate(dx, 3.85, d / 2 + 0.12));
    for (const px of [-1.62, 1.62]) parts.dark.push(dressing(box(0.12, 3.7, 0.12, 1.0)).translate(dx + px, 1.85, d / 2 + 0.08));
    // the shutter box above the opening
    parts.dark.push(dressing(box(3.4, 0.36, 0.30, 1.0)).translate(dx, 3.95 + 0.18, d / 2 + 0.15));
  }
  // clerestory band both long walls
  for (let k = 0; k < 5; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / 5);
    for (const side of [-1, 1]) {
      if (rng() < 0.15) continue;
      pane.push(box(0.08, 1.0, 1.6).translate(side * (w / 2 + 0.05), wallH - 1.05, zz));
      parts.wood.push(box(0.12, 0.10, 1.75).translate(side * (w / 2 + 0.06), wallH - 1.65, zz));
    }
  }
  // loading dock apron + a couple of pallets/crates
  const dock = box(w * 0.7, 0.7, 2.2, 0.6);
  dock.translate(0, 0.35, d / 2 + 1.25);
  parts.stone.push(jitterUV(dock, rng));
  for (let k = 0, n = 2 + ((rng() * 3) | 0); k < n; k++) {
    const cs = 0.6 + rng() * 0.5;
    const crate = box(cs, cs, cs, 1.0);
    crate.rotateY(rng() * Math.PI * 0.5);
    crate.translate((rng() - 0.5) * w * 0.6, 0.7 + cs / 2, d / 2 + 1.0 + rng() * 0.8);
    parts.wood.push(jitterUV(crate, rng));
  }
  // round 75: dock bumpers, a skillion canopy on two posts over the dock, the painted sign board on the gable
  for (const bx of [-w * 0.25, 0, w * 0.25]) {
    parts.dark.push(dressing(box(0.28, 0.32, 0.16, 1.0)).translate(bx, 0.42, d / 2 + 2.35 + 0.08));
  }
  const canopyY = Math.min(wallH - 0.9, 4.3);
  const canopy = dressing(box(w * 0.74, 0.1, 2.7, 0.35));
  pitchRoofPlane(canopy, 'z', 1, 0.12, 'skillion');
  canopy.translate(0, canopyY, d / 2 + 1.45);
  parts.roof.push(canopy);
  for (const px of [-w * 0.33, w * 0.33]) {
    const postH = canopyY - 0.16 - 0.7;
    parts.dark.push(dressing(box(0.14, postH, 0.14, 1.0)).translate(px, 0.7 + postH / 2, d / 2 + 2.15));
  }
  const sign = dressing(box(w * 0.42, 1.0, 0.07, 0.8));
  sign.translate(0, wallH - 0.62, d / 2 + 0.05);
  // follow-up 2 (2026-09-26): the board rides the map's plaster bucket — plaster2 was a whole extra mesh (one draw a
  // pass, four cascades) for a dozen boards on the maps that had no plaster2 wall of their own
  parts.plaster.push(sign);
  if (steelClad) {
    // corner trims and a girt line read the sheet hall as a framed building; on a snow map they are the plant's
    // oxide red on the frosted sheet (the baked bucket takes a vertex colour, the dark one does not)
    const trim = (geo: THREE.BufferGeometry): void => {
      if (snowClad) parts.baked!.push(paintHex(dressing(geo), local, WAREHOUSE_TRIM_HEX_SNOW, 1, 0.04));
      else parts.dark.push(dressing(geo));
    };
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      trim(box(0.12, wallH - 0.1, 0.12, 1.0).translate(cx * (w / 2 - 0.01), wallH / 2, cz * (d / 2 - 0.01)));
    }
    for (const side of [-1, 1]) {
      trim(box(0.06, 0.08, d - 0.2, 1.0).translate(side * (w / 2 + 0.02), wallH * 0.52, 0));
    }
  }
  if (snowClad) {
    // snow ledges on both eaves: the weathering hook loads every upward face with snow, but the eave's edge and the
    // gutter line are vertical faces — a white ledge over the gutter gives the roof its snow-capped edge
    for (const side of [-1, 1]) {
      const ledge = paintHex(dressing(box(0.34, 0.15, d + 0.62, 0.5)), local, WAREHOUSE_SNOW_HEX, 1, 0.02);
      ledge.translate(side * (w / 2 + 0.30), wallH + 0.10, 0);
      parts.baked!.push(ledge);
    }
  }
  for (const key of Object.keys(parts)) {
    const source = parts[key];
    const target = buckets[key];
    if (source && target) for (const geometry of source) target.push(geometry);
  }
  return { w: w + 0.4, d: d + 3.0, h: wallH + roofH + 0.8 };
}

// ---------------------------------------------------------------------------------------------- containers (round 75)

/** Local stream forked from one shared draw's bits: new decisions never move the seeded stream of later placements. */
function forkRng(u: number): () => number {
  let a = (u * 4294967296) | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const _livery = new THREE.Color();

/** Flat vertex paint from a colour, the value jitter drawn from the given stream (one draw per vertex). */
function paintHex(geo: THREE.BufferGeometry, rng: () => number, hex: number, scale = 1, jitter = 0.06): THREE.BufferGeometry {
  _livery.set(hex);
  return paintGeo(geo, rng, _livery.r * scale, _livery.g * scale, _livery.b * scale, jitter);
}

/**
 * Rail-served gantry crane: two braced leg towers, a deep bridge girder
 * spanning them, trolley + hook block and a cabin — the yard's skyline
 * landmark (~12.5 m).
 */
export function makeGantry(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const span = 15 + rng() * 2, legH = 9.5 + rng() * 1.2, girderH = 1.35;
  const mk = (geometry: THREE.BufferGeometry): void => { buckets.dark.push(geometry); };
  for (const s of [-1, 1]) { // A-frame leg towers
    const lx = s * span / 2;
    for (const dz of [-1.7, 1.7]) {
      const leg = box(0.42, legH, 0.42, 1.0);
      leg.translate(lx, legH / 2, dz);
      mk(leg);
    }
    // cross braces (X read from a distance is carried by two diagonals)
    for (const dir of [-1, 1]) {
      const br = box(0.16, Math.hypot(legH * 0.55, 3.4), 0.16, 1.0);
      br.rotateX(dir * Math.atan2(3.4, legH * 0.55));
      br.translate(lx, legH * 0.45, 0);
      mk(br);
    }
    const foot = box(1.4, 0.5, 4.6, 0.8);
    foot.translate(lx, 0.22, 0);
    buckets.stone.push(jitterUV(foot, rng));
    // Cap beam joins both A-frame legs to the central bridge. Previously the
    // girder visually hovered between the two z-offset towers.
    const cap = box(0.62, 0.42, 4.0, 0.8);
    cap.translate(lx, legH + 0.14, 0);
    mk(cap);
  }
  // bridge girder + rail, overhanging one side
  const gird = box(span + 4.5, girderH, 1.5, 0.7);
  gird.translate(0.8, legH + girderH / 2, 0);
  mk(gird);
  const rail = box(span + 4.5, 0.14, 0.2, 1.0);
  rail.translate(0.8, legH - 0.07, 0);
  mk(rail);
  // trolley + cable + hook block
  const tx = (rng() - 0.5) * span * 0.6;
  const trolley = box(1.5, 0.7, 1.9, 1.0);
  trolley.translate(tx, legH + girderH + 0.3, 0);
  mk(trolley);
  const drop = 2.2 + rng() * 2.6;
  const cable = box(0.05, drop, 0.05, 2.0);
  cable.translate(tx, legH - drop / 2, 0);
  mk(cable);
  const hook = box(0.55, 0.75, 0.4, 1.0);
  hook.translate(tx, legH - drop - 0.35, 0);
  mk(hook);
  // operator cabin under the girder
  const cab = box(1.6, 1.5, 1.6, 0.8);
  cab.translate(-span / 2 + 1.4, legH - 0.9, 1.3);
  mk(cab);
  // Twin hangers physically seat the operator cabin under the girder.
  for (const x of [-span / 2 + 0.95, -span / 2 + 1.85]) {
    const hanger = box(0.12, 0.54, 0.12, 1.0);
    hanger.translate(x, legH + 0.08, 0.62);
    mk(hanger);
  }
  if (buckets.glass) {
    const gl = box(1.4, 0.7, 0.06);
    gl.translate(-span / 2 + 1.4, legH - 0.65, 2.11);
    buckets.glass.push(gl);
  }
  return { w: span + 5, d: 5.4, h: legH + girderH + 0.8 };
}

/** Riveted water tower: cylindrical tank on four braced legs + conical cap. */
export function makeWaterTower(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const legH = 7.2 + rng() * 0.8, tankH = 3.4, tankR = 2.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(0.3, legH + 0.4, 0.3, 1.2);
    // Feet flare away from the tower centre while the tops converge beneath
    // the vessel. The old signs did the inverse, making the support cage read
    // upside down from every Garage and battlefield angle.
    leg.rotateZ(sx * 0.045);
    leg.rotateX(sz * -0.045);
    leg.translate(sx * 1.7, legH / 2, sz * 1.7);
    buckets.dark.push(leg);
  }
  for (const yy of [legH * 0.4, legH * 0.75]) { // ring braces
    for (const rot of [0, Math.PI / 2]) {
      const br = box(3.9, 0.14, 0.14, 1.2);
      br.rotateY(rot);
      br.translate(0, yy, 0);
      buckets.dark.push(br);
    }
  }
  const tank = new THREE.CylinderGeometry(tankR, tankR, tankH, 12, 1);
  scaleUV(tank, 6, 2);
  tank.translate(0, legH + tankH / 2, 0);
  buckets.plaster.push(jitterUV(tank, rng));
  const cap = new THREE.ConeGeometry(tankR + 0.25, 1.1, 12, 1);
  scaleUV(cap, 3, 1);
  cap.translate(0, legH + tankH + 0.55, 0);
  buckets.roof.push(cap);
  const pipe = box(0.22, legH, 0.22, 2.0);
  pipe.translate(0.6, legH / 2, 0);
  buckets.dark.push(pipe);
  return { w: 5.4, d: 5.4, h: legH + tankH + 1.2 };
}

/** Standalone round brick smokestack (~17 m) on a square plinth — the
 * overcast skyline needs verticals even where no factory slot landed. */
export function makeStack(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const stackH = 15.5 + rng() * 3;
  const plinth = box(3.2, 1.6, 3.2, 0.7);
  plinth.translate(0, 0.7, 0);
  buckets.stone.push(jitterUV(plinth, rng));
  const stack = new THREE.CylinderGeometry(0.72, 1.15, stackH, 10, 1);
  scaleUV(stack, 4, 8);
  stack.translate(0, 1.4 + stackH / 2, 0);
  buckets.stone.push(jitterUV(stack, rng));
  const crown = new THREE.CylinderGeometry(0.92, 0.78, 1.0, 10, 1);
  crown.translate(0, 1.4 + stackH + 0.4, 0);
  buckets.dark.push(crown);
  return { w: 3.4, d: 3.4, h: stackH + 2.6 };
}

/** Open-sided loading shed: platform, posts, mono-pitch roof, crate stacks. */
export function makeShed(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 9 + rng() * 2, d = 6.4, ph = 3.4 + rng() * 0.4;
  const roofAngle = 0.09;
  const roofCenterY = 0.55 + ph + 0.06;
  const roofBottomOffset = 0.07;
  const plat = box(w, 0.55, d, 0.6);
  plat.translate(0, 0.27, 0);
  buckets.stone.push(jitterUV(plat, rng));
  for (const [sx, sz] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) {
    const z = sz * (d / 2 - 0.5);
    // Follow the actual mono-pitch underside. Equal-height posts left the
    // uphill row visibly short and drove the downhill row through the roof.
    const roofUndersideY = roofCenterY + Math.tan(roofAngle) * z - roofBottomOffset;
    const postH = roofUndersideY - 0.55;
    const post = box(0.22, postH, 0.22, 1.2);
    post.translate(sx * (w / 2 - 0.5), 0.55 + postH / 2, z);
    buckets.wood.push(jitterUV(post, rng));
  }
  const roof = box(w + 0.8, 0.12, d + 0.8, 0.35);
  pitchRoofPlane(roof, 'z', -1, roofAngle, 'skillion');
  roof.translate(0, roofCenterY, 0);
  buckets.roof.push(jitterUV(roof, rng));
  for (let k = 0, n = 3 + ((rng() * 4) | 0); k < n; k++) {
    const cs = 0.55 + rng() * 0.5;
    const crate = box(cs, cs, cs, 1.0);
    crate.rotateY(rng() * Math.PI * 0.5);
    crate.translate((rng() - 0.5) * (w - 2.2), 0.55 + cs / 2, (rng() - 0.5) * (d - 2.2));
    buckets.wood.push(jitterUV(crate, rng));
  }
  return { w: w + 0.8, d: d + 0.8, h: ph + 1.0 };
}

// =============================================================================
// COASTAL BUILDERS
// =============================================================================

/** Whitewashed lighthouse: tapered tower, gallery ring, dark lantern and red
 * cap (~15 m) — the fishing village's vertical landmark. */
export function makeLighthouse(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const towH = 11.5 + rng() * 1.5;
  const base = new THREE.CylinderGeometry(2.4, 2.7, 1.2, 12, 1);
  scaleUV(base, 5, 1);
  base.translate(0, 0.5, 0);
  buckets.stone.push(jitterUV(base, rng));
  const tow = new THREE.CylinderGeometry(1.35, 1.95, towH, 12, 1);
  scaleUV(tow, 5, 4);
  tow.translate(0, 1.1 + towH / 2, 0);
  buckets.plaster.push(jitterUV(tow, rng));
  // gallery ring + rail posts
  const gal = new THREE.CylinderGeometry(1.95, 1.95, 0.18, 12, 1);
  gal.translate(0, 1.1 + towH + 0.09, 0);
  buckets.dark.push(gal);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const post = box(0.07, 0.9, 0.07, 2.0);
    post.translate(Math.cos(a) * 1.8, 1.1 + towH + 0.6, Math.sin(a) * 1.8);
    buckets.dark.push(post);
  }
  // lantern: glass drum + red cap
  const lant = new THREE.CylinderGeometry(1.0, 1.0, 1.5, 10, 1);
  lant.translate(0, 1.1 + towH + 0.95, 0);
  if (buckets.glass) markWorldLantern(lant);
  (buckets.glass || buckets.dark).push(lant);
  const cap = new THREE.ConeGeometry(1.25, 1.0, 10, 1);
  cap.translate(0, 1.1 + towH + 2.1, 0);
  buckets.roof.push(cap);
  const door = box(0.9, 1.8, 0.1, 1.0);
  door.translate(0, 0.9, 1.95);
  buckets.wood.push(door);
  return { w: 5.6, d: 5.6, h: towH + 3.4 };
}

/** Timber boat shed: low gabled plank hall with a wide slipway mouth and an
 * upturned dinghy alongside. */
export function makeBoatshed(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 7.4 + rng() * 1.2, d = 9.5 + rng() * 1.5, wallH = 2.8, roofH = 1.7;
  const base = box(w + 0.3, 0.5, d + 0.3, 0.7);
  base.translate(0, -0.05, 0);
  buckets.stone.push(jitterUV(base, rng));
  const hall = box(w, wallH, d, 0.6);
  hall.translate(0, wallH / 2 + 0.2, 0);
  buckets.wood.push(jitterUV(hall, rng));
  buckets.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH + 0.2, d / 2 - 0.15));
  buckets.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH + 0.2, -d / 2 + 0.15));
  // (the buildings stream, 2026-10-13: each slab's underside on the gable's own slope, the loft closed under them)
  const seat = gableSlabSeat(w / 2, roofH, 0.4, 0.11);
  buckets.wood.push(gableAttic(w, roofH, d).translate(0, wallH + 0.2, 0));
  for (const side of [-1, 1]) {
    const slab = box(seat.length, 0.11, d + 0.7, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, seat.pitch, 'gable');
    slab.translate(-side * seat.out, wallH + 0.2 + seat.up, 0);
    buckets.roof.push(slab);
  }
  // slipway mouth (dark opening) + ramp planks on the street face
  const mouth = box(w * 0.55, wallH * 0.8, 0.1);
  mouth.translate(0, wallH * 0.45 + 0.2, d / 2 + 0.06);
  buckets.dark.push(mouth);
  const ramp = box(w * 0.5, 0.1, 2.6, 0.8);
  ramp.rotateX(0.06);
  ramp.translate(0, 0.16, d / 2 + 1.4);
  buckets.wood.push(jitterUV(ramp, rng));
  // upturned dinghy alongside
  {
    const hull = new THREE.SphereGeometry(1, 9, 6);
    scaleUV(hull, 2, 1);
    hull.scale(2.0, 0.55, 0.75);
    hull.rotateY((rng() - 0.5) * 0.5);
    hull.translate(w / 2 + 1.3, 0.5, -d * 0.2);
    buckets.wood.push(jitterUV(hull, rng));
  }
  return { w: w + 3.0, d: d + 2.6, h: wallH + roofH + 0.6 };
}

/** Net-drying racks + stacked crab pots and fish crates — a working quay
 * plot that fills a village slot without another cottage. */
export function makeNetYard(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 8.5, d = 6.5;
  for (let r = 0; r < 2; r++) { // net rack rows: posts + two rails + hung mesh
    const rz = -d / 2 + 1.4 + r * 3.2;
    for (const sx of [-1, 0, 1]) {
      const post = box(0.14, 2.2, 0.14, 1.4);
      post.rotateZ((rng() - 0.5) * 0.05);
      post.translate(sx * (w / 2 - 1.1), 1.1, rz);
      buckets.wood.push(jitterUV(post, rng));
    }
    for (const ry of [1.35, 2.05]) {
      const rail = box(w - 2.0, 0.08, 0.08, 1.4);
      rail.translate(0, ry, rz);
      buckets.wood.push(jitterUV(rail, rng));
    }
    // hung net: thin dark sagging sheet
    const net = box(w - 2.4, 1.15, 0.04, 1.0);
    net.rotateX((rng() - 0.5) * 0.10);
    net.translate(0, 1.35, rz + 0.10);
    buckets.dark.push(net);
  }
  // crab pots (dark slatted cubes) + pale fish crates
  for (let k = 0, n = 4 + ((rng() * 4) | 0); k < n; k++) {
    const cs = 0.45 + rng() * 0.3;
    const pot = box(cs, cs * 0.8, cs, 1.2);
    pot.rotateY(rng() * Math.PI);
    pot.translate((rng() - 0.5) * (w - 2), cs * 0.4, d / 2 - 0.9 - rng() * 1.2);
    (rng() < 0.5 ? buckets.dark : buckets.wood).push(pot);
  }
  return { w, d, h: 2.4 };
}

/**
 * A colliery colony terrace (a 'terrace' plot, terraceLayout.ts; the buildings lane with map-revival, 2026-10-11, for
 * Cinder Junction's colony streets): two-storey brick houses sharing party walls across the plot's width, their doors
 * to +z with the steps on the plot's front edge (the pavement line), a slate gable roof whose ridge runs along the row
 * on a socle 4 cm proud, a stack on the ridge at each party wall and inside each end gable, and one-storey wash-houses
 * under mono-pitch roofs behind each pair where the plot is deep enough. The plain form, for a map without a kit that
 * rebuilds it (ruhr.ts terraceRow does on Cinder Junction). Two draws, whatever the plot.
 */
export function makeTerrace(
  rng: () => number,
  buckets: GeometryBuckets,
  wallBucket = 'stone',
): StructureDimensions {
  const layout = terraceLayout(structureBuildContext(buckets)?.plot);
  const { partyWalls, houses } = terraceUnits(layout);
  const walls = buckets[wallBucket] ?? buckets.stone;
  rng(); rng();
  const W = layout.w, zc = (layout.front + layout.back) / 2, half = layout.depth / 2;
  const wallH = 5.8, over = 0.3, verge = 0.15, thick = 0.13;
  const roofH = Math.tan(40 * Math.PI / 180) * half;
  buckets.stone.push(box(W + 0.08, 0.9, layout.depth + 0.08).translate(0, -0.25, zc));
  walls.push(box(W, wallH, layout.depth).translate(0, wallH / 2, zc));
  for (const sx of [-1, 1]) {
    walls.push(gablePrism(layout.depth, roofH, 0.32).rotateY(Math.PI / 2).translate(sx * (W / 2 - 0.16), wallH, zc));
  }
  // (the buildings stream, 2026-10-13: each slab's underside on the gable's own slope, the roof space closed under them)
  const seat = gableSlabSeat(half, roofH, over, thick);
  walls.push(gableAttic(layout.depth, roofH, W).rotateY(Math.PI / 2).translate(0, wallH, zc));
  for (const side of [-1, 1] as const) {
    const slab = slabBox(W + 2 * verge, thick, seat.length, 0.35);
    pitchRoofPlane(slab, 'z', side, seat.pitch, 'gable');
    buckets.roof.push(slab.translate(0, wallH + seat.up, zc + side * seat.out));
  }
  buckets.roof.push(slabBox(W + 2 * verge, thick + 0.01, 0.34, 0.5).translate(0, wallH + roofH + 0.04, zc));
  // the stacks: one on the ridge at each party wall, one inside each end gable
  for (const x of [-W / 2 + 0.5, ...partyWalls, W / 2 - 0.5]) {
    buckets.stone.push(box(0.55, 1.7, 0.75).translate(x, wallH + roofH + 0.25, zc));
    buckets.dark.push(box(0.16, 0.3, 0.16).translate(x - 0.12, wallH + roofH + 1.25, zc));
    buckets.dark.push(box(0.16, 0.3, 0.16).translate(x + 0.12, wallH + roofH + 1.25, zc));
  }
  for (const h of houses) {
    const xc = (h.x0 + h.x1) / 2, uw = h.x1 - h.x0;
    const xd = h.door > 0 ? h.x1 - 0.9 : h.x0 + 0.9, xw = xc - h.door * uw * 0.17;
    // the door, its step on the pavement line, the windows of both floors front and back
    buckets.dark.push(box(0.95, 2.15, 0.08).translate(xd, 1.2, layout.front + 0.02));
    buckets.stone.push(box(1.25, 0.32, layout.stepDepth + 0.05).translate(xd, 0.06, layout.front + layout.stepDepth / 2 - 0.02));
    buckets.dark.push(box(1.1, 1.3, 0.06).translate(xw, 1.75, layout.front + 0.02));
    for (const x of [xc - uw * 0.2, xc + uw * 0.2]) buckets.dark.push(box(0.9, 1.3, 0.06).translate(x, 4.35, layout.front + 0.02));
    buckets.dark.push(box(0.9, 1.1, 0.06).translate(xw, 1.85, layout.back - 0.02));
    buckets.dark.push(box(0.9, 1.1, 0.06).translate(xc, 4.4, layout.back - 0.02));
  }
  if (layout.washhouses) {
    // a flat-roofed wash-house behind each pair astride their party wall (an odd last house has its own)
    const zw = layout.back - layout.washDepth / 2, top = 2.5;
    for (let i = 0; i < houses.length; i += 2) {
      const pair = i + 1 < houses.length;
      const x = pair ? houses[i].x1 : houses[i].x0 + 1.25, ww = pair ? 4.2 : 2.3;
      walls.push(box(ww, top + 0.3, layout.washDepth).translate(x, (top - 0.3) / 2, zw));
      buckets.roof.push(slabBox(ww + 0.16, 0.12, layout.washDepth + 0.08, 0.35).translate(x, top + 0.06, zw - 0.04));
      buckets.dark.push(box(0.85, 1.9, 0.06).translate(x, 1.0, layout.back - layout.washDepth - 0.02));
    }
  }
  return { w: W, d: layout.d, h: wallH + roofH + 1.4 };
}

/** Builders keyed by plan name — spread into URBAN_BUILDERS (props.ts
 * BUILDER_BY_NAME contract, see maps/urbanKit.ts). */
export const RAIL_BUILDERS: Record<string, StructureBuilder> = {
  warehouse: makeWarehouse,
  // the colliery colony's terraced rows (terraceLayout.ts; Cinder Junction)
  terrace: makeTerrace,
  containerRow: makeContainerRow,
  gantry: makeGantry,
  watertower: makeWaterTower,
  stack: makeStack,
  shed: makeShed,
  lighthouse: makeLighthouse,
  boatshed: makeBoatshed,
  netyard: makeNetYard,
};

export { makeContainerRow };
