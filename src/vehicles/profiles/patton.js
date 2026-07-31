// US Patton/Pershing lineage procedural profiles (fidelity oracles:
// recovered M26/M45/M46/M47/M60 GLBs). Owned by the Patton family agent.
//
// Wave 1: measured silhouettes (docs/references/tanks/*.md).
// Wave 2: shaded-parity surface pass (shaded-parity-r1.md).
// Wave 3 (this pass, shaded-parity-r2.md): the four Pershing turrets are
// rebuilt against the REPAIRED oracles (turrets now seated) — the shared
// rear-set egg dome is gone. Every constant below was re-measured off the
// repaired reference masks (turret-only subtree renders, world coords):
//   m26  ring (−1.55, 1.55)  dome −0.25…−2.45 roof 2.31, bustle to −2.98,
//        rack to −3.46, cupola RIGHT (x −0.46) top 2.40, M2 band y≈2.6−2.75
//        running FORWARD from a bustle pintle (z −2.55 → tip −1.24).
//   m45  ring (−1.16, 1.54)  dome +0.30…−2.05 roof 2.30, bustle to −2.82,
//        rack to −3.14; M2 front-RIGHT (x −0.42), barrel tip +0.36; howitzer
//        muzzle +1.45 (reference stub ends there — NOT +2.45).
//   m46  ring (−1.53, 1.66)  same T26 casting as m26, roof 2.37,
//        rack to −3.46 (band 1.6…1.9).
//   m47  ring (−1.00, 1.64)  needle nose to +0.38, roof plateau 2.50 over
//        −0.5…−1.9, LONG bustle band top ≈2.16 / floor ≈1.55 to −3.40,
//        blisters ±1.0 at y 2.10, cupola top 2.55, M2 band 2.87…2.94.
// Artifact audit (r2 §9): m45's floating stow tarp + open grille pit fixed
// (rack now hangs off the bustle on rails/struts; grilles are framed louver
// bays); m46/m47 mufflers are real cylinders with elbows, no flat lids.
import { KIT, evenStations } from './kit.js';

// ---------------------------------------------------------------------------
// Shared hull: full-width deck-polyline construction + Patton running gear.
// H: { W, trackW, trackInset?, sponsonY, deck:[[z,y]...front->rear],
//      noseR, noseY, noseZ, lowerY?, wheelR, wheelY?, wheelSpan:[zF,zR],
//      sprocket:{z,y,r}, idler:{z,y,r}, rollerN, rollerY,
//      tension?:{z,y,r}, mufflerTopY?, mufflerZ?:[z0,z1], tailBoxZ? }
// ---------------------------------------------------------------------------
function pattonHull(P, H) {
  const { box, slab, cylX, cylZ, torus, buildRunningGear } = KIT;
  const hw = H.W / 2 - 0.008;
  const innerW = H.W - 2 * H.trackW - 0.10;
  const spons = H.sponsonY;
  const deck = H.deck;
  const noseZ = deck[0][0], tailZ = deck[deck.length - 1][0];
  // deck height lookup (world z -> deck y) for seating fittings ON the deck
  const deckAt = (z) => {
    for (let i = 0; i < deck.length - 1; i++) {
      const [z0, y0] = deck[i], [z1, y1] = deck[i + 1];
      if (z <= z0 && z >= z1) return y0 + (y1 - y0) * ((z - z0) / (z1 - z0));
    }
    return z > deck[0][0] ? deck[0][1] : deck[deck.length - 1][1];
  };

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

  // rear-fender mufflers (M46/M47): PROUD CYLINDERS with end caps, exhaust
  // elbows tying them into the hull rear plate, and a short dark tailpipe.
  // shaded-parity r2: the old flat dark heat-shield lid hid the cylinder from
  // above ("two flat grey slabs") — deleted; thin dark straps instead.
  if (H.mufflerTopY) {
    const [mz0, mz1] = H.mufflerZ;
    const mr = 0.15, my = H.mufflerTopY - mr, mx = hw - 0.34;
    const mlen = mz0 - mz1 - 0.3;
    for (const side of [-1, 1]) {
      P.add('hull', cylZ(mr, mlen, P.q ? 18 : 10), side * mx, my, (mz0 + mz1) / 2 - 0.1);
      // end caps (slightly proud discs both ends)
      P.add('hull', cylZ(mr * 0.82, 0.05, 12), side * mx, my, mz0 + 0.06);
      P.add('hull', cylZ(mr * 0.82, 0.05, 12), side * mx, my, mz1 - 0.24);
      // intake elbow: pipe rising from the deck lip into the muffler front
      P.add('hullDark', cylZ(0.062, 0.30, 8), side * (mx - 0.06), my - 0.10, mz0 + 0.16, 0.85, 0, 0);
      // dark tailpipe out the rear cap, angled down
      P.add('hullDark', cylZ(0.055, 0.42, 8), side * mx, my - 0.07, mz1 - 0.30, 0.35, 0, 0);
      // cinch straps (replace the old full-length lid plate)
      for (const dz of [0.30, -0.55]) {
        P.add('hullDark', cylZ(mr * 1.04, 0.035, 12), side * mx, my, (mz0 + mz1) / 2 + dz);
      }
      // mounting saddle legs onto the fender
      for (const dz of [0.24, -0.60]) {
        P.add('hullDetail', box(0.05, my - spons + 0.04, 0.07), side * mx, (my + spons) / 2, (mz0 + mz1) / 2 + dz);
      }
    }
  }
  // tail fixture (m45: absorbs the reference's rear overhang into the hull bound)
  if (H.tailBoxZ) P.add('hull', box(1.45, 0.38, 2 * (tailZ - H.tailBoxZ)), 0, 1.13, tailZ);
  // rear-deck tongues (m47): the oracle's hull plan stops ≈−3.2 under its
  // bustle overhang but its sparse rack reads through from above — twin deck
  // plates under the overhang reproduce that sparse top strip
  if (H.tailTongues) {
    for (const [tx, tw, tz1] of H.tailTongues) {
      P.add('hull', box(tw, 0.045, tz1 !== tailZ ? Math.abs(tailZ - tz1) + 0.06 : 0.1),
        tx, deckAt(tailZ) - 0.005, (tailZ + tz1) / 2);
    }
  }

  const wheelZs = evenStations(6, H.wheelSpan[0] - H.wheelSpan[1], (H.wheelSpan[0] + H.wheelSpan[1]) / 2);
  const rollers = evenStations(H.rollerN, (H.wheelSpan[0] - H.wheelSpan[1]) * 0.82,
    (H.wheelSpan[0] + H.wheelSpan[1]) / 2).map((z) => ({ z, y: H.rollerY, r: 0.10 }));
  if (H.tension) rollers.push(H.tension);
  const xc = H.W / 2 - H.trackW / 2 - (H.trackInset || 0);
  const wheelW = Math.min(0.23, H.trackW * 0.38);
  const wy = H.wheelY ?? H.wheelR + 0.03;
  buildRunningGear(P, {
    style: 'dished', wheelR: H.wheelR, wheelW,
    wheelY: wy, xc,
    wheelZs, sprocket: H.sprocket, idler: H.idler,
    rollers, trackW: H.trackW, topY: H.rollerY + 0.04, paintedEnds: true,
    coveredTop: false, arms: true,
  });
  // shaded-parity r2 §1 ("wheel faces are FLAT — no bolt rings"): the dished
  // wheel's built-in bolt ring is ~1 px at board scale. Stand a readable dark
  // hub ring + 6 fat bolt studs on every outer wheel face.
  for (const z of wheelZs) {
    for (const side of [-1, 1]) {
      const fx = side * (xc + wheelW / 2 + 0.012);
      P.add('hullDark', torus(H.wheelR * 0.30, 0.015, 16), fx, wy, z, 0, 0, Math.PI / 2);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.26;
        P.add('hullDark', cylX(0.026, 0.05, 6), fx,
          wy + Math.sin(a) * H.wheelR * 0.52, z + Math.cos(a) * H.wheelR * 0.52);
      }
    }
  }
  // return-roller brackets tie the rollers to the sponson floor
  for (const rl of rollers) for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.05, Math.max(0.06, spons - rl.y - 0.02), 0.14), side * xc, (spons + rl.y) / 2, rl.z);
  }
  // rubber mud flaps at both track ends
  for (const side of [-1, 1]) {
    P.add('hullRubber', box(H.trackW * 0.92, 0.26, 0.03), side * xc, spons - 0.16, noseZ - 0.10);
    P.add('hullRubber', box(H.trackW * 0.92, 0.24, 0.03), side * xc, spons - 0.15, tailZ + 0.06);
  }
  return { hw, xc, spons, noseZ, tailZ, deckAt };
}

