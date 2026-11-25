#!/usr/bin/env node
// z-layer-census.mjs — the app's one stacking order, held (owner 2026-11-24, modal-layer-277: "the settings and pause, any
// modal should go above any other ui stuff"). Copyright © 2026 Kevin B. Liu.
//
// The scale is src/ui/tokens/tokens.json semantic.layer: root layers bottom to top (z-hud < z-screen < z-report < z-shell <
// z-cover < z-notice < z-drawer < z-menu < z-modal < z-tip < z-critical), the HUD's own scale inside .cot-hud (z-hud-*),
// and the local band ($local): literals that order the parts of one component inside its own stacking context, all
// under the lowest root layer, so even one that escapes its context draws under every layer of the app. This census
// fails on:
//   - a scale out of order: root layers not rising, the band or the HUD scale reaching the lowest root layer, a component's
//     z token (home-card-z, studio-pop-z, z-lift ...) outside the band unless it names a root layer;
//   - a z-index anywhere (CSS, CSS-in-TS, HTML; the files tools/style-literal-census.mjs reads) that is not a band
//     literal, a z token (or an alias of one: --hud-layer-world), a token with a fallback equal to its value, or a step on
//     one (calc(var(--z-<layer>) + k)) that stays short of the next layer; and a z-index set from script to a computed
//     value. EXCEPTIONS names the few that are not, each with its reason;
//   - a modal off the modal layer: every modal row of src/ui/transientSurfaceRegistry.ts, and the pause veil, is in MODALS,
//     as `lift` (its root's z-index resolves into [z-modal, z-tip) and its owner puts it in the top layer while open,
//     src/ui/components/modalLayer.ts liftModal), `dialog` (a native <dialog>.showModal(), the top layer itself) or
//     `contained` (with the reason it is not);
//   - a file that puts anything in the top layer (showPopover, showModal, a popover attribute) without a TOP_LAYER row:
//     the top layer outranks every z-index, so only modals, what opens from them, the critical blockers and the
//     tutorial (which hides itself under any surface) may enter it. Notices never do.
//
//   node tools/z-layer-census.mjs          the census (exit 1 on a problem)
//   node tools/z-layer-census.mjs --json   the scale and every z-index it read
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { censusFiles, cssDeclarations, htmlDeclarations, scriptDeclarations } from './style-literal-census.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** z-index values outside the scale, each with its reason (file -> value -> reason). */
export const EXCEPTIONS = Object.freeze({
  'src/dev/colliderOverlay.ts': { 2147483000: 'the collider overlay\'s legend: a ?debug diagnostic over everything, never in a player\'s build' },
});

/** z-index set from script to a computed value (file -> reason). */
export const DYNAMIC = Object.freeze({
  'src/ui/hud.ts': 'the hull bars over tanks stack nearest-first inside their own layer of the HUD (.cot-hud isolates), one step per bar',
  'src/presentation/heroReel.ts': 'the landing\'s reel crossfades its videos inside the hero, which isolates them: each new take one step over the last',
});

