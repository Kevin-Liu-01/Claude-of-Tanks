import assert from 'node:assert/strict';
import {
  NEUTRAL_PICTURE,
  PICTURE_DEFOCUS_GAIN,
  PICTURE_PRESETS,
  PICTURE_SENSOR_MM,
  applyPicturePatch,
  isNeutralPicture,
  pictureCinemaSettings,
  pictureCocAt,
  pictureFocalLengthMm,
  pictureGrainSeed,
  pictureLensState,
  pictureLetterboxBars,
  pictureStateJson,
  pictureWhiteBalance,
  resolvePicture,
  resolvePictureLook,
} from './studioPicture.ts';
import { letterboxBars } from '../engine/cinemaPost.ts';

// Neutral: absent, null and the natural preset are the same identity picture with no state entry.
assert.ok(isNeutralPicture(NEUTRAL_PICTURE));
assert.deepEqual(resolvePicture(undefined), NEUTRAL_PICTURE);
assert.deepEqual(resolvePicture(null), NEUTRAL_PICTURE);
assert.deepEqual(resolvePicture({}), NEUTRAL_PICTURE);
assert.deepEqual(resolvePicture({ preset: 'natural' }), NEUTRAL_PICTURE);
assert.equal(pictureStateJson(NEUTRAL_PICTURE), undefined, 'a neutral picture writes no state key');
const neutralSettings = pictureCinemaSettings(NEUTRAL_PICTURE);
for (const [stage, value] of Object.entries(neutralSettings)) assert.equal(value, null, `neutral ${stage} stage is absent`);
assert.ok(Object.isFrozen(NEUTRAL_PICTURE) && Object.isFrozen(NEUTRAL_PICTURE.dof) && Object.isFrozen(NEUTRAL_PICTURE.lift));

// Looks: 8–12 unique ids, natural first and neutral, every other look distinct and non-neutral.
const ids = PICTURE_PRESETS.map((look) => look.id);
assert.ok(ids.length >= 8 && ids.length <= 12, `look count ${ids.length}`);
assert.equal(new Set(ids).size, ids.length);
assert.equal(ids[0], 'natural');
assert.ok(PICTURE_PRESETS.every((look) => typeof look.label === 'string' && look.label.length > 0));
const signatures = new Set();
for (const id of ids.slice(1)) {
  const look = resolvePictureLook(id);
  assert.equal(look.preset, id);
  assert.ok(!isNeutralPicture(look), `${id} is not neutral`);
  assert.equal(look.letterbox, 'none', `${id}: framing belongs to the shot`);
  assert.equal(look.dof.enabled, false, `${id}: focus belongs to the shot`);
  const { preset: _preset, ...values } = look;
  signatures.add(JSON.stringify(values));
  assert.deepEqual(pictureStateJson(look), { preset: id }, `${id} with no overrides serializes to its id`);
  assert.deepEqual(resolvePicture({ preset: id }), look);
}
assert.equal(signatures.size, ids.length - 1, 'every look is distinct');

// Clamps, wrapping, coercion and strict keys.
const clamped = resolvePicture({
  exposure: 99, temperature: -400, contrast: 0, split: { shadowHue: 370, highlightHue: -30 }, gamma: 2,
  letterbox: 2.39, grain: { size: 0.01 }, dof: { fStop: 0.1, focusActor: 3 },
});
assert.equal(clamped.exposure, 4);
assert.equal(clamped.temperature, -100);
assert.equal(clamped.contrast, 0.5);
assert.equal(clamped.split.shadowHue, 10);
assert.equal(clamped.split.highlightHue, 330);
assert.deepEqual(clamped.gamma, [2, 2, 2], 'a scalar fills all three channels');
assert.equal(clamped.letterbox, '2.39');
assert.equal(clamped.grain.size, 0.5);
assert.equal(clamped.dof.fStop, 0.7);
assert.equal(clamped.dof.focusActor, '3');
assert.equal(clamped.split.shadowAmount, 0, 'unpatched group fields keep their base value');
assert.equal(resolvePicture({ exposure: 0.123456789 }).exposure, 0.1235, '1e-4 quantization');
assert.throws(() => resolvePicture({ preset: 'kodachrome' }), /Unknown picture preset/);
assert.throws(() => resolvePicture({ vignete: { amount: 1 } }), /vignete is not a picture setting/);
assert.throws(() => resolvePicture({ grain: { amout: 1 } }), /grain\.amout is not a picture setting/);
assert.throws(() => resolvePicture({ exposure: Number.NaN }), /finite number/);
assert.throws(() => resolvePicture({ lift: [0, 0] }), /\[r, g, b\]/);
assert.throws(() => resolvePicture({ letterbox: '4:3' }), /unknown value/);
assert.throws(() => resolvePicture({ dof: { enabled: 'yes' } }), /true or false/);
assert.throws(() => resolvePicture({ dof: true }), /must be an object/);

