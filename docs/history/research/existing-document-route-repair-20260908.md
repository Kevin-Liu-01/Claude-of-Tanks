# Existing document routing repair — 2026-09-08

Status: isolated and post-integration checkpoint checks passed.
This is a routing repair needed to
finish fleet release verification, not a tank geometry or performance pass.

The public not-found middleware on `d17d8adfa` rewrote every non-API HTML
request outside its pretty-route list to `/404.html`, even when that request
named an existing file. An observed native Burlak release audit received HTTP
404 for `/tools/track-duplicate-audit.html` and then timed out waiting for its
JavaScript readiness signal. Direct `/gallery.html` requests were also affected.

The repair permits actual HTML files confined to the serving document root:
the project directory in development and the built output in preview. It
does not infer existence from an extension. Directory targets, missing files,
path traversal and symlinks escaping the root do not bypass the fallback.
Explicit `/404.html` requests keep HTTP404. Existing pretty routes are unchanged.

Regression coverage uses the real Vite configuration and actual development
and preview HTTP responses, plus temporary path-confinement fixtures. The
maintained native track audit separately checks page execution and readiness.
Source models and local QA outputs are not included in this checkpoint.

Retained unsuccessful attempts:

- `.qa-dev/route-checkpoint-QQ3omP/`: the page correctly returned HTTP200, but
  the first HTML-body assertion incorrectly expected inline JavaScript which
  Vite extracts into a module. The assertion now checks the actual page title;
  native readiness remains a separate required test.
- `.qa-dev/route-checkpoint-v0g5NR/`: actual development/preview HTTP checks
  passed on unchanged inputs. The owner stopped the queued next phase before
  it started, then grouped the five short checks under the existing bounded,
  fair selftest runner. This interrupted run is not a complete checkpoint.

Final verification runs the bounded five-test suite, typecheck, public build
and native track audit for `t90a_burlak_x`, `merkava3d_x` and `merkava4_x`.
All passed against unchanged authored inputs in
`.qa-dev/route-checkpoint-S1eSsS/receipt.json` on base `d17d8adfa`:

- Real development/preview routing, existing not-found and public navigation
  contracts, test discovery and1943-module import integrity: five tests PASS.
- Typecheck/core-unused and public build PASS; public registry174 playables,
  zero GLB-sourced vehicles. Existing bundle-size warnings remain.
- Native maintained track audit:3/3 tanks load and retain one integrated
  animated shoe layer, with no duplicate full-length proxies.

The subsequent multiplayer-only `fcbcc961a` was integrated. All four phases
passed again on `90e8b9fd3f2a79027ec27c44d42b739b4b9c7f33`, completed
2026-09-08 20:57:20 UTC, with every authored source/config input unchanged.
The post-integration discovery/import counts are809 checks and1946 modules.
The private receipt is `.qa-dev/route-checkpoint-IDjubS/receipt.json`, SHA256
`db275f6b77d8dab3ff92da4d60dd7e7d7eee5a61b659d832c0945a7a45b9da7e`.
No tank geometry was changed or certified by this routing checkpoint.
