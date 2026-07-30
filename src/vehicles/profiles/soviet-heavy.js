// Soviet heavy / breakthrough family procedural profiles (fidelity oracles:
// recovered IS-3/IS-7/Object 279/IS-6B/KV-2 GLBs). Owned by the
// Soviet-heavy family agent.
//
// Fully custom constructions (profile.build) replacing the generic kit
// profiles: every dimension below comes from the width-normalized silhouette
// probes of the local reference GLBs + the real-vehicle packets in
// docs/references/tanks/<id>.md. Original primitive reconstructions only —
// no source mesh data.
//
// r2 (shaded-parity r1, docs/critique/shaded-parity-r1.md): surface pass on
// all six tanks — sealed convex saddle mantlets (family critical: the square
// socket collars opened voids at full depression), reading muzzle brakes on
// is3/is6b, dark-metal AA MGs, rivet/stud rows, fittings, and material
// separation through the now-mask-safe detail buckets. is3_bergman rebuilt
// with the true proud IS-3 dome (identity over its degenerate oracle).
//
// FRAME NOTE: the snowleopard GLBs (is7 / object279 / is6b) fuse the gun into
// the turret mesh, so the loader normalizes them on the FULL bounding box —
// in world space their hulls sit rear-shifted (whole bbox centred). Each
// build below replicates its oracle's frame (zc = hull centre) so the
// raw-frame cannon-overhang metric and the in-game silhouette both line up
// with what the local reference renders.
//
// WIDTH GUARD: the probes width-normalize. Nothing added in r2 may exceed
// each build's committed max width (is7 anchor 3.379, is3 drums 3.15,
// object279 flare 3.39, is6b 3.20, kv2 fenders 3.31) or the whole model
// rescales and every mask shifts.
import { KIT } from './kit.js';

// ---------------------------------------------------------------------------
// Family machinery
// ---------------------------------------------------------------------------

// IS running gear: big steel wheels low on the hull, rear sprocket, no
// return-roller gap (KV passes explicit rollers).
function sovGear(P, g) {
  const { buildRunningGear, cylX } = KIT;
  const wheelZs = Array.from({ length: g.wheels }, (_, i) =>
    g.zc + g.span / 2 - i * (g.span / (g.wheels - 1)));
  const wheelW = Math.min(0.24, g.trackW * 0.42);
  const lift = g.yLift ?? 0;              // 279 inner pair rides high: its
                                          // oracle keeps the centre-bottom
                                          // clear between the corner tracks
  buildRunningGear(P, {
    style: 'steel', wheelR: g.wheelR, wheelW,
    wheelY: g.wheelY + lift, xc: g.xc, wheelZs,
    sprocket: { z: g.zc - g.span / 2 - 0.44, y: lift + g.wheelR + 0.10, r: g.wheelR * 0.92 },
    idler: { z: g.zc + g.span / 2 + 0.44, y: lift + g.wheelR + 0.06, r: g.wheelR * 0.84 },
    rollers: g.rollers || [], trackW: g.trackW, topY: g.topY,
    botY: (g.botY ?? 0.10) + lift,        // track run above the wheel bottoms:
    arms: true,                           // the oracles show wheel scallops
  });
  // shaded-parity r1 (family WT 3 — "flat discs in shadow"): the bespoke
  // steel wheels merged every face feature into one painted material. A dark
  // recess field sits BEHIND the painted rim ring / spoke ribs / hub drum /
  // bolt ring (all of which stand proud of it), so hubs and rims read out of
  // the wheel-bay shadow under any camo. Merged into hullDark — zero draws.
  for (const z of wheelZs) for (const s of [-1, 1]) {
    P.add('hullDark', cylX(g.wheelR * 0.72, wheelW * 1.06, 12), s * g.xc, g.wheelY + lift, z);
  }
}

// Squashed cast dome ("frying pan"): lathe profile [[r, y]...] stretched
// lengthwise by sz, seated at (x, y, z) in turret space.
function panDome(P, profile, sz, y, z) {
  const { lathe } = KIT;
  P.add('turret', lathe(profile, P.q ? 32 : 16, sz), 0, y, z);
}

// Sealed cast saddle mantlet (family critical #2: the r1 square socket boxes
// visibly separated from the turret face at full depression). Every piece is
// a surface of revolution about the trunnion X-axis THROUGH the gun pivot, so
// its silhouette is invariant under elevation — no slot can ever open. The
// caller seals the roll's flat end faces with turret-side cheek plates.
function saddle(P, o) {
  const { cylX, sph } = KIT;
  P.addGunExtra(cylX(o.rollR, o.rollW, 16), 0, 0, 0);            // trunnion saddle roll
  if (o.ballR) P.addGunExtra(sph(o.ballR, 12), 0, 0, o.ballZ);   // cast ball at the tube root
  if (o.boltR) for (const sx of o.boltX || [0]) for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.15;                      // mantlet bolt-bump rings
    P.addGunExtraDark(cylX(0.015, 0.03, 6), sx, Math.sin(a) * o.boltR, Math.cos(a) * o.boltR);
  }
}

// Roof AA MG rebuilt in gunmetal (r1: "stick-blocks on posts" + one-clay).
// Detail buckets are mask-safe since the LOD fix, so the receiver/barrels can
// live in turretDark; only the pintle post stays scheme-painted.
function aaMG(P, x, y, z, twin = false) {
  const { box, cylY, cylZ } = KIT;
  P.add('turret', cylY(0.045, 0.058, 0.30, 8), x, y + 0.15, z);
  P.add('turretDark', box(0.05, 0.15, 0.05), x, y + 0.35, z - 0.05);          // cradle yoke
  for (const dx of twin ? [-0.055, 0.055] : [0]) {
    P.add('turretDark', box(0.085, 0.105, 0.44), x + dx * 1.7, y + 0.44, z + 0.02); // receiver
    P.add('turretDark', cylZ(0.021, 0.60, 8), x + dx, y + 0.485, z + 0.50, -0.06, 0, 0); // barrel
    P.add('turretDark', cylZ(0.031, 0.09, 8), x + dx, y + 0.503, z + 0.79, -0.06, 0, 0); // muzzle
  }
  P.add('turretDark', cylY(0.055, 0.055, 0.09, 10), x + 0.11, y + 0.41, z + 0.08, 0, 0, 1.35); // ammo drum
  P.add('turretDark', box(0.03, 0.13, 0.09), x, y + 0.35, z - 0.22);          // spade grips
}

// Turret-side grab rail: thin rod held off the dome skin by short posts.
function domeRail(P, x, y, z, len) {
  const { box } = KIT;
  P.add('turretDetail', box(0.022, 0.022, len), x, y, z);
  for (const dz of [-len / 2 + 0.08, 0, len / 2 - 0.08]) {
    P.add('turretDetail', box(0.06, 0.018, 0.018), x - Math.sign(x) * 0.032, y, z + dz);
  }
}

// External fuel drum with dark end caps + mounting straps down to the deck.
function fuelDrum(P, x, y, z, len, r = 0.165) {
  const { cylZ, box } = KIT;
  P.add('hull', cylZ(r, len, 12), x, y, z);
  for (const e of [-1, 1]) P.add('hullDark', cylZ(r + 0.004, 0.024, 12), x, y, z + e * (len / 2 - 0.014));
  for (const f of [-0.30, 0.30]) {
    P.add('hullDark', box(0.035, r + 0.10, 0.05), x - Math.sign(x) * 0.02, y - r * 0.55, z + f * len);
  }
}

