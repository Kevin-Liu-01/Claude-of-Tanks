#!/usr/bin/env node
// tools/horizon-envelope.mjs — the horizon and sky check (HB-1a / HS-1; the horizons stream, 2026-10-13, rebuilt after
// the 10-07 reboot lost the first one). CPU only: no browser, no GPU.
//
// What "a really good local horizon" means, measured (PLAN §1.1, H1 §5.2): the nine excellent maps all fall inside an
// envelope of skyline statistics. This tool measures every map against it, from the centre eye (H1's method, ground +
// 3 m) and from the eight EYE8 border eyes the owner judges (tank eye height 2.5 m, 80 m inside each side and corner),
// and prints P1, C1–C9 with the map's recorded place exceptions honoured:
//   P1  one landform story: ring style family = relief character = far-country class = border style;
//   C1  ring skyline median 1.7–7.7°            C2  outland p90 rise within ~500 m past the edge 17–39 m;
//   C3  skyline formed >= 1 km out on >= 96 %    C4  >= 7 skyline summits (>= 0.4° prominence; terrain or objects);
//   C5  >= 1.8 visible crest lines per bearing   C6  a far layer >= 0.3° over the ring on >= 25 % of bearings;
//   C7  fogDensity <= 0.00074                    C8  >= 4 farmsteads with buildings past the edge;
//   C9  rimH 22–42                               (C10, continuity across the red line, is judged in EYE8 captures).
// Beside them: the deck table (today's far-country deck from the legacy keys against the cloud layer's resolved base),
// the sea openings, and the distant-range arithmetic (angle after earth drop, transmittance under the haze law).
//
// A map with a `hinterland` block (B-architecture §6.1) is measured on its new field as well, old against new: the
// skyline from the field ray-marched to 80 km with the earth's curvature, near (<= 4 km) and far (beyond) apart, and the
// planner's buildings and landmarks as skyline objects — see measureHinterland (HL-1).
//
//   node tools/horizon-envelope.mjs                       every map, table on stdout
//   node tools/horizon-envelope.mjs --maps=verdant,polders
//   node tools/horizon-envelope.mjs --eyes=centre         the centre eye only (fast; H1's numbers)
//   node tools/horizon-envelope.mjs --json=out.json --md=docs/HORIZON-ENVELOPE.md
//   node tools/horizon-envelope.mjs --new                 also measure a lab draft for maps with none (HL-1)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEG = 180 / Math.PI;
/** The refraction-adjusted earth radius the plan uses (R′ ≈ 7,300 km): the drop of a point d metres out is d²/2R′. */
export const EARTH_R_M = 7_300_000;
/** The envelope (PLAN §1.1): the nine excellent maps all sit inside it. */
export const ENVELOPE = Object.freeze({
  C1: [1.7, 7.7], C2: [17, 39], C3: 0.96, C4: 7, C5: 1.8, C6: 0.25, C6_MARGIN_DEG: 0.3, C7: 0.00074, C8: 4, C9: [22, 42],
});
/** The eight EYE8 eyes (visual-census-views.mjs border2): 80 m inside each side and corner, 2.5 m over the ground. */
export const EYE8 = Object.freeze([
  ['edge-n', 0, 1], ['edge-e', 1, 0], ['edge-s', 0, -1], ['edge-w', -1, 0],
  ['corner-ne', 1, 1], ['corner-se', 1, -1], ['corner-sw', -1, -1], ['corner-nw', -1, 1],
].map(([name, sx, sz]) => Object.freeze({ name, sx, sz })));
/**
 * Place exceptions H1 and PLAN §1.1 already record, honoured until each map file carries its own record (a map's
 * `horizon.envelopeExceptions` or `hinterland.exceptions` adds to and overrides these).
 */
export const RECORDED_EXCEPTIONS = Object.freeze({
  verdant: Object.freeze({ C6: 'Kursk is flat: no far layer stands over the ring; the inhabited near band compensates (H1 §5.2)' }),
});
export const EYE_INSET_M = 80;
export const EYE_M = 2.5;
export const CENTRE_EYE_M = 3;

const quantile = (values, q) => {
  if (!values.length) return Number.NaN;
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1) + 0.5)))];
};

/**
 * Summits on a closed skyline profile (degrees per bearing): local maxima whose prominence — the drop to the higher of
 * the two key saddles toward higher ground either way round — is at least `promDeg`. The highest takes the profile's
 * whole range.
 */
