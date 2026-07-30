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
// FRAME NOTE: the snowleopard GLBs (is7 / object279 / is6b) fuse the gun into
// the turret mesh, so the loader normalizes them on the FULL bounding box —
// in world space their hulls sit rear-shifted (whole bbox centred). Each
// build below replicates its oracle's frame (zc = hull centre) so the
// raw-frame cannon-overhang metric and the in-game silhouette both line up
// with what the local reference renders.
import { KIT } from './kit.js';

// ---------------------------------------------------------------------------
// Family machinery
// ---------------------------------------------------------------------------

// IS running gear: big steel wheels low on the hull, rear sprocket, no
// return-roller gap (KV passes explicit rollers).
function sovGear(P, g) {
  const { buildRunningGear } = KIT;
  const wheelZs = Array.from({ length: g.wheels }, (_, i) =>
    g.zc + g.span / 2 - i * (g.span / (g.wheels - 1)));
  buildRunningGear(P, {
    style: 'steel', wheelR: g.wheelR, wheelW: Math.min(0.24, g.trackW * 0.42),
    wheelY: g.wheelY, xc: g.xc, wheelZs,
    sprocket: { z: g.zc - g.span / 2 - 0.44, y: g.wheelR + 0.10, r: g.wheelR * 0.92 },
    idler: { z: g.zc + g.span / 2 + 0.44, y: g.wheelR + 0.06, r: g.wheelR * 0.84 },
    rollers: g.rollers || [], trackW: g.trackW, topY: g.topY,
    botY: g.botY ?? 0.10,                 // track run above the wheel bottoms:
    arms: true,                           // the oracles show wheel scallops
  });
}

// Squashed cast dome ("frying pan"): lathe profile [[r, y]...] stretched
// lengthwise by sz, seated at (x, y, z) in turret space.
function panDome(P, profile, sz, y, z) {
  const { lathe } = KIT;
  P.add('turret', lathe(profile, P.q ? 32 : 16, sz), 0, y, z);
}

// Roof-mounted AA MG silhouette. Deliberately built in the LOD0 'turret'
// bucket: greeble buckets (turretDark/turretDetail) are LOD-wrapped, and
// THREE.LOD.update re-enables them during the fidelity harness's hull-part
// renders — a turretDark MG leaks into the hull mask AND gets subtracted out
// of the turret mask. LOD0 buckets stay correctly partitioned.
function aaMG(P, x, y, z) {
  const { box, cylY, cylZ } = KIT;
  P.add('turret', cylY(0.045, 0.055, 0.32, 8), x, y + 0.16, z);
  P.add('turret', box(0.10, 0.13, 0.46), x, y + 0.40, z + 0.04);
  P.add('turret', cylZ(0.024, 0.62, 8), x, y + 0.45, z + 0.52, -0.06, 0, 0);
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
}

// ---------------------------------------------------------------------------
// IS-7 — docs/references/tanks/is7.md
// hull z −5.04..+1.51 (len 6.55), roof 1.41, glacis→1.08; long egg dome
// z −3.5..+0.9 crown 2.25; muzzle +5.06 (3.55 m overhang) at axis y 1.71.
// ---------------------------------------------------------------------------
function buildIS7(P) {
  const { box, cylY, cylZ, frustum, fenders, headlight, towCable, buildGun, liftEye } = KIT;
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
  P.add('hull', box(0.13, 0.46, 0.13), 0, 1.55, zc + 2.55);                    // glacis IR/periscope stub (oracle has one)
  for (let i = 0; i < 5; i++) P.add('hullDark', box(1.9, 0.02, 0.10), 0, 1.445, zc - 1.5 - i * 0.28); // grilles
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
  P.add('turret', cylY(0.20, 0.22, 0.13, 14), 0.42, 0.80, -0.78);              // commander cupola (to ~2.47)
  P.add('turret', cylY(0.19, 0.21, 0.07, 12), -0.55, 0.66, -0.40);             // loader hatch bump
  aaMG(P, 0.02, 0.70, -1.95);                                                  // rear AA MG (to ~2.58)
  for (const x of [-0.16, 0.20]) P.add('turret', box(0.035, 0.34, 0.035), x, 0.98, -1.95); // MG mount frame
  P.add('turret', box(0.44, 0.045, 0.05), 0.02, 1.16, -1.95);
  P.decal('turret', 'number', P.spec.visual.number || '7', 0.30, [1.14, 0.34, -0.3], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '7', 0.30, [-1.14, 0.34, -0.3], -Math.PI / 2, 0, -0.10);

  // 130 mm S-70: axis y 1.71, muzzle at world +5.06 (3.55 m past the bow)
  P.gunG.position.set(0, 0.285, 1.90);
  P.addGunExtra(box(0.58, 0.42, 0.36), 0, 0.08, 0.24);                          // cast mantlet mass
  P.addGunExtra(KIT.xform(KIT.cylX(0.29, 0.80, 12), 0, 0, 0), 0, 0.06, 0.16);   // mantlet roll
  P.addGunExtra(cylZ(0.155, 0.55, 14, 0.19), 0, 0, 0.44);                       // stepped root sleeve
  P.add('turret', box(0.85, 0.24, 0.55), 0, 0.52, 2.02, -0.42, 0, 0);           // cast brow over the mantlet
  buildGun(P, { len: 4.46, r: 0.080, brake: true, baseR: 0.15, sleeve: false, evac: null });
  P.topY = 0.85;
}

