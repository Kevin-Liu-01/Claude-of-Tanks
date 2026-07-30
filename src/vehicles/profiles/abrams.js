// Abrams family procedural profiles.
// Fidelity oracles (docs/references/tanks/*.md): m1a2_sepv3_dannzjs (m1a2),
// m1a2_tejas (m1a2_tejas / m1a1 / m1a1ha and, plus the runtime ARAT kit,
// m1a2_tusk), recovered m1a2_sepv2, recovered bergman m1a1_aim, and
// abramsx-mortavex. Owned by the Abrams family agent — no other module
// registers these ids.
//
// Every dimension below is an original primitive reconstruction authored in
// the fidelity lab's scoring frame (both silhouettes width-normalized to
// spec.dims.widthM, ground = 0, +z = bow) from rendered-mask measurements and
// published real-vehicle dimensions. No source mesh data is used.
//
// BUCKET POLICY (fidelity lab interaction): LOD-wrapped buckets (*Detail,
// *Dark, *Cloth, *Glass) ignore the lab's hull/turret visibility split
// (THREE.LOD re-asserts child visibility at render time), so ANY turret-
// parented geometry in those buckets bleeds into the hull mask and punches
// holes in the turret mask. Turret-frame geometry therefore uses ONLY the
// LOD0 'turret' bucket (plus gun/gunMount, which are LOD0 as well); the
// hull frame may use detail buckets freely.
import { KIT, ABRAMS } from './kit.js';

// KIT is populated by tankFactory.js, which sits on the other side of an
// import cycle with the profile modules — resolve members lazily (call time)
// rather than at module-evaluation time.
const {
  box, cylY, cylZ, torus, slab, frustum, buildRunningGear, buildGun,
  liftEye, periscope, towCable,
} = new Proxy({}, { get: (_, name) => (...args) => KIT[name](...args) });

