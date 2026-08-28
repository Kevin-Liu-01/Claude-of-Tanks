import assert from 'node:assert/strict';
import { isKillcamGhostSurface } from './killcamGhostPolicy.ts';

const mesh = (material, userData = {}) => ({ isMesh: true, material, userData });

assert.equal(isKillcamGhostSurface(mesh({ colorWrite: true })), true,
  'painted vehicle geometry receives the x-ray skin');
assert.equal(isKillcamGhostSurface(mesh({ colorWrite: false })), false,
  'shadow-only geometry never becomes visible in x-ray');
assert.equal(isKillcamGhostSurface(mesh({ colorWrite: true }, { authoredShadowProxy: true })), false,
  'authored shadow proxies stay excluded even if their material changes');
assert.equal(isKillcamGhostSurface(mesh([
  { colorWrite: false },
  { colorWrite: true },
])), true, 'a multi-material mesh is ghosted when any group paints color');
assert.equal(isKillcamGhostSurface(mesh({ visible: false, colorWrite: true })), false,
  'material-hidden helper geometry stays hidden');
assert.equal(isKillcamGhostSurface(mesh({ transparent: true, opacity: 0, colorWrite: true })), false,
  'fully transparent helper geometry stays hidden');
assert.equal(isKillcamGhostSurface({ isMesh: false }), false,
  'non-mesh scene nodes are ignored');

console.log('killcam ghost policy selftest passed');
