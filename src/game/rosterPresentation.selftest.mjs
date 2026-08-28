import assert from 'node:assert/strict';
import { createRosterPresentation } from './rosterPresentation.ts';

const presentation = createRosterPresentation({
  getVehicleName: (id) => id === 'm1a2' ? 'M1A2 Abrams' : null,
  getTier: (id) => id === 'm1a2' ? 'X' : 'IX',
});

assert.deepEqual(presentation.lobbyRows({ players: [
  { id: 'viewer', team: 'alpha', specId: 'm1a2', name: 'Ignored callsign' },
  { id: 'wing', team: 'alpha', specId: 't90m', name: 'T-90M fallback' },
  { id: 'enemy', team: 'bravo', specId: 'leclerc' },
  { id: 'spectator', team: 'alpha' },
] }, 'alpha', 'viewer'), [
  { id: 'm1a2', name: 'M1A2 Abrams', tier: 'X', isPlayer: true },
  { id: 't90m', name: 'T-90M fallback', tier: 'IX', isPlayer: false },
], 'lobby rows use vehicle names, exclude other teams and ignore empty selections');

assert.deepEqual(presentation.battleRows([
  { specId: 't90m', team: 'player', spec: { name: 'T-90M' } },
  { specId: 'm1a2', team: 'player', spec: { name: 'M1A2 Abrams' }, isPlayer: true },
  { specId: 'leclerc', team: 'enemy', spec: { name: 'Leclerc' } },
], 'player'), [
  { id: 'm1a2', name: 'M1A2 Abrams', tier: 'X', isPlayer: true },
  { id: 't90m', name: 'T-90M', tier: 'IX', isPlayer: false },
], 'local roster puts the human first without changing teammate order');

console.log('rosterPresentation.selftest: lobby/local naming and player order passed');
