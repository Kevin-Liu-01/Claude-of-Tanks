#!/usr/bin/env node
// "Sealed" check: can a player look INTO a tank?
//
//   node tools/tank-sealed-check.mjs --ids=abramsx,m2a2_bradley [--images] [--res=256] [--out=dir] [--json=path]
//   node tools/tank-sealed-check.mjs --all [--gate]
//
// Every playable tank is built first-party (createTank, proceduralOnly) and
// software-rasterised orthographically from 42 exterior directions (cube
// faces, edges and corners plus low 12° and 30° chase-camera rings). For each
// pixel the nearest OPAQUE triangle decides: a front-facing surface is sealed;
// a back-facing surface means the player sees the inside of a wall through a
// gap (a hole). Pixels covered only by transparent or alpha-cut surfaces
// (glass, grilles, nets) with no opaque surface behind them are see-through:
// the player sees the world through the tank. Clusters of such pixels are
// reported with the meshes involved so the owning builder can be fixed.
// --images writes a PNG per offending view (grey front faces, red holes,
// magenta see-through). --gate exits non-zero when any tank has a hole or
// see-through cluster at or above --min-area (default 6 px at 256 px over
// the bounding sphere, roughly a 15 cm gap on a main battle tank).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createCanvas, Path2D as NapiPath2D, ImageData as NapiImageData, Image as NapiImage } from '@napi-rs/canvas';

// Builders paint their canvas textures (ghillie nets, markings, kit fabrics)
// through document.createElement('canvas'); without a document they fall back
// to flat single-sided defaults that do not match the browser. Give node a
// 2D canvas so materials (alphaTest, DoubleSide) are set exactly as shipped.
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = NapiPath2D;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = NapiImageData;
if (typeof globalThis.Image === 'undefined') globalThis.Image = NapiImage;
if (typeof globalThis.document === 'undefined') {
  const makeCanvas = () => createCanvas(1, 1);
  globalThis.document = {
    createElement(tag) { return String(tag).toLowerCase() === 'canvas' ? makeCanvas() : { style: {}, setAttribute() {}, appendChild() {} }; },
    createElementNS(_ns, tag) { return this.createElement(tag); },
    body: { appendChild() {}, removeChild() {} },
  };
}

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const RES = Number(opt('res', '256'));
const MIN_AREA = Number(opt('min-area', '6'));
const outDir = resolve(opt('out', '.qa-dev/out/sealed'));
const writeImages = flag('images');

// --ledger=path gates each tank against the committed census: a sealed tank must stay sealed, and no tank may add
// more than max(12 px, 10 %) of true openings over its ledger row. --update-ledger rewrites the rows for the checked ids.
const ledgerPath = opt('ledger', '');
const ledger = ledgerPath ? JSON.parse(readFileSync(resolve(ledgerPath), 'utf8')) : null;
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
const ids = flag('all') ? [...ALL_TANK_IDS] : opt('ids', 'abramsx').split(',').filter(Boolean);
if (writeImages) mkdirSync(outDir, { recursive: true });

function viewDirections() {
  const dirs = [];
  const push = (x, y, z, name) => { const l = Math.hypot(x, y, z); dirs.push({ d: new THREE.Vector3(x / l, y / l, z / l), name }); };
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (!x && !y && !z) continue;
    if (y > 0) continue; // views looking upward from below the ground are not player views
    push(x, y, z, `cube_${x}_${y}_${z}`);
  }
  for (const elevDeg of [12, 30]) {
    for (let k = 0; k < 8; k++) {
      const az = (k / 8) * Math.PI * 2, el = elevDeg * Math.PI / 180;
      // direction the camera LOOKS along: from a raised ring toward the tank
      push(-Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el), `ring${elevDeg}_${k}`);
    }
  }
  return dirs;
}
const VIEWS = viewDirections();

function materialClass(material, decal = false) {
  if (!material || material.visible === false || material.colorWrite === false) return null;
  if (decal) return { transparent: true, side: THREE.DoubleSide };
  const transparent = (material.transparent && material.opacity < 0.98) || material.alphaTest > 0 || !!material.alphaMap
    || material.depthWrite === false;
  return { transparent, side: material.side ?? THREE.FrontSide };
}

