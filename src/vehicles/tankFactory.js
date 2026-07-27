// src/vehicles/tankFactory.js — procedural constructors for the 8-tank roster.
// Recognizable replicas composed from BufferGeometries (ARCHITECTURE §3.3.2).
// No top-level side effects; all randomness seeded; time arrives via syncFromState
// (assumed render cadence of 1/60 s per call for the self-timed recoil animation).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getSpec } from './specs.js';
import { createTankMaterials } from './materials.js';

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const D2R = Math.PI / 180;
const SIM_STEP = 1 / 60;

// ---- module-scope scratch (no per-frame allocation) ------------------------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _X = new THREE.Vector3(1, 0, 0);

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

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylY = (rT, rB, h, seg = 14, open = false, th0 = 0, thL = Math.PI * 2) =>
  new THREE.CylinderGeometry(rT, rB, h, seg, 1, open, th0, thL);
const cylX = (r, len, seg = 14, r2) => xform(cylY(r, r2 ?? r, len, seg), 0, 0, 0, 0, 0, Math.PI / 2);
const cylZ = (r, len, seg = 14, r2) => xform(cylY(r, r2 ?? r, len, seg), 0, 0, 0, Math.PI / 2, 0, 0);
const sph = (r, seg = 12, thetaLen) =>
  new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1), 0, Math.PI * 2, 0, thetaLen ?? Math.PI);
const torus = (r, tube, seg = 12, tSeg = 8) => xform(new THREE.TorusGeometry(r, tube, tSeg, seg), 0, 0, 0, Math.PI / 2, 0, 0);

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

function trackLoopPoints({ idler, sprocket, botY, topY, sag = 0.03 }) {
  const pts = [];
  const arc = (c, from, to, steps) => {
    for (let k = 0; k <= steps; k++) {
      const a = (from + ((to - from) * k) / steps) * D2R;
      pts.push([c.z + Math.sin(a) * c.r, c.y + Math.cos(a) * c.r]);
    }
  };
  // top run: sprocket top -> idler top, held up to the roller line with sag
  const zs = sprocket.z, zi = idler.z;
  const ys = sprocket.y + sprocket.r, yi = idler.y + idler.r;
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    const base = ys + (yi - ys) * t;
    const y = k === 0 || k === 4 ? base : Math.max(topY, base) - Math.sin(t * Math.PI) * sag;
    pts.push([zs + (zi - zs) * t, y]);
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
function wheelGeo(style, r, w, seg) {
  const discs = [];
  if (style === 'steel') {
    discs.push(cylX(r, w, seg));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      discs.push(xform(box(w * 1.12, r * 0.3, r * 0.62),
        0, Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5, a, 0, 0));
    }
    discs.push(cylX(r * 0.22, w * 1.3, 8));
    return { tire: null, disc: mergeAll(discs) };
  }
  const tire = cylX(r, w, seg);
  discs.push(cylX(r * 0.8, w * 1.04, seg));
  discs.push(cylX(r * 0.2, w * 1.28, 8));
  if (style === 'holes') {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      discs.push(xform(cylX(r * 0.16, w * 1.1, 8), 0, Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5));
    }
  }
  return { tire, disc: mergeAll(discs) };
}

function sprocketGeo(r, w, seg, teeth = 10) {
  const parts = [cylX(r * 0.72, w, seg)];
  for (const off of [-w / 2, w / 2]) {
    parts.push(xform(cylX(r * 0.92, w * 0.14, seg), off, 0, 0));
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * Math.PI * 2;
      parts.push(xform(box(w * 0.14, r * 0.24, r * 0.13),
        off, Math.sin(a) * r * 0.97, Math.cos(a) * r * 0.97, a, 0, 0));
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
  const seg = q ? 16 : 10;
  const {
    style = 'rubber', wheelR, wheelW, wheelZs, xc,
    layers = null,                       // interleaved x offsets pattern, else null
    sprocket, idler, rollers = [], rollerR = 0.09,
    trackW, trackTh = 0.09, topY, botY = 0.055,
  } = cfg;

  const wheelY = cfg.wheelY ?? wheelR + 0.10;
  const entries = [];
  wheelZs.forEach((z, i) => {
    const offs = layers ? layers[i % layers.length] : [0];
    for (const side of [-1, 1]) {
      for (const o of offs) entries.push({ x: side * (xc + o * side), y: wheelY, z, r: wheelR, road: true, i });
    }
  });
  const rollerEntries = [];
  for (const rl of rollers) {
    for (const side of [-1, 1]) rollerEntries.push({ x: side * xc, y: rl.y, z: rl.z, r: rl.r ?? rollerR, road: false, i: 0 });
  }

  const { tire, disc } = wheelGeo(style, wheelR, wheelW, seg);
  const made = [];
  const mkInst = (geo, mat, list) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.castShadow = im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hullG.add(im);
    made.push({ im, list });
    P.disposables.push(geo);
    return im;
  };
  if (tire) mkInst(tire, mats.rubber, entries);
  mkInst(disc, style === 'rubber' || style === 'holes' ? mats.wheels : mats.detail, entries);
  if (rollerEntries.length) {
    const rg = mergeAll([cylX(rollerR, trackW * 0.55, Math.max(8, seg - 6)), cylX(rollerR * 0.4, trackW * 0.62, 8)]);
    mkInst(rg, mats.detail, rollerEntries);
  }

  // sprocket + idler as plain meshes (they spin about X directly)
  const spinners = [];
  const sg = sprocketGeo(sprocket.r, trackW * 0.7, seg);
  const ig = mergeAll([cylX(idler.r, trackW * 0.55, seg), cylX(idler.r * 0.55, trackW * 0.62, seg), cylX(idler.r * 0.18, trackW * 0.75, 8)]);
  P.disposables.push(sg, ig);
  for (const side of [-1, 1]) {
    const sm = new THREE.Mesh(sg, mats.detail);
    sm.position.set(side * xc, sprocket.y, sprocket.z);
    const im2 = new THREE.Mesh(ig, mats.detail);
    im2.position.set(side * xc, idler.y, idler.z);
    sm.castShadow = sm.receiveShadow = im2.castShadow = im2.receiveShadow = true;
    hullG.add(sm, im2);
    spinners.push({ mesh: sm, r: sprocket.r, side }, { mesh: im2, r: idler.r, side });
  }

  // tracks
  const pts = trackLoopPoints({ idler: { ...idler, y: idler.y }, sprocket, botY, topY });
  const tg = trackBandGeo(pts, trackW, trackTh, mats.trackLinkM);
  P.disposables.push(tg);
  const tl = new THREE.Mesh(tg, mats.trackL);
  tl.position.x = -xc;
  const tr = new THREE.Mesh(tg, mats.trackR);
  tr.position.x = xc;
  tl.castShadow = tl.receiveShadow = tr.castShadow = tr.receiveShadow = true;
  hullG.add(tl, tr);

  P.gear = {
    update(l, r) {
      for (const { im, list } of made) {
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          const scroll = e.x < 0 ? l : r;
          const bob = e.road ? Math.sin(scroll * 2.7 + e.i * 1.93) * 0.012 : 0;
          _q.setFromAxisAngle(_X, scroll / e.r);
          _v.set(e.x, e.y + bob, e.z);
          _s.set(1, 1, 1);
          _m.compose(_v, _q, _s);
          im.setMatrixAt(i, _m);
        }
        im.instanceMatrix.needsUpdate = true;
      }
      for (const sp of spinners) sp.mesh.rotation.x = (sp.side < 0 ? l : r) / sp.r;
      mats.trackTexL.offset.y = -(l / mats.trackLinkM) % 1;
      mats.trackTexR.offset.y = -(r / mats.trackLinkM) % 1;
    },
  };
}