export function countSummits(elev, promDeg = 0.4) {
  const n = elev.length;
  let count = 0;
  let maxV = -Infinity, minV = Infinity;
  for (const v of elev) { maxV = Math.max(maxV, v); minV = Math.min(minV, v); }
  for (let i = 0; i < n; i++) {
    const v = elev[i];
    if (!(v >= elev[(i - 1 + n) % n] && v > elev[(i + 1) % n])) continue;
    if (v === maxV) { if (maxV - minV >= promDeg) count++; continue; }
    let lo1 = v, lo2 = v;
    for (let k = 1; k < n; k++) { const w = elev[(i + k) % n]; if (w > v) break; lo1 = Math.min(lo1, w); }
    for (let k = 1; k < n; k++) { const w = elev[(i - k + n) % n]; if (w > v) break; lo2 = Math.min(lo2, w); }
    if (v - Math.max(lo1, lo2) >= promDeg) count++;
  }
  return count;
}

/** The stats of one eye's skyline: elevation (deg), its radius and height above the eye per bearing, crest lines. */
export function skylineStats(sky) {
  const { elev, radius, above, lines } = sky;
  const quadrant = (centreDeg) => {
    const pick = [];
    for (let i = 0; i < elev.length; i++) {
      const az = (i / elev.length) * 360, d = Math.abs(((az - centreDeg + 540) % 360) - 180);
      if (d <= 45) pick.push(elev[i]);
    }
    return quantile(pick, 0.5);
  };
  let under1 = 0;
  for (const r of radius) if (r < 1000) under1++;
  const lineMean = lines.reduce((a, b) => a + b, 0) / lines.length;
  return {
    p10: quantile(elev, 0.1), p50: quantile(elev, 0.5), p90: quantile(elev, 0.9), max: Math.max(...elev),
    q: { n: quadrant(0), e: quadrant(90), s: quadrant(180), w: quadrant(270) },
    abovep50: quantile(above, 0.5), abovep90: quantile(above, 0.9), r50: quantile(radius, 0.5),
    under1km: under1 / radius.length, lines: lineMean, linesP90: quantile(lines, 0.9), summits: countSummits(elev),
  };
}

/**
 * A skyline by ray-marching a surface from an eye: on each of `bearings` bearings (clockwise from north), the highest
 * elevation angle over `heightAt` from `minM` to `maxM` (steps growing with distance), the earth's drop applied, and the
 * crest lines (visible local maxima of the angle along the ray). `heightAt` may return NaN where there is no surface.
 */
export function marchSkyline(heightAt, eye, { bearings = 1440, minM = 20, maxM = 4000, step = (d) => Math.max(6, d * 0.012), curvature = true, objects = null } = {}) {
  const elev = new Float64Array(bearings), radius = new Float64Array(bearings), above = new Float64Array(bearings), lines = new Float64Array(bearings);
  for (let b = 0; b < bearings; b++) {
    const a = (b / bearings) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    let best = -Infinity, bestR = 0, bestH = 0, prev = -Infinity, rising = false, crest = 0, crestBest = -Infinity;
    for (let d = minM; d <= maxM; d += step(d)) {
      const x = eye.x + sx * d, z = eye.z + sz * d;
      let h = heightAt(x, z);
      if (!Number.isFinite(h)) { prev = -Infinity; continue; }
      if (objects) h = Math.max(h, objects(x, z, d));
      const drop = curvature ? (d * d) / (2 * EARTH_R_M) : 0;
      const ang = Math.atan2(h - drop - eye.y, d);
      if (ang > best) { best = ang; bestR = d; bestH = h - drop - eye.y; }
      // a crest line: the angle stops rising here and this crest stands over every nearer one (it is seen)
      if (ang < prev && rising) {
        if (prev > crestBest + 0.05 / DEG) { crest++; crestBest = prev; }
        rising = false;
      } else if (ang > prev) rising = true;
      prev = ang;
    }
    if (rising && prev > crestBest + 0.05 / DEG) crest++;
    elev[b] = best * DEG; radius[b] = bestR; above[b] = bestH; lines[b] = crest;
  }
  return { elev: Array.from(elev), radius: Array.from(radius), above: Array.from(above), lines: Array.from(lines) };
}

