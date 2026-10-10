// The Filming manual (src/docs/filming.ts, docs.topic.filming.*): its take viewer against the shipped media and its
// manifest (public/media/filming-r1, tools/media-r5/docs-media.mjs), and the numbers its copy states against the code
// that makes them true, so the page cannot drift from the pipeline it describes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILMING_STAGES, FILMING_TAKES, filmingFrames, filmingPoster, filmingScene, filmingStudioLink, filmingThumb, filmingVideo } from './filming.ts';
import { topics } from './topics.ts';
import { CARD, CARD_FROM, DOCS_STAGES, DOCS_TAKES, ENGINE_LATEST, FIGURES, SCENE_LIBRARY } from '../../tools/media-r5/docs-media.mjs';
import { sceneLinkPath } from '../game/studioSceneLink.ts';
import { FILM_MOTION_STEP_PX } from '../game/studioFilmPlan.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MEDIA = join(ROOT, 'public/media/filming-r1');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const publicFile = (url) => join(ROOT, 'public', url.replace(/^\//, ''));
const manifest = JSON.parse(readFileSync(join(MEDIA, 'manifest.json'), 'utf8'));
const library = JSON.parse(read(`${SCENE_LIBRARY}/library.json`));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The viewer's takes are the builder's, in its order, and their stages are what the manifest says shipped.
assert.deepEqual(FILMING_TAKES.map((take) => take.id), DOCS_TAKES, 'the viewer shows the builder\'s takes in its order');
assert.deepEqual(FILMING_STAGES, Object.keys(DOCS_STAGES), 'one stage order: the viewer\'s and the builder\'s');
assert.deepEqual(manifest.takes.map((take) => take.id), DOCS_TAKES, 'the manifest holds every featured take');
assert.equal(manifest.author, 'Kevin B. Liu');
const referenced = new Set(['manifest.json']);
for (const take of FILMING_TAKES) {
  const shipped = manifest.takes.find((entry) => entry.id === take.id);
  assert.deepEqual(take.stages, Object.keys(shipped.stages), `${take.id}: the viewer lists exactly the stages that shipped`);
  assert.deepEqual(take.stages, FILMING_STAGES.filter((stage) => take.stages.includes(stage)), `${take.id}: stages in round order`);
  assert.ok(take.stages.includes('r4') && take.stages.includes('review1'), `${take.id}: every take shows where it started`);
  for (const stage of take.stages) {
    const entry = shipped.stages[stage];
    assert.equal(entry.video, filmingVideo(take, stage));
    assert.equal(entry.poster, filmingPoster(take, stage));
    const video = publicFile(entry.video);
    assert.ok(existsSync(video) && existsSync(publicFile(entry.poster)), `${take.id} ${stage}: video and poster exist`);
    assert.equal(statSync(video).size, entry.bytes, `${take.id} ${stage}: the manifest records the file that shipped`);
    assert.ok(entry.seconds >= 5.9 && entry.seconds <= 6.7, `${take.id} ${stage}: one 6–6.6 s take (${entry.seconds} s)`);
    assert.ok(entry.bytes < 4.5 * 1048576, `${take.id} ${stage}: ${(entry.bytes / 1048576).toFixed(1)} MB is over the page's clip budget`);
    referenced.add(`${take.id}-${stage}.mp4`).add(`${take.id}-${stage}.webp`);
  }
  assert.equal(take.frames, ENGINE_LATEST.find((stage) => take.stages.includes(stage)), `${take.id}: frames from its latest engine render`);
  assert.equal(shipped.frames.from, take.frames, `${take.id}: the strip on disk was cut from that render`);
  assert.equal(shipped.thumb.from, CARD_FROM.find((stage) => take.stages.includes(stage)), `${take.id}: the card from its most finished render`);
  assert.equal(shipped.frames.image, filmingFrames(take));
  assert.equal(shipped.thumb.image, filmingThumb(take));
  for (const image of [shipped.frames.image, shipped.thumb.image]) {
    assert.ok(existsSync(publicFile(image)), `${take.id}: ${image} exists`);
    referenced.add(image.split('/').at(-1));
  }
  assert.ok(take.title && take.story && take.place && take.time, `${take.id}: title, story, place and time`);
  // The take's scene: the shot library's current code, as the Studio saves it, opened by a scene link.
  const scene = shipped.scene;
  assert.ok(scene, `${take.id}: its scene shipped`);
  assert.equal(scene.file, filmingScene(take));
  assert.equal(scene.source, `${SCENE_LIBRARY}/${take.id}.json`);
  assert.equal(sha256(readFileSync(publicFile(scene.file))), scene.sha256, `${take.id}: the manifest records the scene that shipped`);
  assert.equal(sha256(readFileSync(join(ROOT, scene.source))), scene.sha256, `${take.id}: the shipped scene is the library's current code (rebuild with docs-media.mjs)`);
  assert.equal(scene.version, library.shots[take.id].versions.at(-1).version, `${take.id}: the library's latest version`);
  assert.equal(sceneLinkPath(new URL(filmingStudioLink(take), 'https://cot.kevinliu.studio').searchParams.get('scene')), scene.file,
    `${take.id}: the Studio link opens the scene`);
  referenced.add(`${take.id}.scene.json`);
}
assert.deepEqual(manifest.figures.map((entry) => entry.name), [...FIGURES.map((figure) => figure.name), 'card'],
  'the figures, the cover and the manual index\'s card shipped');
