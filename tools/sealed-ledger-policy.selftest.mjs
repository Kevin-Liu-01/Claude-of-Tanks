import assert from 'node:assert/strict';
import { sealedLedgerVerdict, updatedSealedLedger } from './sealed-ledger-policy.mjs';
const clear = { throughPx: 0, throughViews: 0, netPx: 0 };
assert.equal(sealedLedgerVerdict(undefined, { sealed: true, holeViews: 0, holePx: 0, ...clear }).pass, true);
assert.equal(sealedLedgerVerdict(undefined, { sealed: false, holeViews: 1, holePx: 6, ...clear }).pass, false,
  'a new vehicle must not inherit an opening waiver merely because its ledger row is absent');
const row0 = { seeThroughPx: 0, netSeeThroughPx: 0 };
assert.equal(sealedLedgerVerdict({sealed:true,openPx:0,...row0}, {sealed:false,holeViews:1,holePx:1,...clear}).pass, false);
for (const [baseline, allowed] of [[40, 12], [200, 20]]) {
  const row = {sealed:false,openPx:baseline,...row0};
  assert.equal(sealedLedgerVerdict(row, {sealed:false,holeViews:2,holePx:baseline+allowed,...clear}).pass, true);
  assert.equal(sealedLedgerVerdict(row, {sealed:false,holeViews:2,holePx:baseline+allowed+1,...clear}).pass, false);
}
// See-through gates (2026-10-16, 227 guards): the hull's see-through (netting is counted apart by the census) may grow
// by max(12 px, 10 %) over its row. kf51_u's 226 numbers: a row of 24 against the 3,547 px an undeclared net would put
// on the hull's account fails; the measurement itself is required, and a row without a baseline cannot pass.
for (const [baseline, allowed] of [[24, 12], [300, 30]]) {
  const row = {sealed:true,openPx:4,seeThroughPx:baseline,netSeeThroughPx:0};
  assert.equal(sealedLedgerVerdict(row, {sealed:true,holeViews:0,holePx:4,throughPx:baseline+allowed,throughViews:1,netPx:0}).pass, true);
  const over = sealedLedgerVerdict(row, {sealed:true,holeViews:0,holePx:4,throughPx:baseline+allowed+1,throughViews:1,netPx:0});
  assert.equal(over.pass, false); assert.match(over.message, /REGRESSION: see-through px \d+ > ledger \d+/);
}
const kf51 = {sealed:true,openPx:4,seeThroughPx:24,netSeeThroughPx:3526};
assert.equal(sealedLedgerVerdict(kf51, {sealed:true,holeViews:0,holePx:1,throughPx:3547,throughViews:33,netPx:0}).pass, false, 'the 226 class fails');
assert.match(sealedLedgerVerdict(kf51, {sealed:true,holeViews:0,holePx:1,throughPx:23,throughViews:0,netPx:3526}).message,
  /^ledger: sealed, holds; see-through 23 px \(ledger 24\), holds; netting 3526 px \(ledger 3526\), holds$/);
assert.equal(sealedLedgerVerdict({sealed:true,openPx:0,netSeeThroughPx:0}, {sealed:true,holeViews:0,holePx:0,...clear}).pass, false, 'a row without a see-through baseline fails');
assert.throws(() => sealedLedgerVerdict(kf51, {sealed:true,holeViews:0,holePx:0}), /see-through census .* is required/);
assert.throws(() => sealedLedgerVerdict(kf51, {sealed:true,holeViews:0,holePx:0,throughPx:23,throughViews:0}), /see-through census .* is required/,
  'the netting measurement is required too');
assert.equal(sealedLedgerVerdict(undefined, {sealed:true,holeViews:0,holePx:0,throughPx:9,throughViews:1,netPx:0}).pass, false,
  'a new vehicle may not bring a see-through cluster');
assert.match(sealedLedgerVerdict(undefined, {sealed:true,holeViews:0,holePx:0,throughPx:9,throughViews:1,netPx:0}).message, /--accept-see-through=<id>/,
  'the refusal names the supported way to record the row');
assert.equal(sealedLedgerVerdict(undefined, {sealed:true,holeViews:0,holePx:0,throughPx:3,throughViews:0,netPx:0}).pass, true,
  'sub-cluster specks are reported, not a new vehicle\'s failure');
