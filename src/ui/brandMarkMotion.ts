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
import { BRAND_TANK_ASPECT, BRAND_TANK_VIEWBOX, ROAD_WHEELS, brandTankBody, brandTankLayers } from './brandMark.ts';

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

/* ---- the living mark on the compositor (owner, 2026-10-26: "the claude tank animation doesnnt play bc its just loading")
 * The same loop, built from HTML layers that move only by transform and opacity, so it keeps running while the main
 * thread is busy (the boot card, where the game loads under it). Each moving part is its own box over the mark's: an svg
 * of that part (brandTankLayers) whose box is the whole mark, so the parts register; the wheels are small boxes turning
 * about their centres, the track's links a strip of notches sliding under a clip, the exhaust three discs. Nested boxes
 * carry the hull's bob into the turret and the crew, as the svg groups do. */
const [MX, MY, MW, MH] = BRAND_TANK_VIEWBOX.split(' ').map(Number);
const px = (x: number): string => `${((x - MX) / MW * 100).toFixed(3)}%`;
const py = (y: number): string => `${((y - MY) / MH * 100).toFixed(3)}%`;
const RUN_X = [50, 176] as const;
const layer = (body: string): string => `<svg class="mkl-l" viewBox="${BRAND_TANK_VIEWBOX}" focusable="false">${body}</svg>`;

/** The living mark as compositor layers, as wide as its host: the tank in `ink`, the commander and pennant in `accent`, the
 *  puffs in the host's colour and the links cut in --mk-ground. */
export function brandMarkLiveHTML(ink = 'currentColor', accent = 'var(--accent)'): string {
  const parts = brandTankLayers({ ink, accent });
  const wheels = ROAD_WHEELS.map(([x, y]) => `<svg class="mkl-wheel" viewBox="${-WHEEL_R} ${-WHEEL_R} ${2 * WHEEL_R} ${2 * WHEEL_R}" `
    + `style="left:${px(x - WHEEL_R)};top:${py(y - WHEEL_R)}" focusable="false"><g fill="${ink}"><circle r="1.7"/>`
    + `${[0, 120, 240].map((angle) => `<rect x="-0.55" y="${-WHEEL_R}" width="1.1" height="${WHEEL_R}" transform="rotate(${angle})"/>`).join('')}</g></svg>`).join('');
  const links = (run: 'top' | 'low', y: number): string => `<span class="mkl-links mkl-links--${run}" style="top:${py(y - 0.75)}"><i></i></span>`;
  const puffs = [0, 1, 2].map((index) => `<i class="mkl-puff" style="animation-delay:${(-index * LOOP_S / 3).toFixed(2)}s"></i>`).join('');
  return `<div class="mkl" aria-hidden="true">${layer(parts.run)}${links('top', 120.4)}${links('low', 136.6)}${wheels}`
    + `<div class="mkl-l mkl-hull">${layer(parts.hull)}${puffs}<div class="mkl-l mkl-turret">${layer(parts.gear)}`
    + `<div class="mkl-l mkl-antenna">${layer(parts.antenna)}</div><div class="mkl-l mkl-crew">${layer(parts.crew)}</div>`
    + `${layer(parts.front)}</div></div></div>`;
}

/** The compositor loop's rules: the svg loop's motion in each layer's own percentages. */
export const BRAND_MARK_LIVE_CSS = (() => {
  const runW = RUN_X[1] - RUN_X[0];
  const step = PITCH / (runW + PITCH) * 100;
  return `
.mkl{--mk-loop:${LOOP_S}s;position:relative;aspect-ratio:${MW}/${MH}}
.mkl-l{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.mkl-wheel{position:absolute;width:${(2 * WHEEL_R / MW * 100).toFixed(3)}%;aspect-ratio:1;animation:mkl-turn var(--mk-loop) linear infinite}
.mkl-links{position:absolute;left:${px(RUN_X[0])};width:${(runW / MW * 100).toFixed(3)}%;height:${(1.5 / MH * 100).toFixed(3)}%;overflow:hidden}
.mkl-links i{position:absolute;inset:0 auto 0 0;width:${(100 + PITCH / runW * 100).toFixed(3)}%;
  background:linear-gradient(90deg,var(--mk-ground,var(--surface-scene)) 42%,transparent 42%) 0 0/${step.toFixed(3)}% 100% repeat-x}
.mkl-links--top i{animation:mkl-top var(--mk-loop) linear infinite}
.mkl-links--low i{animation:mkl-low var(--mk-loop) linear infinite}
.mkl-hull{animation:mkl-bob calc(var(--mk-loop) / 2) ease-in-out infinite}
.mkl-turret{transform-origin:${px(105)} ${py(93)};animation:mkl-rock calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.38) infinite}
.mkl-crew{animation:mkl-bounce calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.3) infinite}
.mkl-antenna{transform-origin:${px(64)} ${py(76)};animation:mkl-sway calc(var(--mk-loop) / 2) ease-in-out calc(var(--mk-loop) * -0.26) infinite}
.mkl-puff{position:absolute;left:${px(37 - 1.6)};top:${py(101 - 1.6)};width:${(3.2 / MW * 100).toFixed(3)}%;aspect-ratio:1;border-radius:50%;
  background:currentColor;opacity:0;animation:mkl-puff var(--mk-loop) ease-out infinite}
.mkl :is(.mkl-wheel,.mkl-links i,.mkl-hull,.mkl-turret,.mkl-crew,.mkl-antenna,.mkl-puff){will-change:transform}
@keyframes mkl-turn{to{transform:rotate(240deg)}}
@keyframes mkl-top{from{transform:translateX(-${step.toFixed(3)}%)}to{transform:none}}
@keyframes mkl-low{to{transform:translateX(-${step.toFixed(3)}%)}}
@keyframes mkl-bob{0%,100%{transform:none}50%{transform:translateY(-${(0.9 / MH * 100).toFixed(3)}%)}}
@keyframes mkl-rock{0%,100%{transform:rotate(-0.55deg)}50%{transform:rotate(0.55deg)}}
@keyframes mkl-bounce{0%,100%{transform:none}45%{transform:translateY(-${(1.1 / MH * 100).toFixed(3)}%)}}
@keyframes mkl-sway{0%,100%{transform:none}50%{transform:rotate(-5deg)}}
@keyframes mkl-puff{0%{opacity:.5;transform:none}100%{opacity:0;transform:translate(-${(11 / 3.2 * 100).toFixed(1)}%,-${(5 / 3.2 * 100).toFixed(1)}%) scale(3.2)}}
@media (prefers-reduced-motion:reduce){.mkl *{animation:none}.mkl-puff{display:none}}
`;
})();

