#!/usr/bin/env node
// tools/interior-fill-surface-compare.mjs — the before/after proof for the interior-fill boundary surface (tank-opt
// HIDDEN, 2026-10-16; owner 2026-10-15: "inside the tanks where we cant see, we dont have unneeded geometry").
//
//   node tools/interior-fill-surface-compare.mjs dump --all|--ids=a,b --quality=high|low --out=<dir> [--geometry-only]
//   node tools/interior-fill-surface-compare.mjs compare --before=<dir> --after=<dir> [--only=high,low] [--exact] [--json=<path>]
//   node tools/interior-fill-surface-compare.mjs raster --all|--ids=a,b [--dirs=96] [--px-per-voxel=3] [--snap=256] [--json=<path>]
//
// `dump` builds every requested tank exactly as the battle roster does (fleetFactory createTank after
// ensureTankBuilder, batchStatic, eraVisualBindingReceipt off; HIGH is the player's build with battleDetailLod off,
// LOW the bot's build with battleDetailLod on; --geometry-only builds as a map hulk's bake does, world/wrecks.ts) and
// writes, per tank, every mesh in the visual's graph (visible or not, every LOD level, every static-merge side-table
// source geometry) as a header row plus one 64-bit hash per triangle, in draw order. A triangle's hash covers the raw
// bytes of every vertex attribute of its three corners (position, normal, uv, colour, ...), so two hashes are equal
// only when the triangle is bit-identical. Mesh headers carry the name, materials (type, side, transparency, depth
// flags), world matrix, draw range, groups, instance data and the side-table rows (source name and triangle range).
//
// `compare` checks, tank by tank, that only the fills changed: the same meshes in the same order with the same
// materials, matrices and instances; every triangle that is not an interior fill's (by the mesh's name, or the merged
// draw's own side-table row) bit-identical and in order; and every fill (a `<component>InteriorFill` mesh, side-table
// row or retained source) carrying exactly the triangles the records predict (interiorFills.ts
// interiorFillTriangleCounts: the boundary surface, or the closed boxes where those are fewer). With --exact the fills
// must be unchanged too (a geometry-only dump: a map hulk keeps the closed boxes). Run it with the dump of the commit
// before as --before and the change's dump as --after.
//
// `raster` is the pixel check that the surface is the closed boxes' outer surface, with no build and no baseline: every
// component's fill is meshed both ways (the closed boxes, and the mesh applyInteriorFills draws) with nothing else in
// front, and rasterised orthographically from --dirs directions over the whole sphere (from below too; an orthographic
// view along d holds every ray along d, so it covers every perspective camera, pose and turret-off tumble) at
// --px-per-voxel pixels per fill voxel, back faces culled as the FrontSide fill material culls them, edges inclusive.
// The gate: no pixel where the drawn mesh's nearest surface is deeper or nearer than the closed boxes' by more than a
// micron, covers what they do not or misses what they cover (sub-micron depth ties, and pixel centres within 1e-4 px of
// an outline, where the two meshes' few-ulp vertex rounding decides, are counted apart). Each
// component is rigid, so with other geometry only adding occluders this is every live pose. --snap=<n> also rasterises
// both with vertices snapped to 1/n pixel and the top-left fill rule (the GPU's: n = 256), front faces counting +1 and
// back faces -1 per pixel: a closed surface sums to zero at every pixel (each ray in leaves again), and a crack, where a
// ray gets in without crossing a front face, does not. Gated for the drawn surface; reported for the closed boxes.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
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
  const geometryOnly = flag('geometry-only');
  const outDir = resolve(opt('out', '.qa-dev/out/interior-fill-surface'), geometryOnly ? `${quality}-geometry-only` : quality);
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
    // rosterState.ts buildRosterVisual: the player's desktop build is HIGH without detail LOD, a bot's is LOW with it;
    // world/wrecks.ts bakeTankWreck's hulk build is geometry-only and procedural
    const visual = createTank(id, null, geometryOnly
      ? { camoSeed: 4242, quality: 'low', geometryQuality: quality, materialMode: 'geometry-only', eraVisualBindingReceipt: false, proceduralOnly: true }
      : { camoSeed: 4242, quality: 'high', geometryQuality: quality, batchStatic: true, battleDetailLod: quality === 'low', eraVisualBindingReceipt: false });
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
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify({ id, quality, geometryOnly, triangles, partTriangles, meshes }));
    visual.dispose?.();
    console.log(`${id} ${quality}${geometryOnly ? ' geometry-only' : ''}: ${meshes.length} geometries, ${triangles} draw + ${partTriangles} side-table triangles (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  }
}

const sameHashes = (a, aOffset, b, bOffset, count) => {
  for (let i = 0; i < 2 * count; i++) if (a[2 * aOffset + i] !== b[2 * bOffset + i]) return false;
  return true;
};
const fillComponent = (name) => FILL_NAME.test(name || '') ? name.replace(FILL_NAME, '') : null;

async function compare() {
  const beforeDir = resolve(opt('before', '')), afterDir = resolve(opt('after', ''));
  const exact = flag('exact');
  const { interiorFillTriangleCounts } = await import('../src/vehicles/interiorFills.ts');
  const { INTERIOR_FILL_GROUP_LOADERS } = await import('../src/vehicles/interiorFillLoaders.generated.ts');
  const records = {};
  for (const load of Object.values(INTERIOR_FILL_GROUP_LOADERS)) Object.assign(records, (await load()).INTERIOR_FILLS);
  const report = { qualities: {}, failures: [] };
  const only = opt('only', '').split(',').filter(Boolean);
  const dumps = readdirSync(beforeDir).filter((name) => statSync(join(beforeDir, name)).isDirectory() && existsSync(join(afterDir, name))
    && readdirSync(join(beforeDir, name)).some((file) => file.endsWith('.json')) && (!only.length || only.includes(name)));
  for (const quality of dumps) {
    const bq = join(beforeDir, quality), aq = join(afterDir, quality);
    const ids = readdirSync(bq).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).sort();
    const q = { tanks: 0, beforeTris: 0, afterTris: 0, fillBefore: 0, fillAfter: 0, perTank: {} };
    for (const id of ids) {
      const fail = (message) => report.failures.push(`${id} ${quality}: ${message}`);
      if (!existsSync(join(aq, `${id}.json`))) { fail('no after dump'); continue; }
      const B = JSON.parse(readFileSync(join(bq, `${id}.json`), 'utf8')), A = JSON.parse(readFileSync(join(aq, `${id}.json`), 'utf8'));
      const bh = new Uint32Array(new Uint8Array(readFileSync(join(bq, `${id}.bin`))).buffer), ah = new Uint32Array(new Uint8Array(readFileSync(join(aq, `${id}.bin`))).buffer);
      q.tanks++; q.beforeTris += B.triangles; q.afterTris += A.triangles;
      if (B.meshes.length !== A.meshes.length) { fail(`geometry count ${B.meshes.length} -> ${A.meshes.length}`); continue; }
      const predicted = (component) => (records[id] ? interiorFillTriangleCounts(records[id], component).drawn : 0);
      let bo = 0, ao = 0, fillBefore = 0, fillAfter = 0;
      for (let m = 0; m < B.meshes.length; m++) {
        const bm = B.meshes[m], am = A.meshes[m];
        const { tris: bt, parts: bparts, drawRange: bRange, groups: bGroups, ...bRest } = bm;
        const { tris: at, parts: aparts, drawRange: aRange, groups: aGroups, ...aRest } = am;
        if (JSON.stringify(bRest) !== JSON.stringify(aRest)) fail(`${bm.path}: header changed`);
        // the mesh as runs: its side-table rows in order (a fill row may change, any other must not), or the whole mesh
        const runs = bparts?.length ? bparts.map((row, k) => ({ b: row, a: aparts?.[k] })) : [{ b: { name: bm.name, first: 0, count: bt }, a: { name: am.name, first: 0, count: at } }];
        if (bparts?.length && (aparts?.length !== bparts.length)) { fail(`${bm.path}: side-table rows ${bparts.length} -> ${aparts?.length}`); bo += bt; ao += at; continue; }
        let covered = 0;
        for (const { b, a } of runs) {
          if (a.name !== b.name) { fail(`${bm.path}: side-table row ${b.name} -> ${a.name}`); continue; }
          covered += b.count;
          const component = fillComponent(b.name) ?? (bm.fill && !bparts?.length ? fillComponent(bm.name) ?? 'fill' : null);
          if (component && !exact) {
            const want = component === 'fill' ? null : predicted(component);
            if (want !== null && a.count !== want) fail(`${bm.path}: ${b.name} carries ${a.count} triangles, the records predict ${want}`);
            if (bm.kind !== 'part') { fillBefore += b.count; fillAfter += a.count; }
            continue;
          }
          if (a.count !== b.count || !sameHashes(bh, bo + b.first, ah, ao + a.first, b.count)) fail(`${bm.path}: ${b.name} changed`);
        }
        if (bparts?.length && covered !== bt) {
          // triangles outside every row: they must be unchanged and the rows must leave them where they were
          if (at - aparts.reduce((n, r) => n + r.count, 0) !== bt - covered) fail(`${bm.path}: triangles outside the side table changed`);
        }
        if (!bm.fill && !bparts?.some((row) => fillComponent(row.name)) && (JSON.stringify(bRange) !== JSON.stringify(aRange) || JSON.stringify(bGroups) !== JSON.stringify(aGroups))) {
          fail(`${bm.path}: draw range or groups changed`);
        }
        bo += bt; ao += at;
      }
      q.fillBefore += fillBefore; q.fillAfter += fillAfter;
      q.perTank[id] = { before: B.triangles, after: A.triangles, fillBefore, fillAfter };
    }
    report.qualities[quality] = q;
    console.log(`${quality}: ${q.tanks} tanks, drawn triangles ${q.beforeTris} -> ${q.afterTris}; fill triangles ${q.fillBefore} -> ${q.fillAfter}`);
  }
  const json = opt('json', '');
  if (json) { mkdirSync(resolve(json, '..'), { recursive: true }); writeFileSync(resolve(json), JSON.stringify(report, null, 1)); }
  if (report.failures.length) { console.log(`FAIL: ${report.failures.length}\n  ${report.failures.slice(0, 40).join('\n  ')}`); process.exit(1); }
  console.log('interior-fill surface compare: PASS');
}

async function raster() {
  const THREE = await import('three');
  const { applyInteriorFills } = await import('../src/vehicles/interiorFills.ts');
  const { INTERIOR_FILL_GROUP_LOADERS } = await import('../src/vehicles/interiorFillLoaders.generated.ts');
  const records = {};
  for (const load of Object.values(INTERIOR_FILL_GROUP_LOADERS)) Object.assign(records, (await load()).INTERIOR_FILLS);
  const ids = flag('all') ? Object.keys(records).sort() : opt('ids', '').split(',').filter(Boolean);
  if (!ids.length) throw new Error('raster needs --all or --ids');
  const DIRS = Number(opt('dirs', '96')), PX_PER_VOXEL = Number(opt('px-per-voxel', '3')), SNAP = Number(opt('snap', '0'));
  const MAX_RES = 2048, TIE = 1e-6, EDGE_SLACK = 1e-4;
  // Fibonacci sphere: every direction class, below the hull included; a fixed irrational roll keeps pixel grids off
  // the lattice axes so the count is not an artefact of one alignment
  const dirs = [];
  for (let i = 0; i < DIRS; i++) {
    const y = 1 - (2 * (i + 0.5)) / DIRS, r = Math.sqrt(1 - y * y), phi = i * Math.PI * (3 - Math.sqrt(5));
    dirs.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }
  /**
   * Rasterise a triangle soup along d. Exact (snap 0): the nearest front-facing depth per pixel into `depth`, edges
   * inclusive. Snapped: vertices on a 1/snap pixel grid, the top-left rule, front faces +1 and back faces -1 into
   * `parity` (every quantity is then an exact multiple of 1/snap, so a shared edge is owned exactly once).
   */
  function rasterise(P, d, right, up, res, scale, depth, parity, snap, slack = 0) {
    if (depth) depth.fill(Infinity);
    if (parity) parity.fill(0);
    const X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0];
    for (let t = 0, n = P.length / 9; t < n; t++) {
      const q = 9 * t;
      const ax = P[q + 3] - P[q], ay = P[q + 4] - P[q + 1], az = P[q + 5] - P[q + 2];
      const bx = P[q + 6] - P[q], by = P[q + 7] - P[q + 1], bz = P[q + 8] - P[q + 2];
      // (right x up = d, so a face toward the viewer winds clockwise on this screen)
      if (!snap && (ay * bz - az * by) * d[0] + (az * bx - ax * bz) * d[1] + (ax * by - ay * bx) * d[2] >= 0) continue;
      for (let k = 0; k < 3; k++) {
        const px = P[q + 3 * k], py = P[q + 3 * k + 1], pz = P[q + 3 * k + 2];
        X[k] = (px * right[0] + py * right[1] + pz * right[2]) * scale + res / 2;
        Y[k] = (px * up[0] + py * up[1] + pz * up[2]) * scale + res / 2;
        Z[k] = px * d[0] + py * d[1] + pz * d[2];
        if (snap) { X[k] = Math.round(X[k] * snap) / snap; Y[k] = Math.round(Y[k] * snap) / snap; }
      }
      let area = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]);
      if (area === 0) continue;
      // front or back by the winding on the (snapped) screen, as the GPU decides it
      const sign = area < 0 ? 1 : -1;
      // counter-clockwise on screen for the scan (a back face and its front neighbour then fold onto the same side of
      // their shared edge, with the same direction, so they own it alike)
      if (area < 0) { [X[1], X[2]] = [X[2], X[1]]; [Y[1], Y[2]] = [Y[2], Y[1]]; [Z[1], Z[2]] = [Z[2], Z[1]]; area = -area; }
      const inv = 1 / area;
      const own = (xa, ya, xb, yb) => (yb - ya) > 0 || ((yb - ya) === 0 && (xb - xa) < 0);
      const own0 = own(X[1], Y[1], X[2], Y[2]), own1 = own(X[2], Y[2], X[0], Y[0]), own2 = own(X[0], Y[0], X[1], Y[1]);
      const len0 = Math.hypot(X[2] - X[1], Y[2] - Y[1]), len1 = Math.hypot(X[0] - X[2], Y[0] - Y[2]), len2 = Math.hypot(X[1] - X[0], Y[1] - Y[0]);
      const minX = Math.max(0, Math.floor(Math.min(X[0], X[1], X[2]))), maxX = Math.min(res - 1, Math.ceil(Math.max(X[0], X[1], X[2])));
      const minY = Math.max(0, Math.floor(Math.min(Y[0], Y[1], Y[2]))), maxY = Math.min(res - 1, Math.ceil(Math.max(Y[0], Y[1], Y[2])));
      for (let py = minY; py <= maxY; py++) {
        const sy = py + 0.5;
        for (let px = minX; px <= maxX; px++) {
          const sx = px + 0.5;
          const e0 = (X[2] - X[1]) * (sy - Y[1]) - (Y[2] - Y[1]) * (sx - X[1]);
          const e1 = (X[0] - X[2]) * (sy - Y[2]) - (Y[0] - Y[2]) * (sx - X[2]);
          const e2 = (X[1] - X[0]) * (sy - Y[0]) - (Y[1] - Y[0]) * (sx - X[0]);
          // `slack` (px) widens every edge: the coverage a mesh would have if its vertices moved by rounding alone
          if (slack ? (e0 < -slack * len0 || e1 < -slack * len1 || e2 < -slack * len2) : (e0 < 0 || e1 < 0 || e2 < 0)) continue;
          const p = py * res + px;
          if (snap) { if ((e0 === 0 && !own0) || (e1 === 0 && !own1) || (e2 === 0 && !own2)) continue; parity[p] += sign; continue; }
          const z = (e0 * Z[0] + e1 * Z[1] + e2 * Z[2]) * inv;
          if (z < depth[p]) depth[p] = z;
        }
      }
    }
  }
  const material = new THREE.MeshBasicMaterial();
  const total = { tanks: 0, components: 0, views: 0, closedPx: 0, deeper: 0, nearer: 0, missing: 0, extra: 0, ties: 0, parityClosed: 0, parityDrawn: 0 };
  const perTank = {};
  for (const id of ids) {
    const record = records[id]; if (!record) continue;
    const row = { deeper: 0, nearer: 0, missing: 0, extra: 0, ties: 0, closedPx: 0, parityClosed: 0, parityDrawn: 0 };
    // the two meshes, as applyInteriorFills attaches them on rigs at the origin (the mesh frame is the tank frame)
    const meshes = {};
    const disposables = [];
    for (const closed of [true, false]) {
      const rigs = { hull: new THREE.Group(), turret: new THREE.Group(), gun: new THREE.Group() };
      applyInteriorFills({ specId: id, hullG: rigs.hull, turretG: rigs.turret, gunG: rigs.gun, material, disposables, record, closed });
      for (const component of ['hull', 'turret', 'gun']) {
        const mesh = rigs[component].children.find((child) => child.name === `${component}InteriorFill`);
        if (mesh) meshes[`${component}:${closed ? 'closed' : 'drawn'}`] = mesh.geometry.getAttribute('position').array;
      }
    }
    for (const component of ['hull', 'turret', 'gun']) {
      const C = meshes[`${component}:closed`], D = meshes[`${component}:drawn`];
      if (!C || !D) continue;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < C.length; i++) { const a = i % 3; if (C[i] < lo[a]) lo[a] = C[i]; if (C[i] > hi[a]) hi[a] = C[i]; }
      const centre = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
      const radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
      const res = Math.min(MAX_RES, Math.ceil((2 * radius) / (record.v / PX_PER_VOXEL)) + 2), scale = res / (2 * radius);
      const centred = (P) => { const Q = new Float64Array(P.length); for (let i = 0; i < P.length; i++) Q[i] = P[i] - centre[i % 3]; return Q; };
      const PC = centred(C), PD = centred(D);
      const zC = new Float64Array(res * res), zD = new Float64Array(res * res), parity = SNAP ? new Int32Array(res * res) : null;
      let zLoose = null;
      for (const d of dirs) {
        const up0 = Math.abs(d[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
        let right = [up0[1] * d[2] - up0[2] * d[1], up0[2] * d[0] - up0[0] * d[2], up0[0] * d[1] - up0[1] * d[0]];
        const rl = Math.hypot(...right); right = right.map((q) => q / rl);
        let up = [d[1] * right[2] - d[2] * right[1], d[2] * right[0] - d[0] * right[2], d[0] * right[1] - d[1] * right[0]];
        const roll = 0.6180339887, cr = Math.cos(roll), sr = Math.sin(roll);
        [right, up] = [right.map((q, i) => cr * q + sr * up[i]), up.map((q, i) => -sr * right[i] + cr * q)];
        rasterise(PC, d, right, up, res, scale, zC, null, 0);
        rasterise(PD, d, right, up, res, scale, zD, null, 0);
        // A pixel centre within rounding of an outline (the surface's vertices are origin + index · voxel, the boxes'
        // centre ± half a size: the same lattice points to a few ulps) may be in one mesh and not the other: such a
        // pixel is checked again against the other mesh with its edges widened by EDGE_SLACK px, and counted as a tie.
        let looseFor = null;
        const coverTie = (P, p) => {
          zLoose ??= new Float64Array(res * res);
          if (looseFor !== P) { rasterise(P, d, right, up, res, scale, zLoose, null, 0, EDGE_SLACK); looseFor = P; }
          return zLoose[p] !== Infinity;
        };
        for (let p = 0; p < res * res; p++) {
          const c = zC[p], k = zD[p];
          if (c !== Infinity) row.closedPx++;
          if (c === Infinity) { if (k !== Infinity) { if (coverTie(PC, p)) row.ties++; else row.extra++; } continue; }
          if (k === Infinity) { if (coverTie(PD, p)) row.ties++; else row.missing++; }
          else if (k > c + TIE) row.deeper++;
          else if (k < c - TIE) row.nearer++;
          else if (k !== c) row.ties++;
        }
        if (SNAP) for (const [key, P] of [['parityClosed', PC], ['parityDrawn', PD]]) {
          // a closed surface: every ray in through a front face leaves through a back face, so the two counts match at
          // every pixel; a crack lets a ray in without a front face
          rasterise(P, d, right, up, res, scale, null, parity, SNAP);
          for (let p = 0; p < res * res; p++) if (parity[p] !== 0) row[key]++;
        }
        total.views++;
      }
      total.components++;
    }
    for (const resource of disposables) resource.dispose();
    total.tanks++;
    for (const k of Object.keys(row)) total[k] += row[k];
    perTank[id] = row;
    if (row.deeper || row.nearer || row.missing || row.extra || row.parityDrawn) {
      console.log(`${id}: drawn deeper ${row.deeper}, nearer ${row.nearer}, missing ${row.missing}, extra ${row.extra} px; snapped parity breaks ${row.parityDrawn} px`);
    }
  }
  console.log(`raster: ${total.tanks} tanks, ${total.components} components, ${total.views} views, ${total.closedPx} closed-box fill px: `
    + `drawn surface deeper at ${total.deeper} px, nearer at ${total.nearer}, missing at ${total.missing}, extra at ${total.extra} (ties: sub-micron depth or within ${EDGE_SLACK} px of an outline, ${total.ties})`
    + (SNAP ? `; snapped to 1/${SNAP} px, top-left rule: front and back coverings differ at ${total.parityDrawn} px of the drawn surface, `
      + `${total.parityClosed} of the closed boxes` : ''));
  const json = opt('json', '');
  if (json) { mkdirSync(resolve(json, '..'), { recursive: true }); writeFileSync(resolve(json), JSON.stringify({ dirs: DIRS, pxPerVoxel: PX_PER_VOXEL, snap: SNAP, total, perTank }, null, 1)); }
  if (total.deeper || total.nearer || total.missing || total.extra || total.parityDrawn) { console.log('interior-fill raster: FAIL'); process.exit(1); }
  console.log('interior-fill raster: PASS');
}

if (mode === 'dump') await dump();
else if (mode === 'compare') await compare();
else if (mode === 'raster') await raster();
else { console.log('usage: interior-fill-surface-compare.mjs dump|compare|raster ...'); process.exit(2); }
