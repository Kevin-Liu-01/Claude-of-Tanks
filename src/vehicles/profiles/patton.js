// US Patton/Pershing lineage procedural profiles (fidelity oracles:
// recovered M26/M45/M46/M47/M60 GLBs). Owned by the Patton family agent.
//
// Wave 1: measured silhouettes (docs/references/tanks/*.md — all constants
// are WORLD coordinates read off normalized reference masks + published
// dimensions; turret/gun pieces subtract their pivot at build time).
// Wave 2: shaded-parity surface pass (docs/critique/shaded-parity-r1.md) —
// material separation + glacis/deck/fender/roof furniture. Detail buckets
// (hullDark/hullDetail/hullGlass/turretDark/...) are mask-safe since the lab
// LOD fix, so fittings live in their proper material buckets.
//
// Fidelity notes that shape this module:
// - The gun component compares whole-mask pixels beyond the union hull length
//   bounds, centroid-aligned: overhang LENGTH and muzzle-device SHAPE matter,
//   trunnion height does not.
// - Four Pershing-family references have their turret casting sunk into the
//   hull (see packets). Hull/gear/gun match those oracles; turrets are
//   correct PROUD castings sized into the oracle's upper-mask envelope, so
//   their turret component is oracle-capped, not sloppy.
import { KIT, evenStations } from './kit.js';

// ---------------------------------------------------------------------------
// Shared hull: full-width deck-polyline construction + Patton running gear.
// H: { W, trackW, trackInset?, sponsonY, deck:[[z,y]...front->rear],
//      noseR, noseY, noseZ, lowerY?, wheelR, wheelY?, wheelSpan:[zF,zR],
//      sprocket:{z,y,r}, idler:{z,y,r}, rollerN, rollerY,
//      tension?:{z,y,r}, mufflerTopY?, mufflerZ?:[z0,z1], tailBoxZ? }
// ---------------------------------------------------------------------------
function pattonHull(P, H) {
  const { box, slab, cylX, cylZ, buildRunningGear } = KIT;
  const hw = H.W / 2 - 0.008;
  const innerW = H.W - 2 * H.trackW - 0.10;
  const spons = H.sponsonY;
  const deck = H.deck;
  const noseZ = deck[0][0], tailZ = deck[deck.length - 1][0];

  // full-width deck strip: one wedge slab per polyline segment
  for (let i = 0; i < deck.length - 1; i++) {
    const [zF, yF] = deck[i], [zR, yR] = deck[i + 1];
    const bottom = Math.min(spons, yF - 0.05, yR - 0.05);
    P.add('hull', slab(
      [-hw, bottom, zF], [hw, bottom, zF], [hw, bottom, zR], [-hw, bottom, zR],
      [-hw, yF, zF], [hw, yF, zF], [hw, yR, zR], [-hw, yR, zR]));
  }
  // fender plates continuing the sponson line over the running gear
  P.add('hull', box(hw * 2, 0.035, (noseZ - tailZ) * 0.985), 0, spons - 0.02, (noseZ + tailZ) / 2);

  // lower hull + rounded cast transmission nose + tail undercut
  const lowerY = H.lowerY ?? 0.45;
  P.add('hull', box(innerW, spons - lowerY, (noseZ - tailZ) * 0.88),
    0, (spons + lowerY) / 2, (noseZ + tailZ) / 2 * 0.96);
  P.add('hull', cylX(H.noseR, innerW, P.q ? 22 : 12), 0, H.noseY, H.noseZ);
  P.add('hull', box(innerW * 0.9, 0.36, 0.5), 0, 0.82, tailZ + 0.34);

  // rear-fender mufflers (M46/M47 raised rear read): proud cylinders with
  // tailpipes and dark heat shields — the family's loudest cue
  if (H.mufflerTopY) {
    const [mz0, mz1] = H.mufflerZ;
    const mr = 0.145, my = H.mufflerTopY - mr;
    for (const side of [-1, 1]) {
      P.add('hull', cylZ(mr, mz0 - mz1 - 0.3, P.q ? 16 : 10), side * (hw - 0.34), my, (mz0 + mz1) / 2 - 0.1);
      P.add('hull', cylZ(mr * 0.7, 0.22, 10), side * (hw - 0.34), my, mz0 - 0.02);
      P.add('hullDark', cylZ(0.052, 0.55, 8), side * (hw - 0.30), my - 0.06, mz1 - 0.14, 0.20, 0, 0);
      P.add('hullDark', box(0.30, 0.02, (mz0 - mz1) * 0.7), side * (hw - 0.34), H.mufflerTopY + 0.012, (mz0 + mz1) / 2);
    }
  }
  // tail fixture (m45: absorbs the reference's rear overhang into the hull bound)
  if (H.tailBoxZ) P.add('hull', box(1.45, 0.38, 2 * (tailZ - H.tailBoxZ)), 0, 1.13, tailZ);

  const wheelZs = evenStations(6, H.wheelSpan[0] - H.wheelSpan[1], (H.wheelSpan[0] + H.wheelSpan[1]) / 2);
  const rollers = evenStations(H.rollerN, (H.wheelSpan[0] - H.wheelSpan[1]) * 0.82,
    (H.wheelSpan[0] + H.wheelSpan[1]) / 2).map((z) => ({ z, y: H.rollerY, r: 0.10 }));
  if (H.tension) rollers.push(H.tension);
  const xc = H.W / 2 - H.trackW / 2 - (H.trackInset || 0);
  buildRunningGear(P, {
    style: 'dished', wheelR: H.wheelR, wheelW: Math.min(0.23, H.trackW * 0.38),
    wheelY: H.wheelY ?? H.wheelR + 0.03, xc,
    wheelZs, sprocket: H.sprocket, idler: H.idler,
    rollers, trackW: H.trackW, topY: H.rollerY + 0.04, paintedEnds: true,
    coveredTop: false, arms: true,
  });
  // return-roller brackets tie the rollers to the sponson floor
  for (const rl of rollers) for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.05, Math.max(0.06, spons - rl.y - 0.02), 0.14), side * xc, (spons + rl.y) / 2, rl.z);
  }
  // rubber mud flaps at both track ends
  for (const side of [-1, 1]) {
    P.add('hullRubber', box(H.trackW * 0.92, 0.26, 0.03), side * xc, spons - 0.16, noseZ - 0.10);
    P.add('hullRubber', box(H.trackW * 0.92, 0.24, 0.03), side * xc, spons - 0.15, tailZ + 0.06);
  }
  return { hw, xc, spons, noseZ, tailZ };
}

