// The mode's seeded streams survive a host migration (gaps 274, G1). The mode controller draws from two seeded streams:
// the draws (each wave's shuffle of the pool, Frontline's reinforcement shuffle, the caches' kind and spot) and the
// arrival points (the Horde's and the infected's rings, Frontline's line slots). The checkpoint a migration seals did not
// carry them, so an elected host drew from its own seed, restarted (and moved on by its constructor's own opening): the
// next Horde wave fielded other identities than the old host's, a hull resting on the old host joined, every arrival
// stood elsewhere on the ring, Frontline's next sector was reinforced by other hulls on other slots, and Mars's next
// cache fell elsewhere. ModeCheckpoint.rng now carries both streams' positions; restoreCheckpoint sets them first.
//
// Proof by parity: an uninterrupted host and a new host restored from JSON.parse(JSON.stringify(captureCheckpoint())),
// the keyframe's own encoding (migrationState.ts), over the same hulls, stepped on the same clock with the same kills,
// log every revive (the hull, where it rose, when) and every cache: the two logs are the same. [1] Endless Horde,
// migrated in the lull after wave 3: waves 4 and 5 field the same hulls on the same ring points. [2] Endless Horde,
// migrated mid-wave 4 with its queue trickling in: the trickle's arrivals and wave 5 match. [3] Frontline, migrated on
// sector 2: its fall reinforces sector 3 with the same hulls on the same slots, and the rear trickle matches. [4] Mars,
// migrated after the first cache: the next caches fall where the old host's do. [5] the checkpoint names both streams
// as integers that survive the JSON round trip. [6] (fix-up r1, the correctness review of gaps 274) Endless Horde,
// migrated mid-wave 8, a runner wave: every standing hostile drives at the wave's pace on the new host (x1.64; the
// restore's base stamp had it at x1.0, and only a revive stamped the wave's), at every step through wave 10, and the
// hulls rise where the old host's do.
import { createMatchModeController } from './matchModes.ts';
import { matchRulesetFor } from './matchRuleset.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] } });

/** A 40 m ridge ring 190-210 m round (0, -150): the Horde's rings beyond it are out of the humans' sight. */
const bowl = (x, z) => { const r = Math.hypot(x, z + 150); return r > 190 && r < 210 ? 40 : 0; };
/** A 40 m ridge 30 m in front of each Frontline sector (z -200, 40, 280 on the 800 m axis) hides the lines. */
const ridged = (x, z) => ([-160, 80, 320].some((r) => Math.abs(z - r) < 6) ? 40 : 0);
const MODES = {
  endless_horde: { terrain: bowl, roster: () => [tank('human', 'alpha', 0, -150, false), tank('ally-0', 'alpha', 10, -150),
    ...Array.from({ length: 20 }, (_, i) => tank(`z${i}`, 'bravo', i * 6 - 60, 380))] },
  frontline_assault: { terrain: ridged, roster: () => [tank('human', 'alpha', 0, -400, false), ...[0, 1, 2].map((i) => tank(`ally-${i}`, 'alpha', i * 12 - 12, -400)),
    ...Array.from({ length: 12 }, (_, i) => tank(`def-${i}`, 'bravo', i * 8 - 44, 400))] },
  mars: { terrain: () => 0, roster: () => [tank('human', 'alpha', 0, -150, false), tank('ally-0', 'alpha', 12, -150),
    tank('m0', 'bravo', 0, 150), tank('m1', 'bravo', 12, 150)] },
};

