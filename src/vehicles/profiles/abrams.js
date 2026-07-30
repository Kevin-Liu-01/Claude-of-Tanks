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
// Material buckets (shaded-parity round 2): the LOD mask bug is fixed, so
// detail buckets are mask-safe in BOTH frames. Furniture routes by material:
// *Dark for grilles / recesses / slat mesh / weapon steel, *Rubber for tires,
// mud flaps and skirt lips, *Glass for optics, *Cloth for stowage canvas,
// *Detail for unpainted fittings. Camo stays on the armor shells only.
import { KIT, ABRAMS } from './kit.js';

// KIT is populated by tankFactory.js, which sits on the other side of an
// import cycle with the profile modules — resolve members lazily (call time)
// rather than at module-evaluation time.
const {
  box, cylX, cylY, cylZ, torus, slab, frustum, buildRunningGear, buildGun,
  liftEye, periscope, towCable, headlight,
} = new Proxy({}, { get: (_, name) => (...args) => KIT[name](...args) });

// ---------------------------------------------------------------------------
// Shared Abrams fittings kit (turret-frame parts use detail buckets freely —
// see bucket note above).
// ---------------------------------------------------------------------------

// Deck height at station z (linear interp along the measured deck line).
function deckY(g, z) {
  const d = g.deck;
  for (let i = 0; i < d.length - 1; i++) {
    const [z0, y0] = d[i]; const [z1, y1] = d[i + 1];
    if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) {
      return y0 + (y1 - y0) * ((z - z0) / ((z1 - z0) || 1));
    }
  }
  return d[d.length - 1][1];
}

// z of the swept cheek face at |x| (used to seat launchers ON the plate).
const cheekZ = (t, x) =>
  t.front - (Math.max(0, Math.abs(x) - t.throat) / (t.tw - t.throat)) * (t.front - (t.zWide + 0.15));

// Crew hatch: ring base + seal + lid + hinge + grab bar, optional periscope
// fence around the forward arc (real M1 hatches ride proud rings).
function turretHatch(P, x, y, z, r, fence = 0) {
  P.add('turret', cylY(r, r * 1.08, 0.06, 14), x, y + 0.03, z);
  P.add('turretDark', torus(r * 0.97, 0.016, 18), x, y + 0.066, z);
  P.add('turret', cylY(r * 0.86, r * 0.86, 0.032, 14), x, y + 0.085, z);
  P.add('turretDetail', box(0.09, 0.032, Math.max(0.07, r * 0.5)), x + r * 0.82, y + 0.082, z);
  P.add('turretDetail', box(r * 0.5, 0.018, 0.045), x - r * 0.2, y + 0.108, z);
  for (let k = 0; k < fence; k++) {
    const a = (k - (fence - 1) / 2) * (1.35 / Math.max(fence - 1, 1)) * Math.PI;
    const px = x + Math.sin(a) * r * 1.22, pz = z + Math.cos(a) * r * 1.22;
    P.add('turretDark', box(0.082, 0.052, 0.052), px, y + 0.05, pz, 0, a, 0);
    P.add('turretGlass', box(0.06, 0.024, 0.054), px, y + 0.064, pz, 0, a, 0);
  }
}

// M2 HB on a cradle: receiver, jacketed barrel, grips, pintle, ammo can.
function m2hb(P, x, y, z, s = 1) {
  P.add('turretDark', box(0.1 * s, 0.12 * s, 0.6 * s), x, y, z);
  P.add('turretDark', cylZ(0.022 * s, 0.5 * s, 8), x, y + 0.012 * s, z + 0.52 * s);
  P.add('turretDark', cylZ(0.038 * s, 0.22 * s, 8), x, y + 0.012 * s, z + 0.35 * s);
  P.add('turretDark', box(0.05 * s, 0.05 * s, 0.1 * s), x, y - 0.01 * s, z - 0.34 * s);
  P.add('turretDark', box(0.03 * s, 0.16 * s, 0.05 * s), x, y - 0.12 * s, z + 0.02 * s);
  P.add('turretDetail', box(0.09 * s, 0.15 * s, 0.3 * s), x - 0.15 * s, y - 0.02 * s, z - 0.04 * s);
}

// CROWS RWS: slew ring + pedestal, EO housing with lens plate, elevated M2.
// Massing matches the measured tejas station envelope.
function crowsStation(P, x, yBase, z, s = 1) {
  P.add('turretDetail', cylY(0.19 * s, 0.22 * s, 0.07 * s, 14), x + 0.1 * s, yBase + 0.03 * s, z);
  P.add('turret', cylY(0.13 * s, 0.16 * s, 0.5 * s, 12), x + 0.1 * s, yBase + 0.3 * s, z);
  P.add('turret', box(0.55 * s, 0.55 * s, 0.9 * s), x, yBase + 0.83 * s, z + 0.2 * s);
  P.add('turretDark', box(0.4 * s, 0.3 * s, 0.07 * s), x, yBase + 0.84 * s, z + 0.64 * s);
  P.add('turretGlass', box(0.3 * s, 0.18 * s, 0.02), x, yBase + 0.84 * s, z + 0.685 * s);
  P.add('turretDark', box(0.56 * s, 0.09 * s, 0.5 * s), x, yBase + 0.52 * s, z + 0.15 * s);
  m2hb(P, x + 0.15 * s, yBase + 1.18 * s, z + 0.55 * s, s);
}

// Manual commander's weapon station (M1A1 CWS): vision-block riser drum,
// hatch ring with rail, wrap-around shields, pintle M2. Same envelope as the
// CROWS mass (the shared tejas oracle carries the station either way).
function cwsStation(P, x, yBase, z, s = 1) {
  const zc = z + 0.2 * s;
  P.add('turret', cylY(0.26 * s, 0.3 * s, 0.55 * s, 16), x, yBase + 0.28 * s, zc);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const px = x + Math.sin(a) * 0.24 * s, pz = zc + Math.cos(a) * 0.24 * s;
    P.add('turretDark', box(0.08 * s, 0.06 * s, 0.05 * s), px, yBase + 0.44 * s, pz, 0, a, 0);
    P.add('turretGlass', box(0.058 * s, 0.028 * s, 0.052 * s), px, yBase + 0.455 * s, pz, 0, a, 0);
  }
  P.add('turret', cylY(0.27 * s, 0.27 * s, 0.05 * s, 16), x, yBase + 0.58 * s, zc);
  P.add('turretDark', torus(0.24 * s, 0.018, 18), x, yBase + 0.615 * s, zc);
  P.add('turret', cylY(0.23 * s, 0.23 * s, 0.032, 14), x, yBase + 0.7 * s, zc - 0.26 * s, -1.35, 0, 0);
  for (const side of [-1, 1]) {
    P.add('turret', box(0.05 * s, 0.4 * s, 0.5 * s), x + side * 0.3 * s, yBase + 0.74 * s, zc);
  }
  P.add('turret', box(0.56 * s, 0.34 * s, 0.05 * s), x, yBase + 0.72 * s, zc + 0.27 * s);
  m2hb(P, x, yBase + 1.05 * s, zc + 0.25 * s, s);
}

