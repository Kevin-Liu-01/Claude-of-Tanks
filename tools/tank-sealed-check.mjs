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
// (glass, grilles, markings) with no opaque surface behind them are
// see-through: the player sees the world through the tank. Clusters of such
// pixels are reported with the meshes involved so the owning builder can be
// fixed. --images writes a PNG per offending view (grey front faces, red
// holes, magenta see-through, green netting). --gate exits non-zero when any
// tank has a hole or see-through cluster at or above --min-area (default 6 px
// at 256 px over the bounding sphere, roughly a 15 cm gap on a main battle
// tank), or with --ledger when it regresses its row.
//
// Netting is counted apart (2026-10-16, 227 guards: kf51_u's ledger read 37 see-through px against 3,547 measured, all
// of it sky between the alpha-cut ghillie leaves, and nothing gated it). A pixel whose only cover is declared alpha-cut
// net or leaf dressing (tank-surface-collect.mjs alphaCutNetting: the ghillie suit's open-lattice net and garnish, the
// decor's net and cut-branch buckets) is netting px, never the hull's see-through; a pixel any other transparent surface
// covers stays the hull's see-through. Both gate against their own ledger columns (netting px exactly reproduce for an
// unchanged suit, so a net that grows, lifts off its hull or is doubled fails). Transparent surfaces never take part
// in the opaque depth test, so a hole behind netting still reads as a hole.
//
// Gun bores are open by design (2026-10-14, coordinator: the netting drape moved type10b's and leo2a7v's framing and
// single pixels inside their muzzle bores failed the hull). Every physical mouth the factory publishes (userData
// .physicalMouth with its muzzleSeatReceipt radius and depth, the frames the muzzle-bore probes measure) masks its bore:
// a hole or inside-out pixel whose visible surface lies inside that bore cylinder, or on the muzzle face out to the
// tube's outer radius (the carved rim's seam with the outer wall), each grown by one pixel's footprint, is counted as
// borePx and is never an opening. --no-bore-mask restores the raw census.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { parseReasonedIds, parseSeeThroughAccepts, recordedSealedFrame, sealedLedgerVerdict, updatedSealedLedger } from './sealed-ledger-policy.mjs';
import { userInfo } from 'node:os';
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

// Each view is framed on the row's recorded census frame (frame: [x, y, z, radius] in the tank root, guards 229 critic
// round 2): an unrelated extremity edit (a longer gun, an antenna, a stowage box) no longer moves the pixel grid under
// unchanged parts, so every column reproduces exactly. A tank without a row (or re-framed with --reframe=<id>:<reason>)
// is framed on its build's bounding sphere, snapped and grown by at least 10 cm (recordedSealedFrame); a build that
// reaches past its row's frame fails with REFRAME until it is re-framed on purpose.
// --ledger=path gates each tank against the committed census: a sealed tank must stay sealed, an open one may not open
// in more views, no tank may add more than max(12 px, 10 %) of true openings or of see-through over its ledger row, and
// its netting px stay within max(12 px, 2 %) of the row either way; a new vehicle must be sealed with no see-through
// cluster. Rows change only by name (sealed-ledger-policy.mjs updatedSealedLedger), each change appended to the row's
// `accepts` history {kind, reason, by (COT_LANE or the user), date, from}:
//   --update-ledger              records new vehicles' rows; never changes an existing row, up or down
//   --tighten-ledger=<ids>       lowers those rows' openings and see-through to the measurement
//   --accept-see-through=<id>[,<id>]:<reason>   sets those rows' see-through and netting at the measurement (and lets a
//                                new vehicle's row carry a see-through cluster); no flag accepts an opening
//   --reframe=<id>[,<id>]:<reason>   only for a build that reaches past its row's frame: its census in the old frame must
//                                pass the row's normal gate, then every column is re-measured in a new frame
// --update-ledger=see-through refuses new rows and leaves openings alone. Every flag needs --ledger and --update-ledger.
const ledgerPath = opt('ledger', '');
const ledger = ledgerPath ? JSON.parse(readFileSync(resolve(ledgerPath), 'utf8')) : null;
const updateMode = flag('update-ledger') ? 'rows' : opt('update-ledger', '');
if (updateMode && !['rows', 'see-through'].includes(updateMode)) { console.error(`--update-ledger=${updateMode}: use --update-ledger or --update-ledger=see-through`); process.exit(2); }
// every argument is a --flag: a reason left unquoted would arrive cut at its first space, its tail as stray words
const strayArgs = args.filter((a) => !a.startsWith('--'));
if (strayArgs.length) { console.error(`unexpected argument(s) ${strayArgs.map((a) => JSON.stringify(a)).join(' ')}: quote a multi-word reason as one argument`); process.exit(2); }
let acceptSeeThrough, reframe;
try {
  acceptSeeThrough = parseSeeThroughAccepts(opt('accept-see-through', ''));
  reframe = parseReasonedIds(opt('reframe', ''), '--reframe');
} catch (error) { console.error(error.message); process.exit(2); }
// --tighten-ledger=<ids>: the only way an update lowers a row (openings and see-through to min(row, measured))
const tighten = new Set(opt('tighten-ledger', '').split(',').map((id) => id.trim()).filter(Boolean));
if ((acceptSeeThrough.size || reframe.size || tighten.size) && !(ledger && updateMode)) { console.error('--accept-see-through, --reframe and --tighten-ledger change rows: they need --ledger and --update-ledger'); process.exit(2); }
const acceptedBy = process.env.COT_LANE || userInfo().username;
import { collectTriangles } from './tank-surface-collect.mjs';

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

