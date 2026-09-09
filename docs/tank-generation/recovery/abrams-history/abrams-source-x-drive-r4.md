# Abrams source X — R4 rear-drive stock checkpoint

## Disposition, 2026-09-07

**Frozen, bounded CPU correction PASS; full-source visual qualification remains pending.** The final FIFO proof ran from **12:56:13.218Z to 12:57:13.489Z**. It passed the new drive test, existing wheel and end-gear tests, all 18 original-vehicle high/low fingerprints, Core/Drive quality (709 functions, zero violations), and full typecheck. The five implementation/test hashes remained identical before and after the proof.

Receipt: `.qa-dev/reports/abrams-drive-final-Mrty0P/receipt.json`, SHA-256 `7daeb507d358bdada6ac94c32744f35b8b724e456cb6f85f9e2057fca36f4315`. Each phase retains its command, time, log and log hash. This is not a complete npm-test, raw-track, 14-view, standard or release pass. R3's track and other failed gates remain historical failures, not retroactively passed by these CPU tests. Fresh R4 images were not yet available at this freeze.

## Source and authored correction

The input is the supplied SEP v2 OBJ, SHA-256 `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`. The canonical GLB remains `public/models/community-candidates/m1a2_sepv2_dc_source.glb`, SHA-256 `7fc3216da131d26e6389c4d40818f70ba03603c99812c5ae42c2f8b798910d16`. Its transform is unchanged: `[-rawX, rawY + .203945, .357965 - rawZ]`, uniform scale 1. Source owner 118 has canonical drive-axis Y/Z `[.863479, -3.14623]`.

`profiles/abramsSourceXDrive.ts` independently authors the asymmetric axial stock: the deep outer cone, four real through-openings with closed walls, eleven-fold scalloped carrier and raised step, distinct inner plate/cone, small four-lobed hub cover and sixteen hex bolts. Sparse measured scalar planes, radii and low-order polar fits define these primitives; no source vertices, indices, topology or source loading enter runtime. Both LODs retain the same stock and genuine apertures.

Principal scalar stations below use **raw source axial X**, not canonical world X. The local axial datum is 1.4254775 m and local +X is outboard.

| Surface | Inner station | Outer station |
| --- | --- | --- |
| Outer cone, outward face | R .180275 / X 1.498920 | R .2389825 / X 1.706690 |
| Outer cone, inward face | R .18225 / X 1.422310 | R .2535595 / X 1.688530 |
| Raised outer carrier | X 1.706690 | X 1.738570 |
| Inboard plate | X 1.106560 | X 1.156030 |
| Hub cover | rear X 1.490020 | intermediate 1.529270 / front 1.536410 |

The four aperture axes are approximately 64.51° + 90°k in source radial coordinates; their conical projected contours are not flat oval recesses. The source's single-skin inboard cone and central plate receive independently constructed, concealed 2 mm closing stock. This is explicitly a construction inference, not proof that the original isolated source skins were watertight. The bilateral source/native center difference leaves a bounded roughly 0.55 mm lateral approximation. Fine inner-collar and carrier-edge forms are not fully qualified.

Source-only FrontSide-clay images were inspected at original resolution before authoring: `.qa-dev/reports/source-drive-r4-face.png` (SHA `7cfc3dbbd68e4f926ca56cfea871a7b688db53613c344fc4740b8494f5b0e3f9`) and `source-drive-r4-quarter.png` (SHA `018a98e0fed92ed29cbc2ed00b80c1a2440f7b1f0f0308f87c160e4e1ccb3383`). Both target `[-1.425, .863479, -3.14623]`; cameras are respectively `[-3.3, .863479, -3.14623]` and `[-3.2, 1.28, -2.6]`. No source resizing or candidate-derived reframing was used.

## Exact implementation scope and preservation

The core adds only the optional `sprocketStockGeometry: {body, dark}` contract. Without it, the original stock-generation and emission path is unchanged. With it, custom stock replaces the old capped body while the existing native engagement teeth retain their exact generator, crown, phase and animation. `abramsSourceXHull.ts` changes only the import and running-gear opt-in for this correction; the wheel helper is unchanged.

Left stock is mirrored **in geometry**, with corrected winding and normals, then emitted in positive-determinant instances. A negative per-instance reflection would not be a valid raster proof for a shared FrontSide BatchedMesh. The left teeth are instead cloned untouched from the original generated teeth after stock reflection, preserving even their occupied triangle diagonals and normals. Both batched and ordinary mesh paths are tested. No road wheel, front idler, axle, paired center, track-course, tooth-phase or spin contract is changed.

The immutable pre-edit interface baseline is `.qa-dev/reports/abrams-drive-before-RWdVG9/before.json`, SHA `3a9627229da41886c4a5b53e6adb3ac84375309542325a9083a6879aa287f21e`. The permanent test pins the fourteen original new-X gear-interface rows and the independent fleet test pins eighteen original vehicles from the pristine baseline, not a post-edit candidate.

