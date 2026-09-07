// Original turned solids, inferred from the cited Army photographs. These are
// deliberately not source-mesh measurements or reused donor-wheel profiles.
import * as THREE from 'three';

type RadiusDepth = readonly [radius: number, outward: number];

function closedDish(face: readonly RadiusDepth[]): THREE.BufferGeometry {
  // From the negative-axis hub, round the outside and return along the positive
  // face. The continuous profile closes both bowls and the load-bearing core.
  const profile = [
    ...face.map(([radius, depth]) => new THREE.Vector2(radius, -depth)),
    ...[...face].reverse().map(([radius, depth]) => new THREE.Vector2(radius, depth)),
  ];
  return new THREE.LatheGeometry(profile, 48).rotateZ(-Math.PI / 2);
}

function rubberShoulder(radius: number, width: number, inner: number): THREE.BufferGeometry {
  // Preserve the former rubber envelope: R at W, with the existing 0.94R
  // shoulder at 1.03W. Only the hidden filled center is opened for real steel.
  return new THREE.LatheGeometry([
    [inner, -width * .515], [radius * .94, -width * .515],
    [radius * .94, width * .515], [inner, width * .515], [inner, -width * .515],
  ].map(([r, x]) => new THREE.Vector2(r, x)), 48).rotateZ(-Math.PI / 2);
}

export function arietePhotoWheelSolids(): {
  core: THREE.BufferGeometry; shoulder: THREE.BufferGeometry;
} {
  // 2016 Army side photograph: shallow broad bowl, small raised central hub,
  // rolled outer lip. The exact depths are explicit construction estimates.
  return {
    core: closedDish([[0, .229], [.044, .229], [.065, .212], [.077, .174],
      [.088, .119], [.139, .108], [.203, .125], [.261, .160],
      [.292, .191], [.305, .204], [.316, .204]]),
    shoulder: rubberShoulder(.347, .39, .314),
  };
}

export function strv122PhotoWheelSolids(): {
  core: THREE.BufferGeometry; shoulder: THREE.BufferGeometry;
} {
  // VIRIN 180604-A-OY408-399: deep curved stamped bowl, localized hub and
  // narrow proud rim. No conspicuous generic star-spokes or painted recess.
  return {
    core: closedDish([[0, .194], [.041, .194], [.064, .181], [.078, .132],
      [.093, .086], [.142, .079], [.202, .099], [.259, .144],
      [.289, .181], [.306, .208], [.313, .208]]),
    shoulder: rubberShoulder(.345, .40, .311),
  };
}
