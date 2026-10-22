// The ring a destroyed tank's turret leaves (tank-opt RING stream, 2026-10-16; the owner, 2026-10-15: "give tanks proper
// turret ring areas because when the turret blows off we should see that"). Copyright © 2026 Kevin B. Liu; first-party
// Reserved Content (NOTICE.md). provenance: urn:claude-of-tanks:qa:turret-ring-well-selftest
//
//  - the measure on a built hull and turret (the deck round the race's rim, the turret base, the skirt, the floor) and
//    its exterior pass (a hull narrower than the ring under its deck: the well narrows to a ledge);
//  - the anatomy: the turretRing volume (a sim module) keeps today's law whether or not a ring receipt is present;
//  - the live cut: nothing of a hull face left inside the prism, every attribute and group carried, a long face past the
//    rim split into its sectors, the cut faces' reach per side; the plate: faces up, its band out and in, the hull's dents
//    at its vertices (its rim never under the field's bow), the burn clock's share; the well's shader;
//  - a live wreck (the T-72B3 builder, whose doubled roof sheet lies 1.3 mm under its deck): intact it holds no plate and
//    no cut, the warm's staged plate leaves again; the kill cuts the hull and seats one plate on its own material; the
//    clock ramps it; the rematch puts every mesh back on the geometry it held, fingerprint byte-identical;
//  - a hulk: the exact cut (a face crossing the prism keeps every part of it outside), the well's band and ledge, the
//    placement budget, envelope, contact, collision and shadow exactly the ring-less bake's; a plain kill's hulk takes
//    no ring.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import '../../tools/tank-surface-collect.mjs';
import { createTank, ensureTankBuilder } from './fleetFactory.ts';
import { getSpec } from './specs.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { finalizeCombatAnatomy } from './combatAnatomy.ts';
import { combatAnatomyCalibration, registerCombatAnatomyCalibrations } from './combatAnatomyCalibrationRegistry.ts';
import {
  TURRET_RING_LIFT_M, TURRET_RING_PLATE_NAME, buildTurretRingPlateGeometry, buildTurretRingWellGeometry,
  createTurretRingWellMaterial, cutGeometryAtTurretRing, cutTurretRingAperture, emptyTurretRingRim, measureTurretRing,
  planTurretRingHulk, turretRingCut, turretRingDentShare, turretRingPlateDents, turretRingRadius, turretRingSeatFrom,
  turretRingSides,
} from './turretRingWell.ts';
import { bakeTankWreck } from '../world/wrecks.ts';

// the browser's demand-loaded fleet (the bake builds through it too): the T-72B3's builders, anatomy and fills
await ensureTankBuilder('t72b3');

