// Soviet/Russian modern family procedural profiles (fidelity oracles:
// recovered T-62/T-64/T-72/T-90 variants + PT-91M). Owned by the
// Russia-modern family agent.
//
// 2026-07-31 r4: FROM-SCRATCH rebuild of all nine tanks against the measured
// silhouette polylines in docs/references/profiles/<id>.json (the r1-r3
// donor/parametric builders are deleted, not patched). Every hull is a loft
// of measured stations, every dome a lathe of measured rings, every tube a
// measured segment stack; the r3 fitting language that already read on
// boards (Shtora eyes, K-1/K-5/Relikt/ERAWA architectures, seam-ringed
// sleeves, NSVT, glacis kit) is re-seated on the new curve-true shells.
// Oracle-parity notes (misparented drums/racks, hull-parented barrels,
// floating baselines) live per-build below and in the reference packets.
//
// Coordinate convention: authored directly in the width-normalized lab
// frame each profile JSON was traced in — ground y=0, +z forward, and the
// oracle's own (often aft-shifted) hull center, so the raw-frame component
// masks (gun overhang especially) line up. Everything is an original
// primitive construction — measured dimensions only, no source topology.
import * as THREE from 'three';
import { KIT, FITTINGS, evenStations, muzzleBore, muzzleTipDot, orientedSlab } from './kit.js';
import { vehicleAmbientFloorHook } from '../materials.js';

// NOTE: KIT bindings are only dereferenced inside build-time functions —
// never at module scope — because of the tankFactory extension-module cycle.
// THREE is used only for the t72b3m r23 light-immune flat class (kf51 r7
// precedent, leopard.js): MeshBasicMaterial renders its albedo flat from
// every view — the only route below the ~52 hemi vertical-face floor. The
// gate's white-mask overrideMaterial replaces it in the mask pass (proven).

// ---------------------------------------------------------------------------
// 2026-07-31 FROM-SCRATCH rebuild core. Authoring data: the measured
// silhouette polylines in docs/references/profiles/<id>.json (side/plan/front
// mask traces of each width-normalized local reference + 14 hull stations).
// Hulls are LOFTED STATION SLABS that follow the measured deck/belly/width
// polylines; domes are lathed against the measured whole-minus-hull curves;
// gun tubes are segment stacks with the measured radii/breaks. These are
// measurements (dimension tables), never source topology.
//
// Frame: world meters of the width-normalized lab — ground y=0, +z forward,
// the same aft-shifted oracle frames the raw-mask gun-overhang crop needs.
// Side-view mask traces lean +0.05·|x| (camera tilt), so full-width plate
// lines are authored ~0.09 below their traced values; iteration against the
// per-view overlays settles the rest.
// ---------------------------------------------------------------------------

// Piecewise-linear lookup over [[z, v], ...] breakpoints (sorted by z).
export function lerpPts(pts, z) {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) {
      const [z0, v0] = pts[i - 1], [z1, v1] = pts[i];
      return v0 + (v1 - v0) * ((z - z0) / Math.max(1e-6, z1 - z0));
    }
  }
  return pts[pts.length - 1][1];
}

// Lofted station hull following the measured curves EXACTLY.
//   deck : [[z, y]] hull plate top line (furniture excluded), rear -> front
//   belly: [[z, y]] plate underside (rear rake, flat belly, lower bow)
//   wUp  : [[z, halfW]] upper-band half width (sponson/fender line)
//   wLo  : [[z, halfW]] lower-band half width (between the tracks)
//   sponsonY: track-bay roof — the upper band lofts sponsonY->deck, the
//   lower band belly->sponsonY, both pinch out where the curves cross.
export function loftHull(P, o) {
  const { slab } = KIT;
  // sponsonY: scalar (fleet default, byte-identical) OR [[z, y]] profile
  // (t72b3m §B4: the track-bay roof lifts above the idler/sprocket wrap
  // crowns so the band never buries into the sponson slab — merkava
  // sponson-floor-station recipe). Profile z-knots join the station cuts
  // so the knees land exactly.
  const spProf = Array.isArray(o.sponsonY) ? o.sponsonY : null;
  const spAt = (z) => (spProf ? lerpPts(spProf, z) : o.sponsonY);
  const raw = [...new Set([o.deck, o.belly, o.wUp, o.wLo, ...(spProf ? [spProf] : [])].flat().map((p) => p[0]))]
    .sort((a, b) => a - b);
  // EDGE-ON PRISM LAW (docs/GEOMETRY-GATE.md, r7c): the station cameras clip
  // a ~0.52 m z-slab; an axis-aligned long box shows the front camera only
  // its end caps, so a multi-metre loft slab is INVISIBLE at every mid-span
  // station slice. Subdivide the loft at <=0.36 m pitch so every station
  // slab contains real cross-section faces. Outer silhouette is unchanged
  // (the cuts interpolate the same curves).
  const zs = [];
  for (let i = 0; i < raw.length; i++) {
    zs.push(raw[i]);
    if (i < raw.length - 1) {
      const span = raw[i + 1] - raw[i];
      const cuts = Math.floor(span / 0.36);
      for (let c = 1; c <= cuts; c++) zs.push(raw[i] + (span * c) / (cuts + 1));
    }
  }
  zs.sort((a, b) => a - b);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1];
    if (z1 - z0 < 0.015) continue;
    const d0 = lerpPts(o.deck, z0), d1 = lerpPts(o.deck, z1);
    const b0 = lerpPts(o.belly, z0), b1 = lerpPts(o.belly, z1);
    const s0 = Math.min(spAt(z0), d0 - 0.01), s1 = Math.min(spAt(z1), d1 - 0.01);
    const u0 = Math.max(s0, b0), u1 = Math.max(s1, b1);
    const wu0 = lerpPts(o.wUp, z0), wu1 = lerpPts(o.wUp, z1);
    const wl0 = lerpPts(o.wLo, z0), wl1 = lerpPts(o.wLo, z1);
    if (d0 > u0 + 0.012 || d1 > u1 + 0.012) {
      P.add('hull', slab(
        [-wu1, u1, z1], [wu1, u1, z1], [wu0, u0, z0], [-wu0, u0, z0],
        [-wu1, d1, z1], [wu1, d1, z1], [wu0, d0, z0], [-wu0, d0, z0]));
    }
    if (u0 > b0 + 0.012 || u1 > b1 + 0.012) {
      P.add('hull', slab(
        [-wl1, b1, z1], [wl1, b1, z1], [wl0, b0, z0], [-wl0, b0, z0],
        [-wl1, Math.max(u1, b1), z1], [wl1, Math.max(u1, b1), z1],
        [wl0, Math.max(u0, b0), z0], [-wl0, Math.max(u0, b0), z0]));
    }
  }
}

// Measured cast dome: lathe rings [[r, y]] (y=0 at the ring base, in the
// turret frame), plan-stretched by sz = depth/width, centered (cx, cz).
export function meshDome(P, rings, sz, cx = 0, cz = 0) {
  P.add('turret', KIT.lathe(rings, P.q ? 30 : 16, sz), cx, 0, cz);
}

// r15 CURVED DOME SHELL (t72b3m visual r4 item 1, opt-in — siblings keep
// meshDome). The certified ring polyline is geometrically near-flat across
// the crown (4 cm rise over 0.84 m), so the lathe renders as conical plates
// while the ref's cast shell reads dome through continuously CURVED normals.
// This variant keeps the silhouette BYTE-EXACT (same 30-gon, every added
// profile point sits exactly on the certified linear polyline) and rebuilds
// only the normal field: profile angles are angle-lerped between the ring
// bisectors (LatheGeometry lerps the vectors, which collapses over long
// near-flat bands) and floored at the angle a virtual spherical cap of
// radius capR would have at that ring radius. Shading-only geometry — the
// gate masks cannot see normals; the luminance gradient is tuned BY SAMPLE
// against the ref half (shaded-parity r3 done-gate).
// o.bucket (t72b3m r18 item 5b, opt-in): the crown cap can render in a
// non-camo family — the shared per-spec camo canvas drops a giant dark
// patch exactly on the cap's camera face in both heroes (box-UV accident
// of the cap mesh; the ref GLB's own UVs sample a clean region). Siblings
// keep the default camo bucket.
export function meshDomeCurved(P, rings, sz, cx = 0, cz = 0, o = {}) {
  const seg = P.q ? 30 : 16;
  const n0 = rings.length;
  const segTh = [];
  for (let i = 0; i < n0 - 1; i++) {
    const dr = rings[i + 1][0] - rings[i][0], dy = rings[i + 1][1] - rings[i][1];
    segTh.push(Math.atan2(dy, -dr)); // outward profile-normal angle from +y
  }
  const vTh = [segTh[0]];
  for (let i = 1; i < n0 - 1; i++) vTh.push((segTh[i - 1] + segTh[i]) / 2);
  vTh.push(segTh[n0 - 2]);
  const pts = [], ths = [];
  for (let i = 0; i < n0 - 1; i++) {
    const [r0, y0] = rings[i], [r1, y1] = rings[i + 1];
    const cuts = Math.max(1, Math.ceil(Math.hypot(r1 - r0, y1 - y0) / 0.055));
    for (let c = 0; c < cuts; c++) {
      const t = c / cuts;
      pts.push([r0 + (r1 - r0) * t, y0 + (y1 - y0) * t]);
      ths.push(vTh[i] + (vTh[i + 1] - vTh[i]) * t);
    }
  }
  pts.push([rings[n0 - 1][0], rings[n0 - 1][1]]);
  ths.push(vTh[n0 - 1]);
  const capR = o.capR ?? 0;
  const geo = KIT.lathe(pts, seg, sz);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const nP = pts.length;
  for (let vi = 0; vi < pos.count; vi++) {
    const j = vi % nP;
    let th = ths[j];
    // cap floor only on the roof zone (crown/shoulder, th < ~46deg) so the
    // certified wall/foot-bulge normals stay geometric.
    if (capR && th < 0.8) {
      const capTh = Math.min(0.8, Math.asin(Math.min(1, pts[j][0] / capR)));
      if (capTh > th) th = capTh;
    }
    // r20 item 4 (t72b3m, opt-in — critic r8 "kill the ball-crescent top
    // shading; ref crown reads FLAT-PLATEAU from top"): scale the roof-zone
    // tilt back down AFTER the cap floor — from-top the normals read near
    // flat while the wall/terminator zone (th >= 0.8) stays geometric.
    // Shading-only: silhouette bytes identical. Siblings never pass this.
    if (o.roofTiltScale && th < 0.8) th *= o.roofTiltScale;
    const x = pos.getX(vi), zs = pos.getZ(vi) / sz;
    const rr = Math.hypot(x, zs);
    const ux = rr > 1e-4 ? x / rr : 0, uz = rr > 1e-4 ? zs / rr : 0;
    const nx = ux * Math.sin(th), ny = Math.cos(th), nz = (uz * Math.sin(th)) / sz;
    const L = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(vi, nx / L, ny / L, nz / L);
  }
  nor.needsUpdate = true;
  P.add(o.bucket ?? 'turret', geo, cx, 0, cz);
}

// Dome-skin radius at height y for a measured ring profile (fitting seats).
export function ringSkin(rings, y) {
  let r = rings[0][0];
  for (let i = 1; i < rings.length; i++) {
    const [r0, y0] = rings[i - 1], [r1, y1] = rings[i];
    if (y <= rings[i][1]) return r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0));
    r = r1;
  }
  return r;
}

// r15 item 6 (t72b3m): chamfered roof plate — same outer face planes and
// top/bottom as a plain box, but the plan corners are cut 45° by c (center
// box + two trapezoid prisms). Every certified face keeps a full-width /
// full-depth run inside its own column band (c stays well under half a
// 0.107 column), so no printed row can move — only the "rect footprint"
// corner read goes away.
export function chamferBox(P, bucket, w, h, d, x, y, z, c = 0.04) {
  const { box, slab } = KIT;
  P.add(bucket, box(w, h, d - 2 * c), x, y, z);
  const y0 = y - h / 2, y1 = y + h / 2;
  const strip = (b0, b1, b2, b3) => P.add(bucket, slab(
    [b0[0], y0, b0[1]], [b1[0], y0, b1[1]], [b2[0], y0, b2[1]], [b3[0], y0, b3[1]],
    [b0[0], y1, b0[1]], [b1[0], y1, b1[1]], [b2[0], y1, b2[1]], [b3[0], y1, b3[1]]));
  // front strip (+z narrow edge) then rear strip (-z narrow edge), corners
  // in slab's plan order (-x,+z),(+x,+z),(+x,-z),(-x,-z)
  strip([x - w / 2 + c, z + d / 2], [x + w / 2 - c, z + d / 2], [x + w / 2, z + d / 2 - c], [x - w / 2, z + d / 2 - c]);
  strip([x - w / 2, z - d / 2 + c], [x + w / 2, z - d / 2 + c], [x + w / 2 - c, z - d / 2], [x - w / 2 + c, z - d / 2]);
}

// Gun tube as measured contour segments.
// segs: [[zStart, zEnd, sideR, sideR2?, cx?, cy?, planR?]]
// in gun-local z (0 at the gun pivot). Dark seam rings close each diameter
// break so sleeve/tube stages read as separate fittings (r3 language).
// cx (r9): tiny lateral seat for warp-biased reference tubes (t72b3m ref
// tube spans x -0.05..+0.17): the tube stays a TRUE CYLINDER (top-down
// circle law) — only its axis shifts a few cm, invisible at tank scale but
// it decides which 0.107 m plan columns the tube owns.
export function tubeGun(P, segs, opts = {}) {
  const { cylZ } = KIT;
  const seg = P.q ? 24 : 12;
  // cy (r10f): tiny per-segment vertical seat — the t72b3m ref's printed
  // band RISES toward the muzzle (mid/tip centers 1.577/1.583 vs axis
  // 1.5695); the segments stay true cylinders, only their centers step.
  // planR is the §K.2 anisotropic-section opt-in: some baked jackets are
  // measurably wider in plan than tall in side.  Undefined keeps the exact
  // historical circular geometry for every existing caller.
  for (const [z0, z1, r, r2, cx, cy, planR] of segs) {
    let geo = cylZ(r, z1 - z0, seg, r2 ?? r);
    if (planR != null) geo = KIT.xform(geo, 0, 0, 0, 0, 0, 0, [planR / r, 1, 1]);
    P.add('gun', geo, cx ?? 0, cy ?? 0, (z0 + z1) / 2);
  }
  for (const ring of opts.rings || []) {
    const [z, r, cx, cy, planR] = ring;
    let geo = cylZ(r, 0.045, seg);
    if (planR != null) geo = KIT.xform(geo, 0, 0, 0, 0, 0, 0, [planR / r, 1, 1]);
    P.add('gunDark', geo, cx ?? 0, cy ?? 0, z);
  }
  P.muzzleZ = opts.muzzle ?? segs[segs.length - 1][1];
}

// Sealed trunnion saddle for the Soviet slit mantlet: every piece is a body
// of revolution about the trunnion X-axis through the gun pivot, so no slot
// can open at any elevation. Root cone tapers onto the tube.
export function ruSaddle(P, o) {
  const { cylX, cylZ } = KIT;
  P.addGunExtra(cylX(o.rollR, o.rollW, 14), 0, 0, 0);
  P.addGunExtra(cylZ(o.rootR ?? o.rollR * 0.62, o.rootL ?? 0.55, 12, o.tubeR * 1.25), 0, 0, (o.rootL ?? 0.55) * 0.5 + 0.05);
}

// §B3.1 GUN-ASSEMBLY ACCURACY (owner directive 2026-08-06): the Russian
// mantlet BOOT — the accordion canvas dust cover every T-62/64/72/80/90
// carries between the turret face and the thermal sleeve. Grammar: TAPERED
// canvas sections following a measured polyline (slab frustums — one raked
// surface per section, never a box stack, §B1 staircase law), dark crease
// collars at the section joints, and a clamp collar tying the last fold
// onto the tube. Authored INSIDE the caller's measured root envelope: the
// polyline's extreme faces carry the replaced prism's certified lines; the
// taper sheds only far-end corners the root cone/tube already own, so the
// swap is mask-near-neutral by construction (gate-in-loop verifies).
//   o.pts   : [[z, w, h, yC], ...] gun-local section rects, root -> tube
//   o.bulge : crease-collar proudness (default 7 mm — under every §C
//             partial-pixel threshold)
//   o.clamp : false to skip the end clamp ring
// Sections are gunMount (pitch, no recoil) like every mantlet part; the
// crease/clamp collars ride gunMountDark.
export function ruBoot(P, o) {
  const { frustum, xform, cylZ } = KIT;
  const pts = o.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const [zA, wA, hA, yAr] = pts[i], [zB, wB, hB, yBr] = pts[i + 1];
    const yA = yAr ?? 0, yB = yBr ?? yA;
    // frustum builds along +Y; rotate +Y -> +Z (rx = PI/2 maps y'->z, z'->-y)
    const g = frustum(wA / 2, -(yA - hA / 2), -(yA + hA / 2),
      wB / 2, -(yB - hB / 2), -(yB + hB / 2), 0, zB - zA);
    P.addGunExtra(xform(g, 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, zA);
    if (i > 0) {
      // crease collar at the joint: elliptical ring a few mm proud of the
      // local canvas skin (the accordion fold read)
      const b = o.bulge ?? 0.007;
      P.addGunExtraDark(xform(cylZ(0.5, o.creaseD ?? 0.035, 14), 0, 0, 0, 0, 0, 0,
        [wA + b * 2, hA + b * 2, 1]), 0, yA, zA);
    }
  }
  if (o.clamp !== false) {
    const [zE, wE, hE, yEr] = pts[pts.length - 1];
    P.addGunExtraDark(xform(cylZ(0.5, 0.04, 14), 0, 0, 0, 0, 0, 0,
      [wE + 0.012, hE + 0.012, 1]), 0, yEr ?? 0, zE - 0.02);
  }
}

// §B3 ERA tile grammar on an authored slab face (owner directive
// 2026-08-06: "weird rectangular prisms that dont emulate actual armor").
// Dresses an EXISTING certified plate with the K-1 cassette read: a dark
// seam grid + a rim frame, every strip INSIDE the slab's own outline and
// <=4 mm proud of the face — under all §C partial-pixel thresholds, so no
// mask row can move. The slab keeps every certified face line; only the
// bare-prism read goes away.
//   o = { w, h, d, x, y, z, rx, ry, rz, sx (outer-face sign, default +1),
//         rows, cols, seam (width, default 0.02), proud (default 0.004),
//         inset (edge margin, default 0.025), bucket (default 'turretDark') }
export function eraTileFace(P, o) {
  const { box } = KIT;
  const sx = o.sx ?? 1, proud = o.proud ?? 0.004, inset = o.inset ?? 0.025;
  const bucket = o.bucket ?? 'turretDark';
  const seam = o.seam ?? 0.02;
  const fx = sx * (o.w / 2 + proud / 2);          // strip center off the face
  const H = o.h - inset * 2, D = o.d - inset * 2;
  const rot = [o.rx ?? 0, o.ry ?? 0, o.rz ?? 0];
  const put = (ly, lz, hh, dd) => P.add(bucket, KIT.xform(box(proud, hh, dd), fx, ly, lz),
    o.x, o.y, o.z, rot[0], rot[1], rot[2]);
  for (let r = 1; r < (o.rows ?? 2); r++) put(-H / 2 + (H * r) / (o.rows ?? 2), 0, seam, D);
  for (let c = 1; c < (o.cols ?? 3); c++) put(0, -D / 2 + (D * c) / (o.cols ?? 3), H, seam);
  // rim frame (the cassette rail read)
  put(H / 2 - seam / 2, 0, seam, D);
  put(-H / 2 + seam / 2, 0, seam, D);
  put(0, D / 2 - seam / 2, H, seam);
  put(0, -D / 2 + seam / 2, H, seam);
}
// ---------------------------------------------------------------------------
// Shared Soviet-family furniture (hull frame unless noted)
// ---------------------------------------------------------------------------

// NSVT/DShK pintle with a real cradle, receiver, finned barrel and ammo box
// (r1 bullet 8: "AA MGs are stick-blocks on posts") — turret frame.
export function nsvt(P, x, y, z, shield = false) {
  const { box, cylY, cylZ } = KIT;
  P.add('turretDark', cylY(0.025, 0.032, 0.16, 8), x, y + 0.08, z);          // pintle post
  P.add('turretDark', box(0.10, 0.06, 0.16), x, y + 0.19, z);                // cradle yoke
  P.add('turretDark', box(0.09, 0.10, 0.42), x, y + 0.27, z + 0.06);         // receiver
  P.add('turretDark', cylZ(0.024, 0.55, 8), x, y + 0.28, z + 0.50, -0.06, 0, 0); // barrel
  P.add('turretDark', cylZ(0.035, 0.10, 8), x, y + 0.295, z + 0.76, -0.06, 0, 0); // flash hider
  P.add('turretDetail', box(0.09, 0.11, 0.16), x - 0.11, y + 0.24, z - 0.04); // ammo box
  if (shield) P.add('turretDetail', box(0.34, 0.22, 0.025), x, y + 0.30, z + 0.20);
}
// Thin roof mast (met mast / antenna base / pano tower stem) — turret frame.
export function mast(P, x, yBase, z, yTop, r = 0.028, head = 0.11) {
  const { box } = KIT;
  const h = Math.max(0.05, yTop - yBase);
  P.add('turretDetail', box(r * 2, h, r * 2), x, yBase + h / 2, z);
  P.add('turretDark', box(head, head, head), x, yTop - head / 2, z);
}
// SHADOW-TONE rehook (§C revolution gray fix; pt91m r28 recipe): cloned
// slot materials KEEP the ambient floor (clone drops onBeforeCompile) and
// take an honest albedo/emissive floor so corner fittings never render
// unmovable near-black. Render-only — masks use overrideMaterial.
export function rehookClone(base, colorHex, emissiveHex) {
  const m = base.clone();
  m.onBeforeCompile = vehicleAmbientFloorHook;
  m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
  if (colorHex != null) m.color.setHex(colorHex);
  if (emissiveHex != null && m.emissive) m.emissive.setHex(emissiveHex);
  return m;
}
// ---------------------------------------------------------------------------
// FROM-SCRATCH builds (curve-lofted). World frame per module header.
// ---------------------------------------------------------------------------

// Shared Russia-family dressing at measured seats.
export function ruGlacisKit(P, o) {
  const { box, torus, headlight } = KIT;
  const yG = o.y, zG = o.z;                       // glacis mid reference
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(o.w * 0.30, 0.045, 0.05), s * o.w * 0.16, o.barY ?? (yG + 0.04), zG, -0.35, s * 0.25, 0);
    // hookBucket/hookX (t84 r32, opt-in): the t84 critic ordered the bow
    // hooks into the dark-rubber flap class (raw-gray pegs read), and the
    // default w*0.30 seat turned out to be the r31 audit's "unnamed
    // proxy-class sliver" — an explicit hookX clears the wrap-zone
    // dilation. Defaults byte-identical for every other caller.
    P.add(o.hookBucket ?? 'hullDark', box(0.10, o.hookH ?? 0.12, o.hookD ?? 0.14), s * (o.hookX ?? o.w * 0.30), o.hookY ?? yG - 0.42, o.hookZ ?? zG + 0.42, -0.3, 0, 0);
    // eyeX/eyeY (t72b3m visual r1, opt-in): the default w*0.36 seat put the
    // tow-eye tori INSIDE the bow track x-band where they poked through the
    // idler wrap and read as floating ring outlines over the front tracks
    // (critic item 4). Re-seated builds pin them on the lower bow plate.
    // eyes:false (t72b3m r18 item 8): the pale detail tori rendered as two
    // CHALK RINGS on the dark lower bow (one broke the hem silhouette) —
    // the shaded critic wants dark shackle fittings, authored by the caller.
    // eyeSplit (russia §B4 pt91m/t90m round, opt-in): tori that seat INSIDE
    // the track x-band are per-side in-lane fittings — merged into the
    // center-spanning hullDetail bucket they defeat track-clip-audit's
    // lane-local reach skip (merged AABB reach 0). Route them into the
    // per-side hullTrackDetailL/R buckets (t72b3m hullTrackTrimL/R recipe:
    // same material slot + LOD path, renders byte-identical) so each merged
    // mesh keeps an honest one-sided AABB. Default byte-identical.
    if (o.eyes !== false) P.add(o.eyeSplit ? (s < 0 ? 'hullTrackDetailL' : 'hullTrackDetailR') : 'hullDetail', torus(0.085, 0.016, 10), s * (o.eyeX ?? o.w * 0.36), o.eyeY ?? 0.50, o.eyeZ ?? zG + 0.30, Math.PI / 2, 0, 0);
  }
  // hlX (t90sm r12, opt-in): the default w*0.44 seat lands INSIDE the track
  // lane on wide hulls — with a low hlY the housings share §B4 boundary
  // voxels with the idler wrap. Default byte-identical.
  // lights:false (§4.999991 fix-round, opt-in): skip the bucket headlights
  // so the caller can mount FITTINGS.lightCluster pods on rehooked
  // shadow-olive clones at the same seats (SHADOW-TONE order — the merged
  // hullDetail/hullDark drums rendered unmovable near-black at the bow
  // corners). Default byte-identical.
  if (o.lights !== false) {
    headlight(P, -(o.hlX ?? o.w * 0.44), o.hlY ?? (yG + 0.10), zG + 0.14, -0.30, 0.05);
    headlight(P, (o.hlX ?? o.w * 0.44), o.hlY ?? (yG + 0.10), zG + 0.14, -0.30, 0.05);
  }
}

