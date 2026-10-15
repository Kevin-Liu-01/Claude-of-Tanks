// src/world/maps/spaceKit.ts — the space stations' light kinds (props census #12; the looks lane, 2026-10-15).
//
// The off-world bases built member by member, each world its own (WORKLIST #12):
//   - the Moon (Earthrise, 1972, Artemis-lineage forms): the surface habitat on its lander legs and footpads, white
//     micrometeoroid blankets with gold foil joint rings, a hatch in a recessed frame over a ladder, radiators on struts;
//     a solar array of two wings on a tracking mast; propellant tanks on cradled saddles; a lattice mast under an S-band
//     umbrella dish;
//   - Mars (Olympus, 2100): the hab lander's drum under bagged-regolith shielding on its saddles, its airlock porch with
//     suitports; rows of tracking panels; spherical tanks on legged stands; a taller mast with two dishes and its beacon.
// Everything stands on a sintered apron or footpads; no painted openings (a hatch is a frame, a reveal and a dark
// backing). Every part is named for the wreck (structureKit hutTools: tag), so the kind breaks into its settled wreck:
// the drum slumps off its legs, the legs fold, the end caps and the radiators come down, the bags spill.
import type * as THREE from 'three';
import type { HutTools } from './hutKit.ts';

type V3 = readonly [number, number, number];
export type SpaceWorld = 'moon' | 'mars';

/** The kinds this kit builds (structureKit's orbital light kinds). */
export const SPACE_KINDS: readonly string[] = ['habmodule', 'solararray', 'fueltanks', 'commsmast'];

interface SpacePaint {
  hull: number; blanket: number; foil: number; frame: number; dark: number; accent: number; apron: number; cell: number;
  bag: number; glass: number;
}
const PAINT: Readonly<Record<SpaceWorld, SpacePaint>> = {
  moon: { hull: 0xe2e0d8, blanket: 0xd8d6cc, foil: 0xc49a4a, frame: 0x4a4e52, dark: 0x101214, accent: 0xb8b8b0,
    apron: 0x5f5c57, cell: 0x1c2638, bag: 0x6f6c66, glass: 0x52849a },
  mars: { hull: 0xd9d2c4, blanket: 0xcfc6b4, foil: 0xb98a4a, frame: 0x5a5650, dark: 0x120f0d, accent: 0xd8712a,
    apron: 0x7a5440, cell: 0x1f2f4a, bag: 0x8a5a40, glass: 0x86b9d8 },
};

/** A thin round from a to b (a strut, a pipe, a rail): a beam of square section, its arrises eased. */
function strut(T: HutTools, a: V3, b: V3, w: number): THREE.BufferGeometry {
  return T.mbeam(a, b, w, w);
}

