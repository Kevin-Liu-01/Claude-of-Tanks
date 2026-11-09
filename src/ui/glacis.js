/*!
 * Glacis 1.100, a chamfered block typeface by Kevin Liu.
 * Copyright 2026 Kevin Liu (https://powerlifting.kevinliu.studio/brand). SIL Open Font License 1.1, https://openfontlicense.org
 *
 * A zero-dependency ES module for code that draws text itself (canvas,
 * SVG, Three.js) with nothing to load. Its outlines are the font files' own.
 * Written by `pnpm font` from lib/brand/letters.ts; edit those, not this.
 *
 * Coordinates in GLYPHS: font units (UPM to the em), y down, origin at the
 * left edge of the glyph's advance on the baseline. Caps run from
 * y = -CAP_HEIGHT to 0; accents rise to -910 and the underscore falls to 168.
 * Outers wind clockwise on screen and are each followed by their counters.
 */

/** Font units to the em. */
export const UPM = 1000;
/** Cap height in font units. */
export const CAP_HEIGHT = 700;
/** Line ascender in font units (y up). */
export const ASCENDER = 920;
/** Line descender in font units (y up, so negative). */
export const DESCENDER = -220;

/**
 * Every glyph by name: its advance width and its outline as SVG path data.
 * Digits also come as "zero.tnum" and so on, centred on one shared advance.
 * The ss01 alternates (the `alternates` option) are "four.ss01",
 * "four.tnum.ss01", "A.ss01" and the accented As, "Agrave.ss01" and so on.
 * @type {Readonly<Record<string, { advance: number, d: string }>>}
 */
