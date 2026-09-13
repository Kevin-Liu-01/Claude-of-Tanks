import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAMPAIGN_KEY, frontlineSummary, installCampaignProgress, readCampaignRecord, recordFrontlineOutcome } from './campaignProgress.ts';

// campaign slice 4 (2026-09-12): Frontline Assault sorties persist locally —
// sectors pushed per map, lines held, attempts — and surface in the play menu.

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, map: m }; };

// empty and corrupt storage read as a fresh record
assert.deepEqual(readCampaignRecord(null), { version: 1, frontline: {} });
{
  const s = memory(); s.setItem(CAMPAIGN_KEY, '{not json');
  assert.deepEqual(readCampaignRecord(s), { version: 1, frontline: {} }, 'corrupt storage is ignored');
  s.setItem(CAMPAIGN_KEY, JSON.stringify({ version: 0, frontline: { frontier: { attempts: 9 } } }));
  assert.deepEqual(readCampaignRecord(s), { version: 1, frontline: {} }, 'an unknown version starts over');
  s.setItem(CAMPAIGN_KEY, JSON.stringify({ version: 1, frontline: { frontier: { attempts: '2', bestLine: 1.4, total: null, held: -3, lastResult: 'nonsense' } } }));
  assert.deepEqual(readCampaignRecord(s).frontline.frontier,
    { attempts: 2, bestLine: 1, total: 3, held: 0, lastResult: null, updatedAt: 0 }, 'fields are coerced defensively');
}

// a defeat after two sectors, then a held line
const s = memory();
let record = recordFrontlineOutcome({ mapId: 'frontier', result: 'defeat', reason: 'assault_overrun', line: { index: 2, total: 3, holdS: 0 }, completedAt: 1000 }, s);
assert.deepEqual(record.frontline.frontier, { attempts: 1, bestLine: 2, total: 3, held: 0, lastResult: 'defeat', updatedAt: 1000 });
record = recordFrontlineOutcome({ mapId: 'frontier', result: 'victory', reason: 'line_held', line: { index: 2, total: 3, holdS: 20 }, completedAt: 2000 }, s);
assert.deepEqual(record.frontline.frontier, { attempts: 2, bestLine: 3, total: 3, held: 1, lastResult: 'victory', updatedAt: 2000 }, 'a held line counts the whole push');
record = recordFrontlineOutcome({ mapId: 'frontier', result: 'defeat', reason: 'assault_overrun', line: { index: 0, total: 3, holdS: 0 }, completedAt: 3000 }, s);
assert.equal(record.frontline.frontier.bestLine, 3, 'a later loss never lowers the best push');
assert.equal(record.frontline.frontier.attempts, 3);
assert.deepEqual(readCampaignRecord(s), record, 'the record round-trips through storage');
record = recordFrontlineOutcome({ mapId: 'steppe', result: 'defeat', line: { index: 1, total: 3 }, completedAt: 4000 }, s);
assert.deepEqual(frontlineSummary(record), { attempts: 4, bestLine: 3, total: 3, held: 1, maps: 2 });
assert.deepEqual(frontlineSummary({ version: 1, frontline: {} }), { attempts: 0, bestLine: 0, total: 3, held: 0, maps: 0 });
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
  assert.doesNotThrow(() => installCampaignProgress(null));
}

// wiring: the battle-end payload carries the mode and line, main installs the hook, the play menu shows the push
const state = readFileSync(new URL('./state.ts', import.meta.url), 'utf8');
assert.match(state, /gameMode: game\.gameMode,\n\s*line: game\.matchModeState\?\.line/, 'battle:ended carries the mode and the line state');
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
