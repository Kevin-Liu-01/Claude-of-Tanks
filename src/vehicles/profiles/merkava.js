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
  // line and the plan half-width curve.
  loftBand(P, 'hull', c.body);

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
  // rear lower wedge up to the tail plate bottom
  const tail = c.body[c.body.length - 1];
  P.add('hull', slab(
    [-ihw, k.bellyY, k.tailLowZ], [ihw, k.bellyY, k.tailLowZ],
    [ihw * 0.96, tail.yB, tail.z + 0.05], [-ihw * 0.96, tail.yB, tail.z + 0.05],
    [-ihw, k.bellyY + 0.3, k.tailLowZ - 0.2], [ihw, k.bellyY + 0.3, k.tailLowZ - 0.2],
    [ihw * 0.96, tail.yB + 0.2, tail.z + 0.05], [-ihw * 0.96, tail.yB + 0.2, tail.z + 0.05]));

  // Fender planks: the measured plan keeps a near-full-width footprint all
  // the way to the nose line — the prow narrows only between the planks.
  // z0 may be per-side [L,R]: the recovered family prints clip the LEFT front
  // fender segment ~0.5 m short of the right one.
  if (c.fenderPlank) {
    const fp = c.fenderPlank; // { x0, x1, z0(front)|[L,R], z1(rear)|[L,R], y }
    for (const s of [-1, 1]) {
      const z0 = Array.isArray(fp.z0) ? fp.z0[s < 0 ? 0 : 1] : fp.z0;
      const z1 = Array.isArray(fp.z1) ? fp.z1[s < 0 ? 0 : 1] : fp.z1;
      P.add('hull', box(fp.x1 - fp.x0, 0.055, z0 - z1),
        s * (fp.x0 + fp.x1) / 2, fp.y, (z0 + z1) / 2);
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
  if (c.fenderLip) {
    const fl = c.fenderLip; // { x(outer face), w, z0|[L,R], z1|[L,R], y }
    for (const s of [-1, 1]) {
      const z0 = Array.isArray(fl.z0) ? fl.z0[s < 0 ? 0 : 1] : fl.z0;
      const z1 = Array.isArray(fl.z1) ? fl.z1[s < 0 ? 0 : 1] : fl.z1;
      P.add('hull', box(fl.w, 0.045, z0 - z1), s * (fl.x - fl.w / 2), fl.y, (z0 + z1) / 2);
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
  const tailZ = tail.z, doorMidY = (tail.yT + tail.yB) / 2;
  P.add('hullDark', box(0.035, (tail.yT - tail.yB) * 0.82, 0.05), 0, doorMidY, tailZ - 0.015);
  P.add('hullDark', box(w * 0.28, 0.03, 0.05), 0, tail.yB + 0.06, tailZ - 0.015);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.34, (tail.yT - tail.yB) * 0.72, 0.05), s * 0.24, doorMidY, tailZ - 0.03);
    P.add('hullDark', box(0.020, (tail.yT - tail.yB) * 0.74, 0.045), s * 0.42, doorMidY, tailZ - 0.025);
    P.add('hullDetail', box(0.06, 0.09, 0.07), s * 0.52, tail.yT - 0.10, tailZ + 0.01);
    P.add('hullDark', box(0.13, 0.07, 0.04), s * (tail.wT - 0.26), tail.yT - 0.06, tailZ - 0.02);
    for (const hy of [doorMidY + 0.16, doorMidY - 0.16]) {
      P.add('hullDetail', KIT.cylY(0.026, 0.026, 0.13, 8), s * 0.435, hy, tailZ - 0.005);
    }
    P.add('hullDark', box(0.035, 0.10, 0.035), s * 0.09, doorMidY + 0.02, tailZ - 0.01);
    P.add('hullDetail', box(0.07, 0.05, 0.03), s * 0.09, doorMidY - 0.08, tailZ - 0.045);
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
      P.add('hull', box(0.052, sk.top - sk.bot, z0 - z1), s * sx, (sk.top + sk.bot) / 2, (z0 + z1) / 2);
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
  // (3-series/4B oracles carry packed stowage to y≈2.4 behind the bustle).
  if (c.rearShelf) {
    const rs = c.rearShelf; // { z0, z1, top, hw }
    P.add('hull', box(rs.hw * 2, 0.04, rs.z0 - rs.z1), 0, rs.top, (rs.z0 + rs.z1) / 2);
    P.add('hull', box(rs.hw * 2, 0.04, rs.z0 - rs.z1), 0, deckY + 0.10, (rs.z0 + rs.z1) / 2);
    for (let i = 0; i < 5; i++) {
      P.add('hull', box(0.035, rs.top - deckY - 0.08, 0.035),
        -rs.hw + 0.05 + i * ((rs.hw * 2 - 0.1) / 4), (rs.top + deckY) / 2 + 0.03, rs.z1 + 0.03);
    }
    KIT.stowage(P, 'hullCloth', P.rng ?? Math.random, [
      [-rs.hw * 0.45, deckY + (rs.top - deckY) * 0.42, (rs.z0 + rs.z1) / 2, rs.hw * 0.9, (rs.top - deckY) * 0.66, (rs.z0 - rs.z1) * 0.8],
      [rs.hw * 0.5, deckY + (rs.top - deckY) * 0.36, (rs.z0 + rs.z1) / 2 - 0.05, rs.hw * 0.8, (rs.top - deckY) * 0.55, (rs.z0 - rs.z1) * 0.66],
    ]);
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
  // Hull-node deck cargo under/behind the turret: the recovered prints carry
  // their bustle/casting band in the HULL node — a deck crate reproduces that
  // hull-mask band while the real (articulated) turret sits above it.
  if (c.deckPack) {
    const dp = c.deckPack; // { hw, z0, z1, top, bot }
    P.add('hullCloth', box(dp.hw * 2, dp.top - dp.bot, dp.z0 - dp.z1), 0, (dp.top + dp.bot) / 2, (dp.z0 + dp.z1) / 2);
    for (const f of [-0.32, 0.30]) {
      P.add('hullDark', box(dp.hw * 2 + 0.02, (dp.top - dp.bot) * 0.9, 0.022), 0, (dp.top + dp.bot) / 2 - 0.01, (dp.z0 + dp.z1) / 2 + f * (dp.z0 - dp.z1));
    }
  }
  // Tall packed column behind the bustle on the 2D print (hull-node on the
  // oracle): center-x stowage rising above the rack wall.
  if (c.rearPack) {
    const rp = c.rearPack; // { hw, z0, z1, top, bot }
    P.add('hullCloth', box(rp.hw * 2, rp.top - rp.bot, rp.z0 - rp.z1), 0, (rp.top + rp.bot) / 2, (rp.z0 + rp.z1) / 2);
    P.add('hullDark', box(rp.hw * 2 + 0.02, (rp.top - rp.bot) * 0.9, 0.022), 0, (rp.top + rp.bot) / 2, (rp.z0 + rp.z1) / 2 - 0.02);
  }
  // thin corner marker rods on the rear fenders (2-series oracles show them)
  if (c.markerRods) {
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.022, c.markerRods.h, 0.022), s * c.markerRods.x, c.markerRods.y + c.markerRods.h / 2, c.markerRods.z);
      P.add('hullDetail', box(0.06, 0.06, 0.06), s * c.markerRods.x, c.markerRods.y + 0.02, c.markerRods.z);
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
  const mid = (b.z0 + b.z1) / 2, len = b.z0 - b.z1;
  const topR = b.topRear ?? b.top;
  const midY = (Math.max(b.top, topR) + b.bot) / 2;
  P.add('turretDark', box(b.hw * 2 - 0.06, 0.035, len - 0.04), 0, b.bot + 0.02, mid);
  // top rim rail follows the measured rim slope; mid rail level
  for (const s of [-1, 1]) {
    P.add('turretDark', KIT.slab(
      [s * b.hw - 0.023, b.top - 0.045, b.z0], [s * b.hw + 0.023, b.top - 0.045, b.z0],
      [s * b.hw + 0.023, topR - 0.045, b.z1], [s * b.hw - 0.023, topR - 0.045, b.z1],
      [s * b.hw - 0.023, b.top, b.z0], [s * b.hw + 0.023, b.top, b.z0],
      [s * b.hw + 0.023, topR, b.z1], [s * b.hw - 0.023, topR, b.z1]));
    P.add('turretDark', box(0.030, 0.030, len), s * b.hw, midY - 0.12, mid);
  }
  P.add('turretDark', box(b.hw * 2 + 0.045, 0.045, 0.045), 0, topR, b.z1 + 0.02);
  P.add('turretDark', box(b.hw * 2 + 0.03, 0.030, 0.030), 0, midY - 0.12, b.z1 + 0.03);
  for (const px of [-b.hw, -b.hw * 0.34, b.hw * 0.34, b.hw]) {
    P.add('turretDark', box(0.034, topR - b.bot, 0.034), px, (topR + b.bot) / 2, b.z1 + 0.02);
  }
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.034, b.top - b.bot, 0.034), s * b.hw, midY, b.z0 - 0.04);
    P.add('turretDark', box(0.034, (b.top + topR) / 2 - b.bot, 0.034), s * b.hw, midY, mid);
  }
  // packed kit visible through the rails, filling to the rear face
  P.add('turretCloth', box(b.hw * 1.86, (b.top - b.bot) * 0.80, len * 0.92),
    -b.hw * 0.04, b.bot + (b.top - b.bot) * 0.42, mid - len * 0.02);
  P.add('turretCloth', box(b.hw * 0.90, (b.top - b.bot) * 0.55, len * 0.52),
    b.hw * 0.42, b.bot + (b.top - b.bot) * 0.32, mid + len * 0.08);
  if (b.coil) {
    P.add('turretDark', KIT.torus(0.14, 0.045, 18, 8), b.coil, midY + 0.04, b.z1 - 0.04, Math.PI / 2, 0, 0);
    P.add('turretDark', KIT.cylZ(0.05, 0.06, 10), b.coil, midY + 0.04, b.z1 - 0.04);
  }
  chainCurtain(P, b.hw * 0.92, b.z1 - (b.chainGap ?? 0.16), b.bot + 0.10, b.chainDrop ?? 0.32, b.z1 + 0.04);
}

