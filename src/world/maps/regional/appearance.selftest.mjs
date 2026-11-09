// src/world/maps/regional/appearance.selftest.mjs — the look picker's laws (item buildings-270, appearance.ts):
//   1. with a ledger, no two buildings within LOOK_RADIUS_M wear the same dress while the row has one to spare, and none
//      shares every feature (while the variation has room);
//   2. the pick is deterministic: the same streams and places give the same looks;
//   3. the stream reads the same whatever the ledger does (every draw comes first), so nothing after it moves;
//   4. every dress option and tint comes from the row's variation and the kit's palette; the roof age stays in its spread;
//   5. the paint slot holds only round its build.
import assert from 'node:assert/strict';

const { AppearanceLedger, LOOK_RADIUS_M, pickLook, withPaint, paintOverride } = await import('./appearance.ts');
const { streamFrom, hashSeed, rgb } = await import('./geometry.ts');

const palette = {
  plaster: [[1, 1, 1], [1, 0.97, 0.9], [0.95, 0.95, 0.93]],
  stone: [[1, 1, 1], [0.94, 0.93, 0.9]],
  roof: [[1, 1, 1], [0.9, 0.84, 0.78], [0.82, 0.8, 0.76]],
};
const variation = { axes: { gable: ['sunburst', 'star', 'spike'], paint: ['#2e5a8a', '#3f6a4a'] }, roofAge: [0.2, 0.9] };

/** A street of `n` houses 12 m apart, every one drawn from the same seed (the worst case: every first pick alike). */
function street(n, ledger, sameSeed) {
  const looks = [];
  for (let i = 0; i < n; i++) {
    const rng = streamFrom(sameSeed ? 7 : hashSeed('appearance-selftest', i));
    looks.push({ x: i * 12, z: 0, look: pickLook(palette, variation, rng, ledger ? { ledger, x: i * 12, z: 0 } : undefined) });
  }
  return looks;
}

// 1
for (const sameSeed of [true, false]) {
  const looks = street(30, new AppearanceLedger(), sameSeed);
  for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) {
    const a = looks[i], b = looks[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < LOOK_RADIUS_M) assert.notEqual(a.look.key, b.look.key, `houses ${i} and ${j} share every feature`);
  }
}
// the dress first: four houses in a row (all neighbours) drawn from one seed wear four dresses (the row offers six)
const row4 = street(4, new AppearanceLedger(), true);
assert.equal(new Set(row4.map((l) => `${l.look.dress.gable}/${l.look.dress.paint}`)).size, 4, 'four neighbours, four dresses');
// without a ledger, identical seeds give identical looks (the class the rule fixes)
const bare = street(4, null, true);
assert.equal(new Set(bare.map((l) => l.look.key)).size, 1);

// 2
assert.deepEqual(street(12, new AppearanceLedger(), true).map((l) => l.look), street(12, new AppearanceLedger(), true).map((l) => l.look));

// 3
for (const withLedger of [false, true]) {
  const rng = streamFrom(11);
  const ledger = new AppearanceLedger();
  if (withLedger) for (let k = 0; k < 40; k++) pickLook(palette, variation, streamFrom(11), { ledger, x: 0, z: 0 });
  pickLook(palette, variation, rng, withLedger ? { ledger, x: 0, z: 0 } : undefined);
  const after = rng();
  const ref = streamFrom(11);
  pickLook(palette, variation, ref);
  assert.equal(after, ref(), `the stream after the pick reads the same (ledger ${withLedger})`);
}

// 4
for (const { look } of street(30, new AppearanceLedger(), false)) {
  assert.ok(variation.axes.gable.includes(look.dress.gable) && variation.axes.paint.includes(look.dress.paint));
  assert.ok(look.tints.roofAge >= 0.2 && look.tints.roofAge <= 0.9, `roof age ${look.tints.roofAge}`);
}
const none = pickLook(palette, null, streamFrom(3));
assert.deepEqual(none.dress, {});

// 5
assert.equal(paintOverride(), null);
withPaint('#2e5a8a', () => assert.deepEqual(paintOverride(), rgb(0x2e5a8a)));
withPaint(undefined, () => assert.equal(paintOverride(), null));
assert.equal(paintOverride(), null);

console.log('appearance selftest: no two neighbours alike, deterministic, stream-stable, from the row, paint scoped');
