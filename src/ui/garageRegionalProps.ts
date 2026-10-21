import { KitBuilder, type KitColor, type KitVec } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';
import type { KitPropParams } from './garagePropKit.ts';

/**
 * Regional pieces for the garage r9 kit (the per-garage briefs' signatures): Sirocco's forward-operating base (an ISO
 * container that opens as a tactical operations centre, a fuel bladder in its bund, a water buffalo trailer, a jerrycan
 * rack, a windsock mast, a sandbagged guard tower under its camouflage net, a camouflage-net frame) and Steinburg's old
 * town street (a Litfasssaeule wrapped in posters, cast-iron lamp posts, a red hydrant, a park bench, a poster hoarding,
 * a roll cage). The same rules as every K5 piece: one piece standing on y = 0 with its front toward +Z, bevelled and
 * vertex-shaded through the KitBuilder, any picture an atlas face, the region skin on everything; budgets in
 * `GARAGE_REGIONAL_PROP_BUDGETS` (the kit receipt builds each piece and checks it).
 */

type PropBuilder = (b: KitBuilder, params?: KitPropParams) => void;

/** A jerrycan in a rack or a stack (the K5 piece's silhouette at a rack's scale). */
function rackJerrycan(b: KitBuilder, x: number, y: number, z: number, color: KitColor): void {
  b.box(x, y + 0.235, z, 0.165, 0.43, 0.35, color, { bevel: 0, noBottom: true });
  b.box(x, y + 0.47, z - 0.05, 0.03, 0.05, 0.12, color, { bevel: 0, noBottom: true });
  b.box(x, y + 0.47, z + 0.13, 0.05, 0.05, 0.05, 0x26272a, { bevel: 0, noBottom: true });
}

/**
 * A 20 ft ISO container: corrugated side walls, corner posts and castings, the door end with its locking bars.
 * `variant` 1 opens the doors wide (Sirocco's tactical operations centre: a lit interior, a desk with its monitors on the
 * Sirocco Wadi map and a readout), 2 the same as Steinburg's dispatch office (its monitors on the Steinburg map).
 */
