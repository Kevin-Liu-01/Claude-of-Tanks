/**
 * The Gallery's link into a test drive (v2 progression, owner 2026-10-17: proving ground / test drive). The Gallery is
 * another page: its "Test drive" opens the game at `/?testdrive=<id>` (stamped `&ids=N` like every vehicle link this
 * build writes); the game reads the intent once the Garage is ready, launches the proving ground, and drops the
 * parameters from the address so a reload returns to the Garage instead of re-launching. Tiny on purpose: the Gallery
 * page imports it and nothing of the game.
 *
 * The id in a link is untrusted input: it is length- and charset-checked here, resolved through the id schema, and the
 * Garage launches only a vehicle it lists (garage.ts testDrive).
 */
import { TANK_IDS, TANK_ID_SCHEMA_PARAM, type TankIdResolver } from '../vehicles/tankIdAliases.ts';

/** The address parameter a Gallery test drive opens the game with. */
export const TEST_DRIVE_PARAM = 'testdrive';

const TANK_ID_PATTERN = /^[a-z0-9_]{1,64}$/;

/** `/?testdrive=<id>` (plus `&ids=N` once a rename has landed): the game's root, launching a test drive of `id`. */
export function testDriveHref(id: string, resolver: TankIdResolver = TANK_IDS): string {
  const stamp = resolver.linkParam();
  return `/?${TEST_DRIVE_PARAM}=${encodeURIComponent(id)}${stamp ? `&${stamp}` : ''}`;
}

/** The vehicle a test-drive address names, in this build's ids; null when there is none or it is malformed. */
export function readTestDriveIntent(search: string | null | undefined, resolver: TankIdResolver = TANK_IDS): string | null {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search || ''); } catch { return null; }
  const raw = params.get(TEST_DRIVE_PARAM);
  if (!raw || !TANK_ID_PATTERN.test(raw)) return null;
  const id = resolver.resolve(raw, params.get(TANK_ID_SCHEMA_PARAM));
  return TANK_ID_PATTERN.test(id) ? id : null;
}

/** The address with the test-drive parameters dropped (path, other parameters and hash kept). */
export function withoutTestDriveIntent(href: string): string {
  const url = new URL(href, 'https://local.invalid');
  if (!url.searchParams.has(TEST_DRIVE_PARAM)) return `${url.pathname}${url.search}${url.hash}`;
  url.searchParams.delete(TEST_DRIVE_PARAM);
  url.searchParams.delete(TANK_ID_SCHEMA_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
