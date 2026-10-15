// src/world/maps/cropKit.ts — the standing crop fields (props lane A, family #18b, 2026-10-14: extracted from props.ts
// unchanged — the plots and their stream, the rows, the crop card's painter and its material — so the crops are owned
// here; props.ts calls placeCropFieldsOf once where the fields always stood in its build).
//
// The r6 terrain pass (props.ts, its own words):
// The open farmland carried no crops at all ("summer fields have no crops"
// critique) — WoT maps stage their fields with standing grain. Each plot is
// a fan of parallel crop-card rows (terrain-conformed vertical strips, one
// merged alpha-tested mesh) plus the field's own haystack-ready clearing.
// ~350 tris/plot — establishing-shot scale dressing at negligible cost.
//
// The functions keep their names and their text (the crop receipts read them by name: cropBiomeIdentity,
// cropLighting, environmentSurfaceColor, propPlacement, autumnHeadlands); the build's names they close over
// (heightField, P, L, v, noVeg, seed, aniso, engineCtx, group, autumnCropRows) are the host's, passed in.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cropRowSegmentIsSupported } from '../propPlacement.ts';
import { captureAutumnCropRow, type AutumnCropRow } from '../autumnHeadlands.ts';
import { mulberry32, type HeightField, type TerrainLayout } from '../terrain.ts';

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
/** The crop settings of a map's props (props.ts PropsSettings: cropFields, cropForm). */
interface PropsSettings { cropFields: number; cropForm?: CropForm; architecture?: string }
/** A crop card's form: the three biome forms a map names (props.ts PropsSettings.cropForm) and the regional ones its kit
 *  stands for (REGION_CROP). */
type CropForm = 'harvest' | 'wet-upright' | 'grain' | RegionalCrop;
type RegionalCrop = 'maize' | 'sunflower' | 'beet' | 'brassica';
/** What the crop fields take from the props build. */
export interface CropFieldsHost {
  heightField: HeightField;
  P: PropsSettings;
  L: Pick<TerrainLayout, 'spawns' | 'village'>;
  noVeg: (x: number, z: number) => boolean;
  seed: number;
  aniso: number;
  engineCtx: { setupShadowMaterial(material: THREE.Material, hook?: (shader: MaterialShader) => void): unknown };
  group: THREE.Group;
  autumnCropRows: AutumnCropRow[] | null;
}

const _col = new THREE.Color();

function canvas2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('world/cropKit: Canvas2D context unavailable');
  return context;
}

