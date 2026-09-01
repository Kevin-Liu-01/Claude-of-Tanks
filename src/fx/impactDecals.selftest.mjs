import {
  IMPACT_DECAL_CAP, IMPACT_DECAL_LIFT_M, impactDecalDescriptor,
} from './impactDecals.ts';
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
// owner. Impact decals therefore need one event owner: effects.ts. If the
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

const effectsSource = await readFile(new URL('./effects.ts', import.meta.url), 'utf8');
if (!/onFxEvent\(bus, 'shell:hit',[\s\S]{0,1800}impactDecals\.stampFromEvent\(e, ent\)/.test(effectsSource)) {
  throw new Error('authoritative shell:hit impact-decal ownership left effects.ts');
}

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
if (!/createFx\(engineCtx, hfProxy, \{[\s\S]{0,320}resolveEntity:[\s\S]{0,120}resolveFxSubject/.test(mainSource)) {
  throw new Error('production FX must resolve struck solo, network, and player-owned tanks');
}
if (!/const resolved = resolveEntity\?\.\(targetId\);[\s\S]{0,100}isDecalEntity\(resolved\)/.test(effectsSource)) {
  throw new Error('impact decals must prefer the injected production entity resolver');
}

const pen = impactDecalDescriptor('pen');
const critical = impactDecalDescriptor('pen', true);
const ricochet = impactDecalDescriptor('ricochet');
const nonpen = impactDecalDescriptor('nonpen');
const spaced = impactDecalDescriptor('spaced_absorb');
const splash = impactDecalDescriptor('he_splash');
if (!pen?.hasHole || !critical?.hasHole) {
  throw new Error('penetrating hits must retain a visible entry hole');
}
for (const [label, mark] of [['ricochet', ricochet], ['nonpen', nonpen],
  ['spaced absorb', spaced], ['HE splash', splash]]) {
  if (!mark || mark.hasHole) throw new Error(`${label} must use a no-hole surface mark`);
}
if (ricochet.family !== 'gouge' || nonpen.family !== 'scuff'
    || spaced.family !== 'scuff' || splash.family !== 'scorch') {
  throw new Error('resolved hit outcomes lost their distinct decal families');
}
if (pen.variants < 4 || ricochet.variants < 4 || nonpen.variants < 3) {
  throw new Error('impact decal atlas no longer provides enough per-outcome variation');
}

console.log('impactDecals.selftest: production ownership and outcome-specific scars passed');
