// Fix the brand block in all 12 docs-*.html footers to use publicNav.brand only.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [
  'docs-build.html','docs-models.html','docs-simulation.html','docs-vehicles.html',
  'docs-rendering.html','docs-performance.html','docs-worlds.html','docs-ai.html',
  'docs-multiplayer.html','docs-audio.html','docs-interface.html','docs-studio.html',
];

let n = 0;
for (const f of files) {
  const path = resolve(process.cwd(), f);
  let text = readFileSync(path, 'utf8');
  const orig = text;
  text = text.replace(
    /<a class="brand" href="\/home"><img src="\/brand\/logo-mark-metal\.svg" alt=""><span><span data-i18n="publicNav\.brand">Claude<\/span> <b data-i18n="publicNav\.brandOf">of<\/b> <span data-i18n="publicNav\.brandTanks">Tanks<\/span><\/span><\/a>/,
    `<a class="brand" href="/home"><img src="/brand/logo-mark-metal.svg" alt=""><span data-i18n="publicNav.brand">Claude <b>of Tanks</b></span></a>`
  );
  if (text !== orig) {
    writeFileSync(path, text, 'utf8');
    n++;
    console.log(`fixed: ${f}`);
  } else {
    console.log(`no change: ${f}`);
  }
}
console.log(`\nFixed: ${n}/12`);
