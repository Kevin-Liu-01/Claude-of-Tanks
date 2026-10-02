// Visual census reports (2026-10-01): the census.json store a capture run writes into, the metrics pass over its
// frames, the contact sheets (one per view across every map, one per map across every view), the index markdown and
// the A/B compare of two census directories. Node only — no server, no browser; every step re-runs from the PNGs and
// census.json alone. See tools/visual-census.mjs for the capture and the CLI.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadRgba } from './map-metrics.mjs';
import { CENSUS_VIEWPORT, CENSUS_VIEWS, horizonRow } from './visual-census-views.mjs';
import { CENSUS_HEADLINE_METRICS, frameMetrics } from './visual-census-metrics.mjs';

const CENSUS_FILE = 'census.json';
const READ_START = '<!-- visual-read:start -->';
const READ_END = '<!-- visual-read:end -->';

// ---------------------------------------------------------------------------------------------- store

export function loadCensus(out) {
  const file = path.join(out, CENSUS_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** Atomic write (temp file + rename) so a crash mid-run never leaves a torn census.json. */
export function saveCensus(out, census) {
  mkdirSync(out, { recursive: true });
  const file = path.join(out, CENSUS_FILE), temp = `${file}.${process.pid}.tmp`;
  census.updatedAt = new Date().toISOString();
  writeFileSync(temp, `${JSON.stringify(census, null, 1)}\n`);
  renameSync(temp, file);
}

/**
 * Continue a census directory or start one. Batches of maps captured by separate runs merge into one census only
 * when they rendered the same game the same way: same protocol, viewport and camera set, same source trees (src/,
 * public/, index.html, vite.config.ts) and the same uncommitted game paths. A tool-only commit between batches is
 * fine; anything else fails closed.
 */
export function openCensus(existing, header) {
  if (!existing) return { ...header, createdAt: new Date().toISOString(), maps: {}, sessions: [] };
  const problems = [];
  if (existing.protocol !== header.protocol) problems.push(`protocol ${existing.protocol} vs ${header.protocol}`);
  if (JSON.stringify(existing.viewport) !== JSON.stringify(header.viewport)) problems.push('viewport');
  if (existing.viewsDigest !== header.viewsDigest) problems.push('camera set (views digest)');
  if (JSON.stringify(existing.sourceTree) !== JSON.stringify(header.sourceTree)) problems.push('source tree (src/, public/, index.html)');
  if (JSON.stringify(existing.dirtyGamePaths ?? []) !== JSON.stringify(header.dirtyGamePaths ?? [])) problems.push('uncommitted game paths');
  if (existing.serve !== header.serve) problems.push(`serve ${existing.serve} vs ${header.serve}`);
  if (problems.length) throw new Error(`census.json in this --out belongs to another capture (${problems.join('; ')}); use a new --out`);
  return { ...existing, revision: header.revision, revisionShort: header.revisionShort, branch: header.branch, gameRevision: existing.gameRevision ?? header.gameRevision };
}

// ---------------------------------------------------------------------------------------------- metrics

/** The flat-world horizon row of a recorded capture state (camera forward + fov), or null. */
export function horizonOfState(state, height = CENSUS_VIEWPORT.height) {
  const f = state?.camera?.forward, fov = state?.camera?.fov;
  if (!Array.isArray(f) || !Number.isFinite(fov)) return null;
  return horizonRow(Math.atan2(f[1], Math.hypot(f[0], f[2])), fov, height);
}

/** Fill `metrics` for every captured frame (all of them with force). Returns the number of frames measured. */
export async function measureCensus(out, census, { force = false, log = () => {} } = {}) {
  let measured = 0;
  for (const [mapId, map] of Object.entries(census.maps)) {
    for (const [view, shot] of Object.entries(map.views || {})) {
      if (shot.status !== 'ok' || !shot.file || (shot.metrics && !force)) continue;
      const file = path.join(out, shot.file);
      if (!existsSync(file)) { shot.metricsError = 'frame file missing'; continue; }
      const image = await loadRgba(file);
      shot.metrics = frameMetrics(image, { horizon: horizonOfState(shot.state, image.height) });
      delete shot.metricsError;
      measured++;
      log(`${mapId}/${view}`);
    }
  }
  return measured;
}

// ---------------------------------------------------------------------------------------------- sheets

const SHEET_BG = '#16181b', TILE_BG = '#2a2d31', INK = '#f2f2f2', DIM = '#a9adb3';
const fmt = (v, d = 2) => (v === null || v === undefined ? '–' : Number(v).toFixed(d));

function drawTitle(ctx, text, sub, width) {
  ctx.fillStyle = INK; ctx.font = 'bold 24px Helvetica'; ctx.fillText(text, 12, 31);
  ctx.fillStyle = DIM; ctx.font = '15px Helvetica';
  const w = ctx.measureText(sub).width;
  ctx.fillText(sub, Math.max(12, width - w - 12), 31);
}

async function drawTile(ctx, file, x, y, w, h, missingText) {
  ctx.fillStyle = TILE_BG; ctx.fillRect(x, y, w, h);
  if (file && existsSync(file)) {
    const image = await loadImage(file);
    ctx.drawImage(image, x, y, w, h);
    return true;
  }
  ctx.fillStyle = DIM; ctx.font = '16px Helvetica';
  ctx.fillText(missingText, x + 12, y + h / 2);
  return false;
}

function metricLine(metrics) {
  if (!metrics) return '';
  return `luma ${fmt(metrics.lumaMean, 0)}  p5 ${fmt(metrics.lumaP5, 0)}  sat ${fmt(metrics.satMean)}  sky/gnd ${fmt(metrics.skyGroundContrast)}  chk5 ${fmt(metrics.skylineRatioCheck5)}  detail ${fmt(metrics.groundDetail, 1)}`;
}

const shotState = (shot) => (shot?.status === 'ok' ? 'ok' : shot?.status === 'skipped' ? `skipped: ${shot.reason || ''}` : shot ? `${shot.status}: ${String(shot.error || '').slice(0, 60)}` : 'not captured');

/** Lay out a grid: `cols` tiles of w x h with a label band, under a title band. */
function gridGeometry(count, cols, w, h, label) {
  const pad = 6, title = 46, rows = Math.max(1, Math.ceil(count / cols));
  return { pad, title, label, w, h, cols, rows, width: pad + cols * (w + pad), height: title + rows * (h + label + pad) + pad };
}
const cellOrigin = (g, index) => [g.pad + (index % g.cols) * (g.w + g.pad), g.title + Math.floor(index / g.cols) * (g.h + g.label + g.pad)];

/** One sheet per view: every map in registry order. */
async function viewSheet(out, census, view, mapIds) {
  const g = gridGeometry(mapIds.length, 6, 400, 225, 40);
  const canvas = createCanvas(g.width, g.height), ctx = canvas.getContext('2d');
  ctx.fillStyle = SHEET_BG; ctx.fillRect(0, 0, g.width, g.height);
  drawTitle(ctx, `Visual census · ${view.label}`, `${census.revisionShort} · ${(census.updatedAt || '').slice(0, 10)} · ${CENSUS_VIEWPORT.width}×${CENSUS_VIEWPORT.height} high`, g.width);
  for (let i = 0; i < mapIds.length; i++) {
    const mapId = mapIds[i], map = census.maps[mapId], shot = map?.views?.[view.name];
    const [x, y] = cellOrigin(g, i);
    await drawTile(ctx, shot?.status === 'ok' ? path.join(out, shot.file) : null, x, y, g.w, g.h, shotState(shot));
    ctx.fillStyle = INK; ctx.font = 'bold 14px Helvetica';
    ctx.fillText(`${mapId} · ${map?.name || ''}`, x + 2, y + g.h + 16);
    ctx.fillStyle = DIM; ctx.font = '11px Helvetica';
    ctx.fillText(metricLine(shot?.metrics), x + 2, y + g.h + 32);
  }
  return canvas;
}

/** One sheet per map: every view, plus a numbers cell. */
async function mapSheet(out, census, mapId) {
  const map = census.maps[mapId] || {};
  const g = gridGeometry(CENSUS_VIEWS.length + 1, 4, 640, 360, 26);
  const canvas = createCanvas(g.width, g.height), ctx = canvas.getContext('2d');
  ctx.fillStyle = SHEET_BG; ctx.fillRect(0, 0, g.width, g.height);
  drawTitle(ctx, `Visual census · ${mapId} · ${map.name || ''}`, `${census.revisionShort} · ${(census.updatedAt || '').slice(0, 10)} · ${map.authoredSky ? `sun ${fmt(map.authoredSky.sunElevationDeg, 0)}° ` : ''}high`, g.width);
  for (let i = 0; i < CENSUS_VIEWS.length; i++) {
    const view = CENSUS_VIEWS[i], shot = map.views?.[view.name];
    const [x, y] = cellOrigin(g, i);
    await drawTile(ctx, shot?.status === 'ok' ? path.join(out, shot.file) : null, x, y, g.w, g.h, shotState(shot));
    ctx.fillStyle = INK; ctx.font = 'bold 15px Helvetica';
    ctx.fillText(view.label, x + 2, y + g.h + 18);
  }
  const [x, y] = cellOrigin(g, CENSUS_VIEWS.length);
  ctx.fillStyle = TILE_BG; ctx.fillRect(x, y, g.w, g.h);
  ctx.font = '12px Menlo';
  const cols = [['view', 92], ['luma', 44], ['p5', 36], ['sat', 40], ['s/g', 46], ['chk5', 44], ['ring', 44], ['relief', 50], ['gdet', 44], ['sdet', 44], ['sharp', 48]];
  let cx = x + 8;
  ctx.fillStyle = INK;
  for (const [label, w] of cols) { ctx.fillText(label, cx, y + 20); cx += w; }
  CENSUS_VIEWS.forEach((view, row) => {
    const m = map.views?.[view.name]?.metrics;
    const cells = [view.name, fmt(m?.lumaMean, 0), fmt(m?.lumaP5, 0), fmt(m?.satMean), fmt(m?.skyGroundContrast),
      fmt(m?.skylineRatioCheck5), fmt(m?.ringHeightPx, 0), fmt(m?.skylineReliefPx, 1), fmt(m?.groundDetail, 1),
      fmt(m?.skyDetail, 1), fmt(m?.sharpness, 1)];
    let px = x + 8;
    ctx.fillStyle = row % 2 ? DIM : INK;
    cells.forEach((text, k) => { ctx.fillText(String(text), px, y + 44 + row * 20); px += cols[k][1]; });
  });
  return canvas;
}

/** Write every sheet as JPEG under <out>/sheets; returns the relative paths. */
export async function buildSheets(out, census, { mapIds = Object.keys(census.maps), quality = 86 } = {}) {
  const dir = path.join(out, 'sheets');
  mkdirSync(dir, { recursive: true });
  const written = { views: [], maps: [] };
  const save = async (canvas, name) => {
    writeFileSync(path.join(dir, name), await canvas.encode('jpeg', quality));
    return `sheets/${name}`;
  };
  for (const view of CENSUS_VIEWS) written.views.push(await save(await viewSheet(out, census, view, mapIds), `view-${view.name}.jpg`));
  for (const mapId of mapIds) written.maps.push(await save(await mapSheet(out, census, mapId), `map-${mapId}.jpg`));
  return written;
}

// ---------------------------------------------------------------------------------------------- index

const cell = (shot) => (!shot ? '·' : shot.status === 'ok' ? (shot.attempts > 1 ? `ok (${shot.attempts})` : 'ok') : shot.status === 'skipped' ? 'skip' : 'FAIL');

/** Keep the hand-written visual read of an existing index between its markers. */
function preservedRead(previous) {
  if (!previous) return null;
  const a = previous.indexOf(READ_START), b = previous.indexOf(READ_END);
  return a >= 0 && b > a ? previous.slice(a, b + READ_END.length) : null;
}

/** The census index markdown (commit, date, reproduce commands, sheets, status, headline numbers). */
export function renderIndex(census, { mapIds = Object.keys(census.maps), sheets = null, previous = null, reproduce = [] } = {}) {
  const sessions = census.sessions || [];
  const first = sessions[0]?.startedAt || census.createdAt, last = sessions.at(-1)?.endedAt || census.updatedAt;
  const failed = [], skipped = [];
  for (const mapId of mapIds) {
    const map = census.maps[mapId];
    if (!map) { failed.push(`${mapId}: not captured`); continue; }
    if (map.status === 'failed') failed.push(`${mapId}: ${map.error || 'failed'}`);
    for (const [view, shot] of Object.entries(map.views || {})) {
      if (shot.status === 'failed') failed.push(`${mapId}/${view}: ${shot.error || 'failed'}`);
      if (shot.status === 'skipped') skipped.push(`${mapId}/${view}: ${shot.reason}`);
    }
  }
  const okFrames = mapIds.reduce((n, id) => n + Object.values(census.maps[id]?.views || {}).filter((s) => s.status === 'ok').length, 0);
  const lines = [
    `# Visual census — ${census.revisionShort} (${String(last || '').slice(0, 10)})`, '',
    `Baseline of every registered battlefield before the visual redesign: the same ${CENSUS_VIEWS.length} views of each map, captured`,
    'the same way, with numbers, so later changes compare frame for frame (`node tools/visual-census.mjs compare`).', '',
    `- **Commit:** \`${census.revision}\` (${census.branch || 'detached'})${census.gameRevision ? `; game tree last changed in \`${census.gameRevision.slice(0, 9)}\` (${census.gameRevision.slice(41)})` : ''}; source trees src \`${census.sourceTree?.src?.slice(0, 12)}\`, public \`${census.sourceTree?.public?.slice(0, 12)}\`, index.html \`${census.sourceTree?.index?.slice(0, 12)}\`${census.dirtyGamePaths?.length ? `; uncommitted game paths: ${census.dirtyGamePaths.join(', ')}` : '; no uncommitted game paths'}`,
    `- **Captured:** ${first} → ${last} in ${sessions.length} session(s); ${okFrames} frames over ${mapIds.length} maps`,
    `- **Served:** ${census.serve === 'dist' ? '`npm run build` output through `vite preview`' : 'vite dev server (private optimizer cache)'}${census.distIndexSha256 ? `, dist/index.html sha256 \`${census.distIndexSha256.slice(0, 16)}\`` : ''}`,
    `- **Browser:** ${sessions.at(-1)?.browserVersion || '?'}; GPU ${sessions.at(-1)?.gpu || '?'}`,
    `- **Frame:** ${CENSUS_VIEWPORT.width}×${CENSUS_VIEWPORT.height} @1×, \`?tier=desktop\`, preset \`high\` pinned in storage, dynamic resolution pinned to 1, authored time of day (shot mode applies no battle weather), effects and wind frozen by the shot recipe, cloud drift zeroed and the cloud history settled per view, pinned roster \`${census.pinnedScene?.protocol || '?'}\``,
    '', '## Reproduce', '', '```sh', ...reproduce, '```', '',
  ];
  if (sheets) {
    lines.push('## Sheets', '', `Per view (every map): ${sheets.views.map((p) => `[${path.basename(p, '.jpg').replace('view-', '')}](${p})`).join(' · ')}`, '');
    lines.push(`Per map (every view): ${sheets.maps.map((p) => `[${path.basename(p, '.jpg').replace('map-', '')}](${p})`).join(' · ')}`, '');
  }
  lines.push('## Status', '', `| map | ${CENSUS_VIEWS.map((v) => v.name).join(' | ')} |`, `|---|${CENSUS_VIEWS.map(() => '---').join('|')}|`);
  for (const mapId of mapIds) {
    const map = census.maps[mapId];
    lines.push(`| ${mapId} (${map?.name || '?'}) | ${CENSUS_VIEWS.map((v) => cell(map?.views?.[v.name])).join(' | ')} |`);
  }
  lines.push('', failed.length ? `Failed: ${failed.join('; ')}` : 'Failed: none.', '', skipped.length ? `Skipped: ${skipped.join('; ')}` : 'Skipped: none.', '');
  lines.push('## Headline numbers', '', 'Display luma (Rec.601 on sRGB bytes, 0–255); sat = mean HSV saturation; s/g = (sky − ground)/(sky + ground) luma;',
    'chk5 = map-metrics check-5 skyline ratio (ground/sky at the skyline, > 1 = range paler than the sky); ring = median px the',
    'skyline rises above the flat horizon; relief = mean |Δ| of the skyline over 8 columns (px); gdet / sdet = ground / sky',
    'high-pass energy (mean |L − 5×5 mean|). Every number of every frame is in census.json.', '');
  for (const view of CENSUS_VIEWS) {
    lines.push(`### ${view.label}`, '', `| map | ${CENSUS_HEADLINE_METRICS.map(([, label]) => label).join(' | ')} |`, `|---|${CENSUS_HEADLINE_METRICS.map(() => '--:').join('|')}|`);
    for (const mapId of mapIds) {
      const m = census.maps[mapId]?.views?.[view.name]?.metrics;
      if (!m) continue;
      lines.push(`| ${mapId} | ${CENSUS_HEADLINE_METRICS.map(([key]) => fmt(m[key], key === 'lumaMean' || key.startsWith('lumaP') || key === 'ringHeightPx' ? 0 : 2)).join(' | ')} |`);
    }
    lines.push('');
  }
  lines.push(preservedRead(previous) || `${READ_START}\n## Visual read\n\n(not written yet)\n${READ_END}`, '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------- compare

/** Mean |A - B| over rgb (0..255) and the share of pixels whose largest channel difference exceeds 16. */
export function pixelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('frames differ in size');
  let sum = 0, over = 0;
  const n = a.width * a.height;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const dr = Math.abs(a.rgba[p] - b.rgba[p]), dg = Math.abs(a.rgba[p + 1] - b.rgba[p + 1]), db = Math.abs(a.rgba[p + 2] - b.rgba[p + 2]);
    sum += dr + dg + db;
    if (Math.max(dr, dg, db) > 16) over++;
  }
  return { meanAbsDiff: Math.round((sum / (3 * n)) * 1000) / 1000, shareOver16: Math.round((over / n) * 10000) / 10000 };
}

