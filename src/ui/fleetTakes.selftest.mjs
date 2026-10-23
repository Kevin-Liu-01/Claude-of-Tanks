// fleetTakes.selftest.mjs — every production vehicle's own take (src/ui/fleetTakes.ts; owner 2026-10-12: "make a special
// video for all tanks ... and use that everywhere"). The index loads once, at the first lookup, never at import; a
// missing, malformed or foreign entry shows nothing; the player names no video source until its frame is on screen and
// motion is allowed, pauses off screen, releases a paused source after a grace, follows the selected take and leaves
// the poster when a loop fails. The fixture index is fake and lives only here; its files are the site fifty's s21.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeDom, settle } from './fleetTakes.test-support.mjs';
import { sceneLinkPath } from '../game/studioSceneLink.ts';
import { resolveTankId } from '../vehicles/tankIdAliases.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dom = createFakeDom();
const uninstall = dom.install();
// An English page whatever this machine's language; the data-saving case below swaps the connection hints.
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const setNavigator = (extra = {}) => Object.defineProperty(globalThis, 'navigator',
  { configurable: true, value: { language: 'en-US', languages: ['en-US'], ...extra } });
setNavigator();
let fresh = 0;
const freshModule = () => import(`./fleetTakes.ts?case=${++fresh}`);

const S21 = {
  take: 's60-fixture-fields', map: 'verdant',
  title: { en: 'A T-90SM wedge assaults through the burning fields', zh: '一组 T-90SM 楔形编队冲过燃烧的田野' },
  short: { en: 'T-90SM wedge assault', zh: 'T-90SM 楔形突击' },
  loop: '/media/site50-r14/loops/s21-fields-assault.webm',
  poster: '/media/site50-r14/loops/s21-fields-assault.jpg',
  scene: '/media/site50-r14/scenes/s21-fields-assault.scene.json',
};
for (const file of [S21.loop, S21.poster, S21.scene]) assert.ok(existsSync(join(ROOT, 'public', file)), `the fixture's ${file} ships`);
const FIXTURE = {
  collection: 'site50-r14',
  vehicles: {
    t90sm_2013: S21,
    english: { ...S21, take: 's61-english', title: { en: 'Only in English' }, short: undefined },
    foreignLoop: { ...S21, loop: 'https://example.com/take.webm' },
    protocolLoop: { ...S21, loop: '//example.com/take.webm' },
    climbingPoster: { ...S21, poster: '/media/../../secret.jpg' },
    textScene: { ...S21, scene: '/media/site50-r14/scenes/s21.scene.txt' },
    posterAsLoop: { ...S21, loop: S21.poster },
    noTitle: { ...S21, title: { zh: '只有中文' } },
    noTake: { ...S21, take: '' },
    notAnEntry: 'not an entry',
  },
};

// 1. The loader: nothing at import; one request at the first lookup, shared by every caller.
const fleet = await freshModule();
assert.equal(fleet.FLEET_TAKES_INDEX, '/media/site50-r14/fleet/index.json', 'the media lane\'s index path');
assert.equal(sceneLinkPath(fleet.FLEET_TAKES_INDEX), fleet.FLEET_TAKES_INDEX, 'the index is a file on this site');
assert.deepEqual(dom.state.fetches, [], 'importing the module fetches nothing');
dom.respond(fleet.FLEET_TAKES_INDEX, FIXTURE);
const [index, again] = await Promise.all([fleet.loadFleetTakes(), fleet.loadFleetTakes()]);
assert.equal(index, again, 'concurrent lookups share one index');
assert.deepEqual(dom.state.fetches, [fleet.FLEET_TAKES_INDEX], 'the index is fetched once');
assert.deepEqual([...index.keys()], ['t90sm_2013', 'english'], 'foreign, climbing, mistyped and incomplete entries show nothing');
const take = index.get('t90sm_2013');
assert.deepEqual(take, { vehicle: 't90sm_2013', ...S21 }, 'an entry is the data contract, keyed by its vehicle');
assert.equal(index.get('m1a1_abrams_hc'), undefined, 'a vehicle the index lacks has no take');
assert.deepEqual(index.get('english').title, { en: 'Only in English', zh: 'Only in English' }, 'Chinese falls back to English');
assert.deepEqual(index.get('english').short, index.get('english').title, 'a missing short title is the title');
assert.equal(await fleet.loadFleetTakes(), index, 'later lookups reuse it');
assert.equal(dom.state.fetches.length, 1);