// Soviet deck furniture at explicit seats: driver hatch, engine grilles.
export function ruDeck(P, o) {
  const { box, cylY } = KIT;
  // hatchY (r10): hatch seat on the LOCAL deck line when it differs from the
  // grille plateau (t72b3m glacis hatch sits at 1.34, plateau 1.40)
  const hY = o.hatchY ?? o.deckY;
  P.add('hull', cylY(0.24, 0.24, 0.04, 14), o.hatchX ?? 0, hY + 0.025, o.hatchZ);
  P.add('hullDark', cylY(0.247, 0.247, 0.012, 14), o.hatchX ?? 0, hY + 0.032, o.hatchZ);
  // periY: near-flush driver periscopes (t72b3m r6 — ref deck line is clean)
  KIT.periscope(P, 'hullDetail', (o.hatchX ?? 0) - 0.16, o.periY ?? (o.deckY + 0.05), o.hatchZ + 0.30);
  KIT.periscope(P, 'hullDetail', (o.hatchX ?? 0) + 0.16, o.periY ?? (o.deckY + 0.05), o.hatchZ + 0.30);
  // gY/ribY (t90m PERFECTION r3, opt-in): explicit grille-plate / rib seats
  // for refs whose engine deck reads FLUSH (the t90m ref holds a clean
  // 1.365-1.368 line over its whole grille run; the default +0.026 ribs
  // printed 1.402 across five side cols). Defaults byte-identical.
  for (let i = 0; i < (o.grilles ?? 6); i++) {
    P.add('hullDark', box(o.gw ?? 1.5, 0.018, 0.075), o.gx ?? 0, (o.gY ?? o.deckY) + 0.012, o.gz - i * 0.24);
    P.add('hullDetail', box(o.gw ?? 1.5, 0.028, 0.026), o.gx ?? 0, (o.ribY ?? ((o.gY ?? o.deckY) + 0.026)), o.gz - 0.12 - i * 0.24);
  }
}

// Segmented rubber skirt band with dark inset lip (r3 language, explicit y).
// o.th: panel thickness (default 0.04) — front-view columns only register
// the band when the face is >1-2 mask pixels deep (t62mv1 r6 lesson).
export function ruSkirtBand(P, o) {
  const { box } = KIT;
  const panels = o.panels ?? 7;
  const panelD = (o.z1 - o.z0) / panels;
  const yMid = (o.yTop + o.yBot) / 2, h = o.yTop - o.yBot;
  for (const s of [-1, 1]) {
    for (let i = 0; i < panels; i++) {
      const z = o.z0 + panelD * (i + 0.5);
      const panelYBot = i === 0 && o.firstYBot !== undefined ? o.firstYBot : o.yBot;
      const panelH = o.yTop - panelYBot;
      const panelYMid = (o.yTop + panelYBot) / 2;
      // rubberBotH (pt91m r27, opt-in): split each panel into an upper camo
      // box + a lower hullRubber band at the SAME faces (the two boxes
      // partition [yBot, yTop] exactly — mask-identical, material-only).
      // The pt91m ref's legit warm class lives in this lower band (critic
      // r25 order 2); default 0 keeps the single-box call byte-identical.
      const rbH = o.rubberBotH ?? 0;
      if (rbH > 0) {
        P.add('hull', box(o.th ?? 0.04, panelH - rbH, panelD * 0.94), s * o.x, panelYMid + rbH / 2, z);
        P.add('hullRubber', box(o.th ?? 0.04, rbH, panelD * 0.94), s * o.x, panelYBot + rbH / 2, z);
      } else {
        P.add('hull', box(o.th ?? 0.04, panelH, panelD * 0.94), s * o.x, panelYMid, z);
      }
      // dressIn (pt91m r25, opt-in): pull the seam battens/bolt heads inboard
      // so the panel FACE is the station-widest course (the default battens
      // print o.x+0.027 and owned five station slices at +1.9 cm/side).
      const dIn = o.dressIn ?? 0;
      P.add('hullDark', box(0.048, panelH * 0.9, 0.02), s * (o.x + 0.003 - dIn), panelYMid, z + panelD / 2);
      P.add('hullDark', KIT.cylZ(0.014, 0.014, 8), s * (o.x + 0.015 - dIn), o.yTop - 0.07, z, 0, s * Math.PI / 2, 0);
      // bottom lip segmented per panel (edge-on prism law: a full-length
      // strip has no station-visible faces mid-span). o.lipX lets a build
      // pin the lip's outer face to a measured plan column (t72bu r3);
      // o.lipXL overrides the LEFT side (r9: the t72bu ref only crosses the
      // outer plan column with its RIGHT skirt — a symmetric 1.807 lip put
      // a full-length run in the left -1.87 column where the ref carries
      // only its K-5 course, err 2.0).
      // lipY (pt91m r25, opt-in): seat the lip band explicitly — the
      // default hangs 3 cm under yBot and printed a 0.747 floor where the
      // pt91m ref reads its 0.818 skirt line.
      P.add('hullDark', box(0.042, 0.09, panelD * 0.92),
        s * ((s < 0 ? o.lipXL : undefined) ?? o.lipX ?? (o.x - 0.002)),
        (i === 0 ? o.firstLipY : undefined) ?? (s < 0 ? o.lipYL : undefined) ?? o.lipY ?? (panelYBot - 0.03), z);
    }
  }
}

// Front/rear rubber mud flaps over the track runs.
export function ruFlaps(P, o) {
  const { box } = KIT;
  for (const s of [-1, 1]) {
    const xf = s * o.x;
    if (o.front) P.add('hullRubber', box(o.w, o.front[1], 0.045), xf, o.front[0], o.frontZ);
    if (o.rear) P.add('hullRubber', box(o.w, o.rear[1], 0.045), xf, o.rear[0], o.rearZ);
  }
}

// ---- T-90A (docs/references/profiles/t90a.json) ---------------------------
// r5 DIMS-FIRST: the print (safeScale 1.093) is 9.3% inflated vs published
// dims — published wins (gate doctrine). Envelope: body span -3.30..3.56
// (hullLength 6.86), thin tail rack to -3.72, muzzle +5.81 (overall 9.53),
// p95 roof 2.25 (heightM 2.23; mast + pano are the 2 spike columns). Ref
// curve targets kept wherever dims allow: deck 1.37-1.41, bustle top 2.02
// z -1.7..-1.05, crown plateau pushed to the dims ceiling, wedges to +2.3.
// ---- T-62MV-1 (r7 REBUILD vs the batch-10-repaired t62_bergman oracle) -----
// The oracle swapped (commit c44033c) from the old print pack to the gen2
// bergman bake; batch-10 split its fused 2A20 onto a Gun node and trimmed
// the authored-long tube to published overall (muzzle world +5.84). This
// build is authored in the BAKE's frame: hull-centered, ground y=0.
// Ref worldtrace (width-normalized 3.30): hull mask z -3.60..+3.56; deck
// 1.55-1.58, splash brow 1.61 @ +1.77..2.13, glacis fall from +2.61; rear
// rake -3.48 (0.81) -> track flat 0 from -2.41; bow wrap 0.03@1.89 ->
// 0.45@2.73; track contact -2.41..+1.83, outer edge ±1.66; fenders 1.57
// top out to ±1.54. BOW LOG: full-width ribbed log/links raft x ±1.06,
// tops 1.73..2.05 over z 2.76..3.56 (real print equipment). Dome: plan
// x -1.36..+1.39, z -0.26..+2.52 (center ~+1.13), skirt bot 1.49, sunken
// ring race to 0.72 @ z 0.34..1.77, crown 2.42-2.48 @ 0.34..0.94, front
// slope 2.00 @ 2.37; DShK receiver 2.84 (x -0.68..-1.20) with its BARREL
// forward at 2.75-2.78 over z 1.06..2.25. U-5TS: axis ~1.78, tube band
// 1.64..1.91, evac swell 1.97 @ 5.00..5.84 (trimmed muzzle).
// CERTIFIED CAPS (packet §r7): the DShK forward-barrel band (13 side
// columns 2.75-2.84 vs pub roof 2.40) and the bow-log tail columns beyond
// the hullLengthM body line are matched only up to the dims budget — no
// parity shelf is built (dims stay ~99, the batch-9 shelf lesson).
export function buildT62MV1(P) {
  const { box, cylX, cylY, cylZ, slab, buildRunningGear, stowage } = KIT;
  // BATCH-12 VERTEX ROUND + ORIENTATION REPAIR (owner bug "hull is
  // backwards"): the bergman bake's t54-frame hull faced -z with the ring
  // seated 35% from the wrong end; repair op 4 (repair_oracles.py
  // _rotate_mesh_180y) rotates HullMesh 180 deg — glacis under the gun,
  // drums/log to the tail, ring 34% from the bow (real T-62). This build is
  // authored to the CORRECTED frame (docs/references/vertex/t62mv1.json).
  // r3 TAIL DECODE (worldtrace, world z): the ref hull TUB ends at the
  // -2.72 rear plate; z -2.77..-3.35 is ONLY the overhung drum row (two
  // transverse 200 L drums, circle fit z_c -3.05 r 0.29 y_c 1.685: tops
  // 1.92-1.973 over -2.835..-3.256, 1.789..1.5 at -3.361) riding raked
  // bracket rails (ref bottoms 0.973-1.052 over -2.835..-3.15). The old
  // full-depth loft tail owned 8 columns x 0.23-0.45. Front-view: drums
  // span |x| 0.08..1.09 (tops 1.95-1.97) with a bare center gap (ref
  // 1.504 at |x|<0.06). r3 BOW DECODE: plan front is a V — center 3.13,
  // 3.157@|x|0.25-0.7, 3.31 only at the fender corners |x| 0.99..1.65;
  // ref nose belly falls 0.42@2.85 -> 0.763@3.163 (old belly sat 0.13-0.26
  // high). Hull mask INCLUDES the fused track in this print: ground run
  // 0.026 to z 2.216 with the front wrap at 2.24..2.7 (idler re-seated to
  // the real bow position 2.42) and rear fade past -2.0 (print fades its
  // sprocket band — §B6 keeps my real gear; residual certified).
  loftHull(P, {
    deck: [[-2.72, 1.42], [-2.37, 1.44], [-2.28, 1.482], [0.76, 1.482], [0.87, 1.452], [1.53, 1.452], [1.61, 1.482], [2.04, 1.482], [2.31, 1.45], [2.47, 1.42], [2.68, 1.40], [2.93, 1.33], [3.09, 1.29], [3.13, 1.27]],
    belly: [[-2.72, 0.64], [-2.55, 0.53], [-2.30, 0.46], [2.10, 0.46], [2.75, 0.44], [2.95, 0.47], [3.06, 0.55], [3.13, 0.66]],
    wUp: [[-2.72, 1.54], [1.80, 1.54], [2.40, 1.46], [2.80, 1.30], [3.10, 1.06], [3.13, 1.03]],
    wLo: [[-2.72, 0.92], [3.13, 0.95]],
    // Closed track-bay roof above the complete native return and both raised
    // terminal wraps. The previous 0.864 m mid-span floor occupied the shoe
    // run; lifting only this concealed underside preserves the measured deck,
    // outer hull, fenders and skirts.
    sponsonY: 1.14,
  });
  // BOW V-NOSE corner prisms (plan front edge 3.15@|x|0.46 -> 3.315@1.14;
  // side body band 0.35 at the 3.268 column = hullLengthM front anchor)
  P.add('hull', slab(
    [0.46, 0.84, 3.150], [1.14, 0.86, 3.315], [1.14, 0.68, 3.128], [0.46, 0.68, 3.128],
    [0.46, 1.26, 3.150], [1.14, 1.05, 3.315], [1.14, 1.26, 3.128], [0.46, 1.26, 3.128]));
  P.add('hull', slab(
    [-1.14, 0.86, 3.315], [-0.46, 0.84, 3.150], [-0.46, 0.68, 3.128], [-1.14, 0.68, 3.128],
    [-1.14, 1.05, 3.315], [-0.46, 1.26, 3.150], [-0.46, 1.26, 3.128], [-1.14, 1.26, 3.128]));
  // splash-board brow strip on the real glacis deck
  P.add('hull', box(2.5, 0.035, 0.37), 0, 1.499, 1.806, 0, 0, 0);
  ruDeck(P, { deckY: 1.482, hatchX: -0.55, hatchZ: 2.13, hatchY: 1.40, periY: 1.42, gz: -1.435, grilles: 4, gw: 1.4 });
  KIT.towCable(P, [[-1.15, 1.43, 1.11], [0, 1.482, 0.65], [1.15, 1.43, 1.11]]);
  // fender stowage boxes low on the sponson line
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.09, 1.30), s * 1.24, 1.453, s > 0 ? 0.46 : 1.30);
    P.add('hullDark', box(0.26, 0.02, 0.03), s * 1.24, 1.506, s > 0 ? 1.11 : 0.74);
  }
  // ---- TAIL DRUM ROW (decoded): two transverse 200 L drums overhanging the
  // -2.72 rear plate on raked bracket rails; bare center gap |x|<0.078 ----
  // (r 0.30 z_c -3.05, x 0.078..1.06 — ref front-view drum band ends |x|
  // ~1.06 and the ±1.09 column reads its 1.50 deck line)
  for (const s of [-1, 1]) {
    P.add('hull', cylX(0.30, 0.982, 14), s * 0.569, 1.66, -3.06);            // drum
    for (const e of [0.087, 1.051]) P.add('hullDark', cylX(0.304, 0.018, 14), s * e, 1.66, -3.06); // rim caps
    P.add('hullDark', cylX(0.303, 0.016, 14), s * 0.569, 1.66, -3.06);       // mid weld seam
    P.add('hull', box(0.12, 0.45, 0.44), s * 0.62, 1.225, -2.94);            // bracket rails
  }
  // center bracket rail, raked bottom 1.02@-2.74 -> 1.40@-3.30 (ref bottom
  // line; also carries the plan center columns to the ref's -3.315 rear)
  P.add('hull', slab(
    [-0.06, 1.02, -2.74], [0.06, 1.02, -2.74], [0.06, 1.40, -3.30], [-0.06, 1.40, -3.30],
    [-0.06, 1.45, -2.74], [0.06, 1.45, -2.74], [0.06, 1.45, -3.30], [-0.06, 1.45, -3.30]));
  // rack rear cross-frames: hard body band through the -3.38 side column
  // (the drum-circle edge alone reads a razor 0.30 band = hullLengthM
  // coin-flip; published 6.63 needs that column solidly body). Seated at
  // x ±0.30 UNDER the drums — a center plate topped the front view's bare
  // 1.494 center line.
  for (const s of [-1, 1]) P.add('hull', box(0.10, 0.27, 0.05), s * 0.30, 1.585, -3.325);
  // rear flap rails (plan rear -3.13 at |x| 1.20..1.54, ref line)
  for (const s of [-1, 1]) P.add('hull', box(0.34, 0.05, 0.40), s * 1.37, 1.40, -2.93);
  // spare-track-link rows bedded flat on the aft deck (ref top line 1.473)
  for (const s of [-1, 1]) {
    P.add('hullTrack', box(0.86, 0.08, 0.21), s * 0.53, 1.415, -2.55, 0.06, 0, 0);
    P.add('hullTrack', box(0.78, 0.07, 0.17), s * 0.49, 1.425, -2.68, 0.08, 0, 0);
  }
  // §B3.2 DENSITY (owner directive 2026-08-06, CEILING-CERT tank ->
  // mask-neutral only): common kit strictly inside the certified lines.
  // The tail-drum row carries side 1.92-1.97 over z -2.83..-3.36 and front
  // 1.92 across |x| 0.08..1.05 — the log nests UNDER the drums (top 1.36,
  // bedded through the bracket rails, §B2-connected); links + cable ride
  // FLUSH on the 1.482 deck plateau (t84 recipe).
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 1.6, r: 0.08, straps: 2, seed: 5 });
    log.position.set(0, 1.28, -2.95);
    P.hullG.add(log);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.5, seed: 9 });
    links.position.set(-0.53, 1.432, 0.60);
    P.hullG.add(links);
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: false, r: 0.018,
      pts: [[0.50, 1.468, 0.30], [0.95, 1.458, 0.90], [0.55, 1.468, 1.50]], seed: 7,
    });
    P.hullG.add(cable);
  }
  // glacis eye hooks on the lower bow (tow eyes clear of the fwd idler wrap)
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.10, 0.115, 0.13), s * 0.94, 0.816, 2.519, -0.3, 0, 0);
    P.add('hullDetail', KIT.torus(0.082, 0.016, 10), s * 1.18, 0.52, 2.88, Math.PI / 2, 0, 0);
  }
  buildRunningGear(P, {
    style: 'holes', wheelR: 0.40, wheelW: 0.28, wheelY: 0.437, xc: 1.27, dishR: 0.88,
    wheelZs: [1.278, 0.463, -0.333, -1.102, -1.815],
    // idler at the real T-62 bow seat (0.89 m behind the nose tip); ref
    // ground run reads 0.026 to z 2.216 -> contact pins (§B6 tangents)
    sprocket: { z: -2.704, y: 0.672, r: 0.235 }, idler: { z: 2.42, y: 0.545, r: 0.225 },
    rollers: [], trackW: 0.52, topY: 0.845, botY: 0.05, contactZF: 2.24, contactZR: -1.83,
    paintedEnds: true, coveredTop: false, arms: true,
  });
  // full-length fender runs + segmented outer fender-bin row (r7c prism law)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.26, 0.03, 4.46), s * 1.50, 1.482, -0.008);  // ref fender line ends 2.26/-2.24
    P.add('hullDark', box(0.22, 0.012, 0.02), s * 1.50, 1.501, -0.008);
    for (let i = 0; i < 9; i++) {
      P.add('hull', box(0.055, 0.29, 0.445), s * 1.612, 1.338, -1.908 + i * 0.4816);
      P.add('hullDark', box(0.05, 0.25, 0.02), s * 1.614, 1.333, -1.908 + i * 0.4816 + 0.232);
    }
    P.add('hull', box(0.055, 0.25, 0.39), s * 1.612, 1.26, -2.60, 0.08, 0, 0);  // aft rake bin
    P.add('hull', box(0.05, 0.10, 0.46), s * 1.60, 1.42, -2.82);               // aft fender bracket (plan -3.05 @ ±1.62)
    P.add('hull', box(0.055, 0.24, 0.315), s * 1.612, 1.325, 2.519, -0.05, 0, 0); // glacis bin
    P.add('hull', box(0.055, 0.24, 0.30), s * 1.612, 1.26, 2.86, -0.10, 0, 0);
    P.add('hull', box(0.44, 0.055, 0.54), s * 1.38, 1.142, 2.75, -0.20, 0, 0);   // front corner guards
    P.add('hull', box(0.58, 0.05, 0.30), s * 1.36, 1.10, 3.16);                  // nose fender tips (plan 3.31; inboard edge 1.07 bridges the nose slab, §B2)
    P.add('hull', box(0.025, 0.25, 0.57), s * 1.60, 1.018, 2.667);
  }
  widthAnchor(P, 1.65, 1.344, -0.463);

  // ---- turret on the normalized casting: TRUE seat (bias split deleted),
  // crown 2.40, cupola 2.42, DShK stow spike 2.43-2.44 (3 cols, p95-legal).
  // r3 DECODE: the old aft race skirt owned FIVE ONLY-PROC side_turret
  // columns (world z -0.41..-0.84 — the ref turret mask ends at -0.33) and
  // ten plan center columns (proc rear -0.789 vs ref -0.211): DELETED.
  // Ref race-drum band (bottom 0.71) runs z 0.2..1.74 -> drum widened
  // forward; KTD-2 sits over the gun root at z 1.80..2.09 (ref tops
  // 2.368-2.394 there, NOT the old 1.35..1.63 seat); dome fat rings 1.355
  // crossed the ±1.407 plan column edge at 1.354 (§C partial-pixel, 2
  // cover cols) -> rings shrunk to 1.30 max. ----
  // r3b: front view exposes the ref's TRUE dome apex at 2.27-2.33 (the side
  // 2.39-2.447 tops are all cupola/loader/DShK hardware at z 0.46..1.08) —
  // crown rings re-lathed to a 2.315 apex; fat ring 1.34 restores the ref's
  // ±1.29-1.34 front flank columns (plan ±1.407 window edge 1.354 stays
  // 14 mm clear); sz 0.74 ends the dome tail at -0.246 (the -0.325 side
  // column is the ref turret-mask void — 26 mm clear beats the AA coin-flip)
  P.turretG.position.set(0, 1.4304, 1.046);
  const rings = [[1.30, -0.022], [1.34, 0.151], [1.325, 0.410], [1.22, 0.560], [0.97, 0.680], [0.62, 0.790], [0.30, 0.852], [0.02, 0.885]];
  meshDome(P, rings, 0.74, 0, -0.30);
  P.add('turret', cylY(0.68, 0.715, 0.74, 20), 0, -0.36, -0.05); // sunken race drum (ref 0.71 band z world 0.28..1.71)
  // CHEV (§5.14 owner '<' order 2026-08-07): the MV's real fit carries the
  // K-1 turret blocks in two angled banks beside the gun — bricks 0-2 bank
  // at ~41deg from the brick-0 anchor (its k1OutI[0]=0.03 proud seat, the
  // certified 2.03-2.16 inner staircase keeps its front extent); bricks
  // 3-4 keep their arc seats (flank wrap to |x| 1.105). §B7 cap for the
  // mid-arc tuck documented in the packet.
  // TIP §5.29 (owner refinement 2026-08-07, the obr-2016 parade photo):
  // banksOff — the three banked brick courses become TWO tall flat K-1
  // panels MEETING AT A POINTED TIP at the mantlet. Tip (±0.20, 1.12):
  // the inner caps tuck against the U-5TS cast collar's flanks (collar
  // z 0.97..1.33, half-w ~0.24 there — §B2 closed vertex, gap:false; the
  // gun emerges above/behind the tip); the plan front at the inner cols
  // holds the certified 2.03-2.16w staircase (tip z 1.12 local = 2.17w).
  // Outer end (1.00, 0.58) hands off to the arc bricks 3-4 (flank wrap
  // kept EXACTLY, banksOff law). 34deg shallow V; 2-seam-row grid = the
  // MV's real 3-course K-1 wall read.
  const pD = { rings, sz: 0.74, k1Y: 0.10, k1Pitch: 0.20, k1Out: -0.06, k1OutI: [0.03, 0.02, -0.06, -0.06, -0.06], k1N: 5, k1T0: 0.30, k1Step: 0.22, k1H: 0.20, k1Chevron: { yaw: 0.72, arcFrom: 3, pitch: 0.28, bw: 0.26, bd: 0.14, d0: 0.05, banksOff: true } };
  eraRuCheeks(P, pD, 'k1');
  // (TIP r2: z 1.12 -> 1.06 / tilt -0.22 -> -0.15 / h 0.52 -> 0.48 — the
  // tilted bottom edge advanced ~6cm past the certified 2.03-2.16w
  // staircase at the inner cols; measured turret -4.3 with the DShK
  // barrel — softened to the staircase line.)
  eraRuCheeks(P, { tip: { x: 0.20, z: 1.06, ox: 1.00, oz: 0.56, y: 0.28, h: 0.48, d: 0.14, tilt: -0.15, segs: 4, rows: 2, gap: false } }, 'tip');
  // LEFT cheek raft (Luna shoulder bulge) — pulled aft to the ref's 1.84-1.95
  // plan front staircase at |x| 0.88..1.17
  P.add('turret', box(0.30, 0.42, 0.37), -0.94, 0.25, 0.61, -0.15, -0.55, 0);
  P.add('turretTrack', box(0.26, 0.33, 0.085), -1.04, 0.25, 0.71, -0.15, -0.55, 0);
  // egg fat-end REAR wedges
  P.add('turret', box(1.10, 0.25, 0.65), 0, 0.49, -0.852, -0.30, 0, 0);
  P.add('turret', box(1.25, 0.29, 0.41), 0, 0.25, -0.963, -0.18, 0, 0);
  // DShK receiver + cradle over the left shoulder (post-warp ref spike
  // 2.43-2.447 at z world 0.82..1.08 — exactly 3 side columns, p95 budget)
  P.add('turretDark', box(0.20, 0.30, 0.26), -0.775, 0.82, -0.093);
  P.add('turretDark', box(0.20, 0.05, 0.16), -0.79, 0.955, -0.093);
  P.add('turretDark', cylY(0.032, 0.040, 0.25, 8), -0.86, 0.62, -0.093);
  P.add('turretDetail', box(0.11, 0.13, 0.13), -0.60, 0.70, -0.12);
  P.add('turret', cylY(0.22, 0.24, 0.09, 14), -0.85, 0.797, -0.278);
  // stowed DShK tube transverse across the roof clamp (batch-11 parity)
  P.add('turretDark', cylX(0.085, 1.25, 10), -0.04, 0.758, -0.083);
  P.add('turretDark', box(0.10, 0.10, 0.10), 0.52, 0.73, -0.083);
  // commander cupola LEFT (ref side profile domes 2.27->2.39 over z 0.2..0.74
  // — flat 2.42 cylinders overshot it; every roof top now <=2.41 so the
  // heightM p95 dissolves to the 2.39 loader line, pct 0.4 FREE)
  P.add('turret', cylY(0.25, 0.27, 0.15, 14), -0.70, 0.875, -0.50);
  P.add('turret', cylY(0.21, 0.22, 0.06, 14), -0.70, 0.932, -0.50);
  P.add('turretDark', cylY(0.075, 0.085, 0.04, 10), -0.64, 0.935, -0.445);
  // loader hump RIGHT + vent dome (edge 0.985: covers the ref's 2.33-2.39
  // front cols at |x| 0.95-0.99 without crossing the 1.026 window)
  P.add('turret', cylY(0.24, 0.26, 0.14, 14), 0.725, 0.885, -0.324);
  P.add('turretDark', cylY(0.20, 0.20, 0.02, 12), 0.725, 0.963, -0.324);
  P.add('turret', KIT.sph(0.125, 12, Math.PI / 2), 0.26, 0.67, 0.278);
  domeRailRu(P, rings, 0.935, 0.47, 0.93);
  // §B3 census MG: DShK-class pintle on the loader ring. TIP-round §5.29
  // (owner: "more machine guns... PROMINENT"): the muzzle-down stow
  // (elev -0.5) read as no-gun — the DShK now rests in the real AA
  // posture: barrel FORWARD (CROWS law §5.07), slight droop (elev -0.18)
  // + inboard aim (ry 0.30) so the muzzle run crosses toward the 2.315
  // crown apex zone and its side line stays under the dome/cupola tops
  // (receiver+ridge top 2.38 byte-held — under the 2.39 p95 line; §C
  // pintle allowance ≤0.4 gate-pt).
  {
    // (TIP r2: elev -0.18 -> -0.32 — the level barrel's 2.26-2.31w run
    // over the 2.0-2.2 forward slope cost ~1.5 turret; the steeper droop
    // sinks the run under the dome line while the muzzle still rakes
    // visibly forward over the crown.)
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'dshk', tone: 'dark', elev: -0.32, ammo: true });
    mg.position.set(0.58, 0.615, -0.33); // receiver+ridge top 2.38 — under the 2.39 p95 line
    mg.rotation.y = 0.30;
    P.turretG.add(mg);
  }
  // ---- U-5TS: axis 1.717 (post-warp contour), pivot world +2.065, evac
  // swell 4.99..5.99, muzzle +6.03 (overall 9.34 published) ----
  P.gunG.position.set(0, 0.2866, 1.019);
  ruSaddle(P, { rollR: 0.19, rollW: 0.42, tubeR: 0.145, rootL: 0.58 });
  // §B3.1 (prism sweep 2026-08-06): the U-5TS mantlet is a rounded CAST
  // collar under a canvas boot, not a prism — elliptical frustum with the
  // SAME plan width (±0.26 -> plan front 2.34 line held at max-y) and side
  // height (±0.165 at center-x) as the old box; masks see identical
  // plan/side rectangles, only the corner read changes. Boot crease rings
  // inside the local skin + clamp where the cast meets the tube.
  P.addGunExtra(KIT.xform(cylZ(0.5, 0.36, 16, 0.4425), 0, 0, 0, 0, 0, 0, [0.52, 0.33, 1]), 0, -0.06, 0.13);
  P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.035, 16), 0, 0, 0, 0, 0, 0, [0.505, 0.318, 1]), 0, -0.058, 0.20);
  P.addGunExtraDark(KIT.xform(cylZ(0.150, 0.04, 14), 0, 0, 0), 0, -0.02, 0.325);
  // §B3.2 (2026-08-06): PKT coax port right of the tube — stub + washer
  // inside the mantlet's plan rectangle (±0.26 to z 0.31) and side band.
  P.addGunExtraDark(cylZ(0.020, 0.05, 8), 0.18, 0.02, 0.285);
  P.addGunExtraDark(cylZ(0.028, 0.010, 10), 0.18, 0.02, 0.304);
  P.addGunExtra(box(0.16, 0.30, 0.20), 0, 0.32, -0.072);    // KTD-2 support pylon (bridges root -> hood)
  // §B3.1: the KTD-2 rangefinder is a rounded pod — elliptical shell with
  // the certified top band (2.35-2.37) and ±0.15 plan width held exactly;
  // dark lens inset in the front face.
  P.addGunExtra(KIT.xform(cylZ(0.5, 0.26, 14), 0, 0, 0, 0, 0, 0, [0.30, 0.28, 1]), 0, 0.50, -0.072);
  P.add('gunMountDark', box(0.20, 0.16, 0.02), 0, 0.50, 0.052);
  // §B3.1: the Luna L-2AG is a SEARCHLIGHT — drum + glass face + yoke arms
  // + mount plate replacing the bare bracket prism. The old box's plan
  // front line (2.13 out to x -0.78) is carried by the drum face plus the
  // yoke arms at the old corner columns.
  P.addGunExtra(KIT.xform(cylZ(0.125, 0.24, 14), 0, 0, 0), -0.60, -0.03, -0.05);
  P.add('gunMountDark', KIT.xform(cylZ(0.118, 0.014, 14), 0, 0, 0), -0.60, -0.03, 0.062);
  P.addGunExtra(box(0.045, 0.17, 0.26), -0.4575, -0.05, -0.05);
  P.addGunExtra(box(0.045, 0.17, 0.26), -0.7425, -0.05, -0.05);
  P.addGunExtra(box(0.34, 0.20, 0.09), -0.60, -0.06, -0.155);
  tubeGun(P, [
    [0.40, 1.06, 0.140], [1.06, 2.93, 0.136], [2.93, 3.93, 0.142],
  ], { rings: [[0.72, 0.141], [1.06, 0.141], [1.41, 0.138], [1.76, 0.138], [2.11, 0.138], [2.46, 0.138], [2.93, 0.1425], [3.28, 0.1425], [3.63, 0.1425]], muzzle: 3.93 });
  P.add('gunDark', cylZ(0.1425, 0.05, 14), 0, 0, 3.905);    // evac front seam
  muzzleBore(P, { r: 0.1425 });  // §B3.1 (shadow-named, mask/frame-neutral)
  // §C.1 winding fix-round 2026-08-07 (fleet sweep item 4): the number quads
  // sat at the dome's max radius but at the forward-cheek z +0.51 where the
  // 0.74-squashed egg is far narrower — flat one-sided planes floating up to
  // 0.55 m off the skin (and the *0.98 sank the plane center INSIDE the
  // dome): frontleft/frontright F-vs-D read 184/127 px. Re-seated at the
  // ellipse max-width station z -0.30, radius from the band's own fat edge
  // (y 0.18) + 6 mm pin; plan line 1.344 stays inside the 1.354 window edge.
  const dx = ringSkin(rings, 0.18) + 0.006;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [dx, 0.29, -0.30], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-dx, 0.29, -0.30], -Math.PI / 2);
  P.topY = 1.10;
}

