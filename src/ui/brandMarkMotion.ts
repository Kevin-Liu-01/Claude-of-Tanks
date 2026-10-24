/**
 * The living mark (owner, 2026-10-24: "an animated version where hes rolling along with each bit chugging"): the
 * commander's tank in an idle loop. The tracks run (the top run forward, the ground run back), the road wheels turn, the
 * hull bobs on its suspension, the turret and bustle rock a beat behind it, the commander and his helmet bounce a touch
 * after that, the antenna sways and a little exhaust puffs from the rear deck. Copyright © 2026 Kevin B. Liu.
 *
 * It is the static mark's own drawing (brandMark.ts) with three additions the motion needs: spokes in the wheels, the
 * track's links and the exhaust. One loop of LOOP_S seconds closes on itself: the links move a whole number of their
 * pitches and the wheels a whole number of spoke steps. Under reduced motion it is the static frame. It loads only where
 * a surface shows it (the boot card inlines its copy through tools/sync-brand-marks.mjs).
 */
import { BRAND_TANK_ASPECT, BRAND_TANK_VIEWBOX, ROAD_WHEELS, brandTankBody } from './brandMark.ts';

/** The loop, in seconds, and the ground it covers per loop in the mark's units. */
const LOOP_S = 1.2;
const WHEEL_R = 5.4;
/** 240° of wheel per loop: two steps of the three spokes, so the loop closes. */
const TRAVEL = (240 / 360) * 2 * Math.PI * WHEEL_R;
/** Four link pitches per loop. */
const PITCH = TRAVEL / 4;

// each wheel's box is its full circle (unpainted), so it turns about its own centre however the mark is placed
const spokes = ROAD_WHEELS.map(([x, y]) => `<g class="mk-wheel"><circle cx="${x}" cy="${y}" r="${WHEEL_R}" fill="none"/>`
  + `<circle cx="${x}" cy="${y}" r="1.7"/>${[0, 120, 240].map((angle) => `<rect x="${x - 0.55}" y="${y - WHEEL_R}" width="1.1" height="${WHEEL_R}" `
    + `transform="rotate(${angle} ${x} ${y})"/>`).join('')}</g>`).join('');
// the links show as notches cut in the track's two straight runs, in the ground's colour
const links = (run: 'top' | 'low', y: number): string => `<path class="mk-links mk-links--${run}" d="M50 ${y}H176" fill="none" `
  + `stroke="var(--mk-ground, #0b0e11)" stroke-width="1.5" stroke-dasharray="${(PITCH * 0.42).toFixed(2)} ${(PITCH * 0.58).toFixed(2)}"/>`;
const puffs = [0, 1, 2].map((index) => `<circle class="mk-puff" style="animation-delay:${(-index * LOOP_S / 3).toFixed(2)}s" cx="37" cy="101" r="1.6"/>`).join('');

/** The living mark, `height` px tall: the tank in the host's ink, the commander in the accent, its ground behind it. */
export function brandMarkMotionSVG(height: number, ink = 'currentColor', accent = 'var(--accent)'): string {
  const body = brandTankBody({ ink, accent })
    .replace('</g><g class="mk-hull">', `${links('top', 120.4)}${links('low', 136.6)}<g fill="${ink}">${spokes}</g></g><g class="mk-hull">`)
    .replace('<g class="mk-exhaust"></g>', `<g class="mk-exhaust" fill="${ink}">${puffs}</g>`);
  return `<svg class="cot-mark cot-mark--motion" viewBox="${BRAND_TANK_VIEWBOX}" width="${Math.round(height * BRAND_TANK_ASPECT)}" `
    + `height="${height}" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** The loop's rules (scoped to .cot-mark--motion; the boot card inlines them, a surface adds them with its sheet). */
export const BRAND_MOTION_CSS = `
.cot-mark--motion{--mk-loop:${LOOP_S}s;overflow:visible}
.cot-mark--motion :is(.mk-hull,.mk-turret,.mk-crew,.mk-antenna,.mk-puff){transform-box:view-box}
.cot-mark--motion .mk-wheel{transform-box:fill-box;transform-origin:50% 50%;animation:mk-turn var(--mk-loop) linear infinite}
.cot-mark--motion .mk-links--top{animation:mk-links-top var(--mk-loop) linear infinite}
.cot-mark--motion .mk-links--low{animation:mk-links-low var(--mk-loop) linear infinite}
.cot-mark--motion .mk-hull{animation:mk-bob calc(var(--mk-loop) / 2) ease-in-out infinite}
.cot-mark--motion .mk-turret{transform-origin:105px 93px;animation:mk-rock calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.38) infinite}
.cot-mark--motion .mk-crew{animation:mk-bounce calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.3) infinite}
.cot-mark--motion .mk-antenna{transform-origin:64px 76px;animation:mk-sway calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.26) infinite}
.cot-mark--motion .mk-puff{transform-origin:37px 101px;opacity:0;animation:mk-puff var(--mk-loop) ease-out infinite}
@keyframes mk-turn{to{transform:rotate(240deg)}}
@keyframes mk-links-top{from{stroke-dashoffset:${PITCH.toFixed(3)}}to{stroke-dashoffset:0}}
@keyframes mk-links-low{from{stroke-dashoffset:0}to{stroke-dashoffset:${PITCH.toFixed(3)}}}
@keyframes mk-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-0.9px)}}
@keyframes mk-rock{0%,100%{transform:rotate(-0.55deg)}50%{transform:rotate(0.55deg)}}
@keyframes mk-bounce{0%,100%{transform:translateY(0)}45%{transform:translateY(-1.1px)}}
@keyframes mk-sway{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-5deg)}}
@keyframes mk-puff{0%{opacity:.5;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(-11px,-5px) scale(3.2)}}
@media (prefers-reduced-motion:reduce){.cot-mark--motion :is(.mk-wheel,.mk-links,.mk-hull,.mk-turret,.mk-crew,.mk-antenna,.mk-puff){animation:none}
  .cot-mark--motion .mk-puff{display:none}}
`;
