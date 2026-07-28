// src/vehicles/tankFactory.js — procedural constructors for the 8-tank roster.
// Recognizable replicas composed from BufferGeometries (ARCHITECTURE §3.3.2).
// No top-level side effects; all randomness seeded; time arrives via syncFromState
// (assumed render cadence of 1/60 s per call for the self-timed recoil animation).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { getSpec, MODEL_SOURCE } from './specs.js';
import { createTankMaterials } from './materials.js';

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const D2R = Math.PI / 180;
const SIM_STEP = 1 / 60;

// modelLoader.js module ref, captured after the first dynamic import so later
// createTank calls can apply an already-parsed GLB synchronously (icons,
// garage re-entry) instead of one-frame-late.
let _modelLoaderMod = null;

// ---- module-scope scratch (no per-frame allocation) ------------------------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _X = new THREE.Vector3(1, 0, 0);
const _E = new THREE.Euler(); // fallen road-wheel pose (de-track scatter)

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function xform(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const sc = Array.isArray(s) ? s : [s, s, s];
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sc[0], sc[1], sc[2]),
  );
  geo.applyMatrix4(m);
  return geo;
}

// Chamfered box: armor plates get a visible machined bevel instead of a
// razor-sharp BoxGeometry edge. Tiny fittings fall back to plain boxes.
const box = (w, h, d) => {
  const m = Math.min(w, h, d);
  if (m < 0.06) return new THREE.BoxGeometry(w, h, d);
  const r = Math.min(0.024, m * 0.24);
  return new RoundedBoxGeometry(w, h, d, m > 0.5 ? 2 : 1, r);
};
const cylY = (rT, rB, h, seg = 16, open = false, th0 = 0, thL = Math.PI * 2) =>
  new THREE.CylinderGeometry(rT, rB, h, seg, 1, open, th0, thL);
const cylX = (r, len, seg = 16, r2) => xform(cylY(r, r2 ?? r, len, seg), 0, 0, 0, 0, 0, Math.PI / 2);
const cylZ = (r, len, seg = 16, r2) => xform(cylY(r, r2 ?? r, len, seg), 0, 0, 0, Math.PI / 2, 0, 0);
const sph = (r, seg = 16, thetaLen) =>
  new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1), 0, Math.PI * 2, 0, thetaLen ?? Math.PI);
const torus = (r, tube, seg = 16, tSeg = 8) => xform(new THREE.TorusGeometry(r, tube, tSeg, seg), 0, 0, 0, Math.PI / 2, 0, 0);
// Cast body of revolution: profile is [[r, y], ...] bottom→top, optionally
// stretched in plan via sz so round castings can go egg-shaped.
const lathe = (profile, seg = 28, sz = 1) =>
  xform(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), seg),
    0, 0, 0, 0, 0, 0, [1, 1, sz]);