// ---- T-54B (docs/references/vertex/t54.json — PRISTINE bergman print) ------
// r30 FIRST BUILD. INCIDENT LAW (triage STATUS UPDATE 2): the pristine print
// is the VISUAL reference; author to PUBLISHED dims (hull 6.45 / overall
// 9.00 / width 3.27 / heightM spec 2.65 = the registered crown+MG
// convention). Extract -> authored: z ×0.9808 about the print hull mid
// (-1.4095 -> my 0), y ×0.9757 (print crown 2.72 -> the 2.65 spec line);
// x true (print width = pub). Print landmarks (authored frame): deck ramp
// 0.98@-3.23 -> 1.26@-2.81 (drum bumps), engine deck 1.42..1.49 over
// -2.46..-1.42, ring deck 1.38..1.44, splash lip 1.51@1.59, glacis
// 1.48@1.60 -> 1.29@3.03, nose V ~1.2@3.226 (belly rises 0.41@2.58 ->
// 1.13@2.88); belly flat 0.01 over -2.05..1.64; track outer 1.546 / fender
// edge 1.635; dome crown 2.60-2.65 over z -0.65..1.05, halfW max 1.288 @
// z 0.32, rear tip -0.71, mantlet collar band 1.94..2.09 (halfW 0.46 ->
// 0.20), tube top 1.79 (axis ~1.65), print muzzle 6.00 -> tube PINNED to
// 5.72 = rearmost + 9.00 (dims sovereign; the print runs +4.4%).
export function buildT54(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // r30b REGISTERED RE-SEAT (gate-digest, authored frame): the gate registers
  // by BODY-span mids (the print's thin nose lip is band-excluded), landing
  // the ref ~+1.466 from raw — every extract-derived seat below is from the
  // DIGEST, not the raw extract. Registered ref reads: hull deck 1.44-1.47
  // side / 1.37 front (crowned narrow ridge), glacis top 1.47@2.25 ->
  // 1.33@3.07 with a THIN NOSE LIP 1.18..1.33 to 3.31; flap hems 0.80@2.95;
  // rear gear: wrap bottoms 0.30@-2.72, belt grounded to ~-2.3; front: belt
  // rises from ~2.05, idler wrap bottom 0.21@2.4; TURTLE turret: shell
  // front-center 2.09-2.19, plan rear -0.655@|x|<0.6 -> -0.068@1.22, plan
  // front 2.10@0.63 -> 1.63@1.10; CUPOLA (left, z 0.44..0.85) to 2.81;
  // DShK cluster LEFT-FRONT overhanging the shell (x -1.2..-1.45,
  // z 1.66..1.96, tops 2.53-2.56); turret-node APRON bottoming 0.56 over
  // z -0.1..1.43; fused tube band 1.53..1.80 runs to 6.17 (mine PINNED
  // 5.72 = dims; ~4 ONLY-REF muzzle cols accepted).
  loftHull(P, {
    deck: [[-3.226, 0.98], [-3.16, 1.10], [-2.98, 1.17], [-2.60, 1.32], [-2.48, 1.41], [-1.55, 1.42], [-0.90, 1.41], [-0.30, 1.40], [0.78, 1.41], [1.48, 1.42], [1.60, 1.47], [2.20, 1.46], [2.70, 1.40], [3.05, 1.29], [3.226, 1.25]],
    belly: [[-3.226, 0.96], [-3.09, 0.90], [-3.07, 0.70], [-2.98, 0.53], [-2.63, 0.315], [-2.20, 0.10], [-2.05, 0.01], [1.64, 0.01], [1.85, 0.06], [2.23, 0.22], [2.58, 0.41], [2.74, 0.61], [2.87, 0.83], [2.90, 1.13], [3.226, 1.18]],
    wUp: [[-3.226, 1.05], [-2.95, 1.35], [2.50, 1.35], [3.00, 1.05], [3.226, 0.90]],
    wLo: [[-3.226, 0.95], [2.20, 1.00], [3.226, 0.92]],
    // Keep the measured outer deck/sponson silhouette, but lift only the
    // concealed track-bay roof above the supported return shoes.  The lower
    // band remains a closed centre tub at wLo while the upper band retains
    // the published wUp/deck faces; no exterior hull or fender is removed.
    sponsonY: 1.16,
  });
  // fender shelves x 1.28..1.635 (print full-width line), prism-law segments
  for (const s of [-1, 1]) for (let i = 0; i < 13; i++) {
    P.add('hull', box(0.355, 0.03, 0.48), s * 1.4575, 1.295, -3.02 + i * 0.503);
  }
  // front mud flaps at the ref's own 2.95 hang line (hems 0.80; they also
  // carry the ±1.635 width column with a >=0.35 y-band); rear flaps close
  // the fender run
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.35, 0.36, 0.045), s * 1.457, 0.98, 2.94);
    P.add('hullRubber', box(0.34, 0.26, 0.045), s * 1.457, 1.02, -3.20);
  }
  // fender stowage (§B3/§H4 variety): RIGHT flat fuel tanks, LEFT bins —
  // tops held at the 1.44 fender-stack line (registered front-view read)
  P.add('hullDetail', box(0.30, 0.16, 0.92), 1.44, 1.36, 1.30);
  P.add('hullDetail', box(0.30, 0.16, 0.92), 1.44, 1.36, 0.20);
  P.add('hullDark', box(0.26, 0.02, 0.03), 1.44, 1.45, 0.75);
  P.add('hull', box(0.30, 0.15, 0.80), -1.44, 1.355, 1.20);
  P.add('hull', box(0.30, 0.15, 0.66), -1.44, 1.355, 0.28);
  P.add('hullDark', box(0.26, 0.02, 0.03), -1.44, 1.44, 0.74);
  // rear plate: transverse fuel drums ON the ramp (the print's 1.26/1.27
  // deck bumps at -2.81/-2.62) + unditching log low on the tail plate
  P.add('hullDetail', cylX(0.15, 2.00, 12), 0, 1.11, -2.83);
  P.add('hullDetail', cylX(0.15, 2.00, 12), 0, 1.13, -2.58);
  for (const s of [-1, 1]) {
    // End bands seat on the drum body, not over the return lane.  The
    // former ±1.00 seat left the 4 cm ring grazing the inner shoe edge.
    P.add('hullDark', cylX(0.154, 0.04, 12), s * 0.96, 1.11, -2.83);
    P.add('hullDark', cylX(0.154, 0.04, 12), s * 0.96, 1.13, -2.58);
    P.add('hullDark', box(0.04, 0.30, 0.02), s * 0.62, 1.10, -2.71);
  }
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.1, r: 0.11, seed: 5 });
    log.position.set(0, 1.02, -3.12);
    P.hullG.add(log);
  }
  ruDeck(P, { deckY: 1.42, hatchX: -0.55, hatchY: 1.39, hatchZ: 1.90, periY: 1.41, gz: -1.55, grilles: 4, gw: 1.35 });
  P.add('hull', box(1.7, 0.035, 0.28), 0, 1.475, 1.58, -0.10, 0, 0);   // splash board
  // eyes:false — the default tow-eye tori hung 0.46..0.64 under the thin
  // nose lip and owned the z 3.07 col (0.231, top hull item of the first
  // gate run)
  ruGlacisKit(P, { w: 3.0, y: 1.36, z: 2.55, eyes: false, hookY: 0.70, hookZ: 2.55, hlY: 1.38 });
  KIT.towCable(P, [[-1.10, 1.38, 1.90], [0, 1.42, 1.50], [1.10, 1.38, 1.90]]);
  buildRunningGear(P, {
    // 5 starfish wheels, no return rollers; registered gear reads: sprocket
    // wrap bottom 0.30@-2.72, idler wrap 0.21@2.4, belt grounded -2.3..2.05
    style: 'holes', wheelR: 0.40, wheelW: 0.28, wheelY: 0.437, xc: 1.276, dishR: 0.88,
    wheelZs: [1.64, 0.68, -0.16, -1.00, -1.84],
    sprocket: { z: -2.62, y: 0.66, r: 0.27 }, idler: { z: 2.30, y: 0.62, r: 0.26 },
    rollers: [], trackW: 0.50, topY: 0.86, botY: 0.05, paintedEnds: true, coveredTop: false, arms: true,
    contactZF: 2.05, contactZR: -2.28,
  });
  widthAnchor(P, 1.635, 1.30, -0.46);

  // ---- TURTLE-SHELL dome to the registered print: shell front-center
  // 2.09-2.19, long egg (plan -0.67..2.10 at center, halfW max 1.29), the
  // tall reads are all OFF-CENTER furniture (cupola/DShK/fume) ----
  P.turretG.position.set(0, 1.40, 0.715);
  const rings = [[1.29, 0.0], [1.27, 0.26], [1.19, 0.50], [1.03, 0.72], [0.79, 0.89], [0.48, 0.99], [0.02, 1.02]];
  meshDome(P, rings, 1.074, 0, -0.10);
  // hidden turret-node APRON (t90m class): the print bakes hull kit into the
  // turret node bottoming 0.56 over z -0.1..1.43; §C mid-seam split
  P.add('turretDark', box(1.90, 0.50, 0.94), 0, -0.59, -0.695);
  P.add('turretDark', box(1.90, 0.50, 0.94), 0, -0.59, 0.245);
  // commander cupola LEFT (registered z 0.44..0.85, top 2.81 -> built 2.68:
  // heightM p95 rides this band, spec 2.65)
  P.add('turret', cylY(0.27, 0.29, 0.42, 14), -0.62, 1.05, -0.365);
  P.add('turretDark', cylY(0.23, 0.23, 0.025, 14), -0.62, 1.235, -0.365);
  P.add('turretDetail', box(0.10, 0.08, 0.16), -0.62, 1.20, -0.175);
  // fume-extractor dome RIGHT
  P.add('turret', KIT.sph(0.16, 12, Math.PI / 2), 0.55, 0.76, 0.60);
  // DShK cluster LEFT-FRONT, overhanging the shell like the print (ring
  // mount embedded in the skin, arm + ammo drum reach x -1.41, tops 2.5-2.7
  // over z 1.55..1.95; barrel raised AA so the z-footprint stays ~3 cols
  // inside the heightM p95 exclusion)
  P.add('turret', cylY(0.17, 0.19, 0.30, 12), -1.02, 0.62, 0.90);
  P.add('turretDark', box(0.36, 0.09, 0.12), -1.16, 0.80, 0.95);
  P.add('turretDetail', box(0.16, 0.14, 0.22), -1.33, 1.05, 0.95);
  {
    const dshk = FITTINGS.pintleMG({
      mats: P.mats, cls: 'dshk', scale: 0.75, tone: 'two-tone', elev: 0.05, ammo: true,
      rotation: [0, 1.15, 0], seed: 4,
    });
    dshk.position.set(-1.16, 0.86, 0.90);
    P.turretG.add(dshk);
  }
  domeRailRu(P, rings, 1.074, 0.45, 1.0);
  // ---- D-10T2S: axis 1.65 (registered tube band 1.53..1.80), pivot world
  // +1.565, fume extractor forward, muzzle +5.72 (pinned; print runs 6.17,
  // the last ~4 cols ride as ONLY-REF, dims sovereign) ----
  P.gunG.position.set(0, 0.25, 0.85);
  ruSaddle(P, { rollR: 0.19, rollW: 0.50, tubeR: 0.135, rootR: 0.19, rootL: 0.50 });
  // §B3.1 (turret-lane 2026-08-06): the pig-snout is a CAST collar — the
  // inscribed elliptical frustum keeps the box's exact plan (±0.23) and
  // side (±0.17) extremes at the center axes (INSCRIBED-DRUM law: masks
  // read identical rectangles, only the corner read rounds), with the
  // canvas boot ring tying it onto the tube.
  P.addGunExtra(KIT.xform(cylZ(0.5, 0.30, 16, 0.42), 0, 0, 0, 0, 0, 0, [0.46, 0.34, 1]), 0, 0, 0.12);
  P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.045, 14), 0, 0, 0, 0, 0, 0, [0.30, 0.26, 1]), 0, 0, 0.30);
  // Luna L-2 IR searchlight right of the mantlet (era kit, gun-slaved like
  // the real linkage): drum + dark rim + glass + yoke bracket onto the
  // collar — inside the turret-face plan/side envelopes.
  P.addGunExtra(KIT.xform(cylZ(0.095, 0.13, 12), 0, 0, 0), 0.36, 0.14, 0.16);
  P.addGunExtraDark(KIT.xform(cylZ(0.099, 0.014, 12), 0, 0, 0), 0.36, 0.14, 0.235);
  P.addGunExtraDark(KIT.xform(cylZ(0.078, 0.010, 12), 0, 0, 0), 0.36, 0.14, 0.243); // IR lens (dark — no gun-frame glass slot)
  P.addGunExtraDark(box(0.03, 0.10, 0.03), 0.30, 0.06, 0.14);
  tubeGun(P, [
    [0.35, 0.85, 0.135], [0.85, 1.40, 0.128], [1.40, 1.95, 0.105],
    [1.95, 2.50, 0.105], [2.50, 3.05, 0.105], [3.05, 3.35, 0.125],
    [3.35, 3.90, 0.105], [3.90, 4.155, 0.105],
  ], { rings: [[0.85, 0.132], [1.40, 0.110], [3.05, 0.128], [3.35, 0.108], [3.90, 0.107]], muzzle: 4.155 });
  muzzleBore(P, { r: 0.105 });  // §B3.1 (shadow-named, mask/frame-neutral)
  const dxT = ringSkin(rings, 0.45) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [dxT * 0.98, 0.35, 0.35], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-dxT * 0.98, 0.35, 0.35], -Math.PI / 2);
  P.topY = 1.25;
}