// Localized text and the Studio link (a scene link, as the Filming manual's).
assert.equal(fleet.fleetTakeText(take, 'title', 'en-US'), S21.title.en);
assert.equal(fleet.fleetTakeText(take, 'short', 'zh-CN'), S21.short.zh);
assert.equal(fleet.fleetTakeStudioHref(take, 'en-US'), `/studio?scene=${S21.scene}`);
assert.equal(fleet.fleetTakeStudioHref(take, 'zh-CN'), `/cn/studio?scene=${S21.scene}`);
// object3d-assert-ok: S21.scene is a Studio scene id string, not a THREE.Scene
assert.equal(sceneLinkPath(new URL(fleet.fleetTakeStudioHref(take, 'en-US'), 'https://cot.kevinliu.studio').searchParams.get('scene')),
  S21.scene, 'the link opens the take\'s scene in the Studio');

// A missing index (the state of main until the media lane ships it), a malformed one, and an offline lookup.
for (const [label, answer] of [['missing', undefined], ['server error', 503], ['malformed JSON', '{"vehicles":'],
  ['an array', { vehicles: [S21] }], ['no vehicles', { collection: 'site50-r14' }]]) {
  const module = await freshModule();
  dom.state.responses.delete(module.FLEET_TAKES_INDEX);
  if (answer !== undefined) dom.respond(module.FLEET_TAKES_INDEX, answer);
  const before = dom.state.fetches.length;
  assert.equal((await module.loadFleetTakes()).size, 0, `${label}: no takes`);
  assert.equal((await module.loadFleetTakes()).size, 0);
  assert.equal(dom.state.fetches.length - before, 1, `${label}: one request per document, not one per lookup`);
}
const offline = await freshModule();
dom.respond(offline.FLEET_TAKES_INDEX, new TypeError('Failed to fetch'));
assert.equal((await offline.loadFleetTakes()).size, 0, 'offline: no takes');
dom.respond(offline.FLEET_TAKES_INDEX, FIXTURE);
assert.equal((await offline.loadFleetTakes()).size, 2, 'a lookup after a network failure tries again');

// The index names vehicles under the tank id schema it was written in (SSOT 2.19): a stamped index moves through each
// later rename once, the leo2a6m swap included, and an unstamped one is schema 1. Today's leo2a6m (the Leopard 2A6M)
// must never show the take of the Leopard 2A4 OTCO, which schema 1 and 2 called leo2a6m.
{
  const OTCO = { ...S21, take: 's62-otco', title: { en: 'Leopard 2A4 OTCO fixture' } };
  const A6M = { ...S21, take: 's63-a6m', title: { en: 'Leopard 2A6M fixture' } };
  for (const [stamp, label] of [[2, 'a schema-2 index'], [undefined, 'an unstamped index']]) {
    const reader = await freshModule();
    dom.respond(reader.FLEET_TAKES_INDEX, { collection: 'site50-r14', ...(stamp ? { tankIdSchema: stamp } : {}),
      vehicles: { leo2a6m: OTCO, leo2a6m_x: A6M } });
    const takes = await reader.loadFleetTakes();
    assert.equal(takes.get(resolveTankId('leo2a6m', stamp))?.take, 's62-otco', `${label}: its leo2a6m is the 2A4 OTCO's take`);
    assert.equal(takes.get(resolveTankId('leo2a6m_x', stamp))?.take, 's63-a6m', `${label}: its leo2a6m_x is the 2A6M's take`);
    assert.equal(takes.get(resolveTankId('leo2a6m_x', stamp))?.vehicle, resolveTankId('leo2a6m_x', stamp), `${label}: entries carry today's id`);
  }
}

