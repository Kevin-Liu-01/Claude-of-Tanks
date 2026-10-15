import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from './garageVariants.ts';
import {
  BURLAK_SCAFFOLD_CLEARANCE_OFFSET,
  getAbramsWeldingBayPlacement,
  getGarageWorkshopLayoutPose,
  leopardBayPointToWorkshop,
} from './garageWorkshopLayout.ts';
import { createGarageArchitectureController } from '../ui/garageArchitecture.ts';
import { getGarageFacilityTerraces } from '../ui/garageFacilityDetails.ts';
import { garageViewPoint } from './garagePresentationPose.ts';

// 2026-10-11, the owner: "for the garage redesign, remove the people, just make the garages (all of them) redesigned
// to look a ton better". No Garage builds a figure: the crew module, its scenes and its paint are gone, and the bays
// keep only the work in progress that reads on its own.
const dressing = await readFile(new URL('./garageDressing.ts', import.meta.url), 'utf8');
assert.ok(!existsSync(new URL('./garageCrewFigures.ts', import.meta.url)), 'no crew figure module');
assert.doesNotMatch(dressing, /garageCrewFigures|addCrewScene|buildCrewSceneGeometry|paintCrew|garage_crew_/,
  'the dressing builds no people and names nothing after them');
assert.doesNotMatch(dressing, /weld_glow|weld_arc_pool|AdditiveBlending[\s\S]{0,200}weldTip/,
  'no weld arc burns without a welder');
for (const kit of ['burlak', 'xk2_black_panther', 'yard']) {
  assert.match(dressing, new RegExp(`bayKitRoot\\('${kit}'`), `the ${kit} bay keeps its work-in-progress kit`);
}
// 2026-10-11, wave 408 ("the tan Abrams hull hangs in the air over a loose black jack pad with nothing between them"):
// the hull rests on crib stacks and a bottle jack under its 0.42 m belly plate, over its own contact shade; the round
// drip tray is gone and the roof lamp's light pool lies only under Verdant's roof
assert.match(dressing, /const ABRAMS_BELLY_Y = 0\.42;/, 'the Abrams belly plate height is the measured one');
assert.match(dressing, /blocks\.name = 'verdant_original_abrams_belly_cribbing';[\s\S]*cribStack\(-0\.58, 2\.5, 0\.6\);\s*cribStack\(0\.58, 2\.5, 0\.6\);\s*cribStack\(0, -1\.95, 0\.92\);/,
  'two crib stacks under the bow where the yard sees them, one under the engine');
assert.match(dressing, /const course = ABRAMS_BELLY_Y \/ 3;/, 'three courses reach the belly exactly');
assert.match(dressing, /verdant_original_abrams_hull_contact_shade/, 'the hull shades the floor under it');
assert.doesNotMatch(dressing, /CylinderGeometry\(0\.28, 0\.32, 0\.09, 14\)\), mat\.oily/, 'no loose round drip tray under the bow');
assert.match(dressing, /verdantKit\('abrams_lamp_pool'\)\.add\(pool\)/, 'the roof lamp throws light only indoors');

