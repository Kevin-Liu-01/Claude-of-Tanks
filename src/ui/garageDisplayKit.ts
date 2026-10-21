import { KitBuilder, type KitVec } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';
import { GARAGE_SLIDESHOW_GLASS_BULGE, garageSlideshowBottomY, garageSlideshowHousing } from './garageSlideshowPlacement.ts';

/**
 * K9, the display set (garage r9; the owner: "more areas of images of tanks, computers or screens showing tanks, banners
 * of the game and brand and its logos"). Frames, battens, bezels, stands and desks are vertex-colour solids (the pack's
 * baked bucket); every picture, banner, crest, readout and map is an atlas face on the pack's one DISPLAY-LIT draw.
 * Frames: the display's face plane at z = 0 facing +Z unless a builder says otherwise; y up.
 *
 * Minimum set per Garage (the acceptance): one slideshow, two or more brand pieces, three or more tank images, one or
 * more computer stations with two or more monitors, one nameboard. Budget: 3,000 triangles and one draw per pack, plus
 * the shared slideshow.
 */

/** A framed print: black aluminium frame, a white mount, the print, and a picture light on its arm above. */
export function buildFramedPrint(b: KitBuilder, rect: string, w: number, h: number, pictureLight = true): number {
  const start = b.triangleCount;
  const frame = 0x1a1c1e, t = 0.035;
  b.box(0, h / 2 + t / 2, 0.02, w + t * 2, t, 0.04, frame, { bevel: 0.004 });
  b.box(0, -h / 2 - t / 2, 0.02, w + t * 2, t, 0.04, frame, { bevel: 0.004 });
  for (const s of [-1, 1]) b.box(s * (w / 2 + t / 2), 0, 0.02, t, h, 0.04, frame, { bevel: 0.004 });
  b.box(0, 0, 0.004, w, h, 0.008, 0xe8e4da, { bevel: 0 });
  const m = Math.min(w, h) * 0.06;
  b.uprightFace(0, 0, 0.0095, w - m * 2, h - m * 2, garageDisplayRect(rect));
  if (pictureLight) {
    b.box(0, h / 2 + 0.12, 0.03, 0.1, 0.05, 0.05, frame, { bevel: 0 });
    b.beam([0, h / 2 + 0.12, 0.05], [0, h / 2 + 0.2, 0.3], 0.02, 0.02, frame, { bevel: 0 });
    b.box(0, h / 2 + 0.18, 0.32, w * 0.5, 0.05, 0.07, frame, { bevel: 0.006 });
    b.face([-w * 0.23, h / 2 + 0.154, 0.35], [w * 0.23, h / 2 + 0.154, 0.35], [w * 0.23, h / 2 + 0.154, 0.29], [-w * 0.23, h / 2 + 0.154, 0.29], garageDisplayRect('glow.warm'));
  }
  return b.triangleCount - start;
}

/** A poster: on a backing board ('board'), or wheat-pasted to a wall with its paper edges lifting ('paste'). */
export function buildPoster(b: KitBuilder, rect: string, w: number, h: number, mode: 'board' | 'paste' = 'board',
  crop?: readonly [number, number, number, number]): number {
  const start = b.triangleCount;
  if (mode === 'board') {
    b.box(0, 0, 0.01, w + 0.06, h + 0.06, 0.02, 0x4a4a46, { bevel: 0.004 });
    b.uprightFace(0, 0, 0.0205, w, h, garageDisplayRect(rect), crop);
  } else {
    b.uprightFace(0, 0, 0.004, w, h, garageDisplayRect(rect), crop);
    // the lifting paper edges
    b.beam([-w / 2, h / 2, 0.006], [w * 0.1, h / 2 + 0.01, 0.02], 0.004, 0.03, 0xdedad0, { bevel: 0, roll: 0 });
    b.beam([w / 2, -h / 2 + 0.2, 0.006], [w / 2 + 0.01, -h / 2, 0.025], 0.03, 0.004, 0xdedad0, { bevel: 0 });
  }
  return b.triangleCount - start;
}

/**
 * A fabric banner on battens top and bottom, its cloth sagging in three panels between them (w x h, hung from y = 0).
 * `hang` hangs it on two cables from hooks `hang` metres above its top batten.
 */
