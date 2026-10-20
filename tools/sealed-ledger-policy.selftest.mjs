import assert from 'node:assert/strict';
import { parseReasonedIds, parseSeeThroughAccepts, recordedSealedFrame, sealedLedgerVerdict, updatedSealedLedger } from './sealed-ledger-policy.mjs';
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
  assert.equal(drift.pass, false); assert.match(drift.message, new RegExp(`^REGRESSION: netting px ${netPx} > ledger 3526 \\(.*--accept-see-through=<id>:<reason>\\)$`));
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

// an accept is per id and carries its reason, who and when (guards 229 critic round 1)
const REASON = 'selftest: the measured change is intended';
const A = (...ids) => new Map(ids.map((id) => [id, REASON]));
const NOTE = { by: 'selftest', date: '2026-10-19' };
const ledger = { generatedAt:'old', tanks:{ existing:{sealed:false,openPx:40,seeThroughPx:5,netSeeThroughPx:0}, netted:{sealed:true,openPx:0,seeThroughPx:30,netSeeThroughPx:4000} } };
const snapshot = JSON.stringify(ledger);
const FRAME = [0, 1.2, 0.05, 4.8];
const closed = {id:'new_closed',sealed:true,holeViews:0,holePx:0,invertedPx:0,throughPx:0,throughViews:0,netPx:0,tris:12,frame:FRAME};
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
assert.deepEqual(updated.tanks.new_closed.frame,FRAME,'a new row records its census frame');
assert.throws(()=>updatedSealedLedger(ledger,[{...closed,frame:undefined}],'new',['new_closed']),/needs the census frame/);
assert.equal(updated.tanks.existing,ledger.tanks.existing);
assert.equal(JSON.stringify(ledger),snapshot,'successful update is a new value, not an in-place mutation');
// A see-through or netting regression is refused like an opening: only an explicit per-id acceptance re-baselines the
// row, it never excuses an opening, and it names requested ids only.
const jump = {...closed,id:'netted',throughPx:3547,throughViews:33,netPx:0};
assert.throws(()=>updatedSealedLedger(ledger,[jump],'new',['netted']),/netted: REGRESSION: see-through px 3547 > ledger 30; ledger unchanged/);
assert.throws(()=>updatedSealedLedger(ledger,[{...jump,throughPx:30,netPx:9000}],'new',['netted']),/netted: REGRESSION: netting px 9000 > ledger 4000 .*; ledger unchanged/);
assert.throws(()=>updatedSealedLedger(ledger,[{...jump,throughPx:30,netPx:3000}],'new',['netted'],{seeThroughOnly:true}),/netted: REGRESSION: netting px 3000 < ledger 4000 .*; ledger unchanged/,
  'a column re-baseline moves the netting only with the explicit acceptance');
assert.equal(updatedSealedLedger(ledger,[{...jump,throughPx:30,netPx:3000}],'new',['netted'],{acceptSeeThrough:A('netted'),seeThroughOnly:true,...NOTE}).tanks.netted.netSeeThroughPx,3000);
const rebased = updatedSealedLedger(ledger,[{...jump,throughPx:75,netPx:8130}],'new',['netted'],{acceptSeeThrough:A('netted'),...NOTE});
assert.deepEqual([rebased.tanks.netted.seeThroughPx,rebased.tanks.netted.netSeeThroughPx],[75,8130]);
assert.deepEqual(rebased.tanks.netted.accepts,[{kind:'see-through',reason:REASON,by:'selftest',date:'2026-10-19',from:{seeThroughPx:30,netSeeThroughPx:4000}}],
  'an accepted raise records its reason, who, when and the old values');
// critic round 2: a second accept appends to the history, never replacing the first
const again = updatedSealedLedger(rebased,[{...jump,throughPx:80,netPx:8200}],'new',['netted'],{acceptSeeThrough:new Map([['netted','selftest: a second, later intended change']]),...NOTE});
assert.deepEqual(again.tanks.netted.accepts.map((a)=>[a.reason,a.from.seeThroughPx]),[[REASON,30],['selftest: a second, later intended change',75]]);
assert.equal(sealedLedgerVerdict(rebased.tanks.netted,{sealed:true,holeViews:0,holePx:0,throughPx:88,throughViews:1,netPx:8130}).pass,false,
  'the re-baselined row gates from its new see-through value');
