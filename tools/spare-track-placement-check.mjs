#!/usr/bin/env node
// Spare-track placement receipt (VEH-13, L2 of the three-layer receipt; the owner 2026-10-14: "audit all these track
// decorations for placement and not hanging off or having weird placements").
//
//   node tools/spare-track-placement-check.mjs --ids=strv103a,udes03 [--json=out.json]
//   node tools/spare-track-placement-check.mjs --ids=all --ledger=docs/geometry-gate/spare-track.json --update
//   node tools/spare-track-placement-check.mjs --ids=all --ledger=docs/geometry-gate/spare-track.json --check|--gate
//   node tools/spare-track-placement-check.mjs --crops=jobs.json            # CPU review crops (sheets only)
//
// An independent measurement of every spare-track run on every built tank (decor on). It does NOT reuse the seat
// solver (src/vehicles/spareTrackSeat.ts): it rasterises each run's own triangles, casts its own rays through its own
// triangle grid, and decides with its own thresholds (the census v4 of the 2026-10-15 audit, with the verifier's
// corrections). Only the semantic role tags are shared (userData.seatRole, weapon stock, buckets, fitting types), so a
// grille or a launcher means the same thing to both; the source-text tags of the audit remain as a fallback.
//
// Runs found: decor `tracks` pieces (DECOR_KITS hook), FITTINGS.spareTrackLinks groups, KIT.spareTrackStrip calls,
// registered hand-drawn courses (withSpareTrackRun / spareTrackPart: userData.spareTrackRun), and any other part in a
// *Track bucket or drawn by a spare-link helper (adhoc, clustered by a 5 cm gap) - which is UNCOVERED unless allowlisted.
//
// Per run: support raster from the run's outward face (both faces for adhoc/strip; the better is the run's face),
// host roles under it, sunk / buried share, intersections by class, nearest approach to the gun, mantlet, hatches,
// sights and roof weapons, line-of-sight exposure (48 directions, 4 m), the motion sweep (turret yaw 360 x pitch by
// yaw with armour-limited poses skipped; gun pitch for turret runs; casemate arc; static fixed-in-hull gun) and the
// turret-traverse sweep of turret runs over the hull's solids (turret-self exemption -> HOST_SWEEP, a warning).
//
// Gated classes (--check and --gate fail on any): ON_GUN, IN_SWEEP, HANGING, FLOATING, WEIRD, INTERSECTING, BURIED,
// UNCOVERED, STALE (the ledger row's input hash is not the build's geometry digest). The ledger holds one row per id.
// Cost: about 10 s an id; one process. House rules: 4 GB heap, wall-clock alarm, --yield-load.

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SPARE_TRACK_BUILD, spareTrackGeometryDigest } from './spare-track-digest.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const flag = (k) => argv.includes(`--${k}`);
const WT = path.resolve(arg('wt', process.cwd()));
const OUT = arg('out', null);
const PICS = flag('pics');
const PICS_FLAGGED = flag('pics-flagged');
const QUIET = flag('quiet');
const QUALITY = arg('quality', 'high');
const imp = (rel) => import(pathToFileURL(path.join(WT, rel)).href);
const THREE = await import(pathToFileURL(path.join(WT, 'node_modules/three/build/three.module.js')).href);
const factory = await imp('src/vehicles/tankFactory.ts');
const specs = await imp('src/vehicles/specs.ts');
const decorMod = await imp('src/vehicles/decorations.ts');
const kitMod = await imp('src/vehicles/profiles/kit.ts');
const coreMod = await imp('src/vehicles/tankFactoryCore.ts');
const pitchMod = await imp('src/sim/gunPitchLimits.ts');
// the shared semantic tags (absent on trees older than the seat solver: the source-text tags then stand alone)
const seatMod = fs.existsSync(path.join(WT, 'src/vehicles/spareTrackSeat.ts')) ? await imp('src/vehicles/spareTrackSeat.ts') : null;
const idMod = await imp('src/vehicles/tankIdAliases.ts');
// the seat pass re-runs its search beside the recorded plan (spareTrackSeatPlan.ts) and reports where they differ
const PLAN_REL = 'src/vehicles/spareTrackSeatPlan.ts';
const passMod = fs.existsSync(path.join(WT, PLAN_REL)) ? await imp('src/vehicles/spareTrackSeatPass.ts') : null;
passMod?.setSpareTrackSeatPlanAudit(true);

// ------------------------------------------------------------------ thresholds
const SUPPORT_M = 0.03;      // a host surface within 3 cm beneath = supported
const GAP_REACH_M = 0.30;    // beyond 30 cm beneath (or nothing) = over air
const RAY_LIFT_M = 0.12;     // rays start this far above the bundle base (tolerates embedding)
const CELL_M = 0.01;         // footprint raster
const MAX_RAYS = 1400;
const ADHOC_GAP_M = 0.05;
const PEN_FLAG = { gun: 0.005, mantlet: 0.005, hatch: 0.01, sight: 0.005, auxWeapon: 0.005, decor: 0.02, fitting: 0.02, trackBundle: 0.02 };
const SWEEP_FLAG_M = 0.005;
const PITCH_STEP_DEG = 1;
const YAW_STEP_DEG = 2;

// ------------------------------------------------------------------ stack parsing
const SRC_RE = /\/src\/(.+?\.ts):(\d+):(\d+)/;
function parseStack(stack) {
  const out = [];
  for (const line of stack.split('\n').slice(1)) {
    const m = line.match(/at (?:(.+?) \()?(.+?)\)?$/);
    if (!m) continue;
    const loc = m[2] || '';
    const s = loc.match(SRC_RE);
    if (!s) continue;
    const fn = (m[1] || '<anon>').replace(/^Object\./, '').replace(/^new /, '');
    out.push({ fn, file: s[1], line: +s[2] });
  }
  return out;
}
// the seat solver's tagging ports (withSpareTrackRun, withSeatRole) forward a profile's P.add: plumbing, not a site
const FACTORY_FILES = /^vehicles\/(tankFactoryCore|tankFactory|spareTrackSeat)\.ts$/;
const PLUMBING_FN = /^(add|addEquipment|addHatch|addCupola|addExternalArmor|addModuleVisual|addMudguard|partCensus|<anon>|Proxy\.<anonymous>)$/;
function authorOf(chain) {
  // innermost profile frame (outside the factory); a KIT helper of the factory called on the way is named `via`
  const si = chain.findIndex((f) => !FACTORY_FILES.test(f.file));
  const site = si >= 0 ? chain[si] : null;
  const helper = chain.slice(0, si >= 0 ? si : chain.length).find((f) => FACTORY_FILES.test(f.file) && !PLUMBING_FN.test(f.fn));
  const caller = si >= 0 ? chain.slice(si + 1).find((f) => !FACTORY_FILES.test(f.file)) : null;
  return { site: site ? `${site.fn}@${site.file.replace(/^vehicles\//, '')}:${site.line}` : null, via: helper ? helper.fn : null,
    caller: caller ? `${caller.fn}@${caller.file.replace(/^vehicles\//, '')}:${caller.line}` : null };
}
function captureStack() {
  const lim = Error.stackTraceLimit; Error.stackTraceLimit = 40;
  const s = new Error().stack; Error.stackTraceLimit = lim;
  return parseStack(s);
}

// ------------------------------------------------------------------ hooks
let census = [];
let decorSeq = 0;
const tagged = new Set();
const decorTrackAttempts = [];
const fittingSites = new Map();   // fitting group -> author site
const stripCalls = [];            // { site, bucket, links, x, y, z, rx, ry, startIndex }
const origApply = THREE.BufferGeometry.prototype.applyMatrix4;
THREE.BufferGeometry.prototype.applyMatrix4 = function patchedApply(m) {
  const r = origApply.call(this, m);
  if (this.userData && this.userData.__ta) tagged.add(this);
  return r;
};
const { DECOR_KITS } = decorMod;
const ORIG_KITS = { ...DECOR_KITS };
for (const [k, fn] of Object.entries(ORIG_KITS)) {
  DECOR_KITS[k] = function wrappedKit(opts) {
    const parts = fn.call(DECOR_KITS, opts);
    if (parts && Array.isArray(parts)) {
      const tag = { kit: k, seq: decorSeq++, detail: opts?.detail ?? 1, n: opts?.n ?? null, linkW: opts?.linkW ?? null };
      if (k === 'tracks' && tag.detail !== 0) decorTrackAttempts.push({ seq: tag.seq, n: tag.n, linkW: tag.linkW });
      parts.forEach((p, i) => { if (p?.geo) p.geo.userData = { ...p.geo.userData, __ta: { ...tag, part: i, mat: p.mat } }; });
    }
    return parts;
  };
}
const { FITTINGS } = kitMod;
const origSpareLinks = FITTINGS.spareTrackLinks;
FITTINGS.spareTrackLinks = function wrappedSpareLinks(opts) {
  const g = origSpareLinks.call(FITTINGS, opts);
  try { fittingSites.set(g, { ...authorOf(captureStack()), links: opts?.links ?? null, width: opts?.width ?? null }); } catch { /* noop */ }
  return g;
};
const { KIT } = coreMod;
const origStrip = KIT.spareTrackStrip;
KIT.spareTrackStrip = function wrappedStrip(builder, bucket, x, y, z, links, rx = 0, ry = 0) {
  stripCalls.push({ ...authorOf(captureStack()), bucket, links, at: [x, y, z], rx, ry, startIndex: census.length });
  return origStrip.call(KIT, builder, bucket, x, y, z, links, rx, ry);
};
function partCensus(bucket, part, source) {
  census.push({ bucket, part, source, chain: captureStack() });
}

// ------------------------------------------------------------------ small math
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;

function rayTri(ox, oy, oz, dx, dy, dz, T, k) {
  const ax = T[k], ay = T[k + 1], az = T[k + 2];
  const e1x = T[k + 3] - ax, e1y = T[k + 4] - ay, e1z = T[k + 5] - az;
  const e2x = T[k + 6] - ax, e2y = T[k + 7] - ay, e2z = T[k + 8] - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-12 && det < 1e-12) return -1;
  const inv = 1 / det;
  const sx = ox - ax, sy = oy - ay, sz = oz - az;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}