/** Flatten the visible tank into world-space triangles with per-triangle class and owner. */
function collectTriangles(root) {
  root.updateMatrixWorld(true);
  const tris = []; // {a,b,c (Vector3), cls, mesh}
  const meshes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const m = new THREE.Matrix4();
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry; const pos = geo.getAttribute('position'); if (!pos) return;
    const index = geo.index ? geo.index.array : null;
    const triCount = index ? index.length / 3 : pos.count / 3;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    const groups = Array.isArray(o.material) && geo.groups.length ? geo.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    const meshIndex = meshes.length; meshes.push(o.name || o.type);
    const decal = /^vehicleMarking_/.test(o.name || ''); // 2D markings/soot are decals, never hull surfaces
    if (o.isBatchedMesh) {
      // BatchedMesh: each instance draws one geometry range of the shared buffer through its own matrix
      const cls = materialClass(materials[0], decal); if (!cls) return;
      const range = {}; const im = new THREE.Matrix4();
      for (let i = 0; i < o.instanceCount; i++) {
        if (o.getVisibleAt && !o.getVisibleAt(i)) continue;
        const gid = o.getGeometryIdAt(i); if (gid < 0) continue;
        o.getGeometryRangeAt(gid, range); o.getMatrixAt(i, im); const world = im.clone().premultiply(o.matrixWorld); const flip = world.determinant() < 0;
        for (let k = range.start; k + 2 < range.start + range.count; k += 3) {
          const i0 = index ? index[k] : k, i1 = index ? index[k + 1] : k + 1, i2 = index ? index[k + 2] : k + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(world); b.fromBufferAttribute(pos, i1).applyMatrix4(world); c.fromBufferAttribute(pos, i2).applyMatrix4(world);
          tris.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, cx: c.x, cy: c.y, cz: c.z, transparent: cls.transparent, side: cls.side, mesh: meshIndex, flip });
        }
      }
      return;
    }
    const instanceMatrices = [];
    if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { const im = new THREE.Matrix4(); o.getMatrixAt(i, im); instanceMatrices.push(im.premultiply(o.matrixWorld)); } }
    else instanceMatrices.push(o.matrixWorld);
    for (const group of groups) {
      const cls = materialClass(materials[group.materialIndex] ?? materials[0], decal); if (!cls) continue;
      const startTri = Math.floor(group.start / 3), endTri = Math.min(triCount, Math.floor((group.start + group.count) / 3));
      for (const world of instanceMatrices) {
        const flip = world.determinant() < 0;
        for (let t = startTri; t < endTri; t++) {
          const i0 = index ? index[t * 3] : t * 3, i1 = index ? index[t * 3 + 1] : t * 3 + 1, i2 = index ? index[t * 3 + 2] : t * 3 + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(world);
          b.fromBufferAttribute(pos, i1).applyMatrix4(world);
          c.fromBufferAttribute(pos, i2).applyMatrix4(world);
          tris.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, cx: c.x, cy: c.y, cz: c.z, transparent: cls.transparent, side: cls.side, mesh: meshIndex, flip });
        }
      }
    }
  });
  return { tris, meshes };
}

function boundingSphere(tris) {
  const box = new THREE.Box3();
  for (const t of tris) { box.expandByPoint(new THREE.Vector3(t.ax, t.ay, t.az)); box.expandByPoint(new THREE.Vector3(t.bx, t.by, t.bz)); box.expandByPoint(new THREE.Vector3(t.cx, t.cy, t.cz)); }
  const center = box.getCenter(new THREE.Vector3()); const radius = box.getSize(new THREE.Vector3()).length() / 2;
  return { center, radius };
}

