// (battle-spikes-253) A covered entry starts linking the player panel's top-down mask programs when its warm starts
// (tankThumbs.ts warmTopMaskPrograms): the coverage stand-ins compiled against the mask's own target in a light-less
// scene, the source's visibility, materials and the renderer's target restored, nothing drawn. On a loaded multiplayer
// guest the links outlasted the mask wait's 2 s stall when they began at the panel's stage (top_mask_program_timeout).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { initTopMaskRig, warmTopMaskPrograms } from './tankThumbs.ts';

const calls = [];
let current = null, fail = false;
const renderer = Object.assign(Object.create(THREE.WebGLRenderer.prototype), {
  getRenderTarget: () => current,
  getActiveCubeFace: () => 0,
  getActiveMipmapLevel: () => 0,
  setRenderTarget(target) { current = target; },
  compile(root, camera, scene) {
    const materials = [];
    root.traverse((o) => { if (o.isMesh) materials.push(o.material.name); });
    calls.push({ target: current, visible: root.visible, materials, ortho: camera.isOrthographicCamera, lights: scene.children.length });
    if (fail) throw new Error('compile failed');
    return new Set();
  },
});
assert.equal(warmTopMaskPrograms(new THREE.Group()), false, 'no rig: nothing to compile with');
initTopMaskRig({ renderer });

const paint = new THREE.MeshStandardMaterial({ name: 'paint' });
const root = new THREE.Group();
root.add(new THREE.Mesh(new THREE.BoxGeometry(), paint));
root.visible = false;
const previous = new THREE.WebGLRenderTarget(4, 4);
current = previous;
assert.equal(warmTopMaskPrograms(root), true);
assert.equal(calls.length, 1);
const [call] = calls;
assert.ok(call.target && call.target !== previous && call.target.width === 384, 'compiled against the mask target');
assert.equal(call.visible, true, 'a hidden source compiles as the mask clone draws (visible)');
assert.deepEqual(call.materials, ['cot:top-mask-coverage'], 'the coverage stand-ins, not the paint');
assert.ok(call.ortho && call.lights === 0, 'an orthographic camera over a light-less scene, as a mask pass');
assert.equal(current, previous, 'the renderer target restored');
assert.equal(root.visible, false, 'the source visibility restored');
assert.ok(root.children[0].material === paint, 'the source materials restored');
fail = true;
assert.equal(warmTopMaskPrograms(root), false, 'a failed compile leaves it to the panel stage');
assert.equal(current, previous);
assert.ok(root.children[0].material === paint);
assert.equal(warmTopMaskPrograms(null), false);

// the kicks: before the solo warm's camo wait (the panel follows it), and before the network warm's first stage
const solo = readFileSync(new URL('../game/soloBattleDeploymentRuntime.ts', import.meta.url), 'utf8');
assert.ok(solo.indexOf('options.kickPlayerPanel?.()') > 0 && solo.indexOf('options.kickPlayerPanel?.()') < solo.indexOf('await camoSweep;'));
const network = readFileSync(new URL('../mp/session/browserComposition.ts', import.meta.url), 'utf8');
const kick = network.indexOf('warm.playerPanelPrograms?.(view, active.viewerId)');
assert.ok(kick > 0 && network.slice(kick, kick + 700).includes('await warm.atmosphere?.('), 'the network warm kicks before atmosphere, terrain and wrecks');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /kickPlayerPanel: \(\) => \{[\s\S]{0,160}kickPanelMaskPrograms\(game\.player\?\.visual\?\.root\)/);
assert.match(main, /playerPanelPrograms: \(bridge: MultiplayerWarmView, viewerId: string\) => \{\s*kickPanelMaskPrograms\(bridge\.entities\.get\(viewerId\)\?\.visual\?\.root\);/);
console.log('topMaskEntryKick.selftest: the mask programs compiled ahead (stand-ins, the mask target, restored), kicked at both warms\' start');
