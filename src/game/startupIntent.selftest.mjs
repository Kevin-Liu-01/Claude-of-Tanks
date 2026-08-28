import assert from 'node:assert/strict';
import { createStartupIntent } from './startupIntent.ts';

let inviteLoads = 0;
const loadInvite = async () => {
  inviteLoads += 1;
  return { parseRoomInvite: (href) => ({ roomCode: new URL(href).searchParams.get('room') }) };
};

const garage = createStartupIntent({
  href: 'https://cot.example/', pathname: '/', search: '',
}, loadInvite);
assert.equal(garage.studioRequested, false);
assert.equal(garage.studioMapId, 'verdant');
assert.equal(garage.pendingRoomInvite, null);
assert.equal(inviteLoads, 0, 'ordinary boot must not load invite parsing');

const studio = createStartupIntent({
  href: 'https://cot.example/studio?map=steppe',
  pathname: '/studio',
  search: '?map=steppe',
}, loadInvite);
assert.equal(studio.studioRequested, true);
assert.equal(studio.studioMapId, 'steppe');

const invited = createStartupIntent({
  href: 'https://cot.example/?room=ABC123',
  pathname: '/',
  search: '?room=ABC123',
}, loadInvite);
assert.deepEqual(await invited.pendingRoomInvite, { roomCode: 'ABC123' });
assert.equal(inviteLoads, 1);

console.log('startupIntent.selftest: garage, Studio, and lazy invite intents passed');