const close = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (±${tol})`);
const triangles = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
const corner = (geometry, k, i) => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,
  geometry.index ? geometry.index.getX(k + i) : k + i);
/** Whether a hull-frame point lies inside a cut's polygon (more than `slack` inside every side). */
const insidePolygon = (cut, x, z, slack = 1e-5) => {
  const apothem = cut.r * Math.cos(Math.PI / cut.sides);
  for (let k = 0; k < cut.sides; k++) {
    const a = ((k + 0.5) / cut.sides) * Math.PI * 2;
    if ((x - cut.cx) * Math.sin(a) + (z - cut.cz) * Math.cos(a) > apothem - slack) return false;
  }
  return true;
};
const polygonArea = (r, sides) => 0.5 * sides * r * r * Math.sin((2 * Math.PI) / sides);

// ---- the measure on a synthetic rig ---------------------------------------------------------------------------------
{
  const rig = (lowerWidth) => {
    const root = new THREE.Group();
    const hull = new THREE.Group(); hull.name = 'rig_hull';
    const turret = new THREE.Group(); turret.name = 'rig_turret';
    root.add(hull, turret);
    const mat = new THREE.MeshStandardMaterial();
    if (lowerWidth) {
      // a deck plate over a lower hull narrower than the ring (a sponsoned hull): deck 1.5, the plate 0.3 thick
      const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 6.5), mat);
      deck.position.set(0, 1.35, 0.2);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(lowerWidth, 0.75, 6.5), mat);
      lower.position.set(0, 0.825, 0.2);
      hull.add(deck, lower);
    } else {
      // a closed hull box, deck at 1.5, belly at 0.45
      const box = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 6.5), mat);
      box.position.set(0, 0.975, 0.2);
      hull.add(box);
    }
    // a 3 cm plinth of 0.9 m round the seat
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.03, 48), mat);
    plinth.position.set(0, 1.515, 0.2);
    hull.add(plinth);
    // the turret: a 1.3 m base cylinder seated on the plinth; a narrow neck under it into the hull
    turret.position.set(0, 1.53, 0.2);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.7, 48), mat);
    shell.position.y = 0.35;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 32), mat);
    neck.position.y = -0.2;
    turret.add(shell, neck);
    root.updateMatrixWorld(true);
    return { hull, turret };
  };
  const { hull, turret } = rig(0);
  const receipt = measureTurretRing(hull, turret, 0.82);
  assert.ok(receipt, 'a turreted synthetic hull has a ring');
  assert.deepEqual(receipt.seat, [0, 1.53, 0.2], 'the seat is the rig_turret origin in the hull frame');
  close(receipt.deckY, 1.53, 1e-3, 'the race lies on the deck round its rim (the plinth it was let into)');
  assert.ok(receipt.footR > 1.2 && receipt.footR <= 1.31, `the turret base counts its shell over the neck (${receipt.footR})`);
  assert.ok(receipt.rimR > 0.82 && receipt.rimR <= receipt.footR - 0.019, `the race: the ring and its flange, inside the base (${receipt.rimR})`);
  assert.ok(receipt.skirt >= 0.03 && receipt.skirt <= 0.045, `the skirt reaches the deck past the plinth (${receipt.skirt})`);
  close(receipt.floorY, 0.45 + 0.1, 0.02, 'the well floor stands a floor plate over the belly');
  assert.equal(receipt.wellR, undefined, 'a live build\'s measure takes no exterior pass');
  // the exterior pass over a closed hull: nothing of its skin near the well
  const closed = measureTurretRing(hull, turret, 0.82, { exterior: true });
  close(closed.floorY, receipt.floorY, 1e-9, 'a closed hull keeps its floor');
  assert.ok(closed.wellR > 0.7 && closed.skinR === undefined, `the well's wall on the gear's band, no skin within reach (${closed.wellR})`);
  // a hull narrower than the ring under its deck: its sides are skin, seen from beside it, under the deck plate's overhang
  const narrow = rig(1.2);
  const sponsoned = measureTurretRing(narrow.hull, narrow.turret, 0.82, { exterior: true });
  assert.ok(sponsoned.wellR <= 0.6 - 0.019 && sponsoned.wellR >= 0.4, `the well narrows inside the lower hull's sides: a ledge (${sponsoned.wellR})`);
  assert.ok(sponsoned.deckY - sponsoned.floorY > 0.5, `and keeps its depth (${(sponsoned.deckY - sponsoned.floorY).toFixed(3)})`);
  close(sponsoned.skinR, 0.6, 0.03, 'the skin\'s nearest reach to the axis');
  const seat = turretRingSeatFrom(receipt, null, null, 'measured');
  assert.ok(seat.openR < seat.rimR && seat.openR > 0.7, 'the opening is the race\'s inner edge');
  close(seat.depth, receipt.deckY - receipt.floorY, 1e-9, 'the well runs from the deck to its floor');
  close(seat.wellR, seat.openR - 0.018, 1e-9, 'without a receipt\'s ledge, the wall on the gear\'s band');
  assert.equal(seat.skinR, Infinity);
  assert.equal(seat.carousel, null, 'no autoloader, no carousel');
  assert.ok(turretRingSeatFrom(sponsoned, null, null, 'receipt').wellR < seat.wellR, 'a receipt\'s ledge rides into the seat');
  // the carousel from the anatomy's autoloader volume
  const az = turretRingSeatFrom(receipt, { modules: [{ module: 'autoloader', visualForm: 'azCarousel', min: [-0.5, 0.6, -0.3], max: [0.5, 0.85, 0.7] }] }, null, 'measured');
  assert.equal(az.carousel?.count, 22, 'the AZ carousel\'s 22 cassettes');
  assert.ok(az.carousel.rOut <= az.wellR - 0.05 && az.carousel.rIn >= 0.14, 'its cassettes inside the well\'s wall');
  assert.equal(turretRingRadius({ modules: [] }), 0.85, 'no ring volume: the fleet median');
}

