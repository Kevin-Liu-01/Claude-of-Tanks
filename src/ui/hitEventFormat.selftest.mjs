import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { penAtDistanceMm } from '../sim/ballistics.ts';
import { getSpec } from '../vehicles/specs.ts';
import {
  hitOutcomeFor, incomingHitFeedbackFor, nominalPenFor, shellDisplayName, zoneLabel,
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
  [{ kind: 'pen', damage: 0, crewHit: ['commander'] }, 'module_hit', 'MODULE HIT', false, false],
  [{ kind: 'he_splash', damage: 0, modulesHit: [{ newState: 'yellow' }] }, 'module_hit', 'MODULE HIT', false, false],
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

const incomingCases = [
  [{ kind: 'pen', damage: 417 }, 'pen', 'penetration', '-417', '#ff8a72', true, false, 'damage:pen'],
  [{ kind: 'he_pen', damage: 510 }, 'pen', 'penetration', '-510', '#ff8a72', true, false, 'damage:pen'],
  [{ kind: 'he_splash', damage: 83.7 }, 'he', 'splash', '-84', '#ffd166', true, false, 'damage:he'],
  [{ kind: 'ricochet', damage: 0 }, 'bounce', 'ricochet', 'RICOCHET', '#bcc8d2', false, false, 'outcome:ricochet'],
  [{ kind: 'nonpen', damage: 0 }, 'bounce', 'blocked', 'BLOCKED', '#8fa3b4', false, false, 'outcome:blocked'],
  [{ kind: 'era', damage: 0 }, 'bounce', 'era_absorbed', 'ERA ABSORBED', '#9fabb5', false, false, 'outcome:era_absorbed'],
  [{ kind: 'spaced_absorb', damage: 0 }, 'bounce', 'spaced_absorbed', 'SPACED ABSORBED', '#9fabb5', false, false, 'outcome:spaced_absorbed'],
  [{ kind: 'screen_pierce', damage: 0 }, 'bounce', 'passed_through', 'PASSED THROUGH', '#9fb0bf', false, false, 'outcome:passed_through'],
  [{ kind: 'he_splash', damage: 0 }, 'he', 'no_damage', 'NO DAMAGE', '#8fa3b4', false, false, 'outcome:no_damage'],
  [{ kind: 'pen', damage: 0, modulesHit: [{ newState: 'yellow' }] }, 'pen', 'module_hit', 'MODULE HIT', '#f0b04a', false, true, 'outcome:module_hit'],
  [{ kind: 'pen', damage: 122, crewHit: ['loader'] }, 'pen', 'penetration', '-122', '#ff8a72', true, true, 'damage:pen'],
  [{ kind: 'nonpen', damage: Number.NaN }, 'bounce', 'blocked', 'BLOCKED', '#8fa3b4', false, false, 'outcome:blocked'],
  [{ kind: 'nonpen', damage: -50 }, 'bounce', 'blocked', 'BLOCKED', '#8fa3b4', false, false, 'outcome:blocked'],
];
for (const [event, kind, outcomeId, label, color, numeric, critical, mergeKey] of incomingCases) {
  const feedback = incomingHitFeedbackFor(event);
  assert.deepEqual(
    { ...feedback },
    { kind, outcomeId, label, color, numeric, critical, mergeKey },
    `${event.kind} must retain its canonical incoming-hit presentation`,
  );
}

const killcamSource = await readFile(new URL('../game/killcam.ts', import.meta.url), 'utf8');
assert.match(killcamSource, /function addXrayEntryPlateLabel[\s\S]*const outcome = hitOutcomeFor\(event\)/,
  'kill-cam annotations must consume the canonical hit outcome');
assert.doesNotMatch(killcamSource, /KIND_WORD|STOPPED BY ERA|NO PENETRATION/,
  'kill cam must not retain a second result vocabulary');

console.log('hitEventFormat.selftest: ok');
