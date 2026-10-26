// The technical diagrams' DOM labels (253): the text is composed from the sidecar's values in each locale (no baked
// string, the unit through the catalog), the two rails pack inside the band between the header and the legend at any box
// size with no two rows closer than the row pitch, every leader starts at its callout, and a malformed sidecar is
// refused. The tones are tokens: every colour a shipped sidecar records names one (data-tone), every tone has its token
// and its rule in the sheet, and the static markup writes no colour. The sidecars themselves are tank-assets-check's
// (schema, hash, anchors on the raster).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { getLocale, setLocale } from './i18n.ts';
import { technicalToneHex, technicalToneOf } from './technicalDiagramLegend.ts';
import {
  layoutTechnicalCallouts, parseTechnicalLabels, spreadBadges, technicalKindOfView, technicalLabelText, technicalLabelsMarkup,
  TECHNICAL_COMPACT_BELOW_PX, TECHNICAL_LEGENDS,
} from './technicalDiagramLabels.ts';

const original = getLocale();
const callout = (key, x, y, weight, extra = {}) => ({ key, anchor: [x, y], weight, color: '#e96959', ...extra });
const armor = [
  ...Array.from({ length: 10 }, (_, i) => callout(`H${String(i + 1).padStart(2, '0')}`, .25 + i * .02, .30 + i * .04, .001 * (10 - i), { keMm: 400 + i })),
  ...Array.from({ length: 10 }, (_, i) => callout(`T${String(i + 1).padStart(2, '0')}`, .60 + i * .02, .45 + i * .001, .001 * (i + 1), { keMm: 700 - i })),
];
try {
  await setLocale('en-US');
  assert.equal(technicalLabelText(armor[0], 'armor'), 'H01 · 400 mm');
  assert.equal(technicalLabelText(callout('M02', .5, .5, .01, { module: 'ammoRack' }), 'modules'), 'M02 · Ammo rack');
  assert.equal(technicalLabelText(callout('C01', .5, .5, .01, { crew: 'driver' }), 'crew'), 'C01 · Driver');
  // a module the catalog does not name falls back to the callout's own title
  assert.equal(technicalLabelText(callout('M09', .5, .5, .01, { module: 'smokeDischarger', title: 'smoke Discharger' }), 'modules'), 'M09 · smoke Discharger');
  await setLocale('zh-CN');
  assert.equal(technicalLabelText(armor[0], 'armor'), 'H01 · 400 毫米', 'the unit comes from the catalog');
  assert.equal(technicalLabelText(callout('M02', .5, .5, .01, { module: 'ammoRack' }), 'modules'), 'M02 · 弹药架');
  assert.equal(technicalLabelText(callout('C01', .5, .5, .01, { crew: 'driver' }), 'crew'), 'C01 · 驾驶员');
  await setLocale('en-US');

  for (const [width, rowPx] of [[360, 18], [512, 18], [800, 20], [1280, 21], [1920, 24]]) {
    const box = { width, height: width / 2 };
    const rows = layoutTechnicalCallouts(armor, 'armor', box, { rowPx });
    for (const side of ['left', 'right']) {
      const rail = rows.filter((row) => row.side === side).sort((a, b) => a.y - b.y);
      assert.ok(rail.length >= Math.min(6, Math.floor((210 - 56) / 256 * box.height / rowPx) + 1) && rail.length <= 10, `${width}: ${side} rail holds its labels (${rail.length})`);
      for (const row of rail) assert.ok(row.y >= 56 / 256 * box.height - 1e-9 && row.y <= 210 / 256 * box.height + 1e-9, `${width}: ${side} row inside the band (${row.y})`);
      for (let i = 1; i < rail.length; i++) assert.ok(rail[i].y - rail[i - 1].y >= rowPx - 1e-9, `${width}: ${side} rows a pitch apart`);
      // the heaviest of its side are the ones shown
      const shown = new Set(rail.map((row) => row.callout.key));
      const side0 = armor.filter((c) => (c.anchor[0] < .5) === (side === 'left')).sort((a, b) => b.weight - a.weight);
      assert.deepEqual([...shown].sort(), side0.slice(0, rail.length).map((c) => c.key).sort(), `${width}: ${side} shows its heaviest`);
    }
    for (const row of rows) {
      assert.deepEqual(row.leader[0], [row.callout.anchor[0] * box.width, row.callout.anchor[1] * box.height], 'the leader starts at its callout');
      // and stays inside the box, ending on its own rail's side of the elbow (a right leader ran out past the box)
      for (const [x] of row.leader) assert.ok(x >= 0 && x <= box.width, `a ${row.side} leader stays inside the box (${x.toFixed(1)} of ${box.width})`);
      const end = row.leader.at(-1)[0], elbow = row.leader[1][0];
      assert.ok(row.side === 'left' ? end <= elbow && end >= row.edgeX : end >= elbow && end <= row.edgeX, `a ${row.side} leader ends between its elbow and its rail`);
      assert.equal(row.text, technicalLabelText(row.callout, 'armor'));
    }
  }
  // the 1x box keeps the old six a rail; a large one shows more
  assert.equal(layoutTechnicalCallouts(armor, 'armor', { width: 512, height: 256 }, { rowPx: 14 }).filter((r) => r.side === 'left').length, 6);
  assert.equal(layoutTechnicalCallouts(armor, 'armor', { width: 1280, height: 640 }, { rowPx: 20 }).filter((r) => r.side === 'left').length, 10);

  // the static markup (a Node prerender) carries the same rows, escaped, the tones as data-tone and the places as
  // custom properties: no colour is written into the page (style-literal-census)
  const markup = technicalLabelsMarkup({ schema: 1, id: 'x', size: [1024, 512], armor, modules: [], crew: [] }, 'armor', { width: 512, height: 256 }, { rowPx: 18 });
  assert.equal((markup.match(/class="cot-tdl-chip/g) || []).length, layoutTechnicalCallouts(armor, 'armor', { width: 512, height: 256 }, { rowPx: 18 }).length);
  assert.ok(markup.includes('H01 · 400 mm') && markup.includes('data-tone="armor-ke-0"') && markup.includes('cot-tdl-legend'));
  assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|--tdl-tone/i.test(markup), 'the static markup writes no colour');
  // the compact drawing (a phone's box): each rail's four heaviest as numbered pins, keyed in flow under the image in
  // the same order (left rail, then right), the rest minor; the sheet switches at the constant's width
  const laid = layoutTechnicalCallouts(armor, 'armor', { width: 512, height: 256 }, { rowPx: 18 });
  for (const side of ['left', 'right']) {
    const ranks = laid.filter((r) => r.side === side).map((r) => r.rank).sort((a, b) => a - b);
    assert.deepEqual(ranks, ranks.map((_, i) => i), `the ${side} rail ranks its labels by weight`);
    const top = laid.filter((r) => r.side === side && r.rank === 0)[0];
    assert.ok(laid.filter((r) => r.side === side).every((r) => r.callout.weight <= top.callout.weight), 'rank 0 is the heaviest');
  }
  const badges = [...markup.matchAll(/<b class="cot-tdl-n cot-tdl-n--pin"[^>]*--tdl-x:([\d.]+)%;--tdl-y:([\d.]+)%">(\d+)<\/b>/g)];
  const pinNumbers = badges.map((m) => Number(m[3]));
  // the badges cover no one another even where callouts share an anchor, at the narrowest compact box the page draws
  for (const boxWidth of [320, 479]) {
    const at = badges.map((m) => [Number(m[1]) / 100 * boxWidth, Number(m[2]) / 100 * boxWidth / 2]);
    for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) {
      assert.ok(Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1]) >= 16, `badges ${i + 1} and ${j + 1} stay apart at ${boxWidth} px`);
    }
  }
  const stacked = spreadBadges([[100, 50], [100, 50], [100, 50], [100, 50]], 17, { width: 340, height: 170 });
  for (let i = 0; i < stacked.length; i++) for (let j = i + 1; j < stacked.length; j++) assert.ok(Math.hypot(stacked[i][0] - stacked[j][0], stacked[i][1] - stacked[j][1]) >= 17 - 1e-9);
  assert.deepEqual(stacked[0], [100, 50], 'the first badge stays on its callout');
  assert.ok(stacked.every(([x, y]) => x >= 8.5 && x <= 331.5 && y >= 8.5 && y <= 161.5), 'badges stay inside the box');
  const keyItems = [...markup.matchAll(/<li data-rail="(left|right)"><b class="cot-tdl-n"[^>]*>(\d+)<\/b>([^<]*)<\/li>/g)];
  assert.deepEqual(keyItems.map((m) => Number(m[2])), keyItems.map((_, i) => i + 1), 'the key numbers its labels in order');
  assert.deepEqual(pinNumbers.sort((a, b) => a - b), keyItems.map((m) => Number(m[2])), 'every numbered pin has its key entry');
  assert.ok(keyItems.length <= 8 && keyItems.length >= 2, 'four labels a rail at most');
  assert.ok(keyItems.findIndex((m) => m[1] === 'right') === -1 || keyItems.slice(keyItems.findIndex((m) => m[1] === 'right')).every((m) => m[1] === 'right'),
    'the left rail\'s labels come first');
  assert.ok(markup.includes('class="cot-tdl-key cot-tdl-key--auto"'), 'the static key waits for its container');
  assert.equal(TECHNICAL_COMPACT_BELOW_PX, 480);
  const css = readFileSync(new URL('./technicalDiagramLabels.css', import.meta.url), 'utf8');
  for (const name of ['tdl', 'tdl-host']) {
    assert.ok(css.includes(`@container ${name} (max-width:${TECHNICAL_COMPACT_BELOW_PX - .02}px)`), `the ${name} query switches at the constant`);
  }
  // its places are percentages of the fluid box, every one inside it
  const places = [...markup.matchAll(/--tdl-[xy]:(-?[\d.]+)%/g)].map((m) => Number(m[1]));
  assert.ok(places.length >= 4 && places.every((v) => v >= 0 && v <= 100), 'static places are percentages inside the box');
  assert.ok(!/<script|\son[a-z]+=/i.test(technicalLabelsMarkup({ schema: 1, id: 'x', size: [1024, 512], modules: [callout('M1', .2, .5, .1, { module: 'x', title: '<script>' })], armor: [], crew: [] }, 'modules', { width: 512, height: 256 })), 'text is escaped');
  assert.equal(technicalKindOfView('armor_side'), 'armor');
  assert.equal(technicalKindOfView('modules_side'), 'modules');
  assert.equal(technicalKindOfView('angle'), null);
  assert.equal(TECHNICAL_LEGENDS.armor.length, 6);
  // every tone: a token, a rule in the sheet; every colour a shipped sidecar records: a tone
  const sheet = readFileSync(new URL('./technicalDiagramLabels.css', import.meta.url), 'utf8');
  const tones = JSON.parse(readFileSync(new URL('./tokens/tokens.json', import.meta.url), 'utf8')).component['surface-diagram'];
  assert.ok(sheet.includes("@import url('./tokens/surface-diagram.css')"), 'the sheet imports the diagrams\' tone tokens');
  for (const key of Object.keys(tones).filter((k) => k.startsWith('diagram-'))) {
    const tone = key.slice(8);
    assert.equal(technicalToneHex(tone), tones[key].value, `${tone}: its token resolves to its value`);
    assert.equal(technicalToneOf(tones[key].value), tone);
    assert.ok(sheet.includes(`[data-tone='${tone}']{--tdl-tone:var(--diagram-${tone})}`), `${tone}: the sheet maps it`);
  }
  for (const [, tone] of Object.values(TECHNICAL_LEGENDS).flat()) assert.ok(technicalToneHex(tone), `legend tone ${tone}`);
  const icons = new URL('../../public/icons/', import.meta.url);
  const shipped = new Set();
  for (const file of readdirSync(icons).filter((f) => f.endsWith('_technical.json'))) {
    const data = JSON.parse(readFileSync(new URL(file, icons), 'utf8'));
    for (const kind of ['armor', 'modules', 'crew']) for (const c of data[kind]) shipped.add(c.color);
  }
  const untoned = [...shipped].filter((color) => !technicalToneOf(color));
  assert.deepEqual(untoned, [], 'every colour the shipped sidecars record names a tone');
  const good = { schema: 1, id: 'm1a1', size: [1024, 512], armor: [], modules: [], crew: [] };
  assert.equal(parseTechnicalLabels(good, 'm1a1'), good);
  for (const bad of [null, { ...good, schema: 2 }, { ...good, id: 'leo2a4' }, { ...good, crew: undefined }]) {
    assert.throws(() => parseTechnicalLabels(bad, 'm1a1'), /schema-1 sidecar/);
  }
} finally {
  await setLocale(original);
}
console.log('technicalDiagramLabels: en/zh label text from the sidecar values, rails packed inside the band at 360-1920 px, leaders from their callouts, the static markup escaped and colour-free, the compact key numbered with its pins, every tone a token, malformed sidecars refused PASS');
