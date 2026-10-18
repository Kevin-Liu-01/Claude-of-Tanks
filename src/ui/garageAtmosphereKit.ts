import * as THREE from 'three';

import { fxNow } from '../fx/clock.ts';
import { kitRandom, type KitVec } from './garageKitGeometry.ts';

/**
 * K8, atmosphere (garage r9): light shafts through roof lights and doors, dust motes in them, low sand and spindrift
 * streamers, stack and steam plumes, mist bands in the backdrop's valleys, eave drips. No falling rain or snow: weather
 * reads through ground, haze, plumes and drips (the battle policy has none either), and the fair-weather cumulus and sun
 * trims are not touched.
 *
 * One procedural strip atlas (256 x 256, eight horizontal strips, each tileable along U and pre-tinted) and one mesh per
 * Garage on the stock map + transparent key the contact shadows already compile, so it adds one draw and no program.
 * Everything moves by scrolling the strips along U on the shared FX clock (Studio and captures pin it), so the CPU cost
 * is one uniform a frame and nothing is allocated per frame; the clock does not advance while the Garage is hidden.
 *
 * Budget per Garage: 1 draw, 2,500 triangles (each card is drawn with both windings), 0.15 ms a frame, one 0.26 MB
 * texture. Opacity caps: shafts 6 %, motes
 * 30 % a sprite, nothing above 5 % over the hero's halo (the placement receipt checks the halo).
 */

type GarageAtmosphereStrip = 'shaft' | 'mist' | 'smoke' | 'steam' | 'dust' | 'reddust' | 'motes' | 'drips';

const STRIPS: readonly GarageAtmosphereStrip[] = ['shaft', 'mist', 'smoke', 'steam', 'dust', 'reddust', 'motes', 'drips'];
const TEX = 256;
const STRIP_H = TEX / STRIPS.length;

/** Peak alpha per strip (the design's caps: shafts 6 %, motes 30 % a sprite). */
export const GARAGE_ATMOSPHERE_ALPHA: Readonly<Record<GarageAtmosphereStrip, number>> = Object.freeze({
  shaft: 0.06, mist: 0.22, smoke: 0.34, steam: 0.3, dust: 0.2, reddust: 0.2, motes: 0.3, drips: 0.35,
});

const STRIP_TINT: Readonly<Record<GarageAtmosphereStrip, readonly [number, number, number]>> = Object.freeze({
  shaft: [255, 240, 214], mist: [224, 232, 240], smoke: [92, 90, 88], steam: [240, 242, 244],
  dust: [214, 190, 150], reddust: [196, 120, 80], motes: [255, 246, 226], drips: [200, 210, 220],
});

/** The strip atlas pixels (RGBA, row 0 at the top), deterministic. */
export function garageAtmosphereAtlasPixels(): Uint8Array {
  const random = kitRandom(0xa7305);
  const data = new Uint8Array(TEX * TEX * 4);
  // a tileable value noise along U (period TEX)
  const lattice = new Float32Array(32 * 9);
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = random();
  const noise = (u: number, v: number, cellsU: number): number => {
    const fu = (u / TEX) * cellsU, fv = v * 8;
    const iu = Math.floor(fu), iv = Math.min(7, Math.floor(fv));
    const tu = fu - iu, tv = fv - iv;
    const su = tu * tu * (3 - 2 * tu), sv = tv * tv * (3 - 2 * tv);
    const at = (a: number, b: number): number => lattice[(b * 32) + (((a % cellsU) + cellsU) % cellsU)];
    const top = at(iu, iv) + (at(iu + 1, iv) - at(iu, iv)) * su;
    const bottom = at(iu, iv + 1) + (at(iu + 1, iv + 1) - at(iu, iv + 1)) * su;
    return top + (bottom - top) * sv;
  };
  const motes: Array<[number, number, number]> = [];
  for (let i = 0; i < 70; i += 1) motes.push([random() * TEX, 2 + random() * (STRIP_H - 4), 0.6 + random() * 1.4]);
  const drips: Array<[number, number]> = [];
  for (let i = 0; i < 22; i += 1) drips.push([random() * TEX, 0.4 + random() * 0.6]);
  STRIPS.forEach((strip, index) => {
    const [tr, tg, tb] = STRIP_TINT[strip];
    const peak = GARAGE_ATMOSPHERE_ALPHA[strip];
    for (let y = 0; y < STRIP_H; y += 1) {
      const v = y / (STRIP_H - 1); // 0 top .. 1 bottom of the strip
      const edge = Math.sin(Math.PI * Math.min(1, Math.max(0, (y + 0.5) / STRIP_H)));
      for (let x = 0; x < TEX; x += 1) {
        let a = 0;
        switch (strip) {
          // a shaft is even across its width (a scrolled texture must never slide a beam sideways): it fades only top and
          // bottom
          case 'shaft': a = edge; break;
          case 'mist': a = edge * edge * (0.45 + 0.55 * noise(x, v, 6)); break;
          case 'smoke': case 'steam': {
            const billow = noise(x, v, 10) * 0.6 + noise(x * 2.0, v, 20) * 0.4;
            a = edge * Math.max(0, billow * 1.5 - 0.35);
            break;
          }
          case 'dust': case 'reddust': {
            const streak = noise(x, v * 0.5, 16) * 0.7 + noise(x, v, 32) * 0.3;
            a = Math.pow(edge, 1.5) * Math.max(0, streak * 1.4 - 0.4);
            break;
          }
          case 'motes': {
            for (const [mx, my, mr] of motes) {
              let ddx = Math.abs(x - mx); ddx = Math.min(ddx, TEX - ddx);
              const d = Math.hypot(ddx, y - my);
              if (d < mr) a = Math.max(a, 1 - d / mr);
            }
            break;
          }
          case 'drips': {
            for (const [dx, len] of drips) {
              let ddx = Math.abs(x - dx); ddx = Math.min(ddx, TEX - ddx);
              if (ddx < 0.8 && v < len) a = Math.max(a, (1 - v / len) * (1 - ddx / 0.8));
            }
            break;
          }
          default: break;
        }
        const o = ((index * STRIP_H + y) * TEX + x) * 4;
        data[o] = tr; data[o + 1] = tg; data[o + 2] = tb;
        data[o + 3] = Math.round(Math.min(1, a) * peak * 255);
      }
    }
  });
  return data;
}

