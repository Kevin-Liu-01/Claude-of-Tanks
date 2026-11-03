// 2026-11-02 audit F2: the solo entry's intent. main's ensureWorld took `opts?.terrainVariant ?? pendingTerrainVariant`
// and the network loader omitted the variant for a standard room, so a stale solo Frontline (trench) choice could carve
// trenches into a standard room's world; and the watched flag was set only by the Garage path, so a Play-menu battle
// after a watched one replayed a Watch on Battle Again. Runs main's actual ensureWorld and network loadWorld adapter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createBattleEntryIntent } from './battleEntryIntent.ts';

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

console.log('battleEntryIntent.selftest: one solo intent record, and a room world never inherits it passed');
