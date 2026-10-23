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
