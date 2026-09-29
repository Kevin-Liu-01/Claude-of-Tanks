# Campaign Studio

Campaign Studio finishes native Scene Studio captures into a cohesive promotional package: a 20–30-second film with paced cuts, restrained shot titles, a branded end card and synchronized original sound design; a short silent background loop; and cleanly branded landscape, portrait and square images. The game remains the source of every tank, environment, light and visual effect. The finishing pass does not fabricate geometry or imitate another game's assets.

## Capture and finish

The Director workspace also supplies ready-to-edit `steel-pursuit`,
`desert-crossfire` and `coast-recon` sequences. Pass `--preset=<id>` instead of
`--scene=<file>` to render the same authored sequence used by the interface.
Each is eight seconds; the preset supplies its map and lighting.

For a controlled demonstration of actual battle mechanics with a live HUD,
start the development server and run:

```sh
node tools/feature-promo-capture.mjs --native-battle --base http://127.0.0.1:8129 --out shots/native-gameplay
```

This records the complete page at native 1920×1080 and saves opening/aftermath
images. The real battle simulation resolves the shot, while positions and the
firing lane are deliberately staged. Its receipt includes the player-shell
result and tool hash. The requested 60 fps is a recording rate, not a gameplay
performance claim; inspect actual encoded motion. This mode avoids the legacy
low-resolution capture and frozen HUD overlay. Keep it labeled as a controlled
gameplay demonstration rather than a competitive match.

Author a scene with camera keyframes, vehicle motion and timed effects in Scene Studio. Save the scene JSON and capture each scene separately. Eight-second, 30 fps scenes make a practical three-shot, 26-second campaign with its two-second end card:

```sh
node tools/media-production/produce.mjs --task=video --scene=shots/scene-steel.json --times=sunset --formats=landscape --fps=30 --frames=240 --width=1920 --out=shots/steel-take-1
```

The producer also renders clean and branded landscape, portrait and square posters. Campaign finishing uses the clean camera compositions and supplies its own consistent typography. Preserve the source films: these remain silent, clean masters. The finishing tool never rewrites them.

Create a job JSON. Receipt paths are relative to the job file; paths recorded inside a producer receipt retain the producer's project-root-relative or absolute convention. Run the tool from the repository root.

```json
{
  "title": "Armor in motion",
  "subtitle": "Three battlefields. Three perspectives.",
  "cta": "Play free in your browser",
  "scenes": [
    { "id": "steel", "title": "Steel in motion", "description": "Low tracking camera follows the vehicle's suspension.", "receipt": "steel-take-1/video-receipt.json" },
    { "id": "wake", "title": "Across the water", "description": "A shoreline tracking shot frames the vehicle and its wake.", "receipt": "wake-take-1/video-receipt.json" },
    { "id": "duel", "title": "First contact", "description": "A staged exchange with timed recoil and impact effects.", "receipt": "duel-take-1/video-receipt.json" }
  ]
}
```

```sh
node tools/media-production/campaign.mjs --job=shots/campaign.json --out=shots/campaign-finished-1
node tools/media-production/campaign.selftest.mjs
```

Optional `videoIndex` selects a landscape movie from a receipt containing multiple lighting versions. `inSeconds` and `durationSeconds` trim footage without retiming it; both must land on source frame boundaries. All scenes must share dimensions and frame rate. The final edit must be 20–30 seconds, including the end card. Inputs below native 1920×1080 or with incomplete receipts, changed hashes, missing poster formats, inconsistent frame counts or incorrect durations fail before finishing starts. Existing output directories are refused. Failed jobs retain an error receipt; use a new output directory after correcting the cause.

## Output and review