// ---------------------------------------------------------------------------
// Gun assembly (into the recoil group). cfg fractions are along barrel length.
// ---------------------------------------------------------------------------
function buildGun(P, cfg) {
  const { len, r, brake = null, sleeve = false, evac = null, collar = false, baseR = r * 1.9 } = cfg;
  const seg = P.q ? 16 : 10;
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
  if (evac !== null) g.push(xform(cylZ(r * 1.65, Math.max(0.45, len * 0.09), seg), 0, 0, evac * len));
  if (collar) g.push(xform(cylZ(r * 1.35, 0.09, seg), 0, 0, len - 0.55));
  if (brake) {
    const br = r * 1.85;
    g.push(xform(cylZ(r * 0.9, 0.42, seg), 0, 0, len - 0.23));
    g.push(xform(cylZ(br, 0.12, seg), 0, 0, len - 0.34));
    if (brake === 'double') g.push(xform(cylZ(br, 0.12, seg), 0, 0, len - 0.16));
    g.push(xform(cylZ(br * 0.8, 0.05, seg), 0, 0, len - 0.02));
  }
  for (const geo of g) P.add('gun', geo);
  P.muzzleZ = len;
}

// ---------------------------------------------------------------------------
// Small shared detail assemblies
// ---------------------------------------------------------------------------
function cupola(P, bucket, x, y, z, r, h, periscopes = 6) {
  P.add(bucket, cylY(r, r * 1.06, h, P.q ? 14 : 8), x, y + h / 2, z);
  P.add(bucket, cylY(r * 0.92, r * 0.92, 0.04, P.q ? 14 : 8), x, y + h + 0.02, z);
  if (P.q) {
    for (let k = 0; k < periscopes; k++) {
      const a = (k / periscopes) * Math.PI * 2;
      P.add(bucket === 'turret' ? 'turretDark' : 'hullDark', box(0.07, 0.05, 0.05),
        x + Math.sin(a) * r * 0.8, y + h + 0.03, z + Math.cos(a) * r * 0.8, 0, a, 0);
    }
  }
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

// ===========================================================================
// Per-tank builders
// ===========================================================================

function buildM4A3E8(P) {
  const { rng } = P;
  // hull
  P.add('hull', box(1.9, 0.67, 5.75), 0, 0.765, -0.125);                        // lower hull
  P.add('hull', frustum(1.5, 3.02, -3.13, 1.5, 2.10, -3.13, 1.10, 1.93));       // sponson + 47° glacis
  P.add('hull', cylX(0.42, 2.6, P.q ? 18 : 10), 0, 0.82, 2.72);                 // cast transmission nose
  P.add('hull', box(1.9, 0.4, 0.5), 0, 0.63, 2.5);
  fenders(P, 0.92, 1.5, 1.13, -3.1, 3.05);
  // rear deck hatches + grilles
  P.add('hull', box(0.62, 0.05, 0.8), -0.4, 1.955, -2.3);
  P.add('hull', box(0.62, 0.05, 0.8), 0.4, 1.955, -2.3);
  if (P.q) for (let k = 0; k < 5; k++) P.add('hullDark', box(1.2, 0.02, 0.06), 0, 1.965, -1.5 - k * 0.14);
  // glacis details: headlights, siren, spare tracks, bolts row
  P.add('hullDetail', cylZ(0.055, 0.07, 8), -0.55, 1.72, 2.36, -0.82, 0, 0);
  P.add('hullDetail', cylZ(0.055, 0.07, 8), 0.55, 1.72, 2.36, -0.82, 0, 0);
  P.add('hullDetail', cylY(0.05, 0.06, 0.08, 8), 0, 1.7, 2.4);
  P.add('hullDark', box(0.5, 0.05, 0.24), -0.6, 1.42, 2.72, -0.82, 0, 0);       // spare track links
  towCable(P, [[-1.1, 1.62, 2.28], [-0.5, 1.4, 2.62], [0.5, 1.4, 2.62], [1.1, 1.62, 2.28]]);
  stowage(P, 'hullCloth', rng, [[-1.25, 2.03, -1.0, 0.4, 0.18, 1.2], [1.25, 2.03, -0.6, 0.4, 0.2, 1.6]]);
  P.add('hullDetail', box(0.06, 0.5, 0.06), -1.35, 2.2, -2.9);                  // antenna base
  // turret (T23): rounded body + bustle
  P.add('turret', xform(cylY(0.78, 0.84, 0.62, P.q ? 18 : 10), 0, 0.31, 0, 0, 0, 0, [1, 1, 1.18]));
  P.add('turret', box(1.0, 0.5, 0.7), 0, 0.28, -0.95);                          // bustle
  P.add('turret', xform(cylY(0.8, 0.8, 0.05, P.q ? 18 : 10), 0, 0.645, 0, 0, 0, 0, [1, 1, 1.15]));
  cupola(P, 'turret', 0.42, 0.67, -0.25, 0.23, 0.15);
  P.add('turret', cylY(0.21, 0.21, 0.05, 10), -0.42, 0.69, -0.3);               // loader hatch
  pintleMG(P, 0.42, 0.72, -0.62);
  P.add('turretDetail', box(0.05, 0.05, 0.3), 0.35, 0.4, 0.72);                 // coax MG stub
  P.add('turretDetail', box(0.06, 0.8, 0.06), 0.6, 1.0, -1.15, 0, 0, 0.15);     // antenna
  // wide flat mantlet moves with the gun
  P.addGunExtra(box(1.28, 0.55, 0.15), 0, 0, 0.28);
  buildGun(P, { len: 3.96, r: 0.07, brake: 'single' });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.29, wheelW: 0.13, xc: 1.21,
    wheelZs: [2.32, 1.48, 0.62, -0.22, -1.08, -1.92],
    layers: [[-0.105, 0.105]],
    sprocket: { z: 2.85, y: 0.42, r: 0.32 }, idler: { z: -2.85, y: 0.38, r: 0.3 },
    rollers: [1.05, 0.2, -0.65, -1.5, -2.3].map((z) => ({ z, y: 1.02, r: 0.08 })),
    trackW: 0.58, topY: 1.1,
  });
  // HVSS bogie blocks
  for (const z of [1.9, 0.2, -1.5]) {
    P.add('hullDetail', box(0.2, 0.34, 0.9), 1.21, 0.62, z);
    P.add('hullDetail', box(0.2, 0.34, 0.9), -1.21, 0.62, z);
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
  P.add('hull', box(3.71, 0.81, 6.17), 0, 1.555, -0.075);                       // full-width superstructure
  P.add('hull', frustum(1.5, 2.92, 2.7, 1.5, 3.16, 2.7, 0.47, 1.0));            // lower front
  fenders(P, 1.13, 1.87, 1.99, -3.16, 3.16, 0.04);
  P.add('hullDetail', sph(0.1, 10), 0.55, 1.62, 3.17);                          // MG ball
  P.add('hullDetail', box(0.5, 0.16, 0.08), -0.5, 1.68, 3.18);                  // driver visor
  // exhausts + Feifel canisters
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.085, 0.085, 0.75, 10), s * 0.5, 2.2, -3.24);
    P.add('hullDetail', cylY(0.11, 0.11, 0.5, 10, false), s * 0.5, 2.05, -3.28);
    P.add('hullDetail', cylY(0.12, 0.12, 0.62, 10), s * 1.45, 1.9, -3.22);
  }
  P.add('hullDetail', cylZ(0.055, 0.07, 8), 0, 1.99, 3.1, -0.9, 0, 0);          // headlight
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.045, 0.045, 0.12, 8), s * 1.7, 2.0, 3.0); // S-mine stubs
  towCable(P, [[-1.7, 1.9, -2.2], [-1.82, 1.95, 0], [-1.7, 1.9, 2.4]]);
  towCable(P, [[1.7, 1.9, -2.2], [1.82, 1.95, 0], [1.7, 1.9, 2.4]]);
  P.add('hullDark', box(0.55, 0.05, 0.26), 0.7, 1.45, 3.19, -0.1, 0, 0);        // spare links, bow
  // turret: horseshoe (cylinder) + flat front
  P.add('turret', xform(cylY(0.92, 0.92, 0.75, P.q ? 20 : 12), 0, 0.375, -0.1));
  P.add('turret', box(1.56, 0.75, 0.5), 0, 0.375, 0.42);
  P.add('turret', box(1.6, 0.42, 0.55), 0, 0.24, -1.05);                        // stowage bin
  cupola(P, 'turret', -0.42, 0.75, -0.12, 0.27, 0.22, 5);
  P.add('turret', cylY(0.2, 0.2, 0.05, 10), 0.45, 0.77, -0.2);                  // loader hatch
  for (const s of [-1, 1]) P.add('turretDark', box(0.04, 0.28, 0.66), s * 0.94, 0.35, -0.2); // spare tracks
  P.addGunExtra(box(1.58, 0.62, 0.18), 0, 0, 0.32);                             // wide mantlet
  P.addGunExtra(cylZ(0.16, 0.5, P.q ? 14 : 8), 0, 0, 0.6);
  buildGun(P, { len: 4.93, r: 0.085, brake: 'double' });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.4, wheelW: 0.11, xc: 1.44,
    wheelZs: [2.45, 1.75, 1.05, 0.35, -0.35, -1.05, -1.75, -2.45],
    layers: [[0.13, -0.13], [0]],
    sprocket: { z: 2.9, y: 0.46, r: 0.35 }, idler: { z: -2.9, y: 0.44, r: 0.33 },
    trackW: 0.725, topY: 0.92,
  });
  stowage(P, 'hullCloth', rng, [[0, 2.02, -2.6, 1.6, 0.16, 0.7]]);
  P.decal('hull', 'cross', null, 0.5, [1.86, 1.6, 0.8], Math.PI / 2);
  P.decal('hull', 'cross', null, 0.5, [-1.86, 1.6, 0.8], -Math.PI / 2);
  P.decal('turret', 'number', '212', 0.42, [0.93, 0.38, -0.15], Math.PI / 2);
  P.decal('turret', 'number', '212', 0.42, [-0.93, 0.38, -0.15], -Math.PI / 2);
  P.topY = 0.78;
}

