# Claude of Tanks — "Around the Clock" motion system (media r5)

Concept angle: one day of armored war, told as instrumentation. The footage is the
spectacle; the type is a precise field instrument laid over it — a 24-hour clock,
grid references and calibers — until the brand lands with weight at the close.

## Brand truth (strict)

- Background ink: `#0b0e11` (brand panel). Letterbox bars: `#07090c` (never pure black).
- Foreground steel: `#e8edf2`. Secondary steel: `#9fb0bf`.
- Accent (the one hue): amber `#f0a12e`; highlight gold `#ffd27a` for the clock digits only.
- Danger/live tick (sparingly, ≤ 1 element per scene): `#e5484d`.
- Display face: ABC Monument Grotesk (owner-licensed brand UI face, local woff2:
  Regular 400 / Medium 500 / Bold 700). Statements in Bold caps, tracking −0.02em at
  display sizes, +0.18em on small caps labels.
- Data face: JetBrains Mono 400/700 (bundled, OFL) — clock, grid refs, map names,
  calibers, timecode. Never used for statements.
- Logo: the crest (`logo-mark-metal.svg` on dark, `logo-mark.svg` for color) and the
  metal full lockup. Crest is never recolored, skewed or cropped.

## Frame law

- Cinema frame: 2.39:1 letterbox inside 16:9 for trailer scenes (bars 140 px top and
  bottom at 1920×1080). Social verticals use a 4:5 safe core with no letterbox.
- Footage is full-bleed, in-engine, unretouched geometry. No fabricated tanks, no other
  game's assets. Footer notice on end card: "In-engine footage · Scene Studio".
- Overlay zones: top bar (inside the top letterbox): clock left, map + grid right, in
  mono 22 px. Lower-left statement zone for kinetic titles. Center only for the logo.
- Two focal points: the footage subject + one typographic event. Never more than one
  statement on screen.

## Motion language

- Instrument motion: digits roll (odometer), hairline rules draw (scaleX 0→1, 0.35 s,
  power3.out), brackets snap in (0.12 s, expo.out) then settle 4 px.
- Statements slam: 0.10–0.16 s in with a 6–10 px overshoot and a 2-frame white
  flash on the letterforms, hold ≥ 1.6 s, exit by mask wipe (0.25 s).
- Cuts land on music hits; hard cuts by default, a 2–4 frame white/amber flash frame
  only on major section changes, whip transitions only where the footage itself whips.
- Grain: one shared fine grain layer at 6–8 % on overlays only (the footage already
  carries its own grade).
- Seek-safe GSAP only, finite repeats, no wall clock.

## Do / Don't

- Do let shots breathe 2–4 s; slow motion only for the climax kill.
- Do keep the clock monotonic across the trailer (dawn → night).
- Don't put text over the hero tank's turret or the gun line.
- Don't use gradient text, neon glows, or centered stacks of three lines.
- Don't claim gameplay performance or live-match footage; these are staged scenes.
