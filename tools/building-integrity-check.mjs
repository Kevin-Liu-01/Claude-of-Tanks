#!/usr/bin/env node
// Building integrity check (the buildings stream, 2026-10-12): is every building closed and seated? Roofs meet their
// walls, no open undersides or missing faces seen from outside, no floating parts, no inside-out faces, no degenerate
// or stretched faces. The per-building geometry checks are tools/building-integrity-core.mjs; this tool feeds them.
//
//   node tools/building-integrity-check.mjs --source=maps [--maps=urban,cliffbridge] [--json=path] [--top=20]
//   node tools/building-integrity-check.mjs --source=kits [--kits=franconian] [--seeds=11,29] [--json=path]
//   node tools/building-integrity-check.mjs --source=kits --ledger=docs/geometry-gate/building-integrity.json --gate
//   node tools/building-integrity-check.mjs --self-test
//
// --source=maps builds each battlefield's props in Node with the seeds its collision shard is captured at
// (tools/headlessWorldCollision.mjs) and checks every structure as it stands in the world: its parts read back from
// the merged buckets through the destruction seam's spans (props.ts structureSpans), its ground the terrain, its
// neighbours' surfaces occluding it (a party wall its neighbour covers is not open). Planned buildings, street rows,
// set pieces (landmarks) and generic catalog buildings alike.
// --source=kits builds every builder of every regional kit (under its own map), the generic catalog builders and every
// map's set pieces on flat ground, from several seeds: the fast census the selftest gates (the ratchet).
// --ledger gates each row (kit/builder) against the committed census: no row may add floating parts, nor more than
// max(0.05 m2, 10 %) of any open kind's worst view, nor slivers. --update-ledger rewrites the rows checked.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { analyseBuilding, severity as coreSeverity, FLAG_FINE, FLAG_TRANSPARENT, FLAG_DOUBLE } from './building-integrity-core.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const list = (name) => (opt(name, '') || '').split(',').map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------------------------------------ self-test
if (flag('self-test')) {
  const { selfTest } = await import('./building-integrity-fixtures.mjs');
  const ok = selfTest((line) => console.log(line));
  console.log(ok ? 'self-test PASS' : 'self-test FAIL');
  process.exit(ok ? 0 : 1);
}

const source = opt('source', 'kits');
const top = Number(opt('top', '25'));
const jsonPath = opt('json', '');
const ledgerPath = opt('ledger', '');
const rows = [];
const started = performance.now();

/** Flatten bucket geometries (non-indexed or indexed) into the core's triangle arrays. */
function packParts(parts, { includeFine = true, matrix = null } = {}) {
  const buckets = []; const bucketIndex = new Map();
  let triCount = 0;
  const geos = [];
  for (const [bucket, geometries] of Object.entries(parts)) {
    if (!Array.isArray(geometries)) continue;
    for (const g of geometries) {
      const p = g?.getAttribute?.('position'); if (!p) continue;
      if (!includeFine && g.userData?.fine) continue;
      const n = (g.index ? g.index.count : p.count) / 3; triCount += n; geos.push([bucket, g, n]);
    }
  }
  const pos = new Float32Array(triCount * 9), flags = new Uint8Array(triCount), bucketOf = new Uint8Array(triCount);
  let t = 0;
  for (const [bucket, g, n] of geos) {
    let bi = bucketIndex.get(bucket); if (bi === undefined) { bi = buckets.length; buckets.push(bucket); bucketIndex.set(bucket, bi); }
    const p = g.getAttribute('position'), idx = g.index ? g.index.array : null; const fine = g.userData?.fine ? FLAG_FINE : 0;
    for (let k = 0; k < n; k++, t++) {
      for (let c = 0; c < 3; c++) {
        const v = idx ? idx[k * 3 + c] : k * 3 + c;
        let x = p.getX(v), y = p.getY(v), z = p.getZ(v);
        if (matrix) { const e = matrix; const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; x = X; y = Y; z = Z; }
        pos[t * 9 + c * 3] = x; pos[t * 9 + c * 3 + 1] = y; pos[t * 9 + c * 3 + 2] = z;
      }
      flags[t] = fine; bucketOf[t] = bi;
    }
  }
  return { pos, flags, bucketOf, buckets };
}

