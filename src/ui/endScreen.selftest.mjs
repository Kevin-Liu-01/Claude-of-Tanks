import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { damageComparisonPercent, rosterRowDetails, summarizeTeam } from './endScreen.ts';

// battle endings (2026-09-25): the hero names the final blow from the ledger's resolved events (finalBlow.ts,
// receipted on its own) and the Horde wave the last stand fell on
{
  const source = readFileSync(new URL('./endScreen.ts', import.meta.url), 'utf8');
  assert.match(source, /import \{ finalBlowLine, type FinalBlow \} from '\.\/finalBlow\.ts';/, 'the hero line comes from finalBlow.ts');
  assert.match(source, /finalBlow\?: FinalBlow \| null;/, 'the summary carries the final blow');
  assert.match(source, /hordeWave\?: number \| null;/, 'the summary carries the horde wave');
  assert.match(source, /if \(sum\.finalBlow\) \{\n\s*const blow = el\('div', 'es-blow es-in', hero\);[\s\S]*?finalBlowLine\(sum\.finalBlow\)/,
    'the final blow renders under the verdict line');
  assert.match(source, /host\.dataset\.finalBlow = /, 'the rendered final blow is probe-visible');
  assert.match(source, /t\('endScreen\.horde\.wave', \{ wave: /, 'the horde milestone rides the meta strip');
}

const summary = summarizeTeam([
  { dead: false, kills: 2, dmg: 1_480 },
  { dead: true, kills: 1, dmg: 720 },
  { dead: false, kills: 0, dmg: 0 },
]);

assert.deepEqual(summary, {
  total: 3,
  alive: 2,
  kills: 3,
  damage: 2_200,
});

assert.deepEqual(summarizeTeam([]), {
  total: 0,
  alive: 0,
  kills: 0,
  damage: 0,
});

assert.deepEqual(summarizeTeam([
  { dead: true, kills: -3, dmg: Number.NaN },
]), {
  total: 1,
  alive: 0,
  kills: 0,
  damage: 0,
});

assert.equal(damageComparisonPercent(2_200, 2_200), 100);
assert.equal(damageComparisonPercent(1_100, 2_200), 50);
assert.equal(damageComparisonPercent(-10, 2_200), 0);
assert.equal(damageComparisonPercent(500, 0), 0);
assert.equal(damageComparisonPercent(Number.NaN, 2_200), 0);

// owner 2026-09-21 ("in respawn modes youre registered as dead even if you respawned at end"): death counts are
// a detail line in reviving modes only, and `dead` alone drives the alive count
assert.deepEqual(rosterRowDetails({ kills: 0, deaths: 0 }, true), []);
assert.deepEqual(rosterRowDetails({ kills: 1, deaths: 1 }, true), ['1 kill', '1 death']);
assert.deepEqual(rosterRowDetails({ kills: 3, deaths: 2 }, true), ['3 kills', '2 deaths']);
assert.deepEqual(rosterRowDetails({ kills: 3, deaths: 2 }, false), ['3 kills'],
  'a non-reviving battle shows no death line');
assert.deepEqual(rosterRowDetails({ kills: 0, deaths: Number.NaN }, true), []);
assert.deepEqual(rosterRowDetails({ kills: 0 }, true), [], 'a row without a count carries no death line');
assert.deepEqual(summarizeTeam([
  { dead: false, deaths: 2, kills: 0, dmg: 0 },
  { dead: true, deaths: 1, kills: 0, dmg: 0 },
]), { total: 2, alive: 1, kills: 0, damage: 0 }, 'a revived vehicle with deaths counts as alive');

console.log('endScreen.selftest: team summary, damage comparison and reviving-mode death lines PASS');
