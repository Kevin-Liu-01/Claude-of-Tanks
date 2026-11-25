// hexPlate.selftest.mjs — the HUD's one hexagon (notices-polish-277; Kevin 2026-11-24, on live 276: "the tank/missile/
// airfraft warnings are circles rn. change them to hexagons", "for a kill card ... also make it a hexagon!!", "why does auto
// aim off have rounded borders?? hexagons pls"). Copyright © 2026 Kevin B. Liu.
// - the shape: flat top and foot, a point at each end; the bubble its regular form round a centre, its countdown outline
//   from the middle of its top edge, its glyph's room kept;
// - one place: every battle notice surface takes its hexagon from hexPlate.ts (the plates' clip, the kill card, the rim
//   warnings), no sheet writes a hexagon polygon of its own, and no notice kind declares another shape;
// - the census: no battle notice surface is rounded (a round clip, a border-radius, a circle), save the reasoned exceptions;
// - the kill card fits the destroyed hull whole: its silhouette's bounds inside the render's box for every proportion.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexBubbleOutline, hexBubblePath, hexBubblePerimeter, hexBubbleRadius, hexPlateClip, hexPlateCorners } from './hexPlate.ts';
import { fitPortraitInBox } from './portraitFraming.ts';
import { NOTICE_KINDS } from './noticeKinds.ts';

// ---- the shape
assert.deepEqual(hexPlateCorners(100, 40, 8), [[8, 0], [92, 0], [100, 20], [92, 40], [8, 40], [0, 20]]);
assert.deepEqual(hexPlateCorners(10, 40, 8)[1], [5, 0], 'a slant never runs past the middle');
assert.equal(hexPlateClip('var(--p)'), 'polygon(var(--p) 0,calc(100% - var(--p)) 0,100% 50%,calc(100% - var(--p)) 100%,var(--p) 100%,0 50%)');
{
  const path = hexBubblePath(0, 0, 20);
  assert.equal(path, 'M-10.00,-17.32L10.00,-17.32L20.00,0.00L10.00,17.32L-10.00,17.32L-20.00,0.00Z', 'the regular plate: points left and right');
  assert.match(hexBubbleOutline(20), /^M0,-17\.32L10\.00,-17\.32L20\.00,0L/, 'the countdown starts at the middle of the top edge');
  assert.equal(hexBubblePerimeter(20), 120);
  // (the glyph's 24-unit box at the bubble's scale fits the hexagon's inscribed circle)
  for (const r of [15, 18]) assert.ok(hexBubbleRadius(r) * Math.sqrt(3) / 2 >= r * 0.96, `r ${r}: the glyph's room kept`);
}

