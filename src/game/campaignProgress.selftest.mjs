import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMPAIGN_KEY, CAMPAIGN_PAR_SHARE, campaignStarsFor, frontlineSummary, installCampaignProgress, readCampaignRecord, recordFrontlineOutcome,
} from './campaignProgress.ts';

// campaign slice 4 (2026-09-12): Frontline Assault sorties persist locally —
// sectors pushed per map, lines held, attempts — and surface in the play menu.

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, map: m }; };

// empty and corrupt storage read as a fresh record
assert.deepEqual(readCampaignRecord(null), { version: 2, frontline: {} });
{
  const s = memory(); s.setItem(CAMPAIGN_KEY, '{not json');
  assert.deepEqual(readCampaignRecord(s), { version: 2, frontline: {} }, 'corrupt storage is ignored');
  s.setItem(CAMPAIGN_KEY, JSON.stringify({ version: 0, frontline: { frontier: { attempts: 9 } } }));
  assert.deepEqual(readCampaignRecord(s), { version: 2, frontline: {} }, 'an unknown version starts over');
  s.setItem(CAMPAIGN_KEY, JSON.stringify({ version: 2, frontline: { frontier: { attempts: '2', bestLine: 1.4, total: null, held: -3, lastResult: 'nonsense', stars: 9, bestTimeS: 'x' } } }));
  assert.deepEqual(readCampaignRecord(s).frontline.frontier,
    { attempts: 2, bestLine: 1, total: 3, held: 0, lastResult: null, updatedAt: 0, stars: 3, bestTimeS: null }, 'fields are coerced defensively');
  // batch 19: a version-1 record migrates — one star per held map, no time yet
  s.setItem(CAMPAIGN_KEY, JSON.stringify({ version: 1, frontline: { verdant: { attempts: 3, bestLine: 3, total: 3, held: 2, lastResult: 'victory', updatedAt: 5, stars: 3 } } }));
  const migrated = readCampaignRecord(s);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.frontline.verdant, { attempts: 3, bestLine: 3, total: 3, held: 2, lastResult: 'victory', updatedAt: 5, stars: 1, bestTimeS: null },
    'a held version-1 map is worth one star and its stars field is ignored');
}

// a defeat after two sectors, then a held line
const s = memory();
let record = recordFrontlineOutcome({ mapId: 'frontier', result: 'defeat', reason: 'assault_overrun', line: { index: 2, total: 3, holdS: 0 }, completedAt: 1000 }, s);
assert.deepEqual(record.frontline.frontier, { attempts: 1, bestLine: 2, total: 3, held: 0, lastResult: 'defeat', updatedAt: 1000, stars: 0, bestTimeS: null });
record = recordFrontlineOutcome({ mapId: 'frontier', result: 'victory', reason: 'line_held', line: { index: 2, total: 3, holdS: 20 }, completedAt: 2000 }, s);
assert.deepEqual(record.frontline.frontier, { attempts: 2, bestLine: 3, total: 3, held: 1, lastResult: 'victory', updatedAt: 2000, stars: 1, bestTimeS: null },
  'a held line counts the whole push and one star; no clock, no time');
record = recordFrontlineOutcome({ mapId: 'frontier', result: 'defeat', reason: 'assault_overrun', line: { index: 0, total: 3, holdS: 0 }, completedAt: 3000 }, s);
assert.equal(record.frontline.frontier.bestLine, 3, 'a later loss never lowers the best push');
assert.equal(record.frontline.frontier.attempts, 3);
assert.equal(record.frontline.frontier.stars, 1, 'a later loss never lowers the stars');
assert.deepEqual(readCampaignRecord(s), record, 'the record round-trips through storage');
// stars: held (1), under par (2), no ally lost (3); the best sortie stands, the fastest hold is kept
assert.equal(campaignStarsFor({ result: 'defeat', durationS: 10, timeLimitS: 720, alliesLost: 0 }), 0);
assert.equal(campaignStarsFor({ result: 'victory' }), 1);
assert.equal(campaignStarsFor({ result: 'victory', durationS: 720 * CAMPAIGN_PAR_SHARE, timeLimitS: 720, alliesLost: 2 }), 2, 'par is inclusive');
assert.equal(campaignStarsFor({ result: 'victory', durationS: 720 * CAMPAIGN_PAR_SHARE + 1, timeLimitS: 720, alliesLost: 0 }), 2);
assert.equal(campaignStarsFor({ result: 'victory', durationS: 300, timeLimitS: 720, alliesLost: 0 }), 3);
record = recordFrontlineOutcome({ mapId: 'frontier', result: 'victory', reason: 'line_held', line: { index: 2, total: 3 }, durationS: 500, timeLimitS: 720, alliesLost: 1, completedAt: 3500 }, s);
assert.equal(record.frontline.frontier.stars, 1); assert.equal(record.frontline.frontier.bestTimeS, 500);
record = recordFrontlineOutcome({ mapId: 'frontier', result: 'victory', reason: 'line_held', line: { index: 2, total: 3 }, durationS: 380, timeLimitS: 720, alliesLost: 0, completedAt: 3600 }, s);
assert.equal(record.frontline.frontier.stars, 3, 'a three-star sortie records three stars');
assert.equal(record.frontline.frontier.bestTimeS, 380, 'the fastest hold is kept');
record = recordFrontlineOutcome({ mapId: 'frontier', result: 'victory', reason: 'line_held', line: { index: 2, total: 3 }, durationS: 600, timeLimitS: 720, alliesLost: 3, completedAt: 3700 }, s);
assert.equal(record.frontline.frontier.stars, 3); assert.equal(record.frontline.frontier.bestTimeS, 380, 'a slower sortie changes neither');
assert.equal(record.frontline.frontier.held, 4);
record = recordFrontlineOutcome({ mapId: 'steppe', result: 'defeat', line: { index: 1, total: 3 }, completedAt: 4000 }, s);
assert.deepEqual(frontlineSummary(record), { attempts: 7, bestLine: 3, total: 3, held: 4, maps: 2, stars: 3 });
assert.deepEqual(frontlineSummary({ version: 2, frontline: {} }), { attempts: 0, bestLine: 0, total: 3, held: 0, maps: 0, stars: 0 });
// missing line data still counts the sortie
record = recordFrontlineOutcome({ result: 'draw' }, s);
assert.deepEqual(record.frontline.unknown, { ...record.frontline.unknown, attempts: 1, bestLine: 0, total: 3, held: 0, lastResult: 'draw' });
// storage failures never throw
assert.doesNotThrow(() => recordFrontlineOutcome({ mapId: 'x', result: 'victory' }, { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } }));