// Bow tow hook: bracket block + dark pin.
function towHook(P, x, y, z) {
  const { box, cylX } = KIT;
  P.add('hullDetail', box(0.09, 0.13, 0.09), x, y, z);
  P.add('hullDark', cylX(0.02, 0.12, 6), x, y + 0.015, z + 0.03);
}

// IS pike bow: upper glacis wedge + lower nose V + two yawed cheek plates so
// the "eagle's beak" reads in the quarter views, not just front/side.
function pikeNose(P, { zBreak, zTip, yBelt, yRoof, yBelly, wRoof, wBelt, cheekW }) {
  const { box, frustum } = KIT;
  P.add('hull', frustum(wBelt, zTip, zBreak - 0.02, wRoof, zBreak + (zTip - zBreak) * 0.30, zBreak - 0.04, yBelt, yRoof));
  P.add('hull', frustum(wBelt * 0.84, zBreak + (zTip - zBreak) * 0.72, zBreak, wBelt, zTip, zBreak - 0.02, yBelly, yBelt));
  for (const s of [-1, 1]) {
    P.add('hull', box(cheekW, (yRoof - yBelly) * 0.34, (zTip - zBreak) * 0.34),
      s * wBelt * 0.52, (yBelt + yRoof) / 2 - 0.12, zBreak + (zTip - zBreak) * 0.45, 0, s * -0.60, 0);
  }
  // r2: weld beads along the pike plate joints (r1: "no cast/weld character").
  const zMid = zBreak + (zTip - zBreak) * 0.62;
  const rx = -Math.atan2(yRoof - yBelt, (zTip - zBreak) * 0.78);
  P.add('hullDetail', box(0.026, 0.026, (zTip - zBreak) * 0.92), 0, (yBelt + yRoof) / 2 + 0.03, zMid - 0.06, rx, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.02, 0.02, (zTip - zBreak) * 0.80),
      s * wBelt * 0.44, (yBelt + yRoof) / 2 + 0.01, zMid - 0.02, rx * 0.6, s * -0.62, 0);
  }
}

// ---------------------------------------------------------------------------
// IS-7 — docs/references/tanks/is7.md
// hull z −5.04..+1.51 (len 6.55), roof 1.41, glacis→1.08; long egg dome
// z −3.5..+0.9 crown 2.25; muzzle +5.06 (3.55 m overhang) at axis y 1.71.
// ---------------------------------------------------------------------------
function buildIS7(P) {
  const { box, cylY, cylZ, torus, frustum, fenders, headlight, towCable, buildGun, liftEye, cupola } = KIT;
  const zc = -1.76;
  P.add('hull', box(2.00, 0.70, 6.24), 0, 0.62, zc + 0.02);                    // belly
  P.add('hull', frustum(1.64, zc + 2.30, zc - 3.27, 1.47, zc + 2.32, zc - 3.24, 0.95, 1.43)); // sponson band
  P.add('hull', box(2.94, 0.05, 5.52), 0, 1.415, zc - 0.48);                   // roof plate
  pikeNose(P, { zBreak: zc + 2.30, zTip: zc + 3.27, yBelt: 0.94, yRoof: 1.43, yBelly: 0.36, wRoof: 1.42, wBelt: 1.56, cheekW: 1.10 });
  P.add('hull', frustum(1.45, zc - 3.20, zc - 3.27, 1.45, zc - 2.96, zc - 3.27, 0.40, 0.95)); // rear lower slope
  P.add('hull', box(2.90, 0.50, 0.12), 0, 1.14, zc - 3.24);                    // rear plate
  fenders(P, 1.04, 1.635, 1.02, zc - 3.22, zc + 2.90, 0.03);                   // plan 3.27 like the oracle
  // invisible width anchor: the oracle's 3D max width (3.39) comes from a
  // sub-pixel skirt lip; a tiny stud keeps width-normalization identical
  // without widening any rendered view.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.012, 0.02, 0.02), s * 1.6895, 1.00, zc);
    P.add('hull', box(0.30, 0.52, 0.035), s * 1.50, 0.44, zc - 3.32);          // rear mud flaps
    P.add('hull', box(0.24, 0.38, 0.030), s * 1.44, 0.42, zc + 3.02);          // front mud flaps
  }
  // deck furniture (thin — the oracle roof reads flat)
  P.add('hull', cylY(0.26, 0.26, 0.045, 14), 0.62, 1.44, zc + 2.02);           // driver hatch
  P.add('hullDark', cylY(0.272, 0.272, 0.014, 14), 0.62, 1.437, zc + 2.02);    // hatch cut line
  P.add('hull', box(0.13, 0.46, 0.13), 0, 1.55, zc + 2.55);                    // glacis IR/periscope stub (oracle has one)
  for (let i = 0; i < 5; i++) P.add('hullDark', box(1.9, 0.02, 0.10), 0, 1.445, zc - 1.5 - i * 0.28); // grilles
  for (const s of [-1, 1]) {
    // twin round exhaust ports at the rear corners (IS-7 signature)
    P.add('hullDetail', cylZ(0.115, 0.06, 12), s * 1.05, 1.22, zc - 3.29);
    P.add('hullDark', cylZ(0.095, 0.09, 12), s * 1.05, 1.22, zc - 3.31);
    // long fender bins with dark latch straps down the rear deck edges
    // (kept clear of the yawed dome sweep, z < dome rear −3.46+zc frame)
    P.add('hull', box(0.26, 0.13, 0.72), s * 1.30, 1.48, zc - 2.02);
    P.add('hull', box(0.26, 0.13, 0.85), s * 1.30, 1.48, zc - 2.88);
    for (const bz of [-2.24, -1.80, -3.10, -2.66]) {
      P.add('hullDark', box(0.27, 0.10, 0.026), s * 1.30, 1.505, zc + bz);
    }
    towHook(P, s * 0.55, 0.60, zc + 3.06);                                     // pike-toe tow hooks
    P.add('hullDetail', torus(0.078, 0.011, 12), s * 0.62, 1.24, zc + 3.09);   // headlight brush guards
  }
  headlight(P, -0.62, 1.24, zc + 3.02, -0.4); headlight(P, 0.62, 1.24, zc + 3.02, -0.4);
  towCable(P, [[-1.45, 1.32, zc - 1.2], [-1.52, 1.36, zc + 0.8], [-1.45, 1.32, zc + 2.2]]);
  liftEye(P, 'hullDetail', -0.9, 1.46, zc - 2.8); liftEye(P, 'hullDetail', 0.9, 1.46, zc - 2.8);
  sovGear(P, { xc: 1.30, trackW: 0.60, wheels: 7, wheelR: 0.33, wheelY: 0.36, span: 4.70, zc, topY: 0.90 });

  // turret: one long cast egg, crown plateau ~2.2, over a wide base collar
  // that flares to ~2.95 over the deck edges (the oracle's turret mask keeps
  // a broad skirt below the dome in front/rear views)
  P.turretG.position.set(0, 1.43, -1.33);
  panDome(P, [[1.37, -0.03], [1.34, 0.10], [1.25, 0.17]], 1.52, 0.0, -0.05);   // base collar (2.74 -> 2.5 taper)
  panDome(P, [
    [1.18, 0.00], [1.25, 0.14], [1.25, 0.34], [1.13, 0.52],
    [0.93, 0.66], [0.57, 0.75], [0.26, 0.78], [0.02, 0.79],
  ], 1.70, 0.02, -0.05);
  cupola(P, 'turret', 0.42, 0.735, -0.78, 0.20, 0.13, 6);                      // commander cupola + vision ring
  P.add('turret', cylY(0.19, 0.21, 0.07, 12), -0.55, 0.66, -0.40);             // loader hatch bump
  P.add('turret', cylY(0.165, 0.165, 0.028, 12), -0.55, 0.745, -0.40);         // loader lid
  P.add('turretDark', box(0.30, 0.014, 0.03), -0.55, 0.762, -0.40);            // lid seam
  KIT.periscope(P, 'turretDetail', -0.12, 0.80, -0.30);                        // roof periscope pods
  KIT.periscope(P, 'turretDetail', 0.15, 0.795, -1.15, 0.5);
  aaMG(P, 0.02, 0.70, -1.95, true);                                            // twin KPVT AA mount (to ~2.6)
  for (const x of [-0.16, 0.20]) P.add('turret', box(0.035, 0.34, 0.035), x, 0.98, -1.95); // MG mount frame
  P.add('turret', box(0.44, 0.045, 0.05), 0.02, 1.16, -1.95);
  for (const s of [-1, 1]) {
    P.add('turretDark', cylZ(0.028, 0.40, 8), s * 0.66, 0.24, 1.72, -0.03, s * 0.08, 0); // cheek SGMT MG ports
    liftEye(P, 'turretDetail', s * 0.98, 0.60, -1.30, s * 0.5);                // dome lifting bosses
  }
  domeRail(P, -1.13, 0.42, -0.60, 1.05); domeRail(P, 1.13, 0.42, -0.60, 1.05); // cheek grab rails
  P.decal('turret', 'number', P.spec.visual.number || '7', 0.30, [1.14, 0.34, -0.3], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '7', 0.30, [-1.14, 0.34, -0.3], -Math.PI / 2, 0, -0.10);

  // 130 mm S-70: axis y 1.71, muzzle at world +5.06 (3.55 m past the bow).
  // r2: square collar box -> sealed cast saddle centred on the trunnion (the
  // r1 box left a dark slot over the mantlet at -6°) with bolt-bump rings.
  P.gunG.position.set(0, 0.285, 1.90);
  saddle(P, { rollR: 0.34, rollW: 0.98, ballR: 0.27, ballZ: 0.30, boltR: 0.349, boltX: [-0.40, 0.40] });
  P.addGunExtra(cylZ(0.155, 0.55, 14, 0.19), 0, 0, 0.44);                      // stepped root sleeve
  P.add('turret', box(0.78, 0.18, 0.46), 0, 0.50, 1.90, -0.50, 0, 0);          // cast brow over the saddle
  for (const s of [-1, 1]) {
    P.add('turret', box(0.22, 0.46, 0.40), s * 0.55, 0.26, 1.74, -0.12, s * -0.50, 0); // cheek castings hugging the roll ends
  }
  buildGun(P, { len: 4.46, r: 0.080, brake: true, baseR: 0.15, sleeve: false, evac: null });
  P.topY = 0.85;
}