// ---------------------------------------------------------------------------
// Hull: belly core + full-width sponson band whose roof follows a measured
// deck station line, raked bow/stern plates, segmented skirts and 7-wheel
// running gear. All stations in scoring-frame meters.
// ---------------------------------------------------------------------------
function abramsHull(P, g) {
  const hw = g.halfW;
  const s = g.s ?? 1; // uniform pre-scale (m1a2_tusk under-scale oracle)

  // Belly core between the tracks.
  const innerW = g.trackXc - g.trackW / 2 - 0.02;
  P.add('hull', box(innerW * 2, g.beltTop - g.belly, g.nose - g.tail - 0.7),
    0, (g.beltTop + g.belly) / 2, (g.nose + g.tail) / 2);

  // Sponson band: beltTop up to the deck line, full width at the fender line
  // with an optional tumblehome inset at the roof edge, segmented so the roof
  // follows the measured stations (glacis -> flat deck -> engine riser).
  const dw = hw - (g.deckInset ?? 0);
  for (let i = 0; i < g.deck.length - 1; i++) {
    const [zf, yf] = g.deck[i];
    const [zr, yr] = g.deck[i + 1];
    P.add('hull', slab(
      [-hw, g.beltTop, zf], [hw, g.beltTop, zf], [hw, g.beltTop, zr], [-hw, g.beltTop, zr],
      [-dw, yf, zf], [dw, yf, zf], [dw, yr, zr], [-dw, yr, zr]));
  }

  // Bow: lower front plate raked back from the glacis tip toward the ground
  // line (the Abrams lower plate nearly reaches the track contact point).
  const noseTipY = g.deck[0][1];
  const noseBotY = g.noseBotY ?? g.belly;
  P.add('hull', slab(
    [-hw * 0.92, noseBotY, g.noseBotZ], [hw * 0.92, noseBotY, g.noseBotZ],
    [hw * 0.92, noseBotY, g.noseBotZ - 0.6], [-hw * 0.92, noseBotY, g.noseBotZ - 0.6],
    [-hw * 0.92, noseTipY, g.nose], [hw * 0.92, noseTipY, g.nose],
    [hw * 0.92, noseTipY, g.nose - 0.5], [-hw * 0.92, noseTipY, g.nose - 0.5]));

  // Stern: raked lower rear plate + vertical grille face.
  const tailTopY = g.deck[g.deck.length - 1][1];
  P.add('hull', slab(
    [-hw * 0.9, g.belly, g.tailBotZ], [hw * 0.9, g.belly, g.tailBotZ],
    [hw * 0.9, g.belly, g.tailBotZ + 0.6], [-hw * 0.9, g.belly, g.tailBotZ + 0.6],
    [-hw * 0.9, tailTopY, g.tail], [hw * 0.9, tailTopY, g.tail],
    [hw * 0.9, tailTopY, g.tail + 0.42], [-hw * 0.9, tailTopY, g.tail + 0.42]));
  // Turbine grille doors + exhaust louvres.
  P.add('hull', box(hw * 1.72, (tailTopY - g.belly) * 0.82, 0.08),
    0, (tailTopY + g.belly) / 2, g.tail + 0.03);
  if (P.q) for (let k = 0; k < 6; k++) {
    P.add('hullDark', box(hw * 1.6, 0.045 * s, 0.03), 0, g.belly + 0.16 * s + k * 0.13 * s, g.tail - 0.015);
  }

  // Skirts: 7 panels, front panels heavy, riding at the measured band
  // (deep ERA-style on the SEP hulls, high with exposed wheels on the rest).
  const skirtTop = g.skirtTop;
  const panels = 7;
  const panelD = (g.nose - g.tail - 0.7) / panels;
  for (const side of [-1, 1]) {
    for (let k = 0; k < panels; k++) {
      const heavy = k < 3;
      const z = g.nose - 0.45 - panelD / 2 - k * panelD;
      P.add('hull', box(heavy ? 0.075 : 0.045, skirtTop - g.skirtBot, panelD * 0.97),
        side * (hw - 0.04), (skirtTop + g.skirtBot) / 2, z);
      if (P.q) P.add('hullDark', box(0.05, (skirtTop - g.skirtBot) * 0.86, 0.016),
        side * (hw - 0.028), (skirtTop + g.skirtBot) / 2, z - panelD / 2);
    }
    P.add('hullRubber', box(0.022, 0.07, g.nose - g.tail - 0.75),
      side * (hw - 0.03), g.skirtBot - 0.03, (g.nose + g.tail) / 2);
  }

  // Running gear: 7 road wheels, front idler, rear drive sprocket.
  buildRunningGear(P, {
    style: 'rubber', wheelR: g.wheelR, wheelW: Math.min(0.23, g.trackW * 0.38),
    wheelY: g.wheelR + 0.11, xc: g.trackXc,
    wheelZs: g.wheelZs,
    sprocket: { z: g.sprocketZ, y: g.sprocketY ?? g.wheelR + 0.24, r: g.sprocketR ?? g.wheelR * 0.9 },
    idler: { z: g.idlerZ, y: g.idlerY ?? g.wheelR + 0.26, r: g.idlerR ?? g.wheelR * 0.84 },
    trackW: g.trackW, topY: g.beltTop - 0.06, paintedEnds: true, coveredTop: true,
  });

  // Glacis furniture: splash board, driver periscopes, filler caps, lights,
  // mud flaps, tow cables, lifting eyes.
  const glacisMidZ = (g.nose + g.deck[1][0]) / 2;
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.85 * s, 0.05, 0.065), side * 0.4 * s, noseTipY + 0.06, glacisMidZ + 0.28 * s, -0.18, side * 0.42, 0);
    P.add('hullDetail', cylY(0.085 * s, 0.085 * s, 0.035, 12), side * 1.1 * s, g.deck[1][1] + 0.02, g.deck[1][0] - 0.5);
    P.add('hullDark', box(0.19 * s, 0.09 * s, 0.08), side * hw * 0.72, noseTipY - 0.13, g.nose - 0.24);
    P.add('hullGlass', box(0.15 * s, 0.055 * s, 0.02), side * hw * 0.72, noseTipY - 0.13, g.nose - 0.185);
    P.add('hullRubber', box(0.55 * s, 0.36 * s, 0.028), side * (g.trackXc + 0.05), g.skirtBot + 0.06, g.nose - 0.16, -0.14, 0, 0);
    P.add('hullDark', box(0.15 * s, 0.075 * s, 0.05), side * hw * 0.76, noseTipY - 0.05, g.tail + 0.02);
    P.add('hullDetail', torus(0.05 * s, 0.015, 12), side * 1.05 * s, noseTipY + 0.04, glacisMidZ + 0.05);
    liftEye(P, 'hullDetail', side * hw * 0.8, tailTopY + 0.02, g.tail + 0.65);
  }
  periscope(P, 'hullDetail', -0.24 * s, g.deck[1][1] + 0.035, g.deck[1][0] + 0.1);
  periscope(P, 'hullDetail', 0.24 * s, g.deck[1][1] + 0.035, g.deck[1][0] + 0.1);
  const cableApexZ = Math.min(g.nose - 0.35, glacisMidZ + 0.5);
  towCable(P, [[-1.15 * s, noseTipY - 0.06, cableApexZ], [0, noseTipY + 0.03, cableApexZ - 0.6],
    [1.15 * s, noseTipY - 0.06, cableApexZ]]);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.4 * s, [hw + 0.01, (skirtTop + g.skirtBot) / 2 + 0.06, g.nose - 1.2], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.4 * s, [-(hw + 0.01), (skirtTop + g.skirtBot) / 2 + 0.06, g.nose - 1.2], -Math.PI / 2);
  P.decal('hull', 'soot', null, 1.05 * s, [0.65 * s, (tailTopY + g.belly) / 2, g.tail - 0.05], Math.PI);
  P.decal('hull', 'soot', null, 1.05 * s, [-0.65 * s, (tailTopY + g.belly) / 2, g.tail - 0.05], Math.PI);
}