let sharedTexture: THREE.DataTexture | null = null;
function atmosphereTexture(): THREE.DataTexture {
  if (sharedTexture) return sharedTexture;
  const texture = new THREE.DataTexture(garageAtmosphereAtlasPixels(), TEX, TEX, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.name = 'garage-atmosphere-strips';
  sharedTexture = texture;
  return texture;
}

/** One card of atmosphere: a quad in the pack's frame on one strip. */
interface GarageAtmosphereCard {
  readonly strip: GarageAtmosphereStrip;
  /** Bottom-left, bottom-right, top-right, top-left corners. */
  readonly corners: readonly [KitVec, KitVec, KitVec, KitVec];
  /** How many strip widths the card spans along U (a long mist band repeats its strip). */
  readonly repeat?: number;
  /** A U offset so neighbouring cards do not show the same billow. */
  readonly phase?: number;
}

/** The kinds of effect a Garage composes from cards (each a helper below). */
export interface GarageAtmosphereRecipe {
  readonly cards: readonly GarageAtmosphereCard[];
  /** U scroll speed (strip widths a second): the wind. */
  readonly drift?: number;
}

/** A light shaft: a tall card from a roof light or door down to the floor, `width` wide, leaning by `lean`. */
export function atmosphereShaft(top: KitVec, bottom: KitVec, width: number, phase = 0): GarageAtmosphereCard {
  const dx = bottom[0] - top[0], dz = bottom[2] - top[2];
  const len = Math.hypot(dx, dz) || 1;
  const sx = (-dz / len) * width / 2, sz = (dx / len) * width / 2;
  return { strip: 'shaft', corners: [[bottom[0] - sx, bottom[1], bottom[2] - sz], [bottom[0] + sx, bottom[1], bottom[2] + sz],
    [top[0] + sx, top[1], top[2] + sz], [top[0] - sx, top[1], top[2] - sz]], repeat: 0.5, phase };
}

/** A plume: `count` stacked cards rising from a stack top, widening and leaning downwind. */
export function atmospherePlume(base: KitVec, height: number, width: number, strip: 'smoke' | 'steam', windYaw = 0.6, count = 6): GarageAtmosphereCard[] {
  const cards: GarageAtmosphereCard[] = [];
  const wx = Math.cos(windYaw), wz = Math.sin(windYaw);
  for (let i = 0; i < count; i += 1) {
    const t0 = i / count, t1 = (i + 1) / count;
    const y0 = base[1] + t0 * height, y1 = base[1] + t1 * height;
    const lean0 = t0 * t0 * height * 0.5, lean1 = t1 * t1 * height * 0.5;
    const w0 = width * (0.5 + t0 * 1.6), w1 = width * (0.5 + t1 * 1.6);
    const yaw = (i * 1.3) % Math.PI; // each card faces a different way, so the plume reads from every orbit angle
    const cx = Math.cos(yaw), cz = Math.sin(yaw);
    const c0: KitVec = [base[0] + wx * lean0, y0, base[2] + wz * lean0];
    const c1: KitVec = [base[0] + wx * lean1, y1, base[2] + wz * lean1];
    cards.push({ strip, corners: [[c0[0] - cx * w0 / 2, y0, c0[2] - cz * w0 / 2], [c0[0] + cx * w0 / 2, y0, c0[2] + cz * w0 / 2],
      [c1[0] + cx * w1 / 2, y1, c1[2] + cz * w1 / 2], [c1[0] - cx * w1 / 2, y1, c1[2] - cz * w1 / 2]], repeat: 0.4, phase: i * 0.17 });
  }
  return cards;
}

/** A mist band: a long low card lying across a valley in the backdrop, from a to b, `height` tall. */
export function atmosphereBand(a: KitVec, b: KitVec, height: number, strip: GarageAtmosphereStrip = 'mist', phase = 0): GarageAtmosphereCard {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  return { strip, corners: [[a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0], b[1] + height, b[2]], [a[0], a[1] + height, a[2]]],
    repeat: Math.max(1, len / 12), phase };
}