assert.equal(sealedLedgerVerdict(rebased.tanks.netted,{sealed:true,holeViews:0,holePx:0,throughPx:75,throughViews:1,netPx:8293}).pass,false,
  'and from its new netting value');
assert.equal(sealedLedgerVerdict(rebased.tanks.netted,{sealed:true,holeViews:0,holePx:0,throughPx:75,throughViews:1,netPx:8292}).pass,true);
assert.throws(()=>updatedSealedLedger(ledger,[{...jump,sealed:false,holeViews:1,holePx:20}],'new',['netted'],{acceptSeeThrough:A('netted'),...NOTE}),
  /REGRESSION: ledger sealed, now 1 open views; ledger unchanged/);
assert.throws(()=>updatedSealedLedger(ledger,[jump],'new',['netted'],{acceptSeeThrough:A('existing'),...NOTE}),/unrequested ids: existing/);
assert.throws(()=>updatedSealedLedger(ledger,[{...closed,netPx:undefined}],'new',['new_closed']),/see-through census .* is required/);
// A vehicle without a row (ajax, griffin_viper on 16aeab482: sealed, a 6 px marking cluster) is recorded through the
// supported path: refused by a plain update, written with the acceptance, still refused when it is open; the written row
// then gates from its measurement.
const ajaxReport = {...closed,id:'ajax',...ajax,invertedPx:438,tris:76298};
assert.throws(()=>updatedSealedLedger(ledger,[ajaxReport],'new',['ajax']),/ajax: new vehicle: see-through in 1 views without an approved baseline/);
const recorded = updatedSealedLedger(ledger,[ajaxReport,closed],'new',['ajax','new_closed'],{acceptSeeThrough:A('ajax'),...NOTE});
assert.deepEqual(recorded.tanks.ajax,{sealed:true,openPx:10,openViews:0,insideOutPx:438,seeThroughPx:51,netSeeThroughPx:0,tris:76298,frame:FRAME,
  accepts:[{kind:'see-through',reason:REASON,by:'selftest',date:'2026-10-19',from:'no earlier row'}]});
assert.equal(recorded.tanks.new_closed.accepts,undefined,'a new row without a cluster needs no accept and carries none');
assert.equal(sealedLedgerVerdict(recorded.tanks.ajax,{...ajax}).pass,true);
assert.equal(sealedLedgerVerdict(recorded.tanks.ajax,{...ajax,throughPx:64}).pass,false);
assert.throws(()=>updatedSealedLedger(ledger,[{...ajaxReport,sealed:false,holeViews:1}],'new',['ajax'],{acceptSeeThrough:A('ajax'),...NOTE}),
  /ajax: new vehicle: 1 open views without an approved baseline; ledger unchanged/);
// a see-through re-baseline rewrites only the see-through columns: the opening baseline stays (40 px here, though the
// measurement read 2), and a new id has no row to re-baseline
const columns = updatedSealedLedger(ledger,[{...closed,id:'existing',sealed:true,holePx:2,throughPx:60,throughViews:2,netPx:900}],'new',['existing'],{acceptSeeThrough:A('existing'),seeThroughOnly:true,...NOTE});
assert.deepEqual(columns.tanks.existing,{sealed:false,openPx:40,seeThroughPx:60,netSeeThroughPx:900,
  accepts:[{kind:'see-through',reason:REASON,by:'selftest',date:'2026-10-19',from:{seeThroughPx:5,netSeeThroughPx:0}}]});
assert.throws(()=>updatedSealedLedger(ledger,[closed],'new',['new_closed'],{seeThroughOnly:true}),/see-through re-baseline needs an existing row/);
assert.throws(()=>updatedSealedLedger(ledger,[ajaxReport],'new',['ajax'],{acceptSeeThrough:A('ajax'),seeThroughOnly:true,...NOTE}),/see-through re-baseline needs an existing row/);
assert.throws(()=>updatedSealedLedger(ledger,[{...closed,id:'existing',sealed:false,holeViews:3,holePx:53,throughPx:60,throughViews:2,netPx:900}],'new',['existing'],{acceptSeeThrough:A('existing'),seeThroughOnly:true,...NOTE}),
  /REGRESSION: open px 53 > ledger 40/,'a column re-baseline still holds the openings');
