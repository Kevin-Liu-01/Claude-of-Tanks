import assert from 'node:assert/strict';
import { Scene } from 'three';

import { createMatchModeWorldPresentation } from './matchModeWorldPresentation.ts';

const base = {
  label: 'Objective', perspectiveTeam: 'alpha', respawns: true, target: null,
  score: { alpha: 0, bravo: 0 }, flags: [], zones: [], ball: null, goals: [],
  horde: null, pickups: [], playerAmmo: null, playerAmmoCapacity: null,
};
const scene = new Scene();
const view = createMatchModeWorldPresentation(scene);
assert.equal(scene.children.includes(view.root), true);
assert.equal(view.root.children.length, 0, 'objective geometry is lazy');

view.update({ ...base, id: 'standard', label: 'Standard Battle', respawns: false }, 0);
assert.equal(view.root.visible, false);
assert.equal(view.root.children.length, 0, 'standard battle allocates no markers');

view.update({
  ...base,
  id: 'capture_the_flag',
  label: 'Capture the Flag',
  flags: [
    { team: 'alpha', baseX: 0, baseY: 0, baseZ: -100, x: 0, y: 2.5, z: -100,
      status: 'home', carrierId: null, returnAtS: null },
    { team: 'bravo', baseX: 0, baseY: 0, baseZ: 100, x: 0, y: 2.5, z: 100,
      status: 'home', carrierId: null, returnAtS: null },
  ],
}, 1);
assert.equal(view.root.visible, true);
assert.equal(view.root.children.filter((child) => child.name.endsWith('-flag')).length, 2);

view.update({
  ...base,
  id: 'turbo_ball',
  label: 'Turbo Ball',
  ball: { x: 0, y: 2.2, z: 0, vx: 0, vy: 0, vz: 0, lastTouchId: null },
  goals: [
    { team: 'alpha', x: 0, y: 0, z: -100 },
    { team: 'bravo', x: 0, y: 0, z: 100 },
  ],
}, 2);
assert.equal(view.root.getObjectByName('turbo-ball').visible, true);
assert.equal(view.root.getObjectByName('alpha-flag').visible, false);

view.update({
  ...base,
  id: 'endless_horde',
  label: 'Endless Horde',
  respawns: false,
  horde: { wave: 5, alive: 7, total: 7, nextWaveInS: 0, healChance: 0.4 },
  pickups: Array.from({ length: 14 }, (_, index) => ({
    id: `loot-${index}`, kind: index % 2 ? 'ammo' : 'heal', x: index, y: 3.2, z: index,
    active: true, spawnedWave: index + 1,
  })),
}, 3);
assert.equal(view.root.children.filter((child) =>
  child.name.startsWith('horde-pickup-') && child.visible).length, 12,
'presentation keeps a fixed loot-marker pool');

view.update(null, 4);
assert.equal(view.root.visible, false);
view.dispose();
assert.equal(scene.children.includes(view.root), false);

console.log('matchModeWorldPresentation.selftest: lazy markers, fixed pools, and lifecycle passed');
