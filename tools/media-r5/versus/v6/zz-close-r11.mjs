// Round 11, the close group (close.mjs write): each row is [id, source scene, foe gap in m, family, lens], picked from
// close.mjs solve. The source's staging, effects, light and picture stand; regroup() brings the foe in and the lens is
// the pick's.
import { SCENES } from '../versus.mjs';
import { regroup } from '../close.mjs';

const ROWS = [
  ["f7-t90m-column-low-r11","f7-t90m-column-r5",15,"low",{"name":"a","pos":[32.61,1.1,-209.79],"lookAt":[49.48,1.94,-220.86],"fov":28.14,"rollDeg":9,"groundRel":true}],
  ["f7-t90m-column-high-r11","f7-t90m-column-r5",15,"high",{"name":"a","pos":[29.55,6,-207.22],"lookAt":[49.05,0.22,-220.89],"fov":21.88,"rollDeg":0,"groundRel":true}],
  ["vs01-desert-abrams-t90m-low-r11","vs01-desert-abrams-t90m-r6",9,"low",{"name":"a","pos":[21.29,1.1,295.24],"lookAt":[34.7,2.09,304.15],"fov":31.03,"rollDeg":-9,"groundRel":true}],
  ["vs01-desert-abrams-t90m-high-r11","vs01-desert-abrams-t90m-r6",9,"high",{"name":"a","pos":[15.16,6,290.09],"lookAt":[34.43,0.52,304.29],"fov":20.39,"rollDeg":0,"groundRel":true}],
  ["vs02-verdant-challenger-t80u-low-r11","vs02-verdant-challenger-t80u-r6",9,"low",{"name":"a","pos":[-11.44,1.1,63.63],"lookAt":[-22.27,2.81,59.2],"fov":55.25,"rollDeg":9,"groundRel":true}],
  ["vs02-verdant-challenger-t80u-high-r11","vs02-verdant-challenger-t80u-r6",9,"high",{"name":"a","pos":[-9.58,6,67.64],"lookAt":[-21.54,0.29,60.81],"fov":44.97,"rollDeg":0,"groundRel":true}],
  ["vs03-reservoir-k2-ztz99-low-r11","vs03-reservoir-k2-ztz99-r6",9,"low",{"name":"a","pos":[63.89,0.5,-55.42],"lookAt":[61.75,2.68,-42.42],"fov":36.29,"rollDeg":0,"groundRel":true}],
  ["vs03-reservoir-k2-ztz99-high-r11","vs03-reservoir-k2-ztz99-r6",9,"high",{"name":"a","pos":[67.02,6,-60.15],"lookAt":[62.52,0.38,-42.88],"fov":27.53,"rollDeg":0,"groundRel":true}],
  ["vs04-railyard-leclerc-t14-low-r11","vs04-railyard-leclerc-t14-r6",9,"low",{"name":"a","pos":[-190.17,1.1,-23.16],"lookAt":[-176.47,1.79,-14.84],"fov":26.92,"rollDeg":9,"groundRel":true}],
  ["vs04-railyard-leclerc-t14-high-r11","vs04-railyard-leclerc-t14-r6",9,"high",{"name":"a","pos":[-190.82,6,-33.64],"lookAt":[-176.44,0.79,-14.53],"fov":19.79,"rollDeg":0,"groundRel":true}],
  ["vs05-oasis-merkava-t72b3-low-r11","vs05-oasis-merkava-t72b3-r6",9,"low",{"name":"a","pos":[-405.92,0.8,165.22],"lookAt":[-392.42,2.17,156.24],"fov":36.48,"rollDeg":-9,"groundRel":true}],
  ["vs05-oasis-merkava-t72b3-high-r11","vs05-oasis-merkava-t72b3-r6",9,"high",{"name":"a","pos":[-415.25,6,163.43],"lookAt":[-392.32,1.35,155.98],"fov":23.12,"rollDeg":0,"groundRel":true}],
  ["vs06-coastal-type10-ztz99a2-low-r11","vs06-coastal-type10-ztz99a2-r6",9,"low",{"name":"a","pos":[323.62,0.5,-160.79],"lookAt":[336.59,3.06,-162.54],"fov":39.08,"rollDeg":0,"groundRel":true}],
  ["vs06-coastal-type10-ztz99a2-high-r11","vs06-coastal-type10-ztz99a2-r6",9,"high",{"name":"a","pos":[318.62,6,-160.79],"lookAt":[336.46,0.57,-162.34],"fov":27.21,"rollDeg":0,"groundRel":true}],
  ["vs08-winter-cv90-bmp3-low-r11","vs08-winter-cv90-bmp3-r6",9,"low",{"name":"a","pos":[-207.77,1.1,71.45],"lookAt":[-216.95,1.27,74.32],"fov":61.68,"rollDeg":-9,"groundRel":true}],
  ["vs08-winter-cv90-bmp3-high-r11","vs08-winter-cv90-bmp3-r6",9,"high",{"name":"a","pos":[-202.88,6,70.03],"lookAt":[-215.58,0.22,75],"fov":38.36,"rollDeg":0,"groundRel":true}],
  ["vs09-alpine-strv122-t80bv-low-r11","vs09-alpine-strv122-t80bv-r6",9,"low",{"name":"a","pos":[143.6,1.1,193.28],"lookAt":[149.62,1.7,202.69],"fov":54.24,"rollDeg":-9,"groundRel":true}],
  ["vs09-alpine-strv122-t80bv-high-r11","vs09-alpine-strv122-t80bv-r6",9,"high",{"name":"a","pos":[143.6,9,194.63],"lookAt":[149.25,0.19,202.37],"fov":51.51,"rollDeg":0,"groundRel":true}],
  ["vs10-steppe-chieftain-t64-low-r11","vs10-steppe-chieftain-t64-r6",9,"low",{"name":"a","pos":[242.11,0.5,-81.3],"lookAt":[254.88,2.56,-78.23],"fov":35.73,"rollDeg":0,"groundRel":true}],
  ["vs10-steppe-chieftain-t64-high-r11","vs10-steppe-chieftain-t64-r6",9,"high",{"name":"a","pos":[251.64,9,-89.56],"lookAt":[255.44,0.97,-80.55],"fov":55.82,"rollDeg":0,"groundRel":true}],
  ["vs11-desert-osorio-t90m-low-r11","vs11-desert-osorio-t90m-r9",9,"low",{"name":"a","pos":[21.29,0.5,295.24],"lookAt":[34.38,1.94,304.45],"fov":28.74,"rollDeg":-9,"groundRel":true}],
  ["vs11-desert-osorio-t90m-high-r11","vs11-desert-osorio-t90m-r9",9,"high",{"name":"a","pos":[15.16,6,290.09],"lookAt":[34.18,0.7,304.62],"fov":18.93,"rollDeg":0,"groundRel":true}],
  ["vs12-verdant-leo2a5dk-t80u-low-r11","vs12-verdant-leo2a5dk-t80u-r9",9,"low",{"name":"a","pos":[-11.44,1.1,63.63],"lookAt":[-22.15,1.93,59.61],"fov":52.16,"rollDeg":9,"groundRel":true}],
  ["vs12-verdant-leo2a5dk-t80u-high-r11","vs12-verdant-leo2a5dk-t80u-r9",9,"high",{"name":"a","pos":[-12.87,6,65.14],"lookAt":[-21.31,-0.16,60.41],"fov":56.55,"rollDeg":0,"groundRel":true}],
  ["vs13-reservoir-eet4-type99a-low-r11","vs13-reservoir-eet4-type99a-r9",9,"low",{"name":"a","pos":[63.89,0.5,-55.42],"lookAt":[61.81,2.61,-42.42],"fov":35.87,"rollDeg":0,"groundRel":true}],
  ["vs13-reservoir-eet4-type99a-high-r11","vs13-reservoir-eet4-type99a-r9",9,"high",{"name":"a","pos":[69.81,6,-55.11],"lookAt":[63.22,0.15,-43.11],"fov":38.73,"rollDeg":0,"groundRel":true}],
  ["vs14-railyard-tamoyo3-t14-low-r11","vs14-railyard-tamoyo3-t14-r9",9,"low",{"name":"a","pos":[-189.32,0.5,-24.27],"lookAt":[-176.4,1.58,-14.78],"fov":24.83,"rollDeg":-9,"groundRel":true}],
  ["vs14-railyard-tamoyo3-t14-high-r11","vs14-railyard-tamoyo3-t14-r9",9,"high",{"name":"a","pos":[-190.82,6,-33.64],"lookAt":[-176.43,0.84,-14.52],"fov":19.43,"rollDeg":0,"groundRel":true}],
  ["vs15-oasis-magach6b-t72b3-low-r11","vs15-oasis-magach6b-t72b3-r9",9,"low",{"name":"a","pos":[-404.28,0.5,161.67],"lookAt":[-392.46,1.46,155.9],"fov":38.47,"rollDeg":9,"groundRel":true}],
  ["vs15-oasis-magach6b-t72b3-high-r11","vs15-oasis-magach6b-t72b3-r9",9,"high",{"name":"a","pos":[-415.25,6,163.43],"lookAt":[-392.37,1,156.22],"fov":19.94,"rollDeg":0,"groundRel":true}],
  ["vs16-coastal-leo1a5dk1-ztz99a2-low-r11","vs16-coastal-leo1a5dk1-ztz99a2-r9",9,"low",{"name":"a","pos":[325.62,0.5,-160.79],"lookAt":[336.68,2.39,-162.39],"fov":46.24,"rollDeg":-9,"groundRel":true}],
  ["vs16-coastal-leo1a5dk1-ztz99a2-high-r11","vs16-coastal-leo1a5dk1-ztz99a2-r9",9,"high",{"name":"a","pos":[318.62,6,-160.79],"lookAt":[336.45,0.6,-162.24],"fov":26.98,"rollDeg":0,"groundRel":true}],
  ["vs18-winter-cv9040c-bmp3-low-r11","vs18-winter-cv9040c-bmp3-r9",9,"low",{"name":"a","pos":[-206.04,1.1,70.45],"lookAt":[-216.48,1.58,74.63],"fov":50.63,"rollDeg":-9,"groundRel":true}],
  ["vs18-winter-cv9040c-bmp3-high-r11","vs18-winter-cv9040c-bmp3-r9",9,"high",{"name":"a","pos":[-206.91,6,70.95],"lookAt":[-215.84,-0.39,74.23],"fov":56.98,"rollDeg":0,"groundRel":true}],
  ["vs19-alpine-leo1a5dk-t80bv-low-r11","vs19-alpine-leo1a5dk-t80bv-r9",9,"low",{"name":"a","pos":[143.6,1.1,193.28],"lookAt":[149.73,1.88,202.56],"fov":52.98,"rollDeg":-9,"groundRel":true}],
  ["vs19-alpine-leo1a5dk-t80bv-high-r11","vs19-alpine-leo1a5dk-t80bv-r9",9,"high",{"name":"a","pos":[143.6,6,194.63],"lookAt":[149.27,-0.02,202.73],"fov":56.02,"rollDeg":0,"groundRel":true}],
  ["vs20-steppe-eet3-t64-low-r11","vs20-steppe-eet3-t64-r9",9,"low",{"name":"a","pos":[242.11,0.5,-81.3],"lookAt":[254.88,2.6,-78.34],"fov":35,"rollDeg":0,"groundRel":true}],
  ["vs20-steppe-eet3-t64-high-r11","vs20-steppe-eet3-t64-r9",9,"high",{"name":"a","pos":[237.33,6,-83.29],"lookAt":[254.57,0.21,-78.99],"fov":26.33,"rollDeg":0,"groundRel":true}],
  ["vs21-desert-osorio105-t55a-low-r11","vs21-desert-osorio105-t55a-r10",9,"low",{"name":"a","pos":[21.29,0.5,295.24],"lookAt":[34.48,1.78,304.36],"fov":28.08,"rollDeg":-9,"groundRel":true}],
  ["vs21-desert-osorio105-t55a-high-r11","vs21-desert-osorio105-t55a-r10",9,"high",{"name":"a","pos":[15.16,6,290.09],"lookAt":[34.25,0.54,304.51],"fov":18.44,"rollDeg":0,"groundRel":true}],
  ["vs22-verdant-leo1a3dk-t62-low-r11","vs22-verdant-leo1a3dk-t62-r10",9,"low",{"name":"a","pos":[-11.44,1.1,63.63],"lookAt":[-22.12,1.43,59.78],"fov":50.17,"rollDeg":-9,"groundRel":true}],
  ["vs22-verdant-leo1a3dk-t62-high-r11","vs22-verdant-leo1a3dk-t62-r10",9,"high",{"name":"a","pos":[-12.42,6,63.46],"lookAt":[-21.56,-0.11,59.96],"fov":52.46,"rollDeg":0,"groundRel":true}],
  ["vs23-reservoir-x1a2-bmp2-low-r11","vs23-reservoir-x1a2-bmp2-r10",9,"low",{"name":"a","pos":[63.89,1.1,-53.42],"lookAt":[62.05,1.71,-42.34],"fov":38.81,"rollDeg":9,"groundRel":true}],
  ["vs23-reservoir-x1a2-bmp2-high-r11","vs23-reservoir-x1a2-bmp2-r10",9,"high",{"name":"a","pos":[65.46,6,-60.35],"lookAt":[62.63,0.46,-42.74],"fov":24.17,"rollDeg":0,"groundRel":true}],
  ["vs24-railyard-magach7c-t72b3-low-r11","vs24-railyard-magach7c-t72b3-r10",9,"low",{"name":"a","pos":[-190.17,0.5,-23.16],"lookAt":[-176.43,1.99,-14.94],"fov":27.71,"rollDeg":-9,"groundRel":true}],
  ["vs24-railyard-magach7c-t72b3-high-r11","vs24-railyard-magach7c-t72b3-r10",9,"high",{"name":"a","pos":[-192.49,6,-32.37],"lookAt":[-176.2,1.07,-14.75],"fov":22.04,"rollDeg":0,"groundRel":true}],
  ["vs25-oasis-t49-t55a-low-r11","vs25-oasis-t49-t55a-r10",9,"low",{"name":"a","pos":[-400.52,0.5,160.3],"lookAt":[-392.52,0.78,155.33],"fov":52.09,"rollDeg":9,"groundRel":true}],
  ["vs25-oasis-t49-t55a-high-r11","vs25-oasis-t49-t55a-r10",9,"high",{"name":"a","pos":[-409.45,6,161.88],"lookAt":[-392.65,0.19,156.23],"fov":23.99,"rollDeg":0,"groundRel":true}],
  ["vs26-coastal-cv9035dk-bmp3-low-r11","vs26-coastal-cv9035dk-bmp3-r10",9,"low",{"name":"a","pos":[325.62,0.5,-160.79],"lookAt":[336.68,2.36,-162.46],"fov":44.81,"rollDeg":-9,"groundRel":true}],
  ["vs26-coastal-cv9035dk-bmp3-high-r11","vs26-coastal-cv9035dk-bmp3-r10",9,"high",{"name":"a","pos":[318.62,6,-160.79],"lookAt":[336.41,0.43,-162.25],"fov":25.89,"rollDeg":0,"groundRel":true}],
  ["vs28-winter-m41jgsdf-bmp2-low-r11","vs28-winter-m41jgsdf-bmp2-r10",9,"low",{"name":"a","pos":[-208.2,0.5,70.79],"lookAt":[-217.43,2.24,74.11],"fov":59.75,"rollDeg":-9,"groundRel":true}],
  ["vs28-winter-m41jgsdf-bmp2-mid-r11","vs28-winter-m41jgsdf-bmp2-r10",9,"mid",{"name":"a","pos":[-206.91,2,70.95],"lookAt":[-216.39,0.62,74.65],"fov":53.7,"rollDeg":-6,"groundRel":true}],
  ["vs29-alpine-m41a3-t62-low-r11","vs29-alpine-m41a3-t62-r10",9,"low",{"name":"a","pos":[142.9,1.1,193.92],"lookAt":[149.71,1.8,202.75],"fov":51.17,"rollDeg":-9,"groundRel":true}],
  ["vs29-alpine-m41a3-t62-high-r11","vs29-alpine-m41a3-t62-r10",9,"high",{"name":"a","pos":[143.01,6,195.27],"lookAt":[149.38,0.08,202.89],"fov":53.56,"rollDeg":0,"groundRel":true}],
  ["vs30-steppe-tamoyo1-t55a-low-r11","vs30-steppe-tamoyo1-t55a-r10",9,"low",{"name":"a","pos":[242.11,0.5,-81.3],"lookAt":[254.93,1.98,-78.5],"fov":33.67,"rollDeg":9,"groundRel":true}],
  ["vs30-steppe-tamoyo1-t55a-high-r11","vs30-steppe-tamoyo1-t55a-r10",9,"high",{"name":"a","pos":[231.42,6,-84.33],"lookAt":[254.77,0.68,-79.21],"fov":18.74,"rollDeg":0,"groundRel":true}],
];
for (const [ID, SRC, GAP, FAMILY, LENS] of ROWS) {
  SCENES[ID] = () => {
    const s = regroup(SCENES[SRC](), GAP);
    return { ...s, lenses: [{ ...LENS }], meta: { ...s.meta, id: ID, round: 11, source: SRC, idea: 'the close group, ' + FAMILY + ' lens' } };
  };
}