// Shared US-pattern hull furniture (mask-safe detail buckets).
function usFittings(P, hull, F) {
  const { box, cylY, cylZ, torus, headlight, liftEye, towCable, stowage, spareTrackStrip, shovelTool, periscope } = KIT;
  const { hw, tailZ, deckAt } = hull;
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
  // fender stowage + pioneer tools seated ON the deck rim. Placement rule
  // (pass-2 mask lesson): deck-edge kit occludes the gun-tube band and the
  // turret base in the hull mask — kit only goes where the reference carries
  // it AND where its top stays below the tube underside (glacis/rear deck).
  if (F.boxR?.length) stowage(P, 'hullCloth', P.rng, F.boxR.map(([z, d, h]) => [hw - 0.32, deckAt(z) + 0.005 + (h ?? 0.14) / 2, z, 0.40, h ?? 0.14, d]));
  if (F.boxL?.length) stowage(P, 'hullCloth', P.rng, F.boxL.map(([z, d, h]) => [-(hw - 0.32), deckAt(z) + 0.005 + (h ?? 0.14) / 2, z, 0.40, h ?? 0.14, d]));
  if (F.toolZ != null) shovelTool(P, -(hw - 0.34), deckAt(F.toolZ) + 0.038, F.toolZ, 0.9);
  // engine deck: framed louvered grille bays (r2 m45: the bare dark plates
  // read as an OPEN BLACK VOID — the bays now carry rails, a centre spine and
  // deep flush slats so they read as a louvered surface, not a pit)
  const gm = (F.grilleZ0 + F.grilleZ1) / 2;
  const gd = F.grilleZ0 - F.grilleZ1;
  const gy = (z, lift) => F.grilleY + lift + (F.grilleRx ? (z - gm) * F.grilleRx : 0);
  for (const side of [-1, 1]) {
    const gx = side * 0.55;
    P.add('hullDark', box(0.92, 0.016, gd), gx, gy(gm, 0.008), gm, F.grilleRx || 0, 0, 0);
    // side rails of each bay
    for (const dx of [-0.47, 0.47]) {
      P.add('hull', box(0.07, 0.032, gd + 0.05), gx + dx, gy(gm, 0.016), gm, F.grilleRx || 0, 0, 0);
    }
    const n = 7;
    for (let i = 0; i < n; i++) {
      const z = F.grilleZ0 - (i + 0.5) * (gd / n);
      P.add('hullDetail', box(0.86, 0.02, (gd / n) * 0.62), gx, gy(z, 0.026), z, F.grilleRx || 0, 0, 0);
    }
  }
  // centre spine + end caps close the bays
  P.add('hull', box(0.12, 0.035, gd + 0.05), 0, gy(gm, 0.018), gm, F.grilleRx || 0, 0, 0);
  for (const z of [F.grilleZ0 + 0.02, F.grilleZ1 - 0.02]) {
    P.add('hull', box(2.06, 0.035, 0.07), 0, gy(z, 0.016), z, F.grilleRx || 0, 0, 0);
  }
  for (const side of [-1, 1]) P.add('hullDetail', cylY(0.07, 0.07, 0.035, 10), side * F.capX, F.capY, F.capZ);
  // rear plate: dark exhaust grille + deflector shelf + spare track links
  P.add('hullDark', box(1.30, 0.24, 0.03), 0, F.rearY - 0.26, tailZ - 0.01);
  if (F.deflector !== false) {
    P.add('hull', box(1.42, 0.045, 0.24), 0, F.rearY - 0.05, tailZ + 0.18, 0.35, 0, 0);
    for (const side of [-1, 1]) { // support brackets (r2: plate hung unbracketed)
      P.add('hullDetail', box(0.035, 0.14, 0.04), side * 0.60, F.rearY - 0.13, tailZ + 0.10, 0.35, 0, 0);
    }
  }
  if (F.spareZ) spareTrackStrip(P, 'hullTrack', F.spareZ[0], F.spareZ[1], F.spareZ[2], 3, F.spareZ[3] || 0);
  // gun travel lock on the rear deck
  if (F.lockZ != null) {
    for (const side of [-1, 1]) P.add('hullDetail', box(0.035, 0.30, 0.035), side * 0.12, F.lockY, F.lockZ, 0.35, 0, side * 0.25);
    P.add('hullDetail', box(0.20, 0.06, 0.08), 0, F.lockY + 0.14, F.lockZ + 0.05, 0.35, 0, 0);
  }
  // tow cable draped along the left deck edge
  if (F.cableZ0 != null) {
    towCable(P, [
      [-(hw - 0.16), deckAt(F.cableZ0) + 0.03, F.cableZ0],
      [-(hw - 0.06), deckAt((F.cableZ0 + F.cableZ1) / 2) + 0.05, (F.cableZ0 + F.cableZ1) / 2],
      [-(hw - 0.16), deckAt(F.cableZ1) + 0.03, F.cableZ1],
    ]);
  }
}