// Loader's 7.62 on the skate rail around his hatch + shield.
function m240Skate(P, x, y, z, s = 1) {
  P.add('turretDark', torus(0.27 * s, 0.016, 18), x, y + 0.05 * s, z);
  P.add('turretDark', box(0.05 * s, 0.06 * s, 0.08 * s), x + 0.1 * s, y + 0.09 * s, z + 0.22 * s);
  P.add('turretDark', cylY(0.016 * s, 0.016 * s, 0.16 * s, 8), x + 0.1 * s, y + 0.18 * s, z + 0.22 * s);
  P.add('turret', box(0.46 * s, 0.3 * s, 0.04), x + 0.02 * s, y + 0.42 * s, z + 0.3 * s);
  P.add('turretDark', box(0.055 * s, 0.075 * s, 0.42 * s), x + 0.1 * s, y + 0.3 * s, z + 0.05 * s);
  P.add('turretDark', cylZ(0.014 * s, 0.42 * s, 8), x + 0.1 * s, y + 0.31 * s, z + 0.44 * s);
  P.add('turretDetail', box(0.07 * s, 0.1 * s, 0.16 * s), x - 0.02 * s, y + 0.26 * s, z - 0.02 * s);
}

// M250 six-tube smoke bank (2 rows x 3 tubes) on a bracket, seated on the
// cheek plate (the old 3-nub block floated ahead of the swept face).
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
// coax port right of the tube, rotor collar (pitches with the gun). zOff
// shifts the whole kit forward for builds whose trunnion sits deep in the
// embrasure (sepv3) so the mantlet emerges at the turret face.
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