// squared distance from p to triangle (Ericson, closest point)
function distTri2(p, T, k) {
  const a = [T[k], T[k + 1], T[k + 2]], b = [T[k + 3], T[k + 4], T[k + 5]], c = [T[k + 6], T[k + 7], T[k + 8]];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const sq = (q) => { const d = sub(p, q); return dot(d, d); };
  if (d1 <= 0 && d2 <= 0) return sq(a);
  const bp = sub(p, b); const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return sq(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return sq([a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]); }
  const cp = sub(p, c); const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return sq(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return sq([a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return sq([b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]);
  }
  const den = 1 / (va + vb + vc); const v = vb * den, w = vc * den;
  return sq([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

// ------------------------------------------------------------------ bodies
// body: { id, label, cls, rig ('hull'|'turret'|'gunmount'|'recoil'), tris: Float32Array (root space), aabb, ... }
function trisOf(geometry, matrix) {
  const pos = geometry.getAttribute('position');
  if (!pos) return new Float32Array(0);
  const idx = geometry.index;
  const n = idx ? idx.count : pos.count;
  const T = new Float32Array(Math.floor(n / 3) * 9);
  const e = matrix ? matrix.elements : null;
  for (let i = 0; i + 2 < n; i += 3) {
    for (let j = 0; j < 3; j++) {
      const vi = idx ? idx.getX(i + j) : i + j;
      let x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
      if (e) {
        const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
        const X = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
        const Y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
        const Z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
        x = X; y = Y; z = Z;
      }
      const o = (i / 3) * 9 + j * 3;
      T[o] = x; T[o + 1] = y; T[o + 2] = z;
    }
  }
  return T;
}
function aabbOf(T) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < T.length; i += 3) {
    for (let a = 0; a < 3; a++) { const v = T[i + a]; if (v < b[a]) b[a] = v; if (v > b[a + 3]) b[a + 3] = v; }
  }
  return b;
}
const aabbHit = (a, b, pad = 0) => a[0] - pad <= b[3] && b[0] - pad <= a[3] && a[1] - pad <= b[4] && b[1] - pad <= a[4] && a[2] - pad <= b[5] && b[2] - pad <= a[5];
const inAabb = (p, b, pad = 0) => p[0] >= b[0] - pad && p[0] <= b[3] + pad && p[1] >= b[1] - pad && p[1] <= b[4] + pad && p[2] >= b[2] - pad && p[2] <= b[5] + pad;

// split a triangle soup into position-connected components
function components(T) {
  const nt = T.length / 9;
  if (nt <= 1) return [T];
  const key = (o) => `${Math.round(T[o] * 2e4)},${Math.round(T[o + 1] * 2e4)},${Math.round(T[o + 2] * 2e4)}`;
  const parent = new Int32Array(nt).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  for (let t = 0; t < nt; t++) {
    for (let j = 0; j < 3; j++) {
      const k = key(t * 9 + j * 3);
      const o = owner.get(k);
      if (o === undefined) owner.set(k, t); else { const a = find(o), b = find(t); if (a !== b) parent[a] = b; }
    }
  }
  const groups = new Map();
  for (let t = 0; t < nt; t++) { const r = find(t); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
  if (groups.size === 1) return [T];
  return [...groups.values()].map((ts) => { const o = new Float32Array(ts.length * 9); ts.forEach((t, i) => o.set(T.subarray(t * 9, t * 9 + 9), i * 9)); return o; });
}

// point inside a (closed) body by ray parity; returns depth to the body surface or 0
const PAR_DIR = norm([0.5773, 0.5774, 0.5776]);
function insideDepth(p, body) {
  if (!insideTest(p, body)) return 0;
  const T = body.tris;
  let best = Infinity;
  for (let k = 0; k < T.length; k += 9) best = Math.min(best, distTri2(p, T, k));
  return Math.sqrt(best);
}
// sample points of a body: vertices + edge samples every `step`
function samplesOf(body, step = 0.02) {
  const key = `s${step}`;
  if (body[key]) return body[key];
  const T = body.tris, out = [];
  const seen = new Set();
  for (let k = 0; k < T.length; k += 9) {
    for (let e = 0; e < 3; e++) {
      const a = k + e * 3, b = k + ((e + 1) % 3) * 3;
      const ka = `${T[a].toFixed(4)},${T[a + 1].toFixed(4)},${T[a + 2].toFixed(4)}`;
      const kb = `${T[b].toFixed(4)},${T[b + 1].toFixed(4)},${T[b + 2].toFixed(4)}`;
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(ek)) continue;
      seen.add(ek);
      const L = Math.hypot(T[b] - T[a], T[b + 1] - T[a + 1], T[b + 2] - T[a + 2]);
      const n = Math.max(1, Math.ceil(L / step));
      for (let i = 0; i < n; i++) {
        const f = i / n;
        out.push([T[a] + (T[b] - T[a]) * f, T[a + 1] + (T[b + 1] - T[a + 1]) * f, T[a + 2] + (T[b + 2] - T[a + 2]) * f]);
      }
    }
  }
  body[key] = out;
  return out;
}
function transformBody(body, M) {   // M: THREE.Matrix4, returns a lightweight moved copy
  const T = body.tris, e = M.elements, o = new Float32Array(T.length);
  for (let i = 0; i < T.length; i += 3) {
    const x = T[i], y = T[i + 1], z = T[i + 2];
    o[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    o[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    o[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  const moved = { ...body, tris: o, aabb: aabbOf(o) };
  for (const k of Object.keys(moved)) if (/^s0\./.test(k)) delete moved[k];
  return moved;
}
const PAR_DIRS = [norm([0.5773, 0.5774, 0.5776]), norm([-0.61, 0.23, -0.757]), norm([0.18, -0.93, 0.32])];
function insideTest(p, body) {
  if (!inAabb(p, body.aabb)) return false;
  const T = body.tris;
  for (const d of PAR_DIRS) {   // inside only when every direction agrees (open shells give mixed parity)
    let hits = 0;
    for (let k = 0; k < T.length; k += 9) if (rayTri(p[0], p[1], p[2], d[0], d[1], d[2], T, k) > 1e-7) hits++;
    if ((hits & 1) === 0) return false;
  }
  return true;
}
const SOLID_HOST = new Set(['armor', 'gun', 'mantlet', 'hatch', 'fitting', 'auxWeapon', 'sight']);
function buriedShare(B, bodies) {
  const pts = []; for (const b of B.bodies) for (const p of samplesOf(b, 0.03)) pts.push(p);
  const stride = Math.max(1, Math.ceil(pts.length / 500));
  const cands = bodies.filter((b) => SOLID_HOST.has(b.cls) && !B.idSet.has(b.id) && aabbHit(b.aabb, B.aabb, 0));
  let n = 0, inside = 0; const by = new Map();
  const insidePts = [];
  for (let i = 0; i < pts.length; i += stride) {
    n++;
    const host = cands.find((b) => insideTest(pts[i], b));
    if (host) { inside++; by.set(host.label, (by.get(host.label) || 0) + 1); insidePts.push([pts[i], host]); }
  }
  // v4: how deep the sunk samples sit (distance to the enclosing body's surface); share of samples deeper than 1 cm
  let deep = 0, maxDepth = 0, maxWith = null;
  const dStride = Math.max(1, Math.ceil(insidePts.length / 160));
  let dn = 0;
  for (let i = 0; i < insidePts.length; i += dStride) {
    const [p, host] = insidePts[i];
    const T = host.tris; let best = Infinity;
    for (let k = 0; k < T.length; k += 9) { const d2 = distTri2(p, T, k); if (d2 < best) best = d2; }
    const d = Math.sqrt(best);
    dn++;
    if (d > 0.01) deep++;
    if (d > maxDepth) { maxDepth = d; maxWith = `${host.label} [${host.cls}]`; }
  }
  const deepShare = dn && n ? (deep / dn) * (inside / n) : 0;
  const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  return { share: n ? r3(inside / n) : 0, inside: top ? top[0] : null, deep1cmShare: r3(deepShare), maxDepthM: r3(maxDepth), maxDepthWith: maxWith };
}
// v4: nearest approach (<= 6 cm) between the bundle and bodies of a class (surface-to-surface, sampled)
const NEAR_CLASSES = ['gun', 'mantlet', 'hatch', 'sight', 'auxWeapon'];
function nearOf(B, bodies, reach = 0.06) {
  const out = {};
  const tris = []; for (const b of B.bodies) tris.push(b.tris);
  const bp = []; for (const b of B.bodies) for (const p of samplesOf(b, 0.03)) bp.push(p);
  for (const cls of NEAR_CLASSES) {
    let best = Infinity, bestWith = null;
    for (const T of bodies) {
      if (T.cls !== cls || B.idSet.has(T.id) || !aabbHit(T.aabb, B.aabb, reach)) continue;
      // target samples near the bundle box -> distance to bundle triangles
      for (const p of samplesOf(T, 0.02)) {
        if (!inAabb(p, B.aabb, reach)) continue;
        for (const BT of tris) for (let k = 0; k < BT.length; k += 9) { const d2 = distTri2(p, BT, k); if (d2 < best) { best = d2; bestWith = T.label; } }
      }
      // bundle samples near the target box -> distance to target triangles (small targets only)
      if (T.tris.length / 9 <= 6000) {
        for (const p of bp) {
          if (!inAabb(p, T.aabb, reach)) continue;
          for (let k = 0; k < T.tris.length; k += 9) { const d2 = distTri2(p, T.tris, k); if (d2 < best) { best = d2; bestWith = T.label; } }
        }
      }
    }
    if (best <= reach * reach) out[cls] = { distM: r3(Math.sqrt(best)), with: bestWith };
  }
  return out;
}

// max mutual penetration of two body lists (parity inside test both ways)
function penetration(listA, listB, aabbA, aabbB) {
  let best = { depth: 0, a: null, b: null, p: null };
  if (!aabbHit(aabbA, aabbB, 0.005)) return best;
  for (const A of listA) {
    if (!aabbHit(A.aabb, aabbB, 0.005)) continue;
    for (const B of listB) {
      if (!aabbHit(A.aabb, B.aabb, 0.002)) continue;
      for (const p of samplesOf(A)) {
        if (!inAabb(p, B.aabb)) continue;
        const d = insideDepth(p, B);
        if (d > best.depth) best = { depth: d, a: A, b: B, p };
      }
      for (const p of samplesOf(B)) {
        if (!inAabb(p, A.aabb)) continue;
        const d = insideDepth(p, A);
        if (d > best.depth) best = { depth: d, a: A, b: B, p };
      }
    }
  }
  return best;
}
function unionAabb(list) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const x of list) for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], x.aabb[a]); b[a + 3] = Math.max(b[a + 3], x.aabb[a + 3]); }
  return b;
}

// ------------------------------------------------------------------ triangle grid (host raycasts)
class TriGrid {
  constructor(bodies, cell = 0.1) {
    this.cell = cell;
    let n = 0;
    for (const b of bodies) n += b.tris.length / 9;
    this.T = new Float32Array(n * 9);
    this.owner = new Int32Array(n);
    this.bodies = bodies;
    this.map = new Map();
    this.stamp = new Int32Array(n);
    this.ray = 0;
    let t = 0;
    bodies.forEach((b, bi) => {
      this.T.set(b.tris, t * 9);
      for (let i = 0; i < b.tris.length / 9; i++) this.owner[t + i] = bi;
      t += b.tris.length / 9;
    });
    const T = this.T, c = cell;
    for (let i = 0; i < n; i++) {
      const k = i * 9;
      const x0 = Math.floor(Math.min(T[k], T[k + 3], T[k + 6]) / c), x1 = Math.floor(Math.max(T[k], T[k + 3], T[k + 6]) / c);
      const y0 = Math.floor(Math.min(T[k + 1], T[k + 4], T[k + 7]) / c), y1 = Math.floor(Math.max(T[k + 1], T[k + 4], T[k + 7]) / c);
      const z0 = Math.floor(Math.min(T[k + 2], T[k + 5], T[k + 8]) / c), z1 = Math.floor(Math.max(T[k + 2], T[k + 5], T[k + 8]) / c);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 40000) continue; // degenerate giant (none expected)
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const key = this.key(x, y, z);
        let a = this.map.get(key);
        if (!a) { a = []; this.map.set(key, a); }
        a.push(i);
      }
    }
  }
  key(x, y, z) { return ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024); }
  // nearest hit along o + t*d, t in [0, tmax]; skip(bodyIndex) -> true to ignore
  cast(o, d, tmax, skip) {
    const c = this.cell, step = c * 0.3;
    this.ray++;
    let best = Infinity, bestTri = -1;
    const n = Math.ceil(tmax / step) + 1;
    let lastKey = null;
    for (let i = 0; i <= n; i++) {
      const t = Math.min(tmax, i * step);
      const x = Math.floor((o[0] + d[0] * t) / c), y = Math.floor((o[1] + d[1] * t) / c), z = Math.floor((o[2] + d[2] * t) / c);
      const key = this.key(x, y, z);
      if (key === lastKey) continue;
      lastKey = key;
      const list = this.map.get(key);
      if (!list) continue;
      for (const tri of list) {
        if (this.stamp[tri] === this.ray) continue;
        this.stamp[tri] = this.ray;
        if (skip && skip(this.owner[tri])) continue;
        const tt = rayTri(o[0], o[1], o[2], d[0], d[1], d[2], this.T, tri * 9);
        if (tt >= 0 && tt <= tmax && tt < best) { best = tt; bestTri = tri; }
      }
    }
    return bestTri < 0 ? null : { t: best, body: this.owner[bestTri], tri: bestTri };
  }
}

// ------------------------------------------------------------------ classification
const GUN_CHAIN_RE = /^(hullGun|fixedGunRun|muzzleBore|buildGun|gunTube|mainGunTube|addMainGun)$/;
const SIGHT_RE = /periscope|sight|optic|emes|vision|thermal|camera|laser|rangefind|peri\b|episcope|prism/i;
const HATCH_RE = /hatch|cupola/i;
const AUX_FITTINGS = new Set(['pintleMG', 'americanM2', 'americanRws', 'openYokeRws', 'auxiliaryWeapon', 'coaxMG']);
const AUX_RE = /browningDerived|MachineGun|pintleMG|Rws|RWS|auxiliaryWeapon|Flw200|coax|_mag\b|_mg\d|dshk|nsvt|kord|m2hb/i;
const GEAR_RE = /^gear|RoadWheel|ReturnRoller|EndWheel|TrackBand|TrackPads|Sprocket|Idler|Suspension/i;
function rigOf(obj) {
  for (let p = obj; p; p = p.parent) {
    if (p.name === 'rig_recoil' || /^barrel\dG$/.test(p.name) || p.name === 'rig_muzzle') return 'recoil';
    if (p.name === 'rig_gun') return 'gunmount';
    if (p.name === 'rig_turret') return 'turret';
    if (p.name === 'rig_hull') return 'hull';
  }
  return 'hull';
}
function fittingOf(obj) {
  let found = null;
  for (let p = obj; p; p = p.parent) {
    if (/^rig_/.test(p.name)) break;
    if (typeof p.userData?.fitting === 'string' && (!found || p.userData.fittingRoot === true || p.userData.fitting === found.id)) found = { id: p.userData.fitting, root: p };
  }
  return found;
}
function pathOf(obj) {
  const names = [];
  for (let p = obj; p && !/^rig_|^tank_/.test(p.name); p = p.parent) if (p.name) names.unshift(p.name);
  return names.join('/') || obj.name || '<mesh>';
}
function classifyCensus(c, rig) {
  if (rig === 'recoil') return 'gun';
  if (rig === 'gunmount') return /Glass/.test(c.bucket) ? 'sight' : 'mantlet';
  const fns = c.chain.map((f) => f.fn);
  if (fns.some((f) => GUN_CHAIN_RE.test(f))) return 'gun';
  if (/Hatch$|Cupola$/.test(c.bucket)) return 'hatch';
  if (/Glass$/.test(c.bucket)) return 'sight';
  const near = fns.slice(0, 4).join(' ');
  if (/\b(periscope|sight|optic|episcope)/i.test(near)) return 'sight';
  if (/\b(cupola|hatch)/i.test(near)) return 'hatch';
  if (/\b(pintleMG|machineGun|rws)/i.test(near)) return 'auxWeapon';
  if (/^hullRunningGear|^gear/.test(c.bucket)) return 'runningGear';
  return 'armor';
}
function classifyObject(mesh, rig, fit) {
  if (mesh.userData?.runningGear || GEAR_RE.test(mesh.name)) return 'runningGear';
  if (rig === 'recoil') return 'gun';
  const fid = fit?.id || '';
  if (AUX_FITTINGS.has(fid) || AUX_RE.test(mesh.name) || AUX_RE.test(fit?.root?.name || '')) return 'auxWeapon';
  if (rig === 'gunmount') return 'mantlet';
  if (SIGHT_RE.test(fid) || SIGHT_RE.test(mesh.name)) return 'sight';
  if (HATCH_RE.test(fid) || HATCH_RE.test(mesh.name) || mesh.userData?.combatHitboxPart) return 'hatch';
  if (fit) return 'fitting';
  return 'armor';
}
function excludedMesh(o) {
  if (!o.isMesh || o.isInstancedMesh || !o.geometry?.getAttribute?.('position')) return true;
  const n = o.name || '';
  if (o.userData?.fieldSuit || /ghillie|vehicleMarking|procShadow|muzzleBore|Shadow|decal|^decor_/i.test(n)) return true;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (m && m.colorWrite === false) return true;
  return false;
}
function visitMeshes(root, fn) {
  const visit = (o) => {
    if (o.visible === false) return;
    if (o.isLOD) { if (o.levels?.length && o.levels[0].object) visit(o.levels[0].object); return; }
    if (o.isMesh) fn(o);
    for (const c of o.children) visit(c);
  };
  visit(root);
}

// ------------------------------------------------------------------ build + collect
function buildTank(id) {
  census = []; decorSeq = 0; tagged.clear(); fittingSites.clear(); stripCalls.length = 0; decorTrackAttempts.length = 0;
  const t0 = Date.now();
  const visual = factory.createTank(id, null, { ...SPARE_TRACK_BUILD, quality: QUALITY, partCensus });
  visual.root.updateMatrixWorld(true);
  return { visual, buildMs: Date.now() - t0 };
}

function posKeySet(geometry) {
  if (geometry.__taKeys) return geometry.__taKeys;
  const pos = geometry.getAttribute('position'), s = new Set();
  for (let i = 0; i < pos.count; i++) s.add(`${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`);
  geometry.__taKeys = s;
  return s;
}
function partInMesh(part, mesh) {
  const pos = part.getAttribute('position');
  if (!pos || !pos.count) return false;
  const s = posKeySet(mesh.geometry);
  for (const i of [0, pos.count >> 1, pos.count - 1]) {
    if (!s.has(`${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`)) return false;
  }
  return true;
}

