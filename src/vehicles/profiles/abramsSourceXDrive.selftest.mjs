import assert from 'node:assert/strict';
import { buildAbramsSourceXDriveGeometry } from './abramsSourceXDrive.ts';

const snapshot = geometry => Object.fromEntries(Object.entries(geometry.attributes)
  .map(([name, attribute]) => [name, attribute.array.slice()]));
const expected = new Map();
for (const high of [false, true]) for (const legacy of [false, true]) {
  const stock = buildAbramsSourceXDriveGeometry(high, legacy);
  expected.set(`${high}/${legacy}`, Object.fromEntries(Object.entries(stock)
    .map(([name, geometry]) => [name, snapshot(geometry)])));
  for (const geometry of Object.values(stock)) geometry.dispose();
}

// Interleave both qualities and legacy stock. A damaged or disposed vehicle
// must not corrupt either a live sibling or a later construction.
for (const [high, legacy] of [[true, false], [false, false], [false, true], [true, true], [false, false]]) {
  const damaged = buildAbramsSourceXDriveGeometry(high, legacy);
  const sibling = buildAbramsSourceXDriveGeometry(high, legacy);
  for (const name of ['body', 'dark']) {
    assert.notEqual(damaged[name], sibling[name]);
    for (const [key, attribute] of Object.entries(damaged[name].attributes)) {
      assert.notEqual(attribute.array.buffer, sibling[name].attributes[key].array.buffer);
      attribute.array.fill(123);
    }
    damaged[name].clearGroups();
    damaged[name].setDrawRange(0, 0);
    damaged[name].dispose();
    assert.deepEqual(snapshot(sibling[name]), expected.get(`${high}/${legacy}`)[name]);
  }
  const next = buildAbramsSourceXDriveGeometry(high, legacy);
  for (const name of ['body', 'dark']) {
    assert.deepEqual(snapshot(next[name]), expected.get(`${high}/${legacy}`)[name]);
    assert.equal(next[name].drawRange.count, Infinity);
    next[name].dispose(); sibling[name].dispose();
  }
}
console.log('Abrams drive stock: both qualities/legacy preserve independent mutable geometry through damage and disposal');