// ---------------------------------------------------------------------------
// IS-3 — docs/references/tanks/is3.md
// hull ±3.41 (len 6.82), crew roof 1.49, deck line 1.72, glacis→1.10; fat
// squashed dome crown 2.54 + DShK to ~3.1; muzzle +5.66 (2.25 m) axis 2.02.
// is3_bergman reuses the hull (identical oracle roofline).
// ---------------------------------------------------------------------------
function is3Hull(P) {
  const { box, cylY, cylZ, frustum, fenders, headlight, towCable, liftEye } = KIT;
  P.add('hull', box(1.90, 0.66, 6.60), 0, 0.63, -0.03);                        // belly
  P.add('hull', frustum(1.50, 2.06, -3.41, 1.41, 2.08, -3.38, 0.84, 1.49));    // sloped sponson band (skirt floor 0.84)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.28, 0.46, 0.035), s * 1.36, 0.42, -3.38);              // rear mud flaps
    P.add('hull', box(0.24, 0.34, 0.030), s * 1.30, 0.44, 3.06);               // front mud flaps
  }
  P.add('hull', box(2.80, 0.05, 5.30), 0, 1.475, -0.72);                       // crew/deck roof
  P.add('hull', box(2.60, 0.07, 3.10), 0, 1.525, -1.80);                       // rear deck step
  for (const s of [-1, 1]) {
    // external fuel drums own the 1.72 side-profile line (the oracle's deck
    // is flat ~1.55; its raised roof stations are these drums)
    P.add('hull', cylZ(0.165, 2.10, 12), s * 1.41, 1.56, -1.45);
    P.add('hullDark', cylZ(0.17, 0.03, 12), s * 1.41, 1.56, -0.72);
    P.add('hullDark', cylZ(0.17, 0.03, 12), s * 1.41, 1.56, -2.14);
  }
  P.add('hull', box(0.92, 0.09, 0.55), 0, 1.53, 2.12, -0.10, 0, 0);            // driver hump
  pikeNose(P, { zBreak: 2.06, zTip: 3.41, yBelt: 0.95, yRoof: 1.49, yBelly: 0.38, wRoof: 1.18, wBelt: 1.47, cheekW: 1.15 });
  P.add('hull', frustum(1.40, -3.36, -3.41, 1.40, -3.02, -3.41, 0.42, 0.95));  // rear lower slope
  P.add('hull', box(2.78, 0.52, 0.12), 0, 1.20, -3.36);                        // rear plate
  fenders(P, 1.02, 1.53, 1.02, -3.36, 3.10, 0.03);
  headlight(P, -0.55, 1.26, 3.02, -0.42); headlight(P, 0.55, 1.26, 3.02, -0.42);
  towCable(P, [[-1.34, 1.30, -1.4], [-1.42, 1.36, 0.6], [-1.34, 1.30, 2.2]]);
  liftEye(P, 'hullDetail', -0.85, 1.52, -2.9); liftEye(P, 'hullDetail', 0.85, 1.52, -2.9);
  P.add('hullTrack', box(0.5, 0.05, 0.26), -0.55, 1.30, 2.78, -0.36, 0, 0);    // spare links on the pike
  sovGear(P, { xc: 1.175, trackW: 0.65, wheels: 6, wheelR: 0.33, wheelY: 0.36, span: 4.60, zc: 0, topY: 0.94 });
}