function collect(visual, spec) {
  const root = visual.root;
  const bodies = [];
  const meshesByName = new Map();
  const allMeshes = [];
  visitMeshes(root, (m) => { allMeshes.push(m); if (!meshesByName.has(m.name)) meshesByName.set(m.name, []); meshesByName.get(m.name).push(m); });
  const bucketNames = new Set(census.map((c) => c.bucket));
  let live = 0, dead = 0;
  // 1. census (bucket) parts
  census.forEach((c, ci) => {
    const cands = meshesByName.get(c.bucket) || [];
    let host = cands.find((m) => partInMesh(c.part, m));
    if (!host) host = allMeshes.find((m) => !excludedMesh(m) && m.name !== c.bucket && bucketNames.has(m.name) && partInMesh(c.part, m));
    if (!host) { dead++; c.dead = true; return; }
    live++;
    c.hostMesh = host;
    if (excludedMesh(host) || host.userData?.fieldSuit) { c.dead = true; return; }
    const rig = rigOf(host);
    const tris = trisOf(c.part, host.matrixWorld);
    if (!tris.length) return;
    const au = authorOf(c.chain);
    const cls = classifyCensus(c, rig);
    c.body = { id: bodies.length, kind: 'census', ci, label: `${c.bucket}<${au.via ? `${au.via}<-` : ''}${au.site ?? '?'}>`, bucket: c.bucket, site: au.site, via: au.via,
      cls, rig, tris, aabb: aabbOf(tris), mesh: host.name, chain: c.chain,
      role: seatMod ? seatMod.seatRoleForPart(c.bucket, c.part) : null, run: c.part.userData?.spareTrackRun ?? null };
    bodies.push(c.body);
  });
  // 2. object meshes (fittings, gear, gun meshes not from buckets)
  for (const m of allMeshes) {
    if (excludedMesh(m) || bucketNames.has(m.name)) continue;
    const rig = rigOf(m);
    const fit = fittingOf(m);
    const cls = classifyObject(m, rig, fit);
    const T = trisOf(m.geometry, m.matrixWorld);
    if (!T.length) continue;
    const comps = cls === 'runningGear' ? [T] : components(T);
    for (const comp of comps) {
      bodies.push({ id: bodies.length, kind: 'object', label: pathOf(m), cls, rig, tris: comp, aabb: aabbOf(comp), mesh: m.name,
        fitting: fit?.id || null, fittingRoot: fit?.root || null, meshRef: m, role: seatMod ? seatMod.seatRoleForMesh(m) : null });
    }
  }
  // 3. decor pieces (tagged, committed near geometry)
  const decorKeys = new Map();
  visitMeshes(root, (m) => { if (/^decor_/.test(m.name) && !/_coarse$/.test(m.name)) decorKeys.set(m, posKeySet(m.geometry)); });
  const decorMeshFor = (g) => { for (const [m] of decorKeys) if (partInMesh(g, m)) return m; return null; };
  const seenSig = new Set();
  const decorPieces = new Map();
  for (const g of tagged) {
    const tag = g.userData.__ta;
    if (tag.detail === 0) continue;
    const m = decorMeshFor(g);
    if (!m) continue;
    const pos = g.getAttribute('position');
    const sig = `${tag.seq}:${tag.part}:${pos.count}:${pos.getX(0).toFixed(5)},${pos.getY(0).toFixed(5)},${pos.getZ(0).toFixed(5)}`;
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    // decor groups ride rig_decor_<frame> under hullG / turretG
    const tris = trisOf(g, m.matrixWorld);
    const rig = rigOf(m);
    const body = { id: bodies.length, kind: 'decor', label: `decor:${tag.kit}#${tag.seq}`, cls: 'decor', rig, tris, aabb: aabbOf(tris), decor: tag, role: 'decor' };
    bodies.push(body);
    if (!decorPieces.has(tag.seq)) decorPieces.set(tag.seq, { kit: tag.kit, seq: tag.seq, n: tag.n, linkW: tag.linkW, bodies: [] });
    decorPieces.get(tag.seq).bodies.push(body);
  }
  // VERIFY: rendered bucket-mesh triangles not covered by any live census part (orphans)
  const diag = { orphanMeshes: [] };
  const cKey = (T, k) => `${Math.round((T[k] + T[k + 3] + T[k + 6]) * 3333)},${Math.round((T[k + 1] + T[k + 4] + T[k + 7]) * 3333)},${Math.round((T[k + 2] + T[k + 5] + T[k + 8]) * 3333)}`;
  for (const m of allMeshes) {
    if (excludedMesh(m) || !bucketNames.has(m.name)) continue;
    const have = new Map();
    for (const c of census) {
      if (c.hostMesh !== m || !c.part) continue;
      const T = trisOf(c.part, null);
      for (let k = 0; k < T.length; k += 9) { const key = cKey(T, k); have.set(key, (have.get(key) || 0) + 1); }
    }
    const T = trisOf(m.geometry, null);
    const orphanIdx = [];
    for (let k = 0; k < T.length; k += 9) { const key = cKey(T, k); const n = have.get(key) || 0; if (n > 0) have.set(key, n - 1); else orphanIdx.push(k); }
    if (orphanIdx.length) {
      diag.orphanMeshes.push({ mesh: pathOf(m), tris: T.length / 9, orphanTris: orphanIdx.length, rig: rigOf(m) });
      if (process.env.V_ORPHANS === '1') {
        const O = new Float32Array(orphanIdx.length * 9);
        orphanIdx.forEach((k, i) => O.set(T.subarray(k, k + 9), i * 9));
        const W = trisOf({ getAttribute: (n) => (n === 'position' ? { count: O.length / 3, getX: (i) => O[i * 3], getY: (i) => O[i * 3 + 1], getZ: (i) => O[i * 3 + 2] } : null), index: null }, m.matrixWorld);
        for (const comp of components(W)) bodies.push({ id: bodies.length, kind: 'orphan', label: `orphan:${m.name}`, cls: rigOf(m) === 'recoil' ? 'gun' : rigOf(m) === 'gunmount' ? 'mantlet' : 'armor', rig: rigOf(m), tris: comp, aabb: aabbOf(comp), mesh: m.name });
      }
    }
  }
  return { bodies, decorPieces, coverage: { censusParts: census.length, live, dead }, diag };
}

// ------------------------------------------------------------------ source context (ad hoc spare-link evidence)
const SRC_LINES = new Map();
function srcLines(file) {
  if (!SRC_LINES.has(file)) {
    try { SRC_LINES.set(file, fs.readFileSync(path.join(WT, 'src', file), 'utf8').split('\n')); } catch { SRC_LINES.set(file, []); }
  }
  return SRC_LINES.get(file);
}
// the call line, its trailing comment, the code lines up to the nearest comment block above it (<= 14 lines) and that block
function contextFor(frame) {
  const L = srcLines(frame.file);
  const out = [];
  let i = frame.line - 1, inBlock = false;
  for (let k = 0; k < 14 && i >= 0; k++, i--) {
    const t = L[i]?.trim() ?? '';
    const isComment = t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
    if (isComment) { inBlock = true; out.push(t); continue; }
    if (inBlock) break;
    const c = t.indexOf('//');
    out.push(c >= 0 ? t.slice(c) : '');
  }
  return out.join(' ').replace(/(hull|turret)Track\w*/g, '');
}
// v4: the authoring text of a host body (call line, nearby comments, helper names) for semantic tags (grille, exhaust, ...)
function srcText(body) {
  if (!body) return null;
  if (body.__src !== undefined) return body.__src;
  let s;
  if (body.kind === 'census' && body.chain) {
    const site = body.chain.find((f) => !FACTORY_FILES.test(f.file));
    const fns = body.chain.slice(0, 6).map((f) => f.fn).join(' ');
    const code = site ? (srcLines(site.file)[site.line - 1] || '').trim() : '';
    s = `${fns} | ${code} | ${site ? contextFor(site) : ''}`;
  } else if (body.kind === 'decor') {
    s = `${body.label} kit ${body.decor?.kit ?? ''}`;
  } else {
    s = `${body.label} ${body.fitting ?? ''} ${body.mesh ?? ''}`;
  }
  body.__src = s.replace(/\s+/g, ' ').slice(0, 260);
  return body.__src;
}
const SPARE_TEXT_RE = /spare|\blinks?\b/i;
// spare links drawn into ordinary buckets with no semantic marker (found by reading the profiles)
// (trees older than the registration: registered courses carry userData.spareTrackRun and never reach this list)
const ADHOC_SITES = [
  { file: 'vehicles/profiles/leopardX.ts', from: 257, to: 259, why: 'bowFittings(spareTracks) links in hullDark/hullDetail' },
  // the four sites the verifier found the census missed (2026-10-15, verify/sites.json), main 5ab143d57 lines
  { file: 'vehicles/profiles/type10XBow.ts', from: 5, to: 20, why: 'Type 10 bow link bodies and pins' },
  { file: 'vehicles/profiles/arieteXSuppliedHullEquipment.ts', from: 10, to: 20, why: 'Ariete forward link carry' },
  { file: 'vehicles/profiles/abramsSourceXUkraineKit.ts', from: 234, to: 234, why: 'Ukrainian M1 rear-deck track shoes' },
  { file: 'vehicles/profiles/merkavaX.ts', from: 286, to: 289, why: 'Merkava 3D basket link stacks' },
];

// ------------------------------------------------------------------ bundles
function findBundles(visual, spec, bodies, decorPieces) {
  const bundles = [];
  // decor 'tracks'
  const summary = visual.root.userData.__decorSummary;
  const trackReceipts = (summary?.pieces || []).filter((p) => p.kit === 'tracks');
  let ri = 0;
  for (const piece of [...decorPieces.values()].sort((a, b) => a.seq - b.seq)) {
    if (piece.kit !== 'tracks') continue;
    const receipt = trackReceipts[ri++] || null;
    piece.bodies.forEach((b) => { b.cls = 'trackBundle'; });
    bundles.push({ source: 'decor', name: `decor:tracks#${piece.seq}`, author: receipt?.attachment ? `decorations.ts manifest slot '${receipt.attachment.slot}'` : 'decorations.ts manifest',
      bodies: piece.bodies, links: piece.n, receipt: receipt?.attachment || null,
      normalHint: receipt?.attachment?.supportNormal || null });
  }
  // fittings
  const fitGroups = new Map();
  for (const b of bodies) {
    if (b.kind !== 'object' || !b.fittingRoot) continue;
    const r = b.fittingRoot;
    if (r.userData.fitting !== 'spareTrackLinks' && r.userData.designFamily !== 'cot-spare-track-carrier-v2') continue;
    if (!fitGroups.has(r)) fitGroups.set(r, []);
    fitGroups.get(r).push(b);
  }
  for (const [g, list] of fitGroups) {
    list.forEach((b) => { b.cls = 'trackBundle'; });
    const site = fittingSites.get(g);
    const q = new THREE.Quaternion(); g.getWorldQuaternion(q);
    const axis = new THREE.Vector3(...(g.userData.mountAxisLocal || [0, 1, 0])).applyQuaternion(q).normalize();
    bundles.push({ source: 'fitting', name: `fitting:spareTrackLinks@${site?.site ?? pathOf(g)}`, author: site?.site ?? null, bodies: list,
      links: site?.links ?? null, normalHint: axis.toArray() });
  }
  // registered runs (KIT.spareTrackStrip and withSpareTrackRun / spareTrackPart courses: userData.spareTrackRun)
  const regRuns = new Map();
  const regCi = new Set();
  census.forEach((c, ci) => {
    const tag = c.part?.userData?.spareTrackRun;
    if (!tag || !c.body) return;
    regCi.add(ci);
    if (!regRuns.has(tag)) regRuns.set(tag, []);
    regRuns.get(tag).push(c.body);
  });
  for (const [tag, list] of regRuns) {
    list.forEach((b) => { b.cls = 'trackBundle'; });
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(tag.rotation || [0, 0, 0])));
    const rigs = new Set(list.map((b) => b.rig));
    if (rigs.has('turret')) { const tq = new THREE.Quaternion(); visual.root.getObjectByName('rig_turret')?.getWorldQuaternion(tq); q.premultiply(tq); }
    const axis = new THREE.Vector3(0, 1, 0);
    if (tag.axis === 2) axis.set(0, 0, 1);
    axis.applyQuaternion(q).normalize();
    bundles.push({ source: tag.source || 'adhoc', registered: true, name: `${tag.source || 'adhoc'}:${tag.site}@${list[0].site ?? '?'}`, author: list[0].site ?? null,
      bodies: list, links: null, normalHint: axis.toArray() });
  }
  // KIT.spareTrackStrip calls: parts whose chain passes through spareTrackStrip (trees without registration)
  const stripParts = [];
  census.forEach((c, ci) => { if (!regCi.has(ci) && c.chain.some((f) => f.fn === 'spareTrackStrip')) stripParts.push(ci); });
  const groups = [];
  let cur = null, last = -2, lastSteel = false, lastSite = null;
  for (const ci of stripParts) {
    const c = census[ci];
    const site = authorOf(c.chain).site;
    const steel = /Track$/.test(c.bucket);
    if (!cur || ci !== last + 1 || site !== lastSite || (!steel && lastSteel)) { cur = { site, parts: [] }; groups.push(cur); }
    cur.parts.push(ci);
    last = ci; lastSteel = steel; lastSite = site;
  }
  const stripCi = new Set(stripParts);
  for (const gr of groups) {
    const list = gr.parts.map((ci) => census[ci].body).filter(Boolean);
    if (!list.length) continue;
    list.forEach((b) => { b.cls = 'trackBundle'; });
    const links = gr.parts.filter((ci) => /Track$/.test(census[ci].bucket)).length / 2;
    bundles.push({ source: 'strip', name: `strip:spareTrackStrip@${gr.site}`, author: gr.site, bodies: list, links, normalHint: null });
  }
  // ad hoc: remaining hullTrack/turretTrack parts, or parts from a spare-link helper
  const adhoc = [];
  const notLinks = new Map();
  census.forEach((c, ci) => {
    if (!c.body || stripCi.has(ci) || regCi.has(ci)) return;
    const fns = c.chain.slice(0, 4).map((f) => f.fn).join(' ');
    const site = c.chain.find((f) => !FACTORY_FILES.test(f.file));
    const text = site ? contextFor(site) : '';
    const trackBucket = /^(hull|turret)Track$/.test(c.bucket);
    const listed = c.chain.some((f) => ADHOC_SITES.some((a) => f.file === a.file && f.line >= a.from && f.line <= a.to));
    if (/spare.?(link|track)/i.test(fns) || (trackBucket && SPARE_TEXT_RE.test(text)) || listed) {
      c.body.evidence = /spare.?(link|track)/i.test(fns) ? 'helper name' : listed ? 'listed site' : 'source comment';
      adhoc.push(c.body);
    } else if (trackBucket) notLinks.set(c.body.site, (notLinks.get(c.body.site) || 0) + 1);
  });
  bundles.trackMaterialNonLinks = [...notLinks.entries()].map(([site, n]) => ({ site, parts: n }));
  // cluster by AABB gap
  const used = new Set();
  for (const b of adhoc) {
    if (used.has(b)) continue;
    const cl = [b]; used.add(b);
    for (let i = 0; i < cl.length; i++) {
      for (const o of adhoc) if (!used.has(o) && o.rig === cl[i].rig && aabbHit(cl[i].aabb, o.aabb, ADHOC_GAP_M)) { used.add(o); cl.push(o); }
    }
    cl.forEach((x) => { x.cls = 'trackBundle'; });
    const sites = [...new Set(cl.map((x) => x.site))];
    bundles.push({ source: 'adhoc', name: `adhoc:${cl[0].bucket}@${sites.join('+')}`, author: sites.join(' + '), bodies: cl, links: null, normalHint: null });
  }
  bundles.forEach((B, i) => {
    B.index = i;
    B.aabb = unionAabb(B.bodies);
    const rigs = new Set(B.bodies.map((b) => b.rig));
    B.rig = rigs.has('recoil') ? 'recoil' : rigs.has('gunmount') ? 'gunmount' : rigs.has('turret') ? 'turret' : 'hull';
    B.idSet = new Set(B.bodies.map((b) => b.id));
  });
  return bundles;
}

