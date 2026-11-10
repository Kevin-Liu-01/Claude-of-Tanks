// pad-states.mjs — the phone controller's state words the harnesses compare against, imported from their owners in
// src/pad (round 8 Y5 s6-04, after the 2026-11-02 audit's S3 for the multiplayer words, tools/mp-states.mjs). The pad
// harnesses (tools/pad-e2e.browser.mjs, tools/couch-e2e.browser.mjs) spelled 'live', 'here', 'shown' ... as string
// literals, so a renamed state in src/pad read as a timeout or a failed check naming the wrong cause. Each vocabulary
// here is its owner's runtime list, and reading a word it does not have throws by name. Page functions cannot import
// this module: the harnesses pass the words in as arguments. tools/pad-states.selftest.mjs pins every list to its type
// and keeps the harnesses free of the literals.
import { PAD_LINK_KINDS, PAD_LINK_PATHS, PAD_PHONE_STATES } from '../src/pad/padLink.ts';
import { PAD_SEAT_STATES, PAD_TOUR_STATES } from '../src/pad/padProtocol.ts';
import { PAD_GUN_STATES } from '../src/pad/padReadyBuzz.ts';

/** `{ word: 'word' }` for each word of an owner's list; any other name throws (a typo, or a word the owner dropped). */
function vocabulary(name, words) {
  const table = Object.freeze(Object.fromEntries(words.map((word) => [word, word])));
  return new Proxy(table, {
    get(target, key) {
      if (typeof key !== 'string' || key in target || key === 'then' || key === 'toJSON') return Reflect.get(target, key);
      throw new Error(`pad-states: ${name} has no state ${key} (${words.join(', ')})`);
    },
  });
}

/** A link's kind (src/pad/padLink.ts PadLinkState): the desktop's `__COT_PAD.state` and each lobby seat's `__COT_PAD_SEATS[n].state`. */
export const PAD_LINK_STATE = vocabulary('PadLinkKind', PAD_LINK_KINDS);
/** The path a live link carries frames over (PadLinkPath): `__COT_PAD.path`. */
export const PAD_LINK_PATH = vocabulary('PadLinkPath', PAD_LINK_PATHS);
/** The phone page's diagnostics state (PadPhoneState: 'join', then its link's kind): `__COT_PAD_PHONE.state`. */
export const PAD_PHONE_STATE = vocabulary('PadPhoneState', PAD_PHONE_STATES);
/** A couch lobby seat's presence (src/pad/padProtocol.ts PadSeatState): the lobby's `.cot-couch-seat[data-state]`. */
export const PAD_SEAT_STATE = vocabulary('PadSeatState', PAD_SEAT_STATES);
/** The controls guide on the phone (PadTourState): `__COT_PAD_PHONE.tour`, and how it last ended. */
export const PAD_TOUR_STATE = vocabulary('PadTourState', PAD_TOUR_STATES);
/** The gun as the phone's panel shows it (src/pad/padReadyBuzz.ts PadGunState): `.pad-ctl[data-state]`. */
export const PAD_GUN_STATE = vocabulary('PadGunState', PAD_GUN_STATES);
