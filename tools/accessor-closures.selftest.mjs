// webcontent-diet-278: no accessor a page defines with Object.defineProperty / defineProperties is a closure made at the
// call, except on the page's lifetime singletons listed below.
//
// V8 keeps an accessor's getter and setter in the hidden class's descriptor array, and descriptor arrays are shared along
// a transition tree with every object of the same shape, long-lived ones included. A getter closure made inside a world's
// build kept the build's whole scope alive after the world was released: props.ts PROP_TYPE_REGISTRY.wallstone (a record
// the per-build wall types are spread from) -> its map's descriptors -> the wall kit's contactBand getter -> the props
// build's scope -> the props group -> world-verdant, 73.5 MB of geometry through the next battle on a phone (the heap
// snapshot's retainer path; tools/battle-retention-probe.mjs). An accessor's functions are module-level: one shared
// descriptor (structureDamageSeam.ts DEFERRED_INTACT), or the build latch (world/maps/buildLatch.ts latchBuiltValues),
// with the per-build values in a WeakMap keyed by the object.
//
//   node tools/accessor-closures.selftest.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The page-lifetime singletons whose accessors may close over their call's scope: `file` and the property they define.
 * A row that no longer matches a definition fails (the list stays exact).
 */
export const ACCESSOR_CLOSURE_ALLOWED = Object.freeze([
  { file: 'src/main.ts', property: '__APP_LIFECYCLE', why: 'window, once a page' },
  { file: 'src/main.ts', property: '__AUTOMATION_PATH', why: 'window, once a page' },
  { file: 'src/main.ts', property: '__TUTORIAL', why: 'window, once a page' },
  { file: 'src/engine/lighting.ts', property: 'contactSeamM', why: 'the light rig, one a renderer for the page' },
  { file: 'src/ui/playMenu.ts', property: 'value', why: 'the Play menu, built once a page (playSurfaceRuntime ensureMenu)' },
  { file: 'src/ui/playMenu.ts', property: 'disabled', why: 'the Play menu, built once a page (playSurfaceRuntime ensureMenu)' },
  { file: 'src/engine/batchedColorAlias.ts', property: 'colorTexture', why: 'three\'s BatchedMesh prototype, once a page; reads only this' },
  { file: 'src/world/maps/inhabitKit.ts', property: 'hw', why: 'DESTRUCTIBLE_TYPES, built once at module load over module-level receipts' },
  { file: 'src/world/maps/inhabitKit.ts', property: 'hl', why: 'DESTRUCTIBLE_TYPES, built once at module load over module-level receipts' },
  { file: 'src/world/maps/inhabitKit.ts', property: 'contactBand', why: 'DESTRUCTIBLE_TYPES, built once at module load over module-level receipts' },
  { file: 'src/world/maps/inhabitKit.ts', property: 'bodyHull', why: 'DESTRUCTIBLE_TYPES, built once at module load over module-level receipts' },
]);

/** The text of each Object.defineProperty / defineProperties call in `source`, with its line. */
export function definePropertyCalls(source) {
  const calls = [];
  const pattern = /Object\.definePropert(?:y|ies)\s*\(/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let depth = 0, end = match.index + match[0].length - 1;
    for (; end < source.length; end++) {
      const c = source[end];
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) break; }
    }
    calls.push({ text: source.slice(match.index, end + 1), line: source.slice(0, match.index).split('\n').length });
  }
  return calls;
}