/** The ring's skyline from the centre eye by its columns (H1's method: the highest vertex angle per column). */
export function ringColumnSkyline(ring, columns, eyeY) {
  const rows = ring.heights.length / columns;
  const elev = [], radius = [], above = [], lines = [];
  for (let c = 0; c < columns; c++) {
    let best = -Infinity, bestR = 0, bestH = 0, prev = -Infinity, rising = false, crest = 0, crestBest = -Infinity;
    for (let r = 0; r < rows; r++) {
      const i = r * columns + c;
      const x = ring.positions[i * 3], z = ring.positions[i * 3 + 2], h = ring.heights[i] - eyeY, d = Math.hypot(x, z);
      const ang = Math.atan2(h, d);
      if (ang > best) { best = ang; bestR = d; bestH = h; }
      if (ang < prev && rising) { if (prev > crestBest + 0.05 / DEG) { crest++; crestBest = prev; } rising = false; }
      else if (ang > prev) rising = true;
      prev = ang;
    }
    if (rising && prev > crestBest + 0.05 / DEG) crest++;
    elev.push(best * DEG); radius.push(bestR); above.push(bestH); lines.push(crest);
  }
  // (a column's ring angle runs counter-clockwise from +x; the stats are rotation-invariant but the quadrants are not:
  // reorder to compass bearings, clockwise from north)
  const order = [];
  for (let b = 0; b < columns; b++) {
    const az = (b / columns) * 360, ringAngle = ((90 - az) % 360 + 360) % 360;
    order.push(Math.round((ringAngle / 360) * columns) % columns);
  }
  return { elev: order.map((k) => elev[k]), radius: order.map((k) => radius[k]), above: order.map((k) => above[k]), lines: order.map((k) => lines[k]) };
}

/** The style families P1 compares (one landform story). */
const FAMILY = Object.freeze({
  rolling: 'low', coastal: 'low', plain: 'low', upland: 'low', forested: 'low', erg: 'low', escarpment: 'low',
  alpine: 'mountain', polar: 'mountain', ridges: 'mountain', karst: 'mountain', karstRidge: 'mountain', iceSheet: 'mountain',
  mesa: 'table', jebel: 'table', jebels: 'table', tables: 'table', martian: 'table',
  volcanic: 'volcanic', volcanicField: 'volcanic', lunar: 'mountain',
});

/** The deck (S1): today's far-country deck from the legacy keys against the cloud layer's resolved base. */
export function deckColumns(cfg, regimes) {
  const scape = cfg.clouds ?? null;
  const legacy = cfg.sky?.cloudAltM;
  const today = Math.min(scape?.baseM ?? Infinity, legacy ?? Infinity, ...(scape?.baseM === undefined && legacy === undefined ? [1400] : []));
  const row = scape?.regime ? regimes[scape.regime] : null;
  // the volumetric layer's own rule (cloudscapeLayer.ts): max(60, the map's base ?? the regime's ?? the legacy deck's)
  const resolved = Math.max(60, scape?.baseM ?? row?.baseM ?? legacy ?? 1400);
  return { regime: scape?.regime ?? '(legacy)', coverage: scape?.coverage ?? row?.coverage ?? null, todayDeckM: today, resolvedBaseM: resolved, capFrom: scape?.baseM !== undefined ? 'clouds.baseM' : legacy !== undefined ? 'sky.cloudAltM' : 'default' };
}

/** A distant range's arithmetic (HS-9): its angle after earth drop from an eye, and its transmittance under the haze law. */
export function distantRange({ reliefM, distM, eyeM = EYE_M, fogDensity, sigmaPerFog = 0.42, layerScaleM = 400 }) {
  const drop = (distM * distM) / (2 * EARTH_R_M);
  const angleDeg = Math.atan2(reliefM - drop - eyeM, distM) * DEG;
  // the path-averaged density of the exponential layer between the eye and the crest (hazeLaw.ts hazeLayerMean)
  const a0 = eyeM / layerScaleM, a1 = Math.max(0, reliefM - drop) / layerScaleM;
  const mean = Math.abs(a0 - a1) < 1e-3 ? Math.exp(-0.5 * (a0 + a1)) : (Math.exp(-a1) - Math.exp(-a0)) / (a0 - a1);
  const transmittance = Math.exp(-fogDensity * sigmaPerFog * distM * mean);
  return { angleDeg, transmittance, dropM: drop };
}

