// Each map's own authored census views (maps lane, 2026-10-03): the town and landform views the critics' waves read
// beside the fixed set. `visual-census capture --pose=maps` shoots each map's entries here and no other map's; an
// explicit `--pose=name:cx,cy,cz:ax,ay,az` still shoots its views on every map. Same grammar as --pose: the camera and
// the look point, each height over the ground beneath it, several views joined by `+`.
export const CENSUS_MAP_POSES = Object.freeze({
  titan_gorge: 'titan-town:-39,30,-91:46,3,-6',
  skybridge: 'skybridge-town:-14,30,-108:71,3,-23',
  mars: 'mars-town:-52,30,-54:33,3,31',
  foundry: 'foundry-town:-159,30,-114:-74,3,-29',
  alpine: 'alpine-town:-234,30,-59:-149,3,26',
  caldera: 'caldera-town:-121,30,-138:-36,3,-53',
  // wave 35: from (-187, -171) the camera stood against a tower's stucco wall in both builds (byte-identical frames);
  // from the open ground west of the district it looks across the crossroads, the avenue and the civic hall
  blackglass: 'blackglass-town:-270,35,-60:-110,3,-60',
  // the west lane's jebel: its east wall from tank height 31 m off, and from 60 m up south-east of it
  badlands: 'redrock-jebel-close:-70,2.5,-130:-99,11,-128+redrock-jebel-60:-20,60,-200:-118,8,-128',
});
