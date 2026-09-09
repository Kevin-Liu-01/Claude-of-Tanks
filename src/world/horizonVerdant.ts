/** Verdant's visual outland only: shared watersheds and woodland in world XZ.
 * No gameplay height/collision, frame owner, new texture or persistent cache. */
import * as THREE from 'three';

type Watershed = readonly [number, number, number, number, number, number, number, number, number];
const WATERSHEDS: readonly Watershed[] = [
  [1120, 280, .20, .98, 940, 390, 82, .24, .22],
  [880, -470, .80, .60, 680, 330, 49, -.20, -.18],
  [160, -1220, .96, -.28, 1190, 470, 70, .30, .20],
  [-930, -760, .63, .78, 720, 360, 53, -.22, .16],
  [-1150, 310, -.12, .99, 910, 440, 54, .32, -.20],
  [-90, 1210, .98, .20, 1160, 470, 44, -.18, .16],
  [790, 370, .85, .53, 420, 180, 22, -.18, .14],
  [-270, -900, -.67, -.74, 380, 180, 18, .22, -.12],
  [-820, 620, -.65, .76, 360, 220, 20, -.24, .18],
];
export const VERDANT_OUTLAND_SIZE = 3072;
const saturate = (v: number): number => Math.max(0, Math.min(1, v));
function smooth(a: number, b: number, v: number): number {
  const t = saturate((v - a) / (b - a)); return t * t * (3 - 2 * t);
}
function seedShift(seed: number): number { return ((Math.imul(seed, 1664525) >>> 8) & 255) / 255 - .5; }

export function sampleVerdantOutlandHeight(x: number, z: number, seed: number): number {
  const shift = seedShift(seed) * 36;
  let height = 9;
  for (const [cx, cz, ax, az, length, width, rise, bend, asymmetry] of WATERSHEDS) {
    const dx = x + shift - cx, dz = z - shift * .7 - cz;
    const along = (dx * ax + dz * az) / length;
    const cross = (-dx * az + dz * ax) / width - bend * along * along;
    const across = cross / (1 + asymmetry * Math.max(-1, Math.min(1, cross)));
    const support = Math.max(0, 1 - along * along - across * across);
    // A broad tributary joins the leeward drainage, cutting a shoulder rather
    // than adding another independent bump or a high-frequency summit.
    const tributary = Math.max(0, 1 - ((across - .50 - along * .34) / .32) ** 2)
      * smooth(-.65, .50, along);
    height += rise * support * support * (1 - tributary * .32);
  }
  return height;
}

/** Stand-scale lobes and clearings, not tree-sized spots or altitude stripes.
 * The base atlas and every supported canopy edge call this SAME field. */
export function sampleVerdantWoodland(x: number, z: number, seed: number): number {
  const shift = seedShift(seed) * 36;
  let cover = 0;
  for (let i = 0; i < WATERSHEDS.length; i++) {
    if (i === 1 || i === 5) continue; // open eastern pasture and southern lowland
    const [cx, cz, ax, az, length, width, , bend, asymmetry] = WATERSHEDS[i];
    const dx = x + shift - cx, dz = z - shift * .7 - cz;
    const along = (dx * ax + dz * az) / (length * .88);
    const cross = (-dx * az + dz * ax) / width - bend * along * along;
    const across = (cross - .16) / (.70 + asymmetry * Math.max(-1, Math.min(1, cross)));
    const lobe = 1 - along * along - across * across;
    const clearing = Math.max(0, 1 - ((along - .16) / .34) ** 2 - ((across + .20) / .66) ** 2);
    cover = Math.max(cover, smooth(.02, .42, lobe) * (1 - smooth(.10, .65, clearing)));
  }
  return cover;
}

export function verdantGroundChannel(cover: number, channel: number): number {
  return channel === 0 ? .66 - cover * .27 : channel === 1 ? .67 - cover * .20 : .61 - cover * .25;
}

interface OutlandRing {
  rows: readonly { skirt?: boolean }[];
  positions: Float32Array;
  heights: Float32Array;
  maxHeight: number;
}

