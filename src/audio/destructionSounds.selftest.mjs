// destructionSounds.selftest.mjs — destruction sounds come from the recorded catalog only (the owner's rule), an
// explosive round lands with the HE bank its charge earns, and every structure stage plays recorded layers.
import assert from 'node:assert/strict';
import {
  DESTRUCTION_SOUND_IDS, STRUCTURE_SOUND_MATERIALS, blastSoundCaliberMm, munitionExplodes, munitionFromType, sectionFallSounds,
  structureHitAsset, structureSoundOf, structureStageSounds,
} from './destructionSounds.ts';
import { SFX_ASSETS as SFX_MANIFEST } from './sfxManifest.generated.ts';
import { MUNITION_CLASSES, STRUCTURE_STAGES } from '../sim/destructionEvents.ts';

for (const id of DESTRUCTION_SOUND_IDS) assert.ok(SFX_MANIFEST[id], `${id}: a recorded asset in the manifest`);
// every stage, section fall and wall strike of every wall material is a recording the battle set pins
for (const material of STRUCTURE_SOUND_MATERIALS) {
  const sound = { material, glassy: true };
  for (const stage of STRUCTURE_STAGES) {
    for (const l of structureStageSounds(stage, sound)) {
      assert.ok(SFX_MANIFEST[l.id], `${material} ${stage}: ${l.id} is recorded`);
      assert.ok(DESTRUCTION_SOUND_IDS.includes(l.id), `${l.id} is in the battle set`);
    }
  }
  for (const kind of ['wall', 'roof']) for (const storey of [false, true]) {
    for (const l of sectionFallSounds(kind, storey, sound)) assert.ok(SFX_MANIFEST[l.id] && DESTRUCTION_SOUND_IDS.includes(l.id), `${material} ${kind} fall: ${l.id}`);
  }
  assert.ok(SFX_MANIFEST[structureHitAsset(sound)] && DESTRUCTION_SOUND_IDS.includes(structureHitAsset(sound)), `${material}: a round through the wall`);
  assert.ok(structureStageSounds('collapsed', sound)[0].id === `collapse_${material}`, `a ${material} building comes down as ${material}`);
  assert.ok(structureStageSounds('breached', sound)[0].id === `wall_break_${material}`, `a ${material} wall gives way as ${material}`);
}
assert.equal(structureStageSounds('intact').length, 0, 'intact is silent');

// the material is the anatomy's largest wall share; roofing and glass are no walls; no anatomy: by mass class
const anatomy = (pairs) => pairs.map(([material, share]) => ({ material, share }));
assert.equal(structureSoundOf(anatomy([['plaster', 0.25], ['brick', 0.45], ['tile', 0.15], ['timber', 0.15]])).material, 'brick');
assert.equal(structureSoundOf(anatomy([['adobe', 0.85], ['earth', 0.15]])).material, 'plaster', 'an adobe house is earth and render');
assert.equal(structureSoundOf(anatomy([['plank', 0.6], ['timber', 0.4]])).material, 'timber');
assert.equal(structureSoundOf(anatomy([['metal', 0.7], ['glass', 0.1], ['plank', 0.2]])).material, 'steel');
assert.equal(structureSoundOf(anatomy([['metal', 0.7], ['glass', 0.1], ['plank', 0.2]])).glassy, true, 'an office of glass throws a cascade');
assert.equal(structureSoundOf(anatomy([['stone', 0.4], ['rubble', 0.3], ['slate', 0.5]])).material, 'stone', 'a slate roof is no wall');
assert.equal(structureSoundOf(anatomy([['concrete', 0.9]])).material, 'concrete');
assert.equal(structureSoundOf(null, 'shed').material, 'timber', 'an unknown shed is timber');
assert.equal(structureSoundOf(null, 'house').material, 'brick');
assert.deepEqual(sectionFallSounds('roof', false, { material: 'brick', glassy: false }).map((l) => l.id), ['roof_fall'], 'a roof caves in');
assert.equal(sectionFallSounds('wall', true, { material: 'stone', glassy: false })[0].id, 'floor_fall', 'a storey drops');
assert.equal(structureHitAsset({ material: 'plaster', glassy: false }), 'shell_hit_adobe');

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
