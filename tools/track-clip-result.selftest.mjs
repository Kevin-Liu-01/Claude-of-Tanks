import assert from 'node:assert/strict';
import { strictTrackClipPassed } from './track-clip-result.mjs';
const clear = { front: '0', rear: '0', sweepBand: '0', sweepShoe: '0' };
assert.equal(strictTrackClipPassed(clear), true);
assert.equal(strictTrackClipPassed({ front: 0, rear: 0, sweepBand: 0, sweepShoe: 0 }), true);
for (const value of [undefined, null, {}, { error: 'capture failed' }]) {
  assert.equal(strictTrackClipPassed(value), false, 'missing audit fails closed');
}
for (const key of Object.keys(clear)) for (const value of [undefined, null, '', ' ', '—', NaN, Infinity, -1, 1, '1']) {
  assert.equal(strictTrackClipPassed({ ...clear, [key]: value }), false, `${key}/${value}: incomplete or intersecting audit fails`);
}
console.log('track-clip-result: complete zero-intersection evidence required; failed/missing/malformed audits cannot pass');