function rasterizeView(tris, meshes, sphere, view) {
  const { d } = view; const up0 = Math.abs(d.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up0, d).normalize(); const up = new THREE.Vector3().crossVectors(d, right).normalize();
  const scale = RES / (2 * sphere.radius); const cx = sphere.center.x, cy = sphere.center.y, cz = sphere.center.z;
  // Front and back depths are tracked separately: the GPU culls a back face before the depth test, so a back face only
  // shows when it is nearer than every front face by more than a coincident-seam tolerance (adjacent solids share faces).
  const N = RES * RES; const z = new Float32Array(N).fill(Infinity); const zBack = new Float32Array(N).fill(Infinity); const flag = new Uint8Array(N); const owner = new Int32Array(N).fill(-1); const covered = new Uint8Array(N);
  const SEAM_EPS = 0.004; // metres
  const project = (x, y, zz) => { const px = x - cx, py = y - cy, pz = zz - cz; return [(px * right.x + py * right.y + pz * right.z) * scale + RES / 2, (px * up.x + py * up.y + pz * up.z) * scale + RES / 2, px * d.x + py * d.y + pz * d.z]; };
  for (const t of tris) {
    const [x0, y0, z0] = project(t.ax, t.ay, t.az), [x1, y1, z1] = project(t.bx, t.by, t.bz), [x2, y2, z2] = project(t.cx, t.cy, t.cz);
    // geometric normal facing: front if the triangle faces the viewer (viewer looks along +d)
    const nx = (t.by - t.ay) * (t.cz - t.az) - (t.bz - t.az) * (t.cy - t.ay), ny = (t.bz - t.az) * (t.cx - t.ax) - (t.bx - t.ax) * (t.cz - t.az), nz = (t.bx - t.ax) * (t.cy - t.ay) - (t.by - t.ay) * (t.cx - t.ax);
    const facing = nx * d.x + ny * d.y + nz * d.z; if (facing === 0) continue;
    let front = facing < 0; if (t.flip) front = !front; if (t.side === THREE.BackSide) front = !front; if (t.side === THREE.DoubleSide) front = true;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(RES - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(RES - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-9) continue; const inv = 1 / area;
    for (let py = minY; py <= maxY; py++) {
      const sy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5;
        const w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * inv; if (w0 < 0) continue;
        const w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * inv; if (w1 < 0) continue;
        const w2 = 1 - w0 - w1; if (w2 < 0) continue;
        const depth = w0 * z0 + w1 * z1 + w2 * z2; const p = py * RES + px;
        covered[p] = 1;
        if (t.transparent) continue;
        if (front) { if (depth < z[p]) z[p] = depth; }
        else if (depth < zBack[p]) { zBack[p] = depth; owner[p] = t.mesh; }
      }
    }
  }
  // classify + cluster
  const INVERTED_DEPTH = 0.08; // metres: a front face this close behind a back face is an inside-out thin part, not an opening
  const kind = new Uint8Array(N); let holePx = 0, throughPx = 0, silhouette = 0, invertedPx = 0;
  for (let p = 0; p < N; p++) {
    if (!covered[p]) continue; silhouette++;
    const hasFront = Number.isFinite(z[p]), hasBack = Number.isFinite(zBack[p]);
    if (hasBack && zBack[p] < (hasFront ? z[p] : Infinity) - SEAM_EPS) { flag[p] = 2; kind[p] = (hasFront && z[p] - zBack[p] < INVERTED_DEPTH) ? 3 : 1; if (kind[p] === 1) holePx++; else invertedPx++; }
    else if (hasFront) { flag[p] = 1; if (hasBack) z[p] = Math.min(z[p], zBack[p]); }
    else if (hasBack) { flag[p] = 2; kind[p] = 1; holePx++; z[p] = zBack[p]; }
    else { kind[p] = 2; throughPx++; }
  }
  const clusters = []; const seen = new Uint8Array(N); const stack = [];
  for (let p = 0; p < N; p++) {
    if (!kind[p] || seen[p]) continue;
    const k = kind[p]; let area = 0, x0 = RES, x1 = 0, y0 = RES, y1 = 0; const owners = new Map(); stack.push(p); seen[p] = 1;
    while (stack.length) { const q = stack.pop(); area++; const qx = q % RES, qy = (q - qx) / RES; if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      if ((k === 1 || k === 3) && owner[q] >= 0) owners.set(meshes[owner[q]], (owners.get(meshes[owner[q]]) || 0) + 1);
      for (const n of [q - 1, q + 1, q - RES, q + RES]) { if (n < 0 || n >= N || seen[n] || kind[n] !== k) continue; if ((n === q - 1 || n === q + 1) && Math.floor(n / RES) !== qy) continue; seen[n] = 1; stack.push(n); } }
    if (area >= MIN_AREA) clusters.push({ kind: k === 1 ? 'hole' : k === 3 ? 'inverted' : 'see-through', area, bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], meshes: [...owners.entries()].sort((u, v) => v[1] - u[1]).slice(0, 3).map(([n, c]) => `${n}(${c})`) });
  }
  clusters.sort((u, v) => v.area - u.area);
  // world-space location of each cluster: back-project its centroid pixel through the view basis at the nearest depth
  for (const c of clusters) {
    let sx = 0, sy = 0, n = 0, depthSum = 0, nd = 0;
    for (let py = c.bbox[1]; py < c.bbox[1] + c.bbox[3]; py++) for (let px = c.bbox[0]; px < c.bbox[0] + c.bbox[2]; px++) {
      const p = py * RES + px; if (kind[p] !== (c.kind === 'hole' ? 1 : c.kind === 'inverted' ? 3 : 2)) continue; sx += px + 0.5; sy += py + 0.5; n++;
      if (Number.isFinite(z[p])) { depthSum += z[p]; nd++; }
    }
    if (!n) continue; sx /= n; sy /= n; const depth = nd ? depthSum / nd : 0;
    const ox = (sx - RES / 2) / scale, oy = (sy - RES / 2) / scale;
    c.world = [cx + right.x * ox + up.x * oy + d.x * depth, cy + right.y * ox + up.y * oy + d.y * depth, cz + right.z * ox + up.z * oy + d.z * depth].map((v) => +v.toFixed(2));
  }
  return { name: view.name, silhouette, holePx, throughPx, invertedPx, clusters, kind, flag };
}

