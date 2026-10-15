// weaponCoverage.selftest.mjs — every weapon station of every playable vehicle sounds (AU.02, the audio stream,
// 2026-10-13). A shot plays its class's close report (a missile: its family's launch), its distant report, and for our
// own gun the class's own report where it has one; this receipt walks the whole registered fleet and holds each of
// them to a shipped recording:
//   - the main gun's every round, with the round's own sound profile or the gun's (as state.ts emitShellFired does);
//   - every roof or auxiliary station the sim fires (auxiliary:fired carries only its calibre, so the bore decides);
//   - a '*-launch' profile is a launcher the trims know (one they did not would play as a gun of its bore), and every
//     guided round resolves a launch family whose recording ships.
// A report class nothing in the fleet fires is fine; a station that resolves to nothing is not.
import assert from 'node:assert/strict';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import { LAUNCH_ASSET, WEAPON_CLASSES, isLaunchProfile, missileLaunchFor, weaponReportAssets } from './weaponAudio.ts';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';

// The authority's fleet facade registers every saved spec (gun, rounds) without building a model.
await import('../vehicles/authorityFleet.ts');
const { TANK_SPECS, VISIBLE_TANK_IDS, RUNTIME_TANK_IDS } = await import('../vehicles/specs.ts');

const ids = [...new Set([...VISIBLE_TANK_IDS, ...RUNTIME_TANK_IDS])].filter((id) => TANK_SPECS[id]);
assert.ok(ids.length >= 150, `the playable fleet is registered (${ids.length} vehicles)`);

const shipped = (id) => !!SFX_ASSETS[id] && SFX_ASSETS[id].n >= 1;
const classes = new Map();
const launches = new Map();
let stations = 0;
let rounds = 0;

function check(where, caliberMm, profile, roundName) {
  assert.ok(Number.isFinite(caliberMm) && caliberMm > 0, `${where}: a calibre (${caliberMm})`);
  if (typeof profile === 'string' && profile.endsWith('-launch')) {
    assert.ok(isLaunchProfile(profile), `${where}: launcher profile '${profile}' is known to weaponAudio REPORT_TRIMS (else it plays as a ${caliberMm} mm gun)`);
  }
  const r = weaponReportAssets(caliberMm, profile, roundName);
  assert.ok(WEAPON_CLASSES[r.cls], `${where}: class ${r.cls}`);
  assert.ok(shipped(r.close), `${where}: close report ${r.close} (${r.cls}) ships`);
  assert.ok(shipped(r.far), `${where}: distant report ${r.far} (${r.cls}) ships`);
  if (r.own) assert.ok(shipped(r.own), `${where}: own report ${r.own} (${r.cls}) ships`);
  classes.set(r.cls, (classes.get(r.cls) ?? 0) + 1);
  if (r.cls === 'atgm') {
    const kind = missileLaunchFor(roundName, profile);
    launches.set(kind, (launches.get(kind) ?? 0) + 1);
  }
}

for (const id of ids) {
  const spec = TANK_SPECS[id];
  const gun = spec.gun;
  assert.ok(gun && Array.isArray(gun.shells) && gun.shells.length, `${id}: a main gun with rounds`);
  for (const shell of gun.shells) {
    rounds++;
    check(`${id} ${shell.name}`, shell.caliberMm, shell.soundProfile || gun.soundProfile || null, shell.name);
  }
  const kit = auxiliaryCapabilities(spec);
  for (const [index, station] of (kit?.guns ?? []).entries()) {
    stations++;
    check(`${id} station ${index} (${station.name})`, station.caliberMm, null, null);
    // the sim's profile for the station fires a round of the station's own class
    const shot = auxiliaryWeaponProfile(station.caliberMm, id).shell;
    check(`${id} station ${index} round`, shot.caliberMm, null, null);
  }
}

// The M551A1 TTS's re-armed roof 30 mm (VH.01, deploy 222) is an autocannon, heard as one.
const tts = Object.keys(TANK_SPECS).find((id) => /m551.*tts|tts.*m551/i.test(id));
if (tts) {
  const gun = auxiliaryCapabilities(TANK_SPECS[tts])?.guns?.[0];
  assert.ok(gun, `${tts}: its roof station`);
  assert.equal(weaponReportAssets(gun.caliberMm, null).cls, 'ac_30', `${tts}: the roof 30 mm sounds as a 30 mm autocannon`);
}

// Every launch family's recording ships, and the fleet's guided rounds use more than one.
for (const id of Object.values(LAUNCH_ASSET)) assert.ok(shipped(id), `launch ${id} ships`);
assert.ok(launches.size >= 3, `guided rounds launch in ${launches.size} ways`);

console.log(`weaponCoverage.selftest: ${ids.length} vehicles, ${rounds} rounds, ${stations} roof/auxiliary stations — every one resolves a shipped report;`
  + ` classes ${[...classes].sort().map(([c, n]) => `${c}×${n}`).join(' ')}; launches ${[...launches].sort().map(([k, n]) => `${k}×${n}`).join(' ')}`
  + (tts ? `; ${tts} roof 30 mm = ac_30` : ''));