/** A drum along z (radius r, length len) centred at (x, y, z). */
function drumZ(T: HutTools, r: number, len: number, x: number, y: number, z: number, seg = 16): THREE.BufferGeometry {
  const g = T.cylinder(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}

/** A disc lying on the ground at (x, z): radius r, thickness t, its top at y0 + t. */
function pad(T: HutTools, r: number, t: number, x: number, y0: number, z: number, seg = 10): THREE.BufferGeometry {
  return T.cylinder(r, r * 1.08, t, seg).translate(x, y0 + t / 2, z);
}

/**
 * A hatch on a face whose outward normal is +z at z0: its frame (four members proud of the face), the reveal and the dark
 * backing set into the face, the door leaf ajar a hand's breadth; `w` x `h` clear, its sill at y0.
 */
function hatch(T: HutTools, P: SpacePaint, x: number, y0: number, z0: number, w: number, h: number): void {
  T.tag('frame', 'hatch', 'metal');
  const f = 0.09;
  T.put(T.mbox(w + 2 * f, f, 0.12).translate(x, y0 - f / 2, z0 + 0.02), P.frame);
  T.put(T.mbox(w + 2 * f, f, 0.12).translate(x, y0 + h + f / 2, z0 + 0.02), P.frame);
  for (const s of [-1, 1]) T.put(T.mbox(f, h, 0.12).translate(x + s * (w / 2 + f / 2), y0 + h / 2, z0 + 0.02), P.frame);
  // the dark of the airlock behind, set back into the hull
  T.put(T.box(w, h, 0.04).translate(x, y0 + h / 2, z0 - 0.1), P.dark, 0.01);
  T.tag('door', 'hatch-leaf', 'metal');
  const leaf = T.mbox(w * 0.96, h * 0.96, 0.05);
  leaf.translate(w * 0.48, 0, 0).rotateY(-0.5).translate(-w * 0.48, 0, 0);
  T.put(leaf.translate(x, y0 + h / 2, z0 + 0.07), P.hull);
}

/** A ladder up the face at z0 from the ground to y1 (its two rails and rungs), `w` wide at x. */
function ladder(T: HutTools, P: SpacePaint, x: number, z0: number, y1: number, w = 0.46): void {
  T.tag('fitting', 'ladder', 'metal');
  for (const s of [-1, 1]) T.put(strut(T, [x + s * w / 2, 0, z0 + 0.35], [x + s * w / 2, y1, z0 + 0.04], 0.05), P.frame);
  const n = Math.max(2, Math.floor(y1 / 0.32));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    T.put(T.mbox(w, 0.035, 0.035).translate(x, y1 * t, z0 + 0.35 + (0.04 - 0.35) * t), P.frame);
  }
}

// --- the habitat ------------------------------------------------------------------------------------------------------

