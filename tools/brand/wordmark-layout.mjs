// The wordmark's layout, measured in the browser (brand-ui BUI-F6). Copyright © 2026 Kevin B. Liu.
// Renders the Premiere direction's wordmark CSS (streams/brand-ui/phase2/bui01/src/components.css .wm) at 1000 px, so
// one CSS pixel is one font unit of Chakra Petch, and prints each glyph's x, baseline and font weight plus the "of"
// rules, for the horizontal lockup and the stacked title card. tools/brand/wordmark.py outlines the glyphs there.
//   node tools/brand/wordmark-layout.mjs > /tmp/wordmark-layout.json
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const puppeteer = createRequire(join(root, 'package.json'))('puppeteer');
const face = (weight, file) => `@font-face{font-family:'W';font-weight:${weight};src:url(data:font/woff2;base64,${
  readFileSync(join(root, 'public/fonts/chakra-petch', file)).toString('base64')}) format('woff2')}`;

// The direction's .wm, verbatim but for the family name; the stacked card centres the same three parts on one axis.
const css = `${face(700, 'ChakraPetch-Bold-Latin.woff2')}${face(500, 'ChakraPetch-Medium-Latin.woff2')}
body{margin:0;font-size:1000px}
.wm{display:inline-flex;align-items:center;gap:.36em;font:700 1em/1 'W';text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.wm .of{display:inline-flex;align-items:center;gap:.26em;font:500 .52em/1 'W';letter-spacing:.16em}
.wm .of::before,.wm .of::after{content:'';width:1em;height:1.5px;background:currentColor}
.stack{display:inline-flex;flex-direction:column;align-items:center;gap:.08em;font:700 1em/1 'W';text-transform:uppercase;letter-spacing:.04em}
.stack .of{display:flex;align-items:center;gap:.26em;font:500 .52em/1 'W';letter-spacing:.16em}
.stack .of::before,.stack .of::after{content:'';width:2.2em;height:1.5px;background:currentColor}
i.b{display:inline-block;width:0;height:0;vertical-align:baseline}`;
const html = `<style>${css}</style>
<div id="h"><span class="wm"><span class="w">Claude<i class="b"></i></span><span class="of"><span class="w">of<i class="b"></i></span></span><span class="w">Tanks<i class="b"></i></span></span></div>
<div id="s"><span class="stack"><span class="w">Claude<i class="b"></i></span><span class="of"><span class="w">of<i class="b"></i></span></span><span class="w">Tanks<i class="b"></i></span></span></div>`;

const browser = await puppeteer.launch({ headless: 'shell' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 12000, height: 6000 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const out = await page.evaluate(() => {
    const lockup = (id) => {
      const host = document.querySelector(`#${id} > span`);
      const box = host.getBoundingClientRect();
      const glyphs = [];
      for (const word of host.querySelectorAll('.w')) {
        const text = word.firstChild;
        const baseline = word.querySelector('i.b').getBoundingClientRect().top - box.top;
        const weight = Number(getComputedStyle(word).fontWeight);
        const size = parseFloat(getComputedStyle(word).fontSize);
        for (let i = 0; i < text.length; i++) {
          const range = document.createRange();
          range.setStart(text, i); range.setEnd(text, i + 1);
          const r = range.getBoundingClientRect();
          glyphs.push({ ch: text.data[i].toUpperCase(), x: r.left - box.left, baseline, weight, size });
        }
      }
      const of = host.querySelector('.of');
      const rules = ['::before', '::after'].map((pseudo) => {
        const s = getComputedStyle(of, pseudo);
        return { width: parseFloat(s.width), height: parseFloat(s.height) };
      });
      const ofBox = of.getBoundingClientRect();
      const ofWord = of.querySelector('.w').getBoundingClientRect();
      return {
        width: box.width, height: box.height, glyphs,
        rules: [
          { x: ofBox.left - box.left, y: ofBox.top - box.top + ofBox.height / 2, ...rules[0] },
          { x: ofWord.right - box.left + parseFloat(getComputedStyle(of).columnGap), y: ofBox.top - box.top + ofBox.height / 2, ...rules[1] },
        ],
      };
    };
    return { horizontal: lockup('h'), stacked: lockup('s') };
  });
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
} finally {
  await browser.close();
}
