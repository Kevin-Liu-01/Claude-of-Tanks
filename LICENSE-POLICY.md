# Claude of Tanks license policy

Copyright © 2026 Kevin B. Liu.

Claude of Tanks is **MIT-licensed by default, with expressly identified
proprietary content exceptions**. The root [`LICENSE`](LICENSE) contains the
unmodified MIT License and applies to first-party material except for the
Reserved Content below. Public availability does not place the exceptions
under MIT or grant permission beyond their separate license.

## MIT-licensed material

Except for Reserved Content and third-party material, the project's
first-party source code, tests, build tools, configuration, and general
engineering documentation are licensed under the root MIT License.

## Reserved Content

The following first-party paths are excluded from the root MIT grant and are
licensed only under
[`LICENSES/Proprietary-Content-License.txt`](LICENSES/Proprietary-Content-License.txt):

```text
src/vehicles/**
src/world/**
docs/critique/**
docs/geometry-gate/**
docs/references/**
docs/research/**
docs/images/**
docs/BUILD-STANDARD.md
docs/TANK-ASSET-PIPELINE.md
docs/VEHICLE-ROSTER.md
docs/SCREENSHOT_CONTRACT.md
docs/SHOWCASE-LIBRARY.md
docs/MARKETING-BATTLE-CAMPAIGN.md
public/audio/**
public/brand/**
public/fx/**
public/icons/**
public/maps/**
public/media/**
tools/marketing-shots/**
```

Reserved Content includes procedural vehicle geometry and profiles; vehicle
specifications, balance data, and calibrations; procedural battlefields,
terrain, structures, props, vegetation, wrecks, placement rules, and world
composition; fleet materials and markings; vehicle and map production records;
capture recipes; generated tank renders and technical diagrams; screenshots
and video; original audio and effects; and first-party branding. Substantially
identical copies and generated forms retain the same status wherever they
appear in the repository or a build artifact.

Third-party components inside a Reserved Content path remain under their own
licenses. This policy does not claim ownership of them.

## Third-party material

Third-party fonts, marks, libraries, shaders, reference material, props,
textures, and other external works retain their original licenses and
ownership. Their notices and paths are recorded in
[`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md), `docs/licenses/`, embedded
notices, and dependency metadata.

If a file carries a specific copyright or license notice, that notice controls
for that file to the extent it conflicts with this repository-level policy.

## Earlier revisions

Public revisions up to and including commit
`8f3dd548c1e78242f73d37c6b37797c7f9cdcb22` were published with all
first-party material under MIT. Those grants remain valid for copies received
under those terms and are not revoked. The historical text is preserved in
[`LICENSES/MIT-prior-revisions.txt`](LICENSES/MIT-prior-revisions.txt).

This exception policy applies to the revision in which it first appears and
later revisions. New Reserved Content and modifications are offered only under
the proprietary content license unless an individual notice says otherwise.

## Trademarks

The project name, logos, and product identity are not licensed for use as
trademarks. No license implies sponsorship or endorsement. Permission for any
use not granted by the applicable license must be obtained from the copyright
owner.
