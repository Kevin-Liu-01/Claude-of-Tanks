# Israeli fleet intake — 2026-09-18

This is the batch contract and evolving qualification receipt for three
requested, independent first-party procedural vehicles. It records the private
GLB inventory, intended gameplay interpretation, registered comparison frames
and current worktree evidence; only Kevin B. Liu-authored procedural geometry
is eligible to ship.

## Current status

- Updated: 2026-09-18.
- IDs: `merkava4_barak`, `merkava4_trophy`, `namer_ifv`.
- Implementation status: **COMPLETE IN WORKTREE**.
- Qualification status: **IN PROGRESS** — registered geometry, standard,
  turret-parent, winding, neutral fidelity, independent visual review and live
  Gallery interaction pass for all three; generated-artifact and composed
  release checks remain.
- Publication status: owner authorized ordinary commits and pushes after the
  complete release tail; publication is sequenced after the parallel fleet round.
- Documentation baseline: detached worktree at
  `12b5dc936b7cfcb78c79fd1f54c3b33c6c971a61`.
- Current next action: finish the shared capture queue, verify the actual
  Gallery, regenerate targeted anatomy/assets on the integrated tree, run the
  composed release tail, fetch/rebase current main and publish exact commits.

## Source manifest and packet routing

| ID | Private source path | Bytes | SHA-256 | Supplied inventory summary | Packet |
| --- | --- | ---: | --- | --- | --- |
| `merkava4_barak` | `/Users/kevinliu/Downloads/Claude of Tanks Models/merkava_mk.4m_barak_armored_warfare.glb` | 19,413,236 | `81cc2cf027af4475c5890089067dd9b1f77d9fbd306939e24f973ad68e099aa5` | 36 nodes, 34 meshes, 108,945 triangles; flattened, without semantic component ownership; reported bounds size 3.7578 × 6.9035 × 8.9200 | [Barak packet](../references/tanks/merkava4_barak.md) |
| `merkava4_trophy` | `/Users/kevinliu/Downloads/Claude of Tanks Models/merkava_mark_iv.glb` | 6,459,324 | `645a9df8bb4dc6a31b94be61b4d2f04a72c0cc9f5c2852e607a878e5f3adc25a` | 323 nodes, 160 meshes, 27,883 triangles; semantic Trophy-equipped hierarchy; reported bounds size 8.7414 × 4.5913 × 4.2867 | [Trophy packet](../references/tanks/merkava4_trophy.md) |
| `namer_ifv` | `/Users/kevinliu/Downloads/Claude of Tanks Models/namer_ifv.glb` | 7,048,964 | `5b0680e74233959eb939b9ba9866c019b41a31466ab0490fd42627d9f4e118b1` | 139 nodes, 68 meshes, 17,681 triangles; semantic turret/Trophy/weapon hierarchy; reported bounds size 7.8827 × 3.3838 × 3.7716 | [Namer packet](../references/tanks/namer_ifv.md) |

These intake inventory facts came from the owner request. The implementation
round subsequently prepared ignored geometry-only oracles, registered proper
source-world transforms and scored whole fused silhouettes. No source mesh,
texture, runtime loader or claimed source component ownership ships.

## Provenance and use boundary