// materialClass / collectTriangles live in tools/tank-surface-collect.mjs (shared with tank-watertight-check)
function boundingSphere(tris) {
  const box = new THREE.Box3();
  for (const t of tris) { box.expandByPoint(new THREE.Vector3(t.ax, t.ay, t.az)); box.expandByPoint(new THREE.Vector3(t.bx, t.by, t.bz)); box.expandByPoint(new THREE.Vector3(t.cx, t.cy, t.cz)); }
  const center = box.getCenter(new THREE.Vector3()); const radius = box.getSize(new THREE.Vector3()).length() / 2;
  return { center, radius };
}

/** The tank's physical gun bores in world space: each mouth frame's inverse matrix, local radius and depth (frame -Z
 * points into the bore; the frame's origin is the mouth plane), and its uniform world scale. */
function collectBores(root) {
  root.updateMatrixWorld(true);
  const bores = [];
  root.traverseVisible((o) => {
    const seat = o.userData?.muzzleSeatReceipt;
    if (!o.userData?.physicalMouth || !seat) return;
    const r = Number(seat.physicalInnerRadiusM ?? seat.innerRadiusM), depth = Number(seat.physicalBoreDepthM);
    if (!(r > 0) || !(depth > 0)) return;
    const outer = Math.max(r, Number(seat.outerRadiusM ?? seat.measuredOuterRadiusM) || r);
    const scale = o.getWorldScale(new THREE.Vector3());
    bores.push({ name: o.name, inv: o.matrixWorld.clone().invert(), r, outer, depth, worldScale: Math.max(1e-6, Math.abs(scale.x)) });
  });
  return bores;
}
const _boreLocal = new THREE.Vector3();
/** True when a world point lies inside a bore cylinder, or on its muzzle face out to the tube's outer radius, each
 * grown by `tolM` metres. */
function insideBore(bores, x, y, z, tolM) {
  for (const b of bores) {
    _boreLocal.set(x, y, z).applyMatrix4(b.inv);
    const tol = tolM / b.worldScale;
    if (_boreLocal.z > tol || _boreLocal.z < -(b.depth + tol)) continue;
    const radial = Math.hypot(_boreLocal.x, _boreLocal.y);
    if (radial <= b.r + tol || (Math.abs(_boreLocal.z) <= tol && radial <= b.outer + tol)) return true;
  }
  return false;
}

