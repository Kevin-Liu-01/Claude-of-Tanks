import {isPhotoReference,photoReceiptPassed} from './photo-reference-policy.mjs';
import {readPhotoReference} from './photo-reference-record.mjs';
import {FLEET_GROUP_BY_ID} from '../src/vehicles/fleetManifest.ts';
import {readConceptDesign} from './first-party-concept-record.mjs';
import {firstPartyConcept,partitionConceptIds,validateSelectedIds,conceptReceiptPassed} from './first-party-concept-policy.mjs';
import {boundOrigin, toolServerOptions} from './tool-page-load.mjs';
import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
import { strictTrackClipPassed } from './track-clip-result.mjs';
import { geometryReceiptPassed } from './geometry-gate-policy.mjs';
import { roofEquipmentVerdict } from './source-equipment-policy.mjs';
import { verifyConfigurationSource } from './source-configuration-record.mjs';
import { measureSourceOpenings } from './source-opening-check.mjs';
import { isArieteOpeningTarget } from './ariete-source-openings.mjs';
import { runCapturedCommand } from './capture-command.mjs';
import { withIsolatedCaptureBrowser } from './isolated-capture-browser.mjs';
import { createStageRunner, formatStageSummary, stageStatus, summarizeStages } from './standard-check-stages.mjs';
import { contiguityPassed } from './contig-grid.mjs';
import { CONTIG_HIDDEN_LEDGER, applyHiddenGaps, readHiddenLedger } from './contig-hidden-gaps.mjs';
// TANK STANDARD CHECK v2 (docs/BUILD-STANDARD.md §F.3) — one command that
// aggregates the standard's machine-checkable gates per tank:
//   A.  geometry-gate components (latest docs/geometry-gate/<id>.json,
//       staleness-flagged; use --gate to force a fresh run first)
//   B4. track containment (tools/track-clip-audit.mjs --exact)
//   B2. CONTIGUITY (v2): top-down ~6 cm scan on the procedural build via
//       tools/standard-check-page.html — enclosed sky cells inside the plan
//       silhouette remain raw holes. The grid is the hull-anchored lattice of
//       tools/contig-grid.mjs (2026-10-16): fixed 6 cm cells in the vehicle
//       frame, so an add-on that only moves the AABB cannot hide or reveal a
//       gap, scanned at every sub-cell phase; a phase-only hole (one the
//       primary raster misses) fails like an unexpected hole. The gaps the
//       lattice finds and the pre-227 raster never saw are listed per id in
//       docs/geometry-gate/contig-hidden.json (guards 229, the fleet audit):
//       known work orders, reported on every run; any other gap, or a listed
//       one grown past its box, fails. Every approved exterior opening must
//       match complete-source air and finite stock witnesses; unexpected
//       holes remain zero. FrontSide render truth doubles as
//       the winding audit.
//   B3. DECORATION census (v2): KIT.fittings marker roots on the procedural
//       build — real rendered pintleMG/openYokeRws stock + other fitting
//       dressing. Hand-authored decoration carries no markers and censuses
//       ZERO: migrate the profile to KIT.fittings (kit.js) or carry a packet
//       justification for a real hand-authored weapon. Owner-approved source
//       configurations pin exact counts by original hash; others need mg>=1, except a vehicle whose real counterpart
//       carries no roof weapon (src/vehicles/roofWeaponPolicy.ts, VH.14 2026-10-14), which needs mg 0.
// Usage:
//   node tools/tank-standard-check.mjs --ids=a,b [--gate] [--no-render] [--stages]
//   node tools/tank-standard-check.mjs --fixture     # KIT.fittings self-test
// --stages (2026-10-16, test-speed R4b): run and report EVERY stage (A geometry/concept/photo, B4 clip, B2 contiguity,
//   B3 decor) for every id instead of stopping at the first failing stage; print a per-stage summary and write
//   <out>/stages.json. The exit stays 2 when any gated stage fails for any id or any stage itself fails. --gate keeps
//   its meaning: a fresh geometry run whose stale or failed packet fails the A stage (tools/standard-check-stages.mjs).
// Own vite 74xx-77xx; cot-shots FIFO lock held around the render phase only
// (the fresh geometry phase is wrapped here; track-clip manages its own turn).
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tankSeedId } from '../src/vehicles/tankIdAliases.ts';