// Patches: overrides merge, `preset` switches the look and drops earlier overrides, null resets.
let p = applyPicturePatch(NEUTRAL_PICTURE, { preset: 'cinematic' });
p = applyPicturePatch(p, { grain: { amount: 0.4 }, letterbox: '2.39' });
assert.equal(p.preset, 'cinematic');
assert.equal(p.grain.amount, 0.4);
assert.equal(p.grain.size, resolvePictureLook('cinematic').grain.size);
assert.equal(p.contrast, resolvePictureLook('cinematic').contrast);
assert.deepEqual(pictureStateJson(p), { preset: 'cinematic', grain: { amount: 0.4 }, letterbox: '2.39' }, 'minimal override diff');
const switched = applyPicturePatch(p, { preset: 'noir', vignette: { amount: 0.5 } });
assert.equal(switched.preset, 'noir');
assert.equal(switched.letterbox, 'none', 'switching looks discards the previous overrides');
assert.equal(switched.vignette.amount, 0.5);
assert.deepEqual(applyPicturePatch(switched, null), NEUTRAL_PICTURE);
assert.ok(Object.isFrozen(p) && Object.isFrozen(p.grain));

// Round trip: load(state()) is identity for every look with assorted overrides.
for (const id of ids) {
  const picture = resolvePicture({
    preset: id, exposure: -0.5, lift: [0.01, 0, -0.02], streaks: { amount: 0.3, tint: [1, 0.5, 0.2] },
    dof: { enabled: true, focusActor: 'hero', fStop: 2, sensor: 'alexa65', anamorphic: 0.6 },
    letterbox: '2.00', sunShafts: { mode: 'on', intensity: 1.5 },
  });
  const json = pictureStateJson(picture);
  assert.deepEqual(JSON.parse(JSON.stringify(json)), json, 'state entry is JSON-safe');
  assert.deepEqual(resolvePicture(json), picture, `${id} round-trips`);
  assert.deepEqual(pictureStateJson(resolvePicture(json)), json, `${id} state is a fixed point`);
}

// Stage gating mirrors the engine settings.
const dofOnly = resolvePicture({ dof: { enabled: true } });
const dofSettings = pictureCinemaSettings(dofOnly);
assert.ok(dofSettings.lens && !dofSettings.hdr && !dofSettings.grade && !dofSettings.finish && !dofSettings.bloom && !dofSettings.lightFx);
assert.ok(isNeutralPicture(resolvePicture({ dof: { enabled: true, bokehScale: 0 } })), 'a zero bokeh scale is no lens');
assert.ok(pictureCinemaSettings(resolvePicture({ letterbox: '1.85' })).finish);
assert.ok(pictureCinemaSettings(resolvePicture({ exposure: 1 })).hdr);
assert.equal(pictureCinemaSettings(resolvePicture({ exposure: 1 })).hdr.exposure, 2, 'one stop doubles linear light');
assert.ok(pictureCinemaSettings(resolvePicture({ bloom: 2 })).bloom);
assert.ok(pictureCinemaSettings(resolvePicture({ lensFlare: { mode: 'on' } })).lightFx);
assert.ok(pictureCinemaSettings(resolvePicture({ saturation: 0.5 })).grade);
const cinematicSettings = pictureCinemaSettings(resolvePictureLook('cinematic'));
assert.ok(cinematicSettings.grade && cinematicSettings.hdr && cinematicSettings.finish);
const noir = pictureCinemaSettings(resolvePictureLook('noir')).grade;
assert.ok(Math.abs(noir.monoMix[0] + noir.monoMix[1] + noir.monoMix[2] - 1) < 1e-9, 'mono mix is normalized');
const split = pictureCinemaSettings(resolvePicture({ split: { shadowAmount: 1, highlightAmount: 1 } })).grade;
for (const tint of [split.shadowTint, split.highlightTint]) {
  assert.ok(Math.abs(0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2]) < 1e-9, 'split toning moves colour, not luma');
}

// Camera physics.
// vertical FOV on the 16:9 extraction height: the 16:9 numbers equal the classic Super 35 width law
assert.ok(Math.abs(pictureFocalLengthMm(10, 'super35') - 80.0) < 0.1);
assert.ok(Math.abs(pictureFocalLengthMm(45, 'super35') - 16.9) < 0.1);
assert.ok(Math.abs(pictureFocalLengthMm(40, 'super35') - (24.89 * 9 / 16 / 2) / Math.tan(20 * Math.PI / 180)) < 1e-9);
assert.ok(pictureFocalLengthMm(30, 'alexa65') > pictureFocalLengthMm(30, 'super35'));
assert.equal(PICTURE_SENSOR_MM.super35, 24.89);
const dof = resolvePicture({ dof: { enabled: true, fStop: 2.8 } }).dof;
const lens = pictureLensState(dof, 12, 25);
assert.equal(lens.focusM, 25);
assert.ok(Math.abs(pictureCocAt(lens, 25)) < 1e-12, 'the focal plane is sharp');
assert.ok(pictureCocAt(lens, 100) > 0 && pictureCocAt(lens, 10) < 0, 'far positive, near negative');
assert.ok(Math.abs(pictureCocAt(lens, 1e9) / lens.cocScale - 1) < 1e-6, 'infinity converges on the scale');
const wide = pictureLensState({ ...dof, fStop: 5.6 }, 12, 25);
assert.ok(Math.abs(wide.cocScale * 2 - lens.cocScale) < 1e-12, 'one f-stop doubling halves the blur');
const large = pictureLensState({ ...dof, sensor: 'alexa65' }, 12, 25);
assert.ok(large.cocScale > lens.cocScale, 'a larger format defocuses more at the same field of view');
const thinLens = (f, N, s, d, sensor) => (f * f) / (N * (s - f)) * Math.abs(d - s) / d / sensor;
const sensorH = 0.02489 * 9 / 16;
assert.ok(Math.abs(pictureCocAt(lens, 100) - PICTURE_DEFOCUS_GAIN * thinLens(lens.focalMm / 1000, 2.8, 25, 100, sensorH)) < 1e-12,
  'thin-lens CoC (fraction of the frame height) × the documented cinematic gain');
