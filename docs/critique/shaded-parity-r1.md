# Shaded-parity critique — round 1 (human gate, HANDOFF-FABLE §7)

**Reviewer:** harsh visual critic pass, 2026-07-30.
**Evidence:** freshly regenerated boards, `node tools/procedural-fidelity.mjs --ids=... --board`
(shots/procedural-fidelity/boards/<id>.png, LOD pinned 0). Judged on the SHADED pair
(reference LEFT / procedural RIGHT), articulation strip, and 24-frame turntable of every board.
**Question asked per tank:** does the procedural read as the same vehicle, at the same
asset-quality tier, from a garage camera? Gate: ALL seven scores >= 9. When uncertain,
the lower score was kept. Silhouette masks are NOT accepted as proof of likeness.

**Result: 0/37 pass. Every tank fails the shaded gate.** Silhouettes are mostly close
(that part of wave 1 worked), but the surfaces are empty: smooth blobby castings, no
panel breaks, no fittings, flat-disc road wheels, and a single clay material everywhere.
The current tanks read as painted greybox blockouts standing next to finished game assets.

A second, separate problem surfaced: **eleven reference GLBs are themselves broken**
(sunken/absent turret) — m26_pershing, m45_patton, m46_patton, m47_patton, charioteer,
comet, centurion3, centurion5, challenger_cruiser, m1a1_aim, is3_bergman. For those tanks
the mask turret scores are meaningless and the shaded LEFT is not a valid likeness target;
identity was judged against the packet text. One catastrophic procedural regression hid
behind this: **m1a1_aim has no turret at all and still scores 77.3.**

## Summary table

Scores 0-10: SD surface_detail, MA materials, WT wheels_tracks, TC turret_character,
HC hull_character, SP silhouette_parity, OV overall. Verdict PASS needs all >= 9.

| tank | SD | MA | WT | TC | HC | SP | OV | verdict |
|---|---|---|---|---|---|---|---|---|
| m26_pershing | 2 | 3 | 3 | 2 | 2 | 6 | 2 | FAIL |
| m45_patton | 2 | 3 | 3 | 2 | 2 | 6 | 2 | FAIL |
| m46_patton | 2 | 3 | 3 | 2 | 2 | 6 | 2 | FAIL |
| m47_patton | 2 | 3 | 3 | 3 | 2 | 6 | 3 | FAIL |
| m60a1 | 3 | 3 | 3 | 3 | 3 | 8 | 3 | FAIL |
| m60a3 | 3 | 3 | 3 | 3 | 3 | 8 | 3 | FAIL |
| chieftain5 | 3 | 2 | 2 | 2 | 2 | 3 | 2 | FAIL |
| charioteer | 4 | 2 | 3 | 3 | 3 | 5 | 3 | FAIL |
| comet | 3 | 2 | 3 | 3 | 3 | 5 | 3 | FAIL |
| centurion3 | 3 | 2 | 3 | 3 | 3 | 5 | 3 | FAIL |
| centurion5 | 3 | 2 | 3 | 3 | 3 | 5 | 3 | FAIL |
| challenger1 | 3 | 3 | 3 | 4 | 3 | 7 | 3 | FAIL |
| challenger_cruiser | 3 | 2 | 3 | 3 | 3 | 6 | 3 | FAIL |
| fv510 | 3 | 2 | 3 | 2 | 3 | 6 | 3 | FAIL |
| m1a2 | 3 | 2 | 2 | 3 | 2 | 7 | 3 | FAIL |
| m1a1 | 3 | 2 | 2 | 4 | 2 | 7 | 3 | FAIL |
| m1a1ha | 3 | 2 | 2 | 4 | 2 | 7 | 3 | FAIL |
| m1a1_aim | 2 | 2 | 2 | 0 | 2 | 2 | 1 | FAIL |
| m1a2_sepv2 | 3 | 2 | 2 | 2 | 2 | 5 | 2 | FAIL |
| m1a2_tusk | 4 | 2 | 2 | 3 | 3 | 7 | 3 | FAIL |
| m1a2_tejas | 3 | 2 | 2 | 4 | 2 | 7 | 3 | FAIL |
| abramsx | 3 | 2 | 2 | 3 | 2 | 7 | 3 | FAIL |
| t90a | 3 | 3 | 3 | 3 | 3 | 7 | 3 | FAIL |
| t62mv1 | 3 | 3 | 2 | 3 | 2 | 7 | 3 | FAIL |
| t90a_vladimir | 3 | 2 | 3 | 3 | 3 | 6 | 3 | FAIL |
| t64bv1 | 3 | 2 | 2 | 3 | 2 | 7 | 3 | FAIL |
| pt91m | 3 | 2 | 2 | 3 | 2 | 6 | 3 | FAIL |
| t72b_1987 | 3 | 3 | 2 | 3 | 2 | 7 | 3 | FAIL |
| t72b3m | 3 | 2 | 2 | 3 | 3 | 6 | 3 | FAIL |
| t72bu | 3 | 2 | 2 | 2 | 2 | 5 | 2 | FAIL |
| t90sm | 3 | 3 | 2 | 2 | 3 | 6 | 3 | FAIL |
| is7 | 2 | 2 | 3 | 3 | 3 | 8 | 3 | FAIL |
| is3 | 2 | 2 | 3 | 2 | 3 | 8 | 3 | FAIL |
| object279 | 3 | 2 | 3 | 2 | 4 | 8 | 3 | FAIL |
| is3_bergman | 3 | 2 | 2 | 2 | 3 | 4 | 2 | FAIL |
| kv2 | 3 | 2 | 4 | 4 | 3 | 8 | 3 | FAIL |
| is6b | 2 | 2 | 3 | 2 | 3 | 8 | 2 | FAIL |

## Cross-family systemic failures (fix these once, family-wide)