export const GLYPHS = {
  ".notdef": { advance: 476, d: "M126 -700L350 -700L448 -602L448 -98L350 0L126 0L28 -98L28 -602ZM112 -574L112 -126L154 -84L322 -84L364 -126L364 -574L322 -616L154 -616Z" },
  "space": { advance: 266, d: "" },
  "exclam": { advance: 196, d: "M28 -700L168 -700L140 -224L56 -224ZM28 -140L168 -140L168 0L28 0Z" },
  "quotedbl": { advance: 350, d: "M28 -700L154 -700L119 -462L63 -462ZM196 -700L322 -700L287 -462L231 -462Z" },
  "numbersign": { advance: 546, d: "M98 -700L224 -700L224 -546L322 -546L322 -700L448 -700L448 -546L518 -546L518 -420L448 -420L448 -280L518 -280L518 -154L448 -154L448 0L322 0L322 -154L224 -154L224 0L98 0L98 -154L28 -154L28 -280L98 -280L98 -420L28 -420L28 -546L98 -546ZM224 -280L322 -280L322 -420L224 -420Z" },
  "percent": { advance: 672, d: "M84 -700L182 -700L238 -644L238 -462L182 -406L84 -406L28 -462L28 -644ZM105 -476L161 -476L161 -630L105 -630ZM392 -700L518 -700L280 0L154 0ZM490 -294L588 -294L644 -238L644 -56L588 0L490 0L434 -56L434 -238ZM511 -70L567 -70L567 -224L511 -224Z" },
  "ampersand": { advance: 616, d: "M378 -700L462 -616L462 -462L336 -336L420 -252L462 -294L588 -294L588 -238L504 -154L588 -70L588 0L434 0L392 -56L336 0L126 0L28 -98L28 -266L126 -364L70 -420L70 -616L154 -700ZM210 -490L266 -434L322 -490L322 -567L210 -567ZM182 -133L266 -133L322 -182L224 -280L182 -238Z" },
  "quotesingle": { advance: 182, d: "M28 -700L154 -700L119 -462L63 -462Z" },
  "parenleft": { advance: 280, d: "M112 -714L252 -714L168 -532L168 -168L252 14L112 14L28 -168L28 -532Z" },
  "parenright": { advance: 280, d: "M252 -532L252 -168L168 14L28 14L112 -168L112 -532L28 -714L168 -714Z" },
  "asterisk": { advance: 392, d: "M144 -700L249 -700L249 -630L309 -665L362 -574L301 -539L362 -504L309 -413L249 -448L249 -378L144 -378L144 -448L83 -413L30 -504L91 -539L30 -574L83 -665L144 -630Z" },
  "plus": { advance: 448, d: "M154 -546L294 -546L294 -413L420 -413L420 -287L294 -287L294 -154L154 -154L154 -287L28 -287L28 -413L154 -413Z" },
  "comma": { advance: 196, d: "M28 -140L168 -140L168 0L98 98L42 98L84 0L28 0Z" },
  "hyphen": { advance: 322, d: "M28 -413L294 -413L294 -287L28 -287Z" },
  "period": { advance: 196, d: "M28 -140L168 -140L168 0L28 0Z" },
  "slash": { advance: 420, d: "M266 -700L392 -700L154 0L28 0Z" },
  "zero": { advance: 546, d: "M126 -700L420 -700L518 -602L518 -98L420 0L126 0L28 -98L28 -602ZM182 -525L182 -175L224 -133L322 -133L364 -175L364 -525L322 -567L224 -567Z" },
  "one": { advance: 308, d: "M28 -616L112 -700L280 -700L280 0L126 0L126 -532L28 -532Z" },
  "two": { advance: 546, d: "M28 -602L126 -700L420 -700L518 -602L518 -385L420 -287L182 -287L182 -133L518 -133L518 0L28 0L28 -315L126 -413L364 -413L364 -567L182 -567L182 -476L28 -476Z" },
  "three": { advance: 546, d: "M28 -602L126 -700L420 -700L518 -602L518 -406L469 -350L518 -294L518 -98L420 0L126 0L28 -98L28 -224L182 -224L182 -133L364 -133L364 -287L140 -287L140 -413L364 -413L364 -567L182 -567L182 -476L28 -476Z" },
  "four": { advance: 560, d: "M28 -700L182 -700L182 -392L378 -392L378 -700L532 -700L532 0L378 0L378 -259L28 -259Z" },
  "five": { advance: 546, d: "M28 -700L518 -700L518 -567L182 -567L182 -413L420 -413L518 -315L518 -98L420 0L126 0L28 -98L28 -224L182 -224L182 -133L364 -133L364 -287L28 -287Z" },
  "six": { advance: 560, d: "M126 -700L434 -700L532 -602L532 -476L378 -476L378 -567L182 -567L182 -413L434 -413L532 -315L532 -98L434 0L126 0L28 -98L28 -602ZM182 -133L378 -133L378 -287L182 -287Z" },
  "seven": { advance: 518, d: "M28 -700L490 -700L490 -532L294 0L126 0L322 -567L28 -567Z" },
  "eight": { advance: 560, d: "M126 -700L434 -700L532 -602L532 -406L483 -350L532 -294L532 -98L434 0L126 0L28 -98L28 -294L77 -350L28 -406L28 -602ZM182 -413L378 -413L378 -567L182 -567ZM182 -133L378 -133L378 -287L182 -287Z" },
  "nine": { advance: 560, d: "M434 0L126 0L28 -98L28 -224L182 -224L182 -133L378 -133L378 -287L126 -287L28 -385L28 -602L126 -700L434 -700L532 -602L532 -98ZM378 -567L182 -567L182 -413L378 -413Z" },
  "colon": { advance: 196, d: "M28 -546L168 -546L168 -406L28 -406ZM28 -294L168 -294L168 -154L28 -154Z" },
  "semicolon": { advance: 196, d: "M28 -546L168 -546L168 -406L28 -406ZM28 -294L168 -294L168 -154L98 -56L42 -56L84 -154L28 -154Z" },
  "equal": { advance: 448, d: "M28 -532L420 -532L420 -406L28 -406ZM28 -294L420 -294L420 -168L28 -168Z" },
  "question": { advance: 504, d: "M28 -602L126 -700L378 -700L476 -602L476 -385L378 -287L322 -287L322 -224L182 -224L182 -413L322 -413L322 -567L182 -567L182 -476L28 -476ZM182 -140L322 -140L322 0L182 0Z" },
  "A": { advance: 588, d: "M28 -602L126 -700L462 -700L560 -602L560 0L406 0L406 -266L182 -266L182 0L28 0ZM182 -392L406 -392L406 -567L182 -567Z" },
  "B": { advance: 574, d: "M28 -700L448 -700L546 -602L546 -406L497 -350L546 -294L546 -98L448 0L28 0ZM182 -413L392 -413L392 -567L182 -567ZM182 -133L392 -133L392 -287L182 -287Z" },
  "C": { advance: 560, d: "M126 -700L434 -700L532 -602L532 -462L378 -462L378 -567L224 -567L182 -525L182 -175L224 -133L378 -133L378 -238L532 -238L532 -98L434 0L126 0L28 -98L28 -602Z" },
  "D": { advance: 588, d: "M28 -700L420 -700L560 -560L560 -140L420 0L28 0ZM182 -133L350 -133L406 -189L406 -511L350 -567L182 -567Z" },
  "E": { advance: 490, d: "M28 -700L462 -700L462 -567L182 -567L182 -413L406 -413L406 -287L182 -287L182 -133L462 -133L462 0L28 0Z" },
  "F": { advance: 476, d: "M28 -700L448 -700L448 -567L182 -567L182 -413L392 -413L392 -287L182 -287L182 0L28 0Z" },
  "G": { advance: 574, d: "M126 -700L448 -700L546 -602L546 -476L392 -476L392 -567L224 -567L182 -525L182 -175L224 -133L392 -133L392 -266L280 -266L280 -392L546 -392L546 -98L448 0L126 0L28 -98L28 -602Z" },
  "H": { advance: 574, d: "M28 -700L182 -700L182 -413L392 -413L392 -700L546 -700L546 0L392 0L392 -287L182 -287L182 0L28 0Z" },
  "I": { advance: 210, d: "M28 -700L182 -700L182 0L28 0Z" },
  "J": { advance: 518, d: "M336 -700L490 -700L490 -98L392 0L126 0L28 -98L28 -252L182 -252L182 -133L336 -133Z" },
  "K": { advance: 574, d: "M28 -700L182 -700L182 -434L357 -700L546 -700L350 -350L546 0L357 0L182 -266L182 0L28 0Z" },
  "L": { advance: 462, d: "M28 -700L182 -700L182 -133L434 -133L434 0L28 0Z" },
  "M": { advance: 728, d: "M28 -700L238 -700L364 -378L490 -700L700 -700L700 0L546 0L546 -420L427 -140L301 -140L182 -420L182 0L28 0Z" },
  "N": { advance: 588, d: "M28 -700L252 -700L406 -294L406 -700L560 -700L560 0L336 0L182 -406L182 0L28 0Z" },
  "O": { advance: 588, d: "M126 -700L462 -700L560 -602L560 -98L462 0L126 0L28 -98L28 -602ZM182 -525L182 -175L224 -133L364 -133L406 -175L406 -525L364 -567L224 -567Z" },
  "P": { advance: 560, d: "M28 -700L434 -700L532 -602L532 -364L434 -266L182 -266L182 0L28 0ZM182 -399L336 -399L378 -441L378 -525L336 -567L182 -567Z" },
  "Q": { advance: 588, d: "M126 -700L462 -700L560 -602L560 -98L522 -60L588 56L448 56L416 0L126 0L28 -98L28 -602ZM280 -238L406 -238L406 -525L364 -567L224 -567L182 -525L182 -175L224 -133L340 -133Z" },
  "R": { advance: 574, d: "M28 -700L448 -700L546 -602L546 -392L490 -343L546 -294L546 0L392 0L392 -280L182 -280L182 0L28 0ZM182 -413L392 -413L392 -525L350 -567L182 -567Z" },
  "S": { advance: 560, d: "M126 -700L434 -700L532 -602L532 -476L378 -476L378 -567L182 -567L182 -413L434 -413L532 -315L532 -98L434 0L126 0L28 -98L28 -224L182 -224L182 -133L378 -133L378 -287L126 -287L28 -385L28 -602Z" },
  "T": { advance: 546, d: "M28 -700L518 -700L518 -567L350 -567L350 0L196 0L196 -567L28 -567Z" },
  "U": { advance: 574, d: "M28 -700L182 -700L182 -133L392 -133L392 -700L546 -700L546 -98L448 0L126 0L28 -98Z" },
  "V": { advance: 602, d: "M28 -700L196 -700L301 -308L406 -700L574 -700L385 0L217 0Z" },
  "W": { advance: 784, d: "M28 -700L182 -700L238 -280L308 -644L476 -644L546 -280L602 -700L756 -700L658 0L490 0L392 -322L294 0L126 0Z" },
  "X": { advance: 602, d: "M28 -700L210 -700L301 -462L392 -700L574 -700L420 -350L574 0L392 0L301 -238L210 0L28 0L182 -350Z" },
  "Y": { advance: 602, d: "M28 -700L210 -700L301 -462L392 -700L574 -700L378 -294L378 0L224 0L224 -294Z" },
  "Z": { advance: 532, d: "M28 -700L504 -700L504 -567L238 -133L504 -133L504 0L28 0L28 -133L294 -567L28 -567Z" },
  "underscore": { advance: 476, d: "M28 42L448 42L448 168L28 168Z" },
  "grave": { advance: 294, d: "M28 -868L168 -868L266 -742L126 -742Z" },
  "exclamdown": { advance: 196, d: "M168 -560L28 -560L28 -700L168 -700ZM168 0L28 0L56 -476L140 -476Z" },
  "dieresis": { advance: 378, d: "M28 -861L147 -861L147 -742L28 -742ZM231 -861L350 -861L350 -742L231 -742Z" },
  "degree": { advance: 280, d: "M84 -700L196 -700L252 -644L252 -532L196 -476L84 -476L28 -532L28 -644ZM105 -553L175 -553L175 -623L105 -623Z" },
  "acute": { advance: 294, d: "M126 -868L266 -868L168 -742L28 -742Z" },
  "periodcentered": { advance: 182, d: "M28 -350L91 -413L154 -350L91 -287Z" },
  "cedilla": { advance: 210, d: "M98 -28L182 -28L182 84L147 119L28 119L28 56L98 56Z" },
  "questiondown": { advance: 504, d: "M322 -560L182 -560L182 -700L322 -700ZM476 -98L378 0L126 0L28 -98L28 -315L126 -413L182 -413L182 -476L322 -476L322 -287L182 -287L182 -133L322 -133L322 -224L476 -224Z" },
  "Agrave": { advance: 588, d: "M175 -868L315 -868L413 -742L273 -742ZM28 -602L126 -700L462 -700L560 -602L560 0L406 0L406 -266L182 -266L182 0L28 0ZM182 -392L406 -392L406 -567L182 -567Z" },
  "Aacute": { advance: 588, d: "M273 -868L413 -868L315 -742L175 -742ZM28 -602L126 -700L462 -700L560 -602L560 0L406 0L406 -266L182 -266L182 0L28 0ZM182 -392L406 -392L406 -567L182 -567Z" },
  "Acircumflex": { advance: 588, d: "M140 -742L238 -882L350 -882L448 -742L336 -742L294 -805L252 -742ZM28 -602L126 -700L462 -700L560 -602L560 0L406 0L406 -266L182 -266L182 0L28 0ZM182 -392L406 -392L406 -567L182 -567Z" },
  "Atilde": { advance: 588, d: "M154 -833L203 -882L252 -882L336 -833L385 -833L434 -882L434 -791L385 -742L336 -742L252 -791L203 -791L154 -742ZM28 -602L126 -700L462 -700L560 -602L560 0L406 0L406 -266L182 -266L182 0L28 0ZM182 -392L406 -392L406 -567L182 -567Z" },
  "Adieresis": { advance: 588, d: "M133 -861L252 -861L252 -742L133 -742ZM336 -861L455 -861L455 -742L336 -742ZM28 -602L126 -700L462 -700L560 -602L560 0L406 0L406 -266L182 -266L182 0L28 0ZM182 -392L406 -392L406 -567L182 -567Z" },
  "Aring": { advance: 588, d: "M238 -910L350 -910L399 -861L399 -791L350 -742L238 -742L189 -791L189 -861ZM259 -798L329 -798L329 -854L259 -854ZM28 -602L126 -700L462 -700L560 -602L560 0L406 0L406 -266L182 -266L182 0L28 0ZM182 -392L406 -392L406 -567L182 -567Z" },
  "AE": { advance: 812, d: "M28 -602L126 -700L784 -700L784 -567L532 -567L532 -413L728 -413L728 -287L532 -287L532 -133L784 -133L784 0L378 0L378 -287L182 -287L182 0L28 0ZM182 -413L378 -413L378 -567L182 -567Z" },
  "Ccedilla": { advance: 560, d: "M126 -700L434 -700L532 -602L532 -462L378 -462L378 -567L224 -567L182 -525L182 -175L224 -133L378 -133L378 -238L532 -238L532 -98L434 0L357 0L357 84L322 119L203 119L203 56L273 56L273 0L126 0L28 -98L28 -602Z" },
  "Egrave": { advance: 490, d: "M112 -868L252 -868L350 -742L210 -742ZM28 -700L462 -700L462 -567L182 -567L182 -413L406 -413L406 -287L182 -287L182 -133L462 -133L462 0L28 0Z" },
  "Eacute": { advance: 490, d: "M210 -868L350 -868L252 -742L112 -742ZM28 -700L462 -700L462 -567L182 -567L182 -413L406 -413L406 -287L182 -287L182 -133L462 -133L462 0L28 0Z" },
  "Ecircumflex": { advance: 490, d: "M77 -742L175 -882L287 -882L385 -742L273 -742L231 -805L189 -742ZM28 -700L462 -700L462 -567L182 -567L182 -413L406 -413L406 -287L182 -287L182 -133L462 -133L462 0L28 0Z" },
  "Edieresis": { advance: 490, d: "M70 -861L189 -861L189 -742L70 -742ZM273 -861L392 -861L392 -742L273 -742ZM28 -700L462 -700L462 -567L182 -567L182 -413L406 -413L406 -287L182 -287L182 -133L462 -133L462 0L28 0Z" },
  "Igrave": { advance: 210, d: "M-14 -868L126 -868L224 -742L84 -742ZM28 -700L182 -700L182 0L28 0Z" },
  "Iacute": { advance: 210, d: "M84 -868L224 -868L126 -742L-14 -742ZM28 -700L182 -700L182 0L28 0Z" },
  "Icircumflex": { advance: 210, d: "M-49 -742L49 -882L161 -882L259 -742L147 -742L105 -805L63 -742ZM28 -700L182 -700L182 0L28 0Z" },
  "Idieresis": { advance: 210, d: "M-56 -861L63 -861L63 -742L-56 -742ZM147 -861L266 -861L266 -742L147 -742ZM28 -700L182 -700L182 0L28 0Z" },
  "Ntilde": { advance: 588, d: "M154 -833L203 -882L252 -882L336 -833L385 -833L434 -882L434 -791L385 -742L336 -742L252 -791L203 -791L154 -742ZM28 -700L252 -700L406 -294L406 -700L560 -700L560 0L336 0L182 -406L182 0L28 0Z" },
  "Ograve": { advance: 588, d: "M175 -868L315 -868L413 -742L273 -742ZM126 -700L462 -700L560 -602L560 -98L462 0L126 0L28 -98L28 -602ZM182 -525L182 -175L224 -133L364 -133L406 -175L406 -525L364 -567L224 -567Z" },
  "Oacute": { advance: 588, d: "M273 -868L413 -868L315 -742L175 -742ZM126 -700L462 -700L560 -602L560 -98L462 0L126 0L28 -98L28 -602ZM182 -525L182 -175L224 -133L364 -133L406 -175L406 -525L364 -567L224 -567Z" },
  "Ocircumflex": { advance: 588, d: "M140 -742L238 -882L350 -882L448 -742L336 -742L294 -805L252 -742ZM126 -700L462 -700L560 -602L560 -98L462 0L126 0L28 -98L28 -602ZM182 -525L182 -175L224 -133L364 -133L406 -175L406 -525L364 -567L224 -567Z" },
  "Otilde": { advance: 588, d: "M154 -833L203 -882L252 -882L336 -833L385 -833L434 -882L434 -791L385 -742L336 -742L252 -791L203 -791L154 -742ZM126 -700L462 -700L560 -602L560 -98L462 0L126 0L28 -98L28 -602ZM182 -525L182 -175L224 -133L364 -133L406 -175L406 -525L364 -567L224 -567Z" },
  "Odieresis": { advance: 588, d: "M133 -861L252 -861L252 -742L133 -742ZM336 -861L455 -861L455 -742L336 -742ZM126 -700L462 -700L560 -602L560 -98L462 0L126 0L28 -98L28 -602ZM182 -525L182 -175L224 -133L364 -133L406 -175L406 -525L364 -567L224 -567Z" },
  "multiply": { advance: 434, d: "M308 -539L406 -441L315 -350L406 -259L308 -161L217 -252L126 -161L28 -259L119 -350L28 -441L126 -539L217 -448Z" },
  "Oslash": { advance: 588, d: "M126 -700L462 -700L560 -602L560 -98L462 0L126 0L28 -98L28 -602ZM406 -513L292 -133L364 -133L406 -175ZM182 -187L296 -567L224 -567L182 -525Z" },
  "Ugrave": { advance: 574, d: "M168 -868L308 -868L406 -742L266 -742ZM28 -700L182 -700L182 -133L392 -133L392 -700L546 -700L546 -98L448 0L126 0L28 -98Z" },
  "Uacute": { advance: 574, d: "M266 -868L406 -868L308 -742L168 -742ZM28 -700L182 -700L182 -133L392 -133L392 -700L546 -700L546 -98L448 0L126 0L28 -98Z" },
  "Ucircumflex": { advance: 574, d: "M133 -742L231 -882L343 -882L441 -742L329 -742L287 -805L245 -742ZM28 -700L182 -700L182 -133L392 -133L392 -700L546 -700L546 -98L448 0L126 0L28 -98Z" },
  "Udieresis": { advance: 574, d: "M126 -861L245 -861L245 -742L126 -742ZM329 -861L448 -861L448 -742L329 -742ZM28 -700L182 -700L182 -133L392 -133L392 -700L546 -700L546 -98L448 0L126 0L28 -98Z" },
  "Yacute": { advance: 602, d: "M280 -868L420 -868L322 -742L182 -742ZM28 -700L210 -700L301 -462L392 -700L574 -700L378 -294L378 0L224 0L224 -294Z" },
  "OE": { advance: 826, d: "M126 -700L798 -700L798 -567L546 -567L546 -413L742 -413L742 -287L546 -287L546 -133L798 -133L798 0L126 0L28 -98L28 -602ZM182 -525L182 -175L224 -133L392 -133L392 -567L224 -567Z" },
  "Ydieresis": { advance: 602, d: "M140 -861L259 -861L259 -742L140 -742ZM343 -861L462 -861L462 -742L343 -742ZM28 -700L210 -700L301 -462L392 -700L574 -700L378 -294L378 0L224 0L224 -294Z" },
  "circumflex": { advance: 364, d: "M28 -742L126 -882L238 -882L336 -742L224 -742L182 -805L140 -742Z" },
  "ring": { advance: 266, d: "M77 -910L189 -910L238 -861L238 -791L189 -742L77 -742L28 -791L28 -861ZM98 -798L168 -798L168 -854L98 -854Z" },
  "tilde": { advance: 336, d: "M28 -833L77 -882L126 -882L210 -833L259 -833L308 -882L308 -791L259 -742L210 -742L126 -791L77 -791L28 -742Z" },
  "germandbls": { advance: 1120, d: "M126 -700L434 -700L532 -602L532 -476L378 -476L378 -567L182 -567L182 -413L434 -413L532 -315L532 -98L434 0L126 0L28 -98L28 -224L182 -224L182 -133L378 -133L378 -287L126 -287L28 -385L28 -602ZM686 -700L994 -700L1092 -602L1092 -476L938 -476L938 -567L742 -567L742 -413L994 -413L1092 -315L1092 -98L994 0L686 0L588 -98L588 -224L742 -224L742 -133L938 -133L938 -287L686 -287L588 -385L588 -602Z" },
  "zero.tnum": { advance: 560, d: "M133 -700L427 -700L525 -602L525 -98L427 0L133 0L35 -98L35 -602ZM189 -525L189 -175L231 -133L329 -133L371 -175L371 -525L329 -567L231 -567Z" },
  "one.tnum": { advance: 560, d: "M154 -616L238 -700L406 -700L406 0L252 0L252 -532L154 -532Z" },
  "two.tnum": { advance: 560, d: "M35 -602L133 -700L427 -700L525 -602L525 -385L427 -287L189 -287L189 -133L525 -133L525 0L35 0L35 -315L133 -413L371 -413L371 -567L189 -567L189 -476L35 -476Z" },
  "three.tnum": { advance: 560, d: "M35 -602L133 -700L427 -700L525 -602L525 -406L476 -350L525 -294L525 -98L427 0L133 0L35 -98L35 -224L189 -224L189 -133L371 -133L371 -287L147 -287L147 -413L371 -413L371 -567L189 -567L189 -476L35 -476Z" },
  "four.tnum": { advance: 560, d: "M28 -700L182 -700L182 -392L378 -392L378 -700L532 -700L532 0L378 0L378 -259L28 -259Z" },
  "five.tnum": { advance: 560, d: "M35 -700L525 -700L525 -567L189 -567L189 -413L427 -413L525 -315L525 -98L427 0L133 0L35 -98L35 -224L189 -224L189 -133L371 -133L371 -287L35 -287Z" },
  "six.tnum": { advance: 560, d: "M126 -700L434 -700L532 -602L532 -476L378 -476L378 -567L182 -567L182 -413L434 -413L532 -315L532 -98L434 0L126 0L28 -98L28 -602ZM182 -133L378 -133L378 -287L182 -287Z" },
  "seven.tnum": { advance: 560, d: "M49 -700L511 -700L511 -532L315 0L147 0L343 -567L49 -567Z" },
  "eight.tnum": { advance: 560, d: "M126 -700L434 -700L532 -602L532 -406L483 -350L532 -294L532 -98L434 0L126 0L28 -98L28 -294L77 -350L28 -406L28 -602ZM182 -413L378 -413L378 -567L182 -567ZM182 -133L378 -133L378 -287L182 -287Z" },
  "nine.tnum": { advance: 560, d: "M434 0L126 0L28 -98L28 -224L182 -224L182 -133L378 -133L378 -287L126 -287L28 -385L28 -602L126 -700L434 -700L532 -602L532 -98ZM378 -567L182 -567L182 -413L378 -413Z" },
  "uni2007": { advance: 560, d: "" },
  "uni2009": { advance: 133, d: "" },
  "four.ss01": { advance: 560, d: "M378 -700L532 -700L532 0L378 0L378 -217L28 -217L28 -350ZM252 -350L378 -350L378 -476Z" },
  "four.tnum.ss01": { advance: 560, d: "M378 -700L532 -700L532 0L378 0L378 -217L28 -217L28 -350ZM252 -350L378 -350L378 -476Z" },
  "A.ss01": { advance: 588, d: "M210 -700L378 -700L560 0L392 0L356 -140L232 -140L196 0L28 0ZM265 -266L323 -266L294 -378Z" },
  "Agrave.ss01": { advance: 588, d: "M175 -868L315 -868L413 -742L273 -742ZM210 -700L378 -700L560 0L392 0L356 -140L232 -140L196 0L28 0ZM265 -266L323 -266L294 -378Z" },
  "Aacute.ss01": { advance: 588, d: "M273 -868L413 -868L315 -742L175 -742ZM210 -700L378 -700L560 0L392 0L356 -140L232 -140L196 0L28 0ZM265 -266L323 -266L294 -378Z" },
  "Acircumflex.ss01": { advance: 588, d: "M140 -742L238 -882L350 -882L448 -742L336 -742L294 -805L252 -742ZM210 -700L378 -700L560 0L392 0L356 -140L232 -140L196 0L28 0ZM265 -266L323 -266L294 -378Z" },
  "Atilde.ss01": { advance: 588, d: "M154 -833L203 -882L252 -882L336 -833L385 -833L434 -882L434 -791L385 -742L336 -742L252 -791L203 -791L154 -742ZM210 -700L378 -700L560 0L392 0L356 -140L232 -140L196 0L28 0ZM265 -266L323 -266L294 -378Z" },
  "Adieresis.ss01": { advance: 588, d: "M133 -861L252 -861L252 -742L133 -742ZM336 -861L455 -861L455 -742L336 -742ZM210 -700L378 -700L560 0L392 0L356 -140L232 -140L196 0L28 0ZM265 -266L323 -266L294 -378Z" },
  "Aring.ss01": { advance: 588, d: "M238 -910L350 -910L399 -861L399 -791L350 -742L238 -742L189 -791L189 -861ZM259 -798L329 -798L329 -854L259 -854ZM210 -700L378 -700L560 0L392 0L356 -140L232 -140L196 0L28 0ZM265 -266L323 -266L294 -378Z" },
};