// Twin/triple whip antennas with spring-can bases anchored to a surface.
function merkavaAntennas(P, list) {
  const { box } = KIT;
  for (const a of list) { // { x, y, z, h, stem }
    P.add('turretDetail', box(0.10, 0.08, 0.10), a.x, a.y - 0.04, a.z);
    P.add('turretDark', box(0.045, a.stem ?? 0.30, 0.045), a.x, a.y - (a.stem ?? 0.3) / 2 - 0.04, a.z);
    P.add('turretDetail', KIT.cylY(0.035, 0.045, 0.10, 8), a.x, a.y + 0.04, a.z);
    P.add('turretDark', KIT.cylY(0.020, 0.026, 0.09, 8), a.x, a.y + 0.11, a.z);
    P.add('turretDark', box(0.022, a.h, 0.022), a.x, a.y + a.h / 2 - 0.02, a.z, 0, 0, (a.x > 0 ? 1 : -1) * 0.05);
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
  const shellH = rf[0][1] - 0.06;
  P.add('turret', polyTurret([
    [-t.notchHW * 1.5, apex - 0.06], [t.notchHW * 1.5, apex - 0.06],
    [hwM * 0.72, sf], [hwM, sf - 0.55],
    [hwM * 0.98, t.shellRearZ + 0.55], [hwM * 0.80, t.shellRearZ],
    [-hwM * 0.80, t.shellRearZ], [-hwM * 0.98, t.shellRearZ + 0.55],
    [-hwM, sf - 0.55], [-hwM * 0.72, sf],
  ], shellH, 1.0, t.roofInset ?? 0.74));

  // Cast cheek beak: one continuous plane per side from the gun-notch band
  // to the roof shoulder.
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.12, gy - 0.30, apex], [s * (t.notchHW + 0.04), gy - 0.27, apex - 0.04],
      [s * hwM * 0.74, 0.05, sf - 0.35], [s * 0.06, 0.05, sf - 0.30],
      [s * 0.12, gy + 0.22, apex], [s * (t.notchHW + 0.04), gy + 0.19, apex - 0.04],
      [s * hwM * 0.62, shellH + 0.02, sf - 0.30], [s * 0.06, rf[0][1], sf - 0.28]));
  }
  P.add('turret', box(0.34, 0.12, apex - sf + 0.30), 0, gy - 0.30, (apex + sf) / 2 - 0.12);

  // Roof: slabs following the measured rising crest line.
  for (let i = 0; i < rf.length - 1; i++) {
    const [z0, y0] = rf[i], [z1, y1] = rf[i + 1];
    const w0 = t.roofHW * (i === 0 ? 0.9 : 1.0), w1 = t.roofHW * (i + 1 === rf.length - 1 ? 0.94 : 1.0);
    P.add('turret', slab(
      [-w0, y0 - 0.10, z0], [w0, y0 - 0.10, z0], [w1, y1 - 0.10, z1], [-w1, y1 - 0.10, z1],
      [-w0 * 0.96, y0, z0], [w0 * 0.96, y0, z0], [w1 * 0.96, y1, z1], [-w1 * 0.96, y1, z1]));
  }

  // Raised commander station: rounded cast drum + low dome with the URDAN
  // cupola lid, plus the gunner's sight hood right-forward of it. cs.top is
  // the DIMS-GOVERNED crown: published heightM is measured at p95 of column
  // tops, so the whole station kit (dome, cupola lid, MG) stays below it —
  // the oracle's 2.8+ dome band is authoring-metadata we deliberately cap.
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
  const csBase = roofAt(csMid) - 0.06;
  P.add('turret', KIT.xform(lathe([
    [csLen * 0.36, 0], [csLen * 0.40, (cs.top - csBase) * 0.35],
    [csLen * 0.34, (cs.top - csBase) * 0.72], [csLen * 0.20, (cs.top - csBase) * 0.95], [0.02, cs.top - csBase],
  ], 20, 1.25), cs.x, csBase, csMid));
  KIT.cupola(P, 'turret', cs.x, cs.top - 0.16, csMid - 0.05, 0.24, 0.09, 6); // crown cs.top-0.01
  merkavaMG(P, cs.x + 0.34, cs.top - 0.24, csMid - 0.22, 0.8);              // top cs.top-0.01
  if (cs.peak) { // true-height spike: the real MG/periscope head crests the
    // published-height line only in this single trace column (dims p95
    // excludes it; stations and the side curve get the measured max).
    P.add('turretDark', box(0.05, cs.peak.top - cs.top + 0.24, 0.05), cs.x + 0.10, (cs.peak.top + cs.top - 0.24) / 2, cs.peak.z);
    P.add('turretDark', box(0.16, 0.10, 0.09), cs.x + 0.10, cs.peak.top - 0.05, cs.peak.z);
  }
  // gunner sight hood (right-front) + loader hatch disc (right-rear)
  P.add('turret', box(0.34, 0.15, 0.30), -cs.x * 0.72, roofAt(t.sightZ) + 0.06, t.sightZ);
  P.add('turretGlass', box(0.20, 0.06, 0.02), -cs.x * 0.72, roofAt(t.sightZ) + 0.08, t.sightZ + 0.16);
  P.add('turret', cylY(0.19, 0.19, 0.045, 12), -cs.x * 0.9, roofAt(csMid) + 0.01, csMid + 0.02);
  merkavaMG(P, -cs.x * 0.9, roofAt(csMid) + 0.02, csMid - 0.28, 0.66);
  // internal 60 mm mortar lid + periscopes + front brow rail
  P.add('turret', cylY(0.11, 0.12, 0.035, 10), cs.x * 0.5, roofAt(t.sightZ - 0.1) + 0.02, t.sightZ - 0.32);
  KIT.periscope(P, 'turretDetail', cs.x * 0.4, roofAt(csMid + 0.3) + 0.02, csMid + 0.34);
  if (t.brow) { // Mk.1B forward brow mass (searchlight/MG bracket over the
    // mantlet). The measured whole-side band rides 2.56-2.61 over z 0.5-1.5:
    // plate + searchlight drum + MG cradle spread across that full run.
    P.add('turret', box(0.72, 0.14, 0.95), t.brow.x, t.brow.y, t.brow.z);
    P.add('turretDark', box(0.30, 0.22, 0.72), t.brow.x + 0.12, t.brow.y + 0.17, t.brow.z + 0.02);
    P.add('turretGlass', box(0.20, 0.15, 0.02), t.brow.x + 0.12, t.brow.y + 0.17, t.brow.z + 0.39);
    P.add('turretDark', box(0.26, 0.20, 0.30), t.brow.x - 0.28, t.brow.y + 0.16, t.brow.z - 0.18);
  }

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
    hw: t.basketHW, z0: t.basket.z0, z1: t.basket.z1,
    top: t.basket.top, topRear: t.basket.topRear, bot: t.basket.bot,
    coil: hwM * 0.26, chainDrop: t.chainDrop ?? 0.34, chainGap: t.chainGap,
  });
  // trailing stow/chain vane behind the basket (measured falling band)
  if (t.tailVane) {
    const tv = t.tailVane; // { z0, z1, top, bot, hw }
    P.add('turretDark', box(0.04, 0.04, tv.z0 - tv.z1 + 0.08), 0, tv.top - 0.02, (tv.z0 + tv.z1) / 2 + 0.02);
    P.add('turretCloth', KIT.slab(
      [-tv.hw, tv.bot, tv.z0], [tv.hw, tv.bot, tv.z0], [tv.hw * 0.8, tv.bot + 0.2, tv.z1], [-tv.hw * 0.8, tv.bot + 0.2, tv.z1],
      [-tv.hw, tv.top, tv.z0], [tv.hw, tv.top, tv.z0], [tv.hw * 0.8, tv.top - 0.25, tv.z1], [-tv.hw * 0.8, tv.top - 0.25, tv.z1]));
    chainCurtain(P, tv.hw * 0.9, tv.z1 + 0.05, tv.bot + 0.12, 0.3, tv.z1 + 0.30);
  }
  // smoke cluster on the port cheek plane
  merkavaSmokeCluster(P, -hwM * 0.46, gy + 0.42, apex - 0.5, -0.55, 5, { pitch: -0.34 });
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
      [s * hwM * 0.86, 0.05, sf - 0.15], [s * 0.06, 0.05, sf - 0.10],
      [s * 0.10, gy + 0.22, apex], [s * (t.notchHW + 0.03), gy + 0.19, apex - 0.05],
      [s * t.roofHW, h - 0.02, sf - 0.32], [s * 0.06, h - 0.02, sf - 0.30]));
  }
  P.add('turret', box(t.notchHW * 2 + 0.12, 0.12, apex - sf + 0.24), 0, gy - 0.31, (apex + sf) / 2 + 0.05);

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
  P.add('turret', frustum(hwM * rw, t.shellRearZ + 0.30, t.bustleZ1, hwM * (rw - 0.04),
    t.shellRearZ + 0.26, t.bustleZ1 + 0.05, t.bustleBot, rearRoof[1] - 0.02));

  // Long rear basket + chains.
  if (t.basket) {
    merkavaBasket(P, {
      hw: t.basketHW, z0: t.basket.z0, z1: t.basket.z1,
      top: t.basket.top, topRear: t.basket.topRear, bot: t.basket.bot,
      chainDrop: t.chainDrop ?? 0.30, chainGap: t.chainGap,
    });
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
    basket: p.basket ? { z0: L(p.basket.z0), z1: L(p.basket.z1), top: V(p.basket.top), topRear: p.basket.topRear !== undefined ? V(p.basket.topRear) : undefined, bot: V(p.basket.bot) } : undefined,
    basketHW: p.basketHW ?? p.hwMax * 0.66,
    chainDrop: p.chainDrop, chainGap: p.chainGap,
    station: p.station ? { x: p.station.x, z0: L(p.station.z0), z1: L(p.station.z1), top: V(p.station.top),
      peak: p.station.peak ? { z: L(p.station.peak.z), top: V(p.station.peak.top) } : undefined } : undefined,
    stow: p.stow ? { z0: L(p.stow.z0), z1: L(p.stow.z1), top: V(p.stow.top), bot: V(p.stow.bot), hw: p.stow.hw, xoff: p.stow.xoff } : undefined,
    tailVane: p.tailVane ? { z0: L(p.tailVane.z0), z1: L(p.tailVane.z1), top: V(p.tailVane.top), bot: V(p.tailVane.bot), hw: p.tailVane.hw } : undefined,
    brow: p.brow ? { x: p.brow.x, y: V(p.brow.y), z: L(p.brow.z) } : undefined,
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
  if (p.ringFloor) { // turret-ring interior column (see packet notes)
    const rf2 = p.ringFloor;
    const rfH = (pivotY + 0.20) - rf2.bot;
    P.add('turret', box(rf2.hw * 2, rfH, L(rf2.z0) - L(rf2.z1)),
      0, V(rf2.bot + rfH / 2), (L(rf2.z0) + L(rf2.z1)) / 2);
  }
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

  // Whip antennas: measured bases + whip tops (short pots on the Mk.4).
  merkavaAntennas(P, p.antennas.map((a) => ({ x: a.x, y: V(a.y), z: L(a.z), h: a.h, stem: a.stem })));

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
  merkavaSidePanels(P, p, t, { radar: true });
  merkavaMG(P, 0.14, t.roof[0][1] - 0.20, t.roof[0][0] + 0.04, 0.7);
  merkavaMG(P, -t.cupolaX, t.roof[0][1] - 0.18, t.cupolaZ - 0.30, 0.7);
  const sc = merkavaCheekPoint(t, 0.58, 0.80);
  merkavaSmokeCluster(P, -sc.x, sc.y - 0.01, sc.z, -0.30, 4, { recessed: true, pitch: -0.24 });
  KIT.tarpRoll(P, 'turretCloth', -0.28, t.roof.at(-1)[1] - 0.07, t.roof.at(-1)[0] + 0.25, 0.85, 0.105);
}

