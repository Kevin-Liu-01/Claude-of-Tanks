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
  const k = c.keel; // { toeZ, toeY, toeHW, midZ, midY, groundZ, bellyY, tailLowZ }
  P.add('hull', box(innerW, c.trackTop - k.bellyY + 0.10, k.groundZ - k.tailLowZ),
    0, (c.trackTop + k.bellyY) / 2 + 0.05, (k.groundZ + k.tailLowZ) / 2);
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
        for (const dz of fp.drops.z) {
          P.add('hullRubber', box(0.05, fp.y - 0.06 - fp.drops.bot, 0.30),
            s * (fp.x1 - 0.04), (fp.y - 0.06 + fp.drops.bot) / 2, dz);
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
  if (c.fenderLip) {
    const fl = c.fenderLip; // { x(outer face), w, z0|[L,R], z1|[L,R], y }
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
  if (c.frontBoard) { // low fender board over the sprocket (skirt lead)
    const fb = c.frontBoard;
    for (const s2 of [-1, 1]) {
      P.add('hull', box(fb.x1 - fb.x0, 0.05, fb.z0 - fb.z1), s2 * (fb.x0 + fb.x1) / 2, fb.y, (fb.z0 + fb.z1) / 2);
      P.add('hullRubber', box(fb.x1 - fb.x0 - 0.05, 0.14, 0.028), s2 * (fb.x0 + fb.x1) / 2, fb.y - 0.09, fb.z0 + 0.005, -0.25, 0, 0);
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
  const glacisRx = -Math.atan2(gTop(g.z0) - gTop(g.z1 - 0.01), g.z1 - g.z0 - 0.01);
  const dhZ = g.z0 + (g.z1 - g.z0) * 0.28;
  const dhY = gTop(dhZ);
  P.add('hull', box(0.52, 0.05, 0.58), -w * 0.20, dhY + 0.01, dhZ, glacisRx, 0, 0);
  P.add('hullDark', box(0.55, 0.018, 0.61), -w * 0.20, dhY + 0.005, dhZ, glacisRx, 0, 0);
  periscope(P, 'hullDetail', -w * 0.20, dhY + 0.055, dhZ - 0.40);
  if (!c.hump) { // Mk.1-3: intake louvres on the glacis slope right of the driver
    const lvZ = g.z0 + (g.z1 - g.z0) * 0.34;
    const lvY = gTop(lvZ) + 0.012;
    P.add('hullDark', box(w * 0.24, 0.020, 0.72), w * 0.22, lvY, lvZ, glacisRx, 0, 0);
    for (let i = 0; i < 6; i++) {
      const fz = lvZ + 0.27 - i * 0.108;
      P.add('hullDetail', box(w * 0.22, 0.024, 0.038), w * 0.22, gTop(fz) + 0.026, fz, glacisRx, 0, 0);
    }
  }
  for (const s of [-1, 1]) {
    const hx = s * (c.podX ?? w * 0.33), hz = g.z1 - (c.podIn ?? 0.02);
    const hy = c.podY ?? (gTop(hz + 0.15) + 0.10);
    P.add('hullDetail', box(0.17, 0.11, 0.13), hx, hy - 0.01, hz - 0.10);
    headlight(P, hx, hy + 0.02, hz, -0.3, 0.05);
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
    P.add('hull', box(0.50, 0.042, 1.00), -w * 0.20, gTop(dhZ + 0.55) + 0.035, dhZ + 0.55, glacisRx, 0, 0);
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
  const deckY = c.deckY, rd = c.rearDeckZ;
  P.add('hullDark', box(w * 0.30, 0.02, 0.55), -w * 0.19, deckY + 0.015, rd + 0.55);
  for (let i = 0; i < 4; i++) {
    P.add('hullDetail', box(w * 0.27, 0.026, 0.04), -w * 0.19, deckY + 0.028, rd + 0.35 + i * 0.135);
  }
  for (const fz of [rd + 0.35, rd + 0.95]) {
    P.add('hullDetail', KIT.cylY(0.055, 0.055, 0.035, 10), w * 0.36, deckY + 0.02, fz);
  }
  liftEye(P, 'hullDetail', -w * 0.34, deckY + 0.02, rd + 0.32);
  liftEye(P, 'hullDetail', w * 0.34, deckY + 0.02, rd + 0.32);

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
      // main plate leans 8 mm (bottom tucked) so the near/far-clipped
      // station slices rasterize the skirt line (edge-on box fix)
      {
        const inB = s * (sx - 0.026) - s * 0.02, outB = s * (sx + 0.026) - s * 0.02;
        const inT = s * (sx - 0.026), outT = s * (sx + 0.026);
        const [sbL, sbR] = s > 0 ? [inB, outB] : [outB, inB];
        const [stL, stR] = s > 0 ? [inT, outT] : [outT, inT];
        P.add('hull', slab(
          [sbL, sk.bot, z0], [sbR, sk.bot, z0], [sbR, sk.bot, z1], [sbL, sk.bot, z1],
          [stL, sk.top, z0], [stR, sk.top, z0], [stR, sk.top, z1], [stL, sk.top, z1]));
      }
      if (sk.scallop) for (let i = 0; i < c.wheelZs.length - 1; i++) {
        const z = (c.wheelZs[i] + c.wheelZs[i + 1]) / 2;
        if (z > z1 && z < z0) {
          P.add('hull', box(0.052, 0.22, Math.abs(c.wheelZs[i] - c.wheelZs[i + 1]) * 0.74),
            s * sx, sk.bot - 0.06, z);
        }
      }
      const panels = 7;
      for (let i = 0; i <= panels; i++) {
        const pz = z0 - i * ((z0 - z1) / panels);
        P.add('hullDark', box(0.058, (sk.top - sk.bot) * 0.86, 0.02), s * (sx + 0.008), (sk.top + sk.bot) / 2, pz);
        if (i < panels) {
          P.add('hullDark', KIT.cylX(0.020, 0.016, 8), s * (sx + 0.028), sk.top - 0.09, pz - ((z0 - z1) / panels) / 2);
        }
      }
      P.add('hullRubber', box(0.024, 0.12, z0 - z1), s * (sx + 0.012), sk.bot + 0.04, (z0 + z1) / 2);
      if (sk.fringe) P.add('hullRubber', box(0.026, 0.10, z0 - z1), s * (sx + 0.008), sk.bot - 0.10, (z0 + z1) / 2);
      if (sk.flaps !== false) {
        P.add('hullRubber', box(0.30, 0.34, 0.035), s * xc, sk.bot + 0.05, c.sprocket.z + c.sprocket.r + 0.16, -0.12, 0, 0);
      }
      P.add('hullRubber', box(0.30, 0.30, 0.035), s * xc, sk.bot + 0.02, c.idler.z - c.idler.r - 0.12, 0.12, 0, 0);
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
      for (const s of [-1, 1]) {
        const xm = s * (x0 + tr.hw) / 2, wd = tr.hw - x0;
        P.add('hullCloth', box(wd, (tr.top - tr.bot) * 0.94, len * 0.94), xm, (tr.top + tr.bot) / 2, mid);
        P.add('hullDark', box(wd + 0.02, (tr.top - tr.bot) * 0.9, 0.022), xm, (tr.top + tr.bot) / 2 - 0.01, mid + 0.28 * len);
        for (const ry of [tr.bot + 0.04, tr.top - 0.04]) {
          P.add('hullDark', box(0.04, 0.04, len), s * tr.hw, ry, mid);
          P.add('hullDark', box(wd, 0.04, 0.04), xm, ry, tr.z1 + 0.02);
        }
        P.add('hullDark', box(0.038, tr.top - tr.bot, 0.038), s * tr.hw, (tr.top + tr.bot) / 2, tr.z1 + 0.02);
        P.add('hullDark', box(0.038, tr.top - tr.bot, 0.038), s * x0 + (s > 0 ? 0.02 : -0.02), (tr.top + tr.bot) / 2, tr.z1 + 0.02);
      }
      P.add('hullDark', box(x0 * 2, 0.035, 0.035), 0, tr.bot + 0.04, tr.z1 + 0.35);
      KIT.jerryCan(P, 'hullCloth', -tr.hw + 0.25, tr.top - 0.34, mid + 0.06, 0.15);
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
        P.add('hullCloth', box(wd, (wg.top - wg.bot) * 0.9, wlen * 0.96), xm, (wg.top + wg.bot) / 2, wmid);
        for (const ry of [wg.bot + 0.03, wg.top - 0.03]) {
          P.add('hullDark', box(0.036, 0.036, wlen + 0.14), xm, ry, wmid + 0.05);
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
  if (c.rearPack) {
    const rp = c.rearPack; // { hw, z0, z1, top, bot, x? }
    const rx = rp.x ?? 0;
    P.add('hullCloth', box(rp.hw * 2, rp.top - rp.bot, rp.z0 - rp.z1), rx, (rp.top + rp.bot) / 2, (rp.z0 + rp.z1) / 2);
    P.add('hullDark', box(rp.hw * 2 + 0.02, (rp.top - rp.bot) * 0.9, 0.022), rx, (rp.top + rp.bot) / 2, (rp.z0 + rp.z1) / 2 - 0.02);
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
      P.add('hullDetail', box(0.07, 0.06, 0.05), hp.x, hp.base + 0.03, hp.z);
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
function merkavaSmokeCluster(P, x, y, z, yaw = 0, n = 5, opts = {}) {
  const { box, cylY } = KIT;
  const pitch = opts.pitch ?? -0.30;
  const tubeL = opts.recessed ? 0.09 : 0.15;
  const lift = opts.recessed ? 0.015 : 0.035;
  if (opts.recessed) {
    P.add('turretDark', box(0.30, 0.018, 0.20), x, y, z, pitch, yaw, 0);
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
    const d = drop + (i % 3) * 0.05;
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
  P.add('turretCloth', box(b.hw * 1.86, (b.top - b.bot) * 0.80, len * 0.92),
    bx - b.hw * 0.04, b.bot + (b.top - b.bot) * 0.42, mid - len * 0.02);
  P.add('turretCloth', box(b.hw * 0.90, (b.top - b.bot) * 0.55, len * 0.52),
    b.hw * 0.42, b.bot + (b.top - b.bot) * 0.32, mid + len * 0.08);
  if (b.coil) {
    P.add('turretDark', KIT.torus(0.14, 0.045, 18, 8), b.coil, midY + 0.04, b.z1 - 0.04, Math.PI / 2, 0, 0);
    P.add('turretDark', KIT.cylZ(0.05, 0.06, 10), b.coil, midY + 0.04, b.z1 - 0.04);
  }
  chainCurtain(P, b.hw * 0.92, b.z1 - (b.chainGap ?? 0.16), b.bot + 0.10, b.chainDrop ?? 0.32, b.z1 + 0.04);
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
    P.add('turretDark', box(0.022, a.h, 0.022), a.x, a.y + a.h / 2 - 0.02, a.z, 0, 0, (a.x > 0 ? 1 : -1) * 0.006);
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
  const { box, cylY, polyTurret, slab, lathe } = KIT;
  const apex = t.apexZ, gy = t.apexY;
  const sf = t.shoulderZ;        // full-height casting begins here
  const hwM = t.hwMax;
  const rf = t.roof;             // [[z, y]] shell crest line front->rear (local)

  // Shell: one low casting; the roof slabs above carry the measured crest.
  // r2: the rear ring holds near-full width to the shell rear (the measured
  // plan keeps ~±1.2 out to the bustle; the old 0.80 taper pinched it).
  const shellH = rf[0][1] - 0.06;
  P.add('turret', polyTurret([
    [-t.notchHW * 1.5, apex - 0.06], [t.notchHW * 1.5, apex - 0.06],
    [hwM * 0.72, sf], [hwM, sf - 0.55],
    [hwM * 0.99, t.shellRearZ + 0.40], [hwM * 0.90, t.shellRearZ],
    [-hwM * 0.90, t.shellRearZ], [-hwM * 0.99, t.shellRearZ + 0.40],
    [-hwM, sf - 0.55], [-hwM * 0.72, sf],
  ], shellH, 1.0, t.roofInset ?? 0.74));

  // Cast cheek beak: one continuous plane per side from the gun-notch band
  // to the roof shoulder. Undersides stay at the measured casting-bottom
  // line (~gy-0.16) — the repaired turret masks bottom high at the face.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.12, gy - 0.16, apex], [s * (t.notchHW + 0.04), gy - 0.14, apex - 0.04],
      [s * hwM * 0.74, 0.16, sf - 0.35], [s * 0.06, 0.16, sf - 0.30],
      [s * 0.12, gy + 0.22, apex], [s * (t.notchHW + 0.04), gy + 0.19, apex - 0.04],
      [s * hwM * 0.62, shellH + 0.02, sf - 0.30], [s * 0.06, rf[0][1], sf - 0.28]));
  }
  P.add('turret', box(0.34, 0.12, apex - sf + 0.30), 0, gy - 0.18, (apex + sf) / 2 - 0.12);
  // Narrow brow mass over the mantlet (Mk.1B searchlight/MG bracket): the
  // measured side band tops ~2.56 out to z~1.5 while the PLAN keeps the
  // casting nose inside ~1.2 — so the brow stays inside the gun's plan
  // columns (|x| <= 0.19) and never leads the casting footprint.
  if (t.brow) {
    const b = t.brow; // { z0, z1, top }
    P.add('turret', box(0.38, 0.10, b.z0 - b.z1), 0, b.top - 0.20, (b.z0 + b.z1) / 2);
    P.add('turretDark', box(0.30, (b.top - 0.15) - (gy + 0.24), 0.30), 0, ((b.top - 0.15) + gy + 0.24) / 2, (b.z0 + b.z1) / 2 + 0.05);
    P.add('turretDark', box(0.36, 0.15, b.z0 - b.z1 - 0.10), 0, b.top - 0.075, (b.z0 + b.z1) / 2 - 0.02);
    P.add('turretGlass', box(0.22, 0.10, 0.02), 0, b.top - 0.16, b.z0 - 0.02);
  }

  // Roof: slabs following the measured rising crest line.
  for (let i = 0; i < rf.length - 1; i++) {
    const [z0, y0] = rf[i], [z1, y1] = rf[i + 1];
    const w0 = t.roofHW * (i === 0 ? 0.9 : 1.0), w1 = t.roofHW * (i + 1 === rf.length - 1 ? 0.94 : 1.0);
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
      P.add('turret', slab(
        [-ahw, y0, z0], [ahw, y0, z0], [ahw, y1, z1], [-ahw, y1, z1],
        [-ahw, y0 + 0.30, z0], [ahw, y0 + 0.30, z0], [ahw, y1 + 0.30, z1], [-ahw, y1 + 0.30, z1]));
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
  P.add('turret', cylY(0.11, 0.12, 0.035, 10), cs.x * 0.5, roofAt(t.sightZ - 0.1) + 0.02, t.sightZ - 0.32);
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
  merkavaBasket(P, {
    hw: t.basketHW, z0: t.basket.z0, z1: t.basket.z1, xoff: t.basketXoff,
    top: t.basket.top, topRear: t.basket.topRear, bot: t.basket.bot,
    coil: hwM * 0.26, chainDrop: t.chainDrop ?? 0.34, chainGap: t.chainGap,
  });
  // trailing stow/chain vane behind the basket (measured falling band).
  // Chains stay SHORT: the repaired refs' turret masks bottom at ~basket
  // floor height across the tail (long drops read as excess volume).
  if (t.tailVane) {
    const tv = t.tailVane; // { z0, z1, top, bot, hw, drop? }
    P.add('turretDark', box(0.04, 0.04, tv.z0 - tv.z1 + 0.08), 0, tv.top - 0.02, (tv.z0 + tv.z1) / 2 + 0.02);
    P.add('turretCloth', KIT.slab(
      [-tv.hw, tv.bot, tv.z0], [tv.hw, tv.bot, tv.z0], [tv.hw * 0.8, tv.bot + 0.1, tv.z1], [-tv.hw * 0.8, tv.bot + 0.1, tv.z1],
      [-tv.hw, tv.top, tv.z0], [tv.hw, tv.top, tv.z0], [tv.hw * 0.8, tv.top - 0.18, tv.z1], [-tv.hw * 0.8, tv.top - 0.18, tv.z1]));
    chainCurtain(P, tv.hw * 0.9, tv.z1 + 0.05, tv.bot + 0.14, tv.drop ?? 0.14, tv.z1 + 0.30);
  }
  // smoke cluster snugged low on the port cheek (the measured plan keeps the
  // casting front inside z~1.2 at cheek width — the rosette must not lead it)
  merkavaSmokeCluster(P, -hwM * 0.42, gy + 0.40, apex - 0.85, -0.55, 5, { pitch: -0.34 });
}

// ---------------------------------------------------------------------------
// Mk.3/Mk.4 modular wedge turret, curve-driven: continuous raked cheek
// planes from the gun notch to the roof shoulders, a proud gun-mount crest
// over the trunnions (3-series/4B), the measured roof plateau + rear slope,
// flush bustle and the long rear basket.
// ---------------------------------------------------------------------------
function merkavaModularTurret(P, t) {
  const { box, cylY, polyTurret, slab, frustum } = KIT;
  const apex = t.apexZ, hwM = t.hwMax, gy = t.apexY;
  const sf = t.shellFrontZ;
  const rf = t.roof; // [[z,y]] measured crest line front->rear (local)
  const roofF = rf[0][0], h = rf[0][1];

  // Main wedge shell to the roof-front height; roof slabs carry the line.
  const rw = t.rearWide ?? 0.94;
  P.add('turret', polyTurret([
    [-t.notchHW * 1.4, sf], [t.notchHW * 1.4, sf],
    [hwM * 0.68, sf - (sf - t.maxWZ) * 0.5], [hwM, t.maxWZ],
    [hwM * (rw + 0.04), t.shellRearZ + 0.55], [hwM * rw, t.shellRearZ],
    [-hwM * rw, t.shellRearZ], [-hwM * (rw + 0.04), t.shellRearZ + 0.55],
    [-hwM, t.maxWZ], [-hwM * 0.68, sf - (sf - t.maxWZ) * 0.5],
  ], h - 0.04, 1.0, t.roofInset ?? 0.72));

  // Front cheek planes: notch band -> roof shoulders in one sweep.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.10, gy - 0.32, apex], [s * (t.notchHW + 0.03), gy - 0.29, apex - 0.05],
      [s * hwM * 0.86, 0.14, sf - 0.15], [s * 0.06, 0.14, sf - 0.10],
      [s * 0.10, gy + 0.22, apex], [s * (t.notchHW + 0.03), gy + 0.19, apex - 0.05],
      [s * t.roofHW, h - 0.02, sf - 0.32], [s * 0.06, h - 0.02, sf - 0.30]));
  }
  P.add('turret', box(t.notchHW * 2 + 0.12, 0.12, apex - sf + 0.24), 0, gy - 0.20, (apex + sf) / 2 + 0.05);

  // Casting-ring apron (see merkavaSmallTurret): the repaired refs' turret
  // masks bottom at the carved ring plane, rising fore/aft.
  if (t.apron) {
    const ahw = t.apronHW ?? hwM * 0.80;
    for (let i = 0; i < t.apron.length - 1; i++) {
      const [z0, y0] = t.apron[i], [z1, y1] = t.apron[i + 1];
      P.add('turret', slab(
        [-ahw, y0, z0], [ahw, y0, z0], [ahw, y1, z1], [-ahw, y1, z1],
        [-ahw, y0 + 0.30, z0], [ahw, y0 + 0.30, z0], [ahw, y1 + 0.30, z1], [-ahw, y1 + 0.30, z1]));
    }
  }

  // Gun-mount crest: the armored rotor housing standing proud of the roof
  // (the measured 3/4B silhouettes crest FORWARD of the plateau).
  if (t.crest) {
    const cr = t.crest; // { z0, z1, top, hw }
    P.add('turret', slab(
      [-cr.hw * 0.8, gy + 0.10, cr.z0], [cr.hw * 0.8, gy + 0.10, cr.z0],
      [cr.hw, h - 0.05, cr.z1], [-cr.hw, h - 0.05, cr.z1],
      [-cr.hw * 0.62, cr.top - 0.16, cr.z0 - 0.02], [cr.hw * 0.62, cr.top - 0.16, cr.z0 - 0.02],
      [cr.hw * 0.86, cr.top, cr.z1], [-cr.hw * 0.86, cr.top, cr.z1]));
    P.add('turretDark', box(cr.hw * 1.1, 0.03, 0.03), 0, cr.top - 0.035, cr.z1 + 0.02);
  }

  // Roof plateau + measured rear slope, one crest line.
  for (let i = 0; i < rf.length - 1; i++) {
    const [z0, y0] = rf[i], [z1, y1] = rf[i + 1];
    const w0 = t.roofHW * (i === 0 ? 0.92 : 1.0);
    const w1 = i + 2 === rf.length ? hwM * 0.80 : t.roofHW;
    P.add('turret', slab(
      [-w0, y0 - 0.09, z0], [w0, y0 - 0.09, z0], [w1, y1 - 0.09, z1], [-w1, y1 - 0.09, z1],
      [-w0 * 0.97, y0, z0], [w0 * 0.97, y0, z0], [w1 * 0.97, y1, z1], [-w1 * 0.97, y1, z1]));
  }
  const rearRoof = rf[rf.length - 1];

  // Bustle: flush continuation of the shell walls to the basket face.
  const bHW = t.bustleHW ?? hwM * rw;
  P.add('turret', frustum(bHW, t.shellRearZ + 0.30, t.bustleZ1, bHW - 0.05,
    t.shellRearZ + 0.26, t.bustleZ1 + 0.05, t.bustleBot, rearRoof[1] - 0.02));

  // Long rear basket + chains.
  if (t.basket) {
    merkavaBasket(P, {
      hw: t.basketHW, z0: t.basket.z0, z1: t.basket.z1, xoff: t.basketXoff,
      top: t.basket.top, topRear: t.basket.topRear, bot: t.basket.bot,
      chainDrop: t.chainDrop ?? 0.30, chainGap: t.chainGap,
    });
  }
  // Trailing chain-mat vane behind the basket (3-series: the repair moved
  // the ex_armor chain mats onto rig_turret — band ~[1.88..2.3] to z -3.95).
  if (t.tailVane) {
    const tv = t.tailVane;
    P.add('turretDark', box(0.04, 0.04, tv.z0 - tv.z1 + 0.08), 0, tv.top - 0.02, (tv.z0 + tv.z1) / 2 + 0.02);
    P.add('turretCloth', slab(
      [-tv.hw, tv.bot, tv.z0], [tv.hw, tv.bot, tv.z0], [tv.hw * 0.85, tv.bot + 0.08, tv.z1], [-tv.hw * 0.85, tv.bot + 0.08, tv.z1],
      [-tv.hw, tv.top, tv.z0], [tv.hw, tv.top, tv.z0], [tv.hw * 0.85, tv.top - 0.10, tv.z1], [-tv.hw * 0.85, tv.top - 0.10, tv.z1]));
    chainCurtain(P, tv.hw * 0.9, tv.z1 + 0.05, tv.bot + 0.12, tv.drop ?? 0.12, tv.z1 + 0.30);
  }

  // Roof kit: commander cupola (+ raise), loader hatch on 3-series, pano
  // pod + gunner hood; per-mark kits add MGs/smoke/panels.
  KIT.cupola(P, 'turret', t.cupolaX, h + (t.cupolaRaise ?? 0), t.cupolaZ, 0.24, 0.12, 6);
  if (!t.noLoaderHatch) {
    P.add('turret', cylY(0.20, 0.20, 0.05, 14), -t.cupolaX * 0.9, h - 0.02, t.cupolaZ + 0.10);
    P.add('turret', box(0.07, 0.05, 0.10), -t.cupolaX * 0.9 - (t.cupolaX > 0 ? 0.22 : -0.22), h, t.cupolaZ + 0.10);
  }
  if (t.pano) {
    if (t.pano.plinth) { // continuous raised sight deck (curve band, Mk.4)
      P.add('turret', box(1.00, 0.05, t.pano.plinth), 0.08, h + 0.025, t.pano.z + 0.20);
    }
    const py = t.pano.top - 0.27;
    P.add('turret', cylY(0.13, 0.15, 0.14, 12), t.pano.x, py + 0.07, t.pano.z);
    P.add('turret', KIT.sph(0.13, 12, Math.PI * 0.55), t.pano.x, py + 0.15, t.pano.z);
    P.add('turretGlass', box(0.13, 0.06, 0.02), t.pano.x, py + 0.13, t.pano.z + 0.125);
    if (t.pano.peak) { // true-height periscope/relay head, <=1 trace column
      P.add('turretDark', box(0.05, t.pano.peak.top - t.pano.top + 0.30, 0.05), t.pano.x + 0.08, (t.pano.peak.top + t.pano.top - 0.30) / 2, t.pano.peak.z);
      P.add('turretDark', box(0.14, 0.09, 0.09), t.pano.x + 0.08, t.pano.peak.top - 0.045, t.pano.peak.z);
    }
    if (t.pano.mast) { // comm sight mast stubs beside the pano head
      P.add('turretDetail', box(0.10, t.pano.top - h - 0.05, 0.10), t.pano.x + 0.55, (t.pano.top + h) / 2 - 0.02, t.pano.z - 0.15);
    }
  }
  P.add('turret', box(0.32, 0.13, 0.30), t.sightX ?? 0.42, h - 0.045, roofF - 0.14);
  P.add('turretGlass', box(0.18, 0.05, 0.02), t.sightX ?? 0.42, h - 0.03, roofF + 0.015);
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
    roof: p.roofLine.map(([z, y]) => [L(z), V(y)]),
    maxWZ: p.maxWZ !== undefined ? L(p.maxWZ) : undefined,
    shellRearZ: L(p.shellRearZ),
    shellFrontZ: p.shellFrontZ !== undefined ? L(p.shellFrontZ) : undefined,
    shoulderZ: p.shoulderZ !== undefined ? L(p.shoulderZ) : undefined,
    bustleZ1: p.bustleZ1 !== undefined ? L(p.bustleZ1) : undefined,
    bustleBot: p.bustleBot !== undefined ? V(p.bustleBot) : 0.04,
    bustleHW: p.bustleHW,
    basket: p.basket ? { z0: L(p.basket.z0), z1: L(p.basket.z1), top: V(p.basket.top), topRear: p.basket.topRear !== undefined ? V(p.basket.topRear) : undefined, bot: V(p.basket.bot) } : undefined,
    basketHW: p.basketHW ?? p.hwMax * 0.66,
    basketXoff: p.basketXoff,
    chainDrop: p.chainDrop, chainGap: p.chainGap,
    station: p.station ? { x: p.station.x, z0: L(p.station.z0), z1: L(p.station.z1), top: V(p.station.top), hw: p.station.hw,
      peak: p.station.peak ? { z: L(p.station.peak.z), top: V(p.station.peak.top) } : undefined } : undefined,
    stow: p.stow ? { z0: L(p.stow.z0), z1: L(p.stow.z1), top: V(p.stow.top), bot: V(p.stow.bot), hw: p.stow.hw, xoff: p.stow.xoff } : undefined,
    tailVane: p.tailVane ? { z0: L(p.tailVane.z0), z1: L(p.tailVane.z1), top: V(p.tailVane.top), bot: V(p.tailVane.bot), hw: p.tailVane.hw, drop: p.tailVane.drop } : undefined,
    apron: p.apron ? p.apron.map(([z, y]) => [L(z), V(y)]) : undefined,
    apronHW: p.apronHW,
    capY: p.kitCapY !== undefined ? V(p.kitCapY) : undefined,
    brow: p.brow ? { z0: L(p.brow.z0), z1: L(p.brow.z1), top: V(p.brow.top) } : undefined,
    crest: p.crest ? { z0: L(p.crest.z0), z1: L(p.crest.z1), top: V(p.crest.top), hw: p.crest.hw } : undefined,
    sightZ: p.sightZ !== undefined ? L(p.sightZ) : undefined,
    noLoaderHatch: p.noLoaderHatch,
    cupolaX: p.cupolaX ?? -0.52,
    cupolaZ: L(p.cupolaZ ?? (p.roofLine.at(-1)[0] + 0.1)),
    cupolaRaise: p.cupolaRaise,
    pano: p.pano ? { x: p.pano.x, z: L(p.pano.z), top: V(p.pano.top), mast: p.pano.mast, plinth: p.pano.plinth,
      peak: p.pano.peak ? { z: L(p.pano.peak.z), top: V(p.pano.peak.top) } : undefined } : null,
    sightX: p.sightX,
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
  merkavaAntennas(P, p.antennas.map((a) => ({ x: a.x, y: V(a.y), z: L(a.z), h: a.h, stem: a.stem, potTop: a.potTop !== undefined ? V(a.potTop) : undefined })));
  // Free-standing roof pots/cans (measured 1-2 column bumps beside the
  // whips; tops capped under the published-height p95 line).
  if (p.pots) {
    for (const pot of p.pots) { // { x, z, top, base?, w?, d? }
      const base = pot.base ?? (pot.top - 0.30);
      P.add('turretDetail', box(pot.w ?? 0.18, pot.top - base, pot.d ?? 0.18), pot.x, V((pot.top + base) / 2), L(pot.z));
      P.add('turretDark', box((pot.w ?? 0.18) * 0.7, 0.04, (pot.d ?? 0.18) * 0.7), pot.x, V(pot.top - 0.02), L(pot.z));
    }
  }

  // Gun: trunnions behind the cheek apex; rotor collar + external mantlet
  // sleeve sized from the measured band; tube tip pinned to the oracle.
  const gunZL = p.gunZL ?? 0.32;
  P.gunG.position.set(0, V(p.gunAxisY), gunZL);
  const gLen = p.gunTipZ - p.pivotZ - gunZL + 0.03;
  const apexG = t.apexZ - gunZL;
  const m = p.mantlet; // { r0, r1, len, drop } external cast sleeve from the notch
  const mDrop = m.drop ?? 0;
  P.addGunExtra(cylZ(m.r0 * 1.12, 0.62, 16), 0, mDrop, apexG - 0.24);
  P.addGunExtra(cylZ(m.r0, m.len, 16, m.r0 * 1.08), 0, mDrop, apexG + m.len / 2 - 0.06);
  P.addGunExtra(cylZ(m.r1, 0.26, 14, m.r0 * 0.94), 0, mDrop * 0.5, apexG + m.len + 0.06);
  P.addGunExtraDark(cylZ(m.r0 * 1.02, 0.035, 16), 0, mDrop, apexG + m.len - 0.03);
  P.addGunExtraDark(cylZ(m.r1 * 1.04, 0.03, 14), 0, mDrop * 0.5, apexG + m.len + 0.17);
  KIT.buildGun(P, {
    len: gLen, r: p.gunR,
    sleeve: p.sleeve !== false, evac: p.evac ?? 0.30, collar: p.collar !== false,
    evacR: p.evacR ?? (p.sleeve !== false ? 1.9 : 1.62),
    baseR: Math.max(0.13, p.gunR * 2.0),
  });
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

// Cloth kit bundle with cinch straps.
function merkavaKitBundle(P, x, y, z, w, h, d) {
  const { box } = KIT;
  P.add('turretCloth', box(w, h, d), x, y, z);
  P.add('turretCloth', box(w * 1.04, h * 0.2, d * 1.04), x, y + h * 0.44, z);
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
function merkava3Kit(P, p, t) {
  const { box } = KIT;
  const cap = t.capY ?? (t.roof[0][1] + 0.24);
  if (t.crest) {
    P.add('turretDark', box(0.30, 0.13, 0.44), 0.24, t.crest.top - 0.075, t.crest.z1 + 0.28);
    P.add('turretDark', KIT.cylZ(0.022, 0.55, 8), 0.24, t.crest.top - 0.055, t.crest.z1 + 0.75);
    P.add('turret', box(0.26, 0.10, 0.30), -0.28, t.crest.top - 0.05, t.crest.z1 + 0.30);
  }
  merkavaMG(P, t.cupolaX * 0.70, cap - 0.23, t.cupolaZ - 0.32, 0.75);
  merkavaMG(P, -t.cupolaX * 0.78, cap - 0.20, t.cupolaZ + 0.05, 0.62);
  const sc = merkavaCheekPoint(t, 0.52, 0.80);
  merkavaSmokeCluster(P, -sc.x, sc.y - 0.04, sc.z, -0.45, 5, { pitch: -0.30 });
}

function merkava3dKit(P, p, t) {
  const { box } = KIT;
  merkava3Kit(P, p, t);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.60, 0.36, 0.85), s * t.hwMax * 0.46, t.apexY - 0.02, (t.apexZ + t.shellFrontZ) / 2 - 0.33, 0.06, s * 0.42, 0);
    P.add('turretDark', box(0.54, 0.025, 0.80), s * t.hwMax * 0.48, t.apexY + 0.18, (t.apexZ + t.shellFrontZ) / 2 - 0.35, 0.06, s * 0.42, 0);
  }
  KIT.tarpRoll(P, 'turretCloth', -0.15, t.roof.at(-1)[1] - 0.06, t.roof.at(-1)[0] + 0.28, 1.1, 0.09);
}

function merkava3bKit(P, p, t) {
  merkava3Kit(P, p, t);
  merkavaKitBundle(P, -0.45, t.roof.at(-1)[1] - 0.10, t.roof.at(-1)[0] + 0.40, 0.55, 0.16, 0.65);
  merkavaKitBundle(P, 0.50, t.roof.at(-1)[1] - 0.12, t.roof.at(-1)[0] + 0.25, 0.45, 0.14, 0.50);
}

function merkava3cKit(P, p, t) {
  merkava3Kit(P, p, t);
  merkavaKitBundle(P, -0.50, t.roof.at(-1)[1] - 0.10, t.roof.at(-1)[0] + 0.35, 0.58, 0.17, 0.72);
  merkavaKitBundle(P, 0.55, t.roof.at(-1)[1] - 0.12, t.roof.at(-1)[0] + 0.20, 0.48, 0.15, 0.55);
}

// ---------------------------------------------------------------------------
// Per-mark parameter tables — every number is read off the measured curves
// (docs/references/profiles/<id>.json decoded to world meters; see packets).
// ---------------------------------------------------------------------------

// Mk.1/2 shared running gear. gearOut: measured outer track face (the
// front-view track columns end at |x|≈1.72 on these prints; the published
// 3.70 width lives on the fender line, not the tracks).
const MK12_GEAR = {
  width: 3.70, trackW: 0.60, trackTop: 1.02, wheelR: 0.40, gearOut: 1.70,
};
// Mk.3 shared running gear. r2: the refs' rear track RISES from the last
// road wheel (~-2.6) to a high tail idler — the wheel row ends earlier and
// the idler sits high/aft so the wrap fills the measured rising band.
const MK3_GEAR = {
  width: 3.72, trackW: 0.62, trackTop: 1.00, wheelR: 0.40, gearOut: 1.70,
  wheelZs: [1.70, 0.86, 0.02, -0.82, -1.66, -2.50],
  sprocket: { z: 2.05, y: 0.55, r: 0.28 }, idler: { z: -3.18, y: 0.66, r: 0.27 },
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
      { z: 3.08, yT: 1.05, yB: 0.95, wT: 0.50, wB: 0.50 },
      { z: 3.00, yT: 1.13, yB: 0.96, wT: 1.30, wB: 1.05 },
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
    keel: { toeZ: 3.06, toeY: 0.98, toeHW: 0.50, midZ: 2.30, midY: 0.40, groundZ: 1.90, bellyY: 0.44, tailLowZ: -3.55 },
    glacis: { z0: 0.95, z1: 3.02 },
    podX: 0.62, podIn: -0.10, podY: 0.99,
    // Fender planks at the measured y 1.43 line; post-repair plan runs
    // SYMMETRIC 2.95..-3.95 (the old per-side clip was a broken-rig read).
    // Outer lip carries the published 3.70 width (WIDTH GUARD: outer face
    // exactly +-1.85, widest point of the build).
    fenderPlank: { x0: 1.42, x1: 1.75, z0: 2.30, z1: -3.95, y: 1.43, drops: { bot: 0.68, z: [2.0, 1.1, 0.2, -0.7, -1.6, -2.5, -3.4] } },
    fenderLip: { x: 1.84, w: 0.07, z0: 2.45, z1: -3.48, y: 1.43 },
    skirt: null,
    wheelZs: [1.55, 0.73, -0.09, -0.91, -1.73, -2.55],
    sprocket: { z: 2.02, y: 0.54, r: 0.29 }, idler: { z: -3.45, y: 0.68, r: 0.27 },
    rollers: [1.1, 0.25, -0.6, -1.45, -2.25],
    // Hull tail rack: center-notched (ref plan opens x<0.35 to -3.82) with
    // the deep run x 0.35..1.04 to -4.01 and slim wings carrying the dims
    // hullLength span to -4.22 (published 7.45 needs the rear reach; ~1
    // sub-margin cover column vs the 7.21 m ref hull is the cheapest trade).
    tailRack: {
      z0: -3.56, z1: -4.01, top: 1.60, bot: 0.92, hw: 1.70, x0: 0.35,
      wings: { x0: 0.44, x1: 1.02, z1: -4.22, top: 1.55, bot: 0.86 },
    },
    pivotZ: -1.00,
    turretStyle: 'small',
    // Muzzle set from published overall length off the wing tail: -4.22 +
    // 8.63*0.995 = 4.37 (the oracle's M64 is modelled short at 4.00-4.09 —
    // the symmetric-coverage cost on side_whole is the certified gun cap).
    gunAxisY: 1.97, gunR: 0.075, sleeve: false, evac: 0.72, gunTipZ: 4.40, gunZL: 0.40,
    muzzleCollar: { r: 0.105, len: 0.28 },
    mantlet: { r0: 0.125, r1: 0.10, len: 0.85, drop: 0.02 },
    apexZ: 1.24, notchHW: 0.20, hwMax: 1.30, roofHW: 0.98, roofInset: 0.74,
    shoulderZ: 0.30, shellRearZ: -2.05, maxWZ: -1.15,
    // Roof (ref side turret tops): front plateau 2.58-2.62 (1.1..0.15),
    // saddle 2.35 (-0.02..-0.44), dome-band drum 2.66 (capped; ref rides
    // 2.80-2.87), rear shelf 2.50-2.53.
    roofLine: [[1.12, 2.58], [0.15, 2.62], [-0.02, 2.35], [-0.44, 2.35], [-1.75, 2.50], [-2.00, 2.53]],
    // dims cap: published height 2.65 (p95 of tops) — the flat dome drum,
    // cupola lid and MG crowns all live at 2.66; the repaired oracle's
    // 2.80-2.87 dome band stays deliberately capped (heightM is sovereign).
    station: { x: -0.45, z0: -0.46, z1: -1.70, top: 2.66, hw: 0.53 },
    sightZ: 0.35,
    // Casting-ring underside (repaired-oracle turret mask bottoms): 1.53
    // flat across the ring with the -0.9 dip to 1.48, rising to the mantlet
    // line (1.86) fore and the bustle (1.86) aft.
    apron: [[0.45, 1.70], [0.02, 1.53], [-0.80, 1.53], [-0.93, 1.48], [-1.10, 1.48], [-1.25, 1.53], [-2.10, 1.53], [-2.40, 1.64], [-2.62, 1.75], [-2.85, 1.86]],
    apronHW: 1.05,
    stow: { z0: -1.70, z1: -2.15, top: 2.64, bot: 2.05, hw: 1.10, xoff: 0.30 },
    basket: { z0: -2.18, z1: -3.45, top: 2.46, topRear: 2.44, bot: 1.88 }, basketHW: 1.06, basketXoff: -0.055,
    tailVane: { z0: -3.45, z1: -3.86, top: 2.46, bot: 1.92, hw: 0.72, drop: 0.12 },
    chainDrop: 0.12, chainGap: 0.18,
    // Whips on the measured ref columns (side crossfire fix: one gate
    // column rearward of the raw probe read) at the ref's +0.8 x station
    // (front-view trace: BOTH 1B whips ride the RIGHT side).
    antennas: [{ x: -0.74, y: 2.48, z: -2.91, h: 2.34, stem: 0.35 }, { x: 0.91, y: 2.46, z: -2.33, h: 2.41, stem: 0.35 }],
    pots: [{ x: 0.62, z: -2.47, top: 2.64, base: 2.42, w: 0.28, d: 0.17 }],
    brow: { z0: 1.53, z1: 1.02, top: 2.56 },
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
    mantlet: { r0: 0.125, r1: 0.10, len: 0.85, drop: 0.05 },
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
    mantlet: { r0: 0.125, r1: 0.10, len: 0.85, drop: 0.05 },
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
    deckY: 1.63, rearDeckZ: -2.30,
    // v6 hull trace: nose (3.3, 0.91..1.00), knee (2.5, 1.59), deck
    // undulates 1.60-1.74 with the shelf rise aft, tall rear rack wall to
    // 2.37 over -3.3..-3.95 with a low frame to -4.12 and body wings to
    // -4.26 (published hullLength 7.60 = [-4.26..3.36]).
    body: [
      { z: 3.12, yT: 1.02, yB: 0.88, wT: 0.90, wB: 0.80 },
      { z: 2.55, yT: 1.52, yB: 1.00, wT: 1.70, wB: 1.45 },
      { z: 2.00, yT: 1.62, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 1.10, yT: 1.74, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 0.10, yT: 1.62, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -1.00, yT: 1.60, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.00, yT: 1.64, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.60, yT: 1.74, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -3.05, yT: 1.68, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -4.06, yT: 1.46, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 3.12, toeY: 0.92, toeHW: 0.70, midZ: 2.30, midY: 0.32, groundZ: 1.88, bellyY: 0.42, tailLowZ: -3.20 },
    glacis: { z0: 1.95, z1: 3.10 },
    podX: 0.66, podIn: -0.15, podY: 0.93,
    fenderPlank: { x0: 1.40, x1: 1.74, z0: 2.42, z1: -3.30, y: 1.60 },
    skirt: { z0: 2.62, z1: -3.44, top: 1.36, bot: 0.62, scallop: true, x: 1.835 },
    // WIDTH GUARD strip: published 3.72 lives on this short side-marker board
    // (plan band just over 1 m so widthM reads it; only ~2 station slices see
    // it and the trimmed mean drops them).
    fenderLip: { x: 1.86, w: 0.07, z0: -0.88, z1: -2.32, y: 1.06 },
    frontBoard: { z0: 3.08, z1: 2.52, y: 1.06, x0: 1.30, x1: 1.80 },
    rearBins: { z0: -2.32, z1: -2.88, top: 1.68, x0: 0.55, x1: 1.45 },
    // r2 post-repair rear: the healed tall stack is genuine HULL furniture
    // (x -1.08..0.93, y to 2.55, z -3.11..-4.13 — the repair renamed both
    // halves hull-side); the low rack wall runs full width to -4.06/-4.16.
    tailRack: {
      z0: -3.28, z1: -4.06, top: 1.62, bot: 0.90, hw: 1.75, x0: 0.35,
      wings: [
        { x0: 0.42, x1: 1.10, z1: -4.18, top: 1.45, bot: 0.80 },
      ],
    },
    rearPack: { hw: 1.00, x: -0.08, z0: -3.02, z1: -4.14, top: 2.32, bot: 1.50 },
    pivotZ: -0.75,
    turretStyle: 'mod',
    // Muzzle from published overall: -4.16 + 9.04*0.995 = 4.83 -> hull span
    // anchors dims; oracle MG251 modelled short (4.13) — certified
    // wholeCurves gun coverage cap.
    gunAxisY: 1.97, gunR: 0.082, sleeve: true, evac: 0.64, gunTipZ: 4.73, gunZL: 0.32,
    mantlet: { r0: 0.145, r1: 0.11, len: 0.80, drop: -0.02 },
    apexZ: 1.75, notchHW: 0.30, hwMax: 1.38, roofHW: 1.24, roofInset: 0.76,
    shellFrontZ: 0.85, maxWZ: 0.35, shellRearZ: -1.85, rearWide: 0.97,
    // Ref roof: crest 2.56-2.64 from 1.9 back to 0.15, saddle 2.41 around
    // 0.0..-0.25, sight band capped 2.655 (-0.36..-1.70; oracle rides
    // 2.71-2.87), rear roof 2.64, bustle 2.46-2.49.
    crest: { z0: 1.78, z1: 0.72, top: 2.58, hw: 0.62 },
    roofLine: [[0.72, 2.62], [0.12, 2.58], [0.02, 2.41], [-0.25, 2.41], [-0.36, 2.655], [-1.70, 2.655], [-2.10, 2.64], [-2.28, 2.49], [-2.90, 2.46]],
    bustleZ1: -2.90, bustleBot: 1.80, bustleHW: 1.08,
    basket: { z0: -2.92, z1: -3.30, top: 2.42, topRear: 2.38, bot: 1.92 }, basketHW: 1.12,
    // Chain-mat vane: the absorbed ex_armor mats hang off the basket rim to
    // -3.95 (band 1.87..2.31 falling to 2.23).
    tailVane: { z0: -3.30, z1: -4.06, top: 2.33, bot: 1.90, hw: 0.92, drop: 0.10 },
    chainDrop: 0.12, chainGap: 0.22,
    // dims cap: the sight band, cupola crown and MGs all cap at 2.655
    // (published height 2.66 is p95 of tops; the oracle band rides 2.8+).
    kitCapY: 2.655,
    cupolaX: 0.92, cupolaZ: -0.85, cupolaRaise: -0.11,
    pano: { x: -0.55, z: -0.75, top: 2.655 }, sightX: 0.45,
    antennas: [{ x: 0.19, y: 2.42, z: -3.15, h: 2.32, stem: 0.4 }, { x: 1.01, y: 2.42, z: -2.97, h: 2.44, stem: 0.4 }],
    turretKit: merkava3bKit,
  },

  // ---- Mk.3C: 3B sculpt + Kasag roof clutter --------------------------------
  // Print note (certified): the 3C oracle carries its bustle band in the
  // HULL node (hull trace tops 2.48-2.55 over z -0.7..-2.2) — small
  // hullCurves residue no articulated build can copy.
  merkava3c: {
    build: buildMerkavaMark, ...MK3_GEAR,
    deckY: 1.63, rearDeckZ: -2.30,
    body: [
      { z: 3.12, yT: 1.02, yB: 0.88, wT: 0.90, wB: 0.80 },
      { z: 2.55, yT: 1.52, yB: 1.00, wT: 1.70, wB: 1.45 },
      { z: 2.00, yT: 1.62, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 1.10, yT: 1.74, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 0.10, yT: 1.62, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -1.00, yT: 1.60, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.00, yT: 1.64, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.60, yT: 1.74, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -3.05, yT: 1.68, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -4.06, yT: 1.46, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 3.12, toeY: 0.92, toeHW: 0.70, midZ: 2.30, midY: 0.32, groundZ: 1.88, bellyY: 0.42, tailLowZ: -3.20 },
    glacis: { z0: 1.95, z1: 3.10 },
    podX: 0.66, podIn: -0.15, podY: 0.93,
    fenderPlank: { x0: 1.40, x1: 1.74, z0: 2.42, z1: -3.30, y: 1.60 },
    skirt: { z0: 2.62, z1: -3.44, top: 1.36, bot: 0.62, scallop: true, x: 1.835 },
    // WIDTH GUARD strip: published 3.72 lives on this short side-marker board
    // (plan band just over 1 m so widthM reads it; only ~2 station slices see
    // it and the trimmed mean drops them).
    fenderLip: { x: 1.86, w: 0.07, z0: -0.88, z1: -2.32, y: 1.06 },
    frontBoard: { z0: 3.08, z1: 2.52, y: 1.06, x0: 1.30, x1: 1.80 },
    rearBins: { z0: -2.32, z1: -2.88, top: 1.76, x0: 0.55, x1: 1.45 },
    // Healed tall stack = hull furniture (see 3B note); deckPack mimic gone.
    rearPack: { hw: 1.00, x: -0.08, z0: -3.02, z1: -4.14, top: 2.32, bot: 1.50 },
    tailRack: {
      z0: -3.28, z1: -4.06, top: 1.62, bot: 0.90, hw: 1.75, x0: 0.35,
      wings: [
        { x0: 0.42, x1: 1.10, z1: -4.18, top: 1.45, bot: 0.80 },
      ],
    },
    pivotZ: -0.75,
    turretStyle: 'mod',
    gunAxisY: 1.97, gunR: 0.082, sleeve: true, evac: 0.64, gunTipZ: 4.73, gunZL: 0.32,
    mantlet: { r0: 0.145, r1: 0.11, len: 0.80, drop: -0.02 },
    apexZ: 1.75, notchHW: 0.30, hwMax: 1.38, roofHW: 1.24, roofInset: 0.76,
    shellFrontZ: 0.85, maxWZ: 0.35, shellRearZ: -1.85, rearWide: 0.97,
    crest: { z0: 1.78, z1: 0.72, top: 2.58, hw: 0.62 },
    roofLine: [[0.72, 2.62], [0.12, 2.58], [0.02, 2.41], [-0.25, 2.41], [-0.36, 2.655], [-1.70, 2.655], [-2.10, 2.64], [-2.28, 2.49], [-2.90, 2.46]],
    bustleZ1: -2.90, bustleBot: 1.80, bustleHW: 1.08,
    basket: { z0: -2.92, z1: -3.30, top: 2.42, topRear: 2.38, bot: 1.92 }, basketHW: 1.12,
    tailVane: { z0: -3.30, z1: -4.06, top: 2.33, bot: 1.90, hw: 0.92, drop: 0.10 },
    chainDrop: 0.12, chainGap: 0.22,
    kitCapY: 2.655,
    cupolaX: 0.92, cupolaZ: -0.85, cupolaRaise: -0.11,
    pano: { x: -0.55, z: -0.75, top: 2.655 }, sightX: 0.45,
    antennas: [{ x: 0.19, y: 2.42, z: -3.15, h: 2.34, stem: 0.4 }, { x: 1.01, y: 2.42, z: -2.97, h: 2.44, stem: 0.4 }],
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
    body: [
      { z: 3.33, yT: 1.00, yB: 0.86, wT: 1.05, wB: 0.90 },
      { z: 2.55, yT: 1.58, yB: 1.00, wT: 1.70, wB: 1.45 },
      { z: 2.00, yT: 1.63, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 1.10, yT: 1.75, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 0.10, yT: 1.62, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -1.00, yT: 1.60, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.00, yT: 1.64, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.60, yT: 1.75, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -3.05, yT: 1.69, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -3.28, yT: 1.60, yB: 0.95, wT: 1.70, wB: 1.70 },
      { z: -4.06, yT: 1.44, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    tailNotch: { hw: 0.30 },
    keel: { toeZ: 3.33, toeY: 0.88, toeHW: 0.90, midZ: 2.10, midY: 0.14, groundZ: 1.90, bellyY: 0.42, tailLowZ: -3.20 },
    glacis: { z0: 1.95, z1: 3.30 },
    podX: 0.66, podIn: 0.05, podY: 0.98,
    fenderPlank: { x0: 1.40, x1: 1.74, z0: 2.42, z1: -3.30, y: 1.60 },
    skirt: { z0: 2.62, z1: -3.44, top: 1.36, bot: 0.62, scallop: true, x: 1.835 },
    // WIDTH GUARD strip: published 3.72 lives on this short side-marker board
    // (plan band just over 1 m so widthM reads it; only ~2 station slices see
    // it and the trimmed mean drops them).
    fenderLip: { x: 1.86, w: 0.07, z0: -0.88, z1: -2.32, y: 1.06 },
    frontBoard: { z0: 3.08, z1: 2.52, y: 1.06, x0: 1.30, x1: 1.80 },
    rearBins: { z0: -2.32, z1: -2.88, top: 1.68, x0: 0.55, x1: 1.45 },
    // 3D hull rack: LOW wall (deckPack mimic gone), center recess -3.68,
    // mid shelf, thin high frame rails trailing to -4.24 (side band
    // [1.05..1.33] at the tail — the old deep wings read 0.4 too low).
    tailRack: {
      z0: -3.28, z1: -4.05, top: 1.60, bot: 0.60, hw: 1.75, x0: 0.40,
      midShelf: { x1: 0.95, z1: -3.62, top: 1.58 },
      wings: [
        { x0: 0.42, x1: 1.10, z1: -4.14, top: 1.33, bot: 0.62 },
      ],
    },
    pivotZ: -0.75,
    turretStyle: 'mod',
    gunAxisY: 1.97, gunR: 0.082, sleeve: true, evac: 0.64, gunTipZ: 4.73, gunZL: 0.32,
    mantlet: { r0: 0.145, r1: 0.11, len: 0.80, drop: -0.02 },
    apexZ: 1.75, notchHW: 0.30, hwMax: 1.62, roofHW: 1.26, roofInset: 0.76,
    shellFrontZ: 0.85, maxWZ: -0.35, shellRearZ: -1.85, rearWide: 0.97,
    crest: { z0: 1.78, z1: 0.72, top: 2.58, hw: 0.62 },
    roofLine: [[0.72, 2.62], [0.12, 2.58], [0.02, 2.41], [-0.25, 2.41], [-0.36, 2.655], [-1.70, 2.655], [-2.10, 2.64], [-2.28, 2.49], [-2.90, 2.46]],
    bustleZ1: -2.90, bustleBot: 1.80, bustleHW: 1.55,
    basket: { z0: -2.92, z1: -3.92, top: 2.44, topRear: 2.42, bot: 1.95 }, basketHW: 1.05,
    chainDrop: 0.12, chainGap: -0.15,
    // Rear chain-mat tip: the measured 3D turret tail band [1.94..2.37]
    // falling to -4.09 (the old low tip [0.76..1.42] mimicked a broken read).
    rearTip: { z: -4.08, hw: 0.55, top: 2.30, bot: 2.22 },
    kitCapY: 2.655,
    cupolaX: 0.92, cupolaZ: -0.85, cupolaRaise: -0.11,
    pano: { x: -0.55, z: -0.75, top: 2.655 }, sightX: 0.45,
    // ONE tall whip on the measured -3.16 column (top 4.73) + the short pot
    // whip at -2.60 (top 2.57).
    antennas: [{ x: 0.21, y: 2.44, z: -3.17, h: 2.31, stem: 0.4 }, { x: 0.26, y: 2.44, z: -2.60, h: 0.13, stem: 0.30 }],
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
    mantlet: { r0: 0.16, r1: 0.11, len: 0.60 },
    apexZ: 2.60, notchHW: 0.30, hwMax: 1.57, roofHW: 0.98, roofInset: 0.60, rearWide: 0.97,
    shellFrontZ: 1.30, maxWZ: -0.35, shellRearZ: -2.25,
    crest: { z0: 2.00, z1: 0.55, top: 2.66, hw: 0.62 },
    roofLine: [[0.55, 2.62], [0.02, 2.66], [-0.90, 2.66], [-1.95, 2.55]],
    bustleZ1: -2.34, bustleBot: 1.90,
    basket: { z0: -2.36, z1: -4.00, top: 2.40, topRear: 2.30, bot: 1.95 }, basketHW: 1.20,
    chainDrop: 0.12, chainGap: -0.30,
    kitCapY: 2.655,
    apron: [[0.60, 1.76], [0.30, 1.66], [0.05, 1.58], [-1.44, 1.58], [-1.80, 1.64], [-2.10, 1.78], [-2.25, 1.86]],
    apronHW: 1.22,
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
      { z: 3.50, yT: 1.12, yB: 0.98, wT: 0.55, wB: 0.55 },
      { z: 2.85, yT: 1.44, yB: 1.02, wT: 1.55, wB: 1.30 },
      { z: 1.10, yT: 1.76, yB: 1.00, wT: 1.66, wB: 1.66 },
      { z: -3.20, yT: 1.76, yB: 1.00, wT: 1.66, wB: 1.66 },
      { z: -4.05, yT: 1.58, yB: 0.90, wT: 1.58, wB: 1.58 },
    ],
    tailNotch: { hw: 0.45 },
    keel: { toeZ: 3.50, toeY: 0.98, toeHW: 0.60, midZ: 2.80, midY: 0.42, groundZ: 2.30, bellyY: 0.24, tailLowZ: -3.70 },
    glacis: { z0: 1.10, z1: 3.45 },
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
        { x0: 0.60, x1: 1.10, z1: -4.20, top: 1.47, bot: 1.20 },
      ],
    },
    pivotZ: -0.55,
    turretStyle: 'mod',
    // Published hull 7.60 closes toe (3.53) to the rack tail (-4.02); the
    // muzzle carries overall to 8.95 (oracle MG253 short at 4.30-4.39 —
    // certified wholeCurves coverage cap).
    gunAxisY: 2.06, gunR: 0.078, sleeve: true, evac: 0.30, gunTipZ: 4.80, gunZL: 0.32,
    mantlet: { r0: 0.17, r1: 0.12, len: 0.60 },
    apexZ: 2.60, notchHW: 0.32, hwMax: 1.60, roofHW: 1.18, roofInset: 0.72,
    shellFrontZ: 1.30, maxWZ: -0.35, shellRearZ: -2.25,
    // STATURE CAP (certified): the 1.313x width-normalized print rides its
    // plateau at 2.99-3.12 and cupola band to 3.1+; published height 2.66
    // (p95) pins the whole roof at 2.655-2.665 — the flat cap line is the
    // optimal satisfiable shape under the cap.
    crest: { z0: 2.00, z1: 0.55, top: 2.665, hw: 0.60 },
    roofLine: [[0.60, 2.655], [0.10, 2.60], [-0.05, 2.655], [-1.90, 2.655], [-2.10, 2.60]],
    bustleZ1: -2.34, bustleBot: 1.95,
    basket: { z0: -2.36, z1: -3.90, top: 2.62, topRear: 2.50, bot: 1.96 }, basketHW: 1.32,
    chainDrop: 0.12, chainGap: -0.30,
    kitCapY: 2.655,
    // Casting-ring apron per the repaired turret mask (bottoms 1.53 mid,
    // rising 1.79 aft toward the bustle).
    apron: [[0.60, 1.72], [0.30, 1.62], [0.05, 1.53], [-1.44, 1.53], [-1.75, 1.58], [-1.95, 1.66], [-2.10, 1.76], [-2.25, 1.84]],
    apronHW: 1.18,
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
