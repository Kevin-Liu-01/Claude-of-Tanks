// Soviet/Russian modern family procedural profiles (fidelity oracles:
// t80u_javanilga, t90m_minehffd, recovered T-62/T-64/T-72/T-90 variants).
// Owned by the Russia-modern family agent.
//
// 2026-07-30 rebuild: every tank in this family is a STANDALONE profile with
// a local family hull builder, sized from width-normalized probe
// measurements of its own local reference GLB (docs/references/tanks/*.md).
// The former {base:'t72b3'|'t90m', kit} donor rows were converted because the
// canonical donors' fixed turret/gun geometry capped the fidelity gates
// (family-map entries override the global builder for these ids).
//
// Shaded-parity round 2 (docs/critique/shaded-parity-r1.md): front-arc ERA
// rafts/clamshells/tile fields instead of the midline "necklace", Shtora
// eyes, 2A46/U-5TS bore evacuators + sleeve clamps, glacis kit (splash
// board, tow hooks, periscope hump), NSVT pintles, re-seated logs/snorkels
// with brackets, welded t90sm turret, per-tank wheel styles, and the track
// band pulled inboard so its rust edge can no longer clip through the
// coplanar skirt panels.
//
// Coordinate convention: several recovered GLBs are normalized on their
// OVERALL bounding box (long 125 mm gun included), so their hull sits well
// aft of the origin. p.zC bakes that same offset into our geometry so the
// raw-frame component masks (gun overhang especially) line up. A group-level
// shift cannot do this: the swapped-in reference GLB seats under the same
// rig groups and would inherit it. Everything is an original primitive
// construction — measured dimensions only, no source topology.
import { KIT, SOVIET, evenStations, addEra } from './kit.js';

// NOTE: KIT bindings are only dereferenced inside build-time functions —
// never at module scope — because of the tankFactory extension-module cycle.

// Segmented side skirts with a DARK, inset bottom lip. The shared kit
// helper's 'hullRubber' lip presented a thin sunlit top face that rendered
// as the salmon "rust stripe" along the fender line in every shaded board
// (shaded-parity r1, materials bullet) — local version keeps the panel
// seams but drops the lip into shadow material with no exposed top face.
function ruSkirts(P, width, length, y, height, panels = 6) {
  const { box } = KIT;
  const panelD = length / panels;
  for (const side of [-1, 1]) {
    for (let i = 0; i < panels; i++) {
      const z = length / 2 - panelD / 2 - i * panelD;
      P.add('hull', box(0.045, height, panelD * 0.96), side * width / 2, y, z);
      P.add('hullDark', box(0.052, height * 0.90, 0.018), side * (width / 2 + 0.004), y, z - panelD / 2);
    }
    P.add('hullDark', box(0.046, 0.10, length * 0.98), side * (width / 2 + 0.001), y - height / 2 - 0.028, 0);
  }
}

// Proxy that shifts every HULL-frame bucket add by zC (turret/gun buckets
// pass through). Lets the centered kit helpers (skirts, era, fenders,
// stowage...) land in the reference's aft-biased frame.
function zShift(P, zC) {
  if (!zC) return P;
  const S = Object.create(P);
  S.add = (bucket, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) =>
    P.add(bucket, geo, x, y, bucket.startsWith('hull') ? z + zC : z, rx, ry, rz, s);
  return S;
}

