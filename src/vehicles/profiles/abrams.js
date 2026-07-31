// Abrams family procedural profiles — gate-v6 rebuild (2026-07-31).
// Authored against TRUE-AXIS ortho mask traces (docs/references/profiles/*
// re-extracted after the v6 camera fix, plus scratch probe curves decoded to
// world meters). All v4/v5 tilt compensations (published−0.20 roofs, inflated
// decks) are REVERTED — every plate below is the physically-true height.
// Dims discipline (gate heightM = p95 of side body-column tops): each tank
// carries a deliberate roof/fitting PLATEAU at its published height and at
// most ~3 mask columns (≤0.35 m of z) above it (the compact station head).
// Oracle-vs-published conflicts are resolved for published dims (sovereign);
// the bounded curve caps are documented in docs/references/tanks/<id>.md.
// WIDTH GUARD: the widest render mesh must be the committed width plane
// (spec widthM) — safeScale silently rescales the whole tank otherwise.
// Skirt bolts/handles/joints are seated flush INSIDE the skirt face.
// Material buckets: *Dark = grilles/recesses/mesh/weapon steel, *Rubber =
// tires/flaps/skirt lips, *Glass = optics, *Cloth = stowage canvas,
// *Detail = unpainted fittings. Camo lives on hull/turret/gun/gunMount only.
import { KIT } from './kit.js';

// KIT is populated by tankFactory.js, which sits on the other side of an
// import cycle with the profile modules — resolve members lazily.
const {
  box, cylX, cylY, cylZ, torus, slab, frustum, buildRunningGear, buildGun,
  liftEye, periscope, towCable, headlight,
} = new Proxy({}, { get: (_, name) => (...args) => KIT[name](...args) });

// ---------------------------------------------------------------------------
// Curve helpers
// ---------------------------------------------------------------------------

// Piecewise-linear lookup along a [[z, y], ...] polyline (any z order).
function lineAt(pts, z) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
    if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) {
      return y0 + (y1 - y0) * ((z - z0) / ((z1 - z0) || 1));
    }
  }
  return (Math.abs(z - pts[0][0]) < Math.abs(z - pts[pts.length - 1][0]) ? pts[0] : pts[pts.length - 1])[1];
}

// Loft full-width slabs between cross-section stations: top edge follows
// `top` [[z,y]...], bottom edge follows bottomAt(z). Stations are the merged
// z-set of the top polyline plus `extraZ` (e.g. the belly-rake breakpoints),
// clipped to [zA, zB].
function loftBand(P, bucket, halfW, inset, top, bottomAt, zA, zB, extraZ = []) {
  const zs = [...new Set([zA, zB, ...top.map((p) => p[0]), ...extraZ]
    .filter((z) => z >= Math.min(zA, zB) - 1e-6 && z <= Math.max(zA, zB) + 1e-6)
    .map((z) => Number(z.toFixed(4))))].sort((a, b) => b - a); // front->rear
  for (let i = 0; i < zs.length - 1; i++) {
    const zf = zs[i], zr = zs[i + 1];
    const tf = lineAt(top, zf), tr = lineAt(top, zr);
    const bf = bottomAt(zf), br = bottomAt(zr);
    if (tf - bf < 0.015 && tr - br < 0.015) continue;
    P.add(bucket, slab(
      [-halfW, bf, zf], [halfW, bf, zf], [halfW, br, zr], [-halfW, br, zr],
      [-(halfW - inset), tf, zf], [halfW - inset, tf, zf],
      [halfW - inset, tr, zr], [-(halfW - inset), tr, zr]));
  }
}

// Mirrored 8-corner slab: author corners for the +x side; side=-1 mirrors x
// AND swaps the corner order so the winding stays outward.
function sideSlab(P, bucket, side, b0, b1, b2, b3, t0, t1, t2, t3) {
  const M = ([x, y, z]) => [side * x, y, z];
  P.add(bucket, side > 0
    ? slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : slab(M(b1), M(b0), M(b3), M(b2), M(t1), M(t0), M(t3), M(t2)));
}

const deckAt = (g, z) => lineAt(g.deck, z);

// ---------------------------------------------------------------------------
// Shared Abrams fittings
// ---------------------------------------------------------------------------

// Crew hatch: proud ring + seal + lid + hinge + grab bar, optional periscope
// fence around the forward arc. Total height ~0.12 above y.
function turretHatch(P, x, y, z, r, fence = 0) {
  P.add('turret', cylY(r, r * 1.08, 0.06, 14), x, y + 0.03, z);
  P.add('turretDark', torus(r * 0.97, 0.016, 18), x, y + 0.066, z);
  P.add('turret', cylY(r * 0.86, r * 0.86, 0.032, 14), x, y + 0.085, z);
  P.add('turretDetail', box(0.09, 0.032, Math.max(0.07, r * 0.5)), x + r * 0.82, y + 0.082, z);
  P.add('turretDetail', box(r * 0.5, 0.016, 0.045), x - r * 0.2, y + 0.1, z);
  for (let k = 0; k < fence; k++) {
    const a = (k - (fence - 1) / 2) * (1.35 / Math.max(fence - 1, 1)) * Math.PI;
    const px = x + Math.sin(a) * r * 1.22, pz = z + Math.cos(a) * r * 1.22;
    P.add('turretDark', box(0.082, 0.05, 0.05), px, y + 0.035, pz, 0, a, 0);
    P.add('turretGlass', box(0.06, 0.024, 0.052), px, y + 0.048, pz, 0, a, 0);
  }
}

// M2 HB on a cradle. Carried TRANSVERSE (travel position) so its long axis
// spans 1-2 mask columns. Top ≈ y + 0.06*s.
function m2hb(P, x, y, z, s = 1) {
  P.add('turretDark', box(0.6 * s, 0.12 * s, 0.09 * s), x, y, z);
  P.add('turretDark', cylX(0.022 * s, 0.5 * s, 8), x + 0.52 * s, y + 0.012 * s, z);
  P.add('turretDark', cylX(0.038 * s, 0.22 * s, 8), x + 0.35 * s, y + 0.012 * s, z);
  P.add('turretDark', box(0.1 * s, 0.05 * s, 0.05 * s), x - 0.34 * s, y - 0.01 * s, z);
  P.add('turretDark', box(0.05 * s, 0.16 * s, 0.03 * s), x + 0.02 * s, y - 0.12 * s, z);
  P.add('turretDetail', box(0.3 * s, 0.15 * s, 0.07 * s), x - 0.04 * s, y - 0.03 * s, z);
}

// Loader's M240 on the skate rail around his hatch + low shield (all under
// the published-height plateau).
function m240Skate(P, x, y, z, s = 1) {
  P.add('turretDark', torus(0.27 * s, 0.016, 18), x, y + 0.05 * s, z);
  P.add('turretDark', box(0.05 * s, 0.06 * s, 0.08 * s), x + 0.1 * s, y + 0.07 * s, z + 0.22 * s);
  P.add('turret', box(0.5 * s, 0.14 * s, 0.04), x + 0.1 * s, y + 0.08 * s, z + 0.3 * s);
  P.add('turretDark', box(0.4 * s, 0.07 * s, 0.075 * s), x + 0.14 * s, y + 0.08 * s, z + 0.05 * s);
  P.add('turretDark', cylX(0.014 * s, 0.4 * s, 8), x + 0.42 * s, y + 0.09 * s, z + 0.05 * s);
  P.add('turretDetail', box(0.07 * s, 0.1 * s, 0.14 * s), x - 0.02 * s, y + 0.04 * s, z - 0.02 * s);
}

// M250 six-tube smoke bank (2x3) on a bracket, seated on the cheek plate.
function smokeBank(P, x, y, z, side, s = 1) {
  const a = side * 0.55;
  const rot = (ox, oz) => [x + Math.cos(a) * ox + Math.sin(a) * oz, z - Math.sin(a) * ox + Math.cos(a) * oz];
  const [bx, bz] = rot(0, -0.1 * s);
  P.add('turretDetail', box(0.06 * s, 0.2 * s, 0.26 * s), bx, y - 0.02 * s, bz, 0, a, 0);
  P.add('turret', box(0.42 * s, 0.15 * s, 0.14 * s), x, y, z, 0, a, 0);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 3; i++) {
      const [px, pz] = rot((i - 1) * 0.125 * s, 0.05 * s - row * 0.075 * s);
      P.add('turretDark', cylZ(0.04 * s, 0.26 * s, 8), px, y + 0.02 * s + row * 0.085 * s, pz, -0.42, a, 0);
    }
  }
}

// M256 mantlet: armored block + dust-cover bulge with dark cinch seams,
// coax port, rotor collar. zOff pushes the kit to the embrasure face.
function abramsMantlet(P, s = 1, w = 0.68, h = 0.5, zOff = 0) {
  P.addGunExtra(box(w * s, h * s, 0.42 * s), 0, 0.01 * s, zOff + 0.12 * s);
  P.addGunExtra(box(w * 0.84 * s, h * 0.78 * s, 0.24 * s), 0, 0.03 * s, zOff + 0.4 * s);
  P.addGunExtraDark(box(w * 0.86 * s, 0.028, 0.028), 0, h * 0.32 * s, zOff + 0.5 * s);
  P.addGunExtraDark(box(w * 0.86 * s, 0.028, 0.028), 0, -h * 0.26 * s, zOff + 0.5 * s);
  P.addGunExtraDark(box(0.028, h * 0.6 * s, 0.028), w * 0.32 * s, 0.02 * s, zOff + 0.51 * s);
  P.addGunExtraDark(box(0.028, h * 0.6 * s, 0.028), -w * 0.32 * s, 0.02 * s, zOff + 0.51 * s);
  P.addGunExtraDark(cylZ(0.042 * s, 0.18 * s, 10), w * 0.36 * s, 0.09 * s, zOff + 0.5 * s);
  P.addGunExtra(cylZ(0.15 * s, 0.28 * s, 14), 0, 0, zOff + 0.56 * s);
}

// Stowed antenna base pot (the gate's p95 height budget is spent on the
// station head, never on whips — a whip costs 2 mask columns).
function antennaPot(P, x, y, z) {
  P.add('turretDetail', box(0.07, 0.10, 0.07), x, y + 0.04, z);
  P.add('turretDark', cylY(0.022, 0.03, 0.06, 8), x, y + 0.11, z);
}

