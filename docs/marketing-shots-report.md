# Marketing-Shot Set — Grading Report

The newer 30+30 close-action and foreground campaign is documented in
[MARKETING-BATTLE-CAMPAIGN.md](MARKETING-BATTLE-CAMPAIGN.md). This report remains
the grading record for the original 30-frame set.

30 in-engine action screenshots of the sourced modern fleet (Leclerc, T-90M/T-90A,
Leopard 2A5/2A6/2A7V, M1A2 SEPv3/SEPv2, Challenger 1 Mk.3, AbramsX, KF51 Panther)
shot through the Scene Studio (`docs/STUDIO.md`) at 3840x2160.

- Scene sources (checked in, reproducible): `tools/marketing-shots/scenes/*.json`
- Drivers: `tools/marketing-shots/{gen-scenes,shoot,contact,encode-featured,verify-integrations}.mjs`
- Raw set: `shots/marketing/raw/` · Hero set (top 10): `shots/marketing/final/`
- Shipped: splash backdrop + garage panel (`public/media/featured/f1..f5*.webp`),
  OpenGraph card `public/brand/og-image.png` (1200x630)

Every shot was graded 1-10 on five axes; **overall = mean**. Everything scoring
< 7.0 was re-staged / re-shot until the set met the bar (final pass: **average
7.62, minimum 7.0, none < 6.5**). 16 re-captures across 12 scenes were needed;
the per-shot verdicts below are for the FINAL frames.

| # | shot | map | comp | energy | read | fidelity | punch | **overall** | verdict |
|---|------|-----|------|--------|------|----------|-------|-------------|---------|
| 01 | desert_duel_leclerc_kill | desert | 8.0 | 8.5 | 8.0 | 7.5 | 8.5 | **8.1** | Leclerc muzzle star fg-right, T-90A ammo-rack fire at the palm line — the eye rides the tracer. 2 restages (terrain kept eating the victim). |
| 02 | desert_ram_abramsx_t90m | desert | 7.5 | 7.0 | 8.0 | 7.0 | 7.5 | **7.4** | Nose-to-flank contact at the adobe crossing; detrack debris slightly confetti-ish at 4K. |
| 03 | desert_overwatch_line | desert | 7.5 | 7.5 | 7.5 | 7.5 | 7.5 | **7.5** | Two-tank foreground line firing over the compounds, mesa amphitheater behind. |
| 04 | desert_village_brawl | desert | 8.0 | 8.5 | 7.5 | 7.5 | 8.5 | **8.0** | KF51 fg with ricochet sparks, twin tracers overhead, T-90A muzzle flash at the walls. |
| 05 | desert_aftermath_sunline | desert | 7.5 | 6.0 | 7.0 | 7.5 | 7.0 | **7.0** | Survivor M1A2 pushing past two smoking hulks; the quiet frame of the set. 3 restages. |
| 06 | desert_hero_kf51 | desert | 8.0 | 8.5 | 8.5 | 7.5 | 8.5 | **8.2** | KF51 low 3/4 composed firing still — flash core in frame, adobe + mesa backdrop. |
| 07 | desert_drone_mesa_duel | desert | 7.0 | 7.5 | 7.5 | 7.5 | 7.0 | **7.3** | Drone over the crossroads kill, inbound tracer visible; churned track-mark ground reads battle-worn. |
| 08 | desert_dune_charge | desert | 7.0 | 7.5 | 7.0 | 6.5 | 7.5 | **7.1** | Lead M1A2 firing on the move toward camera, sabot petals overhead; bleached fg grass is the weak point. |
| 09 | winter_lake_duel | winter | 8.5 | 9.5 | 8.5 | 7.5 | 9.0 | **8.6** | **Set hero.** T-90M mid-ammo-rack: turret sailing through the fireball, glow on the ice. |
| 10 | winter_ram_leo2a6 | winter | 7.5 | 7.5 | 8.5 | 8.0 | 7.5 | **7.8** | Hull-displacing T-bone, thrown-track debris mid-air; clinical light but the contact is undeniable. |
| 11 | winter_overwatch_birch | winter | 7.5 | 7.0 | 7.5 | 8.0 | 7.0 | **7.4** | Whitewash pair advancing up the farm road under fire; the lucky-find composition of the set. |
| 12 | winter_village_brawl | winter | 8.0 | 7.5 | 7.0 | 7.5 | 7.5 | **7.5** | Dead-center road POV, HE burst mid-street, KF51 + Leclerc trading fire across it. |
| 13 | winter_aftermath_burnout | winter | 7.0 | 6.0 | 8.0 | 8.0 | 6.5 | **7.1** | Charred AbramsX on the ice, 2A5 silhouette beyond the column. Sober, readable. |
| 14 | winter_hero_t90m | winter | 7.5 | 6.0 | 9.0 | 8.5 | 7.0 | **7.6** | Factory-green T-90M pops off the snow (whitewash-on-white failed; contrast swap fixed it). |
| 15 | winter_drone_lake_battle | winter | 8.0 | 7.5 | 7.5 | 7.5 | 8.0 | **7.7** | Dark-ice map-poster drone: kill column left, Challenger muzzle flash below. |
| 16 | winter_flank_chase | winter | 7.0 | 7.0 | 7.5 | 8.0 | 6.5 | **7.2** | Hunter firing on the move, prey running with turret rearward; reads chase, subjects a touch small. |
| 17 | urban_street_duel | urban | 8.0 | 7.5 | 8.5 | 8.0 | 8.0 | **8.0** | Urban-digital M1A2 firing up the cobbled canyon, kill burning at the vanishing point. |
| 18 | urban_ram_plaza | urban | 7.0 | 7.5 | 7.0 | 6.5 | 7.5 | **7.1** | KF51 T-boning the Leclerc through the crossing; spark streaks read dashy at 4K. |
| 19 | urban_overwatch_church | urban | 8.5 | 8.0 | 8.0 | 8.0 | 8.5 | **8.2** | Twin muzzle flashes lighting the golden-hour canyon toward camera — pure WoT key art. |
| 20 | urban_ruin_brawl | urban | 8.0 | 9.0 | 7.5 | 7.5 | 8.5 | **8.1** | Highest energy: crossing tracers, AbramsX 4-petal flash, T-90A firing back from the corner. |
| 21 | urban_aftermath_factory | urban | 7.5 | 7.0 | 7.5 | 8.0 | 7.5 | **7.5** | Two burning hulks blocking the street, ember-peppered char. 2 restages (camera kept clipping walls). |
| 22 | urban_hero_abramsx | urban | 7.5 | 8.0 | 9.0 | 7.5 | 8.0 | **8.0** | AbramsX profile, blast jet raking the cobbles; unmanned turret silhouette crisp. |
| 23 | urban_drone_grid | urban | 7.0 | 7.5 | 8.0 | 8.0 | 7.5 | **7.6** | Kill fireball at the T-junction from above, tracer inbound over the roofs. |
| 24 | verdant_field_duel | verdant | 7.5 | 7.5 | 7.0 | 8.0 | 7.5 | **7.5** | Leopard 2A6 firing through the wheat, Challenger dying at the fence line. |
| 25 | verdant_ram_hedgerow | verdant | 7.5 | 6.5 | 7.5 | 7.5 | 7.0 | **7.2** | Tan-vs-green shoving match at the forest margin; contact energy moderate. |
| 26 | verdant_overwatch_ridge | verdant | 7.0 | 7.5 | 6.5 | 7.5 | 7.0 | **7.1** | Frontal firing line, tracer whipping past camera; Leclerc half-lost behind a bush. |
| 27 | verdant_village_brawl | verdant | 8.0 | 8.0 | 7.5 | 8.0 | 8.5 | **8.0** | KF51 advancing past sandbags as the cottage roof burns — the story frame. |
| 28 | verdant_aftermath_meadow | verdant | 7.5 | 7.0 | 7.5 | 7.5 | 7.5 | **7.4** | Burning turretless Leclerc fg, survivor's muzzle flash beyond — "avenging the fallen". |
| 29 | verdant_hero_challenger1 | verdant | 7.5 | 7.5 | 8.5 | 8.0 | 7.5 | **7.8** | Challenger 1 firing still with frozen sabot petals, lone-tree hills behind. |
| 30 | verdant_drone_flank | verdant | 8.0 | 7.5 | 7.5 | 8.0 | 7.5 | **7.7** | Road-column drone: lead 2A7V firing at the treeline, incoming burst off the verge. |

