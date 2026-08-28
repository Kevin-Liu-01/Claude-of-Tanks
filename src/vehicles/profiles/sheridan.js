// First-party procedural M551 Sheridan. The hull proportions were measured
// from a local comparison print, while all topology here is built from the
// shared primitive kit and remains independent of that source asset.

import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KIT, FITTINGS, muzzleBore } from './kit.js';

const D2R = Math.PI / 180;
const SHERIDAN_X_SCALE = 2.82 / 3.04;
const SHERIDAN_Y_SCALE = 0.965;
const SHERIDAN_TURRET_X_SCALE = 1.028;
const SHERIDAN_HULL_CREASE_DEG = 16;
const SHERIDAN_TURRET_CREASE_DEG = 13;
const SHERIDAN_END_WHEEL_SCALE = 1.25;
const SHERIDAN_REAR_FUEL_Z = -3.12;
const SHERIDAN_RETURN_ROLLERS = Object.freeze([
  Object.freeze({ z: 1.45, y: 0.926, r: 0.095 }),
  Object.freeze({ z: 0.00, y: 0.945, r: 0.095 }),
  Object.freeze({ z: -1.45, y: 0.964, r: 0.095 }),
]);
const SHERIDAN_TURRET_ROOF_PLAN = Object.freeze([
  [0.0619, -0.9573], [0.4054, -0.7439], [0.5562, -0.3040], [0.7030, 0.1371],
  [0.6089, 0.5674], [0.1998, 0.7885], [-0.2139, 0.7928], [-0.5984, 0.5314],
  [-0.8565, 0.1602], [-1.0148, -0.2725], [-0.8026, -0.6722], [-0.3950, -0.8889],
]);