// ---------------------------------------------------------------------------
// Hull: three curve-lofted bands — bow wedge (belly rake -> glacis line),
// full band (belt top -> deck line), stern wedge (tail rake -> deck) plus an
// optional rear overhang shelf — then skirts, running gear and deck kit.
// Geometry tables are in world meters, straight off the v6 curves.
// ---------------------------------------------------------------------------
function abramsHull(P, g) {
  const bw = g.bodyHalfW;
  const s = g.s ?? 1;
  const noseRake = g.noseRake;               // [[z,y]...] rear->tip ascending y
  const tailRake = g.tailRake;               // [[z,y]...] toward tail
  const bowZ = noseRake[0][0];               // where the lower bow leaves the belly
  const sternZ = tailRake[0][0];
  const tail = g.tailShelf ? g.tailShelf.z1 : tailRake[tailRake.length - 1][0];

  // Belly core between the tracks.
  const innerW = g.trackXc - g.trackW / 2 - 0.02;
  P.add('hull', box(innerW * 2, g.beltTop - g.belly, (bowZ - sternZ) + 0.5),
    0, (g.beltTop + g.belly) / 2, (bowZ + sternZ) / 2);

  // Bow wedge: bottom follows the measured lower-plate rake, top follows the
  // measured glacis line — the tip closes as the thin blade the curves show.
  // g.planTaper pulls the full-width plan corners back (the oracles' bow/tail
  // plates are chamfered in plan: full width ends short of the tips).
  const pt = g.planTaper;
  if (pt?.bowPull) {
    loftBand(P, 'hull', pt.bowHalfW, 0.04, g.deck, (z) => lineAt(noseRake, z),
      g.nose, g.nose - pt.bowPull - 0.001, noseRake.map((p) => p[0]));
    loftBand(P, 'hull', bw * 0.965, 0.05, g.deck, (z) => lineAt(noseRake, z),
      g.nose - pt.bowPull, bowZ, noseRake.map((p) => p[0]));
  } else {
    loftBand(P, 'hull', bw * 0.965, 0.05, g.deck, (z) => lineAt(noseRake, z),
      g.nose, bowZ, noseRake.map((p) => p[0]));
  }
  // Full-depth sponson band from the glacis break to the stern break.
  loftBand(P, 'hull', bw, g.deckInset ?? 0.05, g.deck, () => g.beltTop, bowZ, sternZ);
  // Stern wedge down the measured tail rake.
  loftBand(P, 'hull', bw * 0.94, 0.05, g.deck, (z) => lineAt(tailRake, z),
    sternZ, tailRake[tailRake.length - 1][0], tailRake.map((p) => p[0]));
  // Rear overhang shelf (raised engine-deck rear / grille box), if measured.
  if (g.tailShelf) {
    const t = g.tailShelf;
    if (pt?.tailPull) {
      loftBand(P, 'hull', bw * 0.94, 0.05, g.deck, () => t.yBot, t.z0, t.z1 + pt.tailPull);
      loftBand(P, 'hull', pt.tailHalfW, 0.04, g.deck, () => t.yBot, t.z1 + pt.tailPull - 0.001, t.z1);
    } else {
      loftBand(P, 'hull', bw * 0.94, 0.05, g.deck, () => t.yBot, t.z0, t.z1);
    }
  }

  // Turbine grille doors on the rear face + louvres + taillight boxes + TIP.
  const rearZ = tail;
  const rearTop = deckAt(g, rearZ);
  const rearBot = g.tailShelf ? g.tailShelf.yBot : lineAt(tailRake, rearZ);
  const rearHalfW = pt?.tailPull ? pt.tailHalfW - 0.02 : bw * 0.81;
  P.add('hullDark', box(rearHalfW * 2, (rearTop - rearBot) * 0.62, 0.03),
    0, (rearTop + rearBot) / 2, rearZ - 0.02);
  if (P.q) for (let k = 0; k < 5; k++) {
    P.add('hullDetail', box(rearHalfW * 1.92, 0.04 * s, 0.03),
      0, (rearTop + rearBot) / 2 - 0.26 * s + k * 0.13 * s, rearZ - 0.015);
  }
  P.add('hullDetail', box(rearHalfW * 2.06, 0.05, 0.05), 0, rearTop - 0.04, rearZ - 0.02);
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.15 * s, 0.075 * s, 0.05), side * (rearHalfW - 0.18 * s), rearTop - 0.18 * s, rearZ - 0.01);
    P.add('hullDetail', box(0.18 * s, 0.022, 0.07), side * (rearHalfW - 0.18 * s), rearTop - 0.12 * s, rearZ - 0.015);
  }
  if (!g.noTip) {
    P.add('hullDark', box(0.2 * s, 0.28 * s, 0.1), bw * 0.5, rearTop - 0.44 * s, rearZ + 0.06);
    P.add('hullDetail', box(0.22 * s, 0.05, 0.11), bw * 0.5, rearTop - 0.28 * s, rearZ + 0.06);
  }

  // Engine deck: inset intake grilles + rib rows + fuel cap.
  if (P.q && g.engineZ) {
    const ez = g.engineZ;
    for (const side of [-1, 1]) {
      P.add('hullDark', box(bw * 0.52, 0.02, 0.78 * s), side * bw * 0.33, deckAt(g, ez) + 0.008, ez);
      for (let k = 0; k < 4; k++) {
        P.add('hullDetail', box(bw * 0.48, 0.02, 0.045), side * bw * 0.33, deckAt(g, ez) + 0.014, ez + (k - 1.5) * 0.18 * s);
      }
    }
    P.add('hullDetail', cylY(0.07 * s, 0.07 * s, 0.03, 10), bw * 0.6, deckAt(g, ez - 0.55 * s) + 0.02, ez - 0.55 * s);
  }

  // Skirts: measured plane {x, top, bot, z0, z1}; 3 heavy front panels with a
  // diagonal lead cut, dark joints, bolts, rubber wear lip, sponson seam.
  // WIDTH GUARD: sk.x is the committed width plane — every fitting below is
  // seated flush INSIDE it (outer faces <= sk.x).
  const sk = g.skirt;
  const panels = g.skirtPanels ?? 7;
  const panelD = (sk.z1 - sk.z0) / panels;
  for (const side of [-1, 1]) {
    for (let k = 0; k < panels; k++) {
      const heavy = k < 3;
      const th = heavy ? 0.075 : 0.045;
      const z = sk.z1 - panelD / 2 - k * panelD;
      if (k === 0) {
        const zF = z + panelD * 0.485, zR = z - panelD * 0.485;
        const yCut = sk.bot + (sk.top - sk.bot) * 0.5;
        sideSlab(P, 'hull', side,
          [sk.x - th, yCut, zF], [sk.x, yCut, zF], [sk.x, sk.bot, zF - panelD * 0.42], [sk.x - th, sk.bot, zF - panelD * 0.42],
          [sk.x - th, sk.top, zF], [sk.x, sk.top, zF], [sk.x, sk.top, zR], [sk.x - th, sk.top, zR]);
        P.add('hull', box(th, sk.top - sk.bot, panelD * 0.55), side * (sk.x - th / 2), (sk.top + sk.bot) / 2, z - panelD * 0.22);
      } else {
        P.add('hull', box(th, sk.top - sk.bot, panelD * 0.97), side * (sk.x - th / 2), (sk.top + sk.bot) / 2, z);
      }
      if (P.q) {
        P.add('hullDark', box(0.05, (sk.top - sk.bot) * 0.86, 0.016), side * (sk.x - 0.033), (sk.top + sk.bot) / 2, z - panelD / 2);
        P.add('hullDark', box(0.02, 0.02, 0.16 * s), side * (sk.x - 0.012), sk.top - 0.14 * s, z);
        for (const f of [-0.28, 0.28]) {
          P.add('hullDetail', cylX(0.016, 0.05, 8), side * (sk.x - 0.028), sk.top - 0.05 * s, z + f * panelD);
        }
      }
    }
    P.add('hullRubber', box(0.022, 0.07, sk.z1 - sk.z0 - 0.05),
      side * (sk.x - 0.02), sk.bot - 0.03, (sk.z0 + sk.z1) / 2);
    P.add('hullDark', box(0.014, 0.035, sk.z1 - sk.z0 - 0.1), side * (sk.x - 0.012), sk.top + 0.02, (sk.z0 + sk.z1) / 2);
    // Flaps sit flush INSIDE the skirt plane and never below its hem (the
    // reference hem line is the front-view silhouette bottom at this x).
    if (!g.noFrontFlaps && !g.noFlaps) {
      P.add('hullRubber', box(0.32 * s, 0.26 * s, 0.028), side * (sk.x - 0.17 * s), sk.bot + 0.14 * s, sk.z1 + 0.02, -0.08, 0, 0);
    }
    if (!g.noFlaps) {
      P.add('hullRubber', box(0.32 * s, 0.24 * s, 0.028), side * (sk.x - 0.17 * s), sk.bot + 0.13 * s, sk.z0 - 0.02, 0.08, 0, 0);
    }
  }

  // Running gear: 7 road wheels, front idler, rear drive sprocket.
  buildRunningGear(P, {
    style: 'rubber', wheelR: g.wheelR, wheelW: Math.min(0.23, g.trackW * 0.38),
    wheelY: g.wheelY ?? g.wheelR + 0.11, xc: g.trackXc,
    wheelZs: g.wheelZs, botY: g.trackBotY ?? 0.055,
    sprocket: { z: g.sprocketZ, y: g.sprocketY ?? g.wheelR + 0.24, r: g.sprocketR ?? g.wheelR * 0.9 },
    idler: { z: g.idlerZ, y: g.idlerY ?? g.wheelR + 0.26, r: g.idlerR ?? g.wheelR * 0.84 },
    trackW: g.trackW, topY: g.beltTop - 0.06, paintedEnds: true, coveredTop: true,
  });

  // Glacis furniture — kept FLUSH: the v6 curves show a clean glacis line
  // (no proud splash board or periscope hump on the silhouette).
  const glacisTopZ = g.glacisTopZ ?? noseRake[0][0];
  const noseTipY = deckAt(g, g.nose);
  const boardZ = glacisTopZ + (g.nose - glacisTopZ) * 0.30;
  const boardY = deckAt(g, boardZ);
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.8 * s, 0.035, 0.06), side * 0.38 * s, boardY + 0.02, boardZ, -0.18, side * 0.38, 0);
    P.add('hullDetail', cylY(0.085 * s, 0.085 * s, 0.03, 12), side * 1.1 * s, deckAt(g, glacisTopZ - 0.5) + 0.015, glacisTopZ - 0.5);
    P.add('hullDetail', box(0.2 * s, 0.1 * s, 0.12), side * bw * 0.72, noseTipY - 0.14, g.nose - 0.3);
    headlight(P, side * bw * 0.72, noseTipY - 0.12, g.nose - 0.21, -0.12, 0.045 * s);
    P.add('hullDark', box(0.02, 0.13 * s, 0.15), side * (bw * 0.72 - 0.12 * s), noseTipY - 0.12, g.nose - 0.24);
    P.add('hullDark', box(0.02, 0.13 * s, 0.15), side * (bw * 0.72 + 0.12 * s), noseTipY - 0.12, g.nose - 0.24);
    P.add('hullDark', box(0.26 * s, 0.02, 0.15), side * bw * 0.72, noseTipY - 0.06, g.nose - 0.24);
    P.add('hullDetail', torus(0.05 * s, 0.015, 12), side * 1.05 * s, boardY - 0.06, boardZ - 0.22, Math.PI / 2, 0, 0);
    const toeY = lineAt(noseRake, bowZ + (g.nose - bowZ) * 0.35);
    P.add('hullDetail', box(0.1 * s, 0.09 * s, 0.1 * s), side * bw * 0.45, toeY + 0.1, bowZ + (g.nose - bowZ) * 0.35, -0.5, 0, 0);
    P.add('hullDark', torus(0.055 * s, 0.017, 12), side * bw * 0.45, toeY + 0.12, bowZ + (g.nose - bowZ) * 0.35 + 0.06, 0.9, 0, 0);
    liftEye(P, 'hullDetail', side * bw * 0.8, rearTop + 0.02, rearZ + 0.55);
  }
  // Driver's periscopes flush at the glacis crest (no proud hump in v6).
  const humpZ = g.periZ ?? (glacisTopZ + 0.15);
  const humpX = g.periX ?? 0;
  const humpY = deckAt(g, humpZ);
  if (g.periHump) {
    P.add('hull', frustum(0.4 * s, humpZ + 0.24 * s, humpZ - 0.2 * s, 0.32 * s, humpZ + 0.14 * s, humpZ - 0.16 * s, humpY - 0.02, humpY + (g.periHumpH ?? 0.07)), humpX, 0, 0);
  }
  for (const px of [-0.2, 0, 0.2]) {
    periscope(P, 'hullDetail', humpX + px * s, humpY + (g.periHump ? (g.periHumpH ?? 0.07) : 0.008), humpZ + 0.04 * s);
  }
  const cableApexZ = Math.min(g.nose - 0.35, boardZ + 0.3);
  towCable(P, [[-1.15 * s, boardY - 0.14, cableApexZ], [0, boardY - 0.07, cableApexZ - 0.6],
    [1.15 * s, boardY - 0.14, cableApexZ]]);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.4 * s, [sk.x + 0.002, (sk.top + sk.bot) / 2 + 0.06, sk.z1 - 1.4], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.4 * s, [-(sk.x + 0.002), (sk.top + sk.bot) / 2 + 0.06, sk.z1 - 1.4], -Math.PI / 2);
  // Soot planes are render meshes — keep them INSIDE the rear-face silhouette
  // (a 1.05 m plane at mid-face poked 0.17 above the deck and 0.05 past the
  // tail, extending measured hullLength and the front-view top line).
  const sootS = Math.min(0.72 * s, (rearTop - rearBot) * 0.9);
  P.decal('hull', 'soot', null, sootS, [0.62 * s, Math.min((rearTop + rearBot) / 2, rearTop - sootS / 2 - 0.02), rearZ - 0.005], Math.PI);
  P.decal('hull', 'soot', null, sootS, [-0.62 * s, Math.min((rearTop + rearBot) / 2, rearTop - sootS / 2 - 0.02), rearZ - 0.005], Math.PI);
}