**Composite average: 7.62** · min 7.0 · max 8.6 · 19/30 at or above 7.5.

## Top 5

1. **09 winter_lake_duel (8.6)** — the ammo-rack turret pop over the ice; nothing else in the set touches its action read.
2. **06 desert_hero_kf51 (8.2)** — the cleanest hero still; flash core, camo, and backdrop all land.
3. **19 urban_overwatch_church (8.2)** — twin flashes down the golden canyon; the most "buy the game" frame.
4. **20 urban_ruin_brawl (8.1)** — crossing tracers, three tanks, highest motion energy.
5. **01 desert_duel_leclerc_kill (8.1)** — hero + mid-ground kill, textbook thirds.

## Bottom 5 (all still ≥ 7.0 after reshoots)

1. **05 desert_aftermath_sunline (7.0)** — aftermath scenes fight the engine: wrecks read low-contrast at distance, and static hulks carry little energy. Took 3 restages to pass.
2. **08 desert_dune_charge (7.1)** — the bleached fg grass tufts cheapen an otherwise punchy frontal charge.
3. **18 urban_ram_plaza (7.1)** — frozen spark sprites read as white dashes at 4K.
4. **26 verdant_overwatch_ridge (7.1)** — one of three shooters is bush-occluded; the tracer past the lens saves it.
5. **13 winter_aftermath_burnout (7.1)** — clean but quiet; 55% of the frame is empty ice.

## Honest systemic notes

- **Terrain is the enemy of blind staging.** Desert dunes/mesas swallowed 5 first-pass
  compositions; everything that finally passed sits on scouted flat (village rects,
  the frozen lake, street grid, spawn-arc flats). The scouted-geometry notes are
  banked in `tools/marketing-shots/gen-scenes.mjs`.
- **Recurring fidelity artifacts** (docked 0.5-1.5 per shot where visible): bleached
  LOD grass tufts near low cameras (desert worst), frozen spark/debris sprites
  reading as floating chips at 4K, ice pressure-ridge slabs reading as planks.
- **Effect-timing recipes that work** (validated): fire at 20-30 ms age,
  `firing_moment` fired AT `fxTime`, tank_kill at 450-650 ms, dust at 250-450 ms,
  burning columns need fxTime ≥ 2500 ms.
- **Camo contrast beats camo realism** in marketing frames: factory green on snow,
  tan on verdant, urban gray vs green digital — every same-tone pairing regraded lower.