// ---- the anatomy: the ring's receipt never moves the sim's turretRing volume ----------------------------------------
{
  const source = getSpec('t72b3');
  const ring = { module: 'turretRing', min: [-0.8, 1.2, -0.7], max: [0.8, 1.45, 0.9], turretLocal: false };
  const fixture = (turretRing) => {
    const specimen = structuredClone(source);
    specimen.id = 'ring_fixture';
    specimen.armor.modules = [structuredClone(ring)];
    specimen.armor.crew = [];
    specimen.armor.turretPivot = [0, 1.5, 0.1];
    specimen.armor.hullPlates = [{ name: 'synthetic_hull', kind: 'main', physicalMm: 30, keMm: 30, ceMm: 30,
      verts: [[-1.5, 0.4, -3], [1.5, 0.4, -3], [1.5, 1.5, 3], [-1.5, 1.5, 3]] }];
    specimen.armor.turretPlates = [{ name: 'synthetic_base', kind: 'main', physicalMm: 30, keMm: 30, ceMm: 30,
      verts: [[-1, 0, -1], [1, 0, -1], [1, 0.7, 1], [-1, 0.7, 1]] }];
    const calibration = { hull: { min: [-1.5, 0.4, -3], max: [1.5, 1.5, 3] }, turret: { min: [-1, -0.3, -1], max: [1, 0.7, 1] },
      tracks: { left: { min: [-1.8, 0, -3], max: [-1.4, 0.8, 3] }, right: { min: [1.4, 0, -3], max: [1.8, 0.8, 3] } },
      hullStructures: [], turretStructures: [], hullCollision: [], turretCollision: [], moduleShapes: [],
      ...(turretRing ? { turretRing } : {}) };
    finalizeCombatAnatomy(specimen, calibration);
    return specimen.armor.modules.find((box) => box.module === 'turretRing');
  };
  const centre = (box, axis) => (box.min[axis] + box.max[axis]) / 2;
  const legacy = fixture(null);
  close(centre(legacy, 1), 1.5 - 0.3, 1e-9, 'without a receipt: the calibrated turret bottom plus the spec pivot (today)');
  close(centre(legacy, 2), 0.1, 1e-9, 'and its authored centre');
  const built = fixture({ seat: [0.02, 1.62, 0.45], deckY: 1.48, rimR: 0.86, skirt: 0.006, footR: 1.2, floorY: 0.55 });
  for (let axis = 0; axis < 3; axis++) {
    close(built.min[axis], legacy.min[axis], 1e-9, `a ring receipt leaves the volume as it was (min ${axis})`);
    close(built.max[axis], legacy.max[axis], 1e-9, `a ring receipt leaves the volume as it was (max ${axis})`);
  }
}

// ---- the live cut ------------------------------------------------------------------------------------------------
const SEAT = { cx: 0.1, cz: 0.2, deckY: 1.5, openR: 0.78, rimR: 0.84, skirt: 0.03, depth: 0.95, wellR: 0.762, skinR: Infinity,
  source: 'receipt', carousel: { count: 22, rIn: 0.14, rOut: 0.45, h: 0.33 } };
{
  const cut = turretRingCut(SEAT, 48);
  close(cut.yLo, SEAT.deckY - 0.2, 1e-9, 'a live cut reaches under the deck\'s plates');
  close(cut.top, SEAT.deckY + TURRET_RING_LIFT_M, 1e-9, 'its race\'s top');
  // a deck plane (two triangles) well past the ring, with a uv and two groups
  const deck = new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2).translate(0.1, 1.5, 0.2);
  deck.clearGroups(); deck.addGroup(0, 3, 0); deck.addGroup(3, 3, 1);
  const rim = emptyTurretRingRim(48);
  const result = cutGeometryAtTurretRing(deck, cut, null, rim);
  assert.ok(result && result !== deck, 'the deck is cut');
  assert.deepEqual(Object.keys(result.attributes).sort(), Object.keys(deck.attributes).sort(), 'every attribute carried');
  assert.equal(result.groups.length, 2, 'its groups carried');
  assert.ok(result.userData.turretRingCut, 'marked as the ring\'s cut copy');
  let area = 0;
  const uv = result.attributes.uv;
  for (let k = 0; k < result.index.count; k += 3) {
    const a = corner(result, k, 0), b = corner(result, k, 1), c = corner(result, k, 2);
    area += new THREE.Triangle(a, b, c).getArea();
    const m = a.clone().add(b).add(c).divideScalar(3);
    assert.ok(!insidePolygon(cut, m.x, m.z), 'no deck left inside the polygon');
    for (const i of [0, 1, 2]) {
      const v = result.index.getX(k + i), p = new THREE.Vector3().fromBufferAttribute(result.attributes.position, v);
      // PlaneGeometry's uv runs with x and −z (rotated): the clipped corners keep it
      close(uv.getX(v), (p.x - 0.1 + 1.5) / 3, 1e-5, 'a clipped corner\'s uv interpolated on its triangle');
    }
  }
  close(area, 9 - polygonArea(cut.r, 48), 1e-4, 'the cut takes exactly the polygon');
  for (let k = 0; k < 48; k++) {
    close(rim[k], 1.5, 1e-6, 'every side\'s cut face reaches the deck');
    close(rim[48 + k], 1.5, 1e-6, 'and lies at the deck');
  }
  assert.equal(cutGeometryAtTurretRing(new THREE.PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2).translate(3, 1.5, 0), cut, null),
    null, 'a part clear of the ring is not copied');
  // a long face running just past the rim (the shear a dent's far corner gives it): split into the polygon's sectors
  const r = cut.r + 0.02, tangent = new THREE.BufferGeometry();
  tangent.setAttribute('position', new THREE.Float32BufferAttribute([0.1 - 1.5, 1.5, 0.2 + r + 0.3, 0.1 + 1.5, 1.5, 0.2 + r + 0.3,
    0.1, 1.5, 0.2 + r], 3));
  const sheared = cutGeometryAtTurretRing(tangent, cut, null);
  assert.ok(sheared && triangles(sheared) > 6, `a long face near the rim is refined (${sheared && triangles(sheared)} pieces)`);
  let area2 = 0;
  for (let k = 0; k < sheared.index.count; k += 3) {
    const a = corner(sheared, k, 0), b = corner(sheared, k, 1), c = corner(sheared, k, 2);
    area2 += new THREE.Triangle(a, b, c).getArea();
    const near = [a, b, c].some((p) => Math.hypot(p.x - cut.cx, p.z - cut.cz) < cut.r + 0.3);
    if (!near) continue;
    const bearings = [a, b, c].map((p) => Math.atan2(p.x - cut.cx, p.z - cut.cz));
    const spread = Math.max(...bearings) - Math.min(...bearings);
    assert.ok(spread <= (2 * Math.PI) / 48 + 1e-6, 'a piece near the ring lies within one sector');
  }
  close(area2, new THREE.Triangle(...[0, 1, 2].map((i) => corner(tangent, 0, i))).getArea(), 1e-6, 'the refinement removes nothing');
}

