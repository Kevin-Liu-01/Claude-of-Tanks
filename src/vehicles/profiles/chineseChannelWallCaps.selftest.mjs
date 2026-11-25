import assert from 'node:assert/strict';
import '../../../tools/tank-surface-collect.mjs';
import { createTank } from '../tankFactory.ts';
import { betweenBuilds } from '../../../tools/build-loop-yield.mjs';

// 227 gun-gaps r3 (owner 2026-10-17, "fix any of these" with the C2 gun gap). The Chinese throat stock removes a
// 0.80 m channel for the gun and caps each cut wall (chineseGunOpening.ts halfStock). The chevron ERA cassettes are thin
// arrow-shaped skins, so their cut at the channel wall (|x| = 0.40, turret frame) is a non-convex band; the old cap, a
// fan round the band's centroid in angle order, zig-zagged between the band's outer and inner lines: 42 cap edges per
// tank matched no other triangle (9.45 m of open seam on ztz99a2 and the t72b3_qilin carrying its turret, 9.24 m on
// vt4a1) and the gun-junction census saw the inside of the cassettes through the sawtooth beside the gun (up to 276 px
// from 13 of 24 directions at full depression). The band is now ear-clipped from its chained contour: every edge on the
// channel walls is shared by exactly two triangles. Convex cuts (the authored turret sections) keep their fan.
// Release 276 (cn-turrets-276): the three turrets' cheeks are faces of one closed solid lofted from each turret's plan
// outline (chineseTurretOutlines.ts), and that solid (the 'turret' shell) is what the channel cuts; the face tiles stop
// short of the walls. So the walls are read on the shell, and no tile may reach into the channel.
const OWNER = 'turret';
// Behind the channel's back wall (gun trunnion z - 0.58) the cut wall part and the solid's centre part meet face to face
// inside the turret (each closed, so each edge there is used four times); the open channel is ahead of it.
const BACK_WALL_Z = { ztz99a2: 0.78 - 0.58, ztz99a: 0.75 - 0.58, vt4a1: 0.75 - 0.58 };
const TILES = 'turretExternalArmor';
const WALL_X = 0.40;

function tileChannelIntrusionM(root) {
  const turret = root.getObjectByName('rig_turret'), toTurret = turret.matrixWorld.clone().invert();
  let worst = 0;
  root.traverse((object) => {
    if (!object.isMesh || object.name !== TILES) return;
    const position = object.geometry.getAttribute('position'), matrix = toTurret.clone().multiply(object.matrixWorld);
    const Vector = object.position.constructor;
    for (let i = 0; i < position.count; i++) {
      const v = new Vector().fromBufferAttribute(position, i).applyMatrix4(matrix);
      if (v.z > 0.30) worst = Math.max(worst, WALL_X - Math.abs(v.x));
    }
  });
  return worst;
}

function channelWallEdges(id) {
  const tank = createTank(id, null, { proceduralOnly: true });
  const root = tank.root;
  root.updateMatrixWorld(true);
  const turret = root.getObjectByName('rig_turret');
  const toTurret = turret.matrixWorld.clone().invert();
  const edges = new Map();
  let meshes = 0;
  root.traverse((object) => {
    if (!object.isMesh || object.name !== OWNER) return;
    meshes++;
    const position = object.geometry.getAttribute('position');
    const index = object.geometry.index;
    const count = index ? index.count : position.count;
    const matrix = toTurret.clone().multiply(object.matrixWorld);
    const Vector = object.position.constructor;
    const key = (v) => v.toArray().map((n) => n.toFixed(5)).join(',');
    for (let i = 0; i < count; i += 3) {
      const corners = [0, 1, 2].map((k) => new Vector().fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(matrix));
      for (let k = 0; k < 3; k++) {
        const a = corners[k], b = corners[(k + 1) % 3];
        if (Math.abs(Math.abs(a.x) - WALL_X) > 1e-4 || Math.abs(Math.abs(b.x) - WALL_X) > 1e-4 || Math.sign(a.x) !== Math.sign(b.x)) continue;
        if (Math.min(a.z, b.z) < BACK_WALL_Z[id] + 0.005) continue;
        const ka = key(a), kb = key(b);
        if (ka === kb) continue;
        const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const row = edges.get(edge) ?? { uses: 0, length: a.distanceTo(b) };
        row.uses++;
        edges.set(edge, row);
      }
    }
  });
  const intrusionM = tileChannelIntrusionM(root);
  tank.dispose?.();
  return { meshes, edges: [...edges.values()], intrusionM };
}

const report = [];
for (const id of ['ztz99a2', 'ztz99a', 'vt4a1']) { // (252: the Qilin's turret is a Type 96B now, with no Chinese gun channel)
  await betweenBuilds(); // the last build is free to go (tools/build-loop-yield.mjs)
  const { meshes, edges, intrusionM } = channelWallEdges(id);
  assert.ok(meshes > 0, `${id}: the turret shell (${OWNER}) must be built`);
  assert.ok(edges.length >= 6, `${id}: the shell must be cut at the gun channel walls (read ${edges.length} wall edges)`);
  assert.ok(intrusionM <= 0, `${id}: a face tile reaches ${(intrusionM * 1000).toFixed(1)} mm into the gun channel`);
  const open = edges.filter((edge) => edge.uses !== 2);
  const seamMm = open.reduce((sum, edge) => sum + edge.length, 0) * 1000;
  assert.equal(open.length, 0, `${id}: ${open.length} channel-wall cap edges are not shared by exactly two triangles (${seamMm.toFixed(0)} mm of open seam)`);
  report.push(`${id} ${edges.length} wall edges`);
}
console.log(`chineseChannelWallCaps.selftest: shell caps closed on the gun channel walls, tiles clear of it (${report.join(', ')}) PASS`);
