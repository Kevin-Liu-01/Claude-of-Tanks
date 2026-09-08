// Explicit, bounded diagnostic against the retained native production scene.
// No selection exemption: every candidate retains the original exact-face and
// reverse-ray gate, including failed owners, instances and first occluders.
export async function collectNightFixtureCensus({ moduleUrl, kind, limit = 256 }) {
  if (!['relay-beacon', 'headlight'].includes(kind)) throw new Error('Unsupported fixture census');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) throw new Error('Census limit must be 1–256');
  const d = window.__DEBUG, root = kind === 'headlight' ? d.game.player.visual.root : d.world.group;
  const reference = d.camera.position, module = await import(moduleUrl);
  const Raycaster = Object.values(module).find(value => value?.prototype?.setFromCamera && value?.prototype?.intersectObject);
  const Matrix3 = Object.values(module).find(value => value?.prototype?.getNormalMatrix);
  const Matrix4 = Object.values(module).find(value => value?.prototype?.makePerspective && value?.prototype?.compose);
  if (!Raycaster || !Matrix3 || !Matrix4) throw new Error('Actual production Three math is required');
  const view = kind === 'headlight' ? { mask: 1, distance: 4, normalY: .25, originalLimit: 64 }
    : { mask: 2, distance: 5, normalY: .35, originalLimit: 128 };
  const ancestry = object => {
    const rows = [];
    for (let p = object; p; p = p.parent) {
      rows.push({ name: p.name, type: p.type, visible: p.visible, layers: p.layers.mask });
      if (p === root) break;
    }
    return rows;
  };
  const visible = object => ancestry(object).every(owner => owner.visible);
  const owners = [], candidates = [];
  const hitReceipt = hit => hit ? { owner: hit.object.name, type: hit.object.type, uuid: hit.object.uuid,
    faceIndex: hit.faceIndex, instanceId: hit.instanceId ?? null, point: hit.point.toArray(),
    distance: hit.distance, ancestry: ancestry(hit.object) } : null;
  function append(mesh, matrix, slot) {
    const g = mesh.geometry, mask = g.getAttribute('nightEmissionMask');
    const position = g.getAttribute('position'), normal = g.getAttribute('normal');
    if (!mask || !position || !normal) return;
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    for (let offset = 0, count = g.index?.count ?? position.count; offset < count; offset += 3) {
      const ids = [0, 1, 2].map(i => g.index?.getX(offset + i) ?? offset + i);
      if (ids.some(i => mask.getX(i) !== view.mask)) continue;
      const point = reference.clone().set(0, 0, 0), direction = point.clone();
      for (const index of ids) {
        point.add(reference.clone().fromBufferAttribute(position, index));
        if (kind !== 'headlight' || index === ids[0]) direction.add(reference.clone().fromBufferAttribute(normal, index));
      }
      direction.normalize().applyNormalMatrix(normalMatrix);
      point.multiplyScalar(1 / 3).applyMatrix4(matrix);
      candidates.push({ mesh, slot, faceIndex: offset / 3, point, direction, score: point.distanceToSquared(reference),
        normalEligible: Math.abs(direction.y) <= view.normalY });
    }
  }
  root.updateWorldMatrix(true, true);
  root.traverse(mesh => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const semantic = mesh.material.userData;
    if (kind === 'relay-beacon' ? mesh.name !== 'destructible-relaystation' : semantic.nightEmissionMask !== true) return;
    const activity = mesh.geometry.getAttribute('nightFixtureActive');
    const owner = { name: mesh.name, uuid: mesh.uuid, ancestry: ancestry(mesh),
      masked: semantic.nightEmissionMask === true, materialKind: semantic.nightLightKind ?? null,
      positions: mesh.geometry.getAttribute('position')?.count, slots: [] };
    owners.push(owner);
    if (!visible(mesh) || !owner.masked || kind === 'relay-beacon' && owner.materialKind !== 'fixture') return;
    if (!mesh.isInstancedMesh) { append(mesh, mesh.matrixWorld, null); return; }
    const local = new Matrix4(), matrix = new Matrix4();
    for (let slot = 0; slot < mesh.count; slot++) {
      mesh.getMatrixAt(slot, local); matrix.multiplyMatrices(mesh.matrixWorld, local);
      const active = activity?.getX(slot) ?? null, determinant = matrix.determinant();
      owner.slots.push({ slot, active, determinant, matrix: matrix.toArray() });
      if (active === null || active < .5 || Math.abs(determinant) < 1e-8) continue;
      append(mesh, matrix, slot);
    }
  });
  const rows = candidates.filter(candidate => candidate.normalEligible).sort((a, b) => a.score - b.score)
    .slice(0, limit).map((candidate, rank) => {
      const side = reference.clone().set(-candidate.direction.z, 0, candidate.direction.x);
      if (kind !== 'headlight') side.normalize();
      const camera = candidate.point.clone().addScaledVector(candidate.direction, view.distance).addScaledVector(side, .65);
      camera.y += .25;
      const delta = candidate.point.clone().sub(camera), distance = delta.length();
      const ray = new Raycaster(camera.clone(), delta.normalize(), .02, distance + .02);
      const hit = ray.intersectObject(root, true).find(hit => visible(hit.object));
      const frontPass = hit?.object === candidate.mesh && hit?.faceIndex === candidate.faceIndex
        && (hit?.instanceId ?? null) === candidate.slot;
      const outward = camera.clone().sub(candidate.point).normalize();
      ray.set(candidate.point.clone().addScaledVector(outward, .03), outward); ray.far = distance - .03;
      const reverse = ray.intersectObject(root, true).find(hit => visible(hit.object));
      return { rank, owner: candidate.mesh.name, ownerUuid: candidate.mesh.uuid, slot: candidate.slot,
        faceIndex: candidate.faceIndex, mask: view.mask, point: candidate.point.toArray(), normal: candidate.direction.toArray(),
        camera: camera.toArray(), hit: hitReceipt(hit), reverse: hitReceipt(reverse), frontPass, pass: frontPass && !reverse };
    });
  return { kind, owners, candidateCount: candidates.length, normalRejected: candidates.filter(row => !row.normalEligible).length,
    scanned: rows.length, limit, originalLimit: view.originalLimit,
    firstPassingRank: rows.find(row => row.pass)?.rank ?? null,
    originalInspection: kind === 'headlight' ? d.inspectNightHeadlight() : d.inspectNightWorldFixture(kind),
    roleCaveat: kind === 'headlight' ? 'Census records every warm masked face; original inspector additionally requires nearest registered driving-lamp role.' : null,
    rows, worldUuid: d.world.group.uuid, mapId: d.world.mapId, playerCoverage: d.game.player.visual.root.userData.nightLightCoverage,
    camera: [d.camera.position.toArray(), d.camera.quaternion.toArray(), d.camera.fov] };
}
