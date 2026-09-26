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
  box, gablePrism as createGablePrism, jitterUV, pitchRoofPlane, scaleUV,
} from '../propGeometry.ts';
import {
  structureBuildContext,
  type GeometryBuckets,
  type StructureBuildContext,
  type StructureBuilder,
  type StructureDimensions,
} from './exteriorDetailKit.ts';
import {
  BOX_FACE, STEEL_ATLAS_STRIP_M, STEEL_BLANK_END_U, STEEL_DOOR_U, STEEL_STRIP_V, mapBoxFaceUv, type SteelStrip,
} from '../propsSteelAtlas.ts'; // round 75

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

/** Sheet-steel paint for the light kit's corrugated tile (props.ts structureMetal): vertex colour, box UVs at the kit's 0.55 uv/m. */
function sheetPart(geo: THREE.BufferGeometry, local: () => number, hex: number, scale = 1): THREE.BufferGeometry {
  paintHex(geo, local, hex, scale, 0.05);
  geo.userData.uvJitter = 'none';
  return geo;
}

/** A part new to the builder's stream: it takes no draws from the shared stream (props.ts jitterBuildingUvs). */
function dressing<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.uvJitter = 'none';
  return geo;
}

const WAREHOUSE_CLADDING_HEX = 0x9aa39c;   // pale weathered sheet (a polar station's halls)
const WAREHOUSE_DOOR_HEX = 0x5f6d6a;       // roller shutters, grey-green
const WAREHOUSE_DOOR_HEX_STEEL = 0x8b5a3c; // on a sheet hall the shutters are the oxide red of the plant
const WAREHOUSE_TRIM_HEX = 0x3a3f42;

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
  const parts: GeometryBuckets = {
    plaster: [], plaster2: [], stone: [], roof: [], wood: [], dark: [], baked: [], structureMetal: [],
  };
  if (buckets.glass) parts.glass = [];
  const pane = parts.glass || parts.dark;
  const w = 13.5 + rng() * 3, d = 21 + rng() * 5, wallH = 5.4 + rng() * 0.8, roofH = 1.9;
  const local = forkRng((w - 13.5) / 3 * 0.61 + (d - 21) / 5 * 0.29 + (wallH - 5.4) / 0.8 * 0.07);
  parts.stone.push(box(w + 0.4, 1.1, d + 0.4).translate(0, -0.1, 0));
  const wallBucket = steelClad ? parts.structureMetal! : parts.stone;
  const wall = box(w, wallH, d, 0.55).translate(0, wallH / 2, 0);
  const gableA = gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16);
  const gableB = gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16);
  for (const shell of [wall, gableA, gableB]) {
    if (steelClad) { paintHex(shell, local, WAREHOUSE_CLADDING_HEX, 1, 0.03); shell.userData.uvJitter = 'consume'; }
    wallBucket.push(shell);
  }
  const slope = Math.hypot(w / 2 + 0.4, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + 0.4);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.13, d + 0.7, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, ang, 'gable');
    slab.translate(-side * (w / 4 + 0.2), wallH + roofH / 2 + 0.06, 0);
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
  parts.plaster2!.push(sign);
  if (steelClad) {
    // corner trims and a girt line read the sheet hall as a framed building
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      parts.dark.push(dressing(box(0.12, wallH - 0.1, 0.12, 1.0)).translate(cx * (w / 2 - 0.01), wallH / 2, cz * (d / 2 - 0.01)));
    }
    for (const side of [-1, 1]) {
      parts.dark.push(dressing(box(0.06, 0.08, d - 0.2, 1.0)).translate(side * (w / 2 + 0.02), wallH * 0.52, 0));
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

/** ISO twenty-foot box: width across the row, height, length along the row's depth. */
const CONTAINER_W = 2.44, CONTAINER_H = 2.6, CONTAINER_L = 6.1;
/** The door leaves sit this far inside the corner posts; everything on them stays inside the body's footprint. */
const CONTAINER_DOOR_RECESS = 0.07;

/**
 * Operator liveries (authored sRGB, THREE.Color.set converts once) by battlefield character. The atlas carries
 * dark stencils, so every set stays light enough for black lettering to read; the rust mask and the weathering
 * hook do the fading.
 */
const CONTAINER_LIVERIES: Readonly<Record<string, readonly number[]>> = {
  brownfield: [0x9a4634, 0x3d5d84, 0x66744d, 0xbfa676, 0x878c91, 0x4c7a76, 0xd2cab4, 0xb56a2f],
  polar: [0xd8702a, 0x4a6fa8, 0xdedfda, 0x8f959a, 0xb85a30, 0x6e8b57],
  martian: [0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8],
};

function containerLiveries(context?: StructureBuildContext): readonly number[] {
  if (!context) return CONTAINER_LIVERIES.brownfield;
  if (context.mapId === 'mars') return CONTAINER_LIVERIES.martian;
  if (context.snowCap || context.mapId === 'whiteout') return CONTAINER_LIVERIES.polar;
  return CONTAINER_LIVERIES.brownfield;
}

const _livery = new THREE.Color();

/** Flat vertex paint from a colour, the value jitter drawn from the given stream (one draw per vertex). */
function paintHex(geo: THREE.BufferGeometry, rng: () => number, hex: number, scale = 1, jitter = 0.06): THREE.BufferGeometry {
  _livery.set(hex);
  return paintGeo(geo, rng, _livery.r * scale, _livery.g * scale, _livery.b * scale, jitter);
}

/** The 24 value draws the old cube's paint made, taken in the cube's place in the shared stream. */
function drawBodyJitter(shared: () => number): Float32Array {
  const values = new Float32Array(24);
  for (let i = 0; i < 24; i++) values[i] = 1 + (shared() - 0.5) * 0.06 * 2;
  return values;
}

/**
 * One container body: the closed box minus its door face (dropped from the index, so the solid's hull is still the
 * whole 2.44 x 6.1 m rectangle), the recessed door leaf, the reveal strips that close the recess, four locking bars
 * with their handles and the hinges — every door part strictly inside the body's footprint, so the collision
 * derivation absorbs them and the dedicated shards stay byte-identical (props.ts structureCollision, round 75).
 * The body paint draws its 24 vertex values from the shared stream (as the old box did); everything else from
 * the local one.
 */
function pushContainer(
  target: THREE.BufferGeometry[], bodyJitter: Float32Array, local: () => number,
  hex: number, sideStrip: SteelStrip, yaw: number, x: number, y: number, z: number, doorsForward: boolean,
): void {
  const W = CONTAINER_W, H = CONTAINER_H, L = CONTAINER_L, R = CONTAINER_DOOR_RECESS;
  const side = STEEL_STRIP_V[sideStrip], plain = STEEL_STRIP_V.plain, end = STEEL_STRIP_V.end;
  const parts: THREE.BufferGeometry[] = [];
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    if (!doorsForward) g.rotateY(Math.PI);
    g.rotateY(yaw);
    g.translate(x, y, z);
    parts.push(g);
    return g;
  };
  // the body: door face (+z) removed from the index; the roof and floor run their ribs across the width
  const body = new THREE.BoxGeometry(W, H, L);
  mapBoxFaceUv(body, BOX_FACE.px, [0, 1], side);
  mapBoxFaceUv(body, BOX_FACE.nx, [0, 1], side);
  const roofV: readonly [number, number] = [plain[0], plain[0] + (plain[1] - plain[0]) * (W / STEEL_ATLAS_STRIP_M)];
  mapBoxFaceUv(body, BOX_FACE.py, [0, 1], roofV, true);
  mapBoxFaceUv(body, BOX_FACE.ny, [0, 1], roofV, true);
  mapBoxFaceUv(body, BOX_FACE.nz, STEEL_BLANK_END_U, end);
  mapBoxFaceUv(body, BOX_FACE.pz, STEEL_DOOR_U, end);
  const index = body.getIndex()!;
  const kept = new Uint16Array(30);
  kept.set((index.array as Uint16Array).subarray(0, 24), 0);
  kept.set((index.array as Uint16Array).subarray(30, 36), 24);
  body.setIndex(new THREE.BufferAttribute(kept, 1));
  body.clearGroups();
  _livery.set(hex);
  const bodyColor = new Float32Array(24 * 3);
  for (let i = 0; i < 24; i++) {
    bodyColor[i * 3] = Math.min(1, _livery.r * bodyJitter[i]);
    bodyColor[i * 3 + 1] = Math.min(1, _livery.g * bodyJitter[i]);
    bodyColor[i * 3 + 2] = Math.min(1, _livery.b * bodyJitter[i]);
  }
  body.setAttribute('color', new THREE.BufferAttribute(bodyColor, 3));
  body.userData.uvJitter = 'consume';
  body.translate(0, H / 2, 0);
  place(body);
  // the door leaf, recessed; its outer face carries the door strip
  const leaf = new THREE.BoxGeometry(W - 0.12, H - 0.12, 0.03);
  for (const face of [BOX_FACE.px, BOX_FACE.nx, BOX_FACE.py, BOX_FACE.ny, BOX_FACE.nz]) mapBoxFaceUv(leaf, face, [0.55, 0.56], plain);
  mapBoxFaceUv(leaf, BOX_FACE.pz, STEEL_DOOR_U, end);
  paintHex(leaf, local, hex);
  leaf.userData.uvJitter = 'none';
  leaf.translate(0, H / 2, L / 2 - R - 0.015);
  place(leaf);
  // reveal strips closing the recess: a millimetre inside the body's walls, two short of its end plane
  const depth = R - 0.002, zc = L / 2 - R / 2 - 0.001;
  const post = 0x50565b;
  for (const [w, h, dx, dy] of [
    [W - 0.002, 0.06, 0, H - 0.031], [W - 0.002, 0.06, 0, 0.031],
    [0.06, H - 0.12, -(W / 2 - 0.031), H / 2], [0.06, H - 0.12, W / 2 - 0.031, H / 2],
  ] as const) {
    const strip = new THREE.BoxGeometry(w, h, depth);
    for (let face = 0; face < 6; face++) mapBoxFaceUv(strip, face, [0.6, 0.61], plain);
    paintHex(strip, local, post, 1, 0.04);
    strip.userData.uvJitter = 'none';
    strip.translate(dx, dy, zc);
    place(strip);
  }
  // locking bars, handles and hinges on the leaf plane, proud of it by 5 cm and short of the posts' plane
  const zBar = L / 2 - R + 0.03;
  const barHex = local() < 0.5 ? post : hex;
  for (const bx of [-0.88, -0.34, 0.34, 0.88]) {
    const bar = new THREE.BoxGeometry(0.05, H - 0.5, 0.05);
    for (let face = 0; face < 6; face++) mapBoxFaceUv(bar, face, [0.62, 0.625], plain);
    paintHex(bar, local, barHex, 0.62, 0.04);
    bar.userData.uvJitter = 'none';
    bar.translate(bx, H / 2, zBar);
    place(bar);
    if (Math.abs(bx) < 0.5) continue; // one handle per leaf, on its outer bar (176 triangles a box)
    const handle = new THREE.BoxGeometry(0.30, 0.04, 0.045);
    for (let face = 0; face < 6; face++) mapBoxFaceUv(handle, face, [0.62, 0.625], plain);
    paintHex(handle, local, post, 0.8, 0.04);
    handle.userData.uvJitter = 'none';
    handle.translate(bx - Math.sign(bx) * 0.13, 1.05 + (local() - 0.5) * 0.1, zBar);
    place(handle);
  }
  for (const hx of [-(W / 2 - 0.10), W / 2 - 0.10]) {
    const hinge = new THREE.BoxGeometry(0.12, 0.34, 0.055);
    for (let face = 0; face < 6; face++) mapBoxFaceUv(hinge, face, [0.62, 0.625], plain);
    paintHex(hinge, local, post, 0.9, 0.04);
    hinge.userData.uvJitter = 'none';
    hinge.translate(hx, H * 0.5 + (local() - 0.5) * 0.3, L / 2 - R + 0.0275);
    place(hinge);
  }
  for (const g of parts) target.push(g);
}

