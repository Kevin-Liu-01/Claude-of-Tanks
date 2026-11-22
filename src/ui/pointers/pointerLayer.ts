/**
 * pointerLayer.ts — draws the battle's pointers (pointerPlan.ts): the follow pointer on the ground, the warnings on the
 * screen's rim (guidance-pointers-275). Copyright © 2026 Kevin B. Liu.
 *
 * Kevin, 2026-11-22: "for stuff for you to follow, its on ground. for the warnings / indicators thats in the ui".
 *
 * Two layers, neither of which takes the pointer, so a pointer can never swallow a press:
 * - the ground (under the HUD, --z-hud-world): the follow pointer's chevron trail and its turn arrow round the tank, each
 *   outline laid on the terrain in metres and projected corner by corner, so a chevron foreshortens and climbs with the
 *   ground as paint on it would;
 * - the rim (over the HUD, --z-hud-score): one bubble per warning the camera does not show, its arrow at the warning, its
 *   glyph (a tank, a missile, an aircraft), its distance, an air run's countdown ring, and the count of a merged bubble.
 * Everything is drawn in screen space from points the caller projects, so the layer adds nothing to the 3D scene. The
 * caller (hud.ts) draws it once a frame with the frame's pointers, or with null to clear it; it keeps its nodes (no per
 * frame allocation past the path strings) and goes with the HUD (destroy).
 */
import {
  bubbleRadius, planBubbles, trailChevrons, turnArrow, type Bubble, type FollowPointer, type GroundPoint, type ScreenBox,
  type ScreenPoint, type WarnKind, type WarnPointer, type WorldPoint,
} from './pointerPlan.ts';

/** What the layer reads for one frame. */
interface PointerFrame {
  /** The one follow pointer (pointerPlan.ts pickFollow), or null. */
  readonly follow: FollowPointer | null;
  readonly warns: readonly WarnPointer[];
  /** The player's tank on the ground. */
  readonly player: GroundPoint;
  /** The camera's heading on the ground (yaw). */
  readonly viewYaw: number;
  /** The gunner's sight is up: only the ladder's threats show (the follow pointer stands down). */
  readonly scoped: boolean;
  readonly project: (point: WorldPoint) => ScreenPoint | null;
  readonly groundY: (x: number, z: number) => number;
  /** The HUD a bubble never covers. */
  readonly noCover: readonly ScreenBox[];
  /** "{m} m" and "{s} s" in the player's language. */
  readonly metres: (m: number) => string;
  readonly seconds: (s: number) => string;
}

/** What the layer drew last (receipts). */
export interface PointerSnapshot {
  readonly follow: string | null;
  readonly chevrons: number;
  readonly turn: 1 | -1 | null;
  readonly bubbles: ReadonlyArray<{ readonly id: string; readonly kind: WarnKind; readonly x: number; readonly y: number; readonly count: number }>;
}

export interface PointerLayer {
  draw(frame: PointerFrame | null): void;
  snapshot(): PointerSnapshot;
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The paint's lift off the ground (m), so it never sinks into the terrain between its corners. */
const PAINT_LIFT_M = 0.12;
const MAX_CHEVRONS = 7;
const MAX_BUBBLES = 4;

/** Each warning's glyph, drawn for a 24-unit box round the bubble's centre. */
const GLYPHS: Readonly<Record<WarnKind, string>> = Object.freeze({
  // a hull, its turret and its gun, to the right
  tank: 'M-8,0h16v5h-16zM-4.5,-4.5h8v4.5h-8zM3.5,-3.4h7.5v1.8h-7.5z',
  // a missile flying up and to the right, its fins and its flame
  missile: 'M-7,5L5,-4l3,-2l-1,3.6L-5,7zM-7,5l-2.6,-0.4l1.4,-2.4zM-5,7l0.4,2.6l2.4,-1.4z',
  // an aircraft from above, nose up
  air: 'M0,-9l1.6,6l7.4,3v2l-7.4,-1l-0.6,5l2.6,2v1.6l-3.6,-1l-3.6,1v-1.6l2.6,-2l-0.6,-5l-7.4,1v-2l7.4,-3z',
});
const ARROW_PATH = 'M10,-7L17,0L10,7Z';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, className: string, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute('class', className);
  parent.append(node);
  return node;
}

