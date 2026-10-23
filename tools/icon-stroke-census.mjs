#!/usr/bin/env node
// Icon stroke census (brand-ui SPEC sections 7 and 17.1): one stroke value per optical size across the icon system,
// and the sprite's drawing rules. Before BUI-F4 the shared icon modules and product marks used 19 stroke values
// (1.1 to 3); the sprite allows 1.5 at the 24-unit grid and 1.25 at the 16-unit grid, carried by the host <svg> only.
//
//   node tools/icon-stroke-census.mjs              census + rules on this tree (exit 1 on a violation)
//   node tools/icon-stroke-census.mjs --root=DIR   census only of another tree (e.g. the pre-F4 base, for comparison)
//   --json                                          machine-readable output
// Copyright © 2026 Kevin B. Liu.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import {
  ACTIVE_ICON_IDS, ALLOWED_ATTRIBUTES, ALLOWED_ELEMENTS, GRID, GRID_SMALL, STROKE, STROKE_SMALL, glyphElements,
  parseIconSprite, pathBounds,
} from './icon-sprite-lib.mjs';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith('--root='))?.slice(7);
const root = rootArg ? resolve(rootArg) : here;
const json = args.includes('--json');

/** Every file that draws UI icons: the sprite and its host, the icon modules, and (pre-F4) the product marks. */
const ICON_SOURCES = [
  'src/ui/icons/sprite.svg', 'src/ui/icons/icon.ts', 'src/ui/uiIcons.ts', 'src/ui/equipIcons.ts', 'src/ui/shellIcons.ts',
  'src/ui/settingsIcons.ts', 'src/docs/docsIcons.ts', 'src/gallery/viewGlyphs.ts',
];
const MARK_DIRS = ['public/brand/nav', 'public/brand/features'];
/** CSS that strokes an icon family drawn inline (the Gallery camera-view glyphs). */
const ICON_CSS = [['src/gallery/gallery.css', /\.camera-view-glyph[^{]*\{[^}]*\}/g]];

/** Full sprite and boot-slice budgets (SPEC 7 and 16.1). */
const SPRITE_GZIP_MAX = 10 * 1024;
const BOOT_BROTLI_MAX = 3 * 1024;

const STROKE_LITERAL = /stroke-width(?:="|:|',\s*['"]?|\s*=\s*\{?)\s*([0-9.]+)/g;

function strokeValues(text) {
  const values = [];
  for (const match of text.matchAll(STROKE_LITERAL)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) values.push(value);
  }
  return values;
}

function census() {
  const files = [];
  for (const rel of ICON_SOURCES) {
    const path = join(root, rel);
    if (existsSync(path)) files.push([rel, readFileSync(path, 'utf8')]);
  }
  for (const dir of MARK_DIRS) {
    const path = join(root, dir);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path).filter((n) => n.endsWith('.svg')).sort()) {
      files.push([`${dir}/${name}`, readFileSync(join(path, name), 'utf8')]);
    }
  }
  for (const [rel, pattern] of ICON_CSS) {
    const path = join(root, rel);
    if (existsSync(path)) files.push([rel, (readFileSync(path, 'utf8').match(pattern) || []).join('\n')]);
  }
  const byValue = new Map();
  for (const [rel, text] of files) {
    for (const value of strokeValues(text)) {
      if (!byValue.has(value)) byValue.set(value, new Set());
      byValue.get(value).add(rel);
    }
  }
  return { files: files.map(([rel]) => rel), values: [...byValue.keys()].sort((a, b) => a - b), byValue };
}

