# Modern Armor Roster — Modeling + Stats Reference

Definitive reference for the modern (post-1970, in-service-era) roster expansion: 27
vehicles — 23 MBTs, 2 IFVs, 1 TD, 1 casemate TD (existing Strv 103). Companion to
`docs/research/tank-roster.md` (the original 8-tank roster doc); the four vehicles already
shipped (M1A2 SEPv3, T-90M, Leopard 2A7, Strv 103) are cross-referenced, not re-specified.

Sources: Wikipedia, tanks-encyclopedia.com, army-guide.com, army-technology.com,
armyrecognition.com, globalsecurity.org, defense press releases. **All modern armor values
are open-source RHAe estimates** (real values classified) — game-design baselines, not
claims of fact. Visual proportions from public walkaround photo sets and manufacturer
imagery only; no ripped game assets consulted or downloadable from this plan.

Conventions (match `tank-roster.md` + `src/vehicles/specs.js`):

- **L/W/H** in meters; "overall length" = gun forward, "hull length" excludes overhang.
- **RHAe KE / CE**: estimated protection vs kinetic (APFSDS) / chemical (HEAT) in mm RHA
  equivalent. ERA is modeled as separate `kind:'era'` plates in the sim (see T-90M armor
  in specs.js); base + ERA are listed separately below.
- **APFSDS sim baseline**: the argument passed to `apfsdsPens(n)` in specs.js (it derives
  the 100 m / 1000 m / 2000 m curve). Calibrated against the shipped trio: M829A4 = 750,
  DM63 = 730, 3BM60 Svinets-2 = 640.
- **HP pools**: modern MBT envelope 2,000–2,700; cold-war-generation vehicles (M60A3,
  Leopard 1A5, Chieftain, Type 74) deliberately sit at 1,400–1,800 as lower-tier vehicles
  (precedent: Strv 103 at 1,100). IFVs 900–1,300.
- **Reverse speed**: modern MBTs capped at 25 km/h regardless of real figure (see the
  m1a2 spec comment — arcade envelope); Soviet-lineage tanks keep their genuinely awful
  4–11 km/h reverse as a defining handling trait.
- `bloom: BLOOM_MODERN`, `terrainResistance { hard 0.7, medium 0.8, soft 1.5 }` and
  `pivotStyle: 'neutral'` are the modern-MBT defaults; deviations are called out.

---

## Part 0 — Inventory & sourcing plan

### What exists on disk (2026-07-28 inventory)

**Shipped** (`public/models/tanks/`, `src/vehicles/specs.js`):
- `m1a2` M1A2 Abrams SEPv3 — sourced GLB (`m1a2_sepv3_dannzjs.glb`, CC-BY 4.0, dannzjs)
- `t90m` T-90M Proryv — procedural (post-round-5 rebuild, meets visual bar)
- `leo2a7` Leopard 2A7 — procedural (post-round-5 rebuild, meets visual bar)
- `strv103` Stridsvagn 103 — sourced GLB (CC-BY 3.0, Lukasz Wesiora), community TD

**Hunt deposits relevant to the modern roster** (`public/models/community-candidates/`,
license records verified in each folder; renders reviewed for this plan):
- `m60a3-toshueyi` — M60A3 Patton, CC-BY 4.0 (Jonathan To). Textured, MERDC-style camo,
  correct 6-wheel gear, M19 cupola, bore evacuator. **Excellent — integrate as-is.**
- `m1abrams-goyko` — M1 Abrams (base 105 mm), CC-BY 4.0 (Artem.Goyko). Textured desert
  patch camo, bustle rack, 7 wheels. **Good — ship as early M1.**
- `kf51-grip420` — KF51 Panther, CC-BY 4.0 (GRIP420). Textured digital camo, faceted
  concept turret, RWS. **Good — bonus flagship.**
- `t-90` (alexxx_xarchenko) — T-90 obr. 1992-pattern, CC-BY 4.0. UNTEXTURED clay but the
  geometry is superb: cast turret, Kontakt-5 glacis + turret wedges, Shtora emitter
  housings, smoke banks, correct 6-wheel gear. **Variant base for T-90A** (re-material via
  the existing `paintUntextured` path proven on `pziii_konserwa`).
- `stb1_haphazard` — STB-1, CC-BY 4.0 (Haphazard0587, Thingiverse CAD). Re-materialed
  solid; rounded turtle turret, 5 wheels, hydropneumatic stance. **Variant base for
  Type 74** (STB-1 is the Type 74 prototype; add IR searchlight + paint).

WW2/prototype deposits (kv1, kv2, tiger2, jagdtiger, sturmtiger, su101, t44, t30, maus,
e100, batchat 25t, cromwell, shermans, pziv…) are out of scope for this roster; the
Bat.-Chat 25 t was considered and excluded (1950s prototype, fails the post-1970 bar).
No Leopard 2, Challenger, Leclerc, Merkava, Type 99, K2 or Type 10 GLB landed —
provenance-clean permissive models of those do not circulate outside account-gated or
ripped channels (see ATTRIBUTION.md evaluation records), so they are procedural builds.

### Sourcing routes

- **sourced-ready** — clean permissive GLB already on disk; integration only.
- **variant** — CC-BY 4.0 derivative of an on-disk CC-BY base (legal and encouraged;
  record base model + author + "modified" note per CC-BY 4.0 in ATTRIBUTION.md).
- **procedural** — HD `tankFactory.js` build to the visual specs below. Procedural
  family reuse (e.g. Leo 2A6 sharing the 2A7 hull) is noted per vehicle but is not a
  license "variant".

| # | Vehicle | Nation | Era | Route | Base / file | Priority |
|---|---------|--------|-------|-------|-------------|----------|
| 1 | M1A2 Abrams SEPv3 | USA | Modern | sourced-ready (SHIPPED) | m1a2_sepv3_dannzjs.glb | 1 |
| 2 | T-90M Proryv | Russia | Modern | procedural (SHIPPED) | tankFactory | 1 |
| 3 | Leopard 2A7 | Germany | Modern | procedural (SHIPPED) | tankFactory | 1 |
| 4 | Stridsvagn 103 | Sweden | Cold War | sourced-ready (SHIPPED) | strv103_wesiora.glb | 1 |
| 5 | M1A1 Abrams | USA | Cold War | variant | dannzjs M1A2 SEPv3 (strip SEP kit) | 2 |
| 6 | M60A3 Patton | USA | Cold War | sourced-ready | m60a3-toshueyi | 2 |
| 7 | T-90A | Russia | Modern | variant | alexxx_xarchenko T-90 (re-material) | 2 |
| 8 | T-72B3 | Russia | Modern | procedural | — | 2 |
| 9 | Challenger 2 | UK | Modern | procedural | — | 2 |
| 10 | Merkava IVm | Israel | Modern | procedural | — | 2 |
| 11 | M1A2 TUSK | USA | Modern | variant | dannzjs M1A2 SEPv3 (add TUSK kit) | 3 |
| 12 | Leopard 2A6 | Germany | Modern | procedural | Leo 2A7 factory family | 3 |
| 13 | Leopard 2A4 | Germany | Cold War | procedural | Leo 2A7 factory family | 3 |
| 14 | KF51 Panther | Germany | Next Generation | sourced-ready | kf51-grip420 | 3 |
| 15 | T-80U | Russia | Cold War | procedural | — | 3 |
| 16 | Leclerc S2 | France | Modern | procedural | — | 3 |
| 17 | Type 99A | China | Modern | procedural | — | 3 |
| 18 | M1 Abrams (105) | USA | Cold War | sourced-ready | m1abrams-goyko | 4 |
| 19 | Leopard 1A5 | Germany | Cold War | procedural | — | 4 |
| 20 | T-14 Armata | Russia | Next Generation | procedural | — | 4 |
| 21 | Chieftain Mk 10 | UK | Cold War | procedural | — | 4 |
| 22 | K2 Black Panther | S. Korea | Modern | procedural | — | 4 |
| 23 | Type 10 | Japan | Modern | procedural | — | 4 |
| 24 | Type 74 | Japan | Cold War | variant | stb1_haphazard (searchlight + paint) | 4 |
| 25 | M2A2 Bradley | USA | Cold War | procedural | — | 5 |
| 26 | BMP-2 | USSR/Russia | Cold War | procedural | — | 5 |
| 27 | C1 Ariete | Italy | Modern | procedural | — | 5 |

