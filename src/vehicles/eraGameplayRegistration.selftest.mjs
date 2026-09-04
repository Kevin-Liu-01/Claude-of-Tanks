import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { stripActivatedEra } from '../game/eraActivation.ts';
import { createShell } from '../sim/ballistics.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';
import { createCombatState, resolveShellHit } from '../sim/damage.ts';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';

const AUDIT_SHELL = Object.freeze({
  name: 'ERA registration audit APFSDS',
  type: 'APFSDS',
  caliberMm: 120,
  pen100Mm: 5000,
  pen1000Mm: 5000,
  pen2000Mm: 5000,
  dmg: 1,
  velocityMps: 1700,
  moduleDmg: 0,
  tracer: 'APFSDS',
});
const rngHalf = () => 0.5;
const matrix = new Matrix4();

function poseState() {
  return {
    pos: new Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0,
    turretYaw: 0, gunPitch: 0,
  };
}

function plateRay(spec, owner, plate) {
  const points = plate.verts.map((point) => new Vector3().fromArray(point));
  assert.ok(points.length >= 4, `${spec.id}/${plate.name}: fitted quad has four vertices`);
  const center = points.reduce((sum, point) => sum.add(point), new Vector3())
    .multiplyScalar(1 / points.length);
  const normal = points[1].clone().sub(points[0])
    .cross(points[3].clone().sub(points[0])).normalize();
  assert.ok(Number.isFinite(normal.lengthSq()) && normal.lengthSq() > 0.99,
    `${spec.id}/${plate.name}: fitted quad has a finite outward normal`);
  if (owner === 'turret') center.add(new Vector3().fromArray(spec.armor.turretPivot));
  return {
    from: center.clone().addScaledVector(normal, 0.75),
    to: center.clone().addScaledVector(normal, -0.75),
  };
}

function hiddenEraElements(root) {
  let hidden = 0;
  root.traverse((object) => {
    if (object.isInstancedMesh) {
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, matrix);
        if (matrix.elements[13] < -900) hidden++;
      }
    }
    const position = object.geometry?.getAttribute?.('position');
    if (!position) return;
    for (let index = 0; index < position.count; index++) {
      if (position.getY(index) < -900) hidden++;
    }
  });
  return hidden;
}

let eraVehicles = 0;
let uniqueZones = 0;
let fittedSurfaces = 0;
let reactiveVisualSectors = 0;

for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const declared = [
    ...spec.armor.hullPlates.map((plate) => ({ owner: 'hull', plate })),
    ...spec.armor.turretPlates.map((plate) => ({ owner: 'turret', plate })),
  ].filter(({ plate }) => plate.kind === 'era');
  const visual = createTank(id, null, {
    proceduralOnly: true, quality: 'low', camoSeed: 4242, geometryReceipt: true,
  });
  try {
    const binding = visual.root.userData.eraVisualBindingReceipt;
    const finish = visual.root.userData.eraFinishReceipt;

    // Inverse audit: every semantic reactive visual field needs a gameplay
    // binding. Passive stand-off cages/slats/screens are deliberately exempt.
    if (finish) {
      const covered = new Set((binding?.plates || []).flatMap(
        (row) => [row.name, ...(row.visualSectors || [])],
      ));
      for (const sector of finish.sectors || []) {
        if (/cage|slat|screen|net/i.test(sector)) continue;
        reactiveVisualSectors++;
        assert.ok(covered.has(sector),
          `${id}/${sector}: visible reactive package has a gameplay ERA zone`);
      }
    }

    if (!declared.length) continue;
    eraVehicles++;
    assert.equal(binding?.revision, 'canonical-gameplay-era-binding-r1',
      `${id}: publishes canonical gameplay-to-visual ERA bindings`);

    const unique = new Map();
    for (const item of declared) {
      const prior = unique.get(item.plate.name);
      assert.ok(!prior || prior.owner === item.owner,
        `${id}/${item.plate.name}: one depleted name cannot span articulation owners`);
      if (prior) prior.plates.push(item.plate);
      else unique.set(item.plate.name, { owner: item.owner, plates: [item.plate] });
    }

    for (const { owner, plates } of unique.values()) {
      const plate = plates[0];
      uniqueZones++;
      assert.ok(plate.era && plate.era.keReduction > 0 && plate.era.keReduction < 1,
        `${id}/${plate.name}: ERA has a real bounded kinetic reduction`);
      assert.ok(plate.era.ceFlatMm > 0,
        `${id}/${plate.name}: ERA has a real chemical-energy reduction`);
      assert.ok(plate.verts.flat().every(Number.isFinite),
        `${id}/${plate.name}: fitted hit surface is finite`);

      const rows = binding.plates.filter(
        (row) => row.name === plate.name && row.owner === owner,
      );
      assert.ok(rows.length > 0, `${id}/${plate.name}: binding receipt exists`);
      for (const row of rows) {
        assert.equal(row.registered, true, `${id}/${plate.name}: visual cluster is registered`);
        assert.equal(row.ownerMatches, true, `${id}/${plate.name}: visual and hit owners match`);
        assert.equal(row.registeredOwner, owner, `${id}/${plate.name}: articulation owner`);
        assert.ok(row.partCount > 0, `${id}/${plate.name}: bound visual geometry exists`);
        assert.ok(Array.isArray(row.fittedSurfaces) && row.fittedSurfaces.length >= 1,
          `${id}/${plate.name}: hit surfaces were fitted to visible geometry`);
        assert.ok(row.fittedSurfaces.every((surface) => Array.isArray(surface)
          && surface.length >= 4 && surface.flat().every(Number.isFinite)),
        `${id}/${plate.name}: every fitted visual surface is a finite quad`);
      }

      const pose = tankPoseFromState(poseState());
      fittedSurfaces += plates.length;
      for (const fittedPlate of plates) {
        const surfaceRay = plateRay(spec, owner, fittedPlate);
        const surfaceHits = traceTank(surfaceRay.from, surfaceRay.to, pose, spec.armor);
        assert.ok(surfaceHits.some((hit) => hit.kind === 'plate' && hit.plate === fittedPlate),
          `${id}/${plate.name}: every fitted cassette face is directly hittable`);
      }
      let ray = null;
      let target = null;
      let firstEvent = null;
      for (const candidate of plates) {
        const candidateRay = plateRay(spec, owner, candidate);
        const candidateHits = traceTank(candidateRay.from, candidateRay.to, pose, spec.armor);
        const candidateTarget = {
          id: `${id}_audit`, spec, state: poseState(), combat: createCombatState(spec),
        };
        const candidateShell = createShell(
          AUDIT_SHELL, 'era_audit', false, candidateRay.from,
          candidateRay.to.clone().sub(candidateRay.from).normalize(), uniqueZones * 2,
        );
        const candidateEvent = resolveShellHit(
          candidateShell, candidateTarget, candidateHits, rngHalf,
        );
        if (!candidateEvent.eraActivations.some(
          (activation) => activation.plate === plate.name,
        )) continue;
        ray = candidateRay;
        target = candidateTarget;
        firstEvent = candidateEvent;
        break;
      }
      assert.ok(ray && target && firstEvent,
        `${id}/${plate.name}: at least one exposed fitted face emits its exact ERA activation`);
      assert.ok(target.combat.eraSpent.has(plate.name),
        `${id}/${plate.name}: first hit records permanent round-state depletion`);

      const hiddenBefore = hiddenEraElements(visual.root);
      assert.equal(stripActivatedEra(firstEvent, visual), true,
        `${id}/${plate.name}: combat event routes to visual depletion`);
      const hiddenAfter = hiddenEraElements(visual.root);
      assert.ok(hiddenAfter > hiddenBefore,
        `${id}/${plate.name}: activated cassette geometry is removed from the live tank`);

      const secondHits = traceTank(ray.from, ray.to, pose, spec.armor, target.combat.eraSpent);
      assert.equal(secondHits.some(
        (hit) => hit.kind === 'plate' && hit.plate.name === plate.name,
      ), false, `${id}/${plate.name}: depleted ERA no longer participates in collision`);
      const secondShell = createShell(
        AUDIT_SHELL, 'era_audit', false, ray.from,
        ray.to.clone().sub(ray.from).normalize(), uniqueZones * 2 + 1,
      );
      const secondEvent = resolveShellHit(secondShell, target, secondHits, rngHalf);
      assert.equal(secondEvent.eraActivations.some(
        (activation) => activation.plate === plate.name,
      ), false, `${id}/${plate.name}: second hit cannot reactivate a spent zone`);

      assert.equal(visual.resetEra(), true,
        `${id}/${plate.name}: round/replay reset restores reactive geometry`);
      assert.equal(hiddenEraElements(visual.root), hiddenBefore,
        `${id}/${plate.name}: reset restores the original cassette geometry`);
    }
  } finally {
    visual.dispose();
  }
}

