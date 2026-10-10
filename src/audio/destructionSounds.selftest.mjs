// destructionSounds.selftest.mjs — destruction sounds come from the recorded catalog only (the owner's rule), an
// explosive round lands with the HE bank its charge earns, and every structure stage plays recorded layers.
import assert from 'node:assert/strict';
import { DESTRUCTION_SOUND_IDS, blastSoundCaliberMm, munitionExplodes, munitionFromType, structureStageSounds } from './destructionSounds.ts';
import { SFX_ASSETS as SFX_MANIFEST } from './sfxManifest.generated.ts';
import { MUNITION_CLASSES, STRUCTURE_STAGES } from '../sim/destructionEvents.ts';

for (const id of DESTRUCTION_SOUND_IDS) assert.ok(SFX_MANIFEST[id], `${id}: a recorded asset in the manifest`);
for (const stage of STRUCTURE_STAGES) {
  for (const l of structureStageSounds(stage)) assert.ok(SFX_MANIFEST[l.id], `${stage}: ${l.id} is recorded`);
}
assert.equal(structureStageSounds('intact').length, 0, 'intact is silent');
assert.ok(structureStageSounds('collapsed').some((l) => l.id === 'building_collapse'), 'a collapse plays the building coming down');

// the HE bank (audioEngine explosion): >= 140 mm large, >= 61 mm medium, else small
assert.ok(blastSoundCaliberMm(20) >= 140, 'the gunship howitzer (20 kg) plays the large bank');
assert.ok(blastSoundCaliberMm(3.5) >= 61 && blastSoundCaliberMm(3.5) < 140, 'a 125 mm HE shell plays the medium bank');
assert.ok(blastSoundCaliberMm(0.05) < 61, 'a 30 mm HE round plays the small bank');
assert.equal(blastSoundCaliberMm(0), 0, 'no charge, no blast');

for (const m of MUNITION_CLASSES) assert.equal(typeof munitionExplodes(m), 'boolean');
assert.equal(munitionExplodes('small_arms'), false, 'a bullet does not explode');
assert.equal(munitionExplodes('kinetic'), false, 'a rod does not explode');
assert.equal(munitionExplodes('drone_fpv'), true, 'a drone warhead does');
assert.equal(munitionExplodes(null), false);
assert.equal(munitionFromType('AP', 12.7), 'small_arms');
assert.equal(munitionFromType('APFSDS', 120), 'kinetic');
assert.equal(munitionFromType('HE', 30), 'autocannon_he');
assert.equal(munitionFromType('HE', 125), 'he');
assert.equal(munitionFromType(undefined, 125), null);

console.log('destructionSounds selftest: recorded layers, charge-sized HE bank, class mapping — ok');
