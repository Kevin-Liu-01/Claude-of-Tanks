import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};

// Battles fought before medals existed: the battle record already holds twelve.
store.set('cot.profile.v2', JSON.stringify({ version: 2, matches: 12, wins: 6, losses: 6, draws: 0, kills: 30, damage: 40000, bestDamage: 5000, lastBattle: null }));

const { installBattleRecords } = await import('./profile.ts');
const {
  MEDALS, ACHIEVEMENTS, installServiceRecord, getServiceRecord, getLastBattleAwards,
  unseenAwardCount, markServiceRecordSeen,
} = await import('./serviceRecord.ts');

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
    emit(name, payload) { emitted.push([name, payload]); for (const fn of handlers.get(name) || []) fn(payload); },
  };
}

const teams = new Map([['me', 'player'], ['ally', 'player'], ['e1', 'enemy'], ['e2', 'enemy'], ['e3', 'enemy'], ['e4', 'enemy'], ['e5', 'enemy'], ['e6', 'enemy']]);
const world = { clock: 0, hp: 1, aerial: null, respawns: false, mode: 'standard', objective: null, spectator: false };
const ctx = {
  playerId: () => (world.spectator ? null : 'me'),
  playerTeam: () => 'player',
  teamOf: (id) => teams.get(id) ?? null,
  gameMode: () => world.mode,
  clockS: () => world.clock,
  playerHpFraction: () => world.hp,
  playerMaxHp: () => 2000,
  playerNation: () => 'Germany',
  playerAerialKind: () => world.aerial,
  respawns: () => world.respawns,
  playerObjectiveTeam: () => world.objective,
};
const bus = makeBus();
installBattleRecords(bus);
installServiceRecord(bus, ctx);
installServiceRecord(bus, ctx); // idempotent
const medalsLive = () => bus.emitted.filter(([name]) => name === 'service:medal').map(([, e]) => e.id);

// Catalogs: unique ids, three ascending tiers each, the reasoning set leads.
assert.equal(new Set(MEDALS.map((m) => m.id)).size, MEDALS.length);
assert.deepEqual(MEDALS.slice(0, 4).map((m) => m.id), ['chain_of_thought', 'step_by_step', 'zero_shot', 'few_shot']);
for (const a of ACHIEVEMENTS) assert.ok(a.tiers[0] < a.tiers[1] && a.tiers[1] < a.tiers[2], a.id);

// The first look reaches the tiers the old battle record already earns, and marks them new.
const seeded = getServiceRecord();
const veteran = seeded.achievements.find((a) => a.def.id === 'veteran');
assert.equal(veteran.tier, 1, 'twelve old battles reach Veteran I');
assert.equal(veteran.value, 12);
assert.equal(veteran.next, 50);
assert.equal(seeded.achievements.find((a) => a.def.id === 'damage_dealer').tier, 1);
assert.ok(seeded.unseen.includes('achievement:veteran:1'));
markServiceRecordSeen();
assert.equal(unseenAwardCount(), 0);

const fire = (shellId, caliberMm = 120) => bus.emit('shell:fired', { shooterId: 'me', shellId, caliberMm });
const hit = (shellId, targetId, damage, extra = {}) => bus.emit('shell:hit', { attackerId: 'me', targetId, shellId, damage, kind: 'pen', ...extra });
const kill = (id, extra = {}) => bus.emit('tank:destroyed', { id, killerId: 'me', specId: `spec-${id}`, cause: 'shot', ...extra });