const { configurations: studyConfigurations } = JSON.parse(readFileSync(new URL('../docs/references/batches/supplied-afv-configurations.json', import.meta.url), 'utf8'));
// The source-study records keep the spelling the study was registered under; a vehicle renamed through the tank id
// alias layer reads its study's record by its schema-1 id (SSOT 2.19).
const configurations = new Proxy(studyConfigurations, {
  get(target, key) {
    if (typeof key !== 'string' || Object.hasOwn(target, key)) return target[key];
    const study = target[tankSeedId(key)];
    return study ? { ...study, id: key } : undefined;
  },
});
const sourceReceipts = new Map();
const openingReports = new Map();
const conceptReports = new Map();
const photoReports = new Map();

const idArg = process.argv.find((a) => a.startsWith('--ids='));
const wantFixture = process.argv.includes('--fixture');
if (!idArg && !wantFixture) {
  console.error('usage: node tools/tank-standard-check.mjs --ids=a,b [--gate] [--no-render] [--stages] | --fixture');
  process.exit(1);
}
const ids = idArg ? idArg.slice(6).split(',') : [];
if (ids.some(id=>!/^[a-z0-9_]+$/.test(id)) || new Set(ids).size!==ids.length) throw new Error('Expected unique tank IDs');
if (ids.length) validateSelectedIds(ids,Object.keys(FLEET_GROUP_BY_ID));
const reportRoot=path.resolve(process.argv.find(arg=>arg.startsWith('--out='))?.slice(6) || '.qa-dev/reports/tank-standard');
const forceGate = process.argv.includes('--gate');
const noRender = process.argv.includes('--no-render');
// Without --stages every stage.run() propagates its failure exactly as the bare phase did.
const stages = createStageRunner({ runAll: process.argv.includes('--stages'), log: (line) => console.error(line) });
/** One phase child under the capture queue; its failure names the tool rather than the node binary. */
async function runChild(tool, args) {
  try {
    await runCapturedCommand(process.execPath, [tool, ...args]);
  } catch (error) {
    const reason = String(error?.message ?? error).replace(`${process.execPath} `, '');
    throw Object.assign(new Error(`${tool} ${reason}`), { status: error?.status, cause: error });
  }
}

// --- exclusive render lock (same protocol as tools/screenshot.mjs) ----------

process.on('exit', releaseLock);

// --- phase 0: optional fresh gate run (serialized around its browser child) -
// A forced run requires every registered comparison oracle to be present and
// every packet to be freshly measured. geometry-gate --check owns the
// fail-closed oracle census; the mtime check below prevents a stale packet from
// being reported as evidence for this release run.
let freshGateStartedAt = null;
if (forceGate && ids.length) {
  // --check makes a missing registered oracle or a sub-floor measurement a
  // hard release failure rather than treating it as a procedural-only ID.
  freshGateStartedAt = Date.now();
  // --stages: a red geometry run is recorded; each id's A stage then reads its fresh (or missing) packet below.
  await stages.run('geometry', () => runChild('tools/geometry-gate.mjs', [`--ids=${ids.join(',')}`, '--check']));
}

// Fresh native design proof replaces ONLY obsolete comparison assertions.
const conceptStartedAt=Date.now();
const conceptIds=partitionConceptIds(ids).concepts;
const conceptDesignHashes=new Map();
for(const id of conceptIds)await stages.run('concept',()=>{conceptDesignHashes.set(id,readConceptDesign(id).designSha256);},id);
if(conceptIds.length) {
  const out=path.join(reportRoot,'concepts');
  await stages.run('concept',()=>runChild('tools/first-party-concept-check.mjs',[`--ids=${conceptIds.join(',')}`,`--out=${out}`]));
  for(const id of conceptIds) await stages.run('concept',()=>{
    const report=JSON.parse(readFileSync(path.join(out,`${id}.json`),'utf8'));
    if(!conceptReceiptPassed(id,report,conceptStartedAt,conceptDesignHashes.get(id)))throw new Error(`${id}: missing/stale concept proof`);
    conceptReports.set(id,report);
  },id);
}