// The bays' floor-standing kit meets the built floor within 3 cm in every outdoor Garage (2026-10-10, the ground
// audit: the shared four-bay exhibit moves by up to 0.7 m between Garages over uneven floors), and every service pad
// is level over its inner 0.6 radii, where the exhibits' supports stand.
const TOLERANCE_M = 0.03;
const rotate = (x, z, yaw) => ({ x: x * Math.cos(yaw) + z * Math.sin(yaw), z: -x * Math.sin(yaw) + z * Math.cos(yaw) });
/** A kit-frame point in one Garage's workshop frame: the bay owner as garageDressing.ts applies it, then the layout. */
function kitToWorkshop(kit, point, variant) {
  let p = rotate(point.x, point.z, kit.frame.yaw);
  p = { x: p.x + kit.frame.x, z: p.z + kit.frame.z };
  if (kit.bay === 'burlak') {
    p = { x: p.x + BURLAK_SCAFFOLD_CLEARANCE_OFFSET.x, z: p.z + BURLAK_SCAFFOLD_CLEARANCE_OFFSET.z };
  } else if (kit.bay === 'xk2_black_panther') {
    p = rotate(p.x, p.z, Math.PI);
    p = { x: p.x - 0.35, z: p.z - 0.35 };
  }
  const [lx, lz, lyaw] = getGarageWorkshopLayoutPose(variant);
  p = rotate(p.x, p.z, lyaw);
  return { x: p.x + lx, z: p.z + lz };
}
const standFeet = (x, z) => [[-0.45, -0.6], [0.45, -0.6], [-0.45, 0.6], [0.45, 0.6]].map(([dx, dz]) => [x + dx, z + dz]);
const KITS = [
  // the rolling stand at the Burlak's turret ring
  { label: 'Burlak work stand', bay: 'burlak', frame: { x: 17.8, z: -15.5, yaw: -0.55 }, feet: standFeet(2.85, -0.45) },
  // the rolled K2's parked hot-work corner: the stand, the screen's feet and the welding set
  { label: 'K2 hot-work kit', bay: 'xk2_black_panther', frame: { x: -16.25, z: -16.85, yaw: 0.35 },
    feet: [...standFeet(0.62, 0.25), [-0.05, -1.2], [1.95, -1.2], [2.35, 0.95]] },
  // the pulled power pack's four legs
  { label: 'power pack stand', bay: 'yard', frame: { x: 0, z: 0, yaw: 0 },
    feet: [[-1.05, -0.5], [1.05, -0.5], [-1.05, 0.5], [1.05, 0.5]].map(([dx, dz]) => {
      const r = rotate(dx, dz, 0.55);
      return [3.4 + r.x, -11.4 + r.z];
    }) },
];
// The Leopard bay's floor-standing kit in its own frame (garageDressing.ts): the lift's four feet, the wheel rack's base
// ends and the impact-wrench kit.
// The Abrams's crib stacks and jack in the hull's frame (garageDressing.ts: the cribbing group at the authored hull pose,
// carried by the Abrams bay owner): every stack's corners and the jack's base.
const ABRAMS_HULL = { x: 16.9, z: 17.7, yaw: -2.03 };
const cribFeet = (x, z, length) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [x + sx * length / 2, z + sz * length / 2]);
const ABRAMS_BLOCKS = [...cribFeet(-0.58, 2.5, 0.6), ...cribFeet(0.58, 2.5, 0.6), ...cribFeet(0, -1.95, 0.92), [0, 2.15]];
const LEOPARD_BAY_KIT = [
  [-1.38, -2.34], [1.38, -2.34], [-1.38, 2.34], [1.38, 2.34],
  [-2.92, -2.3], [-2.92, 2.3], [-2.92, 0], [-2.25, -3.15],
];