function layer(className: string): { root: HTMLDivElement; svg: SVGSVGElement } {
  const root = document.createElement('div');
  root.className = `cot-ptr ${className}`;
  root.setAttribute('aria-hidden', 'true');
  const svg = svgEl('svg', 'cot-ptr-svg', root);
  document.body.append(root);
  return { root, svg };
}

const show = (node: Element, on: boolean): void => {
  if (on) node.removeAttribute('display'); else node.setAttribute('display', 'none');
};

interface BubbleNodes {
  readonly group: SVGGElement;
  readonly pulse: SVGCircleElement;
  readonly arrow: SVGPathElement;
  readonly disc: SVGCircleElement;
  readonly ring: SVGCircleElement;
  readonly glyph: SVGPathElement;
  readonly badge: SVGGElement;
  readonly badgeText: SVGTextElement;
  readonly label: SVGTextElement;
  id: string | null;
}

export function createPointerLayer(): PointerLayer {
  const ground = layer('cot-ptr--ground');
  const rimLayer = layer('cot-ptr--rim');

  const turnBand = svgEl('path', 'cot-ptr-turn', ground.svg);
  const turnHead = svgEl('path', 'cot-ptr-turn cot-ptr-turn-head', ground.svg);
  const chevrons = Array.from({ length: MAX_CHEVRONS }, () => svgEl('path', 'cot-ptr-chevron', ground.svg));

  const bubbles: BubbleNodes[] = Array.from({ length: MAX_BUBBLES }, () => {
    const group = svgEl('g', 'cot-ptr-bubble', rimLayer.svg);
    const pulse = svgEl('circle', 'cot-ptr-pulse', group);
    const arrow = svgEl('path', 'cot-ptr-arrow', group);
    arrow.setAttribute('d', ARROW_PATH);
    const disc = svgEl('circle', 'cot-ptr-disc', group);
    const ring = svgEl('circle', 'cot-ptr-ring', group);
    const glyph = svgEl('path', 'cot-ptr-glyph', group);
    const badge = svgEl('g', 'cot-ptr-badge', group);
    svgEl('circle', '', badge).setAttribute('r', '7');
    const badgeText = svgEl('text', '', badge);
    badgeText.setAttribute('y', '3.5');
    const label = svgEl('text', 'cot-ptr-label', group);
    return { group, pulse, arrow, disc, ring, glyph, badge, badgeText, label, id: null };
  });

  let drawn: PointerSnapshot = { follow: null, chevrons: 0, turn: null, bubbles: [] };
  let on = false;

  const setOn = (next: boolean): void => {
    if (next === on) return;
    on = next;
    ground.root.classList.toggle('is-on', on);
    rimLayer.root.classList.toggle('is-on', on);
  };

  /** A ground outline on the screen as a closed path, or null when any corner is off the camera. */
  function groundPath(outline: readonly GroundPoint[], frame: PointerFrame): string | null {
    let d = '';
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i]!;
      const at = frame.project({ x: p.x, y: frame.groundY(p.x, p.z) + PAINT_LIFT_M, z: p.z });
      if (!at || at.behind) return null;
      d += `${i ? 'L' : 'M'}${at.x.toFixed(1)},${at.y.toFixed(1)}`;
    }
    return `${d}Z`;
  }

  function drawFollow(frame: PointerFrame): { chevrons: number; turn: 1 | -1 | null } {
    const follow = frame.scoped ? null : frame.follow;
    let count = 0;
    let turn: 1 | -1 | null = null;
    const trail = follow?.trail ? trailChevrons(frame.player, follow, follow.radiusM) : [];
    chevrons.forEach((node, i) => {
      const chevron = trail[i];
      const d = chevron ? groundPath(chevron.outline, frame) : null;
      if (d) {
        node.setAttribute('d', d);
        node.style.setProperty('--i', String(chevron!.index));
        count += 1;
      }
      show(node, !!d);
    });
    const arrow = follow ? turnArrow(frame.player, frame.viewYaw, follow) : null;
    const band = arrow ? groundPath(arrow.band, frame) : null;
    const head = arrow ? groundPath(arrow.head, frame) : null;
    if (band && head) {
      turnBand.setAttribute('d', band);
      turnHead.setAttribute('d', head);
      turn = arrow!.turn;
    }
    show(turnBand, !!(band && head));
    show(turnHead, !!(band && head));
    return { chevrons: count, turn };
  }

  function drawBubbles(frame: PointerFrame): Bubble[] {
    const view = { width: window.innerWidth, height: window.innerHeight };
    const planned = planBubbles({ warns: frame.warns, project: frame.project, view, scoped: frame.scoped, noCover: frame.noCover });
    const radius = bubbleRadius(view);
    bubbles.forEach((nodes, i) => {
      const bubble = planned[i];
      show(nodes.group, !!bubble);
      if (!bubble) { nodes.id = null; return; }
      // a new warning in this seat replays its entry (the pulse); the same one keeps its place in it
      if (nodes.id !== bubble.id) {
        nodes.id = bubble.id;
        nodes.group.classList.remove('is-new');
        nodes.group.getBoundingClientRect();
        nodes.group.classList.add('is-new');
      }
      nodes.group.dataset.kind = bubble.kind;
      nodes.group.setAttribute('transform', `translate(${bubble.x.toFixed(1)} ${bubble.y.toFixed(1)})`);
      const deg = (bubble.angle * 180) / Math.PI;
      const scale = radius / 18;
      nodes.arrow.setAttribute('transform', `rotate(${deg.toFixed(1)}) scale(${scale})`);
      nodes.disc.setAttribute('r', String(radius));
      nodes.pulse.setAttribute('r', String(radius + 6));
      nodes.glyph.setAttribute('d', GLYPHS[bubble.kind]);
      nodes.glyph.setAttribute('transform', `scale(${scale})`);
      const ringR = radius + 3.5;
      const length = 2 * Math.PI * ringR;
      nodes.ring.setAttribute('r', ringR.toFixed(1));
      show(nodes.ring, bubble.countdownLeft != null);
      if (bubble.countdownLeft != null) {
        nodes.ring.setAttribute('stroke-dasharray', `${(length * bubble.countdownLeft).toFixed(1)} ${length.toFixed(1)}`);
      }
      show(nodes.badge, bubble.count > 1);
      if (bubble.count > 1) {
        nodes.badge.setAttribute('transform', `translate(${(radius * 0.8).toFixed(1)} ${(-radius * 0.8).toFixed(1)})`);
        nodes.badgeText.textContent = String(bubble.count);
      }
      // the words stand on the screen's side of the arrow
      const inward = { x: -Math.cos(bubble.angle), y: -Math.sin(bubble.angle) };
      const below = inward.y > -0.5;
      nodes.label.setAttribute('x', (inward.x * 4).toFixed(1));
      nodes.label.setAttribute('y', String(below ? radius + 15 : -radius - 9));
      nodes.label.setAttribute('text-anchor', inward.x > 0.5 ? 'start' : inward.x < -0.5 ? 'end' : 'middle');
      nodes.label.textContent = bubble.countdownS != null ? frame.seconds(Math.ceil(bubble.countdownS)) : frame.metres(Math.round(bubble.distanceM));
    });
    return planned;
  }

  return {
    draw(frame): void {
      if (!frame || (!frame.follow && !frame.warns.length)) {
        setOn(false);
        drawn = { follow: null, chevrons: 0, turn: null, bubbles: [] };
        for (const nodes of bubbles) nodes.id = null;
        return;
      }
      const view = `0 0 ${window.innerWidth} ${window.innerHeight}`;
      ground.svg.setAttribute('viewBox', view);
      rimLayer.svg.setAttribute('viewBox', view);
      const follow = drawFollow(frame);
      const planned = drawBubbles(frame);
      setOn(follow.chevrons > 0 || follow.turn != null || planned.length > 0);
      drawn = {
        follow: frame.scoped ? null : frame.follow?.id ?? null, chevrons: follow.chevrons, turn: follow.turn,
        bubbles: planned.map((b) => ({ id: b.id, kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), count: b.count })),
      };
    },
    snapshot: () => drawn,
    destroy(): void {
      ground.root.remove();
      rimLayer.root.remove();
    },
  };
}
