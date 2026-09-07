import assert from 'node:assert/strict';
import { privateRoomFailurePresentation } from './privateRoomFailurePresentation.ts';

const terminal = ['host_left', 'host_runtime_failed', 'expired', 'kicked', 'resume_denied', 'room_closed'];
for (const code of terminal) {
  const view = privateRoomFailurePresentation(code);
  assert.equal(view.code, code);
  assert.equal(view.canRetry, false);
  assert.equal(view.roomEnded, true);
  assert.ok(view.title.length > 8 && view.detail.length > 30);
}
for (const code of ['room_full', 'invalid_room_code', 'access_denied']) {
  const view = privateRoomFailurePresentation(code);
  assert.equal(view.canRetry, false);
  assert.equal(view.roomEnded, false);
  assert.equal(view.editCode, true);
}
for (const code of ['rtc_connect_timeout', 'rtc_recovery_exhausted', 'signaling_unavailable', 'connection_failed']) {
  const view = privateRoomFailurePresentation({ code, message: 'secret-token-must-not-render' });
  assert.equal(view.code, code);
  assert.equal(view.canRetry, true);
  assert.ok(view.title && view.detail);
  assert.equal(JSON.stringify(view).includes('secret-token'), false);
}
assert.equal(privateRoomFailurePresentation('room_not_found').code, 'expired');
assert.equal(privateRoomFailurePresentation('signaling_unavailable').editSettings, true);
assert.equal(privateRoomFailurePresentation('signaling_unavailable').editCode, false);
for (const code of ['signaling_capacity_exhausted', 'signaling_store_unavailable', 'signaling_connection_failed']) {
  assert.equal(privateRoomFailurePresentation({ code }).code, 'signaling_unavailable',
    'actual server and native socket error codes use the unavailable-service actions');
}
assert.match(privateRoomFailurePresentation('rtc_recovery_exhausted').detail, /stopped waiting/);
assert.match(privateRoomFailurePresentation('resume_denied').detail, /not take the seat back automatically/);
assert.match(privateRoomFailurePresentation('kicked').title, /Removed/,
  'a host-removed seat is not described as a voluntary departure');
assert.equal(privateRoomFailurePresentation(new Error('secret-server-detail')).code, 'connection_failed');
console.log('privateRoomFailurePresentation.selftest: every failure has safe actionable copy and terminal retry policy');
