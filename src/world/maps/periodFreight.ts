// src/world/maps/periodFreight.ts — (the map-revival lane, 2026-10-09; gauntlet waves 319/320 on Ironworks: "modern ISO
// shipping containers sit in a March 1945 ironworks") the freight a container row's seat holds on a battlefield set
// before the ISO box. Sea-Land's first transatlantic box service reached Rotterdam and Bremen in May 1966, and ISO 668
// fixed the box in 1968, so a map whose setting year (periodClutterKit.ts MAP_SETTING_YEAR, the one shared table) comes
// before 1966 stacks its yard's goods the way its period did: under railway tarpaulins lashed down over timber bearers,
// in wooden crates, as rolled steel billets on dunnage at a works, as sawn timber in stickered stacks.
//
// The row keeps the container row's seats and spends exactly its shared draws (railKit.ts makeContainerRow: the count,
// each seat's livery, yaw, offset and 24 paint draws, the stack roll and the stacked box's four draws and paint, the
// gap), and every seat emits one hidden core per box the row would have stood there (the body's four UV-jitter draws:
// uvJitter 'consume'), so every later placement keeps its seat. Everything else is new to the stream (uvJitter 'none')
// and draws from the seat's own fork. The core is the stack's movement solid (structureCollision.ts takes the baked
// bucket as a wall; the timber and canvas dressing only stops rounds), so a tank meets the stack where it stands.
import * as THREE from 'three';
import { box, gablePrism } from '../propGeometry.ts';
import { MAP_SETTING_YEAR } from './periodClutterKit.ts';
import type { GeometryBuckets } from './exteriorDetailKit.ts';

type Rng = () => number;

/** The year the ISO box came into a European yard (Sea-Land, Rotterdam and Bremen, May 1966). */
export const ISO_CONTAINER_INTRODUCED = 1966;

/**
 * True on a battlefield whose setting year comes before the ISO box: its container rows draw period freight. (Cinder
 * Junction, 1962, is one of the owner's protected maps; both critics of gauntlet wave 333 named the lettered ISO boxes in
 * its goods yard as modern, and the owner approved its period freight on 2026-10-09.)
 */
export function precedesIsoContainer(mapId: string | null | undefined): boolean {
  if (!mapId) return false;
  const year = MAP_SETTING_YEAR[mapId];
  return year !== undefined && year < ISO_CONTAINER_INTRODUCED;
}

export type FreightForm = 'tarp' | 'crates' | 'billets' | 'lumber';

/**
 * Each pre-container battlefield's yard goods: Ironworks' works yard (the Völklingen works, March 1945) half rolled
 * steel waiting on its dunnage, the rest under the Reichsbahn's tarred sheets and in crates; Cinder Junction (1962) the
 * goods shed's crates and sheeted wagonloads with a timber stack; the Virgin Lands' depot (1958) sheeted stacks and the
 * sawn timber the new state farms were built from.
 */
export const FREIGHT_MIX: Readonly<Record<string, readonly (readonly [FreightForm, number])[]>> = Object.freeze({
  foundry: [['billets', 0.4], ['tarp', 0.38], ['crates', 0.22]],
  railyard: [['tarp', 0.45], ['crates', 0.35], ['lumber', 0.2]],
  steppe: [['tarp', 0.4], ['lumber', 0.35], ['crates', 0.25]],
});
const DEFAULT_MIX: readonly (readonly [FreightForm, number])[] = [['tarp', 0.55], ['crates', 0.45]];

/**
 * True where the rail kit's container row (railKit.ts makeContainerRow) draws period freight: a pre-container
 * battlefield with its own mix. (2026-10-10, the freight landing's gate: Titan Gorge and Skybridge, both 1965, have
 * container-row lots their regional kits rebuild — a trailer, a house — over the rail kit's base row, whose bounds the
 * kit fills; freight stacks there moved the kits' records. Without a mix of its own a map keeps the base row its kit
 * replaces, as before.)
 */
