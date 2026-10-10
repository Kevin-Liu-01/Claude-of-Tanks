# Claude of Tanks — "Around the Clock" motion system (media r5)

Concept angle: one day of armored war. The footage is the spectacle; the type is a few
large, confident words laid over it, until the brand lands with weight at the close.

## Owner direction (2026-10-02)

- Large type only: no eyebrows, kickers, sub-lines, spec lines, HUD labels, clocks or
  grid references. Every line on screen is at least 56 px at 1080p
  (`MIN_TYPE` in `build.mjs`, held by `motion-type.selftest.mjs`).
- Nothing names a fleet tier. A tank is titled by its public name alone.

## Brand truth (strict)

- Background ink: `#0b0e11` (brand panel). Letterbox bars: `#07090c` (never pure black).
- Foreground steel: `#e8edf2`. Accent (the one hue): amber `#f0a12e`; highlight gold
  `#ffd27a` for counts and the wordmark's second line.
- Display face: ABC Monument Grotesk (owner-licensed brand UI face, local woff2 from
  `public/fonts/abc-monument-grotesk`: Regular 400 / Medium 500 / Bold 700). Statements
  in Bold caps. No monospace.
- Logo: the crest (`logo-mark-metal.svg` on dark) and the CLAUDE / OF TANKS wordmark.
  The crest is never recolored, skewed or cropped.

## Frame law

- Cinema frame: 2.39:1 letterbox inside 16:9 for trailer scenes (bars 138 px at
  1920×1080). Verticals carry no letterbox and keep a 210 px top / 470 px bottom safe zone.
- Footage is full-bleed, in-engine, unretouched geometry. No fabricated tanks.
- Title kinds: `section` (one word), `stat` (a count and its noun), `line` (one short
  statement), `tank` (a tank's name), `logo` (the lockup). Lower-left statement zone;
  center only for the logo and the lineup title. One statement on screen at a time.
- End card: crest, the shield trace (a line that follows the crest's own outline, drawn up both flanks from the bottom
  point; owner 2026-10-04 replaced the circular dial), wordmark and the site address — nothing else.

## Motion language

- Statements slam: 0.10–0.16 s in with a slight overshoot and a white flash on the
  letterforms, hold ≥ 1.6 s, exit by mask wipe (0.25 s). Names rise letter by letter.
- Cuts land on music hits; hard cuts by default, a 2–4 frame white/amber flash frame
  only on major section changes, whip transitions only where the footage itself whips.
- Grain: one shared fine grain layer at 4–7 % (the footage already carries its own grade).
- Seek-safe GSAP only, finite repeats, no wall clock.

## Do / Don't

- Do let shots breathe 2–4 s; slow motion only for the climax kill.
- Don't put text over the hero tank's turret or the gun line.
- Don't use gradient text, neon glows, or stacks of small lines.
- Don't claim gameplay performance or live-match footage; these are staged scenes.