// ---------------------------------------------------------------------------
// IS-3 — docs/references/tanks/is3.md
// hull ±3.41 (len 6.82), crew roof 1.49, deck line 1.72, glacis→1.10; fat
// squashed dome crown 2.54 + DShK to ~3.1; muzzle +5.66 (2.25 m) axis 2.02.
// is3_bergman reuses the hull AND (r2) the full proud turret: its own oracle
// is degenerate, so identity wins over the turret metric (see packet).
// ---------------------------------------------------------------------------
function is3Hull(P) {
  const { box, cylY, cylZ, frustum, fenders, headlight, towCable, liftEye, shovelTool } = KIT;
  P.add('hull', box(1.90, 0.66, 6.60), 0, 0.63, -0.03);                        // belly
  P.add('hull', frustum(1.50, 2.06, -3.41, 1.41, 2.08, -3.38, 0.84, 1.49));    // sloped sponson band (skirt floor 0.84)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.28, 0.46, 0.035), s * 1.36, 0.42, -3.38);              // rear mud flaps
    P.add('hull', box(0.24, 0.34, 0.030), s * 1.30, 0.44, 3.06);               // front mud flaps
  }
  P.add('hull', box(2.80, 0.05, 5.30), 0, 1.475, -0.72);                       // crew/deck roof
  P.add('hull', box(2.60, 0.07, 3.10), 0, 1.525, -1.80);                       // rear deck step
  // r2: shallow louvered V-hump on the engine deck (r1: "flat wedge")
  for (const s of [-1, 1]) {
    P.add('hull', box(1.10, 0.022, 1.40), s * 0.58, 1.578, -1.85, 0, 0, s * -0.055);
    for (let i = 0; i < 3; i++) {
      P.add('hullDark', box(0.98, 0.014, 0.10), s * 0.58, 1.594, -1.38 - i * 0.44, 0, 0, s * -0.055);
    }
  }
  for (const s of [-1, 1]) {
    // external fuel tanks own the 1.72 side-profile line (the oracle's deck
    // is flat ~1.55; its raised roof stations are these drums). r2: split
    // into the four real drums with dark caps + mounting straps.
    fuelDrum(P, s * 1.41, 1.56, -0.92, 1.02);
    fuelDrum(P, s * 1.41, 1.56, -2.00, 1.02);
    // BDSh smoke canisters on the tail plate (packet cue; kept inside the
    // oracle hull z-bound -3.41 — extending it shifts the gun-overhang crop)
    P.add('hullDetail', KIT.cylX(0.095, 0.34, 10), s * 0.72, 1.24, -3.335);
    P.add('hullDark', KIT.cylX(0.099, 0.03, 10), s * 0.72 + 0.10, 1.24, -3.335);
    // front fender stowage bins with dark latch straps
    P.add('hull', box(0.26, 0.13, 0.78), s * 1.30, 1.10, 2.62);
    P.add('hullDark', box(0.27, 0.10, 0.026), s * 1.30, 1.125, 2.42);
    P.add('hullDark', box(0.27, 0.10, 0.026), s * 1.30, 1.125, 2.84);
    towHook(P, s * 0.52, 0.60, 3.16);                                          // pike-toe tow hooks
  }
  shovelTool(P, -1.26, 1.075, 0.55);                                           // fender pioneer tools
  P.add('hull', box(0.92, 0.09, 0.55), 0, 1.53, 2.12, -0.10, 0, 0);            // driver hump
  P.add('hull', cylY(0.19, 0.19, 0.028, 12), 0, 1.585, 2.10);                  // driver hatch lid
  P.add('hullDark', cylY(0.196, 0.196, 0.012, 12), 0, 1.578, 2.10);            // hatch seam
  KIT.periscope(P, 'hullDetail', -0.22, 1.60, 1.98); KIT.periscope(P, 'hullDetail', 0.22, 1.60, 1.98);
  pikeNose(P, { zBreak: 2.06, zTip: 3.41, yBelt: 0.95, yRoof: 1.49, yBelly: 0.38, wRoof: 1.18, wBelt: 1.47, cheekW: 1.15 });
  P.add('hull', frustum(1.40, -3.36, -3.41, 1.40, -3.02, -3.41, 0.42, 0.95));  // rear lower slope
  P.add('hull', box(2.78, 0.52, 0.12), 0, 1.20, -3.36);                        // rear plate
  fenders(P, 1.02, 1.53, 1.02, -3.36, 3.10, 0.03);
  headlight(P, -0.55, 1.26, 3.02, -0.42); headlight(P, 0.55, 1.26, 3.02, -0.42);
  P.add('hullDetail', KIT.torus(0.075, 0.011, 12), -0.55, 1.26, 3.09);         // brush guard hoop
  towCable(P, [[-1.34, 1.30, -1.4], [-1.42, 1.36, 0.6], [-1.34, 1.30, 2.2]]);
  liftEye(P, 'hullDetail', -0.85, 1.52, -2.9); liftEye(P, 'hullDetail', 0.85, 1.52, -2.9);
  P.add('hullTrack', box(0.5, 0.05, 0.26), -0.55, 1.30, 2.78, -0.36, 0, 0);    // spare links on the pike
  sovGear(P, { xc: 1.175, trackW: 0.65, wheels: 6, wheelR: 0.33, wheelY: 0.36, span: 4.60, zc: 0, topY: 0.94 });
}

