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

function trackLoopPoints({ idler, sprocket, botY, topY, sag = 0.03 }) {
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
  // top run: sprocket top -> idler top, held up to the roller line with
  // catenary-style sag between support points
  const zs = sprocket.z, zi = idler.z;
  const ys = sprocket.y + sprocket.r + CLEAR, yi = idler.y + idler.r + CLEAR;
  // multiple catenary dips between support points (dead track droops every
  // wheel span, not one long bow — r5 sag readability)
  const TOP_STEPS = 16;
  for (let k = 0; k <= TOP_STEPS; k++) {
    const t = k / TOP_STEPS;
    const base = ys + (yi - ys) * t;
    const y = k === 0 || k === TOP_STEPS
      ? base
      : Math.max(topY, base) - sag * (0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI * 4.5))) * Math.min(1, Math.sin(t * Math.PI) * 3);
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
    return { tire: null, disc: mergeAll(discs) };
  }
  // Rubber band + a dark hub-well ring: the well sits between dish and hub so
  // the hub reads against shadow (r5: wheels merged into one flat plate).
  const tire = mergeAll([
    cylX(r, w, seg),
    cylX(r * 0.40, w * 1.2, seg),                        // hub shadow well
  ]);
  // Painted dish stands PROUD of the tire caps and covers 82% of the radius —
  // real road wheels read as painted steel discs with a clearly visible dark
  // rubber rim, never as full-face painted circles (r3 + r5 critiques).
  discs.push(cylX(r * 0.82, w * 1.14, seg));
  discs.push(cylX(r * 0.24, w * 1.38, 10));              // hub
  discs.push(cylX(r * 0.14, w * 1.54, 8));               // hub cap
  boltRing(discs, r, w, 8);
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
      parts.push(xform(box(w * 0.16, r * 0.3, r * 0.16),
        off, Math.sin(a) * r * 0.99, Math.cos(a) * r * 0.99, a, 0, 0));
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

  const { tire, disc } = wheelGeo(style, wheelR, wheelW, seg);
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
    // PERF: sprocket/idler are wrapped by the casting track band — no cast
    sm.castShadow = im2.castShadow = false;
    sm.receiveShadow = im2.receiveShadow = true;
    hullG.add(sm, im2);
    spinners.push({ mesh: sm, r: sprocket.r, side }, { mesh: im2, r: idler.r, side });
  }

  // tracks — visible sag on the top run when there are no return rollers
  // (WW2 dead-track runs droop hard between supports — r5 track gate)
  const sag = rollers.length ? 0.022 : 0.075;
  const pts = trackLoopPoints({ idler: { ...idler, y: idler.y }, sprocket, botY, topY, sag });
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
      _s.set(1, 1, 1);
      _m.compose(_v, _q, _s);
      linkIM.setMatrixAt(i, _m);
    }
    linkIM.instanceMatrix.needsUpdate = true;
  };

  // de-track state: 0 = healthy, 1 = thrown (band slumps, links sag)
  let brokenL = 0;
  let brokenR = 0;
  const tlY0 = tl.position.y, trY0 = tr.position.y;

  P.gear = {
    update(l, r) {
      for (const { im, list } of made) {
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
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
     * De-track visual: the thrown band slumps off the wheels and the link
     * chain sags with it; restored when the module repairs.
     * @param {'trackL'|'trackR'} module @param {boolean} broken
     */
    setBroken(module, broken) {
      if (module === 'trackL') { brokenL = broken ? 1 : 0; tl.position.y = tlY0 - brokenL * 0.09; tl.rotation.x = brokenL * 0.02; }
      else { brokenR = broken ? 1 : 0; tr.position.y = trY0 - brokenR * 0.09; tr.rotation.x = -brokenR * 0.02; }
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
  P.add('hull', cylX(0.42, 2.6, P.q ? 28 : 12), 0, 0.82, 2.72);                 // cast transmission nose
  P.add('hull', box(1.9, 0.4, 0.5), 0, 0.63, 2.5);
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
  // exhausts + Feifel canisters
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.085, 0.085, 0.75, 10), s * 0.5, 2.2, -3.24);
    P.add('hullDetail', cylY(0.11, 0.11, 0.5, 10, false), s * 0.5, 2.05, -3.28);
    P.add('hullDetail', cylY(0.12, 0.12, 0.62, 10), s * 1.45, 1.9, -3.22);
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
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.4, wheelW: 0.12, xc: 1.42,
    wheelZs: [2.55, 2.21, 1.87, 1.53, 1.19, 0.85, 0.51, 0.17,
      -0.17, -0.51, -0.85, -1.19, -1.53, -1.87, -2.21, -2.55],
    layers: [[0.22], [-0.04], [0.09]],
    sprocket: { z: 2.92, y: 0.50, r: 0.40 }, idler: { z: -2.92, y: 0.48, r: 0.36 },
    trackW: 0.725, trackTh: 0.13, topY: 0.92,
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
  headlight(P, -0.62, 1.5, 2.1, -1.0);                                          // single left headlight
  liftEye(P, 'hullDetail', -1.15, 1.62, 1.15);
  liftEye(P, 'hullDetail', 1.15, 1.62, 1.15);
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
    trackW: 0.5, topY: 1.0, arms: true,
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
  // turret: one continuous cast lathe — flared frustum skirt flowing into a
  // flattened dome, egg-shaped in plan (the defining IS-2 casting)
  P.add('turret', xform(lathe([
    [0.95, 0.0], [0.93, 0.12], [0.86, 0.3], [0.78, 0.45], [0.72, 0.55],
    [0.64, 0.63], [0.5, 0.71], [0.32, 0.76], [0.0, 0.785],
  ], P.q ? 32 : 14, 1.15), 0, 0, -0.05));
  P.add('turret', box(0.9, 0.4, 0.45), 0, 0.28, -0.95);                         // bustle
  liftEye(P, 'turretDetail', -0.6, 0.62, -0.5);
  liftEye(P, 'turretDetail', 0.6, 0.62, -0.5);
  cupola(P, 'turret', -0.4, 0.62, -0.3, 0.24, 0.16, 5);
  // DShK AA MG on loader ring
  P.add('turretDetail', torus(0.26, 0.025, P.q ? 22 : 10), 0.42, 0.68, -0.25);
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
    trackW: 0.65, topY: 1.08, arms: true,
  });
  headlight(P, -0.6, 1.9, 1.75, -0.5);
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
  headlight(P, -0.9, 1.83, 2.15, -0.96, 0.05);                                  // headlight
  liftEye(P, 'hullDetail', -1.35, 1.87, 1.4);
  liftEye(P, 'hullDetail', 1.35, 1.87, 1.4);
  periscope(P, 'hullDetail', -0.6, 1.87, 2.0);                                  // driver periscopes on roof edge
  periscope(P, 'hullDetail', -0.35, 1.87, 2.0);
  // turret: narrow-front wedge (plan taper + sloped sides)
  P.add('turret', slab(
    [-0.52, 0, 0.70], [0.52, 0, 0.70], [0.95, 0, -0.92], [-0.95, 0, -0.92],
    [-0.40, 0.76, 0.55], [0.40, 0.76, 0.55], [0.62, 0.76, -0.95], [-0.62, 0.76, -0.95]));
  cupola(P, 'turret', -0.3, 0.76, -0.45, 0.26, 0.2, 7);
  P.add('turretDetail', box(0.3, 0.06, 0.4), 0.3, 0.8, -0.6);                   // roof vent plate
  P.addGunExtra(cylX(0.26, 0.92, P.q ? 26 : 12), 0, 0.02, 0.68);                // rolling-pin mantlet
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
  P.add('hullWood', cylX(0.13, 2.6, 12), 0, 1.35, -3.35);
  headlight(P, -0.7, 1.4, 2.2, -0.38);                                          // headlight
  liftEye(P, 'hullDetail', -1.2, 1.46, 1.55);
  liftEye(P, 'hullDetail', 1.2, 1.46, 1.55);
  // slat cage around engine rear corners
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.05, 0.55, 0.02), s * 1.72, 0.9, -2.7 - k * 0.18);
  }
  for (let k = 0; k < 10; k++) P.add('hullDetail', box(0.02, 0.55, 0.05), -1.35 + k * 0.3, 0.9, -3.58);
  // turret: smooth rounded cast dome (lathe profile — flared skirt rolling
  // into a low crown), egg-stretched in plan; ERA cladding goes on top
  P.add('turret', xform(lathe([
    [0.95, 0.0], [0.94, 0.1], [0.88, 0.25], [0.80, 0.4], [0.70, 0.5],
    [0.56, 0.57], [0.36, 0.615], [0.0, 0.63],
  ], P.q ? 30 : 14, 1.12), 0, 0, -0.05));
  P.add('turret', frustum(0.55, 0.8, 0.1, 0.45, 0.62, 0.1, 0.05, 0.55));        // cheek mass
  P.add('turret', box(1.3, 0.52, 0.75), 0, 0.27, -0.98);                        // bustle box
  P.add('turretDetail', box(1.28, 0.03, 0.72), 0, 0.56, -0.98);                 // bustle mesh top rail
  P.add('turretDetail', cylX(0.07, 1.5, 10), 0, 0.64, -1.15);                   // snorkel tube
  // Sosna-U sight (left of gun), commander pano, Kord RWS, met mast
  P.add('turret', box(0.4, 0.3, 0.34), -0.38, 0.72, 0.42);
  P.add('turretDark', box(0.3, 0.18, 0.06), -0.38, 0.74, 0.6);
  P.add('turretGlass', box(0.24, 0.12, 0.02), -0.38, 0.74, 0.635);              // Sosna-U lens
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
    trackW: 0.58, topY: 0.88, arms: true,
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
  for (const s of [-1, 1]) P.add('hullDark', cylZ(0.3, 0.05, P.q ? 28 : 12), s * 0.75, 1.35, -3.87);
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
  headlight(P, -1.3, 0.92, 3.68, -0.35);
  headlight(P, 1.3, 0.92, 3.68, -0.35);
  liftEye(P, 'hullDetail', -1.4, 1.75, -0.5);
  liftEye(P, 'hullDetail', 1.4, 1.75, -0.5);
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
  P.add('turretGlass', box(0.27, 0.1, 0.02), 0.55, 0.73, 0.875);                // EMES lens
  P.add('turretDetail', box(0.36, 0.04, 0.34), 0.55, 0.82, 0.7);
  // PERI R17 panoramic periscope on stalk — tallest point
  P.add('turretDetail', cylY(0.06, 0.07, 0.42, 12), 0.32, 1.03, -0.55);
  P.add('turretDark', box(0.2, 0.24, 0.24), 0.32, 1.34, -0.55);
  P.add('turretGlass', box(0.14, 0.14, 0.02), 0.32, 1.36, -0.425);              // PERI window
  liftEye(P, 'turretDetail', -0.85, 0.85, 0.1);
  liftEye(P, 'turretDetail', 0.85, 0.85, -0.3);
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
  hullGlass: ['hullG', 'glass'],
  turret: ['turretG', 'hull'], turretDetail: ['turretG', 'detail'], turretDark: ['turretG', 'dark'],
  turretCloth: ['turretG', 'canvasCloth'], turretGlass: ['turretG', 'glass'],
  gun: ['recoilG', 'barrel'], gunDark: ['recoilG', 'dark'], gunMount: ['gunG', 'hull'],
  gunMountDark: ['gunG', 'dark'],
  // spare track links (worn steel) + baked-shadow AO panels
  hullTrack: ['hullG', 'trackLink'], turretTrack: ['turretG', 'trackLink'],
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

  BUILDERS[specId](P);

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
    const brick = box(0.26, 0.12, 0.1);
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
  const originalMats = [];
  root.traverse((o) => { if (o.isMesh) originalMats.push([o, o.material]); });

  // ---- animation-layer state (visual only, self-timed at SIM_STEP) ---------
  let groundSampler = null;          // (x, z) => terrain height, set by integration
  let sway = 0;                      // turn-lean roll (rad), smoothed
  let flinchP = 0, flinchR = 0;      // hit-reaction damped oscillator
  let flinchPV = 0, flinchRV = 0;
  const FLINCH_W = 13, FLINCH_Z = 0.32;
  // suspension spring: underdamped pitch/roll rock layered on the sim's stiff
  // 4-corner attitude — squat on accel, dive on braking, bounce over ruts.
  // Works in visualPitch/visualRoll space (nose-up positive / right-down
  // positive) and is ADDED to the sim attitude before the root rotation.
  let suspP = 0, suspR = 0, suspPV = 0, suspRV = 0;
  let prevSpeed = 0;
  const SUSP_W = 7.5, SUSP_Z = 0.30;
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
      const swayTarget = destroyed ? 0 : Math.max(-0.055, Math.min(0.055, state.yawRate * state.speed * 0.016));
      sway += (swayTarget - sway) * 0.10;
      // Gun-fire hull rock: recoil reaction fed through the flinch spring —
      // firing forward pitches the nose up 1-2 deg then settles.
      if (recoilPending) {
        recoilPending = false;
        if (!destroyed) {
          const yawW = state.yaw + state.turretYaw;
          const mag = 1.2 * Math.min(1.4, ((spec.gun && spec.gun.caliberMm) || 100) / 100);
          visual.hitFlinch(-Math.sin(yawW), -Math.cos(yawW), mag, state.yaw);
        }
      }
      // Hit-flinch: caliber-scaled damped rock layered onto pitch/roll.
      if (flinchP !== 0 || flinchR !== 0 || flinchPV !== 0 || flinchRV !== 0) {
        flinchPV += (-FLINCH_W * FLINCH_W * flinchP - 2 * FLINCH_Z * FLINCH_W * flinchPV) * SIM_STEP;
        flinchP += flinchPV * SIM_STEP;
        flinchRV += (-FLINCH_W * FLINCH_W * flinchR - 2 * FLINCH_Z * FLINCH_W * flinchRV) * SIM_STEP;
        flinchR += flinchRV * SIM_STEP;
        if (Math.abs(flinchP) + Math.abs(flinchPV) + Math.abs(flinchR) + Math.abs(flinchRV) < 1e-4) {
          flinchP = flinchR = flinchPV = flinchRV = 0;
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
        suspP = state._susp ? state._susp.p : suspP;
        suspR = state._susp ? state._susp.r : suspR;
        if (state._swayEst !== undefined) sway = state._swayEst;
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
          mats.burnt.emissiveIntensity =
            0.02 + 0.65 * decay * (0.55 + 0.45 * Math.sin(wreckAge * 2.4 + emberPhase));
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
      flinchPV += f * imp;           // frontal hit rocks the nose up/back
      flinchRV += r * imp * 0.8;
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
      for (const [mesh, mat] of originalMats) {
        if (mat.transparent) { mesh.visible = false; continue; }
        mesh.material = mats.burnt;
      }
      for (const d of decalMeshes) d.visible = false;
      // fresh wreck: embers glow bright, then pulse and cool via syncFromState
      wreckAge = Math.max(0, (opts && opts.ageS) || 0);
      mats.burnt.emissiveIntensity = 0.02 + 0.65 * Math.exp(-wreckAge / 8);
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
    const ctx = { spec, cfg: modelCfg.glb, hullG, turretG, recoilG };
    if (_modelLoaderMod && _modelLoaderMod.hasCachedGlb(modelCfg.glb.path)) {
      // GLB already parsed (garage re-entry, icon generation): swap in the
      // same frame so the first render never shows the procedural model.
      try { _modelLoaderMod.applyGlbModelSync(ctx); }
      catch (e) { console.warn(`[tankFactory] ${specId}: glb swap failed, procedural retained —`, e.message); }
    } else {
      import('./modelLoader.js')
        .then((m) => { _modelLoaderMod = m; return m.applyGlbModel(ctx); })
        .catch((e) => console.warn(`[tankFactory] ${specId}: glb swap failed, procedural retained —`, e.message));
    }
  }

  return visual;
}