/** Ankle-height streamers (sand, red dust, spindrift) across the yard from a to b. */
export function atmosphereStreamer(a: KitVec, b: KitVec, strip: 'dust' | 'reddust' | 'mist', phase = 0): GarageAtmosphereCard {
  return atmosphereBand(a, b, 0.55, strip, phase);
}

/** Eave drips: a strip of short streaks under a gutter from a to b. */
export function atmosphereDrips(a: KitVec, b: KitVec, drop = 0.9): GarageAtmosphereCard {
  return { strip: 'drips', corners: [[a[0], a[1] - drop, a[2]], [b[0], b[1] - drop, b[2]], [b[0], b[1], b[2]], [a[0], a[1], a[2]]],
    repeat: Math.max(1, Math.hypot(b[0] - a[0], b[2] - a[2]) / 3) };
}

/** Dust motes hanging in a shaft: a few crossed cards filling the shaft's volume. */
export function atmosphereMotes(center: KitVec, size: number): GarageAtmosphereCard[] {
  const cards: GarageAtmosphereCard[] = [];
  for (let i = 0; i < 3; i += 1) {
    const yaw = (i / 3) * Math.PI;
    const cx = Math.cos(yaw) * size / 2, cz = Math.sin(yaw) * size / 2;
    cards.push({ strip: 'motes', corners: [[center[0] - cx, center[1] - size / 2, center[2] - cz], [center[0] + cx, center[1] - size / 2, center[2] + cz],
      [center[0] + cx, center[1] + size / 2, center[2] + cz], [center[0] - cx, center[1] + size / 2, center[2] - cz]], repeat: size / 4, phase: i * 0.31 });
  }
  return cards;
}

let clockOverride: (() => number) | null = null;
/** Captures and Studio pin the atmosphere: a fixed clock gives identical frames. Pass null to follow the FX clock. */
export function setGarageAtmosphereClock(clock: (() => number) | null): void {
  clockOverride = clock;
}

/**
 * Build one Garage's atmosphere mesh from its recipe. The mesh scrolls its strips on the shared clock in onBeforeRender
 * (so it costs nothing while the Garage is hidden or the tab is in the background); `userData.atmosphereTriangles`
 * receipts its size.
 */
export function createGarageAtmosphere(recipe: GarageAtmosphereRecipe): THREE.Mesh {
  const positions: number[] = [], uvs: number[] = [];
  for (const card of recipe.cards) {
    const index = STRIPS.indexOf(card.strip);
    // the strip's rows (flipY false: row 0 at v = 0), inset half a texel
    const v0 = (index * STRIP_H + 0.5) / TEX, v1 = ((index + 1) * STRIP_H - 0.5) / TEX;
    const u0 = card.phase ?? 0, u1 = u0 + (card.repeat ?? 1);
    // corners are bottom-left, bottom-right, top-right, top-left; the strip's top row is its v0
    const corner: ReadonlyArray<readonly [KitVec, number, number]> = [
      [card.corners[0], u0, v1], [card.corners[1], u1, v1], [card.corners[2], u1, v0], [card.corners[3], u0, v0],
    ];
    // both windings: the material stays single-sided (the contact shadows' program), the card reads from either side
    for (const k of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) {
      const [p, u, v] = corner[k];
      positions.push(p[0], p[1], p[2]);
      uvs.push(u, v);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // the stock map + transparent key the contact shadows compile (front-sided, fogged): no program of its own
  const material = new THREE.MeshBasicMaterial({ map: atmosphereTexture().clone(), transparent: true, depthWrite: false });
  // each Garage's mesh scrolls its own texture transform (a clone shares the strip pixels' source)
  material.name = 'garage:atmosphere';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'garage_atmosphere';
  mesh.renderOrder = 3;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.atmosphereTriangles = positions.length / 9;
  mesh.userData.atmosphereCards = recipe.cards.length;
  const drift = recipe.drift ?? 0.02;
  let last: number | null = null;
  let localTime = 0;
  mesh.onBeforeRender = () => {
    // the shared FX clock when it runs, or a local clock that only advances while this mesh renders
    const pinned = clockOverride?.() ?? fxNow();
    let t: number;
    if (pinned !== null) t = pinned;
    else {
      const now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
      if (last !== null) localTime += Math.min(0.1, Math.max(0, now - last));
      last = now;
      t = localTime;
    }
    material.map!.offset.x = -(t * drift) % 1;
  };
  return mesh;
}
