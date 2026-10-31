// (local-fps-266) The shadow hooks read window.__SHADOW_DEBUG on every caster's draw (lighting.ts guardDoubleSidedDepth,
// shadowCasterProxies.ts's cull switch): thousands of reads a frame. In a browser a name the window does not carry goes on
// to its named-element lookup at every read; lighting.ts holds the name as an own property (undefined) from its load, so a
// read is a plain load. Held here:
// - after lighting.ts loads under a window, __SHADOW_DEBUG is the window's own property, undefined;
// - a probe's switches set before the load are kept;
// - the hooks still read switches a probe sets after the load (legacyBias turns the double-sided guard off and back on).
import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.window = {};
const { guardDoubleSidedDepth } = await import('./lighting.ts');
assert.ok(Object.hasOwn(globalThis.window, '__SHADOW_DEBUG'), 'lighting.ts holds __SHADOW_DEBUG as the window\'s own property');
assert.equal(globalThis.window.__SHADOW_DEBUG, undefined, 'holding no switches');

const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
guardDoubleSidedDepth(depth);
assert.equal(depth.polygonOffset, true, 'a double-sided caster\'s depth draw takes the caster-side offset');
globalThis.window.__SHADOW_DEBUG = { legacyBias: true };
guardDoubleSidedDepth(depth);
assert.equal(depth.polygonOffset, false, 'a probe\'s legacyBias set after the load reaches the hook');
globalThis.window.__SHADOW_DEBUG = undefined;
guardDoubleSidedDepth(depth);
assert.equal(depth.polygonOffset, true, 'and its removal');

// a probe that set its switches before the game loaded keeps them (a second instance of the module, loaded under them)
const switches = { noCull: true };
globalThis.window = { __SHADOW_DEBUG: switches };
await import('./lighting.ts?probe-set-first');
assert.equal(globalThis.window.__SHADOW_DEBUG, switches, 'switches set before the load are kept');

console.log('shadowDebugGlobal selftest passed: __SHADOW_DEBUG is the window\'s own property from lighting.ts\'s load; '
  + 'switches set before it are kept and switches set after it reach the shadow hooks');
process.exit(0);
