// The technical diagrams' DOM labels (253): the text is composed from the sidecar's values in each locale (no baked
// string, the unit through the catalog), the two rails pack inside the band between the header and the legend at any box
// size with no two rows closer than the row pitch, every leader starts at its callout, and a malformed sidecar is
// refused. The sidecars themselves are tank-assets-check's (schema, hash, anchors on the raster).
import assert from 'node:assert/strict';
import { getLocale, setLocale } from './i18n.ts';
import {
  layoutTechnicalCallouts, parseTechnicalLabels, technicalKindOfView, technicalLabelText, technicalLabelsMarkup, TECHNICAL_LEGENDS,
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
      assert.equal(row.text, technicalLabelText(row.callout, 'armor'));
    }
  }
  // the 1x box keeps the old six a rail; a large one shows more
  assert.equal(layoutTechnicalCallouts(armor, 'armor', { width: 512, height: 256 }, { rowPx: 14 }).filter((r) => r.side === 'left').length, 6);
  assert.equal(layoutTechnicalCallouts(armor, 'armor', { width: 1280, height: 640 }, { rowPx: 20 }).filter((r) => r.side === 'left').length, 10);

  // the static markup (a Node prerender) carries the same rows, escaped, with the tones and places as custom properties
  const markup = technicalLabelsMarkup({ schema: 1, id: 'x', size: [1024, 512], armor, modules: [], crew: [] }, 'armor', { width: 512, height: 256 }, { rowPx: 18 });
  assert.equal((markup.match(/class="cot-tdl-chip/g) || []).length, layoutTechnicalCallouts(armor, 'armor', { width: 512, height: 256 }, { rowPx: 18 }).length);
  assert.ok(markup.includes('H01 · 400 mm') && markup.includes('--tdl-tone:#e96959') && markup.includes('cot-tdl-legend'));
  assert.ok(!/<script|on[a-z]+=/i.test(technicalLabelsMarkup({ schema: 1, id: 'x', size: [1024, 512], modules: [callout('M1', .2, .5, .1, { module: 'x', title: '<script>' })], armor: [], crew: [] }, 'modules', { width: 512, height: 256 })), 'text is escaped');
  assert.equal(technicalKindOfView('armor_side'), 'armor');
  assert.equal(technicalKindOfView('modules_side'), 'modules');
  assert.equal(technicalKindOfView('angle'), null);
  assert.equal(TECHNICAL_LEGENDS.armor.length, 6);
  const good = { schema: 1, id: 'm1a1', size: [1024, 512], armor: [], modules: [], crew: [] };
  assert.equal(parseTechnicalLabels(good, 'm1a1'), good);
  for (const bad of [null, { ...good, schema: 2 }, { ...good, id: 'leo2a4' }, { ...good, crew: undefined }]) {
    assert.throws(() => parseTechnicalLabels(bad, 'm1a1'), /schema-1 sidecar/);
  }
} finally {
  await setLocale(original);
}
console.log('technicalDiagramLabels: en/zh label text from the sidecar values, rails packed inside the band at 360-1920 px, leaders from their callouts, the static markup escaped, malformed sidecars refused PASS');
