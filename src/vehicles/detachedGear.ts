import { Box3, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3,
  type BufferGeometry, type Material, type Object3D } from 'three';

type Surface = (x: number, z: number, ceiling?: number) => number;
interface Body {
  position: Vector3; rotation: Quaternion; scale: Vector3; velocity: Vector3; spin: Vector3;
  half: Vector3; center: Vector3; wheel: boolean; age: number; sleeping: boolean;
}
const one = new Vector3(1, 1, 1);

/** Bounded cosmetic rigid bodies. Coordinates are in the world, while the
 * owning tank retains lifetime/disposal ownership. No authority or collision
 * state depends on frame rate, or on whether these details are rendered. */
export class DetachedGear {
  readonly root = new Group();
  readonly pads: InstancedMesh;
  readonly wheel = new Group();
  private bodies: Body[] = [];
  private active = false;
  private inverse = new Matrix4();
  private matrix = new Matrix4();
  private corner = new Vector3();
  private angular = new Quaternion();
  private rotationEulerAxis = new Vector3();
  private supportNormal = new Vector3();
  private bodyAxis = new Vector3();
  private restingRotation = new Quaternion();
  private parent: Object3D;

  constructor(parent: Object3D, geometry: BufferGeometry, material: Material, count: number) {
    this.parent = parent;
    this.root.name = 'detachedRunningGear';
    this.root.matrixAutoUpdate = false;
    this.root.visible = false;
    this.pads = new InstancedMesh(geometry, material, count);
    this.pads.name = 'gearThrownLinks';
    this.pads.frustumCulled = false;
    this.pads.receiveShadow = true;
    this.root.add(this.pads, this.wheel);
    parent.add(this.root);
  }

  addWheelLayer(geometry: BufferGeometry, material: Material | Material[], x: number, y: number, z: number): void {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.wheel.add(mesh);
  }