// 2. The player: poster first, a source only on screen, pause off screen, release after the grace.
const frame = dom.document.createElement('div');
const player = fleet.createFleetTakePlayer(frame);
const [video, control] = frame.children;
assert.equal(video.localName, 'video');
assert.ok(video.muted && video.defaultMuted && video.loop && video.playsInline, 'muted, looping and inline');
assert.equal(video.preload, 'none');
assert.equal(video.getAttribute('aria-hidden'), 'true', 'decorative: the surface\'s caption names the take');
assert.equal(video.tabIndex, -1);
assert.equal(control.localName, 'button');
assert.equal(dom.observersOf(frame).length, 2, 'one observer warms the poster, one gates playback');
player.show(take);
assert.equal(video.src, '', 'no source before the frame is on screen');
assert.equal(video.poster, '', 'no poster before the frame is near the viewport');
dom.intersect(frame, 0, true);
assert.equal(video.poster, S21.poster, 'the poster loads as the frame nears the viewport');
assert.equal(video.src, '', 'still no source: the frame is not visible');
dom.intersect(frame, 0.1);
assert.equal(video.src, '', 'a sliver of the frame does not start the loop');
dom.intersect(frame, 0.6);
assert.equal(video.src, S21.loop, 'visible: the loop starts');
assert.equal(video.paused, false);
assert.equal(control.hidden, false);
assert.equal(control.dataset.state, 'playing');
assert.equal(control.getAttribute('aria-label'), `Pause: ${S21.short.en}`, 'the control names its take');
dom.intersect(frame, 0, true);
assert.equal(video.paused, true, 'off screen: paused');
assert.equal(video.src, S21.loop, 'the paused source survives a scroll reversal');
assert.equal(dom.state.timers.size, 1, 'and is released after a grace');
dom.intersect(frame, 0.6);
assert.equal(dom.state.timers.size, 0, 'coming back cancels the release');
assert.equal(video.paused, false);
const loadsBefore = video.loads;
dom.intersect(frame, 0, false);
dom.runTimers();
assert.equal(video.src, '', 'the grace ends: the source is released');
assert.equal(video.loads, loadsBefore + 1, 'and the decoder reset');
assert.equal(video.poster, S21.poster, 'the poster stays');

// The viewer's pause holds across scrolling and takes; play resumes.
dom.intersect(frame, 0.6);
assert.equal(video.paused, false);
control.click();
assert.equal(video.paused, true, 'pause');
assert.equal(control.getAttribute('aria-label'), `Play: ${S21.short.en}`);
dom.intersect(frame, 0, true); dom.intersect(frame, 0.6);
assert.equal(video.paused, true, 'a paused take stays paused when it returns to view');
control.click();
assert.equal(video.paused, false, 'play');

// A hidden document pauses; returning resumes.
dom.setHidden(true);
assert.equal(video.paused, true, 'a hidden tab pauses');
dom.setHidden(false);
assert.equal(video.paused, false, 'and resumes');

// Another vehicle: the old source is released at once and the new poster follows; none releases the frame.
const other = { ...take, vehicle: 'other', take: 's62-other', loop: '/media/site50-r14/loops/s05-barn-advance-960.webm', poster: '/media/site50-r14/loops/s05-barn-advance.jpg' };
for (const file of [other.loop, other.poster]) assert.ok(existsSync(join(ROOT, 'public', file)), `the fixture's ${file} ships`);
player.show(other);
assert.equal(video.src, other.loop, 'the next vehicle\'s loop replaces the last');
assert.equal(video.poster, other.poster);
player.show(null);
assert.equal(video.src, '', 'no vehicle: nothing loads');
assert.equal(video.hidden, true);
assert.equal(control.hidden, true);
assert.equal(dom.state.timers.size, 0);

