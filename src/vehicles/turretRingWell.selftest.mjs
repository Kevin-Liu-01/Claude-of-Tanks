// The ring a destroyed tank's turret leaves (tank-opt RING stream, 2026-10-16; the owner, 2026-10-15: "give tanks proper
// turret ring areas because when the turret blows off we should see that"). Copyright © 2026 Kevin B. Liu; first-party
// Reserved Content (NOTICE.md). provenance: urn:claude-of-tanks:qa:turret-ring-well-selftest
//
//  - the measure on a built hull and turret (the deck under the race, the turret base, the skirt, the floor);
//  - the anatomy: alignTurretRing centres the turretRing volume on the receipt's seat and deck, and keeps today's law
//    without one;
//  - the plate: faces up, its skirt out, the hull's dents bend it; the well's shader lands in every chunk it patches;
//  - a live wreck (the T-72B3 builder, whose doubled roof sheet lies 1.3 mm under its deck): intact it holds no plate
//    and the warm's staged plate leaves again; the kill puts one plate on rig_hull, centred on the built seat, over the
//    deck; the rematch removes it and the fingerprint is byte-identical; a receipt and the build's own measure agree;
//  - a hulk: the deck cut, the well merged into the one mesh, the placement budget, envelope, contact, collision and
//    shadow exactly the ring-less bake's; a plain kill's hulk takes no ring.
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
  cutTurretRingAperture, dentTurretRingPlate, measureTurretRing, turretRingCut, turretRingRadius, turretRingSeatFrom,
  turretRingWellMaterial,
} from './turretRingWell.ts';
import { bakeTankWreck } from '../world/wrecks.ts';

// the browser's demand-loaded fleet (the bake builds through it too): the T-72B3's builders, anatomy and fills
await ensureTankBuilder('t72b3');

