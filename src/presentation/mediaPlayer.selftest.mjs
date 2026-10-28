// mediaPlayer.selftest.mjs — the site's one playback policy (src/presentation/mediaPlayer.ts; brand-ui SPEC 8.3,
// SHOWCASE §5.4-5.5, BUI-F7). Proves, on the fake DOM the fleet-take receipts use: no source before the near margin;
// play at half visible, pause below a tenth; release after ten seconds; one transfer at a time with the waiting frame
// nearest the viewport centre next; two playing on a desktop and one on a phone, the least-shown frame standing down and
// a stood-down frame scrolled to taking its slot back; hover play after 150 ms; the pause
// control on every loop that plays by itself (and a film over five seconds); the AV1 → VP9 → H.264 ladder by canPlayType and MediaCapabilities; zero video
// sources under reduced motion and data saving; the Play hand-off; and that neither this module nor
// responsivePicture.ts enters the game entry's boot graph.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeDom } from '../ui/fleetTakes.test-support.mjs';
import { runtimeImportSpecifiers, staticImportClosure, importChain } from '../../tools/static-import-closure.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dom = createFakeDom();
const uninstall = dom.install();
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const connectionListeners = new Set();
const setNavigator = (connection = {}, extra = {}) => Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    language: 'en-US', languages: ['en-US'], ...extra,
    connection: { ...connection, addEventListener: (type, listener) => connectionListeners.add(listener) },
  },
});
setNavigator();
globalThis.innerHeight = 800;
let fresh = 0;
const freshModule = () => import(`./mediaPlayer.ts?case=${++fresh}`);

// 1. The numbers are SPEC 8.3's.
const media = await freshModule();
assert.deepEqual({ ...media.MEDIA_POLICY }, {
  nearMargin: '25% 0px', playRatio: 0.5, pauseRatio: 0.1, releaseMs: 10_000, hoverDelayMs: 150,
  maxPlayingDesktop: 2, maxPlayingPhone: 1, pauseControlSeconds: 5,
  phoneQuery: '(max-width: 767px)', wideQuery: '(min-width: 1280px)',
}, 'the playback policy is the SPEC\'s, number for number');

const LOOP = '/media/site50-r14/loops/s05-barn-advance.webm';
const LOOP_960 = '/media/site50-r14/loops/s05-barn-advance-960.webm';
const PHONE = '/media/web-video-r1/s05-barn-advance-mobile.mp4';
const AV1 = { src: '/media/x/s05-av1.webm', type: 'video/webm; codecs="av01.0.08M.08"' };
const VP9 = { src: LOOP, type: 'video/webm; codecs="vp9"' };
const H264 = { src: '/media/x/s05.mp4', type: 'video/mp4' };
const POSTER = '/media/site50-r14/loops/s05-barn-advance.jpg';
const label = (playing) => (playing ? 'Pause the loop' : 'Play the loop');

function frameWith(rect = { top: 0, height: 360 }) {
  const frame = dom.document.createElement('div');
  const video = dom.document.createElement('video');
  frame.append(video);
  video.getBoundingClientRect = () => ({ left: 0, right: 640, width: 640, bottom: rect.top + rect.height, ...rect });
  return { frame, video };
}