function turretAntenna(P, x, yBase, z, h, lean = 0.06) {
  P.add('turretDetail', box(0.06, 0.12, 0.06), x, yBase + 0.05, z);
  P.add('turretDark', box(0.02, h, 0.02), x, yBase + 0.1 + h / 2, z, 0, 0, Math.sign(x) * lean);
}

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
  // Turbine grille doors: recessed dark exhaust panel + proud louvre blades +
  // hinge frame (IR-suppressed grille — the old blades hid behind the face).
  P.add('hull', box(hw * 1.72, (tailTopY - g.belly) * 0.82, 0.08),
    0, (tailTopY + g.belly) / 2, g.tail + 0.03);
  P.add('hullDark', box(hw * 1.58, (tailTopY - g.belly) * 0.66, 0.03),
    0, (tailTopY + g.belly) / 2, g.tail - 0.02);
  if (P.q) for (let k = 0; k < 6; k++) {
    P.add('hullDetail', box(hw * 1.52, 0.04 * s, 0.028), 0, g.belly + 0.16 * s + k * 0.13 * s, g.tail - 0.035);
  }
  P.add('hullDetail', box(hw * 1.7, 0.05, 0.05), 0, tailTopY - 0.03, g.tail - 0.01);
  // Taillight boxes with brow guards + tank-infantry phone box.
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.15 * s, 0.075 * s, 0.05), side * hw * 0.76, tailTopY - 0.16 * s, g.tail - 0.015);
    P.add('hullDetail', box(0.18 * s, 0.022, 0.07), side * hw * 0.76, tailTopY - 0.1 * s, g.tail - 0.02);
  }
  if (!g.noTip) {
    P.add('hullDark', box(0.2 * s, 0.28 * s, 0.1), hw * 0.52, tailTopY - 0.42 * s, g.tail + 0.1);
    P.add('hullDetail', box(0.22 * s, 0.05, 0.11), hw * 0.52, tailTopY - 0.26 * s, g.tail + 0.1);
  }

  // Engine deck: inset intake grilles + rib rows + fuel caps over the riser.
  if (P.q) {
    const ez = (g.deck[g.deck.length - 3][0] + g.deck[g.deck.length - 2][0]) / 2;
    for (const side of [-1, 1]) {
      P.add('hullDark', box(hw * 0.52, 0.02, 0.72 * s), side * hw * 0.35, deckY(g, ez) + 0.012, ez);
      for (let k = 0; k < 4; k++) {
        P.add('hullDetail', box(hw * 0.48, 0.024, 0.045), side * hw * 0.35, deckY(g, ez) + 0.03, ez + (k - 1.5) * 0.17 * s);
      }
    }
    P.add('hullDetail', cylY(0.07 * s, 0.07 * s, 0.03, 10), hw * 0.62, deckY(g, ez - 0.5 * s) + 0.02, ez - 0.5 * s);
  }

  // Skirts: 7 panels, front panels heavy with a diagonal lead cut, riding at
  // the measured band; panel joints dark, bolts + lift handles per panel,
  // rubber wear lip along the bottom, sponson shadow seam along the top.
  const skirtTop = g.skirtTop;
  const panels = 7;
  const panelD = (g.nose - g.tail - 0.7) / panels;
  for (const side of [-1, 1]) {
    for (let k = 0; k < panels; k++) {
      const heavy = k < 3;
      const th = heavy ? 0.075 : 0.045;
      const z = g.nose - 0.45 - panelD / 2 - k * panelD;
      if (k === 0) {
        // lead panel: front-bottom corner raked up toward the idler
        const x0 = side * (hw - 0.04) - th / 2, x1 = side * (hw - 0.04) + th / 2;
        const zF = z + panelD * 0.485, zR = z - panelD * 0.485;
        const yCut = g.skirtBot + (skirtTop - g.skirtBot) * 0.5;
        P.add('hull', slab(
          [x0, yCut, zF], [x1, yCut, zF], [x1, g.skirtBot, zF - panelD * 0.42], [x0, g.skirtBot, zF - panelD * 0.42],
          [x0, skirtTop, zF], [x1, skirtTop, zF], [x1, skirtTop, zR], [x0, skirtTop, zR]));
        P.add('hull', box(th, skirtTop - g.skirtBot, panelD * 0.55), side * (hw - 0.04), (skirtTop + g.skirtBot) / 2, z - panelD * 0.22);
      } else {
        P.add('hull', box(th, skirtTop - g.skirtBot, panelD * 0.97),
          side * (hw - 0.04), (skirtTop + g.skirtBot) / 2, z);
      }
      if (P.q) {
        P.add('hullDark', box(0.05, (skirtTop - g.skirtBot) * 0.86, 0.016),
          side * (hw - 0.028), (skirtTop + g.skirtBot) / 2, z - panelD / 2);
        P.add('hullDark', box(0.02, 0.02, 0.16 * s), side * (hw - 0.04 + th / 2 + 0.008), skirtTop - 0.14 * s, z);
        for (const f of [-0.28, 0.28]) {
          P.add('hullDetail', cylX(0.016, 0.05, 8), side * (hw - 0.04 + th / 2), skirtTop - 0.05 * s, z + f * panelD);
        }
      }
    }
    P.add('hullRubber', box(0.022, 0.07, g.nose - g.tail - 0.75),
      side * (hw - 0.03), g.skirtBot - 0.03, (g.nose + g.tail) / 2);
    P.add('hullDark', box(0.014, 0.035, g.nose - g.tail - 0.8), side * (hw - 0.02), skirtTop + 0.02, (g.nose + g.tail) / 2);
    // Mud flaps hang from the skirt run's own end planes (the old flaps rode
    // the track centerline half a meter inboard and read as floating plates).
    if (!g.noFrontFlaps && !g.noFlaps) {
      P.add('hullRubber', box(0.34 * s, 0.34 * s, 0.028), side * (hw - 0.05), g.skirtBot - 0.11 * s, g.nose - 0.47, -0.08, 0, 0);
    }
    if (!g.noFlaps) {
      P.add('hullRubber', box(0.34 * s, 0.3 * s, 0.028), side * (hw - 0.05), g.skirtBot - 0.09 * s, g.tail + 0.27, 0.08, 0, 0);
    }
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

  // Glacis furniture: splash board, driver periscope hump, filler caps,
  // headlight pods in brush guards, tow eyes + shackles, lifting eyes.
  const glacisTopZ = g.deck[1][0];
  const boardZ = glacisTopZ + (g.nose - glacisTopZ) * 0.32;
  const boardY = noseTipY + (g.deck[1][1] - noseTipY) * 0.55 + 0.05;
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.8 * s, 0.07, 0.06), side * 0.38 * s, boardY, boardZ, -0.18, side * 0.38, 0);
    P.add('hullDetail', cylY(0.085 * s, 0.085 * s, 0.035, 12), side * 1.1 * s, g.deck[1][1] + 0.02, glacisTopZ - 0.5);
    // headlight pod + drum + brush guard hoop
    P.add('hullDetail', box(0.2 * s, 0.11 * s, 0.12), side * hw * 0.72, noseTipY - 0.12, g.nose - 0.26);
    headlight(P, side * hw * 0.72, noseTipY - 0.1, g.nose - 0.17, -0.12, 0.048 * s);
    P.add('hullDark', box(0.02, 0.15 * s, 0.16), side * (hw * 0.72 - 0.12 * s), noseTipY - 0.1, g.nose - 0.2);
    P.add('hullDark', box(0.02, 0.15 * s, 0.16), side * (hw * 0.72 + 0.12 * s), noseTipY - 0.1, g.nose - 0.2);
    P.add('hullDark', box(0.26 * s, 0.02, 0.16), side * hw * 0.72, noseTipY - 0.02, g.nose - 0.2);
    // tow eye rings at the glacis break + clevis shackles at the toe
    P.add('hullDetail', torus(0.05 * s, 0.015, 12), side * 1.05 * s, boardY - 0.03, boardZ - 0.22);
    P.add('hullDetail', box(0.1 * s, 0.09 * s, 0.1 * s), side * hw * 0.45, noseBotY + (noseTipY - noseBotY) * 0.3, g.noseBotZ + (g.nose - g.noseBotZ) * 0.28, -0.5, 0, 0);
    P.add('hullDark', torus(0.055 * s, 0.017, 12), side * hw * 0.45, noseBotY + (noseTipY - noseBotY) * 0.3 + 0.02, g.noseBotZ + (g.nose - g.noseBotZ) * 0.28 + 0.05, 0.9, 0, 0);
    liftEye(P, 'hullDetail', side * hw * 0.8, tailTopY + 0.02, g.tail + 0.65);
  }
  // Driver's periscope hump with 3 vision blocks at the glacis crest.
  const humpZ = g.periZ ?? (glacisTopZ + 0.1);
  const humpX = g.periX ?? 0;
  const humpY = deckY(g, humpZ);
  P.add('hull', frustum(0.4 * s, humpZ + 0.24 * s, humpZ - 0.2 * s, 0.32 * s, humpZ + 0.14 * s, humpZ - 0.16 * s, humpY - 0.02, humpY + 0.07), humpX, 0, 0);
  for (const px of [-0.2, 0, 0.2]) {
    periscope(P, 'hullDetail', humpX + px * s, humpY + 0.075, humpZ + 0.04 * s);
  }
  const cableApexZ = Math.min(g.nose - 0.35, boardZ + 0.3);
  towCable(P, [[-1.15 * s, boardY - 0.1, cableApexZ], [0, boardY - 0.02, cableApexZ - 0.6],
    [1.15 * s, boardY - 0.1, cableApexZ]]);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.4 * s, [hw + 0.01, (skirtTop + g.skirtBot) / 2 + 0.06, g.nose - 1.2], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.4 * s, [-(hw + 0.01), (skirtTop + g.skirtBot) / 2 + 0.06, g.nose - 1.2], -Math.PI / 2);
  P.decal('hull', 'soot', null, 1.05 * s, [0.65 * s, (tailTopY + g.belly) / 2, g.tail - 0.05], Math.PI);
  P.decal('hull', 'soot', null, 1.05 * s, [-0.65 * s, (tailTopY + g.belly) / 2, g.tail - 0.05], Math.PI);
}

// ---------------------------------------------------------------------------
// Turret: low wide Abrams shell — long welded cheeks reaching far over the
// glacis, near-vertical sides, sloped roof, full-width bustle and slatted
// stowage rack. Local frame: origin at the turret ring.
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