// ---- T-44 (T44-NEWBUILD-2026-08-08, §5.45 no-builder queue — the T-34→T-54
// bridge, t54-lineage donor grammar per §5.13) -------------------------------
// Oracle: t44_foxygamer.glb (CC BY-SA), extract docs/references/vertex/
// t44.json — authored DIRECTLY in the extract frame (ref body -3.702..+2.455
// = 6.157 m, +1.4% of pub 6.07 → my body ends pulled in to -3.66/+2.41,
// registration mids equal by construction). PUB SOVEREIGN: hull 6.07 / width
// 3.18 (fender rail ±1.59 carries it, WIDTH-CARRIER law) / height 2.72 (the
// integration row's over-DShK convention, t54-2.65 analog — the DShK-cluster
// crowns 2.70-2.72 carry p95 over ~5 cols vs the print's own 2.45-2.55 tall
// band: the documented dims-sovereign price, m48 §5.68 class) / muzzle +3.99
// (7.65 overall; print tube ends +3.74 → last ~3 cols ride ONLY-PROC).
// Ref decode (extract frame): engine/bin deck 1.42 (bin jitter 1.417-1.448)
// over -3.0..-0.46; LOW crew roof 1.308 over -0.46..+1.457 (the T-44 tell:
// no T-34 driver bulge — clean plate); one-piece glacis knee (1.457, 1.308)
// → toe (2.41, 0.69); fender front run 1.046 to z 2.19 with flap tips
// carrying plan 2.484; tail: two longitudinal fuel drums (plan |x| 0.25..0.9,
// y 1.03..1.47, rear rim -3.74 → mine -3.66 = the 6.07 crop); belly plate
// 0.384 front-view (T-44's 0.425 clearance class, §B2 holes-not-channels —
// no channel fill); turret = LOW WIDE casting with FLAT ROOF: plan egg
// -1.42..+0.76 (max halfW 0.935 @ -0.62, rear shoulders 0.84 @ -1.17),
// skirt hem 1.40, roof plateau 2.43-2.49, cupola LEFT crest 2.545 @ -0.62,
// DShK cluster crest 2.537 @ +0.48; bustle bin -1.45..-2.07 y 1.56..2.06;
// turret-node APRON bottoming 1.03 over -0.95..+0.10 (t90m/t54 class);
// tube band 1.597..1.812 (axis 1.705, r 0.108) to +3.74.
export function buildT44(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear } = KIT;
  // r2 registered decode: ref deck plate spans only ±1.30 (front_hull tops
  // 1.449@|x|<1.28 = deck-edge bins, 1.31-1.35@1.35..1.59 = the narrow
  // fenders) and mid stations read 2.90 wide — the ±1.59 full-width columns
  // exist ONLY at the bin/flap zones (ref st1/2/11/12), so the fenders stay
  // y ~1.29 with the width carried zone-wise, never a full-length rail.
  loftHull(P, {
    deck: [[-3.29, 1.28], [-3.19, 1.355], [-3.00, 1.42], [-0.52, 1.42], [-0.46, 1.308], [1.457, 1.308], [2.44, 0.70]],
    belly: [[-3.29, 0.70], [-2.95, 0.44], [-2.60, 0.40], [1.70, 0.40], [2.05, 0.46], [2.44, 0.672]],
    wUp: [[-3.29, 1.30], [2.44, 1.30]],
    wLo: [[-3.29, 0.94], [2.44, 0.95]],
    // sponson profile DROPS at the bow (r4 find: with a flat 0.86 the nose
    // upper band pinched out at z ~2.15 — the glacis toe went missing from
    // every mask past 2.07; the profile keeps the full-width glacis plane
    // alive to the +2.44 toe, merkava sponson-floor recipe)
    sponsonY: [[-3.29, 0.86], [2.00, 0.86], [2.15, 0.60], [2.44, 0.54]],
  });
  // tail fuel drums (longitudinal pair, ref plan lanes |x| 0.25..0.9 to
  // -3.74 → mine -3.66; y band 1.01..1.49 = the hullLengthM rear anchor;
  // their 1.49 crowns also carry the ref's 1.466 front-view stern line)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylZ(0.24, 0.37, 14), s * 0.60, 1.25, -3.475);
    P.add('hullDark', cylZ(0.244, 0.03, 14), s * 0.60, 1.25, -3.645);
    P.add('hullDark', cylZ(0.244, 0.03, 14), s * 0.60, 1.25, -3.315);
    // support brackets tie the drums onto the rear plate (§B2 no-air)
    P.add('hull', box(0.10, 0.36, 0.20), s * 0.60, 1.06, -3.35, -0.25, 0, 0);
    P.add('hullDark', box(0.05, 0.02, 0.36), s * 0.60, 1.50, -3.48);
  }
  // rear tow hooks flat on the stern plate (r3 read: an rx-raked seat hung
  // stray voxels under the drum lanes)
  for (const s of [-1, 1]) P.add('hullDark', box(0.10, 0.11, 0.10), s * 0.62, 0.72, -3.26);
  // narrow fenders — r3 STATION ARCHITECTURE (ref stations: ±1.4495 at sts
  // 4/7-10, ±1.52 bulges ONLY at st3/st5, ±1.589 zones ONLY at st1/2 +
  // st11/12, ±1.494 at st0/13): shelf outer 1.4495 full run, width carried
  // zone-wise by bins/flaps, never a full-length rail (m48 AA-razor law)
  for (const s of [-1, 1]) for (let i = 0; i < 10; i++) {
    P.add('hull', box(0.15, 0.03, 0.46), s * 1.3748, 1.285, -2.95 + i * 0.478);
  }
  for (const s of [-1, 1]) {
    // front fender step (ref side line 1.046 over z 1.75..2.40; runs to the
    // flap face so the flap hangs from real metal, §B2)
    P.add('hull', box(0.15, 0.028, 0.87), s * 1.3748, 1.032, 1.965);
    // front mud flaps: the hullLengthM FRONT anchor at +2.45 (band
    // 0.66..1.05; the r3 2.41 face left the ref's 2.43-2.48 nose columns
    // pairing against the bare tube at 0.45 err ×2 — 6.11 body stays in
    // grace) + hanger strut into the step + BAND-THIN tip strip covering
    // the ref's last nose columns to 2.50 (0.28 band < the 12% body filter
    // → hullLengthM anchor unmoved; whip-rough margin 0.046)
    P.add('hullRubber', box(0.34, 0.39, 0.045), s * 1.32, 0.855, 2.425);
    P.add('hullDark', box(0.04, 0.06, 0.12), s * 1.32, 1.02, 2.36);
    // (strip sits CLEAR of the flap face in z — an overlapping col unioned
    // flap-top∪strip-bot to a 0.31 band and rode the 12% body filter:
    // hullLengthM read 6.17 twice, the m48 AA-razor class)
    P.add('hullRubber', box(0.30, 0.24, 0.04), s * 1.32, 0.86, 2.478);
    // front skirt-flap plates at the ±1.589 plane (ref st11/12 bot 0.0-0.1
    // + front-view outer band 0.38..1.31 — hang beside the idler wrap,
    // outboard of the ±1.445 track, §B4 clear)
    P.add('hullRubber', box(0.03, 0.72, 0.35), s * 1.573, 0.67, 1.575);
    // rear flaps at the ±1.589 st1 column (ref st1 bot 0.185; z -3.10 keeps
    // them clear of the st0/st1 slab boundary at -3.22 — bradley ≥20mm law)
    P.add('hullRubber', box(0.34, 0.34, 0.045), s * 1.42, 0.78, -3.10);
    P.add('hullRubber', box(0.34, 0.30, 0.04), s * 1.42, 0.42, -3.08);
    P.add('hullDark', box(0.04, 0.36, 0.07), s * 1.42, 1.10, -3.045);
    // rear fender extension to the ref's -3.33 fender tail (st0 ±1.494)
    P.add('hull', box(0.24, 0.03, 0.15), s * 1.37, 1.285, -3.255);
    // mid-fender bin pair at the ±1.52 st3/st5 bulges (gap keeps st4 clean)
    P.add('hullDetail', box(0.14, 0.14, 0.40), s * 1.45, 1.37, -2.18);
    P.add('hull', box(0.14, 0.14, 0.35), s * 1.45, 1.37, -1.30);
  }
  // deck-edge bin rows (ref front tops 1.449 at |x| ≤ 1.28; §H4 variety:
  // RIGHT two long bins, LEFT bin + rack)
  P.add('hullDetail', box(0.30, 0.14, 0.88), 1.13, 1.375, -1.15);
  P.add('hullDetail', box(0.30, 0.14, 0.70), 1.13, 1.375, -2.55);
  P.add('hullDark', box(0.26, 0.02, 0.03), 1.13, 1.45, -1.15);
  P.add('hull', box(0.30, 0.13, 0.80), -1.13, 1.37, -2.60);
  P.add('hull', box(0.30, 0.13, 0.62), -1.13, 1.37, -1.05);
  P.add('hullDark', box(0.26, 0.02, 0.03), -1.13, 1.44, -2.60);
  // stern bin pair OVER the fenders (the ref's ±1.589 st1/st2 columns —
  // zone width carriers, tops at the fender-stack line)
  P.add('hullDetail', box(0.28, 0.15, 0.60), 1.448, 1.38, -2.80);
  P.add('hull', box(0.28, 0.15, 0.60), -1.448, 1.38, -2.80);
  // front bins on the low fender step (the ±1.589 st11/st12 columns; tops
  // 1.30 = the ref's 1.309 front-view fender line)
  P.add('hullDetail', box(0.28, 0.25, 0.44), 1.448, 1.175, 1.59);
  P.add('hull', box(0.28, 0.25, 0.44), -1.448, 1.175, 1.59);
  ruDeck(P, { deckY: 1.42, hatchX: -0.50, hatchY: 1.308, hatchZ: 1.10, periY: 1.318, gz: -2.30, grilles: 4, gw: 1.35 });
  // splash board low on the glacis knee (ref 1.402 @ 0.856)
  P.add('hull', box(1.70, 0.045, 0.20), 0, 1.355, 0.88, -0.35, 0, 0);
  ruGlacisKit(P, { w: 2.55, y: 0.98, z: 1.95, eyes: false, hookY: 0.52, hookZ: 2.30, hlX: 1.00, hlY: 1.13 });
  KIT.towCable(P, [[-0.90, 1.155, 1.72], [0, 1.325, 1.40], [0.90, 1.155, 1.72]]);
  buildRunningGear(P, {
    // 5 large wheels at the T-44's EVEN spacing (the identity tell vs the
    // T-54 gap), torsion-bar era, no return rollers; rear drive sprocket.
    // Track outer wall ±1.445 (ref ground cols end ±1.44-1.46)
    style: 'holes', wheelR: 0.41, wheelW: 0.28, wheelY: 0.425, xc: 1.195, dishR: 0.88,
    wheelZs: [1.35, 0.45, -0.45, -1.35, -2.25],
    sprocket: { z: -2.86, y: 0.62, r: 0.27 }, idler: { z: 1.95, y: 0.58, r: 0.24 },
    rollers: [], trackW: 0.50, topY: 0.84, botY: 0.045, paintedEnds: true, coveredTop: false, arms: true,
    contactZF: 1.50, contactZR: -2.26,
  });
  widthAnchor(P, 1.59, 1.30, -2.80);

  // ---- LOW WIDE FLAT-ROOF casting: three overlapping lathes loft the
  // measured egg (nose drum + main body + rear shoulders — one contiguous
  // cast read, §B2), roof plateau 2.43-2.45, skirt hem 1.40 ----
  P.turretG.position.set(0, 1.31, -0.44);
  const rA = [[0.935, 0.09], [0.93, 0.32], [0.91, 0.54], [0.875, 0.74], [0.815, 0.92], [0.72, 1.05], [0.60, 1.12], [0.02, 1.135]];
  meshDome(P, rA, 0.93, 0, -0.11);                       // main body (max 0.935 @ world -0.55)
  const rB = [[0.80, 0.10], [0.79, 0.30], [0.765, 0.50], [0.725, 0.68], [0.68, 0.85], [0.66, 1.00], [0.50, 1.09], [0.02, 1.10]];
  meshDome(P, rB, 0.95, 0, 0.44);                        // nose drum (front +0.76, flat crown 2.41)
  const rC = [[0.84, 0.13], [0.835, 0.38], [0.815, 0.60], [0.77, 0.78], [0.70, 0.92], [0.58, 1.00], [0.02, 1.01]];
  meshDome(P, rC, 0.45, 0, -0.72);                       // rear shoulders (0.84 @ world -1.17)
  // BLUNT NOSE BLOCK (r3 read: the ref roof holds 2.43-2.45 out to +0.72
  // then cliffs — plan there is only ±0.49-0.65, so no lathe can carry it;
  // §B1 single swept slab, sides+front raked, buried into dome B)
  P.add('turret', KIT.slab(
    [-0.62, 0.24, 1.18], [0.62, 0.24, 1.18], [0.62, 0.24, 0.74], [-0.62, 0.24, 0.74],
    [-0.46, 1.09, 1.14], [0.46, 1.09, 1.14], [0.46, 1.09, 0.74], [-0.46, 1.09, 0.74]));
  // hidden turret-node APRON (t90m/t54 class): ref turret mask bottoms 1.03
  // over -0.90..-0.05 world at |x| ≤ 0.88 — carriers INSIDE the hull
  // silhouette, §C mid-seam split (r3: ±0.85 clears the ±0.91 plan column)
  P.add('turretDark', box(1.70, 0.27, 0.425), 0, -0.125, -0.2475);
  P.add('turretDark', box(1.70, 0.27, 0.425), 0, -0.125, 0.1775);
  // commander cupola LEFT (ref crest 2.545 @ world -0.62; the front-view
  // crest is NARROW: x -0.14..-0.42 only — a small early periscope ring,
  // r4 re-read: an r 0.28 ring paid 0.3-0.45 on the -0.48..-0.58 cols)
  P.add('turret', cylY(0.14, 0.155, 0.17, 14), -0.28, 1.155, -0.18);
  P.add('turretDark', cylY(0.125, 0.125, 0.028, 14), -0.28, 1.222, -0.18);
  P.add('turretDetail', box(0.09, 0.07, 0.13), -0.28, 1.20, -0.02);
  // loader hatch RIGHT (ref 2.49 ring reads)
  P.add('turret', cylY(0.235, 0.235, 0.05, 14), 0.45, 1.135, -0.25);
  P.add('turretDark', cylY(0.242, 0.242, 0.014, 14), 0.45, 1.163, -0.25);
  // ventilator dome right-rear (ref right-side tops 2.39-2.45)
  P.add('turret', KIT.sph(0.13, 12, Math.PI / 2), 0.42, 1.04, -0.68);
  // DShK AA station LEFT-FRONT (ref crest 2.537 @ +0.48): ring-mount pintle
  // + receiver + ammo cans — the compact crown band 2.69-2.72 (world) CARRIES
  // heightM 2.72 (over-DShK convention row; ~5-6 cols at z +0.27..+0.78,
  // documented dims-sovereign price, m48 §5.68 class). Barrel STOWED aft-
  // level over the roof so no plan_turret/whole column extends (r1 lesson:
  // a forward barrel owned six tube-band columns at +1.2 err).
  // the whole 2.69-2.72 crown band lives INSIDE the st9 slab (world
  // +0.40..+0.74; r4 receipt: a +0.29..+0.75 span painted st8 AND st10
  // tops at 10% each — the bradley slab-boundary law, heightM edition)
  P.add('turret', cylY(0.14, 0.16, 0.22, 12), -0.25, 0.95, 1.01);           // ring-mount drum
  P.add('turretDark', box(0.09, 0.24, 0.09), -0.25, 1.18, 1.01);            // pintle post
  P.add('turretDark', box(0.11, 0.115, 0.34), -0.25, 1.3525, 1.01);         // receiver (top 2.72; 0.34 z-span = the 4-col p95 carrier)
  P.add('turretDark', cylZ(0.026, 0.50, 8), -0.25, 1.05, 0.58, 0.36, 0, 0);  // barrel stowed muzzle-down-aft ON the roof line (r5: a 1.20 seat painted st8 tops 7%)
  P.add('turretDark', cylZ(0.038, 0.09, 8), -0.25, 0.965, 0.32, 0.36, 0, 0); // flash hider at the dome crown
  P.add('turretDetail', box(0.15, 0.16, 0.24), -0.40, 1.30, 0.98);          // ammo can on the cradle (top 2.69)
  P.add('turretDetail', box(0.14, 0.115, 0.28), -0.11, 1.3425, 1.05);       // spare can (top 2.71)
  P.add('turretDark', box(0.30, 0.05, 0.05), -0.25, 1.21, 0.87);            // cradle beam
  // turret bustle bin (ref tail -1.45..-2.07, y 1.56..2.06) — lid seam +
  // latches so it reads as the real T-44 stowage bin (§B3 no-mystery-box)
  chamferBox(P, 'turret', 1.20, 0.50, 0.60, 0, 0.50, -1.32, 0.10);
  P.add('turretDark', box(1.10, 0.02, 0.03), 0, 0.685, -1.33);
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, 0.16, 0.02), s * 0.38, 0.55, -1.615);
  domeRailRu(P, rA, 0.93, 0.45, 0.9);
  // ---- ZiS-S-53 85 mm: axis 1.705 (ref band 1.597..1.812), pivot world
  // +0.45, clean tube (no evacuator/brake — 1945 mark), muzzle +3.99 pinned
  // to the 7.65 overall (print ends +3.74: ~3 ONLY-PROC cols, dims sovereign)
  P.gunG.position.set(0, 0.395, 0.89);
  ruSaddle(P, { rollR: 0.175, rollW: 0.46, tubeR: 0.12, rootR: 0.175, rootL: 0.44 });
  // cast collar (pig-snout class, INSCRIBED-DRUM law) + canvas boot ring
  P.addGunExtra(KIT.xform(cylZ(0.5, 0.26, 16, 0.42), 0, 0, 0, 0, 0, 0, [0.40, 0.30, 1]), 0, 0, 0.10);
  P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.04, 14), 0, 0, 0, 0, 0, 0, [0.27, 0.23, 1]), 0, 0, 0.26);
  tubeGun(P, [
    [0.30, 0.80, 0.125], [0.80, 1.45, 0.112], [1.45, 2.20, 0.108],
    [2.20, 2.95, 0.108], [2.95, 3.54, 0.105],
  ], { rings: [[0.80, 0.128], [1.45, 0.115], [2.95, 0.108]], muzzle: 3.54 });
  muzzleBore(P, { r: 0.10 });  // §B3.1 (shadow-named, mask/frame-neutral)
  const dxT44 = ringSkin(rA, 0.40) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [dxT44 * 0.98, 0.40, -0.11], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-dxT44 * 0.98, 0.40, -0.11], -Math.PI / 2);
  P.topY = 1.42;
}

