# Tank Roster — Modeling + Stats Reference

Definitive reference for the 8-tank roster. All geometry is built procedurally in three.js
(BufferGeometry composition); this doc is the single source of truth for dimensions, armor,
mobility, gun stats, and visual modeling specs.

Sources: Wikipedia, tanks-encyclopedia.com, army-guide.com, army-technology.com,
armyrecognition.com, globalsecurity.org. Modern-tank armor values are **open-source RHAe
estimates** (real values classified) — treated as game-design baselines, labeled as estimates.
gamemodels3d.com was used for **visual proportion reference only**; no assets were or may be
downloaded from it (paywalled ripped game assets — everything is built procedurally).

Conventions used throughout:

- **L/W/H**: length × width × height in meters. "Overall length" = gun forward; "hull length" excludes gun overhang.
- **Armor angles**: degrees from vertical (0° = vertical plate, 90° = horizontal).
- **Caliber notation**: L/56 = barrel length is 56 × bore diameter.
- **Damage abstraction**: suggested game HP-damage per shot, tuned so WWII tanks have ~700–1,200 HP pools and modern tanks ~2,000–2,700 HP pools.
- **Penetration**: mm RHA at 100 m unless noted (WWII figures are historical test data; modern figures are open-source estimates at 2 km).

---

## Part I — WWII Roster

---

## 1. M4A3E8 Sherman "Easy Eight" (USA, medium)

### 1.1 Dimensions
| Measure | Value |
|---|---|
| Overall length (gun forward) | 7.52 m |
| Hull length | 6.27 m |
| Width | 3.00 m (HVSS tracks) |
| Height | 2.97 m (to top of turret roof/cupola) |
| Gun | 76 mm M1A2, L/52 — barrel ≈ 3.96 m, with muzzle brake |
| Ground clearance | 0.43 m |

### 1.2 Armor (mm @ degrees from vertical)
| Location | Thickness / angle |
|---|---|
| Upper glacis | 63.5 mm @ 47° |
| Lower hull front (transmission housing) | 63.5–108 mm, rounded cast |
| Hull sides | 38 mm @ 0° |
| Hull rear | 38 mm @ 10° |
| Turret front | 63.5 mm rounded + 89 mm gun mantlet (wide T23 mantlet) |
| Turret sides/rear | 63.5 mm |
| Roof | 25 mm; hull floor 25 mm |

### 1.3 Mobility
- Weight: **33.7 t** | Engine: Ford GAA V8 petrol, **450 hp** (13.4 hp/t)
- Top speed: **42 km/h** road | Reverse: ~**8 km/h** (single reverse gear)
- Suspension: HVSS — soft, stable firing platform; good neutral handling, mediocre acceleration.

### 1.4 Gun — 76 mm M1A2
| Shell | Pen @ 100 m | Pen @ 1000 m | Suggested damage |
|---|---|---|---|
| M62 APCBC | 128 mm | 96 mm | 115 HP |
| M93 HVAP (premium) | 208 mm | 150 mm | 115 HP |
| M42A1 HE | 10 mm | — | 155 HP |
- Reload: **4.6 s** (fastest WWII gun in roster) | Elevation **+25° / −10°** (best depression in roster — hull-down king)
- Accuracy: excellent; fast turret traverse (~24°/s); vertical stabilizer → small on-the-move penalty.

### 1.5 Visual modeling spec
**Silhouette**: tall, narrow, friendly-looking box. Height ≈ hull length × 0.47 — visibly the *tallest-proportioned* WWII tank in roster. Hull is a slab-sided box with a single 47° sloped glacis plate; front lower third is a smooth **rounded cast transmission bulge** (model as a horizontal capsule/cylinder section spanning the hull front bottom). Rear deck flat with two small grilled engine hatches.

**Turret (T23 type)**: rounded-rectangular cast turret, wider than tall, sits centered slightly forward. Flat-front with a broad rectangular mantlet plate almost the full turret width; gun in center, coax MG hole right of gun. Distinct **rear bustle** overhang (stowage box silhouette). Roof: commander's vision cupola (low cylinder with 6 periscope bumps) on right, oval loader's hatch left, **.50 cal M2 machine gun on a pintle** behind the cupola — key US recognition feature.

**Running gear**: HVSS — **6 road-wheel stations per side, wheels in side-by-side pairs**, grouped into 3 bogies (each bogie = 2 stations + horizontal volute spring block between them). Model each station as two parallel discs with a visible gap. 5 small return rollers along the top; drive sprocket **front**, idler rear. Track width **58 cm** (23 in), rubber-chevron pattern. Track upper run covered by a full-length narrow fender/mudguard.

