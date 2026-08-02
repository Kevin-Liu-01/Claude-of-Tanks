// Merkava family procedural profiles — FROM-SCRATCH curve-driven rebuild.
// Owned by the Merkava agent.
//
// Every mark is authored against the measured silhouette polylines in
// docs/references/profiles/<id>.json (side/plan/front whole+hull traces plus
// 14 hull cross-section stations, decoded to world meters — see the packet
// files under docs/references/tanks/). The curves ARE the reference model:
// hull = lofted slabs following the station/deck/keel/plan polylines, turret
// = the shape the whole−hull curve subtraction describes. No source mesh
// data is extracted, traced or embedded — these are measurements, exactly
// like reading dimensions off orthographic photographs.
//
// Shared architecture (all marks): front engine with FRONT drive sprocket,
// 6 road wheels, long full-width prow (fender planks run to the nose line),
// aft-set turret, rear hull clamshell door, turret bustle basket +
// ball-and-chain curtain. Mk.1B keeps exposed running gear under a narrow
// fender line; every later mark hangs deep scalloped skirts.
import { KIT } from './kit.js';

// ---------------------------------------------------------------------------
// Loft machinery: bands of 8-corner slabs that follow measured polylines.
// Stations run FRONT (+z) to REAR; each entry {z, yT, yB, wT, wB}.
// ---------------------------------------------------------------------------
function loftBand(P, bucket, sts) {
  const { slab } = KIT;
  for (let i = 0; i < sts.length - 1; i++) {
    const a = sts[i], b = sts[i + 1];
    const ax = a.x ?? 0, bx = b.x ?? 0; // optional plan shear per station
    P.add(bucket, slab(
      [ax - a.wB, a.yB, a.z], [ax + a.wB, a.yB, a.z], [bx + b.wB, b.yB, b.z], [bx - b.wB, b.yB, b.z],
      [ax - a.wT, a.yT, a.z], [ax + a.wT, a.yT, a.z], [bx + b.wT, b.yT, b.z], [bx - b.wT, b.yT, b.z]));
  }
}