// Photographic approval changes only numerical 3D comparison. It still needs
// fresh dimensions/configuration and every unchanged downstream physical gate.
const photoStartedAt=Date.now();
const photoIds=ids.filter(isPhotoReference);
const photoDocuments=new Map();
for(const id of photoIds)await stages.run('photo',()=>{photoDocuments.set(id,readPhotoReference(id));},id);
if(photoIds.length){
  // The equipment configuration comes from the photo document alone, so B3 reports its own verdict even when the
  // photo proof below fails (--stages); without --stages a failed proof still stops the run before B3.
  for(const [id,doc] of photoDocuments)
    configurations[id]={id,comparisonPurpose:'photographic-reference',roofMachineGuns:doc.target.roofMachineGuns,packetSha256:doc.packetSha256};
  const out=path.join(reportRoot,'photos');
  await stages.run('photo',()=>runChild('tools/photo-reference-check.mjs',[`--ids=${photoIds.join(',')}`,`--out=${out}`]));
  for(const id of photoIds) await stages.run('photo',()=>{
    const doc=photoDocuments.get(id),report=JSON.parse(readFileSync(path.join(out,`${id}.json`),'utf8'));
    if(!doc||!photoReceiptPassed(id,report,doc.packet,doc.packetSha256,photoStartedAt))throw new Error(`${id}: missing/stale photo physical proof`);
    photoReports.set(id,report);
  },id);
}

// --- phase 1: containment (one batched run; manages its own lock) -----------
const clip = new Map();
function readClipRows(out) {
  for (const line of out.split('\n')) {
    const m = line.match(/\[track-clip\] (\S+)\s+front\s+(\S+) rear\s+(\S+)/);
    const s = line.match(/\| strict sweep (\S+)\/(\S+)/);
    if (m) clip.set(m[1], { front: m[2], rear: m[3], sweepBand: s?.[1] ?? '—', sweepShoe: s?.[2] ?? '—' });
  }
}
if (ids.length) {
  try {
    readClipRows(execFileSync('node', ['tools/track-clip-audit.mjs', '--exact', '--strict', `--ids=${ids.join(',')}`,
      `--out-dir=${path.join(reportRoot, 'tracks')}`],
      { encoding: 'utf8' }));
  } catch (e) {
    console.error('[standard-check] track-clip audit failed:', e.message.slice(0, 120));
    // --stages: keep the rows the audit printed before it failed (an id without a row still fails B4), and fail the
    // run on the audit's own failure.
    if (stages.runAll) {
      readClipRows(String(e.stdout ?? ''));
      stages.fail('clip', e);
    }
  }
}