// Squat proud IS-3 casting + D-25T, shared by is3 and (r2) is3_bergman.
function is3TurretAndGun(P, num) {
  const { box, cylY, cylZ, buildGun, liftEye } = KIT;
  // squat wide casting: base ring floats at ~1.72, crown 2.54
  P.turretG.position.set(0, 1.50, 0.10);
  panDome(P, [
    [1.42, 0.00], [1.46, 0.18], [1.44, 0.44], [1.33, 0.68],
    [1.10, 0.86], [0.60, 0.99], [0.02, 1.04],
  ], 1.20, 0.0, 0.05);
  P.add('turret', cylY(0.21, 0.23, 0.07, 14), -0.44, 0.92, -0.38);             // commander ring
  P.add('turret', cylY(0.185, 0.185, 0.03, 14), -0.44, 1.00, -0.38);           // cupola lid
  P.add('turretDark', cylY(0.215, 0.215, 0.012, 14), -0.44, 0.994, -0.38);     // lid seam ring
  P.add('turret', cylY(0.19, 0.21, 0.06, 14), 0.44, 0.90, -0.30);              // loader ring
  P.add('turret', cylY(0.165, 0.165, 0.028, 12), 0.44, 0.972, -0.30);          // loader lid
  KIT.periscope(P, 'turretDetail', -0.44, 1.045, -0.16);                       // cupola periscope
  KIT.periscope(P, 'turretDetail', 0.10, 0.99, -0.05);                         // gunner periscope
  P.add('turret', box(0.06, 0.42, 0.06), 0.36, 1.12, -0.45);                   // DShK mast
  aaMG(P, 0.36, 1.18, -0.48);                                                  // DShK in gunmetal (to ~3.1 world)
  for (const s of [-1, 1]) {
    domeRail(P, s * 1.435, 0.44, -0.15, 0.95);                                 // dome grab rails (LEFT shows rails)
    liftEye(P, 'turretDetail', s * 0.96, 0.87, 0.42, s * 0.4);                 // lifting bosses
    liftEye(P, 'turretDetail', s * 0.96, 0.86, -0.72, s * -0.4);
  }
  P.decal('turret', 'number', P.spec.visual.number || num, 0.32, [1.32, 0.42, -0.2], Math.PI / 2, 0, 0.12);
  P.decal('turret', 'number', P.spec.visual.number || num, 0.32, [-1.32, 0.42, -0.2], -Math.PI / 2, 0, -0.12);
  // 122 mm D-25T: axis 2.02, fat sleeved tube (mask Ø ~0.24), muzzle +5.66.
  // r2: sealed cast saddle on the trunnion (the r1 socket box opened a gap at
  // depression) + a double-baffle brake that actually READS: dark core in the
  // side windows, dark face rings, horizontal gas-divider spine.
  P.gunG.position.set(0, 0.52, 1.55);
  saddle(P, { rollR: 0.30, rollW: 0.84, ballR: 0.24, ballZ: 0.28, boltR: 0.309, boltX: [-0.33, 0.33] });
  P.addGunExtra(cylZ(0.16, 0.42, 12, 0.20), 0, -0.05, 0.40);                   // bulged root
  P.addGunExtra(box(0.50, 0.24, 0.46), 0, -0.28, 0.26);                        // chin under the root
  P.add('turret', box(0.76, 0.18, 0.44), 0, 0.58, 1.56, -0.55, 0, 0);          // cast brow over the saddle
  for (const s of [-1, 1]) {
    P.add('turret', box(0.22, 0.44, 0.38), s * 0.50, 0.46, 1.40, -0.10, s * -0.50, 0); // cheek castings hugging the roll ends
  }
  // brake silhouette held to the oracle's Ø0.35 blob (r2a: the Ø0.38 read
  // attempt cost 4 gun points on the tiny overhang mask) — contrast comes
  // from the dark slot core + face rings, not size.
  buildGun(P, { len: 4.01, r: 0.125, brake: null, baseR: 0.18, sleeve: false, evac: null });
  P.add('gunDark', cylZ(0.058, 0.70, 10), 0, 0, 3.68);                         // dark core through the side windows
  P.add('gun', cylZ(0.175, 0.08, 14), 0, 0, 3.60);                             // rear baffle plate
  P.add('gunDark', cylZ(0.171, 0.014, 14), 0, 0, 3.648);                       // rear face shadow ring
  P.add('gun', cylZ(0.168, 0.08, 14), 0, 0, 3.88);                             // front baffle plate
  P.add('gunDark', cylZ(0.164, 0.014, 14), 0, 0, 3.834);                       // front face shadow ring
  P.add('gun', box(0.35, 0.042, 0.30), 0, 0, 3.74);                            // horizontal gas-divider spine
  P.add('gun', cylZ(0.09, 0.11, 12), 0, 0, 3.97);                              // exit block
  P.topY = 1.10;
}

function buildIS3(P) {
  is3Hull(P);
  is3TurretAndGun(P, '703');
}

// The recovered bergman print's Turret node is degenerate (fenders and drums
// parented into it; the turret shell itself sits SUNKEN inside the hull) —
// see the packet. r1 matched that visible truth with a flush cap + stub gun;
// the shaded-parity critique (correctly) rejected the result as "a flat cone
// lid flush on the deck". r2 rebuilds the REAL proud IS-3 dome + full D-25T:
// identity beats the metric — the turret/gun component scores are knowingly
// sacrificed against the broken oracle (cost logged in the packet).
function buildIS3Bergman(P) {
  is3Hull(P);
  is3TurretAndGun(P, '703');
}