// Bustle stowage rack: rails + posts + dark mesh + strapped duffels. Frame
// corners close on the shell (the old rails overhung the turret corner).
function abramsBustleRack(P, t, s = 1) {
  const tw = t.tw;
  const zr = t.rear;
  const rackD = t.rackDepth ?? 0.42;
  const rkT = t.rackTop;
  const rkB = t.bot + 0.16;
  const zRear = zr - rackD;
  const zMid = zr - rackD / 2;
  for (const y of [rkT, rkB]) {
    P.add('turretDetail', box(tw * 1.72, 0.045, 0.045), 0, y, zRear);
    for (const side of [-1, 1]) P.add('turretDetail', box(0.045, 0.045, rackD), side * tw * 0.85, y, zMid);
  }
  for (const x of [-tw * 0.85, -tw * 0.28, tw * 0.28, tw * 0.85]) {
    P.add('turretDetail', box(0.04, rkT - rkB, 0.04), x, (rkT + rkB) / 2, zRear);
  }
  // dark mesh: floor + rear panel + thin vertical slats over the panel
  P.add('turretDark', box(tw * 1.66, 0.016, rackD * 0.92), 0, rkB + 0.03, zMid);
  P.add('turretDark', box(tw * 1.66, (rkT - rkB) * 0.84, 0.014), 0, (rkT + rkB) / 2, zRear + 0.014);
  if (P.q) for (let k = 0; k < 11; k++) {
    P.add('turretDetail', box(0.02, rkT - rkB, 0.02), -tw * 0.8 + k * (tw * 1.6 / 10), (rkT + rkB) / 2, zRear + 0.032);
  }
  // Packed duffels riding level with the top rail, cinched with dark straps.
  P.add('turretCloth', box(0.72 * s, (rkT - rkB) * 0.8, rackD * 1.5), -tw * 0.5, (rkT + rkB) / 2 + 0.03 * s, zMid + rackD * 0.18);
  P.add('turretCloth', box(0.8 * s, (rkT - rkB) * 0.9, rackD * 1.5), 0.1 * s, (rkT + rkB) / 2 + 0.05 * s, zMid + rackD * 0.18);
  P.add('turretCloth', box(0.55 * s, (rkT - rkB) * 0.65, rackD * 1.4), tw * 0.58, (rkT + rkB) / 2, zMid + rackD * 0.18);
  for (const [x, w] of [[-tw * 0.5, 0.72 * s], [0.1 * s, 0.8 * s]]) {
    for (const f of [-0.27, 0.27]) {
      P.add('turretDark', box(0.024, (rkT - rkB) * 0.93, rackD * 1.52), x + f * w, (rkT + rkB) / 2 + 0.04 * s, zMid + rackD * 0.18);
    }
  }
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

// Roof kit shared by the tejas-oracle family. station: 'crows' (m1a2_tejas,
// m1a2_tusk) or 'cws' (m1a1 / m1a1ha / m1a1_aim manual commander station —
// same measured massing, de-RWSed dressing).
function tejasRoofKit(P, t, s = 1, station = 'crows') {
  const roof = t.roofRear;
  // CITV-position sight/vent drum left-forward (mass present on the oracle).
  P.add('turret', cylY(0.13 * s, 0.15 * s, 0.24 * s, 14), -0.62 * s, t.roofFront + 0.1 * s, 1.05 * s);
  P.add('turret', box(0.26 * s, 0.24 * s, 0.28 * s), -0.62 * s, t.roofFront + 0.32 * s, 1.05 * s);
  P.add('turretDark', box(0.2 * s, 0.1 * s, 0.03), -0.62 * s, t.roofFront + 0.34 * s, 1.19 * s);
  P.add('turretGlass', box(0.16 * s, 0.06 * s, 0.02), -0.62 * s, t.roofFront + 0.34 * s, 1.2 * s);
  // Commander's station left-forward at the measured footprint.
  if (station === 'crows') crowsStation(P, -0.74 * s, t.roofFront + 0.05 * s, 0.55 * s, s);
  else cwsStation(P, -0.74 * s, t.roofFront + 0.05 * s, 0.45 * s, s);
  // Loader's M240 on the skate rail around his hatch, shield forward.
  turretHatch(P, 0.7 * s, roof, -0.35 * s, 0.2 * s, 0);
  m240Skate(P, 0.86 * s, roof + 0.02, -0.3 * s, s);
  // Gunner's primary sight doghouse right-forward: hood + dark aperture.
  P.add('turret', box(0.52 * s, 0.32 * s, 0.58 * s), 0.8 * s, t.roofFront + 0.24 * s, 1.0 * s);
  P.add('turret', box(0.56 * s, 0.06 * s, 0.62 * s), 0.8 * s, t.roofFront + 0.42 * s, 1.0 * s);
  P.add('turretDark', box(0.4 * s, 0.15 * s, 0.04), 0.8 * s, t.roofFront + 0.22 * s, 1.29 * s);
  P.add('turretGlass', box(0.32 * s, 0.09 * s, 0.02), 0.8 * s, t.roofFront + 0.22 * s, 1.315 * s);
  // Commander's hatch (aft of the station), periscope fence.
  turretHatch(P, -0.75 * s, roof, -0.7 * s, 0.24 * s, 5);
  // Blow-off panel bay: plate + etched dark seam outline + center divider.
  P.add('turret', box(1.25 * s, 0.02, 0.95 * s), 0, roof + 0.012, -1.7 * s);
  if (P.q) {
    for (const f of [-1, 1]) {
      P.add('turretDark', box(1.25 * s, 0.014, 0.02), 0, roof + 0.025, (-1.7 + f * 0.46) * s);
      P.add('turretDark', box(0.02, 0.014, 0.95 * s), f * 0.61 * s, roof + 0.025, -1.7 * s);
    }
    P.add('turretDark', box(0.02, 0.014, 0.95 * s), 0, roof + 0.025, -1.7 * s);
  }
  // Wind sensor mast + tip.
  P.add('turretDetail', box(0.03, 0.38 * s, 0.03), -0.3 * s, roof + 0.19 * s, -0.65 * s);
  P.add('turretDark', box(0.05, 0.05, 0.16 * s), -0.3 * s, roof + 0.4 * s, -0.65 * s);
  turretAntenna(P, -1.05 * s, roof, -2.3 * s, 1.55 * s);
  turretAntenna(P, 1.0 * s, roof, -2.0 * s, 1.4 * s);
  // Cheek lifting eyes + cable coil stowed on the left shoulder.
  liftEye(P, 'turretDetail', -t.tw * 0.62, t.roofFront + 0.02, 0.75 * s);
  liftEye(P, 'turretDetail', t.tw * 0.62, t.roofFront + 0.02, 0.75 * s);
  P.add('turretDark', torus(0.13 * s, 0.026, 14), -t.tw * 0.78, t.roofFront + 0.04, -0.15 * s);
  for (const side of [-1, 1]) {
    // Banks ride the measured cheek-corner stations; the bracket spar reaches
    // back into the swept plate so nothing floats.
    smokeBank(P, side * 1.42 * s, 0.38 * s, 1.05 * s, side, s);
    P.add('turretDetail', box(0.05 * s, 0.18 * s, 0.4 * s), side * 1.4 * s, 0.34 * s, 0.82 * s);
    // Sponson stowage rail, boxes and strapped tarp roll along the shell.
    P.add('turretDetail', box(0.04, 0.24 * s, 1.5 * s), side * (t.tw + 0.02), 0.3 * s, -1.4 * s);
    P.add('turretDetail', box(0.06, 0.28 * s, 0.85 * s), side * (t.tw + 0.03), 0.28 * s, -0.5 * s);
    P.add('turretDark', box(0.065, 0.03, 0.85 * s), side * (t.tw + 0.03), 0.42 * s, -0.5 * s);
    P.add('turretCloth', cylZ(0.07 * s, 0.55 * s, 10), side * (t.tw - 0.02), 0.52 * s, -1.9 * s);
    P.add('turretDark', cylZ(0.074 * s, 0.03, 10), side * (t.tw - 0.02), 0.52 * s, -1.9 * s);
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
  let g = s === 1 ? TEJAS_HULL : scaleHull(TEJAS_HULL, s);
  const t = s === 1 ? TEJAS_TURRET : scaleTurret(TEJAS_TURRET, s);
  // TUSK: the runtime kit brings its own real-scale TIP, and the under-scale
  // oracle body carries no mud flaps at these stations — skip the duplicates.
  if (p.abramsKit === 'tusk') g = { ...g, noTip: true, noFlaps: true };
  abramsHull(P, g);
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsTurretShell(P, t);
  abramsBustleRack(P, t, s);
  tejasRoofKit(P, t, s, p.station ?? 'crows');
  abramsMantlet(P, s);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.49, collar: true, baseR: 0.14 * s });
  P.topY = t.roofRear + 1.0 * s;

  if (p.abramsKit === 'tusk') {
    // TUSK kit mirrors the runtime kit stations (docs packet): the kit is
    // full real-vehicle scale even though the oracle body is under-scale.
    const hw = 1.83;
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        const y = row ? 0.89 : 0.59;
        // ARAT: lower course DEAD FLAT at the oracle's ±1.83 widest face (the
        // width-normalization anchor — a leaned course only touched 1.83 at a
        // rounded corner and re-scaled the whole tank), upper course (ARAT-2)
        // gently wedged inside it; dark seam spacers give the tile-array read.
        for (let col = 0; col < 14; col++) {
          P.add('hullDetail', box(0.12, row ? 0.24 : 0.27, 0.31),
            side * (row ? 1.75 : 1.77), y, -2.11 + col * 0.325, 0, 0, row ? side * -0.22 : 0);
          P.add('hullDark', box(0.03, row ? 0.25 : 0.28, 0.05), side * (row ? 1.72 : 1.74), y, -2.273 + col * 0.325, 0, 0, row ? side * -0.22 : 0);
        }
        P.add('hullDark', box(0.07, 0.066, 4.81), side * 1.72, y, 0);
        // standoff arms tying the real-scale rail back to the hull side
        for (const az of [-2.0, -1.0, 0, 1.0, 2.0]) {
          P.add('hullDark', box(0.4, 0.05, 0.05), side * 1.52, y, az);
        }
      }
    }
    // Rear slat cage: rails + posts + slat bars, braced to the hull rear.
    P.add('hullDark', box(3.35, 0.066, 0.066), 0, 1.16, -3.66);
    P.add('hullDark', box(3.35, 0.066, 0.066), 0, 0.86, -3.66);
    for (const x of [-1.62, -1.08, -0.54, 0, 0.54, 1.08, 1.62]) {
      P.add('hullDark', box(0.042, 0.68, 0.042), x, 0.86, -3.66);
    }
    if (P.q) for (let k = 0; k < 3; k++) {
      P.add('hullDark', box(3.3, 0.028, 0.02), 0, 0.64 + k * 0.15, -3.66);
    }
    for (const x of [-1.3, 0, 1.3]) {
      P.add('hullDark', box(0.05, 0.05, 0.85), x, 1.0, -3.24);
    }
    // Tank Infantry Phone on its bracket.
    P.add('hullDark', box(0.45, 0.4, 0.18), 1.34, 1.02, -3.56);
    P.add('hullDetail', box(0.47, 0.06, 0.2), 1.34, 1.26, -3.56);
    P.add('hullDark', box(0.05, 0.05, 0.6), 1.34, 1.02, -3.2);
    // TUSK belly-armor lip: a thin step hugging the lower-plate toe (a deep
    // apron added a front-mask band the oracle kit does not carry).
    P.add('hull', box(1.8, 0.06, 0.35), 0, 0.33, g.noseBotZ + 0.22, -0.16, 0, 0);
    P.add('hullDark', box(1.76, 0.024, 0.024), 0, 0.3, g.noseBotZ + 0.38);
    // Loader's armored gun shield (LAGS, turret local): plates + window.
    P.add('turret', box(0.74, 0.45, 0.05), -0.58, 0.72, 0.32);
    P.add('turret', box(0.05, 0.45, 0.55), -0.94, 0.72, 0.05);
    P.add('turret', box(0.4, 0.42, 0.05), -0.2, 0.7, 0.24, 0, -0.5, 0);
    P.add('turretDark', box(0.3, 0.14, 0.02), -0.58, 0.8, 0.35);
    P.add('turretGlass', box(0.26, 0.1, 0.02), -0.58, 0.8, 0.36);
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
  // Rear bustle-rack overhang past the grille doors (top ~1.8, underside 1.2):
  // rails + posts + dark mesh so it reads as a rack, not a shelf.
  P.add('hullDetail', box(3.0, 0.07, 0.07), 0, 1.76, -3.48);
  P.add('hullDetail', box(3.0, 0.07, 0.07), 0, 1.24, -3.48);
  P.add('hullDark', box(2.9, 0.48, 0.02), 0, 1.5, -3.58);
  for (const x of [-1.45, -0.75, 0, 0.75, 1.45]) {
    P.add('hullDetail', box(0.05, 0.56, 0.26), x, 1.5, -3.48);
  }
  P.add('hullCloth', box(1.1, 0.4, 0.32), -0.6, 1.5, -3.44);
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsTurretShell(P, t);
  const roof = t.roofRear;
  // SEPv3 roof: GPS doghouse on the right cheek (top 2.43 world) with dark
  // aperture, faceted CITV head at z ~1.5 world (top 2.80), CROWS-LP mast.
  P.add('turret', box(0.55, 0.3, 0.7), 0.95, t.roofFront + 0.14, 2.3);
  P.add('turret', box(0.59, 0.06, 0.74), 0.95, t.roofFront + 0.31, 2.3);
  P.add('turretDark', box(0.42, 0.13, 0.04), 0.95, t.roofFront + 0.13, 2.67);
  P.add('turretGlass', box(0.34, 0.08, 0.02), 0.95, t.roofFront + 0.13, 2.69);
  P.add('turret', cylY(0.13, 0.15, 0.3, 14), -0.85, roof + 0.05, 1.75);
  P.add('turret', box(0.3, 0.26, 0.3), -0.85, roof + 0.25, 1.75);
  P.add('turret', frustum(0.17, 0.18, -0.18, 0.13, 0.13, -0.13, roof + 0.38, roof + 0.46), -0.85, 0, 1.75);
  P.add('turretDark', box(0.22, 0.12, 0.03), -0.85, roof + 0.28, 1.91);
  P.add('turretGlass', box(0.17, 0.08, 0.02), -0.85, roof + 0.28, 1.925);
  turretHatch(P, 0.7, roof, -0.15, 0.2, 4);
  turretHatch(P, -0.75, roof, -0.35, 0.24, 6);
  // Boxed electronics + M2 station over the bustle roof (top ~2.85 world).
  P.add('turret', cylY(0.15, 0.18, 0.1, 12), 0.35, roof + 0.05, -0.75);
  P.add('turret', box(0.34, 0.28, 0.4), 0.35, roof + 0.28, -0.75);
  m2hb(P, 0.47, roof + 0.5, -0.6);
  // Bustle roof rack: rail frame + mesh, SEP electronics box and duffels
  // inside (replaces the bare slabs; envelope top ~2.85 world kept).
  P.add('turret', box(1.5, 0.28, 1.1), -0.35, roof + 0.14, -1.6);
  P.add('turretDark', box(1.52, 0.04, 1.12), -0.35, roof + 0.3, -1.6);
  for (const [px, pz] of [[-1.3, -1.1], [-1.3, -2.4], [1.3, -1.1], [1.3, -2.4]]) {
    P.add('turretDetail', box(0.045, 0.42, 0.045), px, roof + 0.21, pz);
  }
  P.add('turretDetail', box(2.65, 0.04, 0.04), 0, roof + 0.42, -1.1);
  P.add('turretDetail', box(2.65, 0.04, 0.04), 0, roof + 0.42, -2.4);
  for (const side of [-1, 1]) P.add('turretDetail', box(0.04, 0.04, 1.34), side * 1.3, roof + 0.42, -1.75);
  P.add('turretDark', box(2.6, 0.3, 0.016), 0, roof + 0.26, -2.39);
  P.add('turretCloth', box(0.85, 0.26, 0.75), 0.65, roof + 0.32, -1.7);
  P.add('turretDark', box(0.03, 0.28, 0.77), 0.65, roof + 0.32, -1.7);
  // Duffels on the bustle roof tail (top ~2.67 world, nothing past -3.0).
  P.add('turretCloth', box(1.2, 0.3, 0.9), -0.2, roof + 0.06, -2.05);
  P.add('turretCloth', box(0.7, 0.2, 0.6), 0.65, roof + 0.02, -2.15);
  P.add('turretDark', box(1.22, 0.28, 0.024), -0.2, roof + 0.06, -2.05);
  // CROWS-LP: mast + slew head with lens plate + M2 (head to 3.92 world).
  P.add('turretDetail', cylY(0.09, 0.12, 0.1, 12), -0.45, roof + 0.36, -1.35);
  P.add('turret', cylY(0.045, 0.045, 1.0, 10), -0.45, roof + 0.86, -1.35);
  P.add('turret', box(0.3, 0.3, 0.34), -0.45, roof + 1.45, -1.35);
  P.add('turretDark', box(0.22, 0.16, 0.04), -0.45, roof + 1.45, -1.17);
  P.add('turretGlass', box(0.17, 0.11, 0.02), -0.45, roof + 1.45, -1.148);
  P.add('turretDark', cylZ(0.02, 0.55, 8), -0.31, roof + 1.48, -1.05);
  P.add('turretDark', box(0.06, 0.1, 0.3), -0.31, roof + 1.42, -1.3);
  P.add('turret', box(1.25, 0.02, 0.95), 0, roof + 0.012, -1.15);
  turretAntenna(P, -0.9, roof, -1.3, 1.35);
  turretAntenna(P, 0.9, roof, -1.3, 1.35);
  for (const side of [-1, 1]) {
    smokeBank(P, side * 1.15, 0.16, cheekZ(t, 1.15) - 0.16, side);
    P.add('turretDetail', box(0.04, 0.24, 1.6), side * (t.tw + 0.02), 0.0, -1.3);
    P.add('turretCloth', cylZ(0.075, 0.6, 10), side * (t.tw - 0.02), 0.26, -1.9);
    P.add('turretDark', cylZ(0.079, 0.03, 10), side * (t.tw - 0.02), 0.26, -1.9);
  }
  liftEye(P, 'turretDetail', -1.05, t.roofFront + 0.02, 1.35);
  liftEye(P, 'turretDetail', 1.05, t.roofFront + 0.02, 1.35);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34, [t.tw + 0.01, 0.15, -1.0], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.34, [-(t.tw + 0.01), 0.15, -1.0], -Math.PI / 2);
  abramsMantlet(P, 1, 0.66, 0.5, 2.0);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.52, collar: true, baseR: 0.15 });
  P.topY = roof + 1.5;
}