// ---------------------------------------------------------------------------
// Turret furniture (LOD0 'turret' for silhouette mass; dark/glass for read)
// ---------------------------------------------------------------------------
// Pintle-mounted M2 .50cal with a REAL pintle (r2 m45: "stick crosses the
// cheek unsupported"). World coords; caller converts via the local frame.
// M: { x, z, deckY, axisY, barrelLen }
function fiftyCal(P, M, yl, zl) {
  const { box, cylY, cylZ, ammoCan } = KIT;
  const y = (v) => yl(v), z = (v) => zl(v);
  // pintle column + fork + cradle (the oracle's MG station is a solid stack,
  // not a stick — pass-2 front-mask lesson)
  P.add('turret', cylY(0.034, 0.05, M.axisY - 0.13 - M.deckY, 10), M.x, y((M.deckY + M.axisY - 0.13) / 2), z(M.z));
  P.add('turretDark', box(0.06, 0.14, 0.06), M.x, y(M.axisY - 0.10), z(M.z));
  // receiver + top cover + spade grips
  P.add('turretDark', box(0.16, 0.17, 0.62), M.x, y(M.axisY), z(M.z + 0.10));
  P.add('turretDark', box(0.10, 0.05, 0.30), M.x, y(M.axisY + 0.10), z(M.z + 0.16));
  P.add('turretDark', box(0.14, 0.05, 0.06), M.x, y(M.axisY + 0.02), z(M.z - 0.24));
  // barrel: perforated jacket + tube, pointing FORWARD like the oracle
  P.add('turretDark', cylZ(0.040, 0.30, 8), M.x, y(M.axisY + 0.01), z(M.z + 0.55));
  P.add('turretDark', cylZ(0.023, M.barrelLen, 8), M.x, y(M.axisY + 0.01), z(M.z + 0.41 + M.barrelLen / 2));
  ammoCan(P, 'turretDark', M.x + 0.19, y(M.axisY - 0.04), z(M.z + 0.04));
  if (M.wide) { // T26 oracles show a WIDE station blob; the M47's is a thin stalk
    P.add('turretDark', box(0.32, 0.12, 0.34), M.x + 0.02, y(M.axisY - 0.15), z(M.z + 0.04));
    ammoCan(P, 'turretDark', M.x - 0.17, y(M.axisY - 0.06), z(M.z - 0.06), 0.15);
  }
}

