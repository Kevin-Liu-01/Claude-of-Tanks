import assert from 'node:assert/strict';
import { SFX_FILES, mulberry32 } from '../audio/audioPolicy.ts';
import { filmSoundVoice, filmTravelDelayS } from './studioFilmAudio.ts';

const cue = (kind, extra = {}) => ({ timelineMs: 1000, kind, x: 0, y: 0, z: 0, caliberMm: 120, ...extra });
const names = (voice) => voice.layers.map((layer) => layer.name);

// Every layer the film mixer can schedule is a baked file the game ships.
for (const kind of ['cannon', 'pen', 'nonpen', 'ricochet', 'era', 'he', 'dirt', 'tank']) {
  for (const cause of ['ammorack', 'shot', 'fire']) {
    for (const caliberMm of [30, 90, 120, 140]) {
      const voice = filmSoundVoice(cue(kind, { cause, caliberMm }), 20, mulberry32(7));
      assert.ok(voice, `${kind} is audible at 20 m`);
      for (const name of names(voice)) assert.ok(SFX_FILES[name], `${name} is a baked SFX file`);
    }
  }
}
// Gun reports: caliber picks the class; the crack fades with distance; the tail always rides.
assert.deepEqual(names(filmSoundVoice(cue('cannon', { caliberMm: 120 }), 10, mulberry32(1))), ['fire_large_sub', 'fire_large_crack', 'fire_large_tail']);
assert.deepEqual(names(filmSoundVoice(cue('cannon', { caliberMm: 140 }), 10, mulberry32(1))), ['fire_huge_sub', 'fire_huge_crack', 'fire_huge_tail']);
assert.deepEqual(names(filmSoundVoice(cue('cannon', { caliberMm: 30 }), 10, mulberry32(1))), ['fire_small_sub', 'fire_small_crack', 'fire_small_tail']);
assert.deepEqual(names(filmSoundVoice(cue('cannon'), 400, mulberry32(1))), ['fire_large_sub', 'fire_large_tail'], 'distant guns lose their crack');
// Ammo-rack kills carry the turret-pop accent; burn-outs use the burnout bed.
assert.ok(names(filmSoundVoice(cue('tank', { cause: 'ammorack' }), 30, mulberry32(2))).includes('expl_turret_pop'));
assert.ok(!names(filmSoundVoice(cue('tank', { cause: 'shot' }), 30, mulberry32(2))).includes('expl_turret_pop'));
assert.equal(names(filmSoundVoice(cue('tank', { cause: 'fire' }), 30, mulberry32(2)))[0], 'expl_burnout');
// Quieter with distance, silent far away, deterministic per seed.
const near = filmSoundVoice(cue('pen'), 10, mulberry32(3)), far = filmSoundVoice(cue('pen'), 200, mulberry32(3));
assert.ok(near.gain > far.gain);
assert.equal(filmSoundVoice(cue('dirt'), 5000, mulberry32(3)), null, 'inaudible at 5 km');
assert.deepEqual(filmSoundVoice(cue('he'), 60, mulberry32(9)), filmSoundVoice(cue('he'), 60, mulberry32(9)));
// Speed of sound: none inside 40 m, capped at 1.6 s.
assert.equal(filmTravelDelayS(30), 0);
assert.ok(Math.abs(filmTravelDelayS(340) - 1) < 1e-12);
assert.equal(filmTravelDelayS(5000), 1.6);
console.log('studioFilmAudio.selftest: baked layer recipes, distance law, travel delay and determinism passed');