// ---------------------------------------------------------------------------
// Family hull: low Soviet hull with HIGH nose (oracle glacis tips sit at
// 82-90% of deck height), flat full-length deck, rear deck plate, segmented
// skirts and 5/6-wheel rear-sprocket running gear. All stations get +zC.
// ---------------------------------------------------------------------------
function buildRuHull(P, p) {
  const { box, cylY, cylZ, torus, frustum, buildRunningGear, fenders, headlight, towCable, periscope } = KIT;
  const zC = p.zC || 0;
  const S = zShift(P, zC);
  const width = p.width, length = p.hullLength, halfL = length / 2;
  const roofY = p.roofY;
  const noseY = p.noseY ?? roofY - 0.20;
  const trackTop = p.trackTop || roofY * 0.59;
  const trackW = p.trackW;
  const innerW = Math.max(width - trackW * 1.95, width * 0.58);
  const lowerH = Math.max(0.46, trackTop * 0.76);

  // Body: belly box, sponson band, near-vertical bow to noseY, glacis wedge
  // up to the deck line, raked stern with full-height rear deck.
  S.add('hull', box(innerW, lowerH, length * 0.91), 0, 0.22 + lowerH / 2, 0);
  fenders(S, innerW / 2, width / 2 + 0.02, Math.min(roofY - 0.16, trackTop + 0.25), -halfL * 0.96, halfL * 0.94, 0.025);
  S.add('hull', box(width * 0.86, roofY - trackTop, length * 0.62), 0, trackTop + (roofY - trackTop) / 2, -halfL * 0.17);
  S.add('hull', frustum(width * 0.46, halfL * 0.985, halfL * 0.55, width * 0.46, halfL * 0.965, halfL * 0.55, 0.30, noseY - 0.04));
  S.add('hull', frustum(width * 0.46, halfL * 0.975, halfL * 0.38, width * 0.43, halfL * 0.54, halfL * 0.38, noseY - 0.06, roofY));
  S.add('hull', frustum(width * 0.40, halfL * 0.78, halfL * 0.985, width * 0.46, halfL * 0.985, halfL * 0.985, 0.31, trackTop * 0.96));
  S.add('hull', box(width * 0.84, 0.26, length * 0.20), 0, roofY - 0.13, -halfL * 0.85);
  S.add('hull', box(width * 0.82, Math.max(0.30, roofY - trackTop), 0.10), 0, trackTop + (roofY - trackTop) / 2, -halfL * 0.96);
  if (p.era) addEra(S, width, halfL * 0.60, Math.min(roofY + 0.02, noseY + 0.24), p.eraRows || 2);

  // Glacis kit (shaded-parity r1 bullet 6): V splash board across the plate,
  // tow hooks at the lower bow, driver periscope hump at the glacis top.
  for (const s of [-1, 1]) {
    S.add('hullDetail', box(width * 0.24, 0.045, 0.05), s * width * 0.115, noseY + (roofY - noseY) * 0.45, halfL * 0.70, -0.35, s * 0.22, 0);
    S.add('hullDark', box(0.10, 0.12, 0.14), s * width * 0.24, noseY - 0.38, halfL * 0.945, -0.3, 0, 0);
  }
  S.add('hull', box(0.44, 0.09, 0.30), 0, roofY + 0.03, halfL * 0.48, -0.18, 0, 0);
  periscope(S, 'hullDetail', -0.16, roofY + 0.09, halfL * 0.44);
  periscope(S, 'hullDetail', 0.16, roofY + 0.09, halfL * 0.44);

  // Deck furniture: driver hatch + periscopes, transverse engine grilles,
  // right-fender fuel/stowage run, left snorkel/exhaust tube.
  S.add('hull', cylY(0.25, 0.25, 0.045, 16), 0, roofY + 0.03, halfL * 0.30);
  for (const x of [-0.18, 0, 0.18]) S.add('hullDark', box(0.12, 0.055, 0.05), x, roofY + 0.06, halfL * 0.38);
  for (let i = 0; i < 6; i++) {
    S.add('hullDark', box(width * 0.42, 0.020, 0.075), 0, roofY + 0.035, -halfL * (0.36 + i * 0.075));
    S.add('hullDetail', box(width * 0.42, 0.030, 0.028), 0, roofY + 0.05, -halfL * (0.375 + i * 0.075));
  }
  S.add('hull', box(0.34, 0.16, length * 0.30), width * 0.38, roofY - 0.02, -halfL * 0.10);
  for (const zf of [0.02, -0.22, -0.46]) S.add('hullDark', box(0.36, 0.02, 0.03), width * 0.38, roofY + 0.07, halfL * zf * 2 * 0.5 - halfL * 0.10 + halfL * zf * 0);
  S.add('hullDark', cylZ(0.075, length * 0.23, 10), -width * 0.37, roofY + 0.07, -halfL * 0.24, Math.PI / 2, 0, 0);
  if (p.exhaustLeft) S.add('hullDark', box(0.16, 0.10, 0.55), -width * 0.44, roofY + 0.02, -halfL * 0.62);
  for (let i = 0; i < 4; i++) S.add('hullDetail', box(width * 0.46, 0.025, 0.045), 0, roofY + 0.04, halfL * (0.78 - i * 0.075));

  // Tow eyes, headlights with brush-guard brackets, cable.
  for (const side of [-1, 1]) S.add('hullDetail', torus(0.09, 0.018, 10), side * width * 0.27, 0.48, halfL * 0.94, Math.PI / 2, 0, 0);
  headlight(S, -width * 0.35, noseY + 0.06, halfL * 0.86, -0.30, 0.05);
  headlight(S, width * 0.35, noseY + 0.06, halfL * 0.86, -0.30, 0.05);
  for (const s of [-1, 1]) S.add('hullDetail', box(0.16, 0.03, 0.16), s * width * 0.35, noseY + 0.145, halfL * 0.86);
  towCable(S, [[-width * 0.34, roofY - 0.10, halfL * 0.70], [0, roofY + 0.01, halfL * 0.44], [width * 0.34, roofY - 0.10, halfL * 0.70]]);

  // Front + rear rubber mud flaps over the track runs — every oracle in the
  // family shows them as full-height corner tabs.
  for (const side of [-1, 1]) {
    const xf = side * (width / 2 - trackW / 2 - 0.01);
    S.add('hullRubber', box(trackW + 0.02, 0.40, 0.05), xf, noseY - 0.26, halfL * 0.98);
    S.add('hullRubber', box(trackW + 0.02, 0.40, 0.05), xf, Math.max(0.48, trackTop * 0.68), -halfL * 0.985);
  }

  // Running gear (rear sprocket) + skirts, all stations in the zC frame.
  // xc pulls 4.5 cm inboard of the skirt plane: the cast track band's outer
  // face used to be exactly coplanar with the skirt panels and its rust edge
  // clipped through as an orange stripe at the fender line (r1 bullet 2).
  const wheelCount = p.wheels || 6;
  const wheelR = p.wheelR || Math.min(0.40, length / (wheelCount * 3.2));
  const wheelSpan = p.wheelSpan || length * 0.72;
  const wheelZs = (p.wheelZsRel ? p.wheelZsRel.slice() : evenStations(wheelCount, wheelSpan, p.wheelBias || 0)).map((z) => z + zC);
  const xc = width / 2 - trackW / 2 - 0.045;
  buildRunningGear(P, {
    style: p.wheelStyle || 'rubber', wheelR, wheelW: Math.min(0.22, trackW * 0.36),
    wheelY: p.wheelY || wheelR + 0.09, xc, wheelZs, dishR: p.dishR ?? 0.84,
    sprocket: { z: -halfL * 0.85 + zC, y: wheelR + 0.10, r: wheelR * 0.88 },
    idler: { z: halfL * 0.85 + zC, y: wheelR + 0.08, r: wheelR * 0.84 },
    rollers: evenStations(p.rollers || 3, wheelSpan * 0.68, zC).map((z) => ({ z, y: trackTop * 0.84, r: wheelR * 0.23 })),
    trackW, topY: trackTop * 0.86, botY: p.botY ?? 0.075, paintedEnds: true,
    coveredTop: p.skirts !== false, arms: p.arms !== false,
  });
  if (p.skirts !== false) {
    ruSkirts(S, width, p.skirtLength ?? length * 0.84, p.skirtY ?? trackTop * 0.72,
      p.skirtHeight ?? trackTop * 0.60, p.skirtPanels || wheelCount);
    for (const side of [-1, 1]) for (let i = 0; i < wheelCount; i++) {
      const z = length * 0.36 - i * (length * 0.72 / Math.max(1, wheelCount - 1));
      S.add('hullDark', cylZ(0.022, 0.018, 8), side * (width / 2 + 0.035), trackTop * 0.78, z, 0, side * Math.PI / 2, 0);
    }
  }
  return { width, length, halfL, roofY, trackTop };
}

