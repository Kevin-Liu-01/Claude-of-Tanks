// The battle spike census's host side (tools/battle-spike-census.mjs; docs/PERF-SPIKES.md): the streamed trace's
// splitter returns every event whatever the chunk boundaries (strings with braces, escaped quotes and multi-byte text
// inside; the metadata's nested objects are not events), and the arguments' rules.
import assert from 'node:assert/strict';
import { createTraceSplitter, parseCensusArgs } from './battle-spike-census.mjs';

const events = [];
for (let i = 0; i < 400; i++) {
  events.push({ ph: 'X', name: i % 7 ? 'RunTask' : 'Fn "q" {x} [y] \\ ü 中', pid: 1, tid: 2, ts: i, dur: 150,
    args: { data: { url: `a{b}"c"${i}`, nested: { deep: [1, { two: '}' }] } } } });
}
const text = JSON.stringify({ traceEvents: events, metadata: { 'trace-config': '{"x":1}', nested: { a: { b: 1 } } } });
let seed = 7;
const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
for (let trial = 0; trial < 40; trial++) {
  const out = [];
  const splitter = createTraceSplitter((e) => { if (e.ph) out.push(e); });
  for (let at = 0; at < text.length;) { const n = 1 + Math.floor(rand() * (trial % 2 ? 9 : 400)); splitter.push(text.slice(at, at + n)); at += n; }
  assert.deepEqual(out, events, `trial ${trial}: every event, in order, whatever the chunks`);
}

const o = parseCensusArgs(['--scenarios=desert:ac130,urban:zone_control', '--sizes=7,21', '--driver=watch', '--trace=0', '--out=/tmp/x']);
assert.deepEqual(o.scenarios, ['desert:ac130', 'urban:zone_control']);
assert.deepEqual(o.sizes, [7, 21]);
assert.equal(o.driver, 'watch');
assert.equal(o.trace, false);
const ab = parseCensusArgs(['--roots=base=/tmp/a,lane=/tmp/b', '--port=6000']);
assert.deepEqual(ab.roots, [{ label: 'base', root: '/tmp/a', port: 6000 }, { label: 'lane', root: '/tmp/b', port: 6001 }], 'a value may carry its own =');
assert.equal(ab.governor, 'pinned', 'the governor is pinned by default');
assert.throws(() => parseCensusArgs(['--roots=a=/x,a=/y']), /one label/);
assert.throws(() => parseCensusArgs(['--sizes=22']), /field limit/);
assert.throws(() => parseCensusArgs(['--passes=warm,cold']), /cold/);
assert.throws(() => parseCensusArgs(['--driver=bot']), /driver/);
assert.throws(() => parseCensusArgs(['--scenarios=verdant']), /map/);
console.log('battle-spike-census.selftest: the streamed trace split into its events over 40 chunkings; the arguments\' rules PASS');
