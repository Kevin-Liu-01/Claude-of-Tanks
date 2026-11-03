// Round 12, the close group (close.mjs write): each row is [id, source scene, foe gap in m, family, lens], picked from
// close.mjs solve. The source's staging, effects, light and picture stand; regroup() brings the foe in and the lens is
// the pick's.
import { SCENES } from '../versus.mjs';
import { regroup } from '../close.mjs';

const ROWS = [
  ["f7-t90m-column-low-r12","f7-t90m-column-r5",15,"low",{"name":"a","pos":[35.72,1.1,-218.2],"lookAt":[49.62,2.81,-219.76],"fov":52.2,"rollDeg":-9,"groundRel":true}],
  ["vs01-desert-abrams-t90m-low-r12","vs01-desert-abrams-t90m-r6",9,"low",{"name":"a","pos":[22.59,1.1,304.56],"lookAt":[33.79,2.78,303.95],"fov":59.44,"rollDeg":9,"groundRel":true}],
  ["vs01-desert-abrams-t90m-tele-r12","vs01-desert-abrams-t90m-r6",9,"tele",{"name":"a","pos":[1.82,6,290.73],"lookAt":[33.82,1.06,304.87],"fov":16.14,"rollDeg":-5,"groundRel":true}],
  ["vs03-reservoir-k2-ztz99-low-r12","vs03-reservoir-k2-ztz99-r6",9,"low",{"name":"a","pos":[72.32,1.1,-49.49],"lookAt":[63.69,2.29,-42.76],"fov":58.11,"rollDeg":-9,"groundRel":true}],
  ["vs04-railyard-leclerc-t14-mid-r12","vs04-railyard-leclerc-t14-r6",9,"mid",{"name":"a","pos":[-188.32,3.2,-20.48],"lookAt":[-176.45,0.14,-15.21],"fov":37.43,"rollDeg":0,"groundRel":true}],
  ["vs04-railyard-leclerc-t14-low-r12","vs04-railyard-leclerc-t14-r6",9,"low",{"name":"a","pos":[-188.84,1.5,-19.48],"lookAt":[-176.45,1.05,-15.19],"fov":39.61,"rollDeg":-9,"groundRel":true}],
  ["vs05-oasis-merkava-t72b3-low-r12","vs05-oasis-merkava-t72b3-r6",9,"low",{"name":"a","pos":[-409.38,1.5,167.22],"lookAt":[-392.27,2.15,156.52],"fov":27.51,"rollDeg":0,"groundRel":true}],
  ["vs08-winter-cv90-bmp3-low-r12","vs08-winter-cv90-bmp3-r6",9,"low",{"name":"a","pos":[-207.11,1.1,72.87],"lookAt":[-216.39,1.69,74.55],"fov":63.28,"rollDeg":-9,"groundRel":true}],
  ["vs10-steppe-chieftain-t64-low-r12","vs10-steppe-chieftain-t64-r6",9,"low",{"name":"a","pos":[247.99,1.1,-88.59],"lookAt":[254.57,2.15,-79.72],"fov":58.5,"rollDeg":-9,"groundRel":true}],
  ["vs10-steppe-chieftain-t64-high-r12","vs10-steppe-chieftain-t64-r6",9,"high",{"name":"a","pos":[234.27,12,-92.16],"lookAt":[254.66,0.49,-80.2],"fov":22.25,"rollDeg":0,"groundRel":true}],
  ["vs11-desert-osorio-t90m-mid-r12","vs11-desert-osorio-t90m-r9",9,"mid",{"name":"a","pos":[24.15,3.2,302.1],"lookAt":[34.34,-0.39,303.68],"fov":56.57,"rollDeg":-6,"groundRel":true}],
  ["vs12-verdant-leo2a5dk-t80u-low-r12","vs12-verdant-leo2a5dk-t80u-r9",9,"low",{"name":"a","pos":[-10.49,1.1,67.22],"lookAt":[-21.88,1.79,60.85],"fov":46.52,"rollDeg":-9,"groundRel":true}],
  ["vs13-reservoir-eet4-type99a-low-r12","vs13-reservoir-eet4-type99a-r9",9,"low",{"name":"a","pos":[72.91,1.1,-48.73],"lookAt":[63.88,2.15,-42.52],"fov":59.56,"rollDeg":-9,"groundRel":true}],
  ["vs14-railyard-tamoyo3-t14-mid-r12","vs14-railyard-tamoyo3-t14-r9",9,"mid",{"name":"a","pos":[-190.17,3.2,-23.16],"lookAt":[-176.57,0.59,-14.79],"fov":26.6,"rollDeg":0,"groundRel":true}],
  ["vs14-railyard-tamoyo3-t14-tele-r12","vs14-railyard-tamoyo3-t14-r9",9,"tele",{"name":"a","pos":[-203.87,6,-36.48],"lookAt":[-176.73,1.18,-14.39],"fov":11.64,"rollDeg":0,"groundRel":true}],
  ["vs15-oasis-magach6b-t72b3-low-r12","vs15-oasis-magach6b-t72b3-r9",9,"low",{"name":"a","pos":[-401.59,1.5,162.72],"lookAt":[-392.92,0.35,155.77],"fov":49.33,"rollDeg":-9,"groundRel":true}],
  ["vs16-coastal-leo1a5dk1-ztz99a2-mid-r12","vs16-coastal-leo1a5dk1-ztz99a2-r9",9,"mid",{"name":"a","pos":[326.96,3.2,-158.2],"lookAt":[336.14,-0.04,-162.65],"fov":53.94,"rollDeg":-6,"groundRel":true}],
  ["vs16-coastal-leo1a5dk1-ztz99a2-low-r12","vs16-coastal-leo1a5dk1-ztz99a2-r9",9,"low",{"name":"a","pos":[325.36,1.5,-154.29],"lookAt":[336.31,1.26,-161.35],"fov":45.07,"rollDeg":-9,"groundRel":true}],
  ["vs18-winter-cv9040c-bmp3-mid-r12","vs18-winter-cv9040c-bmp3-r9",9,"mid",{"name":"a","pos":[-206.17,2,72.53],"lookAt":[-216.01,0.76,74.86],"fov":57.57,"rollDeg":-6,"groundRel":true}],
  ["vs19-alpine-leo1a5dk-t80bv-low-r12","vs19-alpine-leo1a5dk-t80bv-r9",9,"low",{"name":"a","pos":[144.89,1.5,194.81],"lookAt":[149.51,2.02,203],"fov":63.24,"rollDeg":-9,"groundRel":true}],
  ["vs20-steppe-eet3-t64-low-r12","vs20-steppe-eet3-t64-r9",9,"low",{"name":"a","pos":[247.28,1.1,-87.94],"lookAt":[254.64,2.32,-79.72],"fov":54.82,"rollDeg":-9,"groundRel":true}],
  ["vs21-desert-osorio105-t55a-low-r12","vs21-desert-osorio105-t55a-r10",9,"low",{"name":"a","pos":[23.58,1.1,300.87],"lookAt":[34.3,1.96,304.09],"fov":46.98,"rollDeg":0,"groundRel":true}],
  ["vs22-verdant-leo1a3dk-t62-low-r12","vs22-verdant-leo1a3dk-t62-r10",9,"low",{"name":"a","pos":[-12.3,1.1,66.37],"lookAt":[-21.94,1.6,60.9],"fov":52.17,"rollDeg":-9,"groundRel":true}],
  ["vs23-reservoir-x1a2-bmp2-low-r12","vs23-reservoir-x1a2-bmp2-r10",9,"low",{"name":"a","pos":[65.8,1.5,-53.26],"lookAt":[62.3,1.02,-42.64],"fov":39.8,"rollDeg":-9,"groundRel":true}],
  ["vs24-railyard-magach7c-t72b3-mid-r12","vs24-railyard-magach7c-t72b3-r10",9,"mid",{"name":"a","pos":[-197.54,3.2,-28.32],"lookAt":[-176.6,1.53,-14.61],"fov":17.28,"rollDeg":0,"groundRel":true}],
  ["vs24-railyard-magach7c-t72b3-low-r12","vs24-railyard-magach7c-t72b3-r10",9,"low",{"name":"a","pos":[-187.68,1.5,-16.83],"lookAt":[-176.36,1.31,-15.74],"fov":53.61,"rollDeg":-9,"groundRel":true}],
  ["vs25-oasis-t49-t55a-low-r12","vs25-oasis-t49-t55a-r10",9,"low",{"name":"a","pos":[-400.22,1.1,161.03],"lookAt":[-392.86,-0.42,155.44],"fov":55.38,"rollDeg":0,"groundRel":true}],
  ["vs26-coastal-cv9035dk-bmp3-low-r12","vs26-coastal-cv9035dk-bmp3-r10",9,"low",{"name":"a","pos":[325.66,1.5,-159.83],"lookAt":[336.57,1.43,-162.55],"fov":44.4,"rollDeg":9,"groundRel":true}],
  ["vs30-steppe-tamoyo1-t55a-mid-r12","vs30-steppe-tamoyo1-t55a-r10",9,"mid",{"name":"a","pos":[242.5,3.2,-83.53],"lookAt":[254.57,0.3,-78.76],"fov":35.74,"rollDeg":6,"groundRel":true}],
  ["vs30-steppe-tamoyo1-t55a-low-r12","vs30-steppe-tamoyo1-t55a-r10",9,"low",{"name":"a","pos":[244.72,1.1,-83.92],"lookAt":[254.62,1.54,-78.69],"fov":45.21,"rollDeg":0,"groundRel":true}],
];
for (const [ID, SRC, GAP, FAMILY, LENS] of ROWS) {
  SCENES[ID] = () => {
    const s = regroup(SCENES[SRC](), GAP);
    return { ...s, lenses: [{ ...LENS }], meta: { ...s.meta, id: ID, round: 12, source: SRC, idea: 'the close group, ' + FAMILY + ' lens' } };
  };
}