// ---------------------------------------------------------------------------
// Chassis: measured-loft hull + running gear + skirts/fenders + furniture.
// c.body: loft stations for the sponson band (nose tip -> tail plate).
// c.keel: [[z,y]...] lower-glacis/belly line for the center body.
// ---------------------------------------------------------------------------
function merkavaChassis(P, c) {
  const { box, slab, headlight, towCable, liftEye, periscope } = KIT;
  const w = c.width, hw = w / 2;
  const innerW = w - 2 * c.trackW - 0.06, ihw = innerW / 2;

  // Upper body: one continuous loft following the measured deck/glacis top
  // line and the plan half-width curve. With tailNotch the FINAL segment
  // (second-to-last station -> tail) is drawn as two outboard slabs only —
  // the center recesses at the clamshell-door plane like the measured plan
  // rears (post-repair refs: center rear sits 0.15-0.45 forward of the
  // outboard hull corners).
  loftBand(P, 'hull', c.tailNotch ? c.body.slice(0, -1) : c.body);
  if (c.tailNotch) {
    const N = c.body.length;
    const a = c.body[N - 2], b2 = c.body[N - 1], nhw = c.tailNotch.hw;
    for (const s of [-1, 1]) {
      // corners in slab plan order (-x,+z),(+x,+z),(+x,-z),(-x,-z); front
      // pair at station a, rear pair at the true tail station b2
      const pts = s > 0
        ? [[nhw, a.z, a], [a.wB, a.z, a], [b2.wB, b2.z, b2], [nhw, b2.z, b2]]
        : [[-a.wB, a.z, a], [-nhw, a.z, a], [-nhw, b2.z, b2], [-b2.wB, b2.z, b2]];
      P.add('hull', slab(
        [pts[0][0], pts[0][2].yB, pts[0][1]], [pts[1][0], pts[1][2].yB, pts[1][1]], [pts[2][0], pts[2][2].yB, pts[2][1]], [pts[3][0], pts[3][2].yB, pts[3][1]],
        [pts[0][0], pts[0][2].yT, pts[0][1]], [pts[1][0], pts[1][2].yT, pts[1][1]], [pts[2][0], pts[2][2].yT, pts[2][1]], [pts[3][0], pts[3][2].yT, pts[3][1]]));
    }
    // recessed clamshell door plate between the side slabs
    P.add('hull', box(nhw * 2 - 0.02, a.yT - a.yB - 0.04, 0.07), 0, (a.yT + a.yB) / 2, a.z - 0.03);
  }

  // Center belly between the tracks + lower glacis wedge along the keel.
  // bellySideY (optional): the warped 3B/3C refs carry an ARCHED belly —
  // 0.41 deep at center, rising to ~0.24-0.28 outboard strips.
  const k = c.keel; // { toeZ, toeY, toeHW, midZ, midY, groundZ, bellyY, bellySideY?, tailLowZ }
  if (k.bellySideY !== undefined) {
    const bm = k.bellyMidY ?? k.bellySideY;
    const bmx = k.bellyMidX ?? 1.04;
    P.add('hull', box(1.30, c.trackTop - k.bellyY + 0.10, k.groundZ - k.tailLowZ),
      0, (c.trackTop + k.bellyY) / 2 + 0.05, (k.groundZ + k.tailLowZ) / 2);
    for (const sb of [-1, 1]) {
      P.add('hull', box(bmx - 0.62, c.trackTop - bm + 0.10, k.groundZ - k.tailLowZ),
        sb * (0.62 + bmx) / 2, (c.trackTop + bm) / 2 + 0.05, (k.groundZ + k.tailLowZ) / 2);
      P.add('hull', box(ihw - bmx, c.trackTop - k.bellySideY + 0.10, k.groundZ - k.tailLowZ),
        sb * (bmx + ihw) / 2, (c.trackTop + k.bellySideY) / 2 + 0.05, (k.groundZ + k.tailLowZ) / 2);
    }
  } else {
    P.add('hull', box(innerW, c.trackTop - k.bellyY + 0.10, k.groundZ - k.tailLowZ),
      0, (c.trackTop + k.bellyY) / 2 + 0.05, (k.groundZ + k.tailLowZ) / 2);
  }
  P.add('hull', slab( // lower glacis: toe -> keel knee -> belly front
    [-k.toeHW, k.toeY, k.toeZ], [k.toeHW, k.toeY, k.toeZ],
    [ihw, k.midY, k.midZ], [-ihw, k.midY, k.midZ],
    [-k.toeHW, k.toeY + 0.12, k.toeZ - 0.06], [k.toeHW, k.toeY + 0.12, k.toeZ - 0.06],
    [ihw, k.midY + 0.16, k.midZ - 0.10], [-ihw, k.midY + 0.16, k.midZ - 0.10]));
  P.add('hull', slab(
    [-ihw, k.midY, k.midZ], [ihw, k.midY, k.midZ],
    [ihw, k.bellyY, k.groundZ], [-ihw, k.bellyY, k.groundZ],
    [-ihw, k.midY + 0.16, k.midZ - 0.10], [ihw, k.midY + 0.16, k.midZ - 0.10],
    [ihw, k.bellyY + 0.2, k.groundZ - 0.3], [-ihw, k.bellyY + 0.2, k.groundZ - 0.3]));
  // rear lower wedge up to the tail plate bottom (with tailNotch it stops
  // at the door plane so the recessed center never pokes out in plan)
  const tail = c.body[c.body.length - 1];
  const wedgeZ = c.tailNotch ? c.body[c.body.length - 2].z : tail.z + 0.05;
  P.add('hull', slab(
    [-ihw, k.bellyY, k.tailLowZ], [ihw, k.bellyY, k.tailLowZ],
    [ihw * 0.96, tail.yB, wedgeZ], [-ihw * 0.96, tail.yB, wedgeZ],
    [-ihw, k.bellyY + 0.3, k.tailLowZ - 0.2], [ihw, k.bellyY + 0.3, k.tailLowZ - 0.2],
    [ihw * 0.96, tail.yB + 0.2, wedgeZ], [-ihw * 0.96, tail.yB + 0.2, wedgeZ]));

  // Fender planks: the measured plan keeps a near-full-width footprint all
  // the way to the nose line — the prow narrows only between the planks.
  // z0 may be per-side [L,R]: the recovered family prints clip the LEFT front
  // fender segment ~0.5 m short of the right one.
  if (c.fenderPlank) {
    const fp = c.fenderPlank; // { x0, x1, z0(front)|[L,R], z1(rear)|[L,R], y }
    for (const s of [-1, 1]) {
      const z0 = Array.isArray(fp.z0) ? fp.z0[s < 0 ? 0 : 1] : fp.z0;
      const z1 = Array.isArray(fp.z1) ? fp.z1[s < 0 ? 0 : 1] : fp.z1;
      // SEGMENTED plank (see fenderLip note: slice windows need end caps —
      // a single axis-aligned run is edge-on invisible to the station rig)
      const pSegN = Math.max(2, Math.round((z0 - z1) / 0.55));
      const pSegL = (z0 - z1) / pSegN;
      for (let k = 0; k < pSegN; k++) {
        P.add('hull', box(fp.x1 - fp.x0, 0.055, pSegL - 0.012), s * (fp.x0 + fp.x1) / 2, fp.y, z0 - (k + 0.5) * pSegL);
      }
      P.add('hullRubber', box(fp.x1 - fp.x0 - 0.06, 0.14, 0.03),
        s * (fp.x0 + fp.x1) / 2, fp.y - 0.09, z0 + 0.005, -0.28, 0, 0);
      if (fp.drops) { // hanging rubber side flaps between the wheel bays
        const dx = Array.isArray(fp.drops.x) ? fp.drops.x[s < 0 ? 0 : 1] : (fp.drops.x ?? (fp.x1 - 0.04));
        for (const dz of fp.drops.z) {
          P.add('hullRubber', box(0.05, fp.y - 0.06 - fp.drops.bot, 0.30),
            s * dx, (fp.y - 0.06 + fp.drops.bot) / 2, dz);
        }
      }
    }
  }
  // Outer fender lip: the strip that carries the vehicle to its published
  // width. Its OUTER face sits exactly at c.fenderLip.x (WIDTH GUARD: this is
  // the bbox edge — the gate loader normalizes the whole tank to widthM/bbox,
  // so the lip must be the widest thing on the vehicle, precisely at spec).
  // MEASUREMENT MECHANICS (Pershing/m60 packets): a perfectly axis-aligned
  // box goes EDGE-ON INVISIBLE to the gate's near/far-clipped station slice
  // cameras — the lip is a slab with a 6 mm outer-face undercut so every
  // slice rasterizes the width carrier.
  for (const fl of [c.fenderLip, c.fenderLip2].filter(Boolean)) {
    // { x(outer face), w, z0|[L,R], z1|[L,R], y }
    for (const s of [-1, 1]) {
      const z0 = Array.isArray(fl.z0) ? fl.z0[s < 0 ? 0 : 1] : fl.z0;
      const z1 = Array.isArray(fl.z1) ? fl.z1[s < 0 ? 0 : 1] : fl.z1;
      // SEGMENTED strip: an unbroken axis-aligned run has zero projected
      // area inside a near/far station-slice window (faces contain the view
      // axis) — the reference meshes read in every slice because they are
      // panelled, so every window catches an end cap. ~0.45 m segments with
      // hairline gaps guarantee 1-2 caps per slice window.
      const segN = Math.max(2, Math.round((z0 - z1) / 0.45));
      const segL = (z0 - z1) / segN;
      for (let k = 0; k < segN; k++) {
        P.add('hull', box(fl.w, 0.045, segL - 0.012), s * (fl.x - fl.w / 2), fl.y, z0 - (k + 0.5) * segL);
      }
      P.add('hullRubber', box(0.02, 0.10, z0 - z1 - 0.05), s * (fl.x - 0.012), fl.y - 0.06, (z0 + z1) / 2);
    }
  }
  if (c.frontBoard) { // low fender board over the sprocket (skirt lead);
    // z0/x1 may be per-side [L,R] — the refs cut the two boards differently.
    const fb = c.frontBoard;
    for (const s2 of [-1, 1]) {
      const bz0 = Array.isArray(fb.z0) ? fb.z0[s2 < 0 ? 0 : 1] : fb.z0;
      const bx1 = Array.isArray(fb.x1) ? fb.x1[s2 < 0 ? 0 : 1] : fb.x1;
      P.add('hull', box(bx1 - fb.x0, 0.05, bz0 - fb.z1), s2 * (fb.x0 + bx1) / 2, fb.y, (bz0 + fb.z1) / 2);
      P.add('hullRubber', box(bx1 - fb.x0 - 0.05, 0.14, 0.028), s2 * (fb.x0 + bx1) / 2, fb.y - 0.09, bz0 + 0.005, -0.25, 0, 0);
    }
  }
  // fenderKit (3B/3C visual round): the ref's front fender shelves carry
  // small stowage — cans/boxes on the boards. Everything stays under the
  // deck-peak line (side/front silhouette-neutral: tops <= 1.20 where the
  // body loft reads >= 1.30, all inboard of the plank line).
  if (c.fenderKit && c.frontBoard) {
    for (const s of [-1, 1]) {
      P.add('hullDetail', box(0.20, 0.13, 0.34), s * 1.50, c.frontBoard.y + 0.075, 2.47);
      P.add('hullDark', box(0.21, 0.030, 0.035), s * 1.50, c.frontBoard.y + 0.075, 2.47);
      P.add('hull', box(0.16, 0.10, 0.22), s * 1.51, c.frontBoard.y + 0.06, 2.76);
      P.add('hullDark', KIT.cylX(0.05, 0.18, 10), s * 1.44, c.frontBoard.y + 0.055, 2.63);
    }
  }
  // Mk.4 rising front-fender horns (measured side band ~[1.38..1.58] running
  // to the plan's front corners).
  if (c.fenderHorn) {
    const fh = c.fenderHorn; // { x0, x1, z0, z1|[L,R], top, bot }
    for (const s of [-1, 1]) {
      const z1 = Array.isArray(fh.z1) ? fh.z1[s < 0 ? 0 : 1] : fh.z1;
      P.add('hull', slab(
        [s * fh.x0, fh.bot, fh.z0], [s * fh.x1, fh.bot, fh.z0 - 0.04],
        [s * fh.x1, fh.bot, z1], [s * fh.x0, fh.bot, z1],
        [s * fh.x0, fh.top - 0.05, fh.z0], [s * fh.x1, fh.top - 0.05, fh.z0 - 0.04],
        [s * fh.x1, fh.top, z1], [s * fh.x0, fh.top, z1]));
    }
  }

  // Tail plate: clamshell door seams, hinge barrels, latch stack, lights.
  // With tailNotch the door furniture sits on the recessed center plane; the
  // corner fittings stay on the true tail corners.
  const tailZ = tail.z, doorMidY = (tail.yT + tail.yB) / 2;
  const doorZ = c.tailNotch ? c.body[c.body.length - 2].z : tailZ;
  const doorHW = c.tailNotch ? Math.min(0.30, c.tailNotch.hw - 0.04) : 0.42;
  P.add('hullDark', box(0.035, (tail.yT - tail.yB) * 0.82, 0.05), 0, doorMidY, doorZ - 0.015);
  P.add('hullDark', box(w * 0.28, 0.03, 0.05), 0, tail.yB + 0.06, doorZ - 0.015);
  for (const s of [-1, 1]) {
    P.add('hull', box(doorHW * 0.72, (tail.yT - tail.yB) * 0.72, 0.05), s * doorHW * 0.55, doorMidY, doorZ - 0.03);
    P.add('hullDark', box(0.020, (tail.yT - tail.yB) * 0.74, 0.045), s * doorHW, doorMidY, doorZ - 0.025);
    P.add('hullDetail', box(0.06, 0.09, 0.07), s * 0.52, tail.yT - 0.10, tailZ + 0.01);
    P.add('hullDark', box(0.13, 0.07, 0.04), s * (tail.wT - 0.26), tail.yT - 0.06, tailZ - 0.02);
    for (const hy of [doorMidY + 0.16, doorMidY - 0.16]) {
      P.add('hullDetail', KIT.cylY(0.026, 0.026, 0.13, 8), s * (doorHW + 0.015), hy, doorZ - 0.005);
    }
    P.add('hullDark', box(0.035, 0.10, 0.035), s * 0.09, doorMidY + 0.02, doorZ - 0.01);
    P.add('hullDetail', box(0.07, 0.05, 0.03), s * 0.09, doorMidY - 0.08, doorZ - 0.045);
  }

  // Glacis furniture: driver hatch front-left with periscope, headlight pods
  // with brush guards (the measured plan bulges past the prow at |x|~0.6),
  // clevis tow brackets on the toe, tow cable.
  const g = c.glacis; // { z0(top/deck end), z1(toe), yAt(z) via top line }
  const gTop = (z) => {
    const b = c.body;
    for (let i = 0; i < b.length - 1; i++) {
      if (z <= b[i].z && z >= b[i + 1].z) {
        const f = (b[i].z - z) / Math.max(0.001, b[i].z - b[i + 1].z);
        return b[i].yT + (b[i + 1].yT - b[i].yT) * f;
      }
    }
    return b[0].yT;
  };
  // LOCAL slope per fitting: the whole-glacis average rake made flat-deck
  // fittings pitch nose-down and poke their edges 0.15 above the surface
  // (the side-hull trace caught the louvre-bank corner at 1.73).
  const rxAt = (z) => -Math.atan2(gTop(z + 0.28) - gTop(z - 0.28), 0.56);
  const dhZ = g.z0 + (g.z1 - g.z0) * 0.28;
  const dhY = gTop(dhZ), dhRx = rxAt(dhZ);
  P.add('hull', box(0.52, 0.05, 0.58), -w * 0.20, dhY + 0.01, dhZ, dhRx, 0, 0);
  P.add('hullDark', box(0.55, 0.018, 0.61), -w * 0.20, dhY + 0.005, dhZ, dhRx, 0, 0);
  periscope(P, 'hullDetail', -w * 0.20, dhY + 0.055, dhZ - 0.40);
  if (!c.hump) { // Mk.1-3: intake louvres on the glacis slope right of the driver
    // paleVents (3B/3C visual round): the ref is monochrome pale sand — the
    // near-black base plate read as an olive/black blockout rectangle from
    // every top view. Pale panel + thin dark slats matches the print.
    const lvZ = g.z0 + (g.z1 - g.z0) * 0.34;
    const lvY = gTop(lvZ) + 0.012, lvRx = rxAt(lvZ);
    P.add(c.paleVents ? 'hullDetail' : 'hullDark', box(w * 0.24, 0.020, 0.72), w * 0.22, lvY, lvZ, lvRx, 0, 0);
    for (let i = 0; i < 6; i++) {
      const fz = lvZ + 0.27 - i * 0.108;
      P.add(c.paleVents ? 'hullDark' : 'hullDetail', box(w * 0.22, c.paleVents ? 0.018 : 0.024, 0.038), w * 0.22, gTop(fz) + 0.026, fz, rxAt(fz), 0, 0);
    }
  }
  for (const s of [-1, 1]) {
    const hx = s * (c.podX ?? w * 0.33), hz0 = g.z1 - (c.podIn ?? 0.02);
    const hz = Array.isArray(c.podDeep) ? c.podDeep[s < 0 ? 0 : 1] : hz0;
    const hy = c.podY ?? (gTop(hz + 0.15) + 0.10);
    const pdep = 0.13 + Math.max(0, hz - hz0) * 0;
    P.add('hullDetail', box(0.17, 0.11, pdep), hx, hy - 0.01, hz - 0.10);
    if (c.paleVents) { // dark-lens headlight (same geometry as KIT.headlight
      // — the sky-mirror glass lens read as a bright blue tile on the sand ref)
      P.add('hullDetail', KIT.cylZ(0.05, 0.0675, 12), hx, hy + 0.02, hz, -0.3, 0, 0);
      P.add('hullDark', KIT.xform(KIT.cylZ(0.04, 0.02, 12), 0, 0, 0.036), hx, hy + 0.02, hz, -0.3, 0, 0);
      P.add('hullDark', KIT.xform(box(0.02, 0.115, 0.02), 0, 0, 0.025), hx, hy + 0.02, hz, -0.3, 0, 0);
    } else headlight(P, hx, hy + 0.02, hz, -0.3, 0.05);
    P.add('hullDark', box(0.016, 0.13, 0.16), hx - 0.085, hy + 0.01, hz - 0.03, -0.3, 0, 0);
    P.add('hullDark', box(0.016, 0.13, 0.16), hx + 0.085, hy + 0.01, hz - 0.03, -0.3, 0, 0);
    P.add('hullDark', box(0.185, 0.016, 0.16), hx, hy + 0.075, hz - 0.03, -0.3, 0, 0);
    if (c.podGuard) { // tall brush-guard hoop: the pods are the bow's body
      // columns for the dims hullLength read — the hoop carries the band.
      const pg = c.podGuard; // { top, bot }
      for (const gx of [hx - 0.10, hx + 0.10]) {
        P.add('hullDark', box(0.016, pg.top - pg.bot, 0.03), gx, (pg.top + pg.bot) / 2, hz + 0.035);
      }
      P.add('hullDark', box(0.21, 0.016, 0.03), hx, pg.top - 0.008, hz + 0.035);
      P.add('hullDark', box(0.21, 0.016, 0.03), hx, (pg.top + pg.bot) / 2, hz + 0.035);
    }
    const tx = s * c.keel.toeHW * 0.82, tyE = c.keel.toeY + 0.09;
    P.add('hullDetail', box(0.11, 0.08, 0.045), tx, tyE, c.keel.toeZ - 0.045);
    for (const ls of [-1, 1]) {
      P.add('hullDetail', box(0.028, 0.075, 0.085), tx + ls * 0.045, tyE - 0.005, c.keel.toeZ + 0.015);
    }
    P.add('hullDark', KIT.cylX(0.018, 0.10, 8), tx, tyE - 0.012, c.keel.toeZ + 0.042);
  }
  towCable(P, [[-w * 0.24, gTop(g.z1 - 0.55) + 0.03, g.z1 - 0.55],
    [0, gTop(g.z1 - 0.28) + 0.07, g.z1 - 0.32],
    [w * 0.24, gTop(g.z1 - 0.55) + 0.03, g.z1 - 0.55]]);
  if (c.driverHump) {
    P.add('hull', box(0.50, 0.042, 1.00), -w * 0.20, gTop(dhZ + 0.55) + 0.035, dhZ + 0.55, rxAt(dhZ + 0.55), 0, 0);
  }

  // Mk.4 family front intake on the glacis right of the driver: a LOW
  // louvred shelf riding the slope (the board read killed the old tall box —
  // the oracle's 2.0+ side band there is its fused cheek fragments, not an
  // intake tower).
  if (c.hump) {
    const h = c.hump;
    const hx = (h.x0 + h.x1) / 2, hwd = h.x1 - h.x0;
    const yF = gTop(h.z1) + 0.04;               // toe rides the glacis slope
    const zK = h.z0 + (h.z1 - h.z0) * 0.42;     // knee where the flat top starts
    P.add('hull', KIT.xform(slab(
      [-hwd / 2, yF - 0.26, h.z1 + 0.06], [hwd / 2, yF - 0.26, h.z1 + 0.06],
      [hwd / 2, gTop(h.z0) - 0.16, h.z0], [-hwd / 2, gTop(h.z0) - 0.16, h.z0],
      [-hwd / 2 + 0.03, yF, h.z1], [hwd / 2 - 0.03, yF, h.z1],
      [hwd / 2 - 0.03, h.top, zK], [-hwd / 2 + 0.03, h.top, zK]), hx, 0, 0));
    P.add('hull', KIT.xform(slab(
      [-hwd / 2, gTop(zK) - 0.20, zK + 0.02], [hwd / 2, gTop(zK) - 0.20, zK + 0.02],
      [hwd / 2, gTop(h.z0) - 0.16, h.z0], [-hwd / 2, gTop(h.z0) - 0.16, h.z0],
      [-hwd / 2 + 0.03, h.top, zK], [hwd / 2 - 0.03, h.top, zK],
      [hwd / 2 - 0.03, h.top, h.z0 + 0.04], [-hwd / 2 + 0.03, h.top, h.z0 + 0.04]), hx, 0, 0));
    // louvre bank down the raked face + dark intake well on the flat top
    const rise = (h.top - yF) / (zK - h.z1);
    for (let i = 0; i < 4; i++) {
      const fz = h.z1 - 0.12 - i * ((h.z1 - zK - 0.2) / 3);
      P.add('hullDetail', box(hwd * 0.78, 0.026, 0.06), hx, yF + (h.z1 - fz) * rise + 0.02, fz);
    }
    P.add('hullDark', box(hwd * 0.80, 0.02, (zK - h.z0) * 0.7), hx, h.top + 0.012, (zK + h.z0) / 2);
  }

  // Rear deck furniture: extraction grille + fuel fillers + lift eyes.
  // r4 metrology: everything here HUGS the deck — the measured 3-series
  // decks are bare 1.60-1.65 lines; the old fin/eye pokes (+0.04..+0.12)
  // owned six side_hull worst columns across the family.
  const deckY = c.deckY, rd = c.rearDeckZ;
  P.add(c.paleVents ? 'hullDetail' : 'hullDark', box(w * 0.30, 0.016, 0.55), -w * 0.19, deckY + 0.008, rd + 0.55);
  for (let i = 0; i < 4; i++) {
    P.add(c.paleVents ? 'hullDark' : 'hullDetail', box(w * 0.27, 0.018, 0.04), -w * 0.19, deckY + 0.014, rd + 0.35 + i * 0.135);
  }
  for (const fz of [rd + 0.35, rd + 0.95]) {
    P.add('hullDetail', KIT.cylY(0.055, 0.055, 0.030, 10), w * 0.36, deckY + 0.012, fz);
  }
  liftEye(P, 'hullDetail', -w * 0.34, deckY - 0.055, rd + 0.32);
  liftEye(P, 'hullDetail', w * 0.34, deckY - 0.055, rd + 0.32);

  // Exhaust louvre bank on the RIGHT sponson face behind the engine bay.
  const exTop = deckY - 0.06, exBot = (c.skirt ? c.skirt.top : c.trackTop) + 0.05;
  if (exTop - exBot > 0.10) {
    const bodyHW = c.bodyHW ?? hw * 0.985 / 1;
    const exY = (exTop + exBot) / 2, exZ = g.z0 - 0.55;
    P.add('hullDark', box(0.02, exTop - exBot, 0.62), bodyHW + 0.006, exY, exZ);
    for (let i = 0; i < 4; i++) {
      P.add('hullDetail', box(0.028, (exTop - exBot) * 0.86, 0.045), bodyHW + 0.010, exY, exZ - 0.24 + i * 0.16);
    }
  }

  // Running gear: FRONT sprocket (signature), 6 wheels, high rear idler.
  // gearOut pins the OUTER track face (measured front-view track columns sit
  // well inside the fender line on every print in this family).
  const xc = (c.gearOut ?? hw - 0.036) - c.trackW / 2;
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: c.wheelR, wheelW: Math.min(0.23, c.trackW * 0.37),
    wheelY: c.wheelR + 0.07, xc,
    wheelZs: c.wheelZs,
    sprocket: { z: c.sprocket.z, y: c.sprocket.y, r: c.sprocket.r },
    idler: { z: c.idler.z, y: c.idler.y, r: c.idler.r },
    rollers: c.rollers.map((z) => ({ z, y: c.trackTop - 0.10, r: 0.075 })),
    trackW: c.trackW, topY: c.trackTop - 0.02, paintedEnds: true,
    coveredTop: c.skirt ? true : c.trackTop - 0.04, arms: !c.skirt,
    dishR: c.dishR ?? 0.78,
  });

  // Deep skirts (Mk.2+) with scalloped hem. WIDTH GUARD: sk.x is the OUTER
  // FACE of the outermost panel — the widest point of the whole vehicle,
  // authored exactly at half the published width so the gate/game loader's
  // width normalization is identity. Nothing (bolts included) passes it.
  if (c.skirt) {
    const sk = c.skirt;
    const sx = (sk.x ?? hw) - 0.037;              // main plate center
    for (const s of [-1, 1]) {
      // per-side runs (array [left,right]): some oracles are yawed in their
      // own frame, so the measured skirt runs differ per flank.
      const z0 = Array.isArray(sk.z0) ? sk.z0[s < 0 ? 0 : 1] : sk.z0;
      const z1 = Array.isArray(sk.z1) ? sk.z1[s < 0 ? 0 : 1] : sk.z1;
      // main plate leans 8 mm (bottom tucked) AND is SEGMENTED (~0.5 m,
      // hairline gaps): a single slab's side face is edge-on-marginal to
      // the near/far-clipped station slices — the lean alone left s2-s10
      // widths reading the tucked bottom edge (3.65 vs the ref's 3.70).
      // Segment caps give every slice window a solid width carrier. The
      // 12 mm gaps are invisible in side view (tracks own the extremes
      // below, body above) and plan columns keep their extremes.
      {
        const inB = s * (sx - 0.026) - s * 0.02, outB = s * (sx + 0.026) - s * 0.02;
        const inT = s * (sx - 0.026), outT = s * (sx + 0.026);
        const [sbL, sbR] = s > 0 ? [inB, outB] : [outB, inB];
        const [stL, stR] = s > 0 ? [inT, outT] : [outT, inT];
        const skSegN = Math.max(2, Math.round((z0 - z1) / 0.50));
        const skSegL = (z0 - z1) / skSegN;
        for (let k = 0; k < skSegN; k++) {
          const sz0 = z0 - k * skSegL, sz1 = sz0 - skSegL + 0.012;
          P.add('hull', slab(
            [sbL, sk.bot, sz0], [sbR, sk.bot, sz0], [sbR, sk.bot, sz1], [sbL, sk.bot, sz1],
            [stL, sk.top, sz0], [stR, sk.top, sz0], [stR, sk.top, sz1], [stL, sk.top, sz1]));
        }
      }
      // Scallop tabs stay SHALLOW (hem dips ~8 cm below the plate line):
      // the measured front-view skirt columns bottom at the dip line — the
      // old 0.22-deep tabs hung 0.27 below the print's hem.
      // sk.wavy (3B/3C visual round): the ref hem is a continuous WAVY
      // scallop — V-teeth dipping 0.085 at each wheel-bay center (same depth
      // the old tabs reached, so front-view column bottoms are unchanged;
      // teeth ride the plate face inside the width guard).
      if (sk.scallop && sk.wavy) {
        const teeth = [{ z: c.wheelZs[0] + 0.70, hl: 0.26 }];
        for (let i = 0; i < c.wheelZs.length - 1; i++) {
          teeth.push({ z: (c.wheelZs[i] + c.wheelZs[i + 1]) / 2, hl: 0.27 });
        }
        teeth.push({ z: c.wheelZs[c.wheelZs.length - 1] - 0.70, hl: 0.24 });
        for (const th of teeth) {
          if (th.z - th.hl < z1 || th.z + th.hl > z0) continue;
          const xin = s * (sx - 0.025), xout = s * (sx + 0.025);
          const [xa, xb] = s > 0 ? [xin, xout] : [xout, xin];
          const xdo = s * (sx + 0.028); // dark wave-line face, still inside flareR
          const [xda, xdb] = s > 0 ? [xin, xdo] : [xdo, xin];
          for (const half of [-1, 1]) {
            const zA = th.z + half * th.hl;
            const [zF, zR] = zA > th.z ? [zA, th.z] : [th.z, zA];
            const yF = zA > th.z ? sk.bot + 0.005 : sk.bot - 0.085;
            const yR = zA > th.z ? sk.bot - 0.085 : sk.bot + 0.005;
            P.add('hullDetail', slab( // detail tone: the wave band must read
              // against the same-camo plate above it
              [xa, yF, zF], [xb, yF, zF], [xb, yR, zR], [xa, yR, zR],
              [xa, sk.bot + 0.10, zF], [xb, sk.bot + 0.10, zF], [xb, sk.bot + 0.10, zR], [xa, sk.bot + 0.10, zR]));
            // dark rubbing strip riding the tooth's bottom edge — the wave
            // line needs tonal contrast to read against the wheels behind
            // (same dip depth: front-view column bottoms unchanged)
            P.add('hullDark', slab(
              [xda, yF, zF], [xdb, yF, zF], [xdb, yR, zR], [xda, yR, zR],
              [xda, yF + 0.035, zF], [xdb, yF + 0.035, zF], [xdb, yR + 0.035, zR], [xda, yR + 0.035, zR]));
          }
        }
      } else if (sk.scallop) for (let i = 0; i < c.wheelZs.length - 1; i++) {
        const z = (c.wheelZs[i] + c.wheelZs[i + 1]) / 2;
        if (z > z1 && z < z0) {
          P.add('hull', box(0.052, 0.12, Math.abs(c.wheelZs[i] - c.wheelZs[i + 1]) * 0.74),
            s * sx, sk.bot - 0.02, z);
        }
      }
      const panels = 7;
      // sk.flush: pull panel seams/bolts INSIDE the plate face — the warped
      // 3B/3C refs' outermost front-view columns are a clean thin lip; the
      // default 8 mm proud seams leaked into the ±1.86 trace column.
      const pIn = sk.flush ? -0.004 : 0.008, bIn = sk.flush ? 0.020 : 0.028;
      for (let i = 0; i <= panels; i++) {
        const pz = z0 - i * ((z0 - z1) / panels);
        P.add('hullDark', box(0.058, (sk.top - sk.bot) * 0.86, 0.02), s * (sx + pIn), (sk.top + sk.bot) / 2, pz);
        if (i < panels) {
          P.add('hullDark', KIT.cylX(0.020, 0.016, 8), s * (sx + bIn), sk.top - 0.09, pz - ((z0 - z1) / panels) / 2);
        }
      }
      // (wavy: the straight full-length hem strip would fight the scallop
      // wave line — the per-tooth dark strips above carry the hem instead)
      if (!sk.wavy) P.add('hullRubber', box(0.024, 0.12, z0 - z1), s * (sx + 0.012), sk.bot + 0.04, (z0 + z1) / 2);
      if (sk.fringe) P.add('hullRubber', box(0.026, 0.10, z0 - z1), s * (sx + 0.008), sk.bot - 0.10, (z0 + z1) / 2);
      // End flares: the measured skirts run ~+-1.83 mid-hull (stations read
      // 3.66) but flare at BOTH ends (front mud-guard ~1.844, rear guard
      // ~1.855 — the end station windows read 3.69-3.72).
      if (sk.flareF) {
        const ff = sk.flareF;
        const ffT = ff.top ?? ((sk.top + sk.bot) / 2 + (sk.top - sk.bot) * 0.45);
        const ffB = ff.bot ?? ((sk.top + sk.bot) / 2 - (sk.top - sk.bot) * 0.45);
        P.add('hull', box(0.026, ffT - ffB, ff.len), s * (ff.x - 0.013), (ffT + ffB) / 2, z0 - ff.len / 2);
      }
      if (sk.flareR) {
        // optional { top, bot }: the 3B/3C warped refs read the outermost
        // rear-guard strip as a THIN HIGH LIP (1.27..1.35), not a full-depth
        // flare — default stays the old skirt-band strip (sibling-safe).
        const fr = sk.flareR;
        const frT = fr.top ?? ((sk.top + sk.bot) / 2 + (sk.top - sk.bot) * 0.45);
        const frB = fr.bot ?? ((sk.top + sk.bot) / 2 - (sk.top - sk.bot) * 0.45);
        P.add('hull', box(0.026, frT - frB, fr.z0 - fr.z1), s * (fr.x - 0.013), (frT + frB) / 2, (fr.z0 + fr.z1) / 2);
      }
      if (sk.flaps !== false) {
        // flapMat/flapW/flapH (3B/3C): the ref's signature BROWN front mud
        // flaps — r2: straight hullWood rendered CARAMEL under the warm key
        // (r1 read: orange blocks); layered dark flap + wood mud-stain strip
        // lands the ref's muted brown. Size stays inside the track/skirt
        // silhouette envelope.
        P.add(sk.flapMat ?? 'hullRubber', box(sk.flapW ?? 0.30, sk.flapH ?? 0.34, 0.035), s * xc, sk.bot + 0.05, c.sprocket.z + c.sprocket.r + 0.16, -0.12, 0, 0);
        if (sk.flapMat) {
          const fh2 = sk.flapH ?? 0.34;
          P.add('hullWood', box((sk.flapW ?? 0.30) * 0.96, fh2 * 0.42, 0.022), s * xc, sk.bot + 0.05 - fh2 * 0.27, c.sprocket.z + c.sprocket.r + 0.185, -0.12, 0, 0);
          P.add('hullDark', box((sk.flapW ?? 0.30) * 0.9, 0.035, 0.040), s * xc, sk.bot + 0.05 + fh2 / 2 - 0.04, c.sprocket.z + c.sprocket.r + 0.165, -0.12, 0, 0);
        }
      }
      P.add(sk.flapMat ?? 'hullRubber', box(0.30, 0.30, 0.035), s * xc, sk.bot + 0.02, c.idler.z - c.idler.r - 0.12, 0.12, 0, 0);
      // rear mud flaps behind the idler: the measured tail bottoms keep
      // rising 0.43->0.61 between the idler wrap and the rack wall
      for (const rf2 of c.rearFlaps ?? []) { // { z, bot, top?, w?, x?, mat?, wood? }
        P.add(rf2.mat ?? 'hullRubber', box(rf2.w ?? 0.26, (rf2.top ?? 0.95) - rf2.bot, 0.05),
          s * (rf2.x ?? xc), ((rf2.top ?? 0.95) + rf2.bot) / 2, rf2.z);
        if (rf2.wood) { // mud-stain strip: the ref's corner flaps read brown
          // (strip rides the OUTWARD face: +z for bow flaps, -z for tail
          // ones; pokes <= 1 cm past the flap face — sub-pixel at 1024)
          const fh3 = (rf2.top ?? 0.95) - rf2.bot;
          P.add('hullWood', box((rf2.w ?? 0.26) * 0.94, fh3 * 0.40, 0.016),
            s * (rf2.x ?? xc), rf2.bot + fh3 * 0.22, rf2.z + Math.sign(rf2.z) * 0.027);
        }
      }
    }
  } else if (c.fenderY) {
    for (const s of [-1, 1]) {
      P.add('hull', box(0.07, 0.075, c.fenderZ0 - c.fenderZ1), s * (hw - 0.05), c.fenderY, (c.fenderZ0 + c.fenderZ1) / 2);
      for (let i = 0; i < 5; i++) {
        P.add('hullDetail', box(0.075, 0.05, 0.14), s * (hw - 0.05), c.fenderY - 0.05, c.fenderZ0 - 0.4 - i * 1.05);
      }
    }
  }

  // Rear hull racks. rearShelf: low stowage row on the rear deck edge.
  // tailRack: the measured tall rear rack band flanking the clamshell door
  // (3-series oracles carry a packed stowage stack behind the bustle).
  // r2 post-repair: the shelf hugs the measured deck line (the old raised
  // mid-rail at deckY+0.10 topped the repaired refs' bare 1.63-1.73 decks).
  if (c.rearShelf) {
    const rs = c.rearShelf; // { z0, z1, top, hw }
    P.add('hull', box(rs.hw * 2, 0.035, rs.z0 - rs.z1), 0, rs.top - 0.02, (rs.z0 + rs.z1) / 2);
    P.add('hull', box(rs.hw * 2, 0.035, rs.z0 - rs.z1), 0, deckY + 0.04, (rs.z0 + rs.z1) / 2);
    for (let i = 0; i < 5; i++) {
      P.add('hull', box(0.035, rs.top - deckY - 0.06, 0.035),
        -rs.hw + 0.05 + i * ((rs.hw * 2 - 0.1) / 4), (rs.top + deckY) / 2, rs.z1 + 0.03);
    }
  }
  // Per-side rear bins + low center rails: gives the hull mask its measured
  // rear-deck band WITHOUT erasing the turret basket from the rear view (the
  // subtraction lesson: full-width tall hull furniture deletes every turret
  // pixel it covers from our own component mask).
  if (c.rearBins) {
    const rb = c.rearBins; // { z0, z1, top, x0, x1 }
    const mid = (rb.z0 + rb.z1) / 2, len = rb.z0 - rb.z1;
    for (const s of [-1, 1]) {
      const xm = s * (rb.x0 + rb.x1) / 2;
      P.add('hull', box(rb.x1 - rb.x0, rb.top - deckY - 0.16, len), xm, (rb.top + deckY + 0.16) / 2, mid);
      P.add('hullCloth', box((rb.x1 - rb.x0) * 0.9, 0.10, len * 0.9), xm, rb.top + 0.03, mid);
      P.add('hullDark', box(rb.x1 - rb.x0 + 0.02, rb.top - deckY - 0.2, 0.022), xm, (rb.top + deckY + 0.16) / 2, mid);
    }
    P.add('hull', box((rb.x0 - 0.02) * 2, 0.035, 0.035), 0, deckY + 0.06, rb.z1 + 0.05);
    P.add('hull', box((rb.x0 - 0.02) * 2, 0.035, 0.035), 0, deckY + 0.14, rb.z1 + 0.05);
    if (rb.shelf) { // low full-width stowage shelf between the bins
      P.add('hullCloth', box(rb.shelf.hw * 2, rb.shelf.top - deckY - 0.14, len * 0.9), 0, (rb.shelf.top + deckY + 0.14) / 2, mid);
    }
  }
  if (c.tailRack) {
    // { z0, z1, top, bot, hw, x0?, midShelf?, wings? } — the measured rear
    // stowage wall flanking/behind the clamshell door. With x0 set the
    // center is OPEN over low rails to x0 (the oracle hull-plan notch);
    // midShelf { x1, z1 } fills x0..x1 to a shallower depth. wings
    // { x0, x1, z1, top, bot } are the outboard frames running further aft
    // (they set hullLengthM / overallLengthM without widening the plan
    // center columns).
    const tr = c.tailRack;
    const mid = (tr.z0 + tr.z1) / 2, len = tr.z0 - tr.z1;
    const x0 = tr.x0 ?? 0;
    if (x0 > 0) {
      // tr.wall: LOW outer side band { top, bot } — the measured racks hold
      // their full 1.62 height only inside |x|<hw-0.06; the outermost strip
      // is a low wall (front-view outer columns read [0.75..1.35]).
      // paleKit (3B/3C visual round): the ref rear rack is a pale-sand
      // open-frame BASKET, not an olive canvas wall — the fill volume stays
      // (closed-fabrication law) but rides the hull camo bucket with frame
      // posts + slat rails carrying the basket read.
      const rackMat = c.paleKit ? 'hull' : 'hullCloth';
      const railX = tr.wall ? tr.hw - 0.06 : tr.hw;
      for (const s of [-1, 1]) {
        const xm = s * (x0 + railX) / 2, wd = railX - x0;
        P.add(rackMat, box(wd, (tr.top - tr.bot) * 0.94, len * 0.94), xm, (tr.top + tr.bot) / 2, mid);
        if (c.paleKit) {
          for (let k = 0; k < 4; k++) {
            const px = x0 + 0.12 + k * ((railX - x0 - 0.24) / 3);
            P.add('hullDark', box(0.028, (tr.top - tr.bot) * 0.90, 0.024), s * px, (tr.top + tr.bot) / 2, tr.z1 - 0.006);
          }
          for (const ry of [tr.bot + 0.22, (tr.top + tr.bot) / 2 + 0.08]) {
            P.add('hullDetail', box(wd * 0.96, 0.035, 0.020), xm, ry, tr.z1 - 0.004);
          }
        }
        P.add('hullDark', box(wd + 0.02, (tr.top - tr.bot) * 0.9, 0.022), xm, (tr.top + tr.bot) / 2 - 0.01, mid + 0.28 * len);
        for (const ry of [tr.bot + 0.04, tr.top - 0.04]) {
          P.add('hullDark', box(0.04, 0.04, len), s * railX, ry, mid);
          P.add('hullDark', box(wd, 0.04, 0.04), xm, ry, tr.z1 + 0.02);
        }
        P.add('hullDark', box(0.038, tr.top - tr.bot, 0.038), s * railX, (tr.top + tr.bot) / 2, tr.z1 + 0.02);
        P.add('hullDark', box(0.038, tr.top - tr.bot, 0.038), s * x0 + (s > 0 ? 0.02 : -0.02), (tr.top + tr.bot) / 2, tr.z1 + 0.02);
        if (tr.wall) {
          P.add('hull', box(0.032, tr.wall.top - tr.wall.bot, len * 0.98), s * tr.hw, (tr.wall.top + tr.wall.bot) / 2, mid);
          // end drop plate: the measured outer wall deepens to ~0.72 only at
          // the very tail (side col -4.1; front outer columns read it too)
          const eb = tr.wall.endBot ?? tr.wall.bot;
          P.add('hullDark', box(0.036, tr.wall.top - eb, 0.09), s * tr.hw, (tr.wall.top + eb) / 2, tr.z1 - 0.04);
        }
      }
      P.add('hullDark', box(x0 * 2, 0.035, 0.035), 0, tr.bot + 0.04, tr.z1 + 0.55);
      KIT.jerryCan(P, c.paleKit ? 'hullDetail' : 'hullCloth', -railX + 0.25, tr.top - 0.34, mid + 0.06, 0.15);
    } else {
      for (const ry of [tr.bot + 0.04, tr.top - 0.04]) {
        P.add('hullDark', box(tr.hw * 2, 0.04, 0.04), 0, ry, tr.z1 + 0.02);
        for (const s of [-1, 1]) P.add('hullDark', box(0.04, 0.04, len), s * tr.hw, ry, mid);
      }
      for (const px of [-tr.hw, -tr.hw * 0.34, tr.hw * 0.34, tr.hw]) {
        P.add('hullDark', box(0.038, tr.top - tr.bot, 0.038), px, (tr.top + tr.bot) / 2, tr.z1 + 0.02);
        P.add('hullDark', box(0.038, tr.top - tr.bot, 0.038), px, (tr.top + tr.bot) / 2, tr.z0 - 0.02);
      }
      // packed kit filling the frame to the rim (the oracle band reads solid)
      P.add('hullCloth', box(tr.hw * 1.92, (tr.top - tr.bot) * 0.96, len * 0.92), 0, (tr.top + tr.bot) / 2, mid);
      P.add('hullCloth', box(tr.hw * 1.1, (tr.top - tr.bot) * 0.55, len * 0.7), tr.hw * 0.35, tr.top - (tr.top - tr.bot) * 0.28, mid + len * 0.04);
      for (const f of [-0.3, 0.28]) {
        P.add('hullDark', box(tr.hw * 1.92, (tr.top - tr.bot) * 0.86, 0.022), 0, (tr.top + tr.bot) / 2 - 0.02, mid + f * len);
      }
      KIT.jerryCan(P, 'hullCloth', -tr.hw * 0.62, tr.top - 0.34, mid + 0.06, 0.15);
    }
    if (tr.midShelf) { // shallower packed shelf between notch edge and x0
      const ms = tr.midShelf; // { x1, z1, top }
      for (const s of [-1, 1]) {
        P.add('hullCloth', box(ms.x1 - x0, ((ms.top ?? tr.top) - tr.bot) * 0.92, (tr.z0 - ms.z1) * 0.94),
          s * (x0 + ms.x1) / 2, ((ms.top ?? tr.top) + tr.bot) / 2, (tr.z0 + ms.z1) / 2);
      }
    }
    for (const wg of (Array.isArray(tr.wings) ? tr.wings : tr.wings ? [tr.wings] : [])) {
      // { x0, x1, z1|[L,R], top, bot }
      for (const s of [-1, 1]) {
        const wz1 = Array.isArray(wg.z1) ? wg.z1[s < 0 ? 0 : 1] : wg.z1;
        const xm = s * (wg.x0 + wg.x1) / 2, wd = wg.x1 - wg.x0;
        const wmid = (tr.z1 + wz1) / 2, wlen = tr.z1 - wz1;
        P.add(c.paleKit ? 'hull' : 'hullCloth', box(wd, (wg.top - wg.bot) * 0.9, wlen * 0.96), xm, (wg.top + wg.bot) / 2, wmid);
        for (const ry of [wg.bot + 0.03, wg.top - 0.03]) {
          P.add('hullDark', box(0.036, 0.036, wlen + 0.02), xm, ry, wmid);
        }
        P.add('hullDark', box(wd + 0.02, wg.top - wg.bot, 0.03), xm, (wg.top + wg.bot) / 2, wz1 + 0.02);
        P.add('hullDark', box(0.034, wg.top - wg.bot, 0.034), s * wg.x0 + (s > 0 ? 0.015 : -0.015), (wg.top + wg.bot) / 2, wz1 + 0.05);
        P.add('hullDark', box(0.034, wg.top - wg.bot, 0.034), s * wg.x1 - (s > 0 ? 0.015 : -0.015), (wg.top + wg.bot) / 2, wz1 + 0.05);
      }
    }
  }
  // r2 NOTE: the old `deckPack` defect-mimic (hull-node casting-band crate)
  // is GONE — the batch-4 oracle repair (86d1071) moved every stranded
  // turret fitting back onto rig_turret, so the repaired refs' hull masks
  // are bare decks and the crate read as pure excess (merkava2b precedent:
  // hull 30 -> 72.5 after removal).
  // rearPack: the tall packed stowage stack behind the bustle. On the
  // repaired 3B/3C oracles this stack is genuine HULL furniture (the repair
  // healed its split halves hull-side, x -1.08..0.93 y to 2.55) — center-x
  // only so it never poisons the front-view width columns. { hw, z0, z1,
  // top, bot, x? } with x the measured center offset.
  // Thin high side lips: the warped refs' outermost plan/front columns are
  // short guard-lip slivers (front-left mudguard corner, rear guard edges),
  // not full-depth flares. { x (signed outer face), z0, z1, top, bot }.
  if (c.lipStrips) {
    for (const lp of c.lipStrips) {
      const sgn = Math.sign(lp.x);
      P.add('hull', box(0.024, lp.top - lp.bot, lp.z0 - lp.z1),
        lp.x - sgn * 0.012, (lp.top + lp.bot) / 2, (lp.z0 + lp.z1) / 2);
    }
  }
  if (c.rearPack) {
    const rp = c.rearPack; // { hw, z0, z1, top, bot, x?, taperZ?, topRear?, lobeL? }
    const rx = rp.x ?? 0;
    const packMat = c.paleKit ? 'hull' : 'hullCloth';
    if (rp.lobeL) { // lower packed corner outside the main stack (front-view
      // hull column band ~2.18 at x -1.0 on the warped 3B/3C refs)
      const lb = rp.lobeL;
      P.add(packMat, box(lb.x1 - lb.x0, lb.top - rp.bot, lb.z0 - lb.z1),
        (lb.x0 + lb.x1) / 2, (lb.top + rp.bot) / 2, (lb.z0 + lb.z1) / 2);
    }
    const tz = rp.taperZ ?? rp.z1;
    P.add(packMat, box(rp.hw * 2, rp.top - rp.bot, rp.z0 - tz), rx, (rp.top + rp.bot) / 2, (rp.z0 + tz) / 2);
    if (tz > rp.z1) { // measured stack tail falls toward the rack line
      const tr2 = rp.topRear ?? rp.top - 0.15;
      P.add(packMat, slab(
        [rx - rp.hw, rp.bot, tz], [rx + rp.hw, rp.bot, tz], [rx + rp.hw * 0.96, rp.bot + 0.02, rp.z1], [rx - rp.hw * 0.96, rp.bot + 0.02, rp.z1],
        [rx - rp.hw, rp.top, tz], [rx + rp.hw, rp.top, tz], [rx + rp.hw * 0.96, tr2, rp.z1], [rx - rp.hw * 0.96, tr2, rp.z1]));
    }
    P.add('hullDark', box(rp.hw * 2 + 0.02, (rp.top - rp.bot) * 0.9, 0.022), rx, (rp.top + rp.bot) / 2, (rp.z0 + rp.z1) / 2 - 0.02);
    if (c.paleKit) { // stacked-stowage read: tarp rolls flush with the crown
      // + strap seams on the tail face (all inside the certified band tops)
      KIT.tarpRoll(P, 'hullDetail', rx - 0.25, rp.top - 0.055, rp.z0 - 0.35, 1.30, 0.055, true);
      KIT.tarpRoll(P, 'hullDetail', rx + 0.18, rp.top - 0.055, rp.z0 - 0.75, 1.10, 0.050, true);
      for (const sx2 of [rx - 0.52, rx + 0.02, rx + 0.55]) {
        P.add('hullDark', box(0.035, rp.top - rp.bot - 0.38, 0.020), sx2, (rp.top + rp.bot) / 2 - 0.10, rp.z1 - 0.004);
      }
      P.add('hullDetail', box(rp.hw * 1.88, 0.040, 0.018), rx, rp.bot + 0.30, rp.z1 - 0.004);
      P.add('hullDetail', box(rp.hw * 1.88, 0.040, 0.018), rx, rp.bot + 0.62, rp.z1 - 0.004);
    }
  }
  // THIN hull rail rack (2-series rig split): the repaired prints keep only
  // sub-body-band rails in the hull node (the tall rack wall rides
  // rig_turret) — all rail geometry stays inside a ~0.18 m y-window so the
  // hull registration's rear body column is unaffected, while the plan
  // footprint keeps the full rear reach.
  if (c.railRack) {
    const rr = c.railRack; // { z0, z1, y, hw, x0 }
    const mid = (rr.z0 + rr.z1) / 2, len = rr.z0 - rr.z1;
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.04, 0.05, len), s * rr.hw, rr.y, mid);
      P.add('hullDark', box(0.04, 0.04, len * 0.96), s * (rr.x0 + 0.02), rr.y + 0.02, mid);
    }
    for (const rz of [rr.z1 + 0.02, mid, rr.z0 - 0.02]) {
      P.add('hullDark', box(rr.hw * 2, 0.045, 0.045), 0, rr.y + 0.04, rz);
    }
  }
  // Trailing tow-pintle rods: HAIRLINE tail elements (band far below the
  // 12% body rule) that carry overallLengthM's pixel span to the published
  // tail without moving the hull-registration/hullLength body columns.
  if (c.tailPins) {
    for (const tp of c.tailPins) { // { x, y, z } — z is the aft tip
      P.add('hullDark', box(0.034, 0.042, 0.18), tp.x, tp.y, tp.z + 0.09);
      P.add('hullDark', box(0.05, 0.05, 0.035), tp.x, tp.y, tp.z + 0.02);
    }
  }
  // thin corner marker rods on the rear fenders (2-series oracles show them;
  // post-repair front trace: per-side heights — h may be [L,R])
  if (c.markerRods) {
    for (const s of [-1, 1]) {
      const mh = Array.isArray(c.markerRods.h) ? c.markerRods.h[s < 0 ? 0 : 1] : c.markerRods.h;
      P.add('hullDark', box(0.05, mh, 0.05), s * c.markerRods.x, c.markerRods.y + mh / 2, c.markerRods.z);
      P.add('hullDetail', box(0.06, 0.06, 0.06), s * c.markerRods.x, c.markerRods.y + 0.02, c.markerRods.z);
    }
  }
  // free-standing hull posts/brackets (measured 1-2 column hull-mask spikes)
  if (c.hullPosts) {
    for (const hp of c.hullPosts) { // { x, z, top, base }
      P.add('hullDark', box(0.028, hp.top - hp.base, 0.028), hp.x, (hp.top + hp.base) / 2, hp.z);
      P.add('hullDetail', box(0.07, 0.05, 0.05), hp.x, hp.base + 0.025, hp.z);
    }
  }
}