function buildIS3(P) {
  const { box, cylY, cylZ, buildGun } = KIT;
  is3Hull(P);
  // squat wide casting: base ring floats at ~1.72, crown 2.54
  P.turretG.position.set(0, 1.50, 0.10);
  panDome(P, [
    [1.42, 0.00], [1.46, 0.18], [1.44, 0.44], [1.33, 0.68],
    [1.10, 0.86], [0.60, 0.99], [0.02, 1.04],
  ], 1.20, 0.0, 0.05);
  P.add('turret', cylY(0.21, 0.23, 0.07, 14), -0.44, 0.92, -0.38);             // commander ring
  P.add('turret', cylY(0.19, 0.21, 0.06, 14), 0.44, 0.90, -0.30);              // loader ring
  P.add('turret', box(0.06, 0.46, 0.06), 0.36, 1.14, -0.45);                   // DShK mast
  aaMG(P, 0.36, 1.20, -0.48);                                                  // to ~3.1 world
  P.add('turret', box(0.22, 0.20, 0.30), 0.28, 1.56, -0.42);                   // DShK receiver + drum
  P.add('turret', box(0.85, 0.24, 0.50), 0, 0.62, 1.70, -0.50, 0, 0);          // cast brow over the mantlet
  P.decal('turret', 'number', P.spec.visual.number || '703', 0.32, [1.32, 0.42, -0.2], Math.PI / 2, 0, 0.12);
  P.decal('turret', 'number', P.spec.visual.number || '703', 0.32, [-1.32, 0.42, -0.2], -Math.PI / 2, 0, -0.12);
  // 122 mm D-25T: axis 2.02, fat sleeved tube (mask Ø ~0.24), muzzle +5.66,
  // German-pattern double-baffle brake sized to the oracle (Ø ~0.35)
  P.gunG.position.set(0, 0.52, 1.55);
  P.addGunExtra(box(0.52, 0.42, 0.30), 0, 0.05, 0.18);                         // mantlet mass
  P.addGunExtra(KIT.xform(KIT.cylX(0.28, 0.66, 12), 0, 0, 0), 0, 0.0, 0.16);   // mantlet roll
  P.addGunExtra(cylZ(0.16, 0.42, 12, 0.20), 0, -0.05, 0.34);                   // bulged root
  P.addGunExtra(box(0.50, 0.24, 0.52), 0, -0.30, 0.34);                        // chin under the root
  buildGun(P, { len: 4.01, r: 0.125, brake: null, baseR: 0.18, sleeve: false, evac: null });
  P.add('gun', cylZ(0.062, 0.70, 10), 0, 0, 3.68);                             // thin brake core
  P.add('gun', cylZ(0.175, 0.08, 14), 0, 0, 3.60);                             // rear baffle plate
  P.add('gun', cylZ(0.168, 0.08, 14), 0, 0, 3.88);                             // front baffle plate
  P.add('gun', box(0.35, 0.05, 0.32), 0, 0, 3.74);                             // gas-divider spine
  P.add('gun', cylZ(0.09, 0.11, 12), 0, 0, 3.97);                              // exit block
  P.topY = 1.10;
}