// ---- one place: every hexagon from hexPlate.ts
const read = (file) => readFileSync(file, 'utf8');
const hud = read('src/ui/hud.ts'), layout = read('src/ui/battleHudLayout.css'), ribbon = read('src/ui/hudKillRibbon.ts');
const pointerLayer = read('src/ui/pointers/pointerLayer.ts');
assert.match(hud, /\.cot-sixth,\.cot-alert,\.cot-aim-warning,\.binocular-readout\{--notice-cut:\$\{hexPlateClip\('var\(--notice-point\)'\)\}/, 'the plates\' cut');
assert.match(hud, /\.cot-battle-notices \.cot-c-notice\{--notice-cut:\$\{hexPlateClip\('var\(--notice-point\)'\)\};\}/, 'the condition lane\'s cut');
assert.match(ribbon, /clip-path:\$\{hexPlateClip\('var\(--kc-point\)'\)\}/, 'the kill card\'s plate');
for (const part of ['disc', 'pulse']) assert.match(pointerLayer, new RegExp(`nodes\\.${part}\\.setAttribute\\('d', hexBubblePath\\(`), `the rim bubble's ${part}`);
assert.match(pointerLayer, /nodes\.ring\.setAttribute\('d', hexBubbleOutline\(ringR\)\)/, 'the air run\'s countdown');
assert.match(pointerLayer, /svgEl\('path', '', badge\)\.setAttribute\('d', hexBubblePath\(0, 0, 8\)\)/, 'a merged bubble\'s count');
assert.doesNotMatch(pointerLayer, /svgEl\('circle'/, 'no circle on the rim');
for (const [file, text] of [['src/ui/hud.ts', hud], ['src/ui/battleHudLayout.css', layout], ['src/ui/hudKillRibbon.ts', ribbon],
  ['src/ui/airSupportHud.css', read('src/ui/airSupportHud.css')], ['src/ui/components/notices.css', read('src/ui/components/notices.css')]]) {
  assert.doesNotMatch(text, /polygon\([^)]*100% 50%/, `${file}: no hexagon written by hand (hexPlate.ts hexPlateClip)`);
}
for (const [kind, declared] of Object.entries(NOTICE_KINDS)) assert.ok(!('shape' in declared), `${kind}: no kind declares a shape of its own`);

// ---- the census: no rounded battle notice surface
// (the notice surfaces: the plates and the lanes, the kill card, the rim warnings; a rule whose selector names one and sets a
// round clip or a border-radius other than 0 fails, save an exception with its reason)
const SURFACES = ['.cot-c-notice', '.cot-alert', '.cot-sixth', '.cot-aim-warning', '.binocular-readout', '.cot-ribbon', '.cot-ptr-'];
const EXCEPTIONS = new Map([
  // a chip inside a surface is the kit's chip (its cause), not a notice's outline
  ['.cot-ribbon .fl .cot-flag', 'a flag\'s 1 px corner, inside the card'],
  ['.cot-c-notice__media', 'the key-hint diagram\'s picture inside the plate, not its outline'],
  ['.cot-c-notice__art', 'the art layer inherits its host\'s radius (0 on every battle plate)'],
  ['.cot-c-notice__art img', 'the same: inherits its layer\'s'],
]);
const rulesOf = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
const BATTLE_SHEETS = { 'src/ui/hud.ts': hud, 'src/ui/battleHudLayout.css': layout, 'src/ui/hudKillRibbon.ts': ribbon,
  'src/ui/pointers/pointers.css': read('src/ui/pointers/pointers.css'), 'src/ui/airSupportHud.css': read('src/ui/airSupportHud.css') };
const rounded = [];
for (const [file, css] of Object.entries(BATTLE_SHEETS)) {
  for (const [selector, body] of rulesOf(css)) {
    if (!SURFACES.some((s) => selector.includes(s))) continue;
    if ([...EXCEPTIONS.keys()].some((e) => selector.includes(e))) continue;
    // (the kit's own sheet rounds a menu toast; on the battle's lanes the HUD's rules set it to 0 with the hexagon)
    const radius = /border-radius:\s*([^;]+)/.exec(body)?.[1]?.trim();
    if (radius && !/^0(px)?$/.test(radius) && radius !== 'inherit') rounded.push(`${file}: ${selector} border-radius:${radius}`);
    if (/clip-path:[^;]*round|--notice-cut:\s*inset\([^)]*round/.test(body)) rounded.push(`${file}: ${selector} a round clip`);
  }
}
assert.deepEqual(rounded, [], 'no battle notice surface is rounded');
assert.match(layout, /body\[data-cot-battle-layout\] \.cot-battle-notices \.cot-c-notice\{--notice-point:8px;[^}]*border-radius:0/, 'the kit\'s notice squared on the battle lane');

// ---- the kill card: the hull whole in its box
{
  const box = { w: 196, h: 92 };
  // a long gun (wide and low), a tall launcher, a squat casemate, an off-centre render
  const hulls = [{ x0: 20, y0: 200, width: 470, height: 140 }, { x0: 140, y0: 60, width: 230, height: 420 },
    { x0: 60, y0: 220, width: 380, height: 260 }, { x0: 0, y0: 0, width: 512, height: 512 }];
  for (const b of hulls) {
    const bounds = { ...b, x1: b.x0 + b.width - 1, y1: b.y0 + b.height - 1, centerX: b.x0 + b.width / 2, bottom: b.y0 + b.height };
    const fit = fitPortraitInBox(bounds, 512, box.w, box.h, 0.05);
    const scale = (fit.width * box.w) / 512;
    const left = fit.left * box.w + b.x0 * scale, top = fit.top * box.h + b.y0 * scale;
    const right = left + b.width * scale, bottom = top + b.height * scale;
    assert.ok(left >= box.w * 0.05 - 0.01 && right <= box.w * 0.95 + 0.01 && top >= box.h * 0.05 - 0.01 && bottom <= box.h * 0.95 + 0.01,
      `the hull ${JSON.stringify(b)} whole inside the padded box (${left.toFixed(1)},${top.toFixed(1)} to ${right.toFixed(1)},${bottom.toFixed(1)})`);
    assert.ok(Math.abs(right - left - box.w * 0.9) < 0.01 || Math.abs(bottom - top - box.h * 0.9) < 0.01, 'and as large as the box allows');
  }
}
console.log('hexPlate.selftest: PASS (one hexagon for the plates, the kill card and the rim; no rounded notice; the hull whole)');