/**
 * Code point to glyph name, as in the font's cmap: the capitals, their
 * lowercase, accented letters both cases, the signs, spaces and quotes.
 * @type {Readonly<Record<number, string>>}
 */
export const CMAP = {
  32: "space", 33: "exclam", 34: "quotedbl", 35: "numbersign", 37: "percent", 38: "ampersand", 39: "quotesingle", 40: "parenleft", 41: "parenright", 42: "asterisk",
  43: "plus", 44: "comma", 45: "hyphen", 46: "period", 47: "slash", 48: "zero", 49: "one", 50: "two", 51: "three", 52: "four",
  53: "five", 54: "six", 55: "seven", 56: "eight", 57: "nine", 58: "colon", 59: "semicolon", 61: "equal", 63: "question", 65: "A",
  66: "B", 67: "C", 68: "D", 69: "E", 70: "F", 71: "G", 72: "H", 73: "I", 74: "J", 75: "K",
  76: "L", 77: "M", 78: "N", 79: "O", 80: "P", 81: "Q", 82: "R", 83: "S", 84: "T", 85: "U",
  86: "V", 87: "W", 88: "X", 89: "Y", 90: "Z", 95: "underscore", 96: "grave", 97: "A", 98: "B", 99: "C",
  100: "D", 101: "E", 102: "F", 103: "G", 104: "H", 105: "I", 106: "J", 107: "K", 108: "L", 109: "M",
  110: "N", 111: "O", 112: "P", 113: "Q", 114: "R", 115: "S", 116: "T", 117: "U", 118: "V", 119: "W",
  120: "X", 121: "Y", 122: "Z", 160: "space", 161: "exclamdown", 168: "dieresis", 176: "degree", 180: "acute", 183: "periodcentered", 184: "cedilla",
  191: "questiondown", 192: "Agrave", 193: "Aacute", 194: "Acircumflex", 195: "Atilde", 196: "Adieresis", 197: "Aring", 198: "AE", 199: "Ccedilla", 200: "Egrave",
  201: "Eacute", 202: "Ecircumflex", 203: "Edieresis", 204: "Igrave", 205: "Iacute", 206: "Icircumflex", 207: "Idieresis", 209: "Ntilde", 210: "Ograve", 211: "Oacute",
  212: "Ocircumflex", 213: "Otilde", 214: "Odieresis", 215: "multiply", 216: "Oslash", 217: "Ugrave", 218: "Uacute", 219: "Ucircumflex", 220: "Udieresis", 221: "Yacute",
  223: "germandbls", 224: "Agrave", 225: "Aacute", 226: "Acircumflex", 227: "Atilde", 228: "Adieresis", 229: "Aring", 230: "AE", 231: "Ccedilla", 232: "Egrave",
  233: "Eacute", 234: "Ecircumflex", 235: "Edieresis", 236: "Igrave", 237: "Iacute", 238: "Icircumflex", 239: "Idieresis", 241: "Ntilde", 242: "Ograve", 243: "Oacute",
  244: "Ocircumflex", 245: "Otilde", 246: "Odieresis", 248: "Oslash", 249: "Ugrave", 250: "Uacute", 251: "Ucircumflex", 252: "Udieresis", 253: "Yacute", 255: "Ydieresis",
  305: "I", 338: "OE", 339: "OE", 376: "Ydieresis", 383: "S", 710: "circumflex", 730: "ring", 732: "tilde", 8199: "uni2007", 8201: "uni2009",
  8208: "hyphen", 8209: "hyphen", 8216: "quotesingle", 8217: "quotesingle", 8220: "quotedbl", 8221: "quotedbl", 8239: "uni2009",
};

