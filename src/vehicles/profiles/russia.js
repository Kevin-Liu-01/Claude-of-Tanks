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
// Coordinate convention: several recovered GLBs are normalized on their
// OVERALL bounding box (long 125 mm gun included), so their hull sits well
// aft of the origin. p.zC bakes that same offset into our geometry so the
// raw-frame component masks (gun overhang especially) line up. A group-level
// shift cannot do this: the swapped-in reference GLB seats under the same
// rig groups and would inherit it. Everything is an original primitive
// construction — measured dimensions only, no source topology.
import { KIT, SOVIET, evenStations, addSegmentedSkirts, addEra } from './kit.js';

// NOTE: KIT bindings are only dereferenced inside build-time functions —
// never at module scope — because of the tankFactory extension-module cycle.

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
  const { box, cylY, cylZ, torus, frustum, buildRunningGear, fenders, headlight, towCable } = KIT;
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

  // Deck furniture: driver hatch + periscopes, transverse engine grilles,
  // right-fender fuel/stowage run, left snorkel/exhaust tube.
  S.add('hull', cylY(0.25, 0.25, 0.045, 16), 0, roofY + 0.03, halfL * 0.30);
  for (const x of [-0.18, 0, 0.18]) S.add('hullDark', box(0.12, 0.04, 0.035), x, roofY + 0.075, halfL * 0.40);
  for (let i = 0; i < 6; i++) S.add('hullDetail', box(width * 0.42, 0.028, 0.045), 0, roofY + 0.05, -halfL * (0.36 + i * 0.075));
  S.add('hull', box(0.34, 0.16, length * 0.30), width * 0.38, roofY - 0.02, -halfL * 0.10);
  S.add('hullDark', cylZ(0.075, length * 0.23, 10), -width * 0.37, roofY + 0.07, -halfL * 0.24, Math.PI / 2, 0, 0);
  for (let i = 0; i < 4; i++) S.add('hullDetail', box(width * 0.46, 0.025, 0.045), 0, roofY + 0.04, halfL * (0.78 - i * 0.075));

  // Tow eyes, headlights, cable.
  for (const side of [-1, 1]) S.add('hullDetail', torus(0.09, 0.018, 10), side * width * 0.27, 0.48, halfL * 0.94, Math.PI / 2, 0, 0);
  headlight(S, -width * 0.35, noseY + 0.06, halfL * 0.86, -0.30, 0.05);
  headlight(S, width * 0.35, noseY + 0.06, halfL * 0.86, -0.30, 0.05);
  towCable(S, [[-width * 0.34, roofY - 0.10, halfL * 0.70], [0, roofY + 0.01, halfL * 0.44], [width * 0.34, roofY - 0.10, halfL * 0.70]]);

  // Front + rear rubber mud flaps over the track runs — every oracle in the
  // family shows them as full-height corner tabs.
  for (const side of [-1, 1]) {
    const xf = side * (width / 2 - trackW / 2 - 0.01);
    S.add('hullRubber', box(trackW + 0.02, 0.40, 0.05), xf, noseY - 0.26, halfL * 0.98);
    S.add('hullRubber', box(trackW + 0.02, 0.40, 0.05), xf, Math.max(0.48, trackTop * 0.68), -halfL * 0.985);
  }

  // Running gear (rear sprocket) + skirts, all stations in the zC frame.
  const wheelCount = p.wheels || 6;
  const wheelR = p.wheelR || Math.min(0.40, length / (wheelCount * 3.2));
  const wheelSpan = p.wheelSpan || length * 0.72;
  const wheelZs = evenStations(wheelCount, wheelSpan, zC + (p.wheelBias || 0));
  const xc = width / 2 - trackW / 2;
  buildRunningGear(P, {
    style: p.wheelStyle || 'rubber', wheelR, wheelW: Math.min(0.22, trackW * 0.36),
    wheelY: p.wheelY || wheelR + 0.09, xc, wheelZs,
    sprocket: { z: -halfL * 0.85 + zC, y: wheelR + 0.10, r: wheelR * 0.88 },
    idler: { z: halfL * 0.85 + zC, y: wheelR + 0.08, r: wheelR * 0.84 },
    rollers: evenStations(3, wheelSpan * 0.68, zC).map((z) => ({ z, y: trackTop * 0.84, r: wheelR * 0.23 })),
    trackW, topY: trackTop * 0.86, botY: p.botY ?? 0.075, paintedEnds: true,
    coveredTop: p.skirts !== false, arms: p.arms !== false,
  });
  if (p.skirts !== false) {
    addSegmentedSkirts(S, width, p.skirtLength ?? length * 0.84, p.skirtY ?? trackTop * 0.72,
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
function ruTurretAndGun(P, p) {
  const { box, cylY, cylZ, lathe, buildGun, cupola, periscope, pintleMG, smokeCluster } = KIT;
  const r = p.turretWidth / 2, h = p.turretHeight;
  const sh = p.domeShoulder ?? 0.88, cr = p.domeCrown ?? 0.55;
  const sz = p.turretDepth / p.turretWidth;
  P.add('turret', lathe([
    [r * 0.84, 0], [r, 0.10], [r * 0.97, h * 0.42], [r * sh, h * 0.75],
    [r * cr, h * 0.96], [0.02, h],
  ], 28, sz));
  if (p.crownCap) P.add('turret', box(r * 2 * p.crownCap, 0.10, r * 2 * p.crownCap * sz * 0.9), 0, h - 0.03, 0);
  cupola(P, 'turret', p.commanderX ?? p.turretWidth * 0.20, h, p.commanderZ ?? -p.turretDepth * 0.20,
    p.cupolaR ?? 0.30, p.cupolaH ?? 0.10, p.cupolaPeriscopes ?? 6);
  P.add('turret', cylY(0.19, 0.19, 0.035, 14), -p.turretWidth * 0.20, h + 0.02, -p.turretDepth * 0.16);
  periscope(P, 'turretDetail', p.sightX ?? p.turretWidth * 0.20, h + 0.06, p.turretFront * 0.28);
  if (p.pano) {
    P.add('turretDetail', box(0.16, 0.19, 0.16), p.panoX ?? 0.32, h + 0.10, -p.turretDepth * 0.20);
    P.add('turretDark', cylY(0.12, 0.12, 0.17, 12), p.panoX ?? 0.32, h + 0.27, -p.turretDepth * 0.20);
  }
  if (p.smoke !== false) {
    smokeCluster(P, p.turretWidth * 0.43, h * 0.52, 0.15, 4, 1.12, 0.55);
    smokeCluster(P, -p.turretWidth * 0.43, h * 0.52, 0.15, 4, -1.12, 0.55);
  }
  if (p.mg) pintleMG(P, p.commanderX ?? p.turretWidth * 0.20, h + 0.08, -p.turretDepth * 0.30, p.mg === 'heavy');
  if (p.antennas !== false) for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.022, 0.48, 0.022), side * p.turretWidth * 0.34, h + 0.24, p.turretRear * 0.78, 0, 0, side * 0.08);
  }
  P.addGunExtra(box(p.mantletWidth || 0.48, p.mantletHeight || 0.44, 0.24), 0, 0.01, p.turretFront * 0.62);
  P.addGunExtra(cylZ(Math.max(0.10, (p.gunRadius || 0.10) * 1.55), 0.28, 14), 0, 0, p.turretFront * 0.82);
  buildGun(P, {
    len: p.gunLength, r: p.gunRadius || 0.10,
    sleeve: p.sleeve !== false, evac: Object.hasOwn(p, 'evac') ? p.evac : 0.55,
    collar: true, baseR: Math.max(0.12, (p.gunRadius || 0.10) * 1.7),
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
    [p.turretWidth / 2 * 0.97, p.turretHeight * 0.40, -p.turretDepth * 0.16], Math.PI / 2);
  if (p.extras) p.extras(zShift(P, zC), p);
}