// ---- Type 59 (TYPE59-NEWBUILD-2026-08-08, §5.45 no-builder queue — licensed
// T-54A, WZ-120; print is the author's Type 69, same hull family, packet-
// documented) ----------------------------------------------------------------
// Oracle: type69_lasttriarius.glb (CC BY), extract docs/references/vertex/
// type59.json — authored DIRECTLY in the extract's AFT-SHIFTED frame (ref
// body -4.266..+1.789 = 6.055, +0.25% of pub 6.04 → built to the ref ends).
// PUB SOVEREIGN: hull 6.04 / width 3.27 (fender rail ±1.635 carries it) /
// height 2.59 (cupola crown 2.60 carries p95 — ref's own band 2.55-2.63) /
// muzzle +4.734 (9.00 overall; print ends +4.42 → ~3 ONLY-PROC cols).
// Ref decode (extract frame): stern box -4.09..-4.26 (y 0.72..1.30) with the
// thin center gearbox tail to -4.40 (band 0.20, under the 12% body filter —
// hullLengthM anchor stays -4.26); rising engine deck 1.32→1.468 over
// -3.92..-2.85 with the stowed-snorkel ridge 1.624 @ -3.80..-3.89 (w ±0.75);
// mid deck 1.364; splash board 1.428 @ +0.04; glacis knee (0.63, 1.35) →
// nose (1.77, 0.93) with the Type 69 IR/headlight pods ON the glacis (tops
// 1.439 over z 0.84..1.09 — the Chinese tell); flat belly 0.42 front-view
// (§B2); T-54A DOME: plan ellipse -1.90..+0.61 (max halfW 1.145 @ -0.645),
// skirt hem 1.284 (overhangs the deck), apex ~2.33, cupola LEFT 2.62 @
// -1.05..-0.75, loader dome RIGHT 2.44-2.49; curved rear stowage rack
// -1.90..-2.44 (y 1.40..1.80); turret-node APRON bottoming 0.545 over
// -1.43..+0.02 at halfW 1.44 (fender bins baked into the print's turret
// node — hidden turretDark carriers); 100 mm tube: axis 1.589 (band
// 1.471..1.706), BORE EVACUATOR bulge r 0.157 @ +3.55..+4.10 (muzzle-third).
export function buildType59(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear } = KIT;
  // r2: the glacis center toe ends at +1.56 (ref plan center front 1.556) —
  // the +1.74-1.79 front line is carried by the FENDER/flap row (|x|
  // 0.9..1.63), not the hull loft
  loftHull(P, {
    deck: [[-4.09, 1.28], [-3.92, 1.318], [-3.79, 1.382], [-3.55, 1.382], [-3.50, 1.415], [-2.86, 1.468], [-2.76, 1.364], [-1.10, 1.364], [-1.00, 1.34], [-0.50, 1.34], [-0.42, 1.372], [0.63, 1.352], [1.56, 1.00]],
    belly: [[-4.09, 0.70], [-3.93, 0.56], [-3.55, 0.43], [0.60, 0.42], [1.35, 0.49], [1.50, 0.62], [1.56, 0.96]],
    wUp: [[-4.09, 1.49], [-3.80, 1.52], [1.20, 1.52], [1.56, 1.42]],
    // Closed centre tub stays between the two native courses.  The former
    // 0.95..0.98 half-width entered the inner shoe faces; 0.88 preserves a
    // substantial closed belly while restoring truthful wheel-well space.
    wLo: [[-4.09, 0.88], [1.56, 0.88]],
    // The former 0.87 m split put the full-width upper loft inside the
    // native return run.  Raise only this concealed bay roof: the closed
    // centre belly and every measured deck/side face remain unchanged.
    sponsonY: 1.16,
  });
  // stern: full-width upper box (the -4.26 hullLengthM rear anchor, band
  // 0.72..1.30) + THIN center gearbox tail to -4.398 (stays under the 12%
  // body filter like the print's; the tail tip is ALSO the overallLengthM
  // rear datum — muzzle pins from it)
  // Closed stepped stern: retain the complete center plate and original
  // 2.90 m crown/outer silhouette, but raise the concealed outboard floor
  // above the final-drive return shoes.  Three overlapping closed solids
  // replace the one full-width low box; nothing visible is deleted.
  P.add('hull', box(1.76, 0.56, 0.17), 0, 1.005, -4.175);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.66, 0.16, 0.17), s * 1.12, 1.205, -4.175);
  }
  P.add('hullDetail', box(0.90, 0.20, 0.13), 0, 1.05, -4.315);
  P.add('hullDark', box(0.30, 0.10, 0.036), 0, 0.98, -4.378);
  for (const s of [-1, 1]) P.add('hullDark', box(0.10, 0.11, 0.12), s * 0.70, 0.60, -4.06, 0.3, 0, 0);
  // stowed OPVT snorkel ridge on the rear deck (ref 1.624 @ -3.80..-3.89,
  // w ±0.75; r3: r 0.09 + buried seat keeps the ridge in the ref's own
  // station slab)
  P.add('hullDetail', cylX(0.09, 1.52, 12), 0, 1.475, -3.845);
  for (const s of [-1, 1]) P.add('hullDark', box(0.06, 0.14, 0.22), s * 0.62, 1.40, -3.845);
  // muffler on the LEFT rear fender (T-54A/Type 69 tell; seated ON the shelf)
  P.add('hullDetail', cylZ(0.10, 0.78, 10), -1.42, 1.245, -3.10);
  P.add('hullDark', cylZ(0.055, 0.22, 8), -1.42, 1.285, -3.55);
  // fender shelves ±1.635 (WIDTH-CARRIER: the committed 3.27 rail), segmented
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
    P.add('hull', box(0.36, 0.03, 0.45), s * 1.455, 1.13, -3.60 + i * 0.4617);
  }
  for (const s of [-1, 1]) {
    // fender stay-brackets (ref front-view band hangs to 0.58 at the rail)
    for (let i = 0; i < 5; i++) {
      P.add('hullDark', box(0.025, 0.48, 0.06), s * 1.617, 0.88, -3.10 + i * 1.05);
    }
    // front mud flaps: +1.74 front body anchor (band 0.74..1.16); the ref's
    // fender/flap plate row spans |x| 0.92..1.63 (plan front 1.753 from
    // x ±0.9 out — r2 widen), clear of the idler wrap pole (§B4). The
    // strut pair ties each flap to the bow (§B2 + the r2 floater islands:
    // the far-side flap separated in 4/5 poses)
    P.add('hullRubber', box(0.70, 0.42, 0.05), s * 1.275, 0.95, 1.715);
    P.add('hullDark', box(0.04, 0.07, 0.22), s * 1.02, 1.10, 1.58, -0.35, 0, 0);
    P.add('hullDark', box(0.04, 0.07, 0.20), s * 1.50, 1.11, 1.60, -0.30, 0, 0);
    // rear flaps + stay bridging flap top to the shelf underside (§B2)
    // Rear mudflap belongs behind the final drive, not through its wrap.
    // Preserve the complete flap and stay, moving both aft onto the stern
    // hanger where they remain fully visible and physically supported.
    P.add('hullRubber', box(0.35, 0.44, 0.05), s * 1.455, 0.86, -4.27);
    P.add('hullDark', box(0.04, 0.08, 0.16), s * 1.42, 1.09, -4.20);
  }
  // fender stowage (§H4 variety: RIGHT flat fuel tanks + bin, LEFT bins;
  // ref bin tops 1.449-1.47 live INBOARD of x 1.48 — r2 re-seat) + the thin
  // raised inner lip rail at the ref's 1.39 line (x 1.49..1.54, segmented)
  P.add('hullDetail', box(0.30, 0.155, 0.92), 1.33, 1.225, -1.30);
  P.add('hullDetail', box(0.30, 0.155, 0.92), 1.33, 1.225, -0.10);
  P.add('hullDark', box(0.26, 0.02, 0.03), 1.33, 1.31, -0.70);
  P.add('hull', box(0.30, 0.15, 0.85), -1.33, 1.22, -1.20);
  P.add('hull', box(0.30, 0.15, 0.60), -1.33, 1.22, -0.15);
  P.add('hullDark', box(0.26, 0.02, 0.03), -1.33, 1.30, -0.75);
  // raised fender side-wall course at the ref's 1.39 line (x 1.49..1.54) —
  // SOLID walls standing on the shelf (§B2; the r2 floating strips read as
  // hover rails), segmented per the prism law
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
    P.add('hull', box(0.05, 0.245, 0.42), s * 1.515, 1.2675, -3.35 + i * 0.66);
  }
  ruDeck(P, { deckY: 1.364, hatchX: -0.55, hatchY: 1.352, hatchZ: 0.25, periY: 1.362, gz: -2.90, grilles: 4, gw: 1.40 });
  // splash board (ref 1.428 @ +0.04)
  P.add('hull', box(1.70, 0.04, 0.22), 0, 1.398, 0.05, -0.30, 0, 0);
  // Type 69 glacis IR/headlight pods (the Chinese identity tell): big IR
  // drum right of the driver line + white-light pair left, on glacis risers
  P.add('hullDetail', cylZ(0.125, 0.20, 12), 0.42, 1.30, 0.95, -0.32, 0, 0);
  P.add('hullDark', cylZ(0.129, 0.02, 12), 0.42, 1.33, 1.045, -0.32, 0, 0);
  P.add('hullDark', box(0.06, 0.14, 0.06), 0.42, 1.19, 0.90, -0.32, 0, 0);
  KIT.headlight(P, -0.40, 1.28, 0.97, -0.32, 0.05);
  KIT.headlight(P, -0.62, 1.24, 1.02, -0.32, 0.045);
  ruGlacisKit(P, { w: 2.9, y: 1.05, z: 1.30, eyes: false, hookY: 0.55, hookZ: 1.55, lights: false });
  KIT.towCable(P, [[-0.95, 1.13, 1.05], [0, 1.30, 0.72], [0.95, 1.13, 1.05]]);
  buildRunningGear(P, {
    // 5 spoked wheels with the T-54 GAP pattern (big 1st-2nd gap — the
    // licensed-T-54A identity), no return rollers, rear drive.
    // Track outer wall ±1.43 (ref ground cols end exactly there, r2 probe)
    // r3: track band 1.045..1.425 (ref ground cols ±1.05..1.43); idler
    // tucked + sprocket raised — the print FADES its end wraps (t62mv1
    // class: real gear kept, residual certified)
    style: 'holes', wheelR: 0.405, wheelW: 0.26, wheelY: 0.43, xc: 1.185, dishR: 0.88,
    wheelZs: [0.52, -0.42, -1.26, -2.10, -2.94],
    sprocket: { z: -3.78, y: 0.68, r: 0.24 }, idler: { z: 1.22, y: 0.60, r: 0.20 },
    rollers: [], trackW: 0.49, topY: 0.85, botY: 0.045, paintedEnds: true, coveredTop: false, arms: true,
    contactZF: 0.50, contactZR: -2.88,
  });
  widthAnchor(P, 1.635, 1.13, -0.50);

  // ---- WIDE squat turtle dome to the r2 registered probe (this print's
  // casting is 2.9 m wide): plan ellipse -2.45..+0.61 (reach verified at
  // x 1.008 → z +0.18..-2.02 vs ref +0.30..-2.08), skirt flare max ±1.45 @
  // y 1.52 world, wall shelf 1.955 flat over x 1.0..1.27 (ref front_turret),
  // shoulder 2.18@±0.75, apex 2.34; hem 1.284 overhanging the deck ----
  P.turretG.position.set(0, 1.30, -0.71);
  const rings59 = [[1.30, -0.016], [1.43, 0.10], [1.475, 0.22], [1.44, 0.36], [1.38, 0.48], [1.30, 0.56], [1.10, 0.63], [1.06, 0.655], [1.00, 0.665], [0.92, 0.72], [0.84, 0.80], [0.72, 0.88], [0.56, 0.95], [0.40, 1.01], [0.02, 1.04]];
  meshDome(P, rings59, 1.055, 0, -0.21);
  // flank roof-shoulder pair: the ref's flat 1.955 shelf lives at x
  // 1.0..1.27 on the SIDES only (r3 read: revolved shelf rings poked the
  // plan rear at -2.05 where the ref reads its 1.85 rack) — plan-inside
  // the flare, front-view exact
  for (const s of [-1, 1]) P.add('turret', box(0.26, 0.15, 1.30), s * 1.14, 0.58, -0.24);
  // cast nose BROW over the mantlet (ref side band 2.10-2.17 runs to +0.90
  // — the T-54A casting rises over the gun): bottom ring buried under the
  // dome skin / into the gun collar (§B2 no open rim)
  const ringsBrow = [[0.66, 0.40], [0.65, 0.62], [0.62, 0.76], [0.52, 0.85], [0.02, 0.87]];
  meshDome(P, ringsBrow, 1.0, 0, 0.95);
  // hidden turret-node APRON (print bakes fender bins into its turret node,
  // bottoming 0.545 over -1.42..+0.02 world) — carriers INSIDE the hull
  // silhouette, §C mid-seam splits; r3: plan-tapered like the ref (±1.44
  // aft of -0.63, ±1.26 to -0.28, ±1.13 forward — the ±1.37 plan column
  // read the r2 full-width slab poking +0.10 where the ref tapers)
  // These are hidden reference-mask carriers, not exterior turret armor.
  // Keep their full depth/height and overlap into the casting, but pull
  // their plan width inside the closed centre hull so they cannot sweep
  // through either track as the turret yaws.
  P.add('turretDark', box(1.68, 0.68, 0.45), 0, -0.355, -0.535);
  P.add('turretDark', box(1.68, 0.68, 0.395), 0, -0.355, -0.1175);
  P.add('turretDark', box(1.64, 0.68, 0.35), 0, -0.355, 0.255);
  P.add('turretDark', box(1.58, 0.68, 0.34), 0, -0.355, 0.60);
  // curved rear stowage rack around the bustle (ref -1.90..-2.44, y
  // 1.40..1.80) — chamfered plan corners follow the dome tail
  chamferBox(P, 'turret', 1.90, 0.40, 0.52, 0, 0.30, -1.45, 0.28);
  P.add('turretDark', box(1.60, 0.03, 0.03), 0, 0.505, -1.69);
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, 0.34, 0.03), s * 0.62, 0.32, -1.70);
  // commander cupola LEFT (ref 2.62 band @ world -1.05..-0.75): ring +
  // split-hatch lid — crown 2.615 CARRIES heightM 2.59 (r3: the r2 seat
  // landed the crown at 2.535 and p95 read 2.53/-2.4%)
  P.add('turret', cylY(0.285, 0.30, 0.20, 14), -0.55, 1.165, -0.09);
  P.add('turretDark', cylY(0.25, 0.25, 0.035, 14), -0.55, 1.2975, -0.09);
  P.add('turretDetail', box(0.11, 0.08, 0.16), -0.55, 1.26, 0.12);
  P.add('turretDetail', box(0.10, 0.07, 0.14), -0.72, 1.23, -0.09);
  // loader dome RIGHT (ref 2.44-2.49)
  P.add('turret', cylY(0.26, 0.27, 0.13, 14), 0.50, 1.075, 0.11);
  P.add('turretDark', cylY(0.267, 0.267, 0.016, 14), 0.50, 1.148, 0.11);
  // mushroom VENTILATOR dome forward-center + periscope heads (the ref's
  // 2.46-2.53 roof band over world -0.15..+0.33 — T-54A anatomy)
  P.add('turret', cylY(0.16, 0.17, 0.30, 12), 0, 0.90, 0.91);
  P.add('turret', KIT.sph(0.17, 12, Math.PI / 2), 0, 1.03, 0.91);
  P.add('turretDetail', box(0.10, 0.08, 0.14), -0.22, 1.13, 1.01);
  P.add('turretDetail', box(0.10, 0.08, 0.14), 0.22, 1.13, 1.01);
  // Type 54 12.7mm AA MG at the loader ring (MG law; r2 probe read the
  // cluster AABB top at 2.64 — r3 seats it so the cupola keeps p95)
  {
    const dshk = FITTINGS.pintleMG({
      mats: P.mats, cls: 'dshk', scale: 0.70, tone: 'two-tone', elev: 0.15, ammo: true,
      rotation: [0, -2.35, 0], seed: 6,
    });
    dshk.position.set(0.58, 0.88, 0.24);
    P.turretG.add(dshk);
  }
  // leaning whip antenna at the turret NOSE-LEFT (r3 adjudication: the
  // ref's 2.5-class front tops across x -0.94..-1.34 AND its plan_turret
  // ±1.3-1.45 front extents at z +0.4 are ONE feature — a strongly swept
  // whip at the nose flank; spike-budget legal)
  {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.95, r: 0.02, rake: 0.72, seed: 3 });
    whip.position.set(-0.72, 0.30, 1.11);  // rake sweeps -x (outboard, the ref's x-sign)
    P.turretG.add(whip);
  }
  domeRailRu(P, rings59, 1.055, 0.50, 1.1);  // r4: at y 0.42 the rail lugs owned the ±1.47 plan col (span 1.09 vs ref 0.39)
  // ---- 100 mm Type 59 gun: axis 1.589 (ref band 1.471..1.706), pivot world
  // +0.15, BORE EVACUATOR at the muzzle-third (ref r 0.157 @ +3.55..+4.10),
  // muzzle +4.734 pinned to the 9.00 overall (print ends +4.42) ----
  P.gunG.position.set(0, 0.289, 0.86);
  ruSaddle(P, { rollR: 0.185, rollW: 0.48, tubeR: 0.13, rootR: 0.185, rootL: 0.48 });
  P.addGunExtra(KIT.xform(cylZ(0.5, 0.28, 16, 0.42), 0, 0, 0, 0, 0, 0, [0.44, 0.33, 1]), 0, 0, 0.11);
  P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.042, 14), 0, 0, 0, 0, 0, 0, [0.29, 0.25, 1]), 0, 0, 0.28);
  // Luna-class IR searchlight right of the mantlet, gun-slaved (Type 69 kit)
  P.addGunExtra(KIT.xform(cylZ(0.095, 0.13, 12), 0, 0, 0), 0.36, 0.13, 0.15);
  P.addGunExtraDark(KIT.xform(cylZ(0.099, 0.014, 12), 0, 0, 0), 0.36, 0.13, 0.225);
  P.addGunExtraDark(KIT.xform(cylZ(0.078, 0.010, 12), 0, 0, 0), 0.36, 0.13, 0.233);
  P.addGunExtraDark(box(0.03, 0.10, 0.03), 0.30, 0.05, 0.13);
  tubeGun(P, [
    [0.32, 0.90, 0.135], [0.90, 1.60, 0.122], [1.60, 2.40, 0.118],
    [2.40, 3.40, 0.118], [3.40, 3.95, 0.155], [3.95, 4.452, 0.118],
  ], { rings: [[0.90, 0.138], [1.60, 0.125], [3.40, 0.158], [3.95, 0.158], [4.32, 0.121]], muzzle: 4.452 });
  muzzleBore(P, { r: 0.115 });  // §B3.1 (shadow-named, mask/frame-neutral)
  const dxT59 = ringSkin(rings59, 0.40) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [dxT59 * 0.98, 0.40, 0.065], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-dxT59 * 0.98, 0.40, 0.065], -Math.PI / 2);
  P.topY = 1.32;
}