// The functions of glacis.js. scripts/font.ts writes the glyph data above this
// code and the two ship as one file; this part has no data of its own.

/**
 * @typedef {object} Options
 * @property {number} [size] Font size (the em) in output units, as in CSS. Caps stand 0.7 × size. Default 1000, so output is in font units.
 * @property {number} [tracking] Extra space between glyphs, in thousandths of the em (CSS letter-spacing × 1000). Default 0.
 * @property {boolean} [tabular] Set the figures on one shared advance (the font's tnum), so counters and timers never jitter. Default false.
 * @property {boolean} [alternates] Set the font's stylistic set 1 (ss01): a closed 4 and a pointed A (À Á Â Ã Ä Å too), on the defaults' advances. Painted small, the open 4 reads as H or Ч and the flat-topped A as R; these do not. Default false.
 * @property {"left" | "center" | "right"} [align] Where the anchor sits on the run. Default "left".
 * @property {"alphabetic" | "top" | "middle"} [baseline] What the anchor's y is: the baseline, the top of the caps, or halfway up the caps. Default "alphabetic".
 */

/**
 * @typedef {object} Placed
 * @property {string} char The character as set (after upper-casing).
 * @property {string} name Its glyph name in GLYPHS.
 * @property {number} x Pen position of the glyph's left edge, in output units.
 * @property {number} y Baseline of the glyph, in output units (y down).
 * @property {number} advance Advance width in output units.
 */

