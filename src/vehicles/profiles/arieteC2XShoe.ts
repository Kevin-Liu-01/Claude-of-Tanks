import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TrackShoeBuildParameters } from '../tankFactoryCore.ts';

function stock(w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  return KIT.box(w, h, d).translate(x, y, z);
}

/** C2 LOW keeps split pads, one raised chevron pair, a real guide and round
 * hinge shafts. It does not flatten/squash pins or alter the seated course. */
export function arieteC2Shoe(p: TrackShoeBuildParameters): THREE.BufferGeometry {
  if (p.pattern.id !== 'franco-italian-modular' || p.radialScale !== 1 || p.section)
    throw new Error('C2 shoe requires its unscaled Franco-Italian mechanical pattern');
  if (p.high && !p.far) return KIT.trackShoeGeometry(p.trackW, p.pitch, p.pattern,
    p.pinCapOuter, p.radialScale, p.widthScale);
  const { trackW: w, pitch, pattern: d } = p;
  if (p.far) {
    // Match the fleet's22-triangle distant silhouette rather than drawing a
    // second detailed near shoe after its pins are below pixel resolution.
    const bar = new THREE.BoxGeometry(w * .86, d.grouserHeight, pitch * .14);
    bar.setIndex(Array.from(bar.index!.array).filter((_, i) => Math.floor(i / 6) !== 3));
    bar.clearGroups();
    bar.translate(0, (d.padHeight + d.grouserHeight) / 2, 0);
    return KIT.mergeAll([stock(w * .97, d.padHeight, pitch * d.padCoverage), bar])
      .scale(p.widthScale, 1, 1);
  }
  const gap = w * .055, half = (w * .97 - gap) / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(stock(half, d.padHeight, pitch * d.padCoverage, side * (half + gap) / 2));
    parts.push(stock(w * .47, d.grouserHeight, pitch * .12)
      .rotateY(side * -.28).translate(side * w * .225, (d.padHeight + d.grouserHeight) / 2, 0));
  }
  if (!p.far) {
    parts.push(stock(w * .78, d.webHeight, pitch * d.webDepth,
      0, -(d.padHeight + d.webHeight) / 2 + .004));
    const root = -(d.padHeight / 2 + d.webHeight - .006), tip = root - d.hornHeight;
    const guide = new THREE.Shape([[-.041, root], [.041, root], [.023, tip], [-.023, tip]]
      .map(([x, y]) => new THREE.Vector2(x, y)));
    parts.push(new THREE.ExtrudeGeometry(guide, { depth: pitch * .25, steps: 1, bevelEnabled: false })
      .translate(0, 0, -pitch * .125));
    // Two whole hinge shafts replace four disconnected cap cylinders. Their
    // six-sided circular ends retain radius, spacing and cardinal height.
    const pinY = d.pinCentreY ?? -(d.padHeight / 2 + d.webHeight * .38);
    const outer = p.pinCapOuter ?? w * .48;
    const circle = new THREE.Shape(Array.from({ length: 6 }, (_, i) =>
      new THREE.Vector2(Math.sin(i * Math.PI / 3) * d.pinRadius,
        Math.cos(i * Math.PI / 3) * d.pinRadius)));
    for (const z of [-pitch * .30, pitch * .30]) parts.push(
      new THREE.ExtrudeGeometry(circle, { depth: outer * 2, steps: 1, bevelEnabled: false })
        .translate(0, 0, -outer).rotateY(Math.PI / 2).translate(0, pinY, z));
  }
  return KIT.mergeAll(parts).scale(p.widthScale, 1, 1);
}
