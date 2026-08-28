import assert from 'node:assert/strict';

import { penAtDistanceMm } from '../sim/ballistics.ts';
import { getSpec } from '../vehicles/specs.js';
import { nominalPenFor, shellDisplayName, zoneLabel } from './hitEventFormat.ts';

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

console.log('hitEventFormat.selftest: ok');