/** Whether a call's descriptor makes an accessor closure there: `get:` / `set:` an arrow or function, or `get(` / `set(`. */
export function makesAccessorClosure(callText) {
  return /\b(?:get|set)\s*:\s*(?:\(|function\b|async\b|[A-Za-z_$][\w$]*\s*=>)/.test(callText)
    || /[{,]\s*(?:get|set)\s*\(/.test(callText);
}

/** The property a call defines (its second argument as a string literal, or the keys of a defineProperties map). */
export function definedProperties(callText) {
  const single = /^Object\.defineProperty\s*\([^,]+,\s*['"]([^'"]+)['"]/.exec(callText);
  if (single) return [single[1]];
  return [...callText.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*:\s*\{/g)].map((m) => m[1]);
}

function sourcesUnder(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(ROOT, path)).isDirectory()) sourcesUnder(path, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** Every accessor closure the page's sources define: [{ file, line, properties, allowed }]. */
export function accessorClosures(files = sourcesUnder('src'), read = (file) => readFileSync(join(ROOT, file), 'utf8')) {
  const found = [];
  for (const file of files) {
    const source = read(file);
    if (!source.includes('definePropert')) continue;
    for (const call of definePropertyCalls(source)) {
      if (!makesAccessorClosure(call.text)) continue;
      const properties = definedProperties(call.text);
      const allowed = properties.length > 0 && properties.every((property) =>
        ACCESSOR_CLOSURE_ALLOWED.some((row) => row.file === file && row.property === property));
      found.push({ file, line: call.line, properties, allowed });
    }
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // the detector on known shapes
  assert.equal(makesAccessorClosure("Object.defineProperty(entry, 'contactBand', { enumerable: true, get: () => band })"), true);
  assert.equal(makesAccessorClosure("Object.defineProperties(e, { a: { get: function () { return 1; } } })"), true);
  assert.equal(makesAccessorClosure("Object.defineProperty(o, 'x', { get() { return job.x; }, set(v) { job.x = v; } })"), true);
  assert.equal(makesAccessorClosure("Object.defineProperty(o, 'x', { get: x => x })"), true);
  assert.equal(makesAccessorClosure("Object.defineProperty(anatomy, 'intact', DEFERRED_INTACT)"), false, 'a module-level descriptor');
  assert.equal(makesAccessorClosure("Object.defineProperty(entry, f, { enumerable: true, get: latchGetter(f, strict) })"), false,
    'a shared getter the latch hands out');
  assert.equal(makesAccessorClosure("Object.defineProperty(o, 'v', { value: () => 1, writable: true })"), false, 'a data property');
  assert.deepEqual(definedProperties("Object.defineProperty(window, '__X', { get: () => 1 })"), ['__X']);
  assert.deepEqual(definedProperties('Object.defineProperties(e, { contactBand: { get: () => a }, colliderBand: { get: () => b } })'),
    ['contactBand', 'colliderBand']);
  // a fixture tree: a build's closure is found, a singleton's on the list is allowed
  const fixture = {
    'src/world/maps/kit.ts': "const e = { ...legacy };\nObject.defineProperty(e, 'contactBand', { enumerable: true, get: () => builtValue(band) });",
    'src/main.ts': "Object.defineProperty(window, '__APP_LIFECYCLE', { configurable: true, get: () => snap() });",
    'src/world/ok.ts': "Object.defineProperty(anatomy, 'intact', DEFERRED_INTACT);",
  };
  const fixtureFound = accessorClosures(Object.keys(fixture), (file) => fixture[file]);
  assert.deepEqual(fixtureFound.map((row) => [row.file, row.line, row.allowed]), [['src/world/maps/kit.ts', 2, false], ['src/main.ts', 1, true]]);

  // the page's sources
  const found = accessorClosures();
  const refused = found.filter((row) => !row.allowed);
  assert.deepEqual(refused.map((row) => `${row.file}:${row.line} ${row.properties.join(',')}`), [],
    'an accessor closure made at its definition: give it a module-level descriptor over a WeakMap (structureDamageSeam.ts '
    + 'DEFERRED_INTACT) or the build latch (world/maps/buildLatch.ts latchBuiltValues); a page-lifetime singleton goes on '
    + 'ACCESSOR_CLOSURE_ALLOWED with its reason');
  for (const row of ACCESSOR_CLOSURE_ALLOWED) {
    assert.ok(found.some((hit) => hit.file === row.file && hit.properties.includes(row.property)),
      `ACCESSOR_CLOSURE_ALLOWED: ${row.file} ${row.property} no longer defines an accessor closure; drop its row`);
  }
  console.log(`accessor-closures: ${found.length} accessor closures in src, all on the ${ACCESSOR_CLOSURE_ALLOWED.length} listed singletons`);
}
