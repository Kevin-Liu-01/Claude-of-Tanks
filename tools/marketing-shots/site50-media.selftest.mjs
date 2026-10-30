// The site fifty's media (public/media/site50-r14): the public site's gameplay media since round fourteen, built by
// tools/media-r5/site-media.mjs from tools/media-r5/site-media/picks.json and wired into the pages by
// tools/media-r5/site-media-wire.mjs. Every take and frame comes from the picks' round, every take with its sound, every
// file matches its receipt, and the formats are the ones the pages were built for.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const picks = JSON.parse(readFileSync(join(ROOT, 'tools/media-r5/site-media/picks.json'), 'utf8'));
const COLLECTION = join(ROOT, 'public/media', picks.collection);
const manifest = JSON.parse(readFileSync(join(COLLECTION, 'manifest.json'), 'utf8'));
const archive = JSON.parse(readFileSync(join(COLLECTION, 'archive.json'), 'utf8'));
const proxies = JSON.parse(readFileSync(join(ROOT, 'public/media/web-video-r1/manifest.json'), 'utf8'));

assert.equal(manifest.libraryId, `claude-of-tanks-${picks.collection}`);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.round, picks.round);
assert.equal(manifest.draft, undefined, 'the published collection is not a draft: no older round stands in');

const takes = Object.entries(manifest.takes);
// the fifty, the owner's nine (2026-10-12, s51-s59: a take each for the tanks the owner named) and the combat round's
// takes (2026-10-17: s225-s228): every take the picks name
assert.equal(takes.length, Object.keys(picks.takes).length, 'every picked take');
assert.ok(takes.length >= 59, 'the site fifty and the owner\'s nine at least');
assert.deepEqual(takes.map(([id]) => id).sort(), Object.keys(picks.takes).sort());
for (const [id, take] of takes) {
  assert.ok(take.current, `${id} is delivered in ${picks.round}`);
  assert.ok(take.sound, `${id} is delivered with its sound`);
  assert.equal(take.map, picks.takes[id].map, `${id} battlefield`);
}
assert.equal(manifest.frames.length, 50, 'the fifty frames');
assert.equal(new Set(manifest.frames.map((frame) => frame.id)).size, 50);

const files = new Map(manifest.files.map((file) => [file.path, file]));
for (const file of manifest.files) {
  const path = join(ROOT, 'public', file.path);
  assert.ok(existsSync(path), `${file.path} is published`);
  assert.equal(statSync(path).size, file.bytes, `${file.path} byte receipt`);
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), file.sha256, `${file.path} sha256 receipt`);
  assert.ok(file.bytes < 50 * 1048576, `${file.path} stays under 50 MiB`);
}
const media = (pattern) => manifest.files.filter((file) => pattern.test(file.path));
const near = (value, target, tolerance) => Math.abs(value - target) <= tolerance;

for (const id of Object.keys(picks.takes)) {
  // the key moment always; the close portrait unless the picks say the take has none (a combat take filmed with its key
  // moment alone: picks.takes[id].closePortrait === false)
  const close = picks.takes[id].closePortrait !== false;
  for (const name of [`stills/${id}.webp`, `stills/${id}-thumb.webp`, ...(close ? [`stills/${id}-close.webp`, `stills/${id}-close-thumb.webp`] : [])]) {
    const file = files.get(`media/${picks.collection}/${name}`);
    assert.ok(file, `${id}: ${name}`);
    assert.ok(file.bytes > (name.includes('thumb') ? 8_000 : 50_000), `${name} is a substantial image`);
  }
}
const loops = media(/\/loops\/[^/]+\.webm$/).filter((file) => !file.path.endsWith('-960.webm'));
assert.ok(loops.length >= 10, 'the loops the pages play');
// 264: the Field Manual's first-battle hero s226 (media-site-all-242, db2bff2901) was delivered from a 4.6 s take; its
// source (shots/media-r5/site50/deliver-combat226) is not on this machine, so it stays as delivered until a re-cut
const LOOP_SECONDS = Object.freeze({ 'media/site50-r14/loops/s226-church-duel.webm': 4.6 });
for (const loop of loops) {
  assert.equal(`${loop.width}x${loop.height}`, '1920x1080', `${loop.path} size`);
  assert.equal(loop.audio, 'opus', `${loop.path} keeps its sound`);
  const seconds = LOOP_SECONDS[loop.path] ?? 6;
  assert.ok(near(loop.seconds, seconds, 0.1), `${loop.path} is the ${seconds} s loop`);
  assert.ok(files.has(loop.path.replace(/\.webm$/, '.jpg')), `${loop.path} poster`);
}
for (const small of media(/-960\.webm$/)) {
  assert.equal(`${small.width}x${small.height}`, '960x540', `${small.path} size`);
  assert.equal(small.audio, null, `${small.path} is silent (the archive dialog plays it muted)`);
}
const reels = media(/\/reels\/[^/]+\.mp4$/);
assert.equal(reels.length, picks.docs.reels.length, 'every battle take ships');
for (const reel of reels) {
  assert.equal(`${reel.width}x${reel.height}`, '1280x720', `${reel.path} size`);
  assert.equal(reel.audio, 'aac', `${reel.path} carries its sound`);
  assert.ok(files.has(reel.path.replace(/\.mp4$/, '.webp')), `${reel.path} poster`);
}
const trailer = files.get(`media/${picks.collection}/films/trailer.mp4`);
// (round six, 2026-10-15: the trailers' files are checked with the films below; the manual's player plays its webm first)
assert.equal(`${trailer?.width}x${trailer?.height}`, '1600x900', 'the trailer at its light encode\'s size');
assert.equal(trailer.audio, 'aac', 'the trailer keeps its score');
const reel = files.get(`media/${picks.collection}/films/reel.mp4`);
// (2026-10-14, the light web encodes: the home reel re-encoded at 1600x900 under its 4.3 Mbit/s cap, site-media.mjs
// WEB.reel / WEB.reelMp4; the trailer stays 1080p)
assert.equal(`${reel?.width}x${reel?.height}`, '1600x900', 'the home reel at 1600x900 (the light encode)');
assert.equal(reel.audio, null, 'the home reel is silent (it loops muted)');