// ---------------------------------------------------------------------------
// Turret: low wide Abrams shell — long welded cheeks reaching far over the
// glacis, near-vertical sides, sloped roof, full-width bustle and slatted
// stowage rack. Local frame: origin at the turret ring. 'turret' bucket only
// (see bucket policy above).
// ---------------------------------------------------------------------------
function abramsTurretShell(P, t) {
  const tw = t.tw;               // half width of the shell
  const throat = t.throat;       // half width at the mantlet
  const zf = t.front;            // cheek tip (local z)
  const zWide = t.zWide;         // where cheeks reach full width
  const zr = t.rear;             // bustle rear face
  const yb = t.bot;              // shell bottom
  const yFront = t.roofFront;    // roof at the cheek tips
  const yRear = t.roofRear;      // roof at the bustle
  const zRoofPeak = t.zRoofPeak ?? (zWide - 1.0);

  // Main body: full-width block from zWide back to the bustle.
  P.add('turret', slab(
    [-tw, yb, zWide], [tw, yb, zWide], [tw, yb, zr], [-tw, yb, zr],
    [-tw * 0.985, yFront, zWide], [tw * 0.985, yFront, zWide],
    [tw * 0.985, yFront, zr * 0.99], [-tw * 0.985, yFront, zr * 0.99]));
  // Roof wedge front->peak, then flat plate to the rear.
  P.add('turret', slab(
    [-tw * 0.96, yFront - 0.02, zWide + 0.3], [tw * 0.96, yFront - 0.02, zWide + 0.3],
    [tw * 0.96, yFront - 0.02, zRoofPeak], [-tw * 0.96, yFront - 0.02, zRoofPeak],
    [-tw * 0.9, yFront, zWide + 0.3], [tw * 0.9, yFront, zWide + 0.3],
    [tw * 0.9, yRear, zRoofPeak], [-tw * 0.9, yRear, zRoofPeak]));
  P.add('turret', slab(
    [-tw * 0.96, yFront - 0.02, zRoofPeak], [tw * 0.96, yFront - 0.02, zRoofPeak],
    [tw * 0.96, yFront - 0.02, zr * 0.99], [-tw * 0.96, yFront - 0.02, zr * 0.99],
    [-tw * 0.9, yRear, zRoofPeak], [tw * 0.9, yRear, zRoofPeak],
    [tw * 0.9, yRear, zr * 0.99], [-tw * 0.9, yRear, zr * 0.99]));

  // Welded cheek wedges: flat-faceted plates sweeping from the mantlet throat
  // to the full-width shoulders (the signature Abrams plan form).
  for (const side of [-1, 1]) {
    const a = side * throat;
    const b = side * tw;
    P.add('turret', slab(
      [a, yb, zf], [b, yb, zWide + 0.15], [b, yb, zWide - 0.6], [a, yb, zf - 0.75],
      [a, yFront, zf - 0.42], [b * 0.985, yFront, zWide], [b * 0.985, yFront, zWide - 0.6], [a, yFront, zf - 1.0]));
  }
  // Mantlet embrasure block between the cheeks.
  P.add('turret', box(throat * 2.04, (yFront - yb) * 0.94, 1.15),
    0, (yFront + yb) / 2 - 0.01, zf - 0.72);
}

// Bustle stowage rack: rails + slats + packed gear, all 'turret' bucket.
function abramsBustleRack(P, t, s = 1) {
  const tw = t.tw;
  const zr = t.rear;
  const rackD = t.rackDepth ?? 0.42;
  const rkT = t.rackTop;
  const rkB = t.bot + 0.16;
  const zRack = zr - rackD / 2;
  P.add('turret', box(tw * 1.72, 0.05, 0.05), 0, rkT, zr - rackD);
  P.add('turret', box(tw * 1.72, 0.05, 0.05), 0, rkB, zr - rackD);
  for (const side of [-1, 1]) {
    P.add('turret', box(0.05, 0.05, rackD * 1.9), side * tw * 0.84, rkT, zRack + rackD * 0.4);
    P.add('turret', box(0.05, 0.05, rackD * 1.9), side * tw * 0.84, rkB, zRack + rackD * 0.4);
  }
  const slats = 13;
  for (let k = 0; k < slats; k++) {
    P.add('turret', box(0.032, rkT - rkB, 0.032), -tw * 0.82 + k * (tw * 1.64 / (slats - 1)), (rkT + rkB) / 2, zr - rackD);
  }
  // Packed duffels riding level with the top rail.
  P.add('turret', box(0.72 * s, (rkT - rkB) * 0.8, rackD * 1.7), -tw * 0.5, (rkT + rkB) / 2 + 0.03 * s, zRack + rackD * 0.3);
  P.add('turret', box(0.8 * s, (rkT - rkB) * 0.9, rackD * 1.7), 0.1 * s, (rkT + rkB) / 2 + 0.05 * s, zRack + rackD * 0.3);
  P.add('turret', box(0.55 * s, (rkT - rkB) * 0.65, rackD * 1.6), tw * 0.58, (rkT + rkB) / 2, zRack + rackD * 0.3);
}

// Small turret-bucket hardware (hand-rolled so nothing lands in LOD buckets).
function turretHatch(P, x, y, z, r) {
  P.add('turret', cylY(r, r * 1.04, 0.055, 14), x, y + 0.03, z);
  P.add('turret', cylY(r * 0.9, r * 0.9, 0.03, 14), x, y + 0.075, z);
}
function turretM2(P, x, y, z, s = 1) {
  P.add('turret', box(0.09 * s, 0.11 * s, 0.5 * s), x, y, z);
  P.add('turret', cylZ(0.022 * s, 0.55 * s, 8), x, y + 0.01, z + 0.45 * s);
  P.add('turret', box(0.1 * s, 0.14 * s, 0.2 * s), x - 0.14 * s, y - 0.02, z - 0.08 * s);
}
function turretSmoke(P, x, y, z, side, s = 1) {
  P.add('turret', box(0.34 * s, 0.16 * s, 0.16 * s), x, y, z, 0, side * 0.5, 0);
  for (let i = 0; i < 3; i++) {
    P.add('turret', cylZ(0.042 * s, 0.2 * s, 8),
      x + side * (i - 1) * 0.1 * s, y + 0.05 * s, z + 0.1 * s, -0.5, side * 0.5, 0);
  }
}
function turretAntenna(P, x, yBase, z, h, lean = 0.06) {
  P.add('turret', box(0.022, h, 0.022), x, yBase + h / 2, z, 0, 0, Math.sign(x) * lean);
}