// ---- the plate, its dents, its clock, its shader --------------------------------------------------------------------
{
  for (const sides of [64, 48]) {
    const rim = emptyTurretRingRim(sides);
    // the cut faces: the deck 2 cm lower on one side, 3 cm higher on the other
    for (let k = 0; k < sides; k++) { rim[k] = k < sides / 2 ? 1.48 : 1.53; rim[sides + k] = k < sides / 2 ? 1.46 : 1.49; }
    const geometry = buildTurretRingPlateGeometry(SEAT, sides, rim);
    const position = geometry.attributes.position, index = geometry.index.array, part = geometry.attributes.cotRingA;
    assert.equal(triangles(geometry), 11 * sides, `the plate's triangles (${triangles(geometry)})`);
    let up = 0, out = 0, inn = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let k = 0; k < index.length; k += 3) {
      a.fromBufferAttribute(position, index[k]); b.fromBufferAttribute(position, index[k + 1]); c.fromBufferAttribute(position, index[k + 2]);
      n.subVectors(b, a).cross(c.clone().sub(a));
      if (n.lengthSq() < 1e-14) continue;
      const mid = a.clone().add(b).add(c).setY(0);
      const w = part.getW(index[k]);
      if (w > 1.5) { assert.ok(n.dot(mid) < 0, 'the band\'s inner face faces the axis'); inn++; }
      else if (w > 0.5) { assert.ok(n.dot(mid) > 0, 'the band\'s outer face faces out'); out++; }
      else { assert.ok(n.y > 0, 'the race and the opening face up'); up++; }
    }
    assert.ok(up > 0 && out > 0 && inn > 0);
    const layout = geometry.userData.turretRingLayout;
    const raceTop = SEAT.deckY + TURRET_RING_LIFT_M;
    close(position.getY(layout.outer[0] + 2), 1.46 - raceTop - 0.01, 1e-6, 'the band reaches under the lowest cut face');
    close(position.getY(layout.outer[2] + 2), 0, 1e-9, 'and no higher than the race where the deck is lower');
    close(position.getY(layout.outer[2] + sides - 3), 1.53 - raceTop + 0.002, 1e-6, 'up over the highest where it stands higher');
    const A = geometry.attributes.cotRingA, B = geometry.attributes.cotRingB;
    assert.deepEqual([A.getX(0), A.getY(0), A.getZ(0)].map((v) => +v.toFixed(4)), [0.78, 0.95, 0.84], 'the well rides the vertices');
    assert.deepEqual([B.getX(0), B.getY(0), B.getZ(0), B.getW(0)].map((v) => +v.toFixed(4)), [22, 0.14, 0.45, 0.33], 'and its carousel');
    assert.equal(geometry.userData.provenance?.creator, 'Kevin B. Liu', 'the plate is first-party');
  }
  // the hull's dents: the field at every vertex; the rim's columns never under the field between two of them
  const geometry = buildTurretRingPlateGeometry(SEAT, 48, null);
  const origin = new THREE.Vector3(SEAT.cx, SEAT.deckY + TURRET_RING_LIFT_M, SEAT.cz);
  const dent = { centres: [new THREE.Vector4(0.1 + 0.84, 1.504, 0.2, 0.36), new THREE.Vector4(0, 0, 0, 0)],
    dirs: [new THREE.Vector4(0, 0.7071, 0.7071, 0.25), new THREE.Vector4(0, 0, 0, 0)] };
  assert.equal(turretRingPlateDents(geometry, origin, { centres: [new THREE.Vector4(0, 0, 0, 0)], dirs: [new THREE.Vector4(0, 0, 0, 0)] }),
    null, 'no dents, no offsets');
  const offsets = turretRingPlateDents(geometry, origin, dent);
  const layout = geometry.userData.turretRingLayout, position = geometry.attributes.position;
  const field = (x, y, z) => {
    const r2 = (x - 0.94) ** 2 + (y - 1.504) ** 2 + (z - 0.2) ** 2;
    const s = r2 < 0.36 ? 0.25 * (1 - r2 / 0.36) ** 2 : 0;
    return [0, 0.7071 * s, 0.7071 * s];
  };
  const rimColumns = new Set();
  for (const start of [layout.rim, ...layout.outer, ...layout.inner]) for (let k = 0; k < 48; k++) rimColumns.add(start + k);
  let bowed = 0;
  for (let i = layout.rim; i < position.count; i++) {
    const f = field(position.getX(i) + origin.x, position.getY(i) + origin.y, position.getZ(i) + origin.z);
    close(offsets[i * 3], f[0], 1e-6, 'the field at a plate vertex (x)');
    close(offsets[i * 3 + 2], f[2], 1e-6, 'the field at a plate vertex (z)');
    if (!rimColumns.has(i)) close(offsets[i * 3 + 1], f[1], 1e-6, 'the field at a plate vertex (y)');
    else if (Math.abs(offsets[i * 3 + 1] - f[1]) > 1e-6) bowed++;
  }
  assert.ok(bowed > 0, 'the rim rises over the field\'s bow by the dent');
  // (233) inside the rim's ring the opening and the race's inner edge move as one plane: one translation, one tilt
  for (let i = 1; i < layout.rim; i++) {
    close(offsets[i * 3], offsets[0], 1e-9, 'the opening translates as one (x)');
    close(offsets[i * 3 + 2], offsets[2], 1e-9, 'the opening translates as one (z)');
  }
  const tilt = (i) => offsets[i * 3 + 1] - offsets[1];
  const ring0 = 1, n0 = 48;
  for (let k = 0; k < n0 / 2; k++) close(tilt(ring0 + k) + tilt(ring0 + k + n0 / 2), 0, 1e-9, 'the opening tilts as a plane');
  for (let k = 0; k < 48; k++) {
    const a = layout.rim + k, b = layout.rim + ((k + 1) % 48);
    for (const t of [0.25, 0.5, 0.75]) {
      const x = origin.x + position.getX(a) + (position.getX(b) - position.getX(a)) * t;
      const z = origin.z + position.getZ(a) + (position.getZ(b) - position.getZ(a)) * t;
      const y = origin.y + position.getY(a);
      const lerp = offsets[a * 3 + 1] + (offsets[b * 3 + 1] - offsets[a * 3 + 1]) * t;
      assert.ok(lerp >= field(x, y, z)[1] - 1e-6, 'the race\'s edge never under the field between its corners');
    }
  }
  // the burn clock: the hook's smoothstep over 0.35 s
  assert.equal(turretRingDentShare(-1), 0, 'a disarmed burn bends nothing');
  assert.equal(turretRingDentShare(0), 0);
  close(turretRingDentShare(0.175), 0.5, 1e-12, 'half way through the ramp, half the dent');
  assert.equal(turretRingDentShare(0.35), 1);
  assert.equal(turretRingDentShare(1000), 1);
  // the shader: every chunk it patches is in three's standard program, in order, after the vehicle's floor hook
  const material = createTurretRingWellMaterial(null);
  const other = createTurretRingWellMaterial(null);
  assert.notEqual(other, material, 'a material per wreck (its ground reference per draw)');
  assert.equal(material.customProgramCacheKey(), other.customProgramCacheKey(), 'one program for the fleet');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader, null);
  const vs = shader.vertexShader, fs = shader.fragmentShader;
  assert.ok(/attribute vec2 cotRingUv;/.test(vs) && vs.indexOf('vCotRingX = normalize') > vs.indexOf('#include <project_vertex>'),
    'the ring frame rides out of the vertex stage');
  const at = (text) => { const i = fs.indexOf(text); assert.ok(i >= 0, `fragment carries ${text}`); return i; };
  assert.ok(at('#include <color_fragment>') < at('bool cotRingInWell = false;'), 'the trace after the paint');
  assert.ok(at('vCotRingA.w > 1.5') < at('vCotRingA.w > 0.5'), 'the band\'s inner face, then its outer face');
  assert.ok(at('float cotRingSun = 1.0;') < at('roughnessFactor = cotRingRough;'), 'its roughness');
  assert.ok(at('#include <normal_fragment_maps>') < at('if ( cotRingInWell ) normal = normalize('), 'the hit\'s normal for the light');
  assert.ok(at('uVehGround') >= 0 && at('reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse')
    < at('reflectedLight.directDiffuse *= cotRingSun;'), 'the well\'s light shares after the vehicle\'s readability floors');
  assert.ok(at('reflectedLight.indirectSpecular *= cotRingSky;') < at('#include <aomap_fragment>'), 'before the ao');
  assert.ok(!/\$\{/.test(vs + fs), 'no unexpanded template');
  material.dispose(); other.dispose();
}

