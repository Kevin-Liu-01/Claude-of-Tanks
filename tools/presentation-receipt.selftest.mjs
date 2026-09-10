import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { presentationNumberSource, presentationReceiptErrors, syncAssetProjectionSource, updateSelectedPresentationSource } from './presentation-receipt.mjs';

// Actual saved/runtime disagreement from frozen nine-tank release 74d189dfa.
const cases = [
  ['leo2_revolution', { xM:0, zM:.0788 }, { centerYM:1.9843, topHalfM:6.4532, sideHalfM:3.2266 }, 1.9893],
  ['leo2a7v_x', { xM:.0002, zM:-.0659 }, { centerYM:2.7753, topHalfM:7.5592, sideHalfM:3.7796 }, 2.7825],
];
let negatives = 0;
for (const [id, anchor, projection, staleY] of cases) {
  Object.freeze(anchor); Object.freeze(projection);
  const before = JSON.stringify([anchor, projection]);
  const check = (a = anchor, p = projection, sa = anchor, sp = projection) =>
    presentationReceiptErrors(id, a, p, sa, sp);
  assert.deepEqual(check(), []);
  const stale = check(anchor, projection, anchor, { ...projection, centerYM:staleY });
  assert.equal(stale.length, 1); assert.match(stale[0], /projection\.centerYM/); negatives++;
  for (const [kind, fields] of [['anchor', ['xM', 'zM']], ['projection', ['centerYM', 'topHalfM', 'sideHalfM']]]) {
    for (const field of fields) for (const side of ['actual', 'saved']) {
      for (const bad of [undefined, NaN, Infinity, -Infinity, '1']) {
        const a = { ...anchor }, p = { ...projection }, sa = { ...anchor }, sp = { ...projection };
        const target = kind === 'anchor' ? (side === 'actual' ? a : sa) : (side === 'actual' ? p : sp);
        target[field] = bad;
        assert.ok(check(a, p, sa, sp).some(message => message.includes(`${kind}.${field}`))); negatives++;
      }
      const a = { ...anchor }, p = { ...projection }, sa = { ...anchor }, sp = { ...projection };
      const target = kind === 'anchor' ? (side === 'actual' ? a : sa) : (side === 'actual' ? p : sp);
      target[field] += .0001;
      assert.ok(check(a, p, sa, sp).some(message => message.includes(`${kind}.${field}`))); negatives++;
    }
  }
  for (const field of ['topHalfM', 'sideHalfM']) for (const invalid of [0, -.1]) {
    assert.match(check(anchor, { ...projection, [field]:invalid })[0], /must be positive/); negatives++;
    assert.match(check(anchor, projection, anchor, { ...projection, [field]:invalid })[0], /must be positive/); negatives++;
  }
  assert.equal(presentationReceiptErrors(id, undefined, undefined, undefined, undefined).length, 5); negatives++;
  assert.equal(check(null, null, null, null).length, 5); negatives++;
  assert.deepEqual(check({ xM:anchor.xM + .000001, zM:anchor.zM - .000001 }), [],
    'measured values use exactly the existing generator precision');
  assert.equal(JSON.stringify([anchor, projection]), before, 'validator never edits generated records');
}
for (const value of [-0, -.000001, 0, .000001, .000049, .000051, 1.23456, -1.23456, 2.7825]) {
  const rounded = Number(Number(value).toFixed(4));
  const legacy = Object.is(rounded, -0) ? '0' : String(rounded);
  assert.equal(presentationNumberSource(value), legacy, 'shared serializer is byte-identical to original generator');
}

