// stowageRackSeats.selftest.mjs — no mission seat over a stowage rack (round 270, lane abrams-bradley). Main, 2026-11-06:
// "move the drone-dock seat off the bustle rack and keep the duffel. The rack and its load are the real vehicle's
// stowage; the dock is a mission add-on, so it finds clear deck. Add a decor control that fails if a mission seat
// overlaps a stowage rack." (Release 269's gate: the M2A2's regenerated dock seat stood over its bustle rack, and the
// rack's long duffel was turned away as "drone-dock" at every station.)
//
// 1. The racks the lived-in decor loads (src/vehicles/stowageRacks.ts LIVED_IN_RACKS) are the ones its rows stand on: every
//    turret rack row of an id seats its first station inside one of the id's racks, and an id whose rows load a turret
//    rack has one.
// 2. Fleet-wide, from the records alone: no seat record (src/sim/missionAttachmentSeats.generated.ts, and its boot-side
//    projection missionDockSeats.generated.ts) puts its keep-out boxes (cradle, parked airframe, launch column, 3 cm
//    clear) into the volume of a rack the lived-in decor loads (footprint, floor to rails plus RACK_LOAD_HEAD).
// 3. Built, on every id that has both a seat and a lived-in rack (and every held seat): the racks the builders publish
//    (KIT.fittings.stowageRack) as well. Building the whole fleet takes minutes, so it is not a receipt: the round-270
//    sweep built all 279 seated ids (34 publish a rack) and found the held seats below and nothing else;
//    tools/gen-mission-attachment-seats.mjs reads the same racks whenever it seats a dock.
// 4. Negative control: the seat release 269's regeneration chose for the M2A2 is caught over its bustle rack.
// AWAITING_RULING (2026-11-06): seats the rule flags that were seated before it and that Main has not ruled on; each is
// pinned to its record and its overlap, so a moved seat or a changed rack fails here until the entry goes.
import assert from 'node:assert/strict';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import './fleetRegistration.ts';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { decorManifestFor, dockKeepOut } from './decorations.ts';
import { LIVED_IN_RACKS, missionDockKeepOutBoxes, publishedStowageRacks, seatRackOverlaps } from './stowageRacks.ts';
import { MISSION_ATTACHMENT_SEATS } from '../sim/missionAttachmentSeats.generated.ts';
import { MISSION_DOCK_SEATS } from '../sim/missionDockSeats.generated.ts';

const warn = console.warn;
console.warn = () => {};
const restoreCanvas = installCanvasFixture();
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// Seats the rule flags that predate it, held for Main's ruling (2026-11-06, round 270: the coordinator relays them). On the
// two M1A1s the dock's airframe reaches back over the front of the bustle rack the decor loads (the decor keeps only low
// cases there); the Sho't Kal docks on the receiver its builder put on its bustle basket's cover.
const AWAITING_RULING = Object.freeze({
  // airframe and launch column over x 0.07..0.84, z -2.78..-2.60, from 0.78 (rails 0.66)
  m1a1: { seat: [0.455, 0.754, -2.389], overlap: { x: [0.068, 0.842], y: [0.777, 1.01], z: [-2.777, -2.6] } },
  // airframe and launch column over x -0.90..-0.13, z -2.78..-2.60, from 0.78 (rails 0.84)
  m1a1_abrams_hc: { seat: [-0.513, 0.754, -2.389], overlap: { x: [-0.9, -0.126], y: [0.777, 1.19], z: [-2.777, -2.6] } },
  // a published rack (centurionFamily.ts: the bustle basket under its cover), the dock on the mission receiver the builder
  // authored on it (addMissionAttachmentReceiver): the whole airframe over the basket from 0.86 (rails 0.88)
  shot_kal: { seat: [0.45, 0.939, -2.1], overlap: { x: [0.063, 0.837], y: [0.86, 1.23], z: [-2.411, -1.799] } },
});
function pinned(id, seat, overlaps) {
  const pin = AWAITING_RULING[id];
  if (!pin) return false;
  ok([seat.x, seat.y, seat.z].every((v, i) => Math.abs(v - pin.seat[i]) < 0.001), `${id}: its seat is the one held for Main's ruling`);
  ok(overlaps.length === 1, `${id}: one rack under its seat (${overlaps.length})`);
  const o = overlaps[0].overlap;
  ok(['x', 'y', 'z'].every((axis) => Math.abs(o.min[axis] - pin.overlap[axis][0]) < 0.002 && Math.abs(o.max[axis] - pin.overlap[axis][1]) < 0.002),
    `${id}: the overlap held for Main's ruling (${['x', 'y', 'z'].map((a) => `${a} ${o.min[a].toFixed(3)}..${o.max[a].toFixed(3)}`).join(', ')})`);
  return true;
}
const describe = (overlaps) => overlaps.map(({ rack, overlap: o }) =>
  `rack x ${rack.x0.toFixed(2)}..${rack.x1.toFixed(2)} z ${rack.z0.toFixed(2)}..${rack.z1.toFixed(2)}: ` +
  `x ${o.min.x.toFixed(3)}..${o.max.x.toFixed(3)} y ${o.min.y.toFixed(3)}..${o.max.y.toFixed(3)} z ${o.min.z.toFixed(3)}..${o.max.z.toFixed(3)}`).join('; ');