// 8-corner slab: rings in plan order (-x,+z),(+x,+z),(+x,-z),(-x,-z), bottom then top.
function slab(b0, b1, b2, b3, t0, t1, t2, t3) {
  const P = [];
  const quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad(b0, b1, t1, t0);       // +Z front
  quad(b1, b2, t2, t1);       // +X right
  quad(b2, b3, t3, t2);       // -Z rear
  quad(b3, b0, t0, t3);       // -X left
  quad(t0, t1, t2, t3);       // +Y top
  quad(b3, b2, b1, b0);       // -Y bottom
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((P.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}
// Axis-aligned frustum: bottom rect (bw×bd) at y0, top rect (tw×td) at y1,
// with independent z offsets for bottom/top front & rear edges.
function frustum(bw, bzF, bzR, tw, tzF, tzR, y0, y1) {
  return slab(
    [-bw, y0, bzF], [bw, y0, bzF], [bw, y0, bzR], [-bw, y0, bzR],
    [-tw, y1, tzF], [tw, y1, tzF], [tw, y1, tzR], [-tw, y1, tzR],
  );
}

// Faceted cast turret from an arbitrary plan polygon (r7 — T-34-85 hex cast):
// flared base ring -> inset top ring with a flat roof fan. `plan` is
// [[x, z], ...] in plan view; face windings are auto-oriented outward.
function polyTurret(plan, h, flare = 1.08, inset = 0.78) {
  const n = plan.length;
  const cx = plan.reduce((s, p) => s + p[0], 0) / n;
  const cz = plan.reduce((s, p) => s + p[1], 0) / n;
  const ring = (s, y) => plan.map(([x, z]) => [cx + (x - cx) * s, y, cz + (z - cz) * s]);
  const b = ring(flare, 0), t = ring(inset, h);
  const P = [];
  const tri = (a, b2, c) => P.push(...a, ...b2, ...c);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (b[i][0] + b[j][0]) / 2 - cx, mz = (b[i][2] + b[j][2]) / 2 - cz;
    const ex = b[j][0] - b[i][0], ez = b[j][2] - b[i][2];
    if (ex * mz - ez * mx > 0) { tri(b[i], b[j], t[j]); tri(b[i], t[j], t[i]); }
    else { tri(b[j], b[i], t[i]); tri(b[j], t[i], t[j]); }
  }
  const c = [cx, h, cz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ny = (t[j][2] - t[i][2]) * (c[0] - t[i][0]) - (t[j][0] - t[i][0]) * (c[2] - t[i][2]);
    if (ny > 0) tri(t[i], t[j], c); else tri(t[j], t[i], c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((P.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

// World-scale box-projected UVs so camo density is uniform across all parts.
function boxUV(geo, scale = 0.35) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }
    else if (nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function mergeAll(list) {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  return merged;
}

// LOD1: greeble-class objects vanish past this range; the camo hull/turret
// shells, wheels and track band carry the silhouette. The renderer drives
// THREE.LOD automatically, so articulation (turret yaw) is unaffected.
const LOD1_DIST = 150;
function lodWrap(parent, obj, dist = LOD1_DIST) {
  const lod = new THREE.LOD();
  lod.addLevel(obj, 0);
  lod.addLevel(new THREE.Object3D(), dist);
  parent.add(lod);
  return obj;
}

// Closed track band swept around a 2D loop in the (z,y) plane.
function trackBandGeo(points, width, th, linkM) {
  const n = points.length;
  const P = [], UV = [];
  const hw = width / 2;
  // cumulative arc length
  const dist = [0];
  for (let i = 1; i <= n; i++) {
    const a = points[i - 1], b = points[i % n];
    dist.push(dist[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const frame = (i) => {
    const p = points[i % n];
    const prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
    let tz = next[0] - prev[0], ty = next[1] - prev[1];
    const l = Math.hypot(tz, ty) || 1;
    tz /= l; ty /= l;
    return { z: p[0], y: p[1], nz: -ty, ny: tz };
  };
  const quad = (a, b, c, d, ua, va, ub, vb) => {
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    UV.push(ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb);
  };
  for (let i = 0; i < n; i++) {
    const f0 = frame(i), f1 = frame(i + 1);
    const v0 = dist[i] / linkM, v1 = dist[i + 1] / linkM;
    const oz0 = f0.z + f0.nz * th / 2, oy0 = f0.y + f0.ny * th / 2;
    const iz0 = f0.z - f0.nz * th / 2, iy0 = f0.y - f0.ny * th / 2;
    const oz1 = f1.z + f1.nz * th / 2, oy1 = f1.y + f1.ny * th / 2;
    const iz1 = f1.z - f1.nz * th / 2, iy1 = f1.y - f1.ny * th / 2;
    // outer face
    quad([-hw, oy1, oz1], [hw, oy1, oz1], [hw, oy0, oz0], [-hw, oy0, oz0], 0, v1, 1, v0);
    // inner face
    quad([-hw, iy0, iz0], [hw, iy0, iz0], [hw, iy1, iz1], [-hw, iy1, iz1], 0, v0, 1, v1);
    // sides
    quad([hw, oy0, oz0], [hw, oy1, oz1], [hw, iy1, iz1], [hw, iy0, iz0], 0, v0, 0.08, v1);
    quad([-hw, oy0, oz0], [-hw, iy0, iz0], [-hw, iy1, iz1], [-hw, oy1, oz1], 0, v0, 0.08, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.computeVertexNormals();
  return g;
}

function trackLoopPoints({ idler, sprocket, botY, topY, sag = 0.03, supports = null }) {
  const pts = [];
  // CLEAR: the band rides OUTSIDE the sprocket teeth / idler rim — without
  // this radial clearance the wrap is buried in the wheel geometry and the
  // front/rear rises never read (r5 track-gate critique).
  const CLEAR = 0.045;
  const arc = (c, from, to, steps) => {
    for (let k = 0; k <= steps; k++) {
      const a = (from + ((to - from) * k) / steps) * D2R;
      pts.push([c.z + Math.sin(a) * (c.r + CLEAR), c.y + Math.cos(a) * (c.r + CLEAR)]);
    }
  };
  // top run: sprocket top -> idler top. r7 sag rework: the run RESTS on real
  // support points (return rollers, or the wheel tops on dead-track WWII
  // rigs) and hangs a shallow catenary dip in EVERY unsupported span —
  // the old fixed-frequency ripple averaged out to a ruler line.
  const zs = sprocket.z, zi = idler.z;
  const ys = sprocket.y + sprocket.r + CLEAR, yi = idler.y + idler.r + CLEAR;
  const dir = Math.sign(zi - zs) || 1;
  const sup = [[zs, ys]];
  if (supports && supports.length) {
    const inner = supports
      .filter((s) => (s.z - zs) * dir > 0.12 && (zi - s.z) * dir > 0.12)
      .sort((a, b) => (a.z - b.z) * dir)
      .map((s) => [s.z, s.y]);
    sup.push(...inner);
  } else {
    // no explicit supports: hold the line up at topY mid-run
    sup.push([zs + (zi - zs) * 0.5, Math.max(topY, (ys + yi) / 2)]);
  }
  sup.push([zi, yi]);
  for (let k = 0; k < sup.length - 1; k++) {
    const [z0, y0] = sup[k], [z1, y1] = sup[k + 1];
    const span = Math.abs(z1 - z0);
    const dip = Math.min(sag, sag * span * 1.6);
    const steps = Math.max(2, Math.min(6, Math.round(span * 5)));
    for (let j = k === 0 ? 0 : 1; j <= steps; j++) {
      const t = j / steps;
      pts.push([z0 + (z1 - z0) * t, y0 + (y1 - y0) * t - dip * Math.sin(t * Math.PI)]);
    }
  }
  arc(idler, 0, 170, 7);                       // around the idler (front)
  // bottom run
  for (let k = 1; k <= 5; k++) {
    const t = k / 6;
    pts.push([zi + (zs - zi) * t, botY]);
  }
  arc(sprocket, 190, 360, 7);                  // around the sprocket (rear)
  // drop duplicate closing point
  pts.pop();
  return pts;
}

// Road-wheel geometry per style. Returns { tire, disc } (tire may be null).
// Every style gets a raised hub cap and a bolt ring so wheels stop reading as
// flat painted discs at garage distance.
function boltRing(discs, r, w, n = 8) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.2;
    discs.push(xform(cylX(r * 0.042, w * 1.16, 6), 0, Math.sin(a) * r * 0.4, Math.cos(a) * r * 0.4));
  }
}
function wheelGeo(style, r, w, seg) {
  const discs = [];
  if (style === 'steel') {
    discs.push(cylX(r, w, seg));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      discs.push(xform(box(w * 1.12, r * 0.3, r * 0.62),
        0, Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5, a, 0, 0));
    }
    discs.push(cylX(r * 0.24, w * 1.3, 10));
    discs.push(cylX(r * 0.14, w * 1.44, 8));            // hub cap
    boltRing(discs, r, w, 6);
    return { tire: null, disc: mergeAll(discs), dark: null };
  }
  if (style === 'holes') {
    // T-34 Christie wheel (r7 rebuild): the painted dish spans nearly the
    // full radius with a THIN rubber rim, and the six big stamped lightening
    // holes are dark inserts — the "spider" face that makes the wheel read
    // full-size instead of a small disc floating in shadow.
    const tire = mergeAll([cylX(r, w, seg)]);
    discs.push(cylX(r * 0.86, w * 1.10, seg));           // near-full dish
    discs.push(cylX(r * 0.28, w * 1.32, 12));            // hub drum
    discs.push(cylX(r * 0.15, w * 1.5, 8));              // hub cap
    boltRing(discs, r * 0.72, w, 8);
    const dk = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      dk.push(xform(cylX(r * 0.185, w * 1.16, 10),
        0, Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.55));
    }
    return { tire, disc: mergeAll(discs), dark: mergeAll(dk) };
  }
  // Rubber band + a dark hub-well ring: the well sits between dish and hub so
  // the hub reads against shadow (r5: wheels merged into one flat plate).
  const tire = mergeAll([
    cylX(r, w, seg),
    cylX(r * 0.40, w * 1.2, seg),                        // hub shadow well
  ]);
  // Painted dish stands PROUD of the tire caps and covers 74% of the radius —
  // real road wheels read as painted steel discs with a clearly visible dark
  // rubber rim, never as full-face painted circles (r3/r5; rim widened in r6
  // after the Leo/T-90M wheels still read as body-green discs).
  discs.push(cylX(r * 0.74, w * 1.14, seg));
  discs.push(cylX(r * 0.24, w * 1.38, 10));              // hub
  discs.push(cylX(r * 0.14, w * 1.54, 8));               // hub cap
  boltRing(discs, r, w, 8);
  return { tire, disc: mergeAll(discs), dark: null };
}

// Idler: flat dished steel wheel matching the track width (r8) — the old
// torus + 6 boxy spokes read as a mangled lug-studded cylinder at closeup.
function idlerGeo(r, w, seg) {
  const parts = [];
  parts.push(cylX(r, w * 0.5, seg));                     // outer rim band
  parts.push(xform(cylX(r * 0.985, w * 0.62, seg), 0, 0, 0)); // rim lip
  // dished face: shallow cone from rim toward the hub on both faces
  parts.push(cylX(r * 0.84, w * 0.30, seg, r * 0.55));
  parts.push(xform(cylY(r * 0.55, r * 0.84, w * 0.30, seg), 0, 0, 0, 0, 0, Math.PI / 2));
  parts.push(cylX(r * 0.30, w * 0.92, 14));              // hub drum
  parts.push(cylX(r * 0.17, w * 1.10, 10));              // hub cap
  boltRing(parts, r * 0.42, w * 0.9, 8);
  return mergeAll(parts);
}

// Drive sprocket (r8 rework): dished body + two toothed rim rings whose teeth
// reach just proud of the wrapped band face, so the tips read as link
// engagement instead of boxes z-fighting inside the band shell. `toothOuter`
// is the band outer radius (r + CLEAR + trackTh/2) supplied by the caller.
function sprocketGeo(r, w, seg, teeth = 12, toothOuter = null) {
  const tipR = (toothOuter ?? r * 1.1) + 0.018;
  const rootR = r * 0.84;
  const parts = [cylX(r * 0.62, w * 0.94, seg)];         // body drum
  parts.push(cylX(r * 0.30, w * 1.06, 12));              // hub
  parts.push(cylX(r * 0.16, w * 1.18, 10));              // hub cap
  boltRing(parts, r * 0.44, w * 0.9, 8);
  for (const off of [-w / 2, w / 2]) {
    parts.push(xform(cylX(r * 0.94, w * 0.15, seg), off, 0, 0));   // rim disc
    parts.push(xform(cylX(rootR, w * 0.2, seg), off, 0, 0));       // tooth root ring
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * Math.PI * 2;
      const mid = (rootR + tipR) / 2;
      parts.push(xform(box(w * 0.13, tipR - rootR, r * 0.085),
        off, Math.sin(a) * mid, Math.cos(a) * mid, a, 0, 0));
    }
  }
  return mergeAll(parts);
}

// ---------------------------------------------------------------------------
// Running gear: instanced road wheels + rollers, per-side sprocket/idler meshes,
// and the two scrolling track bands.
// ---------------------------------------------------------------------------
function buildRunningGear(P, cfg) {
  const { mats, hullG, q } = P;
  const seg = q ? 26 : 12;
  const {
    style = 'rubber', wheelR, wheelW, wheelZs, xc,
    layers = null,                       // interleaved x offsets pattern, else null
    sprocket, idler, rollers = [], rollerR = 0.09,
    trackW, trackTh = 0.09, topY, botY = 0.055,
    arms = false,                        // visible torsion arms + axle stubs
  } = cfg;

  const wheelY = cfg.wheelY ?? wheelR + 0.10;

  // torsion arms: static axle stub + trailing arm per wheel station (merged
  // into the hull detail bucket — zero extra draw calls)
  if (arms) {
    wheelZs.forEach((z, i) => {
      for (const side of [-1, 1]) {
        const xa = side * (xc - wheelW * 0.7);
        P.add('hullDetail', cylX(wheelR * 0.16, wheelW * 0.9, 10), xa, wheelY, z);
        P.add('hullDetail', box(0.07, 0.09, wheelR * 0.95),
          side * (xc - wheelW * 1.1), wheelY + wheelR * 0.28, z + wheelR * 0.38, 0.6, 0, 0);
      }
    });
  }
  const entries = [];
  const maxOff = layers ? Math.max(...layers.flat()) : 0;
  wheelZs.forEach((z, i) => {
    const offs = layers ? layers[i % layers.length] : [0];
    for (const side of [-1, 1]) {
      // off: per-wheel suspension travel from terrain conformance (smoothed)
      // rec: recessed interleave row — rendered with the shadowed wheel
      // material so the Schachtellaufwerk layers read as depth (r5 hard gate)
      for (const o of offs) {
        entries.push({
          x: side * (xc + o * side), y: wheelY, z, r: wheelR, road: true, i, off: 0,
          // only rows well behind the proud face bake shadow (middle rows of a
          // triple interleave keep paint; HVSS inner pair wheels go dark)
          rec: layers ? o < maxOff - 0.15 : false,
        });
      }
    }
  });
  // Schachtellaufwerk depth cue: a near-black AO wall inside the wheel bay so
  // recessed rows separate from the hull side instead of camo-on-camo.
  if (layers) {
    const z0 = Math.min(...wheelZs) - wheelR, z1 = Math.max(...wheelZs) + wheelR;
    const shadowH = topY + 0.1;
    for (const side of [-1, 1]) {
      P.add('hullShadow', new THREE.BoxGeometry(0.02, shadowH, z1 - z0),
        side * (xc - wheelW * 2.0), shadowH / 2 + 0.03, (z0 + z1) / 2);
    }
  }
  const rollerEntries = [];
  for (const rl of rollers) {
    for (const side of [-1, 1]) rollerEntries.push({ x: side * xc, y: rl.y, z: rl.z, r: rl.r ?? rollerR, road: false, i: 0 });
  }

  const { tire, disc, dark } = wheelGeo(style, wheelR, wheelW, seg);
  const made = [];
  const mkInst = (geo, mat, list) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    // PERF: wheels/rollers sit inside the hull + track-band ground shadow —
    // their own cast contribution is invisible, but costs a draw per cascade
    // per tank. The track band (tl/tr below) still casts the silhouette.
    im.castShadow = false;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hullG.add(im);
    made.push({ im, list });
    P.disposables.push(geo);
    return im;
  };
  if (tire) mkInst(tire, mats.rubber, entries);
  const dishMat = style === 'rubber' || style === 'holes' ? mats.wheels : mats.detail;
  const proudList = entries.filter((e) => !e.rec);
  const recList = entries.filter((e) => e.rec);
  if (proudList.length) mkInst(disc, dishMat, proudList);
  // recessed interleave rows share the disc geometry but take the shadowed
  // wheel material (own InstancedMesh — one extra draw call on 2 tanks)
  if (recList.length) mkInst(disc, mats.wheelsRecessed || dishMat, recList);
  // dark inserts (stamped lightening holes on the Christie 'holes' style)
  if (dark) mkInst(dark, mats.rubber, entries);
  if (rollerEntries.length) {
    const rg = mergeAll([cylX(rollerR, trackW * 0.55, Math.max(8, seg - 6)), cylX(rollerR * 0.4, trackW * 0.62, 8)]);
    mkInst(rg, mats.detail, rollerEntries);
  }

  // sprocket + idler as plain meshes (they spin about X directly).
  // r8: sprocket wears SCHEME wheel paint (crews paint the whole vehicle;
  // the bare-grey drums read as unpainted plastic against the tan wheels)
  // with the dished-steel idler in shadowed wheel paint. Tooth tips are sized
  // to clear the band outer face so they read as link engagement instead of
  // z-fighting boxes buried inside the band shell (r7 Tiger mangle).
  const spinners = [];
  const bandOuterR = 0.045 + trackTh / 2;   // wrap CLEAR + half band thickness
  const sg = sprocketGeo(sprocket.r, trackW * 0.7, seg, 12, sprocket.r + bandOuterR);
  const ig = idlerGeo(idler.r, trackW * 0.62, seg);
  P.disposables.push(sg, ig);
  for (const side of [-1, 1]) {
    const sm = new THREE.Mesh(sg, mats.wheels || mats.detail);
    sm.position.set(side * xc, sprocket.y, sprocket.z);
    const im2 = new THREE.Mesh(ig, mats.wheelsRecessed || mats.detail);
    im2.position.set(side * xc, idler.y, idler.z);
    // PERF: sprocket/idler are wrapped by the casting track band — no cast
    sm.castShadow = im2.castShadow = false;
    sm.receiveShadow = im2.receiveShadow = true;
    hullG.add(sm, im2);
    spinners.push({ mesh: sm, r: sprocket.r, side }, { mesh: im2, r: idler.r, side });
  }

  // tracks — visible sag on the top run when there are no return rollers
  // (WW2 dead-track runs droop hard between supports — r5 track gate).
  // r7: the run rests on REAL supports — return rollers where fitted, else
  // the proud-row wheel tops — with a catenary dip hanging in every span.
  const sag = rollers.length ? 0.022 : 0.06;
  const maxOffSup = layers ? Math.max(...layers.flat()) : 0;
  const supports = rollers.length
    ? rollers.map((rl) => ({ z: rl.z, y: rl.y + (rl.r ?? rollerR) + trackTh / 2 }))
    : wheelZs
      .filter((z, i) => !layers || layers[i % layers.length].includes(maxOffSup))
      .map((z) => ({ z, y: wheelY + wheelR + trackTh / 2 + 0.005 }));
  // r8 LOOP-ORDER FIX (track hard gate): trackLoopPoints assumes its `idler`
  // arg is the +z (front) end wheel and `sprocket` the -z (rear) one. German
  // rigs drive from the FRONT (Tiger/Panther cfg passes sprocket at +z), and
  // feeding them swapped made the band wrap the WRONG side of both end
  // wheels — a crossed bowtie loop that left the real sprocket/idler bare
  // with a mangled link jumble (r7 critique). Order geometrically instead.
  const frontEnd = sprocket.z >= idler.z ? sprocket : idler;
  const rearEnd = sprocket.z >= idler.z ? idler : sprocket;
  const pts = trackLoopPoints({ idler: { ...frontEnd }, sprocket: { ...rearEnd }, botY, topY, sag, supports });
  const tg = trackBandGeo(pts, trackW, trackTh, mats.trackLinkM);
  P.disposables.push(tg);
  const tl = new THREE.Mesh(tg, mats.trackL);
  tl.position.x = -xc;
  const tr = new THREE.Mesh(tg, mats.trackR);
  tr.position.x = xc;
  tl.castShadow = tl.receiveShadow = tr.castShadow = tr.receiveShadow = true;
  hullG.add(tl, tr);

  // ---- individual link pads instanced along the loop (both sides) ----------
  const nP = pts.length;
  const segsT = [];
  let loopLen = 0;
  for (let i = 0; i < nP; i++) {
    const a = pts[i], b = pts[(i + 1) % nP];
    const dz = b[0] - a[0], dy = b[1] - a[1];
    const sl = Math.hypot(dz, dy) || 1e-6;
    segsT.push({ z: a[0], y: a[1], tz: dz / sl, ty: dy / sl, l: sl, c0: loopLen });
    loopLen += sl;
  }
  const nLinks = Math.max(24, Math.round(loopLen / 0.165));
  const lp = loopLen / nLinks;
  // Real link: pad + grouser + inner shoe + center guide horn + pin bosses,
  // so the loop reads as articulated individual links, not an extruded band.
  const linkGeo = mergeAll([
    box(trackW * 0.96, 0.06, lp * 0.66),                           // link pad
    xform(box(trackW * 0.88, 0.044, lp * 0.24), 0, 0.048, 0),      // grouser bar
    xform(box(trackW * 0.9, 0.02, lp * 0.5), 0, -0.03, 0),         // inner shoe plate
    xform(new THREE.BoxGeometry(0.05, 0.12, lp * 0.36), 0, -0.1, 0),  // guide horn
    xform(cylZ(0.026, lp * 0.52, 8), -trackW * 0.485, 0, 0),       // pin boss L
    xform(cylZ(0.026, lp * 0.52, 8), trackW * 0.485, 0, 0),        // pin boss R
  ]);
  P.disposables.push(linkGeo);
  const linkIM = new THREE.InstancedMesh(linkGeo, mats.trackLink || mats.dark, nLinks * 2);
  // PERF: link pads hug the casting track band — their shadow is the band's
  linkIM.castShadow = false;
  linkIM.receiveShadow = true;
  linkIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lodWrap(hullG, linkIM);
  const rOut = trackTh / 2 + 0.012;
  const placeLinks = (l, r) => {
    for (let i = 0; i < nLinks * 2; i++) {
      const side = i < nLinks ? -1 : 1;
      let s = (i % nLinks) * lp + (side < 0 ? l : r);
      s = ((s % loopLen) + loopLen) % loopLen;
      let sg = segsT[nP - 1];
      for (let k = 0; k < nP; k++) {
        if (s < segsT[k].c0 + segsT[k].l) { sg = segsT[k]; break; }
      }
      const u = s - sg.c0;
      const z = sg.z + sg.tz * u, y = sg.y + sg.ty * u;
      _q.setFromAxisAngle(_X, Math.atan2(-sg.ty, sg.tz));
      _v.set(side * xc, y + sg.tz * rOut, z - sg.ty * rOut);
      // de-track: link pads ride the slumped band down instead of floating
      // on the healthy loop above it
      _v.y -= (side < 0 ? brokenL : brokenR) * 0.16;
      _s.set(1, 1, 1);
      _m.compose(_v, _q, _s);
      linkIM.setMatrixAt(i, _m);
    }
    linkIM.instanceMatrix.needsUpdate = true;
  };

  // ---- thrown-track ribbon (de-track destruction visual) --------------------
  // A crumpled OPEN run of link pads draped off the rear of the running gear
  // and trailing flat behind the last road wheel, with growing lateral wiggle
  // so it reads as a violently shed band, not a straight plank. Hidden until
  // setBroken(side, true).
  const rearIsSprocket = sprocket.z < idler.z;
  const rearZ = Math.min(sprocket.z, idler.z);
  const rearR = rearIsSprocket ? sprocket.r : idler.r;
  const rearY = rearIsSprocket ? sprocket.y : idler.y;
  const RIB_N = 15;
  const ribPads = [];
  // low drape start: the shed band slips off the LOWER rear wheel rim and
  // lies nearly flat — the r4 probe showed a chest-high curl reading as a
  // giant pale drum parked against the hull
  const dropY = Math.min(rearY, wheelY) + 0.14; // just over the rear wheel rim
  for (let i = 0; i < RIB_N; i++) {
    const t = i / (RIB_N - 1);
    const drape = Math.exp(-t * 4.6);
    const py = 0.05 + Math.max(0, dropY - 0.05) * drape;
    const pz = rearZ + 0.1 - t * 2.35;
    const px = Math.sin(t * 6.8) * 0.10 * Math.min(1, t * 2.2);
    const yaw = Math.cos(t * 6.8) * 0.26 * Math.min(1, t * 2.2);
    const pitch = Math.min(0.5, Math.atan2(Math.max(0, dropY - 0.05) * 4.6 * drape, 2.35));
    ribPads.push(xform(mergeAll([
      box(trackW * 0.96, 0.05, 0.17),
      xform(box(trackW * 0.88, 0.04, 0.06), 0, 0.04, 0), // grouser
    ]), px, py, pz, pitch, yaw, Math.sin(i * 2.7) * 0.08));
  }
  const ribbonGeo = mergeAll(ribPads);
  P.disposables.push(ribbonGeo);
  const thrownRibbons = {};
  for (const side of [-1, 1]) {
    const rm = new THREE.Mesh(ribbonGeo, mats.trackLink || mats.dark);
    rm.position.x = side * xc;
    // mirror + slight per-side yaw so L/R throws never read identical
    rm.scale.x = side;
    rm.rotation.y = side * 0.07;
    rm.castShadow = false;
    rm.receiveShadow = true;
    rm.visible = false;
    hullG.add(rm);
    thrownRibbons[side] = rm;
  }

  // de-track state: 0 = healthy, 1 = thrown (band slumps, links sag)
  let brokenL = 0;
  let brokenR = 0;
  const tlY0 = tl.position.y, trY0 = tr.position.y;

  P.gear = {
    update(l, r) {
      for (const { im, list } of made) {
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.thrown) {
            // de-track scatter: this road wheel tore off — it lies leaning
            // on the ground just outboard/behind the running gear
            const side = e.x < 0 ? -1 : 1;
            _E.set(0.12, side * 0.5, side * 1.28);
            _q.setFromEuler(_E);
            _v.set(e.x + side * 0.9, e.r * 0.34, e.z - 0.75);
            _s.set(1, 1, 1);
            _m.compose(_v, _q, _s);
            im.setMatrixAt(i, _m);
            continue;
          }
          const scroll = e.x < 0 ? l : r;
          const bob = e.road ? Math.sin(scroll * 2.7 + e.i * 1.93) * 0.02 : 0;
          _q.setFromAxisAngle(_X, scroll / e.r);
          _v.set(e.x, e.y + bob + (e.off || 0), e.z);
          _s.set(1, 1, 1);
          _m.compose(_v, _q, _s);
          im.setMatrixAt(i, _m);
        }
        im.instanceMatrix.needsUpdate = true;
      }
      for (const sp of spinners) sp.mesh.rotation.x = (sp.side < 0 ? l : r) / sp.r;
      placeLinks(l, r);
      mats.trackTexL.offset.y = -(l / mats.trackLinkM) % 1;
      mats.trackTexR.offset.y = -(r / mats.trackLinkM) % 1;
    },

    /**
     * Per-wheel terrain conformance: sample the heightfield under every road
     * wheel and let it drop into hollows / ride bumps relative to the rigid
     * 4-corner hull plane. Smoothed per wheel — reads as suspension travel.
     * @param {object} state TankState (pos/yaw/visualPitch/visualRoll)
     * @param {(x:number, z:number) => number} sampler world ground height
     */
    conform(state, sampler) {
      const cb = Math.cos(state.yaw), sb = Math.sin(state.yaw);
      const ca = Math.cos(-state.visualPitch), sa = Math.sin(-state.visualPitch);
      const cr = Math.cos(state.visualRoll), sr = Math.sin(state.visualRoll);
      const px = state.pos.x, py = state.pos.y, pz = state.pos.z;
      for (const { list } of made) {
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!e.road) continue;
          // world position of the hull-plane point under this wheel (YXZ)
          const x1 = e.x * cr, y1 = e.x * sr, z1 = e.z;
          const y2 = y1 * ca - z1 * sa, z2 = y1 * sa + z1 * ca;
          const wx = px + x1 * cb + z2 * sb;
          const wy = py + y2;
          const wz = pz - x1 * sb + z2 * cb;
          const dev = sampler(wx, wz) - wy;
          // ±0.13 m travel, snappy response: wheels visibly drop into ruts
          // and ride crests instead of the r2 near-rigid ±7 cm creep
          const target = dev < -0.13 ? -0.13 : (dev > 0.13 ? 0.13 : dev);
          e.off += (target - e.off) * 0.45;
        }
      }
    },

    /**
     * De-track visual (r6 rubric item): the band SLUMPS hard off the wheels
     * (0.16 m drop + pitch, link pads riding it down via placeLinks), a
     * crumpled thrown-track ribbon appears draped off the rear wheel and
     * trailing on the ground, and the rearmost proud road wheel tears off
     * and lies leaning beside the hull. Fully restored on repair.
     * @param {'trackL'|'trackR'} module @param {boolean} broken
     */
    setBroken(module, broken) {
      const side = module === 'trackL' ? -1 : 1;
      if (side < 0) { brokenL = broken ? 1 : 0; tl.position.y = tlY0 - brokenL * 0.16; tl.rotation.x = brokenL * 0.045; }
      else { brokenR = broken ? 1 : 0; tr.position.y = trY0 - brokenR * 0.16; tr.rotation.x = -brokenR * 0.045; }
      if (thrownRibbons[side]) thrownRibbons[side].visible = !!broken;
      // rearmost PROUD road wheel on that side scatters (interleaved recessed
      // rows stay seated — the outer wheel is the one that visibly lets go)
      let pick = null;
      for (const e of entries) {
        if (!e.road || e.rec || (e.x < 0) !== (side < 0)) continue;
        if (!pick || e.z < pick.z) pick = e;
      }
      if (pick) pick.thrown = !!broken;
    },
  };
}

// ---------------------------------------------------------------------------
// Gun assembly (into the recoil group). cfg fractions are along barrel length.
// ---------------------------------------------------------------------------
function buildGun(P, cfg) {
  const { len, r, brake = null, sleeve = false, evac = null, collar = false, baseR = r * 1.9 } = cfg;
  const seg = P.q ? 28 : 12;
  const g = [];
  g.push(xform(cylZ(baseR, 0.55, seg, baseR * 1.15), 0, 0, 0.2));           // mantlet root / breech collar
  const bLen = brake ? len - 0.42 : len - 0.02;
  g.push(xform(cylZ(r, bLen - 0.4, seg, r * 1.25), 0, 0, 0.4 + (bLen - 0.4) / 2));
  if (sleeve) {
    for (const [f0, f1] of [[0.16, 0.46], [0.52, 0.82]]) {
      const sl = (f1 - f0) * len;
      g.push(xform(cylZ(r * 1.22, sl, seg), 0, 0, f0 * len + sl / 2));
      g.push(xform(cylZ(r * 1.3, 0.06, seg), 0, 0, f1 * len + 0.03));       // clamp ring
    }
  }
  if (evac !== null) {
    // Bore evacuator: a clearly readable tapered drum blended into the tube —
    // the single most identifying feature of a modern gun tube at closeup.
    const el = Math.max(0.62, len * 0.13);
    g.push(xform(cylZ(r * 1.62, el * 0.55, seg), 0, 0, evac * len));
    g.push(xform(cylZ(r * 1.62, el * 0.32, seg, r * 1.16), 0, 0, evac * len - el * 0.43));
    g.push(xform(cylZ(r * 1.16, el * 0.32, seg, r * 1.62), 0, 0, evac * len + el * 0.43));
  }
  if (collar) g.push(xform(cylZ(r * 1.35, 0.09, seg), 0, 0, len - 0.55));    // MRS collar
  if (brake) {
    // Two-chamber baffle brake, CAMO-PAINTED with the tube — crews painted
    // brakes with the vehicle, and the old bare-black drums at 1.75x tube
    // read as a rubber toy part (r5). Diameter held to ~1.35x the tube
    // (~2x bore on the 8.8 cm), with a visible slot between the chambers.
    const br = r * 1.35;
    g.push(xform(cylZ(r * 0.72, 0.62, seg), 0, 0, len - 0.31));              // core tube through the brake
    g.push(xform(cylZ(br * 0.9, 0.1, seg, r * 1.08), 0, 0, len - 0.52));     // tapered lead-in cone
    if (brake === 'double') {
      g.push(xform(cylZ(br, 0.15, seg), 0, 0, len - 0.37));                  // rear baffle chamber
      g.push(xform(cylZ(br, 0.16, seg), 0, 0, len - 0.10));                  // front baffle chamber
      g.push(xform(cylZ(br * 0.55, 0.05, seg), 0, 0, len - 0.005));          // exit washer
    } else if (brake === 'discs') {
      // Soviet D-25T style (r7 scale-up): the German-pattern double-baffle
      // brake — two LARGE disc baffles at ~2x the tube diameter with a wide
      // open slot between them, on a visibly thinner core. The r6 1.58x discs
      // read as a slightly fat collar and the critic called the muzzle bare.
      const dr = r * 2.05;
      g.push(xform(cylZ(r * 0.62, 0.62, seg), 0, 0, len - 0.31));            // thin core through the brake
      g.push(xform(cylZ(dr * 0.82, 0.09, seg, r * 1.05), 0, 0, len - 0.56)); // tapered lead-in cone
      g.push(xform(cylZ(dr, 0.10, seg), 0, 0, len - 0.44));                  // rear disc baffle
      g.push(xform(cylZ(dr * 0.96, 0.10, seg), 0, 0, len - 0.16));           // front disc baffle
      g.push(xform(cylZ(dr * 0.52, 0.13, seg), 0, 0, len - 0.06));           // exit block
      g.push(xform(box(0.06, dr * 1.35, 0.44), 0, 0, len - 0.30));           // vertical web tying the discs
    } else {
      g.push(xform(cylZ(br, 0.2, seg), 0, 0, len - 0.13));
      g.push(xform(cylZ(br * 0.5, 0.05, seg), 0, 0, len - 0.005));
    }
  }
  for (const geo of g) P.add('gun', geo);
  P.muzzleZ = len;
}

// ---------------------------------------------------------------------------
// Small shared detail assemblies
// ---------------------------------------------------------------------------
function cupola(P, bucket, x, y, z, r, h, periscopes = 6) {
  const cs = P.q ? 22 : 10;
  const darkB = bucket === 'turret' ? 'turretDark' : 'hullDark';
  const glassB = bucket === 'turret' ? 'turretGlass' : 'hullGlass';
  P.add(bucket, cylY(r, r * 1.06, h, cs), x, y + h / 2, z);
  P.add(bucket, cylY(r * 0.92, r * 0.92, 0.04, cs), x, y + h + 0.02, z);
  // split-hatch lid seam + hinge blocks
  P.add(darkB, box(r * 1.7, 0.015, 0.03), x, y + h + 0.045, z);
  P.add(bucket, box(0.07, 0.045, 0.1), x + r * 0.85, y + h + 0.02, z);
  P.add(bucket, box(0.07, 0.045, 0.1), x - r * 0.85, y + h + 0.02, z);
  if (P.q) {
    for (let k = 0; k < periscopes; k++) {
      const a = (k / periscopes) * Math.PI * 2;
      P.add(darkB, box(0.07, 0.05, 0.05),
        x + Math.sin(a) * r * 0.8, y + h + 0.03, z + Math.cos(a) * r * 0.8, 0, a, 0);
      P.add(glassB, box(0.05, 0.026, 0.052),
        x + Math.sin(a) * r * 0.8, y + h + 0.035, z + Math.cos(a) * r * 0.8, 0, a, 0);
    }
  }
}

// Headlight: armored drum + glass lens face (lens offset baked pre-rotation).
function headlight(P, x, y, z, rx = 0, r = 0.055) {
  P.add('hullDetail', cylZ(r, r * 1.35, 12), x, y, z, rx, 0, 0);
  P.add('hullGlass', xform(cylZ(r * 0.8, 0.02, 12), 0, 0, r * 0.72), x, y, z, rx, 0, 0);
  P.add('hullDark', xform(box(0.02, r * 2.3, 0.02), 0, 0, r * 0.5), x, y, z, rx, 0, 0); // brush guard rib
}

// Lifting eye: small torus stood on a foot plate.
function liftEye(P, bucket, x, y, z, ry = 0) {
  P.add(bucket, xform(torus(0.045, 0.016, 12), 0, 0.04, 0, Math.PI / 2, 0, 0), x, y, z, 0, ry, 0);
  P.add(bucket, box(0.09, 0.03, 0.06), x, y - 0.01, z, 0, ry, 0);
}

// Fixed periscope block with glass slit (driver / roof optics).
function periscope(P, bucket, x, y, z, ry = 0) {
  P.add(bucket, box(0.14, 0.07, 0.1), x, y, z, 0, ry, 0);
  const glassB = bucket.startsWith('turret') ? 'turretGlass' : 'hullGlass';
  P.add(glassB, box(0.11, 0.028, 0.102), x, y + 0.012, z, 0, ry, 0);
}

function pintleMG(P, x, y, z, big = true) {
  const s = big ? 1 : 0.75;
  P.add('turretDark', cylY(0.02 * s, 0.02 * s, 0.22), x, y + 0.11, z);
  P.add('turretDark', box(0.09 * s, 0.09 * s, 0.5 * s), x, y + 0.27, z);
  P.add('turretDark', xform(cylZ(0.022 * s, 0.62 * s, 8), 0, 0, 0), x, y + 0.29, z + 0.5 * s, -0.08, 0, 0);
  if (big) P.add('turretDark', box(0.16, 0.05, 0.12), x, y + 0.2, z - 0.28);
}

function smokeCluster(P, x, y, z, n, yaw, arc = 0.5) {
  for (let k = 0; k < n; k++) {
    const f = k - (n - 1) / 2;
    const a = yaw + f * (arc / n);
    const dx = Math.cos(yaw) * f * 0.095, dz = -Math.sin(yaw) * f * 0.095;
    P.add('turretDetail', cylZ(0.038, 0.24, 8), x + dx, y, z + dz, -0.5, a, 0);
  }
}

function towCable(P, pts, r = 0.022) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  P.add('hullDark', new THREE.TubeGeometry(curve, P.q ? 20 : 10, r, 6, false));
}