const isoContainer: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.paint, 0.03);
  const dark = b.color(color).clone().multiplyScalar(0.72);
  const L = 6.06, W = 2.44, H = 2.59;
  // the floor and roof plates, corner posts and castings
  b.box(0, 0.08, 0, W, 0.16, L, 0x2a2b2c, { bevel: 0.01, noBottom: true });
  b.box(0, H - 0.04, 0, W, 0.08, L, color, { bevel: 0.01 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(sx * (W / 2 - 0.08), H / 2, sz * (L / 2 - 0.08), 0.16, H, 0.16, dark, { bevel: 0, noBottom: true });
    for (const y of [0.08, H - 0.08]) b.box(sx * (W / 2 - 0.08), y, sz * (L / 2 - 0.08), 0.18, 0.12, 0.18, 0x2a2b2c, { bevel: 0 });
  }
  // the corrugated side walls: ribs proud of the panel
  for (const sx of [-1, 1]) {
    b.box(sx * (W / 2 - 0.03), H / 2, 0, 0.04, H - 0.24, L - 0.32, color, { bevel: 0 });
    for (let i = 0; i < 9; i += 1) {
      const z = -L / 2 + 0.5 + i * ((L - 1.0) / 8);
      b.box(sx * (W / 2 - 0.005), H / 2, z, 0.03, H - 0.3, 0.26, dark, { bevel: 0, noBottom: true });
    }
  }
  // the blind end
  b.box(0, H / 2, -L / 2 + 0.03, W - 0.3, H - 0.24, 0.04, color, { bevel: 0 });
  const doorZ = L / 2 - 0.02;
  if (params.variant === 1 || params.variant === 2) {
    // doors swung back flat against the sides, the lit interior, a desk inside the door
    for (const sx of [-1, 1]) {
      b.push().translate(sx * (W / 2 + 0.06), 0, doorZ - 0.6);
      b.box(0, H / 2, 0, 0.06, H - 0.3, 1.2, color, { bevel: 0.008 });
      for (const dz of [-0.3, 0.3]) b.box(sx * 0.05, H / 2, dz, 0.04, H - 0.4, 0.04, 0x8a8e90, { bevel: 0 });
      b.pop();
    }
    b.box(0, 0.17, 0, W - 0.3, 0.02, L - 0.4, 0x4a4842, { bevel: 0 }); // the floor inside
    b.box(0, H - 0.2, -0.4, W - 0.34, 0.02, L - 0.9, 0xd8d2c0, { bevel: 0 }); // the lit ceiling
    b.face([-0.5, H - 0.215, 0.6], [0.5, H - 0.215, 0.6], [0.5, H - 0.215, -1.6], [-0.5, H - 0.215, -1.6], garageDisplayRect('glow.warm'));
    // the desk across the far end, its monitors' glow
    b.box(0, 0.92, -L / 2 + 0.7, W - 0.4, 0.04, 0.8, 0x4a4e50, { bevel: 0.006 });
    for (const x of [-0.5, 0.5]) {
      b.box(x, 1.25, -L / 2 + 0.45, 0.62, 0.4, 0.04, 0x161819, { bevel: 0.004 });
      b.face([x - 0.28, 1.07, -L / 2 + 0.475], [x + 0.28, 1.07, -L / 2 + 0.475], [x + 0.28, 1.43, -L / 2 + 0.475], [x - 0.28, 1.43, -L / 2 + 0.475],
        garageDisplayRect(x < 0 ? (params.variant === 2 ? 'map.urban' : 'map.desert') : (params.variant === 2 ? 'readout.armor.leopard' : 'readout.armor.abrams')));
    }
    b.box(0, 0.5, -L / 2 + 1.3, 0.5, 0.06, 0.5, 0x2a2b2c, { bevel: 0.01 }); // the chair
  } else {
    // the door end: two leaves, four locking bars, their cams and handles
    b.box(0, H / 2, doorZ, W - 0.3, H - 0.24, 0.05, color, { bevel: 0.006 });
    b.box(0, H / 2, doorZ + 0.03, 0.02, H - 0.3, 0.02, dark, { bevel: 0 });
    for (const x of [-0.85, -0.45, 0.45, 0.85]) {
      b.box(x, H / 2, doorZ + 0.05, 0.035, H - 0.36, 0.035, 0x7a7e80, { bevel: 0 });
      b.box(x + 0.06, 1.1, doorZ + 0.07, 0.12, 0.04, 0.03, 0x7a7e80, { bevel: 0 });
    }
  }
  b.decal([W / 2 + 0.02, 1.6, -1.6], [W / 2 + 0.02, 1.6, 0.4], [W / 2 + 0.02, 2.1, 0.4], [W / 2 + 0.02, 2.1, -1.6], garageDisplayRect('stencil.code'));
};

/** A collapsible fuel bladder lying in its bund: a sand berm lined with a membrane, its fill hose to a manifold. */
const fuelBladder: PropBuilder = (b) => {
  const { skin } = b;
  // the bund: a low berm round a 7 x 4 m pit, its lining showing on the inner face
  const berm = b.jitter(skin.ground, 0.03), liner = 0x2a2c2a;
  for (const [x, z, w, d] of [[0, -2.0, 7.2, 0.7], [0, 2.0, 7.2, 0.7], [-3.4, 0, 0.7, 3.4], [3.4, 0, 0.7, 3.4]] as const) {
    b.box(x, 0.2, z, w, 0.4, d, berm, { bevel: 0.15, noBottom: true });
  }
  b.box(0, 0.02, 0, 6.2, 0.04, 3.4, liner, { bevel: 0, noBottom: true });
  // the bladder: a flattened pillow
  b.push().translate(0, 0.04, 0).scale(1, 1, 0.5);
  b.lathe(0, 0, 0, [[0, 0], [2.6, 0], [2.85, 0.15], [2.78, 0.4], [2.2, 0.6], [0, 0.66]], 16, 0x2c3326, { smooth: true });
  b.pop();
  b.box(0, 0.7, 0, 0.26, 0.08, 0.26, 0x1c1c1c, { bevel: 0.01 }); // the fill valve
  b.tube([[0, 0.72, 0.12], [0.6, 0.6, 0.9], [2.4, 0.45, 1.8], [3.9, 0.3, 2.3]], 0.05, 6, 0x1c1c1c);
  b.box(4.1, 0.35, 2.3, 0.5, 0.7, 0.4, skin.accent, { bevel: 0.02, noBottom: true }); // the manifold
};