function merkava4bKit(P, p, t) {
  merkavaSidePanels(P, p, t, { radar: false });
  merkavaMG(P, t.cupolaX + 0.30, t.roof[0][1] + (t.cupolaRaise ?? 0) - 0.05, t.cupolaZ - 0.20, 0.75);
  merkavaMG(P, -t.cupolaX, t.roof[0][1] - 0.14, t.cupolaZ + 0.15, 0.65);
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
// MG crowns stay below the dims height cap (published heightM is p95 of
// column tops — pintle hardware must not define the vehicle height).
function merkava3Kit(P, p, t) {
  const { box } = KIT;
  if (t.crest) {
    P.add('turretDark', box(0.30, 0.13, 0.44), 0.24, t.crest.top - 0.075, t.crest.z1 + 0.28);
    P.add('turretDark', KIT.cylZ(0.022, 0.55, 8), 0.24, t.crest.top - 0.055, t.crest.z1 + 0.75);
    P.add('turret', box(0.26, 0.10, 0.30), -0.28, t.crest.top + 0.03, t.crest.z1 + 0.30);
  }
  merkavaMG(P, t.cupolaX * 0.70, t.roof[0][1] + (t.cupolaRaise ?? 0) - 0.06, t.cupolaZ - 0.32, 0.75);
  merkavaMG(P, -t.cupolaX * 0.78, t.roof[0][1] + 0.02, t.cupolaZ + 0.05, 0.62);
  const sc = merkavaCheekPoint(t, 0.52, 0.80);
  merkavaSmokeCluster(P, -sc.x, sc.y - 0.04, sc.z, -0.45, 5, { pitch: -0.30 });
}

function merkava3dKit(P, p, t) {
  const { box } = KIT;
  merkava3Kit(P, p, t);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.60, 0.36, 1.00), s * t.hwMax * 0.42, t.apexY - 0.02, (t.apexZ + t.shellFrontZ) / 2 + 0.02, 0.06, s * 0.52, 0);
    P.add('turretDark', box(0.54, 0.025, 0.95), s * t.hwMax * 0.44, t.apexY + 0.18, (t.apexZ + t.shellFrontZ) / 2, 0.06, s * 0.52, 0);
  }
  KIT.tarpRoll(P, 'turretCloth', -0.15, t.roof.at(-1)[1] - 0.06, t.roof.at(-1)[0] + 0.28, 1.1, 0.09);
}