// 2. The ladder: AV1 only where MediaCapabilities calls it smooth (skipped until it answers), then VP9, then H.264.
{
  const { video } = frameWith();
  const supported = new Set(['video/webm; codecs="av01.0.08M.08"', 'video/webm; codecs="vp9"', 'video/mp4']);
  video.canPlayType = (type) => (supported.has(type) ? 'probably' : '');
  assert.equal(media.chooseSource(video, [AV1, VP9, H264]).src, VP9.src, 'AV1 waits for MediaCapabilities: VP9 meanwhile');
  let answer;
  setNavigator({}, { mediaCapabilities: { decodingInfo: (config) => { answer = config; return Promise.resolve({ supported: true, smooth: true }); } } });
  const probe = media.createMediaPlayer(video, { label, control: 'none' });
  probe.show({ sources: [AV1, VP9, H264] });
  await new Promise((done) => setImmediate(done));
  assert.equal(answer.video.contentType, AV1.type, 'the AV1 file is probed by its codecs string');
  assert.equal(media.chooseSource(video, [AV1, VP9, H264]).src, AV1.src, 'smooth AV1 leads the ladder');
  supported.delete('video/webm; codecs="vp9"');
  supported.delete(AV1.type);
  assert.equal(media.chooseSource(video, [AV1, VP9, H264]).src, H264.src, 'no VP9: the H.264 fallback plays');
  supported.delete('video/mp4');
  assert.equal(media.chooseSource(video, [AV1, VP9, H264]), null, 'nothing playable: no source, the poster stays');
  probe.dispose();
  setNavigator();
  const ladder = [{ src: LOOP_960, type: 'video/webm' }, { src: LOOP, type: 'video/webm', rung: 'wide' }, { src: PHONE, type: 'video/mp4', rung: 'phone' }];
  const any = frameWith().video;
  assert.equal(media.chooseSource(any, ladder).src, LOOP_960, 'a desktop leads with the 960 rung');
  dom.setQuery(media.MEDIA_POLICY.wideQuery, true);
  assert.equal(media.chooseSource(any, ladder).src, LOOP, 'a wide screen may play the 1920 loop');
  setNavigator({ saveData: true });
  assert.equal(media.chooseSource(any, ladder, true).src, LOOP_960, 'data saving never reaches for the wide rung first');
  setNavigator();
  dom.setQuery(media.MEDIA_POLICY.wideQuery, false);
  dom.setQuery(media.MEDIA_POLICY.phoneQuery, true);
  assert.equal(media.chooseSource(any, ladder).src, PHONE, 'a phone plays its phone rung');
  assert.equal(media.chooseSource(any, ladder.slice(0, 2)), null, 'a phone starts nothing heavier by itself');
  assert.equal(media.chooseSource(any, ladder.slice(0, 2), true).src, LOOP_960, 'but the viewer\'s play reaches the 960 rung');
  dom.setQuery(media.MEDIA_POLICY.phoneQuery, false);
  assert.equal(media.mediaType('/a/b.mp4'), 'video/mp4');
  assert.equal(media.mediaType('/a/b.webm'), 'video/webm');
}

// 3. One page loop: no source until near, the transfer starts in the near margin (warm), play at half visible, keep
// playing down to a tenth, pause below it, release ten seconds later; the control pauses a playing loop.
const page = await freshModule();
{
  const { frame, video } = frameWith();
  const player = page.createMediaPlayer(video, { label, warm: true });
  player.show({ sources: [{ src: LOOP, type: 'video/webm' }], poster: POSTER, seconds: 6 });
  const control = frame.children[1];
  assert.equal(video.preload, 'none');
  assert.ok(video.muted && video.defaultMuted && video.loop && video.playsInline, 'muted, looping, inline');
  assert.equal(video.src, '', 'no source before the near margin');
  assert.equal(video.poster, '', 'no poster either');
  assert.deepEqual(dom.observersOf(video).map((o) => o.options.rootMargin ?? '0px').sort(), ['0px', '25% 0px'],
    'one observer for the near margin, one for the visible share');
  dom.intersect(video, 0, true);
  assert.equal(video.poster, POSTER, 'near: the poster');
  assert.equal(video.src, LOOP, 'near: the transfer starts (a page loop warms)');
  assert.equal(video.preload, 'auto');
  assert.equal(video.paused, true, 'but nothing plays off screen');
  assert.equal(control.hidden, true, 'no play disc flashes ahead of a loop about to start by itself');
  dom.intersect(video, 0.3);
  assert.equal(video.paused, true, 'a third of the frame does not start it');
  dom.intersect(video, 0.5);
  assert.equal(video.paused, false, 'half the frame plays it');
  assert.equal(control.hidden, false, 'a loop over five seconds shows its pause control');
  assert.equal(control.getAttribute('aria-label'), 'Pause the loop');
  assert.equal(control.className, 'cot-c-btn cot-c-btn--icon cot-media-toggle', 'the kit\'s square icon button over media');
  control.click();
  assert.equal(video.paused, true, 'the viewer pauses it');
  assert.deepEqual([control.hidden, control.dataset.state, control.getAttribute('aria-label')], [false, 'paused', 'Play the loop'],
    'and the disc offers play');
  control.click();
  assert.equal(video.paused, false, 'and plays it again');
  dom.intersect(video, 0.3);
  assert.equal(video.paused, false, 'it keeps playing down to a tenth');
  dom.intersect(video, 0.05);
  assert.equal(video.paused, true, 'below a tenth it pauses');
  assert.equal(video.src, LOOP, 'and keeps its source while near');
  dom.intersect(video, 0, false);
  const release = [...dom.state.timers.values()].find((timer) => timer.delay === 10_000);
  assert.ok(release, 'leaving the near margin schedules the release at ten seconds');
  const loads = video.loads;
  dom.runTimers();
  assert.equal(video.src, '', 'ten seconds off screen: the source is released');
  assert.equal(video.loads, loads + 1, 'and load() cancels the transfer');
  player.dispose();
  assert.equal(frame.children.length, 1, 'dispose removes the control');
  // a short loop shows its pause control too: it plays on past its file's end (WCAG 2.2.2 counts the motion, not the file)
  const short = frameWith();
  const brief = page.createMediaPlayer(short.video, { label, warm: true });
  brief.show({ sources: [{ src: LOOP, type: 'video/webm' }], seconds: 4 });
  dom.intersect(short.video, 0.9, true);
  assert.equal(short.video.paused, false);
  assert.equal(short.frame.children[1].hidden, false, 'a four-second loop shows its pause control while it plays');
  brief.dispose();
}