// ------------------------------------------------------------------ support raster
function pcaNormal(B) {
  const pts = [];
  for (const b of B.bodies) for (let i = 0; i < b.tris.length; i += 3) pts.push([b.tris[i], b.tris[i + 1], b.tris[i + 2]]);
  const c = [0, 0, 0]; pts.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  // smallest eigenvector via inverse power iteration on (C + eps I)
  const M = new THREE.Matrix3().set(C[0][0] + 1e-9, C[0][1], C[0][2], C[1][0], C[1][1] + 1e-9, C[1][2], C[2][0], C[2][1], C[2][2] + 1e-9);
  const inv = M.clone().invert();
  let v = new THREE.Vector3(0.3, 0.9, 0.2);
  for (let i = 0; i < 60; i++) v = v.applyMatrix3(inv).normalize();
  return { n: v.toArray(), c };
}
function supportOf(B, grid, bodies) {
  let n, centroid;
  if (B.normalHint) { n = norm(B.normalHint); } else {
    const p = pcaNormal(B); n = p.n; centroid = p.c;
  }
  if (!centroid) {
    const a = B.aabb; centroid = [(a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2];
  }
  const skipOwn = (bi) => B.idSet.has(bodies[bi].id);
  if (!B.normalHint) {
    // orient outward: the mount normal points to the side with more free space from the bundle centre
    const free = (dir) => { const h = grid.cast(centroid, dir, 1.5, skipOwn); return h ? h.t : Infinity; };
    const fwd = free(n), back = free([-n[0], -n[1], -n[2]]);
    if (fwd < back || (fwd === back && n[1] < 0)) n = [-n[0], -n[1], -n[2]];
  }
  const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(ref, n)), v = norm(cross(n, u));
  // raster: cell -> min height along n
  const cells = new Map();
  for (const b of B.bodies) {
    const T = b.tris;
    for (let k = 0; k < T.length; k += 9) {
      const A = [T[k], T[k + 1], T[k + 2]], Bp = [T[k + 3], T[k + 4], T[k + 5]], Cp = [T[k + 6], T[k + 7], T[k + 8]];
      const L = Math.max(len(sub(Bp, A)), len(sub(Cp, A)), len(sub(Cp, Bp)));
      const N = Math.max(1, Math.ceil(L / (CELL_M * 0.7)));
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
        const a = i / N, bb = j / N, cc = 1 - a - bb;
        const p = [A[0] * cc + Bp[0] * a + Cp[0] * bb, A[1] * cc + Bp[1] * a + Cp[1] * bb, A[2] * cc + Bp[2] * a + Cp[2] * bb];
        const iu = Math.floor(dot(p, u) / CELL_M), iv = Math.floor(dot(p, v) / CELL_M), h = dot(p, n);
        const key = iu * 100003 + iv;
        const e = cells.get(key);
        if (!e) cells.set(key, [iu, iv, h, h]); else { if (h < e[2]) e[2] = h; if (h > e[3]) e[3] = h; }
      }
    }
  }
  const all = [...cells.values()];
  const stride = Math.max(1, Math.ceil(all.length / MAX_RAYS));
  let supported = 0, gap = 0, air = 0, total = 0, maxEmbed = 0, embedWith = null;
  const gaps = [];
  const hostVotes = new Map();
  const hostAny = new Map();
  const solids = bodies.filter((b) => SOLID_HOST.has(b.cls) && !B.idSet.has(b.id) && aabbHit(b.aabb, B.aabb, 0));
  let hidden = 0, hiddenTested = 0; const hiddenBy = new Map();
  for (let i = 0; i < all.length; i += stride * 3) {
    const [iu, iv, , ht] = all[i];
    const cu = (iu + 0.5) * CELL_M, cv = (iv + 0.5) * CELL_M, hh = ht - 0.002;
    const pt = [u[0] * cu + v[0] * cv + n[0] * hh, u[1] * cu + v[1] * cv + n[1] * hh, u[2] * cu + v[2] * cv + n[2] * hh];
    hiddenTested++;
    const host = solids.find((b) => insideTest(pt, b));
    if (host) { hidden++; hiddenBy.set(host.label, (hiddenBy.get(host.label) || 0) + 1); }
  }
  for (let i = 0; i < all.length; i += stride) {
    const [iu, iv, h] = all[i];
    const cu = (iu + 0.5) * CELL_M, cv = (iv + 0.5) * CELL_M;
    const o = [u[0] * cu + v[0] * cv + n[0] * (h + RAY_LIFT_M), u[1] * cu + v[1] * cv + n[1] * (h + RAY_LIFT_M), u[2] * cu + v[2] * cv + n[2] * (h + RAY_LIFT_M)];
    const hit = grid.cast(o, [-n[0], -n[1], -n[2]], RAY_LIFT_M + GAP_REACH_M, skipOwn);
    total++;
    if (!hit) { air++; continue; }
    const g = hit.t - RAY_LIFT_M;
    const hb = bodies[hit.body];
    hostAny.set(hb.id, (hostAny.get(hb.id) || 0) + 1);
    if (g <= SUPPORT_M) {
      supported++;
      if (-g > maxEmbed) { maxEmbed = -g; embedWith = `${hb.label} [${hb.cls}]`; }
      hostVotes.set(hb.id, (hostVotes.get(hb.id) || 0) + 1);
    } else { gap++; gaps.push(g); }
  }
  gaps.sort((a, b) => a - b);
  const vote = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([id, k]) => ({ label: bodies[id].label, cls: bodies[id].cls, rig: bodies[id].rig, role: bodies[id].role ?? null, share: r3(k / total), src: srcText(bodies[id]) }));
  const hosts = vote(hostVotes);
  // merge host shares by class
  const byClass = {};
  for (const h of hosts) byClass[h.cls] = r3((byClass[h.cls] || 0) + h.share);
  // v4: whatever lies beneath within the 30 cm reach (supported or not): what the bundle sits over
  const beneath = vote(hostAny);
  const beneathClassShares = {};
  for (const h of beneath) beneathClassShares[h.cls] = r3((beneathClassShares[h.cls] || 0) + h.share);
  return {
    beneath: beneath.slice(0, 8), beneathClassShares,
    normal: n.map(r4), footprintAreaM2: r4(all.length * CELL_M * CELL_M), rays: total,
    supportedShare: r3(supported / total), gapShare: r3(gap / total), overhangShare: r3(air / total),
    maxEmbedM: r3(maxEmbed), embedWith: maxEmbed > 0.005 ? embedWith : null, medianGapM: gaps.length ? r3(gaps[gaps.length >> 1]) : null,
    hiddenShare: hiddenTested ? r3(hidden / hiddenTested) : 0,
    hiddenIn: hidden ? [...hiddenBy.entries()].sort((a, b) => b[1] - a[1])[0][0] : null,
    host: hosts[0] || (hostAny.size ? { ...vote(hostAny)[0], share: 0, note: 'nearest surface beneath, not within 3 cm' } : null),
    hosts: hosts.slice(0, 5), hostClassShares: byClass,
  };
}

// ------------------------------------------------------------------ motion model
function motionModel(visual, spec, bodies) {
  const root = visual.root;
  const turretG = root.getObjectByName('rig_turret');
  const gunG = root.getObjectByName('rig_gun');
  const gunBodies = bodies.filter((b) => b.rig === 'recoil' || b.rig === 'gunmount');
  const hullGun = bodies.filter((b) => b.rig === 'hull' && b.cls === 'gun');
  const turretless = !!spec.armor?.turretless;
  const fixedInHull = turretless && gunBodies.filter((b) => b.cls === 'gun').length === 0 && hullGun.length > 0;
  const elev = spec.gunElevationDeg ?? 15, dep = spec.gunDepressionDeg ?? 8;
  const arc = spec.gunArcDeg ?? null;
  // gun pivot frame (root space): rig_gun origin + its world X axis
  let pivot = null, axisX = null;
  if (gunG) {
    const p = new THREE.Vector3(); gunG.getWorldPosition(p);
    const q = new THREE.Quaternion(); gunG.getWorldQuaternion(q);
    pivot = p; axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
  }
  let yawPivot = null;
  if (turretG) { yawPivot = new THREE.Vector3(); turretG.getWorldPosition(yawPivot); }
  const pitchMatrix = (pitchDeg) => {   // positive pitch = elevate = rotation.x negative
    if (!pivot) return new THREE.Matrix4();
    const T = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z);
    const R = new THREE.Matrix4().makeRotationAxis(axisX, -pitchDeg * Math.PI / 180);
    const Ti = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    return T.multiply(R).multiply(Ti);
  };
  const yawMatrix = (yawDeg) => {
    if (!yawPivot) return new THREE.Matrix4();
    const T = new THREE.Matrix4().makeTranslation(yawPivot.x, 0, yawPivot.z);
    const R = new THREE.Matrix4().makeRotationY(yawDeg * Math.PI / 180);
    const Ti = new THREE.Matrix4().makeTranslation(-yawPivot.x, 0, -yawPivot.z);
    return T.multiply(R).multiply(Ti);
  };
  const minPitchAt = (yawDeg) => pitchMod.minimumMechanicalGunPitch(spec, yawDeg * Math.PI / 180) * 180 / Math.PI;
  const pitchList = (lo, hi) => { const out = [lo]; for (let p = Math.ceil(lo + 1e-6); p < hi - 1e-6; p += PITCH_STEP_DEG) out.push(p); out.push(hi); return out; };
  return { turretless, fixedInHull, elev, dep, arc, gunBodies, hullGun, pitchList, pivot, yawPivot, pitchMatrix, yawMatrix, minPitchAt };
}

// heightmaps of the moving envelope in the TURRET frame (x,z grid): turret body static + gun per pitch sample
function sweepHeightmaps(MM, bodies, excludeIds) {
  const C = 0.03;
  const moving = bodies.filter((b) => (b.rig === 'turret' || b.rig === 'gunmount' || b.rig === 'recoil') && !excludeIds.has(b.id));
  if (!moving.length || !MM.yawPivot) return null;
  const all = unionAabb(moving);
  const reach = Math.max(Math.abs(all[0] - MM.yawPivot.x), Math.abs(all[3] - MM.yawPivot.x), Math.abs(all[2] - MM.yawPivot.z), Math.abs(all[5] - MM.yawPivot.z)) + 0.5;
  const N = Math.ceil((2 * reach) / C);
  const ox = MM.yawPivot.x - reach, oz = MM.yawPivot.z - reach;
  const mk = () => ({ lo: new Float32Array(N * N).fill(Infinity), hi: new Float32Array(N * N).fill(-Infinity), who: new Int32Array(N * N).fill(-1) });
  const splat = (map, T, bodyId) => {
    for (let k = 0; k < T.length; k += 9) {
      const A = [T[k], T[k + 1], T[k + 2]], B = [T[k + 3], T[k + 4], T[k + 5]], Cc = [T[k + 6], T[k + 7], T[k + 8]];
      const L = Math.max(len(sub(B, A)), len(sub(Cc, A)), len(sub(Cc, B)));
      const S = Math.max(1, Math.ceil(L / (C * 0.7)));
      for (let i = 0; i <= S; i++) for (let j = 0; j <= S - i; j++) {
        const a = i / S, b = j / S, c = 1 - a - b;
        const x = A[0] * c + B[0] * a + Cc[0] * b, y = A[1] * c + B[1] * a + Cc[1] * b, z = A[2] * c + B[2] * a + Cc[2] * b;
        const ix = Math.floor((x - ox) / C), iz = Math.floor((z - oz) / C);
        if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        const q = iz * N + ix;
        if (y < map.lo[q]) { map.lo[q] = y; map.who[q] = bodyId; }
        if (y > map.hi[q]) map.hi[q] = y;
      }
    }
  };
  const turretMap = mk();
  for (const b of moving) if (b.rig === 'turret') splat(turretMap, b.tris, b.id);
  const gunMaps = new Map();
  for (const p of MM.pitchList(-MM.dep, MM.elev)) {
    const m = mk();
    const M = MM.pitchMatrix(p);
    for (const b of moving) if (b.rig !== 'turret') splat(m, transformBody(b, M).tris, b.id);
    const cells = [];
    for (let q = 0; q < N * N; q++) if (Number.isFinite(m.lo[q])) cells.push(q);
    m.cells = cells;
    gunMaps.set(p, m);
  }
  // hull armour top (hull frame, same grid): the highest hull armour surface per column
  const hullTop = new Float32Array(N * N).fill(-Infinity);
  const hullArmor = bodies.filter((b) => b.rig === 'hull' && (b.cls === 'armor' || b.cls === 'hatch' || b.cls === 'gun'));
  const topMap = { lo: new Float32Array(N * N).fill(Infinity), hi: hullTop, who: new Int32Array(N * N).fill(-1) };
  for (const b of hullArmor) splat(topMap, b.tris, b.id);
  // gun poses whose barrel/mantlet already passes into hull armour (beyond the turret front) cannot occur without the gun
  // clipping the hull: the depression limit is at fault there, so those poses do not count against stowage
  const gunReachMin = MM.pivot && MM.yawPivot ? Math.hypot(MM.pivot.x - MM.yawPivot.x, MM.pivot.z - MM.yawPivot.z) + 0.6 : 1.2;
  const validCache = new Map();
  const poseValid = (yaw, pitch) => {
    const key = `${yaw}|${pitch}`;
    if (validCache.has(key)) return validCache.get(key);
    const m = gunMaps.get(pitch);
    const R = MM.yawMatrix(yaw).elements;  // turret frame -> hull frame
    let ok = true;
    for (const q of m.cells) {
      const ix = q % N, iz = (q - ix) / N;
      const x = ox + (ix + 0.5) * C, z = oz + (iz + 0.5) * C;
      if (Math.hypot(x - MM.yawPivot.x, z - MM.yawPivot.z) < gunReachMin) continue;
      const hx = R[0] * x + R[8] * z + R[12], hz = R[2] * x + R[10] * z + R[14];
      const jx = Math.floor((hx - ox) / C), jz = Math.floor((hz - oz) / C);
      if (jx < 0 || jz < 0 || jx >= N || jz >= N) continue;
      if (m.lo[q] < hullTop[jz * N + jx] - 0.02) { ok = false; break; }
    }
    validCache.set(key, ok);
    return ok;
  };
  return { C, N, ox, oz, turretMap, gunMaps, hullTop, poseValid };
}
function sweepIntrusion(B, MM, H, bodies, grid) {
  // hull bundle vs turret yaw 360 x allowed pitch: sample points rotated into the turret frame. A sample counts only
  // where the hull's own armour top under it is clear of the envelope (where the gun would already meet armour first,
  // the depression limit is the fault, not the stowage; that case is reported as armourLimited).
  const pts = []; for (const b of B.bodies) for (const p of samplesOf(b, 0.03)) pts.push(p);
  let best = { depthM: 0, yawDeg: null, pitchDeg: null, with: null };
  let limited = { depthM: 0, yawDeg: null, pitchDeg: null, with: null };
  const invalidPoses = new Set();
  const topCache = new Map();
  const skipNonArmor = (bi) => { const b = bodies[bi]; return b.rig !== 'hull' || !(b.cls === 'armor' || b.cls === 'hatch' || b.cls === 'gun'); };
  const armorTop = (x, z) => {
    const key = `${Math.round(x / 0.03)},${Math.round(z / 0.03)}`;
    if (topCache.has(key)) return topCache.get(key);
    const h = grid.cast([x, 6, z], [0, -1, 0], 7, skipNonArmor);
    const y = h ? 6 - h.t : -Infinity;
    topCache.set(key, y);
    return y;
  };
  for (let yaw = 0; yaw < 360; yaw += YAW_STEP_DEG) {
    const minPitch = MM.minPitchAt(yaw);
    const R = MM.yawMatrix(-yaw);  // hull point -> turret frame at this yaw
    const e = R.elements;
    for (const p of pts) {
      const x = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], y = p[1], z = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
      const ix = Math.floor((x - H.ox) / H.C), iz = Math.floor((z - H.oz) / H.C);
      if (ix < 0 || iz < 0 || ix >= H.N || iz >= H.N) continue;
      const q = iz * H.N + ix;
      let lo = H.turretMap.lo[q], hi = H.turretMap.hi[q], who = H.turretMap.who[q], at = null;
      for (const [pitch, m] of H.gunMaps) {
        if (pitch < minPitch - 1e-3 || pitch > MM.elev + 1e-6) continue;
        if (!Number.isFinite(m.lo[q])) continue;
        if (!H.poseValid(yaw, pitch)) { invalidPoses.add(`${yaw}|${pitch}`); continue; }
        if (m.lo[q] < lo) { lo = m.lo[q]; who = m.who[q]; at = pitch; }
        if (m.hi[q] > hi) hi = m.hi[q];
      }
      if (!Number.isFinite(lo) || y <= lo || y > hi + 0.02) continue;
      const d = y - lo;
      const top = armorTop(p[0], p[2]);
      const rec = { depthM: d, yawDeg: yaw, pitchDeg: at, with: who >= 0 ? `${bodies[who].label} [${bodies[who].cls}]` : null };
      if (top > lo + 0.005) { if (d > limited.depthM) limited = rec; continue; }
      if (d > best.depthM) best = rec;
    }
  }
  best.depthM = r3(best.depthM);
  if (limited.depthM > 0) best.armourLimited = { ...limited, depthM: r3(limited.depthM), note: 'envelope already meets hull armour here' };
  if (invalidPoses.size) best.skippedGunPoses = { count: invalidPoses.size, note: 'yaw|pitch poses where the gun would already pass into hull armour beyond the turret front (depression limit, not stowage)' };
  return best;
}
function pitchSweepPenetration(B, MM, yawList) {
  const gunList = MM.gunBodies.filter((b) => !B.idSet.has(b.id));
  if (!gunList.length) return { depthM: 0 };
  let best = { depthM: 0, pitchDeg: null, yawDeg: null, with: null };
  for (const yaw of yawList) {
    const Y = MM.yawMatrix(yaw);
    const minPitch = Math.max(-MM.dep, MM.minPitchAt(yaw));
    for (const p of MM.pitchList(minPitch, MM.elev)) {
      const M = Y.clone().multiply(MM.pitchMatrix(p));
      const moved = gunList.map((b) => transformBody(b, M));
      const pen = penetration(B.bodies, moved, B.aabb, unionAabb(moved));
      if (pen.depth > best.depthM) best = { depthM: pen.depth, pitchDeg: p, yawDeg: yaw, with: `${pen.b?.label ?? pen.a?.label} [${pen.b?.cls ?? pen.a?.cls}]` };
    }
  }
  best.depthM = r3(best.depthM);
  return best;
}