// Local dome turret + gun: same furniture set as the shared kit path, but
// with a tunable lathe profile. The oracles' Soviet domes carry FULLER
// shoulders and flatter crowns than the generic kit dome (which tapers to
// 0.40 r) — domeShoulder/domeCrown/crownCap set the fraction of the plan
// radius kept at 75%/96% height and an optional flat roof plate.
// p.turretStyle 'welded' (t90sm) swaps the lathe for a faceted flat-sided
// prism — the MS is a welded turret and the cast dome read as the wrong
// family (shaded-parity r1).
function ruTurretAndGun(P, p) {
  const { box, cylY, cylZ, lathe, polyTurret, slab, buildGun, cupola, periscope, smokeCluster } = KIT;
  const r = p.turretWidth / 2, h = p.turretHeight;
  const sz = p.turretDepth / p.turretWidth;
  if (p.turretStyle === 'welded') {
    const f = p.turretDepth / 2, b = -p.turretDepth / 2;
    P.add('turret', polyTurret([
      [-r * 0.14, f], [r * 0.14, f], [r * 0.62, f * 0.66], [r, f * 0.16],
      [r * 0.96, b * 0.62], [r * 0.72, b], [-r * 0.72, b], [-r * 0.96, b * 0.62],
      [-r, f * 0.16], [-r * 0.62, f * 0.66],
    ], h, 1.03, 0.90));
    for (const s of [-1, 1]) {
      const inner = s * r * 0.15, outer = s * r;
      P.add('turret', slab(
        [inner, 0.03, f], [outer, 0.03, f * 0.18], [outer, 0.03, -0.2], [inner, 0.03, f * 0.62],
        [inner, h * 0.8, f * 0.60], [outer * 0.9, h * 0.66, f * 0.05], [outer * 0.9, h * 0.72, -0.3], [inner, h * 0.9, f * 0.4]));
    }
  } else {
    const sh = p.domeShoulder ?? 0.88, cr = p.domeCrown ?? 0.55;
    P.add('turret', lathe([
      [r * 0.84, 0], [r, 0.10], [r * 0.97, h * 0.42], [r * sh, h * 0.75],
      [r * cr, h * 0.96], [0.02, h],
    ], 28, sz));
    if (p.crownCap) P.add('turret', box(r * 2 * p.crownCap, 0.10, r * 2 * p.crownCap * sz * 0.9), 0, h - 0.03, 0);
  }
  cupola(P, 'turret', p.commanderX ?? p.turretWidth * 0.20, h, p.commanderZ ?? -p.turretDepth * 0.20,
    p.cupolaR ?? 0.30, p.cupolaH ?? 0.10, p.cupolaPeriscopes ?? 6);
  P.add('turret', cylY(0.19, 0.19, 0.035, 14), -p.turretWidth * 0.20, h + 0.02, -p.turretDepth * 0.16);
  P.add('turretDark', cylY(0.145, 0.145, 0.012, 12), -p.turretWidth * 0.20, h + 0.045, -p.turretDepth * 0.16);
  periscope(P, 'turretDetail', p.sightX ?? p.turretWidth * 0.20, h + 0.06, p.turretFront * 0.28);
  if (p.pano) {
    P.add('turretDetail', box(0.16, 0.19, 0.16), p.panoX ?? 0.32, h + 0.10, -p.turretDepth * 0.20);
    P.add('turretDark', cylY(0.12, 0.12, 0.17, 12), p.panoX ?? 0.32, h + 0.27, -p.turretDepth * 0.20);
  }
  if (p.smoke !== false) {
    smokeCluster(P, p.turretWidth * 0.43, h * 0.52, 0.15, 4, 1.12, 0.55);
    smokeCluster(P, -p.turretWidth * 0.43, h * 0.52, 0.15, 4, -1.12, 0.55);
  }
  if (p.mg) nsvt(P, p.commanderX ?? p.turretWidth * 0.20, h + 0.06, -p.turretDepth * 0.20 - 0.34, p.mgShield);
  if (p.antennas !== false) for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.022, 0.48, 0.022), side * p.turretWidth * 0.34, h + 0.24, p.turretRear * 0.78, 0, 0, side * 0.08);
  }
  P.addGunExtra(box(p.mantletWidth || 0.48, p.mantletHeight || 0.44, 0.24), 0, 0.01, p.turretFront * 0.62);
  P.addGunExtra(cylZ(Math.max(0.10, (p.gunRadius || 0.10) * 1.55), 0.28, 14), 0, 0, p.turretFront * 0.82);
  // 2A46 family tube: bore-evacuator bulge in the bare gap BETWEEN the two
  // thermal-sleeve segments (0.46-0.52 of tube) so the bulge reads as its
  // own fitting; evacR 1.9 — the 1.62 default vanished inside the sleeve.
  buildGun(P, {
    len: p.gunLength, r: p.gunRadius || 0.10,
    sleeve: p.sleeve !== false,
    evac: Object.hasOwn(p, 'evac') ? p.evac : 0.49, evacR: p.evacR ?? 1.9,
    collar: true, baseR: p.gunBaseR ?? Math.max(0.12, (p.gunRadius || 0.10) * 1.7),
  });
  P.topY = h + (p.pano ? 0.46 : 0.25);
}

// Family build: local hull + local dome turret/gun + per-tank extras.
function buildRu(P, p) {
  const zC = p.zC || 0;
  buildRuHull(P, p);
  P.turretG.position.set(p.turretPivotX || 0, p.turretPivotY ?? p.roofY, (p.turretPivotZ || 0) + zC);
  P.gunG.position.set(p.gunX || 0, p.gunY ?? p.turretHeight * 0.43, p.gunZ || 0);
  ruTurretAndGun(P, p);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25,
    [p.turretWidth / 2 * 0.90, p.turretHeight * 0.34, -p.turretDepth * 0.24], Math.PI / 2);
  if (p.extras) p.extras(zShift(P, zC), p);
}

// ---------------------------------------------------------------------------
// Shared Soviet-family furniture (hull frame unless noted)
// ---------------------------------------------------------------------------