for (const shipped of manifest.figures) {
  assert.ok(existsSync(publicFile(shipped.image)), `figure ${shipped.name} exists`);
  referenced.add(shipped.image.split('/').at(-1));
}
assert.match(manifest.figures.at(-1).source, new RegExp(`^${CARD.take}: previz at `), 'the card is one take across the pipeline');
const orphans = readdirSync(MEDIA).filter((name) => !referenced.has(name));
assert.deepEqual(orphans, [], 'every file in filming-r1 is in the manifest (rebuild with tools/media-r5/docs-media.mjs)');
const total = readdirSync(MEDIA).reduce((sum, name) => sum + statSync(join(MEDIA, name)).size, 0);
assert.ok(total < 84 * 1048576, `filming-r1 is ${(total / 1048576).toFixed(1)} MB; the collection's budget is 84 MB`);

// The page: its figures are the builder's, the cover feeds the manual index and the social card.
const filming = topics.filming;
assert.deepEqual(filming.media.map(([src]) => src), ['/media/filming-r1/previz-sheet.webp', '/media/filming-r1/plan-view.webp']);
assert.deepEqual(filming.mediaAt, [3, 5], 'the previz sheet follows the motion search, the Plan view the Studio\'s gains');
assert.match(read('site/docs.html'), /<a class="docs-chapter-wide" href="\/docs\/filming"><span class="docs-chapter-media"><img src="\/media\/filming-r1\/card\.webp"/);
assert.match(read('tools/marketing-shots/generate-og-images.mjs'), /\['docs-filming', 'FILMING THE MEDIA', 'public\/media\/filming-r1\/cover\.webp'/);
const topicsSource = read('src/docs/topics.ts');
assert.match(topicsSource, /slug === 'filming'\) \{\n\s+void import\('\.\/filming\.ts'\)/, 'the viewer loads on demand, on its own page');

// The copy's numbers, held to the code that makes them true.
const text = [filming.lede, ...filming.sections.flat()].join(' ');
const motionPlan = JSON.parse(read('tools/media-r5/site50-motion.json'));
assert.equal(Object.keys(motionPlan).length, 50, 'the motion search staged every take (s40 too since the 2.0 maps, 2c831bd28)');
assert.match(text, /The motion search staged all 50 takes\./);
const setups = read('tools/media-r5/setups.mjs');
const film = /scene\.film = m\.film \?\? s\.film \?\? \{ fps: (\d+), shutterDeg: (\d+), samples: (\d+), maxSamples: (\d+) \}/.exec(setups);
assert.ok(film, 'the site fifty\'s film block in setups.mjs');
const [, fps, shutter, samples, maxSamples] = film.map(Number);
assert.match(text, new RegExp(`3840 × 2160 and ${fps} frames per second`));
assert.match(text, new RegExp(`average of ${samples} to ${maxSamples} complete renders at sub-pixel offsets across a ${shutter}° shutter`));
assert.match(text, new RegExp(`at most ${FILM_MOTION_STEP_PX} pixels apart`));
// Deep focus (owner 2026-10-06): the media builder turns depth of field and fringing off for every scene.
const sets = read('tools/media-r5/sets.mjs');
assert.match(sets, /export const pictureFor = \(set, extra = \{\}\) => \(\{\n\s+preset: [^\n]+\n\s+dof: \{ enabled: false \},\n\s+chromaticAberration: 0,/);
assert.match(text, /in deep focus: sharp from the lens to the horizon/);
// The stills' exposure, held to the builder (media wave m1, 2026-10-07: 2 ms, so the tread and the turret stay crisp).
const stillMs = /export const STILL_EXPOSURE_MS = (\d+);/.exec(read('tools/media-r5/site50.mjs'))?.[1];
assert.ok(stillMs, 'the stills exposure in site50.mjs');
assert.match(text, new RegExp(`two 4K stills at a ${stillMs} ms exposure`));
assert.match(read('tools/media-r5/cinema-jobs.mjs'), /resolution: Number\(opt\.resolution \?\? 2160\)/, 'finals render at 2160p');
assert.match(read('tools/media-r5/lens-check.mjs'), /export function lensReport\(scene, model, \{ stepMs = 100,/);
assert.match(text, /samples the camera every 100 ms and casts five sightlines/);
assert.match(read('tools/media-r5/route-check.mjs'), /export function propProblems\(scene, model, \{ pad = 0\.15, stepMs = 50,/);
assert.match(text, /checked against it in 50 ms steps/);
assert.match(read('src/game/studioLight.ts'), /cameraEV: -1\.25,/);
assert.match(text, /a moonlit exposure, 1\.25 stops under the map's/);
assert.match(read('tools/media-r5/score/score.mjs'), /const lufs = cues\.lufs \?\? -14;/);
assert.match(text, /Each film is mastered to −14 LUFS\./);
assert.match(text, /Nothing in the films' sound is synthesized\./);
assert.doesNotMatch(text, /selftest|node (?:src|tools)\//, 'the manual explains the pipeline; it is not a test checklist');

console.log(`filming.selftest: ${FILMING_TAKES.length} takes, ${FILMING_TAKES.reduce((n, take) => n + take.stages.length, 0)} stage clips, ${(total / 1048576).toFixed(1)} MB, and the page's numbers held to the pipeline`);
