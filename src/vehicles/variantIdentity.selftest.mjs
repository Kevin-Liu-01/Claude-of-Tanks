// variantIdentity.selftest.mjs — a variant built on a donor mark's build wears its own suit (2026-11-08
// implicit-state-machine sweep, round 8 s5-05). Copyright © 2026 Kevin B. Liu.
//
// The Australian M1A1 AIM SA and the Ukrainian M1A1 build on another mark's build (the plain M1A1, the M1A1HA): the
// donor's family branches read P.spec.id, so the variant presents the donor's id for the donor build and restores its
// own in finally. The donor build asks for a suit under that id (abrams.ts buildTejasFamily), and a port takes one suit
// (ghillieSuit.ts SUITED: the first claim wins). The variants asked for theirs after the donor build, so the day a
// donor row exists (the owner keeps asking for heavier Abrams nets) the donor's suit is laid on the variant and its own
// heavier one is refused, with no error. profiles/donorBuild.ts buildOnDonor is now the one owner of a donor build: the
// variant claims its own suit first (as t90am does before its T-90SM build), names itself the donor's host, swaps the
// id and restores it.
//
// With a test row for each donor (ghillieSuit.ts ghillieSuitTestHooks: the variant's own net under the donor's id), each
// variant's suit meshes are its own row's (named from its own id), its spec keeps its id, and its hull names it host.
import assert from 'node:assert/strict';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

installCanvasFixture();
const { ghillieSuitTestHooks, GHILLIE_SUIT_CONFIGS } = await import('./ghillieSuit.ts');
const { FLEET_GHILLIE_SUITS } = await import('./ghillieFleetSuits.ts');
const { createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { TANK_SPECS } = await import('./specs.ts');
const { tankSeedId } = await import('./tankIdAliases.ts');

const hooks = ghillieSuitTestHooks();
assert.equal(FLEET_GHILLIE_SUITS.m1a1_aim_sa_aus.density, 2.3, 'the Australian M1A1 wears the heavy net (AUS_HEAVY)');
const CASES = [
  // [variant, donor, the variant's own row]
  ['m1a1_aim_sa_aus', 'm1a1', FLEET_GHILLIE_SUITS.m1a1_aim_sa_aus],
  ['ua_m1a1', 'm1a1ha', GHILLIE_SUIT_CONFIGS.ua_m1a1],
];

for (const [id, donor, own] of CASES) {
  assert.ok(own && own.id === id, `${id} has a suit row of its own`);
  hooks.setRow(donor, { ...own, id: donor });
  try {
    await ensureTankBuilder(id);
    const visual = createTank(id, null, { camoSeed: 4242, quality: 'low', geometryQuality: 'low', materialMode: 'geometry-only',
      proceduralOnly: true, decor: false, eraVisualBindingReceipt: false });
    try {
      const owners = new Set();
      visual.root.traverse((object) => {
        const match = /^(.*)_ghillie_/.exec(object.name);
        if (match) owners.add(match[1]);
      });
      assert.deepEqual([...owners], [tankSeedId(id)],
        `${id} wears its own suit, never its donor ${donor}'s (the donor build claimed the build's one suit first)`);
      assert.equal(TANK_SPECS[id].id, id, `${id}: the spec's id is its own again after the donor build`);
      assert.equal(visual.root.getObjectByName('rig_hull')?.userData.m1a1BaseHost, id, `${id} names itself the ${donor} shell's host`);
    } finally {
      visual.dispose();
    }
  } finally {
    hooks.reset();
  }
}

// ---- the seam is a test's alone: no row stands in front of the tables once reset
{
  await ensureTankBuilder('m1a1');
  const visual = createTank('m1a1', null, { camoSeed: 4242, quality: 'low', geometryQuality: 'low', materialMode: 'geometry-only',
    proceduralOnly: true, decor: false, eraVisualBindingReceipt: false });
  let suited = false;
  visual.root.traverse((object) => { if (/_ghillie_/.test(object.name)) suited = true; });
  visual.dispose();
  assert.equal(suited, false, 'the plain M1A1 has no suit row: the reset seam leaves none behind');
}
console.log('variantIdentity.selftest: the Australian and Ukrainian M1A1s wear their own suits on their donors\' builds, ids restored');
