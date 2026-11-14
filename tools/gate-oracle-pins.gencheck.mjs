// The geometry gate's oracle pins and roster (267, Main 2026-11-01): a registered oracle is measured only when its bytes
// are the version tools/oracle-pins.mjs pins (a different file, or a path with no pin, is refused with the pinned hash
// named), a pin that departs from its committed record carries its reason, and the ledger holds rows only for the
// fleet's ids: a row for an id not in the roster fails here, and the gate drops such rows (and their records) whenever it
// writes the ledger (geometry-gate-policy.mjs rosterLedgerRows). (268) The gate's skip reasons in its own words are what
// the changed-only chain's gateStamp reads, so a reworded message cannot quietly stop the chain stamping an id.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gateStamp } from './changed-only/steps.mjs';
import { oraclePinError, rosterLedgerRows } from './geometry-gate-policy.mjs';
import { ORACLE_PINS } from './oracle-pins.mjs';
import { fleetRoster } from './fleet-geometry-digest.mjs';

// the refusal: the pinned file passes, any other bytes or an unpinned path are refused with the pinned hash named
const pins = { '/models/a.glb': { sha256: 'a'.repeat(64) } };
assert.equal(oraclePinError('/models/a.glb', 'a'.repeat(64), pins), null);
assert.match(oraclePinError('/models/a.glb', 'b'.repeat(64), pins), new RegExp(`not the pinned ${'a'.repeat(64)}`));
assert.match(oraclePinError('/models/b.glb', 'a'.repeat(64), pins), /no pinned sha256/);

// the gate's skip reasons (geometry-gate.mjs --skipped) read as stamps: an absent or unpinned oracle names its file, any
// other page error none; an empty reason names no stamp
const gateSource = fs.readFileSync(new URL('./geometry-gate.mjs', import.meta.url), 'utf8');
assert.ok(gateSource.includes('skipped[id] = `oracle absent here (${referenceSources[id]})`')
  && gateSource.includes('skipped[id] = `page error, previous row kept: ${error.message}`'), 'the gate words its skips as gateStamp reads them');
const oracleStamp = (code) => ({ code, files: ['public/models/a.glb'] });
assert.deepEqual([gateStamp('oracle absent here (/models/a.glb)'),
  gateStamp(`page error, previous row kept: ${oraclePinError('/models/a.glb', 'b'.repeat(64), pins)}`),
  gateStamp(`page error, previous row kept: ${oraclePinError('/models/a.glb', 'a'.repeat(64), {})}`),
  gateStamp('page error, previous row kept: no __GEO_REPORT'), gateStamp(''), gateStamp('page error, previous row kept: ')],
[oracleStamp('oracle-absent'), oracleStamp('oracle-unpinned'), oracleStamp('oracle-unpinned'), { code: 'page-error', files: [] }, null, null],
'gateStamp reads the gate\'s reasons and refuses an empty one');

// the table: registered paths, full sha256 hashes, a written reason wherever one is given
for (const [path, pin] of Object.entries(ORACLE_PINS)) {
  assert.match(path, /^\/models\/.+\.glb$/, `${path}: a registered oracle path`);
  assert.match(pin.sha256, /^[0-9a-f]{64}$/, `${path}: a full sha256`);
  if ('reason' in pin) assert.ok(typeof pin.reason === 'string' && pin.reason.length > 20, `${path}: its reason in words`);
}

// the roster: a row for an id the fleet no longer has goes (the control), an empty roster keeps every row
const rows = [{ id: 'amx30' }, { id: 'retired_tank' }, { id: 'leo2a4' }];
assert.deepEqual(rosterLedgerRows(rows, ['amx30', 'leo2a4']), { kept: [rows[0], rows[2]], pruned: ['retired_tank'] });
assert.deepEqual(rosterLedgerRows(rows, []).pruned, []);
const roster = new Set(fleetRoster());
const ledger = JSON.parse(fs.readFileSync(new URL('../docs/geometry-gate/ledger.json', import.meta.url), 'utf8'));
assert.deepEqual(ledger.rows.filter((row) => !roster.has(row.id)).map((row) => row.id), [],
  'the ledger has no row for an id outside the roster (node tools/geometry-gate.mjs --prune)');
const records = fs.readdirSync(new URL('../docs/geometry-gate/', import.meta.url)).filter((file) => /^[a-z0-9_]+\.json$/.test(file))
  .filter((file) => { try { return 'geoMin' in JSON.parse(fs.readFileSync(new URL(`../docs/geometry-gate/${file}`, import.meta.url), 'utf8')); } catch { return false; } });
assert.deepEqual(records.map((file) => file.slice(0, -5)).filter((id) => !roster.has(id)), [], 'no gate record for an id outside the roster');
console.log(`gate-oracle-pins.selftest: ${Object.keys(ORACLE_PINS).length} oracle pins, a different file or an unpinned path refused, its skip reasons read as stamps, and ${ledger.rows.length} ledger rows and ${records.length} records all in the ${roster.size}-id roster`);
