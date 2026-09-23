# German Leopard-family oracle record

The three owner-supplied GLBs were used only as external visual and metric
references. The playable tanks are original first-party procedural builds; no
source vertices, indices, topology, textures, materials, rigs, or animations
enter the repository or production bundle.

| Playable | External reference | SHA-256 | License | Source / disposition |
| --- | --- | --- | --- | --- |
| Leopard 2A4 OTCO | `leopard_2a4_otco.glb` | `72cec69a88231a46b5035fcfc608436366763bc08ff0a4a10fc96b4cda78a152` | CC BY 4.0 metadata | [Sketchfab](https://sketchfab.com/3d-models/leopard-2a4-otco-d914bf65a41044db9b24350d0d777d26); description identifies War Thunder extraction, so the file failed first-party provenance and was quarantined as broad visual context only |
| Leopard 2A4M | `leopard_2a4m_main_battle_tank.glb` | `b3911324cf3119e1e7815cad115667a698407fe1921e4bd1e88970d8b2416b53` | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/leopard-2a4m-main-battle-tank-80b589fc9c0b4720888b40d01d6e5153); external visual reference only |
| Leopard 2A6M | `leopard_2a6m_main_battle_tank.glb` | `c10680a8199c1c472fd38f4fbae8a4e1e5f7737f2e5e876116d7c4be86268dd5` | CC BY 4.0 | [Sketchfab](https://sketchfab.com/3d-models/leopard-2a6m-main-battle-tank-5129ec92ef914b3ea98abcee57e40562); external visual reference only |

Variant facts and published dimensions were checked against the [Canadian
Army Leopard 2 family page](https://www.canada.ca/en/army/services/equipment/vehicles/leopard-2a4-tank.html),
the [Canadian Tank Replacement Project record](https://www.canada.ca/en/department-national-defence/corporate/reports-publications/plans-priorities/2016-17/status-report-on-transformational-and-major-crown-projects.html),
and the [Bundeswehr Leopard 2A6M description](https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/landsysteme-bundeswehr/leopard-2).
The sources distinguish the compact L/44 2A4M from the longer L/55 2A6M and
identify mine protection, all-around add-on armor, and slat armor as variant
features. The builds therefore use passive modular armor and supported slat
systems rather than inventing mislabeled explosive bricks.

## Source-semantic identity retained

- **Leopard 2A4 OTCO:** the low rectangular A4 turret and L/44 remain intact,
  with dense field stowage, cloth/net flank treatment, a supported rear rack,
  roof weapon, smoke banks, and asymmetric radio equipment.
- **Leopard 2A4M:** the L/44 A4 core receives compact cheek and side armor,
  mine-belly reinforcement, hull/turret/rear slat cages, Canadian smoke
  cadence, roof weapon, optics, and a closed gun-root plant.
- **Leopard 2A6M:** the wedge turret and L/55 establish the long-gun read;
  mine armor, expanded hull/turret/rear cages, panoramic sight, roof weapon,
  smoke system, and a corrected physically seated muzzle complete the A6M.

Every cage course has visible brackets returning to armor. Turret equipment
is turret-owned and rotates as one assembly, while hull armor, skirts,
suspension, and the single smart track course remain hull-owned.

## First-party geometry receipts

Deterministic geometry hashes reproduced twice: `leo2a4_otco 948e1e00`
(68 meshes / 101,803 vertices), `leo2a4m 401e1c60` (63 / 115,059), and
`leo2a6m 271ad57c` (57 / 170,595). The final evidence packet contains 84
distinct PNGs: 14 fixed critic views at yaw 0 and 14 at yaw 90 for each tank.

Duplicate-course, exact band-and-shoe containment, turret-parenting, winding,
yaw ownership, muzzle-bore, native-playable provenance, asset metadata,
tests, and production build all pass. The final 2A6M explicitly publishes its
hand-authored 5.5125 m local muzzle face so the universal bore annulus seats on
the tube rather than inheriting the donor's detached-ring defect.
