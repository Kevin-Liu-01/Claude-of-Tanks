/**
 * tutorialGuide.ts — the tutorial's one guidance layer over the battle: where to go, what to look at, which control to
 * press (273). Copyright © 2026 Kevin B. Liu.
 *
 * A step's `guide` record (tutorialSteps.ts TutorialGuideSpec) names what to show, and this module draws it; no step
 * draws its own arrows. It draws six pieces:
 *
 * - a marker: a ring on the ground, a light column, its label and the distance to it;
 * - the path: up to five chevrons on the ground from the player toward the marker (none once the player is close);
 * - a bracket: corners round an actor (a target or a scripted shooter) and its label;
 * - an edge pointer: an arrow on the screen's edge toward the marker or actor while it is off screen or behind the camera,
 *   with its label and distance;
 * - a HUD chevron: a small bouncing chevron at a HUD control (the first selector that is on screen, as a step's target);
 * - an aim ghost: a dashed ring on the plate to aim at, shown only once the step has fallen behind (setEscalated).
 *
 * World pieces are drawn in screen space from points the game projects (GuidePort.project), so the guide adds nothing to
 * the 3D scene and costs nothing outside a run; it loads with the tutorial's chunk. It owns two layers: the world pieces
 * under the HUD (--z-hud-world) and the pointer and chevron over it (--z-hud-score). Neither takes the pointer, so the
 * guide can never swallow a press (the dim's inert blockers stay the overlay's, tutorialOverlay.ts). It redraws on
 * animation frames while it shows something and is not hidden, and it goes with its run (destroy).
 *
 * Its geometry (where on the ring to sample, where the chevrons stand, where the pointer meets the edge) is in
 * tutorialGuideMath.ts, held by tutorialGuide.selftest.mjs.
 */
import {
  actorCorners, actorPoint, edgeInsets, edgePointer, groundDistance, insideInsets, onScreen, pathChevrons, ringPoints, screenAngle, screenBox,
  type ScreenPoint, type Viewport, type WorldPoint,
} from './tutorialGuideMath.ts';
import type { TutorialGuideSpec } from './tutorialSteps.ts';

/** A pose in the world: a point and a yaw (radians; 0 faces +z). */
type GuidePose = WorldPoint & { readonly yaw: number };

/** What the guide reads from the game (main.ts hands it in through the tutorial's port). */
export interface GuidePort {
  /** A world point on the screen (CSS px), or null with no camera. */
  project(point: WorldPoint): ScreenPoint | null;
  /** The ground's height under a point. */
  groundY(x: number, z: number): number;
  /** The player's tank, in battle; null elsewhere. */
  player(): GuidePose | null;
  /** A battle actor by its entity id (a target, a scripted shooter), or null when it is not in the battle. */
  actor(id: string): GuidePose | null;
}

/** The guide's words, resolved by the runner in the player's language. */
interface GuideLabels {
  readonly marker: string;
  readonly actor: string;
  /** "{m} m" in the player's language. */
  readonly distance: (metres: number) => string;
}

export interface TutorialGuideLayer {
  /** Show a step's guidance (null: none). */
  show(spec: TutorialGuideSpec | null, labels: GuideLabels): void;
  /** The step has fallen behind: show its aim ghost (and pulse the rest). */
  setEscalated(on: boolean): void;
  /** Hide while the card hides (a pause, a covering surface); show(...) or setHidden(false) brings it back. */
  setHidden(hidden: boolean): void;
  /** What the guide drew last (receipts): which pieces show, and the edge pointer's place when it does. */
  snapshot(): GuideSnapshot;
  destroy(): void;
}

interface GuideSnapshot {
  readonly ring: boolean;
  readonly chevrons: number;
  readonly bracket: boolean;
  readonly edge: { readonly x: number; readonly y: number } | null;
  readonly hud: boolean;
  readonly aim: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The edge pointer stands this far inside the screen's edges (a fifth of the height at the bottom, tutorialGuideMath.ts
 *  edgeInsets); a subject outside that rectangle counts as off screen. */