/** One host: its controller over its own hulls, and the log of every revive and cache from `log.on`. */
function host(mode, seed) {
  const { terrain, roster } = MODES[mode];
  const entities = roster();
  const log = { on: false, entries: [] };
  const clock = { t: 0 };
  const ctl = createMatchModeController({ mode, entities, seed, terrainHeight: terrain, ruleset: matchRulesetFor(mode),
    emit(type, payload) { if (log.on && type === 'mode_pickup_spawned') log.entries.push(`cache ${payload.id} ${payload.kind} (${payload.x}, ${payload.z}) at ${clock.t}`); },
    setActive(target, active) { target.modeActive = active; },
    revive(target, spawn) {
      Object.assign(target.state.pos, { x: spawn.x, y: terrain(spawn.x, spawn.z), z: spawn.z }); target.state.yaw = spawn.yaw ?? 0;
      target.combat = { ...target.combat, hp: target.combat.maxHp, destroyed: false };
      if (log.on) log.entries.push(`${target.id} (${spawn.x}, ${spawn.z}) at ${clock.t}`);
    } });
  return { mode, seed, entities, ctl, log, clock, byId: (id) => entities.find((e) => e.id === id) };
}
const standing = (h, team) => h.entities.filter((e) => e.team === team && e.modeActive !== false && !e.combat.destroyed);
/** One step of `seconds` on a host, with the scripted fight: `fight(host)` runs before every step. */
function play(h, seconds, fight, dt = 0.25) {
  const end = h.clock.t + seconds;
  while (h.clock.t < end - 1e-9) { fight(h); h.clock.t += dt; h.ctl.step(1 / 60, h.clock.t); }
}
/** The elected host: its constructor's own opening, then the old host's hulls and the JSON keyframe. */
function migrate(old) {
  const keyframe = JSON.parse(JSON.stringify(old.ctl.captureCheckpoint(old.clock.t)));
  const fresh = host(old.mode, old.seed);
  for (const [i, hull] of old.entities.entries()) {
    const twin = fresh.entities[i];
    Object.assign(twin.state.pos, hull.state.pos); twin.state.yaw = hull.state.yaw;
    twin.combat = { ...hull.combat }; twin.modeActive = hull.modeActive; twin.team = hull.team;
  }
  fresh.ctl.restoreCheckpoint(keyframe);
  fresh.clock.t = old.clock.t;
  old.log.on = fresh.log.on = true;
  old.log.entries.length = fresh.log.entries.length = 0;
  return { fresh, keyframe };
}
/** The two logs from the migration on, and the first entry where they part. */
function compare(label, old, fresh, minEntries) {
  const a = old.log.entries, b = fresh.log.entries;
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at++;
  ok(a.length >= minEntries, `${label}: the case is built: the old host logs ${a.length} revives and caches after the migration (at least ${minEntries})`);
  ok(at === a.length && a.length === b.length, `${label}: the new host revives and drops as the old host does (${at} of ${a.length} the same`
    + `${at < Math.max(a.length, b.length) ? `; first apart: old "${a[at] ?? 'none'}" vs new "${b[at] ?? 'none'}"` : ''})`);
}

// the Horde's fight: every hostile standing falls before each step (the wave clears, the queue trickles in)
const killHostiles = (h) => { for (const z of standing(h, 'bravo')) { z.combat.destroyed = true; z.combat.hp = 0; } };

console.log('[1] Endless Horde, migrated in the lull after wave 3: waves 4 and 5 field the same hulls on the same ring points');
{
  const old = host('endless_horde', 31);
  for (let guard = 0; guard < 600 && !(old.ctl.state.horde.wave === 3 && standing(old, 'bravo').length === 0 && old.ctl.state.horde.queued === 0); guard++) play(old, 0.25, killHostiles);
  play(old, 2, () => {});
  ok(old.ctl.state.horde.wave === 3 && old.ctl.state.horde.nextWaveInS > 0, `the case is built: wave 3 is cleared and the lull runs `
    + `(wave ${old.ctl.state.horde.wave}, next in ${old.ctl.state.horde.nextWaveInS.toFixed(2)} s)`);
  const { fresh } = migrate(old);
  for (const h of [old, fresh]) for (let guard = 0; guard < 800 && h.ctl.state.horde.wave < 6; guard++) play(h, 0.25, killHostiles);
  ok(old.ctl.state.horde.wave === 6 && fresh.ctl.state.horde.wave === 6, `both hosts play on to wave 6 (old ${old.ctl.state.horde.wave}, new ${fresh.ctl.state.horde.wave})`);
  compare('lull', old, fresh, 30);
}

console.log('[2] Endless Horde, migrated mid-wave 4 with its queue trickling in: the trickle and wave 5 match');
{
  const old = host('endless_horde', 37);
  for (let guard = 0; guard < 800 && old.ctl.state.horde.wave < 4; guard++) play(old, 0.25, killHostiles);
  // wave 4 is larger than the field: half the standing fall each step, so the queue trickles in while some stand
  const killHalf = (h) => { const live = standing(h, 'bravo'); for (const z of live.slice(0, Math.ceil(live.length / 2))) { z.combat.destroyed = true; z.combat.hp = 0; } };
  play(old, 1.5, killHalf);
  ok(old.ctl.state.horde.wave === 4 && old.ctl.state.horde.queued > 0, `the case is built: wave 4 is on with ${old.ctl.state.horde.queued} queued`);
  const { fresh } = migrate(old);
  for (const h of [old, fresh]) for (let guard = 0; guard < 800 && h.ctl.state.horde.wave < 5; guard++) play(h, 0.25, killHalf);
  for (const h of [old, fresh]) play(h, 3, killHalf);
  compare('mid-wave', old, fresh, 12);
}

