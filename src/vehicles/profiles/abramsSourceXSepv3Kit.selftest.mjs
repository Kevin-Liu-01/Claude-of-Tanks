import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildAbramsX } from './abramsSourceX.ts';
import { TURRET, turretSideX } from './abramsSourceXKitBase.ts';

// M1A2 Abrams SEPv3 field configuration (owner 2026-09-15): Trophy HV launchers, radars and
// counterweights, the left-rear auxiliary power unit, roof electronics and fender stowage laid on the
// finished X study. Parts are captured at the builder port by their kit tag, then checked for count,
// envelope and seating; the other Abrams studies must carry none of it.

function capture(id) {
  const parts = [], urban = [];
  registerProfiledBuilders({ [id]: (P) => buildAbramsX(new Proxy(P, {
    get(target, key) {
      if (key === 'add' || key === 'addEquipment' || key === 'addExternalArmor') {
        return (bucket, geometry, x = 0, y = 0, z = 0) => {
          if (/^abramsSourceX_(Square|Fore|Arat)/.test(geometry.name || '')) urban.push(geometry.name.replace(/^abramsSourceX_/, ''));
          if (geometry.userData.sepv3Kit) {
            geometry.computeBoundingBox();
            const b = geometry.boundingBox;
            parts.push({ part: geometry.userData.sepv3Kit, bucket,
              min: [b.min.x + x, b.min.y + y, b.min.z + z], max: [b.max.x + x, b.max.y + y, b.max.z + z] });
          }
          return target[key](bucket, geometry, x, y, z);
        };
      }
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  })) });
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high', batchStatic: false });
  return { parts, urban, tank };
}

const { parts, urban, tank } = capture('m1a2_sepv3_x');
const count = (part) => parts.filter((p) => p.part === part).length;
const hullOwned = (part) => /^(uaapu|sponson|tow-|pioneer|jerry)/.test(part);
const hull = (p) => (hullOwned(p.part) ? p : { ...p, min: p.min.map((v, i) => v + TURRET[i]), max: p.max.map((v, i) => v + TURRET[i]) });

// Trophy HV: two launcher assemblies, four radars, two counterweights
assert.equal(count('trophy-launcher'), 2); assert.equal(count('trophy-mount'), 2); assert.equal(count('trophy-bolt'), 8);
assert.equal(count('trophy-arm'), 8); assert.equal(count('trophy-lid'), 2); assert.equal(count('trophy-face'), 2);
assert.equal(count('trophy-muzzle'), 8, 'two MEFP muzzles with rims per launcher'); assert.equal(count('trophy-bumper'), 6);
assert.equal(count('trophy-cable'), 3, 'a cable run per launcher and the controller conduit');
assert.equal(count('trophy-radar'), 4); assert.equal(count('trophy-radar-mount'), 4); assert.equal(count('trophy-radar-face'), 4);
assert.equal(count('trophy-counterweight'), 2); assert.equal(count('trophy-cw-arm'), 4); assert.equal(count('trophy-cw-strap'), 4);
// UAAPU, sponson box, roof electronics, fender stowage
assert.equal(count('uaapu-box'), 1); assert.equal(count('uaapu-louver'), 9); assert.equal(count('uaapu-bolt'), 8);
assert.equal(count('uaapu-hinge'), 2); assert.equal(count('uaapu-latch'), 2); assert.equal(count('uaapu-grille-slat'), 4);
assert.equal(count('sponson-box'), 1); assert.equal(count('trophy-controller'), 1); assert.equal(count('adl-box'), 2);
assert.equal(count('gps-antenna'), 1); assert.equal(count('wind-sensor'), 2);
assert.equal(count('tow-cable'), 5); assert.equal(count('tow-clamp'), 3); assert.equal(count('jerry-can'), 2);
assert.equal(parts.length, 123, 'the whole kit is accounted for');

// envelope: inside the 3.66 m hull width, nothing above the CROWS-LP head, nothing below the fenders
for (const raw of parts) {
  const p = hull(raw);
  // skirt handles and hinges stand a few centimetres proud of the receiving plates, like the ARAT cassettes do
  assert.ok(Math.max(Math.abs(p.min[0]), Math.abs(p.max[0])) <= 1.84, `${p.part}: inside the skirt width`);
  assert.ok(p.max[1] <= 3.05, `${p.part}: below the weapon station`);
  assert.ok(p.min[1] >= 1.40, `${p.part}: above the fenders`);
}
// the launchers clear the inclined walls and stay inside the skirt line; the muzzles face outward
for (const raw of parts.filter((p) => p.part === 'trophy-launcher')) {
  const p = hull(raw), side = p.min[0] > 0 ? 1 : -1;
  const inner = side > 0 ? p.min[0] : p.max[0], outer = side > 0 ? p.max[0] : p.min[0];
  assert.ok(Math.abs(outer) <= 1.80 + 1e-6, 'launcher outer face at the skirt line');
  assert.ok(Math.abs(inner) > Math.abs(turretSideX(side, p.min[1])) + .005, 'launcher body clears the wall at its lowest edge');
}
// the auxiliary power unit sits on the left fender, under the rack floor so the turret sweeps clear
const apu = hull(parts.find((p) => p.part === 'uaapu-box'));
assert.ok(apu.max[0] < -1.11 && apu.min[0] > -1.80, 'APU on the left sponson');
assert.ok(Math.abs(apu.min[1] - 1.405) < 1e-6, 'APU stands on the fender');
assert.ok(apu.max[1] <= 1.80 + 1e-6 && apu.max[1] < 1.887, 'APU top under the bustle rack floor');
assert.ok(apu.max[2] < -2.20 && apu.min[2] > -3.60, 'APU behind the turret ring, ahead of the tail lamps');
// counterweights hang behind the extended rack, above the hull deck
for (const raw of parts.filter((p) => p.part === 'trophy-counterweight')) {
  const p = hull(raw);
  assert.ok(p.max[2] < -3.36, 'counterweight behind the rack extension');
  assert.ok(p.min[1] > 1.80, 'counterweight above the sponson boxes');
}
// the urban set (owner 2026-09-16): rectangular ARAT on both skirts and the turret courses, with the three
// rear stations under each Trophy launcher left open; every reactive bank binds a gameplay zone
const stations = (side) => [0, 1, 2, 3, 4, 5, 6].filter((i) => urban.includes(`SquareArat${side}_${i}`));
assert.deepEqual(stations(1), [0, 4, 5, 6], 'right rear ARAT course keeps four stations around the launcher');
assert.deepEqual(stations(-1), [0, 4, 5, 6], 'left rear ARAT course keeps four stations around the launcher');
assert.equal(urban.filter((n) => /^ForeSquareArat/.test(n)).length, 3 + 4, 'both fore ARAT courses complete');
const binding = tank.root.userData.eraVisualBindingReceipt;
const zones = [...new Set((binding?.plates || []).map((row) => row.name))].sort();
assert.deepEqual(zones, ['m1a2_sepv3_skirt_era_L', 'm1a2_sepv3_skirt_era_R', 'm1a2_sepv3_turret_era_L', 'm1a2_sepv3_turret_era_R'], 'skirt and turret ARAT banks own the gameplay ERA zones');
for (const row of binding.plates) assert.ok(row.registered && row.partCount > 0, `${row.name}: bound to visible cassettes`);
// finished tank builds; the other Abrams studies carry no SEPv3 kit
const meshes = []; tank.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
assert.ok(meshes.length > 0, 'the SEPv3 builds');
for (const other of ['m1a2_sepv2_x', 'm1a2_x']) {
  assert.equal(capture(other).parts.length, 0, `${other} carries no SEPv3 kit`);
}
console.log(`abramsSourceXSepv3Kit: ${parts.length} kit parts on the M1A2 Abrams SEPv3 (Trophy launchers, radars and counterweights, UAAPU, sponson box, roof electronics, fender stowage) over the rectangular ARAT set with ${urban.length} urban parts; the SEP v2 and M1A2 studies stay clean PASS`);
