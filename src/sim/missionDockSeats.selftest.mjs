// The boot-side dock seats (2026-10-12, the 221 integration): src/sim/missionDockSeats.generated.ts is exactly the seat
// records of missionAttachmentSeats.generated.ts without their audit signature and geometry hash (the projection
// tools/mission-dock-seats.mjs renders, which tools/gen-mission-attachment-seats.mjs writes beside the full table), and
// the decor builder's dock keep-out reads it, never the full table or the battle-only seat search.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MISSION_ATTACHMENT_SEATS } from './missionAttachmentSeats.generated.ts';
import { MISSION_DOCK_SEATS } from './missionDockSeats.generated.ts';
import { missionDockSeatsSource } from '../../tools/mission-dock-seats.mjs';

const text = readFileSync(new URL('./missionDockSeats.generated.ts', import.meta.url), 'utf8');
assert.equal(text, missionDockSeatsSource(MISSION_ATTACHMENT_SEATS),
  'missionDockSeats.generated.ts is current: run node tools/mission-dock-seats.mjs (gen-mission-attachment-seats writes both)');
assert.deepEqual(Object.keys(MISSION_DOCK_SEATS).sort(), Object.keys(MISSION_ATTACHMENT_SEATS).sort(), 'one dock seat per seat record');
for (const [id, full] of Object.entries(MISSION_ATTACHMENT_SEATS)) {
  const { signature, geometryHash, ...seat } = full;
  assert.ok(signature && geometryHash, `${id}: the full record keeps its audit keys`);
  assert.deepEqual(MISSION_DOCK_SEATS[id], seat, `${id}: the dock seat is the record without its audit keys`);
}
// a negative control: a moved datum is stale
const moved = { ...MISSION_ATTACHMENT_SEATS, m1a2: { ...MISSION_ATTACHMENT_SEATS.m1a2, y: MISSION_ATTACHMENT_SEATS.m1a2.y + 0.01 } };
assert.notEqual(missionDockSeatsSource(moved), text, 'a moved seat datum makes the projection stale');

const decorations = readFileSync(new URL('../vehicles/decorations.ts', import.meta.url), 'utf8');
assert.match(decorations, /import \{ MISSION_DOCK_SEATS \} from '\.\.\/sim\/missionDockSeats\.generated\.ts';/,
  'the decor keep-out reads the boot-side dock seats');
assert.doesNotMatch(decorations, /from '\.\.\/sim\/(?:missionAttachment|missionAttachmentSeats\.generated)\.ts'/,
  'the decor builder imports neither the seat search nor the full seat table (both battle-only)');
console.log(`missionDockSeats: ${Object.keys(MISSION_DOCK_SEATS).length} dock seats match their records; the decor keep-out reads them`);