// Shared US-pattern hull furniture (mask-safe detail buckets).
function usFittings(P, hull, F) {
  const { box, cylY, cylZ, torus, headlight, liftEye, towCable, stowage, spareTrackStrip, shovelTool, periscope } = KIT;
  const { hw, spons, tailZ } = hull;
  // driver + assistant hatches with periscope hoods
  for (const side of [-1, 1]) {
    P.add('hull', cylY(0.19, 0.19, 0.045, P.q ? 18 : 10), side * 0.55, F.hatchY + 0.02, F.hatchZ);
    P.add('hullDark', box(0.30, 0.012, 0.05), side * 0.55, F.hatchY + 0.048, F.hatchZ);
    periscope(P, 'hullDetail', side * 0.55, F.hatchY + 0.03, F.hatchZ + 0.30);
  }
  // bow .30cal ball mount (Pershing signature)
  if (F.bowMG) {
    P.add('hull', KIT.sph(0.125, P.q ? 16 : 10), F.bowMG[0], F.bowMG[1], F.bowMG[2]);
    P.add('hullDark', cylZ(0.026, 0.30, 8), F.bowMG[0], F.bowMG[1] + 0.03, F.bowMG[2] + 0.15, F.bowMG[3], 0, 0);
  }
  // headlight pods with brush guards + horn
  for (const side of [-1, 1]) {
    headlight(P, side * F.lightX, F.lightY, F.lightZ, F.lightRx, 0.055);
    for (const dx of [-0.09, 0.09]) {
      P.add('hullDetail', box(0.02, 0.17, 0.02), side * F.lightX + dx, F.lightY + 0.03, F.lightZ + 0.05, F.lightRx, 0, 0);
    }
    P.add('hullDetail', box(0.20, 0.02, 0.02), side * F.lightX, F.lightY + 0.10, F.lightZ + 0.03, F.lightRx, 0, 0);
  }
  P.add('hullDetail', cylY(0.045, 0.055, 0.07, 10), -0.30, F.lightY - 0.02, F.lightZ);
  // tow shackles at the nose, lifting eyes at the tail
  for (const side of [-1, 1]) {
    P.add('hullDetail', torus(0.075, 0.017, 10), side * 0.58, F.shackleY, F.shackleZ, Math.PI / 2, 0, 0);
    liftEye(P, 'hullDetail', side * 0.62, F.rearY, tailZ + 0.03);
  }
  // fender stowage boxes + pioneer tools
  stowage(P, 'hullCloth', P.rng, F.boxZ.map(([z, d]) => [hw - 0.30, spons + 0.09, z, 0.42, 0.18, d]));
  stowage(P, 'hullCloth', P.rng, F.boxZ.slice(0, 2).map(([z, d]) => [-(hw - 0.30), spons + 0.09, z - 0.3, 0.42, 0.18, d]));
  if (F.toolZ != null) shovelTool(P, -(hw - 0.32), spons + 0.045, F.toolZ, 0.9);
  // engine deck: louvered grille banks + fuel caps
  const gm = (F.grilleZ0 + F.grilleZ1) / 2;
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.92, 0.018, F.grilleZ0 - F.grilleZ1), side * 0.55, F.grilleY + 0.012, gm, F.grilleRx || 0, 0, 0);
    const n = P.q ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const z = F.grilleZ0 - (i + 0.5) * ((F.grilleZ0 - F.grilleZ1) / n);
      const y = F.grilleY + 0.030 + (F.grilleRx ? (z - gm) * F.grilleRx : 0);
      P.add('hullDetail', box(0.88, 0.016, 0.05), side * 0.55, y, z);
    }
  }
  for (const side of [-1, 1]) P.add('hullDetail', cylY(0.07, 0.07, 0.035, 10), side * F.capX, F.capY, F.capZ);
  // rear plate: dark exhaust grille + deflector shelf + spare track links
  P.add('hullDark', box(1.30, 0.24, 0.03), 0, F.rearY - 0.26, tailZ - 0.01);
  P.add('hull', box(1.42, 0.045, 0.24), 0, F.rearY - 0.05, tailZ + 0.18, 0.35, 0, 0);
  if (F.spareZ) spareTrackStrip(P, 'hullTrack', F.spareZ[0], F.spareZ[1], F.spareZ[2], 3, F.spareZ[3] || 0);
  // gun travel lock on the rear deck
  if (F.lockZ != null) {
    for (const side of [-1, 1]) P.add('hullDetail', box(0.035, 0.30, 0.035), side * 0.12, F.lockY, F.lockZ, 0.35, 0, side * 0.25);
    P.add('hullDetail', box(0.20, 0.06, 0.08), 0, F.lockY + 0.14, F.lockZ + 0.05, 0.35, 0, 0);
  }
  // tow cable run along the left sponson
  if (F.cableZ0 != null) {
    towCable(P, [[-(hw - 0.18), spons + 0.03, F.cableZ0], [-(hw - 0.08), spons + 0.06, (F.cableZ0 + F.cableZ1) / 2], [-(hw - 0.18), spons + 0.03, F.cableZ1]]);
  }
}