// Bustle stowage rack: rails + floor + struts, ATTACHED to the bustle rear
// (r2 m45 §9: the old deck-level stow tarp floated over the grille pit).
// R: { z0 (front, overlaps bustle), z1, halfW, floorY, railY }
function bustleRack(P, R, yl, zl, rng) {
  const { box, tarpRoll, ammoCan } = KIT;
  const zm = (R.z0 + R.z1) / 2, d = R.z0 - R.z1;
  // floor slats + side/rear rails
  for (const fx of [-0.55, 0, 0.55]) {
    P.add('turretDetail', box(0.05, 0.028, d), fx * R.halfW * 1.5, yl(R.floorY), zl(zm));
  }
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.032, 0.032, d), side * R.halfW, yl(R.railY), zl(zm));
    // vertical posts front/rear + diagonal strut into the bustle face
    for (const pz of [R.z0 - 0.03, R.z1 + 0.04]) {
      P.add('turretDetail', box(0.03, R.railY - R.floorY + 0.05, 0.03), side * R.halfW, yl((R.railY + R.floorY) / 2), zl(pz));
    }
    P.add('turretDetail', box(0.028, 0.028, 0.34), side * (R.halfW - 0.05), yl(R.railY + 0.05), zl(R.z0 + 0.10), 0.45, 0, 0);
  }
  P.add('turretDetail', box(R.halfW * 2, 0.032, 0.032), 0, yl(R.railY), zl(R.z1 + 0.04));
  // strapped stowage INSIDE the rack frame
  tarpRoll(P, 'turretDark', -R.halfW * 0.34, yl(R.floorY + 0.10), zl(zm), R.halfW * 0.9, 0.095, true, P.q ? 12 : 8);
  ammoCan(P, 'turretDark', R.halfW * 0.42, yl(R.floorY + 0.11), zl(zm + 0.05), 0.3);
  P.add('turretDark', box(0.34, 0.16, d * 0.5), R.halfW * 0.30, yl(R.floorY + 0.09), zl(zm - d * 0.2), 0, rng() * 0.2, 0);
}

// T26-family proud cast turret (m26/m45/m46), rebuilt against the repaired
// oracles. All T fields are WORLD coords.
// T: { ringZ, ringY, halfW, domeFront, domeRear, roofY,
//      bustle:{z0,z1,w0,w1,top0,top1,floor0,floor1}, rack:{...bustleRack},
//      cupola:{x,z,r,baseY,h}, loader:{x,z,y}, vent:{x,z},
//      mg:{x,z,deckY,axisY,barrelLen}, stowBump?:{x,z,r,len} }
function t26Turret(P, T) {
  const { box, lathe, slab, cylY, sph, liftEye, cupola } = KIT;
  const yl = (y) => y - T.ringY, zl = (z) => z - T.ringZ;
  const h = T.roofY - T.ringY;
  const hw = T.halfW;
  const zc = zl((T.domeFront + T.domeRear) / 2);
  const halfDepth = (T.domeFront - T.domeRear) / 2;
  // cast dome: bulged cheeks, long roof plateau, nose reaching the oracle's
  // forward ring position (the r2 "rear-set egg" fix)
  P.add('turret', lathe([
    [hw * 0.84, -0.06], [hw * 1.00, h * 0.18], [hw * 0.965, h * 0.42],
    [hw * 0.875, h * 0.64], [hw * 0.72, h * 0.83], [hw * 0.545, h * 0.945],
    [hw * 0.52, h * 0.985], [hw * 0.28, h], [0.02, h],
  ], P.q ? 32 : 18, halfDepth / hw), 0, 0, zc);
  // proud turret-ring collar at the base (the oracle's base band reads a few
  // cm below the deck line all round)
  P.add('turret', KIT.cylY(hw * 0.87, hw * 0.91, 0.13, P.q ? 26 : 14), 0, -0.045, zc, 0, 0, 0, [1, 1, Math.min(1, halfDepth / hw)]);
  // bustle: a real casting continuation (top nearly at plateau height), not
  // a low box — the repaired oracle's bustle top reads 2.16-2.26.
  const B = T.bustle;
  P.add('turret', slab(
    [-B.w0, yl(B.floor0), zl(B.z0)], [B.w0, yl(B.floor0), zl(B.z0)],
    [B.w1, yl(B.floor1), zl(B.z1)], [-B.w1, yl(B.floor1), zl(B.z1)],
    [-B.w0, yl(B.top0), zl(B.z0)], [B.w0, yl(B.top0), zl(B.z0)],
    [B.w1 * 0.94, yl(B.top1), zl(B.z1)], [-B.w1 * 0.94, yl(B.top1), zl(B.z1)]));
  bustleRack(P, T.rack, yl, zl, P.rng);
  if (T.stowBump) { // stowage lump riding the bustle roof (m45 oracle bump)
    KIT.tarpRoll(P, 'turretDark', T.stowBump.x, yl(T.stowBump.y), zl(T.stowBump.z), T.stowBump.len, T.stowBump.r, true, P.q ? 12 : 8);
  }
  // commander cupola RIGHT (world −x, oracle-verified), loader hatch LEFT
  cupola(P, 'turret', T.cupola.x, yl(T.cupola.baseY), zl(T.cupola.z), T.cupola.r, T.cupola.h, 6);
  const lo = T.loader;
  P.add('turret', cylY(0.17, 0.17, 0.045, 14), lo.x, yl(lo.y), zl(lo.z), 0, 0, 0, [1, 1, 1.3]);
  P.add('turretDark', box(0.05, 0.02, 0.16), lo.x + 0.15, yl(lo.y) + 0.024, zl(lo.z));
  // ventilator dome
  P.add('turret', sph(0.095, 12, Math.PI / 2), T.vent.x, yl(T.roofY) - 0.015, zl(T.vent.z));
  // lifting eyes + cheek grab rails
  for (const side of [-1, 1]) {
    liftEye(P, 'turretDetail', side * hw * 0.70, h * 0.80, zc + halfDepth * 0.30);
    liftEye(P, 'turretDetail', side * hw * 0.62, h * 0.72, zc - halfDepth * 0.55);
    P.add('turretDetail', box(0.02, 0.02, 0.34), side * hw * 0.93, h * 0.42, zc - halfDepth * 0.10);
  }
  fiftyCal(P, T.mg, yl, zl);
  // markings live on the BUSTLE flanks (r2: decal floated on the bare dome)
  const dm = (B.z0 + B.z1) / 2;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [(B.w0 + B.w1) / 2 + 0.015, yl((B.top0 + B.floor0) / 2), zl(dm)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [-(B.w0 + B.w1) / 2 - 0.015, yl((B.top0 + B.floor0) / 2), zl(dm)], -Math.PI / 2);
}

