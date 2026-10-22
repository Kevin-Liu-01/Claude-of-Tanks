// Receipt for the one icon system (brand-ui SPEC section 7, BUI-F4). Copyright © 2026 Kevin B. Liu.
// The sprite's drawing rules and budgets (tools/icon-stroke-census.mjs), the generated index in sync with the sprite
// (tools/gen-icon-sprite.mjs --check), the host markup icon() emits, and no surface left on a retired product mark.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { icon, iconInSvg } from './icon.ts';
import { ACTIVE_MASTERS, BOOT_SYMBOLS, ICON_IDS, SMALL_MASTERS } from './spriteIndex.ts';
import { readIconSprite } from '../../../tools/icon-sprite-lib.mjs';

const tool = (name) => new URL(`../../../tools/${name}`, import.meta.url).pathname;
const census = JSON.parse(execFileSync(process.execPath, [tool('icon-stroke-census.mjs'), '--json'], { encoding: 'utf8' }));
assert.deepEqual(census.strokeValues, [1.5], 'one stroke literal across the icon files (the 16-unit 1.25 lives in the host)');
assert.deepEqual(census.problems, [], 'the sprite keeps its drawing rules');
assert.ok(census.sizes.spriteGzip <= 10 * 1024, `full sprite ${census.sizes.spriteGzip} B gzip within 10 KB`);
assert.ok(census.sizes.bootBrotli <= 3 * 1024, `boot slice ${census.sizes.bootBrotli} B brotli within 3 KB`);
execFileSync(process.execPath, [tool('gen-icon-sprite.mjs'), '--check'], { stdio: 'pipe' });

const sprite = readIconSprite();
assert.deepEqual([...ICON_IDS], [...sprite.large.keys()], 'the generated id list is the sprite in order');
for (const id of SMALL_MASTERS.trim().split(' ')) assert.ok(sprite.small.has(id), `${id} owns a 16-unit master`);
for (const id of ACTIVE_MASTERS.trim().split(' ')) assert.ok(sprite.large.has(id), `${id} is drawn`);
assert.equal((BOOT_SYMBOLS.match(/<symbol id="i-[A-Za-z]+"/g) || []).length, 12, 'about a dozen boot glyphs');

// Host markup: optical master by size, the house stroke, decorative by default, named when labelled.
const large = icon('garage', { size: 24 });
assert.match(large, /^<svg class="cot-i" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"/);
assert.match(large, /fill="none" stroke="currentColor" stroke-width="1\.5" stroke-linecap="square" stroke-linejoin="miter">/);
assert.match(large, /<use href="#i-garage"\/><\/svg>$/);
const small = icon('garage', { size: 16 });
assert.match(small, /viewBox="0 0 16 16"[^>]*stroke-width="1\.25"[\s\S]*href="#i-garage-s"/, '16 px takes the optical master');
assert.match(icon('garage', { size: 16, active: true }), /fill="currentColor" fill-rule="evenodd"/, 'active fills');
assert.doesNotMatch(icon('check', { active: true }), /fill="currentColor"/, 'line glyphs never fill');
assert.match(icon('settings', { label: 'Settings & more' }), /role="img" aria-label="Settings &amp; more"/);
assert.match(icon('close', { color: '#fff' }), /style="color:#fff"/);
assert.match(iconInSvg('engine', 3, 3, 18, '#ccc'), /^<g transform="translate\(3 3\) scale\(0\.75\)" data-icon="engine" color="#ccc"/);

// Every literal icon id a surface asks for is drawn (or aliased): an unknown id would render an empty <use>.
const known = new Set([...sprite.large.keys(), 'tick']);
const srcRoot = fileURLToPath(new URL('../../', import.meta.url));
const unknown = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.ts')) {
      for (const [, id] of readFileSync(path, 'utf8').matchAll(/\b(?:uiIconSVG|uiIconInSvg|icon)\(\s*'([A-Za-z0-9]+)'/g)) {
        if (!known.has(id)) unknown.push(`${path.slice(srcRoot.length)}: ${id}`);
      }
    }
  }
};
walk(srcRoot);
assert.deepEqual(unknown, [], 'every literal icon id resolves in the sprite');

// No surface, page or stylesheet still points at the retired product marks.
const retired = /\/brand\/(?:nav|features)\//;
for (const rel of ['src/ui/garage.ts', 'src/ui/studioPanel.ts', 'src/game/studio.ts', 'src/presentation/publicNav.ts',
  'src/presentation/publicNav.css', 'src/presentation/notFound.css', 'site/home.html', 'site/docs.html',
  'site/gallery.html', 'README.md']) {
  assert.doesNotMatch(readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8'), retired, `${rel} uses the sprite`);
}

console.log(`icon.selftest: ${sprite.large.size} glyphs + ${sprite.small.size} optical masters, one stroke per size, `
  + `sprite ${census.sizes.spriteGzip} B gzip, boot ${census.sizes.bootBrotli} B brotli`);