// ---- the hulk's cut and well (synthetic) ---------------------------------------------------------------------------
{
  const plan = planTurretRingHulk({ ...SEAT, wellR: 0.6 }, []);
  const [race, well] = plan.cuts;
  close(race.r, SEAT.rimR, 1e-9, 'the race\'s cut on the rim');
  close(race.yLo, SEAT.deckY - 0.055, 1e-9, 'from the lip up');
  close(well.r, 0.6, 1e-9, 'the well\'s on its wall (a ledge under the lip)');
  close(well.yHi, race.yLo, 1e-9, 'under the lip');
  close(well.yLo, SEAT.deckY - SEAT.depth - 0.02, 1e-9, 'down to the floor');
  assert.ok(plan.seat.carousel.rOut <= 0.55 + 1e-9, 'the carousel inside the narrowed wall');
  // a box under the deck crossing the well's prism: every part of it outside is kept (none dropped whole)
  const box = new THREE.BoxGeometry(2.4, 0.3, 0.4).translate(0.1, 1.0, 0.2).toNonIndexed();
  const result = cutTurretRingAperture(box, plan.cuts, null);
  assert.notEqual(result, box, 'the box is cut');
  let kept = 0;
  const p = result.attributes.position;
  for (let k = 0; k < p.count; k += 3) {
    const a = corner(result, k, 0), b = corner(result, k, 1), c = corner(result, k, 2);
    kept += new THREE.Triangle(a, b, c).getArea();
    const m = a.clone().add(b).add(c).divideScalar(3);
    assert.ok(!insidePolygon(well, m.x, m.z) || m.y < well.yLo, 'nothing left inside the well');
  }
  // the box's area outside the well's polygon: its ends, and its long faces past the polygon
  let outside = 0;
  const sampled = (tri) => {
    const [a, b, c] = tri, ab = b.clone().sub(a), ac = c.clone().sub(a);
    const area = ab.clone().cross(ac).length() / 2;
    let n = 0, out = 0;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40 - i; j++) {
      const q = a.clone().addScaledVector(ab, (i + 1 / 3) / 40).addScaledVector(ac, (j + 1 / 3) / 40);
      n++; if (!insidePolygon(well, q.x, q.z, 0)) out++;
    }
    return area * out / n;
  };
  for (let k = 0; k < box.attributes.position.count; k += 3) outside += sampled([corner(box, k, 0), corner(box, k, 1), corner(box, k, 2)]);
  close(kept, outside, 0.01 * outside, 'a crossing part keeps every face it has outside the prism');
  // the well: closed to the eye from the opening (every face toward the axis or up), its band from the cut faces
  const rim = emptyTurretRingRim(48);
  for (let k = 0; k < 48; k++) { rim[k] = 1.52; rim[48 + k] = 1.47; }
  const geometry = buildTurretRingWellGeometry(plan.seat, rim, 48);
  assert.ok(triangles(geometry) > 400 && triangles(geometry) < 1400, `the well's triangles (${triangles(geometry)})`);
  const w = geometry.attributes.position.array, wn = geometry.attributes.normal.array;
  let bandTop = -Infinity, bandBottom = Infinity, ledge = 0;
  for (let k = 0; k < w.length; k += 9) {
    const e = new THREE.Vector3(w[k + 3] - w[k], w[k + 4] - w[k + 1], w[k + 5] - w[k + 2])
      .cross(new THREE.Vector3(w[k + 6] - w[k], w[k + 7] - w[k + 1], w[k + 8] - w[k + 2]));
    assert.ok(e.dot(new THREE.Vector3(wn[k], wn[k + 1], wn[k + 2])) > 0, 'each well face is wound toward its normal');
    for (let i = 0; i < 9; i += 3) {
      const r = Math.hypot(w[k + i] - SEAT.cx, w[k + i + 2] - SEAT.cz);
      if (Math.abs(r - SEAT.rimR) < 1e-4) { bandTop = Math.max(bandTop, w[k + i + 1]); bandBottom = Math.min(bandBottom, w[k + i + 1]); }
      if (Math.abs(r - 0.6) < 1e-4 && Math.abs(w[k + i + 1] - (SEAT.deckY - 0.055)) < 1e-4 && wn[k + 1] > 0.9) ledge++;
    }
  }
  close(bandTop, 1.52 + 0.002, 1e-5, 'the band up over the cut faces standing over the race');
  // past the lowest cut face, and on every bearing past the lip (the exterior pass counts on it), by a hulk's pad
  close(bandBottom, Math.min(1.47, SEAT.deckY - 0.055) - 0.03, 1e-5, 'and down past the lowest and past the lip');
  assert.ok(ledge > 0, 'the step under the lip runs in to the narrowed wall');
  assert.equal(geometry.userData.provenance?.creator, 'Kevin B. Liu');
}

