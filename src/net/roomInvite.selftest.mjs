import assert from 'node:assert/strict';
import { createRoomInviteUrl, parseRoomInvite } from './roomInvite.js';

assert.deepEqual(
  parseRoomInvite('https://cot.example/?room=ab-cd2e'),
  { roomCode: 'ABCD2E', mode: 'private' },
  'private invite links normalize human-readable room codes',
);
assert.deepEqual(
  parseRoomInvite('http://192.168.1.4:5173/?mode=lan&room=wx9yz8'),
  { roomCode: 'WX9YZ8', mode: 'lan' },
  'LAN invite links preserve their deployment mode',
);
assert.equal(parseRoomInvite('https://cot.example/?room=SHORT'), null);
assert.equal(parseRoomInvite('not a valid URL'), null);

assert.equal(
  createRoomInviteUrl({
    roomCode: 'abc234',
    baseUrl: 'https://cot.example/garage?netSim=1#debug',
  }),
  'https://cot.example/garage?room=ABC234',
  'private invites discard unrelated local diagnostics',
);
assert.equal(
  createRoomInviteUrl({
    roomCode: 'WX9YZ8',
    mode: 'lan',
    baseUrl: 'http://192.168.1.4:5173/',
  }),
  'http://192.168.1.4:5173/?room=WX9YZ8&mode=lan',
);
assert.throws(() => createRoomInviteUrl({
  roomCode: 'bad',
  baseUrl: 'https://cot.example/',
}), /six-character/);

console.log('roomInvite.selftest: canonical private and LAN invite links passed');