// m1a2_sepv2 — recovered oracle with a partially-static upper (see packet).
const SEPV2_HULL = {
  halfW: 1.83, nose: 3.32, tail: -3.32,
  deck: [[3.32, 1.18], [2.4, 1.28], [0.6, 1.38], [-1.4, 1.42], [-2.4, 1.52], [-3.32, 1.60]],
  beltTop: 1.0, belly: 0.30, noseBotZ: 2.75, noseBotY: 0.2, tailBotZ: -2.7,
  skirtTop: 1.1, skirtBot: 0.14, deckInset: 0.1, periX: -0.42,
  trackXc: 1.38, trackW: 0.6, wheelR: 0.38,
  wheelZs: [2.3, 1.53, 0.76, -0.01, -0.78, -1.55, -2.3],
  idlerZ: 2.8, idlerY: 0.62, idlerR: 0.28, sprocketZ: -2.8, sprocketY: 0.62, sprocketR: 0.3,
};
const SEPV2_TURRET = {
  tw: 1.55, throat: 0.58, front: 2.09, zWide: 0.5, rear: -0.65,
  bot: -0.30, roofFront: 0.82, roofRear: 0.87, zRoofPeak: 0.2,
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
  P.add('hullDark', box(2.95, 0.02, 1.4), 0, 1.6, -1.48);
  P.add('hullCloth', box(0.8, 0.42, 1.2), -0.7, 1.62, -1.5);
  P.add('hullCloth', box(0.7, 0.36, 0.9), 0.65, 1.58, -1.3);
  P.add('hullDark', box(0.82, 0.44, 0.03), -0.7, 1.62, -1.0);
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsTurretShell(P, t);
  const roof = t.roofRear;
  // Stepped upper works mirroring the recovered asset, roof pulled down to
  // the measured ~2.4-2.6 band (round-1 board read a full head too tall):
  // front fighting block, low saddle (the static deck rack pokes through the
  // gap), then a separate rear stowage box (2.45 world).
  P.add('turret', slab(
    [-1.4, t.bot, -0.6], [1.4, t.bot, -0.6], [1.4, t.bot, -1.4], [-1.4, t.bot, -1.4],
    [-1.35, -0.1, -0.62], [1.35, -0.1, -0.62], [1.35, -0.1, -1.38], [-1.35, -0.1, -1.38]));
  P.add('turret', box(2.9, 1.02, 1.25), 0, 0.22, -2.0);
  P.add('turretDark', box(2.7, 0.04, 1.1), 0, 0.75, -2.0);
  P.add('turret', box(1.3, 0.22, 1.5), -0.05, roof + 0.09, 1.05);
  P.add('turretDark', box(0.42, 0.13, 0.04), 0.45, roof + 0.1, 1.81);
  P.add('turretGlass', box(0.34, 0.08, 0.02), 0.45, roof + 0.1, 1.83);
  turretHatch(P, 0.66, roof, -0.05, 0.2, 4);
  turretHatch(P, -0.7, roof, -0.35, 0.22, 6);
  // CROWS II on the tall rear-left mast: pedestal, mast, slew head with lens
  // plate, M2 with cradle + ammo box (top ~3.7-3.9 world).
  P.add('turret', cylY(0.16, 0.19, 0.1, 12), -0.5, 0.75, -1.5);
  P.add('turret', cylY(0.055, 0.055, 0.75, 10), -0.5, 1.2, -1.5);
  P.add('turretDetail', cylY(0.1, 0.12, 0.06, 12), -0.5, 1.61, -1.5);
  P.add('turret', box(0.32, 0.3, 0.32), -0.5, 1.78, -1.5);
  P.add('turretDark', box(0.24, 0.17, 0.04), -0.5, 1.78, -1.33);
  P.add('turretGlass', box(0.18, 0.11, 0.02), -0.5, 1.78, -1.31);
  m2hb(P, -0.36, 1.99, -1.42);
  turretAntenna(P, -1.0, 0.75, -1.85, 1.1);
  for (const side of [-1, 1]) {
    smokeBank(P, side * 1.12, 0.5, cheekZ(t, 1.12) - 0.16, side);
    P.add('turretDetail', box(0.04, 0.2, 1.0), side * (t.tw + 0.02), 0.06, 0.3);
  }
  liftEye(P, 'turretDetail', -0.95, roof + 0.01, 1.5);
  liftEye(P, 'turretDetail', 0.95, roof + 0.01, 1.5);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.3, [t.tw + 0.01, 0.12, -0.9], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.3, [-(t.tw + 0.01), 0.12, -0.9], -Math.PI / 2);
  // Broad rotor-shield mantlet housing seated AT the embrasure face (the old
  // slab hung 1.4 m ahead of the face over the glacis and read as a hovering
  // box in the hero and every yaw cell); still inside the hull-length bound
  // so the gun-overhang mask keeps its clean tube.
  P.addGunExtra(box(0.9, 0.44, 0.65), 0, 0.09, 1.42);
  P.addGunExtra(box(0.68, 0.34, 0.34), 0, 0.07, 1.86);
  P.addGunExtraDark(box(0.62, 0.028, 0.028), 0, 0.2, 1.95);
  P.addGunExtraDark(box(0.028, 0.24, 0.028), 0.26, 0.06, 1.98);
  P.addGunExtraDark(cylZ(0.042, 0.16, 10), 0.3, 0.14, 1.9);
  P.addGunExtra(cylZ(0.15, 0.26, 14), 0, 0, 2.06);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.5, collar: true, baseR: 0.14 });
  P.topY = roof + 1.3;
}