// ---------------------------------------------------------------------------
// Turret furniture (LOD0 'turret' for silhouette mass; dark/glass for read)
// ---------------------------------------------------------------------------
// Pintle-mounted M2 .50cal: column + fork + receiver + jacketed barrel + ammo
function fiftyCal(P, x, deckY, z, topY) {
  const { box, cylY, cylZ, ammoCan } = KIT;
  P.add('turret', cylY(0.034, 0.046, topY - deckY - 0.22, 10), x, (deckY + topY - 0.22) / 2, z);
  P.add('turretDark', box(0.055, 0.15, 0.055), x, topY - 0.20, z);
  P.add('turretDark', box(0.17, 0.16, 0.64), x, topY - 0.115, z + 0.10);
  P.add('turretDark', cylZ(0.023, 0.74, 8), x, topY - 0.075, z + 0.78);
  P.add('turretDark', cylZ(0.037, 0.26, 8), x, topY - 0.075, z + 0.52);
  ammoCan(P, 'turretDark', x + 0.17, topY - 0.20, z + 0.02);
}

// T26-family proud cast turret (m26/m45/m46/m47 base), sized to the oracle
// envelope. T: { ringZ, ringY, halfW, roofY, frontZ, rearZ,
//   bustle?:{z0,z1,topY,halfW}, stow?:{z0,z1,topY,width?},
//   blisters?:{x,y,z,r}, cupola:{x,z,r,baseY,topY}, loader?, vent?, mg? }
function t26Turret(P, T) {
  const { box, lathe, frustum, cylY, sph, liftEye, cupola, ammoCan, tarpRoll } = KIT;
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
  if (T.stow) { // stowage/rack run trailing over (or past) the rear deck
    const zm = (T.stow.z0 + T.stow.z1) / 2 - T.ringZ;
    const d = T.stow.z0 - T.stow.z1;
    const w = T.stow.width ?? 1.55;
    P.add('turret', box(w, T.stow.topY - T.ringY - 0.12, d), 0, (T.stow.topY - T.ringY - 0.12) / 2 + 0.06, zm);
    P.add('turretDetail', box(w * 0.9, 0.03, 0.03), 0, T.stow.topY - T.ringY + 0.06, zm - d * 0.45);
    tarpRoll(P, 'turretDark', -w * 0.22, T.stow.topY - T.ringY + 0.05, zm, w * 0.40, 0.085, true, P.q ? 12 : 8);
    ammoCan(P, 'turretDark', w * 0.28, T.stow.topY - T.ringY + 0.06, zm, 0.3);
  }
  if (T.blisters) { // M47 stereoscopic rangefinder housings, both cheeks
    for (const side of [-1, 1]) {
      P.add('turret', sph(T.blisters.r, P.q ? 16 : 10), side * T.blisters.x,
        T.blisters.y - T.ringY, T.blisters.z - T.ringZ, 0, 0, 0, [1.05, 0.80, 1.55]);
      P.add('turretDark', KIT.cylX(T.blisters.r * 0.50, 0.03, 10), side * (T.blisters.x + T.blisters.r * 0.98),
        T.blisters.y - T.ringY, T.blisters.z - T.ringZ);
    }
  }
  // commander cupola (drum + split hatch + periscope ring), oval loader
  // hatch, ventilator dome, lifting eyes, cheek grab bars
  cupola(P, 'turret', T.cupola.x, T.cupola.baseY - T.ringY, T.cupola.z - T.ringZ,
    T.cupola.r, Math.max(0.08, T.cupola.topY - T.cupola.baseY - 0.06), 0);
  for (let k = 0; k < 5; k++) { // dark periscope blocks (turretGlass leaks into the hull mask)
    const a = (k / 5) * Math.PI * 1.7 - 0.6;
    P.add('turretDark', box(0.07, 0.045, 0.02), T.cupola.x + Math.sin(a) * T.cupola.r * 0.82,
      T.cupola.topY - T.ringY - 0.015, T.cupola.z - T.ringZ + Math.cos(a) * T.cupola.r * 0.82, 0, a, 0);
  }
  const lo = T.loader;
  P.add('turret', cylY(0.17, 0.17, 0.04, 14), lo.x, lo.y - T.ringY, lo.z - T.ringZ, 0, 0, 0, [1, 1, 1.3]);
  P.add('turretDark', box(0.05, 0.02, 0.16), lo.x + 0.15, lo.y - T.ringY + 0.02, lo.z - T.ringZ);
  P.add('turret', sph(0.095, 12, Math.PI / 2), (T.vent ?? { x: 0.05 }).x, h - 0.01, zc + (T.vent?.dz ?? 0.35));
  for (const side of [-1, 1]) {
    liftEye(P, 'turretDetail', side * T.halfW * 0.72, h * 0.74, zc + T.halfW * sz * 0.42);
    P.add('turretDetail', box(0.02, 0.02, 0.34), side * T.halfW * 0.94, h * 0.42, zc - T.halfW * sz * 0.18);
  }
  if (T.mg) fiftyCal(P, T.mg.x, T.mg.deckY - T.ringY, T.mg.z - T.ringZ, T.mg.topY - T.ringY);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [T.halfW * 0.985, h * 0.45, zc], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-T.halfW * 0.985, h * 0.45, zc], -Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Per-tank builds