/** A water buffalo: a 1,500 L tank trailer, its taps, drawbar and jack. */
const waterBuffalo: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? 0x4e5438, 0.03);
  b.box(0, 0.62, 0, 1.1, 0.1, 2.6, 0x232526, { bevel: 0.01 });
  b.push().translate(0, 1.18, -1.15).rotateX(Math.PI / 2).scale(1.0, 1, 0.78);
  b.lathe(0, 0, 0, [[0, 0], [0.62, 0], [0.7, 0.1], [0.7, 2.2], [0.62, 2.3], [0, 2.3]], 12, color);
  b.pop();
  for (const z of [-0.8, 0.8]) b.box(0, 1.18, z, 1.44, 1.12, 0.05, 0x2a2b2c, { bevel: 0 }); // the straps
  b.cylinder(0, 1.72, 0, 0.18, 0.08, 10, 0x2a2b2c); // the filler
  for (const s of [-1, 1]) {
    b.cylinder(s * 0.72 - (s > 0 ? 0.2 : 0), 0.4, 0, 0.4, 0.2, 12, b.skin.rubber, { axis: 'x' });
    b.box(s * 0.72, 0.85, 0, 0.26, 0.06, 1.0, 0x2a2b2c, { bevel: 0.01 }); // mudguards
  }
  for (const x of [-0.3, 0.3]) b.box(x, 0.86, 1.18, 0.06, 0.12, 0.08, 0x9a9a8a, { bevel: 0 }); // the taps
  b.beam([0, 0.6, 1.3], [0, 0.48, 2.4], 0.1, 0.1, b.skin.steel, { bevel: 0 });
  b.box(0, 0.24, 2.2, 0.08, 0.48, 0.08, b.skin.steel, { bevel: 0 }); // its jack
};

/** A steel jerrycan rack: two shelves of cans under a sun hood, water (blue caps) and fuel apart. */
const jerrycanRack: PropBuilder = (b) => {
  const { skin } = b;
  const steel = skin.steel;
  for (const x of [-1.15, 1.15]) for (const z of [-0.25, 0.25]) b.box(x, 0.8, z, 0.05, 1.6, 0.05, steel, { bevel: 0 });
  for (const y of [0.12, 0.82]) b.box(0, y, 0, 2.36, 0.04, 0.56, steel, { bevel: 0 });
  b.box(0, 1.62, 0, 2.5, 0.04, 0.8, skin.canvas, { bevel: 0.01 }); // the sun hood
  for (let shelf = 0; shelf < 2; shelf += 1) {
    for (let i = 0; i < 5; i += 1) {
      const water = shelf === 0 && i < 3;
      rackJerrycan(b, -0.88 + i * 0.44, 0.14 + shelf * 0.7, 0, b.jitter(water ? 0x3e4a34 : skin.paint, 0.05));
    }
    // the locking bar chained across each shelf's spouts
    b.box(0, 0.5 + shelf * 0.7, 0.22, 2.3, 0.04, 0.03, 0x2a2b2c, { bevel: 0 });
  }
  b.uprightFace(0, 1.42, 0.31, 0.26, 0.26, garageDisplayRect('picto.nosmoking'));
};

/** A windsock on its hinged mast: guy wires, the frame ring and a five-band sock drooping downwind. */
const windsock: PropBuilder = (b) => {
  const { skin } = b;
  const h = 6.2;
  b.box(0, 0.1, 0, 0.6, 0.2, 0.6, skin.concrete, { bevel: 0.03, noBottom: true });
  b.cylinder(0, 0.2, 0, 0.06, h - 0.2, 8, 0xc8c8c0);
  for (const a of [0.3, 2.4, 4.5]) b.tube([[0, h * 0.62, 0], [Math.cos(a) * 2.6, 0.05, Math.sin(a) * 2.6]], 0.008, 3, 0x3a3a38);
  b.torus(0.08, h, 0, 0.3, 0.02, 10, 3, 0x3a3a38, 'x');
  // the sock: five bands, orange and white, tapering and drooping toward +X
  for (let k = 0; k < 5; k += 1) {
    const x0 = 0.08 + k * 0.42, x1 = x0 + 0.42;
    const r0 = 0.3 - k * 0.04, r1 = r0 - 0.04;
    const y0 = h - k * k * 0.03, y1 = h - (k + 1) * (k + 1) * 0.03;
    b.push().translate(x0, y0, 0).rotateZ(Math.atan2(y1 - y0, x1 - x0));
    b.lathe(0, 0, 0, [[r0, 0], [r1, 0.42]], 8, k % 2 ? 0xe8e4da : 0xd0602c, { axis: 'x' });
    b.pop();
  }
};

