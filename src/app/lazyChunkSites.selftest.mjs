// lazyChunkSites.selftest.mjs — the lazy chunks the 2026-11-02 audit (R6, F2) named are held in app/lazyChunk.ts, and
// no new chunk is memoized by hand (`x ??= import(...)`, which keeps a rejection for the session, or a memo nulled on
// failure, which asks a styled chunk again). Copyright © 2026 Kevin B. Liu.
//
// The audit found at least five failure policies: cached forever (the interior fills, the deferred combat warm, the
// mission attachments, the turret ring, the HUD's aim notice, the prebuild latch), asked again from a nulled memo (the
// Garage's photo mode, facets, hotspots, Deploy pickers and fleet takes, the map placeholders, the camo swatches, the
// battle HUD bundle, the motion override, the Gallery's labs), and never asked again (the kit's openers). Each named
// site now holds its chunk in createLazyChunk (openers with `opener: true` and the kit's reload); the behaviour is
// proved in lazyChunk.selftest.mjs, builderLoadFailure.selftest.mjs and battleEntryLoadFailure.selftest.mjs, and the
// openers' reload in components/loadFailure.selftest.mjs. This reads the sources.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from '../ui/components/loadFailure.selftest.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => blankComments(readFileSync(join(ROOT, file), 'utf8'));

// ---- the named sites: each holds its chunk in createLazyChunk, and its old hand-made state is gone
const SITES = [
  ['src/vehicles/interiorFills.ts', ['createLazyChunk('], [/\bpendingGroups\b/, /\bloadedGroups\b/]],
  ['src/vehicles/fleetFactory.ts', ['createLazyChunk(', "createLazyChunk(() => import('./ridingPartsPrebuild.ts'))", "createLazyChunk(() => import('./decorPlanClient.ts'))", 'isInteriorFillsReady(specId)'],
    [/\bridingPartsPrebuildAsked\b/, /\bfactoryReadyPromise\b/, /\bgroupPromises\b/]],
  ['src/vehicles/turretRingLoader.ts', ['createLazyChunk('], [/\bloading\s*\?\?=/]],
  ['src/app/combatWarmComposition.ts', ["createLazyChunk(() => import('../game/deferredCombatWarmRuntime.ts'))"], [/\bdeferredModule\s*\?\?=/]],
  ['src/game/battlePresentationRuntime.ts', ["createLazyChunk(() => import('./missionAttachmentVisual.ts')"], [/\bmissionAttachmentVisualLoad\b/]],
  ['src/ui/hud.ts', ["createLazyChunk(() => import('./battleNotices.ts')"], [/\baimNoticePort\s*\?\?=/]],
  ['src/ui/garage.ts', ["createLazyChunk(() => import('./fleetTakes.ts'))", '{ opener: true }'],
    [/\bphotoMode\s*\?\?=/, /\bfacetPanel\s*\?\?=/, /\bhotspotsLoading\b/, /\bdeployFieldLoad\b/, /\bdeployModesLoad\b/, /\bquickLoad\b/]],
  ['src/ui/battleLoad.ts', ["createLazyChunk(() => import('./mapLqip.ts')"], [/\bmapLqipLoad\b/]],
  ['src/ui/camoSwatchAccess.ts', ['createLazyChunk(load)'], [/\bpending\s*=\s*null\b/]],
  ['src/ui/battleHudAccess.ts', ['createLazyChunk('], [/\bpending\s*=\s*null\b/]],
  ['src/ui/accessibilitySettings.ts', ["createLazyChunk(() => import('./accessibilityMotion.ts'))"], [/void import\('\.\/accessibilityMotion\.ts'\)/]],
  ['src/gallery/gallery.ts', ["createLazyChunk((): Promise<AnatomyModule> => import('./anatomyView.ts'), { opener: true })", 'createLazyChunk(() => import(\'./inAction.ts\')'],
    [/\banatomyModule\s*\?\?=/, /\binActionLoad\s*\?\?=/, /\bdamageLabModule\s*=\s*null\b/]],
];
const offenders = [];
for (const [file, present, absent] of SITES) {
  const source = read(file);
  for (const text of present) if (!source.includes(text)) offenders.push(`${file}: lacks ${text}`);
  for (const pattern of absent) if (pattern.test(source)) offenders.push(`${file}: still has ${pattern}`);
}
assert.deepEqual(offenders, [], `a named lazy chunk is not on app/lazyChunk.ts:\n  ${offenders.join('\n  ')}`);

// ---- the ratchet: a hand-made memo of a chunk (`x ??= import(...)`) is one of these, which predate the policy and
// belong to other owners; a new chunk takes createLazyChunk (a module failure is asked again, a stylesheet never)
const KNOWN = new Set([
  'src/docs/docs.ts archiveMountPromise', 'src/docs/docs.ts archiveMotionPromise', 'src/docs/referenceTakes.ts fleetTakes', 'src/engine/cloudPresets.ts cloudscapeLoad',
  'src/engine/earthLandAccess.ts earthLandLoad', 'src/engine/lightModelCore.ts groundedLoad', 'src/engine/lighting.ts casterProxiesLoad',
  'src/gallery/gallery.ts noticeKit', 'src/game/gunshipVisual.ts loading', 'src/game/pointerLockFeedbackRuntime.ts regionPort',
  'src/main.ts battleEndGarageWarmLoad', 'src/main.ts studioLightRuntime', 'src/ui/battleLoad.ts heroCards',
  'src/ui/battleNotices.ts kit', 'src/ui/battlefieldPicker.ts drawer', 'src/ui/deployScreen.ts drawer',
  'src/ui/garage.ts arrangementPanelLoad', 'src/ui/garage.ts deployStyles', 'src/ui/garage.ts equipmentPreviewLoad',
  'src/ui/garageConsumables.ts smokeLoad', 'src/ui/hud.ts rangeCardLoad', 'src/ui/icons/icon.ts fullSprite',
  'src/ui/medalToast.ts loading', 'src/ui/studioPanel.ts swatchPainter', 'src/ui/technicalDiagramLabels.ts sheet',
  'src/ui/technicalDrawing.ts sheet', 'src/vehicles/wreckTurretDriverLoader.ts loading',
]);
const found = new Set();
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      const source = blankComments(readFileSync(path, 'utf8'));
      for (const match of source.matchAll(/\b(\w+)\s*\?\?=\s*\(?\s*(?:Promise\.all\(\[\s*)?import\(/g)) found.add(`${relative(ROOT, path)} ${match[1]}`);
    }
  }
};
walk(join(ROOT, 'src'));
const fresh = [...found].filter((site) => !KNOWN.has(site));
assert.deepEqual(fresh, [], `a lazy chunk memoized by hand (hold it in app/lazyChunk.ts createLazyChunk):\n  ${fresh.join('\n  ')}`);
const gone = [...KNOWN].filter((site) => !found.has(site));
if (gone.length) console.log(`lazyChunkSites.selftest: moved off the known list (drop them from KNOWN): ${gone.join(', ')}`);
console.log(`lazyChunkSites.selftest: ${SITES.length} named sites on app/lazyChunk.ts; ${found.size} older hand-made memos, no new one`);
