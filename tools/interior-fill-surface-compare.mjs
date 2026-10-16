#!/usr/bin/env node
// tools/interior-fill-surface-compare.mjs — the before/after proof for the interior-fill face cull (tank-opt HIDDEN,
// 2026-10-16; owner 2026-10-15: "inside the tanks where we cant see, we dont have unneeded geometry").
//
//   node tools/interior-fill-surface-compare.mjs dump --all|--ids=a,b --quality=high|low --out=<dir>
//   node tools/interior-fill-surface-compare.mjs compare --before=<dir> --after=<dir> [--json=<path>]
//   node tools/interior-fill-surface-compare.mjs raster --all|--ids=a,b [--dirs=96] [--px-per-voxel=3] [--dents=4] [--json=<path>]
//
// `dump` builds every requested tank exactly as the battle roster does (fleetFactory createTank after
// ensureTankBuilder, batchStatic, eraVisualBindingReceipt off; HIGH is the player's build with battleDetailLod off,
// LOW the bot's build with battleDetailLod on) and writes, per tank, every mesh in the visual's graph (visible or not,
// every LOD level, every static-merge side-table source geometry) as a header row plus one 64-bit hash per triangle,
// in draw order. A triangle's hash covers the raw bytes of every vertex attribute of its three corners (position,
// normal, uv, colour, ...), so two hashes are equal only when the triangle is bit-identical. Mesh headers carry the
// name, materials (type, side, transparency, depth flags), world matrix, draw range, groups, instance data and the
// side-table rows (source name and triangle range).
//
// `compare` checks, tank by tank, that the after-build is the before-build with whole triangles removed and nothing
// else changed: the same meshes in the same order with the same materials, matrices and instances; each mesh's
// after-sequence is an order-preserving subsequence of its before-sequence; every removed triangle belongs, by the
// before-build's own side table or mesh name, to a `<component>InteriorFill` source; and the per-tank removed count
// equals the fill records' internal-face count (interiorFills.ts interiorFillFaceCounts, two triangles a face; a fill
// folded into a merged draw is counted again in its retained side-table source). Run it with the dump of
// the commit before the cull as --before and the cull's dump as --after.
//
// `raster` is the pixel check that the culled faces are never seen, with no build and no baseline: every component's
// fill (hull, turret, gun) is meshed alone with all six faces per box (the pre-cull mesher), with nothing else in front
// of it, and rasterised orthographically from --dirs directions over the whole sphere (from below too; an orthographic
// view along d holds every ray along d, so it covers every perspective camera, pose and turret-off tumble) at
// --px-per-voxel pixels per fill voxel, back faces culled as the FrontSide fill material culls them, edges inclusive.
// Per pixel it keeps the nearest drawn (kept) face and the nearest culled face: a culled face nearer than every kept
// face, or covering a pixel no kept face covers, would be a pixel the cull changes. Other geometry only adds occluders,
// so a face its own solid hides here is hidden in every live state (each component is rigid). Depth ties within a
// micron (pixel centres on an edge both faces share) are counted apart. --dents=<n> also poses each hull and turret
// fill under n random wreck-dent sets (the destroyed state's vertex-shader crumple, wreckDents.ts radii and depths):
// a dent moves face corners, not face interiors, so T-junctions between drawn faces open hairline cracks, and the
// count of crack pixels a culled face used to back is reported (not gated).
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { materialClass } from './tank-surface-collect.mjs'; // installs the node canvas shim builders paint through

const [mode] = process.argv.slice(2);
const args = process.argv.slice(3);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);

// Two 32-bit FNV-1a lanes with different offsets (a 64-bit fingerprint per triangle): cheap and order-sensitive.
function hashBytes(bytes, start, end, h1, h2) {
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x01000193) >>> 0;
  }
  return [h1, h2];
}

function attributeViews(geometry) {
  const views = [];
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name];
    const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const element = array.BYTES_PER_ELEMENT;
    const stride = attribute.isInterleavedBufferAttribute ? attribute.data.stride * element : attribute.itemSize * element;
    const offset = attribute.isInterleavedBufferAttribute ? attribute.offset * element : 0;
    views.push({ name, bytes, stride, offset, size: attribute.itemSize * element, type: array.constructor.name, itemSize: attribute.itemSize, normalized: !!attribute.normalized });
  }
  return views;
}