// 1. the lived-in racks are the ones the rows stand on
let rackRows = 0;
for (const id of Object.keys(MISSION_ATTACHMENT_SEATS).concat(Object.keys(LIVED_IN_RACKS))) {
  const spec = getSpec(id);
  if (!spec) continue;
  const rows = decorManifestFor(spec, () => 0.5).filter((row) => row.livedIn && row.slot[0] === 'stowAt' && row.slot[1].turret);
  if (!rows.length) continue;
  const racks = LIVED_IN_RACKS[id] ?? [];
  ok(racks.length > 0, `${id}: its lived-in rows load a turret rack, so the rack is in LIVED_IN_RACKS`);
  for (const row of rows) {
    const [x, z] = row.slot[1].at[0];
    ok(racks.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1), `${id}: its ${row.v.v} stands on its rack (${x}, ${z})`);
    rackRows++;
  }
}
for (const id of Object.keys(LIVED_IN_RACKS)) {
  ok(decorManifestFor(getSpec(id), () => 0.5).some((row) => row.livedIn && row.slot[1].turret), `${id}: its rack carries lived-in rows`);
}

// 2. fleet-wide, the records against the lived-in racks
const flagged = [];
for (const [table, seats] of [['missionAttachmentSeats', MISSION_ATTACHMENT_SEATS], ['missionDockSeats', MISSION_DOCK_SEATS]]) {
  for (const [id, seat] of Object.entries(seats)) {
    const overlaps = seatRackOverlaps(seat, LIVED_IN_RACKS[id] ?? []);
    if (!overlaps.length) { checks++; continue; }
    if (pinned(id, seat, overlaps)) continue;
    flagged.push(`${table} ${id}: ${describe(overlaps)}`);
  }
}
assert.deepEqual(flagged, [], `mission seats over a stowage rack the lived-in decor loads:\n  ${flagged.join('\n  ')}`);
for (const id of Object.keys(AWAITING_RULING)) ok(MISSION_ATTACHMENT_SEATS[id], `${id}: a held seat still has its record`);

// 3. built: the published racks as well, on every id with a seat and a lived-in rack (and the held seats)
const built = [];
try {
  for (const id of new Set([...Object.keys(LIVED_IN_RACKS), ...Object.keys(AWAITING_RULING)])) {
    const seat = MISSION_ATTACHMENT_SEATS[id];
    if (!seat) continue;
    // (the decor's keep-out is the same boxes)
    const keepOut = dockKeepOut(id, seat.frame), boxes = missionDockKeepOutBoxes(seat);
    ok(keepOut.length === boxes.length && keepOut.every((box, i) => box.equals(boxes[i])), `${id}: the decor keeps off the boxes the seat is judged by`);
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high', camoSeed: 4000 });
    try {
      const published = publishedStowageRacks(tank.root), lived = LIVED_IN_RACKS[id] ?? [];
      const overlaps = seatRackOverlaps(seat, [...lived, ...published]);
      if (!pinned(id, seat, overlaps)) ok(!overlaps.length, `${id}: its ${seat.frame} seat keeps off ${published.length} published and ${lived.length} lived-in racks${overlaps.length ? ': ' + describe(overlaps) : ''}`);
      built.push(`${id} (${published.length} published)`);
    } finally {
      tank.dispose();
    }
  }
} finally {
  restoreCanvas?.();
  console.warn = warn;
}

// 4. negative control: release 269's regenerated M2A2 seat stood over the bustle rack (the duffel turned away)
{
  const regen269 = { frame: 'turret', x: -0.025339999999999918, y: 0.7050000262260437, z: -0.6605334928229665, width: 0.34,
    depth: 0.32, footX: 0.108, footZ: 0.09, supportY: [0.6600000262260437, 0.6600000262260437, 0.6600000262260437, 0.6600000262260437] };
  const overlaps = seatRackOverlaps(regen269, LIVED_IN_RACKS.m2a2_bradley);
  ok(overlaps.length === 1 && overlaps[0].overlap.min.z < -0.98 && near(overlaps[0].overlap.max.z, -0.98),
    `negative control: the 269 regeneration's M2A2 seat is over its bustle rack (${describe(overlaps)})`);
}

console.log(`stowageRackSeats: ${Object.keys(MISSION_ATTACHMENT_SEATS).length} seats keep off the lived-in racks (${rackRows} rack rows on them); ` +
  `built ${built.join(', ')}; held for Main: ${Object.keys(AWAITING_RULING).join(', ') || 'none'} (${checks} checks)`);