**External details**: 3-piece bolted or 1-piece cast front (model bolt-head dots along glacis edges), siren + 2 headlights with brush guards on glacis, tools on sponsons, spare track links hung on hull front, tow cable across glacis, radio antenna on turret rear right.

**Paint**: US **Olive Drab** (#4b5320 base, weather toward #6b6b47); white 3-inch star on hull sides/turret, white registration number "30xxxxx" on hull side. Optional mud-brown streak camo.

---

## 2. Tiger I — Pz.Kpfw. VI Ausf. E (Germany, heavy)

### 2.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 8.45 m |
| Hull length | 6.32 m |
| Width | 3.71 m (combat tracks) |
| Height | 3.00 m |
| Gun | 8.8 cm KwK 36, L/56 — barrel ≈ 4.93 m, double-baffle muzzle brake |

### 2.2 Armor — flat, thick, unangled (the defining trait)
| Location | Thickness / angle |
|---|---|
| Upper hull front | 100 mm @ 9° |
| Driver's plate | 100 mm @ 0° (vertical!) |
| Lower hull front | 100 mm @ 24° |
| Hull sides (upper/superstructure) | 80 mm @ 0° |
| Hull sides (lower, behind wheels) | 60 mm @ 0° |
| Hull rear | 80 mm @ 8° |
| Turret front | 100 mm @ 0° + **120 mm mantlet** covering most of the face |
| Turret sides/rear | 80 mm @ 0° |
| Roof | 25–40 mm |

### 2.3 Mobility
- Weight: **57 t** | Engine: Maybach HL230 P45 V12 petrol, **700 hp** (12.3 hp/t)
- Top speed: **45.4 km/h** road (surprisingly fast in a straight line) | Reverse: ~**8 km/h**
- Sluggish traverse/acceleration; regenerative steering lets it pivot in place (nice gameplay hook).

### 2.4 Gun — 8.8 cm KwK 36 L/56
| Shell | Pen @ 100 m | Pen @ 1000 m | Suggested damage |
|---|---|---|---|
| PzGr. 39 APCBC | 120 mm | 100 mm | 220 HP |
| PzGr. 40 APCR (premium) | 171 mm | 138 mm | 190 HP |
| Sprgr. HE | 12 mm | — | 270 HP |
- Reload: **6.5 s** | Elevation **+17° / −6.5°**
- Legendary accuracy at range — give it the best long-range dispersion in the WWII set. Turret traverse slow (~6–8°/s hydraulic — model ~14°/s for playability, still slowest in roster).

### 2.5 Visual modeling spec
**Silhouette**: massive vertical-slab shoebox. Everything reads as **boxes at right angles** — zero sloped panache. Hull is a rectangular prism; superstructure (upper hull) overhangs the tracks the full width, creating a wide flat "table top" front plate with the vertical driver's plate carrying a **ball-mounted MG bulge (right)** and a **driver's visor slit block (left)**. Mudguards with slight outward flare run full length over the tracks.

**Turret**: horseshoe plan — flat front plate, sides and rear form one continuous **half-cylinder wall** of constant height. Very wide flat-faced rectangular mantlet with central gun, thick cylindrical gun base. Roof is flat with a prominent **drum-shaped commander's cupola** (early: tall cylinder with vision slits; late: lower cast dome with periscopes) offset left. Small loader hatch right. Stowage bin (rounded box) across the whole turret rear.

**Running gear**: the signature — **interleaved, overlapping road wheels**: 8 axles per side, large dished wheels (~80 cm) in triple overlapping rows; model 3 layers of discs with alternating z-offsets so edges overlap like scales. No return rollers (track rides on wheel tops). Drive sprocket front, idler rear. Track width **72.5 cm** — visually very wide, flat metal chevron links.

**External details**: vertical exhaust pair with armored shrouds on rear plate (often with cylindrical Feifel air-cleaner canisters flanking), spare track links hung on turret sides and lower hull front, tow cables along hull sides, jack block on rear, headlight center-glacis, S-mine launcher stubs on hull corners. Optional **Zimmerit** — render as fine horizontal ridged noise texture on vertical surfaces.

**Paint**: base **Dunkelgelb** dark yellow (#9b8a55), with olive-green (#6a713f) and red-brown (#7a4a35) soft-edge stripe camo; black-outline white Balkenkreuz on hull sides, red or black 3-digit turret number.

---

## 3. T-34-85 (USSR, medium)

### 3.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 8.10 m |
| Hull length | 6.10 m |
| Width | 3.00 m |
| Height | 2.72 m |
| Gun | 85 mm ZiS-S-53, L/54.6 — barrel ≈ 4.64 m, no muzzle brake |

### 3.2 Armor — thin but brilliantly sloped
| Location | Thickness / angle |
|---|---|
| Upper glacis | 45 mm @ 60° (≈ 90 mm effective, high ricochet chance) |
| Lower glacis | 45 mm @ 53° |
| Hull sides | 45 mm @ 40° upper (sponson) / 45 mm @ 0° lower |
| Hull rear | 45 mm @ 47° |
| Turret front | 90 mm rounded cast |
| Turret sides | 75 mm @ 20° |
| Roof | 20 mm |

### 3.3 Mobility
- Weight: **32.0 t** | Engine: V-2-34 V12 **diesel**, **500 hp** (15.6 hp/t — best power/weight of WWII set)
- Top speed: **55 km/h** road (fastest WWII tank in roster) | Reverse: ~**7 km/h**
- Christie suspension: fast, bouncy — big gun bloom on the move, wide turns at speed.

### 3.4 Gun — 85 mm ZiS-S-53
| Shell | Pen @ 100 m | Pen @ 1000 m | Suggested damage |
|---|---|---|---|
| BR-365K APHE | 119 mm | 97 mm | 180 HP |
| BR-365P APCR (premium) | 167 mm | 110 mm | 160 HP |
| O-365K HE | 11 mm | — | 240 HP |
- Reload: **7.0 s** | Elevation **+22° / −5°** (poor depression — punish ridge play, reward flat-ground brawling)
- Mediocre accuracy; strong flanker/brawler identity.

### 3.5 Visual modeling spec
**Silhouette**: low, sleek wedge — **every hull surface is sloped**; no vertical plate anywhere on the hull. One long clean 60° glacis runs from nose to hull roof, carrying a driver's rectangular hatch (upper left) and a ball MG bulge (right). Hull sides slope inward above the tracks (sponsons overhang the tracks). Rear deck slopes down with a round transmission access hatch and louvered grilles.

**Turret (85 model, 3-man)**: large **hexagonal-cast rounded turret** set well forward — plan view is a fat hexagon with bulged cheeks; sides flare outward at the bottom (casting flare). Front is a narrow rounded face with a compact rounded mantlet hugging the gun. Roof: **two mushroom-dome ventilator caps** in a line at the rear of the roof (signature!), commander's low cylindrical cupola with split hatch (left), gunner periscope right.

**Running gear**: Christie — **5 large road wheels per side** (~83 cm), rubber-rimmed with **big lightening holes** (model 6 round holes per wheel face, "spider" look); noticeable gap between wheel 1 and 2. **No return rollers** — top track run slopes straight from idler to sprocket. Drive sprocket **rear** (rollered, spokeless), idler front. Track width **50 cm**, waffle-pattern links.

**External details**: **two cylindrical fuel drums** slung on the rear hull sides at 45° (signature), rectangular external stowage boxes on left fender, sawtooth-edge fenders, **grab handrails** welded along hull sides and turret (for tank riders), tow hooks, single headlight left glacis.

**Paint**: Soviet **4BO protective green** (#5a6b46, weather toward #6f7d55); white turret slogan/number (e.g. "312" or Cyrillic patriotic slogan), optional whitewash winter scheme.

---

## 4. IS-2 (USSR, heavy)

### 4.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 9.90 m (huge gun overhang) |
| Hull length | 6.77 m |
| Width | 3.09 m |
| Height | 2.73 m |
| Gun | 122 mm D-25T, L/48 — barrel ≈ 5.85 m, large double-baffle muzzle brake |

### 4.2 Armor (model 1944 hull)
| Location | Thickness / angle |
|---|---|
| Upper glacis | 100 mm @ 60° (≈ 200 mm effective — near immune frontally to WWII guns) |
| Lower glacis | 100 mm @ 30° |
| Hull sides | 90 mm @ 0–15° |
| Hull rear | 60 mm @ 41° |
| Turret front | 100 mm rounded cast + 100 mm mantlet |
| Turret sides/rear | 90 mm rounded |
| Roof | 30 mm |

### 4.3 Mobility
- Weight: **46 t** | Engine: V-2-IS V12 diesel, **520 hp** (11.3 hp/t)
- Top speed: **37 km/h** road (slowest in roster) | Reverse: ~**5 km/h**
- Ponderous; long hull, slow hull traverse.

### 4.4 Gun — 122 mm D-25T (the alpha-strike monster)
| Shell | Pen @ 100 m | Pen @ 1000 m | Suggested damage |
|---|---|---|---|
| BR-471 APHE | 165 mm | 143 mm | 390 HP |
| BR-471B APBC (late) | 175 mm | 152 mm | 390 HP |
| OF-471 HE | 15 mm | — | 450 HP |
- Reload: **13.5 s** (two-piece ammunition — the defining drawback; real rate 2–3 rpm)
- Elevation **+20° / −3°** (worst depression in roster) | Poor accuracy, huge muzzle blast/smoke VFX.
- Identity: one shot ruins someone's day, then 13 seconds of vulnerability.

### 4.5 Visual modeling spec
**Silhouette**: long low hull utterly dominated by the **gun** — barrel overhang past the hull nose ≈ 3.1 m, ending in a chunky two-chamber muzzle brake (model: cylinder, gap, two flared rings). Hull front is a sharp prow: 60° upper glacis meeting a reverse-angled lower plate (model 1944 "straightened" nose — one clean plate, small driver's periscope hump, **no driver hatch/visor on the glacis**). Hull sides vertical over the tracks with sponson overhang.

**Turret**: rounded **cast turret, egg/frustum plan**, flattened dome roof, positioned mid-hull. Broad curved mantlet with the gun in a distinctive **cast cradle that bulges beneath the barrel root**. Narrow rear bustle with pistol port. Roof: commander's cupola (low cylinder, split hatch) left, round loader hatch right mounting a **12.7 mm DShK AA machine gun on a ring** (big, chunky, spade grips — signature late-war feature).

**Running gear**: **6 smallish all-steel road wheels** per side (no rubber tire — flat dished discs with 6 rib spokes), **3 return rollers**, drive sprocket rear, idler front. Torsion bar ride height low. Track width **65 cm**.

**External details**: flat rectangular external fuel tanks + cylindrical fuel drums on rear deck sides, sawtooth fenders with stowage boxes, tow cables draped along hull sides, spare track links on glacis, handrails on turret sides.

**Paint**: Soviet 4BO green (same family as T-34-85, slightly darker #52603f); white turret numbers, optional white "victory" slogans; heavy exhaust staining on rear deck.

---

## 5. Panther Ausf. G — Pz.Kpfw. V (Germany, medium/heavy hybrid)

### 5.1 Dimensions
| Measure | Value |
|---|---|
| Overall length | 8.66 m |
| Hull length | 6.87 m |
| Width | 3.42 m |
| Height | 2.99 m |
| Gun | 7.5 cm KwK 42, L/70 — barrel ≈ 5.25 m, slim double-baffle muzzle brake |

### 5.2 Armor — great front, weak sides
| Location | Thickness / angle |
|---|---|
| Upper glacis | 80 mm @ 55° (≈ 140 mm effective) |
| Lower glacis | 50 mm @ 55° |
| Hull sides (upper, Ausf. G) | 50 mm @ 29° |
| Hull sides (lower) | 40 mm @ 0° |
| Hull rear | 40 mm @ 30° |
| Turret front | 100 mm @ 12° + 100 mm **cylindrical curved mantlet** (lower half can ricochet shots into hull roof — model the classic mantlet trap, or use late "chin" mantlet to remove it) |
| Turret sides/rear | 45 mm @ 25° |
| Roof | 16–40 mm |

### 5.3 Mobility
- Weight: **45.5 t** | Engine: Maybach HL230 P30 V12 petrol, **700 hp** (15.4 hp/t)
- Top speed: **46 km/h** governed (55 km/h early ungoverned — use 48–50 for game feel) | Reverse: ~**4–5 km/h** (very poor — punishes overextension)
- Fast in a straight line, wide sluggish turns; slow turret traverse when hull stationary.

### 5.4 Gun — 7.5 cm KwK 42 L/70 (the sniper)
| Shell | Pen @ 100 m | Pen @ 1000 m | Suggested damage |
|---|---|---|---|
| PzGr. 39/42 APCBC | 138 mm | 111 mm | 135 HP |
| PzGr. 40/42 APCR (premium) | 194 mm | 149 mm | 135 HP |
| Sprgr. 42 HE | 9 mm | — | 175 HP |
- Reload: **5.5 s** | Elevation **+18° / −8°**
- Highest muzzle velocity in WWII set (935 m/s AP) → flattest arc, best moving-target leads; give it the tightest dispersion together with Tiger.

### 5.5 Visual modeling spec
**Silhouette**: the "modern-looking" WWII tank — big, tall (nearly Tiger-size) but all **long continuous slopes**. One huge uninterrupted 55° glacis from nose to hull roof (no hatches or visors on it in Ausf. G — just a ball MG mount right and driver periscopes on the roof edge). Hull sides: sloped upper superstructure over vertical lower hull. Rear plate slopes back, carrying **two vertical cylindrical exhaust pipes with sheet-metal shrouds** (signature) plus small stowage cylinders.

**Turret**: narrow-front trapezoid — plan view wedge, sides sloped inward at 25°, flat sloped roof. Front face is small; the gun sits in a **rounded cast cylindrical mantlet** ("rolling-pin" — model as a horizontal cylinder segment, or the flattened "chin" variant). Cast cupola with periscope ring offset left-rear; small circular AA-MG ring optional. Rectangular stowage/vent details on roof.

**Running gear**: interleaved like Tiger but neater — **8 large dual road wheels per side**, overlapping in two visual layers (not triple), rubber-rimmed with 16 small rim bolts. Drive sprocket front, idler rear, no return rollers. Track width **66 cm**. Thin full-length fenders; **side skirt plates (Schürzen)** hanging over the upper track run — flat rectangular panels, some missing/bent for character.

**External details**: tow cables along hull sides, spare tracks on hull rear/sides, jack, C-hooks; optional Zimmerit ridge texture (early G only). Stowage bins integrated into sponson rear.

**Paint**: Dunkelgelb base with **"ambush" scheme** — olive-green + red-brown patches with contrasting dots (#9b8a55 / #6a713f / #7a4a35); Balkenkreuz hull sides, red-outline white turret numbers.

---

## Part II — Modern Roster

Armor values below are **open-source RHAe estimates** (vs KE = kinetic long-rod; vs CE = shaped-charge). Real values are classified; these are consistent with published analyst ranges and adequate for game balance.

---

## 6. M1A2 Abrams SEPv3 / M1A2C (USA)

### 6.1 Dimensions
| Measure | Value |
|---|---|
| Overall length (gun forward) | 9.77 m |
| Hull length | 7.93 m |
| Width | 3.66 m (3.9 m with skirts) |
| Height | 2.44 m to turret roof (~2.9 m over CROWS) |
| Gun | 120 mm M256 smoothbore, L/44 — barrel ≈ 5.28 m, thermal sleeve + bore evacuator + MRS collar at muzzle |

### 6.2 Armor (RHAe estimates)
| Location | vs KE | vs CE |
|---|---|---|
| Turret front (cheeks, DU 3rd-gen package) | ~800–900 mm | ~1,200–1,300 mm |
| Hull front (upper glacis is extremely shallow ~82° — near-auto-ricochet; lower front plate is the real target) | ~600 mm | ~700–800 mm |
| Turret sides (frontal 30° arc) | ~300–400 mm | ~400–500 mm |
| Hull sides | 30–100 mm + heavy ballistic skirts (first 3 skirt panels are thick armor) | — |
| Rear/roof | thin (~30–40 mm) | — |
- Known weak zones for gameplay: turret ring, gunner's sight aperture, lower front plate, ammo bustle rear (hit → blow-off panels VFX instead of instant detonation).
- Optional **Trophy APS** boxes on turret sides (intercepts 1–2 CE rounds; visual: slab boxes + radar panels).

### 6.3 Mobility
- Weight: **66.8 t** (heaviest in roster) | Engine: AGT1500 **gas turbine**, **1,500 hp** (22.5 hp/t)
- Top speed: **67 km/h** governed | Reverse: ~**40 km/h** (excellent)
- Audio note: turbine whine, not diesel rattle — signature sound. Fast acceleration for its bulk; thirsty idle heat shimmer from rear grille as VFX flourish.

### 6.4 Gun — 120 mm M256 (manual loader)
| Round | Pen @ 2 km (est.) | Suggested damage |
|---|---|---|
| M829A4 APFSDS (DU) | ~750 mm vs KE | 540 HP |
| M830A1 MPAT (HEAT-MP) | ~600 mm vs CE | 480 HP |
| M1147 AMP (programmable HE) | ~60 mm | 600 HP vs soft/ERA strip |
- Reload: **6.0 s** (human loader — steady, no autoloader dump) | Elevation **+20° / −10°** (best modern depression)
- Fully stabilized: near-full accuracy on the move; CITV → give commander's "hunter-killer" quick-snap target handoff mechanic.

### 6.5 Visual modeling spec
**Silhouette**: long, low, **flat and angular everywhere** — the whole tank reads as facets. Hull glacis is one extremely shallow plate (almost horizontal) meeting a short blunt lower plate; hull roof dead flat; rear hull vertical with a full-width **fine horizontal-louver turbine exhaust grille**.

**Turret**: huge in plan, longer than it is wide, **flat-roofed wedge**: vertical-ish front cheek plates angled back in plan (arrow from above), flat sides, and a long squared **bustle** extending well past the ring, wrapped in a **pipe-frame bustle rack** stuffed with duffel/stowage boxes (model rack as thin cylinders + box fill). Gun mount is a narrow rectangular embrasure with flat mantlet plates.

**Roof furniture (key recognition set)**: **CITV** — a cylindrical pedestal with a rotating mirrored head, forward-left roof; **GPS doghouse** (gunner's primary sight — angular box with door) forward-right; commander's **CROWS-LP remote weapon station** with .50 cal M2 (boxy sensor pod + gun cradle) center-right; loader's hatch with skate-ring 7.62 M240 left; two whip antennas rear; wind sensor mast rear-left.

**Running gear**: **7 road wheels per side**, evenly spaced, rubber-rimmed flat discs; 2 return rollers hidden by **full-length flat side skirts** (7 slab panels; front 3 visibly thicker with lift handles). Drive sprocket rear, idler front. Track width **63.5 cm**, T158 rubber-pad blocks.

**External details**: 2× **M250 smoke launcher clusters** (6 tubes each, angled fan) on turret cheeks; tow cable on glacis; mud flaps front/rear; optional Trophy APS slabs on turret sides; rear bustle rack often carries orange VS-17-style panel (nice color pop).

**Paint**: desert **CARC tan** (#b49a6e) or NATO 3-color green/black/brown (#4c5d43/#2e2e2e/#5f4a37); black tactical numerals on skirts and turret side, white-on-black "bumper codes" on skirt front.

---

## 7. T-90M Proryv (Russia)

### 7.1 Dimensions
| Measure | Value |
|---|---|
| Overall length (gun forward) | 9.63 m |
| Hull length | 6.86 m |
| Width | 3.78 m (with skirts) |
| Height | **2.23 m** to turret roof — dramatically lower than NATO tanks (make this read in-game: T-90M ≈ 75% of Abrams silhouette height) |
| Gun | 125 mm 2A46M-5 smoothbore, L/48 — barrel ≈ 6.0 m, **bore evacuator at mid-barrel** + thermal sleeve, no muzzle brake |

### 7.2 Armor (RHAe estimates) + ERA coverage
| Location | vs KE | vs CE |
|---|---|---|
| Turret front (welded turret, composite + **Relikt ERA**) | ~650–800 mm w/ ERA | ~1,000–1,200 mm w/ ERA |
| Hull glacis (composite + Relikt) | ~600–700 mm w/ ERA | ~900–1,100 mm w/ ERA |
| Turret sides w/ Relikt bricks | ~300–400 mm | ~500–600 mm |
| Hull sides: front half **Relikt soft-bag/brick skirts**, rear half slat/cage screens | ~150–250 mm | 250–400 mm vs single CE |
| Rear | slat screens vs CE only | — |
- **ERA mechanic**: Relikt tiles are consumable — each hit strips tiles (visual: bricks blown off, bare patch revealed) and degrades that zone to base armor (~500 mm KE turret). Roof: optional anti-drone "cope cage" lattice (cosmetic/UAV mechanic).
- Weak zones: driver's hatch strip on glacis center, gun-sight embrasure, turret ring, lower front plate, **carousel autoloader** in hull floor (side/floor pen → catastrophic ammo-rack event, turret-toss VFX opportunity — tastefully brief).

### 7.3 Mobility
- Weight: **48 t** (lightest modern) | Engine: V-92S2F V12 diesel, **1,130 hp** (23.5 hp/t)
- Top speed: **60–65 km/h** | Reverse: ~**5 km/h** (mechanical gearbox — the great Russian weakness; make it a real tactical liability)
- Small, agile, hard to hit; can't back out of trouble.

### 7.4 Gun — 125 mm 2A46M-5 (carousel autoloader, crew of 3)
| Round | Pen @ 2 km (est.) | Suggested damage |
|---|---|---|
| 3BM60 Svinets-2 APFSDS | ~600–660 mm vs KE | 520 HP |
| 3BK31 HEAT | ~650–700 mm vs CE | 470 HP |
| 3OF82 HE-Frag | ~50 mm | 580 HP |
| 9M119M1 Refleks-M GL-ATGM (through barrel) | ~900 mm vs CE, ~5 km range | 460 HP — slow missile, unique long-range poke |
- Reload: **7.5 s fixed** (autoloader — never faster, never slower, unaffected by crew loss) | Elevation **+14° / −6°** (shallow — poor on ridgelines)

### 7.5 Visual modeling spec
**Silhouette**: squat, wide, compact — hull is a low wedge with a short 68° glacis crossed by a **V-shaped splash board** and covered in horizontal rows of **Relikt ERA slabs** (model as a grid of shallow rectangular tiles, slightly proud of the glacis, with visible gaps). Driver hatch top-center of glacis between tile rows.

**Turret**: unlike old round Soviet domes, the T-90M has a **welded flat-faceted turret**, but it still reads compact and rounded in outline because it's completely **cloaked in angular ERA blocks**: wedge-shaped brick clusters on the front cheeks angling back, rectangular tile rows along the sides. Gun emerges from a narrow gap between the cheek wedges. **Large squared bustle box** on the turret rear (new for the M — carries ammo/APU; flat sides, mesh top rail). Roof: gunner's **Sosna-U sight** (large rectangular armored box with double doors) left of gun; commander's panoramic sight on a stalk center-rear; **12.7 mm Kord RWS** low mount by commander hatch; meteorological sensor mast; optional flat "cope cage" lattice on posts over the whole roof.

**Running gear**: **6 large road wheels per side** (~75 cm), rubber-rimmed, slight gaps, 3 return rollers hidden by skirts; drive sprocket rear, idler front. Track width **58 cm**. **Side skirts**: front half = chunky ERA-brick panels (3D relief), rear half = flat rubber sheets ending in **slat-armor cage** around the engine compartment corners and rear.

**External details**: **snorkel tube** stowed transversely on turret bustle (deep-wading kit — classic Russian ID), unditching log on rear hull, tow cables, 2×6 smoke dischargers (902B) angled off turret front corners, IR-signature "Nakidka"-style matte cloth wrap optional.

**Paint**: Russian **dark forest green** overall (#3f5138) or 3-tone green/black/sand digital-edge camo; white tactical number on turret side, small red star optional.

---

## 8. Leopard 2A7 (Germany)

### 8.1 Dimensions
| Measure | Value |
|---|---|
| Overall length (gun forward) | 10.97 m (longest in roster) |
| Hull length | 7.72 m |
| Width | 3.75 m (4.0 m with A7 side modules) |
| Height | 2.64 m to turret roof (~3.0 m over PERI sight) |
| Gun | 120 mm Rheinmetall **L/55** smoothbore — barrel ≈ 6.6 m (longest, thinnest-looking barrel), thermal sleeve, bore evacuator ⅔ down barrel, muzzle reference collar |

### 8.2 Armor (RHAe estimates)
| Location | vs KE | vs CE |
|---|---|---|
| Turret front (base + **wedge add-on modules**) | ~800–900 mm | ~1,300–1,700 mm (spaced wedge defeats HEAT superbly) |
| Hull front | ~600–650 mm | ~750–900 mm |
| Turret sides (frontal arc) | ~300–400 mm | ~500 mm |
| Hull sides | 40–100 mm + heavy front skirt sections + A7 add-on side modules | vs RPG ~400 mm |
| Rear/roof | thin; A7 adds mine/belly plate (bottom) | — |
- Weak zones: the classic **left-cheek gunner's sight cutout** in the wedge (EMES 15 recess), turret ring, lower front plate, hull ammo rack front-left of driver.

### 8.3 Mobility
- Weight: **67.5 t** | Engine: MTU MB 873 Ka-501 twin-turbo V12 diesel, **1,500 hp** (22.2 hp/t)
- Top speed: **68 km/h** (fastest modern) | Reverse: **31 km/h**
- Best all-round drivetrain feel: fast, smooth, strong reverse; slightly wider turning than Abrams.

### 8.4 Gun — 120 mm L/55 (manual loader)
| Round | Pen @ 2 km (est.) | Suggested damage |
|---|---|---|
| DM63/DM73 APFSDS | ~700–750 mm vs KE (L/55 velocity edge — give it best pen + flattest trajectory of modern set) | 530 HP |
| DM12A2 HEAT-MP | ~600 mm vs CE | 480 HP |
| DM11 programmable HE (airburst) | ~40 mm | 590 HP, airburst vs exposed/soft |
- Reload: **6.0 s** (human loader) | Elevation **+20° / −9°**
- Best-in-class fire control: smallest dispersion, fastest full-accuracy settle.

### 8.5 Visual modeling spec
**Silhouette**: big, long, purposeful — the **arrowhead turret** is the identity. Hull: sharp-edged 81° glacis with a distinct center crease/step where it meets the flat hull roof; boxy vertical hull rear with two round cooling-fan circles + rectangular exhaust grilles on the rear plate.

**Turret**: base turret is a flat-roofed box, but the front is covered by **two large wedge-shaped spaced-armor modules** meeting at a point ahead of the gun — in plan view a sharp arrow (~35° per side), in side view sloped back ~60°. The wedges stand **proud of the base turret with a visible gap** (spaced armor — model as separate shells). Gun passes through the arrow's notch with flat plate mantlet. On the **right wedge roof edge: EMES 15 gunner's sight** recessed in a rectangular cutout with vertical sliding shutter (the famous weak spot — model it). Roof: **PERI R17 commander's panoramic periscope** on a tall stalk, center-right behind hatch (tallest thing on the tank); optional **FLW 200 RWS** with .50 cal; crosswind mast rear; big flat stowage baskets wrapping the turret rear and sides (mesh bottom rectangles), A7 often adds slat/mesh bustle rack extension.

**Running gear**: **7 road wheels per side**, rubber-rimmed with prominent **hub caps and 8 relief holes**, spacing slightly irregular (gap after wheel 2); drive sprocket rear, idler front; 4 return rollers behind skirts. Track width **63.5 cm**. **Side skirts**: front third = deep sculpted heavy-armor blocks (stepped 3D profile — very recognizable), rear two-thirds flat panels with wavy lower edge.

**External details**: 2×8 **smoke dischargers** in two curved rows on each turret rear side (16 total — more tubes than any other tank here); tow cables on hull rear; convoy plate; German cross (Balkenkreuz, grey/black) on turret sides.

**Paint**: **NATO 3-color** — dark green base (#4c5d43) with black (#2b2b2b) and red-brown (#5f4a37) hard-edge patches; black "Y-" registration plate on hull front/rear; turret tactical number stencil.

---

## Appendix A — Quick balance table

| Tank | Wt (t) | hp | hp/t | Top / Rev (km/h) | Best pen (std round, mm) | Dmg | Reload (s) | Depression |
|---|---|---|---|---|---|---|---|---|
| M4A3E8 | 33.7 | 450 | 13.4 | 42 / 8 | 128 | 115 | 4.6 | −10° |
| Tiger I | 57.0 | 700 | 12.3 | 45 / 8 | 120 | 220 | 6.5 | −6.5° |
| T-34-85 | 32.0 | 500 | 15.6 | 55 / 7 | 119 | 180 | 7.0 | −5° |
| IS-2 | 46.0 | 520 | 11.3 | 37 / 5 | 165 | 390 | 13.5 | −3° |
| Panther G | 45.5 | 700 | 15.4 | 48 / 5 | 138 | 135 | 5.5 | −8° |
| M1A2 SEPv3 | 66.8 | 1500 | 22.5 | 67 / 40 | ~750 @2km | 540 | 6.0 | −10° |
| T-90M | 48.0 | 1130 | 23.5 | 63 / 5 | ~640 @2km | 520 | 7.5 (fixed) | −6° |
| Leopard 2A7 | 67.5 | 1500 | 22.2 | 68 / 31 | ~730 @2km | 530 | 6.0 | −9° |

## Appendix B — Procedural modeling cheat sheet (one line each)

- **M4A3E8**: tall box + 47° glacis + rounded cast nose; T23 rounded turret + wide flat mantlet + .50 cal; 6 paired-wheel HVSS stations in 3 bogies, sprocket front; olive drab + white star.
- **Tiger I**: vertical slab box, full-width superstructure; horseshoe turret + drum cupola; 3-layer interleaved big wheels, 72.5 cm tracks, sprocket front; dunkelgelb stripes + Zimmerit ridges.
- **T-34-85**: all-sloped wedge hull; fat hexagonal cast turret + 2 mushroom vents; 5 big holed Christie wheels, no return rollers, sprocket rear; 4BO green + fuel drums + handrails.
- **IS-2**: prow-nosed hull, 3.1 m gun overhang + double-baffle brake; rounded cast turret + DShK on ring; 6 steel wheels + 3 return rollers, sprocket rear; dark green.
- **Panther G**: one giant 55° glacis, tall sloped sides; narrow wedge turret + cylindrical "rolling-pin" mantlet; 8 interleaved rubber-rim wheels, sprocket front, twin shrouded exhaust stacks; ambush camo.
- **Abrams SEPv3**: near-horizontal glacis, flat faceted turret + long bustle rack; CITV cylinder + GPS doghouse + CROWS .50; 7 wheels behind flat skirts, sprocket rear, turbine grille rear; tan/NATO.
- **T-90M**: lowest silhouette; welded turret cloaked in Relikt ERA wedges + rear bustle box + Kord RWS + snorkel tube; 6 wheels, ERA skirt front half + slat cage rear; dark green.
- **Leopard 2A7**: longest gun (L/55); arrowhead spaced-armor turret wedges + PERI stalk + EMES cutout weak spot; 7 wheels, sculpted heavy front skirts, 16 smoke tubes; NATO 3-color hard-edge.

## Appendix C — Sources

- Wikipedia: M4 Sherman, Tiger I, T-34-85, IS-2, Panther, M1 Abrams, Leopard 2 (dimensions, armor, mobility)
- tanks-encyclopedia.com (armor schemes, variant details)
- army-technology.com — Abrams M1A2 SEPv3, Leopard 2A7+ project pages (modern dims/weights)
- armyrecognition.com — M1A2 SEPv3, T-90M, Leopard 2A7 data sheets
- globalsecurity.org — M1 Abrams specifications
- WWII penetration tables: US Army Ballistic Research Lab / Wa Prüf firing-table data as compiled in public references
- gamemodels3d.com WoT USA vehicle listings — **visual proportion reference only; no assets downloaded** (paywalled ripped game assets; all game geometry is procedural)