/** One hash pair per triangle of the geometry's full index (or vertex) range, in order. */
function triangleHashes(geometry) {
  const views = attributeViews(geometry);
  const index = geometry.index ? geometry.index.array : null;
  const position = geometry.getAttribute('position');
  const corners = index ? index.length : position ? position.count : 0;
  const count = Math.floor(corners / 3);
  const out = new Uint32Array(count * 2);
  for (let t = 0; t < count; t++) {
    let h1 = 0x811c9dc5, h2 = 0x6c62272e;
    for (let c = 0; c < 3; c++) {
      const vertex = index ? index[3 * t + c] : 3 * t + c;
      for (const view of views) {
        const start = view.offset + vertex * view.stride;
        [h1, h2] = hashBytes(view.bytes, start, start + view.size, h1, h2);
      }
      h1 = Math.imul(h1 ^ 0xff, 0x01000193) >>> 0; // corner separator
    }
    out[2 * t] = h1; out[2 * t + 1] = h2;
  }
  return { hashes: out, attributes: views.map(({ name, type, itemSize, normalized }) => `${name}:${type}x${itemSize}${normalized ? 'n' : ''}`) };
}

function hashArray(array) {
  if (!array) return null;
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const [h1, h2] = hashBytes(bytes, 0, bytes.length, 0x811c9dc5, 0x6c62272e);
  return `${h1.toString(16)}${h2.toString(16)}`;
}

function materialRow(material) {
  if (!material) return null;
  const cls = materialClass(material);
  return { type: material.type, name: material.name || '', side: material.side, transparent: !!material.transparent, opacity: material.opacity,
    alphaTest: material.alphaTest, depthWrite: material.depthWrite, depthTest: material.depthTest, visible: material.visible,
    colorPass: !!cls, polygonOffset: material.polygonOffset ? [material.polygonOffsetFactor, material.polygonOffsetUnits] : null };
}

const FILL_NAME = /InteriorFill$/;