async function writeImage(path, view) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(RES, RES); const ctx = canvas.getContext('2d'); const img = ctx.createImageData(RES, RES);
  for (let p = 0; p < RES * RES; p++) {
    let r = 12, g = 13, b = 15;
    if (view.flag[p] === 1) { r = g = b = 150; }
    if (view.kind[p] === 1) { r = 235; g = 40; b = 40; } else if (view.kind[p] === 2) { r = 230; g = 60; b = 230; } else if (view.kind[p] === 3) { r = 240; g = 170; b = 40; }
    const q = ((RES - 1 - Math.floor(p / RES)) * RES + (p % RES)) * 4; // flip vertically so up is up
    img.data[q] = r; img.data[q + 1] = g; img.data[q + 2] = b; img.data[q + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); writeFileSync(path, canvas.toBuffer('image/png'));
}

// --probe=x,y,z,r lists the triangles near a point (mesh, facing normal) so a reported hole can be traced to its builder
const probe = opt('probe', '') ? opt('probe', '').split(',').map(Number) : null;
// --ray=px,py,pz,dx,dy,dz lists every triangle a ray crosses (distance, mesh, facing), --column=x,z is the vertical ray from above
const rayOpt = opt('ray', '') ? opt('ray', '').split(',').map(Number) : (opt('column', '') ? (([x, z]) => [x, 50, z, 0, -1, 0])(opt('column', '').split(',').map(Number)) : null);
function listRay(tris, meshes, [ox, oy, oz, dx, dy, dz]) {
  const hits = [];
  for (const t of tris) {
    const e1x = t.bx - t.ax, e1y = t.by - t.ay, e1z = t.bz - t.az, e2x = t.cx - t.ax, e2y = t.cy - t.ay, e2z = t.cz - t.az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x; const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue; const inv = 1 / det; const tx = ox - t.ax, ty = oy - t.ay, tz = oz - t.az;
    const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x; const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv; if (dist < 0) continue;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; const l = Math.hypot(nx, ny, nz) || 1; let facing = (nx * dx + ny * dy + nz * dz) / l; if (t.flip) facing = -facing;
    hits.push({ dist, mesh: meshes[t.mesh], n: [nx / l, ny / l, nz / l].map((q) => +q.toFixed(2)), front: t.side === THREE.DoubleSide ? true : (t.side === THREE.BackSide ? facing > 0 : facing < 0), transparent: t.transparent, at: [ox + dx * dist, oy + dy * dist, oz + dz * dist].map((q) => +q.toFixed(3)) });
  }
  hits.sort((a, b) => a.dist - b.dist); return hits;
}
if (flag('self-test')) {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3), material); box.name = 'closedBox'; root.add(box);
  const evaluate = (label) => { const { tris, meshes } = collectTriangles(root); const sphere = boundingSphere(tris); let open = 0, inverted = 0, viewsOpen = 0; for (const view of VIEWS) { const r = rasterizeView(tris, meshes, sphere, view); open += r.holePx; inverted += r.invertedPx; if (r.holePx || r.invertedPx) viewsOpen++; } console.log(`self-test ${label}: open ${open}, inside-out ${inverted}, affected views ${viewsOpen}/${VIEWS.length}`); return { open, inverted, viewsOpen }; };
  const closed = evaluate('closed box');
  const reversed = box.geometry.clone(); const index = reversed.index; for (let i = 0; i < index.count; i += 3) { const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b); } box.geometry = reversed;
  const insideOut = evaluate('inside-out box');
  box.geometry = new THREE.BoxGeometry(2, 1, 3); box.scale.x = -1; // mirrored placement renders correctly on the GPU
  const mirrored = evaluate('mirrored box');
  const ok = closed.open === 0 && closed.inverted === 0 && (insideOut.open + insideOut.inverted) > 0 && insideOut.viewsOpen === VIEWS.length && mirrored.open === 0 && mirrored.inverted === 0;
  console.log(ok ? 'self-test PASS' : 'self-test FAIL'); process.exit(ok ? 0 : 1);
}
const report = []; let failures = 0;
for (const id of ids) {
  const started = performance.now();
  let tank;
  // shipped materials by default (side/alphaTest/transparent decide what the player sees through); --receipt uses the lightweight receipt build
  try { tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: flag('receipt') }); } catch (error) { console.log(`${id}: build failed: ${error.message}`); failures++; continue; }
  const { tris, meshes } = collectTriangles(tank.root);
  const sphere = boundingSphere(tris);
  if (flag('materials')) {
    const rows = new Map();
    tank.root.traverseVisible((o) => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m) continue; const key = `${o.name || o.type} :: ${m.name || m.type}#${m.uuid.slice(0, 6)} side=${m.side} transparent=${m.transparent} opacity=${m.opacity} alphaTest=${m.alphaTest} depthWrite=${m.depthWrite}${Object.keys(m.userData || {}).length ? ' ud:' + Object.keys(m.userData).join('/') : ''}`; rows.set(key, (rows.get(key) || 0) + 1); } });
    for (const [k, n] of rows) console.log(`   ${k}${n > 1 ? ` x${n}` : ''}`);
  }
  if (rayOpt) {
    const hits = listRay(tris, meshes, rayOpt);
    console.log(`${id}: ray from (${rayOpt.slice(0, 3).join(',')}) along (${rayOpt.slice(3).join(',')}) crosses ${hits.length} triangles`);
    for (const h of hits.slice(0, Number(opt('probe-max', '40')))) console.log(`   ${h.dist.toFixed(3)} ${h.mesh} ${h.front ? 'FRONT' : 'back '} n(${h.n.join(',')}) at(${h.at.join(',')})${h.transparent ? ' transparent' : ''}`);
  }
  if (probe) {
    const [px, py, pz, pr] = probe; const near = [];
    for (const t of tris) { const cx = (t.ax + t.bx + t.cx) / 3, cy = (t.ay + t.by + t.cy) / 3, cz = (t.az + t.bz + t.cz) / 3; const dist = Math.hypot(cx - px, cy - py, cz - pz); if (dist > pr) continue;
      const nx = (t.by - t.ay) * (t.cz - t.az) - (t.bz - t.az) * (t.cy - t.ay), ny = (t.bz - t.az) * (t.cx - t.ax) - (t.bx - t.ax) * (t.cz - t.az), nz = (t.bx - t.ax) * (t.cy - t.ay) - (t.by - t.ay) * (t.cx - t.ax); const l = Math.hypot(nx, ny, nz) || 1;
      near.push({ dist, mesh: meshes[t.mesh], n: [nx / l, ny / l, nz / l].map((v) => +v.toFixed(2)), c: [cx, cy, cz].map((v) => +v.toFixed(3)), area: +(l / 2).toFixed(4), transparent: t.transparent, side: t.side }); }
    near.sort((u, v) => u.dist - v.dist);
    console.log(`${id}: ${near.length} triangles within ${pr} m of (${px},${py},${pz})`);
    for (const t of near.slice(0, Number(opt('probe-max', '40')))) console.log(`   ${t.mesh} n(${t.n.join(',')}) c(${t.c.join(',')}) area ${t.area}${t.transparent ? ' transparent' : ''}${t.side === 2 ? ' double' : ''}`);
  }
  const views = []; let worst = null;
  for (const view of VIEWS) {
    const r = rasterizeView(tris, meshes, sphere, view);
    const entry = { name: r.name, silhouette: r.silhouette, holePx: r.holePx, throughPx: r.throughPx, invertedPx: r.invertedPx, clusters: r.clusters };
    views.push(entry);
    if (!worst || r.holePx + r.throughPx > worst.holePx + worst.throughPx) worst = r;
    if (writeImages && (r.clusters.length || flag('images-all'))) await writeImage(`${outDir}/${id}__${r.name}.png`, r);
  }
  const holeViews = views.filter((v) => v.clusters.some((c) => c.kind === 'hole')).length;
  const throughViews = views.filter((v) => v.clusters.some((c) => c.kind === 'see-through')).length;
  const holePx = views.reduce((s, v) => s + v.holePx, 0), throughPx = views.reduce((s, v) => s + v.throughPx, 0), invertedPx = views.reduce((s, v) => s + v.invertedPx, 0);
  const invertedViews = views.filter((v) => v.clusters.some((c) => c.kind === 'inverted')).length;
  const meshTally = new Map();
  for (const v of views) for (const c of v.clusters) for (const m of c.meshes) { const n = m.replace(/\(\d+\)$/, ''); meshTally.set(n, (meshTally.get(n) || 0) + c.area); }
  const topMeshes = [...meshTally.entries()].sort((u, v) => v[1] - u[1]).slice(0, 5).map(([n, a]) => `${n}:${a}`);
  const sealed = holeViews === 0; // openings gate; inside-out thin parts and glass see-through are reported, not gated
  let ledgerVerdict = '';
  if (ledger) {
    const row = ledger.tanks?.[id];
    if (!row) ledgerVerdict = 'no ledger row';
    else if (row.sealed && !sealed) { ledgerVerdict = `REGRESSION: ledger sealed, now ${holeViews} open views`; failures++; }
    else if (holePx > row.openPx + Math.max(12, row.openPx * 0.1)) { ledgerVerdict = `REGRESSION: open px ${holePx} > ledger ${row.openPx}`; failures++; }
    else ledgerVerdict = row.sealed ? 'ledger: sealed, holds' : `ledger: ${row.openPx} px allowed, holds`;
    if (flag('update-ledger')) ledger.tanks[id] = { sealed, openPx: holePx, openViews: holeViews, insideOutPx: invertedPx, seeThroughPx: throughPx, tris: tris.length };
  } else if (!sealed) failures++;
  report.push({ id, tris: tris.length, radiusM: +sphere.radius.toFixed(2), sealed, holeViews, invertedViews, throughViews, holePx, invertedPx, throughPx, topMeshes, views: views.filter((v) => v.clusters.length) });
  console.log(`${id}: ${sealed ? 'SEALED' : 'OPEN'} — ${tris.length} tris, open px ${holePx} in ${holeViews}/${views.length} views, inside-out px ${invertedPx} in ${invertedViews} views, see-through px ${throughPx} in ${throughViews} views${topMeshes.length ? ' — ' + topMeshes.join(', ') : ''}${ledgerVerdict ? ' — ' + ledgerVerdict : ''} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  if (worst && (worst.holePx || worst.throughPx)) console.log(`   worst view ${worst.name}: ${worst.clusters.slice(0, 4).map((c) => `${c.kind} ${c.area}px world(${(c.world || []).join(',')}) ${c.meshes.join('/')}`).join(' | ')}`);
  if (flag('clusters')) for (const v of views) for (const c of v.clusters) console.log(`   ${v.name}: ${c.kind} ${c.area}px world(${(c.world || []).join(',')}) ${c.meshes.join('/')}`);
  tank.dispose?.();
}
if (ledger && flag('update-ledger')) { ledger.generatedAt = new Date().toISOString(); writeFileSync(resolve(ledgerPath), JSON.stringify(ledger, null, 1) + '\n'); console.log(`ledger updated: ${ledgerPath}`); }
const jsonPath = opt('json', '');
if (jsonPath) { mkdirSync(resolve(jsonPath, '..'), { recursive: true }); writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), res: RES, minArea: MIN_AREA, views: VIEWS.map((v) => v.name), report }, null, 1)); }
if (flag('gate') && failures) { console.log(`sealed check: ${failures} tank(s) open`); process.exit(1); }
