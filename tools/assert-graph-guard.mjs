// The runtime half of the Object3D-assert policy (tools/object3d-assert-lint.mjs). The self-test runner preloads this
// module into every child (selftestChildEnv, `--import`). A node:assert equality call whose operand is a three.js graph
// object (an Object3D, geometry, attribute, material or texture, a raycast hit on one, or an array of either) is decided
// here and fails with identity labels; node's own AssertionError would inspect both graphs at depth 1000 and diff the
// dumps (the 226 T-72 receipts reached 40 GB). The lint stops these calls in source; this covers every shape the lint
// cannot see (raycast hits, helpers from other modules, destructured asserts). Passing calls and calls on plain values
// are unchanged. A loose deepEqual on a graph operand is decided strictly, so it can only fail a call node would pass;
// a loose notDeepEqual whose operands differ strictly is handed to node, which then decides values that differ only
// loosely (`[mesh, 1]` against `[mesh, '1']`) exactly as before.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert';
import { syncBuiltinESMExports } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const GRAPH_FLAGS = ['isObject3D', 'isBufferGeometry', 'isBufferAttribute', 'isInterleavedBufferAttribute', 'isMaterial', 'isTexture'];
const isGraph = (value) => value !== null && typeof value === 'object' && GRAPH_FLAGS.some((flag) => value[flag] === true);
const isHit = (value) => value !== null && typeof value === 'object' && isGraph(value.object) && 'distance' in value;
const heavy = (value) => isGraph(value) || isHit(value) || (Array.isArray(value) && value.some((item) => isGraph(item) || isHit(item)));

export function graphLabel(value) {
  if (Array.isArray(value)) return `[${value.slice(0, 8).map(graphLabel).join(', ')}${value.length > 8 ? `, …${value.length - 8} more` : ''}]`;
  if (isHit(value)) return `hit ${graphLabel(value.object)} at ${Number(value.distance).toFixed(3)} m`;
  if (isGraph(value)) return `${value.type ?? value.constructor?.name ?? 'object'}${value.name ? ` "${value.name}"` : ''} #${value.id ?? value.uuid ?? '?'}`;
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

// [method, the passing condition]: node's semantics for each method, decided without building a message.
const METHODS = [
  ['equal', (a, b) => a == b || (a !== a && b !== b)], // eslint-disable-line eqeqeq
  ['notEqual', (a, b) => !(a == b || (a !== a && b !== b))], // eslint-disable-line eqeqeq
  ['strictEqual', Object.is], ['notStrictEqual', (a, b) => !Object.is(a, b)],
  ['deepEqual', isDeepStrictEqual], ['notDeepEqual', (a, b) => !isDeepStrictEqual(a, b)],
  ['deepStrictEqual', isDeepStrictEqual], ['notDeepStrictEqual', (a, b) => !isDeepStrictEqual(a, b)],
];

function guard(target, strict) {
  for (const [name, passes] of METHODS) {
    const original = target[name];
    if (typeof original !== 'function' || original.graphGuarded) continue;
    // In assert/strict, equal and deepEqual are the strict forms.
    const decide = strict && name === 'equal' ? Object.is : strict && name === 'notEqual' ? (a, b) => !Object.is(a, b)
      : strict && name === 'deepEqual' ? isDeepStrictEqual : strict && name === 'notDeepEqual' ? (a, b) => !isDeepStrictEqual(a, b) : passes;
    const guarded = function (actual, expected, message) {
      if (!heavy(actual) && !heavy(expected)) return Reflect.apply(original, this, arguments);
      if (!strict && name === 'notDeepEqual' && !isDeepStrictEqual(actual, expected)) return Reflect.apply(original, this, arguments);
      if (decide(actual, expected)) return;
      if (message instanceof Error) throw message;
      throw new assert.AssertionError({ message: `${message ? `${message}\n` : ''}assert.${name} on a three.js graph `
        + `object (decided by tools/assert-graph-guard.mjs): actual ${graphLabel(actual)}, expected ${graphLabel(expected)}`,
      operator: name, stackStartFn: guarded });
    };
    guarded.graphGuarded = true;
    target[name] = guarded;
  }
}

guard(assert, false);
guard(assert.strict, true);
syncBuiltinESMExports();
