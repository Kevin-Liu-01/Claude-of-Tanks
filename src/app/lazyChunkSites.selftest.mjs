// lazyChunkSites.selftest.mjs — the lazy chunks the 2026-11-02 audit (R6, F2) named, and every hand-made memo that kept
// a failed chunk for the session, are held in app/lazyChunk.ts; no new chunk is memoized by hand (`x ??= import(...)`
// or `x = import(...)`, which keeps a rejection for the session, or a memo nulled on failure, which asks a styled chunk
// again); and a default-policy load of several parts settles them all (importAll), so a module's failure never hides
// its stylesheet's. Copyright © 2026 Kevin B. Liu.
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

/** `source` with its comments blanked and its strings kept (the blanking components/loadFailure.selftest.mjs does). */
function blankComments(source) {
  const out = source.split('');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      const end = source[i + 1] === '/' ? (source.indexOf('\n', i) + 1 || source.length) - 1 : source.indexOf('*/', i) + 2;
      for (let j = i; j < end; j++) if (out[j] !== '\n') out[j] = ' ';
      i = end - 1;
    } else if (c === "'" || c === '"' || c === '`') {
      for (i++; i < source.length && source[i] !== c; i++) if (source[i] === '\\') i++;
    }
  }
  return out.join('');
}

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
  ['src/ui/hud.ts', ["createLazyChunk(() => import('./battleNotices.ts')", "createLazyChunk(() => import('./provingRangeCard.ts')"],
    [/\baimNoticePort\s*\?\?=/, /\brangeCardLoad\b/]],
  ['src/ui/garage.ts', ["createLazyChunk(() => import('./fleetTakes.ts'))", '{ opener: true }', "createLazyChunk(() => import('./equipmentPreview.ts')",
    "createLazyChunk(() => import('./battleArrangementPanel.ts')", "createLazyChunk(() => importAll([import('./deploy.css'), import('./deployScreen.ts')])",
    "createLazyChunk(() => importAll([import('./modePicker.ts'), import('./pickerText.ts')])"],
    [/\bphotoMode\s*\?\?=/, /\bfacetPanel\s*\?\?=/, /\bhotspotsLoading\b/, /\bdeployFieldLoad\b/, /\bdeployModesLoad\b/, /\bquickLoad\b/,
      /\barrangementPanelLoad\b/, /\bequipmentPreviewLoad\b/, /\bdeployStyles\s*\?\?=/]],
  ['src/ui/battleLoad.ts', ["createLazyChunk(() => import('./mapLqip.ts')", "createLazyChunk(() => importAll([import('./heroCard.ts'), import('./heroCard.css')])"],
    [/\bmapLqipLoad\b/, /\bheroCards\s*\?\?=/]],
  ['src/ui/camoSwatchAccess.ts', ['createLazyChunk(load)'], [/\bpending\s*=\s*null\b/]],
  ['src/ui/battleHudAccess.ts', ['createLazyChunk(() => importAll([', "importAll([import('./hud.ts'), import('./aerialHud.css')])"], [/\bpending\s*=\s*null\b/]],
  ['src/ui/accessibilitySettings.ts', ["createLazyChunk(() => import('./accessibilityMotion.ts'))"], [/void import\('\.\/accessibilityMotion\.ts'\)/]],
  ['src/gallery/gallery.ts', ["createLazyChunk((): Promise<AnatomyModule> => import('./anatomyView.ts'), { opener: true })", 'createLazyChunk(() => import(\'./inAction.ts\')',
    "createLazyChunk(() => import('../ui/components/notice.ts')"],
    [/\banatomyModule\s*\?\?=/, /\binActionLoad\s*\?\?=/, /\bdamageLabModule\s*=\s*null\b/, /\bnoticeKit\s*\?\?=/]],
  // (review round 1) the hand-made memos that kept a failed chunk for the session, and the two loaders ensureTankBuilder
  // awaits beside the fleet's kit, groups and fills
  ['src/ui/battleNotices.ts', ["createLazyChunk(() => import('./components/notice.ts')"], [/\bkit\s*\?\?=/]],
  ['src/game/pointerLockFeedbackRuntime.ts', ["createLazyChunk(() => import('../ui/battleNotices.ts')"], [/\bregionPort\s*\?\?=/]],
  ['src/ui/medalToast.ts', ["createLazyChunk(() => import('./components/notice.ts')"], [/\bloading\s*\?\?=/]],
  ['src/main.ts', ["createLazyChunk(() => import('./game/studioLightRuntime.ts')", '}), { opener: true });'], [/\bstudioLightRuntime\s*\?\?=\s*import\(/]],
  ['src/ui/studioPanel.ts', ["createLazyChunk(() => importAll([import('./camoSwatchPainter.ts'), import('../vehicles/specs.ts')])"], [/\bswatchPainter\s*\?\?=/]],
  ['src/ui/battlefieldPicker.ts', ["createLazyChunk(() => import('./deployObjectives.ts'))"], [/\bdrawer\s*\?\?=/]],
  ['src/ui/deployScreen.ts', ["createLazyChunk(() => import('./deployObjectives.ts'))"], [/\bdrawer\s*\?\?=/]],
  ['src/engine/lighting.ts', ["createLazyChunk((): Promise<CasterProxyModule> => import('./shadowCasterProxies.ts'))"], [/\bcasterProxiesLoad\s*\?\?=/]],
  ['src/vehicles/vehicleMarkingSeatLoader.ts', ['createLazyChunk(() => load()'], [/\bpendingGroups\b/, /\breadyGroups\b/]],
  ['src/vehicles/combatAnatomyCalibrationLoader.ts', ['createLazyChunk(() => load()'], [/\bpendingGroups\b/, /\breadyGroups\b/]],
];
const offenders = [];
for (const [file, present, absent] of SITES) {
  const source = read(file);
  for (const text of present) if (!source.includes(text)) offenders.push(`${file}: lacks ${text}`);
  for (const pattern of absent) if (pattern.test(source)) offenders.push(`${file}: still has ${pattern}`);
}
assert.deepEqual(offenders, [], `a named lazy chunk is not on app/lazyChunk.ts:\n  ${offenders.join('\n  ')}`);

