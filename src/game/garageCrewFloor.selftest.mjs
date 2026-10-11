import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from './garageVariants.ts';
import {
  crewPointInScene, GARAGE_BAY_ALTERNATE_SCENES, GARAGE_CREW_SCENES, GARAGE_REGIONAL_YARD_SCENES,
} from './garageCrewFigures.ts';
import {
  BURLAK_SCAFFOLD_CLEARANCE_OFFSET,
  GARAGE_BAY_ALTERNATES,
  getAbramsWeldingBayPlacement,
  getGarageWorkshopLayoutPose,
  leopardBayPointToWorkshop,
} from './garageWorkshopLayout.ts';
import { createGarageArchitectureController } from '../ui/garageArchitecture.ts';
import { getGarageFacilityTerraces } from '../ui/garageFacilityDetails.ts';
import { garageViewPoint } from './garagePresentationPose.ts';

// 2026-10-10, the ground audit of the ten Garages: the shared four-bay exhibit moves by up to 0.7 m between Garages
// over uneven floors, and the crews off the service pads floated up to 1.44 m (Saltmere's Leopard bay) or stood buried
// to 0.79 m (Steinburg's). Every foot of every crew, every floor-standing kit and every service pad's level core must
// meet the built floor within 3 cm in every Garage.
const TOLERANCE_M = 0.03;

const rotate = (x, z, yaw) => ({ x: x * Math.cos(yaw) + z * Math.sin(yaw), z: -x * Math.sin(yaw) + z * Math.cos(yaw) });
/** A scene-frame point in one Garage's workshop frame: the bay owner as garageDressing.ts applies it, then the layout. */
function sceneToWorkshop(scene, point, variant) {
  let p = rotate(point.x, point.z, scene.frame.yaw);
  p = { x: p.x + scene.frame.x, z: p.z + scene.frame.z };
  if (scene.frame.parent === 'verdant-interior') return null;
  if (scene.frame.parent === 'leopard-bay') return leopardBayPointToWorkshop(variant, p.x, p.z);
  if (scene.id === 'burlak') {
    p = { x: p.x + BURLAK_SCAFFOLD_CLEARANCE_OFFSET.x, z: p.z + BURLAK_SCAFFOLD_CLEARANCE_OFFSET.z };
  } else if (scene.id === 'abrams' || scene.id === 'abrams-alt') {
    const placement = getAbramsWeldingBayPlacement(variant);
    p = rotate(p.x, p.z, placement.rotationRad);
    p = { x: p.x + placement.x, z: p.z + placement.z };
  } else if (scene.id === 'k2' || scene.id === 'k2-alt') {
    p = rotate(p.x, p.z, Math.PI);
    p = { x: p.x - 0.35, z: p.z - 0.35 };
  }
  const [lx, lz, lyaw] = getGarageWorkshopLayoutPose(variant);
  p = rotate(p.x, p.z, lyaw);
  return { x: p.x + lx, z: p.z + lz };
}

// The Leopard bay's floor-standing kit in its own frame (garageDressing.ts): the lift's four feet, the wheel rack's base
// ends and the impact-wrench kit.
const LEOPARD_BAY_KIT = [
  [-1.38, -2.34], [1.38, -2.34], [-1.38, 2.34], [1.38, 2.34],
  [-2.92, -2.3], [-2.92, 2.3], [-2.92, 0], [-2.25, -3.15],
];

const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene);
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
let checked = 0;
const failures = [];
let worst = 0;
for (const variant of GARAGE_VARIANTS) {
  controller.setVariant(variant);
  const stats = await controller.whenReady();
  if (variant.id === 'verdant_motor_pool') {
    // Verdant's crews stand on its level workshop floor (the dressing's datum) or on an authored stand deck
    assert.equal(stats.terrainVertices, 0);
    for (const crew of Object.values(GARAGE_CREW_SCENES)) {
      for (const member of crew.members) {
        const deck = (crew.props ?? []).find((prop) => prop.kind === 'work-stand'
          && Math.abs(prop.deckY - member.at[1]) < 1e-6);
        assert.ok(member.at[1] === 0 || deck || member.at[1] < 0.2 || crew.frame.parent === 'verdant-interior',
          `${crew.id}/${member.role}: stands on the floor or on its stand's deck`);
      }
    }
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
  const expectLevel = (label, x, z, surfaceY = 0) => {
    const error = Math.abs(floorAt(x, z) - surfaceY);
    worst = Math.max(worst, error);
    checked += 1;
    if (error > TOLERANCE_M) {
      failures.push(`${variant.id}: ${label} is ${error.toFixed(3)} m off the floor at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  };
  const regional = GARAGE_REGIONAL_YARD_SCENES[variant.architecture];
  const alternates = GARAGE_BAY_ALTERNATES[variant.architecture];
  const shown = [...Object.values(GARAGE_CREW_SCENES).filter((crew) => !(regional && crew.id === 'carry')
    && !alternates[crew.id]),
    ...(regional ? [regional] : []),
    ...['leopard', 'k2', 'abrams'].filter((bay) => alternates[bay]).map((bay) => GARAGE_BAY_ALTERNATE_SCENES[bay])];
  for (const crew of shown) {
    for (const member of crew.members) {
      if (member.at[1] > 0.05) continue; // on a stand's deck or a step, seated with the kit below
      for (const [side, foot] of [['left', member.pose.leftFoot], ['right', member.pose.rightFoot]]) {
        const ankle = crewPointInScene(member, foot);
        const p = sceneToWorkshop(crew, { x: ankle.x, z: ankle.z }, variant);
        if (!p) continue;
        expectLevel(`${crew.id}/${member.role} ${side} foot`, p.x, p.z);
      }
    }
    for (const prop of crew.props ?? []) {
      // a stand's four casters, a screen's or a stand's feet
      for (const [dx, dz] of [[-0.45, -0.6], [0.45, -0.6], [-0.45, 0.6], [0.45, 0.6]]) {
        const local = rotate(dx, dz, prop.yaw);
        const p = sceneToWorkshop(crew, { x: prop.at[0] + local.x, z: prop.at[2] + local.z }, variant);
        if (p) expectLevel(`${crew.id}/${prop.kind}`, p.x, p.z);
      }
    }
  }
  for (const [x, z] of LEOPARD_BAY_KIT) {
    const p = leopardBayPointToWorkshop(variant, x, z);
    expectLevel('Leopard bay kit', p.x, p.z);
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
console.log(`garageCrewFloor.selftest: ${checked} feet, kit contacts and pad points within ${TOLERANCE_M * 100} cm of the floor in the nine outdoor Garages (worst ${(worst * 100).toFixed(1)} cm); Verdant's crews on its floor or decks`);