// M47 long-nose turret (T42 family): needle prow, roof plateau with low
// cupola, stereoscopic rangefinder blister housings, and the signature LONG
// squared bustle overhang running past the hull tail with a stowage band.
function m47Turret(P, T) {
  const { box, lathe, slab, cylY, cylX, sph, liftEye, cupola, tarpRoll, ammoCan } = KIT;
  const yl = (y) => y - T.ringY, zl = (z) => z - T.ringZ;
  const h = T.roofY - T.ringY;                     // 2.51 - 1.64 = 0.87
  // needle nose: pinched prow wedge rising into the dome
  P.add('turret', slab(
    [-0.42, yl(1.46), zl(0.38)], [0.42, yl(1.46), zl(0.38)],
    [1.06, yl(1.34), zl(-0.55)], [-1.06, yl(1.34), zl(-0.55)],
    [-0.30, yl(1.88), zl(0.38)], [0.30, yl(1.88), zl(0.38)],
    [0.94, yl(2.44), zl(-0.55)], [-0.94, yl(2.44), zl(-0.55)]));
  // main dome: widest ±1.13 over z −0.6…−1.9, long plateau at 2.50
  const hw = 1.13, zc = zl(-1.25), halfDepth = 0.88;
  P.add('turret', lathe([
    [hw * 0.82, -0.05], [hw * 1.00, h * 0.20], [hw * 0.96, h * 0.46],
    [hw * 0.86, h * 0.68], [hw * 0.70, h * 0.86], [hw * 0.55, h * 0.965],
    [hw * 0.30, h], [0.02, h],
  ], P.q ? 32 : 18, halfDepth / hw), 0, 0, zc);
  // rear step down off the plateau
  P.add('turret', slab(
    [-0.84, yl(1.75), zl(-1.75)], [0.84, yl(1.75), zl(-1.75)],
    [0.78, yl(1.62), zl(-2.45)], [-0.78, yl(1.62), zl(-2.45)],
    [-0.76, yl(2.35), zl(-1.75)], [0.76, yl(2.35), zl(-1.75)],
    [0.72, yl(2.22), zl(-2.45)], [-0.72, yl(2.22), zl(-2.45)]));
  // proud ring collar under the dome front (base band read)
  P.add('turret', cylY(0.95, 0.99, 0.09, P.q ? 24 : 14), 0, yl(1.58), zl(-1.20), 0, 0, 0, [1, 1, 0.82]);
  // LONG bustle overhang: top ≈2.16, floor ≈1.56, running to −3.40. Pass-2
  // lesson: geometry past the hull-tail bound (−3.41) leaks into the GUN
  // overhang + top masks — the rack frame stays inboard of the tail.
  P.add('turret', slab(
    [-0.78, yl(1.58), zl(-2.35)], [0.78, yl(1.58), zl(-2.35)],
    [0.72, yl(1.56), zl(-3.40)], [-0.72, yl(1.56), zl(-3.40)],
    [-0.78, yl(2.17), zl(-2.35)], [0.78, yl(2.17), zl(-2.35)],
    [0.72, yl(2.14), zl(-3.40)], [-0.72, yl(2.14), zl(-3.40)]));
  // stowage band riding the bustle roof (oracle bump to ~2.35)
  tarpRoll(P, 'turretDark', -0.22, yl(2.26), zl(-2.62), 0.9, 0.10, true, P.q ? 12 : 8);
  P.add('turretDark', box(0.36, 0.17, 0.55), 0.35, yl(2.24), zl(-2.90), 0, 0.1, 0);
  ammoCan(P, 'turretDark', -0.42, yl(2.22), zl(-3.05), 0.2);
  // rack frame on the tail of the bustle (inboard of the hull tail)
  P.add('turretDetail', box(1.44, 0.032, 0.032), 0, yl(2.16), zl(-3.38));
  P.add('turretDetail', box(1.44, 0.032, 0.032), 0, yl(1.70), zl(-3.38));
  for (let i = 0; i < 5; i++) {
    P.add('turretDetail', box(0.028, 0.46, 0.028), -0.66 + i * 0.33, yl(1.93), zl(-3.38));
  }
  // stereoscopic rangefinder blisters: BOXED housings with dark end caps
  for (const side of [-1, 1]) {
    P.add('turret', box(0.26, 0.24, 0.58), side * 0.99, yl(2.10), zl(-0.44), 0, 0, side * 0.06);
    P.add('turretDark', cylX(0.10, 0.035, 10), side * 1.16, yl(2.10), zl(-0.44));
  }
  // low-profile cupola RIGHT + oval loader hatch LEFT + ventilator
  cupola(P, 'turret', -0.45, yl(2.44), zl(-1.30), 0.29, 0.10, 6);
  P.add('turret', cylY(0.17, 0.17, 0.045, 14), 0.46, yl(2.50), zl(-1.10), 0, 0, 0, [1, 1, 1.3]);
  P.add('turretDark', box(0.05, 0.02, 0.16), 0.60, yl(2.53), zl(-1.10));
  P.add('turret', sph(0.09, 12, Math.PI / 2), 0.06, yl(2.50) - 0.01, zl(-0.80));
  for (const side of [-1, 1]) {
    liftEye(P, 'turretDetail', side * 0.92, yl(2.34), zl(-0.90));
    P.add('turretDetail', box(0.02, 0.02, 0.60), side * 0.79, yl(1.95), zl(-2.60));
  }
  fiftyCal(P, T.mg, yl, zl);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [0.765, yl(1.88), zl(-2.80)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [-0.765, yl(1.88), zl(-2.80)], -Math.PI / 2);
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
  if (cfg.turret.m47) m47Turret(P, cfg.turret); else t26Turret(P, cfg.turret);

  const G = cfg.gun;
  const len = G.muzzleZ - cfg.gunZ;
  // cast gun shield: the T26 family shield is a TALL rounded casting (oracle
  // band ~1.2…2.0, wave-2's 0.46 m plate was half size)
  P.addGunExtra(box(G.shieldW, G.shieldH, 0.26), 0, 0.02, G.rootL + 0.05);
  P.addGunExtra(xform(cylX(G.shieldH * 0.50, G.shieldW * 0.72, P.q ? 16 : 10), 0, 0, 0), 0, 0.02, G.rootL + 0.17);
  P.addGunExtra(xform(cylZ(G.r * 1.5, 0.30, 12, G.r * 1.8), 0, 0, 0), 0, 0, G.rootL + 0.27);
  P.addGunExtraDark(cylZ(0.030, 0.10, 8), G.shieldW * 0.30, 0.05, G.rootL + 0.15);
  buildGun(P, { len, r: G.r, sleeve: false, evac: null, collar: false, baseR: G.r * 1.8 });
  const seg = P.q ? 20 : 12;
  const sq = (r, l, at, s = 0.70) => P.add('gun', xform(cylZ(r, l, seg), 0, 0, 0, 0, 0, 0, [1, s, 1]), 0, 0, at);
  // Muzzle devices are shaped to the repaired oracles' overhang bands: the
  // reference silhouettes are CONTINUOUS fat sections (m26 0.35-band from
  // +2.7, m46 0.33-band from +2.1, m47 0.30/0.29 steps) — pass-1's thin
  // waists between drums cost the gun component 5-7 points.
  if (G.device === 'double') {           // M26/M3: twin drums on a solid body
    P.add('gun', cylZ(G.r * 1.04, 0.12, 10), 0, 0, len - 0.72);
    sq(0.24, 0.68, len - 0.37);                                      // solid body
    sq(0.265, 0.14, len - 0.52);                                     // rear baffle drum
    sq(0.265, 0.13, len - 0.19);                                     // front baffle drum
    for (const side of [-1, 1]) P.add('gunDark', box(0.05, 0.10, 0.13), side * 0.225, 0, len - 0.36);
    P.add('gunDark', xform(cylZ(0.245, 0.03, seg), 0, 0, 0, 0, 0, 0, [1, 0.66, 1]), 0, 0, len - 0.36);
    P.add('gun', cylZ(G.r * 1.05, 0.05, 10), 0, 0, len - 0.015);
  } else if (G.device === 'm46') {       // M3A1: long evacuator sleeve + baffle
    P.add('gun', cylZ(G.r * 1.32, 1.05, seg, G.r * 1.14), 0, 0, len - 0.60);
    sq(G.r * 1.66, 0.15, len - 0.11, 0.86);                          // single baffle drum
    P.add('gunDark', xform(cylZ(G.r * 1.34, 0.035, seg), 0, 0, 0), 0, 0, len - 0.24);
    P.add('gun', cylZ(G.r * 1.02, 0.04, 10), 0, 0, len - 0.012);
  } else if (G.device === 'm47') {       // M36: evacuator + slotted deflector
    // top-mask probe: oracle evacuator band ±0.15 over +2.6…+3.1, deflector a
    // SHORT WIDE drum ±0.33 at +3.2…+3.4 with a rounded exit
    P.add('gun', cylZ(0.15, 0.50, 12), 0, 0, len - 0.61);
    P.add('gun', xform(cylZ(0.34, 0.26, seg), 0, 0, 0, 0, 0, 0, [1, 0.43, 1]), 0, 0, len - 0.18);
    for (const side of [-1, 1]) P.add('gunDark', box(0.05, 0.09, 0.18), side * 0.29, 0, len - 0.18);
    P.add('gun', xform(cylZ(0.20, 0.08, seg), 0, 0, 0, 0, 0, 0, [1, 0.55, 1]), 0, 0, len - 0.045);
    P.add('gunDark', cylZ(0.095, 0.04, 8), 0, 0, len - 0.008);
  } else {                               // m45 howitzer: plain muzzle collar
    P.add('gun', cylZ(G.r * 1.12, 0.07, 12), 0, 0, len - 0.035);
  }
  P.muzzleZ = len;
  P.topY = cfg.topWorld - cfg.pivotY + 0.12;
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

  // M19 cupola: pedestal ring, vision-block band (7 glass blocks), CLOSED
  // hatch dome (r2: the open-top drum showed a black interior), M85 stub
  const cx = -0.53, cz = zl(0.10);
  P.add('turret', cylY(0.44, 0.50, 0.13, P.q ? 20 : 12), cx, yl(2.955), cz);
  P.add('turret', cylY(0.36, 0.41, 0.13, P.q ? 20 : 12), cx, yl(3.08), cz);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    P.add('turretDark', box(0.10, 0.065, 0.02), cx + Math.sin(a) * 0.375, yl(3.085), cz + Math.cos(a) * 0.375, 0, a, 0);
  }
  P.add('turret', cylY(0.27, 0.29, 0.07, 14), cx, yl(3.175), cz);
  P.add('turret', KIT.sph(0.27, P.q ? 18 : 12, Math.PI / 2), cx, yl(3.20), cz, 0, 0, 0, [1, 0.42, 1]);
  P.add('turretDark', box(0.34, 0.015, 0.04), cx, yl(3.235), cz);
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

  if (cfg.a3) { // crosswind sensor mast WITH cross head + TTS blister
    P.add('turretDetail', cylY(0.014, 0.02, 0.42, 8), 0.35, yl(2.97), zl(-1.70));
    P.add('turretDark', box(0.05, 0.05, 0.14), 0.35, yl(3.17), zl(-1.70));
    P.add('turretDark', box(0.16, 0.022, 0.022), 0.35, yl(3.20), zl(-1.70));
    P.add('turretDark', cylZ(0.016, 0.10, 6), 0.35, yl(3.17), zl(-1.61));
    P.add('turret', box(0.30, 0.22, 0.26), 0.72, yl(2.78), zl(1.15));
    P.add('turretDark', box(0.18, 0.10, 0.02), 0.72, yl(2.80), zl(1.29));
  }

  // mantlet: M140 collar + canvas dust-cover wedge over the gun root
  // (pass-2: the r2 "40% too wide" trim regressed the turret mask 3 pts —
  // the intact oracle carries this width; restored to the measured size)
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
    // the sleeved tube stays at the oracle's bare-tube width (0.075: the
    // pass-2 gun probe showed the sleeved run 0.03 thinner than the oracle)
    len: 4.66, r: cfg.sleeve ? 0.075 : 0.078, sleeve: !!cfg.sleeve,
    evac: 0.525, evacR: cfg.sleeve ? 1.72 : 1.62, collar: true, baseR: 0.16,
  });
  P.topY = 3.31 - py + 0.10;
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
  // glacis-edge kit only: the reference flank is BARE along the gun-tube band
  // (deck-edge boxes/cable there ate the tube out of the upper mask, pass 2)
  boxR: [[2.36, 0.5, 0.13]], boxL: null, toolZ: 2.36,
  lockZ: -2.55, lockY: 1.50, spareZ: [-0.55, 1.42, 2.30, -0.55],
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
  shackleY: 1.00, shackleZ: 3.04, rearY: 1.06, deflector: false,
  grilleZ0: -1.75, grilleZ1: -2.70, grilleY: 1.415, grilleRx: -0.27,
  capX: 0.85, capY: 1.555, capZ: -1.35,
  // no fender kit: the m45 reference flanks are bare (its deck furniture is
  // central) and the howitzer band sits right over the deck line
  boxR: null, boxL: null, toolZ: null,
  lockZ: -2.35, lockY: 1.34, spareZ: [-0.55, 1.38, 2.82, -0.62],
};

