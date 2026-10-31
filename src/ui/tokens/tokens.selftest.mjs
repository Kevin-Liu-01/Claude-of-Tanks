// tokens.selftest.mjs — the design-token receipt (brand-ui SPEC §4.1, §4.4, §4.5, §4.6). Copyright © 2026 Kevin B. Liu.
//
// 1. tokens.css and tokens.ts are exactly what tools/gen-tokens.mjs makes from tokens.json (idempotent generator);
//    tokens.css declares custom properties only, so linking it styles nothing until a surface reads a token.
// 2. The token values are the SPEC 4.14 sheet (OKLCH sources round to the specified hex); families, tiers, the
//    landing's hollow type, boot cost.
// 3. The SPEC 4.4 contrast table and the 4.5 colour-vision table (Machado 2009 at full severity, CIE76 ΔE) are
//    recomputed from the token values: every printed SPEC number is matched and every floor holds, presets included:
//    text 4.5:1 (coloured text too), control borders and every control edge 3:1 on each surface and plate, and under
//    high contrast all text 7:1 and every line 3:1. The shape-coded team pairs (against each other, the objective
//    neutral and the accent) keep ΔE 12 in every preset; the two SPEC 4.6 presets that cannot are pinned, not hidden,
//    and the measured alternative is printed beside them.
// 4. Presets: for every token under every combination of presets, tokenValue() in tokens.ts equals what the cascade of
//    tokens.css computes (derived tokens follow their overridden sources in both).
// 5. The legacy names (--cot-motion-*, --cot-ease-*, --hud-*, --cot-amber/ink/gold) alias the nearest
//    token of their target's family (or the SPEC-named fold), each with a fallback equal to the token's value, and
//    every shift from the shipped value is measured; --hud-font is the body face; nothing outside the token package
//    reads a colour ramp.
// 6. When the type package's src/ui/typeFaces.ts is in the tree, its head CSS and these tokens agree on every property
//    both declare and every token it reads exists (one source for the font stacks, SPEC 4.1 and 4.7).
// The per-script block (:root:lang(zh-CN), from tokens.json `locale`, BUI-F8) redefines typography tokens for CJK: no
// caps tracking, the CJK leading and measure, a 13 px label floor, solid display type.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, constants as zlib } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  SELECTION_TS, TOKENS_CSS, TOKENS_JSON, TOKENS_TS, VISION_VIEWS, composePresets, composite, contrast, createResolver, deltaE, flattenTokens,
  generate, hexToRgb, luminance, presetEffects, runtimeTokens,
} from '../../../tools/gen-tokens.mjs';
import {
  TOKENS, TOKEN_BREAKPOINTS, TOKEN_EASE, TOKEN_GRID, TOKEN_MS, TOKEN_PRESETS, TOKEN_PX, TOKEN_RUNTIME, tokenValue,
} from './tokens.ts';
import { VIEWPORT_HEIGHT_BANDS, VIEWPORT_WIDTH_BANDS } from '../responsiveLayout.ts';
import { FONT_STACK } from '../fonts.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const source = JSON.parse(readFileSync(TOKENS_JSON, 'utf8'));
const tokens = flattenTokens(source);
const names = new Set(tokens.map((t) => t.name));
const byName = new Map(tokens.map((t) => [t.name, t]));
const base = createResolver(tokens);
const meta = (key) => key.startsWith('$');

/* 1. generated files ------------------------------------------------------------------------------------------ */
const first = generate(source);
const again = generate(structuredClone(source));
assert.deepEqual(again, first, 'gen-tokens is idempotent: the same tokens.json always yields the same bytes');
for (const path of Object.keys(first)) {
  assert.equal(readFileSync(path, 'utf8'), first[path],
    `${relative(ROOT, path)} drifted from tokens.json: run node tools/gen-tokens.mjs`);
}
// a sheet group's own module ("$module") carries its tokens' values instead of tokens.ts, so the boot carries none
const modules = new Map();
for (const t of tokens.filter((token) => token.module)) {
  if (!modules.has(t.module)) modules.set(t.module, (await import(new URL(`../../../${t.module}`, import.meta.url).href)).SURFACE_TOKENS);
  assert.equal(modules.get(t.module)[t.name], base.value(t.name), `${t.module} --${t.name}`);
  assert.ok(!(t.name in TOKENS), `tokens.ts leaves --${t.name} to ${t.module}`);
}
for (const t of tokens.filter((token) => !token.module)) assert.equal(TOKENS[t.name], base.value(t.name), `tokens.ts --${t.name}`);
assert.equal(Object.keys(TOKENS).length, tokens.filter((t) => !t.module).length, 'tokens.ts carries every token but the modules\' once');
for (const [path, values] of modules) {
  assert.equal(Object.keys(values).length, tokens.filter((t) => t.module === path).length, `${path} carries exactly its group`);
}
assert.throws(() => flattenTokens({ primitive: { a: { x: 1 } }, semantic: { b: { x: 2 } } }), /defined twice/);
assert.throws(() => createResolver(flattenTokens({ semantic: { a: { x: '{nope}' } } })).value('x'), /undefined token/);
// Preset closure: a translucent literal made from an overridden colour moves with it; a direct override on one axis beats
// a value another axis only derives (as in the cascade); two axes declaring one property, or moving one token through
// references, are refused, so every combination composes exactly.
const probe = {
  semantic: { g: { a: 'oklch(50% 0 0)', b: '{a}', c: 'oklch(from {a} l c h / .5)', e: 'oklch(40% 0 0)', m: '0 0 0 1px {a},0 0 0 2px {e}' } },
  preset: { x: { p: { a: 'oklch(60% 0 0)' } } },
};
const [probeEffect] = presetEffects(probe);
assert.deepEqual(probeEffect.css.map(([n]) => n), ['a', 'c'], 'a preset CSS block re-emits the literals derived from its overrides');
assert.deepEqual(probeEffect.set.map(([n]) => n), ['a'], 'a preset TS table sets its direct overrides');
assert.deepEqual(probeEffect.follows.map(([n]) => n), ['b', 'c', 'm'], 'and follows every token derived from them');
const withAxis = (overrides) => ({ ...probe, preset: { ...probe.preset, y: { q: overrides } } });
const directWins = presetEffects(withAxis({ b: 'oklch(70% 0 0)' }));
assert.equal(composePresets(directWins, { x: 'p', y: 'q' }, 'b', null), createResolver(flattenTokens(probe), { b: 'oklch(70% 0 0)' }).value('b'),
  'a direct override beats another axis\'s derived value');
assert.throws(() => presetEffects(withAxis({ c: 'oklch(70% 0 0)' })), /both declare --c/);
assert.throws(() => presetEffects(withAxis({ e: 'oklch(30% 0 0)' })), /--m under x=p \+ y=q/);
// Runtime tokens (BUI-F9, SPEC 4.6 Custom): the pure aliases of a runtime token follow it transitively; anything else
// derived from one, or another axis's preset overriding one, is refused, so liveToken() and the cascade agree.
const runtimeProbe = (semantic, runtime, preset = probe.preset) => runtimeTokens({ semantic, preset, runtime });
assert.deepEqual(runtimeProbe({ g: { a: 'oklch(50% 0 0)', b: '{a}', d: '{b}', e: 'oklch(40% 0 0)' } }, { mine: { axis: 'x', tokens: ['a'] } }),
  [{ preset: 'mine', axis: 'x', tokens: [{ name: 'a', follows: ['b', 'd'] }] }], 'a runtime token\'s aliases follow it transitively');
assert.throws(() => runtimeProbe({ g: { a: 'oklch(50% 0 0)', m: '0 0 0 1px {a}' } }, { mine: { axis: 'x', tokens: ['a'] } }),
  /--m derives from the runtime token --a by more than a pure alias/);
assert.throws(() => runtimeProbe({ g: { a: 'oklch(50% 0 0)' } }, { mine: { axis: 'y', tokens: ['a'] } },
  { x: { p: { a: 'oklch(60% 0 0)' } }, y: { q: {} } }), /preset x=p overrides the runtime token --a/);
