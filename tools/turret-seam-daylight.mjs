// Turret-seam daylight census: can a player see daylight through the seam between a turret and its hull?
//
//   node tools/turret-seam-daylight.mjs --ids=t80u,leo2a6 [--res-mm=5] [--images] [--json=path] [--min-px=6]
//   node tools/turret-seam-daylight.mjs --all [--json=path]
//
// The owner, 2026-10-24: "we raised a ton of tank turrets, but we need to ensure that none are 'see through' perfectly and
// there are proper turret rings connecting them properly". Each tank is built first-party (createTank, proceduralOnly,
// shipped materials through the shared surface collector) and rasterised orthographically, at --res-mm pixels, in a
// window round its turret's seam: centred on the yaw axis, out to the turret's plan reach plus 0.3 m either side, from
// 0.15 m under the deck round the ring to 0.45 m over it. Views: 8 azimuths (every 45 deg) at level, 5 deg and 12 deg
// down (the player's low views). Per pixel the nearest surface decides; alpha-cut netting and leaves (the sealed check's
// netting) do not occlude, everything else does. The gun (rig_gun, at rest) occludes but is not turret stock: daylight
// under a barrel over the glacis is open air, and the mantlet hides what it stands in front of. A pixel that shows the
// world (nothing drawn) with turret stock above it and hull stock below it in its own column, nothing between, is seam
// daylight:
//   ring   — inside the ring's own band (|lateral offset from the yaw axis| <= the receipt's rim, or the anatomy ring
//            radius without a receipt): the turret and hull are not joined where the ring should be; must be none
//   over   — under the turret's overhang outside that band (a bustle or cheek over a lower deck), reported per view
// Clusters under --min-px pixels are dropped (single-pixel sparkle at triangle seams). --images writes each view with
// daylight to .qa-dev/out/seam-daylight/<id>__<view>.png (turret red, hull grey, gun brown, ring daylight yellow,
// overhang cyan).
import { mkdirSync, writeFileSync } from 'node:fs';
import { uniqueIds } from './id-list.mjs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { collectTriangles } from './tank-surface-collect.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const RES_M = Number(opt('res-mm', '5')) / 1000;
const MIN_PX = Number(opt('min-px', '6'));
// a seam is a slot: a run of world pixels taller than this between turret and hull is open air (a gun over a glacis)
const GAP_MAX_M = Number(opt('gap-max', '0.20'));
const outDir = resolve(opt('out', '.qa-dev/out/seam-daylight'));
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('../src/vehicles/specs.ts');
const { combatAnatomyCalibration } = await import('../src/vehicles/combatAnatomyCalibrationRegistry.ts');
const { turretRingRadius } = await import('../src/vehicles/turretRingWell.ts');
const ids = flag('all') ? [...ALL_TANK_IDS] : uniqueIds(opt('ids', '').split(',').filter(Boolean), 'turret-seam-daylight --ids');
if (!ids.length) { console.error('pass --ids=<a,b> or --all'); process.exit(2); }

const VIEWS = [];
for (const elevDeg of [0, 5, 12]) for (let k = 0; k < 8; k++) VIEWS.push({ az: k * 45, el: elevDeg, name: `az${k * 45}_el${elevDeg}` });

/** Rasterise triangles (class 1 turret, 2 hull, 3 gun) into the view window; returns per-pixel nearest class (0 = world). */
function rasterize(sets, view, frame) {
  const az = view.az * Math.PI / 180, el = view.el * Math.PI / 180;
  // the camera looks along d (from a ring round the tank toward it, down by el)
  const d = new THREE.Vector3(-Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el));
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
  const up = new THREE.Vector3().crossVectors(d, right).normalize();
  // a tilted view sees the seam's far side higher (or lower) by the turret's depth: the window grows by its reach
  const W = Math.ceil((2 * frame.halfWidth) / RES_M);
  const H = Math.ceil(((frame.top - frame.bottom) * Math.cos(el) + 2 * frame.halfWidth * Math.sin(el)) / RES_M) + 2;
  const zbuf = new Float32Array(W * H).fill(Infinity), cls = new Uint8Array(W * H);
  const { cx, cy, cz } = frame;
  const vMid = ((frame.top + frame.bottom) / 2 - cy) * up.y;
  const proj = (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz;
    return [(px * right.x + py * right.y + pz * right.z) / RES_M + W / 2,
      ((px * up.x + py * up.y + pz * up.z) - vMid) / RES_M + H / 2, px * d.x + py * d.y + pz * d.z];
  };
  for (const [klass, tris] of sets) for (const t of tris) {
    if (t.net) continue;
    const [x0, y0, z0] = proj(t.ax, t.ay, t.az), [x1, y1, z1] = proj(t.bx, t.by, t.bz), [x2, y2, z2] = proj(t.cx, t.cy, t.cz);
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-12) continue; const inv = 1 / area;
    for (let py = minY; py <= maxY; py++) {
      const sy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5;
        const w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * inv; if (w0 < 0) continue;
        const w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * inv; if (w1 < 0) continue;
        const w2 = 1 - w0 - w1; if (w2 < 0) continue;
        const depth = w0 * z0 + w1 * z1 + w2 * z2, p = py * W + px;
        if (depth < zbuf[p]) { zbuf[p] = depth; cls[p] = klass; }
      }
    }
  }
  // the window is centred on the yaw axis: its column and the ring band's half width, in pixels
  return { W, H, cls, axisU: W / 2, ringHalfPx: frame.ringR / RES_M };
}