function buildT34(P) {
  const { rng } = P;
  P.add('hull', box(2.0, 0.65, 5.4), 0, 0.725, -0.15);                          // lower hull
  P.add('hull', frustum(1.45, 2.95, -2.55, 0.96, 1.30, -2.9, 0.7, 1.7));        // all-sloped upper hull
  P.add('hull', frustum(1.45, 2.55, 2.2, 1.45, 2.95, 2.2, 0.4, 0.7));           // lower glacis wedge
  P.add('hull', box(0.5, 0.06, 0.45), -0.5, 1.44, 2.06, -1.05, 0, 0);           // driver hatch on glacis
  P.add('hullDetail', sph(0.08, 10), 0.5, 1.35, 2.24);                          // bow MG ball
  fenders(P, 1.0, 1.5, 1.09, -3.0, 3.0, 0.03);
  // rear: round transmission hatch + louvers
  P.add('hull', xform(cylY(0.3, 0.3, 0.05, 12), 0, 0, 0, 0, 0, 0), 0, 1.06, -2.72, 0.9, 0, 0);
  if (P.q) for (let k = 0; k < 4; k++) P.add('hullDark', box(1.3, 0.02, 0.08), 0, 1.55, -2.2 - k * 0.12, -0.5, 0, 0);
  // fuel drums at 45 degrees on rear sides
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.17, 0.17, 0.85, 12), s * 1.25, 1.15, -2.4, 0, 0, s * 0.3);
  // handrails
  for (const s of [-1, 1]) {
    towCable(P, [[s * 1.28, 1.35, 1.2], [s * 1.3, 1.42, 0.0], [s * 1.28, 1.35, -1.4]], 0.018);
  }
  stowage(P, 'hullDetail', rng, [[-1.2, 1.2, 0.6, 0.35, 0.25, 1.1]]);
  // turret: cast hexagonal body with flared base
  P.add('turret', xform(cylY(0.88, 0.98, 0.4, P.q ? 12 : 9), 0, 0.2, 0.05, 0, 0.26, 0, [1, 1, 1.12]));
  P.add('turret', xform(cylY(0.72, 0.9, 0.42, P.q ? 12 : 9), 0, 0.58, 0.05, 0, 0.26, 0, [1, 1, 1.12]));
  P.add('turret', xform(cylY(0.7, 0.72, 0.06, P.q ? 12 : 9), 0, 0.82, 0.05, 0, 0.26, 0, [1, 1, 1.1]));
  for (const z of [-0.35, -0.62]) P.add('turret', sph(0.13, 10, Math.PI / 2), 0, 0.85, z);   // mushroom vents
  cupola(P, 'turret', -0.38, 0.8, 0.05, 0.22, 0.18, 5);
  P.add('turretDetail', box(0.12, 0.08, 0.12), 0.35, 0.87, 0.25);               // gunner periscope
  for (const s of [-1, 1]) {
    towCable(P, [[s * 0.8, 0.35, 0.5], [s * 0.9, 0.4, -0.1], [s * 0.8, 0.35, -0.55]], 0.016);
  }
  P.addGunExtra(box(0.5, 0.45, 0.22), 0, 0, 0.2);                               // compact mantlet
  P.addGunExtra(cylZ(0.12, 0.5, 10), 0, 0, 0.45);
  buildGun(P, { len: 4.64, r: 0.075 });
  buildRunningGear(P, {
    style: 'holes', wheelR: 0.415, wheelW: 0.2, xc: 1.25,
    wheelZs: [2.28, 1.2, 0.38, -0.44, -1.26],
    sprocket: { z: -2.7, y: 0.5, r: 0.32 }, idler: { z: 2.72, y: 0.48, r: 0.3 },
    trackW: 0.5, topY: 1.0,
  });
  P.decal('turret', 'number', '312', 0.4, [0.88, 0.35, -0.15], Math.PI / 2, 0, 0.24);
  P.decal('turret', 'number', '312', 0.4, [-0.88, 0.35, -0.15], -Math.PI / 2, 0, -0.24);
  P.topY = 0.88;
}

