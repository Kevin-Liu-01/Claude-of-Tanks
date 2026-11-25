// The Garage search's matching (typing-keys-277; Main for 276.1). Once a space typed into the search reached it, "t 72 b3"
// matched nothing as one substring, where the swallowed space had made it "t72b3" and found the T-72B3s. A query is
// words: each must appear in the tank's searchable text, case- and diacritic-insensitive, and a word also matches across
// the text's separators ("t72" finds "T-72"), so "t 72 b3", "T-72B3", "t72b3" and "b3 t72" find the same tanks.
// src/game/typingKeys.selftest.mjs runs it over the fleet. Copyright © 2026 Kevin B. Liu.

/** A tank's searchable text, folded once per Garage. */
interface RosterSearchEntry {
  /** Folded: lower case, no diacritics. */
  readonly text: string;
  /** The folded text with its separators removed, so a word matches across them. */
  readonly joined: string;
}

const fold = (value: string): string => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');
const join = (value: string): string => value.replace(/[^\p{L}\p{N}]+/gu, '');

/** The entry for a set of names. */
function rosterSearchEntry(parts: ReadonlyArray<string | null | undefined>): RosterSearchEntry {
  const text = fold(parts.filter(Boolean).join(' '));
  return Object.freeze({ text, joined: join(text) });
}

/** The parts of a tank spec the search reads. */
interface RosterSearchSpec {
  readonly id: string;
  readonly name?: string;
  readonly label?: { readonly displayName?: string; readonly shortName?: string } | null;
}

/** A tank's entry: its display and short names, its name and its id (underscores as spaces). */
export function rosterSearchEntryForSpec(spec: RosterSearchSpec): RosterSearchEntry {
  return rosterSearchEntry([spec.label?.displayName, spec.label?.shortName, spec.name, spec.id.replace(/_/g, ' ')]);
}

/** The words of a query, folded; none for a blank one. */
export function rosterQueryWords(query: string): readonly string[] {
  return fold(query).split(/\s+/u).filter(Boolean);
}

/** True when every word of the query appears in the entry, as written or across its separators. */
export function rosterSearchMatches(entry: RosterSearchEntry | undefined, words: readonly string[]): boolean {
  if (!words.length) return true;
  if (!entry) return false;
  return words.every((word) => {
    if (entry.text.includes(word)) return true;
    const joined = join(word);
    return joined.length > 0 && entry.joined.includes(joined);
  });
}
