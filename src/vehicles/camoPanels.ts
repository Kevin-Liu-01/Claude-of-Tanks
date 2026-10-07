// Camouflage panels (2026-10-07, tank-accessories round 4; blind-critic wave 214 on the Oplot-M: "the digital
// camouflage prints as a flat sticker across every surface, including the gun barrel wrap and hull boxes, with no
// tonal break at panel seams").
//
// Every camouflaged bucket projects ONE vehicle-scale box UV (camoWorldScale.ts), so a stowage box, a fender bin or
// a thermal-sleeve section showed the exact window of the pattern the armour behind it showed: the paint ran across
// the gap and over the lid as if it were a decal. Bolted-on items are painted as separate pieces. A camouflage panel
// keeps the projection's density and orientation (the nation's scheme is unchanged) but shifts its own window of the
// tile by a seeded phase, and carries its own paint batch (a few per cent of tone), so the pattern breaks at the
// seam where the piece meets the armour and at the seams between pieces.
//
// Who is a panel:
//  - the bolt-on painted buckets (`*Detail`, `*PaintedDetail`, `*Equipment`): every connected piece (parts whose
//    boxes overlap: a bin with its lid, ribs and latches) that is a solid (at least 6 cm in every direction) and
//    no longer than 2.4 m. Thin skins (deck plates, louvres, strips) keep the hull's projection.
//  - the gun tube bucket: every section of at least 6 cm and at most 2.4 m (thermal-sleeve sections, fume
//    extractor, jackets); a one-piece tube keeps one continuous projection.
//  - any part a builder marks with `markCamoPanel` (the structural buckets never take a phase on their own: their
//    shells are lofted from many touching strips).
//  - bolted reactive / appliqué armour (`*ExternalArmor`): every connected cassette keeps the continuous pattern
//    (crews spray ERA in place) and takes only its own paint tone, so the courses read as separate bricks.
// Phases come from the panel's own position (owner frame, centimetres) and the bucket, so HIGH and LOW, the Garage
// and every peer paint one panel the same way. No Three.js scene, DOM or fleet import; build time only.
// Cost (round 4 verification, 2026-10-07): the pass runs on every rendered build (the Garage pedestal, every battle
// tank), so it reads positions straight from the arrays, measures only the marked parts of a shell bucket, and
// finds touching pieces by a sweep along the pieces' longest spread instead of testing every pair; the panels are
// exactly the same.
import type * as THREE from 'three';

/** Bolt-on painted buckets whose connected solid pieces become panels without any authoring. */
const GROUPED_PANEL_BUCKETS: ReadonlySet<string> = new Set([
  'hullDetail', 'turretDetail', 'hullPaintedDetail', 'turretPaintedDetail', 'hullEquipment', 'turretEquipment',
]);
/** Gun tube buckets: each section on its own (collars would chain the whole tube into one piece). */
const SECTION_PANEL_BUCKETS: ReadonlySet<string> = new Set(['gun']);
/** Bolted armour buckets: connected cassettes take their own tone but keep the continuous window. */
const TONE_PANEL_BUCKETS: ReadonlySet<string> = new Set(['hullExternalArmor', 'turretExternalArmor']);

/** A panel is a solid: at least this thick in every direction (metres). Thinner pieces are skins. */
const PANEL_MIN_EXTENT_M = 0.06;
/** A single part longer than this is structure (a fender run, a tube), never a panel. */
const PANEL_MAX_PART_M = 2.4;
/** A connected piece longer than this is a chain through structure, not one painted item. */
const PANEL_MAX_GROUP_M = 3.2;
/** Window shift range in tile units (one tile is 2 m): never a near-zero shift, never a near-whole tile. */
const PHASE_MIN = 0.17;
const PHASE_SPAN = 0.66;
/** Paint-batch tone range (a vertex-colour multiplier): slightly darker to slightly lighter than the armour. */
const TONE_MIN = 0.93;
const TONE_SPAN = 0.11;
/** Bolted armour keeps the window, so its tone is the whole break: a wider batch range, biased to weathered-dark. */
const ARMOUR_TONE_MIN = 0.87;
const ARMOUR_TONE_SPAN = 0.19;

const PANEL_KEY = 'camoPanel';

/**
 * Mark a part as its own camouflage panel (it takes its own window of the pattern and its own paint tone). Parts that
 * share a `key` are one panel (a box and its lid). Returns the geometry for builder chaining.
 */