// ---------------------------------------------------------------------------
// Shared Soviet-family furniture (hull frame unless noted)
// ---------------------------------------------------------------------------

// Two 200 L fuel drums on rear brackets (axis fore-aft).
function fuelDrums(P, x, y, z, r = 0.19, len = 0.85) {
  const { box, cylZ } = KIT;
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(r, len, 12), s * x, y, z);
    P.add('hullDark', cylZ(r * 1.03, 0.03, 12), s * x, y, z + len * 0.28);
    P.add('hullDark', box(0.05, 0.30, 0.05), s * x, y - 0.16, z + 0.10);
  }
}

// Unditching log across the lower rear plate.
function unditchLog(P, y, z, halfW, r = 0.13) {
  const { cylX } = KIT;
  P.add('hullWood', cylX(r, halfW * 2, 10), 0, y, z);
  for (const s of [-0.6, 0.6]) P.add('hullDark', cylX(r * 1.06, 0.04, 10), s * halfW, y, z);
}

// OPVT deep-wading snorkel stowed transversely across the rear deck.
function deckSnorkel(P, y, z, halfW, r = 0.14) {
  const { cylX } = KIT;
  P.add('hullDark', cylX(r, halfW * 2, 10), 0, y, z);
}

// Thin roof mast (met mast / antenna base / pano tower stem) — turret frame.
function mast(P, x, yBase, z, yTop, r = 0.028, head = 0.11) {
  const { box } = KIT;
  const h = Math.max(0.05, yTop - yBase);
  P.add('turretDetail', box(r * 2, h, r * 2), x, yBase + h / 2, z);
  P.add('turretDark', box(head, head, head), x, yTop - head / 2, z);
}

