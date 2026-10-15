// src/world/maps/containerRowKit.ts — the container rows' kit (the looks lane, 2026-10-15; the coordinator's ruling on the
// garage critic panel: "pastel, smooth container rows" on Cinder, Sirocco, Glacier and Ironworks, on maps and in garages).
//
// Extract-then-own: the rail kit's row (railKit.ts makeContainerRow, pushContainer, containerLiveries and the
// constants and draws only they use) moved here byte for byte; the shared helpers it paints with copied. railKit keeps
// the row in its builder table and re-exports it, so every map, kit and garage draws what it drew before.
import * as THREE from 'three';
import { structureBuildContext, type GeometryBuckets, type StructureBuildContext, type StructureDimensions } from './exteriorDetailKit.ts';
import {
  BOX_FACE, STEEL_ATLAS_STRIP_M, STEEL_BLANK_END_U, STEEL_DOOR_U, STEEL_STRIP_V, mapBoxFaceUv, type SteelStrip,
} from '../propsSteelAtlas.ts';
import { drawsPeriodFreight, pushPeriodFreight } from './periodFreight.ts';

// --- the rail kit's paint helpers (railKit.ts, copied) -------------------------------------------------------------

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

// --- the row (railKit.ts, moved) ---------------------------------------------------------------------------------

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
  const context = structureBuildContext(buckets);
  const liveries = containerLiveries(context);
  // the map-revival lane (2026-10-09): before the ISO box (periodFreight.ts) the seats hold the period's freight, on a
  // map with its own mix (a kit that rebuilds the row keeps the base row's bounds: drawsPeriodFreight)
  const freightMap = context && drawsPeriodFreight(context.mapId) ? context.mapId : null;
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
    if (freightMap !== null) {
      // the same shared draws as the boxes: the stack roll, then the stacked box's livery, paint, yaw and offsets
      const upper = rng() < 0.45;
      if (upper) { rng(); drawBodyJitter(rng); rng(); rng(); rng(); }
      pushPeriodFreight(buckets, local, freightMap, x, zOff, yaw, upper);
      x += CW + 0.4 + rng() * 0.5;
      continue;
    }
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