export function drawsPeriodFreight(mapId: string | null | undefined): boolean {
  return precedesIsoContainer(mapId) && Object.prototype.hasOwnProperty.call(FREIGHT_MIX, mapId as string);
}

/** The seat's form from the map's mix and one draw of the seat's own stream. */
export function freightForm(mapId: string, u: number): FreightForm {
  const mix = FREIGHT_MIX[mapId] ?? DEFAULT_MIX;
  let acc = 0;
  for (const [form, share] of mix) { acc += share; if (u < acc) return form; }
  return mix[mix.length - 1][0];
}

/** The seat's footprint (the ISO twenty-foot box it stands in for): across the row, along the row's depth. */
const SEAT_W = 2.44, SEAT_L = 6.1;
/** Timber bearers under every stack: their height. */
const BEARER_H = 0.14;

/** Tarred railway sheets and faded canvas (sRGB). The works and the junction: the railways' black and grey sheets. */
const TARP_TONES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  rail: [0x2f2e2b, 0x3a3936, 0x45443e, 0x4d5047, 0x5b5a4c],
  canvas: [0x6b6548, 0x7a6f52, 0x5e6149, 0x8a7d5c, 0x4f5242],
});
const ROPE = 0x6e5f45, CORE = 0x26221d;
/** Rolled steel in the open: mill scale blue-black on the sides, the tops gone to rust (sRGB, over the metal print). */
const BILLET_RUST = [0x7a5038, 0x6e4a36, 0x845a3e, 0x66463a], BILLET_SCALE = [0x4e4440, 0x5a4a40, 0x463e3a, 0x60503f];
/** Weathered timber (multiplies the structure wood's oak print): grey bearers, crate boards pale to dark, fresh deal. */
const TIMBER_GREY = 0x8d8578, CRATE_TONES = [0x8f826e, 0x7f7464, 0x9b8b72, 0x857560, 0x70685c, 0xa08c6e], DEAL = 0xc9b38a;

const _c = new THREE.Color();
function paint(geo: THREE.BufferGeometry, rng: Rng, hex: number, jitter = 0.06): THREE.BufferGeometry {
  _c.set(hex);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 1 + (rng() - 0.5) * jitter * 2;
    col[i * 3] = Math.min(1, _c.r * v); col[i * 3 + 1] = Math.min(1, _c.g * v); col[i * 3 + 2] = Math.min(1, _c.b * v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
/** A part new to the stream (props.ts jitterBuildingUvs leaves it alone). */
function fresh<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.uvJitter = 'none';
  return geo;
}
function pick<T>(list: readonly T[], u: number): T {
  return list[Math.min(list.length - 1, (u * list.length) | 0)];
}

/** One stack's parts by bucket, in the seat's local frame (x across, z along, y up from the ground). */
interface StackParts { baked: THREE.BufferGeometry[]; structureWood: THREE.BufferGeometry[]; structureMetal: THREE.BufferGeometry[] }

/**
 * The hidden movement cores: the stack's solid inset inside every visible part, from the ground (the bearers' level reads
 * as the shadow under the stack, as the container's floor did). The base core takes the box's four UV draws ('consume')
 * and is the court support's foot (foundryServiceSupport.ts 'freight'); a stacked seat's second core, for the stacked
 * box's four draws, stands wholly inside the first.
 */
function cores(parts: StackParts, local: Rng, w: number, h: number, l: number, upper: boolean): void {
  const g = paint(box(w, h, l, 0.5), local, CORE, 0.04);
  g.translate(0, h / 2, 0);
  g.userData.uvJitter = 'consume';
  g.userData.structureSupport = { part: 'freight-core' };
  parts.baked.push(g);
  if (!upper) return;
  const inner = paint(box(w * 0.8, h * 0.8, l * 0.8, 0.5), local, CORE, 0.04);
  inner.translate(0, h / 2, 0);
  inner.userData.uvJitter = 'consume';
  parts.baked.push(inner);
}

/** Bearers across the seat under a stack of the given length: weathered squared timbers. */
function bearers(parts: StackParts, local: Rng, w: number, l: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const z = -l / 2 + 0.35 + (l - 0.7) * (count === 1 ? 0.5 : i / (count - 1)) + (local() - 0.5) * 0.12;
    const g = paint(box(w + 0.16 + local() * 0.1, BEARER_H, 0.16, 0.55), local, TIMBER_GREY, 0.08);
    g.rotateY((local() - 0.5) * 0.06);
    g.translate((local() - 0.5) * 0.06, BEARER_H / 2, z);
    parts.structureWood.push(fresh(g));
  }
}