// ---------------------------------------------------------------------------
// Family geometry tables (scoring-frame meters; see docs/references/tanks/).
// ---------------------------------------------------------------------------
const TEJAS_HULL = {
  halfW: 1.83, nose: 3.95, tail: -3.95,
  deck: [[3.95, 1.31], [2.35, 1.455], [-1.30, 1.51], [-2.20, 1.72], [-3.60, 1.75], [-3.95, 1.68]],
  beltTop: 1.18, belly: 0.35, noseBotZ: 2.68, noseBotY: 0.06, tailBotZ: -2.95,
  skirtTop: 1.30, skirtBot: 0.50,
  trackXc: 1.40, trackW: 0.64, wheelR: 0.42,
  wheelZs: [2.66, 1.78, 0.9, 0.02, -0.86, -1.74, -2.62],
  idlerZ: 3.15, idlerY: 0.72, idlerR: 0.30, sprocketZ: -3.0, sprocketY: 0.66, sprocketR: 0.34,
};

// Tejas-oracle turret, local frame: ring at world (0, 1.57, 0.35).
const TEJAS_TURRET = {
  tw: 1.76, throat: 0.62, front: 2.0, zWide: 0.15, rear: -3.10,
  bot: -0.18, roofFront: 0.62, roofRear: 0.85, zRoofPeak: -0.9,
  rackTop: 0.97, rackDepth: 0.42,
  ring: [0, 1.57, 0.35], gun: [0, 0.31, 1.56], gunLen: 3.82, gunR: 0.09,
};

function tejasRoofKit(P, t, s = 1) {
  const roof = t.roofRear;
  // CITV head left-forward.
  P.add('turret', cylY(0.13 * s, 0.15 * s, 0.24 * s, 14), -0.62 * s, t.roofFront + 0.1 * s, 1.05 * s);
  P.add('turret', box(0.26 * s, 0.24 * s, 0.28 * s), -0.62 * s, t.roofFront + 0.32 * s, 1.05 * s);
  // CROWS station behind it (pedestal, sensor cradle, elevated .50cal) —
  // measured footprint x -1.16..-0.31, top 3.25..3.33 world, z -0.05..2.0.
  P.add('turret', cylY(0.14 * s, 0.17 * s, 0.5 * s, 12), -0.74 * s, t.roofFront + 0.3 * s, 0.55 * s);
  P.add('turret', box(0.55 * s, 0.55 * s, 0.9 * s), -0.74 * s, t.roofFront + 0.83 * s, 0.75 * s);
  P.add('turret', box(0.34 * s, 0.22 * s, 0.06 * s), -0.74 * s, t.roofFront + 0.86 * s, 1.23 * s);
  turretM2(P, -0.58 * s, t.roofFront + 1.18 * s, 1.15 * s, s);
  // Loader's M240 + shield right of center.
  P.add('turret', box(0.5 * s, 0.3 * s, 0.05), 0.88 * s, roof + 0.35 * s, 0.15 * s);
  P.add('turret', box(0.07 * s, 0.09 * s, 0.44 * s), 0.88 * s, roof + 0.4 * s, -0.12 * s);
  P.add('turret', cylZ(0.02 * s, 0.5 * s, 8), 0.88 * s, roof + 0.4 * s, 0.3 * s);
  // Gunner's primary sight doghouse right-forward.
  P.add('turret', box(0.52 * s, 0.32 * s, 0.58 * s), 0.8 * s, t.roofFront + 0.24 * s, 1.0 * s);
  P.add('turret', box(0.44 * s, 0.15 * s, 0.05), 0.8 * s, t.roofFront + 0.22 * s, 1.3 * s);
  // Hatches, blow-off seam ribs, wind sensor, antennas.
  P.add('turret', cylY(0.24 * s, 0.24 * s, 0.04, 14), -0.75 * s, roof + 0.02, -0.7 * s);
  P.add('turret', cylY(0.2 * s, 0.2 * s, 0.04, 14), 0.7 * s, roof + 0.02, -0.35 * s);
  P.add('turret', box(1.25 * s, 0.02, 0.95 * s), 0, roof + 0.012, -1.7 * s);
  P.add('turret', box(0.03, 0.38 * s, 0.03), -0.3 * s, roof + 0.19 * s, -0.65 * s);
  turretAntenna(P, -1.05 * s, roof, -2.3 * s, 1.62 * s);
  turretAntenna(P, 1.0 * s, roof, -2.0 * s, 1.45 * s);
  for (const side of [-1, 1]) {
    turretSmoke(P, side * 1.42 * s, 0.38 * s, 1.05 * s, side, s);
    // Sponson stowage rail + tarp roll along the shell sides.
    P.add('turret', box(0.04, 0.24 * s, 1.5 * s), side * (t.tw + 0.02), 0.3 * s, -1.4 * s);
    P.add('turret', cylZ(0.07 * s, 0.55 * s, 8), side * (t.tw - 0.02), 0.52 * s, -1.9 * s);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34 * s, [t.tw + 0.01, 0.3 * s, -1.0 * s], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34 * s, [-(t.tw + 0.01), 0.3 * s, -1.0 * s], -Math.PI / 2);
}

function scaleHull(g, s) {
  return {
    ...g, s,
    halfW: g.halfW * s,
    nose: g.nose * s, tail: g.tail * s,
    deck: g.deck.map(([z, y]) => [z * s, y * s]),
    beltTop: g.beltTop * s, belly: g.belly * s,
    noseBotZ: g.noseBotZ * s, tailBotZ: g.tailBotZ * s,
    skirtTop: g.skirtTop * s, skirtBot: g.skirtBot * s,
    trackXc: g.trackXc * s, trackW: g.trackW * s, wheelR: g.wheelR * s,
    wheelZs: g.wheelZs.map((z) => z * s),
    idlerZ: g.idlerZ * s, idlerY: g.idlerY * s,
    sprocketZ: g.sprocketZ * s, sprocketY: g.sprocketY * s,
  };
}