/**
 * A sandbagged guard tower: four braced steel legs, a platform at 4.2 m, a sandbag parapet three courses high with a
 * firing gap, a camouflage net on poles over it, and a caged ladder.
 */
const guardTower: PropBuilder = (b) => {
  const { skin } = b;
  const steel = skin.steel, deckY = 4.2, half = 1.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(sx * half, deckY / 2, sz * half, 0.16, deckY, 0.16, steel, { bevel: 0.01, noBottom: true });
    b.box(sx * half, 0.06, sz * half, 0.5, 0.12, 0.5, skin.concrete, { bevel: 0.02, noBottom: true });
  }
  // cross bracing on all four faces, two tiers
  for (const [y0, y1] of [[0.3, deckY - 0.2]] as const) {
    for (const s of [-1, 1]) {
      b.beam([-half, y0, s * half], [half, y1, s * half], 0.06, 0.06, steel, { bevel: 0 });
      b.beam([half, y0, s * half], [-half, y1, s * half], 0.06, 0.06, steel, { bevel: 0 });
      b.beam([s * half, y0, -half], [s * half, y1, half], 0.06, 0.06, steel, { bevel: 0 });
      b.beam([s * half, y0, half], [s * half, y1, -half], 0.06, 0.06, steel, { bevel: 0 });
    }
  }
  // the platform and its sandbag parapet over a plywood screen, a firing gap toward the front
  b.box(0, deckY, 0, half * 2 + 0.6, 0.12, half * 2 + 0.6, skin.wood, { bevel: 0.015 });
  for (const [x, z, w, d] of [[0, 1.75, 3.6, 0.04], [0, -1.75, 3.6, 0.04], [1.75, 0, 0.04, 3.6], [-1.75, 0, 0.04, 3.6]] as const) {
    b.box(x, deckY + 0.55, z, w, 0.9, d, skin.wood, { bevel: 0 });
  }
  const bag = b.jitter(skin.canvas, 0.05);
  for (let course = 0; course < 2; course += 1) {
    const y = deckY + 0.13 + course * 0.15;
    const stagger = course % 2 ? 0.3 : 0;
    for (const [axis, sign] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]] as const) {
      for (let i = 0; i < 5; i += 1) {
        const along = -1.5 + stagger + i * 0.6;
        if (along > 1.55) continue;
        // the firing gap in the front face's top course
        if (axis === 'z' && sign === 1 && course === 1 && Math.abs(along) < 0.4) continue;
        const [x, z] = axis === 'x' ? [sign * 1.66, along] : [along, sign * 1.66];
        // (only the top course catches the sky: its bags are bevelled lumps, the courses under it plain)
        b.box(x, y + (course === 1 ? (i % 2) * 0.02 : 0), z, axis === 'x' ? 0.3 : 0.58, 0.15, axis === 'x' ? 0.58 : 0.3,
          b.jitter(bag, 0.05), { bevel: 0, noBottom: true });
      }
    }
  }
  // the net on four poles: a sagging, mottled sheet, both faces
  const poleY = deckY + 2.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 1.6, (deckY + poleY) / 2, sz * 1.6, 0.06, poleY - deckY, 0.06, steel, { bevel: 0 });
  const net = (u: number, v: number): KitVec => [-2.1 + u * 4.2, poleY - 0.35 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) + 0.05, -2.1 + v * 4.2];
  const tones = [0x6a6040, 0x5a5236, 0x7a6e4a, 0x4e4830];
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
    const p = [net(i / 4, j / 4), net((i + 1) / 4, j / 4), net((i + 1) / 4, (j + 1) / 4), net(i / 4, (j + 1) / 4)] as const;
    const tone = tones[(i * 3 + j * 5) % 4];
    b.polygon([p[0], p[3], p[2], p[1]], tone, [0, 1, 0]);
    b.polygon([p[0], p[1], p[2], p[3]], tone, [0, -1, 0]);
  }
  // the caged ladder up the back
  const lz = -half - 0.35;
  for (const x of [-0.25, 0.25]) b.box(x, deckY / 2, lz, 0.04, deckY, 0.04, steel, { bevel: 0 });
  for (let y = 0.35; y < deckY; y += 0.35) b.box(0, y, lz, 0.5, 0.025, 0.025, steel, { bevel: 0, noBottom: true });
  for (let y = 2.2; y < deckY + 0.6; y += 0.95) b.torus(0, y, lz - 0.25, 0.36, 0.015, 6, 3, steel, 'y', Math.PI);
};

