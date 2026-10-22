// tools/viteResponsiveSeed.ts (2026-10-22, nav-perf-240): the inline seed writes the same viewport bands and size
// variables as installResponsiveLayout()'s first pass, and is injected once as the first element of the body.
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { classifyViewport } from '../src/ui/responsiveLayout.ts';
import { injectResponsiveSeed, responsiveSeed } from './viteResponsiveSeed.ts';

const plugin = responsiveSeed();
plugin.configResolved({ root: new URL('..', import.meta.url).pathname });
const page = await plugin.transformIndexHtml.handler('<!doctype html><html><head></head><body class="topic-page"><main></main></body></html>');
const match = /<body class="topic-page"><script id="cot-responsive-seed">([\s\S]+?)<\/script><main>/.exec(page);
assert.ok(match, 'the seed is the first element of the body');
assert.equal(injectResponsiveSeed(page, 'x'), page, 'a seeded document is left as it is');
assert.equal(injectResponsiveSeed('<html><head></head></html>', 'x'), '<html><head></head></html>', 'no body, no seed');
const code = match[1];
assert.ok(code.length < 4096, `the seed stays small (${code.length} bytes)`);

function run({ width, height, coarse = false, hover = true }) {
  const dataset = {};
  const vars = {};
  const window = {
    innerWidth: width, innerHeight: height,
    visualViewport: { width, height, offsetLeft: 0, offsetTop: 0, scale: 1 },
    matchMedia: (query) => ({ matches: query.includes('coarse') ? coarse : query.includes('hover') ? hover : false }),
  };
  const document = { body: { dataset }, documentElement: { clientWidth: width, style: { setProperty: (name, value) => { vars[name] = value; } } } };
  window.document = document;
  runInNewContext(code, { window, document });
  return { dataset, vars };
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, coarse: true, hover: false },
  { width: 820, height: 1180, coarse: true, hover: false }, { width: 1024, height: 400 }, { width: 600, height: 900 }]) {
  const { dataset, vars } = run(viewport);
  const expected = classifyViewport({ ...viewport, coarsePointer: !!viewport.coarse });
  assert.equal(dataset.cotWidth, expected.widthBand, `${viewport.width}×${viewport.height} width band`);
  assert.equal(dataset.cotHeight, expected.heightBand);
  assert.equal(dataset.cotPanels, expected.overlayPanels ? 'overlay' : 'persistent', `${viewport.width}×${viewport.height} panels`);
  assert.equal(dataset.cotInput, expected.input);
  assert.equal(dataset.cotOrientation, expected.orientation);
  assert.equal(vars['--cot-viewport-width'], `${expected.width}px`);
  assert.equal(vars['--cot-ui-scale'], expected.scale.toFixed(4));
}
console.log('viteResponsiveSeed.selftest: the inline seed is the body\'s first element and writes installResponsiveLayout()\'s bands and variables before first paint');