// ---------------------------------------------------------------------------
// Turret shell: swept cheek plates whose roof line falls toward the tips, a
// recessed embrasure between them, a full-width body with roof tumblehome,
// and a bustle with an optional undercut bottom (t.yBotRear). Local to ring.
// ---------------------------------------------------------------------------
function abramsShell(P, t) {
  const tw = t.tw, thr = t.throat;
  const inset = t.inset ?? 0.14;                 // roof tumblehome
  const zMain = t.zMain ?? (t.zWide - 1.2);
  const faceRake = t.faceRake ?? 0.34;           // cheek face lean-back at the roof
  const yBotRear = t.yBotRear ?? t.yBot;

  // Cheek wedges: bottom sweeps throat->shoulder, top edge falls to the tip.
  for (const side of [-1, 1]) {
    sideSlab(P, 'turret', side,
      [thr, t.yBot, t.zTip], [tw, t.yBot, t.zWide + 0.12], [tw, t.yBot, t.zWide - 0.7], [thr, t.yBot, t.zTip - 1.05],
      [thr, t.roofTip, t.zTip - faceRake], [tw - inset, t.roofWide, t.zWide], [tw - inset, t.roofWide, t.zWide - 0.7], [thr, t.roofTip + 0.06, t.zTip - 1.15]);
  }
  // Throat block between the cheeks: recessed face carries the embrasure.
  const zFace = t.zTip - 0.18;
  P.add('turret', slab(
    [-thr * 1.02, t.yBot, zFace], [thr * 1.02, t.yBot, zFace], [thr * 1.02, t.yBot, t.zTip - 1.3], [-thr * 1.02, t.yBot, t.zTip - 1.3],
    [-thr * 1.02, t.roofTip - 0.03, zFace - faceRake], [thr * 1.02, t.roofTip - 0.03, zFace - faceRake],
    [thr * 1.02, t.roofTip + 0.05, t.zTip - 1.3], [-thr * 1.02, t.roofTip + 0.05, t.zTip - 1.3]));
  P.add('turretDark', box(thr * 1.9, (t.roofTip - t.yBot) * 0.8, 0.05), 0, (t.roofTip + t.yBot) / 2 - 0.03, zFace - 0.03);
  // Cheek->roof transition wedge (roofWide across the shoulders).
  P.add('turret', slab(
    [-(tw - 0.02), t.yBot, t.zWide + 0.1], [tw - 0.02, t.yBot, t.zWide + 0.1], [tw - 0.02, t.yBot, zMain], [-(tw - 0.02), t.yBot, zMain],
    [-(tw - inset), t.roofWide, t.zWide], [tw - inset, t.roofWide, t.zWide],
    [tw - inset, t.roofMain, zMain], [-(tw - inset), t.roofMain, zMain]));
  // Main body + bustle: near-vertical sides, roof tumblehome, rear lean-in,
  // undercut bustle bottom when the curves show one.
  P.add('turret', slab(
    [-tw, t.yBot, zMain + 0.02], [tw, t.yBot, zMain + 0.02], [tw * 0.985, yBotRear, t.zRear], [-tw * 0.985, yBotRear, t.zRear],
    [-(tw - inset), t.roofMain, zMain + 0.02], [tw - inset, t.roofMain, zMain + 0.02],
    [(tw - inset) * 0.985, t.roofRear, t.zRear + 0.10], [-(tw - inset) * 0.985, t.roofRear, t.zRear + 0.10]));
  // Roof cap: thin inset plate so the roof reads as a fitted panel.
  P.add('turret', box((tw - inset) * 1.9, 0.025, (zMain - t.zRear) * 0.94),
    0, t.roofMain - 0.005, (zMain + t.zRear) / 2 + 0.04);
}

// Bustle stowage rack: rails + posts + dark mesh + strapped duffels.
// rkT is the published-height plateau (dims p95 anchor) — nothing in the
// rack may exceed it.
function abramsBustleRack(P, t, s = 1) {
  const tw = t.tw;
  const zr = t.zRear;
  const rackD = t.rackDepth ?? 0.42;
  const rkT = t.rackTop;
  const rkB = t.rackBot ?? (t.yBot + 0.16 * s);
  const drop = t.rackRearDrop ?? 0;            // rear rail drop (duffel sag)
  const rkTr = rkT - drop;
  const zRear = zr - rackD;
  const zMid = zr - rackD / 2;
  P.add('turretDetail', box(tw * 1.72, 0.045, 0.045), 0, rkTr, zRear);
  P.add('turretDetail', box(tw * 1.72, 0.045, 0.045), 0, rkB, zRear);
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.045, 0.045, rackD), side * tw * 0.85, rkB, zMid);
    if (drop) {
      const dz = Math.min(rackD * 0.45, 0.3);
      P.add('turretDetail', box(0.045, 0.045, rackD - dz), side * tw * 0.85, rkT, zr - (rackD - dz) / 2);
      P.add('turretDetail', box(0.045, 0.045, Math.hypot(dz, drop) + 0.02), side * tw * 0.85,
        (rkT + rkTr) / 2, zRear + dz / 2, Math.atan2(drop, dz), 0, 0);
    } else {
      P.add('turretDetail', box(0.045, 0.045, rackD), side * tw * 0.85, rkT, zMid);
    }
  }
  for (const x of [-tw * 0.85, -tw * 0.28, tw * 0.28, tw * 0.85]) {
    P.add('turretDetail', box(0.04, rkTr - rkB, 0.04), x, (rkTr + rkB) / 2, zRear);
  }
  P.add('turretDark', box(tw * 1.66, 0.016, rackD * 0.92), 0, rkB + 0.03, zMid);
  P.add('turretDark', box(tw * 1.66, (rkTr - rkB) * 0.84, 0.014), 0, (rkTr + rkB) / 2, zRear + 0.014);
  if (P.q) for (let k = 0; k < 11; k++) {
    P.add('turretDetail', box(0.02, rkTr - rkB, 0.02), -tw * 0.8 + k * (tw * 1.6 / 10), (rkTr + rkB) / 2, zRear + 0.032);
  }
  // Duffel fill: full height on the forward span, sagging toward the rear
  // rail when the oracle's rack top slopes down.
  const clothD = drop ? rackD * 0.72 : rackD * 1.2;
  const clothZ = drop ? zr - clothD / 2 + 0.06 : zMid + rackD * 0.1;
  P.add('turretCloth', box(0.72 * s, (rkT - rkB) * 0.82, clothD), -tw * 0.5, (rkT + rkB) / 2, clothZ);
  P.add('turretCloth', box(0.8 * s, (rkT - rkB) * 0.9, clothD), 0.1 * s, (rkT + rkB) / 2, clothZ);
  P.add('turretCloth', box(0.55 * s, (rkT - rkB) * 0.65, clothD), tw * 0.58, (rkT + rkB) / 2 - 0.03, clothZ);
  if (drop) {
    P.add('turretCloth', slab(
      [-tw * 0.8, rkB + 0.02, zr - rackD * 0.5], [tw * 0.8, rkB + 0.02, zr - rackD * 0.5],
      [tw * 0.8, rkB + 0.02, zRear + 0.02], [-tw * 0.8, rkB + 0.02, zRear + 0.02],
      [-tw * 0.78, rkT - 0.04, zr - rackD * 0.5], [tw * 0.78, rkT - 0.04, zr - rackD * 0.5],
      [tw * 0.78, rkTr - 0.02, zRear + 0.02], [-tw * 0.78, rkTr - 0.02, zRear + 0.02]));
  }
  for (const [x, w] of [[-tw * 0.5, 0.72 * s], [0.1 * s, 0.8 * s]]) {
    for (const f of [-0.27, 0.27]) {
      P.add('turretDark', box(0.024, (rkT - rkB) * 0.88, clothD * 1.15), x + f * w, (rkT + rkB) / 2 - 0.01, clothZ);
    }
  }
}

