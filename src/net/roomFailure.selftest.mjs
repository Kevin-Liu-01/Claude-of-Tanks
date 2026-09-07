import assert from 'node:assert/strict';
import { classifyPrivateRoomFailure, isIntentionalRoomCloseReason } from './roomFailure.ts';

for (const code of ['host_left', 'host_closed', 'expired', 'room_not_found',
  'kicked', 'peer_kicked', 'resume_denied', 'invalid_resume_token', 'room_closed']) {
  assert.equal(classifyPrivateRoomFailure({ code }).roomEnded, true, code);
  assert.equal(classifyPrivateRoomFailure(code).canRetry, false, code);
}
for (const code of ['rtc_connect_timeout', 'rtc_recovery_exhausted',
  'signaling_unavailable', 'room_store_unavailable', 'connection_failed']) {
  assert.equal(classifyPrivateRoomFailure({ code }).canRetry, true, code);
  assert.equal(classifyPrivateRoomFailure(code).roomEnded, false, code);
}
for (const code of ['room_full', 'invalid_room_code', 'access_denied']) {
  assert.deepEqual(classifyPrivateRoomFailure(code), { code, canRetry: false, roomEnded: false });
}
for (const unknown of [null, undefined, 42, {}, { message: 'host_left' },
  { code: { toString: () => 'host_left' } }]) {
  assert.equal(classifyPrivateRoomFailure(unknown).code, 'connection_failed',
    'unknown prose and non-string codes cannot fabricate a terminal room reason');
}
for (const reason of ['left_room', 'back_to_menu', 'menu_closed', 'mode_changed']) {
  assert.equal(isIntentionalRoomCloseReason(reason), true);
}
assert.equal(isIntentionalRoomCloseReason('host_left'), false);
assert.equal(isIntentionalRoomCloseReason('rtc_recovery_exhausted'), false);
for (const code of ['signaling_capacity_exhausted', 'signaling_store_unavailable',
  'signaling_connection_failed']) {
  assert.equal(classifyPrivateRoomFailure({ code }).code, 'signaling_unavailable',
    'actual signaling error codes select service recovery guidance');
}
console.log('roomFailure.selftest: terminal membership and explicit retry policy passed');