function habModule(T: HutTools, world: SpaceWorld): void {
  const P = PAINT[world], r = 2.0, len = 7.2;
  if (world === 'moon') {
    // the sintered apron, its footpads, the four legs (a main strut and its two braces each) up to the drum's belly
    const cy = 3.05;
    T.tag('footing', 'apron', 'concrete');
    T.put(T.box(5.1, 0.06, 9.2).translate(0, 0.03, 0), P.apron, 0.06);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const fx = sx * 2.3, fz = sz * 3.6, k = `${sx}${sz}`;
      T.tag('footing', `pad${k}`, 'metal');
      T.put(pad(T, 0.36, 0.08, fx, 0.06, fz), P.frame);
      T.tag('post', `leg${k}`, 'metal');
      const top: V3 = [sx * 1.25, cy - 1.45, sz * 2.7];
      T.put(strut(T, [fx, 0.12, fz], top, 0.12), P.frame);
      T.tag('brace', `leg${k}`, 'metal');
      T.put(strut(T, [fx, 0.12, fz], [sx * 1.6, cy - 1.0, sz * 1.4], 0.07), P.frame);
      T.put(strut(T, [fx, 0.12, fz], [sx * 0.2, cy - 1.95, sz * 3.2], 0.07), P.frame);
    }
    // the drum in its white blankets, its gold joint rings, its quilted end domes
    T.tag('wall', 'hull', 'metal');
    T.put(drumZ(T, r, len, 0, cy, 0), P.blanket, 0.03);
    T.tag('fitting', 'rings', 'metal');
    for (const z of [-2.4, 0, 2.4]) T.put(drumZ(T, r + 0.04, 0.14, 0, cy, z), P.foil, 0.05);
    for (const s of [-1, 1]) {
      T.tag('sheet', `end${s}`, 'metal');
      const dome = T.cylinder(r * 0.55, r, 0.55, 16);
      dome.rotateX(s * Math.PI / 2);
      T.put(dome.translate(0, cy, s * (len / 2 + 0.27)), P.hull, 0.03);
    }
    // the hatch in the +z dome's face, its ladder to the apron; two ports in their frames down the sides
    hatch(T, P, 0, cy - 0.75, len / 2 + 0.56, 0.9, 1.2);
    ladder(T, P, 0, len / 2 + 0.56, cy - 0.8);
    T.tag('fitting', 'ports', 'metal');
    for (const s of [-1, 1]) for (const z of [-1.2, 1.2]) {
      const ring = T.cylinder(0.3, 0.3, 0.1, 12); ring.rotateZ(Math.PI / 2);
      T.put(ring.translate(s * (r + 0.02), cy + 0.5, z), P.frame);
      const pane = T.cylinder(0.22, 0.22, 0.04, 12); pane.rotateZ(Math.PI / 2);
      T.put(T.aperture(pane.translate(s * (r + 0.05), cy + 0.5, z), [s, 0, 0]), P.glass, 0.02);
    }
    // the radiators on their struts over the drum
    T.tag('brace', 'radiator-struts', 'metal');
    for (const x of [-0.7, 0.7]) for (const z of [-1.6, 1.6]) T.put(strut(T, [x * 0.7, cy + r - 0.16, z], [x, cy + r + 0.75, z], 0.06), P.frame);
    T.tag('sheet', 'radiator', 'metal');
    T.put(T.mbox(2.2, 0.05, 4.0).translate(0, cy + r + 0.78, 0), P.hull, 0.02);
    // the umbilical down to the apron
    T.tag('fitting', 'umbilical', 'metal');
    const u: V3[] = [[-r + 0.1, cy - 0.6, -2.0], [-r - 0.25, cy - 1.6, -2.3], [-r - 0.3, 0.7, -2.7], [-r - 0.1, 0.07, -3.2]];
    for (let k = 0; k + 1 < u.length; k++) T.put(strut(T, u[k], u[k + 1], 0.07), P.dark, 0.02);
    return;
  }
  // Mars: the drum on two saddles, under its regolith shielding — the berm banked to its waist down both sides with a
  // course of bags along its crest, two rows of bags over its back; its ends clear, the airlock porch with its suitports
  const cy = 2.35;
  T.tag('footing', 'apron', 'earth');
  T.put(T.box(5.2, 0.08, 9.4).translate(0, 0.04, 0), P.apron, 0.06);
  for (const z of [-2.3, 2.3]) {
    T.tag('footing', `saddle${z}`, 'metal');
    T.put(T.mbox(3.2, cy - 0.9, 0.5).translate(0, (cy - 0.9) / 2 + 0.06, z), P.frame);
  }
  T.tag('wall', 'hull', 'metal');
  T.put(drumZ(T, r, len, 0, cy, 0), P.hull, 0.03);
  for (const s of [-1, 1]) {
    T.tag('sheet', `end${s}`, 'metal');
    const dome = T.cylinder(r * 0.5, r, 0.5, 16);
    dome.rotateX(s * Math.PI / 2);
    T.put(dome.translate(0, cy, s * (len / 2 + 0.25)), P.blanket, 0.03);
  }
  for (const sx of [-1, 1]) {
    // the berm: a long wedge of loose regolith from the apron up the drum's flank
    T.tag('bag', `berm${sx}`, 'earth');
    const berm = T.box(1.0, 1.9, len - 0.4);
    const p = berm.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getX(i) * sx > 0) p.setX(i, p.getX(i) - sx * 0.85);
    berm.computeVertexNormals();
    T.put(berm.translate(sx * (r + 0.05), 0.95 + 0.06, 0), P.bag, 0.08);
    // the course of bags along its crest
    T.tag('bag', `crest${sx}`, 'earth');
    for (let k = 0; k < 10; k++) {
      const z = -len / 2 + 0.55 + k * ((len - 1.1) / 9);
      T.put(T.mbox(0.42, 0.2, 0.68, 0.06).rotateY(0.03 * (k % 3 - 1)).translate(sx * (r - 0.2), 1.95 + 0.06, z), P.bag, 0.1);
    }
  }
  T.tag('bag', 'cover', 'earth');
  for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) {
    const z = -len / 2 + 0.6 + k * ((len - 1.2) / 7);
    T.put(T.mbox(0.9, 0.22, 0.8, 0.07).rotateZ(sx * 0.42).translate(sx * 0.62, cy + r - 0.12, z), P.bag, 0.1);
  }
  // the airlock porch at +z: a box vestibule in its frame, the hatch in its face, two suitports beside it
  T.tag('wall', 'porch', 'metal');
  T.put(T.mbox(2.0, 2.3, 1.0).translate(0, 1.21 + 0.06, len / 2 + 0.45), P.hull, 0.03);
  hatch(T, P, -0.35, 0.3, len / 2 + 0.96, 0.8, 1.7);
  T.tag('fitting', 'suitports', 'metal');
  for (const y of [1.0, 1.75]) {
    const ring = T.cylinder(0.24, 0.24, 0.1, 12); ring.rotateX(Math.PI / 2);
    T.put(ring.translate(0.6, y, len / 2 + 0.98), P.frame);
    const back = T.cylinder(0.18, 0.18, 0.04, 12); back.rotateX(Math.PI / 2);
    T.put(back.translate(0.6, y, len / 2 + 0.96), P.dark, 0.01);
  }
  T.tag('fitting', 'beacon', 'metal');
  T.put(T.cylinder(0.1, 0.12, 0.5, 8).translate(0, 2.3 + 0.06 + 0.25, len / 2 + 0.45), P.accent);
}

