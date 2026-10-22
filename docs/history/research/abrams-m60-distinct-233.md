# Distinct M1A1 marks and M60s — release 233

Owner, 2026-10-21 (verbatim): "make the m1a1 HA, AIM, FEP, HC, and SA look a lot more different noticeably than each
other. theyre kinda samey rn. same with m60a3 and m60a1 patton, they should take inspo from the sabra, which is a better
model but technically the real sabras was based off the m60s."

Branch `item/vehicles-abrams-m60-distinct-233`, from main 150e1ed59a. Owned IDs: `m1a1ha`, `m1a1_abrams_hc`,
`m1a1_abrams_aim`, `m1a1_abrams_fep`, `m1a1_abrams_sa`, `m60a1`, `m60a3`. The base `m1a1` is the unchanged family
reference. The M1A2 / TTS ids belong to the gun-hull fleet lane and are untouched.

## Why they looked alike

All six M1A1 marks and both M60s took the same US desert-mottle service coat (`service_usa_desert`), and every M1A1
mark shares the certified Tejas-family hull, turret and armour packages; their differences were small roof fittings
that do not read at Garage or battle distance. The two M60s shared one hull kit (USMC side and glacis cassettes), one
bustle rack and one paint.

## Per-ID identity matrix

| ID | Service fit it is based on | Paint (new Signature) | Large identifying kit |
| --- | --- | --- | --- |
| `m1a1ha` | M1A1 Heavy Armor in Desert Storm, 1991, as a breaching tank | US desert service coat (default) | track-width mine plow (TWMP) in its raised travel position on the bow; canvas rack cover piled with bedrolls and ration cases; water cans on a shelf behind the rack; ammunition cans on the bustle roof. Keeps its heavy-armour turret-front cassettes and armoured CWS window. |
| `m1a1_abrams_hc` | M1A1 Heavy Common in US Army Europe service, 1990s | `sig_m1a1_abrams_hc` NATO three-tone woodland | folded camouflage-net bundle and bedroll over a canvas rack cover; two fuel cans on the bustle roof. Keeps its XM32 wedge skirts and split-shield loader's gun. |
| `m1a1_abrams_aim` | M1A1 AIM in Operation Iraqi Freedom, 2004 | US desert service coat (default) | combat identification panels (issue green) on both bustle flanks and the rack's rear fence; the FBCB2 / Blue Force Tracking dome; the SINCGARS pair of long whips (its decoration manifest). Keeps its armoured commander's station (the CITV-like tower). |
| `m1a1_abrams_fep` | USMC M1A1 FEP | `sig_m1a1_abrams_fep` USMC four-colour woodland | second-generation FLIR head on the gunner's primary sight; the commander's remote thermal sight on its mast; the loader's thermal sight on his M240 (it pitches with the gun); sea bag and ammunition cans over a rack cover. Keeps its ULCANS cover, now in woodland. |
| `m1a1_abrams_sa` | M1A1 SA with TUSK | US desert service coat (default) | bustle-rack extension (a second loaded lattice basket); the TUSK tank-infantry phone on the right rear; the SA FLIR head with its sun hood on the gunner's primary sight. Keeps its TUSK armour and remote station. |
| `m60a1` | USMC M60A1 RISE/Passive with appliqué armour, Desert Storm 1991 | US desert service coat (default) | keeps the side and glacis armour courses, the AN/VSS-1 searchlight and the bare M68 tube; its cheek cassettes now sit level on the casting. |
| `m60a3` | US Army M60A3 (TTS) in Europe, 1980s | `sig_m60a3` MERDC woodland | open running gear under full-length fenders with turned-down lips and welded gussets (no side or glacis cassettes); two rear fender bins; the hull side wall behind the track and the sponson floor plate that close the space under the fenders; the crosswind sensor on its mast; levelled turret ERA cassettes; the TTS housing, smoke dischargers, thermal sleeve and the owner's oversized searchlight. |

Sources: the existing packets (`docs/references/tanks/m1a1.md`, `m1a1ha.md`, `m60a1.md`, `m60a3.md`, `sabra_mk2_x.md`)
for the hull and turret datums; public descriptions of the variants for the fits (Wikipedia "M1 Abrams" variant list,
GlobalSecurity M1 specifications, FAS M60 series). No packet exists for the HC, AIM, FEP and SA ids under their current
names (their builds descend from the old M1A2 / TUSK / SEPv2 / SEPv3 studies; see `m1a2*.md`).

## Decorations

The render-time decoration layer (`src/vehicles/decorations.ts`) gains two rows, logged in `docs/DECORATIONS.md`:
`m1a1ha` keeps its default draw minus the bow shackles and tow chain (the plow fills the bow) and `m60a3` gets its own loadout.

## Stats

No spec, tier or armour change. Every new item is equipment (no hit-model ownership); the M60A3 loses its cosmetic side
and glacis cassettes, whose geometry the regenerated combat anatomy measures. The A3's turret ERA stays (it is in its
armour spec).

## Paint and receipts

Owner, 2026-10-22 (verbatim): "however my only qualm is i dont like the monnocolor flat camos, just use the default
americann desert for those kinds of cases. i do like the new special camos you added to differentiate tank tho". The
four flat coats (HA sand, AIM tan, SA green, M60A1 sand) were removed; those tanks wear the US desert service coat
again, and their baseline rows are back to production byte for byte. The three patterned Signatures stay.

The Signatures (first seven, now three) are appended after every earlier camo id (no serialized index moves) with en-US and zh-CN labels.
`camoProductionBaseline.json` and `camoCatalogProductionIndices.selftest.mjs` are re-pinned for exactly those tanks'
stock and Factory rows and the Factory / Signature selections the baseline resolves on the `m1a1_abrams_hc` reference
hull. `m60FamilyAttachments.selftest.mjs` describes the A3's open-fender fit. Under the owner's 2026-10-21 ruling none of
these receipts was run on this branch; `tools/gen-authored-paint-catalog.mjs --check` confirms the generated paint
catalog is unchanged.