// The recovered bergman print's Turret node is degenerate (fenders and drums
// parented into it; the turret shell itself sits SUNKEN inside the hull) —
// see the packet. In silhouette the oracle shows NO dome at all: just the
// deck line, a small ~0.66-wide hatch stack reaching 2.19, and a stub muzzle
// whose overhang bbox is a short tall blob. Matching a sane articulated
// turret to that rig is impossible without spinning hull furniture, so this
// build keeps a FLUSH turret: low ring + hatch stack + stub gun.
function buildIS3Bergman(P) {
  const { box, cylY, cylZ, buildGun } = KIT;
  is3Hull(P);
  P.turretG.position.set(0, 1.52, -0.10);
  panDome(P, [[0.92, 0.00], [0.88, 0.10], [0.60, 0.17], [0.02, 0.19]], 1.25, 0.0, 0.0); // flush cap
  P.add('turret', cylY(0.26, 0.30, 0.18, 14), -0.10, 0.26, -0.30);             // hatch drum
  P.add('turret', cylY(0.20, 0.22, 0.16, 12), -0.10, 0.42, -0.30);             // riser
  P.add('turret', box(0.30, 0.20, 0.26), -0.10, 0.58, -0.30);                  // sight head (to ~2.20)
  P.decal('turret', 'number', P.spec.visual.number || '703', 0.24, [0.80, 0.10, -0.1], Math.PI / 2, 0, 0.10);
  P.gunG.position.set(0, 0.42, 1.25);
  P.addGunExtra(KIT.xform(KIT.cylX(0.22, 0.56, 12), 0, 0, 0), 0, 0.0, 0.10);
  buildGun(P, { len: 2.40, r: 0.10, brake: null, baseR: 0.15, sleeve: false, evac: null });
  P.add('gun', cylZ(0.20, 0.09, 14), 0, 0, 2.35);                              // muzzle collar disc — the
  P.add('gun', cylZ(0.15, 0.07, 14), 0, 0, 2.26);                              // oracle overhang is a short
  P.topY = 0.70;                                                               // tall blob (~0.41 x 0.14)
}

// ---------------------------------------------------------------------------
// Object 279 — docs/references/tanks/object279.md
// elliptical shell z −4.84..+1.51 (len 6.36) roof 1.57, full width to y≈0.35,
// rounded stern; flat dome crown 2.38; muzzle +4.86 (3.35 m) axis 1.79.
// ---------------------------------------------------------------------------
function buildObject279(P) {
  const { box, cylY, cylZ, frustum, xform, headlight, buildGun } = KIT;
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
  for (let i = 0; i < 4; i++) P.add('hullDark', box(2.0, 0.02, 0.12), 0, 1.565, zc - 1.35 - i * 0.32); // grilles
  // four-track running gear: one visible line per side + inner pair hint
  sovGear(P, { xc: 1.40, trackW: 0.58, wheels: 7, wheelR: 0.27, wheelY: 0.30, span: 4.30, zc, topY: 0.72 });
  for (const s of [-1, 1]) P.add('hullDark', box(0.52, 0.34, 5.0), s * 0.55, 0.24, zc);       // inner track pair
  P.decal('hull', 'number', P.spec.visual.number || '279', 0.30, [1.55, 1.0, 0.6], Math.PI / 2, 0, 0);

  // flat wide dome, crown 2.38 — no cupola spikes on the oracle
  P.turretG.position.set(0, 1.58, -1.20);
  panDome(P, [
    [1.34, 0.00], [1.42, 0.09], [1.34, 0.30], [1.14, 0.52],
    [0.84, 0.68], [0.46, 0.78], [0.02, 0.81],
  ], 1.13, 0.0, 0.0);
  for (const s of [-1, 1]) P.add('turret', cylY(0.16, 0.18, 0.045, 12), s * 0.36, 0.62, -0.30); // flush hatches
  // 130 mm M-65: fat tube, slim slotted muzzle — no brake drum
  P.gunG.position.set(0, 0.21, 1.45);
  P.addGunExtra(KIT.xform(KIT.cylX(0.24, 0.62, 12), 0, 0, 0), 0, 0.0, 0.12);
  P.addGunExtra(cylZ(0.15, 0.40, 12, 0.185), 0, 0, 0.34);
  buildGun(P, { len: 4.61, r: 0.096, brake: null, baseR: 0.15, sleeve: false, evac: null });
  P.add('gun', cylZ(0.108, 0.05, 12), 0, 0, 4.30);                             // slot rings
  P.add('gun', cylZ(0.108, 0.05, 12), 0, 0, 4.14);
  P.topY = 0.9;
}

