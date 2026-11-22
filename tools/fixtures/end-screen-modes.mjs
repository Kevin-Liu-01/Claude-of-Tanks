// End screen by mode (endscreen-modes-275): one scripted battle per game mode, replayed through the real bookkeeper
// (shotInfo.ts: rosters, kills, the final blow, the timeline) into the real end screen, so a capture of every mode shows
// what a player sees. The events are the bus's own (shell:fired / shell:hit / tank:destroyed / tank:spotted, the mode's
// objective and strike events, battle:ended with the drivers' roster and mode report). No simulation, no WebGL.
//   ?mode=<game mode id>   ?variant=couch|room   ?result=victory|defeat|draw   ?locale=zh-CN
import '../../src/ui/tokens/tokens.css';
import '../../src/ui/components/components.css';
import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import '../../src/ui/endScreenPresentation.css';
import '../../src/ui/richTooltip.css';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { createShotInfo } from '../../src/ui/shotInfo.ts';
import { createEndOverlayRuntime } from '../../src/ui/endOverlayRuntime.ts';
import { setLocale } from '../../src/ui/i18n.ts';
import { zhTypeFloorStyle } from '../../src/ui/zhTypeFloor.ts';
import { getSpec } from '../../src/vehicles/specs.ts';

const q = new URLSearchParams(location.search);
await setLocale(q.get('locale') || 'en-US');
if (document.documentElement.lang === 'zh-CN') document.head.insertAdjacentHTML('beforeend', zhTypeFloorStyle('game'));
installResponsiveLayout();

const MODE = q.get('mode') || 'standard';
const VARIANT = q.get('variant') || '';
const RESULT = q.get('result') || 'victory';
const MAPS = {
  standard: 'verdant', capture_the_flag: 'desert', zone_control: 'urban', turbo_ball: 'airfield', endless_horde: 'winter',
  frontline_assault: 'verdant', mars: 'mars', juggernaut: 'railyard', infected: 'autumn', realistic: 'alpine', gun_game: 'badlands',
  drone: 'foundry', ac130: 'desert', air_support: 'urban', proving_ground: 'verdant', training: 'verdant',
};

// one shell per vehicle, its designation and type as the specs name them
const GUN = {
  m1a1_abrams_hc: ['M829A1 APFSDS', 'APFSDS', 120], t90am: ['3BM60 Svinets-2 APFSDS', 'APFSDS', 125],
  leo2a4_v: ['DM53 APFSDS', 'APFSDS', 120], type90: ['JM33 APFSDS', 'APFSDS', 120],
  c1_ariete_proto_serie1: ['CL3143 APFSDS', 'APFSDS', 120], t72b3: ['3BM42 Mango APFSDS', 'APFSDS', 125], bmp2: ['3UBR6 APDS', 'AP', 30],
};
const ALLY_SPECS = ['m1a1_abrams_hc', 'leo2a4_v', 'type90', 'leo2a4_v', 'm1a1_abrams_hc', 'bmp2', 'type90'];
const ENEMY_SPECS = ['t90am', 'c1_ariete_proto_serie1', 't72b3', 't90am', 'c1_ariete_proto_serie1', 't72b3', 'bmp2'];
const GUNSHIP = { autocannon: ['30 mm Autocannon', 'AP', 30], howitzer: ['152 mm Howitzer', 'HE', 152] };

const bus = createBus();
createEndOverlayRuntime({ bus, onReturnToGarage: () => { window.__RETURNED = true; } });
const shot = createShotInfo(bus, document.body);
const players = [];
const team = new Map();
const add = (id, specId, side, extra = {}) => { players.push({ id, specId, team: side, ...extra }); team.set(id, side); };

const pilot = MODE === 'ac130';
add('me', pilot ? 'm1a1_abrams_hc' : 'm1a1_abrams_hc', 'player', pilot ? { aircraft: true } : {});
ALLY_SPECS.slice(1).forEach((spec, i) => add(`ally-${i}`, spec, 'player', VARIANT === 'room' && i < 2 ? { name: ['Kestrel_77', 'Nightjar'][i] } : {}));
ENEMY_SPECS.forEach((spec, i) => add(`foe-${i}`, spec, 'enemy', VARIANT === 'room' && i < 3 ? { name: ['Vostok', 'Ironclad', 'Sable'][i] } : {}));
if (VARIANT === 'couch') { players[1].name = 'Player 2'; players[1].couchSeat = 2; }
shot.setTeamResolver((id) => team.get(id));
shot.setPlayer('me', 0, 'me');

