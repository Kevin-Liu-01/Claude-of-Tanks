# Roster naming pass — 2026-09-15

Owner rulings (2026-09-15): the X source studies are the better models, so they carry the
canonical public names and lead their nation's garage; the older hulls that shared a name
move to a distinct (older or export) mark; no vehicle keeps an "X" suffix and no two
vehicles share a public name. Two studies are retired, four T-90 studies become tier X, the
Puma is tier IX and the Marder tier VIII. The Ukrainian Abrams study becomes the
"M1A2 Abrams UA" (its field kit is a separate geometry slice).

Names live in three layers — the spec `name`, `FIRST_PARTY_DISPLAY_NAMES` and the
`LABEL_OVERRIDES` record in `src/vehicles/tankLabels.ts` — and `finalizeFirstPartyRoster`
resolves them in that order. Every layer that mentioned a renamed id was moved together, so
the spec, its label and its search aliases agree. `modern1.ts` / `modern2.ts` specs reach
the runtime through the generated facades: run `node tools/gen-legacy-fleet-specs.mjs` after
editing them (the fleetLazy receipt reports the facade as stale otherwise).

## USA (owner list)

| id | was | now |
| --- | --- | --- |
| `m1a2` | M1A2 Abrams | M1A1 Abrams HC |
| `m1a2_sepv2` | M1A2 Abrams SEPv2 | M1A1 Abrams AIM |
| `m1a2_sepv3` | M1A2 Abrams SEPv3 | M1A1 Abrams FEP |
| `m1a2_tusk` | M1A2 Abrams TUSK | M1A1 Abrams SA |
| `m1a2_x` | M1A2 Abrams X | M1A2 Abrams |
| `m1a2_tusk_x` | M1A2 Abrams TUSK X | M1A2 Abrams TUSK |
| `m1a2_sepv2_x` | M1A2 Abrams SEPv2 X | M1A2 Abrams SEPv2 |
| `m1a2_sepv3_x` | M1A2 Abrams SEPv3 X | M1A2 Abrams SEPv3 |
| `m1a1_x`, `m1a1ha_x` | M1A1 Abrams X, M1A1 Abrams HA X | retired (specs, manifest, ledgers, icons, receipts) |

Garage left edge (USA): M1A3 Abrams, M1A2 Abrams TUSK, M1A2 Abrams SEPv3, M551A1 TTS,
M3A3 Bradley, then the rest by descending tier and name
(`GARAGE_LEADING_VEHICLE_IDS_BY_NATION.USA`).

## Germany (owner list)

| id | was | now |
| --- | --- | --- |
| `leo2a4` | Leopard 2A4 | Leopard 2A2 |
| `leo2a4_otco` | Leopard 2A4 OTCO | Leopard 2A3 |
| `leo2a4m` | Leopard 2A4M | **Leopard 2A4M CAN** (see below) |
| `leo2a4m_x` | Leopard 2A4M X | Leopard 2A5M |
| `leo2a6` | Leopard 2A6 | Leopard 2A4 |
| `leo2a6m` | Leopard 2A6M | Leopard 2A4 OTCO |
| `leo2a5` | Leopard 2A5 | Leopard 2A4 V |
| `leo2a5_a5nl` | Leopard 2A5/A5NL | Leopard 2A4M |
| `leo2a7v` | Leopard 2A7V | Leopard 2 Improved |
| `kf51b` | KF51B Panther | KF51-U |
| `kf51` | KF51 Panther | KF51 EVO |
| `kf51_x` | KF51 Panther X | KF51 Panther |
| `leo2a7v_x`, `leo2a6m_x`, `leo2a5_x`, `leo2a6_x`, `jpz_e100_x` | … X | Leopard 2A7V, 2A6M, 2A5, 2A6, Jagdpanzer E100 |
| `jpz_e100` (dev) | Jagdpanzer E100 | Jagdpanzer E100 Prototype |
| `spz_puma` | tier VIII | tier IX |
| `marder1a3` | tier VII | tier VIII |

**Collision the ruling did not resolve:** the list named both the old 2A4M and the old 2A6M
"Leopard 2A4 OTCO". The 2A6M keeps that name (its 2A6 → 2A4 pairing) and the old 2A4M is
"Leopard 2A4M CAN" — the Canadian designation its bolt-on kit resembles. One word from the
owner swaps it.

Garage left edge (Germany): KF51 Panther, Leopard 2A7V, Leopard 2A6M, KF51-U, KF51 EVO,
Leopard 2 Improved, Leopard 2 Revolution, MBT-70, Puma S1; tier IX opens with Leopard 2A5M,
2A5, 2A6.

## Russia and USSR/Russia

The four T-90 studies are tier X and open the Russian fleet (T-90M, T-90SM, T-90A Vladimir,
T-90A, then T-14 Armata). `sourceXFleet.selftest` records the ruling in
`OWNER_TIER_RULINGS`; every other study still may not out-tier its donor.

| id | was | now |
| --- | --- | --- |
| `t90a_x`, `t90a_vladimir_x`, `t90m_x`, `t90sm_x` | … X, tier IX | T-90A, T-90A Vladimir, T-90M, T-90SM — tier X |
| `t14_x` | T-14 Armata X | T-14 Armata |
| `t14` | T-14 Armata | Object 148 Proto |
| `t90a` | T-90A | T-90A obr. 2004 |
| `t90a_vladimir` | T-90A Vladimir | T-90A obr. 2006 |
| `t90m` | T-90M | T-90AM |
| `t90sm` | T-90SM | T-90SM obr. 2013 |
| `t72b3m` | T-72B3M obr. 2022 | T-72B3M obr. 2016 |
| `t72b3` (dev) | T-72B3 | T-72B3 obr. 2011 |
| `t90` | T-90 | T-90 obr. 1992 |
| `t90a_burlak` | T-90A Burlak | T-90A Burlak Proto |
| `t90ms` | T-90MS Tagil | T-90MS obr. 2011 |
| `t80u` | T-80U | T-80UK |
| `t72bu` | T-72BU | T-72BU obr. 1989 |
| `t72b_1987` (dev) | T-72B obr. 1987 | T-72B obr. 1985 |
| `t72b3m_x`, `t72b3_x`, `t90_x`, `t90a_burlak_x`, `t90ms_x`, `t80u_x`, `t72bu_x`, `t72b_1987_x`, `t62mv1_x` | … X | the plain names |