// ---- a live wreck: the T-72B3 builder (its doubled roof sheet 1.3 mm under the deck) -------------------------------
{
  const id = 't72b3';
  const receiptBuild = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const receipt = measureTurretRing(receiptBuild.root.getObjectByName('rig_hull'), receiptBuild.root.getObjectByName('rig_turret'),
    turretRingRadius(getSpec(id).armor), { exterior: true });
  receiptBuild.dispose();
  assert.ok(receipt, 'the T-72B3 has its ring');
  close(receipt.deckY, 1.458, 0.003, 'the race lies on the deck, over the doubled roof sheet under it');
  const calibration = combatAnatomyCalibration(id);
  const runs = [];
  const materials = [];
  for (const withReceipt of [true, false]) {
    registerCombatAnatomyCalibrations({ [id]: withReceipt ? { ...calibration, turretRing: receipt } : calibration });
    const visual = createTank(id, null, { camoSeed: 77, quality: 'low', geometryQuality: 'high', batchStatic: true,
      battleDetailLod: true, eraVisualBindingReceipt: false });
    const plates = () => { const list = []; visual.root.traverse((o) => { if (o.userData?.turretRingPlate) list.push(o); }); return list; };
    const held = () => { const map = new Map(); visual.root.traverse((o) => { if (o.isMesh) map.set(o, o.geometry); }); return map; };
    const hull = visual.root.getObjectByName('rig_hull');
    const turret = visual.root.getObjectByName('rig_turret');
    const seat = turret.position.clone();
    const intact = geometryFingerprint(visual.root);
    const before = held();
    assert.equal(plates().length, 0, 'an intact tank holds no ring plate');
    const restore = visual.stageBattleDetailsForWarm();
    assert.equal(plates().length, 1, 'the covered wreck warm stages one plate for its program');
    restore();
    assert.equal(plates().length, 0, 'and takes it off again');
    assert.equal(geometryFingerprint(visual.root), intact, 'the warm leaves the intact fingerprint byte-identical');
    visual.setDestroyed({ pop: true, ageS: 0 });
    const [plate, ...extra] = plates();
    assert.ok(plate && !extra.length, 'the kill puts exactly one ring plate on the hull');
    assert.equal(plate.parent, hull, 'on rig_hull (it stays when the turret leaves)');
    assert.equal(plate.name, TURRET_RING_PLATE_NAME);
    assert.ok(!Array.isArray(plate.material) && plate.material.name === 'TurretRingWell', 'its own ring material, one draw');
    materials.push(plate.material);
    assert.equal(plate.castShadow, false, 'the hull\'s proxies cast its shadow');
    close(Math.hypot(plate.position.x - seat.x, plate.position.z - seat.z), 0, 0.01, 'centred on the built seat');
    const ring = plate.userData.turretRingSeat;
    assert.equal(ring.source, withReceipt ? 'receipt' : 'measured');
    if (withReceipt) close(plate.position.y, receipt.deckY + TURRET_RING_LIFT_M, 1e-9, 'seated on the receipt\'s deck');
    assert.equal(ring.carousel?.count, 22, 'the AZ carousel in its well');
    // the hull: cut copies on the meshes crossing the prism, nothing of it left inside the polygon over the cut's floor
    const cut = turretRingCut(ring, turretRingSides(true));
    const inv = hull.matrixWorld.clone().invert();
    let swapped = 0;
    const turretSide = (mesh) => { for (let o = mesh.parent; o; o = o.parent) if (o === turret) return true; return false; };
    for (const [mesh, geometry] of before) {
      // (the gun swaps its own meshes for bent copies at the kill: wreckDents.ts)
      if (mesh.geometry === geometry || turretSide(mesh)) continue;
      swapped++;
      assert.ok(mesh.geometry.userData.turretRingCut, 'a swapped mesh holds the ring\'s cut copy');
      const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
      const g = mesh.geometry;
      for (let k = 0; k < g.index.count; k += 3) {
        const c = [0, 1, 2].map((i) => corner(g, k, i).applyMatrix4(m)).reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(3);
        if (c.y > cut.yLo + 1e-4 && c.y < cut.yHi - 1e-4) assert.ok(!insidePolygon(cut, c.x, c.z, 1e-4), `nothing of ${mesh.name} inside the ring`);
      }
    }
    assert.ok(swapped >= 1, `the deck's meshes are cut (${swapped})`);
    // the clock: no dent share at the kill; the wreck's age brings it in
    const rest = plate.geometry.attributes.position.array.slice();
    visual.setDestroyed({ pop: false });
    assert.equal(plates().length, 1, 'setDestroyed is idempotent');
    runs.push(ring);
    visual.resetDestroyed();
    assert.equal(plates().length, 0, 'the rematch removes it');
    for (const [mesh, geometry] of held()) assert.equal(geometry, before.get(mesh), 'every mesh back on the geometry it held');
    assert.equal(geometryFingerprint(visual.root), intact, 'and the fingerprint is byte-identical to the intact tank\'s');
    // an aged kill takes the whole dent share (where there are dents)
    visual.setDestroyed({ pop: true, ageS: 1000 });
    const aged = plates()[0];
    const moved = aged.geometry.attributes.position.array.some((v, i) => Math.abs(v - rest[i]) > 1e-7);
    const burn = (() => { let u = null; visual.root.traverse((o) => { if (!u && o.isMesh) for (const mm of [].concat(o.material)) if (mm?.userData?.__burnU) u = mm.userData.__burnU; }); return u; })();
    assert.equal(moved, !!burn?.uCrOn.value, 'the plate bends with the hull\'s dents once the clock has run');
    visual.resetDestroyed();
    visual.dispose();
  }
  assert.notEqual(materials[0], materials[1], 'each wreck its own ring material');
  close(runs[0].deckY, runs[1].deckY, 0.003, 'the build\'s own measure agrees with the receipt (deck)');
  close(runs[0].rimR, runs[1].rimR, 0.01, 'the build\'s own measure agrees with the receipt (race)');
  registerCombatAnatomyCalibrations({ [id]: calibration });
}