// ---------------------------------------------------------------------------
// Object 279 — docs/references/tanks/object279.md
// elliptical shell z −4.84..+1.51 (len 6.36) roof 1.57, full width to y≈0.35,
// rounded stern; flat dome crown 2.38; muzzle +4.86 (3.35 m) axis 1.79.
// ---------------------------------------------------------------------------
function buildObject279(P) {
  const { box, cylY, cylZ, frustum, xform, headlight, buildGun, liftEye } = KIT;
  const zc = -1.665;
  // shell: skirt flare -> waist -> rounded shoulder (full width low)
  P.add('hull', frustum(1.56, zc + 2.98, zc - 2.68, 1.695, zc + 3.08, zc - 2.72, 0.26, 0.55));
  P.add('hull', frustum(1.695, zc + 3.08, zc - 2.72, 1.63, zc + 3.02, zc - 2.68, 0.55, 1.12));
  P.add('hull', frustum(1.63, zc + 3.02, zc - 2.68, 1.45, zc + 2.30, zc - 2.55, 1.12, 1.555));
  P.add('hull', box(2.86, 0.04, 5.30), 0, 1.545, zc - 0.15);                   // roof cap
  // rounded stern (plan taper: ~2.2 wide at the rear tip)
  P.add('hull', xform(cylY(1.62, 1.62, 1.10, P.q ? 24 : 14), 0, 0, 0, 0, 0, 0, [1, 1, 0.42]), 0, 0.85, zc - 2.70);
  // bow: roof falls 1.57 -> 1.01 at the tip over the last ~0.9 m
  P.add('hull', frustum(1.52, zc + 3.18, zc + 2.28, 1.35, zc + 2.62, zc + 2.28, 1.01, 1.545));
  P.add('hull', frustum(1.38, zc + 2.55, zc + 2.28, 1.56, zc + 3.18, zc + 2.28, 0.42, 1.01)); // prow underside
  headlight(P, -0.55, 1.30, zc + 3.05, -0.35); headlight(P, 0.55, 1.30, zc + 3.05, -0.35);
  P.add('hullDetail', KIT.torus(0.075, 0.011, 12), -0.55, 1.30, zc + 3.11);    // brush guard hoops
  P.add('hullDetail', KIT.torus(0.075, 0.011, 12), 0.55, 1.30, zc + 3.11);
  for (let i = 0; i < 4; i++) P.add('hullDark', box(2.0, 0.02, 0.12), 0, 1.565, zc - 1.35 - i * 0.32); // grilles
  // r2 bow crest: driver hatch + periscopes + pike-tip tow hooks
  P.add('hull', cylY(0.21, 0.21, 0.03, 12), 0, 1.535, zc + 2.30);
  P.add('hullDark', cylY(0.216, 0.216, 0.012, 12), 0, 1.528, zc + 2.30);
  KIT.periscope(P, 'hullDetail', -0.20, 1.56, zc + 2.10); KIT.periscope(P, 'hullDetail', 0.20, 1.56, zc + 2.10);
  towHook(P, -0.72, 0.74, zc + 3.02); towHook(P, 0.72, 0.74, zc + 3.02);
  // r2 stern: exhaust ports + louvers ON the stern skin (the ellipse surface
  // sits at z ≈ −4.95 at x 0.8 — anything shallower is buried and invisible)
  for (const s of [-1, 1]) {
    P.add('hullDark', cylZ(0.075, 0.10, 10), s * 0.80, 1.12, zc - 3.275, 0.35, 0, 0);
    P.add('hullDetail', cylZ(0.086, 0.03, 10), s * 0.80, 1.12, zc - 3.245, 0.35, 0, 0);
  }
  for (let i = 0; i < 3; i++) P.add('hullDark', box(1.30, 0.016, 0.10), 0, 1.32 - i * 0.10, zc - 3.16 - i * 0.055, 0.55, 0, 0);
  // r2 stud rows along the shield plate joints (extend the r1 rivet instinct)
  for (const zr of [0.35, 1.05]) {
    for (let k = 0; k < 11; k++) P.add('hullDetail', box(0.022, 0.014, 0.022), -1.25 + k * 0.25, 1.556, zc + zr);
  }
  for (let k = 0; k < 9; k++) P.add('hullDetail', box(0.022, 0.014, 0.022), -1.0 + k * 0.25, 1.556, zc - 2.35);
  // FOUR-track running gear (r2 family critical: "reads as a normal 2-track
  // tank from the front"). A full second sovGear pair either grounded the
  // centre (front/rear masks) or leaked through the outer scallops (side
  // track band) — both cost the 90 gate. Instead the inner pair shows as
  // dark-steel track WRAP STUBS at bow and stern: head-on they read as the
  // second track pair with a daylight gap off the outer beams, and from the
  // side they hide exactly behind the outer idler/sprocket wraps. The r1
  // beam-shadow slabs keep the oracle's solid belly band.
  sovGear(P, { xc: 1.40, trackW: 0.58, wheels: 7, wheelR: 0.27, wheelY: 0.30, span: 4.30, zc, topY: 0.72 });
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.52, 0.34, 5.0), s * 0.55, 0.24, zc);               // beam shadow band
    for (const e of [-1, 1]) {
      P.add('hullTrack', box(0.50, 0.40, 0.26), s * 0.56, 0.36, zc + e * 2.60); // inner track wrap stub
      P.add('hullTrack', box(0.42, 0.10, 0.34), s * 0.56, 0.19, zc + e * 2.56); // stub ground shoe
      P.add('hullDark', KIT.cylX(0.16, 0.36, 10), s * 0.56, 0.36, zc + e * 2.60); // inner idler hub shadow
    }
  }
  P.decal('hull', 'number', P.spec.visual.number || '279', 0.30, [1.55, 1.0, 0.6], Math.PI / 2, 0, 0);

  // flat wide dome, crown 2.38 — no cupola spikes on the oracle
  P.turretG.position.set(0, 1.58, -1.20);
  panDome(P, [
    [1.34, 0.00], [1.42, 0.09], [1.34, 0.30], [1.14, 0.52],
    [0.84, 0.68], [0.46, 0.78], [0.02, 0.81],
  ], 1.13, 0.0, 0.0);
  for (const s of [-1, 1]) {
    P.add('turret', cylY(0.16, 0.18, 0.045, 12), s * 0.36, 0.62, -0.30);       // hatch rings
    P.add('turretDark', cylY(0.185, 0.185, 0.012, 12), s * 0.36, 0.658, -0.30); // hatch seams
    liftEye(P, 'turretDetail', s * 0.92, 0.52, 0.30, s * 0.4);                 // lifting bosses
    liftEye(P, 'turretDetail', s * 0.92, 0.50, -0.85, s * -0.4);
  }
  KIT.periscope(P, 'turretDetail', -0.14, 0.775, 0.02);                        // low periscope pods
  KIT.periscope(P, 'turretDetail', 0.30, 0.72, -0.72, 0.4);
  domeRail(P, -1.42, 0.14, -0.40, 1.00); domeRail(P, 1.42, 0.14, -0.40, 1.00); // dome handrails
  // IR spotlight beside the mantlet (packet/LEFT cue)
  P.add('turretDetail', box(0.15, 0.15, 0.16), 0.48, 0.34, 1.32);
  P.add('turretGlass', box(0.11, 0.11, 0.02), 0.48, 0.34, 1.41);
  P.add('turretDetail', box(0.03, 0.10, 0.03), 0.48, 0.22, 1.26);              // spotlight yoke
  // 130 mm M-65: fat tube, slim multi-slot muzzle — no brake drum.
  // r2: sealed saddle collar at the trunnion + dark slot rings so the
  // multi-slot device reads (the r1 body-tone rings vanished under camo).
  P.gunG.position.set(0, 0.21, 1.45);
  saddle(P, { rollR: 0.26, rollW: 0.72, ballR: 0.19, ballZ: 0.34 });
  P.addGunExtra(cylZ(0.15, 0.40, 12, 0.185), 0, 0, 0.40);                      // recoil sleeve step
  for (const s of [-1, 1]) {
    P.add('turret', box(0.22, 0.44, 0.40), s * 0.44, 0.20, 1.30, 0, s * -0.42, 0); // cheek plates over the roll ends
  }
  buildGun(P, { len: 4.61, r: 0.096, brake: null, baseR: 0.15, sleeve: false, evac: null });
  P.add('gun', cylZ(0.106, 0.06, 12), 0, 0, 4.14);                             // slot collars
  P.add('gunDark', cylZ(0.099, 0.05, 12), 0, 0, 4.21);                         // dark slot rings
  P.add('gun', cylZ(0.106, 0.06, 12), 0, 0, 4.28);
  P.add('gunDark', cylZ(0.099, 0.05, 12), 0, 0, 4.35);
  P.add('gun', cylZ(0.106, 0.06, 12), 0, 0, 4.42);
  P.topY = 0.9;
}

