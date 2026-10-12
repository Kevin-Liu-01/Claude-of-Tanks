# The repository docs that describe the site's gameplay media, moved to the site fifty (round 14, 2026-10-12): the
# showcase library page gains the current library and keeps the retired one as history; the index, the features page,
# the screenshot contract and the Gallery notes point at public/media/site50-r14. Each edit matches exactly once.
#   python3 tools/media-r5/site-media/docs-copy.py <tree root>
import re, sys
ROOT = sys.argv[1].rstrip('/')

def edit(path, pairs):
    full = f'{ROOT}/{path}'
    text = open(full, encoding='utf-8').read()
    for old, new in pairs:
        if text.count(old) != 1:
            raise SystemExit(f'{path}: {old[:70]!r} matched {text.count(old)} times')
        text = text.replace(old, new)
    open(full, 'w', encoding='utf-8').write(text)
    print('updated', path)

CURRENT = """## Current: the site fifty (round 14, since 2026-10-12)

The site's gameplay media is the site fifty: fifty takes staged in Scene Studio on the game's own maps, tanks and
effects, each rendered at 4K (3840×2160 at 30 fps, 8 to 48 renders a frame, motion blur) with its own sound, plus the
fifty frames (R181, motion-blur stills) and the films. The owner chose it to replace every older gameplay collection
("replace the old media with all my new ones", 2026-10-11).

| Path | Contents |
| --- | --- |
| `public/media/site50-r14/manifest.json` | Every published file with its source delivery, bytes and sha256; each take's round and sound |
| `public/media/site50-r14/archive.json` | The visual archive: the fifty frames, then each take's key moment and close portrait |
| `public/media/site50-r14/stills/` | Each take's key moment and close portrait at 1920×1080, 640×360 previews, the boot frame and one 4K frame |
| `public/media/site50-r14/loops/` | The 6 s loops the pages play (1920×1080 VP9 with sound, posters; 960×540 for the archive dialog) |
| `public/media/site50-r14/reels/` | The manual's twenty battle takes, 1280×720 with their sound |
| `public/media/site50-r14/frames/` | The fifty frames at 1920×1080 and 640×360, and five contact sheets of ten |
| `public/media/site50-r14/films/` | The trailer (1080p with its score) and the landing page's reel (five takes crossfaded, 1080p, silent) |
| `public/media/web-video-r1/` | The landing page's 960×540 mobile proxies, inside its nine-megabyte budget |

`tools/media-r5/site-media/picks.json` names the take for every slot: the landing page's hero, screenshot rail, loops,
mosaic, social cards and closing image; the manual's hero, trailer, chapter cards, battle takes, contact sheets and
topic figures; the game's featured stills, boot frame, 404 page, HUD editor backdrop and social-card sources.
`tools/media-r5/site-media.mjs` builds the collection from the round's deliveries,
`tools/media-r5/site-media-wire.mjs` wires the pages, the code and both catalogs to it, and
`tools/marketing-shots/site50-media.selftest.mjs` holds the collection to its receipt. Each take's scene is code in
`tools/media-r5/site50-shots/`, and `/docs/filming` records how the takes were made.

## Retired: showcase-r1 (until 2026-10-12)

The rest of this page records the previous library, `public/media/showcase-r1`, which the site fifty replaced. Its
files remain in the repository's history.

"""

