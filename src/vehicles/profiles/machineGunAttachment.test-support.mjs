import assert from 'node:assert/strict';

const MG_FITTING_KINDS = new Set(['pintleMG', 'openYokeRws']);
const RIG_OWNERS = new Set(['rig_hull', 'rig_turret', 'rig_gun']);

function fittingFamily(fitting) {
  if (fitting.userData.designFamily === 'abramsx-open-yoke-v1') return 'openYokeRws';
  if (fitting.userData.americanRwsFamily) return 'americanRws';
  if (fitting.userData.americanWeaponStandard) return 'americanM2';
  if (fitting.userData.fittingExact || fitting.userData.sourceMeasuredMachineGun) return 'exactHero';
  return 'pintleMG';
}

export function createMachineGunAttachmentAudit() {
  const familyCounts = new Map();
  let tankCount = 0, fittingCount = 0;
  return {
    check(id, tank) {
      const fittings = [];
      tank.root.traverse((node) => {
        if (node.userData?.fittingRoot && MG_FITTING_KINDS.has(node.userData.fitting)) {
          fittings.push(node);
        }
      });
      if (fittings.length) tankCount++;

      for (const fitting of fittings) {
        fittingCount++;
        const family = fittingFamily(fitting);
        familyCounts.set(family, (familyCounts.get(family) || 0) + 1);

        let owner = fitting.parent;
        while (owner && !RIG_OWNERS.has(owner.name)) owner = owner.parent;
        assert.ok(owner, `${id}/${fitting.name}: machine-gun station is attached to a vehicle rig`);
        assert.ok(Number.isFinite(fitting.position.x)
          && Number.isFinite(fitting.position.y)
          && Number.isFinite(fitting.position.z),
        `${id}/${fitting.name}: support seat has finite local coordinates`);

        const sourceMeasuredMarker = fitting.userData.fittingExact
          || fitting.userData.sourceMeasuredMachineGun;
        if (!sourceMeasuredMarker) {
          let visibleParts = 0;
          fitting.traverse((node) => {
            if (!node.isMesh) return;
            visibleParts++;
            assert.equal(node.userData.combatHitboxRole, 'equipment',
              `${id}/${fitting.name}: mounted gun remains equipment-owned`);
            assert.equal(node.userData.surfaceMarkupSelectable, true,
              `${id}/${fitting.name}: mounted gun remains selectable for surface review`);
          });
          assert.ok(visibleParts > 0, `${id}/${fitting.name}: mounted gun has visible geometry`);
        }

        if (!sourceMeasuredMarker && fitting.userData.hasWeapon !== false) {
          assert.equal(fitting.userData.firingAxis, '+Z',
            `${id}/${fitting.name}: complete gun uses the vehicle-forward firing axis`);
          assert.deepEqual(fitting.userData.barrelAxisLocal, [0, 0, 1],
            `${id}/${fitting.name}: barrel is collinear with its receiver`);
          assert.equal(fitting.userData.barrelElevationRad, 0,
            `${id}/${fitting.name}: no barrel-only pitch survives the shared handler`);
          assert.equal(fitting.userData.hasEngineeredCradle, true,
            `${id}/${fitting.name}: receiver and barrel have a real support assembly`);
        }
      }
    },
    finish() {
      assert.ok(tankCount >= 140,
        `fleet audit unexpectedly found machine-gun fittings on only ${tankCount} tanks`);
      assert.ok(fittingCount >= tankCount,
        'fleet audit counts at least one attached machine-gun fitting per affected tank');
      for (const family of ['pintleMG', 'americanM2', 'americanRws', 'openYokeRws']) {
        assert.ok((familyCounts.get(family) || 0) > 0,
          `fleet audit exercises the ${family} fitting family`);
      }

      return { tankCount, fittingCount };
    },
  };
}
