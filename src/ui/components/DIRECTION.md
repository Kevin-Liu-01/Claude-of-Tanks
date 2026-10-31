# The Premiere direction in the live kit

The Premiere surfaces are built from the direction's own code, not re-authored. The source of truth is
`~/cot-launch-state/streams/brand-ui/phase2/bui01/src`:

- `components.css`: the shared components;
- `tokens.css`: the tokens, which the live `src/ui/tokens/tokens.json` carries under the same names;
- `lib.js`: the helpers;
- `pages/*.html`: one page per surface.

Their renders are in `phase2/bui01/mockups/*.png` (1440 × 900, `-1920`, phone `@2x`). The owner chose the direction
from those renders.

| Surface | Direction page |
|---|---|
| Landing, versus wall, fleet wall, phone landing | `01-landing-hero`, `02-landing-versus-wall`, `03-landing-fleet-wall`, `90-phone-landing` |
| Deploy, phone Deploy | `04-deploy`, `91-phone-deploy` |
| Garage | `05-garage` |
| Battle HUD, sniper optic | `06-battle-hud`, `mockups/06b-sniper-optic` |
| Tank Gallery | `07-gallery` |
| Field Manual | `08-docs` |
| Studio | `09-studio` |
| Battle load, end screen | `10-battle-load`, `11-end-screen` |
| The mark | `92-mark` |

Boot, loading states and exception pages have no page. They use the kit and the nearest page's grammar: the battle
load for boot, and the landing for the 404.

## Porting a page

1. Take the page's markup structure and its `<style>` block, then wire them to live data and keep every live feature.
2. Map each direction class to its live class (table below). The kit's CSS is the direction's `components.css`.
3. Page-only rules go in the surface's own sheet, on tokens:
   - a raw `px` font size takes the nearest `--fs-*` step: 11 12 13 14 15 16 18 20 24 28 32 36 40 44 52 60 76 88 112 128;
   - `--font-data` is the data voice;
   - a colour, shadow, tracking, z-index or duration takes a kit token (`--ring-*`, `--fill-*`, `--media-fade*`,
     `--glyph-plate`, `--row-plate`, `--side-plate`, `--btn-primary-shadow`, `--flag-ring`, `--sil-shadow`, `--z-lift`)
     or a new token in the surface's own `surface-<name>` group of `tokens.json`;
   - geometry (`px` widths, heights, paddings, gaps) ports as it is. `tools/style-literal-census.mjs` counts only
     colours, font sizes, tracking, z-index, shadows and durations.
4. Copy goes through the catalogs (`src/ui/i18nCatalog.*.json`). The owner's rules hold:
   - no eyebrows, taglines or helper lines;
   - text never sits on a tank;
   - every vehicle shows its flag and silhouette.
5. A page's sample data becomes live data, never a literal: rules from the mode's ruleset (`sim/matchRuleset.ts`),
   records from the profile, and drawings that need a built world from a baked file. The Deploy map's objectives come
   from `public/minimaps/objectives.json`, which `tools/deploy-objectives-bake.mjs` writes through the battle's own
   placement and controller; re-run it when a map's layout or a mode's placement changes.

## Classes