// ---------------------------------------------------------------------------
// IS-6B — docs/references/tanks/is6b.md
// hull z −4.92..+1.65 (len 6.57): sloped rear deck 1.18→1.55, flat 1.53,
// glacis→1.06; onion dome on a narrow ring collar, crown 2.34; muzzle +4.94
// (3.29 m) axis 1.90 with a compact brake.
// ---------------------------------------------------------------------------
function buildIS6B(P) {
  const { box, cylY, cylZ, frustum, slab, fenders, headlight, towCable, buildGun } = KIT;
  const zc = -1.635;
  P.add('hull', box(1.90, 0.66, 6.34), 0, 0.62, zc);                           // belly
  P.add('hull', frustum(1.60, zc + 1.95, zc - 1.65, 1.53, zc + 1.97, zc - 1.65, 0.95, 1.52)); // mid sponson band
  P.add('hull', box(2.86, 0.04, 3.30), 0, 1.505, zc + 0.15);                   // flat roof
  // sloped rear deck: top edge falls to 1.16 at the tail
  P.add('hull', slab(
    [-1.56, 0.95, zc - 1.63], [1.56, 0.95, zc - 1.63], [1.47, 0.95, zc - 3.28], [-1.47, 0.95, zc - 3.28],
    [-1.53, 1.52, zc - 1.63], [1.53, 1.52, zc - 1.63], [1.44, 1.16, zc - 3.28], [-1.44, 1.16, zc - 3.28]));
  // glacis: flat 1.47 fore roof, slope to 1.06, fender tips reach the nose
  P.add('hull', frustum(1.55, zc + 2.60, zc + 1.93, 1.46, zc + 2.02, zc + 1.90, 0.95, 1.47));
  P.add('hull', frustum(1.50, zc + 2.95, zc + 2.55, 1.52, zc + 2.62, zc + 2.50, 0.95, 1.30));
  P.add('hull', frustum(1.30, zc + 2.85, zc + 2.55, 1.50, zc + 3.05, zc + 2.52, 0.44, 0.95)); // lower glacis
  P.add('hull', box(2.86, 0.28, 0.55), 0, 0.98, zc + 3.00);                    // nose shelf / mudguard belt
  P.add('hull', box(2.80, 0.50, 0.12), 0, 0.90, zc - 3.24);                    // tail plate
  fenders(P, 1.02, 1.545, 1.02, zc - 3.20, zc + 3.10, 0.03);
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.155, 0.85, 12), s * 1.33, 1.42, zc - 2.30);           // rear drums
    P.add('hull', box(0.34, 0.20, 0.95), s * 1.30, 1.22, zc + 1.15);           // fender boxes
  }
  P.add('hull', cylY(0.25, 0.25, 0.045, 14), -0.55, 1.49, zc + 1.55);          // driver hatch
  headlight(P, -0.58, 1.20, zc + 3.05, -0.4); headlight(P, 0.58, 1.20, zc + 3.05, -0.4);
  towCable(P, [[-1.38, 1.28, zc - 1.2], [-1.46, 1.32, zc + 0.6], [-1.38, 1.28, zc + 2.0]]);
  sovGear(P, { xc: 1.205, trackW: 0.65, wheels: 6, wheelR: 0.33, wheelY: 0.36, span: 4.45, zc, topY: 0.94 });

  // onion dome on a narrow ring collar (front view: 1.38 at y1.6 under a
  // 2.07 bulge at y1.9), crown 2.34 — no cupola spikes
  P.turretG.position.set(0, 1.50, -0.50);
  P.add('turret', cylY(0.70, 0.74, 0.16, P.q ? 26 : 14), 0, 0.08, 0.0);        // ring collar
  panDome(P, [
    [0.74, 0.00], [0.99, 0.13], [1.04, 0.30], [0.94, 0.48],
    [0.66, 0.63], [0.34, 0.71], [0.02, 0.73],
  ], 1.50, 0.13, 0.0);
  P.decal('turret', 'number', P.spec.visual.number || '6', 0.30, [1.00, 0.44, -0.1], Math.PI / 2, 0, 0.10);
  P.decal('turret', 'number', P.spec.visual.number || '6', 0.30, [-1.00, 0.44, -0.1], -Math.PI / 2, 0, -0.10);
  // 122 mm D-30: axis 1.90, compact brake, muzzle +4.94
  P.gunG.position.set(0, 0.40, 1.30);
  P.addGunExtra(KIT.xform(KIT.cylX(0.24, 0.58, 12), 0, 0, 0), 0, 0.0, 0.10);
  P.addGunExtra(cylZ(0.14, 0.36, 12, 0.17), 0, 0, 0.30);
  buildGun(P, { len: 4.14, r: 0.085, brake: true, baseR: 0.15, sleeve: false, evac: null });
  P.add('gun', cylZ(0.135, 0.14, 12), 0, 0, 3.86);                             // brake rear drum
  P.topY = 0.95;
}