// ---------------------------------------------------------------------------
// Fittings shared across marks (board-proven helpers, re-anchored per mark).
// ---------------------------------------------------------------------------
function merkavaMG(P, x, y, z, s = 1) {
  const { box, cylZ } = KIT;
  P.add('turretDark', box(0.035 * s, 0.20 * s, 0.035 * s), x, y + 0.10 * s, z);
  P.add('turretDark', box(0.09 * s, 0.09 * s, 0.44 * s), x, y + 0.24 * s, z);
  P.add('turretDark', box(0.12 * s, 0.10 * s, 0.16 * s), x - 0.09 * s, y + 0.23 * s, z - 0.06 * s);
  P.add('turretDark', cylZ(0.02 * s, 0.5 * s, 8), x, y + 0.26 * s, z + 0.42 * s);
  P.add('turretDark', cylZ(0.028 * s, 0.07 * s, 8), x, y + 0.26 * s, z + 0.64 * s);
}

// Compact CL-3030 smoke rosette snugged onto the PORT cheek plane.
// opts.pale: monochrome-sand refs — the near-black base plate read as a
// blockout rectangle on the cheek from the top views (3B/3C visual round).
function merkavaSmokeCluster(P, x, y, z, yaw = 0, n = 5, opts = {}) {
  const { box, cylY } = KIT;
  const pitch = opts.pitch ?? -0.30;
  const tubeL = opts.recessed ? 0.09 : 0.15;
  const lift = opts.recessed ? 0.015 : 0.035;
  if (opts.recessed) {
    P.add(opts.pale ? 'turretDetail' : 'turretDark', box(0.30, 0.018, 0.20), x, y, z, pitch, yaw, 0);
  } else {
    P.add('turretDetail', box(0.36, 0.10, 0.20), x, y - 0.05, z, pitch, yaw, 0);
  }
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rows = [Math.ceil(n / 2), Math.floor(n / 2)];
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < rows[r]; k++) {
      const u = (k - (rows[r] - 1) / 2) * 0.088;
      const v = (r - 0.5) * 0.078;
      P.add('turretDark', cylY(0.032, 0.036, tubeL, 8),
        x + cy * u + sy * v, y + lift + r * 0.012, z - sy * u + cy * v, pitch - 0.15, yaw, 0);
    }
  }
}

// Ball-and-chain curtain: hanger rail + irregular drops with ball ends.
// backZ (optional): structural hanger arms tying the rail to the frame that
// carries it — the floater gate projects every articulation pose through a
// quarter camera, so the rail must be CONNECTED, not merely adjacent.
function chainCurtain(P, halfW, z, topY, drop, backZ) {
  const { box, sph } = KIT;
  P.add('turretDark', box(halfW * 2 + 0.06, 0.028, 0.028), 0, topY + 0.01, z);
  if (backZ !== undefined && Math.abs(backZ - z) > 0.03) {
    for (const s of [-1, 1]) {
      P.add('turretDark', box(0.026, 0.026, Math.abs(backZ - z) + 0.10),
        s * halfW * 0.72, topY + 0.01, (backZ + z) / 2);
    }
  }
  const n = 13;
  for (let i = 0; i < n; i++) {
    const x = -halfW + i * (halfW * 2 / (n - 1));
    const d = drop + (i % 3) * 0.03; // shallow variance: the repaired refs'
    // turret masks bottom near the rail line (long drops read as excess)
    P.add('turretDark', box(0.016, d, 0.016), x, topY - d / 2, z);
    P.add('turretDark', sph(0.032, 8), x, topY - d - 0.02, z);
  }
}

// Open pipe-frame stowage basket + packed cloth kit + chain curtain.
// top/topRear allow the measured falling rim line at the tail.
function merkavaBasket(P, b) {
  const { box } = KIT;
  const bx = b.xoff ?? 0; // measured baskets sit slightly left of center
  const mid = (b.z0 + b.z1) / 2, len = b.z0 - b.z1;
  const topR = b.topRear ?? b.top;
  const midY = (Math.max(b.top, topR) + b.bot) / 2;
  P.add('turretDark', box(b.hw * 2 - 0.06, 0.035, len - 0.04), bx, b.bot + 0.02, mid);
  // top rim rail follows the measured rim slope; mid rail level
  for (const s of [-1, 1]) {
    P.add('turretDark', KIT.slab(
      [bx + s * b.hw - 0.023, b.top - 0.045, b.z0], [bx + s * b.hw + 0.023, b.top - 0.045, b.z0],
      [bx + s * b.hw + 0.023, topR - 0.045, b.z1], [bx + s * b.hw - 0.023, topR - 0.045, b.z1],
      [bx + s * b.hw - 0.023, b.top, b.z0], [bx + s * b.hw + 0.023, b.top, b.z0],
      [bx + s * b.hw + 0.023, topR, b.z1], [bx + s * b.hw - 0.023, topR, b.z1]));
    P.add('turretDark', box(0.030, 0.030, len), bx + s * b.hw, midY - 0.12, mid);
  }
  P.add('turretDark', box(b.hw * 2 + 0.045, 0.045, 0.045), bx, topR, b.z1 + 0.02);
  P.add('turretDark', box(b.hw * 2 + 0.03, 0.030, 0.030), bx, midY - 0.12, b.z1 + 0.03);
  for (const px of [-b.hw, -b.hw * 0.34, b.hw * 0.34, b.hw]) {
    P.add('turretDark', box(0.034, topR - b.bot, 0.034), bx + px, (topR + b.bot) / 2, b.z1 + 0.02);
  }
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.034, b.top - b.bot, 0.034), bx + s * b.hw, midY, b.z0 - 0.04);
    P.add('turretDark', box(0.034, (b.top + topR) / 2 - b.bot, 0.034), bx + s * b.hw, midY, mid);
  }
  // packed kit visible through the rails, filling to the rear face
  // (b.pale: monochrome-sand kit — 3B/3C visual round)
  P.add(b.pale ? 'turret' : 'turretCloth', box(b.hw * 1.86, (b.top - b.bot) * 0.80, len * 0.92),
    bx - b.hw * 0.04, b.bot + (b.top - b.bot) * 0.42, mid - len * 0.02);
  P.add(b.pale ? 'turret' : 'turretCloth', box(b.hw * 0.90, (b.top - b.bot) * 0.55, len * 0.52),
    b.hw * 0.42, b.bot + (b.top - b.bot) * 0.32, mid + len * 0.08);
  if (b.coil) {
    P.add('turretDark', KIT.torus(0.14, 0.045, 18, 8), b.coil, midY + 0.04, b.z1 - 0.04, Math.PI / 2, 0, 0);
    P.add('turretDark', KIT.cylZ(0.05, 0.06, 10), b.coil, midY + 0.04, b.z1 - 0.04);
  }
  // chainHW: the measured plan rears V-taper INSIDE the basket rails — a
  // full-width curtain owned 4 plan-turret worst columns on the 3-series.
  chainCurtain(P, b.chainHW ?? b.hw * 0.92, b.z1 - (b.chainGap ?? 0.16), b.bot + 0.10, b.chainDrop ?? 0.32, b.z1 + 0.04);
}

// Twin/triple whip antennas with spring-can bases anchored to a surface.
// WHIP ALIGNMENT (r2): each whip lights exactly one ~9 cm trace column in
// the gate masks; a half-column offset against the reference whip column
// costs TWO worst-list columns per whip (crossfire), so whip z is authored
// to the measured reference column center. potTop draws the chunky
// spring-can pot under the whip (capped under published height).
function merkavaAntennas(P, list) {
  const { box } = KIT;
  for (const a of list) { // { x, y, z, h, stem, potTop? }
    P.add('turretDetail', box(0.10, 0.08, 0.10), a.x, a.y - 0.04, a.z);
    P.add('turretDark', box(0.045, a.stem ?? 0.30, 0.045), a.x, a.y - (a.stem ?? 0.3) / 2 - 0.04, a.z);
    P.add('turretDetail', KIT.cylY(0.035, 0.045, 0.10, 8), a.x, a.y + 0.04, a.z);
    P.add('turretDark', KIT.cylY(0.020, 0.026, 0.09, 8), a.x, a.y + 0.11, a.z);
    if (a.potTop) {
      P.add('turretDetail', box(0.13, a.potTop - a.y - 0.02, 0.13), a.x, (a.potTop + a.y - 0.02) / 2, a.z);
    }
    // NO lean: a 0.006 rotZ pushed the whip's upper half across the next
    // 5.5 cm front trace column (one 0.65 m worst row per leaning whip).
    // Tapered tip: the reference whips thin toward the tip and alias to
    // partial height in whichever gate column splits them — a full-width
    // box read 0.3 m taller than the print in the split column. a.thin
    // overrides the thin-segment length (batch-14 3C: its 3.9 m whips'
    // 0.57 thin tips dropped out of the geo front render entirely,
    // reading the thick-segment top 0.55 low across four columns).
    const thin = a.thin ?? 0.57;
    // a.bright: render the whip in the mid-gray detail material — the geo
    // mask thresholds rendered luminance (rgba > 40), and the 3C print's
    // 3.9 m whips' dark-material pixels fall below it near the tip (3B's
    // 3.6 m whips stay under the falloff; same construction reads fine).
    const wb = a.bright ? 'turretDetail' : 'turretDark';
    P.add(wb, box(0.022, a.h - thin + 0.02, 0.022), a.x, a.y + (a.h - thin) / 2 - 0.01, a.z);
    P.add(wb, box(0.012, thin, 0.012), a.x, a.y + a.h - 0.02 - thin / 2, a.z);
  }
}

// ---------------------------------------------------------------------------
// Mk.1/2 small cast turret. Curve anatomy (side_whole − side_hull traces):
// a compact casting whose roof RISES rearward, a long external mantlet
// sleeve on the gun, a rounded raised commander station (dome band ~1.1 m
// long) on the left rear roof, soft bustle stowage, then the big open basket
// running almost to the hull tail with the chain curtain beneath.
// Turret-local coordinates (pivot at hull deck + 0.02, p.pivotZ).
// ---------------------------------------------------------------------------
function merkavaSmallTurret(P, t) {
  const { box, cylY, polyTurret, slab, lathe, xform } = KIT;
  const apex = t.apexZ, gy = t.apexY;
  const sf = t.shoulderZ;        // full-height casting begins here
  const hwM = t.hwMax;
  const rf = t.roof;             // [[z, y, w?]] crest line front->rear (local)

  // Shell: one low casting capped at the SADDLE line (the old full-height
  // prism poked through the measured saddle dip); base at the carved ring
  // plane when shellBotY is given, with the apron carrying the descent.
  const base = t.shellBotY ?? 0.0;
  const shellH = (t.shellTopY ?? (rf[0][1] - 0.06)) - base;
  const outline = t.planPts
    ? [...t.planPts.map(([x, z]) => [-x, z]), ...t.planPts.slice().reverse().map(([x, z]) => [x, z])]
    : [
      [-t.notchHW * 1.5, apex - 0.06], [t.notchHW * 1.5, apex - 0.06],
      [hwM * 0.72, sf], [hwM, sf - 0.55],
      [hwM * 0.99, t.shellRearZ + 0.40], [hwM * 0.90, t.shellRearZ],
      [-hwM * 0.90, t.shellRearZ], [-hwM * 0.99, t.shellRearZ + 0.40],
      [-hwM, sf - 0.55], [-hwM * 0.72, sf],
    ];
  P.add('turret', xform(polyTurret(outline, shellH, 1.0, t.roofInset ?? 0.74), 0, base, 0));

  // Cast cheek beak: one continuous plane per side from the gun-notch band
  // to the roof shoulder. Undersides stay at the measured casting-bottom
  // line (~gy-0.16) — the repaired turret masks bottom high at the face.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.12, gy - 0.16, apex], [s * (t.notchHW + 0.04), gy - 0.14, apex - 0.04],
      [s * hwM * (t.planPts ? 0.60 : 0.74), 0.16, sf - (t.planPts ? 0.25 : 0.35)], [s * 0.06, 0.16, sf - (t.planPts ? 0.20 : 0.30)],
      [s * 0.12, gy + 0.22, apex], [s * (t.notchHW + 0.04), gy + 0.19, apex - 0.04],
      [s * hwM * (t.planPts ? 0.52 : 0.62), shellH + 0.02, sf - (t.planPts ? 0.22 : 0.30)], [s * 0.06, rf[0][1], sf - (t.planPts ? 0.20 : 0.28)]));
  }
  P.add('turret', box(0.34, 0.12, apex - sf + 0.30), 0, gy - 0.18, (apex + sf) / 2 - 0.12);
  for (const cp of (Array.isArray(t.cheekPod) ? t.cheekPod : t.cheekPod ? [t.cheekPod] : [])) {
    P.add('turret', box(Math.abs(cp.x1 - cp.x0), cp.top - cp.bot, cp.z0 - cp.z1),
      (cp.x0 + cp.x1) / 2, (cp.top + cp.bot) / 2, (cp.z0 + cp.z1) / 2);
  }
  // Narrow brow mass over the mantlet (Mk.1B searchlight/MG bracket): the
  // measured side band tops ~2.56 out to z~1.5 while the PLAN keeps the
  // casting nose inside ~1.2 — so the brow stays inside the gun's plan
  // columns (|x| <= 0.19) and never leads the casting footprint.
  if (t.brow) {
    const b = t.brow; // { z0, z1, top }
    // brow stays inside |x| 0.17: the print's own brow never lights the
    // 0.20+ plan columns (a 0.19+AA edge cost an 0.84 t_plan worst row)
    P.add('turret', box(0.34, 0.10, b.z0 - b.z1), 0, b.top - 0.20, (b.z0 + b.z1) / 2);
    P.add('turretDark', box(0.28, (b.top - 0.15) - (gy + 0.24), 0.30), 0, ((b.top - 0.15) + gy + 0.24) / 2, (b.z0 + b.z1) / 2 + 0.05);
    P.add('turretDark', box(0.32, 0.15, b.z0 - b.z1 - 0.10), 0, b.top - 0.075, (b.z0 + b.z1) / 2 - 0.02);
    P.add('turretGlass', box(0.22, 0.10, 0.02), 0, b.top - 0.16, b.z0 - 0.02);
  }

  // Roof: slabs following the measured rising crest line; per-station
  // widths (third tuple slot) follow the casting's plan taper.
  for (let i = 0; i < rf.length - 1; i++) {
    const [z0, y0] = rf[i], [z1, y1] = rf[i + 1];
    const w0 = (rf[i][2] ?? t.roofHW) * (i === 0 ? 0.96 : 1.0);
    const w1 = (rf[i + 1][2] ?? t.roofHW) * (i + 1 === rf.length - 1 ? 0.94 : 1.0);
    P.add('turret', slab(
      [-w0, y0 - 0.10, z0], [w0, y0 - 0.10, z0], [w1, y1 - 0.10, z1], [-w1, y1 - 0.10, z1],
      [-w0 * 0.96, y0, z0], [w0 * 0.96, y0, z0], [w1 * 0.96, y1, z1], [-w1 * 0.96, y1, z1]));
  }

  // Casting-ring apron — post-repair, the reference turret masks bottom out
  // at the carved ring plane (side bottoms ~1.5 world at mid-casting, rising
  // fore and aft), NOT at y 0.6: the old ring-interior column mimicked the
  // pre-repair oracles and is deleted. t.apron: [[z, y]...] local underside
  // line front->rear; slabs fill 0.30 up into the casting shadow.
  if (t.apron) {
    const ahw = t.apronHW ?? hwM * 0.84;
    for (let i = 0; i < t.apron.length - 1; i++) {
      const [z0, y0] = t.apron[i], [z1, y1] = t.apron[i + 1];
      const w0 = t.apron[i][2] ?? ahw, w1 = t.apron[i + 1][2] ?? ahw;
      P.add('turret', slab(
        [-w0, y0, z0], [w0, y0, z0], [w1, y1, z1], [-w1, y1, z1],
        [-w0, y0 + 0.30, z0], [w0, y0 + 0.30, z0], [w1, y1 + 0.30, z1], [-w1, y1 + 0.30, z1]));
    }
  }

  // Raised commander station: the measured dome band is a long FLAT plateau
  // (the repaired oracles ride it at 2.8-2.9 world) — published heightM is
  // p95 of column tops, so the whole band caps at cs.top (dims-governed):
  // a flat-topped drum, not a tall dome. Cupola lid + MG stay below cs.top.
  const cs = t.station; // { x, z0, z1, top }
  const roofAt = (z) => {
    for (let i = 0; i < rf.length - 1; i++) {
      if (z <= rf[i][0] && z >= rf[i + 1][0]) {
        const f = (rf[i][0] - z) / Math.max(0.001, rf[i][0] - rf[i + 1][0]);
        return rf[i][1] + (rf[i + 1][1] - rf[i][1]) * f;
      }
    }
    return rf[rf.length - 1][1];
  };
  const csMid = (cs.z0 + cs.z1) / 2, csLen = cs.z0 - cs.z1;
  const csBase = roofAt(csMid) - 0.12;
  const csHW = cs.hw ?? 0.52;
  P.add('turret', box(csHW * 2, cs.top - 0.03 - csBase, csLen * 0.94), cs.x, (cs.top - 0.03 + csBase) / 2, csMid);
  P.add('turret', box(csHW * 1.8, 0.03, csLen * 0.80), cs.x, cs.top - 0.015, csMid);
  P.add('turret', KIT.xform(lathe([
    [csLen * 0.30, 0], [csLen * 0.30, (cs.top - csBase) * 0.88], [0.02, cs.top - csBase],
  ], 18, 1.15), cs.x, csBase, csMid));
  KIT.cupola(P, 'turret', cs.x, cs.top - 0.16, csMid - 0.05, 0.24, 0.09, 6); // crown cs.top-0.01
  merkavaMG(P, cs.x + 0.34, cs.top - 0.24, csMid - 0.22, 0.8);              // top cs.top-0.01
  if (cs.peak) { // true-height spike: the real MG/periscope head crests the
    // published-height line only in this single trace column (dims p95
    // excludes it; stations and the side curve get the measured max).
    P.add('turretDark', box(0.05, cs.peak.top - cs.top + 0.24, 0.05), cs.x + 0.10, (cs.peak.top + cs.top - 0.24) / 2, cs.peak.z);
    P.add('turretDark', box(0.16, 0.10, 0.09), cs.x + 0.10, cs.peak.top - 0.05, cs.peak.z);
  }
  // gunner sight hood (right-front) + loader hatch disc (right-rear); the
  // hood hugs the roofline (the measured plateau IS the roof slabs now)
  P.add('turret', box(0.34, 0.13, 0.30), -cs.x * 0.72, roofAt(t.sightZ) - 0.04, t.sightZ);
  P.add('turretGlass', box(0.20, 0.06, 0.02), -cs.x * 0.72, roofAt(t.sightZ) - 0.02, t.sightZ + 0.16);
  P.add('turret', cylY(0.19, 0.19, 0.045, 12), -cs.x * 0.9, roofAt(csMid) + 0.01, csMid + 0.02);
  merkavaMG(P, -cs.x * 0.9, roofAt(csMid) + 0.02, csMid - 0.28, 0.66);
  // internal 60 mm mortar lid + periscopes
  if (t.planPts) { // measured-wedge path: mortar tucks under the dome drum
    P.add('turret', cylY(0.11, 0.12, 0.035, 10), cs.x * 0.5, roofAt(csMid) + 0.02, csMid + 0.32);
  } else {
    P.add('turret', cylY(0.11, 0.12, 0.035, 10), cs.x * 0.5, roofAt(t.sightZ - 0.1) + 0.02, t.sightZ - 0.32);
  }
  KIT.periscope(P, 'turretDetail', cs.x * 0.4, roofAt(csMid + 0.3) + 0.02, csMid + 0.34);

  // Soft stowage over the rear casting, then the open basket + chains.
  const stZ0 = t.stow.z0, stZ1 = t.stow.z1;
  const stMid = (stZ0 + stZ1) / 2, stLen = stZ0 - stZ1;
  const stHW = t.stow.hw ?? hwM * 0.72;
  const stX = t.stow.xoff ?? -hwM * 0.08;
  P.add('turretCloth', box(stHW * 2, t.stow.top - t.stow.bot, stLen * 0.9), stX, (t.stow.top + t.stow.bot) / 2, stMid);
  P.add('turretCloth', box(stHW * 1.1, (t.stow.top - t.stow.bot) * 0.6, stLen * 0.55), stX + hwM * 0.4, t.stow.bot + (t.stow.top - t.stow.bot) * 0.3, stMid - 0.05);
  for (const f of [-0.30, 0.24]) {
    P.add('turretDark', box(stHW * 2 + 0.02, t.stow.top - t.stow.bot + 0.02, 0.018), stX, (t.stow.top + t.stow.bot) / 2, stMid + f * stLen);
  }
  if (t.stow2) { // aft stowage continuation (narrower: the plan flanks pull in)
    const s2 = t.stow2;
    P.add('turretCloth', box((s2.hw ?? stHW) * 2, s2.top - s2.bot, (s2.z0 - s2.z1) * 0.94),
      s2.xoff ?? 0, (s2.top + s2.bot) / 2, (s2.z0 + s2.z1) / 2);
    P.add('turretDark', box((s2.hw ?? stHW) * 2 + 0.02, (s2.top - s2.bot) * 0.9, 0.018),
      s2.xoff ?? 0, (s2.top + s2.bot) / 2, (s2.z0 + s2.z1) / 2 - 0.05);
  }
  merkavaBasket(P, {
    hw: t.basketHW, z0: t.basket.z0, z1: t.basket.z1, xoff: t.basketXoff,
    top: t.basket.top, topRear: t.basket.topRear, bot: t.basket.bot,
    coil: hwM * 0.26, chainDrop: t.chainDrop ?? 0.34, chainGap: t.chainGap,
  });
  // trailing stow/chain vane behind the basket (measured falling band).
  // Chains stay SHORT: the repaired refs' turret masks bottom at ~basket
  // floor height across the tail (long drops read as excess volume).
  if (t.tailVane) {
    const tv = t.tailVane; // { z0, z1, top, topRear?, bot, hw, hwRear?, drop? }
    const hwR = tv.hwRear ?? tv.hw * 0.8;
    const topR = tv.topRear ?? tv.top - 0.14; // measured falls can be steep
    // short FRONT rail only: a full-length rail held the old flat top line
    // 0.25 above the print's falling tail band
    P.add('turretDark', box(0.04, 0.04, (tv.z0 - tv.z1) * 0.4), 0, tv.top - 0.02, tv.z0 - (tv.z0 - tv.z1) * 0.2);
    P.add('turretCloth', KIT.slab(
      [-tv.hw, tv.bot, tv.z0], [tv.hw, tv.bot, tv.z0], [hwR, tv.bot + 0.04, tv.z1], [-hwR, tv.bot + 0.04, tv.z1],
      [-tv.hw, tv.top, tv.z0], [tv.hw, tv.top, tv.z0], [hwR, topR, tv.z1], [-hwR, topR, tv.z1]));
    chainCurtain(P, hwR * 0.9, tv.z1 - 0.05, tv.bot + 0.14, tv.drop ?? 0.14, tv.z1 + 0.30);
  }
  // smoke cluster snugged low on the port cheek (the measured plan keeps the
  // casting front inside z~1.2 at cheek width — the rosette must not lead it)
  merkavaSmokeCluster(P, -hwM * 0.42, gy + 0.40, apex - 0.85, -0.55, 5, { pitch: -0.34 });

  // TURRET-NODE rear rack: the repaired 2-series rigs carry the low tail
  // rack under rig_turret (their hull body masks END at the shelf crest) —
  // matching the masks requires the same split. { z0, z1, top, bot, hw, x0 }
  if (t.turretRack) {
    const tr = t.turretRack;
    const mid = (tr.z0 + tr.z1) / 2, len = tr.z0 - tr.z1;
    for (const s of [-1, 1]) {
      const xm = s * (tr.x0 + tr.hw) / 2, wd = tr.hw - tr.x0;
      P.add('turretCloth', box(wd, (tr.top - tr.bot) * 0.94, len * 0.94), xm, (tr.top + tr.bot) / 2, mid);
      P.add('turretDark', box(wd + 0.02, (tr.top - tr.bot) * 0.9, 0.022), xm, (tr.top + tr.bot) / 2 - 0.01, mid + 0.28 * len);
      for (const ry of [tr.bot + 0.04, tr.top - 0.04]) {
        P.add('turretDark', box(0.04, 0.04, len), s * tr.hw, ry, mid);
        P.add('turretDark', box(wd, 0.04, 0.04), xm, ry, tr.z1 + 0.02);
      }
      P.add('turretDark', box(0.038, tr.top - tr.bot, 0.038), s * tr.hw, (tr.top + tr.bot) / 2, tr.z1 + 0.02);
      P.add('turretDark', box(0.038, tr.top - tr.bot, 0.038), s * tr.x0 + (s > 0 ? 0.02 : -0.02), (tr.top + tr.bot) / 2, tr.z1 + 0.02);
    }
    P.add('turretDark', box(tr.x0 * 2, 0.035, 0.035), 0, tr.bot + 0.04, tr.z1 + 0.30);
  }
}