assert.throws(() => runtimeProbe({ g: { a: 'oklch(50% 0 0)' } }, { p: { axis: 'x', tokens: ['a'] } }), /collides with the x preset/);
assert.deepEqual(TOKEN_RUNTIME, { 'team-own': ['text-own'], 'team-enemy': ['text-enemy'] },
  'Custom team colours move the team tokens and the text roles that alias them (SPEC 4.6)');
assert.deepEqual(source.runtime.custom, { axis: 'cvd', tokens: ['team-own', 'team-enemy'] }, 'Custom is a runtime preset on the colour-vision axis');

// tokens.css is a pure token sheet: :root blocks of custom properties (and the OS reduce-motion copy), nothing else.
const generatedCss = first[TOKENS_CSS];
// The sheet opens with the document's layer order and declares into the tokens layer (brand-ui SPEC §5).
const layered = /^@layer reset,tokens,base,components,surfaces,utilities,overrides;\s*@layer tokens\{([\s\S]*)\}\s*$/
  .exec(generatedCss.replace(/\/\*[\s\S]*?\*\//g, '').trim());
assert.ok(layered, 'tokens.css opens with the layer order and wraps every token block in @layer tokens');
const cssBody = layered[1];
const parseDecls = (text) => {
  const decls = new Map();
  for (const part of text.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = /^--([a-z0-9-]+):(.+)$/s.exec(part);
    assert.ok(m, `tokens.css declares custom properties only (found "${part}")`);
    decls.set(m[1], m[2].trim());
  }
  return decls;
};
const mediaBlocks = [];
const cssRest = cssBody.replace(/@media ([^{]+)\{\s*:root(:not\(\[data-([a-z]+)\]\))?\{([^}]*)\}\s*\}/g, (_, query, guard, axis, decls) => {
  mediaBlocks.push({ query: query.trim(), guard: axis ?? null, decls: parseDecls(decls) });
  return '';
});
const cssBlocks = [];
const localeBlocks = new Map();
const cssLeft = cssRest.replace(/:root:lang\(([a-zA-Z-]+)\)\{([^}]*)\}/g, (_, locale, decls) => {
  localeBlocks.set(locale, parseDecls(decls));
  return '';
}).replace(/(:root(?:\[data-([a-z]+)=([a-z]+)\])?)\{([^}]*)\}/g, (_, sel, axis, preset, decls) => {
  cssBlocks.push({ axis: axis ?? null, preset: preset ?? null, decls: parseDecls(decls) });
  return '';
});
// Per-script typography (SPEC 4.7 CJK, BUI-F8): zh-CN drops caps tracking, reads at 1.7 within 40 em, floors labels at
// 13 px and never draws outline type.
const zhTokens = localeBlocks.get('zh-CN');
assert.ok(zhTokens, 'tokens.css carries the :root:lang(zh-CN) typography block');
for (const name of ['track-label', 'track-label-s', 'track-title', 'track-display', 'hollow-stroke']) assert.equal(zhTokens.get(name), '0', `zh-CN --${name}`);
assert.equal(zhTokens.get('lh-body'), 'var(--lh-cjk)');
assert.equal(zhTokens.get('measure-body'), 'var(--measure-cjk)');
assert.equal(zhTokens.get('fs-11'), 'var(--fs-13)', 'the zh-CN label floor is 13 px');
assert.equal(zhTokens.get('fs-12'), 'var(--fs-13)');
assert.equal(zhTokens.get('hollow-fill'), 'var(--hollow-ink)', 'zh-CN display type stays solid');
assert.throws(() => generate({ ...JSON.parse(readFileSync(TOKENS_JSON, 'utf8')), locale: { 'zh-CN': { 'no-such-token': '0' } } }),
  /overrides unknown token --no-such-token/);
assert.equal(cssLeft.trim(), '', 'tokens.css has no rule but :root token blocks');
assert.equal(cssBlocks.filter((b) => b.axis === null).length, 1, 'one :root block of defaults');

// A group's own sheet ("$sheet": the landing's, the manual's and the Gallery's tokens) is a pure token sheet in the tokens
// layer, holds exactly its group's tokens, and tokens.css holds none of them: the game's document and the other pages load
// none.
const sheetPaths = Object.keys(first).filter((path) => path.endsWith('.css') && path !== TOKENS_CSS);
assert.deepEqual(sheetPaths.map((path) => relative(ROOT, path)).sort(),
  ['src/ui/tokens/surface-badge-paper.css', 'src/ui/tokens/surface-badge.css', 'src/ui/tokens/surface-deploy.css', 'src/ui/tokens/surface-diagram.css', 'src/ui/tokens/surface-docs.css', 'src/ui/tokens/surface-gallery.css', 'src/ui/tokens/surface-home.css', 'src/ui/tokens/surface-pad.css', 'src/ui/tokens/surface-print.css'],
  'the landing, the manual, the Gallery, the technical diagrams, the item badges (and their paper hues) and Deploy each have their own token sheet');
