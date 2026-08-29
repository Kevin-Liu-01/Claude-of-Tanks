# GenAI Asset Pipelines — Meshy (models) + ElevenLabs (audio) Exploration

Owner ask (2026-08-03): explore Meshy AI for creating tank models from photos
("and rigging them properly"), and ElevenLabs for SFX + TTS generation.
Research date: 2026-08. API facts verified against vendor docs on that date;
credit prices and endpoints drift — re-check before committing to a paid tier.

Companion tools shipped with this doc (both runnable today):

- `tools/meshy-tank-gen.mjs` — photos → Meshy (multi-)image-to-3D → GLB
  candidate under `candidates-gen2/meshy/<id>/` (verified end-to-end in
  Meshy's zero-credit test mode).
- `tools/glb-island-probe.mjs` — no-browser GLB parser that answers the
  rigging question for ANY candidate: welds verts, union-finds connected
  components, reports islands with tank-part heuristics (TURRET?/GUN?).
  Validated against `t80u_javanilga.glb` (finds its turret + gun islands) and
  a real Meshy output (correctly reports "single fused island").

---

## Part I — Meshy AI for tank models from photos

### The verdict up front

Meshy CAN turn 1–4 photos of a real tank into a textured GLB in ~2 minutes
for ~$0.30–0.60 a try. Meshy CANNOT hand us an articulable tank: its
auto-rigging API is **explicitly humanoid-only** ("non-humanoid assets"
listed as unsupported), there is **no semantic part-segmentation endpoint**,
and standard output is **one fused mesh** (empirically confirmed: the
test-mode sample GLB is a single 30k-tri island). "Rigging properly" —
separating turret + gun and baking `TurretPivot`/`GunPivot` per the
`modelLoader.js` contract — stays OUR offline problem regardless of vendor.

The honest framing: Meshy replaces the *sourcing* step of the community-GLB
pipeline (photo → mesh instead of scouting Sketchfab), not the *ingestion*
steps (segment → pivot bake → scale-normalize → `model:audit` →
`model:rig` → geometry gate). Given the geometry gate demands every
component ≥ 90 vs a measured reference, and 2026 reviews consistently report
"faintly melted / clay-like" hard-surface edges from photo generation,
Meshy candidates should be expected to land where most community candidates
land: usable mid-poly bodies needing a fix round, not hero assets.

### API facts (docs.meshy.ai, 2026-08)

- Auth: `Authorization: Bearer msy_...`; keys from account settings.
  Test mode: `msy_dummy_api_key_for_test_mode_12345678` → canned results,
  0 credits (how `meshy-tank-gen.mjs --test` was verified).
- **Image-to-3D** `POST /openapi/v1/image-to-3d`; **Multi-image**
  `POST /openapi/v1/multi-image-to-3d` takes `image_urls` (1–4 photos of the
  same vehicle, public URL or base64 data URI — the tool inlines local
  files). Poll `GET …/:id` (`status`, `progress`, `preceding_tasks`), or SSE
  `…/:id/stream`, or webhooks (max 5/account, https only).
- Two mesh paths:
  - `ai_model: "meshy-6"` (standard): remesh to `target_polycount`
    100–300,000 (default 30k), `topology` quad|triangle, plus
    `remove_lighting`/`image_enhancement` photo hygiene.
  - `model_type: "smart-topology"`, `ai_model: "meshy-t2"` (Jul 2026):
    native game-density triangles, `target_polycount` 100–15,000 (default
    4k), and — the interesting bit — "**natively separated parts**". Caveat:
    that means unnamed *connected components* (geometric touch-groups), NOT
    semantic parts. A turret that visually touches the hull can still fuse.
    `tools/glb-island-probe.mjs` exists precisely to check each result.
- Texturing: `should_texture`, `enable_pbr` (metallic/roughness/normal),
  `texture_resolution` 2k|4k|8k, `texture_prompt` (≤600 chars).
  `symmetry_mode` is deprecated (May 2026) — can't force symmetry anymore.
- Output: `target_formats` glb/fbx/obj/stl/usdz/3mf; result URLs are signed
  and **purged after ~3 days** — download immediately (the tool saves GLB +
  pre-remeshed GLB + thumbnails + full task JSON for provenance).
- Text-to-3D exists (`POST /openapi/v2/text-to-3d`, preview→refine) but is
  the wrong tool for *specific real vehicles* — prompt-only can't hit a
  T-80U vs T-80BV distinction; photos can.

### Costs (2026-08)

| | |
|---|---|
| Meshy-6 textured image→3D | 30 credits (35 with 8K textures) |
| Meshy-T2 smart-topology textured | 15 credits (20 with 8K) |
| Rigging (humanoid-only, useless here) | 5 credits |
| Pro plan | $20/mo, 1,000 credits, API access, 10 concurrent, 20 RPS |
| Premium / Ultra | $40/mo 3,000 cr / $100/mo 8,000 cr |
| Free plan | 100 cr, **no API access**, outputs CC BY 4.0 |

Effective: ~$0.30–0.60 per attempt, ~33–66 attempts on one Pro month;
realistically ~$1/usable candidate after retries. Credits are
pay-before-you-go on top of a subscription; purchased top-ups never expire.

**Licensing:** paid tiers own their outputs outright (private, commercial
use fine); free tier is CC BY 4.0 + no API. Either way outputs get an
ATTRIBUTION.md row (the tool prints one) — same provenance discipline as
sourced GLBs. Input photos should be ones we're licensed to use; official
DoD/VIRIN imagery (public domain) is the clean source for real-tank photos.

### The rigging path that would actually work

1. **Generate**: `meshy-tank-gen.mjs --smart` (meshy-t2, ~12k faces) from
   3–4 photos (front / side / rear-three-quarter; `remove_lighting` on).
2. **Triage**: `glb-island-probe.mjs` on the result.
   - Turret-like + gun-like islands present → pure re-parenting, no cutting:
     add a headless three.js pass (same puppeteer harness as
     `geometry-gate.mjs`) that lifts those islands under `TurretPivot` /
     `GunPivot` groups with ring-center origins and re-exports — the
     `t80u_javanilga` probe run shows exactly the signature to match
     (turret island at upper half + 3×-aspect gun prism).
   - Single fused island → real segmentation needed, options below.
3. **Segment (fused case)**:
   - *Ring-plane cut* (cheapest, in-house): the repo already does
     triangle-index surgery (`applyModelFixes` in modelLoader.js) and
     band-warping offline; a horizontal cut at the turret-ring height +
     cap fill + reprojected texture is the same class of work.
   - *Tripo3D Segmentation API* (managed): Tripo has what Meshy lacks —
     semantic segmentation v2 ("Simple 3–6 parts / Balanced 6–15 /
     Detailed 15+"), ~40–50 credits, generation from ~10 credits. Could even
     segment Meshy-generated GLBs. Cut faces arrive open and need capping.
   - *Hunyuan3D-Part, open source local* (P3-SAM + X-Part, Sept 2025): native
     3D part segmentation + watertight part regeneration, free, needs a
     24 GB-class GPU — not this MacBook; would be a cloud-GPU batch job.
4. **Ingest as usual**: scale-normalize to specs.ts dims, materials pass,
   `npm run model:audit`, `npm run model:rig`, geometry gate vs reference.

### Recommendation (models)

- Meshy is worth a $20 one-month Pro experiment IF we want new hulls faster
  than scouting free assets — but budget the segmentation tooling first;
  without it every output is a paperweight per the loader's own charter.
- If the experiment happens, generate with **meshy-t2 smart topology** and
  keep only results where the island probe finds a separable turret; that
  sidesteps segmentation entirely at ~$0.30/attempt.
- If we want semantic parts guaranteed, **Tripo3D is the better-fit vendor**
  (image→3D + real segmentation API); Meshy brings nothing Tripo lacks for
  this use case.
- The geometry gate stays the arbiter. AI generation competes with the
  procedural builders + community sourcing on gate score per hour of fix
  work; expect it to win on obscure vehicles with no good free models and
  lose on anything the procedural pipeline already scores 90+ on.

---

## Part II — ElevenLabs for SFX + TTS

Companion tool: `tools/eleven-audio-gen.mjs` — audition probe with
`sfx` / `tts` / `design` / `save-voice` / `voices` modes writing candidate
takes under `shots/eleven-probe/` for A/B against the shipped sets (endpoint +
auth shape verified live; generation needs a real key). Integration keeps
`make-sfx.mjs` / `make-voices.mjs` as mastering + gate owners — ElevenLabs
would swap only their synthesis stage.

### The verdict up front

The entire soundscape — 29 combat SFX at ~5 takes each, engine loops, four
designed crew voices, the full 48-line announcer script (825 chars!), and a
garage theme + result stings — fits comfortably in **one Starter month
($6, 30k credits) ≈ 20–23k credits**, with a commercial license and no
attribution. TTS is where ElevenLabs is clearly better than what we have
(Piper is monotone; `eleven_v3` does shouting-under-fire with audio tags).
SFX is a judgment call: 2026 reviews rate it "mid-to-upper-tier stock
library" for impacts/explosions/UI — likely better *samples* than our
procedural set, but we lose the seeded-deterministic, CC0-by-construction
posture that `make-sfx.mjs` was explicitly built around.

### API facts (elevenlabs.io/docs, 2026-08)

- Auth: `xi-api-key` header. Node SDK `@elevenlabs/elevenlabs-js` (v2.60.0)
  exists but plain fetch suffices (the probe uses fetch, zero deps).
- **SFX**: `POST /v1/sound-generation`, model `eleven_text_to_sound_v2`
  (SFX v2, Sept 2025: 48 kHz, 30 s max, seamless `loop: true`).
  `duration_seconds` 0.5–30 (explicit duration = **11 credits/s**; auto =
  **100 credits**), `prompt_influence` 0–1 (high = literal, low = varied).
  **NO SEED** — a take can never be regenerated; keepers are committed
  immediately (fits our commit-the-ogg model), rejects deleted.
  `output_format=opus_48000_128` and `pcm_48000` are available un-gated —
  drops straight into our pipeline. Loop caveat ×2: documented lossless
  output is scoped to NON-looping (loops come back MP3), and looped playback
  must go through `AudioBufferSourceNode` with trimmed codec padding, never
  a naively looped `<audio>` tag.
- **TTS**: `POST /v1/text-to-speech/{voice_id}`.
  - `eleven_v3` — most expressive; **audio tags** in-line: `[shouts]`,
    `[whispers]`, `[sighs]`, `[exhales]`, even `[explosion]`/`[gunshot]`;
    stability acts as 3 notches (0 creative / 0.5 natural / 1 robust).
    No `[static]` tag — the radio grit stays OUR ffmpeg chain (good: keeps
    every line consistent and the aesthetic ours).
  - `eleven_multilingual_v2` — "most stable", the safe batch-bake choice.
  - `seed` is best-effort only; `previous_request_ids` chains prosody across
    consecutive short lines (useful for variant reads).
- **Voice Design** (the right way to get crew voices — no real person, no
  availability risk): `POST /v1/text-to-voice/design` with
  `eleven_ttv_v3`, a text description + 100–1000-char preview line and a
  **deterministic seed** ("same seed + inputs = same voice") → 3 previews →
  `POST /v1/text-to-voice` saves the pick as a permanent `voice_id`.
  Costs a few hundred credits per attempt.
- **Music** (`music_v2`): `POST /v1/music`, `music_length_ms` 3s–5min,
  `force_instrumental`, ~900 credits/min. Could cover a garage theme +
  fanfare stings for ~3–5k credits. Has its own license terms (below).

### Costs + tiers (2026-08)

| Tier | $/mo | Credits | Notes |
|---|---|---|---|
| Free | 0 | 10,000 | **NON-commercial only** + "elevenlabs.io" attribution in the title; no music downloads at all |
| **Starter** | **6** | **30,000** | commercial license, IVC, music commercial use — the real floor |
| Creator | 22 | 121,000 | PVC, 192 kbps, extra-credit purchases |
| Pro | 99 | 600,000 | 44.1k PCM via API, hi-q music downloads |

What a credit buys: TTS = 1/char (v3 & multilingual_v2; API discounts flash
to ~0.5/char). SFX API = 100/gen auto or 11/s explicit. Music = 900/min.
Concurrency on Starter is low (2–6 parallel) — the bake loops stay serial
anyway. Full-project math: SFX set ~5–8k cr, engine loops ~1.7k, 4 voice
designs ~4k, announcer set ×3 takes ~5.4k (825 chars/pass — negligible),
music ~3.6k → **≈ 20–23k credits total**.

### Licensing (the part that actually matters here)

- Paid-plan output: commercial use OK, **indefinite** (survives
  cancellation), no attribution. Free-plan output: non-commercial only +
  attribution — and "commercial" is broad. Starter is the safe floor even
  for a hobby game.
- **Beta exclusion**: output of Beta-flagged services carries NO commercial
  license. `eleven_v3` shipped as alpha (June 2025) and is now listed as
  flagship, but some help-center pages still say "alpha" — verify its GA
  status on the account before shipping v3 lines, or regenerate finals with
  `eleven_multilingual_v2`.
- Music has separate per-plan terms: fine for games on any paid plan UNLESS
  the game is monetized AND multi-platform ("Studio Game" ⇒ enterprise).
  This project (private, one origin, unmonetized) is fine on Starter.
- Voice Library community voices can disappear (owner notice periods, 0–2
  years) — already-baked audio stays licensed, but future lines with that
  voice aren't guaranteed. Voice-Designed voices avoid this entirely; use
  them for the crew.
- Repo impact: this ends the audio payload's "CC0 by construction / no
  accounts / no cloud" posture (make-sfx.mjs and make-voices.mjs headers).
  Generated audio is owner-licensed-but-not-CC0 ⇒ new rows in
  ATTRIBUTION.md, and a decision on whether `strip-nc-assets.mjs` treatment
  applies to any free-tier experiments (paid-tier output needs no strip).

### Integration sketch (when/if we do it)

1. **Announcer/crew (highest payoff)**: `eleven-audio-gen.mjs design` ×4
   (commander/gunner/loader/driver personas, fixed seeds, descriptions in
   the tool header) → pick per role → batch the LINES table from
   make-voices.mjs through `tts --model v2` (v3 for the shouty survival
   calls) at `pcm_48000` → reuse make-voices.mjs' EXACT intercom chain +
   LUFS gates + payload budget unchanged (only the piper() call is swapped).
   The r1 four-persona crew design that was retired for Piper-quality
   reasons becomes viable again.
2. **Combat SFX (A/B first)**: generate 3–5 takes for one sound per class
   (`fire_large`, `pen`, `ricochet`, `expl_tank_core`) with dry/close-mic
   prompts, run them through make-sfx.mjs' ffmpeg mastering, and A/B against
   the procedural set at equal LUFS. Only migrate classes that clearly win —
   the bass-energy gates keep meaning what they mean either way.
3. **Engine loops (needs runtime work)**: engines are LIVE-synthesized in
   audio.js today; sampled loops mean an AudioBufferSourceNode loop path +
   RPM via playbackRate. Generated "heavy diesel idle" loops will sound
   generic-good, not turbine-specific (reviews: fails at "a specific
   engine"). Defer unless the procedural engines start to grate.
4. **Music**: net-new capability (game has fanfare stings only). Cheap to
   audition; garage theme + result stings ≈ $0.75 of credits.

### Recommendation (audio)

Do the **$6 Starter experiment**, in this order: crew voices (clear win,
825 chars of script makes iteration free), then SFX A/B (evidence-based
migration, class by class), skip engine loops initially, audition music
last. Keep every keeper committed (no SFX seed ⇒ the repo IS the archive),
record the license rows, and confirm v3 GA status before baking finals
with it.
