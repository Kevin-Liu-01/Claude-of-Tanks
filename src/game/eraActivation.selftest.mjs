import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isEraActivation, stripActivatedEra } from './eraActivation.ts';

assert.equal(isEraActivation({ kind: 'pen', eraPlate: 'glacis_era_L' }), true,
  'ERA activation survives a deeper penetration result');
assert.equal(isEraActivation({ kind: 'era', eraPlate: 'turret_era_R' }), true,
  'absorbing ERA hit is still an activation');
assert.equal(isEraActivation({ kind: 'pen', eraPlate: null }), false,
  'ordinary hit is not an ERA activation');

const stripped = [];
assert.equal(stripActivatedEra(
  { kind: 'nonpen', eraPlate: 'skirt_era_R' },
  { stripEra: (name) => stripped.push(name) },
), true, 'activation depletes a visual cluster');
assert.deepEqual(stripped, ['skirt_era_R'], 'the exact gameplay plate owns visual depletion');
const multiStripped = [];
assert.equal(stripActivatedEra({
  kind: 'pen',
  eraPlate: 'hull_skirt_R',
  eraActivations: [
    { plate: 'turret_cheek_R', pos: [1, 2, 3], normal: [0, 0, 1] },
    { plate: 'hull_skirt_R', pos: [1, 1, 2], normal: [1, 0, 0] },
  ],
}, { stripEra: (name) => multiStripped.push(name) }), true,
'one penetrating shell depletes every reactive layer it activates');
assert.deepEqual(multiStripped, ['turret_cheek_R', 'hull_skirt_R'],
  'multi-layer activation preserves exact plate order without duplicating the legacy field');
assert.equal(stripActivatedEra({ kind: 'pen' }, { stripEra() {} }), false,
  'non-ERA hit leaves the visual untouched');

// Guard the three presentation consumers. ERA is an additive blast: a rod can
// pop a cassette and still penetrate the base armor, so keying solely on
// event.kind silently loses the explosion/audio/removal path.
const fxSource = readFileSync(new URL('../fx/effects.ts', import.meta.url), 'utf8');
const audioSource = readFileSync(new URL('../audio/audio.ts', import.meta.url), 'utf8');
const feedbackSource = readFileSync(new URL('./combatFeedbackRuntime.ts', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(fxSource, /isEraActivation\(e\)[\s\S]{0,180}fx\.impact\('era'/,
  'FX emits an additive ERA blast for pass-through hits');
assert.match(audioSource, /isEraActivation\([^)]*\)[\s\S]{0,180}eraPop\(/,
  'audio emits an additive ERA detonation for pass-through hits');
assert.match(feedbackSource, /stripActivatedEra\(event, target\.visual\)/,
  'live tank visual consumes the activated cassette');
assert.match(mainSource, /createCombatFeedbackRuntime\((?:legacyPort\()?\{/,
  'composition root installs the typed combat-feedback owner');

console.log('eraActivation.selftest: simulation events drive blast, audio, and visual depletion');