  launch(x: number, y: number, rearZ: number, wheelPosition: Vector3, side: number,
    seed: number, inheritedVelocity: Vector3): void {
    this.parent.updateWorldMatrix(true, false);
    const frame = this.parent.matrixWorld;
    const orientation = new Quaternion(), scale = new Vector3();
    frame.decompose(new Vector3(), orientation, scale);
    const random = (i: number): number => { const v = Math.sin(seed * 41.7 + i * 127.1) * 43758.5453; return v - Math.floor(v); };
    const makeBody = (local: Vector3, box: Box3, i: number, wheel: boolean): Body => ({
      position: local.applyMatrix4(frame), rotation: orientation.clone(), scale: scale.clone(),
      velocity: new Vector3(side * (wheel ? 2.8 : .6 + random(i) * 1.2),
        wheel ? 2.3 : .5 + random(i + 30) * 1.8, -1.2 - random(i + 60)).applyQuaternion(orientation).add(inheritedVelocity),
      spin: new Vector3((random(i + 90) - .5) * 7, (random(i + 120) - .5) * 4,
        side * (wheel ? 6 : 2)).applyQuaternion(orientation),
      half: box.getSize(new Vector3()).multiplyScalar(.5), center: box.getCenter(new Vector3()), wheel, age: 0, sleeping: false,
    });
    this.bodies.length = 0;
    this.pads.geometry.computeBoundingBox();
    const padBox = this.pads.geometry.boundingBox!;
    for (let i = 0; i < this.pads.count; i++) {
      // Start at the actual running gear. Motion, gravity and contact decide
      // where each loose shoe lands, never a prebuilt ground-shaped ribbon.
      this.bodies.push(makeBody(new Vector3(x, y + .2 + Math.sin(i * .25) * .15,
        rearZ + i * .18), padBox, i, false));
    }
    this.wheel.position.set(0, 0, 0); this.wheel.quaternion.identity(); this.wheel.scale.copy(one);
    this.wheel.updateMatrixWorld(true);
    const wheelBox = new Box3();
    for (const child of this.wheel.children) {
      const mesh = child as Mesh;
      mesh.geometry.computeBoundingBox(); mesh.updateMatrix();
      wheelBox.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix));
    }
    if (!wheelBox.isEmpty()) this.bodies.push(makeBody(wheelPosition.clone(), wheelBox, 200, true));
    this.active = true; this.root.visible = true;
    this.update(0);
  }

  reset(): void { this.active = false; this.root.visible = false; this.bodies.length = 0; }

  update(dt: number, ground?: Surface): void {
    if (!this.active) return;
    this.parent.updateWorldMatrix(true, false);
    this.root.matrix.copy(this.inverse.copy(this.parent.matrixWorld).invert());
    this.root.matrixWorldNeedsUpdate = true;
    const elapsed = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    const steps = Math.max(1, Math.ceil(elapsed * 120)), step = elapsed / steps;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (ground && !b.sleeping && step > 0) for (let n = 0; n < steps; n++) this.integrate(b, step, ground);
      this.matrix.compose(b.position, b.rotation, b.scale);
      if (i < this.pads.count) this.pads.setMatrixAt(i, this.matrix);
      else { this.wheel.position.copy(b.position); this.wheel.quaternion.copy(b.rotation); this.wheel.scale.copy(b.scale); }
    }
    this.pads.instanceMatrix.needsUpdate = true;
  }

  private integrate(b: Body, dt: number, ground: Surface): void {
    b.age += dt;
    b.velocity.y -= 9.81 * dt;
    b.position.addScaledVector(b.velocity, dt);
    const speed = b.spin.length();
    if (speed > .001) {
      this.rotationEulerAxis.copy(b.spin).multiplyScalar(1 / speed);
      b.rotation.premultiply(this.angular.setFromAxisAngle(this.rotationEulerAxis, speed * dt)).normalize();
    }
    const lift = this.contactLift(b, ground);
    if (lift >= 0) {
      b.position.y += lift;
      if (b.velocity.y < -.9) b.velocity.y *= -.22; else b.velocity.y = 0;
      const friction = Math.exp(-dt * 6);
      b.velocity.x *= friction; b.velocity.z *= friction; b.spin.multiplyScalar(Math.exp(-dt * 8));
      const aligned = this.settleRotation(b, dt, ground);
      // Allow the body to finish settling before sleeping. Sleeping retains
      // world coordinates even while the damaged tank drives away.
      if (aligned && b.age > .5 && b.velocity.lengthSq() < .015 && b.spin.lengthSq() < .02) b.sleeping = true;
    }
  }
  private settleRotation(b: Body, dt: number, ground: Surface): boolean {
    if (b.age <= .35 || Math.abs(b.velocity.y) >= .7) return true;
    // Gravity tips a loose shoe onto its broad face, and a slowing wheel
    // onto its side. Contact friction alone leaves rigid boxes balanced
    // on an arbitrary edge forever. Preserve yaw and the nearest face.
    const x = b.position.x, z = b.position.z, ceiling = b.position.y + 1;
    this.supportNormal.set(ground(x - .25, z, ceiling) - ground(x + .25, z, ceiling),
      .5, ground(x, z - .25, ceiling) - ground(x, z + .25, ceiling)).normalize();
    this.bodyAxis.set(b.wheel ? 1 : 0, b.wheel ? 0 : 1, 0).applyQuaternion(b.rotation);
    if (this.bodyAxis.dot(this.supportNormal) < 0) this.supportNormal.negate();
    this.angular.setFromUnitVectors(this.bodyAxis, this.supportNormal);
    this.restingRotation.copy(this.angular).multiply(b.rotation);
    b.rotation.slerp(this.restingRotation, 1 - Math.exp(-dt * (b.wheel ? 5 : 14)));
    const aligned = b.rotation.angleTo(this.restingRotation) < .025;
    // Re-seat after tipping; retain the rotated footprint's clearance.
    const lift = this.contactLift(b, ground);
    if (Number.isFinite(lift)) b.position.y += lift;
    return aligned;
  }

  private contactLift(b: Body, ground: Surface): number {
    let lift = -Infinity;
    for (let mask = 0; mask < (b.wheel ? 32 : 8); mask++) {
      if (b.wheel) {
        const angle = (mask >> 1) * Math.PI / 8;
        this.corner.set(b.center.x + (mask & 1 ? b.half.x : -b.half.x),
          b.center.y + Math.cos(angle) * b.half.y, b.center.z + Math.sin(angle) * b.half.z);
      } else this.corner.set(b.center.x + (mask & 1 ? b.half.x : -b.half.x),
        b.center.y + (mask & 2 ? b.half.y : -b.half.y), b.center.z + (mask & 4 ? b.half.z : -b.half.z));
      this.corner.multiply(b.scale).applyQuaternion(b.rotation).add(b.position);
      const height = ground(this.corner.x, this.corner.z, this.corner.y + .3);
      if (Number.isFinite(height)) lift = Math.max(lift, height + .012 - this.corner.y);
    }
    return lift;
  }

}