export function buildFabricBanner(b: KitBuilder, rect: string, w: number, h: number, options: { sag?: number; hang?: number } = {}): number {
  const start = b.triangleCount;
  const sag = options.sag ?? Math.min(0.06, w * 0.02);
  const r = garageDisplayRect(rect);
  const columns = 3;
  for (let c = 0; c < columns; c += 1) {
    const x0 = -w / 2 + (c / columns) * w, x1 = -w / 2 + ((c + 1) / columns) * w;
    const z0 = Math.sin((c / columns) * Math.PI) * sag, z1 = Math.sin(((c + 1) / columns) * Math.PI) * sag;
    b.face([x0, -h, z0], [x1, -h, z1], [x1, 0, z1], [x0, 0, z0], r, [c / columns, 0, (c + 1) / columns, 1]);
    b.push().rotateY(Math.PI);
    b.face([-x1, -h, -z1 + 0.002], [-x0, -h, -z0 + 0.002], [-x0, 0, -z0 + 0.002], [-x1, 0, -z1 + 0.002], garageDisplayRect('panel.dark'));
    b.pop();
  }
  for (const y of [0.02, -h - 0.02]) b.rod([-w / 2 - 0.05, y, 0], [w / 2 + 0.05, y, 0], 0.025, 6, 0x2a2c2e);
  if (options.hang) for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) b.tube([[x, 0.04, 0], [x, options.hang, 0]], 0.006, 3, 0x3a3a38);
  return b.triangleCount - start;
}

/** A PVC banner lashed through its eyelets to two posts at x = +/- (w/2 + gap), its top at y. */
export function buildPvcBanner(b: KitBuilder, rect: string, w: number, h: number, y: number, gap = 0.25): number {
  const start = b.triangleCount;
  b.uprightFace(0, y - h / 2, 0, w, h, garageDisplayRect(rect));
  b.push().rotateY(Math.PI);
  b.uprightFace(0, y - h / 2, 0.002, w, h, garageDisplayRect('panel.paper'));
  b.pop();
  for (const sx of [-1, 1]) for (const fy of [0.08, 0.5, 0.92]) {
    const ey = y - h * fy, ex = sx * (w / 2 - 0.04);
    b.box(ex, ey, 0, 0.03, 0.03, 0.006, 0xb0b4b6, { bevel: 0 });
    b.tube([[ex, ey, 0], [sx * (w / 2 + gap), ey + 0.02, 0]], 0.005, 3, 0x2a2a28);
  }
  return b.triangleCount - start;
}

/**
 * A notice board on two posts (or flat on a wall with `posts` 0): a framed backing board with `rects` pinned across it
 * as prints, w x h overall, its bottom `posts` metres up.
 */
export function buildNoticeBoard(b: KitBuilder, rects: readonly string[], w: number, h: number, posts = 0.9): number {
  const start = b.triangleCount;
  const y = posts + h / 2;
  if (posts > 0) {
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
      b.box(x, (posts + h) / 2, -0.06, 0.09, posts + h + 0.1, 0.09, b.skin.wood, { bevel: 0.006, noBottom: true });
    }
  }
  b.box(0, y, -0.012, w + 0.08, h + 0.08, 0.04, b.skin.wood, { bevel: 0.008 });
  b.box(0, y, 0.004, w, h, 0.01, 0x8a6a44, { bevel: 0 });
  b.box(0, y + h / 2 + 0.08, 0.05, w + 0.3, 0.04, 0.16, b.skin.steel, { bevel: 0.004 }); // its rain hood
  const n = Math.max(1, rects.length);
  const cell = (w - 0.12) / n;
  const ph = Math.min(h - 0.16, cell * 0.62);
  rects.forEach((rect, index) => {
    const x = -w / 2 + 0.06 + cell * (index + 0.5);
    b.uprightFace(x, y + (index % 2 ? -0.04 : 0.04), 0.0105, cell - 0.08, ph, garageDisplayRect(rect));
  });
  return b.triangleCount - start;
}

