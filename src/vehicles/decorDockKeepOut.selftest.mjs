// The shipped stowage leaves the drone dock clear (2026-10-11, the drones lane): on the vehicles whose loads used to
// stand inside the dock's certified volumes (cradle, parked airframe, launch column), no decor triangle enters them now,
// and every seat record yields its keep-out boxes in its own frame.
import assert from 'node:assert/strict';
import { Box3, Triangle, Vector3 } from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { createTank } from './tankFactory.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { dockKeepOut, DOCK_KEEP_OUT_CLEAR } from './decorations.ts';
import { MISSION_ATTACHMENT_SEATS } from '../sim/missionAttachmentSeats.generated.ts';
import { missionAirframeVolumes, missionCradleVolumes } from '../sim/missionAttachment.ts';

installCanvasFixture();
// Every seat yields keep-out boxes in its own frame and none in the other.
for (const [id, seat] of Object.entries(MISSION_ATTACHMENT_SEATS)) {
  const own = dockKeepOut(id, seat.frame), other = dockKeepOut(id, seat.frame === 'turret' ? 'hull' : 'turret');
  assert.ok(own.length >= missionCradleVolumes(seat).length && other.length === 0, `${id}: keep-out boxes in the seat's frame only`);
}
assert.equal(dockKeepOut('no-such-vehicle', 'turret').length, 0, 'no seat, no keep-out');
// The worst offenders of the 2026-10-11 census (triangles of stowage inside the dock volumes before the keep-out).
const ids = ['type89_x', 'type96b_x', 'leo2a4m', 'type90a', 'kf51_x', 'merkava4_barak', 'ariete_c1', 'm1a2'];
await ensureInteriorFills(ids);
const tri = new Triangle(), a = new Vector3(), b = new Vector3(), c = new Vector3();
let checked = 0, rejected = 0;
for (const id of ids) {
  const seat = MISSION_ATTACHMENT_SEATS[id];
  const tank = createTank(id, null, { quality: 'high', camoSeed: 4242, decor: true });
  tank.root.updateMatrixWorld(true);
  const frame = tank.root.getObjectByName(seat.frame === 'hull' ? 'rig_hull' : 'rig_turret'), inv = frame.matrixWorld.clone().invert();
  const at = new Vector3(seat.x, seat.y, seat.z);
  const volumes = [...missionCradleVolumes(seat), ...missionAirframeVolumes(seat, true)].map(v => new Box3(new Vector3(...v.min), new Vector3(...v.max)).translate(at));
  let inside = 0;
  frame.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    let decor = false; for (let p = o; p; p = p.parent) if ((p.name || '').startsWith('rig_decor')) decor = true;
    if (!decor) return;
    const m = inv.clone().multiply(o.matrixWorld), g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m); b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m); c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m);
      tri.set(a, b, c); checked++;
      if (volumes.some(v => v.intersectsTriangle(tri))) inside++;
    }
  });
  const summary = tank.root.userData.decorSummary ?? tank.root.getObjectByName('rig_decor_turret')?.userData?.decorSummary;
  rejected += summary?.skipped?.filter?.(([, why]) => why === 'drone-dock').length ?? 0;
  assert.equal(inside, 0, `${id}: no stowage triangle inside the drone dock's volumes`);
  tank.dispose();
}
assert.ok(DOCK_KEEP_OUT_CLEAR >= .02 && DOCK_KEEP_OUT_CLEAR <= .05, 'a few centimetres of clearance');
console.log(`decorDockKeepOut: ${Object.keys(MISSION_ATTACHMENT_SEATS).length} seats keep their dock clear; ${ids.length} former offenders carry no stowage inside it (${checked} decor triangles checked${rejected ? `, ${rejected} placements turned away` : ''})`);