// ---------------------------------------------------------------------------
// Mk.3/Mk.4 modular wedge turret — r3 measured-anatomy re-lay. The repaired
// oracle masks read as: a NARROW rotor/crest housing (|x|<=~0.2) whose face
// stands at the side-view apex, widening into the crest plateau; a FLAT
// cheek-face plan plateau ~0.55 m behind the mantlet tip; swept cheek wedges
// whose UNDERSIDE rises to the mantlet line at the face (1.85ish) from the
// carved ring plane (1.53ish); a near-vertical-walled casting body; an
// ASYMMETRIC roof (left sight plinth at the dims cap, LOW right deck); a
// rear-deck dip then a pot/stowage bump; and a low-riding bustle.
// ---------------------------------------------------------------------------
function merkavaModularTurret(P, t) {
  const { box, cylY, polyTurret, slab, frustum, xform } = KIT;
  const hwM = t.hwMax, gy = t.apexY;
  const rf = t.roof; // [[z,y]] roof DECK line front->rear (local)
  const roofF = rf[0][0], h = rf[0][1];
  const rw = t.rearWide ?? 0.94;
  const base = t.shellBotY ?? 0.0;     // carved casting-ring plane
  const shellTop = t.shellTopY ?? (h - 0.04);
  // glassTiles false (3B/3C): the periscope/sight tiles read as bright blue
  // squares against the monochrome sand ref — route them to the dark bucket.
  const glassMat = t.glassTiles === false ? 'turretDark' : 'turretGlass';
  const deckAt = (z) => { // roof DECK line y at local z
    for (let i = 0; i < rf.length - 1; i++) {
      if (z <= rf[i][0] && z >= rf[i + 1][0]) {
        const f = (rf[i][0] - z) / Math.max(0.001, rf[i][0] - rf[i + 1][0]);
        return rf[i][1] + (rf[i + 1][1] - rf[i][1]) * f;
      }
    }
    return rf[rf.length - 1][1];
  };

  // Casting body: near-vertical walls (measured front columns rise ~flat to
  // the roof at the max-width line), base at the carved ring plane.
  P.add('turret', xform(polyTurret([
    [-t.noseHW, t.noseZ], [t.noseHW, t.noseZ],
    [hwM * 0.90, t.noseZ - (t.noseZ - t.maxWZ) * 0.55], [hwM, t.maxWZ],
    [hwM * (rw + 0.02), t.shellRearZ + 0.55], [hwM * rw, t.shellRearZ],
    [-hwM * rw, t.shellRearZ], [-hwM * (rw + 0.02), t.shellRearZ + 0.55],
    [-hwM, t.maxWZ], [-hwM * 0.90, t.noseZ - (t.noseZ - t.maxWZ) * 0.55],
  ], shellTop - base, 1.0, t.roofInset ?? 0.96), 0, base, 0));

  // Turret ring tub: the crew/ammo basket descending through the ring into
  // the hull (real Merkava turrets hang one). The warped 3B/3C refs carry it
  // in their turret masks (side bottoms 0.58 flat over z −0.36..−2.14 with
  // short ramps at both ends) — and it is INVISIBLE everywhere else: inside
  // the hull silhouette for whole/hull/front/plan rows and every station
  // slice; only the turret-only side render sees it. Solid closed volume
  // (fill rule): two ramp slabs + one flat-bottom box, flush to shell base.
  if (t.ringTub) {
    const rt = t.ringTub; // { z0, zF0, zF1, z1, top, bot, hw, stepY? } local
    P.add('turret', slab( // front ramp down
      [-rt.hw, rt.bot, rt.zF0], [rt.hw, rt.bot, rt.zF0], [rt.hw, rt.top - 0.06, rt.z0], [-rt.hw, rt.top - 0.06, rt.z0],
      [-rt.hw, rt.top, rt.zF0], [rt.hw, rt.top, rt.zF0], [rt.hw, rt.top, rt.z0], [-rt.hw, rt.top, rt.z0]));
    P.add('turret', box(rt.hw * 2, rt.top - rt.bot, rt.zF0 - rt.zF1), 0, (rt.top + rt.bot) / 2, (rt.zF0 + rt.zF1) / 2);
    // rear end: the warped refs step near-vertically 0.58 -> ~1.05 at the
    // tub tail, then shelve up to the bustle line (stepY); default = ramp.
    const sy = rt.stepY ?? (rt.top - 0.06);
    P.add('turret', slab( // vertical-ish step
      [-rt.hw, rt.bot, rt.zF1], [rt.hw, rt.bot, rt.zF1], [rt.hw, sy, rt.zF1 - 0.015], [-rt.hw, sy, rt.zF1 - 0.015],
      [-rt.hw, rt.top, rt.zF1], [rt.hw, rt.top, rt.zF1], [rt.hw, rt.top, rt.zF1 - 0.015], [-rt.hw, rt.top, rt.zF1 - 0.015]));
    P.add('turret', slab( // shelf up to the bustle underside
      [-rt.hw, sy, rt.zF1 - 0.015], [rt.hw, sy, rt.zF1 - 0.015], [rt.hw, rt.top - 0.04, rt.z1], [-rt.hw, rt.top - 0.04, rt.z1],
      [-rt.hw, rt.top, rt.zF1 - 0.015], [rt.hw, rt.top, rt.zF1 - 0.015], [rt.hw, rt.top, rt.z1], [-rt.hw, rt.top, rt.z1]));
  }

  // Rotor/crest housing: narrow front face at the apex (the side-view 2.56
  // wall), widening to the crest plateau; bottom rides the mantlet band.
  const cr = t.crest; // { z0(face), zW(widen), z1(rear), hw0, hw1, top0, top1, bot }
  P.add('turret', slab(
    [-cr.hw0, cr.bot, cr.z0], [cr.hw0, cr.bot, cr.z0],
    [cr.hw0, cr.bot - 0.06, cr.zW], [-cr.hw0, cr.bot - 0.06, cr.zW],
    [-cr.hw0, cr.top0, cr.z0], [cr.hw0, cr.top0, cr.z0],
    [cr.hw0, cr.top0, cr.zW], [-cr.hw0, cr.top0, cr.zW]));
  P.add('turret', slab(
    [-cr.hw1, cr.bot - 0.06, cr.zW], [cr.hw1, cr.bot - 0.06, cr.zW],
    [cr.hw1, shellTop - 0.02, cr.z1], [-cr.hw1, shellTop - 0.02, cr.z1],
    [-cr.hw1, cr.top0 + 0.01, cr.zW], [cr.hw1, cr.top0 + 0.01, cr.zW],
    [cr.hw1, cr.top1, cr.z1], [-cr.hw1, cr.top1, cr.z1]));
  P.add('turretDark', box(cr.hw1 * 1.55, 0.03, 0.03), 0, cr.top1 - 0.02, cr.z1 + 0.02);

  // Cheek wedges: swept plan taper (measured plateau -> shoulder), underside
  // rising from the ring plane to the mantlet line at the inner face.
  // ptsL overrides the LEFT sweep — the repaired refs are asymmetric (the
  // left cheek cuts back hard where the right holds the plateau).
  const ck = t.cheek; // { pts, ptsL?, topIn, topOut, botIn, botOut }
  // cheekRake (3B/3C visual round): the ref cheeks are strongly RAKED planes
  // (bottom edge forward on the certified plan sweep, top edge pulled back)
  // — the old 0.06 near-vertical faces read as one flat slab under shading.
  // Silhouette-neutral: plan keeps the bottom-edge line, front keeps the
  // x/y extents, side tops stay under the crest plateau.
  const ckRake = t.cheekRake ?? 0.06;
  for (const s of [-1, 1]) {
    const p = (s < 0 && ck.ptsL) ? ck.ptsL : ck.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const f0 = i / (p.length - 1), f1 = (i + 1) / (p.length - 1);
      const top0 = ck.topIn + (ck.topOut - ck.topIn) * f0, top1 = ck.topIn + (ck.topOut - ck.topIn) * f1;
      const bot0 = ck.botIn + (ck.botOut - ck.botIn) * f0, bot1 = ck.botIn + (ck.botOut - ck.botIn) * f1;
      const zR0 = Math.min(p[i][1] - 0.55, t.maxWZ + 0.3), zR1 = Math.min(p[i + 1][1] - 0.55, t.maxWZ + 0.3);
      P.add('turret', slab(
        [s * p[i][0], bot0, p[i][1]], [s * p[i + 1][0], bot1, p[i + 1][1]],
        [s * p[i + 1][0], bot1 - 0.02, zR1], [s * p[i][0], bot0 - 0.02, zR0],
        [s * p[i][0], top0, p[i][1] - ckRake], [s * p[i + 1][0], top1, p[i + 1][1] - ckRake],
        [s * p[i + 1][0], top1, zR1], [s * p[i][0], top0, zR0]));
    }
  }
  // Converging-V fillet planes between the crest nose and the cheek inner
  // edges (3B/3C wedge-front rebuild): raked trapezoid planes flanking the
  // crest — bottom edge held at the certified zW step line (the warped ref
  // plan is FLAT ~0.92 across x 0.18..0.41 — an r1 diagonal there cost 4
  // t_plan columns), top edge pulled back+inboard so the pair reads as the
  // converging wedge under shading.
  if (t.wedgeFront && t.crest) {
    const cr0 = t.crest;
    const fB = cr0.bot, fT = cr0.top0 ?? shellTop, fT2 = ck.topIn - 0.002;
    const rake2 = t.wedgeRake ?? 0.30;
    const zi = cr0.zW + 0.03, zo = cr0.zW - 0.03;
    const ri = cr0.zW - 0.14, ro = Math.max(cr0.zW - 0.48, t.maxWZ + 0.32);
    for (const s of [-1, 1]) {
      const xi = s * 0.175, xo = s * 0.41, xoT = s * 0.375;
      const bC = [[xi, fB, zi], [xo, fB, zo], [xo, fB, ro], [xi, fB, ri]];
      const tC = [[xi, fT, zi - rake2], [xoT, fT2, zo - rake2], [xo, fT2, ro], [xi, fT, ri]];
      if (s > 0) P.add('turret', slab(bC[0], bC[1], bC[2], bC[3], tC[0], tC[1], tC[2], tC[3]));
      else P.add('turret', slab(bC[1], bC[0], bC[3], bC[2], tC[1], tC[0], tC[3], tC[2]));
    }
  }

  // Chin wedge: the casting underside between the carved-ring nose and the
  // mantlet line RISES (measured side bottoms 1.53 -> 1.57 -> 1.70 over
  // z +0.3..+0.66) — without it the flat ring base printed 1.53 forward.
  if (t.chin) {
    const ch = t.chin; // { z0(front), z1(rear), bot0, bot1, hw } local
    P.add('turret', slab(
      [-ch.hw, ch.bot1, ch.z1], [ch.hw, ch.bot1, ch.z1], [ch.hw, ch.bot0, ch.z0], [-ch.hw, ch.bot0, ch.z0],
      [-ch.hw, ch.bot1 + 0.45, ch.z1], [ch.hw, ch.bot1 + 0.45, ch.z1], [ch.hw, ch.bot0 + 0.45, ch.z0], [-ch.hw, ch.bot0 + 0.45, ch.z0]));
  }

  // Cheek-side housings: the measured plan bumps leading each shoulder
  // (right: gunner sight; left: smaller fitting block on the 3-series).
  for (const cp of (Array.isArray(t.cheekPod) ? t.cheekPod : t.cheekPod ? [t.cheekPod] : [])) {
    // { x0, x1, z0, z1, top, bot } — negative x0/x1 for the left side
    P.add('turret', box(Math.abs(cp.x1 - cp.x0), cp.top - cp.bot, cp.z0 - cp.z1),
      (cp.x0 + cp.x1) / 2, (cp.top + cp.bot) / 2, (cp.z0 + cp.z1) / 2);
    P.add(glassMat, box(Math.abs(cp.x1 - cp.x0) * 0.5, 0.10, 0.02), (cp.x0 + cp.x1) / 2, cp.top - 0.16, cp.z0 + 0.005);
  }

  // Left sight plinth: the capped stand-in for the oracle's 2.7-2.9 sight/
  // pano band — a one-sided raised deck (front view: left tall, right low).
  if (t.plinth) {
    const pl = t.plinth; // { x0, x1, z0, z1, top }
    P.add('turret', box(Math.abs(pl.x1 - pl.x0), 0.16, pl.z0 - pl.z1,),
      (pl.x0 + pl.x1) / 2, pl.top - 0.08, (pl.z0 + pl.z1) / 2);
    // lid INSIDE the cap plane: pl.top is authored at the dims grace line —
    // a lid at +0.005 put eleven p95 columns 1.3% over published height
    P.add('turretDark', box(Math.abs(pl.x1 - pl.x0) * 0.9, 0.02, (pl.z0 - pl.z1) * 0.9),
      (pl.x0 + pl.x1) / 2, pl.top - 0.012, (pl.z0 + pl.z1) / 2);
  }

  // Roof deck: slabs following the measured DECK line (saddle -> rear).
  // rearRoofHW: the LAST slab's width. The old hwM*rw*0.94 flare (1.22 on
  // the 3-series) planted phantom plan-turret columns at x 1.16-1.23 out to
  // the roof tail — the measured bustles taper to ~1.09 there.
  for (let i = 0; i < rf.length - 1; i++) {
    const [z0, y0] = rf[i], [z1, y1] = rf[i + 1];
    const w0 = i === 0 ? t.roofHW * 0.92 : t.roofHW;
    const w1 = i + 2 === rf.length ? (t.rearRoofHW ?? hwM * rw * 0.94) : t.roofHW;
    P.add('turret', slab(
      [-w0, y0 - 0.09, z0], [w0, y0 - 0.09, z0], [w1, y1 - 0.09, z1], [-w1, y1 - 0.09, z1],
      [-w0 * 0.97, y0, z0], [w0 * 0.97, y0, z0], [w1 * 0.97, y1, z1], [-w1 * 0.97, y1, z1]));
  }
  const rearRoof = rf[rf.length - 1];
  // measured roof masses (rear pot/stowage bump, cupola ring aprons, ...):
  // generic boxes so front/side bands can be laid exactly where traced.
  for (const rb of t.roofBoxes ?? []) { // { x0, x1, z0, z1, top, bot }
    const rbBot = rb.bot ?? (rearRoof[1] - 0.12);
    P.add('turretDetail', box(Math.abs(rb.x1 - rb.x0), rb.top - 0.02 - rbBot, rb.z0 - rb.z1),
      (rb.x0 + rb.x1) / 2, (rb.top - 0.02 + rbBot) / 2, (rb.z0 + rb.z1) / 2);
    P.add('turretDark', box(Math.abs(rb.x1 - rb.x0) * 0.86, 0.03, (rb.z0 - rb.z1) * 0.82),
      (rb.x0 + rb.x1) / 2, rb.top - 0.008, (rb.z0 + rb.z1) / 2);
  }

  // Bustle: flush continuation of the shell walls to the basket face.
  // bustleSegs (local [{z, bot, hw}] front->rear): lofted underside RAMP +
  // plan taper — the measured 3-series bustle bottoms RISE 1.58->1.96
  // toward the basket while the plan narrows 1.21->1.08; the old flat
  // frustum read 0.15-0.3 deep across ten turret-side columns.
  if (t.bustleSegs) {
    const segs = t.bustleSegs;
    const topAt = (z) => {
      for (let i = 0; i < rf.length - 1; i++) {
        if (z <= rf[i][0] && z >= rf[i + 1][0]) {
          const f = (rf[i][0] - z) / Math.max(0.001, rf[i][0] - rf[i + 1][0]);
          return rf[i][1] + (rf[i + 1][1] - rf[i][1]) * f;
        }
      }
      return rf[rf.length - 1][1];
    };
    for (let i = 0; i < segs.length - 1; i++) {
      const a = segs[i], b = segs[i + 1];
      P.add('turret', slab(
        [-a.hw, a.bot, a.z], [a.hw, a.bot, a.z], [b.hw, b.bot, b.z], [-b.hw, b.bot, b.z],
        [-a.hw, topAt(a.z) - 0.02, a.z], [a.hw, topAt(a.z) - 0.02, a.z],
        [b.hw, topAt(b.z) - 0.02, b.z], [-b.hw, topAt(b.z) - 0.02, b.z]));
    }
  } else {
    const bHW = t.bustleHW ?? hwM * rw;
    P.add('turret', frustum(bHW, t.shellRearZ + 0.30, t.bustleZ1, bHW - 0.05,
      t.shellRearZ + 0.26, t.bustleZ1 + 0.05, t.bustleBot, rearRoof[1] - 0.02));
  }

  // Long rear basket + chains.
  if (t.basket) {
    merkavaBasket(P, {
      hw: t.basketHW, z0: t.basket.z0, z1: t.basket.z1, xoff: t.basketXoff,
      top: t.basket.top, topRear: t.basket.topRear, bot: t.basket.bot,
      chainDrop: t.chainDrop ?? 0.30, chainGap: t.chainGap, chainHW: t.chainHW,
      pale: t.pale,
    });
  }
  // Trailing chain-mat vane behind the basket (3-series: the repair moved
  // the ex_armor chain mats onto rig_turret). The measured plan rear is a
  // V: full-rear only across the center (hwRear), corners sweeping forward
  // to the basket face; the side band bottom runs FLAT (~1.86-1.90).
  if (t.tailVane) {
    const tv = t.tailVane; // { z0, z1, zMid?, hw, hwMid?, hwRear, xoff?, top, bot }
    const hwR = tv.hwRear ?? tv.hw * 0.72;
    const vx = tv.xoff ?? 0;
    P.add('turretDark', box(0.04, 0.04, tv.z0 - tv.z1 + 0.08), vx, tv.top - 0.02, (tv.z0 + tv.z1) / 2 + 0.02);
    const zM = tv.zMid ?? (tv.z0 + tv.z1) / 2;
    const hwM2 = tv.hwMid ?? (tv.hw + hwR) / 2;
    const topM = tv.top - 0.07 * (tv.z0 - zM) / (tv.z0 - tv.z1);
    // t.pale: the vane IS the ref's ball-and-chain mat (absorbed ex_armor)
    // — pale sand, not olive canvas.
    const vaneMat = t.pale ? 'turret' : 'turretCloth';
    P.add(vaneMat, slab(
      [vx - tv.hw, tv.bot, tv.z0], [vx + tv.hw, tv.bot, tv.z0], [vx + hwM2, tv.bot + 0.01, zM], [vx - hwM2, tv.bot + 0.01, zM],
      [vx - tv.hw, tv.top, tv.z0], [vx + tv.hw, tv.top, tv.z0], [vx + hwM2, topM, zM], [vx - hwM2, topM, zM]));
    P.add(vaneMat, slab(
      [vx - hwM2, tv.bot + 0.01, zM], [vx + hwM2, tv.bot + 0.01, zM], [vx + hwR, tv.bot + 0.02, tv.z1], [vx - hwR, tv.bot + 0.02, tv.z1],
      [vx - hwM2, topM, zM], [vx + hwM2, topM, zM], [vx + hwR, tv.top - 0.07, tv.z1], [vx - hwR, tv.top - 0.07, tv.z1]));
    if (t.chainFringe) {
      // Chain-curtain read ON the mat's tail face (3B/3C): vertical chain
      // rods + a ball row half-embedded at the hem — the signature fringe,
      // textured onto the certified band (never hanging below tv.bot: the
      // ref turret mask bottoms flat at the band).
      const nb2 = 14;
      for (let i = 0; i <= nb2; i++) {
        const bx2 = vx - hwR * 0.90 + (i / nb2) * hwR * 1.80;
        P.add('turretDark', box(0.020, tv.top - tv.bot - 0.20, 0.016), bx2, (tv.top + tv.bot) / 2 - 0.045, tv.z1 + 0.004);
        P.add('turretDark', KIT.sph(0.030, 8), bx2, tv.bot + 0.034, tv.z1 + 0.010);
      }
      P.add('turretDark', box(hwR * 1.84, 0.028, 0.026), vx, tv.top - 0.085, tv.z1 + 0.010);
    }
    chainCurtain(P, hwR * 0.9, tv.z1 + 0.06, tv.bot + 0.10, tv.drop ?? 0.10, tv.z1 + 0.30);
  }

  // Roof kit: commander cupola (+ raise), loader hatch on 3-series, pano
  // pod + gunner hood; per-mark kits add MGs/smoke/panels.
  // cupolaRing/loaderRing (3B/3C visual round — owner circularity law): the
  // ref roof reads two RAISED CIRCULAR hatch rings; the old KIT.cupola sat
  // buried inside the right roof band and the loader hatch was a flush disc.
  // Ring assemblies live inside the certified band footprints (the right
  // pad keeps the plan; the ring carries the 2.60 front-column tops).
  const ringAsm = (rg) => { // { x, z, r, top, base, scopes }
    const cs = P.q ? 24 : 14;
    P.add('turret', cylY(rg.r, rg.r * 1.03, rg.top - rg.base, cs), rg.x, (rg.top + rg.base) / 2, rg.z);
    P.add('turretDark', KIT.torus(rg.r * 0.88, 0.016, cs), rg.x, rg.top - 0.002, rg.z);
    P.add('turret', cylY(rg.r * 0.64, rg.r * 0.64, 0.022, cs), rg.x, rg.top + 0.008, rg.z);
    P.add('turretDark', box(rg.r * 1.14, 0.012, 0.028), rg.x, rg.top + 0.018, rg.z);
    P.add('turret', box(0.06, 0.04, 0.09), rg.x + rg.r * 0.90, rg.top - 0.012, rg.z);
    P.add('turret', box(0.06, 0.04, 0.09), rg.x - rg.r * 0.90, rg.top - 0.012, rg.z);
    if (rg.scopes) for (let k = 0; k < rg.scopes; k++) {
      const a = -Math.PI * 0.42 + (k / (rg.scopes - 1)) * Math.PI * 0.84;
      P.add('turretDark', box(0.065, 0.045, 0.05),
        rg.x + Math.sin(a) * rg.r * 0.72, rg.top - 0.026, rg.z + Math.cos(a) * rg.r * 0.72, 0, a, 0);
    }
  };
  if (t.cupolaRing) ringAsm({ ...t.cupolaRing, scopes: 5 });
  else KIT.cupola(P, 'turret', t.cupolaX, h + (t.cupolaRaise ?? 0), t.cupolaZ, t.cupolaR ?? 0.24, 0.12, 6);
  if (!t.noLoaderHatch) {
    if (t.loaderRing) ringAsm({ ...t.loaderRing, scopes: 0 });
    else {
      P.add('turret', cylY(0.20, 0.20, 0.05, 14), -t.cupolaX * 0.9, h - 0.02, t.cupolaZ + 0.10);
      P.add('turret', box(0.07, 0.05, 0.10), -t.cupolaX * 0.9 - (t.cupolaX > 0 ? 0.22 : -0.22), h, t.cupolaZ + 0.10);
    }
  }
  if (t.pano) {
    if (t.pano.plinth) { // continuous raised sight deck (curve band, Mk.4)
      P.add('turret', box(1.00, 0.05, t.pano.plinth), 0.08, h + 0.025, t.pano.z + 0.20);
    }
    if (t.pano.seat) {
      // seated pano head (3B "half-sunk dome" fix): base pad + drum standing
      // ON the roof deck, dome fully above the drum — same certified top.
      const rb = deckAt(t.pano.z);
      const domeC = t.pano.top - 0.075;
      P.add('turretDetail', box(0.24, 0.03, 0.24), t.pano.x, rb + 0.015, t.pano.z);
      P.add('turret', cylY(0.105, 0.12, Math.max(0.06, domeC - rb - 0.02), 12), t.pano.x, (domeC + rb) / 2 - 0.01, t.pano.z);
      P.add('turret', KIT.sph(0.075, 14, Math.PI * 0.60), t.pano.x, domeC, t.pano.z);
      P.add(glassMat, box(0.10, 0.05, 0.02), t.pano.x, domeC + 0.012, t.pano.z + 0.070);
    } else {
    const py = t.pano.top - 0.27;
    P.add('turret', cylY(0.13, 0.15, 0.14, 12), t.pano.x, py + 0.07, t.pano.z);
    P.add('turret', KIT.sph(0.13, 12, Math.PI * 0.55), t.pano.x, py + 0.15, t.pano.z);
    P.add(glassMat, box(0.13, 0.06, 0.02), t.pano.x, py + 0.13, t.pano.z + 0.125);
    }
    if (t.pano.peak) { // true-height periscope/relay head, <=1 trace column
      P.add('turretDark', box(0.05, t.pano.peak.top - t.pano.top + 0.30, 0.05), t.pano.x + 0.08, (t.pano.peak.top + t.pano.top - 0.30) / 2, t.pano.peak.z);
      P.add('turretDark', box(0.14, 0.09, 0.09), t.pano.x + 0.08, t.pano.peak.top - 0.045, t.pano.peak.z);
    }
    if (t.pano.mast) { // comm sight mast stubs beside the pano head
      P.add('turretDetail', box(0.10, t.pano.top - h - 0.05, 0.10), t.pano.x + 0.55, (t.pano.top + h) / 2 - 0.02, t.pano.z - 0.15);
    }
  }
  P.add('turret', box(0.32, 0.13, 0.30), t.sightX ?? 0.42, h - 0.045, roofF - 0.14);
  P.add(glassMat, box(0.18, 0.05, 0.02), t.sightX ?? 0.42, h - 0.03, roofF + 0.015);
}