// ---------------------------------------------------------------------------
// IS-6B — docs/references/tanks/is6b.md
// hull z −4.92..+1.65 (len 6.57): sloped rear deck 1.18→1.55, flat 1.53,
// glacis→1.06; onion dome on a narrow ring collar, crown 2.34; muzzle +4.94
// (3.29 m) axis 1.90 with a compact brake.
// ---------------------------------------------------------------------------
function buildIS6B(P) {
  const { box, cylY, cylZ, frustum, slab, fenders, headlight, towCable, buildGun, liftEye, shovelTool } = KIT;
  const zc = -1.635;
  P.add('hull', box(1.90, 0.66, 6.34), 0, 0.62, zc);                           // belly
  P.add('hull', frustum(1.60, zc + 1.95, zc - 1.65, 1.53, zc + 1.97, zc - 1.65, 0.95, 1.52)); // mid sponson band
  P.add('hull', box(2.86, 0.04, 3.30), 0, 1.505, zc + 0.15);                   // flat roof
  // sloped rear deck: top edge falls to 1.16 at the tail
  P.add('hull', slab(
    [-1.56, 0.95, zc - 1.63], [1.56, 0.95, zc - 1.63], [1.47, 0.95, zc - 3.28], [-1.47, 0.95, zc - 3.28],
    [-1.53, 1.52, zc - 1.63], [1.53, 1.52, zc - 1.63], [1.44, 1.16, zc - 3.28], [-1.44, 1.16, zc - 3.28]));
  // r2: IS-2-style louver rows down the sloped deck (packet cue)
  for (let i = 0; i < 4; i++) {
    const z = zc - 1.95 - i * 0.34;
    const y = 1.52 + (z - (zc - 1.63)) / 1.65 * 0.36;
    P.add('hullDark', box(2.30, 0.016, 0.11), 0, y + 0.012, z, 0.215, 0, 0);
  }
  // glacis: flat 1.47 fore roof, slope to 1.06, fender tips reach the nose
  P.add('hull', frustum(1.55, zc + 2.60, zc + 1.93, 1.46, zc + 2.02, zc + 1.90, 0.95, 1.47));
  P.add('hull', frustum(1.50, zc + 2.95, zc + 2.55, 1.52, zc + 2.62, zc + 2.50, 0.95, 1.30));
  P.add('hull', frustum(1.30, zc + 2.85, zc + 2.55, 1.50, zc + 3.05, zc + 2.52, 0.44, 0.95)); // lower glacis
  P.add('hull', box(2.86, 0.28, 0.55), 0, 0.98, zc + 3.00);                    // nose shelf / mudguard belt
  P.add('hull', box(2.80, 0.50, 0.12), 0, 0.90, zc - 3.24);                    // tail plate
  fenders(P, 1.02, 1.545, 1.02, zc - 3.20, zc + 3.10, 0.03);
  for (const s of [-1, 1]) {
    fuelDrum(P, s * 1.33, 1.42, zc - 2.30, 0.85, 0.155);                       // rear external fuel tanks
    P.add('hull', box(0.34, 0.20, 0.95), s * 1.30, 1.22, zc + 1.15);           // fender boxes
    P.add('hullDark', box(0.35, 0.16, 0.026), s * 1.30, 1.24, zc + 0.90);      // bin latch straps
    P.add('hullDark', box(0.35, 0.16, 0.026), s * 1.30, 1.24, zc + 1.40);
    towHook(P, s * 0.58, 1.00, zc + 3.20);                                     // bow tow hooks
    P.add('hullDetail', KIT.torus(0.072, 0.011, 12), s * 0.58, 1.20, zc + 3.11); // headlight guards
  }
  P.add('hull', box(0.30, 0.14, 0.72), 1.28, 1.585, zc - 0.65);                // rear fender toolbox
  shovelTool(P, -1.26, 1.055, zc + 2.0);
  P.add('hull', cylY(0.25, 0.25, 0.045, 14), -0.55, 1.49, zc + 1.55);          // driver hatch
  P.add('hullDark', cylY(0.257, 0.257, 0.012, 14), -0.55, 1.487, zc + 1.55);   // hatch seam
  KIT.periscope(P, 'hullDetail', -0.55, 1.525, zc + 1.90);                     // driver periscopes
  KIT.periscope(P, 'hullDetail', -0.20, 1.525, zc + 1.90);
  headlight(P, -0.58, 1.20, zc + 3.05, -0.4); headlight(P, 0.58, 1.20, zc + 3.05, -0.4);
  towCable(P, [[-1.38, 1.28, zc - 1.2], [-1.46, 1.32, zc + 0.6], [-1.38, 1.28, zc + 2.0]]);
  sovGear(P, { xc: 1.205, trackW: 0.65, wheels: 6, wheelR: 0.33, wheelY: 0.36, span: 4.45, zc, topY: 0.94 });

  // onion dome on a narrow ring collar (front view: 1.38 at y1.6 under a
  // 2.07 bulge at y1.9), crown 2.34 — no cupola spikes
  P.turretG.position.set(0, 1.50, -0.50);
  P.add('turret', cylY(0.70, 0.74, 0.16, P.q ? 26 : 14), 0, 0.08, 0.0);        // ring collar
  P.add('turretDark', cylY(0.755, 0.755, 0.022, 16), 0, 0.155, 0.0);           // collar seat seam (dome sits ON it)
  panDome(P, [
    [0.74, 0.00], [0.99, 0.13], [1.04, 0.30], [0.94, 0.48],
    [0.66, 0.63], [0.34, 0.71], [0.02, 0.73],
  ], 1.50, 0.13, 0.0);
  // r2 low-profile dome fittings (oracle carries no spikes — stay <=2.40)
  P.add('turret', cylY(0.20, 0.21, 0.045, 12), -0.42, 0.79, -0.35);            // commander hatch ring
  P.add('turretDark', cylY(0.215, 0.215, 0.012, 12), -0.42, 0.833, -0.35);     // seam
  P.add('turret', cylY(0.17, 0.18, 0.04, 12), 0.40, 0.79, -0.22);              // loader hatch
  P.add('turretDark', cylY(0.185, 0.185, 0.012, 12), 0.40, 0.828, -0.22);
  P.add('turretDark', KIT.torus(0.155, 0.016, 14), 0.40, 0.845, -0.22);        // DShK ring mount
  KIT.periscope(P, 'turretDetail', -0.05, 0.845, 0.12);                        // periscope pods
  KIT.periscope(P, 'turretDetail', -0.42, 0.845, -0.62, 0.3);
  for (const s of [-1, 1]) {
    liftEye(P, 'turretDetail', s * 0.82, 0.545, 0.55, s * 0.4);                // lifting bosses
    liftEye(P, 'turretDetail', s * 0.82, 0.53, -0.90, s * -0.4);
  }
  P.decal('turret', 'number', P.spec.visual.number || '6', 0.30, [1.00, 0.44, -0.1], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '6', 0.30, [-1.00, 0.44, -0.1], -Math.PI / 2, 0, -0.10);
  // 122 mm D-30: axis 1.90, compact brake, muzzle +4.94. r2: cast saddle at
  // the trunnion + coax port; the brake becomes a dark-slotted double drum
  // sized to the oracle blob (y 1.76-2.03) so it finally reads as a brake.
  P.gunG.position.set(0, 0.40, 1.30);
  saddle(P, { rollR: 0.26, rollW: 0.66, ballR: 0.20, ballZ: 0.36 });
  P.addGunExtra(cylZ(0.14, 0.36, 12, 0.17), 0, 0, 0.42);                       // sleeve step
  P.addGunExtraDark(cylZ(0.024, 0.10, 8), 0.20, 0.10, 0.30);                   // coax port
  buildGun(P, { len: 4.14, r: 0.085, brake: null, baseR: 0.15, sleeve: false, evac: null });
  P.add('gunDark', cylZ(0.052, 0.34, 10), 0, 0, 3.92);                         // dark core through the slot
  P.add('gun', cylZ(0.130, 0.15, 12), 0, 0, 3.80);                             // rear drum
  P.add('gunDark', cylZ(0.126, 0.013, 12), 0, 0, 3.878);                       // face ring
  P.add('gun', cylZ(0.125, 0.14, 12), 0, 0, 4.01);                             // front drum
  P.add('gunDark', cylZ(0.121, 0.013, 12), 0, 0, 3.938);                       // face ring
  P.add('gun', cylZ(0.088, 0.06, 10), 0, 0, 4.11);                             // exit collar
  P.topY = 0.95;
}