let shellId = 0;
const nameOf = (id) => players.find((p) => p.id === id)?.name;
const specOf = (id) => players.find((p) => p.id === id)?.specId;
function fire(shooter, t) { bus.emit('shell:fired', { shellId: ++shellId, shooterId: shooter, isPlayer: shooter === 'me', timeS: t }); return shellId; }
function hit(attacker, target, t, damage, { destroyed = false, source = null, gun = null, kind = 'pen', zone = 'hull_front', distM = 640, blocked = false } = {}) {
  const [shellName, shellType, caliberMm] = gun ?? GUN[specOf(attacker)] ?? GUN.t90am;
  const id = fire(attacker, t - 0.4);
  bus.emit('shell:hit', {
    shellId: id, kind: blocked ? 'nopen' : kind, attackerId: attacker, attackerSpecId: specOf(attacker), attackerName: nameOf(attacker) ?? null,
    attackerSource: source, targetId: target, targetSpecId: specOf(target), targetName: nameOf(target) ?? null, damage: blocked ? 0 : damage,
    shellType, shellName, caliberMm, flightDistM: distM, zone, timeS: t, destroyed, effectiveMm: 540, nominalMm: 600, impactAngleDeg: 24,
  });
  if (destroyed) {
    bus.emit('tank:destroyed', { id: target, killerId: attacker, specId: specOf(target), cause: 'shot', source, timeS: t });
    players.find((p) => p.id === target).dead = true;
  }
}
const spot = (id, t) => bus.emit('tank:spotted', { id, team: 'enemy', spotterId: 'me', timeS: t });

// --- the battle: every mode's common exchange, then the mode's own moments --------------------------------------------
const gunship = pilot;
const myGun = gunship ? GUNSHIP.autocannon : null;
spot('foe-0', 22); spot('foe-1', 41); spot('foe-2', 66);
hit('foe-1', 'me', 48, 0, { blocked: true }); hit('foe-1', 'me', 52, 0, { blocked: true });
hit('me', 'foe-0', 74, 640, { gun: myGun, source: gunship ? 'ac130' : null });
hit('me', 'foe-0', 96, 980, { destroyed: true, gun: myGun, source: gunship ? 'ac130' : null, zone: 'turret_front' });
hit('ally-0', 'foe-2', 120, 1100, { destroyed: true });
hit('foe-3', 'ally-2', 150, 1200, { destroyed: true });
hit('me', 'foe-1', 188, 1340, { destroyed: true, gun: gunship ? GUNSHIP.howitzer : null, source: gunship ? 'ac130' : null, zone: 'hull_side', distM: 1180 });
hit('foe-4', 'me', 214, 420, { zone: 'hull_rear' });
hit('ally-3', 'foe-5', 260, 900, { destroyed: true });