const HULL_M46 = {
  W: 3.51, trackW: 0.58, sponsonY: 1.16,
  deck: [[2.66, 1.15], [2.24, 1.66], [-3.00, 1.66], [-3.43, 1.50]],
  noseR: 0.40, noseY: 1.00, noseZ: 2.20,
  wheelR: 0.33, wheelSpan: [1.60, -2.55],
  sprocket: { z: -3.00, y: 0.52, r: 0.28 }, idler: { z: 1.95, y: 0.58, r: 0.27 },
  rollerN: 5, rollerY: 1.02, tension: { z: -2.58, y: 0.28, r: 0.15 },
  mufflerTopY: 1.78, mufflerZ: [-0.95, -2.95],
};
const FIT_M46 = {
  hatchZ: 1.85, hatchY: 1.66, bowMG: [0.55, 1.42, 2.42, -0.68],
  lightX: 0.68, lightY: 1.62, lightZ: 2.32, lightRx: -0.60,
  shackleY: 1.12, shackleZ: 2.62, rearY: 1.42,
  grilleZ0: -1.60, grilleZ1: -2.70, grilleY: 1.665, grilleRx: 0,
  capX: 0.55, capY: 1.675, capZ: -1.30,
  boxR: [[2.44, 0.42, 0.12]], boxL: null, toolZ: 2.42,
  lockZ: -2.60, lockY: 1.64, spareZ: [-0.55, 1.50, 2.52, -0.62],
};