const close = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (±${tol})`);
const triangles = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

// ---- the measure on a synthetic rig ---------------------------------------------------------------------------------
{
  const root = new THREE.Group();
  const hull = new THREE.Group(); hull.name = 'rig_hull';
  const turret = new THREE.Group(); turret.name = 'rig_turret';
  root.add(hull, turret);
  const mat = new THREE.MeshStandardMaterial();
  // a closed hull box, deck at 1.5, belly at 0.45; a 3 cm plinth of 0.9 m round the seat
  const box = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 6.5), mat);
  box.position.set(0, 0.975, 0.2);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.03, 48), mat);
  plinth.position.set(0, 1.515, 0.2);
  hull.add(box, plinth);
  // the turret: a 1.3 m base cylinder seated on the collar; a narrow neck under it into the hull
  turret.position.set(0, 1.53, 0.2);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.7, 48), mat);
  shell.position.y = 0.35;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 32), mat);
  neck.position.y = -0.2;
  turret.add(shell, neck);
  root.updateMatrixWorld(true);
  const receipt = measureTurretRing(hull, turret, 0.82);
  assert.ok(receipt, 'a turreted synthetic hull has a ring');
  assert.deepEqual(receipt.seat, [0, 1.53, 0.2], 'the seat is the rig_turret origin in the hull frame');
  close(receipt.deckY, 1.53, 1e-3, 'the race sits on the plinth under it');
  assert.ok(receipt.footR > 1.2 && receipt.footR <= 1.31, `the turret base counts its shell over the neck (${receipt.footR})`);
  assert.ok(receipt.rimR > 0.82 && receipt.rimR <= receipt.footR - 0.019, `the race: the ring and its flange, inside the base (${receipt.rimR})`);
  assert.ok(receipt.skirt >= 0.03 && receipt.skirt <= 0.045, `the skirt reaches the deck past the plinth (${receipt.skirt})`);
  close(receipt.floorY, 0.45 + 0.1, 0.02, 'the well floor stands a floor plate over the belly');
  const seat = turretRingSeatFrom(receipt, null, null, 'measured');
  assert.ok(seat.openR < seat.rimR && seat.openR > 0.7, 'the opening is the race\'s inner edge');
  close(seat.depth, receipt.deckY - receipt.floorY, 1e-9, 'the well runs from the deck to its floor');
  assert.equal(seat.carousel, null, 'no autoloader, no carousel');
  // the carousel from the anatomy's autoloader volume
  const az = turretRingSeatFrom(receipt, { modules: [{ module: 'autoloader', visualForm: 'azCarousel', min: [-0.5, 0.6, -0.3], max: [0.5, 0.85, 0.7] }] }, null, 'measured');
  assert.equal(az.carousel?.count, 22, 'the AZ carousel\'s 22 cassettes');
  assert.ok(az.carousel.rOut <= az.openR - 0.05 && az.carousel.rIn >= 0.14, 'its cassettes inside the opening');
  // a turretless hull has no ring to measure from: a casemate's anatomy keeps no turretRing
  assert.equal(turretRingRadius({ modules: [] }), 0.85, 'no ring volume: the fleet median');
}

// ---- the anatomy: alignTurretRing on the receipt ------------------------------------------------------------------
{
  const source = getSpec('t72b3');
  const ring = { module: 'turretRing', min: [-0.8, 1.2, -0.7], max: [0.8, 1.45, 0.9], turretLocal: false };
  const fixture = (turretRing) => {
    const specimen = structuredClone(source);
    specimen.id = 'ring_fixture';
    specimen.armor.modules = [structuredClone(ring)];
    specimen.armor.crew = [];
    specimen.armor.turretPivot = [0, 1.5, 0.1];
    // plates spanning the calibration exactly: its frame maps every hull volume onto itself
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
  close(centre(built, 0), 0.02, 1e-9, 'the volume on the built seat\'s axis (x)');
  close(centre(built, 2), 0.45, 1e-9, 'the volume on the built seat\'s axis (z)');
  close(centre(built, 1), 1.48, 1e-9, 'centred on the deck under the built ring');
  close(built.max[1] - built.min[1], 0.25, 1e-9, 'its thickness and footprint kept');
  close(built.max[0] - built.min[0], 1.6, 1e-9, 'its lateral size kept');
}

// ---- the plate, its dents, its shader -------------------------------------------------------------------------------
{
  const seat = { cx: 0.1, cz: 0.2, deckY: 1.5, openR: 0.78, rimR: 0.84, skirt: 0.03, depth: 0.95, source: 'receipt',
    carousel: { count: 22, rIn: 0.14, rOut: 0.45, h: 0.33 } };
  for (const high of [true, false]) {
    const geometry = buildTurretRingPlateGeometry(seat, high);
    const position = geometry.attributes.position, index = geometry.index.array, part = geometry.attributes.cotRingA;
    assert.ok(triangles(geometry) <= (high ? 528 : 264), `the plate's triangle budget (${triangles(geometry)})`);
    let up = 0, out = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let k = 0; k < index.length; k += 3) {
      a.fromBufferAttribute(position, index[k]); b.fromBufferAttribute(position, index[k + 1]); c.fromBufferAttribute(position, index[k + 2]);
      n.subVectors(b, a).cross(c.clone().sub(a));
      if (part.getW(index[k]) > 0.5) {
        const mid = a.clone().add(b).add(c).setY(0);
        assert.ok(n.dot(mid) > 0, 'the skirt faces out');
        out++;
      } else {
        assert.ok(n.y > 0, 'the race and the opening face up');
        up++;
      }
    }
    assert.ok(up > 0 && out > 0);
    const A = geometry.attributes.cotRingA, B = geometry.attributes.cotRingB;
    assert.deepEqual([A.getX(0), A.getY(0), A.getZ(0)].map((v) => +v.toFixed(4)), [0.78, 0.95, 0.84], 'the well rides the vertices');
    assert.deepEqual([B.getX(0), B.getY(0), B.getZ(0), B.getW(0)].map((v) => +v.toFixed(4)), [22, 0.14, 0.45, 0.33], 'and its carousel');
    assert.equal(geometry.userData.provenance?.creator, 'Kevin B. Liu', 'the plate is first-party');
  }
  // the hull's dents bend the plate as the burn hook bends the deck under it ((1 - r²/R²)² · depth inward)
  const geometry = buildTurretRingPlateGeometry(seat, false);
  const origin = new THREE.Vector3(seat.cx, seat.deckY + TURRET_RING_LIFT_M, seat.cz);
  const before = geometry.attributes.position.array.slice();
  dentTurretRingPlate(geometry, origin, {
    centres: [new THREE.Vector4(0.1 + 0.84, 1.504, 0.2, 0.36), new THREE.Vector4(0, 0, 0, 0)],
    dirs: [new THREE.Vector4(0, -1, 0, 0.2), new THREE.Vector4(0, 0, 0, 0)],
  });
  const after = geometry.attributes.position.array;
  let deepest = 0;
  for (let i = 0; i < after.length; i += 3) {
    const dy = after[i + 1] - before[i + 1];
    const r2 = (before[i] + seat.cx - 0.94) ** 2 + (before[i + 1] + origin.y - 1.504) ** 2 + (before[i + 2] + seat.cz - 0.2) ** 2;
    const expect = r2 < 0.36 ? -0.2 * (1 - r2 / 0.36) ** 2 : 0;
    close(dy, expect, 1e-6, 'the dent field at a plate corner');
    deepest = Math.min(deepest, dy);
    close(after[i], before[i], 0, 'a downward dent moves no corner sideways');
  }
  assert.ok(deepest < -0.15, 'the rim under the dent sinks with the deck');
  // the shader: every chunk it patches is in three's standard program, in order, after the vehicle's floor hook
  const material = turretRingWellMaterial(null);
  assert.equal(turretRingWellMaterial(null), material, 'one material for the fleet (per engine context)');
  assert.notEqual(turretRingWellMaterial({ anisotropy: 4 }), material, 'another engine context, its own registration');
  assert.equal(material.customProgramCacheKey(), 'turret-ring-well-v1');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader, null);
  const vs = shader.vertexShader, fs = shader.fragmentShader;
  assert.ok(/attribute vec2 cotRingUv;/.test(vs) && vs.indexOf('vCotRingX = normalize') > vs.indexOf('#include <project_vertex>'),
    'the ring frame rides out of the vertex stage');
  const at = (text) => { const i = fs.indexOf(text); assert.ok(i >= 0, `fragment carries ${text}`); return i; };
  assert.ok(at('#include <color_fragment>') < at('bool cotRingInWell = false;'), 'the trace after the paint');
  assert.ok(at('float cotRingSun = 1.0;') < at('roughnessFactor = cotRingRough;'), 'its roughness');
  assert.ok(at('#include <normal_fragment_maps>') < at('if ( cotRingInWell ) normal = normalize('), 'the hit\'s normal for the light');
  assert.ok(at('uVehGround') >= 0 && at('reflectedLight.indirectDiffuse = max( reflectedLight.indirectDiffuse')
    < at('reflectedLight.directDiffuse *= cotRingSun;'), 'the well\'s light shares after the vehicle\'s readability floors');
  assert.ok(at('reflectedLight.indirectSpecular *= cotRingSky;') < at('#include <aomap_fragment>'), 'before the ao');
  assert.ok(at('directionalLights[ 0 ].direction') > 0 && at('#if NUM_DIR_LIGHTS > 0') > 0, 'the sun through the opening');
  assert.ok(!/\$\{/.test(vs + fs), 'no unexpanded template');
}