Priority: 1 = shipped; 2 = first build wave (cheap sourced/variant wins + the two
highest-demand procedurals); 3 = second wave (fills every remaining required nation);
4 = third wave (depth per nation); 5 = variety picks.

---

## Part I — USA

## 1. M1A2 Abrams SEPv3 — SHIPPED

See `tank-roster.md` §6 and `specs.js` (`m1a2`). Sourced dannzjs GLB, CC-BY 4.0.
Serves as the **variant base** for M1A1 (§2) and M1A2 TUSK (§3): the GLB's named-mesh
re-parenting path (modelLoader.js) allows mesh deletion/addition per variant; each
variant ships as its own preprocessed GLB with its own attribution line
("…modified: SEP kit removed / TUSK kit added").

## 2. M1A1 Abrams (USA, MBT) — variant of dannzjs SEPv3

### 2.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 9.77 m |
| Hull length | 7.92 m |
| Width | 3.66 m |
| Height | 2.44 m (2.89 to MG) |
| Gun | 120 mm M256 L/44 — barrel ≈ 5.30 m, thermal sleeve + bore evacuator |

### 2.2 Armor (RHAe estimates, M1A1HA — depleted-uranium mesh)
| Location | KE / CE |
|---|---|
| Turret front cheeks | ~600 / ~1000 |
| Hull front (composite arrays) | ~560 / ~700 |
| Turret side (crew bay arc) | ~300 / ~500 |
| Hull side skirts (front third heavy, rest rubber) | 65 + skirt / ~200 |
| Rear / roof | 40 / 25–40 |

### 2.3 Mobility
- Weight **62.1 t** | AGT1500 gas turbine **1,500 hp** (24.2 hp/t)
- Top **67 km/h** | Reverse **25 km/h** (sim cap) | Distinct turbine whine + no exhaust smoke
- Sim: hp 2300, hullTraverse 44, turretTraverse 42, aimTime 1.9 s

### 2.4 Gun — 120 mm M256
| Shell | Type | Sim baseline / pen | Damage |
|---|---|---|---|
| M829A1 APFSDS | APFSDS | apfsdsPens(620) | 520 |
| M830 HEAT | HEAT | 480 / 480 | 460 |
| M1147-precursor HE (M908 proxy) | HE | 55 | 580 |
- Reload **6.5 s** | Elevation **+20° / −10°** | baseAccuracy 0.32

