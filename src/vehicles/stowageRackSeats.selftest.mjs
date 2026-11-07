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
// 3. Built, on every id that has both a seat and a lived-in rack, and on the Sho't Kal: the racks the builders publish
//    (KIT.fittings.stowageRack) as well. Building the whole fleet takes minutes, so it is not a receipt: the round-270
//    sweep built all 279 seated ids (34 publish a rack) and found three docks over a rack besides the M2A2's (the M1A1's
//    and the HC's over their bustle racks, the Sho't Kal's on a receiver over its basket), all moved on Main's ruling
//    (2026-11-06: "Move all three older seats; no exception list"); tools/gen-mission-attachment-seats.mjs reads the
//    same racks whenever it seats a dock.
// 4. Negative control: the seat release 269's regeneration chose for the M2A2 is caught over its bustle rack.
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

// The ids whose dock the round-270 sweep found over a rack only a built tank publishes (the Sho't Kal's basket).
const PUBLISHED_RACK_IDS = Object.freeze(['shot_kal']);
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
    flagged.push(`${table} ${id}: ${describe(overlaps)}`);
  }
}
assert.deepEqual(flagged, [], `mission seats over a stowage rack the lived-in decor loads:\n  ${flagged.join('\n  ')}`);

// 3. built: the published racks as well, on every id with a seat and a lived-in rack, and the Sho't Kal
const built = [];
try {
  for (const id of new Set([...Object.keys(LIVED_IN_RACKS), ...PUBLISHED_RACK_IDS])) {
    const seat = MISSION_ATTACHMENT_SEATS[id];
    if (!seat) continue;
    // (the decor's keep-out is the same boxes)
    const keepOut = dockKeepOut(id, seat.frame), boxes = missionDockKeepOutBoxes(seat);
    ok(keepOut.length === boxes.length && keepOut.every((box, i) => box.equals(boxes[i])), `${id}: the decor keeps off the boxes the seat is judged by`);
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality: 'high', camoSeed: 4000 });
    try {
      const published = publishedStowageRacks(tank.root), lived = LIVED_IN_RACKS[id] ?? [];
      const overlaps = seatRackOverlaps(seat, [...lived, ...published]);
      ok(!overlaps.length, `${id}: its ${seat.frame} seat keeps off ${published.length} published and ${lived.length} lived-in racks${overlaps.length ? ': ' + describe(overlaps) : ''}`);
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
  `built ${built.join(', ')} (${checks} checks)`);