function rasterizeView(tris, meshes, sphere, view, bores = []) {
  const { d } = view; const up0 = Math.abs(d.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up0, d).normalize(); const up = new THREE.Vector3().crossVectors(d, right).normalize();
  const scale = RES / (2 * sphere.radius); const cx = sphere.center.x, cy = sphere.center.y, cz = sphere.center.z;
  // Front and back depths are tracked separately: the GPU culls a back face before the depth test, so a back face only
  // shows when it is nearer than every front face by more than a coincident-seam tolerance (adjacent solids share faces).
  const N = RES * RES; const z = new Float32Array(N).fill(Infinity); const zBack = new Float32Array(N).fill(Infinity); const flag = new Uint8Array(N); const owner = new Int32Array(N).fill(-1); const covered = new Uint8Array(N);
  // The nearest transparent surface per pixel, kept apart for alpha-cut netting (tri.net) and everything else (glass,
  // markings, undeclared alpha-cut parts): a pixel with no opaque surface is the hull's see-through if anything but
  // netting covers it, and netting see-through only when netting alone does.
  const glassZ = new Float32Array(N).fill(Infinity); const glassOwner = new Int32Array(N).fill(-1);
  const netZ = new Float32Array(N).fill(Infinity); const netOwner = new Int32Array(N).fill(-1);
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
        if (t.transparent) {
          if (t.net) { if (depth < netZ[p]) { netZ[p] = depth; netOwner[p] = t.mesh; } }
          else if (depth < glassZ[p]) { glassZ[p] = depth; glassOwner[p] = t.mesh; }
          continue;
        }
        if (front) { if (depth < z[p]) z[p] = depth; }
        else if (depth < zBack[p]) { zBack[p] = depth; owner[p] = t.mesh; }
      }
    }
  }
  // classify + cluster
  const INVERTED_DEPTH = 0.08; // metres: a front face this close behind a back face is an inside-out thin part, not an opening
  // kind: 1 hole (an opening into the hull), 2 see-through (the world through a non-netting transparent surface),
  // 3 inside-out thin part, 4 netting (the world between the strands of alpha-cut netting and nothing else)
  const kind = new Uint8Array(N); let holePx = 0, throughPx = 0, netPx = 0, silhouette = 0, invertedPx = 0, borePx = 0;
  // A bore pixel: the back face the player would see lies inside a gun bore (grown by one pixel's footprint).
  const pixelM = 1 / scale;
  const inBore = (p) => {
    if (!bores.length) return false;
    const qx = p % RES, qy = (p - qx) / RES, ox = (qx + 0.5 - RES / 2) / scale, oy = (qy + 0.5 - RES / 2) / scale, depth = zBack[p];
    return insideBore(bores, cx + right.x * ox + up.x * oy + d.x * depth, cy + right.y * ox + up.y * oy + d.y * depth,
      cz + right.z * ox + up.z * oy + d.z * depth, pixelM);
  };
  for (let p = 0; p < N; p++) {
    if (!covered[p]) continue; silhouette++;
    const hasFront = Number.isFinite(z[p]), hasBack = Number.isFinite(zBack[p]);
    if (hasBack && zBack[p] < (hasFront ? z[p] : Infinity) - SEAM_EPS) {
      if (inBore(p)) { flag[p] = 1; borePx++; if (hasFront) z[p] = Math.min(z[p], zBack[p]); else z[p] = zBack[p]; continue; }
      flag[p] = 2; kind[p] = (hasFront && z[p] - zBack[p] < INVERTED_DEPTH) ? 3 : 1; if (kind[p] === 1) holePx++; else invertedPx++;
    }
    else if (hasFront) { flag[p] = 1; if (hasBack) z[p] = Math.min(z[p], zBack[p]); }
    else if (hasBack) { z[p] = zBack[p]; if (inBore(p)) { flag[p] = 1; borePx++; continue; } flag[p] = 2; kind[p] = 1; holePx++; }
    else if (Number.isFinite(glassZ[p])) { kind[p] = 2; throughPx++; }
    else { kind[p] = 4; netPx++; }
  }
  const KIND_NAME = ['', 'hole', 'see-through', 'inverted', 'netting'];
  const ownerOf = (k, q) => (k === 2 ? glassOwner[q] : k === 4 ? netOwner[q] : owner[q]);
  const depthOf = (k, q) => (k === 2 ? glassZ[q] : k === 4 ? netZ[q] : z[q]);
  const clusters = []; const seen = new Uint8Array(N); const stack = [];
  for (let p = 0; p < N; p++) {
    if (!kind[p] || seen[p]) continue;
    const k = kind[p]; let area = 0, x0 = RES, x1 = 0, y0 = RES, y1 = 0; const owners = new Map(); stack.push(p); seen[p] = 1;
    while (stack.length) { const q = stack.pop(); area++; const qx = q % RES, qy = (q - qx) / RES; if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      const o = ownerOf(k, q); if (o >= 0) owners.set(meshes[o], (owners.get(meshes[o]) || 0) + 1);
      for (const n of [q - 1, q + 1, q - RES, q + RES]) { if (n < 0 || n >= N || seen[n] || kind[n] !== k) continue; if ((n === q - 1 || n === q + 1) && Math.floor(n / RES) !== qy) continue; seen[n] = 1; stack.push(n); } }
    if (area >= MIN_AREA) clusters.push({ kind: KIND_NAME[k], area, bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], meshes: [...owners.entries()].sort((u, v) => v[1] - u[1]).slice(0, 3).map(([n, c]) => `${n}(${c})`) });
  }
  clusters.sort((u, v) => v.area - u.area);
  // world-space location of each cluster: back-project its centroid pixel through the view basis at the nearest depth
  for (const c of clusters) {
    let sx = 0, sy = 0, n = 0, depthSum = 0, nd = 0;
    for (let py = c.bbox[1]; py < c.bbox[1] + c.bbox[3]; py++) for (let px = c.bbox[0]; px < c.bbox[0] + c.bbox[2]; px++) {
      const k = KIND_NAME.indexOf(c.kind); const p = py * RES + px; if (kind[p] !== k) continue; sx += px + 0.5; sy += py + 0.5; n++;
      const depth = depthOf(k, p); if (Number.isFinite(depth)) { depthSum += depth; nd++; }
    }
    if (!n) continue; sx /= n; sy /= n; const depth = nd ? depthSum / nd : 0;
    const ox = (sx - RES / 2) / scale, oy = (sy - RES / 2) / scale;
    c.world = [cx + right.x * ox + up.x * oy + d.x * depth, cy + right.y * ox + up.y * oy + d.y * depth, cz + right.z * ox + up.z * oy + d.z * depth].map((v) => +v.toFixed(2));
  }
  return { name: view.name, silhouette, holePx, throughPx, netPx, invertedPx, borePx, clusters, kind, flag };
}

