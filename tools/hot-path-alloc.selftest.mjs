// hot-path-alloc.selftest.mjs — the receipt that keeps marked hot paths allocation-free (2026-10-24, lockdown-251).
//
// Two halves: the scanner's own rules on fixtures (each allocating construct is caught, an alloc-ok line and a
// destructuring pattern are not, a mark that is not above a function is an error), then the live scan: every function
// under src/ marked `// hot-path:` must be clean. A GC spike starts as one innocent `[a, b]` in a frame loop.
import assert from 'node:assert/strict';
import { scanHotPaths, scanSource } from './hot-path-alloc.mjs';

const one = (body, before = '') => {
  const results = scanSource('fixture.ts', `${before}\n// hot-path: fixture\nconst frame = (dt: number): void => {\n${body}\n};\n`);
  assert.equal(results.length, 1);
  assert.ok(results[0].found, 'the mark finds its function');
  return results[0].allocations.map((a) => a.kind);
};

// clean bodies stay clean
assert.deepEqual(one(`  scratch.set(dt, 0, 0);\n  for (let i = 0; i < n; i++) total += values[i];\n  const { x, y } = pose;\n  [a, b] = [b, a]; // alloc-ok: fixture swap`), []);
assert.deepEqual(one(`  if (!ready) return;\n  target.copy(source).multiplyScalar(dt);\n  el.textContent === label || (el.textContent = label);`), []);
// every allocating construct
assert.deepEqual(one('  const v = new Vector3();'), ['new Vector3']);
assert.deepEqual(one('  const list = [a, b];'), ['array literal']);
assert.deepEqual(one('  send({ dt });'), ['object literal']);
assert.deepEqual(one('  items.forEach((item) => item.tick(dt));'), ['closure']);
assert.deepEqual(one('  call(...args);'), ['spread']);
assert.deepEqual(one('  el.style.transform = `translate(${x}px)`;'), ['template string']);
assert.deepEqual(one('  const live = tanks.filter(alive);'), ['.filter()']);
assert.deepEqual(one('  label.textContent = speed.toFixed(1);'), ['.toFixed()']);
assert.deepEqual(one('  for (const [k, v] of Object.entries(map)) use(k, v);'), ['Object.entries']);
assert.deepEqual(one('  const copy = JSON.parse(text);'), ['JSON.parse']);
assert.deepEqual(one('  const p = pose.clone();'), ['.clone()']);
assert.deepEqual(one('  const a = Array.from(set);'), ['Array.from']);
// an alloc-ok on its line passes; a reason is required
assert.deepEqual(one('  if (miss) cache.set(key, new Entry()); // alloc-ok: a cache miss, once per key'), []);
assert.deepEqual(one('  if (miss) cache.set(key, new Entry()); // alloc-ok:'), ['new Entry']);
// the forms a mark may sit on
for (const source of [
  '// hot-path: a\nfunction tick(dt: number): void { use([dt]); }\n',
  '// hot-path: a\nexport function tick(dt: number): void { use([dt]); }\n',
  'class A {\n  // hot-path: a\n  tick(dt: number): void { use([dt]); }\n}\n',
  'const api = {\n  // hot-path: a\n  tick(dt: number): void { use([dt]); },\n};\n',
  'const api = {\n  // hot-path: a\n  tick: (dt: number): void => { use([dt]); },\n};\n',
  '// hot-path: a\n/** docs */\nconst tick = function (dt: number): void { use([dt]); };\n',
]) {
  const [result] = scanSource('fixture.ts', source);
  assert.ok(result?.found, `the mark finds its function: ${source.split('\n')[1]}`);
  assert.deepEqual(result.allocations.map((a) => a.kind), ['array literal'], `and scans its body: ${source.split('\n')[1]}`);
}
// a mark with code between it and its function, or above none, is an error
assert.equal(scanSource('fixture.ts', '// hot-path: a\nconst n = 1;\nconst tick = () => {};\n')[0].found, false);
assert.equal(scanSource('fixture.ts', '// hot-path: a\n')[0].found, false);

// the live scan: every marked hot path in src/ is allocation-free
const live = scanHotPaths();
const failing = live.filter((r) => !r.found || r.allocations.length);
assert.deepEqual(failing.map((r) => `${r.file}:${r.line} ${r.name}: ${r.found ? r.allocations.map((a) => `${a.line} ${a.kind}`).join(', ') : 'mark above no function'}`), [],
  'a marked hot path allocates (fix it, or mark the line `// alloc-ok: <reason>`)');
console.log(`hot-path-alloc.selftest: the scanner's rules on fixtures, ${live.length} marked hot paths in src/ allocation-free PASS`);