export function shapeVerdantOutland(ring: OutlandRing, seed: number, amp: number): void {
  const columns = ring.heights.length / ring.rows.length;
  ring.maxHeight = 1;
  for (let row = 0; row < ring.rows.length; row++) {
    if (ring.rows[row].skirt) continue;
    for (let column = 0; column < columns; column++) {
      const i = row * columns + column, o = i * 3, rim = (columns + column) * 3;
      const x = ring.positions[o], z = ring.positions[o + 2];
      const gap = Math.hypot(x, z) - Math.hypot(ring.positions[rim], ring.positions[rim + 2]);
      const field = sampleVerdantOutlandHeight(x, z, seed) * amp;
      const weight = smooth(0, 180, gap);
      const height = ring.positions[rim + 1] * (1 - weight) + field * weight;
      ring.heights[i] = height; ring.positions[o + 1] = height;
      ring.maxHeight = Math.max(ring.maxHeight, height);
    }
  }
}

export function mapVerdantOutlandUv(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / VERDANT_OUTLAND_SIZE + .5,
      position.getZ(i) / VERDANT_OUTLAND_SIZE + .5);
  }
}

/** Four atlas variants, same 768×128 allocation. Individual broadleaf crowns
 * break the edge of regional stands; no full-width canopy roof is painted. */
