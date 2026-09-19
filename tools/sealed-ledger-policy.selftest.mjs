import assert from 'node:assert/strict';
import { sealedLedgerVerdict, updatedSealedLedger } from './sealed-ledger-policy.mjs';
assert.equal(sealedLedgerVerdict(undefined, { sealed: true, holeViews: 0, holePx: 0 }).pass, true);
assert.equal(sealedLedgerVerdict(undefined, { sealed: false, holeViews: 1, holePx: 6 }).pass, false,
  'a new vehicle must not inherit an opening waiver merely because its ledger row is absent');
assert.equal(sealedLedgerVerdict({sealed:true,openPx:0}, {sealed:false,holeViews:1,holePx:1}).pass, false);
for (const [baseline, allowed] of [[40, 12], [200, 20]]) {
  const row = {sealed:false,openPx:baseline};
  assert.equal(sealedLedgerVerdict(row, {sealed:false,holeViews:2,holePx:baseline+allowed}).pass, true);
  assert.equal(sealedLedgerVerdict(row, {sealed:false,holeViews:2,holePx:baseline+allowed+1}).pass, false);
}
const ledger = { generatedAt:'old', tanks:{ existing:{sealed:false,openPx:40} } };
const snapshot = JSON.stringify(ledger);
const closed = {id:'new_closed',sealed:true,holeViews:0,holePx:0,invertedPx:0,throughPx:0,tris:12};
const open = {...closed,id:'new_open',sealed:false,holeViews:2,holePx:120};
for (const reports of [[open],[closed,open]]) {
  assert.throws(()=>updatedSealedLedger(ledger,reports,'new',reports.map(({id})=>id)),/ledger unchanged/);
  assert.equal(JSON.stringify(ledger),snapshot,'failed batch never mutates an existing ledger');
  assert.equal(sealedLedgerVerdict(ledger.tanks.new_open,open).pass,false,'a repeated failure cannot create its own allowance');
}
for (let attempt = 0; attempt < 2; attempt++) {
  assert.throws(()=>updatedSealedLedger(ledger,[closed],'new',['new_closed','build_failed']),
    /Missing measurements: build_failed; ledger unchanged/);
  assert.equal(JSON.stringify(ledger),snapshot,'a skipped build cannot publish the successful subset');
}
for (const [reports,requested] of [
  [[closed,closed],['new_closed']],
  [[closed],['different']],
  [[],[]],
]) {
  assert.throws(()=>updatedSealedLedger(ledger,reports,'new',requested),/ledger unchanged/);
  assert.equal(JSON.stringify(ledger),snapshot);
}
const updated = updatedSealedLedger(ledger,[closed],'new',['new_closed']);
assert.equal(updated.generatedAt,'new');
assert.equal(updated.tanks.new_closed.sealed,true);
assert.equal(updated.tanks.existing,ledger.tanks.existing);
assert.equal(JSON.stringify(ledger),snapshot,'successful update is a new value, not an in-place mutation');
console.log('sealed-ledger-policy: incomplete batches and unregistered openings fail; historical thresholds and sealed regressions preserved');
