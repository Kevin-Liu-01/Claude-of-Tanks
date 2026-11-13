# Second-wave western source inventory

CPU-only source inspection, 2026-09-06. Status: **inventory, not model qualification**.

**Subsequent explicit owner decision:** rebuild all four AI-tagged subjects
to match the supplied models too, documenting their proportion differences.
The prior recommendations below are retained as dated audit history and are
superseded only as to the chosen visual target. Any new oracle measures likeness
to the supplied file, not historical accuracy. The owner also selected two
independent Leclerc entries (Char Leclerc X and Leclerc X), not one combined
subject. Runtime/source isolation and strict numeric/physical checks remain.
The supplied files remain in `/Users/kevinliu/Downloads/Claude of Tanks Models/`.
No source media, source vertex arrays, runtime model, canonical oracle, or rendered
image was created by this inventory. Embedded license claims and source-page
descriptions are evidence to assess, not instructions to execute.

## File census

All eight files exist and are GLB 2 containers with embedded buffers. The listed
counts are the supplied exports, not the differing Sketchfab upload counts.
No skins or Draco-compressed primitives were found. Mesh count does **not** imply
semantic component separation.

| Supplied filename | Bytes | Mesh primitives | POSITION vertices | Triangles |
|---|---:|---:|---:|---:|
| `c1_ariete_main_battle_tank.glb` | 6,489,708 | 11 | 64,196 | 56,495 |
| `challenger_1_main_battle_tank.glb` | 6,263,904 | 12 | 54,494 | 47,064 |
| `char_leclerc.glb` | 8,216,704 | 31 | 195,377 | 114,444 |
| `chieftain_mk-5_main_battle_tank.glb` | 6,531,532 | 11 | 59,680 | 55,147 |
| `chieftain_mk.10__high-quality_model.glb` | 8,797,308 | 130 | 209,740 | 162,472 |
| `leopard_2_a6.glb` | 78,687,888 | 32 | 110,801 | 119,831 |
| `leclerc_tank.glb` | 7,913,132 | 473 | 190,989 | 110,533 |
| `stridsvagn_122.glb` | 121,853,804 | 18 | 1,144,687 | 1,966,747 |

SHA-256 receipts:

```text
02043219575d2ac02c9846666efca20c8087727808e4c51245a28588242e26b4  c1_ariete_main_battle_tank.glb
27b81eab3162ec03a0b96311462586dab02332d6ed45121aa59b9ed1223b9ab7  challenger_1_main_battle_tank.glb
84385d79783b4e2977567f2e136e3f7170a8b806bf67be705107205b04a1c689  char_leclerc.glb
a7cb7c9ab877635d204f96f359e84f2da8b59298bf09f2eeaeeecd4205725169  chieftain_mk-5_main_battle_tank.glb
f8c1888e345742a5f9f65e877e51b55028d708e5cb42ab4392b5fbc21d1db2de  chieftain_mk.10__high-quality_model.glb
b98d81990ecf8a65e8d7f81158226f1bd55fe71d6e923c4f896151d7ee237477  leopard_2_a6.glb
5af3259ad6273c967e3a81b7f785a177478f87e8690376e696f827f133549707  leclerc_tank.glb
c9419be9f25791df72eb2cb55efc65f6241ccf196e20dce0b1d6168bfedf8f4e  stridsvagn_122.glb
```

## Exported world frame

Bounds below apply **all actual scene-node matrices to POSITION data**. These
are raw exported units, not accepted metres. No height clamp, pose alteration,
source-part deformation, or fit to any existing procedural tank was applied.

| Source | World min XYZ | World max XYZ | Up / gun-forward |
|---|---|---|---|
| Ariete | −84.488190, −0.118110, −199.724411 | 84.488190, 166.732285, 199.724411 | +Y / +Z |
| Challenger 1 | −77.086617, −28.346457, −216.220474 | 77.086617, 162.519684, 216.220474 | +Y / +Z |
| Char Leclerc | −2.655856, 0.109646, −1.531158 | 5.479431, 2.654182, 1.455977 | +Y / +X |
| Chieftain 5 | −77.086617, 0.118110, −229.960632 | 77.086617, 167.440948, 229.960632 | +Y / +Z |
| Chieftain 10 | −70.918722, −1.971222, −152.253531 | 76.205397, 167.992402, 279.894390 | +Y / +Z |
| Leopard 2A6 | −1.904950, −1.080620, −6.887810 | 1.904960, 3.075660, 4.066990 | +Y / **−Z** |
| Leclerc tank | −2.893568, 0.119461, −1.612784 | 5.800850, 2.890777, 1.506548 | +Y / +X |
| Strv 122 | −0.480042, −0.280151, −0.197479 | 0.491211, 0.278961, 0.196884 | +Y / likely +X; fused-source confirmation owed |