const modeReport = { id: MODE, perspectiveTeam: 'alpha' };
const ended = { result: RESULT, reason: 'elimination', gameMode: MODE, map: MAPS[MODE], mapId: MAPS[MODE], timeS: 424, durationS: 424 };
const objective = (type, side, extra = {}) => bus.emit(type, { team: side, ...extra });
switch (MODE) {
  case 'capture_the_flag':
    objective('mode:flag_taken', 'alpha', { carrierId: 'me' }); objective('mode:flag_captured', 'alpha', { carrierId: 'me', timeS: 300 });
    objective('mode:flag_captured', 'bravo', { timeS: 340 }); objective('mode:flag_captured', 'alpha', { carrierId: 'ally-0', timeS: 390 });
    Object.assign(ended, { reason: 'flag_limit' }); modeReport.score = { alpha: 3, bravo: 1 }; modeReport.target = 3; break;
  case 'zone_control': case 'mars': case 'air_support':
    objective('mode:zone_captured', 'alpha', { zoneId: 'A', capturerIds: ['me'] }); objective('mode:zone_captured', 'bravo', { zoneId: 'C' });
    objective('mode:zone_captured', 'alpha', { zoneId: 'B', capturerIds: ['me', 'ally-0'] });
    Object.assign(ended, { reason: 'score_limit' }); modeReport.score = { alpha: 1000, bravo: 640 }; modeReport.target = 1000; break;
  case 'turbo_ball':
    objective('mode:goal_scored', 'alpha', { scorerId: 'me' }); objective('mode:goal_scored', 'bravo', {}); objective('mode:goal_scored', 'alpha', { scorerId: 'ally-1' });
    Object.assign(ended, { reason: 'goal_limit' }); modeReport.score = { alpha: 5, bravo: 3 }; modeReport.target = 5; break;
  case 'endless_horde':
    Object.assign(ended, { result: 'defeat', reason: 'elimination', hordeWave: 7 }); modeReport.horde = { wave: 7 }; break;
  case 'frontline_assault':
    Object.assign(ended, { reason: 'line_held', line: { index: 3, total: 3, holdS: 0 } }); modeReport.line = { index: 3, total: 3 }; break;
  case 'juggernaut':
    Object.assign(ended, { reason: 'boss_destroyed' }); modeReport.boss = { isPlayer: false, specId: 't90am' }; break;
  case 'infected':
    Object.assign(ended, { reason: 'survivors_extracted' }); modeReport.infection = { survivors: 4, infected: 10, playerInfected: false }; break;
  case 'gun_game':
    Object.assign(ended, { reason: 'weapon_complete' }); modeReport.weaponStage = { index: 5, total: 5, name: 'Final weapon' }; break;
  case 'drone':
    hit('me', 'foe-6', 330, 1500, { destroyed: true, source: 'drone', gun: ['FPV shaped charge', 'HEAT', 90] }); break;
  case 'ac130':
    Object.assign(ended, { reason: 'escort_extracted' }); modeReport.escort = { total: 6, rescued: 4, required: 3, alive: 4 }; break;
  default: break;
}
if (MODE === 'air_support') {
  // the player's call-ins and their kills (the AC-130 orbit is a strike here: its hits carry the gunship's source)
  for (const [i, kind] of ['recon', 'strafe', 'gunship'].entries()) bus.emit('mode:strike_called', { strikeId: 40 + i, kind, team: 'alpha', callerId: 'me', timeS: 140 + i * 90 });
  hit('me', 'foe-3', 245, 900, { destroyed: true, source: 'strafe', gun: ['30 mm GAU-8', 'AP', 30] });
  hit('me', 'foe-4', 330, 1400, { destroyed: true, source: 'ac130', gun: GUNSHIP.howitzer });
  bus.emit('mode:aircraft_down', { strikeId: 77, kind: 'strafe', team: 'bravo', by: 'me', x: 0, y: 120, z: 0 });
}
if (MODE === 'realistic') hit('me', 'foe-6', 360, 0, { kind: 'pen' });
// the last blow: the enemy's on the player in a defeat, the player's otherwise
if (ended.result === 'defeat') hit('foe-1', 'me', 418, 1500, { destroyed: true, zone: 'turret_front' });
else hit('foe-1', 'ally-4', 418, 1500, { destroyed: true });
modeReport.score ??= null;

const roster = players.map((p) => ({
  // as each driver sends it: the solo sim's vehicle is the spec's name (state.ts), a room's the display name or the spec's
  id: p.id, specId: p.specId, vehicle: (VARIANT === 'room' && p.name) || getSpec(p.specId).name,
  ...(VARIANT === 'room' ? { name: p.name || getSpec(p.specId).name } : {}), ...(p.name ? { displayName: p.name } : {}),
  ...(p.aircraft ? { aircraft: true } : {}), ...(p.couchSeat ? { couchSeat: p.couchSeat } : {}),
  team: p.team === 'player' ? 'player' : 'enemy', alive: !p.dead, isPlayer: p.id === 'me',
}));
if (VARIANT === 'couch') ended.couch = true;
if (VARIANT === 'room') {
  ended.network = true;
  bus.emit('network:roomState', { role: 'host', playerId: 'me', state: { phase: 'waiting', round: 2, roomCode: 'TANK42', mode: 'private', gameMode: MODE, hostId: 'me',
    players: [{ id: 'me', name: 'Claude', specId: 'm1a1_abrams_hc', team: 'alpha', ready: false, connected: true },
      { id: 'ally-0', name: 'Kestrel_77', specId: 'leo2a4_v', team: 'alpha', ready: true, connected: true },
      { id: 'foe-0', name: 'Vostok', specId: 't90am', team: 'bravo', ready: true, connected: true }] } });
}
bus.emit('battle:ended', { ...ended, roster, modeReport });
window.__MODE_REPORT = { mode: MODE, variant: VARIANT, result: ended.result };
