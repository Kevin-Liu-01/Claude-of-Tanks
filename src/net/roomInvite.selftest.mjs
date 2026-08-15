import assert from 'node:assert/strict';
import { createRoomInviteUrl, parseRoomInvite, roomInviteTitle } from './roomInvite.js';

assert.deepEqual(
  parseRoomInvite('https://cot.example/?room=ab-cd2e'),
  { roomCode: 'ABCD2E', mode: 'private', hostName: null },
  'private invite links normalize human-readable room codes',
);
assert.deepEqual(
  parseRoomInvite('http://192.168.1.4:5173/?mode=lan&room=wx9yz8'),
  { roomCode: 'WX9YZ8', mode: 'lan', hostName: null },
  'LAN invite links preserve their deployment mode',
);
assert.deepEqual(
  parseRoomInvite('https://cot.example/?room=ABC234&host=Commander%20Kevin'),
  { roomCode: 'ABC234', mode: 'private', hostName: 'Commander Kevin' },
  'named invite links preserve the normalized host callsign',
);
assert.equal(parseRoomInvite('https://cot.example/?room=SHORT'), null);
assert.equal(parseRoomInvite('not a valid URL'), null);

assert.equal(
  createRoomInviteUrl({
    roomCode: 'abc234',
    hostName: '  Commander   Kevin  ',
    baseUrl: 'https://cot.example/garage?netSim=1#debug',
  }),
  'https://cot.example/garage?room=ABC234&host=Commander+Kevin',
  'private invites discard diagnostics and include the host callsign',
);
assert.equal(
  createRoomInviteUrl({
    roomCode: 'WX9YZ8',
    mode: 'lan',
    baseUrl: 'http://192.168.1.4:5173/',
  }),
  'http://192.168.1.4:5173/?room=WX9YZ8&mode=lan',
);
assert.equal(
  createRoomInviteUrl({
    roomCode: 'ABC234',
    hostName: '',
    baseUrl: 'https://cot.example/',
  }),
  'https://cot.example/?room=ABC234',
  'unnamed invites remain backward compatible',
);
assert.throws(() => createRoomInviteUrl({
  roomCode: 'bad',
  baseUrl: 'https://cot.example/',
}), /six-character/);

assert.equal(roomInviteTitle('Kevin'), 'Join Kevin’s Game');
assert.equal(roomInviteTitle(''), 'Join a Private Game');

console.log('roomInvite.selftest: named private and LAN invite links passed');