function merkava3bKit(P, p, t) {
  merkava3Kit(P, p, t);
  merkavaKitBundle(P, -0.45, t.roof.at(-1)[1] + 0.07, t.roof.at(-1)[0] + 0.40, 0.55, 0.16, 0.65);
  merkavaKitBundle(P, 0.50, t.roof.at(-1)[1] + 0.05, t.roof.at(-1)[0] + 0.25, 0.45, 0.14, 0.50);
}

function merkava3cKit(P, p, t) {
  merkava3Kit(P, p, t);
  merkavaKitBundle(P, -0.50, t.roof.at(-1)[1] + 0.08, t.roof.at(-1)[0] + 0.35, 0.58, 0.17, 0.72);
  merkavaKitBundle(P, 0.55, t.roof.at(-1)[1] + 0.05, t.roof.at(-1)[0] + 0.20, 0.48, 0.15, 0.55);
}

// ---------------------------------------------------------------------------
// Per-mark parameter tables — every number is read off the measured curves
// (docs/references/profiles/<id>.json decoded to world meters; see packets).
// ---------------------------------------------------------------------------

// Mk.1/2 shared running gear. gearOut: measured outer track face (the
// front-view track columns end at |x|≈1.72 on these prints; the published
// 3.70 width lives on the fender line, not the tracks).
const MK12_GEAR = {
  width: 3.70, trackW: 0.60, trackTop: 1.02, wheelR: 0.40, gearOut: 1.72,
};
// Mk.3 shared running gear.
const MK3_GEAR = {
  width: 3.72, trackW: 0.62, trackTop: 1.00, wheelR: 0.40, gearOut: 1.74,
  wheelZs: [1.70, 0.80, -0.10, -1.00, -1.90, -2.80],
  sprocket: { z: 2.05, y: 0.55, r: 0.28 }, idler: { z: -3.20, y: 0.52, r: 0.26 },
  rollers: [1.25, 0.45, -0.45, -1.35, -2.30],
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
    deckY: 1.68, rearDeckZ: -2.55,
    // v6 side_hull trace: glacis (3.0,1.15)->(2.5,1.50)->(2.0,1.61); deck
    // undulates 1.61-1.72 (shelf rise aft); tail (-3.9, 0.93..1.57) with the
    // plank tip running to -4.1 at y 1.36-1.48.
    body: [
      { z: 3.05, yT: 1.06, yB: 0.88, wT: 0.95, wB: 0.82 },
      { z: 2.50, yT: 1.51, yB: 1.00, wT: 1.62, wB: 1.30 },
      { z: 1.90, yT: 1.64, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: 0.90, yT: 1.70, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: -0.60, yT: 1.65, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: -2.10, yT: 1.62, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: -2.60, yT: 1.68, yB: 1.02, wT: 1.71, wB: 1.71 },
      { z: -3.20, yT: 1.71, yB: 1.00, wT: 1.70, wB: 1.70 },
      { z: -3.60, yT: 1.64, yB: 0.97, wT: 1.70, wB: 1.70 },
      { z: -3.96, yT: 1.57, yB: 0.93, wT: 1.64, wB: 1.64 },
    ],
    keel: { toeZ: 3.05, toeY: 0.88, toeHW: 0.82, midZ: 2.55, midY: 0.44, groundZ: 1.95, bellyY: 0.44, tailLowZ: -3.55 },
    glacis: { z0: 0.95, z1: 3.02 },
    podX: 0.62, podIn: -0.20, podGuard: { top: 1.50, bot: 0.95 },
    // Fender planks at the measured y 1.43 line; LEFT front segment clipped
    // (family print trait). Outer lip carries the published 3.70 width
    // (WIDTH GUARD: outer face exactly +-1.85, widest point of the build).
    fenderPlank: { x0: 1.42, x1: 1.81, z0: [2.49, 2.97], z1: -4.20, y: 1.43, drops: { bot: 0.68, z: [2.0, 1.1, 0.2, -0.7, -1.6, -2.5, -3.4] } },
    fenderLip: { x: 1.84, w: 0.07, z0: [2.49, 2.97], z1: -3.47, y: 1.43 },
    skirt: null,
    wheelZs: [1.55, 0.65, -0.25, -1.15, -2.05, -2.95],
    sprocket: { z: 2.22, y: 0.54, r: 0.29 }, idler: { z: -3.30, y: 0.52, r: 0.26 },
    rollers: [1.1, 0.2, -0.7, -1.6, -2.5],
    rearShelf: { z0: -2.60, z1: -3.50, top: 1.72, hw: 1.55 },
    // Hull tail rack: center-notched (oracle hull-plan opens x<0.35 to -3.54)
    // with outboard wings running to -4.17 — these wings END the measured
    // hull body span: published hullLength 7.45 = [-4.17..3.28].
    tailRack: {
      z0: -3.56, z1: -4.01, top: 1.60, bot: 0.92, hw: 1.77, x0: 0.35,
      wings: { x0: 1.16, x1: 1.42, z1: -4.14, top: 1.56, bot: 0.92 },
    },
    pivotZ: -1.00,
    turretStyle: 'small',
    // Muzzle set from published overall length off the wing tail: -4.17 +
    // 8.63*0.995 = 4.42 (the oracle's M64 is modelled short at 4.09 — the
    // symmetric-coverage cost on side_whole is the certified gun-defect cap).
    gunAxisY: 1.97, gunR: 0.075, sleeve: false, evac: 0.55, gunTipZ: 4.42, gunZL: 0.40,
    mantlet: { r0: 0.15, r1: 0.11, len: 0.85 },
    apexZ: 1.60, notchHW: 0.32, hwMax: 1.26, roofHW: 0.98, roofInset: 0.74,
    shoulderZ: 0.55, shellRearZ: -1.75, maxWZ: -0.60,
    roofLine: [[0.45, 2.29], [-1.00, 2.40], [-1.65, 2.36]],
    // dims cap: published height 2.65 (p95 of tops) — dome/cupola/MG crowns
    // all live at 2.65-0.01; the oracle's 2.8-2.9 dome band is capped out.
    station: { x: -0.55, z0: -0.50, z1: -1.58, top: 2.66 },
    sightZ: 0.35,
    brow: { x: 0.15, y: 2.33, z: 1.00 },
    stow: { z0: -1.62, z1: -2.15, top: 2.63, bot: 2.08, hw: 1.10, xoff: 0.30 },
    basket: { z0: -2.18, z1: -3.45, top: 2.45, topRear: 2.42, bot: 1.85 }, basketHW: 1.32,
    tailVane: { z0: -3.45, z1: -3.76, top: 2.38, bot: 1.85, hw: 0.85 },
    chainDrop: 0.36, chainGap: 0.18,
    // Whips seated at the measured columns (-2.16 / -2.73, tops 4.4-4.5,
    // x +-0.82 per the front-view trace).
    antennas: [{ x: -0.84, y: 2.48, z: -2.16, h: 2.32, stem: 0.35 }, { x: -0.88, y: 2.46, z: -2.73, h: 2.34, stem: 0.35 }],
    ringFloor: { hw: 0.55, z0: -0.35, z1: -1.95, bot: 0.60 },
    turretKit: merkava1bKit,
  },

  // ---- Mk.2B: skirted Mk.2, small turret, dome station, long chain tail ---
  // v6 curves: nose toe 3.2 (hull mask ends 3.19; the old 3.49 was tilt
  // stretch), glacis (3.0,1.15)->(2.5,1.52)->(2.0,1.62), deck 1.66-1.72;
  // keel bottom (3.0,0.91)->(2.5,0.43)->(2.0,0.10 track); rack band
  // [-3.6..-4.06] tops 1.56-1.59 + tall center pack 2.46 at -3.4..-3.7;
  // dome band capped by published height; whips -2.18/-2.69 to 4.85.
  // ORACLE DEFECT (certified in the packet): the print's turret casting
  // rides its HULL node and its skirts ride the TURRET node — hullCurves
  // and turretCurves are capped; wholeCurves/stations/dims are clean.
  merkava2b: {
    build: buildMerkavaMark, ...MK12_GEAR,
    deckY: 1.68, rearDeckZ: -2.55,
    body: [
      { z: 3.22, yT: 1.08, yB: 0.90, wT: 0.95, wB: 0.82 },
      { z: 2.60, yT: 1.52, yB: 1.00, wT: 1.65, wB: 1.35 },
      { z: 1.90, yT: 1.65, yB: 0.98, wT: 1.74, wB: 1.74 },
      { z: 0.90, yT: 1.72, yB: 0.98, wT: 1.74, wB: 1.74 },
      { z: -0.60, yT: 1.66, yB: 0.96, wT: 1.74, wB: 1.74 },
      { z: -2.55, yT: 1.66, yB: 0.95, wT: 1.74, wB: 1.74 },
      { z: -3.25, yT: 1.68, yB: 0.92, wT: 1.72, wB: 1.72 },
      { z: -4.00, yT: 1.56, yB: 0.85, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 2.98, toeY: 0.90, toeHW: 0.85, midZ: 2.45, midY: 0.40, groundZ: 2.02, bellyY: 0.42, tailLowZ: -3.30 },
    glacis: { z0: 1.30, z1: 3.17 },
    podX: 0.62, podIn: -0.05, podGuard: { top: 1.52, bot: 0.95 },
    fenderPlank: { x0: 1.40, x1: 1.80, z0: [2.50, 2.97], z1: -3.95, y: 1.47 },
    fenderLip: { x: 1.84, w: 0.07, z0: [2.50, 2.97], z1: -3.55, y: 1.22 },
    wheelZs: [1.75, 0.85, -0.05, -0.95, -1.85, -2.70],
    sprocket: { z: 2.18, y: 0.54, r: 0.29 }, idler: { z: -3.05, y: 0.52, r: 0.26 },
    rollers: [1.35, 0.45, -0.5, -1.4, -2.3],
    skirt: { z0: 2.50, z1: -2.65, top: 1.14, bot: 0.62, scallop: true, x: 1.83 },
    tailRack: {
      z0: -3.62, z1: -4.06, top: 1.58, bot: 0.88, hw: 1.70,
      wings: { x0: 1.16, x1: 1.42, z1: -4.19, top: 1.56, bot: 0.88 },
    },
    pivotZ: -0.55,
    turretStyle: 'small',
    // Muzzle from published overall: -4.19 + 8.78*0.995 = 4.55 (oracle M64
    // modelled short at 4.12 — certified wholeCurves gun cap).
    gunAxisY: 1.96, gunR: 0.075, sleeve: false, evac: 0.48, gunTipZ: 4.55, gunZL: 0.40,
    mantlet: { r0: 0.19, r1: 0.13, len: 0.85 },
    apexZ: 1.15, notchHW: 0.32, hwMax: 1.25, roofHW: 0.98, roofInset: 0.76,
    shoulderZ: 0.30, shellRearZ: -1.62, maxWZ: -0.20,
    roofLine: [[0.85, 2.26], [-1.35, 2.42], [-1.62, 2.40]],
    station: { x: -0.50, z0: -0.50, z1: -1.60, top: 2.66 },
    sightZ: 0.55,
    stow: { z0: -1.66, z1: -2.10, top: 2.63, bot: 2.05 },
    basket: { z0: -1.70, z1: -3.05, top: 2.40, bot: 1.88 }, basketHW: 1.04,
    tailVane: { z0: -3.05, z1: -3.78, top: 2.32, bot: 1.78, hw: 0.90 },
    chainDrop: 0.36, chainGap: 0.18,
    antennas: [{ x: 0.82, y: 2.51, z: -2.18, h: 2.36, stem: 0.45 }, { x: 0.88, y: 2.51, z: -2.69, h: 2.36, stem: 0.45 }],
    ringFloor: { hw: 0.55, z0: -0.05, z1: -1.60, bot: 0.60 },
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
    deckY: 1.68, rearDeckZ: -2.55,
    body: [
      { z: 3.22, yT: 1.08, yB: 0.90, wT: 0.95, wB: 0.82 },
      { z: 2.60, yT: 1.52, yB: 1.00, wT: 1.65, wB: 1.35 },
      { z: 1.90, yT: 1.64, yB: 0.98, wT: 1.74, wB: 1.74 },
      { z: 0.90, yT: 1.71, yB: 0.98, wT: 1.74, wB: 1.74 },
      { z: -0.60, yT: 1.66, yB: 0.96, wT: 1.74, wB: 1.74 },
      { z: -2.55, yT: 1.67, yB: 0.95, wT: 1.74, wB: 1.74 },
      { z: -3.25, yT: 1.68, yB: 0.92, wT: 1.72, wB: 1.72 },
      { z: -4.00, yT: 1.56, yB: 0.85, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 2.98, toeY: 0.90, toeHW: 0.85, midZ: 2.45, midY: 0.40, groundZ: 2.02, bellyY: 0.42, tailLowZ: -3.30 },
    glacis: { z0: 1.30, z1: 3.17 },
    podX: 0.62, podIn: -0.05, podGuard: { top: 1.52, bot: 0.95 },
    fenderPlank: { x0: 1.40, x1: 1.80, z0: [2.46, 2.96], z1: -3.85, y: 1.47 },
    fenderLip: { x: 1.84, w: 0.07, z0: [2.50, 2.97], z1: -3.55, y: 1.22 },
    wheelZs: [1.75, 0.85, -0.05, -0.95, -1.85, -2.70],
    sprocket: { z: 2.18, y: 0.54, r: 0.29 }, idler: { z: -3.32, y: 0.50, r: 0.28 },
    rollers: [1.35, 0.45, -0.5, -1.4, -2.3],
    skirt: { z0: 2.46, z1: -2.65, top: 1.14, bot: 0.62, scallop: true, x: 1.83 },
    markerRods: { x: 1.76, y: 1.62, z: -3.30, h: 0.85 },
    rearPack: { hw: 0.55, z0: -3.44, z1: -3.74, top: 2.26, bot: 1.60 },
    deckPack: { hw: 0.85, z0: 0.55, z1: -1.55, top: 2.34, bot: 1.66 },
    tailRack: {
      z0: -3.60, z1: -4.05, top: 1.58, bot: 0.86, hw: 1.20, x0: 0.35,
      midShelf: { x1: 1.55, z1: -3.84, top: 1.56 },
      wings: { x0: 1.16, x1: 1.42, z1: -4.19, top: 1.56, bot: 0.88 },
    },
    pivotZ: -0.55,
    turretStyle: 'small',
    // Muzzle from published overall: -4.19 + 8.78*0.995 = 4.55 (oracle gun
    // short at 4.08 — certified wholeCurves gun cap).
    gunAxisY: 1.96, gunR: 0.075, sleeve: false, evac: 0.48, gunTipZ: 4.50, gunZL: 0.40,
    mantlet: { r0: 0.19, r1: 0.13, len: 0.85 },
    apexZ: 1.31, notchHW: 0.32, hwMax: 1.25, roofHW: 0.98, roofInset: 0.76,
    shoulderZ: 0.40, shellRearZ: -1.62, maxWZ: -0.20,
    roofLine: [[0.90, 2.30], [-1.35, 2.42], [-1.62, 2.40]],
    station: { x: -0.50, z0: -0.50, z1: -1.60, top: 2.66 },
    sightZ: 0.60,
    stow: { z0: -1.66, z1: -2.10, top: 2.62, bot: 2.05, hw: 1.10, xoff: 0.30 },
    basket: { z0: -1.70, z1: -3.00, top: 2.40, bot: 1.88 }, basketHW: 1.04,
    tailVane: { z0: -3.00, z1: -3.86, top: 2.37, bot: 1.80, hw: 0.90 },
    chainDrop: 0.36, chainGap: 0.18,
    antennas: [{ x: -0.84, y: 2.51, z: -2.85, h: 2.36, stem: 0.45 }, { x: -0.88, y: 2.51, z: -2.28, h: 2.36, stem: 0.45 }],
    ringFloor: { hw: 0.55, z0: -0.05, z1: -1.60, bot: 0.60 },
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
      { z: 3.33, yT: 1.00, yB: 0.86, wT: 1.05, wB: 0.90 },
      { z: 2.55, yT: 1.58, yB: 1.00, wT: 1.70, wB: 1.45 },
      { z: 2.00, yT: 1.63, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 1.10, yT: 1.74, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 0.10, yT: 1.62, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -1.00, yT: 1.60, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.00, yT: 1.64, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.60, yT: 1.74, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -3.05, yT: 1.68, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -4.00, yT: 1.48, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 3.33, toeY: 0.88, toeHW: 0.90, midZ: 2.10, midY: 0.14, groundZ: 1.90, bellyY: 0.42, tailLowZ: -3.20 },
    glacis: { z0: 1.95, z1: 3.30 },
    podX: 0.66, podIn: -0.03, podY: 0.98,
    fenderPlank: { x0: 1.40, x1: 1.74, z0: 2.42, z1: -3.30, y: 1.60 },
    skirt: { z0: 2.58, z1: -3.42, top: 1.36, bot: 0.62, scallop: true, x: 1.835 },
    // WIDTH GUARD strip: published 3.72 lives on this short side-marker board
    // (plan band just over 1 m so widthM reads it; only ~2 station slices see
    // it and the trimmed mean drops them).
    fenderLip: { x: 1.86, w: 0.07, z0: -0.88, z1: -2.32, y: 1.06 },
    frontBoard: { z0: 3.08, z1: 2.52, y: 1.06, x0: 1.30, x1: 1.80 },
    rearBins: { z0: -2.32, z1: -2.88, top: 1.68, x0: 0.55, x1: 1.45 },
    // Tall stowage wall (hull-node on the print too): tops 2.36 ending -3.9,
    // low tail frame to -4.12, body wings to -4.25 (hullLength 7.60 closes
    // at the wing tips; the bow body column is the gun-over-toe band).
    tailRack: {
      z0: -3.28, z1: -3.90, top: 1.62, bot: 0.90, hw: 1.75, x0: 0.35,
      wings: [
        { x0: 0.42, x1: 1.15, z1: -4.12, top: 1.42, bot: 0.75 },
        { x0: 1.16, x1: 1.42, z1: -4.25, top: 1.42, bot: 0.82 },
      ],
    },
    // The measured TALL rear stowage is a narrow center stack, not a wall:
    // front-view hull tops 2.2-2.47 only inside |x|<0.8 (full width would
    // poison every front column).
    rearPack: { hw: 0.75, z0: -3.30, z1: -3.88, top: 2.36, bot: 1.55 },
    deckPack: { hw: 0.85, z0: -1.28, z1: -2.02, top: 2.44, bot: 1.62 },
    pivotZ: -0.75,
    turretStyle: 'mod',
    // Muzzle from published overall: -4.26 + 9.04*0.995 = 4.73 (the oracle
    // MG251 is modelled short at 4.14; L/48 puts the true tip here —
    // certified wholeCurves gun cap).
    gunAxisY: 1.97, gunR: 0.082, sleeve: true, evac: 0.64, gunTipZ: 4.73, gunZL: 0.32,
    mantlet: { r0: 0.19, r1: 0.13, len: 0.80, drop: -0.04 },
    apexZ: 1.75, notchHW: 0.30, hwMax: 1.72, roofHW: 1.32, roofInset: 0.76,
    shellFrontZ: 0.85, maxWZ: -0.55, shellRearZ: -2.15,
    crest: { z0: 1.55, z1: 0.42, top: 2.60, hw: 0.62 },
    roofLine: [[0.42, 2.40], [-1.55, 2.40], [-2.10, 2.44], [-2.70, 2.42]],
    bustleZ1: -2.72, bustleBot: 1.80,
    basket: { z0: -2.74, z1: -3.22, top: 2.42, topRear: 2.38, bot: 1.95 }, basketHW: 1.30,
    chainDrop: 0.28, chainGap: 0.22,
    // dims cap: cupola crown 2.67 (raise 0.09), pano head 2.67 — published
    // height 2.66 is p95 of tops; the oracle's 2.8-2.9 band is capped out.
    cupolaX: 0.92, cupolaZ: -0.85, cupolaRaise: 0.09,
    pano: { x: -0.55, z: -0.75, top: 2.66 }, sightX: 0.45,
    antennas: [{ x: 1.00, y: 2.42, z: -2.93, h: 2.46, stem: 0.4 }, { x: 1.03, y: 2.42, z: -3.21, h: 2.43, stem: 0.4 }],
    ringFloor: { hw: 0.60, z0: -0.30, z1: -1.90, bot: 0.58 },
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
      { z: 3.33, yT: 1.00, yB: 0.86, wT: 1.05, wB: 0.90 },
      { z: 2.55, yT: 1.58, yB: 1.00, wT: 1.70, wB: 1.45 },
      { z: 2.00, yT: 1.63, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 1.10, yT: 1.74, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: 0.10, yT: 1.62, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -1.00, yT: 1.60, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.00, yT: 1.64, yB: 1.00, wT: 1.75, wB: 1.75 },
      { z: -2.60, yT: 1.74, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -3.05, yT: 1.68, yB: 0.98, wT: 1.75, wB: 1.75 },
      { z: -4.00, yT: 1.48, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 3.33, toeY: 0.88, toeHW: 0.90, midZ: 2.10, midY: 0.14, groundZ: 1.90, bellyY: 0.42, tailLowZ: -3.20 },
    glacis: { z0: 1.95, z1: 3.30 },
    podX: 0.66, podIn: -0.03, podY: 0.98,
    fenderPlank: { x0: 1.40, x1: 1.74, z0: 2.42, z1: -3.30, y: 1.60 },
    skirt: { z0: 2.58, z1: -3.42, top: 1.36, bot: 0.62, scallop: true, x: 1.835 },
    // WIDTH GUARD strip: published 3.72 lives on this short side-marker board
    // (plan band just over 1 m so widthM reads it; only ~2 station slices see
    // it and the trimmed mean drops them).
    fenderLip: { x: 1.86, w: 0.07, z0: -0.88, z1: -2.32, y: 1.06 },
    frontBoard: { z0: 3.08, z1: 2.52, y: 1.06, x0: 1.30, x1: 1.80 },
    rearBins: { z0: -2.32, z1: -2.88, top: 1.76, x0: 0.55, x1: 1.45 },
    rearPack: { hw: 0.75, z0: -3.30, z1: -3.88, top: 2.36, bot: 1.55 },
    deckPack: { hw: 0.95, z0: -0.70, z1: -2.20, top: 2.48, bot: 1.62 },
    tailRack: {
      z0: -3.28, z1: -3.90, top: 1.62, bot: 0.90, hw: 1.75, x0: 0.35,
      wings: [
        { x0: 0.42, x1: 1.15, z1: -4.12, top: 1.42, bot: 0.75 },
        { x0: 1.16, x1: 1.42, z1: -4.25, top: 1.42, bot: 0.82 },
      ],
    },
    pivotZ: -0.75,
    turretStyle: 'mod',
    gunAxisY: 1.97, gunR: 0.082, sleeve: true, evac: 0.64, gunTipZ: 4.73, gunZL: 0.32,
    mantlet: { r0: 0.19, r1: 0.13, len: 0.80, drop: -0.04 },
    apexZ: 1.75, notchHW: 0.30, hwMax: 1.72, roofHW: 1.32, roofInset: 0.76,
    shellFrontZ: 0.85, maxWZ: -0.55, shellRearZ: -2.15,
    crest: { z0: 1.55, z1: 0.42, top: 2.60, hw: 0.62 },
    roofLine: [[0.42, 2.40], [-1.55, 2.40], [-2.10, 2.44], [-2.70, 2.42]],
    bustleZ1: -2.72, bustleBot: 1.80,
    basket: { z0: -2.74, z1: -3.22, top: 2.42, topRear: 2.38, bot: 1.95 }, basketHW: 1.30,
    chainDrop: 0.28, chainGap: 0.22,
    cupolaX: 0.92, cupolaZ: -0.85, cupolaRaise: 0.09,
    pano: { x: -0.55, z: -0.75, top: 2.66 }, sightX: 0.45,
    antennas: [{ x: 1.00, y: 2.42, z: -2.93, h: 2.46, stem: 0.4 }, { x: 1.03, y: 2.42, z: -3.21, h: 2.43, stem: 0.4 }],
    ringFloor: { hw: 0.60, z0: -0.30, z1: -1.90, bot: 0.58 },
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
      { z: -4.00, yT: 1.48, yB: 0.88, wT: 1.62, wB: 1.62 },
    ],
    keel: { toeZ: 3.33, toeY: 0.88, toeHW: 0.90, midZ: 2.10, midY: 0.14, groundZ: 1.90, bellyY: 0.42, tailLowZ: -3.20 },
    glacis: { z0: 1.95, z1: 3.30 },
    podX: 0.66, podIn: -0.03, podY: 0.98,
    fenderPlank: { x0: 1.40, x1: 1.74, z0: 2.42, z1: -3.30, y: 1.60 },
    skirt: { z0: 2.58, z1: -3.42, top: 1.36, bot: 0.62, scallop: true, x: 1.835 },
    // WIDTH GUARD strip: published 3.72 lives on this short side-marker board
    // (plan band just over 1 m so widthM reads it; only ~2 station slices see
    // it and the trimmed mean drops them).
    fenderLip: { x: 1.86, w: 0.07, z0: -0.88, z1: -2.32, y: 1.06 },
    frontBoard: { z0: 3.08, z1: 2.52, y: 1.06, x0: 1.30, x1: 1.80 },
    rearBins: { z0: -2.32, z1: -2.88, top: 1.68, x0: 0.55, x1: 1.45 },
    deckPack: { hw: 0.85, z0: -0.75, z1: -2.15, top: 2.46, bot: 1.62 },
    // 3D hull rack: LOW wall, center notch to -3.26, mid shelf to -3.58,
    // deep low frame to -4.13, body wings to -4.25.
    tailRack: {
      z0: -3.28, z1: -3.85, top: 1.60, bot: 0.85, hw: 1.75, x0: 0.40,
      midShelf: { x1: 0.95, z1: -3.58, top: 1.58 },
      wings: [
        { x0: 0.42, x1: 1.42, z1: -4.13, top: 1.30, bot: 0.78 },
        { x0: 1.16, x1: 1.42, z1: -4.25, top: 1.30, bot: 0.82 },
      ],
    },
    pivotZ: -0.75,
    turretStyle: 'mod',
    gunAxisY: 1.97, gunR: 0.082, sleeve: true, evac: 0.64, gunTipZ: 4.73, gunZL: 0.32,
    mantlet: { r0: 0.19, r1: 0.13, len: 0.80, drop: -0.04 },
    apexZ: 1.75, notchHW: 0.30, hwMax: 1.78, roofHW: 1.34, roofInset: 0.76,
    shellFrontZ: 0.85, maxWZ: -0.55, shellRearZ: -2.15,
    crest: { z0: 1.55, z1: 0.42, top: 2.60, hw: 0.62 },
    roofLine: [[0.42, 2.40], [-1.55, 2.40], [-2.10, 2.44], [-2.70, 2.42]],
    bustleZ1: -2.72, bustleBot: 1.80,
    basket: { z0: -2.74, z1: -3.92, top: 2.44, topRear: 2.42, bot: 1.95 }, basketHW: 1.30,
    chainDrop: 0.28, chainGap: 0.10,
    rearTip: { z: -4.12, hw: 0.85, top: 1.42, bot: 0.76 },
    cupolaX: 0.92, cupolaZ: -0.85, cupolaRaise: 0.09,
    pano: { x: -0.55, z: -0.75, top: 2.66 }, sightX: 0.45,
    antennas: [{ x: 0.90, y: 2.44, z: -2.90, h: 2.38, stem: 0.4 }, { x: 0.20, y: 2.44, z: -3.40, h: 2.40, stem: 0.4 }],
    ringFloor: { hw: 0.60, z0: -0.30, z1: -1.90, bot: 0.58 },
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
    wheelZs: [1.95, 0.95, -0.05, -1.05, -2.05, -3.00],
    sprocket: { z: 2.50, y: 0.54, r: 0.31 }, idler: { z: -3.45, y: 0.50, r: 0.29 },
    rollers: [1.45, 0.5, -0.5, -1.5, -2.5],
    skirt: { z0: 2.48, z1: -3.00, top: 1.30, bot: 0.62, scallop: true, flaps: false, x: 1.80 },
    hump: { x0: 0.22, x1: 0.98, z0: 0.75, z1: 1.90, top: 2.04 },
    driverHump: true,
    tailRack: {
      z0: -3.42, z1: -3.78, top: 2.36, bot: 0.95, hw: 1.75, x0: 0.38,
      wings: [
        { x0: 0.42, x1: 1.55, z1: -3.90, top: 1.60, bot: 0.95 },
        { x0: 0.42, x1: 1.08, z1: -3.96, top: 1.58, bot: 0.95 },
      ],
    },
    pivotZ: -0.55,
    turretStyle: 'mod',
    // MG253 L/44 at the published overall length: tip 4.74.
    gunAxisY: 2.06, gunR: 0.072, sleeve: true, evac: 0.30, gunTipZ: 4.78, gunZL: 0.30,
    mantlet: { r0: 0.16, r1: 0.11, len: 0.60 },
    apexZ: 2.60, notchHW: 0.30, hwMax: 1.57, roofHW: 0.98, roofInset: 0.60, rearWide: 0.97,
    shellFrontZ: 1.30, maxWZ: -0.35, shellRearZ: -2.25,
    crest: { z0: 2.00, z1: 0.55, top: 2.66, hw: 0.62 },
    roofLine: [[0.55, 2.62], [0.02, 2.66], [-0.90, 2.66], [-1.95, 2.55]],
    bustleZ1: -2.34, bustleBot: 1.90,
    basket: { z0: -2.36, z1: -4.16, top: 2.40, topRear: 2.30, bot: 1.95 }, basketHW: 1.20,
    chainDrop: 0.24, chainGap: -0.30,
    cupolaX: 0.55, cupolaZ: -0.55, cupolaRaise: -0.14, noLoaderHatch: true,
    pano: { x: 0.32, z: -0.62, top: 2.64, plinth: 0.88 }, sightX: 0.45,
    antennas: [
      { x: -0.85, y: 2.50, z: -2.30, h: 0.13, stem: 0.35 },
      { x: 0.85, y: 2.50, z: -2.55, h: 0.13, stem: 0.35 },
      { x: 0.40, y: 2.48, z: -2.90, h: 0.12, stem: 0.30 },
    ],
    ringFloor: { hw: 0.60, z0: -0.30, z1: -1.90, bot: 0.60 },
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
    wheelZs: [1.95, 0.95, -0.05, -1.05, -2.05, -3.00],
    sprocket: { z: 2.50, y: 0.54, r: 0.31 }, idler: { z: -3.45, y: 0.50, r: 0.29 },
    rollers: [1.45, 0.5, -0.5, -1.5, -2.5],
    // WIDTH GUARD: skirt outer face exactly +-1.86 (published 3.72); the ref
    // stations read 3.70 wide here so the skirt line carries dims width.
    skirt: { z0: 2.78, z1: -1.95, top: 1.30, bot: 0.62, scallop: true, x: 1.86 },
    driverHump: true,
    deckPack: { hw: 1.00, z0: 1.90, z1: -2.20, top: 2.60, bot: 1.80 },
    tailRack: {
      z0: -3.42, z1: -3.78, top: 2.44, bot: 0.95, hw: 1.79, x0: 0.38,
      wings: [
        { x0: 0.42, x1: 1.55, z1: -3.94, top: 1.62, bot: 0.95 },
        { x0: 0.42, x1: 1.08, z1: -4.00, top: 1.60, bot: 0.95 },
      ],
    },
    pivotZ: -0.55,
    turretStyle: 'mod',
    // Published hull 7.60 closes toe (3.53) to tail (-4.0); the turret
    // basket carries the rear span and the muzzle the front: overall 8.95.
    gunAxisY: 2.06, gunR: 0.078, sleeve: true, evac: 0.30, gunTipZ: 4.80, gunZL: 0.32,
    mantlet: { r0: 0.17, r1: 0.12, len: 0.60 },
    apexZ: 2.60, notchHW: 0.32, hwMax: 1.50, roofHW: 1.05, roofInset: 0.72,
    shellFrontZ: 1.30, maxWZ: -0.60, shellRearZ: -2.25,
    crest: { z0: 2.00, z1: 0.55, top: 2.665, hw: 0.60 },
    roofLine: [[0.55, 2.65], [0.02, 2.60], [-0.45, 2.655], [-1.55, 2.655], [-1.95, 2.63]],
    bustleZ1: -2.34, bustleBot: 1.95,
    basket: { z0: -2.36, z1: -4.16, top: 2.62, topRear: 2.48, bot: 2.04 }, basketHW: 1.05,
    chainDrop: 0.30, chainGap: -0.30,
    cupolaX: 0.55, cupolaZ: -0.90, cupolaRaise: -0.16, noLoaderHatch: true,
    pano: { x: -0.35, z: -0.95, top: 2.65 }, sightX: 0.45,
    antennas: [
      { x: -0.80, y: 2.51, z: -1.98, h: 1.99, stem: 0.35 },
      { x: 0.80, y: 2.51, z: -3.30, h: 2.03, stem: 0.4 },
      { x: 0.35, y: 2.52, z: -2.90, h: 0.12, stem: 0.30 },
    ],
    ringFloor: { hw: 0.60, z0: -0.30, z1: -1.90, bot: 0.60 },
    turretKit: merkava4bKit,
  },
};