// No walk (guards 229 critic rounds 1 and 2: six passing plain updates walked marder1a3's see-through 113 -> 199 px and
// griffin_viper's netting 8531 -> 9605; tightening to one sample walked k2b's see-through 224 -> 183 and merkava2d's
// openings 18 -> 2, so the next unchanged census read red). A plain update never changes an existing row, up or down;
// --tighten-ledger lowers one by name; the next step of the walk is judged against the unchanged row.
{
  const marder = {sealed:false,openPx:182,openViews:3,insideOutPx:163,seeThroughPx:113,netSeeThroughPx:0,tris:91842};
  const griffin = {sealed:true,openPx:0,openViews:0,insideOutPx:144,seeThroughPx:38,netSeeThroughPx:8531,tris:76682};
  const book = {generatedAt:'old',tanks:{marder1a3:marder,griffin_viper:griffin}};
  const pass1 = [{id:'marder1a3',sealed:false,holeViews:3,holePx:182,invertedPx:163,throughPx:124,throughViews:4,netPx:0,tris:91842},
    {id:'griffin_viper',sealed:true,holeViews:0,holePx:0,invertedPx:144,throughPx:50,throughViews:1,netPx:8701,tris:76682}];
  for (const r of pass1) assert.equal(sealedLedgerVerdict(book.tanks[r.id],r).pass,true,`${r.id}: the +10 % / +2 % measurement passes the gate`);
  const once = updatedSealedLedger(book,pass1,'u1',['marder1a3','griffin_viper']);
  const twice = updatedSealedLedger(once,pass1,'u2',['marder1a3','griffin_viper']);
  assert.deepEqual([once.tanks,twice.tanks],[book.tanks,book.tanks],'two passing plain updates leave the rows unchanged');
  // the critic's walk: the next +10 % / +2 % step is judged against the unchanged row and fails, so nothing compounds
  const step2 = pass1.map((r)=>({...r,throughPx:Math.floor(r.throughPx*1.1),netPx:Math.floor(r.netPx*1.019)}));
  assert.throws(()=>updatedSealedLedger(twice,step2,'u3',['marder1a3','griffin_viper']),/marder1a3: REGRESSION: see-through px 136 > ledger 113/);
  assert.throws(()=>updatedSealedLedger(twice,[{...step2[1],throughPx:38}],'u3',['griffin_viper']),/griffin_viper: REGRESSION: netting px 8866 > ledger 8531/);
  const sample = {...pass1[0],throughPx:90,holePx:0,holeViews:0,sealed:true};
  assert.deepEqual(updatedSealedLedger(book,[sample],'u3',['marder1a3']).tanks.marder1a3,marder,
    'a lower one-sample measurement leaves a plain update\'s row as it was (the critic\'s k2b and merkava2d walks)');
  const lower = updatedSealedLedger(book,[sample],'u3',['marder1a3'],{tighten:new Set(['marder1a3'])});
  assert.deepEqual(lower.tanks.marder1a3,{sealed:true,openPx:0,openViews:0,insideOutPx:163,seeThroughPx:90,netSeeThroughPx:0,tris:91842},
    '--tighten-ledger lowers it by name (sealed, 0 px), netting kept');
  assert.throws(()=>updatedSealedLedger(book,[sample],'u3',['marder1a3'],{tighten:new Set(['griffin_viper'])}),/unrequested ids: griffin_viper/);
  assert.throws(()=>updatedSealedLedger(book,pass1,'u4',['marder1a3','griffin_viper'],{acceptSeeThrough:['marder1a3']}),/needs a reason per id/,
    'bare-id acceptance is refused');
  assert.throws(()=>updatedSealedLedger(book,pass1,'u4',['marder1a3','griffin_viper'],{acceptSeeThrough:new Map([['marder1a3','soot']])}),/at least 12 characters/);
  const kept = updatedSealedLedger({generatedAt:'old',tanks:{griffin_viper:{...griffin,accepts:[{kind:'see-through',reason:'earlier note',by:'x',date:'d',from:'no earlier row'}]}}},
    [{...pass1[1],throughPx:38,netPx:8531}],'u5',['griffin_viper'],{acceptSeeThrough:A('griffin_viper'),...NOTE});
  assert.deepEqual(kept.tanks.griffin_viper.accepts.map((a)=>a.reason),['earlier note'],'an accept that changes nothing keeps the row and its history');
}
// The census frame (critic round 2): a row's recorded frame frames every view; a build that reaches past it fails with
// REFRAME until --reframe re-records the frame and every column in it (with a reason, kept in the history); a sealed row
// must still measure sealed. recordedSealedFrame snaps the centre to 5 cm and grows the radius by 10 to 20 cm.
{
  const row = {sealed:true,openPx:0,openViews:0,insideOutPx:10,seeThroughPx:4,netSeeThroughPx:3218,tris:90650,frame:[0,1.2,0.05,4.8]};
  const book = {generatedAt:'old',tanks:{type96b:row}};
  const out = {id:'type96b',sealed:true,holeViews:0,holePx:0,invertedPx:12,throughPx:4,throughViews:0,netPx:3218,tris:90700,frame:[0,1.2,0.05,4.8],frameExceeded:true};
  assert.match(sealedLedgerVerdict(row,out).message,/^REFRAME: the build reaches past the row's census frame/);
  assert.throws(()=>updatedSealedLedger(book,[out],'u',['type96b']),/type96b: REFRAME/);
  const re = updatedSealedLedger(book,[{...out,frame:[0,1.2,0.1,5],netPx:3100,holePx:3}],'u',['type96b'],{reframe:new Map([['type96b','selftest: a 30 cm longer gun outgrew the frame']]),...NOTE});
  assert.deepEqual([re.tanks.type96b.frame,re.tanks.type96b.netSeeThroughPx,re.tanks.type96b.openPx,re.tanks.type96b.accepts[0].kind,re.tanks.type96b.accepts[0].from.frame],
    [[0,1.2,0.1,5],3100,3,'reframe',[0,1.2,0.05,4.8]],'a re-frame records the new frame, every column and the old ones in the history');
  assert.throws(()=>updatedSealedLedger(book,[{...out,sealed:false,holeViews:1}],'u',['type96b'],{reframe:new Map([['type96b','selftest: a 30 cm longer gun outgrew the frame']]),...NOTE}),
    /REGRESSION: ledger sealed, now 1 open views/,'a re-frame never opens a sealed row');
  assert.deepEqual(recordedSealedFrame({center:{x:0.012,y:1.237,z:-0.031},radius:4.513}),[0,1.25,-0.05,4.7]);
  assert.deepEqual(recordedSealedFrame({center:{x:0,y:1,z:0},radius:4.6}),[0,1,0,4.7],'at least 10 cm of margin');
}
assert.throws(()=>parseSeeThroughAccepts('ajax:a reason long enough here;ajax:another reason long enough'),/ajax is named twice/,'a duplicated id is refused');
assert.throws(()=>parseReasonedIds('t84,t84:a reason long enough here','--reframe'),/--reframe: t84 is named twice/);
assert.deepEqual([...parseSeeThroughAccepts('ajax,griffin_viper:marking specks off the glacis edge; type10b:rear course re-seated').entries()],
  [['ajax','marking specks off the glacis edge'],['griffin_viper','marking specks off the glacis edge'],['type10b','rear course re-seated']]);
assert.equal(parseSeeThroughAccepts('').size,0);
for (const spec of ['ajax','ajax:short',':a long enough reason here']) assert.throws(()=>parseSeeThroughAccepts(spec),/<id>\[,<id>\]:<reason>/,`refused: ${spec}`);
assert.equal(JSON.stringify(ledger),snapshot);
console.log('sealed-ledger-policy: incomplete batches, unregistered openings, see-through and netting regressions fail; see-through re-baselines, re-frames and new rows with see-through are explicit per id with a reason kept in a history; a plain update never changes a row (no raise, no walk down), --tighten-ledger lowers by name; a build past its frame asks for --reframe; historical thresholds and sealed regressions preserved');
