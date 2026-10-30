const m = await import('../../tools/envelope-census.mjs');
const f = await m.loadMeasurementFleet();
const id = process.argv[2] || 't90';
let info = null;
const row = m.measureEnvelope(id, f, { edit: (tank) => {
  const parts = tank.root.userData.combatGeometryParts;
  const turret = parts.filter((p) => p.bucket === 'turret');
  info = turret.map((p) => [p.min.map((v) => v.toFixed(2)).join(','), p.max.map((v) => v.toFixed(2)).join(',')]);
  const meshes = []; tank.root.traverse((o) => { if (o.name === 'turret') meshes.push([o.type, o.parent?.name, o.position.toArray(), o.rotation.toArray().slice(0,3), o.scale.toArray()]); });
  console.log(JSON.stringify(meshes));
}});
console.log(JSON.stringify(info));
console.log(JSON.stringify(row.turret));
const a = f.authoredCombatAnatomy(id); console.log(JSON.stringify(m.mainPlateBox(a.armor.turretPlates)));