const EDGE_INSET = 56;
const COLUMN_M = 7;
const MARKER_LIFT_M = 0.15;
/** A bracket's box round an actor: half length, half width and height (m), wide enough for any fleet hull. */
const ACTOR_BOX = { halfLength: 4, halfWidth: 2, height: 3 } as const;
const BRACKET_PX = 14;
const AIM_RING_PX = 16;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, className: string, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  node.setAttribute('class', className);
  parent.append(node);
  return node;
}

function layer(className: string): { root: HTMLDivElement; svg: SVGSVGElement } {
  const root = document.createElement('div');
  root.className = `cot-tut-guide ${className}`;
  root.setAttribute('aria-hidden', 'true');
  const svg = svgEl('svg', 'cot-tut-guide-svg', root);
  document.body.append(root);
  return { root, svg };
}

const CHEVRON_PATH = 'M-11,6 L0,-5 L11,6';
const POINTER_PATH = 'M14,0 L-6,-11 L-2,0 L-6,11 Z';

export function createTutorialGuide(port: GuidePort): TutorialGuideLayer {
  const world = layer('cot-tut-guide--world');
  const over = layer('cot-tut-guide--over');

  const ring = svgEl('path', 'cot-tut-guide-ring', world.svg);
  const column = svgEl('line', 'cot-tut-guide-column', world.svg);
  const markerLabel = svgEl('text', 'cot-tut-guide-label', world.svg);
  const markerDistance = svgEl('text', 'cot-tut-guide-distance', world.svg);
  const chevrons = Array.from({ length: 5 }, () => svgEl('path', 'cot-tut-guide-chevron', world.svg));
  for (const chevron of chevrons) chevron.setAttribute('d', CHEVRON_PATH);
  const bracket = svgEl('path', 'cot-tut-guide-bracket', world.svg);
  const bracketLabel = svgEl('text', 'cot-tut-guide-label cot-tut-guide-label--actor', world.svg);
  const aim = svgEl('circle', 'cot-tut-guide-aim', world.svg);
  aim.setAttribute('r', String(AIM_RING_PX));

  const edge = svgEl('g', 'cot-tut-guide-edge', over.svg);
  const edgeArrow = svgEl('path', 'cot-tut-guide-edge-arrow', edge);
  edgeArrow.setAttribute('d', POINTER_PATH);
  const edgeLabel = svgEl('text', 'cot-tut-guide-edge-label', edge);
  const edgeDistance = svgEl('text', 'cot-tut-guide-edge-distance', edge);
  const hudChevron = document.createElement('span');
  hudChevron.className = 'cot-tut-guide-hud';
  over.root.append(hudChevron);

  let spec: TutorialGuideSpec | null = null;
  let labels: GuideLabels | null = null;
  let escalated = false;
  let hidden = false;
  let frame = 0;
  let drawn: GuideSnapshot = { ring: false, chevrons: 0, bracket: false, edge: null, hud: false, aim: false };

  const show = (node: Element, on: boolean): void => {
    if (on) node.removeAttribute('display'); else node.setAttribute('display', 'none');
  };

  function viewport(): Viewport {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function lifted(x: number, z: number, up: number): WorldPoint {
    return { x, y: port.groundY(x, z) + up, z };
  }

  /** The HUD control the step points at: the first of its selectors with a box on screen. */
  function hudTarget(selectors: readonly string[]): DOMRect | null {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        if (rect.width >= 2 && rect.height >= 2 && rect.bottom > 0 && rect.top < window.innerHeight) return rect;
      }
    }
    return null;
  }

  function draw(): void {
    const view = viewport();
    world.svg.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`);
    over.svg.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`);
    const player = port.player();
    const marker = spec?.marker ?? null;
    const actorSpec = spec?.actor ?? null;
    const actor = actorSpec ? port.actor(actorSpec.id) : null;
    const next: { ring: boolean; chevrons: number; bracket: boolean; edge: { x: number; y: number } | null; hud: boolean; aim: boolean } =
      { ring: false, chevrons: 0, bracket: false, edge: null, hud: false, aim: false };

    // the marker: its ring, column, label and distance
    let subject: { point: ScreenPoint; label: string; metres: number | null } | null = null;
    if (marker) {
      const outline = ringPoints(marker, marker.radiusM).map((p) => port.project(lifted(p.x, p.z, MARKER_LIFT_M)));
      const ringOk = outline.every((p) => p && !p.behind);
      if (ringOk) ring.setAttribute('d', `M${outline.map((p) => `${p!.x.toFixed(1)},${p!.y.toFixed(1)}`).join('L')}Z`);
      show(ring, ringOk);
      next.ring = ringOk;
      const foot = port.project(lifted(marker.x, marker.z, 0));
      const top = port.project(lifted(marker.x, marker.z, COLUMN_M));
      const columnOk = !!foot && !!top && !foot.behind && !top.behind;
      if (columnOk) {
        column.setAttribute('x1', foot!.x.toFixed(1)); column.setAttribute('y1', foot!.y.toFixed(1));
        column.setAttribute('x2', top!.x.toFixed(1)); column.setAttribute('y2', top!.y.toFixed(1));
        markerLabel.setAttribute('x', top!.x.toFixed(1)); markerLabel.setAttribute('y', (top!.y - 22).toFixed(1));
        markerDistance.setAttribute('x', top!.x.toFixed(1)); markerDistance.setAttribute('y', (top!.y - 6).toFixed(1));
      }
      const metres = player ? Math.max(0, groundDistance(player, marker) - marker.radiusM) : null;
      markerLabel.textContent = labels?.marker ?? '';
      markerDistance.textContent = metres == null ? '' : labels?.distance(Math.round(metres)) ?? '';
      show(column, columnOk); show(markerLabel, columnOk); show(markerDistance, columnOk);
      const centre = port.project(lifted(marker.x, marker.z, 1));
      if (centre) subject = { point: centre, label: labels?.marker ?? '', metres };

      // the path toward it
      const way = spec?.path && player ? pathChevrons(player, marker, marker.radiusM) : [];
      chevrons.forEach((chevron, i) => {
        const step = way[i];
        const at = step ? port.project(lifted(step.at.x, step.at.z, MARKER_LIFT_M)) : null;
        const ahead = step ? port.project(lifted(step.at.x + step.dir.x, step.at.z + step.dir.z, MARKER_LIFT_M)) : null;
        const ok = !!at && !!ahead && !at.behind && !ahead.behind;
        if (ok) {
          // a chevron's art points up (−y): it turns by the screen angle of its way plus a quarter turn
          const deg = (screenAngle(at!, ahead!) * 180) / Math.PI + 90;
          chevron.setAttribute('transform', `translate(${at!.x.toFixed(1)} ${at!.y.toFixed(1)}) rotate(${deg.toFixed(1)})`);
          chevron.style.setProperty('--i', String(i));
          next.chevrons += 1;
        }
        show(chevron, ok);
      });
    } else {
      for (const node of [ring, column, markerLabel, markerDistance, ...chevrons]) show(node, false);
    }

    // the actor's bracket
    let bracketOk = false;
    if (actor && actorSpec) {
      const box = screenBox(actorCorners(actor, ACTOR_BOX.halfLength, ACTOR_BOX.halfWidth, ACTOR_BOX.height)
        .map((corner) => port.project(corner) ?? { x: 0, y: 0, behind: true }));
      if (box) {
        const { left: l, top: t, right: r, bottom: b } = box;
        const c = BRACKET_PX;
        bracket.setAttribute('d', `M${l},${t + c}V${t}H${l + c}M${r - c},${t}H${r}V${t + c}M${r},${b - c}V${b}H${r - c}M${l + c},${b}H${l}V${b - c}`);
        bracketLabel.setAttribute('x', ((l + r) / 2).toFixed(1));
        bracketLabel.setAttribute('y', (t - 8).toFixed(1));
        bracketLabel.textContent = labels?.actor ?? '';
        bracketOk = true;
      }
      if (!marker) {
        const centre = port.project({ x: actor.x, y: actor.y + 1.5, z: actor.z });
        if (centre) subject = { point: centre, label: labels?.actor ?? '', metres: player ? groundDistance(player, actor) : null };
      }
    }
    show(bracket, bracketOk); show(bracketLabel, bracketOk);
    next.bracket = bracketOk;

    // the aim ghost, once the step has fallen behind
    const aimSpec = escalated ? spec?.aimAt ?? null : null;
    const aimPose = aimSpec ? port.actor(aimSpec.id) : null;
    const aimAt = aimSpec && aimPose ? port.project(actorPoint(aimPose, aimSpec.along, aimSpec.up, aimSpec.across)) : null;
    const aimOk = !!aimAt && onScreen(aimAt, view);
    if (aimOk) { aim.setAttribute('cx', aimAt!.x.toFixed(1)); aim.setAttribute('cy', aimAt!.y.toFixed(1)); }
    show(aim, aimOk);
    next.aim = aimOk;

    // the edge pointer, while the subject is off screen
    const insets = edgeInsets(view, EDGE_INSET);
    const off = subject && !insideInsets(subject.point, view, insets);
    if (subject && off) {
      const at = edgePointer(subject.point, view, insets);
      edge.setAttribute('transform', `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
      edgeArrow.setAttribute('transform', `rotate(${((at.angle * 180) / Math.PI).toFixed(1)})`);
      // the words stand on the screen's side of the arrow
      const inward = { x: -Math.cos(at.angle), y: -Math.sin(at.angle) };
      const tx = (inward.x * 34).toFixed(1), ty = (inward.y * 30).toFixed(1);
      edgeLabel.setAttribute('x', tx); edgeLabel.setAttribute('y', ty);
      edgeDistance.setAttribute('x', tx); edgeDistance.setAttribute('y', (Number(ty) + 15).toFixed(1));
      const anchor = inward.x > 0.35 ? 'start' : inward.x < -0.35 ? 'end' : 'middle';
      edgeLabel.setAttribute('text-anchor', anchor); edgeDistance.setAttribute('text-anchor', anchor);
      edgeLabel.textContent = subject.label;
      edgeDistance.textContent = subject.metres == null ? '' : labels?.distance(Math.round(subject.metres)) ?? '';
      next.edge = { x: at.x, y: at.y };
    }
    show(edge, !!next.edge);

    // the HUD chevron: above its control, or below one near the top of the screen
    const hudRect = spec?.hud?.length ? hudTarget(spec.hud) : null;
    if (hudRect) {
      const below = hudRect.top < 48;
      hudChevron.dataset.side = below ? 'below' : 'above';
      hudChevron.style.transform = `translate(${Math.round(hudRect.left + hudRect.width / 2)}px,${Math.round(below ? hudRect.bottom + 6 : hudRect.top - 6)}px)`;
    }
    hudChevron.hidden = !hudRect;
    next.hud = !!hudRect;

    drawn = next;
  }

  function loop(): void {
    frame = 0;
    if (!spec || hidden) return;
    draw();
    frame = requestAnimationFrame(loop);
  }

  function schedule(): void {
    const visible = !!spec && !hidden;
    world.root.classList.toggle('is-on', visible);
    over.root.classList.toggle('is-on', visible);
    if (visible && !frame) frame = requestAnimationFrame(loop);
    if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; }
    world.root.classList.toggle('is-escalated', escalated);
  }

  return {
    show(nextSpec, nextLabels): void {
      spec = nextSpec;
      labels = nextLabels;
      escalated = false;
      drawn = { ring: false, chevrons: 0, bracket: false, edge: null, hud: false, aim: false };
      schedule();
    },
    setEscalated(on): void {
      escalated = on;
      schedule();
    },
    setHidden(on): void {
      hidden = on;
      schedule();
    },
    snapshot: () => drawn,
    destroy(): void {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      spec = null;
      world.root.remove();
      over.root.remove();
    },
  };
}