// ---------------------------------------------------------------------------
// KV-2 — docs/references/tanks/kv2.md
// hull z −3.58..+3.25 (len 6.84) roof ~1.63, stepped bow 1.57/1.37/1.30;
// slab turret 1.88 wide × 1.45 tall (1.67..3.12) × ~2.45 deep, periscope to
// 3.27; stubby fat 152 mm at axis 2.57, muzzle +3.60.
// ---------------------------------------------------------------------------
function buildKV2(P) {
  const { box, cylY, cylZ, frustum, fenders, headlight, towCable, buildGun } = KIT;
  const zc = -0.165;
  P.add('hull', box(1.92, 0.76, 6.55), 0, 0.66, zc - 0.06);                    // belly
  P.add('hull', frustum(1.655, zc + 2.60, zc - 3.42, 1.63, zc + 2.62, zc - 3.40, 1.02, 1.44)); // slab sides
  P.add('hull', box(1.94, 0.04, 6.30), 0, 1.44, zc - 0.10);                    // LOW centre deck (turret well)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.70, 0.06, 6.60), s * 1.29, 1.60, zc - 0.10);           // raised sponson decks
    P.add('hull', box(0.50, 0.16, 0.90), s * 1.22, 1.70, zc - 0.50);           // outboard stowage humps
  }
  // stepped KV bow: driver plate slope + nose shelf
  P.add('hull', frustum(1.63, zc + 2.78, zc + 2.55, 1.60, zc + 2.58, zc + 2.52, 1.02, 1.60));
  P.add('hull', frustum(1.655, zc + 3.42, zc + 2.72, 1.655, zc + 3.42, zc + 2.72, 1.02, 1.315)); // nose shelf
  P.add('hull', box(3.26, 0.30, 0.30), 0, 0.90, zc + 3.26);                    // bow beak
  P.add('hull', box(3.10, 0.60, 0.14), 0, 1.10, zc - 3.42);                    // tail plate
  fenders(P, 1.00, 1.655, 1.06, zc - 3.40, zc + 3.30, 0.035);
  P.add('hull', box(0.44, 0.22, 0.9), -1.28, 1.72, zc - 2.2);                  // deck boxes
  P.add('hull', box(0.44, 0.22, 0.9), 1.28, 1.72, zc - 1.1);
  headlight(P, -0.55, 1.42, zc + 3.15, -0.3);
  towCable(P, [[-1.40, 1.35, zc - 1.6], [-1.50, 1.40, zc + 0.4], [-1.40, 1.35, zc + 2.3]]);
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
  P.add('turret', cylY(0.16, 0.16, 0.06, 12), -0.35, 1.47, -0.55);             // rear hatch
  P.add('turret', box(1.55, 0.035, 0.035), 0, 0.95, -1.32);                    // rear handrail
  for (const s of [-0.6, 0, 0.6]) P.add('turret', box(0.03, 0.16, 0.03), s * 1, 0.86, -1.30);
  P.add('turret', box(0.70, 0.72, 0.035), 0, 0.55, -1.215);                    // rear door plate
  P.decal('turret', 'number', P.spec.visual.number || '2', 0.40, [0.94, 0.62, -0.2], Math.PI / 2, 0, 0);
  P.decal('turret', 'number', P.spec.visual.number || '2', 0.40, [-0.94, 0.62, -0.2], -Math.PI / 2, 0, 0);
  // 152 mm M-10T: boxy mantlet, fat stubby tube, muzzle +3.60
  P.gunG.position.set(0, 0.90, 1.10);
  P.addGunExtra(box(0.96, 0.70, 0.30), 0, -0.12, 0.16);                        // mantlet box (oracle's sits low)
  P.addGunExtra(KIT.xform(KIT.cylX(0.26, 0.70, 12), 0, 0, 0), 0, -0.06, 0.34); // rounded cradle
  P.addGunExtra(box(0.72, 0.34, 0.30), 0, -0.42, 0.18);                        // chin under the howitzer
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