/** A metal plate with four bolt heads (portal headers, crests on concrete). */
export function buildMetalPlate(b: KitBuilder, rect: string, w: number, h: number): number {
  const start = b.triangleCount;
  b.box(0, 0, 0.01, w + 0.06, h + 0.06, 0.02, 0x5a6064, { bevel: 0.006 });
  b.uprightFace(0, 0, 0.0205, w, h, garageDisplayRect(rect));
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) b.box(sx * (w / 2 + 0.015), sy * (h / 2 + 0.015), 0.025, 0.02, 0.02, 0.01, 0x3a3e40, { bevel: 0 });
  return b.triangleCount - start;
}

/** A Garage's nameboard: its map's name and the crest, on two posts (`posts` > 0: the board's bottom that high) or flat. */
export function buildNameboard(b: KitBuilder, mapId: string, w: number, posts = 0): number {
  const start = b.triangleCount;
  const h = w * 0.2;
  const y = posts > 0 ? posts + h / 2 : 0;
  if (posts > 0) {
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
      b.box(x, (posts + h) / 2, -0.06, 0.08, posts + h, 0.08, 0x3a3e40, { bevel: 0.006, noBottom: true });
      b.box(x, 0.08, -0.06, 0.3, 0.16, 0.3, b.skin.concrete, { bevel: 0.02, noBottom: true });
    }
  }
  b.box(0, y, -0.01, w + 0.04, h + 0.04, 0.03, 0x2a2c2e, { bevel: 0.006 });
  b.uprightFace(0, y, 0.0055, w, h, garageDisplayRect(`name.${mapId}`));
  return b.triangleCount - start;
}

/** A monitor: bezel, the screen face (a readout or map rect), and its desk stand ('desk') or wall arm ('wall'). */
export function buildMonitor(b: KitBuilder, rect: string, w: number, mount: 'desk' | 'wall' | 'none' = 'desk'): number {
  const start = b.triangleCount;
  const h = w * 0.6;
  const y = mount === 'desk' ? 0.12 + h / 2 : 0;
  b.box(0, y, 0, w + 0.03, h + 0.03, 0.035, 0x161819, { bevel: 0.006 });
  b.uprightFace(0, y, 0.0185, w, h, garageDisplayRect(rect));
  if (mount === 'desk') {
    b.box(0, 0.07, -0.03, 0.04, 0.14, 0.03, 0x1c1e20, { bevel: 0 });
    b.box(0, 0.006, -0.02, 0.22, 0.012, 0.16, 0x1c1e20, { bevel: 0.003 });
  } else if (mount === 'wall') {
    b.box(0, y, -0.06, 0.06, 0.06, 0.1, 0x1c1e20, { bevel: 0 });
  }
  return b.triangleCount - start;
}

/**
 * A computer station: a desk (or a workbench top at `deskY`), two or three monitors showing readouts and maps, the
 * keyboard, a tower or rugged case, and a cable run down to a floor box. Frame: the station's front at +Z, its desk
 * centred on x = 0.
 */