def main():
    path = f'{ROOT}/docs/SHOWCASE-LIBRARY.md'
    text = open(path, encoding='utf-8').read()
    head = '# Showcase library\n\n'
    if not text.startswith(head) or '## Current: the site fifty' in text:
        raise SystemExit('docs/SHOWCASE-LIBRARY.md: unexpected opening (or already updated)')
    rest = re.sub(r'^## ', '### ', text[len(head):], flags=re.M)
    open(path, 'w', encoding='utf-8').write(head + CURRENT + rest)
    print('updated docs/SHOWCASE-LIBRARY.md')

    edit('docs/INDEX.md', [
        ('| [SHOWCASE-LIBRARY.md](SHOWCASE-LIBRARY.md) | Published 88-frame archive, admission contract, review sheets and rebuild procedure |',
         '| [SHOWCASE-LIBRARY.md](SHOWCASE-LIBRARY.md) | The site fifty, the published media since 2026-10-12, and the retired showcase-r1 library |'),
        ("""The current public presentation is image-led and sourced from a reproducible
88-frame archive: 13 owner-selected features, 60 approved 4K campaign frames,
five directed Studio keyframes, and ten deterministic interface captures. The
manifest lives at `../public/media/showcase-r1/manifest.json`; the landing page,
field manual, Tank Gallery, and Scene Studio share its filtering and inspection
component. Six published campaign contact sheets preserve the human
visual-review pass;""",
         """The current public presentation is sourced from the site fifty: fifty takes
rendered at 4K in the game engine with their sound, the fifty frames and the
films (`../public/media/site50-r14/`, picked in
`../tools/media-r5/site-media/picks.json`). The landing page, field manual and
Scene Studio share its archive (`archive.json`) through one filtering and
inspection component. Five contact sheets of the fifty frames preserve the
visual-review pass;"""),
    ])
    edit('docs/FEATURES.md', [
        ("""`public/media/showcase-r1/manifest.json` is the contract for the current
88-frame archive: 13 owner-selected features, 30 action compositions, 30
foreground compositions, five directed Studio keyframes, and ten live interface
states. The publisher also records six 2400×592 contact sheets that preserve the
human collection-review pass before 4K admission. Checked-in scene data, the
serialized capture harness, automated image grading, owner approval, and the
publisher keep the archive reproducible and prevent hand-curated imagery from
drifting away from the game.""",
         """`public/media/site50-r14/archive.json` is the contract for the current archive
(since 2026-10-12): the fifty frames, then the key moment and close portrait of
each of the site fifty's takes, all rendered at 4K in the game engine. Its
`manifest.json` records every published file with its source delivery, bytes
and sha256, and five 2400×540 contact sheets of the fifty frames preserve the
review pass. Each take's scene is checked-in code
(`tools/media-r5/site50-shots/`), so the archive stays reproducible and cannot
drift away from the game. The previous 88-frame showcase-r1 archive is retired
(docs/SHOWCASE-LIBRARY.md)."""),
    ])
    edit('docs/SCREENSHOT_CONTRACT.md', [
        ("""`public/media/showcase-r1/manifest.json` must report 13 owner picks, 30 action
frames, 30 foreground frames, five Studio frames, ten interface frames, 88 total
frames, six process sheets, and `firstPartyRuntimeOnly: true`. Landing, docs,
Gallery, and Studio consume that manifest through the shared media archive
component. Raw 4K PNGs remain local capture evidence; compressed WebP frames,
review sheets, and the manifest are shipped artifacts.""",
         """Since 2026-10-12 the published archive is the site fifty's:
`public/media/site50-r14/archive.json` lists the fifty frames and each take's key
moment and close portrait, and `manifest.json` records every file with its source
delivery, bytes and sha256 (`showcase:check` runs `site50-media.selftest`).
Landing, docs and Studio consume the archive through the shared media archive
component. The 4K masters and PNGs remain local delivery evidence; WebP stills,
previews, contact sheets and the manifests are the shipped artifacts. The
showcase-r1 contract below `showcase:publish` describes the retired library."""),
        ("""`public/media/feature-loops-r1/manifest.json` must report six passed loops and
zero failures.""",
         """The six feature loops (`public/media/feature-loops-r1`) were retired on
2026-10-12: the archive dialog now plays four of the site fifty's loops at
960×540 (`public/media/site50-r14/loops/<id>-960.webm`). The retired contract:
`public/media/feature-loops-r1/manifest.json` reported six passed loops and
zero failures."""),
    ])
    edit('docs/GALLERY.md', [
        ('component fetches `public/media/showcase-r1/manifest.json`, lazy-loads its\nWebP frames',
         'component fetches `public/media/site50-r14/archive.json` (the site fifty\'s\nframes and stills), lazy-loads its WebP previews'),
    ])

main()