// m1a1_aim — bergman print-model oracle. ROUND-2 REBUILD: the round-1
// profile chased the broken reference (sunken-turret print model) and shipped
// a hump buried inside the deck with the gun at axis 1.28 — i.e. no visible
// turret or gun (critique: 0/10 turret character). The packet says the AIM is
// externally an M1A1, so the slab hull / rising deck / rear rack / exhaust
// stack keep their measured stations while the upper works are the canonical
// M1A1 turret + M256 at real proportions. The mask score against the broken
// GLB drops by design — logged in the packet mismatch note.
const AIM_HULL = {
  halfW: 1.83, nose: 3.52, tail: -4.0,
  deck: [[3.52, 1.31], [3.0, 1.48], [2.0, 1.55], [0.8, 1.64], [-0.5, 1.69], [-1.9, 1.75], [-2.6, 1.86], [-4.0, 1.92]],
  beltTop: 1.0, belly: 0.36, noseBotZ: 2.9, tailBotZ: -3.15,
  skirtTop: 1.05, skirtBot: 0.52, periZ: 2.85,
  trackXc: 1.30, trackW: 0.6, wheelR: 0.40,
  wheelZs: [1.75, 0.99, 0.23, -0.53, -1.29, -2.05, -2.78],
  idlerZ: 2.5, idlerY: 0.62, sprocketZ: -3.3, sprocketY: 0.62,
};
const AIM_TURRET = {
  tw: 1.70, throat: 0.60, front: 1.95, zWide: 0.12, rear: -3.0,
  bot: -0.18, roofFront: 0.60, roofRear: 0.82, zRoofPeak: -0.9,
  rackTop: 0.94, rackDepth: 0.40,
  ring: [0, 1.70, -0.5], gun: [0, 0.30, 1.52], gunLen: 3.68, gunR: 0.09,
};