const sheetDecls = new Map();
for (const path of sheetPaths) {
  const body = /^@layer reset,tokens,base,components,surfaces,utilities,overrides;\s*@layer tokens\{\s*:root\{([^}]*)\}\s*\}\s*$/
    .exec(first[path].replace(/\/\*[\s\S]*?\*\//g, '').trim());
  assert.ok(body, `${relative(ROOT, path)} is one :root block in the tokens layer`);
  const decls = parseDecls(body[1]);
  assert.deepEqual([...decls.keys()], tokens.filter((t) => t.sheet === relative(ROOT, path)).map((t) => t.name), `${relative(ROOT, path)} holds exactly its group`);
  for (const [name, value] of decls) {
    assert.ok(!cssBlocks[0].decls.has(name) && !cssBody.includes(`--${name}:`), `tokens.css leaves --${name} to ${relative(ROOT, path)}`);
    sheetDecls.set(name, value);
  }
}
assert.throws(() => generate({ ...source, component: { ...source.component, 'surface-x': { $sheet: 'src/ui/tokens/x.css', 'x-only': '1px' },
  'surface-y': { 'y-reads': '{x-only}' } } }), /--y-reads reads --x-only, which only src\/ui\/tokens\/x.css declares/,
'a shared token cannot read a token only one surface\'s sheet declares');
assert.throws(() => generate({ ...source, component: { ...source.component, 'surface-z': { $module: 'src/ui/tokens/z.ts', 'z-only': '1px' } } }),
  /names the module src\/ui\/tokens\/z\.ts; a sheet group's module/, 'a module belongs to a group with its own sheet');

/* 2. the SPEC 4.14 sheet -------------------------------------------------------------------------------------- */
// Starting values for tokens.json, verbatim from SPEC 4.14 (the font families follow the owner's 2026-10-17 ruling).
const SPEC_SHEET = `
--graphite-950:#050608;--graphite-900:#07090b;--graphite-850:#0b0e11;--graphite-800:#11151a;
--graphite-750:#161b21;--graphite-700:#1c222a;--graphite-600:#28303a;--graphite-500:#3a434e;
--paper-50:#f6f3ec;--paper-100:#ece8de;--paper-300:#c9c5bb;--paper-500:#9a9a95;--paper-600:#7c8187;--paper-700:#5d636a;
--tungsten-300:#ffd08a;--tungsten-400:#ffbd5c;--tungsten-500:#f0a030;--tungsten-600:#c97f1c;--tungsten-800:#4a2e0a;
--sky-400:#57b8ff;--sky-200:#b8e0ff;--vermilion-400:#ff5a4e;--mint-400:#5bd69b;--yellow-400:#ffd15c;
--out-pen:#56b4e9;--out-uncertain:#f0e442;--out-nopen:#d55e00;--out-ricochet:#cc79a7;--out-overmatch:#f3f6f8;
--prot-0:#ffea46;--prot-1:#e4cf5b;--prot-2:#c2b56d;--prot-3:#a09d75;--prot-4:#7e8278;--prot-5:#5d6878;--prot-6:#3e5478;
--sys-mobility:#5a7fb8;--sys-firepower:#8e8f88;--sys-ammo:#c4573f;--sys-fuel:#d9b867;--sys-electronics:#78d0e0;--sys-crew:#ece6d8;
--role-commander:#9ec9ff;--role-gunner:#ff9e7a;--role-loader:#c6a2ff;--role-driver:#7ee0b5;--role-radio:#ece8de;
--surface-scene:var(--graphite-950);--surface-page:var(--graphite-850);--surface-raised:var(--graphite-800);
--surface-menu:var(--graphite-750);--surface-hover:var(--graphite-700);--surface-plate:rgba(13,16,20,.86);
--hud-plate:rgba(13,16,20,.92);--hud-plate-strong:rgba(13,16,20,.96);--scrim:rgba(5,6,8,.72);
--ink-1:var(--paper-50);--ink-2:var(--paper-300);--ink-3:var(--paper-500);--ink-4:var(--paper-700);--ink-on-accent:#140d03;
--line-1:rgba(246,243,236,.07);--line-2:rgba(246,243,236,.13);--line-3:rgba(246,243,236,.24);
--accent:var(--tungsten-500);--accent-hi:var(--tungsten-400);--accent-lo:var(--tungsten-600);--accent-wash:rgba(240,160,48,.12);
--focus-ring:0 0 0 2px var(--graphite-900),0 0 0 4px var(--paper-50);
--team-own:var(--sky-400);--team-enemy:var(--vermilion-400);--team-squad:var(--mint-400);--team-neutral:var(--paper-100);
--ok:var(--mint-400);--warn:var(--yellow-400);--danger:var(--vermilion-400);--info:var(--sky-200);
--cot-user-text:1;--cot-type-scale:calc(var(--cot-ui-scale,1)*var(--cot-user-text));
--fs-11:calc(11px*var(--cot-type-scale));--fs-12:calc(12px*var(--cot-type-scale));--fs-13:calc(13px*var(--cot-type-scale));
--fs-14:calc(14px*var(--cot-type-scale));--fs-16:calc(16px*var(--cot-type-scale));--fs-18:calc(18px*var(--cot-type-scale));
--fs-20:calc(20px*var(--cot-type-scale));--fs-24:calc(24px*var(--cot-type-scale));--fs-32:calc(32px*var(--cot-type-scale));
--fs-44:calc(44px*var(--cot-type-scale));--fs-60:calc(60px*var(--cot-type-scale));--fs-88:calc(88px*var(--cot-type-scale));
--fs-128:calc(128px*var(--cot-type-scale));
--track-label:.12em;--track-label-s:.08em;--track-title:-.015em;--track-display:-.035em;
--lh-display:.92;--lh-title:1.08;--lh-body:1.55;--lh-docs:1.65;--lh-cjk:1.7;
--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;--s8:64px;--s9:96px;--s10:128px;
--r0:0;--r1:2px;--r2:4px;--r-pill:999px;
--e1:0 1px 0 rgba(255,255,255,.04) inset,0 0 0 1px var(--line-1);
--e2:0 1px 0 rgba(255,255,255,.05) inset,0 0 0 1px var(--line-2),0 12px 32px rgba(0,0,0,.35);
--e3:0 1px 0 rgba(255,255,255,.06) inset,0 0 0 1px var(--line-2),0 18px 48px rgba(0,0,0,.5);
--e4:0 1px 0 rgba(255,255,255,.07) inset,0 0 0 1px var(--line-3),0 32px 96px rgba(0,0,0,.6);
--z-hud-world:6;--z-hud-sight:8;--z-hud-status:18;--z-hud-controls:24;--z-hud-score:30;
--z-shell:100;--z-drawer:200;--z-menu:300;--z-modal:400;--z-toast:500;--z-boot:900;
--dur-instant:80ms;--dur-fast:140ms;--dur-base:220ms;--dur-screen:360ms;--dur-stage:700ms;
--ease-enter:cubic-bezier(.2,.8,.2,1);--ease-exit:cubic-bezier(.4,0,1,1);--ease-camera:cubic-bezier(.16,1,.3,1);`;
const spec = new Map([...SPEC_SHEET.matchAll(/--([a-z0-9-]+):([^;]+);/g)].map(([, n, v]) => [n, v.trim()]));
// Both sides compare as CSS with every var() of a defined token expanded: the generated sheet may reference a
// primitive where the SPEC wrote its hex (role-radio), and the runtime switches (--cot-ui-scale) stay var().
const generatedText = new Map(tokens.map((t) => [t.name, base.css(t.name)]));
const expand = (text, table) => text.replace(/var\(--([a-z0-9-]+)\)/g, (m, n) => (table.has(n) ? expand(table.get(n), table) : m));
const norm = (text) => String(text).toLowerCase().replace(/\s*,\s*/g, ',').replace(/(^|[^\d])0\./g, '$1.');
for (const [name, value] of spec) {
  assert.ok(names.has(name), `tokens.json holds the SPEC 4.14 token --${name}`);
  assert.equal(norm(expand(generatedText.get(name), generatedText)), norm(expand(value, spec)),
    `--${name} equals SPEC 4.14 (${value})`);
}
for (const t of tokens.filter((x) => typeof x.raw === 'string' && x.raw.startsWith('oklch('))) {
  assert.match(base.css(t.name), /^#[0-9a-f]{6}$|^rgba\(\d+,\d+,\d+,\.\d+\)$/, `--${t.name}: an OKLCH source emits hex`);
}
// The fallback slots are the type package's metric-matched local faces, one per family (BUI-F2 TYPE_FALLBACK_FAMILY:
// a display face never swaps through body metrics or the reverse, at any weight).
const FAMILY = { 'font-display': /^'Chakra Petch',(?:'Cot [A-Za-z]+',)*'Cot Display Fallback',/,
  'font-body': /^'IBM Plex Sans',(?:'Cot [A-Za-z]+',)*'Cot Body Fallback',/, 'font-mono': /^'IBM Plex Mono','Cot Mono Fallback',/ };
for (const [family, pattern] of Object.entries(FAMILY)) {
  assert.match(TOKENS[family], pattern, `--${family}: the owner's 2026-10-17 family, then its metric-matched fallback slot`);
}
assert.doesNotMatch(TOKENS['font-display'], /Narrow|Condensed/, 'a wide squared display face never falls back to a narrow one');
assert.equal(TOKENS.font, TOKENS['font-body'], '--font (SPEC 4.14) is the body family of the owner ruling');
assert.equal(TOKENS['font-ui'], FONT_STACK, '--font-ui is the stack every surface renders (fonts.ts FONT_STACK)');
assert.match(generatedCss, /--hud-font:var\(--font-ui\);/, '--hud-font is defined, on the shell family');
assert.ok(!TOKENS['hud-font'].includes('Monument'),
  '--hud-font never renders Monument (its tabular space glyph gaps the words under .cot-hud tabular-nums, SPEC 4.7)');

// Three tiers (SPEC 4.1): the component tier exists (plates, controls, chips, the HUD, focus brackets) and reads
// semantic or component colours only, never a colour ramp.
const RAMP_REF = /\{(graphite|paper|tungsten|sky|vermilion|mint|yellow)-\d+\}/;
for (const group of ['plate', 'shape', 'button', 'chip', 'type-effect', 'hud', 'focus-bracket']) {
  assert.ok(tokens.some((t) => t.tier === 'component' && t.group === group), `the component tier holds the ${group} tokens`);
}
for (const t of tokens.filter((x) => x.tier === 'component' && typeof x.raw === 'string')) {
  assert.doesNotMatch(t.raw, RAMP_REF, `component token --${t.name} reads a colour ramp; read a semantic token`);
}
// Hollow display type is the landing's (owner UI rule 5, "love the outline text tho"): no fill, the token's stroke, the
// token's shadow (which keeps the outline readable over bright media).
// The Premiere landing (da5395c763): the headline's last line wears the type package's .t-hollow (src/ui/typeFaces.ts);
// the h1 casts --hollow-shadow and its hollow line sets a 2 px stroke and drops the doubled shadow (src/presentation/home.css).
const tHollow = /\.t-hollow\{color:transparent;-webkit-text-stroke:var\(--hollow-stroke,([\d.]+px)\)/.exec(read('src/ui/typeFaces.ts'));
// (242: the hero's H1 is the outlined lockup, SPEC 3.1; the landing's hollow voice is its section headlines, 02 and 03)
const landingHollow = /\.home-h2 \.t-hollow\{--hollow-stroke:([\d.]+px);--hollow-ink:[^;]+;text-shadow:([^;}]+)\}/.exec(read('src/presentation/home.css'));
assert.ok(tHollow && landingHollow, 'the landing headlines keep their hollow Latin line (.t-hollow) and its shadow');
assert.equal(TOKENS['hollow-fill'], 'transparent', 'hollow type is truly hollow, as on the landing');
assert.equal(TOKENS['hollow-stroke'], tHollow[1], 'the shared hollow stroke is the type package\'s default');
// the section headlines draw the direction's 1.8 px outline at their 60-88 px display size (02 header h2 .fx-hollow)
assert.equal(landingHollow[1], '1.8px', 'the landing headlines draw the direction\'s 1.8 px outline');
assert.equal(landingHollow[2], 'var(--hollow-shadow)', 'the landing headlines cast the hollow shadow token');
// Boot cost (SPEC 16.1): tokens.css at most 4 KB brotli (the shipped file is minified, so this bound is conservative).
const tokensBrotli = brotliCompressSync(Buffer.from(generatedCss), { params: { [zlib.BROTLI_PARAM_QUALITY]: 11 } }).length;
assert.ok(tokensBrotli <= 4096, `tokens.css is ${tokensBrotli} B brotli, over the 4 KB boot budget`);

/* 3a. contrast (SPEC 4.4) ------------------------------------------------------------------------------------- */
const rgbaOf = (name, resolver = base) => {
  const c = resolver.colour(name);
  assert.ok(c, `--${name} is a colour`);
  return [...c.rgb, c.alpha ?? 1];
};
const opaque = (name, resolver = base) => {
  const c = rgbaOf(name, resolver);
  assert.equal(c[3], 1, `--${name} is opaque`);
  return c.slice(0, 3);
};
const BRIGHT = { white: [255, 255, 255], sand: hexToRgb('#d8c49a'), sky: hexToRgb('#a8c8e8') };
const table = [];
const floor = (label, ratio, min) => {
  table.push(`${label} ${ratio.toFixed(2)}`);
  assert.ok(ratio >= min, `${label}: ${ratio.toFixed(2)}:1 is below the ${min}:1 floor`);
};
const surfaces = ['surface-page', 'surface-raised', 'surface-menu'];
for (const ink of ['ink-1', 'ink-2', 'ink-3']) {
  for (const surface of surfaces) floor(`${ink}/${surface}`, contrast(opaque(ink), opaque(surface)), 4.5);
}
const page = opaque('surface-page');
floor('accent/page', contrast(opaque('accent'), page), 4.5);
floor('accent-hi/page', contrast(opaque('accent-hi'), page), 4.5);
floor('ink-on-accent/accent', contrast(opaque('ink-on-accent'), opaque('accent')), 4.5);
for (const name of ['out-ricochet', 'out-nopen']) floor(`${name}/page`, contrast(opaque(name), page), 3);
// focus is neutral (lead, 2026-10-26): the ring's outer edge and a focus outline are paper, never the accent of the one
// selected state (SPEC 4.14 drew the ring in tungsten-400)
assert.equal(TOKENS['focus-ink'], TOKENS['paper-50'], '--focus-ink is the neutral paper ink');
floor('focus ring/gap', contrast(opaque('paper-50'), opaque('graphite-900')), 3);
floor('focus ring/page', contrast(opaque('paper-50'), page), 3);
assert.ok(rgbaOf('hud-plate')[3] >= 0.92, 'HUD plates are never below .92');
assert.ok(rgbaOf('hud-plate-strong')[3] >= 0.96, 'strong HUD plates are .96 or more');

// What a colour sits on: the opaque surfaces, and both plates composited over the brightest backgrounds.
const presetSource = (axis, preset) => Object.fromEntries(Object.entries(source.preset[axis][preset]).filter(([k]) => !meta(k)));
const SURFACES = [...surfaces, 'surface-hover'];
const grounds = (resolver = base, list = SURFACES) => [
  ...list.map((s) => [s.replace('surface-', ''), opaque(s, resolver)]),
  ...['surface-plate', 'hud-plate'].flatMap((plate) => Object.entries(BRIGHT)
    .map(([bgName, bg]) => [`${plate} over ${bgName}`, composite(rgbaOf(plate, resolver), bg)])),
];
// A colour against one ground; translucent colours are composited onto it first.
const against = (name, ground, resolver = base) => contrast(composite(rgbaOf(name, resolver), ground), ground);

// Text (SPEC 4.4): every ink and every coloured-text role 4.5:1 on each surface and on both plates over bright imagery,
// in the default palette and under every colour-vision preset. A text role whose $never names --surface-plate is kept
// off that plate over imagery (the .92 HUD plate instead): its plate value is printed, not floored. High contrast
// floors every text role on every ground, plates included.
const cvdNames = Object.keys(source.preset.cvd).filter((k) => !meta(k));
const TEXT = ['ink-1', 'ink-2', 'ink-3', ...tokens.filter((t) => t.group === 'text-tone').map((t) => t.name)];
assert.deepEqual(TEXT.slice(3).map((n) => byName.get(n).raw),
  ['{team-own}', '{team-enemy}', '{team-squad}', '{ok}', '{warn}', '{danger}', '{info}', '{accent}'],
  'the coloured-text roles read the team, state and accent colours');
const plateNotes = [];
const textFloors = (label, resolver, min, inks = TEXT, keptOff = true) => {
  for (const ink of inks) {
    const offPlate = keptOff && /--surface-plate/.test(byName.get(ink).meta.$never ?? '');
    for (const [ground, rgb] of grounds(resolver)) {
      const ratio = against(ink, rgb, resolver);
      if (offPlate && ground.startsWith('surface-plate')) { plateNotes.push(`${label}${ink} on ${ground} ${ratio.toFixed(2)} (kept off)`); continue; }
      floor(`${label}${ink}/${ground}`, ratio, min);
    }
  }
};
textFloors('', base, 4.5);
for (const p of cvdNames) textFloors(`${p}: `, createResolver(tokens, presetSource('cvd', p)), 4.5, TEXT.slice(3));
for (const [ground, rgb] of grounds()) if (ground.startsWith('surface-plate')) {
  assert.ok(against('ink-2', rgb) >= 4.5 && against('ink-2', rgb) > against('text-enemy', rgb), 'ink-2 holds where vermilion text is kept off');
}

// Non-text parts a player must perceive (SPEC 4.4): the control border and every control edge 3:1 on each surface and
// plate. line-1/2/3 are decoration (SPEC 4.14's 7 / 13 / 24 %, 1.15-2.10:1): no control edge may read them.
const CONTROL_EDGES = ['line-control', 'focus-bracket-color', ...tokens
  .filter((t) => t.tier === 'component' && ['button', 'chip'].includes(t.group) && /edge/.test(t.name) && base.colour(t.name))
  .map((t) => t.name)];
assert.deepEqual(CONTROL_EDGES.slice(2), ['btn-secondary-edge', 'btn-press-edge', 'btn-danger-edge', 'chip-edge', 'chip-edge-on'],
  'every button and chip edge is measured');
const LINES = ['line-1', 'line-2', 'line-3'];
for (const name of CONTROL_EDGES) {
  assert.doesNotMatch(String(byName.get(name).raw), /\{line-[123]\}/, `--${name} is a control edge: it reads --line-control, never a decorative line`);
}
const lineNotes = LINES.map((line) => `${line} ${surfaces.map((s) => against(line, opaque(s)).toFixed(2)).join('/')}`);
const edgeFloors = (label, resolver, names, min) => {
  for (const name of names) for (const [ground, rgb] of grounds(resolver)) floor(`${label}${name}/${ground}`, against(name, rgb, resolver), min);
};
edgeFloors('', base, CONTROL_EDGES, 3);

// High contrast (SPEC 4.6): all text 7:1 (inks and coloured text, which turns to ink-1), every line 3:1 (the plate
// edges and rings become visible), and the control border 4.5:1, a step above the lines.
const high = createResolver(tokens, presetSource('contrast', 'high'));
textFloors('high: ', high, 7, TEXT, false);
edgeFloors('high: ', high, LINES, 3);
edgeFloors('high: ', high, CONTROL_EDGES, 4.5);
for (const name of TEXT.slice(3)) assert.equal(high.value(name), high.value('ink-1'), `high contrast sets --${name} in ink-1`);
// The floors fire on the shipped decorative lines: SPEC 4.14's line-2 is no control border.
assert.throws(() => floor('probe: line-2 as a control edge', against('line-2', page), 3), /below the 3:1 floor/);
table.pop();

// Every number SPEC 4.4 prints, recomputed from the tokens (two decimals; at most 0.006 off for the SPEC's rounding).
const SPEC_CONTRAST = [
  ...['ink-1', 'ink-2', 'ink-3', 'ink-4'].flatMap((ink, i) => surfaces.map((s, j) => [ink, s,
    [[17.46, 16.54, 15.62], [11.23, 10.63, 10.05], [6.85, 6.48, 6.13], [3.19, 3.02, 2.85]][i][j]])),
  ['tungsten-500', 'surface-page', 9.01], ['tungsten-400', 'surface-page', 11.69], ['ink-on-accent', 'tungsten-500', 8.98],
  ['sky-400', 'surface-page', 8.94], ['vermilion-400', 'surface-page', 6.29], ['mint-400', 'surface-page', 10.63],
  ['yellow-400', 'surface-page', 13.39], ['out-ricochet', 'surface-page', 6.32], ['out-nopen', 'surface-page', 5.0],
];
let specDrift = 0;
const specMatch = (got, want, tolerance, label) => {
  specDrift = Math.max(specDrift, Math.abs(got - want) / tolerance);
  assert.ok(Math.abs(got - want) <= tolerance, `${label}: computed ${got.toFixed(3)}`);
};
for (const [fg, bg, want] of SPEC_CONTRAST) specMatch(contrast(opaque(fg), opaque(bg)), want, 0.006, `SPEC 4.4: ${fg} on ${bg} is ${want}`);
const SPEC_PLATES = { 'surface-plate': [[11.76, 7.56, 4.61], [13.15, 8.46, 5.16], [13.08, 8.41, 5.13]],
  'hud-plate': [[14.24, 9.16, 5.58], [15.07, 9.69, 5.91], [14.99, 9.64, 5.88]] };
for (const [plate, rows] of Object.entries(SPEC_PLATES)) {
  Object.entries(BRIGHT).forEach(([bgName, bg], i) => ['ink-1', 'ink-2', 'ink-3'].forEach((ink, j) => {
    specMatch(contrast(opaque(ink), composite(rgbaOf(plate), bg)), rows[i][j], 0.006, `SPEC 4.4: ${ink} on ${plate} over ${bgName} is ${rows[i][j]}`);
  }));
}

// The floors fire: a darkened ink-3 and today's green/red team pair (SPEC 4.5: deutan ΔE 19.3) both fail.
const dim = createResolver(tokens, { 'ink-3': 'oklch(45% 0 0)' });
assert.throws(() => floor('probe: dim ink-3/page', contrast(opaque('ink-3', dim), page), 4.5), /below the 4.5:1 floor/);
table.pop();
assert.ok(deltaE('deutan', hexToRgb('#7ee87e'), hexToRgb('#f05a5a')) < 40, 'the old team pair fails the own~enemy deutan floor');

/* 3b. colour vision (SPEC 4.5, 4.6) --------------------------------------------------------------------------- */
const cvd = [];
const closest = (view, list, resolver = base, pairs = null) => {
  let worst = Infinity;
  let pair = '';
  const candidates = pairs ?? list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));
  for (const [a, b] of candidates) {
    const d = deltaE(view, opaque(a, resolver), opaque(b, resolver));
    if (d < worst) { worst = d; pair = `${a}~${b}`; }
  }
  return { worst, pair };
};
const minPair = (label, list, mins, resolver = base, pairs = null) => {
  for (const view of VISION_VIEWS) {
    const min = mins[view];
    if (min === undefined) continue;
    const { worst, pair } = closest(view, list, resolver, pairs);
    cvd.push(`${label} ${view} ${worst.toFixed(1)} (${pair})`);
    assert.ok(worst >= min, `${label} in ${view} vision: ΔE ${worst.toFixed(1)} (${pair}) is below the floor ${min}`);
  }
};
const every = (min) => Object.fromEntries(VISION_VIEWS.map((v) => [v, min]));
const prot = tokens.filter((t) => t.group === 'protection').map((t) => t.name);
const protNeighbours = prot.slice(1).map((name, i) => [prot[i], name]);
const roles = tokens.filter((t) => t.group === 'role');
const OUTCOMES = ['out-pen', 'out-uncertain', 'out-nopen', 'out-ricochet', 'out-overmatch'];
const SYSTEMS = ['sys-mobility', 'sys-firepower', 'sys-ammo', 'sys-fuel', 'sys-electronics', 'sys-crew'];
minPair('own~enemy', ['team-own', 'team-enemy'], every(40));
minPair('enemy~squad', ['team-enemy', 'team-squad'], every(25));
minPair('own~squad', ['team-own', 'team-squad'], every(12));
minPair('outcomes', OUTCOMES, every(20));
minPair('systems', SYSTEMS, every(20));
minPair('ok~warn~danger', ['ok', 'warn', 'danger'], { normal: 20, deutan: 20, protan: 20 });
minPair('protection neighbours', prot, { normal: 14, deutan: 14, protan: 14, tritan: 9 }, base, protNeighbours);
for (const [a, b] of protNeighbours) {
  assert.ok(luminance(opaque(b)) < luminance(opaque(a)),
    `protection luminance falls monotonically (${a} -> ${b}), so the ramp reads in greyscale`);
}
assert.equal(prot.length, 7, 'seven absolute protection steps');
assert.deepEqual(roles.map((t) => t.meta.$glyph), ['C', 'G', 'L', 'D', 'R'], 'every crew-role colour carries its letter glyph');
for (const name of ['team-own', 'team-enemy', 'team-squad']) {
  assert.ok(byName.get(name).meta.$glyph, `--${name} is drawn with a shape, never colour alone`);
}

// Every number SPEC 4.5 prints, recomputed (one decimal; at most 0.06 off for the SPEC's rounding). SPEC's crew-role row is the four coloured roles; with
// radio/bow (paper-100) the protan closest pair is driver~radio 14.2, reported below (the letter glyph is mandatory).
const COLOURED_ROLES = roles.filter((t) => t.meta.$glyph !== 'R').map((t) => t.name);
const OLD_TEAM = createResolver(tokens, { 'team-own': 'oklch(84.3% 0.174 143.8)', 'team-enemy': 'oklch(66.5% 0.185 23.6)' });
assert.equal(OLD_TEAM.value('team-own'), '#7ee87e');
assert.equal(OLD_TEAM.value('team-enemy'), '#f05a5a');
const SPEC_VISION = [
  ['team own vs enemy', ['team-own', 'team-enemy'], [109.7, 94.2, 70.6, 124.0]],
  ["today's team pair", ['team-own', 'team-enemy'], [112.7, 19.3, 47.3, 117.7], OLD_TEAM],
  ['enemy vs squad', ['team-enemy', 'team-squad'], [113.3, 33.2, 28.4, 127.2]],
  ['own vs squad', ['team-own', 'team-squad'], [74.9, 62.9, 64.3, 13.3]],
  ['outcome set, closest pair', OUTCOMES, [44.4, 31.4, 20.7, 21.5]],
  ['protection ramp, closest neighbours', prot, [15.4, 16.0, 14.4, 9.2], base, protNeighbours],
  ['anatomy systems, closest pair', SYSTEMS, [32.5, 24.2, 22.1, 25.4]],
  ['crew roles, closest pair', COLOURED_ROLES, [34.8, 9.5, 16.9, 14.8]],
  ['ok / damaged / destroyed, closest pair', ['ok', 'warn', 'danger'], [66.7, 26.4, 28.4, null]],
];
for (const [label, list, want, resolver = base, pairs = null] of SPEC_VISION) {
  VISION_VIEWS.forEach((view, i) => {
    if (want[i] === null) return;
    specMatch(closest(view, list, resolver, pairs).worst, want[i], 0.06, `SPEC 4.5: ${label}, ${view} ${want[i]}`);
  });
}
for (const view of VISION_VIEWS) {
  const { worst, pair } = closest(view, roles.map((t) => t.name));
  cvd.push(`roles with radio/bow ${view} ${worst.toFixed(1)} (${pair}, letter glyph mandatory)`);
}

// The presets keep their own pairs apart in the vision they serve.
const cvdPresets = cvdNames;
const served = { deutan: ['normal', 'deutan'], protan: ['normal', 'protan'], tritan: ['normal', 'tritan'], classic: ['normal'] };
assert.deepEqual(cvdPresets, Object.keys(served), 'every colour-vision preset declares the views it serves');
for (const view of ['deutan', 'protan']) {
  const r = createResolver(tokens, presetSource('cvd', view));
  minPair(`${view} preset own~enemy`, ['team-own', 'team-enemy'], { normal: 40, [view]: 40 }, r);
  minPair(`${view} preset enemy~squad`, ['team-enemy', 'team-squad'], { [view]: 25 }, r);
}
minPair('tritan preset own~squad', ['team-own', 'team-squad'],
  { normal: 12, tritan: 12 }, createResolver(tokens, presetSource('cvd', 'tritan')));

// Shape-coded pairs (SPEC 4.5's own~squad floor, 12): every team colour against the others, the objective neutral and
// the accent (selection edge, primary fill, HUD action), in the default palette and every preset, in the views each
// serves. A pair under the floor needs a pinned $tradeoff record with its measured values, so it can never pass
// silently and any change to its colours reopens the decision.
const SHAPE_FLOOR = 12;
const SHAPE_PAIRS = [['team-own', 'team-squad'], ['team-own', 'team-neutral'], ['team-enemy', 'team-neutral'],
  ['team-squad', 'team-neutral'], ['team-own', 'accent'], ['team-enemy', 'accent'], ['team-squad', 'accent']];
const pinned = [];
const shapeChecks = [['default', base, VISION_VIEWS, []],
  ...cvdPresets.map((p) => [p, createResolver(tokens, presetSource('cvd', p)), served[p], source.preset.cvd[p].$tradeoff ?? []])];
for (const [preset, resolver, views, records] of shapeChecks) {
  assert.ok(Array.isArray(records), `${preset}: $tradeoff is a list of pinned pairs`);
  const used = new Set();
  for (const [a, b] of SHAPE_PAIRS) for (const view of views) {
    const d = deltaE(view, opaque(a, resolver), opaque(b, resolver));
    if (d >= SHAPE_FLOOR) continue;
    const record = records.find((r) => r.pair === `${a}~${b}`);
    assert.ok(record && record[view] !== undefined,
      `${preset}: ${a}~${b} ΔE ${d.toFixed(1)} in ${view} vision is under ${SHAPE_FLOOR} with no $tradeoff record`);
    assert.equal(d.toFixed(1), record[view].toFixed(1), `${preset}: the pinned ${a}~${b} trade-off moved (${view})`);
    used.add(record);
    pinned.push(`${preset} ${a.replace('team-', '')}~${b.replace('team-', '')} ${view} ${d.toFixed(1)} (pinned)`);
  }
  for (const record of records) {
    assert.ok(used.has(record), `${preset}: the $tradeoff record ${record.pair} pins nothing under the floor (stale)`);
    for (const view of views) assert.ok(record[view] !== undefined, `${preset}: the ${record.pair} trade-off records every served view (${view})`);
  }
}
assert.ok(typeof source.preset.cvd.$tradeoff === 'string', 'the colour-vision trade-offs are written down in tokens.json');
// SPEC 4.6's deutan/protan orange buys enemy~squad; the measured alternative (enemy stays vermilion, squad takes the
// tritan treatment) is printed beside it, so the SPEC amendment it would need can be decided on numbers.
const alternatives = [];
for (const view of ['deutan', 'protan']) {
  const shipped = createResolver(tokens, presetSource('cvd', view));
  const gain = deltaE(view, opaque('team-enemy', shipped), opaque('team-squad', shipped));
  assert.ok(gain >= 40 && gain > deltaE(view, opaque('team-enemy'), opaque('team-squad')),
    `${view}: the orange must buy enemy~squad separation (ΔE ${gain.toFixed(1)})`);
  const alt = createResolver(tokens, overridesOfAlt(view));
  const row = (r) => ['team-enemy~accent', 'team-enemy~team-squad', 'team-own~team-squad', 'team-squad~team-neutral']
    .map((pair) => { const [a, b] = pair.split('~'); return `${pair.replaceAll('team-', '')} ${deltaE(view, opaque(a, r), opaque(b, r)).toFixed(1)}`; }).join(', ');
  alternatives.push(`${view}: shipped ${row(shipped)} | alternative ${row(alt)}`);
}
function overridesOfAlt(view) {
  const alt = source.preset.cvd.$alternative?.[view];
  assert.ok(alt, `the ${view} alternative is recorded in tokens.json ($alternative)`);
  return { ...presetSource('cvd', view), 'team-enemy': byName.get('team-enemy').raw, ...alt };
}

assert.equal(tokenValue('team-enemy', { cvd: 'deutan' }), '#e69f00', 'tokens.ts applies the colour-vision presets (SPEC 4.6)');
assert.equal(tokenValue('ink-3', { contrast: 'high' }), TOKENS['ink-2'], 'tokens.ts applies high contrast');
assert.equal(tokenValue('team-enemy'), TOKENS['vermilion-400'], 'default presets');
assert.deepEqual(Object.keys(TOKEN_PRESETS).sort(), ['contrast', 'cvd', 'motion']);
for (const name of Object.keys(TOKEN_MS)) assert.equal(TOKEN_PRESETS.motion.reduce.set[name], '1ms', `reduce motion collapses --${name}`);
assert.equal(TOKEN_MS['dur-base'], 220);
assert.equal(TOKEN_PX['fs-11'], 11, 'nothing a player must read is below 11 px');
assert.ok(Math.min(...Object.entries(TOKEN_PX).filter(([n]) => n.startsWith('fs-')).map(([, v]) => v)) >= 11);

/* 4. presets: tokens.ts equals the tokens.css cascade, for every token under every combination ------------------- */
const presetBlocks = cssBlocks.filter((b) => b.axis !== null);
assert.deepEqual(presetBlocks.map((b) => `${b.axis}=${b.preset}`),
  Object.entries(TOKEN_PRESETS).flatMap(([axis, p]) => Object.keys(p).map((preset) => `${axis}=${preset}`)),
  'tokens.css and tokens.ts carry the same presets in the same order');
const reduceBlock = presetBlocks.find((b) => b.axis === 'motion' && b.preset === 'reduce');
assert.equal(mediaBlocks.length, 1, 'one OS media block');
assert.equal(mediaBlocks[0].query, '(prefers-reduced-motion:reduce)', 'the OS reduce-motion switch');
assert.deepEqual([...mediaBlocks[0].decls], [...reduceBlock.decls], 'the OS switch sets exactly the data-motion=reduce hook');
// BUI-F9: the OS copy applies only while the player follows the OS (no data-motion attribute): data-motion=reduce collapses
// the durations whatever the OS says, data-motion=full keeps them whatever it says (SPEC 9, both ways).
assert.equal(mediaBlocks[0].guard, 'motion', 'the OS reduce-motion copy yields to an explicit data-motion choice');
// the cascade on a page: tokens.css, and the surface's own sheet where the page imports it
const defaults = new Map([...cssBlocks.find((b) => b.axis === null).decls, ...sheetDecls]);
const resolveCss = (text, decls, depth = 0) => {
  assert.ok(depth < 32, `tokens.css reference cycle near ${text}`);
  return text.replace(/var\(--([a-z0-9-]+)\)/g, (m, n) => (decls.has(n) ? resolveCss(decls.get(n), decls, depth + 1) : m));
};
const choices = (axis) => [null, ...Object.keys(TOKEN_PRESETS[axis])];
let comparisons = 0;
for (const cvdChoice of choices('cvd')) for (const contrastChoice of choices('contrast')) for (const motionChoice of choices('motion')) {
  const selection = Object.fromEntries([['cvd', cvdChoice], ['contrast', contrastChoice], ['motion', motionChoice]].filter(([, v]) => v));
  const decls = new Map(defaults);
  for (const block of presetBlocks) {
    if (selection[block.axis] !== block.preset) continue;
    for (const [k, v] of block.decls) decls.set(k, v);
  }
  const label = Object.entries(selection).map(([a, p]) => `${a}=${p}`).join(' ') || 'defaults';
  // The truth: every selected preset's overrides merged into one table and resolved through the reference graph.
  const truth = createResolver(tokens, Object.assign({}, ...Object.entries(selection).map(([a, p]) => presetSource(a, p))));
  // (a module's tokens are not tokens.ts's: no preset may move a sheet's token, and their values are checked above)
  for (const t of tokens.filter((token) => !token.module)) {
    const css = resolveCss(decls.get(t.name), decls);
    const ts = tokenValue(t.name, selection);
    assert.equal(ts, truth.value(t.name), `${label}: tokenValue('${t.name}') must equal the merged presets`);
    if (t.scale) {
      assert.equal(css, `calc(${t.raw}px*${resolveCss(`var(--${t.scale})`, decls)})`, `${label}: --${t.name} scales in CSS`);
      assert.equal(ts, `${t.raw}px`, `${label}: --${t.name} is px at scale 1 in tokens.ts`);
    } else {
      assert.equal(ts, css, `${label}: tokenValue('${t.name}') must equal the tokens.css cascade`);
    }
    comparisons++;
  }
}
// The round-2 findings, by name: derived tokens follow their sources; a direct override beats another axis's derivation.
assert.equal(tokenValue('text-enemy', { cvd: 'deutan' }), '#e69f00', 'enemy text follows the deutan enemy colour');
assert.equal(tokenValue('text-enemy', { cvd: 'deutan', contrast: 'high' }), TOKENS['ink-1'], 'high contrast sets enemy text in ink-1 under any preset');
assert.equal(tokenValue('text-enemy', { contrast: 'high', cvd: 'deutan' }), TOKENS['ink-1'], 'whatever order the selection lists its axes');
assert.equal(tokenValue('plate-fill', { contrast: 'high' }), 'rgba(13,16,20,.96)', 'plate-fill follows --surface-plate');
assert.equal(tokenValue('plate-edge', { contrast: 'high' }), tokenValue('line-3', { contrast: 'high' }), 'plate-edge follows --line-1 to line-3');
assert.match(tokenValue('e2', { contrast: 'high' }), /1px rgba\(246,243,236,\.38\)/, 'e2 draws the 3:1 line-3 ring');
assert.equal(tokenValue('focus-bracket-dur', { motion: 'reduce' }), '1ms', 'focus brackets stop under reduce motion');

/* 5. aliases, --hud-font, primitive isolation, wiring --------------------------------------------------------- */
const parseColour = (text) => {
  const s = String(text).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return [...hexToRgb(s), 1];
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(s.replace(/\s+/g, ''));
  assert.ok(m, `not a colour: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
};
// A translucent colour is compared where it renders, over black and over white; the larger ΔE counts.
const colourDistance = (a, b) => Math.max(...[[0, 0, 0], [255, 255, 255]].map((bg) => deltaE('normal', composite(a, bg), composite(b, bg))));
const bezier = ([x1, y1, x2, y2]) => {
  const at = (p1, p2, t) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (at(x1, x2, mid) < x) lo = mid; else hi = mid; }
    return at(y1, y2, (lo + hi) / 2);
  };
};
const curveOf = (text) => text.replace(/\s+/g, '').slice(13, -1).split(',').map(Number);
const curveDistance = (a, b) => {
  const f = bezier(a);
  const g = bezier(b);
  let worst = 0;
  for (let i = 0; i <= 200; i++) worst = Math.max(worst, Math.abs(f(i / 200) - g(i / 200)));
  return worst;
};
for (const [name, points] of Object.entries(TOKEN_EASE)) {
  assert.equal(norm(`cubic-bezier(${points.join(',')})`), norm(TOKENS[name]), `TOKEN_EASE['${name}'] are --${name}'s control points`);
}
assert.deepEqual(Object.keys(TOKEN_EASE), tokens.filter((t) => t.group === 'easing').map((t) => t.name), 'TOKEN_EASE carries every easing');

const shifts = [];
const aliasFiles = Object.entries(source.alias).filter(([file]) => !meta(file));
for (const [file, aliases] of aliasFiles) {
  const text = read(file);
  for (const [legacy, entry] of Object.entries(aliases)) {
    const target = typeof entry === 'string' ? entry : entry.value;
    const was = entry.$was;
    const specFold = entry.$spec ?? null;
    assert.ok(names.has(target), `${file}: --${legacy} aliases an undefined token --${target}`);
    assert.ok(was !== undefined, `${file}: --${legacy} records the value it shipped with ($was)`);
    const decl = new RegExp(`--${legacy}\\s*:\\s*var\\(--${target}\\s*,\\s*([^;]+?)\\)\\s*;`).exec(text);
    assert.ok(decl, `${file}: --${legacy} must be var(--${target},<fallback>)`);
    assert.equal(norm(decl[1]), norm(TOKENS[target]), `${file}: --${legacy} fallback equals --${target}`);
    // The nearest token of the target's family (same tier and group).
    const tok = byName.get(target);
    const family = tokens.filter((t) => t.tier === tok.tier && t.group === tok.group);
    let distance;
    let rival = null;
    let unit;
    if (base.colour(target)) {
      unit = (d) => `ΔE ${d.toFixed(1)}`;
      assert.notEqual(tok.tier, 'primitive', `${file}: --${legacy} must alias a semantic or component colour, not a ramp`);
      distance = (name) => colourDistance(parseColour(was), rgbaOf(name));
      rival = family.filter((t) => base.colour(t.name));
    } else if (/^\d+ms$/.test(TOKENS[target])) {
      unit = (d) => `${d} ms`;
      distance = (name) => Math.abs(parseInt(was, 10) - TOKEN_MS[name]);
      rival = family.filter((t) => Object.hasOwn(TOKEN_MS, t.name));
    } else if (Object.hasOwn(TOKEN_EASE, target)) {
      unit = (d) => `largest progress difference ${d.toFixed(3)}`;
      distance = (name) => curveDistance(curveOf(was), TOKEN_EASE[name]);
      rival = family.filter((t) => Object.hasOwn(TOKEN_EASE, t.name));
    } else {
      assert.equal(String(was), TOKENS[target], `${file}: --${legacy} keeps its exact value (${was})`);
      continue;
    }
    const own = distance(target);
    if (specFold) {
      // A SPEC-named fold (SPEC 4.2: tungsten-500 replaces #ffd27a) overrides the nearest-token rule; it is printed.
      assert.match(specFold, /^SPEC \d+\.\d+: /, `${file}: --${legacy} names the SPEC section that folds it`);
      assert.equal(TOKENS[target], TOKENS.accent, `${file}: --${legacy} folds into the one brand amber`);
      shifts.push(`--${legacy} ${was} -> --${target} ${TOKENS[target]} (${unit(own)}; ${specFold})`);
      continue;
    }
    for (const t of rival) {
      assert.ok(own <= distance(t.name), `${file}: --${legacy} (${was}) is nearer --${t.name} than --${target}`);
    }
    if (own > 0) shifts.push(`--${legacy} ${was} -> --${target} ${TOKENS[target]} (${unit(own)})`);
  }
}

const motion = read('src/ui/motion.css');
for (const legacy of Object.keys(source.alias['src/ui/motion.css']).filter((n) => n.startsWith('cot-motion-'))) {
  assert.match(motion, new RegExp(`@media \\(prefers-reduced-motion: reduce\\)[\\s\\S]*--${legacy}: 1ms;`),
    `motion.css collapses --${legacy} for reduced-motion users on pages without tokens.css`);
}
// The presets are hooks that src/ui/accessibilityPreferences.ts (BUI-F9) writes from the player's choices; with no
// data-motion attribute the OS reduce-motion switch decides.
assert.match(generatedCss, /:root\[data-motion=reduce\]\{[^}]*--dur-base:1ms;/, 'the data-motion=reduce hook for the Reduce motion setting');
assert.match(generatedCss, /@media \(prefers-reduced-motion:reduce\)\{\s*:root:not\(\[data-motion\]\)\{[^}]*--dur-base:1ms;/, 'the OS reduce-motion switch');

// Nothing outside the token package reads a colour ramp (SPEC 4.1), the aliases included.
const PRIMITIVE_READ = /var\(--(graphite|paper|tungsten|sky|vermilion|mint|yellow)-\d+\b/g;
const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const path = `${dir}/${e.name}`;
  if (e.isDirectory()) return path === 'src/ui/tokens' ? [] : walk(path);
  return /\.(css|ts|html)$/.test(e.name) && !/\.selftest\.|\.test\./.test(e.name) ? [path] : [];
});
const scanned = [...walk('src'), ...walk('site'), 'index.html', '404.html'];
for (const file of scanned) {
  for (const m of read(file).matchAll(PRIMITIVE_READ)) {
    assert.fail(`${file}: reads the primitive ${m[0]}) — read a semantic or component token`);
  }
}

// No file redefines a legacy name as a literal (that would cut it loose from its token); the one exception is
// motion.css collapsing its durations to 1ms for reduced-motion users on pages without tokens.css.
const legacyNames = aliasFiles.flatMap(([, a]) => Object.keys(a));
const publicCss = readdirSync(join(ROOT, 'public'), { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.css')).map((e) => `public/${e.name}`);
for (const file of [...scanned, ...publicCss]) {
  const text = read(file);
  for (const legacy of legacyNames) {
    for (const m of text.matchAll(new RegExp(`--${legacy}\\s*:(?!\\s*var\\(--)[^;}]*[;}]`, 'g'))) {
      if (file === 'src/ui/motion.css' && /:\s*1ms;$/.test(m[0])) continue;
      assert.fail(`${file}: --${legacy} is defined as a literal (${m[0]}); it aliases a token`);
    }
  }
}

// Breakpoints and grid (SPEC 4.8).
const maxima = (bands) => Object.fromEntries(Object.entries(bands).filter(([, b]) => Number.isFinite(b.max)).map(([k, b]) => [k, b.max]));
assert.deepEqual(TOKEN_BREAKPOINTS, { width: maxima(VIEWPORT_WIDTH_BANDS), height: maxima(VIEWPORT_HEIGHT_BANDS) },
  'breakpoints mirror responsiveLayout.ts');
assert.deepEqual(TOKEN_GRID, {
  phone: { min: 0, columns: 4, margin: 16, gutter: 12 }, tablet: { min: 768, columns: 8, margin: 32, gutter: 16 },
  laptop: { min: 1024, columns: 12, margin: 48, gutter: 20 }, desktop: { min: 1280, columns: 12, margin: 64, gutter: 24 },
}, 'the SPEC 4.8 grid');

// Wiring: the game document links the tokens first; the build keeps them a stylesheet chunk whose name is as long as
// the production archive's it replaced in that slot (the entry's placeholder comment keeps its padding); the archive
// stylesheet loads where the Studio mounts the archive.
const gameHtml = read('index.html');
const tokensLink = gameHtml.indexOf('<link rel="stylesheet" href="/src/ui/tokens/tokens.css" />');
assert.ok(tokensLink >= 0 && tokensLink === gameHtml.search(/<link rel="stylesheet"/)
  && tokensLink < gameHtml.indexOf('<script type="module" src="/src/main.ts">'),
  'the game document links the tokens before any other stylesheet and ahead of the entry');
assert.equal(gameHtml.split('/src/ui/tokens/tokens.css').length, 2, 'the game document loads the tokens once');
assert.ok(!gameHtml.includes('mediaArchive.css'), 'the game boot does not link the production archive stylesheet');
const viteGroup = /\{ name: '([A-Za-z]+)', test: \/\[\\\\\/\]src\[\\\\\/\]ui\[\\\\\/\]tokens\[\\\\\/\]tokens\\\.css\$\//.exec(read('vite.config.ts'));
assert.ok(viteGroup, 'vite.config.ts keeps tokens.css in a chunk group of its own');
assert.equal(viteGroup[1].length, 'mediaArchive'.length, `the tokens chunk name (${viteGroup[1]}) keeps the entry's bytes`);
assert.match(read('src/ui/studioPanel.ts'), /import\('\.\.\/presentation\/mediaArchive\.css'\)\s*\.then\(\(\) => mountMediaArchive\(/,
  'the Studio, the game\'s one archive host, loads the archive stylesheet before it mounts the archive');

/* 6. one source with the type package ------------------------------------------------------------------------ */
// The type package (BUI-F2) declares the font families in each document's head (src/ui/typeFaces.ts typeTokenCss) and
// reads --hollow-stroke / --hollow-ink. Whichever of the two packages lands second reconciles here: every custom
// property both declare must carry the same value, and every token its rules read must exist.
const typeFacesPath = join(ROOT, 'src/ui/typeFaces.ts');
let typeSource = 'type package not in this tree';
if (existsSync(typeFacesPath)) {
  const typeFaces = await import(typeFacesPath);
  const headCss = typeFaces.typeTokenCss({ families: ['ui', 'display', 'body', 'mono'], scale: true, fx: true });
  const declared = new Map();
  for (const block of headCss.matchAll(/:root\{([^}]*)\}/g)) {
    for (const part of block[1].split(';').filter(Boolean)) {
      const m = /^--([a-z0-9-]+):(.+)$/s.exec(part.trim());
      if (m) declared.set(m[1], m[2].trim());
    }
  }
  const disagree = [...declared].filter(([name, value]) => names.has(name) && norm(value) !== norm(base.css(name)))
    .map(([name, value]) => `--${name}: type package ${value} / tokens ${base.css(name)}`);
  assert.deepEqual(disagree, [], 'the type package and tokens.json declare the same properties with different values; make one the source');
  for (const [key, token] of [['display', 'font-display'], ['body', 'font-body'], ['mono', 'font-mono']]) {
    assert.equal(norm(TOKENS[token]), norm(typeFaces.TYPE_STACK[key]), `--${token} equals the type package's TYPE_STACK.${key}`);
  }
  const reads = [...headCss.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]).filter((n) => !declared.has(n) && !/^cot-ui-scale$/.test(n));
  for (const name of reads) assert.ok(names.has(name), `the type package reads --${name}, which no token defines`);
  typeSource = `type package agrees on ${[...declared.keys()].filter((n) => names.has(n)).length} shared properties`;
}

console.log(`tokens: ${tokens.length} tokens (${['primitive', 'semantic', 'component'].map((tier) => `${tokens.filter((t) => t.tier === tier).length} ${tier}`).join(', ')}); `
  + `generated files in sync; SPEC 4.14 sheet matched (${spec.size}); SPEC 4.4 (${SPEC_CONTRAST.length + 18}) and 4.5 (${SPEC_VISION.length} rows) numbers matched; `
  + `tokens.css ${tokensBrotli} B brotli; ${table.length} contrast floors held, ${cvd.length} colour-vision floors held and ${pinned.length} shape-coded pairs pinned; `
  + `${comparisons} token values equal in tokens.ts and the tokens.css cascade across ${choices('cvd').length * choices('contrast').length * choices('motion').length} preset combinations; `
  + `${scanned.length} files read no colour primitive; ${typeSource}`
  + `\n  contrast: ${table.slice(0, 16).join(' · ')}`
  + `\n  control edges: ${table.filter((l) => /^(high: )?(line-control|btn-secondary-edge|chip-edge)\/(page|raised|menu) /.test(l)).join(' · ')}`
  + `\n  decorative lines on page/raised/menu: ${lineNotes.join(' · ')}; kept off the .86 plate: ${plateNotes.filter((l) => !l.includes(': ')).join(' · ')}`
  + `\n  vision: ${cvd.filter((l) => !l.startsWith('protection')).join(' · ')}`
  + `\n  pinned: ${pinned.join(' · ')}\n  measured alternative: ${alternatives.join(' · ')}`
  + `\n  alias shifts from the shipped values: ${shifts.join(' · ')}`);