// 4. One transfer at a time; the waiting frame nearest the viewport centre goes next; the viewer's play never waits.
{
  const one = frameWith({ top: 900, height: 360 });
  const far = frameWith({ top: 2400, height: 360 });
  const close = frameWith({ top: 1000, height: 360 });
  const players = [one, far, close].map(({ video }) => page.createMediaPlayer(video, { label, warm: true }));
  for (const [index, { video }] of [one, far, close].entries()) {
    players[index].show({ sources: [{ src: `${LOOP}?${index}`, type: 'video/webm' }] });
    dom.intersect(video, 0, true);
  }
  assert.deepEqual([one, far, close].map(({ video }) => video.src !== ''), [true, false, false], 'one transfer in flight; the others wait');
  assert.equal(page.mediaDownloading(), true);
  one.video.dispatchEvent({ type: 'canplaythrough' });
  assert.deepEqual([one, far, close].map(({ video }) => video.src !== ''), [true, false, true], 'the waiter nearest the centre goes next');
  close.video.dispatchEvent({ type: 'stalled' });
  assert.equal(far.video.src !== '', true, 'a stalled transfer yields its turn');
  far.video.dispatchEvent({ type: 'suspend' });
  assert.equal(page.mediaDownloading(), false, 'nothing transfers once every frame has buffered');
  // the viewer's play bypasses the queue
  const busy = frameWith();
  const waitingFrame = frameWith();
  const first = page.createMediaPlayer(busy.video, { label, warm: true });
  const second = page.createMediaPlayer(waitingFrame.video, { label, warm: true });
  first.show({ sources: [{ src: `${LOOP}?busy`, type: 'video/webm' }] });
  second.show({ sources: [{ src: `${LOOP}?second`, type: 'video/webm' }] });
  dom.intersect(busy.video, 0.9, true);
  dom.intersect(waitingFrame.video, 0.9, true);
  assert.equal(waitingFrame.video.src, '', 'queued behind the first transfer');
  second.toggle(); // pause: the viewer's choice
  second.toggle(); // and play again
  assert.equal(waitingFrame.video.src, `${LOOP}?second`, 'the viewer\'s play starts at once');
  for (const player of [...players, first, second]) player.dispose();
  assert.equal(page.mediaDownloading(), false, 'disposed players hold no transfer');
}

// 5. Two playing on a desktop, one on a phone.
{
  const frames = [frameWith(), frameWith(), frameWith()];
  const players = frames.map(({ video }, index) => {
    const player = page.createMediaPlayer(video, { label });
    player.show({ sources: [{ src: `${LOOP}?cap${index}`, type: 'video/webm' }, { src: `${PHONE}?cap${index}`, type: 'video/mp4', rung: 'phone' }] });
    return player;
  });
  for (const { video } of frames) {
    dom.intersect(video, 0.9, true);
    video.dispatchEvent({ type: 'canplaythrough' });
  }
  assert.deepEqual(frames.map(({ video }) => video.paused), [false, false, true], 'a desktop plays two: the first two on, a third of their size waits');
  players[2].toggle(); // the viewer plays the waiting frame
  assert.deepEqual(frames.map(({ video }) => video.paused), [true, false, false], "the viewer's play never waits: the frame playing longest stands down");
  players[2].toggle(); // and pauses it
  assert.deepEqual(frames.map(({ video }) => video.paused), [false, false, true], 'its pause hands the slot back');
  dom.setQuery(page.MEDIA_POLICY.phoneQuery, true);
  assert.equal(page.maxPlaying(), 1);
  frames[0].video.dispatchEvent({ type: 'canplaythrough' });
  for (const player of players) player.sync();
  for (const { video } of frames) video.dispatchEvent({ type: 'canplaythrough' });
  assert.equal(frames.filter(({ video }) => !video.paused).length, 1, 'a phone plays one');
  assert.ok(frames.some(({ video }) => !video.paused && video.src.startsWith(PHONE)), 'its phone rung');
  dom.setQuery(page.MEDIA_POLICY.phoneQuery, false);
  for (const player of players) player.dispose();
}

