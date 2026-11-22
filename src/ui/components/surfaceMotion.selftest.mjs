// The motion census (ui-motion-275; Kevin 2026-11-21: "need ui transitions and animations in general"). Copyright © 2026
// Kevin B. Liu.
//
// 1. The vocabulary (surfaceMotion.css): every kind enters from @starting-style and (all but the in-place swap) leaves, on
//    the compositor only (opacity, translate, scale; display and overlay flip discretely), every duration a --dur-* token.
// 2. Reduced motion: every --dur-* token the vocabulary reads collapses to 1 ms under data-motion=reduce and under the OS
//    switch (tokens.css), and the travel tokens live in motion.css; so under reduced motion every surface is instant.
// 3. Every registered transient surface (transientSurfaceRegistry.ts) has its motion: a vocabulary class on its box in its
//    owner's markup, one of the kit's own enter/exit pairs (the picker menu, the shared modal, the Garage's pickers, the
//    touch ammunition rack), or a named exemption. A new row fails here until it says how it comes and goes.
// 4. The surfaces outside the registry that the survey found popping (Deploy, the report, the Rooms menu, the HUD's chips,
//    the pause veil, the network panel, the photo bar, toasts, the ready check) keep their motion.
// 5. leaveThen: reduced motion or a hidden element runs `done` now; otherwise the element takes no presses until its exit
//    ends, and showing it again cancels the exit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRANSIENT_SURFACES } from '../transientSurfaceRegistry.ts';
import { cancelLeave, exitMs, isLeaving, leaveThen } from './surfaceMotion.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const read = (file) => readFileSync(`${ROOT}${file}`, 'utf8');
const css = read('src/ui/components/surfaceMotion.css');
const KINDS = ['fade', 'rise', 'drop', 'pop', 'slide-start', 'slide-end', 'swap'];
const LEAVING = KINDS.filter((kind) => kind !== 'swap');

/* 1. the vocabulary ------------------------------------------------------------------------------------------------ */
const body = css.replace(/\/\*[^]*?\*\//g, '');
const rules = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, decls]) => ({ selector: selector.trim(), decls }));
const starting = /@starting-style\{([^]*?)\n\}/.exec(body)?.[1] ?? '';
for (const kind of KINDS) {
  const cls = `.cot-m-${kind}`;
  assert.ok(rules.some((r) => r.selector.split(',').some((s) => s.trim() === cls) && /transition:/.test(r.decls)),
    `${cls} has a transition`);
  assert.ok(new RegExp(`\\${cls}[,{]`).test(starting), `${cls} enters from @starting-style`);
}
for (const kind of LEAVING) {
  const exit = rules.find((r) => r.selector.includes(`.cot-m-${kind}`) && r.selector.includes('[data-leaving]') && /opacity:0/.test(r.decls));
  assert.ok(exit, `.cot-m-${kind} leaves (opacity 0 while hidden or leaving)`);
  assert.ok(rules.some((r) => r.selector.includes(`.cot-m-${kind}`) && /display var\(--dur-[a-z]+\) allow-discrete/.test(r.decls)),
    `.cot-m-${kind} keeps its display through its exit`);
}
// the exit takes no presses and every surface state that hides leaves: hidden, a dialog's close, leaveThen, the owner's class
const exitRule = rules.find((r) => /pointer-events:none/.test(r.decls) && r.selector.includes('[data-leaving]'));
assert.ok(exitRule, 'a leaving surface takes no presses');
for (const state of ['[hidden]', '[data-leaving]', '.cot-m-out', 'dialog:not([open])', '.cot-m-by-open:not(.open)',
  '.cot-m-by-show:not(.show)', '.cot-m-by-on:not(.on)']) {
  assert.ok(exitRule.selector.includes(state), `the exit covers ${state}`);
}
// the swap leaves at once: no display transition, so two never stand in the flow together
const swap = rules.find((r) => r.selector === '.cot-m-swap');
assert.ok(swap && !/display/.test(swap.decls), 'a swap leaves at once (no display transition)');
assert.ok(!rules.some((r) => r.selector.includes('.cot-m-swap') && r.selector.includes('[data-leaving]')), 'a swap has no exit state');
// compositor only, tokens only
const COMPOSITOR = new Set(['opacity', 'translate', 'scale', 'display', 'overlay']);
for (const { selector, decls } of rules) {
  for (const [, prop, value] of decls.matchAll(/(?:^|;)\s*((?:transition|animation)(?:-[a-z]+)?):([^;]+)/g)) {
    if (prop === 'transition') {
      for (const part of value.split(/,(?![^(]*\))/)) {
        const name = part.trim().split(/\s+/)[0];
        assert.ok(COMPOSITOR.has(name), `${selector}: transition on ${name} (compositor properties only)`);
      }
    }
    for (const time of value.matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)\b/g)) assert.fail(`${selector}: a literal time ${time[0]} (read a --dur-* token)`);
  }
  assert.ok(!/(?:^|;)\s*(width|height|top|left|margin|padding)\s*:/.test(decls) || selector.startsWith('@'), `${selector}: moves layout`);
}
for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)\{([^]*?)\}\}/g)) {
  const block = /@keyframes\s+[\w-]+\{([^]*?)\}\}/.exec(css.slice(css.indexOf(`@keyframes ${name}`)))[1];
  for (const [, prop] of block.matchAll(/([a-z-]+):/g)) assert.ok(COMPOSITOR.has(prop), `@keyframes ${name}: ${prop} (compositor only)`);
}
assert.match(css, /\.cot-m-beat\{animation:cot-m-beat var\(--dur-base\) var\(--motion-ease-emphasis\) 1 both\}/, 'the beat plays once, on tokens');