function buildIS2(P) {
  const { rng } = P;
  P.add('hull', box(1.8, 0.65, 5.72), 0, 0.775, 0.05);                          // lower hull
  P.add('hull', frustum(1.545, 1.85, -2.85, 1.42, 1.85, -2.85, 1.10, 1.80));    // sponson slab
  P.add('hull', frustum(1.45, 3.30, 1.85, 1.42, 1.83, 1.85, 0.95, 1.80));       // 60° upper glacis
  P.add('hull', frustum(1.45, 3.01, 2.6, 1.45, 3.30, 2.6, 0.45, 0.95));         // 30° lower glacis
  P.add('hull', frustum(1.4, -2.86, -2.86, 1.4, -3.38, -3.0, 1.2, 1.8));        // sloped rear
  P.add('hull', box(0.3, 0.12, 0.3), 0, 1.85, 1.6);                             // driver periscope hump
  fenders(P, 0.9, 1.545, 1.13, -3.35, 3.2, 0.03);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.35, 0.25, 1.0), s * 1.25, 1.95, -1.6);            // flat fuel tanks
    P.add('hullDetail', cylY(0.16, 0.16, 0.8, 12), s * 1.3, 1.35, -2.9, 0, 0, s * 0.25); // drums
  }
  towCable(P, [[-1.5, 1.75, -2.0], [-1.58, 1.8, 0.2], [-1.5, 1.75, 2.2]]);
  towCable(P, [[1.5, 1.75, -2.0], [1.58, 1.8, 0.2], [1.5, 1.75, 2.2]]);
  P.add('hullDark', box(0.6, 0.05, 0.3), -0.6, 1.35, 3.05, -1.05, 0, 0);        // spare links on glacis
  // turret: cast egg + dome
  P.add('turret', xform(cylY(0.72, 0.95, 0.55, P.q ? 16 : 10), 0, 0.275, -0.05, 0, 0, 0, [1, 1, 1.15]));
  P.add('turret', xform(sph(0.72, P.q ? 16 : 10, Math.PI / 2), 0, 0.55, -0.05, 0, 0, 0, [1, 0.42, 1.15]));
  P.add('turret', box(0.9, 0.4, 0.45), 0, 0.28, -0.95);                         // bustle
  cupola(P, 'turret', -0.4, 0.62, -0.3, 0.24, 0.16, 5);
  // DShK AA MG on loader ring
  P.add('turretDetail', torus(0.26, 0.025, P.q ? 14 : 8), 0.42, 0.68, -0.25);
  pintleMG(P, 0.42, 0.68, -0.25);
  for (const s of [-1, 1]) {
    towCable(P, [[s * 0.85, 0.3, 0.4], [s * 0.95, 0.35, -0.2], [s * 0.85, 0.3, -0.6]], 0.016);
  }
  P.addGunExtra(box(0.55, 0.55, 0.3), 0, 0.02, 0.22);                           // cast cradle
  P.addGunExtra(cylX(0.16, 0.4, 10), 0, -0.14, 0.5);                            // bulge under barrel root
  buildGun(P, { len: 5.85, r: 0.095, brake: 'double', baseR: 0.2 });
  buildRunningGear(P, {
    style: 'steel', wheelR: 0.3, wheelW: 0.16, xc: 1.22,
    wheelZs: [2.3, 1.38, 0.46, -0.46, -1.38, -2.3],
    sprocket: { z: -2.95, y: 0.41, r: 0.31 }, idler: { z: 2.95, y: 0.38, r: 0.28 },
    rollers: [1.6, 0, -1.6].map((z) => ({ z, y: 1.0, r: 0.1 })),
    trackW: 0.65, topY: 1.08,
  });
  stowage(P, 'hullDetail', rng, [[1.25, 1.2, 1.4, 0.3, 0.24, 0.9]]);
  P.decal('turret', 'number', '432', 0.4, [0.85, 0.3, -0.3], Math.PI / 2, 0, 0.24);
  P.decal('turret', 'number', '432', 0.4, [-0.85, 0.3, -0.3], -Math.PI / 2, 0, -0.24);
  P.topY = 0.75;
}

