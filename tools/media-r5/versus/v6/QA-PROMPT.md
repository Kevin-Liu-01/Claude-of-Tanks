# Round-6 still QA: the prompt template (2026-10-15 20:4x)

Visual QA of one in-engine marketing still from the game Claude of Tanks. Report in at most 8 lines.

- The still: shots/media-r5/remake/send-r6/<id>.jpg, 1920x1080. Downscale it first
  (`sips -Z 1400 <in> --out $TMPDIR/v.jpg`), look at it once, and do not re-open it.
- Read the author's intent first: shots/media-r5/remake/v6/<id>.md.

The owner's rules:
- front angles, never rear;
- tanks whole, large, lit and readable at thumbnail size;
- fire and explosions behind the tanks, never covering a hull;
- deep focus;
- no wires across the frame;
- the time of day must be honest: a scene labelled sunset or golden should show a warm sky or warm light, a night
  must read as night. A bright blue sky is fine for a 'day' scene; the owner loved round 4's blue-sky SEPv3. Flag
  a mismatch so the label can change, not as a defect of the picture.
- watch for spark 'needles' or spike-stars covering a tank's face, and for a blown-out muzzle core that reads as a
  second sun.

**The owner's pass of 2026-10-16** ("i want to see tank fronts more ... tanks should be more % of frame ... and more
interesting camera rotation and angles"):
- Each duellist's front (glacis, turret face, gun) reads, seen within about 35° of its nose.
- The near tank fills at least ~45 % of the frame's width, the far one at least ~22 %.
- The camera has a deliberate, interesting angle (a Dutch roll, a dramatic height). Flag a flat, level, mid-height
  framing as a missed chance.

**The social card.** The generator scales the still with object-fit: cover to 1200x630. That keeps the FULL width and
trims only about 3.5 % off the top and bottom. Both hulls must sit inside |y| ≤ 0.88 NDC (NOT a 1:1 centre crop). The
bottom-left corner holds the card's logo lockup, so a calm corner there is preferred.

**Report:**
1. What you see, in one or two lines.
2. Does it match the intent?
3. Each rule: pass or fail.
4. Any defect: black areas, a tank hidden, clipped, floating or under water, an effect swallowing a tank, a beam-like
   glow instead of tracers, a missing effect, too dark, artifacts.
5. Verdict: SHIP, or FIX with specific changes.
