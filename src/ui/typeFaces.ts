/**
 * The product's one typeface source (owner ruling 2026-10-17). Copyright © 2026 Kevin B. Liu.
 * The faces themselves are third-party, SIL Open Font License 1.1 (docs/ATTRIBUTION.md, public/fonts/<face>/OFL.txt).
 *
 * Three voices, self-hosted as the Latin subsets their official distributions publish, byte for byte:
 *   display  Chakra Petch 500/600/700  Cadson Demak; Google Fonts' latin subset of google/fonts ofl/chakrapetch v1.000
 *   body     IBM Plex Sans 400/500/600 IBM; the split Latin1 WOFF2 of the IBM/plex release @ibm/plex-sans@1.1.0
 *   mono     IBM Plex Mono 400/500     IBM; the split Latin1 WOFF2 of the IBM/plex release @ibm/plex-mono@2.5.0
 * Plex carries the Reserved Font Name "Plex", so its files ship exactly as IBM built them (never re-subset here).
 * Chinese text uses the system CJK faces after the Latin face.
 * The accented letters the Plex Latin1 subsets lack (ā ē ī ō ū, ć ń ś ź and their capitals: Type 90 Kyū-maru, Raijū,
 * Type 96-80 Fēng, T-72 Ryś) come from 'Cot Accents', a 2 KB-per-weight OFL Modified Version under its own name, built
 * from Plex's own base glyphs and accents by tools/type/cot-accents.py. Chakra Petch composes them from its own
 * combining marks, so only the Plex weights need it.
 * The arrows and math marks those subsets lack (← ↑ → ↓ ≤ ≥ ∞) come from 'Cot Symbols', a 1 KB first-party face drawn
 * from Chakra Petch's own outlines (tools/type/cot-symbols.py; OFL 1.1, Chakra Petch has no Reserved Font Name). Its
 * unicode-range keeps it out of every download but a page that prints one of those marks.
 *
 * 'Cot UI' is the shell's weight-voiced family, so the game's existing weight hierarchy picks its voice with no
 * call-site churn and every weight it asks for is a real face:
 *   400 IBM Plex Sans Regular   reading text
 *   500 IBM Plex Sans Medium    the UI floor: controls, rows, sentence-case labels
 *   600 Chakra Petch SemiBold   the label voice: caps labels, tabs, chips (one or two words, never an eyebrow)
 *   700 Chakra Petch Bold       titles, buttons, the wordmark, display numerals
 * Readouts that tick in place take the `.num` class: IBM Plex Mono with tabular figures (Chakra Petch's figures are
 * proportional and it has no tnum feature). Reading emphasis inside prose keeps the body face (Plex Sans SemiBold).
 *
 * vite.config.ts expands each document's `<!--cot:type …-->` marker (expandTypeMarkers) into the preloads it names
 * and one `<style id="cot-font-faces">` holding only the families that page uses, their metric-matched fallbacks and
 * the rules every page shares (family tokens, `.num`, the zh-CN resets). The type scale and voices (`--fs-*`, `--t-*`)
 * and the display treatments (`.t-accent`, `.t-hollow`) are emitted only on documents that consume them.
 * Keep this module dependency-free: Vite imports it while loading its configuration.
 * src/ui/typeSystem.selftest.mjs proves the files, hashes, markers, stacks, weights, floors and the head budget.
 */

export type TypeVoice = 'display' | 'body' | 'mono';
export type TypeFamilyKey = TypeVoice | 'ui';