function buildPanther(P) {
  const { rng } = P;
  P.add('hull', box(2.1, 0.63, 6.4), 0, 0.835, -0.05);                          // lower hull
  P.add('hull', frustum(1.71, 2.35, -3.1, 1.32, 1.80, -3.35, 1.15, 1.85));      // sloped superstructure
  P.add('hull', frustum(1.55, 3.30, 2.3, 1.32, 1.80, 2.3, 0.8, 1.85));          // huge 55° glacis
  P.add('hull', frustum(1.55, 2.90, 2.75, 1.55, 3.30, 2.75, 0.52, 0.8));        // lower glacis
  P.add('hullDetail', sph(0.09, 10), 0.6, 1.62, 2.62);                          // ball MG in glacis
  fenders(P, 1.05, 1.71, 1.18, -3.35, 3.3, 0.03);
  // rear exhaust stacks with shrouds + stowage cylinders
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.075, 0.075, 0.9, 10), s * 0.55, 2.1, -3.42);
    P.add('hullDetail', cylY(0.1, 0.1, 0.55, 10), s * 0.55, 1.9, -3.46);
    P.add('hullDetail', cylY(0.11, 0.11, 0.5, 10), s * 1.35, 1.85, -3.35);
  }
  // Schürzen skirts — one missing, one bent, for character
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      if (s > 0 && k === 4) continue;                                            // missing plate
      const bent = s < 0 && k === 2 ? 0.07 : 0;
      P.add('hull', box(0.02, 0.55, 0.98), s * 1.73, 0.9, 2.45 - k * 1.02, bent, s * bent, 0);
    }
  }
  towCable(P, [[-1.6, 1.75, -2.4], [-1.7, 1.8, 0], [-1.6, 1.75, 2.2]]);
  P.add('hullDetail', cylZ(0.05, 0.07, 8), -0.9, 1.83, 2.15, -0.96, 0, 0);      // headlight
  // turret: narrow-front wedge (plan taper + sloped sides)
  P.add('turret', slab(
    [-0.52, 0, 0.70], [0.52, 0, 0.70], [0.95, 0, -0.92], [-0.95, 0, -0.92],
    [-0.40, 0.76, 0.55], [0.40, 0.76, 0.55], [0.62, 0.76, -0.95], [-0.62, 0.76, -0.95]));
  cupola(P, 'turret', -0.3, 0.76, -0.45, 0.26, 0.2, 7);
  P.add('turretDetail', box(0.3, 0.06, 0.4), 0.3, 0.8, -0.6);                   // roof vent plate
  P.addGunExtra(cylX(0.26, 0.92, P.q ? 16 : 10), 0, 0.02, 0.68);                // rolling-pin mantlet
  buildGun(P, { len: 5.25, r: 0.065, brake: 'double', baseR: 0.14 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.43, wheelW: 0.12, xc: 1.38,
    wheelZs: [2.55, 1.82, 1.09, 0.36, -0.37, -1.1, -1.83, -2.56],
    layers: [[0.12], [-0.12]],
    sprocket: { z: 2.95, y: 0.5, r: 0.36 }, idler: { z: -2.95, y: 0.47, r: 0.33 },
    trackW: 0.66, topY: 0.99,
  });
  stowage(P, 'hullDetail', rng, [[-1.5, 1.95, -2.7, 0.4, 0.22, 0.9], [1.5, 1.95, -2.7, 0.4, 0.22, 0.9]]);
  P.decal('hull', 'cross', null, 0.44, [1.75, 0.92, 0.95], Math.PI / 2);
  P.decal('hull', 'cross', null, 0.44, [-1.75, 0.92, 0.95], -Math.PI / 2);
  P.decal('turret', 'number', '435', 0.38, [0.82, 0.36, -0.35], Math.PI / 2, 0, 0.22);
  P.decal('turret', 'number', '435', 0.38, [-0.82, 0.36, -0.35], -Math.PI / 2, 0, -0.22);
  P.topY = 0.76;
}