const HULL_M47 = {
  W: 3.51, trackW: 0.58, sponsonY: 1.16,
  // deck tail −3.20 + twin tongues to −3.36: the oracle's hull plan ends
  // ≈−3.2 and its bustle overhang reads as a SPARSE ~280 px strip from above
  // (its rack). The top-view compare registers by centroid, so the strip must
  // match both position AND mass — a solid full-width strip cannot.
  deck: [[2.85, 1.15], [2.36, 1.64], [-3.05, 1.64], [-3.20, 1.56]],
  tailTongues: [[-0.55, 0.44, -3.36], [0.55, 0.44, -3.36]],
  noseR: 0.40, noseY: 1.00, noseZ: 2.40,
  wheelR: 0.33, wheelSpan: [1.70, -2.60],
  sprocket: { z: -3.02, y: 0.58, r: 0.28 }, idler: { z: 2.08, y: 0.62, r: 0.27 },
  rollerN: 5, rollerY: 1.02, tension: { z: -2.64, y: 0.28, r: 0.15 },
  mufflerTopY: 1.78, mufflerZ: [-0.85, -2.90],
};
const FIT_M47 = {
  hatchZ: 2.00, hatchY: 1.64, bowMG: [0.55, 1.40, 2.60, -0.62],
  lightX: 0.68, lightY: 1.60, lightZ: 2.50, lightRx: -0.58,
  shackleY: 1.12, shackleZ: 2.80, rearY: 1.44,
  grilleZ0: -1.60, grilleZ1: -2.70, grilleY: 1.645, grilleRx: 0,
  capX: 0.55, capY: 1.655, capZ: -1.30,
  boxR: [[2.56, 0.5, 0.12]], boxL: null, toolZ: 2.56,
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
  // rear-deck stowage (the r2 open bullet expects rear kit; forward deck kit
  // occluded the turret nose cone band in pass 1)
  boxR: [[-2.45, 0.85], [-2.95, 0.6, 0.12]], boxL: [[-2.60, 0.8], [-3.10, 0.55, 0.12]], toolZ: 2.0,
  lockZ: -2.85, lockY: 1.90, spareZ: null, cableZ0: 2.2, cableZ1: -0.2,
};

