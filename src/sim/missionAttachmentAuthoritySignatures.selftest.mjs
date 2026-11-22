// The authority's dock seats (274, seat-search-seed): the match authority (the Node service, the Rooms host core, the
// match actor) reads specs from src/vehicles/authorityFleet.ts, whose specs are complete only after
// ensureAuthorityFleet finalizes their combat anatomy (each entry awaits it, or requireAuthorityFleet throws). Through
// that path every committed seat record's signature matches and missionAttachmentFor returns the record itself, so the
// authority launches the drone from the seat the client draws. The control: before it, a spec's plates are unfitted
// and its signature misses its record (missionAttachmentFor would cache the fallback seat for that spec object).
import assert from 'node:assert/strict';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { MISSION_ATTACHMENT_SEATS } from './missionAttachmentSeats.generated.ts';
import { missionAttachmentFor, missionAttachmentSignature } from './missionAttachment.ts';

const ids = Object.keys(MISSION_ATTACHMENT_SEATS);
assert.notEqual(missionAttachmentSignature(TANK_SPECS.t80u_kursk), MISSION_ATTACHMENT_SEATS.t80u_kursk.signature,
  'control: an unfinalized spec\'s signature misses its record');

await ensureAuthorityFleet(ids);
const mismatched = ids.filter((id) => !TANK_SPECS[id] || missionAttachmentSignature(TANK_SPECS[id]) !== MISSION_ATTACHMENT_SEATS[id].signature);
assert.deepEqual(mismatched, [], 'every committed seat record\'s signature matches the authority\'s finalized spec');
const fallback = ids.filter((id) => missionAttachmentFor(TANK_SPECS[id]) !== MISSION_ATTACHMENT_SEATS[id]);
assert.deepEqual(fallback, [], 'the authority seats every carrier on its committed record');
console.log(`missionAttachmentAuthoritySignatures: ${ids.length} seat records match through ensureAuthorityFleet (none before it)`);