// ---- the ratchet: a hand-made memo of a chunk (`x ??= import(...)`, `x = import(...)`) is one of these, which predate
// the policy and belong to other owners; a new chunk takes createLazyChunk (a module failure is asked again, a
// stylesheet never). Each is the policy already, or outside the pages that boot it:
const KNOWN = new Set([
  // a memo nulled on failure: asked again by the next call (the policy's re-ask, without its backoff)
  'src/engine/cloudPresets.ts cloudscapeLoad', 'src/engine/earthLandAccess.ts earthLandLoad', 'src/engine/lightModelCore.ts groundedLoad',
  'src/game/gunshipVisual.ts loading', 'src/main.ts battleEndGarageWarmLoad', 'src/ui/garageConsumables.ts smokeLoad',
  'src/vehicles/wreckTurretDriverLoader.ts loading', // (its selftest pins "imports nothing but types")
  // a stylesheet alone: kept for the document, the policy's rule for a failed stylesheet (asked again it never applies)
  'src/ui/technicalDiagramLabels.ts sheet', 'src/ui/technicalDrawing.ts sheet',
  // pages that do not boot app/lazyChunk.ts (it rides the game, cn and Gallery boot chunk, vite.config.ts
  // turretSeatPlane): the docs' archive and takes, and the icon sprite every page's boot runtime holds (nulled on
  // failure); holding them in lazyChunk would add a boot request there (Main's 253 ruling)
  'src/docs/docs.ts archiveMountPromise', 'src/docs/docs.ts archiveMotionPromise', 'src/docs/referenceTakes.ts fleetTakes',
  'src/ui/icons/icon.ts fullSprite',
  // the sky's HDRI experiment (HDRI_ENV_URL is null: never called)
  'src/engine/sky.ts hdriPromise',
]);
const found = new Set();
const multipart = [];
/** The index just past the bracket that closes the one opening at `open` (comments blanked; strings skipped). */
const closeOf = (source, open) => {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [pairs[source[open]]];
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') { for (i++; i < source.length && source[i] !== c; i++) if (source[i] === '\\') i++; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) { stack.pop(); if (!stack.length) return i + 1; }
  }
  return source.length;
};
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) && !path.endsWith(join('src', 'app', 'lazyChunk.ts'))) {
      const source = blankComments(readFileSync(path, 'utf8'));
      const file = relative(ROOT, path);
      for (const match of source.matchAll(/\b(\w+)\s*\?\?=\s*\(?\s*(?:Promise\.all\(\[\s*)?import\(/g)) found.add(`${file} ${match[1]}`);
      for (const match of source.matchAll(/(?<!\b(?:const|let|var)\s+)(?<![.\w?])(\w+)\s*=\s*\(?\s*(?:Promise\.all\(\[\s*)?import\(/g)) found.add(`${file} ${match[1]}`);
      // a default-policy chunk of several parts settles them all: Promise.all keeps whichever rejection came first
      for (const match of source.matchAll(/\bcreateLazyChunk\(/g)) {
        const open = match.index + match[0].length - 1;
        const call = source.slice(open, closeOf(source, open));
        if (/\bPromise\.all\(\s*\[/.test(call) && !/\bopener:\s*true\b/.test(call)) {
          multipart.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
        }
      }
    }
  }
};
walk(join(ROOT, 'src'));
assert.deepEqual(multipart, [], `a lazy chunk of several parts settles them with importAll (app/lazyChunk.ts), so a module's failure never hides its stylesheet's:\n  ${multipart.join('\n  ')}`);
const fresh = [...found].filter((site) => !KNOWN.has(site));
assert.deepEqual(fresh, [], `a lazy chunk memoized by hand (hold it in app/lazyChunk.ts createLazyChunk):\n  ${fresh.join('\n  ')}`);
const gone = [...KNOWN].filter((site) => !found.has(site));
if (gone.length) console.log(`lazyChunkSites.selftest: moved off the known list (drop them from KNOWN): ${gone.join(', ')}`);
console.log(`lazyChunkSites.selftest: ${SITES.length} sites on app/lazyChunk.ts, their loads of several parts settled by importAll; ${found.size} older hand-made memos (the policy already, or off its pages), no new one`);