function fenders(P, xInner, xOuter, y, z0, z1, th = 0.035) {
  const w = xOuter - xInner, xm = (xInner + xOuter) / 2;
  P.add('hull', box(w, th, z1 - z0), xm, y, (z0 + z1) / 2);
  P.add('hull', box(w, th, z1 - z0), -xm, y, (z0 + z1) / 2);
}

function stowage(P, bucket, rng, spots) {
  for (const [x, y, z, w, h, d] of spots) {
    P.add(bucket, box(w, h, d), x, y, z, 0, (rng() - 0.5) * 0.12, 0);
  }
}

// ---- procedural prop kit (stowage clutter at canonical locations) ----------
function jerryCan(P, bucket, x, y, z, yaw = 0) {
  P.add(bucket, box(0.16, 0.46, 0.34), x, y, z, 0, yaw, 0);
  P.add(bucket, box(0.04, 0.06, 0.12), x, y + 0.26, z, 0, yaw, 0);   // handles
}
function tarpRoll(P, bucket, x, y, z, len, r = 0.1, alongX = true, seg = 10) {
  P.add(bucket, alongX ? cylX(r, len, seg) : cylZ(r, len, seg), x, y, z);
  const dark = bucket.startsWith('turret') ? 'turretDark' : 'hullDark';
  for (const f of [-0.3, 0.3]) {
    P.add(dark, alongX
      ? xform(cylX(r * 1.06, 0.03, seg), 0, 0, 0)
      : xform(cylZ(r * 1.06, 0.03, seg), 0, 0, 0),
      x + (alongX ? f * len : 0), y, z + (alongX ? 0 : f * len));    // straps
  }
}
function ammoCan(P, bucket, x, y, z, yaw = 0) {
  P.add(bucket, box(0.14, 0.2, 0.3), x, y, z, 0, yaw, 0);
}
function shovelTool(P, x, y, z, len = 0.95) {
  P.add('hullWood', box(0.035, 0.025, len), x, y, z);
  P.add('hullDark', box(0.11, 0.03, 0.22), x, y, z + len * 0.55);
}
function spareTrackStrip(P, bucket, x, y, z, links, rx = 0, ry = 0) {
  // stack of individual link slabs so the strip reads segmented — worn track
  // steel (trackLink material), never flat blockout black (r5)
  const steel = bucket.startsWith('turret') ? 'turretTrack' : 'hullTrack';
  for (let k = 0; k < links; k++) {
    P.add(steel, box(0.5, 0.045, 0.15), x, y, z + (k - (links - 1) / 2) * 0.165, rx, ry, 0);
    P.add(steel, box(0.44, 0.06, 0.05), x, y + 0.02, z + (k - (links - 1) / 2) * 0.165, rx, ry, 0);
  }
}

// ===========================================================================
// Per-tank builders
// ===========================================================================

function buildM4A3E8(P) {
  const { rng } = P;
  // hull
  P.add('hull', box(1.9, 0.67, 5.75), 0, 0.765, -0.125);                        // lower hull
  P.add('hull', frustum(1.5, 3.02, -3.13, 1.5, 2.10, -3.13, 1.10, 1.93));       // sponson + 47° glacis
  // r7: the rounded cast transmission nose is a PRIMARY Sherman recognition
  // feature — bigger capsule + the 3-piece bolted flange joints across it.
  P.add('hull', cylX(0.50, 2.7, P.q ? 28 : 12), 0, 0.86, 2.74);                 // cast transmission nose
  for (const s of [-0.7, 0.7]) {
    P.add('hull', xform(cylX(0.515, 0.055, P.q ? 26 : 12), s, 0, 0), 0, 0.86, 2.74); // bolted flange rings
  }
  P.add('hull', box(1.9, 0.4, 0.5), 0, 0.63, 2.5);
  // rear plate furniture (r6: "huge featureless rear plate"): exhaust
  // deflector shelf, dark grille under it, taillights and a jack block
  P.add('hull', box(1.7, 0.10, 0.55), 0, 0.62, -3.12, 0.5, 0, 0);               // exhaust deflector
  P.add('hullDark', box(1.3, 0.26, 0.06), 0, 0.86, -3.02);                      // grille
  for (const s of [-1, 1]) P.add('hullDark', box(0.14, 0.07, 0.05), s * 1.15, 1.5, -3.16);
  P.add('hullWood', box(0.3, 0.14, 0.2), -0.9, 1.06, -3.1);                     // jack block
  fenders(P, 0.92, 1.5, 1.13, -3.1, 3.05);
  // rear deck hatches + grilles
  P.add('hull', box(0.62, 0.05, 0.8), -0.4, 1.955, -2.3);
  P.add('hull', box(0.62, 0.05, 0.8), 0.4, 1.955, -2.3);
  if (P.q) for (let k = 0; k < 5; k++) P.add('hullDark', box(1.2, 0.02, 0.06), 0, 1.965, -1.5 - k * 0.14);
  // glacis details: headlights, siren, spare tracks, lifting eyes
  headlight(P, -0.55, 1.72, 2.36, -0.82);
  headlight(P, 0.55, 1.72, 2.36, -0.82);
  P.add('hullDetail', cylY(0.05, 0.06, 0.08, 10), 0, 1.7, 2.4);
  liftEye(P, 'hullDetail', -0.95, 1.6, 2.5);
  liftEye(P, 'hullDetail', 0.95, 1.6, 2.5);
  // .30cal bow MG ball mount (right of driver) + twin hatch bulges at the
  // glacis top edge — the bare plate read as a blockout (r6 critique)
  P.add('hull', sph(0.13, P.q ? 18 : 10), 0.55, 1.48, 2.62);
  P.add('hullDark', cylZ(0.028, 0.3, 8), 0.55, 1.51, 2.78, -0.2, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.5, 0.09, 0.55), s * 0.55, 1.94, 1.95, -0.35, 0, 0);   // hatch bulge
    P.add('hull', cylY(0.19, 0.19, 0.05, 12), s * 0.55, 2.0, 1.9);            // hatch lid
  }
  periscope(P, 'hullDetail', -0.55, 1.96, 1.7);
  periscope(P, 'hullDetail', 0.55, 1.96, 1.7);
  P.add('hullTrack', box(0.5, 0.05, 0.24), -0.6, 1.42, 2.72, -0.82, 0, 0);      // spare track links
  towCable(P, [[-1.1, 1.62, 2.28], [-0.5, 1.4, 2.62], [0.5, 1.4, 2.62], [1.1, 1.62, 2.28]]);
  stowage(P, 'hullCloth', rng, [[-1.25, 2.03, -1.0, 0.4, 0.18, 1.2], [1.25, 2.03, -0.6, 0.4, 0.2, 1.6]]);
  P.add('hullDetail', box(0.06, 0.5, 0.06), -1.35, 2.2, -2.9);                  // antenna base
  // turret (T23): one smooth cast lathe body — flared base, curved walls
  // rolling into the roof — instead of stacked cylinder slices
  P.add('turret', lathe([
    [0.84, 0.0], [0.86, 0.06], [0.84, 0.2], [0.80, 0.38], [0.76, 0.52],
    [0.70, 0.62], [0.56, 0.67], [0.30, 0.695], [0.0, 0.70],
  ], P.q ? 30 : 14, 1.18));
  P.add('turret', box(1.0, 0.5, 0.7), 0, 0.28, -0.95);                          // bustle
  liftEye(P, 'turretDetail', -0.55, 0.62, 0.35);
  liftEye(P, 'turretDetail', 0.55, 0.62, 0.35);
  cupola(P, 'turret', 0.42, 0.67, -0.25, 0.23, 0.15);
  P.add('turret', cylY(0.21, 0.21, 0.05, 10), -0.42, 0.69, -0.3);               // loader hatch
  pintleMG(P, 0.42, 0.72, -0.62);
  P.add('turretDetail', box(0.05, 0.05, 0.3), 0.35, 0.4, 0.72);                 // coax MG stub
  P.add('turretDetail', box(0.06, 0.8, 0.06), 0.6, 1.0, -1.15, 0, 0, 0.15);     // antenna
  // wide flat mantlet moves with the gun
  P.addGunExtra(box(1.28, 0.55, 0.15), 0, 0, 0.28);
  buildGun(P, { len: 3.96, r: 0.07, brake: 'single' });
  buildRunningGear(P, {
    // r7: wheels up to the real ~0.66 m HVSS diameter (0.29 read toy-small)
    style: 'rubber', wheelR: 0.33, wheelW: 0.13, xc: 1.21,
    wheelZs: [2.32, 1.48, 0.62, -0.22, -1.08, -1.92],
    layers: [[-0.105, 0.105]],
    sprocket: { z: 2.85, y: 0.46, r: 0.34 }, idler: { z: -2.85, y: 0.44, r: 0.32 },
    rollers: [1.05, 0.2, -0.65, -1.5, -2.3].map((z) => ({ z, y: 1.02, r: 0.08 })),
    trackW: 0.58, topY: 1.1,
  });
  // HVSS bogies (r7 rebuild): each bogie is ONE connected assembly — hull
  // bracket, inner+outer arm plates tying BOTH wheel hubs of the station
  // pair, hub cross-shafts, and the horizontal volute spring pack lying
  // across the bracket top (r6: floating slabs above six separate drums).
  for (const [zc, z0, z1] of [[1.9, 2.32, 1.48], [0.2, 0.62, -0.22], [-1.5, -1.08, -1.92]]) {
    for (const s of [-1, 1]) {
      P.add('hullDetail', box(0.24, 0.34, 0.66), s * 1.16, 0.66, zc);           // hull bracket
      P.add('hullDetail', box(0.06, 0.17, 1.34), s * 1.40, 0.43, zc);           // outer arm plate
      P.add('hullDetail', box(0.06, 0.17, 1.34), s * 1.03, 0.43, zc);           // inner arm plate
      P.add('hullDetail', cylX(0.06, 0.42, 8), s * 1.21, 0.43, z0);             // hub cross-shafts
      P.add('hullDetail', cylX(0.06, 0.42, 8), s * 1.21, 0.43, z1);
      P.add('hullDark', cylZ(0.095, 0.62, 10), s * 1.21, 0.89, zc);             // volute spring pack
      P.add('hullDetail', box(0.2, 0.08, 0.46), s * 1.21, 0.83, zc);            // spring seat
    }
  }
  P.decal('hull', 'star', null, 0.55, [1.51, 1.5, 0.6], Math.PI / 2);
  P.decal('hull', 'star', null, 0.55, [-1.51, 1.5, 0.6], -Math.PI / 2);
  P.decal('turret', 'number', '12', 0.3, [0.87, 0.32, -0.4], Math.PI / 2);
  P.decal('hull', 'number', '3070512', 0.5, [1.51, 1.45, -1.8], Math.PI / 2);
  P.topY = 0.72;
}

