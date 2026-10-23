#!/usr/bin/env node
// i18n-literal-lint.selftest.mjs — the literal-ban lint fires on every sink it names, passes what is not copy, and the
// repository sits exactly at its ratchet baseline (no rise, no stale pin), BUI-F8.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countByFile, englishWords, lintCss, lintRepository, lintTypeScript, markupCopy, ratchet, scopeFiles,
} from './i18n-literal-lint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kinds = (source, options) => lintTypeScript('x.ts', source, options).map((finding) => `${finding.kind}: ${finding.text}`);

// Each sink fires.
assert.deepEqual(kinds("el.textContent = 'Battle results';"), ['.textContent: Battle results']);
assert.deepEqual(kinds("el.title = ok ? t('a') : 'Locked vehicle';"), ['.title: Locked vehicle'], 'through a conditional');
assert.deepEqual(kinds("el.textContent = t('a') || 'Fallback copy';"), ['.textContent: Fallback copy'], 'through ||');
assert.deepEqual(kinds('el.textContent = `Tier ${n}`;'), ['.textContent: Tier ${…}'], 'template text around a value');
assert.deepEqual(kinds("button.setAttribute('aria-label', 'Close settings');"), ['setAttribute(aria-label): Close settings']);
assert.deepEqual(kinds("ctx.fillText('CRIT', x, y);"), ['fillText: CRIT'], 'canvas text');
assert.deepEqual(kinds('root.innerHTML = `<div class="a"><b>Ready</b><span aria-label="Open menu">${icon}</span></div>`;'),
  ['markup: Open menu', 'markup: Ready'], 'markup text and accessible attributes');
assert.deepEqual(kinds('const html = `<span class="sl">ATGM</span>`;'), ['markup: ATGM'], 'markup anywhere, not only at a sink');
assert.deepEqual(kinds("throw new Error('Stage or select a tank first');", { studio: true }), ['new Error: Stage or select a tank first'],
  'Studio throws reach the panel');
assert.deepEqual(kinds("throw new Error('internal invariant');"), [], 'other owners\' throws are not player copy');
assert.deepEqual(kinds('const css = `.a::before{content:"DAMAGE";color:red}`;'), ['css content: DAMAGE'], 'CSS held in strings');
assert.deepEqual(lintCss('x.css', ".a::after{content:' · LANDSCAPE RECOMMENDED'}").map((f) => f.text), [' · LANDSCAPE RECOMMENDED']);

// What is not copy passes.
assert.deepEqual(kinds("el.textContent = t('garage.battle');"), [], 'catalog text');
assert.deepEqual(kinds('el.textContent = `${t(\'a\')} · ${value} mm`;'), [], 'units and separators around values');
assert.deepEqual(kinds("el.textContent = '×';"), []);
assert.deepEqual(kinds("el.textContent = 'AC-130';"), [], 'a mode name kept in every locale');
assert.deepEqual(kinds("el.textContent = 'Claude of Tanks';"), [], 'the wordmark');
assert.deepEqual(kinds('el.innerHTML = `<span class="cot-row is-current" data-mode="solo">${label}</span>`;'), [], 'class names and data');
assert.deepEqual(kinds("const html = '<button class=\"x\" ' + `title=\"${t('a')}\" aria-expanded=\"false\">`;"), [],
  'tag pieces split across literals');
assert.deepEqual(kinds('const glsl = `#include <common>\\nvarying vec3 vWorld; void main(){ if (a < b) gl_FragColor = vec4(1.0); }`;'), [],
  'shader source');
assert.deepEqual(kinds(".a::before{content:attr(aria-label)}"), []);
assert.deepEqual(lintCss('x.css', ".a::before{content:attr(data-label)} .b::after{content:''} .c::after{content:'\\2014'}"), []);
assert.deepEqual(englishWords('ABC123 · T-90M · G-01'), [], 'codes with digits');
assert.deepEqual(englishWords('VIII · 120 mm · 72 km/h'), [], 'numerals and units');
assert.deepEqual(englishWords('Penetration (mm)'), ['Penetration']);
assert.deepEqual(markupCopy(' title="Battle rules">Rules'), ['Battle rules', 'Rules']);

// The ratchet: a rise fails, a fix leaves a stale pin that must be lowered, and nothing else.
assert.deepEqual(ratchet({ 'a.ts': 2 }, { 'a.ts': 3 }), { rises: ['a.ts: 3 literal(s), pinned at 2'], stale: [] });
assert.deepEqual(ratchet({ 'a.ts': 2 }, { 'a.ts': 1 }), { rises: [], stale: ['a.ts: pinned at 2, now 1'] });
assert.deepEqual(ratchet({}, { 'new.ts': 1 }).rises, ['new.ts: 1 literal(s), pinned at 0'], 'a new file starts at zero');
assert.deepEqual(ratchet({ 'a.ts': 2 }, { 'a.ts': 2 }), { rises: [], stale: [] });

// Scope covers what the SPEC names.
const scope = [...scopeFiles(ROOT).keys()].map((file) => file.slice(ROOT.length + 1));
for (const file of ['src/ui/hud.ts', 'src/ui/shotInfo.ts', 'src/game/killcam.ts', 'src/game/studio.ts', 'src/gallery/gallery.ts',
  'src/ui/garage.css', 'src/presentation/publicNav.css', 'src/ui/studioPanel.ts']) {
  assert.ok(scope.includes(file), `${file} is in scope`);
}
assert.ok(!scope.some((file) => /\.selftest\./.test(file)), 'tests are out of scope');

// The repository sits at its baseline.
const baseline = JSON.parse(readFileSync(join(ROOT, 'tools/i18n-literal-lint.baseline.json'), 'utf8'));
const findings = lintRepository(ROOT);
const counts = countByFile(findings);
const { rises, stale } = ratchet(baseline.files, counts);
assert.deepEqual(rises, [], `player-facing English literals rose:\n  ${findings.filter((f) => rises.some((r) => r.startsWith(`${f.file}:`))).map((f) => `${f.file}:${f.line} ${f.kind}: ${f.text}`).join('\n  ')}`);
assert.deepEqual(stale, [], 'the baseline only falls: run node tools/i18n-literal-lint.mjs --update');
assert.equal(baseline.total, findings.length, 'the baseline total matches');
for (const file of ['src/ui/hud.ts', 'src/ui/shotInfo.ts', 'src/game/killcam.ts', 'src/ui/responsiveSurfaces.css', 'src/gallery/gallery.ts']) {
  assert.equal(counts[file] ?? 0, 0, `${file} carries no player-facing English literal`);
}

console.log(`i18n-literal-lint.selftest: every sink fires, non-copy passes, ratchet logic holds; repository at its baseline (${findings.length} literal(s) in ${Object.keys(counts).length} file(s))`);
