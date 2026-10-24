// The kit's hover tip (hoverTip.ts) and its placement (floatPlacement.ts), shared with the rich tooltip (owner,
// 2026-10-24: "have little tooltips ... when we hover over long enough"). Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeFloat } from './floatPlacement.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const viewport = { width: 1440, height: 900 };

// 1. Placement: below when there is room, above near the foot, centred on the anchor, never within 8 px of an edge.
{
  const below = placeFloat({ left: 600, top: 300, bottom: 340, width: 40 }, { width: 84, height: 23 }, viewport, 8, 8);
  assert.deepEqual([below.x, below.y, below.below], [578, 348, true]);
  const above = placeFloat({ left: 600, top: 860, bottom: 890, width: 40 }, { width: 84, height: 23 }, viewport, 8, 8);
  assert.equal(above.below, false);
  assert.equal(above.y, 860 - 23 - 8);
  const left = placeFloat({ left: 0, top: 10, bottom: 40, width: 20 }, { width: 200, height: 23 }, viewport);
  assert.equal(left.x, 8, 'clear of the left edge');
  const right = placeFloat({ left: 1430, top: 10, bottom: 40, width: 10 }, { width: 200, height: 23 }, viewport);
  assert.equal(right.x, 1440 - 200 - 8, 'clear of the right edge');
  assert.equal(placeFloat({ left: 0, top: 100, bottom: 120, width: 10 }, { width: 0, height: 0 }, viewport).room, 900 - 120 - 18,
    'the room below, for the rich tooltip\'s height cap');
}

// 2. The rich tooltip places through the same helper and leaves its targets to itself.
{
  const rich = read('../richTooltip.ts');
  assert.match(rich, /import \{ placeFloat \} from '\.\/components\/floatPlacement\.ts';/);
  assert.match(rich, /registerRichTipTargets\(host, selector\)/);
  assert.match(rich, /unregister\(\)/, 'a disposed rich tooltip gives its targets back');
}

// 3. The hover tip's contract, as source: the dwell, the hold, touch, the targets and the opt-out.
{
  const tip = read('./hoverTip.ts');
  assert.match(tip, /const TIP_DWELL_MS = 600;/, 'the hover dwell sits in the 500 to 700 ms band');
  assert.match(tip, /const TIP_HOLD_MS = 500;/);
  assert.match(tip, /if \(event\.pointerType === 'touch'\) return;/, 'a touch never shows the tip by hover');
  assert.match(tip, /event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\);/, 'the release that ends a hold does not press');
  assert.match(tip, /closest\('\[data-tip-off\]'\)/, 'data-tip-off opts a control or region out');
  assert.match(tip, /control\.removeAttribute\('title'\)/, 'a title moves into the tip: the browser tooltip never stacks on it');
  assert.match(tip, /tip\.setAttribute\('role', 'tooltip'\)/);
}

// 4. Its sheet: the kit's tokens and the small-label floor, no literal colours.
{
  const css = read('./components.css');
  const rule = css.match(/\.cot-c-tip\{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /font:500 max\(var\(--fs-floor-11\),var\(--fs-11\)\)/, 'the 11 px floor pattern');
  assert.match(rule, /background:var\(--surface-menu\)/);
  assert.doesNotMatch(rule, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.match(css, /prefers-reduced-motion:reduce\)\{[^}]*\.cot-c-tip\{transition:none\}/);
}

// 5. One install per document, by every shell: the public pages and the game's settings panel.
{
  assert.match(read('../../presentation/publicNav.ts'), /installPageBehaviours\(\);/);
  assert.match(read('../settings.ts'), /\n  installPageBehaviours\(\);\n/);
  assert.match(read('./pageBehaviours.ts'), /installHoverTips\(doc\);\s*installMarkRoll\(doc\);/);
}

console.log('hoverTip.selftest: ok');