// ---- T-90A "Vladimir" recovered print (profiles/t90a_vladimir.json) -------
// Aft-shifted frame: hull z -5.20..+2.61, crew deck ~1.66, engine deck 1.76,
// glacis -> 1.28@2.62; oracle parents a full-width stowage STACK (top 2.31,
// z -2.84..-0.94) and the tail drum rack (-4.5..-5.35) into the hull. Dome
// crown 2.32 center trough with left sight block 2.92, pano 3.10 @ +0.39,
// met mast 3.81 @ (-0.24, -2.25), tall rear bin stack to 3.1 on the turret.
// Tube: axis 1.92, sleeve r.105 -> 4.2, muzzle 5.15.
// ---- T-64BV-1 (docs/references/profiles/t64bv1.json) ----------------------
// hull z -4.30..+1.71 (6.0 m), deck 1.21, rear step 1.02 @ -3.9, glacis ->
// 0.94@1.71; slab sides ±1.70 full length; 6 small wheels + 4 rollers, rear
// sprocket; dome center -0.6 crown ~2.02 w/ left cupola 2.29; K-1 cheeks;
// 125 mm at axis 1.466, evac swell z 2.11..3.01, muzzle 4.312. The bergman
// print parents its rear drum/log rack into the Turret node — matched here
// (same world seats) so the component masks compare like for like.
export function buildT64BV1(P) {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // BATCH-12 VERTEX ROUND (owner ruling b522c34): the print is normalized to
  // published dims in vertex space (repair_oracles.py REPAIRS['t64bv1'] —
  // hull mask stretched -8.2% -> 6.545 m, stature 2.283 -> 2.17, fused tube
  // to overall 9.225). This build re-anchors on the post-warp vertex trace
  // (docs/references/vertex/t64bv1.json): every dims-anchor workaround of the
  // short-print era (fat drum pair past the tail, flap-under-tube column) is
  // DELETED — the honest print now spans published length itself.
  // Frame: hull mask -4.614..+1.931, deck plateau 1.197, tail step 0.925-1.0,
  // glacis nose 0.798@1.93, tracks grounded (belly flat 0.00-0.04).
  // r8 (fresh workorder 2026-08-02): BOW NOTCH — ref plan hull front at
  // |x|<0.6 is 1.55-1.68 (not 1.93); the 1.9 nose is corner PRONGS at
  // |x| 0.87-1.31 (ref side band 0.78..0.91 only). Loft ends 1.62.
  // RECESSED CENTER DECK: ref front tops at |x|<0.6 are 1.039 EVERYWHERE —
  // the 1.197 side plateau is the SPONSON TOPS (x 1.0..1.40) only; center
  // engine deck sits at 1.04 (real T-64 layout). Strips authored below.
  loftHull(P, {
    deck: [[-4.29, 0.98], [-4.24, 1.05], [-3.97, 1.06], [-3.50, 1.045], [0.24, 1.045], [0.70, 1.04], [1.14, 1.035], [1.62, 1.02]],
    belly: [[-4.29, 0.47], [-3.92, 0.40], [1.23, 0.40], [1.62, 0.47]],
    wUp: [[-4.29, 1.30], [-4.12, 1.42], [1.53, 1.42], [1.62, 1.40]],
    wLo: [[-4.29, 0.96], [1.62, 0.94]],
    // Keep the closed centre hull while pinching the outer loft above the
    // native return/terminal envelope. This changes only the concealed
    // track-bay roof; measured deck, belly and width curves remain intact.
    sponsonY: 1.16,
  });
  // sponson-top strips carry the ref's 1.197 side plateau (z -3.50..0.24,
  // tapering 1.16 to z 0.83) — segmented per the prism law
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      P.add('hull', box(0.38, 0.155, 0.50), s * 1.21, 1.12, -3.24 + i * 0.535);
    }
    P.add('hull', box(0.38, 0.12, 0.44), s * 1.21, 1.10, 0.48);
    P.add('hull', box(0.38, 0.10, 0.30), s * 1.21, 1.10, 0.83, -0.10, 0, 0);
  }
  // glacis corner prongs past the notched bow — FLAT slabs at the ref's
  // exact 0.78..0.91 nose band (sub-body: neither registration nor
  // hullLengthM may move; the ref's own nose cols are 0.13 thin)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.48, 0.13, 0.34), s * 1.09, 1.06, 1.755);
    P.add('hull', box(0.40, 0.10, 0.20), s * 1.06, 1.03, 1.60, -0.45, 0, 0); // root wedge seated above the idler course
  }
  ruDeck(P, { deckY: 1.045, hatchZ: 0.35, gz: -2.50, grilles: 5, gw: 1.4 });
  // rTAIL r13: hooks/eyes pulled BACK (hookZ 1.78 -> 1.60, eyeZ 1.77 ->
  // 1.62): their 0.40..0.60 bands owned the side 1.8-col bottom at 0.416
  // where the ref ramp line reads 0.546; at 1.6-1.7 they sit ON the ref's
  // 0.36..0.42 ramp values.
  // (r13e clip audit: eyes/hooks pulled INBOARD off the track lane — at the
  // default w-fraction seats they voxel-clipped the idler wrap: eyeX 1.152
  // and hook edge 1.01 vs band inner 0.99)
  ruGlacisKit(P, { w: 3.2, y: 0.93, z: 1.53, barY: 1.10, eyeX: 0.80, eyeZ: 1.62, hookX: 0.85, hookY: 0.46, hookZ: 1.60 });
  // glacis edge mid-steps: ref plan bow is a rounded V (1.76-1.83 over
  // |x| 0.66..0.79 between the 1.55 center and the 1.93 prongs)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.30, 0.11, 0.30), s * 0.72, 1.03, 1.68);
  }
  // §B3 (prism sweep 2026-08-06): the two bare glacis chevron strips become
  // the ref's K-1 cassette rows — 3 cassettes per strip at the SAME seat,
  // rake and plane (span/thickness identical, gaps expose the glacis like
  // the print's quilt seams; side/front/plan bands unchanged — gate HOLD
  // proven 73.4 exact pre-revert).
  for (let row = 0; row < 2; row++) for (const s of [-1, 1]) {
    for (let ci = -1; ci <= 1; ci++) {
      P.add('hullTrack', KIT.xform(box(0.19, 0.07, 0.28), ci * 0.215, 0, 0),
        s * 0.36, 0.99 - row * 0.07, 1.26 + row * 0.28, -0.35, s * 0.32, 0);
      P.add('hullDark', KIT.xform(box(0.19, 0.055, 0.022), ci * 0.215, 0.005, 0.13),
        s * 0.36, 0.99 - row * 0.07, 1.26 + row * 0.28, -0.35, s * 0.32, 0);
    }
  }
  KIT.towCable(P, [[-1.05, 1.02, 0.55], [0, 1.045, 0.01], [1.05, 1.02, 0.55]]);
  for (const s of [-1, 1]) {
    // fender as a segmented bin row (r7c stations law — end caps per slice)
    // r8: dropped to the ref's 1.03 fender top (front cols x 1.6: 1.029)
    for (let i = 0; i < 8; i++) {
      P.add('hull', box(0.20, 0.08, 0.50), s * 1.55, 1.06, -3.26 + i * 0.556);
      P.add('hullDark', box(0.17, 0.06, 0.02), s * 1.552, 1.06, -3.26 + i * 0.556 + 0.26);
      // rTAIL r13: fender INNER LIP — the ref fender-line STEPS: 1.19 tops
      // inboard (front cols 1.448/1.486 read 1.193), 1.03 outboard (x 1.6).
      // Per-bin lip boxes at x 1.45..1.50 carry the inner step (side view
      // blends into the 1.197 sponson plateau; under the skirt in plan).
      P.add('hull', box(0.05, 0.175, 0.50), s * 1.475, 1.11, -3.26 + i * 0.556);
    }
    P.add('hull', box(0.20, 0.05, 0.60), s * 1.55, 1.08, 1.27, -0.06, 0, 0);
    // (r13c: front lip pulled to z 0.28..0.83 — at z 1.25 it topped the
    // side 0.97..1.49 cols at 1.20 where the ref plateau has fallen to
    // 1.065-1.09; the ref's 1.19 front-col content lives at z<=0.83)
    P.add('hull', box(0.05, 0.16, 0.55), s * 1.475, 1.11, 0.555);
    P.add('hull', box(0.20, 0.05, 0.30), s * 1.55, 1.08, 1.67, -0.10, 0, 0);
    // (r13e §B2: filler closes the ±1.55/0.92 top-down hole between the
    // fender-bin row end (0.88) and the front fender box (0.97))
    P.add('hull', box(0.20, 0.06, 0.18), s * 1.55, 1.06, 0.92);
  }
  P.add('hullDark', box(0.16, 0.10, 0.93), -1.21, 1.15, -2.61);         // left exhaust duct on the sponson strip
  stowage(P, 'hull', P.rng, [[0.80, 1.05, -0.86, 0.28, 0.08, 1.42], [-0.80, 1.05, -1.73, 0.28, 0.08, 1.20]]);
  // §B3.2 DENSITY (owner directive 2026-08-06): every T-series carries the
  // common kit. Lanes measured against the COMPONENT masks (t90a lesson —
  // turret shadow protects nothing in the hull mask): the sponson strips
  // carry the side line at 1.1975 (x 1.02..1.40, z -3.49..-0.74) and the
  // recessed center deck reads 1.039-1.045 in BOTH masks at |x|<0.9.
  {
    // unditching log bedded in the right sponson-strip tray (top 1.17 =
    // 27 mm under the 1.1975 strip line; front cols x 1.14..1.28 are the
    // strips' own)
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 1.6, r: 0.07, axis: 'z', straps: 2, seed: 5 });
    log.position.set(1.21, 1.10, -1.80);
    P.hullG.add(log);
    // spare track-link run FLUSH on the recessed center deck (top 1.045 =
    // the authored deck line; ref front line 1.039 at |x|<0.6)
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.5, seed: 9 });
    links.position.set(-0.45, 0.995, -2.00);
    P.hullG.add(links);
    // spare tow cable draped flush on the center deck right (eyes:false —
    // t84 stern lesson; tube tops ~1.048 on the 1.045 deck)
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: false, r: 0.018,
      pts: [[0.40, 1.03, -0.60], [0.75, 1.02, -1.20], [0.45, 1.03, -1.80]], seed: 7,
    });
    P.hullG.add(cable);
  }
  // center-rear drum rack ON the print's own tail (post-warp mask reaches
  // -4.61 with tops 0.93-1.0 — no dims anchors needed, the span IS published)
  // r8: ref plan carries the FULL -4.614 rear across |x|<=1.31 (my old rack
  // left -4.30 gaps at x 0.6..1.38) -> full-width rack floor; posts lowered
  // to the ref's 1.01 top line (old 1.35 posts read 0.34 proud)
  for (const s of [-1, 1]) {
    // drums rear -4.595 (r11): the ref's rear BODY column starts at -4.561
    // (its -4.614 content is 1 sub-pixel into the -4.665 window); my drums
    // at -4.625 lit that column and owned the whole dAlong +0.051. The thin
    // rack plate still carries the plan's -4.61 rear (side-sub-body).
    P.add('hull', cylZ(0.155, 0.35, 10), s * 0.45, 0.85, -4.42);
    P.add('hullDark', cylZ(0.159, 0.03, 10), s * 0.45, 0.85, -4.27);
    P.add('hull', box(0.24, 0.05, 0.76), s * 1.50, 1.16, -4.15);
    // (r13e clip audit: rubber pads raised out of the sprocket-wrap voxel
    // band — y 0.80 sat them at 0.71..0.89 across the lane top 0.81)
    P.add('hullRubber', box(0.26, 0.18, 0.05), s * 1.50, 0.92, -4.44);
  }
  // (r13e §B2: plate extended to the hull rear face — a 9 cm top-down hole
  // ring opened at (±0.93, -4.36) between plate front and loft rear)
  P.add('hull', box(2.62, 0.10, 0.32), 0, 0.90, -4.46);
  P.add('hullDark', box(1.5, 0.10, 0.16), 0, 0.46, -4.45);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.05, 0.22, 0.08), s * 1.38, 1.27, -4.30);
    P.add('hullDark', box(0.05, 0.22, 0.08), s * 1.38, 1.27, -3.60);
  }
  // low cross-bar at -4.55: at -4.59 it UNIONED with the rack-plate sliver
  // in the -4.665 trace window (band 0.235 > 12%) and pinned hullLengthM
  P.add('hullDark', box(1.5, 0.05, 0.05), 0, 0.74, -4.55);
  // (front mud flaps deleted r9 — ref plan bow center is EMPTY beyond 1.55)
  buildRunningGear(P, {
    style: 'steel', wheelR: 0.27, wheelW: 0.20, wheelY: 0.30, xc: 1.265, dishR: 0.88,
    wheelZs: evenStations(6, 4.52, -1.32),
    // idler 1.55/r0.195 (rTAIL r13: at r 0.21 the wrap front face 1.86 lit
    // the 1.904 col at bot 0.598 where the ref reads only its 0.78 prong
    // band; 1.845 clears the 1.852 boundary). r11 history: at 1.59/0.23 the
    // wrap lit the 2.01 column (hullLengthM 6.66); at z 1.50 the ref's 1.9
    // front gear line went uncovered.
    sprocket: { z: -3.95, y: 0.68, r: 0.26 }, idler: { z: 2.00, y: 0.70, r: 0.195 },
    rollers: [-3.04, -1.79, -0.54, 0.72].map((z) => ({ z, y: 0.72, r: 0.066 })),
    // xc 1.265 / trackW 0.55: ref front keeps the 0.356 belly line at
    // x +-0.94 (inner edge 0.99) AND ground content at 1.55 (outer 1.54 +
    // pads 1.58) — the r8 0.52 narrowing dropped the 1.55 ground columns
    trackW: 0.55, topY: 0.76, botY: 0.02, paintedEnds: true, coveredTop: true, arms: true,
  });
  // rTAIL r13: anchor stud into the ref's 0.558..0.731 outer-tab band and
  // the tab z-zone — at (1.704, 0.86) its top poked the ±1.707 front cols
  // 0.13 above the ref's 0.731 line.
  widthAnchor(P, 1.71, 0.64, -3.60);
  // skirt face pulled to 1.684 + battens dressIn (rTAIL r13): the r11 claim
  // that the ±1.707 front cols "no longer read the panel top" was stale —
  // fresh trace read 1.01 there (battens at 1.647..1.695 + stud). Panels at
  // 1.664 (face 1.684, 5 mm clear of the 1.689 boundary), battens inboard.
  // r13c: face back OUT to 1.705 — the widened track box re-gridded the
  // front columns and the fresh ref reads 0.991-1.0 tops at x 1.66..1.73
  // (the panel face belongs in the 1.678/1.717 cols; battens stay inboard)
  ruSkirtBand(P, { x: 1.685, z0: -3.67, z1: 1.26, yTop: 1.045, yBot: 0.55, panels: 6, dressIn: 0.03 });
  // rTAIL r13b: LOW outer tab row — the dressIn move stripped the outer
  // plan extreme-band carriers (widthM fell 3.42 -> 3.37, stations lost
  // 2.3-3.0 wPct on four slices). Per-panel-joint tabs at y 0.55..0.71
  // carry width INSIDE the ref's 0.558..0.731 outer front band, so the
  // ±1.707 front cols stay clean (tab class, mirrors the -3.60 pair).
  for (const s of [-1, 1]) for (let ti = 0; ti < 6; ti++) {
    P.add('hullRubber', box(0.045, 0.16, 0.02), s * 1.6865, 0.63, -3.67 + 0.8217 * (ti + 1));
  }
  // outer rear flap tabs (ref front band x 1.69+: y 0.558..0.731) — capped
  // at the 1.705 WIDTH GUARD line (pub half-width 1.7075; never exceed
  // 1.71); z -3.60 keeps them inside the ref's -3.73 outer plan rear
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.10, 0.18, 0.05), s * 1.655, 0.64, -3.60);
  }

  // ---- turret on the normalized casting: plateau (left gallery) ref 2.173
  // = published 2.17 EXACTLY — the r7-era stature clamps are retired; low
  // right roof ~1.78-1.83, steep face, sloped bustle, rear rack drums ----
  P.turretG.position.set(0, 1.046, -1.266);
  // r13c: mid rings slimmed — the r 1.30/1.22 shoulders at y_w 1.57/1.73
  // lit the front ±1.17-1.21 cols at 1.74 where the ref dome reads 1.597
  const rings = [[1.24, -0.029], [1.32, 0.114], [1.24, 0.523], [1.13, 0.684], [1.02, 0.779], [0.55, 0.827], [0.02, 0.836]];
  meshDome(P, rings, 0.93);
  // BV cheek WING PLATES seated ON the face
  // §B3.1/§B3 (prism sweep 2026-08-06): the wings keep every certified
  // face line and gain the K-1 cassette grammar — dark seam grid + rim
  // rails <=4 mm proud, strictly inside each plate's outline (mask-neutral
  // by construction; gate HOLD proven 73.4 exact pre-revert).
  // CHEV (§5.14 owner '<' order 2026-08-07): the real T-64BV wears its K-1
  // cheek walls as the classic arrow — the two wing plates re-yaw from the
  // r-round's near-flat 0.24/0.10 seats to one continuous ~0.62 sweep per
  // side: inner plate's front tip meets the gun root (0.36, 1.25), outer
  // plate continues the same line and keeps the certified flank rear end
  // (~1.11, 0.21). Tile grammar rides the new yaws. §B7 cap vs the print's
  // flatter seats documented in the packet.
  for (const s of [-1, 1]) {
    P.add('turretTrack', box(0.10, 0.49, 0.70), s * 0.903, 0.27, 0.495, -0.15, s * -0.62, 0);
    P.add('turretTrack', box(0.09, 0.42, 0.58), s * 0.528, 0.29, 1.014, -0.18, s * -0.62, 0);
    eraTileFace(P, { w: 0.10, h: 0.49, d: 0.70, x: s * 0.903, y: 0.27, z: 0.495,
      rx: -0.15, ry: s * -0.62, sx: s, rows: 2, cols: 3, seam: 0.018 });
    eraTileFace(P, { w: 0.09, h: 0.42, d: 0.58, x: s * 0.528, y: 0.29, z: 1.014,
      rx: -0.18, ry: s * -0.62, sx: s, rows: 2, cols: 2, seam: 0.018 });
    // TIP §5.29 (owner refinement 2026-08-07): the wing-plate pair now
    // MEETS AT A POINTED TIP — a third inner plate segment continues the
    // same 0.62 (35.5deg) line from the certified inner tip (0.36, 1.25)
    // to (±0.22, 1.445), tucking against the ruBoot run (boot |x|<=0.085;
    // the 125mm emerges above/behind the tip). Same K-1 cassette grammar;
    // the ±0.15-0.2 plan cols are the certified FUSED-PRINT candidate
    // class (packet §B7/§5.29 cap).
    P.add('turretTrack', box(0.09, 0.40, 0.30), s * 0.29, 0.28, 1.35, -0.18, s * -0.62, 0);
    eraTileFace(P, { w: 0.09, h: 0.40, d: 0.30, x: s * 0.29, y: 0.28, z: 1.35,
      rx: -0.18, ry: s * -0.62, sx: s, rows: 2, cols: 1, seam: 0.018 });
  }
  // TIP §5.29 center gap plate: closes the V vertex dark UNDER the tube
  // (tube band y 0.32..0.52 at |x|<=0.15; plate top 0.29) — no
  // see-through at the tip, §B2.
  P.add('turretDark', box(0.48, 0.24, 0.03), 0, 0.17, 1.43, -0.18, 0, 0);
  // LEFT roof gallery (rTAIL r13 full-profile re-decode): the ref roof
  // UNDULATES — 2.183 plateau over world -1.73..-1.11 ONLY, then a 2.105
  // low run to -0.12, a single 2.183 spike col at -0.279 (cupola hatch)
  // and the 2.131 1K13 head at +0.03. The r9 flat-2.17 strip overshot the
  // low run by 0.08 on 8 columns. heightM p95 anchor: the tall run + spike
  // still land ~7 side cols >= 2.17.
  for (const [zc, dd] of [[-0.2965, 0.335], [0.0385, 0.335]]) {
    P.add('turret', box(0.58, 0.09, dd), -0.62, 1.079, zc);          // tall 2.17
    P.add('turretDark', box(0.50, 0.02, dd - 0.04), -0.62, 1.114, zc);
  }
  P.add('turret', box(0.31, 0.09, 0.47), -0.465, 1.009, 0.441);      // low 2.10 inner
  P.add('turret', box(0.31, 0.09, 0.58), -0.465, 1.009, 0.936);      // low front (to world -0.04)
  P.add('turret', box(0.27, 0.09, 0.47), -0.755, 1.009, 0.441);      // low outer strip
  P.add('turret', box(0.27, 0.09, 0.46), -0.755, 1.009, 0.87);       // outer front (to world -0.166; x -0.89 keeps the -0.938 front col on the ref's 1.731 line)
  P.add('turretDark', box(0.54, 0.02, 0.36), -0.62, 1.049, 0.60);    // low-run inset lid
  // cupola-hatch spike: the ref's single 2.183 col at world -0.279
  P.add('turret', box(0.30, 0.075, 0.075), -0.62, 1.10, 0.9835);
  // r13c: inner roof shoulder — ref front -0.245/-0.284 cols read 2.049
  // between the gallery edge (-0.31) and the 1K13 head (-0.46)
  P.add('turret', box(0.08, 0.16, 0.90), -0.28, 0.924, 0.70);
  P.add('turret', box(0.58, 0.09, 0.08), -0.62, 1.079, -0.444);
  P.add('turret', box(0.44, 0.06, 0.20), -0.62, 0.824, -0.574);
  // narrow center face bulge around the gun port (top shaved to the ref's
  // 1.866..1.914 front band — was 1.926)
  P.add('turret', box(0.30, 0.72, 0.24), -0.05, 0.49, 1.10);
  // rTAIL r13: 1K13 sight HEAD at the measured seat — a NARROW x -0.477
  // fitting (ref verts x -0.495..-0.459, top 2.174 raked to 2.09, ending
  // world +0.061). The r9 center 0.50-wide crest at x -0.15 was DELETED:
  // it lit the side +0.137 col at 2.096 where the ref reads only the
  // 1.533 tube line (the round's worst side_turret column) and pushed 5
  // front center cols to 2.097 vs the ref's 1.77-1.91 dome falloff.
  P.add('turret', box(0.04, 0.24, 0.085), -0.477, 0.965, 1.2935);
  // bustle (r9 decode): the ref plateau over world -2.15..-2.98 is 1.79-1.82
  // (deck tops), with a single-column 2.00 spine peak at -2.57 carried by a
  // flank pair (ref FRONT center cols stay 1.77-1.84 — no center mass)
  P.add('turret', box(1.70, 0.55, 0.42), 0, 0.475, -1.00);
  // rTAIL r13: deck box 2 pulled to world -2.922 + a 1.66 step behind it —
  // the ref bustle SLOPES: 1.767-1.793 deck through -2.878, then 1.637/
  // 1.663 over -2.982..-3.085 (the flat 1.796 deck overshot 0.15 there)
  P.add('turret', box(1.70, 0.55, 0.38), 0, 0.475, -1.39);
  P.add('turret', box(1.70, 0.30, 0.268), 0, 0.464, -1.724);
  // ref's 2.00 spike col at world -2.57 lives on the LEFT flank only (ref
  // front x 0.5..0.9 stays 1.77) — upright stowed-snorkel end, z-slimmed
  // INSIDE the -2.566 col (rTAIL r13: its -2.62 front face crossed the
  // -2.618 boundary and lit the -2.67 col at 2.001 vs ref 1.793)
  // r13d SIGN CORRECTION (banked law): dAlong +0.052 means the proc window
  // for ref column Z is [Z, Z+0.104] — proc content sits half a column
  // REARWARD of raw ref seats (the r13c forward guess measured wrong-way).
  // Spike into the -2.566 col's proc window [-2.566,-2.462] w/ 22mm margins.
  P.add('turret', box(0.30, 0.20, 0.06), -0.70, 0.86, -1.248);
  P.add('turretDark', box(1.7, 0.42, 0.04), 0, 0.30, -2.00);
  // cloth lowered 0.72 -> 0.62 (rTAIL r13: its raked top edge 1.90 would
  // out-top the lowered MG receiver over the ref's 1.793 band)
  P.add('turretCloth', box(1.2, 0.13, 0.24), 0, 0.62, -0.86, 0.12, 0, 0);
  // rear rack (r8 corner decode, ASYMMETRIC like the print): LEFT long drum
  // pair to world -4.48, RIGHT short drum to -3.81, snorkel hump world
  // -3.15..-3.42 top 1.716 with the left rack riser 1.62 behind it, right
  // flank bin, left bracket. Center rods DELETED (ref plan center rear is
  // -3.42; the rods read -4.54 excess on six columns).
  // basket floor rails shortened to the ref's -3.42 rear (rTAIL r13: at
  // d 1.29 they reached world -3.72 and owned the ±0.56 plan cols 0.31 past
  // the ref's -3.419)
  for (const s of [-1, 1]) P.add('turretDetail', box(0.05, 0.05, 0.99), s * 0.60, 0.04, -1.66);
  // left drums SPLIT with the connecting top rail (ref side at -4.23 is a
  // thin 1.248..1.274 sliver between drum bodies). rTAIL r13: both gap
  // faces pulled 13 mm off the -4.281/-4.177 column boundaries — they sat
  // ON them and AA-filled the gap col (proc read 1.014..1.325 vs the
  // ref's bare rail sliver).
  // r13c dAlong-aware re-cut: proc windows sit 0.052 forward — drums as
  // pucks matching the SHIFTED sliver/drum cols (ref -4.229 sliver ↔ proc
  // [-4.333,-4.229] must be rail-only; masks light at any partial pixel,
  // so faces keep >=22mm off the shifted boundaries).
  P.add('turret', cylZ(0.165, 0.16, 12), -0.795, 0.12, -3.069);
  P.add('turret', cylZ(0.165, 0.248, 12), -0.795, 0.12, -2.713);
  P.add('turretDark', cylZ(0.17, 0.03, 12), -0.795, 0.12, -2.62);
  // short connecting rail INSIDE the shifted sliver window only (the old
  // 1.00 m rail topped every -3.6..-4.5 col at 1.274 where the ref reads
  // its 1.169-1.195 fender line)
  P.add('turretDetail', box(0.24, 0.026, 0.06), -0.795, 0.215, -2.911);
  // low longitudinal bar: floater-guard chain drum pucks -> rack riser,
  // hidden inside the parity-rail band (y 1.05..1.15)
  P.add('turretDetail', box(0.10, 0.10, 1.01), -0.795, 0.054, -2.6445);
  // rack cross-member: the ref -4.541 col reads a 1.014..1.195 band aft of
  // the drums (kept off the shifted drum windows)
  P.add('turret', box(0.24, 0.19, 0.06), -0.795, 0.0495, -3.223);
  // center rods RESTORED (r10: the r8 wo cols +-0.14-0.17 read the ref's
  // rods to world -4.39 — the "deleted rods" call misread the +-0.04 cols)
  // + the ref's RIGHT long rod at x 0.73
  // rods at |x| 0.115..0.205 with slim caps: the +-0.05 and +-0.26 plan
  // columns are ref-EMPTY at the rear (rods own only the +-0.16 columns)
  // rTAIL r13: rods/caps slimmed INSIDE the ±0.195 plan boundaries — the
  // r10 0.045/0.055 radii at ±0.16 crossed them by 10-20 mm and dragged
  // the ±0.247/±0.273 cols to -4.38 vs the ref's -3.419 rear (err 0.55).
  // r13d: rods RAISED to the sliver band (y_w 1.22..1.30 — the ref's rods
  // ride at its connecting-rail height, which is why its -4.229 sliver col
  // reads one continuous 1.247..1.273 band; low rods broke that col)
  for (const rx of [-0.15, 0.15, 0.73]) {
    P.add('turretDetail', cylZ(rx > 0.5 ? 0.045 : 0.038, 1.30, 8), rx, 0.212, -2.418);
    P.add('turretDark', cylZ(rx > 0.5 ? 0.055 : 0.040, 0.14, 8), rx, 0.212, -2.878);
  }
  // left rack side-boards (ref plan x -1.04..-1.19 rear to -2.73 / -2.12)
  P.add('turret', box(0.09, 0.22, 2.30), -1.085, 0.10, -0.31);
  P.add('turret', box(0.09, 0.18, 1.15), -1.185, 0.08, -0.279);
  // right drum x 1.05..1.30 only (ref cols 0.89-0.99 rear is -3.44, not the
  // drum's -3.81)
  P.add('turret', cylZ(0.10, 0.37, 12), 1.14, 0.12, -2.359);
  P.add('turretDark', cylZ(0.105, 0.03, 12), 1.14, 0.12, -2.20);
  P.add('turretDetail', box(0.50, 0.05, 0.06), 0.80, 0.04, -2.33);      // right drum arm (floater guard)
  P.add('turret', box(0.40, 0.50, 0.27), 0.35, 0.42, -2.019);           // snorkel stack
  // lid dropped 0.70 -> 0.645 (rTAIL r13: 1.776 top vs the ref's 1.715
  // hump line at -3.29..-3.40)
  P.add('turretDark', box(0.34, 0.06, 0.21), 0.35, 0.645, -2.019);
  P.add('turret', box(0.30, 0.28, 0.10), -0.795, 0.43, -2.19);          // left rack riser (ref 1.61 @ -3.5)
  // right flank bin x 1.28..1.41 (ref front: 1.55-1.60 tops END at x 1.42;
  // cols 1.44+ read the 1.19 fender line — rTAIL r13: the 1.44 edge sat
  // 11 mm into the 1.448 front col and read 1.586 vs the ref's 1.193
  // fender line; z re-seated to the ref plan band -1.236..-2.119)
  P.add('turret', box(0.13, 0.28, 0.88), 1.345, 0.40, -0.41);
  P.add('turretDark', box(0.11, 0.22, 0.03), 1.345, 0.40, -0.84);
  // r13c: outer bin step — the re-gridded front 1.448 col reads ref 1.443
  // (a lower shelf outboard of the 1.41 bin edge)
  P.add('turret', box(0.035, 0.14, 0.65), 1.4275, 0.32, -0.41);
  P.add('turret', box(0.08, 0.12, 0.10), -1.335, 0.44, -0.334);         // left bracket (x -1.30..-1.38 only)
  // commander cupola LEFT (ref 2.173 = the plateau top; head carries it)
  // r13c: base r 0.245 -> 0.22 (its -0.925 edge lit the front -0.938 col
  // at 2.016 where the ref reads 1.731)
  P.add('turret', cylY(0.20, 0.22, 0.19, 14), -0.68, 0.875, -0.09);
  P.add('turretDark', cylY(0.10, 0.11, 0.095, 10), -0.68, 1.00, -0.09);
  P.add('turret', cylY(0.10, 0.10, 0.066, 10), -0.68, 1.085, -0.09);
  // right roof housing (r13d: raised back — the re-gridded ref front reads
  // 1.98-2.01 at x -0.2..+0.1; side-safe under the 2.18 plateau)
  // (r13e: split — the 1.98-2.01 ref band lives only at x -0.21..+0.06;
  // x +0.10..0.26 keeps the r12 1.77-1.84 line)
  P.add('turret', box(0.26, 0.23, 0.39), -0.10, 0.84, -0.33);
  P.add('turret', box(0.24, 0.23, 0.39), 0.15, 0.70, -0.33);
  P.add('turretDark', box(0.22, 0.15, 0.05), 0.10, 0.72, -0.11);
  // Thin fender-line rails belong to the hull, regardless of the retired
  // oracle's incorrect turret parenting. Keep their world-space runs but
  // seat them just outboard of the native course so they remain fixed and
  // supported when the turret yaws. rTAIL r13 RE-SEAT from vertex
  // census: the ref rail band is x -1.479..-1.52, y 1.002..1.20, z
  // -4.077..+1.139 — the r8 "side band 1.34..1.39" was a PRE-WARP number
  // (the batch-12 stature squash moved it): at y 1.336..1.386 the rails
  // owned the side -3.6..-3.8 cols at 1.377 vs the ref's 1.195 fender
  // line. Also x -1.455 grazed the -1.442 plan boundary (2 mm) and bled
  // the whole rail band into the -1.39 col (the 2.52 plan monster; the
  // ref's -1.6 sliver there is the little bracket, which now owns it).
  P.add('hullDetail', box(0.041, 0.198, 5.216), -1.59, 1.101, -1.469);
  P.add('hullDetail', box(0.03, 0.198, 2.94), 1.58, 1.101, -2.226);
  // MG lowered to the ref's 1.845-1.847 rear-roof line (receiver top was
  // 1.936 — rTAIL r13)
  // §B3.2/§I (2026-08-06): hand nsvt() -> census FITTINGS.pintleMG. The
  // fitting receiver reproduces the certified carrier EXACTLY (top 0.800
  // local = the ref's 1.846 line; z-band -1.077..-0.665 vs the hand's
  // -1.08..-0.66) and everything else is interior: barrel run covered by
  // the 0.854 box (z -0.67..-0.47), the right housing 0.955 (z -0.53..
  // -0.14) and the cupola/gallery; ammo can inside the gallery's x -0.33..
  // -0.91 front band. Mask-neutral swap (gate HOLD verified).
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', tone: 'dark', elev: 0.02, ammo: true });
    mg.position.set(-0.45, 0.482, -0.93);
    P.turretG.add(mg);
  }
  P.add('turret', KIT.sph(0.114, 12, Math.PI / 2), 0.45, 0.715, -0.16);
  domeRailRu(P, rings, 0.93, 0.38, 0.98);
  // ---- 125 mm 2A46-2 on the normalized tube: axis 1.445, muzzle world
  // +4.61 (overall 9.225 = published, matching the stretched print) ----
  P.gunG.position.set(0, 0.399, 1.634);
  // r8: furniture narrowed to |x|<=0.09 — the ref's fused tube occupies
  // only the center plan columns; 0.10-0.11-wide kit polluted x +-0.14
  ruSaddle(P, { rollR: 0.143, rollW: 0.22, tubeR: 0.084, rootL: 0.6 });
  // §B3.1 (prism sweep 2026-08-06): the KTD-2 hood is a ROUNDED cover, not
  // a prism — elliptical shell with the same top/bottom/width/front lines
  // as the old box (side/plan silhouettes identical; only the corner read
  // changes). Lens recess stays inset in the front face.
  P.addGunExtra(KIT.xform(KIT.cylZ(0.5, 0.39, 14), 0, 0, 0, 0, 0, 0, [0.16, 0.114, 1]), 0, 0.025, 0.46);
  P.add('gunDark', box(0.12, 0.078, 0.018), 0, 0.025, 0.644);           // §B3: KTD lens face (inside the hood silhouette)
  // rTAIL r13: collar/throat slimmed to |x|<=0.08 — the 0.30-wide throat
  // (a gun child, so plan_turret content) filled the ±0.14 plan cols to
  // z 0.45 where the ref's slit-mantlet face ends at +0.012.
  // §B3.1 (prism sweep 2026-08-06): the bare collar/throat prisms become
  // the REAL accordion boot — same envelope union (dome-face rect w 0.16 /
  // y -0.31..+0.11, hanging bottom held near the certified -0.30 line
  // through the fold run, converging onto the tube at the clamp). The
  // certified |x|<=0.08 plan hide is preserved (every fold w <= 0.16,
  // crease collars +-0.0845 < tube r 0.0875). Gate HOLD proven 73.4 exact
  // (r1 of this sweep, pre-revert).
  ruBoot(P, { pts: [
    [-0.38, 0.16, 0.42, -0.10],    // dome face (old breech-throat rect)
    [0.085, 0.16, 0.365, -0.1175], // slit-frame exit fold (bottom -0.30)
    [0.42, 0.155, 0.30, -0.145],   // mid fold (bottom -0.295)
    [0.71, 0.14, 0.21, -0.06],     // clamp fold onto the tube
  ] });
  // §B3.2 (2026-08-06): PKT coax port right of the tube, INSIDE the r8
  // |x|<=0.09 gun-furniture law (disc x 0.04..0.08) — stub seats against
  // the dome face behind the boot root, washer flush on the fold skin.
  P.addGunExtraDark(cylZ(0.020, 0.06, 8), 0.06, -0.049, -0.385);
  P.addGunExtraDark(cylZ(0.028, 0.010, 10), 0.06, -0.049, -0.352);
  tubeGun(P, [
    [0.60, 2.26, 0.0875], [2.26, 3.31, 0.095], [3.31, 4.01, 0.0875], [4.01, 4.24, 0.0835],
  ], { rings: [[0.95, 0.0895], [1.30, 0.0895], [1.62, 0.0895], [1.94, 0.0895], [2.26, 0.097], [2.61, 0.097], [2.96, 0.097], [3.31, 0.097], [3.66, 0.0895], [4.01, 0.0895]], muzzle: 4.24 });
  muzzleBore(P, { r: 0.0835 });  // §B3.1 (shadow-named, mask/frame-neutral)
  const dx4 = ringSkin(rings, 0.36) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [dx4 * 0.99, 0.34, -0.55], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [-dx4 * 0.99, 0.34, -0.55], -Math.PI / 2);
  P.topY = 1.09;
}

// ---- PT-91M Pendekar (docs/references/profiles/pt91m.json) ----------------
// Centered frame: hull ±3.85, deck 1.81, tall powerpack stack (±0.9 wide,
// steps 2.02/2.16) over the raised tail, glacis -> 1.44@3.80; skirts ±1.735
// with ERAWA plates ±1.79 on the front half; dome crown ~2.33 center 0.18,
// left cluster 2.64, pano 2.85, met mast 3.82 @ (-0.25, -1.0); tube axis
// 2.008, sleeve r.122, muzzle 6.58.
// Invisible width anchor: sub-pixel studs at the exact normalized half-width
// (is7 precedent) so safeScale stays 1.0 and authored heights hold.
export function widthAnchor(P, halfW, y, z) {
  for (const s of [-1, 1]) P.add('hull', KIT.box(0.012, 0.02, 0.02), s * (halfW - 0.006), y, z);
}