// NSVT/DShK pintle with a real cradle, receiver, finned barrel and ammo box
// (r1 bullet 8: "AA MGs are stick-blocks on posts") — turret frame.
function nsvt(P, x, y, z, shield = false) {
  const { box, cylY, cylZ } = KIT;
  P.add('turretDark', cylY(0.025, 0.032, 0.16, 8), x, y + 0.08, z);          // pintle post
  P.add('turretDark', box(0.10, 0.06, 0.16), x, y + 0.19, z);                // cradle yoke
  P.add('turretDark', box(0.09, 0.10, 0.42), x, y + 0.27, z + 0.06);         // receiver
  P.add('turretDark', cylZ(0.024, 0.55, 8), x, y + 0.28, z + 0.50, -0.06, 0, 0); // barrel
  P.add('turretDark', cylZ(0.035, 0.10, 8), x, y + 0.295, z + 0.76, -0.06, 0, 0); // flash hider
  P.add('turretDetail', box(0.09, 0.11, 0.16), x - 0.11, y + 0.24, z - 0.04); // ammo box
  if (shield) P.add('turretDetail', box(0.34, 0.22, 0.025), x, y + 0.30, z + 0.20);
}

// Two 200 L fuel drums on rear brackets (axis fore-aft) + rack rail.
function fuelDrums(P, x, y, z, r = 0.19, len = 0.85) {
  const { box, cylZ } = KIT;
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(r, len, 12), s * x, y, z);
    P.add('hullDark', cylZ(r * 1.03, 0.03, 12), s * x, y, z + len * 0.28);
    P.add('hullDark', cylZ(r * 1.03, 0.03, 12), s * x, y, z - len * 0.26);
    P.add('hullDark', box(0.05, 0.34, 0.06), s * x, y - 0.17, z + 0.10);
  }
  P.add('hullDetail', box(x * 2 + r * 1.4, 0.035, 0.035), 0, y - 0.30, z);
}

// Unditching log strapped to the LOWER rear plate (r1: the deck-level log
// read as a tan tube lying on the engine deck) — brackets + strap rings.
function unditchLog(P, y, z, halfW, r = 0.13) {
  const { box, cylX } = KIT;
  P.add('hullWood', cylX(r, halfW * 2, 10), 0, y, z);
  for (const s of [-0.55, 0.55]) {
    P.add('hullDark', cylX(r * 1.07, 0.045, 10), s * halfW, y, z);
    P.add('hullDark', box(0.05, r * 2.3, 0.06), s * halfW, y + 0.02, z + r * 0.7);
  }
}

// OPVT deep-wading snorkel stowed transversely on rear-deck brackets.
function deckSnorkel(P, y, z, halfW, r = 0.14) {
  const { box, cylX } = KIT;
  P.add('hullDark', cylX(r, halfW * 2, 10), 0, y, z);
  P.add('hullDark', cylX(r * 0.7, 0.3, 8), halfW + 0.14, y, z);
  for (const s of [-0.5, 0.5]) P.add('hullDetail', box(0.06, r * 1.6, 0.08), s * halfW, y - r * 0.5, z);
}

// Thin roof mast (met mast / antenna base / pano tower stem) — turret frame.
function mast(P, x, yBase, z, yTop, r = 0.028, head = 0.11) {
  const { box } = KIT;
  const h = Math.max(0.05, yTop - yBase);
  P.add('turretDetail', box(r * 2, h, r * 2), x, yBase + h / 2, z);
  P.add('turretDark', box(head, head, head), x, yTop - head / 2, z);
}

// ---------------------------------------------------------------------------
// ERA architecture (r1 bullet 5: no midline necklaces). All turret-frame.
// Every kind places FRONT-ARC arrays on both cheeks (plan angle t: 0 = +x
// flank, PI/2 = gun axis), plus optional flank tiles; glacis rafts come from
// addEra + the per-tank glacis chevrons.
// ---------------------------------------------------------------------------
function eraCheekArrays(P, p, kind) {
  const { box } = KIT;
  const a = p.turretWidth / 2, b = p.turretDepth / 2;
  const put = (t, y, w, hgt, d, tilt, bucket = 'turretDetail', rIn = 0.97) => {
    const x = Math.cos(t) * a * rIn, z = Math.sin(t) * b * rIn;
    P.add(bucket, box(w, hgt, d), x, y, z, tilt, Math.PI / 2 - t, 0);
  };
  if (kind === 'k1') {
    // Kontakt-1: 3-course brick rafts on both front cheeks.
    for (const s of [1, -1]) for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        const t = Math.PI / 2 + s * (0.28 + i * 0.21);
        put(t, 0.10 + row * 0.15, 0.26, 0.135, 0.18, -0.30 - row * 0.06, i % 2 ? 'turretDetail' : 'turret', 0.97 - row * 0.05);
      }
    }
  } else if (kind === 'k5') {
    // Kontakt-5 clamshell: two stacked wedge courses per cheek with end
    // plates and a dark gap seam; flat K-5 tiles along both flanks.
    for (const s of [1, -1]) {
      for (const [row, y0] of [[0, 0.10], [1, 0.44]]) {
        const t = Math.PI / 2 + s * 0.60;
        const x = Math.cos(t) * a * 0.81, z = Math.sin(t) * b * 0.81;
        P.add('turret', box(0.94, 0.30, 0.34), x, y0 + 0.14, z, -0.50 + row * 0.14, Math.PI / 2 - t, 0);
        P.add('turretDark', box(0.96, 0.03, 0.30), x, y0 + 0.30, z, -0.50 + row * 0.14, Math.PI / 2 - t, 0);
        P.add('turretDetail', box(0.05, 0.28, 0.30), x + Math.cos(t + s * 0.55) * 0.48, y0 + 0.13, z + Math.sin(t + s * 0.55) * 0.48, -0.5, Math.PI / 2 - t, 0);
      }
      for (let i = 0; i < 3; i++) put(s * (0.16 + i * 0.16), 0.30, 0.34, 0.30, 0.06, -0.10);
    }
  } else if (kind === 'erawa') {
    // ERAWA: regular flat tile FIELD over the front arc + chevron corner
    // stacks at both cheek corners.
    for (const s of [1, -1]) for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        const t = Math.PI / 2 + s * (0.16 + i * 0.20);
        put(t, 0.08 + row * 0.24, 0.30, 0.235, 0.055, -0.24 - row * 0.10, 'turretDetail', 0.985 - row * 0.06);
      }
      const tc = Math.PI / 2 + s * 0.98;
      for (let row = 0; row < 2; row++) {
        const x = Math.cos(tc) * a * 0.90, z = Math.sin(tc) * b * 0.90;
        P.add('turret', box(0.40, 0.26, 0.30), x, 0.16 + row * 0.30, z, -0.45, Math.PI / 2 - tc, 0);
      }
    }
  } else if (kind === 'relikt') {
    // Relikt: two-course hard cassettes with seams + cheek corner stacks.
    for (const s of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const t = Math.PI / 2 + s * (0.30 + i * 0.30);
        for (const [row, y0] of [[0, 0.10], [1, 0.42]]) {
          put(t, y0 + 0.14, 0.50, 0.30, 0.22, -0.38 + row * 0.10, row ? 'turretDetail' : 'turret', 0.94 - row * 0.06);
        }
        put(t, 0.41, 0.52, 0.035, 0.20, -0.34, 'turretDark', 0.95);
      }
    }
  }
}

