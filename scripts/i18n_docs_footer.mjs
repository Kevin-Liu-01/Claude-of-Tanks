// Add data-i18n attrs to 12 docs-*.html files for the footer + loading + <html lang>.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const ROOT = process.cwd();
const files = [
  'docs-build.html','docs-models.html','docs-simulation.html','docs-vehicles.html',
  'docs-rendering.html','docs-performance.html','docs-worlds.html','docs-ai.html',
  'docs-multiplayer.html','docs-audio.html','docs-interface.html','docs-studio.html',
];

let totalChanged = 0;
for (const f of files) {
  const path = resolve(ROOT, f);
  let text = readFileSync(path, 'utf8');
  const orig = text;

  // 1) Add data-i18n-aria to public-nav so its label becomes localizable (it already has it; skip)
  // 2) Loading line
  text = text.replace(
    '<p class="topic-loading">Loading technical manual…</p>',
    '<p class="topic-loading" data-i18n="docs.topic.loading">Loading technical manual…</p>'
  );

  // 3) Footer: replace inner with localized spans. Use the existing shell/inner div for layout.
  text = text.replace(
    /<footer class="docs-footer">[\s\S]*?<\/footer>/,
    `<footer class="docs-footer"><div class="inner shell"><a class="brand" href="/home"><img src="/brand/logo-mark-metal.svg" alt=""><span><span data-i18n="publicNav.brand">Claude</span> <b data-i18n="publicNav.brandOf">of</b> <span data-i18n="publicNav.brandTanks">Tanks</span></span></a><div class="footer-links"><a href="/docs" data-i18n="docs.topic.footer.manualIndex">Manual index</a><a href="/gallery" data-i18n="docs.topic.footer.gallery">Tank Gallery</a><a href="/studio" data-i18n="docs.topic.footer.studio">Scene Studio</a><a href="/" data-i18n="docs.topic.footer.play">Play</a></div><span class="footer-mark" data-i18n="docs.topic.footer.mark">Technical manual // 2026</span></div></footer>`
  );

  if (text !== orig) {
    writeFileSync(path, text, 'utf8');
    console.log(`updated: ${f}`);
    totalChanged++;
  } else {
    console.log(`no change: ${f}`);
  }
}
console.log(`\nTotal updated: ${totalChanged}/12`);