/** Seam daylight: world pixels with turret above and hull below in their column; ring band vs overhang, clustered. */
function seamDaylight(r) {
  const { W, H, cls, axisU, ringHalfPx } = r;
  const kind = new Uint8Array(W * H); // 1 ring, 2 overhang
  for (let x = 0; x < W; x++) {
    // rows run bottom (y 0) to top (y H-1)
    let hullBelow = false;
    const turretAbove = new Uint8Array(H);
    let seen = false;
    for (let y = H - 1; y >= 0; y--) { const c = cls[y * W + x]; if (c === 1) seen = true; else if (c) seen = false; turretAbove[y] = seen ? 1 : 0; }
    for (let y = 0; y < H; y++) {
      const c = cls[y * W + x];
      if (c === 2) { hullBelow = true; continue; }
      if (c) { hullBelow = false; continue; }
      if (!hullBelow || !turretAbove[y]) continue;
      // the run of world pixels this one belongs to: only a slot no taller than GAP_MAX_M is seam daylight
      let top = y; while (top + 1 < H && cls[(top + 1) * W + x] === 0) top++;
      const runPx = top - y + 1;
      if (runPx * RES_M <= GAP_MAX_M) {
        const k = Math.abs(x + 0.5 - axisU) <= ringHalfPx ? 1 : 2;
        for (let q = y; q <= top; q++) kind[q * W + x] = k;
      }
      y = top;
    }
  }
  const clusters = []; const seen = new Uint8Array(W * H); const stack = [];
  for (let p = 0; p < W * H; p++) {
    if (!kind[p] || seen[p]) continue;
    const k = kind[p]; let area = 0, x0 = W, x1 = 0, y0 = H, y1 = 0; stack.push(p); seen[p] = 1;
    while (stack.length) {
      const q = stack.pop(); area++; const qx = q % W, qy = (q - qx) / W;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (const n of [q - 1, q + 1, q - W, q + W]) {
        if (n < 0 || n >= W * H || seen[n] || kind[n] !== k) continue;
        if ((n === q - 1 || n === q + 1) && Math.floor(n / W) !== qy) continue;
        seen[n] = 1; stack.push(n);
      }
    }
    if (area >= MIN_PX) clusters.push({ kind: k === 1 ? 'ring' : 'over', px: area,
      lateralM: [+((x0 - axisU) * RES_M).toFixed(3), +((x1 + 1 - axisU) * RES_M).toFixed(3)], tallM: +((y1 - y0 + 1) * RES_M).toFixed(3) });
  }
  return { kind, clusters };
}

async function writeImage(path, r, kind) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(r.W, r.H), ctx = canvas.getContext('2d'), img = ctx.createImageData(r.W, r.H);
  for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
    const p = y * r.W + x, q = ((r.H - 1 - y) * r.W + x) * 4;
    let c = [16, 17, 20];
    if (r.cls[p] === 1) c = [190, 70, 60]; else if (r.cls[p] === 2) c = [150, 150, 150]; else if (r.cls[p] === 3) c = [120, 90, 50];
    if (kind[p] === 1) c = [250, 220, 40]; else if (kind[p] === 2) c = [60, 200, 235];
    img.data[q] = c[0]; img.data[q + 1] = c[1]; img.data[q + 2] = c[2]; img.data[q + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); writeFileSync(path, canvas.toBuffer('image/png'));
}

