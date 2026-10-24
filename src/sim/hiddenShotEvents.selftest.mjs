// Hidden shooters and shell_hit (security audit 2026-10-22; AGENTS.md: never send a hidden enemy's coordinates and
// rely on rendering). A hit reaches the struck team whole except for what places the shooter: the shell's path
// length and the exact incoming direction are withheld from a viewer whose team does not
// see the shooter, and localDir becomes the horizontal bearing snapped to a 45 degree sector (the hit arc). The
// shooter's team and a spectator read the event whole.
import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.ts';

const world = { mapId: 'verdant', getObstacles: () => [], queryObstacles: (_a, _b, _c, _d, out) => { out.length = 0; return out; }, raycast: () => null };
const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, worldCollision: world, players: [
  // 520 m apart: beyond the maximum spot range, so bravo never sees the shooter
  { id: 'shooter', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 200, z: -50, yaw: 0 } },
  { id: 'target', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 470, yaw: Math.PI } },
  { id: 'mate', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: -300, z: 670, yaw: Math.PI } },
] });
match.onMatchReady();
const aimYaw = Math.atan2(0 - 200, 470 + 50);
const fire = new Map([['shooter', { throttle: 0, steer: 0, brake: false, fire: true, aimYaw, aimPitch: 0, shellSlot: 0, actionBits: 0 }]]);
const seen = { target: 0, mate: 0, shooter: 0, spectator: 0 };
for (let tick = 1; tick <= 900 && seen.target < 2; tick++) {
  match.step({ dt: 1 / 60, inputs: fire });
  if (match.pendingEventCount === 0) continue;
  for (const viewerId of ['target', 'mate']) {
    for (const hit of match.eventsForViewer(viewerId).filter((e) => e.type === 'shell_hit' && e.shooterId === 'shooter')) {
      seen[viewerId]++;
      for (const field of ['flightDistM', 'impactLocalDir']) {
        assert.ok(!(field in hit), `${viewerId} reads no ${field} for a hidden shooter`);
      }
      assert.ok(Array.isArray(hit.localDir) && hit.localDir[1] === 0, `${viewerId}: localDir is horizontal`);
      const sector = Math.atan2(hit.localDir[0], hit.localDir[2]) / (Math.PI / 4);
      assert.ok(Math.abs(sector - Math.round(sector)) < 1e-9, `${viewerId}: localDir is a 45 degree sector (${sector})`);
      assert.ok(Array.isArray(hit.pos) && typeof hit.damage === 'number', `${viewerId}: the hit itself is delivered`);
    }
  }
  for (const viewerId of ['shooter', 'spectator:watcher']) {
    for (const hit of match.eventsForViewer(viewerId).filter((e) => e.type === 'shell_hit' && e.shooterId === 'shooter')) {
      seen[viewerId === 'shooter' ? 'shooter' : 'spectator']++;
      assert.ok(typeof hit.flightDistM === 'number' && hit.flightDistM > 400, `${viewerId} reads the whole hit`);
      assert.ok(Array.isArray(hit.localDir) && hit.localDir[1] !== 0, `${viewerId} reads the exact direction`);
    }
  }
  match.afterEventBroadcast();
}
assert.ok(seen.target >= 1 && seen.mate >= 1 && seen.shooter >= 1 && seen.spectator >= 1, `hits seen ${JSON.stringify(seen)}`);
console.log('hiddenShotEvents.selftest: ok', JSON.stringify(seen));
