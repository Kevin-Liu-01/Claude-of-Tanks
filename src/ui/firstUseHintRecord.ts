// The first-use hints' seen record (mobile-hud-274; settings-unify-278 added its reset). Copyright © 2026 Kevin B. Liu.
// One key per hint, `cot.hint.<id>.v1` = 'seen', written by the hints' runtime (firstUseHints.ts) as each shows and read
// as a battle's hints are made. Settings › Interface › Tips counts and forgets them here, so the reset owns no hint list
// and stays off the hints' own chunk: a forgotten hint shows again from the next battle on.

/** A hint's seen key. */
export const hintSeenKey = (id: string): string => `cot.hint.${id}.v1`;
const SEEN_KEY_RE = /^cot\.hint\.[A-Za-z0-9_-]+\.v1$/;

function seenKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && SEEN_KEY_RE.test(key) && localStorage.getItem(key) === 'seen') keys.push(key);
    }
  } catch { /* storage off: nothing is remembered, so nothing to forget */ }
  return keys;
}

/** How many first-use hints the player has seen. */
export function seenHintCount(): number {
  return seenKeys().length;
}

/** Forget every seen hint: each shows again at its moment, from the next battle on. */
export function forgetSeenHints(): void {
  for (const key of seenKeys()) {
    try { localStorage.removeItem(key); } catch { /* storage refused: the record stands */ }
  }
}
