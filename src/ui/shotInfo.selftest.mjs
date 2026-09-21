// Battle-report ledger (owner 2026-09-21: "in respawn modes youre registered as dead even if you respawned at
// end, and your first death si always categorized as that death"): `dead` is a combatant's STATE at the end
// and `deaths` the COUNT. A mode:respawn edge clears the state and keeps the count; the ended payload's roster
// `alive` is authoritative in a reviving mode; a non-reviving battle keeps the event ledger exactly as before.
import assert from 'node:assert/strict';
import {
  recordCombatantDestroyed, recordCombatantRevived, rulesetRevives, mergeEndRosterRow,
} from './shotInfo.ts';
import { summarizeTeam, rosterRowDetails } from './endScreen.ts';

const ledgerRow = (id, extra = {}) => ({
  id, name: null, specId: null, dmg: 0, kills: 0, deaths: 0, dead: false, side: null, isPlayer: false, ...extra,
});

// the mode contract the report reads
assert.deepEqual(
  ['standard', 'capture_the_flag', 'zone_control', 'turbo_ball', 'endless_horde', 'frontline_assault', 'mars']
    .filter((mode) => rulesetRevives(mode)),
  ['capture_the_flag', 'zone_control', 'turbo_ball', 'mars'],
  'exactly the respawning rulesets revive',
);
assert.equal(rulesetRevives(null), false);
assert.equal(rulesetRevives(undefined), false);
assert.equal(rulesetRevives('bogus'), false, 'an unknown mode reads as Standard: no revive');

// respawn mode, died once, revived, alive at the end -> survived, deaths = 1, counted alive by the team row
{
  const me = { dead: false, deaths: 0 };
  recordCombatantDestroyed(me);
  assert.deepEqual(me, { dead: true, deaths: 1 }, 'a destruction is the state and the count');
  recordCombatantRevived(me);
  assert.deepEqual(me, { dead: false, deaths: 1 }, 'the revive clears the state and keeps the count');
  const rows = new Map([
    ['p1', ledgerRow('p1', { deaths: me.deaths, dead: me.dead, isPlayer: true })],
    ['e1', ledgerRow('e1', { dmg: 300, kills: 1 })],
  ]);
  mergeEndRosterRow(rows, { id: 'p1', team: 'player', alive: true, isPlayer: true, specId: 't90m_x', vehicle: 'T-90M' }, true);
  mergeEndRosterRow(rows, { id: 'e1', team: 'enemy', alive: false }, true);
  const p1 = rows.get('p1');
  assert.equal(p1.dead, false, 'alive at the end -> survived');
  assert.equal(p1.deaths, 1, 'the death stays a stat');
  assert.equal(p1.side, 'ally');
  assert.equal(p1.name, 'T-90M');
  assert.equal(p1.specId, 't90m_x');
  assert.equal(rows.get('e1').dead, true, 'a roster row that fell stays destroyed');
  assert.deepEqual(summarizeTeam([p1]), { total: 1, alive: 1, kills: 0, damage: 0 },
    'the team count reads a revived vehicle as alive');
  assert.deepEqual(rosterRowDetails(p1, true), ['1 death']);
}

// respawn mode, the sticky-flag regression: the ledger saw the death, missed the revive edge, the roster says alive
{
  const rows = new Map([['p1', ledgerRow('p1', { deaths: 1, dead: true })]]);
  mergeEndRosterRow(rows, { id: 'p1', alive: true }, true);
  assert.equal(rows.get('p1').dead, false, 'the ended roster is authoritative about who stands in a reviving mode');
  assert.equal(rows.get('p1').deaths, 1);
}

// respawn mode, died twice, dead at the end -> destroyed, deaths = 2
{
  const me = { dead: false, deaths: 0 };
  recordCombatantDestroyed(me);
  recordCombatantRevived(me);
  recordCombatantDestroyed(me);
  assert.deepEqual(me, { dead: true, deaths: 2 });
  const rows = new Map([['p1', ledgerRow('p1', me)]]);
  mergeEndRosterRow(rows, { id: 'p1', alive: false }, true);
  assert.equal(rows.get('p1').dead, true, 'dead at the end -> destroyed');
  assert.deepEqual(rosterRowDetails(rows.get('p1'), true), ['2 deaths']);
  assert.deepEqual(summarizeTeam([rows.get('p1')]), { total: 1, alive: 0, kills: 0, damage: 0 });
}

// standard mode, byte for byte: a death stays a death, `alive: true` never clears it, no death line
{
  const rows = new Map([['p1', ledgerRow('p1', { deaths: 1, dead: true })], ['a1', ledgerRow('a1')]]);
  mergeEndRosterRow(rows, { id: 'p1', alive: true }, false);
  mergeEndRosterRow(rows, { id: 'a1', alive: false, team: 'enemy' }, false);
  mergeEndRosterRow(rows, { id: 'n1', alive: true, team: 'player', name: 'Leopard' }, false);
  assert.equal(rows.get('p1').dead, true, 'a non-reviving battle keeps the event ledger');
  assert.equal(rows.get('a1').dead, true);
  assert.equal(rows.get('a1').side, 'enemy');
  assert.deepEqual(rows.get('n1'), ledgerRow('n1', { name: 'Leopard', side: 'ally' }),
    'a roster-only row starts alive with zero deaths');
  assert.deepEqual(rosterRowDetails({ kills: 2, deaths: 1 }, false), ['2 kills'], 'no death line outside reviving modes');
}

console.log('shotInfo.selftest: respawn ledger — a revive clears dead and keeps deaths, the ended roster is authoritative in reviving modes, standard unchanged');