console.log('[3] Frontline, migrated on sector 2: its fall reinforces sector 3 with the same hulls on the same slots');
{
  // the attack stands in the live sector with nothing defending it: the sector falls in captureS, and the line advances
  const takeSector = (h) => {
    const zone = h.ctl.state.zones[Math.min(h.ctl.state.line.index, h.ctl.state.zones.length - 1)];
    for (const e of h.entities) {
      if (e.team === 'alpha' && e.modeActive !== false && !e.combat.destroyed) Object.assign(e.state.pos, { x: zone.x + (e.bot ? 6 : 0), z: zone.z });
    }
    killHostiles(h);
  };
  const old = host('frontline_assault', 11);
  for (let guard = 0; guard < 400 && old.ctl.state.line.index < 1; guard++) play(old, 0.25, takeSector);
  play(old, 2, takeSector);
  ok(old.ctl.state.line.index === 1, `the case is built: sector 1 has fallen, the line stands on sector 2 (index ${old.ctl.state.line.index})`);
  const { fresh } = migrate(old);
  for (const h of [old, fresh]) for (let guard = 0; guard < 400 && h.ctl.state.line.index < 2; guard++) play(h, 0.25, takeSector);
  for (const h of [old, fresh]) play(h, 4, takeSector);
  ok(old.ctl.state.line.index === 2 && fresh.ctl.state.line.index === 2, `both hosts take sector 2 (old ${old.ctl.state.line.index}, new ${fresh.ctl.state.line.index})`);
  compare('frontline', old, fresh, 4);
}

console.log('[4] Mars, migrated after the first cache: the next caches fall where the old host\'s do');
{
  const old = host('mars', 23);
  const rules = matchRulesetFor('mars').mars;
  play(old, rules.cacheFirstS + 1, () => {});
  ok(old.ctl.state.pickups.some((p) => p.active), `the case is built: the first cache is down (${old.ctl.state.pickups.filter((p) => p.active).length} on the field)`);
  const { fresh } = migrate(old);
  for (const h of [old, fresh]) play(h, rules.cacheIntervalS * 3 + 1, () => {});
  compare('mars', old, fresh, 3);
}

console.log('[5] the checkpoint names both streams, and they survive the JSON round trip');
{
  const h = host('endless_horde', 31);
  play(h, 3, killHostiles);
  const checkpoint = h.ctl.captureCheckpoint(h.clock.t);
  ok(Array.isArray(checkpoint.rng) && checkpoint.rng.length === 2 && checkpoint.rng.every(Number.isInteger),
    `the checkpoint carries the draws' and the arrivals' positions as integers (${JSON.stringify(checkpoint.rng)})`);
  const text = JSON.stringify(checkpoint.rng ?? null);
  ok(checkpoint.rng !== undefined && JSON.stringify(JSON.parse(text)) === text, 'they survive the keyframe\'s JSON round trip unchanged');
}

console.log('[6] Endless Horde, migrated mid-wave 8 (a runner wave): every hostile drives at its wave\'s pace on both hosts');
{
  const old = host('endless_horde', 31);
  for (let guard = 0; guard < 2000 && old.ctl.state.horde.wave < 8; guard++) play(old, 0.25, killHostiles);
  play(old, 0.5, () => {});
  const live = standing(old, 'bravo');
  ok(old.ctl.state.horde.wave === 8 && old.ctl.state.horde.special === 'runner' && live.length > 0 && live[0].modeSpeedMultiplier > 1.5,
    `the case is built: runner wave 8 is on, ${live.length} hostiles standing at x${live[0]?.modeSpeedMultiplier.toFixed(3)}`);
  const { fresh } = migrate(old);
  const apart = () => standing(old, 'bravo').map((e) => [e, fresh.byId(e.id)])
    .filter(([e, twin]) => twin.modeActive !== false && !twin.combat.destroyed && !(Math.abs(e.modeSpeedMultiplier - twin.modeSpeedMultiplier) < 1e-12))
    .map(([e, twin]) => `${e.id} ${e.modeSpeedMultiplier.toFixed(3)}/${twin.modeSpeedMultiplier.toFixed(3)}`);
  const atRestore = apart();
  ok(atRestore.length === 0, `right after the restore every standing hostile drives at the old host's pace (apart: ${atRestore.join(', ') || 'none'})`);
  const killHalf = (h) => { const standingNow = standing(h, 'bravo'); for (const z of standingNow.slice(0, Math.ceil(standingNow.length / 2))) { z.combat.destroyed = true; z.combat.hp = 0; } };
  let steps = 0, apartSteps = 0, firstApart = null;
  for (let guard = 0; guard < 2000 && (old.ctl.state.horde.wave < 10 || fresh.ctl.state.horde.wave < 10); guard++) {
    play(old, 0.25, killHalf); play(fresh, 0.25, killHalf); steps++;
    const now = apart();
    if (now.length) { apartSteps++; firstApart ??= `step ${steps}: ${now.join(', ')}`; }
  }
  ok(old.ctl.state.horde.wave === 10 && fresh.ctl.state.horde.wave === 10 && apartSteps === 0, `on together to wave 10 (${steps} steps), the paces never part `
    + `(${apartSteps} steps apart${firstApart ? `; first ${firstApart}` : ''})`);
  compare('runner', old, fresh, 10);
}

if (failures) { console.error(`modeStreamMigration.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('modeStreamMigration.selftest: a migrated host draws its next waves, arrivals, reinforcements and caches as the old host would (Horde, Frontline, Mars)');