// 5b. When the slots are full a newcomer waits unless it shows a quarter more than the least-shown frame that has played
// a second; a frame that just came on keeps its slot through the page's settling (no film comes on and stands down within
// a second); a stood-down frame that comes clearly further on screen takes a slot back on the next scroll.
{
  globalThis.innerWidth = 1280;
  const realNow = performance.now;
  let clock = 0;
  performance.now = () => clock;
  const rects = [{ top: 0, height: 360 }, { top: 380, height: 360 }, { top: 700, height: 360 }];
  const frames = rects.map((rect) => frameWith(rect));
  const players = frames.map(({ video }, index) => {
    const player = page.createMediaPlayer(video, { label });
    player.show({ sources: [{ src: `${LOOP}?slot${index}`, type: 'video/webm' }] });
    return player;
  });
  for (const { video } of frames) {
    dom.intersect(video, 0.9, true);
    video.dispatchEvent({ type: 'canplaythrough' });
  }
  assert.deepEqual(frames.map(({ video }) => video.paused), [false, false, true],
    'the third frame, 100 px on screen, waits: the first two, fully on screen, play');
  assert.equal(frames[2].frame.children[1].dataset.state, 'paused', 'the waiting frame offers play');
  // a scroll a while later: the first frame leaves by the top (40 px left), the third comes fully on
  clock = 2000;
  rects[0].top = -320;
  rects[1].top = 60;
  rects[2].top = 420;
  dom.intersect(frames[2].video, 1);
  frames[2].video.dispatchEvent({ type: 'canplaythrough' });
  assert.deepEqual(frames.map(({ video }) => video.paused), [true, false, false],
    'the frame scrolled to takes the slot of the one leaving');
  // a near tie trades nothing: the first comes back to 300 px against the third's 360
  clock = 4000;
  rects[0].top = -60;
  dom.intersect(frames[0].video, 0.8);
  assert.deepEqual(frames.map(({ video }) => video.paused), [true, false, false], 'within a quarter, the playing frame keeps its slot');
  for (const player of players) player.dispose();

  // a phone's one slot: the lead comes on; a larger frame below claims 70 ms later and waits (the lead just came on)
  dom.setQuery(page.MEDIA_POLICY.phoneQuery, true);
  clock = 10_000;
  const lead = { top: 240, height: 170 }, below = { top: 480, height: 300 };
  const pair = [lead, below].map((rect) => frameWith(rect));
  const pairPlayers = pair.map(({ video }, index) => {
    const player = page.createMediaPlayer(video, { label });
    player.show({ sources: [{ src: `${PHONE}?pair${index}`, type: 'video/mp4', rung: 'phone' }] });
    return player;
  });
  dom.intersect(pair[0].video, 1, true);
  pair[0].video.dispatchEvent({ type: 'canplaythrough' });
  clock += 70;
  dom.intersect(pair[1].video, 1, true);
  pair[1].video.dispatchEvent({ type: 'canplaythrough' });
  assert.deepEqual(pair.map(({ video }) => video.paused), [false, true], 'the frame just on keeps the phone\'s one slot');
  // nothing moves until the viewer scrolls: then the larger frame takes the slot
  clock += 2000;
  dom.intersect(pair[1].video, 0.95);
  pair[1].video.dispatchEvent({ type: 'canplaythrough' });
  assert.deepEqual(pair.map(({ video }) => video.paused), [true, false], 'on the next scroll the frame further on screen plays');
  for (const player of pairPlayers) player.dispose();
  // a frame under the page's fixed bar (the root's scroll padding) counts as off screen: the lead keeps the slot from a
  // wider frame whose foot the phone's Play bar covers
  dom.document.documentElement ??= {};
  globalThis.getComputedStyle = () => ({ scrollPaddingTop: '72px', scrollPaddingBottom: '82px' });
  clock += 5000;
  const top = { top: 200, height: 340 }, under = { top: 600, height: 400 };
  const covered = [top, under].map((rect) => frameWith(rect));
  covered[0].video.getBoundingClientRect = () => ({ left: 24, right: 624, width: 600, bottom: top.top + top.height, ...top });
  covered[1].video.getBoundingClientRect = () => ({ left: 24, right: 720, width: 696, bottom: under.top + under.height, ...under });
  globalThis.innerHeight = 1000;
  const coveredPlayers = covered.map(({ video }, index) => {
    const player = page.createMediaPlayer(video, { label });
    player.show({ sources: [{ src: `${PHONE}?covered${index}`, type: 'video/mp4', rung: 'phone' }] });
    return player;
  });
  dom.intersect(covered[0].video, 1, true);
  covered[0].video.dispatchEvent({ type: 'canplaythrough' });
  clock += 2000;
  dom.intersect(covered[1].video, 1, true);
  covered[1].video.dispatchEvent({ type: 'canplaythrough' });
  // on screen 696 x 400 = 278,400 px², clear of the bar 696 x 318 = 221,328: under a quarter more than the lead's 204,000
  assert.deepEqual(covered.map(({ video }) => video.paused), [false, true], 'the part under the fixed bar does not count');
  for (const player of coveredPlayers) player.dispose();
  delete globalThis.getComputedStyle;
  globalThis.innerHeight = 800;
  dom.setQuery(page.MEDIA_POLICY.phoneQuery, false);
  performance.now = realNow;
  delete globalThis.innerWidth;
}