for (const id of ['challenger2e', 'ua_challenger2']) {
  const cheekPlates = getSpec(id).armor.turretPlates
    .filter((plate) => plate.kind === 'era' && /^cr2e_turret_era_[LR]$/.test(plate.name));
  const names = new Set(cheekPlates.map((plate) => plate.name));
  assert.ok(names.has('cr2e_turret_era_L') && names.has('cr2e_turret_era_R'),
    `${id}: both separated cheek arrays are live gameplay ERA`);
  for (const side of ['L', 'R']) {
    assert.equal(cheekPlates.filter((plate) => plate.name === `cr2e_turret_era_${side}`).length, 10,
      `${id}: ${side} cheek retains ten individually fitted square cassette faces`);
  }
}

{
  const expectedM1a2Zones = new Set([
    'm1a2_skirt_era_R',
    'm1a2_skirt_era_L',
    'm1a2_glacis_era_R',
    'm1a2_glacis_era_L',
    'm1a2_turret_era_R',
    'm1a2_turret_era_L',
  ]);
  const registeredM1a2Zones = new Set([
    ...getSpec('m1a2').armor.hullPlates,
    ...getSpec('m1a2').armor.turretPlates,
  ].filter((plate) => plate.kind === 'era').map((plate) => plate.name));
  assert.deepEqual(registeredM1a2Zones, expectedM1a2Zones,
    'm1a2: all visible skirt, glacis, and turret cassette families are registered as live ERA');
  assert.equal(getSpec('m1a1').armor.hullPlates.some((plate) => plate.kind === 'era'), false,
    'm1a1: does not inherit M1A2 reactive zones');
  assert.equal(getSpec('m1a1').armor.turretPlates.some((plate) => plate.kind === 'era'), false,
    'm1a1: does not inherit M1A2 turret reactive zones');
  assert.equal(getSpec('abramsx').armor.hullPlates.some((plate) => plate.kind === 'era'), false,
    'abramsx: passive modular hull armor does not inherit M1A2 reactive zones');
  assert.equal(getSpec('abramsx').armor.turretPlates.some((plate) => plate.kind === 'era'), false,
    'abramsx: passive modular turret armor does not inherit M1A2 reactive zones');
}

console.log(`eraGameplayRegistration.selftest: ${eraVehicles} vehicles, ${uniqueZones} depletable zones, ${fittedSurfaces} fitted faces, ${reactiveVisualSectors} reactive visual sectors`);