function scaleTurret(t, s) {
  return {
    ...t,
    tw: t.tw * s, throat: t.throat * s, front: t.front * s, zWide: t.zWide * s,
    rear: t.rear * s, bot: t.bot * s, roofFront: t.roofFront * s,
    roofRear: t.roofRear * s, zRoofPeak: (t.zRoofPeak ?? 0) * s,
    rackTop: t.rackTop * s, rackDepth: (t.rackDepth ?? 0.42) * s,
    ring: t.ring.map((v) => v * s), gun: t.gun.map((v) => v * s),
    gunLen: t.gunLen * s, gunR: t.gunR * s,
  };
}

// ---------------------------------------------------------------------------
// Variant builders
// ---------------------------------------------------------------------------
function buildTejasFamily(P, p) {
  const s = p.oracleScale ?? 1;
  const g = s === 1 ? TEJAS_HULL : scaleHull(TEJAS_HULL, s);
  const t = s === 1 ? TEJAS_TURRET : scaleTurret(TEJAS_TURRET, s);
  abramsHull(P, g);
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsTurretShell(P, t);
  abramsBustleRack(P, t, s);
  tejasRoofKit(P, t, s);
  P.addGunExtra(box(0.64 * s, 0.5 * s, 0.42 * s), 0, 0.0, 0.1 * s);
  P.addGunExtra(cylZ(0.15 * s, 0.26 * s, 14), 0, 0, 0.42 * s);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.52, collar: true, baseR: 0.14 * s });
  P.topY = t.roofRear + 1.0 * s;

  if (p.abramsKit === 'tusk') {
    // TUSK kit mirrors the runtime kit stations (docs packet): the kit is
    // full real-vehicle scale even though the oracle body is under-scale.
    const hw = 1.83;
    for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
      const y = row ? 0.89 : 0.59;
      for (let col = 0; col < 14; col++) {
        P.add('hull', box(0.12, 0.27, 0.32), side * (hw - 0.06), y, -2.11 + col * 0.325, 0, 0, side * -0.05);
      }
      P.add('hullDark', box(0.07, 0.066, 4.81), side * 1.72, y, 0);
    }
    // Rear slat cage + Tank Infantry Phone.
    P.add('hullDark', box(3.35, 0.066, 0.066), 0, 1.16, -3.66);
    P.add('hullDark', box(3.35, 0.066, 0.066), 0, 0.86, -3.66);
    for (const x of [-1.62, -1.08, -0.54, 0, 0.54, 1.08, 1.62]) {
      P.add('hullDark', box(0.042, 0.68, 0.042), x, 0.86, -3.66);
    }
    P.add('hullDark', box(0.45, 0.4, 0.18), 1.34, 1.02, -3.56);
    // Loader's armored gun shield (turret local).
    P.add('turret', box(0.74, 0.45, 0.05), -0.58, 0.72, 0.32);
    P.add('turret', box(0.05, 0.45, 0.55), -0.94, 0.72, 0.05);
  }
}

// m1a2 — dannzjs SEPv3 oracle (docs/references/tanks/m1a2.md).
const SEPV3_HULL = {
  halfW: 1.83, nose: 3.63, tail: -3.63,
  deck: [[3.63, 1.05], [2.6, 1.38], [0, 1.47], [-1.5, 1.50], [-2.5, 1.58], [-3.63, 1.62]],
  beltTop: 1.02, belly: 0.42, noseBotZ: 3.25, noseBotY: 0.30, tailBotZ: -2.85,
  skirtTop: 1.16, skirtBot: 0.16, deckInset: 0.12,
  trackXc: 1.40, trackW: 0.62, wheelR: 0.40,
  wheelZs: [2.45, 1.63, 0.81, -0.01, -0.83, -1.65, -2.45],
  idlerZ: 3.05, idlerY: 0.70, idlerR: 0.30, sprocketZ: -2.9, sprocketY: 0.68, sprocketR: 0.32,
};
const SEPV3_TURRET = {
  tw: 1.72, throat: 0.62, front: 3.0, zWide: 0.65, rear: -2.75,
  bot: -0.43, roofFront: 0.35, roofRear: 0.66, zRoofPeak: -0.2,
  ring: [0, 1.80, -0.245], gun: [0, 0.23, 0.70], gunLen: 5.28, gunR: 0.085,
};

