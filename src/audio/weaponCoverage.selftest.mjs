// weaponCoverage.selftest.mjs — every weapon station of every playable vehicle sounds (AU.02, the audio stream,
// 2026-10-13; gun-reports-269, 2026-11-03). A shot plays its row's close report (a missile: its family's launch), its
// distant report, and for our own gun its own report and its closed turret's; this receipt walks the whole registered
// fleet and holds each of them to a shipped recording:
//   - every mount of the main gun (weaponAudio.ts weaponMounts: the gun's own rounds at the gun's bore, each secondary
//     group, each guided round), keyed by bore and construction to a row of WEAPON_ROWS;
//   - every roof or auxiliary station the sim fires (auxiliary:fired carries only its calibre, so the bore decides);
//   - a '*-launch' profile is a launcher the trims know, and every guided round resolves a launch family whose
//     recording ships;
//   - every reload a mount can run plays only shipped recordings, by its loader's make.
import assert from 'node:assert/strict';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import {
  LAUNCH_ASSET, WEAPON_ROWS, isLaunchProfile, loaderFor, missileLaunchFor, reloadAssets, stationMount, weaponMounts, weaponReportAssets,
} from './weaponAudio.ts';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';

// The authority's fleet facade registers every saved spec (gun, rounds) without building a model.
await import('../vehicles/authorityFleet.ts');
const { TANK_SPECS, VISIBLE_TANK_IDS, RUNTIME_TANK_IDS } = await import('../vehicles/specs.ts');

const ids = [...new Set([...VISIBLE_TANK_IDS, ...RUNTIME_TANK_IDS])].filter((id) => TANK_SPECS[id]);
assert.ok(ids.length >= 150, `the playable fleet is registered (${ids.length} vehicles)`);

const shipped = (id) => !!SFX_ASSETS[id] && SFX_ASSETS[id].n >= 1;
const keys = new Map();
const launches = new Map();
const loaders = new Map();
let stations = 0;
let mounts = 0;

function check(where, m, profile, roundName) {
  assert.ok(m.row, `${where}: key ${m.key} has a row in WEAPON_ROWS`);
  if (typeof profile === 'string' && profile.endsWith('-launch')) {
    assert.ok(isLaunchProfile(profile), `${where}: launcher profile '${profile}' is known to weaponAudio REPORT_TRIMS (else it plays as a gun)`);
  }
  const r = weaponReportAssets(m, profile, roundName);
  assert.ok(shipped(r.close), `${where}: close report ${r.close} (${r.key}) ships`);
  assert.ok(shipped(r.far), `${where}: distant report ${r.far} (${r.key}) ships`);
  if (r.own) assert.ok(shipped(r.own), `${where}: own report ${r.own} (${r.key}) ships`);
  if (r.interior) assert.ok(shipped(r.interior), `${where}: closed-turret report ${r.interior} (${r.key}) ships`);
  keys.set(r.key, (keys.get(r.key) ?? 0) + 1);
  if (r.key === 'guided/missile') {
    const kind = missileLaunchFor(roundName, profile);
    launches.set(kind, (launches.get(kind) ?? 0) + 1);
  }
}

for (const id of ids) {
  const spec = TANK_SPECS[id];
  const gun = spec.gun;
  assert.ok(gun && Array.isArray(gun.shells) && gun.shells.length, `${id}: a main gun with rounds`);
  for (const m of weaponMounts(gun)) {
    mounts++;
    for (const name of m.rounds) {
      const shell = gun.shells.find((s) => s.name === name);
      check(`${id} ${name}`, m, shell.soundProfile || gun.soundProfile || null, name);
    }
    const loader = loaderFor(id, m);
    loaders.set(loader, (loaders.get(loader) ?? 0) + 1);
    for (const asset of reloadAssets(m, loader)) assert.ok(shipped(asset), `${id} ${m.key}: its ${loader} reload's ${asset} ships`);
  }
  const kit = auxiliaryCapabilities(spec);
  for (const [index, station] of (kit?.guns ?? []).entries()) {
    stations++;
    check(`${id} station ${index} (${station.name})`, stationMount(station.caliberMm), null, null);
    // the sim's profile for the station fires a round of the station's own class
    const shot = auxiliaryWeaponProfile(station.caliberMm, id).shell;
    check(`${id} station ${index} round`, stationMount(shot.caliberMm), null, null);
  }
}

// The M551A1 TTS's re-armed roof 30 mm (VH.01, deploy 222) is an autocannon, heard as one.
const tts = Object.keys(TANK_SPECS).find((id) => /m551.*tts|tts.*m551/i.test(id));
if (tts) {
  const gun = auxiliaryCapabilities(TANK_SPECS[tts])?.guns?.[0];
  assert.ok(gun, `${tts}: its roof station`);
  assert.equal(stationMount(gun.caliberMm).key, '30/belt', `${tts}: the roof 30 mm sounds as a 30 mm autocannon`);
}

// Every launch family's recording ships, and the fleet's guided rounds use more than one.
for (const id of Object.values(LAUNCH_ASSET)) assert.ok(shipped(id), `launch ${id} ships`);
assert.ok(launches.size >= 3, `guided rounds launch in ${launches.size} ways`);
// Every row's banks ship, whether or not this fleet fires it today (the Gun Game and the AC-130 fire the rest).
for (const row of Object.values(WEAPON_ROWS)) for (const id of [row.close, row.far, row.own, row.interior].filter(Boolean)) assert.ok(shipped(id), `${row.key}: ${id} ships`);
assert.ok(loaders.size >= 8, `the fleet loads by ${loaders.size} makes (${[...loaders.keys()]})`);

console.log(`weaponCoverage.selftest: ${ids.length} vehicles, ${mounts} mounts, ${stations} roof/auxiliary stations — every one resolves a shipped report and reload;`
  + ` keys ${[...keys].sort().map(([c, n]) => `${c}×${n}`).join(' ')}; launches ${[...launches].sort().map(([k, n]) => `${k}×${n}`).join(' ')};`
  + ` loaders ${[...loaders].sort().map(([k, n]) => `${k}×${n}`).join(' ')}` + (tts ? `; ${tts} roof 30 mm = 30/belt` : ''));
