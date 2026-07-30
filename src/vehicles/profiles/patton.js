// US Patton/Pershing lineage procedural profiles (fidelity oracles:
// recovered M26/M45/M46/M47/M60 GLBs). Owned by the Patton family agent.
//
// Fully measured custom builds (docs/references/tanks/m26_pershing.md,
// m45_patton.md, m46_patton.md, m47_patton.md, m60a1.md, m60a3.md). All
// constants are WORLD coordinates read off normalized reference masks +
// published dimensions; turret/gun pieces subtract their pivot at build time.
//
// Mask-pipeline rules this module builds around (procedural-fidelity.html):
// - Only LOD0 buckets (hull/hullRubber/turret/gun/gunDark/gunMount) respect
//   the hull-vs-turret part split; every lodWrap'd detail bucket leaks into
//   the hull mask because THREE.LOD re-shows its level during render. So the
//   entire silhouette here lives in LOD0 buckets and detail buckets are only
//   used deep inside the silhouette (torsion arms, bay shadow).
// - The gun component compares whole-mask pixels beyond the union hull length
//   bounds, centroid-aligned: overhang LENGTH and muzzle-device SHAPE matter,
//   trunnion height does not.
// - Four Pershing-family references have their turret casting sunk into the
//   hull (see packets). Hull/gear/gun match those oracles exactly (including
//   the low authored barrel line); turrets are correct PROUD castings sized
//   into the oracle's upper-mask envelope, so their turret component is
//   oracle-capped, not sloppy.
import { KIT, evenStations } from './kit.js';

// ---------------------------------------------------------------------------
// Shared hull: full-width deck-polyline construction + Patton running gear.
// H: { W, trackW, trackInset?, sponsonY, deck:[[z,y]...front->rear],
//      noseR, noseY, noseZ, wheelR, wheelY?, wheelSpan:[zFront,zRear],
//      sprocket:{z,y,r}, idler:{z,y,r}, rollerN, rollerY,
//      tension?:{z,y,r}, mufflerTopY?, mufflerZ?:[z0,z1], tailBoxZ? }
// ---------------------------------------------------------------------------
function pattonHull(P, H) {
  const { box, slab, cylX, buildRunningGear } = KIT;
  const hw = H.W / 2 - 0.008;
  const innerW = H.W - 2 * H.trackW - 0.10;
  const spons = H.sponsonY;
  const deck = H.deck;
  const noseZ = deck[0][0], tailZ = deck[deck.length - 1][0];

  // full-width deck strip: one wedge slab per polyline segment
  for (let i = 0; i < deck.length - 1; i++) {
    const [zF, yF] = deck[i], [zR, yR] = deck[i + 1];
    P.add('hull', slab(
      [-hw, spons, zF], [hw, spons, zF], [hw, spons, zR], [-hw, spons, zR],
      [-hw, yF, zF], [hw, yF, zF], [hw, yR, zR], [-hw, yR, zR]));
  }

  // lower hull + rounded cast transmission nose + tail undercut
  const lowerY = H.lowerY ?? 0.45;
  P.add('hull', box(innerW, spons - lowerY, (noseZ - tailZ) * 0.88),
    0, (spons + lowerY) / 2, (noseZ + tailZ) / 2 * 0.96);
  P.add('hull', cylX(H.noseR, innerW, P.q ? 22 : 12), 0, H.noseY, H.noseZ);
  P.add('hull', box(innerW * 0.9, 0.36, 0.5), 0, 0.82, tailZ + 0.34);

  // rear-fender mufflers (M46/M47 raised rear read) + tailpipes
  if (H.mufflerTopY) {
    const [mz0, mz1] = H.mufflerZ;
    for (const side of [-1, 1]) {
      P.add('hull', box(0.52, 0.18, mz0 - mz1), side * (hw - 0.34), H.mufflerTopY - 0.09, (mz0 + mz1) / 2);
      P.add('hull', cylX(0.055, 0.5, 8), side * (hw - 0.30), H.mufflerTopY - 0.16, mz1 - 0.10);
    }
  }
  // tail fixture (m45: absorbs the reference's rear overhang into the hull bound)
  if (H.tailBoxZ) P.add('hull', box(1.45, 0.38, 2 * (tailZ - H.tailBoxZ)), 0, 1.13, tailZ);

  const wheelZs = evenStations(6, H.wheelSpan[0] - H.wheelSpan[1], (H.wheelSpan[0] + H.wheelSpan[1]) / 2);
  const rollers = evenStations(H.rollerN, (H.wheelSpan[0] - H.wheelSpan[1]) * 0.82,
    (H.wheelSpan[0] + H.wheelSpan[1]) / 2).map((z) => ({ z, y: H.rollerY, r: 0.088 }));
  if (H.tension) rollers.push(H.tension);
  buildRunningGear(P, {
    style: 'dished', wheelR: H.wheelR, wheelW: Math.min(0.23, H.trackW * 0.38),
    wheelY: H.wheelY ?? H.wheelR + 0.03, xc: H.W / 2 - H.trackW / 2 - (H.trackInset || 0),
    wheelZs, sprocket: H.sprocket, idler: H.idler,
    rollers, trackW: H.trackW, topY: H.rollerY + 0.04, paintedEnds: true,
    coveredTop: false, arms: true,
  });
  return hw;
}