export function paintVerdantCanopy(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number): void {
  const band = height / 4;
  for (let variant = 0; variant < 4; variant++) {
    const bottom = height - variant * band - 2;
    ctx.save(); ctx.beginPath(); ctx.rect(0, bottom - band + 3, width, band - 2); ctx.clip();
    ctx.fillStyle = 'rgb(180,180,180)';
    ctx.fillRect(0, bottom - band * .27, width, band * .27 + 1);
    for (let tree = 0; tree < 23; tree++) {
      const jitter = Math.sin(tree * 7.13 + variant * 5.77 + seed * .001);
      const x = (tree + .5 + jitter * .22) / 23 * width;
      const tall = band * (.56 + (.5 + .5 * Math.sin(tree * 2.41 + variant)) * .32);
      const crown = width / 23 * (.40 + (.5 + .5 * Math.cos(tree * 5.31)) * .20);
      for (const wrap of [-width, 0, width]) {
        const px = x + wrap;
        ctx.fillStyle = 'rgb(174,174,174)'; ctx.fillRect(px - width / 1600, bottom - tall * .6, width / 800, tall * .6);
        ctx.fillStyle = tree % 3 === 0 ? 'rgb(205,205,205)' : 'rgb(194,194,194)';
        ctx.beginPath();
        ctx.ellipse(px, bottom - tall * .65, crown, tall * .35, jitter * .14, 0, Math.PI * 2);
        ctx.ellipse(px - crown * .48, bottom - tall * .52, crown * .72, tall * .28, -.2, 0, Math.PI * 2);
        ctx.ellipse(px + crown * .55, bottom - tall * .55, crown * .70, tall * .25, .2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

interface WoodlandContext {
  positions: Float32Array;
  colors: Float32Array;
  rows: readonly { skirt?: boolean }[];
  seed: number;
  layers: number;
  atlas: THREE.Texture;
}

interface WoodlandArrays { pos: number[]; color: number[]; uv: number[]; indices: number[] }

function appendWoodlandColumn(arrays: WoodlandArrays, context: WoodlandContext,
  index: number, u: number, rank: number, span: number): void {
  const p = context.positions;
  const x = p[index * 3], y = p[index * 3 + 1], z = p[index * 3 + 2];
  const cover = sampleVerdantWoodland(x, z, context.seed);
  const drop = span * .20;
  arrays.pos.push(x, y - drop, z, x, y + span - drop, z);
  for (let vertex = 0; vertex < 2; vertex++) for (let channel = 0; channel < 3; channel++) {
    arrays.color.push(context.colors[index * 3 + channel]
      * verdantGroundChannel(cover, channel) * 1.61 / (196 / 255));
  }
  const image = context.atlas.image as { height: number };
  const pad = 1.5 / image.height;
  arrays.uv.push(u, rank / 4 + pad, u, (rank + 1) / 4 - pad);
}

function woodlandCandidates(context: WoodlandContext, row: number, columns: number,
  selected: Uint16Array): number {
  const p = context.positions;
  let count = 0;
  for (let column = 0; column < columns; column++) {
    const a = row * columns + column, b = row * columns + (column + 1) % columns;
    const ca = sampleVerdantWoodland(p[a * 3], p[a * 3 + 2], context.seed);
    const cb = sampleVerdantWoodland(p[b * 3], p[b * 3 + 2], context.seed);
    if (Math.min(ca, cb) >= .32 && Math.min(p[a * 3 + 1], p[b * 3 + 1]) >= 6) selected[count++] = column;
  }
  return count;
}

function appendWoodlandRow(arrays: WoodlandArrays, context: WoodlandContext,
  row: number, rank: number, limit: number, candidates: Uint16Array): void {
  const columns = candidates.length, count = woodlandCandidates(context, row, columns, candidates);
  const placed = Math.min(count, limit), p = context.positions;
  let circumference = 0;
  for (let column = 0; column < columns; column++) {
    const a = (row * columns + column) * 3, b = (row * columns + (column + 1) % columns) * 3;
    circumference += Math.hypot(p[b] - p[a], p[b + 2] - p[a + 2]);
  }
  const repeats = Math.max(1, Math.round(circumference / 96));
  // Spread a bounded selection over every occupied angular sector, never
  // spend an entire row quota in whichever quadrant happens to come first.
  for (let q = 0; q < placed; q++) {
    const column = candidates[Math.floor((q + .5) * count / placed)];
    const base = arrays.pos.length / 3;
    const a = row * columns + column, b = row * columns + (column + 1) % columns;
    // Equal span at both ends keeps the terrain/opaque-apron intersection at
    // the same UV height even across each actual triangulated quad diagonal.
    const span = 10 + Math.sin((p[a * 3] + p[b * 3]) * .0135
      + (p[a * 3 + 2] + p[b * 3 + 2]) * .009) * 2;
    appendWoodlandColumn(arrays, context, a, column / columns * repeats, rank, span);
    appendWoodlandColumn(arrays, context, b, (column + 1) / columns * repeats, rank, span);
    arrays.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
}

/** Reallocate the old skyline rank capacity across four real terrain rows.
 * Each quad lies on an actual parent row edge, with an opaque buried apron.
 * There is no radial offset, valley bridge, separate owner or collision. */
export function createVerdantWoodland(context: WoodlandContext): THREE.Mesh {
  const { positions: p, rows, layers, atlas } = context;
  const columns = p.length / rows.length / 3;
  const maxQuads = Math.floor((columns + 1) * 2 * layers / 4);
  const selectedRows = [2, 4, 6, rows.length - 1].filter(row => row < rows.length && !rows[row].skirt);
  const perRow = Math.floor(maxQuads / selectedRows.length);
  const arrays: WoodlandArrays = { pos: [], color: [], uv: [], indices: [] };
  const candidates = new Uint16Array(columns);
  for (const [rank, row] of selectedRows.entries()) {
    appendWoodlandRow(arrays, context, row, rank, perRow, candidates);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2));
  geometry.setIndex(arrays.indices);
  const material = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true,
    alphaTest: .38, alphaToCoverage: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'horizon-treeline'; mesh.matrixAutoUpdate = false;
  mesh.userData.aoExclude = true;
  mesh.userData.horizonTreeline = { layers, role: 'terrain-woodland', vertices: arrays.pos.length / 3 };
  return mesh;
}

export const VERDANT_HORIZON_FRAGMENT = /* glsl */`#include <map_fragment>
float horizonMarine = 0.0;
float horizonWaterVariation = 0.0;
float canopyFine = texture2D(uDetail2, vHPos.xz * 0.012).r - 0.5;
float canopyBroad = texture2D(uDetail2, vHPos.xz * 0.0032 + vec2(0.37, 0.11)).r - 0.5;
diffuseColor.rgb *= 1.0 + canopyFine * 0.10 + canopyBroad * 0.06;
`;
