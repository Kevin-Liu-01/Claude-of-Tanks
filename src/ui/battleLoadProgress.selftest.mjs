import assert from 'node:assert/strict';
import { createBattleLoadScreen, primeMapLqip } from './battleLoad.ts';
import { MAP_ART_TONES, MAP_ART_TONE_DEFAULT } from './mapArtTones.ts';
import { MAP_LQIP } from './mapLqip.ts';
import { t } from './i18n.ts';

// Exercise the real screen adapter; geometry reads and layout-style writes
// fail immediately, instead of using a second copy of its progress policy.
const mutations = [];
const elements = [];
const selectors = new Map();
function element(name) {
  const classes = new Set();
  const attributes = new Map();
  let text = '';
  const result = {
    name, id: '', className: '', innerHTML: '', children: [], dataset: {},
    // (an image already decoded: the plan's reveal, components/reveal.ts, stands it at once)
    complete: true, naturalWidth: 1,
    get textContent() { return text; },
    set textContent(value) { mutations.push([name, 'text', value]); text = value; this.children.length = 0; },
    get offsetWidth() { throw new Error('loading progress must not force layout'); },
    getBoundingClientRect() { throw new Error('loading progress must not measure layout'); },
    style: new Proxy({ setProperty(key, value) { this[key] = value; } }, { set(target, key, value) {
      assert.notEqual(key, 'width', 'loading fill must not animate layout');
      mutations.push([name, 'style', key, value]); target[key] = value; return true;
    } }),
    setAttribute(key, value) { mutations.push([name, 'attribute', key, value]); attributes.set(key, value); },
    getAttribute(key) { return attributes.get(key); },
    removeAttribute(key) { mutations.push([name, 'remove', key]); attributes.delete(key); delete this[key]; },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    querySelector(selector) {
      if (!selectors.has(selector)) selectors.set(selector, element(selector));
      return selectors.get(selector);
    },
    classList: {
      add(...values) { values.forEach(value => classes.add(value)); },
      remove(...values) { values.forEach(value => classes.delete(value)); },
      contains(value) { return classes.has(value); },
    },
  };
  elements.push(result);
  return result;
}
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const priorTimeout = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
const priorVideo = Object.getOwnPropertyDescriptor(globalThis, 'HTMLVideoElement');
const timers = [];
// (the plan's reveal asks whether its picture is a film)
Object.defineProperty(globalThis, 'HTMLVideoElement', { configurable: true, value: class HTMLVideoElement {} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  head: element('head'), body: element('body'),
  createElement: name => element(name),
  getElementById: id => elements.find(item => item.id === id) ?? null,
} });
Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: callback => {
  timers.push(callback); return timers.length;
} });
try {
  const screen = createBattleLoadScreen();
  const info = { mapName: 'Verdant', mode: 'Prior battle mode', thumb: '/verdant.webp', allies: [], enemies: [] };
  screen.showPending();
  assert.equal(screen.visible, true, 'pending cold acquisition shows the canonical loader immediately');
  assert.equal(screen.covering, true);
  assert.equal(screen.root.classList.contains('on'), true);
  assert.equal(selectors.get('.mapname').textContent, t('battleLoad.fallbackMapName'));
  assert.equal(selectors.get('.kicker').textContent, t('battleLoad.kicker'));
  const pendingRoot = screen.root;
  screen.show(info);
  assert.ok(screen.root === pendingRoot, 'the loaded transaction enriches the same already-opaque surface');
  assert.equal(screen.root.classList.contains('leaving'), false);
  assert.equal(selectors.get('.mapname').textContent, 'Verdant');
  // loading states (2026-10-27): a labelled region whose stage line and countdown speak, never the whole card at once
  assert.equal(screen.root.getAttribute('role'), 'region', 'the card is a labelled region, not one status over every row');
  assert.match(screen.root.innerHTML, /<span class="st" role="status">/, 'its stage line is the status');
  assert.match(screen.root.innerHTML, /<div class="count" aria-live="polite">/, 'and its countdown speaks');
  assert.doesNotMatch(screen.root.innerHTML, /class="foot" aria-live/, 'the percent is the progressbar\'s value, never read aloud');
  assert.equal(selectors.get('.teams').getAttribute('aria-busy'), 'true', 'the sheets are busy while they fill');
  assert.ok(screen.root.getAttribute('aria-busy') === undefined, 'the card is never busy: that would hold its stage line back');
  // the direction's five steps (10-battle-load .prog .reg): each fills its fifth of the load
  const steps = [1, 2, 3, 4, 5].map((n) => selectors.get(`.fbar i:nth-child(${n}) b`));
  const fills = () => steps.map((step) => step.style.transform).join(' ');
  const scales = (...shares) => shares.map((share) => `scaleX(${share.toFixed(3)})`).join(' ');
  const pct = selectors.get('.fpct');
  const progress = selectors.get('.fbar');
  const stage = selectors.get('.fstage .st');
  assert.equal(screen.visible, true);
  assert.equal(screen.covering, true);
  assert.equal(fills(), scales(0, 0, 0, 0, 0));
  screen.progress(0.25, 'Building terrain meshes');
  assert.equal(fills(), scales(1, 0.25, 0, 0, 0));
  assert.equal(pct.textContent, '25%');
  assert.equal(progress.getAttribute('aria-valuenow'), '25');
  assert.equal(stage.textContent, t('battleLoad.stage.buildingTerrain'));
  mutations.length = 0;
  for (let index = 0; index < 100; index++) screen.progress(0.25001, 'Building terrain meshes');
  assert.deepEqual(mutations, [], 'identical displayed progress does not churn styles or the live region');
  screen.progress(0.251);
  assert.deepEqual(mutations, [['.fbar i:nth-child(2) b', 'style', 'transform', 'scaleX(0.255)']],
    'sub-percent progress moves the step it is in without repeating percentage announcements');
  assert.equal(stage.textContent, t('battleLoad.stage.buildingTerrain'));
  screen.progress(0.251, 'Custom loading stage');
  assert.equal(stage.textContent, 'Custom loading stage');
  screen.rosters([], []);
  assert.equal(fills(), scales(1, 0.255, 0, 0, 0), 'roster refresh does not reset progress');
  for (const [fraction, share, percent] of [[-5, 0, '0'], [2, 1, '100'],
    [NaN, 0, '0'], [Infinity, 1, '100'], [-Infinity, 0, '0']]) {
    screen.progress(fraction);
    assert.equal(fills(), scales(share, share, share, share, share));
    assert.equal(progress.getAttribute('aria-valuenow'), percent);
  }
  screen.countdown(3);
  assert.equal(selectors.get('.teams').getAttribute('aria-busy'), undefined, 'loaded: the sheets are whole once the countdown runs');
  screen.show(info);
  assert.equal(selectors.get('.teams').getAttribute('aria-busy'), 'true', 'a restaged load is busy again');
  screen.progress(1, 'Ready');
  const leaving = screen.hide();
  assert.equal(screen.visible, false);
  assert.equal(screen.covering, true, 'entry remains covered throughout the exit fade');
  screen.showPending();
  timers.shift()();
  await leaving;
  assert.equal(screen.covering, true, 'an old fade cannot uncover a newly restaged load');
  assert.equal(screen.root.classList.contains('on'), true);
  assert.equal(selectors.get('.kicker').textContent, t('battleLoad.kicker'), 'pending entry clears a prior mode label');
  assert.equal(selectors.get('.art-img').style.backgroundImage, '', 'pending entry clears prior battlefield artwork');
  assert.equal(selectors.get('.art-img').classList.contains('ready'), false);
  assert.equal(selectors.get('.art').className, 'art none', 'a pending entry keeps the neutral gradient under the art');
  const gradientOf = (tones) => `linear-gradient(180deg,${tones[0]},${tones[1]} 48%,${tones[2]})`;
  assert.equal(selectors.get('.art').style.backgroundImage, gradientOf(MAP_ART_TONE_DEFAULT),
    'an unknown battlefield opens on every map\'s mean tones, not near-black');
  assert.equal(fills(), scales(0, 0, 0, 0, 0), 'a new load resets the previous completed fill');
  const hidden = screen.hide();
  timers.shift()();
  await hidden;
  assert.equal(screen.covering, false);

  // 2026-10-12 (the perf stream; owner: "loading into some maps still shows a black screen at first"): the screen shows the
  // map's gradient at once and its art only once decoded — the card first while the 1.5 MB hero is still on its way, the
  // hero over it — never an undecoded background over a near-black surface; a later show supersedes a load in flight.
  {
    const loads = [];
    globalThis.Image = class { constructor() { this.decoding = ''; this.fetchPriority = ''; }
      set src(url) { loads.push({ url, image: this }); } decode() { return Promise.resolve(); } };
    const land = async (url) => { const at = loads.findIndex((l) => l.url === url); assert.ok(at >= 0, `${url} requested`);
      const [{ image }] = loads.splice(at, 1); await image.onload(); for (let i = 0; i < 6; i++) await Promise.resolve(); };
    const art = selectors.get('.art'), img = selectors.get('.art-img');
    screen.show({ mapName: 'Verdant', thumb: '/maps/verdant.webp', biome: 'verdant', allies: [], enemies: [] });
    assert.equal(art.className, 'art verdant', 'the map\'s gradient is up with the screen');
    assert.ok(art.style.backgroundImage.endsWith(gradientOf(MAP_ART_TONES.verdant)), 'from Verdant\'s own art tones');
    assert.equal(img.classList.contains('ready'), false, 'no art before it is decoded');
    assert.deepEqual(loads.map((l) => l.url).sort(), ['/maps/cards/verdant.webp', '/maps/thumbs/verdant.webp', '/maps/verdant.webp'],
      'the hero, the card and the picker thumb are all asked for at once');
    await land('/maps/thumbs/verdant.webp');
    assert.equal(img.style.backgroundImage, 'url(/maps/thumbs/verdant.webp)');
    assert.equal(img.classList.contains('ready'), true, 'the picker thumb (cached by the Garage) covers the gradient first');
    await land('/maps/cards/verdant.webp');
    assert.equal(img.style.backgroundImage, 'url(/maps/cards/verdant.webp)', 'the card replaces the thumb');
    await land('/maps/verdant.webp');
    assert.equal(img.style.backgroundImage, 'url(/maps/verdant.webp)', 'the hero replaces the card once decoded');
    // a sharper image is never replaced by a softer one that arrives later
    screen.show({ mapName: 'Monsoon', thumb: '/maps/monsoon.webp', biome: 'monsoon', allies: [], enemies: [] });
    await land('/maps/monsoon.webp');
    await land('/maps/thumbs/monsoon.webp');
    await land('/maps/cards/monsoon.webp');
    assert.equal(img.style.backgroundImage, 'url(/maps/monsoon.webp)');
    // a decoded hero shows at once on the next entry
    screen.show({ mapName: 'Verdant', thumb: '/maps/verdant.webp', biome: 'verdant', allies: [], enemies: [] });
    assert.equal(img.style.backgroundImage, 'url(/maps/verdant.webp)');
    assert.equal(loads.length, 0);
    // a superseded load never paints over the next battlefield
    screen.show({ mapName: 'Steinburg', thumb: '/maps/urban.webp', biome: 'urban', allies: [], enemies: [] });
    screen.show({ mapName: 'Ironworks', thumb: '/maps/foundry.webp', biome: 'foundry', allies: [], enemies: [] });
    await land('/maps/urban.webp');
    await land('/maps/thumbs/urban.webp');
    assert.equal(img.style.backgroundImage, '', 'Steinburg\'s late hero stays off Ironworks\' screen');
    assert.equal(art.className, 'art foundry');
    // 2026-10-13: with the lazy placeholder chunk resident (the Garage loads it in idle time), the first frame carries the
    // map's own blurred picture over its tones, the pending cover included; a random or unknown map keeps the mean tones
    await primeMapLqip();
    screen.show({ mapName: 'Monsoon', thumb: '/maps/monsoon.webp', biome: 'monsoon', allies: [], enemies: [] });
    assert.equal(art.style.backgroundImage, `url(${MAP_LQIP.monsoon}),${gradientOf(MAP_ART_TONES.monsoon)}`);
    screen.showPending('railyard');
    assert.equal(art.style.backgroundImage, `url(${MAP_LQIP.railyard}),${gradientOf(MAP_ART_TONES.railyard)}`,
      'the pending cover of a chosen battlefield is already that battlefield');
    assert.equal(img.classList.contains('ready'), false);
    screen.showPending('random');
    assert.equal(art.style.backgroundImage, gradientOf(MAP_ART_TONE_DEFAULT));
    screen.showPending(null);
    assert.equal(art.style.backgroundImage, gradientOf(MAP_ART_TONE_DEFAULT));
    // 2026-10-13 (222's Slow 4G entry read "BATTLEFIELD" for ~1.8 s while the loading owner downloaded): the pending
    // cover's very first frame names the chosen battlefield, over its own tones, with its art on the way
    screen.showPending({ mapId: 'railyard', mapName: 'Cinder Junction', thumb: '/maps/railyard.webp' });
    // (its first word solid, the rest hollow: the direction's title)
    const title = selectors.get('.mapname');
    assert.equal(title.textContent + title.children.map((part) => part.textContent).join(''), 'Cinder Junction',
      'the first loader frame names the map');
    assert.equal(selectors.get('.kicker').textContent, t('battleLoad.kicker'));
    assert.equal(art.style.backgroundImage, `url(${MAP_LQIP.railyard}),${gradientOf(MAP_ART_TONES.railyard)}`);
    assert.equal(art.className, 'art railyard');
    screen.showPending({ mapId: 'random', mapName: 'Random' });
    assert.equal(selectors.get('.mapname').textContent, t('battleLoad.fallbackMapName'),
      'an unresolved Random request keeps the neutral title rather than a guess');
    assert.equal(art.style.backgroundImage, gradientOf(MAP_ART_TONE_DEFAULT));
    loads.length = 0;
    delete globalThis.Image;
    const cssText = elements.find(item => item.id === 'cot-bl-style').textContent;
    assert.match(cssText, /\.cot-bl \.hero \.art\{[^}]*background-image:linear-gradient/, 'every map has a gradient under its art');
    assert.match(cssText, /\.cot-bl \.hero \.art-img\{[^}]*opacity:0;/);
  }

  // a room whose map is not chosen yet names it 'none': the plan's slot keeps its frame and requests nothing
  // (2026-10-25: /minimaps/none.webp was a 404 and a console error in every room), then takes the map once it is known
  {
    const plan = selectors.get('.map img');
    screen.show({ ...info, thumb: '', biome: 'none' });
    assert.equal(plan.src, undefined, 'no request for a map named none');
    assert.equal(selectors.get('.map').hidden, false, 'the plan keeps its frame while the room has no map');
    screen.show({ ...info, thumb: '', biome: 'verdant' });
    assert.match(plan.src, /\/minimaps\/verdant\.webp\?v=/, 'the plan loads once the map is known');
    const planBox = selectors.get('.map .mp');
    assert.equal(planBox.getAttribute('data-reveal'), '', 'the plan fades in over its plate (components/reveal.ts), never a pop or a broken frame');
    assert.equal(planBox.getAttribute('data-ready'), '', 'a plan already decoded stands at once');
    screen.show({ ...info, thumb: '', biome: 'none' });
    assert.equal(plan.src, undefined, 'and a room back to no map drops the request');
  }

  const css = elements.find(item => item.id === 'cot-bl-style').textContent;
  assert.match(css, /\.cot-bl \.fbar i b\{[^}]*inset:0;[^}]*transform:scaleX\(0\);[^}]*transform-origin:left center;[^}]*transition:transform/);
  assert.doesNotMatch(css, /transition:width/);
  assert.match(css, /\.cot-bl\.on \.fbar i b\{will-change:transform;/,
    'compositor hint is limited to the visible loader');
  assert.match(css, /prefers-reduced-motion:reduce[^\n]*\.cot-bl \.fbar i b\{transition-duration:1ms/);

  // The mode chip on the cover's first frame names the chosen mode, for every mode and every campaign operation (its
  // title), however the battlefield's description went, and the loading owner's show names it the same (the 262
  // production check: "Random Battle · Standard" over the Proving Ground and the campaign until that show)
  {
    const { createSoloBattleEntryRuntime } = await import('../game/soloBattleEntryRuntime.ts');
    const { createBattleEntryLifecycle } = await import('../game/battleEntryLifecycle.ts');
    const { soloBattleLoadingModeLabel } = await import('../game/soloBattleLoadingRuntime.ts');
    const { GAME_MODE_IDS } = await import('../sim/gameModeCatalog.ts');
    const { CAMPAIGN_OPERATIONS } = await import('../game/campaignOperations.ts');
    const descriptions = {
      none: () => null,
      throws: () => { throw new Error('no plan'); },
      described: (_specId, mapId) => ({ mapId: mapId ?? 'random', mapName: 'Cinder Junction' }),
    };
    let firstFrame = null;
    const entry = (describe) => createSoloBattleEntryRuntime({
      lifecycle: createBattleEntryLifecycle({ nextFrame: async () => {}, now: () => 0 }),
      loading: { async begin() {} },
      battleLoad: {
        // the chip as the cover's first frame draws it (its seats are the sheets' receipt above)
        showPending: (pending) => { screen.showPending(pending); firstFrame = selectors.get('.kicker').textContent; },
        hide: async () => {},
      },
      audio: { loadingOn: () => {} }, enterGarage: () => {}, nextFrame: async () => {},
      isVisibleSpecId: () => true, getSelectedSpecId: () => 'leo2_improved', getSelectedMapId: () => 'railyard',
      reportError: () => {}, presentFailure: async () => {}, onFailure: () => {}, describePendingMap: describe,
    });
    const cases = [
      ...GAME_MODE_IDS.map((gameMode) => ({ gameMode, campaignOperationId: null })),
      ...CAMPAIGN_OPERATIONS.map((operation) => ({ gameMode: 'frontline_assault', campaignOperationId: operation.id })),
    ];
    let checked = 0;
    for (const [how, describe] of Object.entries(descriptions)) {
      const runtime = entry(describe);
      for (const { gameMode, campaignOperationId } of cases) {
        firstFrame = null;
        await runtime.beginSelected({ specId: 'leo2_improved', mapId: 'railyard', gameMode, ...(campaignOperationId ? { campaignOperationId } : {}) });
        const expected = soloBattleLoadingModeLabel(gameMode, campaignOperationId);
        assert.equal(firstFrame, expected, `${campaignOperationId ?? gameMode} (description ${how}): the cover's first frame names the chosen mode`);
        if (gameMode !== 'standard' || campaignOperationId) {
          assert.notEqual(firstFrame, t('battleLoad.kicker'), `${campaignOperationId ?? gameMode}: not the placeholder's words`);
        }
        checked++;
      }
    }
    assert.equal(checked, 3 * (GAME_MODE_IDS.length + CAMPAIGN_OPERATIONS.length));
    assert.equal(soloBattleLoadingModeLabel('proving_ground'), t('playMenu.matchMode.proving_ground.label'));
    assert.equal(soloBattleLoadingModeLabel('frontline_assault', 'iron_ridge'), t('campaign.op.iron_ridge.title'));
  }
} finally {
  if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
  else delete globalThis.document;
  if (priorTimeout) Object.defineProperty(globalThis, 'setTimeout', priorTimeout);
  else delete globalThis.setTimeout;
  if (priorVideo) Object.defineProperty(globalThis, 'HTMLVideoElement', priorVideo);
  else delete globalThis.HTMLVideoElement;
}
console.log('battleLoadProgress.selftest: transform fill, dedup, accessibility, bounds, restaging, the unchosen room map and every mode\'s chip on the first frame passed');
