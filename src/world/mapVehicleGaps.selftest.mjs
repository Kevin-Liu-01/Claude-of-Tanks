import assert from 'node:assert/strict';
import * as THREE from 'three';
import { civilianVehicleOverrides } from './maps/civilianVehicleKit.ts';
import { fleetForMap } from './maps/vehicleFleets.ts';
import { MAP_IDS } from './maps/index.ts';

// Sealed lane (2026-10-10; the owner: "some vehicles are see through, as in they are randomly have gaps in the middle
// of their bodies ... i meant the vehicles like cars and trucks on map"). From where a player looks at a parked
// vehicle (the battle chase camera's near-horizontal views, 4-20 degrees over the horizon, all the way round), no map
// vehicle shows the world through its body: a truck's cargo floor rode 19-27 cm over the frame rails with nothing
// between (a slot along every truck, up to 0.75 m2 seen side-on), a pickup's bed stood over its floor pan, a jeep's
// engine bay was open to the ground round the bonnet, and the bay and the underside between the rails were open under
// cabs and tails. Each body is rasterised orthographically as props.ts draws it (FrontSide); a see-through pixel is
// one the body covers with no front face, or one inside the silhouette's scanline hull (between the first and last
// covered pixel of its row and of its column: the open space under a body, below its lowest part, stays outside) that
// nothing covers, whose ray crosses the vehicle's middle above its chassis line (a truck's rail bottoms, a car's or a
// pickup's sill, a jeep's floor pan: the daylight under a vehicle between its wheels is no gap in its body). The largest
// connected gap must stay under GAP_LIMIT_M2 on every fleet, role and tier.

const PXM = 30;
// main (deploy 208) failed 75 bodies here (every fleet's trucks: up to 0.44 m2 over the chassis line); the closed bodies
// stay at or under 0.12 (a wagon's roof rack 0.11, a KamAZ's rear overhang 0.12 on the phone tier)
const GAP_LIMIT_M2 = 0.15;
const ELEVATIONS = [6, 12, 20];
const AZIMUTHS = 12;
const VIEWS = [];
for (const el of ELEVATIONS) for (let k = 0; k < AZIMUTHS; k++) {
  const az = (k / AZIMUTHS) * Math.PI * 2, e = (el * Math.PI) / 180;
  VIEWS.push({ name: `e${el}_a${Math.round((az * 180) / Math.PI)}`, d: new THREE.Vector3(-Math.sin(az) * Math.cos(e), -Math.sin(e), -Math.cos(az) * Math.cos(e)).normalize() });
}

function seeded(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** The model height of a vehicle's chassis line: under it lies the open underside between the wheels. */
function chassisLine(model) {
  if (model.kind === 'truck') return model.frameY - 0.18;
  if (model.kind === 'pickup') return model.cab.sill;
  if (model.kind === 'jeep') return model.tub.floor - 0.13;
  return model.body.sill;
}

/** The largest see-through gap (m2) of a body from one view, and where (the view-plane centroid). */
function largestGap(tris, view, center, radius, chassisY) {
  const { d } = view, up0 = Math.abs(d.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up0, d).normalize(), up = new THREE.Vector3().crossVectors(d, right).normalize();
  const RES = Math.ceil(2 * radius * PXM) + 4, N = RES * RES;
  const front = new Uint8Array(N), covered = new Uint8Array(N), P = new Float64Array(6);
  for (let t = 0; t < tris.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      const px = tris[t + k * 3] - center.x, py = tris[t + k * 3 + 1] - center.y, pz = tris[t + k * 3 + 2] - center.z;
      P[k * 2] = (px * right.x + py * right.y + pz * right.z) * PXM + RES / 2;
      P[k * 2 + 1] = (px * up.x + py * up.y + pz * up.z) * PXM + RES / 2;
    }
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2];
    const ux = tris[t + 3] - ax, uy = tris[t + 4] - ay, uz = tris[t + 5] - az, vx = tris[t + 6] - ax, vy = tris[t + 7] - ay, vz = tris[t + 8] - az;
    const facing = (uy * vz - uz * vy) * d.x + (uz * vx - ux * vz) * d.y + (ux * vy - uy * vx) * d.z;
    if (facing === 0) continue;
    const isFront = facing < 0;
    const [x0, y0, x1, y1, x2, y2] = P;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-12) continue;
    const inv = 1 / area;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(RES - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(RES - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let py = minY; py <= maxY; py++) {
      const sy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5;
        const w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * inv; if (w0 < 0) continue;
        const w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * inv; if (w1 < 0) continue;
        if (1 - w0 - w1 < 0) continue;
        const p = py * RES + px; covered[p] = 1; if (isFront) front[p] = 1;
      }
    }
  }
  const rowMin = new Int32Array(RES).fill(RES), rowMax = new Int32Array(RES).fill(-1), colMin = new Int32Array(RES).fill(RES), colMax = new Int32Array(RES).fill(-1);
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) if (covered[y * RES + x]) {
    if (x < rowMin[y]) rowMin[y] = x; if (x > rowMax[y]) rowMax[y] = x; if (y < colMin[x]) colMin[x] = y; if (y > colMax[x]) colMax[x] = y;
  }
  const see = new Uint8Array(N);
  const hd = d.x * d.x + d.z * d.z;
  for (let p = 0; p < N; p++) {
    const x = p % RES, y = (p - x) / RES;
    if (!(covered[p] ? !front[p] : (x > rowMin[y] && x < rowMax[y] && y > colMin[x] && y < colMax[x]))) continue;
    // the pixel's ray where it passes the vehicle's vertical axis (x = z = 0: the footprint is centred there)
    const ox = (x + 0.5 - RES / 2) / PXM, oy = (y + 0.5 - RES / 2) / PXM;
    const px = center.x + right.x * ox + up.x * oy, py = center.y + right.y * ox + up.y * oy, pz = center.z + right.z * ox + up.z * oy;
    const t = hd > 1e-9 ? -(px * d.x + pz * d.z) / hd : 0;
    if (py + t * d.y >= chassisY) see[p] = 1;
  }
  let best = 0, at = null; const stack = [];
  for (let p = 0; p < N; p++) {
    if (!see[p]) continue;
    let n = 0, sx = 0, sy = 0; see[p] = 0; stack.push(p);
    while (stack.length) {
      const q = stack.pop(), qx = q % RES, qy = (q - qx) / RES; n++; sx += qx; sy += qy;
      if (qx > 0 && see[q - 1]) { see[q - 1] = 0; stack.push(q - 1); }
      if (qx < RES - 1 && see[q + 1]) { see[q + 1] = 0; stack.push(q + 1); }
      if (qy > 0 && see[q - RES]) { see[q - RES] = 0; stack.push(q - RES); }
      if (qy < RES - 1 && see[q + RES]) { see[q + RES] = 0; stack.push(q + RES); }
    }
    if (n > best) {
      best = n;
      const ox = (sx / n + 0.5 - RES / 2) / PXM, oy = (sy / n + 0.5 - RES / 2) / PXM;
      at = [center.x + right.x * ox + up.x * oy, center.y + right.y * ox + up.y * oy, center.z + right.z * ox + up.z * oy].map((v) => +v.toFixed(2));
    }
  }
  return { m2: best / (PXM * PXM), at };
}

