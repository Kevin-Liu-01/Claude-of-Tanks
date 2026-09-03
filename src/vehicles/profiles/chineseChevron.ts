import * as THREE from 'three';
import { orientedSlab } from './kit.ts';

export type ChevronSide = -1 | 1;

export interface ChevronStation {
  readonly x: number;
  readonly upperX?: number;
  readonly ridgeX?: number;
  readonly lowerX?: number;
  readonly upperY: number;
  readonly upperZ: number;
  readonly ridgeY: number;
  readonly ridgeZ: number;
  readonly lowerY: number;
  readonly lowerZ: number;
}

type Vec3 = [number, number, number];

/**
 * One watertight Leopard-style cheek whose upper and lower faces share a
 * physical arrow ridge. The terminal station is buried in the turret side
 * belt, so the cheek cannot read as detached applique.
 */
export function closedIntegratedChevron(
  stations: readonly ChevronStation[],
  side: ChevronSide,
): THREE.BufferGeometry {
  if (stations.length < 2) throw new RangeError('Integrated chevron requires at least two stations');
  const positions: number[] = [];
  const upper = (station: ChevronStation): Vec3 => [
    side * (station.upperX ?? station.x), station.upperY, station.upperZ,
  ];
  const ridge = (station: ChevronStation): Vec3 => [
    side * (station.ridgeX ?? station.x), station.ridgeY, station.ridgeZ,
  ];
  const lower = (station: ChevronStation): Vec3 => [
    side * (station.lowerX ?? station.x), station.lowerY, station.lowerZ,
  ];
  const tri = (a: Vec3, b: Vec3, c: Vec3): void => {
    positions.push(...a, ...b, ...c);
  };
  for (let index = 0; index < stations.length - 1; index++) {
    const a = stations[index];
    const b = stations[index + 1];
    tri(upper(a), ridge(a), ridge(b));
    tri(upper(a), ridge(b), upper(b));
    tri(ridge(a), lower(a), lower(b));
    tri(ridge(a), lower(b), ridge(b));
    tri(lower(a), upper(a), upper(b));
    tri(lower(a), upper(b), lower(b));
  }
  const first = stations[0];
  const last = stations.at(-1)!;
  tri(upper(first), lower(first), ridge(first));
  tri(upper(last), ridge(last), lower(last));

  let signedVolume6 = 0;
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index], ay = positions[index + 1], az = positions[index + 2];
    const bx = positions[index + 3], by = positions[index + 4], bz = positions[index + 5];
    const cx = positions[index + 6], cy = positions[index + 7], cz = positions[index + 8];
    signedVolume6 += ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx);
  }
  if (signedVolume6 < 0) {
    for (let index = 0; index < positions.length; index += 9) {
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[index + 3 + axis];
        positions[index + 3 + axis] = positions[index + 6 + axis];
        positions[index + 6 + axis] = value;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
    new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function interpolateChevronStation(
  stations: readonly ChevronStation[],
  x: number,
): ChevronStation {
  if (x <= stations[0].x) return stations[0];
  for (let index = 0; index < stations.length - 1; index++) {
    const a = stations[index], b = stations[index + 1];
    if (x > b.x && index < stations.length - 2) continue;
    const t = THREE.MathUtils.clamp((x - a.x) / Math.max(1e-6, b.x - a.x), 0, 1);
    const lerp = (key: keyof ChevronStation): number => THREE.MathUtils.lerp(
      (a[key] as number | undefined) ?? a.x,
      (b[key] as number | undefined) ?? b.x,
      t,
    );
    return {
      x,
      upperX: lerp('upperX'), ridgeX: lerp('ridgeX'), lowerX: lerp('lowerX'),
      upperY: lerp('upperY'), upperZ: lerp('upperZ'),
      ridgeY: lerp('ridgeY'), ridgeZ: lerp('ridgeZ'),
      lowerY: lerp('lowerY'), lowerZ: lerp('lowerZ'),
    };
  }
  return stations.at(-1)!;
}

/** Raised cassette inset into the dominant upper face of a chevron. */
export function chevronSurfacePanel(
  a: ChevronStation,
  b: ChevronStation,
  side: ChevronSide,
): THREE.BufferGeometry {
  const point = (station: ChevronStation, key: 'upper' | 'ridge'): THREE.Vector3 => {
    const x = key === 'upper' ? (station.upperX ?? station.x) : (station.ridgeX ?? station.x);
    return new THREE.Vector3(
      side * x,
      key === 'upper' ? station.upperY : station.ridgeY,
      key === 'upper' ? station.upperZ : station.ridgeZ,
    );
  };
  const onFace = (station: ChevronStation, t: number): THREE.Vector3 => (
    point(station, 'ridge').lerp(point(station, 'upper'), t)
  );
  const base = [onFace(a, 0.075), onFace(b, 0.075), onFace(b, 0.915), onFace(a, 0.915)];
  const normal = base[1].clone().sub(base[0])
    .cross(base[3].clone().sub(base[0])).normalize();
  if (normal.y < 0) normal.negate();
  const lift = normal.multiplyScalar(0.024);
  const top = base.map((pointValue) => pointValue.clone().add(lift));
  return orientedSlab(
    base[0].toArray(), base[1].toArray(), base[2].toArray(), base[3].toArray(),
    top[0].toArray(), top[1].toArray(), top[2].toArray(), top[3].toArray(),
  );
}