function buildSepv3(P) {
  const g = SEPV3_HULL;
  const t = SEPV3_TURRET;
  abramsHull(P, g);
  // Rear bustle-rack overhang past the grille doors (top ~1.8, underside 1.2).
  P.add('hull', box(3.0, 0.14, 0.3), 0, 1.72, -3.48);
  P.add('hullDetail', box(2.9, 0.5, 0.06), 0, 1.42, -3.6);
  for (const x of [-1.35, -0.65, 0.65, 1.35]) P.add('hullDetail', box(0.05, 0.5, 0.28), x, 1.42, -3.48);
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsTurretShell(P, t);
  const roof = t.roofRear;
  // SEPv3 roof: low doghouse on the right cheek (top 2.43 world), tall CITV
  // periscope at z ~1.5 world (top 2.80), CROWS-LP mast head to 3.92.
  P.add('turret', box(0.55, 0.3, 0.7), 0.95, t.roofFront + 0.14, 2.3);
  P.add('turret', box(0.46, 0.14, 0.05), 0.95, t.roofFront + 0.13, 2.66);
  P.add('turret', cylY(0.13, 0.15, 0.3, 14), -0.85, roof + 0.05, 1.75);
  P.add('turret', box(0.3, 0.28, 0.32), -0.85, roof + 0.24, 1.75);
  turretHatch(P, 0.7, roof, -0.15, 0.2);
  turretHatch(P, -0.75, roof, -0.35, 0.24);
  // Boxed electronics / stowage across the bustle roof (top ~2.85 world).
  P.add('turret', cylY(0.15, 0.18, 0.1, 12), 0.35, roof + 0.05, -0.75);
  P.add('turret', box(0.34, 0.28, 0.4), 0.35, roof + 0.28, -0.75);
  turretM2(P, 0.47, roof + 0.46, -0.65);
  P.add('turret', box(1.55, 0.3, 1.15), -0.35, roof + 0.15, -1.6);
  P.add('turret', box(0.9, 0.22, 0.7), 0.6, roof + 0.42, -1.7);
  // Duffels on the bustle roof tail (top ~2.67 world, nothing past -3.0).
  P.add('turret', box(1.2, 0.3, 0.9), -0.2, roof + 0.06, -2.05);
  P.add('turret', box(0.7, 0.2, 0.6), 0.65, roof + 0.02, -2.15);
  // CROWS-LP mast head (head to 3.92 world at z ~-1.6) + whip antennas.
  P.add('turret', cylY(0.045, 0.045, 1.1, 10), -0.45, roof + 0.85, -1.35);
  P.add('turret', box(0.3, 0.3, 0.34), -0.45, roof + 1.45, -1.35);
  P.add('turret', box(1.25, 0.02, 0.95), 0, roof + 0.012, -1.15);
  turretAntenna(P, -0.9, roof, -1.3, 1.44);
  turretAntenna(P, 0.9, roof, -1.3, 1.44);
  for (const side of [-1, 1]) {
    turretSmoke(P, side * 1.42, 0.2, 2.2, side);
    P.add('turret', box(0.04, 0.24, 1.6), side * (t.tw + 0.02), 0.0, -1.3);
    P.add('turret', cylZ(0.075, 0.6, 8), side * (t.tw - 0.02), 0.26, -1.9);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34, [t.tw + 0.01, 0.15, -1.0], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34, [-(t.tw + 0.01), 0.15, -1.0], -Math.PI / 2);
  P.addGunExtra(box(0.66, 0.5, 0.45), 0, 0.02, 0.2);
  P.addGunExtra(cylZ(0.15, 0.28, 14), 0, 0.02, 0.55);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.52, collar: true, baseR: 0.15 });
  P.topY = roof + 1.5;
}

// m1a2_sepv2 — recovered oracle with a partially-static upper (see packet).
const SEPV2_HULL = {
  halfW: 1.83, nose: 3.32, tail: -3.32,
  deck: [[3.32, 1.18], [2.4, 1.28], [0.6, 1.38], [-1.4, 1.42], [-2.4, 1.52], [-3.32, 1.60]],
  beltTop: 1.0, belly: 0.30, noseBotZ: 2.75, noseBotY: 0.2, tailBotZ: -2.7,
  skirtTop: 1.1, skirtBot: 0.14, deckInset: 0.1,
  trackXc: 1.38, trackW: 0.6, wheelR: 0.38,
  wheelZs: [2.3, 1.53, 0.76, -0.01, -0.78, -1.55, -2.3],
  idlerZ: 2.8, idlerY: 0.62, idlerR: 0.28, sprocketZ: -2.8, sprocketY: 0.62, sprocketR: 0.3,
};
const SEPV2_TURRET = {
  tw: 1.55, throat: 0.58, front: 2.09, zWide: 0.5, rear: -0.65,
  bot: -0.30, roofFront: 0.98, roofRear: 1.02, zRoofPeak: 0.2,
  ring: [0, 1.73, -0.11], gun: [0, -0.01, 0.60], gunLen: 4.38, gunR: 0.09,
};

function buildSepv2(P) {
  const g = SEPV2_HULL;
  const t = SEPV2_TURRET;
  abramsHull(P, g);
  // Static upper works that the recovered oracle keeps in its hull mask:
  // commander pedestal (to y 2.79) and rear deck rack (to y 2.21, x ±1.55).
  P.add('hull', box(0.62, 1.14, 0.66), 0, 2.05, -0.05);
  P.add('hullDark', box(0.5, 0.18, 0.54), 0, 2.68, -0.05);
  P.add('hullDetail', box(3.05, 0.06, 0.06), 0, 2.18, -0.75);
  P.add('hullDetail', box(3.05, 0.06, 0.06), 0, 2.18, -2.2);
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.06, 0.06, 1.5), side * 1.5, 2.18, -1.48);
    for (const z of [-0.75, -1.48, -2.2]) P.add('hullDetail', box(0.05, 0.6, 0.05), side * 1.5, 1.86, z);
  }
  P.add('hullCloth', box(0.8, 0.42, 1.2), -0.7, 1.62, -1.5);
  P.add('hullCloth', box(0.7, 0.36, 0.9), 0.65, 1.58, -1.3);
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsTurretShell(P, t);
  const roof = t.roofRear;
  // Stepped upper works mirroring the recovered asset: tall front fighting
  // block (roof 2.75, plateau 2.95), low saddle behind it (the static deck
  // rack pokes through the gap), then a separate rear stowage box (2.45).
  P.add('turret', slab(
    [-1.4, t.bot, -0.6], [1.4, t.bot, -0.6], [1.4, t.bot, -1.4], [-1.4, t.bot, -1.4],
    [-1.35, -0.1, -0.62], [1.35, -0.1, -0.62], [1.35, -0.1, -1.38], [-1.35, -0.1, -1.38]));
  P.add('turret', box(2.9, 1.02, 1.25), 0, 0.22, -2.0);
  P.add('turret', box(1.3, 0.22, 1.5), -0.05, roof + 0.09, 1.05);
  P.add('turret', box(0.42, 0.14, 0.05), 0.45, roof + 0.1, 1.82);
  turretHatch(P, 0.66, roof, -0.05, 0.2);
  turretHatch(P, -0.7, roof, -0.35, 0.22);
  P.add('turret', cylY(0.16, 0.19, 0.1, 12), -0.5, 0.75, -1.5);
  P.add('turret', cylY(0.055, 0.055, 0.75, 10), -0.5, 1.2, -1.5);
  P.add('turret', box(0.32, 0.3, 0.32), -0.5, 1.76, -1.5);
  turretM2(P, -0.38, 1.93, -1.42);
  turretAntenna(P, -1.0, 0.75, -1.85, 1.15);
  for (const side of [-1, 1]) {
    turretSmoke(P, side * 1.3, 0.55, 1.6, side);
    P.add('turret', box(0.04, 0.2, 1.0), side * (t.tw + 0.02), 0.06, 0.3);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', 0.3, [t.tw + 0.01, 0.12, -0.9], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.3, [-(t.tw + 0.01), 0.12, -0.9], -Math.PI / 2);
  // Broad rotor-shield mantlet housing (upper band 1.59..2.19 over z 1.9..3.3
  // world — kept inside the hull-length bound so the gun-overhang mask stays
  // a clean tube) ahead of the M256.
  P.addGunExtra(box(0.9, 0.55, 1.3), 0, 0.17, 2.05);
  P.addGunExtra(box(0.62, 0.46, 0.4), 0, 0.05, 0.25);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.5, collar: true, baseR: 0.14 });
  P.topY = roof + 1.3;
}

