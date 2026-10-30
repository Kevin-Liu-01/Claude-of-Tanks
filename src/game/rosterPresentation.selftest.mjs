import assert from 'node:assert/strict';
import { createRosterPresentation } from './rosterPresentation.ts';
import { rosterCallsigns } from '../ui/botCallsigns.ts';

const presentation = createRosterPresentation({
  getVehicleName: (id) => id === 'm1a1_abrams_hc' ? 'M1A2 Abrams' : null,
  getTier: (id) => id === 'm1a1_abrams_hc' ? 'X' : 'IX',
  getNation: (id) => id === 't90am' ? 'Russia' : null,
});

assert.deepEqual(presentation.lobbyRows({ players: [
  { id: 'viewer', team: 'alpha', specId: 'm1a1_abrams_hc', name: 'Ignored callsign' },
  { id: 'wing', team: 'alpha', specId: 't90am', name: 'T-90M fallback' },
  { id: 'enemy', team: 'bravo', specId: 'leclerc_s2' },
  { id: 'spectator', team: 'alpha' },
] }, 'alpha', 'viewer'), [
  { id: 'm1a1_abrams_hc', name: 'M1A2 Abrams', tier: 'X', isPlayer: true },
  { id: 't90am', name: 'T-90M fallback', tier: 'IX', isPlayer: false, callsign: 'T-90M fallback', nation: 'Russia' },
], 'lobby rows use vehicle names, carry a room player\'s name and nation, exclude other teams and ignore empty selections');

const battle = [
  { id: 'bot-1', specId: 't90am', team: 'player', spec: { id: 't90am', name: 'T-90M', nation: 'Russia' } },
  { id: 'me', specId: 'm1a1_abrams_hc', team: 'player', spec: { id: 'm1a1_abrams_hc', name: 'M1A2 Abrams', nation: 'USA' }, isPlayer: true },
  { id: 'bot-2', specId: 'leclerc_s2', team: 'enemy', spec: { id: 'leclerc_s2', name: 'Leclerc', nation: 'France' } },
  { id: 'named', specId: 't90am', team: 'player', spec: { id: 't90am', name: 'T-90M', nation: 'Russia' }, displayName: 'Kestrel' },
];
// the bots' callsigns are the HUD's (botCallsigns.ts over the battle's tanks in their order, every side included)
const callsigns = rosterCallsigns(battle.map((tank) => ({ id: tank.id, specId: tank.spec.id, displayName: tank.displayName, isPlayer: tank.isPlayer })));
assert.deepEqual(presentation.battleRows(battle, 'player'), [
  { id: 'm1a1_abrams_hc', name: 'M1A2 Abrams', tier: 'X', isPlayer: true, nation: 'USA' },
  { id: 't90am', name: 'T-90M', tier: 'IX', isPlayer: false, callsign: callsigns.get('bot-1'), nation: 'Russia' },
  { id: 't90am', name: 'T-90M', tier: 'IX', isPlayer: false, callsign: 'Kestrel', nation: 'Russia' },
], 'local roster puts the human first without changing teammate order; bots carry the HUD\'s callsigns, named tanks their names');
assert.ok(callsigns.get('bot-1') && callsigns.get('bot-2') && callsigns.get('bot-1') !== callsigns.get('bot-2'), 'two bots, two callsigns');
// the same callsigns by seat id for a sortie on the solo sim Worker (soloSimSortie takes them from the page: its lazy
// module shares no chunk with the boot's)
assert.deepEqual(presentation.seatCallsigns(battle), callsigns, 'the seats\' callsigns are the card\'s');
{
  const { readFileSync } = await import('node:fs');
  const sortie = readFileSync(new URL('./soloSimSortie.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sortie, /botCallsigns/, 'the sortie\'s lazy module never imports the callsigns (a boot chunk would split)');
}

console.log('rosterPresentation.selftest: lobby/local naming, player order and the seats\' callsigns passed');

// (ac130-fx-228) an aircraft row is named by its renderer (ui/killSourceIdentity.ts, through battleLoad.ts)
const aircraftRow = {id:'ac130',name:'',tier:'',kind:'aircraft',isPlayer:true};
assert.deepEqual(presentation.battleRows([
 {specId:'m1a1_abrams_hc',team:'player',isPlayer:true,aerial:{kind:'gunship'}},
 {specId:'t90am',team:'player',spec:{name:'T-90M'}},
], 'player'), [aircraftRow,{id:'t90am',name:'T-90M',tier:'IX',isPlayer:false,callsign:rosterCallsigns([{id:'m1a1_abrams_hc',specId:null,isPlayer:true},{id:'t90am',specId:'t90am'}]).get('t90am')}]);
assert.deepEqual(presentation.lobbyRows({gameMode:'ac130',players:[
 {id:'viewer',specId:'m1a1_abrams_hc',team:'alpha'},
 {id:'escort',specId:'t90am',team:'alpha',bot:true},
]}, 'alpha', 'viewer'), [aircraftRow,{id:'t90am',name:'t90am',tier:'IX',isPlayer:false,nation:'Russia'}]);