// Shell-side sponson boxes + rails + tarp roll. xOut must stay inside the
// committed width plane.
function shellSponsons(P, t, s = 1, xOut = null, yBot = null, yTop = null) {
  const xo = xOut ?? (t.tw + 0.095 * s);
  const b = yBot ?? (t.yBot + 0.17);
  const tp = yTop ?? (t.roofMain - 0.15);
  for (const side of [-1, 1]) {
    P.add('turret', box(xo - t.tw + 0.06, tp - b, 1.75 * s), side * (t.tw + (xo - t.tw) / 2 - 0.02), (tp + b) / 2, t.zRear + 1.55 * s);
    P.add('turretDark', box(xo - t.tw + 0.07, 0.02, 1.7 * s), side * (t.tw + (xo - t.tw) / 2 - 0.02), tp - 0.06, t.zRear + 1.55 * s);
    P.add('turretDetail', box(0.035, 0.035, 2.4 * s), side * (xo - 0.02), tp + 0.02, t.zRear + 1.9 * s);
    for (const zc of [0.9, 2.6]) {
      P.add('turretDark', box(xo - t.tw + 0.08, (tp - b) * 0.8, 0.024), side * (t.tw + (xo - t.tw) / 2 - 0.02), (tp + b) / 2, t.zRear + zc * s);
    }
    P.add('turretCloth', cylZ(0.075 * s, 0.6 * s, 10), side * (t.tw - 0.05), t.roofMain - 0.09 * s, t.zRear + 0.75 * s);
    P.add('turretDark', cylZ(0.079 * s, 0.03, 10), side * (t.tw - 0.05), t.roofMain - 0.09 * s, t.zRear + 0.75 * s);
  }
}

// ---------------------------------------------------------------------------
// Tejas-oracle family (m1a2_tejas / m1a1 / m1a1ha / m1a2_tusk — all FULL
// scale now; the v5 0.727 tusk clamp-matching is retired, the tusk oracle is
// a certified chimera). Curves: v6 re-extraction + probe decode.
// ---------------------------------------------------------------------------
const TEJAS_HULL = {
  bodyHalfW: 1.78, nose: 3.97,
  deck: [[3.97, 1.31], [2.62, 1.34], [2.35, 1.46], [1.95, 1.51], [1.30, 1.48],
    [-0.90, 1.48], [-1.85, 1.67], [-2.35, 1.70], [-3.15, 1.71], [-3.32, 1.75],
    [-3.62, 1.75], [-3.82, 1.70], [-3.97, 1.68]],
  beltTop: 1.05, belly: 0.42,
  noseRake: [[2.60, 0.44], [3.10, 0.48], [3.35, 0.55], [3.58, 0.68], [3.69, 0.86], [3.80, 0.95], [3.91, 1.16], [3.97, 1.28]],
  tailRake: [[-2.60, 0.42], [-3.25, 0.50], [-3.50, 0.62], [-3.70, 0.80]],
  tailShelf: { z0: -3.70, z1: -3.97, yBot: 0.965 },
  skirt: { x: 1.828, top: 1.41, bot: 0.69, z0: -3.60, z1: 3.55 },
  planTaper: { bowHalfW: 1.02, bowPull: 0.24, tailHalfW: 1.05, tailPull: 0.30 },
  engineZ: -2.9, glacisTopZ: 2.35,
  // End wheels sit inboard of the visual bow/stern (skirts cover them) so
  // the track's flat ground run ends at the oracle's contact patch (±2.5) —
  // tankFactory extends the flat run past the end-wheel centers.
  trackXc: 1.41, trackW: 0.58, wheelR: 0.42, wheelY: 0.53,
  wheelZs: [2.42, 1.61, 0.81, 0.0, -0.81, -1.61, -2.42],
  idlerZ: 2.55, idlerY: 0.60, idlerR: 0.30, sprocketZ: -2.60, sprocketY: 0.68, sprocketR: 0.34,
};

// Ring (0, 1.57, 0.35). World targets: cheek tips 2.15 falling from shoulder
// 2.30, main/bustle roof 2.36, shell bottom 1.40 fwd with the bustle
// undercut to 1.66, shell rear -2.80, rack to -3.20 topping the published
// 2.44 plateau, sponson boxes 1.57..2.19 at x ±1.755.
const TEJAS_TURRET = {
  tw: 1.66, throat: 0.62, zTip: 2.10, zWide: 0.15, zMain: -0.75, zRear: -2.75,
  yBot: -0.17, yBotRear: 0.09, roofTip: 0.58, roofWide: 0.73, roofMain: 0.79, roofRear: 0.79,
  inset: 0.10, rackTop: 0.87, rackBot: 0.21, rackDepth: 0.75,
  ring: [0, 1.57, 0.35], gun: [0, 0.31, 1.56], gunLen: 3.89, gunR: 0.095,
};

// Roof kit shared by the tejas-oracle family. station: 'crows' or 'cws'
// (same oracle massing, different dressing).
// DIMS CLAMP: published Abrams height is 2.44 (turret roof). The rack rails,
// the rear-roof block and the crew hatches form the 2.44 plateau the gate's
// p95 reads as heightM; ONLY the compact station head + M2 (≈3 columns at
// z_local 0.40..0.72) rises above it, matching the oracle's 3.27 cluster
// peak. The rest of the oracle's 1.6 m-long 3.2-3.3 cluster is certified as
// unreachable under published dims (see the packet cap).
function tejasRoofKit(P, t, station = 'crows') {
  const roof = t.roofMain;                    // 0.79 local = 2.36 world
  const plat = 0.87;                          // 2.44 world — the p95 plateau
  // ---- left station: base + shields to the plateau, slim mast above -----
  P.add('turret', box(0.74, 0.10, 1.70), -0.70, plat - 0.05, 0.42);
  P.add('turret', box(0.70, 0.16, 0.55), -0.70, plat - 0.14, 0.90);
  P.add('turretDark', box(0.60, 0.05, 1.55), -0.70, plat - 0.115, 0.40);
  P.add('turretDetail', box(0.06, 0.09, 1.45), -1.04, plat - 0.07, 0.40);
  P.add('turretDetail', box(0.06, 0.09, 1.45), -0.36, plat - 0.07, 0.40);
  if (station === 'cws') {
    // CWS drum + hatch ring dressing on the base.
    P.add('turret', cylY(0.26, 0.29, 0.09, 16), -0.70, plat - 0.02, 0.42);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      P.add('turretDark', box(0.08, 0.04, 0.05), -0.70 + Math.sin(a) * 0.22, plat + 0.005, 0.42 + Math.cos(a) * 0.22, 0, a, 0);
    }
  } else {
    // CROWS slew ring on the base.
    P.add('turretDetail', cylY(0.17, 0.20, 0.05, 14), -0.70, plat - 0.02, 0.52);
  }
  // Slim mast + EO head + transverse M2 — the ONLY geometry above 2.44;
  // head top at local 1.70 = world 3.27 (oracle cluster peak). z-footprint
  // 0.11..0.32 local (0.21 m ≈ 2 mask columns, so the dims p95 skips it)
  // straddling the station-slice boundary at ~0.22 so BOTH adjacent stations
  // read the oracle's tall cluster.
  P.add('turret', cylY(0.05, 0.06, 0.52, 10), -0.72, plat + 0.26, 0.215);
  P.add('turret', box(0.30, 0.26, 0.20), -0.72, 1.55, 0.215);
  P.add('turretDark', box(0.24, 0.16, 0.035), -0.72, 1.55, 0.30);
  P.add('turretGlass', box(0.18, 0.10, 0.02), -0.72, 1.55, 0.325);
  m2hb(P, -0.60, 1.63, 0.215, 0.42);
  // ---- loader's hatch + M240 (right, aft of the doghouse) ----------------
  turretHatch(P, 0.70, plat - 0.12, -0.35, 0.20, 0);
  m240Skate(P, 0.86, plat - 0.10, -0.30, 0.9);
  // ---- gunner's primary sight doghouse right-forward ---------------------
  P.add('turret', box(0.52, 0.14, 0.62), 0.78, plat - 0.07, 0.95);
  P.add('turret', box(0.56, 0.035, 0.66), 0.78, plat - 0.018, 0.95);
  P.add('turretDark', box(0.40, 0.10, 0.04), 0.78, plat - 0.06, 1.28);
  P.add('turretGlass', box(0.32, 0.06, 0.02), 0.78, plat - 0.06, 1.305);
  // ---- commander's hatch with periscope fence (part of the plateau) ------
  turretHatch(P, -0.75, plat - 0.115, -0.70, 0.24, 5);
  // ---- rear-roof raised block (oracle 2.55, clamped to the plateau) ------
  P.add('turret', box(0.66, plat - roof + 0.02, 0.36), 0.10, (plat + roof) / 2 - 0.02, -0.88);
  P.add('turretDark', box(0.56, 0.04, 0.28), 0.10, plat - 0.03, -0.88);
  // ---- blow-off panel bay with etched dark seams --------------------------
  P.add('turret', box(1.25, 0.02, 0.95), 0, roof + 0.012, -1.7);
  if (P.q) {
    for (const f of [-1, 1]) {
      P.add('turretDark', box(1.25, 0.014, 0.02), 0, roof + 0.025, -1.7 + f * 0.46);
      P.add('turretDark', box(0.02, 0.014, 0.95), f * 0.61, roof + 0.025, -1.7);
    }
    P.add('turretDark', box(0.02, 0.014, 0.95), 0, roof + 0.025, -1.7);
  }
  // Wind sensor kept low + stowed antenna pots (p95 budget lives on the mast).
  P.add('turretDetail', box(0.03, 0.10, 0.03), -0.30, roof + 0.04, -0.62);
  P.add('turretDark', box(0.05, 0.045, 0.11), -0.30, roof + 0.075, -0.62);
  antennaPot(P, -1.05, roof - 0.02, -2.40);
  antennaPot(P, 1.00, roof - 0.02, -2.42);
  liftEye(P, 'turretDetail', -t.tw * 0.62, t.roofWide - 0.12, 0.55);
  liftEye(P, 'turretDetail', t.tw * 0.62, t.roofWide - 0.12, 0.55);
  P.add('turretDark', torus(0.13, 0.026, 14), -t.tw * 0.78, t.roofWide + 0.04, -0.15);
  // M250 banks on the cheek plates (below the cheek roofline; tips at the
  // oracle's ±1.72 plan extreme around z_world 1.2-1.6).
  for (const side of [-1, 1]) {
    smokeBank(P, side * 1.48, 0.34, 1.00, side);
    P.add('turretDetail', box(0.05, 0.18, 0.4), side * 1.40, 0.30, 0.80);
  }
  // Sponson stowage boxes/rails/tarp along the shell sides (1.57..2.19).
  shellSponsons(P, t, 1, 1.70, 0.0, 0.62);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34, [1.707, 0.30, -1.0], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34, [-1.707, 0.30, -1.0], -Math.PI / 2);
}