/** Every modal, by its registry id (and the pause veil, which the registry does not name). */
export const MODALS = Object.freeze({
  // the battle's pause: the click-to-resume veil, and Settings, the Esc menu
  pause: { how: 'lift', file: 'src/ui/settings.ts', selector: '.cot-resume' },
  settings: { how: 'lift', file: 'src/ui/settings.ts', selector: '.cot-settings' },
  // the shared shell (src/ui/modal.ts) and every dialog made with it
  ...Object.fromEntries(['modal', 'garage-technical', 'garage-return-failure', 'battle-entry-failure', 'service-record', 'camo-studio',
    'context-info', 'couch-lobby', 'couch-briefing', 'hud-editor'].map((id) => [id, { how: 'lift', file: 'src/ui/modal.ts', selector: '.cot-modal-root' }])),
  'tech-tree': { how: 'lift', file: 'src/ui/techTree.css', selector: '.cot-tt', owner: 'src/ui/techTree.ts' },
  rooms: { how: 'lift', file: 'src/ui/playMenu.ts', selector: '.cot-play' },
  deploy: { how: 'lift', file: 'src/ui/deploy.css', selector: '.cot-garage .cot-battle-menu.open', owner: 'src/ui/garage.ts' },
  'gallery-drawing': { how: 'contained', reason: 'the Tank Gallery\'s zoomed drawing (its own page, no HUD or warnings): on z-modal at the page\'s root (gallery.css), over the page\'s notices' },
  'garage-dossier': { how: 'contained', reason: 'a folded Garage\'s figures card opened as a sheet over its own stage, inside the Garage screen with its scrim (garage.css garage-panel-scrim): a panel of the screen, not a dialog over it' },
  'studio-commands': { how: 'contained', reason: 'the Studio\'s command palette, inside the Studio authoring tool (studio-pop-z): no battle runs or warns under it' },
  'studio-templates': { how: 'contained', reason: 'the Studio\'s template sheet, inside the Studio authoring tool (studio-pop-z): no battle runs or warns under it' },
  ...Object.fromEntries(['home-trailer', 'docs-archive', 'media-library', 'pad-options', 'media-archive']
    .map((id) => [id, { how: 'dialog', file: { 'home-trailer': 'src/presentation/homePage.ts', 'docs-archive': 'src/docs/docs.ts',
      'media-library': 'src/presentation/mediaLibrary.ts', 'pad-options': 'src/pad/padPage.ts', 'media-archive': 'src/presentation/mediaArchive.ts' }[id] }])),
});
const EXTRA_MODALS = new Set(['pause']);

