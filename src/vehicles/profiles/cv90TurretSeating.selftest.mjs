import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectTriangles } from '../../../tools/tank-surface-collect.mjs';
import { createTank } from '../tankFactory.ts';

// 227 gun-gaps (owner 2026-10-17, of the CV90 Mk IV: "the part of its assembly that looks like its sticking out above
// the turret and its not coming from the turret"). The roof sight head, the vehicle's highest point, hung 35-45 mm clear
// of its neck over the neck's whole footprint, and the three +X turret side plates stood 24-47 mm off the shell (the loft
// is symmetric about the turret's own axis at world x -0.035; the plates were placed symmetrically in world x, and
// vertical plates on a wall leaning in 23 deg above its knee left a wedge of air behind their upper half).
// Seated: along rays through each part into the solid behind it, the count of solids the ray is inside never drops to 0.
// All coordinates are world metres at rest (turret unyawed, gun level).
let tris = [];

/** Surfaces crossed by an axis-aligned ray from `origin` along +/- `axis`: distance and whether the face points back
 *  at the ray (a solid begins: the ray enters it) or away from it (the ray leaves a solid). Opaque faces only. */
function crossings(origin, axis, sign) {
  const [u, v] = [0, 1, 2].filter((k) => k !== axis);
  const hits = [];
  for (const t of tris) {
    if (t.transparent) continue;
    const p = [[t.ax, t.ay, t.az], [t.bx, t.by, t.bz], [t.cx, t.cy, t.cz]];
    const area = (p[1][u] - p[0][u]) * (p[2][v] - p[0][v]) - (p[2][u] - p[0][u]) * (p[1][v] - p[0][v]);
    if (Math.abs(area) < 1e-12) continue;
    const w1 = ((origin[u] - p[0][u]) * (p[2][v] - p[0][v]) - (p[2][u] - p[0][u]) * (origin[v] - p[0][v])) / area;
    const w2 = ((p[1][u] - p[0][u]) * (origin[v] - p[0][v]) - (origin[u] - p[0][u]) * (p[1][v] - p[0][v])) / area;
    if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue;
    const at = p[0][axis] + w1 * (p[1][axis] - p[0][axis]) + w2 * (p[2][axis] - p[0][axis]);
    const distance = (at - origin[axis]) * sign;
    if (distance <= 1e-5) continue;
    const e1 = [0, 1, 2].map((k) => p[1][k] - p[0][k]), e2 = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
    let normal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]][axis];
    if (t.flip) normal = -normal;
    hits.push({ distance, enters: normal * sign < 0 });
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

/** Air along an axis-aligned ray: walk in from `far` (outside everything) toward station `to`, counting how many solids
 *  the ray is inside; returns the longest stretch with depth 0 between station `from` (or, when null, the first surface
 *  the ray enters) and `to`. */
function airBetween(far, axis, sign, from, to) {
  const hits = crossings(far, axis, sign);
  const hi = Math.abs(to - far[axis]);
  const lo = from == null ? (hits.find((h) => h.enters)?.distance ?? hi) : Math.abs(from - far[axis]);
  let depth = 0, cursor = 0, worst = 0;
  for (const h of [...hits.filter((h) => h.distance < hi), { distance: hi, end: true }]) {
    if (depth <= 0) worst = Math.max(worst, Math.min(h.distance, hi) - Math.max(cursor, lo));
    if (h.end) break;
    depth += h.enters ? 1 : -1; cursor = h.distance;
  }
  return worst;
}

const tank = createTank('cv90_mk4', null, { proceduralOnly: true });
tris = collectTriangles(tank.root).tris;
// The sight neck spans x 0.119..0.349, z -0.765..-0.555 (y 2.395..2.585); the head (y 2.55..2.818) sits on it. Straight
// down through the head into the neck there must be no air: from y 2.78 (inside the head) to y 2.45 (inside the neck).
let probes = 0;
for (const x of [0.15, 0.234, 0.32]) for (const z of [-0.74, -0.66, -0.58]) {
  const air = airBetween([x, 6, z], 1, -1, 2.78, 2.45);
  assert.ok(air < 0.001, `sight ${x}/${z}: ${(air * 1000).toFixed(1)} mm of air between the head and its neck`);
  probes++;
}