- `hero-trailer.mp4`: H.264 footage with AAC sound; no speed changes or interpolated frames. Opening shot labels disappear after two seconds, then the framing stays clear.
- `silent-loop.mp4`: six seconds (or the first shot's shorter available duration), with a brief fade at the repeat boundary. No reversed tank motion.
- `posters/`: native landscape, portrait and square WebP campaign cards. Original framing and pixels are preserved apart from the explicitly branded lower gradient and text. Scene name, brand, call to action and footage notice are stacked using measured font bounds with a guaranteed gap in every format.
- `contact-sheet.jpg` and `review.html`: a portable review page with playable videos, images, dimensions, descriptions and provenance link.
- `campaign-receipt.json`: source receipt hashes, original media hashes, renderer provenance, edit plan, complete encoder arguments, output hashes, codec probes and sound provenance.
- `edit/`: title/end-card artwork, intermediate movie segments, concatenation list and original synthesized WAV soundtrack.

The audio is deterministic original synthesis: quiet engine harmonics and filtered air noise beneath timed gun reports, impacts and decaying tails. Cue positions derive from the captured scene's `effects[].tMs`, shifted by the producer's `startMs`, edit trims and cuts. Published replay recipes likewise preserve recorded film starts and each poster's absolute `fxTimeMs`. Reports end at the next cut; the mix uses bounded saturation and a final limiter. This is postproduction sound design, not a recording of the live game's audio mix. No sampled music, external recordings or third-party audio licenses are involved.

For a manual review, watch the whole hero film with sound and inspect every poster. Automated reviews must explicitly distinguish sampled visual inspection, complete decode checks and measured audio levels from continuous playback or listening; never claim listening when audio input is unavailable. Contact sheets help find framing problems but do not certify motion continuity, effect synchronization or sound quality. The output says **“In-engine staged scenes”**: do not relabel a choreographed Studio take as a live competitive match. Public publication and deployment remain separate from finishing; copy only reviewed distribution assets and retain the original receipts with the release.

## Publish a reviewed campaign

The publisher verifies the finished receipt itself, every source film and clean poster, every finished output, the original capture receipts, the finishing-tool hashes and the current rendering source fingerprint. Finish all code changes **before** final captures: rendering and media-production source changes require new captures rather than editing the recorded digest.

After inspecting the output and recording the actual review coverage and any listening limitations, write a review JSON:

```json
{
  "receiptSha256": "SHA-256 of the exact campaign-receipt.json bytes",
  "sourceDigest": "shared sourceDigest from the capture inputs",
  "accepted": true,
  "reviewedAt": "ISO timestamp",
  "notes": "Specific framing, camera-cut and effect review findings",
  "audioNotes": "Specific synchronization, level and sound-quality findings",
  "hashes": ["every campaign output SHA-256 plus every input video and clean poster SHA-256"],
  "scenes": {
    "steel-pursuit": { "accepted": true, "notes": "Specific findings for this sequence" },
    "desert-crossfire": { "accepted": true, "notes": "Specific findings for this sequence" },
    "coast-recon": { "accepted": true, "notes": "Specific findings for this sequence" }
  }
}
```

```sh
node tools/media-production/publishCampaign.mjs --receipt=shots/campaign-finished-1/campaign-receipt.json --review=shots/campaign-finished-1/review.json
node tools/media-production/campaignPublication.selftest.mjs
```

The tool prepares derivatives in a private temporary directory, then publishes to `public/media/director-r4/`: the finished hero film, silent loop, compact mobile videos, three clean scene films, native clean and branded stills, 1280px preview cards, video posters, English descriptive captions, contact sheet and portable provenance manifest. The publisher encodes native 1080p H.264 web derivatives at CRF 21, capped at 6 Mbps with a 12 Mbit buffer; only the hero film retains audio, encoded as 192 kbps AAC. Mobile 540p derivatives use a 1.8 Mbps ceiling and 3.6 Mbit buffer and stay silent. It never upscales footage. Every encode is probed for unchanged frame count, frame rate and duration, correct dimensions and audio policy, plus a byte budget derived from its bitrate ceiling and buffer. Distribution provenance pairs each unchanged master hash with the resulting compressed asset hash and measured properties. Native portrait and square stills come from their own camera renders, not crops of landscape footage.

The shared `production-r1/manifest.json` gains the new Studio shots, clean-film recipes and campaign movie while retaining earlier map images, films and their original provenance. Every retained file's hash is checked before publication. Public manifests contain web URLs and source hashes, never private workspace paths. The homepage uses the new film, first three hero images and Studio teaser; the manual's hero player supplies controls, sound and captions, and the Studio guide uses the new silent loop. Older battle-reel collections and mechanics illustrations remain available.

Publishing creates local release assets. It does not imply visual acceptance of a later recapture or deploy the site.

## Publish a controlled gameplay capture

The native battle take is a separate source from the Director films. Review
its entire motion, both PNGs and `capture-report.json`: a destroyed target
alone does not prove the player's shell caused the destruction. The current
take records a player ricochet with zero damage. The acquisition also stages
target health and positions and explicitly advances 0.20 seconds of simulation
for the shot. Preserve these qualifications; neither its requested frame rate
nor its encoded cadence measures game performance.

`tools/publish-gameplay-capture.mjs` verifies native 1920×1080 input, decoded
frame count, duration, browser errors, a resolved player hit and reviewed input
hashes. It uses the same bounded H.264 delivery ladder as the campaign:
1920×1080 at CRF 21 / 6 Mbps maximum and 960×540 at 1.8 Mbps maximum,
with no audio. It preserves frame count and cadence, produces two WebP stills,
and retains the original raw files untouched. The encoded output is checked
again for duration, resolution, codec, frame count and bounded byte size.

The legacy native capture report records its acquisition-tool hash but not a
runtime source digest. A reviewer must attest that it ran against the same
frozen source as a named producer receipt. Publication retains that original
digest, revision and receipt hash with this explicit attestation limitation;
a later unrelated Studio edit must not silently replace the capture's source.

Create a review JSON with `accepted: true`, `reviewedAt`, specific `notes`,
`sourceAttestation`, `sourceDigest`, `revision`, `sourceReceiptSha256` and
`hashes` containing SHA-256 values for all four exact inputs:
`capture-report.json`, `battle-live.webm`, `battle-opening.png` and
`battle-impact.png`. The source receipt is the same frozen-source producer
`video-receipt.json`; the acquisition script must still match its recorded
hash. Review notes should distinguish observed media from inferred results.

Run after the cinematic publisher has completed:

```sh
node tools/publish-gameplay-capture.mjs --capture=shots/native-gameplay --source-receipt=shots/steel-take-1/video-receipt.json --review=shots/native-gameplay-review.json --out=shots/native-gameplay-web
node tools/publish-gameplay-capture.selftest.mjs
```

The publisher refuses existing output directories or existing gameplay asset
paths. It writes `public/media/director-r4/gameplay/`, merges the archive
manifest while verifying preserved asset hashes, and does not erase cinematic
or map media. Its local `publication-receipt.json` keeps original probes and
exact encoding commands. Public provenance contains hashes and portable asset
URLs without private filesystem locations. The homepage damage section and
the documentation combat player use these delivery files. Both identify the
take as a controlled gameplay demonstration; the documentation provides normal
playback controls and descriptive captions.