// Netting holds to its own column (227 round 2) within a two-sided band of max(12 px, 2 %): an unchanged suit
// reproduces its count exactly, so kf51_u's suit lifted 0.4 m (3,526 -> 15,687 px, critic r1), cloned beside itself
// (7,476 px), griffin_viper's turret suit lifted 0.4 m (8,531 -> 8,937 px, inside a 10 % slack) or a suit that sank or
// went missing all fail, with no see-through change. A row without a netting baseline cannot pass.
const kf51Census = {sealed:true,holeViews:0,holePx:1,throughPx:23,throughViews:0};
for (const netPx of [3526, 3526+70, 3526-70]) assert.equal(sealedLedgerVerdict(kf51, {...kf51Census,netPx}).pass, true, `netting ${netPx} within the band`);
for (const netPx of [3526+71, 15687, 7476]) {
  const drift = sealedLedgerVerdict(kf51, {...kf51Census,netPx});
  assert.equal(drift.pass, false); assert.match(drift.message, new RegExp(`^REGRESSION: netting px ${netPx} > ledger 3526 \\(.*--accept-see-through=<id>\\)$`));
}
for (const netPx of [3526-71, 0]) assert.match(sealedLedgerVerdict(kf51, {...kf51Census,netPx}).message, new RegExp(`^REGRESSION: netting px ${netPx} < ledger 3526`),
  'a suit that sank into its hull or went missing moves the count too');
const griffin = {sealed:true,openPx:0,seeThroughPx:38,netSeeThroughPx:8531}, griffinCensus = {sealed:true,holeViews:0,holePx:0,throughPx:38,throughViews:1};
assert.equal(sealedLedgerVerdict(griffin, {...griffinCensus,netPx:8531+170}).pass, true);
assert.equal(sealedLedgerVerdict(griffin, {...griffinCensus,netPx:8937}).pass, false, 'griffin_viper\'s floating turret suit');
assert.equal(sealedLedgerVerdict({sealed:true,openPx:0,seeThroughPx:0}, {sealed:true,holeViews:0,holePx:0,...clear}).pass, false, 'a row without a netting baseline fails');
assert.equal(sealedLedgerVerdict({sealed:true,openPx:0,...row0}, {sealed:true,holeViews:0,holePx:0,...clear,netPx:12}).pass, true);
assert.equal(sealedLedgerVerdict({sealed:true,openPx:0,...row0}, {sealed:true,holeViews:0,holePx:0,...clear,netPx:13}).pass, false,
  'a netting-free row may not grow a net');
// Acceptance is an explicit per-id decision for the see-through columns only: an accepted row is judged at its measured
// see-through and netting, an accepted new vehicle may carry its see-through cluster, and neither excuses an opening.
assert.equal(sealedLedgerVerdict(kf51, {...kf51Census,throughPx:300,netPx:15687}, {acceptSeeThrough:true}).pass, true);
assert.equal(sealedLedgerVerdict(kf51, {...kf51Census,netPx:900}, {acceptSeeThrough:true}).pass, true, 'an accepted netting baseline is the measurement, smaller or larger');
assert.equal(sealedLedgerVerdict(kf51, {...kf51Census,sealed:false,holeViews:1,netPx:3526}, {acceptSeeThrough:true}).pass, false);
assert.equal(sealedLedgerVerdict({...kf51,sealed:false,openPx:40}, {...kf51Census,sealed:false,holeViews:2,holePx:53,netPx:3526}, {acceptSeeThrough:true}).pass, false);
const ajax = {sealed:true,holeViews:0,holePx:10,throughPx:51,throughViews:1,netPx:0};
assert.equal(sealedLedgerVerdict(undefined, ajax).pass, false, 'ajax\'s marking cluster without an approved baseline');
assert.match(sealedLedgerVerdict(undefined, ajax, {acceptSeeThrough:true}).message, /^new vehicle: sealed; see-through 51 px in 1 views accepted$/);
assert.equal(sealedLedgerVerdict(undefined, {...ajax,sealed:false,holeViews:1}, {acceptSeeThrough:true}).pass, false, 'acceptance never waives a new vehicle\'s openings');

const ledger = { generatedAt:'old', tanks:{ existing:{sealed:false,openPx:40,seeThroughPx:5,netSeeThroughPx:0}, netted:{sealed:true,openPx:0,seeThroughPx:30,netSeeThroughPx:4000} } };
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
// A see-through or netting regression is refused like an opening: only an explicit per-id acceptance re-baselines the
// row, it never excuses an opening, and it names requested ids only.
const jump = {...closed,id:'netted',throughPx:3547,throughViews:33,netPx:0};
assert.throws(()=>updatedSealedLedger(ledger,[jump],'new',['netted']),/netted: REGRESSION: see-through px 3547 > ledger 30; ledger unchanged/);
assert.throws(()=>updatedSealedLedger(ledger,[{...jump,throughPx:30,netPx:9000}],'new',['netted']),/netted: REGRESSION: netting px 9000 > ledger 4000 .*; ledger unchanged/);
assert.throws(()=>updatedSealedLedger(ledger,[{...jump,throughPx:30,netPx:3000}],'new',['netted'],{seeThroughOnly:true}),/netted: REGRESSION: netting px 3000 < ledger 4000 .*; ledger unchanged/,
  'a column re-baseline moves the netting only with the explicit acceptance');