// ---------------------------------------------------------------------------
// Turret furniture (all 'turret' bucket — LOD0, no detail-bucket leaks)
// ---------------------------------------------------------------------------
function lowCupola(P, x, baseY, z, r, top) {
  const { cylY } = KIT;
  const seg = P.q ? 20 : 10;
  P.add('turret', cylY(r * 0.94, r, Math.max(0.06, top - baseY - 0.03), seg), x, (baseY + top - 0.03) / 2, z);
  P.add('turret', cylY(r * 0.82, r * 0.82, 0.035, seg), x, top - 0.018, z);
}

// Forward-facing pintle .50cal (the tall narrow spike every Pershing-family
// reference shows). All 'turret' so it survives the mask part split.
function fiftyCal(P, x, deckY, z, topY) {
  const { box, cylY, cylZ } = KIT;
  P.add('turret', cylY(0.030, 0.034, topY - deckY - 0.20, 8), x, (deckY + topY - 0.20) / 2, z);
  P.add('turret', box(0.20, 0.17, 0.66), x, topY - 0.125, z + 0.10);
  P.add('turret', cylZ(0.026, 0.80, 8), x, topY - 0.085, z + 0.80);
  P.add('turret', box(0.20, 0.14, 0.18), x + 0.16, topY - 0.24, z - 0.05);   // ammo can
}