/** A camouflage-net frame: four poles and spreaders carrying a mottled net that sags between them (a shaded bay). */
const camoNetFrame: PropBuilder = (b) => {
  const { skin } = b;
  const w = 6.2, d = 5.2, h = 3.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(sx * w / 2, h / 2, sz * d / 2, 0.07, h, 0.07, skin.steel, { bevel: 0, noBottom: true });
    b.tube([[sx * w / 2, h, sz * d / 2], [sx * (w / 2 + 1.4), 0.04, sz * (d / 2 + 0.6)]], 0.008, 3, 0x3a3a38);
  }
  const net = (u: number, v: number): KitVec => [-w / 2 - 0.3 + u * (w + 0.6), h - 0.55 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) - (u === 0 || u === 1 ? 0.5 : 0),
    -d / 2 - 0.3 + v * (d + 0.6)];
  const tones = [0x6a6040, 0x5a5236, 0x7a6e4a, 0x4e4830, 0x665c3c];
  const n = 5;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const p = [net(i / n, j / n), net((i + 1) / n, j / n), net((i + 1) / n, (j + 1) / n), net(i / n, (j + 1) / n)] as const;
    const tone = tones[(i * 3 + j * 7) % tones.length];
    b.polygon([p[0], p[3], p[2], p[1]], tone, [0, 1, 0]);
    b.polygon([p[0], p[1], p[2], p[3]], tone, [0, -1, 0]);
  }
};

/**
 * A Litfasssaeule, the German advertising column: a stepped plinth, the drum wrapped in four game posters, a moulded
 * cornice and a domed cap with its finial.
 */
const litfass: PropBuilder = (b) => {
  const r = 0.62, h = 2.9, sides = 12;
  b.lathe(0, 0, 0, [[0, 0], [0.86, 0], [0.86, 0.16], [0.74, 0.18], [0.72, 0.34], [r, 0.36], [0, 0.36]], sides, [0x6a6e6a, 0x6a6e6a, 0x5a5e5a, 0x5a5e5a, 0x6a6e6a, 0x6a6e6a]);
  b.cylinder(0, 0.36, 0, r - 0.01, h, sides, 0x3e4a44, { capTop: false, capBottom: false });
  // four posters, each wrapping three facets of the drum
  const posters = ['still.urban', 'brand.banner.v', 'still.desert', 'still.winter'] as const;
  for (let f = 0; f < sides; f += 1) {
    const a0 = (f / sides) * Math.PI * 2, a1 = ((f + 1) / sides) * Math.PI * 2;
    const poster = posters[Math.floor(f / 3)];
    const k = f % 3;
    const rr = r + 0.004;
    const crop: readonly [number, number, number, number] = poster === 'brand.banner.v' ? [k / 3, 0.18, (k + 1) / 3, 0.82] : [k / 3, 0, (k + 1) / 3, 1];
    b.face([Math.sin(a0) * rr, 0.62, Math.cos(a0) * rr], [Math.sin(a1) * rr, 0.62, Math.cos(a1) * rr],
      [Math.sin(a1) * rr, h - 0.08, Math.cos(a1) * rr], [Math.sin(a0) * rr, h - 0.08, Math.cos(a0) * rr], garageDisplayRect(poster), crop);
  }
  b.lathe(0, h + 0.36, 0, [[0, -0.02], [r + 0.02, -0.02], [r + 0.12, 0.08], [r + 0.08, 0.2], [r - 0.04, 0.24], [0.4, 0.5], [0.12, 0.66], [0, 0.7]], sides,
    [0x3e4a44, 0x4a5a52, 0x3e4a44, 0x4e5e56, 0x4a5a52, 0x4a5a52, 0x4a5a52]);
  b.cylinder(0, h + 1.06, 0, 0.04, 0.32, 6, 0x6a6a5a);
};

