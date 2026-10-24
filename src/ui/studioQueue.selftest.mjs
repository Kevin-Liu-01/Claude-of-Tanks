// studioQueue.selftest.mjs — the render queue's presets, estimates and file names (studioQueue.ts; brand-ui SPEC 12.6).
import assert from 'node:assert/strict';
import { QUEUE_PRESETS, queueEstimate, queueFileName, recordRenderRate, stillSize } from './studioQueue.ts';
import { filmOutputSize } from '../game/studioFilmPlan.ts';
import { defaultFilmBitrate } from '../game/studioFilmExport.ts';

const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
const preset = (id) => QUEUE_PRESETS.find((entry) => entry.id === id);

// The deliveries: three films and two still kinds, each a known id.
assert.deepEqual(QUEUE_PRESETS.map((entry) => entry.id), ['film-1080', 'film-1440-60', 'film-2160', 'stills-shots', 'still-now']);

// A film's size is the encoder's own bitrate rule over the take, plus the soundtrack.
const film = queueEstimate(preset('film-1080'), 'landscape', 8000, 1, 6);
const { width, height } = filmOutputSize('landscape', 1080);
assert.equal(Math.round(film.bytes), Math.round(((defaultFilmBitrate(width, height, 30) + 128_000) * 8) / 8), 'size from the bitrate rule');
assert.equal(film.files, 1);
// the queue's copy of the rule (the encoder's stays in its lazy chunk) gives the encoder's bitrate at every delivery size
for (const format of ['landscape', 'portrait', 'square', 'card']) for (const entry of QUEUE_PRESETS.filter((p) => p.kind === 'film')) {
  const size = filmOutputSize(format, entry.resolution);
  const expected = ((defaultFilmBitrate(size.width, size.height, entry.fps) + 128_000) * 8) / 8;
  assert.equal(Math.round(queueEstimate(entry, format, 8000, 1, 0).bytes), Math.round(expected), `${format} ${entry.id}: the encoder's bitrate`);
}
// More pixels, frames or motion-blur samples cost more time; a longer take costs more bytes.
assert.ok(queueEstimate(preset('film-2160'), 'landscape', 8000, 1, 6).seconds > film.seconds, 'more pixels take longer');
assert.ok(queueEstimate(preset('film-1080'), 'landscape', 8000, 4, 6).seconds > film.seconds, 'more samples take longer');
assert.ok(queueEstimate(preset('film-1080'), 'landscape', 16000, 1, 6).bytes > film.bytes, 'a longer take is a bigger file');

// The time estimate follows this browser's measured rate once one is recorded.
recordRenderRate(240 * 2.0736 * 200, 240, 1, 1920, 1080); // 200 ms per megapixel-sample
const measured = queueEstimate(preset('film-1080'), 'landscape', 8000, 1, 6);
assert.ok(Math.abs(measured.seconds - (2 + (240 * 2.0736 * 200) / 1000)) < 0.5, 'the measured rate drives the time');
recordRenderRate(0, 240, 1, 1920, 1080);
assert.equal(queueEstimate(preset('film-1080'), 'landscape', 8000, 1, 6).seconds, measured.seconds, 'an empty measure keeps the last rate');

// Stills: one per shot (or one at the playhead), in the scene's frame with a 3840 px long side and even sides.
assert.equal(queueEstimate(preset('stills-shots'), 'landscape', 8000, 1, 6).files, 6);
assert.equal(queueEstimate(preset('still-now'), 'landscape', 8000, 1, 6).files, 1);
for (const format of ['landscape', 'portrait', 'square', 'card']) {
  const size = stillSize(format);
  assert.equal(Math.max(size.width, size.height), 3840, `${format}: the long side`);
  assert.ok(size.width % 2 === 0 && size.height % 2 === 0, `${format}: even sides`);
}
assert.deepEqual(stillSize('portrait'), { width: 2160, height: 3840 });

// File names: the battlefield, what the file is, the frame; no spaces, colons or accents.
assert.equal(queueFileName('verdant', '1080p30', '16:9', 'mp4'), 'verdant_1080p30_16x9.mp4');
assert.equal(queueFileName('Glacier Pass', 'shot-02-Low charge', '1.91:1', 'png'), 'glacier-pass_shot-02-low-charge_191x1.png');
assert.equal(queueFileName('verdant', 'Früh Licht', '9:16', 'png'), 'verdant_fruh-licht_9x16.png');

console.log('studioQueue.selftest: presets, film and still estimates on the encoder\'s bitrate and the measured rate, still sizes and file names pass');