function buildM1A2(P) {
  const { rng } = P;
  P.add('hull', box(2.38, 0.6, 7.6), 0, 0.75, -0.1);                            // lower hull
  P.add('hull', box(3.66, 0.5, 5.56), 0, 1.3, -1.18);                           // upper hull slab
  P.add('hull', frustum(1.78, 3.90, 1.60, 1.78, 1.60, 1.60, 1.0, 1.55));        // near-horizontal glacis
  P.add('hull', frustum(1.78, 3.50, 3.6, 1.78, 3.90, 3.6, 0.45, 1.0));          // blunt lower front
  // rear turbine grille
  P.add('hull', box(3.5, 1.0, 0.1), 0, 1.0, -3.93);
  if (P.q) for (let k = 0; k < 6; k++) P.add('hullDark', box(3.3, 0.05, 0.04), 0, 0.62 + k * 0.14, -3.99);
  // side skirts: 7 panels, front 3 heavy
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const heavy = k < 3;
      const z = 3.35 - k * 1.06;
      P.add('hull', box(heavy ? 0.09 : 0.05, 0.62, 0.99), s * 1.86, 0.79, z);
      if (P.q && heavy) P.add('hullDark', box(0.03, 0.08, 0.3), s * 1.92, 0.95, z);
    }
  }
  towCable(P, [[-1.2, 1.32, 2.9], [0, 1.42, 2.4], [1.2, 1.32, 2.9]]);
  // turret: arrowhead front + long bustle
  P.add('turret', frustum(1.12, 0.15, -1.65, 1.12, 0.05, -1.65, 0.0, 0.82));    // main body
  P.add('turret', slab(                                                          // right cheek wedge
    [0.22, 0, 1.05], [1.12, 0, 0.15], [1.12, 0, -0.2], [0.22, 0, 0.7],
    [0.22, 0.82, 0.93], [1.12, 0.82, 0.03], [1.12, 0.82, -0.32], [0.22, 0.82, 0.58]));
  P.add('turret', slab(                                                          // left cheek wedge
    [-1.12, 0, 0.15], [-0.22, 0, 1.05], [-0.22, 0, 0.7], [-1.12, 0, -0.2],
    [-1.12, 0.82, 0.03], [-0.22, 0.82, 0.93], [-0.22, 0.82, 0.58], [-1.12, 0.82, -0.32]));
  P.add('turret', box(0.44, 0.6, 0.5), 0, 0.3, 0.82);                           // gun embrasure block
  // bustle rack: pipe frame + duffel
  P.add('turretDetail', box(2.1, 0.04, 0.04), 0, 0.72, -1.93);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.04, 0.04, 0.34), s * 1.05, 0.72, -1.8);
    P.add('turretDetail', box(0.04, 0.5, 0.04), s * 1.05, 0.46, -1.93);
  }
  stowage(P, 'turretCloth', rng, [
    [-0.6, 0.5, -1.82, 0.7, 0.34, 0.3], [0.35, 0.52, -1.82, 0.8, 0.38, 0.3], [1.0, 0.46, -1.82, 0.4, 0.26, 0.28],
  ]);
  // roof furniture: CITV, GPS doghouse, CROWS, loader M240, antennas, wind mast
  P.add('turretDetail', cylY(0.13, 0.15, 0.22, 12), -0.5, 0.93, 0.35);
  P.add('turretDark', box(0.22, 0.2, 0.24), -0.5, 1.12, 0.35);                  // CITV head
  P.add('turret', box(0.5, 0.3, 0.5), 0.55, 0.97, 0.35);                        // GPS doghouse
  P.add('turretDark', box(0.42, 0.06, 0.42), 0.35, 0.85, -0.5);                 // CROWS base
  P.add('turretDetail', box(0.22, 0.3, 0.32), 0.35, 1.02, -0.5);
  P.add('turretDark', cylZ(0.03, 0.7, 8), 0.35, 1.1, -0.1);                     // CROWS .50
  P.add('turret', cylY(0.23, 0.23, 0.05, 12), -0.55, 0.84, -0.4);               // loader hatch
  pintleMG(P, -0.55, 0.84, -0.55, false);
  for (const s of [-0.85, 0.85]) P.add('turretDark', box(0.02, 0.9, 0.02), s, 1.25, -1.5, 0, 0, s * 0.1);
  P.add('turretDetail', box(0.03, 0.5, 0.03), -0.9, 1.05, -1.1);                // wind sensor mast
  smokeCluster(P, 0.85, 0.55, 0.75, 6, 0.5);
  smokeCluster(P, -0.85, 0.55, 0.75, 6, -0.5);
  P.addGunExtra(box(0.5, 0.42, 0.2), 0, 0, 0.3);                                // flat mantlet plates
  buildGun(P, { len: 5.28, r: 0.075, sleeve: true, evac: 0.55, collar: true, baseR: 0.16 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.33, wheelW: 0.23, xc: 1.5,
    wheelZs: [2.9, 1.93, 0.96, 0.0, -0.97, -1.94, -2.9],
    sprocket: { z: -3.5, y: 0.44, r: 0.33 }, idler: { z: 3.45, y: 0.42, r: 0.31 },
    trackW: 0.635, topY: 0.9,
  });
  P.decal('hull', 'number', 'B-24', 0.4, [1.92, 0.85, 2.9], Math.PI / 2);
  P.decal('hull', 'number', 'B-24', 0.4, [-1.92, 0.85, 2.9], -Math.PI / 2);
  P.decal('turret', 'number', 'B24', 0.36, [1.14, 0.4, -0.8], Math.PI / 2);
  P.topY = 0.84;
}

function buildT90M(P) {
  const { rng } = P;
  P.add('hull', box(2.62, 0.57, 6.6), 0, 0.715, -0.1);                          // lower hull
  P.add('hull', box(3.78, 0.45, 5.3), 0, 1.225, -0.75);                         // upper hull
  P.add('hull', frustum(1.7, 3.35, 1.9, 1.7, 1.85, 1.9, 0.85, 1.45));           // 68° glacis
  P.add('hull', frustum(1.7, 3.05, 3.1, 1.7, 3.35, 3.1, 0.43, 0.85));           // lower front
  // V splash board
  for (const s of [-1, 1]) P.add('hullDetail', box(0.8, 0.05, 0.08), s * 0.38, 1.28, 2.5 - Math.abs(s) * 0, -0.38, s * 0.5, 0);
  // skirts: rubber full length (ERA bricks overlay front half)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.03, 0.6, 6.6), s * 1.9, 0.75, -0.05);
  }
  // unditching log + snorkel
  P.add('hullWood', cylX(0.13, 2.6, 10), 0, 1.35, -3.35);
  P.add('hullDetail', cylZ(0.055, 0.07, 8), -0.7, 1.4, 2.2, -0.38, 0, 0);       // headlight
  // slat cage around engine rear corners
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.05, 0.55, 0.02), s * 1.72, 0.9, -2.7 - k * 0.18);
  }
  for (let k = 0; k < 10; k++) P.add('hullDetail', box(0.02, 0.55, 0.05), -1.35 + k * 0.3, 0.9, -3.58);
  // turret: low faceted dome + cheek wedges + bustle box
  P.add('turret', xform(cylY(0.78, 0.95, 0.62, P.q ? 14 : 9), 0, 0.31, -0.05, 0, 0.22, 0, [1, 1, 1.12]));
  P.add('turret', frustum(0.55, 0.8, 0.1, 0.45, 0.62, 0.1, 0.05, 0.55));        // cheek mass
  P.add('turret', box(1.3, 0.52, 0.75), 0, 0.27, -0.98);                        // bustle box
  P.add('turretDetail', box(1.28, 0.03, 0.72), 0, 0.56, -0.98);                 // bustle mesh top rail
  P.add('turretDetail', cylX(0.07, 1.5, 10), 0, 0.64, -1.15);                   // snorkel tube
  // Sosna-U sight (left of gun), commander pano, Kord RWS, met mast
  P.add('turret', box(0.4, 0.3, 0.34), -0.38, 0.72, 0.42);
  P.add('turretDark', box(0.3, 0.18, 0.06), -0.38, 0.74, 0.6);
  P.add('turretDetail', cylY(0.055, 0.055, 0.32, 8), 0.15, 0.82, -0.35);
  P.add('turretDark', cylY(0.11, 0.11, 0.18, 10), 0.15, 1.05, -0.35);           // pano head
  P.add('turretDark', box(0.16, 0.14, 0.3), 0.42, 0.78, -0.15);                 // Kord RWS
  P.add('turretDark', cylZ(0.025, 0.55, 8), 0.42, 0.82, 0.15);
  P.add('turretDetail', box(0.025, 0.4, 0.025), -0.5, 0.85, -0.6);              // met mast
  smokeCluster(P, 0.72, 0.42, 0.68, 6, 0.6);
  smokeCluster(P, -0.72, 0.42, 0.68, 6, -0.6);
  P.addGunExtra(box(0.36, 0.34, 0.2), 0, 0, 0.22);
  buildGun(P, { len: 6.0, r: 0.068, sleeve: true, evac: 0.5, baseR: 0.15 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.375, wheelW: 0.2, xc: 1.6,
    wheelZs: [2.55, 1.53, 0.51, -0.51, -1.53, -2.55],
    sprocket: { z: -3.05, y: 0.44, r: 0.33 }, idler: { z: 3.0, y: 0.42, r: 0.3 },
    rollers: [1.5, 0, -1.5].map((z) => ({ z, y: 0.95, r: 0.09 })),
    trackW: 0.58, topY: 0.88,
  });
  // ---- Relikt ERA bricks (instanced, strippable per armor plate name) ----
  P.eraCluster('glacis_era_R', (put) => {
    for (let row = 0; row < 4; row++) for (let c = 0; c < 5; c++) {
      const t = row / 4;
      put(0.16 + c * 0.31, 1.0 + t * 0.38, 3.24 - t * 1.2, -68 * D2R, 0, 0);
    }
  });
  P.eraCluster('glacis_era_L', (put) => {
    for (let row = 0; row < 4; row++) for (let c = 0; c < 5; c++) {
      const t = row / 4;
      put(-0.16 - c * 0.31, 1.0 + t * 0.38, 3.24 - t * 1.2, -68 * D2R, 0, 0);
    }
  });
  P.eraCluster('turret_era_R', (put) => {
    for (let row = 0; row < 3; row++) for (let c = 0; c < 4; c++) {
      const f = c / 4;
      put(0.3 + f * 0.62, 1.55 + row * 0.17, 0.95 - f * 0.55, -0.35, -0.7, 0);
    }
  }, true);
  P.eraCluster('turret_era_L', (put) => {
    for (let row = 0; row < 3; row++) for (let c = 0; c < 4; c++) {
      const f = c / 4;
      put(-0.3 - f * 0.62, 1.55 + row * 0.17, 0.95 - f * 0.55, -0.35, 0.7, 0);
    }
  }, true);
  P.eraCluster('side_era_R', (put) => {
    for (let c = 0; c < 5; c++) put(1.02, 1.62, 0.1 - c * 0.14, 0, Math.PI / 2, 0);
  }, true);
  P.eraCluster('side_era_L', (put) => {
    for (let c = 0; c < 5; c++) put(-1.02, 1.62, 0.1 - c * 0.14, 0, -Math.PI / 2, 0);
  }, true);
  P.eraCluster('skirt_era_R', (put) => {
    for (let c = 0; c < 8; c++) for (let row = 0; row < 2; row++)
      put(1.93, 0.62 + row * 0.26, 3.1 - c * 0.38, 0, Math.PI / 2, 0);
  });
  P.eraCluster('skirt_era_L', (put) => {
    for (let c = 0; c < 8; c++) for (let row = 0; row < 2; row++)
      put(-1.93, 0.62 + row * 0.26, 3.1 - c * 0.38, 0, -Math.PI / 2, 0);
  });
  P.decal('turret', 'number', '527', 0.4, [0.97, 0.3, -0.35], Math.PI / 2);
  P.decal('turret', 'number', '527', 0.4, [-0.97, 0.3, -0.35], -Math.PI / 2);
  P.topY = 0.78;
}