// ---- Battle 1: a Chain of Thought (three kills, each within ten seconds), five rounds in a row on target.
bus.emit('ui:battleStart', { specId: 'leopard_2a7', mapId: 'desert' });
world.clock = 30; fire(1); hit(1, 'e1', 600);
world.clock = 36; fire(2); hit(2, 'e1', 1500, { destroyed: true, flightDistM: 420 }); kill('e1');
assert.deepEqual(medalsLive(), ['first_blood', 'long_shot'], 'first kill of the battle, from 420 m');
world.clock = 42; fire(3); hit(3, 'e2', 2100, { destroyed: true, flightDistM: 200 }); kill('e2');
assert.ok(medalsLive().includes('one_shot'), 'an undamaged enemy destroyed by one round');
assert.ok(!medalsLive().includes('chain_of_thought'), 'two kills are not yet a chain');
world.clock = 51; fire(4); hit(4, 'e3', 900);
world.clock = 52; fire(5); hit(5, 'e3', 1200, { destroyed: true, flightDistM: 150 }); kill('e3', { cause: 'ammorack' });
assert.ok(medalsLive().includes('chain_of_thought'), 'third kill 10 s after the second');
assert.ok(medalsLive().includes('detonator'));
assert.ok(medalsLive().includes('step_by_step'), 'five aimed rounds in a row on target');
assert.ok(medalsLive().includes('few_shot'), 'three kills on five rounds');
bus.emit('tank:spotted', { id: 'e4', team: 'enemy', spotterId: 'me' });
bus.emit('battle:ended', {
  result: 'victory', durationS: 180, mapId: 'desert', gameMode: 'standard',
  roster: [{ id: 'me', team: 'player', alive: true, isPlayer: true }, { id: 'ally', team: 'player', alive: false }],
});
const awards1 = getLastBattleAwards();
assert.ok(awards1.medals.includes('chain_of_thought'));
assert.ok(awards1.medals.includes('untouchable'), 'won, alive, no damage taken');
assert.ok(awards1.medals.includes('high_caliber'), 'top damage and at least own hit points');
assert.ok(!awards1.medals.includes('sharpshooter'), 'five aimed rounds are below the six-round floor');
assert.ok(awards1.medals.includes('last_stand'), 'the only ally fell and we won');
assert.ok(awards1.achievements.some((a) => a.id === 'chain_thinker' && a.tier === 1));
assert.equal(awards1.bestChain, 3);
const record1 = getServiceRecord();
assert.equal(record1.medals.chain_of_thought.count, 1);
assert.equal(record1.stats.bestChain, 3);
assert.equal(record1.stats.longestKillM, 420);
assert.equal(record1.history.length, 1);
assert.deepEqual(record1.history[0].trace.map((s) => s.t), [36, 42, 52]);
assert.equal(record1.history[0].trace[0].specId, 'spec-e1');
assert.equal(record1.history[0].hits, 5);
assert.ok(record1.unseen.includes('medal:chain_of_thought'));
assert.ok(unseenAwardCount() > 0);
assert.equal(record1.achievements.find((a) => a.def.id === 'veteran').value, 13, 'the battle record counted this battle too');
const live1 = new Set(medalsLive());
for (const id of ['untouchable', 'high_caliber', 'last_stand']) assert.ok(!live1.has(id), `${id} is judged at the end, not announced live`);

// ---- Battle 2: kills too far apart for a chain; a miss breaks the streak; zero damage blocks; close call.
bus.emitted.length = 0;
bus.emit('ui:battleStart', { specId: 'leopard_2a7', mapId: 'forest' });
world.clock = 10; bus.emit('tank:destroyed', { id: 'e1', killerId: 'ally', cause: 'shot' });
world.clock = 20; fire(11); hit(11, 'e2', 2000, { destroyed: true, flightDistM: 100 }); kill('e2');
world.clock = 31; fire(12); hit(12, 'e3', 2000, { destroyed: true, flightDistM: 100 }); kill('e3');
world.clock = 40; fire(13); // misses
world.clock = 50; fire(14); hit(14, 'e4', 300);
for (const caliberMm of [7.62,12.7,14.5]) for (let i=0;i<30;i++)
  bus.emit('shell:hit',{attackerId:'e4',targetId:'me',damage:0,kind:'ricochet',caliberMm});