// T26-family proud cast turret (m26/m45/m46/m47 base), sized to the oracle
// envelope. T: { ringZ, ringY, halfW, roofY, frontZ, rearZ,
//   bustle?:{z0,z1,topY,halfW}, stow?:{z0,z1,topY,width?},
//   blisters?:{x,y,z,r}, cupola:{x,z,r,baseY,topY}, mg?:{x,z,deckY,topY} }
function t26Turret(P, T) {
  const { box, lathe, frustum } = KIT;
  const h = T.roofY - T.ringY;
  const zc = (T.frontZ + T.rearZ) / 2 - T.ringZ;
  const sz = (T.frontZ - T.rearZ) / 2 / T.halfW;
  // flat-topped cast dome: long roof plateau like the oracle envelope
  P.add('turret', lathe([
    [T.halfW * 0.90, 0], [T.halfW, h * 0.14], [T.halfW * 0.98, h * 0.42],
    [T.halfW * 0.92, h * 0.66], [T.halfW * 0.80, h * 0.88], [T.halfW * 0.52, h * 0.98], [0.02, h],
  ], P.q ? 30 : 16, sz), 0, 0, zc);
  if (T.bustle) {
    P.add('turret', frustum(T.bustle.halfW, T.bustle.z0 - T.ringZ, T.bustle.z1 - T.ringZ,
      T.bustle.halfW * 0.82, T.bustle.z0 - T.ringZ - 0.06, T.bustle.z1 - T.ringZ + 0.04,
      0.02, T.bustle.topY - T.ringY));
  }
  if (T.stow) { // low stowage/rack run trailing over (or past) the rear deck
    const zm = (T.stow.z0 + T.stow.z1) / 2 - T.ringZ;
    const d = T.stow.z0 - T.stow.z1;
    const w = T.stow.width ?? 1.55;
    P.add('turret', box(w, T.stow.topY - T.ringY - 0.12, d), 0, (T.stow.topY - T.ringY - 0.12) / 2 + 0.06, zm);
    P.add('turret', box(w * 0.84, 0.16, d * 0.8), 0, T.stow.topY - T.ringY + 0.02, zm);
  }
  if (T.blisters) { // M47 stereoscopic rangefinder bulges, both cheeks
    const { sph } = KIT;
    for (const side of [-1, 1]) {
      P.add('turret', sph(T.blisters.r, P.q ? 16 : 10), side * T.blisters.x,
        T.blisters.y - T.ringY, T.blisters.z - T.ringZ, 0, 0, 0, [1, 0.72, 1.35]);
    }
  }
  lowCupola(P, T.cupola.x, T.cupola.baseY - T.ringY, T.cupola.z - T.ringZ, T.cupola.r, T.cupola.topY - T.ringY);
  if (T.mg) fiftyCal(P, T.mg.x, T.mg.deckY - T.ringY, T.mg.z - T.ringZ, T.mg.topY - T.ringY);
}

