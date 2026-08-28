import assert from 'node:assert/strict';
import { normalizeRoomChatMessage } from './roomChat.ts';

assert.equal(normalizeRoomChatMessage(null), null);
assert.equal(normalizeRoomChatMessage({ text: 'missing identity' }), null);
assert.deepEqual(normalizeRoomChatMessage({
  id: 'msg-1', senderId: 'player-1', senderName: 'Commander', team: 'alpha', text: 'Ready.',
}), {
  id: 'msg-1', senderId: 'player-1', senderName: 'Commander', team: 'alpha', text: 'Ready.',
});
assert.deepEqual(normalizeRoomChatMessage({
  id: 27, senderName: null, team: 'hostile injected class', text: 5,
}), {
  id: '27', senderId: '', senderName: 'Player', team: 'spectator', text: '5',
}, 'untrusted identity and CSS class inputs normalize before DOM presentation');

console.log('roomChat.selftest: untrusted message normalization passed');