assert.ok(!medalsLive().includes('steel_wall'),'90 machine-gun blocks cannot award Steel Wall');
for (let i = 0; i < 4; i++) bus.emit('shell:hit', { attackerId: 'e4', targetId: 'me', damage: 0, kind: 'ricochet',caliberMm:120 });
assert.ok(!medalsLive().includes('steel_wall'),'MG rounds cannot fill the fifth qualifying hit');
bus.emit('shell:hit',{attackerId:'e4',targetId:'me',damage:0,kind:'nonpen',caliberMm:150,guided:true});
bus.emit('shell:hit', { attackerId: 'e4', targetId: 'me', damage: 1900, targetHpAfter: 100, targetMaxHp: 2000, kind: 'pen' });
world.hp = 0.05;
assert.ok(!medalsLive().includes('first_blood'), 'someone else drew first blood');
assert.ok(!medalsLive().includes('chain_of_thought'), '11 s between kills breaks the chain');
assert.ok(medalsLive().includes('steel_wall'), 'five enemy rounds turned away');
bus.emit('battle:ended', { result: 'victory', durationS: 200, mapId: 'forest', gameMode: 'standard', roster: [{ id: 'me', team: 'player', alive: true, isPlayer: true }] });
const awards2 = getLastBattleAwards();
assert.ok(awards2.medals.includes('close_call'), 'won on 5 % hit points');
assert.ok(!awards2.medals.includes('untouchable'));
assert.ok(!awards2.medals.includes('step_by_step'), 'the miss at 40 s broke the streak at two');
assert.ok(!awards2.medals.includes('last_stand'), 'no allies to outlive');
assert.equal(getServiceRecord().history[0].bestChain, 1);

// ---- Battle 3: zero-shot (won without firing), a gunship ace, few-shot and Sharpshooter.
world.hp = 1;
bus.emitted.length = 0;
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
bus.emit('battle:ended', { result: 'victory', durationS: 240, mapId: 'desert', gameMode: 'standard', roster: [] });
assert.ok(getLastBattleAwards().medals.includes('zero_shot'));
world.aerial = 'gunship';
world.mode = 'ac130';
bus.emit('ui:battleStart', { specId: 'ac130', mapId: 'desert' });
world.clock = 5;
for (let i = 0; i < 5; i++) {
  const target = `e${i + 1}`;
  world.clock += 30;
  fire(100 + i, 105); hit(100 + i, target, 2500, { destroyed: true, flightDistM: 900 }); kill(target);
}
fire(110, 105); hit(110, 'e6', 100);
assert.ok(medalsLive().includes('gunship_ace'));
assert.ok(medalsLive().includes('few_shot'), 'three kills on three rounds');
bus.emit('battle:ended', { result: 'defeat', durationS: 300, mapId: 'desert', gameMode: 'ac130', roster: [] });
const awards3 = getLastBattleAwards();
assert.ok(awards3.medals.includes('sharpshooter'), 'six of six aimed rounds on target');
assert.ok(awards3.medals.includes('ace_gunner'));
assert.ok(!awards3.medals.includes('zero_shot'));
world.aerial = null;
world.mode = 'standard';

// ---- A dropped connection records nothing; a quit battle carries nothing into the next.
const before = getServiceRecord().stats.battles;
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
kill('e1');
bus.emit('battle:ended', { result: 'defeat', reason: 'network_disconnect' });
assert.equal(getServiceRecord().stats.battles, before);
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
world.clock = 1; kill('e1'); kill('e2');
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
world.clock = 2; kill('e3');
bus.emit('battle:ended', { result: 'draw', durationS: 30, mapId: 'desert', gameMode: 'standard', roster: [] });
assert.equal(getServiceRecord().history[0].kills, 1, 'the abandoned battle\'s kills stayed behind');