// Reduced motion keeps the poster until the viewer presses play; a new take waits for its own press.
dom.setReducedMotion(true);
player.show(take);
assert.equal(video.src, '', 'reduced motion: no autoplay');
assert.equal(video.poster, S21.poster, 'reduced motion: the poster');
assert.equal(control.hidden, false, 'with a play control');
control.click();
assert.equal(video.src, S21.loop, 'the viewer\'s play starts the loop under reduced motion');
assert.equal(video.paused, false);
player.show(other);
assert.equal(video.src, '', 'the next take waits for its own play');
dom.setReducedMotion(false);
assert.equal(video.src, other.loop, 'a changed preference applies at once');

// Data saving behaves as reduced motion.
setNavigator({ connection: { saveData: true } });
player.show(take);
assert.equal(video.src, '', 'save-data: no autoplay');
setNavigator({ connection: { effectiveType: 'slow-2g' } });
player.sync();
assert.equal(video.src, '', 'a 2g link: no autoplay');
setNavigator();
player.sync();
assert.equal(video.src, S21.loop);

// A loop that fails leaves the poster and no control; a browser that refuses a muted start waits for play.
video.fail();
assert.equal(video.src, '', 'a failed loop is released');
assert.equal(video.poster, S21.poster, 'and the poster stays');
assert.equal(control.hidden, true, 'with no control for a loop that cannot play');
player.show(other);
assert.equal(video.src, other.loop, 'another take still tries its own loop');
const third = { ...take, vehicle: 'third', take: 's63-third', loop: '/media/site50-r14/loops/s04-column-under-fire.webm', poster: '/media/site50-r14/loops/s04-column-under-fire.jpg' };
for (const file of [third.loop, third.poster]) assert.ok(existsSync(join(ROOT, 'public', file)), `the fixture's ${file} ships`);
dom.state.playRejection = Object.assign(new Error('autoplay refused'), { name: 'NotAllowedError' });
player.show(third);
await settle();
assert.equal(control.dataset.state, 'paused', 'a refused start shows play');
assert.equal(video.paused, true);
dom.state.playRejection = null;
control.click();
assert.equal(video.paused, false, 'and the viewer\'s play starts it');
assert.equal(video.src, third.loop);

// A surface's own gate (the Garage waits until it is playable); the viewer's play bypasses it.
const gated = dom.document.createElement('div');
let playable = false;
const gatedPlayer = fleet.createFleetTakePlayer(gated, () => playable);
gatedPlayer.show(take);
dom.intersect(gated, 0.9);
assert.equal(gated.children[0].src, '', 'the surface\'s gate holds the loop');
playable = true;
gatedPlayer.sync();
// One transfer at a time (brand-ui SPEC 8.3): the first frame's loop is still downloading, so the opened gate waits
// with its poster; the first transfer buffering through hands the slot to the waiting frame.
assert.equal(gated.children[0].src, '', 'one transfer at a time: the second frame waits while the first downloads');
video.dispatchEvent({ type: 'canplaythrough' });
assert.equal(gated.children[0].src, S21.loop, 'sync applies the opened gate once the transfer slot frees');
gatedPlayer.dispose();
assert.equal(gated.children.length, 0, 'dispose removes the player');
assert.ok(dom.observersOf(gated).length === 0, 'and disconnects its observers');

// 3. The figure: the frame, the take's title and its Studio link.
const figure = fleet.createFleetTakeFigure('Open in Studio');
assert.equal(figure.root.localName, 'figure');
figure.show(take);
const caption = figure.root.querySelector('figcaption');
assert.equal(caption.querySelector('.fleet-take-title').textContent, S21.title.en, 'the caption is the take\'s title');
const studio = caption.querySelector('.fleet-take-studio');
assert.equal(studio.textContent, 'Open in Studio');
assert.equal(studio.getAttribute('href'), `/studio?scene=${S21.scene}`);
figure.show(null);
assert.equal(studio.getAttribute('href'), null, 'no take: no link');
assert.equal(caption.querySelector('.fleet-take-title').textContent, '');

