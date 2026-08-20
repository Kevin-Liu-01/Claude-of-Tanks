# Authoritative Showcase Library

`public/media/showcase-r1/manifest.json` is the canonical public index of
Claude of Tanks screenshots. It keeps the owner-selected feature layer and the
complete approved campaign in one versioned, searchable library.

## R1 contents

| Collection | Frames | Role |
| --- | ---: | --- |
| Owner picks | 13 | The named feature shortlist used by the home page and loading rotation. |
| Action 4K campaign | 30 | Every approved multi-tank action composition. |
| Foreground 4K campaign | 30 | Every approved close, in-the-fight composition. |
| Studio action sequence | 5 | Keyframes from one directed, animated in-engine battle. |
| Live interface | 10 | Strong garage, battle, gallery, killcam, mobile, and sight views. |
| **Total** | **88** | Public showcase frames. |

The campaign masters are 3840×2160 PNGs under `shots/marketing-battles-r3/`.
They stay gitignored because they are production masters; the checked-in site
renditions are 1920×1080 WebP files under `public/media/showcase-r1/`.

## Admission contract

A campaign image enters this library only when all of these are true:

1. A deterministic scene JSON exists in `tools/marketing-shots/scenes-action-r3/`
   or `tools/marketing-shots/scenes-foreground-r3/`.
2. The 4K master passes `shots:battle:grade` at the expected dimensions.
3. The owner approves the complete collection or names the frame explicitly.
4. The frame comes from the first-party runtime renderer—never a playable GLB
   or an unrelated external render.
5. The published manifest records actors, effects, seed, source scene, source
   master, and the quality receipt.

The 13 owner picks are the editorial feature layer. They are intentionally
listed first and remain the smaller loading-screen rotation; the full 88-frame
manifest is the archival layer.

## Rebuild

Generate and grade the campaign masters, render the Studio sequence, then
publish and verify the public library:

```sh
npm run shots:battle:generate
npm run shots:battle:grade -- --root shots/marketing-battles-r3
npm run studio:action:render
npm run showcase:publish
npm run showcase:check
```

Use `--campaign-root` and `--studio-root` with `showcase:publish` when the
approved masters live in another checkout. Publishing fails closed unless the
campaign quality report contains exactly 60 passing frames and no failures.