assert.equal(updatedSealedLedger(ledger,[{...jump,throughPx:30,netPx:3000}],'new',['netted'],{acceptSeeThrough:['netted'],seeThroughOnly:true}).tanks.netted.netSeeThroughPx,3000);
const rebased = updatedSealedLedger(ledger,[{...jump,throughPx:75,netPx:8130}],'new',['netted'],{acceptSeeThrough:['netted']});
assert.deepEqual([rebased.tanks.netted.seeThroughPx,rebased.tanks.netted.netSeeThroughPx],[75,8130]);
assert.equal(sealedLedgerVerdict(rebased.tanks.netted,{sealed:true,holeViews:0,holePx:0,throughPx:88,throughViews:1,netPx:8130}).pass,false,
  'the re-baselined row gates from its new see-through value');
assert.equal(sealedLedgerVerdict(rebased.tanks.netted,{sealed:true,holeViews:0,holePx:0,throughPx:75,throughViews:1,netPx:8293}).pass,false,
  'and from its new netting value');
assert.equal(sealedLedgerVerdict(rebased.tanks.netted,{sealed:true,holeViews:0,holePx:0,throughPx:75,throughViews:1,netPx:8292}).pass,true);
assert.throws(()=>updatedSealedLedger(ledger,[{...jump,sealed:false,holeViews:1,holePx:20}],'new',['netted'],{acceptSeeThrough:['netted']}),
  /REGRESSION: ledger sealed, now 1 open views; ledger unchanged/);
assert.throws(()=>updatedSealedLedger(ledger,[jump],'new',['netted'],{acceptSeeThrough:['existing']}),/unrequested ids: existing/);
assert.throws(()=>updatedSealedLedger(ledger,[{...closed,netPx:undefined}],'new',['new_closed']),/see-through census .* is required/);
// A vehicle without a row (ajax, griffin_viper on 16aeab482: sealed, a 6 px marking cluster) is recorded through the
// supported path: refused by a plain update, written with the acceptance, still refused when it is open; the written row
// then gates from its measurement.
const ajaxReport = {...closed,id:'ajax',...ajax,invertedPx:438,tris:76298};
assert.throws(()=>updatedSealedLedger(ledger,[ajaxReport],'new',['ajax']),/ajax: new vehicle: see-through in 1 views without an approved baseline/);
const recorded = updatedSealedLedger(ledger,[ajaxReport,closed],'new',['ajax','new_closed'],{acceptSeeThrough:['ajax']});
assert.deepEqual(recorded.tanks.ajax,{sealed:true,openPx:10,openViews:0,insideOutPx:438,seeThroughPx:51,netSeeThroughPx:0,tris:76298});
assert.equal(sealedLedgerVerdict(recorded.tanks.ajax,{...ajax}).pass,true);
assert.equal(sealedLedgerVerdict(recorded.tanks.ajax,{...ajax,throughPx:64}).pass,false);
assert.throws(()=>updatedSealedLedger(ledger,[{...ajaxReport,sealed:false,holeViews:1}],'new',['ajax'],{acceptSeeThrough:['ajax']}),
  /ajax: new vehicle: 1 open views without an approved baseline; ledger unchanged/);
// a see-through re-baseline rewrites only the see-through columns: the opening baseline stays (40 px here, though the
// measurement read 2), and a new id has no row to re-baseline
const columns = updatedSealedLedger(ledger,[{...closed,id:'existing',sealed:true,holePx:2,throughPx:60,throughViews:2,netPx:900}],'new',['existing'],{acceptSeeThrough:['existing'],seeThroughOnly:true});
assert.deepEqual(columns.tanks.existing,{sealed:false,openPx:40,seeThroughPx:60,netSeeThroughPx:900});
assert.throws(()=>updatedSealedLedger(ledger,[closed],'new',['new_closed'],{seeThroughOnly:true}),/see-through re-baseline needs an existing row/);
assert.throws(()=>updatedSealedLedger(ledger,[ajaxReport],'new',['ajax'],{acceptSeeThrough:['ajax'],seeThroughOnly:true}),/see-through re-baseline needs an existing row/);
assert.throws(()=>updatedSealedLedger(ledger,[{...closed,id:'existing',sealed:false,holeViews:3,holePx:53,throughPx:60,throughViews:2,netPx:900}],'new',['existing'],{acceptSeeThrough:['existing'],seeThroughOnly:true}),
  /REGRESSION: open px 53 > ledger 40/,'a column re-baseline still holds the openings');
assert.equal(JSON.stringify(ledger),snapshot);
console.log('sealed-ledger-policy: incomplete batches, unregistered openings, see-through and netting regressions fail; see-through re-baselines and new rows with see-through are explicit per id; historical thresholds and sealed regressions preserved');
