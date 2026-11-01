// The damage a hit dealt is the hull points its target lost to it (owner 2026-10-31, "the amount u took off the enemy";
// Main's one rule: its points before less its points after, so a kill reads everything the hull had left). The sim
// stamps hpRemoved where each hit resolves (sim/damage.ts settleHullPoints), the authority carries it over the wire and
// totals it, and every readout reads it through game/hullPointsRemoved.ts. Cases through the real resolution: a
// penetration, a non-penetration, a ricochet, module damage with no hull points, an overkill, an ammo-rack kill, a crew
// kill and a direct HE penetration. Its browser half, tools/shot-damage-figures.browser.mjs (run by hand against a served
// checkout), reads the figures the card, the float, the log and the end report show for the same cases.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { createShell } from './ballistics.ts';
import { createCombatState, resolveShellHit, resolveHeBurst } from './damage.ts';
import { hullPointsRemoved } from '../game/hullPointsRemoved.ts';

const V = (x, y, z) => new Vector3(x, y, z);
const seqRng = (values) => { let i = 0; return () => { assert.ok(i < values.length, 'rng overrun'); return values[i++]; }; };
const shellSpec = (over) => ({ name: 'fixture', type: 'AP', caliberMm: 100, pen100Mm: 200, pen1000Mm: 200, dmg: 250,
  velocityMps: 900, moduleDmg: 100, tracer: 'AP', ...over });
const AP100 = shellSpec({ name: 'AP-100' });
const PZGR39 = shellSpec({ name: 'PzGr.39', caliberMm: 88, pen100Mm: 145, pen1000Mm: 127, dmg: 220, velocityMps: 773,
  moduleDmg: 88 });
const OF471 = shellSpec({ name: 'OF-471 HE', type: 'HE', caliberMm: 122, pen100Mm: 61, pen1000Mm: 61, dmg: 450,
  velocityMps: 770, moduleDmg: 122 });
const plate = (over) => ({ name: 'plate', verts: [[-1, 0, 2], [1, 0, 2], [1, 2, 2], [-1, 2, 2]], physicalMm: 100,
  keMm: 100, ceMm: 100, kind: 'main', era: null, moduleLink: null, gunFollow: false, ...over });
const plateHit = (t, p, angleDeg, point = V(0, 1, 2)) => ({ t, kind: 'plate', plate: p, point, normal: V(0, 0, 1),
  impactAngleDeg: angleDeg });
const state = () => ({ pos: V(0, 0, 0), yaw: 0, speed: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
function target(over = {}) {
  const spec = { id: 'fixture_tank', name: 'Fixture', nation: 'none', era: 'ww2', role: 'medium', hp: 1000,
    gun: { caliberMm: 85, reloadS: 6, baseAccuracy: 0.36, aimTimeS: 2 }, armor: null, ...over };
  return { id: 'target_1', spec, state: state(), combat: createCombatState(spec) };
}
function shell(spec, distM = 100) {
  const s = createShell(spec, 'attacker_1', true, V(0, 1.5, 10), V(0, 0, -1), 1);
  s.ageS = distM / spec.velocityMps;
  return s;
}
/** One case: the event's hpRemoved is the points before less the points after, and the reader returns it. */
function check(name, tank, resolve, expected) {
  const before = tank.combat.hp;
  const ev = resolve();
  assert.equal(ev.targetHpAfter, tank.combat.hp, `${name}: the points after are the hull's`);
  assert.equal(ev.hpRemoved, Math.max(0, before - tank.combat.hp), `${name}: hpRemoved is before less after`);
  assert.equal(ev.hpRemoved, expected, `${name}: hpRemoved ${expected} (got ${ev.hpRemoved}, damage ${ev.damage})`);
  assert.equal(hullPointsRemoved(ev), expected, `${name}: every readout reads it`);
  return ev;
}
const front50 = () => plate({ name: 'front50', physicalMm: 50, keMm: 50, ceMm: 50 });

{
  const tank = target();
  const ev = check('penetration', tank, () => resolveShellHit(shell(AP100), tank, [plateHit(0.4, front50(), 0)],
    seqRng([0.5, 0.5])), 250);
  assert.equal(ev.kind, 'pen');
}
{
  const tank = target();
  const ev = check('non-penetration', tank, () => resolveShellHit(shell(AP100), tank,
    [plateHit(0.4, plate({ name: 'thick', physicalMm: 300, keMm: 300, ceMm: 300 }), 0)], seqRng([0.5, 0.5])), 0);
  assert.equal(ev.damage, 0);
}
{
  const tank = target();
  const ev = check('ricochet', tank, () => resolveShellHit(shell(PZGR39, 300), tank,
    [plateHit(0.4, plate({ name: 'side', physicalMm: 45, keMm: 45, ceMm: 45 }), 75)], () => 0.5), 0);
  assert.equal(ev.kind, 'ricochet');
}
{
  // a module-only ruleset: the round wrecks a module and takes no hull points (the card shows its outcome, no −0)
  const tank = target();
  tank.combat.modeModuleOnlyDamage = true;
  const ev = check('module damage, no hull points', tank, () => resolveShellHit(shell(AP100), tank, [
    plateHit(0.4, front50(), 0),
    { t: 0.45, kind: 'module', module: 'engine', point: V(0, 1, 1.5) },
  ], seqRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])), 0);
  assert.equal(ev.damage, 0);
  assert.ok(ev.modulesHit.length > 0 && !ev.destroyed, 'the module is hit and the hull stands');
}
{
  // a 250 roll into a hull with 50 left: the hull loses 50
  const tank = target();
  tank.combat.hp = 50;
  const ev = check('overkill', tank, () => resolveShellHit(shell(AP100), tank, [plateHit(0.4, front50(), 0)],
    seqRng([0.5, 0.5])), 50);
  assert.ok(ev.destroyed && ev.damage === 250 && ev.targetHpAfter === 0);
}
{
  // a 250 roll cooks off the rack of a full hull: the hull loses its 1000
  const tank = target();
  tank.combat.modules.ammoRack.hp = 40;
  const ev = check('ammo-rack kill', tank, () => resolveShellHit(shell(AP100), tank, [
    plateHit(0.4, front50(), 0),
    { t: 0.45, kind: 'module', module: 'ammoRack', point: V(0, 1, 1.5) },
  ], seqRng([0.5, 0.5, 0.1, 0.5])), 1000);
  assert.ok(ev.ammoRacked && ev.destroyed && ev.damage === 250);
}
{
  // the last crewman knocked out: the hull loses what it had left after the round's own points
  const tank = target();
  tank.combat.crew = { driver: true };
  const ev = check('crew kill', tank, () => resolveShellHit(shell(AP100), tank, [
    plateHit(0.1, plate({ name: 'crew_entry', physicalMm: 50, keMm: 50, ceMm: 50 }), 0),
    { t: 0.2, tExit: 0.3, kind: 'crew', crew: 'driver', point: V(0, 1, 1.5) },
  ], seqRng([0.5, 0.5, 0.1])), 1000);
  assert.ok(ev.destroyed && ev.crewHit.includes('driver') && ev.damage === 250);
}
{
  const tank = target();
  const burst = plate({ name: 'he_face', physicalMm: 10, keMm: 10, ceMm: 10 });
  const ev = check('direct HE penetration', tank, () => resolveHeBurst(shell(OF471), V(0, 1, 2), [], tank,
    [plateHit(0.1, burst, 0)], seqRng([0.5, 0.5]))[0], 450);
  assert.equal(ev.kind, 'he_pen');
}

