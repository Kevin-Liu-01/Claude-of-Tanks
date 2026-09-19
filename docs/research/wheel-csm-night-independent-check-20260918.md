# Wheel readability: independent production CSM and night check — 2026-09-18

Scoped result: **PASS** for real engine CSM binding/compilation, retained received shadows, night readability and exact reset in this controlled fixture. This is not a tank-source fidelity certification or a full battlefield performance gate. No runtime code was changed.

The reviewer did not author the shared shader. The AFT wheel stock was authored by this reviewer, so these observations do not independently certify its shape. The Type 96B stock was not authored by this reviewer.

Evidence: `.qa-dev/tank-run/europe-source/wheel-csm-r1/report.json` (all 52 original PNG SHA-256 values, before/after implementation hashes, actual linked-program results, uniforms and shadow-map telemetry), `page.html`, `run.mjs`, and `networkcheck.json`. The FIFO lease was acquired and released by the harness. All 52 image hashes were separately recomputed and matched; implementation drift was empty.

Frozen `src/vehicles/materials.ts`: `3c99871d3048189394eb272aabdb68b1c6e8b7bd7022f59fa4791c57a234817b`. Repository HEAD was `29c9ecefd`.

## Actual integration exercised

The fixture imports production `createRenderer`, `createSky`, `createLighting`, `createTank`, and `createBattleAtmosphereRuntime`. It follows the production sky/lighting preset application chain, including real PMREM environment baking and `setupShadowMaterial` CSM-then-vehicle-hook composition. It creates native Type 96B X and AFT-10 X on both HIGH and LOW, using factory paint and a fixed camera. It adds a receiving ground plane and a separately toggled shadow-only box caster using the production shadow-only layer route. No CSM/material stub is used.

GPU: `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)`. All 18 active programs per case linked; all attached vertex/fragment shaders compiled. Each case included 11 CSM programs and two wheel-defined programs. All three compiled wheel material instances retained the real CSM registration, cascade uniform and wheel branch, and shared the same readability uniform identity. HIGH allocated 2048/2048/2048/1024 maps; LOW allocated 2048/2048/1024/1024 maps. No WebGL or page exceptions occurred. One HTTP 404 console entry was preserved; the bounded network-only follow-up reproduced it at `/favicon.ico`, with no failed shader or model resource.

## Received shadows and night response

The table records display-pixel luminance (0–255), measured on the opaque visible wheel-paint mask. The controlled caster darkened every masked wheel pixel relative to the same frame with native shadow intensity zero. It did not replace or alter wheel geometry.

| Native build | Visible wheel pixels / darkened by caster | Day median | Caster-shadow median | Actual night median | Stress .12 p10–p90 |
|---|---:|---:|---:|---:|---:|
| type96b_x HIGH | 18,109 / 18,109 | 122.75 | 61.78 | 52.84 | 22.63–74.76 |
| type96b_x LOW | 17,484 / 17,484 | 121.96 | 60.92 | 52.55 | 23.49–75.90 |
| aft10_x HIGH | 15,848 / 15,848 | 131.75 | 68.78 | 60.62 | 23.78–76.25 |
| aft10_x LOW | 15,606 / 15,606 | 131.68 | 68.49 | 60.55 | 24.21–76.76 |

Actual atmosphere preparation selected a deterministic night seed and set readability to the current production value **.34**. Additional stress frames used **.12**, **0**, and **1** under that same night environment. Every uniform tracked each requested value. The .12 contribution changed 7,306–9,979 visible wheel pixels relative to zero, while preserving the lit-to-recess gradient. The minimum wheel luminance at .12 remained 8.71–9.85; no measured wheel pixels fell below 3. This is descriptive evidence, not an invented replacement visual gate.

The following restored frames were byte-identical in every case: caster on → off, night scale .12 → 0 → 1 → .12, and production atmosphere reset back to daytime/scale 1. Native self-shadows also remained measurable in day and night without the added caster.

## Actual visual inspection and limits

The reviewer opened these four original PNGs for each of the four builds (16 images total): `day-normal.png`, `day-blocked.png`, `night-normal.png`, `night-scale-012.png`. The stepped hubs and recessed annular faces remain visually distinct in day, cast shade and night. Night reduces brightness without producing uniformly bright or flat wheel discs. LOW keeps the same gross relief with its coarser tire contour; native texture/detail differences between quality levels remain visible. The other 36 images were measured and hashed, not claimed as separately visually reviewed.

This uses a single static, raw production forward-render fixture at 960×640, with two native tanks loaded separately. It does not exercise the full map, composed GTAO/TAA/bloom/grading, moving cascade transitions, mobile hardware, multi-tank draw load or actual battle frame-time budgets. Five warm forced draws per case were recorded only as diagnostic wall-clock samples with `gl.finish`; they are not a GPU benchmark or comparative performance claim. The eager factory path used here does not asynchronously load new generated interior-fill receipts; root identified that separate QA coverage issue after capture. It does not affect this exterior wheel-shader binding proof, and this report must not be reused as a complete final tank/cost receipt.