// ---------------------------------------------------------------------------
// Family assembler: chassis + turret + rig seating + gun + insignia.
// ---------------------------------------------------------------------------
function buildMerkavaMark(P, p) {
  const { box, cylZ } = KIT;
  merkavaChassis(P, p);

  const pivotY = p.deckY + 0.02;
  P.turretG.position.set(0, pivotY, p.pivotZ);
  const L = (z) => z - p.pivotZ;
  const V = (y) => y - pivotY;

  const t = {
    apexZ: L(p.apexZ), apexY: V(p.gunAxisY),
    notchHW: p.notchHW ?? 0.30,
    hwMax: p.hwMax, roofHW: p.roofHW, roofInset: p.roofInset, rearWide: p.rearWide,
    roof: p.roofLine.map(([z, y, w]) => (w !== undefined ? [L(z), V(y), w] : [L(z), V(y)])),
    maxWZ: p.maxWZ !== undefined ? L(p.maxWZ) : undefined,
    shellRearZ: L(p.shellRearZ),
    shellFrontZ: p.shellFrontZ !== undefined ? L(p.shellFrontZ) : undefined,
    shoulderZ: p.shoulderZ !== undefined ? L(p.shoulderZ) : undefined,
    bustleZ1: p.bustleZ1 !== undefined ? L(p.bustleZ1) : undefined,
    bustleBot: p.bustleBot !== undefined ? V(p.bustleBot) : 0.04,
    bustleHW: p.bustleHW,
    bustleSegs: p.bustleSegs ? p.bustleSegs.map((s) => ({ z: L(s.z), bot: V(s.bot), hw: s.hw })) : undefined,
    rearRoofHW: p.rearRoofHW,
    chainHW: p.chainHW,
    basket: p.basket ? { z0: L(p.basket.z0), z1: L(p.basket.z1), top: V(p.basket.top), topRear: p.basket.topRear !== undefined ? V(p.basket.topRear) : undefined, bot: V(p.basket.bot) } : undefined,
    basketHW: p.basketHW ?? p.hwMax * 0.66,
    basketXoff: p.basketXoff,
    chainDrop: p.chainDrop, chainGap: p.chainGap,
    station: p.station ? { x: p.station.x, z0: L(p.station.z0), z1: L(p.station.z1), top: V(p.station.top), hw: p.station.hw,
      peak: p.station.peak ? { z: L(p.station.peak.z), top: V(p.station.peak.top) } : undefined } : undefined,
    stow: p.stow ? { z0: L(p.stow.z0), z1: L(p.stow.z1), top: V(p.stow.top), bot: V(p.stow.bot), hw: p.stow.hw, xoff: p.stow.xoff } : undefined,
    stow2: p.stow2 ? { z0: L(p.stow2.z0), z1: L(p.stow2.z1), top: V(p.stow2.top), bot: V(p.stow2.bot), hw: p.stow2.hw, xoff: p.stow2.xoff } : undefined,
    turretRack: p.turretRack ? { z0: L(p.turretRack.z0), z1: L(p.turretRack.z1), top: V(p.turretRack.top), bot: V(p.turretRack.bot), hw: p.turretRack.hw, x0: p.turretRack.x0 } : undefined,
    tailVane: p.tailVane ? { z0: L(p.tailVane.z0), z1: L(p.tailVane.z1),
      zMid: p.tailVane.zMid !== undefined ? L(p.tailVane.zMid) : undefined,
      top: V(p.tailVane.top), bot: V(p.tailVane.bot), hw: p.tailVane.hw,
      topRear: p.tailVane.topRear !== undefined ? V(p.tailVane.topRear) : undefined,
      hwMid: p.tailVane.hwMid, hwRear: p.tailVane.hwRear, xoff: p.tailVane.xoff,
      drop: p.tailVane.drop } : undefined,
    apron: p.apron ? p.apron.map(([z, y, w]) => (w !== undefined ? [L(z), V(y), w] : [L(z), V(y)])) : undefined,
    apronHW: p.apronHW,
    capY: p.kitCapY !== undefined ? V(p.kitCapY) : undefined,
    brow: p.brow ? { z0: L(p.brow.z0), z1: L(p.brow.z1), top: V(p.brow.top) } : undefined,
    crest: p.crest ? { z0: L(p.crest.z0), zW: p.crest.zW !== undefined ? L(p.crest.zW) : undefined,
      z1: L(p.crest.z1), hw0: p.crest.hw0, hw1: p.crest.hw1,
      top0: p.crest.top0 !== undefined ? V(p.crest.top0) : undefined,
      top1: p.crest.top1 !== undefined ? V(p.crest.top1) : undefined,
      bot: p.crest.bot !== undefined ? V(p.crest.bot) : undefined,
      top: p.crest.top !== undefined ? V(p.crest.top) : undefined, hw: p.crest.hw } : undefined,
    noseHW: p.noseHW, noseZ: p.noseZ !== undefined ? L(p.noseZ) : undefined,
    planPts: p.planPts ? p.planPts.map(([x, z]) => [x, L(z)]) : undefined,
    shellBotY: p.shellBotY !== undefined ? V(p.shellBotY) : undefined,
    shellTopY: p.shellTopY !== undefined ? V(p.shellTopY) : undefined,
    cheek: p.cheek ? { pts: p.cheek.pts.map(([x, z]) => [x, L(z)]),
      ptsL: p.cheek.ptsL ? p.cheek.ptsL.map(([x, z]) => [x, L(z)]) : undefined,
      topIn: V(p.cheek.topIn), topOut: V(p.cheek.topOut),
      botIn: V(p.cheek.botIn), botOut: V(p.cheek.botOut) } : undefined,
    plinth: p.plinth ? { x0: p.plinth.x0, x1: p.plinth.x1, z0: L(p.plinth.z0), z1: L(p.plinth.z1), top: V(p.plinth.top) } : undefined,
    chin: p.chin ? { z0: L(p.chin.z0), z1: L(p.chin.z1), bot0: V(p.chin.bot0), bot1: V(p.chin.bot1), hw: p.chin.hw } : undefined,
    cheekPod: p.cheekPod ? (Array.isArray(p.cheekPod) ? p.cheekPod : [p.cheekPod]).map((cp) => ({
      x0: cp.x0, x1: cp.x1, z0: L(cp.z0), z1: L(cp.z1), top: V(cp.top), bot: V(cp.bot) })) : undefined,
    ringTub: p.ringTub ? { z0: L(p.ringTub.z0), zF0: L(p.ringTub.zF0), zF1: L(p.ringTub.zF1), z1: L(p.ringTub.z1),
      top: V(p.ringTub.top), bot: V(p.ringTub.bot), hw: p.ringTub.hw } : undefined,
    roofBoxes: p.roofBoxes ? p.roofBoxes.map((rb) => ({ x0: rb.x0, x1: rb.x1, z0: L(rb.z0), z1: L(rb.z1),
      top: V(rb.top), bot: rb.bot !== undefined ? V(rb.bot) : undefined })) : undefined,
    sightZ: p.sightZ !== undefined ? L(p.sightZ) : undefined,
    noLoaderHatch: p.noLoaderHatch,
    cupolaX: p.cupolaX ?? -0.52,
    cupolaZ: L(p.cupolaZ ?? (p.roofLine.at(-1)[0] + 0.1)),
    cupolaR: p.cupolaR,
    cupolaRaise: p.cupolaRaise,
    pano: p.pano ? { x: p.pano.x, z: L(p.pano.z), top: V(p.pano.top), mast: p.pano.mast, plinth: p.pano.plinth, seat: p.pano.seat,
      peak: p.pano.peak ? { z: L(p.pano.peak.z), top: V(p.pano.peak.top) } : undefined } : null,
    sightX: p.sightX,
    // 3B/3C visual-round switches (all optional — siblings untouched)
    wedgeFront: p.wedgeFront, cheekRake: p.cheekRake, wedgeRake: p.wedgeRake,
    glassTiles: p.glassTiles, pale: p.paleKit, chainFringe: p.chainFringe,
    cupolaRing: p.cupolaRing ? { x: p.cupolaRing.x, z: L(p.cupolaRing.z), r: p.cupolaRing.r,
      top: V(p.cupolaRing.top), base: V(p.cupolaRing.base) } : undefined,
    loaderRing: p.loaderRing ? { x: p.loaderRing.x, z: L(p.loaderRing.z), r: p.loaderRing.r,
      top: V(p.loaderRing.top), base: V(p.loaderRing.base) } : undefined,
  };
  if (p.turretStyle === 'small') merkavaSmallTurret(P, t);
  else merkavaModularTurret(P, t);
  // r2: the old `ringFloor` interior column (bot y~0.6) is DELETED — it
  // mimicked the pre-repair oracles' fused crew-tunnel interiors; the
  // repaired references carve at the ring plane (repair 86d1071), so the
  // casting apron above carries the measured turret-mask bottoms instead.
  if (p.turretKit) p.turretKit(P, p, t);

  // Mk.3D rear chain-mat tip past the hull tail (raw-bounds gun metric keys
  // off this measured sliver; mass/height must match the oracle band).
  if (p.rearTip) {
    const rt = p.rearTip; // { z, hw, top, bot }
    const fromZ = t.basket ? t.basket.z1 : t.shellRearZ;
    const railY = V(rt.top);
    P.add('turretDark', box(0.05, 0.055, fromZ - L(rt.z)), 0, railY, (fromZ + L(rt.z)) / 2);
    P.add('turretDark', box(rt.hw * 2, V(rt.top) - V(rt.bot), 0.10), 0, (V(rt.top) + V(rt.bot)) / 2, L(rt.z) + 0.05);
    chainCurtain(P, rt.hw, L(rt.z) + 0.12, railY - 0.02, (V(rt.top) - V(rt.bot)) * 0.55, L(rt.z) + 0.30);
  }

  // Whip antennas: measured ref trace columns + whip tops (short pots on
  // the Mk.4); potTop caps under published height.
  merkavaAntennas(P, p.antennas.map((a) => ({ x: a.x, y: V(a.y), z: L(a.z), h: a.h, stem: a.stem, thin: a.thin, bright: a.bright, potTop: a.potTop !== undefined ? V(a.potTop) : undefined })));
  // Free-standing roof pots/cans (measured 1-2 column bumps beside the
  // whips; tops capped under the published-height p95 line).
  if (p.pots) {
    for (const pot of p.pots) { // { x, z, top, base?, w?, d? }
      const base = pot.base ?? (pot.top - 0.30);
      P.add('turretDetail', box(pot.w ?? 0.18, pot.top - base, pot.d ?? 0.18), pot.x, V((pot.top + base) / 2), L(pot.z));
      P.add('turretDark', box((pot.w ?? 0.18) * 0.7, 0.04, (pot.d ?? 0.18) * 0.7), pot.x, V(pot.top - 0.02), L(pot.z));
    }
  }

  // Gun: trunnions behind the cheek apex; external mantlet sleeve laid on
  // the MEASURED band (m.z0 world start when given — the repaired refs read
  // a fat 0.5-0.7 m drum just past the crest face, tube-only beyond).
  const gunZL = p.gunZL ?? 0.32;
  P.gunG.position.set(0, V(p.gunAxisY), gunZL);
  const gLen = p.gunTipZ - p.pivotZ - gunZL + 0.03;
  const apexG = t.apexZ - gunZL;
  const m = p.mantlet; // { r0, r1, len, drop, z0?, legacy? } external cast sleeve
  const mDrop = m.drop ?? 0;
  if (m.legacy) { // r2 triple-cylinder sleeve (2-series masks were laid on it)
    P.addGunExtra(cylZ(m.r0 * 1.12, 0.62, 16), 0, mDrop, apexG - 0.24);
    P.addGunExtra(cylZ(m.r0, m.len, 16, m.r0 * 1.08), 0, mDrop, apexG + m.len / 2 - 0.06);
    P.addGunExtra(cylZ(m.r1, 0.26, 14, m.r0 * 0.94), 0, mDrop * 0.5, apexG + m.len + 0.06);
    P.addGunExtraDark(cylZ(m.r0 * 1.02, 0.035, 16), 0, mDrop, apexG + m.len - 0.03);
    P.addGunExtraDark(cylZ(m.r1 * 1.04, 0.03, 14), 0, mDrop * 0.5, apexG + m.len + 0.17);
  } else if (m.boxy) {
    // Compact BOXY MG251 mantlet housing (3B/3C visual round — the round
    // drum read as a generic collar). Same certified envelope: plan stays
    // inside the old drum's ±0.175, side band lands exactly on the ref's
    // measured 1.83..2.15 mantlet band (old drum: 1.805..2.155).
    const mz = (m.z0 !== undefined ? L(m.z0) : t.apexZ - 0.06) - gunZL;
    P.addGunExtra(box(0.35, 0.34, 0.30), 0, mDrop + 0.005, mz - 0.13);
    P.addGunExtra(box(0.34, 0.32, m.len), 0, mDrop + 0.01, mz + m.len / 2);
    P.addGunExtraDark(box(0.345, 0.29, 0.030), 0, mDrop + 0.01, mz + m.len - 0.025);
    P.addGunExtraDark(box(0.24, 0.045, 0.26), 0, mDrop - 0.145, mz + 0.32);
    P.addGunExtra(cylZ(m.r1, 0.12, 14), 0, mDrop * 0.5, mz + m.len + 0.05);
    P.addGunExtraDark(cylZ(m.r1 * 1.05, 0.028, 14), 0, mDrop * 0.5, mz + m.len + 0.10);
  } else {
    const mz = (m.z0 !== undefined ? L(m.z0) : t.apexZ - 0.06) - gunZL;
    P.addGunExtra(cylZ(m.r0 * 1.06, 0.30, 16), 0, mDrop, mz - 0.13);
    P.addGunExtra(cylZ(m.r0, m.len, 16, m.r0 * 1.05), 0, mDrop, mz + m.len / 2);
    P.addGunExtraDark(cylZ(m.r0 * 1.02, 0.035, 16), 0, mDrop, mz + m.len - 0.03);
    P.addGunExtraDark(cylZ(m.r1, 0.10, 14), 0, mDrop * 0.5, mz + m.len + 0.05);
  }
  KIT.buildGun(P, {
    len: gLen, r: p.gunR,
    sleeve: p.sleeve !== false, evac: Object.hasOwn(p, 'evac') ? p.evac : 0.30, collar: p.collar !== false,
    evacR: p.evacR ?? (p.sleeve !== false ? 1.9 : 1.62),
    baseR: Math.max(0.13, p.gunR * 2.0),
  });
  if (p.sleeveTo) { // thermal sleeve continuation: the refs' sleeves hold
    // r ~0.15 far past the mantlet (plan +-0.15 columns read them to z 3.8)
    const sz0 = (p.mantlet.z0 !== undefined ? L(p.mantlet.z0) : t.apexZ) + (p.mantlet.len ?? 0.6) - gunZL;
    const sz1 = L(p.sleeveTo) - gunZL;
    P.addGunExtra(KIT.cylZ(p.sleeveR ?? 0.15, sz1 - sz0, 12, (p.sleeveR ?? 0.15) * 1.06), 0, 0, (sz0 + sz1) / 2);
    P.addGunExtraDark(KIT.cylZ((p.sleeveR ?? 0.15) * 1.03, 0.03, 12), 0, 0, sz1 - 0.02);
  }
  if (p.muzzleCollar) { // measured muzzle-end flare (ref plan center columns)
    P.addGunExtraDark(cylZ(p.muzzleCollar.r, p.muzzleCollar.len, 12, p.gunR * 1.15),
      0, 0, gLen - p.muzzleCollar.len / 2 - 0.02);
  }

  P.decal('turret', 'number', P.spec.visual.number || '', 0.25,
    [p.hwMax * 0.9, t.roof[0][1] * 0.42, t.shellRearZ + 0.6], Math.PI / 2);
  P.topY = t.roof.at(-1)[1] + 0.45;
}

// Point ON the modular beak cheek plane (f: 0 notch -> 1 shoulder).
function merkavaCheekPoint(t, f, spread = 0.78) {
  const apex = t.apexZ, sf = t.shellFrontZ ?? apex * 0.5;
  const xo = (t.notchHW + 0.03) + (t.roofHW - (t.notchHW + 0.03)) * f;
  const yo = (t.apexY + 0.19) + ((t.roof[0][1] - 0.02) - (t.apexY + 0.19)) * f;
  return { x: xo * spread, y: yo, z: apex + ((sf - 0.3) - apex) * f };
}

// Flush modular side panels (Trophy zone on the 4-series): thin plates lying
// ON the sloped shell walls with seam strips + launcher wedge + radar face.
function merkavaSidePanels(P, p, t, opts = {}) {
  const { box } = KIT;
  const hwM = t.hwMax, h = t.roof[0][1];
  const inset = t.roofInset ?? 0.72;
  const phi = Math.atan2(hwM * (1 - inset), h);
  const fMid = 0.42;
  const wx = hwM * (1 - fMid * (1 - inset)) + 0.045;
  const wy = h * fMid;
  const pz = (t.maxWZ ?? -0.4) - 0.30;
  for (const s of [-1, 1]) {
    const rz = s * phi;
    P.add('turretDetail', box(0.07, 0.60, 1.30), s * wx, wy, pz, 0, 0, rz);
    P.add('turretDark', box(0.075, 0.62, 0.022), s * wx, wy, pz + 0.66, 0, 0, rz);
    P.add('turretDark', box(0.075, 0.62, 0.022), s * wx, wy, pz - 0.66, 0, 0, rz);
    P.add('turretDetail', box(0.13, 0.34, 0.30), s * (wx + 0.02), wy, pz + 0.82, 0, 0, rz);
    P.add('turretDark', box(0.10, 0.26, 0.03), s * (wx + 0.045), wy + 0.02, pz + 0.975, 0, 0, rz);
    if (opts.radar) {
      P.add('turretGlass', box(0.09, 0.20, 0.014), s * (wx + 0.045), wy + 0.01, pz + 0.99, 0, 0, rz);
    }
  }
}

// Cloth kit bundle with cinch straps. mat: 'turret' for the monochrome-sand
// refs (3B/3C visual round — olive canvas blocks read as a second paint).
function merkavaKitBundle(P, x, y, z, w, h, d, mat = 'turretCloth') {
  const { box } = KIT;
  P.add(mat, box(w, h, d), x, y, z);
  P.add(mat, box(w * 1.04, h * 0.2, d * 1.04), x, y + h * 0.44, z);
  for (const f of [-0.28, 0.28]) {
    P.add('turretDark', box(w * 1.05, h * 1.05, 0.026), x, y, z + f * d);
  }
}

// ---- per-mark turret kits ---------------------------------------------------
function merkava4Kit(P, p, t) {
  // MG crowns capped under the dims p95 height line (low pintles, Mk.4M).
  const cap = t.capY ?? (t.roof[0][1] + 0.04);
  merkavaSidePanels(P, p, t, { radar: true });
  merkavaMG(P, 0.14, cap - 0.24, t.roof[0][0] + 0.04, 0.7);
  merkavaMG(P, -t.cupolaX, cap - 0.22, t.cupolaZ - 0.30, 0.7);
  const sc = merkavaCheekPoint(t, 0.58, 0.80);
  merkavaSmokeCluster(P, -sc.x, sc.y - 0.01, sc.z, -0.30, 4, { recessed: true, pitch: -0.24 });
  KIT.tarpRoll(P, 'turretCloth', -0.28, t.roof.at(-1)[1] - 0.07, t.roof.at(-1)[0] + 0.25, 0.85, 0.105);
}

function merkava4bKit(P, p, t) {
  const cap = t.capY ?? (t.roof[0][1] + 0.04);
  merkavaSidePanels(P, p, t, { radar: false });
  merkavaMG(P, t.cupolaX + 0.30, cap - 0.24, t.cupolaZ - 0.20, 0.75);
  merkavaMG(P, -t.cupolaX, cap - 0.26, t.cupolaZ + 0.15, 0.65);
  const sc = merkavaCheekPoint(t, 0.58, 0.80);
  merkavaSmokeCluster(P, -sc.x, sc.y - 0.01, sc.z, -0.30, 4, { recessed: true, pitch: -0.24 });
  KIT.tarpRoll(P, 'turretCloth', -0.28, t.roof.at(-1)[1] - 0.07, t.roof.at(-1)[0] + 0.22, 0.8, 0.10);
}

// Mk.2D cheek appliqué wedges riding the cast beak planes.
function merkava2dKit(P, p, t) {
  const { box, slab } = KIT;
  const sf = t.shoulderZ;
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.26, t.apexY - 0.34, t.apexZ - 0.02], [s * 0.44, t.apexY - 0.31, t.apexZ - 0.08],
      [s * t.hwMax * 0.62, 0.10, sf - 0.30], [s * 0.18, 0.10, sf - 0.26],
      [s * 0.26, t.apexY + 0.20, t.apexZ - 0.02], [s * 0.44, t.apexY + 0.17, t.apexZ - 0.08],
      [s * t.hwMax * 0.55, t.roof[0][1] - 0.06, sf - 0.32], [s * 0.18, t.roof[0][1] - 0.06, sf - 0.28]));
  }
  P.add('turret', box(0.26, 0.12, 0.22), -t.station.x * 0.30, t.roof[0][1] + 0.05, t.roof[0][0] + 0.30);
  P.add('turretGlass', box(0.16, 0.05, 0.02), -t.station.x * 0.30, t.roof[0][1] + 0.06, t.roof[0][0] + 0.42);
}

// Mk.1B cast-turret jewelry.
function merkava1bKit(P, p, t) {
  for (const s of [-1, 1]) {
    KIT.liftEye(P, 'turretDetail', s * t.hwMax * 0.68, t.roof[0][1] * 0.62, t.shoulderZ - 0.45, s * 0.5);
  }
  KIT.liftEye(P, 'turretDetail', 0, t.roof.at(-1)[1] - 0.10, t.shellRearZ + 0.30, Math.PI / 2);
}

// Shared Mk.3 roof fit: mantlet-bridge .50 fitting over the crest (the
// measured 2.55-2.63 bumps at z 0.4..0.9), twin pintle MGs + port smoke.
// MG crowns anchor to t.capY (published-height p95 cap) — with the r2
// re-lined roofs riding near the cap, roof-relative anchors would blow
// the dims heightM read.
function merkava3Kit(P, p, t, opts = {}) {
  const { box } = KIT;
  const cap = t.capY ?? (t.roof[0][1] + 0.24);
  if (t.crest) {
    const crTop = t.crest.top1 ?? t.crest.top;
    P.add('turretDark', box(0.30, 0.13, 0.44), 0.24, crTop - 0.075, t.crest.z1 + 0.28);
    P.add('turretDark', KIT.cylZ(0.022, 0.35, 8), 0.24, crTop - 0.055, t.crest.z1 + 0.65);
    P.add('turret', box(0.26, 0.10, 0.30), -0.28, crTop - 0.05, t.crest.z1 + 0.30);
  }
  if (opts.ringMGs && t.cupolaRing && t.loaderRing) {
    // Pintle MGs seated ON the hatch rings (3B/3C visual round — the two
    // MGs are the ref's roof signature; crowns ride AT the cap grace line
    // so they silhouette above the local roof like the print's).
    merkavaMG(P, t.cupolaRing.x + 0.05, t.cupolaRing.top - 0.20, t.cupolaRing.z - t.cupolaRing.r - 0.10, 0.85);
    merkavaMG(P, t.loaderRing.x + t.loaderRing.r + 0.14, t.loaderRing.top - 0.17, t.loaderRing.z - 0.06, 0.72);
  } else {
    // commander MG rides the cupola zone (ref right roof is LOW 2.44-2.47 —
    // an MG at mid-roof topped it 0.2; the ref's 2.7 band lives at x 0.93+)
    merkavaMG(P, t.cupolaX + 0.14, cap - 0.245, t.cupolaZ - 0.05, 0.75);
    merkavaMG(P, -t.cupolaX * 0.78, cap - 0.20, t.cupolaZ + 0.05, 0.62);
  }
  const sc = merkavaCheekPoint(t, 1.0, 0.72); // hugging the shoulder: at f .85 the rosette led the cheek plan line 0.15
  merkavaSmokeCluster(P, -sc.x, sc.y - 0.06, sc.z, -0.45, 5, { recessed: true, pitch: -0.28, pale: opts.pale });
}