// ---------------------------------------------------------------------------
// Per-tank builds
// ---------------------------------------------------------------------------
function buildM26Family(P, cfg) {
  const { box, cylX, cylZ, buildGun } = KIT;
  pattonHull(P, cfg.hull);
  P.turretG.position.set(0, cfg.pivotY, cfg.pivotZ);
  P.gunG.position.set(0, cfg.gunY - cfg.pivotY, cfg.gunZ - cfg.pivotZ);
  t26Turret(P, cfg.turret);

  const G = cfg.gun;
  const len = G.muzzleZ - cfg.gunZ;
  // low gun shield / mantlet (the oracles author the whole mount low; the
  // shield stays just proud of the deck line like the reference bump)
  P.addGunExtra(box(G.shieldW, G.shieldH, 0.26), 0, 0.04, G.rootL + 0.02);
  P.addGunExtra(KIT.xform(cylX(G.shieldH * 0.5, G.shieldW * 0.66, 12), 0, 0, 0), 0, 0.05, G.rootL + 0.18);
  buildGun(P, { len, r: G.r, sleeve: false, evac: null, collar: false, baseR: G.r * 1.8 });
  const sq = (r, l, at, s = 0.70) => P.add('gun', KIT.xform(cylZ(r, l, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [1, s, 1]), 0, 0, at);
  if (G.device === 'double') {           // M26/M3: twin flat-drum double baffle
    P.add('gunDark', cylZ(G.r * 0.72, 0.34, 10), 0, 0, len - 0.28);
    sq(0.26, 0.17, len - 0.44);
    sq(0.25, 0.15, len - 0.12);
    P.add('gun', cylZ(G.r * 1.06, 0.05, 10), 0, 0, len - 0.02);
  } else if (G.device === 'm46') {       // M3A1: evacuator drum + single baffle
    P.add('gun', cylZ(G.r * 1.52, 0.32, P.q ? 20 : 12), 0, 0, len - 0.34);
    P.add('gun', cylZ(G.r * 1.36, 0.16, 12), 0, 0, len - 0.09);
    P.add('gunDark', cylZ(G.r * 0.60, 0.10, 8), 0, 0, len - 0.19);
  } else if (G.device === 'm47') {       // M36: cylindrical blast deflector
    P.add('gun', cylZ(0.14, 0.40, 12), 0, 0, len - 1.02);
    P.add('gunDark', cylZ(G.r * 0.66, 0.16, 8), 0, 0, len - 0.10);
    sq(0.30, 0.13, len - 0.17, 0.55);
    sq(0.24, 0.09, len - 0.04, 0.55);
  }
  P.muzzleZ = len;
  P.topY = cfg.turret.cupola.topY - cfg.pivotY + 0.12;
}

// M60A1/A3: intact oracle — elongated needle-nose casting + M19 cupola.
function buildM60(P, cfg) {
  const { box, slab, lathe, cylX, cylY, cylZ, buildGun, xform } = KIT;
  pattonHull(P, cfg.hull);
  const pz = 0.30, py = 1.76;
  P.turretG.position.set(0, py, pz);
  P.gunG.position.set(0, 2.095 - py, 1.30 - pz);
  const zl = (z) => z - pz, yl = (y) => y - py;

  // cast body: squashed egg (front-view shoulders fall away like the oracle;
  // the side crest 3.0+ band comes from the cupola/fittings row, not the shell)
  P.add('turret', lathe([
    [1.10, yl(1.47)], [1.30, yl(1.62)], [1.42, yl(2.02)], [1.30, yl(2.30)],
    [1.16, yl(2.52)], [0.98, yl(2.70)], [0.78, yl(2.82)], [0.45, yl(2.89)], [0.02, yl(2.91)],
  ], P.q ? 32 : 18, 1.0), 0, 0, zl(0.35));
  // long tapered nose to the mantlet (two stacked wedges approximate the cast curve)
  P.add('turret', slab(
    [-0.80, yl(1.92), zl(2.06)], [0.80, yl(1.92), zl(2.06)], [1.28, yl(1.86), zl(1.35)], [-1.28, yl(1.86), zl(1.35)],
    [-0.60, yl(2.52), zl(2.06)], [0.60, yl(2.52), zl(2.06)], [0.98, yl(2.86), zl(1.35)], [-0.98, yl(2.86), zl(1.35)]));
  P.add('turret', slab(
    [-0.34, yl(2.02), zl(2.62)], [0.34, yl(2.02), zl(2.62)], [0.80, yl(1.92), zl(2.06)], [-0.80, yl(1.92), zl(2.06)],
    [-0.32, yl(2.28), zl(2.62)], [0.32, yl(2.28), zl(2.62)], [0.60, yl(2.52), zl(2.06)], [-0.60, yl(2.52), zl(2.06)]));
  // long rear bustle
  P.add('turret', slab(
    [-1.28, yl(1.45), zl(-0.72)], [1.28, yl(1.45), zl(-0.72)], [1.08, yl(1.50), zl(-2.08)], [-1.08, yl(1.50), zl(-2.08)],
    [-1.02, yl(2.90), zl(-0.72)], [1.02, yl(2.90), zl(-0.72)], [0.88, yl(2.58), zl(-2.08)], [-0.88, yl(2.58), zl(-2.08)]));
  // roof fittings row behind the cupola (the oracle's 3.0+ side band)
  P.add('turret', box(0.52, 0.12, 0.60), 0.12, yl(2.99), zl(-0.45));

  // M19 cupola (left of centerline on this model): wide pedestal ring, drum,
  // raised hatch tip at 3.21 — this row is the reference's 3.0-3.2 side band
  const cx = -0.53, cz = zl(0.10);
  P.add('turret', cylY(0.44, 0.50, 0.13, P.q ? 20 : 12), cx, yl(2.955), cz);
  P.add('turret', cylY(0.36, 0.41, 0.13, P.q ? 20 : 12), cx, yl(3.08), cz);
  P.add('turret', cylY(0.27, 0.27, 0.07, 14), cx, yl(3.175), cz);
  P.add('turret', cylZ(0.028, 0.46, 8), cx + 0.12, yl(3.06), cz + 0.60);     // M85 stub

  // mantlet + optional searchlight (gunMount: pitches, no recoil)
  P.addGunExtra(box(0.74, 0.56, 0.34), 0, 0.02, 1.06);
  P.addGunExtra(xform(cylX(0.29, 0.66, 12), 0, 0, 0), 0, 0.03, 1.26);
  if (cfg.searchlight) {
    P.addGunExtra(box(0.78, 0.42, 0.50), 0.04, 0.475, 1.05);
    P.addGunExtra(xform(cylZ(0.19, 0.06, 12), 0, 0, 0), 0.04, 0.48, 1.32);
  }
  buildGun(P, {
    len: 4.70, r: 0.078, sleeve: !!cfg.sleeve, evac: 0.52, evacR: 1.62,
    collar: true, baseR: 0.16,
  });
  P.topY = 3.21 - py + 0.12;
}

// ---------------------------------------------------------------------------
// Measured per-tank constants (world coords; see docs/references/tanks/*.md)
// ---------------------------------------------------------------------------
const HULL_M26 = {
  W: 3.51, trackW: 0.58, sponsonY: 0.98,
  deck: [[2.55, 1.06], [1.80, 1.55], [-2.10, 1.55], [-2.90, 1.38], [-3.44, 1.24]],
  noseR: 0.42, noseY: 0.98, noseZ: 2.10,
  wheelR: 0.33, wheelSpan: [1.58, -2.55],
  sprocket: { z: -3.00, y: 0.52, r: 0.28 }, idler: { z: 1.90, y: 0.56, r: 0.27 },
  rollerN: 5, rollerY: 1.00, tension: { z: -2.62, y: 0.28, r: 0.13 },
};

const HULL_M45 = {
  W: 3.51, trackW: 0.58, sponsonY: 0.98,
  deck: [[3.09, 1.02], [2.68, 1.54], [-1.60, 1.54], [-3.10, 1.13]],
  noseR: 0.45, noseY: 0.80, noseZ: 2.60,
  wheelR: 0.33, wheelSpan: [1.88, -2.00],
  sprocket: { z: -2.85, y: 0.80, r: 0.27 }, idler: { z: 2.38, y: 0.60, r: 0.27 },
  rollerN: 5, rollerY: 1.00, tension: { z: -2.35, y: 0.32, r: 0.13 }, tailBoxZ: -3.34,
};

const HULL_M46 = {
  W: 3.51, trackW: 0.58, sponsonY: 1.00,
  deck: [[2.66, 1.15], [2.24, 1.66], [-3.00, 1.66], [-3.43, 1.50]],
  noseR: 0.40, noseY: 1.00, noseZ: 2.20,
  wheelR: 0.33, wheelSpan: [1.60, -2.55],
  sprocket: { z: -3.00, y: 0.52, r: 0.28 }, idler: { z: 1.95, y: 0.58, r: 0.27 },
  rollerN: 5, rollerY: 1.02, tension: { z: -2.58, y: 0.28, r: 0.13 },
  mufflerTopY: 1.78, mufflerZ: [-0.95, -2.95],
};

const HULL_M47 = {
  W: 3.51, trackW: 0.58, sponsonY: 1.00,
  deck: [[2.85, 1.15], [2.36, 1.64], [-3.05, 1.64], [-3.37, 1.53]],
  noseR: 0.40, noseY: 1.00, noseZ: 2.40,
  wheelR: 0.33, wheelSpan: [1.70, -2.60],
  sprocket: { z: -3.02, y: 0.58, r: 0.28 }, idler: { z: 2.08, y: 0.62, r: 0.27 },
  rollerN: 5, rollerY: 1.02, tension: { z: -2.64, y: 0.28, r: 0.13 },
  mufflerTopY: 1.77, mufflerZ: [-0.85, -2.90],
};

const HULL_M60 = {
  W: 3.631, trackW: 0.66, trackInset: 0.07, sponsonY: 1.12,
  deck: [[3.47, 1.31], [3.22, 1.55], [2.50, 1.575], [1.65, 1.76], [-0.55, 1.81],
    [-1.60, 1.90], [-3.30, 1.87], [-3.48, 1.47]],
  noseR: 0.50, noseY: 1.00, noseZ: 3.00, lowerY: 0.44,
  wheelR: 0.37, wheelY: 0.40, wheelSpan: [2.35, -2.42],
  sprocket: { z: -3.05, y: 0.80, r: 0.28 }, idler: { z: 2.90, y: 0.80, r: 0.27 },
  rollerN: 3, rollerY: 1.06,
};

export const PATTON_PROFILES = {
  m26_pershing: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M26, pivotY: 1.55, pivotZ: -1.70, gunY: 1.30, gunZ: -0.95,
      turret: {
        ringZ: -1.70, ringY: 1.55, halfW: 1.24, roofY: 2.31, frontZ: -0.85, rearZ: -3.02,
        stow: { z0: -3.02, z1: -3.40, topY: 1.62 },
        cupola: { x: 0.30, z: -2.20, r: 0.29, baseY: 2.18, topY: 2.36 },
        mg: { x: -0.22, z: -2.45, deckY: 1.98, topY: 2.33 },
      },
      gun: { muzzleZ: 3.46, r: 0.13, device: 'double', shieldW: 1.05, shieldH: 0.42, rootL: 0.16 },
    }),
  },
  m45_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M45, pivotY: 1.54, pivotZ: -0.50, gunY: 1.28, gunZ: -0.40,
      turret: {
        ringZ: -0.50, ringY: 1.54, halfW: 1.24, roofY: 2.29, frontZ: 0.45, rearZ: -1.90,
        bustle: { z0: -1.55, z1: -2.55, topY: 1.94, halfW: 0.95 },
        stow: { z0: -2.55, z1: -3.30, topY: 1.60, width: 1.66 },
        cupola: { x: -0.25, z: -1.30, r: 0.28, baseY: 2.14, topY: 2.33 },
        mg: { x: -0.80, z: -0.85, deckY: 2.00, topY: 2.33 },
      },
      // 105 mm M4 howitzer stub: muzzle stays inside the hull length bound
      gun: { muzzleZ: 2.90, r: 0.145, device: null, shieldW: 1.18, shieldH: 0.46, rootL: 0.18 },
    }),
  },
  m46_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M46, pivotY: 1.66, pivotZ: -0.85, gunY: 1.30, gunZ: -0.72,
      turret: {
        ringZ: -0.85, ringY: 1.66, halfW: 1.22, roofY: 2.30, frontZ: -0.10, rearZ: -2.15,
        bustle: { z0: -1.70, z1: -2.45, topY: 1.92, halfW: 0.95 },
        stow: { z0: -2.45, z1: -2.95, topY: 1.80 },
        cupola: { x: -0.30, z: -1.50, r: 0.28, baseY: 2.16, topY: 2.34 },
        mg: { x: -0.85, z: -0.60, deckY: 2.00, topY: 2.33 },
      },
      gun: { muzzleZ: 3.45, r: 0.125, device: 'm46', shieldW: 1.00, shieldH: 0.42, rootL: 0.16 },
    }),
  },
  m47_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M47, pivotY: 1.64, pivotZ: -0.70, gunY: 1.28, gunZ: -0.55,
      turret: {
        ringZ: -0.70, ringY: 1.64, halfW: 1.14, roofY: 2.50, frontZ: 0.10, rearZ: -1.90,
        bustle: { z0: -1.75, z1: -2.30, topY: 2.10, halfW: 1.00 },
        stow: { z0: -2.30, z1: -3.28, topY: 1.90 },
        blisters: { x: 1.02, y: 2.10, z: -0.35, r: 0.17 },
        cupola: { x: -0.55, z: -1.05, r: 0.27, baseY: 2.38, topY: 2.56 },
        mg: { x: -0.35, z: -1.48, deckY: 2.20, topY: 2.55 },
      },
      gun: { muzzleZ: 3.37, r: 0.125, device: 'm47', shieldW: 0.92, shieldH: 0.40, rootL: 0.16 },
    }),
  },
  m60a1: { build: (P) => buildM60(P, { hull: HULL_M60, searchlight: true, sleeve: false }) },
  m60a3: { build: (P) => buildM60(P, { hull: HULL_M60, searchlight: false, sleeve: true }) },
};