// the reader: a staged event with no hpRemoved reads as its damage; nothing is worked out
assert.equal(hullPointsRemoved({ damage: 320 }), 320);
assert.equal(hullPointsRemoved({ damage: 320, hpRemoved: 50 }), 50);
assert.equal(hullPointsRemoved({ damage: 0, hpRemoved: 900 }), 900);
assert.equal(hullPointsRemoved({}), 0);
assert.equal(hullPointsRemoved({ damage: Number.NaN }), 0);

// the authority sends it and totals it; the readouts read it and never the roll
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const authority = read('./authoritativeMatch.ts');
assert.match(authority, /hpRemoved: Math\.max\(0, Math\.round\(hit\.hpRemoved \|\| 0\)\),/, 'the wire carries hpRemoved');
assert.match(authority, /if \(shooter && hit\.hpRemoved > 0\) shooter\.damage \+= hit\.hpRemoved;/,
  'the scoreboard totals hpRemoved');
const damage = read('./damage.ts');
assert.equal((damage.match(/event\.targetHpAfter = /g) || []).length, 1, 'only settleHullPoints writes the points after');
// (the card's trace keeps the roll's damage beside what it shows: card.dataset.damage and card.dataset.removed)
const TRACE = 'card.dataset.damage = String(Math.round(ev.damage || 0));';
for (const [path, reads] of [
  ['../ui/shotInfo.ts', /\b(?:ev|shot\.ev|best\.ev|it\.ev)\.damage\b/g],
  ['../ui/hud.ts', /\bhit\.damage\b/g],
  ['../ui/shotReadoutPolicy.ts', /\bhit\.damage\b/g],
  ['../ui/damageNumberBurst.ts', /\bhit\.damage\b/g],
  ['../game/serviceRecord.ts', /Math\.max\(0, finite\(event\.damage\)\)/g],
  ['../game/profile.ts', /Number\(event\.damage\)/g],
]) {
  const source = read(path).replace(TRACE, '');
  assert.ok(source.includes('hullPointsRemoved('), `${path} reads hullPointsRemoved`);
  const left = [...source.matchAll(reads)].map((m) => source.slice(Math.max(0, m.index - 40), m.index + 20));
  assert.deepEqual(left, [], `${path} reads no hit's damage for a figure or a total`);
}
console.log('hullPointsRemoved.selftest: 8 resolved cases (pen, non-pen, ricochet, module-only, overkill, ammo rack, '
  + 'crew, direct HE) carry before less after; the wire, the scoreboard and the readouts read it');
