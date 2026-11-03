// What the geometry gate's page (tools/procedural-fidelity.html) loads from public/ in the changed-only gate step
// (2026-11-01, item 267).
//
// The page fetches each id's comparison oracle under /models, and the graft source a certificate seats in it: those are
// per-id inputs, keyed by the path and sha256 each record names (steps.mjs TABLES geometryGate `inputField`, its `graft`
// beside it), and the gate's server serves exactly the files the selected ids' registrations load (the page's
// __REFERENCE_FILES). Every other public file the page loads is listed here; the step keys it whole, and the server
// refuses anything else (tools/served-public.mjs: 403, and the run fails). Measured 2026-11-01: the gate on 8 ids with
// their oracles here and one without (t55a) made 9,744 requests, of public files only /brand/favicon.svg (the page's
// icon link) and each id's registered oracle; fonts is the material painter's directory, which the page's builders can
// fetch as the icons page's can (tools/icons-page-public.mjs).
export const GATE_PAGE_PUBLIC = Object.freeze({ dirs: ['fonts'], files: ['/brand/favicon.svg'] });