// K-5/K-1 forward side-skirt armor course (hull frame, front third).
function skirtArmor(P, p, count = 4, tall = 0.34) {
  const { box } = KIT;
  const halfL = p.hullLength / 2;
  for (const s of [-1, 1]) for (let i = 0; i < count; i++) {
    P.add('hull', box(0.055, tall, 0.52), s * (p.width / 2 + 0.045), p.trackTop ? p.trackTop : p.roofY * 0.59 * 0.86, halfL * 0.72 - i * 0.56);
    P.add('hullDark', box(0.06, tall * 0.9, 0.03), s * (p.width / 2 + 0.048), p.roofY * 0.59 * 0.86, halfL * 0.72 - i * 0.56 - 0.27);
  }
}

// Shtora-1 OTShU-1-7 IR dazzler pair flanking the mantlet — THE T-90 cue.
function shtoraEyes(P, p, y) {
  const { box } = KIT;
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.26, 0.28, 0.22), s * 0.56, y, p.turretFront * 0.86);
    P.add('turretGlass', box(0.18, 0.18, 0.025), s * 0.56, y, p.turretFront * 0.86 + 0.12);
    P.add('turretDetail', box(0.30, 0.04, 0.24), s * 0.56, y + 0.17, p.turretFront * 0.86);
  }
}

// Pipe-frame bustle stowage basket: rails + posts + mesh face + cargo.
function bustleBasket(P, halfW, z0, z1, yBot, yTop, load = 0.6) {
  const { box } = KIT;
  const d = Math.abs(z1 - z0), zm = (z0 + z1) / 2;
  for (const y of [yBot, yTop]) {
    P.add('turretDetail', box(halfW * 2, 0.035, 0.035), 0, y, z0);
    P.add('turretDetail', box(halfW * 2, 0.035, 0.035), 0, y, z1);
    for (const s of [-1, 1]) P.add('turretDetail', box(0.035, 0.035, d), s * halfW, y, zm);
  }
  const posts = 5;
  for (let i = 0; i < posts; i++) {
    const x = -halfW + (i / (posts - 1)) * halfW * 2;
    P.add('turretDetail', box(0.03, yTop - yBot, 0.03), x, (yBot + yTop) / 2, z1);
  }
  P.add('turretDark', box(halfW * 1.96, (yTop - yBot) * 0.9, 0.015), 0, (yBot + yTop) / 2, z1 + 0.02);
  if (load) P.add('turretCloth', box(halfW * 1.86, (yTop - yBot) * load, d * 0.9), 0, yBot + (yTop - yBot) * load * 0.55, zm);
}

// ---------------------------------------------------------------------------
// Per-tank extras. Hull-frame z is authored HULL-CENTERED (the zShift proxy
// rebases it into the oracle frame); turret-frame coords are pivot-relative.
// ---------------------------------------------------------------------------

function t90aExtras(P, p) {
  const { box, stowage } = KIT;
  eraCheekArrays(P, p, 'k5');
  shtoraEyes(P, p, 0.44);
  // ESSA thermal sight housing ahead of the cupola + cross-wind mast.
  P.add('turret', box(0.40, 0.26, 0.44), 0.58, p.turretHeight + 0.11, 0.30);
  P.add('turretDark', box(0.26, 0.16, 0.04), 0.58, p.turretHeight + 0.13, 0.54);
  mast(P, -0.50, p.turretHeight, -0.55, 1.62);
  // Bustle stowage bin band across the dome rear.
  P.add('turret', box(2.05, 0.42, 0.55), 0, 0.30, -p.turretDepth * 0.46);
  bustleBasket(P, 1.05, -p.turretDepth * 0.46 - 0.35, -p.turretDepth * 0.46 - 0.75, 0.10, 0.55);
  // Rear hull: transverse snorkel on brackets (clear of the dome), bins, log
  // strapped to the lower rear plate.
  deckSnorkel(P, 1.48, -2.72, 1.40, 0.13);
  stowage(P, 'hull', P.rng, [
    [-0.9, 1.42, -3.25, 1.15, 0.20, 0.5], [0.55, 1.42, -3.25, 1.4, 0.20, 0.5],
  ]);
  unditchLog(P, 0.92, -3.72, 1.05);
  skirtArmor(P, p, 4, 0.32);
}

function t62mv1Extras(P, p) {
  const { box } = KIT;
  eraCheekArrays(P, p, 'k1');
  // KTD-2 rangefinder box over the gun root + Luna searchlight right of gun.
  P.addGunExtra(box(0.34, 0.17, 0.44), 0, 0.24, 0.95);
  P.add('turret', box(0.30, 0.30, 0.28), 0.55, 0.36, 0.88);
  P.add('turretGlass', box(0.20, 0.20, 0.02), 0.55, 0.36, 1.03);
  // OPVT tube stowed transversely on rear-deck brackets (the old raked tube
  // read as a drum dropped through the roof — r1).
  deckSnorkel(P, 1.56, -2.42, 1.02, 0.115);
  // Rear hull: two drums + log on the lower rear plate; fender stowage row.
  fuelDrums(P, 0.78, 1.62, -2.78, 0.19, 0.85);
  unditchLog(P, 0.88, -3.32, 0.80);
  KIT.stowage(P, 'hull', P.rng, [[-1.05, 1.56, 0.6, 0.34, 0.18, 1.5]]);
  skirtArmor(P, p, 3, 0.30);
}