### 2.5 Visual modeling spec (delta from the SEPv3 GLB)
**Remove**: CROWS II RWS (roof centerline), CITV panoramic sight (left forward roof —
the M1A1 has NO CITV, its absence is the #1 A1-vs-A2 recognition cue), bustle-rack
extension basket, front slat/under-armor appliqué if present.
**Replace**: commander's station becomes the low-profile manual cupola ring with a
pintle-mounted **M2 .50 cal on a skate ring** (bare gun, no armored box); loader keeps
the M240 skate mount. Turret roof otherwise clean.
**Keep**: hull, 7 road wheels + 2 return rollers, full-length ballistic skirts (first
two panels thicker with lifting eyes), rear grille doors, gun with thermal sleeve.
**Paint**: NATO woodland 3-color (green #49543c base / black #23261f / brown #4a3a2c)
or overall desert sand alt; white "bumper number" stencil on skirt front, inverted-V
IFF chevron on turret sides. Weathering: dust wash rising from skirts, dark turbine
soot on rear grilles.

## 3. M1A2 Abrams TUSK (USA, MBT) — variant of dannzjs SEPv3

### 3.1 Dimensions / mobility deltas
- Weight **69.5 t** (TUSK II fit) → top speed **64 km/h**, hp/t 21.6; hp pool 2650
  (roster survivability king), turretTraverse 38 (heavier). Other stats as `m1a2`.

### 3.2 Armor deltas (RHAe estimates)
| Addition | Effect |
|---|---|
| ARAT-1/2 ERA tiles, hull skirts | side CE +400, KE +50 (era plates) |
| Belly appliqué | floor 30 → 60 (mine module, cosmetic in sim) |
| Loader's gun shield | crew-hit chance down (cosmetic) |
| Rear slat cage | rear CE +250 (spaced plate) |

### 3.3 Gun
Identical M256 loadout to `m1a2` (M829A4 750 / M830A1 / M1147).

### 3.4 Visual modeling spec (delta from the SEPv3 GLB)
**Hull sides**: replace flat skirt faces with **two stacked rows of square ARAT-1 ERA
tiles** (~40 cm tiles, each a shallow pyramid with a center bolt) along the full skirt
length; on the forward half overlay the **ARAT-2 V-shaped wedge tiles** angled down-out.
**Turret**: loader's M240 gains a three-sided **transparent-topped armored shield**
(model as dark frame + smoked glass planes); CROWS remains. Add the tan **Tank
Infantry Phone box** on the right rear hull corner with a coiled cable detail.
**Rear**: bar-armor slat cage across the engine grille (thin box lattice, 8 cm spacing).
**Paint**: overall desert tan #8d7f5f (TUSK = urban Iraq fit) with heavy vertical dust
streaking and chipped-to-green edges; black bumper stencils.

## 4. M60A3 Patton (USA, MBT) — sourced-ready (`m60a3-toshueyi`)

### 4.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 9.44 m |
| Hull length | 6.95 m |
| Width | 3.63 m |
| Height | **3.27 m** — tallest vehicle in the modern roster, a defining weakness |
| Gun | 105 mm M68 L/52 — barrel ≈ 5.46 m, mid-barrel bore evacuator, thermal sleeve (A3) |

### 4.2 Armor (cast homogeneous — no composite; RHAe ≈ actual)
| Location | Value |
|---|---|
| Upper glacis | 93 mm @ 65° (≈ 220 eff., needle-nose prow) |
| Lower glacis | 137 mm @ 55° rounded |
| Turret front | ~250 mm cast, rounded "M60 pig-snout" |
| Turret sides | ~140 mm cast |
| Hull sides | 74 mm upper / 36 mm lower |
| Roof / rear | 36 / 41 mm |

### 4.3 Mobility
- Weight **52.6 t** | AVDS-1790-2C diesel **750 hp** (14.3 hp/t)
- Top **48 km/h** | Reverse **10 km/h**
- Sim: hp 1500, hullTraverse 30, turretTraverse 24, terrainResistance {0.8, 0.95, 1.7}

### 4.4 Gun — 105 mm M68
| Shell | Type | Sim baseline / pen | Damage |
|---|---|---|---|
| M833 APFSDS | APFSDS | apfsdsPens(380) | 390 |
| M456A2 HEAT-T | HEAT | 420 / 420 | 400 |
| M393A2 HEP (HESH) | HE | 65 | 480 |
- Reload **7.0 s** | Elevation **+20° / −10°** (excellent depression — hull-down with that
  huge turret is the intended play) | baseAccuracy 0.36, aimTime 2.3 s

### 4.5 Integration spec (model already judged good)
Toshueyi GLB has: correct boat-prow cast hull, 6 aluminum road wheels + 3 return
rollers, M19 commander's cupola (mini-turret with its own .50 cal — signature), bore
evacuator, turret side rack, MERDC-style green/sand patch camo baked in. Work items:
scale-normalize to 6.95 m hull, verify turret/gun node separation (re-parent per
modelLoader path), tint camo toward the roster NATO palette via the camo-tint path,
add exhaust soot decal at rear grille. Icons via genIcons. Attribution line from
LICENSE-RECORD.txt into ATTRIBUTION.md.

## 5. M1 Abrams (105) (USA, MBT) — sourced-ready (`m1abrams-goyko`)

### 5.1 Dimensions
As M1A1 hull (9.77 × 3.66 m) but height 2.37 m and the **105 mm M68A1** (thinner
barrel, bore evacuator, no fat thermal-sleeve step) — weight **54.0 t**.

### 5.2 Armor (RHAe estimates, original BRL-1 package)
Turret front ~400 KE / ~700 CE; hull front ~350 / ~600; sides/rear as M1A1 minus DU.

### 5.3 Mobility / gun
- 1,500 hp turbine at 54 t = 27.8 hp/t — **the hot-rod Abrams**: top 72 km/h (sim), reverse 25.
- Sim: hp 2000, reload 6.2 s, M774 APFSDS apfsdsPens(410) dmg 380 / M456A2 HEAT 420 dmg 400 / M393 HEP dmg 480.

### 5.4 Integration spec
Goyko GLB reviewed: early-M1 turret (no CITV, no CROWS, twin antenna masts), bustle
rack, 7 road wheels, desert chip camo, rear grille. Work items: scale to 7.92 m hull,
turret/gun re-parent, camo tint hook, bumper stencils. Ship name: "M1 Abrams".

## 6. M2A2 Bradley (USA, IFV) — procedural

### 6.1 Dimensions
| Measure | Value |
|---|---|
| Length | 6.55 m |
| Width | 3.61 m (with appliqué) |
| Height | 2.98 m (to turret roof) |
| Gun | 25 mm M242 Bushmaster chain gun + TOW-2 twin box |

### 6.2 Armor
Welded aluminum 5083 + spaced steel appliqué: front resists 30 mm (≈ 60 RHAe KE),
sides 14.5 mm-proof (≈ 30 RHAe), rear ramp 20 RHAe. Everything overmatched by tank
guns — hp 1300 and mobility are the survival tools.

### 6.3 Mobility
- Weight **30.4 t** | Cummins VTA-903T **600 hp** (19.7 hp/t)
- Top **61 km/h** | Reverse **20 km/h** | terrainResistance {0.75, 0.85, 1.4}

### 6.4 Armament
| Shell | Type | Pen | Damage | Notes |
|---|---|---|---|---|
| M919 APFSDS-T (25 mm) | APFSDS | 110 flat | 40 | reload 0.5 s (burst feel) |
| M792 HEI-T (25 mm) | HE | 8 | 55 | module/crew sandpaper |
| BGM-71 TOW-2A | HEAT | 900 | 480 | 14 s reload, slow projectile (300 m/s), the tank-killer button |
- Turret traverse 60°/s, elevation +57°/−9 (sim cap +30).

### 6.5 Visual modeling spec
**Silhouette**: tall slab-sided aluminum box, sharply raked one-piece glacis running
nearly the full front as one 60° plane, short horizontal nose shelf with headlight
boxes. Hull roof flat; rear is a full-width vertical **troop ramp** with door outline.
**Turret**: small two-man welded turret offset **right of centerline**; flat-faced with
the long thin 25 mm barrel + muzzle brake and coax slit; left cheek carries the
**armored twin TOW launcher box** (rectangular, elevates with gun — model as a hinged
box on the turret left side); integrated square sight hood on roof front.
**Running gear**: 6 medium rubber-tired road wheels, drive sprocket front, high idler
rear, 3 return rollers; upper run hidden by the appliqué side plates (two long
horizontal steel slabs with visible stand-off bolts — the A2 signature).
**Details**: stowage racks aft sides, wading trim vane folded on glacis, whip antennas
rear corners, headlight brush guards.
**Paint**: NATO woodland 3-color or sand; large white vehicle callsign on side plates.

---

## Part II — Germany

## 7. Leopard 2A7 — SHIPPED
See `tank-roster.md` §8 and `specs.js` (`leo2a7`). Procedural; its hull, running gear
(7 wheels, wavy-bottom skirts), and wedge turret are the family base for §8/§9.

## 8. Leopard 2A6 (Germany, MBT) — procedural (2A7 family)

### 8.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | **10.97 m** (L/55 — longest gun in the game) |
| Hull length | 7.72 m |
| Width | 3.75 m |
| Height | 2.64 m |
| Gun | 120 mm Rh-120 **L/55** — barrel ≈ 6.60 m, thermal sleeve, bore evacuator at 60% |

### 8.2 Armor (RHAe estimates)
| Location | KE / CE |
|---|---|
| Turret front (wedge appliqué over B-tech) | ~700 / ~1000 |
| Hull front | ~620 / ~750 |
| Turret side forward arc | ~350 / ~500 |
| Hull side (heavy skirt front third) | ~110+skirt / ~300 |

### 8.3 Mobility
- Weight **62.3 t** | MB873 **1,500 hp** (24.1 hp/t) | Top **68 km/h** | Reverse 25 (cap)
- Sim: hp 2400, mirrors leo2a7 handling.

### 8.4 Gun
| Shell | Type | Sim baseline | Damage |
|---|---|---|---|
| DM53 APFSDS | APFSDS | apfsdsPens(700) | 530 |
| DM12A2 HEAT-MP | HEAT | 600 | 480 |
| DM11 HE-ABM | HE | 40 | 590 |
- Reload 6.0 s, baseAccuracy 0.27 (the sniper Leo), aimTime 1.6 s, +20/−9.

### 8.5 Visual modeling spec (delta from procedural 2A7)
Same hull/gear/wedge turret as 2A7 minus the A7 kit: **no** roof RWS, **no** turret
bustle climate/APU boxes, **no** hull-front adapter plates; keep the wedge cheeks and
the long L/55. Crosswind mast at turret rear right, PERI R17 periscope left roof.
Paint: NATO 3-color with Bundeswehr iron cross on turret side, 2-digit white tactical
number. Signature read vs 2A4: wedge + very long gun.

## 9. Leopard 2A4 (Germany, MBT) — procedural (2A7 family)

### 9.1 Dimensions
Overall 9.97 m (L/44 ≈ 5.28 m barrel), hull 7.72 m, width 3.70 m, height 2.48 m.

### 9.2 Armor (RHAe estimates)
Turret front **vertical slab** ~420 KE / ~700 CE (the flat face is the weak spot the
whole game will learn); hull front ~400 / ~600; sides as 2A6.

### 9.3 Mobility
Weight **55.15 t**, 1,500 hp → **27.2 hp/t, top 70 km/h** — fastest Leo. hp 2200.

### 9.4 Gun
DM33 APFSDS apfsdsPens(480) dmg 500 / DM12 HEAT 600 dmg 480 / DM12-HE proxy dmg 560.
Reload 5.8 s (lighter breech), accuracy 0.30, +20/−9.

### 9.5 Visual modeling spec (delta)
**Turret**: delete the wedge appliqué — the 2A4 face is two flat **vertical** cheek
plates meeting the mantlet slot; boxy EMES-15 gunner sight aperture cut into the RIGHT
cheek top (dark rectangular recess — key ID); flat roof, round hatches, stowage
baskets across the whole turret rear. Shorter L/44 with mid-length evacuator.
**Hull**: identical 7-wheel gear; skirts are the plain rubber wavy-bottom type.
**Paint**: NATO 3-color; optional winter whitewash variant.

## 10. Leopard 1A5 (Germany, MBT) — procedural

### 10.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 9.54 m |
| Hull length | 7.09 m |
| Width | 3.37 m |
| Height | 2.62 m |
| Gun | 105 mm L7A3 L/52 — thermal sleeve (A5 refit), bore evacuator |

### 10.2 Armor (paper tank — RHAe ≈ actual)
Glacis 70 mm @ 60° (~140 eff.), nose 70 mm; **welded turret** (1A3-type) front ~120 mm
spaced; sides 35 mm; everything else 25–35 mm. Speed is the armor. hp 1550.

### 10.3 Mobility
- Weight **42.2 t** | MTU MB838 **830 hp** (19.7 hp/t) | Top **65 km/h** | Reverse 25
- Agile: hullTraverse 40, terrainResistance {0.7, 0.8, 1.4}.

### 10.4 Gun
DM63 (105) APFSDS apfsdsPens(390) dmg 390 / DM512 HEAT 400 dmg 400 / DM21 HE dmg 470.
Reload 5.5 s, accuracy 0.30, aimTime 1.8 s, +20/−9. Full stabilizer (A5) — small
on-move penalty.

### 10.5 Visual modeling spec
**Silhouette**: low, long, elegant — the anti-Tiger. Hull is a shallow wedge with a
long 60° glacis flowing into a flat engine deck; rounded nose; slight side-skirt
apron (rubber sheets with vertical cut lines).
**Turret**: A5 uses the **welded angular turret** with long flat cheeks and a wedge
profile from the side, plus the large boxy **EMES-18 sight housing** on the right roof
front (double square aperture) — model the big rear stowage bin extending the turret
silhouette backward. Gun with fat thermal sleeve sections and evacuator.
**Running gear**: 7 dished road wheels with heavy rubber rims, torsion bar sag, drive
sprocket rear (rear engine), 4 small return rollers, mudguards front/rear.
**Details**: two-tone exhaust louvres on rear corners, cable reels, Bundeswehr
pioneer tools, whip antennas.
**Paint**: NATO 3-color; large white turret number, iron cross hull side.

## 11. KF51 Panther (Germany, MBT) — sourced-ready (`kf51-grip420`)

### 11.1 Dimensions
Overall ~10.5 m, hull ~7.6 m, width 3.42 m, height 2.44 m. Gun: **130 mm Rh-130 L/52**
with pepperbox muzzle brake — the only 130 in the game.

### 11.2 Armor (concept estimates)
Turret ~700 KE / ~1100 CE (frontally); hull ~600 / ~800; integrated hard-kill APS
(gameplay: not modeled round 1 — note for future consumable).

### 11.3 Mobility / gun
- 59 t, 1,475 hp (25 hp/t), top 70 km/h, reverse 25. hp 2600.
- KE2020Neo APFSDS apfsdsPens(800) dmg 560 (top KE in game, balanced by 8.0 s
  autoloader reload and 20-round magazine) / 130 HE dmg 640. accuracy 0.28.

### 11.4 Integration spec
GRIP420 GLB reviewed: faceted stealth turret with sensor mast + RWS, digital camo
texture (white/grey/lime — retint toward NATO green via camo-tint), 7 wheels, full
skirts, twin whip antennas. Work: scale, turret/gun re-parent, tone down the lime
camo, muzzle-brake check. Flagship "prototype" flavor pick — pairs with T-14.

---

## Part III — Russia / USSR

## 12. T-90M Proryv — SHIPPED
See `tank-roster.md` §7 and `specs.js` (`t90m`). Procedural. Its Relikt-tiled welded
turret and 6-wheel gear inform the T-72B3 (§14) but the T-72 build is its own hull.

## 13. T-90A (Russia, MBT) — variant of `t-90` (alexxx_xarchenko, CC-BY 4.0)

### 13.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 9.53 m |
| Hull length | 6.86 m |
| Width | 3.78 m |
| Height | 2.23 m (lowest silhouette class in game, with T-72) |
| Gun | 125 mm 2A46M-5 L/48 — bore evacuator at mid, no muzzle brake |

### 13.2 Armor (RHAe estimates)
| Location | Base KE / CE | + Kontakt-5 ERA |
|---|---|---|
| Turret front (cast+composite) | ~530 / ~650 | +120 KE / +400 CE |
| Upper glacis | ~500 / ~550 | +120 / +400 |
| Turret side forward | ~250 / ~300 | — |
| Hull side (rubber skirt + fuel) | 80 / 150 | K-1 boxes forward third |
- ERA modeled as `kind:'era'` plates (reuse the t90m glacis two-tile pattern).

### 13.3 Mobility
- Weight **46.5 t** | V-92S2 **1,000 hp** (21.5 hp/t)
- Top **60 km/h** | **Reverse 5 km/h** (Soviet transmission — the trait)
- Sim: hp 1950, hullTraverse 40, turretTraverse 36, aimTime 2.3.

### 13.4 Gun — 125 mm, carousel autoloader
| Shell | Type | Sim baseline | Damage |
|---|---|---|---|
| 3BM42M Lekalo | APFSDS | apfsdsPens(590) | 510 |
| 3BK29M HEAT | HEAT | 650 | 470 |
| 3OF26 HE-Frag | HE | 50 | 570 |
- Reload **7.5 s** (carousel), accuracy 0.36, **+14° / −6°** (Soviet depression pain).

### 13.5 Variant spec (from the alexxx clay GLB)
Model is geometry-complete: cast dome turret, K-5 glacis wedge array, turret-front
K-5 "eyebrow" wedges, **Shtora-1 emitter boxes** flanking the gun (the red-eye squares
— paint emissive dull red at dusk maps), 902B smoke banks angled off the turret sides,
6 stamped road wheels, unditching log clamp. Work items: (1) re-material via
`paintUntextured` — Russian dark forest green solid (#3f5138 family, match t90m),
rubber-black skirts, steel tracks; (2) decimate 304k→≤150k tris; (3) scale-normalize
(bbox is in decimeter-ish units); (4) turret/gun separation — meshes are
split-by-material so re-parent by spatial box (turret shell above ring plane), the
same surgery done for the Wei He T-34; (5) white turret number "112" + Guards decal.

## 14. T-72B3 (Russia, MBT) — procedural

### 14.1 Dimensions
Overall 9.53 m, hull 6.67 m, width 3.59 m, height 2.23 m. Gun 125 mm 2A46M-5.

### 14.2 Armor (RHAe estimates)
Turret front ~480 KE / ~500 CE base + Kontakt-5 (+120/+400); glacis ~450/~500 + K-5;
sides 80 mm + soft skirts with K-1 blocks forward. hp 1850.

### 14.3 Mobility
Weight **46.5 t** | V-84-1 **840 hp** (18.1 hp/t) | Top **60 km/h** | Reverse **4.8 km/h**.
hullTraverse 36 — the budget bruiser: worst handling of the modern Russians.

### 14.4 Gun
3BM46 Svinets APFSDS apfsdsPens(570) dmg 510 / 3BK29 HEAT 630 dmg 470 / 3OF26 HE
dmg 570. Reload 7.8 s, accuracy 0.38, aimTime 2.4, +14/−6.

### 14.5 Visual modeling spec
**Silhouette**: the classic low Soviet pancake — flat hull only 2.2 m tall, long
sloped glacis carrying the **full-width Kontakt-5 wedge array** (4 chevron wedges),
V-splash board, driver centered.
**Turret**: squat **cast dome** (not the T-90M's flat-faced welded box): half-egg with
K-5 wedge "eyebrows" over the frontal 60°, and the B3 giveaway — the boxy **Sosna-U
gunner sight** standing on the roof left of the gun (rectangular housing with barn-door
cover), plus a flat meteo mast rear. No Shtora eyes (distinguishes from T-90A).
**Running gear**: 6 large stamped-steel road wheels with 6 lightening scallops each
(bigger, flatter than T-90 wheels), 3 return rollers, sprocket rear; rubber-flap
skirts with 4 K-1 brick clusters on the forward third; unditching log on rear plate.
**Details**: twin saddle fuel drums on rear rails (detachable — nice damage prop),
snorkel tube on turret rear, tow cables along glacis lip.
**Paint**: Russian 3-tone (dark green base / black / sand stripes) or solid dark
forest green; white tactical number on turret sides, side skirt dust wash.

## 15. T-80U (Russia/USSR, MBT) — procedural

### 15.1 Dimensions
Overall 9.65 m, hull 7.01 m, width 3.60 m, height 2.20 m. Gun 125 mm 2A46M-1.

### 15.2 Armor (RHAe estimates)
Turret ~550 KE / ~600 CE base + Kontakt-5 (+120/+400); glacis ~480/~550 + K-5;
sides 80 + skirts. hp 1900.

### 15.3 Mobility — the turbine hot rod
- Weight **46 t** | GTD-1250 **gas turbine 1,250 hp** (27.2 hp/t)
- Top **70 km/h** — fastest Russian; Reverse **11 km/h**; spool-up feel: give it the
  highest accel of the Soviet trio + slight throttle lag (movement spool knob).

### 15.4 Gun
3BM46 APFSDS apfsdsPens(550) dmg 510 / 9M119 Refleks proxy → 3BK29 HEAT 630 dmg 470 /
3OF26 HE dmg 570. Reload 7.2 s (carousel, faster cadence), accuracy 0.36, +14/−5.

### 15.5 Visual modeling spec
**Silhouette**: T-72-low but subtly different: hull nose is blunter with a full-width
**K-5 glacis array in 3 fat wedges**, and the rear deck carries the **turbine exhaust
box** — a wide flat rectangular port centered on the rear plate (not side exhaust —
key ID vs T-72/T-90).
**Turret**: rounded cast dome with K-5 wedges arranged in a distinct **clamshell V**
around the frontal arc; luna-less (no IR spotlight); commander's cupola with flat
Utyos .50 AA mount on a curved rail; 902 smoke tubes clustered LEFT side only.
**Running gear**: 6 **smaller** rubber-rimmed road wheels with visible round
lightening holes (unlike T-72's big stamped wheels), 5 return rollers, wider
"snowshoe" track; rubber side skirts with angular fabric look.
**Details**: saddle fuel drums, unditching log, snorkel; turbine = no exhaust soot
but heat-shimmer decal hook at the rear port.
**Paint**: Soviet parade green (#4a5a40) solid, white turret number, red star option.

## 16. T-14 Armata (Russia, MBT) — procedural

### 16.1 Dimensions
Overall 10.8 m, hull 8.7 m, width 3.9 m (skirted), height 2.7 m to sensor mast base.
Gun 125 mm 2A82-1M (no evacuator — unmanned turret, key barrel read: clean tube).

### 16.2 Armor (RHAe estimates, gameplay-shaped)
| Location | KE / CE | Note |
|---|---|---|
| Hull front (crew capsule) | ~900 / ~1200 + Malachit ERA | best hull in game |
| Turret shell | ~300 / ~300 | UNMANNED — hits disable optics/gun, never crew |
| Hull sides | 200 + Malachit skirt front half | |
| Rear | 60 | |
- Gameplay hook: turret hits can't kill crew (capsule) → T-14 trades hull-down
  weakness (tall turret) for crew safety; hp 2700 (top of envelope).

### 16.3 Mobility
Weight **55 t** | ChTZ 12N360 **1,500 hp** (27.3 hp/t) | Top **75 km/h** (sim cap) |
Reverse **25 km/h** — first Russian with real reverse.

### 16.4 Gun
Vacuum-1 APFSDS apfsdsPens(800) dmg 550 / 3VBK27 HEAT 700 dmg 480 / Telnik HE dmg 600.
Reload 6.5 s (new autoloader), accuracy 0.32, aimTime 2.0, **+20/−8** (unmanned mount).

### 16.5 Visual modeling spec
**Silhouette**: unmistakably NOT a classic Russian pancake — long tall hull with a
high flat roofline, **7 road wheels** (first Russian 7-wheel), full-length angular
skirts with sawtooth lower edge, massive one-piece sloped glacis with driver hatch
strip and V-splash ridge.
**Turret**: the sci-fi bit — an angular **faceted shroud** (thin cladding over the gun
mount): tall trapezoidal front face, slab sides tapering rearward, topped by a
**sensor mast cluster** (panoramic sight tower rear-center, meteo mast, flat radar
panels on the corners — the Afganit AESA plates), small square launch tubes ringing
the shroud base (APS hard-kill dischargers) and vertical smoke tube banks at the rear
corners. Clean gun tube with a simple thermal sleeve, no evacuator bulge.
**Running gear**: 7 medium road wheels, sprocket rear, hydro-mech suspension —
model 1st/2nd/7th wheels with visible travel; skirt covers upper run entirely.
**Details**: rear-view camera pods on hull corners (small cylinders), grille-covered
turbine-style intakes on rear deck, tow hooks in the lower bow notch.
**Paint**: factory dark green with near-black panel shading; white "512" on skirt;
parade-clean weathering (it's never seen mud) — light dust only.

## 17. BMP-2 (USSR/Russia, IFV) — procedural

### 17.1 Dimensions
Length 6.72 m, width 3.15 m, height 2.45 m. Gun 30 mm 2A42 + 9M113 Konkurs ATGM.

### 17.2 Armor
Steel 33 mm @ 60° bow (~35 RHAe KE vs AP), 16–19 mm sides, 6 mm roof. hp 900 —
glass cannon, plays as a flanker/spotter.

### 17.3 Mobility
14.3 t | UTD-20/3 **300 hp** (21 hp/t) | Top **65 km/h** | Reverse 7 | Amphibious
(cosmetic trim vane).

### 17.4 Armament
3UBR8 APDS (30 mm) pen 60 flat dmg 30, reload 0.4 s burst / 3UOF8 HE-I pen 6 dmg 45 /
9M113M Konkurs-M HEAT pen 750 dmg 420, reload 16 s, 250 m/s missile.
Turret traverse 50°/s, +74 real elevation (sim cap +30), −5.

### 17.5 Visual modeling spec
**Silhouette**: long low wedge — sharply pointed **boat prow** in two planes (upper
glacis ribbed with wave-breaker lines), roofline barely 2 m, rear slightly taller
troop compartment with the two signature **bulged rear doors** (each with integral
fuel cell — flat door + dome swell) and roof troop hatches.
**Turret**: small round two-man turret dead center; long thin 30 mm barrel with
flash hider + coax; **Konkurs launcher tube** on the roof between hatches (cylindrical
tube on a pedestal, elevated 10°); low conical commander cupola.
**Running gear**: 6 small dished road wheels, 3 return rollers, front sprocket,
prominent torsion sag; narrow 300 mm track; fender line with pioneer tools.
**Details**: firing-port dimples along the upper side (3 per side), whip antenna,
headlight pods on prow cheeks.
**Paint**: olive drab solid or Russian 3-tone; white side number; mud spray up the prow.

---

## Part IV — United Kingdom

## 18. Challenger 2 (UK, MBT) — procedural

### 18.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 11.50 m (gun forward) |
| Hull length | 8.33 m |
| Width | 3.52 m (4.20 with appliqué) |
| Height | 2.49 m |
| Gun | 120 mm **L30A1 RIFLED** L/55 — thermal sleeve full length, muzzle reference sensor |

### 18.2 Armor (Dorchester Level 2 — RHAe estimates)
| Location | KE / CE |
|---|---|
| Turret front | ~600 / ~900 |
| Hull front | ~500 / ~800 |
| Turret sides | ~300 / ~450 |
| Hull sides (ROMOR/TES skirts optional) | 100+skirt / 250 |

### 18.3 Mobility
- Weight **62.5 t** | Perkins CV12 **1,200 hp** (19.2 hp/t) — the slow, steady one
- Top **59 km/h** | Reverse **20 km/h** | Hydrogas suspension: best on-move accuracy
  bonus in the roster (smallest moving bloom multiplier).
- Sim: hp 2450, hullTraverse 36.

### 18.4 Gun — the HESH platform
| Shell | Type | Sim baseline | Damage |
|---|---|---|---|
| L27A1 CHARM-3 | APFSDS | apfsdsPens(600) | 520 |
| **L31A7 HESH** | HE (HESH mech) | 150 flat, no falloff | 620 |
| L34 WP Smoke | HE | 10 | 100 + smokescreen |
- Reload 6.8 s (two-piece ammo), accuracy **0.26 — best gun handling in game**,
  aimTime 1.7, +20/−10. HESH is the identity: module/crew trauma vs light targets
  and roof splash.

### 18.5 Visual modeling spec
**Silhouette**: long and low-slung with a distinctly **horizontal hull roofline** and
a shallow one-piece glacis; hull nose has the full-width slanted dozer-blade-like
lower lip. Side profile dominated by big flat skirts.
**Turret**: rounded-off trapezoid unlike Leo/Abrams: front face is a **swept-back
angled wedge in plan view** (arrow from above) with the gun in a narrow mantlet-less
slot; French-curve cheek transitions (Dorchester blocks give softly bevelled edges);
prominent round commander's cupola RIGHT with ring of episcopes + panoramic sight
ahead of it; loader hatch LEFT with pintle GPMG; huge rear stowage bin + basket
spanning the bustle; twin 5-tube smoke banks on cheeks.
**Running gear**: 6 large road wheels (Hydrogas — even spacing), 4 return rollers,
sprocket rear; skirt panels squared with lifting handles.
**Details**: thermal-sleeved gun looks fat and smooth with the MRS block at muzzle;
IFF panels; tow cable across glacis; camo net roll bungeed to bustle rack (nice
identity prop).
**Paint**: British 2-tone — black stripes over NATO green (#3f4a36 + #1d1f1c) or
desert sand + black; white/red squadron square on turret side, ZAP number plate front.

## 19. Chieftain Mk 10 (UK, MBT) — procedural

### 19.1 Dimensions
Overall 10.79 m, hull 7.52 m, width 3.66 m, height 2.90 m. Gun 120 mm **L11A5 rifled**.

### 19.2 Armor
Cast/welded steel + **Stillbrew** turret-front appliqué (Mk 10 refit): turret front
~380 KE / ~450 CE; the famously reclined hull glacis 120 mm @ 72° (~390 eff. KE vs
old rounds, overmatched by late APFSDS); sides 38 mm. hp 1750.

### 19.3 Mobility
Weight **55 t** | Leyland L60 **750 hp** (13.6 hp/t) | Top **48 km/h** | Reverse 10.
Sluggish: hullTraverse 28, terrainResistance {0.85, 1.0, 1.8}.

### 19.4 Gun
L23A1 APFSDS apfsdsPens(400) dmg 480 / **L31 HESH** 150 flat dmg 600 / smoke.
Reload 8.0 s (two-piece bagged charge), accuracy 0.32, +20/**−10** — the hull-down
ridge monster of the cold-war tier.

### 19.5 Visual modeling spec
**Silhouette**: instantly odd — the **reclined-driver hull** means NO stepped driver
plate: one continuous long shallow glacis from nose lip to turret ring, giving a
"snout-less crocodile" front. Tall engine deck rear with big louvred plates.
**Turret**: long cast turret with a **needle-nose front** — the gun emerges from a
narrow pointed mantlet-less snout; Stillbrew = blocky collar of appliqué slabs
wrapped around the snout base and cheeks (model as raised rectangles with weld
bead edges); flat-topped with the huge No. 15 commander cupola LEFT (own episcope
ring + GPMG) and a long stowage tail: full-width rear bin plus bustle basket.
**Running gear**: 6 paired steel-rimmed road wheels (Horstmann bogies — 3 twin
bogie blocks per side, external coil springs visible between wheel pairs — key
detail), 3 return rollers, sprocket rear; top run covered by shallow fenders with
stowage bins; NO side skirts on most — leave running gear exposed (reads great).
§B6 (owner law 2026-08-04, uk b6 round): the FRONT IDLER is RAISED — idler y 0.60
(was 0.50 = road-wheel height, a parallelogram front) giving a ~24° approach ramp
+ the ~18° rear departure = the \________/ trapezoid; with it the bow plates
(glacis wedge + nose plate) narrowed to the inter-track span ±1.15 (§B4: the old
±1.55/±1.42 solids ran through the track channel and buried the wrap — clip audit
measured front 75 → **0** exact; rear 7 vox is a pre-existing sponson-bottom/
sprocket-wrap graze at y 1.04..1.12 z −3.42..−3.14, inside the kv2 band, left for
the modern3 owner), headlights + glacis cable moved inboard off the band span.
**Details**: infra-red searchlight box on turret left cheek (big rectangular housing
with barn door), 120 mm with full thermal sleeve + fume extractor, splash board
ridge across glacis.
**Paint**: BAOR green/black blotch camo; white turret callsign circle, bridge-class
yellow disc "60" on nose.

---

## Part V — France

## 20. Leclerc S2 (France, MBT) — procedural

### 20.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 9.87 m |
| Hull length | 6.88 m — SHORTEST modern MBT hull (compactness is the read) |
| Width | 3.60 m |
| Height | 2.53 m |
| Gun | 120 mm CN120-26 **L/52** — mid evacuator, thermal sleeve, muzzle ref |

### 20.2 Armor (RHAe estimates)
Turret front ~620 KE / ~900 CE (modular NERA blocks); hull front ~550 / ~700;
turret sides ~320/~450; hull sides 80 + heavy forward skirt blocks.

### 20.3 Mobility
- Weight **54.5 t** | V8X SACM Hyperbar **1,500 hp** (27.5 hp/t)
- Top **71 km/h**, accel best-in-class (hyperbar spool: instant torque) | Reverse 25
- Sim: hp 2350, hullTraverse 46 (nimble).

### 20.4 Gun — bustle autoloader, 3-man crew
| Shell | Type | Sim baseline | Damage |
|---|---|---|---|
| OFL 120 F2 APFSDS | APFSDS | apfsdsPens(640) | 520 |
| OECC 120 F1 HEAT | HEAT | 600 | 470 |
| OE 120 F1 HE | HE | 45 | 570 |
- **Reload 5.0 s — fastest 120 in the game** (autoloader), accuracy 0.30, aimTime 1.9,
  +15/−8. Balance lever vs Leo 2A6: FR trades pen + depression for cadence + speed.

### 20.5 Visual modeling spec
**Silhouette**: compact and dense — short hull, minimal rear overhang, tall-ish
skirted sides; glacis is a clean single plane with a full-width splash ridge.
**Turret**: narrow-front box with strongly **angled cheek plates in plan** and slab
sides that run straight back (from above: home-plate pentagon); tall **HL-70
commander's panoramic sight** standing periscope-like on the roof left-rear (the
Leclerc's antenna-farm read) plus the SAVAN gunner sight boxed into the right cheek
top; **GALIX** dischargers = 9 short tubes splayed along each turret rear corner;
flat bustle with autoloader ammo hatch panel lines and stowage baskets each side.
**Running gear**: 6 road wheels + 5 return rollers, sprocket rear; hydropneumatic —
level stance; skirts: front third armored blocks (thick, squared), rear two-thirds
rubber sheet.
**Details**: driver hatch left-glacis with 3 episcopes, cable + jack on right skirt
line, twin whip antennas rear corners, French roundel.
**Paint**: French 3-tone Centre-Europe (vert armée #3e4d3a / brun terre #5b4a38 /
noir) hard-edged polygonal pattern — distinct from soft NATO blobs; white regimental
number on turret side.

---

## Part VI — Israel

## 21. Merkava IVm Windbreaker (Israel, MBT) — removed 2026-08-13

The playable Windbreaker was removed by owner order. Its dormant first-party
spec/builder remains only as a construction donor for the earlier Merkava
family and must not be registered in the garage roster.

### 21.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 9.04 m (gun forward) — short overhang: FRONT ENGINE |
| Hull length | 7.60 m |
| Width | 3.72 m |
| Height | 2.66 m |
| Gun | 120 mm MG253 L/44 — thermal sleeve, evacuator near mantlet |

### 21.2 Armor (RHAe estimates)
| Location | KE / CE |
|---|---|
| Turret wedge front | ~650 / ~1000 (sloped modular wedges) |
| Hull front | ~500 / ~750 **+ engine block behind** (sim: engine module absorbs pens — signature survivability) |
| Turret sides | ~350 / ~500 + Trophy panels |
| Hull sides | 100 + heavy skirts |
- Gameplay: frontal pens hit engine first (mobility kill before crew kill); rear
  hull is the weak spot (troop door).

### 21.3 Mobility
Weight **65 t** | GD883 **1,500 hp** (23 hp/t) | Top **64 km/h** | Reverse 25.
Sim: hp 2550, hullTraverse 38.

### 21.4 Gun
M322 APFSDS apfsdsPens(650) dmg 520 / M325 HEAT-MP 600 dmg 480 / M339 HE-MP dmg 590
(programmable flavor: slightly larger splash). Reload 6.5 s, accuracy 0.31, +20/−7.

### 21.5 Visual modeling spec
**Silhouette**: unlike anything NATO: hull roof is a **wide shallow V** (two planes
meeting at centerline) sweeping down to very long sloped glacis; the engine hump sits
front-RIGHT with grilles on the right fender; the hull tapers rearward to a vertical
back plate with the **clamshell troop door** (split hatch outline).
**Turret**: the "arrowhead" — small frontal cross-section widening rearward in flat
diamond facets; NO exposed mantlet (gun pokes from a narrow V-notch); the turret rear
bustle carries the signature **ball-and-chain curtain** (model as a fringe of small
spheres on chains along the bustle underside); **Trophy APS** = flat angled slab
boxes on each turret side with vent lines + small radar squares at the corners;
commander's Rafael panoramic sight center-roof; 12.7 mm over the gun, 60 mm mortar
hatch left roof.
**Running gear**: 6 large road wheels on visible **external coil-spring bogies**
(Horstmann-style pairs — unique among moderns), 5 return rollers, sprocket FRONT
(front engine); skirts of overlapping angled slats, chunky mud flaps.
**Details**: raised air-intake ridge right hull, stowage baskets full turret rear,
dust everywhere.
**Paint**: IDF **Sinai grey** (#6f7566 single tone — instantly reads Israeli), black
chevron + white unit stencils on skirts, worn to bare metal on wheel rims.

---

## Part VII — China

## 22. Type 99A / ZTZ-99A (China, MBT) — procedural

### 22.1 Dimensions
Overall 11.0 m, hull 7.6 m, width 3.5 m (skirts 3.9), height 2.35 m.
Gun 125 mm ZPT-98 L/50 — evacuator + thermal sleeve.

### 22.2 Armor (RHAe estimates)
Turret front ~600 KE / ~850 CE base + **FY-4 ERA arrow wedges** (+150/+350);
glacis ~500/~700 + FY-4; sides 100 + ERA-tiled skirt forward half. hp 2400.

### 22.3 Mobility
Weight **55 t** | 150HB diesel **1,500 hp** (27.3 hp/t) | Top **70 km/h** |
Reverse **12 km/h** (better than Soviet lineage but not NATO).

### 22.4 Gun — carousel autoloader
DTC10-125 APFSDS apfsdsPens(660) dmg 520 / DTP-125 HEAT 650 dmg 470 / DTB-125 HE
dmg 580. Reload 7.0 s, accuracy 0.33, aimTime 2.1, +14/−7.

### 22.5 Visual modeling spec
**Silhouette**: Soviet DNA stretched: low hull like a T-72 but visibly LONGER with a
huge one-piece glacis fully tiled in **rectangular ERA bricks in a raked chevron
pattern**; splash ridge; driver center.
**Turret**: welded angular box (not a dome) whose front is the giveaway — two big
**arrow/wedge ERA panels** meeting at the gun like a flattened beak, extending past
the turret sides; slab side plates carry rectangular ERA tiles; roof has the
commander's panoramic sight right-rear and the **JD-3 laser dazzler** box left-rear
(distinct small turret-like cylinder — unique detail, keep it); tall meteo mast
rear-center; stowage baskets wrap the bustle.
**Running gear**: 6 large T-72-style stamped road wheels, 3 return rollers, sprocket
rear, heavy rubber skirts with ERA tiles on forward panels.
**Details**: exhaust port left-rear hull side (black stain), tow cables on glacis
over the ERA, twin whip antennas.
**Paint**: PLA 4-color woodland digital (green/tan/brown/black micro-square splinter
— reuse the 'digital' scheme with camoScale tuned tight) or parade solid green; white
turret number in PLA stencil font; red star on bustle bin.

---

## Part VIII — South Korea

## 23. K2 Black Panther (South Korea, MBT) — procedural

### 23.1 Dimensions
Overall 10.8 m, hull 7.5 m, width 3.6 m, height 2.4 m. Gun 120 mm CN08 **L/55**.

### 23.2 Armor (RHAe estimates)
Turret front ~650 KE / ~900 CE (modular composite); hull front ~500/~700;
sides 100 + composite skirt forward; soft/hard-kill APS hooks (not modeled r1). hp 2450.

### 23.3 Mobility — the suspension gimmick
- Weight **55 t** | HD DV27K **1,500 hp** (27.3 hp/t) | Top **70 km/h** | Reverse 25
- **ISU hydropneumatic**: kneel/lean — implement as best-in-class gun depression
  (−10 sim, with a "kneel" visual: hull pitches 3° nose-down when aiming below −6°).

### 23.4 Gun — bustle autoloader
K279 APFSDS apfsdsPens(700) dmg 530 / K280 HEAT 610 dmg 470 / K281 HE dmg 580.
**Reload 5.2 s** (autoloader; 3-crew), accuracy 0.29, aimTime 1.8, +20/−10.

### 23.5 Visual modeling spec
**Silhouette**: lean NATO-school wedge — low flat hull with a long clean glacis,
crisp squared fender line, full-length angular skirts with a stepped lower edge.
**Turret**: compact angular box with a **strongly raked one-piece front wedge**
(steeper than Leo 2A6 — almost 60° in side view) and short cheeks; roof steps DOWN
toward the rear (front roof raised over gunner sight — the K2's stepped-roof read);
tall **KCPS panoramic sight** tower rear-left, gunner's sight embedded in the right
front roof with armored shutter lines; RWS-less (crew .50 on ring); slim bustle with
autoloader blow-off panel seams and twin stowage baskets; 6-tube smoke banks angled
on the rear corners.
**Running gear**: 6 road wheels with in-arm ISU units (no torsion-bar level line —
wheels can sit with visible rake), 5 return rollers hidden by skirts, sprocket rear.
**Details**: crosswind mast, driver's wide single hatch, ROK tricolor roundel decal.
**Paint**: ROK 3-color (mid green #4c5844 / brown #5a4a38 / black) soft-edge blobs;
white 3-digit turret number; light mud on lower skirts.

---

## Part IX — Japan

## 24. Type 10 / Hitomaru (Japan, MBT) — procedural

### 24.1 Dimensions
Overall 9.49 m, hull 6.79 m (compact class with Leclerc), width 3.24 m — NARROWEST
modern MBT, height 2.30 m. Gun: JSW 120 mm L/44 (domestic).

### 24.2 Armor (RHAe estimates, modular fit)
Turret front ~600 KE / ~850 CE (nano-crystal steel + ceramic modules); hull ~450/~600;
sides: bolt-on modular slabs (60 + module). hp 2300 (light but modern).

### 24.3 Mobility — the CVT party trick
- Weight **48 t** (full modular fit) | V8 diesel **1,200 hp** (25 hp/t)
- Top **70 km/h** — **and 70 km/h in reverse (sim: reverse 25 cap, but give it the
  fastest reverse accel + no reverse steering penalty: the backpedal duelist)**
- Hydropneumatic: kneel both axes — gun depression −10 with nose-dip visual.

### 24.4 Gun — bustle autoloader
Type 10 APFSDS apfsdsPens(680) dmg 520 / JM12A1 HEAT-MP 600 dmg 470 / HE dmg 570.
Reload 5.5 s, accuracy 0.29, aimTime 1.8, +20/−10.

### 24.5 Visual modeling spec
**Silhouette**: small, taut, futuristic — shortest+narrowest MBT footprint; hull is
a clean wedge with a two-plane glacis and completely flat deck; side skirts are
**flat modular slabs with visible bolt studs** and a straight lower edge, slightly
inset from the fender line (the modular look).
**Turret**: low flat slab with a shallow wedge front; roof dominated by the large
**flat panoramic sight box on a short pylon, rear-center** (squared C4I mast) and the
gunner's sight window as a wide horizontal slot in the upper front face with shutter;
slab cheeks carry small smoke banks; shallow bustle with rack rails; roof .50 on
simple mount.
**Running gear**: **5 road wheels only** (key count — fewer than every other modern
MBT), 3 return rollers, sprocket rear, hydropneumatic stance variation.
**Details**: JGSDF number plate front+rear, side-skirt step cutout at wheel 1, twin
antennas, very clean surfaces (JGSDF garage-kept: minimal weathering, light dust).
**Paint**: JGSDF 2-tone — deep green #39463a + brown #63523c hard-edge waves; white
unit kanji stencil on hull front plate.

## 25. Type 74 (Japan, MBT) — variant of `stb1_haphazard` (CC-BY 4.0)

### 25.1 Dimensions
Overall 9.42 m, hull 6.70 m, width 3.18 m, height 2.25 m (hydropneumatic mid stance).
Gun 105 mm L7A3 (licensed).

### 25.2 Armor
Cast steel: turret front ~190 eff. (rounded), glacis 80 mm @ 65° (~190 eff.);
sides 35 mm. hp 1500 (cold-war tier partner to M60A3/Leo 1A5).

### 25.3 Mobility
38 t | 10ZF **720 hp** (18.9 hp/t) | Top **53 km/h** | Reverse 12.
Hydropneumatic kneel: −6°/+9° becomes effective −12 on a slope (sim: −9 depression).

### 25.4 Gun
Type 93 APFSDS (105) apfsdsPens(400) dmg 390 / Type 91 HEAT-MP 400 dmg 400 / HE 470.
Reload 6.0 s, accuracy 0.31, +9/−9 (sim −9/+12).

### 25.5 Variant spec (from the STB-1 GLB)
The Haphazard0587 STB-1 CAD is the Type 74 prototype: correct low **turtle-shell cast
turret** (smooth hemispherical with long tapered rear), 5 big dished road wheels, no
return rollers, hydropneumatic stance. To read as production Type 74 add: (1) the
**boxy IR searchlight** left of the mantlet (rectangular housing w/ round lens, on a
bracket); (2) .50 cal on the commander ring; (3) side mudguard ribs; (4) swap the
clay re-material for JGSDF 2-tone camo via `paintUntextured` + camo canvas; (5) white
JGSDF plate. Record as "modified: searchlight/MG added, re-materialed" per CC-BY 4.0.

---

## Part X — Italy

## 26. C1 Ariete (Italy, MBT) — procedural

### 26.1 Dimensions
Overall 9.67 m, hull 7.59 m, width 3.60 m, height 2.50 m. Gun 120 mm L/44 (OTO).

### 26.2 Armor (RHAe estimates)
Turret front ~400 KE / ~600 CE; hull front ~350/~500 (lightest first-rank NATO MBT —
plays as a sniper, not a brawler); sides 70 + skirts. hp 2150.

### 26.3 Mobility
Weight **54 t** | IVECO V12 MTCA **1,250 hp** (23.1 hp/t) | Top **65 km/h** | Reverse 25.
Slightly underpowered feel: slower accel curve than Leo/K2.

### 26.4 Gun
DM33 (licensed) APFSDS apfsdsPens(480) dmg 500 / MP HEAT 600 dmg 470 / HE dmg 560.
Reload 6.2 s, accuracy 0.29 (excellent Galileo FCS), aimTime 1.7, +20/−9.

### 26.5 Visual modeling spec
**Silhouette**: classic 90s NATO wedge, visually between Leo 2A4 and C2: flat long
deck, two-plane glacis with a prominent central driver bulge, squared fenders.
**Turret**: flat-faced angular box LIKE the 2A4 but with cheeks angled back ~15° in
plan and a distinctive **narrow vertical mantlet slot** flanked by two rectangular
recesses; gunner's sight is a roof-mounted box protruding above the right cheek line
(head sticks over the roof edge — key ID); big rear bustle rack full width; 4-tube
smoke banks angled on each side; TURMS panoramic sight center-right roof.
**Running gear**: 7 road wheels (torsion bar), 4 return rollers, sprocket rear;
rubber skirts with 5 vertical stiffener lines.
**Details**: long thin bore evacuator at mid-barrel, thermal sleeve rings, Italian
tricolor roundel on turret side, jerry cans on bustle.
**Paint**: solid NATO green base with heavy dark olive mottle (Italian scheme is
low-contrast); white "EI" registration on hull front.

---

## Part XI — Sweden

## 27. Stridsvagn 103 — SHIPPED
See `specs.js` (`strv103`) and ATTRIBUTION.md. Counts as the roster's casemate TD.
No changes planned; already meets bar as a sourced community vehicle.

---

## Appendix A — Balance ladder (APFSDS sim baseline vs frontal turret KE)

| Tier feel | Vehicles (pen → armor) |
|---|---|
| Cold-war (HP 1400–1800) | M60A3 380→250 · Leo1A5 390→120 · Type74 400→190 · Chieftain 400→380 |
| 1st-gen modern (HP 1850–2200) | M1(105) 410→400 · Leo2A4 480→420 · Ariete 480→400 · T-72B3 570→480+ERA · T-80U 550→550+ERA |
| 2nd-gen modern (HP 2300–2500) | T-90A 590→530+ERA · CR2 600→600 · M1A1 620→600 · Leclerc 640→620 · Merkava IVm 650→650 · Type 99A 660→600+ERA · Type 10 680→600 · K2 700→650 · Leo2A6 700→700 |
| Flagship (HP 2500–2700) | M1A2 SEPv3 750 · Leo2A7 730 · TUSK 750 · T-90M 640 · KF51 800→700 · T-14 800→900 hull |
| Support | Strv 103 · Bradley (TOW 900 CE) · BMP-2 (Konkurs 750 CE) |

Every APFSDS overmatches every cold-war target; flagship front plates defeat 1st-gen
rounds; ERA wedges force aim discipline vs the Russian line — matches the sim's
plate/ERA penetration model.

## Appendix B — Shared modern visual-bar checklist (verifier gate, per vehicle)

1. Trapezoidal track runs with sag between return rollers; correct wheel count per
   spec above (5/6/7 is a hard identity check).
2. Silhouette matches this doc's turret geometry paragraph at `tank_closeup_modern`
   camera distance; wheel count + skirt style + sight towers readable in garage.
3. Articulated TurretPivot/GunPivot nodes (or casemate flag); recoil path clear.
4. ERA/appliqué as raised geometry, not paint (Russians/Type 99A/TUSK).
5. Weathering: dust-band on skirts, exhaust soot at the correct port, edge chipping;
   parade-clean exceptions (T-14, Type 10) noted per vehicle.
6. Camo scheme + marking per vehicle Paint paragraph, using the specs.js `visual`
   scheme vocabulary (nato/solid/stripes/digital + camoScale).
7. Variants: ATTRIBUTION.md row with base model, author, license, and "modified" note
   before the GLB lands in `public/models/tanks/`.