interface TypeFace {
  readonly voice: TypeVoice;
  readonly weight: number;
  /** Path under public/fonts/. */
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

/**
 * The marks face: Medium (drawn from Chakra Petch Medium) for weights up to 549, Bold above. Each stack names it right
 * after its Latin face, so ←/→ match Chakra Petch's own ↑/↓ and the shell's arrows never fall to Arial.
 */
export const TYPE_SYMBOLS = Object.freeze({
  family: 'Cot Symbols',
  dir: 'cot-symbols',
  range: 'U+2190-2193,U+221E,U+2264-2265',
  faces: Object.freeze([
    { weight: '100 549', file: 'cot-symbols/CotSymbols-Medium.woff2', bytes: 1012, sha256: '3060840eaa05482b94ac1b8def6cd0b4e22315e287853da8bb423e838fe33429' },
    { weight: '550 1000', file: 'cot-symbols/CotSymbols-Bold.woff2', bytes: 1004, sha256: 'b1d14c781a161f102245d70547e484f3e69481bd6a6cb1c5e63096b39cd04b27' },
  ]),
});

/**
 * The accents face: Plex Sans Regular, Medium and SemiBold letters with macron or acute, per weight. Each Plex-backed stack
 * names it right after its Latin face; its unicode-range keeps it out of every download but a page that prints one.
 */
export const TYPE_ACCENTS = Object.freeze({
  family: 'Cot Accents',
  dir: 'cot-accents',
  range: 'U+0100-017F',
  faces: Object.freeze([
    { weight: '100 449', file: 'cot-accents/CotAccents-Regular.woff2', bytes: 1912, sha256: '8acdd0ffbab47f476b52277f7931a5ae24d0dabc2bbbffa41e10c71b71d972c3' },
    { weight: '450 549', file: 'cot-accents/CotAccents-Medium.woff2', bytes: 1864, sha256: '25fdc466218ea5ebc90741920540217f7af27623cf7fa869b1f55a5178f50ad1' },
    { weight: '550 1000', file: 'cot-accents/CotAccents-SemiBold.woff2', bytes: 1900, sha256: 'f66464bb044ebfc789eb0f755719a4a654f29d895b921e86771b12535107ff3d' },
  ]),
});

/** The CSS family names. `ui` is the weight-voiced shell family declared over the body and display files. */
export const TYPE_FAMILY: Readonly<Record<TypeFamilyKey, string>> = Object.freeze({
  display: 'Chakra Petch',
  body: 'IBM Plex Sans',
  mono: 'IBM Plex Mono',
  ui: 'Cot UI',
});

/** Where each voice came from (docs/ATTRIBUTION.md repeats these rows). */
export const TYPE_SOURCES: Readonly<Record<TypeVoice, { readonly author: string; readonly source: string; readonly dir: string }>> = Object.freeze({
  display: {
    author: 'Cadson Demak (The Chakra Petch Project Authors)',
    source: 'https://fonts.google.com/specimen/Chakra+Petch (google/fonts ofl/chakrapetch, fonts.gstatic.com/s/chakrapetch/v13 latin)',
    dir: 'chakra-petch',
  },
  body: {
    author: 'IBM Corp. (Mike Abbink, Bold Monday)',
    source: 'https://github.com/IBM/plex/releases/tag/%40ibm%2Fplex-sans%401.1.0 (fonts/split/woff2)',
    dir: 'ibm-plex-sans',
  },
  mono: {
    author: 'IBM Corp. (Mike Abbink, Bold Monday)',
    source: 'https://github.com/IBM/plex/releases/tag/%40ibm%2Fplex-mono%402.5.0 (fonts/split/woff2)',
    dir: 'ibm-plex-mono',
  },
});

export const TYPE_FACES: readonly TypeFace[] = Object.freeze([
  { voice: 'display', weight: 500, file: 'chakra-petch/ChakraPetch-Medium-Latin.woff2', bytes: 9944, sha256: 'adf007cd277ef6dac0c8cecacfb60cc5e24e7c8bcce4db98aa233bd3a88ef5a3' },
  { voice: 'display', weight: 600, file: 'chakra-petch/ChakraPetch-SemiBold-Latin.woff2', bytes: 10040, sha256: '4d6d5f0b31b3a471a843779c4ecada040e5bc291f96bca9805a94293fe8003fa' },
  { voice: 'display', weight: 700, file: 'chakra-petch/ChakraPetch-Bold-Latin.woff2', bytes: 9868, sha256: '3c2433eb167176cddcdb3eb2ea306d68c2a4ed4c6e78a0dc07b3853d8f6ae8e3' },
  { voice: 'body', weight: 400, file: 'ibm-plex-sans/IBMPlexSans-Regular-Latin1.woff2', bytes: 20984, sha256: 'b5ad7bd39f996144915f0ad9849a90183b27d8c28ad97ed98af5b1bebc51f6b1' },
  { voice: 'body', weight: 500, file: 'ibm-plex-sans/IBMPlexSans-Medium-Latin1.woff2', bytes: 21960, sha256: 'b5610af04d0d4b5a14a621d96d974b993e945a065db1a8861918f69ef9321934' },
  { voice: 'body', weight: 600, file: 'ibm-plex-sans/IBMPlexSans-SemiBold-Latin1.woff2', bytes: 22260, sha256: 'fff0ab3a88b0b4aa0b693e4f0201359a15183b08e3fa5696d1918d8f0ade8ad5' },
  { voice: 'mono', weight: 400, file: 'ibm-plex-mono/IBMPlexMono-Regular-Latin1.woff2', bytes: 17544, sha256: 'e8993d946649b9d01abb1ed06d574b19d8ea3e66b5c3948602db335c44c18e56' },
  { voice: 'mono', weight: 500, file: 'ibm-plex-mono/IBMPlexMono-Medium-Latin1.woff2', bytes: 17868, sha256: '41201b658a328b9d00368215c2f1102770f80b15952ab82631e4006255e6365d' },
]);

/** The real weights each family has; the type lint holds CSS to these. */
export const TYPE_WEIGHTS: Readonly<Record<TypeFamilyKey, readonly number[]>> = Object.freeze({
  display: [500, 600, 700],
  body: [400, 500, 600],
  mono: [400, 500],
  ui: [400, 500, 600, 700],
});

/**
 * @font-face weight ranges per family: [voice of the file, file weight, CSS range]. Every requested weight lands on
 * one real face, so nothing is synthesized and no two declared weights of one family render alike.
 */
export const TYPE_FACE_RANGES: Readonly<Record<TypeFamilyKey, ReadonlyArray<readonly [TypeVoice, number, string]>>> = Object.freeze({
  display: [['display', 500, '100 549'], ['display', 600, '550 649'], ['display', 700, '650 1000']],
  body: [['body', 400, '100 449'], ['body', 500, '450 549'], ['body', 600, '550 1000']],
  mono: [['mono', 400, '100 449'], ['mono', 500, '450 1000']],
  ui: [['body', 400, '100 449'], ['body', 500, '450 549'], ['display', 600, '550 649'], ['display', 700, '650 1000']],
});

/**
 * Metric-matched local fallbacks, one family per face family, so a late face swaps in without moving text (CLS
 * from fonts <= 0.005). Measured with fontTools (2026-10-17) from the shipped WOFF2 files against
 * Arial, Arial Bold and Courier New: size-adjust matches the face's advance mix (for Plex, English letter frequencies
 * with a 5 % capitals share; for Chakra Petch, see below), and
 * ascent/descent-override restore the face's vertical metrics under that scale. The same overrides hold on Linux,
 * ChromeOS and Android, whose Liberation Sans / Arimo / Liberation Mono / Cousine are Arial's and Courier New's metric
 * twins, and whose Roboto and Droid Sans Mono sit within about 1 % of their advances.
 *   ui      100-549 Arial      -> Plex Sans Medium (5 % caps)            550-1000 Arial Bold -> Chakra SemiBold, Bold
 *   body    100-549 Arial      -> Plex Sans Medium (5 % caps)            550-1000 Arial Bold -> Plex Sans SemiBold (5 %)
 *   display 100-549 Arial      -> Chakra Petch Medium                    550-1000 Arial Bold -> Chakra SemiBold, Bold
 *   mono    Courier New        -> Plex Mono (both 600 units per em wide)
 * Chakra Petch's capitals run narrower against Arial's than its lowercase does (93 % against 101 % at Bold), so one
 * size-adjust cannot hold both: a family's single size left the /docs/fleet banner's capitals 1.7 % wide, and the title
 * rewrapped from two lines to one at 390 px when the face arrived (264). Every Chakra Petch face therefore has its own
 * fallback pair: one rule for the capitals (TYPE_CAPS_RANGE), declared after the rule for everything else so it is the
 * one the browser tries for A-Z, each solved so English capitals text and English mixed-case text (letter frequencies,
 * a space per 4.7 letters) set as wide as the face. The Bold pair has a third rule, the space alone (TYPE_SPACE_RANGE): the
 * browser reads a line's cap height and strut from the face that covers U+0020, and the titles that trim to the cap
 * (text-box: trim-both cap) are Bold, so the space's rule is Arial Bold at the scale that gives Chakra Petch's cap height
 * (0.700 em), which is also the scale of Chakra Petch Bold's space. src/ui/typeFallbackMetrics.selftest.mjs holds a caps
 * title within 1 % of the face's advance width for every weight, and the Bold cap height within 1 %.
 */
const LOCAL_REGULAR = "local('Arial'),local('ArialMT'),local('Liberation Sans'),local('Arimo'),local('Roboto')";
const LOCAL_BOLD = "local('Arial Bold'),local('Arial-BoldMT'),local('Liberation Sans Bold'),local('Arimo Bold'),local('Roboto Bold')";
const LOCAL_MONO = "local('Courier New'),local('CourierNewPSMT'),local('Liberation Mono'),local('Cousine'),local('Droid Sans Mono')";

/** The capitals, A-Z: the unicode-range of a Chakra Petch fallback's caps rule. */
export const TYPE_CAPS_RANGE = 'U+41-5A';
/** The space: the range of the Bold fallback's rule that the browser takes for the line's metrics (its first available font). */
export const TYPE_SPACE_RANGE = 'U+20';

interface FallbackFace {
  readonly weight: string;
  readonly src: string;
  readonly size: number;
  readonly ascent: number;
  readonly descent: number;
  /** A unicode-range: this rule stands in for those characters only, ahead of the same weights' rule for the rest. */
  readonly range?: string;
}

export const TYPE_FALLBACK_FAMILY: Readonly<Record<TypeFamilyKey, string>> = Object.freeze({
  display: 'Cot Display Fallback',
  body: 'Cot Body Fallback',
  mono: 'Cot Mono Fallback',
  ui: 'Cot Fallback',
});

export const TYPE_FALLBACKS: Readonly<Record<TypeFamilyKey, readonly FallbackFace[]>> = Object.freeze({
  ui: [
    { weight: '100 549', src: LOCAL_REGULAR, size: 103.2, ascent: 99.3, descent: 26.6 },
    { weight: '550 649', src: LOCAL_BOLD, size: 99.1, ascent: 100.1, descent: 31.1 },
    { weight: '550 649', src: LOCAL_BOLD, size: 91.9, ascent: 107.9, descent: 33.5, range: TYPE_CAPS_RANGE },
    { weight: '650 1000', src: LOCAL_BOLD, size: 101.2, ascent: 98, descent: 30.4 },
    { weight: '650 1000', src: LOCAL_BOLD, size: 93.5, ascent: 106.1, descent: 32.9, range: TYPE_CAPS_RANGE },
    { weight: '650 1000', src: LOCAL_BOLD, size: 97.8, ascent: 101.4, descent: 31.5, range: TYPE_SPACE_RANGE },
  ],
  body: [
    { weight: '100 549', src: LOCAL_REGULAR, size: 103.2, ascent: 99.3, descent: 26.6 },
    { weight: '550 1000', src: LOCAL_BOLD, size: 97, ascent: 105.7, descent: 28.4 },
  ],
  display: [
    { weight: '100 549', src: LOCAL_REGULAR, size: 105.3, ascent: 94.2, descent: 29.2 },
    { weight: '100 549', src: LOCAL_REGULAR, size: 90.9, ascent: 109.1, descent: 33.9, range: TYPE_CAPS_RANGE },
    { weight: '550 649', src: LOCAL_BOLD, size: 99.1, ascent: 100.1, descent: 31.1 },
    { weight: '550 649', src: LOCAL_BOLD, size: 91.9, ascent: 107.9, descent: 33.5, range: TYPE_CAPS_RANGE },
    { weight: '650 1000', src: LOCAL_BOLD, size: 101.2, ascent: 98, descent: 30.4 },
    { weight: '650 1000', src: LOCAL_BOLD, size: 93.5, ascent: 106.1, descent: 32.9, range: TYPE_CAPS_RANGE },
    { weight: '650 1000', src: LOCAL_BOLD, size: 97.8, ascent: 101.4, descent: 31.5, range: TYPE_SPACE_RANGE },
  ],
  mono: [
    { weight: '100 1000', src: LOCAL_MONO, size: 100, ascent: 102.5, descent: 27.5 },
  ],
});

const CJK_STACK = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC'";

/** Font stacks. FONT_STACK / FONT_COND in src/ui/fonts.ts repeat `ui` literally (canvas text cannot read var()). */
export const TYPE_STACK: Readonly<Record<TypeFamilyKey, string>> = Object.freeze({
  display: `'Chakra Petch','Cot Symbols','Cot Display Fallback',${CJK_STACK},sans-serif`,
  body: `'IBM Plex Sans','Cot Accents','Cot Symbols','Cot Body Fallback',${CJK_STACK},sans-serif`,
  // Readouts are figures only: .num never holds a localized string (typeSystem lints it), so no CJK run here.
  mono: "'IBM Plex Mono','Cot Mono Fallback',ui-monospace,monospace",
  ui: `'Cot UI','Cot Accents','Cot Symbols','Cot Fallback',${CJK_STACK},sans-serif`,
});

/** The type scale (CSS px at 100 %; the type rules): nothing a player must read sits below the first step. */
export const TYPE_SCALE: readonly number[] = Object.freeze([11, 12, 13, 14, 16, 18, 20, 24, 32, 44, 60, 88, 128]);

/** The smallest CSS px font size any shipped stylesheet may declare: the type rules's caps-label floor, --fs-11. */
export const TYPE_FLOOR_PX = TYPE_SCALE[0];

/** The families a document declares when its marker names none: the shell family and the readout face. */
export const TYPE_DEFAULT_FAMILIES: readonly TypeFamilyKey[] = Object.freeze(['ui', 'mono']);

const FONT_ROOT = '/fonts/';

/** styleLayers.ts STYLE_LAYER_ORDER, repeated so this module stays dependency-free (styleLayers.selftest pins it). */
const LAYER_ORDER = '@layer reset,tokens,base,components,surfaces,utilities,overrides;';

function faceFor(voice: TypeVoice, weight: number): TypeFace {
  const face = TYPE_FACES.find((entry) => entry.voice === voice && entry.weight === weight);
  if (!face) throw new Error(`typeFaces: no ${voice} ${weight} face`);
  return face;
}

/** The @font-face rules of the named families: the faces, the accents and marks faces their stacks name, then the fallbacks. */
export function fontFaceCss(families: readonly TypeFamilyKey[] = ['ui', 'display', 'body', 'mono']): string {
  const rules: string[] = [];
  for (const family of families) {
    for (const [voice, weight, range] of TYPE_FACE_RANGES[family]) {
      rules.push(`@font-face{font-family:'${TYPE_FAMILY[family]}';src:url(${FONT_ROOT}${faceFor(voice, weight).file});`
        + `font-weight:${range};font-display:swap}`);
    }
  }
  if (families.some((family) => family === 'ui' || family === 'body')) {
    for (const face of TYPE_ACCENTS.faces) {
      rules.push(`@font-face{font-family:'${TYPE_ACCENTS.family}';src:url(${FONT_ROOT}${face.file});font-weight:${face.weight};`
        + `font-display:swap;unicode-range:${TYPE_ACCENTS.range}}`);
    }
  }
  if (families.some((family) => family !== 'mono')) {
    for (const face of TYPE_SYMBOLS.faces) {
      rules.push(`@font-face{font-family:'${TYPE_SYMBOLS.family}';src:url(${FONT_ROOT}${face.file});font-weight:${face.weight};`
        + `font-display:swap;unicode-range:${TYPE_SYMBOLS.range}}`);
    }
  }
  for (const family of families) {
    for (const f of TYPE_FALLBACKS[family]) {
      rules.push(`@font-face{font-family:'${TYPE_FALLBACK_FAMILY[family]}';src:${f.src};font-weight:${f.weight};size-adjust:${f.size}%;`
        + `ascent-override:${f.ascent}%;descent-override:${f.descent}%;line-gap-override:0%${f.range ? `;unicode-range:${f.range}` : ''}}`);
    }
  }
  return rules.join('\n');
}

/** Options of one document's type head (the marker's keywords). */
export interface TypeHeadOptions {
  readonly families?: readonly TypeFamilyKey[];
  /** Emit the type scale and voices (`--fs-*`, `--lh-*`, `--track-*`, `--t-*`). */
  readonly scale?: boolean;
  /** Emit the display treatments (`.t-accent`, `.t-hollow`). */
  readonly fx?: boolean;
}

/** The rules a document's head carries besides its faces: family tokens, `.num`, the resets, and what it opts into. */
export function typeTokenCss(options: TypeHeadOptions = {}): string {
  const families = new Set(options.families ?? TYPE_DEFAULT_FAMILIES);
  const vars = [`--font-ui:${TYPE_STACK.ui}`, '--hud-font:var(--font-ui)'];
  if (families.has('mono')) vars.push(`--font-mono:${TYPE_STACK.mono}`);
  if (families.has('body')) vars.push(`--font-body:${TYPE_STACK.body}`);
  if (families.has('display')) vars.push(`--font-display:${TYPE_STACK.display}`);
  // `b` and `strong` are `bolder` by default: inside a 700 title that computes 900, a weight no face carries. Bold is
  // 700, the heaviest declared weight, everywhere.
  const rules = [`:root{${vars.join(';')}}`, ':where(b,strong){font-weight:700}'];
  // Readouts that tick in place (clock, counters, HP, ammo, timecode, live values): the only tabular figures.
  // ss04 is Plex Mono's plain zero: a readout reads as a gauge, not as code (its default zero carries a dot).
  if (families.has('mono')) rules.push(".num{font-family:var(--font-mono)!important;font-variant-numeric:lining-nums tabular-nums;font-feature-settings:'ss04'}");
  // Emphasis inside reading text keeps the body face instead of switching to the display voice.
  if (families.has('body')) rules.push(':where(p,li,dd,blockquote) :where(b,strong){font-family:var(--font-body)}');
  // Running text wraps without orphans; zh-CN: no tracking on Chinese (the CJK tracking defect; the game's indents that
  // balanced it are reset in responsiveSurfaces.css, since no public page indents) and reading text opens up (the
  // type rules). Case transforms stay: they never touch Chinese. Latin-only lockups inside a Chinese page
  // carry lang="en" and set their own tracking on that element.
  rules.push(':where(p,li,dd,figcaption,blockquote){text-wrap:pretty}', ':lang(zh-CN){letter-spacing:0!important}',
    ':lang(zh-CN) :where(p,li,dd){line-height:1.7}');
  if (options.scale) {
    const sizes = TYPE_SCALE.map((px) => `--fs-${px}:calc(${px}px*var(--cot-type-scale))`).join(';');
    rules.push(`:root{--cot-user-text:1;--cot-type-scale:calc(var(--cot-ui-scale,1)*var(--cot-user-text));${sizes};`
      + '--track-label:.12em;--track-label-s:.08em;--track-title:-.015em;--track-display:-.035em;'
      + '--lh-display:.92;--lh-title:1.08;--lh-body:1.55;--lh-docs:1.65;'
      // The voices as font shorthands (the type rules): `font: var(--t-title)`. Display and title Chakra Petch Bold, reading
      // text Plex Sans, labels Chakra Petch SemiBold, data Plex Mono.
      + '--t-display:700 var(--fs-88)/var(--lh-display) var(--font-display);--t-title:700 var(--fs-24)/var(--lh-title) var(--font-display);'
      + '--t-body:400 var(--fs-16)/var(--lh-body) var(--font-body);--t-label:600 var(--fs-12)/1.2 var(--font-display);'
      + '--t-data:500 var(--fs-14)/1.2 var(--font-mono)}');
  }
  if (options.fx) {
    // Display treatments (owner UI rule 5): accent ink and the hollow outline the landing uses. Never on Chinese.
    rules.push('.t-accent{color:var(--accent,#f0a030)}',
      '.t-hollow{color:transparent;-webkit-text-stroke:var(--hollow-stroke,1.5px) var(--hollow-ink,#eef4f8);paint-order:stroke fill}',
      ':lang(zh-CN) .t-hollow{color:var(--hollow-ink,#eef4f8);-webkit-text-stroke:0;opacity:.72}');
  }
  return rules.join('\n');
}

/** A face token of a type marker: `<voice>-<weight>`, e.g. `display-700`. */
export function typeFaceFile(token: string): string {
  const match = /^(display|body|mono)-(\d{3})$/.exec(token);
  if (!match) throw new Error(`typeFaces: bad face token ${token}`);
  return `${FONT_ROOT}${faceFor(match[1] as TypeVoice, Number(match[2])).file}`;
}

/** A parsed marker: the families to declare, the faces to preload, and the opt-in rule sets. */
export interface TypeMarker extends TypeHeadOptions {
  readonly families: readonly TypeFamilyKey[];
  readonly preload: readonly string[];
}

const FAMILY_KEYS = new Set<string>(['ui', 'display', 'body', 'mono']);

/**
 * Parse a marker's keywords. `ui`, `display`, `body`, `mono` name the families the page declares (none named: `ui mono`);
 * `<voice>-<weight>` names a face to preload (it must belong to a declared family); `scale` and `fx` opt into the type
 * scale tokens and the display treatments.
 */
export function parseTypeMarker(keywords: string): TypeMarker {
  const words = keywords.trim() ? keywords.trim().split(/\s+/) : [];
  const families: TypeFamilyKey[] = [];
  const preload: string[] = [];
  let scale = false;
  let fx = false;
  for (const word of words) {
    if (FAMILY_KEYS.has(word)) families.push(word as TypeFamilyKey);
    else if (word === 'scale') scale = true;
    else if (word === 'fx') fx = true;
    else { typeFaceFile(word); preload.push(word); }
  }
  const declared = families.length ? families : [...TYPE_DEFAULT_FAMILIES];
  for (const token of preload) {
    const file = typeFaceFile(token);
    const used = declared.some((family) => TYPE_FACE_RANGES[family].some(([voice, weight]) => typeFaceFile(`${voice}-${weight}`) === file));
    if (!used) throw new Error(`typeFaces: ${token} is preloaded but no declared family uses it`);
  }
  return { families: declared, preload, scale, fx };
}

/** The head markup one document gets: preloads for the faces its first paint uses, then its rules. */
export function typeHead(marker: TypeMarker | string): string {
  const parsed = typeof marker === 'string' ? parseTypeMarker(marker) : marker;
  const links = parsed.preload.map((token) =>
    `<link rel="preload" href="${typeFaceFile(token)}" as="font" type="font/woff2" crossorigin>`);
  // The head's rules sit in the surfaces layer with every other sheet (src/ui/styleLayers.ts): unlayered, they would
  // beat every layered rule whatever its specificity.
  return `${links.join('')}<style id="cot-font-faces">${LAYER_ORDER}@layer surfaces{${fontFaceCss(parsed.families)}\n`
    + `${typeTokenCss(parsed)}}</style>`;
}

/** The document marker: `<!--cot:type ui mono display-700 body-500-->`. */
export const TYPE_MARKER = /<!--cot:type((?:\s+[a-z]+(?:-\d{3})?)*)\s*-->/g;

/** Expand every type marker of an HTML document (vite.config.ts `cot-type-faces`). */
export function expandTypeMarkers(html: string): string {
  return html.replace(TYPE_MARKER, (_marker, keywords: string) => typeHead(keywords));
}