/**
 * @typedef {object} Layout
 * @property {string} d SVG path data for the whole run, y down, nonzero or evenodd fill alike.
 * @property {number} width Advance width of the run (side bearings included, tracking between glyphs only).
 * @property {number} capHeight Cap height in output units.
 * @property {Placed[]} glyphs Each glyph and where it sits.
 * @property {string[]} missing Characters Glacis does not have; each set as a space.
 */

/**
 * @typedef {object} Shape
 * @property {string} char The character this shape belongs to.
 * @property {[number, number][]} outer The outline, y up.
 * @property {[number, number][][]} holes Its counters, y up.
 */

/** @type {Map<string, [number, number][][]>} */
const contourCache = new Map();

/**
 * @param {string} name
 * @returns {[number, number][][]}
 */
function contoursOf(name) {
  let cs = contourCache.get(name);
  if (!cs) {
    cs = [];
    for (const part of GLYPHS[name].d.split("Z")) {
      const n = part.match(/-?\d+(\.\d+)?/g);
      if (!n) continue;
      /** @type {[number, number][]} */
      const c = [];
      for (let i = 0; i < n.length; i += 2) c.push([+n[i], +n[i + 1]]);
      cs.push(c);
    }
    contourCache.set(name, cs);
  }
  return cs;
}

