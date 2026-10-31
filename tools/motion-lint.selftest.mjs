// motion-lint.selftest.mjs — the static motion lint receipt (UI-LOCKDOWN part D, "no lossy animation").
// Copyright © 2026 Kevin B. Liu.
//
// 1. The lint finds what it names: layout, paint and colour properties in transitions, @keyframes and animate(); time
//    literals instead of the --dur-* tokens; moving or looping motion with no reduced-motion path; rAF loops that write
//    styles; raster or video UI chrome. Compositor properties, token durations, fades, reduce rules, one-shot rAFs,
//    canvas loops and gameplay footage pass.
// 2. No file of the tree holds more findings of any rule than tools/motion-lint-baseline.json allows (a new file starts
//    at zero), the baseline is in canonical form, and every allowlist row has a reason and a measurement and still
//    matches a finding.
// 3. The ratchet fires: a rise in one file and a finding in a new file both fail, and a write that would raise a rule's
//    total is refused.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWLIST_FILE, BASELINE_FILE, RULES, allowed, animationItems, baselineText, counts, durationLiterals, keyframeBlocks,
  lint, lintFile, lintFiles, motionTokens, moves, parseSheet, propertyClass, readAllowlist, readBaseline, rises,
  scriptRules, totalRises, totals, transitionItems,
} from './motion-lint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const motion = motionTokens();

/* 1. what it finds ---------------------------------------------------------------------------------------------- */
assert.ok(['--dur-instant', '--dur-fast', '--dur-base', '--dur-screen', '--dur-stage', '--cot-motion-base', '--cot-motion-scene', '--focus-bracket-dur']
  .every((name) => motion.has(name)), 'the motion tokens: --dur-*, the motion.css aliases and component tokens that read one');
assert.ok(!motion.has('--ease-enter') && !motion.has('--cot-ease-out'), 'an easing token is not a duration');

assert.equal(propertyClass('transform'), null);
assert.equal(propertyClass('opacity'), null);
assert.equal(propertyClass('visibility'), null, 'a discrete flip costs one style change');
assert.equal(propertyClass('width'), 'layout');
assert.equal(propertyClass('all'), 'layout', '`all` animates whatever changes, layout included');
assert.equal(propertyClass('margin-inline-start'), 'layout');
assert.equal(propertyClass('box-shadow'), 'paint');
assert.equal(propertyClass('background-position'), 'paint');
assert.equal(propertyClass('background-color'), 'colour');
assert.equal(propertyClass('border-inline-start-color'), 'colour');
assert.equal(propertyClass('stroke'), 'colour');
assert.equal(propertyClass('stroke-dashoffset'), 'paint');
assert.equal(propertyClass('-webkit-filter'), 'paint');
assert.equal(propertyClass('--glow'), 'paint', 'an animated custom property recomputes style every frame');
assert.ok(moves('transform') && moves('height') && moves('background-position') && !moves('opacity') && !moves('color'));

assert.equal(durationLiterals('opacity var(--dur-fast) var(--ease-enter)', motion), 0);
assert.equal(durationLiterals('opacity var(--dur-fast, 140ms)', motion), 0, 'a motion token\'s fallback is the token');
assert.equal(durationLiterals('opacity var(--fade, 140ms)', motion), 1, 'another variable\'s fallback is a literal');
assert.equal(durationLiterals('opacity .2s ease, transform 140ms .05s', motion), 3);
assert.equal(durationLiterals('none 0s, opacity 1ms', motion), 0, '0 and 1 ms are the reduced-motion collapse');
assert.equal(durationLiterals('-0.4s', motion), 0, 'a negative delay is a loop\'s phase, not a wait');
assert.equal(durationLiterals('opacity var(--interpolated)ms', motion), 1, 'a `${ms}ms` interpolation is a JS literal');
assert.equal(durationLiterals('calc(var(--dur-fast) * 2)', motion), 0);
assert.equal(durationLiterals('calc(var(--dur-fast) + 40ms)', motion), 1);

assert.deepEqual(transitionItems('opacity var(--dur-fast), visibility 0s linear var(--dur-fast)', motion).map((i) => [i.properties, i.duration?.zero, i.duration?.collapses]),
  [[['opacity'], false, true], [['visibility'], true, true]]);
assert.deepEqual(transitionItems('.2s', motion)[0].properties, ['all'], 'no property named is `all`');
assert.deepEqual(transitionItems('none', motion), []);
assert.deepEqual(animationItems('spin var(--dur-stage) linear infinite', motion).map((i) => [i.name, i.infinite, i.duration?.collapses]), [['spin', true, true]]);
assert.deepEqual(animationItems('pop .42s cubic-bezier(.16,1,.3,1) .12s backwards', motion).map((i) => [i.name, i.infinite, i.duration?.collapses]), [['pop', false, false]]);