export function buildComputerStation(b: KitBuilder, params: { readonly screens: readonly string[]; readonly width?: number;
  readonly desk?: boolean; readonly deskY?: number; readonly rugged?: boolean }): number {
  const start = b.triangleCount;
  const width = params.width ?? 1.8;
  const deskY = params.deskY ?? 0.75;
  if (params.desk !== false) {
    b.box(0, deskY - 0.02, 0, width, 0.04, 0.8, 0x4a4e50, { bevel: 0.008 });
    for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) b.box(x, (deskY - 0.04) / 2, 0, 0.05, deskY - 0.04, 0.7, 0x2a2c2e, { bevel: 0 });
    b.box(0, deskY * 0.35, -0.34, width - 0.1, 0.4, 0.02, 0x2a2c2e, { bevel: 0 }); // modesty panel
  }
  const n = Math.min(3, Math.max(2, params.screens.length));
  const monitorW = Math.min(0.62, (width - 0.2) / n - 0.04);
  for (let k = 0; k < n; k += 1) {
    const x = (k - (n - 1) / 2) * (monitorW + 0.05);
    const angle = (k - (n - 1) / 2) * -0.28;
    b.push().translate(x, deskY, -0.18 - Math.abs(k - (n - 1) / 2) * 0.06).rotateY(angle);
    buildMonitor(b, params.screens[k % params.screens.length], monitorW, 'desk');
    b.pop();
  }
  b.box(0, deskY + 0.012, 0.15, 0.46, 0.024, 0.15, 0x1c1e20, { bevel: 0.004 }); // keyboard
  b.box(0.32, deskY + 0.01, 0.17, 0.07, 0.02, 0.11, 0x1c1e20, { bevel: 0.004 }); // mouse
  if (params.rugged) {
    b.box(-width / 2 + 0.3, deskY + 0.16, 0.12, 0.45, 0.28, 0.35, 0x3a3e34, { bevel: 0.02 }); // rugged case
    for (const x of [-width / 2 + 0.12, -width / 2 + 0.48]) b.box(x, deskY + 0.2, 0.3, 0.05, 0.06, 0.02, 0x1c1c1c, { bevel: 0 });
  } else {
    b.box(width / 2 - 0.28, 0.24, 0.05, 0.22, 0.48, 0.5, 0x1c1e20, { bevel: 0.01 }); // tower
  }
  // the cable run to a floor box
  b.tube([[0, deskY - 0.02, -0.3], [0.1, deskY * 0.5, -0.36], [0.25, 0.03, -0.45]], 0.015, 4, 0x1a1a1a);
  b.box(0.3, 0.02, -0.45, 0.2, 0.04, 0.2, 0x5a6064, { bevel: 0.004, noBottom: true });
  return b.triangleCount - start;
}

/** Where a slideshow screen sits on its frame (the face centre and the screen size, in the frame's coordinates). */
export interface KitSlideshowMount {
  readonly center: KitVec;
  readonly width: number;
  readonly height: number;
}

/**
 * The housing of the Garage's one slideshow, a CRT monitor (garage 231; the owner, 2026-10-21: "make it a crt screen
 * like the one we removed"): a moulded bezel sloping in to the glass with a control chin (knobs, a speaker grille, the
 * power lamp) and rack handles, the case behind it and the tube's tapered shell and neck, in the region's machine paint.
 * It stands on a stand ('freestanding'), on a shelf bracket off a wall ('wall') or a column ('column'), or on a rugged
 * monitor trailer's mast ('trailer'). The slideshow mesh itself (the dressing's bulged glass and shader) sits at the
 * returned mount; its centre and face plane come from the shared table (garageSlideshowPlacement.ts).
 */