// ---------------------------------------------------------------------------
function buildM26Family(P, cfg) {
  const { box, cylX, cylZ, buildGun, xform } = KIT;
  const hull = pattonHull(P, cfg.hull);
  usFittings(P, hull, cfg.fittings);
  P.turretG.position.set(0, cfg.pivotY, cfg.pivotZ);
  P.gunG.position.set(0, cfg.gunY - cfg.pivotY, cfg.gunZ - cfg.pivotZ);
  t26Turret(P, cfg.turret);

  const G = cfg.gun;
  const len = G.muzzleZ - cfg.gunZ;
  // cast gun shield: rounded core + backing plate + collar + coax port
  P.addGunExtra(box(G.shieldW, G.shieldH, 0.24), 0, 0.02, G.rootL);
  P.addGunExtra(xform(cylX(G.shieldH * 0.55, G.shieldW * 0.70, P.q ? 16 : 10), 0, 0, 0), 0, 0.02, G.rootL + 0.16);
  P.addGunExtra(xform(cylZ(G.r * 1.5, 0.30, 12, G.r * 1.8), 0, 0, 0), 0, 0, G.rootL + 0.26);
  P.addGunExtraDark(cylZ(0.030, 0.10, 8), G.shieldW * 0.30, 0.05, G.rootL + 0.14);
  buildGun(P, { len, r: G.r, sleeve: false, evac: null, collar: false, baseR: G.r * 1.8 });
  const sq = (r, l, at, s = 0.72) => P.add('gun', xform(cylZ(r, l, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [1, s, 1]), 0, 0, at);
  if (G.device === 'double') {           // M26/M3: twin flat-drum double baffle
    P.add('gunDark', cylZ(G.r * 0.70, 0.36, 10), 0, 0, len - 0.28);
    sq(0.27, 0.17, len - 0.44);
    sq(0.26, 0.15, len - 0.12);
    P.add('gun', cylZ(G.r * 1.06, 0.05, 10), 0, 0, len - 0.02);
  } else if (G.device === 'm46') {       // M3A1: evacuator drum + single baffle
    P.add('gun', cylZ(G.r * 1.52, 0.32, P.q ? 20 : 12), 0, 0, len - 0.34);
    P.add('gun', cylZ(G.r * 1.36, 0.16, 12), 0, 0, len - 0.09);
    P.add('gunDark', cylZ(G.r * 0.60, 0.10, 8), 0, 0, len - 0.19);
  } else if (G.device === 'm47') {       // M36: bore evacuator + blast deflector
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
  const { box, slab, lathe, cylX, cylY, cylZ, buildGun, xform, liftEye, tarpRoll, ammoCan } = KIT;
  const hull = pattonHull(P, cfg.hull);
  usFittings(P, hull, cfg.fittings);
  // splash board across the glacis
  P.add('hullDetail', box(2.30, 0.045, 0.10), 0, 1.67, 2.26, -0.30, 0, 0);
  const pz = 0.30, py = 1.76;
  P.turretG.position.set(0, py, pz);
  P.gunG.position.set(0, 2.065 - py, 1.30 - pz);
  const zl = (z) => z - pz, yl = (y) => y - py;

  // cast body: squashed egg (front-view shoulders fall away like the oracle;
  // the side crest 3.0+ band comes from the cupola/fittings row, not the shell)
  P.add('turret', lathe([
    [1.10, yl(1.47)], [1.30, yl(1.62)], [1.42, yl(2.02)], [1.30, yl(2.30)],
    [1.16, yl(2.52)], [0.98, yl(2.70)], [0.78, yl(2.82)], [0.45, yl(2.89)], [0.02, yl(2.91)],
  ], P.q ? 32 : 18, 1.0), 0, 0, zl(0.35));
  // long tapered CONE nose to the mantlet (smooth cast read — the wave-1
  // stacked wedges shaded as welded facets, critique bullet)
  P.add('turret', xform(cylZ(0.92, 1.34, P.q ? 22 : 14, 0.35), 0, 0, 0, 0.16, 0, 0, [1.42, 0.62, 1]),
    0, yl(2.26), zl(1.96));
  // long rear bustle
  P.add('turret', slab(
    [-1.28, yl(1.45), zl(-0.72)], [1.28, yl(1.45), zl(-0.72)], [1.08, yl(1.50), zl(-2.08)], [-1.08, yl(1.50), zl(-2.08)],
    [-1.02, yl(2.90), zl(-0.72)], [1.02, yl(2.90), zl(-0.72)], [0.88, yl(2.58), zl(-2.08)], [-0.88, yl(2.58), zl(-2.08)]));
  // roof fittings row behind the cupola (the oracle's 3.0+ side band)
  P.add('turret', box(0.52, 0.12, 0.60), 0.12, yl(2.99), zl(-0.45));

  // M19 cupola: pedestal ring, vision-block band (7 glass blocks), raised
  // hatch cap with rib, M85 receiver + barrel stub
  const cx = -0.53, cz = zl(0.10);
  P.add('turret', cylY(0.44, 0.50, 0.13, P.q ? 20 : 12), cx, yl(2.955), cz);
  P.add('turret', cylY(0.36, 0.41, 0.13, P.q ? 20 : 12), cx, yl(3.08), cz);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    P.add('turretDark', box(0.10, 0.055, 0.02), cx + Math.sin(a) * 0.375, yl(3.085), cz + Math.cos(a) * 0.375, 0, a, 0);
  }
  P.add('turret', cylY(0.27, 0.27, 0.07, 14), cx, yl(3.175), cz);
  P.add('turretDark', box(0.40, 0.015, 0.04), cx, yl(3.215), cz);
  P.add('turretDark', box(0.14, 0.10, 0.34), cx + 0.10, yl(3.05), cz + 0.42);
  P.add('turretDark', cylZ(0.026, 0.42, 8), cx + 0.10, yl(3.06), cz + 0.72);
  // grab rails along both cheeks + lifting eyes + bustle rack with stowage
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.022, 0.022, 1.15), side * 1.30, yl(2.55), zl(0.45));
    for (const dz of [-0.10, 1.00]) P.add('turretDetail', box(0.022, 0.09, 0.022), side * 1.30, yl(2.51), zl(dz));
    liftEye(P, 'turretDetail', side * 0.92, yl(2.80), zl(0.90));
  }
  P.add('turretDetail', box(1.95, 0.03, 0.03), 0, yl(2.40), zl(-2.24));
  P.add('turretDetail', box(1.95, 0.03, 0.03), 0, yl(1.78), zl(-2.24));
  for (let i = 0; i < 7; i++) P.add('turretDetail', box(0.024, 0.62, 0.024), -0.9 + i * 0.3, yl(2.09), zl(-2.24));
  tarpRoll(P, 'turretDark', -0.35, yl(2.60), zl(-1.55), 0.9, 0.10, true, P.q ? 12 : 8);
  ammoCan(P, 'turretDark', 0.55, yl(2.62), zl(-1.45), 0.4);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.30, [1.335, yl(2.30), zl(0.30)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.30, [-1.335, yl(2.30), zl(0.30)], -Math.PI / 2);

  if (cfg.a3) { // crosswind sensor mast + TTS blister, no searchlight
    P.add('turretDetail', cylY(0.014, 0.02, 0.42, 8), 0.35, yl(2.97), zl(-1.70));
    P.add('turretDark', box(0.05, 0.05, 0.14), 0.35, yl(3.17), zl(-1.70));
    P.add('turret', box(0.30, 0.22, 0.26), 0.72, yl(2.78), zl(1.15));
    P.add('turretDark', box(0.18, 0.10, 0.02), 0.72, yl(2.80), zl(1.29));
  }

  // mantlet: M140 collar + canvas dust-cover wedge over the gun root
  P.addGunExtra(box(0.74, 0.56, 0.30), 0, 0.02, 1.02);
  P.addGunExtra(xform(cylX(0.29, 0.66, 12), 0, 0, 0), 0, 0.03, 1.22);
  P.addGunExtra(xform(cylZ(0.155, 0.34, 12, 0.125), 0, 0, 0), 0, 0, 1.38);
  P.addGunExtraDark(box(0.60, 0.34, 0.05), 0, -0.02, 1.14);
  if (cfg.searchlight) { // AN/VSS-1: body + lens face + yoke arms
    P.addGunExtra(box(0.78, 0.42, 0.50), 0.04, 0.48, 1.04);
    P.addGunExtraDark(xform(cylZ(0.175, 0.03, 14), 0, 0, 0), 0.04, 0.48, 1.30);
    for (const side of [-1, 1]) {
      P.addGunExtra(box(0.045, 0.30, 0.045), 0.04 + side * 0.36, 0.24, 1.10, 0.2, 0, 0);
    }
  }
  buildGun(P, {
    // A3's thermal sleeve renders at r*1.22 — start from a slimmer bore so
    // the sleeved tube stays at the oracle's bare-tube width
    len: 4.66, r: cfg.sleeve ? 0.070 : 0.078, sleeve: !!cfg.sleeve,
    evac: 0.525, evacR: cfg.sleeve ? 1.80 : 1.62, collar: true, baseR: 0.16,
  });
  P.topY = 3.21 - py + 0.12;
}

