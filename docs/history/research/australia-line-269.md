# Australia line (269): batch record

Owner 2026-11-02: "lets make a new session to flesh out south african and australian tank trees", then "no senntinnel
please" (the Sentinel AC1, AC3 and AC4 are out); on the two Abrams, "both the australian variatns nneed a lot of ghillie
on them and on their barrels" and "in this case even drape ghillie acrross the top of mantlet and cheeks". Main's ruling
the same day: ~/cot-lanes/sa-aus-trees-269-evidence/PROPOSAL.md approved with conditions (the Australian Abrams' tells
real: the AIM SA's Australian stowage and three-tone, the SEPv3's Trophy mounts with no Trophy and its CROWS-LP; tiers by
capability score and same-tier duels before READY; South Africa and Australia land as two heads, this one on its own
branch, item/aus-tree-269). Research: ~/cot-lanes/sa-aus-trees-269-evidence/RESEARCH.md; photographs and sources per
vehicle in refs/aus/NOTES.md and manifest.tsv beside it (97 images, reference only, never shipped).

| id | name | tier | route | packet |
|---|---|---|---|---|
| leopard_as1 | Leopard AS1 | I (root) | the 'as1' mark of the Danish welded-turret build, `profiles/leopard1Dk.ts` (the 1A3 turret on the 1A5 hull) | [leopard_as1.md](../../references/tanks/leopard_as1.md) |
| centurion5_1_aus | Centurion Mk 5/1 | II (moved from the UK tree's special lane) | unchanged (262) | [centurion5_1_aus.md](../../references/tanks/centurion5_1_aus.md) |
| m1a1_aim_sa_aus | M1A1 AIM SA | VIII | the fleet's plain M1A1 with the Australian kit, `profiles/abramsAus.ts` | [m1a1_aim_sa_aus.md](../../references/tanks/m1a1_aim_sa_aus.md) |
| m1a2_sepv3_aus | M1A2 SEPv3 (Aus) | IX | the SEPv3 source study with the 'mounts' Trophy fit, `profiles/abramsSourceX.ts` and `abramsSourceXSepv3Kit.ts` | [m1a2_sepv3_aus.md](../../references/tanks/m1a2_sepv3_aus.md) |
| m113a1_fsv | M113A1 FSV | I | the new M113 builder, `profiles/m113.ts` ('fsv': the Saladin turret) | [m113a1_fsv.md](../../references/tanks/m113a1_fsv.md) |
| m113a1_mrv | M113A1 MRV | I | `profiles/m113.ts` ('mrv': the Scorpion turret, buoyancy pods) | [m113a1_mrv.md](../../references/tanks/m113a1_mrv.md) |
| m113as4 | M113AS4 | II (with the Ares APC) | `profiles/m113.ts` ('as4': stretched, six road wheels, the Tenix turret) | [m113as4.md](../../references/tanks/m113as4.md) |
| redback | AS21 Redback | VI | a new photo-class build, `profiles/redback.ts`, not on the K21 | [redback.md](../../references/tanks/redback.md) |

The tree (`src/techTree/nations/australia.ts`): one root, the Leopard AS1, and three lines from it: "Leopard and Abrams"
(leopard_as1 I, m1a1_aim_sa_aus VIII, m1a2_sepv3_aus IX), "Centurion" (centurion5_1_aus II) and "M113 and Redback"
(m113a1_fsv I, m113a1_mrv I, m113as4 II, redback VI; 2026-11-03: the M113s' TOW, the AS4 to III by Main's ruling on its TOW-2A duels). The UK tree's nations drop Australia; the tech-tree pin is re-cut
(`5dd32509a8806d96`, `src/techTree/techTree.selftest.mjs`). The tiers are provisional: a new id's fitted combat envelope
comes from the regen (`combatAnatomyGroups/<group>.generated.ts`), so the same-tier duels are only valid after it (on its
raw cloned envelope the AIM SA lost 12-0 to the m1a1). The AS4 already moved from I to II beside the Ares APC on its
capability score (0.205 against the Ares's 0.208).

Tiers (2026-11-03, after the regen's combat anatomy; `runBalanceSeries` at 120 m against the tier's MBTs, strength the
mean score, with the fleet's own baselines re-run beside them): the Leopard AS1 0.18 at I (the Danish 1A3 DK 0.11 and 1A5 DK
0.16 there; the AS1 against the 1A3 DK 0.54); the FSV and MRV 0.05 at I (the M41A3 0.007); the AS4 0 at II (the Ares APC
0.021); the AIM SA 0.24 at VIII (the M1A1 0.26); the SEPv3 0.34 at IX (0.16 at X, where the US SEPv3 holds 0.26); the
Redback 0.14 at VI (0 at V, 0.08 at VII). The Puma S1 it was cloned from holds 0.48 at VI on draws: its MBTs deal it
1,000-1,500 in a 90 s series against the Redback's 2,700 in 40 s, so the Redback keeps its own gun (on the Puma's final
gun it fell to 0.01) and fires its Spike LR2 from its own launcher (`fleetLauncherMuzzles.ts`; the clone had the
Puma's mouths). Every tier stands as drawn.

Out: the Sentinel AC1, AC3 and AC4 (the owner); the wheeled ASLAV and Boxer CRV (Main: the sim has no wheeled drivetrain);
the Matilda II and its Frog, the M3 Lee/Grant, the M3 Stuart, the Churchill trials batch and the Yeramba (Main: the Denmark
M24 ruling, stock with no national kit); the M1150 ABV and M1074 JAB (non-combat).

Decisions recorded in the packets: the Redback is its own photo-class build (seven road wheels to the K21's six, a
different hull and turret) and comes out 8.37 m long against Hanwha's 8.8 m, because the 2021 live-fire profile puts the
30 mm muzzle 0.8 m inside the nose; NOTES.md section 7's six road wheels is wrong (every photograph shows seven). The AIM SA
rides the plain M1A1, not the fleet's `m1a1_abrams_sa` or `m1a1_abrams_aim` (ARAT, CROWS, their own nets). Australia fires
no depleted uranium: both Abrams carry the tungsten KEW-A2. The line's coats: `paint_leopard_as1` "RAAC Blotch Desert"
appended (the AS1, the AS4, both Abrams, the Redback); the FSV and MRV share the Mk 5/1's `paint_centurion5_1_aus` "RAAC
Plain Olive Drab"; the Army's black kangaroo (`au-army-kangaroo`, `vehicleMarkings.ts`) replaces the RAAF roundel that
had stood in. Gun depression is measured on each build (`tools/gun-depression-sweep.mjs --no-suit`), six of the seven so
far.

The shared builders: `profiles/leopard1Dk.ts` gained the 'as1' mark purely additively (an unknown mark throws); the seven
Danish ids it marks PASS `tools/fleet-geometry-ledger.mjs --check`, byte-identical, before and after (evidence:
denmark7-before.log, denmark7-after-r1.log). `profiles/abramsSourceX.ts` and `abramsSourceXSepv3Kit.ts` gained the
Australian id and the 'mounts' fit: the five source-X studies PASS before (abramsx5-before.log), and nine Abrams ids (the
five, m1a1, m1a1ha, m1a1_abrams_aim, ua_m1a1) after (abramsx9-after-r1.log). `ghillieFleetSuits.ts` gained the heavier
Australian density, the dry-bush palette and the gun-owner net for the two Abrams rows.

Open: the changed-only regen of the seven ids and their combat anatomy; then the same-tier duels and the final tiers; blind
photo critics per id (each Abrams against its US donor for the tells); the Redback's gun-depression curve;
`tank:release:check --gate --lane`, `test:lane` and `test:recommend`; the nation picker and tree captures at desktop and
phone width. Unresolved in the sources (**[?]** in the packets): the AS1's loader's-side roof box, its scalloped skirts
and the RAL 6014 coat; the AIM SA's Barracuda kits and its TMAPU's stack; the SEPv3's Trophy brackets; the MRV's front
pod; the Redback's published height and length.