| ID | Supplied title and author | Source page | Reported license metadata | Project decision |
| --- | --- | --- | --- | --- |
| `merkava4_barak` | “Merkava Mk.4M Barak (Armored Warfare)” — KojfDiscord | [Sketchfab](https://sketchfab.com/3d-models/merkava-mk4m-barak-armored-warfare-07e3570bdfaa451d8fb16bdd2e7d88fe) | CC-BY-4.0 string | The title's “Armored Warfare” qualifier creates a possible commercial-game/extracted-asset provenance conflict. Treat it only as a private comparison input; do not rely on its metadata as redistribution authority. |
| `merkava4_trophy` | “Merkava Mark IV” — 42manako | [Sketchfab](https://sketchfab.com/3d-models/merkava-mark-iv-550de2a91e3f4017aeaae3b695db0aab) | CC-BY-NC-4.0 | Private comparison input only. |
| `namer_ifv` | “Namer IFV” — 42manako | [Sketchfab](https://sketchfab.com/3d-models/namer-ifv-d71840dd738f40179b7a9eb9aae9c414) | CC-BY-NC-4.0 | Private comparison input only. |

License strings and visual reliability are separate. The raw GLBs, textures,
converted sources, and source-derived meshes do not ship. Runtime playables
must be Kevin B. Liu-authored procedural geometry, and no runtime path may load
these files.

## Real-configuration authority and naming decisions

Official sources define the intended real configurations; the source titles do
not:

- The IDF calls the new vehicle the **Merkava Mk. 4 Barak** and identifies its
  new elements as AI, updated sensors, VR, a smart mission computer, and the
  Iron View helmet/sensor system: [IDF, “Meet the Merkava Mk. 4 Barak”](https://www.idf.il/en/mini-sites/technology-and-innovation/meet-the-merkava-mk-4-barak/).
- The Israeli Ministry of Defense states that Trophy has been operational in
  the IDF since 2011 and is installed on newly produced Merkava Mark IV tanks
  and Namer APCs: [IMOD, Trophy-equipped Leopard launch](https://www.mod.gov.il/en/press-releases/press-room/historic-ceremony-in-germany-marks-the-launch-of-the-first-leopard-tank-equipped-with-israeli-trophy-active-protection-system).
- IMOD separately identifies the combat debuts of the **Barak tank** and the
  **upgraded Namer APC**; this supports treating those names as distinct
  configuration claims, not interchangeable file labels: [IMOD 2024 work-plan summary](https://www.mod.gov.il/en/press-releases/press-room/israel-ministry-of-defense-holds-annual-work-plans-conference-amid-ongoing-war-efforts).
- The IDF describes the Namer as a Merkava-based APC, approximately 60 tonnes,
  operational since 2008: [IDF technology expo](https://www.idf.il/en/mini-sites/technology-and-innovation/idf-holds-tech-expo/). A SIBAT/IMOD directory describes the baseline APC's remote weapon station as accepting .50-inch, 7.62 mm, or grenade-launcher armament and lists a 1,200 hp powerpack and Merkava Mk.3-like running gear: [Israel Defense Directory 2018–19](https://www.sibat.mod.gov.il/Industries/directory/Documents/Sibatdir-dfs-en-2018-19.pdf).

Target interpretations:

- `merkava4_barak`: real Merkava Mk.4 Barak configuration. The GLB is a
  private whole-shape/detail witness only. Its flattened hierarchy cannot
  establish hull/turret/gun ownership, and “Mk.4M Barak” in its title does not
  override the official configuration name.
- `merkava4_trophy`: a Trophy-equipped Merkava Mk.4 configuration distinct
  from Barak. “Trophy” is a gameplay disambiguator, not a claim that the IDF
  uses “Merkava Mk.4 Trophy” as a formal model designation. Exact service year,
  roof kit, sights, stowage, and APS fit remain to be fixed from dated views.
- `namer_ifv`: the source-depicted weaponized Namer interpretation, planned as
  a 30 mm IFV in gameplay. Official sources commonly call Namer an APC; the
  `namer_ifv` ID describes this selected armed configuration and must not be
  generalized to every Namer. The exact turret, cannon, Trophy fit, and service
  configuration remain unresolved.

## Planned catalog and gameplay envelope

All numbers in this section are owner-provided gameplay balance targets. They
are not claims about classified or real armor, penetration, damage, accuracy,
or rate of fire.

| ID | Tier | Visual policy | Planned balance envelope and rationale |
| --- | ---: | --- | --- |
| `merkava4_trophy` | X | Solid Sinai gray, base `#6f7566` with lighter role `#7b8172`; accessory, cloth, glass, rubber, and weapon-metal roles stay distinct | 2,800–2,900 HP; 1,500 hp / 65 t; 64 km/h forward, 25 km/h reverse; about 40°/s traverse; 6.0 s reload; 0.26 accuracy; 1.45–1.55 s aim. Owner supplied an M338 gameplay penetration triplet of 900/820/740 in the repository's near/mid/far or equivalent penetration ordering. Tier X reflects a current protected MBT baseline. |
| `merkava4_barak` | X | Same solid Sinai-gray policy | Same engine, mass, speed, HP, passive-armor intent, reload, and shell balance as `merkava4_trophy`; 0.24–0.25 accuracy, 1.3–1.4 s aim, and 10–15% lower movement/turret dispersion. Its advantage is sensor/fire-control handling rather than invented armor or ammunition escalation. |
| `namer_ifv` | IX | Same solid Sinai-gray policy | 2,550–2,700 HP; 1,200 hp / 62–64 t; 54 km/h forward, 18–20 km/h reverse; 32–35°/s hull and about 60°/s turret traverse. Planned 30 mm cycle 0.35 s, 180/164/148 gameplay penetration, about 70 damage, 400 rounds, and 75–90 HE damage; no ATGM. Tier IX and the modest autocannon keep it a protected support IFV rather than a Tier-X MBT substitute. |

No armor thickness, hidden equipment performance, module layout, crew layout,
or shell physics is authorized by this table. Those require the normal game
design and anatomy review.

## Resolved registration and retained caveats

- Registered proper source frames are Trophy `[-z,+y,+x]`, scale `1.015337`,
  translation `[-0.0003,-0.006904,+0.6423]`; Barak `[+x,+y,+z]`, scale
  `0.989867`, translation `[-0.0005,+0.000594,+0.2097]`; Namer
  `[-z,+y,+x]`, scale `0.949231`, translation `[0,-0.006455,+0.8343]`.
- Canonical geometry-only oracles are ignored/private and hash-pinned in each
  vehicle packet. All three comparisons remain fused whole-source evidence;
  Barak's flattened source does not support invented component ownership.
- Source textures, material semantics, duplicate geometry, degenerates,
  animation state, track courses, and disconnected/orphan pieces were not
  established by the supplied inventory.
- Barak's source-page licensing may conflict with the “Armored Warfare” title;
  legal redistribution is out of scope because the project will not ship the
  source or derived geometry.
- Trophy is frozen as an older, busier Mk.4 fit with wide side protection and
  prominent APS/roof furniture. Barak is deliberately lower and cleaner, with
  a transverse sensor crown, segmented cheeks, inboard APS, lighter rear
  carrier and two physical antenna whips; the shared family hull stays legible.
- Namer is explicitly the source-depicted 30 mm demonstrator study, not a claim
  about universal service fit. Its rebuilt five-station turret, rear ramp,
  APS/sensors, separate remote station and no-ATGM contract are tested.
- The M338 900/820/740 values are a gameplay penetration triplet, not a
  real-world ammunition claim; implementation must map them to the repository's
  near/mid/far or equivalent penetration ordering without changing their
  meaning.
- Published/source/native dimensions, actual return rollers, 0.064 m track
  stock, chassis closure and exact animated-track clip/sweep are measured.
  High/low cost and browser switching receipts remain in the final tail.

The retained stop rule is unchanged: never invent component ownership for the
flattened Barak file or treat one Merkava source as proof for another variant.

## Batch evidence matrix

Current frozen geometry and neutral boards produce the following evidence. The
remaining IN PROGRESS rows will be updated only from final integrated receipts.

| Gate | `merkava4_barak` | `merkava4_trophy` | `namer_ifv` | Residual |
| --- | --- | --- | --- | --- |
| Source/conversion/frame integrity | PASS | PASS | PASS | Proper uniform registrations; ignored SHA-pinned geometry-only oracles; fused whole-source scoring. |
| Registered silhouette and geometry floors | PASS 90.4 | PASS 90.3 | PASS 90.0 | Dimension scores 100 / 100 / 95; floaters 100 for all. |
| Independent 14-view/native Gallery review | PASS 92.0 | PASS 92.1 | PASS 93.1 | Every neutral-board view ≥90; fresh critic PASS; exact Gallery selection and full-range articulation verified. |
| Closure, physical seating, articulation and gear motion | PASS | PASS | PASS | Continuity holes 0; turret-parent stranded/abutting/dangling 0; exact tracks 0/0 + 0/0. |
| Return rollers, track thickness and chassis closure | PASS | PASS | PASS | Four bilateral return rollers, 0.064 m track stock, seated hull/rear surfaces. |
| High/low cost and tank-switch performance | IN PROGRESS | IN PROGRESS | IN PROGRESS | Census and actual browser switching pending. |
| ERA/APS, armor, modules and crew | PASS | PASS | PASS | APS remains distinct equipment; Namer has 3 hull crew, 8 dismounts, unmanned turret, no missile rack. |
| Anatomy, assets, complete tests, builds and attribution | IN PROGRESS | IN PROGRESS | IN PROGRESS | Targeted generation and composed release tail wait for latest main. |