/** A cast-iron lamp post: fluted shaft on its base, a lantern with its warm glass under a crown. */
const lampPost: PropBuilder = (b) => {
  const iron = 0x2a2e2c;
  b.lathe(0, 0, 0, [[0, 0], [0.2, 0], [0.2, 0.12], [0.14, 0.3], [0.1, 0.42], [0.07, 0.6], [0, 0.6]], 8, iron);
  b.cylinder(0, 0.6, 0, 0.055, 3.2, 8, iron, { topRadius: 0.04 });
  b.box(0, 3.85, 0, 0.36, 0.05, 0.36, iron, { bevel: 0.01 });
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    b.beam([Math.cos(a) * 0.15, 3.86, Math.sin(a) * 0.15], [Math.cos(a) * 0.2, 4.4, Math.sin(a) * 0.2], 0.025, 0.025, iron, { bevel: 0 });
  }
  const warm = garageDisplayRect('glow.warm');
  for (let k = 0; k < 4; k += 1) {
    b.push().rotateY((k / 4) * Math.PI * 2);
    b.face([-0.13, 3.92, 0.165], [0.13, 3.92, 0.165], [0.17, 4.36, 0.2], [-0.17, 4.36, 0.2], warm);
    b.pop();
  }
  b.lathe(0, 4.4, 0, [[0, 0], [0.28, 0], [0.24, 0.08], [0.08, 0.22], [0.03, 0.34], [0, 0.36]], 8, iron);
};

/** A red pillar hydrant (Ueberflurhydrant): its body, the two outlet caps and the bonnet. */
const hydrant: PropBuilder = (b) => {
  const red = 0xa0302a;
  b.lathe(0, 0, 0, [[0, 0], [0.16, 0], [0.16, 0.06], [0.11, 0.1], [0.11, 0.78], [0.13, 0.82], [0.13, 0.9], [0.06, 1.0], [0, 1.02]], 10, red);
  for (const s of [-1, 1]) b.cylinder(s * 0.11, 0.62, 0, 0.055, 0.1, 8, 0x8a2824, { axis: 'x' });
  b.cylinder(0, 1.02, 0, 0.025, 0.05, 6, 0x5a5a52);
};

/** A park bench: two cast-iron ends, the seat and back slats. */
const parkBench: PropBuilder = (b) => {
  const iron = 0x2a2e2c, wood = b.skin.wood;
  for (const x of [-0.8, 0.8]) {
    b.beam([x, 0, 0.22], [x, 0.44, 0.18], 0.05, 0.05, iron, { bevel: 0 });
    b.beam([x, 0, -0.2], [x, 0.86, -0.28], 0.05, 0.05, iron, { bevel: 0 });
    b.beam([x, 0.42, 0.24], [x, 0.44, -0.24], 0.05, 0.05, iron, { bevel: 0 });
  }
  for (let i = 0; i < 4; i += 1) b.box(0, 0.45, 0.18 - i * 0.12, 1.8, 0.03, 0.09, wood, { bevel: 0 });
  for (let i = 0; i < 3; i += 1) b.box(0, 0.58 + i * 0.11, -0.23 - i * 0.015, 1.8, 0.08, 0.025, wood, { bevel: 0 });
};