const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene);
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
let checked = 0;
let checkedGroves = 0;
const failures = [];
let worst = 0;
for (const variant of GARAGE_VARIANTS) {
  controller.setVariant(variant);
  const stats = await controller.whenReady();
  if (variant.id === 'verdant_motor_pool') {
    // Verdant's kit stands on its level workshop floor
    assert.equal(stats.terrainVertices, 0);
    continue;
  }
  let environment = null;
  scene.traverse((object) => {
    if (!environment && /^garage_environment_/.test(object.name || '') && object.visible) environment = object;
  });
  assert.ok(environment, `${variant.id}: the outdoor pack is built`);
  environment.updateMatrixWorld(true);
  const floors = [];
  environment.traverse((object) => {
    if (object.isMesh && /terrain_patch|hardstand/.test(object.name || '')) floors.push(object);
  });
  assert.ok(floors.length >= 1, `${variant.id}: terrain and hardstand meshes exist`);
  const floorAt = (x, z) => {
    const origin = environment.localToWorld(new THREE.Vector3(x, 40, z));
    ray.set(origin, down);
    ray.far = 120;
    const hit = ray.intersectObjects(floors, false)[0];
    assert.ok(hit, `${variant.id}: a floor under (${x.toFixed(2)}, ${z.toFixed(2)})`);
    return environment.worldToLocal(hit.point.clone()).y;
  };
  const expectLevel = (label, x, z) => {
    const error = Math.abs(floorAt(x, z));
    worst = Math.max(worst, error);
    checked += 1;
    if (error > TOLERANCE_M) {
      failures.push(`${variant.id}: ${label} is ${error.toFixed(3)} m off the floor at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  };
  for (const kit of KITS) {
    for (const [x, z] of kit.feet) {
      const p = kitToWorkshop(kit, { x, z }, variant);
      expectLevel(kit.label, p.x, p.z);
    }
  }
  for (const [x, z] of LEOPARD_BAY_KIT) {
    const p = leopardBayPointToWorkshop(variant, x, z);
    expectLevel('Leopard bay kit', p.x, p.z);
  }
  {
    const placement = getAbramsWeldingBayPlacement(variant);
    const [lx, lz, lyaw] = getGarageWorkshopLayoutPose(variant);
    for (const [x, z] of ABRAMS_BLOCKS) {
      let p = rotate(x, z, ABRAMS_HULL.yaw);
      p = rotate(p.x + ABRAMS_HULL.x, p.z + ABRAMS_HULL.z, placement.rotationRad);
      p = rotate(p.x + placement.x, p.z + placement.z, lyaw);
      expectLevel('Abrams cribbing', p.x + lx, p.z + lz);
    }
  }
  // no grove rises out of a fleet exhibit's hull as its bay camera sees it (wave 408: "a leafy plant sprouts straight
  // through the left side of the turret"): from 45 % of the way out to each exhibit, every tree stands clear of the
  // hull's half-length
  {
    const exhibits = getGarageFacilityTerraces(variant).filter((terrace) => terrace.label.startsWith('fleet-service-'))
      .map((terrace) => garageViewPoint(terrace.side, terrace.depth));
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    environment.traverse((object) => {
      if (!object.isInstancedMesh || !/^battlefield_tree_.*_trunks$/.test(object.name || '')) return;
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix);
        for (const exhibit of exhibits) {
          const viewX = exhibit.x * 0.45, viewZ = exhibit.z * 0.45;
          const reach = Math.hypot(exhibit.x - viewX, exhibit.z - viewZ);
          if (Math.hypot(position.x - viewX, position.z - viewZ) < reach) continue;
          const gap = Math.atan2(position.z - viewZ, position.x - viewX) - Math.atan2(exhibit.z - viewZ, exhibit.x - viewX);
          const off = Math.abs(Math.atan2(Math.sin(gap), Math.cos(gap)));
          checkedGroves += 1;
          if (off < Math.atan2(3.6, reach) + 0.04) {
            failures.push(`${variant.id}: a ${object.name} grove at (${position.x.toFixed(1)}, ${position.z.toFixed(1)}) rises behind a fleet exhibit`);
          }
        }
      }
    });
  }
  // every service pad is level over its inner 0.6 radii (the terrain grid's 2.4 m cells blend the outer core into the
  // feather): the exhibits' supports stand there
  for (const terrace of getGarageFacilityTerraces(variant)) {
    if (!terrace.label.startsWith('fleet-service-')) continue;
    for (let ring = 0; ring <= 3; ring += 1) {
      const count = ring === 0 ? 1 : ring * 8;
      for (let k = 0; k < count; k += 1) {
        const a = (k / count) * Math.PI * 2;
        const f = (ring / 3) * 0.6;
        const point = garageViewPoint(terrace.side + Math.cos(a) * terrace.radiusSide * f,
          terrace.depth + Math.sin(a) * terrace.radiusDepth * f);
        expectLevel(`${terrace.label} core`, point.x, point.z);
      }
    }
  }
}
assert.deepEqual(failures, [], `${failures.length} floor contacts more than ${TOLERANCE_M * 100} cm off:\n${failures.join('\n')}`);
assert.ok(checkedGroves > 100, `the grove sightlines were measured (${checkedGroves})`);
console.log(`garageBayFloor.selftest: no figures in any Garage; ${checked} kit contacts and pad points within ${TOLERANCE_M * 100} cm of the floor in the nine outdoor Garages (worst ${(worst * 100).toFixed(1)} cm); no grove behind an exhibit in ${checkedGroves} sightlines`);