// m1a1_aim — bergman print-model oracle: slab body, rising rear deck, low
// flat turret hump, LOW gun (axis 1.28), rear exhaust stack.
const AIM_HULL = {
  halfW: 1.83, nose: 3.52, tail: -4.0,
  deck: [[3.52, 1.31], [3.0, 1.48], [2.0, 1.55], [0.8, 1.64], [-0.5, 1.69], [-1.9, 1.75], [-2.6, 1.86], [-4.0, 1.92]],
  beltTop: 1.0, belly: 0.36, noseBotZ: 2.9, tailBotZ: -3.15,
  skirtTop: 1.05, skirtBot: 0.52,
  trackXc: 1.30, trackW: 0.6, wheelR: 0.40,
  wheelZs: [1.75, 0.99, 0.23, -0.53, -1.29, -2.05, -2.78],
  idlerZ: 2.5, idlerY: 0.62, sprocketZ: -3.3, sprocketY: 0.62,
};

function buildAim(P) {
  const g = AIM_HULL;
  abramsHull(P, g);
  // Rear overhang rack (z -4.0..-4.54, y 0.75..1.8). No antennas — the
  // oracle's whole box tops out at 2.41 (the exhaust stack).
  P.add('hull', box(3.2, 0.95, 0.5), 0, 1.28, -4.28);
  P.add('hullDark', box(3.0, 0.75, 0.06), 0, 1.28, -4.5);
  // Turret: low, wide, flat hump centered z -0.1..-2.4 world (roof 1.89).
  P.turretG.position.set(0, 1.72, -1.15);
  P.gunG.position.set(0, -0.43, 2.75);
  P.add('turret', frustum(1.70, 1.1, -1.3, 1.52, 0.9, -1.2, -0.26, 0.13));
  P.add('turret', frustum(0.6, 2.0, 1.0, 0.5, 1.6, 1.0, -0.35, 0.02)); // gun throat over the deck
  // Flush hatch discs (the print model's roof is nearly featureless).
  P.add('turret', cylY(0.2, 0.2, 0.025, 12), 0.62, 0.12, -0.35);
  P.add('turret', cylY(0.22, 0.22, 0.025, 12), -0.62, 0.12, -0.6);
  P.add('turret', box(0.3, 0.05, 0.3), 0, 0.13, -0.55);
  // Traverse-ring apron plate ahead of the hump (upper-mask sliver z 1.5..1.2).
  P.add('turret', box(1.3, 0.03, 0.55), 0, -0.065, 2.5);
  // Bustle shelf over the rear deck (upper-mask ridge z -3.0..-3.9 @ ~1.9).
  P.add('turret', box(2.8, 0.045, 0.85), 0, 0.2, -2.32);
  // Rear exhaust stack — turret-tagged in the oracle (rides the hump's rear).
  P.add('turret', box(0.32, 0.52, 0.32), 0.42, 0.42, -2.25);
  P.add('turret', box(0.26, 0.06, 0.26), 0.42, 0.7, -2.25);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.28, [1.66, -0.05, -0.4], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.28, [-1.66, -0.05, -0.4], -Math.PI / 2);
  // LOW M256: axis world 1.29, tube y 1.10..1.48, muzzle 4.65 (pivot z 1.60).
  P.addGunExtra(box(0.7, 0.36, 0.5), 0, 0.02, 0.05);
  buildGun(P, { len: 3.05, r: 0.125, sleeve: false, collar: false, baseR: 0.14 });
  P.topY = 1.1;
}