async function writeImage(path, view) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(RES, RES); const ctx = canvas.getContext('2d'); const img = ctx.createImageData(RES, RES);
  for (let p = 0; p < RES * RES; p++) {
    let r = 12, g = 13, b = 15;
    if (view.flag[p] === 1) { r = g = b = 150; }
    if (view.kind[p] === 1) { r = 235; g = 40; b = 40; } else if (view.kind[p] === 2) { r = 230; g = 60; b = 230; } else if (view.kind[p] === 3) { r = 240; g = 170; b = 40; } else if (view.kind[p] === 4) { r = 70; g = 150; b = 90; }
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
  // A gun bore: an inside-out open tube (and an inside-out rim annulus on its muzzle face) in front of the closed box
  // reads as an opening from every view that sees it,
  // until a physical mouth frame (radius and depth in its seat receipt, -Z into the bore) masks it. The same frame
  // moved 0.5 m aside masks nothing, so the mask is the bore and only the bore.
  box.scale.x = 1;
  const tube = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 16, 1, true).rotateX(Math.PI / 2);
  const tubeIndex = tube.index; for (let i = 0; i < tubeIndex.count; i += 3) { const b = tubeIndex.getX(i + 1); tubeIndex.setX(i + 1, tubeIndex.getX(i + 2)); tubeIndex.setX(i + 2, b); }
  const barrel = new THREE.Mesh(tube, material); barrel.name = 'boreTube'; barrel.position.set(0, 0, 1.65); root.add(barrel);
  // the carved rim's seam: an inside-out annulus on the muzzle face out to the tube's outer radius
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 16).rotateY(Math.PI), material); rim.name = 'boreRim'; rim.position.set(0, 0, 1.8); root.add(rim);
  const mouth = new THREE.Object3D(); mouth.name = 'muzzleBoreShadowFallback'; mouth.position.set(0, 0, 1.8);
  mouth.userData.physicalMouth = true; mouth.userData.muzzleSeatReceipt = { physicalInnerRadiusM: 0.06, outerRadiusM: 0.09, physicalBoreDepthM: 0.3 };
  const boreCase = (label, withMouth) => {
    if (withMouth) root.add(mouth); else root.remove(mouth);
    const { tris, meshes } = collectTriangles(root); const sphere = boundingSphere(tris); const bores = collectBores(root);
    let open = 0, inverted = 0, masked = 0;
    for (const view of VIEWS) { const r = rasterizeView(tris, meshes, sphere, view, bores); open += r.holePx; inverted += r.invertedPx; masked += r.borePx; }
    console.log(`self-test ${label}: open ${open}, inside-out ${inverted}, bore px ${masked}`); return { open: open + inverted, masked };
  };
  const unmasked = boreCase('bore unmasked', false);
  const masked = boreCase('bore masked', true);
  mouth.position.x = 0.5;
  const aside = boreCase('bore mask aside', true);
  const boreOk = unmasked.open > 0 && unmasked.masked === 0 && masked.open === 0 && masked.masked === unmasked.open && aside.open === unmasked.open && aside.masked === 0;
  // Netting (2026-10-16): an alpha-cut net draped over the closed box and out past its edges shows the world between its
  // strands by design, netting px and never the hull's see-through. The same net undeclared (the 226 class: an alpha-cut
  // part the census cannot tell from glass) puts every one of those pixels on the hull's account; a hole cut in the roof
  // under the net is exactly as open as with the net hidden; a glass fin under the net is exactly the see-through it is
  // alone. The net's own count gates too, both ways: the same net lifted 0.4 m off the roof, or doubled beside itself,
  // adds netting px, and sunk 0.26 m into the box it loses them, with no opening and no see-through; each fails against
  // the declared net's baseline. One bounding sphere frames every case, so equal counts mean the same pixels.
  root.remove(barrel, rim, mouth);
  const netMaterial = new THREE.MeshStandardMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
  const netGeometry = new THREE.PlaneGeometry(3.2, 4.2).rotateX(-Math.PI / 2);
  const netAt = (name, x, y) => { const m = new THREE.Mesh(netGeometry, netMaterial); m.name = name; m.position.set(x, y, 0); root.add(m); return m; };
  const net = netAt('selftest_ghillie_hull_net', 0, 0.56), lifted = netAt('selftest_ghillie_lifted_net', 0, 0.96), twin = netAt('selftest_ghillie_twin_net', 1.2, 0.56);
  const sunk = netAt('selftest_ghillie_sunk_net', 0, 0.3);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  glass.name = 'selftestVisionBlock'; glass.position.set(1.3, 0.25, 0); root.add(glass);
  const frame = boundingSphere(collectTriangles(root).tris);
  const declared = { continuityRole: 'open-lattice', combatHitboxRole: 'nonArmor' };
  // an unrelated extremity: a 1 mm speck 5 cm past the net's far edge (the 226-class add-on a longer gun is to the frame)
  const speck = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.56, 2.15, 0.001, 0.56, 2.15, 0, 0.561, 2.151], 3)),
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  speck.name = 'selftestExtremitySpeck'; speck.visible = false; root.add(speck);
  const census = (label, { netDeclared = true, netShown = true, liftedShown = false, twinShown = false, sunkShown = false, geometry = box.geometry, glassShown = false, speckShown = false, aabbFrame = false } = {}) => {
    net.userData = netDeclared ? { ...declared } : {}; for (const m of [lifted, twin, sunk]) m.userData = { ...declared };
    net.visible = netShown; lifted.visible = liftedShown; twin.visible = twinShown; sunk.visible = sunkShown; glass.visible = glassShown; box.geometry = geometry;
    speck.visible = speckShown;
    const { tris, meshes } = collectTriangles(root); let open = 0, through = 0, netting = 0, throughViews = 0;
    // the fixed frame (a ledger row's) unless the case asks for the pre-229 framing on each build's own bounding sphere
    const viewFrame = aabbFrame ? boundingSphere(tris) : frame;
    for (const view of VIEWS) {
      const r = rasterizeView(tris, meshes, viewFrame, view); open += r.holePx + r.invertedPx; through += r.throughPx; netting += r.netPx;
      if (r.clusters.some((c) => c.kind === 'see-through')) throughViews++;
    }
    return { label, open, through, netting, throughViews };
  };
  const closedBox = box.geometry;
  // the roof's middle cell (BoxGeometry face +y is the third plane; 4 x 6 cells of 6 indices) cut out: a 0.5 m hole
  const holed = new THREE.BoxGeometry(2, 1, 3, 4, 1, 6); {
    const top = holed.groups[2], cell = top.start + (3 * 4 + 1) * 6, indices = Array.from(holed.index.array);
    indices.splice(cell, 6); holed.setIndex(indices); holed.clearGroups();
  }
  const cases = [
    census('netting declared'),
    census('netting undeclared', { netDeclared: false }),
    census('roof hole, net hidden', { netShown: false, geometry: holed }),
    census('roof hole under netting', { geometry: holed }),
    census('glass fin, net hidden', { netShown: false, glassShown: true, geometry: closedBox }),
    census('glass fin under netting', { glassShown: true, geometry: closedBox }),
    census('net lifted off the roof', { netShown: false, liftedShown: true }),
    census('net doubled', { twinShown: true }),
    census('net sunk into the box', { netShown: false, sunkShown: true }),
  ];
  // Framing (guards 229 critic round 2): with the row's fixed frame the speck 5 cm past the net leaves every column
  // exactly as it was; framed on each build's own bounding sphere (the pre-229 census) the same speck moves the grid
  // under the unchanged net and re-aliases its count (the negative control: the band would call it a regression).
  const fixedPlain = census('fixed frame'), fixedSpeck = census('fixed frame, a speck 5 cm past the net', { speckShown: true });
  const aabbPlain = census('own-AABB frame', { aabbFrame: true }), aabbSpeck = census('own-AABB frame, a speck 5 cm past the net', { speckShown: true, aabbFrame: true });
  const framingOk = ['open', 'through', 'netting'].every((k) => fixedSpeck[k] === fixedPlain[k]) && aabbSpeck.netting !== aabbPlain.netting;
  for (const c of [fixedPlain, fixedSpeck, aabbPlain, aabbSpeck]) console.log(`self-test ${c.label}: open ${c.open}, see-through ${c.through}, netting ${c.netting}`);
  // every case gates against the declared net's row: sealed, no see-through, its netting count
  const row = { sealed: true, openPx: 0, seeThroughPx: 0, netSeeThroughPx: cases[0].netting };
  for (const c of cases) {
    c.gate = sealedLedgerVerdict(row, { sealed: c.open === 0, holeViews: c.open ? 1 : 0, holePx: c.open, throughPx: c.through, throughViews: c.throughViews, netPx: c.netting }).pass;
    console.log(`self-test ${c.label}: open ${c.open}, see-through ${c.through} in ${c.throughViews} views, netting ${c.netting}, gate ${c.gate ? 'pass' : 'FAIL'}`);
  }
  const [netted, undeclared, holeBare, holeNetted, glassBare, glassNetted, liftedNet, doubledNet, sunkNet] = cases;
  const netOk = netted.open === 0 && netted.through === 0 && netted.netting > 0 && netted.gate
    && undeclared.through === netted.netting && undeclared.netting === 0 && !undeclared.gate
    && holeBare.open > 0 && holeNetted.open === holeBare.open && !holeNetted.gate
    && glassBare.through > 0 && glassNetted.through === glassBare.through && glassNetted.netting > 0 && !glassNetted.gate
    && [liftedNet, doubledNet].every((c) => c.open === 0 && c.through === 0 && c.netting > netted.netting && !c.gate)
    && sunkNet.open === 0 && sunkNet.through === 0 && sunkNet.netting < netted.netting && !sunkNet.gate;
  const ok = netOk && framingOk && boreOk && closed.open === 0 && closed.inverted === 0 && (insideOut.open + insideOut.inverted) > 0 && insideOut.viewsOpen === VIEWS.length && mirrored.open === 0 && mirrored.inverted === 0;
  console.log(ok ? 'self-test PASS' : 'self-test FAIL'); process.exit(ok ? 0 : 1);
}
// The fleet factory loads only for a tank census (guards 229: --self-test never builds a tank, so it skips the import).
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ensureInteriorFills, hasInteriorFills } = await import('../src/vehicles/interiorFills.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
const ids = flag('all') ? [...ALL_TANK_IDS] : opt('ids', 'abramsx').split(',').filter(Boolean);
if (writeImages) mkdirSync(outDir, { recursive: true });
const report = []; let failures = 0;
/** The gated totals of the 33 views in one frame (a re-frame's census in the row's old frame). */
function frameCensus(tris, meshes, frame, bores) {
  const sphere = { center: new THREE.Vector3(frame[0], frame[1], frame[2]), radius: frame[3] };
  let holePx = 0, throughPx = 0, netPx = 0, holeViews = 0, throughViews = 0;
  for (const view of VIEWS) {
    const r = rasterizeView(tris, meshes, sphere, view, bores);
    holePx += r.holePx; throughPx += r.throughPx; netPx += r.netPx;
    if (r.clusters.some((c) => c.kind === 'hole')) holeViews++;
    if (r.clusters.some((c) => c.kind === 'see-through')) throughViews++;
  }
  return { sealed: holeViews === 0, holeViews, holePx, throughPx, throughViews, netPx };
}
for (const id of ids) {
  await ensureInteriorFills([id]);
  const started = performance.now();
  let tank;
  // shipped materials by default (side/alphaTest/transparent decide what the player sees through); --receipt uses the lightweight receipt build
  try { tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: flag('receipt') }); } catch (error) { console.log(`${id}: build failed: ${error.message}`); failures++; continue; }
  const { tris, meshes } = collectTriangles(tank.root);
  const listed = ledger?.tanks?.[id];
  const rowFrame = Array.isArray(listed?.frame) ? listed.frame : null;
  const reframing = reframe.has(id);
  const fixedFrame = Boolean(rowFrame) && !reframing;
  const frame = fixedFrame ? rowFrame : recordedSealedFrame(boundingSphere(tris));
  const sphere = { center: new THREE.Vector3(frame[0], frame[1], frame[2]), radius: frame[3] };
  // the build's reach from the row's frame centre: past its radius the row's pixels no longer hold the whole build
  const yard = rowFrame ?? frame;
  let reachM = 0;
  for (const t of tris) for (const [x, y, z] of [[t.ax, t.ay, t.az], [t.bx, t.by, t.bz], [t.cx, t.cy, t.cz]]) {
    const r = Math.hypot(x - yard[0], y - yard[1], z - yard[2]); if (r > reachM) reachM = r;
  }
  const frameExceeded = Boolean(rowFrame) && reachM > rowFrame[3];
  const bores = flag('no-bore-mask') ? [] : collectBores(tank.root);
  // a re-frame is checked in the row's old frame first (critic round 3: geometry past the frame is only clipped there,
  // so every unchanged column reproduces exactly; anything new still has to pass the row's normal gate)
  const oldFrame = reframing && rowFrame ? frameCensus(tris, meshes, rowFrame, bores) : null;
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
    const r = rasterizeView(tris, meshes, sphere, view, bores);
    const entry = { name: r.name, silhouette: r.silhouette, holePx: r.holePx, throughPx: r.throughPx, netPx: r.netPx, invertedPx: r.invertedPx, borePx: r.borePx, clusters: r.clusters };
    views.push(entry);
    // the view whose reported (non-netting) clusters cover the most pixels names the offending meshes
    const reported = r.clusters.reduce((sum, c) => sum + (c.kind === 'netting' ? 0 : c.area), 0);
    if (reported && (!worst || reported > worst.reported)) worst = { ...r, reported };
    if (writeImages && (r.clusters.length || flag('images-all'))) await writeImage(`${outDir}/${id}__${r.name}.png`, r);
  }
  const holeViews = views.filter((v) => v.clusters.some((c) => c.kind === 'hole')).length;
  const throughViews = views.filter((v) => v.clusters.some((c) => c.kind === 'see-through')).length;
  const netViews = views.filter((v) => v.clusters.some((c) => c.kind === 'netting')).length;
  const holePx = views.reduce((s, v) => s + v.holePx, 0), throughPx = views.reduce((s, v) => s + v.throughPx, 0), invertedPx = views.reduce((s, v) => s + v.invertedPx, 0);
  const netPx = views.reduce((s, v) => s + v.netPx, 0);
  const borePx = views.reduce((s, v) => s + v.borePx, 0);
  const invertedViews = views.filter((v) => v.clusters.some((c) => c.kind === 'inverted')).length;
  const meshTally = new Map();
  for (const v of views) for (const c of v.clusters) if (c.kind !== 'netting') for (const m of c.meshes) { const n = m.replace(/\(\d+\)$/, ''); meshTally.set(n, (meshTally.get(n) || 0) + c.area); }
  const topMeshes = [...meshTally.entries()].sort((u, v) => v[1] - u[1]).slice(0, 5).map(([n, a]) => `${n}:${a}`);
  // openings gate (holeViews, holePx), see-through gates on its own account (throughPx, throughViews: the world seen
  // through glass, markings or undeclared alpha-cut parts), and netting px (netPx) against the row's netting column.
  // Inside-out thin parts are reported, not gated; a hole behind netting is still a hole, because no transparent
  // surface hides an opening.
  const sealed = holeViews === 0;
  let ledgerVerdict = '';
  const census = { sealed, holeViews, holePx, throughPx, throughViews, netPx, frameExceeded, oldFrame };
  if (ledger) {
    // an id the update re-baselines (--accept-see-through) is judged at its measured see-through and netting; its
    // openings still gate (a row's baseline, or a new vehicle's sealed rule)
    const verdict = sealedLedgerVerdict(ledger.tanks?.[id], census, { acceptSeeThrough: acceptSeeThrough.has(id), reframe: reframe.has(id) });
    ledgerVerdict = verdict.message;
    if (!verdict.pass) failures++;
  } else if (!sealedLedgerVerdict(undefined, census).pass) failures++;
  report.push({ id, interiorFillRecordLoaded: hasInteriorFills(id), tris: tris.length, radiusM: +sphere.radius.toFixed(2), frame, frameSource: fixedFrame ? 'ledger' : 'build', reachM: +reachM.toFixed(3), frameExceeded, oldFrame, sealed, holeViews, invertedViews, throughViews, netViews, holePx, invertedPx, throughPx, netPx, bores: bores.length, borePx, topMeshes, views: views.filter((v) => v.clusters.length) });
  console.log(`${id}: ${sealed ? 'SEALED' : 'OPEN'} — ${tris.length} tris, open px ${holePx} in ${holeViews}/${views.length} views, inside-out px ${invertedPx} in ${invertedViews} views, see-through px ${throughPx} in ${throughViews} views, netting px ${netPx} in ${netViews} views, bore px ${borePx} masked in ${bores.length} bore(s)${topMeshes.length ? ' — ' + topMeshes.join(', ') : ''}${ledgerVerdict ? ' — ' + ledgerVerdict : ''} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  if (worst) console.log(`   worst view ${worst.name}: ${worst.clusters.filter((c) => c.kind !== 'netting').slice(0, 4).map((c) => `${c.kind} ${c.area}px world(${(c.world || []).join(',')}) ${c.meshes.join('/')}`).join(' | ')}`);
  if (flag('clusters')) for (const v of views) for (const c of v.clusters) console.log(`   ${v.name}: ${c.kind} ${c.area}px world(${(c.world || []).join(',')}) ${c.meshes.join('/')}`);
  tank.dispose?.();
}
if (ledger && updateMode) {
  try {
    const updated = updatedSealedLedger(ledger, report, new Date().toISOString(), ids, { acceptSeeThrough, reframe, tighten, seeThroughOnly: updateMode === 'see-through', by: acceptedBy });
    writeFileSync(resolve(ledgerPath), JSON.stringify(updated, null, 1) + '\n');
    for (const id of reframe.keys()) console.log(`   re-framed: ${id} [${(ledger.tanks?.[id]?.frame ?? []).join(', ')}] -> [${updated.tanks[id].frame.join(', ')}], every column re-measured`);
    for (const id of acceptSeeThrough.keys()) {
      const was = ledger.tanks?.[id], now = updated.tanks[id];
      console.log(`   see-through ${was ? `re-baselined: ${id} ${was.seeThroughPx} -> ${now.seeThroughPx} px, netting ${was.netSeeThroughPx ?? '-'} -> ${now.netSeeThroughPx} px` : `accepted on a new row: ${id} ${now.seeThroughPx} px, netting ${now.netSeeThroughPx} px`}`);
    }
    console.log(`ledger updated: ${ledgerPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
const jsonPath = opt('json', '');
if (jsonPath) { mkdirSync(resolve(jsonPath, '..'), { recursive: true }); writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), res: RES, minArea: MIN_AREA, views: VIEWS.map((v) => v.name), report }, null, 1)); }
if (flag('gate') && failures) { console.log(`sealed check: ${failures} tank(s) open`); process.exit(1); }