/** The EYE8 eye spots on a ground: 80 m inside each side's centre (corners: inside both edges), 2.5 m up. */
export function eye8Spots(groundAt) {
  return EYE8.map(({ name, sx, sz }) => {
    const x = sx * (512 - EYE_INSET_M), z = sz * (512 - EYE_INSET_M);
    return { name, x, z, y: groundAt(x, z) + EYE_M, faceDeg: (Math.atan2(sx, sz) * DEG + 360) % 360 };
  });
}

/** Load the modules the measurement reads (lazy: the selftest and the plan tool import this file for its maths). */
async function loadWorld() {
  const [maps, terrain, horizon, border, farm, edge, clouds] = await Promise.all([
    import('../src/world/maps/index.ts'),
    import('../src/world/terrain.ts'),
    import('../src/world/maps/horizon.ts'),
    import('../src/world/borderLandform.ts'),
    import('../src/world/borderFarmsteads.ts'),
    import('../src/world/edgeWater.ts'),
    import('../src/engine/cloudscapes.ts'),
  ]);
  const relief = await import('../src/world/horizonRelief.ts');
  const panorama = await import('../src/world/horizonPanorama.ts');
  return { maps, terrain, horizon, border, farm, edge, clouds, relief, panorama };
}

function idHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * The old path's row for one map: the ring's geometry (sampleHorizonGeometry on the map's own height field), its
 * skyline from the centre and the EYE8 eyes, the farmsteads, P1, C1–C9, the deck and the sea openings.
 */
export async function measureRing(world, id, { eyes = 'all', field: givenField = null } = {}) {
  const cfg = world.maps.getMapConfig(id);
  const field = givenField ?? world.terrain.createHeightField(1337, cfg);
  const ring = world.horizon.sampleHorizonGeometry(cfg, 1337, field);
  const columns = world.horizon.HORIZON_SEGMENTS;
  const centreY = field.getHeightAt(0, 0) + CENTRE_EYE_M;
  const centreSky = ringColumnSkyline(ring, columns, centreY);
  const centre = skylineStats(centreSky);
  // C2: the p90 rise of the ring band out to 1 km over the centre ground (H1's outland rise)
  const g0 = field.getHeightAt(0, 0);
  const band = [];
  for (let i = 0; i < ring.heights.length; i++) {
    const r = Math.hypot(ring.positions[i * 3], ring.positions[i * 3 + 2]);
    if (r <= 1000) band.push(ring.heights[i] - g0);
  }
  const outlandRise = quantile(band, 0.9);
  // the EYE8 eyes: the battlefield inside the square, the ring's surface past it
  const ringAt = world.farm.ringSurfaceSampler(columns, ring.positions, ring.heights);
  const surface = (x, z) => (Math.max(Math.abs(x), Math.abs(z)) <= 512 ? field.getHeightAt(x, z) : ringAt(x, z));
  const eyeRows = eyes === 'all' ? eye8Spots((x, z) => field.getHeightAt(x, z)).map((eye) => ({
    eye: eye.name, ...skylineStats(marchSkyline(surface, eye, { bearings: 720, minM: 30, maxM: 3600, curvature: false })),
  })) : [];
  // C8 and the C4 objects: the farmsteads past the edge as the ring places them
  const horizonCfg = cfg.horizon ?? {};
  const settings = world.border.resolveBorderLandform(horizonCfg.style, cfg.terrain?.border, id);
  const farmSpec = field._borderFarmsteads;
  let farms = 0, villages = 0;
  if (farmSpec && farmSpec.count > 0) {
    const exit = [0, 0];
    const sites = world.farm.selectFarmsteadSites({
      seed: ((1337 ^ 0xFA4D) ^ idHash(id)) >>> 0, style: farmSpec.style, count: farmSpec.count, fieldAngle: farmSpec.fieldAngle,
      groundAt: ringAt, woodsAt: (x, z) => field.getBorderWoodsAt?.(x, z) ?? 0,
      blockedAt: (x, z) => Math.max(field.getOutlandSeatWeightAt?.(x, z) ?? 0, field.getOutlandWaterAt?.(x, z)?.wetness ?? 0),
      ...(field._roadExitAt ? { roadDistanceAt: (x, z) => (field._roadExitAt(x, z, exit)[1] > 0.05 ? Math.abs(exit[0]) : Infinity) } : {}),
      ...(field._roadExitLines ? { roadLines: field._roadExitLines() } : {}),
    });
    farms = farmSpec.buildings === false ? 0 : sites.length;
    villages = sites.filter((s) => s.village).length;
  }
  // P1: the families of the ring style, the relief character, the far class and the border style
  const style = horizonCfg.ringStyle || horizonCfg.style || 'rolling';
  const character = world.relief.resolveHorizonReliefCharacter(horizonCfg, id);
  const far = horizonCfg.panorama === false ? 'farRange' : horizonCfg.panorama?.regional ?? character;
  const families = [FAMILY[style] ?? style, FAMILY[character] ?? character, FAMILY[far] ?? far, FAMILY[horizonCfg.style ?? 'rolling'] ?? 'low'];
  const p1 = new Set(families).size === 1 ? 'ok' : `mixed (${style}/${character}/${far}/${horizonCfg.style ?? 'rolling'})`;
  // C6 (old path): the panorama's far layer — `layers` lifts ranges above the ring on part of the compass, jebels clear it
  const panoChar = horizonCfg.panorama === false ? null
    : world.panorama.resolveHorizonPanoramaCharacter(character, typeof horizonCfg.panorama === 'object' ? horizonCfg.panorama : undefined);
  const pano = panoChar ? { regional: horizonCfg.panorama?.regional ?? null, layers: panoChar.layers, jebels: panoChar.jebelShare } : null;
  const deck = deckColumns(cfg, world.clouds.CLOUDSCAPE_REGIMES);
  const openings = world.edge.resolveSeaOpenings(horizonCfg.seaOpening, field, id).map((o) => ({ az: Math.round(o.azimuthDeg), width: Math.round(o.widthDeg), level: +o.level.toFixed(2), source: o.source }));
  return {
    id, path: 'ring', centre, centreSky: centreSky.elev, eyes: eyeRows, outlandRise, farms, villages, p1, pano, deck, openings,
    rimH: cfg.terrain?.rimH ?? null, fogDensity: cfg.sky?.fogDensity ?? null, style, character, far, settings: { farms: settings.farms },
    exceptions: { ...(RECORDED_EXCEPTIONS[id] ?? {}), ...(horizonCfg.envelopeExceptions ?? {}), ...(cfg.hinterland?.exceptions ?? {}) },
  };
}

/** The criteria for a measured row, failures first; recorded place exceptions excuse their criterion. */
export function judge(row) {
  const E = ENVELOPE, ex = row.exceptions ?? {};
  const c = {};
  const eyeP50 = row.eyes.length ? quantile(row.eyes.map((e) => e.p50), 0.5) : row.centre.p50;
  c.P1 = { value: row.p1, pass: row.p1 === 'ok' };
  c.C1 = { value: +row.centre.p50.toFixed(2), eyes: +eyeP50.toFixed(2), pass: row.centre.p50 >= E.C1[0] && row.centre.p50 <= E.C1[1] };
  c.C2 = { value: +row.outlandRise.toFixed(1), pass: row.outlandRise >= E.C2[0] && row.outlandRise <= E.C2[1] };
  c.C3 = { value: +(1 - row.centre.under1km).toFixed(2), pass: 1 - row.centre.under1km >= E.C3 };
  const summits = row.centre.summits + (row.objectSummits ?? 0);
  c.C4 = { value: summits, pass: summits >= E.C4 };
  // (C5 is reported, not gated: H1's crest-line count is not reproduced — this tool counts every visible crest along the
  // ray, a crest standing 0.05° over every nearer one — so its numbers sit on another scale than the 1.8 threshold)
  c.C5 = { value: +row.centre.lines.toFixed(2), pass: true, advisory: true };
  if (row.c6 !== undefined) c.C6 = { value: +row.c6.toFixed(2), pass: row.c6 >= E.C6 };
  else c.C6 = { value: row.pano ? `L${row.pano.layers}${row.pano.jebels > 0 ? '+jebels' : ''}` : 'off', pass: !!row.pano && (row.pano.layers > 0 || row.pano.jebels > 0) };
  c.C7 = { value: row.fogDensity, pass: row.fogDensity === null || row.fogDensity <= E.C7 };
  c.C8 = { value: row.farms, pass: row.farms >= E.C8 };
  c.C9 = { value: row.rimH, pass: row.rimH !== null && row.rimH >= E.C9[0] && row.rimH <= E.C9[1] };
  const failures = [];
  for (const [k, v] of Object.entries(c)) {
    if (v.pass) continue;
    if (ex[k]) { v.excused = ex[k]; continue; }
    failures.push(k);
  }
  return { criteria: c, failures };
}

function fmtRow(row, verdict) {
  const c = verdict.criteria;
  const f = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
  return `| ${row.id} | ${row.path} | ${f(c.C1.value)} / ${f(c.C1.eyes)} | ${f(c.C2.value)} | ${f(c.C3.value)} | ${f(c.C4.value)} | ${f(c.C5.value)} | ${f(c.C6.value)} | ${row.fogDensity ?? '-'} | ${row.farms} | ${row.rimH ?? '-'} | ${c.P1.value} | ${verdict.failures.join(' ') || 'inside'} |`;
}

const TABLE_HEAD = '| Map | Path | C1 centre / eyes (°) | C2 rise (m) | C3 ≥1 km | C4 summits | C5 lines | C6 | C7 fog | C8 farms | C9 rimH | P1 | Outside |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';

async function main(argv) {
  const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const world = await loadWorld();
  const ids = arg('maps') ? arg('maps').split(',') : world.maps.MAP_IDS;
  const eyes = arg('eyes') === 'centre' ? 'centre' : 'all';
  const withNew = argv.includes('--new');
  const rows = [];
  let hinterland = null;
  for (const id of ids) {
    const started = performance.now();
    const cfg = world.maps.getMapConfig(id);
    const field = world.terrain.createHeightField(1337, cfg);
    const row = await measureRing(world, id, { eyes, field });
    const verdict = judge(row);
    rows.push({ row, verdict });
    console.log(fmtRow(row, verdict));
    if (cfg.hinterland || withNew) {
      hinterland ??= await import('./hinterland-envelope.mjs').catch(() => null);
      if (hinterland) {
        const next = await hinterland.measureHinterland(world, id, { eyes, field, draft: withNew });
        if (next) { const v = judge(next); rows.push({ row: next, verdict: v }); console.log(fmtRow(next, v)); }
      }
    }
    if (process.env.HZ_ENVELOPE_TIMING) console.error(`${id}: ${(performance.now() - started).toFixed(0)} ms`);
  }
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify(rows, null, 1));
  if (arg('md')) {
    const lines = [
      '# Horizon envelope (HB-1a)',
      '',
      `Generated by \`node tools/horizon-envelope.mjs${eyes === 'centre' ? ' --eyes=centre' : ''} --md=docs/HORIZON-ENVELOPE.md\` on ${new Date().toISOString().slice(0, 10)}.`,
      'The envelope is PLAN §1.1 / H1 §5.2 (the nine excellent maps). C1 is the ring skyline median from the centre eye',
      '(ground + 3 m) and the median of the eight EYE8 eyes (2.5 m, 80 m inside each side and corner). A recorded place',
      'exception (`horizon.envelopeExceptions` or `hinterland.exceptions`) excuses its criterion. Rows with path',
      '`hinterland` measure the new field (B-architecture §6.1): near skyline within 4 km, C6 the far skyline over it.',
      '',
      TABLE_HEAD,
      ...rows.map(({ row, verdict }) => fmtRow(row, verdict)),
      '',
      '## Deck table (S1, S5)',
      '',
      '| Map | Regime | Coverage | Today\'s deck (m) | Resolved base (m) | Cap from |',
      '|---|---|---|---|---|---|',
      ...rows.filter(({ row }) => row.path === 'ring').map(({ row }) => `| ${row.id} | ${row.deck.regime} | ${row.deck.coverage ?? '-'} | ${row.deck.todayDeckM} | ${row.deck.resolvedBaseM} | ${row.deck.capFrom} |`),
      '',
      '## Sea openings',
      '',
      ...rows.filter(({ row }) => row.path === 'ring' && row.openings.length).map(({ row }) => `- ${row.id}: ${row.openings.map((o) => `${o.az}° ±${o.width / 2}° at ${o.level} m (${o.source})`).join('; ')}`),
      '',
    ];
    writeFileSync(arg('md'), lines.join('\n'));
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(TABLE_HEAD);
  await main(process.argv.slice(2));
}

export { loadWorld, main as runEnvelope, TABLE_HEAD, fmtRow };