function buildTiger(P) {
  const { rng } = P;
  P.add('hull', box(2.26, 0.68, 6.32), 0, 0.81, 0);                             // lower hull
  // ONE continuous overhanging superstructure box reaching down to the track
  // top run — the real Tiger side is a single flat plate from deck to tracks,
  // never a stack of stepped slabs (r3 silhouette critique). Front face pulled
  // back to 2.56 so the bow reads as THREE distinct plates (r5): 24° nose ->
  // near-horizontal glacis shelf -> 9°-leaning full-width driver plate that
  // stands proud of the superstructure with the fender line running under it.
  P.add('hull', box(3.71, 0.91, 5.72), 0, 1.505, -0.30);
  P.add('hull', frustum(1.5, 2.92, 2.7, 1.5, 3.16, 2.7, 0.47, 0.95));           // nose plate (24°)
  P.add('hull', frustum(1.855, 3.16, 2.5, 1.855, 2.68, 2.5, 0.95, 1.07));       // glacis shelf (~78°)
  P.add('hull', frustum(1.855, 2.68, 2.5, 1.855, 2.62, 2.5, 1.07, 1.96));       // driver plate (9°)
  // sponson underside AO: dark occluded ceiling above the track run (r5)
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.7, 0.026, 5.7), s * 1.49, 1.032, -0.30);
  }
  // full-length mudguards AT THE SPONSON LINE with a shadow gap over the
  // tracks — the missing fender line was flagged as "cardboard hull" (r5)
  fenders(P, 1.16, 1.95, 1.09, -3.16, 3.16, 0.045);
  for (const z of [3.11, -3.11]) {                                              // flared fender tips
    P.add('hull', box(0.79, 0.04, 0.12), 1.555, 1.13, z, z > 0 ? -0.5 : 0.5, 0, 0);
    P.add('hull', box(0.79, 0.04, 0.12), -1.555, 1.13, z, z > 0 ? -0.5 : 0.5, 0, 0);
  }
  // bow MG ball mount: hemispherical ball + MG stub in a bolted collar plate,
  // ball and collar painted in the hull scheme (only the MG muzzle is steel)
  P.add('hull', sph(0.14, P.q ? 22 : 12), 0.55, 1.62, 2.72);
  P.add('hullDark', cylZ(0.032, 0.3, 8), 0.55, 1.62, 2.88);
  P.add('hull', cylZ(0.19, 0.05, P.q ? 22 : 12), 0.55, 1.62, 2.67);
  // driver's visor block: scheme-painted armored slab, dark slit only
  P.add('hull', box(0.56, 0.22, 0.1), -0.5, 1.62, 2.72);
  P.add('hullDark', box(0.42, 0.05, 0.04), -0.5, 1.59, 2.77);
  P.add('hull', box(0.56, 0.06, 0.14), -0.5, 1.72, 2.73);
  // TWO shrouded exhaust stacks on the rear plate (the extra Feifel-canister
  // pipes made the rear read as four organ pipes — r6 critique): fat muffler
  // drum low, sheet-metal shroud box around it, short dark tip above.
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.13, 0.14, 0.72, 12), s * 0.55, 1.95, -3.26);   // muffler drum
    P.add('hull', box(0.36, 0.55, 0.16), s * 0.55, 1.85, -3.30);              // sheet-metal shroud
    P.add('hull', box(0.36, 0.06, 0.20), s * 0.55, 2.15, -3.28);              // shroud cap lip
    P.add('hullDark', cylY(0.075, 0.085, 0.28, 10), s * 0.55, 2.42, -3.26);   // soot-black tip
  }
  headlight(P, 0, 1.14, 2.95, -0.55);                                           // headlight, center glacis
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.045, 0.045, 0.12, 10), s * 1.7, 2.0, 2.44); // S-mine stubs
  liftEye(P, 'hullDetail', -1.5, 2.02, 2.4);
  liftEye(P, 'hullDetail', 1.5, 2.02, 2.4);
  periscope(P, 'hullDetail', -0.5, 1.98, 2.3);                                  // driver roof periscope
  towCable(P, [[-1.7, 1.9, -2.2], [-1.82, 1.95, 0], [-1.7, 1.9, 2.3]]);
  towCable(P, [[1.7, 1.9, -2.2], [1.82, 1.95, 0], [1.7, 1.9, 2.3]]);
  // spare links hung on the driver plate in a hull-color mounting frame —
  // worn track steel, seated instead of floating black boxes (r5)
  P.add('hull', box(0.62, 0.5, 0.04), 0.85, 1.30, 2.68);                        // mounting frame
  for (let k = 0; k < 3; k++) {
    P.add('hullTrack', box(0.16, 0.44, 0.05), 0.64 + k * 0.21, 1.30, 2.71);
    P.add('hullTrack', box(0.05, 0.13, 0.07), 0.64 + k * 0.21, 1.30, 2.72);
  }
  // pioneer tools + jack on the deck (the Tiger carried its toolbox outside)
  shovelTool(P, 1.05, 2.0, 1.4);
  shovelTool(P, -1.05, 2.0, 0.2, 0.8);
  P.add('hullWood', box(0.03, 0.03, 1.15), -1.45, 2.0, 1.0);                    // axe/pry bar
  P.add('hullDark', box(0.1, 0.05, 0.28), -1.45, 2.0, 1.65);
  P.add('hullDark', box(0.5, 0.14, 0.2), 1.35, 2.05, -2.35);                    // 20t jack
  P.add('hullWood', box(0.28, 0.12, 0.34), 1.0, 2.03, -2.7);                    // jack block
  P.add('hullDetail', cylZ(0.06, 0.4, 8), -0.95, 2.0, 2.25);                    // fire extinguisher
  P.add('hullDark', box(0.6, 0.1, 0.14), 0.15, 2.0, -0.9);                      // wire cutters / crank
  spareTrackStrip(P, 'hull', 1.55, 1.98, 0.0, 3);                               // deck-edge spare links
  // turret: the iconic horseshoe — ONE extruded profile: flat front plate,
  // straight parallel side walls, continuous semicircular rear. Widened to
  // ~2.5m so it no longer reads as a toy turret on the 3.7m hull (r3).
  const TW = 1.26, TH = 0.80, tZF = 0.62, tZR = -0.52;
  const horseshoe = new THREE.Shape();
  horseshoe.moveTo(-TW, -tZF);
  horseshoe.lineTo(TW, -tZF);
  horseshoe.lineTo(TW, -tZR);
  horseshoe.absarc(0, -tZR, TW, 0, Math.PI, false);
  horseshoe.closePath();
  const hsSeg = P.q ? 44 : 18;
  P.add('turret', new THREE.ExtrudeGeometry(horseshoe,
    { depth: TH, bevelEnabled: false, curveSegments: hsSeg }), 0, 0, 0, -Math.PI / 2, 0, 0);
  P.add('turret', new THREE.ExtrudeGeometry(horseshoe,                          // overhanging roof plate
    { depth: 0.045, bevelEnabled: false, curveSegments: hsSeg }),
    0, TH, 0, -Math.PI / 2, 0, 0, [0.985, 0.985, 1]);
  // drum cupola with vision slits (left) + loader hatch (right)
  cupola(P, 'turret', -0.62, TH + 0.04, -0.48, 0.3, 0.24, 5);
  P.add('turret', cylY(0.21, 0.21, 0.05, 12), 0.55, TH + 0.06, -0.55);
  P.add('turret', sph(0.11, 14, Math.PI / 2), 0.05, TH + 0.03, 0.1);            // ventilator dome
  liftEye(P, 'turretDetail', -0.9, TH + 0.05, -0.9);
  liftEye(P, 'turretDetail', 0.9, TH + 0.05, -0.9);
  P.add('turretDark', box(0.1, 0.1, 0.3), TW - 0.04, 0.55, -0.2, 0, 0.35, 0);   // side pistol port
  // spare track links hung on the turret side walls (late-war signature) —
  // worn track steel with a scheme-painted hanger rail, not blockout black
  for (const s of [-1, 1]) {
    P.add('turret', box(0.03, 0.06, 0.72), s * (TW + 0.01), 0.58, -0.30);       // hanger rail
    for (let k = 0; k < 3; k++) {
      P.add('turretTrack', box(0.05, 0.44, 0.16), s * (TW + 0.02), 0.34, -0.10 - k * 0.20);
      P.add('turretTrack', box(0.11, 0.13, 0.05), s * (TW + 0.05), 0.34, -0.10 - k * 0.20);
    }
  }
  // rear Gepaeckkasten stowage bin
  P.add('turret', box(2.0, 0.42, 0.48), 0, 0.42, -1.98);
  P.add('turret', box(1.84, 0.08, 0.4), 0, 0.66, -1.98);                        // domed lid
  for (const s of [-0.62, 0.62]) P.add('turretDark', box(0.03, 0.46, 0.5), s, 0.42, -1.98); // straps
  // full-width flat mantlet with trunnion roller + coax MG + binocular sight holes
  P.addGunExtra(box(2.2, 0.74, 0.2), 0, 0, 0.2);
  P.addGunExtra(cylX(0.18, 1.05, P.q ? 26 : 12), 0, 0, 0.34);
  P.addGunExtra(cylZ(0.17, 0.34, P.q ? 22 : 10), 0, 0, 0.46);
  P.addGunExtraDark(cylZ(0.035, 0.14, 8), 0.34, -0.06, 0.36);                   // coax MG hole
  P.addGunExtraDark(cylZ(0.03, 0.12, 8), -0.32, 0.14, 0.36);                    // TZF9b sight L
  P.addGunExtraDark(cylZ(0.03, 0.12, 8), -0.44, 0.14, 0.36);                    // TZF9b sight R
  // 8.8cm L/56: muzzle at ~5.3m from hull center = 8.45m overall (the old
  // 4.93m tube read as the Tiger II's L/71 — r3 gun critique)
  buildGun(P, { len: 4.5, r: 0.085, brake: 'double' });
  // Schachtellaufwerk: 16 axles/side at half pitch cycling through THREE
  // interleave rows (proud / recessed / middle, >=0.13 m between rows) — the
  // recessed rows render with the shadowed wheel material and a near-black AO
  // wall sits behind the stack so the layers read as depth (r5 hard gate).
  // Sprocket/idler raised + enlarged for a readable front wrap and rear rise.
  // r6 wheel density: 0.44 m radius (real 0.8 m dia wheels nearly touch along
  // the proud row), middle row pulled forward to 0.10 so it renders in scheme
  // paint, and only the deepest row takes the shadowed material — the old
  // 0.4 m wheels left black gaps that read as missing wheels at closeup.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.44, wheelW: 0.12, xc: 1.42,
    wheelZs: [2.55, 2.21, 1.87, 1.53, 1.19, 0.85, 0.51, 0.17,
      -0.17, -0.51, -0.85, -1.19, -1.53, -1.87, -2.21, -2.55],
    layers: [[0.22], [-0.02], [0.10]],
    sprocket: { z: 2.92, y: 0.52, r: 0.42 }, idler: { z: -2.92, y: 0.50, r: 0.38 },
    trackW: 0.725, trackTh: 0.13, topY: 0.97,
  });
  stowage(P, 'hullCloth', rng, [[0, 2.02, -2.6, 1.6, 0.16, 0.7]]);
  tarpRoll(P, 'hullCloth', -1.5, 2.06, -1.6, 1.0, 0.09, false);
  jerryCan(P, 'hullCloth', 1.62, 2.06, -1.4, 0.1);
  jerryCan(P, 'hullCloth', 1.62, 2.06, -1.05, -0.06);
  P.decal('hull', 'cross', null, 0.5, [1.86, 1.6, 0.8], Math.PI / 2);
  P.decal('hull', 'cross', null, 0.5, [-1.86, 1.6, 0.8], -Math.PI / 2);
  P.decal('turret', 'number', '212', 0.42, [1.3, 0.42, 0.3], Math.PI / 2);
  P.decal('turret', 'number', '212', 0.42, [-1.3, 0.42, 0.3], -Math.PI / 2);
  // exhaust soot streaking up the rear plate behind both stacks
  P.decal('hull', 'soot', null, 0.85, [0.5, 1.75, -3.18], Math.PI);
  P.decal('hull', 'soot', null, 0.85, [-0.5, 1.75, -3.18], Math.PI);
  P.topY = 1.05;
}

function buildT34(P) {
  const { rng } = P;
  P.add('hull', box(2.0, 0.65, 5.4), 0, 0.725, -0.15);                          // lower hull
  // r8 upper-hull rework: the r7 frustum's top ring overhung the bottom at
  // the rear (top -2.9 vs bottom -2.55), reading as a raised hopper over the
  // engine deck. Roof now ends FORWARD of the hull rear and a proper 47°
  // sloping rear plate closes the hull down to the lower box.
  P.add('hull', frustum(1.45, 2.95, -2.62, 0.96, 1.30, -2.08, 0.7, 1.70));      // all-sloped upper hull
  P.add('hull', frustum(1.45, 2.55, 2.2, 1.45, 2.95, 2.2, 0.4, 0.7));           // lower glacis wedge
  P.add('hull', box(0.5, 0.06, 0.45), -0.5, 1.44, 2.06, -1.05, 0, 0);           // driver hatch on glacis
  P.add('hullDetail', sph(0.08, 10), 0.5, 1.35, 2.24);                          // bow MG ball
  fenders(P, 1.0, 1.5, 1.09, -3.0, 3.0, 0.03);
  // rear: round transmission hatch ON the sloping rear plate + deck louvers
  P.add('hull', xform(cylY(0.30, 0.30, 0.06, P.q ? 18 : 12), 0, 0, 0), 0, 1.17, -2.385, -1.08, 0, 0);
  P.add('hullDark', xform(torus(0.30, 0.014, P.q ? 18 : 12), 0, 0, 0), 0, 1.185, -2.375, -1.08, 0, 0);
  if (P.q) for (let k = 0; k < 5; k++) {
    P.add('hullDark', box(1.5, 0.018, 0.09), 0, 1.705, -1.15 - k * 0.17);       // radiator louvers on roof
  }
  P.add('hullDetail', box(1.55, 0.03, 0.95), 0, 1.70, -1.5);                    // engine access deck plate
  // fuel drums LYING along the sloped rear hull flanks (r8 — the r7 near-
  // vertical drums poked above the deck like water heaters)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.155, 0.155, 0.88, 12), s * 1.22, 1.10, -2.35, -0.95, 0, s * 0.12);
    P.add('hullDark', box(0.03, 0.32, 0.02), s * 1.22, 1.12, -2.32);            // retaining strap
  }
  // handrails
  for (const s of [-1, 1]) {
    towCable(P, [[s * 1.28, 1.35, 1.2], [s * 1.3, 1.42, 0.0], [s * 1.28, 1.35, -1.4]], 0.018);
  }
  stowage(P, 'hullDetail', rng, [[-1.2, 1.2, 0.6, 0.35, 0.25, 1.1]]);
  headlight(P, -0.62, 1.5, 2.1, -1.0);                                          // single left headlight
  liftEye(P, 'hullDetail', -1.15, 1.62, 1.15);
  liftEye(P, 'hullDetail', 1.15, 1.62, 1.15);
  // r8 turret scale-up: the r7 hex cast was an undersized bowl (0.60 m tall
  // on a 2.72 m-height spec — the Wei He CAD three tiles away beat it).
  // Fat hexagonal cast turret at real proportions: ~2.1 m plan width,
  // 0.88 m tall, roof furniture riding the new roof plane.
  P.add('turret', polyTurret([
    [0.40, 0.97], [0.92, 0.51], [1.06, 0.05], [0.80, -0.55], [0.38, -0.85],
    [-0.38, -0.85], [-0.80, -0.55], [-1.06, 0.05], [-0.92, 0.51], [-0.40, 0.97],
  ], 0.88, 1.10, 0.76), 0, 0, 0.02);
  P.add('turret', box(0.95, 0.40, 0.36), 0, 0.26, -0.98);                       // rear bustle overhang
  for (const z of [-0.30, -0.54]) P.add('turret', sph(0.13, 12, Math.PI / 2), 0, 0.88, z); // mushroom vents
  cupola(P, 'turret', -0.40, 0.87, 0.05, 0.23, 0.19, 5);
  P.add('turretDetail', box(0.12, 0.08, 0.12), 0.38, 0.91, 0.24);               // gunner periscope
  P.add('turret', box(0.36, 0.04, 0.55), 0.34, 0.895, -0.15);                   // flat roof plate seam
  for (const s of [-1, 1]) {
    towCable(P, [[s * 0.90, 0.40, 0.45], [s * 0.99, 0.46, -0.1], [s * 0.88, 0.40, -0.58]], 0.016);
  }
  // Mantlet group seated proud of the hex face (r7 — the r6 collar sat buried
  // inside the casting and the 85 mm emerged from a bare pencil collar): a
  // broad bolted collar, the rounded cast rocking block over it, and the
  // narrow S-53 rocking plate with a tapered root sleeve.
  P.addGunExtra(box(0.86, 0.64, 0.34), 0, 0.02, 0.44);                          // bolted collar
  P.addGunExtra(xform(cylX(0.31, 0.68, 12), 0, 0, 0), 0, 0.05, 0.62);           // cast rocking block
  P.addGunExtra(box(0.44, 0.50, 0.24), 0, 0, 0.74);                             // inner mantlet plate
  P.addGunExtra(cylZ(0.135, 0.6, 12, 0.165), 0, 0, 0.96);                       // tapered gun root sleeve
  P.addGunExtraDark(cylZ(0.028, 0.1, 8), 0.26, 0.1, 0.66);                      // sight port
  buildGun(P, { len: 4.64, r: 0.075 });
  buildRunningGear(P, {
    style: 'holes', wheelR: 0.415, wheelW: 0.2, xc: 1.25,
    wheelZs: [2.28, 1.2, 0.38, -0.44, -1.26],
    sprocket: { z: -2.7, y: 0.5, r: 0.32 }, idler: { z: 2.72, y: 0.48, r: 0.3 },
    trackW: 0.5, topY: 1.0, arms: true,
  });
  P.decal('turret', 'number', '312', 0.42, [0.99, 0.42, -0.12], Math.PI / 2, 0, 0.30);
  P.decal('turret', 'number', '312', 0.42, [-0.99, 0.42, -0.12], -Math.PI / 2, 0, -0.30);
  P.topY = 1.10;
}

function buildIS2(P) {
  const { rng } = P;
  P.add('hull', box(1.8, 0.65, 5.72), 0, 0.775, 0.05);                          // lower hull
  // r7 hull rework: the sponson band starts at the FENDER LINE (1.22), not at
  // the track top — the full-height 1.10-1.80 slab wall read as a German
  // sponson barn. A dark AO ceiling closes the gap over the track run.
  P.add('hull', frustum(1.545, 1.85, -2.85, 1.42, 1.85, -2.85, 1.22, 1.80));    // sponson slab
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.62, 0.026, 4.7), s * 1.23, 1.205, -0.5);
  }
  // 60° upper glacis with a PLAN TAPER to the prow — the model-1944
  // "straightened nose" narrows toward the bow instead of running the full
  // hull width (r7: full-width glacis + slab sides read as a barn).
  P.add('hull', slab(
    [-1.06, 0.95, 3.30], [1.06, 0.95, 3.30], [1.45, 0.95, 1.90], [-1.45, 0.95, 1.90],
    [-0.98, 1.80, 1.83], [0.98, 1.80, 1.83], [1.42, 1.80, 1.86], [-1.42, 1.80, 1.86]));
  P.add('hull', slab(                                                            // 30° lower glacis, tapered
    [-0.96, 0.45, 3.01], [0.96, 0.45, 3.01], [1.30, 0.45, 2.35], [-1.30, 0.45, 2.35],
    [-1.06, 0.95, 3.30], [1.06, 0.95, 3.30], [1.45, 0.95, 1.95], [-1.45, 0.95, 1.95]));
  P.add('hull', frustum(1.4, -2.86, -2.86, 1.4, -3.38, -3.0, 1.2, 1.8));        // sloped rear
  P.add('hull', box(0.3, 0.12, 0.3), 0, 1.85, 1.6);                             // driver periscope hump
  fenders(P, 0.9, 1.545, 1.24, -3.35, 3.2, 0.03);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.35, 0.25, 1.0), s * 1.25, 1.95, -1.6);            // flat fuel tanks
    P.add('hullDetail', cylY(0.16, 0.16, 0.8, 12), s * 1.3, 1.42, -2.9, 0, 0, s * 0.25); // drums
    // sawtooth fender tips (front + rear) — Soviet ID detail
    P.add('hull', box(0.62, 0.03, 0.3), s * 1.22, 1.25, 3.28, -0.28, 0, 0);
    P.add('hull', box(0.62, 0.03, 0.28), s * 1.22, 1.25, -3.32, 0.28, 0, 0);
  }
  towCable(P, [[-1.5, 1.75, -2.0], [-1.58, 1.8, 0.2], [-1.5, 1.75, 2.2]]);
  towCable(P, [[1.5, 1.75, -2.0], [1.58, 1.8, 0.2], [1.5, 1.75, 2.2]]);
  P.add('hullTrack', box(0.6, 0.05, 0.3), -0.6, 1.35, 3.05, -1.05, 0, 0);       // spare links on glacis
  // r7 turret rebuild: flattened ELONGATED cast turret — a low wide frustum
  // skirt flowing into a shallow domed roof, egg-shaped in plan and clearly
  // longer than tall, with the rear bustle overhanging the ring. The old
  // hemispherical beach-ball dome failed every IS-2 silhouette check.
  P.add('turret', xform(lathe([
    [0.97, 0.0], [0.96, 0.10], [0.92, 0.22], [0.84, 0.34], [0.73, 0.44],
    [0.60, 0.52], [0.44, 0.575], [0.24, 0.605], [0.0, 0.62],
  ], P.q ? 32 : 14, 1.32), 0, 0, -0.10));
  // rear bustle: cast overhang box with a rounded lower chamfer + pistol port
  P.add('turret', box(1.24, 0.42, 0.62), 0, 0.235, -1.28);
  P.add('turret', xform(cylX(0.20, 1.16, 12), 0, 0, 0), 0, 0.10, -1.56);
  P.add('turretDark', cylZ(0.035, 0.06, 8), 0, 0.22, -1.60);                    // pistol port
  liftEye(P, 'turretDetail', -0.6, 0.56, -0.5);
  liftEye(P, 'turretDetail', 0.6, 0.56, -0.5);
  cupola(P, 'turret', -0.4, 0.56, -0.35, 0.24, 0.16, 5);
  // DShK AA MG on loader ring
  P.add('turretDetail', torus(0.26, 0.025, P.q ? 22 : 10), 0.42, 0.60, -0.25);
  pintleMG(P, 0.42, 0.60, -0.25);
  for (const s of [-1, 1]) {
    towCable(P, [[s * 0.85, 0.28, 0.4], [s * 0.95, 0.33, -0.2], [s * 0.85, 0.28, -0.6]], 0.016);
  }
  // Mantlet group seated ON the (longer) cast face, not buried inside it:
  // broad cast cradle, rounded rocking roll, and the bulge under the barrel
  // root that defines the D-25T mount.
  P.addGunExtra(box(0.74, 0.60, 0.34), 0, 0.02, 0.60);                          // cast cradle
  P.addGunExtra(xform(cylX(0.30, 0.68, 12), 0, 0, 0), 0, 0.04, 0.78);           // rounded mantlet roll
  P.addGunExtra(cylX(0.17, 0.46, 10), 0, -0.16, 0.88);                          // bulge under barrel root
  buildGun(P, { len: 5.85, r: 0.095, brake: 'discs', baseR: 0.2 });
  // IS running gear architecture (r6): SMALL 0.55 m steel wheels low on the
  // hull, three return rollers carrying the top run high, and the signature
  // open gap under the sponson between wheel tops and the raised track.
  buildRunningGear(P, {
    style: 'steel', wheelR: 0.275, wheelW: 0.17, xc: 1.22, wheelY: 0.36,
    wheelZs: [2.3, 1.38, 0.46, -0.46, -1.38, -2.3],
    sprocket: { z: -2.95, y: 0.44, r: 0.32 }, idler: { z: 2.95, y: 0.40, r: 0.27 },
    rollers: [1.55, 0.05, -1.55].map((z) => ({ z, y: 1.02, r: 0.09 })),
    trackW: 0.65, topY: 1.08, arms: true,
  });
  headlight(P, -0.6, 1.9, 1.75, -0.5);
  stowage(P, 'hullDetail', rng, [[1.25, 1.2, 1.4, 0.3, 0.24, 0.9]]);
  P.decal('turret', 'number', '432', 0.38, [0.88, 0.26, -0.3], Math.PI / 2, 0, 0.20);
  P.decal('turret', 'number', '432', 0.38, [-0.88, 0.26, -0.3], -Math.PI / 2, 0, -0.20);
  P.topY = 0.72;
}