// --- the solar array --------------------------------------------------------------------------------------------------

/** A panel of cells w x h tilted `tilt` about x (facing +z when 0 is upright), its frame and its mullions, centred at c. */
function panel(T: HutTools, P: SpacePaint, w: number, h: number, tilt: number, c: V3, group: string): void {
  T.tag('sheet', group, 'metal');
  const cells = T.mbox(w - 0.08, 0.035, h - 0.08, 0.012);
  cells.rotateX(tilt);
  T.put(cells.translate(c[0], c[1], c[2]), P.cell, 0.03);
  T.tag('frame', group, 'metal');
  const rim = (a: V3, b: V3): void => { T.put(strut(T, a, b, 0.05), P.accent); };
  const at = (u: number, v: number): V3 => [c[0] + u, c[1] + v * Math.cos(tilt), c[2] + v * Math.sin(tilt)];
  rim(at(-w / 2, -h / 2), at(w / 2, -h / 2)); rim(at(-w / 2, h / 2), at(w / 2, h / 2));
  rim(at(-w / 2, -h / 2), at(-w / 2, h / 2)); rim(at(w / 2, -h / 2), at(w / 2, h / 2));
  // mullions across the cells (proud of them by a centimetre)
  const n = Math.max(2, Math.round(w / 0.9));
  for (let k = 1; k < n; k++) {
    const u = -w / 2 + (k * w) / n;
    const m = strut(T, at(u, -h / 2), at(u, h / 2), 0.025);
    T.put(m.translate(0, 0.02 * Math.cos(tilt), -0.02 * Math.sin(tilt)), P.frame, 0.02);
  }
}