/* 2. reduced motion ------------------------------------------------------------------------------------------------ */
const tokensCss = read('src/ui/tokens/tokens.css');
const durations = [...new Set([...css.matchAll(/var\(--(dur-[a-z]+)\)/g)].map((m) => m[1]))];
assert.ok(durations.length >= 3, 'the vocabulary reads the duration tokens');
const reduceBlock = /:root\[data-motion=reduce\]\{([^}]*)\}/.exec(tokensCss)?.[1] ?? '';
const osBlock = /@media \(prefers-reduced-motion:reduce\)\{\s*:root:not\(\[data-motion\]\)\{([^}]*)\}/.exec(tokensCss)?.[1] ?? '';
for (const token of durations) {
  assert.match(reduceBlock, new RegExp(`--${token}:1ms;`), `Reduce motion (data-motion=reduce) collapses --${token}`);
  assert.match(osBlock, new RegExp(`--${token}:1ms;`), `the OS reduce-motion switch collapses --${token}`);
}
const motionCss = read('src/ui/motion.css');
for (const token of ['motion-nudge', 'motion-rise', 'motion-slide', 'motion-scale-in', 'motion-ease-emphasis']) {
  assert.match(motionCss, new RegExp(`--${token}:`), `motion.css defines --${token}`);
  if (token !== 'motion-scale-in' && token !== 'motion-ease-emphasis') {
    assert.match(motionCss, new RegExp(`--${token}: var\\(--s\\d+, \\d+px\\)`), `--${token} is a step of the spacing scale`);
  }
}
assert.ok(read('src/main.ts').indexOf("import './ui/components/surfaceMotion.css';") > read('src/main.ts').indexOf("import './ui/motion.css';"),
  'the game loads the vocabulary after the motion tokens');

