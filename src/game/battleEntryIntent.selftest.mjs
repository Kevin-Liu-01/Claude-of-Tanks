// 2026-11-02 audit F2: the solo entry's intent. main's ensureWorld took `opts?.terrainVariant ?? pendingTerrainVariant`
// and the network loader omitted the variant for a standard room, so a stale solo Frontline (trench) choice could carve
// trenches into a standard room's world; and the watched flag was set only by the Garage path, so a Play-menu battle
// after a watched one replayed a Watch on Battle Again. Runs main's actual ensureWorld and network loadWorld adapter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as battleEntryIntentModule from './battleEntryIntent.ts';

const { createBattleEntryIntent, replayBattleEntry } = battleEntryIntentModule;

// The owner: every entry replaces the whole record; an explicit request wins, null included.
{
  const intent = createBattleEntryIntent();
  intent.begin({ terrainVariant: 'assault-trenches', campaignOperationId: 'op-3', watched: true });
  assert.equal(intent.resolveTerrainVariant(undefined, true), 'assault-trenches', 'a solo battle build takes its mode');
  assert.equal(intent.resolveTerrainVariant(undefined, false), null, 'a Studio or capture build never does');
  assert.equal(intent.resolveTerrainVariant(null, true), null, "a room's explicit standard battlefield wins");
  intent.begin({ terrainVariant: null, campaignOperationId: null, watched: false });
  assert.deepEqual([intent.terrainVariant, intent.campaignOperationId, intent.watched], [null, null, false],
    'a menu start after a watched Garage battle is not watched');
  intent.begin({ terrainVariant: 'assault-trenches', campaignOperationId: '', watched: 1 });
  assert.deepEqual([intent.campaignOperationId, intent.watched], [null, false], 'only real values are kept');
  intent.clear();
  assert.equal(intent.terrainVariant, null);
}

// (round 8 Y4 s3-04) A couch entry is part of the record: a couch begin keeps its sides, every other begin clears them,
// so Battle Again after a couch battle replays a couch battle (before: the record had no couch, and the rematch was a
// keyboard battle that dropped the phones), and one after a later solo battle does not.
{
  const intent = createBattleEntryIntent();
  intent.begin({ terrainVariant: null, campaignOperationId: null, watched: false, couch: { sides: 'teams', seats: [1, 2] } });
  assert.deepEqual(intent.couch, { sides: 'teams', view: 'split' }, 'a couch begin keeps its sides, and its screen split when unsaid (the seats are read again at a replay)');
  intent.begin({ terrainVariant: null, campaignOperationId: null, watched: false, couch: { sides: 'together', view: 'shared' } });
  assert.deepEqual(intent.couch, { sides: 'together', view: 'shared' }, 'couch-panes-272: the shared camera is kept');
  intent.begin({ terrainVariant: null, campaignOperationId: null, watched: false, couch: null });
  assert.equal(intent.couch, null, 'a solo begin clears the couch');
  intent.begin({ terrainVariant: null, campaignOperationId: null, watched: false, couch: { sides: 'sideways' } });
  assert.equal(intent.couch, null, 'only real sides are kept');
  intent.begin({ terrainVariant: null, campaignOperationId: null, watched: false, couch: { sides: 'together' } });
  intent.clear();
  assert.equal(intent.couch, null);
}