/**
 * A sheeted stack: crates or sacks under a tarred sheet drawn over a ridge spar, the sheet's skirt flaring to the
 * bearers, lashed across the top and down both sides to the bearers' ends, its corners folded.
 */
function tarpStack(parts: StackParts, local: Rng, mapId: string, upper: boolean): void {
  const w = SEAT_W - 0.08 - local() * 0.12, l = SEAT_L - 0.25 - local() * 0.5;
  const h = 1.75 + local() * 0.45 + (upper ? 0.6 + local() * 0.35 : 0);
  const ridge = 0.16 + local() * 0.16;
  const tones = mapId === 'steppe' ? TARP_TONES.canvas : TARP_TONES.rail;
  const tone = pick(tones, local());
  bearers(parts, local, w, l, 3);
  cores(parts, local, 0.92 * (w + 0.06) - 0.08, BEARER_H + h - 0.06, 0.92 * (l + 0.06) - 0.08, upper);
  // the sheet: a square frustum (wider at the skirt), scaled to the stack's plan
  const body = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.94, Math.SQRT1_2, h + BEARER_H - 0.04, 4, 4, true);
  body.rotateY(Math.PI / 4);
  body.scale(w + 0.06, 1, l + 0.06);
  body.translate(0, (h + BEARER_H - 0.04) / 2 + 0.04, 0);
  // the sheet is slack between the lashings and pulled in over the load's courses: each inner ring drawn in by its own
  // amount, a corner here and there lower or prouder (the load under it is not a box); the skirt ring stays at the bearers
  const pos = body.attributes.position as THREE.BufferAttribute;
  const sheetTop = h + BEARER_H, ringPull = [0, 0.97 + local() * 0.02, 0.975 + local() * 0.02, 0.965 + local() * 0.025, 1];
  // (one jitter per ring and corner: the seam's two copies of a corner move together, so the sheet never opens)
  const jitter = Array.from({ length: 20 }, () => [1 + (local() - 0.5) * 0.02, (local() - 0.5) * 0.06]);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ring = Math.round((1 - (y - 0.04) / (sheetTop - 0.04)) * 4);
    if (ring <= 0 || ring >= 4) continue;
    const [kj, yj] = jitter[ring * 4 + (pos.getX(i) > 0 ? 1 : 0) + (pos.getZ(i) > 0 ? 2 : 0)];
    const k = ringPull[ring] * kj;
    pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * (1 - (1 - k) * 0.35));
    pos.setY(i, y + yj);
  }
  body.computeVertexNormals();
  parts.baked.push(fresh(paint(body, local, tone, 0.09)));
  // the top: a shallow ridge over the spar, closing the frustum's top
  const top = gablePrism(w * 0.94 + 0.06, ridge, l * 0.94 + 0.06, 0.4);
  top.translate(0, h + BEARER_H, 0);
  parts.baked.push(fresh(paint(top, local, tone, 0.07)));
  // the lashings: over the ridge (two slanted pieces) and down each side to the bearer end
  const lashes = 3 + (local() < 0.5 ? 1 : 0);
  const halfTop = (w * 0.94 + 0.06) / 2, slope = Math.atan2(ridge, halfTop), run = Math.hypot(halfTop, ridge);
  for (let i = 0; i < lashes; i++) {
    const z = -l / 2 + 0.6 + (l - 1.2) * (i / (lashes - 1)) + (local() - 0.5) * 0.2;
    for (const s of [-1, 1]) {
      const over = paint(box(run, 0.03, 0.04, 0.5), local, ROPE, 0.08);
      over.rotateZ(-s * slope);
      over.translate(s * halfTop / 2, h + BEARER_H + ridge / 2 + 0.018, z);
      parts.baked.push(fresh(over));
      const down = paint(box(0.03, h - 0.02, 0.04, 0.5), local, ROPE, 0.08);
      down.rotateZ(s * 0.025);
      down.translate(s * ((w + 0.06) / 2 + 0.012), BEARER_H + (h - 0.02) / 2, z);
      parts.baked.push(fresh(down));
    }
  }
}