const report = [];
if (flag('images')) mkdirSync(outDir, { recursive: true });
for (const id of ids) {
  let tank;
  try { tank = createTank(id, null, { proceduralOnly: true, quality: 'high' }); } catch (error) { console.log(`${id}: build failed: ${error.message}`); continue; }
  try {
    const root = tank.root; root.updateMatrixWorld(true);
    const turret = root.getObjectByName('rig_turret');
    if (!turret) { console.log(`${id}: no turret`); continue; }
    // the turret's own stock without the gun (it pitches over the deck in open air, never a seam), and the gun apart
    const gun = root.getObjectByName('rig_gun');
    if (gun) gun.visible = false;
    const turretTris = collectTriangles(turret).tris;
    if (gun) gun.visible = true;
    const gunTris = gun ? collectTriangles(gun).tris : [];
    turret.visible = false; const hullTris = collectTriangles(root).tris; turret.visible = true;
    const axis = new THREE.Vector3().setFromMatrixPosition(turret.matrixWorld);
    const receipt = combatAnatomyCalibration(id)?.turretRing;
    // ring band: the receipt's rim (in its hull frame; the hull rig's world scale carried), else the anatomy ring radius
    const hullScale = root.getObjectByName('rig_hull')?.getWorldScale(new THREE.Vector3()).x ?? 1;
    // (inside the race's outer edge by its 4 mm inset and a pixel, and inside where the swept deck starts: the band is the
    // ring the turret's collar stands on, turretSeatRace.ts addSeatCollar)
    const ringR = receipt ? (Math.min(receipt.rimR, (receipt.sweepR0 ?? Infinity) - 0.005) - 0.01) * hullScale
      : turretRingRadius(getSpec(id).armor);
    let reach = 0, low = Infinity;
    for (const t of turretTris) for (const [x, y, z] of [[t.ax, t.ay, t.az], [t.bx, t.by, t.bz], [t.cx, t.cy, t.cz]]) {
      reach = Math.max(reach, Math.hypot(x - axis.x, z - axis.z)); low = Math.min(low, y);
    }
    const deckY = receipt ? receipt.deckY * hullScale + (root.getObjectByName('rig_hull')?.getWorldPosition(new THREE.Vector3()).y ?? 0) : low;
    const frame = { cx: axis.x, cy: deckY, cz: axis.z, halfWidth: Math.min(reach, 4) + 0.3, bottom: deckY - 0.15, top: deckY + 0.45, ringR };
    const views = [];
    for (const view of VIEWS) {
      const r = rasterize([[1, turretTris], [2, hullTris], [3, gunTris]], view, frame);
      const { kind, clusters } = seamDaylight(r);
      if (!clusters.length) continue;
      const ringPx = clusters.filter((c) => c.kind === 'ring').reduce((s, c) => s + c.px, 0);
      const overPx = clusters.filter((c) => c.kind === 'over').reduce((s, c) => s + c.px, 0);
      views.push({ view: view.name, ringPx, overPx, clusters: clusters.sort((a, b) => b.px - a.px).slice(0, 4) });
      if (flag('images')) await writeImage(`${outDir}/${id}__${view.name}.png`, r, kind);
    }
    const ringPx = views.reduce((s, v) => s + v.ringPx, 0), overPx = views.reduce((s, v) => s + v.overPx, 0);
    const status = ringPx ? 'RING-DAYLIGHT' : overPx ? 'overhang' : 'closed';
    report.push({ id, status, ringR: +ringR.toFixed(3), ringPx, overPx, views });
    const worst = views.slice().sort((a, b) => (b.ringPx - a.ringPx) || (b.overPx - a.overPx))[0];
    console.log(`${id}: ${status} ring ${ringPx} px, overhang ${overPx} px over ${views.length}/${VIEWS.length} views`
      + (worst ? ` (worst ${worst.view}: ${JSON.stringify(worst.clusters[0])})` : ''));
  } finally { tank.dispose(); }
}
const ringIds = report.filter((r) => r.ringPx).map((r) => r.id);
console.log(`turret-seam-daylight: ${report.length} tank(s), ${ringIds.length} with daylight in the ring band${ringIds.length ? `: ${ringIds.join(', ')}` : ''}`);
const jsonPath = opt('json', '');
if (jsonPath) writeFileSync(resolve(jsonPath), JSON.stringify({ resMm: RES_M * 1000, minPx: MIN_PX, views: VIEWS.map((v) => v.name), tanks: report }, null, 1) + '\n');