/** A poster hoarding: a timber board on posts with a little lean-to roof, game posters wheat-pasted across it. */
const posterHoarding: PropBuilder = (b) => {
  const wood = b.skin.wood;
  const w = 4.2, h = 2.2, y0 = 0.5;
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) b.box(x, (y0 + h) / 2 + 0.1, -0.08, 0.12, y0 + h + 0.2, 0.12, wood, { bevel: 0.01, noBottom: true });
  b.box(0, y0 + h / 2, -0.02, w, h, 0.04, b.jitter(wood, 0.05), { bevel: 0.006 });
  b.beam([-w / 2 - 0.15, y0 + h + 0.18, -0.25], [w / 2 + 0.15, y0 + h + 0.18, -0.25], 0.08, 0.06, wood, { bevel: 0 });
  b.box(0, y0 + h + 0.24, 0.05, w + 0.4, 0.04, 0.5, 0x4a3e34, { bevel: 0.006 });
  const posters: ReadonlyArray<readonly [string, number, number, number, number]> = [
    ['still.urban', -1.3, 1.6, 1.4, 0.8], ['brand.banner.v', -0.15, 1.4, 0.56, 1.75], ['still.coastal', 1.15, 1.7, 1.5, 0.84],
    ['still.alpine', 1.1, 0.95, 1.0, 0.56], ['brand.wordmark.light', -1.25, 0.82, 1.5, 0.3],
  ];
  for (const [rect, x, y, pw, ph] of posters) b.uprightFace(x, y0 + y - 0.4, 0.004, pw, ph, garageDisplayRect(rect));
};

/** A roll cage on castors: mesh sides, two shelves, cartons and a crate inside. */
const rollCage: PropBuilder = (b) => {
  const steel = 0x8a8e90;
  for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]] as const) {
    b.box(x, 0.95, z, 0.03, 1.7, 0.03, steel, { bevel: 0 });
    b.cylinder(x, 0.05, z, 0.05, 0.09, 6, 0x1c1c1c, { axis: 'z' });
  }
  for (const y of [0.12, 0.85, 1.78]) b.box(0, y, 0, 0.84, 0.03, 0.74, steel, { bevel: 0 });
  for (const s of [-1, 1]) for (let i = 0; i < 4; i += 1) b.box(s * 0.41, 0.95, -0.3 + i * 0.2, 0.01, 1.66, 0.01, steel, { bevel: 0 });
  b.box(0, 0.36, 0, 0.6, 0.42, 0.55, 0x9a7a54, { bevel: 0.01 });
  b.box(-0.1, 1.08, 0.05, 0.5, 0.42, 0.5, 0x8a6a48, { bevel: 0.01 });
};

/** A banner mast: a steel pole on its foot with a bracket arm at the top that a vertical fabric banner hangs from. */
const bannerMast: PropBuilder = (b) => {
  const steel = 0x3a3e40;
  b.box(0, 0.1, 0, 0.5, 0.2, 0.5, b.skin.concrete, { bevel: 0.02, noBottom: true });
  b.cylinder(0, 0.2, 0, 0.07, 6.8, 8, steel, { topRadius: 0.055 });
  b.beam([0, 6.6, 0], [0.95, 6.6, 0], 0.05, 0.05, steel, { bevel: 0 });
  b.beam([0, 6.1, 0], [0.7, 6.58, 0], 0.03, 0.03, steel, { bevel: 0 });
  b.cylinder(0, 7.0, 0, 0.08, 0.06, 8, 0x8a7a4a);
};

/** Every regional piece by name (spread into the K5 table). */
export const GARAGE_REGIONAL_PROP_BUILDERS: Readonly<Record<string, PropBuilder>> = Object.freeze({
  isoContainer, fuelBladder, waterBuffalo, jerrycanRack, windsock, guardTower, camoNetFrame,
  litfass, lampPost, hydrant, parkBench, posterHoarding, rollCage, bannerMast,
});

/** Triangle budgets per regional piece (the receipt allows the kit's 25 % slack). */
export const GARAGE_REGIONAL_PROP_BUDGETS: Readonly<Record<string, number>> = Object.freeze({
  isoContainer: 1300, fuelBladder: 900, waterBuffalo: 700, jerrycanRack: 1100, windsock: 400, guardTower: 2600, camoNetFrame: 260,
  litfass: 700, lampPost: 400, hydrant: 300, parkBench: 260, posterHoarding: 320, rollCage: 700, bannerMast: 220,
});