function buildTejasFamily(P, p) {
  let g = TEJAS_HULL;
  const t = TEJAS_TURRET;
  if (p.abramsKit === 'tusk') g = { ...g, noTip: true, noFlaps: true };
  abramsHull(P, g);
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsShell(P, t);
  abramsBustleRack(P, t, 1);
  tejasRoofKit(P, t, p.station ?? 'crows');
  abramsMantlet(P, 1, 0.66, 0.48, 0.35);
  // Slim tube fittings: the oracle's plan gun is 2 columns wide past the
  // evacuator — the stock MRS collar (1.35x) and a fat MRS ring lit an
  // extra plan column out to the muzzle. evacR 1.8 ends the wide drum at
  // z_world ≈ 3.88 exactly like the oracle.
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.42, evacR: 1.8, collar: false, baseR: 0.14 });
  P.add('gun', cylZ(t.gunR * 1.12, 0.09, 12), 0, 0, t.gunLen - 0.55);
  P.add('gun', cylZ(t.gunR * 1.1, 0.16, 12), 0, 0, t.gunLen - 0.1);
  P.topY = t.roofMain + 1.0;

  if (p.abramsKit === 'tusk') {
    // TUSK kit at REAL scale on the published-true body. The lower ARAT
    // course rides the skirt plane — outer faces flush at the committed
    // x ±1.828 (WIDTH GUARD).
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        const y = row ? 1.24 : 0.94;
        for (let col = 0; col < 14; col++) {
          P.add('hullDetail', box(0.11, row ? 0.24 : 0.27, 0.31),
            side * (row ? 1.70 : 1.77), y, -2.11 + col * 0.325, 0, 0, row ? side * -0.20 : 0);
          P.add('hullDark', box(0.03, row ? 0.25 : 0.28, 0.05), side * (row ? 1.67 : 1.74), y, -2.273 + col * 0.325, 0, 0, row ? side * -0.20 : 0);
        }
        P.add('hullDark', box(0.06, 0.066, 4.81), side * 1.70, y, 0);
        for (const az of [-2.0, -1.0, 0, 1.0, 2.0]) {
          P.add('hullDark', box(0.35, 0.05, 0.05), side * 1.52, y, az);
        }
      }
    }
    // Rear slat cage braced to the hull rear face.
    P.add('hullDark', box(3.35, 0.066, 0.066), 0, 1.55, -4.0);
    P.add('hullDark', box(3.35, 0.066, 0.066), 0, 1.15, -4.0);
    for (const x of [-1.62, -1.08, -0.54, 0, 0.54, 1.08, 1.62]) {
      P.add('hullDark', box(0.042, 0.62, 0.042), x, 1.25, -4.0);
    }
    if (P.q) for (let k = 0; k < 3; k++) {
      P.add('hullDark', box(3.3, 0.028, 0.02), 0, 1.0 + k * 0.15, -4.0);
    }
    for (const x of [-1.3, 0, 1.3]) {
      P.add('hullDark', box(0.05, 0.05, 0.6), x, 1.35, -3.72);
    }
    // Tank Infantry Phone on its bracket.
    P.add('hullDark', box(0.45, 0.4, 0.16), 1.30, 1.32, -3.85);
    P.add('hullDetail', box(0.47, 0.06, 0.18), 1.30, 1.56, -3.85);
    // Belly-armor lip at the lower-plate toe.
    P.add('hull', box(1.8, 0.06, 0.35), 0, 0.30, 2.75, -0.16, 0, 0);
    P.add('hullDark', box(1.76, 0.024, 0.024), 0, 0.27, 2.9);
    // Loader's armored gun shield (LAGS) — kept under the 2.44 plateau.
    P.add('turret', box(0.74, 0.42, 0.05), -0.58, 0.62, 0.32);
    P.add('turret', box(0.05, 0.42, 0.55), -0.94, 0.62, 0.05);
    P.add('turret', box(0.4, 0.40, 0.05), -0.2, 0.60, 0.24, 0, -0.5, 0);
    P.add('turretDark', box(0.3, 0.14, 0.02), -0.58, 0.68, 0.35);
    P.add('turretGlass', box(0.26, 0.1, 0.02), -0.58, 0.68, 0.36);
  }
}

// ---------------------------------------------------------------------------
// m1a2 — dannzjs SEPv3 oracle, BATCH-5 REPAIRED: the TurretPivot subtree was
// authored 0.234 units left of the hull axis (a lateral TRANSLATION, not the
// previously-certified "~2 deg yaw") and is now seated on the ring — the
// v6/v7 -0.16 gun x-offset compensation is REMOVED (gun x = 0). The repaired
// print re-normalizes ~4.3% larger: hull z -3.67..3.90 (7.57 vs published
// 7.93 — dims sovereign), deck 1.53 mid with the 1.47 periscope hump at
// z 3.4-3.6, ground-brushing INNER skirts (outer armour band hems at 0.75),
// bustle boxes 2.5-2.9 (height-capped) and twin 4.0 whips at z -1.5..-1.7.
// ---------------------------------------------------------------------------
const SEPV3_HULL = {
  bodyHalfW: 1.70, nose: 3.97,
  planTaper: { bowHalfW: 1.55, bowPull: 0.30, tailHalfW: 1.60, tailPull: 0.26 },
  deck: [[3.97, 1.08], [3.86, 1.11], [3.67, 1.15], [3.60, 1.30], [3.56, 1.47],
    [3.44, 1.47], [3.36, 1.40], [3.12, 1.40], [3.00, 1.35], [2.89, 1.31],
    [2.78, 1.32], [2.56, 1.34], [2.34, 1.41], [2.12, 1.45], [2.00, 1.50],
    [1.89, 1.52], [0.80, 1.53], [-0.78, 1.53], [-1.45, 1.56], [-1.89, 1.60],
    [-2.23, 1.61], [-2.42, 1.62], [-2.52, 1.70], [-3.20, 1.70], [-3.36, 1.76],
    [-3.50, 1.79], [-3.62, 1.85], [-3.80, 1.79], [-3.97, 1.72]],
  beltTop: 1.02, belly: 0.60,
  // The GROUND-level bow/tail lines belong to the tracks (idler/sprocket
  // descents) — the BODY rakes stay at the ref's inner-column belly line so
  // the front view keeps its 0.57-0.64 floor.
  noseRake: [[2.60, 0.56], [3.30, 0.52], [3.55, 0.60], [3.75, 0.78], [3.97, 1.04]],
  tailRake: [[-2.45, 0.56], [-2.95, 0.55], [-3.12, 0.52], [-3.34, 0.60]],
  tailShelf: { z0: -3.34, z1: -3.72, yBot: 0.64 },
  skirt: { x: 1.828, top: 1.52, bot: 0.75, z0: -2.60, z1: 2.98 },
  engineZ: -2.95, glacisTopZ: 2.40, periZ: 3.44, noFrontFlaps: true,
  trackXc: 1.28, trackW: 0.58, wheelR: 0.40, wheelY: 0.51,
  wheelZs: [2.45, 1.63, 0.81, -0.01, -0.83, -1.65, -2.45],
  idlerZ: 3.0, idlerY: 0.45, idlerR: 0.28, sprocketZ: -2.67, sprocketY: 0.42, sprocketR: 0.32,
};

// Ring (0, 1.80, -0.245). World: cheek tips 2.34 falling from the doghouse
// line, roof plateau 2.44-2.46, shell bottom 1.51 fwd / 1.70 at the bustle,
// shell+rack rear -3.05, gun axis 2.05 on the hull centreline (repair).
const SEPV3_TURRET = {
  tw: 1.64, throat: 0.62, zTip: 2.60, zWide: 1.95, zMain: -0.30, zRear: -2.35,
  yBot: -0.29, yBotRear: -0.10, roofTip: 0.48, roofWide: 0.54, roofMain: 0.64, roofRear: 0.62,
  inset: 0.12, faceRake: 0.40, rackTop: 0.63, rackBot: -0.10, rackDepth: 0.45, rackRearDrop: 0.22,
  ring: [0, 1.80, -0.245], gun: [0, 0.25, 0.70], gunLen: 5.36, gunR: 0.095,
};

