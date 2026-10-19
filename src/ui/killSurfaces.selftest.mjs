// killSurfaces.selftest.mjs — an AC-130's kill reads as the AC-130's on every surface (lane ac130-fx-228, 2026-10-19;
// the owner: "in kills it still says the tank u chose instead of ac 130 having done the kill. fix that").
// The one identity (ui/killSourceIdentity.ts: killSourceIdentity / attackerLabel / vehicleName), the final blow, the battle
// report's end rosters, the pen annotation, and a structural guard that every surface reads the authority's source
// through that identity (the kill feed, the killcam, the battle report, the loading and HUD rosters, the service record)
// and that the hard-coded "AC-130" literals and the client's drone-by-name heuristic are gone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attackerLabel, killSourceIdentity, vehicleName } from './killSourceIdentity.ts';
import { resolveFinalBlow, finalBlowLine } from './finalBlow.ts';
import { mergeEndRosterRow } from './shotInfo.ts';
import { nominalPenFor } from './hitEventFormat.ts';
import { GUNSHIP_WEAPONS } from '../sim/matchRuleset.ts';
import { penAtDistanceMm } from '../sim/ballistics.ts';

// ---- the identity ----
assert.deepEqual(killSourceIdentity('ac130'), { source: 'ac130', label: 'AC-130', icon: 'modeAc130' });
assert.deepEqual(killSourceIdentity('drone'), { source: 'drone', label: 'FPV drone', icon: 'modeDrone' });
for (const other of ['vehicle', undefined, null, '', '__proto__', '<b>']) assert.equal(killSourceIdentity(other), null, `${other}: the vehicle itself`);
assert.equal(attackerLabel({ attackerSource: 'ac130', attackerName: 'T-90M' }), 'AC-130', "the gunship's hit names the aircraft, not the pilot's T-90M");
assert.equal(attackerLabel({ attackerName: 'Leopard 2A7' }), 'Leopard 2A7');
assert.equal(attackerLabel({}), undefined);
assert.equal(vehicleName({ aerial: { kind: 'gunship' }, spec: { name: 'T-90M', id: 't90am' } }), 'AC-130', "a gunship pilot's vehicle is the AC-130");
assert.equal(vehicleName({ aerial: { kind: 'drone' }, spec: { name: 'BMP-3', id: 'bmp3' } }), 'BMP-3',
  "a drone carrier stays its tank (only its drone's kills name the drone)");
// (r2) the HUD asks every frame: the same identity object each time, nothing allocated per call
assert.equal(killSourceIdentity('ac130'), killSourceIdentity('ac130'), 'the identity is made once per locale');
assert.ok(Object.isFrozen(killSourceIdentity('drone')));
// (r2) icons.ts ships with the boot set: the identity (and its i18n read) stays out of it
assert.equal(/killSourceIdentity|from '\.\/i18n\.ts'/.test(readFileSync(new URL('./icons.ts', import.meta.url), 'utf8')), false,
  'icons.ts carries no identity and no i18n import');

// ---- the final blow ----
const names = new Map([['me', 'T-90M'], ['e1', 'M1A2']]);
const nameOf = (id) => names.get(id) ?? null;
{
  const lethal = { attackerId: 'me', attackerName: attackerLabel({ attackerSource: 'ac130', attackerName: 'T-90M' }), targetId: 'e1',
    targetName: 'M1A2', shellName: '152 mm Howitzer', shellType: 'HE' };
  const blow = resolveFinalBlow(lethal, { id: 'e1', killerId: 'me', cause: 'shot', source: 'ac130' }, null, nameOf);
  assert.equal(blow.attacker, 'AC-130');
  assert.equal(finalBlowLine(blow), 'Final blow — AC-130 destroyed M1A2 with 152 mm Howitzer');
  const noLethal = resolveFinalBlow(null, { id: 'e1', killerId: 'me', cause: 'shot', source: 'ac130' }, null, nameOf);
  assert.equal(noLethal.attacker, 'AC-130', 'the destruction alone names the AC-130 too');
  const tankKill = resolveFinalBlow(null, { id: 'e1', killerId: 'me', cause: 'shot' }, null, nameOf);
  assert.equal(tankKill.attacker, 'T-90M', "a tank's kill keeps its tank");
}

// ---- the battle report's end rosters ----
{
  const rows = new Map();
  mergeEndRosterRow(rows, { id: 'me', team: 'player', alive: true, isPlayer: true, specId: 't90am', vehicle: 'T-90M', aircraft: true }, false);
  mergeEndRosterRow(rows, { id: 'e1', team: 'enemy', alive: false, specId: 'm1a2', vehicle: 'M1A2' }, false);
  assert.equal(rows.get('me').name, 'AC-130', "the pilot's row names the AC-130");
  assert.equal(rows.get('me').aircraft, true, 'and draws its icon');
  assert.equal(rows.get('e1').name, 'M1A2');
  assert.equal(rows.get('e1').aircraft, undefined);
}

// ---- the pen annotation reads the gunship's shells, not the pilot's tank's ----
{
  const howitzer = GUNSHIP_WEAPONS[1];
  const pen = nominalPenFor({ attackerSource: 'ac130', attackerSpecId: 't90am', shellName: howitzer.name, shellType: howitzer.type, flightDistM: 260 });
  assert.equal(pen, Math.round(penAtDistanceMm(howitzer, 260)), "the howitzer's own nominal penetration");
}

// ---- every surface reads the source through the one identity ----
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const hud = src('./hud.ts'), killcam = src('../game/killcam.ts'), shotInfo = src('./shotInfo.ts'), battleLoad = src('./battleLoad.ts');
const roster = src('../game/rosterPresentation.ts'), record = src('./serviceRecordView.ts'), endScreen = src('./endScreen.ts');
assert.match(hud, /killSourceIdentity\(payload\.source\)/, 'the kill feed names the authority\'s source');
assert.match(hud, /vehicleName\(tank\)/, 'the HUD rosters name a gunship pilot through the identity');
assert.match(killcam, /attackerLabel\(event\)/, "the killcam's header and lines");
assert.match(killcam, /killSourceIdentity\(event\.attackerSource\)/, "the killcam's killer card");
assert.match(shotInfo, /attackerLabel\(ev\)/, 'the battle report');
assert.match(battleLoad, /killSourceIdentity\('ac130'\)/, 'the loading roster');
assert.match(record, /killSourceIdentity\(step\.source\)/, 'the service record');
assert.match(endScreen, /result\.aircraft/, 'the end screen draws the aircraft icon');
assert.match(endScreen, /sum\.playerAircraft/, "the debrief's vehicle card shows the AC-130, not the garage tank's picture");
assert.match(shotInfo, /playerAircraft: true/, 'the report hands the debrief the aircraft');
for (const [name, text] of [['hud.ts', hud], ['battleLoad.ts', battleLoad], ['rosterPresentation.ts', roster]]) {
  assert.equal(/['"`]AC-130['"`]/.test(text), false, `${name}: no hard-coded "AC-130" literal (the i18n flight.gunship identity)`);
}
assert.equal(/isDroneStrike|lethalDroneTargets|FPV shaped charge/.test(hud), false, "the client's drone-by-name heuristic is gone");
assert.equal(/FPV shaped charge/.test(src('../game/serviceRecord.ts')), false, 'the service record reads the drone source too');

console.log('killSurfaces: the AC-130 and drone identity, final blow, end rosters, pen annotation and every surface through it passed');