| Direction | Live |
|---|---|
| `.d1` `.d2` `.d3` `.h1` `.h2` `.h3` | `.cot-c-d1` … `.cot-c-h3` |
| `.body` `.small` `.data` `.muted` | `.cot-c-body` `.cot-c-small` `.cot-c-data` `.cot-c-muted` |
| `.fx-accent` `.fx-hollow` | `.t-accent` `.t-hollow` (the type head) |
| `.num` | `.num` |
| `.btn` `.btn-secondary` | `.cot-c-btn` (secondary is the default) |
| `.btn-primary` `.btn-ghost` | `.cot-c-btn--primary` `.cot-c-btn--ghost` |
| `.btn-sm` `.btn-lg` `.btn-xl` | `.cot-c-btn--36` `--56` `--64` |
| `.kbd` | `.cot-c-kbd` (`keycap()`); touch and folded layouts hide it |
| `.chip` `.chip.on` | `.cot-c-chip`, `[aria-pressed=true]` (`chip()`) |
| `.tag` `.tag.new` | `.cot-c-tag`, `.cot-c-tag--accent` (`tag()`) |
| `.tabs` `.tab` `.tab.on` `.tab .n` | `.cot-c-tabs`, `__tab`, `[aria-selected=true]`, `__count` (`tabs()`) |
| `.seg` `.seg span.on` | `.cot-c-seg`, `__opt[aria-checked=true]` (`segmented()`) |
| `.scale` `.scale i.f/.r` | `.cot-c-scale` (`scale20()`) |
| `.flag` `.flag.s` `.flag.l` | `.cot-c-flag--sm` `--md` `--lg` (`flag()`) |
| `.silm` `.silm.flip` | `.cot-c-sil`, `--right` (`silhouette()`) |
| `.veh` | `.cot-c-veh` (`vehicle()`) |
| `.vs-dot` | `.cot-c-vs` |
| `.rules` | `.cot-c-rules` (`rules()`) |
| `.cap` | `.cot-c-cap` |
| `.plate` `.raised` `.plate.hud` | `.cot-c-plate` `--raised` `--hud` |
| A picture card (`.mode`, `.camp-card`, `.bfield .art`, `.take`) | `.cot-c-media`, `--soft`, `--full` |
| `.hero-icon` | the live hero card (`src/ui/heroCard.ts`, the roster's `.cot-card`) |

## Helpers

| `lib.js` | Live |
|---|---|
| `T(id)` (FACTS) | the live spec (`src/vehicles`, the Garage's `specById`) |
| `flagImg(code)` | `flag(nation)` |
| `silM(id)` | `silhouette(id)` |
| `topM(id)` | `iconUrl(id, 'top_silhouette')` (`src/ui/icons.ts`) |
| `veh(id)` | `vehicle()` |
| `heroIcon(id)` | the hero card |
| `use('i-…')` | `icon(id)` (`src/ui/icons/icon.ts`; the ids are listed in `spriteIndex.ts`) |
| `fmt(n)` | the catalogs' ICU number formats, never a hard-coded locale |

## The identity

Decided on 10-23, carrying the direction forward. The name stays Claude of Tanks; the crest and the mascot are retired.

| Tier | Asset | Uses |
|---|---|---|
| Wordmark | CLAUDE —of— TANKS, Chakra Petch outlined to paths: `public/brand/wordmark.svg`, `-paper`, `-mono`, always on one line (owner, 2026-10-26: never the words stacked); inline as `BRAND_WORDMARK_HTML` (`src/ui/brandMark.ts` over `src/ui/brandWordmark.ts`) | Every lockup; never live text |
| Lockup | `public/brand/lockup.svg` (`-paper`): the mark, a gap and the wordmark, as the direction's nav sets them; `lockup-tall.svg` (`-paper`): the mark over the one-line wordmark for a square or tall space; a narrow space scales either down | Nav, cards, OG, signage |
| Ceremonial | `public/brand/title-card.svg`: the living mark over the one-line wordmark; the boot card draws the same lockup with the mark on compositor layers (`brandMarkLiveHTML`) | Boot, end cards, film bumpers, press |
| Badge | `public/brand/mark.svg`, `brandMarkSVG()`: the commander, the Claude Code mascot in the hatch of a tank advancing right | Game bar, rails, the transition stamp, loaders |
| Tab icon | `public/brand/favicon.svg` and `favicon-16.svg`: the mark hand-hinted on a 32 and a 16 cell grid on graphite; `favicon-mark.svg` above 32 px | Tabs, bookmarks, `favicon.ico` 16/32/48, PNG 16/32/48/192 |
| App icon | `public/brand/app-icon.svg`: the mark at 78 % on graphite (`maskable.svg` at 66 %) | `apple-touch-icon.png`, icon 192/512, maskable 192/512, iOS and macOS sets |

- **Colour:** paper words with the tungsten "of" on graphite; graphite words with tungsten-600 on paper; one ink for
  watermarks.
- **Regenerating:** `node tools/brand/wordmark-layout.mjs > layout.json`, then
  `python3 tools/brand/wordmark.py layout.json <ChakraPetch-Bold.ttf> <ChakraPetch-Medium.ttf>`. The icons come from
  `tools/brand-render.mjs export` and `ico`. `node tools/sync-brand-marks.mjs` then inlines the title card in the boot
  splash (`index.html`), where the registration sting moves its parts: `.t` the caps' top halves, `.rl` and `.rr` the
  "of" rules.
- **Social cards:** they come from `tools/marketing-shots/generate-og-images.mjs`, with the lockup clear of every tank.
  Every public page also names its family's share clip as `og:video` beside its one card (the game's, the Gallery's,
  the manual's and the Studio's, from `shareVideoForRoute` in `src/presentation/siteMetadata.ts`; owner, 2026-10-30).
- **Archived** in `docs/references/brand/`: `v1`, `v2-roundel` and `og-logo.png`. Two consumers still use the crest
  files (`logo-*`, `v3-shield`): the garage signage atlas and the film tools. They retire as those consumers move.