const r3 = (/** @type {number} */ v) => Math.round(v * 1000) / 1000 + 0; // + 0 turns -0 into 0

/**
 * Lays a string out on one line. The text is upper-cased and NFC-normalised
 * first, so lowercase, decomposed accents and ß (as SS) all set.
 * @param {string} text
 * @param {Options} [opts]
 * @returns {Layout}
 */
export function layout(text, opts = {}) {
  const { size = UPM, tracking = 0, tabular = false, alternates = false, align = "left", baseline = "alphabetic" } = opts;
  const s = size / UPM;
  const chars = [...String(text).toUpperCase().normalize("NFC")];
  /** @type {string[]} */
  const missing = [];
  const set = chars.map((char) => {
    let name = CMAP[/** @type {number} */ (char.codePointAt(0))];
    if (!name) {
      missing.push(char);
      name = "space";
    }
    if (tabular && GLYPHS[name + ".tnum"]) name += ".tnum";
    if (alternates && GLYPHS[name + ".ss01"]) name += ".ss01";
    return { char, name };
  });
  let pen = 0;
  const xs = set.map((g, i) => {
    const x = pen;
    pen += GLYPHS[g.name].advance + (i < set.length - 1 ? tracking : 0);
    return x;
  });
  const width = r3(pen * s);
  const dx = align === "center" ? -width / 2 : align === "right" ? -width : 0;
  const dy = baseline === "top" ? CAP_HEIGHT * s : baseline === "middle" ? (CAP_HEIGHT * s) / 2 : 0;
  let d = "";
  const glyphs = set.map((g, i) => {
    const x = r3(dx + xs[i] * s);
    for (const c of contoursOf(g.name)) d += "M" + c.map(([px, py]) => `${r3(x + px * s)} ${r3(dy + py * s)}`).join("L") + "Z";
    return { char: g.char, name: g.name, x, y: r3(dy), advance: r3(GLYPHS[g.name].advance * s) };
  });
  return { d, width, capHeight: CAP_HEIGHT * s, glyphs, missing };
}

