import assert from 'node:assert/strict';
import { roomFailurePresentation } from './roomFailurePresentation.ts';

const terminal = ['expired', 'kicked', 'resume_denied', 'room_closed'];
for (const code of terminal) {
  const view = roomFailurePresentation(code);
  assert.equal(view.code, code);
  assert.equal(view.canRetry, false);
  assert.equal(view.roomEnded, true);
  assert.ok(view.title.length > 8 && view.detail.length > 30);
}
for (const code of ['room_full', 'invalid_room_code', 'access_denied']) {
  const view = roomFailurePresentation(code);
  assert.equal(view.canRetry, false);
  assert.equal(view.roomEnded, false);
  assert.equal(view.editCode, true);
}
for (const code of ['room_service_unavailable', 'connection_failed']) {
  const view = roomFailurePresentation({ code, message: 'secret-token-must-not-render' });
  assert.equal(view.code, code);
  assert.equal(view.canRetry, true);
  assert.ok(view.title && view.detail);
  assert.equal(JSON.stringify(view).includes('secret-token'), false);
}
assert.equal(roomFailurePresentation('room_not_found').code, 'expired');
assert.equal('editSettings' in roomFailurePresentation('room_service_unavailable'), false,
  'no failure offers a connection-settings field (the cutover of 2026-09-29 removed it)');
// The room host (the rooms Worker, the LAN helper) unreachable, or none configured for this origin: the room service is
// unavailable, retryable, with no code to edit (src/mp/room/roomClient.ts RoomConnectError, playMenuAdapter.ts).
for (const code of ['room_unreachable', 'room_unconfigured', 'exhausted']) {
  const view = roomFailurePresentation({ code, message: 'room host unreachable (timeout)' });
  assert.equal(view.code, 'room_service_unavailable');
  assert.equal(view.canRetry, true);
  assert.equal(view.editCode, false);
  assert.match(view.title, /Room service unavailable/);
  assert.doesNotMatch(view.detail, /signaling/i, 'the copy names the room service, never a signaling address');
}
assert.doesNotMatch(roomFailurePresentation('access_denied').detail, /signaling|connection settings/i);
assert.match(roomFailurePresentation('resume_denied').detail, /not take the seat back automatically/);
assert.match(roomFailurePresentation('kicked').title, /Removed/, 'a host-removed seat is not described as a voluntary departure');
assert.equal(roomFailurePresentation(new Error('secret-server-detail')).code, 'connection_failed');
console.log('roomFailurePresentation.selftest: every failure has safe actionable copy and terminal retry policy');
