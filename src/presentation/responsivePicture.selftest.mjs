// responsivePicture.selftest.mjs — one way to put a still on a public page (src/presentation/responsivePicture.ts;
// brand-ui SPEC 8.3, BUI-F7): the collections' rungs, srcset + sizes, an explicit size, the LQIP/tone backdrop and its
// cap, the phone art direction, and data saving's 640 rung (markup, elements and pages already written). Every rung the
// conventions name for a page's still is held to the disk by tools/media-fallback.selftest.mjs.
import assert from 'node:assert/strict';
import { createFakeDom } from '../ui/fleetTakes.test-support.mjs';
import {
  DATA_SAVER_WIDTH, PHONE_MEDIA, STILL_RUNG_WIDTHS, applyDataSaverStills, createPicture, dataSaverCandidate, dataSaverRung,
  dataSaverSrc, pictureMarkup, srcsetFor, stillDataSaver, stillRungs,
} from './responsivePicture.ts';
import { MEDIA_POLICY, dataSaver } from './mediaPlayer.ts';

assert.deepEqual([...STILL_RUNG_WIDTHS], [640, 1280, 1920, 2560], 'the SPEC\'s still rungs');
assert.equal(DATA_SAVER_WIDTH, 640);
assert.equal(PHONE_MEDIA, MEDIA_POLICY.phoneQuery, 'one phone layout for stills and videos');

// The collections' rungs.
const S05 = '/media/site50-r14/stills/s05-barn-advance.webp';
assert.deepEqual(stillRungs(S05), [{ src: '/media/site50-r14/stills/s05-barn-advance-thumb.webp', width: 640 }, { src: S05, width: 1920 }]);
assert.deepEqual(stillRungs('/media/site50-r14/stills/s05-barn-advance-thumb.webp', 640).length, 1, 'a thumb is its own smallest rung');
assert.deepEqual(stillRungs('/media/site50-r14/frames/b01-pan-runway.webp', 2400).map((r) => r.width), [640, 2400]);
assert.deepEqual(stillRungs('/media/site50-r14/frames/sheet-2.webp', 2400).length, 1, 'the contact sheets ship one size');
assert.deepEqual(stillRungs('/media/site50-r14/home/modes/ac130.webp').map((r) => r.src),
  ['/media/site50-r14/home/modes/ac130-640.webp', '/media/site50-r14/home/modes/ac130.webp']);
assert.deepEqual(stillRungs('/maps/autumn.webp', 3840), [{ src: '/maps/cards/autumn.webp', width: 1280 }, { src: '/maps/autumn.webp', width: 3840 }],
  'map art and its 1280 card');
assert.deepEqual(stillRungs('/media/showcase-r2/15_studio_workspace.webp'), [{ src: '/media/showcase-r2/15_studio_workspace.webp', width: 1920 }],
  'a still outside the conventions is one file');
assert.equal(srcsetFor(stillRungs(S05)), '/media/site50-r14/stills/s05-barn-advance-thumb.webp 640w, /media/site50-r14/stills/s05-barn-advance.webp 1920w');
assert.equal(dataSaverRung(stillRungs('/maps/autumn.webp', 3840)).width, 1280, 'no rung at 640: the smallest there is');
assert.equal(dataSaverSrc(S05), '/media/site50-r14/stills/s05-barn-advance-thumb.webp');
assert.equal(dataSaverCandidate('/a-640.webp 640w, /a.webp 1920w, /a-2560.webp 2560w'), '/a-640.webp');
assert.equal(dataSaverCandidate('/a.webp 1920w, /a-1280.webp 1280w'), '/a-1280.webp');
assert.equal(dataSaverCandidate('/a.webp'), null, 'a density-less srcset is left alone');

// Markup: size, lazy unless the LCP, escaped text, srcset + sizes, the backdrop, the phone picture, data saving.
const markup = pictureMarkup({ src: S05, width: 1920, height: 1080, alt: 'A "quoted" <T-14>', sizes: '760px' }, false);
assert.equal(markup, `<img src="${S05}" srcset="${srcsetFor(stillRungs(S05))}" sizes="760px" width="1920" height="1080" `
  + 'alt="A &quot;quoted&quot; &lt;T-14&gt;" decoding="async" loading="lazy">');
const lcp = pictureMarkup({ src: S05, width: 1920, height: 1080, alt: '', eager: true, tone: '#0b0e11',
  lqip: 'data:image/webp;base64,UklGRg==' }, false);