/** A crate stack: a full course of wooden cases on the bearers, the next course full only on a stacked seat. */
function crateStack(parts: StackParts, local: Rng, upper: boolean): void {
  const cols = 2, rows = 4 + (local() < 0.5 ? 1 : 0);
  const cw = (SEAT_W - 0.1) / cols, cl = (SEAT_L - 0.3) / rows;
  const courseH = [0.85 + local() * 0.25, 0.8 + local() * 0.25, 0.7 + local() * 0.2];
  const courses = upper ? 3 : 2;
  bearers(parts, local, SEAT_W - 0.1, SEAT_L - 0.3, 3);
  let y = BEARER_H;
  const fullCourses = upper ? 2 : 1;
  cores(parts, local, SEAT_W - 0.44, BEARER_H + courseH[0] + (upper ? courseH[1] : 0) - 0.06, SEAT_L - 0.6, upper);
  for (let c = 0; c < courses; c++) {
    const full = c < fullCourses, ch = courseH[c];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (!full && local() < 0.45) continue;
      const tone = pick(CRATE_TONES, local());
      const ww = cw - 0.05 - local() * 0.06, ll = cl - 0.05 - local() * 0.08, hh = ch - (full ? 0.02 : local() * 0.2);
      const x = -SEAT_W / 2 + 0.05 + cw * (i + 0.5) + (local() - 0.5) * 0.04;
      const z = -SEAT_L / 2 + 0.15 + cl * (j + 0.5) + (local() - 0.5) * 0.05;
      const yaw = full ? (local() - 0.5) * 0.03 : (local() - 0.5) * 0.12;
      const crate = paint(box(ww, hh, ll, 0.55), local, tone, 0.07);
      crate.rotateY(yaw);
      crate.translate(x, y + hh / 2, z);
      parts.structureWood.push(fresh(crate));
      // the case's battens: a darker band round its top and its foot, proud by a centimetre
      for (const by of [0.06, hh - 0.06]) {
        const batten = paint(box(ww + 0.02, 0.08, ll + 0.02, 0.55), local, 0x6f5d44, 0.06);
        batten.rotateY(yaw);
        batten.translate(x, y + by, z);
        parts.structureWood.push(fresh(batten));
      }
    }
    y += ch;
  }
}

/**
 * Rolled steel waiting at a works: square billets laid in courses along the seat, timber spacers across between the
 * courses, mill scale gone to rust on the tops.
 */
