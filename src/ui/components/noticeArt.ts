// A notice's art (notices-276; Kevin 2026-11-23: "those kinds of notifications need graphics in the empty part of the
// notifications with like the graphic and then its gradient transitioning from nothing into the image"). Copyright © 2026
// Kevin B. Liu.
//
// A notice kind declares an art id; the kit (notice.ts noticeContentHtml) draws it as one layer over the notice's empty
// side under one mask (notices.css .cot-c-notice__art: transparent into the picture). Every picture is the game's own 3/4
// render at 256 px (public/icons/thumbs/<id>_angle.webp: the tanks' renders, and the aircraft's from the same studio and
// framing, tools/genAircraftAssets.mjs), so every notice crops one style alike. Which kinds carry art was ruled by Kevin and
// Main on 2026-11-23: the aircraft over the crew (INCOMING) and the ones brought down, an enemy drone brought down, and the
// tank auto-aim locks on; every other notice stays words.
// Pure: no DOM (the receipts run it in Node).
import { tankThumbUrl } from '../icons.ts';
import { RENDERED_AIRCRAFT } from '../../vehicles/previewVehicles.ts';

/** The aircraft the notices picture, each with renders (tools/genAircraftAssets.mjs; previewVehicles.ts RENDERED_AIRCRAFT). */
export const NOTICE_AIRCRAFT = Object.freeze(['ac130', 'a10', 'f16', 'drone'] as const);
type NoticeAircraft = (typeof NOTICE_AIRCRAFT)[number];

/** A notice's art: an aircraft's render, or a tank's (`tank:<spec id>`). */
export type NoticeArtId = NoticeAircraft | `tank:${string}`;

/** A spec id as the renders name them (letters, digits, _ and -). */
const SPEC_ID = /^[a-z0-9][a-z0-9_-]*$/i;

/** The art's picture, or null for an id that names none (a notice then shows its words alone). */
export function noticeArtUrl(art: string | null | undefined): string | null {
  if (!art) return null;
  if (Object.hasOwn(RENDERED_AIRCRAFT, art)) return tankThumbUrl(art);
  if (art.startsWith('tank:')) {
    const id = art.slice(5);
    return SPEC_ID.test(id) ? tankThumbUrl(id) : null;
  }
  return null;
}