// ERA arc around the front of a dome turret (turret frame).
// kind: 'k1' bricks, 'k5' big wedges, 'erawa' flat tiles, 'relikt' cassettes.
function turretEra(P, p, kind, rows = 2, y0 = 0.12) {
  const { box } = KIT;
  const a = p.turretWidth / 2, b = p.turretDepth / 2;
  const spec = {
    k1: { n: 8, w: 0.25, h: 0.13, d: 0.17, tilt: -0.30 },
    k5: { n: 5, w: 0.62, h: 0.34, d: 0.26, tilt: -0.52 },
    erawa: { n: 9, w: 0.30, h: 0.30, d: 0.07, tilt: -0.14 },
    relikt: { n: 6, w: 0.48, h: 0.30, d: 0.20, tilt: -0.38 },
  }[kind];
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < spec.n; i++) {
      const t = 0.32 + (i / (spec.n - 1)) * (Math.PI - 0.64); // plan angle, front arc
      const x = Math.cos(t) * (a * 0.94), z = Math.sin(t) * (b * 0.94);
      P.add('turretDetail', box(spec.w, spec.h, spec.d),
        x, y0 + row * (spec.h + 0.015), z, spec.tilt, Math.PI / 2 - t, 0);
    }
  }
}

// Shtora-1 OTShU-1-7 IR dazzler pair flanking the gun root (turret frame).
function shtoraEyes(P, p, y) {
  const { box } = KIT;
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.20, 0.22, 0.16), s * 0.52, y, p.turretFront * 0.88);
    P.add('turretGlass', box(0.13, 0.13, 0.02), s * 0.52, y, p.turretFront * 0.88 + 0.09);
  }
}

// Pipe-frame bustle stowage basket (turret frame): rails + end posts + load.
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
  if (load) P.add('turretCloth', box(halfW * 1.86, (yTop - yBot) * load, d * 0.9), 0, yBot + (yTop - yBot) * load * 0.55, zm);
}

// ---------------------------------------------------------------------------
// Per-tank extras. Hull-frame z is authored HULL-CENTERED (the zShift proxy
// rebases it into the oracle frame); turret-frame coords are pivot-relative.
// ---------------------------------------------------------------------------

function t90aExtras(P, p) {
  const { box, stowage } = KIT;
  turretEra(P, p, 'k5', 1, 0.24);
  shtoraEyes(P, p, 0.42);
  // Commander sight cluster right roof (world ~2.45-2.65) + cross-wind mast.
  P.add('turret', box(0.42, 0.30, 0.46), 0.60, p.turretHeight + 0.13, -0.30);
  P.add('turretDark', box(0.26, 0.24, 0.26), 0.24, p.turretHeight + 0.11, 0.28);
  mast(P, -0.50, p.turretHeight, -0.55, 1.62);
  // Bustle stowage bin band across the dome rear.
  P.add('turret', box(2.05, 0.42, 0.55), 0, 0.30, -p.turretDepth * 0.46);
  bustleBasket(P, 1.05, -p.turretDepth * 0.46 - 0.35, -p.turretDepth * 0.46 - 0.75, 0.10, 0.55);
  // Rear hull: transverse snorkel, stowage bins, unditching log.
  deckSnorkel(P, 1.62, -1.70, 1.55, 0.15);
  stowage(P, 'hull', P.rng, [
    [-0.9, 1.42, -3.25, 1.15, 0.20, 0.5], [0.55, 1.42, -3.25, 1.4, 0.20, 0.5],
  ]);
  unditchLog(P, 1.40, -3.58, 1.12);
}