function buildPanther(P) {
  const { rng } = P;
  P.add('hull', box(2.1, 0.63, 6.4), 0, 0.835, -0.05);                          // lower hull
  P.add('hull', frustum(1.71, 2.35, -3.1, 1.32, 1.80, -3.35, 1.15, 1.85));      // sloped superstructure
  P.add('hull', frustum(1.55, 3.30, 2.3, 1.32, 1.80, 2.3, 0.8, 1.85));          // huge 55° glacis
  P.add('hull', frustum(1.55, 2.90, 2.75, 1.55, 3.30, 2.75, 0.52, 0.8));        // lower glacis
  P.add('hullDetail', sph(0.09, 10), 0.6, 1.62, 2.62);                          // ball MG in glacis
  fenders(P, 1.05, 1.71, 1.18, -3.35, 3.3, 0.03);
  // TWO rear exhaust stacks in sheet-metal shrouds (the flanking stowage
  // cylinders read as four organ pipes — r6 critique, same as the Tiger)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.115, 0.125, 0.6, 12), s * 0.55, 1.85, -3.44);  // muffler drum
    P.add('hull', box(0.3, 0.5, 0.14), s * 0.55, 1.8, -3.47);                 // shroud
    P.add('hullDark', cylY(0.07, 0.078, 0.55, 10), s * 0.55, 2.32, -3.42);    // dark pipe tip
  }
  // Schürzen skirts — one missing, one bent, for character. r7: bottom edge
  // raised to 0.78 so the big interleaved road wheels read full-size below
  // the plates instead of peeking out of a curtain.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      if (s > 0 && k === 4) continue;                                            // missing plate
      const bent = s < 0 && k === 2 ? 0.07 : 0;
      P.add('hull', box(0.02, 0.40, 0.98), s * 1.73, 0.98, 2.45 - k * 1.02, bent, s * bent, 0);
    }
  }
  towCable(P, [[-1.6, 1.75, -2.4], [-1.7, 1.8, 0], [-1.6, 1.75, 2.2]]);
  headlight(P, -0.9, 1.83, 2.15, -0.96, 0.05);                                  // headlight
  liftEye(P, 'hullDetail', -1.35, 1.87, 1.4);
  liftEye(P, 'hullDetail', 1.35, 1.87, 1.4);
  periscope(P, 'hullDetail', -0.6, 1.87, 2.0);                                  // driver periscopes on roof edge
  periscope(P, 'hullDetail', -0.35, 1.87, 2.0);
  // turret: narrow-front wedge (plan taper + sloped sides), scaled +15% in
  // plan — the r6 pass flagged the turret as undersized on the 3.42 m hull
  P.add('turret', slab(
    [-0.60, 0, 0.81], [0.60, 0, 0.81], [1.09, 0, -1.06], [-1.09, 0, -1.06],
    [-0.46, 0.78, 0.63], [0.46, 0.78, 0.63], [0.71, 0.78, -1.09], [-0.71, 0.78, -1.09]));
  cupola(P, 'turret', -0.34, 0.78, -0.52, 0.26, 0.2, 7);
  P.add('turretDetail', box(0.3, 0.06, 0.4), 0.35, 0.82, -0.68);                // roof vent plate
  P.add('turret', sph(0.11, 12, Math.PI / 2), 0.45, 0.78, 0.1);                 // roof ventilator dome
  // r7 mantlet rework: the SIGNATURE curved "rolling-pin" — one full-width
  // horizontal cylinder with rounded end caps standing clearly proud of the
  // narrow turret face, over a sealing backplate. The r6 camo-blended
  // ellipsoid vanished into the slab front at any distance.
  P.addGunExtra(box(1.04, 0.60, 0.16), 0, 0.02, 0.24);                          // sealing backplate
  P.addGunExtra(xform(cylX(0.295, 1.18, P.q ? 26 : 14), 0, 0, 0), 0, 0.03, 0.44); // rolling-pin cylinder
  P.addGunExtra(xform(sph(0.295, P.q ? 18 : 10), 0, 0, 0, 0, 0, 0, [0.5, 1, 1]), -0.59, 0.03, 0.44);
  P.addGunExtra(xform(sph(0.295, P.q ? 18 : 10), 0, 0, 0, 0, 0, 0, [0.5, 1, 1]), 0.59, 0.03, 0.44);
  P.addGunExtraDark(cylZ(0.03, 0.12, 8), -0.42, 0.16, 0.78);                    // TZF12a sight hole
  P.addGunExtraDark(cylZ(0.035, 0.12, 8), 0.38, 0.05, 0.80);                    // coax MG port
  buildGun(P, { len: 5.25, r: 0.065, brake: 'double', baseR: 0.14 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.43, wheelW: 0.14, xc: 1.38,
    wheelZs: [2.55, 1.82, 1.09, 0.36, -0.37, -1.1, -1.83, -2.56],
    layers: [[0.13], [-0.13]],
    sprocket: { z: 2.95, y: 0.5, r: 0.36 }, idler: { z: -2.95, y: 0.47, r: 0.33 },
    trackW: 0.66, topY: 0.99,
  });
  // r8: stowage pulled inboard — at x ±1.5 the boxes hung over the sloped
  // superstructure side and floated above the deck
  stowage(P, 'hullDetail', rng, [[-1.12, 1.95, -2.7, 0.38, 0.22, 0.9], [1.12, 1.95, -2.7, 0.38, 0.22, 0.9]]);
  P.decal('hull', 'cross', null, 0.44, [1.75, 0.92, 0.95], Math.PI / 2);
  P.decal('hull', 'cross', null, 0.44, [-1.75, 0.92, 0.95], -Math.PI / 2);
  P.decal('turret', 'number', '435', 0.38, [0.79, 0.36, -0.40], Math.PI / 2, 0, 0.30);
  P.decal('turret', 'number', '435', 0.38, [-0.79, 0.36, -0.40], -Math.PI / 2, 0, -0.30);
  P.topY = 0.76;
}

function buildM1A2(P) {
  const { rng } = P;
  P.add('hull', box(2.38, 0.6, 7.6), 0, 0.75, -0.1);                            // lower hull
  P.add('hull', box(3.66, 0.42, 5.56), 0, 1.26, -1.18);                         // upper hull slab (low profile)
  P.add('hull', frustum(1.78, 3.90, 1.60, 1.78, 1.60, 1.60, 1.0, 1.47));        // near-horizontal glacis
  P.add('hull', frustum(1.78, 3.50, 3.6, 1.78, 3.90, 3.6, 0.45, 1.0));          // blunt lower front
  // rear turbine grille
  P.add('hull', box(3.5, 0.92, 0.1), 0, 0.96, -3.93);
  if (P.q) for (let k = 0; k < 6; k++) P.add('hullDark', box(3.3, 0.05, 0.04), 0, 0.62 + k * 0.14, -3.99);
  // side skirts: 7 panels, front 3 heavy. Bottom edge rides HIGH enough that
  // the lower run of road wheels and track clearly show beneath (r3 critique:
  // skirts to the ground made the tank hover on a black strip).
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const heavy = k < 3;
      const z = 3.35 - k * 1.06;
      P.add('hull', box(heavy ? 0.09 : 0.05, 0.5, 0.99), s * 1.86, 0.82, z);
      if (P.q && heavy) P.add('hullDark', box(0.03, 0.08, 0.3), s * 1.92, 0.97, z);
    }
  }
  towCable(P, [[-1.2, 1.24, 2.66], [0, 1.34, 2.2], [1.2, 1.24, 2.66]]);
  towCable(P, [[-1.0, 1.28, -3.8], [0, 1.38, -3.97], [1.0, 1.28, -3.8]]);
  // glacis furniture: V splash guard, fuel filler caps, driver periscopes
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.95, 0.055, 0.07), s * 0.44, 1.38, 2.35, -0.2, s * 0.42, 0);
    P.add('hullDetail', cylY(0.09, 0.09, 0.04, 12), s * 1.15, 1.475, 0.9);      // filler caps
  }
  periscope(P, 'hullDetail', -0.25, 1.49, 1.52);
  periscope(P, 'hullDetail', 0.25, 1.49, 1.52);
  for (const s of [-1, 1]) P.add('hullRubber', box(0.62, 0.4, 0.03), s * 1.35, 0.5, 3.62, -0.15, 0, 0); // mud flaps
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.16, 0.08, 0.05), s * 1.45, 1.12, -3.99);            // taillights
    P.add('hullDark', box(0.2, 0.09, 0.09), s * 1.35, 1.18, 2.98);              // headlight clusters
    P.add('hullGlass', box(0.16, 0.06, 0.02), s * 1.35, 1.18, 3.032);           // lens strip
    P.add('hullDetail', torus(0.05, 0.016, 12), s * 1.1, 1.44, 1.9);            // lifting eyes
    liftEye(P, 'hullDetail', s * 1.5, 1.49, -2.6);
  }
  // turret: near-hull-width flat-faceted body + the long rear bustle that
  // defines the Abrams silhouette (~91% hull width; body+rack ≈ 45% of hull
  // length behind the ring — matched against SEPv3 plan proportions, r3)
  const TW = 1.66;
  P.add('turret', frustum(TW, 0.26, -2.62, TW, 0.12, -2.62, 0.0, 0.85));        // main body
  P.add('turret', slab(                                                          // right cheek wedge
    [0.24, 0, 1.12], [TW, 0, 0.26], [TW, 0, -0.10], [0.24, 0, 0.74],
    [0.24, 0.85, 0.98], [TW, 0.85, 0.12], [TW, 0.85, -0.24], [0.24, 0.85, 0.6]));
  P.add('turret', slab(                                                          // left cheek wedge
    [-TW, 0, 0.26], [-0.24, 0, 1.12], [-0.24, 0, 0.74], [-TW, 0, -0.10],
    [-TW, 0.85, 0.12], [-0.24, 0.85, 0.98], [-0.24, 0.85, 0.6], [-TW, 0.85, -0.24]));
  P.add('turret', box(0.6, 0.64, 0.55), 0, 0.32, 0.92);                         // gun embrasure block
  // bustle stowage rack: LONG slatted basket hanging over the engine deck —
  // the signature Abrams rear. Frame rails + vertical slats + packed gear.
  const rkZ = -3.34, rkT = 0.76, rkB = 0.22;
  P.add('turretDetail', box(3.24, 0.05, 0.05), 0, rkT, rkZ);                    // rear top rail
  P.add('turretDetail', box(3.24, 0.05, 0.05), 0, rkB, rkZ);                    // rear bottom rail
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.05, 0.72), s * 1.60, rkT, -2.98);         // side rails
    P.add('turretDetail', box(0.05, 0.05, 0.72), s * 1.60, rkB, -2.98);
  }
  for (let k = 0; k < 14; k++) {                                                // rear slats
    P.add('turretDetail', box(0.035, rkT - rkB, 0.035), -1.56 + k * 0.24, (rkT + rkB) / 2, rkZ);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {                        // side slats
    P.add('turretDetail', box(0.035, rkT - rkB, 0.035), s * 1.60, (rkT + rkB) / 2, -2.72 - k * 0.22);
  }
  P.add('turretDark', box(3.16, 0.02, 0.66), 0, rkB + 0.03, -2.98);             // mesh floor
  stowage(P, 'turretCloth', rng, [
    [-1.15, 0.52, -2.98, 0.6, 0.46, 0.6], [-0.35, 0.58, -2.96, 0.72, 0.56, 0.62],
    [0.55, 0.52, -2.98, 0.55, 0.44, 0.6], [1.25, 0.46, -2.96, 0.42, 0.34, 0.55],
  ]);
  jerryCan(P, 'turretCloth', -1.48, 0.5, -2.92, 0.12);
  jerryCan(P, 'turretCloth', 0.95, 0.48, -3.0, -0.15);
  ammoCan(P, 'turretDark', 1.45, 0.42, -2.8, 0.3);
  tarpRoll(P, 'turretCloth', 0, 0.88, -2.8, 1.6, 0.11, true);
  // roof furniture: CITV (fwd-left), GPS doghouse (roof right), CROWS, hatches
  P.add('turretDetail', cylY(0.14, 0.16, 0.24, 16), -0.72, 0.96, 0.5);
  P.add('turretDark', box(0.26, 0.24, 0.28), -0.72, 1.18, 0.5);                 // CITV head
  P.add('turretGlass', box(0.18, 0.13, 0.02), -0.72, 1.18, 0.65);               // CITV mirror window
  P.add('turret', box(0.55, 0.34, 0.6), 0.78, 1.0, 0.42);                       // GPS doghouse
  P.add('turretDark', box(0.48, 0.16, 0.06), 0.78, 0.98, 0.74);                 // GPS window frame
  P.add('turretGlass', box(0.42, 0.11, 0.02), 0.78, 0.98, 0.775);               // GPS lens
  // CROWS-LP RWS: pedestal ring, sensor cradle, elevated .50cal with a real
  // receiver + barrel + ammo box (not an anonymous black slab stack)
  P.add('turretDetail', cylY(0.16, 0.19, 0.08, 12), 0.48, 0.9, -0.55);          // base ring
  P.add('turretDetail', cylY(0.08, 0.1, 0.16, 10), 0.48, 1.0, -0.55);           // pedestal
  P.add('turretDetail', box(0.3, 0.3, 0.36), 0.48, 1.2, -0.55);                 // cradle body
  P.add('turretDark', box(0.2, 0.12, 0.05), 0.48, 1.16, -0.35);                 // optics window
  P.add('turretDark', box(0.1, 0.12, 0.5), 0.58, 1.38, -0.41);                  // M2 receiver
  P.add('turretDark', cylZ(0.026, 0.66, 8), 0.58, 1.38, 0.15);                  // M2 barrel
  P.add('turretDark', cylZ(0.04, 0.14, 8), 0.58, 1.38, 0.45);                   // barrel shroud step
  P.add('turretDetail', box(0.12, 0.16, 0.24), 0.34, 1.34, -0.49);              // ammo box
  P.add('turret', cylY(0.24, 0.24, 0.06, 12), -0.75, 0.87, -0.5);               // loader hatch
  pintleMG(P, -0.75, 0.87, -0.65, false);
  P.add('turret', cylY(0.2, 0.2, 0.05, 12), 0.72, 0.87, -0.15);                 // commander hatch
  // Blow-off panel: olive-drab detail material, NOT gunmetal `dark` — a 1.25 m
  // dark slab dead-center of the chase camera read as an unlit black rectangle
  // (r2 lighting critique). Detail shades like the surrounding armor.
  P.add('turretDetail', box(1.3, 0.02, 1.0), 0, 0.856, -1.8);                   // blow-off panel seam
  for (const s of [-1.52, 1.52]) P.add('turretDark', box(0.02, 0.9, 0.02), s, 1.28, -2.5, 0, 0, s * 0.05);
  P.add('turretDetail', box(0.035, 0.55, 0.035), -1.2, 1.1, -1.4);              // wind sensor mast
  smokeCluster(P, 1.44, 0.56, 0.5, 6, 0.55);
  smokeCluster(P, -1.44, 0.56, 0.5, 6, -0.55);
  // sponson stowage rails + gear along the turret sides
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.04, 0.26, 1.5), s * 1.71, 0.42, -1.5);
    stowage(P, 'turretCloth', rng, [[s * 1.70, 0.44, -1.45, 0.15, 0.2, 0.85]]);
    ammoCan(P, 'turretDark', s * 1.69, 0.4, -0.6, s * 0.1);
    tarpRoll(P, 'turretCloth', s * 1.70, 0.62, -1.85, 0.55, 0.07, false, 8);
  }
  P.addGunExtra(box(0.95, 0.56, 0.36), 0, 0.02, 0.3);                           // boxy mantlet housing
  P.addGunExtra(box(0.6, 0.44, 0.2), 0, 0, 0.54);
  buildGun(P, { len: 5.28, r: 0.085, sleeve: true, evac: 0.55, collar: true, baseR: 0.17 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.33, wheelW: 0.23, xc: 1.5,
    wheelZs: [2.9, 1.93, 0.96, 0.0, -0.97, -1.94, -2.9],
    sprocket: { z: -3.5, y: 0.44, r: 0.33 }, idler: { z: 3.45, y: 0.42, r: 0.31 },
    trackW: 0.635, topY: 0.9,
  });
  P.decal('hull', 'number', 'B-24', 0.4, [1.92, 0.82, 2.9], Math.PI / 2);
  P.decal('hull', 'number', 'B-24', 0.4, [-1.92, 0.82, 2.9], -Math.PI / 2);
  P.decal('turret', 'number', 'B24', 0.36, [1.67, 0.42, -1.0], Math.PI / 2);
  P.decal('turret', 'number', 'B24', 0.36, [-1.67, 0.42, -1.0], -Math.PI / 2);
  // turbine exhaust staining across the rear grille doors
  P.decal('hull', 'soot', null, 1.1, [0.7, 1.0, -4.02], Math.PI);
  P.decal('hull', 'soot', null, 1.1, [-0.7, 1.0, -4.02], Math.PI);
  P.topY = 0.88;
}