// Turret side plates (three per side on the in-leaning upper wall, rows z -1.05/-0.38/0.24, 0.58 m long): inward along
// x from each plate's outer face into the shell, no air between plate and shell, at both ends and the middle of each.
for (const side of [-1, 1]) for (const zc of [-1.05, -0.38, 0.24]) for (const dz of [-0.25, 0, 0.25]) for (const y of [1.95, 2.05]) {
  const air = airBetween([side * 4, y, zc + dz], 0, -side, null, -0.035 + side * 1.30);
  assert.ok(air < 0.001, `side plate ${side}/${zc + dz}/${y}: ${(air * 1000).toFixed(1)} mm of air between the plate and the shell`);
  probes++;
}
tank.dispose?.();

// CV90 (the owner's "IX cv90 ... sticking out above the turret and its not coming from the turret", 2026-10-17; round 267
// rebuilt the turret as the Strf 9040's wedge cheeks either side of an open gun channel, with a raked rocking mask
// running into the turret front). In the channel (turret-local x +-0.15 of 0.9-scaled authoring metres), straight down
// from the sky at stations along the mask's rear, there must be no air between the first surface met and the turret's
// front stock below it (local y 0.18, inside the raked lower front), at rest and at full elevation: the mask always
// meets the turret front, never a slot open to the sky with the barrel's root showing through it.
const cv90 = createTank('cv90', null, { proceduralOnly: true });
const gunRig = cv90.root.getObjectByName('rig_gun');
const turretRig = cv90.root.getObjectByName('rig_turret');
const S = 0.9;
for (const pitchDeg of [0, 37]) {
  gunRig.rotation.x = -pitchDeg * Math.PI / 180;
  cv90.root.updateMatrixWorld(true);
  tris = collectTriangles(cv90.root).tris;
  for (const x of [-0.15, 0.15]) for (const zLocal of [0.95, 1.00, 1.05, 1.10]) {
    const top = turretRig.localToWorld(new THREE.Vector3(x * S, 3, zLocal * S));
    const floor = turretRig.localToWorld(new THREE.Vector3(x * S, 0.18 * S, zLocal * S));
    const air = airBetween([top.x, 6, top.z], 1, -1, null, floor.y);
    assert.ok(air < 0.001, `cv90 channel ${x}/${zLocal} at ${pitchDeg} deg: ${(air * 1000).toFixed(1)} mm of air between the gun mask and the turret front`);
    probes++;
  }
}
gunRig.rotation.x = 0;
cv90.root.updateMatrixWorld(true);
tris = collectTriangles(cv90.root).tris;
// the mask's raked back is buried in the turret front at rest: just behind the mask's rear face the first surface met
// from the sky is the turret, not the mask standing proud of it
for (const x of [-0.15, 0.15]) {
  const p = turretRig.localToWorld(new THREE.Vector3(x * S, 3, 0.80 * S));
  const roofLocal = turretRig.worldToLocal(new THREE.Vector3(p.x, 6 - crossings([p.x, 6, p.z], 1, -1).find((h) => h.enters).distance, p.z)).y / S;
  assert.ok(roofLocal <= 0.70, `cv90 mask rear at ${x}: the first surface at local z 0.80 is ${roofLocal.toFixed(3)} m high, the mask stands proud of the turret front`);
  probes++;
}
cv90.dispose?.();
console.log(`cv90TurretSeating.selftest: CV90 Mk 4 sight head on its neck, side plates on the shell, CV90 gun mask meeting the turret front (${probes} probes) PASS`);