// ---------------------------------------------------------------------------
// Measured per-tank constants (world coords; see docs/references/tanks/*.md)
// ---------------------------------------------------------------------------
const HULL_M26 = {
  W: 3.51, trackW: 0.58, sponsonY: 1.14,
  deck: [[2.55, 1.06], [1.80, 1.55], [-2.10, 1.55], [-2.90, 1.38], [-3.44, 1.24]],
  noseR: 0.42, noseY: 0.98, noseZ: 2.10,
  wheelR: 0.33, wheelSpan: [1.58, -2.55],
  sprocket: { z: -3.00, y: 0.52, r: 0.28 }, idler: { z: 1.90, y: 0.56, r: 0.27 },
  rollerN: 5, rollerY: 1.00, tension: { z: -2.62, y: 0.28, r: 0.15 },
};
const FIT_M26 = {
  hatchZ: 1.42, hatchY: 1.55, bowMG: [0.55, 1.32, 2.14, -0.55],
  lightX: 0.68, lightY: 1.50, lightZ: 1.92, lightRx: -0.50,
  shackleY: 1.04, shackleZ: 2.52, rearY: 1.20,
  grilleZ0: -1.55, grilleZ1: -2.55, grilleY: 1.475, grilleRx: -0.175,
  capX: 0.85, capY: 1.565, capZ: -1.15,
  boxZ: [[0.6, 0.8], [-0.6, 0.9], [-1.9, 0.7]], toolZ: 1.35,
  lockZ: -2.55, lockY: 1.50, spareZ: [-0.55, 1.42, 2.30, -0.55], cableZ0: 1.6, cableZ1: -0.6,
};

