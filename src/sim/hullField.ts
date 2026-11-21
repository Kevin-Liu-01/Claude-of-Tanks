// hullField.ts — which hulls are on the field: one predicate for every reader of a battle's hull list (273).
// Copyright © 2026 Kevin B. Liu.
//
// A hull the mode or a scene keeps off the field (modeActive false: a training scene's parked hull, a benched or
// extracted one, a Horde enemy not yet arrived) is not in the battle for anyone: unseen, unaimed, undrawn, unlisted,
// untouched. The simulation's own loops (shells, contacts, controls, spotting's alive) already read it so; the
// presentation, the HUD's lists and plates, the aim's searches and the tutorial's guide read it here (Main, 2026-11-18,
// after the whole-chapter walk found parked hulls labelled, listed and drawn).

/** A hull on the field. */
export function onField(hull: { readonly modeActive?: boolean } | null | undefined): boolean {
  return !!hull && hull.modeActive !== false;
}

/** The hulls of `all` on the field, into `out` (reused: a frame's list allocates nothing), in order. */
export function fieldHulls<T extends { readonly modeActive?: boolean }>(all: readonly T[], out: T[]): T[] {
  out.length = 0;
  for (const hull of all) if (onField(hull)) out.push(hull);
  return out;
}