/* 3. every registered transient surface ---------------------------------------------------------------------------- */
// (the kit's own enter/exit pairs, each read where it lives)
const OWN = {
  pickers: { file: 'src/ui/components/pickers.css', proof: [/@starting-style\{\s*\.cot-c-menu__pop:popover-open\{opacity:0/, /\.cot-c-menu__pop\{[^}]*display var\(--dur-fast\) allow-discrete/] },
  modal: { file: 'src/ui/modal.ts', proof: [/\.cot-modal-root\{[^}]*transition:opacity var\(--dur-base\)/, /\.cot-modal\{[^}]*transition:transform var\(--dur-screen\)/, /closeTimer = window\.setTimeout\(finish/] },
  eqpick: { file: 'src/ui/garage.css', proof: [/@starting-style\{\.cot-eqpick\.open\{opacity:0/, /\.cot-eqpick\{opacity:0;[^}]*display var\(--dur-fast\) allow-discrete/] },
  ammoRack: { file: 'src/ui/touchControls.ts', proof: [/\.cot-shell\{[^}]*transition:transform var\(--dur-fast\)[^}]*opacity var\(--dur-instant\)/, /\.cot-shells\.touch-open \.cot-shell\{opacity:1/] },
};
// a vocabulary class on the box, in its owner's markup: [file, the box's class, the kind]
const vocab = (file, box, kind) => ({ vocab: { file, box, kind } });
const own = (name) => ({ own: name });
const exempt = (why) => ({ exempt: why });
const SITE = exempt('a public page outside the game (the site\'s native dialogs and menus keep their own presentation; the game ' +
  'document is what this vocabulary serves)');
const MOTION = {
  'garage-equipment': own('eqpick'), 'garage-consumables': own('eqpick'),
  'garage-paint-sheet': vocab('src/ui/garage.ts', 'cot-leftcol', 'rise'),
  // the folded dossier is the overview card grown over the stage: its size changes in place (layout, never animated); the
  // scrim under it fades in and out
  'garage-dossier': vocab('src/ui/garage.ts', 'cot-garage-panel-scrim', 'fade'),
  'garage-rival': own('pickers'), 'garage-staging': own('pickers'), 'garage-quick-mode': own('pickers'), 'garage-quick-battlefield': own('pickers'),
  'garage-filters': vocab('src/ui/garageFacetPanel.ts', 'cot-facet-panel', 'drop'),
  'garage-mobile-nav': vocab('src/ui/garage.ts', 'cot-mobile-nav-menu', 'drop'),
  'tech-tree': vocab('src/ui/techTree.ts', 'cot-tt', 'fade'),
  'garage-technical': own('modal'), 'garage-return-failure': own('modal'), 'battle-entry-failure': own('modal'),
  'service-record': own('modal'), 'camo-studio': own('modal'), 'context-info': own('modal'), 'couch-lobby': own('modal'), modal: own('modal'),
  rooms: vocab('src/ui/playMenu.ts', 'panel', 'rise'),
  // Deploy's closed state moves it out of its fixed full-screen place: it enters with the swap and leaves at once
  deploy: vocab('src/ui/garage.ts', 'cot-battle-menu', 'swap'),
  'deploy-battlefield': vocab('src/ui/garage.ts', 'cot-deploy-field-pop', 'swap'),
  'deploy-arrangement': own('pickers'), 'nation-dropdown': own('pickers'),
  settings: vocab('src/ui/settings.ts', 'cot-set-panel', 'rise'),
  'settings-quality': own('pickers'), 'settings-colour-preset': own('pickers'), 'settings-crew-voice': own('pickers'),
  'hud-editor': own('modal'),
  // photo mode's one bar, in the Garage and in a solo battle (photo-mode-271): it rises in and leaves before its removal
  'photo-battle': vocab('src/ui/photoMode.ts', 'cot-photo-bar', 'rise'),
  'photo-garage': vocab('src/ui/photoMode.ts', 'cot-photo-bar', 'rise'),
  'gallery-rival': own('pickers'), 'gallery-sort': own('pickers'), 'gallery-camera-view': own('pickers'), 'markup-primitive': own('pickers'),
  'gallery-drawing': SITE, 'public-nav-menu': SITE, 'home-trailer': SITE, 'docs-archive': SITE, 'docs-fleet-filter': own('pickers'),
  'media-library': SITE, 'pad-options': SITE, 'media-archive': SITE,
  'spectate-ally': vocab('src/ui/spectatorSwitcher.ts', 'cot-spec-pick', 'rise'),
  'hud-ammo-rack': own('ammoRack'),
  'rooms-tank': vocab('src/ui/playMenu.ts', 'vehicle-pick', 'swap'),
  'rooms-battlefield': vocab('src/ui/playMenu.ts', 'battlefield-pick', 'swap'),
  'rooms-mode': vocab('src/ui/playMenu.ts', 'mode-pick', 'swap'),
  'rooms-operation': own('pickers'), 'rooms-arrangement': own('pickers'),
  'studio-actor': own('pickers'), 'studio-featured-tank': own('pickers'), 'studio-picture': own('pickers'),
  'studio-battlefield': vocab('src/ui/studioPanel.ts', 'mapPop', 'drop'),
  'studio-hour': own('pickers'), 'studio-state': own('pickers'),
  'studio-queue': vocab('src/ui/studioPanel.ts', 'st-queue', 'drop'),
  'studio-commands': vocab('src/ui/studioCommands.ts', 'st-cmd-box', 'pop'),
  'studio-templates': vocab('src/ui/studioTemplateSheet.ts', 'cot-studio-templates', 'rise'),
};

/** Whether `file` writes a class list holding both `box` and `cot-m-<kind>` (markup, className or el(...) strings). */
const sources = new Map();
const classListWith = (file, box, kind) => {
  if (!sources.has(file)) sources.set(file, read(file));
  for (const [, a, b] of sources.get(file).matchAll(/class="([^"]*)"|'([^'\n]*)'/g)) {
    const list = a ?? b;
    const names = list.split(/\s+/);
    if (names.includes(box) && names.includes(`cot-m-${kind}`)) return true;
  }
  return false;
};
const registryIds = Object.keys(TRANSIENT_SURFACES);
assert.deepEqual(registryIds.filter((id) => !MOTION[id]), [], 'every registered transient surface says how it comes and goes');
assert.deepEqual(Object.keys(MOTION).filter((id) => !TRANSIENT_SURFACES[id]), [], 'no motion row outlives its surface');
for (const [id, entry] of Object.entries(MOTION)) {
  if (entry.vocab) {
    const { file, box, kind } = entry.vocab;
    assert.ok(KINDS.includes(kind), `${id}: ${kind} is a vocabulary kind`);
    assert.ok(classListWith(file, box, kind), `${id}: ${file} gives .${box} cot-m-${kind}`);
    // the registry's box is that element (its own selector names the class)
    assert.ok(TRANSIENT_SURFACES[id].box.includes(box) || id === 'garage-dossier' || id === 'deploy-battlefield',
      `${id}: .${box} is the registry's box (${TRANSIENT_SURFACES[id].box})`);
  } else if (entry.own) {
    const pair = OWN[entry.own];
    for (const proof of pair.proof) assert.match(read(pair.file), proof, `${id}: ${pair.file} keeps its enter/exit (${proof})`);
  } else {
    assert.ok(['site', 'gallery'].includes(TRANSIENT_SURFACES[id].screen), `${id}: only a public page's surface is exempt`);
  }
}

/* 4. the surfaces outside the registry ----------------------------------------------------------------------------- */
const OUTSIDE = [
  ['src/ui/settings.ts', 'cot-settings', 'fade'], ['src/ui/settings.ts', 'cot-resume', 'fade'], ['src/ui/settings.ts', 'rz-plate', 'pop'],
  ['src/ui/endScreen.ts', 'es-debrief', 'swap'], ['src/ui/playMenu.ts', 'cot-play', 'fade'], ['src/ui/playMenu.ts', 'room', 'swap'],
  ['src/ui/playMenu.ts', 'lobby', 'swap'], ['src/ui/garage.ts', 'cot-deploy-panel', 'swap'], ['src/ui/hud.ts', 'cot-mode-status', 'drop'],
  ['src/ui/hud.ts', 'cot-aim-warning', 'drop'], ['src/ui/hud.ts', 'cot-jump', 'rise'], ['src/ui/multiplayerStatus.ts', 'cot-mp-panel', 'drop'],
  ['src/ui/photoMode.ts', 'cot-photo-bar', 'rise'], ['src/ui/spectatorSwitcher.ts', 'cot-spec-scrim', 'fade'],
];
for (const [file, box, kind] of OUTSIDE) assert.ok(classListWith(file, box, kind), `${file}: .${box} carries cot-m-${kind}`);
assert.match(read('src/ui/endScreen.ts'), /host\.classList\.add\('cot-es', 'cot-m-fade', 'cot-m-by-show'\)/, 'the report fades as it goes');
assert.match(read('src/ui/garage.ts'), /section\.classList\.toggle\('cot-m-swap'/, 'a station change swaps its sections in');
assert.match(read('src/ui/components/readyControl.ts'), /landed \? 'cot-ready__mark cot-m-beat'/, 'the ready check lands with a beat');
assert.match(read('src/ui/components/notice.ts'), /leaveThen\(item, \(\) => item\.remove\(\)\)/, 'a toast goes once its exit has played');
assert.match(read('src/ui/components/notices.css'), /\[data-placement\^=top\] \.cot-c-notice--toast\[data-state\]\{transform:translateY\(calc\(-1 \* var\(--s1\)\)\)/,
  'a toast at the top comes from the top');
assert.match(read('src/ui/medalToast.ts'), /transition:opacity var\(--dur-base\) var\(--motion-ease-emphasis/, 'a medal lands on the emphasis curve');
assert.match(read('src/ui/photoMode.ts'), /leaveThen\(bar, \(\) => bar\.remove\(\)\)/, 'the photo bar leaves before it is removed');
// the per-surface keyframes the vocabulary replaced stay gone (one way to enter, not two)
for (const [file, name] of [['src/ui/settings.ts', 'cotSetIn'], ['src/ui/settings.ts', 'cotSetVeil'], ['src/ui/settings.ts', 'cot-rz-in'],
  ['src/ui/playMenu.ts', 'cotPlayVeil'], ['src/ui/playMenu.ts', 'cotPlayPanel']]) {
  assert.ok(!read(file).includes(name), `${file}: ${name} is replaced by the vocabulary`);
}

/* 5. leaveThen ----------------------------------------------------------------------------------------------------- */
const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
globalThis.clearTimeout = (handle) => { if (timers[handle - 1]) timers[handle - 1].fn = null; };
const fakeElement = ({ shown = true, duration = '0.14s' } = {}) => {
  const listeners = new Map();
  return {
    dataset: {}, inert: false, duration,
    getClientRects: () => (shown ? [{}] : []),
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    fire(type) { listeners.get(type)?.({ target: this }); },
  };
};
globalThis.getComputedStyle = (element) => ({
  transitionDuration: element.dataset.leaving === undefined ? '0.22s, 0.22s' : `${element.duration}, ${element.duration}`,
  transitionDelay: '0s',
});

// reduced motion (every --dur-* at 1 ms) and a hidden element: done now, nothing marked
for (const element of [fakeElement({ duration: '0.001s' }), fakeElement({ shown: false })]) {
  let done = 0;
  leaveThen(element, () => { done += 1; });
  assert.equal(done, 1, 'reduced motion or a hidden element: done at once');
  assert.equal(element.dataset.leaving, undefined);
  assert.equal(element.inert, false);
}
// a played exit: marked, inert, timed by the exit band (not the entry's), done once on its end
{
  const element = fakeElement();
  let done = 0;
  leaveThen(element, () => { done += 1; });
  assert.equal(exitMs(element), 140, 'the wait is the exit band');
  assert.equal(done, 0);
  assert.equal(element.dataset.leaving, '');
  assert.equal(element.inert, true, 'a leaving surface takes no presses');
  assert.ok(isLeaving(element));
  leaveThen(element, () => { done += 10; });
  assert.ok(timers.at(-1).ms >= 140 && timers.at(-1).ms < 220, 'its guard timer is the exit band');
  element.fire('transitionend');
  assert.equal(done, 1, 'done once, on the end of its exit');
  assert.equal(element.inert, false);
  assert.equal(element.dataset.leaving, undefined);
  timers.at(-1).fn?.();
  assert.equal(done, 1, 'the guard timer after the end does nothing');
}
// shown again before its exit ended: the exit is cancelled and done never runs
{
  const element = fakeElement();
  let done = 0;
  leaveThen(element, () => { done += 1; });
  assert.equal(cancelLeave(element), true);
  assert.equal(element.inert, false);
  element.fire('transitionend');
  timers.at(-1).fn?.();
  assert.equal(done, 0, 'a cancelled exit never removes the surface');
  assert.equal(cancelLeave(element), false);
}
// an exit whose transition never starts still ends (the guard timer)
{
  const element = fakeElement();
  let done = 0;
  leaveThen(element, () => { done += 1; });
  timers.at(-1).fn();
  assert.equal(done, 1, 'the guard timer ends an exit that fired no event');
}

console.log(`surface motion: PASS (${KINDS.length} kinds, ${registryIds.length} registered surfaces, ${OUTSIDE.length} others)`);