function spriteRules() {
  const problems = [];
  const spriteText = readFileSync(join(root, 'src/ui/icons/sprite.svg'), 'utf8');
  const { large, small } = parseIconSprite(spriteText);
  const check = (id, body, grid) => {
    const elements = glyphElements(body);
    if (!elements.length) problems.push(`${id}: empty glyph`);
    for (const { name, attrs } of elements) {
      if (!ALLOWED_ELEMENTS.has(name)) problems.push(`${id}: element <${name}> (paths and circles only)`);
      for (const attr of Object.keys(attrs)) {
        if (!ALLOWED_ATTRIBUTES.has(attr)) problems.push(`${id}: attribute ${attr} (the host carries stroke, caps, joins)`);
      }
      for (const key of ['fill', 'stroke']) {
        const value = attrs[key];
        if (value && value !== 'currentColor' && value !== 'none') problems.push(`${id}: ${key}="${value}" (currentColor only)`);
      }
      if (attrs.style && !/^(?:opacity|fill|stroke):var\(--i-[a-z0-9-]+(?:,[0-9.]+)?\)$/.test(attrs.style)) {
        problems.push(`${id}: style "${attrs.style}" (only a var(--i-*) hook)`);
      }
      const d = name === 'path' ? attrs.d : null;
      const box = d ? pathBounds(d)
        : { x0: +attrs.cx - +attrs.r, x1: +attrs.cx + +attrs.r, y0: +attrs.cy - +attrs.r, y1: +attrs.cy + +attrs.r };
      if (box.x0 < 0 || box.y0 < 0 || box.x1 > grid || box.y1 > grid) {
        problems.push(`${id}: geometry ${[box.x0, box.y0, box.x1, box.y1].map((n) => n.toFixed(2)).join(',')} leaves the ${grid}-unit grid`);
      }
    }
  };
  for (const [id, body] of large) check(id, body, GRID);
  for (const [id, body] of small) check(`${id}-s`, body, GRID_SMALL);
  if (/stroke-width|stroke-linecap|stroke-linejoin/.test(spriteText)) problems.push('sprite: a glyph sets its own stroke');
  for (const id of ACTIVE_ICON_IDS) if (!large.has(id)) problems.push(`active id ${id} missing`);
  const modes = [...large.keys()].filter((id) => id.startsWith('mode'));
  // The 13 rulesets plus the proving ground (2026-10-20), each with a glyph of its own.
  if (modes.length !== 14) problems.push(`sprite: ${modes.length} mode glyphs (14 unique required)`);
  const modeBodies = new Set(modes.map((id) => large.get(id)));
  if (modeBodies.size !== modes.length) problems.push('sprite: two modes share one glyph');
  const host = readFileSync(join(root, 'src/ui/icons/icon.ts'), 'utf8');
  if (!host.includes(`small ? ${STROKE_SMALL} : ${STROKE}`)) problems.push('icon.ts: host stroke is not 1.5 / 1.25 by optical size');
  for (const rel of ICON_SOURCES.filter((r) => r.endsWith('.ts'))) {
    const text = existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : '';
    if (/rgba\(8,\s*12,\s*16|#101920/.test(text)) problems.push(`${rel}: a baked dark knock-out (use evenodd or a mask)`);
  }
  const spriteBytes = Buffer.from(spriteText);
  const index = readFileSync(join(root, 'src/ui/icons/spriteIndex.ts'), 'utf8');
  const boot = Buffer.from(index.match(/BOOT_SYMBOLS = '(.*)';/)?.[1] ?? '');
  const sizes = {
    spriteRaw: spriteBytes.length,
    spriteGzip: gzipSync(spriteBytes, { level: 6 }).length,
    bootRaw: boot.length,
    bootBrotli: brotliCompressSync(boot, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
  if (sizes.spriteGzip > SPRITE_GZIP_MAX) problems.push(`sprite: ${sizes.spriteGzip} B gzip > ${SPRITE_GZIP_MAX}`);
  if (sizes.bootBrotli > BOOT_BROTLI_MAX) problems.push(`boot slice: ${sizes.bootBrotli} B brotli > ${BOOT_BROTLI_MAX}`);
  return { problems, glyphs: large.size, smallMasters: small.size, modes: modes.length, sizes };
}

const result = census();
const report = { root, strokeValues: result.values, files: result.files.length };
let failed = false;
if (!rootArg) {
  const rules = spriteRules();
  Object.assign(report, rules);
  // One stroke per optical size: the 24-unit value and the 16-unit value, nothing else anywhere in the system.
  const stray = result.values.filter((v) => v !== STROKE && v !== STROKE_SMALL);
  for (const value of stray) rules.problems.push(`stroke ${value} in ${[...result.byValue.get(value)].join(', ')}`);
  failed = rules.problems.length > 0;
}
if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`icon-stroke-census: ${result.values.length} stroke value(s) across ${result.files.length} icon files `
    + `[${result.values.join(', ')}]`);
  if (report.sizes) {
    console.log(`  ${report.glyphs} glyphs, ${report.smallMasters} 16-unit masters, ${report.modes} mode glyphs; sprite `
      + `${report.sizes.spriteRaw} B raw / ${report.sizes.spriteGzip} B gzip; boot slice ${report.sizes.bootBrotli} B brotli`);
    for (const problem of report.problems) console.error(`  FAIL ${problem}`);
  }
}
if (failed) process.exit(1);