// Connected procedural shell through independently measured horizontal
// sections. Unlike polyMultiLoft, this does not assume every higher section is
// a uniform scale of the widest ring—an assumption that turns Sheridan's
// offset cast turret into a generic dome. The points remain a deliberately
// sparse first-party reconstruction; no source triangles or indices are used.
function measuredRingLoft(rings) {
  const count = rings[0].points.length;
  if (rings.length < 2 || rings.some((ring) => ring.points.length !== count)) {
    throw new Error('measuredRingLoft requires equally sampled rings');
  }
  const loops = rings.map((ring) => ring.points.map(([x, z]) => [
    x * (ring.xScale ?? 1) * SHERIDAN_TURRET_X_SCALE, ring.y, z,
  ]));
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let ring = 0; ring < loops.length - 1; ring++) {
    const lower = loops[ring];
    const upper = loops[ring + 1];
    const cx = lower.reduce((sum, point) => sum + point[0], 0) / count;
    const cz = lower.reduce((sum, point) => sum + point[2], 0) / count;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const mx = (lower[i][0] + lower[j][0]) / 2 - cx;
      const mz = (lower[i][2] + lower[j][2]) / 2 - cz;
      const ex = lower[j][0] - lower[i][0];
      const ez = lower[j][2] - lower[i][2];
      if (ex * mz - ez * mx > 0) {
        tri(lower[i], lower[j], upper[j]);
        tri(lower[i], upper[j], upper[i]);
      } else {
        tri(lower[j], lower[i], upper[i]);
        tri(lower[j], upper[i], upper[j]);
      }
    }
  }
  const cap = (loop, top) => {
    const center = [
      loop.reduce((sum, point) => sum + point[0], 0) / count,
      loop[0][1],
      loop.reduce((sum, point) => sum + point[2], 0) / count,
    ];
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      if (top) tri(loop[i], loop[j], center);
      else tri(loop[j], loop[i], center);
    }
  };
  cap(loops[0], false);
  cap(loops.at(-1), true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Connected hull shell through sparse measured transverse sections. Station
// points are supplied in final world metres and inversely pre-scaled here so
// the production hull articulation root can retain the fleet-wide Sheridan
// width/height correction used by its wheels, fittings and decals.
function measuredStationLoft(stations) {
  if (stations.length < 2 || stations.some((station) => station.points.length < 3)) {
    throw new Error('measuredStationLoft requires at least two closed station outlines');
  }
  const count = 24;
  const resample = (source) => {
    let points = source.slice();
    const area = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0);
    if (area < 0) points.reverse();
    const minY = Math.min(...points.map((point) => point[1]));
    const candidates = points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => Math.abs(point[1] - minY) < 1e-4);
    const start = candidates.reduce((best, item) => (
      item.point[0] < best.point[0] ? item : best
    )).index;
    points = points.slice(start).concat(points.slice(0, start));
    const lengths = [];
    let perimeter = 0;
    for (let index = 0; index < points.length; index++) {
      const next = points[(index + 1) % points.length];
      const length = Math.hypot(next[0] - points[index][0], next[1] - points[index][1]);
      lengths.push(length);
      perimeter += length;
    }
    const result = [];
    let edge = 0;
    let edgeStart = 0;
    for (let sample = 0; sample < count; sample++) {
      const distance = perimeter * sample / count;
      while (edge < lengths.length - 1 && distance > edgeStart + lengths[edge]) {
        edgeStart += lengths[edge++];
      }
      const left = points[edge];
      const right = points[(edge + 1) % points.length];
      const t = lengths[edge] > 1e-8 ? (distance - edgeStart) / lengths[edge] : 0;
      result.push([
        left[0] + (right[0] - left[0]) * t,
        left[1] + (right[1] - left[1]) * t,
      ]);
    }
    return result;
  };
  const loops = stations.map((station) => resample(station.points).map(([x, y]) => [
    x / SHERIDAN_X_SCALE,
    y / SHERIDAN_Y_SCALE,
    station.z,
  ]));
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let station = 0; station < loops.length - 1; station++) {
    const rear = loops[station];
    const front = loops[station + 1];
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      tri(rear[i], rear[j], front[j]);
      tri(rear[i], front[j], front[i]);
    }
  }
  const cap = (loop, front) => {
    const center = [
      loop.reduce((sum, point) => sum + point[0], 0) / count,
      loop.reduce((sum, point) => sum + point[1], 0) / count,
      loop[0][2],
    ];
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      if (front) tri(loop[i], loop[j], center);
      else tri(loop[j], loop[i], center);
    }
  };
  cap(loops[0], false);
  cap(loops.at(-1), true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Extrude one measured longitudinal side profile between its inner and outer
// X planes. This captures the separate sponson/side-shell objects in the
// comparison print; those objects reach the track faces even though the main
// center hull casting does not. A single wide hull scale cannot reproduce
// that relationship without also moving the wheels and track lanes.
function measuredSideCourse(side, innerX, outerX, profile) {
  const shape = profile.map(([z, y]) => new THREE.Vector2(z, y));
  const faces = THREE.ShapeUtils.triangulateShape(shape, []);
  const xs = [side * innerX / SHERIDAN_X_SCALE, side * outerX / SHERIDAN_X_SCALE];
  const loops = xs.map((x) => profile.map(([z, y]) => [x, y / SHERIDAN_Y_SCALE, z]));
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (const [a, b, c] of faces) {
    if (side > 0) {
      tri(loops[1][a], loops[1][b], loops[1][c]);
      tri(loops[0][c], loops[0][b], loops[0][a]);
    } else {
      tri(loops[1][c], loops[1][b], loops[1][a]);
      tri(loops[0][a], loops[0][b], loops[0][c]);
    }
  }
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length;
    tri(loops[0][i], loops[1][i], loops[1][j]);
    tri(loops[0][i], loops[1][j], loops[0][j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Shallow structural course from a measured transverse X/Y outline. The
// source Sheridan turret is the visible union of several overlapping cast
// sections; reconstructing only the largest horizontal loft leaves holes in
// the canonical front/rear silhouettes even when every ring extent matches.
function measuredTransverseCourse(profile, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], profile[0][1]);
  for (let index = 1; index < profile.length; index++) {
    shape.lineTo(profile[index][0], profile[index][1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

// Thin articulated plate extruded between measured X planes from a sparse
// longitudinal Z/Y outline. The M81 recoil mechanism includes one such
// stepped side plate that cannot be represented by a box without filling the
// wrong voids around the breech. Coordinates stay in the authored gun-pivot
// frame and deliberately describe only the exterior course, not source
// triangles or indices.
function measuredGunSidePlate(profile, minX, maxX) {
  const shape = profile.map(([z, y]) => new THREE.Vector2(z, y));
  const faces = THREE.ShapeUtils.triangulateShape(shape, []);
  const loops = [minX, maxX].map((x) => profile.map(([z, y]) => [x, y, z]));
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (const [a, b, c] of faces) {
    tri(loops[1][a], loops[1][b], loops[1][c]);
    tri(loops[0][c], loops[0][b], loops[0][a]);
  }
  for (let index = 0; index < profile.length; index++) {
    const next = (index + 1) % profile.length;
    tri(loops[0][index], loops[1][index], loops[1][next]);
    tri(loops[0][index], loops[1][next], loops[0][next]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
    new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Closed M81 mantlet shell with a short forward face. The former mask ended
// in a zero-height ridge, making each side a triangle. Keeping a reduced but
// finite front height turns that side elevation into the requested trapezoid
// while retaining the Sheridan's straight, faceted casting language.
function forwardTrapezoidGunMask({
  rearHalfWidth, rearHalfHeight, frontHalfWidth, frontHalfHeight, rearZ, frontZ,
}) {
  if (rearHalfWidth <= 0 || rearHalfHeight <= 0
    || frontHalfWidth <= 0 || frontHalfHeight <= 0 || frontZ <= rearZ) {
    throw new RangeError('forwardTrapezoidGunMask expects positive dimensions and a forward face');
  }
  const rear = [
    [-rearHalfWidth, -rearHalfHeight, rearZ],
    [rearHalfWidth, -rearHalfHeight, rearZ],
    [rearHalfWidth, rearHalfHeight, rearZ],
    [-rearHalfWidth, rearHalfHeight, rearZ],
  ];
  const front = [
    [-frontHalfWidth, -frontHalfHeight, frontZ],
    [frontHalfWidth, -frontHalfHeight, frontZ],
    [frontHalfWidth, frontHalfHeight, frontZ],
    [-frontHalfWidth, frontHalfHeight, frontZ],
  ];
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  const quad = (a, b, c, d) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  quad(rear[0], rear[3], rear[2], rear[1]);
  quad(front[0], front[1], front[2], front[3]);
  quad(rear[3], front[3], front[2], rear[2]);
  quad(rear[0], rear[1], front[1], front[0]);
  quad(rear[0], front[0], front[3], rear[3]);
  quad(rear[1], rear[2], front[2], front[1]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
    new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Build a cylinder on a measured 3D centerline. Three.js cylinders point up
// local +Y; reference fittings such as Sheridan's smoke dischargers are both
// pitched and splayed, so two Euler guesses cannot preserve their surveyed
// endpoints. Keeping the centerline explicit also lets collars and bores share
// exactly the same axis without visible kinks.
function cylinderOnAxis(center, axis, length, radius, segments, radiusTop = radius) {
  const geometry = KIT.cylY(radiusTop, radius, length, segments);
  const direction = new THREE.Vector3(...axis).normalize();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), direction));
  geometry.translate(...center);
  geometry.computeBoundingBox();
  return geometry;
}

// Rotate a primitive through a measured orthonormal basis. The source
// stowage packs are pitched, rolled and yawed together; a single yaw value
// preserves their plan footprint but still overfills the direct side mask.
// Reconstructing only the PCA frame and envelope keeps this first-party and
// sparse while retaining all three surveyed axes.
function boxOnBasis(size, axisX, axisY) {
  const x = new THREE.Vector3(...axisX).normalize();
  const y = new THREE.Vector3(...axisY).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  y.crossVectors(z, x).normalize();
  const geometry = KIT.box(...size);
  geometry.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  geometry.computeBoundingBox();
  return geometry;
}

// Source-measured commander's M2 installation. The comparison mesh stores
// the weapon and its open ammunition cradle as separate islands. Treating
// their combined bounds as one solid box produced a 570 mm-wide block where
// the real installation is only 162 mm across. Rebuild the connected members
// from their individual envelopes and retain one fitting marker for the
// equipment census.
function measuredCommanderM2(P) {
  const group = new THREE.Group();
  const darkParts = [];
  const detailParts = [];
  const ammoBoxParts = [];
  const turretPivotY = 1.466;
  const ly = (worldY) => worldY - turretPivotY;

  // Twin rear cradle rails: source Object_8, X=-0.533/-0.466 m,
  // Y=2.737..2.876 m, Z=-0.096..0.491 m.
  for (const x of [-0.530, -0.470]) {
    darkParts.push(KIT.xform(KIT.box(0.008, 0.139, 0.587),
      x, ly(2.8065), 0.1975));
  }
  darkParts.push(KIT.xform(KIT.box(0.074, 0.030, 0.045),
    -0.500, ly(2.755), -0.073));

  // Object_8 components 12/13 and 22..28 close the rear of that cradle with
  // a small rectangular yoke at Z=-.151 m. Omitting it made the side mask
  // stop 428 mm below the source at this station even though the long cradle
  // rails themselves were correct. Retain the measured open center rather
  // than replacing the yoke with a solid plate.
  for (const x of [-0.5631, -0.4329]) {
    darkParts.push(KIT.xform(KIT.box(0.0282, 0.1259, 0.0330),
      x, ly(2.8132), -0.1506));
  }
  for (const worldY of [2.7565, 2.8695]) {
    darkParts.push(KIT.xform(KIT.box(0.1394, 0.0060, 0.0463),
      -0.4980, ly(worldY), -0.1189));
  }
  // Left charging handle, component 35, is the source's X=-.654 m front
  // height tell. Its compact envelope is enough; no generic oversized grip.
  darkParts.push(KIT.xform(KIT.box(0.1064, 0.0294, 0.0146),
    -0.6010, ly(2.8574), 0.1728));

  // Open ammunition cradle: the broad rear plate and two narrow side rails
  // reproduce Object_9 without filling its 343 mm-deep open center.
  detailParts.push(KIT.xform(KIT.box(0.162, 0.186, 0.058),
    -0.498, ly(2.719), 0.466));
  detailParts.push(KIT.xform(KIT.box(0.150, 0.022, 0.112),
    -0.498, ly(2.807), 0.438));
  for (const x of [-0.565, -0.431]) {
    darkParts.push(KIT.xform(KIT.box(0.006, 0.089, 0.343),
      x, ly(2.753), 0.259));
  }
  detailParts.push(KIT.xform(KIT.box(0.066, 0.036, 0.066),
    -0.501, ly(2.623), 0.468));

  // Object_9 continues inboard as the ammunition-can rack. The earlier pass
  // reconstructed only its cage, leaving a conspicuous empty hole beside the
  // receiver. Seat a closed M2 ammunition can inside the measured rack and
  // retain the thin rails as its load-bearing frame.
  for (const y of [2.660, 2.832]) {
    for (const z of [0.310, 0.480]) {
      darkParts.push(KIT.xform(KIT.box(0.366, 0.012, 0.012),
        -0.220, ly(y), z));
    }
  }
  for (const x of [-0.398, -0.040]) {
    for (const z of [0.310, 0.480]) {
      darkParts.push(KIT.xform(KIT.box(0.012, 0.184, 0.012),
        x, ly(2.746), z));
    }
  }
  for (const x of [-0.188, -0.092]) {
    darkParts.push(KIT.xform(KIT.box(0.166, 0.012, 0.012),
      x, ly(2.861), 0.395, 0, 0, -0.57));
  }
  ammoBoxParts.push(KIT.xform(KIT.box(0.342, 0.164, 0.154),
    -0.220, ly(2.746), 0.395));
  // Proud folded lid, receiver-side feed bridge and two small latches make
  // the can read as a serviceable enclosure rather than another solid greeble.
  ammoBoxParts.push(KIT.xform(KIT.box(0.354, 0.018, 0.166),
    -0.220, ly(2.837), 0.395));
  ammoBoxParts.push(KIT.xform(KIT.box(0.074, 0.058, 0.090),
    -0.428, ly(2.790), 0.430));
  for (const z of [0.350, 0.440]) {
    darkParts.push(KIT.xform(KIT.box(0.020, 0.030, 0.018),
      -0.046, ly(2.795), z));
  }

  // Receiver, cooling sleeve, barrel and muzzle follow the measured
  // X=-0.500 m axis. Their Z breaks are the connected-component endpoints
  // from Object_8, rather than a visually guessed traverse angle.
  darkParts.push(KIT.xform(KIT.box(0.081, 0.089, 0.258),
    -0.498, ly(2.807), 0.615));
  darkParts.push(KIT.xform(KIT.cylZ(0.031, 0.056, P.q ? 18 : 12),
    -0.498, ly(2.807), 0.755));
  darkParts.push(KIT.xform(KIT.cylZ(0.019, 0.624, P.q ? 14 : 10),
    -0.498, ly(2.807), 1.095));
  darkParts.push(KIT.xform(KIT.cylZ(0.038, 0.070, P.q ? 18 : 12),
    -0.498, ly(2.807), 1.442));
  darkParts.push(KIT.xform(KIT.cylZ(0.013, 0.016, 10),
    -0.498, ly(2.807), 1.485));

  // Pivot yoke and column bury into the commander's hatch rim.
  darkParts.push(KIT.xform(KIT.cylX(0.050, 0.112, P.q ? 16 : 10),
    -0.498, ly(2.733), 0.518));
  // The source stores the pintle as several close-but-disconnected scan
  // islands.  The playable assembly needs a real load path: extend the
  // vertical spindle from the hatch bearing to the yoke and join its
  // forward offset with a short diagonal brace.  Both members stay inside
  // the measured Object_8 envelope (X -0.533..-0.466, world Y
  // 2.414..2.783, Z 0.286..0.526).
  darkParts.push(KIT.xform(KIT.cylY(0.023, 0.031, 0.269, P.q ? 14 : 10),
    -0.498, 1.0865, 0.290));
  darkParts.push(KIT.xform(KIT.box(0.046, 0.050, 0.252),
    -0.498, 1.195, 0.404, -0.736, 0, 0));
  darkParts.push(KIT.xform(KIT.cylY(0.055, 0.060, 0.022, P.q ? 16 : 10),
    -0.498, 0.968, 0.290));

  const addMesh = (name, parts, material, appearanceRole) => {
    const geometry = KIT.mergeAll(parts);
    geometry.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.appearanceRole = appearanceRole;
    group.add(mesh);
  };
  addMesh('sheridanCommanderM2Body', darkParts, P.mats.dark, 'machineGun');
  addMesh('sheridanCommanderM2AmmoCradle', detailParts, P.mats.detail, 'ammoBox');
  addMesh('sheridanCommanderM2AmmoBox', ammoBoxParts, P.mats.detail, 'ammoBox');
  FITTINGS.markExact(group, 'pintleMG');
  return group;
}

// Purpose-built remote 30 mm station for the M551A1 TTS. This deliberately
// does not reuse the AbramsX XM914 silhouette: a low hexagonal turntable,
// split asymmetric shield, side ammunition coffin and separate sight head
// give the Sheridan demonstrator its own compact airborne-vehicle solution.
// The group remains one exact fitting for equipment census purposes.
function sheridanTtsAutocannon(P) {
  const group = new THREE.Group();
  group.name = 'm551a1TtsRemoteAutocannon';
  group.userData.remoteControlled = true;
  group.userData.caliberMm = 30;

  const body = [];
  const dark = [];
  const detail = [];
  const glass = [];
  const { box, cylX, cylY, cylZ, frustum, torus, xform, mergeAll } = KIT;

  // Foundation is buried through the commander's roof ring so the station
  // has a visible load path instead of hovering over the old manned mount.
  body.push(xform(cylY(0.285, 0.335, 0.185, P.q ? 20 : 14), -0.49, 0.846, -0.43));
  dark.push(xform(torus(0.275, 0.030, P.q ? 22 : 16), -0.49, 0.942, -0.43));
  body.push(xform(frustum(0.31, 0.27, -0.28, 0.27, 0.24, -0.24, 0.93, 1.16),
    -0.49, 0, -0.43));
  dark.push(xform(cylX(0.085, 0.66, P.q ? 18 : 12), -0.49, 1.205, -0.28));

  // Breech and recoil cradle. Angled cheek plates leave a service gap below
  // the weapon while the top bridge joins both halves along a straight line.
  body.push(xform(box(0.46, 0.25, 0.58), -0.49, 1.30, -0.06));
  for (const side of [-1, 1]) {
    body.push(xform(box(0.115, 0.49, 0.66), -0.49 + side * 0.285, 1.34, -0.06,
      0, 0, side * 0.18));
    dark.push(xform(box(0.040, 0.30, 0.48), -0.49 + side * 0.215, 1.31, -0.02));
  }
  body.push(xform(box(0.62, 0.09, 0.62), -0.49, 1.59, -0.06));
  detail.push(xform(box(0.54, 0.025, 0.54), -0.49, 1.648, -0.06));

  // 30 mm barrel, articulated sleeve and block muzzle all face vehicle +Z.
  dark.push(xform(cylZ(0.055, 1.18, P.q ? 20 : 14), -0.49, 1.345, 0.80));
  body.push(xform(cylZ(0.095, 0.28, P.q ? 20 : 14), -0.49, 1.345, 0.30));
  dark.push(xform(cylZ(0.073, 0.12, P.q ? 18 : 12), -0.49, 1.345, 1.43));
  dark.push(xform(cylZ(0.025, 0.020, P.q ? 14 : 10), -0.49, 1.345, 1.50));
  for (const z of [0.45, 0.67, 0.89]) {
    detail.push(xform(torus(0.064, 0.010, P.q ? 18 : 12), -0.49, 1.345, z));
  }

  // Asymmetric ammunition coffin and protected feed bridge distinguish the
  // TTS station from the AbramsX's open feed-wheel architecture.
  body.push(xform(box(0.36, 0.42, 0.54), -0.88, 1.34, -0.16, 0, -0.08, 0));
  detail.push(xform(box(0.38, 0.035, 0.56), -0.88, 1.565, -0.16, 0, -0.08, 0));
  dark.push(xform(box(0.16, 0.13, 0.28), -0.70, 1.42, 0.10, 0, -0.28, 0));
  for (const y of [1.23, 1.43]) {
    detail.push(xform(box(0.025, 0.025, 0.46), -1.07, y, -0.16, 0, -0.08, 0));
  }

  // Independent gun-right EO head with two apertures and a laser-warning
  // crown. It is armored, but remains visibly separate from the feed box.
  body.push(xform(box(0.28, 0.34, 0.30), -0.11, 1.43, -0.12, 0, 0.10, 0));
  dark.push(xform(box(0.245, 0.27, 0.028), -0.095, 1.43, 0.045, 0, 0.10, 0));
  glass.push(xform(box(0.095, 0.105, 0.024), -0.145, 1.48, 0.066, 0, 0.10, 0));
  glass.push(xform(box(0.060, 0.060, 0.024), -0.035, 1.37, 0.075, 0, 0.10, 0));
  detail.push(xform(cylY(0.045, 0.055, 0.085, P.q ? 14 : 10), -0.11, 1.645, -0.12));

  // Painted armor and fittings must enter the normal profile buckets. Those
  // buckets apply one vehicle-space box projection after merge; attaching the
  // raw meshes directly to the articulated group would restart with white
  // vertex colors and make the station look like an unpainted proxy.
  P.addEquipment('turret', mergeAll(body));
  P.add('turretDetail', mergeAll(detail));
  P.add('turretGlass', mergeAll(glass));

  const addMesh = (name, parts, material, appearanceRole) => {
    const geometry = mergeAll(parts);
    geometry.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.appearanceRole = appearanceRole;
    group.add(mesh);
  };
  addMesh('m551a1TtsAutocannonMechanism', dark, P.mats.dark, 'machineGun');
  FITTINGS.markExact(group, 'pintleMG');
  return group;
}

function buildSheridanTtsUpgrade(P) {
  const { box, cylY, cylZ, torus, xform } = KIT;

  // The rear deck extension overlaps the original stern by 0.59 m and stays
  // wholly above the unchanged sprocket/track course. Sparse straight
  // stations retain the welded Sheridan language instead of rounding the
  // extension into a generic engine pod.
  P.add('hull', toCreasedNormals(measuredStationLoft([
    { z: -3.62, points: [
      [-1.18, 1.13], [1.18, 1.13], [1.30, 1.27], [1.22, 1.51],
      [0.78, 1.60], [-0.78, 1.60], [-1.22, 1.51], [-1.30, 1.27],
    ] },
    { z: -3.28, points: [
      [-1.22, 1.12], [1.22, 1.12], [1.34, 1.28], [1.29, 1.55],
      [0.82, 1.64], [-0.82, 1.64], [-1.29, 1.55], [-1.34, 1.28],
    ] },
    { z: -2.55, points: [
      [-1.22, 1.13], [1.22, 1.13], [1.38, 1.30], [1.32, 1.57],
      [0.82, 1.65], [-0.82, 1.65], [-1.32, 1.57], [-1.38, 1.30],
    ] },
  ]), SHERIDAN_HULL_CREASE_DEG * D2R));

  // Split grille banks, armored APU and electronics enclosures sit directly
  // on the new deck. Their bases penetrate the 1.60 m crown by 20–35 mm.
  for (const x of [-0.48, 0.15]) {
    P.add('hullDark', box(0.52, 0.026, 0.72), x, 1.626, -3.08);
    for (let index = 0; index < 7; index++) {
      P.add('hullDetail', box(0.46, 0.020, 0.030), x, 1.644,
        -3.36 + index * 0.09);
    }
  }
  P.addEquipment('hull', box(0.48, 0.25, 0.62), 0.86, 1.72, -3.03, 0, -0.05, 0);
  P.add('hullDark', box(0.43, 0.035, 0.57), 0.86, 1.858, -3.03, 0, -0.05, 0);
  P.addEquipment('hull', box(0.40, 0.19, 0.42), -0.92, 1.69, -3.18, 0, 0.08, 0);
  P.add('hullDetail', box(0.34, 0.025, 0.36), -0.92, 1.798, -3.18, 0, 0.08, 0);
  for (const x of [-1.08, 0, 1.08]) {
    P.add('hullDark', box(0.055, 0.22, 0.82), x, 1.54, -3.16, 0.05, 0, 0);
  }

  // Full-width upper-side applique and a second glacis course. These are
  // damageable ERA sectors with the fleet-standard two-layer camouflaged
  // cassette construction supplied by eraCluster.
  P.eraCluster('m551a1_tts_glacis_era', (put) => {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        put((col - 2.5) * 0.40, 1.40 + row * 0.18, 2.38 - row * 0.37,
          -25 * D2R, 0, 0, 1.28, 1.28, 0.64);
      }
    }
  });
  for (const side of [-1, 1]) {
    P.addExternalArmor('hull', box(0.075, 0.24, 5.72), side * 1.435, 1.38, -0.28);
    P.eraCluster(`m551a1_tts_hull_era_${side > 0 ? 'R' : 'L'}`, (put) => {
      for (let index = 0; index < 12; index++) {
        put(side * 1.475, 1.41, 2.24 - index * 0.48,
          0, side * Math.PI / 2, 0, 1.32, 1.35, 0.62);
      }
    });
  }

  // Angular armored bustle and cheek shoulders establish the variant's new
  // turret mass while overlapping the original cast shell on every seam.
  P.add('turret', box(2.30, 0.58, 0.96), 0, 0.48, -1.31);
  P.add('turret', box(1.86, 0.22, 0.82), 0, 0.83, -1.26, -0.05, 0, 0);
  for (const side of [-1, 1]) {
    P.add('turret', box(0.26, 0.58, 1.22), side * 1.13, 0.45, 0.58,
      0, -side * 0.28, 0);
    P.addExternalArmor('turret', box(0.13, 0.50, 1.18), side * 1.27, 0.48, 0.52,
      0, -side * 0.28, 0);
    P.eraCluster(`m551a1_tts_turret_era_${side > 0 ? 'R' : 'L'}`, (put) => {
      for (let index = 0; index < 6; index++) {
        put(side * (1.29 - index * 0.075), 1.92 + index * 0.018,
          0.18 + index * 0.22, 0, side * (1.22 - index * 0.11), 0,
          1.10, 1.40, 0.72);
      }
    }, true);
  }
  P.eraCluster('m551a1_tts_turret_roof_era', (put) => {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        put((col - 1.5) * 0.40, 2.292, 0.50 - row * 0.42,
          -Math.PI / 2, 0, 0, 1.25, 1.25, 0.55);
      }
    }
  }, true);

  // Large protected searchlight to gun-right, as in the supplied silhouette.
  // A deep bracket crosses into the cheek; the lens is proud of the housing.
  P.addEquipment('turret', box(0.48, 0.54, 0.40), 0.66, 0.56, 1.32, 0, -0.04, 0);
  P.add('turretDark', box(0.43, 0.49, 0.035), 0.66, 0.56, 1.535, 0, -0.04, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.35, 0.40, 0.026),
    0.66, 0.56, 1.558, 0, -0.04, 0);
  P.add('turretDetail', box(0.14, 0.20, 0.46), 0.39, 0.41, 1.23, 0, -0.22, 0);
  for (const side of [-1, 1]) {
    P.add('turretDark', cylY(0.035, 0.035, 0.64, P.q ? 14 : 10),
      0.66 + side * 0.27, 0.56, 1.34);
  }

  // Additional armored lamp emplacements, laser-warning nodes and roof
  // electronics reinforce the high-technology TTS read without changing the
  // underlying running gear.
  for (const side of [-1, 1]) {
    P.addEquipment('hull', box(0.32, 0.22, 0.25), side * 1.02, 1.38, 2.52,
      -0.14, 0, 0);
    P.add('hullDark', box(0.27, 0.17, 0.025), side * 1.02, 1.39, 2.66,
      -0.14, 0, 0);
    P.add('hullGlass', box(0.19, 0.10, 0.020), side * 1.02, 1.40, 2.678,
      -0.14, 0, 0);
    P.addEquipment('turret', xform(cylY(0.075, 0.090, 0.15, P.q ? 16 : 10),
      0, 0, 0, 0, 0, 0), side * 0.82, 0.90, -0.72);
    P.add('turretGlass', box(0.11, 0.07, 0.020), side * 0.82, 0.92, -0.63);
  }
  P.addEquipment('turret', box(0.46, 0.26, 0.46), 0.44, 0.99, -0.52, 0, 0.10, 0);
  P.add('turretGlass', box(0.28, 0.13, 0.025), 0.44, 1.01, -0.275, 0, 0.10, 0);
  P.add('turretDark', cylY(0.050, 0.070, 0.50, P.q ? 16 : 10),
    -0.96, 1.10, -1.48);
  P.add('turretDetail', cylY(0.014, 0.014, 1.42, P.q ? 12 : 8),
    -0.96, 2.04, -1.48);

  P.turretG.add(sheridanTtsAutocannon(P));
  return {
    rearDeckEndZ: -3.62,
    runningGearReused: true,
    remoteAutocannonCaliberMm: 30,
    largeGunRightSearchlight: true,
    additionalEraCassettes: 56,
    rearFuelDrums: 0,
  };
}

const hullSection = (bottomHalf, bottomY, beltHalf, beltY, sideHalf, sideY, roofHalf, roofY) => [
  [-roofHalf, roofY], [-sideHalf, sideY], [-beltHalf, beltY], [-bottomHalf, bottomY],
  [bottomHalf, bottomY], [beltHalf, beltY], [sideHalf, sideY], [roofHalf, roofY],
];

function buildSheridan(P) {
  const {
    xform, box, cylX, cylY, cylZ, sph, torus, frustum,
    buildRunningGear, fenders, headlight, liftEye, periscope,
  } = KIT;
  const isTts = P.spec.id === 'm551a1_tts';

  // Amphibious aluminum hull rebuilt from eleven source-derived convex
  // transverse sections. The lower courses form a deliberate recessed track
  // pocket: the belly stays inboard of the visible shoe lane, then steps
  // horizontally out to the upper sponson above the complete return run.
  // This preserves the pointed shoulder breaks without hiding the tracks
  // behind a full-width wall or letting the 25%-larger end-wheel wraps pass
  // through the armor shell.
  P.add('hull', toCreasedNormals(measuredStationLoft([
    { z: -3.140, points: [
      [-0.805, 0.950], [-0.774, 0.925], [0.774, 0.925], [0.805, 0.950],
      [0.805, 0.960], [0.774, 0.988], [-0.774, 0.988], [-0.805, 0.960],
    ] },
    { z: -3.000, points: [
      [-1.390, 1.180], [-0.780, 1.180], [-0.780, 0.937], [-0.776, 0.920],
      [0.776, 0.920], [0.780, 0.937], [0.780, 1.180], [1.390, 1.180],
      [1.390, 1.241], [1.379, 1.294],
      [1.298, 1.325], [-1.298, 1.325], [-1.379, 1.294], [-1.390, 1.241],
    ] },
    { z: -2.700, points: [
      [-1.390, 1.180], [-0.780, 1.180], [-0.780, 0.903], [-0.770, 0.562],
      [0.770, 0.562], [0.780, 0.903], [0.780, 1.180], [1.390, 1.180],
      [1.390, 1.412], [1.372, 1.451],
      [1.324, 1.477], [0.785, 1.530], [-0.292, 1.543], [-0.785, 1.530],
      [-1.324, 1.477], [-1.372, 1.451], [-1.390, 1.412],
    ] },
    { z: -2.400, points: [
      [-1.401, 1.407], [-1.390, 1.180], [-0.780, 1.180], [-0.780, 0.672],
      [-0.770, 0.474], [0.770, 0.474], [0.780, 0.672], [0.780, 1.180],
      [1.390, 1.180], [1.401, 1.407],
      [1.397, 1.546], [1.376, 1.597], [1.346, 1.624], [1.292, 1.647],
      [0.439, 1.707], [0.196, 1.707], [-1.292, 1.647], [-1.346, 1.624],
      [-1.376, 1.597], [-1.397, 1.546], [-1.401, 1.422],
    ] },
    { z: -1.500, points: [
      [-1.390, 1.180], [-0.780, 1.180], [-0.780, 0.474], [0.780, 0.474],
      [0.780, 1.180], [1.390, 1.180],
      [1.390, 1.220], [1.390, 1.461], [1.382, 1.565], [1.365, 1.588],
      [1.309, 1.619], [1.236, 1.628], [-1.236, 1.628], [-1.309, 1.619],
      [-1.365, 1.588], [-1.382, 1.565], [-1.390, 1.461],
    ] },
    { z: 0.000, points: [
      [-1.395, 1.475], [-1.390, 1.180], [-0.780, 1.180], [-0.780, 0.474],
      [0.780, 0.474], [0.780, 1.180], [1.390, 1.180], [1.395, 1.475],
      [1.395, 1.491], [1.382, 1.565],
      [1.365, 1.588], [1.309, 1.619], [1.293, 1.624], [-1.293, 1.624],
      [-1.309, 1.619], [-1.365, 1.588], [-1.382, 1.565], [-1.395, 1.491],
    ] },
    { z: 1.500, points: [
      [-1.398, 1.432], [-1.390, 1.180], [-0.780, 1.180], [-0.780, 0.474],
      [0.780, 0.474], [0.780, 1.180], [1.390, 1.180], [1.398, 1.432],
      [1.393, 1.472], [1.373, 1.495],
      [1.313, 1.517], [0.345, 1.627], [0.000, 1.635], [-0.345, 1.627],
      [-1.313, 1.517], [-1.373, 1.495], [-1.393, 1.472],
    ] },
    { z: 2.400, points: [
      [-1.390, 1.180], [-0.780, 1.180], [-0.780, 0.474], [0.780, 0.474],
      [0.780, 1.180], [1.390, 1.180],
      [1.390, 1.210], [1.378, 1.220], [-1.378, 1.220], [-1.390, 1.210],
    ] },
    { z: 2.700, points: [
      [-1.390, 1.180], [-0.780, 1.180], [-0.780, 0.605], [0.780, 0.605],
      [0.780, 1.180], [1.390, 1.180],
      [1.390, 1.210], [1.083, 1.210], [-1.083, 1.210], [-1.390, 1.210],
    ] },
    { z: 3.000, points: [
      [-1.390, 1.190], [-0.720, 1.190], [-0.720, 1.030], [-0.700, 0.927],
      [0.700, 0.927], [0.720, 1.030], [0.720, 1.190], [1.390, 1.190],
      [1.390, 1.210], [1.289, 1.220],
      [-1.289, 1.220], [-1.390, 1.210],
    ] },
    { z: 3.080, points: [
      [-0.804, 0.960], [-0.796, 0.939], [-0.774, 0.930], [0.774, 0.930],
      [0.796, 0.939], [0.804, 0.960], [0.801, 0.968], [0.774, 0.988],
      [-0.774, 0.988], [-0.801, 0.968],
    ] },
  // Keep the amphibious shell's welded break lines readable. The earlier
  // 48-degree normal weld rounded together neighboring measured planes and
  // visually erased the pointed bow/shoulder intersections even though the
  // vertices were correct.
  ]), SHERIDAN_HULL_CREASE_DEG * D2R));
  // Object_24/25 store separate asymmetric engine-deck grille banks. The
  // former single 1.18 m panel crossed the center seam and shifted both
  // banks aft. Preserve each measured envelope and its own slat cadence.
  for (const [x, z, width, depth, slats] of [
    [ 0.37924, -1.77469, 0.60560, 0.73816, 7],
    [-0.37601, -1.87595, 0.60560, 0.94051, 9],
  ]) {
    P.add('hullDark', box(width, 0.018, depth), x, 1.6332, z);
    const usable = depth - 0.08;
    for (let index = 0; index < slats; index++) {
      const slatZ = z - usable * 0.5 + usable * index / (slats - 1);
      P.add('hullDetail', box(width - 0.045, 0.016, 0.026),
        x, 1.6475, slatZ);
    }
    P.add('hullDetail', box(0.022, 0.020, depth),
      x - width * 0.5 + 0.011, 1.6475, z);
    P.add('hullDetail', box(0.022, 0.020, depth),
      x + width * 0.5 - 0.011, 1.6475, z);
  }
  // Object_24 components 0..5 form one broad domed driver's hatch. Its
  // measured envelope is 0.821 x 0.394 x 0.421 m at Z=1.953 m; the former
  // 0.58 m flat disk was visibly the wrong component even though it occupied
  // little silhouette area. Sink the lower half of an original low-poly dome
  // through the glacis and retain the source's elliptical bearing footprint.
  P.addHatch('hull', xform(sph(0.5, P.q ? 24 : 16), 0, 0, 0,
    0, 0, 0, [0.821, 0.394, 0.421]), 0, 1.4205, 1.9527);
  P.add('hullDark', xform(torus(0.410, 0.018, P.q ? 28 : 18),
    0, 0, 0, 0, 0, 0, [1, 1, 0.513]), 0, 1.394, 1.9527);
  for (const x of [-0.19, 0, 0.19]) {
    periscope(P, 'hullDetail', x, 1.585, 1.750, 0);
  }

  fenders(P, 1.12, 1.48, 1.44, -2.96, 2.94, 0.035);
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.035, 0.10, 5.56), side * 1.39, 1.48, -0.02);
    for (let i = 0; i < 8; i++) {
      P.add('hullDetail', cylZ(0.018, 0.025, 8), side * 1.415, 1.51, 2.38 - i * 0.68,
        0, side * Math.PI / 2, 0);
    }
  }

  // Five road wheels and one continuous closed course.  These stations are
  // the averaged left/right centers measured from the comparison print (the
  // real torsion-bar rows are staggered by roughly 100 mm).  Author-space Y
  // values account for the 0.965 root-height correction applied below.
  buildRunningGear(P, {
    style: 'rubber',
    wheelR: 0.368,
    // The complete source wheel pack spans 261 mm in X. The generic 300 mm
    // hub stack protruded almost to the shoe face; a 200 mm base plus the
    // measured suspension-bound face layers below lands at X=1.302 m.
    wheelW: 0.20,
    wheelY: 0.425,
    wheelZs: [1.991, 1.102, 0.182, -0.675, -1.565],
    // 1.257 * (2.82 / 3.04) = 1.166 m, the measured wheel/track lane axis.
    xc: 1.257,
    // The production end wheels are intentionally 25% larger than the first
    // source-envelope pass. Their physical radii also drive the shared band
    // course, so the track wraps the actual wheels rather than an invisible
    // 110 mm proxy circle.
    sprocket: { z: -2.440, y: 0.767, r: 0.244 * SHERIDAN_END_WHEEL_SCALE },
    idler: { z: 2.886, y: 0.764, r: 0.190 * SHERIDAN_END_WHEEL_SCALE },
    // Three compact return rollers follow the slight rise toward the rear
    // drive wheel. Their crowns land on the terminal-wheel tangent, so the
    // newly supported top course remains continuous rather than zig-zagging.
    rollerR: 0.095,
    rollers: SHERIDAN_RETURN_ROLLERS.map((roller) => ({ ...roller })),
    trackW: 0.48,
    trackTh: 0.085,
    topY: 0.86,
    botY: 0.068,
    // The shared NATO shoe is deeper than the thin Sheridan source casting.
    // Radial-only scaling retains the exact 0.445 m world-space shoe width.
    shoeRadialScale: 0.39,
    paintedEnds: true,
    coveredTop: false,
    arms: true,
    linkPitchM: 0.145,
    // Generate the closed course from the enlarged terminal wheels. Dense
    // tangent arcs replace the old hand-authored polygon whose rear join met
    // at a visible point instead of flowing around the sprocket.
    frontArcSteps: 14,
    rearArcSteps: 14,
    smoothRearTopTangent: true,
    tautFrontSpan: true,
    tautRearSpan: true,
    deadSag: 0.018,
    dedupeLoopPoints: true,
    wheelFaceLayers: [
      // KIT.torus is already rotated into the XZ plane; a Z quarter-turn
      // puts its axis on X, exactly matching cylX and the road-wheel axle.
      { geometry: xform(torus(0.284, 0.026, P.q ? 28 : 18, P.q ? 8 : 6),
          0, 0, 0, 0, 0, Math.PI / 2), material: P.mats.wheels,
        outset: 0.125, name: 'gearRoadWheelPressedRims', appearanceRole: 'wheelDish' },
      { geometry: cylX(0.236, 0.014, P.q ? 24 : 16), material: P.mats.dark,
        outset: 0.130, name: 'gearRoadWheelDishWells', appearanceRole: 'wheelInset' },
      { geometry: cylX(0.126, 0.022, P.q ? 20 : 14), material: P.mats.wheels,
        outset: 0.141, name: 'gearRoadWheelHubDrums', appearanceRole: 'wheelDish' },
      { geometry: cylX(0.050, 0.026, P.q ? 14 : 10), material: P.mats.dark,
        outset: 0.143, name: 'gearRoadWheelHubCaps', appearanceRole: 'wheelInset' },
    ],
  });

  // Layered, damageable hull ERA. Every cassette has a continuous
  // vehicle-space camouflage projection and a shallow top cover. These are
  // applique fields on the measured armor surfaces, not a second low skirt:
  // the former Y=0.81 course covered the suspension and erased Sheridan's
  // characteristic boat hull in every side comparison.
  P.eraCluster('sheridan_glacis_era', (put) => {
    for (let row = 0; row < 2; row++) {
      const z = 2.21 - row * 0.43;
      const y = 1.34 + row * 0.21;
      for (let col = 0; col < 5; col++) {
        const x = (col - 2) * 0.47;
        put(x, y, z, -26 * D2R, 0, 0, 1.62, 1.55, 0.58);
      }
    }
  });
  for (const side of [-1, 1]) {
    P.eraCluster(`sheridan_skirt_era_${side > 0 ? 'R' : 'L'}`, (put) => {
      for (let i = 0; i < 10; i++) {
        const z = 1.34 - i * 0.40;
        put(side * 1.425, 1.28, z, 0, side * Math.PI / 2, 0, 1.28, 1.54, 0.52);
      }
    });
      P.add('hullDetail', box(0.045, 0.09, 4.72), side * 1.405, 1.49, -0.02);
  }

  // Headlamps, brush guards, tow eyes and the Sheridan's compact bow trim.
  headlight(P, -0.82, 1.18, 2.66, -0.28, 0.04);
  headlight(P, 0.82, 1.18, 2.66, -0.28, 0.04);
  for (const side of [-1, 1]) {
    P.add('hullDark', torus(0.12, 0.015, 14), side * 0.82, 1.18, 2.73, Math.PI / 2, 0, 0);
    liftEye(P, 'hullDetail', side * 0.73, 1.55, 1.15, side * 0.08);
    P.add('hullDetail', torus(0.10, 0.022, 12), side * 0.76, 0.73, 2.91, Math.PI / 2, 0, 0);
  }

  if (!isTts) {
    // Twin giant rear fuel drums: move the cylinders aft of the sloped rear
    // plate and bridge them back to it with a real cradle. The old Z=-2.59 m
    // centers buried most of each drum inside the hull shell.
    P.add('hullDetail', box(2.25, 0.06, 0.16), 0, 1.42, -2.91);
    for (const x of [-0.58, 0.58]) {
      P.addEquipment('hull', cylX(0.29, 0.96, P.q ? 22 : 14),
        x, 1.58, SHERIDAN_REAR_FUEL_Z);
      P.add('hullDark', cylX(0.298, 0.055, P.q ? 22 : 14),
        x - 0.28, 1.58, SHERIDAN_REAR_FUEL_Z);
      P.add('hullDark', cylX(0.298, 0.055, P.q ? 22 : 14),
        x + 0.28, 1.58, SHERIDAN_REAR_FUEL_Z);
      // Lower saddle and upper tie meet the cylinder skin and terminate in the
      // rear armor instead of merely sharing its volume.
      P.add('hullDetail', box(0.08, 0.34, 0.34), x, 1.45, -2.98, -0.26, 0, 0);
      P.add('hullDark', box(0.07, 0.13, 0.30), x, 1.72, -2.96, 0.42, 0, 0);
    }
    for (const x of [-1.08, 0, 1.08]) {
      P.add('hullDark', box(0.055, 0.42, 0.30), x, 1.54, -2.96, -0.20, 0, 0);
    }
  }

  // Low asymmetric cast turret. These are 24 equal-perimeter samples from
  // eight exact horizontal intersections through the five connected source
  // shell components (Object_12 only). ERA, cupolas, rails, internal parts,
  // and the separate nose lip are deliberately excluded from the samples so
  // they cannot inflate the armor casting. Heights are relative to the
  // measured 1.466 m turret pivot.
  P.add('turret', toCreasedNormals(measuredRingLoft([
    { y: 0.1365, points: [
      [0.0000, -0.7452], [0.2505, -0.7122], [0.4840, -0.6155], [0.6845, -0.4617],
      [0.8383, -0.2612], [0.9350, -0.0278], [0.9679, 0.2228], [0.9350, 0.4733],
      [0.8382, 0.7067], [0.6845, 0.9072], [0.4840, 1.0610], [0.2505, 1.1577],
      [0.0000, 1.1907], [-0.2505, 1.1577], [-0.4840, 1.0610], [-0.6845, 0.9072],
      [-0.8383, 0.7067], [-0.9350, 0.4732], [-0.9679, 0.2227], [-0.9350, -0.0278],
      [-0.8382, -0.2612], [-0.6844, -0.4617], [-0.4839, -0.6155], [-0.2505, -0.7122],
    ] },
    { y: 0.2340, points: [
      [0.0000, -0.8379], [0.2767, -0.8008], [0.5339, -0.6923], [0.7543, -0.5210],
      [0.9227, -0.2983], [1.0287, -0.0401], [1.0648, 0.2366], [1.0220, 0.5124],
      [0.9082, 0.7671], [0.7338, 0.9849], [0.5179, 1.1628], [0.2661, 1.2774],
      [-0.0004, 1.3616], [-0.2670, 1.2772], [-0.5230, 1.1691], [-0.7355, 0.9870],
      [-0.9091, 0.7685], [-1.0209, 0.5128], [-1.0607, 0.2366], [-1.0266, -0.0405],
      [-0.9223, -0.2994], [-0.7551, -0.5229], [-0.5345, -0.6939], [-0.2768, -0.8012],
    ] },
    { y: 0.3340, points: [
      [0.0000, -0.9637], [0.3151, -0.9201], [0.6070, -0.7930], [0.8555, -0.5944],
      [1.0434, -0.3375], [1.1596, -0.0415], [1.1950, 0.2743], [1.1331, 0.5864],
      [0.9893, 0.8702], [0.7913, 1.1202], [0.5881, 1.3663], [0.3189, 1.4725],
      [-0.0002, 1.4725], [-0.3194, 1.4725], [-0.5902, 1.3698], [-0.7939, 1.1241],
      [-0.9916, 0.8738], [-1.1304, 0.5874], [-1.1862, 0.2745], [-1.1545, -0.0422],
      [-1.0421, -0.3399], [-0.8572, -0.5988], [-0.6085, -0.7970], [-0.3154, -0.9208],
    ] },
    { y: 0.4340, points: [
      [0.0000, -1.0895], [0.3329, -1.0448], [0.6432, -0.9157], [0.8693, -0.6834],
      [0.9993, -0.3725], [1.1049, -0.0530], [1.1346, 0.2819], [1.0747, 0.6122],
      [0.9396, 0.9207], [0.7964, 1.2258], [0.5623, 1.4643], [0.2476, 1.5213],
      [-0.0894, 1.5213], [-0.4264, 1.5213], [-0.7020, 1.3542], [-0.9184, 1.1036],
      [-1.0667, 0.8010], [-1.2149, 0.4983], [-1.3106, 0.1838], [-1.2558, -0.1478],
      [-1.1203, -0.4553], [-0.9155, -0.7217], [-0.6455, -0.9217], [-0.3333, -1.0463],
    ] },
    { y: 0.5340, points: [
      [0.0000, -1.2153], [0.3331, -1.1743], [0.6012, -1.0091], [0.7305, -0.6983],
      [0.8545, -0.3853], [0.9678, -0.0684], [1.0119, 0.2641], [0.9484, 0.5928],
      [0.8102, 0.8997], [0.6673, 1.2045], [0.5014, 1.4958], [0.1654, 1.4971],
      [-0.1713, 1.4971], [-0.5072, 1.4953], [-0.7023, 1.2284], [-0.8504, 0.9261],
      [-0.9984, 0.6237], [-1.1465, 0.3214], [-1.2787, 0.0123], [-1.2838, -0.3210],
      [-1.1566, -0.6303], [-0.9310, -0.8788], [-0.6502, -1.0632], [-0.3335, -1.1753],
    ] },
    { y: 0.6340, points: [
      [0.0236, -1.1286], [0.3232, -1.0897], [0.5226, -0.8977], [0.6307, -0.6148],
      [0.7365, -0.3310], [0.8372, -0.0454], [0.8890, 0.2516], [0.8319, 0.5469],
      [0.7070, 0.8228], [0.5783, 1.0970], [0.3705, 1.3065], [0.0971, 1.3956],
      [-0.2057, 1.3956], [-0.4744, 1.2673], [-0.6522, 1.0343], [-0.7830, 0.7612],
      [-0.9138, 0.4880], [-1.0446, 0.2149], [-1.1626, -0.0635], [-1.1566, -0.3625],
      [-1.0359, -0.6386], [-0.8266, -0.8561], [-0.5645, -1.0057], [-0.2772, -1.1001],
    ] },
    { y: 0.7340, points: [
      [0.0514, -1.0045], [0.3002, -0.9703], [0.4387, -0.7873], [0.5220, -0.5500],
      [0.6053, -0.3126], [0.6878, -0.0750], [0.7571, 0.1663], [0.7443, 0.4150],
      [0.6495, 0.6473], [0.4642, 0.8018], [0.2440, 0.9234], [0.0238, 1.0449],
      [-0.2084, 0.9753], [-0.4051, 0.8218], [-0.5917, 0.6531], [-0.7659, 0.4752],
      [-0.8745, 0.2483], [-0.9832, 0.0214], [-1.0569, -0.2167], [-1.0077, -0.4601],
      [-0.8684, -0.6661], [-0.6700, -0.8178], [-0.4416, -0.9231], [-0.1989, -0.9875],
    ] },
    { y: 0.7720, points: [
      [0.0619, -0.9573], [0.2919, -0.9248], [0.4054, -0.7439], [0.4808, -0.5240],
      [0.5562, -0.3040], [0.6316, -0.0841], [0.7030, 0.1371], [0.7087, 0.3673],
      [0.6089, 0.5674], [0.4043, 0.6780], [0.1998, 0.7885], [-0.0049, 0.8944],
      [-0.2139, 0.7928], [-0.4062, 0.6621], [-0.5984, 0.5314], [-0.7543, 0.3690],
      [-0.8565, 0.1602], [-0.9552, -0.0503], [-1.0148, -0.2725], [-0.9467, -0.4932],
      [-0.8026, -0.6722], [-0.6081, -0.7966], [-0.3950, -0.8889], [-0.1696, -0.9445],
    ] },
  // The casting is polygonal rather than spherical: retain the measured
  // 24-sided cheek/crown facets and let their straight runs meet at visible
  // vertices. Small within-facet triangles still share normals.
  ]), SHERIDAN_TURRET_CREASE_DEG * D2R));
  // Close the crown with a shallow, twelve-sided structural roof plate. Its
  // lower course is buried in the measured shell cap while the slightly
  // inset upper course leaves a crisp perimeter seam and a genuinely closed
  // roof. Straight facets deliberately meet at points; this is not a rounded
  // dome or a decorative coplanar patch.
  P.add('turret', toCreasedNormals(measuredRingLoft([
    { y: 0.758, points: SHERIDAN_TURRET_ROOF_PLAN },
    { y: 0.804, points: SHERIDAN_TURRET_ROOF_PLAN, xScale: 0.985 },
  ]), 8 * D2R));
  // Object_12 components 3/7/17 are two concentric turret-race rings. Their
  // measured world-space centers are only about 11 mm apart vertically; they
  // are not a deep hanging basket. Preserve the source radii and separation
  // without inventing lower posts that distort the turret silhouette.
  P.add('turretDark', torus(0.968, 0.012, P.q ? 32 : 20), 0, 0.148, 0.223);
  P.add('turretDetail', torus(0.898, 0.022, P.q ? 32 : 20), 0, 0.159, 0.223);
  // The apparent nose "lip" is not a continuous transverse bar. Exact
  // connected-component inspection of source Objects 13/15 resolves three
  // small stacked cast lugs at each outer cheek, with open space between
  // them. The former full-width box filled 2.13 m of nonexistent armor and
  // dominated both the front and plan-curve error despite sharing the right
  // aggregate bounds.
  for (const side of [-1, 1]) {
    const x = side > 0 ? 1.06290 : -1.19296;
    P.add('turret', box(0.11996, 0.12335, 0.06079), x, 0.04745, 1.69647);
    P.add('turret', box(0.07499, 0.08912, 0.01566),
      x, 0.04747, 1.65824);
    P.add('turret', box(0.10210, 0.10214, 0.00528),
      side > 0 ? 1.06295 : -1.19291, 0.04747, 1.72643);
  }
  // Object_3 is the Sheridan's broad rear canvas bank. Exact vertical-bin
  // measurements show eight touching soft lobes, not a solid bustle plate:
  // its scalloped plan outline runs X=-0.850..0.436, Z=-1.521..-0.962 m.
  // Rebuild each lobe from its independent X/Y/Z envelope. Their slight
  // overlaps provide a real connection path into the turret/stowage mass
  // while retaining the source gaps and uneven rear edge in plan view.
  for (const [x, minY, maxY, minZ, maxZ] of [
    [-0.769, 1.794, 2.127, -1.290, -0.962],
    [-0.609, 1.766, 2.186, -1.403, -0.965],
    [-0.448, 1.748, 2.178, -1.448, -1.026],
    [-0.287, 1.804, 2.186, -1.461, -1.060],
    [-0.127, 1.823, 2.186, -1.463, -1.100],
    [ 0.034, 1.837, 2.186, -1.493, -1.104],
    [ 0.195, 1.823, 2.184, -1.521, -1.099],
    [ 0.355, 1.797, 2.189, -1.486, -1.064],
  ]) {
    P.add('turretCloth', xform(sph(0.5, P.q ? 18 : 12), 0, 0, 0,
      0, 0, 0, [0.174, maxY - minY, maxZ - minZ]),
    x, (minY + maxY) * 0.5 - 1.466, (minZ + maxZ) * 0.5);
  }
  // Object_11 contains two soft base rolls with five *rectangular* strapped
  // pouches above them. The previous pass interpreted every major island as
  // a canvas ellipsoid, erasing the Sheridan's characteristic stepped rear
  // silhouette. Preserve the PCA-oriented envelopes of the two rolls first.
  for (const [x, y, z, w, h, d, yaw] of [
    [-0.51341, 0.48845, -1.21920, 0.68153, 0.40050, 0.34665, -0.43003],
    [ 0.10144, 0.52368, -1.34468, 0.65813, 0.37303, 0.32435, -0.08357],
  ]) {
    P.add('turretCloth', xform(sph(0.5, P.q ? 18 : 12), 0, 0, 0,
      0, yaw, 0, [w, h, d]), x, y, z);
  }
  // Exact 3D PCA envelopes for connected components 0, 1, 2, 4 and 5.
  // These packs are visibly pitched and rolled as well as yawed; treating
  // them as flat boxes made the rear station 107 mm too tall in side view.
  for (const [x, y, z, size, axisX, axisY] of [
    [-0.372476, 0.564372, -1.511923, [0.392042, 0.262308, 0.194759],
      [-0.972794, -0.231303, -0.013103], [-0.209713, 0.855135, 0.474093]],
    [ 0.252804, 0.680867, -1.422393, [0.391982, 0.262421, 0.195335],
      [-0.970368, 0.219579, -0.100849], [-0.013249, 0.368387, 0.929578]],
    [-0.697080, 0.724782, -1.274923, [0.327308, 0.325603, 0.179982],
      [0.825301, -0.115934, -0.552664], [0.487713, 0.639647, 0.594127]],
    [ 0.059771, 0.772353, -1.238791, [0.266679, 0.227067, 0.158234],
      [-0.726688, -0.151457, -0.670064], [0.679923, -0.297898, -0.670046]],
    [-0.286688, 0.742240, -1.334852, [0.266792, 0.226982, 0.158259],
      [-0.522162, 0.367820, 0.769451], [0.852712, 0.209174, 0.478673]],
  ]) {
    P.add('turretCloth', boxOnBasis(size, axisX, axisY), x, y, z);
  }
  // Five surveyed retaining bands cross those packs. Several source
  // components are duplicate front/back faces of the same physical strap;
  // use one shallow solid per band instead of stacking coincident geometry.
  for (const [x, y, z, size, axisX, axisY] of [
    [-0.298164, 0.682017, -1.199197, [0.590480, 0.140319, 0.023839],
      [-0.040522, 0.338707, 0.940019], [-0.213590, 0.916109, -0.339299]],
    [ 0.329340, 0.678940, -1.178247, [0.512282, 0.048514, 0.031253],
      [-0.121298, 0.389667, 0.912933], [0.744946, 0.643567, -0.175716]],
    [-0.459322, 0.693741, -1.133031, [0.546353, 0.059112, 0.052349],
      [-0.592820, -0.283346, -0.753843], [-0.460585, -0.648574, 0.605981]],
    [ 0.141117, 0.702991, -1.220663, [0.532128, 0.069869, 0.020701],
      [0.047150, -0.323593, -0.945021], [-0.306591, -0.905096, 0.294625]],
    [-0.686175, 0.709045, -1.048354, [0.515932, 0.093265, 0.023033],
      [-0.586069, -0.308844, -0.749092], [0.192812, -0.951108, 0.241283]],
  ]) {
    P.add('turretDark', boxOnBasis(size, axisX, axisY), x, y, z);
  }

  // Object_11 also carries the Sheridan's asymmetric right-roof equipment
  // bank. Component isolation resolves three rising, rotated housings rather
  // than one generic loader hatch: their exact OBBs step inward from the
  // turret edge while remaining joined to the cast crown. Keep the user's
  // second crew station, but restore these source-defining housings around it
  // so the plan silhouette no longer loses 0.76 m at X~=1.32 m.
  for (const [x, y, z, w, h, d, yaw] of [
    [1.080583, 0.487309, -0.380627, 0.365801, 0.160670, 0.119058, -1.140015],
    [0.909676, 0.644724, -0.398660, 0.248498, 0.161220, 0.090406, -0.868573],
    [0.727630, 0.770214, -0.231409, 0.190234, 0.149060, 0.123163, -1.081799],
  ]) {
    P.addEquipment('turret', box(w, h, d), x, y, z, 0, yaw, 0);
  }

  // Exact connected-component reconstruction of the M81 gun assembly. Move
  // the marked front receiver out of the turret bucket and into gunMount in
  // gun-pivot coordinates (turret-local pivot Y=.44, Z=1.10). It now pitches
  // with the mantlet instead of remaining behind as a disconnected triangle.
  P.addGunExtra(frustum(
    0.49, 1.58, 1.39,
    0.45, 1.58, 1.40,
    0.20, 0.68,
  ), 0, -0.44, -1.10);
  // A recessed stationary seal remains inside the opening and is fully
  // overlapped by the articulated receiver at neutral and elevated poses.
  P.add('turretDark', box(0.70, 0.32, 0.026), 0, 0.44, 1.585);
  P.addGunExtra(forwardTrapezoidGunMask({
    rearHalfWidth: 0.515,
    rearHalfHeight: 0.265,
    frontHalfWidth: 0.485,
    frontHalfHeight: 0.110,
    rearZ: 0.18,
    frontZ: 0.86,
  }), 0.0038, 0.0186, 0);
  // The M81's articulated geometry continues through the turret to the
  // breech. Object_16 separates this hidden run into three nearly circular
  // connected islands and one rear trunnion plate. Omitting them made the
  // direct gun mask begin at the mantlet even though the reference assembly
  // reaches Z=0.539 m. Coordinates below are the measured world envelopes
  // translated into the production gun pivot frame (Y=1.90655, Z=1.10032).
  // The overlaps are intentional: they preserve one mechanically continuous
  // elevation assembly without copying any source topology.
  P.addGunExtra(xform(cylZ(0.5, 0.0660, P.q ? 24 : 14), 0, 0, 0,
    0, 0, 0, [0.320, 0.434, 1]), 0.005, -0.0556, -0.5283);
  P.addGunExtra(cylZ(0.1530, 0.4577, P.q ? 24 : 14),
    0, 0.0065, -0.2468);
  P.addGunExtra(cylZ(0.1825, 0.4859, P.q ? 24 : 14, 0.1530),
    0, 0.0055, 0.2225);
  for (const [z, r, depth] of [
    [-0.4953, 0.164, 0.016], [-0.4757, 0.153, 0.014],
    [-0.0179, 0.181, 0.016], [0.4654, 0.183, 0.016],
  ]) P.addGunExtraDark(cylZ(r, depth, P.q ? 24 : 14), 0, 0.006, z);
  // A thin, open recoil cage forms the remaining rear envelope. The source
  // component is a rectangular four-member frame (not a diagonal strut):
  // X=-0.221..-0.174, Y=1.437..2.013, Z=-0.094..0.639 m. Reconstructing the
  // void is important because a solid plate or diagonal reads as a different
  // gun mechanism in the direct side mask.
  const cageX = -0.1975;
  const cageY = -0.1818;
  const cageZ = -0.8278;
  const cageW = 0.047;
  const cageH = 0.576;
  const cageD = 0.733;
  for (const y of [cageY - cageH / 2, cageY + cageH / 2]) {
    P.addGunExtraDark(box(cageW, 0.022, cageD), cageX, y, cageZ);
  }
  for (const z of [cageZ - cageD / 2, cageZ + cageD / 2]) {
    P.addGunExtraDark(box(cageW, cageH, 0.022), cageX, cageY, z);
  }
  // The third connected recoil island is a stepped side plate, not another
  // rail. Its source envelope is X=-0.218..-0.192, Y=1.461..1.986 and
  // Z=-0.068..0.621 m. The seven-point course below is the measured exterior
  // silhouette translated into the M81 pivot frame; the open cage members
  // remain visible alongside it rather than being replaced by a solid box.
  P.addGunExtraDark(measuredGunSidePlate([
    [-1.1686, -0.4207],
    [-1.1492, -0.4454],
    [-0.4985, -0.4454],
    [-0.4791, -0.4207],
    [-0.4789,  0.0798],
    [-1.0681,  0.0798],
    [-1.1686,  0.0026],
  ], -0.2180, -0.1918), 0, 0, 0);
  // Upper recoil shield and coaxial sight housing. These disconnected source
  // islands are what form the characteristic step over the left side of the
  // mantlet; treating the main casting as a symmetric ellipsoid cannot make
  // this outline. Their envelopes are retained independently so the gun tree
  // reaches the measured Y=2.2675 m without making the entire mantlet taller.
  P.addGunExtra(box(0.288, 0.112, 0.3505),
    0.0037, 0.3046, 0.6536);
  P.addGunExtraDark(box(0.030, 0.103, 0.363),
    0.1626, 0.2050, 0.6600);
  P.addGunExtraDark(box(0.030, 0.103, 0.363),
    -0.1554, 0.2050, 0.6600);
  P.addGunExtraDark(cylZ(0.101, 0.012, P.q ? 18 : 12),
    -0.293, 0.0859, 0.7781);
  P.addGunExtra(box(0.113, 0.113, 0.163),
    -0.281, 0.0849, 0.8127);
  // Separate circular sealing face: source Z=1.703..1.743 m.
  P.addGunExtra(cylZ(0.1536, 0.0392, P.q ? 28 : 16), 0, 0.0072, 0.6229);
  // Inner sleeve, outer sleeve and terminal tube respectively.
  P.addGunExtra(cylZ(0.1290, 0.4862, P.q ? 28 : 16, 0.1536),
    0, 0.0072, 0.8470);
  P.addGunExtra(cylZ(0.1258, 0.6120, P.q ? 28 : 16, 0.1290),
    0, 0.0072, 1.4034);
  P.addGunExtra(cylZ(0.0906, 0.4502, P.q ? 28 : 16, 0.1258),
    0, 0.0072, 1.8622);
  // Hard rings preserve the five independently measured sleeve breaks.
  for (const [z, r, depth] of [
    [0.6229, 0.1536, 0.018], [1.0937, 0.1472, 0.014],
    [1.7094, 0.1471, 0.014], [1.6371, 0.096, 0.020],
  ]) P.addGunExtraDark(cylZ(r, depth, P.q ? 24 : 14), 0, 0.0072, z);
  muzzleBore(P, { len: 2.09, r: 0.115 });

  // Turret cheek ERA follows the cast tangent, with attachment rails buried
  // into the shell rather than suspended in front of it.
  for (const side of [-1, 1]) {
    const suffix = side > 0 ? 'R' : 'L';
    // Object_10 resolves into two independent 35 mm-high diagonal carrier
    // rails on each cheek. Preserve their measured centers, projected lengths
    // and (critically) inward-facing yaw. The former single rail used the
    // opposite yaw, placing its outer end ~0.58 m aft of the reference and
    // dominating the plan-view curve error at X=1.32..1.39 m.
    P.add('turretDetail', box(0.035, 0.0354, 0.846),
      side * 1.09340, 0.38575, 1.12983, 0, -side * 0.690, 0);
    P.add('turretDetail', box(0.035, 0.0354, 0.656),
      side * 0.98142, 0.18222, 0.97406, 0, -side * 0.620, 0);
    P.eraCluster(`sheridan_turret_era_${suffix}`, (put) => {
      // Custom applique sits on the lower cast cheek. The previous pass
      // accidentally treated the Object_10 smoke-tube envelopes as ERA
      // cassettes, producing four large square blocks exactly where the
      // launchers belong. Preserve layered/damageable ERA, but keep it below
      // the surveyed launcher bank and tangent to the armor course.
      for (const [x, y, z, yaw] of [
        [1.184, 1.594, 0.660, 0.43],
        [1.120, 1.615, 0.840, 0.63],
        [1.035, 1.636, 1.012, 0.86],
        [0.918, 1.657, 1.166, 1.13],
      ]) put(side * x, y, z, 0, side * yaw, 0, 0.82, 1.34, 0.72);
    }, true);
  }

  // Two usable roof stations. The .50 caliber commander mount and requested
  // 7.62 mm loader mount sit immediately forward of their measured hatch rim.
  const cupolas = [
    { x: -0.50, z: -0.247, mg: 'm2', scale: 1.10, ammo: true },
    // Object_10 components 3/8 are the second roof station: a flush
    // 450 x 572 x 25 mm oval plate centered at X=.326, Z=-.168 m. It is not
    // the tall generic cupola previously placed at X=.48, Z=-.43 m. Keep the
    // requested second machine gun, but seat it on this measured hatch so the
    // addition does not rewrite Sheridan's roof silhouette.
    { x: 0.32622, z: -0.16774, mg: 'mag', scale: 0.72, ammo: false },
  ];
  for (const station of cupolas) {
    if (station.mg === 'm2') {
      // The commander station is not the same small ring as the loader's.
      // Its two connected source components span X=-1.056..0.056,
      // Z=-0.781..0.287 and Y=2.272..2.389 m. The armor collar below is
      // deliberately buried 79 mm into the cast crown so the larger ring is
      // both flush and physically supported.
      // The lower collar's exact source envelope is 1.112 m across X and
      // 1.068 m across Z. Only its buried base reaches that diameter; the
      // upper ring remains the measured 0.43 m radius. This tapered/elliptic
      // reconstruction matches both envelopes without inflating the hatch.
      // The lower 816 mm collar (Object_11 component 8) starts below the
      // crown and supports the wider upper bearing. Keeping the two measured
      // courses separate avoids the swollen single-frustum look.
      P.addCupola('turret', xform(
        cylY(0.408, 0.408, 0.15605, P.q ? 26 : 18),
        0, 0, 0, 0, 0, 0, [1, 1, 0.9985]),
        station.x, 0.79752, station.z);
      P.addCupola('turret', xform(
        cylY(0.43, 0.556, 0.09530, P.q ? 26 : 18),
        0, 0, 0, 0, 0, 0, [1, 1, 0.9604]),
        station.x, 0.85347, station.z);
      // Eight independently framed direct-vision blocks occupy the measured
      // 0.82 m cupola perimeter. Their housings intersect the collar by
      // 18 mm and their glass lies on the outward radial face, so neither
      // layer reads as a floating decorative ring.
      for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4;
        const radius = 0.405;
        const x = station.x + Math.sin(angle) * radius;
        const z = station.z + Math.cos(angle) * radius;
        P.add('turretDark', box(0.145, 0.082, 0.070),
          x, 0.827, z, 0, angle, 0);
        P.add('turretGlass', box(0.104, 0.044, 0.014),
          x + Math.sin(angle) * 0.041, 0.832,
          z + Math.cos(angle) * 0.041, 0, angle, 0);
      }
      // Object_11 stores the commander's lid as an open annulus. The former
      // pair of filled cylinders matched its outer bounds but erased the
      // 430 mm opening and read as a solid billboard in the gallery. Preserve
      // the surveyed X=.620 m / sloped=.441 m outer spans on the measured
      // -23.5° plane, then add the central stay from component 58.
      P.add('turretDark', torus(0.405, 0.018, P.q ? 24 : 16),
        station.x, 0.944, station.z);
      P.addHatch('turret', xform(
        torus(0.270, 0.040, P.q ? 30 : 20),
        0, 0, 0, -0.410, 0, 0, [1, 1, 0.755]),
        -0.5002, 1.0114, 0.2745);
      P.add('turretDark', xform(
        torus(0.238, 0.014, P.q ? 28 : 18),
        0, 0, 0, -0.410, 0, 0, [1, 1, 0.755]),
        -0.5002, 1.025, 0.2685);
      P.add('turretDark', cylinderOnAxis(
        [-0.5002, 1.0169, 0.2630], [0, 0.623, 0.782], 0.348, 0.009,
        P.q ? 14 : 10), 0, 0, 0);
      // Paired hinge knuckles connect the open lid to the rear edge of the
      // cupola instead of leaving the accurately tilted plate floating.
      for (const x of [-0.676, -0.324]) {
        P.add('turretDark', cylX(0.038, 0.135, P.q ? 16 : 10),
          x, 0.952, 0.036);
        P.add('turretDetail', box(0.080, 0.100, 0.150),
          x, 0.980, 0.072, -0.30, 0, 0);
      }
    } else {
      P.addHatch('turret', xform(
        cylY(0.225, 0.225, 0.02475, P.q ? 24 : 16),
        0, 0, 0, 0, 0, 0, [1, 1, 1.271]),
        station.x, 0.75926, station.z);
      P.add('turretDark', xform(
        torus(0.205, 0.010, P.q ? 24 : 16),
        0, 0, 0, 0, 0, 0, [1, 1, 1.271]),
        station.x, 0.7720, station.z);
    }
    if (station.mg === 'm2' && !isTts) {
      P.turretG.add(measuredCommanderM2(P));
    } else if (station.mg !== 'm2') {
      const mg = FITTINGS.pintleMG({
        mats: P.mats,
        cls: station.mg,
        scale: station.scale,
        tone: 'two-tone',
        elev: 0.035,
        ammo: station.ammo,
        ring: { r: 0.21, stubs: 3 },
        seed: 552,
      });
      mg.scale.set(0.92, 0.72, 0.92);
      mg.position.set(station.x, 0.805, station.z + 0.13);
      P.turretG.add(mg);
      // The added loader weapon is intentionally not present in the
      // historical comparison model, but it must still be a plausible,
      // connected installation.  A stepped pintle buries into the hatch
      // ring and reaches the fitting's underside, preventing the complete
      // weapon from becoming a detached silhouette island during traverse.
      P.add('turretDark', cylY(0.030, 0.038, 0.205, P.q ? 14 : 10),
        station.x, 0.850, station.z + 0.030);
      P.add('turretDark', box(0.060, 0.050, 0.245),
        station.x, 0.922, station.z + 0.105, -0.66, 0, 0);
    }
  }
  for (const [x, z, yaw] of [[0.18, 0.64, 0], [0.56, 0.32, -0.20], [-0.58, 0.30, 0.20]]) {
    // The cast crown at these stations is Y=0.772 m. The previous 0.960 m
    // center left a 153 mm air gap below every optic; at 90° traverse their
    // combined glass slits became a separate connected-component island.
    // Bury the 70 mm housings 17 mm into the measured roof so the optics are
    // mechanically seated while retaining a visible glass face.
    periscope(P, 'turretDetail', x, 0.790, z, yaw);
  }
  // Exact Object_10 smoke-bank centerlines. Each body, collar and dark bore
  // uses the same surveyed 3D axis, eliminating the generic fitting's fan
  // angle errors and making all eight tubes terminate on one coherent arc.
  const smokeTubes = [
    [-0.849710, 1.808775, 1.261650, -0.032641, 0.635442, 0.771458, 0.339435],
    [-0.963521, 1.804380, 1.141501, -0.260660, 0.667405, 0.697586, 0.338749],
    [-1.061774, 1.801967, 1.010892, -0.459412, 0.686395, 0.563740, 0.338962],
    [-1.144252, 1.801373, 0.870882, -0.613620, 0.692011, 0.380251, 0.339367],
    [0.849709, 1.808744, 1.261620, 0.032697, 0.635444, 0.771455, 0.339327],
    [0.963569, 1.804504, 1.141633, 0.260676, 0.667407, 0.697579, 0.339149],
    [1.061882, 1.802127, 1.011027, 0.459448, 0.686381, 0.563727, 0.339467],
    [1.144184, 1.801301, 0.870843, 0.613621, 0.692013, 0.380246, 0.339135],
  ];
  for (const [x, worldY, z, ax, ay, az, length] of smokeTubes) {
    const axis = [ax, ay, az];
    const center = [x, worldY - 1.466, z];
    P.add('turretDetail', cylinderOnAxis(center, axis, length, 0.036,
      P.q ? 18 : 12), 0, 0, 0);
    const muzzle = [
      center[0] + ax * (length * 0.5 + 0.006),
      center[1] + ay * (length * 0.5 + 0.006),
      center[2] + az * (length * 0.5 + 0.006),
    ];
    P.add('turretDetail', cylinderOnAxis(muzzle, axis, 0.030, 0.045,
      P.q ? 18 : 12), 0, 0, 0);
    const bore = [
      muzzle[0] + ax * 0.018,
      muzzle[1] + ay * 0.018,
      muzzle[2] + az * 0.018,
    ];
    P.add('turretDark', cylinderOnAxis(bore, axis, 0.010, 0.026,
      P.q ? 16 : 10), 0, 0, 0);
    // A short foot from each lower endpoint into the diagonal carrier makes
    // the complete array mechanically continuous with the turret cheek.
    const foot = [
      center[0] - ax * (length * 0.5 - 0.010),
      center[1] - ay * (length * 0.5 - 0.010),
      center[2] - az * (length * 0.5 - 0.010),
    ];
    P.add('turretDark', cylinderOnAxis(foot, axis, 0.055, 0.043,
      P.q ? 16 : 10), 0, 0, 0);
  }
  // Exact connected envelopes from source Object 14. The generic antenna
  // fitting used 120 mm square pedestal blocks and overran the source tips
  // by 12–14 cm. Rebuild the two asymmetric multi-stage mounts at their
  // measured diameters/heights and bridge each pedestal into the cast roof,
  // which also keeps the articulation-island gate honest at 90° traverse.
  const turretY = (worldY) => worldY - 1.466;
  const antennaStages = [
    { x: 0.29174, z: -0.59165, stages: [
      [2.2260, 2.3327, 0.0400, 'dark'],
      [2.3327, 2.4409, 0.0306, 'dark'],
      [2.4406, 2.4733, 0.0154, 'dark'],
      [2.4733, 4.5090, 0.0086, 'detail'],
    ] },
    { x: 0.82592, z: 0.69825, stages: [
      [2.2140, 2.2620, 0.0340, 'dark'],
      [2.2620, 2.7772, 0.0220, 'dark'],
      [2.7770, 4.5299, 0.0090, 'detail'],
    ] },
  ];
  for (const antenna of antennaStages) {
    for (const [minY, maxY, radius, bucket] of antenna.stages) {
      P.add(bucket === 'detail' ? 'turretDetail' : 'turretDark',
        cylY(radius, radius, maxY - minY, P.q ? 14 : 10),
        antenna.x, turretY((minY + maxY) * 0.5), antenna.z);
    }
  }

  const ttsReceipt = isTts ? buildSheridanTtsUpgrade(P) : null;

  // Keep both unit insignia and tactical numbers on clean, mirrored side
  // surfaces so neither the skirt ERA nor the asymmetric roof weapons can
  // hide the production marking seats.
  P.decal('hull', 'star', null, 0.28, [1.225, 1.08, -1.10], Math.PI / 2);
  P.decal('hull', 'star', null, 0.28, [-1.225, 1.08, -1.10], -Math.PI / 2);
  P.decal('turret', 'number', '551', 0.28, [1.20, 0.43, -0.36], Math.PI / 2);
  P.decal('turret', 'number', '551', 0.28, [-1.20, 0.43, -0.36], -Math.PI / 2);
  // The source envelope is 2.82 m across its track faces. Keep the long
  // 6.30 m hull untouched in Z, while compressing only the authored lateral
  // and vertical print frame to the published cross-section. This is applied
  // at both articulation roots so the gun/turret hierarchy remains coherent.
  P.hullG.scale.set(SHERIDAN_X_SCALE, SHERIDAN_Y_SCALE, 1);
  P.turretG.scale.set(1, 1, 1);
  P.topY = 0.96;

  if (P.geometryReceipt) {
    P.hullG.userData.sheridanReceipt = {
      roadWheelsPerSide: 5,
      missileOnly: true,
      layeredEraSectors: 5,
      roofMachineGuns: isTts ? 1 : 2,
      rearFuelDrums: isTts ? 0 : 2,
      fuelDrumSupportRails: isTts ? 0 : 3,
      rearFuelCenterZ: isTts ? null : SHERIDAN_REAR_FUEL_Z,
      backgroundTrackPanels: 0,
      endWheelScale: SHERIDAN_END_WHEEL_SCALE,
      returnRollersPerSide: SHERIDAN_RETURN_ROLLERS.length,
      returnRollerProfile: SHERIDAN_RETURN_ROLLERS.map(({ z, y, r }) => ({ z, y, r })),
      roadWheelFaceProfile: 'stepped-noncoplanar-v2',
      commanderAmmoBoxClosed: true,
      turretRoofClosed: true,
      mantletProfile: 'faceted-forward-trapezoid-integrated-m81',
      mantletSideTrapezoid: true,
      mantletForwardFace: true,
      mantletIntegratedReceiver: true,
      mantletFrontWidth: 0.97,
      mantletFrontHeight: 0.22,
      hullCreaseDeg: SHERIDAN_HULL_CREASE_DEG,
      turretCreaseDeg: SHERIDAN_TURRET_CREASE_DEG,
      ...(isTts ? { ttsUpgrade: ttsReceipt } : {}),
    };
  }
}

export const SHERIDAN_PROFILES = Object.freeze({
  m551_sheridan: Object.freeze({ build: buildSheridan }),
  m551a1_tts: Object.freeze({ build: buildSheridan }),
});