/** Side-by-side A | B sheets per map and a compare.json of pixel and headline-metric deltas. */
export async function compareCensus(aDir, bDir, out, { log = () => {} } = {}) {
  const A = loadCensus(aDir), B = loadCensus(bDir);
  if (!A || !B) throw new Error('compare needs two census directories (census.json in --a and --b)');
  mkdirSync(path.join(out, 'compare'), { recursive: true });
  const rows = [];
  const mapIds = Object.keys(A.maps).filter((id) => B.maps[id]);
  for (const mapId of mapIds) {
    const views = CENSUS_VIEWS.filter((v) => A.maps[mapId].views?.[v.name]?.status === 'ok' && B.maps[mapId].views?.[v.name]?.status === 'ok');
    if (!views.length) continue;
    const w = 640, h = 360, pad = 6, title = 46, label = 22;
    const canvas = createCanvas(pad + 2 * (w + pad), title + views.length * (h + label + pad) + pad), ctx = canvas.getContext('2d');
    ctx.fillStyle = SHEET_BG; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawTitle(ctx, `${mapId} · A ${A.revisionShort} | B ${B.revisionShort}`, 'visual census compare', canvas.width);
    for (let i = 0; i < views.length; i++) {
      const view = views[i], sa = A.maps[mapId].views[view.name], sb = B.maps[mapId].views[view.name];
      const fa = path.join(aDir, sa.file), fb = path.join(bDir, sb.file);
      const y = title + i * (h + label + pad);
      await drawTile(ctx, fa, pad, y, w, h, 'missing'); await drawTile(ctx, fb, 2 * pad + w, y, w, h, 'missing');
      const diff = existsSync(fa) && existsSync(fb) ? pixelDiff(await loadRgba(fa), await loadRgba(fb)) : null;
      const deltas = {};
      for (const [key] of CENSUS_HEADLINE_METRICS) {
        const va = sa.metrics?.[key], vb = sb.metrics?.[key];
        deltas[key] = Number.isFinite(va) && Number.isFinite(vb) ? Math.round((vb - va) * 1000) / 1000 : null;
      }
      rows.push({ map: mapId, view: view.name, ...diff, deltas });
      ctx.fillStyle = INK; ctx.font = 'bold 14px Helvetica';
      ctx.fillText(`${view.label}${diff ? `   mean |Δ| ${diff.meanAbsDiff}  >16: ${(diff.shareOver16 * 100).toFixed(2)} %` : ''}`, pad + 2, y + h + 16);
      log(`${mapId}/${view.name}`);
    }
    writeFileSync(path.join(out, 'compare', `map-${mapId}.jpg`), await canvas.encode('jpeg', 86));
  }
  const report = { a: { dir: aDir, revision: A.revision }, b: { dir: bDir, revision: B.revision }, createdAt: new Date().toISOString(), rows };
  writeFileSync(path.join(out, 'compare.json'), `${JSON.stringify(report, null, 1)}\n`);
  return report;
}

/** Re-render <out>/index.md from census.json, keeping a hand-written visual read between its markers. */
export function writeIndex(out, census, options = {}) {
  const file = path.join(out, 'index.md');
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : null;
  writeFileSync(file, renderIndex(census, { ...options, previous }));
  return file;
}