// ---- a hulk: the ring merged into the one mesh, the placement exactly the ring-less bake's --------------------------
{
  const pop = bakeTankWreck(null, 't72b3', { seed: 4242, pop: true });
  const bare = bakeTankWreck(null, 't72b3', { seed: 4242, pop: true, ring: false });
  assert.ok(pop && bare);
  assert.ok(pop.tris > bare.tris && pop.tris < bare.tris + 4000, `the well and the cut deck (${bare.tris} -> ${pop.tris})`);
  for (const key of ['budgetTris', 'hx', 'hz', 'h', 'placeHx', 'placeHz']) assert.equal(pop[key], bare[key], `the hulk's ${key} holds`);
  assert.deepEqual(pop.contact, bare.contact, 'its ground contact holds');
  assert.deepEqual(pop.solids, bare.solids, 'its collision holds');
  assert.deepEqual(pop.shellSolids, bare.shellSolids, 'its shell record holds');
  assert.deepEqual(Array.from(pop.shadowGeo.attributes.position.array), Array.from(bare.shadowGeo.attributes.position.array), 'its shadow holds');
  const plain = bakeTankWreck(null, 't72b3', { seed: 4242, pop: false });
  const plainBare = bakeTankWreck(null, 't72b3', { seed: 4242, pop: false, ring: false });
  assert.equal(plain.tris, plainBare.tris, 'a plain kill\'s turret covers its ring: no well');
  assert.deepEqual(Array.from(plain.geo.attributes.position.array), Array.from(plainBare.geo.attributes.position.array));
  for (const bake of [pop, bare, plain, plainBare]) { bake.geo.dispose(); bake.shadowGeo?.dispose(); }
}