function buildLeo2A7(P) {
  const { rng } = P;
  P.add('hull', box(2.48, 0.58, 7.6), 0, 0.79, 0);                              // lower hull
  P.add('hull', box(3.75, 0.64, 4.86), 0, 1.4, -1.43);                          // upper hull slab
  P.add('hull', frustum(1.72, 3.83, 1.0, 1.72, 1.00, 1.0, 1.0, 1.72));          // sharp glacis
  P.add('hull', frustum(1.72, 3.45, 3.55, 1.72, 3.83, 3.55, 0.5, 1.0));         // lower front
  // rear plate: two cooling fan circles + exhaust grilles
  for (const s of [-1, 1]) P.add('hullDark', cylZ(0.3, 0.05, P.q ? 18 : 10), s * 0.75, 1.35, -3.87);
  if (P.q) for (let k = 0; k < 3; k++) P.add('hullDark', box(0.6, 0.05, 0.04), -1.4 + k * 0.4, 0.85, -3.89);
  // skirts: sculpted heavy blocks front third, flat rear
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      P.add('hull', box(0.11, 0.6, 0.78), s * 1.85, 0.8, 3.4 - k * 0.84);
      P.add('hull', box(0.16, 0.34, 0.5), s * 1.87, 0.95, 3.3 - k * 0.84);      // stepped relief
    }
    for (let k = 0; k < 5; k++) P.add('hull', box(0.04, 0.55 + (k % 2) * 0.06, 0.98), s * 1.86, 0.78, 0.85 - k * 1.02);
  }
  towCable(P, [[-1.3, 1.6, -3.4], [0, 1.7, -3.7], [1.3, 1.6, -3.4]]);
  // turret: base box + two spaced wedge modules (visible gap)
  P.add('turret', frustum(1.08, 0.85, -1.5, 1.08, 0.72, -1.5, 0.0, 0.82));
  P.add('turret', slab(                                                          // right wedge
    [0.1, 0.08, 1.38], [1.03, 0.08, 0.42], [1.03, 0.08, 0.1], [0.1, 0.08, 1.06],
    [0.1, 0.78, 0.99], [1.03, 0.78, 0.03], [1.03, 0.78, -0.2], [0.1, 0.78, 0.76]));
  P.add('turret', slab(                                                          // left wedge
    [-1.03, 0.08, 0.42], [-0.1, 0.08, 1.38], [-0.1, 0.08, 1.06], [-1.03, 0.08, 0.1],
    [-1.03, 0.78, 0.03], [-0.1, 0.78, 0.99], [-0.1, 0.78, 0.76], [-1.03, 0.78, -0.2]));
  // EMES 15 gunner sight recess + shutter (right wedge roof edge)
  P.add('turretDark', box(0.34, 0.16, 0.3), 0.55, 0.72, 0.72);
  P.add('turretDetail', box(0.36, 0.04, 0.34), 0.55, 0.82, 0.7);
  // PERI R17 panoramic periscope on stalk — tallest point
  P.add('turretDetail', cylY(0.06, 0.07, 0.42, 10), 0.32, 1.03, -0.55);
  P.add('turretDark', box(0.2, 0.24, 0.24), 0.32, 1.34, -0.55);
  // FLW 200 RWS
  P.add('turretDark', box(0.16, 0.2, 0.26), -0.2, 0.95, -0.65);
  P.add('turretDark', cylZ(0.025, 0.6, 8), -0.2, 1.0, -0.3);
  // stowage baskets wrapping rear + sides
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.3, 1.1), s * 1.16, 0.4, -0.95);
    stowage(P, 'turretCloth', rng, [[s * 1.12, 0.42, -0.9, 0.14, 0.22, 0.9]]);
  }
  P.add('turretDetail', box(2.2, 0.3, 0.06), 0, 0.4, -1.6);
  stowage(P, 'turretCloth', rng, [[0.3, 0.45, -1.55, 1.2, 0.26, 0.16]]);
  // 2x8 smoke dischargers in curved rows
  smokeCluster(P, 1.0, 0.5, -0.5, 4, 1.2, 0.7);
  smokeCluster(P, 1.0, 0.42, -0.75, 4, 1.4, 0.7);
  smokeCluster(P, -1.0, 0.5, -0.5, 4, -1.2, 0.7);
  smokeCluster(P, -1.0, 0.42, -0.75, 4, -1.4, 0.7);
  P.add('turretDetail', box(0.03, 0.45, 0.03), -0.85, 1.0, -1.3);               // crosswind mast
  P.addGunExtra(box(0.46, 0.4, 0.22), 0, 0, 0.28);
  buildGun(P, { len: 6.6, r: 0.068, sleeve: true, evac: 0.62, collar: true, baseR: 0.15 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.35, wheelW: 0.22, xc: 1.55,
    wheelZs: [2.95, 2.0, 1.25, 0.28, -0.69, -1.66, -2.63],
    sprocket: { z: -3.5, y: 0.46, r: 0.34 }, idler: { z: 3.45, y: 0.44, r: 0.32 },
    trackW: 0.635, topY: 0.92,
  });
  P.decal('turret', 'crossgrey', null, 0.42, [1.18, 0.35, -0.7], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.42, [-1.18, 0.35, -0.7], -Math.PI / 2);
  P.decal('hull', 'number', 'Y-124', 0.34, [0.9, 1.36, 2.59], 0, -1.2);
  P.topY = 0.85;
}