function t90aVladimirExtras(P, p) {
  const { box, stowage } = KIT;
  eraCheekArrays(P, p, 'k5');
  shtoraEyes(P, p, 0.42);
  // Crowded commander roof cluster: pano tower + sight boxes + met mast.
  P.add('turret', box(1.30, 0.22, 1.30), 0, p.turretHeight + 0.06, -0.10);
  P.add('turret', box(0.44, 0.34, 0.48), -0.35, p.turretHeight + 0.22, -0.35);
  P.add('turretDark', box(0.26, 0.26, 0.26), 0.30, p.turretHeight + 0.16, 0.30);
  P.add('turretDark', cylOf(P, 0.13, 0.30), -0.35, p.turretHeight + 0.54, -0.35);
  mast(P, -0.35, 0.60, -1.90, 2.36);
  // Bustle bin + basket + crate rack over the rear deck stowage.
  P.add('turret', box(2.05, 0.55, 0.70), 0, 0.32, -p.turretDepth * 0.50 - 0.30);
  bustleBasket(P, 0.92, -p.turretDepth * 0.50 - 0.70, -p.turretDepth * 0.50 - 1.05, 0.08, 0.62);
  // Oracle carries hull-parented turret LOD copies: matching hull-bucket
  // masses — a hidden filler inside the dome and exposed deck stowage aft.
  P.add('hull', box(2.5, 0.90, 1.5), 0, 1.95, 0.50);
  stowage(P, 'hull', P.rng, [
    [-0.7, 1.82, -1.15, 1.3, 0.55, 0.65], [0.75, 1.78, -1.15, 1.2, 0.48, 0.65],
  ]);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.035, 0.26, 0.7), s * 1.05, 1.96, -1.15);
  // Rear plate: drums + wide bins (ref rear stack to y≈1.95).
  fuelDrums(P, 0.62, 1.66, -3.55, 0.20, 0.90);
  stowage(P, 'hull', P.rng, [[0, 1.70, -3.55, 1.9, 0.34, 0.5]]);
  skirtArmor(P, p, 4, 0.34);
}

// tiny local cylinder helper (Y axis) so extras stay terse
function cylOf(P, r, h) { return KIT.cylY(r, r, h, 12); }

function t64bv1Extras(P, p) {
  const { box } = KIT;
  eraCheekArrays(P, p, 'k1');
  P.addGunExtra(box(0.30, 0.16, 0.36), 0, 0.22, 0.85);
  // Rear drums clamped in a rack over the aft deck + rear-deck louvers.
  fuelDrums(P, 0.64, 1.52, -2.10, 0.18, 0.80);
  deckSnorkel(P, 1.34, -2.62, 1.00, 0.11);
  unditchLog(P, 0.82, -2.94, 0.80);
  bustleBasket(P, 0.75, -1.36, -1.72, 0.10, 0.48, 0.5);
  skirtArmor(P, p, 3, 0.28);
}

function pt91mExtras(P, p) {
  const { box, stowage } = KIT;
  eraCheekArrays(P, p, 'erawa');
  // OBRA corner sensors + met mast with sensor cross on the bustle.
  for (const s of [-1, 1]) P.add('turretDark', box(0.16, 0.14, 0.16), s * (p.turretWidth / 2 - 0.18), p.turretHeight + 0.06, -0.55);
  mast(P, -0.30, p.turretHeight, -1.28, 2.22);
  P.add('turretDetail', box(0.34, 0.03, 0.03), -0.30, 2.06, -1.28);
  bustleBasket(P, 0.88, -p.turretDepth * 0.42, -p.turretDepth * 0.42 - 0.55, 0.10, 0.72);
  // Raised louvered powerpack deck + tall rear stack (S-1000R fit) + drums.
  P.add('hull', box(2.7, 0.20, 1.7), 0, 1.62, -2.20);
  for (let i = 0; i < 5; i++) P.add('hullDark', box(2.3, 0.025, 0.09), 0, 1.735, -1.72 - i * 0.24);
  stowage(P, 'hull', P.rng, [
    [-0.6, 1.92, -3.30, 1.5, 0.42, 0.65], [0.8, 1.88, -3.30, 1.0, 0.36, 0.65],
  ]);
  P.add('hull', box(2.2, 0.42, 0.30), 0, 1.66, -3.76);
  fuelDrums(P, 0.62, 1.30, -3.62, 0.17, 0.7);
  unditchLog(P, 0.86, -3.80, 0.95);
  skirtArmor(P, p, 4, 0.30);
}

function t72b87Extras(P, p) {
  const { box, cylZ } = KIT;
  eraCheekArrays(P, p, 'k1');
  // 902B smoke bank on the LEFT cheek only (kit default disabled) + Luna IR
  // spotlight right of the gun root + 1K13-49 sight hood.
  for (let i = 0; i < 6; i++) {
    P.add('turretDark', cylZ(0.042, 0.30, 8), -0.95 - i * 0.115, 0.44 + (i % 2) * 0.02, p.turretFront * 0.62 - i * 0.10, -0.45, -0.28, 0);
  }
  P.add('turret', box(0.30, 0.28, 0.26), 0.62, 0.42, p.turretFront * 0.66);
  P.add('turretGlass', box(0.20, 0.18, 0.02), 0.62, 0.44, p.turretFront * 0.66 + 0.14);
  P.add('turret', box(0.34, 0.34, 0.38), -0.55, p.turretHeight + 0.15, 0.15);
  mast(P, -0.45, p.turretHeight - 0.10, -1.30, 1.35, 0.022, 0.06);
  // Rear hull: drums + log low on the plate + fender stowage boxes.
  fuelDrums(P, 0.60, 1.60, -3.28, 0.19, 0.85);
  unditchLog(P, 0.90, -3.66, 0.95);
  deckSnorkel(P, 1.50, -2.55, 1.25, 0.12);
  KIT.stowage(P, 'hull', P.rng, [[-1.1, 1.60, 0.9, 0.32, 0.18, 1.3]]);
  skirtArmor(P, p, 4, 0.32);
}

