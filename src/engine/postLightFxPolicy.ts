/**
 * postLightFxPolicy.ts — round 69 (2026-09-24): which of the desktop light effects run.
 *
 * Five effects, five levers on the quality preset (quality.ts): screen-space contact shadows (contactShadows.ts,
 * inside the aerial pass), ground bounce (groundBounce.ts, inside the lit materials through lighting.ts), sun
 * shafts (sunShafts.ts) and the lens flare (lensFlare.ts), the last two quarter-resolution passes composited by
 * the grade, and (owner 2026-10-02) the vehicle cavity occlusion (vehicleOcclusion.ts, inside the aerial pass). The mobile tier never runs them, whatever the preset says, and the `?fx=` query is the QA switch the
 * pinned capture receipts and the A/B probes boot with: `?fx=off` turns every effect off, `?fx=contact,shafts`
 * keeps only the named ones (each still needs its preset lever). Pure: no DOM, no renderer.
 */
import type { QualityPreset } from './quality.ts';

export interface PostLightFxFlags {
  readonly contactShadows: boolean;
  readonly groundBounce: boolean;
  readonly sunShafts: boolean;
  readonly lensFlare: boolean;
  readonly vehicleOcclusion: boolean;
}

export const POST_LIGHT_FX_NAMES = Object.freeze({
  contact: 'contactShadows', bounce: 'groundBounce', shafts: 'sunShafts', flare: 'lensFlare', cavity: 'vehicleOcclusion',
} as const);

export type PostLightFxQueryName = keyof typeof POST_LIGHT_FX_NAMES;

export const POST_LIGHT_FX_OFF: PostLightFxFlags = Object.freeze({
  contactShadows: false, groundBounce: false, sunShafts: false, lensFlare: false, vehicleOcclusion: false,
});

/** `?fx=` query: null = the preset decides, 'off' = nothing, otherwise the named effects only. */
export type PostLightFxQuery = null | 'off' | ReadonlySet<PostLightFxQueryName>;

/** Parse a location search string (with or without its leading `?`). Unknown names are ignored, not errors. */
export function parsePostLightFxQuery(search: string | null | undefined): PostLightFxQuery {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('fx');
  if (raw === null) return null;
  const value = raw.trim().toLowerCase();
  if (value === '' || value === 'off' || value === '0' || value === 'none') return 'off';
  if (value === 'on' || value === 'all' || value === 'default' || value === '1') return null;
  const names = new Set<PostLightFxQueryName>();
  for (const token of value.split(',')) {
    const name = token.trim() as PostLightFxQueryName;
    if (name in POST_LIGHT_FX_NAMES) names.add(name);
  }
  return names;
}

/** The effects that run for this preset on this device under this query. */
export function resolvePostLightFx(
  preset: Pick<QualityPreset, 'contactShadows' | 'groundBounce' | 'sunShafts' | 'lensFlare' | 'vehicleOcclusion'>,
  deviceTier: 'mobile' | 'desktop',
  query: PostLightFxQuery = null,
): PostLightFxFlags {
  if (deviceTier === 'mobile' || query === 'off') return POST_LIGHT_FX_OFF;
  const allowed = (name: PostLightFxQueryName): boolean => query === null || query.has(name);
  return Object.freeze({
    contactShadows: !!preset.contactShadows && allowed('contact'),
    groundBounce: !!preset.groundBounce && allowed('bounce'),
    sunShafts: !!preset.sunShafts && allowed('shafts'),
    lensFlare: !!preset.lensFlare && allowed('flare'),
    vehicleOcclusion: !!preset.vehicleOcclusion && allowed('cavity'),
  });
}

/**
 * 2026-10-10 (the shadows lane, overhaul r5): whether the baked ground sky occlusion beside the world's solids runs
 * (structureGroundOcclusion.ts). On the desktop tiers with the contact march it rides that lever (r1); a preset's own
 * `groundOcclusion` lever adds it where the march is off — Low, and the phones, whose other light effects stay off
 * (it is one texture read near the solids, no screen-space search). `?fx=off` turns it off everywhere and a named
 * list keeps it only with `contact`.
 */
export function resolveGroundOcclusion(
  preset: Pick<QualityPreset, 'contactShadows' | 'groundOcclusion'>,
  deviceTier: 'mobile' | 'desktop',
  query: PostLightFxQuery = null,
): boolean {
  if (query === 'off' || (query !== null && !query.has('contact'))) return false;
  return preset.groundOcclusion === true || (deviceTier !== 'mobile' && preset.contactShadows === true);
}

/** The page's own query, when there is a page (Node receipts and workers see none). */
export function currentPostLightFxQuery(): PostLightFxQuery {
  try {
    if (typeof window === 'undefined' || !window.location) return null;
    return parsePostLightFxQuery(window.location.search);
  } catch {
    return null;
  }
}

export function samePostLightFx(a: PostLightFxFlags, b: PostLightFxFlags): boolean {
  return a.contactShadows === b.contactShadows && a.groundBounce === b.groundBounce
    && a.sunShafts === b.sunShafts && a.lensFlare === b.lensFlare && a.vehicleOcclusion === b.vehicleOcclusion;
}