// ------------------------------------------------------------------ per-tank census
const TARGET_CLASSES = ['gun', 'mantlet', 'hatch', 'sight', 'auxWeapon', 'decor', 'fitting', 'trackBundle'];
// VERIFY: exposure = share of bundle sample points from which at least one of 48 directions escapes the tank (4 m),
// skipping the bundle itself; openness = mean share of escaping directions. Enclosed (inside a hollow turret/hull shell
// made of several separate plates) bundles read 0 even when no single closed solid contains them.
const FIB = (() => { const out = []; const N = 48; const g = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < N; i++) { const y = 1 - (i + 0.5) * 2 / N; const r = Math.sqrt(1 - y * y); out.push([Math.cos(g * i) * r, y, Math.sin(g * i) * r]); } return out; })();
function exposureOf(B, grid, bodies) {
  const skipOwn = (bi) => B.idSet.has(bodies[bi].id) || bodies[bi].cls === 'runningGear';
  const pts = []; for (const b of B.bodies) for (const p of samplesOf(b, 0.03)) pts.push(p);
  const stride = Math.max(1, Math.ceil(pts.length / 90));
  let n = 0, vis = 0, open = 0, visUp = 0;
  for (let i = 0; i < pts.length; i += stride) {
    const p = pts[i]; n++;
    let esc = 0, escUp = 0;
    for (const d of FIB) { const h = grid.cast(p, d, 4.0, skipOwn); if (!h) { esc++; if (d[1] > 0.15) escUp++; } }
    if (esc) vis++; if (escUp) visUp++;
    open += esc / FIB.length;
  }
  return { exposure: r3(vis / n), exposureAbove: r3(visUp / n), openness: r3(open / n), samples: n };
}
function analyse(id) {
  const spec = specs.getSpec(id);
  const { visual, buildMs } = buildTank(id);
  const t1 = Date.now();
  const inputHash = spareTrackGeometryDigest(visual.root);
  const planAudit = visual.root.userData.spareTrackPlanAudit ?? null;
  // --update re-measures only ids whose geometry changed since their ledger row; --check trusts a current row (its
  // geometry is byte-identical) and fails a stale one; --gate always measures afresh
  if ((UPDATE || CHECK) && !GATE && !CROPS && ledger.rows[id]?.inputHash === inputHash && !flag('force')) {
    visual.dispose();
    return { unchanged: true, id, inputHash, planAudit };
  }
  const buildReceipt = Array.isArray(visual.root.userData.spareTrack) ? { runs: visual.root.userData.spareTrack.length,
    rejected: (visual.root.userData.spareTrackRejected || []).length } : null;
  try {
    const { bodies, decorPieces, coverage, diag } = collect(visual, spec);
    const bundles = findBundles(visual, spec, bodies, decorPieces);
    const inScene = (g) => { let vis = true; for (let p = g; p; p = p.parent) { if (p.visible === false) vis = false; if (p === visual.root) return vis ? 'visible' : 'hidden'; } return 'detached'; };
    diag.fittingCalls = [...fittingSites.entries()].map(([g, s]) => ({ site: s.site, links: s.links, state: inScene(g), found: bundles.some((B) => B.source === 'fitting' && B.bodies.some((b) => { for (let p = b.meshRef; p; p = p.parent) if (p === g) return true; return false; })) }));
    diag.stripCalls = stripCalls.map((c) => ({ site: c.site, links: c.links }));
    const hostBodies = bodies;
    const grid = new TriGrid(hostBodies.map((b) => b));
    const MM = motionModel(visual, spec, bodies);
    const ownIds = new Set(); bundles.forEach((B) => B.bodies.forEach((b) => ownIds.add(b.id)));
    let H = null;
    if (process.env.V_FAST !== '1' && !MM.turretless && bundles.some((B) => B.rig === 'hull')) H = sweepHeightmaps(MM, bodies, new Set());
    const out = [];
    for (const B of bundles) {
      const support = supportOf(B, grid, bodies);
      const vis = exposureOf(B, grid, bodies);
      // VERIFY: the same raster from the opposite face (PCA-oriented bundles can flip under an overhang)
      let alt = null;
      if (B.source === 'adhoc' || B.source === 'strip' || process.env.V_ALT_ALL === '1') {
        const nn = support.normal; const a = supportOf({ ...B, normalHint: [-nn[0], -nn[1], -nn[2]] }, grid, bodies);
        alt = { normal: a.normal, sup: a.supportedShare, gap: a.gapShare, air: a.overhangShare, hidden: a.hiddenShare, hiddenIn: a.hiddenIn, host: a.host?.label,
          hosts: a.hosts, beneath: a.beneath, hostClassShares: a.hostClassShares, beneathClassShares: a.beneathClassShares, medianGapM: a.medianGapM };
      }
      // VERIFY: turret-mounted bundles swept by turret traverse against everything on the hull (column-top model)
      let traverse = null;
      if (B.rig === 'turret' && MM.yawPivot) {
        const C = 0.03, hullTop = new Map(), hullWho = new Map();
        const hullBodies = bodies.filter((b) => b.rig === 'hull' && b.cls !== 'runningGear' && !B.idSet.has(b.id));
        for (const hb of hullBodies) {
          const T = hb.tris;
          for (let k = 0; k < T.length; k += 9) {
            const A = [T[k], T[k + 1], T[k + 2]], Bq = [T[k + 3], T[k + 4], T[k + 5]], Cq = [T[k + 6], T[k + 7], T[k + 8]];
            const L = Math.max(len(sub(Bq, A)), len(sub(Cq, A)), len(sub(Cq, Bq)));
            const S = Math.max(1, Math.ceil(L / (C * 0.7)));
            for (let i = 0; i <= S; i++) for (let j = 0; j <= S - i; j++) {
              const a = i / S, bb = j / S, cc = 1 - a - bb;
              const x = A[0] * cc + Bq[0] * a + Cq[0] * bb, y = A[1] * cc + Bq[1] * a + Cq[1] * bb, z = A[2] * cc + Bq[2] * a + Cq[2] * bb;
              const key = `${Math.floor(x / C)},${Math.floor(z / C)}`;
              if (!(hullTop.get(key) >= y)) { hullTop.set(key, y); hullWho.set(key, hb.id); }
            }
          }
        }
        const pts = []; for (const b of B.bodies) for (const p of samplesOf(b, 0.03)) pts.push(p);
        let rest = 0;
        for (const p of pts) { const key = `${Math.floor(p[0] / C)},${Math.floor(p[2] / C)}`; const h = hullTop.get(key); if (h !== undefined && h - p[1] > rest) rest = h - p[1]; }
        let best = { depthM: 0, yawDeg: null, with: null };
        for (let yaw = 2; yaw < 360; yaw += 2) {
          const e = MM.yawMatrix(yaw).elements;
          for (const p of pts) {
            const x = e[0] * p[0] + e[8] * p[2] + e[12], z = e[2] * p[0] + e[10] * p[2] + e[14];
            const key = `${Math.floor(x / C)},${Math.floor(z / C)}`;
            const h = hullTop.get(key);
            if (h === undefined) continue;
            const d = h - p[1] - rest;   // beyond whatever already overlaps at rest
            if (d > best.depthM) best = { depthM: d, yawDeg: yaw, with: hullWho.get(key), at: [x, p[1], z] };
          }
        }
        // is the turret itself (without any track bundle) already into that hull part at that yaw? then the bundle is not the fault
        let turretSelf = 0;
        if (best.yawDeg != null) {
          const e = MM.yawMatrix(best.yawDeg).elements;
          const own = new Set(); bundles.forEach((BB) => BB.bodies.forEach((b) => own.add(b.id)));
          for (const tb of bodies) {
            if (tb.rig !== 'turret' || own.has(tb.id)) continue;
            for (const p of samplesOf(tb, 0.03)) {
              const x = e[0] * p[0] + e[8] * p[2] + e[12], z = e[2] * p[0] + e[10] * p[2] + e[14];
              const key = `${Math.floor(x / C)},${Math.floor(z / C)}`;
              if (Math.hypot(x - best.at[0], z - best.at[2]) > 0.15) continue;   // only the turret's own surface near the collision spot
              const h = hullTop.get(key); if (h === undefined) continue;
              const d = h - p[1];
              if (d > turretSelf) turretSelf = d;
            }
          }
        }
        traverse = { restOverlapM: r3(rest), depthM: r3(best.depthM), yawDeg: best.yawDeg, with: best.with != null ? `${bodies[best.with].label} [${bodies[best.with].cls}]` : null, withAabb: best.with != null ? bodies[best.with].aabb.map(r3) : null, at: best.at ? best.at.map(r3) : null, turretSelfWithin15cmM: r3(turretSelf) };
      }
      const buried = buriedShare(B, bodies);
      support.sunkShare = buried.share; support.sunkIn = buried.inside;
      support.sunkDeep1cmShare = buried.deep1cmShare; support.sunkMaxDepthM = buried.maxDepthM; support.sunkMaxDepthWith = buried.maxDepthWith;
      const near = nearOf(B, bodies);
      const inter = {};
      for (const cls of TARGET_CLASSES) {
        const targets = bodies.filter((b) => b.cls === cls && !B.idSet.has(b.id) && aabbHit(b.aabb, B.aabb, 0.01));
        if (!targets.length) continue;
        const pen = penetration(B.bodies, targets, B.aabb, unionAabb(targets));
        if (pen.depth >= 0.0005) inter[cls] = { depthM: r3(pen.depth), with: (pen.b && !B.idSet.has(pen.b.id) ? pen.b : pen.a)?.label ?? null };
      }
      // motion sweep
      let sweep;
      if (B.rig === 'recoil' || B.rig === 'gunmount') sweep = { mode: 'rides-gun', depthM: null, note: 'bundle is parented to the gun rig and pitches with it' };
      else if (MM.fixedInHull) sweep = { mode: 'fixed-in-hull', depthM: inter.gun?.depthM ?? 0, note: `gun fixed in the hull (hydropneumatic hull-pitch aim ${-MM.dep}..+${MM.elev} deg moves the whole vehicle); envelope = static gun body` };
      else if (MM.turretless) {
        const a = Math.abs(MM.arc ?? 0);
        const yaws = []; for (let y = -a; y <= a + 1e-6; y += YAW_STEP_DEG) yaws.push(y);
        sweep = { mode: `casemate-arc +-${a} deg x pitch ${-MM.dep}..+${MM.elev}`, ...pitchSweepPenetration(B, MM, yaws.length ? yaws : [0]) };
      } else if (B.rig === 'turret') sweep = { mode: `gun-pitch ${-MM.dep}..+${MM.elev}`, ...pitchSweepPenetration(B, MM, [0]) };
      else sweep = H ? { mode: `turret-yaw-360 x pitch (min pitch by yaw)..+${MM.elev}`, ...sweepIntrusion(B, MM, H, bodies, grid) } : { mode: 'none', depthM: 0 };
      const hostCls = support.hostClassShares || {};
      const onGunShare = (hostCls.gun || 0), onMantletShare = (hostCls.mantlet || 0);
      const onMovingPart = (B.rig === 'recoil' || onGunShare >= 0.05 || (MM.fixedInHull && onGunShare > 0)) ? 'gun'
        : (B.rig === 'gunmount' || onMantletShare >= 0.05) ? 'mantlet' : null;
      const flags = [];
      if (onMovingPart === 'gun') flags.push('on-gun');
      if (onMovingPart === 'mantlet') flags.push('on-mantlet');
      if ((sweep.depthM ?? 0) > SWEEP_FLAG_M && sweep.mode !== 'fixed-in-hull') flags.push('in-gun-sweep');
      if (support.overhangShare > 0.2) flags.push('overhang');
      if (support.supportedShare < 0.5) flags.push('floating');
      if (support.hiddenShare > 0.5) flags.push('buried');
      else if (support.hiddenShare > 0.2) flags.push('partly-buried');
      for (const [cls, v] of Object.entries(inter)) if (v.depthM > (PEN_FLAG[cls] ?? 0.01)) flags.push(`cuts-${cls}`);
      out.push({
        bundle: B.name, source: B.source, author: B.author, evidence: B.source === 'adhoc' ? (B.bodies[0].evidence || null) : undefined, frame: B.rig === 'recoil' || B.rig === 'gunmount' ? 'gun' : B.rig,
        links: B.links, center: [(B.aabb[0] + B.aabb[3]) / 2, (B.aabb[1] + B.aabb[4]) / 2, (B.aabb[2] + B.aabb[5]) / 2].map(r3),
        size: [B.aabb[3] - B.aabb[0], B.aabb[4] - B.aabb[1], B.aabb[5] - B.aabb[2]].map(r3),
        decorReceipt: B.receipt ? { slot: B.receipt.slot, supportPoint: B.receipt.supportPoint.map(r3), supportNormal: B.receipt.supportNormal.map(r4), supportGapM: r4(B.receipt.supportGapM) } : undefined,
        host: support.host, support: { ...support, host: undefined },
        intersections: inter, near, sweep, onMovingPart, flags, verdict: flags.length ? 'FLAG' : 'ok', alt, traverse, vis, registered: !!B.registered,
        index: B.index, gunPivot: MM.pivot ? MM.pivot.toArray().map(r3) : null,
      });
    }
    const summary = visual.root.userData.__decorSummary;
    const decorTrackSkips = (summary?.skipped || []).filter((s) => s[0] === 'tracks');
    return {
      id, name: spec.name, era: spec.era, turretless: MM.turretless, gunMode: MM.fixedInHull ? 'fixed-in-hull' : MM.turretless ? 'casemate' : 'turret',
      gunLimitsDeg: { elevation: MM.elev, depression: MM.dep, arc: MM.arc, pitchByYaw: !!spec.gunPitchByYawDeg },
      buildMs, analyseMs: Date.now() - t1, coverage: { ...coverage, bodies: bodies.length }, inputHash, buildReceipt, planAudit,
      seatError: visual.root.userData.spareTrackError ?? null,
      seat: { runs: visual.root.userData.spareTrack ?? null, rejected: visual.root.userData.spareTrackRejected ?? null,
        ms: Math.round(visual.root.userData.spareTrackMs ?? 0) },
      decorTracks: { rowsBuilt: decorTrackAttempts.length, seated: bundles.filter((B) => B.source === 'decor').length, rejections: decorTrackSkips.map((x) => x[1]) },
      trackMaterialNonLinks: bundles.trackMaterialNonLinks || [],
      diag, bundles: out, _bodies: bodies, _bundles: bundles, _visual: visual, _MM: MM,
    };
  } catch (e) {
    visual.dispose();
    throw e;
  }
}