function billetStack(parts: StackParts, local: Rng, upper: boolean): void {
  const bars = 5, side = 0.26 + local() * 0.06, gap = 0.12;
  const l = SEAT_L - 0.6 - local() * 0.4, courses = (upper ? 6 : 4) + (local() < 0.4 ? 1 : 0);
  const span = bars * side + (bars - 1) * gap, spacer = 0.1;
  bearers(parts, local, span + 0.2, l, 3);
  const pitch = side + spacer;
  cores(parts, local, span - 0.14, BEARER_H + courses * pitch - spacer - 0.06, l - 0.5, upper);
  for (let c = 0; c < courses; c++) {
    const y = BEARER_H + c * pitch;
    const shift = (local() - 0.5) * 0.06;
    for (let b = 0; b < bars; b++) {
      const bl = l - local() * 0.25;
      const bar = paint(box(side, side, bl, 0.55), local, pick(c === courses - 1 ? BILLET_RUST : BILLET_SCALE, local()), 0.14);
      bar.translate(-span / 2 + side / 2 + b * (side + gap) + shift, y + side / 2, (local() - 0.5) * 0.12);
      parts.structureMetal.push(fresh(bar));
    }
    if (c === courses - 1) break;
    for (const z of [-l * 0.38, 0, l * 0.38]) {
      const sp = paint(box(span + 0.1, spacer, 0.1, 0.55), local, TIMBER_GREY, 0.08);
      sp.translate(shift, y + side + spacer / 2, z + (local() - 0.5) * 0.1);
      parts.structureWood.push(fresh(sp));
    }
  }
}

/** Sawn timber in a stickered stack: courses of deal with stickers across between them, the top course short. */
function lumberStack(parts: StackParts, local: Rng, upper: boolean): void {
  const w = SEAT_W - 0.2 - local() * 0.15, l = SEAT_L - 0.4 - local() * 0.3;
  const courses = (upper ? 9 : 6) + (local() < 0.5 ? 1 : 0), courseH = 0.2 + local() * 0.04, sticker = 0.045;
  bearers(parts, local, w, l, 3);
  const pitch = courseH + sticker;
  cores(parts, local, w - 0.1, BEARER_H + (courses - 1) * pitch - sticker - 0.03, l - 0.5, upper);
  for (let c = 0; c < courses; c++) {
    const y = BEARER_H + c * pitch;
    // a course is a row of boards edge to edge: four planks across, their ends ragged
    const planks = 4;
    for (let p = 0; p < planks; p++) {
      const pw = w / planks - 0.015, pl = l - (c === courses - 1 ? local() * 1.2 : local() * 0.25);
      const board = paint(box(pw, courseH, pl, 0.55), local, DEAL, 0.1);
      board.translate(-w / 2 + (p + 0.5) * (w / planks), y + courseH / 2, (local() - 0.5) * 0.18);
      parts.structureWood.push(fresh(board));
    }
    if (c === courses - 1) break;
    for (const z of [-l * 0.42, -l * 0.14, l * 0.14, l * 0.42]) {
      const st = paint(box(w + 0.04, sticker, 0.05, 0.55), local, TIMBER_GREY, 0.06);
      st.translate(0, y + courseH + sticker / 2, z);
      parts.structureWood.push(fresh(st));
    }
  }
}

/**
 * One seat of a period freight row, placed where the container stood (x across the row, z its depth offset, its yaw).
 * `upper` is the row's stack roll: the seat that would have stacked a second box stacks higher and emits a second core.
 */
export function pushPeriodFreight(
  buckets: GeometryBuckets, local: Rng, mapId: string, x: number, z: number, yaw: number, upper: boolean,
): void {
  const parts: StackParts = { baked: [], structureWood: [], structureMetal: [] };
  const form = freightForm(mapId, local());
  if (form === 'tarp') tarpStack(parts, local, mapId, upper);
  else if (form === 'crates') crateStack(parts, local, upper);
  else if (form === 'billets') billetStack(parts, local, upper);
  else lumberStack(parts, local, upper);
  for (const key of ['baked', 'structureWood', 'structureMetal'] as const) {
    const target = buckets[key] ?? buckets.baked ?? buckets.dark;
    for (const g of parts[key]) {
      g.rotateY(yaw);
      g.translate(x, 0, z);
      target.push(g);
    }
  }
}
