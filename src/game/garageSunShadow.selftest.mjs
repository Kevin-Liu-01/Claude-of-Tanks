// garage-env-276 (class 1, Main's ruling 2): the Garage sun throws the hero's cast shadow where the camera sees it.
// One azimuth for every open yard, derived from the presentation pose (garageSkyPresets.ts GARAGE_SUN_AZIMUTH_DEG): a
// three-quarter back light on the side that lays the shadow forward across the turntable, clear of the hull. The
// geometry: the hull's box on the deck, its shadow cast onto the deck plane along the sun, seen from the presentation
// camera; the footprint's share outside the hull's own floor that lands in frame and outside the hull's silhouette.
// 1. every open yard's sun (its elevation, the one azimuth), a short and a long hull: at least 70 % of the footprint shows in the
//    default view, most of it on the turntable;
// 2. the orbit's quarter turns (the camera about the hero): the footprint shows from the first; from the far side the
//    hull hides it (a fixed sun's geometry; the numbers are printed);
// 3. planted control: the other side's back light (163 degrees, four yards' old trim) hides much of it behind the hull.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_PRESENTATION_POSE as POSE, GARAGE_PLATFORM_GEOMETRY } from './garagePresentationPose.ts';
import { GARAGE_SUN_AZIMUTH_DEG, GARAGE_SUN_BACK_OFFSET_DEG, GARAGE_SUN_TRIM } from './garageSkyPresets.ts';

const DECK = GARAGE_PLATFORM_GEOMETRY.topYM, DECK_R = GARAGE_PLATFORM_GEOMETRY.deckRadiusM;
const HULLS = { short: [3.2, 2.2, 5.6], long: [3.7, 2.9, 9.6] };

function camera(turnRad) {
  const [ox, oy, oz] = POSE.cameraOffsetM, c = Math.cos(turnRad), s = Math.sin(turnRad);
  const cam = new THREE.PerspectiveCamera(POSE.cameraFovDeg, 16 / 9, 0.1, 500);
  cam.position.set(ox * c + oz * s, oy, -ox * s + oz * c);
  cam.lookAt(0, POSE.cameraLookHeightM, 0);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
}
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function inside(poly, [x, y]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
/** The share of the hull's cast shadow (outside its own floor) that shows from this camera, and the share on the deck. */
function footprint(hull, elevationDeg, azimuthDeg, cam) {
  const [w, h, l] = hull;
  const corners = [];
  for (const x of [-w / 2, w / 2]) for (const y of [DECK, DECK + h]) for (const z of [-l / 2, l / 2]) corners.push(new THREE.Vector3(x, y, z));
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevationDeg), THREE.MathUtils.degToRad(azimuthDeg));
  const shadow = convexHull(corners.map((c) => { const t = (c.y - DECK) / sun.y; return [c.x - sun.x * t, c.z - sun.z * t]; }));
  const screen = (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(cam); return [p.x, p.y]; };
  const silhouette = convexHull(corners.map((c) => screen(c.x, c.y, c.z)));
  let cast = 0, shown = 0, onDeck = 0;
  for (let x = -20; x <= 20; x += 0.1) for (let z = -20; z <= 20; z += 0.1) {
    if (!inside(shadow, [x, z]) || (Math.abs(x) <= w / 2 && Math.abs(z) <= l / 2)) continue;
    cast += 1;
    const p = screen(x, DECK, z);
    if (Math.abs(p[0]) > 1 || Math.abs(p[1]) > 1 || inside(silhouette, p)) continue;
    shown += 1;
    if (Math.hypot(x, z) <= DECK_R) onDeck += 1;
  }
  return { shown: shown / cast, onDeck: onDeck / cast };
}

assert.equal(GARAGE_SUN_AZIMUTH_DEG, 283, 'the one azimuth: the camera\'s back axis (223 degrees) turned 60');
assert.equal(GARAGE_SUN_BACK_OFFSET_DEG, 60);
const view = camera(0);
const rows = [];
for (const [mapId, trim] of Object.entries(GARAGE_SUN_TRIM)) {
  assert.equal(trim.sunAzimuthDeg, GARAGE_SUN_AZIMUTH_DEG, `${mapId}: the one azimuth`);
  for (const [name, hull] of Object.entries(HULLS)) {
    // 1. the default view
    const seen = footprint(hull, trim.sunElevationDeg, trim.sunAzimuthDeg, view);
    assert.ok(seen.shown >= 0.7, `${mapId} ${name}: the hero's shadow shows in the default view (${(seen.shown * 100).toFixed(0)} %)`);
    assert.ok(seen.onDeck >= 0.55, `${mapId} ${name}: most of it across the turntable (${(seen.onDeck * 100).toFixed(0)} %)`);
    // 2. the orbit's quarter turns
    const turns = [1, 2, 3].map((k) => footprint(hull, trim.sunElevationDeg, trim.sunAzimuthDeg, camera(k * Math.PI / 2)).shown);
    // (a sun fixed in the world lays the shadow toward the default camera: from the far side of the orbit the hull hides
    // it, which no fixed sun avoids; a sun turning with the camera would swing every shadow in the yard as it orbits)
    assert.ok(turns[0] >= 0.6, `${mapId} ${name}: and from the orbit's first quarter turn (${turns.map((v) => (v * 100).toFixed(0)).join('/')} %)`);
    rows.push(`${mapId} ${name} ${(seen.shown * 100).toFixed(0)} % (deck ${(seen.onDeck * 100).toFixed(0)} %; turns ${turns.map((v) => (v * 100).toFixed(0)).join('/')} %)`);
  }
}
// 3. the planted control: the other side's back light
const control = footprint(HULLS.long, 32, 163, view);
assert.ok(control.shown < 0.4, `the other side's back light hides the shadow behind the hull (${(control.shown * 100).toFixed(0)} %)`);

console.log(`garageSunShadow.selftest: one Garage sun azimuth (${GARAGE_SUN_AZIMUTH_DEG}) shows the hero's shadow in the default view `
  + `for every open yard and both hulls; the old 163 degrees showed ${(control.shown * 100).toFixed(0)} % PASS\n  ${rows.join('\n  ')}`);
