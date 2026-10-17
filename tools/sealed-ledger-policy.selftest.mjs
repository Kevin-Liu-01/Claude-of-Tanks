import assert from 'node:assert/strict';
import { sealedLedgerVerdict, updatedSealedLedger } from './sealed-ledger-policy.mjs';
const clear = { throughPx: 0, throughViews: 0 };
assert.equal(sealedLedgerVerdict(undefined, { sealed: true, holeViews: 0, holePx: 0, ...clear }).pass, true);
assert.equal(sealedLedgerVerdict(undefined, { sealed: false, holeViews: 1, holePx: 6, ...clear }).pass, false,
  'a new vehicle must not inherit an opening waiver merely because its ledger row is absent');
assert.equal(sealedLedgerVerdict({sealed:true,openPx:0,seeThroughPx:0}, {sealed:false,holeViews:1,holePx:1,...clear}).pass, false);
for (const [baseline, allowed] of [[40, 12], [200, 20]]) {
  const row = {sealed:false,openPx:baseline,seeThroughPx:0};
  assert.equal(sealedLedgerVerdict(row, {sealed:false,holeViews:2,holePx:baseline+allowed,...clear}).pass, true);
  assert.equal(sealedLedgerVerdict(row, {sealed:false,holeViews:2,holePx:baseline+allowed+1,...clear}).pass, false);
}
// See-through gates (2026-10-16, 227 guards): the hull's see-through (netting is counted apart by the census) may grow
// by max(12 px, 10 %) over its row. kf51_u's 226 numbers: a row of 24 against the 3,547 px an undeclared net would put
// on the hull's account fails; the measurement itself is required, and a row without a baseline cannot pass.
for (const [baseline, allowed] of [[24, 12], [300, 30]]) {
  const row = {sealed:true,openPx:4,seeThroughPx:baseline};
  assert.equal(sealedLedgerVerdict(row, {sealed:true,holeViews:0,holePx:4,throughPx:baseline+allowed,throughViews:1}).pass, true);
  const over = sealedLedgerVerdict(row, {sealed:true,holeViews:0,holePx:4,throughPx:baseline+allowed+1,throughViews:1});
  assert.equal(over.pass, false); assert.match(over.message, /REGRESSION: see-through px \d+ > ledger \d+/);
}
const kf51 = {sealed:true,openPx:4,seeThroughPx:24};
assert.equal(sealedLedgerVerdict(kf51, {sealed:true,holeViews:0,holePx:1,throughPx:3547,throughViews:33}).pass, false, 'the 226 class fails');
assert.match(sealedLedgerVerdict(kf51, {sealed:true,holeViews:0,holePx:1,throughPx:23,throughViews:0}).message, /^ledger: sealed, holds; see-through 23 px \(ledger 24\), holds$/);
assert.equal(sealedLedgerVerdict({sealed:true,openPx:0}, {sealed:true,holeViews:0,holePx:0,...clear}).pass, false, 'a row without a see-through baseline fails');
assert.throws(() => sealedLedgerVerdict(kf51, {sealed:true,holeViews:0,holePx:0}), /see-through census .* is required/);
assert.equal(sealedLedgerVerdict(undefined, {sealed:true,holeViews:0,holePx:0,throughPx:9,throughViews:1}).pass, false,
  'a new vehicle may not bring a see-through cluster');
assert.equal(sealedLedgerVerdict(undefined, {sealed:true,holeViews:0,holePx:0,throughPx:3,throughViews:0}).pass, true,
  'sub-cluster specks are reported, not a new vehicle\'s failure');

const ledger = { generatedAt:'old', tanks:{ existing:{sealed:false,openPx:40,seeThroughPx:5}, netted:{sealed:true,openPx:0,seeThroughPx:30} } };
const snapshot = JSON.stringify(ledger);
const closed = {id:'new_closed',sealed:true,holeViews:0,holePx:0,invertedPx:0,throughPx:0,throughViews:0,netPx:0,tris:12};
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
assert.equal(updated.tanks.new_closed.netSeeThroughPx,0,'a written row carries the netting census');
assert.equal(updated.tanks.existing,ledger.tanks.existing);
assert.equal(JSON.stringify(ledger),snapshot,'successful update is a new value, not an in-place mutation');
// A see-through regression is refused like an opening: only an explicit per-id acceptance re-baselines the row, it never
// excuses an opening, and it names requested ids with existing rows only.
const jump = {...closed,id:'netted',throughPx:3547,throughViews:33,netPx:0};
assert.throws(()=>updatedSealedLedger(ledger,[jump],'new',['netted']),/netted: REGRESSION: see-through px 3547 > ledger 30; ledger unchanged/);
const rebased = updatedSealedLedger(ledger,[{...jump,throughPx:75,netPx:8130}],'new',['netted'],{acceptSeeThrough:['netted']});
assert.deepEqual([rebased.tanks.netted.seeThroughPx,rebased.tanks.netted.netSeeThroughPx],[75,8130]);
assert.equal(sealedLedgerVerdict(rebased.tanks.netted,{sealed:true,holeViews:0,holePx:0,throughPx:88,throughViews:1}).pass,false,
  'the re-baselined row gates from its new value');
assert.throws(()=>updatedSealedLedger(ledger,[{...jump,sealed:false,holeViews:1,holePx:20}],'new',['netted'],{acceptSeeThrough:['netted']}),
  /REGRESSION: ledger sealed, now 1 open views; ledger unchanged/);
assert.throws(()=>updatedSealedLedger(ledger,[jump],'new',['netted'],{acceptSeeThrough:['existing']}),/unrequested ids: existing/);
assert.throws(()=>updatedSealedLedger(ledger,[closed],'new',['new_closed'],{acceptSeeThrough:['new_closed']}),/needs an existing row/);
assert.throws(()=>updatedSealedLedger(ledger,[{...closed,netPx:undefined}],'new',['new_closed']),/netting census \(netPx\) is missing/);
// a see-through re-baseline rewrites only the see-through columns: the opening baseline stays (40 px here, though the
// measurement read 2), and a new id has no row to re-baseline
const columns = updatedSealedLedger(ledger,[{...closed,id:'existing',sealed:true,holePx:2,throughPx:60,throughViews:2,netPx:900}],'new',['existing'],{acceptSeeThrough:['existing'],seeThroughOnly:true});
assert.deepEqual(columns.tanks.existing,{sealed:false,openPx:40,seeThroughPx:60,netSeeThroughPx:900});
assert.throws(()=>updatedSealedLedger(ledger,[closed],'new',['new_closed'],{seeThroughOnly:true}),/see-through re-baseline needs an existing row/);
assert.throws(()=>updatedSealedLedger(ledger,[{...closed,id:'existing',sealed:false,holeViews:3,holePx:53,throughPx:60,throughViews:2,netPx:900}],'new',['existing'],{acceptSeeThrough:['existing'],seeThroughOnly:true}),
  /REGRESSION: open px 53 > ledger 40/,'a column re-baseline still holds the openings');
assert.equal(JSON.stringify(ledger),snapshot);
console.log('sealed-ledger-policy: incomplete batches, unregistered openings and see-through regressions fail; see-through re-baselines are explicit per id; historical thresholds and sealed regressions preserved');
