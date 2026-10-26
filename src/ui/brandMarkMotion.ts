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
import { BRAND_TANK_ASPECT, BRAND_TANK_VIEWBOX, ROAD_WHEELS, brandTankBody, brandTankParts } from './brandMark.ts';

/** The loop, in seconds, and the ground it covers per loop in the mark's units. */
export const LOOP_S = 1.2;
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

// ---------------------------------------------------------------------------------------------------------------------
// The living mark as compositor layers (2026-10-26, the boot census; owner: "even the claude tank animation doesnt play bc
// its just loading"). The svg above moves its groups with CSS transforms and a stroke-dashoffset on svg children, which
// Chrome never runs on the compositor: every frame of it is main-thread style and paint, so each long task of a cold load
// froze the tank. Here every moving group is its own HTML box over the same drawing, moved by transform and opacity
// alone, which the compositor runs whatever the main thread is doing. The same parts, origins, travel and timing as the
// svg's loop (its ground's units become percentages of each box), so the two draw the same frames.
const [VB_X, VB_Y, VB_W, VB_H] = BRAND_TANK_VIEWBOX.split(' ').map(Number);
const pct = (n: number): string => `${Number(n.toFixed(4))}%`;
/** A box over the mark's region [x, x + w] x [y, y + h], in its units. */
const box = (x: number, y: number, w: number, h: number): string =>
  `left:${pct((x - VB_X) / VB_W * 100)};top:${pct((y - VB_Y) / VB_H * 100)};width:${pct(w / VB_W * 100)};height:${pct(h / VB_H * 100)}`;
const layer = (body: string, viewBox = BRAND_TANK_VIEWBOX, extra = ''): string =>
  `<svg class="mk-l" viewBox="${viewBox}"${extra} aria-hidden="true" focusable="false">${body}</svg>`;
const PUFF_R = 1.6;
const LINK_W = 1.5;
/** A run's notches in a clip over the run alone, a pitch longer each way, slid a pitch per loop: the dashoffset's path. */
const linkClip = (run: 'top' | 'low', y: number): string => `<span class="mk-clip" style="${box(50, y - LINK_W / 2, 126, LINK_W)}">`
  + `<span class="mk-g mk-links--${run}">${layer(`<path d="M${(50 - PITCH).toFixed(3)} ${y}H${(176 + PITCH).toFixed(3)}" fill="none" `
    + `stroke="var(--mk-ground, #0b0e11)" stroke-width="${LINK_W}" stroke-dasharray="${(PITCH * 0.42).toFixed(2)} ${(PITCH * 0.58).toFixed(2)}"/>`,
    `50 ${y - LINK_W / 2} 126 ${LINK_W}`, ' preserveAspectRatio="none"')}</span></span>`;

/** The living mark as layers (the host gives the box its width; its height follows): the tank in the host's ink, the
 *  commander in the accent. */
export function brandMarkMotionLayers(ink = 'currentColor', accent = 'var(--accent)'): string {
  const parts = brandTankParts({ ink, accent });
  const wheels = ROAD_WHEELS.map(([x, y]) => `<span class="mk-wheel" style="${box(x - WHEEL_R, y - WHEEL_R, 2 * WHEEL_R, 2 * WHEEL_R)}">`
    + layer(`<g fill="${ink}"><circle cx="${x}" cy="${y}" r="1.7"/>${[0, 120, 240].map((angle) => `<rect x="${x - 0.55}" y="${y - WHEEL_R}" `
      + `width="1.1" height="${WHEEL_R}" transform="rotate(${angle} ${x} ${y})"/>`).join('')}</g>`, `${x - WHEEL_R} ${y - WHEEL_R} ${2 * WHEEL_R} ${2 * WHEEL_R}`)
    + '</span>').join('');
  const puffs = [0, 1, 2].map((index) => `<span class="mk-puff" style="${box(37 - PUFF_R, 101 - PUFF_R, 2 * PUFF_R, 2 * PUFF_R)};`
    + `animation-delay:${(-index * LOOP_S / 3).toFixed(2)}s">${layer(`<circle fill="${ink}" cx="37" cy="101" r="${PUFF_R}"/>`,
      `${37 - PUFF_R} ${101 - PUFF_R} ${2 * PUFF_R} ${2 * PUFF_R}`)}</span>`).join('');
  return `<span class="cot-mark cot-mark--layers" aria-hidden="true">${layer(`<g fill="${ink}">${parts.run}</g>`)}`
    + `${linkClip('top', 120.4)}${linkClip('low', 136.6)}${wheels}`
    + `<span class="mk-g mk-hull">${puffs}${layer(parts.hull)}<span class="mk-g mk-turret">${layer(parts.turret)}`
    + `<span class="mk-g mk-antenna">${layer(parts.antenna)}</span><span class="mk-g mk-crew">${layer(parts.crew)}</span>`
    + `${layer(parts.front)}</span></span></span>`;
}