// ---------------------------------------------------------------------------
// KV-2 — docs/references/tanks/kv2.md
// hull z −3.58..+3.25 (len 6.84) roof ~1.63, stepped bow 1.57/1.37/1.30;
// slab turret 1.88 wide × 1.45 tall (1.67..3.12) × ~2.45 deep, periscope to
// 3.27; stubby fat 152 mm at axis 2.57, muzzle +3.60.
// ---------------------------------------------------------------------------
function buildKV2(P) {
  const { box, cylY, cylZ, cylX, sph, frustum, fenders, headlight, towCable, buildGun } = KIT;
  const zc = -0.165;
  P.add('hull', box(1.92, 0.76, 6.55), 0, 0.66, zc - 0.06);                    // belly
  P.add('hull', frustum(1.655, zc + 2.60, zc - 3.42, 1.63, zc + 2.62, zc - 3.40, 1.02, 1.44)); // slab sides
  P.add('hull', box(1.94, 0.04, 6.30), 0, 1.44, zc - 0.10);                    // LOW centre deck (turret well)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.70, 0.06, 6.60), s * 1.29, 1.60, zc - 0.10);           // raised sponson decks
    P.add('hull', box(0.50, 0.16, 0.90), s * 1.22, 1.70, zc - 0.50);           // outboard stowage humps
    // r2: hull handrails along the sponson sides (family critical #5)
    P.add('hullDetail', box(0.018, 0.018, 2.30), s * 1.648, 1.26, zc - 0.65);
    for (const dz of [-1.65, -0.65, 0.35]) {
      P.add('hullDetail', box(0.014, 0.09, 0.014), s * 1.648, 1.21, zc - 0.65 + dz + 0.65);
    }
    // fender gusset struts under the fender lip (LEFT shows three per side)
    for (const gz of [-2.45, -0.35, 1.85]) {
      P.add('hullDetail', box(0.018, 0.26, 0.05), s * 1.46, 0.93, zc + gz, 0.75, 0, 0);
    }
  }
  // stepped KV bow: driver plate slope + nose shelf
  P.add('hull', frustum(1.63, zc + 2.78, zc + 2.55, 1.60, zc + 2.58, zc + 2.52, 1.02, 1.60));
  P.add('hull', frustum(1.655, zc + 3.42, zc + 2.72, 1.655, zc + 3.42, zc + 2.72, 1.02, 1.315)); // nose shelf
  P.add('hull', box(3.26, 0.30, 0.30), 0, 0.90, zc + 3.26);                    // bow beak
  P.add('hull', box(3.10, 0.60, 0.14), 0, 1.10, zc - 3.42);                    // tail plate
  fenders(P, 1.00, 1.655, 1.06, zc - 3.40, zc + 3.30, 0.035);
  P.add('hull', box(0.44, 0.22, 0.9), -1.28, 1.72, zc - 2.2);                  // deck boxes
  P.add('hull', box(0.44, 0.22, 0.9), 1.28, 1.72, zc - 1.1);
  // r2 bow: driver visor + hull MG ball + BOTH draped tow cables w/ shackles
  P.add('hullDetail', box(0.34, 0.15, 0.035), -0.42, 1.36, zc + 2.70, -0.72, 0, 0); // driver visor plate
  P.add('hullDark', box(0.26, 0.03, 0.04), -0.42, 1.37, zc + 2.72, -0.72, 0, 0);    // visor slit
  P.add('hull', sph(0.10, 12), 0.48, 1.34, zc + 2.72);                         // bow MG ball
  P.add('hullDark', cylZ(0.024, 0.20, 8), 0.48, 1.36, zc + 2.84, -0.35, 0, 0); // MG stub
  towCable(P, [[-1.35, 1.35, zc - 1.6], [-1.45, 1.40, zc + 0.4], [-1.35, 1.35, zc + 2.3]]);
  towCable(P, [[1.30, 1.34, zc + 0.6], [0.65, 1.42, zc + 2.45], [0.28, 1.345, zc + 3.05]]);
  P.add('hullDark', box(0.09, 0.05, 0.14), 0.28, 1.34, zc + 3.10);             // shackle at the beak
  P.add('hullDark', box(0.09, 0.05, 0.14), -1.35, 1.34, zc - 1.68);
  // engine deck: mesh intake squares + round engine hatch + tail exhausts
  for (const s of [-1, 1]) P.add('hullDark', box(0.46, 0.016, 0.52), s * 0.50, 1.452, zc - 1.85);
  P.add('hull', cylY(0.26, 0.26, 0.035, 14), 0, 1.455, zc - 2.65);
  P.add('hullDark', cylY(0.268, 0.268, 0.012, 14), 0, 1.452, zc - 2.65);
  for (const s of [-1, 1]) {
    // twin exhausts, held flush with the tail-plate face (extending the hull
    // z-bound shifts the gun-overhang crop and cost 2 gun points in r2a)
    P.add('hullDark', cylZ(0.055, 0.24, 10), s * 0.44, 1.26, zc - 3.37, 0.20, 0, 0);
    P.add('hullDetail', cylZ(0.065, 0.04, 10), s * 0.44, 1.255, zc - 3.42, 0.20, 0, 0);
  }
  headlight(P, -1.22, 1.16, zc + 3.05, -0.3);                                  // headlight + horn on the left fender
  P.add('hullDark', cylZ(0.045, 0.09, 8), -0.98, 1.14, zc + 3.02, -0.3, 0, 0);
  sovGear(P, {
    xc: 1.305, trackW: 0.70, wheels: 6, wheelR: 0.30, wheelY: 0.33, span: 4.70, zc, topY: 1.00,
    rollers: [zc - 1.55, zc, zc + 1.55].map((z) => ({ z, y: 1.00, r: 0.085 })),
  });

  // MT-1 slab turret: vertical sides, chamfered front-top, rear handrail;
  // the skirt drops into the low deck well like the oracle's
  P.turretG.position.set(0, 1.67, 0.32);
  P.add('turret', box(1.86, 1.56, 2.40), 0, 0.52, 0.0);                        // main slab (base flush with the well deck)
  P.add('turret', frustum(0.92, 1.18, -1.18, 0.90, 0.94, -1.16, 1.30, 1.44));  // roof band w/ front chamfer
  P.add('turret', box(1.60, 0.30, 0.30), 0, 1.29, 1.10, -0.5, 0, 0);           // front-top chamfer fill
  P.add('turret', box(0.16, 0.15, 0.16), 0.30, 1.52, 0.35);                    // periscope (LOD0 bucket)
  KIT.periscope(P, 'turretDetail', -0.30, 1.50, 0.30);                         // second roof periscope pod
  P.add('turret', cylY(0.15, 0.16, 0.05, 12), 0.38, 1.455, -0.15);             // forward hatch ring
  P.add('turretDark', cylY(0.165, 0.165, 0.012, 12), 0.38, 1.503, -0.15);      // hatch seam
  P.add('turret', cylY(0.16, 0.16, 0.06, 12), -0.35, 1.47, -0.55);             // rear hatch
  P.add('turretDark', cylY(0.17, 0.17, 0.012, 12), -0.35, 1.528, -0.55);       // hatch seam
  P.add('turret', box(1.55, 0.035, 0.035), 0, 0.95, -1.32);                    // rear handrail
  for (const s of [-0.6, 0, 0.6]) P.add('turret', box(0.03, 0.16, 0.03), s * 1, 0.86, -1.30);
  P.add('turret', box(0.70, 0.72, 0.035), 0, 0.55, -1.215);                    // rear door plate
  P.add('turret', sph(0.085, 12), 0, 0.52, -1.235);                            // rear MG ball
  P.add('turretDark', cylZ(0.02, 0.18, 8), 0, 0.52, -1.33);                    // rear MG stub
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.02, 0.05, 0.22), s * 0.937, 0.82, 0.30);         // side vision slits
    P.add('turretDark', box(0.02, 0.05, 0.16), s * 0.937, 0.78, -0.75);
  }
  // r2 rivet stud rows along every plate seam (family critical #5: the r1
  // "rivets" were naked plates — these are actual dark studs, turretDark).
  const stud = (x, y, z, face) => {
    if (face === 'z') P.add('turretDark', box(0.030, 0.030, 0.018), x, y, z);
    else P.add('turretDark', box(0.018, 0.030, 0.030), x, y, z);
  };
  for (let i = 0; i < 6; i++) {                                                // front plate columns
    stud(-0.80, 0.06 + i * 0.20, 1.209, 'z'); stud(0.80, 0.06 + i * 0.20, 1.209, 'z');
  }
  for (let i = 0; i < 5; i++) stud(-0.60 + i * 0.30, 1.13, 1.209, 'z');        // front top row
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {                                              // side plate edge columns
      stud(s * 0.939, 0.10 + i * 0.19, 1.08, 'x');
      stud(s * 0.939, 0.10 + i * 0.19, -1.06, 'x');
    }
    for (let i = 0; i < 7; i++) stud(s * 0.939, 1.16, -0.90 + i * 0.30, 'x');  // side roof-line rows
  }
  for (let i = 0; i < 4; i++) {                                                // rear door frame
    stud(-0.40, 0.24 + i * 0.21, -1.222, 'z'); stud(0.40, 0.24 + i * 0.21, -1.222, 'z');
  }
  P.decal('turret', 'number', P.spec.visual.number || '2', 0.40, [0.94, 0.62, -0.2], Math.PI / 2, 0, 0);
  P.decal('turret', 'number', P.spec.visual.number || '2', 0.40, [-0.94, 0.62, -0.2], -Math.PI / 2, 0, 0);
  // 152 mm M-10T: boxy mantlet, fat stubby tube, muzzle +3.60. r2: the huge
  // boxed recess (dark void at depression) becomes the round BOLTED mantlet
  // disc + stepped inner sleeve, backed by a fixed collar on the turret face
  // so the assembly stays sealed through -5..+12°.
  P.gunG.position.set(0, 0.90, 1.10);
  P.addGunExtra(cylZ(0.44, 0.15, 18), 0, 0, 0.16);                             // bolted mantlet disc
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.13;
    P.addGunExtraDark(cylZ(0.017, 0.03, 6), Math.cos(a) * 0.395, Math.sin(a) * 0.395, 0.245);
  }
  P.addGunExtra(cylZ(0.30, 0.18, 16, 0.34), 0, 0, 0.32);                       // inner sleeve cone
  P.addGunExtra(cylZ(0.235, 0.22, 14, 0.27), 0, 0, 0.46);                      // sleeve step to the tube
  P.addGunExtra(box(0.72, 0.30, 0.26), 0, -0.44, 0.16);                        // chin under the howitzer
  P.add('turret', cylZ(0.335, 0.16, 16), 0, 0.90, 1.14);                       // fixed aperture collar behind the disc
  buildGun(P, { len: 2.24, r: 0.115, brake: null, baseR: 0.19, sleeve: false, evac: null });
  P.add('gun', cylZ(0.125, 0.10, 12), 0, 0, 2.18);                             // muzzle collar
  P.topY = 1.55;
}

export const SOVIET_HEAVY_PROFILES = {
  is3: { build: buildIS3 },
  is7: { build: buildIS7 },
  object279: { build: buildObject279 },
  is6b: { build: buildIS6B },
  is3_bergman: { build: buildIS3Bergman },
  kv2: { build: buildKV2 },
};
