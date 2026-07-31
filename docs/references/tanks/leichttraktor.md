# Leichttraktor VK 31 (`leichttraktor`) — reference packet

**Exact variant modeled:** Rheinmetall Leichttraktor (VK 31) prototype,
c. 1930, as interpreted by the Newc42 low-poly pack — a STYLIZED community
take on the trials vehicle; per the program rule the oracle is the primary
shape reference, cross-checked against the real prototype's layout.

## Corroborated dimensions (real prototype)

| Measure | Value | Sources (2+) |
|---|---|---|
| Length | 4.21 m | ww2-history.fandom.com Leichttraktor VK-31; militaryfactory.com armor_id=1221 |
| Width | 2.26 m | ww2-history.fandom; militaryfactory |
| Height | 2.27 m | ww2-history.fandom; globalsecurity.org |
| Gun | 3.7 cm KwK L/45 (tube ~1.66 m) + coax MG | ww2-history.fandom; wiki.wargaming.net Ltraktor |
| Layout | REAR-mounted turret, engine front, tall track frames w/ leaf springs, small road wheels | militaryfactory; globalsecurity |

## Identity cues

- Rear turret over a raised fighting compartment; long engine bow with a
  stepped nose.
- Very tall track run (top of track nearly at hull roof) with small wheels
  in bogies and prominent return-roller rail; large front idler/rear
  sprocket horns.
- Small round-ish turret with cupola, thin 37 mm with a small mantlet.

## Reference links

1. https://ww2-history.fandom.com/wiki/Leichttraktor_VK-31 — dims
2. https://www.militaryfactory.com/armor/detail.php?armor_id=1221 — dims/layout
3. https://newc-42.itch.io/german-low-poly-wwii-tanks — source model (CC0)

## Local GLB oracle notes

Path: `public/models/tanks/community/leichttraktor_newc42.glb` (turret
`^Turret$`, gun `^Gun$`). Healthy. Width-normalized probe (scale 1.028):

- hull z −2.26..+2.26 (4.52): bow beak 0.86@2.26, glacis 1.15→1.45 (z
  2.06..1.46), mid deck 1.51–1.60, raised cab 1.77 (z 0.46..0.26), rear
  deck 1.69 flat (z 0.06..−1.74), tail 1.43→1.17; tracks ±1.14 ALL the way
  to y 1.2 (tall track boxes), hull ±1.0–1.05 at y 1.3–1.6. Contact
  z ≈ 1.46..−1.54.
- turret at the REAR, z −0.14..−1.74: base y 1.55, roof 2.21–2.27, cupola
  2.40–2.45 (z −0.74..−0.94); plan max ±0.80 @ z −0.75..−0.9 tapering both
  ways (round-ish dome).
- gun: axis y ≈ 2.07, thin tube Ø0.07, mantlet ±0.30 at z 0, muzzle z +1.26
  — a full metre BEHIND the bow (no overhang; baseline G100 confirms both
  models keep the tube over the deck).

## Mismatch log (before → after)

| Date | total | minView | H | T | G | R | change |
|---|---|---|---|---|---|---|---|
| 2026-07-30 | 83.2 | — | 83 | 74 | 100 | 90 | baseline (turret too far forward, cab/track profile generic) |
| 2026-07-30 | 90.3 | 87.2 | 90 | 82 | 100 | 93 | bespoke build: rear dome turret (pivot z −0.82) w/ wide cupola, raised driver cab + fore/rear decks, tall riveted track frames w/ horns + mud chutes, raised idler/sprocket wraps, thin 37 mm + coax staying over the deck (G 100 kept) |

Remaining gap: front/rear views ~87 — the oracle's swooping diagonal fender
band across the track frame is a single sculpted surface; the straight framed
read keeps the real prototype's language instead (stylized-oracle judgment
call, noted).


## Geometry gate v9 (2026-07-31, from-scratch agent)

FLOATERS FIXED (0 -> 100): the cupola lid disc floated 6.6 cm above its
drum (satellite island in every pose); headlights also re-seated on the
glacis with brackets. Gun extended to published overall 4.87 (oracle span
4.54 — short-gun whole-curves cover accepted). dims 51.6 -> 91.5.
min 0 -> 11.5; whole 11.5 next lever: the raised cab/deck line (side rows
+0.1-0.15 high) and the turret dome profile.


## Geometry gate v10 round-2 (2026-07-31)
Round-2 row: hull 27.5 whole 15.9 turret 35.5 stations 52.7 dims 97.5
floaters 100 (ledger: 28.2/11.5/36.9/50.2/91.5/100).
Dims mechanics found this round: the sprocket/idler LINK-PAD wrap overhang
(pads ride 0.057 outside the band centerline) reached z ±2.3 and silently
carried hullLengthM to 4.54-4.68 (+3-6%) — end wheels pulled inboard to
z -1.72/+1.70 (published 4.4 now measures 4.38). Published overall 4.87 is
carried by a band-THIN rear tow bar (0.05 band) + the 37 mm shortened to
muzzle +2.43 with the gun line lowered (the print's tube barely passes its
own bow).
CERTIFIED PRINT CAP (short gun, quantified): the print's tube ends ~z +1.2;
the published-overall build tube spans +1.2..+2.43 as PROC-only/high-error
columns: ~5 cover columns + ~10 columns of ~0.35-0.5 m top error on
side_whole = ceiling ~55-65 side_whole (front/turret rows unaffected).