| Frozen file | SHA-256 |
| --- | --- |
| `profiles/abramsSourceXDrive.ts` | `5177acfe3bef6baaf5eba5e96dd395bd84f4af4e8f7d45e43b6cc866524d9509` |
| `abramsSourceXDrive.selftest.mjs` | `5c639e74eaa6fc904818582c082e574588707850f10432e13fc76b49eaa429a7` |
| `tankFactoryCore.ts` | `8a1655f05241d583cf306c46cf6d3238fb07995b172c30579528b2dd4cecac5d` |
| `profiles/abramsSourceXHull.ts` | `27c3299b69dc263dc4611af073f534254aaf73de2e2393cf4ec44b24b2bdf5d5` |
| `profiles/abramsSourceXWheels.ts` | `e9edb1123a794d1e8bd6cee3aad7ff1df57ad4af73d3eca21ce3586ad9216fdb` |

All paths in this table are relative to `src/vehicles/`. These hashes identify the proof snapshot, not unrelated later changes.

## Permanent tests and raw counterpart evidence

`abramsSourceXDrive.selftest.mjs` tests **14 actual high/low builds × 3 poses = 42 posed observations**, not 42 separate builds. It verifies bilateral source-heldout first surfaces with an unchanged 3 mm tolerance, the two-stage hub, and the distinct inboard plate. Every authored primitive has finite position/normal/UV data, outward signed volume and opposed closed edges, including the aperture walls.

Each pose has **14 complete-source air intervals**: four cone passages per side at R .22 and source angles 64.5/154.5/244.5/334.5°, plus R .33/.36/.39 at 246° per side. That is 588 posed air checks, with additional separate batched-build probes. The alternative 114° rays at R .36/.39 actually encounter source track stock and are explicitly not claimed as empty. Exact 216 tooth triangles and their normals (36 teeth × 6 triangles), both sides/qualities, are compared against the option-omitted path at three independent scroll states. All four tested batched-instance determinants are positive.

The final read-only counterpart dump is `.qa-dev/reports/abrams-wheel-native-heldouts-6CHkSx/native.json`, generated **12:58:15.841Z**, SHA `4e212a97916018a2456357053a5e8d8238f17c4558634aa5adc64f591fafb6a4`. Per quality it retains 378 targeted owner rays, 24 paired-gap rays and 138 complete-source comparisons: **540 per quality, 1080 total**. The runner's retained console value 402 counts only targeted plus paired rays; the additional complete-source rows are in the packet. Its pinned implementation hashes are unchanged before/after.

Source-first packets remain under `.qa-dev/reports/`: `abrams-wheel-source-heldouts-y7zJ0X/source.json` (SHA `991effdd621ebc7e4703978698c8cb5d58516f4079b423056cc5cbc8c3da1522`), `abrams-drive-inboard-study-X3sDCR/source.json`, `abrams-drive-openings-study-DQMvfP/source.json`, and `abrams-drive-scalar-study-wuq7vA/source.json`. Dense investigative samples remain ignored evidence, not runtime authoring data.

## Retained source conflicts — not waived

The source carrier is eleven-fold, while the existing native engagement system retains eighteen teeth per side. Carrier scallops and engagement cadence are distinct facts; no unsupported claim that every source scallop is the complete mechanical tooth pattern is made. The deliberate existing rear wrap remains 133.658668 mm above the contradictory source skin at the drive axle: source top 1.178838 m versus native 1.3124966682 m. Native minimum band radius .4309994191 m clears the unchanged .410699 m crown by .0203004191 m. See `abrams-hull-endgear-freeze-20260907.json`. This correction does not conceal or reverse that physical departure.

Complete-source rays at source radial angle π retain real failures, on canonical −X in both qualities:

| Radius | Complete-source first world X | Native first world X | Ownership |
| --- | ---: | ---: | --- |
| .33 | -1.4344562977 | -1.6841607876 | source 120 narrow guide / native `gearEndWheelHardware` |
| .36 | -1.4373423383 | -1.6915255153 | source 120 narrow guide / native `gearEndWheelHardware` |
| .39 | -1.4402283789 | -1.6988902429 | source 120 narrow guide / native `gearEndWheelHardware` |

These source-empty outboard intervals are occupied by the retained native mechanical teeth. The focused test positively identifies that conflict; excluding tooth-occupied witnesses is not a full-source aperture pass.

One boundary-sensitive **stock** residual also remains in the raw packet: R .295 at source angle 4.07 rad gives source first raw X 1.7066899538 versus native 1.7382975000. This straddles the fitted raised-carrier boundary; the candidate chooses the raised surface at this witness. It is not within 3 mm, is not a passing heldout, and prevents claiming every source point is met. The narrow scope is frozen with this disclosed residual rather than presenting a globally exact source match.

The prior R3 road-bowl simplification hypothesis was independently withdrawn; those wheels remain untouched. The R3 visual review and its 0/14 scores remain historical. Fresh all-fourteen R4 image inspection and current raw/geometry/standard results are still required, with unavailable source MTL separated from actual geometry differences. Only the supplied SEP v2 is the directly comparable source target; this file does not certify the six other configuration approximations.