async function dump() {
  const quality = opt('quality', 'high');
  if (quality !== 'high' && quality !== 'low') throw new Error('--quality must be high or low');
  const outDir = resolve(opt('out', '.qa-dev/out/interior-fill-surface'), quality);
  mkdirSync(outDir, { recursive: true });
  const { ensureTankBuilder, createTank } = await import('../src/vehicles/fleetFactory.ts');
  const { FLEET_GROUP_BY_ID } = await import('../src/vehicles/fleetManifest.ts');
  const { staticMergePartsOf } = await import('../src/vehicles/staticMergeParts.ts');
  const ids = flag('all') ? Object.keys(FLEET_GROUP_BY_ID).sort() : opt('ids', '').split(',').filter(Boolean);
  if (!ids.length) throw new Error('dump needs --all or --ids');
  const skipExisting = flag('resume');
  for (const id of ids) {
    if (skipExisting && existsSync(join(outDir, `${id}.json`))) continue;
    const started = performance.now();
    await ensureTankBuilder(id);
    // rosterState.ts buildRosterVisual: the player's desktop build is HIGH without detail LOD, a bot's is LOW with it
    const visual = createTank(id, null, {
      camoSeed: 4242, quality: 'high', geometryQuality: quality, batchStatic: true,
      battleDetailLod: quality === 'low', eraVisualBindingReceipt: false,
    });
    const root = visual.root;
    root.updateMatrixWorld(true);
    const meshes = []; const chunks = []; let triangles = 0, partTriangles = 0;
    const record = (path, object, geometry, extra) => {
      const { hashes, attributes } = triangleHashes(geometry);
      chunks.push(hashes);
      const row = { path, name: object.name || object.type, kind: extra.kind, tris: hashes.length / 2, attributes,
        index: geometry.index ? geometry.index.array.constructor.name : null, drawRange: [geometry.drawRange.start, geometry.drawRange.count],
        groups: geometry.groups.map((g) => [g.start, g.count, g.materialIndex]), ...extra.header };
      meshes.push(row); if (extra.kind === 'part') partTriangles += row.tris; else triangles += row.tris;
    };
    let ordinal = 0;
    root.traverse((object) => {
      const path = `${ordinal++}:${object.name || object.type}`;
      if (!object.geometry || !object.isMesh) return;
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(materialRow);
      const parts = staticMergePartsOf(object).map((part) => ({ name: part.name, first: (part.indexStart >= 0 ? part.indexStart : part.vertexStart) / 3,
        count: (part.indexStart >= 0 ? part.indexCount : part.vertexCount) / 3, layer: part.layer }));
      const header = {
        type: object.type, visible: object.visible, castShadow: !!object.castShadow, renderOrder: object.renderOrder,
        matrixWorld: object.matrixWorld.elements.map((v) => Math.fround(v)), materials, parts,
        fill: !!object.userData?.interiorFill || FILL_NAME.test(object.name || ''),
        instances: object.isInstancedMesh ? { count: object.count, matrices: hashArray(object.instanceMatrix?.array), colors: hashArray(object.instanceColor?.array) } : null,
        batched: object.isBatchedMesh ? { instanceCount: object.instanceCount } : null,
      };
      record(path, object, object.geometry, { kind: 'draw', header });
      staticMergePartsOf(object).forEach((part, k) => {
        record(`${path}#part${k}`, { name: part.name, type: 'StaticMergePart' }, part.geometry,
          { kind: 'part', header: { fill: FILL_NAME.test(part.name || '') || !!part.userData?.interiorFill, matrix: part.matrix.elements.map((v) => Math.fround(v)) } });
      });
    });
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Uint32Array(total); let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
    writeFileSync(join(outDir, `${id}.bin`), Buffer.from(all.buffer));
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify({ id, quality, triangles, partTriangles, meshes }));
    visual.dispose?.();
    console.log(`${id} ${quality}: ${meshes.length} geometries, ${triangles} draw + ${partTriangles} side-table triangles (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  }
}

/** Longest order-preserving match of `after` inside `before`; returns the removed indices or null when not a subsequence. */
function subsequenceRemoved(before, bOffset, bCount, after, aOffset, aCount) {
  const removed = []; let j = 0;
  for (let i = 0; i < bCount; i++) {
    const bi = 2 * (bOffset + i);
    if (j < aCount) {
      const aj = 2 * (aOffset + j);
      if (before[bi] === after[aj] && before[bi + 1] === after[aj + 1]) { j++; continue; }
    }
    removed.push(i);
  }
  return j === aCount ? removed : null;
}

async function compare() {
  const beforeDir = resolve(opt('before', '')), afterDir = resolve(opt('after', ''));
  const { interiorFillFaceCounts } = await import('../src/vehicles/interiorFills.ts');
  const { INTERIOR_FILL_GROUP_LOADERS } = await import('../src/vehicles/interiorFillLoaders.generated.ts');
  const records = {};
  for (const load of Object.values(INTERIOR_FILL_GROUP_LOADERS)) Object.assign(records, (await load()).INTERIOR_FILLS);
  const report = { qualities: {}, failures: [] };
  for (const quality of ['high', 'low']) {
    const bq = join(beforeDir, quality), aq = join(afterDir, quality);
    if (!existsSync(bq) || !existsSync(aq)) continue;
    const ids = readdirSync(bq).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).sort();
    const q = { tanks: 0, beforeTris: 0, afterTris: 0, removedDrawTris: 0, removedPartTris: 0, perTank: {} };
    for (const id of ids) {
      const fail = (message) => report.failures.push(`${id} ${quality}: ${message}`);
      if (!existsSync(join(aq, `${id}.json`))) { fail('no after dump'); continue; }
      const B = JSON.parse(readFileSync(join(bq, `${id}.json`), 'utf8')), A = JSON.parse(readFileSync(join(aq, `${id}.json`), 'utf8'));
      const bh = new Uint32Array(new Uint8Array(readFileSync(join(bq, `${id}.bin`))).buffer), ah = new Uint32Array(new Uint8Array(readFileSync(join(aq, `${id}.bin`))).buffer);
      q.tanks++; q.beforeTris += B.triangles; q.afterTris += A.triangles;
      if (B.meshes.length !== A.meshes.length) { fail(`geometry count ${B.meshes.length} -> ${A.meshes.length}`); continue; }
      let bo = 0, ao = 0, removedDraw = 0, removedPart = 0, removedFillSourced = 0, changedDraws = 0;
      const fillDraws = new Set();
      for (let m = 0; m < B.meshes.length; m++) {
        const bm = B.meshes[m], am = A.meshes[m];
        const { tris: bt, parts: bparts, ...bRest } = bm, { tris: at, parts: aparts, ...aRest } = am;
        if (JSON.stringify(bRest) !== JSON.stringify(aRest)) fail(`${bm.path}: header changed`);
        const removed = subsequenceRemoved(bh, bo, bt, ah, ao, at);
        if (!removed) fail(`${bm.path}: after triangles are not an order-preserving subset of before`);
        else if (removed.length) {
          changedDraws++;
          // every removed triangle must come from an interior-fill source (the side table's row, or the mesh itself)
          for (const t of removed) {
            const part = (bparts || []).find((p) => t >= p.first && t < p.first + p.count);
            const fromFill = part ? FILL_NAME.test(part.name) : bm.fill;
            if (fromFill) removedFillSourced++;
            if (part) fillDraws.add(`${bm.path}:${part.name}`); else fillDraws.add(bm.path);
          }
          if (bm.kind === 'part') removedPart += removed.length; else removedDraw += removed.length;
          // the side table must still describe the after draw: same rows, counts shrunk by what each row lost
          if (bparts?.length) {
            if (bparts.length !== aparts.length) fail(`${bm.path}: side-table rows ${bparts.length} -> ${aparts.length}`);
            else for (let k = 0; k < bparts.length; k++) {
              const lost = removed.filter((t) => t >= bparts[k].first && t < bparts[k].first + bparts[k].count).length;
              if (aparts[k].name !== bparts[k].name || aparts[k].count !== bparts[k].count - lost) fail(`${bm.path}: side-table row ${bparts[k].name} ${bparts[k].count} -> ${aparts[k].count} (lost ${lost})`);
            }
          }
        } else if (JSON.stringify(bparts) !== JSON.stringify(aparts)) fail(`${bm.path}: side table changed with no triangle removed`);
        bo += bt; ao += at;
      }
      const removedTotal = removedDraw + removedPart;
      if (removedFillSourced !== removedTotal) fail(`${removedTotal - removedFillSourced} removed triangles are not interior-fill triangles`);
      const expected = records[id] ? 2 * interiorFillFaceCounts(records[id]).internal : 0;
      if (removedDraw !== expected) fail(`removed ${removedDraw} drawn fill triangles, the records' internal faces predict ${expected}`);
      if (removedPart && removedPart !== expected) fail(`removed ${removedPart} side-table fill triangles, predicted ${expected}`);
      q.removedDrawTris += removedDraw; q.removedPartTris += removedPart;
      q.perTank[id] = { before: B.triangles, after: A.triangles, removedDraw, removedPart, predicted: expected, changedDraws };
    }
    report.qualities[quality] = q;
    console.log(`${quality}: ${q.tanks} tanks, drawn triangles ${q.beforeTris} -> ${q.afterTris}; removed ${q.removedDrawTris} drawn fill triangles`
      + ` (+${q.removedPartTris} in retained side-table sources)`);
  }
  const json = opt('json', '');
  if (json) { mkdirSync(resolve(json, '..'), { recursive: true }); writeFileSync(resolve(json), JSON.stringify(report, null, 1)); }
  if (report.failures.length) { console.log(`FAIL: ${report.failures.length}\n  ${report.failures.slice(0, 40).join('\n  ')}`); process.exit(1); }
  console.log('interior-fill surface compare: PASS');
}