// ---- the wiring --------------------------------------------------------------------------------------------------------
{
  const core = readFileSync(new URL('./tankFactoryCore.ts', import.meta.url), 'utf8');
  assert.match(core, /applyWreckMaterials\(\);\s*planLiveCrumple\(!!\(opts && opts\.pop\)\);\s*(?:\/\/[^\n]*\n\s*)*turretRing\.show\(\);/,
    'the cut and the plate come after the sweep captured the live materials, on the planned dents, the turret still seated');
  assert.match(core, /burnU\.uBurnT\.value = ageS;\s*(?:\/\/[^\n]*\n\s*)*turretRing\.ramp\(ageS\);/, 'the clock at the kill');
  assert.match(core, /burnU\.uBurnT\.value = wreckAge;\s*turretRing\.ramp\(wreckAge\);/, 'and every frame after');
  assert.match(core, /resetLiveCrumple\(\);\s*turretRing\.hide\(\);/, 'the rematch undoes it');
  assert.match(core, /dispose\(\) \{\s*equipmentDamage\.dispose\(\);\s*turretRing\.dispose\(\);/, 'and dispose frees it');
  const generator = readFileSync(new URL('../../tools/gen-combat-anatomy.mjs', import.meta.url), 'utf8');
  assert.match(generator, /measureTurretRing\(hullRig, turretRig, turretRingRadius\(TANK_SPECS\[id\]\?\.armor\), \{ exterior: true \}\)/,
    'the anatomy generator records the ring as built, over the hull\'s skin');
}
console.log('turretRingWell selftest: ok');