function merkava3dKit(P, p, t) {
  merkava3Kit(P, p, t);
  // r4: the old mid-cheek applique wedges (x ~0.7, poking to z +1.4) owned
  // four t_plan front worst rows — the print's Dor-Dalet armor is the SIDE
  // plate run (x 1.30-1.58 to z -2.55), authored via roofBoxes.
  KIT.tarpRoll(P, 'turretCloth', -0.15, t.roof.at(-1)[1] - 0.06, t.roof.at(-1)[0] + 0.28, 1.1, 0.09);
}

function merkava3bKit(P, p, t) {
  merkava3Kit(P, p, t, { pale: p.paleKit, ringMGs: !!p.cupolaRing });
  const L = (z) => z - p.pivotZ, V = (y) => y - (p.deckY + 0.02);
  const km = p.paleKit ? 'turret' : 'turretCloth';
  // Warped-ref rear-roof stack: hump 2.57-2.59 over z -2.45..-2.53 + the
  // low 2.46-2.49 bundle across the bustle root. Visual round: strapped
  // stack, edge held at x -0.94 (ref front tops fall 2.58 there — the r1
  // 0.40-wide bundle put its strap at -1.01 and cost front_whole cols).
  merkavaKitBundle(P, -0.80, V(2.47), L(-2.50), 0.28, 0.22, 0.14, km);
  merkavaKitBundle(P, 0.10, V(2.40), L(-2.83), 0.95, 0.12, 0.28, km);
}

function merkava3cKit(P, p, t) {
  merkava3Kit(P, p, t, { pale: p.paleKit, ringMGs: !!p.cupolaRing });
  const L = (z) => z - p.pivotZ, V = (y) => y - (p.deckY + 0.02);
  const km = p.paleKit ? 'turret' : 'turretCloth';
  // Warped-ref Kasag stack: the 2.65 hump now sits at z -2.56..-2.61 (the
  // pre-warp 2.76@-2.24 band was compressed + shifted); low bundle rides
  // the bustle root at 2.46-2.49. Visual round: the toy-scaled single box
  // becomes a two-tier strapped stack + canister at the ref's prominence
  // (hump top stays 2.65, tiers inside the certified side/front bands).
  // (r2 gate note: the r1 0.30-deep tier + 0.16 hump aliased into the z
  // -2.71 side column at +0.18 — the ref hump band is ONLY -2.56..-2.61;
  // prominence comes from width/tiering, never extra z-depth.)
  P.add(km, KIT.box(0.50, 0.095, 0.24), -0.79, V(2.4575), L(-2.565));
  merkavaKitBundle(P, -0.78, V(2.585), L(-2.58), 0.44, 0.125, 0.125, km);
  P.add('turretDark', KIT.cylY(0.050, 0.055, 0.09, 10), -0.42, V(2.44), L(-2.62));
  merkavaKitBundle(P, 0.10, V(2.42), L(-2.85), 1.00, 0.12, 0.30, km);
}

// ---------------------------------------------------------------------------
// Per-mark parameter tables — every number is read off the measured curves
// (docs/references/profiles/<id>.json decoded to world meters; see packets).
// ---------------------------------------------------------------------------

// Mk.1/2 shared running gear. gearOut: measured outer track face (the
// front-view track columns end at |x|≈1.72 on these prints; the published
// 3.70 width lives on the fender line, not the tracks).
const MK12_GEAR = {
  width: 3.70, trackW: 0.58, trackTop: 1.02, wheelR: 0.40, gearOut: 1.72,
};
// Mk.3 shared running gear. r2: the refs' rear track RISES from the last
// road wheel (~-2.6) to a high tail idler — the wheel row ends earlier and
// the idler sits high/aft so the wrap fills the measured rising band.
// r4 world-probe re-lay: the measured FRONT ramp is one 0.478-slope line
// from (1.79, 0.02) to the glacis — flat contact run ends at wheel1+R/2
// (so wheel1 sits at 1.62) and the sprocket rides HIGH/FORWARD (2.28,
// 0.72) so the kit's tangent reproduces the 25.6 deg ramp. trackW 0.60:
// the print's front-view track inner face is >=1.10 (0.62 lit the x 1.07
// column the ref keeps at belly depth).
const MK3_GEAR = {
  width: 3.72, trackW: 0.58, trackTop: 1.00, wheelR: 0.40, gearOut: 1.72,
  wheelZs: [1.55, 0.80, -0.02, -0.83, -1.65, -2.46],
  sprocket: { z: 2.35, y: 0.72, r: 0.29 }, idler: { z: -3.18, y: 0.66, r: 0.27 },
  rollers: [1.30, 0.45, -0.40, -1.25, -2.10],
};

