#!/usr/bin/env node
// Roof-station traverse arcs (VH.02, 2026-10-14): where a remote roof station's barrel would sweep through the stock
// beside it — another station, an antenna mast, a stowage box. The authority turns a station with a yawArc only inside
// it (src/sim/auxiliarySystems.ts), so the arc must hold every pose the station can take: each yaw is tested at the
// weapon profile's full depression, level and full elevation, along the barrel's axis and four lines a barrel radius off
// it, against every triangle of its own rig (the turret, or the hull for a hull station) outside the station's own
// moving stock (other stations at rest included).
//
//   node tools/roof-station-arcs.mjs --ids=m551a1_tts [--step=1] [--json]
//
// The arc is the widest interval round the station's rest bearing (0) with no blocked yaw, in mount-local radians.
import { uniqueIds } from './id-list.mjs';
import { pathToFileURL } from 'node:url';
import './tank-surface-collect.mjs'; // node canvas shim for the builders' canvas textures
// 275: the probe itself lives in roof-station-probe.mjs, without this canvas shim, so the controls inventory
// (tools/vehicle-controls-inventory.mjs) measures the decor on the build it already makes
import { stationsOf, stationSweep, stationDepression } from './roof-station-probe.mjs';
export { stationProbe, stationSweep, stationDepression } from './roof-station-probe.mjs';

/**
 * VH.14 (2026-10-15): the traverse that keeps each roof station's sweep out of its vehicle's drone stand. With a seat
 * record (the stand's frame and seat) and the inventory's stations, each yaw of each station (1 degree apart) is
 * tested alone (src/sim/missionAttachment.ts missionAttachmentMotionClear, a one-yaw arc, every other station's stock
 * left out); the arc is the widest clear interval round the rest bearing less `marginDeg`. Pure data: no tank is built.
 * Returns {stationName: [lo, hi] radians} for the stations whose full circle meets the stand, or null where the rest
 * bearing itself does.
 */
export async function dockClearArcs(id, seat, { marginDeg = 2 } = {}) {
  const { AUXILIARY_INVENTORY } = await import('../src/vehicles/auxiliaryInventory.generated.ts');
  const { missionAttachmentMotionClear } = await import('../src/sim/missionAttachment.ts');
  const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
  await import('../src/vehicles/tankFactory.ts');
  const kit = AUXILIARY_INVENTORY[id], out = {};
  if (!kit) return out;
  const saved = kit.guns.map((g) => ({ parts: g.collisionParts, arc: g.yawArc }));
  try {
    for (let i = 0; i < kit.guns.length; i++) {
      kit.guns.forEach((g, k) => { g.collisionParts = k === i ? saved[k].parts : []; delete g.yawArc; });
      const clear = (arc) => { kit.guns[i].yawArc = arc; return missionAttachmentMotionClear({ ...TANK_SPECS[id] }, seat); };
      if (clear([-Math.PI, Math.PI])) continue;
      const blocked = new Set();
      for (let deg = -180; deg < 180; deg++) if (!clear([deg * Math.PI / 180, deg * Math.PI / 180])) blocked.add(deg);
      if (blocked.has(0)) { out[kit.guns[i].name] = null; continue; }
      let lo = 0, hi = 0;
      while (lo > -359 && !blocked.has(((lo - 1 + 540) % 360) - 180)) lo--;
      while (hi < 359 && !blocked.has(((hi + 1 + 540) % 360) - 180)) hi++;
      out[kit.guns[i].name] = [(lo + marginDeg) * Math.PI / 180, (hi - marginDeg) * Math.PI / 180].map((r) => Math.round(r * 1e4) / 1e4);
    }
  } finally {
    kit.guns.forEach((g, k) => { g.collisionParts = saved[k].parts; if (saved[k].arc) g.yawArc = saved[k].arc; else delete g.yawArc; });
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && process.argv.includes('--dock')) {
  const arg = (n, f) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : f; };
  const { MISSION_ATTACHMENT_SEATS } = await import('../src/sim/missionAttachmentSeats.generated.ts');
  for (const id of uniqueIds(arg('ids', '').split(',').filter(Boolean), 'roof-station-arcs --ids')) {
    console.log(id, JSON.stringify(await dockClearArcs(id, MISSION_ATTACHMENT_SEATS[id])));
  }
} else if (isMain) {
  const arg = (n, f) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : f; };
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const { auxiliaryWeaponProfile } = await import('../src/vehicles/auxiliaryWeapons.ts');
  const rows = [];
  for (const id of uniqueIds(arg('ids', 'm551a1_tts').split(',').filter(Boolean), 'roof-station-arcs --ids')) {
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, decor: true });
    tank.root.updateMatrixWorld(true);
    for (const station of stationsOf(tank.root).stations) {
      const profile = auxiliaryWeaponProfile(station.userData.caliberMm || 12.7, id);
      const sweep = stationSweep(tank.root, station, profile, { stepDeg: Number(arg('step', '1')) });
      const authored = station.userData.yawArc ? station.userData.yawArc.map((r) => +(r * 180 / Math.PI).toFixed(1)) : null;
      const arc = sweep.arc ?? [-180, 180], samples = [];
      for (let d = arc[0]; d < arc[1]; d += 5) samples.push(d); samples.push(arc[1]);
      const depression = stationDepression(tank.root, station, profile, samples);
      rows.push({ id, ...sweep, authoredDeg: authored, depressionSamplesDeg: samples, depression });
      console.log(`   depression by yaw (5° from ${arc[0]}°): ${depression.join(',')}`);
      const runs = [];
      for (const d of sweep.blocked) { const last = runs.at(-1); if (last && d - last[1] <= Number(arg('step', '1'))) last[1] = d; else runs.push([d, d]); }
      console.log(`${id} ${station.name} (${station.userData.caliberMm} mm, barrel ${sweep.length.toFixed(2)} m, r ${sweep.radius.toFixed(3)}): `
        + `blocked ${runs.map(([a, b]) => `${a}..${b}°`).join(', ') || 'none'}; clear arc ${sweep.arc ? `${sweep.arc[0]}..${sweep.arc[1]}°` : 'full circle'}`
        + `${authored ? `; authored ${authored[0]}..${authored[1]}°` : ''}`);
    }
    tank.dispose?.();
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
}