function t62mv1Extras(P, p) {
  const { box } = KIT;
  turretEra(P, p, 'k1', 2, 0.10);
  // KTD-2 rangefinder box over the gun root + Luna searchlight right of gun.
  P.addGunExtra(box(0.34, 0.17, 0.44), 0, 0.24, 0.95);
  P.add('turret', box(0.30, 0.30, 0.28), 0.55, 0.36, 0.88);
  P.add('turretGlass', box(0.20, 0.20, 0.02), 0.55, 0.36, 1.03);
  // Stowed snorkel: fat tube leaning over the dome rear; loader DShK is p.mg.
  P.add('turretDark', KIT.cylZ(0.09, 1.15, 10), -0.30, p.turretHeight + 0.06, -0.75, -0.5, 0, 0);
  mast(P, 0.35, p.turretHeight - 0.05, -0.55, 1.30, 0.028, 0.07);
  // Rear hull: two drums + log.
  fuelDrums(P, 0.78, 1.62, -2.78, 0.19, 0.85);
  unditchLog(P, 1.26, -3.18, 0.80);
}

function t90aVladimirExtras(P, p) {
  const { box, stowage } = KIT;
  turretEra(P, p, 'k5', 1, 0.26);
  shtoraEyes(P, p, 0.40);
  P.add('turret', box(1.30, 0.22, 1.30), 0, p.turretHeight + 0.06, -0.10);
  P.add('turret', box(0.44, 0.34, 0.48), -0.35, p.turretHeight + 0.22, -0.35);
  P.add('turretDark', box(0.26, 0.26, 0.26), 0.30, p.turretHeight + 0.16, 0.30);
  // Bustle bin + basket, met mast rising from the basket rear.
  P.add('turret', box(2.05, 0.55, 0.70), 0, 0.32, -p.turretDepth * 0.50 - 0.30);
  bustleBasket(P, 0.92, -p.turretDepth * 0.50 - 0.70, -p.turretDepth * 0.50 - 1.05, 0.08, 0.62);
  mast(P, -0.35, 0.60, -1.90, 2.36);
  // Oracle carries hull-parented turret LOD copies: matching hull-bucket
  // masses — a hidden filler inside the dome and exposed deck stowage aft.
  P.add('hull', box(2.5, 0.90, 1.5), 0, 1.95, 0.50);
  stowage(P, 'hull', P.rng, [
    [-0.7, 1.82, -1.15, 1.3, 0.55, 0.65], [0.75, 1.78, -1.15, 1.2, 0.48, 0.65],
  ]);
  // Rear plate: drums + wide bins (ref rear stack to y≈1.95).
  fuelDrums(P, 0.62, 1.66, -3.55, 0.20, 0.90);
  stowage(P, 'hull', P.rng, [[0, 1.70, -3.55, 1.9, 0.34, 0.5]]);
}

function t64bv1Extras(P, p) {
  const { box } = KIT;
  turretEra(P, p, 'k1', 2, 0.10);
  // K-1 covered forward skirt plates — the widest feature on the BV.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.06, 0.52, 1.45), s * (p.width / 2 + 0.055), 0.86, 1.35);
  }
  P.addGunExtra(box(0.30, 0.16, 0.36), 0, 0.22, 0.85);
  // Rear drums hang over the aft deck (turret-parented in the oracle).
  fuelDrums(P, 0.64, 1.52, -2.10, 0.18, 0.80);
  deckSnorkel(P, 1.38, -2.55, 1.05, 0.12);
  unditchLog(P, 1.18, -2.80, 0.85);
}

function pt91mExtras(P, p) {
  const { box, stowage } = KIT;
  turretEra(P, p, 'erawa', 3, 0.10);
  // OBRA corner sensors + met mast on the bustle.
  for (const s of [-1, 1]) P.add('turretDark', box(0.16, 0.14, 0.16), s * (p.turretWidth / 2 - 0.18), p.turretHeight + 0.06, -0.55);
  mast(P, -0.30, p.turretHeight, -1.28, 2.22);
  bustleBasket(P, 0.88, -p.turretDepth * 0.42, -p.turretDepth * 0.42 - 0.55, 0.10, 0.72);
  // Raised powerpack deck + tall rear stack (S-1000R fit) with overhang.
  P.add('hull', box(2.7, 0.20, 1.7), 0, 1.62, -2.20);
  stowage(P, 'hull', P.rng, [
    [-0.6, 1.92, -3.30, 1.5, 0.42, 0.65], [0.8, 1.88, -3.30, 1.0, 0.36, 0.65],
  ]);
  P.add('hull', box(2.2, 0.42, 0.30), 0, 1.66, -3.76);
  unditchLog(P, 1.30, -3.80, 1.05);
}

