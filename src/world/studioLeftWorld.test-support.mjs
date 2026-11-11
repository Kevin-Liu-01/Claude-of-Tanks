// studioLeftWorld.test-support.mjs — (round 3 A7/M4) a battlefield the Studio planned crushes on and never gave back:
// its teardown threw before releaseCrushes (studio.ts tearDownStudio), so studioCrush.restore never ran. The page
// world's seams over real felled trees (felledTrees.ts) and the real Studio crush applier (studioCrush.ts); the seams
// are map.ts's and vegetation.ts's, pinned in felledTreeOwners.selftest.mjs case 4 (the frame's update advances the
// falls as 'frame', the Studio's steps as 'timeline', setFallDriver reaches felledTrees.setDriver). The sweeps are a flag
// here; the same case pins the real seam (map.ts -> props.ts -> propCrushPresentation.ts setSweeps, its one flag).
// For the battle edges' selftests: a battle that starts on this world must see its own felled trees fall.
import * as THREE from 'three';
import { createFelledTrees } from './felledTrees.ts';
import { setCircleShape } from './collision.ts';
import { createStudioCrushes } from '../game/studioCrush.ts';

const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0), maxY: 0, minY: 0 };
const pose = (matrix) => matrix.elements.map((value) => value.toFixed(9)).join();

/**
 * A world the Studio left on its timeline with its sweeps off. `extra` joins the world's own fields (a mapId, a
 * battle start's other ports). `fallsWithUpdate()` is the battle's question: its hull fells the tree, does one frame's
 * update move the fall?
 */
export function createStudioLeftWorld(extra = {}) {
  const tree = { x: 10, z: -4, mat: new THREE.Matrix4().makeTranslation(10, 0, -4), fallH: 8, fallR: 0.3 };
  const record = setCircleShape({ min: [9.7, 0, -4.3], max: [10.3, 8, -3.7], crushable: true, treeIdx: 0, kind: 'tree' }, 10, -4, 0.3);
  const felled = createFelledTrees({ trees: [tree], records: [record], concealers: [], heightField: flat,
    write() {}, poseChanged() {}, standingChanged() {} });
  const world = {
    sweeps: true,
    update: (dt) => felled.advance(dt, 'frame'),
    advanceToppledVegetation: (dt) => felled.advance(dt, 'timeline'),
    advanceDestruction: (dt) => felled.advance(dt, 'timeline'),
    crushObstacle: (ob, dx, dz) => felled.fell(ob, dx, dz),
    crushProp: () => false,
    resetDestructibles: () => felled.restoreAll(),
    setCrushSweeps(on) { world.sweeps = on; },
    setFallDriver: (driver) => felled.setDriver(driver),
    ...extra,
  };
  // studio.ts syncCrushPlan: the sweeps off, the plan (the timeline takes the falls); playback fells the tree
  world.setCrushSweeps(false);
  const crushes = createStudioCrushes();
  crushes.setPlan(world, [{ tMs: 0, record, crushable: -1, dirX: 1, dirZ: 0, speedMps: 8 }]);
  crushes.advanceTo(world, 0);
  world.advanceToppledVegetation(0.25);
  // ...and the teardown threw before releaseCrushes: no crushes.restore(world)
  return {
    world, felled, tree,
    /** A battle's hull fells the standing tree; true when one update of the world moves its fall. */
    fallsWithUpdate() {
      if (tree.crushed) return false; // the battle start stood it up again, or nothing did
      const upright = pose(tree.mat);
      world.crushObstacle(record, 1, 0);
      world.update(1 / 60);
      return pose(tree.mat) !== upright;
    },
  };
}