export function buildSlideshowFrame(b: KitBuilder, params: { readonly width: number; readonly mount: 'freestanding' | 'wall' | 'column' | 'trailer';
  readonly bottomY?: number }): KitSlideshowMount {
  const { skin } = b;
  const w = params.width, h = w * 9 / 16;
  const { border, chin, caseDepth, tubeDepth, neckDepth, faceZ } = garageSlideshowHousing(params.mount, w);
  const cy = garageSlideshowBottomY(params.mount, params.bottomY) + (h + 0.16) / 2;
  // the housing's top and foot, the bezel's face (proud of the glass's crown) and back, the case's back, the tube's end
  const top = cy + h / 2 + border, base = cy - h / 2 - chin, outerW = w + border * 2, bodyH = top - base, bodyY = (top + base) / 2;
  const front = faceZ + w * GARAGE_SLIDESHOW_GLASS_BULGE + 0.02, back = faceZ - 0.02;
  const caseBack = back - caseDepth, tubeBack = caseBack - tubeDepth;
  const bezel = 0x232628, recess = 0x111213, metal = 0x6a6e70;
  // the bezel, a moulded frame 15 mm proud of the case all round: its face's opening a chamfer wider than the picture,
  // sloping in to an inner rim that laps the glass, its outer edge chamfered back to its sides (a few dozen triangles:
  // the Garage kits' budgets are tight)
  const xo = outerW / 2 + 0.015, yt = top + 0.015, yb = base - 0.015, e = Math.min(0.02, w * 0.008);
  const ox = w / 2 + w * 0.03, oy = h / 2 + w * 0.03, ix = w / 2 - w * 0.006, iy = h / 2 - w * 0.006, rim = faceZ + 0.006;
  for (const s of [-1, 1]) {
    const edge = s > 0 ? yt : yb, open = cy + s * oy;
    b.polygon([[-xo + e, edge - s * e, front], [xo - e, edge - s * e, front], [ox, open, front], [-ox, open, front]], bezel, [0, 0, 1]);
    b.polygon([[s * (xo - e), yt - e, front], [s * ox, cy + oy, front], [s * ox, cy - oy, front], [s * (xo - e), yb + e, front]], bezel, [0, 0, 1]);
    b.polygon([[-xo + e, edge - s * e, front], [xo - e, edge - s * e, front], [xo, edge, front - e], [-xo, edge, front - e]], bezel, [0, s, 1]);
    b.polygon([[s * (xo - e), yt - e, front], [s * (xo - e), yb + e, front], [s * xo, yb, front - e], [s * xo, yt, front - e]], bezel, [s, 0, 1]);
    b.polygon([[-xo, edge, front - e], [xo, edge, front - e], [xo, edge, back], [-xo, edge, back]], bezel, [0, s, 0]);
    b.polygon([[s * xo, yt, front - e], [s * xo, yb, front - e], [s * xo, yb, back], [s * xo, yt, back]], bezel, [s, 0, 0]);
    b.polygon([[-xo, edge, back], [xo, edge, back], [outerW / 2, s > 0 ? top : base, back], [-outerW / 2, s > 0 ? top : base, back]], bezel, [0, 0, -1]);
    b.polygon([[s * xo, yt, back], [s * xo, yb, back], [s * outerW / 2, base, back], [s * outerW / 2, top, back]], bezel, [0, 0, -1]);
  }
  const slopeX = ox - ix, slopeY = oy - iy, dz = front - rim;
  for (const s of [-1, 1]) {
    b.polygon([[-ox, cy + s * oy, front], [ox, cy + s * oy, front], [ix, cy + s * iy, rim], [-ix, cy + s * iy, rim]], recess, [0, -s * dz, slopeY]);
    b.polygon([[s * ox, cy - oy, front], [s * ox, cy + oy, front], [s * ix, cy + iy, rim], [s * ix, cy - iy, rim]], recess, [-s * dz, 0, slopeX]);
  }
  // the chin: three knobs and the power lamp, a speaker grille, and the rack handles on the bezel's sides
  const chinY = (yb + cy - oy) / 2, knob = w * 0.012;
  for (let k = 0; k < 3; k += 1) b.cylinder(ox - w * 0.03 - k * w * 0.045, chinY, front, knob, knob * 0.9, 6, recess, { axis: 'z', capBottom: false });
  b.uprightFace(-ox + w * 0.02, chinY, front + 0.004, w * 0.014, w * 0.008, garageDisplayRect('glow.green'));
  for (let k = 0; k < 4; k += 1) {
    const gy = chinY + (k - 1.5) * w * 0.012, gx = -ox + w * 0.07;
    b.polygon([[gx, gy - w * 0.002, front + 0.004], [gx + w * 0.1, gy - w * 0.002, front + 0.004], [gx + w * 0.1, gy + w * 0.002, front + 0.004],
      [gx, gy + w * 0.002, front + 0.004]], recess, [0, 0, 1]);
  }
  for (const s of [-1, 1]) {
    const x = s * (ox + xo) / 2, out = front + w * 0.035;
    b.tube([[x, cy - h * 0.3, front], [x, cy - h * 0.3, out], [x, cy + h * 0.3, out], [x, cy + h * 0.3, front]], w * 0.007, 4, metal);
  }
  // the case in the region's machine paint, and the tube's tapered shell and neck behind it
  b.box(0, bodyY, (back + caseBack) / 2, outerW, bodyH, caseDepth, skin.paint, { bevel: 0.03 });
  b.push().translate(0, bodyY, caseBack).rotateY(Math.PI).scale((outerW - 0.03) / 2, (bodyH - 0.03) / 2, 1);
  b.cylinder(0, 0, 0, Math.SQRT2, tubeDepth, 4, skin.paint, { axis: 'z', start: Math.PI / 4, topRadius: Math.SQRT2 * 0.5, smooth: false, capBottom: false });
  b.pop();
  b.box(0, bodyY, tubeBack - neckDepth / 2, outerW * 0.36, bodyH * 0.36, neckDepth, bezel, { bevel: 0.01 });
  // what carries it
  const post = Math.min(0.18, w * 0.06), steel = 0x41474e, foot = 0x26292d;
  if (params.mount === 'trailer') {
    // the trailer: chassis, wheels, drawbar, outriggers down, the generator box and the mast carrying the monitor
    b.box(0, 0.7, 0, 2.2, 0.16, 3.6, 0x232526, { bevel: 0.01 });
    b.box(0, 1.05, -1.1, 1.8, 0.6, 1.0, skin.paint, { bevel: 0.03 });
    for (const s of [-1, 1]) b.cylinder(s * 1.15 - (s > 0 ? 0.22 : 0), 0.38, 0.2, 0.38, 0.22, 12, skin.rubber, { axis: 'x' });
    b.beam([0, 0.6, 1.8], [0, 0.5, 2.8], 0.1, 0.1, skin.steel, { bevel: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1.6, 1.6]) {
      b.beam([sx * 1.1, 0.65, sz], [sx * 1.9, 0.3, sz], 0.1, 0.1, skin.steel, { bevel: 0 });
      b.box(sx * 1.9, 0.15, sz, 0.12, 0.3, 0.12, skin.steel, { bevel: 0 });
      b.box(sx * 1.9, 0.02, sz, 0.35, 0.04, 0.35, skin.wood, { bevel: 0, noBottom: true });
    }
    b.box(0, (0.78 + base) / 2, caseBack, 0.22, base - 0.78, 0.22, skin.steel, { bevel: 0.01 });
    b.box(0, base - 0.03, (back + caseBack) / 2, outerW * 0.6, 0.06, caseDepth, skin.steel, { bevel: 0.01 });
  } else if (params.mount === 'freestanding') {
    // the stand: two posts under the case on long feet, braced back, and the cradle the case sits in
    const zm = (back + caseBack) / 2, footLen = back - tubeBack + 0.3;
    for (const s of [-1, 1]) {
      const x = s * w * 0.32;
      b.box(x, (base - 0.06) / 2, zm, post, base - 0.06, post, steel, { bevel: 0.01, noBottom: true });
      b.box(x, 0.06, (back + tubeBack) / 2, post * 2.2, 0.12, footLen, foot, { bevel: 0.01, noBottom: true });
      b.beam([x, base * 0.62, zm], [x, 0.12, back - footLen + 0.2], post * 0.7, post * 0.7, foot, { bevel: 0 });
    }
    b.box(0, base - 0.03, zm, w * 0.64 + post, 0.06, caseDepth, steel, { bevel: 0.01 });
  } else {
    // the shelf bracket: a deck under the case off the mount, two gussets down to plates on the wall or a clamp round
    // the column, its back 0.29 m behind the frame's origin
    const reach = back + 0.29, drop = Math.min(1.2, reach * 0.9), gx = params.mount === 'wall' ? w * 0.3 : 0.12;
    b.box(0, base - 0.03, (back - 0.29) / 2, w * 0.7, 0.06, reach, steel, { bevel: 0.01 });
    for (const s of [-1, 1]) b.beam([s * gx, base - 0.06, back - 0.06], [s * gx, base - 0.06 - drop, -0.25], 0.06, 0.06, steel, { bevel: 0 });
    if (params.mount === 'wall') {
      for (const s of [-1, 1]) b.box(s * gx, base - 0.06 - drop / 2, -0.27, 0.14, drop + 0.2, 0.04, steel, { bevel: 0.006 });
    } else {
      b.box(0, base - 0.06 - drop / 2, -0.27, 0.42, drop + 0.2, 0.04, steel, { bevel: 0.006 });
      for (const y of [base - 0.12, base - drop]) b.box(0, y, -0.27, 0.46, 0.08, 0.06, foot, { bevel: 0.006 });
    }
  }
  return { center: [0, cy, faceZ], width: w, height: h };
}