// 4. The shipped index, once the media lane adds it: every entry valid (nothing silently dropped), each a production
// vehicle's, its loop, poster and scene on disk and the scene staging that vehicle. Absent, every surface shows nothing.
const shipped = join(ROOT, 'public', fleet.FLEET_TAKES_INDEX);
let coverage = 'the index is not shipped yet: every surface shows nothing';
if (existsSync(shipped)) {
  const json = JSON.parse(readFileSync(shipped, 'utf8'));
  const production = new Set(JSON.parse(readFileSync(join(ROOT, 'src/docs/reference.generated.json'), 'utf8')).vehicles.map((v) => v.id));
  const reader = await freshModule();
  dom.respond(reader.FLEET_TAKES_INDEX, json);
  const takes = await reader.loadFleetTakes();
  assert.deepEqual([...takes.keys()].sort(), Object.keys(json.vehicles ?? {}).map((key) => resolveTankId(key, json.tankIdSchema)).sort(),
    'every shipped entry is valid, keyed in today\'s spelling');
  for (const entry of takes.values()) {
    assert.ok(production.has(entry.vehicle), `${entry.vehicle}: a production vehicle (src/docs/reference.generated.json)`);
    for (const file of [entry.loop, entry.poster, entry.scene]) {
      assert.ok(existsSync(join(ROOT, 'public', file)), `${entry.vehicle}: ${file} ships`);
    }
    const scene = JSON.parse(readFileSync(join(ROOT, 'public', entry.scene), 'utf8'));
    assert.equal(scene.map, entry.map, `${entry.vehicle}: the index names its scene's map`);
    // a take's scene stays as filmed, its ids in the schema it was written under (the alias layer resolves them at load)
    assert.ok(scene.actors?.some((actor) => resolveTankId(actor.id, scene.tankIdSchema) === entry.vehicle), `${entry.vehicle}: its take stages it`);
  }
  coverage = `the shipped index gives ${takes.size} of ${production.size} production vehicles their take`;
}

// At most two loops play at once on a page (the coordinator, 2026-10-13): a third pauses the one playing longest, which
// resumes once a slot frees while still in view, and the viewer's own play always wins a slot.
// (the policy is one per page, src/presentation/mediaPlayer.ts: the frame above leaves the page first)
player.dispose();
{
  const capped = await freshModule();
  const frames = [0, 1, 2].map(() => dom.document.createElement('div'));
  const players = frames.map((f) => capped.createFleetTakePlayer(f));
  const videos = frames.map((f) => f.children[0]);
  for (const [i, p] of players.entries()) {
    p.show(take);
    dom.intersect(frames[i], 0, true);
    dom.intersect(frames[i], 0.6);
    assert.equal(videos[i].paused, false, `loop ${i + 1} starts: no other transfer is in flight`);
    videos[i].dispatchEvent({ type: 'canplaythrough' }); // its transfer buffers through: the slot frees for the next
  }
  assert.deepEqual(videos.map((v) => v.paused), [true, false, false], 'a third loop pauses the one playing longest');
  dom.intersect(frames[1], 0, true);
  assert.deepEqual(videos.map((v) => v.paused), [false, true, false], 'a freed slot resumes the crowded loop in view');
  dom.intersect(frames[1], 0.6);
  assert.deepEqual(videos.map((v) => v.paused), [false, false, true], 'the newest to start crowds out the longest playing');
  players[2].toggle();
  assert.deepEqual(videos.map((v) => v.paused), [true, false, false], "the viewer's play wins a slot");
  for (const p of players) p.dispose();
}

uninstall();
if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
console.log('fleetTakes.selftest: one lazy index lookup, invalid entries refused, poster first, playback only on screen and '
  + `with motion allowed, pause, release, take changes, failures, two playing at most and the Studio link passed; ${coverage}`);
