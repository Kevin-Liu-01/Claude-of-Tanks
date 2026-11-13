# Official marks used by the optional camouflage catalog

Retrieved 20 September 2026. These marks identify the user-selected cosmetic
finish. They do not imply sponsorship or endorsement; trademarks remain the
property of their respective owners. These are official source assets, not
first-party vehicle geometry or an assertion that the marks are CC0.

| Saved paint ID | Official source | Retained vector | SHA-256 |
| --- | --- | --- | --- |
| `openai` | [OpenAI brand guidelines](https://openai.com/brand/), [official Blossom guideline SVG](https://images.ctfassets.net/kftzwdyauwt9/3hUGLn3ypllZ0oa01qOYVq/28e8188e6f11b84c3e876569d492734f/Blossom_Light.svg) | `openai-blossom-guideline.svg` | `01485e70cea6df8422f5abc643fbbd3c153442cc41da0e7d8e7451801ebf26e2` |
| `xai` (compatibility ID; label **X**) | [X brand toolkit](https://about.x.com/en/who-we-are/brand-toolkit), [official logo ZIP](https://about.x.com/content/dam/about-twitter/x/brand-toolkit/x-logo.zip) | archive member `logo.svg`, retained as `x-logo.svg` | `dd46f96b6f47fcd33683b79ddfaf3daca1d4f8aeba3c0f2bde1584c69cc699d4` |
| `gemini` | [Google Gemini](https://gemini.google/overview/), [Google-hosted sparkle v002](https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg) | `gemini-sparkle-v002.svg` | `01821494593b81ffd7da0e08287d4735304ff6292a6903453328b9d17cf38799` |

`src/vehicles/brandCamoMarks.ts` copies the exact complete path data. OpenAI's
construction diagram contains two complete black examples plus guide lines;
we use the first direct `path` whose `fill` is `black`, with its original nonzero
winding. X uses its sole path. Gemini uses its sole path and the published v002
radial-gradient transform/stops. The chosen Gemini version is documented rather
than presented as an exact reproduction of every later animated/aurora variant.

`brandCamoPainter.ts` uniformly scales and translates each complete mark without
distortion, extra outline or reconstruction. Seeded rotations and a wrapped
hero/medium/sprinkle composition fill the existing deterministic material tile. Runtime has no logo download,
SVG parser, extra material, mesh or texture; the same painter is used by the
synchronous and worker paths. Ordinary material wear remains shared.

The former abstract ring, streak and constellation prints are now separately
selectable **Mono**, **Carbon** and **Prism** designs. They contain no brand paths.
Sabra's **Sinai Contours** is an original sand/olive striped cosmetic choice,
not a documented historical service camouflage.

## General Translation (5 October 2026)

The optional **GT · General Translation** finish uses white marks on charcoal-black enamel. Marks share the existing seeded, seam-wrapped hero/medium/sprinkle composition and synchronous/worker painter, with no runtime asset fetch or extra shader.

**Symbol (272 patch, owner: "used this new logo for both").** The camo and both General Translation credits (the Garage language credit and the public footer) draw General Translation's symbol: a 487-unit circle with a G and a T cut out, one path with the even-odd rule. The owner supplied it as `Symbol.svg` on 12 November 2026; it is retained byte for byte as `gt-symbol.svg`. SHA-256: `855a421a9a5288d7e2b4275ebafcb57fb5d25a8b59b69cb6ef57d4409941b665`. `GT_BRAND_PATH` and `src/ui/gtSymbol.ts` carry its path unchanged; `brandCamo.selftest` and `garageLocaleNavigation.selftest` pin both to this file. The painter centres it on (243.5, 243.5), fills it even-odd and scales it from a 656-unit width, which keeps the flat tile's ink where the globe had it (mean alpha over 64 seeds: 10.75 % monogram, 10.79 % globe, 10.81 % symbol). The credits draw it inline in currentColor, so the old 96 px PNG (`public/brand/partners/general-translation.png`) is retired.

**No overlap (272 patch, owner: "for the gt camo, dont make the logo keep overlapping with other logos").** Stamps no longer land on one another. Each candidate is rejection-sampled against every placed stamp's bounding circle (the farthest inked pixel at any rotation) plus a gap of 1.2 % of the tile, measured across the wrapped seam; a candidate that keeps colliding is redrawn and shrunk, and one that never fits is dropped. The hero, four mediums and sprinkle, their sizes and the seeded rng are unchanged. OpenAI, X and Gemini share this layout and follow the same rule.

**Globe mark (272, superseded by the symbol).** Before the symbol, the 272 camo painted General Translation's globe logo. Its single nonzero path is retained byte for byte in `gt-globe-logo-light.svg`, from General Translation's landing app (`apps/landing/public/brand/gt-globe-logo-light.svg` at commit `ebc70db5a7`). SHA-256: `f48245a0a672ff75c149f32b8f8510c0c3c3b8e74442746aedc6dff17177b909`. Nothing draws it now.

The earlier GT monogram, `gt-mark.svg` from [General Translation’s official repository](https://github.com/generaltranslation/gt/blob/a16ae03c62cd1048b4d3ebb585de427d65e02612/tools/bundle-analysis/brand/gt-mark.svg) (SHA-256 `06f0c9dcca6d1723ee0891aff0db44dc635ebf44fa5c3dfcd70812b5cb6c6b03`), is retained for the record; the camo no longer paints it.