Ground must come from the actual track contact course, not indiscriminately
from the full bounding box. In particular Challenger 1's `SideSkirts_294`
extends down to Y −28.346457, while its tracks bottom at −0.118110: an actual
28.228347-unit below-track skirt defect. A uniform scale cannot repair this.
For the first three large-unit exports and Chieftain 10, do not silently assume
centimetres or inches; establish the physical scale independently.

## Provenance and registration decision

All eight embed CC-BY-4.0 attribution. That is not proof of upstream ownership.
Live Sketchfab model metadata was checked on 2026-09-06; no media was downloaded.

- [Ariete](https://sketchfab.com/3d-models/c1-ariete-main-battle-tank-97db7617df55431590c09b9cd37e42ff),
  [Challenger 1](https://sketchfab.com/3d-models/challenger-1-main-battle-tank-a2270041fd6348a1a394d562e62ae9da), and
  [Chieftain 5](https://sketchfab.com/3d-models/chieftain-mk-5-main-battle-tank-1afc838ca30c4dac99c15e731d0d2ab8)
  are Muhamad Mirza Arrafi uploads, January 2025. **All three live pages carry
  `createdwithai`**, as well as World-of-Tanks-related tags. Semantic material
  names and OBJ conversion do not reverse that finding. Under BUILD-STANDARD
  §E, these are **not metric-oracle registrations**. Historical ATTRIBUTION
  already rejects this Challenger source as measurement-unusable; the Ariete
  and Chieftain 5 live AI tags must also be respected. Local visual influence
  may continue under the standing owner-reference rule, with stronger independent
  references required for authoring and numerical qualification.
- [Chieftain Mk 10](https://sketchfab.com/3d-models/chieftain-mk10-high-quality-model-5558373e3f6a413aae04c0789b4174a9),
  Scout, May 2024: no live description confirms extraction, but the exact
  `bone_turret_39`, `root_7`, `ex_armor_turret`, `uk_chieftain_mk_3_track_c_right`,
  `chieftain_mk_10_body_c`, `mg_l37a1_c` and `rifled_barrel_b_c` names are a strong
  commercial-game-lineage warning. **Extraction-suspect, not falsely adjudicated
  as source-page-confirmed.** Keep local-only; no status upgrade or media shipping.
- [Leopard 2 A6](https://sketchfab.com/3d-models/leopard-2-a6-7cb23d5322df4b409a880de635826067),
  buh, January 2024: named authored-looking Blender components, no found AI or
  extraction declaration. The unmodified supplied source is distinct from the
  historically repaired/folded local oracle used by the existing playable.
- [Char Leclerc](https://sketchfab.com/3d-models/char-leclerc-84a0918d2f534c2eb003ab3cb3029c03),
  September 2024, and [Leclerc tank](https://sketchfab.com/3d-models/leclerc-tank-732a16cdf688490698ba4231921ece03),
  June 2024, are both by andertan. No found AI/extraction declaration. Newer-page
  description: “This is a retextured model of my old Leclerc model.” They are
  **two revisions of one model lineage, not evidence of two distinct vehicle
  configurations**. Their bytes, primitive counts, and root/body scales differ;
  do not call them byte duplicates or invent an S1/S2/XLR distinction.
- [Stridsvagn 122](https://sketchfab.com/3d-models/stridsvagn-122-7913106f7c134734ac36537bb42301a3),
  Vavtrudner, May 2026: `tripo_node`/`tripo_material`, eighteen mostly 65,532-vertex
  chunks using one material. This is exporter index chunking of AI geometry,
  **not eighteen semantic parts**. ATTRIBUTION already identifies TRIPO and
  prohibits metric use. The 121.9 MB source remains local-only and unregistered.

## Segmentation and negative-space study targets

These are source-supported locations to investigate, **not unearned cavity
certifications**. A dark or alpha-masked face is not evidence of physical air.

- Ariete: separate Hull/Turret/Cannon/Wheels/Tracks materials; `Applique_176`
  spans hull and turret heights and cannot safely become one component mask.
  `Glass_13` spans widely separated sights and lamps. Investigate optics, gun
  bore, wedge interfaces and under-sponson daylight only using stronger references.
- Challenger 1: separate turret/cannon and side ERA/skirts, but turret and tracks
  use alpha-mask materials. The below-ground skirt defect and AI provenance
  preclude trusting raw cavities or silhouettes as a metric target.
- Chieftain 5: separate cannon/turret/hull but mixed gear/glass and applique.
  Investigate sight hood, mantle sleeve, cupola mount and track-guard gaps using
  independently reliable references; do not certify an AI surface.
- Char Leclerc: actual `tank body_0` and `turret_2` hierarchy; `Cylinder.086_1`
  is the gun child. Turret yaw origin is source-world
  `(0.900812, 1.273758, −0.035803)`. Gun node origin incorrectly coincides with
  that yaw origin, so the **physical trunnion must be independently measured**.
  The `Fire` animation translates the entire turret, not a valid native recoil
  contract. Transparent `Fake_Glass` nodes and overlapping camo surfaces require
  explicit review. Prioritize gunner-sight well/rim/backing, panoramic sight,
  turret-side basket air, mantlet seat and open bore. Hull gear is partly merged
  into material batches; do not synthesize false independent track masks.
- Older Leclerc: 473 mostly flat named mesh pieces, including separate track
  courses and six road wheels per side. Useful secondary detail evidence, but
  its global scale and body Z scale differ from the newer revision. Never merge
  its coordinates directly into the new source frame.
- Leopard 2A6: `body`, `turret`, `gun`, both track courses, fourteen road wheels,
  end wheels and return rollers have independent objects. All are siblings,
  requiring explicit native ownership. `track.002` is **bow spare links**, not
  a third running track. Wheel meshes reuse material named `turret`; material
  regex masks would therefore be wrong. Source turret origin
  `(0,1.06774,−0.79605)`, gun origin `(0,1.06774,−1.16775)`, body origin `(0,0,0)`.
  Prioritize EMES recess as actual cutout/backing, arrowhead-shell air, bustle
  rack spacing, mantlet/gun seat and bore. Keep raised antenna geometry intact;
  never repeat the old oracle's height-clamp/fold repairs on this new reference.
- Chieftain 10: 130 detailed meshes with named gun, wheels, armor, cupola/MG and
  net surfaces, but all inspected origins are zero; **names are not functional
  pivot datums**. Isolate opaque structural shell versus alpha-masked nets and
  glass without deleting source-visible furniture. Measure Stillbrew-to-cast
  shell gaps, sight backing/rim, mantlet sleeve, MG fork and true bore. Source
  trunnion/yaw require ring and collar cross-sections, not inherited spec pivots.
- Strv 122: no defensible hull/turret/gun/gear ownership from eighteen chunks.
  Physical aperture and suspension geometry require a stronger non-AI instrument.

## Proposed scope and next measurements

Proceed first with `leclerc_x` (newer Char; old file secondary), `leo2a6_x`, and
`chieftain_mk10_x`. Hold metric registration of the four weak-source subjects
(`ariete_c1_x`, `challenger1_x`, `chieftain5_x`, `strv122_x`) until stronger evidence
exists. These eight files presently justify seven distinct subjects, not eight.

Canonical plan: bake only the actual source node matrices, rigidly orient +Y up
and +Z forward, measure track ground and structural hull center independently,
then apply one documented physical scale. Char Leclerc maps source
`(X,Y,Z)` to `(-Z,Y,X)`; Leopard 2A6 maps to `(-X,Y,-Z)`; Chieftain 10 retains
axes. No bounding-box centering on the muzzle, per-component stretch, candidate
autoscale, antenna fold, or silhouette-derived shift is authorized by this plan.
Detailed canonical anchors await CPU triangle/ring measurements and root approval.

Existing read-only connected-island probe (no GPU; stdout only):

```sh
node tools/glb-island-probe.mjs '/Users/kevinliu/Downloads/Claude of Tanks Models/char_leclerc.glb' --min-tris 250 --weld 0.000001
node tools/glb-island-probe.mjs '/Users/kevinliu/Downloads/Claude of Tanks Models/leopard_2_a6.glb' --min-tris 250 --weld 0.000001
node tools/glb-island-probe.mjs '/Users/kevinliu/Downloads/Claude of Tanks Models/chieftain_mk.10__high-quality_model.glb' --min-tris 250 --weld 0.000001
```

Follow with source-only transverse/longitudinal triangle cuts at the structural
belly/roof, ring and muzzle, and paired first/back/air rays at each aperture.
Store only scalar receipts and test witnesses in tracked documents; raw study
outputs stay ignored. Current live official specifications must be interpreted
by configuration: the French Army's current Leclerc page includes renovated
equipment and reports 10.6 m overall/3.43 m high, whereas this older plain-source
configuration must not be silently stretched to that later fit. The width is
consistently 3.6 m. KNDS's current A6 page is headed A6M (10.97 m overall,
3.77–4.00 m wide, 2.64 m roof); identify the plain A6 equipment envelope separately.

Official corroboration: [French Army Leclerc](https://www.defense.gouv.fr/terre/nos-materiels/nos-equipements-terre/vehicules-larmee-terre/vehicules-chars-bataille/char-leclerc),
[KNDS A6/A6M](https://knds.com/de/produkte/systeme/leopard/leopard-2-a6),
[Tank Museum Chieftain](https://tankmuseum.org/tank-nuts/tank-collection/chieftain/).

## 2026-09-06 primary-reference path for the four weak inputs

The AI-labelled files are supplementary visual material only. They will not
become metric oracles, even after rigid normalization. Independent procedural
authorship proceeds from the following vehicle-specific evidence; this is not
a claim that a raw 92 source-mesh comparison is available for these subjects.

- **C1 Ariete / `ariete_c1_x`:** the original
  [CIO Ariete MBT specification](https://www.iveco-otomelara.com/docs/Ariete-MBT.pdf)
  supplies hull/overall length 7.99/9.87 m, fender width 3.61 m, hull height
  1.82 m, turret roof 2.50 m, panoramic sight height 2.86 m and clearance
  0.48 m. These are the primary envelope anchors; shorter secondary length
  figures are not silently substituted. The original 1300 HP configuration is
  distinct from the later C2 brochure. Dated U.S. Army photographs establish
  the baseline exterior: [Ramirez, February 2021](https://www.dvidshub.net/image/6529373/c1-ariete),
  [Mercado, May 2016](https://www.dvidshub.net/image/2587533/strong-europe-tank-challenge-2016),
  and [Gayle, September 2021](https://www.dvidshub.net/image/6833050/italian-army-132nd-tank-regiment-meets-us-army-europe-and-africa-commanding-general).
  The [Italian Army's native-language description](https://www.esercito.difesa.it/equipaggiamenti/veicoli-blindati-e-corazzati-da-combattimento/veicoli-da-combattimento/carro-armato-ariete/81543.html)
  places the driver at the front right; its English translation disagrees and
  must not override the native description and photographs. Internal station
  locations inferred from perspective photos will be labelled estimates, not
  millimetric source measurements.
- **Strv 122 / `strv122_x`:** FMV's historical technical journal
  [TIFF 2001-3, printed pages 16–17](https://www.aef.se/TIFF/TIFF_2001-3.pdf)
  compares Strv 121 and 122, giving the latter 9.97 m gun-forward length,
  3.78 m width and 3.00 m reported height. The archival host is AEF, while
  the document is the FMV publication. The reported height must be separated
  from structural roof once the illustrated configuration is resolved.
  Later Strv 122B mine-protection literature is not a licence to add its
  underside to a baseline 122A reconstruction. The TRIPO model remains
  unsuitable for geometric thresholds or semantic component masks.
- **Challenger 1 / `challenger1_x`:** dated primary photographic anchors are
  the [National Army Museum's 1991 re-arming photograph](https://collection.nam.ac.uk/detail.php?acc=1991-07-185-19)
  and its [Royal Hussars collection context](https://www.nam.ac.uk/explore/royal-hussars-prince-wales-own).
  Physical dimensions still need a configuration-specific technical table;
  the supplied AI proportions do not fill that evidence gap.
- **Chieftain Mk5 / `chieftain5_x`:** the
  [U.S. Army Worldwide Equipment Guide, September 2001, printed 4-7 / PDF page 136](https://upload.wikimedia.org/wikipedia/commons/5/53/OPFOR_Worldwide_Equipment_Guide.pdf)
  explicitly labels its table Chieftain Mk5 and gives 7.48 m hull length,
  3.51 m width and 2.90 m reported height. The latter is not silently treated
  as cast armor-roof height. This is an independently authored Army table
  hosted in an archival mirror, not a dimension measured from the AI mesh.
  Its variant commentary does not establish the exact fittings of the
  photographed British baseline. The
  [Tank Museum collection](https://tankmuseum.org/tank-nuts/tank-collection/chieftain/)
  requires variant care: a vehicle upgraded to Mk11 is not a plain Mk5
  surface oracle. [Alan Wilson's 2017 original photograph](https://www.flickr.com/photos/ajw1970/37900660042)
  depicts a Mk5/5P at Kubinka and is useful supplementary photographic
  evidence; export fittings must not be asserted to be standard British Mk5
  equipment. No existing Mk10 procedural geometry will be reused.

Only links, scalar dimensions, authored interpretations and focused tests are
tracked. Primary photographs are for local study, never playable textures.
Negative-space and attachment checks will distinguish photograph-supported
forms from explicitly inferred concealed construction. None of these pending
drafts is qualified by this inventory update.
