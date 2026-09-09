# Abrams X loader shields — bounded R4 freeze

Status at **2026-09-07T13:52:36.561Z**: the focused CPU proof passes for the frozen source97/source103 shield replacement. **Fresh full-scene R4 imagery, overall appearance, raw shape gates and release remain pending.** This is not a claim that all seven configurations are certified by the SEP v2 file.

## Scope and source

`profiles/abramsSourceXLoaderShields.ts` exports canonical-world `sourceLoaderShields()` stocks. The caller owns turret attachment. Only the old loader Fore/Side shield frames and glazing are replaced; commander/inboard shields, the existing main loader barrel, other equipment and all vehicle armor/gear remain outside this helper.

The supplied OBJ is retained unchanged, SHA-256 `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`. The fixed transform is `[-rawX, rawY + .203945, .357965 - rawZ]`, one source unit per metre. All143 owners are retained in independent complete-source queries. Source geometry, arrays and topology are not imported by runtime code: these33 stocks use independently constructed sheets, sparse fold/section dimensions and measured plane equations.

The33 closed stocks comprise two genuinely thick, slightly warped source103 panes; six source97 window-channel/lip pieces; nine upright/lower-return/toe pieces; two long round-ended crowns481/182; four shallow crown caps4/6/8/18; eight narrow receiver-brace pieces428/501; and two distinct fork links116/128. The side toe includes source72's actual outturned terminal edge, which the first simplified toe omitted. That edge is part of the existing shield's receiving fold, not additional accessory scope.

The source panes are approximately48.42mm normal-thick and retain their shallow opposing-face twist. Open steel channels are not mislabeled as complete-scene air where real glass occupies them. The source-shaped clear approaches to the CITV rear face remain unobstructed.

## Evidence and construction limits

Independent source packet `abrams-loader-independent-eUHUcR/source.json` provides11 held-out complete-source first surfaces, four real air intervals and the two CITV approach rays. Its SHA-256 is `91c4d89d065bb367067ab6951d0758303440131ffea56d737ed16b56b61e37dd`.

The separate source-only `abrams-shield-links-source-OrJ7sT/source.json` authenticates both receiving chains through finite source triangle/edge intersections:62→116→1040 and72→128→1040. It also records direct source toe/fork intersections. The older428/501 braces alone do **not** reach the fork; that failed diagnosis is retained, not reclassified as a contact pass. SHA-256: `d9481b331e137ba1036927d3b1fc010b66cb735d4becc616888bfb7767768fc1`.

`abrams-shield-links-source-QgSQbZ/source.json` independently records the six tested116/128 source surfaces. Some source link sides are open, so these checks match retained physical surfaces among the ray intersections; they do not falsely require a closed-source first-hit pair. SHA-256: `a3d3e725efe34fd8a1702a33322522943b2c68fdaf8f0aa4bd01fdca570fbde7`.

`abrams-loader-shield-scalar-F0TTBW/source.json` retains the distinct source72 fold planes, including its narrow outturned toe boundary. SHA-256: `79d9dfe8a2c2c688ae2e5eee0e8407b157d6cf4b55371564676156e31af58424`.

The native stocks are independently closed. The source428/501 underside is not itself proven closed; a concealed2mm closure is an explicit construction inference.116/128 likewise use closed sparse section lofts, not a claim that their source components are watertight. The narrowing128 tip keeps a0.1mm interior subdivision and a new interior cap triangulation, avoiding a zero-area ear without moving its retained boundary or lowering the test threshold. Fine chamfers and local source warping outside the held-out locations remain approximation limits.

## Exact focused proof

`src/vehicles/abramsSourceXLoaderShields.selftest.mjs` passed after the last runtime change. It verifies all33 stocks for finite nonzero triangles, closed paired edges, outward volume, normal/position/UV attributes, deterministic buffers and fresh metadata; the two panes retain real thickness and shallow warp.

All seven variants build at high and low quality: **14 builds and42 turret/gun poses**. The source urban shields exist on two configurations, giving **12 active shield poses**. Each active pose verifies the11 complete-source first surfaces, four complete-scene air segments, two exposed CITV rear faces and six actual stock-contact pairs. The non-urban variants explicitly emit zero of these source urban shield stocks; their absence is not represented as a positive source-appearance result.

The unchanged limits are0.2mm for glass firsts and the CITV approach,2mm for the steel/link held-outs, and strictly positive physical overlap greater than0.5mm for each tested receiving pair. Six independent link surfaces are also checked in the isolated canonical assembly. Contacts use oriented triangle-ray occupied intervals, not AABB overlap. The posed contact proof uses captured actual builder emissions and their actual turret transforms, while the air/first-hit checks use the complete visible native scene.

The contact pairs are ForeToe→116, SideToeEdge→128,116→ForkEar1040,128→ForkEar1040, ForeReturn→428 and SideReturn→501. They establish the shield-to-fork scope; this packet does **not** assert an unmeasured base98→main-turret59 contact.

Final focused log: `.qa-dev/reports/abrams-shields-final-focused-3.log`, SHA-256 `19341401c256be5a2a94a190423781b3dbbd9204cd639c627448b173010d4a45`.

Runtime SHA-256: `0e61edb9ce7e3ed05b4993af5880484ae206cb9316a04b5e0065ada257d996b4`.

Focused-test SHA-256: `d6193d230b6c30d36c0e0618d0b635fc46231f81e1a50731bd92949b026cd5ba`.

Historical failures are retained: the initial contact packets found no complete side receiving chain; `abrams-shields-final-focused-1.log` rejected a128 folded-surface mismatch; `abrams-shields-final-focused-2.log` rejected the actual near-collinear cap triangle. The final surface correction and cap triangulation fix those defects; no witness, threshold, source mask, camera or gate was relaxed. Root owns the subsequent integrated loader/preservation checks, quality/typecheck and fresh full14/neutral visual checkpoint.