// ---- T-80 line: T-80 (1976) / T-80B / T-80BV ------------------------------
// r25 EXPANSION (docs/references/vertex/t80.json / t80b.json / t80bv.json,
// REG batch 0a39d55; triage-zero-rows: oracles clean, no build existed).
// World frame = extract frame + 1.3485 (t80; hull mask re-centered). PUB
// SOVEREIGN: hull ±3.39 (6.78), width 3.52 (skirt faces ±1.76), height 2.20
// (crown), muzzle +6.27 (9.66 overall). The t80 oracle mask runs 4.3% long
// (±3.53) — both hull ends eat a known ~2-col miss per the round brief.
// Decode highlights (t80 curves, world): deck 1.41..1.505 with the 1.505
// engine plateau at -1.66..-1.36; SIDE HUMP band (turbine exhaust deck)
// x ±0.78..1.62 topping 1.86 over -3.39..-3.06 with a recessed 1.44 center
// channel (plan center rear -3.26 vs the sides' clamped -3.39); belly 0.44
// tub floor with gear-fade ramps rear (0->0.49 @ -1.90..-2.84) and front
// (0->0.775 @ 2.33..3.36); bow ARROW plan (center 3.16, fender corners
// 3.49->clamp); turret crown 2.20, MG cluster 2.29 x2 cols @ -0.64..-0.49,
// bustle band 2.20 over -1.64..-1.09 with raked 1.84->1.65 bottom; FAT
// sleeved tube band 1.56..1.86 (true r 0.135-0.15 cylinders, circle law);
// turret-node APRON: the ref turret mask bottoms at 0.66 across z -0.49..
// +1.08 (print carries hull-side kit in the turret node) — mirrored with a
// hidden turretDark carrier inside the hull silhouette.
// ---- T-84 Oplot (docs/references/vertex/t84.json — batch-35 RE-WARPED print)
// r31 RE-ANCHOR (post be7eb4f): the oracle now sits at PUBLISHED dims (hull
// ×1.107, fused tube pinned rear+9.72, furniture knee 2.23) so the r30
// short-print laws are RETIRED here: no end extensions, no rearward margin,
// no cover columns — the build re-authors 1:1 against the warped ref in its
// OWN WORLD FRAME (extract hullMask −4.858..+2.222, muzzle +4.863, box
// z ±4.863). Authored frame == ref world frame (dAlong ≈ 0 by construction)
// and max |x| is EXACTLY 1.78 so safeScale stays 1.0 (r30's ±1.7875 strips
// shrank the whole build 0.42%).
// Calibrated digest (tools/tmp-t84-workorder-full.mjs, visibility-fixed
// boxes — the stock workorder's side-z labels ran +0.54 off ref-world this
// round; y values were always ground-true): deck 1.30@−2.16..−0.10 /
// 1.333@−2.60..−4.16 + hump 1.365@−2.67..−3.05, glacis 1.278@0.55 ->
// 1.148@1.91 -> nose face 1.99 (plan center; corner content to 2.24 rides
// LOW y 0.62..1.00 — V-bow class), stern overhang deck 1.21-1.25 to −4.86
// at |x| 0.93..1.29 ONLY (center plate −4.71, notch −4.55); front-view tub:
// center belly 0.23 (|x|<=0.78), step 0.35 to 0.95, ground contact
// 0.99..1.50, fender line 1.31-1.35, skirt lip rail at ±1.78 y 0.93..0.97;
// tracks grounded −3.43..0.95, straight 27° climb to a small HIGH idler
// (wrap front <=1.97), sprocket wrap bottoms 0.21@−3.79; welded turret:
// cheek apex ramp 1.94@0.81 -> 2.04@−0.16, tall body walls 2.10 at ±1.20
// over z −0.50..−1.31, low collar 1.58..1.66 to ±1.245 (z −0.98..0.55),
// roof plates 2.205@−0.40..−2.03, sight housings 2.23 @ z −0.36..−0.50,
// bustle ±0.88 to −3.04 (bottoms 1.66->1.80, Utes crate 2.21@−2.56..−2.84,
// RIGHT-flank stowage to x 1.20 — print asymmetry, variant tell); apron
// 0.94 @ −0.16..−1.73 (hidden carrier, t80 pattern); tube axis 1.835
// (band 1.94..1.73), plan edge <=0.10 (bin law), evac BOX 1.97 @
// 2.39..3.12, muzzle +4.86.
// ---- T-90M Proryv (docs/references/vertex/t90m.json, batch-31 warped oracle)
// FIRST BUILD (r26). World frame = extract + 1.38 (hull mask re-centered to
// ±3.43 = pub 6.86). PUB SOVEREIGN: width 3.78, height 2.23 (roof plateau
// 2.24-2.25 rides the 1% grace), muzzle +6.20 (9.63 overall).
// Decode (world): flat deck 1.35-1.39; glacis corner prongs 3.44 over a 3.20
// center V-bow (t90sm bow-notch class); rear plate -2.90 full width with the
// drum/log RACK to -3.43 at |x|<=0.99 (tops 1.84, floor 1.23-1.44); WELDED
// turret vs the t90a cast dome — flat cheeks (plan front 1.91 center ->
// 0.92@|x|1.74, chamfered corners), broad roof plateau 2.24-2.25 over z
// -1.2..+0.5, turret-node APRON bottoming 0.88 across z -0.8..+0.9 (print
// carries hull-side kit in the turret node — hidden carrier, t80 pattern);
// Kord RWS + bustle bins as SEPARATED THIN MEMBERS (post-warp ref holds them
// at 2.20-2.25 / bins band 1.58..1.91 reaching z -2.32); Relikt skirt line;
// 2A46M-5 axis 1.61, evac swell r 0.138 at 3.20..3.44, muzzle +6.20.
// ---- T-72B obr.1987 (profiles/t72b_1987.json) ------------------------------
// Aft frame: hull -4.84..+2.43, deck 1.56-1.61, tail rack to 1.74 (drums+log
// on the plate), glacis 1.42@1.1 -> 1.13@2.43; Super-Dolly dome center -0.7
// crown ~2.55 w/ left cluster, 902B bank LEFT cheek, K-1 rafts; 2A46M axis
// 1.75, evac swell r.119 z 2.65..3.53, muzzle 4.852.
// ---- T-72B3M obr.2022 (profiles/t72b3m.json) -------------------------------
// Aft frame: hull -4.56..+2.27, deck 1.36-1.39 with a raised soft-stowage
// band 1.94 (z -2.7..-1.4, oracle hull-parented), tail slat shelf 1.53; dome
// center -0.5 crown ~2.35 under the Sosna-U tower (3.05) / mast 3.40; Relikt
// cassettes + soft-bag skirts; 2A46M-5 axis 1.679, muzzle 4.792.
// ---- T-72BU (profiles/t72bu.json) ------------------------------------------
// Aft frame: hull plates -4.75..+2.68; the print parents its BARREL and a
// dome filler band (1.78-1.81, z -1.5..+0.9) into the HULL node — the filler
// is matched with a hull-bucket box under the dome; the barrel stays on the
// correct rig (documented oracle cap: hull/turret masks split the tube).
// Dome crown ~2.20 center w/ big left cluster 2.78 and mast 3.58; rear
// basket run -1.5..-3.2 rising 2.0 -> 2.43. Tube axis 1.715, muzzle 5.448.
// ---- T-90SM (profiles/t90sm.json) ------------------------------------------
// Near-centered frame: hull -3.83..+3.85, deck 1.55, glacis -> 1.13@3.73;
// WELDED turret ~3.3 wide with the squared bustle to -2.9 (top 2.20) and two
// sight towers to 3.15 (pano left -0.65, RWS right +0.25); Relikt cheeks.
// Tube axis 1.912, MRS bulge r.118 at world 5.17..5.29, muzzle 6.732.
// ---- T-90 (base, 1992 obr.) — §5.38 owner priority wave --------------------
// Print: public/models/community-candidates/t90_kojf.glb (LOCAL-ONLY
// quarantine, semantic OBJ re-bake; vertex REG + all three harness maps,
// commit 7b45f13). Probe receipts (tools/tmp-t90fam-probe.mjs — node AABBs
// + z-hists, raw meters ~1:1: skirt width 3.81 vs pub 3.78): hull body
// -3.48..+3.38 (6.86 = pub), deck plateau 1.545 over z -2.55..+0.95, glacis
// break ~2.30 falling to the 0.99 nose at 3.29, belly 0.44 flat, rear rake
// 0.70@-3.40; rear rack band to -3.76 + split-log tail to -4.18 (matched as
// thin slivers only — hullLengthM sovereign, the t90sm tail-sliver class);
// skirt-front ERA x 1.83..1.91 / y 0.83..1.43 / z 0.59..2.58 (3 per side);
// glacis K-5 rows y 0.84..1.13 @ z 2.26..2.84 + y 1.11..1.33 @ z 1.80..2.27.
// Turret casting z -1.23..+1.16 (max halfW 1.66 @ -0.27, nose 0.69 @ +1.12),
// ring skirt bottom 1.408, crown ~2.20; the print's OWN K-5 chevron is the
// §5.29 tip read: inner plates flank the gun (|x| 0.34..0.59, z to 1.34),
// mid leaves |x| 0.83..1.44 z to 1.21, outer leaves |x| 1.00..1.74 z
// 0.07..0.87 — one V line (±0.30, 1.42) -> (±1.62, 0.45); roof plates to
// 2.32 (authored 2.24 tops — dims p95 cap, the t90sm mushroom class); NSVT
// mass to 2.86 over z -0.57..+0.16 (matched to the dims budget only —
// t62mv1 DShK certified-cap class, §5.37 NSVT-prominence ASK-OWNER trade);
// rear bustle rack to -2.15 (halfW 0.76), whip antenna at (-0.27, -1.22).
// Gun axis 1.72, print muzzle 5.99 -> authored 6.10 (overall 9.53
// sovereign). Authored frame = print +0.05 z (body ±3.43), ground y=0.
// FAMILY LAW §5.13: the landed t90a kit grammar (K-5 chevron front, round
// red Shtora eyes, saddle/collar/boot gun assembly, glacis kit) on the base
// mark's own CAST dome — the print is cast (the 1992 turret); the §5.13
// welded-rebase order named t90a/vladimir; the t72 graduates keep the
// fleet's cast grammar. SPIN §5.31: pivot at the casting plan-chord center
// (chord -1.18..+1.21 authored -> center ~0 = turretG z 0).
// ---- T-90MS Tagil (export demonstrator) — §5.38 owner priority wave --------
// Print: public/models/community-candidates/t90ms_kojf.glb (LOCAL-ONLY
// quarantine, semantic OBJ re-bake; vertex REG + harness maps, 7b45f13).
// Probe receipts (tmp-t90fam-probe, raw ~1:1; authored frame = print
// +0.09 z, body ±3.43, ground y=0 — hull family byte-shared with the t90
// print, same gear/tread nodes): turret prism body world -1.6..+1.05
// (halfW 1.48..1.61, roof 2.23..2.29), BIG bustle world -1.6..-2.79 (halfW
// ~1.0..1.24, roof 2.14..2.19, underside 1.62..1.72), rear slat cage to
// world -3.27, bustle-side stowage modules x ±1.33 / y 1.68..2.12 /
// z -3.05..-0.88, RWS+pano tower cluster ON the bustle roof (print 2.93..
// 3.03 — matched to the dims budget only, the certified t90sm tower-cap
// class), ejection-port roof plate x ±0.19 z -1.41..-0.93, smoke banks
// x ±1.48 z -0.84..-0.38, whip antenna (0.56, -1.77). Cheek Relikt: inner
// chevron pair era06/07 (|x| 0.29..0.99, z to 1.46 world) + outer sets
// era04/05/08/09 out to |x| 1.84 — the §5.29 V again, Relikt-era plates.
// Hull: era01-06_hull = TALL hard-skirt ERA (face ±1.79, y 0.76..1.43,
// three per side over z -1.25..+2.73); cage01_hull = full-perimeter bar
// armor to ±1.89 (the width line) wrapping the rear flanks + transom
// (rear reach authored sliver-class, hullLengthM sovereign); glacis rows
// era07-10 (upper y 1.08..1.43 z 1.78..2.46, lower y 0.85..1.23 z
// 2.44..2.94). Gun 2A46M-5: axis 1.82, print muzzle 6.05 -> authored 6.10.
// FAMILY LAW §5.13: the t90sm welded grammar (polyTurret prism + squared
// removable bustle + slat + RWS/pano/Sosna ensemble) re-lofted to THIS
// print's staircase; garage tells vs t90sm: desert-sand factory paint
// (spec), hull perimeter cage, taller skirt ERA, bustle-side module rows.
// SPIN §5.31: pivot at the prism plan-chord center (turretG z -0.19).
// ---- T-90A Burlak (experimental bustle-autoloader turret) — §5.38 ----------
// Print: public/models/community-candidates/t-90a_burlak_armored_warfare.glb
// (LOCAL-ONLY quarantine, flat Object_N; vertex REG + harness maps,
// 7b45f13). Probe receipts (tmp-t90fam-probe; authored frame = print
// +0.05 z, body ±3.43 — the hull/tread/suspension nodes are BYTE-IDENTICAL
// to the t90 print's: one T-90 hull family): turret shell Object_2 world
// -3.66..+1.52 / roof band 2.21..2.31 / ring skirt 1.388; casting z
// -1.55..+1.05 with the ROUNDED plan front (staircase 1.77@-1.06 ->
// 1.60@+0.35 -> 1.06@+0.81 -> 0.77@+1.04, mantlet cheeks ±0.28 to +1.52);
// the LONG autoloader bustle z -1.7..-3.66 (x ±0.63..0.96, roof 2.245..
// 2.30 = the spec 2.30 height datum, underside ~1.70); side/cheek armor
// modules Object_20/23 out to ±1.98/±2.04 (authored faces capped inside
// the 1.845/1.89 width court — dims sovereign; print width-normalization
// cap documented in the packet); commander station LEFT-REAR Object_16
// (x -1.59..-0.25, y to 2.69 — tops ride the dims budget), left roof rail
// bins Object_17 (to 2.37), roof-front plate field Object_4 (y 1.58..2.06,
// z -0.15..+1.13), engine-deck cover plate under the bustle Object_9
// (hull kit — the §B2 bustle-overhang air is turret-bearing class), right
// fender bins Object_25 (the t90-print seat), bow center splash strip
// Object_12. Gun Object_15: axis 1.78, print muzzle 5.93 -> authored 6.10.
// FAMILY LAW §5.13: t90a hull + family prism grammar; the Burlak turret's
// own identity = rounded front + the big squared rear bustle (the print is
// the authority on its unusual shape). SPIN §5.31: pivot at the CASTING
// plan-chord center (turretG z -0.25; the bustle is rear kit, not chord).
// Dome grab rail pair seated just off the measured skin.
export function domeRailRu(P, rings, sz, y, len) {
  const { box } = KIT;
  const r = ringSkin(rings, y) + 0.035;
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.02, 0.02, len), s * r, y, -0.2);
    for (const dz of [-len / 2 + 0.06, len / 2 - 0.06]) {
      P.add('turretDetail', box(0.05, 0.018, 0.018), s * (r - 0.025), y, -0.2 + dz);
    }
  }
}