function t72b87Extras(P, p) {
  const { box } = KIT;
  turretEra(P, p, 'k1', 3, 0.08);
  // 1K13-49 sight hood (left roof) + antenna at the bustle left.
  P.add('turret', box(0.34, 0.34, 0.38), -0.55, p.turretHeight + 0.15, 0.15);
  mast(P, -0.45, p.turretHeight - 0.10, -1.30, 1.35, 0.022, 0.06);
  // Rear hull: drums + log.
  fuelDrums(P, 0.60, 1.60, -3.28, 0.19, 0.85);
  unditchLog(P, 1.36, -3.52, 1.00);
  deckSnorkel(P, 1.56, -2.35, 1.30, 0.13);
}

function t72b3mExtras(P, p) {
  const { box, stowage } = KIT;
  turretEra(P, p, 'relikt', 2, 0.12);
  // Sosna-U armored housing right roof + pano mast ahead of the ring.
  P.add('turret', box(0.44, 0.34, 0.52), 0.58, p.turretHeight + 0.15, 0.30);
  P.add('turretDark', box(0.24, 0.20, 0.05), 0.58, p.turretHeight + 0.17, 0.58);
  mast(P, -0.30, p.turretHeight, 0.44, 1.97);
  // Long whip antenna raked rearward-left off the dome roof.
  P.add('turretDetail', box(0.035, 1.70, 0.035), -0.20, p.turretHeight + 0.60, -0.55, -0.45, 0, 0.35);
  bustleBasket(P, 0.82, -1.34, -1.94, 0.12, 0.82);
  // Hull-parented rear stack in the oracle: hidden filler under the dome
  // rear + exposed deck stowage behind the ring, then a rear slat shelf.
  P.add('hull', box(2.0, 0.55, 1.0), 0, 1.70, -0.10);
  stowage(P, 'hull', P.rng, [
    [-0.65, 1.70, -1.35, 1.2, 0.48, 0.9], [0.7, 1.66, -1.35, 1.1, 0.42, 0.9],
  ]);
  P.add('hullDark', box(2.6, 0.46, 0.06), 0, 1.38, -3.32);
  unditchLog(P, 1.30, -3.22, 1.00);
}

function t90smExtras(P, p) {
  const { box, stowage } = KIT;
  turretEra(P, p, 'relikt', 2, 0.16);
  // Welded-turret side stowage panels flaring toward the cheeks.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.26, 0.62, 1.15), s * (p.turretWidth / 2 - 0.06), 0.42, 0.72, 0, s * 0.08, 0);
    P.add('turret', box(0.22, 0.50, 0.90), s * (p.turretWidth / 2 - 0.12), 0.40, -0.45);
  }
  // Squared removable bustle with slat rear + roof furniture (pano + RWS).
  P.add('turret', box(2.00, 0.70, 1.15), 0, 0.36, -2.17);
  P.add('turretDark', box(2.02, 0.55, 0.05), 0, 0.38, -2.80);
  P.add('turret', box(0.40, 0.30, 0.44), 0.55, p.turretHeight + 0.13, -0.55);
  mast(P, -0.35, p.turretHeight, -0.90, 1.62, 0.05, 0.20);
  P.add('turretDark', box(0.34, 0.34, 0.34), -0.35, p.turretHeight + 0.38, -0.90);
  P.add('turret', box(0.30, 0.44, 0.30), -0.75, p.turretHeight + 0.20, -0.35);
  stowage(P, 'hull', P.rng, [[0.2, 1.62, -3.30, 1.7, 0.22, 0.55]]);
}