function buildAim(P) {
  const g = AIM_HULL;
  const t = AIM_TURRET;
  abramsHull(P, g);
  // Rear overhang rack (z -4.0..-4.54, y 0.75..1.8): rails + posts + dark
  // mesh + strapped bundle (was a solid box + plate).
  P.add('hullDetail', box(3.2, 0.07, 0.07), 0, 1.76, -4.27);
  P.add('hullDetail', box(3.2, 0.07, 0.07), 0, 0.82, -4.27);
  P.add('hullDark', box(3.1, 0.92, 0.02), 0, 1.29, -4.5);
  for (const x of [-1.5, -0.75, 0, 0.75, 1.5]) {
    P.add('hullDetail', box(0.05, 0.94, 0.05), x, 1.29, -4.27);
    P.add('hullDetail', box(0.05, 0.05, 0.5), x, 1.86, -4.22);
  }
  P.add('hullCloth', box(2.1, 0.5, 0.34), -0.3, 1.42, -4.24);
  P.add('hullDark', box(0.024, 0.52, 0.36), -1.0, 1.42, -4.24);
  P.add('hullDark', box(0.024, 0.52, 0.36), 0.4, 1.42, -4.24);
  // Rear exhaust stack on the deck (hull frame — the oracle turret-tags it,
  // but a chimney orbiting the turret at yaw is exactly the round-1 bug
  // class; stationed at the measured z -3.3..-3.6, top 2.43).
  P.add('hull', box(0.4, 0.1, 0.4), 0.55, 1.94, -3.35);
  P.add('hull', box(0.32, 0.42, 0.32), 0.55, 2.18, -3.35);
  P.add('hullDetail', box(0.36, 0.06, 0.36), 0.55, 2.4, -3.35);
  P.add('hullDark', box(0.24, 0.03, 0.24), 0.55, 2.44, -3.35);
  // Canonical M1A1 turret + M256 (packet: externally an M1A1).
  P.turretG.position.set(t.ring[0], t.ring[1], t.ring[2]);
  P.gunG.position.set(t.gun[0], t.gun[1], t.gun[2]);
  abramsTurretShell(P, t);
  abramsBustleRack(P, t, 1);
  tejasRoofKit(P, t, 1, 'cws');
  abramsMantlet(P, 1);
  buildGun(P, { len: t.gunLen, r: t.gunR, sleeve: true, evac: 0.52, collar: true, baseR: 0.14 });
  P.topY = t.roofRear + 1.0;
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
  skirtTop: 1.2, skirtBot: 0.42, noFrontFlaps: true, periZ: 2.95,
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
  // Sharp splitter undercut below the nose tip.
  P.add('hullDark', box(2.9, 0.035, 0.035), 0, 1.04, 3.86);
  P.add('hull', box(2.6, 0.05, 0.5), 0, 0.86, 3.62, -0.32, 0, 0);
  // Hybrid-drive louver panels on the raised rear deck.
  if (P.q) for (const side of [-1, 1]) {
    P.add('hullDark', box(1.05, 0.02, 0.75), side * 0.68, 1.862, -3.05);
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', box(1.0, 0.024, 0.05), side * 0.68, 1.878, -2.78 - k * 0.14);
    }
  }
  // RWS / sensor bridge (hull bucket — static in the oracle), resting on the
  // shell roof: body 2.5..3.0, XM914 housing to 3.27, sensor head to 3.45.
  P.add('hull', box(1.05, 0.5, 2.35), 0.08, 2.75, 0.4);
  P.add('hullDetail', cylY(0.3, 0.34, 0.1, 16), 0.08, 3.0, 0.75);
  P.add('hullDetail', box(0.8, 0.3, 1.6), 0.08, 3.12, 0.35);
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.05, 0.26, 0.6), 0.08 + side * 0.32, 3.12, 0.85);
  }
  // 30 mm XM914: stepped barrel from the cradle, muzzle ring.
  P.add('hullDark', cylZ(0.05, 0.4, 10), 0.08, 3.08, 1.35);
  P.add('hullDark', cylZ(0.032, 1.0, 10), 0.08, 3.08, 1.98);
  P.add('hullDark', cylZ(0.045, 0.09, 10), 0.08, 3.08, 2.46);
  P.add('hullDark', box(0.16, 0.14, 0.5), 0.08, 3.0, 1.15);
  // sensor head + lens (kept), dark face ring
  P.add('hullDark', box(0.5, 0.2, 0.4), -0.1, 3.16, 1.1);
  P.add('hullGlass', box(0.34, 0.1, 0.02), -0.1, 3.14, 1.31);
  P.add('hullDetail', box(0.4, 0.3, 0.5), 0.05, 3.28, -0.5);
  P.add('hullDark', box(0.3, 0.2, 0.04), 0.05, 3.28, -0.24);
  P.add('hullGlass', box(0.24, 0.14, 0.02), 0.05, 3.28, -0.22);
  // Faceted corner sensor pods flanking the bridge (front-view slopes
  // 2.55..2.80 at x ±1.3..1.6; kept above the yawing shell's swing).
  for (const side of [-1, 1]) {
    P.add('hull', slab(
      [side * 1.24, 2.62, 1.25], [side * 1.58, 2.62, 1.25], [side * 1.58, 2.62, 0.35], [side * 1.24, 2.62, 0.35],
      [side * 0.6, 2.82, 1.15], [side * 0.98, 2.82, 1.15], [side * 0.98, 2.82, 0.45], [side * 0.6, 2.82, 0.45]));
    P.add('hullDark', box(0.2, 0.08, 0.03), side * 1.35, 2.7, 1.26, 0, 0, side * 0.3);
  }
  // Antenna spikes on hull-deck base pods at the rear corners (to ~4.1),
  // stationed outside the shell's yaw sweep (the old rods floated mid-air).
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.1, 0.18, 0.1), side * 1.5, 1.92, -2.85);
    P.add('hullDark', box(0.025, 2.2, 0.025), side * 1.5, 3.1, -2.85, 0, 0, side * -0.03);
  }
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
  P.add('turret', box(0.55, 0.2, 0.45), 0.55, 0.52, 0.6);
  P.add('turretDark', box(0.3, 0.1, 0.03), 0.55, 0.54, 0.84);
  // shell panel seams + tie-downs so the wedge reads faceted, not extruded
  if (P.q) {
    for (const side of [-1, 1]) {
      P.add('turretDark', box(0.02, 0.55, 0.02), side * 1.41, 0.12, 1.9, -0.35, 0, 0);
      P.add('turretDark', box(0.02, 0.02, 3.4), side * 1.44, 0.4, 0.05);
      P.add('turretDetail', box(0.24, 0.03, 0.03), side * 0.9, 0.52, -0.4);
      P.add('turretDetail', box(0.24, 0.03, 0.03), side * 0.9, 0.52, 0.6);
    }
  }
  // XM360: axis world 1.93, muzzle 6.17 (pivot world z 2.20) + shallow
  // under-cradle chin at the mantlet root only (z 2.1..2.7 world).
  P.addGunExtra(box(0.62, 0.4, 0.95), 0, 0.02, 0.15);
  P.addGunExtra(box(0.5, 0.16, 0.6), 0, -0.2, 0.2);
  P.addGunExtraDark(box(0.52, 0.03, 0.03), 0, 0.14, 0.62);
  P.addGunExtraDark(cylZ(0.04, 0.16, 10), 0.24, 0.1, 0.6);
  buildGun(P, { len: 3.97, r: 0.115, sleeve: true, evac: 0.55, collar: true, baseR: 0.15 });
  // XM360 angular thermal shroud + pepperpot muzzle device over the tube tip.
  P.add('gun', box(0.27, 0.27, 0.55), 0, 0, 3.06);
  P.add('gun', box(0.27, 0.27, 0.55), 0, 0, 3.06, 0, 0, Math.PI / 4);
  P.add('gunDark', cylZ(0.125, 0.3, 12), 0, 0, 3.79);
  P.add('gun', cylZ(0.14, 0.1, 12), 0, 0, 3.62);
  P.add('gunDark', torus(0.1, 0.02, 12), 0, 0, 3.93, Math.PI / 2, 0, 0);
  P.topY = 1.4;
}

// ---------------------------------------------------------------------------
// Profile table
// ---------------------------------------------------------------------------
const A = { ...ABRAMS };

export const ABRAMS_PROFILES = {
  m1a2: { ...A, build: buildSepv3 },
  m1a1: { ...A, build: buildTejasFamily, station: 'cws' },
  m1a1ha: { ...A, build: buildTejasFamily, station: 'cws' },
  m1a2_tejas: { ...A, build: buildTejasFamily, station: 'crows' },
  // TUSK: tejas oracle body is ~0.727 of the tejas targets (modelLoader
  // height-clamp vs real-meter runtime kit — see packet) + ARAT/slat/TIP kit.
  m1a2_tusk: { ...A, build: buildTejasFamily, oracleScale: 0.727, abramsKit: 'tusk', station: 'crows' },
  m1a2_sepv2: { ...A, build: buildSepv2 },
  m1a1_aim: { ...A, build: buildAim },
  abramsx: { ...A, build: buildAbramsX },
};