const physical = pictureLensState({ ...dof, bokehScale: 1 / PICTURE_DEFOCUS_GAIN }, 12, 25);
assert.ok(Math.abs(pictureCocAt(physical, 100) - thinLens(physical.focalMm / 1000, 2.8, 25, 100, sensorH)) < 1e-12,
  'bokehScale 1/gain is strictly physical Super 35');
// The owner's calibration frame: f/2.8, 40° vertical, hero 12 m — background visibly soft (radius ≥ 4 px at 1080 lines).
const brief = pictureLensState(dof, 40, 12);
assert.ok(pictureCocAt(brief, 80) * 1080 / 2 >= 4, 'f/2.8 on a 40° frame softens an 80 m background');
assert.ok(pictureCocAt(pictureLensState({ ...dof, fStop: 11 }, 40, 12), 80) * 1080 / 2 < 2, 'f/11 stays near-sharp');
assert.ok(pictureLensState(dof, 12, 0.001).focusM > lens.focalMm / 1000, 'focus never inside the focal length');

// Letterbox mattes in whole pixels, shared with the engine.
assert.deepEqual(pictureLetterboxBars('2.39', 1920, 1080), { x: 0, y: 138 });
assert.deepEqual(pictureLetterboxBars('2.00', 3840, 2160), { x: 0, y: 120 });
assert.deepEqual(pictureLetterboxBars('none', 1920, 1080), { x: 0, y: 0 });
assert.deepEqual(pictureLetterboxBars('1.85', 1080, 1920), { x: 0, y: 668 });
assert.deepEqual(pictureLetterboxBars('2.00', 2000, 1000), { x: 0, y: 0 });
assert.deepEqual(pictureLetterboxBars('1.85', 3000, 1000), { x: 575, y: 0 }, 'pillarbox when the target is narrower');
for (const [box, aspect] of [['2.39', 2.39], ['2.00', 2], ['1.85', 1.85]]) {
  for (const [w, h] of [[1920, 1080], [3840, 2160], [1080, 1920], [2048, 2048], [3000, 1000]]) {
    assert.deepEqual(pictureLetterboxBars(box, w, h), letterboxBars(aspect, w, h), `engine matte ${box} ${w}x${h}`);
  }
}

// White balance: identity at zero, warm/cool/magenta directions, grey luminance preserved.
const apply = (m, c) => [0, 1, 2].map((r) => m[r * 3] * c[0] + m[r * 3 + 1] * c[1] + m[r * 3 + 2] * c[2]);
pictureWhiteBalance(0, 0).forEach((v, i) => assert.ok(Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-4));
const warm = apply(pictureWhiteBalance(40, 0), [0.5, 0.5, 0.5]);
const cool = apply(pictureWhiteBalance(-40, 0), [0.5, 0.5, 0.5]);
const magenta = apply(pictureWhiteBalance(0, 40), [0.5, 0.5, 0.5]);
assert.ok(warm[0] > warm[1] && warm[1] > warm[2], '+temperature warms');
assert.ok(cool[2] > cool[1] && cool[1] > cool[0], '-temperature cools');
assert.ok(magenta[1] < magenta[0] && magenta[1] < magenta[2], '+tint pulls toward magenta');
for (const c of [warm, cool, magenta]) assert.ok(Math.abs(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] - 0.5) < 1e-9, 'grey luminance kept');

// Grain seeds come from the Studio clock and scene seed only.
assert.equal(pictureGrainSeed(5000, 620), pictureGrainSeed(5000, 620));
assert.notEqual(pictureGrainSeed(5000, 620), pictureGrainSeed(5000, 637));
assert.notEqual(pictureGrainSeed(5000, 620), pictureGrainSeed(5001, 620));
assert.ok(Number.isInteger(pictureGrainSeed(9218, 1e6)) && pictureGrainSeed(9218, 1e6) >= 0);

console.log(`studioPicture.selftest: ${ids.length} looks, neutral identity, clamps, round trip, lens physics, mattes, white balance and grain seeds pass`);