// abramsx — mortavex oracle. Mask split (measured): the yawing turret mask
// holds the angular SHELL band (y ~1.55..2.50, z 2.0..-2.3) plus the gun;
// the RWS/sensor bridge (top ~3.25..3.45, z 1.7..-0.85) and the hull body
// score in the HULL mask (it does not yaw in the asset). Mirrored exactly:
// shell = turret bucket, bridge = hull bucket resting on the shell roof.
const AX_HULL = {
  halfW: 1.83, nose: 3.96, tail: -3.96,
  deck: [[3.96, 1.38], [3.3, 1.44], [2.2, 1.50], [-2.5, 1.53], [-2.6, 1.85], [-3.5, 1.85], [-3.96, 1.58]],
  beltTop: 1.1, belly: 0.30, noseBotZ: 3.3, tailBotZ: -2.85,
  skirtTop: 1.2, skirtBot: 0.42,
  trackXc: 1.32, trackW: 0.6, wheelR: 0.38,
  wheelZs: [2.05, 1.37, 0.69, 0.01, -0.67, -1.35, -2.0],
  idlerZ: 2.5, idlerY: 0.6, sprocketZ: -2.45, sprocketY: 0.68,
};

function buildAbramsX(P) {
  const g = AX_HULL;
  abramsHull(P, g);
  // Blade bow: the oracle's underside sweeps from (3.9, 1.05) back to
  // (3.0, 0.10) — a thin prow under the gun, not a blunt lower plate.
  P.add('hull', slab(
    [-1.55, 1.05, 3.9], [1.55, 1.05, 3.9], [1.55, 0.10, 3.0], [-1.55, 0.10, 3.0],
    [-1.55, 1.38, 3.96], [1.55, 1.38, 3.96], [1.55, 1.46, 3.1], [-1.55, 1.46, 3.1]));
  // RWS / sensor bridge (hull bucket — static in the oracle), resting on the
  // shell roof: body 2.5..3.0, housing to 3.27, head to 3.45 at z -0.5.
  P.add('hull', box(1.05, 0.5, 2.35), 0.08, 2.75, 0.4);
  P.add('hullDetail', box(0.8, 0.3, 1.6), 0.08, 3.12, 0.35);
  P.add('hullDark', box(0.5, 0.2, 0.4), -0.1, 3.16, 1.1);
  P.add('hullGlass', box(0.34, 0.1, 0.02), -0.1, 3.14, 1.31);
  P.add('hullDetail', box(0.4, 0.3, 0.5), 0.05, 3.28, -0.5);
  // Antenna spikes at the rear corners (to ~4.15).
  P.add('hullDetail', box(0.025, 1.7, 0.025), -1.2, 3.3, -1.85, 0, 0, -0.04);
  P.add('hullDetail', box(0.025, 1.5, 0.025), 1.2, 3.2, -1.85, 0, 0, 0.04);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.34, [1.83, 0.8, -0.6], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.34, [-1.83, 0.8, -0.6], -Math.PI / 2);
  // Yawing shell: chamfered lower edge (visible bottom line ~1.73), roof
  // 2.44 drooping to 2.40, sharp front face, tail wedge to 2.20 at -2.35.
  P.turretG.position.set(0, 1.95, -0.39);
  P.gunG.position.set(0, -0.02, 2.59);
  P.add('turret', slab(
    [-1.50, -0.22, 2.10], [1.50, -0.22, 2.10], [1.50, -0.22, -1.66], [-1.50, -0.22, -1.66],
    [-1.36, 0.49, 1.74], [1.36, 0.49, 1.74], [1.36, 0.45, -1.56], [-1.36, 0.45, -1.56]));
  // lower chamfer skirt of the shell (bottom lip tucks inward)
  P.add('turret', slab(
    [-1.28, -0.38, 2.29], [1.28, -0.38, 2.29], [1.28, -0.38, -1.4], [-1.28, -0.38, -1.4],
    [-1.5, -0.2, 2.1], [1.5, -0.2, 2.1], [1.5, -0.2, -1.6], [-1.5, -0.2, -1.6]));
  P.add('turret', slab(
    [-1.4, -0.22, -1.6], [1.4, -0.22, -1.6], [1.4, -0.22, -1.96], [-1.4, -0.22, -1.96],
    [-1.15, 0.28, -1.6], [1.15, 0.28, -1.6], [1.15, 0.22, -1.96], [-1.15, 0.22, -1.96]));
  P.add('turret', box(1.4, 0.07, 0.7), 0, 0.5, -1.0);
  P.add('turret', box(0.6, 0.26, 0.5), 0.55, 0.55, 0.6);
  // XM360: axis world 1.93, muzzle 6.17 (pivot world z 2.20) + shallow
  // under-cradle chin at the mantlet root only (z 2.1..2.7 world).
  P.addGunExtra(box(0.62, 0.4, 0.95), 0, 0.02, 0.15);
  P.addGunExtra(box(0.5, 0.16, 0.6), 0, -0.2, 0.2);
  buildGun(P, { len: 3.97, r: 0.115, sleeve: true, evac: 0.55, collar: true, baseR: 0.15 });
  P.topY = 1.4;
}

// ---------------------------------------------------------------------------
// Profile table
// ---------------------------------------------------------------------------
const A = { ...ABRAMS };

export const ABRAMS_PROFILES = {
  m1a2: { ...A, build: buildSepv3 },
  m1a1: { ...A, build: buildTejasFamily },
  m1a1ha: { ...A, build: buildTejasFamily },
  m1a2_tejas: { ...A, build: buildTejasFamily },
  // TUSK: tejas oracle body is ~0.727 of the tejas targets (modelLoader
  // height-clamp vs real-meter runtime kit — see packet) + ARAT/slat/TIP kit.
  m1a2_tusk: { ...A, build: buildTejasFamily, oracleScale: 0.727, abramsKit: 'tusk' },
  m1a2_sepv2: { ...A, build: buildSepv2 },
  m1a1_aim: { ...A, build: buildAim },
  abramsx: { ...A, build: buildAbramsX },
};