assert.match(lcp, /fetchpriority="high"/);
assert.doesNotMatch(lcp, /loading=/, 'the LCP is never lazy');
assert.match(lcp, /style="background:url\(&quot;data:image\/webp;base64,UklGRg==&quot;\) center\/cover no-repeat #0b0e11"/,
  'the LQIP and the tone sit behind the picture');
assert.throws(() => pictureMarkup({ src: S05, width: 1920, height: 1080, alt: '', lqip: `data:image/webp;base64,${'A'.repeat(1600)}` }, false),
  /over 1024 B/, 'an LQIP over 1 KB is refused');
const saving = pictureMarkup({ src: S05, width: 1920, height: 1080, alt: 'x' }, true);
assert.match(saving, /src="\/media\/site50-r14\/stills\/s05-barn-advance-thumb\.webp"/, 'data saving: the 640 rung');
assert.doesNotMatch(saving, /srcset/, 'and nothing larger to choose');
const phone = { src: '/media/site50-r14/stills/s05-barn-advance-thumb.webp', width: 640 };
const poster = pictureMarkup({ src: '/media/site50-r14/loops/s05-barn-advance.jpg', rungs: [{ src: '/media/site50-r14/loops/s05-barn-advance.jpg', width: 1920 }],
  width: 1920, height: 1080, alt: 'x', eager: true, phone }, false);
assert.match(poster, /^<picture><source media="\(max-width: 767px\)" srcset="\/media\/site50-r14\/stills\/s05-barn-advance-thumb\.webp"><img /,
  'a phone gets its own still whatever its pixel density');
assert.ok(!pictureMarkup({ src: S05, width: 1920, height: 1080, alt: '', phone }, true).startsWith('<picture'), 'data saving needs no phone source');

// Elements and pages already written.
const dom = createFakeDom();
const uninstall = dom.install();
const element = createPicture({ src: S05, width: 1920, height: 1080, alt: 'x', phone }, false);
assert.equal(element.localName, 'picture');
assert.equal(element.children[0].getAttribute('media'), PHONE_MEDIA);
assert.equal(element.children[1].getAttribute('width'), '1920');
const pageRoot = dom.document.createElement('main');
pageRoot.innerHTML = `<img src="${S05}" srcset="${srcsetFor(stillRungs(S05))}" sizes="50vw" loading="lazy">`
  + `<img src="/maps/autumn.webp" srcset="/maps/cards/autumn.webp 1280w, /maps/autumn.webp 3840w" loading="lazy">`
  + `<img src="${S05}" srcset="${srcsetFor(stillRungs(S05))}" fetchpriority="high">`
  + `<img src="/media/site50-r14/stills/s24-ice-duel.webp" loading="lazy">`
  + `<img src="/media/showcase-r2/15_studio_workspace.webp" loading="lazy">`;
assert.equal(applyDataSaverStills(pageRoot, false), 0, 'without data saving the page is untouched');
assert.equal(applyDataSaverStills(pageRoot, true), 3, 'data saving drops every lazy picture to its smallest rung');
const [lazy, map, eager, plain, single] = pageRoot.querySelectorAll('img');
assert.equal(plain.getAttribute('src'), '/media/site50-r14/stills/s24-ice-duel-thumb.webp', 'a lazy still without a srcset takes its collection\'s 640 rung');
assert.equal(single.getAttribute('src'), '/media/showcase-r2/15_studio_workspace.webp', 'a still with one file keeps it');
assert.equal(lazy.getAttribute('src'), '/media/site50-r14/stills/s05-barn-advance-thumb.webp');
assert.equal(lazy.getAttribute('srcset'), null);
assert.equal(map.getAttribute('src'), '/maps/cards/autumn.webp');
assert.ok(eager.getAttribute('srcset'), 'the eager LCP already loaded before any script');

// Data saving reads the same signals as the player (Save-Data; slow-2g, 2g, 3g).
const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
for (const connection of [{}, { saveData: true }, { effectiveType: 'slow-2g' }, { effectiveType: '2g' }, { effectiveType: '3g' }, { effectiveType: '4g' }]) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { connection } });
  assert.equal(stillDataSaver(), dataSaver(), `stills and videos agree on ${JSON.stringify(connection)}`);
}
if (real) Object.defineProperty(globalThis, 'navigator', real);
uninstall();

console.log('responsivePicture.selftest: rungs by collection, srcset + sizes, explicit size, LQIP and tone, the phone '
  + 'still, and data saving\'s 640 rung on markup, elements and written pages passed');
