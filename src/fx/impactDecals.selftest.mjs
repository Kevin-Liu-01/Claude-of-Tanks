import { IMPACT_DECAL_CAP, IMPACT_DECAL_LIFT_M } from './impactDecals.js';
import { SURFACE_MARKING_STYLE } from '../vehicles/vehicleMarkings.ts';
import { readFile } from 'node:fs/promises';
import './lazyRuntime.selftest.mjs';

if (IMPACT_DECAL_CAP < 16) throw new Error('impact decal vehicle budget regressed');
if (IMPACT_DECAL_LIFT_M <= 0 || IMPACT_DECAL_LIFT_M > 0.01) {
  throw new Error(`impact decals must sit within 10 mm of armor (${IMPACT_DECAL_LIFT_M} m)`);
}
if (IMPACT_DECAL_LIFT_M !== SURFACE_MARKING_STYLE.surfaceLiftM) {
  throw new Error('impact scars and painted designations must share one surface-layer contract');
}

// The lazy FX runtime subscribes after the always-live typed combat-feedback
// owner. Impact decals therefore need one event owner: effects.js. If the
// feedback listener also calls the legacy direct API, every penetration gets
// one hull-local mark followed by a second authoritative articulation-local
// mark from the same shell:hit dispatch.
const feedbackSource = await readFile(
  new URL('../game/combatFeedbackRuntime.ts', import.meta.url), 'utf8',
);
const shellHitStart = feedbackSource.indexOf("listen('shell:hit'");
const shellHitEnd = feedbackSource.indexOf("listen('shell:fired'", shellHitStart);
if (shellHitStart < 0 || shellHitEnd < 0) {
  throw new Error('battle shell:hit presentation listener is missing');
}
const shellHitListener = feedbackSource.slice(shellHitStart, shellHitEnd);
if (shellHitListener.includes('.armorScar(')) {
  throw new Error('battle shell:hit must not stamp a second legacy impact decal');
}

const effectsSource = await readFile(new URL('./effects.js', import.meta.url), 'utf8');
if (!/bus\.on\('shell:hit',[\s\S]{0,1800}impactDecals\.stampFromEvent\(e, ent\)/.test(effectsSource)) {
  throw new Error('authoritative shell:hit impact-decal ownership left effects.js');
}

console.log('impactDecals.selftest: one authoritative decal owner per shell hit passed');