// 6. Hover players start 150 ms after a pointer or focus arrives; a sweep or a touch starts nothing.
{
  const { frame, video } = frameWith();
  const player = page.createMediaPlayer(video, { label, mode: 'hover', frame });
  player.show({ sources: [{ src: `${LOOP}?hover`, type: 'video/webm' }] });
  dom.intersect(frame, 0.9, true);
  assert.equal(video.src, '', 'a hover player waits for the pointer');
  frame.dispatchEvent({ type: 'pointerenter', pointerType: 'mouse' });
  const hover = [...dom.state.timers.entries()].find(([, timer]) => timer.delay === 150);
  assert.ok(hover, 'the pointer arms a 150 ms delay');
  frame.dispatchEvent({ type: 'pointerleave' });
  assert.ok(!dom.state.timers.has(hover[0]), 'a sweep past cancels it');
  assert.equal(video.src, '');
  frame.dispatchEvent({ type: 'pointerenter', pointerType: 'touch' });
  assert.equal([...dom.state.timers.values()].some((timer) => timer.delay === 150), false, 'a touch is not a hover');
  frame.dispatchEvent({ type: 'focusin' });
  dom.runTimers();
  assert.equal(video.src, `${LOOP}?hover`, 'focus plays it after the delay');
  assert.equal(video.paused, false);
  frame.dispatchEvent({ type: 'focusout' });
  assert.equal(video.paused, true, 'losing focus pauses it');
  player.dispose();
}

// 7. Reduced motion and data saving name no source by themselves (zero video bytes); the play control waits.
for (const [labelText, enter, leave] of [
  ['reduced motion', () => dom.setReducedMotion(true), () => dom.setReducedMotion(false)],
  ['Save-Data', () => setNavigator({ saveData: true }), () => setNavigator()],
  ['a 3g link', () => setNavigator({ effectiveType: '3g' }), () => setNavigator()],
  ['a 2g link', () => setNavigator({ effectiveType: '2g' }), () => setNavigator()],
]) {
  enter();
  assert.equal(page.autoplayAllowed(), false, `${labelText}: nothing starts by itself`);
  const { frame, video } = frameWith();
  const player = page.createMediaPlayer(video, { label, warm: true });
  player.show({ sources: [{ src: `${LOOP}?${labelText}`, type: 'video/webm' }], poster: POSTER, seconds: 6 });
  dom.intersect(video, 0, true);
  dom.intersect(video, 1);
  assert.equal(video.src, '', `${labelText}: no video source, warm or visible`);
  assert.equal(video.poster, POSTER, `${labelText}: the poster`);
  const control = frame.children[1];
  assert.equal(control.hidden, false, `${labelText}: a play control`);
  assert.equal(control.dataset.state, 'paused');
  control.click();
  assert.equal(video.src, `${LOOP}?${labelText}`, `${labelText}: the viewer's play loads it`);
  player.dispose();
  leave();
}
assert.equal(page.autoplayAllowed(), true);
assert.equal(page.dataSaver(), false);

