import assert from 'node:assert/strict';
import {matchRulesetFor,normalizeTeamArrangement,hordeWaveSize} from './matchRuleset.ts';
import {createMatchModeController} from './matchModes.ts';
import {createLobby,applyLobbyCommand,serializeLobby,readSerializedLobby} from '../net/lobby.ts';
import {defaultRoomSettings} from '../mp/room/roomPolicy.ts';
import {writeTeamArrangement,readTeamArrangement} from '../game/teamArrangement.ts';
const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
for(const [mode,input] of Object.entries({capture_the_flag:{scoreTarget:5,respawnS:10},zone_control:{scoreTarget:1500,respawnS:3},turbo_ball:{scoreTarget:7,respawnS:2},endless_horde:{waveSize:4,waveStep:2},frontline_assault:{holdS:45},mars:{marsGravity:'moon',marsCaches:'frequent',scoreTarget:500}})){
  writeTeamArrangement(mode,input,storage);const saved=readTeamArrangement(mode,storage);
  const rules=matchRulesetFor(mode,null,saved);
  const lobby=createLobby({roomCode:'ABC123',hostId:'host',hostName:'Host',gameMode:mode,arrangement:input});
  assert.deepEqual(lobby.arrangement,saved,`${mode}: host creation carries configured rules`);
  applyLobbyCommand(lobby,'host',{type:'set_arrangement',arrangement:input});
  assert.deepEqual(readSerializedLobby(serializeLobby(lobby)).arrangement,saved,`${mode}: legacy room roundtrip`);
  assert.deepEqual(defaultRoomSettings({gameMode:mode,arrangement:input}).arrangement,saved,`${mode}: v2 room boundary`);
  if(input.scoreTarget){
    const controller=createMatchModeController({mode,ruleset:rules,entities:[{id:'a',team:'alpha',state:{pos:{x:0,y:0,z:0}},combat:{destroyed:false}}],revive:()=>{}});
    assert.equal(controller.state.target,input.scoreTarget,`${mode}: objective controller consumes selected target`);
  }
  if(input.respawnS)assert.equal(rules.respawnS,input.respawnS);
  if(input.holdS)assert.equal(rules.assault.holdS,45);
  if(input.waveStep)assert.equal(hordeWaveSize(rules.horde,2),6);
}
assert.equal(readTeamArrangement('capture_the_flag',storage).scoreTarget,5,'configuring another mode keeps CTF choices');
assert.equal(normalizeTeamArrangement('standard',{scoreTarget:10,holdS:30}),null,'irrelevant mode fields discarded');
assert.equal(normalizeTeamArrangement('zone_control',{scoreTarget:Infinity}),null);
assert.equal(normalizeTeamArrangement('turbo_ball',{scoreTarget:1000}).scoreTarget,15);
assert.equal(matchRulesetFor('frontline_assault',{difficulty:1},{holdS:60}).assault.holdS,20,'campaign challenge cannot be overridden');
console.log('modeConfiguration: persistence, room boundaries, live objective targets and mode-specific limits passed');