// ---- the hulk's cut and well (synthetic) ---------------------------------------------------------------------------
{
  const seat = { cx: 0, cz: 0, deckY: 1.5, openR: 0.8, rimR: 0.86, skirt: 0.006, depth: 0.9, source: 'receipt', carousel: null };
  const cut = turretRingCut(seat);
  // a deck plane well past the race, two triangles; a box under it inside the hull (its inside: dropped whole)
  const deck = new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2).translate(0, 1.5, 0);
  const result = cutTurretRingAperture(deck, cut, null);
  assert.notEqual(result, deck, 'the deck is cut');
  const p = result.attributes.position.array;
  let area = 0;
  for (let k = 0; k < p.length; k += 9) {
    const ux = p[k + 3] - p[k], uz = p[k + 5] - p[k + 2], vx = p[k + 6] - p[k], vz = p[k + 8] - p[k + 2];
    area += Math.abs(ux * vz - uz * vx) / 2;
    const cx = (p[k] + p[k + 3] + p[k + 6]) / 3, cz = (p[k + 2] + p[k + 5] + p[k + 8]) / 3;
    assert.ok(Math.hypot(cx, cz) > 0.8 * Math.cos(Math.PI / 16) - 1e-6, 'no deck left inside the opening');
  }
  const polygon = 16 * 0.8 * 0.8 * Math.tan(Math.PI / 16);
  close(area, 9 - polygon, 1e-4, 'the cut removes exactly the 16-gon round the opening');
  const far = new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2).translate(2.5, 1.5, 0);
  assert.equal(cutTurretRingAperture(far, cut, null), far, 'a part clear of the ring is the same geometry');
  const inner = new THREE.BoxGeometry(2.4, 0.3, 0.4).translate(0, 1.0, 0);
  // its four long faces cross the ring under the deck (dropped whole: the hull's inside, behind the well's wall); its two
  // ends lie clear of it (as they are)
  assert.equal(triangles(cutTurretRingAperture(inner, cut, null)), 4, 'the hull\'s inside under the deck is dropped whole where it crosses');
  // the well: closed to the eye from the opening (every face toward the axis or up), first-party
  const well = buildTurretRingWellGeometry({ ...seat, carousel: { count: 22, rIn: 0.14, rOut: 0.45, h: 0.3 } }, false);
  assert.ok(triangles(well) > 300 && triangles(well) < 900, `the well's triangles (${triangles(well)})`);
  const w = well.attributes.position.array, wn = well.attributes.normal.array;
  for (let k = 0; k < w.length; k += 9) {
    const e = new THREE.Vector3(w[k + 3] - w[k], w[k + 4] - w[k + 1], w[k + 5] - w[k + 2])
      .cross(new THREE.Vector3(w[k + 6] - w[k], w[k + 7] - w[k + 1], w[k + 8] - w[k + 2]));
    assert.ok(e.dot(new THREE.Vector3(wn[k], wn[k + 1], wn[k + 2])) > 0, 'each well face is wound toward its normal');
  }
  assert.equal(well.userData.provenance?.creator, 'Kevin B. Liu');
}