1. **Road wheels are flat discs everywhere.** No hub cylinder, no bolt ring, no
   lightening holes, no separate dark rubber sidewall, no rim lip. kv2/is7 have faint
   ring detail; everything else is a shaded disc. Build one parametric wheel
   (hub + bolt circle + spokes/holes + steel rim + rubber tire torus) and use it in
   every family. Add return rollers where the packet lists them; none are modeled.
2. **One clay material per tank.** Hull, turret, wheels, skirts, gun and fittings share
   one albedo. The masks now support hullDark/hullRubber/hullGlass/turretDark etc. —
   use them: black rubber tires and skirt lips, gunmetal tracks, dark canvas mantlet
   covers, glass/optics, steel stowage. The russia track rust tone currently LEAKS as an
   orange stripe above the fender line (t90a, t62mv1, t72*, t90*) — clamp the track path
   below the fender or mask its top edge.
3. **Guns lack their signature furniture.** No bore evacuator on any 2A46 tube
   (t62mv1's 115 mm also bare); no muzzle brake on is3/is6b (both packets call for one);
   thermal sleeves and MRS collars missing on NATO tubes; several UK tubes exit at the
   turret BASE (comet, charioteer) or kink at the root (chieftain5, mask G=0).
4. **Mantlets are square socket boxes.** On is7/is3/kv2 the boxed collar visibly
   disconnects from the turret face at full depression, opening a dark void into the
   turret. Model cast saddle mantlets that stay seated through the elevation range.
5. **ERA is glued on wrong (russia family).** t62mv1/t64bv1/pt91m/t72b_1987 wear a
   single necklace of tiles around the dome midline; the real fits are front-arc brick
   RAFTS (K-1), clamshell wedges (K-5), or tile fields (ERAWA) plus GLACIS rafts —
   which are absent on every glacis. t72bu's K-5 reads as radial turbine fins. No
   Shtora dazzler "eyes" on any T-90-family tank though three packets name them.
6. **Glacis plates are one empty facet on all 37.** No splash boards, headlight pods
   with brush guards, tow eyes/shackles, driver periscope humps or hatches, bow MG
   balls (m26/m45/m46/m47 packets require one). Headlights are painted dark dots.
7. **No deck/fender furniture.** Engine decks are flat (grille decals at best) — no
   louver banks, fuel caps, exhausts (M46 fender mufflers, T-64 left exhaust, IS-7 twin
   rear ports, Warrior left cowl all missing); fenders carry no stowage boxes, tools,
   tow cables, or fuel drums (T-72/T-90 rear drums absent family-wide).
8. **Roof furniture is placeholder.** AA MGs are stick-blocks on posts; cupolas are
   bare drums (M19 without vision blocks, IS domes without hatch rings); smoke
   dischargers are painted dots or 3-nub strips instead of tube clusters; CROWS/RWS are
   plain cubes on masts.
9. **Floating/detached geometry ships on 8+ tanks:** chieftain5 + abramsx corner mud
   plates hover at the track corners; charioteer/comet/challenger_cruiser (and a thin
   rod on centurion3/5) have a bent cable floating over the deck; t62mv1 has a tilted
   drum lying through the roof; m1a2_sepv2 has a box hovering beside the mantlet;
   m1a1_aim shows a detached plate and has NO TURRET. The articulation board catches
   all of these — it must be part of every tank's exit gate.
10. **No cast/weld character.** IS pikes have no weld beads, cast domes (m60, t90a,
    IS-family) are perfect lathe surfaces, KV-2/Comet plate seams carry no rivet rows
    (charioteer's rivet dots prove the technique is available).
11. **Broken reference GLBs poison the oracle** for the 11 tanks listed above: the
    silhouette score rewards matching a turretless reference. Fix or quarantine those
    references before trusting any automated number for these ids.

---

## patton family

### m26_pershing — 2/3/3/2/2/6/2 — FAIL
Reference GLB is broken (sunken turret; packet confirms); identity judged from the packet.
- Turret is a bare egg: add commander cupola (low drum + split hatch) right-rear, oval loader hatch left, pintle M2 .50cal behind the cupola, ventilator dome, and an external cast mantlet with coax port — the tube currently rises out of a plain hole.
- Gun: no double-baffle muzzle brake at rest (M3 90 mm cue) and the tube is pencil-thin; add the brake block and a slight cone taper.
- No bow MG ball on the right glacis — signature M26 cue; add hemisphere + MG stub.
- Road wheels: LEFT-tier means paired bogie wheels with bolted hubs, lightening holes and rubber tires + 5 return rollers; procedural wheels are flat discs, rollers absent.
- Glacis: single facet, zero fittings — driver + co-driver hatches with periscopes, 2 headlight pods with brush guards, tow shackles, siren.
- Fenders: add full-length fenders with 2-3 stowage boxes/side + pioneer tool rack; hull sides are bare slabs.
- Engine deck: twin louvered grille banks + fuel caps; currently featureless.
- Rear plate: exhaust deflector, idler adjuster arms, spare track links (2 generic boxes now).
- Track: add end-connector nubs + guide horns and sag; bottom-run ribs are uniform.
- Materials: separate black rubber tires, gunmetal track, steel cable from the single olive clay.

### m45_patton — 2/3/3/2/2/6/2 — FAIL
Broken reference (same Pershing file family). Close-support identity is not readable.
- Main gun must be the SHORT fat 105 mm M4 howitzer (~L/22) in the counterweighted M71 shield — the tube in the +elev articulation cell reads long and thin; shorten, fatten, add the heavy shield casting.
- The bare MG stick at the turret front-left floats without a mount; model the coax in the shield or remove.
- Turret: cupola + loader hatch + pintle M2 + ventilator (same kit as m26; roof has one disc).
- Bow MG ball + driver hatches + headlights with guards on the glacis (empty facet now).
- Wheels: hubs + holes + rubber ring + 5 return rollers (flat discs now).
- Fenders with stowage boxes; engine deck grilles; rear exhaust deflector.
- Track end connectors + sag.
- Materials separation (one clay).

### m46_patton — 2/3/3/2/2/6/2 — FAIL
Broken reference. The two M46 signatures from the packet are both missing.
- Add the big fender MUFFLERS on both rear fenders — the M46's loudest cue, absent.
- Add the track tension idler wheel between last road wheel and sprocket (packet cue).
- Gun: 90 mm M3A1 needs bore evacuator + single-baffle brake; also the tube exits at hull-deck height under the turret lip in the hero view — raise the axis to the mantlet center.
- Turret kit: cupola, loader hatch, pintle M2, ventilator, cast mantlet (bare egg now).
- Bow MG ball + headlight pods + tow shackles on the empty glacis.
- Wheels: hubs/holes/rubber + return rollers; fenders + stowage boxes.
- Engine deck grilles; rear plate exhausts.
- Materials separation.

### m47_patton — 2/3/3/3/2/6/3 — FAIL
Broken reference. Rangefinder blisters are attempted (two cheek bumps) — the rest is empty.
- Shape the M12 blisters into housings with end caps (current bumps are unreadable at 10 m).
- Needle-nose turret needs the cupola + loader hatch + ventilator + long bustle stowage rack; roof is bare.
- Gun: M36 cylindrical blast deflector + small bore evacuator missing; tube is a plain cylinder.
- Bow MG ball (last US tank with one — packet cue), driver hatches, headlights, tow eyes: glacis empty.
- Wheels: hubs/holes/rubber + rollers; flat discs now.
- Fender line with stowage; engine deck grilles; rear exhausts.
- Track connectors + sag; materials separation.

### m60a1 — 3/3/3/3/3/8/3 — FAIL
Intact, detailed reference. Silhouette is close (90.8) — the surfaces are a tier apart.
- Road wheels: add hub cylinder + bolt ring + open holes + black rubber sidewall on all 6, plus the 3 return rollers with brackets; LEFT's aluminum wheels are unmistakable, procedural are dark discs.
- M19 cupola: add the 7-vision-block band, hatch rib, and M85 barrel stub; currently a bare drum.
- Searchlight: model the AN/VSS-1 box with lens face + yoke above the mantlet (packet keeps it on the A1); only a small cheek box exists.
- Mantlet: add the M140 mount collar + canvas dust-cover wedge; gun exits a plain slot; add MRS collar at the muzzle.
- Turret dome: grab rails along both cheeks, lifting eyes, bustle rack with stowage across the rear (LEFT shows rails + rack + cans); dome is a naked lathe.
- Glacis: splash-board strip, 2 headlight pods with brush guards, tow eyes, driver hatch + periscope hoods; single facet now.
- Sponsons: fender boxes both sides + tow cable run with cleats (LEFT has cable across the left hull).
- Engine deck: raised louvered panels + fuel caps; rear plate exhaust grilles.
- Track: end connectors + guide horns + sag (segmenting exists, texture flat).
- Materials: rubber/steel/canvas/glass separation — everything is one olive clay.

### m60a3 — 3/3/3/3/3/8/3 — FAIL
Same base as m60a1 plus variant misses; the faceted turret front reads welded, not cast.
- Smooth the planar facet breaks on the turret front/right into the continuous cast needle-nose (LEFT is a smooth casting; procedural shows hard Leopard-like planes).
- Thermal sleeve on the M68 (A3/TTS identity cue): two fat sleeve segments with clamp rings; tube is bare.
- Remove the searchlight expectation, add the crosswind sensor mast at the turret rear + TTS sight blister.
- M19 cupola vision blocks + M85 stub (bare drum now).
- Wheels: hubs + holes + rubber + 3 return rollers (flat discs).
- Glacis: splash board, headlight pods + guards, tow eyes, driver hatch hoods.
- Bustle rack + cheek grab rails + lifting eyes on the naked dome.
- Engine deck louvers + rear exhaust grilles.
- Materials separation incl. black sleeve vs olive turret.

## uk family

### chieftain5 — 3/2/2/2/2/3/2 — FAIL
Worst silhouette in the fleet (56.7, gun mask 0). Wrong construction language throughout.
- Turret: replace the faceted welded box (flat cheek panel with a row of drilled dots) with the rounded cast Mk.5 turret and forward-leaning mantlet-less "chin".
- Gun: the L11 kinks at its base and misses the mask entirely — re-seat on the beak axis; add thermal sleeve, fume extractor swell, and muzzle counterweight collar.
- Hull front: build the reclined-driver low prow with its glacis crease; current bow is a vertical slab.
- Add full-length side skirts (Mk.5 cue; LEFT is skirted) — wheels currently peek from under a bare sponson slab.
- Attach or delete the four dark corner plates hovering at the track corners (visible through the turntable).
- Roof: NBC pack on the bustle, commander cupola with sight ring, stowage bins wrapping both sides (LEFT is ringed with bins).
- Searchlight housing on the left cheek.
- Running gear: 6 paired wheels with hubs + 3 return rollers, respaced to reference; tracks mask scored 22.
- Glacis kit: headlight pods, splash board, tow eyes; fender bins along the sponsons.
- Materials: skirt/rubber/steel/canvas separation (single green clay).

### charioteer — 4/2/3/3/3/5/3 — FAIL
Broken reference (turret sunk). Procedural turret mass is credible; details betray it.
- Re-seat the 20-pdr at the turret face CENTER in a narrow internal mantlet; it currently emerges at the turret base seam (mask G=14).
- Delete or attach the dark bent cable hovering over the front deck (one end in mid-air).
- Add the 20-pdr Type B fume extractor mid-tube + muzzle counterweight; tube is a bare cylinder.
- Turret: cupola ring + split hatches, gunner periscope, corner lifting eyes, bustle stowage bin, smoke discharger boxes on the cheeks (faces are naked; the rivet seams on the hull show the right instinct).
- Cromwell hull: twin rear exhaust cowls with fishtails on the deck rear.
- Panniers: boxed step + 2 bins per side; hull sides are single tall plates.
- Wheels: 5 Christie wheels need rubber tires, 6-bolt hubs, open spokes (flat discs with a pin dot now).
- Bow: driver visor plate + hull MG ball + headlight stalks.
- Track: guide horns + end connectors; upper run should tuck under the pannier line.
- Materials: rubber/steel/canvas separation.

### comet — 3/2/3/3/3/5/3 — FAIL
Broken reference. Same base problems as charioteer plus Comet-specific misses.
- Re-seat the 77 mm HV in the bolted internal mantlet at face center; it exits the turret/hull seam (mask G=0).
- Delete/attach the floating bent cable left of the turret front.
- Turret: rear bustle bin, cupola vision ring, loader hatch, smoke discharger cluster right cheek, lifting eyes.
- Running gear: 5 wheels + FOUR return rollers (Comet cue) with sag; top run currently rides a bare slab.
- Bow: Besa MG ball housing (model the ball, not a dark dot), driver visor with hinges, headlights on mudguard tips.
- Twin fishtail exhaust cowls on the rear deck.
- Track guards with mud flaps + 2-3 fender bins; hull side is one slab.
- Engine deck: raised louver grilles (flat decal rectangle now).
- Track texture: end connectors, guide horns, darker steel tone.
- Materials separation.

### centurion3 — 3/2/3/3/3/5/3 — FAIL
Broken reference. The roof block reads as a modern RWS on a 1950 tank.
- Replace the RWS-like roof box with the low commander cupola + loader hatch discs; move antennas to bustle-corner bases.
- Attach/delete the thin rod floating diagonally over the right deck.
- Gun: 20-pdr B-barrel fume extractor + recessed internal mantlet with canvas wedge; bare cylinder in a collar now.
- Turret: big rectangular bustle bin + cheek smoke discharger clusters + lifting eyes; the "dots" on the cheek are paint.
- Glacis: too long and empty — shorten to reference proportions; add driver hatch lids, headlight pods with guards, splash rail, tow eyes.
- Skirts: cut into ~6 panels with gaps + lifting handles (single flat plate now).
- Exposed wheels under the skirt line need hubs + rubber; lower run needs sag.
- Engine deck: Centurion louver field + fuel fillers + rear track-link rack.
- Track: end connectors/guide horns, darker tone.
- Materials separation.

### centurion5 — 3/2/3/3/3/5/3 — FAIL
Same build as centurion3; every centurion3 bullet applies. Additional variant misses:
- L7 105 mm needs its prominent mid-tube fume extractor (LEFT tube carries the fat cylinder; procedural is a plain pipe).
- Turn the three painted cheek dots into a real 2x6 smoke discharger cluster.
- Distinguish the Mk.5/2 from centurion3 (per packet) — currently the two procedurals are visually identical except the decal.

### challenger1 — 3/3/3/4/3/7/3 — FAIL
Intact reference. Angular mass is roughly right; every fitting is missing or crude.
- Add the TOGS thermal barbette beside the gun (LEFT shows the boxy housing) — the tank's most recognizable cue after the hull shape.
- Replace the oversized roof RWS block with the commander's pintle GPMG + sight housing; add gunner sight cowl + loader cupola.
- Wrap turret sides/rear with tubular stowage baskets full of kit (LEFT) — procedural cheeks are bare.
- Smoke discharger clusters (2x5) both cheeks.
- Gun sits low in a bare wedge: raise the trunnion line, add mantlet dust-cover collar + MRS muzzle collar (sleeve + extractor already hinted, keep).
- Skirts: cut into the 8 panels with bolts + lifting slots.
- Glacis: splash board, twin headlight clusters in guards, tow point, travel-lock crutch on the nose.
- Rear: long-range fuel drum rack or rear bin (tail is a bare wall on the turntable).
- Wheels: hub caps + rubber rings + sag on the exposed lower run.
- Materials: skirt rubber vs hull steel vs sleeve canvas.

### challenger_cruiser — 3/2/3/3/3/6/3 — FAIL
Broken reference (turret sunk). Tall A30 turret mass reads; surfaces are naked.
- Fix the floating bent tow-cable rod over the glacis (one end in mid-air).
- Turret: pistol port discs, corner lifting lugs, cupola vision blocks, loader split hatch, rear bin; faces are blank slabs with a decal.
- Gun: 17-pdr slim tube with sleeve step + recoil housing collar at a narrow internal mantlet slot; currently pokes from a bare face.
- Bow: replace the ambiguous dark dots/hemisphere with driver visor + hooded periscopes; headlight stalks.
- Engine deck: raised louver banks instead of the flat decal; fuel caps + intake mushroom.
- Fenders: full track guards with mud flaps + stowage boxes.
- Wheels: Christie wheels with tires + 6-bolt hubs + open spokes.
- Cover the top run with guards; add lower-run sag.
- Rear plate: exhaust cowls + idler tension arms + spare links.
- Materials separation.

### fv510 — 3/2/3/2/3/6/3 — FAIL
Intact reference. The RARDEN is unrecognizable; the bow misses its ribbed armor bank.
- Replace the fat muzzle stub with the correct long thin 30 mm RARDEN (~2 m) with stepped sleeve + flash hider.
- Bow: add the horizontal-rib appliqué bank across the nose (LEFT) + driver hatch + periscopes on the right glacis shoulder.
- Turret: gunner/commander sight hoods, 2 hatch rings with lids, smoke discharger clusters (2x4), rear stowage basket; faces are bare.
- Align the loose dark boxes hovering at odd angles near the front-left hull corner into a proper fender stowage row (or remove).
- Side: layered skirt with access steps + bin row; current side is one slab.
- Engine deck: raised louvers + the big LEFT-side exhaust cowl (Warrior signature).
- Rear: troop door frame + rear bin rack (turntable rear is bare).
- Wheels: 6 with hub caps + rubber; add return roller bumps.
- Roof: antenna bases + wire-cutter; rods sprout bare from the deck.
- Materials: rubber skirt lips, steel track, canvas bins vs single camo clay.

## abrams family

### m1a2 — 3/2/2/3/2/7/3 — FAIL
Intact, excellent reference. Procedural roof is boxes-on-slabs; hull is an empty wedge.
- CROWS-LP: replace the cube-on-a-stick with base ring + sensor head with lens plate + M2 barrel and cradle (LEFT shows the full station).
- Smoke dischargers: two angled 6-tube banks per cheek; the 3-nub block is unreadable.
- Roof: CITV with faceted head (left-forward), GPS doghouse with glass slit, both hatch rings with periscope fences.
- Bustle rack: rail rack wrapping the rear with stowage volumes; rear roof is bare slabs.
- Mantlet: M256 mantlet with canvas creases + coax port + MRS muzzle collar; gun exits a flat square block.
- Glacis: driver periscope hump, twin headlight boxes in guards, tow eyes, splash strip — ONE camo facet now.
- Skirts: 7 panel cuts with diagonal front panel, bolts, lift handles + sponson step line.
- Rear: IR-suppressed exhaust grille + taillight boxes (turntable rear is a wall).
- Track/wheels: sprocket ring teeth + idler + hub discs under a raised skirt cut; nothing is visible today.
- Materials: skirt composite vs hull steel vs black rubber; add the LEFT's two-tone panel read.

### m1a1 — 3/2/2/4/2/7/3 — FAIL
Intact reference. Best-in-family turret attempt (station tower, bustle rails, nubs) — still greybox tier.
- Commander's station: M2 with cradle, barrel and hatch ring instead of stacked cubes.
- Add loader's skate-rail 7.62 MG on the left hatch (roof-left is empty).
- Mantlet: square block to M256 mantlet with cover folds + coax port; MRS collar at muzzle.
- Cheeks: real 2x6 smoke discharger banks + lifting eyes + cable stow.
- Bustle rack: add mesh floor + sponson box extensions; rails currently hang empty.
- Glacis: periscope hump, headlight pods + guards, tow eyes, splash strip.
- Skirts: panel cuts + bolts + diagonal lead panel; single plate now.
- Rear plate: exhaust grille + taillights + infantry phone box.
- Blow-off panel etch lines on the bustle roof (LEFT shows them).
- Materials separation; wheels/sprocket visible under skirt cut.

### m1a1ha — 3/2/2/4/2/7/3 — FAIL
Identical build to m1a1 (correct per packet — externally near-identical). Every m1a1 bullet applies verbatim; nothing differentiates HA and that is acceptable, but it inherits every failure too.

### m1a1_aim — 2/2/2/0/2/2/1 — FAIL (catastrophic)
The procedural renders with NO TURRET AND NO GUN in the hero pair; articulation shows a stub tube at deck level and a detached plate floating mid-hull at -90 yaw. The reference GLB is itself sunken-turret, which is why the mask still says 77.3 — the oracle rewarded matching a broken reference.
- Rebuild from the m1a1 canonical turret + M256 (packet: externally an M1A1); this is a registration/assembly bug, not a detailing task.
- Remove the floating plate visible in the -90 articulation cell.
- Quarantine or repair the m1a1_aim reference GLB so the fidelity score means something.
- After the turret exists, apply the full m1a1 bullet list.

### m1a2_sepv2 — 3/2/2/2/2/5/2 — FAIL
Intact reference. Turret proportions are wrong and a part floats beside the mantlet.
- Remove/attach the grey box hovering in mid-air left of the mantlet (hero + articulation).
- Turret: pull the roof down ~15% and sweep the ballooned cheek boxes back; the front face is a vertical slab vs LEFT's low swept profile.
- CROWS II: proper pedestal + sensor housing + M2 with cradle and ammo box on the tall mast (bare box-on-pole now).
- Smoke dischargers: two 6-tube banks per cheek.
- Mantlet: M256 collar + coax + canvas folds; MRS muzzle collar.
- Glacis: periscope hump, headlight pods, tow eyes, splash strip.
- Skirts: panel cuts + bolts + sponson shelf line.
- Bustle: rail rack + stowage; rear roof is bare boxes.
- Rear plate: exhaust grille + taillights.
- Materials separation.

### m1a2_tusk — 4/2/2/3/3/7/3 — FAIL
Intact reference. The only tank that attempts its variant kit (ARAT rows + rails) — scale is wrong.
- ARAT-1: shrink the six giant bricks per side to the real two-course tile array (many small angled tiles), upper course angled per LEFT.
- Add the loader's armored gun shield (LAGS) — signature TUSK cue, absent.
- Add the rear slat cage over the exhaust quarter + tank-infantry phone box (both packet cues).
- CROWS: full station instead of the cube tower.
- Mantlet + coax + MRS collar (square block now).
- Glacis: periscope hump, headlights in guards, tow eyes + TUSK belly-armor lip under the toe (LEFT shows it).
- Close the bustle rail frame corners (right rail hangs past the turret corner) and add mesh + stowage.
- Track: sprocket teeth + hub discs under the skirt cut.
- Rear plate: exhaust grille + taillights.
- Materials: ERA tiles as steel vs skirt rubber; one camo clay now.

### m1a2_tejas — 3/2/2/4/2/7/3 — FAIL
Same procedural as m1a1 with a different decal; LEFT is the detailed Tejas-skin M1A2. All m1a1 bullets apply. Variant-specific:
- Packet says CROWS-fitted M1A2-style roof: add the CROWS mount (absent) without the SEP mast farm.
- Differentiate from m1a1/m1a1ha somehow visible (roof kit), or the three ids read as one tank.

### abramsx — 3/2/2/3/2/7/3 — FAIL
Intact reference. Low-profile mass is roughly there; everything on it is a slab or decal.
- 30 mm RWS: build the XM914 mount (slew ring, cradle, barrel, sensor box); currently stacked slabs with a painted slit.
- Bevel the two rectangular cheek slabs into the faceted low wedge with corner sensor pods (LEFT).
- Fix the four dark corner plates hovering at the track corners (turntable shows daylight under them).
- Muzzle: XM360 angular shroud + pepperpot brake (plain collar now).
- Hull front: driver periscope hump + tow eyes + the sharp splitter undercut below the nose.
- Skirts: panel cuts + the angular front skirt cutout.
- Rear deck: hybrid-drive intake/exhaust louver panels.
- Antennas: mount on turret-rear bases (bare rods from the deck now).
- Track: sprocket ring + hub discs + sag under the skirt cut.
- Materials: gunmetal RWS + rubber skirt vs single camo clay.

## russia family

### t90a — 3/3/3/3/3/7/3 — FAIL
Intact reference. Dome silhouette good; ERA and optics language wrong or missing.
- Shtora-1 dazzlers: add the two "red eye" boxes flanking the mantlet — THE T-90A cue (LEFT shows both); absent.
- Kontakt-5: replace the flat rhombus stickers lying on the dome with volumetric two-course wedge boxes with gap seams and end plates.
- Gun: add the 2A46 bore-evacuator bulge + thermal sleeve clamp rings (smooth taper now).
- Glacis: K-5 chevron raft + V splash board + tow hooks; single facet now.
- Roof: NSVT with cradle + ammo box on the cupola ring (bare post-block now); ESSA sight housing ahead of the cupola.
- Turret rear: seat the snorkel stow tube properly + add bustle rack/bins (LEFT is ringed with baskets).
- Fix the orange track-edge stripe painting over the fender line (clamp track path or mask top edge).
- Skirts: rubber front flaps + K-5 side blocks on the forward third.
- Wheels: 6 ribbed wheels with hub caps + rubber rings (bare discs).
- Materials: ERA steel / rubber skirt / gunmetal track separation.

### t62mv1 — 3/3/2/3/2/7/3 — FAIL
Intact reference. ERA necklace + floating roof drum sink it.
- K-1 ERA: move the cube necklace off the dome midline into the real MV layout — 2-3 course brick arcs on both FRONT cheeks + brick raft on the glacis + skirt leading-edge bricks.
- Remove/re-seat the tilted cylinder lying through the roof (reads as a dropped snorkel); stow the OPVT tube on brackets at the turret rear.
- Gun: 115 mm U-5TS bore evacuator (~40% from muzzle); smooth tube now.
- Add the KTD-2 rangefinder box over the mantlet (packet cue).
- Roof: loader's DShK on a real pintle with ammo drum; commander cupola periscopes.
- Wheels: the 5 big "starfish" spoked wheels with rubber rims + the wide gap after wheel 1 (T-62 signature); currently faint evenly-spaced discs.
- Fenders: stowage box rows + rear fuel drum rack + unditching log at the hull rear.
- Cheek: replace the 3 painted dots with geometry (bolts/hooks).
- Skirts: ribbed rubber sheets, not a plate.
- Materials separation (brick steel vs paint).

### t90a_vladimir — 3/2/3/3/3/6/3 — FAIL
Intact reference; this id's identity is the HEAVIER roof/stowage — exactly what's missing.
- Build the commander's roof cluster: panoramic sight tower + met mast + boxes (LEFT is crowded; procedural has two small boxes).
- Shtora dazzlers flanking the mantlet: absent.
- Fix the red texture streak under the gun root at the mantlet.
- Gun: bore evacuator + sleeve clamps.
- K-5: keep the standing wedge plates but close them into two courses with end caps.
- Rear-deck stowage: bins + crate rack (packet cue; deck bare).
- Glacis: K-5 raft + splash board + tow hooks.
- Skirts: forward K-5 blocks + rubber rear.
- Wheels: ribs + hubs; orange track-edge stripe fix as t90a.
- Materials separation.

### t64bv1 — 3/2/2/3/2/7/3 — FAIL
Intact reference. Wrong running gear family and misplaced ERA.
- Running gear: T-64's 6 SMALL dual road wheels + 4 visible return rollers (packet calls this the distinction from T-72) — currently generic hidden discs.
- K-1: front-cheek brick arcs + glacis raft + skirt leading edge, not a midline tile necklace.
- Gun: 2A46-2 bore evacuator + sleeve joints; the base collar over-thick and stepped.
- Roof: NSVT mount + sight; clamp the two snorkel drums into a rack (they sit loose).
- Glacis: splash V-board + driver periscope + tow hooks.
- Keep the hull-rear log; add its brackets (tan strip floats now).
- Turret rear basket + bustle stowage.
- Rear deck: louvers + the T-64 left-rear exhaust port.
- Track: guide horns + sag; orange edge fix.
- Materials separation.

### pt91m — 3/2/2/3/2/6/3 — FAIL
Intact reference. ERAWA attempt is the right instinct in the wrong place; variant furniture absent.
- ERAWA tiles: from midline ring to a regular tile FIELD over the turret front arc + chevron wedge stacks at the cheek corners + glacis raft + skirt fronts (LEFT layout).
- Tall met mast on the turret rear (packet signature) — current stub is a third of the height; add sensor cross.
- Rear turret basket: give the flat rail frame depth + mesh + stowage; LEFT's basket wraps the rear arc.
- Engine deck: raised S-1000R powerpack stack with louvers (packet cue; deck flat).
- Gun: 2A46MS evacuator + sleeve clamps.
- Roof: commander sight + cupola detail; MG is a bare block.
- Twin fuel drums on rear brackets (LEFT carries them).
- Skirts: segmented rubber + forward tile course.
- Wheels: 6 ribbed + hubs; orange edge fix.
- Materials: tiles darker steel vs paint.

### t72b_1987 — 3/3/2/3/2/7/3 — FAIL
Intact reference (note: its OWN rig shows a floating hatch ellipse at +90 in the articulation row — harness/reference rig bug worth filing). "Super Dolly Parton" cheeks are the variant's name and they are bare.
- K-1 brick RAFTS on both bulged front cheeks in 3 courses + glacis raft + first skirt panels; the midline tile necklace is not K-1.
- Gun: 2A46M bore evacuator + sleeve.
- Move the tan log off the turret rear to the hull rear plate with brackets.
- Smoke launcher bank (902) on the left cheek (LEFT shows the cluster).
- Roof: NSVT with cradle + drum on the cupola; Luna IR spotlight by the mantlet.
- Wheels: 6 ribbed wheels + hubs (invisible now); orange edge fix.
- Glacis: V splash board + driver periscope.
- Fenders: stowage boxes + rear fuel drums.
- Skirts: rubber with panel joints + diagonal front cut.
- Materials separation (keep the log's tone break — it is the only one on the tank).

### t72b3m — 3/2/2/3/3/6/3 — FAIL
Intact reference. Standing wedge plates are the family's best ERA read; variant kit missing.
- Sosna-U: the armored sight box belongs RIGHT of the gun, ~2x the current centered cube, with split doors (LEFT shows the tall housing).
- Relikt: close the wedges into two-course cassettes with seams + cheek corner stacks.
- Skirts: 3 rows of sagging soft bags + REAR SLAT screens over the engine quarter (both packet cues; flat plate now).
- Gun: 2A46M-5 evacuator + sleeve clamps.
- Roof: NSVT on the ring with shield (stick-on-a-bar now).
- Bustle basket: mesh + rolls in the empty rail frame.
- Glacis: Relikt raft + splash board + periscope hump.
- Wheels: ribs + hubs; sprocket teeth; orange edge fix.
- Rear deck: louvers + exhaust.
- Materials: bags canvas / cassettes steel / skirt rubber.

### t72bu — 3/2/2/2/2/5/2 — FAIL
Intact reference. The K-5 "radial fin" skirt around the dome is the worst ERA read in the fleet.
- Replace the radial fins with the correct Kontakt-5 clamshell: two-course wedges on the front 60° arc + flat K-5 tiles along the sides.
- Shtora-1 dazzlers flanking the mantlet (the packet's "K-5 T-72B with Shtora eyes" IS this tank): absent.
- Gun: 2A46M evacuator + sleeve.
- Glacis: K-5 chevron raft + splash board; bare facet now.
- Roof: NSVT + gunner sight; nearly empty.
- Turret rear: snorkel stow + basket (rail frame exists; fill it).
- Skirts: rubber front flaps + panel joints.
- Wheels: 6 ribbed + hubs; orange edge fix.
- Rear fuel drums.
- Materials separation.

### t90sm — 3/3/2/2/3/6/3 — FAIL
Intact reference. Fundamental construction mismatch: the MS is a WELDED flat-sided turret.
- Replace the cast dome with faceted vertical cheek panels + the full-width squared bustle (LEFT silhouette); the dome is the wrong turret family.
- UDP RWS: add MG barrel + yoke + sight head to the brown block (good tone break — keep it).
- Panoramic commander sight on its tall forward-right mast (LEFT tower): absent.
- Bustle: slat/grille rear face + top stowage boxes (packet: removable bustle with slat rear).
- Relikt: flat cassette rows with seams on the cheeks.
- Gun: evacuator + sleeve clamps.
- Glacis: Relikt raft + splash board + driver hump.
- Skirts: hard panel fronts + bag rears.
- Wheels: 6 ribbed + hubs; orange edge fix.
- Materials: extend the RWS tone break to skirts/track/bustle mesh.

## soviet-heavy family

### is7 — 2/2/3/3/3/8/3 — FAIL
Intact reference. Best silhouette tier (89); the giant dome is completely naked.
- Dome fittings: twin hatch rings with lids, periscope pods, and the twin KPVT AA mount on the rear roof (LEFT shows the full cradle; procedural has one stick-block).
- Mantlet: replace the square collar box with the cast saddle blending into the dome + its bolt-bump ring (LEFT's most visible turret feature). At -8° the current box visibly separates from the dome leaving a dark slot — must stay seated through the elevation range.
- MG ports: LEFT shows barrels flanking the mantlet (IS-7 carried multiple SGMTs); none exist.
- Pike nose: weld seam ridges along the pike edges + tow hooks at the toes + driver hatch cutline.
- Fenders: long fender bins with latches down both sides (LEFT); procedural fenders are empty strips.
- Wheels: 7 big wheels per side with hub caps + rims out of the shadow (packet: no return-roller gap).
- Rear deck: louver bank + the twin round exhaust ports at the rear corners (IS-7 signature).
- Track: keep the good link read; add sag + end connectors on the side runs.
- Headlights: geometry with brush guards (dark decal dots now).
- Materials: track steel / MG gunmetal / rubber-less steel wheels vs one clay.

### is3 — 2/2/3/2/3/8/3 — FAIL
Intact reference. Missing its gun's identity and every dome fitting.
- D-25T double-baffle muzzle brake (packet: German-pattern) — tube ends bare; this alone breaks identity.
- Mantlet: square socket to cast saddle + coax port; the collar opens a gap at -depression.
- Dome: commander cupola ring, twin oval hatches, DShK AA mount with cradle (stick-block now), 4 lifting bosses, side grab rails (LEFT shows rails).
- Rear sponsons: 4 cylindrical external fuel tanks on brackets (packet cue) + smoke canisters at the tail.
- Pike: weld seams + driver periscope pod + tow hooks.
- Fenders: stowage boxes + tools; bare strips.
- Wheels: 6 steel wheels with rims/hubs (shadow discs).
- Engine deck: the V-hump louvered deck; currently a flat wedge.
- Track: sag + end connectors (top-run links good).
- Materials separation.

### object279 — 3/2/3/2/4/8/3 — FAIL
Intact reference. Best hull character of the fleet (elliptical shield + rivet seams) — but the whole gimmick (4 tracks) is unreadable and the dome is naked.
- Show the FOUR-track running gear: separate the twin beams with a visible gap and two track pairs per side; from the front it currently reads as a normal 2-track tank.
- M-65 muzzle: slim multi-slot brake (packet cue; tube ends bare).
- Dome: twin hatch rings + periscope pods + IR spotlight by the mantlet + lifting bosses + handrails (LEFT has all; procedural has none).
- Mantlet: cast collar with recoil sleeve step (plain tube sleeve now).
- Bow crest: driver hatch + periscopes; tow hooks on the pike tips.
- Rear shield slope: exhaust ports + louvers (dark decal patch now).
- Keep/extend the rivet seam rows — right instinct, extend to the shield's plate joints.
- Track: sag + link facets visible on the outer runs.
- Materials: steel track/wheels vs painted shield.

### is3_bergman — 3/2/2/2/3/4/2 — FAIL
Broken reference (turret sunk; mask T20 meaningless). Judged against the real IS-3.
- Turret: the flat truncated-cone pan must become the IS-3 squat semi-hemispherical dome, standing proud on its ring — it currently sits flush like a lid on the deck.
- D-25T double-baffle brake: absent (bare tube).
- Mantlet: fat straight collar to cast saddle; move the gun axis to the dome's center-front.
- Cupola cylinder: low commander ring + twin hatches + DShK ring mount.
- Seat the two half-pipe snorkel/stow cylinders on deck brackets (they float) + deck louvers.
- 4 external fuel tanks on the rear sponsons.
- Pike: keep rivet seams; add tow hooks + driver periscope.
- Fenders: boxes + tools.
- Wheels: expose 6 wheels with hubs below the sponson line (black void now).
- Repair/quarantine the bergman reference GLB.

### kv2 — 3/2/4/4/3/8/3 — FAIL
Intact, outstanding reference. Best procedural mass + wheels in the batch; the mantlet socket and naked plates fail it.
- Mantlet: replace the huge boxed recess (a dark void that swallows the howitzer at -depression) with the round bolted mantlet DISC + inner sleeve (LEFT shows the bolt ring).
- Turret plates: rivet rows along every seam + the two side vision slits + rear MG ball (LEFT shows all); faces are naked slabs with a "2".
- Roof: two hatch rings + periscope pods (single stub now).
- Bow: drape the two tow cables with shackles over the glacis (LEFT signature clutter) + driver visor + hull MG ball.
- Fender gussets: 3 triangular supports under each fender lip (LEFT); fenders float unsupported.
- Headlight + horn on the left fender front.
- Wheels: good ring detail — add hub bolts + steel rim highlight; darken track to gunmetal.
- Engine deck: mesh intake squares + round engine hatch.
- Rear: twin exhaust pipes on the tail plate.
- Materials: steel track vs paint; turret and hull read as one plastic.

### is6b — 2/2/3/2/3/8/2 — FAIL
Intact reference. Naked blob dome + brakeless gun on a 90-silhouette chassis.
- D-30 compact muzzle brake (packet cue): bare tube tip now.
- Turret ring collar: the egg must sit on its visible cylindrical collar (packet cue); it currently melts into the deck.
- Dome fittings: commander cupola + loader hatch + DShK ring + periscope pods + lifting bosses; the egg is completely bare.
- Mantlet: cast saddle + coax port (plain sleeve).
- Bow: driver periscopes + tow hooks + headlight pods (two painted dots now).
- Fenders: stowage boxes + tools; sloped rear deck needs its louver rows (IS-2-style, packet cue).
- External fuel tanks on the rear sponsons.
- Wheels: 6 big wheels with hubs/rims out of the shadow void.
- Track: sag + end connectors (links present).
- Materials separation.

---

## Where to start (highest visual leverage, in order)

1. Fix the two outright breakages: m1a1_aim (no turret) and the floating-part set
   (chieftain5/abramsx corner plates, UK deck cables, t62mv1 roof drum, m1a2_sepv2 mantlet box).
2. Ship the parametric wheel (hub/bolts/holes/rubber) + return rollers — it upgrades all
   37 tanks at once and is the single biggest "toy vs asset" tell.
3. Material pass wiring rubber/steel/canvas/optics into the already-working detail masks;
   kill the russia orange track-stripe leak.
4. Gun furniture pass: evacuators, brakes, sleeves, mantlet saddles that survive depression.
5. Family ERA rework (russia): front-arc rafts/wedges + glacis rafts + Shtora eyes.
6. Fittings kits per family (hatches, cupola blocks, discharger clusters, racks, lights,
   fender bins, deck louvers, exhausts) placed per the packet cues quoted above.
7. Repair or quarantine the 11 broken reference GLBs so the automated oracle stops
   rewarding turretless matches.
