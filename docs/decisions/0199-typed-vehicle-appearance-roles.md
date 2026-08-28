# 0199 — Vehicle appearance roles are strict TypeScript

Status: accepted

## Decision

`src/vehicles/appearanceAudit.ts` owns semantic material-role tagging, the
fixed neutral running-gear palette, appearance normalization, and release
issues for material-role violations.

The module accepts Three.js object and material contracts directly, preserves
the caller's material subtype when tagging it, and treats color support as a
validated capability. Builders and painters name roles; they do not duplicate
the rules for which roles may be recolored or used on armor.

## Why

Geometry ownership and paint ownership are different. Track steel, pads,
rubber, painted wheel dishes, guards, skirts, and armor can share a model
hierarchy while requiring different finish rules. An unchecked policy seam can
quietly repaint armor or let camouflage leak into working gear across every
vehicle family.

## Consequences

- The existing palette values and normalization order are unchanged.
- Materials without a color channel remain valid and are skipped explicitly.
- Appearance issue codes and their color evidence have a stable typed result.
- The factory, material painter, Patton family, icon tool, and release test all
  consume the same strict policy module.