const sheet = parseSheet('/* .x{transition:width 1s} */\n@layer surfaces{\n@media (width<520px){\n.a{color:red;\n  &:hover{transition:color var(--dur-fast)}\n}}}\n@keyframes k{to{opacity:1}}');
assert.deepEqual(sheet.map((r) => [r.selector, r.keyframes, r.decls.map((d) => `${d.property}@${d.line}`)]), [
  ['.a:hover', null, ['transition@5']], ['.a', null, ['color@4']], [null, 'k', ['opacity@7']],
], 'nesting resolves &, at-rules and comments are not rules, lines are 1-based');

const finds = (file, text) => lintFile(file, text, motion).map((f) => `${f.rule}:${f.line}:${f.where}${f.property ? `{${f.property}}` : ''}`);
assert.deepEqual(finds('a.css', [
  '.ok{transition:opacity var(--dur-fast) var(--ease-enter),transform var(--dur-base)}',
  '.fade{transition:opacity .2s}',
  '.grow{transition:width .2s}',
  '.tint{transition:color var(--dur-fast)}',
  '.spin{animation:spin var(--dur-stage) linear infinite}',
  '.still{animation:spin var(--dur-stage) linear infinite}',
  '@media (prefers-reduced-motion:reduce){.still{animation:none}}',
  '@keyframes spin{to{transform:rotate(1turn)}}',
  '@keyframes glow{50%{box-shadow:0 0 8px red}}',
  '.pop{animation:glow var(--dur-base)}',
].join('\n')), [
  'duration:2:.fade{transition}',
  'duration:3:.grow{transition}', 'layout:3:.grow{width}', 'reduced:3:.grow',
  'colour:4:.tint{color}',
  'reduced:5:.spin',
  'paint:9:@keyframes glow{box-shadow}',
], 'a fade needs no reduce path; growth and a loop do; a reduce rule on the class covers it; a finite token pulse collapses');
assert.deepEqual(finds('ring.css', '.chip{box-shadow:var(--ring-1);transition:box-shadow var(--dur-fast)}.chip.on{box-shadow:var(--ring-accent)}'
  + '.card{box-shadow:var(--ring-1);transition:box-shadow var(--dur-fast)}.card:hover{box-shadow:var(--e2)}'),
  ['colour:1:.chip{box-shadow}', 'paint:1:.card{box-shadow}'], 'a ring-only box-shadow repaints like a border colour; an elevation is paint');
assert.deepEqual(finds('keys.css', '.gate.on{animation:pulse var(--dur-stage) infinite}.x .on{animation:none}'
  + '.m :is(.wheel,.links){animation:spin var(--dur-stage) linear infinite}'
  + '@media (prefers-reduced-motion:reduce){.y.on{transition:none}.m :is(.links,.wheel){animation:none}}'),
  ['reduced:1:.gate.on'], 'a state class (.on) names no element; :is() names each alternative');
assert.deepEqual(finds('delay.css', '.s{animation:rise var(--dur-base) ease .12s backwards;animation-delay:.2s;transition:opacity var(--dur-fast) .05s}'),
  [], 'a delay or a stagger is choreography, not a duration');
assert.deepEqual(finds('b.css', '@media (prefers-reduced-motion:no-preference){.drift{transition:transform 3s}}'),
  ['duration:1:.drift{transition}'], 'opting in under no-preference is a reduced-motion path');
assert.deepEqual(finds('c.css', '.n{--fade:var(--dur-fast);--slow:300ms;transition:transform var(--fade)}.m{transition:transform var(--slow)}'),
  ['duration:1:.n{--slow}', 'reduced:1:.m'], 'a file alias of a token collapses; a literal custom property does not');

const ts = [
  'const CSS = `',
  '.cot-x{transition:height 200ms ease}',
  '.cot-y{animation:cotPulse ${PULSE}ms infinite}`;',
  "el.style.transition = 'box-shadow var(--dur-fast)';",
  'function tick(){ bar.style.width = `${p}%`; requestAnimationFrame(tick); }',
  'requestAnimationFrame(() => panel.classList.add("in"));',
  'function draw(){ ctx.fillRect(0, 0, w, h); requestAnimationFrame(draw); }',
  'requestAnimationFrame(draw); requestAnimationFrame(tick);',
  'card.animate([{ opacity: 0, height: "0px" }, { opacity: 1 }], { duration: 300, easing: "ease-out" });',
].join('\n');
assert.deepEqual(finds('probe.ts', ts), [
  'duration:2:.cot-x{transition}', 'layout:2:.cot-x{height}', 'reduced:2:.cot-x',
  'duration:3:.cot-y{animation}', 'reduced:3:.cot-y',
  'paint:4:element.style{box-shadow}',
  'raf:5:requestAnimationFrame(tick)',
  'duration:9:animate(){duration}', 'layout:9:animate(){height}', 'reduced:9:animate()',
], 'CSS-in-TS with source lines; a style-writing rAF loop, not a one-shot or a canvas loop; animate() keyframes and options');
assert.deepEqual(scriptRules("const re = /'/g; const t = 'transition'; ui.transition = 'smooth';"), [], 'a word in code is not a style context');