// Battle Again's replay by the entry's kind (replayBattleEntry): never a button click.
{
  assert.equal(typeof replayBattleEntry, 'function', 'one replay rule for Battle Again (before: a click on .cot-battle)');
  const run = ({ intent, seats = [], startRefused = false, replayRefused = false, lobbyOpens = true, runtime = true }) => {
    const calls = [];
    const outcome = replayBattleEntry(intent, {
      replay: (entry) => { calls.push(['replay', entry]); return !replayRefused; },
      couch: () => (runtime ? {
        seatsInPlay: () => [...seats],
        startBattle: (launch) => { calls.push(['closeJoins']); return startRefused ? false : launch(seats); },
      } : null),
      openCouchLobby: () => { calls.push(['lobby']); return lobbyOpens; },
      seatName: (seat) => `Seat ${seat}`,
    });
    return { outcome, calls };
  };
  const solo = run({ intent: { watched: false, couch: null } });
  assert.deepEqual([solo.outcome, solo.calls], ['started', [['replay', { watch: false, couch: null }]]], 'a solo battle: BATTLE');
  const watched = run({ intent: { watched: true, couch: null } });
  assert.deepEqual(watched.calls, [['replay', { watch: true, couch: null }]], 'a watched battle is watched again');
  const couch = run({ intent: { watched: false, couch: { sides: 'teams', view: 'split' } }, seats: [1, 3] });
  assert.equal(couch.outcome, 'started');
  assert.deepEqual(couch.calls, [['closeJoins'], ['replay', { watch: false,
    couch: { seats: [1, 3], sides: 'teams', view: 'split', names: ['Seat 1', 'Seat 3'] } }]],
  'a couch battle starts again with the phones here now, its join window closed first');
  const empty = run({ intent: { watched: false, couch: { sides: 'together' } }, seats: [] });
  assert.deepEqual([empty.outcome, empty.calls], ['lobby', [['lobby']]], 'no phone here: the couch lobby, never a keyboard battle');
  const cold = run({ intent: { watched: false, couch: { sides: 'together' } }, runtime: false });
  assert.deepEqual([cold.outcome, cold.calls], ['lobby', [['lobby']]]);
  assert.equal(run({ intent: { watched: false, couch: { sides: 'together' } }, lobbyOpens: false }).outcome, 'unavailable');
  assert.equal(run({ intent: { watched: false, couch: null }, replayRefused: true }).outcome, 'unavailable');
  assert.equal(run({ intent: { watched: false, couch: { sides: 'together' } }, seats: [2], replayRefused: true }).outcome, 'unavailable');
}

// main's actual adapters: a solo Frontline sortie, then a standard network room.
{
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const ensureSource = main.match(/\nfunction ensureWorld\([\s\S]*?\n\}\n/)?.[0];
  const loadWorldSource = main.match(/loadWorld: (\(mapId: string, onProgress[\s\S]*?\n {10}\)),\n/)?.[1];
  assert.ok(ensureSource && loadWorldSource, "exercise main's actual ensureWorld and network loadWorld");
  const code = `${stripTypeScriptTypes(`${ensureSource}\nconst loadWorld = ${loadWorldSource};`)}\nreturn { ensureWorld, loadWorld };`;
  const builds = [];
  const worldRuntime = { ensure: (mapId, _progress, options) => { builds.push([mapId, options?.terrainVariant ?? null]); return mapId; } };
  const intent = createBattleEntryIntent();
  // the solo sortie's leftover, under both of the intent's names (the earlier `let` and the owner)
  intent.begin({ terrainVariant: 'assault-trenches', campaignOperationId: null, watched: false });
  const { ensureWorld, loadWorld } = new Function('worldRuntime', 'battleEntryIntent', 'pendingTerrainVariant', code)(
    worldRuntime, intent, 'assault-trenches');
  ensureWorld('verdant', null, { precompile: false, atmosphere: 'covered-battle' });
  loadWorld('verdant', () => {}, null);
  loadWorld('verdant', () => {}, 'assault-trenches');
  ensureWorld('verdant', null, { services: false });
  assert.deepEqual(builds, [
    ['verdant', 'assault-trenches'],
    ['verdant', null],
    ['verdant', 'assault-trenches'],
    ['verdant', null],
  ], "a standard room's world never takes a solo sortie's trenches");
}

console.log('battleEntryIntent.selftest: one solo intent record (its couch included), Battle Again\'s replay by kind, and a room world never inherits it passed');
