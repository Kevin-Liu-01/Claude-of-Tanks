import * as THREE from 'three';

/** One bounded inspection burst, reused between actions and owned by the Gallery. */
export function createDamageBurst(scene: THREE.Scene) {
  const count = 40, positions = new Float32Array(count * 3), velocities = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xffbd64, size: .07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const points = new THREE.Points(geometry, material); points.visible = false; points.frustumCulled = false;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffdfa1, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.visible = false; scene.add(points, flash);
  let age = 2;
  return {
    play(point: THREE.Vector3) {
      age = 0; points.position.copy(point); flash.position.copy(point); points.visible = flash.visible = true;
      positions.fill(0);
      for (let index = 0; index < count; index++) {
        const angle = index * 2.399963, vertical = 1 - 2 * (index + .5) / count, radial = Math.sqrt(1 - vertical * vertical);
        velocities[index * 3] = Math.cos(angle) * radial * 2;
        velocities[index * 3 + 1] = vertical * 2 + 1;
        velocities[index * 3 + 2] = Math.sin(angle) * radial * 2;
      }
      material.opacity = 1; geometry.attributes.position.needsUpdate = true;
    },
    update(dt: number) {
      if (age >= 1.2) return;
      age += Math.min(dt, .05);
      for (let index = 0; index < count; index++) for (let axis = 0; axis < 3; axis++) positions[index * 3 + axis] = velocities[index * 3 + axis] * age - (axis === 1 ? 2 * age * age : 0);
      geometry.attributes.position.needsUpdate = true;
      material.opacity = Math.max(0, 1 - age / 1.2); flash.material.opacity = Math.max(0, 1 - age * 5); flash.scale.setScalar(1 + age * 4);
      if (age >= 1.2) points.visible = flash.visible = false;
    },
    clear() { age = 2; points.visible = flash.visible = false; },
    dispose() { points.removeFromParent(); flash.removeFromParent(); geometry.dispose(); material.dispose(); flash.geometry.dispose(); flash.material.dispose(); },
  };
}