// 8. A video with its own controls names its source without a transfer, and the viewer's play and pause steer it.
{
  dom.setReducedMotion(true);
  const { video } = frameWith();
  const player = page.createMediaPlayer(video, { label, native: true, control: 'none' });
  player.show({ sources: [{ src: `${LOOP}?native`, type: 'video/webm' }] });
  dom.intersect(video, 1, true);
  assert.equal(video.src, `${LOOP}?native`, 'its own play button has a source to start');
  assert.equal(video.preload, 'none', 'and nothing transfers before it');
  assert.equal(video.paused, true);
  video.paused = false;
  video.dispatchEvent({ type: 'play' }); // the viewer pressed the element's play
  dom.intersect(video, 0.05);
  assert.equal(video.paused, true, 'off screen it pauses like any loop');
  dom.intersect(video, 0.9);
  assert.equal(video.paused, false, 'and the viewer\'s play resumes it on screen');
  video.dispatchEvent({ type: 'pause' }); // the viewer paused it
  player.sync();
  assert.equal(video.paused, true, 'the viewer\'s pause holds');
  player.dispose();
  dom.setReducedMotion(false);
}

// 9. The Play hand-off: every transfer stops before the navigation; nothing restarts; no entry prefetch after it.
{
  const handoff = await freshModule();
  const head = dom.document.createElement('head');
  dom.document.head = head;
  dom.document.querySelectorAll = (selector) => head.querySelectorAll(selector);
  const pageRoot = dom.document.createElement('main');
  const { frame, video } = frameWith();
  pageRoot.append(frame);
  const player = handoff.createMediaPlayer(video, { label, warm: true });
  player.show({ sources: [{ src: `${LOOP}?handoff`, type: 'video/webm' }] });
  dom.intersect(video, 0.9, true);
  assert.equal(video.src, `${LOOP}?handoff`);
  assert.equal(handoff.prefetchGameEntry('/assets/main-abc.js'), false, 'no entry prefetch while a video downloads');
  const trailer = dom.document.createElement('video');
  const trailerSource = dom.document.createElement('source');
  trailerSource.setAttribute('src', '/media/site50-r14/films/trailer.mp4');
  trailer.append(trailerSource);
  const loading = dom.document.createElement('img');
  loading.setAttribute('src', '/media/site50-r14/stills/s05-barn-advance.webp');
  loading.setAttribute('srcset', '/media/site50-r14/stills/s05-barn-advance-thumb.webp 640w');
  const loaded = dom.document.createElement('img');
  loaded.setAttribute('src', '/media/site50-r14/stills/s07-lake-shellfire.webp');
  loaded.complete = true;
  pageRoot.append(trailer, loading, loaded);
  const loadsBefore = trailer.loads;
  const stopped = handoff.abortPageMedia(pageRoot);
  assert.equal(video.src, '', 'the player\'s transfer is cancelled');
  assert.equal(trailerSource.getAttribute('src'), null, 'any other video\'s source is removed');
  assert.equal(trailer.loads, loadsBefore + 1, 'and load() cancels its transfer');
  assert.equal(loading.getAttribute('src'), null, 'a still that is still loading stops');
  assert.equal(loading.getAttribute('srcset'), null);
  assert.equal(loaded.getAttribute('src'), '/media/site50-r14/stills/s07-lake-shellfire.webp', 'a finished still stays');
  assert.equal(stopped, 2, 'the trailer and the loading still (the player halted itself)');
  assert.equal(handoff.mediaDownloading(), false);
  player.sync();
  assert.equal(video.src, '', 'nothing restarts after the hand-off');
  assert.equal(handoff.prefetchGameEntry('/assets/main-abc.js'), false, 'and nothing is prefetched');
  player.dispose();
  // before any hand-off: the entry is prefetched once, never under data saving
  const fresh2 = await freshModule();
  setNavigator({ saveData: true });
  assert.equal(fresh2.prefetchGameEntry('/assets/main-abc.js'), false, 'data saving prefetches nothing');
  setNavigator();
  assert.equal(fresh2.prefetchGameEntry('/assets/main-abc.js'), true);
  assert.equal(fresh2.prefetchGameEntry('/assets/main-abc.js'), true);
  const links = head.querySelectorAll('link');
  assert.equal(links.length, 1, 'one prefetch link');
  assert.equal(links[0].getAttribute('rel'), 'prefetch');
  assert.equal(links[0].getAttribute('href'), '/assets/main-abc.js');
}