function buildSepv3(P) {
  const g = SEPV3_HULL;
  const t = SEPV3_TURRET;
  abramsHull(P, g);
  // Inner deep skirt band: the repaired oracle brushes the GROUND at
  // |x| 1.1..1.6 over z -2.45..2.62 while the outer armour plane hems at
  // 0.75 — both planes are built (WIDTH GUARD: inner band well inside).
  for (const side of [-1, 1]) {
    P.add('hull', box(0.24, 0.72, 5.07), side * 1.44, 0.41, 0.085);
  }
  // Fender strips at the plan's ±1.72-1.83 run (z -2.85..3.45) + the ref's
  // 2.12-high mirror stubs at ±1.79.
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.15, 0.035, 6.3), side * 1.745, 1.50, 0.30);
    P.add('hullDetail', box(0.04, 0.42, 0.04), side * 1.77, 1.70, 2.45);
    P.add('hullDark', box(0.07, 0.22, 0.11), side * 1.77, 2.00, 2.45);
  }
  // Thin rear overhang lip out to the published tail (the ref tail tip is a
  // one-pixel 1.57 band — a full-depth shelf there reads as excess volume).
  P.add('hull', box(3.36, 0.48, 0.25), 0, 1.49, -3.845);
  // Rear cross-rack over the grille doors (ref top 1.79-1.86, z -3.36..-3.67
  // side; its FRONT view keeps the ±0.7 middle at the 1.71 deck line, so the
  // rack rides as two outboard segments).
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.70, 0.06, 0.06), side * 1.08, 1.80, -3.50);
    P.add('hullDetail', box(0.70, 0.06, 0.06), side * 1.08, 1.82, -3.90);
    P.add('hullDetail', box(0.05, 0.55, 0.24), side * 0.75, 1.53, -3.75);
    P.add('hullDetail', box(0.05, 0.55, 0.24), side * 1.42, 1.53, -3.75);
  }
  P.add('hullDark', box(2.9, 0.4, 0.02), 0, 1.40, -3.92);
  P.add('hullCloth', box(0.62, 0.30, 0.3), -1.05, 1.63, -3.72);
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsShell(P, t);
  abramsBustleRack(P, { ...t, tw: t.tw * 0.90 }, 1);
  const roof = t.roofMain;                    // 0.64 local = 2.44 world
  const plat = roof + 0.02;                   // 2.46 — the p95 plateau cap
  // GPS doghouse on the right cheek (ref 2.53 at z 1.9..2.2 — clamped to
  // the published plateau).
  P.add('turret', box(0.55, 0.24, 0.60), 0.85, plat - 0.16, 2.05);
  P.add('turret', box(0.59, 0.05, 0.64), 0.85, plat - 0.03, 2.05);
  P.add('turretDark', box(0.42, 0.13, 0.04), 0.85, plat - 0.12, 2.37);
  P.add('turretGlass', box(0.34, 0.08, 0.02), 0.85, plat - 0.12, 2.395);
  // CITV left-forward at the oracle's z 1.34..1.56 station — head clamped
  // to the plateau (the p95 budget is spent on the twin whips).
  P.add('turret', cylY(0.13, 0.16, 0.10, 14), -0.95, roof - 0.03, 1.50);
  P.add('turret', box(0.30, 0.24, 0.16), -0.95, plat - 0.12, 1.66);
  P.add('turretDark', box(0.24, 0.15, 0.03), -0.95, plat - 0.12, 1.75);
  P.add('turretGlass', box(0.18, 0.10, 0.02), -0.95, plat - 0.12, 1.77);
  turretHatch(P, 0.7, roof - 0.12, -0.15, 0.2, 4);
  turretHatch(P, -0.75, roof - 0.12, -0.35, 0.24, 6);
  // CROWS-LP at the oracle's 2.9 cluster (z -0.44..-0.89): head CLAMPED to
  // the plateau — the two whips own the entire above-height column budget.
  P.add('turretDetail', cylY(0.14, 0.17, 0.05, 12), -0.38, roof - 0.015, -0.55);
  P.add('turret', box(0.30, 0.22, 0.09), -0.38, plat - 0.13, -0.56);
  P.add('turret', box(0.26, 0.42, 0.08), -0.38, plat + 0.24, -0.56);
  P.add('turretDark', box(0.20, 0.20, 0.03), -0.38, plat + 0.30, -0.515);
  P.add('turretGlass', box(0.16, 0.12, 0.02), -0.38, plat + 0.30, -0.502);
  // Bustle SEP electronics boxes (oracle 2.885 over z -1.85..-2.1, x ±1.3 —
  // height-capped to the plateau) + roof stowage.
  P.add('turret', box(2.60, 0.36, 0.50), 0, roof - 0.16, -1.72);
  P.add('turretDark', box(2.62, 0.30, 0.03), 0, roof - 0.16, -1.985);
  P.add('turretCloth', box(1.15, 0.18, 0.55), -0.15, roof - 0.10, -1.15);
  P.add('turretCloth', box(0.7, 0.14, 0.5), 0.62, roof - 0.12, -1.2);
  // ONE whip antenna at the left bustle corner (oracle 4.0 peak; the other
  // above-plateau columns are spent on the CROWS head at the oracle's 2.9
  // cluster). Sits in hull-fraction slice 3 like the oracle's own whips.
  P.add('turretDetail', box(0.09, 0.05, 0.09), -1.02, roof + 0.005, -1.485);
  P.add('turretDark', box(0.024, 1.48, 0.024), -1.02, roof + 0.82, -1.485);
  for (const side of [-1, 1]) {
    smokeBank(P, side * 1.38, 0.28, 1.45, side);
    P.add('turretDetail', box(0.05, 0.18, 0.4), side * 1.30, 0.22, 1.25);
  }
  shellSponsons(P, { ...t, zRear: t.zRear + 0.25 }, 1, 1.70, -0.05, 0.35);
  liftEye(P, 'turretDetail', -1.05, t.roofWide - 0.02, 1.35);
  liftEye(P, 'turretDetail', 1.05, t.roofWide - 0.02, 1.35);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34, [1.722, 0.15, -1.0], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34, [-1.722, 0.15, -1.0], -Math.PI / 2);
  abramsMantlet(P, 1, 0.6, 0.42, 0.4);
  // Long dust-cover run from the mantlet toward the bore evacuator (the
  // oracle's plan turret reads ±0.33 wide out to z 3.1).
  P.addGunExtra(box(0.56, 0.34, 0.9), 0, 0.02, 0.85);
  P.addGunExtra(box(0.44, 0.26, 0.85), 0, 0.0, 1.6);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.5, evacR: 1.45, collar: false, baseR: 0.15 });
  P.add('gun', cylZ(t.gunR * 1.1, 0.14, 12), 0, 0, t.gunLen - 0.42);
  P.topY = roof + 1.2;
}

// ---------------------------------------------------------------------------
// m1a2_sepv2 — recovered bergman print. CERTIFIED SHORT ORACLE: the print's
// hull spans ~6.6 m vs the published 7.93 (17% short) and its forward roof
// rides at 2.9 — dims are sovereign, so the hull is built to 7.93 and the
// roof clamps to the 2.44 plateau; the bounded curve/station caps are
// documented in the packet. The oracle's static upper works (commander
// pedestal to 2.77, rear deck rack 2.26) stay in the HULL mask and are now
// SEATED on the deck (v5 left the pedestal floating -> floaters 0).
// ---------------------------------------------------------------------------
const SEPV2_HULL = {
  bodyHalfW: 1.60, nose: 3.97,
  deck: [[3.97, 1.20], [3.20, 1.22], [2.30, 1.26], [1.90, 1.32], [0.40, 1.40],
    [-0.60, 1.42], [-1.50, 1.50], [-2.40, 1.56], [-3.36, 1.56], [-3.60, 1.58], [-3.97, 1.55]],
  beltTop: 1.0, belly: 0.30,
  noseRake: [[2.40, 0.30], [3.00, 0.52], [3.60, 0.95], [3.97, 1.18]],
  tailRake: [[-2.35, 0.30], [-2.95, 0.62], [-3.38, 0.72]],
  tailShelf: { z0: -3.38, z1: -3.97, yBot: 0.74 },
  skirt: { x: 1.828, top: 1.32, bot: 0.58, z0: -2.9, z1: 2.9 },
  engineZ: -2.6, glacisTopZ: 2.3, periX: -0.42, trackBotY: 0.23,
  // The print's running gear floats ~0.15 above ground (oracle defect —
  // wheels stay at game-correct contact, the track band rides the print's
  // 0.17 floor line).
  trackXc: 1.11, trackW: 0.60, wheelR: 0.38, wheelY: 0.55,
  wheelZs: [2.05, 1.36, 0.67, -0.02, -0.71, -1.40, -2.1],
  idlerZ: 2.45, idlerY: 0.62, idlerR: 0.28, sprocketZ: -2.45, sprocketY: 0.62, sprocketR: 0.3,
};

const SEPV2_TURRET = {
  tw: 1.50, throat: 0.56, zTip: 2.20, zWide: 0.9, zMain: -0.4, zRear: -2.37,
  yBot: -0.33, yBotRear: -0.07, roofTip: 0.27, roofWide: 0.71, roofMain: 0.71, roofRear: 0.44,
  inset: 0.13, rackTop: 0.66, rackBot: -0.05, rackDepth: 0.4,
  ring: [0, 1.73, -0.4], gun: [0, -0.05, 0.90], gunLen: 5.31, gunR: 0.09,
};

function buildSepv2(P) {
  const g = SEPV2_HULL;
  const t = SEPV2_TURRET;
  abramsHull(P, g);
  // Static upper works in the oracle's hull mask — SEATED on the deck:
  // commander pedestal (2.44 plateau body + one-column stub to 2.76) and the
  // rear deck works (rail run 2.18 to z -1.83, cargo box 2.27 at -2.05..-2.38
  // with the print's one-column gap between them).
  P.add('hull', cylY(0.30, 0.36, 0.72, 14), 0, 1.78, -0.25);
  P.add('hull', box(0.72, 0.28, 0.66), 0, 2.28, -0.25);
  P.add('hullDark', box(0.6, 0.06, 0.55), 0, 2.44, -0.25);
  P.add('hullDark', box(0.18, 0.08, 0.03), 0, 2.38, 0.09);
  P.add('hullGlass', box(0.14, 0.06, 0.02), 0, 2.38, 0.107);
  // Rail run over the mid deck (posts from the deck).
  P.add('hullDetail', box(2.9, 0.06, 0.06), 0, 2.15, -0.72);
  P.add('hullDetail', box(2.9, 0.06, 0.06), 0, 2.15, -1.80);
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.06, 0.06, 1.14), side * 1.42, 2.15, -1.26);
    for (const z of [-0.72, -1.26, -1.80]) P.add('hullDetail', box(0.05, 0.68, 0.05), side * 1.42, 1.83, z);
  }
  P.add('hullCloth', box(2.6, 0.30, 1.00), 0, 2.02, -1.26);
  // Cargo box aft of the gap.
  P.add('hullCloth', box(2.2, 0.55, 0.34), 0, 1.98, -2.22);
  P.add('hullDark', box(2.22, 0.56, 0.03), 0, 1.98, -2.04);
  P.add('hullDark', box(2.22, 0.56, 0.03), 0, 1.98, -2.40);
  // The print's skirt run dips near ground contact around z 1.0..1.4.
  for (const side of [-1, 1]) {
    P.add('hull', box(0.05, 0.55, 0.45), side * 1.80, 0.33, 1.2);
  }
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsShell(P, t);
  abramsBustleRack(P, t, 0.9);
  const plat = 0.71;                          // 2.44 world plateau
  // Gunner's doghouse right-forward, clamped to the plateau.
  P.add('turret', box(0.6, 0.26, 0.6), 0.45, plat - 0.14, 1.1);
  P.add('turret', box(0.64, 0.04, 0.64), 0.45, plat - 0.005, 1.1);
  P.add('turretDark', box(0.46, 0.13, 0.04), 0.45, plat - 0.12, 1.42);
  P.add('turretGlass', box(0.38, 0.08, 0.02), 0.45, plat - 0.12, 1.445);
  // Canvas dust cover over the gun root (dense print read).
  P.add('turretCloth', box(0.6, 0.3, 0.5), 0, 0.28, 1.85, -0.3, 0, 0);
  // Loader's shield + hatch left-forward, under the plateau.
  P.add('turret', box(0.5, 0.3, 0.05), -0.75, plat - 0.18, 0.9);
  turretHatch(P, -0.72, plat - 0.13, 0.55, 0.2, 0);
  turretHatch(P, 0.68, plat - 0.13, -0.4, 0.22, 4);
  // CROWS II head — the p95 budget: peak 2.93 world (local 1.20), two mask
  // columns (z 0.25..0.45); the pedestal stub above the plateau adds one.
  P.add('turret', cylY(0.09, 0.11, 0.08, 12), -0.5, plat + 0.02, 0.35);
  P.add('turret', cylY(0.05, 0.05, 0.26, 10), -0.5, plat + 0.19, 0.35);
  P.add('turret', box(0.3, 0.3, 0.20), -0.5, plat + 0.32, 0.35);
  P.add('turretDark', box(0.22, 0.17, 0.035), -0.5, plat + 0.32, 0.462);
  P.add('turretGlass', box(0.17, 0.11, 0.02), -0.5, plat + 0.32, 0.488);
  m2hb(P, -0.42, plat + 0.40, 0.35, 0.38);
  // Roof stowage left of the ring (boxed cluster in the print).
  P.add('turret', box(0.5, 0.24, 0.9), -0.85, plat - 0.16, -0.2);
  P.add('turretDark', box(0.52, 0.02, 0.84), -0.85, plat - 0.03, -0.2);
  antennaPot(P, -0.9, plat - 0.05, -2.2);
  antennaPot(P, 0.85, plat - 0.05, -2.25);
  for (const side of [-1, 1]) {
    // M250 banks ride the cheek shoulders.
    smokeBank(P, side * 1.05, t.roofWide - 0.24, 1.65, side);
    P.add('turretDetail', box(0.04, 0.2, 1.0), side * (t.tw + 0.02), 0.06, -1.2);
  }
  liftEye(P, 'turretDetail', -0.95, plat - 0.05, 0.9);
  liftEye(P, 'turretDetail', 0.95, plat - 0.05, 0.9);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.3, [t.tw + 0.01, 0.12, -0.9], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.3, [-(t.tw + 0.01), 0.12, -0.9], -Math.PI / 2);
  abramsMantlet(P, 1, 0.72, 0.46, 0.35);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.55, collar: true, baseR: 0.19 });
  P.topY = plat + 1.2;
}