function solarArray(T: HutTools, world: SpaceWorld): void {
  const P = PAINT[world];
  if (world === 'moon') {
    // two wings on a tracking mast, turned to the low sun: the mast on its pad, its drive head, the torque tube, the wings
    T.tag('footing', 'pad', 'concrete');
    T.put(pad(T, 0.8, 0.1, 0, 0, 0, 12), P.apron, 0.05);
    T.tag('post', 'mast', 'metal');
    T.put(T.cylinder(0.12, 0.16, 1.7, 10).translate(0, 0.1 + 0.85, 0), P.frame);
    T.tag('fitting', 'drive', 'metal');
    T.put(T.mbox(0.5, 0.35, 0.45).translate(0, 1.95, 0), P.frame);
    T.tag('plate', 'torque', 'metal');
    T.put(strut(T, [-4.4, 1.95, 0], [4.4, 1.95, 0], 0.1), P.frame);
    for (const s of [-1, 1]) panel(T, P, 4.0, 2.4, -1.05, [s * 2.3, 1.95, 0.12], `wing${s}`);
    // the cable down the mast to its junction box
    T.tag('fitting', 'junction', 'metal');
    T.put(T.mbox(0.45, 0.4, 0.3).translate(0.9, 0.2, 0.6), P.frame);
    T.put(strut(T, [0.12, 0.4, 0.05], [0.8, 0.2, 0.55], 0.04), P.dark, 0.02);
    return;
  }
  // Mars: three rows of tracking panels, each on its two posts and footing pads, a torque tube between
  for (const [k, z] of [-2.9, 0, 2.9].entries()) {
    for (const x of [-3.4, 3.4]) {
      T.tag('footing', `pad${k}${x}`, 'concrete');
      T.put(pad(T, 0.3, 0.08, x, 0, z), P.apron, 0.05);
      T.tag('post', `post${k}${x}`, 'metal');
      T.put(T.cylinder(0.08, 0.1, 1.6, 8).translate(x, 0.08 + 0.8, z), P.frame);
    }
    T.tag('plate', `tube${k}`, 'metal');
    T.put(strut(T, [-4.4, 1.7, z], [4.4, 1.7, z], 0.09), P.frame);
    panel(T, P, 8.8, 2.3, -0.46, [0, 1.78, z + 0.05], `row${k}`);
  }
  T.tag('fitting', 'inverter', 'metal');
  T.put(T.mbox(0.7, 0.8, 0.6).translate(4.2, 0.4, 4.0), P.hull);
}

// --- the propellant tanks ---------------------------------------------------------------------------------------------

function fuelTanks(T: HutTools, world: SpaceWorld): void {
  const P = PAINT[world];
  if (world === 'moon') {
    // two tanks along z, each on two cradled saddles (their legs to footpads), domed ends, foil rings; a manifold
    const r = 0.95, len = 5.2, cy = 1.55;
    T.tag('footing', 'apron', 'concrete');
    T.put(T.box(4.9, 0.05, 9.2).translate(0, 0.025, 0), P.apron, 0.06);
    for (const sx of [-1, 1]) {
      const x = sx * 1.25;
      for (const z of [-1.6, 1.6]) {
        T.tag('footing', `saddle${sx}${z}`, 'metal');
        T.put(T.mbox(1.6, 0.18, 0.4).translate(x, cy - r - 0.05, z), P.frame);
        for (const lx of [-0.65, 0.65]) T.put(strut(T, [x + lx * 1.15, 0.05, z], [x + lx, cy - r - 0.12, z], 0.09), P.frame);
      }
      T.tag('wall', `tank${sx}`, 'metal');
      T.put(drumZ(T, r, len, x, cy, 0, 14), P.hull, 0.03);
      for (const s of [-1, 1]) {
        const dome = T.cylinder(r * 0.45, r, 0.45, 14);
        dome.rotateX(s * Math.PI / 2);
        T.put(dome.translate(x, cy, s * (len / 2 + 0.22)), P.hull, 0.03);
      }
      T.tag('fitting', `rings${sx}`, 'metal');
      for (const z of [-1.7, 0, 1.7]) T.put(drumZ(T, r + 0.03, 0.12, x, cy, z, 14), P.foil, 0.05);
    }
    T.tag('fitting', 'manifold', 'metal');
    T.put(strut(T, [-1.25, cy + r - 0.1, 2.0], [1.25, cy + r - 0.1, 2.0], 0.08), P.frame);
    for (const sx of [-1, 1]) T.put(strut(T, [sx * 1.25, cy + r - 0.15, 2.0], [sx * 1.25, cy + r + 0.05, 2.0], 0.1), P.frame);
    T.put(T.mbox(0.3, 0.3, 0.3).translate(0, cy + r - 0.1, 2.0), P.accent);
    T.put(strut(T, [0, cy + r - 0.1, 2.0], [0, 0.05, 3.2], 0.07), P.frame);
    return;
  }
  // Mars: two spheres on four-legged stands (their ring girders and pads), an orange band, the manifold and a valve box
  const r = 1.85, cy = r + 0.7;
  for (const z of [-2.55, 2.55]) {
    T.tag('footing', `pads${z}`, 'concrete');
    for (const a of [0.785, 2.356, 3.927, 5.498]) T.put(pad(T, 0.28, 0.08, Math.cos(a) * 1.4, 0, z + Math.sin(a) * 1.4), P.apron, 0.05);
    T.tag('post', `legs${z}`, 'metal');
    for (const a of [0.785, 2.356, 3.927, 5.498]) T.put(strut(T, [Math.cos(a) * 1.4, 0.08, z + Math.sin(a) * 1.4], [Math.cos(a) * 1.25, cy - 0.3, z + Math.sin(a) * 1.25], 0.12), P.frame);
    T.tag('plate', `girder${z}`, 'metal');
    const girder = T.cylinder(1.32, 1.32, 0.16, 16).translate(0, cy - 0.3, z);
    T.put(girder, P.frame);
    T.tag('wall', `sphere${z}`, 'metal');
    T.put(sphereish(T, r, 0, cy, z), P.hull, 0.03);
    T.tag('fitting', `band${z}`, 'metal');
    T.put(T.cylinder(r + 0.02, r + 0.02, 0.22, 18).translate(0, cy, z), P.accent, 0.03);
  }
  T.tag('fitting', 'manifold', 'metal');
  T.put(strut(T, [0, cy + r - 0.2, -2.55], [0, cy + r - 0.2, 2.55], 0.1), P.frame);
  T.put(T.mbox(1.1, 1.0, 0.8).translate(2.0, 0.5, 0), P.frame);
  T.put(strut(T, [0.05, cy + r - 0.2, 0], [1.6, 0.9, 0], 0.08), P.frame);
}