function buildT90M(P) {
  const { rng } = P;
  // r7 hull rebuild (barge-hull critical): the real T-90M side is essentially
  // TRACKS + SKIRTS — no meter-tall sponson wall. Lower hull narrows to sit
  // inside the tracks, the deck is a shallow band from the fender line
  // (1.10) to the 1.40 roof, and the glacis drops with it. Height to turret
  // roof ≈ 2.14 m — reads a full head shorter than the NATO tanks.
  P.add('hull', box(2.4, 0.57, 6.6), 0, 0.715, -0.1);                           // lower hull
  P.add('hull', box(3.46, 0.30, 6.35), 0, 1.25, -0.15);                         // deck band (1.10-1.40)
  fenders(P, 1.31, 1.91, 1.085, -3.4, 3.25, 0.035);                             // fender line over the tracks
  P.add('hull', frustum(1.64, 3.35, 1.95, 1.70, 1.90, 1.95, 0.85, 1.40));       // 68° glacis
  P.add('hull', frustum(1.64, 3.05, 3.1, 1.64, 3.35, 3.1, 0.43, 0.85));         // lower front
  // fender-underside AO so the running gear reads against a shadowed pocket
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.55, 0.026, 6.3), s * 1.55, 1.075, -0.1);
  }
  // driver hatch strip on the glacis center between the ERA rows
  P.add('hull', box(0.5, 0.05, 0.45), 0, 1.30, 2.22, -1.19, 0, 0);
  // V splash board low on the glacis
  for (const s of [-1, 1]) P.add('hullDetail', box(0.8, 0.05, 0.08), s * 0.38, 1.12, 2.62, -1.19, s * 0.5, 0);
  // skirts (r6 proportion fix): the panel hangs from the sponson line down to
  // 0.66 m ONLY — the 0.75 m road wheels show clearly beneath it instead of
  // the old full-depth slab wall that swallowed half the vehicle height.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.04, 0.42, 6.45), s * 1.88, 0.87, -0.08);
    // rubber flap seams over the rear (un-bricked) end
    for (let k = 0; k < 3; k++) {
      P.add('hullDark', box(0.048, 0.34, 0.022), s * 1.88, 0.83, -2.12 - k * 0.42);
    }
    // lower dust flap lip
    P.add('hullRubber', box(0.03, 0.1, 6.4), s * 1.88, 0.62, -0.08);
  }
  // unditching log + snorkel
  P.add('hullWood', cylX(0.13, 2.6, 12), 0, 1.28, -3.35);
  // rear long-range fuel drums on the back plate (T-90 signature)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.14, 0.14, 1.05, 12), s * 0.85, 0.95, -3.5, 0, 0, s * 0.10);
    P.add('hullDark', box(0.05, 0.4, 0.03), s * 0.85, 0.95, -3.62);             // retaining strap
  }
  // engine deck grille + intake hump on the new flat band
  P.add('hullDark', box(1.6, 0.02, 0.9), 0, 1.405, -2.15);
  if (P.q) for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.5, 0.02, 0.05), 0, 1.41, -1.85 - k * 0.16);
  P.add('hull', box(0.9, 0.08, 0.7), -0.55, 1.44, -1.35);                       // intake hump
  headlight(P, -1.5, 1.15, 3.12, -0.2, 0.05);                                   // fender headlight
  liftEye(P, 'hullDetail', -1.2, 1.42, 1.55);
  liftEye(P, 'hullDetail', 1.2, 1.42, 1.55);
  towCable(P, [[-1.3, 1.05, 2.95], [-0.4, 0.98, 3.12], [0.5, 1.03, 3.02]]);     // bow tow cable
  spareTrackStrip(P, 'hull', 1.3, 1.18, 2.42, 2, -1.15, 0);                     // spare links on glacis edge
  // slat cage around engine rear corners
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.05, 0.55, 0.02), s * 1.72, 0.9, -2.7 - k * 0.18);
  }
  for (let k = 0; k < 10; k++) P.add('hullDetail', box(0.02, 0.55, 0.05), -1.35 + k * 0.3, 0.9, -3.58);
  // turret (r8 rebuild pass 2): wider, FLATTER dome (~2.9 m across, low-dome
  // profile per roster doc) with LARGER angular Relikt wedge cheeks forming
  // the V nose — the r7 dome still read as an undersized generic polygon
  // with the wedges lost under the digital speckle.
  P.add('turret', xform(lathe([
    [1.38, 0.0], [1.37, 0.10], [1.30, 0.26], [1.16, 0.40], [0.97, 0.52],
    [0.72, 0.61], [0.42, 0.665], [0.0, 0.69],
  ], P.q ? 34 : 14, 1.08), 0, 0, -0.10));
  // Relikt wedge cheek blocks (angled ~40° back in plan, leaning slightly):
  // two stacked courses per side so the cheek reads as an armored WEDGE with
  // a visible upper chamfer, not a thin sill
  for (const s of [-1, 1]) {
    P.add('turret', box(1.48, 0.50, 0.36), s * 0.78, 0.27, 0.80, -0.10, s * 0.72, 0);
    P.add('turret', box(1.30, 0.20, 0.30), s * 0.72, 0.57, 0.74, -0.34, s * 0.72, 0); // chamfer course
    P.add('turret', box(0.78, 0.46, 0.30), s * 1.20, 0.26, -0.10, -0.10, s * 1.30, 0); // side shoulder block
  }
  P.add('turret', box(2.0, 0.55, 0.95), 0, 0.29, -1.45);                        // full-width bustle box
  P.add('turretDetail', box(1.86, 0.04, 0.9), 0, 0.585, -1.45);                 // bustle lid rail
  for (let k = 0; k < 10; k++) {                                                // bustle slat screen
    P.add('turretDetail', box(0.02, 0.46, 0.05), -0.9 + k * 0.2, 0.26, -1.97);
  }
  P.add('turretDetail', cylX(0.07, 1.7, 10), 0, 0.68, -1.55);                   // snorkel tube
  // roof set: Sosna-U gunner sight (left of gun) with shutter brow,
  // commander's pano periscope, T05BV-1 RWS with Kord MG, met mast
  P.add('turret', box(0.52, 0.36, 0.42), -0.46, 0.86, 0.46);                    // Sosna-U housing
  P.add('turret', box(0.56, 0.10, 0.10), -0.46, 1.06, 0.64);                    // brow
  P.add('turretDark', box(0.4, 0.22, 0.06), -0.46, 0.86, 0.66);
  P.add('turretGlass', box(0.32, 0.15, 0.02), -0.46, 0.86, 0.695);              // Sosna-U lens
  P.add('turretDetail', cylY(0.06, 0.065, 0.30, 10), 0.22, 0.84, -0.42);        // pano stalk
  P.add('turretDark', cylY(0.115, 0.115, 0.20, 12), 0.22, 1.08, -0.42);         // pano head
  P.add('turretGlass', box(0.12, 0.06, 0.02), 0.22, 1.10, -0.31);
  // T05BV-1 RWS: ring + pedestal + cradle + Kord with ammo box
  P.add('turretDetail', cylY(0.17, 0.19, 0.07, 12), 0.55, 0.76, -0.05);
  P.add('turretDetail', cylY(0.07, 0.09, 0.20, 10), 0.55, 0.89, -0.05);
  P.add('turretDetail', box(0.26, 0.24, 0.34), 0.55, 1.08, -0.05);
  P.add('turretDark', box(0.16, 0.1, 0.05), 0.55, 1.05, 0.14);                  // RWS optics
  P.add('turretDark', box(0.09, 0.1, 0.44), 0.63, 1.24, 0.02);                  // Kord receiver
  P.add('turretDark', cylZ(0.024, 0.6, 8), 0.63, 1.24, 0.55);                   // Kord barrel
  P.add('turretDetail', box(0.11, 0.14, 0.2), 0.43, 1.20, -0.02);               // ammo box
  P.add('turretDetail', box(0.025, 0.4, 0.025), -0.6, 0.92, -0.75);             // met mast
  P.add('turretDetail', box(0.03, 0.55, 0.03), -0.85, 0.86, -1.1, 0, 0, 0.12);  // whip antenna
  // grab rails along the bustle sides
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.025, 0.025, 0.7), s * 1.02, 0.48, -1.3);
    P.add('turretDetail', box(0.025, 0.08, 0.025), s * 1.02, 0.44, -1.0);
    P.add('turretDetail', box(0.025, 0.08, 0.025), s * 1.02, 0.44, -1.6);
  }
  smokeCluster(P, 0.98, 0.44, 0.62, 6, 0.7);
  smokeCluster(P, -0.98, 0.44, 0.62, 6, -0.7);
  P.addGunExtra(box(0.44, 0.40, 0.26), 0, 0.02, 0.55);                          // embrasure block
  P.addGunExtra(cylZ(0.14, 0.34, 12, 0.17), 0, 0, 0.78);                        // mantlet collar
  buildGun(P, { len: 6.0, r: 0.068, sleeve: true, evac: 0.5, baseR: 0.15 });
  // r8: sprocket/idler raised + shrunk — at road-wheel height and size they
  // read as a 7th road wheel per side (roster doc is emphatic: SIX), and the
  // raised ends give the run its approach/departure rises.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.375, wheelW: 0.2, xc: 1.6,
    wheelZs: [2.55, 1.53, 0.51, -0.51, -1.53, -2.55],
    sprocket: { z: -3.08, y: 0.54, r: 0.27 }, idler: { z: 3.04, y: 0.52, r: 0.25 },
    rollers: [1.5, 0, -1.5].map((z) => ({ z, y: 0.95, r: 0.09 })),
    trackW: 0.58, topY: 0.88, arms: true,
  });
  // ---- Relikt ERA bricks (instanced, strippable per armor plate name) ----
  // Glacis rows seated on the r7 glacis plane z(y) = 1.90 + (1.40-y)*2.636.
  const t90GlacisZ = (y) => 1.90 + (1.40 - y) * 2.636 + 0.04;
  P.eraCluster('glacis_era_R', (put) => {
    for (let row = 0; row < 4; row++) for (let c = 0; c < 5; c++) {
      const y = 0.95 + row * 0.125;
      put(0.16 + c * 0.31, y, t90GlacisZ(y), -68 * D2R, 0, 0);
    }
  });
  P.eraCluster('glacis_era_L', (put) => {
    for (let row = 0; row < 4; row++) for (let c = 0; c < 5; c++) {
      const y = 0.95 + row * 0.125;
      put(-0.16 - c * 0.31, y, t90GlacisZ(y), -68 * D2R, 0, 0);
    }
  });
  // Turret cheek tiles ride ON the (r7 scaled-up) wedge block faces — 2 rows
  // x 5 cols per side, faces parallel to the ~41° wedge plane.
  const t90Cheek = (put, s) => {
    const dx = Math.cos(0.72), dz = -Math.sin(0.72);
    const nx = Math.sin(0.72), nz = Math.cos(0.72);
    for (let row = 0; row < 2; row++) for (let c = 0; c < 5; c++) {
      const t = -0.52 + c * 0.26;
      put(s * (0.78 + dx * t + nx * 0.215), 1.58 + row * 0.19,
        0.80 + dz * t + nz * 0.215, -0.10, s * 0.72, 0);
    }
  };
  P.eraCluster('turret_era_R', (put) => t90Cheek(put, 1), true);
  P.eraCluster('turret_era_L', (put) => t90Cheek(put, -1), true);
  const t90Side = (put, s) => {
    const dx = Math.cos(1.30), dz = -Math.sin(1.30);
    const nx = Math.sin(1.30), nz = Math.cos(1.30);
    for (let row = 0; row < 2; row++) for (let c = 0; c < 4; c++) {
      const t = -0.24 + c * 0.16;
      put(s * (1.20 + dx * t + nx * 0.185), 1.58 + row * 0.16,
        0.05 + dz * t + nz * 0.185, -0.10, s * 1.30, 0);
    }
  };
  P.eraCluster('side_era_R', (put) => t90Side(put, 1), true);
  P.eraCluster('side_era_L', (put) => t90Side(put, -1), true);
  // Skirt tiles run (nearly) the FULL skirt length in two rows on the raised
  // panel; the last metre stays rubber flaps (r6: tiles stopped mid-hull).
  P.eraCluster('skirt_era_R', (put) => {
    for (let c = 0; c < 12; c++) for (let row = 0; row < 2; row++)
      put(1.92, 0.755 + row * 0.225, 3.05 - c * 0.44, 0, Math.PI / 2, 0);
  });
  P.eraCluster('skirt_era_L', (put) => {
    for (let c = 0; c < 12; c++) for (let row = 0; row < 2; row++)
      put(-1.92, 0.755 + row * 0.225, 3.05 - c * 0.44, 0, -Math.PI / 2, 0);
  });
  P.decal('turret', 'number', '527', 0.38, [0.96, 0.3, -1.4], Math.PI / 2);
  P.decal('turret', 'number', '527', 0.38, [-0.96, 0.3, -1.4], -Math.PI / 2);
  P.topY = 0.95;
}

