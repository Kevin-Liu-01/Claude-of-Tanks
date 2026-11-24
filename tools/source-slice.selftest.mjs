// source-slice.selftest.mjs (inherited-reds-276, 2026-11-23): a slice of a module's source closes over what it reads the
// way the module resolves it (tools/source-slice.test-support.mjs), and a name nothing declares fails before the slice
// runs, naming it. On main c7d111fad4 five receipts that sliced terrain.ts and props.ts by hand died mid-run on a
// ReferenceError (builtEnvironmentFor, withContacts, brickWalls, lookLedger) because the source had gained a dependency.
import assert from 'node:assert/strict';
import { SourceSliceMissingError, sourceSlice } from './source-slice.test-support.mjs';

const here = new URL('./source-slice.fixture.ts', import.meta.url); // never read: `text` stands in; imports resolve here
const module = (body) => `import { posix } from 'node:path';
import type { Unused } from 'node:path';
const SUFFIX: string = '!';
let calls = 0;
function helper(x: string): string { calls++; return posix.join(x, 'leaf'); }
${body}
export function build(cfg: { id: string }) {
  const tag = 'local:';
  const format = (v: string) => tag + v;
  const heavy = cfg.id.repeat(2);
  // slice start
  const out = format(cfg.id);
  // slice end
  return out + heavy;
}
`;

// 1. the closure: a sliced function reaches the module's import, its top-level helper and const, through the helper
{
  const slice = sourceSlice(here, { text: module('export function sliced(a: string) { return helper(a) + SUFFIX; }') });
  const sliced = slice.compile({}, `${slice.declaration('sliced')}\nreturn sliced;`);
  assert.equal(sliced('a'), 'a/leaf!', 'the import, the helper and the const come with the slice');
}

// 2. the source gains a dependency (the class of the c7d111fad4 reds): the same receipt keeps passing, unedited
{
  const grown = module(`import { sep as gained } from 'node:path';
export function sliced(a: string) { return helper(a) + gained + SUFFIX; }`);
  const slice = sourceSlice(here, { text: grown });
  assert.equal(slice.compile({}, `${slice.declaration('sliced')}\nreturn sliced;`)('a'), 'a/leaf/!',
    'a new import of the sliced source reaches the sandbox with no hand-kept list');
}

// 3. negative control: a name nothing declares fails before the slice runs, and the error names it
{
  const slice = sourceSlice(here, { text: module('export function sliced(a: string) { ran(); return helper(a) + undeclaredThing; }') });
  let ran = false;
  assert.throws(() => slice.compile({ ran: () => { ran = true; } }, `${slice.declaration('sliced')}\nreturn sliced('a');`),
    (error) => error instanceof SourceSliceMissingError && error.names.length === 1 && error.names[0] === 'undeclaredThing'
      && /undeclaredThing \(read by the fixture body\)/.test(error.message),
    'the missing identifier is named');
  assert.equal(ran, false, 'and nothing of the slice ran');
}

// 4. the fixture's own stubs win over the module's declarations and imports
{
  const slice = sourceSlice(here, { text: module('export function sliced(a: string) { return helper(a) + SUFFIX; }') });
  assert.equal(slice.compile({ helper: (x) => `stub(${x})` }, `${slice.declaration('sliced')}\nreturn sliced('a');`), 'stub(a)!',
    'a parameter shadows the module\'s helper');
  assert.equal(slice.compile({}, `const SUFFIX = '?';\n${slice.declaration('sliced')}\nreturn sliced('a');`), 'a/leaf?',
    'a declaration in the fixture body shadows the module\'s const');
}

// 5. a section of a function body: its inert enclosing locals come along; a local that runs code when declared, and a
//    parameter of the enclosing function, are the fixture's to give, and each missing one is named with its line
{
  const slice = sourceSlice(here, { text: module('') });
  const stretch = slice.section('  const out = format(cfg.id);', '  // slice end');
  assert.equal(slice.compile({ cfg: { id: 'x' } }, `${stretch}\nreturn out;`), 'local:x', 'format and tag (inert) are pulled');
  const heavy = slice.section('  const out = format(cfg.id);', '  // slice end').replace('format(cfg.id)', 'format(heavy + cfg.id)');
  assert.throws(() => slice.compile({}, `${heavy}\nreturn out;`), (error) => error instanceof SourceSliceMissingError
    && error.names.join() === 'heavy,cfg'
    && /heavy \(read by the fixture body, an enclosing local at tools\/source-slice\.fixture\.ts:\d+ that runs code when declared\)/.test(error.message)
    && /cfg \(read by the fixture body, a parameter of an enclosing function at /.test(error.message),
  'a running local and an enclosing parameter are named, not run');
  assert.equal(slice.compile({ cfg: { id: 'x' } }, `const heavy = 'h';\n${slice.LOCALS}\n${heavy}\nreturn out;`), 'local:hx',
    'the fixture declares the running local; the inert ones still come, at LOCALS');
}

// 6. a global the source reads only behind `typeof` is optional (document in Node); an unguarded unknown global is not
{
  const slice = sourceSlice(here, { text: module(`export function title() { return typeof someBrowserGlobal !== 'undefined' ? someBrowserGlobal.title : 'none'; }`) });
  assert.equal(slice.compile({}, `${slice.declaration('title')}\nreturn title();`), 'none', 'a typeof-guarded global may be absent');
}

console.log('source-slice.selftest: closure over imports, declarations and inert locals; a gained dependency passes; a missing name fails first, named (negative control) PASS');
