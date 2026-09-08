// Explicit bounded QA only. Uses the retained production Three module and
// rendered world, not rebuilt geometry or a substituted visibility criterion.
export async function collectNightWindowCensus({ moduleUrl, limit = 256 }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) throw new Error('Census limit must be 1–256');
  const d = window.__DEBUG, root = d.world.group, reference = d.camera.position;
  const module = await import(moduleUrl);
  const Raycaster = Object.values(module).find(value => value?.prototype?.setFromCamera && value?.prototype?.intersectObject);
  if (!Raycaster) throw new Error('Actual production Three raycaster is required');
  function visible(object) {
    for (let parent = object; parent; parent = parent.parent) {
      if (!parent.visible) return false;
      if (parent === root) return true;
    }
    return false;
  }
  function triangle(mesh, offset, candidates) {
    const g = mesh.geometry, mask = g.getAttribute('nightEmissionMask');
    const position = g.getAttribute('position'), normal = g.getAttribute('normal');
    const ids = [0, 1, 2].map(i => g.index?.getX(offset + i) ?? offset + i);
    if (ids.some(i => mask.getX(i) !== 1)) return;
    const direction = reference.clone().fromBufferAttribute(normal, ids[0]).transformDirection(mesh.matrixWorld);
    if (Math.abs(direction.y) > .25) return;
    const point = reference.clone().set(0, 0, 0), vertices = [];
    for (const id of ids) {
      const vertex = reference.clone().fromBufferAttribute(position, id);
      vertices.push(vertex.toArray()); point.add(vertex);
    }
    point.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    candidates.push({ mesh, faceIndex: offset / 3, point, direction, vertices, score: point.distanceToSquared(reference) });
  }
  function hitReceipt(hit) {
    return hit ? { owner: hit.object.name, type: hit.object.type, uuid: hit.object.uuid,
      material: hit.object.material?.name ?? null, faceIndex: hit.faceIndex,
      instanceId: hit.instanceId ?? null, distance: hit.distance, point: hit.point.toArray() } : null;
  }
  function inspect(candidate, rank) {
    const side = reference.clone().set(-candidate.direction.z, 0, candidate.direction.x);
    const camera = candidate.point.clone().addScaledVector(candidate.direction, 4).addScaledVector(side, .65);
    camera.y += .25;
    const delta = candidate.point.clone().sub(camera), distance = delta.length();
    const ray = new Raycaster(camera.clone(), delta.normalize(), .02, distance + .02);
    const hit = ray.intersectObject(root, true).find(hit => visible(hit.object));
    const frontPass = hit?.object === candidate.mesh && hit?.faceIndex === candidate.faceIndex;
    const outward = camera.clone().sub(candidate.point).normalize();
    ray.set(candidate.point.clone().addScaledVector(outward, .03), outward); ray.far = distance - .03;
    const reverse = ray.intersectObject(root, true).find(hit => visible(hit.object));
    return { rank, owner: candidate.mesh.name, ownerUuid: candidate.mesh.uuid, faceIndex: candidate.faceIndex,
      vertices: candidate.vertices, point: candidate.point.toArray(), normal: candidate.direction.toArray(),
      camera: camera.toArray(), distance, referenceDistance: Math.sqrt(candidate.score),
      frontPass, hit: hitReceipt(hit), reverse: hitReceipt(reverse), pass: frontPass && !reverse };
  }
  root.updateWorldMatrix(true, true);
  const candidates = [], owners = [];
  root.traverseVisible(mesh => {
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.material.userData.nightLightKind !== 'window') return;
    const g = mesh.geometry;
    if (!g.getAttribute('nightEmissionMask') || !g.getAttribute('position') || !g.getAttribute('normal')) return;
    owners.push({ name: mesh.name, uuid: mesh.uuid, positions: g.getAttribute('position').count });
    for (let offset = 0, count = g.index?.count ?? g.getAttribute('position').count; offset < count; offset += 3) {
      triangle(mesh, offset, candidates);
    }
  });
  candidates.sort((a, b) => a.score - b.score);
  const rows = candidates.slice(0, limit).map(inspect);
  return { candidateCount: candidates.length, scanned: rows.length, limit, owners,
    originalInspection: d.inspectNightWindow(), firstPassingRank: rows.find(row => row.pass)?.rank ?? null,
    withinOriginal64: rows.some(row => row.rank < 64 && row.pass), rows,
    worldUuid: root.uuid, mapId: d.world.mapId,
    camera: [d.camera.position.toArray(), d.camera.quaternion.toArray(), d.camera.fov] };
}