// ------------------------------------------------------------------ CPU pictures
const CLS_RGB = {
  armor: [150, 150, 140], gun: [214, 70, 52], mantlet: [232, 140, 60], hatch: [70, 170, 200], sight: [60, 210, 230],
  auxWeapon: [230, 90, 170], decor: [190, 170, 120], fitting: [160, 150, 110], runningGear: [70, 70, 66], trackBundle: [120, 100, 200],
};
async function renderPicture(res, file, focus) {
  const { createCanvas } = await import(pathToFileURL(path.join(WT, 'node_modules/@napi-rs/canvas/index.js')).href);
  const bodies = res._bodies;
  const focusIds = new Set(focus.bodies.map((b) => b.id));
  const W = 560, Hh = 420;
  const views = [
    { name: 'top (looking down, front up)', eye: [0, 1, 0.0001], up: [0, 0, 1], zoom: false },
    { name: 'left side', eye: [1, 0, 0], up: [0, 1, 0], zoom: false },
    { name: 'close-up, outward along the mount normal', eye: null, up: [0, 1, 0], zoom: true },
    { name: 'close-up, front-low', eye: [0.55, -0.3, 1.0], up: [0, 1, 0], zoom: true },
  ];
  const canvas = createCanvas(W * 2, Hh * 2 + 40);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#16181a'; ctx.fillRect(0, 0, W * 2, Hh * 2 + 40);
  const all = unionAabb(bodies);
  const fa = focus.aabb;
  const light = norm([0.4, 0.8, 0.45]);
  const nrmRow = res.bundles.find((x) => x.bundle === focus.name)?.support?.normal || [0, 1, 0];
  views.forEach((view, vi) => {
    const eye = view.eye || norm([nrmRow[0] * 1.6 + 0.35, nrmRow[1] * 1.6 + 0.45, nrmRow[2] * 1.6 + 0.5]);
    const f = norm(eye);                     // camera looks along -f
    const upRef = Math.abs(dot(f, view.up)) > 0.95 ? [0, 0, 1] : view.up;
    const r = norm(cross(upRef, f)), up = cross(f, r);
    const box = view.zoom ? [fa[0] - 0.9, fa[1] - 0.6, fa[2] - 0.9, fa[3] + 0.9, fa[4] + 0.6, fa[5] + 0.9] : all;
    const corners = [];
    for (const x of [box[0], box[3]]) for (const y of [box[1], box[4]]) for (const z of [box[2], box[5]]) corners.push([dot([x, y, z], r), dot([x, y, z], up)]);
    const minx = Math.min(...corners.map((c) => c[0])), maxx = Math.max(...corners.map((c) => c[0]));
    const miny = Math.min(...corners.map((c) => c[1])), maxy = Math.max(...corners.map((c) => c[1]));
    const s = Math.min((W - 20) / (maxx - minx), (Hh - 30) / (maxy - miny));
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const img = ctx.createImageData(W, Hh);
    const zb = new Float32Array(W * Hh).fill(-Infinity);
    for (let i = 0; i < W * Hh; i++) { img.data[i * 4] = 22; img.data[i * 4 + 1] = 24; img.data[i * 4 + 2] = 26; img.data[i * 4 + 3] = 255; }
    for (const b of bodies) {
      let rgb = CLS_RGB[b.cls] || CLS_RGB.armor;
      if (focusIds.has(b.id)) rgb = [40, 120, 255];
      const T = b.tris;
      for (let k = 0; k < T.length; k += 9) {
        const P = [0, 1, 2].map((j) => [T[k + j * 3], T[k + j * 3 + 1], T[k + j * 3 + 2]]);
        if (view.zoom && !P.some((p) => inAabb(p, box))) continue;
        const nrm = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
        const shade = 0.35 + 0.65 * Math.abs(dot(nrm, light));
        const S = P.map((p) => [W / 2 + (dot(p, r) - cx) * s, Hh / 2 - (dot(p, up) - cy) * s, dot(p, f)]);
        const x0 = Math.max(0, Math.floor(Math.min(S[0][0], S[1][0], S[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(S[0][0], S[1][0], S[2][0])));
        const y0 = Math.max(0, Math.floor(Math.min(S[0][1], S[1][1], S[2][1]))), y1 = Math.min(Hh - 1, Math.ceil(Math.max(S[0][1], S[1][1], S[2][1])));
        const area = (S[1][0] - S[0][0]) * (S[2][1] - S[0][1]) - (S[2][0] - S[0][0]) * (S[1][1] - S[0][1]);
        if (Math.abs(area) < 1e-9) continue;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((S[1][0] - px) * (S[2][1] - py) - (S[2][0] - px) * (S[1][1] - py)) / area;
          const w1 = ((S[2][0] - px) * (S[0][1] - py) - (S[0][0] - px) * (S[2][1] - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * S[0][2] + w1 * S[1][2] + w2 * S[2][2];
          const q = y * W + x;
          if (z <= zb[q]) continue;
          zb[q] = z;
          img.data[q * 4] = Math.min(255, rgb[0] * shade); img.data[q * 4 + 1] = Math.min(255, rgb[1] * shade); img.data[q * 4 + 2] = Math.min(255, rgb[2] * shade);
        }
      }
    }
    const ox = (vi % 2) * W, oy = Math.floor(vi / 2) * Hh;
    ctx.putImageData(img, ox, oy);
    ctx.fillStyle = '#e8e8e0'; ctx.font = '13px sans-serif'; ctx.fillText(view.name, ox + 8, oy + 16);
  });
  ctx.fillStyle = '#e8e8e0'; ctx.font = '13px sans-serif';
  const row = res.bundles.find((x) => x.bundle === focus.name);
  ctx.fillText(`${res.id} ${focus.name} | host ${row?.host?.label ?? '-'} [${row?.host?.cls ?? '-'}] | support ${row?.support.supportedShare} gap ${row?.support.gapShare} overhang ${row?.support.overhangShare} | ${row?.flags.join(',') || 'ok'}`.slice(0, 175), 8, Hh * 2 + 16);
  ctx.fillText('blue = audited bundle, red = gun, orange = mantlet, cyan = hatches/sights, purple = other track bundles, tan = decor', 8, Hh * 2 + 33);
  fs.writeFileSync(file, await canvas.encode('jpeg', 88));
}

// ------------------------------------------------------------------ v4 crops: top + 3/4 close views, bundle highlighted (CPU raster, PNG)
const CROP_RGB = {
  armor: [150, 154, 140], gun: [222, 64, 48], mantlet: [236, 140, 56], hatch: [64, 176, 206], sight: [56, 214, 232],
  auxWeapon: [226, 92, 170], decor: [186, 166, 118], fitting: [168, 158, 116], runningGear: [64, 64, 60], trackBundle: [138, 112, 208],
};
const FOCUS_RGB = [36, 116, 255];
function rasterPanel(bodies, focusIds, view, PW, PH, box) {
  const f = norm(view.eye);
  const upRef = Math.abs(dot(f, view.up)) > 0.95 ? [0, 0, 1] : view.up;
  const r = norm(cross(upRef, f)), up = cross(f, r);
  const corners = [];
  for (const x of [box[0], box[3]]) for (const y of [box[1], box[4]]) for (const z of [box[2], box[5]]) corners.push([dot([x, y, z], r), dot([x, y, z], up)]);
  const minx = Math.min(...corners.map((c) => c[0])), maxx = Math.max(...corners.map((c) => c[0]));
  const miny = Math.min(...corners.map((c) => c[1])), maxy = Math.max(...corners.map((c) => c[1]));
  const s = Math.min((PW - 16) / (maxx - minx), (PH - 16) / (maxy - miny));
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const N = PW * PH;
  const zb = new Float32Array(N).fill(-Infinity), idb = new Int32Array(N).fill(-1);
  const col = new Float32Array(N * 3);
  const zf = new Float32Array(N).fill(-Infinity);   // focus-only depth (x-ray)
  const light = norm([0.35, 0.85, 0.4]), fill = norm([-0.5, 0.3, -0.6]);
  const proj = (p) => [PW / 2 + (dot(p, r) - cx) * s, PH / 2 - (dot(p, up) - cy) * s, dot(p, f)];
  for (const b of bodies) {
    const isF = focusIds.has(b.id);
    const rgb = isF ? FOCUS_RGB : (CROP_RGB[b.cls] || CROP_RGB.armor);
    const T = b.tris;
    for (let k = 0; k < T.length; k += 9) {
      const P0 = [T[k], T[k + 1], T[k + 2]], P1 = [T[k + 3], T[k + 4], T[k + 5]], P2 = [T[k + 6], T[k + 7], T[k + 8]];
      const S0 = proj(P0), S1 = proj(P1), S2 = proj(P2);
      const x0 = Math.max(0, Math.floor(Math.min(S0[0], S1[0], S2[0]))), x1 = Math.min(PW - 1, Math.ceil(Math.max(S0[0], S1[0], S2[0])));
      const y0 = Math.max(0, Math.floor(Math.min(S0[1], S1[1], S2[1]))), y1 = Math.min(PH - 1, Math.ceil(Math.max(S0[1], S1[1], S2[1])));
      if (x0 > x1 || y0 > y1) continue;
      const area = (S1[0] - S0[0]) * (S2[1] - S0[1]) - (S2[0] - S0[0]) * (S1[1] - S0[1]);
      if (Math.abs(area) < 1e-9) continue;
      let nrm = norm(cross(sub(P1, P0), sub(P2, P0)));
      if (dot(nrm, f) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
      const shade = 0.30 + 0.62 * Math.max(0, dot(nrm, light)) + 0.18 * Math.max(0, dot(nrm, fill));
      const cr = rgb[0] * shade, cg = rgb[1] * shade, cb = rgb[2] * shade;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((S1[0] - px) * (S2[1] - py) - (S2[0] - px) * (S1[1] - py)) / area;
        const w1 = ((S2[0] - px) * (S0[1] - py) - (S0[0] - px) * (S2[1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * S0[2] + w1 * S1[2] + w2 * S2[2];
        const q = y * PW + x;
        if (isF && z > zf[q]) zf[q] = z;
        if (z <= zb[q]) continue;
        zb[q] = z; idb[q] = b.id;
        col[q * 3] = cr; col[q * 3 + 1] = cg; col[q * 3 + 2] = cb;
      }
    }
  }
  // compose: background, depth/id edges, x-ray hatch for the hidden part of the focus bundle, focus outline
  const img = new Uint8ClampedArray(N * 4);
  const zTol = 0.04;   // metres of depth step that draws an edge
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const q = y * PW + x;
    let R, G, Bc;
    if (idb[q] < 0) { const t = y / PH; R = 30 + 10 * t; G = 33 + 10 * t; Bc = 37 + 12 * t; } else { R = col[q * 3]; G = col[q * 3 + 1]; Bc = col[q * 3 + 2]; }
    if (idb[q] >= 0) {
      let edge = false;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) continue;
        const o = yy * PW + xx;
        if (idb[o] < 0 || Math.abs(zb[o] - zb[q]) > zTol) { edge = true; break; }
      }
      if (edge) { R *= 0.45; G *= 0.45; Bc *= 0.45; }
    }
    const inFocusVisible = idb[q] >= 0 && focusIds.has(idb[q]);
    if (!inFocusVisible && Number.isFinite(zf[q])) {   // focus hidden behind/inside something: hatched x-ray
      const stripe = ((x + y) >> 2) & 1;
      const a = stripe ? 0.62 : 0.30;
      R = R * (1 - a) + 70 * a; G = G * (1 - a) + 150 * a; Bc = Bc * (1 - a) + 255 * a;
    }
    // focus silhouette outline (visible or x-ray), yellow
    if (Number.isFinite(zf[q])) {
      let border = false;
      for (const [dx, dy] of [[2, 0], [0, 2], [-2, 0], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= PW || yy >= PH || !Number.isFinite(zf[yy * PW + xx])) { border = true; break; }
      }
      if (border) { R = 255; G = 214; Bc = 40; }
    }
    img[q * 4] = R; img[q * 4 + 1] = G; img[q * 4 + 2] = Bc; img[q * 4 + 3] = 255;
  }
  return { img, project: (p) => { const S = proj(p); return [S[0], S[1]]; } };
}
async function renderCrop(res, focus, file, caption) {
  const { createCanvas, ImageData: NImageData } = await import(pathToFileURL(path.join(WT, 'node_modules/@napi-rs/canvas/index.js')).href);
  const bodies = res._bodies;
  const focusIds = new Set(focus.bodies.map((b) => b.id));
  const row = res.bundles.find((x) => x.bundle === focus.name);
  const n = focus.eyeNormal || row?.support?.normal || [0, 1, 0];
  const fa = focus.viewAabb || focus.aabb;
  // the camera, so an after picture can be taken from the same place (job.cameraFrom)
  fs.writeFileSync(`${file}.camera.json`, JSON.stringify({ view: fa, normal: n }));
  const fc = [(fa[0] + fa[3]) / 2, (fa[1] + fa[4]) / 2, (fa[2] + fa[5]) / 2];
  const ext = Math.max(fa[3] - fa[0], fa[4] - fa[1], fa[5] - fa[2]);
  const pad = Math.max(0.6, 0.85 * ext);
  const close = [fa[0] - pad, fa[1] - pad * 0.7, fa[2] - pad, fa[3] + pad, fa[4] + pad * 0.7, fa[5] + pad];
  const all = unionAabb(bodies);
  const tc = [(all[0] + all[3]) / 2, 0, (all[2] + all[5]) / 2];
  // 3/4 eye: outward horizontal direction (mount normal, else tank centre -> bundle), turned 35 deg, raised 38 deg
  let h = [n[0], 0, n[2]];
  if (Math.hypot(h[0], h[2]) < 0.35) h = [fc[0] - tc[0], 0, fc[2] - tc[2]];
  if (Math.hypot(h[0], h[2]) < 0.05) h = [0.6, 0, 0.8];
  h = norm(h);
  const turn = (h[0] >= 0 ? 1 : -1) * 35 * Math.PI / 180;
  const hx = h[0] * Math.cos(turn) - h[2] * Math.sin(turn), hz = h[0] * Math.sin(turn) + h[2] * Math.cos(turn);
  const el = (n[1] > 0.8 ? 46 : 36) * Math.PI / 180;
  const eye34 = [hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)];
  const SS = 2, PH = 440;
  const panels = [
    { name: 'locator: whole tank from above (front up)', eye: [0, 1, 0.0001], up: [0, 0, 1], box: all, w: 280 },
    { name: 'top, close (front up)', eye: [0, 1, 0.0001], up: [0, 0, 1], box: close, w: 540 },
    { name: '3/4 view, close', eye: eye34, up: [0, 1, 0], box: close, w: 540 },
  ];
  const W = panels.reduce((a, p) => a + p.w, 0) + 2 * (panels.length - 1);
  const CAP = 76;
  const canvas = createCanvas(W, PH + CAP);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#121416'; ctx.fillRect(0, 0, W, PH + CAP);
  let ox = 0;
  for (const p of panels) {
    const pw = p.w * SS, ph = PH * SS;
    const { img, project } = rasterPanel(bodies, focusIds, p, pw, ph, p.box);
    const off = createCanvas(pw, ph);
    off.getContext('2d').putImageData(new NImageData(img, pw, ph), 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, pw, ph, ox, 0, p.w, PH);
    if (p.box === all) {   // locator: box the close-up region
      const cs = []; for (const x of [close[0], close[3]]) for (const z of [close[2], close[5]]) cs.push(project([x, fc[1], z]));
      const xs = cs.map((c) => c[0] / SS), ys = cs.map((c) => c[1] / SS);
      ctx.strokeStyle = '#ffd628'; ctx.lineWidth = 2;
      ctx.strokeRect(ox + Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ox, 0, p.w, 22);
    ctx.fillStyle = '#ecebe4'; ctx.font = '13px sans-serif'; ctx.fillText(p.name, ox + 8, 15);
    ox += p.w + 2;
  }
  ctx.fillStyle = '#ecebe4'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText(caption[0] || '', 10, PH + 20);
  ctx.font = '13px sans-serif';
  ctx.fillText((caption[1] || '').slice(0, 200), 10, PH + 40);
  ctx.fillStyle = '#a9a89f';
  ctx.fillText('blue + yellow outline = audited bundle (hatched = hidden inside/behind geometry); red = gun, orange = mantlet, cyan = hatch/sight, purple = other track, tan = decor', 10, PH + 62);
  fs.writeFileSync(file, await canvas.encode('png'));
}

// ------------------------------------------------------------------ classification (census v4 classes + the verifier's corrections)
const PRIORITY = ['ON_GUN', 'IN_SWEEP', 'HANGING', 'FLOATING', 'WEIRD', 'INTERSECTING'];
const GATED = new Set([...PRIORITY, 'BURIED', 'UNCOVERED', 'STALE']);
// the shared seat roles that make a host WEIRD (spareTrackSeat.ts SeatRole -> tag)
const ROLE_TAGS = { grille: 'grille', launcher: 'launcher', light: 'light', soft: 'softload', era: 'era', hatch: 'hatch',
  sight: 'sight', weapon: 'weapon', antenna: 'antenna' };
// the audit's source-text tags (fallback; a manual review dropped the false ones, keyed by file and call text)
const WEIRD_TAGS = [
  ['hatch', /hatch|cupola/i],
  ['sight', /periscope|episcope|\bsights?\b|sightHead|optic|vision ?block|camera|emes|thermal|laser|rangefinder/i],
  ['grille', /grille|\bgrill\b|louv(re|er)|vent(s|ilat)|\bintake|radiator|air ?inlet|cooling|mesh screen|engine ?deck ?screen/i],
  ['exhaust', /exhaust|muffler|silencer/i],
  ['light', /headlight|head ?lamp|\blamp|lightCluster|convoy ?light|tail ?light|\blights?\b/i],
  ['smoke', /smoke|grenade|discharger/i],
  ['launcher', /missile|\batgm\b|kornet|\btow ?launcher|launch(er| box)|ataka/i],
  ['antenna', /antenna|aerial|\bmast\b/i],
  ['launcher', /weaponAssembly-scope/],
  ['softload', /tarp|bedroll|\broll\b|tarpRoll|canvas|\bbags?\b|sack|camo ?net/i],
  ['era', /\bERA\b|kontakt|reactive|relikt|explosive reactive|\bbricks?\b/i],
];
const NOT_LIGHT = /light (tank|grey|gray|olive|weight|tone)|lightweight|highlight|lighting|key ?light|light's/i;
const FALSE_TAGS = [
  ['profiles/pumaS1.ts', "P.addEquipment('turret', box(0.20, 0.44, 0.72),", 'grille'],
  ['profiles/leopard.ts', "P.add('hull', box(0.047, 0.06, 0.80), s * 1.6615, 1.76, -2.90)", 'grille'],
  ['profiles/merkava.ts', 'P.add(gm2, box(gw, 0.007, gd),', 'softload'],
  ['profiles/merkava.ts', 'P.add(gm2, box(gw, 0.007, gd),', 'light'],
];
const LABEL_RE = /^(\w+)<(?:(.+?)<-)?(.+?)@(.+?):(\d+)>$/;
// Turret-traverse readings the audit verified as artefacts of the column-top model (a hull part above the run's level,
// read as solid down to the deck): the traverse there is not judged.
const TRAVERSE_ARTEFACTS = new Map([['cv90_mkiv', 'a thin hull rail at y 2.13 above the run (verified 2026-10-15)']]);
const SRC_V = new Map();
function srcLinesV(f) {
  if (!SRC_V.has(f)) {
    let lines = [];
    for (const cand of [path.join(WT, 'src', 'vehicles', f), path.join(WT, 'src', f)]) {
      if (fs.existsSync(cand)) { lines = fs.readFileSync(cand, 'utf8').split('\n'); break; }
    }
    SRC_V.set(f, lines);
  }
  return SRC_V.get(f);
}
function hostText(label) {
  const m = LABEL_RE.exec(label || '');
  if (!m) return { strong: label || '', text: label || '', file: null, code: '' };
  const [, bucket, via = '', fn, f, lineS] = m;
  const line = Number(lineS);
  const L = srcLinesV(f);
  const code = line > 0 && line <= L.length ? L[line - 1].trim() : '';
  const block = [];
  let i = line - 2, skipped = 0;
  while (i >= 0 && skipped <= 4) {
    const t = L[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) { if (block.length >= 3) break; block.push(t); i--; continue; }
    if (block.length) break;
    if (/\b(add\w*|place|mount|emit)\s*\(/.test(t) || t.includes('//')) break;
    skipped++; i--;
  }
  let inWeapon = '';
  for (let k = line - 2; k > Math.max(-1, line - 16); k--) {
    const t = L[k] ?? '';
    if (/^\s*\}\);/.test(t)) break;
    if (t.includes('weaponAssembly(')) { inWeapon = ' weaponAssembly-scope'; break; }
  }
  const strong = `${bucket} ${via} ${fn} ${code}${inWeapon}`;
  return { strong, text: `${strong} ${block.reverse().join(' ')}`, file: f, code };
}
function tagsOf(entry) {
  const out = new Set();
  if (entry.cls === 'hatch') out.add('hatch');
  if (entry.cls === 'sight') out.add('sight');
  if (entry.cls === 'auxWeapon') out.add('weapon');
  if (entry.role && ROLE_TAGS[entry.role]) out.add(ROLE_TAGS[entry.role]);
  const label = entry.label || '';
  const { strong, text, file, code } = hostText(label);
  for (const [tag, rx] of WEIRD_TAGS) {
    if (out.has(tag)) continue;
    const src = tag === 'hatch' || tag === 'sight' ? strong : text;
    if (!rx.test(src)) continue;
    if (tag === 'light' && NOT_LIGHT.test(src)) continue;
    if (tag === 'softload' && label.includes('stowageRack')) continue;
    if (file && FALSE_TAGS.some(([f, c, t]) => f === file && t === tag && code.includes(c))) continue;
    out.add(tag);
  }
  if (label.startsWith('decor:cargo') || label.startsWith('decor:bag')) out.add('softload');
  if (/<(stowage|tarpRoll|bedroll)<-/.test(label)) out.add('softload');
  if (/<(jerryCan|ammoCan|fuelDrum)<-/.test(label) || /jerry|fuel ?drum|ammo ?can/i.test(label)) out.add('cans');
  if (/<(shovelTool|pioneerTools?)<-/.test(label)) out.add('tools');
  if (label.startsWith('decor:smoke')) out.add('smoke');
  return out;
}
const pct = (x) => `${Math.round(x * 100)}%`;
const cm = (x) => `${(x * 100).toFixed(1)} cm`;
/** The audit's classes for one measured run (classify.py), then the verifier's corrections (retally.py). */
function classifyRun(b) {
  // outward face: adhoc/strip runs are measured from both faces; the face resting on something is the run's own
  let s = b.support;
  // the outward face is the one resting on a host with its top in the open: better support, or as good support with far
  // less of its top hidden (the AMX 40's rear-plate links read from the face pressed against the plate)
  const altBetter = b.alt && ((b.alt.sup > s.supportedShare + 0.15 && b.alt.air <= s.overhangShare)
    || (b.alt.sup >= s.supportedShare - 0.05 && b.alt.air <= s.overhangShare + 0.05
      && (b.alt.hidden ?? 0) < (s.hiddenShare ?? 0) - 0.3));
  if (altBetter) {
    s = { ...s, supportedShare: b.alt.sup, gapShare: b.alt.gap, overhangShare: b.alt.air, hiddenShare: b.alt.hidden, hiddenIn: b.alt.hiddenIn,
      normal: b.alt.normal, flipped: true,
      ...(b.alt.hosts ? { hosts: b.alt.hosts, beneath: b.alt.beneath, hostClassShares: b.alt.hostClassShares,
        beneathClassShares: b.alt.beneathClassShares, medianGapM: b.alt.medianGapM } : {}) };
  }
  const inter = b.intersections || {}, near = b.near || {}, sw = b.sweep || {};
  const hidden = s.hiddenShare || 0, buried = hidden > 0.5;
  const why = {};
  const add = (c, w) => { (why[c] ||= []).push(w); };
  const hc = s.hostClassShares || {}, bc = s.beneathClassShares || {};
  const gunSupport = (hc.gun || 0) + (hc.mantlet || 0), gunBeneath = (bc.gun || 0) + (bc.mantlet || 0);
  if (b.onMovingPart) add('ON_GUN', `rests on the ${b.onMovingPart}${gunSupport ? ` (${pct(gunSupport)} of footprint)` : ' (parented to the gun rig)'}`);
  if (gunBeneath >= 0.10 && !b.onMovingPart) add('ON_GUN', `over the gun/mantlet (${pct(gunBeneath)} of footprint within 30 cm)`);
  for (const c of ['gun', 'mantlet']) {
    if ((inter[c]?.depthM || 0) > 0.005) add('ON_GUN', `cuts the ${c} ${cm(inter[c].depthM)} at rest`);
    else if ((near[c]?.distM ?? 1) <= 0.005 && !b.onMovingPart) add('ON_GUN', `touches the ${c} at rest (${Math.round(near[c].distM * 1000)} mm)`);
  }
  const mode = sw.mode || '', sd = sw.depthM || 0;
  const swept = sd > 0.005 && mode !== 'rides-gun' && !mode.startsWith('fixed-in-hull');
  const sweeper = sw.with || '';
  const sweeperCls = (/\[(\w+)\]$/.exec(sweeper) || [null, ''])[1];
  const pose = `yaw ${sw.yawDeg}${sw.pitchDeg != null ? `, pitch ${sw.pitchDeg}` : ''}`;
  if (swept && (sweeperCls === 'gun' || sweeperCls === 'mantlet')) add('ON_GUN', `the ${sweeperCls} sweeps ${cm(sd)} into it (${pose})`);
  if (swept) add('IN_SWEEP', `${['', 'armor', 'fitting', 'hatch', 'sight', 'decor'].includes(sweeperCls) ? 'turret' : sweeperCls} passes ${cm(sd)} through it (${pose}; ${sweeper.split(' [')[0]})`);
  const sup = s.supportedShare, gap = s.gapShare, air = s.overhangShare;
  if (!buried) {
    if (air > 0.25) add('HANGING', `${pct(air)} over air`);
    if (sup < 0.5) add('HANGING', `only ${pct(sup)} supported`);
    if (gap >= 0.5) add('FLOATING', `${pct(gap)} hovers 3-30 cm up (median gap ${cm(s.medianGapM || 0)})`);
  }
  for (const c of ['gun', 'mantlet', 'hatch', 'sight', 'auxWeapon', 'decor', 'fitting', 'trackBundle']) {
    const d = inter[c]?.depthM || 0;
    if (d > 0.01) add('INTERSECTING', `cuts ${c} ${cm(d)} (${inter[c].with})`);
  }
  const hostLabel = b.host?.label, mdw = s.sunkMaxDepthWith || '';
  if ((s.sunkMaxDepthM || 0) > 0.01 && mdw && hostLabel && !mdw.startsWith(hostLabel) && !buried) add('INTERSECTING', `clips ${mdw.split(' [')[0]} by ${cm(s.sunkMaxDepthM)}`);
  if ((s.sunkDeep1cmShare || 0) > 0.10 && !buried) add('INTERSECTING', `${pct(s.sunkDeep1cmShare)} sunk > 1 cm into armour (max ${cm(s.sunkMaxDepthM || 0)})`);
  if (buried) add('INTERSECTING', `buried: ${pct(hidden)} of its top inside ${s.hiddenIn} (invisible)`);
  else if (hidden > 0.2) add('INTERSECTING', `partly buried: ${pct(hidden)} of its top inside ${s.hiddenIn}`);
  const on = new Map(), over = new Map(), where = new Map();
  for (const e of s.hosts || []) for (const t of tagsOf(e)) { on.set(t, (on.get(t) || 0) + e.share); if (!where.has(t)) where.set(t, e.label); }
  for (const e of s.beneath || []) for (const t of tagsOf(e)) { over.set(t, (over.get(t) || 0) + e.share); if (!where.has(t)) where.set(t, e.label); }
  for (const t of new Set([...on.keys(), ...over.keys()])) {
    const o = on.get(t) || 0, v = over.get(t) || 0, lim = t === 'era' ? 0.25 : 0.15;
    if (o >= lim || v >= Math.max(lim, 0.25)) add('WEIRD', `on ${t} (${where.get(t)}; ${pct(Math.max(o, v))} of footprint)`);
  }
  if (!why.WEIRD) {
    let any = 0; const tg = new Set();
    for (const e of s.hosts || []) { const t = [...tagsOf(e)].filter((x) => x !== 'era'); if (t.length) { any += e.share; t.forEach((x) => tg.add(x)); } }
    if (any >= 0.15) add('WEIRD', `on ${[...tg].sort().join('/')} parts (${pct(any)} of footprint, several parts)`);
  }
  for (const [c, tg] of [['hatch', 'hatch'], ['sight', 'sight'], ['auxWeapon', 'roof weapon']]) {
    const nd = near[c]?.distM;
    if (nd != null && nd <= 0.01 && !(why.WEIRD || []).some((w) => w.startsWith(`on ${tg}`))) add('WEIRD', `touches a ${tg} (${near[c].with}, ${Math.round(nd * 1000)} mm)`);
  }
  // ---- the verifier's corrections
  const notes = [];
  const exposureAbove = b.vis?.exposureAbove ?? 1;
  const visible = exposureAbove >= 0.3;
  let classes = new Set(Object.keys(why).filter((c) => PRIORITY.includes(c)));
  if (!visible) { classes = new Set(['BURIED']); notes.push(`exposure ${exposureAbove}`); }
  else {
    if (classes.has('INTERSECTING')) {
      const depth = (w) => { const m = /([\d.]+) cm/.exec(w); return m ? Number(m[1]) : 99; };
      if (!(why.INTERSECTING || []).some((w) => w.includes('buried') || depth(w) > 5)) { classes.delete('INTERSECTING'); notes.push('clips <= 5 cm cosmetic'); }
    }
    if (b.source === 'decor' && (classes.has('FLOATING') || classes.has('HANGING'))
      && (s.medianGapM || 0) <= 0.055 && air <= 0.25) {
      classes.delete('FLOATING'); classes.delete('HANGING'); notes.push('decor carrier standoff');
    }
    if (classes.has('ON_GUN') && !(why.ON_GUN || []).some((w) => !w.startsWith('the '))) {
      classes.delete('ON_GUN'); classes.add('IN_SWEEP'); notes.push('ON_GUN was sweep-only');
    }
    const t = TRAVERSE_ARTEFACTS.has(b.__id) ? null : b.traverse;
    if (t && (t.depthM || 0) > 0.02) {
      const self = t.turretSelfWithin15cmM;
      if (self == null || self < 0.01) { classes.add('IN_SWEEP'); add('IN_SWEEP', `traverse ${cm(t.depthM)} yaw ${t.yawDeg} into ${t.with}`); }
      else notes.push(`HOST_SWEEP: traverse ${cm(t.depthM)} yaw ${t.yawDeg} into ${t.with}, the turret itself ${cm(self)} into the same part`);
    }
  }
  const ordered = [...PRIORITY, 'BURIED'].filter((c) => classes.has(c));
  return { classes: ordered, primary: ordered[0] || 'OK', why, notes, hostSweep: notes.some((n) => n.startsWith('HOST_SWEEP')) };
}

// ------------------------------------------------------------------ coverage (UNCOVERED)
// Parts in a spare-link bucket that are not links: allowlisted with their reason (the census's track-material non-links).
// Each entry names the authoring function and file (any line), read 2026-10-15 off the census's non-link sites.
const NON_LINK_TRACK_PARTS = [
  { site: /^abramsBustleRackTurretStage\d@profiles\/abrams\.ts:/, why: 'Abrams bustle-rack dressing in the track steel' },
  { site: /^addRoofConformingPlate@profiles\/abrams\.ts:/, why: 'Abrams roof-conforming plates' },
  { site: /^turretHatch@profiles\/abrams\.ts:/, why: 'Abrams hatch rings' },
  { site: /^(tejasRoofKit\w*|buildTejasFamilyTurretCourse\d+)@profiles\/abrams\.ts:/, why: 'Tejas-family roof rings and fittings' },
  { site: /^addT90RadialArmorBelt@profiles\/t90\.ts:/, why: 'T-90 radial ERA belt (K-5 cassettes)' },
  { site: /^addTerminatorStation@profiles\/afvFamily\.ts:/, why: 'BMPT station ring base' },
  { site: /^build(BV|Kursk)RunningGearAndSkirts@profiles\/ukraine\.ts:/, why: 'Ukrainian skirt strips' },
  { site: /^buildKurskHull@profiles\/ukraine\.ts:/, why: 'Kontakt-5 glacis cassettes' },
  { site: /^buildLeo2A5HullStage[18]@profiles\/leopard\.ts:/, why: 'Leopard 2A5 board slivers and deck panel' },
  { site: /^buildT80Line(HullStage2|RunningGearStage1)@profiles\/t80\.ts:/, why: 'T-80 skirt panels and bow flaps' },
  { site: /^buildType10Native2026HullStage1@modern3\.ts:/, why: 'Type 10 idler rims' },
  { site: /^chieftain(5|Mk10)Build@profiles\/uk\.ts:/, why: 'Chieftain corner flaps' },
  { site: /^merkava(BasketTurretStage8|ChassisHullCourse\d+)@profiles\/merkava\.ts:/, why: 'Merkava basket curtains and rack voids' },
  { site: /^turretLoadout@profiles\/nationalPoland\.ts:/, why: 'PT-91 bustle stowage blocks' },
];
function coverageOf(res) {
  const out = [];
  if (res.seatError) out.push(`the build's seat pass failed: ${res.seatError}`);
  for (const B of res.bundles) {
    if (B.source !== 'adhoc') continue;
    if (B.registered) continue;
    out.push(`unregistered spare-link geometry ${B.bundle}`);
  }
  for (const n of res.trackMaterialNonLinks || []) {
    if (NON_LINK_TRACK_PARTS.some((a) => a.site.test(n.site || ''))) continue;
    out.push(`track-material parts not in a run: ${n.site} (${n.parts})`);
  }
  for (const c of res.diag?.fittingCalls || []) {
    if (c.state === 'visible' && !c.found) out.push(`spare-link fitting built but not found: ${c.site}`);
  }
  const receipt = res.buildReceipt;
  if (receipt) {
    const built = res.bundles.filter((b) => b.source !== 'adhoc' || b.registered).length;
    const declared = receipt.runs;
    if (declared !== built) out.push(`run count ${built} differs from the build receipt's ${declared}`);
  }
  return out;
}

/**
 * Source lint: a spare-link helper in profile code (a function named for spare links or track links, defined or
 * called) that is not one of the registered placement routes. Loose parts in the *Track buckets are caught at run time
 * (coverage above); this catches a new hand-drawn helper before it ever builds.
 */
const LINT_RE = /\b\w*spare_?(link|track)\w*\s*\(/i;
const LINT_OK = /^(FITTINGS\.spareTrackLinks|spareTrackStrip|withSpareTrackRun|spareTrackRunTag|spareTrackPart|fittingSpareTrackLinks)$/;
const LINT_FILES_OK = new Map([['arieteXPhotoDraft.ts', 'retired photo draft, built only by its own selftests']]);
function sourceLint() {
  const dir = path.join(WT, 'src/vehicles/profiles');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts')).sort()) {
    if (LINT_FILES_OK.has(f)) continue;
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      for (const m of code.matchAll(/\b([\w.]*spare_?(?:link|track)\w*)\s*\(/gi)) {
        if (LINT_OK.test(m[1].replace(/^KIT\./, ''))) continue;
        out.push(`profiles/${f}:${i + 1}: ${m[1]}(`);
      }
    });
  }
  return out;
}

// ------------------------------------------------------------------ main
// --reclassify=<in.jsonl> --jsonl=<out.jsonl>: classify stored measurements again (no builds)
const RECLASSIFY = arg('reclassify', null);
if (RECLASSIFY) {
  const out = arg('jsonl', `${RECLASSIFY}.reclassified.jsonl`);
  fs.writeFileSync(out, '');
  for (const line of fs.readFileSync(RECLASSIFY, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (!o.raw) continue;
    const runs = o.raw.bundles.map((b) => {
      const c = classifyRun({ ...b, __id: o.id });
      return { index: b.index, site: b.bundle, source: b.source, frame: b.frame, registered: !!b.registered, classes: c.classes,
        primary: c.primary, why: Object.fromEntries(Object.entries(c.why).filter(([k]) => c.classes.includes(k))), notes: c.notes };
    });
    fs.appendFileSync(out, JSON.stringify({ id: o.id, inputHash: o.inputHash, runs, uncovered: coverageOf(o.raw) }) + '\n');
  }
  console.log(`[spare-track] reclassified ${RECLASSIFY} -> ${out}`);
  process.exit(0);
}
const JSONL = arg('jsonl', null);
const JSON_OUT = arg('json', null);
const CROPS = arg('crops', null);
const SHARD = arg('shard', null);
const LEDGER = arg('ledger', null);
const UPDATE = flag('update'), CHECK = flag('check'), GATE = flag('gate');
const ALL_IDS = [...(specs.ALL_TANK_IDS ?? specs.SAVED_TANK_IDS ?? specs.TANK_IDS)];
let ids = (arg('ids', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
if (ids.length === 1 && ids[0] === 'all') ids = [...ALL_IDS];
let cropJobs = null;
if (CROPS) { cropJobs = JSON.parse(fs.readFileSync(CROPS, 'utf8')); ids = [...new Set(cropJobs.map((j) => j.id))]; }
if (SHARD) { const [k, nn] = SHARD.split('/').map(Number); ids = ids.filter((_, i) => i % nn === k); }
const ledgerPath = LEDGER ? path.resolve(WT, LEDGER) : null;
const ledger = ledgerPath && fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  : { schema: 1, tool: 'tools/spare-track-placement-check.mjs', tankIdSchema: idMod.TANK_ID_SCHEMA, rows: {} };
if (!ids.length) { console.error('[spare-track] no ids (--ids=a,b|all)'); process.exit(2); }
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const YIELD_LOAD = Number(arg('yield-load', '0'));
const os = await import('node:os');
const results = {};
const planAudits = {};
const failures = [];
for (const id of ids) {
  while (YIELD_LOAD > 0 && os.loadavg()[0] > YIELD_LOAD) {
    console.log(`[spare-track] load ${os.loadavg()[0].toFixed(1)} > ${YIELD_LOAD}: waiting`);
    await new Promise((r) => setTimeout(r, 30000));
  }
  let res;
  try { res = analyse(id); } catch (e) {
    console.error(`[spare-track] ${id}: ${e.stack || e}`);
    failures.push(`${id}: build/analysis error ${e.message || e}`);
    continue;
  }
  if (res.planAudit) planAudits[id] = res.planAudit;
  if (res.unchanged) { results[id] = ledger.rows[id]; if (!QUIET) console.log(`${id}	unchanged (${res.inputHash})`); continue; }
  const { _bodies, _bundles, _visual, _MM, ...clean } = res;
  const runs = clean.bundles.map((b) => {
    const c = classifyRun({ ...b, __id: id });
    return { index: b.index, site: b.bundle, source: b.source, frame: b.frame, registered: !!b.registered, classes: c.classes, primary: c.primary,
      why: Object.fromEntries(Object.entries(c.why).filter(([k]) => c.classes.includes(k))), notes: c.notes,
      measures: { support: b.support.supportedShare, gap: b.support.gapShare, air: b.support.overhangShare,
        hidden: b.support.hiddenShare, sunkMaxM: b.support.sunkMaxDepthM, sweepM: b.sweep?.depthM ?? null,
        traverseM: b.traverse?.depthM ?? null, exposure: b.vis?.exposureAbove ?? null, host: b.host?.label ?? null } };
  });
  const uncovered = coverageOf(clean);
  const row = { inputHash: clean.inputHash, runs, uncovered, hostSweep: runs.filter((r) => r.notes.some((n) => n.startsWith('HOST_SWEEP'))).map((r) => r.site) };
  results[id] = row;
  if (JSONL) fs.appendFileSync(JSONL, JSON.stringify({ id, ...row, raw: clean }) + '\n');
  if (CROPS) {
    for (const job of cropJobs.filter((j) => j.id === id)) {
      const B = _bundles.find((x) => x.name === job.bundle && (job.index == null || x.index === job.index)) || _bundles.find((x) => x.index === job.index)
        || (job.near ? _bundles.filter((x) => dist3(job.near, x.aabb) < 0.6).sort((p, q) => dist3(job.near, p.aabb) - dist3(job.near, q.aabb))[0] ?? null : null);
      const cam = job.cameraFrom && fs.existsSync(job.cameraFrom) ? JSON.parse(fs.readFileSync(job.cameraFrom, 'utf8')) : null;
      if (!B && !cam) { console.error(`[spare-track] crop ${id}: bundle ${job.bundle}#${job.index} not found`); continue; }
      try {
        let R = res, F = B || { name: '(removed)', bodies: [], aabb: cam.view, idSet: new Set() };
        if (cam) F = { ...F, viewAabb: cam.view, eyeNormal: cam.normal };
        if (job.yaw != null || job.pitch != null) {
          const yaw = job.yaw ?? 0, pitch = job.pitch ?? 0;
          const Y = _MM.yawMatrix(yaw), YP = Y.clone().multiply(_MM.pitchMatrix(pitch));
          const moved = _bodies.map((b) => (b.rig === 'turret' ? transformBody(b, Y) : (b.rig === 'gunmount' || b.rig === 'recoil') ? transformBody(b, YP) : b));
          const fb = moved.filter((b) => F.idSet.has(b.id));
          R = { ...res, _bodies: moved }; F = { ...F, bodies: fb, aabb: fb.length ? unionAabb(fb) : F.aabb };
        }
        if (job.normal) F = { ...F, eyeNormal: job.normal };
        if (job.hide) { const hide = new Set(job.hide); R = { ...R, _bodies: R._bodies.filter((b) => !hide.has(b.cls) || F.bodies.includes(b)) }; }
        await renderCrop(R, F, job.file, job.caption || [`${id} ${B.name}`]); console.log(`crop ${job.file}`);
      } catch (e) { console.error(`[spare-track] crop ${id}: ${e.stack || e}`); }
    }
  }
  _visual.dispose();
  const bad = runs.filter((r) => r.classes.some((c) => GATED.has(c)));
  if (!QUIET) console.log(`${id}\truns ${runs.length}\tdefective ${bad.length}\tuncovered ${uncovered.length}\t${clean.buildMs + clean.analyseMs} ms`);
}
/** Rewrite spareTrackSeatPlan.ts with the search's answers for every id built in this run (others are kept). */
function writeSeatPlan(audits) {
  const file = path.join(WT, PLAN_REL);
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf('export const SPARE_TRACK_SEAT_PLAN');
  const body = src.slice(src.indexOf('=', at) + 1).trim().replace(/;\s*$/, '');
  const plan = Function(`return (${body});`)();
  for (const [id, audit] of Object.entries(audits)) {
    if (Object.keys(audit.live).length) plan[id] = Object.fromEntries(Object.entries(audit.live).sort(([a], [b]) => (a < b ? -1 : 1)));
    else delete plan[id];
  }
  const ids = Object.keys(plan).sort();
  const lines = ids.map((id) => `  ${JSON.stringify(id)}: {\n${Object.entries(plan[id]).map(([site, k]) => `    ${JSON.stringify(site)}: ${k},`).join('\n')}\n  },`);
  const next = `${src.slice(0, at)}export const SPARE_TRACK_SEAT_PLAN: Readonly<Record<string, Readonly<Record<string, number>>>> = {${lines.length ? `\n${lines.join('\n')}\n` : ''}};\n`;
  if (next !== src) { fs.writeFileSync(file, next); console.log(`[spare-track] seat plan ${PLAN_REL}: ${ids.length} vehicles`); }
}
function dist3(p, a) { return Math.hypot(Math.max(a[0] - p[0], 0, p[0] - a[3]), Math.max(a[1] - p[1], 0, p[1] - a[4]), Math.max(a[2] - p[2], 0, p[2] - a[5])); }

const lint = (CHECK || GATE || UPDATE) ? sourceLint() : [];
const gatedOf = (id, row) => {
  const out = [];
  for (const r of row.runs) for (const c of r.classes) if (GATED.has(c)) out.push(`${id} ${r.site}: ${c} (${(r.why[c] || r.notes || []).slice(0, 2).join('; ')})`);
  for (const u of row.uncovered || []) out.push(`${id}: UNCOVERED ${u}`);
  return out;
};
const problems = [...failures];
for (const [id, row] of Object.entries(results)) {
  problems.push(...gatedOf(id, row));
  const prior = ledger.rows[id];
  if ((CHECK || GATE) && prior && prior.inputHash !== row.inputHash) problems.push(`${id}: STALE (ledger ${prior.inputHash}, build ${row.inputHash}); run --update`);
  if (GATE && prior && prior.inputHash === row.inputHash) {
    const key = (r) => `${r.site}|${r.classes.join(',')}`;
    const was = new Set(prior.runs.map(key)), now = new Set(row.runs.map(key));
    if (was.size !== now.size || [...now].some((k) => !was.has(k))) problems.push(`${id}: a fresh measurement differs from its ledger row`);
  }
  if ((CHECK || GATE) && !prior) problems.push(`${id}: no ledger row; run --update`);
  if ((CHECK || GATE) && !UPDATE) for (const st of planAudits[id]?.stale ?? []) problems.push(`${id}: SEAT_PLAN ${st}; run --update`);
}
for (const l of lint) problems.push(`UNCOVERED source ${l}`);
if (UPDATE && ledgerPath) {
  for (const [id, row] of Object.entries(results)) ledger.rows[id] = row;
  ledger.tankIdSchema = idMod.TANK_ID_SCHEMA;
  ledger.rows = Object.fromEntries(Object.entries(ledger.rows).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1) + '\n');
  console.log(`[spare-track] ledger ${path.relative(WT, ledgerPath)}: ${Object.keys(results).length} rows written`);
}
if (UPDATE && passMod) writeSeatPlan(planAudits);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ results, lint, problems }, null, 1));
const tally = {};
for (const row of Object.values(results)) for (const r of row.runs) tally[r.primary] = (tally[r.primary] || 0) + 1;
console.log(`[spare-track] ${Object.keys(results).length} ids, runs by primary class ${JSON.stringify(tally)}, ${problems.length} problem(s)`);
for (const p of problems.slice(0, 80)) console.log(`  ${p}`);
// restore hooks (process exits anyway)
Object.assign(DECOR_KITS, ORIG_KITS);
FITTINGS.spareTrackLinks = origSpareLinks;
KIT.spareTrackStrip = origStrip;
THREE.BufferGeometry.prototype.applyMatrix4 = origApply;
if ((CHECK || GATE) && problems.length) process.exit(1);