const BUILDERS = {
  m4a3e8: buildM4A3E8, tiger1: buildTiger, t34_85: buildT34, is2: buildIS2,
  panther_g: buildPanther, m1a2: buildM1A2, t90m: buildT90M, leo2a7: buildLeo2A7,
};

// Bucket -> [parent group key, material key]
const BUCKET_DEF = {
  hull: ['hullG', 'hull'], hullDetail: ['hullG', 'detail'], hullDark: ['hullG', 'dark'],
  hullRubber: ['hullG', 'rubber'], hullWood: ['hullG', 'wood'], hullCloth: ['hullG', 'canvasCloth'],
  turret: ['turretG', 'hull'], turretDetail: ['turretG', 'detail'], turretDark: ['turretG', 'dark'],
  turretCloth: ['turretG', 'canvasCloth'],
  gun: ['recoilG', 'hull'], gunDark: ['recoilG', 'dark'], gunMount: ['gunG', 'hull'],
};
const CAMO_BUCKETS = new Set(['hull', 'turret', 'gun', 'gunMount']);

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

  BUILDERS[specId](P);

  // ---- merge buckets into meshes ----
  for (const [bucket, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const [parentKey, matKey] = BUCKET_DEF[bucket];
    const merged = mergeAll(list);
    if (CAMO_BUCKETS.has(bucket)) boxUV(merged, 0.34);
    disposables.push(merged);
    const mesh = new THREE.Mesh(merged, mats[matKey]);
    mesh.castShadow = mesh.receiveShadow = true;
    ({ hullG, turretG, recoilG, gunG })[parentKey].add(mesh);
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
    const brick = box(0.26, 0.12, 0.1);
    disposables.push(brick);
    // Split hull-frame vs turret-frame bricks into two instanced meshes.
    for (const turretLocal of [false, true]) {
      const items = eraPlacements.filter((e) => e.turretLocal === turretLocal);
      if (!items.length) continue;
      const im = new THREE.InstancedMesh(brick, mats.hull, items.length);
      im.castShadow = im.receiveShadow = true;
      items.forEach((e, i) => {
        _q.setFromEuler(new THREE.Euler(e.rx, e.ry, e.rz, 'YXZ'));
        _v.set(e.x, turretLocal ? e.y - armor.turretPivot[1] : e.y, turretLocal ? e.z - armor.turretPivot[2] : e.z);
        _s.set(1, 1, 1);
        _m.compose(_v, _q, _s);
        im.setMatrixAt(i, _m);
        e._mesh = im; e._index = i;
      });
      (turretLocal ? turretG : hullG).add(im);
      eraLocal.push(im);
      if (!eraMesh) eraMesh = im;
    }
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
  const REC_BACK = 0.12, REC_RETURN = 0.5, REC_AMP = 0.22;
  const originalMats = [];
  root.traverse((o) => { if (o.isMesh) originalMats.push([o, o.material]); });

  const visual = {
    root,
    specId,
    dims: { lengthM: spec.dims.overallLengthM, widthM: spec.dims.widthM, heightM: spec.dims.heightM },
    boundingRadiusM: armor.boundingRadiusM,

    /** Apply a TankState (§2.4) to the visual hierarchy. */
    syncFromState(state) {
      root.position.copy(state.pos);
      root.rotation.set(-state.visualPitch, state.yaw, state.visualRoll);
      turretG.rotation.y = state.turretYaw;
      gunG.rotation.x = destroyed ? 0.07 : -state.gunPitch;
      if (P.gear) P.gear.update(state.trackScroll.l, state.trackScroll.r);
      if (recoilT < REC_BACK + REC_RETURN) {
        recoilT += SIM_STEP;
        const t = recoilT;
        const k = t < REC_BACK ? t / REC_BACK : Math.max(0, 1 - (t - REC_BACK) / REC_RETURN);
        recoilG.position.z = -REC_AMP * k;
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

    /** Kick the barrel back (visual only; self-timed). */
    recoilKick() { recoilT = 0; },

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

    /** Burnt-out wreck look. Idempotent. */
    setDestroyed() {
      if (destroyed) return;
      destroyed = true;
      for (const [mesh, mat] of originalMats) {
        if (mat.transparent) { mesh.visible = false; continue; }
        mesh.material = mats.burnt;
      }
      for (const d of decalMeshes) d.visible = false;
      gunG.rotation.x = 0.07;
      turretG.rotation.z = 0.035;
      turretG.position.y = armor.turretPivot[1] - 0.05;
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

  return visual;
}