function severity(r, builder = '') {
  if (!OPEN_BY_DESIGN.has(builder)) return coreSeverity(r);
  return coreSeverity({ ...r, kinds: { hole: r.kinds?.hole, inverted: r.kinds?.inverted } });
}

/** A PNG per view with findings: front faces grey by depth, holes red, inverted orange, inside blue, gaps magenta. */
async function writeRasters(dir, stem, rasters = []) {
  const { createCanvas } = await import('@napi-rs/canvas');
  mkdirSync(dir, { recursive: true });
  for (const v of rasters) {
    const R = v.RES; const canvas = createCanvas(R, R); const ctx = canvas.getContext('2d'); const img = ctx.createImageData(R, R);
    let lo = Infinity, hi = -Infinity;
    for (let p = 0; p < R * R; p++) if (v.zF[p] !== Infinity) { lo = Math.min(lo, v.zF[p]); hi = Math.max(hi, v.zF[p]); }
    for (let p = 0; p < R * R; p++) {
      let c = [18, 20, 24];
      if (v.zF[p] !== Infinity) { const g = 210 - 140 * (v.zF[p] - lo) / Math.max(0.1, hi - lo); c = [g, g, g]; }
      else if (v.zB[p] !== Infinity) c = [90, 40, 40];
      const k = v.kind[p];
      if (k === 1) c = [235, 40, 40]; else if (k === 2) c = [240, 170, 40]; else if (k === 3) c = [60, 120, 255]; else if (k === 4) c = [230, 60, 230];
      const q = ((R - 1 - Math.floor(p / R)) * R + (p % R)) * 4;
      img.data[q] = c[0]; img.data[q + 1] = c[1]; img.data[q + 2] = c[2]; img.data[q + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    writeFileSync(resolve(dir, `${stem}__${v.name}.png`), canvas.toBuffer('image/png'));
  }
}

/**
 * Builders open by design: a ruin's broken walls and fallen roof show sky and their inside (only what floats, faces
 * inside out or is degenerate counts there).
 */
const OPEN_BY_DESIGN = new Set(['ruin']);
function summarise(r, builder = '') {
  const k = r.kinds ?? {};
  const open = OPEN_BY_DESIGN.has(builder);
  return { floating: r.floating.length, floatingM2: +r.floating.reduce((s, f) => s + f.areaM2, 0).toFixed(3),
    holeM2: k.hole?.maxViewM2 ?? 0, insideM2: open ? 0 : k.inside?.maxViewM2 ?? 0, gapM2: open ? 0 : k.gap?.maxViewM2 ?? 0, invertedM2: k.inverted?.maxViewM2 ?? 0,
    degenerate: r.degenerate, sliver: r.sliver };
}

function printRow(row) {
  const s = row.summary;
  const parts = [`${row.key}`, `sev ${row.severity}`, `${row.tris} tris`, `${JSON.stringify(row.detail?.ms ?? {})}`];
  if (s.floating) parts.push(`floating ${s.floating} (${s.floatingM2} m2)`);
  for (const k of ['hole', 'inside', 'gap', 'inverted']) if (s[k + 'M2']) parts.push(`${k} ${s[k + 'M2']} m2`);
  if (s.sliver) parts.push(`sliver ${s.sliver}`);
  console.log(parts.join(' | '));
}

// ------------------------------------------------------------------------------------------------ maps
/** A map's structures as the maps source reads them, cached on disk (--dump=dir writes, --from-dump=dir reads). */
function writeDump(dir, mapId, structures, groundSample) {
  mkdirSync(dir, { recursive: true });
  const meta = { mapId, ground: groundSample, structures: structures.map((s) => ({ idx: s.idx, builder: s.builder, style: s.style, box: s.box, buckets: s.own.buckets, tris: s.own.pos.length / 9 })) };
  const chunks = [];
  for (const s of structures) chunks.push(Buffer.from(s.own.pos.buffer, s.own.pos.byteOffset, s.own.pos.byteLength), Buffer.from(s.own.flags), Buffer.from(s.own.bucketOf));
  writeFileSync(resolve(dir, `${mapId}.json`), JSON.stringify(meta));
  writeFileSync(resolve(dir, `${mapId}.bin`), Buffer.concat(chunks));
}
function readDump(dir, mapId) {
  const meta = JSON.parse(readFileSync(resolve(dir, `${mapId}.json`), 'utf8'));
  const bin = readFileSync(resolve(dir, `${mapId}.bin`)); let o = 0;
  const structures = meta.structures.map((m) => {
    const n = m.tris; const pos = new Float32Array(n * 9);
    for (let i = 0; i < n * 9; i++) pos[i] = bin.readFloatLE(o + i * 4);
    o += n * 36; const flags = new Uint8Array(bin.subarray(o, o + n)); o += n; const bucketOf = new Uint8Array(bin.subarray(o, o + n)); o += n;
    return { idx: m.idx, builder: m.builder, style: m.style, box: m.box, own: { pos, flags, bucketOf, buckets: m.buckets } };
  });
  return { structures, ground: meta.ground };
}
/** The terrain under a map's structures, sampled on a 1 m grid round each (for the dump: no height field on reload). */
function sampleGround(structures, field) {
  const out = {};
  for (const s of structures) {
    const x0 = Math.floor(s.box[0] - 3), x1 = Math.ceil(s.box[3] + 3), z0 = Math.floor(s.box[2] - 3), z1 = Math.ceil(s.box[5] + 3);
    const nx = x1 - x0 + 1, nz = z1 - z0 + 1, h = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h.push(+field.getHeightAt(x0 + i, z0 + j).toFixed(3));
    out[s.idx] = { x0, z0, nx, nz, h };
  }
  return out;
}
function groundFromSample(g) {
  return (x, z) => {
    let fx = x - g.x0, fz = z - g.z0;
    fx = Math.max(0, Math.min(g.nx - 1.001, fx)); fz = Math.max(0, Math.min(g.nz - 1.001, fz));
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * g.nx + i;
    return (g.h[k] * (1 - u) + g.h[k + 1] * u) * (1 - v) + (g.h[k + g.nx] * (1 - u) + g.h[k + g.nx + 1] * u) * v;
  };
}

async function checkStructures(mapId, structures, groundOf) {
  const onlyBuilders = new Set(list('builders'));
  const onlyIdx = new Set(list('idx').map(Number));
  let checked = 0;
  for (const s of structures) {
    if (onlyBuilders.size && !onlyBuilders.has(s.builder)) continue;
    if (onlyIdx.size && !onlyIdx.has(s.idx)) continue;
    // neighbours whose boxes come within half a metre occlude this one
    const near = structures.filter((o) => o !== s && o.box[0] < s.box[3] + 0.5 && o.box[3] > s.box[0] - 0.5 && o.box[2] < s.box[5] + 0.5 && o.box[5] > s.box[2] - 0.5);
    let occCount = 0; for (const o of near) occCount += o.own.pos.length;
    const occ = new Float32Array(occCount); let w = 0;
    for (const o of near) { occ.set(o.own.pos, w); w += o.own.pos.length; }
    const r = analyseBuilding(s.own, { occluders: occ, groundFn: groundOf(s), keepRasters: !!opt('images', '') });
    if (opt('images', '')) await writeRasters(opt('images', ''), `${mapId}_${s.builder}_${s.idx}`, r.rasters);
    const row = { key: `${mapId}/${s.builder}#${s.idx}`, map: mapId, kit: s.style, builder: s.builder, idx: s.idx,
      centre: [(s.box[0] + s.box[3]) / 2, s.box[1], (s.box[2] + s.box[5]) / 2].map((v) => +v.toFixed(1)),
      size: [s.box[3] - s.box[0], s.box[4] - s.box[1], s.box[5] - s.box[2]].map((v) => +v.toFixed(1)),
      tris: r.tris, severity: severity(r, s.builder), summary: summarise(r, s.builder), detail: r };
    rows.push(row); checked++;
    if (flag('verbose')) printRow(row);
  }
  return checked;
}

const fromDump = opt('from-dump', '');
if (source === 'maps' && fromDump) {
  for (const mapId of list('maps')) {
    const t0 = performance.now();
    const { structures, ground } = readDump(fromDump, mapId);
    const checked = await checkStructures(mapId, structures, (s) => groundFromSample(ground[s.idx]));
    console.log(`${mapId}: ${structures.length} structures from the dump, ${checked} checked (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  }
} else if (source === 'maps') {
  const { installWorldBuildFixture } = await import('./headlessWorldCollision.mjs');
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, fleet, models] = await Promise.all([
    import('../src/world/maps/index.ts'), import('../src/world/terrain.ts'), import('../src/world/vegetation.ts'),
    import('../src/world/props.ts'), import('../src/vehicles/fleetFactory.ts'), import('../src/world/propsModelStore.ts')]);
  await models.preloadPropModels();
  const mapIds = list('maps').length ? list('maps') : [...maps.MAP_IDS];
  for (const mapId of mapIds) {
    const t0 = performance.now();
    const config = maps.getMapConfig(mapId);
    const wreckIds = config.props?.tankWrecks?.ids ?? [];
    if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
    const engine = { anisotropy: 4, setupShadowMaterial() {} };
    const field = terrain.createHeightField(1337, config);
    const flora = vegetation.createVegetation(field, engine, 2001, config);
    const dressing = props.createProps(field, engine, 2002, config, flora);
    dressing.group.updateMatrixWorld(true);
    const fineInstances = new Map();
    for (const entry of dressing.group.userData.fineDetail ?? []) fineInstances.set(entry.mesh, new Set(entry.cells.map((c) => c.id)));
    // every structure's triangles, read from the merged buckets
    const structures = [];
    for (const [idx, spans] of dressing.structureSpans) {
      const info = dressing.structureDamage.get(idx);
      let triCount = 0; for (const s of spans) triCount += s.count / 3;
      const pos = new Float32Array(triCount * 9), flags = new Uint8Array(triCount), bucketOf = new Uint8Array(triCount);
      const buckets = []; const bucketIndex = new Map(); let t = 0;
      for (const s of spans) {
        let bi = bucketIndex.get(s.bucket); if (bi === undefined) { bi = buckets.length; buckets.push(s.bucket); bucketIndex.set(s.bucket, bi); }
        const e = s.mesh.matrixWorld.elements; const p = s.position;
        const material = Array.isArray(s.mesh.material) ? s.mesh.material[0] : s.mesh.material;
        const transparent = !material || material.visible === false || (material.transparent && material.opacity < 0.98) || material.alphaTest > 0 || material.depthWrite === false;
        const fine = s.instanceId != null && fineInstances.get(s.mesh)?.has(s.instanceId);
        const f = (fine ? FLAG_FINE : 0) | (transparent ? FLAG_TRANSPARENT : 0) | (material?.side === 2 ? FLAG_DOUBLE : 0);
        for (let v = s.first; v < s.first + s.count; v += 3, t++) {
          for (let c = 0; c < 3; c++) {
            const x = p.getX(v + c), y = p.getY(v + c), z = p.getZ(v + c);
            pos[t * 9 + c * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
            pos[t * 9 + c * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
            pos[t * 9 + c * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          }
          flags[t] = f; bucketOf[t] = bi;
        }
      }
      let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      for (let i = 0; i < pos.length; i += 3) { bx0 = Math.min(bx0, pos[i]); bx1 = Math.max(bx1, pos[i]); by0 = Math.min(by0, pos[i + 1]); by1 = Math.max(by1, pos[i + 1]); bz0 = Math.min(bz0, pos[i + 2]); bz1 = Math.max(bz1, pos[i + 2]); }
      structures.push({ idx, builder: info?.builder ?? '?', style: info?.style ?? null, own: { pos, flags, bucketOf, buckets }, box: [bx0, by0, bz0, bx1, by1, bz1] });
    }
    const built = performance.now();
    if (opt('dump', '')) writeDump(opt('dump', ''), mapId, structures, sampleGround(structures, field));
    const checked = flag('dump-only') ? 0 : await checkStructures(mapId, structures, () => (x, z) => field.getHeightAt(x, z));
    console.log(`${mapId}: ${structures.length} structures, ${checked} checked (build ${((built - t0) / 1000).toFixed(1)} s, check ${((performance.now() - built) / 1000).toFixed(1)} s)`);
  }
}

// ------------------------------------------------------------------------------------------------ kits
if (source === 'kits') {
  const { runKitCensus } = await import('./building-integrity-kits.mjs');
  await runKitCensus({ kits: list('kits'), builders: list('builders'), seeds: (opt('seeds', '11,29') || '11,29').split(',').map(Number),
    generic: !flag('no-generic'), landmarks: !flag('no-landmarks'), only: opt('only', ''),
    onRow: (row) => { rows.push(row); if (flag('verbose')) printRow(row); }, packParts, analyseBuilding, severity, summarise });
}

// ------------------------------------------------------------------------------------------------ report
rows.sort((a, b) => b.severity - a.severity);
const defective = rows.filter((r) => r.severity > 0);
console.log(`\n${rows.length} buildings checked, ${defective.length} with a finding (${((performance.now() - started) / 1000).toFixed(1)} s)`);
const byGroup = new Map();
for (const r of rows) {
  const g = source === 'maps' ? `${r.map} (${r.kit ?? 'generic'})` : r.kit;
  let e = byGroup.get(g); if (!e) { e = { n: 0, bad: 0, floating: 0, hole: 0, inside: 0, gap: 0, inverted: 0, sliver: 0 }; byGroup.set(g, e); }
  e.n++; if (r.severity > 0) e.bad++;
  const s = r.summary; e.floating += s.floating; e.sliver += s.sliver;
  for (const k of ['hole', 'inside', 'gap', 'inverted']) if (s[k + 'M2'] > 0) e[k]++;
}
console.log('\ngroup | buildings | with findings | floating parts | holes | inside | gaps | inverted | slivers');
for (const [g, e] of [...byGroup].sort((a, b) => b[1].bad - a[1].bad)) console.log(`${g} | ${e.n} | ${e.bad} | ${e.floating} | ${e.hole} | ${e.inside} | ${e.gap} | ${e.inverted} | ${e.sliver}`);
console.log(`\nworst ${Math.min(top, defective.length)}:`);
for (const r of defective.slice(0, top)) {
  printRow(r);
  const d = r.detail;
  for (const f of d.floating.slice(0, 3)) console.log(`    floating ${f.areaM2} m2 ${f.size.join('x')} m at (${f.at.join(',')}) clear ${f.clearanceM ?? '>3'} m [${f.buckets.join(',')}]${f.fineShare ? ` fine ${f.fineShare}` : ''}`);
  for (const k of ['hole', 'inside', 'gap', 'inverted']) { const w = d.kinds?.[k]?.worst; if (w) console.log(`    ${k} worst ${w.areaM2} m2 in ${d.kinds[k].views} views, ${w.view} at (${w.at.join(',')}) [${w.buckets.join(',')}]`); }
}

if (jsonPath) {
  mkdirSync(dirname(resolve(jsonPath)), { recursive: true });
  writeFileSync(resolve(jsonPath), JSON.stringify({ generatedAt: new Date().toISOString(), source, rows }, null, 1));
  console.log(`json: ${jsonPath}`);
}

// ------------------------------------------------------------------------------------------------ ledger
if (ledgerPath) {
  const { ledgerRows, ledgerVerdicts } = await import('./building-integrity-kits.mjs');
  const current = ledgerRows(rows);
  let ledger = { about: '', rows: {} };
  try { ledger = JSON.parse(readFileSync(resolve(ledgerPath), 'utf8')); } catch { /* first write */ }
  if (flag('update-ledger')) {
    ledger.about = 'Building integrity census (tools/building-integrity-check.mjs --source=kits): per kit/builder the worst over its seeds. The selftest holds every row: no row may add floating parts, more than max(0.05 m2, 10 %) on an open kind, or slivers. Rewrite rows with --update-ledger after a deliberate change, with its cause in the commit.';
    ledger.updatedAt = new Date().toISOString();
    ledger.rows = { ...(ledger.rows ?? {}), ...current };
    writeFileSync(resolve(ledgerPath), JSON.stringify(ledger, null, 1) + '\n');
    console.log(`ledger updated: ${ledgerPath} (${Object.keys(current).length} rows)`);
  } else {
    const verdicts = ledgerVerdicts(ledger.rows ?? {}, current);
    for (const v of verdicts.fail) console.log(`LEDGER FAIL ${v}`);
    console.log(`ledger: ${verdicts.pass} rows hold, ${verdicts.fail.length} regress, ${verdicts.missing.length} without a row${verdicts.missing.length ? ' (' + verdicts.missing.slice(0, 8).join(', ') + ')' : ''}`);
    if (flag('gate') && (verdicts.fail.length || verdicts.missing.length)) process.exit(1);
  }
}
