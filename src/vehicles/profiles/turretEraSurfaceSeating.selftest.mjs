import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { FLEET_RENEWAL_DONORS } from '../fleetRenewalSpecs.ts';
import { betweenBuilds } from '../../../tools/build-loop-yield.mjs';

// 2026-10-01: t80uk (now the T-80UK on t80u) and t72m1_jaguar (on t72b3) are the owner's September rebuilds
// (4c34b3e8b, fleet-renewal-publication-20260930.md). Their turret ERA is the donor study's own construction (plus the
// Jaguar's three attached cheek receivers a side, t72JaguarRedesign), not this surface-seated cassette solver, so the
// solver's receipt left with the retired builders; they are held to their donors' reactive sectors instead.
for (const [id, donorId] of [['t80uk', 't80u'], ['t72m1_jaguar', 't72b3']]) {
  await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
  assert.equal(FLEET_RENEWAL_DONORS[id], donorId, `${id}: the renewal rebuilds it on ${donorId}`);
  const sectors = (vehicle) => {
    const tank = createTank(vehicle, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
    try { return [...(tank.root.userData.eraFinishReceipt?.sectors ?? [])].sort(); } finally { tank.dispose(); }
  };
  assert.deepEqual(sectors(id), sectors(donorId), `${id}: turret and hull ERA follow the donor study's sectors`);
}

// 274: the surface-seated cassette solver left with its last builds: the T-80BV's Kontakt-1 is its own wedge arrays on
// carrier frames and the T-80U Kursk draws the T-80U X's Kontakt-5 (t80Marks.selftest.mjs pins both).

console.log('turretEraSurfaceSeating.selftest: the T-80UK and the Jaguar carry their donor studies\' reactive sectors');