// ---- Mode medals come from the mode events: a capture is ours when we made it, a goal when it counts for our side.
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
bus.emitted.length = 0;
bus.emit('mode:flag_captured', { team: 'alpha', by: 'ally' });
bus.emit('mode:goal_scored', { team: 'bravo', by: 'me' });
assert.deepEqual(medalsLive(), [], 'an ally\'s capture and our own goal earn nothing');
bus.emit('mode:goal_scored', { team: 'alpha', by: 'me' });
bus.emit('mode:flag_captured', { team: 'alpha', by: 'me' });
assert.deepEqual(medalsLive(), ['striker', 'flag_runner']);
for (let i = 0; i < 5; i++) bus.emit('mode:wave_cleared', { wave: i + 1 });
assert.ok(medalsLive().includes('wave_breaker'));
bus.emit('battle:ended', { result: 'victory', durationS: 30, mapId: 'arctic', gameMode: 'turbo_ball', roster: [] });

// ---- A network bravo seat: its own team reads 'player'; the mode events carry the real side.
world.objective = 'bravo';
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
bus.emitted.length = 0;
bus.emit('mode:goal_scored', { team: 'alpha', by: 'me' });
assert.deepEqual(medalsLive(), [], 'a bravo seat\'s own goal (credited to alpha) earns nothing');
bus.emit('mode:goal_scored', { team: 'bravo', by: 'me' });
bus.emit('mode:flag_captured', { team: 'bravo', by: 'me' });
assert.deepEqual(medalsLive(), ['striker', 'flag_runner'], 'its real goal and capture count');
bus.emit('battle:ended', { result: 'defeat', durationS: 30, mapId: 'desert', gameMode: 'capture_the_flag', roster: [] });
world.objective = null;

// ---- A drone strike is not a fired round: no Zero-Shot or Few-Shot from the air.
world.aerial = 'drone';
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
bus.emitted.length = 0;
world.clock = 10; kill('e1'); world.clock = 40; kill('e2'); world.clock = 70; kill('e3');
assert.ok(medalsLive().includes('drone_ace'));
assert.ok(!medalsLive().includes('few_shot'), 'three drone kills on no rounds are not few-shot');
bus.emit('battle:ended', { result: 'victory', durationS: 200, mapId: 'desert', gameMode: 'drone', roster: [] });
assert.ok(!getLastBattleAwards().medals.includes('zero_shot'), 'a drone win is not zero-shot');
world.aerial = null;

// ---- Zero-Shot needs us alive at the end, not just the bots' win.
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
world.clock = 5; bus.emit('tank:destroyed', { id: 'me', killerId: 'e1', cause: 'shot' });
bus.emit('battle:ended', { result: 'victory', durationS: 200, mapId: 'desert', gameMode: 'standard', roster: [{ id: 'me', team: 'player', alive: false, isPlayer: true }] });
assert.ok(!getLastBattleAwards().medals.includes('zero_shot'));

// ---- A spectator records nothing.
{
  const battles = getServiceRecord().stats.battles;
  world.spectator = true;
  bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
  bus.emit('battle:ended', { result: 'draw', durationS: 300, mapId: 'desert', gameMode: 'standard', roster: [{ id: 'p2', team: 'player', alive: true }] });
  world.spectator = false;
  bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
  bus.emit('battle:ended', { result: 'draw', durationS: 300, mapId: 'desert', gameMode: 'standard', roster: [{ id: 'p2', team: 'player', alive: true }] });
  assert.equal(getServiceRecord().stats.battles, battles, 'no row of ours in the roster: we only watched');
}

// ---- A quit drops what the battle tracked; a debug start (no garage battle start) begins afresh.
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
bus.emit('phase:change', { phase: 'battle' });
world.clock = 5; kill('e1'); world.clock = 8; kill('e2');
bus.emit('phase:change', { phase: 'garage' });
bus.emit('phase:change', { phase: 'battle' });
world.clock = 2; kill('e3');
bus.emit('battle:ended', { result: 'draw', durationS: 40, mapId: 'desert', gameMode: 'standard', roster: [] });
assert.equal(getServiceRecord().history[0].kills, 1, 'the quit battle\'s kills stayed behind');
assert.equal(getServiceRecord().history[0].bestChain, 1, 'and its last kill time did not chain into the new clock');