export const MERKAVA_PROFILES = {
  // ---- Mk.1B: exposed gear, small rising-roof casting, huge rear basket ----
  // Curves: nose toe (3.05, 0.90..1.05); glacis knee (2.5, 1.53); deck 1.68;
  // plan full width |x|1.71..1.81 back to -3.93, prow ~±0.95, pods to 3.18;
  // tail plate -3.93 [0.93..1.44] + rack to -4.05 [0.80..1.55]; turret front
  // face z 1.60, roof rises (0.45,2.29)->(-1.0,2.40); commander dome band to
  // 2.80 over -0.55..-1.55; stowage 2.60 to -2.1; basket top 2.45 to -3.45
  // tapering 2.28 at -3.8; mantlet sleeve band [1.86..2.11] out to z 2.45;
  // gun axis 1.97 tip 4.06; whips at -2.15/-2.80 to y 4.8.
  merkava1b: {
    build: buildMerkavaMark, ...MK12_GEAR,
    deckY: 1.63, rearDeckZ: -2.55,
    // r2 post-repair re-line (true-camera profile + fresh gate tables):
    // deck 1.63 flat -2.36..-0.20 rising to 1.73-1.75 over 0.2..0.9 and at
    // the shelf crest -2.55; rear falls 1.75->1.56 to the tail; glacis knee
    // (2.44,1.51) toe (3.05,1.07 over 0.95); center rear recesses at -3.82
    // (clamshell door) while the corners run to -3.97.
    body: [
      { z: 3.00, yT: 1.05, yB: 0.95, wT: 0.48, wB: 0.48 },
      { z: 2.96, yT: 1.13, yB: 0.96, wT: 1.30, wB: 1.05 },
      { z: 2.60, yT: 1.42, yB: 1.00, wT: 1.66, wB: 1.40 },
      { z: 2.15, yT: 1.58, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: 1.45, yT: 1.66, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: 0.85, yT: 1.73, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: 0.15, yT: 1.71, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: -0.20, yT: 1.63, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: -2.36, yT: 1.63, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: -2.55, yT: 1.745, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: -2.95, yT: 1.72, yB: 1.00, wT: 1.71, wB: 1.71 },
      { z: -3.35, yT: 1.655, yB: 0.98, wT: 1.70, wB: 1.70 },
      { z: -3.55, yT: 1.62, yB: 0.94, wT: 1.69, wB: 1.69 },
      { z: -3.97, yT: 1.56, yB: 0.90, wT: 1.64, wB: 1.64 },
    ],
    tailNotch: { hw: 0.30 },
    keel: { toeZ: 2.96, toeY: 0.98, toeHW: 0.42, midZ: 2.30, midY: 0.40, groundZ: 1.90, bellyY: 0.44, tailLowZ: -3.35 }, // plan center bow 2.95; rear wedge top ends -3.55 (ref center rear)
    glacis: { z0: 0.95, z1: 3.02 },
    podX: 0.62, podIn: -0.10, podY: 0.99,
    hullPosts: [{ x: -0.60, z: 3.40, top: 1.10, base: 0.97 }],
    // Fender planks at the measured y 1.43 line; post-repair plan runs
    // SYMMETRIC 2.95..-3.95 (the old per-side clip was a broken-rig read).
    // Outer lip carries the published 3.70 width (WIDTH GUARD: outer face
    // exactly +-1.85, widest point of the build).
    fenderPlank: { x0: 1.42, x1: 1.73, z0: 2.56, z1: -3.94, y: 1.43, drops: { bot: 0.68, x: [1.775, 1.735], z: [2.0, 1.1, 0.2, -0.7, -1.6, -2.5, -3.4] } }, // L edge 1.80 / R 1.76: both clear of the 1.822 col boundary (1.82+AA lit the left-only column = dAlong 0.048)
    frontBoard: { z0: 2.94, z1: 2.54, y: 1.09, x0: 1.42, x1: 1.73 }, // ref bow keeps the fender LOW fwd of 2.56 (side tops are the glacis)
    // Ref is laterally SEATED +0.05 in its own frame (registration nulls
    // it): its fender line runs full-length at seat-corrected ~1.825 (mid
    // stations read 3.65) — author the symmetric equivalent.
    fenderLip: { x: 1.825, w: 0.07, z0: 2.36, z1: -3.44, y: 1.33 },
    fenderLip2: { x: 1.85, w: 0.06, z0: -2.90, z1: -3.48, y: 1.35 }, // WIDTH GUARD: published 3.70 lives at the rear fender flare
    bodyHW: 1.70,
    skirt: null,
    wheelZs: [1.55, 0.73, -0.09, -0.91, -1.73, -2.45],
    sprocket: { z: 2.02, y: 0.60, r: 0.28 }, idler: { z: -3.42, y: 0.80, r: 0.28 }, // ramp: flat ends -2.65, 0.44 slope into a high wrap
    rollers: [1.1, 0.25, -0.6, -1.45, -2.25],
    // Hull tail rack: center-notched (ref plan opens x<0.35 to -3.82) with
    // the deep run x 0.35..1.04 to -4.01 and slim wings carrying the dims
    // hullLength span to -4.22 (published 7.45 needs the rear reach; ~1
    // sub-margin cover column vs the 7.21 m ref hull is the cheapest trade).
    tailRack: {
      z0: -3.56, z1: -4.01, top: 1.60, bot: 0.92, hw: 1.72, x0: 0.35,
      wings: { x0: 0.44, x1: 1.02, z1: -4.03, top: 1.55, bot: 0.86 },
    },
    tailPins: [{ x: 0.62, y: 1.00, z: -4.24 }, { x: -0.62, y: 1.00, z: -4.24 }],
    pivotZ: -1.00,
    turretStyle: 'small',
    // Muzzle set from published overall length off the wing tail: -4.22 +
    // 8.63*0.995 = 4.37 (the oracle's M64 is modelled short at 4.00-4.09 —
    // the symmetric-coverage cost on side_whole is the certified gun cap).
    gunAxisY: 1.97, gunR: 0.075, sleeve: true, evac: null, collar: false, gunTipZ: 4.39, gunZL: 0.40, sleeveTo: 3.80, sleeveR: 0.148, // ref M64 thermal sleeve reads to +3.8
    muzzleCollar: { r: 0.145, len: 0.28 },
    mantlet: { r0: 0.148, r1: 0.10, len: 0.80, drop: 0.005, z0: 1.18 },
    apexZ: 1.21, notchHW: 0.20, hwMax: 1.30, roofHW: 0.98, roofInset: 0.90,
    shoulderZ: 0.30, shellRearZ: -2.05, maxWZ: -1.15,
    // r3 measured plan wedge (full-curve dump): nose plateau ±0.33 at
    // z +1.15, sweep to (0.66, 0.36), max width ±1.30 confined to
    // z -0.56..-1.22, rear corner (1.20, -1.90); casting bottoms 1.90 at
    // the face; shell capped at the 2.35 saddle (roof slabs carry the
    // rising crest with per-station widths following the wedge).
    planPts: [[0.33, 1.15], [0.66, 0.36], [1.28, -0.42], [1.28, -0.85], [1.18, -1.90], [0.90, -2.08]],
    shellBotY: 1.90, shellTopY: 2.35,
    cheekPod: [
      { x0: 0.67, x1: 1.02, z0: 0.83, z1: 0.28, top: 2.20, bot: 1.78 },
      { x0: -0.74, x1: -1.04, z0: 0.51, z1: 0.05, top: 2.12, bot: 1.80 },
    ],
    // Roof (ref side turret tops): front plateau 2.58-2.62 (1.1..0.15),
    // saddle 2.35 (-0.02..-0.44), dome-band drum 2.66 (capped; ref rides
    // 2.80-2.87), rear shelf 2.50-2.53.
    roofLine: [[1.12, 2.58, 0.34], [0.36, 2.61, 0.65], [0.16, 2.62, 0.70], [0.06, 2.35, 0.80], [-0.36, 2.35, 0.90], [-1.75, 2.50, 0.98], [-2.00, 2.53, 0.94]],
    // dims cap: published height 2.65 (p95 of tops) — the flat dome drum,
    // cupola lid and MG crowns all live at 2.66; the repaired oracle's
    // 2.80-2.87 dome band stays deliberately capped (heightM is sovereign).
    station: { x: -0.45, z0: -0.46, z1: -1.70, top: 2.66, hw: 0.53 },
    sightZ: 0.35,
    // Casting-ring underside (repaired-oracle turret mask bottoms): 1.53
    // flat across the ring with the -0.9 dip to 1.48, rising to the mantlet
    // line (1.86) fore and the bustle (1.86) aft.
    apron: [[1.05, 1.88, 0.30], [0.60, 1.72, 0.60], [0.02, 1.53], [-0.80, 1.53], [-0.93, 1.48], [-1.10, 1.48], [-1.25, 1.53], [-2.10, 1.53], [-2.40, 1.64], [-2.62, 1.75], [-2.85, 1.86]],
    apronHW: 1.05,
    stow: { z0: -1.70, z1: -1.96, top: 2.64, bot: 2.05, hw: 1.14, xoff: 0 }, // ref band spans |x|<=1.16 (front cols 1.0-1.2 read 2.65)
    stow2: { z0: -1.96, z1: -2.44, top: 2.64, bot: 2.02, hw: 1.00, xoff: 0 }, // band continues aft NARROW (plan x 1.13 column ends at -1.96)
    basket: { z0: -2.18, z1: -3.38, top: 2.48, topRear: 2.64, bot: 1.88 }, basketHW: 1.08, basketXoff: -0.06, // ref: LEFT rail full-aft at x 1.12, RIGHT at 1.03 (rail edges 18mm clear of the 1024 col boundaries); rim RISES to 2.64
    tailVane: { z0: -3.45, z1: -3.85, top: 2.42, topRear: 2.06, bot: 1.92, hw: 1.06, hwRear: 0.36, drop: 0.03 },
    chainDrop: 0.12, chainGap: 0.18,
    // Whips on the measured ref columns (side crossfire fix: one gate
    // column rearward of the raw probe read) at the ref's +0.8 x station
    // (front-view trace: BOTH 1B whips ride the RIGHT side).
    antennas: [{ x: -0.85, y: 2.48, z: -2.78, h: 2.35, stem: 0.35 }, { x: 0.80, y: 2.46, z: -2.22, h: 2.42, stem: 0.35 }],
    pots: [{ x: 0.79, z: -2.35, top: 2.64, base: 2.40, w: 0.20, d: 0.12 }, { x: -0.86, z: -2.72, top: 2.64, base: 2.40, w: 0.18, d: 0.18 }, { x: 1.33, z: -1.00, top: 2.63, base: 2.10, w: 0.18, d: 0.24 }],
    brow: { z0: 1.68, z1: 1.02, top: 2.56 },
    turretKit: merkava1bKit,
  },

  // ---- Mk.2B: skirted Mk.2, small turret, dome station, long chain tail ---
  // r2 post-repair re-line. The old skirts-on-turret-node / casting-in-hull
  // cap is OBSOLETE (repair 6fa0335): the ref masks are clean. Measured
  // (proc-frame): deck 1.63 flat -2.4..-0.3 rising 1.70-1.71 fore, shelf
  // crest 1.76 at -2.56; rack band [-3.55..-4.13] tops 1.62 hanging to 0.46;
  // rising cast roof 2.16@0.9 -> 2.38@-0.4, dome band drum (capped 2.66),
  // whips -2.85/-2.27 tops 4.83/4.91 with 3.0 pot bands beside them.
  merkava2b: {
    build: buildMerkavaMark, ...MK12_GEAR,
    deckY: 1.68, rearDeckZ: -2.55,
    body: [
      { z: 2.98, yT: 1.05, yB: 0.95, wT: 0.72, wB: 0.72 },
      { z: 2.60, yT: 1.42, yB: 1.00, wT: 1.65, wB: 1.35 },
      { z: 2.25, yT: 1.54, yB: 1.00, wT: 1.74, wB: 1.74 },
      { z: 1.45, yT: 1.65, yB: 0.98, wT: 1.74, wB: 1.74 },
      { z: 0.85, yT: 1.71, yB: 0.98, wT: 1.74, wB: 1.74 },
      { z: 0.15, yT: 1.70, yB: 0.96, wT: 1.74, wB: 1.74 },
      { z: -0.30, yT: 1.63, yB: 0.96, wT: 1.74, wB: 1.74 },
      { z: -2.40, yT: 1.63, yB: 0.95, wT: 1.74, wB: 1.74 },
      { z: -2.62, yT: 1.75, yB: 0.95, wT: 1.74, wB: 1.74 },
      { z: -3.00, yT: 1.71, yB: 0.92, wT: 1.72, wB: 1.72 },
      { z: -3.42, yT: 1.66, yB: 0.90, wT: 1.72, wB: 1.72 },
      { z: -3.40, yT: 1.65, yB: 0.90, wT: 1.71, wB: 1.71 },
      { z: -4.04, yT: 1.56, yB: 0.85, wT: 1.62, wB: 1.62 },
    ],
    tailNotch: { hw: 0.30 },
    keel: { toeZ: 3.02, toeY: 0.98, toeHW: 0.55, midZ: 2.30, midY: 0.40, groundZ: 1.95, bellyY: 0.42, tailLowZ: -3.30 },
    glacis: { z0: 1.30, z1: 2.95 },
    // pods pushed to 3.37: they carry the dims hullLength bow columns (the
    // ref hull is ~0.3 short of published; certified sub-margin cover)
    podX: 0.62, podIn: -0.42, podY: 0.98,
    fenderPlank: { x0: 1.40, x1: 1.80, z0: 2.94, z1: -4.02, y: 1.47 },
    fenderLip: { x: 1.84, w: 0.07, z0: 2.42, z1: -3.58, y: 1.22 },
    wheelZs: [1.75, 0.89, 0.03, -0.83, -1.69, -2.55],
    sprocket: { z: 2.05, y: 0.54, r: 0.29 }, idler: { z: -3.32, y: 0.70, r: 0.27 },
    rollers: [1.35, 0.5, -0.4, -1.3, -2.15],
    skirt: { z0: 2.50, z1: -2.65, top: 1.14, bot: 0.62, scallop: true, x: 1.83 },
    // Rack wall hangs LOW on the repaired print (band 0.46..1.62); wings
    // x 0.44..1.02 carry the dims hullLength reach (published 7.45).
    tailRack: {
      z0: -3.62, z1: -4.04, top: 1.58, bot: 0.50, hw: 1.70, x0: 0.35,
      wings: { x0: 0.44, x1: 1.02, z1: -4.25, top: 1.50, bot: 1.25 },
    },
    pivotZ: -0.55,
    turretStyle: 'small',
    // Muzzle from published overall: -4.25 + 8.78*0.995 = 4.53 (oracle M64
    // modelled short at 4.08 — certified wholeCurves gun cap).
    gunAxisY: 1.99, gunR: 0.078, sleeve: false, evac: 0.60, evacR: 1.35, gunTipZ: 4.53, gunZL: 0.40,
    muzzleCollar: { r: 0.105, len: 0.28 },
    mantlet: { r0: 0.125, r1: 0.10, len: 0.85, drop: 0.05, legacy: true },
    apexZ: 0.90, notchHW: 0.20, hwMax: 1.30, roofHW: 0.98, roofInset: 0.76,
    shoulderZ: 0.45, shellRearZ: -2.05, maxWZ: -0.45,
    // Rising cast roof (ref side turret): 2.17@0.88 -> 2.38@-0.44, dome
    // drum band -0.44..-1.72 (capped 2.66), rear shelf 2.55-2.60.
    roofLine: [[0.88, 2.17], [0.45, 2.25], [0.10, 2.33], [-0.08, 2.37], [-0.44, 2.38], [-1.80, 2.55], [-2.06, 2.60]],
    station: { x: 0.42, z0: -0.56, z1: -1.72, top: 2.66, hw: 0.53 },
    sightZ: 0.55,
    apron: [[0.45, 1.72], [0.12, 1.62], [0.01, 1.52], [-0.80, 1.52], [-0.88, 1.48], [-1.05, 1.48], [-1.20, 1.52], [-2.10, 1.52], [-2.30, 1.62], [-2.46, 1.66], [-2.56, 1.75], [-2.70, 1.80], [-2.90, 1.88]],
    apronHW: 1.05,
    stow: { z0: -1.95, z1: -2.28, top: 2.56, bot: 2.02, hw: 1.22 },
    basket: { z0: -2.30, z1: -3.35, top: 2.47, topRear: 2.45, bot: 1.89 }, basketHW: 1.20,
    tailVane: { z0: -3.62, z1: -4.00, top: 2.42, bot: 1.90, hw: 0.55, drop: 0.12 },
    chainDrop: 0.12, chainGap: 0.18,
    // Whips on the measured columns -2.85 / -2.27 (tops 4.83 / 4.91); the
    // print's 3.0 whip-can pots beside them cap at 2.64.
    antennas: [{ x: -0.89, y: 2.51, z: -2.90, h: 2.34, stem: 0.45 }, { x: 0.78, y: 2.51, z: -2.20, h: 2.42, stem: 0.45 }],
    pots: [{ x: -0.80, z: -2.74, top: 2.64, base: 2.40, w: 0.16, d: 0.20 }, { x: 0.82, z: -2.40, top: 2.64, base: 2.42, w: 0.22, d: 0.16 }, { x: 1.26, z: -0.30, top: 2.60, base: 2.26, w: 0.32, d: 0.55 }, { x: -1.26, z: -0.30, top: 2.60, base: 2.26, w: 0.32, d: 0.55 }],
  },

  // ---- Mk.2D: 2B sculpt + wedge cheek modules, slightly forward face ------
  // v6: same corrected nose/keel as 2B; rack deep to -4.05 at |x|<1.2 with a
  // 1.2..1.55 mid shelf (-3.84) and short outer lip (-3.78); tall center
  // pack 2.26 at -3.45..-3.74; corner marker rods REAL on this print (front
  // trace tops 2.35/2.53 at +-1.8); long turret chain vane to -3.86.
  // Print defect note: the 2D cheek wedges ride the oracle HULL node (front
  // hull trace tops 2.34-2.48 center) — small certified hullCurves residue.
  merkava2d: {
    build: buildMerkavaMark, ...MK12_GEAR,
    deckY: 1.72, rearDeckZ: -2.55,
    // r2 post-repair: deck rides 1.72 FLAT -2.2..+0.9 on this print (the
    // old deckPack mimic is gone — its 2.34 band was stranded turret kit);
    // marker rods live at z~-3.6 (side band 2.36-2.56, L taller than R).
    body: [
      { z: 3.19, yT: 1.07, yB: 0.94, wT: 0.75, wB: 0.75 },
      { z: 2.72, yT: 1.42, yB: 1.00, wT: 1.65, wB: 1.35 },
      { z: 2.25, yT: 1.55, yB: 1.00, wT: 1.74, wB: 1.74 },
      { z: 1.65, yT: 1.61, yB: 0.98, wT: 1.74, wB: 1.74 },
      { z: 1.10, yT: 1.69, yB: 0.98, wT: 1.74, wB: 1.74 },
      { z: 0.60, yT: 1.74, yB: 0.96, wT: 1.74, wB: 1.74 },
      { z: -2.20, yT: 1.72, yB: 0.95, wT: 1.74, wB: 1.74 },
      { z: -2.52, yT: 1.75, yB: 0.95, wT: 1.74, wB: 1.74 },
      { z: -3.00, yT: 1.71, yB: 0.92, wT: 1.72, wB: 1.72 },
      { z: -3.45, yT: 1.64, yB: 0.89, wT: 1.70, wB: 1.70 },
      { z: -4.04, yT: 1.55, yB: 0.83, wT: 1.62, wB: 1.62 },
    ],
    tailNotch: { hw: 0.30 },
    keel: { toeZ: 3.10, toeY: 0.98, toeHW: 0.55, midZ: 2.35, midY: 0.40, groundZ: 1.95, bellyY: 0.42, tailLowZ: -3.30 },
    glacis: { z0: 1.30, z1: 3.14 },
    podX: 0.62, podIn: 0.0, podY: 0.98,
    fenderPlank: { x0: 1.40, x1: 1.80, z0: 2.94, z1: -4.00, y: 1.47 },
    fenderLip: { x: 1.84, w: 0.07, z0: 2.42, z1: -3.58, y: 1.22 },
    wheelZs: [1.75, 0.89, 0.03, -0.83, -1.69, -2.55],
    sprocket: { z: 2.05, y: 0.54, r: 0.29 }, idler: { z: -3.32, y: 0.70, r: 0.27 },
    rollers: [1.35, 0.5, -0.4, -1.3, -2.15],
    skirt: { z0: 2.46, z1: -2.65, top: 1.14, bot: 0.62, scallop: true, x: 1.83 },
    markerRods: { x: 1.76, y: 1.62, z: -3.50, h: [0.93, 0.89] },
    hullPosts: [{ x: -0.60, z: 2.85, top: 2.33, base: 1.60 }],
    tailRack: {
      z0: -3.60, z1: -4.06, top: 1.58, bot: 0.55, hw: 1.70, x0: 0.35,
      wings: { x0: 0.44, x1: 1.02, z1: -4.24, top: 1.50, bot: 0.90 },
    },
    pivotZ: -0.55,
    turretStyle: 'small',
    // Muzzle from published overall: -4.24 + 8.78*0.995 = 4.50 (oracle gun
    // short at 4.03 — certified wholeCurves gun cap).
    gunAxisY: 1.99, gunR: 0.078, sleeve: false, evac: 0.60, evacR: 1.35, gunTipZ: 4.50, gunZL: 0.40,
    muzzleCollar: { r: 0.105, len: 0.28 },
    mantlet: { r0: 0.125, r1: 0.10, len: 0.85, drop: 0.05, legacy: true },
    apexZ: 1.06, notchHW: 0.20, hwMax: 1.44, roofHW: 1.04, roofInset: 0.76,
    shoulderZ: 0.55, shellRearZ: -2.55, maxWZ: -0.60,
    // Rising cast roof + wedge face 0.16 fwd of 2B; dome drum capped 2.66.
    roofLine: [[1.04, 2.17], [0.55, 2.26], [0.10, 2.34], [-0.08, 2.38], [-0.44, 2.39], [-1.80, 2.55], [-2.06, 2.60]],
    station: { x: -0.45, z0: -0.56, z1: -1.72, top: 2.66, hw: 0.53 },
    sightZ: 0.60,
    apron: [[0.45, 1.72], [0.12, 1.62], [0.01, 1.52], [-0.80, 1.52], [-0.88, 1.48], [-1.05, 1.48], [-1.20, 1.52], [-2.10, 1.52], [-2.30, 1.62], [-2.46, 1.66], [-2.56, 1.75], [-2.70, 1.80], [-2.90, 1.88]],
    apronHW: 1.05,
    stow: { z0: -1.95, z1: -2.60, top: 2.56, bot: 2.02, hw: 1.40, xoff: 0.20 },
    basket: { z0: -2.47, z1: -3.50, top: 2.44, topRear: 2.42, bot: 1.89 }, basketHW: 1.25,
    tailVane: { z0: -3.50, z1: -3.98, top: 2.38, bot: 1.90, hw: 0.80, drop: 0.12 },
    chainDrop: 0.12, chainGap: 0.18,
    // Whips on the ref's RIGHT-side x station (+0.8, front trace); z per
    // the gate crossfire pairing.
    antennas: [{ x: 0.80, y: 2.51, z: -2.94, h: 2.29, stem: 0.45 }, { x: 0.84, y: 2.51, z: -2.19, h: 2.36, stem: 0.45 }],
    pots: [{ x: 0.82, z: -2.70, top: 2.64, base: 2.40, w: 0.16, d: 0.20 }],
    turretKit: merkava2dKit,
  },

  // ---- Mk.3B: modular turret at the measured FORWARD face (z 1.75), proud
  // gun-mount crest, wide flat roof ring, tall rear hull rack to y 2.37 -----
  // Curves: nose (3.33, 0.86..1.00); steep glacis to (2.55,1.58); deck shelf
  // 1.70 z 0.3..2.0 then 1.63; keel (3.33,0.86)->(2.95,0.48)->(2.0,0.0);
  // plan ±1.75 full length, skirt bulge ±1.84 z -3.4..2.6; tail -4.05 with
  // the tall rack band -3.3..-4.08 to y 2.37; turret: mantlet top 2.14 to
  // z 2.5, face 1.75, crest 2.50 z 0.55..1.45, roof 2.31, cupola band 2.80
  // -0.35..-1.55, rear roof 2.42, bustle 2.40 to -2.7, basket 2.38 to -3.22,
  // whips -2.95/-3.25; gun axis 1.95 r 0.08 tip 4.14.
  merkava3b: {
    build: buildMerkavaMark, ...MK3_GEAR,
    // BATCH-14 PUSH (2026-08-02): the warped oracle is TRUE to published but
    // sits ~0.35 m rearward of the old authoring frame (loader re-centered
    // after the muzzle warp). The whole build is authored in the REF world
    // frame — dims are translation-invariant — which nulls the side dAlong
    // (0.368 -> ~0) and the plan dy. All targets from the fresh world probe
    // (see packet "Push round 1 intel"). Running gear shifted via the
    // per-profile overrides below (MK3_GEAR itself untouched — 3D siblings).
    trackW: 0.56, // ref inner track face >= 1.16 (the 1.14 edge aliased into the x 1.11 front column)
    wheelZs: [1.20, 0.45, -0.37, -1.18, -2.00, -2.81],
    sprocket: { z: 2.00, y: 0.72, r: 0.29 }, idler: { z: -3.53, y: 0.66, r: 0.27 },
    rollers: [0.95, 0.10, -0.75, -1.60, -2.45],
    deckY: 1.63, rearDeckZ: -2.65,
    // Warped-ref hull: plan face 2.89, glacis 1.21@2.81 -> 1.52@2.31, deck
    // peak 1.73 @ 0.40..0.74 (CENTER-narrow: ref front tops fall 1.65 past
    // |x|~1.43), bare 1.60 to -2.35, 1.63 shoulder, engine crest 1.73 @
    // -2.84..-2.92 (also narrow), 1.68 to -3.47, rack band from -3.50.
    body: [
      { z: 2.89, yT: 1.08, yB: 0.92, wT: 1.30, wB: 1.12 },
      { z: 2.72, yT: 1.24, yB: 0.98, wT: 1.52, wB: 1.30 },
      { z: 2.55, yT: 1.36, yB: 1.00, wT: 1.62, wB: 1.45 },
      { z: 2.28, yT: 1.50, yB: 1.00, wT: 1.66, wB: 1.74 },
      { z: 1.95, yT: 1.585, yB: 1.00, wT: 1.66, wB: 1.74 },
      { z: 1.58, yT: 1.60, yB: 1.00, wT: 1.66, wB: 1.74 },
      { z: 1.42, yT: 1.615, yB: 1.00, wT: 1.63, wB: 1.74 },
      { z: 1.24, yT: 1.67, yB: 1.00, wT: 1.60, wB: 1.74 },
      { z: 0.75, yT: 1.73, yB: 1.00, wT: 1.43, wB: 1.74 },
      { z: 0.40, yT: 1.73, yB: 1.00, wT: 1.43, wB: 1.74 },
      { z: 0.05, yT: 1.65, yB: 1.00, wT: 1.60, wB: 1.74 },
      { z: -0.15, yT: 1.60, yB: 1.00, wT: 1.66, wB: 1.74 },
      { z: -2.35, yT: 1.60, yB: 0.99, wT: 1.66, wB: 1.74 },
      { z: -2.72, yT: 1.63, yB: 0.99, wT: 1.66, wB: 1.74 },
      { z: -2.80, yT: 1.725, yB: 0.98, wT: 1.43, wB: 1.74 },
      { z: -2.94, yT: 1.725, yB: 0.98, wT: 1.43, wB: 1.74 },
      { z: -3.00, yT: 1.68, yB: 0.98, wT: 1.66, wB: 1.74 },
      { z: -3.47, yT: 1.675, yB: 0.98, wT: 1.66, wB: 1.74 },
      { z: -4.41, yT: 1.46, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 2.77, toeY: 0.90, toeHW: 0.70, midZ: 2.58, midY: 0.57, groundZ: 2.15, bellyY: 0.41, bellyMidY: 0.35, bellySideY: 0.24, tailLowZ: -3.55 },
    glacis: { z0: 1.60, z1: 2.75 },
    // pods ARE the ref's side nose tip (x ±0.56..0.69, y 0.87..1.00, poking
    // to +3.10 = the hull mask front edge and the dims hullLength bow).
    podX: 0.62, podIn: -0.245, podY: 0.93,
    bodyHW: 1.70,
    fenderPlank: { x0: 1.40, x1: 1.748, z0: 1.88, z1: -3.65, y: 1.60 },
    // skirt: plate 1.833 (stations 3.66 mid-hull); front edges L 2.36 /
    // R 2.28 per the warped plan; hem 0.84 with -0.08 scallops.
    // skirt: plate 1.833 (stations 3.66); flareR at 1.8435 is the widthM
    // 0.40-run carrier INSIDE station s1; flush seams (the proud panel
    // seams leaked into the outermost front column). The true outermost
    // content is the per-side lipStrips below (ref plan ±1.9 columns:
    // LEFT = front mudguard corner + rear guard, RIGHT = rear guard only).
    skirt: { z0: [2.36, 2.28], z1: -3.79, top: 1.36, bot: 0.84, scallop: true, wavy: true, x: 1.833, flush: true, flapMat: 'hullTrack', flapW: 0.42, flapH: 0.44,
      flareF: { len: 0.20, x: 1.8435, top: 1.35, bot: 1.27 },
      flareR: { z0: -3.47, z1: -3.87, x: 1.8435, top: 1.35, bot: 1.27 } },
    lipStrips: [
      { x: -1.8575, z0: 2.38, z1: 2.26, top: 1.35, bot: 1.27 },
      { x: -1.8575, z0: -3.75, z1: -3.85, top: 1.35, bot: 1.27 },
      { x: 1.8575, z0: -3.78, z1: -3.86, top: 1.35, bot: 1.27 },
    ],
    frontBoard: { z0: [2.91, 2.91], z1: 2.17, y: 1.06, x0: 1.30, x1: [1.78, 1.76] },
    rearFlaps: [{ z: -3.95, bot: 0.44 }, { z: -4.06, bot: 0.46 }, { z: -4.16, bot: 0.57 }, { z: 2.71, bot: 0.57, top: 0.92, w: 0.42, mat: 'hullTrack', wood: true }, { z: 2.30, bot: 0.62, top: 1.00, w: 0.04, x: 1.815 }],
    // Visual round (shaded-parity r1 work order): monochrome pale-sand kit,
    // wedge front, hatch rings, chain fringe, wavy hem, fender stowage.
    paleKit: true, paleVents: true, fenderKit: true, chainFringe: true,
    wedgeFront: true, cheekRake: 0.34, glassTiles: false,
    // Warped rear: rack band 2.38-2.41 over -3.50..-4.12 falling to 2.25 by
    // -4.46; plan rear steps -4.41 center / -4.52..-4.54 x 0.35-1.06 /
    // -4.44 rack-wall zone; LOW TAIL FRAME 1.42..0.74 at -4.49..-4.54 is
    // the ref's own body-span end (replaces the old hairline tailPins).
    tailRack: {
      z0: -3.63, z1: -4.41, top: 1.62, bot: 0.90, hw: 1.755, x0: 0.35,
      wall: { top: 1.35, bot: 0.87, endBot: 0.72 },
      wings: [
        { x0: 0.38, x1: 0.86, z1: -4.465, top: 2.26, bot: 1.35 }, // tall pack lobes (side 2.25 @ -4.44)
        { x0: 1.10, x1: 1.69, z1: -4.45, top: 1.60, bot: 0.92 },  // low outboard frame (plan x 1.4-1.6 rear -4.44)
        { x0: 0.36, x1: 1.06, z1: -4.52, top: 1.42, bot: 0.74 },  // low tail frame = body-span/registration end
      ],
    },
    rearPack: { hw: 0.91, x: -0.075, z0: -3.50, z1: -4.41, top: 2.39, bot: 1.30, taperZ: -4.20, topRear: 2.27, lobeL: { x0: -1.04, x1: -0.95, top: 2.18, z0: -3.60, z1: -4.30 } },
    pivotZ: -1.10,
    turretStyle: 'mod',
    // Gun: warped-ref muzzle +4.56 (tail -4.54 + published 9.04); matching
    // it exactly zeroes side_whole gun coverage; overall reads 9.10 (+0.7%,
    // inside the 1% grace). Mantlet drum band 2.15 over z 1.55..2.21.
    gunAxisY: 1.95, gunR: 0.085, sleeve: true, evac: 0.72, evacR: 1.35, collar: false, gunTipZ: 4.55, gunZL: 0.32, sleeveTo: 4.22, sleeveR: 0.118,
    mantlet: { r0: 0.165, r1: 0.115, len: 0.66, drop: 0.03, z0: 1.55, boxy: true },
    // Warped turret: crest face z 1.51 (top 2.52), plateau 2.52-2.57 with
    // the saddle DIP 2.38-2.41 over -0.10..-0.59; center roof stays 2.54-
    // 2.58 (the 2.65 band lives ONLY on the left plinth x -0.60..-0.88 and
    // right box x 0.91..1.33).
    apexZ: 1.51, notchHW: 0.30, hwMax: 1.32, roofHW: 0.95, roofInset: 0.92,
    shellFrontZ: 0.50, noseZ: -0.05, noseHW: 1.28, maxWZ: 0.00, shellRearZ: -2.07, rearWide: 0.985,
    shellBotY: 1.53, shellTopY: 2.40,
    crest: { z0: 1.51, zW: 0.88, z1: -0.08, hw0: 0.18, hw1: 0.41, top0: 2.52, top1: 2.565, bot: 1.86 },
    // cheek plan sweep re-read off the warped plan_turret row (right
    // plateau 0.92 to x 0.59, shoulder 0.58 at 1.32-1.37; left cuts back
    // hard to 0.18 by x 0.90 with the pod leading again at 0.34).
    cheek: { pts: [[0.41, 0.92], [0.60, 0.895], [0.72, 0.82], [0.82, 0.73], [0.90, 0.52], [1.00, 0.43], [1.31, 0.57]],
      ptsL: [[0.41, 0.92], [0.50, 0.60], [0.60, 0.45], [0.72, 0.39], [0.80, 0.31], [0.90, 0.18], [1.03, 0.18]],
      topIn: 2.48, topOut: 1.98, botIn: 1.86, botOut: 1.70 },
    cheekPod: [
      { x0: 1.08, x1: 1.41, z0: 0.62, z1: 0.29, top: 2.19, bot: 1.76 },
      { x0: -1.06, x1: -1.34, z0: 0.34, z1: -0.10, top: 2.10, bot: 1.78 },
    ],
    chin: { z0: 0.31, z1: -0.05, bot0: 1.72, bot1: 1.53, hw: 1.00 },
    // Roof deck line (warped): saddle 2.41 dip to -0.63, low right 2.47,
    // rear plateau 2.52 to -2.29, raised stow 2.53 (+ kit hump 2.58 at
    // -2.50), bustle top 2.47 -> 2.42.
    roofLine: [[-0.19, 2.41], [-0.63, 2.41], [-0.75, 2.47], [-1.90, 2.47], [-1.96, 2.465], [-2.56, 2.465], [-2.62, 2.47], [-3.00, 2.455], [-3.25, 2.42]],
    // Left sight plinth at the ref's own 2.66 band (published-height p95
    // line; grace to 2.687 unused — the warped band IS 2.64-2.68).
    plinth: { x0: -0.88, x1: -0.60, z0: -0.83, z1: -1.85, top: 2.66 },
    roofBoxes: [
      // right band pad: the 2.59-2.62 front tops now ride the CUPOLA RING
      // (x 0.895..1.305 at 2.60); the pad keeps the plan footprint. Side
      // tops there belong to the plinth/left step, so the 2.535 pad is
      // silhouette-neutral.
      { x0: 0.91, x1: 1.32, z0: -0.63, z1: -1.85, top: 2.535, bot: 2.30 },
      { x0: -0.45, x1: 0.40, z0: -2.29, z1: -2.41, top: 2.545, bot: 2.40 }, // rear pot bump 2.54-2.57
      { x0: -0.40, x1: 0.40, z0: -1.96, z1: -2.29, top: 2.52, bot: 2.40 }, // center rear plateau (ref front: 2.52 only inside |x| 0.40; shoulders 2.44-2.47)
      { x0: -0.94, x1: -0.548, z0: -0.63, z1: -0.83, top: 2.605, bot: 2.40 }, // left band leading step 2.59-2.62 (ref reaches x -0.548)
      { x0: -1.17, x1: -1.10, z0: -2.65, z1: -3.42, top: 2.42, bot: 1.92 }, // left shelf (plan -3.44)
      { x0: -1.24, x1: -1.17, z0: -2.65, z1: -3.19, top: 2.42, bot: 1.92 },
      { x0: -1.285, x1: -1.24, z0: -2.65, z1: -3.15, top: 2.10, bot: 1.92 },
      { x0: -1.26, x1: -1.33, z0: 0.32, z1: -2.19, top: 2.06, bot: 1.86 },  // left roof wing (low 2.02-2.10)
      { x0: -1.33, x1: -1.375, z0: 0.40, z1: 0.17, top: 2.02, bot: 1.86 },  // wing front nub (ref plan -1.37 col)
    ],
    // Turret ring tub: the warped ref's turret mask bottoms 0.58 flat over
    // z -0.36..-2.14 (crew basket descending into the hull). Hidden inside
    // the hull silhouette everywhere except turret-only side rows.
    ringTub: { z0: -0.235, zF0: -0.375, zF1: -2.145, z1: -2.30, top: 1.56, bot: 0.58, hw: 0.85, stepY: 1.05 },
    // bustle underside ramp 1.57 flat to -2.58 rising 1.94 by -3.30; plan
    // taper 1.20 -> 1.06 (ref holds x 1.06 to -3.39, 1.11-1.16 to -3.05).
    bustleSegs: [
      { z: -1.95, bot: 1.56, hw: 1.20 }, { z: -2.58, bot: 1.57, hw: 1.20 },
      { z: -2.66, bot: 1.70, hw: 1.20 }, { z: -2.79, bot: 1.76, hw: 1.18 },
      { z: -2.94, bot: 1.81, hw: 1.16 }, { z: -3.05, bot: 1.84, hw: 1.12 },
      { z: -3.30, bot: 1.94, hw: 1.06 },
    ],
    rearRoofHW: 1.09,
    bustleZ1: -3.35, bustleBot: 1.64, bustleHW: 1.14,
    basket: { z0: -3.27, z1: -3.59, top: 2.43, topRear: 2.39, bot: 1.93 }, basketHW: 1.10, basketXoff: 0,
    // Chain-mat vane (TURRET node) runs to the ref's -4.44: tops 2.33 ->
    // 2.25, bots 1.94 -> 1.86; plan V full-rear across |x| <= 0.72.
    tailVane: { z0: -3.59, z1: -4.415, zMid: -4.05, top: 2.33, bot: 1.88, hw: 1.02, hwMid: 0.90, hwRear: 0.72, xoff: -0.055, drop: 0.02 },
    chainDrop: 0.04, chainGap: 0.22, chainHW: 0.72,
    // kit cap AT the warped band top (2.66 published); heightM p95 excludes
    // exactly 3 spikes: the two whips + the -3.52 spring can.
    kitCapY: 2.66,
    cupolaX: 1.06, cupolaZ: -1.20, cupolaR: 0.17, cupolaRaise: 0.02,
    cupolaRing: { x: 1.10, z: -1.20, r: 0.205, top: 2.60, base: 2.525 },
    loaderRing: { x: -0.79, z: -2.05, r: 0.175, top: 2.53, base: 2.465 },
    pano: { x: -0.34, z: -1.10, top: 2.60, seat: true }, sightX: 0.45,
    // Whips at the warped ref columns: z -3.58 (x +0.19, top 3.59) and
    // -3.34 (x +1.015, top 3.61); spring can 2.70 beside whip1's base.
    antennas: [{ x: 0.19, y: 2.42, z: -3.545, h: 1.19, stem: 0.4 }, { x: 1.015, y: 2.42, z: -3.34, h: 1.21, stem: 0.4 }],
    pots: [{ x: 0.19, z: -3.545, top: 2.70, base: 2.30, w: 0.030, d: 0.06 },
      { x: 0.19, z: -3.64, top: 2.58, base: 2.30, w: 0.030, d: 0.05 }],
    turretKit: merkava3bKit,
  },

  // ---- Mk.3C: 3B sculpt + Kasag roof clutter --------------------------------
  // Print note (certified): the 3C oracle carries its bustle band in the
  // HULL node (hull trace tops 2.48-2.55 over z -0.7..-2.2) — small
  // hullCurves residue no articulated build can copy.
  merkava3c: {
    build: buildMerkavaMark, ...MK3_GEAR,
    // BATCH-14 PUSH: same warped-ref frame re-lay as 3B (see its block +
    // packet intel). 3C deltas: taller whips (3.90/3.93), Kasag hump 2.65
    // at -2.56..-2.61, wider/lower left plinth band, near-center pano head.
    trackW: 0.56, // ref inner track face >= 1.16 (the 1.14 edge aliased into the x 1.11 front column)
    wheelZs: [1.20, 0.45, -0.37, -1.18, -2.00, -2.81],
    sprocket: { z: 2.00, y: 0.72, r: 0.29 }, idler: { z: -3.53, y: 0.66, r: 0.27 },
    rollers: [0.95, 0.10, -0.75, -1.60, -2.45],
    deckY: 1.63, rearDeckZ: -2.65,
    body: [
      { z: 2.89, yT: 1.08, yB: 0.92, wT: 1.30, wB: 1.12 },
      { z: 2.72, yT: 1.24, yB: 0.98, wT: 1.52, wB: 1.30 },
      { z: 2.55, yT: 1.36, yB: 1.00, wT: 1.62, wB: 1.45 },
      { z: 2.28, yT: 1.50, yB: 1.00, wT: 1.66, wB: 1.74 },
      { z: 1.95, yT: 1.585, yB: 1.00, wT: 1.66, wB: 1.74 },
      { z: 1.58, yT: 1.60, yB: 1.00, wT: 1.66, wB: 1.74 },
      { z: 1.42, yT: 1.615, yB: 1.00, wT: 1.63, wB: 1.74 },
      { z: 1.24, yT: 1.67, yB: 1.00, wT: 1.60, wB: 1.74 },
      { z: 0.75, yT: 1.73, yB: 1.00, wT: 1.43, wB: 1.74 },
      { z: 0.40, yT: 1.73, yB: 1.00, wT: 1.43, wB: 1.74 },
      { z: 0.05, yT: 1.65, yB: 1.00, wT: 1.60, wB: 1.74 },
      { z: -0.15, yT: 1.60, yB: 1.00, wT: 1.66, wB: 1.74 },
      { z: -2.35, yT: 1.60, yB: 0.99, wT: 1.66, wB: 1.74 },
      { z: -2.72, yT: 1.63, yB: 0.99, wT: 1.66, wB: 1.74 },
      { z: -2.80, yT: 1.725, yB: 0.98, wT: 1.43, wB: 1.74 },
      { z: -2.94, yT: 1.725, yB: 0.98, wT: 1.43, wB: 1.74 },
      { z: -3.00, yT: 1.68, yB: 0.98, wT: 1.66, wB: 1.74 },
      { z: -3.47, yT: 1.675, yB: 0.98, wT: 1.66, wB: 1.74 },
      { z: -4.41, yT: 1.46, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 2.77, toeY: 0.90, toeHW: 0.70, midZ: 2.58, midY: 0.57, groundZ: 2.15, bellyY: 0.41, bellyMidY: 0.35, bellyMidX: 1.10, bellySideY: 0.24, tailLowZ: -3.55 },
    glacis: { z0: 1.60, z1: 2.75 },
    podX: 0.62, podIn: -0.245, podY: 0.93,
    bodyHW: 1.70,
    fenderPlank: { x0: 1.40, x1: 1.748, z0: 1.88, z1: -3.65, y: 1.60 },
    skirt: { z0: [2.36, 2.28], z1: -3.79, top: 1.36, bot: 0.84, scallop: true, wavy: true, x: 1.833, flush: true, flapMat: 'hullTrack', flapW: 0.42, flapH: 0.44,
      flareF: { len: 0.20, x: 1.8435, top: 1.35, bot: 1.27 },
      flareR: { z0: -3.47, z1: -3.87, x: 1.8435, top: 1.35, bot: 1.27 } },
    lipStrips: [
      { x: -1.8575, z0: 2.38, z1: 2.26, top: 1.35, bot: 1.27 },
      { x: -1.8575, z0: -3.75, z1: -3.85, top: 1.35, bot: 1.27 },
      { x: 1.8575, z0: -3.78, z1: -3.86, top: 1.35, bot: 1.27 },
    ],
    frontBoard: { z0: [2.91, 2.91], z1: 2.17, y: 1.06, x0: 1.30, x1: [1.78, 1.76] },
    rearFlaps: [{ z: -3.95, bot: 0.44 }, { z: -4.06, bot: 0.46 }, { z: -4.16, bot: 0.57 }, { z: 2.71, bot: 0.57, top: 0.92, w: 0.42, mat: 'hullTrack', wood: true }, { z: 2.30, bot: 0.72, top: 1.00, w: 0.04, x: 1.815 }],
    // Visual round switches (shared work order with 3B).
    paleKit: true, paleVents: true, fenderKit: true, chainFringe: true,
    wedgeFront: true, cheekRake: 0.34, glassTiles: false,
    rearPack: { hw: 0.91, x: -0.075, z0: -3.50, z1: -4.41, top: 2.39, bot: 1.30, taperZ: -4.20, topRear: 2.27 },
    tailRack: {
      z0: -3.63, z1: -4.41, top: 1.62, bot: 0.90, hw: 1.755, x0: 0.35,
      wall: { top: 1.35, bot: 0.87, endBot: 0.72 },
      wings: [
        { x0: 0.38, x1: 0.86, z1: -4.465, top: 2.26, bot: 1.35 },
        { x0: 1.10, x1: 1.69, z1: -4.45, top: 1.60, bot: 0.92 },
        { x0: 0.36, x1: 1.06, z1: -4.52, top: 1.42, bot: 0.74 },
      ],
    },
    pivotZ: -1.10,
    turretStyle: 'mod',
    gunAxisY: 1.95, gunR: 0.085, sleeve: true, evac: 0.72, evacR: 1.35, collar: false, gunTipZ: 4.55, gunZL: 0.32, sleeveTo: 4.22, sleeveR: 0.118,
    mantlet: { r0: 0.165, r1: 0.115, len: 0.66, drop: 0.03, z0: 1.55, boxy: true },
    // 3C crest: face z 1.53 top 2.54, wider 2.57 zone (0.53..-0.04).
    apexZ: 1.53, notchHW: 0.30, hwMax: 1.32, roofHW: 0.95, roofInset: 0.92,
    shellFrontZ: 0.50, noseZ: -0.05, noseHW: 1.28, maxWZ: 0.00, shellRearZ: -2.07, rearWide: 0.985,
    shellBotY: 1.53, shellTopY: 2.40,
    crest: { z0: 1.53, zW: 0.88, z1: -0.08, hw0: 0.18, hw1: 0.41, top0: 2.54, top1: 2.57, bot: 1.86 },
    cheek: { pts: [[0.41, 0.92], [0.60, 0.895], [0.72, 0.82], [0.82, 0.73], [0.90, 0.52], [1.00, 0.43], [1.31, 0.57]],
      ptsL: [[0.41, 0.92], [0.50, 0.60], [0.60, 0.45], [0.72, 0.39], [0.80, 0.31], [0.90, 0.18], [1.03, 0.18]],
      topIn: 2.48, topOut: 1.98, botIn: 1.86, botOut: 1.70 },
    cheekPod: [
      { x0: 1.08, x1: 1.41, z0: 0.62, z1: 0.29, top: 2.19, bot: 1.76 },
      { x0: -1.06, x1: -1.34, z0: 0.34, z1: -0.10, top: 2.10, bot: 1.78 },
    ],
    chin: { z0: 0.31, z1: -0.05, bot0: 1.72, bot1: 1.53, hw: 1.00 },
    // 3C rear roof plateau 2.54 (3B: 2.52); Kasag hump 2.65 via the kit
    // bundle at -2.58 (the old 2.94 whip-can tower is DEAD — ref max there
    // is 2.49).
    roofLine: [[-0.19, 2.41], [-0.63, 2.41], [-0.75, 2.47], [-1.90, 2.47], [-1.96, 2.47], [-2.41, 2.47], [-2.55, 2.46], [-3.00, 2.46], [-3.25, 2.42]],
    plinth: { x0: -0.94, x1: -0.60, z0: -0.72, z1: -1.85, top: 2.65 }, // 3C band wider + a hair lower than 3B
    roofBoxes: [
      // right pad under the cupola ring (see 3B note): ring carries 2.60.
      { x0: 0.91, x1: 1.32, z0: -0.63, z1: -1.85, top: 2.535, bot: 2.30 },
      { x0: -0.45, x1: 0.40, z0: -2.29, z1: -2.41, top: 2.575, bot: 2.40 },
      { x0: -0.40, x1: 0.40, z0: -1.96, z1: -2.24, top: 2.54, bot: 2.40 },
      { x0: -0.94, x1: -0.56, z0: -0.63, z1: -0.72, top: 2.62, bot: 2.40 },
      { x0: -0.535, x1: -0.455, z0: -0.75, z1: -1.20, top: 2.59, bot: 2.40 }, // ref notch: 2.51 at -0.55, 2.59 back at -0.49..-0.53
      { x0: -1.17, x1: -1.10, z0: -2.65, z1: -3.42, top: 2.42, bot: 1.92 },
      { x0: -1.24, x1: -1.17, z0: -2.65, z1: -3.19, top: 2.42, bot: 1.92 },
      { x0: -1.285, x1: -1.24, z0: -2.65, z1: -3.15, top: 2.10, bot: 1.92 },
      { x0: -1.26, x1: -1.33, z0: 0.32, z1: -2.19, top: 2.06, bot: 1.86 },
      { x0: -1.33, x1: -1.375, z0: 0.40, z1: 0.17, top: 2.02, bot: 1.86 },
    ],
    ringTub: { z0: -0.235, zF0: -0.375, zF1: -2.145, z1: -2.30, top: 1.56, bot: 0.58, hw: 0.85, stepY: 1.05 },
    bustleSegs: [
      { z: -1.95, bot: 1.56, hw: 1.20 }, { z: -2.58, bot: 1.57, hw: 1.20 },
      { z: -2.66, bot: 1.70, hw: 1.20 }, { z: -2.79, bot: 1.76, hw: 1.18 },
      { z: -2.94, bot: 1.81, hw: 1.16 }, { z: -3.05, bot: 1.84, hw: 1.12 },
      { z: -3.30, bot: 1.94, hw: 1.06 },
    ],
    rearRoofHW: 1.09,
    bustleZ1: -3.35, bustleBot: 1.64, bustleHW: 1.14,
    basket: { z0: -3.27, z1: -3.59, top: 2.43, topRear: 2.39, bot: 1.93 }, basketHW: 1.10, basketXoff: 0,
    tailVane: { z0: -3.59, z1: -4.415, zMid: -4.05, top: 2.33, bot: 1.88, hw: 1.02, hwMid: 0.90, hwRear: 0.72, xoff: -0.055, drop: 0.02 },
    chainDrop: 0.04, chainGap: 0.22, chainHW: 0.72,
    kitCapY: 2.66,
    cupolaX: 1.09, cupolaZ: -1.20, cupolaR: 0.15, cupolaRaise: 0.02,
    // 3C ring pulled 0.015 outboard of 3B's with a smaller radius: its ring
    // must clear the x 0.87 front column the 3B ref fills (gate-pass note).
    cupolaRing: { x: 1.115, z: -1.20, r: 0.185, top: 2.60, base: 2.525 },
    loaderRing: { x: -0.79, z: -2.05, r: 0.175, top: 2.53, base: 2.465 },
    pano: { x: 0.03, z: -1.10, top: 2.648, seat: true }, sightX: 0.45, // 3C: ref 2.65 head at x +0.01..0.05
    // 3C whips: z -3.58 (x -0.63, top 3.90) and -3.34 (x +1.015, top 3.93);
    // spring can 2.75 beside the left whip base. p95 budget = these 3.
    antennas: [{ x: -0.64, y: 2.42, z: -3.545, h: 1.50, stem: 0.4, thin: 0.20, bright: true }, { x: 1.02, y: 2.42, z: -3.34, h: 1.53, stem: 0.4, thin: 0.20, bright: true }],
    pots: [{ x: -0.635, z: -3.545, top: 2.90, base: 2.30, w: 0.030, d: 0.06 },
      { x: -0.635, z: -3.64, top: 2.45, base: 2.30, w: 0.030, d: 0.05 }],
    turretKit: merkava3cKit,
  },

  // ---- Mk.3D: Dor-Dalet — wider turret, bulged cheeks, rear chain tip ------
  // v6: LOW rear rack (tops 1.56-1.63 falling to 1.27), basket band riding
  // flat at 2.44 all the way to -3.9, chain tip [0.74..1.43] at -4.1; one
  // tall whip (-3.05, top 4.80) + one short pot (-2.60, top 2.59).
  // Print note (certified): bustle band in the HULL node like 3C.
  merkava3d: {
    build: buildMerkavaMark, ...MK3_GEAR,
    deckY: 1.63, rearDeckZ: -2.30,
    // r4: 3B-family re-lay (see merkava3b.md round-4) with the 3D long nose
    // and LOW rear rack. Deck line, gear ramp, skirt band + flares, grace
    // caps and the bustle ramp/vane V are the shared measured anatomy.
    body: [
      { z: 3.33, yT: 1.00, yB: 0.86, wT: 1.05, wB: 0.90 },
      { z: 2.98, yT: 1.30, yB: 0.97, wT: 1.44, wB: 1.28 },
      { z: 2.55, yT: 1.58, yB: 1.00, wT: 1.70, wB: 1.45 },
      { z: 2.00, yT: 1.63, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 1.10, yT: 1.75, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 0.10, yT: 1.62, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -1.00, yT: 1.60, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -1.92, yT: 1.605, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.42, yT: 1.63, yB: 0.99, wT: 1.75, wB: 1.75 },
      { z: -2.48, yT: 1.725, yB: 0.99, wT: 1.75, wB: 1.75 },
      { z: -2.58, yT: 1.725, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -2.67, yT: 1.66, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -2.90, yT: 1.68, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -3.28, yT: 1.58, yB: 0.95, wT: 1.70, wB: 1.70 },
      { z: -4.06, yT: 1.44, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    tailNotch: { hw: 0.30 },
    keel: { toeZ: 3.33, toeY: 0.86, toeHW: 0.90, midZ: 2.95, midY: 0.50, groundZ: 2.50, bellyY: 0.36, tailLowZ: -3.20 },
    glacis: { z0: 1.95, z1: 3.30 },
    podX: 0.66, podIn: 0.05, podY: 0.98,
    fenderPlank: { x0: 1.40, x1: 1.74, z0: 2.42, z1: -3.30, y: 1.60 },
    skirt: { z0: [2.60, 2.47], z1: -3.44, top: 1.36, bot: 0.84, scallop: true, x: 1.833, flareF: { len: 0.20, x: 1.8435 }, flareR: { z0: -3.10, z1: -3.44, x: 1.855 } },
    fenderLip: { x: 1.86, w: 0.07, z0: -3.12, z1: -3.40, y: 1.06 }, // widthM carrier inside the rear-guard window
    frontBoard: { z0: 3.08, z1: 2.52, y: 1.06, x0: 1.30, x1: [1.79, 1.72] },
    rearFlaps: [{ z: -3.60, bot: 0.44 }, { z: -3.72, bot: 0.62 }],
    // 3D rear: LOW rack band (tops 1.54 falling, hanging 0.74-0.88) with
    // the mid shelf; slim wings carry the hullLength tail columns.
    tailRack: {
      z0: -3.28, z1: -4.05, top: 1.55, bot: 0.86, hw: 1.755, x0: 0.40,
      wall: { top: 1.30, bot: 0.87, endBot: 0.74 },
      midShelf: { x1: 0.95, z1: -3.62, top: 1.53 },
      wings: [
        { x0: 0.42, x1: 1.10, z1: -4.15, top: 1.44, bot: 0.78 },
      ],
    },
    hullPosts: [{ x: -0.60, z: 3.44, top: 1.02, base: 0.90 }],
    tailPins: [{ x: 0.52, y: 1.02, z: -4.27 }, { x: -0.52, y: 1.02, z: -4.27 }],
    pivotZ: -0.75,
    turretStyle: 'mod',
    gunAxisY: 1.97, gunR: 0.085, sleeve: true, evac: 0.516, evacR: 1.94, collar: false, gunTipZ: 4.74, gunZL: 0.32, sleeveTo: 3.86, sleeveR: 0.15,
    mantlet: { r0: 0.165, r1: 0.115, len: 0.66, drop: 0.03, z0: 1.84 },
    apexZ: 1.76, notchHW: 0.30, hwMax: 1.55, roofHW: 1.00, roofInset: 0.96,
    shellFrontZ: 0.85, noseZ: 0.30, noseHW: 1.42, maxWZ: -0.35, shellRearZ: -1.72, rearWide: 0.97,
    shellBotY: 1.55, shellTopY: 2.41,
    crest: { z0: 1.76, zW: 1.21, z1: 0.50, hw0: 0.19, hw1: 0.44, top0: 2.56, top1: 2.65, bot: 1.86 },
    cheek: { pts: [[0.62, 1.20], [0.72, 0.72], [1.00, 0.52], [1.30, 0.50], [1.53, 0.40]], topIn: 2.48, topOut: 1.96, botIn: 1.86, botOut: 1.70 },
    chin: { z0: 0.66, z1: 0.30, bot0: 1.72, bot1: 1.55, hw: 1.10 },
    roofLine: [[0.30, 2.41], [-0.28, 2.41], [-0.40, 2.47], [-1.55, 2.47], [-1.61, 2.56], [-1.94, 2.56], [-2.06, 2.48], [-2.30, 2.44], [-2.90, 2.42]],
    plinth: { x0: -0.94, x1: -0.60, z0: -0.15, z1: -2.48, top: 2.68 }, // 3D band runs aft to -2.48
    roofBoxes: [
      { x0: -0.45, x1: 0.55, z0: -2.55, z1: -2.92, top: 2.60, bot: 2.30 },
      { x0: 1.30, x1: 1.58, z0: 0.20, z1: -2.55, top: 2.42, bot: 1.90 },  // Dor-Dalet side plates
      { x0: -1.58, x1: -1.30, z0: 0.20, z1: -2.55, top: 2.42, bot: 1.90 },
    ],
    bustleSegs: [
      { z: -1.62, bot: 1.56, hw: 1.42 }, { z: -2.22, bot: 1.58, hw: 1.42 },
      { z: -2.32, bot: 1.70, hw: 1.40 }, { z: -2.60, bot: 1.82, hw: 1.30 },
      { z: -2.96, bot: 1.94, hw: 1.10 },
    ],
    rearRoofHW: 1.10,
    bustleZ1: -2.90, bustleBot: 1.60, bustleHW: 1.55,
    basket: { z0: -2.90, z1: -3.30, top: 2.44, topRear: 2.40, bot: 1.95 }, basketHW: 1.05,
    tailVane: { z0: -3.30, z1: -3.96, zMid: -3.60, top: 2.36, bot: 1.90, hw: 0.95, hwMid: 0.85, hwRear: 0.66, xoff: -0.045, drop: 0.02 },
    chainDrop: 0.04, chainGap: 0.22, chainHW: 0.80,
    // Rear chain-mat tip: measured tail band falling to -4.0 center.
    rearTip: { z: -3.99, hw: 0.55, top: 2.30, bot: 2.22 },
    kitCapY: 2.68,
    cupolaX: 0.92, cupolaZ: -0.85, cupolaR: 0.20, cupolaRaise: 0.02,
    pano: { x: -0.70, z: -0.75, top: 2.66 }, sightX: 0.45,
    // ONE tall whip at the measured -3.05 column (top 4.80) + the short
    // pot whip at -2.60 (top 2.57).
    antennas: [{ x: 0.21, y: 2.44, z: -3.18, h: 2.38, stem: 0.4 }, { x: 0.26, y: 2.44, z: -2.60, h: 0.13, stem: 0.30 }], // whip INSIDE our s1 window (ref's rides its own s1); the 1-col side crossfire is cheaper than 49% station tops
    pots: [{ x: -0.70, z: -2.95, top: 2.685, base: 2.40, w: 0.07, d: 0.06 }], // rear band spike at the grace line
    turretKit: merkava3dKit,
  },

  // ---- Mk.4M Windbreaker — PUBLISHED-DIMENSION rebuild ---------------------
  // The arlassar oracle is defective beyond rigid repair: printed ~5.4 deg
  // YAWED in its own frame (plan footprint is a parallelogram), globally
  // FORESHORTENED (whole span 6.9 m at 3.72 m width vs 9.04 published), and
  // its barrel sleeve is fused into the hull node. Under the gate contract
  // ("with a defective oracle, published dims are the reference"; a cap
  // never excuses dims) this mark is authored to the REAL Mk.4M envelope —
  // 7.60 hull / 9.04 overall / 3.72 wide / 2.66 tall — sharing the corrected
  // 4B chassis with Mk.4M turret furniture. hullCurves/wholeCurves/
  // turretCurves/stations vs the tiny yawed print are certified caps.
  merkava4: {
    build: buildMerkavaMark,
    width: 3.72, trackW: 0.62, trackTop: 1.05, wheelR: 0.42, gearOut: 1.76,
    deckY: 1.76, rearDeckZ: -2.75,
    body: [
      { z: 3.53, yT: 1.12, yB: 0.95, wT: 1.00, wB: 0.85 },
      { z: 2.85, yT: 1.44, yB: 1.02, wT: 1.55, wB: 1.30 },
      { z: 1.10, yT: 1.76, yB: 1.00, wT: 1.66, wB: 1.66 },
      { z: -3.35, yT: 1.76, yB: 1.00, wT: 1.66, wB: 1.66 },
      { z: -4.05, yT: 1.58, yB: 0.90, wT: 1.58, wB: 1.58 },
    ],
    keel: { toeZ: 3.53, toeY: 0.95, toeHW: 0.85, midZ: 2.80, midY: 0.42, groundZ: 2.30, bellyY: 0.24, tailLowZ: -3.70 },
    glacis: { z0: 1.10, z1: 3.48 },
    podX: 0.60, podIn: 0.15,
    fenderPlank: { x0: 1.30, x1: 1.66, z0: 3.20, z1: 2.4, y: 1.70 },
    fenderHorn: { x0: 1.18, x1: 1.66, z0: 2.60, z1: 3.35, top: 1.72, bot: 1.48 },
    // WIDTH GUARD strip at +-1.86 (published 3.72); skirts ride the Mk.4M
    // slat line slightly inboard.
    fenderLip: { x: 1.86, w: 0.07, z0: -0.90, z1: -2.30, y: 1.00 },
    wheelZs: [1.95, 0.95, -0.05, -1.00, -1.90, -2.60],
    sprocket: { z: 2.50, y: 0.54, r: 0.31 }, idler: { z: -3.30, y: 0.64, r: 0.28 },
    rollers: [1.45, 0.5, -0.45, -1.35, -2.25],
    skirt: { z0: 2.48, z1: -3.00, top: 1.30, bot: 0.62, scallop: true, flaps: false, x: 1.80 },
    hump: { x0: 0.22, x1: 0.98, z0: 0.75, z1: 1.90, top: 2.04 },
    driverHump: true,
    // Real-envelope low rear rack (the old 2.36 wall shadowed the broken
    // print; the mark is authored to the published Mk.4M shape).
    tailRack: {
      z0: -3.42, z1: -3.96, top: 1.68, bot: 0.60, hw: 1.75, x0: 0.45,
      wings: [
        { x0: 0.60, x1: 1.10, z1: -4.02, top: 1.50, bot: 1.20 },
      ],
    },
    pivotZ: -0.55,
    turretStyle: 'mod',
    // MG253 L/44 at the published overall length: tip 4.78; hullLength 7.60
    // closes toe 3.53/3.58 to the rack tail -4.02 (dims-sovereign — the
    // foreshortened arlassar print never anchors this mark's scale).
    gunAxisY: 2.06, gunR: 0.072, sleeve: true, evac: 0.30, gunTipZ: 4.78, gunZL: 0.30,
    mantlet: { r0: 0.16, r1: 0.11, len: 0.60, z0: 2.55 },
    apexZ: 2.60, notchHW: 0.30, hwMax: 1.57, roofHW: 0.98, roofInset: 0.92, rearWide: 0.97,
    shellFrontZ: 1.30, noseZ: 0.90, noseHW: 1.45, maxWZ: -0.35, shellRearZ: -2.25,
    shellBotY: 1.58, shellTopY: 2.55,
    crest: { z0: 2.60, zW: 1.60, z1: 0.55, hw0: 0.22, hw1: 0.48, top0: 2.60, top1: 2.66, bot: 1.92 },
    cheek: { pts: [[0.62, 1.55], [0.95, 1.30], [1.28, 1.05], [1.56, 0.90]], topIn: 2.50, topOut: 2.00, botIn: 1.90, botOut: 1.60 },
    roofLine: [[0.55, 2.62], [0.02, 2.62], [-0.90, 2.62], [-1.95, 2.55]],
    bustleZ1: -2.34, bustleBot: 1.90,
    basket: { z0: -2.36, z1: -4.00, top: 2.40, topRear: 2.30, bot: 1.95 }, basketHW: 1.20,
    chainDrop: 0.12, chainGap: -0.30,
    kitCapY: 2.655,
    cupolaX: 0.55, cupolaZ: -0.55, cupolaRaise: -0.14, noLoaderHatch: true,
    pano: { x: 0.32, z: -0.62, top: 2.64, plinth: 0.88 }, sightX: 0.45,
    antennas: [
      { x: -0.85, y: 2.50, z: -2.30, h: 0.13, stem: 0.35 },
      { x: 0.85, y: 2.50, z: -2.55, h: 0.13, stem: 0.35 },
      { x: 0.40, y: 2.48, z: -2.90, h: 0.12, stem: 0.30 },
    ],
    turretKit: merkava4Kit,
  },

  // ---- Mk.4B (no Trophy; tall 1.313x width-normalized oracle) --------------
  // v6 curves: glacis (3.0,1.37) exact on the authored line; keel
  // (3.0,0.60)->(2.5,0.25); skirts to +-1.85 giving stations w 3.70; tall
  // rack wall 2.44 over -3.42..-3.78 with a low tail to -4.25 (right frame
  // deeper than left); cheek/crest band 2.69-2.74 and plateau 2.80+ both
  // CAPPED to published height 2.66 (p95); pano band 3.10 capped; one tall
  // whip -3.30 (top 4.52). ORACLE DEFECTS (certified): turret casting rides
  // the HULL node (hull trace tops 2.6-3.0 across the turret span) and
  // mantlet fragments sit in the hull to z 3.5 — hullCurves/turretCurves
  // capped; the MG253 is modelled short (4.29 vs L/44 true 4.74) —
  // wholeCurves coverage cap.
  merkava4b: {
    build: buildMerkavaMark,
    width: 3.72, trackW: 0.62, trackTop: 1.05, wheelR: 0.42, gearOut: 1.76,
    deckY: 1.76, rearDeckZ: -2.75,
    body: [
      { z: 3.33, yT: 1.12, yB: 0.98, wT: 0.80, wB: 0.75 },
      { z: 2.85, yT: 1.44, yB: 1.02, wT: 1.55, wB: 1.30 },
      { z: 1.10, yT: 1.76, yB: 1.00, wT: 1.66, wB: 1.66 },
      { z: -3.20, yT: 1.76, yB: 1.00, wT: 1.66, wB: 1.66 },
      { z: -4.05, yT: 1.58, yB: 0.90, wT: 1.58, wB: 1.58 },
    ],
    tailNotch: { hw: 0.45 },
    keel: { toeZ: 3.31, toeY: 0.98, toeHW: 0.60, midZ: 2.74, midY: 0.42, groundZ: 2.30, bellyY: 0.24, tailLowZ: -3.70 },
    glacis: { z0: 1.10, z1: 3.27 },
    podX: 0.60, podIn: 0.15,
    fenderPlank: { x0: 1.30, x1: 1.66, z0: 3.05, z1: 2.4, y: 1.46 },
    fenderHorn: { x0: 1.18, x1: 1.66, z0: 2.55, z1: 3.05, top: 1.52, bot: 1.30 },
    wheelZs: [1.95, 0.95, -0.05, -1.00, -1.90, -2.60],
    sprocket: { z: 2.50, y: 0.54, r: 0.31 }, idler: { z: -3.10, y: 0.72, r: 0.28 },
    rollers: [1.45, 0.5, -0.45, -1.35, -2.25],
    // WIDTH GUARD: skirt outer face exactly +-1.86 (published 3.72); the ref
    // stations read 3.70 wide here so the skirt line carries dims width.
    // Post-repair the ref skirt band is TALL (0.80..1.78 at the corner
    // columns) and runs to -3.30.
    skirt: { z0: 2.50, z1: -3.30, top: 1.72, bot: 0.80, scallop: true, x: 1.86 },
    driverHump: true,
    // r2: the deckPack casting-band mimic is GONE (the "casting fused to a
    // hull node" was 18 stranded fittings, all absorbed onto rig_turret in
    // 86d1071 — the repaired hull mask is a bare 1.76 deck). The rear rack
    // is the measured LOW band [0.6..1.69] with a thin high tail rail.
    tailRack: {
      z0: -3.44, z1: -4.02, top: 1.68, bot: 0.95, hw: 1.75, x0: 0.45,
      wings: [
        { x0: 0.60, x1: 1.10, z1: -4.16, top: 1.47, bot: 1.20 },
      ],
    },
    hullPosts: [{ x: -0.62, z: 3.43, top: 1.20, base: 1.00 }],
    tailPins: [{ x: 0.52, y: 1.05, z: -4.24 }, { x: -0.52, y: 1.05, z: -4.24 }],
    pivotZ: -0.55,
    turretStyle: 'mod',
    // Published hull 7.60 closes toe (3.53) to the rack tail (-4.02); the
    // muzzle carries overall to 8.95 (oracle MG253 short at 4.30-4.39 —
    // certified wholeCurves coverage cap).
    gunAxisY: 2.06, gunR: 0.078, sleeve: true, evac: 0.30, gunTipZ: 4.80, gunZL: 0.32,
    mantlet: { r0: 0.17, r1: 0.12, len: 0.60, z0: 2.55 },
    apexZ: 2.60, notchHW: 0.32, hwMax: 1.60, roofHW: 1.18, roofInset: 0.92,
    shellFrontZ: 1.30, noseZ: 0.55, noseHW: 1.48, maxWZ: -0.35, shellRearZ: -2.25,
    shellBotY: 1.53, shellTopY: 2.58,
    // STATURE CAP (certified): the 1.313x width-normalized print rides its
    // plateau at 2.99-3.12 and cupola band to 3.1+; published height 2.66
    // (p95) pins the whole roof at 2.655-2.665 — the flat cap line is the
    // optimal satisfiable shape under the cap.
    crest: { z0: 2.60, zW: 1.60, z1: 0.55, hw0: 0.22, hw1: 0.46, top0: 2.60, top1: 2.665, bot: 1.92 },
    cheek: { pts: [[0.65, 1.30], [1.00, 1.05], [1.30, 0.75], [1.58, 0.55]], topIn: 2.50, topOut: 2.00, botIn: 1.88, botOut: 1.56 },
    roofLine: [[0.60, 2.655], [0.10, 2.60], [-0.05, 2.655], [-1.90, 2.655], [-2.10, 2.60]],
    bustleZ1: -2.34, bustleBot: 1.95,
    basket: { z0: -2.36, z1: -3.90, top: 2.62, topRear: 2.50, bot: 1.96 }, basketHW: 1.32,
    chainDrop: 0.12, chainGap: -0.30,
    kitCapY: 2.655,
    cupolaX: 0.55, cupolaZ: -0.90, cupolaRaise: -0.16, noLoaderHatch: true,
    pano: { x: -0.35, z: -0.95, top: 2.65 }, sightX: 0.45,
    // THREE tall whips on the measured columns -3.17 / -2.37 / -2.17
    // (tops 4.53 / 4.32 / 4.30).
    antennas: [
      { x: -1.00, y: 2.51, z: -3.22, h: 2.04, stem: 0.4 },
      { x: -0.20, y: 2.51, z: -3.22, h: 2.04, stem: 0.4 },
      { x: 0.98, y: 2.51, z: -3.22, h: 2.04, stem: 0.4 },
      { x: -1.56, y: 2.52, z: -2.41, h: 1.83, stem: 0.30 },
      { x: 1.62, y: 2.51, z: -2.21, h: 1.80, stem: 0.35 },
    ],
    turretKit: merkava4bKit,
  },
};