const HULL_M45 = {
  W: 3.51, trackW: 0.58, sponsonY: 1.14,
  deck: [[3.09, 1.02], [2.68, 1.54], [-1.60, 1.54], [-3.10, 1.13]],
  noseR: 0.45, noseY: 0.80, noseZ: 2.60,
  wheelR: 0.33, wheelSpan: [1.88, -2.00],
  sprocket: { z: -2.85, y: 0.80, r: 0.27 }, idler: { z: 2.38, y: 0.60, r: 0.27 },
  rollerN: 5, rollerY: 1.00, tension: { z: -2.35, y: 0.32, r: 0.15 }, tailBoxZ: -3.34,
};
const FIT_M45 = {
  hatchZ: 2.16, hatchY: 1.54, bowMG: [0.55, 1.30, 2.84, -0.68],
  lightX: 0.68, lightY: 1.48, lightZ: 2.76, lightRx: -0.62,
  shackleY: 1.00, shackleZ: 3.04, rearY: 1.06,
  grilleZ0: -1.75, grilleZ1: -2.70, grilleY: 1.415, grilleRx: -0.27,
  capX: 0.85, capY: 1.555, capZ: -1.35,
  boxZ: [[0.9, 0.8], [-0.3, 0.9], [-1.5, 0.7]], toolZ: 1.6,
  lockZ: -2.35, lockY: 1.34, spareZ: [-0.55, 1.38, 2.82, -0.62],
};