const sheets = media(/\/frames\/sheet-\d+\.webp$/);
assert.equal(sheets.length, 5, 'the fifty frames, ten to a contact sheet');
assert.deepEqual(sheets.flatMap((sheet) => sheet.frames).sort(), manifest.frames.map((frame) => frame.id).sort());
for (const frame of manifest.frames) {
  assert.ok(files.has(`media/${picks.collection}/frames/${frame.id}.webp`), `${frame.id} at 1920`);
  assert.ok(files.has(`media/${picks.collection}/frames/${frame.id}-thumb.webp`), `${frame.id} preview`);
}

// the visual archive (the manual's wall and the Studio's Field Frames): the fifty frames, then each take's key moment
// and its close portrait where it has one (a combat take may have only its key moment)
const takeStills = takes.reduce((n, [id]) => n + 1 + (files.has(`media/${picks.collection}/stills/${id}-close.webp`) ? 1 : 0), 0);
for (const [id] of takes) assert.ok(files.has(`media/${picks.collection}/stills/${id}.webp`), `${id} key moment`);
assert.equal(archive.shots.length, manifest.frames.length + takeStills);
assert.deepEqual(archive.shots.map((shot) => shot.sequence), archive.shots.map((_, i) => i + 1));
for (const shot of archive.shots) {
  for (const url of [shot.src, shot.previewSrc]) assert.ok(files.has(url.slice(1)), `archive ${url} is published`);
  assert.ok(shot.title && shot.alt && shot.feature && shot.map, `archive ${shot.src} has its caption`);
}

// the landing page's mobile proxies stay inside its nine-megabyte transfer budget (the Field Manual's chapter loops' phone
// rungs are built outside it since 242, db2bff2901: the landing never plays them)
const chapterRungs = new Set((picks.docs.chapterLoops ?? []).map((take) => `${take}-mobile.mp4`));
const landingBytes = proxies.files.filter((file) => !chapterRungs.has(file.path)).reduce((sum, file) => sum + file.bytes, 0);
assert.ok(landingBytes < 9_000_000, `the landing's phone proxies weigh ${landingBytes} bytes`);
for (const proxy of proxies.files) {
  assert.equal(statSync(join(ROOT, 'public/media/web-video-r1', proxy.path)).size, proxy.bytes, `${proxy.path} byte receipt`);
}

// the trailers (round six, 2026-10-15, the owner: "also make better new trailers"): the main cut, the 30 s cut and the
// vertical, each a VP9 webm with Opus and an H.264 mp4 with AAC from one master and a poster, at their light encodes:
// each holds its weight, and its VMAF against the master (every frame) is recorded, 78 at least (the floor at the cap)
const FILMS = [
  ['trailer.webm', '1600x900', 70.0, 'opus', 23.5],
  ['trailer.mp4', '1600x900', 70.0, 'aac', 26.5],
  ['trailer-30.webm', '1920x1080', 30.0, 'opus', 12.0],
  ['trailer-30.mp4', '1920x1080', 30.0, 'aac', 15.0],
  ['trailer-vertical.webm', '1080x1920', 20.0, 'opus', 8.0],
  ['trailer-vertical.mp4', '1080x1920', 20.0, 'aac', 10.0],
];
for (const [file, size, seconds, audio, maxMb] of FILMS) {
  const film = files.get(`media/${picks.collection}/films/${file}`);
  assert.ok(film, `${file} ships`);
  assert.equal(`${film.width}x${film.height}`, size, `${file} size`);
  assert.ok(near(film.seconds, seconds, 0.25), `${file} runs ${seconds} s (${film.seconds})`);
  assert.equal(film.audio, audio, `${file} keeps its score`);
  assert.ok(film.bytes <= maxMb * 1048576, `${file}: ${(film.bytes / 1048576).toFixed(2)} MB, at most ${maxMb} MB`);
  assert.ok((film.encode?.vmaf ?? 0) >= 78, `${file}: VMAF ${film.encode?.vmaf ?? 'unrecorded'} against its master`);
  assert.ok(files.has(`media/${picks.collection}/films/${file.replace(/\.(webm|mp4)$/, '.jpg')}`), `${file} poster`);
}

console.log(`site50-media.selftest: ${manifest.files.length} files, the ${takes.length} takes with sound, the fifty frames and the films pass`);