function t72buExtras(P, p) {
  const { box, stowage } = KIT;
  turretEra(P, p, 'k5', 1, 0.22);
  shtoraEyes(P, p, 0.38);
  // Tall commander sight cluster left of the ring + met mast over the basket.
  P.add('turret', box(0.40, 0.42, 0.44), -0.60, p.turretHeight + 0.19, 0.05);
  P.add('turretDark', box(0.26, 0.30, 0.26), 0.30, p.turretHeight + 0.13, -0.25);
  mast(P, -0.20, 0.60, -1.42, 2.06);
  bustleBasket(P, 0.90, -1.30, -2.25, 0.10, 0.68);
  // Rear hull bins (tall deck oracle).
  stowage(P, 'hull', P.rng, [
    [-0.7, 1.92, -3.40, 1.2, 0.24, 0.55], [0.7, 1.92, -3.40, 1.2, 0.24, 0.55],
  ]);
  unditchLog(P, 1.55, -3.80, 1.05);
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
    zC: -1.365,
    turretWidth: 2.62, turretDepth: 2.72, turretHeight: 0.98, bustle: 0,
    domeShoulder: 0.84, domeCrown: 0.46,
    turretPivotY: 1.44, turretPivotZ: 0.815, turretFront: 1.10, turretRear: -1.35,
    gunLength: 5.08, gunZ: 0.20, gunY: 0.33, gunRadius: 0.095, sleeve: false, evac: 0.75,
    cupolaR: 0.30, pano: false, mg: true,
  },
  t64bv1: {
    ...SOVIET, build: buildRu, extras: t64bv1Extras,
    width: 3.20, hullLength: 6.02, roofY: 1.26, noseY: 1.06, trackW: 0.56, wheels: 6,
    wheelR: 0.28, wheelY: 0.37, zC: -1.30,
    turretWidth: 2.72, turretDepth: 2.60, turretHeight: 0.95, bustle: 0,
    domeShoulder: 0.87, domeCrown: 0.50,
    turretPivotY: 1.25, turretPivotZ: 0.15, turretFront: 1.10, turretRear: -1.30,
    gunLength: 5.24, gunZ: 0.20, gunY: 0.33, gunRadius: 0.10,
    cupolaR: 0.28, pano: false, mg: false, antennas: false,
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
    cupolaR: 0.32, pano: false, mg: false, antennas: false,
  },
  t72b3m: {
    ...SOVIET, build: buildRu, extras: t72b3mExtras,
    width: 3.50, hullLength: 6.83, roofY: 1.42, noseY: 1.27, trackW: 0.58, wheels: 6, wheelR: 0.375,
    zC: -1.125,
    turretWidth: 3.10, turretDepth: 2.85, turretHeight: 1.04, bustle: 0,
    domeShoulder: 0.92, domeCrown: 0.62, crownCap: 0.34,
    turretPivotY: 1.45, turretPivotZ: 0.655, turretFront: 1.30, turretRear: -1.70,
    gunLength: 5.04, gunZ: 0.20, gunY: 0.30, gunRadius: 0.115,
    cupolaR: 0.32, pano: false, mg: true,
  },
  t72bu: {
    ...SOVIET, build: buildRu, extras: t72buExtras,
    width: 3.69, hullLength: 8.00, roofY: 1.80, noseY: 1.34, trackW: 0.58, wheels: 6, wheelR: 0.40,
    zC: -1.425,
    turretWidth: 3.35, turretDepth: 2.50, turretHeight: 0.92, bustle: 0,
    domeShoulder: 0.90, domeCrown: 0.58, crownCap: 0.32,
    turretPivotY: 1.52, turretPivotZ: 0.575, turretFront: 1.15, turretRear: -1.35,
    gunLength: 6.05, gunZ: 0.20, gunY: 0.25, gunRadius: 0.115,
    cupolaR: 0.34, pano: false, mg: false, antennas: false,
  },
  t90sm: {
    ...SOVIET, build: buildRu, extras: t90smExtras,
    width: 3.69, hullLength: 7.63, roofY: 1.55, noseY: 1.28, trackW: 0.58, wheels: 6, wheelR: 0.375,
    turretWidth: 3.35, turretDepth: 3.20, turretHeight: 1.00, bustle: 0,
    domeShoulder: 0.94, domeCrown: 0.66, crownCap: 0.42,
    turretPivotY: 1.53, turretPivotZ: 0.05, turretFront: 1.60, turretRear: -1.60,
    gunLength: 6.38, gunZ: 0.30, gunY: 0.40, gunRadius: 0.115,
    mantletWidth: 0.66, mantletHeight: 0.50, cupolaR: 0.32, pano: false, mg: false,
  },
  t90a_vladimir: {
    ...SOVIET, build: buildRu, extras: t90aVladimirExtras,
    width: 3.69, hullLength: 7.83, roofY: 1.52, noseY: 1.24, trackW: 0.58, wheels: 6, wheelR: 0.375,
    zC: -1.29,
    turretWidth: 3.44, turretDepth: 2.90, turretHeight: 1.18, bustle: 0,
    domeShoulder: 0.90, domeCrown: 0.58, crownCap: 0.34,
    turretPivotY: 1.45, turretPivotZ: 1.02, turretFront: 1.30, turretRear: -1.60,
    gunLength: 5.26, gunZ: 0.20, gunY: 0.25, gunRadius: 0.105,
    cupolaR: 0.34, pano: true, mg: true, botY: 0.10, skirtHeight: 0.42,
  },
};