/** Every file that puts something in the top layer, and why it may stand over a z-index. */
export const TOP_LAYER = Object.freeze({
  'src/ui/components/modalLayer.ts': 'liftModal and raiseCritical: the modals and the critical blockers',
  'index.html': 'a failed chunk\'s reload (critical: the code the open screen needs did not load)',
  'src/ui/components/pickerMenu.ts': 'a picker\'s menu, opened from its field (over a modal when the field is in one)',
  'src/ui/components/hoverTip.ts': 'the hover tip, shown for the control under the pointer',
  'src/ui/richTooltip.ts': 'the rich tooltip, shown for the control under the pointer',
  'src/ui/tutorial/tutorialOverlay.ts': 'the tutorial\'s card: it hides while Settings or any surface covers its screen (main.ts tutorial screen())',
  'src/pad/padTourScreen.ts': 'the phone pad\'s first-run guide on its own page (the pad has no HUD or modal under it)',
  'src/presentation/homePage.ts': 'the landing\'s trailer dialog (showModal)',
  'src/docs/docs.ts': 'the Field Manual\'s archive dialog (showModal)',
  'src/presentation/mediaLibrary.ts': 'the media library dialog (showModal)',
  'src/presentation/mediaArchive.ts': 'the media archive dialog (showModal)',
  'src/pad/padPage.ts': 'the pad\'s options dialog (showModal)',
  'src/ui/studioPanel.ts': 'the Studio\'s pickers (popover menus inside the authoring tool)',
  'src/ui/studioTemplateSheet.ts': 'the Studio\'s template sheet',
});
// (code only: a comment naming a popover is no use of one)
const TOP_LAYER_USE = /\.showPopover\(|\.showModal\(|setAttribute\(\s*['"]popover['"]|\.popover\s*=|<[a-z][^<>]*\spopover(?:=|[\s>])/;

/* --------------------------------------------------------------------------------------------- the scale */

const isMeta = (key) => key.startsWith('$');
const isZName = (name) => /(?:^|-)z(?:-|$)/.test(name);

/** The scale from tokens.json: { band: [lo, hi], roots: [[name, value]...] bottom to top, hud: Map, tokens: Map }. */
export function readScale(json) {
  const layer = json.semantic.layer;
  const band = layer.$local;
  const value = (entry) => (entry && typeof entry === 'object' ? entry.value : entry);
  const hud = new Map(), roots = [];
  for (const [name, entry] of Object.entries(layer)) {
    if (isMeta(name)) continue;
    if (name.startsWith('z-hud-')) hud.set(name, value(entry)); else roots.push([name, value(entry)]);
  }
  const tokens = new Map([...hud, ...roots]);
  const components = new Map();
  const walk = (group) => {
    for (const [name, entry] of Object.entries(group)) {
      if (isMeta(name) || !entry || typeof entry !== 'object' || 'value' in entry) {
        if (!isMeta(name) && isZName(name)) components.set(name, value(entry));
        continue;
      }
      walk(entry);
    }
  };
  walk(json.component ?? {});
  for (const [name, raw] of components) {
    const ref = typeof raw === 'string' ? /^\{([\w-]+)\}$/.exec(raw)?.[1] : null;
    tokens.set(name, ref ? tokens.get(ref) : raw);
  }
  return { band, roots, hud, components, tokens };
}

/** The scale's own order. */
export function scaleProblems(scale) {
  const problems = [];
  const [lo, hi] = scale.band ?? [];
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) problems.push('scale: semantic.layer.$local is no [lo, hi] band');
  const first = scale.roots[0]?.[1];
  if (!(hi < first)) problems.push(`scale: the local band reaches the lowest root layer (${hi} >= ${first})`);
  scale.roots.forEach(([name, v], i) => {
    if (!Number.isInteger(v)) problems.push(`scale: --${name} is no integer`);
    if (i && !(v > scale.roots[i - 1][1])) problems.push(`scale: --${name} (${v}) does not rise over --${scale.roots[i - 1][0]}`);
  });
  for (const [name, v] of scale.hud) if (!(v >= lo && v <= hi)) problems.push(`scale: --${name} (${v}) leaves the local band`);
  for (const [name, raw] of scale.components) {
    const v = scale.tokens.get(name);
    const rootRef = typeof raw === 'string' && scale.roots.some(([root]) => raw === `{${root}}`);
    if (!rootRef && !(Number.isInteger(v) && v >= lo && v <= hi)) problems.push(`scale: --${name} (${raw}) is neither in the local band nor a root layer`);
  }
  return problems;
}

/* --------------------------------------------------------------------------------------------- values */

/** Aliases of z tokens declared in the sources (--hud-layer-world: var(--z-hud-world, 6)): name -> { token, fallback }. */
export function aliasesOf(decls, scale) {
  const aliases = new Map();
  for (const { property, value } of decls) {
    if (!property.startsWith('--')) continue;
    const m = /^var\(--([\w-]+)\s*(?:,\s*(-?\d+))?\)$/.exec(value.trim());
    if (m && scale.tokens.has(m[1])) aliases.set(property.slice(2), { token: m[1], fallback: m[2] == null ? null : Number(m[2]) });
  }
  return aliases;
}

/** One z-index value: { ok, value?, why? }. */
export function judgeValue(raw, scale, aliases) {
  const text = String(raw).trim().replace(/\s+/g, ' ');
  const [lo, hi] = scale.band;
  if (/^(?:auto|inherit|initial|unset|revert|revert-layer)$/i.test(text)) return { ok: true };
  if (/^-?\d+$/.test(text)) {
    const n = Number(text);
    return n >= lo && n <= hi ? { ok: true, value: n } : { ok: false, why: `literal ${n} outside the local band [${lo}, ${hi}] and off the scale` };
  }
  const tokenOf = (name) => {
    if (scale.tokens.has(name)) return { token: name, value: scale.tokens.get(name) };
    const alias = aliases.get(name);
    if (alias) {
      if (alias.fallback != null && alias.fallback !== scale.tokens.get(alias.token)) return { why: `--${name}'s fallback ${alias.fallback} differs from --${alias.token}` };
      return { token: alias.token, value: scale.tokens.get(alias.token) };
    }
    return { why: `--${name} is no z token` };
  };
  let m = /^var\(--([\w-]+)\s*(?:,\s*(-?\d+))?\)$/.exec(text);
  if (m) {
    const ref = tokenOf(m[1]);
    if (!ref.token) return { ok: false, why: ref.why };
    if (m[2] != null && Number(m[2]) !== ref.value) return { ok: false, why: `fallback ${m[2]} differs from --${ref.token} (${ref.value})` };
    return { ok: true, value: ref.value };
  }
  // a step: a number, or a band token (calc(var(--z-shell) - var(--z-lift)))
  m = /^calc\(var\(--([\w-]+)\s*(?:,\s*-?\d+\s*)?\) ?([+-]) ?(?:(\d+)|var\(--([\w-]+)\))\)$/.exec(text);
  if (m) {
    const ref = tokenOf(m[1]);
    if (!ref.token) return { ok: false, why: ref.why };
    let step = Number(m[3]);
    if (m[4] != null) {
      const by = tokenOf(m[4]);
      if (!by.token || !(by.value >= lo && by.value <= hi)) return { ok: false, why: `a step by --${m[4]}, which is no band token` };
      step = by.value;
    }
    const value = ref.value + (m[2] === '+' ? 1 : -1) * step;
    const at = scale.roots.findIndex(([name]) => name === ref.token);
    if (at < 0) {
      return value >= lo && value <= hi ? { ok: true, value } : { ok: false, why: `a step on --${ref.token} leaves the local band (${value})` };
    }
    // (under the lowest root layer a step may fall into the band: the mission brief and touch aim sit just under the HUD)
    const below = at ? scale.roots[at - 1][1] : lo - 1, above = scale.roots[at + 1]?.[1] ?? Infinity;
    return value > below && value < above ? { ok: true, value }
      : { ok: false, why: `a step on --${ref.token} (${value}) crosses into the next layer (${below}..${above})` };
  }
  return { ok: false, why: `"${text}" is no band literal, z token or step on one` };
}

/* --------------------------------------------------------------------------------------------- census */

const declarationsOf = (path, text) => (path.endsWith('.css') ? cssDeclarations(text) : path.endsWith('.html') ? htmlDeclarations(text) : scriptDeclarations(text));

/** The CSS block of `selector` in `text` (its first rule whose prelude ends with the selector). */
export function ruleBody(text, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?<![\\w-])${esc}\\s*\\{`).exec(text);
  if (!m) return null;
  let depth = 1, i = m.index + m[0].length;
  const start = i;
  for (; i < text.length && depth; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; }
  return text.slice(start, i - 1);
}

/** Every problem of the tree at `root` (registry: the transient-surface rows). */
export function zLayerCensus({ root = ROOT, registry, read = (path) => readFileSync(join(root, path), 'utf8'), files = censusFiles(root) } = {}) {
  const scale = readScale(JSON.parse(read('src/ui/tokens/tokens.json')));
  const problems = scaleProblems(scale);
  const texts = new Map(files.map((path) => [path, read(path)]));
  const perFile = new Map([...texts].map(([path, text]) => [path, declarationsOf(path, text)]));
  const aliases = aliasesOf([...perFile.values()].flat(), scale);
  const seen = [];
  for (const [path, decls] of perFile) {
    for (const { property, value } of decls) {
      if (property !== 'z-index') continue;
      const verdict = judgeValue(value, scale, aliases);
      seen.push({ path, value, ...verdict });
      if (verdict.ok) continue;
      if (/var\(--interpolated\)/.test(value) && DYNAMIC[path]) continue;
      if (EXCEPTIONS[path]?.[String(value).trim()]) continue;
      problems.push(`${path}: z-index ${value}: ${verdict.why}`);
    }
    const text = texts.get(path);
    if (/\.ts$/.test(path) && /\.style\.zIndex\s*=\s*(?!['"`]?-?\d)|setProperty\(\s*['"]z-index['"]\s*,\s*(?!['"`]-?\d)/.test(text) && !DYNAMIC[path]) {
      problems.push(`${path}: sets a z-index from script to a computed value (no DYNAMIC row)`);
    }
    if (TOP_LAYER_USE.test(text) && !TOP_LAYER[path]) problems.push(`${path}: puts an element in the top layer, which outranks every z-index (no TOP_LAYER row)`);
  }
  for (const path of Object.keys(TOP_LAYER)) if (texts.has(path) && !TOP_LAYER_USE.test(texts.get(path))) problems.push(`TOP_LAYER: ${path} no longer enters the top layer (stale row)`);
  if (TOP_LAYER_USE.test(texts.get('src/ui/components/notice.ts') ?? '')) problems.push('src/ui/components/notice.ts: a notice entered the top layer (it must stay under every modal)');
  for (const path of [...Object.keys(EXCEPTIONS), ...Object.keys(DYNAMIC)]) if (!texts.has(path)) problems.push(`${path}: an exception for a file the census no longer reads (stale row)`);

  // the modals
  const zModal = scale.tokens.get('z-modal'), zTip = scale.tokens.get('z-tip');
  const modalIds = Object.entries(registry ?? {}).filter(([, row]) => row.modal).map(([id]) => id);
  for (const id of modalIds) if (!MODALS[id]) problems.push(`modal ${id}: no MODALS row (lift it onto the modal layer, or say why it is contained)`);
  for (const id of Object.keys(MODALS)) if (!EXTRA_MODALS.has(id) && registry && !modalIds.includes(id)) problems.push(`MODALS: ${id} is no modal row of the registry (stale)`);
  for (const [id, row] of Object.entries(MODALS)) {
    if (row.how === 'contained') { if (!row.reason) problems.push(`modal ${id}: contained without a reason`); continue; }
    const text = row.file && (texts.get(row.file) ?? (() => { try { return read(row.file); } catch { return null; } })());
    if (!text) { problems.push(`modal ${id}: ${row.file} is missing`); continue; }
    if (row.how === 'dialog') { if (!/\.showModal\(/.test(text)) problems.push(`modal ${id}: ${row.file} never opens a native modal dialog`); continue; }
    const owner = row.owner ? texts.get(row.owner) ?? read(row.owner) : text;
    if (!/\bliftModal\(/.test(owner)) problems.push(`modal ${id}: ${row.owner ?? row.file} never lifts it into the top layer (liftModal)`);
    const body = ruleBody(text, row.selector);
    const decl = body == null ? null : cssDeclarations(body, { inline: true }).find((d) => d.property === 'z-index');
    const verdict = decl ? judgeValue(decl.value, scale, aliases) : null;
    if (!verdict?.ok || !(verdict.value >= zModal && verdict.value < zTip)) {
      problems.push(`modal ${id}: ${row.file} ${row.selector} is off the modal layer (z-index ${decl?.value ?? 'none'}; [${zModal}, ${zTip}))`);
    }
  }
  return { problems, scale, seen };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { TRANSIENT_SURFACES } = await import('../src/ui/transientSurfaceRegistry.ts');
  const { problems, scale, seen } = zLayerCensus({ registry: TRANSIENT_SURFACES });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ band: scale.band, roots: scale.roots, problems, seen }, null, 2));
  } else {
    for (const problem of problems) console.log(`  ${problem}`);
    console.log(problems.length ? `z-layer-census: FAIL, ${problems.length} problems`
      : `z-layer-census: PASS, ${seen.length} z-indexes on the scale (${scale.roots.map(([n, v]) => `${n} ${v}`).join(' < ')}), `
        + `${Object.keys(MODALS).length} modals on the modal layer or named`);
  }
  process.exit(problems.length ? 1 : 0);
}