function worstGap(geometry, chassisY) {
  const position = geometry.getAttribute('position'), index = geometry.index.array, tris = new Float64Array(index.length * 3);
  for (let i = 0; i < index.length; i++) { const v = index[i]; tris[i * 3] = position.getX(v); tris[i * 3 + 1] = position.getY(v); tris[i * 3 + 2] = position.getZ(v); }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox, center = box.getCenter(new THREE.Vector3()), radius = box.getSize(new THREE.Vector3()).length() / 2;
  let worst = { m2: 0, at: null, view: null };
  for (const view of VIEWS) {
    const gap = largestGap(tris, view, center, radius, chassisY);
    if (gap.m2 > worst.m2) worst = { ...gap, view: view.name };
  }
  return worst;
}

const failures = [], worstByRole = new Map();
const seen = new Set();
let measured = 0;
for (const mapId of MAP_IDS) {
  const fleet = fleetForMap(mapId);
  if (seen.has(fleet.id)) continue;
  seen.add(fleet.id);
  for (const tier of ['desktop', 'coarse']) {
    const roles = civilianVehicleOverrides(mapId, tier === 'coarse');
    for (const [role, builders] of Object.entries(roles)) {
      const geometry = builders.build(seeded(1337));
      const fit = geometry.userData.fit;
      assert.ok(fit && fit.scale > 0, `${fleet.id}/${role}: the kit records its fit`);
      const worst = worstGap(geometry, (chassisLine(fleet.roles[role].model) + fit.lift) * fit.scale);
      geometry.dispose();
      measured++;
      const label = `${fleet.id}/${role}/${tier}`;
      const known = worstByRole.get(role);
      if (!known || worst.m2 > known.m2) worstByRole.set(role, { ...worst, label });
      if (worst.m2 > GAP_LIMIT_M2) failures.push(`${label}: a ${worst.m2.toFixed(3)} m2 gap through the body (${worst.view}, near ${worst.at?.join(', ')})`);
    }
  }
}
assert.ok(measured >= 300, `every fleet's every role on both tiers (${measured})`);
assert.deepEqual(failures, [], `map vehicles show the world through their bodies from the chase camera:\n  ${failures.join('\n  ')}`);
console.log(`mapVehicleGaps.selftest: ${measured} bodies (${seen.size} fleets x 8 roles x 2 tiers) show no gap over ${GAP_LIMIT_M2} m2 from the chase camera; worst per role: ${[...worstByRole.entries()].map(([role, w]) => `${role} ${w.m2.toFixed(3)} (${w.label})`).join(', ')}`);