/**
 * Fills a string on a 2D canvas context (CanvasRenderingContext2D or
 * OffscreenCanvasRenderingContext2D) with its current fillStyle and
 * transform. Nothing to load first: the outlines are in this file.
 * `x`, `y` is the anchor: by default the left end of the baseline; set
 * `align` and `baseline` ("top" is the cap line, "middle" halfway up the caps)
 * to move it.
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {Options} [opts]
 * @returns {Layout}
 */
export function drawText(ctx, text, x, y, opts = {}) {
  const run = layout(text, opts);
  if (!run.d) return run;
  const s = (opts.size ?? UPM) / UPM;
  ctx.save();
  ctx.translate(x, y);
  // the whole run is one fill, so a shadow or a stroke never seams between glyphs
  if (typeof Path2D === "function") ctx.fill(new Path2D(run.d));
  else {
    ctx.beginPath();
    for (const g of run.glyphs)
      for (const c of contoursOf(g.name)) {
        c.forEach(([px, py], i) => (i ? ctx.lineTo(g.x + px * s, g.y + py * s) : ctx.moveTo(g.x + px * s, g.y + py * s)));
        ctx.closePath();
      }
    ctx.fill();
  }
  ctx.restore();
  return run;
}

/**
 * The run as filled shapes for 3D: one entry per outline with its counters,
 * y up (baseline at 0, caps above), ready for THREE.Shape and
 * THREE.ExtrudeGeometry. Takes the same options as layout().
 * @param {string} text
 * @param {Options} [opts]
 * @returns {Shape[]}
 */
export function shapes(text, opts = {}) {
  const run = layout(text, opts);
  const s = (opts.size ?? UPM) / UPM;
  /** @type {Shape[]} */
  const out = [];
  for (const g of run.glyphs) {
    /** @type {(p: [number, number]) => [number, number]} */
    const up = ([px, py]) => [r3(g.x + px * s), r3(-(g.y + py * s))];
    for (const c of contoursOf(g.name)) {
      // outers wind clockwise on screen (positive area, y down); each is followed by its counters
      let a = 0;
      for (let i = 0; i < c.length; i++) a += c[i][0] * c[(i + 1) % c.length][1] - c[(i + 1) % c.length][0] * c[i][1];
      if (a > 0) out.push({ char: g.char, outer: c.map(up), holes: [] });
      else out[out.length - 1].holes.push(c.map(up));
    }
  }
  return out;
}

/**
 * Whether Glacis sets every character of `text` (after upper-casing).
 * Use it to fall back to another face for scripts Glacis does not cover.
 * @param {string} text
 */
export function supports(text) {
  return layout(text).missing.length === 0;
}