export const PATTON_PROFILES = {
  m26_pershing: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M26, fittings: FIT_M26,
      pivotY: 1.55, pivotZ: -1.55, gunY: 1.60, gunZ: -0.85, topWorld: 2.78,
      turret: {
        ringZ: -1.55, ringY: 1.55, halfW: 1.26,
        domeFront: -0.25, domeRear: -2.45, roofY: 2.31,
        bustle: { z0: -2.05, z1: -3.10, w0: 0.84, w1: 0.74, top0: 2.26, top1: 2.18, floor0: 1.26, floor1: 1.44 },
        rack: { z0: -3.10, z1: -3.46, halfW: 0.60, floorY: 1.58, railY: 1.95 },
        cupola: { x: -0.46, z: -1.95, r: 0.30, baseY: 2.22, h: 0.14 },
        loader: { x: 0.48, z: -1.90, y: 2.26 },
        vent: { x: 0.04, z: -1.15 },
        mg: { x: 0.25, z: -2.55, deckY: 2.22, axisY: 2.66, barrelLen: 1.05, wide: true },
      },
      // muzzle +3.52: the oracle's brake band stays FULL-fat to the tip
      gun: { muzzleZ: 3.52, r: 0.12, device: 'double', shieldW: 1.05, shieldH: 0.78, rootL: 0.22 },
    }),
  },
  m45_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M45, fittings: FIT_M45,
      pivotY: 1.54, pivotZ: -1.16, gunY: 1.575, gunZ: -0.30, topWorld: 2.72,
      turret: {
        ringZ: -1.16, ringY: 1.54, halfW: 1.25,
        domeFront: 0.30, domeRear: -2.05, roofY: 2.30,
        bustle: { z0: -1.78, z1: -2.82, w0: 0.80, w1: 0.66, top0: 2.16, top1: 2.02, floor0: 1.20, floor1: 1.40 },
        rack: { z0: -2.82, z1: -3.36, halfW: 0.52, floorY: 1.54, railY: 1.86 },
        cupola: { x: -0.46, z: -1.72, r: 0.28, baseY: 2.20, h: 0.13 },
        loader: { x: 0.46, z: -1.58, y: 2.24 },
        vent: { x: 0.05, z: -0.62 },
        mg: { x: -0.42, z: -0.95, deckY: 2.16, axisY: 2.58, barrelLen: 1.00, wide: true },
        stowBump: { x: 0.10, y: 2.10, z: -2.58, r: 0.10, len: 0.85 },
      },
      // rack rails run to −3.36, tipping just past the hull tail fixture so
      // the top-view upper mask matches the oracle's sparse tail pixels
      // 105 mm M4 howitzer: SHORT stub — the repaired oracle's muzzle ends at
      // +1.45, well inside the hull bound (gun overhang masks stay empty)
      gun: { muzzleZ: 1.48, r: 0.15, device: null, shieldW: 1.30, shieldH: 0.80, rootL: 0.10 },
    }),
  },
  m46_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M46, fittings: FIT_M46,
      pivotY: 1.66, pivotZ: -1.53, gunY: 1.64, gunZ: -0.75, topWorld: 2.78,
      turret: {
        ringZ: -1.53, ringY: 1.66, halfW: 1.24,
        domeFront: -0.23, domeRear: -2.42, roofY: 2.37,
        bustle: { z0: -2.28, z1: -3.05, w0: 0.83, w1: 0.74, top0: 2.26, top1: 2.16, floor0: 1.34, floor1: 1.50 },
        rack: { z0: -3.05, z1: -3.45, halfW: 0.60, floorY: 1.68, railY: 1.95 },
        cupola: { x: -0.52, z: -1.95, r: 0.29, baseY: 2.30, h: 0.13 },
        loader: { x: 0.46, z: -1.85, y: 2.33 },
        vent: { x: 0.04, z: -1.10 },
        mg: { x: -0.30, z: -1.45, deckY: 2.32, axisY: 2.66, barrelLen: 1.05, wide: true },
      },
      // muzzle +3.53: the oracle's evacuator band stays fat to the tip
      gun: { muzzleZ: 3.53, r: 0.125, device: 'm46', shieldW: 1.00, shieldH: 0.80, rootL: 0.20 },
    }),
  },
  m47_patton: {
    build: (P) => buildM26Family(P, {
      hull: HULL_M47, fittings: FIT_M47,
      pivotY: 1.64, pivotZ: -1.00, gunY: 1.60, gunZ: -0.60, topWorld: 2.96,
      turret: {
        m47: true, ringZ: -1.00, ringY: 1.64, roofY: 2.51,
        mg: { x: 0.05, z: -1.60, deckY: 2.50, axisY: 2.87, barrelLen: 1.32, wide: true },
      },
      // muzzle +3.46 (oracle band runs to ~3.45)
      gun: { muzzleZ: 3.46, r: 0.118, device: 'm47', shieldW: 0.86, shieldH: 0.82, rootL: 0.30 },
    }),
  },
  m60a1: { build: (P) => buildM60(P, { hull: HULL_M60, fittings: FIT_M60, searchlight: true, sleeve: false }) },
  m60a3: { build: (P) => buildM60(P, { hull: HULL_M60, fittings: FIT_M60, searchlight: false, sleeve: true, a3: true }) },
};
