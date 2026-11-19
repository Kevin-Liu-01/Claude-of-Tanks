// 274 (the owner, 2026-11-18: "our hitbox shading is wrong and needs to update on enemy tanks when we're scoped on them
// based on their actual penetrability relative to when we currently look at them! same way our reticle knows whether to
// turn red or green to indicate penetration"): the scoped armour paint and the reticle never disagree. For real vehicles,
// the target turned frontal, 30, 60 degrees and side on, the shooter moved, and the loaded shell switched, every panel the
// overlay judged carries the verdict the reticle (game/aimController.ts, its real update) gives when laid on that panel's
// centre from the same muzzle; and the colours turn with the angle and the shell, all three of them seen.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../vehicles/canvasFixture.test-support.mjs';

installCanvasFixture();
const { createArmorAimOverlay } = await import('./armorAimOverlay.ts');
const { createAimController } = await import('./aimController.ts');
const { penVerdict } = await import('../sim/penVerdict.ts');
const { createTank, ensureTankBuilder, battleStaticDrawMerge } = await import('../vehicles/fleetFactory.ts');
const { getSpec } = await import('../vehicles/specs.ts');
const { createTankState } = await import('../sim/movement.ts');

const COLORS = { pen: new THREE.Color(0x48d985), marginal: new THREE.Color(0xf0aa35), nopen: new THREE.Color(0xe53d35) };
const verdictOfRow = (table, at) => {
  if (table[at] < 0) return null;
  for (const [verdict, color] of Object.entries(COLORS)) {
    if (Math.abs(table[at] - color.r) + Math.abs(table[at + 1] - color.g) + Math.abs(table[at + 2] - color.b) < 1e-6) return verdict;
  }
  throw new Error(`a row colour that is no verdict's: ${[...table.slice(at, at + 3)]}`);
};
const frameOf = (group, out) => out.multiplyMatrices(group.matrixWorld,
  new THREE.Matrix4().makeScale(1 / (group.scale.x || 1), 1 / (group.scale.y || 1), 1 / (group.scale.z || 1)));

// the reticle: the real controller, its player a muzzle laid on a point (no world in the way, no sticky hold)
const shooter = {
  id: 'shooter', team: 'ally', isPlayer: true,
  state: { pos: new THREE.Vector3(), speed: 0, bloomF: 0, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 },
  combat: { destroyed: false, eraSpent: new Set(), shellSlot: 0, reload: { t: 0, totalS: 1 }, ammo: [] },
  spec: null,
  muzzle: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  visual: { gunMuzzleWorld(out) { out.copy(shooter.muzzle); }, gunDirWorld(out) { out.copy(shooter.dir); } },
};
const game = { player: shooter, tanks: [shooter] };
const rig = { aimPoint: new THREE.Vector3(), aimDist: 100, mode: 'SNIPER', zoom: 8 };
let clock = 0;
const reticle = createAimController({
  getGame: () => game, getRig: () => rig, worldRaycast: () => null, targetVisible: () => true,
  getShellCards: () => [], computeDispersion: () => 0, now: () => (clock += 10_000),
});
const frame = {
  singleReticle: false, point: new THREE.Vector3(), distM: 0, dispersionRadM: 0, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null,
};
function reticleVerdict(muzzle, point) {
  shooter.muzzle.copy(muzzle);
  shooter.dir.copy(point).sub(muzzle).normalize();
  rig.aimPoint.copy(point);
  rig.aimDist = muzzle.distanceTo(point);
  reticle.update(frame);
  return frame.gunTargetId ? penVerdict(frame.penRatio) : null;
}