function t72b3mExtras(P, p) {
  const { box, stowage } = KIT;
  eraCheekArrays(P, p, 'relikt');
  // Sosna-U armored housing RIGHT of the gun (2x the old cube, split doors).
  P.add('turret', box(0.52, 0.44, 0.62), 0.66, p.turretHeight + 0.10, 0.52);
  P.add('turretDark', box(0.015, 0.30, 0.44), 0.40, p.turretHeight + 0.12, 0.52);
  P.add('turretDark', box(0.30, 0.24, 0.05), 0.66, p.turretHeight + 0.12, 0.86);
  mast(P, -0.30, p.turretHeight, 0.44, 1.97);
  // Long whip antenna raked rearward-left off the dome roof.
  P.add('turretDetail', box(0.035, 1.70, 0.035), -0.20, p.turretHeight + 0.60, -0.55, -0.45, 0, 0.35);
  bustleBasket(P, 0.82, -1.34, -1.94, 0.12, 0.82);
  // Relikt soft-bag skirt rows (3 sagging courses) + rear slat quarter.
  for (const s of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
    P.add('hullCloth', box(0.06, 0.20, 0.40), s * (p.width / 2 + 0.04), 0.92 - row * 0.21, 2.25 - i * 0.52, 0.08 * (row - 1), 0, 0);
  }
  for (const s of [-1, 1]) P.add('hullDark', box(0.02, 0.34, 1.3), s * (p.width / 2 + 0.10), 1.05, -2.6);
  // Hull-parented rear stack in the oracle: hidden filler under the dome
  // rear + exposed deck stowage behind the ring, then a rear slat shelf.
  P.add('hull', box(2.0, 0.55, 1.0), 0, 1.70, -0.10);
  stowage(P, 'hull', P.rng, [
    [-0.65, 1.70, -1.35, 1.2, 0.48, 0.9], [0.7, 1.66, -1.35, 1.1, 0.42, 0.9],
  ]);
  P.add('hullDark', box(2.6, 0.46, 0.06), 0, 1.38, -3.32);
  unditchLog(P, 0.88, -3.36, 0.90);
}

function t90smExtras(P, p) {
  const { box, cylZ, stowage } = KIT;
  eraCheekArrays(P, p, 'relikt');
  // Welded-turret side stowage panels flaring toward the cheeks.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.26, 0.62, 1.15), s * (p.turretWidth / 2 - 0.06), 0.42, 0.72, 0, s * 0.08, 0);
    P.add('turret', box(0.22, 0.50, 0.90), s * (p.turretWidth / 2 - 0.12), 0.40, -0.45);
  }
  // Squared removable bustle: slat rear face + top stowage boxes.
  P.add('turret', box(2.00, 0.70, 1.15), 0, 0.36, -2.17);
  P.add('turretDark', box(2.02, 0.55, 0.05), 0, 0.38, -2.80);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.7, 0.18, 0.9), s * 0.55, 0.80, -2.1);
  // UDP RWS: block + yoke + MG barrel + sight head; pano tower forward-left.
  P.add('turret', box(0.40, 0.30, 0.44), 0.55, p.turretHeight + 0.13, -0.55);
  P.add('turretDark', box(0.10, 0.14, 0.18), 0.55, p.turretHeight + 0.33, -0.55);
  P.add('turretDark', cylZ(0.024, 0.60, 8), 0.55, p.turretHeight + 0.30, -0.20, -0.04, 0, 0);
  P.add('turretGlass', box(0.10, 0.08, 0.02), 0.47, p.turretHeight + 0.20, -0.32);
  mast(P, -0.35, p.turretHeight, -0.90, 1.62, 0.05, 0.20);
  P.add('turretDark', box(0.34, 0.30, 0.34), -0.35, p.turretHeight + 0.38, -0.90);
  P.add('turret', box(0.30, 0.44, 0.30), -0.75, p.turretHeight + 0.20, -0.35);
  stowage(P, 'hull', P.rng, [[0.2, 1.62, -3.30, 1.7, 0.22, 0.55]]);
  skirtArmor(P, p, 4, 0.34);
}

function t72buExtras(P, p) {
  const { box, stowage } = KIT;
  eraCheekArrays(P, p, 'k5');
  shtoraEyes(P, p, 0.40);
  // Tall commander sight cluster left of the ring + met mast over the basket.
  P.add('turret', box(0.40, 0.42, 0.44), -0.60, p.turretHeight + 0.19, 0.05);
  P.add('turretDark', box(0.26, 0.30, 0.26), 0.30, p.turretHeight + 0.13, -0.25);
  mast(P, -0.20, 0.60, -1.42, 2.06);
  bustleBasket(P, 0.90, -1.30, -2.25, 0.10, 0.68);
  // Rear hull: snorkel on brackets, bins, drums, log low on the plate.
  deckSnorkel(P, 1.94, -2.85, 1.30, 0.13);
  stowage(P, 'hull', P.rng, [
    [-0.7, 1.92, -3.40, 1.2, 0.24, 0.55], [0.7, 1.92, -3.40, 1.2, 0.24, 0.55],
  ]);
  fuelDrums(P, 0.62, 1.50, -3.62, 0.18, 0.8);
  unditchLog(P, 1.02, -3.94, 1.00);
  skirtArmor(P, p, 4, 0.34);
}

