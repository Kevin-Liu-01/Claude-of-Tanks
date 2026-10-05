import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mulberry32 } from '../audio/audioMath.ts';
import { SFX_ASSETS } from '../audio/sfxManifest.generated.ts';
import { WEAPON_CLASSES, weaponClassForCaliber } from '../audio/weaponAudio.ts';
import { MAP_SCENES } from '../audio/environmentScenes.ts';
import { FILM_SFX, FILM_TAILS, FILM_WEAPONS, filmSoundVoice, filmTravelDelayS, filmWeaponClass } from './studioFilmAudio.ts';

const cue = (kind, extra = {}) => ({ timelineMs: 1000, kind, x: 0, y: 0, z: 0, caliberMm: 120, ...extra });
const names = (voice) => voice.layers.map((layer) => layer.name);

// 1. The film plays the game's recorded library by copies of the engine's data (a Studio import of the audio chunk's
//    modules would split them into a request of their own): each copy holds to its source.
for (const [id, [group, variants]] of Object.entries(FILM_SFX)) {
  const record = SFX_ASSETS[id];
  assert.ok(record, `${id} is a shipped recording`);
  assert.equal(group, record.g, `${id} lives in ${record.g}`);
  assert.equal(variants, record.n, `${id} has ${record.n} variants`);
  for (let k = 0; k < variants; k++) {
    assert.ok(existsSync(new URL(`../../public/audio/sfx/${group}/${id}_${k}.webm`, import.meta.url)), `${id}_${k}.webm ships`);
  }
}
for (let mm = 5; mm <= 220; mm += 0.5) assert.equal(filmWeaponClass(mm), weaponClassForCaliber(mm), `${mm} mm reads as the engine's class`);
const engine = readFileSync(new URL('../audio/audioEngine.ts', import.meta.url), 'utf8');
for (const [id, weapon] of Object.entries(FILM_WEAPONS)) {
  const source = WEAPON_CLASSES[id];
  assert.deepEqual([weapon.family, weapon.closeFadeM, weapon.farFadeM, weapon.tailRate, weapon.tailGain],
    [source.family, source.closeFadeM, source.farFadeM, source.tailRate, source.tailGain], `${id} as weaponAudio.ts`);
  assert.match(engine, new RegExp(`\\b${id}: '${weapon.close}'`), `${id}'s close bank as audioEngine.ts`);
  assert.match(engine, new RegExp(`\\b${id}: '${weapon.far}'`), `${id}'s distant bank as audioEngine.ts`);
  assert.ok(FILM_SFX[weapon.close] && FILM_SFX[weapon.far], `${id}'s banks are listed`);
}
assert.match(engine, /BLAST_DB[^=]*= Object\.freeze\(\{ cannon: -6, autocannon: -16, mg: -19 \}\)/, 'the punch levels as audioEngine.ts');
for (const [map, scene] of Object.entries(MAP_SCENES)) assert.equal(FILM_TAILS[map] ?? 'open', scene.tail, `${map}'s echo`);

// 2. Every kind and cause yields recorded layers, each a listed recording and one of its variants.
for (const kind of ['cannon', 'pen', 'nonpen', 'ricochet', 'era', 'he', 'dirt', 'tank']) {
  for (const cause of ['ammorack', 'shot', 'fire']) {
    for (const caliberMm of [12.7, 30, 90, 120, 140]) {
      const voice = filmSoundVoice(cue(kind, { cause, caliberMm }), 20, mulberry32(7));
      assert.ok(voice && voice.layers.length > 0, `${kind} is audible at 20 m`);
      for (const layer of voice.layers) assert.ok(FILM_SFX[layer.name] && layer.variant < FILM_SFX[layer.name][1], `${layer.name}_${layer.variant}`);
    }
  }
}
// Gun reports as the engine layers them: the punch, the close report and the echo near; the boom and echo far away.
assert.deepEqual(names(filmSoundVoice(cue('cannon'), 20, mulberry32(1))), ['blast_punch_heavy', 'gun_120_close', 'tail_open']);
assert.deepEqual(names(filmSoundVoice(cue('cannon', { caliberMm: 125 }), 20, mulberry32(1), 'urban')), ['blast_punch_heavy', 'gun_125_close', 'tail_urban']);
assert.deepEqual(names(filmSoundVoice(cue('cannon', { caliberMm: 30 }), 20, mulberry32(1))), ['blast_punch_medium', 'ac_30_close', 'tail_open']);
assert.deepEqual(names(filmSoundVoice(cue('cannon', { caliberMm: 12.7 }), 20, mulberry32(1))), ['blast_punch_light', 'mg_heavy_close', 'tail_open']);
assert.deepEqual(names(filmSoundVoice(cue('cannon'), 600, mulberry32(1))), ['gun_far_medium', 'tail_open'], 'a distant gun is its boom and echo');
const mid = names(filmSoundVoice(cue('cannon'), 250, mulberry32(1)));
assert.ok(mid.includes('gun_120_close') && mid.includes('gun_far_medium'), 'between the fades both banks play');
assert.deepEqual(names(filmSoundVoice(cue('cannon'), 20, mulberry32(1), 'none')), ['blast_punch_heavy', 'gun_120_close'], 'no echo on the Moon');
assert.equal(filmSoundVoice(cue('cannon'), 20, mulberry32(1)).layers[0].maxDurS, 0.5, 'the punch is cut short');
assert.ok(filmSoundVoice(cue('cannon'), 2000, mulberry32(3)), 'a gun carries 2 km');
// Kills: an ammunition fire throws the turret; a burn-out is its own blast.
assert.ok(names(filmSoundVoice(cue('tank', { cause: 'ammorack' }), 30, mulberry32(2))).includes('turret_land'));
assert.ok(!names(filmSoundVoice(cue('tank', { cause: 'shot' }), 30, mulberry32(2))).includes('turret_land'));
assert.equal(names(filmSoundVoice(cue('tank', { cause: 'fire' }), 30, mulberry32(2)))[0], 'burnout_blast');
// Quieter with distance, silent far away, deterministic per seed.
const near = filmSoundVoice(cue('pen'), 10, mulberry32(3)), far = filmSoundVoice(cue('pen'), 200, mulberry32(3));
assert.ok(near.gain > far.gain);
assert.equal(filmSoundVoice(cue('dirt'), 5000, mulberry32(3)), null, 'inaudible at 5 km');
assert.deepEqual(filmSoundVoice(cue('he'), 60, mulberry32(9)), filmSoundVoice(cue('he'), 60, mulberry32(9)));
// Speed of sound: none inside 40 m, capped at 1.6 s.
assert.equal(filmTravelDelayS(30), 0);
assert.ok(Math.abs(filmTravelDelayS(340) - 1) < 1e-12);
assert.equal(filmTravelDelayS(5000), 1.6);

// 3. Nothing synthesized, and no runtime import from the game's audio modules.
const source = readFileSync(new URL('./studioFilmAudio.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /createOscillator|createPeriodicWave/, 'nothing synthesized');
assert.doesNotMatch(source, /^import (?!type )[^;]*from '\.\.\/audio\//m, 'no runtime import from the audio chunk');
console.log('studioFilmAudio.selftest: recorded layers as the engine plays them, copies held to the manifest, weapon classes and echoes; '
  + 'distance law, travel delay and determinism passed');