/** A sphere of radius r at (x, y, z) from the hut tools' rounds (a stack of frusta: a sphere's look, its own hull). */
function sphereish(T: HutTools, r: number, x: number, y: number, z: number): THREE.BufferGeometry {
  // (one cylinder whose rings are pulled onto the sphere: 6 bands)
  const g = T.cylinder(r, r, 2 * r, 18);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const vy = p.getY(i), t = vy / r, k = Math.sqrt(Math.max(0.02, 1 - t * t));
    p.setXYZ(i, p.getX(i) * k, vy * 0.98, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g.translate(x, y, z);
}

// --- the comms mast ---------------------------------------------------------------------------------------------------

function commsMast(T: HutTools, world: SpaceWorld): void {
  const P = PAINT[world], H = world === 'moon' ? 11.0 : 13.2, R = 0.42;
  // the footing, the three-legged lattice (legs, zigzag braces on its faces), the head frame
  T.tag('footing', 'base', 'concrete');
  T.put(pad(T, 1.0, 0.12, 0, 0, 0, 12), P.apron, 0.05);
  const leg = (k: number, y: number): V3 => {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2, rr = R * (1.25 - 0.25 * (y / H));
    return [Math.cos(a) * rr, y, Math.sin(a) * rr];
  };
  // (the lattice in two lifts, bolted at a splice a third of the way up: the lower lift stands broken when the mast falls)
  const bays = Math.round(H / 1.1), splice = Math.round(bays * 0.36), ySplice = 0.1 + (splice * (H - 0.1)) / bays;
  for (let k = 0; k < 3; k++) {
    T.tag('post', `leg${k}lo`, 'metal');
    T.put(strut(T, leg(k, 0.1), leg(k, ySplice + 0.06), 0.07), P.frame);
    T.tag('post', `leg${k}hi`, 'metal');
    T.put(strut(T, leg(k, ySplice - 0.06), leg(k, H), 0.07), P.frame);
  }
  for (let k = 0; k < 3; k++) {
    for (let b = 0; b < bays; b++) {
      T.tag('brace', `face${k}${b < splice ? 'lo' : 'hi'}`, 'metal');
      const y0 = 0.1 + (b * (H - 0.1)) / bays, y1 = 0.1 + ((b + 1) * (H - 0.1)) / bays;
      const [p0, p1] = b % 2 ? [leg(k, y0), leg((k + 1) % 3, y1)] : [leg((k + 1) % 3, y0), leg(k, y1)];
      T.put(strut(T, p0, p1, 0.035), P.frame, 0.02);
    }
  }
  T.tag('plate', 'head', 'metal');
  T.put(T.cylinder(R * 1.2, R * 1.2, 0.14, 9).translate(0, H + 0.07, 0), P.frame);
  // the dish (its back frame, its bowl of ribs and mesh, the feed on its struts), turned to the horizon
  const dish = (y: number, rDish: number, yaw: number, group: string): void => {
    T.tag('fitting', group, 'metal');
    const fx = Math.sin(yaw), fz = Math.cos(yaw), cx = fx * 0.55, cz = fz * 0.55;
    // the clamp collar round the lattice at the dish's height, its arm out from the collar
    const rr = R * (1.25 - 0.25 * (y / H));
    T.put(T.cylinder(rr + 0.05, rr + 0.05, 0.14, 9).translate(0, y, 0), P.frame);
    T.put(strut(T, [fx * rr * 0.8, y, fz * rr * 0.8], [cx, y, cz], 0.07), P.frame);
    const bowl = T.cylinder(rDish, rDish * 0.25, rDish * 0.42, 14);
    bowl.rotateX(Math.PI / 2 - 0.25);
    bowl.rotateY(yaw);
    T.put(bowl.translate(cx + fx * rDish * 0.2, y + 0.1, cz + fz * rDish * 0.2), P.hull, 0.03);
    const tip: V3 = [cx + fx * (rDish * 0.95), y + 0.32, cz + fz * (rDish * 0.95)];
    for (const s of [-1, 1]) T.put(strut(T, [cx + fx * rDish * 0.35 + s * fz * rDish * 0.7, y + 0.1, cz + fz * rDish * 0.35 - s * fx * rDish * 0.7], tip, 0.025), P.frame);
    T.put(T.mbox(0.12, 0.12, 0.18).translate(tip[0], tip[1], tip[2]), P.accent);
  };
  if (world === 'moon') {
    dish(H - 0.5, 1.15, 0.6, 'dish');
    T.tag('fitting', 'whip', 'metal');
    T.put(T.cylinder(0.025, 0.035, 1.3, 6).translate(0, H + 0.14 + 0.65, 0), P.frame);
  } else {
    dish(H - 0.6, 1.0, 0.4, 'dish');
    dish(H - 2.4, 0.75, 2.6, 'dish2');
    T.tag('fitting', 'beacon', 'metal');
    T.put(T.cylinder(0.1, 0.12, 0.7, 8).translate(0, H + 0.14 + 0.35, 0), P.accent);
  }
  // the equipment box at the foot, its radiator fins, its cable up the leg
  T.tag('fitting', 'equipment', 'metal');
  T.put(T.mbox(0.7, 0.6, 0.5).translate(0.75, 0.42, -0.45), P.hull, 0.03);
  for (const k of [-1, 0, 1]) T.put(T.mbox(0.03, 0.45, 0.4).translate(1.11, 0.4, -0.45 + k * 0.14), P.frame);
}

/** Build `kind` as `world` builds it with the hut tools (each part named for the wreck). */
export function buildSpaceKind(T: HutTools, kind: string, world: SpaceWorld): void {
  if (kind === 'habmodule') habModule(T, world);
  else if (kind === 'solararray') solarArray(T, world);
  else if (kind === 'fueltanks') fuelTanks(T, world);
  else if (kind === 'commsmast') commsMast(T, world);
  else throw new Error(`spaceKit: no build for ${kind}`);
}