export function markCamoPanel<T extends THREE.BufferGeometry>(geometry: T, key: string | number | true = true): T {
  geometry.userData = { ...geometry.userData, [PANEL_KEY]: key };
  return geometry;
}

function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function unit(seed: number, salt: number): number {
  let h = Math.imul(seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

interface PartBox { min: [number, number, number]; max: [number, number, number] }

function partBox(part: THREE.BufferGeometry): PartBox | null {
  const position = part.getAttribute('position');
  if (!position || position.count === 0) return null;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const plain = position as THREE.BufferAttribute;
  if (!('isInterleavedBufferAttribute' in position && position.isInterleavedBufferAttribute)
      && plain.itemSize === 3 && !plain.normalized) {
    // the common layout: read the array itself (getX/Y/Z return exactly these values for a plain attribute)
    const a = plain.array, end = position.count * 3;
    for (let k = 0; k < end; k += 3) {
      const x = a[k], y = a[k + 1], z = a[k + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  } else {
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  return { min: [x0, y0, z0], max: [x1, y1, z1] };
}

const extentMin = (b: PartBox): number => Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
const extentMax = (b: PartBox): number => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
/** Boxes overlap by more than a millimetre on every axis (touching end to end is two pieces). */
const overlaps = (a: PartBox, b: PartBox): boolean => a.min[0] < b.max[0] - 0.001 && b.min[0] < a.max[0] - 0.001
  && a.min[1] < b.max[1] - 0.001 && b.min[1] < a.max[1] - 0.001 && a.min[2] < b.max[2] - 0.001 && b.min[2] < a.max[2] - 0.001;

/** Number of merged vertices one authored part contributes (mergeAll de-indexes every part). */
function mergedVertexCount(part: THREE.BufferGeometry): number {
  return part.index ? part.index.count : (part.getAttribute('position')?.count ?? 0);
}

/** Panel id per part (-1 = not a panel) for one bucket's authored parts. */
function panelGroups(bucket: string, parts: readonly THREE.BufferGeometry[], boxes: ReadonlyArray<PartBox | null>): number[] {
  const groups = new Array<number>(parts.length).fill(-1);
  let next = 0;
  // explicit panels: one id per key (`true` = this part alone)
  const byKey = new Map<string, number>();
  parts.forEach((part, i) => {
    const key = part.userData?.[PANEL_KEY];
    if (key === undefined || key === null || key === false || !boxes[i]) return;
    if (key === true) { groups[i] = next++; return; }
    const name = String(key);
    if (!byKey.has(name)) byKey.set(name, next++);
    groups[i] = byKey.get(name)!;
  });
  if (SECTION_PANEL_BUCKETS.has(bucket)) {
    parts.forEach((_, i) => {
      const b = boxes[i];
      if (groups[i] >= 0 || !b) return;
      if (extentMin(b) >= PANEL_MIN_EXTENT_M && extentMax(b) <= PANEL_MAX_PART_M) groups[i] = next++;
    });
  }
  if (!GROUPED_PANEL_BUCKETS.has(bucket) && !TONE_PANEL_BUCKETS.has(bucket)) return groups;
  // connected pieces among the remaining parts no longer than a panel (union-find over overlapping boxes)
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const free = parts.map((_, i) => i).filter((i) => groups[i] < 0 && boxes[i] && extentMax(boxes[i]!) <= PANEL_MAX_PART_M);
  // sweep along the axis the pieces spread furthest on: a pair can only overlap while the later box starts before the
  // earlier one ends (the components, and so the panels, are those of testing every pair)
  let axis = 0, widest = -Infinity;
  for (let k = 0; k < 3; k++) {
    let lo = Infinity, hi = -Infinity;
    for (const i of free) { const v = boxes[i]!.min[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo > widest) { widest = hi - lo; axis = k; }
  }
  const sweep = [...free].sort((a, b) => boxes[a]!.min[axis] - boxes[b]!.min[axis] || a - b);
  for (let a = 0; a < sweep.length; a++) {
    const boxA = boxes[sweep[a]]!, end = boxA.max[axis] - 0.001;
    for (let b = a + 1; b < sweep.length; b++) {
      const boxB = boxes[sweep[b]]!;
      if (boxB.min[axis] >= end) break;
      if (overlaps(boxA, boxB)) parent[find(sweep[a])] = find(sweep[b]);
    }
  }
  const unions = new Map<number, PartBox>();
  for (const i of free) {
    const root = find(i), b = boxes[i]!;
    const u = unions.get(root);
    if (!u) { unions.set(root, { min: [...b.min], max: [...b.max] }); continue; }
    for (let k = 0; k < 3; k++) { u.min[k] = Math.min(u.min[k], b.min[k]); u.max[k] = Math.max(u.max[k], b.max[k]); }
  }
  const ids = new Map<number, number>();
  for (const i of free) {
    const root = find(i), u = unions.get(root)!;
    if (extentMin(u) < PANEL_MIN_EXTENT_M || extentMax(u) > PANEL_MAX_GROUP_M) continue;
    if (!ids.has(root)) ids.set(root, next++);
    groups[i] = ids.get(root)!;
  }
  return groups;
}

/**
 * Give every camouflage panel among a merged bucket's authored parts its own window of the pattern (uv phase) and
 * its own paint tone (vertex colour). Call after the bucket's vehicle-scale box UV and dirt bake; `parts` are the
 * authored parts in merge order. Returns the number of panels painted.
 */
export function applyCamoPanels(merged: THREE.BufferGeometry, parts: readonly THREE.BufferGeometry[], bucket: string): number {
  const uv = merged.getAttribute('uv');
  if (!uv || !parts.length) return 0;
  const color = merged.getAttribute('color');
  // a shell bucket panels only its marked parts: measure those alone, and nothing when none is marked
  const automatic = GROUPED_PANEL_BUCKETS.has(bucket) || SECTION_PANEL_BUCKETS.has(bucket) || TONE_PANEL_BUCKETS.has(bucket);
  const marked = (part: THREE.BufferGeometry): boolean => {
    const key = part.userData?.[PANEL_KEY];
    return key !== undefined && key !== null && key !== false;
  };
  if (!automatic && !parts.some(marked)) return 0;
  const boxes = parts.map((part) => (automatic || marked(part) ? partBox(part) : null));
  const groups = panelGroups(bucket, parts, boxes);
  if (groups.every((g) => g < 0)) return 0;
  // one seed per panel from its pieces' joint box (centimetres, owner frame) and the bucket
  const seeds = new Map<number, number>();
  const joint = new Map<number, PartBox>();
  groups.forEach((g, i) => {
    if (g < 0) return;
    const b = boxes[i]!;
    const u = joint.get(g);
    if (!u) { joint.set(g, { min: [...b.min], max: [...b.max] }); return; }
    for (let k = 0; k < 3; k++) { u.min[k] = Math.min(u.min[k], b.min[k]); u.max[k] = Math.max(u.max[k], b.max[k]); }
  });
  const bucketSeed = hashString(bucket);
  for (const [g, b] of joint) {
    const cm = [0, 1, 2].map((k) => Math.round((b.min[k] + b.max[k]) * 50)).join(',');
    seeds.set(g, hashString(`${cm}|${bucketSeed}`));
  }
  const uvArray = uv.array as Float32Array;
  const colorArray = color ? color.array as Float32Array : null;
  let offset = 0;
  parts.forEach((part, i) => {
    const count = mergedVertexCount(part);
    const g = groups[i];
    if (g >= 0) {
      const seed = seeds.get(g)!;
      const toneOnly = TONE_PANEL_BUCKETS.has(bucket) && parts[i].userData?.[PANEL_KEY] === undefined;
      const du = toneOnly ? 0 : PHASE_MIN + PHASE_SPAN * unit(seed, 1);
      const dv = toneOnly ? 0 : PHASE_MIN + PHASE_SPAN * unit(seed, 2);
      const tone = toneOnly ? ARMOUR_TONE_MIN + ARMOUR_TONE_SPAN * unit(seed, 3) : TONE_MIN + TONE_SPAN * unit(seed, 3);
      for (let v = offset; v < offset + count; v++) {
        uvArray[v * 2] += du;
        uvArray[v * 2 + 1] += dv;
        if (colorArray) { colorArray[v * 3] *= tone; colorArray[v * 3 + 1] *= tone; colorArray[v * 3 + 2] *= tone; }
      }
    }
    offset += count;
  });
  if (offset !== uv.count) throw new Error(`applyCamoPanels(${bucket}): ${offset} part vertices for ${uv.count} merged`);
  uv.needsUpdate = true;
  if (color) color.needsUpdate = true;
  return new Set(groups.filter((g) => g >= 0)).size;
}