/** The layers' rules: the svg loop's keyframes with its ground's units as percentages of each moving box. */
const origin = (x: number, y: number): string => `${pct((x - VB_X) / VB_W * 100)} ${pct((y - VB_Y) / VB_H * 100)}`;
export const BRAND_MOTION_LAYER_CSS = `
.cot-mark--layers{--mk-loop:${LOOP_S}s;position:relative;display:block;aspect-ratio:${VB_W}/${VB_H}}
.cot-mark--layers :is(.mk-g,.mk-l){position:absolute;inset:0;display:block;width:100%;height:100%;overflow:visible}
.cot-mark--layers :is(.mk-clip,.mk-wheel,.mk-puff){position:absolute;display:block}
.cot-mark--layers .mk-clip{overflow:hidden}
.cot-mark--layers .mk-wheel{animation:mkl-turn var(--mk-loop) linear infinite}
.cot-mark--layers .mk-links--top{animation:mkl-links-top var(--mk-loop) linear infinite}
.cot-mark--layers .mk-links--low{animation:mkl-links-low var(--mk-loop) linear infinite}
.cot-mark--layers .mk-hull{animation:mkl-bob calc(var(--mk-loop) / 2) ease-in-out infinite}
.cot-mark--layers .mk-turret{transform-origin:${origin(105, 93)};animation:mkl-rock calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.38) infinite}
.cot-mark--layers .mk-crew{animation:mkl-bounce calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.3) infinite}
.cot-mark--layers .mk-antenna{transform-origin:${origin(64, 76)};animation:mkl-sway calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.26) infinite}
.cot-mark--layers .mk-puff{opacity:0;animation:mkl-puff var(--mk-loop) ease-out infinite}
@keyframes mkl-turn{to{transform:rotate(240deg)}}
@keyframes mkl-links-top{from{transform:translateX(0)}to{transform:translateX(${pct(PITCH / 126 * 100)})}}
@keyframes mkl-links-low{from{transform:translateX(0)}to{transform:translateX(${pct(-PITCH / 126 * 100)})}}
@keyframes mkl-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(${pct(-0.9 / VB_H * 100)})}}
@keyframes mkl-rock{0%,100%{transform:rotate(-0.55deg)}50%{transform:rotate(0.55deg)}}
@keyframes mkl-bounce{0%,100%{transform:translateY(0)}45%{transform:translateY(${pct(-1.1 / VB_H * 100)})}}
@keyframes mkl-sway{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-5deg)}}
@keyframes mkl-puff{0%{opacity:.5;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(${pct(-11 / (2 * PUFF_R) * 100)},${pct(-5 / (2 * PUFF_R) * 100)}) scale(3.2)}}
@media (prefers-reduced-motion:reduce){.cot-mark--layers :is(.mk-wheel,.mk-links--top,.mk-links--low,.mk-hull,.mk-turret,.mk-crew,.mk-antenna,.mk-puff){animation:none}
  .cot-mark--layers .mk-puff{display:none}}
`;