// the bus hook records frontline battles only, once per bus, and skips disconnects
{
  const listeners = new Map();
  const bus = { on: (event, fn) => { listeners.set(event, fn); return () => {}; } };
  const store = memory();
  installCampaignProgress(bus, store);
  installCampaignProgress(bus, store);
  const ended = listeners.get('battle:ended');
  assert.equal(typeof ended, 'function');
  ended({ gameMode: 'standard', result: 'victory', map: 'verdant' });
  assert.deepEqual(readCampaignRecord(store).frontline, {}, 'standard battles are not campaign sorties');
  ended({ gameMode: 'frontline_assault', result: 'defeat', reason: 'network_disconnect', map: 'frontier', line: { index: 1, total: 3 } });
  assert.deepEqual(readCampaignRecord(store).frontline, {}, 'disconnects are not sorties');
  ended({ gameMode: 'frontline_assault', result: 'victory', reason: 'line_held', map: 'frontier', line: { index: 2, total: 3, holdS: 20 } });
  assert.equal(readCampaignRecord(store).frontline.frontier.held, 1, 'the map id comes from the battle payload');
  assert.equal(readCampaignRecord(store).frontline.frontier.attempts, 1, 'one listener per bus');
  assert.equal(readCampaignRecord(store).frontline.frontier.stars, 1, 'a payload without clock or losses earns the held star');
  ended({ gameMode: 'frontline_assault', result: 'victory', reason: 'line_held', mapId: 'frontier', line: { index: 2, total: 3, holdS: 20 },
    durationS: 300, timeLimitS: 720, alliesLost: 0 });
  assert.equal(readCampaignRecord(store).frontline.frontier.stars, 3, 'the batch-19 payload fields (mapId, durationS, timeLimitS, alliesLost) score the stars');
  assert.equal(readCampaignRecord(store).frontline.frontier.bestTimeS, 300);
  assert.doesNotThrow(() => installCampaignProgress(null));
}

// wiring: the battle-end payload carries the mode and line, main installs the hook, the play menu shows the push
const state = readFileSync(new URL('./state.ts', import.meta.url), 'utf8');
assert.match(state, /gameMode: game\.gameMode,\n\s*line: game\.matchModeState\?\.line/, 'battle:ended carries the mode and the line state');
assert.match(state, /mapId: game\.mapId,\n\s*durationS: game\.timeS,\n\s*campaignOperationId: game\.campaignOperationId,\n\s*timeLimitS: game\.ruleset\.timeLimitS,\n\s*alliesLost:/,
  'battle:ended carries the operation, the clock and the allies lost for the stars');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /installCampaignProgress\(bus\)/, 'main installs the campaign hook next to the battle profile');
const menu = readFileSync(new URL('../ui/playMenu.ts', import.meta.url), 'utf8');
assert.match(menu, /data-rule-progress/, 'the play menu carries the frontline progress badge');
assert.match(menu, /frontlineProgressLabel\(\)/, 'the badge refreshes from the record');
for (const locale of ['en-US', 'zh-CN']) {
  const catalog = JSON.parse(readFileSync(new URL(`../ui/i18nCatalog.${locale}.json`, import.meta.url), 'utf8'));
  assert.ok(catalog['playMenu.matchMode.frontline_assault.progress'].includes('{best}'), `${locale}: progress copy`);
  assert.ok(catalog['playMenu.matchMode.frontline_assault.progressNone'], `${locale}: first-sortie copy`);
}
console.log('campaignProgress.selftest: record, coercion, summary, bus hook, wiring and copy PASS');