// ---------------------------------------------------------------------------
// Profiles. Dimensions are width-normalized oracle measurements (packets);
// width = spec width − 0.09 so skirts/fasteners land exactly on spec width.
// zC = the oracle's hull-center offset (overall-bbox-centered GLBs).
// turretPivotZ stays hull-center relative; gun muzzle = zC+pivotZ+gunZ+len.
// ---------------------------------------------------------------------------
export const RUSSIA_PROFILES = {
  t90a: {
    ...SOVIET, build: buildRu, extras: t90aExtras,
    width: 3.69, hullLength: 7.50, roofY: 1.34, noseY: 1.14, trackW: 0.58, wheels: 6, wheelR: 0.375,
    turretWidth: 3.16, turretDepth: 3.30, turretHeight: 0.92, bustle: 0,
    domeShoulder: 0.90, domeCrown: 0.58, crownCap: 0.34,
    turretPivotY: 1.29, turretPivotZ: -0.35, turretFront: 1.40, turretRear: -1.90,
    gunLength: 6.23, gunZ: 0.25, gunY: 0.28, gunRadius: 0.10, cupolaR: 0.34,
    pano: true, mg: true,
  },
  t62mv1: {
    ...SOVIET, build: buildRu, extras: t62mv1Extras,
    width: 3.21, hullLength: 6.77, roofY: 1.45, noseY: 1.13, trackW: 0.55, wheels: 5, wheelR: 0.40,
    zC: -1.365, wheelStyle: 'holes',
    wheelZsRel: [2.28, 0.98, -0.12, -1.18, -2.24],
    skirtY: 0.78, skirtHeight: 0.18,
    turretWidth: 2.62, turretDepth: 2.72, turretHeight: 0.98, bustle: 0,
    domeShoulder: 0.84, domeCrown: 0.46,
    turretPivotY: 1.44, turretPivotZ: 0.815, turretFront: 1.10, turretRear: -1.35,
    gunLength: 5.08, gunZ: 0.20, gunY: 0.33, gunRadius: 0.095, sleeve: false, evac: 0.62,
    cupolaR: 0.30, pano: false, mg: true,
  },
  t64bv1: {
    ...SOVIET, build: buildRu, extras: t64bv1Extras,
    width: 3.20, hullLength: 6.02, roofY: 1.26, noseY: 1.06, trackW: 0.56, wheels: 6,
    wheelR: 0.28, wheelY: 0.37, zC: -1.30, dishR: 0.88, rollers: 4,
    skirtY: 0.68, skirtHeight: 0.26, exhaustLeft: true,
    turretWidth: 2.72, turretDepth: 2.60, turretHeight: 0.95, bustle: 0,
    domeShoulder: 0.87, domeCrown: 0.50,
    turretPivotY: 1.25, turretPivotZ: 0.15, turretFront: 1.10, turretRear: -1.30,
    gunLength: 5.24, gunZ: 0.20, gunY: 0.33, gunRadius: 0.10, gunBaseR: 0.14,
    cupolaR: 0.28, pano: false, mg: true, antennas: false,
  },
  pt91m: {
    ...SOVIET, build: buildRu, extras: pt91mExtras,
    width: 3.50, hullLength: 7.67, roofY: 1.52, noseY: 1.36, trackW: 0.58, wheels: 6, wheelR: 0.375,
    turretWidth: 3.15, turretDepth: 3.10, turretHeight: 1.10, bustle: 0,
    domeShoulder: 0.92, domeCrown: 0.62, crownCap: 0.38,
    turretPivotY: 1.60, turretPivotZ: 0.25, turretFront: 1.35, turretRear: -1.80,
    gunLength: 6.05, gunZ: 0.28, gunY: 0.28, gunRadius: 0.115,
    cupolaR: 0.32, pano: true, mg: true,
  },
  t72b_1987: {
    ...SOVIET, build: buildRu, extras: t72b87Extras,
    width: 3.50, hullLength: 7.30, roofY: 1.47, noseY: 1.19, trackW: 0.58, wheels: 6, wheelR: 0.375,
    zC: -1.20,
    turretWidth: 3.20, turretDepth: 3.00, turretHeight: 1.00, bustle: 0,
    domeShoulder: 0.92, domeCrown: 0.60, crownCap: 0.30,
    turretPivotY: 1.53, turretPivotZ: 0.55, turretFront: 1.30, turretRear: -1.70,
    gunLength: 5.30, gunZ: 0.20, gunY: 0.26, gunRadius: 0.105,
    cupolaR: 0.32, pano: false, mg: true, antennas: false, smoke: false,
  },
  t72b3m: {
    ...SOVIET, build: buildRu, extras: t72b3mExtras,
    width: 3.50, hullLength: 6.83, roofY: 1.42, noseY: 1.27, trackW: 0.58, wheels: 6, wheelR: 0.375,
    zC: -1.125,
    turretWidth: 3.10, turretDepth: 2.85, turretHeight: 1.04, bustle: 0,
    domeShoulder: 0.92, domeCrown: 0.62, crownCap: 0.34,
    turretPivotY: 1.45, turretPivotZ: 0.655, turretFront: 1.30, turretRear: -1.70,
    gunLength: 5.04, gunZ: 0.20, gunY: 0.30, gunRadius: 0.115,
    cupolaR: 0.32, pano: false, mg: true, mgShield: true,
  },
  t72bu: {
    ...SOVIET, build: buildRu, extras: t72buExtras,
    width: 3.69, hullLength: 8.00, roofY: 1.80, noseY: 1.34, trackW: 0.58, wheels: 6, wheelR: 0.40,
    zC: -1.425,
    turretWidth: 3.35, turretDepth: 2.50, turretHeight: 0.92, bustle: 0,
    domeShoulder: 0.90, domeCrown: 0.58, crownCap: 0.32,
    turretPivotY: 1.52, turretPivotZ: 0.575, turretFront: 1.15, turretRear: -1.35,
    gunLength: 6.08, gunZ: 0.20, gunY: 0.25, gunRadius: 0.115,
    cupolaR: 0.34, pano: false, mg: true, antennas: false,
  },
  t90sm: {
    ...SOVIET, build: buildRu, extras: t90smExtras,
    width: 3.69, hullLength: 7.63, roofY: 1.55, noseY: 1.28, trackW: 0.58, wheels: 6, wheelR: 0.375,
    turretWidth: 3.35, turretDepth: 3.20, turretHeight: 1.00, bustle: 0, turretStyle: 'welded',
    turretPivotY: 1.53, turretPivotZ: 0.05, turretFront: 1.60, turretRear: -1.60,
    gunLength: 6.38, gunZ: 0.30, gunY: 0.40, gunRadius: 0.115,
    mantletWidth: 0.66, mantletHeight: 0.50, cupolaR: 0.32, pano: false, mg: false,
  },
  t90a_vladimir: {
    ...SOVIET, build: buildRu, extras: t90aVladimirExtras,
    width: 3.69, hullLength: 7.83, roofY: 1.52, noseY: 1.24, trackW: 0.58, wheels: 6, wheelR: 0.375,
    zC: -1.29, botY: 0.10, skirtHeight: 0.42,
    turretWidth: 3.44, turretDepth: 2.90, turretHeight: 1.18, bustle: 0,
    domeShoulder: 0.90, domeCrown: 0.58, crownCap: 0.34,
    turretPivotY: 1.45, turretPivotZ: 1.02, turretFront: 1.30, turretRear: -1.60,
    gunLength: 5.26, gunZ: 0.20, gunY: 0.25, gunRadius: 0.105,
    cupolaR: 0.34, pano: true, mg: true,
  },
};
