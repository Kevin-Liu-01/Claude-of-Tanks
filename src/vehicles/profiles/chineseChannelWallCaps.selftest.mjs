import assert from 'node:assert/strict';
import '../../../tools/tank-surface-collect.mjs';
import { createTank } from '../tankFactory.ts';

// 227 gun-gaps r3 (owner 2026-10-17, "fix any of these" with the C2 gun gap). The Chinese throat stock removes a
// 0.80 m channel for the gun and caps each cut wall (chineseGunOpening.ts halfStock). The chevron ERA cassettes are thin
// arrow-shaped skins, so their cut at the channel wall (|x| = 0.40, turret frame) is a non-convex band; the old cap, a
// fan round the band's centroid in angle order, zig-zagged between the band's outer and inner lines: 42 cap edges per
// tank matched no other triangle (9.45 m of open seam on ztz99a2 and the t72b3_qilin carrying its turret, 9.24 m on
// vt4a1) and the gun-junction census saw the inside of the cassettes through the sawtooth beside the gun (up to 276 px
// from 13 of 24 directions at full depression). The band is now ear-clipped from its chained contour: every edge on the
// channel walls is shared by exactly two triangles. Convex cuts (the authored turret sections) keep their fan.
const OWNER = 'turretExternalArmor';
const WALL_X = 0.40;

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
        const ka = key(a), kb = key(b);
        if (ka === kb) continue;
        const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const row = edges.get(edge) ?? { uses: 0, length: a.distanceTo(b) };
        row.uses++;
        edges.set(edge, row);
      }
    }
  });
  tank.dispose?.();
  return { meshes, edges: [...edges.values()] };
}

const report = [];
for (const id of ['ztz99a2', 't72b3_qilin', 'vt4a1']) {
  const { meshes, edges } = channelWallEdges(id);
  assert.ok(meshes > 0, `${id}: the chevron ERA cassettes (${OWNER}) must be built`);
  assert.ok(edges.length >= 40, `${id}: the cassettes must be cut at the gun channel walls (read ${edges.length} wall edges)`);
  const open = edges.filter((edge) => edge.uses !== 2);
  const seamMm = open.reduce((sum, edge) => sum + edge.length, 0) * 1000;
  assert.equal(open.length, 0, `${id}: ${open.length} channel-wall cap edges are not shared by exactly two triangles (${seamMm.toFixed(0)} mm of open seam)`);
  report.push(`${id} ${edges.length} wall edges`);
}
console.log(`chineseChannelWallCaps.selftest: ERA cassette caps closed on the gun channel walls (${report.join(', ')}) PASS`);