function buildLeo2A7(P) {
  const { rng } = P;
  // r7 hull rework (barge critique): the full-width 0.64-tall sponson slab
  // and its long rear overhang are gone — the upper hull is a shallow band
  // whose rear face sits flush over the tracks, the heavy skirts climb to
  // the fender line, and the deck carries the fan/grille furniture.
  P.add('hull', box(2.48, 0.58, 7.5), 0, 0.79, 0);                              // lower hull
  P.add('hull', box(3.56, 0.42, 4.66), 0, 1.51, -1.38);                         // upper hull band (1.30-1.72)
  fenders(P, 1.25, 1.88, 1.29, -3.72, 3.6, 0.035);                              // fender line
  P.add('hull', frustum(1.72, 3.83, 1.0, 1.72, 1.00, 1.0, 1.0, 1.72));          // sharp glacis
  P.add('hull', frustum(1.72, 3.45, 3.55, 1.72, 3.83, 3.55, 0.5, 1.0));         // lower front
  // vertical rear plate flush with the hull end — no overhang box
  P.add('hull', box(3.1, 0.52, 0.12), 0, 1.46, -3.70);
  // rear DECK: twin circular cooling fans flat on the engine deck; rear
  // plate carries the twin exhaust grilles.
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.40, 0.40, 0.025, P.q ? 28 : 14), s * 0.80, 1.725, -2.55);
    P.add('hullDetail', torus(0.40, 0.025, P.q ? 26 : 14), s * 0.80, 1.73, -2.55);
    P.add('hullDetail', box(0.76, 0.02, 0.05), s * 0.80, 1.74, -2.55);          // fan cross brace
    P.add('hullDetail', box(0.05, 0.02, 0.76), s * 0.80, 1.74, -2.55);
    P.add('hullDark', box(0.7, 0.4, 0.04), s * 0.95, 1.15, -3.78);              // exhaust grille
    if (P.q) for (let k = 0; k < 4; k++) {
      P.add('hullDetail', box(0.7, 0.05, 0.05), s * 0.95, 1.0 + k * 0.11, -3.79);
    }
  }
  // fender-underside AO pocket over the running gear
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.5, 0.026, 7.0), s * 1.5, 1.27, 0);
  }
  // skirts (r7): the heavy sculpted front skirt now runs fender-deep
  // (0.68-1.30) like the real 2A7 armor modules — hull side above it is a
  // shallow band, not a wall; thinner recessed rubber skirt aft.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.10, 0.62, 3.25), s * 1.85, 0.99, 2.18);                 // heavy front skirt
    P.add('hull', box(0.10, 0.14, 3.2), s * 1.85, 0.64, 2.18, 0, 0, -s * 0.28); // chamfered lower lip
    if (P.q) for (let k = 0; k < 4; k++) {                                      // panel split seams
      P.add('hullDark', box(0.104, 0.56, 0.016), s * 1.85, 0.99, 3.6 - k * 0.8);
    }
    // r8: rear rubber skirt pushed OUTBOARD of the track run (the old x1.80
    // panel hid behind the 1.87 track edge, leaving the rear wheels bare) and
    // deepened so the flat-skirt line runs the full hull like the real 2A7
    P.add('hull', box(0.035, 0.55, 3.42), s * 1.865, 0.94, -1.28);              // rear rubber skirt
    P.add('hullRubber', box(0.028, 0.12, 3.4), s * 1.865, 0.63, -1.28);         // dangling rubber lip
    for (let k = 0; k < 4; k++) {
      P.add('hullDark', box(0.042, 0.5, 0.02), s * 1.865, 0.94, -0.3 - k * 0.7);
    }
  }
  towCable(P, [[-1.3, 1.6, -3.4], [0, 1.7, -3.7], [1.3, 1.6, -3.4]]);
  headlight(P, -1.3, 0.92, 3.68, -0.35);
  headlight(P, 1.3, 0.92, 3.68, -0.35);
  liftEye(P, 'hullDetail', -1.4, 1.75, -0.5);
  liftEye(P, 'hullDetail', 1.4, 1.75, -0.5);
  // r8 glacis furniture: the bare 2.6 m deck between nose and turret read as
  // a featureless Tiger II plate. V splash board, driver hatch + periscopes
  // (front-right station), weld crease seam, tow cable and filler caps give
  // the shallow glacis its Leopard read.
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(1.05, 0.045, 0.07), s * 0.47, 1.46, 2.15, -0.25, s * 0.42, 0);
  }
  P.add('hullDark', box(0.02, 0.012, 2.7), -1.7, 1.53, 2.35, -0.25, 0, 0);      // glacis edge weld L
  P.add('hullDark', box(0.02, 0.012, 2.7), 1.7, 1.53, 2.35, -0.25, 0, 0);       // glacis edge weld R
  P.add('hull', cylY(0.30, 0.30, 0.035, P.q ? 22 : 12), 0.62, 1.74, 0.72);      // driver hatch ring
  P.add('hullDark', torus(0.30, 0.015, P.q ? 22 : 12), 0.62, 1.745, 0.72);      // hatch seam
  periscope(P, 'hullDetail', 0.40, 1.76, 1.05);
  periscope(P, 'hullDetail', 0.62, 1.76, 1.08);
  periscope(P, 'hullDetail', 0.84, 1.76, 1.05, 0.3);
  towCable(P, [[-1.15, 1.42, 2.5], [0, 1.56, 1.7], [1.15, 1.42, 2.5]]);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.03, 12), s * 1.28, 1.735, 0.2); // filler caps
  // turret (r7 rebuild): scaled to the REAL 2A7 plan — ~2.85 m across (~80%
  // of hull width) and 3.15 m of armor body before the bustle rack, with the
  // arrowhead spaced-armor wedges meeting at a point ahead of the gun. The
  // r6 2.4 m box still sat lost on the hull and read mid-size.
  const LTW = 1.42;
  // r8: body sides/front taper inward toward the roof and the roofline drops
  // to 0.86 — the r7 vertical-walled 0.90 prism read as a rear-set barn.
  P.add('turret', frustum(LTW, 0.85, -2.3, LTW * 0.92, 0.55, -2.26, 0.0, 0.86)); // main body
  P.add('turret', slab(                                                          // right wedge (full front)
    [0.05, 0.06, 1.60], [LTW, 0.06, 0.30], [LTW, 0.06, -0.12], [0.05, 0.06, 1.18],
    [0.05, 0.90, 1.10], [LTW, 0.90, -0.20], [LTW, 0.90, -0.62], [0.05, 0.90, 0.68]));
  P.add('turret', slab(                                                          // left wedge
    [-LTW, 0.06, 0.30], [-0.05, 0.06, 1.60], [-0.05, 0.06, 1.18], [-LTW, 0.06, -0.12],
    [-LTW, 0.90, -0.20], [-0.05, 0.90, 1.10], [-0.05, 0.90, 0.68], [-LTW, 0.90, -0.62]));
  // EMES 15 gunner sight: recessed doghouse sunk into the right roof edge
  P.add('turret', box(0.5, 0.30, 0.44), 0.72, 0.88, 0.40);
  P.add('turretDetail', box(0.54, 0.06, 0.48), 0.72, 1.05, 0.38);               // shutter brow
  P.add('turretDark', box(0.4, 0.2, 0.06), 0.62, 0.86, 0.62);
  P.add('turretGlass', box(0.32, 0.13, 0.02), 0.72, 0.88, 0.675);               // EMES lens
  // PERI R17 panoramic periscope on stalk — tallest point, center-left roof.
  // r8: compacted — the 0.45 m stalk + fat black head read as a chimney.
  P.add('turretDetail', cylY(0.06, 0.07, 0.26, 12), -0.42, 0.97, -0.85);
  P.add('turretDetail', cylY(0.085, 0.085, 0.08, 12), -0.42, 1.13, -0.85);      // rotary collar
  P.add('turretDark', box(0.19, 0.20, 0.21), -0.42, 1.27, -0.85);
  P.add('turretGlass', box(0.13, 0.12, 0.02), -0.42, 1.29, -0.74);              // PERI window
  // commander + loader hatch rings
  P.add('turret', cylY(0.24, 0.24, 0.05, 14), 0.62, 0.945, -0.8);
  P.add('turret', cylY(0.22, 0.22, 0.05, 14), -0.75, 0.945, -0.4);
  liftEye(P, 'turretDetail', -1.15, 0.95, 0.1);
  liftEye(P, 'turretDetail', 1.15, 0.95, -0.5);
  // FLW 200 RWS behind the loader hatch (r8: compacted with the PERI)
  P.add('turretDetail', cylY(0.09, 0.11, 0.10, 10), -0.25, 0.93, -1.05);
  P.add('turretDark', box(0.17, 0.19, 0.28), -0.25, 1.07, -1.05);
  P.add('turretDark', cylZ(0.024, 0.55, 8), -0.18, 1.10, -0.72);
  // full-width slatted bustle stowage rack across the rear (2A7 signature)
  const lrkT = 0.80, lrkB = 0.16, lrkZ = -2.68;
  P.add('turretDetail', box(2 * LTW + 0.1, 0.05, 0.05), 0, lrkT, lrkZ);
  P.add('turretDetail', box(2 * LTW + 0.1, 0.05, 0.05), 0, lrkB, lrkZ);
  for (let k = 0; k < 14; k++) {
    P.add('turretDetail', box(0.035, lrkT - lrkB, 0.035), -LTW + 0.08 + k * 0.2, (lrkT + lrkB) / 2, lrkZ);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.05, 0.4), s * (LTW - 0.02), lrkT, -2.5);
    P.add('turretDetail', box(0.05, 0.05, 0.4), s * (LTW - 0.02), lrkB, -2.5);
  }
  P.add('turretDark', box(2 * LTW, 0.02, 0.42), 0, lrkB + 0.03, -2.52);         // rack mesh floor
  stowage(P, 'turretCloth', rng, [
    [-0.7, 0.44, -2.52, 0.7, 0.42, 0.4], [0.15, 0.40, -2.54, 0.6, 0.36, 0.38],
    [0.85, 0.42, -2.5, 0.5, 0.4, 0.36],
  ]);
  jerryCan(P, 'turretCloth', -1.2, 0.4, -2.54, 0.15);
  // side stowage baskets along the rear flanks
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.3, 1.1), s * (LTW + 0.08), 0.4, -1.55);
    stowage(P, 'turretCloth', rng, [[s * (LTW + 0.04), 0.42, -1.5, 0.14, 0.22, 0.9]]);
  }
  // 2x8 smoke dischargers on the rear quarters
  smokeCluster(P, 1.26, 0.5, -1.15, 4, 1.2, 0.7);
  smokeCluster(P, 1.26, 0.42, -1.4, 4, 1.4, 0.7);
  smokeCluster(P, -1.26, 0.5, -1.15, 4, -1.2, 0.7);
  smokeCluster(P, -1.26, 0.42, -1.4, 4, -1.4, 0.7);
  P.add('turretDetail', box(0.03, 0.45, 0.03), -1.12, 1.12, -1.9);              // crosswind mast
  P.add('turretDetail', box(0.03, 0.6, 0.03), 1.12, 1.17, -2.1, 0, 0, 0.1);     // whip antenna
  // wide flat-faced mantlet block with the gun yoke in the arrowhead notch
  P.addGunExtra(box(0.66, 0.46, 0.34), 0, 0, 0.42);
  P.addGunExtra(box(0.94, 0.36, 0.18), 0, 0, 0.24);
  buildGun(P, { len: 6.6, r: 0.068, sleeve: true, evac: 0.62, collar: true, baseR: 0.15 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.35, wheelW: 0.22, xc: 1.55,
    wheelZs: [2.95, 2.0, 1.25, 0.28, -0.69, -1.66, -2.63],
    sprocket: { z: -3.5, y: 0.46, r: 0.34 }, idler: { z: 3.45, y: 0.44, r: 0.32 },
    trackW: 0.635, topY: 0.92,
  });
  P.decal('turret', 'crossgrey', null, 0.42, [1.43, 0.44, -1.1], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.42, [-1.43, 0.44, -1.1], -Math.PI / 2);
  P.decal('hull', 'number', 'Y-124', 0.34, [0.9, 1.36, 2.59], 0, -1.2);
  P.topY = 0.98;
}

const BUILDERS = {
  m4a3e8: buildM4A3E8, tiger1: buildTiger, t34_85: buildT34, is2: buildIS2,
  panther_g: buildPanther, m1a2: buildM1A2, t90m: buildT90M, leo2a7: buildLeo2A7,
};

// COMMUNITY TANKS: cheap generic stand-in for GLB-sourced vehicles with no
// hand-built procedural model. Rough hull slab + turret box + gun tube sized
// off the spec so the silhouette is sane for the frames before the GLB swap
// lands (modelLoader hides these meshes on success; on failure the vehicle
// still reads as a tank).
function buildCommunityPlaceholder(P) {
  const d = P.spec.dims;
  const a = P.spec.armor;
  const hw = d.widthM / 2;
  const hl = d.hullLengthM / 2;
  const roofY = a.turretPivot[1];
  const trkTop = d.heightM * 0.34;
  // hull slab (floor -> roof) + sponsons over the tracks
  P.add('hull', box(hw * 1.3, roofY - 0.3, hl * 2), 0, 0.3 + (roofY - 0.3) / 2, 0);
  P.add('hull', box(hw * 2, roofY - trkTop, hl * 1.9), 0, trkTop + (roofY - trkTop) / 2, 0);
  // track pontoons
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(hw * 0.55, trkTop, hl * 2), s * hw * 0.72, trkTop / 2 + 0.1, 0);
  }
  if (!P.spec.gun) return;
  // turret box + gun tube (in turret/gun frames)
  const tH = Math.max(0.5, d.heightM - roofY - 0.08);
  P.add('turret', box(hw * 1.1, tH, hw * 1.2), 0, tH / 2, 0);
  P.add('gun', cylZ(a.gunBarrel.radiusM, a.gunBarrel.lengthM, 12), 0, 0, a.gunBarrel.lengthM / 2);
  P.topY = tH + 0.1;
}

// Bucket -> [parent group key, material key]
const BUCKET_DEF = {
  hull: ['hullG', 'hull'], hullDetail: ['hullG', 'detail'], hullDark: ['hullG', 'dark'],
  hullRubber: ['hullG', 'rubber'], hullWood: ['hullG', 'wood'], hullCloth: ['hullG', 'canvasCloth'],
  hullGlass: ['hullG', 'glass'],
  turret: ['turretG', 'hull'], turretDetail: ['turretG', 'detail'], turretDark: ['turretG', 'dark'],
  turretCloth: ['turretG', 'canvasCloth'], turretGlass: ['turretG', 'glass'],
  gun: ['recoilG', 'barrel'], gunDark: ['recoilG', 'dark'], gunMount: ['gunG', 'hull'],
  gunMountDark: ['gunG', 'dark'],
  // spare track links (dark oily track steel, r6) + baked-shadow AO panels
  hullTrack: ['hullG', 'spareTrack'], turretTrack: ['turretG', 'spareTrack'],
  hullShadow: ['hullG', 'shadow'],
};
const CAMO_BUCKETS = new Set(['hull', 'turret', 'gun', 'gunMount']);
// Buckets that survive past LOD1 — everything else is greeble-class and
// disappears at range behind the silhouette shells.
const LOD0_KEEP = new Set(['hull', 'turret', 'gun', 'gunDark', 'gunMount', 'hullRubber']);