// Wiring controls: targeted checks cannot bypass equality; live-only assets
// still avoid saved receipts, and stale metadata fails before server startup.
const centering = readFileSync(new URL('./presentation-centering.mjs', import.meta.url), 'utf8');
const assets = readFileSync(new URL('./tank-assets-check.mjs', import.meta.url), 'utf8');
const page = readFileSync(new URL('./icons-page.html', import.meta.url), 'utf8');
assert.ok(centering.indexOf('const receiptErrors = check ? ids.flatMap') < centering.indexOf('if (!selectedIds.length)'));
assert.match(centering, /presentationNumberSource as numberSource/);
assert.match(centering, /rows\[id\]\?\.currentAnchor, rows\[id\]\?\.capturedProjection,\s*TANK_PRESENTATION_ANCHORS\[id\], TANK_PRESENTATION_PROJECTIONS\[id\]/);
assert.match(page, /const capturedProjection = assetProjection\(iconBox, assetAnchor\)/);
assert.match(page, /import \{\s*TANK_ASSET_SCHEMA_VERSION, TANK_ASSET_VIEWS,/,
  'native audit requiredViews has its actual imported binding');
assert.match(page, /const iconProjection = assetProjection\(iconBox, \{ xM, zM \}\)/, 'full generation retains proposed centroid fit');
assert.match(centering, /if \(current !== expected\)/, 'keep full-fleet exact source equality');
assert.match(centering, /const MAX_RESIDUAL_PX = 0\.25;/);
assert.match(centering, /const MAX_EXPORTED_RESIDUAL_PX = 0\.5;/);
assert.match(assets, /const manifest = liveOnly \? null :/);
assert.match(assets, /if \(manifest\) \{\s*const receiptErrors/);
assert.ok(assets.indexOf('const receiptErrors') < assets.indexOf('const server = await createServer'));
assert.match(assets, /if \(saved\) failures\.push\(\.\.\.presentationReceiptErrors\(id,\s*live\.presentationAnchor, live\.presentationProjection,\s*saved\.presentationAnchor, saved\.presentationProjection\)\)/);

// A valid existing A7V image need not be re-framed to the latest pixel centroid.
const proposal = { xM:.0002, zM:-.0677 }, anchor = cases[1][1], projection = cases[1][2];
assert.deepEqual(presentationReceiptErrors('leo2a7v_x', anchor, projection, anchor, projection), []);
assert.ok(presentationReceiptErrors('leo2a7v_x', proposal, { ...projection, topHalfM:7.5611 }, anchor, projection).length,
  'retain the rejected proposal-as-capture policy as a negative witness'); negatives++;

// Synthetic byte fixtures test provenance/atomic source editing, not images.
const views = ['top','side','angle','topSilhouette','sideSilhouette','armorSide','modulesSide','crewSide','markings'];
const files = new Map(), manifest = { schemaVersion:8, requiredViews:views, tanks:{} };
const live = { schemaVersion:8, requiredViews:views, tanks:{} }, anchors = {};
const sourceLines = ['// untouched header'];
for (const [id, a, p, oldY] of cases) {
  anchors[id] = a;
  const record = { geometryHash:'12345678', metadataHash:'23456789', presentationHash:'34567890',
    presentationAnchor:a, presentationProjection:p, assets:{} };
  const requiredFiles = {};
  const asset = file => {
    const bytes = Buffer.from(file); files.set(file, bytes);
    return { file, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex') };
  };
  for (const view of views) {
    const file = `${id}_${view}.webp`; requiredFiles[view] = file;
    record.assets[view] = asset(file);
  }
  record.assets.angle.thumbnail = asset(`thumbs/${requiredFiles.angle}`);
  manifest.tanks[id] = record;
  live.tanks[id] = { ...record, requiredFiles };
  sourceLines.push(`  ${id}: Object.freeze({ xM: ${a.xM}, zM: ${a.zM} }),`,
    `  ${id}: Object.freeze({ centerYM: ${oldY}, topHalfM: ${p.topHalfM}, sideHalfM: ${p.sideHalfM} }),`);
}
sourceLines.push('  other_tank: Object.freeze({ centerYM: 9, topHalfM: 8, sideHalfM: 7 }),', '// untouched footer', '');
const source = sourceLines.join('\n'), ids = cases.map(row => row[0]);
const before = JSON.stringify([manifest, live, anchors]);
const readAsset = file => { assert.ok(files.has(file)); return files.get(file); };
const sync = (s = source, selected = ids, m = manifest, l = live, a = anchors, read = readAsset) =>
  syncAssetProjectionSource(s, selected, m, l, a, read);
const expected = source.replace('centerYM: 1.9893,', 'centerYM: 1.9843,').replace('centerYM: 2.7825,', 'centerYM: 2.7753,');
assert.equal(sync(), expected, 'only exact two projection rows change');
assert.equal(sync(expected), expected, 'sync is idempotent');
assert.equal(sync(source, [ids[0]]), source.replace('centerYM: 1.9893,', 'centerYM: 1.9843,'),
  'all anchors and every unselected projection remain byte-identical');
for (const selected of [[], [ids[0], ids[0]], ['../bad'], ['unknown_id'], null]) {
  assert.throws(() => sync(source, selected)); negatives++;
}
for (const key of ['geometryHash','metadataHash','presentationHash']) {
  const changed = structuredClone(live); changed.tanks[ids[0]][key] = 'ffffffff';
  assert.throws(() => sync(source, ids, manifest, changed), /stale native asset/); negatives++;
}
for (const mutate of [
  m => { delete m.tanks[ids[1]]; },
  m => { m.schemaVersion++; },
  m => { m.requiredViews = ['angle']; },
  m => { m.tanks[ids[0]].presentationAnchor.zM += .001; },
  m => { m.tanks[ids[0]].presentationProjection.centerYM += .001; },
  m => { delete m.tanks[ids[0]].assets.side; },
  m => { delete m.tanks[ids[0]].assets.angle.thumbnail; },
  m => { m.tanks[ids[0]].assets.top.sha256 = '0'.repeat(64); },
  m => { m.tanks[ids[0]].assets.top.bytes++; },
  m => { m.tanks[ids[0]].assets.top.file = '../other.webp'; },
]) {
  const changed = structuredClone(manifest); mutate(changed);
  assert.throws(() => sync(source, ids, changed)); negatives++;
}
for (const mutate of [
  l => { l.tanks[ids[0]].error = 'capture failed'; },
  l => { delete l.tanks[ids[0]].requiredFiles.side; },
  l => { l.tanks[ids[0]].presentationProjection.topHalfM += .001; },
  l => { l.tanks[ids[0]].presentationAnchor.xM += .001; },
]) {
  const changed = structuredClone(live); mutate(changed);
  assert.throws(() => sync(source, ids, manifest, changed)); negatives++;
}
assert.throws(() => sync(source, ids, manifest, live, anchors, () => Buffer.from('tampered bytes'))); negatives++;
assert.throws(() => sync(source.replace(sourceLines[1], ''))); negatives++;
assert.throws(() => sync(source + sourceLines[2] + '\n')); negatives++;
assert.throws(() => sync(source.replace(sourceLines[2], ''))); negatives++;
assert.equal(JSON.stringify([manifest, live, anchors]), before, 'success and rejected syncs never mutate inputs');
assert.match(centering, /if \(syncAssets && !selectedIds\.length\)/);
assert.match(centering, /window\.__AUDIT\(tankIds\)/);
assert.match(centering, /readFileSync\(outputPath, 'utf8'\) !== before/, 'reject concurrent generated-source changes');
assert.match(centering, /target\.startsWith\(`\$\{iconsRoot\}\$\{sep\}`\)/);

// Selected native regeneration changes the paired anchor/projection, not just
// old-image metadata. No immutable golden or acceptance threshold is replaced.
const selectedId=ids[0],savedProjections=Object.fromEntries(cases.map(([id,,p])=>[id,p]));
const nativeRow={xM:.0012,zM:.0901,currentAnchor:anchors[selectedId],
  projection:{...savedProjections[selectedId],topHalfM:6.4645}};
const measuredRows={[selectedId]:nativeRow};
const nativeSnapshot=JSON.stringify(measuredRows);
const updateSelected=(s=expected,sel=[selectedId],r=measuredRows)=>
  updateSelectedPresentationSource(s,sel,r,anchors,savedProjections);
const updated=updateSelected();
assert.equal(updated,expected.replace('xM: 0, zM: 0.0788','xM: 0.0012, zM: 0.0901').replace('topHalfM: 6.4532','topHalfM: 6.4645'));
assert.equal(updated.split('\n').filter((line,i)=>line!==expected.split('\n')[i]).length,2,'only two exact selected rows change');
for(const sel of [[],[selectedId,selectedId],['../bad'],['unknown'],null])assert.throws(()=>updateSelected(expected,sel));
for(const mutate of [
  r=>{r.extra=r[selectedId];},r=>{delete r[selectedId];},r=>{r[selectedId].error='capture failure';},
  r=>{r[selectedId].currentAnchor.zM+=.01;},r=>{r[selectedId].xM=NaN;},
  r=>{r[selectedId].zM='0';},r=>{r[selectedId].projection.centerYM=Infinity;},
  r=>{r[selectedId].projection.topHalfM=0;},r=>{r[selectedId].projection.sideHalfM=.000001;},
]){const bad=structuredClone(measuredRows);mutate(bad);assert.throws(()=>updateSelected(expected,[selectedId],bad));}
for(const line of expected.split('\n').filter(line=>line.startsWith(`  ${selectedId}:`))){
  assert.throws(()=>updateSelected(expected.replace(line,'')));
  assert.throws(()=>updateSelected(expected+'\n'+line));
}
assert.equal(JSON.stringify(measuredRows),nativeSnapshot,'generation transform never edits input measurements');
assert.match(centering,/updateSelectedPresentationSource\(originalSource, ids, rows/);
assert.match(centering,/readFileSync\(outputPath, 'utf8'\) !== originalSource/);
for(const args of [['--update','--ids='],['--update','--ids']]){
  const rejected=spawnSync(process.execPath,[new URL('./presentation-centering.mjs',import.meta.url).pathname,...args],{encoding:'utf8'});
  assert.equal(rejected.status,2,`empty explicit scope cannot become a full-fleet rewrite: ${rejected.stderr}`);
  assert.match(rejected.stderr,/explicit --ids scope must not be empty/);
  assert.equal(rejected.stdout,'','invalid CLI scope exits before browser launch');
}
console.log(`presentation-receipt: existing capture framing, original stale-Y failures, ${negatives} rejected mutations, hash-verified atomic scoped sync and both preflight consumers PASS`);
