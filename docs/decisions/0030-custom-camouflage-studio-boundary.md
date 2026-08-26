# ADR 0030: Custom camouflage authoring is an intent-loaded deep module

- Status: accepted
- Date: 2026-08-26

## Context

The Garage constructed the complete custom camouflage editor during pristine
boot. Players paid to parse its modal, drawing tools, clipboard workflow, and
stroke painter even when they never selected **Create your own**. The editor
also contributed hundreds of lines to the already broad Garage module.

## Decision

The custom camouflage studio owns its DOM, editing state, painter, and modal
behind one typed controller. Garage supplies the selected-vehicle and
persistence ports and loads the module only after pointer, focus, or click
intent. One retryable access owner shares concurrent transfers, retains the
resident editor, and forgets failures so a later click can recover without a
page reload.

## Consequences

- Pristine boot no longer parses or constructs the authoring surface.
- The settled editor and persisted pattern format remain unchanged.
- Garage owns selection and persistence policy; the studio owns authoring UI.
- Optional transfer failure cannot block the Garage or poison later retries.
- Future editor work is testable and navigable without expanding `garage.js`.

## Verification

    npm run typecheck
    node src/ui/customCamoStudioAccess.selftest.mjs
    node src/vehicles/camoPolicy.selftest.mjs
    npm run build

Production-build browser verification also asserts the editor chunk is absent
from pristine boot, transfers on intent, paints and applies a recipe, and
restores focus-safe modal state on close.