The "obr. YYYY" (model-year) form follows the roster's existing Soviet naming
(`T-62 obr. 1975`, `T-72B obr. 1987`); the years are the real acceptance or trials years of
the marks the older hulls now stand for. These are placeholders the owner may rename.

## Other nations (X studies take the canonical name; the older hull moves)

| nation | X study | older hull |
| --- | --- | --- |
| Ukraine | `ua_m1a1_x` → **M1A2 Abrams UA** | `ua_m1a1` → M1A1 SA (Ukraine) |
| Sweden | `strv122_x` → Stridsvagn 122 | `strv122` → Stridsvagn 122A |
| France | `leclerc_x` → Leclerc SXXI, `leclerc_classic_x` → Leclerc S1, `amx40_x` → AMX-40, `amx30_x` → AMX-30B | `amx40` → AMX-40 Prototype, `amx30` → AMX-30 (Leclerc S2 and XLR unchanged) |
| UK | `challenger_3x` → Challenger 3, `challenger1_x` → Challenger 1 Mk 3, `chieftain_mk10_x` → Chieftain Mk 10, `chieftain5_x` → Chieftain Mk 5 | `challenger_3` → Challenger 3 Prototype, `challenger1` → Challenger 1 Mk 2, `chieftain_mk10` → Chieftain Mk 9, `chieftain5` → Chieftain Mk 3 |
| Israel | `merkava4_x` → Merkava Mk 4, `merkava3d_x` → Merkava Mk 3D | `merkava3d` → Merkava Mk 3 Baz |
| Japan | `type10_x` → Type 10, `type90_x` → Type 90 | `type10` → Type 10 (TK-X); `type90` keeps Type 90 (Kyū-maru) |
| Italy | `ariete_c1_x` → C1 Ariete | `ariete_c1` → C1 Ariete (Serie 1) |
| South Korea | `k2_x` → K2 Black Panther (short K2), `k1a1_x` → K1A1 | `k2` → XK2 Black Panther, `k1a1` → K1E1 |

Every nation with studies received a garage leading run so the studies open their tier
(`garageOrder.ts`; the receipt checks the runs for USA, Japan, Sweden, Germany, China,
Russia, USSR/Russia, UK and France).

## Retirement of `m1a1_x` and `m1a1ha_x`

Removed from `abramsSourceXSpecs.ts`, `fleetManifest.ts`, `fleetOrder.ts`, `tier.ts`,
`taxonomy.ts`, `vehicleMarkings.ts`, `internalLayoutRegistry.ts`, `decorations.ts`, the
Abrams X profile configuration, the generated fill / anatomy / marking-seat / presentation
anchor groups, the sealed-hull ledger, the icon manifest and icon files, and the receipts and
tools that listed them. Saved records 210 → 208, production 171 → 169, battle-playable
181 → 179 (`src/productStats.ts`, `docs/VEHICLE-ROSTER.md`).

## Verification

`npm run typecheck`; receipts abramsSourceXSpecs, sourceXFleet, sourceXSecondWave,
sourceXSecondWaveMarkings, sourceXEra, sourceXSecondWaveEra, sourceXMarkings, garageOrder,
fleetOrder, fleetBalance, fleetLazy, tankAssets, taxonomy, tier, camoPolicy (contract hash
repinned for the Challenger 3 signature label), productStats, battleEraReceipt,
technical-framing; `.qa-dev/garage-order-dump.mjs` (untracked) prints the resulting garage
order per nation and confirms no X suffix and no duplicate public name remain; then the
regen chain and the release check in the main worktree for the retired ids.

## Receipts repinned by the pass (release check, 2026-09-15 evening)

Twelve pre-group receipts pinned the retired ids, the old public names or per-id counts and
were updated to the owner-directed state — no unrelated assertion was relaxed:
`abramsSourceXMuzzle` (30 poses), `abramsSourceXRecovery` / `ShoulderClosure` /
`TrackGuide` / `UserSurfaces` (10 high/low builds), `ammunitionFlow` (5 Abrams studies, 15
channels, 28 additive X ids; the Type 100's three channels are listed as a later addition
beside the 535-channel census, total 622), `sourceXSecondWaveMarkings` (the Type 100 anchor
is a later addition beside the 151 immutable records), `jagdpanzerE100XArmor` (donor hash:
display names only — AMX-30B → AMX-30, AMX-40 → AMX-40 Prototype, C1 Ariete → Serie 1,
Challenger 1 Mk 3 → Mk 2 …; the HEAD-vs-working diff of the 22 donor rows was checked to be
names and aliases only), `chieftain10XMk5Foundation` (spec hash: "Chieftain Mk 5" without
the X), `sovietChevronEraFleet` (the retained hull is the T-90AM), `leopardA5NL` (the hull
carries the 2A4M name). `eraGameplayRegistration` failed for a real reason — the UA kit's
cassette courses are visible reactive packages without gameplay zones — and was fixed by
giving the M1A2 Abrams UA eight depletable ERA banks
(`src/vehicles/abramsSourceXUkraineEraArmor.ts`; see the kit note).

