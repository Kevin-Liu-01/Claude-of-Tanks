/**
 * cloudBase.ts — a map's cloud base and cover as Clouds 2.0 draws them, for the world (2026-10-15, the SKY lane; SSOT
 * HZ.14 "resolveCloudBase and resolveCloudCover: gives Frosthollow, Cinder, Polders and Olympus their far country ...
 * delete the legacy cap", moved from the horizons lane, built on the Clouds 2.0 fix).
 *
 * The ring's far range and its panorama capped every peak under the map's lowest authored cloud altitude (0.82 of it:
 * Frosthollow's 700 m deck flattened its far country to under 574 m, Cinder Junction's 800 m one to 656 m), because the
 * old layer drew a deck as a ceiling: a summit through it stood out over an opaque sheet. Clouds 2.0 draws the deck as a
 * medium at its real height with real breaks (and fades it into the haze over the march's last quarter), so a summit
 * that rises into it is covered where the cloud is and shows where the breaks are: the Hinterland's rule (hinterland/
 * far.ts: "the far country is never capped by the cloud deck: it stands into it and the clouds cover it physically").
 *
 * So the far country is capped only under a CLOSED deck — one that leaves no break to see a summit through — and there
 * at half the deck's depth (a summit rises into the deck and is lost in it, never a cut flat top under it). Pure (no
 * three, no GLSL): the ring worker and the receipts read it.
 */
import { CLOUDSCAPE_REGIMES, type CloudscapeConfig } from './cloudscapes.ts';
import { CLOUD_DECK_TUNE, cloudShellCover } from './cloudLayers.ts';

/** The base a map takes that authors neither a cloudscape base nor a deck altitude (cloudPresets.ts's default). */
const DEFAULT_BASE_M = 1400;
/** No cap: well over any far country (a float the panorama's shader can carry). */
export const CLOUD_BASE_NO_CAP_M = 1e5;

export interface CloudBase {
  /** The main lane's base (m). */
  readonly baseM: number;
  /** Its top (m). */
  readonly topM: number;
  /** The share of the sky the drawn clouds cover (a deck's after the render tune; a cumulus sky's coverage). */
  readonly cover: number;
  /** A deck (stratiform) rather than a cumulus sky. */
  readonly deck: boolean;
  /** A deck that leaves no break: the only sky the far country is capped under. */
  readonly closed: boolean;
  /** The height the far country stays under (m): half the closed deck's depth, else CLOUD_BASE_NO_CAP_M. */
  readonly capM: number;
}

interface CloudBaseInput {
  clouds?: CloudscapeConfig | null;
  sky?: { cloudAltM?: number; cloudOpacity?: number; cloudOpacity2?: number; turbidity?: number } | null;
}

/** The map's cloud base, top, cover and cap (the config's `clouds` block over its regime's row, its sky block under). */
export function resolveCloudBase(cfg: CloudBaseInput | null | undefined): CloudBase {
  const clouds = cfg?.clouds ?? null;
  const sky = cfg?.sky ?? null;
  const row = clouds?.regime && Object.prototype.hasOwnProperty.call(CLOUDSCAPE_REGIMES, clouds.regime) ? CLOUDSCAPE_REGIMES[clouds.regime] : null;
  if (!row) {
    // the old layer's sky block alone (no cloudscape: Olympus's galaxy sky, the Garage): a near-opaque low deck under a
    // turbid sky is the overcast the light model also reads (lightModelCore.ts resolveOvercast's legacy rule)
    const baseM = sky?.cloudAltM ?? DEFAULT_BASE_M;
    const overcast = (sky?.cloudOpacity ?? 1) >= 0.95 && (sky?.cloudOpacity2 ?? 0.42) >= 0.9 && (sky?.turbidity ?? 4) >= 7;
    return { baseM, topM: baseM + 320, cover: overcast ? 1 : 0.4, deck: overcast, closed: overcast, capM: overcast ? baseM + 160 : CLOUD_BASE_NO_CAP_M };
  }
  const baseM = clouds?.baseM ?? row.baseM ?? sky?.cloudAltM ?? DEFAULT_BASE_M;
  const thicknessM = clouds?.thicknessM ?? row.thicknessM;
  const coverage = clouds?.coverage ?? row.coverage;
  const deck = row.stratiform >= 0.5;
  // a deck's lane admits cloudShellCover(coverage) of the weather and the render tune scales a cell deck's (cloudLayers.ts)
  // (the shell closes where its cover reaches 1: no weather column left under the admitted share, no cell gap —
  // cloudShaders.ts cl2Shell's gapOn and footprint)
  const shell = deck ? cloudShellCover(coverage, true) * ((clouds?.cells ?? row.cells) >= 0.5 ? CLOUD_DECK_TUNE.CLOUD_DECK_COVER ?? 1 : 1) : coverage;
  const cover = Math.min(1, shell);
  const closed = deck && shell >= 1;
  return { baseM, topM: baseM + thicknessM, cover, deck, closed, capM: closed ? baseM + 0.5 * thicknessM : CLOUD_BASE_NO_CAP_M };
}

/** The share of the sky the map's drawn clouds cover (resolveCloudBase's cover). */
export function resolveCloudCover(cfg: CloudBaseInput | null | undefined): number {
  return resolveCloudBase(cfg).cover;
}
