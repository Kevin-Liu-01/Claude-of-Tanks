/**
 * Each tank's track ground contact, read by the movement solve wherever it runs (physics lane round 8, the coordinator's
 * ruling of 2026-10-04: "the host driving a 7.13 m support line for a 5.58 m track means multiplayer and solo play
 * different physics"). The tank builders lay each track's flat ground run between its road wheels, its rising ends at
 * the sprocket and the idler, its outer edge and its lowest surface; tools/gen-combat-anatomy.mjs measures that receipt
 * on every playable tank (`trackContact` in the combat anatomy calibration) and finalizeCombatAnatomy publishes it on
 * the spec's armour, so the host, its Worker, the client's prediction, the torture matrix and solo play read the same
 * contact. Before, only solo play had it (from the drawn model); the rest ran a support line of 0.9 x the hull's length
 * centred on its root, 1.5-2.5 m longer than the real track, with no rising ends, no belly pan and the hull's full width.
 *
 * DOM-free and Node-runnable: data and arithmetic only.
 */
import type { MovementContactGeometry } from './movement.ts';

/** The measured receipt (metres, hull-local: z forward from the root, y up from it). */
export interface TrackContactReceipt {
  readonly halfLenM: number;
  readonly halfWidM: number;
  readonly zCenterM: number;
  readonly bottomYM?: number | null;
  readonly panYM?: number | null;
  readonly endRise?: { readonly dzM: number; readonly frontM: number; readonly rearM: number } | null;
}

interface ContactDims {
  readonly hullLengthM: number;
  readonly widthM: number;
}

// Sanity clamps against the spec's dimensions: a measurement outside these is wrong, not novel.
const CONTACT_LEN_FRAC_MIN = 0.22;
const CONTACT_LEN_FRAC_MAX = 0.50;
const CONTACT_WID_FRAC_MIN = 0.30;
const CONTACT_WID_FRAC_MAX = 0.58;
const CONTACT_ZC_FRAC_MAX = 0.12; // contact-run centre offset cap (x hull length)
// MOVEMENT r1: hull-local Y of the lowest rendered surface — the support solve seats THIS plane on the terrain
// (pos.y = ground − bottomY + margin). The rebuilt profiles park it anywhere from −0.016 (pad grousers a hair under the
// old plane) to +0.10 (community placeholder pontoons / raised print floor lines); outside this band the scan hit paint,
// not a track.
const CONTACT_BOTY_MIN = -0.20;
const CONTACT_BOTY_MAX = 0.30;
// Measured hull-pan floor band (belly-guard line): pans outside this are a mis-scan (gun barrel over the bow,
// open-topped interiors).
const CONTACT_PAN_MIN = 0.12;
const CONTACT_PAN_MAX = 0.70;

function clampContactValue(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

/** A contact receipt validated against the spec's dimensions, as the movement solve reads it. */
export function validatedContactGeometry(
  source: Partial<TrackContactReceipt> & { halfLenM?: number | null; halfWidM?: number | null; zCenterM?: number | null },
  dimensions: ContactDims,
): MovementContactGeometry {
  const length = dimensions.hullLengthM;
  const width = dimensions.widthM;
  return {
    halfLenM: source.halfLenM == null
      ? 0.45 * length
      : clampContactValue(source.halfLenM, CONTACT_LEN_FRAC_MIN * length, CONTACT_LEN_FRAC_MAX * length),
    halfWidM: source.halfWidM == null
      ? 0.5 * width
      : clampContactValue(source.halfWidM, CONTACT_WID_FRAC_MIN * width, CONTACT_WID_FRAC_MAX * width),
    zCenterM: source.zCenterM == null
      ? 0
      : clampContactValue(source.zCenterM, -CONTACT_ZC_FRAC_MAX * length, CONTACT_ZC_FRAC_MAX * length),
    bottomYM: clampContactValue(source.bottomYM || 0, CONTACT_BOTY_MIN, CONTACT_BOTY_MAX),
    panYM: source.panYM == null ? null : clampContactValue(source.panYM, CONTACT_PAN_MIN, CONTACT_PAN_MAX),
    endRise: source.endRise
      ? {
        dzM: clampContactValue(source.endRise.dzM || 0.4, 0.2, 0.6),
        frontM: clampContactValue(source.endRise.frontM, 0.02, 0.5),
        rearM: clampContactValue(source.endRise.rearM, 0.02, 0.5),
      }
      : null,
  };
}

interface PublishedContactSpec {
  readonly dims: ContactDims;
  readonly armor?: { readonly trackContact?: TrackContactReceipt | null } | null;
}

const published = new WeakMap<object, { receipt: TrackContactReceipt; contact: MovementContactGeometry }>();

/**
 * The spec's published track contact, validated (cached per spec and receipt), or null for a spec without one: a
 * synthetic test hull, which keeps the solve's default support line (0.45 x the hull's length either side of its root).
 */
export function publishedTrackContact(spec: PublishedContactSpec): MovementContactGeometry | null {
  const receipt = spec?.armor?.trackContact;
  if (!receipt) return null;
  const cached = published.get(spec);
  if (cached && cached.receipt === receipt) return cached.contact;
  const contact = validatedContactGeometry(receipt, spec.dims);
  published.set(spec, { receipt, contact });
  return contact;
}
