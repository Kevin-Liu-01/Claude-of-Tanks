import assert from 'node:assert/strict';
import { classifyRoomFailure, isIntentionalRoomCloseReason } from './roomFailure.ts';

for (const code of ['expired', 'room_not_found', 'kicked', 'resume_denied', 'invalid_resume_token', 'room_closed', 'match_lost']) {
  assert.equal(classifyRoomFailure({ code }).roomEnded, true, code);
  assert.equal(classifyRoomFailure(code).canRetry, false, code);
}
for (const code of ['room_service_unavailable', 'room_unreachable', 'room_unconfigured', 'exhausted', 'timeout', 'connection_failed']) {
  assert.equal(classifyRoomFailure({ code }).canRetry, true, code);
  assert.equal(classifyRoomFailure(code).roomEnded, false, code);
}
for (const code of ['room_unreachable', 'room_unconfigured', 'exhausted', 'timeout']) {
  assert.equal(classifyRoomFailure({ code }).code, 'room_service_unavailable', 'an unanswered or unnamed room host is the room service being unavailable');
}
for (const code of ['room_full', 'invalid_room_code', 'access_denied']) {
  assert.deepEqual(classifyRoomFailure(code), { code, canRetry: false, roomEnded: false });
}
assert.equal(classifyRoomFailure('spectators_full').code, 'room_full');
assert.equal(classifyRoomFailure('room_locked').code, 'access_denied', 'a room that plays refuses a fresh join');
assert.equal(classifyRoomFailure('rate_limit').code, 'access_denied');
for (const unknown of [null, undefined, 42, {}, { message: 'expired' }, { code: { toString: () => 'expired' } }, 'internal', 'invalid_payload']) {
  assert.equal(classifyRoomFailure(unknown).code, 'connection_failed',
    'unknown prose, internal codes and non-string codes cannot fabricate a terminal room reason');
}
for (const reason of ['left_room', 'back_to_menu', 'menu_closed', 'mode_changed', 'room_connection_superseded', 'explicit_leave', 'returned_to_garage']) {
  assert.equal(isIntentionalRoomCloseReason(reason), true, reason);
}
for (const reason of ['expired', 'kicked', 'exhausted', 'room_unreachable', null]) assert.equal(isIntentionalRoomCloseReason(reason), false);
console.log('roomFailure.selftest: terminal membership, the unavailable room service and explicit retry policy passed');
