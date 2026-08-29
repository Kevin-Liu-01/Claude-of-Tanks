import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FLAG_ICON_CODE_BY_NATION, flagIconCode } from './flagCodes.ts';

const expected = {
  USA: 'us', Germany: 'de', USSR: 'ru', Russia: 'ru', 'USSR/Russia': 'ru',
  UK: 'gb', France: 'fr', China: 'cn', Israel: 'il', Italy: 'it', Japan: 'jp',
  Poland: 'pl', 'South Korea': 'kr', Sweden: 'se', Ukraine: 'ua', Community: 'xx',
};

assert.deepEqual(FLAG_ICON_CODE_BY_NATION, expected, 'every roster nation has a stable flag-icons code');
assert.equal(flagIconCode('not-a-roster-nation'), 'xx', 'unknown nations use the package fallback');

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('flag-icons/package.json'));
for (const code of new Set(Object.values(expected))) {
  const svg = await readFile(join(packageRoot, 'flags', '4x3', `${code}.svg`), 'utf8');
  assert.match(svg, new RegExp(`id=["']flag-icons-${code}["']`), `${code} resolves to an official package SVG`);
}

const uiDir = dirname(fileURLToPath(import.meta.url));
const flagsSource = await readFile(join(uiDir, 'flags.ts'), 'utf8');
assert.doesNotMatch(flagsSource, /<svg|<rect|<polygon|function star/, 'flag UI no longer draws replacement flags');

const srcRoot = join(uiDir, '..');
for (const relative of ['ui/garage.ts', 'ui/flags.ts', 'ui/flagCodes.ts']) {
  const source = await readFile(join(srcRoot, relative), 'utf8');
  assert.doesNotMatch(source, /[\u{1F1E6}-\u{1F1FF}]/u, `${relative} has no native flag emoji`);
}

console.log(`flags.selftest: ${Object.keys(expected).length} nation labels -> ${new Set(Object.values(expected)).size} official assets`);