const seen = { pen: 0, marginal: 0, nopen: 0 };
let compared = 0;
for (const id of ['t72b3', 'leo2a6']) {
  await ensureTankBuilder(id);
  const spec = getSpec(id);
  const visual = createTank(id, null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true,
    battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: battleStaticDrawMerge(id) });
  const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
  const target = { id: `${id}-target`, team: 'enemy', isPlayer: false, state, visual, spec,
    combat: { destroyed: false, eraSpent: new Set(), shellSlot: 0, reload: { t: 0, totalS: 1 } } };
  const pose = (yaw) => { state.yaw = yaw; visual.syncFromState(state, 1 / 30, 10); visual.root.updateMatrixWorld(true); };
  pose(0);
  shooter.spec = { ...spec, gun: { ...spec.gun } };
  game.tanks = [shooter, target];
  const overlay = createArmorAimOverlay();
  await overlay.bakePanels(target, async () => {});
  const entry = overlay.prime(target);
  const { panels, panelBase } = entry.template;
  assert.ok(panels.length > 100 && panels.length <= 1024, `${id}: every baked panel has a row (${panels.length})`);
  const shells = spec.gun.shells;
  const strongest = 0;
  const weakest = shells.reduce((best, shell, k) => ((shell.pen100Mm ?? 0) < (shells[best].pen100Mm ?? 0) ? k : best), 0);
  assert.notEqual(weakest, strongest, `${id} carries a weaker round to switch to`);

  let now = 0;
  const hullFrame = new THREE.Matrix4(), turretFrame = new THREE.Matrix4();
  /** Scope until the refresh is done; then each judged panel against the reticle laid on its centre. */
  function check(label, muzzle, slot) {
    const shellSpec = shells[slot];
    shooter.combat.shellSlot = slot;
    let frames = 0;
    do {
      overlay.update({ enabled: true, scoped: true, targets: [target], shellSpec, muzzle, nowMs: (now += 1000) });
      frames++;
    } while (entry.sampling && frames < 200);
    assert.ok(!entry.sampling, `${id} ${label}: the refresh finishes (${frames} frames)`);
    frameOf(entry.paint.hull, hullFrame);
    if (entry.paint.turret) frameOf(entry.paint.turret, turretFrame);
    const verdicts = [];
    let judged = 0;
    for (let index = 0; index < panels.length; index++) {
      const panel = panels[index];
      const verdict = verdictOfRow(entry.table, (panelBase + index) * 4 + 1);
      verdicts.push(verdict);
      if (!verdict) continue;
      judged++;
      seen[verdict]++;
      const centre = new THREE.Vector3(panel.x, panel.y, panel.z).applyMatrix4(panel.turret ? turretFrame : hullFrame);
      const aimed = reticleVerdict(muzzle, centre);
      compared++;
      assert.equal(verdict, aimed, `${id} ${label}: panel ${index} (zone ${panel.zone}) is painted ${verdict}; the reticle laid on its centre says ${aimed}`);
    }
    assert.ok(judged > 50, `${id} ${label}: the panels facing the muzzle are judged (${judged})`);
    return verdicts;
  }
  const far = (deg) => new THREE.Vector3(300 * Math.sin((deg * Math.PI) / 180), 2.2, 300 * Math.cos((deg * Math.PI) / 180));
  const front = check('frontal', far(0), strongest);
  pose((30 * Math.PI) / 180);
  const angled30 = check('turned 30 degrees', far(0), strongest);
  pose((60 * Math.PI) / 180);
  check('turned 60 degrees', far(0), strongest);
  pose(Math.PI / 2);
  const side = check('side on', far(0), strongest);
  pose(0);
  const shooterMoved = check('the shooter moved 30 degrees round', far(30), strongest);
  const again = check('frontal again', far(0), strongest);
  const weak = check(`the shell switched to ${shells[weakest].name}`, far(0), weakest);
  const changed = (a, b) => a.filter((v, k) => v && b[k] && v !== b[k]).length;
  assert.deepEqual(again, front, `${id}: back to the same view and shell, the same verdicts`);
  assert.ok(changed(front, side) > 10, `${id}: side on, panels turn colour (${changed(front, side)})`);
  assert.ok(changed(front, angled30) > 0, `${id}: turned 30 degrees, panels turn colour (${changed(front, angled30)})`);
  assert.ok(changed(front, shooterMoved) > 0, `${id}: the shooter moved, panels turn colour (${changed(front, shooterMoved)})`);
  assert.ok(changed(front, weak) > 10, `${id}: the weaker shell turns panels (${changed(front, weak)})`);
  overlay.dispose();
}
assert.ok(seen.pen > 0 && seen.marginal > 0 && seen.nopen > 0, `all three colours are painted (${JSON.stringify(seen)})`);
console.log(`armorLivePen.selftest: ${compared} panels painted with the reticle's own verdict at their centres (t72b3, leo2a6; frontal, 30, 60 degrees, side on, the shooter moved, the shell switched); colours turn with the angle and the shell, all three seen ${JSON.stringify(seen)}`);
