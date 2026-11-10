// 2026-11-02 audit F10: the killcam's wreck receipt (game/killcamWreckReceipt.ts), one for the victim and for an
// attacker that died after firing (a traded kill):
//  - the receipt reads the visual's declared wreck state: a cook-off comes back a cook-off (the attacker's re-wreck had
//    pop:false hard-coded), and the killing hit's ammo-rack flag makes one too;
//  - a turret its authority held is declared held again (awaitWreckTurretPose, then the held pose) BEFORE the late
//    re-wreck, so no local body is thrown and settled by its seat (the attacker's re-wreck declared none: its turret lay
//    where the authority's collision turret was not);
//  - a wreck the replay never lifted keeps its own turret; a standing visual has no receipt;
//  - (round 2 U32) a fresh kill's receipt (recorded on the kill's own tick: the host's pose awaited, none placed yet)
//    declares the authority again at the re-wreck, so no local body is thrown at age 12 before the host's next pose;
//  - (round 2 U32) an entity alive again at the teardown (a network battle applies frames during the replay; an arcade
//    respawn takes 3-6 s) is never re-wrecked: its presentation had reset it, and nothing would have reset it again.
// The real visual's side (an awaited pose before a late-age wreck lies at that pose) is wreckTurretMode.selftest's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { recordKillcamWreck, restoreKillcamWreck, KILLCAM_REWRECK_AGE_S } from './killcamWreckReceipt.ts';

function visual({ state = 'plain', held = null, authority = !!held } = {}) {
  const calls = [];
  let wreck = state;
  return {
    calls,
    isDestroyed: () => wreck !== 'intact',
    wreckState: () => wreck,
    wreckTurretHeldPose(out) { if (!held) return false; out.set(held); return true; },
    wreckTurretAuthority: () => authority,
    awaitWreckTurretPose() { calls.push(['await']); },
    setWreckTurretPose(pose) { calls.push(['pose', Array.from(pose)]); },
    setDestroyed(options) { calls.push(['wreck', options]); wreck = options.pop ? 'cookoff' : 'plain'; },
    resetDestroyed() { wreck = 'intact'; },
  };
}
const held = [4, 1.2, -3, 0, 0.38, 0, 0.92];

// a standing visual: no receipt
assert.equal(recordKillcamWreck(visual({ state: 'intact' })), null, 'a standing visual has no wreck receipt');

// an attacker cooked off after firing, its turret held by its authority: lifted by the restage, then re-wrecked
{
  const v = visual({ state: 'cookoff', held });
  const receipt = recordKillcamWreck(v);
  assert.equal(receipt.pop, true, 'a cook-off reads as one from its declared state');
  assert.deepEqual(Array.from(receipt.turretPose), held, "and keeps its authority's turret pose");
  v.resetDestroyed();
  restoreKillcamWreck(v, receipt);
  assert.deepEqual(v.calls, [['await'], ['pose', held], ['wreck', { pop: true, ageS: KILLCAM_REWRECK_AGE_S }]],
    "the authority's pose is declared before the late cook-off re-wreck");
}

// a plain wreck no authority held: plain again, no pose declared
{
  const v = visual({ state: 'plain' });
  const receipt = recordKillcamWreck(v);
  assert.deepEqual([receipt.pop, receipt.turretPose], [false, null]);
  v.resetDestroyed();
  restoreKillcamWreck(v, receipt);
  assert.deepEqual(v.calls, [['wreck', { pop: false, ageS: KILLCAM_REWRECK_AGE_S }]], 'a plain wreck comes back plain');
}

// the victim's hint: the killing hit's ammo-rack flag makes a cook-off
assert.equal(recordKillcamWreck(visual({ state: 'plain' }), true).pop, true, "the killing hit's ammo-rack flag pops it");

