import assert from 'node:assert/strict';
import { Vector3, Raycaster, Mesh, MeshBasicMaterial, DoubleSide, BufferGeometry, Float32BufferAttribute } from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';
import { launcherMuzzleIndex, usesLauncherMuzzles } from '../sim/launcherPolicy.ts';
import { createTankState, SIM_DT } from '../sim/movement.ts';
import { createCombatState } from '../sim/damage.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';

const ids = PRODUCTION_TANK_IDS.filter(id => {
  const gun = getSpec(id).gun;
  return gun.fixedLaunchCanisters || gun.shells.some(round => round.guided);
});
const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
let external = 0, throughGun = 0, launches = 0, stockProbes = 0;
const ray = new Raycaster();
const point = new Vector3(), direction = new Vector3();
const probeMaterial = new MeshBasicMaterial({ side: DoubleSide });

// Independently probe the real drawn terminal, not a bounding box or the
// declarative anchor itself. Open bores are sampled around their rim; sealed
// canisters at their cap. A misplaced origin must not pass merely by existing.
function terminalContact(tank, stock, index, label) {
  tank.gunMuzzleWorld(point, index, true);
  tank.gunDirWorld(direction, index, true);
  const right = new Vector3(0, 1, 0).cross(direction).normalize();
  const up = direction.clone().cross(right).normalize();
  for (const radius of [0, .025, .045, .065, .085, .105, .125, .155, .175]) {
    for (let spoke = 0; spoke < 8; spoke++) {
      const angle = spoke * Math.PI / 4;
      const origin = point.clone().addScaledVector(right, radius * Math.cos(angle))
        .addScaledVector(up, radius * Math.sin(angle)).addScaledVector(direction, .025);
      ray.set(origin, direction.clone().negate()); ray.near = 0; ray.far = .055;
      const hit = ray.intersectObjects(stock, false)[0];
      if (hit) { stockProbes++; return; }
    }
  }
  assert.fail(`${label}: launch exit has no drawn tube terminal within 30 mm of its plane`);
}

