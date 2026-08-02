# kf51 shaded-parity r2 — independent critic verdict (2026-08-02)

Rig: tools/tmp-tank-critic.mjs --id=kf51 (14 pairs, shots/critic-kf51/),
fresh independent critic, 30+ zoom crops + pixel samples re-measured.
Geometric state: 90.5 PASS x2 (dabb571).

## Verdict: FAIL — min view 6.5 (r1 min 6.5; distribution improved, floor held)

front 7 · frontleft 7 · left 7 · rearleft 6.5 · rear 6.5 · rearright 6.5 ·
right 7 · frontright 7 · top 7 · hero-frontleft 6.5 · hero-rearright 6.5 ·
hero-toptilt 6.5 · close-front 7.5 · close-roof 7.

Owner top-down law: FILL PASS (solid; lid interiors sample material not
background). CIRCULARITY PARTIAL — barrel/bore/wheels true circles (r1
violation gone); roof rings flat engravings with hole-dark lids, pano ring
half ref diameter, SEOSS bracket an open horseshoe.

## The 8 r1 claims verified

1. BARREL: FIXED (confirmed by luminance columns 35→96→46 sleeve, 33→98→56
   tube — smooth cylinder, concentric bore; the round's honest win).
2. RUNNING GEAR: IMPROVED-BUT-SHORT — layout right; wheel faces V26-28 vs
   ref V21 (tone INVERTED vs skirt); sawtooth untouched; rear drums blank
   tan, centers ~half a wheel-diameter ABOVE the axis line.
3. REAR TOWER: IMPROVED-BUT-SHORT — retone worked, MASS unmoved (top ~20px
   above roof; full-width two-storey block; ref roof is flat/low bustle).
4. WEDGE+BOUNDARY: NOT FIXED — front rows flat 59-63; mantlet recess reads
   grey sticker; deck strips hairlines; camo bleeds hull→turret (monolith).
5. ROOF: IMPROVED-BUT-SHORT — ring true circle w/ lip, but lid rgb 36,36,29
   vs deck 56,54,41 reads OPEN HOLE; SEOSS still box ziggurat (union
   byte-identical), bracket horseshoe.
6. REAR PLATE: IMPROVED-BUT-SHORT — chevron wire-thin vs ref bold; NO hex
   taillights read anywhere (ref: two ~0.45m hex bores); flaps V21 vs ref
   V6 and mis-placed inboard.
7. GLACIS: IMPROVED-BUT-SHORT — lens pods sub-6px, don't read.
8. TONE: IMPROVED-BUT-SHORT — mint/blue dead; hue overshot to green 78 vs
   ref warm 39-51; camo blotches 19.6px/24 blobs vs ref 31.4px/12 —
   ~1.6x too fine, camoScale went the WRONG direction for the flank read.

## R3 work order (geometry-first)

1. REAR TOWER CUT (all rear/heroes): superstructure down to ref's low
   bustle line; keep slim mast bracket + free rods only above roof.
2. SAWTOOTH: reduce tooth HEIGHT into the pad band (pitch is mask-locked;
   height is not) — ref ground line is smooth.
3. SPROCKET DRUMS: drop centers to wheel-axis line, shrink, dark hub +
   camo face (blank tan cured on wheels, alive on drums).
4. TURRET SEPARATION: value break upper/lower cheek facets; mantlet recess
   into scheme; shadow channel around turret perimeter so camo stops
   bleeding across the ring (top/toptilt monolith).
5. REAR PLATE SIGNATURES: two ~0.4m hex recesses (dark bore + rim) at ref
   corner positions; chevron member width x3; flaps toward near-black V6,
   at ref's corner-square positions.
6. WHEEL FACE TONE: below skirt value (ref V21 vs skirt 30) + dark rubber
   rim ring.
7. ROOF: camo the lid discs (dark groove only); SEOSS toward dome-in-well
   or at minimum close the bracket ring; pano ring diameter toward ref.
8. CAMO SCALE: grow blotches ~1.5-1.6x linear (sweeping bands, not chop).
9. Rod rows from top: bold dark tick rows flanking the deck.

Gate law: margin 0.5 (90.5) — every geometry edit re-gates ≥90 all
components gatePassed:true; tower cut REDUCES excess coverage (gate-safe
direction); teeth height reduction must re-verify hull rows; siblings
leo2a5/leo2_revolution/leo2a6-hash must hold.