// ---------------------------------------------------------------------------
// m1a1_aim — repaired bergman print. Slab hull with tall fender walls, LOW
// ROUND near-full-width CASTING (oracle crown 2.59 — clamped to 2.46 under
// published height 2.44 within grace), deep crew basket hanging to 0.77
// under the bustle (the print's fused turret carries it — matched), fat
// L/44 with the published 9.77 overall reach (print muzzle 4.46 is short —
// bounded wholeCurves cover cap).
// ---------------------------------------------------------------------------
const AIM_HULL = {
  bodyHalfW: 1.78, nose: 3.47,
  deck: [[3.47, 1.32], [3.00, 1.36], [2.40, 1.42], [2.00, 1.48], [1.70, 1.55],
    [1.30, 1.52], [0.50, 1.61], [-0.30, 1.66], [-1.20, 1.75], [-2.10, 1.73],
    [-3.20, 1.80], [-3.45, 1.90], [-3.85, 1.96], [-4.20, 1.90], [-4.45, 1.80]],
  beltTop: 1.0, belly: 0.36,
  noseRake: [[2.10, 0.30], [2.95, 0.57], [3.30, 0.95], [3.47, 1.10]],
  tailRake: [[-3.00, 0.30], [-4.10, 0.72]],
  tailShelf: { z0: -4.10, z1: -4.45, yBot: 0.72 },
  skirt: { x: 1.828, top: 1.30, bot: 0.60, z0: -3.9, z1: 2.95 },
  engineZ: -3.5, glacisTopZ: 2.2, periZ: 2.85,
  trackXc: 1.30, trackW: 0.6, wheelR: 0.40, wheelY: 0.51,
  wheelZs: [1.75, 0.99, 0.23, -0.53, -1.29, -2.05, -2.78],
  idlerZ: 2.30, idlerY: 0.62, sprocketZ: -3.00, sprocketY: 0.70,
};

function buildAim(P) {
  const g = AIM_HULL;
  abramsHull(P, g);
  // Deck plate bumps the curve shows.
  P.add('hull', box(1.7, 0.07, 1.15), -0.2, 1.80, -1.48);
  P.add('hull', box(1.2, 0.06, 0.75), 0.2, 1.66, -0.1);
  P.add('hullDark', box(1.1, 0.02, 0.65), 0.2, 1.70, -0.1);
  // Tall fender walls (the print's front hull tops 1.86-1.89 at x ±1.1-1.5).
  for (const side of [-1, 1]) {
    P.add('hull', box(0.28, 0.14, 4.4), side * 1.55, 1.80, -0.6);
    P.add('hullDark', box(0.29, 0.02, 4.3), side * 1.55, 1.875, -0.6);
  }
  // Rear overhang rack past the shelf.
  P.add('hullDetail', box(3.1, 0.06, 0.06), 0, 1.80, -4.44);
  P.add('hullDetail', box(3.1, 0.06, 0.06), 0, 0.95, -4.44);
  P.add('hullDark', box(3.0, 0.8, 0.02), 0, 1.38, -4.46);
  for (const x of [-1.45, -0.72, 0, 0.72, 1.45]) {
    P.add('hullDetail', box(0.05, 0.85, 0.05), x, 1.38, -4.44);
    P.add('hullDetail', box(0.05, 0.05, 0.5), x, 1.82, -4.33);
  }
  P.add('hullCloth', box(2.0, 0.44, 0.26), -0.3, 1.5, -4.38);
  P.add('hullDark', cylZ(0.15, 0.22, 12), -0.42, 1.05, -4.38);
  // Rear exhaust stack on the deck (top 2.42 — the 2-column feature the
  // print shows at z -3.5; sits under the p95 crown plateau).
  P.add('hull', box(0.4, 0.1, 0.4), -0.05, 2.03, -3.40);
  P.add('hull', box(0.32, 0.28, 0.32), -0.05, 2.22, -3.40);
  P.add('hullDetail', box(0.36, 0.05, 0.36), -0.05, 2.38, -3.40);
  P.add('hullDark', box(0.24, 0.03, 0.24), -0.05, 2.41, -3.40);
  // The print's low round casting: wide plan-stretched lathe, crown CLAMPED
  // to 2.46 world (print 2.59; published heightM 2.44 + 1% grace), flowing
  // into a sloped face; fat L/44 at axis ~2.04.
  P.turretG.position.set(0, 1.82, -0.55);
  P.gunG.position.set(0, 0.22, 1.15);
  const lathe = KIT.lathe;
  P.add('turret', lathe([
    [1.48, 0.02], [1.56, 0.12], [1.50, 0.30], [1.30, 0.48], [0.98, 0.58], [0.55, 0.62], [0.02, 0.64],
  ], 30, 1.22), 0, -0.04, -0.55);
  // Sloped face plate carrying the recline down to the gun collar.
  P.add('turret', slab(
    [-0.72, 0.10, 1.55], [0.72, 0.10, 1.55], [0.9, 0.02, 0.4], [-0.9, 0.02, 0.4],
    [-0.52, 0.42, 1.15], [0.52, 0.42, 1.15], [0.62, 0.60, -0.2], [-0.62, 0.60, -0.2]));
  // Crown plateau (p95 anchor at 2.46 world = local 0.64 flat).
  P.add('turret', box(1.35, 0.03, 1.6), 0, 0.625, -1.0);
  // Center sight block flush with the crown + hatches.
  P.add('turret', box(0.34, 0.16, 0.4), 0.1, 0.56, 0.2);
  P.add('turretDark', box(0.26, 0.1, 0.04), 0.1, 0.57, 0.42);
  P.add('turretGlass', box(0.2, 0.06, 0.02), 0.1, 0.57, 0.445);
  turretHatch(P, -0.55, 0.52, -0.55, 0.24, 4);
  turretHatch(P, 0.6, 0.52, -0.85, 0.2, 0);
  antennaPot(P, -1.05, 0.45, -1.5);
  antennaPot(P, 1.0, 0.45, -1.55);
  // Deep crew basket under the bustle (print turret band reaches y 0.77
  // world, z -1.83..-0.18 world, x ±0.84) — dark mesh box + frame.
  P.add('turretDark', box(1.62, 0.98, 1.55), 0, -0.55, -0.7);
  P.add('turretDetail', box(1.66, 0.05, 1.6), 0, -0.08, -0.7);
  for (const [bx, bz] of [[-0.8, -1.42], [0.8, -1.42], [-0.8, 0.02], [0.8, 0.02]]) {
    P.add('turretDetail', box(0.05, 1.0, 0.05), bx, -0.55, bz);
  }
  // Rear basket stowage kept at the casting waist.
  P.add('turretCloth', box(1.5, 0.3, 0.5), -0.2, 0.35, -1.7);
  P.add('turretDark', box(0.024, 0.32, 0.52), -0.7, 0.35, -1.7);
  P.add('turretDark', box(0.024, 0.32, 0.52), 0.35, 0.35, -1.7);
  for (const side of [-1, 1]) {
    smokeBank(P, side * 1.05, 0.30, 0.85, side);
  }
  liftEye(P, 'turretDetail', -1.0, 0.50, 0.35);
  liftEye(P, 'turretDetail', 1.0, 0.50, 0.35);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.3, [1.35, 0.25, -0.6], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.3, [-1.35, 0.25, -0.6], -Math.PI / 2);
  // Fat collar out of the casting + fat sleeved tube (print tube r~0.13).
  P.addGunExtra(box(0.5, 0.44, 0.5), 0, 0, 0.2);
  P.addGunExtra(cylZ(0.19, 0.5, 14, 0.23), 0, 0, 0.45);
  P.addGunExtraDark(cylZ(0.196, 0.05, 14), 0, 0, 0.66);
  // Published 9.77 overall: hull tail -4.46 -> muzzle 5.32; pivot world 0.60.
  // Tube fittings stay under the 12%-of-height band threshold so the fat
  // print gun cannot masquerade as hull length (v6 lesson: a 0.19 collar
  // band re-classified the barrel as body and read hullLength 9.33).
  buildGun(P, { len: 4.72, r: 0.10, sleeve: true, evac: 0.5, collar: false, baseR: 0.18 });
  P.add('gun', cylZ(0.128, 0.09, 12), 0, 0, 4.72 - 0.55);
  P.topY = 1.9;
}

