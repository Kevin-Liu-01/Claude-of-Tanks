import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { presentationNumberSource, presentationReceiptErrors } from './presentation-receipt.mjs';

// Actual saved/runtime disagreement from frozen nine-tank release 74d189dfa.
const cases = [
  ['leo2_revolution', { xM:0, zM:.0788 }, { centerYM:1.9843, topHalfM:6.4532, sideHalfM:3.2266 }, 1.9893],
  ['leo2a7v_x', { xM:.0002, zM:-.0659 }, { centerYM:2.7753, topHalfM:7.5592, sideHalfM:3.7796 }, 2.7825],
];
let negatives = 0;
for (const [id, anchor, projection, staleY] of cases) {
  Object.freeze(anchor); Object.freeze(projection);
  const before = JSON.stringify([anchor, projection]);
  const check = (a = anchor, p = projection, sa = anchor, sp = projection) =>
    presentationReceiptErrors(id, a, p, sa, sp);
  assert.deepEqual(check(), []);
  const stale = check(anchor, projection, anchor, { ...projection, centerYM:staleY });
  assert.equal(stale.length, 1); assert.match(stale[0], /projection\.centerYM/); negatives++;
  for (const [kind, fields] of [['anchor', ['xM', 'zM']], ['projection', ['centerYM', 'topHalfM', 'sideHalfM']]]) {
    for (const field of fields) for (const side of ['actual', 'saved']) {
      for (const bad of [undefined, NaN, Infinity, -Infinity, '1']) {
        const a = { ...anchor }, p = { ...projection }, sa = { ...anchor }, sp = { ...projection };
        const target = kind === 'anchor' ? (side === 'actual' ? a : sa) : (side === 'actual' ? p : sp);
        target[field] = bad;
        assert.ok(check(a, p, sa, sp).some(message => message.includes(`${kind}.${field}`))); negatives++;
      }
      const a = { ...anchor }, p = { ...projection }, sa = { ...anchor }, sp = { ...projection };
      const target = kind === 'anchor' ? (side === 'actual' ? a : sa) : (side === 'actual' ? p : sp);
      target[field] += .0001;
      assert.ok(check(a, p, sa, sp).some(message => message.includes(`${kind}.${field}`))); negatives++;
    }
  }
  for (const field of ['topHalfM', 'sideHalfM']) for (const invalid of [0, -.1]) {
    assert.match(check(anchor, { ...projection, [field]:invalid })[0], /must be positive/); negatives++;
    assert.match(check(anchor, projection, anchor, { ...projection, [field]:invalid })[0], /must be positive/); negatives++;
  }
  assert.equal(presentationReceiptErrors(id, undefined, undefined, undefined, undefined).length, 5); negatives++;
  assert.equal(check(null, null, null, null).length, 5); negatives++;
  assert.deepEqual(check({ xM:anchor.xM + .000001, zM:anchor.zM - .000001 }), [],
    'measured values use exactly the existing generator precision');
  assert.equal(JSON.stringify([anchor, projection]), before, 'validator never edits generated records');
}
for (const value of [-0, -.000001, 0, .000001, .000049, .000051, 1.23456, -1.23456, 2.7825]) {
  const rounded = Number(Number(value).toFixed(4));
  const legacy = Object.is(rounded, -0) ? '0' : String(rounded);
  assert.equal(presentationNumberSource(value), legacy, 'shared serializer is byte-identical to original generator');
}

// Wiring controls: targeted checks cannot bypass equality; live-only assets
// still avoid saved receipts, and stale metadata fails before server startup.
const centering = readFileSync(new URL('./presentation-centering.mjs', import.meta.url), 'utf8');
const assets = readFileSync(new URL('./tank-assets-check.mjs', import.meta.url), 'utf8');
assert.ok(centering.indexOf('const receiptErrors = ids.flatMap') < centering.indexOf('if (!selectedIds.length)'));
assert.match(centering, /presentationNumberSource as numberSource/);
assert.match(centering, /rows\[id\], rows\[id\]\?\.projection,\s*TANK_PRESENTATION_ANCHORS\[id\], TANK_PRESENTATION_PROJECTIONS\[id\]/);
assert.match(centering, /if \(current !== expected\)/, 'keep full-fleet exact source equality');
assert.match(centering, /const MAX_RESIDUAL_PX = 0\.25;/);
assert.match(centering, /const MAX_EXPORTED_RESIDUAL_PX = 0\.5;/);
assert.match(assets, /const manifest = liveOnly \? null :/);
assert.match(assets, /if \(manifest\) \{\s*const receiptErrors/);
assert.ok(assets.indexOf('const receiptErrors') < assets.indexOf('const server = await createServer'));
assert.match(assets, /if \(saved\) failures\.push\(\.\.\.presentationReceiptErrors\(id,\s*live\.presentationAnchor, live\.presentationProjection,\s*saved\.presentationAnchor, saved\.presentationProjection\)\)/);
console.log(`presentation-receipt: exact four-decimal fields, two original stale-Y witnesses, ${negatives} rejected mutations, immutable inputs and both preflight consumers PASS`);