// a wreck the replay never lifted (pre-destroyed) keeps its own turret: no pose is declared over it
{
  const v = visual({ state: 'cookoff', held });
  restoreKillcamWreck(v, recordKillcamWreck(v));
  assert.deepEqual(v.calls.map((c) => c[0]), ['wreck'], 'a wreck still lying keeps its own turret');
}

// a fresh kill: the host owns the turret, its pose not placed yet on the kill's own tick
{
  const v = visual({ state: 'cookoff', authority: true });
  const receipt = recordKillcamWreck(v);
  assert.deepEqual([receipt.turretPose, receipt.authority], [null, true], 'the receipt keeps the authority without a pose');
  v.resetDestroyed();
  assert.equal(restoreKillcamWreck(v, receipt, { destroyed: true }), true);
  assert.deepEqual(v.calls, [['await'], ['wreck', { pop: true, ageS: KILLCAM_REWRECK_AGE_S }]],
    'the re-wreck awaits the host again (no local body thrown before its next pose)');
}

// the entity respawned during the replay: alive at the teardown, never re-wrecked
for (const [label, v] of [['a victim', visual({ state: 'plain' })], ['an attacker its host holds', visual({ state: 'cookoff', held })]]) {
  const receipt = recordKillcamWreck(v);
  v.resetDestroyed();
  assert.equal(restoreKillcamWreck(v, receipt, { destroyed: false }), false, `${label} alive again is not re-wrecked`);
  assert.deepEqual(v.calls, [], `${label}: nothing declared, nothing wrecked`);
  assert.equal(v.isDestroyed(), false);
}

// ---- the killcam's own teardown restores (killcam.ts, source-executed): they pass the live combat record ----
{
  const killcam = readFileSync(new URL('./killcam.ts', import.meta.url), 'utf8');
  const fn = (name) => {
    const start = killcam.indexOf(`  function ${name}(`);
    assert.notEqual(start, -1, `killcam.ts declares ${name}`);
    return killcam.slice(start, killcam.indexOf('\n  }\n', start) + 4);
  };
  const restores = new Function('restoreKillcamWreck', stripTypeScriptTypes(`function make() {
${fn('restoreWreckPresentation')}
${fn('restoreAttackerPresentation')}
    return { restoreWreckPresentation, restoreAttackerPresentation };
  }`) + '\nreturn make();')(restoreKillcamWreck);
  const tank = (destroyed) => {
    const v = visual({ state: 'plain' });
    const tracks = [];
    Object.assign(v, { setTrackState: (m, broken) => tracks.push([m, broken]), stripEra() {}, syncFromState() {}, setVisible() {} });
    const receipt = recordKillcamWreck(v);
    v.resetDestroyed(); // the replay lifted it
    return { v, tracks, receipt, entity: { combat: { destroyed }, state: {}, visual: v } };
  };
  for (const destroyed of [true, false]) {
    const victim = tank(destroyed), attacker = tank(destroyed);
    const replay = {
      rewreck: { ...victim.receipt, brokenTracks: ['trackL'], eraSpent: [] },
      snap: { targetEnt: victim.entity, attackerEnt: attacker.entity },
      attackerPoseState: {}, attackerRestore: { wasDestroyed: true, wasVisible: true, wreck: attacker.receipt },
    };
    restores.restoreWreckPresentation(replay);
    restores.restoreAttackerPresentation(replay);
    const label = destroyed ? 'still dead' : 'respawned during the replay';
    assert.equal(victim.v.isDestroyed(), destroyed, `the victim ${label}: ${destroyed ? 're-wrecked' : 'stays alive'}`);
    assert.deepEqual(victim.tracks, destroyed ? [['trackL', true]] : [], `the victim ${label}: ${destroyed ? 'its broken track again' : 'no old track breaks'}`);
    assert.equal(attacker.v.isDestroyed(), destroyed, `the attacker ${label}: ${destroyed ? 're-wrecked' : 'stays alive'}`);
  }
}

console.log('killcamWreckReceipt.selftest: a restaged wreck, victim or attacker, comes back with its own look and its authority\'s turret pose declared first');