// ---- First Blood is the first hostile kill: our team kill is not it.
bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
bus.emitted.length = 0;
world.clock = 3; bus.emit('tank:destroyed', { id: 'ally', killerId: 'me', cause: 'shot' });
assert.ok(!medalsLive().includes('first_blood'));
world.clock = 9; kill('e1');
assert.ok(medalsLive().includes('first_blood'), 'the first enemy destroyed is still first blood');

// ---- A respawned enemy starts a new life: undamaged again for One Shot, no stale killing shot.
world.respawns = true;
fire(9001); hit(9001, 'e2', 500);
bus.emit('mode:respawn', { id: 'e2' });
bus.emitted.length = 0;
world.clock = 20; fire(9002); hit(9002, 'e2', 2400, { destroyed: true, flightDistM: 120 }); kill('e2');
assert.ok(medalsLive().includes('one_shot'), 'the new life fell to one round');
bus.emit('mode:respawn', { id: 'e2' });
world.clock = 40; kill('e2', { cause: 'ram' });
assert.equal(getServiceRecord().history.length > 0, true);
// ---- Untouched means full health at the end too (a ram leaves its mark there, not in the shell ledger).
world.hp = 0.6;
bus.emit('battle:ended', { result: 'victory', durationS: 60, mapId: 'desert', gameMode: 'capture_the_flag', roster: [] });
assert.ok(!getLastBattleAwards().medals.includes('untouchable'), 'rammed to 60 % without a shell is not untouchable');
assert.equal(getServiceRecord().history[0].trace.at(-1).distM, 0, 'the ram kill of the respawned enemy carries no stale shot distance');
world.hp = 1;
world.respawns = false;

// ---- Persistence: counts, history cap, corrupt data.
const record = getServiceRecord();
assert.ok(record.history.length <= 25);
assert.ok(record.medalsEarned >= 15);
assert.ok(record.tiersReached >= 3);
const saved = JSON.parse(store.get('cot.service.v1'));
assert.equal(saved.version, 1);
assert.ok(saved.modes.includes('ac130') && saved.modes.includes('turbo_ball'));
assert.deepEqual(saved.nations, ['Germany']);
markServiceRecordSeen();
assert.equal(unseenAwardCount(), 0);
assert.deepEqual(JSON.parse(store.get('cot.service.v1')).unseen, []);
for (let i = 0; i < 30; i++) {
  bus.emit('ui:battleStart', { specId: 'm1a2', mapId: 'desert' });
  bus.emit('battle:ended', { result: 'defeat', durationS: 10, mapId: 'desert', gameMode: 'standard', roster: [] });
}
assert.equal(getServiceRecord().history.length, 25, 'the history keeps the latest 25 battles');

// A fresh module instance reads corrupt or hostile storage without throwing.
store.set('cot.service.v1', JSON.stringify({ version: 1, stats: { battles: -4, kills: 'x' }, medals: { nope: { count: 3 }, first_blood: { count: 2.6 } }, history: [{ result: 'win', medals: ['first_blood', 'bogus'], trace: 'x' }], unseen: [1, 'medal:first_blood', 'medal:nope', 'achievement:veteran:4', 'achievement:veteran:2', 'medal:first_blood:1', 'random'] }));
const fresh = await import('./serviceRecord.ts?corrupt');
const view = fresh.getServiceRecord();
assert.equal(view.stats.battles, 0);
assert.deepEqual(Object.keys(view.medals), ['first_blood']);
assert.equal(view.medals.first_blood.count, 3);
assert.equal(view.history[0].result, 'defeat');
assert.deepEqual(view.history[0].medals, ['first_blood']);
assert.deepEqual(view.unseen, ['medal:first_blood', 'achievement:veteran:2'], 'only real award keys survive');

console.log('serviceRecord selftest: ok');