for (const id of ids) {
  const source = getSpec(id);
  const rounds = source.gun.shells.filter(round => round.guided || source.gun.fixedLaunchCanisters);
  for (const round of rounds) {
    if (round.launcherTubes === 0) {
      throughGun++;
      assert.equal(usesLauncherMuzzles(source.gun, round), false, `${id}: gun-launched round stays on cannon`);
    } else {
      external++;
      const used = new Set(); let cursor = 0;
      for (let i = 0; i < round.launcherTubes; i++) {
        const index = launcherMuzzleIndex(source.gun, round, cursor);
        assert(index >= 0, `${id}/${round.name}: external launcher cannot fall back to the gun`);
        assert(!used.has(index), `${id}/${round.name}: every physical tube is selected before repeating`);
        used.add(index); cursor = index + 1;
      }
      assert.equal(launcherMuzzleIndex(source.gun, round, cursor), [...used][0], `${id}: wraps its own weapon bank`);
    }
  }
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242, decor: false, batchStatic: false });
    const stock = [];
    try {
      tank.root.updateMatrixWorld(true);
      // These receipts contain precisely the native launcher stock; a nearby
      // turret wall, cannon or sight cannot falsely certify a launch exit.
      for (const part of tank.root.userData.weaponGeometryParts ?? []) {
        const owner = tank.root.getObjectByName(part.bucket);
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(part.positions.flat(), 3)).setIndex(part.indices);
        const mesh = new Mesh(geometry, probeMaterial);
        mesh.matrixAutoUpdate = false; mesh.matrixWorld.copy(owner.matrixWorld); stock.push(mesh);
      }
      for (let index = 0; index < (source.gun.launcherMuzzles?.length ?? 0); index++) {
        const tip = source.gun.launcherMuzzles[index];
        const anchor = tank.root.getObjectByName(`rig_launcher_tip_${index}`);
        assert(anchor, `${id}: anchor survives donor cleanup`);
        assert.equal(anchor.parent.name, tip.frame === 'turret' ? 'rig_turret' : 'rig_gun', `${id}: correct native owner`);
        terminalContact(tank, stock, index, `${id}/${quality}/${index}`);
        if (index === 0) {
          anchor.position.y += 5; tank.root.updateMatrixWorld(true);
          try { assert.throws(() => terminalContact(tank, stock, index, id), assert.AssertionError,
            'moving a firing anchor off its native launcher fails the gate'); }
          finally { anchor.position.y -= 5; tank.root.updateMatrixWorld(true); }
        }
      }
      // Fire each actual weapon from changing hull/turret poses. Authority and
      // the rendered tube must agree even when the cannon is elevated away
      // from a fixed roof pod. Gun-fired exceptions use their ordinary barrel.
      for (const round of rounds) {
        const slot = source.gun.shells.indexOf(round);
        const count = round.launcherTubes || 1;
        const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 9, countdownS: 0,
          worldCollision: { mapId: 'verdant', heightField: flat, obstacles: [] },
          players: [{ id: 'launcher', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
            { id: 'opponent', specId: 'm1a2', team: 'bravo', spawn: { x: 400, z: -400, yaw: 0 } }] });
        const entity = match.entities[0]; entity.spec = structuredClone(source);
        entity.spec.gun.baseAccuracy = 0;
        entity.state = createTankState(entity.spec, new Vector3(3, 0, 7), .35);
        entity.combat = createCombatState(entity.spec);
        match.onMatchReady();
        for (let shot = 0; shot < count; shot++) {
          const yaw = [-.8, 0, 1.3][shot % 3], pitch = shot % 2 ? .13 : -.05;
          entity.state.turretYaw = yaw; entity.state.gunPitch = pitch;
          for (const reload of entity.combat.reloadChannels) { reload.t = 0; }
          if (entity.combat.magazine) entity.combat.magazine.rounds = entity.spec.gun.autoloader.magazineSize;
          match.step({ dt: SIM_DT, inputs: new Map([['launcher', { throttle: 0, steer: 0, brake: true,
            fire: true, shellSlot: slot, aimYaw: yaw + entity.state.yaw, aimPitch: pitch,
            aimPoint: new Vector3(200, 25, 400), actionBits: 0 }]]) });
          const event = match.snapshot({ tick: shot + 1, serverTimeMs: 0, viewerId: 'launcher' }).events.find(e => e.type === 'shell_fired');
          assert(event, `${id}/${round.name}: actual authority fires shot ${shot}`);
          tank.syncFromState(entity.state, 1); tank.root.updateMatrixWorld(true);
          const launcher = round.launcherTubes !== 0;
          tank.gunMuzzleWorld(point, event.muzzleIndex >= 0 ? event.muzzleIndex : undefined, launcher);
          // Cannon mouths can have a measured cosmetic lip offset. Launcher
          // anchors have no such tolerance: their world pose is the spec pose.
          if (launcher) {
            assert(point.distanceTo(new Vector3(event.x, event.y, event.z)) < 1e-7,
              `${id}/${quality}/${round.name}: authority and native tube launch origin agree`);
            tank.gunDirWorld(direction, event.muzzleIndex, true);
            assert(direction.dot(new Vector3(event.dx, event.dy, event.dz)) > .99999,
              `${id}: launch direction follows the tube rather than the cannon`);
            const tip = source.gun.launcherMuzzles[event.muzzleIndex];
            assert(!tip.shellSlots || tip.shellSlots.includes(slot), `${id}: uses the selected weapon's bank`);
          }
          launches++;
          match.afterSnapshotBroadcast();
        }
      }
    } finally { for (const mesh of stock) mesh.geometry.dispose(); tank.dispose(); }
  }
}
assert.equal(ids.length, 35, 'review every missile/rocket vehicle when the roster changes');
assert.equal(throughGun, 7, 'gun-launched exceptions remain explicit');
assert(external >= 25 && stockProbes >= 100 && launches >= 200);
probeMaterial.dispose();
console.log(JSON.stringify({ vehicles: ids.length, externalRounds: external, gunLaunchedRounds: throughGun, launches, stockProbes }));
