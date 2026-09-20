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
rotation, distortion, extra outline or reconstruction. Four marks are painted
into the existing deterministic material tile. Runtime has no logo download,
SVG parser, extra material, mesh or texture; the same painter is used by the
synchronous and worker paths. Ordinary material wear remains shared.

The former abstract ring, streak and constellation prints are now separately
selectable **Mono**, **Carbon** and **Prism** designs. They contain no brand paths.
Sabra's **Sinai Contours** is an original sand/olive striped cosmetic choice,
not a documented historical service camouflage.