// Baked per-vertex weathering for camo surfaces: vertical dust gradient (heavy
// at skirt bottoms / running gear height), downward-face AO, and a subtle
// positional tone jitter so large plates don't read as one flat color.
function bakeDirt(geo, yOffset, strength = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const wy = pos.getY(i) + yOffset;
    let t = Math.min(1, Math.max(0, (1.45 - wy) / 1.45));
    const d = Math.min(0.85, Math.pow(t, 1.7) * 1.12 * strength);
    const ao = 1 - Math.max(0, -nor.getY(i)) * 0.28;
    const h = Math.sin(pos.getX(i) * 12.9898 + pos.getZ(i) * 78.233 + wy * 37.719) * 43758.5453;
    const n = ((h - Math.floor(h)) - 0.5) * 0.09;
    col[i * 3] = ((1 - d) + d * 0.68 + n) * ao;
    col[i * 3 + 1] = ((1 - d) + d * 0.6 + n) * ao;
    col[i * 3 + 2] = ((1 - d) + d * 0.46 + n) * ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/**
 * Build the articulated visual for one tank.
 * @param {string} specId one of TANK_IDS
 * @param {object} engineCtx EngineCtx (§2.8)
 * @param {{camoSeed?: number, quality?: 'high'|'low'}} [opts]
 * @returns {object} TankVisual (ARCHITECTURE §3.3.2)
 */
export function createTank(specId, engineCtx, opts = {}) {
  const { camoSeed = 4000, quality = 'high' } = opts;
  const spec = getSpec(specId);
  const armor = spec.armor;
  const mats = createTankMaterials(spec, engineCtx, camoSeed);
  const rng = mulberry32((camoSeed | 0) ^ 0x9e37);

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  root.name = `tank_${specId}`;
  const hullG = new THREE.Group();
  const turretG = new THREE.Group();
  turretG.position.set(armor.turretPivot[0], armor.turretPivot[1], armor.turretPivot[2]);
  const gunG = new THREE.Group();
  gunG.position.set(armor.gunPivot[0], armor.gunPivot[1], armor.gunPivot[2]);
  const recoilG = new THREE.Group();
  root.add(hullG, turretG);
  turretG.add(gunG);
  gunG.add(recoilG);

  const buckets = {};
  const eraClusters = new Map();
  const eraPlacements = [];
  const decals = [];
  const disposables = [];

  const P = {
    spec, mats, rng, q: quality === 'high', hullG, turretG, gunG, recoilG,
    disposables, gear: null, muzzleZ: armor.gunBarrel.lengthM, topY: 0.8,
    add(bucket, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
      (buckets[bucket] || (buckets[bucket] = [])).push(xform(geo, x, y, z, rx, ry, rz, s));
    },
    // Mantlet & cradle parts: pitch with the gun but do NOT recoil.
    addGunExtra(geo, x, y, z) {
      (buckets.gunMount || (buckets.gunMount = [])).push(xform(geo, x, y, z));
    },
    addGunExtraDark(geo, x, y, z) {
      (buckets.gunMountDark || (buckets.gunMountDark = [])).push(xform(geo, x, y, z));
    },
    decal(parent, kind, text, size, pos, rotY = 0, rotX = 0, rotZ = 0) {
      decals.push({ parent, kind, text, size, pos, rotY, rotX, rotZ });
    },
    // ERA cluster: brick placements in HULL frame (or turret frame if turretLocal)
    eraCluster(plateName, fill, turretLocal = false) {
      const start = eraPlacements.length;
      fill((x, y, z, rx = 0, ry = 0, rz = 0) => eraPlacements.push({ x, y, z, rx, ry, rz, turretLocal }));
      eraClusters.set(plateName, { start, end: eraPlacements.length, turretLocal });
    },
  };

  (BUILDERS[specId] || buildCommunityPlaceholder)(P);

  // ---- merge buckets into meshes ----
  const gunYOff = armor.turretPivot[1] + armor.gunPivot[1];
  const DIRT_Y = { hullG: 0, turretG: armor.turretPivot[1], recoilG: gunYOff, gunG: gunYOff };
  for (const [bucket, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const [parentKey, matKey] = BUCKET_DEF[bucket];
    const merged = mergeAll(list);
    if (CAMO_BUCKETS.has(bucket)) {
      boxUV(merged, spec.visual.camoScale ?? 0.34);
      bakeDirt(merged, DIRT_Y[parentKey], bucket === 'hull' ? 1 : 0.5);
    }
    disposables.push(merged);
    const mesh = new THREE.Mesh(merged, mats[matKey]);
    mesh.castShadow = mesh.receiveShadow = true;
    const parent = ({ hullG, turretG, recoilG, gunG })[parentKey];
    if (LOD0_KEEP.has(bucket)) parent.add(mesh);
    else lodWrap(parent, mesh);
  }

  // ---- decals ----
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  disposables.push(decalGeo);
  const decalMeshes = [];
  for (const d of decals) {
    const mesh = new THREE.Mesh(decalGeo, mats.decal(d.kind, d.text));
    mesh.scale.setScalar(d.size);
    mesh.position.set(d.pos[0], d.pos[1], d.pos[2]);
    mesh.rotation.set(d.rotX, d.rotY, d.rotZ, 'ZYX');
    mesh.castShadow = false;
    (d.parent === 'turret' ? turretG : hullG).add(mesh);
    decalMeshes.push(mesh);
  }

  // ---- ERA bricks (t90m) ----
  let eraMesh = null;
  const eraLocal = [];
  if (eraPlacements.length) {
    // crisp flat Relikt tile — the rounded 0.1-deep brick read as rows of
    // pills on the glacis (r7); real tiles are shallow sharp-edged slabs
    const brick = new THREE.BoxGeometry(0.28, 0.13, 0.07);
    // mats.hull uses vertexColors — give the shared brick a neutral color attr
    brick.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(brick.attributes.position.count * 3).fill(1), 3));
    disposables.push(brick);
    // Split hull-frame vs turret-frame bricks into two instanced meshes.
    for (const turretLocal of [false, true]) {
      const items = eraPlacements.filter((e) => e.turretLocal === turretLocal);
      if (!items.length) continue;
      const im = new THREE.InstancedMesh(brick, mats.hull, items.length);
      im.castShadow = im.receiveShadow = true;
      items.forEach((e, i) => { e._mesh = im; e._index = i; });
      (turretLocal ? turretG : hullG).add(im);
      eraLocal.push(im);
      if (!eraMesh) eraMesh = im;
    }
    seatEraBricks();
  }

  /** (Re)compose every ERA brick at its as-built placement (undoes stripEra). */
  function seatEraBricks() {
    for (const e of eraPlacements) {
      if (!e._mesh) continue;
      _q.setFromEuler(new THREE.Euler(e.rx, e.ry, e.rz, 'YXZ'));
      _v.set(
        e.x,
        e.turretLocal ? e.y - armor.turretPivot[1] : e.y,
        e.turretLocal ? e.z - armor.turretPivot[2] : e.z,
      );
      _s.set(1, 1, 1);
      _m.compose(_v, _q, _s);
      e._mesh.setMatrixAt(e._index, _m);
    }
    for (const im of eraLocal) im.instanceMatrix.needsUpdate = true;
  }

  // ---- anchors ----
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, P.muzzleZ);
  recoilG.add(muzzle);
  const turretTop = new THREE.Object3D();
  turretTop.position.set(0, P.topY, 0);
  turretG.add(turretTop);

  // ---- state ----
  let destroyed = false;
  let recoilT = 1e9;
  let recoilPending = false;         // hull-rock impulse queued by recoilKick
  // Recuperator profile: sharp 60 ms slide back in the cradle, then a damped
  // hydraulic return over ~0.5 s. Travel scales with caliber — a 120 mm gun
  // recoils 30-40 cm and WoT exaggerates it; the r2 0.24 m read as pixels.
  const REC_BACK = 0.06, REC_RETURN = 0.5;
  const REC_AMP = 0.36 * Math.min(1.25, Math.max(0.55, ((spec.gun && spec.gun.caliberMm) || 100) / 120));
  // Burnt-swap bookkeeping. CAPTURED LAZILY at setDestroyed time, NOT here:
  // GLB-sourced tanks (m1a2, community winners) swap their meshes in AFTER
  // construction, so a construction-time traverse missed every GLB mesh and
  // their wrecks stayed pristine painted camo (r4 destroy-probe finding).
  const originalMats = [];

  // ---- animation-layer state (visual only, self-timed at SIM_STEP) ---------
  let groundSampler = null;          // (x, z) => terrain height, set by integration
  let sway = 0;                      // turn-lean roll (rad), smoothed
  let flinchP = 0, flinchR = 0;      // hit-reaction damped oscillator
  let flinchPV = 0, flinchRV = 0;
  // Hit/recoil impulses accumulate here and are routed into the SIM's flinch
  // mirror (state._flinch, integrated by movement.js) on the next
  // syncFromState — the terrain-contact support solve then clears the ground
  // at the flinched pose too (a 1-2° large-caliber rock over a 3.5 m
  // half-length used to dip a track end ~10 cm past the 1.5 cm margin).
  // The local flinchP/flinchR oscillator remains ONLY as a fallback for
  // staged/ghost states without the mirror (killcam ghosts, garage poses).
  let pendFlinchPV = 0, pendFlinchRV = 0;
  const FLINCH_W = 13, FLINCH_Z = 0.32;
  // suspension spring: underdamped pitch/roll rock layered on the sim's stiff
  // 4-corner attitude — squat on accel, dive on braking, bounce over ruts.
  // Works in visualPitch/visualRoll space (nose-up positive / right-down
  // positive) and is ADDED to the sim attitude before the root rotation.
  let suspP = 0, suspR = 0, suspPV = 0, suspRV = 0;
  let prevSpeed = 0;
  const SUSP_W = 7.5, SUSP_Z = 0.30;
  // r6 VISIBLE hull dynamics: the sim spring (movement.js state._susp) is
  // tuned for terrain-contact correctness, but its rock is sub-pixel at
  // gameplay camera distance — no readable squat/dive/roll (r5 critique).
  // Amplify the TRANSIENT deviation for the RENDERED attitude only (steady
  // state is 0, so parked pose is untouched), and lift the hull by half the
  // worst extra corner deficit so the exaggerated lean neither buries nor
  // levitates the tracks visibly.
  const SUSP_VIS_P = 2.6, SUSP_VIS_R = 2.1, SWAY_VIS = 2.3;
  let wreckAge = -1;                 // >= 0 while destroyed (ember pulse timer)
  const emberPhase = rng() * Math.PI * 2;
  // ammo-rack turret pop (physics arc + spin, settles askew on the hull)
  let popActive = false;
  let popT = 0;
  let popYaw0 = 0;
  const POP_V0 = 6.2, POP_G = 13.5, POP_SPIN = 3.6, POP_SETTLE_Y = -0.18;

  /** Settled wreck pose: turret knocked askew and dropped into the hull. */
  function settleTurret() {
    turretG.rotation.z = 0.16;
    turretG.rotation.y = popYaw0 + 0.5;
    turretG.position.y = armor.turretPivot[1] + POP_SETTLE_Y;
    turretG.position.x = 0;
    popActive = false;
  }

  /** Plain-kill wreck pose: turret stays seated, just knocked a touch loose. */
  function settleSubtle() {
    turretG.rotation.z = 0.045;
    turretG.rotation.y = popYaw0 + 0.09;
    turretG.position.y = armor.turretPivot[1] - 0.05;
    turretG.position.x = 0;
    popActive = false;
  }

  /** Evaluate the turret-pop arc at popT (also used frozen by composers). */
  function applyPop() {
    const t = popT;
    const h = POP_V0 * t - 0.5 * POP_G * t * t;
    if (h <= POP_SETTLE_Y && t > 0.2) { settleTurret(); return; }
    turretG.position.y = armor.turretPivot[1] + Math.max(h, POP_SETTLE_Y);
    turretG.position.x = Math.min(t * 0.35, 0.3);
    turretG.rotation.y = popYaw0 + POP_SPIN * t;
    turretG.rotation.z = Math.min(0.16 + t * 0.4, 0.55);
    gunG.rotation.x = Math.min(0.12 + t * 0.25, 0.3);
  }

  const visual = {
    root,
    specId,
    dims: { lengthM: spec.dims.overallLengthM, widthM: spec.dims.widthM, heightM: spec.dims.heightM },
    boundingRadiusM: armor.boundingRadiusM,

    /** Apply a TankState (§2.4) to the visual hierarchy. */
    syncFromState(state) {
      root.position.copy(state.pos);
      // Turn-lean sway: the hull banks INTO speed × yaw-rate (visual layer on
      // top of the sim's 4-corner attitude spring).
      const swayTarget = destroyed ? 0 : Math.max(-0.10, Math.min(0.10, state.yawRate * state.speed * 0.035));
      sway += (swayTarget - sway) * 0.10;
      // Gun-fire hull rock: recoil reaction fed through the flinch spring —
      // firing pitches the hull 2-3 deg away from the gun azimuth then
      // settles (r5: the 1.2 magnitude was imperceptible from third person).
      if (recoilPending) {
        recoilPending = false;
        if (!destroyed) {
          const yawW = state.yaw + state.turretYaw;
          const mag = 2.6 * Math.min(1.4, ((spec.gun && spec.gun.caliberMm) || 100) / 100);
          visual.hitFlinch(-Math.sin(yawW), -Math.cos(yawW), mag, state.yaw);
        }
      }
      // Hit-flinch: caliber-scaled damped rock layered onto pitch/roll.
      // Sim-mirrored path (terrain-contact guard): route pending impulses
      // into state._flinch and RENDER the sim's values — movement.js
      // integrates the oscillator once per fixed tick and support-solves
      // pos.y against this exact pose, so a hit can never rock a track end
      // below the heightfield. Fallback path self-integrates as before.
      if (state._flinch) {
        if (pendFlinchPV !== 0 || pendFlinchRV !== 0) {
          state._flinch.pv += pendFlinchPV;
          state._flinch.rv += pendFlinchRV;
          pendFlinchPV = pendFlinchRV = 0;
        }
        flinchP = state._flinch.p;
        flinchR = state._flinch.r;
      } else {
        if (pendFlinchPV !== 0 || pendFlinchRV !== 0) {
          flinchPV += pendFlinchPV;
          flinchRV += pendFlinchRV;
          pendFlinchPV = pendFlinchRV = 0;
        }
        if (flinchP !== 0 || flinchR !== 0 || flinchPV !== 0 || flinchRV !== 0) {
          flinchPV += (-FLINCH_W * FLINCH_W * flinchP - 2 * FLINCH_Z * FLINCH_W * flinchPV) * SIM_STEP;
          flinchP += flinchPV * SIM_STEP;
          flinchRV += (-FLINCH_W * FLINCH_W * flinchR - 2 * FLINCH_Z * FLINCH_W * flinchRV) * SIM_STEP;
          flinchR += flinchRV * SIM_STEP;
          if (Math.abs(flinchP) + Math.abs(flinchPV) + Math.abs(flinchR) + Math.abs(flinchRV) < 1e-4) {
            flinchP = flinchR = flinchPV = flinchRV = 0;
          }
        }
      }
      // r5 terrain-contact gate: the rock/settle suspension spring is now
      // integrated by the SIM (movement.js state._susp — the same spring,
      // same constants, stepped once per fixed sim tick) so the terrain
      // SUPPORT SOLVE can raise pos.y against the EXACT rendered attitude.
      // A second self-timed copy here desynced from the sim at any render
      // rate != 60 fps and re-buried the tracks 5-10 cm. Read the sim's
      // values (guards: killcam ghosts / staged poses may pass states
      // without the mirror fields).
      if (!destroyed) {
        // r6: read the sim spring, then amplify the transient for the
        // RENDERED attitude only (SUSP_VIS_* above) so accel squat, brake
        // dive and turn roll are readable at gameplay camera distances.
        suspP = state._susp ? state._susp.p * SUSP_VIS_P : suspP;
        suspR = state._susp ? state._susp.r * SUSP_VIS_R : suspR;
        if (state._swayEst !== undefined) sway = state._swayEst * SWAY_VIS;
        // NO height compensation here: movement.js support-solves state.pos.y
        // at the SAME amplified pose (SUSP_VIS_*/SWAY_VIS mirrored there) so
        // the terrain-contact guarantee holds exactly at the rendered
        // attitude — the old half-lift hack floated the whole contact patch
        // 12-17 cm during full-speed turns (r1 drive gate evidence).
      }
      prevSpeed = state.speed;
      root.rotation.set(-(state.visualPitch + suspP) + flinchP, state.yaw,
        state.visualRoll + suspR + sway + flinchR, 'YXZ');
      if (destroyed) {
        // wreck: turret pose owned by the pop/settle animation, gun droops
        if (popActive) { popT += SIM_STEP; applyPop(); }
        // ember pulse: engine-deck glow throbs and cools over the first ~20 s
        if (wreckAge >= 0) {
          wreckAge += SIM_STEP;
          const decay = Math.exp(-wreckAge / 8);
          // 1.05 amplitude (was 0.65) + 0.05 floor: with the lifted burnt
          // albedo the ember pockets must visibly throb on the fresh wreck
          // (r6: hull read as a light-swallowing black hole with no glow)
          mats.burnt.emissiveIntensity =
            0.05 + 1.05 * decay * (0.55 + 0.45 * Math.sin(wreckAge * 2.4 + emberPhase));
        }
      } else {
        turretG.rotation.y = state.turretYaw;
        gunG.rotation.x = -state.gunPitch;
      }
      // per-wheel suspension conformance before the gear placement pass
      if (P.gear && groundSampler && !destroyed) P.gear.conform(state, groundSampler);
      if (P.gear) P.gear.update(state.trackScroll.l, state.trackScroll.r);
      if (recoilT < REC_BACK + REC_RETURN) {
        recoilT += SIM_STEP;
        const t = recoilT;
        let k;
        if (t < REC_BACK) {
          k = Math.sin((t / REC_BACK) * Math.PI * 0.5);      // sharp slide back
        } else {
          const u = Math.min((t - REC_BACK) / REC_RETURN, 1);
          k = Math.pow(1 - u, 1.7);                          // hydraulic return
        }
        recoilG.position.z = -REC_AMP * k;
        // cradle rock: the trunnion mount lifts a hair with the impulse
        if (!destroyed) gunG.rotation.x -= 0.014 * k;
      } else if (recoilG.position.z !== 0) {
        recoilG.position.z = 0;
      }
    },

    /** @param {THREE.Vector3} out @returns {THREE.Vector3} world-space muzzle tip */
    gunMuzzleWorld(out) { return muzzle.getWorldPosition(out); },
    /** @param {THREE.Vector3} out @returns {THREE.Vector3} world-space gun trunnion */
    gunPivotWorld(out) { return gunG.getWorldPosition(out); },
    /** @param {THREE.Vector3} out @returns {THREE.Vector3} world-space turret roof anchor */
    turretTopWorld(out) { return turretTop.getWorldPosition(out); },

    /** Kick the barrel back (visual only; self-timed) + queue the hull rock. */
    recoilKick() { recoilT = 0; recoilPending = true; },

    /**
     * Give the visual a terrain sampler for per-wheel suspension conformance.
     * @param {?(x:number, z:number) => number} fn ground height query (null disables)
     */
    setGroundSampler(fn) { groundSampler = fn; },

    /**
     * Receiving-end hull flinch: a caliber-scaled damped rock away from the
     * impact. Visual only.
     * @param {number} nx world impact-normal x @param {number} nz world z
     * @param {number} mag impulse scale (≈ caliberMm / 100)
     */
    hitFlinch(nx, nz, mag, stateYaw) {
      const yaw = stateYaw !== undefined ? stateYaw : root.rotation.y;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const f = nx * sy + nz * cy;   // forward component of the normal
      const r = nx * cy - nz * sy;   // right component
      // 0.18 (was 0.10): the r2 rock was sub-pixel at gameplay framing
      const imp = Math.min(mag, 2) * 0.18;
      // Accumulate; syncFromState routes into the sim mirror (state._flinch)
      // so the terrain-contact solve accounts for the rock (see above).
      pendFlinchPV += f * imp;       // frontal hit rocks the nose up/back
      pendFlinchRV += r * imp * 0.8;
    },

    /**
     * De-track / repair visual per side.
     * @param {'trackL'|'trackR'} module @param {boolean} broken
     */
    setTrackState(module, broken) {
      if (P.gear && P.gear.setBroken) P.gear.setBroken(module, broken);
    },

    /** Remove one ERA brick cluster (t90m). */
    stripEra(plateName) {
      const c = eraClusters.get(plateName);
      if (!c) return;
      _s.set(0, 0, 0);
      _q.identity();
      for (let i = c.start; i < c.end; i++) {
        const e = eraPlacements[i];
        if (!e._mesh) continue;
        _v.set(0, -1000, 0);
        _m.compose(_v, _q, _s);
        e._mesh.setMatrixAt(e._index, _m);
        e._mesh.instanceMatrix.needsUpdate = true;
      }
    },

    /**
     * Burnt-out wreck look. Idempotent.
     * @param {{pop?: boolean, ageS?: number}} [opts] pop=true launches the
     *   ammo-rack turret pop (physics arc + spin, self-timed through
     *   syncFromState, settles askew); ageS evaluates the arc at that age
     *   (screenshot composers freeze mid-flight). Default: settled pose.
     */
    setDestroyed(opts) {
      if (destroyed) return;
      destroyed = true;
      // lazy capture (see originalMats note): traverse NOW so GLB-swapped
      // meshes are included in the burnt swap and restorable on rematch
      originalMats.length = 0;
      root.traverse((o) => { if (o.isMesh) originalMats.push([o, o.material]); });
      for (const [mesh, mat] of originalMats) {
        if (mat.transparent) { mesh.visible = false; continue; }
        mesh.material = mats.burnt;
      }
      for (const d of decalMeshes) d.visible = false;
      // fresh wreck: embers glow bright, then pulse and cool via syncFromState
      wreckAge = Math.max(0, (opts && opts.ageS) || 0);
      mats.burnt.emissiveIntensity = 0.05 + 1.05 * Math.exp(-wreckAge / 8);
      gunG.rotation.x = 0.12; // gun droops on any death
      popYaw0 = turretG.rotation.y;
      if (opts && opts.pop) {
        // WoT ammo-rack signature: turret pops, spins, lands askew.
        popActive = true;
        popT = Math.max(0, opts.ageS || 0);
        applyPop();
      } else {
        // plain HP kill: no turret toss — it stays seated, slightly loose
        settleSubtle();
      }
    },

    /** @returns {boolean} the wreck look is currently applied */
    isDestroyed() { return destroyed; },

    /**
     * Restore the live (pre-wreck) visual for a rematch: original materials,
     * decals, neutral turret/gun pose, re-seated ERA bricks and track bands,
     * cleared flinch/recoil/pop animation state. Safe on a never-destroyed
     * tank (ERA/track restore still runs — a survivor may have lost both).
     */
    resetDestroyed() {
      if (destroyed) {
        destroyed = false;
        for (const [mesh, mat] of originalMats) { mesh.material = mat; mesh.visible = true; }
        for (const d of decalMeshes) d.visible = true;
        turretG.position.set(armor.turretPivot[0], armor.turretPivot[1], armor.turretPivot[2]);
        turretG.rotation.set(0, 0, 0);
        gunG.rotation.x = 0;
      }
      popActive = false;
      popT = 0;
      recoilT = 1e9;
      recoilPending = false;
      recoilG.position.z = 0;
      sway = 0;
      wreckAge = -1;
      mats.burnt.emissiveIntensity = 0.018;
      flinchP = flinchR = flinchPV = flinchRV = 0;
      pendFlinchPV = pendFlinchRV = 0;
      suspP = suspR = suspPV = suspRV = 0;
      prevSpeed = 0;
      if (P.gear && P.gear.setBroken) {
        P.gear.setBroken('trackL', false);
        P.gear.setBroken('trackR', false);
      }
      if (eraPlacements.length) seatEraBricks();
    },

    setVisible(v) { root.visible = v; },

    dispose() {
      for (const g of disposables) g.dispose();
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      mats.dispose();
      if (root.parent) root.parent.remove(root);
    },
  };

  // Prime articulation groups at neutral pose.
  turretG.rotation.y = 0;
  gunG.rotation.x = 0;
  if (P.gear) P.gear.update(0, 0);

  // ---- sourced-GLB swap (per-tank source of truth in specs.MODEL_SOURCE) ----
  // Dynamic import keeps GLTFLoader out of the bundle-critical path; on any
  // failure (missing file, no articulable turret node) the procedural model
  // simply remains — it is the fallback of record.
  const modelCfg = MODEL_SOURCE[specId];
  if (modelCfg && modelCfg.source === 'glb' && modelCfg.glb) {
    const ctx = { spec, cfg: modelCfg.glb, hullG, turretG, recoilG, muzzle };
    if (_modelLoaderMod && _modelLoaderMod.hasCachedGlb(modelCfg.glb.path)) {
      // GLB already parsed (garage re-entry, icon generation): swap in the
      // same frame so the first render never shows the procedural model.
      try { _modelLoaderMod.applyGlbModelSync(ctx); }
      catch (e) { console.warn(`[tankFactory] ${specId}: glb swap failed, procedural retained —`, e.message); }
    } else {
      import('./modelLoader.js')
        .then((m) => { _modelLoaderMod = m; return m.applyGlbModel(ctx); })
        // PERF: the async swap lands MID-BATTLE on first boot (probe measured a
        // 773 ms frame as ~8 GLB texture uploads + program compiles hit the
        // first bound frame). Pre-upload every texture and pre-compile the
        // swapped subtree's programs off the render path.
        .then((ok) => {
          if (!ok || !engineCtx.renderer) return;
          const R = engineCtx.renderer;
          root.traverse((o) => {
            const mats2 = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
            for (const m of mats2) {
              for (const k of Object.keys(m)) {
                const v = m[k];
                if (v && v.isTexture && v.image) { try { R.initTexture(v); } catch (_) { /* fine */ } }
              }
            }
          });
          if (engineCtx.camera && engineCtx.scene && R.compileAsync) {
            R.compileAsync(root, engineCtx.camera, engineCtx.scene).catch(() => {});
          }
        })
        .catch((e) => console.warn(`[tankFactory] ${specId}: glb swap failed, procedural retained —`, e.message));
    }
  }

  return visual;
}