const HULL_M46 = {
  W: 3.51, trackW: 0.58, sponsonY: 1.16,
  deck: [[2.66, 1.15], [2.24, 1.66], [-3.00, 1.66], [-3.43, 1.50]],
  noseR: 0.40, noseY: 1.00, noseZ: 2.20,
  wheelR: 0.33, wheelSpan: [1.60, -2.55],
  sprocket: { z: -3.00, y: 0.52, r: 0.28 }, idler: { z: 1.95, y: 0.58, r: 0.27 },
  rollerN: 5, rollerY: 1.02, tension: { z: -2.58, y: 0.28, r: 0.15 },
  mufflerTopY: 1.80, mufflerZ: [-0.95, -2.95],
};
const FIT_M46 = {
  hatchZ: 1.85, hatchY: 1.66, bowMG: [0.55, 1.42, 2.42, -0.68],
  lightX: 0.68, lightY: 1.62, lightZ: 2.32, lightRx: -0.60,
  shackleY: 1.12, shackleZ: 2.62, rearY: 1.42,
  grilleZ0: -1.60, grilleZ1: -2.70, grilleY: 1.665, grilleRx: 0,
  capX: 0.55, capY: 1.675, capZ: -1.30,
  boxZ: [[0.7, 0.8], [-0.4, 0.9]], toolZ: 1.45,
  lockZ: -2.60, lockY: 1.64, spareZ: [-0.55, 1.50, 2.52, -0.62],
};

const HULL_M47 = {
  W: 3.51, trackW: 0.58, sponsonY: 1.16,
  deck: [[2.85, 1.15], [2.36, 1.64], [-3.05, 1.64], [-3.37, 1.53]],
  noseR: 0.40, noseY: 1.00, noseZ: 2.40,
  wheelR: 0.33, wheelSpan: [1.70, -2.60],
  sprocket: { z: -3.02, y: 0.58, r: 0.28 }, idler: { z: 2.08, y: 0.62, r: 0.27 },
  rollerN: 5, rollerY: 1.02, tension: { z: -2.64, y: 0.28, r: 0.15 },
  mufflerTopY: 1.79, mufflerZ: [-0.85, -2.90],
};
const FIT_M47 = {
  hatchZ: 2.00, hatchY: 1.64, bowMG: [0.55, 1.40, 2.60, -0.62],
  lightX: 0.68, lightY: 1.60, lightZ: 2.50, lightRx: -0.58,
  shackleY: 1.12, shackleZ: 2.80, rearY: 1.44,
  grilleZ0: -1.60, grilleZ1: -2.70, grilleY: 1.645, grilleRx: 0,
  capX: 0.55, capY: 1.655, capZ: -1.30,
  boxZ: [[0.8, 0.8], [-0.3, 0.9]], toolZ: 1.55,
  lockZ: -2.65, lockY: 1.62, spareZ: [-0.55, 1.48, 2.70, -0.58],
};

const HULL_M60 = {
  W: 3.631, trackW: 0.66, trackInset: 0.07, sponsonY: 1.22,
  deck: [[3.47, 1.31], [3.22, 1.55], [2.50, 1.575], [1.65, 1.76], [-0.55, 1.81],
    [-1.60, 1.90], [-3.30, 1.87], [-3.48, 1.47]],
  noseR: 0.50, noseY: 1.00, noseZ: 3.00, lowerY: 0.44,
  wheelR: 0.37, wheelY: 0.40, wheelSpan: [2.30, -2.38],
  sprocket: { z: -3.00, y: 0.82, r: 0.28 }, idler: { z: 2.85, y: 0.82, r: 0.27 },
  rollerN: 3, rollerY: 1.06,
};
const FIT_M60 = {
  hatchZ: 2.30, hatchY: 1.635,
  lightX: 0.95, lightY: 1.70, lightZ: 2.10, lightRx: -0.18,
  shackleY: 1.20, shackleZ: 3.30, rearY: 1.50,
  grilleZ0: -1.75, grilleZ1: -3.15, grilleY: 1.90, grilleRx: 0,
  capX: 0.80, capY: 1.915, capZ: -1.35,
  boxZ: [[1.2, 0.9], [0.0, 1.0]], toolZ: 2.0,
  lockZ: -2.85, lockY: 1.90, spareZ: null, cableZ0: 2.2, cableZ1: -0.2,
};