assert.deepEqual(finds('page.html', [
  '<link rel="icon" href="/favicon-32.png">',
  '<meta property="og:video" content="/media/home-r2/vs03-reservoir-k2-vt4a1-1280.mp4">',
  '<img class="partner" src="/brand/partners/acme.png" alt="">',
  '<img src="/ui/spinner.gif"><img src="/media/home/tank-640.webp">',
  '<video class="hero-logo" src="/media/x.webm"></video><video muted loop src="/media/reel.webm"></video>',
  '<style>.a{transition:top .3s}</style><p style="transition:opacity var(--dur-fast)">',
].join('\n')), [
  'raster:3:/brand/partners/acme.png', 'raster:4:/ui/spinner.gif', 'raster:5:<video>',
  'duration:6:.a{transition}', 'layout:6:.a{top}', 'reduced:6:.a',
], 'HTML: chrome raster and video, not icons in <head>, social cards, content images or gameplay footage');

/* 2. the tree against the baseline and the allowlist ------------------------------------------------------------ */
const files = lintFiles();
assert.ok(files.includes('index.html') && files.includes('src/ui/garage.css') && files.includes('src/ui/hud.ts') && files.includes('site/home.html'),
  'the lint reads HTML, CSS and CSS-in-TS');
assert.ok(!files.some((path) => path.startsWith('src/ui/tokens/') || /\.selftest\./.test(path)), 'not the token package or receipts');
const allow = readAllowlist();
for (const row of allow) {
  assert.ok(RULES.includes(row.rule) && existsSync(join(ROOT, row.file)) && row.where, `allowlist row ${JSON.stringify(row)} names a rule, a file and a place`);
  assert.ok(String(row.reason ?? '').trim() && String(row.measured ?? '').trim(), `allowlist row ${row.file} ${row.where} gives its reason and its measurement`);
}
const findings = lint(ROOT, allow);
const stale = allow.filter((row) => !findings.some((f) => allowed(row, f)));
assert.deepEqual(stale, [], 'every allowlist row still matches a finding (drop the rows whose motion is gone)');
const current = counts(findings);
const baseline = readBaseline();
const up = rises(current, baseline);
assert.deepEqual(up, [], `lossy motion rose above ${BASELINE_FILE} (node tools/motion-lint.mjs --report):\n${up.map((r) => {
  const where = findings.filter((f) => !f.allowed && f.file === r.file && f.rule === r.rule).map((f) => `    ${f.line}: ${f.where} ${f.detail}`);
  return `  ${r.file}: ${r.rule} ${r.baseline} -> ${r.current}\n${where.join('\n')}`;
}).join('\n')}`);
assert.equal(readFileSync(join(ROOT, BASELINE_FILE), 'utf8'), baselineText(baseline), 'the baseline is in canonical form (node tools/motion-lint.mjs --write)');
assert.ok(existsSync(join(ROOT, ALLOWLIST_FILE)), 'the allowlist exists, rows or none');

/* 3. the ratchet fires ------------------------------------------------------------------------------------------ */
const zero = Object.fromEntries(RULES.map((r) => [r, 0]));
const was = { 'a.css': { ...zero, paint: 2 } };
assert.deepEqual(rises({ 'a.css': { ...zero, paint: 3 }, 'new.ts': { ...zero, raf: 1 } }, was), [
  { file: 'a.css', rule: 'paint', baseline: 2, current: 3 },
  { file: 'new.ts', rule: 'raf', baseline: 0, current: 1 },
], 'a rise and a new file\'s finding both fail');
assert.deepEqual(rises({ 'a.css': { ...zero, paint: 1 } }, was), [], 'a fall passes');
assert.deepEqual(totalRises({ 'b.css': { ...zero, paint: 2 } }, was), [], 'moving findings between files may be written');
assert.deepEqual(totalRises({ 'a.css': { ...zero, paint: 2 }, 'b.css': { ...zero, paint: 1 } }, was), ['paint 2 -> 3'], 'a write that raises a total is refused');

const now = totals(current), limit = totals(baseline);
console.log(`motion-lint: ${files.length} files, ${keyframeBlocks()} @keyframes blocks, ${allow.length} allowlist rows; `
  + `${RULES.map((r) => `${r} ${now[r]}/${limit[r]}`).join(', ')}; no file above its baseline`);