// K-5/K-1/relikt/erawa cheek arrays seated on a MEASURED ring profile.
export function eraRuCheeks(P, p, kind) {
  const { box } = KIT;
  const skinD = (t, y) => {
    const r = ringSkin(p.rings, y);
    const A = r, B = r * p.sz;
    return 1 / Math.sqrt((Math.cos(t) / A) ** 2 + (Math.sin(t) / B) ** 2);
  };
  // rCz (r9): seat the ERA ring around the DOME's plan center. The lathe is
  // authored at (cx, cz) but this ring used to revolve around z=0 — on a
  // cz -0.20 dome every front-arc cassette floated 0.2 m proud of the skin
  // in plan (t72b3m r9 workorder: 8 columns x 0.1-0.25).
  const put = (t, y, w, hgt, d, tilt, bucket, dist) => {
    P.add(bucket, box(w, hgt, d), Math.cos(t) * dist, y, Math.sin(t) * dist + (p.rCz ?? 0), tilt, Math.PI / 2 - t, 0);
  };
  if (kind === 'k5') {
    // Kontakt-5 clamshell: one wedge course per cheek meeting at the mantlet,
    // welded end caps, dark course seam + proud flank tiles. The wedges own
    // the measured front-arc wings (tips near the full turret-mask width,
    // hanging to just above the fender line).
    for (const s of [1, -1]) {
      // k5T/k5Out (r10): arc seat + standoff — the t90a clamshell leaves
      // reach 0.4 m proud of the cheeks toward the mantlet (ref plan front
      // 2.48-2.53 at |x| 0.7-0.9)
      const t = Math.PI / 2 + s * (p.k5T ?? 0.55);
      const yc = p.k5Y ?? 0.16;
      const D = skinD(t, yc) + (p.k5Out ?? -0.04);
      const x = Math.cos(t) * D, z = Math.sin(t) * D;
      // k5Yaw (r12): rake the leaf forward-inboard toward the mantlet
      // (t90a ref: leaf runs (±1.29, 1.36) -> (±0.61, 2.35)); k5Rise lifts
      // the inner end (ref upper edge 2.004 at the cheek).
      const ry = Math.PI / 2 - t - s * (p.k5Yaw ?? 0);
      const L = p.k5Len ?? 1.30;
      const H = p.k5H ?? 0.40;
      const rz = s * (p.k5Rise ?? 0);
      // k5Pitch / k5TileY (t90a_vladimir rTAIL r13b, opt-in): leaf pitch and
      // flank-tile seat height — defaults byte-identical for every caller.
      const px5 = p.k5Pitch ?? -0.40;
      // k5D (§4.999991 russia fix-round, opt-in): leaf DEPTH along its own
      // local z — the verdict's "detached planks with unsupported tips"
      // read comes from the square-section plank floating at its k5Out
      // standoff. A deep leaf keeps the FRONT face plane byte-identical
      // (center retreats along local -z by (k5D-H)/2) while the body runs
      // back INTO the dome skin — a broad plate hugging the casting.
      // Default k5D = H is byte-identical for every legacy caller.
      const k5D = p.k5D ?? H;
      const dGrow = (k5D - H) / 2;
      // box local +z in world under XYZ Euler (rx=px5, ry, rz~0):
      // dir = (sin ry, -cos ry * sin px5, cos ry * cos px5)
      const dzx = Math.sin(ry) * dGrow;
      const dzy = -Math.cos(ry) * Math.sin(px5) * dGrow;
      const dzz = Math.cos(ry) * Math.cos(px5) * dGrow;
      // k5Bucket (§4.999991, opt-in): the real K-5 wedges wear the SCHEME
      // PAINT (t72b3m rBucket law — the spareTrack slot reads grey-steel);
      // material-only, mask-identical. Default byte-identical.
      const k5B = p.k5Bucket ?? 'turretTrack';
      // TIP §5.29 k5LeafOff (opt-in): the clamshell leaves are replaced by
      // the 'tip' panel pair — the flank tiles keep their seats EXACTLY.
      // Absent = byte-identical for every legacy caller.
      if (!p.k5LeafOff) {
      P.add(k5B, box(L, H, k5D), x - dzx, yc - dzy, z - dzz, px5, ry, rz);
      P.add('turretDark', box(L + 0.01, 0.035, H - 0.04), x, yc + H / 2, z, px5, ry, rz);
      // k5Seg (§B3.1 prism sweep 2026-08-06, opt-in): the real K-5 clamshell
      // is SECTIONED — n-1 dark seams across the leaf face plus a lower lip
      // strip. Seams FLUSH with the leaf face (outer face at exactly H/2 —
      // zero silhouette growth; the r1 +4 mm proud strips cost front_whole
      // 0.5 on vladimir). Defaults byte-identical for every legacy caller.
      if (p.k5Seg) {
        for (let gi = 1; gi < p.k5Seg; gi++) {
          const lx = -L / 2 + (L * gi) / p.k5Seg;
          P.add('turretDark', KIT.xform(box(0.022, H - 0.024, 0.008), lx, 0, H / 2 - 0.004), x, yc, z, px5, ry, rz);
        }
        P.add('turretDark', KIT.xform(box(L - 0.03, 0.03, 0.008), 0, -H / 2 + 0.035, H / 2 - 0.004), x, yc, z, px5, ry, rz);
      }
      // k5Lower (§4.999991 t90a fix-round, opt-in): the real clamshell is
      // TWO leaves — a steeper lower plate under the upper one doubles the
      // wedge face (the verdict's "broad plates" read) while both stay
      // inside the certified rotated x-envelope (a broad-H single plank
      // spilled its corners into the guarded ±1.30-1.46 plan cliff, tried
      // and reverted). Bottom edge holds the certified 1.40-1.42w floor.
      if (p.k5Lower) {
        const yl = yc - (p.k5Lower.dy ?? 0.13);
        const Dl = D - (p.k5Lower.tuck ?? 0.05);
        const hl = p.k5Lower.h ?? 0.16;
        P.add(p.k5Bucket ?? 'turretTrack', box(L * 0.94, hl, hl), Math.cos(t) * Dl, yl, Math.sin(t) * Dl, px5 + (p.k5Lower.dPitch ?? 0.35), ry, rz);
        P.add('turretDark', box(L * 0.94 + 0.01, 0.03, hl - 0.03), Math.cos(t) * Dl, yl - hl / 2, Math.sin(t) * Dl, px5 + (p.k5Lower.dPitch ?? 0.35), ry, rz);
      }
      const bx = Math.cos(ry), bz = -Math.sin(ry);
      // k5CapIn (t90a turret-lane 2026-08-06, opt-in): end-cap seat along
      // the leaf axis — default +0.02 byte-identical; t90a pulls the outer
      // cap in so its corner stops partial-lighting the ±1.46 plan window.
      const capIn = p.k5CapIn ?? 0.02;
      for (const e of [-1, 1]) {
        P.add(p.k5Bucket ?? 'turretTrack', box(0.06, H - 0.02, H - 0.02),
          x - e * bx * (L / 2 + capIn), yc + e * Math.sin(rz) * (L / 2), z - e * bz * (L / 2 + capIn), px5, ry, rz);
      }
      } // end !k5LeafOff (TIP §5.29)
      for (let i = 0; i < 3; i++) {
        const tf = s * (0.12 + i * 0.17);
        const tY = p.k5TileY ?? 0.26;
        put(tf, tY, 0.34, 0.30, 0.07, -0.08, 'turretTrack', skinD(tf, tY) + 0.02);
      }
    }
  } else if (kind === 'k1') {
    // K-1 brick field over the whole front arc, ring to shoulder (the MV
    // turret wears 3 tall courses wrapping the sight housings).
    // k1OutI (t62mv1 r3, opt-in): PER-ARC-INDEX skin offsets — the ref K-1
    // front courses stand proud toward the mantlet (plan 2.03-2.16 at
    // |x| 0.3-0.6) while the flank arcs tuck to the casting; one scalar
    // k1Out cannot follow it. Default byte-identical for every caller.
    // CHEV k1Chevron (§5.14 owner '<' order 2026-08-07, opt-in): the front
    // cheek bricks leave the ring arc and form TWO STRAIGHT BANKS sweeping
    // back from the gun center in PLAN — the buildT90A/buildT90AVladimir
    // k5Yaw arrow grammar, brick-built. Bank anchor = the brick-0 arc seat
    // (self-derived from the same skinD math, so the certified inner-front
    // extent holds); every bank brick shares the bank yaw (ry = -s*yaw, k5
    // sign convention); rows stack plumb on one plan line (the real K-1
    // cheek walls are planar frames, not skin shingles) with a small
    // per-row inward tuck. Arc bricks at i >= arcFrom keep their legacy
    // ring seats (the flank wrap the real fits carry). A thin dark backer
    // frame bridges the bank to the casting (§B2 attached read) and shows
    // through the inter-brick gaps as the K-1 seam grammar. Defaults
    // byte-identical: absent param reproduces the legacy arc exactly.
    const C = p.k1Chevron;
    for (const s of [1, -1]) {
      let bank = null;
      if (C) {
        const y0 = p.k1Y ?? 0.15;
        const t0 = Math.PI / 2 + s * (C.t0 ?? p.k1T0 ?? 0.22);
        const d0 = skinD(t0, y0) + (C.out ?? p.k1OutI?.[0] ?? p.k1Out ?? 0.03);
        bank = { ax: Math.abs(Math.cos(t0) * d0) + (C.inX ?? 0), z0: Math.sin(t0) * d0 + (p.rCz ?? 0) + (C.inZ ?? 0), a: C.yaw };
      }
      const rowsN = C?.rows ?? 3;
      for (let row = 0; row < 3; row++) {
        const y = (p.k1Y ?? 0.15) + row * (p.k1Pitch ?? 0.27);
        for (let i = 0; i < (p.k1N ?? 4); i++) {
          if (C && i < (C.arcFrom ?? (p.k1N ?? 4)) && !(C.arcTop && row >= rowsN)) {
            if (row >= rowsN) continue;
            // TIP §5.29 banksOff (opt-in): the banked bricks are replaced by
            // the 'tip' panel pair — arc bricks (i >= arcFrom) and arcTop
            // rows keep their seats EXACTLY. Absent = byte-identical.
            if (C.banksOff) continue;
            const along = (C.d0 ?? 0.06) + i * (C.pitch ?? 0.30);
            const tuck = row * (C.rowTuck ?? 0.02);
            const bx = bank.ax + along * Math.cos(bank.a) - tuck * Math.sin(bank.a);
            const bz = bank.z0 - along * Math.sin(bank.a) - tuck * Math.cos(bank.a);
            P.add(C.bucket ?? 'turretTrack', box(C.bw ?? 0.28, C.bh ?? (p.k1H ?? 0.24), C.bd ?? 0.15),
              -s * bx, y, bz, (C.tilt ?? -0.20) - row * (C.tiltRow ?? 0.07), -s * bank.a, 0);
          } else if (row < 3) {
            const t = Math.PI / 2 + s * ((p.k1T0 ?? 0.22) + i * (p.k1Step ?? 0.21));
            put(t, y, 0.30, p.k1H ?? 0.24, 0.16, -0.24 - row * 0.09, 'turretTrack', skinD(t, y) + (p.k1OutI?.[i] ?? p.k1Out ?? 0.03));
          }
        }
      }
      if (C && !C.banksOff) {
        // backer frame: spans the banked bricks, sits behind their backs
        // toward the casting (dark slot — reads as the mounting frame in
        // the brick gaps; its inner half embeds into the dome skin).
        const nBank = Math.min(C.arcFrom ?? (p.k1N ?? 4), p.k1N ?? 4);
        const len = (nBank - 1) * (C.pitch ?? 0.30) + (C.bw ?? 0.28) + 0.05;
        const mid = (C.d0 ?? 0.06) + ((nBank - 1) * (C.pitch ?? 0.30)) / 2;
        const rowSpan = (rowsN - 1) * (p.k1Pitch ?? 0.27) + (C.bh ?? (p.k1H ?? 0.24)) + 0.03;
        const yMid = (p.k1Y ?? 0.15) + ((rowsN - 1) * (p.k1Pitch ?? 0.27)) / 2;
        const nOff = (C.bd ?? 0.15) / 2 + 0.012;
        const bxm = bank.ax + mid * Math.cos(bank.a) - nOff * Math.sin(bank.a);
        const bzm = bank.z0 - mid * Math.sin(bank.a) - nOff * Math.cos(bank.a);
        P.add('turretDark', box(len, rowSpan, 0.024), -s * bxm, yMid, bzm, (C.tilt ?? -0.20), -s * bank.a, 0);
      }
    }
  } else if (kind === 'tip') {
    // TIP §5.29 CHEVRON-TIP (owner refinement 2026-08-07, REAL T-72B3
    // obr. 2016 parade photo): "its like two panels of era that meet at a
    // tip. thats what i wanted dude!" — TWO large flat ERA panels form the
    // turret front: a shallow V in plan MEETING AT A POINTED TIP at
    // center-front, the gun emerging above/behind the tip. NOT swept brick
    // banks, NOT arcs (refines the §5.14 k1Chevron/k5Yaw round). Each
    // panel is ONE plate whose FACE PLANE holds the measured tip->outer
    // line exactly (box center retreats half the depth along the face
    // normal); face grammar (bag/cassette seam grid, rim frame) rides
    // FLUSH (k5Seg zero-growth law); a dark backer bridges panel ->
    // casting (§B2 attached) and a dark center gap plate closes the V
    // vertex under the gun (no see-through at the tip).
    // p.tip = { x, z (inner/tip end of the face line), ox, oz (outer end —
    //   seat it AT/INSIDE the cheek skin so the panel closes onto the
    //   casting), y (band center), h, d, tilt, segs (vertical bag seams),
    //   rows (horizontal seam rows), bucket, pad (length pad), lip
    //   {h, dy, dPitch, tuck} (K-5 lower-leaf class), gap:false, gapH,
    //   noBacker, capW }
    const T = p.tip;
    const tX = T.x ?? 0.12, tZ = T.z, oX = T.ox, oZ = T.oz;
    const H = T.h ?? 0.42, D = T.d ?? 0.12, yc = T.y ?? 0.18;
    const tilt = T.tilt ?? -0.12;
    const segsN = T.segs ?? 4, rowsN = T.rows ?? 0;
    const bucket = T.bucket ?? 'turretTrack';
    const ax = oX - tX, az = oZ - tZ;
    const L = Math.hypot(ax, az) + (T.pad ?? 0.02);
    const ux = -az / Math.hypot(ax, az), uz = ax / Math.hypot(ax, az); // outward face normal (s=+1 side)
    const mx = (tX + oX) / 2 - ux * (D / 2), mz = (tZ + oZ) / 2 - uz * (D / 2);
    const rcz = p.rCz ?? 0;
    for (const s of [1, -1]) {
      const ry = Math.atan2(-az, s * ax);
      const px = s * mx, pz = mz + rcz;
      P.add(bucket, box(L, H, D), px, yc, pz, tilt, ry, 0);
      // flush face grammar (§C zero-growth): vertical bag/cassette seams,
      // optional row seams, rim frame strips
      for (let gi = 1; gi < segsN; gi++) {
        const lx = -L / 2 + (L * gi) / segsN;
        P.add('turretDark', KIT.xform(box(0.024, H - 0.03, 0.008), lx, 0, D / 2 - 0.004), px, yc, pz, tilt, ry, 0);
      }
      for (let ri = 1; ri <= rowsN; ri++) {
        const ly = -H / 2 + (H * ri) / (rowsN + 1);
        P.add('turretDark', KIT.xform(box(L - 0.03, 0.022, 0.008), 0, ly, D / 2 - 0.004), px, yc, pz, tilt, ry, 0);
      }
      P.add('turretDark', KIT.xform(box(L - 0.02, 0.028, 0.008), 0, H / 2 - 0.022, D / 2 - 0.004), px, yc, pz, tilt, ry, 0);
      P.add('turretDark', KIT.xform(box(L - 0.02, 0.028, 0.008), 0, -H / 2 + 0.022, D / 2 - 0.004), px, yc, pz, tilt, ry, 0);
      // end caps (inner cap = the tip face; outer cap embeds at the cheek)
      for (const e of [-1, 1]) {
        P.add(bucket, KIT.xform(box(T.capW ?? 0.05, H - 0.015, D - 0.015), e * (L / 2 - (T.capW ?? 0.05) / 2 + 0.01), 0, 0), px, yc, pz, tilt, ry, 0);
      }
      // dark backer bridging panel -> casting (§B2 attached read)
      if (!T.noBacker) {
        const bx2 = mx - ux * (D / 2 + 0.014), bz2 = mz - uz * (D / 2 + 0.014);
        P.add('turretDark', box(L * 0.92, H * 0.90, 0.03), s * bx2, yc, bz2 + rcz, tilt, ry, 0);
      }
      // optional lower lip (the K-5 clamshell second-leaf class)
      if (T.lip) {
        const lh = T.lip.h ?? 0.10;
        const yl = yc - H / 2 - (T.lip.dy ?? 0.0) - lh / 2;
        const tk = T.lip.tuck ?? 0.03;
        P.add(bucket, box(L * 0.96, lh, D - 0.02), s * (mx - ux * tk), yl, mz - uz * tk + rcz, tilt + (T.lip.dPitch ?? 0.30), ry, 0);
      }
    }
    // center gap plate: closes the V vertex dark under/behind the gun
    if (T.gap !== false) {
      P.add('turretDark', box(tX * 2 + 0.06, H * (T.gapH ?? 0.86), 0.03), 0, yc - H * 0.05, tZ - 0.055 + rcz, tilt, 0, 0);
    }
  } else if (kind === 'erawa') {
    // r9 WALL rework (pt91m workorder): the real ERAWA front is a near-flat
    // upright wall, not skin-hugging shingles. Ref plan front staircase
    // 1.46@|x|0.3 -> 1.32@0.8 -> 1.05@1.14; upper rows lean back so the
    // side silhouette stays inside the ref's 1.42 line above y 1.72; flank
    // arcs (i>=3) drop the top row (ref front 1.82@|x|1.07).
    const eD = p.eDists ?? [1.395, 1.438, 1.550, 1.525, 1.470];
    for (const s of [1, -1]) {
      for (let row = 0; row < 3; row++) {
        // r25: base course seated at the ref's 1.475 deck-shadow line (row0
        // bottoms printed 1.421 vs ref 1.475 at the 1.483/1.59 side cols);
        // row2 KEEPS 0.40 — its 1.974 top owns the ±0.2..0.6 front cols.
        const y = [0.13, 0.29, 0.40][row];
        for (let i = 0; i < 5; i++) {
          if (row === 2 && i >= 3) continue;
          const t = Math.PI / 2 + s * (0.12 + i * 0.18);
          // r25: row1 pulled 2 cm deeper — its center tiles poked 5 mm into
          // the 1.483 side column (top 1.81 vs the ref's 1.716 sleeve line).
          // r25c: RIGHT i4 (s=-1) retreats 8 cm — dedicated flank tiles own
          // the 1.14/1.247 plan cols (ref pinch is asymmetric; left keeps eD)
          const dist = eD[i] - (row === 1 ? 0.108 : row === 2 ? 0.118 : 0)
            - (i === 4 && s === -1 ? 0.08 : 0);
          put(t, y, i === 4 ? 0.20 : 0.28, 0.22, 0.06, -0.10 - row * 0.04, 'turretTrack', dist);
        }
      }
    }
  } else if (kind === 'relikt') {
    // optional squeeze params (t72b3m r4): rT0/rStep arc seats, rDist skin
    // offset, rD depth, rY row base, rH height — defaults = legacy behavior
    // r11: rTilt (base course tilt — the default -0.34 spread the t72b3m
    // pair-0/1 top corners 0.08 proud and poked bottoms 0.06 under the
    // 1.42 skirt line) + rDists (PER-CASSETTE skin offsets: the ref Relikt
    // front is a flat wedge wall — plan staircase 0.13-0.19 proud at
    // mid-arc, tucked at center — which no uniform skin offset can follow).
    const rT0 = p.rT0 ?? 0.28, rStep = p.rStep ?? 0.28, rDist = p.rDist ?? -0.05;
    const rD = p.rD ?? 0.22, rY = p.rY ?? 0.06, rH = p.rH ?? 0.27;
    const rTilt = p.rTilt ?? -0.34;
    // rBucket (t72b3m visual r1, opt-in): the ref Relikt course renders in
    // the SCHEME PAINT (pale olive like the dome) — the spareTrack steel
    // bucket read as maroon-brown inset wedges at critic zoom. Legacy
    // builds (t90sm) keep turretTrack.
    const rBucket = p.rBucket ?? 'turretTrack';
    // rGapBucket (t72b3m visual r5, opt-in): the ring GAP plates used to be
    // hard 'turretDark' — at the flat board light they rendered as void-black
    // trapezoids flanking the crown (critic r4 item 6: deep-shade floor is
    // reserved for ref-black elements). Scheme-shadow cloth keeps the
    // lid-vs-gap swing at the ref's ~12L without reading as holes. Legacy
    // builds keep turretDark.
    const rGapBucket = p.rGapBucket ?? 'turretDark';
    const rowSeats = (p.rRows ?? 2) === 1 ? [[0, rY]] : [[0, rY], [1, 0.34]];
    // rDeep (t72b3m visual r2, opt-in): deepen each cassette INWARD keeping
    // the calibrated outer face plane — the extra depth widens the bright
    // TOP trapezoid so the ring reads from plan/tilt (the r13 0.14-deep
    // boxes rendered as a thin line; the ref ring reads via wide tops).
    // Plan-safe (growth is into the lathe) and top-corner rise at tilt
    // -0.12 is +6mm (still inside the r11 1.663-print row, cap 1.690).
    const rDeep = p.rDeep ?? 0;
    for (const s of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const t = Math.PI / 2 + s * (rT0 + i * rStep);
        const dI = p.rDists ? p.rDists[i] : rDist;
        for (const [row, y0] of rowSeats) {
          // rY0 (r10f): the FIRST (front-most) cassette pair can seat lower —
          // the t72b3m ref's mantlet-dip cols read 1.637-1.663 where a
          // uniform course crested 1.70-1.72
          const yc = (i === 0 && p.rY0 != null ? p.rY0 : y0) + 0.13;
          const dd = skinD(t, yc) + dI;
          put(t, yc, 0.48, rH, rD + rDeep, rTilt + row * 0.10, rBucket, dd - rDeep / 2);
          // rChev (t90m r8 ORDER 4, opt-in): Relikt tile-course relief —
          // the oracle's cheek arrays read bold diagonal chevron courses
          // (§B3 ERA grammar; the flat cassettes read "faint seams" at
          // graduation zoom). Face seams/crests ride +0.8 mm proud of the
          // calibrated face plane (sub-half-pixel, leopard r9 class);
          // course ribs live on the tilted TOP shoulder (§B3.1
          // 45°-shoulder free lane; rib crowns stay within +2 mm of the
          // cassette's own certified corner envelope). Defaults
          // byte-identical for every legacy caller (only t90m passes it).
          if (p.rChev) {
            const tiltR = rTilt + row * 0.10;
            const D0 = dd - rDeep / 2;
            const zF = (rD + rDeep) / 2;
            const px2 = Math.cos(t) * D0, pz2 = Math.sin(t) * D0 + (p.rCz ?? 0);
            const ry2 = Math.PI / 2 - t;
            const lean = (p.rChev.lean ?? 0.55) * s;
            for (const [lx, kind] of [[-0.155, 0], [-0.075, 1], [0.005, 0], [0.085, 1], [0.165, 0]]) {
              const g = kind === 0
                ? KIT.xform(box(0.014, rH - 0.05, 0.0026), lx, 0, zF + 0.0008, 0, 0, lean)
                : KIT.xform(box(0.020, rH - 0.07, 0.0022), lx, 0, zF + 0.0006, 0, 0, lean);
              P.add(kind === 0 ? 'turretDark' : 'turretCloth', g, px2, yc, pz2, tiltR, ry2, 0);
            }
            for (const lx of [-0.15, 0, 0.15]) {
              P.add(rBucket, KIT.xform(box(0.10, 0.010, (rD + rDeep) * 0.68), lx, rH / 2 + 0.0045, -0.012),
                px2, yc, pz2, tiltR, ry2, 0);
            }
          }
          // rSeam (visual r1, LOUDER r2): the r13 slivers/seams declared the
          // ring but rendered 15-20% of ref loudness. Now: bright crest
          // sliver + pale face plate + a WIDE dark gap wedge at each pair
          // boundary + a sunk dark backdrop that owns the gap read from
          // off-axis. Gap tops capped at yc+rH/2 (the +0.285 world col
          // prints 1.637, cap 1.664 — a taller wedge would poke it).
          if (p.rSeam) {
            // pale TOP LID — the ring's plan/tilt read is alternating bright
            // trapezoid tops against dark gap tops; the camo top faces were
            // invisible against the camo dome (r14 close-roof verdict). Lid
            // rides 4mm INSET below the certified top corner (cap 1.690).
            put(t, yc + rH * 0.5 - 0.006, 0.46, 0.012, rD + rDeep - 0.01, rTilt + row * 0.10, 'turretDetail', dd - rDeep / 2);
            put(t, yc + rH * 0.38, 0.46, 0.05, rD + rDeep - 0.015, rTilt + row * 0.10, 'turretDetail', dd - rDeep / 2 + 0.010);
            // pale face plate: the course fronts sit under a dark camo
            // blotch on this print — the scheme-detail plate restores the
            // ref's pale-wedge read from dead front (4mm proud of the face)
            put(t, yc - 0.012, 0.42, rH - 0.05, 0.008, rTilt + row * 0.10, 'turretDetail', dd + rD / 2 + 0.003);
            // GAP = a full-depth DARK standing plate at the pair boundary —
            // its dark top trapezoid alternates with the pale lids (the r13
            // thin seam strips + sunk backdrops never reached pixels).
            // rGapH (t72b3m r24, opt-in): cap the gap-plate heights so the
            // ring reads lid-over-notch relief instead of a flush collar —
            // entries without it are byte-identical (Infinity min).
            const tg = Math.PI / 2 + s * (rT0 + (i + 0.5) * rStep);
            const gM1 = Math.min(rH - 0.02, p.rGapH ?? Infinity);
            const gM2 = Math.min(rH - 0.01, p.rGapH ?? Infinity);
            put(tg, yc - 0.008 - (rH - 0.02 - gM1) / 2, 0.15, gM1, rD + rDeep - 0.02, rTilt, rGapBucket, skinD(tg, yc) + dI - rDeep / 2 - 0.012);
            put(tg, yc - 0.005 - (rH - 0.01 - gM2) / 2, 0.062, gM2, 0.016, rTilt, rGapBucket, skinD(tg, yc) + dI + rD / 2 + 0.005);
          }
        }
        // rStrip:false — on a squat dome the tilted strip corners rise to a
        // 1.85 canopy 0.2 proud of the roof (t72b3m r7 whatsat verdict)
        if (p.rStrip !== false) put(t, 0.34, 0.50, 0.032, 0.20, -0.30, 'turretDark', skinD(t, 0.34) - 0.03);
      }
      // rXPairs (t72b3m visual r1, opt-in; r2 REBUILT): flank/rear ring
      // continuation — standing cassettes at wider arc seats so every
      // quarter reads the ref's ~15-cassette dome ring. Plates stay sunk
      // inside the lathe plan (dI<0); heights are now REAL (0.20-0.27, the
      // r13 0.11 nubs never reached pixels) with tops still 5+cm under the
      // local dome/basket side lines; entry [tOff, dI, h, w, yc?].
      // gapH (7th entry, r22 opt-in): caps the auto-gap plate height where
      // the gap azimuth lands in a LOWER certified row than the pair itself
      // (t72b3m 0.62-pair: its 0.465-rad gap sits in the mantlet-dip cols).
      // Entries without it are byte-identical (only t72b3m passes rXPairs).
      for (const [tOff, dI, h, w, ycX, lean, gapH] of p.rXPairs ?? []) {
        const t = Math.PI / 2 + s * tOff;
        const yc = ycX ?? ((p.rY ?? 0.06) + 0.13);
        const wd = w ?? 0.44;
        // lean (6th entry, default -0.08): extra back-tilt for the standing
        // top-face read. REAR-arc plates pass lean 0 — the tilt swings the
        // bottom-outer corner radially outward and the aft lathe skin is
        // already the certified dome-waist overfill (r13 lesson).
        const tl = rTilt + (lean ?? -0.08);
        // deepened like the mains (outer face fixed, growth into the lathe)
        // so the pale top lid is a WIDE trapezoid, not a 12cm sliver.
        const xDp = 0.26, xShift = (xDp - (rD - 0.02)) / 2;
        put(t, yc, wd, h, xDp, tl, rBucket, skinD(t, yc) + dI - xShift);
        if (p.rSeam) {
          // pale top lid + crest + outer face (the standing-plate read)
          put(t, yc + h * 0.5 - 0.006, wd - 0.01, 0.012, xDp - 0.01, tl, 'turretDetail', skinD(t, yc) + dI - xShift);
          put(t, yc + h * 0.42, wd - 0.03, 0.045, xDp - 0.02, tl, 'turretDetail', skinD(t, yc) + dI - xShift + 0.008);
          put(t, yc - 0.005, wd - 0.05, h - 0.04, 0.006, tl, 'turretDetail', skinD(t, yc) + dI + (rD - 0.02) / 2 + 0.003);
          // GAP = full-depth dark standing plate (dark top trapezoid between
          // the pale lids) + a thin proud seam on the face line
          const tg = Math.PI / 2 + s * (tOff - 0.155);
          const gH1 = Math.min(h - 0.015, gapH ?? Infinity);
          const gH2 = Math.min(h, gapH ?? Infinity);
          put(tg, yc - 0.006 - (h - 0.015 - gH1) / 2, 0.15, gH1, xDp - 0.015, rTilt, rGapBucket, skinD(tg, yc) + dI - xShift - 0.010);
          put(tg, yc + 0.005 - (h - gH2) / 2, 0.07, gH2, 0.02, rTilt, rGapBucket, skinD(tg, yc) + dI + 0.012);
        }
      }
    }
  }
}

// Shtora dazzler pair seated on the measured skin (THE T-90 cue).
// p.eyeZ (r9): absolute local-z seat for prints whose eyes ride the mantlet
// plane forward of the dome skin (t72bu: ref plan front 1.89-1.92 at
// |x| 0.4..0.65); the caller adds a bracket back to the skin.
export function ruShtora(P, p, y) {
  const { box } = KIT;
  const r = ringSkin(p.rings, y);
  const es = p.eyeScale ?? 1;
  const A = r, B = r * p.sz, x = p.eyeX ?? 0.52;
  const zSkin = B * Math.sqrt(Math.max(0.1, 1 - (x / A) ** 2));
  const zc = p.eyeZ ?? (zSkin + 0.06);
  // eyeRound (§4.999991 russia fix-round, opt-in): the OTShU-1-7 dazzlers
  // are ROUND RED emitters, not blue rectangles — round dark drum + red
  // lens disc INSIDE the old glass pane's own extents (inscribed-drum
  // class: front plane byte-equal at zc+0.130, x-span inside the housing
  // box). Lens material = rehooked dark clone with a deep red-amber
  // emissive floor (SHADOW-TONE mechanics) shared by both eyes; direct
  // meshes under rig_turret so they yaw with the casting (§B5).
  if (p.eyeRound && !P._shtoraRed) P._shtoraRed = rehookClone(P.mats.dark, 0x54180e, 0x7c2410);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.24 * es, 0.27 * es, 0.22 * es), s * x, y, zc);
    if (p.eyeRound) {
      P.add('turretDark', KIT.cylZ(0.100 * es, 0.055 * es, 16), s * x, y, zc + 0.0975 * es);
      P.add('turretDetail', KIT.cylZ(0.106 * es, 0.016 * es, 16), s * x, y, zc + 0.092 * es);
      const lens = new THREE.Mesh(KIT.cylZ(0.072 * es, 0.014 * es, 16), P._shtoraRed);
      lens.position.set(s * x, y, zc + 0.123 * es);
      lens.castShadow = lens.receiveShadow = true;
      P.turretG.add(lens);
    } else {
      P.add('turretGlass', box(0.17, 0.18, 0.03), s * x, y, zc + 0.115);
    }
    P.add('turretDetail', box(0.27 * es, 0.04 * es, 0.24 * es), s * x, y + 0.155 * es, zc + 0.01 * es);
    // eyeKit (§B3.1 prism sweep 2026-08-06, opt-in): the OTShU-1-7 emitter
    // grammar — horizontal vent fins over the emitter window, side cheek
    // plates and an under-bracket back to the skin, all inside the eye
    // box's own envelope (+<=8 mm face relief; under §C thresholds; gate
    // HOLD proven on vladimir 71.4 exact pre-revert). Defaults
    // byte-identical for every legacy caller.
    if (p.eyeKit) {
      for (let fi = 0; fi < 3; fi++) {
        P.add('turretDark', box(0.19 * es, 0.024 * es, 0.014 * es), s * x, y + (-0.056 + fi * 0.056) * es, zc + 0.118 * es);
      }
      P.add('turretDetail', box(0.014 * es, 0.21 * es, 0.19 * es), s * (x + 0.122 * es), y, zc - 0.005 * es);
      P.add('turretDetail', box(0.014 * es, 0.21 * es, 0.19 * es), s * (x - 0.122 * es), y, zc - 0.005 * es);
      P.add('turretDark', box(0.18 * es, 0.045 * es, 0.16 * es), s * x, y - 0.155 * es, zc - 0.045 * es);
    }
  }
}
// ---------------------------------------------------------------------------
// Profiles. Dimensions are width-normalized oracle measurements (packets);
// width = spec width − 0.09 so skirts/fasteners land exactly on spec width.
// zC = the oracle's hull-center offset (overall-bbox-centered GLBs).
// turretPivotZ stays hull-center relative; gun muzzle = zC+pivotZ+gunZ+len.
// ---------------------------------------------------------------------------
export const RUSSIA_PROFILES = {
  t62mv1: { build: buildT62MV1 },
  t64bv1: { build: buildT64BV1 },
  t54: { build: buildT54 },
  t44: { build: buildT44 },
  type59: { build: buildType59 },
};