function _mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/cropKit: shader anchor missing: ${anchor}`);
  return out;
}

function cropAttributeNormal(shader: MaterialShader): void {
  // Crop cards carry authored up normals on both faces, with no normal/bump
  // map. Keep Three's transformed normal path, minus its backface inversion.
  const normalChunk = _mustReplace(THREE.ShaderChunk.normal_fragment_begin,
    'normal *= faceDirection;', '');
  shader.fragmentShader = _mustReplace(shader.fragmentShader,
    '#include <normal_fragment_begin>', normalChunk);
}

// ------------------------------------------------------------------------------------------- the regional crops
// (props lane A, #18b, 2026-10-14; WORKLIST.md #18: "Crops: wheat/rye (verdant, steppe), sunflower/maize where Ukrainian
// or US, beet/potato rows (polders), rice on wet maps, stubble with stooks on the harvest map ... crops as volume
// (crossed or instanced tuft cards closing the canopy within ~40 m)")

/** A map with no crop form of its own grows its kit's country's crop: maize in the Fulda Gap and on the Louisiana
 *  Maneuvers, sunflowers round Ronda, beet and potatoes in the Scheldt polders, cauliflower and artichokes in the Léon,
 *  rice on the Mekong, the ripe grain of the Eifel, the Chouf and the Dalmatian hinterland. */
const REGION_CROP: Readonly<Record<string, CropForm>> = Object.freeze({
  hessian: 'maize', longleaf: 'maize', andalusian: 'sunflower', polder: 'beet', breton: 'brassica', mekong: 'wet-upright',
  eifel: 'grain', chouf: 'grain', dalmatian: 'grain',
});
/** The crop form a map's fields take: its own, else its kit's (none: the legacy wheat). */
export function regionalCropForm(P: { cropForm?: CropForm; architecture?: string }): CropForm | undefined {
  return P.cropForm ?? (P.architecture ? REGION_CROP[P.architecture] : undefined);
}

type Ctx = CanvasRenderingContext2D;
/** A leaf off a stalk at (x, y): out by `reach` (signed: its side), up by `rise`, its tip drooping by `droop`, `w` wide. */
function strapLeaf(c: Ctx, x: number, y: number, reach: number, rise: number, droop: number, w: number): void {
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + reach * 0.45, y - rise - w, x + reach, y - rise + droop);
  c.quadraticCurveTo(x + reach * 0.45, y - rise + w, x, y + w * 0.6);
  c.fill();
}
/**
 * A regional crop's plant on the card (256 px high: the row's height), from its stalk's nine draws (paintBiomeCrop
 * keeps the draws and their order: the plot stream after the atlas is exact). Admitted sparser than grain: a maize or
 * sunflower plant stands a hand or two from the next, a beet or a cauliflower a rosette of broad leaves on the ground.
 */
function paintRegionalCrop(c: Ctx, form: RegionalCrop, x: number, growth: number, bend: number, lum: number, hue: number,
  girth: number, headHue: number, headWidth: number, headLength: number): void {
  if (form === 'maize') {
    if (growth < 0.95) return;
    // late summer maize: a stout cane, strap leaves arching off it both ways (the lowest drying), a tassel, an ear in its husk
    const hgt = 256 * (0.8 + headLength * 0.16), lean = (bend - 0.5) * 12, at = (t: number) => [x + lean * t * t, 258 - hgt * t] as const;
    _col.setHSL(0.2 + hue * 0.06, 0.36, lum + 0.06);
    c.strokeStyle = c.fillStyle = _col.getStyle();
    c.lineWidth = 3.4 + girth * 1.8;
    c.beginPath(); c.moveTo(x, 258); c.quadraticCurveTo(x + lean * 0.2, 258 - hgt * 0.5, x + lean, 258 - hgt); c.stroke();
    for (let k = 0; k < 7; k++) {
      const t = 0.14 + k * 0.1, [lx, ly] = at(t), side = (k + (headHue > 0.5 ? 1 : 0)) % 2 ? 1 : -1;
      const dry = k < 2 ? 0.55 : 0;
      _col.setHSL(0.2 + hue * 0.06 - dry * 0.08, 0.36 - dry * 0.12, lum + 0.04 + dry * 0.06);
      c.fillStyle = _col.getStyle();
      strapLeaf(c, lx, ly, side * (46 + girth * 26 + (k % 3) * 8), 10 + headWidth * 12, 18 + k * 3, 3.2 + girth * 1.2);
    }
    if (headWidth > 0.35) {
      // the ear, two-thirds down, in its pale husk with the silk out of its tip
      const [ex, ey] = at(0.48), side = headHue > 0.5 ? -1 : 1;
      _col.setHSL(0.16, 0.3, lum + 0.12);
      c.fillStyle = _col.getStyle();
      c.beginPath(); c.ellipse(ex + side * 5, ey - 8, 3.4, 11, side * 0.4, 0, Math.PI * 2); c.fill();
      _col.setHSL(0.07, 0.45, 0.2);
      c.strokeStyle = _col.getStyle(); c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(ex + side * 9, ey - 17); c.lineTo(ex + side * 12, ey - 21); c.stroke();
    }
    // the tassel
    const [tx, ty] = at(1);
    _col.setHSL(0.12, 0.42, lum + 0.14);
    c.strokeStyle = _col.getStyle(); c.lineWidth = 0.9;
    c.beginPath();
    for (let a = -2; a <= 2; a++) { c.moveTo(tx, ty); c.quadraticCurveTo(tx + a * 4, ty - 8, tx + a * 7, ty - 4 + Math.abs(a) * 3); }
    c.stroke();
    return;
  }
  if (form === 'sunflower') {
    if (growth < 0.95) return;
    // a sunflower in bloom: a stout green stem, broad heart leaves off it, its head nodding east (to the card's right)
    const hgt = 256 * (0.66 + headLength * 0.22), lean = (bend - 0.5) * 10, top = 258 - hgt;
    _col.setHSL(0.24 + hue * 0.04, 0.34, lum + 0.04);
    c.strokeStyle = c.fillStyle = _col.getStyle();
    c.lineWidth = 2.4 + girth * 1.6;
    c.beginPath(); c.moveTo(x, 258); c.quadraticCurveTo(x + lean * 0.3, 258 - hgt * 0.6, x + lean + 3, top + 6); c.stroke();
    for (let k = 0; k < 5; k++) {
      const t = 0.22 + k * 0.12, ly = 258 - hgt * t, lx = x + lean * t * t, side = k % 2 ? 1 : -1, w = 9 + girth * 6 - k;
      _col.setHSL(0.24 + hue * 0.04, 0.4, lum + 0.02 + (k % 2) * 0.03);
      c.fillStyle = _col.getStyle();
      c.beginPath(); c.ellipse(lx + side * (w * 0.9), ly + 3, w, w * 0.62, side * 0.5, 0, Math.PI * 2); c.fill();
    }
    // (the card's texel is a centimetre across and seven tall: a head a hand and a half across is an upright oval here)
    const hx = x + lean + 6, hy = top + 10, r = 9 + headWidth * 4;
    // the ray florets round the disc, then the dark disc
    _col.setHSL(0.125 + headHue * 0.02, 0.85, 0.44 + lum * 0.3);
    c.fillStyle = _col.getStyle();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      c.beginPath(); c.ellipse(hx + Math.cos(a) * (r + 3), hy + Math.sin(a) * (r + 3) * 1.35, 3.6, 1.8, a, 0, Math.PI * 2); c.fill();
    }
    _col.setHSL(0.07, 0.5, 0.11 + headHue * 0.04);
    c.fillStyle = _col.getStyle();
    c.beginPath(); c.ellipse(hx, hy, r, r * 1.35, 0.1, 0, Math.PI * 2); c.fill();
    return;
  }
  // a rosette on the ground: sugar beet (glossy dark green ovals on red-veined stalks) or a cauliflower's broad, waxy
  // blue-green leaves round its curd. (The card's texel is a centimetre across and two millimetres tall at a knee-high
  // row: a leaf a hand broad and a span long is a narrow upright oval here.)
  if (growth < 0.88) return;
  const beet = form === 'beet', hgt = 256 * (0.62 + headLength * 0.3), n = 5 + Math.floor(girth * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / Math.max(1, n - 1) - 0.5) * 0.7 + (bend - 0.5) * 0.15, len = hgt * (0.55 + ((k * 7 + Math.floor(headHue * 10)) % 5) * 0.1);
    const r = len * 0.5, w = (beet ? 5 : 7.5) + headWidth * 3;
    const cx = x + Math.sin(a) * r * 1.6, cy = 258 - Math.cos(a) * r;
    _col.setHSL(beet ? 0.28 + hue * 0.05 : 0.4 + hue * 0.06, beet ? 0.5 : 0.18, lum + (beet ? 0.02 : 0.14) + (k % 2) * 0.03);
    c.fillStyle = _col.getStyle();
    c.beginPath(); c.ellipse(cx, cy, w, r, a * 0.6, 0, Math.PI * 2); c.fill();
    // its midrib: a beet's red, a cauliflower's pale
    _col.setHSL(beet ? 0.97 : 0.3, beet ? 0.5 : 0.12, beet ? 0.24 + lum * 0.3 : 0.5);
    c.strokeStyle = _col.getStyle(); c.lineWidth = beet ? 1.4 : 1.1;
    c.beginPath(); c.moveTo(x, 258); c.lineTo(x + Math.sin(a) * len * 1.4, 258 - Math.cos(a) * len * 0.85); c.stroke();
  }
  if (!beet && headWidth > 0.5) {
    // the curd in the middle of the leaves
    _col.setHSL(0.13, 0.25, 0.62);
    c.fillStyle = _col.getStyle();
    c.beginPath(); c.ellipse(x, 258 - hgt * 0.4, 8 + girth * 3, 22, 0, 0, Math.PI * 2); c.fill();
  }
}

/**
 * The volume of a regional crop's row (no draws: every number from the row's own stations): a maize or sunflower row
 * crossed at each station by a card across it a metre wide (the canopy closes when the rows are seen end on), a beet or
 * cauliflower row flanked by two lower rows a stride either side (the drills between the cards). Only spans the row
 * itself emits (its supported spans) get them.
 */
function cropVolume(form: RegionalCrop, pos: number[], uv: number[], col: number[], idx: number[], dx: number, dz: number): void {
  const stations = pos.length / 6, px = -dz, pz = dx;
  const spans = new Set<number>();
  for (let k = 0; k < idx.length; k += 6) spans.add(idx[k] / 2);
  const tall = form === 'maize' || form === 'sunflower';
  if (tall) {
    const w = form === 'maize' ? 0.5 : 0.45;
    for (let i = 0; i < stations; i++) {
      if (!spans.has(i) && !spans.has(i - 1)) continue;
      const x = pos[i * 6], g = pos[i * 6 + 1], z = pos[i * 6 + 2], top = pos[i * 6 + 4], base = pos.length / 3;
      for (const sd of [-1, 1]) pos.push(x + px * w * sd, g, z + pz * w * sd, x + px * w * sd, top * 0.97 + g * 0.03, z + pz * w * sd);
      const u0 = (i * 0.37) % 1, u1 = u0 + w * 2 * 0.8;
      uv.push(u0, 0, u0, 1, u1, 0, u1, 1);
      const shade = col[i * 6] * 0.94;
      for (let k = 0; k < 4; k++) col.push(shade, shade, shade);
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    return;
  }
  for (const off of [-0.85, 0.85]) {
    const base = pos.length / 3;
    for (let i = 0; i < stations; i++) {
      const x = pos[i * 6] + px * off, g = pos[i * 6 + 1], z = pos[i * 6 + 2] + pz * off, top = g + (pos[i * 6 + 4] - g) * 0.85;
      pos.push(x, g, z, x, top, z);
      uv.push(uv[i * 4] + off * 0.31, 0, uv[i * 4] + off * 0.31, 1);
      const shade = col[i * 6] * (off < 0 ? 0.92 : 1.04);
      col.push(shade, shade, shade, shade, shade, shade);
    }
    for (const sp of spans) {
      const b0 = base + sp * 2, b1 = base + (sp + 1) * 2;
      idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
    }
  }
}

/** Build the map's standing crop fields into the host's group (none when its props place no crop fields). */
export function placeCropFieldsOf(host: CropFieldsHost): void {
  const { heightField, L, noVeg, seed, aniso, engineCtx, group, autumnCropRows } = host;
  // (#18b) a map with no crop form of its own grows its kit's country's crop
  const P = { ...host.P, cropForm: regionalCropForm(host.P) };
  const v = L.village;
  const cropLandSample = {} as Parameters<NonNullable<HeightField['_landUseAt']>>[2];
  function placeCropFields(): void {
    if ((P.cropFields ?? 0) <= 0) return;
    const crng = mulberry32(seed + 515);
    const cropTex = createCropTexture(crng);
    const cropGeos: THREE.BufferGeometry[] = [];
    for (let p = 0, made = 0; p < P.cropFields * 30 && made < P.cropFields; p++) {
      if (tryPlaceCropPlot(crng, cropGeos)) made++;
    }
    finalizeCropFields(cropTex, cropGeos);
  }

  function paintWetCropLeaves(cctx: CanvasRenderingContext2D, x: number, hgt: number, lean: number, width: number): void {
    for (let leaf = 0; leaf < 2; leaf++) {
      const t = .36 + leaf * .25;
      // Exact points on the stalk quadratic, including its 2px buried start.
      const lx = x + lean * (.8 * t + .2 * t * t);
      const ly = 258 - (1.2 * hgt + 4) * t + (.2 * hgt + 2) * t * t;
      const reach = (leaf ? -1 : 1) * (22 + Math.abs(lean) * 2);
      cctx.beginPath();
      cctx.moveTo(lx, ly);
      cctx.quadraticCurveTo(lx + reach * .5, ly - hgt * .18 - width, lx + reach, ly - hgt * .22);
      cctx.quadraticCurveTo(lx + reach * .5, ly - hgt * .18 + width, lx, ly);
      cctx.fill();
    }
  }

  function paintCropPanicle(cctx: CanvasRenderingContext2D, x: number, y: number, length: number, spread: number): void {
    cctx.beginPath();
    cctx.moveTo(x, y);
    cctx.quadraticCurveTo(x + spread * .2, y - length * .7, x + spread * .4, y - length);
    for (let branch = 0; branch < 5; branch++) {
      const t = (branch + 1) / 6, side = branch % 2 ? -1 : 1;
      const bx = x + spread * .4 * t, by = y - length * (1.4 * t - .4 * t * t);
      cctx.moveTo(bx, by);
      cctx.quadraticCurveTo(bx + side * spread, by - length * .18,
        bx + side * spread * .85, by - length * .06);
    }
    cctx.stroke();
  }

  function biomeCropHeight(wet: boolean, standing: boolean, growth: number, headLength: number): number {
    // Admission keeps the upper40% of this draw; restore its full height span.
    if (wet) return 256 * (.64 + ((growth - .60) / .40) * .25);
    return 256 * (standing ? .55 + headLength * .28 : .10 + growth * .19);
  }

  function biomeCropLean(wet: boolean, standing: boolean, bend: number): number {
    return (bend - .5) * (wet ? 10 : standing ? 20 : 8);
  }

  function paintCropStalk(cctx: CanvasRenderingContext2D, x: number, hgt: number, lean: number, width: number): void {
    cctx.lineWidth = width;
    cctx.beginPath();
    cctx.moveTo(x, 258);
    cctx.quadraticCurveTo(x + lean * .4, 256 - hgt * .6, x + lean, 256 - hgt);
    cctx.stroke();
  }

  function finishStandingCrop(cctx: CanvasRenderingContext2D, x: number, y: number,
    wet: boolean, headLength: number, headWidth: number): void {
    // Small branching heads, not the legacy broad elliptical wheat pegs.
    paintCropPanicle(cctx, x, y,
      (wet ? 12 : 7) + headLength * 5, (wet ? 3 : 1.2) + headWidth * 1.2);
  }

  function finishBrokenCrop(cctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    // A broken, oblique cut at the actual shortened stalk tip.
    cctx.beginPath();
    cctx.moveTo(x - width * .6, y + width);
    cctx.lineTo(x + width * .6, y);
    cctx.stroke();
  }

  function paintBiomeCrop(cctx: CanvasRenderingContext2D, crng: () => number, form: NonNullable<PropsSettings['cropForm']>): void {
    for (let b = 0; b < 260; b++) {
      // Keep all nine legacy draws in their original order: this same stream
      // selects plots immediately after the atlas, including cut/headless stems.
      const x = crng() * 256, growth = crng(), bend = crng();
      const lum = .17 + crng() * .11, hue = crng(), girth = crng();
      const headHue = crng(), headWidth = crng(), headLength = crng();
      const wet = form === 'wet-upright';
      // Admit wet stems after all draws: open gaps between whole attached
      // plants without changing the following plot/row placement stream.
      if (wet && growth < .60) continue;
      if (form === 'grain') { paintGrainStalk(cctx, x, growth, bend, lum, hue, girth, headHue, headWidth, headLength); continue; }
      if (form === 'maize' || form === 'sunflower' || form === 'beet' || form === 'brassica') {
        paintRegionalCrop(cctx, form, x, growth, bend, lum, hue, girth, headHue, headWidth, headLength);
        continue;
      }
      const standing = wet || growth > .88;
      const hgt = biomeCropHeight(wet, standing, growth, headLength);
      const lean = biomeCropLean(wet, standing, bend);
      const width = (wet ? .55 : .65) + girth * .45;
      _col.setHSL(wet ? .20 + hue * .035 : .105 + hue * .025, wet ? .40 : .30, lum);
      cctx.strokeStyle = cctx.fillStyle = _col.getStyle();
      paintCropStalk(cctx, x, hgt, lean, width);
      if (wet) paintWetCropLeaves(cctx, x, hgt, lean, .8 + girth * .6);
      _col.setHSL(wet ? .17 + headHue * .025 : .10 + headHue * .02, .34, lum + .045);
      cctx.strokeStyle = _col.getStyle();
      if (standing) finishStandingCrop(cctx, x + lean, 256 - hgt, wet, headLength, headWidth);
      else finishBrokenCrop(cctx, x + lean, 256 - hgt, width);
    }
  }

  // Ground lane (2026-10-04, wave 71 on Verdant's close-up: the crop "a picket fence of chopsticks — evenly spaced beige
  // dowels with flat cut tops and no ears, awns or leaves"; the coordinator: "irregular spacing and ears would fix most
  // of it"): a field of ripe grain. The stalks stand in uneven clumps along the row (three incommensurate waves over
  // the card's width admit them — the drill's row thinned and lodged in places, never the legacy card's four punched
  // windows), every stalk its own height and lean, a leaf down the stem on the stouter ones, an ear on every one a
  // shade deeper than its straw and a beard of awns on most. The nine draws a stalk stay as they were (the plot stream
  // after the atlas is exact), and the card covers less than the legacy one at every mip (cropBiomeIdentity).
  function paintGrainStalk(cctx: CanvasRenderingContext2D, x: number, growth: number, bend: number, lum: number,
    hue: number, girth: number, headHue: number, headWidth: number, headLength: number): void {
    const clump = .5 + .5 * Math.sin(x * .071 + 1.3) * Math.sin(x * .187 + .4) + .22 * Math.sin(x * .43 + 2.1);
    if (growth > .18 + .42 * clump) return;
    const hgt = 256 * (.50 + headLength * .30 + (growth - .3) * .14);
    const lean = (bend - .5) * 22;
    // (stems thick enough to hold through the card's 64 px mip: fewer and stouter, the coverage at the legacy's)
    const width = 1.05 + girth * .55;
    _col.setHSL(.110 + hue * .022, .32, lum);
    cctx.strokeStyle = cctx.fillStyle = _col.getStyle();
    paintCropStalk(cctx, x, hgt, lean, width);
    if (girth > .55) {
      // a leaf off the stem's lower half, arching out and drooping
      const t = .34 + girth * .16, lx = x + lean * (.8 * t + .2 * t * t), ly = 258 - (1.2 * hgt + 4) * t + (.2 * hgt + 2) * t * t;
      const reach = (headHue > .5 ? 1 : -1) * (10 + girth * 8);
      cctx.lineWidth = .9;
      cctx.beginPath();
      cctx.moveTo(lx, ly);
      cctx.quadraticCurveTo(lx + reach * .6, ly - hgt * .10, lx + reach, ly - hgt * .03);
      cctx.stroke();
    }
    // the ear: a slim spike along the stalk's own lean at its tip, a shade deeper and warmer than the straw
    const ex = x + lean, ey = 256 - hgt, len = 8 + headLength * 7, wid = 1.6 + headWidth * 1.0;
    const ang = Math.atan2(lean, hgt) * .9;
    _col.setHSL(.098 + headHue * .02, .40, Math.min(.34, lum + .035));
    cctx.fillStyle = cctx.strokeStyle = _col.getStyle();
    cctx.beginPath();
    cctx.ellipse(ex + Math.sin(ang) * len * .4, ey - Math.cos(ang) * len * .4, wid, len * .55, ang, 0, Math.PI * 2);
    cctx.fill();
    if (headWidth > .28) {
      // its awns: a fan of fine bristles past the ear's tip
      cctx.lineWidth = .6;
      cctx.beginPath();
      const tx = ex + Math.sin(ang) * len * .9, ty = ey - Math.cos(ang) * len * .9;
      for (let a = -2; a <= 2; a++) {
        const aa = ang + a * .16, al = 4 + headLength * 5;
        cctx.moveTo(tx, ty);
        cctx.lineTo(tx + Math.sin(aa) * al, ty - Math.cos(aa) * al);
      }
      cctx.stroke();
    }
  }

  function createCropTexture(crng: () => number): THREE.CanvasTexture {
    const cs = 256;
    const cc = document.createElement('canvas');
    cc.width = cc.height = cs;
    const cctx = canvas2d(cc, { willReadFrequently: true });
    cctx.clearRect(0, 0, cs, cs);
    if (P.cropForm) paintBiomeCrop(cctx, crng, P.cropForm);
    else for (let b = 0; b < 260; b++) { // legacy wheat: other maps stay byte-identical
      const x = crng() * cs;
      const hgt = cs * (0.50 + crng() * 0.42);
      const lean = (crng() - 0.5) * 16;
      const lum = 0.17 + crng() * 0.11;
      _col.setHSL(0.115 + crng() * 0.02, 0.34, lum);
      cctx.strokeStyle = _col.getStyle();
      cctx.lineWidth = 1.2 + crng() * 1.1;
      cctx.beginPath();
      cctx.moveTo(x, cs + 2);
      cctx.quadraticCurveTo(x + lean * 0.4, cs - hgt * 0.6, x + lean, cs - hgt);
      cctx.stroke();
      _col.setHSL(0.105 + crng() * 0.02, 0.38, Math.min(0.35, lum + 0.065));
      cctx.fillStyle = _col.getStyle();
      cctx.beginPath();
      cctx.ellipse(x + lean, cs - hgt, 1.7 + crng(), 4.5 + crng() * 2.5, lean * 0.03, 0, Math.PI * 2);
      cctx.fill();
    }
    const cid = cctx.getImageData(0, 0, cs, cs);
    // (#18b: each regional crop's own mean tone)
    const flood = P.cropForm === 'wet-upright' ? [88, 112, 56] : P.cropForm === 'maize' ? [104, 112, 60]
      : P.cropForm === 'sunflower' ? [98, 104, 50] : P.cropForm === 'beet' ? [72, 100, 50] : P.cropForm === 'brassica' ? [92, 110, 92]
        : [126, 110, 66];
    for (let i = 0; i < cs * cs; i++) {
      const x = i % cs, y = Math.floor(i / cs);
      // Dense stalk bases formerly merged into luminous rectangular walls.
      // Four coarse gaps remain resolved in the existing 64px mip, while
      // each clump retains the original seeded stems and seed heads. This
      // pixel-only cut consumes no random draws or extra rows/materials.
      if (!P.cropForm && x % 64 < 24) cid.data[i * 4 + 3] = 0;
      const rootShade = 0.98 - y / cs * 0.18;
      for (let channel = 0; channel < 3; channel++) cid.data[i * 4 + channel] *= rootShade;
      // Muted mean-tone flood prevents bright RGB fringes in transparent mips.
      if (cid.data[i * 4 + 3] < 24) {
        cid.data[i * 4] = flood[0];
        cid.data[i * 4 + 1] = flood[1];
        cid.data[i * 4 + 2] = flood[2];
      }
    }
    cctx.putImageData(cid, 0, 0);
    const cropTex = new THREE.CanvasTexture(cc);
    cropTex.colorSpace = THREE.SRGBColorSpace;
    cropTex.wrapS = THREE.RepeatWrapping;
    cropTex.anisotropy = aniso;
    return cropTex;
  }

  function cropPlotAvoidsSpawns(cx: number, cz: number, radius: number): boolean {
    return ![L.spawns.player, ...L.spawns.enemies].some((spawn) =>
      Math.hypot(cx - spawn.x, cz - spawn.z) < radius + 24);
  }

  function cropPlotCornersAreLevel(
    cx: number, cz: number, pw: number, pd: number,
    dx: number, dz: number, px2: number, pz2: number,
  ): boolean {
    const y0 = heightField.getHeightAt(cx, cz);
    for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const qx = cx + dx * ex * pw * 0.5 + px2 * ez * pd * 0.5;
      const qz = cz + dz * ex * pw * 0.5 + pz2 * ez * pd * 0.5;
      if (Math.abs(heightField.getHeightAt(qx, qz) - y0) > 3.2) return false;
    }
    return true;
  }

  function appendCropRowGeometry(
    cropGeos: THREE.BufferGeometry[], crng: () => number,
    rx: number, rz: number, half: number, rowH: number, tintL: number,
    dx: number, dz: number, form?: CropForm,
  ): void {
    const nSt = Math.max(3, Math.ceil((half * 2) / 3.4));
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], col: number[] = [];
    for (let sIt = 0; sIt <= nSt; sIt++) {
      const t = sIt / nSt;
      const sx2 = rx + dx * (t * 2 - 1) * half;
      const sz2 = rz + dz * (t * 2 - 1) * half;
      const gy = heightField.getHeightAt(sx2, sz2);
      const hh = rowH * (0.86 + crng() * 0.28);
      pos.push(sx2, gy + 0.02, sz2, sx2, gy + hh, sz2);
      uv.push(t * half * 0.8, 0, t * half * 0.8, 1);
      const cshade = tintL * (0.9 + crng() * 0.2);
      col.push(cshade, cshade, cshade, cshade, cshade, cshade);
      if (sIt > 0) {
        const b0 = (sIt - 1) * 2, b1 = sIt * 2;
        // Plot-center qualification cannot see a shoreline crossing its edge.
        // Keep every seeded draw and original row vertex, but emit only dry,
        // grounded spans. Clipped plots are not refilled with extra attempts.
        const p0 = b0 * 3;
        if (cropRowSegmentIsSupported(heightField,
          pos[p0], pos[p0 + 2], pos[p0 + 1] - 0.02, sx2, sz2, gy)) {
          idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
        }
      }
    }
    if (idx.length === 0) return;
    // (#18b) a regional crop's row in volume
    if (form === 'maize' || form === 'sunflower' || form === 'beet' || form === 'brassica') cropVolume(form, pos, uv, col, idx, dx, dz);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geometry.setIndex(idx);
    cropGeos.push(geometry);
  }

  function appendCropRows(
    cropGeos: THREE.BufferGeometry[], crng: () => number,
    cx: number, cz: number, pw: number, pd: number,
    dx: number, dz: number, px2: number, pz2: number,
  ): void {
    const rowPitch = 2.5 + crng() * 0.5;
    const nRows = Math.floor(pd / rowPitch);
    // (#18b) maize stands twice a man's waist, sunflowers over a man, beet and cauliflower to the knee
    const rowH = (1.05 + crng() * 0.2) * (P.cropForm === 'maize' ? 2 : P.cropForm === 'sunflower' ? 1.6 : P.cropForm === 'beet' ? 0.42
      : P.cropForm === 'brassica' ? 0.5 : 1);
    const tintL = 0.9 + crng() * 0.25;
    for (let row = 0; row < nRows; row++) {
      const offset = (row - (nRows - 1) / 2) * rowPitch;
      const rx = cx + px2 * offset, rz = cz + pz2 * offset;
      const half = pw * (0.44 + crng() * 0.08);
      const before = cropGeos.length;
      appendCropRowGeometry(cropGeos, crng, rx, rz, half, rowH, tintL, dx, dz, P.cropForm);
      if (autumnCropRows && cropGeos.length > before) {
        captureAutumnCropRow(autumnCropRows, cropGeos[before], cx, cz, dx, dz, row);
      }
    }
  }

  function tryPlaceCropPlot(
    crng: () => number,
    cropGeos: THREE.BufferGeometry[],
  ): boolean {
    const cx = (crng() * 2 - 1) * 380, cz = (crng() * 2 - 1) * 380;
    const pw = 34 + crng() * 26, pd = 26 + crng() * 22;
    const radius = Math.hypot(pw, pd) * 0.5;
    const overlapsVillage = cx > v.x0 - radius - 14 && cx < v.x1 + radius + 14
      && cz > v.z0 - radius - 14 && cz < v.z1 + radius + 14;
    if (overlapsVillage || heightField._roadDist(cx, cz) < radius + 9) return false;
    if (heightField.getGroundType(cx, cz) === 'soft' || noVeg(cx, cz)) return false;
    let supported = heightField.getNormalAt(cx, cz).y > 0.965;
    if (!cropPlotAvoidsSpawns(cx, cz, radius)) supported = false;

    // Keep this seeded draw before the support decision: rejected flatness
    // candidates historically consume their row angle too.
    const dirA = crng() * Math.PI;
    let dx = Math.cos(dirA), dz = Math.sin(dirA);
    // ground lane (2026-10-04, wave 71 on Verdant's close-up): on a map with fields (the height field's land-use hook)
    // a plot of standing grain stands only inside a field of ripe wheat or barley (landUse.ts LAND_CROP 1, 2), well
    // inside its margin, its rows along the field's own — not at any angle over whatever crop the land use laid there
    const landAt = heightField._landUseAt;
    // the plot as it stands in its field: along its rows (fw) and across them (fd)
    let fw = pw, fd = pd;
    if (landAt) {
      const f = landAt(cx, cz, cropLandSample);
      if (!f.active || (f.crop !== 1 && f.crop !== 2)) supported = false;
      else {
        // (mr4, 2026-10-06: a strip field 36 m across never held a plot of 34–60 × 26–48 m, so an openfield's or a Gewann's
        // strips carried no standing grain at all — Amberford 8 plots → 0, Frontier's Gewann row 2 → 0) the plot fits its
        // field instead of being refused by it: across its rows to the field's nearer edge, along them to the nearer row
        // end, each 2 m inside the margin; a field that leaves less than 12 m across or 20 m along holds none. A plot that
        // fitted before keeps its size (the fit only shortens what the edge would have refused), and the draws are the ones
        // they were (the plots' own stream)
        fd = Math.min(pd, 2 * (f.edgeM - f.marginM - 2));
        fw = Math.min(pw, 2 * (f.endM - f.marginM - 2));
        if (fd < 12 || fw < 20) supported = false;
        else { dx = f.rowX; dz = f.rowZ; }
      }
    }
    const px2 = -dz, pz2 = dx;
    if (supported && !cropPlotCornersAreLevel(cx, cz, fw, fd, dx, dz, px2, pz2)) {
      supported = false;
    }
    if (!supported) return false;
    appendCropRows(cropGeos, crng, cx, cz, fw, fd, dx, dz, px2, pz2);
    return true;
  }

  function finalizeCropFields(
    cropTex: THREE.CanvasTexture,
    cropGeos: THREE.BufferGeometry[],
  ): void {
    if (cropGeos.length === 0) { cropTex.dispose(); return; }
    const cropMat = new THREE.MeshStandardMaterial({
      map: cropTex, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
      vertexColors: true, roughness: 1.0, metalness: 0.0,
    });
    // (2026-10-08: the crops take the sky's full light, as they always drew; their 0.5 trim never applied, materialEnvIntensity.ts)
    engineCtx.setupShadowMaterial(cropMat, cropAttributeNormal);
    cropMat.customProgramCacheKey = () => 'world-crop-authored-normal-v1';
    const merged = mergeGeometries(cropGeos, false);
    // Explicit up normals avoid alpha-strip lighting and missing-normal crashes.
    const nPos = merged.attributes.position.count;
    const nUp = new Float32Array(nPos * 3);
    for (let i = 0; i < nPos; i++) nUp[i * 3 + 1] = 1;
    merged.setAttribute('normal', new THREE.BufferAttribute(nUp, 3));
    const cropMesh = new THREE.Mesh(merged, cropMat);
    cropMesh.name = 'crop-fields';
    cropMesh.castShadow = false;
    cropMesh.receiveShadow = false;
    cropMesh.matrixAutoUpdate = false;
    cropMesh.userData.aoExclude = true;
    group.add(cropMesh);
  }
  placeCropFields();
}