// --- phase 2: census + contiguity via the committed page --------------------
async function readLowQualityScan(page,base,id) {
  try {
    await page.goto(`${base}?id=${id}&quality=low`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__STANDARD_READY === true', { polling: 50 });
    return await page.evaluate('window.__STANDARD');
  } catch(error) {
    return {id,quality:'low',error:String(error.message || error)};
  }
}
const standard = new Map(); // id -> { census, holes } | { error }
const hiddenLedger = readHiddenLedger();
let fixture = null;
if ((ids.length && !noRender) || wantFixture) await stages.run('render', async () => {
  await acquireLock(20 * 60 * 1000);
  const lockRefresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
  lockRefresher.unref();
  try {
    await withIsolatedCaptureBrowser({
    root: process.cwd(), logLevel: 'error',
    // R4c (2026-10-16): 127.0.0.1 and the address really bound, never `localhost` (an IPv6 bind can leave 127.0.0.1 to another server)
    server: toolServerOptions(7400, { span: 400 }),
  }, {
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  }, async ({ server, browser }) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    let pageError = null;
    page.on('pageerror', (e) => { pageError = String(e && e.message || e).slice(0, 160); });
    const base = `${boundOrigin(server)}/tools/standard-check-page.html`;
    if (!noRender) {
      for (const id of ids) {
        pageError = null;
        try {
          await page.goto(`${base}?id=${id}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction('window.__STANDARD_READY === true', { polling: 50 });
          const r = await page.evaluate('window.__STANDARD');
          if (!r.error && isArieteOpeningTarget(id)) {
            r.qualityScans = {low:await readLowQualityScan(page,base,id)};
          }
          standard.set(id, r.error ? { error: r.error } : r);
        } catch (e) {
          standard.set(id, { error: (pageError || e.message).slice(0, 160) });
        }
      }
    }
    if (wantFixture) {
      await page.goto(`${base}?fixture=fittings`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__FIXTURE_READY === true', { polling: 50 });
      fixture = await page.evaluate('window.__FIXTURE');
    }
    });
    // --stages: one id's source verification failing leaves every other id's B2/B3 evidence intact.
    for (const id of ids) await stages.run('contiguity', async () => {
      const configuration = configurations[id];
      const photo=photoDocuments.get(id);
      const sourceReceipt = photo ? {id,verified:true,path:photo.packetPath,sha256:photo.packetSha256}
        : configuration ? verifyConfigurationSource(id, configuration) : null;
      sourceReceipts.set(id, sourceReceipt);
      const result = standard.get(id);
      if (!result || result.error || !result.holes) return;
      // the fleet audit's hidden gaps (tools/contig-hidden-gaps.mjs): listed gaps are known, anything else still fails
      const hidden = applyHiddenGaps(result.holes, hiddenLedger?.rows?.[id]);
      result.latticeHoles = result.holes;
      result.holes = hidden.scan;
      result.hiddenGaps = { listed: hidden.listed.length, removedPrimary: hidden.removedPrimary, closed: hidden.closed };
      try {
        openingReports.set(id, await measureSourceOpenings(id, result.holes, configuration, sourceReceipt, result.qualityScans));
      } catch (error) {
        openingReports.set(id, { passed:false, reason:String(error.message || error) });
      }
      mkdirSync(reportRoot,{recursive:true});
      writeFileSync(path.join(reportRoot,`${id}.json`),JSON.stringify({
        id,recordedAt:new Date().toISOString(),standard:result,
        sourceReceipt,configuration:configuration??null,
        concept:conceptReports.get(id)??null,
        photographicReference:photoReports.get(id)??null,
        equipment:roofEquipmentVerdict(id,result.census,configuration,sourceReceipt),
        continuity:openingReports.get(id),
      },null,2)+'\n');
    }, id);
  } finally {
    clearInterval(lockRefresher);
    releaseLock();
  }
});

// --- fixture report ----------------------------------------------------------
// A requested fixture that never reported (its render stage failed under --stages) is a failure, not a pass.
let fixtureFailed = wantFixture && !fixture;
if (fixture) {
  console.log('[standard-check] KIT.fittings self-test');
  for (const r of fixture.results) {
    console.log(`  ${r.label.padEnd(18)} meshes ${String(r.meshes).padStart(2)}  hash ${r.hash.padEnd(8)}` +
      `  top-cover ${String(r.coveredCells).padStart(4)} cells  enclosed ${r.holeCells}`);
  }
  if (fixture.failures.length) {
    fixtureFailed = true;
    for (const f of fixture.failures) console.log(`  FAIL: ${f}`);
  }
  console.log(`[standard-check] fixture ${fixture.ok ? 'PASS' : 'FAIL'} ` +
    `(${fixture.results.length} builds, ${fixture.failures.length} failures)`);
  if (!ids.length) process.exit(fixtureFailed || stages.failures.length ? 2 : 0);
  console.log('');
}

// --- per-tank table ----------------------------------------------------------
const CLIP_BAND = 0; // strict owner law: no non-running-gear solid may enter the animated sweep
console.log('id                 | gateMin | components (h/w/t/st/d/f)      | age  | clip f/r+sweep | contig | decor');
console.log('-------------------|---------|--------------------------------|------|----------------|--------|------------');
let fails = 0;
const stageRows = []; // --stages: one verdict per stage per id (tools/standard-check-stages.mjs)
for (const id of ids) {
  let row = 'procedural-only', min = 'N/A', age = '—';
  let gateRequired = 90;
  let gateApplicable = false;
  let exactGatePassed = false;
  const concept=firstPartyConcept(id);
  if(!concept&&!isPhotoReference(id))try {
    const p = `docs/geometry-gate/${id}.json`;
    const j = JSON.parse(readFileSync(p, 'utf8'));
    const packetMtime = statSync(p).mtimeMs;
    gateApplicable = freshGateStartedAt === null || packetMtime >= freshGateStartedAt;
    const c = j.components;
    if (gateApplicable) {
      min = j.geoMin;
      gateRequired = Number.isFinite(j.requiredMinimum) ? j.requiredMinimum : 90;
      exactGatePassed = geometryReceiptPassed(j);
      row = [c.hullCurves, c.wholeCurves, c.turretCurves, c.stations, c.dims, c.floaters].join('/');
      age = `${Math.round((Date.now() - packetMtime) / 60000)}m`;
    }
  } catch { /* keep placeholder */ }
  const cl = clip.get(id);
  const clipStr = cl ? `${cl.front}/${cl.rear}+${cl.sweepBand}/${cl.sweepShoe}` : '—';
  const clipOk = strictTrackClipPassed(cl);
  // Classified by id, not by document: a photo id whose document failed to load (--stages) fails its A stage.
  const photoId=isPhotoReference(id), photo=photoDocuments.get(id);
  const gateOk = photoId
    ? Boolean(photo) && photoReceiptPassed(id,photoReports.get(id),photo.packet,photo.packetSha256,photoStartedAt)
    : concept
    ? conceptReceiptPassed(id,conceptReports.get(id),conceptStartedAt,conceptDesignHashes.get(id))
    : forceGate ? gateApplicable && exactGatePassed : !gateApplicable || exactGatePassed;
  if(concept){row='concept: comparison N/A';gateRequired='N/A';}
  if(photoId){row='photo; 3D score UNVERIFIED';gateRequired='—';}

  const st = standard.get(id);
  let contigStr = 'SKIP', decorStr = 'SKIP', contigOk = true, decorOk = true;
  if (!noRender) {
    if (!st || st.error) {
      contigStr = 'ERR'; decorStr = 'ERR'; contigOk = false; decorOk = false;
      if (st && st.error) console.error(`[standard-check] ${id}: ${st.error}`);
    } else if (!st.holes || st.holes.error) {
      contigStr = 'ERR'; contigOk = false;
      console.error(`[standard-check] ${id} hole scan: ${st.holes?.error ?? 'missing'}`);
      decorOk = roofEquipmentVerdict(id, st.census, configurations[id], sourceReceipts.get(id)).passed;
      decorStr = `mg${st.census?.mg}+${st.census?.dressing}d${decorOk ? ' ✓' : ' ✗'}`;
    } else {
      const holes = st.holes.holeCells;
      const opening = openingReports.get(id);
      const phaseOnly = st.holes.phaseOnlyCells;
      contigOk = contiguityPassed(st.holes, opening);
      contigStr = (opening?.intentionalCells
        ? `${opening.unexpectedCells} unexpected/${holes} raw`
        : `${holes}`) + (phaseOnly ? `+${phaseOnly}φ` : '') + (contigOk ? ' ✓' : ' ✗');
      if (opening?.reason) console.error(`[standard-check] ${id}: ${opening.reason}`);
      if (phaseOnly !== 0) {
        console.error(`[standard-check] ${id} phase-only holes (the primary 6 cm raster misses them; another sub-cell ` +
          `phase of the hull-anchored lattice sees them; ${CONTIG_HIDDEN_LEDGER} does not list them): ` + (st.holes.phaseOnlyGaps ?? [])
          .map((g) => `(x ${g.x}, z ${g.z}) ${g.w}x${g.d} m gap ${g.gap} m`).join(', '));
      }
      if (st.hiddenGaps?.listed) {
        console.error(`[standard-check] ${id}: ${st.hiddenGaps.listed} known hidden gap(s) listed in ${CONTIG_HIDDEN_LEDGER} ` +
          `(the fleet audit's vehicle-lane work orders; node tools/contig-hidden-gaps.mjs --report)`);
      }
      if (st.hiddenGaps?.closed?.length) {
        console.error(`[standard-check] ${id}: ${st.hiddenGaps.closed.length} listed hidden gap(s) no longer read: closed, ` +
          'prune them (node tools/contig-phase-audit.mjs --ids=<id>, then node tools/contig-hidden-gaps.mjs --from=<audit.jsonl> --prune --ids=<id>)');
      }
      decorOk = roofEquipmentVerdict(id, st.census, configurations[id], sourceReceipts.get(id)).passed;
      decorStr = `mg${st.census?.mg}+${st.census?.dressing}d${decorOk ? ' ✓' : ' ✗'}`;
      if (!contigOk && st.holes.clusters?.length) {
        console.error(`[standard-check] ${id} holes at ` +
          st.holes.clusters.map((c) => `(x ${c.x}, z ${c.z}) ${c.cells}c`).join(', '));
      }
    }
  }
  if (!gateOk || !clipOk || !contigOk || !decorOk) fails++;
  const aStage = concept ? 'concept' : photoId ? 'photo' : 'geometry';
  stageRows.push({ id, stages: {
    // A comparison id with no packet outside --gate stays procedural-only: N/A, never a failure (as before).
    [aStage]: gateOk && aStage === 'geometry' && !gateApplicable ? 'N/A' : stageStatus(true, gateOk),
    clip: stageStatus(true, clipOk),
    contiguity: stageStatus(!noRender, contigOk),
    decor: stageStatus(!noRender, decorOk),
  } });
  console.log(
    `${id.padEnd(19)}| ${String(min).padStart(4)}/${String(gateRequired).padEnd(2)} | ${String(row).padEnd(31)}| ${String(age).padStart(4)} | ` +
    `${clipStr.padStart(14)}${cl ? (clipOk ? ' ✓' : ' ✗') : '  '}| ${contigStr.padStart(6)} | ${decorStr}`);
}
if (ids.length) {
  console.log(`\n[standard-check] ${ids.length - fails}/${ids.length} pass the machine-checkable gates ` +
    `(registered gate floor 90 fleet / 92 exemplar; --gate requires fresh registered oracles + clip<=${CLIP_BAND}${noRender ? '' : ' + unexpected holes=0 at every hull-anchored phase (φ = phase-only) + verified equipment configuration'}).`);
  if (!noRender) {
    console.log('[standard-check] decor censuses KIT.fittings markers only (§B3): hand-authored ' +
      'decoration predating the fittings library reads mg0+0d — migrate the profile to ' +
      'KIT.fittings.<fn> or carry a packet justification for a real hand-authored weapon. Source-specific counts require the approved original hash; other vehicles retain mg>=1, except those listed in src/vehicles/roofWeaponPolicy.ts (no roof weapon on the real vehicle: mg 0).');
  }
}
let stageSummary = null;
if (stages.runAll && ids.length) {
  stageSummary = summarizeStages(stageRows, stages.failures);
  console.log('');
  for (const line of formatStageSummary(stageSummary)) console.log(line);
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(path.join(reportRoot, 'stages.json'), JSON.stringify({
    recordedAt: new Date().toISOString(), ids, gate: forceGate, render: !noRender, summary: stageSummary, rows: stageRows,
  }, null, 2) + '\n');
}
// Without --stages no failure is ever recorded (each stage.run() propagated it), so the exit is unchanged.
process.exit(fails || fixtureFailed || stages.failures.length || (stageSummary && !stageSummary.passed) ? 2 : 0);
