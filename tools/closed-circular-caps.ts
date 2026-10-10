import type { BufferGeometry } from 'three';

type Point = readonly [number, number, number];
interface Sector { offset: number; start: string; end: string; angle: number }
interface Fan { sectors: Sector[] }
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const key = (p: Point): string => p.map(v => Math.round(v * 1e4)).join(',');

function addSector(fans: Map<string, Fan>, points: Point[], offset: number, centerIndex: number): void {
  const center = points[centerIndex], start = points[(centerIndex + 1) % 3], end = points[(centerIndex + 2) % 3];
  const a = subtract(start, center), b = subtract(end, center);
  const radius = Math.sqrt(dot(a, a)), secondRadius = Math.sqrt(dot(b, b));
  if (radius < 0.001 || Math.abs(radius - secondRadius) > Math.max(2e-6, radius * 1e-5)) return;
  const normal = cross(a, b), magnitude = Math.sqrt(dot(normal, normal));
  const angle = Math.atan2(magnitude, dot(a, b));
  if (angle < 1e-5 || angle >= Math.PI - 1e-5) return;
  const unit: Point = [normal[0] / magnitude, normal[1] / magnitude, normal[2] / magnitude];
  const fanKey = `${key(center)}|${Math.round(radius * 1e4)}|${key(unit)}|${Math.round(angle * 1e4)}`;
  const fan = fans.get(fanKey) ?? { sectors: [] };
  fan.sectors.push({ offset, start: key(start), end: key(end), angle });
  fans.set(fanKey, fan);
}

function closedFanOffsets(fan: Fan): number[] {
  // Deduplicate rim edges only for closure recognition. Retain every triangle
  // offset: two identical caps in a merged buffer must still collide later.
  const edges = new Map<string, Sector>();
  for (const sector of fan.sectors) {
    const previous = edges.get(sector.start);
    if (previous && previous.end !== sector.end) return [];
    edges.set(sector.start, sector);
  }
  if (edges.size < 6) return [];
  const visited = new Set<string>();
  for (const first of edges.keys()) {
    if (visited.has(first)) continue;
    let at = first, angle = 0, count = 0;
    while (!visited.has(at)) {
      const sector = edges.get(at);
      if (!sector) return [];
      visited.add(at); angle += sector.angle; at = sector.end; count++;
    }
    if (at !== first || count < 6 || Math.abs(angle - 2 * Math.PI) > 1e-3) return [];
  }
  return fan.sectors.map(sector => sector.offset);
}

/** Recognize complete, filled circular fan caps in native indexed or merged
 * triangle buffers, without relying on primitive names or authoring metadata.
 * Work in local space so nonuniform instance/object scales remain supported.
 * Hollow rims and incomplete fans deliberately do not count as closed discs. */
export function closedCircularCapOffsets(geometry: BufferGeometry): Set<number> {
  const position = geometry.getAttribute('position'), index = geometry.index;
  const fans = new Map<string, Fan>();
  if (!position) return new Set();
  const count = index?.count ?? position.count;
  const start = Math.max(0, geometry.drawRange.start);
  const end = Math.min(count, start + geometry.drawRange.count);
  for (let offset = start; offset + 2 < end; offset += 3) {
    const points: Point[] = [0, 1, 2].map(delta => {
      const i = index ? index.getX(offset + delta) : offset + delta;
      return [position.getX(i), position.getY(i), position.getZ(i)];
    });
    for (let center = 0; center < 3; center++) addSector(fans, points, offset, center);
  }
  const offsets = new Set<number>();
  for (const fan of fans.values()) for (const offset of closedFanOffsets(fan)) offsets.add(offset);
  return offsets;
}