async function raster() {
  const { internalFillFaces } = await import('../src/vehicles/interiorFillFaces.ts');
  const { interiorFillSpans } = await import('../src/vehicles/interiorFills.ts');
  const { INTERIOR_FILL_GROUP_LOADERS } = await import('../src/vehicles/interiorFillLoaders.generated.ts');
  const records = {};
  for (const load of Object.values(INTERIOR_FILL_GROUP_LOADERS)) Object.assign(records, (await load()).INTERIOR_FILLS);
  const ids = flag('all') ? Object.keys(records).sort() : opt('ids', '').split(',').filter(Boolean);
  if (!ids.length) throw new Error('raster needs --all or --ids');
  const DIRS = Number(opt('dirs', '96')), PX_PER_VOXEL = Number(opt('px-per-voxel', '3')), DENT_SETS = Number(opt('dents', '0'));
  const MAX_RES = 2048, TIE = 1e-6;
  // Fibonacci sphere: every direction class, below the hull included; a fixed irrational roll keeps pixel grids off
  // the lattice axes so the count is not an artefact of one alignment
  const dirs = [];
  for (let i = 0; i < DIRS; i++) {
    const y = 1 - (2 * (i + 0.5)) / DIRS, r = Math.sqrt(1 - y * y), phi = i * Math.PI * (3 - Math.sqrt(5));
    dirs.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }
  const CORNERS = [
    [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, -1], [1, 1, 1], [1, -1, 1]],
    [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, 1, -1], [-1, -1, -1]],
    [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [-1, 1, -1], [1, 1, 1], [1, 1, -1]],
    [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, -1], [1, -1, 1]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1]],
  ];
  // the destroyed state's dents (materials.ts CRUMPLE_NORMAL_GLSL, wreckDents.ts planDents radii and depths): each a
  // (1 - r^2/R^2)^2 * depth push toward the solid's middle, centred on its bounding box's surface; the gun is bent on
  // the CPU along its bore instead and is left undented here
  let seed = 0x5eed1e5;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const DENTS = { hull: [6, 0.6, 1.2, 0.13, 0.28], turret: [4, 0.4, 0.9, 0.1, 0.22] };
  function dentSet(component, lo, hi) {
    const plan = DENTS[component]; if (!plan) return null;
    const [count, rMin, rMax, dMin, dMax] = plan, mid = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2), dents = [];
    for (let k = 0; k < count; k++) {
      const c = [0, 1, 2].map((a) => lo[a] + random() * (hi[a] - lo[a]));
      const axis = Math.floor(random() * 3); c[axis] = random() < 0.5 ? lo[axis] : hi[axis];
      let dir = [0, 1, 2].map((a) => mid[a] - c[a]); const l = Math.hypot(...dir) || 1; dir = dir.map((q) => q / l);
      const r = rMin + (rMax - rMin) * random();
      dents.push({ c, dir, r2: r * r, depth: dMin + (dMax - dMin) * random() });
    }
    return dents;
  }
  const total = { tanks: 0, components: 0, views: 0, keptPx: 0, culledWins: 0, culledHoles: 0, ties: 0,
    dentViews: 0, dentKeptPx: 0, dentCulledWins: 0, dentCulledHoles: 0 };
  const perTank = {};
  for (const id of ids) {
    const record = records[id]; if (!record) continue;
    const row = { culledWins: 0, culledHoles: 0, ties: 0, keptPx: 0, dentKeptPx: 0, dentCulledWins: 0, dentCulledHoles: 0 };
    for (const component of ['hull', 'turret', 'gun']) {
      if (!record[component]) continue;
      const spans = interiorFillSpans(record, component);
      const boxes = spans.length / 6, mask = internalFillFaces(spans);
      // the pre-cull mesh, as float32 positions (the mesher's own arithmetic), with each triangle's fate
      const tris = boxes * 12, P = new Float32Array(tris * 9), culled = new Uint8Array(tris);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let b = 0, t = 0; b < boxes; b++) {
        const [x0, y0, z0, x1, y1, z1] = spans.subarray(6 * b, 6 * b + 6);
        const c = [record.o[0] + ((x0 + x1 + 1) / 2) * record.v, record.o[1] + ((y0 + y1 + 1) / 2) * record.v, record.o[2] + ((z0 + z1 + 1) / 2) * record.v];
        const sz = [(x1 - x0 + 1) * record.v, (y1 - y0 + 1) * record.v, (z1 - z0 + 1) * record.v];
        for (let f = 0; f < 6; f++) for (let half = 0; half < 2; half++, t++) {
          culled[t] = (mask[b] >> f) & 1;
          for (let k = 0; k < 3; k++) {
            const corner = CORNERS[f][3 * half + k];
            for (let a = 0; a < 3; a++) {
              const value = Math.fround(c[a] + corner[a] * sz[a] / 2); P[9 * t + 3 * k + a] = value;
              if (value < lo[a]) lo[a] = value; if (value > hi[a]) hi[a] = value;
            }
          }
        }
      }
      const centre = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
      const radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 + (DENT_SETS ? 0.3 : 0);
      const res = Math.min(MAX_RES, Math.ceil((2 * radius) / (record.v / PX_PER_VOXEL)) + 2), scale = res / (2 * radius);
      const zKeep = new Float64Array(res * res), zCut = new Float64Array(res * res);
      const Q = new Float64Array(tris * 9);
      const poses = [null];
      for (let k = 0; k < DENT_SETS; k++) { const dents = dentSet(component, lo, hi); if (dents) poses.push(dents); }
      for (const dents of poses) {
        for (let i = 0; i < Q.length; i += 3) {
          let x = P[i], y = P[i + 1], z = P[i + 2];
          if (dents) {
            let dx = 0, dy = 0, dz = 0;
            for (const dent of dents) {
              const ex = x - dent.c[0], ey = y - dent.c[1], ez = z - dent.c[2], r2 = ex * ex + ey * ey + ez * ez;
              if (r2 >= dent.r2) continue;
              const q = 1 - r2 / dent.r2, w = q * q * dent.depth;
              dx += dent.dir[0] * w; dy += dent.dir[1] * w; dz += dent.dir[2] * w;
            }
            x += dx; y += dy; z += dz;
          }
          Q[i] = x - centre[0]; Q[i + 1] = y - centre[1]; Q[i + 2] = z - centre[2];
        }
        for (const d of dirs) {
          const up0 = Math.abs(d[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
          let right = [up0[1] * d[2] - up0[2] * d[1], up0[2] * d[0] - up0[0] * d[2], up0[0] * d[1] - up0[1] * d[0]];
          const rl = Math.hypot(...right); right = right.map((q) => q / rl);
          let up = [d[1] * right[2] - d[2] * right[1], d[2] * right[0] - d[0] * right[2], d[0] * right[1] - d[1] * right[0]];
          const roll = 0.6180339887, cr = Math.cos(roll), sr = Math.sin(roll);
          [right, up] = [right.map((q, i) => cr * q + sr * up[i]), up.map((q, i) => -sr * right[i] + cr * q)];
          zKeep.fill(Infinity); zCut.fill(Infinity);
          const X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0];
          for (let t = 0; t < tris; t++) {
            const q = 9 * t;
            // back faces (and edge-on ones) are culled before the depth test, by the posed triangle's own winding
            const ax = Q[q + 3] - Q[q], ay = Q[q + 4] - Q[q + 1], az = Q[q + 5] - Q[q + 2];
            const bx = Q[q + 6] - Q[q], by = Q[q + 7] - Q[q + 1], bz = Q[q + 8] - Q[q + 2];
            if ((ay * bz - az * by) * d[0] + (az * bx - ax * bz) * d[1] + (ax * by - ay * bx) * d[2] >= 0) continue;
            for (let k = 0; k < 3; k++) {
              const px = Q[q + 3 * k], py = Q[q + 3 * k + 1], pz = Q[q + 3 * k + 2];
              X[k] = (px * right[0] + py * right[1] + pz * right[2]) * scale + res / 2;
              Y[k] = (px * up[0] + py * up[1] + pz * up[2]) * scale + res / 2;
              Z[k] = px * d[0] + py * d[1] + pz * d[2];
            }
            const area = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]);
            if (Math.abs(area) < 1e-12) continue;
            const inv = 1 / area, buffer = culled[t] ? zCut : zKeep;
            const minX = Math.max(0, Math.floor(Math.min(X[0], X[1], X[2]))), maxX = Math.min(res - 1, Math.ceil(Math.max(X[0], X[1], X[2])));
            const minY = Math.max(0, Math.floor(Math.min(Y[0], Y[1], Y[2]))), maxY = Math.min(res - 1, Math.ceil(Math.max(Y[0], Y[1], Y[2])));
            for (let py = minY; py <= maxY; py++) {
              const sy = py + 0.5;
              for (let px = minX; px <= maxX; px++) {
                const sx = px + 0.5;
                const w0 = ((X[1] - sx) * (Y[2] - sy) - (X[2] - sx) * (Y[1] - sy)) * inv; if (w0 < 0) continue;
                const w1 = ((X[2] - sx) * (Y[0] - sy) - (X[0] - sx) * (Y[2] - sy)) * inv; if (w1 < 0) continue;
                const w2 = 1 - w0 - w1; if (w2 < 0) continue;
                const depth = w0 * Z[0] + w1 * Z[1] + w2 * Z[2], p = py * res + px;
                if (depth < buffer[p]) buffer[p] = depth;
              }
            }
          }
          let kept = 0, wins = 0, holes = 0, ties = 0;
          for (let p = 0; p < res * res; p++) {
            const keep = zKeep[p], cut = zCut[p];
            if (keep !== Infinity) kept++;
            if (cut === Infinity) continue;
            if (keep === Infinity) holes++;
            else if (cut < keep - TIE) wins++;
            else if (cut <= keep + TIE) ties++;
          }
          if (dents) { row.dentKeptPx += kept; row.dentCulledWins += wins; row.dentCulledHoles += holes; total.dentViews++; }
          else { row.keptPx += kept; row.culledWins += wins; row.culledHoles += holes; row.ties += ties; total.views++; }
        }
      }
      total.components++;
    }
    total.tanks++;
    for (const k of ['culledWins', 'culledHoles', 'ties', 'keptPx', 'dentKeptPx', 'dentCulledWins', 'dentCulledHoles']) total[k] += row[k];
    perTank[id] = row;
    if (row.culledWins || row.culledHoles || row.ties || row.dentCulledWins || row.dentCulledHoles) {
      console.log(`${id}: rest: culled faces nearest at ${row.culledWins} px, sole cover at ${row.culledHoles} px, tie ${row.ties} px`
        + (DENT_SETS ? `; dented: nearest at ${row.dentCulledWins} px, sole cover at ${row.dentCulledHoles} px of ${row.dentKeptPx}` : ''));
    }
  }
  console.log(`raster: ${total.tanks} tanks, ${total.components} components; at rest ${total.views} views, ${total.keptPx} drawn fill px: `
    + `culled faces nearest at ${total.culledWins} px, sole cover at ${total.culledHoles} px, depth ties ${total.ties} px`
    + (DENT_SETS ? `; dented (${DENT_SETS} dent sets) ${total.dentViews} views, ${total.dentKeptPx} drawn fill px: culled faces nearest at `
      + `${total.dentCulledWins} px (${(1e6 * total.dentCulledWins / Math.max(1, total.dentKeptPx)).toFixed(1)} ppm), sole cover at ${total.dentCulledHoles} px `
      + `(${(1e6 * total.dentCulledHoles / Math.max(1, total.dentKeptPx)).toFixed(1)} ppm)` : ''));
  const json = opt('json', '');
  if (json) { mkdirSync(resolve(json, '..'), { recursive: true }); writeFileSync(resolve(json), JSON.stringify({ dirs: DIRS, pxPerVoxel: PX_PER_VOXEL, dentSets: DENT_SETS, total, perTank }, null, 1)); }
  // the gate is the rest pose (every live pose: each component is rigid); dented wrecks are reported, not gated
  if (total.culledWins || total.culledHoles) { console.log('interior-fill raster: FAIL'); process.exit(1); }
  console.log('interior-fill raster: PASS');
}

if (mode === 'dump') await dump();
else if (mode === 'compare') await compare();
else if (mode === 'raster') await raster();
else { console.log('usage: interior-fill-surface-compare.mjs dump|compare|raster ...'); process.exit(2); }