// ---- a live wreck: the T-72B3 builder (its doubled roof sheet 1.3 mm under the deck) -------------------------------
{
  const id = 't72b3';
  const receiptBuild = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const receipt = measureTurretRing(receiptBuild.root.getObjectByName('rig_hull'), receiptBuild.root.getObjectByName('rig_turret'),
    turretRingRadius(getSpec(id).armor));
  receiptBuild.dispose();
  assert.ok(receipt, 'the T-72B3 has its ring');
  close(receipt.deckY, 1.458, 0.003, 'the race sits on the deck, over the doubled roof sheet under it');
  const calibration = combatAnatomyCalibration(id);
  const runs = [];
  for (const withReceipt of [true, false]) {
    registerCombatAnatomyCalibrations({ [id]: withReceipt ? { ...calibration, turretRing: receipt } : calibration });
    const visual = createTank(id, null, { camoSeed: 77, quality: 'low', geometryQuality: 'high', batchStatic: true,
      battleDetailLod: true, eraVisualBindingReceipt: false });
    const plates = () => { const list = []; visual.root.traverse((o) => { if (o.userData?.turretRingPlate) list.push(o); }); return list; };
    const hull = visual.root.getObjectByName('rig_hull');
    const turret = visual.root.getObjectByName('rig_turret');
    const seat = turret.position.clone();
    const intact = geometryFingerprint(visual.root);
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
    assert.ok(!Array.isArray(plate.material) && plate.material === turretRingWellMaterial(null), 'one fleet material, one draw');
    assert.equal(plate.castShadow, false, 'the hull\'s proxies cast its shadow');
    close(Math.hypot(plate.position.x - seat.x, plate.position.z - seat.z), 0, 0.01, 'centred on the built seat');
    assert.ok(plate.position.y >= receipt.deckY + TURRET_RING_LIFT_M - 0.006, 'over the deck');
    assert.equal(plate.userData.turretRingSeat.source, withReceipt ? 'receipt' : 'measured');
    if (withReceipt) close(plate.position.y, receipt.deckY + TURRET_RING_LIFT_M, 1e-9, 'seated on the receipt\'s deck');
    assert.equal(plate.userData.turretRingSeat.carousel?.count, 22, 'the AZ carousel in its well');
    runs.push(plate.userData.turretRingSeat);
    visual.setDestroyed({ pop: false });
    assert.equal(plates().length, 1, 'setDestroyed is idempotent');
    visual.resetDestroyed();
    assert.equal(plates().length, 0, 'the rematch removes it');
    assert.equal(geometryFingerprint(visual.root), intact, 'and the fingerprint is byte-identical to the intact tank\'s');
    visual.dispose();
  }
  close(runs[0].deckY, runs[1].deckY, 0.003, 'the build\'s own measure agrees with the receipt (deck)');
  close(runs[0].rimR, runs[1].rimR, 0.01, 'the build\'s own measure agrees with the receipt (race)');
  registerCombatAnatomyCalibrations({ [id]: calibration });
}

// ---- a hulk: the ring merged into the one mesh, the placement exactly the ring-less bake's --------------------------
{
  const pop = bakeTankWreck(null, 't72b3', { seed: 4242, pop: true });
  const bare = bakeTankWreck(null, 't72b3', { seed: 4242, pop: true, ring: false });
  assert.ok(pop && bare);
  assert.ok(pop.tris > bare.tris && pop.tris < bare.tris + 2500, `the well and the cut deck (${bare.tris} -> ${pop.tris})`);
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
    'the plate comes after the sweep captured the live materials, on the planned dents, the turret still seated');
  assert.match(core, /resetLiveCrumple\(\);\s*turretRing\.hide\(\);/, 'and leaves at the rematch');
  assert.match(core, /dispose\(\) \{\s*equipmentDamage\.dispose\(\);\s*turretRing\.hide\(\);/, 'and at dispose');
  const generator = readFileSync(new URL('../../tools/gen-combat-anatomy.mjs', import.meta.url), 'utf8');
  assert.match(generator, /measureTurretRing\(hullRig, turretRig, turretRingRadius\(TANK_SPECS\[id\]\?\.armor\)\)/,
    'the anatomy generator records the ring as built');
}
console.log('turretRingWell selftest: ok');
