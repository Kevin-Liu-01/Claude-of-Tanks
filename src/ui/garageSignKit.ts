import { KitBuilder } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';

/**
 * K3, signage (garage r9): less text, more pictograms, no sentences. Every sign face is an atlas rect (ISO 7010-style
 * pictograms, bay numerals, the speed-10 roundel, the tank-crossing triangle, each Garage's nameboard) on the pack's
 * DISPLAY-LIT draw; stencils and supergraphics are DECAL quads. Type comes from the atlas generator (Inter), never from
 * a canvas baked in the browser, which ends the signs' dependence on the UI's trial-build face. Budget: 30 signs or decals
 * and 1,500 triangles per pack.
 */

/** A plate fixed flat to a wall: the plate with its fixings and the face. Frame: the wall at z = 0, +z out. */
export function buildWallPlate(b: KitBuilder, rect: string, w: number, h: number): number {
  const start = b.triangleCount;
  b.box(0, 0, 0.01, w + 0.04, h + 0.04, 0.02, 0x2a2c2e, { bevel: 0.004 });
  b.uprightFace(0, 0, 0.021, w, h, garageDisplayRect(rect));
  return b.triangleCount - start;
}

/** A sign on a post with its concrete base; both faces carry the sign (the back plain steel). */
export function buildPostSign(b: KitBuilder, rect: string, w: number, h: number, height = 2.1): number {
  const start = b.triangleCount;
  b.box(0, 0.1, 0, 0.36, 0.2, 0.36, b.skin.concrete, { bevel: 0.02, noBottom: true });
  b.box(0, height / 2, -0.05, 0.06, height, 0.06, 0x8a9094, { bevel: 0 });
  b.box(0, height - h / 2, -0.005, w + 0.03, h + 0.03, 0.02, 0x8a9094, { bevel: 0.004 });
  b.uprightFace(0, height - h / 2, 0.006, w, h, garageDisplayRect(rect));
  return b.triangleCount - start;
}

/** A sign hanging on two chains `drop` metres below its hooks (the hooks at y = 0). */
export function buildHangingSign(b: KitBuilder, rect: string, w: number, h: number, drop = 0.6): number {
  const start = b.triangleCount;
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) b.tube([[x, 0, 0], [x, -drop, 0]], 0.006, 3, 0x3a3a38);
  b.box(0, -drop - h / 2, 0, w + 0.03, h + 0.03, 0.02, 0x2a2c2e, { bevel: 0.004 });
  b.uprightFace(0, -drop - h / 2, 0.011, w, h, garageDisplayRect(rect));
  b.push().rotateY(Math.PI);
  b.uprightFace(0, -drop - h / 2, 0.011, w, h, garageDisplayRect(rect));
  b.pop();
  return b.triangleCount - start;
}

/** An A-board on the ground with its pictogram on both leaves. */
export function buildABoard(b: KitBuilder, rect: string): number {
  const start = b.triangleCount;
  for (const s of [-1, 1]) {
    b.push().translate(0, 0, s * 0.18).rotateX(s * 0.2);
    b.box(0, 0.48, 0, 0.6, 0.9, 0.025, 0xd8d6cc, { bevel: 0.006 });
    b.push().rotateY(s > 0 ? 0 : Math.PI);
    b.uprightFace(0, 0.55, 0.0135, 0.46, 0.46, garageDisplayRect(rect));
    b.pop();
    b.pop();
  }
  return b.triangleCount - start;
}

/** A painted supergraphic on a wall (DECAL): a stencilled crest, wordmark or bay numeral, w x h, centred at y. */
export function buildSupergraphic(b: KitBuilder, rect: string, w: number, h: number, y: number): number {
  b.decal([-w / 2, y - h / 2, 0.004], [w / 2, y - h / 2, 0.004], [w / 2, y + h / 2, 0.004], [-w / 2, y + h / 2, 0.004], garageDisplayRect(rect));
  return 2;
}

/** A stencil laid on the ground (DECAL), w along x and d along z, turned by `yaw`. */
export function buildGroundStencil(b: KitBuilder, rect: string, w: number, d: number, yaw = 0): number {
  b.push().rotateY(yaw);
  b.decal([-w / 2, 0.012, d / 2], [w / 2, 0.012, d / 2], [w / 2, 0.012, -d / 2], [-w / 2, 0.012, -d / 2], garageDisplayRect(rect));
  b.pop();
  return 2;
}