export const PATTON_PROFILES = {
  m26_pershing: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M26, fittings: FIT_M26,
      pivotY: 1.55, pivotZ: -1.70, gunY: 1.60, gunZ: -0.95,
      turret: {
        ringZ: -1.70, ringY: 1.55, halfW: 1.24, roofY: 2.31, frontZ: -0.85, rearZ: -3.02,
        stow: { z0: -3.02, z1: -3.40, topY: 1.62 },
        cupola: { x: 0.30, z: -2.20, r: 0.29, baseY: 2.18, topY: 2.36 },
        loader: { x: -0.48, z: -1.95, y: 2.22 },
        vent: { x: 0.05, dz: 0.55 },
        mg: { x: -0.22, z: -2.45, deckY: 1.98, topY: 2.33 },
      },
      gun: { muzzleZ: 3.46, r: 0.14, device: 'double', shieldW: 1.05, shieldH: 0.46, rootL: 0.16 },
    }),
  },
  m45_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M45, fittings: FIT_M45,
      pivotY: 1.54, pivotZ: -0.50, gunY: 1.58, gunZ: -0.40,
      turret: {
        ringZ: -0.50, ringY: 1.54, halfW: 1.24, roofY: 2.29, frontZ: 0.45, rearZ: -1.90,
        bustle: { z0: -1.55, z1: -2.55, topY: 1.94, halfW: 0.95 },
        stow: { z0: -2.55, z1: -3.30, topY: 1.60, width: 1.66 },
        cupola: { x: 0.32, z: -1.35, r: 0.28, baseY: 2.14, topY: 2.33 },
        loader: { x: -0.42, z: -1.10, y: 2.18 },
        vent: { x: 0.05, dz: 0.50 },
        mg: { x: -0.80, z: -0.85, deckY: 2.00, topY: 2.33 },
      },
      // 105 mm M4 howitzer: SHORT fat tube (~L/22) in the counterweighted
      // M71 shield; muzzle stays inside the hull length bound
      gun: { muzzleZ: 2.45, r: 0.16, device: null, shieldW: 1.30, shieldH: 0.62, rootL: 0.20 },
    }),
  },
  m46_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M46, fittings: FIT_M46,
      pivotY: 1.66, pivotZ: -0.85, gunY: 1.70, gunZ: -0.72,
      turret: {
        ringZ: -0.85, ringY: 1.66, halfW: 1.22, roofY: 2.30, frontZ: -0.10, rearZ: -2.15,
        bustle: { z0: -1.70, z1: -2.45, topY: 1.92, halfW: 0.95 },
        stow: { z0: -2.45, z1: -2.95, topY: 1.80 },
        cupola: { x: 0.32, z: -1.55, r: 0.28, baseY: 2.16, topY: 2.34 },
        loader: { x: -0.44, z: -1.30, y: 2.20 },
        vent: { x: 0.05, dz: 0.50 },
        mg: { x: -0.85, z: -0.60, deckY: 2.00, topY: 2.33 },
      },
      gun: { muzzleZ: 3.45, r: 0.125, device: 'm46', shieldW: 1.00, shieldH: 0.46, rootL: 0.16 },
    }),
  },
  m47_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M47, fittings: FIT_M47,
      pivotY: 1.64, pivotZ: -0.70, gunY: 1.66, gunZ: -0.55,
      turret: {
        ringZ: -0.70, ringY: 1.64, halfW: 1.14, roofY: 2.50, frontZ: 0.10, rearZ: -1.90,
        bustle: { z0: -1.75, z1: -2.30, topY: 2.10, halfW: 1.00 },
        stow: { z0: -2.30, z1: -3.28, topY: 1.90 },
        blisters: { x: 1.02, y: 2.10, z: -0.35, r: 0.17 },
        cupola: { x: -0.55, z: -1.05, r: 0.27, baseY: 2.38, topY: 2.56 },
        loader: { x: 0.45, z: -0.95, y: 2.36 },
        vent: { x: 0.05, dz: 0.45 },
        mg: { x: -0.35, z: -1.48, deckY: 2.20, topY: 2.55 },
      },
      gun: { muzzleZ: 3.37, r: 0.125, device: 'm47', shieldW: 0.92, shieldH: 0.44, rootL: 0.16 },
    }),
  },
  m60a1: { build: (P) => buildM60(P, { hull: HULL_M60, fittings: FIT_M60, searchlight: true, sleeve: false }) },
  m60a3: { build: (P) => buildM60(P, { hull: HULL_M60, fittings: FIT_M60, searchlight: false, sleeve: true, a3: true }) },
};
