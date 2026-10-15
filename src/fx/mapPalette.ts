/**
 * (EF.12, MASTER 94: "dust in the ground's colour"; the fixed dust colour tables) the battle's earth dust takes its map's
 * own ground colour: the hue of the map's ground albedo (the grounded light model's groundAlbedo, from each map's
 * lighting.groundAlbedoHex), laid over the tables' dust at each colour's own luminance. A burst's soil, a hull's track
 * dust and the dry wake over a red badland read red-tan, over an autumn field brown, over basalt grey; the tables keep
 * their light and dark. Snow, water, concrete, wood and metal keep their own colours; sand and rock take a lighter share
 * (their own colour is their material's). No light model (the phone tier's sky): the tables as they are.
 */
import { SURFACE_LOOKS, SURFACE_KINDS, type SurfaceKind } from './surfaceLooks.ts';

type Look = (typeof SURFACE_LOOKS)[SurfaceKind];
type Rgb = readonly [number, number, number];

/** Each earth kind's share of the map's hue (0: its table colour, 1: the map's hue at the table's luminance). */
export const MAP_DUST_SHARE: Readonly<Partial<Record<SurfaceKind, number>>> = Object.freeze({ soil: 0.6, mud: 0.5, sand: 0.35, rock: 0.3 });
/** The dry wake's share (effects.ts' dry dust table: hard, medium and soft ground). */
const DRY_WAKE_SHARE = 0.55;

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hue: [number, number, number] = [1, 1, 1];
const looks: Record<SurfaceKind, Look> = { ...SURFACE_LOOKS };

/** The map-tinted look of a surface (the table's own until a map's ground is set). */
export function surfaceLook(kind: SurfaceKind): Look {
  return looks[kind];
}

function tintRgb(c: Rgb, share: number): Rgb {
  const l = lum(c[0], c[1], c[2]);
  return Object.freeze([c[0] + (hue[0] * l - c[0]) * share, c[1] + (hue[1] * l - c[1]) * share, c[2] + (hue[2] * l - c[2]) * share] as const);
}

const toLin = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const toSrgb8 = (v: number): number => {
  const x = Math.min(1, Math.max(0, v));
  return Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055));
};
/** An sRGB hex colour with the map's hue laid over it at its own luminance (share 0..1). */
export function mapTintHex(hex: number, share = DRY_WAKE_SHARE): number {
  if (hue[0] === 1 && hue[1] === 1 && hue[2] === 1) return hex;
  const r = toLin((hex >> 16) & 255), g = toLin((hex >> 8) & 255), b = toLin(hex & 255), l = lum(r, g, b);
  return (toSrgb8(r + (hue[0] * l - r) * share) << 16) | (toSrgb8(g + (hue[1] * l - g) * share) << 8) | toSrgb8(b + (hue[2] * l - b) * share);
}

/**
 * Set the map's ground (linear albedo rgb; null: none). Its hue (the albedo over its luminance, each channel held to
 * 0.6..1.5) tints the earth looks. Returns true when the looks changed. Called every frame by effects.ts: an unchanged
 * ground costs three compares.
 */
export function setMapGroundAlbedo(albedo: ArrayLike<number> | null | undefined): boolean {
  let hr = 1, hg = 1, hb = 1;
  if (albedo && albedo.length >= 3) {
    const l = lum(albedo[0], albedo[1], albedo[2]);
    if (l > 1e-4) {
      hr = Math.min(1.5, Math.max(0.6, albedo[0] / l)); hg = Math.min(1.5, Math.max(0.6, albedo[1] / l));
      hb = Math.min(1.5, Math.max(0.6, albedo[2] / l));
      const k = lum(hr, hg, hb); hr /= k; hg /= k; hb /= k;
    }
  }
  if (Math.abs(hr - hue[0]) < 1e-4 && Math.abs(hg - hue[1]) < 1e-4 && Math.abs(hb - hue[2]) < 1e-4) return false;
  hue[0] = hr; hue[1] = hg; hue[2] = hb;
  const plain = hr === 1 && hg === 1 && hb === 1;
  for (const kind of SURFACE_KINDS) {
    const share = plain ? 0 : MAP_DUST_SHARE[kind];
    const base = SURFACE_LOOKS[kind];
    looks[kind] = share ? Object.freeze({ ...base, ejecta: tintRgb(base.ejecta, share), dust: tintRgb(base.dust, share),
      chunk: tintRgb(base.chunk, share) }) : base;
  }
  return true;
}
