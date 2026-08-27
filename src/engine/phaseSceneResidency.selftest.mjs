import assert from 'node:assert/strict';
import { createPhaseSceneResidency } from './phaseSceneResidency.ts';

const scene = {
  children: [],
  add(...roots) {
    for (const root of roots) {
      root.removeFromParent();
      root.parent = this;
      this.children.push(root);
    }
  },
};
const root = (name) => ({
  name,
  parent: null,
  visible: true,
  removeFromParent() {
    if (this.parent?.children) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
    this.parent = null;
  },
});
const stage = root('stage');
const dressing = root('dressing');
scene.add(stage, dressing);

const residency = createPhaseSceneResidency({ scene, garageRoots: [stage, dressing] });
assert.equal(residency.stats.garageMounted, true);
residency.setGarageActive(false);
assert.deepEqual(scene.children, []);
assert.equal(stage.visible, false);
assert.equal(dressing.visible, false);

const firstWorld = root('verdant');
const secondWorld = root('desert');
scene.add(firstWorld);
residency.setWorldActive(firstWorld, false);
assert.equal(firstWorld.parent, null, 'dormant worlds leave the active scene graph');
residency.setWorldActive(firstWorld, true);
assert.equal(firstWorld.parent, scene);
residency.swapWorld(firstWorld, secondWorld);
assert.equal(firstWorld.parent, null);
assert.equal(firstWorld.visible, false);
assert.equal(secondWorld.parent, scene);
assert.equal(secondWorld.visible, true);

residency.setWorldActive(secondWorld, false);
residency.setGarageActive(true);
assert.deepEqual(scene.children, [stage, dressing]);
assert.equal(residency.stats.garageMounted, true);
assert.equal(residency.stats.worldMounted, false);

console.log('phaseSceneResidency.selftest: mutually exclusive scene roots detach and remount');