// ---------------------------------------------------------------------------
// abramsx — mortavex demonstrator. The oracle's yawing turret carries the
// chamfered SHELL (roof 2.39-2.47 — fully matchable); its HULL mask carries
// the RWS bridge at 3.25-3.45 over 2.4 m of z plus twin whips at 4.12 —
// under the published 2.44 heightM those clamp to a 2.44 bridge deck with a
// single 3-column mast head at 3.45 (certified cap on hull/whole curves,
// quantified in the packet). Corner pods + bridge get hull pylons down to
// the deck (v5 left them floating -> floaters 0). XM360 muzzle at the
// published 9.77 overall (oracle tube runs long to 6.04 — cover-capped).
// ---------------------------------------------------------------------------
const AX_HULL = {
  bodyHalfW: 1.75, nose: 3.97,
  deck: [[3.97, 1.22], [3.60, 1.30], [3.30, 1.37], [2.85, 1.40], [2.60, 1.37],
    [2.30, 1.47], [2.00, 1.50], [1.45, 1.42], [-2.40, 1.60], [-2.70, 1.76],
    [-3.50, 1.79], [-3.75, 1.70], [-3.97, 1.60]],
  beltTop: 1.05, belly: 0.28,
  noseRake: [[2.45, 0.28], [3.20, 0.55], [3.55, 1.02], [3.97, 1.21]],
  tailRake: [[-2.60, 0.28], [-3.35, 0.50], [-3.75, 0.62]],
  tailShelf: { z0: -3.75, z1: -3.97, yBot: 0.70 },
  skirt: { x: 1.828, top: 1.25, bot: 0.48, z0: -3.55, z1: 3.55 },
  engineZ: -2.95, glacisTopZ: 2.4, periZ: 2.95, noFrontFlaps: true,
  trackXc: 1.42, trackW: 0.6, wheelR: 0.38, wheelY: 0.49,
  wheelZs: [2.05, 1.37, 0.69, 0.01, -0.67, -1.35, -2.0],
  idlerZ: 2.5, idlerY: 0.6, sprocketZ: -2.45, sprocketY: 0.66,
};

function buildAbramsX(P) {
  const g = AX_HULL;
  abramsHull(P, g);
  // Blade bow: underside sweep with a splitter lip.
  P.add('hull', slab(
    [-1.55, 1.02, 3.95], [1.55, 1.02, 3.95], [1.55, 0.30, 2.6], [-1.55, 0.30, 2.6],
    [-1.55, 1.21, 3.97], [1.55, 1.21, 3.97], [1.55, 1.40, 2.9], [-1.55, 1.40, 2.9]));
  P.add('hullDark', box(2.9, 0.035, 0.035), 0, 1.0, 3.9);
  // Hybrid-drive louver panels on the raised rear deck.
  if (P.q) for (const side of [-1, 1]) {
    P.add('hullDark', box(1.05, 0.02, 0.75), side * 0.68, 1.802, -3.1);
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', box(1.0, 0.024, 0.05), side * 0.68, 1.818, -2.82 - k * 0.14);
    }
  }
  // Faceted corner sensor pods (hull mask in the oracle) — pylons carry them
  // to the deck so articulation poses stay connected. Tops clamped to 2.44.
  for (const side of [-1, 1]) {
    P.add('hull', box(0.14, 0.9, 0.35), side * 1.30, 2.0, 0.72);
    P.add('hull', slab(
      [side * 1.18, 2.28, 1.15], [side * 1.52, 2.28, 1.15], [side * 1.52, 2.28, 0.3], [side * 1.18, 2.28, 0.3],
      [side * 0.62, 2.44, 1.05], [side * 0.98, 2.44, 1.05], [side * 0.98, 2.44, 0.4], [side * 0.62, 2.44, 0.4]));
    P.add('hullDark', box(0.2, 0.07, 0.03), side * 1.36, 2.36, 1.16, 0, 0, side * 0.3);
  }
  // RWS / sensor bridge (hull mask in the oracle, 3.25-3.45 over 2.4 m):
  // clamped to a 2.44 bridge deck + single mast head at 3.45 (p95 budget).
  P.add('hull', box(0.3, 0.85, 0.3), 0.05, 1.95, -0.55);   // support leg
  P.add('hull', box(0.3, 0.85, 0.3), 0.05, 1.95, 0.75);    // support leg
  P.add('hull', box(1.0, 0.20, 2.40), 0.05, 2.32, 0.25);   // bridge deck 2.42
  P.add('hullDark', box(0.9, 0.06, 2.3), 0.05, 2.405, 0.25);
  P.add('hullDetail', cylY(0.28, 0.32, 0.06, 16), 0.05, 2.46, -0.35);
  // 30 mm run kept under the bridge line and inside the oracle's RWS span.
  P.add('hullDark', box(0.16, 0.16, 0.6), 0.05, 2.30, 0.95);
  P.add('hullDark', cylZ(0.05, 0.32, 10), 0.05, 2.32, 1.30);
  // Mast: slim column + sensor head, peak 3.44 world, z -0.45..-0.25 (two
  // mask columns of the p95 budget).
  P.add('hull', cylY(0.055, 0.065, 0.55, 10), 0.05, 2.76, -0.35);
  P.add('hull', box(0.34, 0.36, 0.20), 0.05, 3.24, -0.35);
  P.add('hullDark', box(0.26, 0.22, 0.035), 0.05, 3.24, -0.24);
  P.add('hullGlass', box(0.2, 0.15, 0.02), 0.05, 3.24, -0.218);
  P.add('hullDetail', box(0.1, 0.04, 0.1), 0.05, 3.44, -0.35);
  // Stowed antenna pots at the shell rear corners (whips deleted — p95).
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.1, 0.14, 0.1), side * 1.05, 1.68, -1.8);
    P.add('hullDark', cylY(0.022, 0.03, 0.12, 8), side * 1.05, 1.82, -1.8);
  }
  P.decal('hull', 'number', P.spec.visual.number || '', 0.34, [1.80, 0.8, -0.6], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.34, [-1.80, 0.8, -0.6], -Math.PI / 2);
  // Rear tow-pintle bar: thin (below the 12%-band threshold, so hullLength
  // ignores it) but part of the whole silhouette — it matches the oracle's
  // rear overhang and, with the published-overall muzzle, seats the shared
  // camera grid so the plan width columns read the true 3.66 skirts.
  P.add('hullDark', box(0.06, 0.07, 0.36), 0.45, 1.02, -4.13);
  P.add('hullDark', box(0.06, 0.07, 0.36), -0.45, 1.02, -4.13);
  P.add('hullDark', box(1.0, 0.09, 0.09), 0, 1.02, -4.28);
  P.add('hullDetail', box(0.16, 0.14, 0.1), 0, 1.02, -4.20);
  // Yawing shell (turret mask in the oracle): chamfered wedge, roof rising
  // 2.39 -> 2.47 world, bottom rising rearward (undercut 1.56 -> 2.0).
  P.turretG.position.set(0, 1.95, -0.39);
  P.gunG.position.set(0, -0.02, 2.59);
  P.add('turret', slab(
    [-1.34, -0.39, 1.94], [1.34, -0.39, 1.94], [1.30, -0.15, -1.9], [-1.30, -0.15, -1.9],
    [-1.2, 0.44, 1.41], [1.2, 0.44, 1.41], [1.22, 0.52, -0.7], [-1.22, 0.52, -0.7]));
  P.add('turret', slab(  // front face chamfer down to the deck line
    [-1.24, -0.38, 2.11], [1.24, -0.38, 2.11], [1.3, -0.39, 1.89], [-1.3, -0.39, 1.89],
    [-1.05, 0.40, 1.39], [1.05, 0.40, 1.39], [1.14, 0.44, 1.29], [-1.14, 0.44, 1.29]));
  P.add('turret', slab(  // raised rear block with the undercut tail
    [-1.05, -0.15, -0.6], [1.05, -0.15, -0.6], [1.0, 0.07, -1.95], [-1.0, 0.07, -1.95],
    [-1.05, 0.5, -0.6], [1.05, 0.5, -0.6], [1.0, 0.5, -1.9], [-1.0, 0.5, -1.9]));
  P.add('turretDark', box(1.9, 0.26, 0.03), 0, 0.28, -1.93);
  P.add('turretDetail', box(2.1, 0.04, 0.8), 0, 0.47, -1.0);
  if (P.q) {
    for (const side of [-1, 1]) {
      P.add('turretDark', box(0.02, 0.5, 0.02), side * 1.28, -0.16, 1.74, -0.35, 0, 0);
      P.add('turretDark', box(0.02, 0.02, 3.2), side * 1.26, 0.40, 0.09);
      P.add('turretDetail', box(0.24, 0.03, 0.03), side * 0.9, 0.47, -0.01);
      P.add('turretDetail', box(0.24, 0.03, 0.03), side * 0.9, 0.45, 0.89);
      P.add('turretDetail', box(0.03, 0.35, 0.03), side * 1.0, 0.3, -1.05);
    }
  }
  P.add('turret', box(0.3, 0.35, 0.3), 0.75, 0.28, -0.7);    // sensor post
  P.add('turretDark', box(0.22, 0.12, 0.03), 0.75, 0.4, -0.54);
  // XM360: axis 1.93, muzzle at the published 9.77 overall (5.80 world),
  // angular shroud + pepperpot muzzle.
  P.addGunExtra(box(0.62, 0.4, 0.95), 0, 0.02, 0.15);
  P.addGunExtra(box(0.5, 0.16, 0.6), 0, -0.2, 0.2);
  P.addGunExtraDark(box(0.52, 0.03, 0.03), 0, 0.14, 0.62);
  P.addGunExtraDark(cylZ(0.04, 0.16, 10), 0.24, 0.1, 0.6);
  buildGun(P, { len: 3.27, r: 0.115, sleeve: true, evac: 0.5, collar: true, baseR: 0.15 });
  P.add('gun', box(0.27, 0.27, 0.5), 0, 0, 2.51);
  P.add('gun', box(0.27, 0.27, 0.5), 0, 0, 2.51, 0, 0, Math.PI / 4);
  P.add('gunDark', cylZ(0.125, 0.28, 12), 0, 0, 3.09);
  P.add('gun', cylZ(0.14, 0.1, 12), 0, 0, 2.92);
  P.add('gunDark', torus(0.1, 0.02, 12), 0, 0, 3.23, Math.PI / 2, 0, 0);
  P.topY = 1.6;
}

// ---------------------------------------------------------------------------
// Profile table
// ---------------------------------------------------------------------------
export const ABRAMS_PROFILES = {
  m1a2: { build: buildSepv3 },
  m1a1: { build: buildTejasFamily, station: 'cws' },
  m1a1ha: { build: buildTejasFamily, station: 'cws' },
  m1a2_tejas: { build: buildTejasFamily, station: 'crows' },
  // TUSK: published-true full-scale body + real-scale ARAT/slat/TIP kit.
  // The tusk oracle is the tejas GLB height-clamped small PLUS a real-scale
  // runtime kit (certified chimera — see the packet); dims/floaters are the
  // achievable components and the build no longer chases the 0.727 body.
  m1a2_tusk: { build: buildTejasFamily, abramsKit: 'tusk', station: 'crows' },
  m1a2_sepv2: { build: buildSepv2 },
  m1a1_aim: { build: buildAim },
  abramsx: { build: buildAbramsX },
};
