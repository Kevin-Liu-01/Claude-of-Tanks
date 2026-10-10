import assert from 'node:assert/strict';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { requestAuxiliary } from './auxiliarySystems.ts';
import { smokeBlocks, smokeBankCount } from './smokeScreen.ts';

// 2026-10-08 (coordinator ruling on the smoke gap): every smoke-equipped vehicle's salvo closes the line of sight over
// its bow at full growth. Before the launchers' fan law (src/vehicles/smokeFan.ts) 34 of 211 left it open dead ahead
// (the whole M1A2 family: two tight clusters 27 m apart, a 6 m gap in front of the hull).
// The test: from the vehicle's sight height (its turret ring plus 0.4 m), every bearing within 10 degrees of the bow is
// blocked somewhere between 10 m and 40 m out, when the last grenade's bank is full grown (its contact + 2.4 s), with
// the turret ahead and traversed. It also pins the banks a salvo makes (the presentation's puff budget scales with them).
const MAX_BANKS = 24;
const flat = () => 0;
let vehicles = 0, salvos = 0, banksTotal = 0, banksMax = 0, banksMaxId = '';
const open = [];
for (const [id, kit] of Object.entries(AUXILIARY_INVENTORY)) {
  if (!kit.smoke.length) continue;
  vehicles++;
  const sightH = (kit.turretPivot?.[1] ?? 1.8) + 0.4;
  for (const turretYaw of [0, 0.5]) {
    const actor = { id, team: 'player', spec: { id, dims: { heightM: sightH } }, state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, turretYaw }, combat: {} };
    assert.ok(requestAuxiliary(actor, 'smoke', 0, flat), `${id}: launches smoke`);
    const screen = actor.combat.auxiliary.smoke;
    salvos++;
    // deterministic: the same request draws the same salvo
    const twin = { ...actor, combat: {} };
    requestAuxiliary(twin, 'smoke', 0, flat);
    assert.deepEqual(twin.combat.auxiliary.smoke.canisters, screen.canisters, `${id}: a salvo is a function of its request`);
    for (const shot of screen.canisters) {
      assert.ok(Number.isFinite(shot[6]) && shot[6] > 0.2, `${id}: every grenade flies before it lands`);
    }
    const banks = smokeBankCount(screen);
    banksTotal += banks;
    if (banks > banksMax) { banksMax = banks; banksMaxId = id; }
    assert.ok(banks <= MAX_BANKS, `${id}: ${banks} banks in one salvo (budget ${MAX_BANKS})`);
    // the bow of the launcher's own frame: the turret's when its tubes ride the turret, else the hull's
    const turretTubes = kit.smoke.filter((m) => m.owner === 'turret').length;
    const bow = turretTubes * 2 >= kit.smoke.length ? turretYaw : 0;
    const tFull = Math.max(...screen.canisters.map((c) => c[6])) + 2.4;
    for (let deg = -10; deg <= 10; deg++) {
      const a = bow + deg * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
      const blocked = smokeBlocks([screen], { x: s * 10, y: sightH, z: c * 10 }, { x: s * 40, y: sightH, z: c * 40 }, tFull, flat);
      if (!blocked) { open.push(`${id}@${deg}deg/turret ${turretYaw}`); break; }
    }
  }
}
assert.equal(vehicles, Object.values(AUXILIARY_INVENTORY).filter((k) => k.smoke.length).length);
assert.deepEqual(open, [], `every salvo closes the bow (${open.length} open: ${open.slice(0, 12).join(', ')})`);
console.log(`smokeScreenCover: ${vehicles}/${vehicles} smoke-equipped vehicles close the bow (+-10 deg, 10-40 m, turret ahead and traversed); `
  + `banks per salvo mean ${(banksTotal / salvos).toFixed(1)}, max ${banksMax} (${banksMaxId}) within ${MAX_BANKS}`);
