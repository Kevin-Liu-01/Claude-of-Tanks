import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { penAtDistanceMm } from '../sim/ballistics.ts';
import { getSpec } from '../vehicles/specs.ts';
import {
  hitOutcomeFor, nominalPenFor, shellDisplayName, zoneLabel,
} from './hitEventFormat.ts';

assert.equal(zoneLabel('turret_cheek_R'), 'turret cheek R');
assert.equal(zoneLabel('turretRing'), 'turret ring');
assert.equal(zoneLabel(), '—');

assert.equal(shellDisplayName({ shellName: 'M829A4 APFSDS', shellType: 'APFSDS' }), 'M829A4');
assert.equal(shellDisplayName({ shellName: 'APFSDS', shellType: 'APFSDS' }), '');
assert.equal(shellDisplayName({ shellName: 'DM53', shellType: 'APFSDS' }), 'DM53');
assert.equal(shellDisplayName({ shellName: null, shellType: null }), '');

const spec = getSpec('m1a2');
const shell = spec.gun.shells[0];
const flightDistM = 700;
assert.equal(nominalPenFor({
  attackerSpecId: spec.id,
  shellName: shell.name,
  shellType: shell.type,
  flightDistM,
}), Math.round(penAtDistanceMm(shell, flightDistM)));
assert.equal(nominalPenFor({ attackerSpecId: 'missing', shellType: 'AP' }), 0);

const outcomeCases = [
  [{ kind: 'pen', damage: 420 }, 'penetration', 'PENETRATION', true, false],
  [{ kind: 'he_pen', damage: 510 }, 'penetration', 'PENETRATION', true, false],
  [{ kind: 'ricochet', damage: 0 }, 'ricochet', 'RICOCHET', false, true],
  [{ kind: 'nonpen', damage: 0 }, 'blocked', 'BLOCKED', false, true],
  [{ kind: 'era', damage: 0 }, 'era_absorbed', 'ERA ABSORBED', false, true],
  [{ kind: 'spaced_absorb', damage: 0 }, 'spaced_absorbed', 'SPACED ABSORBED', false, true],
  [{ kind: 'screen_pierce', damage: 0 }, 'passed_through', 'PASSED THROUGH', false, false],
  [{ kind: 'he_splash', damage: 80 }, 'splash', 'SPLASH', false, false],
  [{ kind: 'he_splash', damage: 0 }, 'no_damage', 'NO DAMAGE', false, false],
  [{ kind: 'nonpen', damage: 0, modulesHit: [{}] }, 'module_hit', 'MODULE HIT', false, false],
];
for (const [event, id, label, penetrated, blocked] of outcomeCases) {
  const outcome = hitOutcomeFor(event);
  assert.equal(outcome.id, id);
  assert.equal(outcome.label, label);
  assert.equal(outcome.penetrated, penetrated);
  assert.equal(outcome.blocked, blocked);
  assert.match(outcome.color, /^#[0-9a-f]{6}$/i);
  assert.ok(['damage', 'penetration', 'shield'].includes(outcome.icon));
}

const killcamSource = await readFile(new URL('../game/killcam.ts', import.meta.url), 'utf8');
assert.match(killcamSource, /const outcome = hitOutcomeFor\(ev\)/,
  'kill-cam annotations must consume the canonical hit outcome');
assert.doesNotMatch(killcamSource, /KIND_WORD|STOPPED BY ERA|NO PENETRATION/,
  'kill cam must not retain a second result vocabulary');

console.log('hitEventFormat.selftest: ok');
