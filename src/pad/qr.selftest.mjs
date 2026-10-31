// The pairing link's QR encoder (src/pad/qr.ts). Known answers: each matrix below was decoded back to its text by an
// independent reader, macOS Vision's VNDetectBarcodesRequest (2026-10-30, phone-controller-266), across versions 1, 3,
// 5, 7 (version information) and 10 (the 16-bit count) and five masks; the hashes pin those exact matrices. Structure:
// finders, timing, the dark module, and both copies of the format information decode (BCH) to level M and the mask.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeQr, qrSvgPath } from './qr.ts';

const KNOWN = [
  ['https://cot.kevinliu.studio/pad#K7Q4MZ', 3, 3, '66f75b9fafab165d'],
  ['https://cot.kevinliu.studio/cn/pad#ABCDEF', 3, 6, '427e6882608f4e11'],
  ['A', 1, 4, 'e7f54841f44718f3'],
  ['http://192.168.1.20:5173/pad?padService=ws%3A%2F%2F192.168.1.20%3A8792#K7Q4MZ', 5, 6, 'efded50c3a0b4393'],
  ['x'.repeat(120), 7, 2, '28b4c662aaf1cdc6'],
  ['Z9'.repeat(100), 10, 3, '7fa2acea52b9256c'],
];

for (const [text, version, mask, hash] of KNOWN) {
  const m = encodeQr(text);
  assert.equal(m.version, version, `${text.slice(0, 24)}: the smallest version that holds it`);
  assert.equal(m.size, version * 4 + 17);
  assert.equal(m.mask, mask, `${text.slice(0, 24)}: the lowest-penalty mask`);
  assert.equal(createHash('sha256').update(m.dark).digest('hex').slice(0, 16), hash, `${text.slice(0, 24)}: the Vision-verified matrix`);

  const at = (x, y) => m.dark[y * m.size + x] === 1;
  // finders: a 7x7 ring, a light ring, a 3x3 core, at three corners
  for (const [ox, oy] of [[0, 0], [m.size - 7, 0], [0, m.size - 7]]) {
    for (let d = 0; d < 7; d++) {
      assert.ok(at(ox + d, oy) && at(ox + d, oy + 6) && at(ox, oy + d) && at(ox + 6, oy + d), 'finder outer ring');
    }
    assert.ok(at(ox + 3, oy + 3) && !at(ox + 1, oy + 1), 'finder core and light ring');
  }
  for (let i = 8; i < m.size - 8; i++) assert.equal(at(i, 6), i % 2 === 0, 'timing pattern');
  assert.ok(at(8, m.size - 8), 'the dark module');
  // both copies of the format information read back as level M with the chosen mask
  const read = (positions) => positions.reduce((bits, [x, y], i) => bits | (at(x, y) ? 1 << i : 0), 0);
  const first = read([[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]);
  const second = read([...Array.from({ length: 8 }, (_, i) => [m.size - 1 - i, 8]), ...Array.from({ length: 7 }, (_, i) => [8, m.size - 7 + i])]);
  assert.equal(first, second, 'the two format copies agree');
  const data = (first ^ 0x5412) >>> 10;
  assert.equal(data >>> 3, 0, 'level M');
  assert.equal(data & 7, mask, 'the format names the mask');
}

assert.equal(encodeQr('y'.repeat(214)), null, 'past version 10 at level M the encoder refuses');
const path = qrSvgPath(encodeQr('A'));
assert.match(path, /^(M\d+ \d+h\d+v1h-\d+z)+$/, 'one SVG path of row runs');
assert.ok(path.startsWith('M0 0h7v1h-7z'), 'the top-left finder is the first run');

console.log('qr: PASS — Vision-verified matrices (v1-v10), finders, timing, dark module, format information, SVG path');