// 10. The page markup: the ladder in order, and the earlier home.html form read the same way.
{
  const current = dom.document.createElement('video');
  current.innerHTML = `<source data-src="${AV1.src}" type='${AV1.type}'><source data-src="${LOOP}" type="video/webm"><source data-src="${PHONE}" type="video/mp4" data-rung="phone">`;
  assert.deepEqual(page.ladderFromMarkup(current).map((s) => [s.src, s.rung ?? '']), [[AV1.src, ''], [LOOP, ''], [PHONE, 'phone']]);
  const earlier = dom.document.createElement('video');
  earlier.innerHTML = `<source data-src="${LOOP}" data-type="video/webm" data-fallback-src="${H264.src}" data-fallback-type="video/mp4" data-mobile-src="${PHONE}" data-mobile-type="video/mp4">`;
  assert.deepEqual(page.ladderFromMarkup(earlier), [
    { src: LOOP, type: 'video/webm' }, { src: H264.src, type: 'video/mp4' }, { src: PHONE, type: 'video/mp4', rung: 'phone' },
  ], 'the earlier form: the file, its H.264 twin, then the phone rung');
}

// 11. Bundle isolation: neither module enters the game entry's boot graph, and the player imports nothing (so the
// fleet takes' lazy chunk, which the Garage reaches through import(), keeps its dependency list).
const boot = staticImportClosure('src/main.ts', { root: ROOT });
for (const file of ['src/presentation/mediaPlayer.ts', 'src/presentation/responsivePicture.ts', 'src/ui/fleetTakes.ts']) {
  assert.ok(!boot.has(file), `${file} is in the game's boot graph: ${importChain(boot, file)}`);
}
for (const file of ['src/presentation/mediaPlayer.ts', 'src/presentation/responsivePicture.ts']) {
  assert.deepEqual(runtimeImportSpecifiers(readFileSync(join(ROOT, file), 'utf8'), file), [], `${file} imports nothing`);
}
for (const entry of ['src/presentation/publicPages.ts', 'src/presentation/publicNav.ts']) {
  const closure = staticImportClosure(entry, { root: ROOT });
  assert.ok(!closure.has('src/presentation/mediaPlayer.ts'), `${entry} loads the player beside the page, never in its first bytes`);
}
// the control is the kit's square icon button on an opaque plate: no disc, no see-through or blurred fill, and the
// topic hero sets it one inset inside its top and right edges at every width
{
  const css = readFileSync(join(ROOT, 'src/presentation/mediaPlayer.css'), 'utf8');
  assert.doesNotMatch(css, /border-radius:\s*50%/, 'the control is square, never a disc');
  assert.doesNotMatch(css, /backdrop-filter|var\(--scrim\)|var\(--btn-media-fill\)/, 'its plate is opaque, never a scrim or blur');
  assert.match(css, /\.cot-c-btn\.cot-media-toggle\{[^}]*background:var\(--surface-raised\)/, 'it stands on the raised surface');
  const docsCss = readFileSync(join(ROOT, 'src/docs/docs.css'), 'utf8');
  const placements = [...docsCss.matchAll(/\.dm-banner>\.cot-media-toggle\{([^}]*)\}/g)].map(([, body]) => body);
  assert.deepEqual(placements, ['z-index:var(--docs-banner-z);top:var(--s4);right:var(--s4);bottom:auto'],
    'the topic hero places its control once, 16 px inside its top and right edges, at every width');
}

uninstall();
if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
delete globalThis.innerHeight;
console.log('mediaPlayer.selftest: SPEC 8.3 numbers, the AV1/VP9/H.264 ladder, near-margin warm, 50/10 visibility, '
  + '10 s release, one transfer at a time nearest the centre first, 2 desktop / 1 phone, 150 ms hover, the pause '
  + 'control, zero sources under reduced motion and data saving, native controls, the Play hand-off and boot isolation passed');