/**
 * Container row: 5-6 shipping boxes in a ragged rank, a couple stacked two high — the yard's signature hard
 * cover. Round 75: corrugated painted steel on the 'steel' atlas bucket (an operator livery per box from the
 * battlefield's set, marked side strips, doors with bars and hinges, corner posts and rails, rust in the mask)
 * in place of the flat vertex-painted cubes. The shared-stream draws are the ones the cubes made (count, a livery
 * draw, yaw, offset, the 24 paint draws, the stack roll, the stacked box's four draws and paint, the gap) and the
 * bodies keep the cubes' dimensions, so every later placement and every dedicated collision shard is unchanged.
 */
export function makeContainerRow(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const target = buckets.steel || buckets.baked || buckets.dark;
  const liveries = containerLiveries(structureBuildContext(buckets));
  const n = 5 + ((rng() * 2) | 0);
  const CL = CONTAINER_L, CW = CONTAINER_W, CH = CONTAINER_H;
  let x = -((n - 1) * (CW + 0.5)) / 2;
  for (let k = 0; k < n; k++) {
    const liveryDraw = rng();
    const local = forkRng(liveryDraw + k * 0.137);
    const hex = liveries[(liveryDraw * liveries.length) | 0];
    const yaw = (rng() - 0.5) * 0.08;
    const zOff = (rng() - 0.5) * 1.4;
    const jitter = drawBodyJitter(rng);
    const strip: SteelStrip = local() < 0.5 ? 'sideA' : 'sideB';
    pushContainer(target, jitter, local, hex, strip, yaw, x, 0, zOff, local() < 0.5);
    if (rng() < 0.45) { // second tier
      const liveryDraw2 = rng();
      const local2 = forkRng(liveryDraw2 + k * 0.311);
      const hex2 = liveries[(liveryDraw2 * liveries.length) | 0];
      const jitter2 = drawBodyJitter(rng); // the cube painted before it was posed
      const yaw2 = yaw + (rng() - 0.5) * 0.05;
      const x2 = x + (rng() - 0.5) * 0.2;
      const z2 = zOff + (rng() - 0.5) * 0.5;
      pushContainer(target, jitter2, local2, hex2, local2() < 0.5 ? 'sideA' : 'sideB', yaw2, x2, CH + 0.02, z2, local2() < 0.5);
    }
    x += CW + 0.4 + rng() * 0.5;
  }
  const w = n * (CW + 0.5) + 0.6;
  return { w, d: CL + 2.2, h: CH * 2 + 0.2 };
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
  const slope = Math.hypot(w / 2 + 0.4, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + 0.4);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.11, d + 0.7, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, ang, 'gable');
    slab.translate(-side * (w / 4 + 0.2), wallH + 0.2 + roofH / 2 + 0.05, 0);
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

/** Builders keyed by plan name — spread into URBAN_BUILDERS (props.ts
 * BUILDER_BY_NAME contract, see maps/urbanKit.ts). */
export const RAIL_BUILDERS: Record<string, StructureBuilder> = {
  warehouse: makeWarehouse,
  containerRow: makeContainerRow,
  gantry: makeGantry,
  watertower: makeWaterTower,
  stack: makeStack,
  shed: makeShed,
  lighthouse: makeLighthouse,
  boatshed: makeBoatshed,
  netyard: makeNetYard,
};
