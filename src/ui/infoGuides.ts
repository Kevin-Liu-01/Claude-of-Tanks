import { createGuidePhoto } from './infoGuidePhoto.ts';
import { VEHICLE_TECHNICAL_GUIDES } from './infoGuideCaptures.ts';
import { iconUrl } from './icons.ts';
import { t } from './i18n.ts';
import type { InfoGuideId } from './infoGuideTypes.ts';
import { INFO_GUIDE_DIAGRAMS } from './infoGuideCatalog.ts';

const CSS = `
.cot-guide{display:grid;gap:16px;min-width:0}.cot-guide__overview{margin:0;color:#d1dce2;font-size:16px;line-height:1.65;max-width:76ch}
.cot-guide__figure{margin:0;border:1px solid #34434a;background:radial-gradient(ellipse at 60% 20%,#20303955,transparent 75%),#0a1115;overflow:hidden}
.cot-guide__figure svg{display:block;width:100%;height:auto;max-height:300px;color:#8ca6b2}
.cot-guide__legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:4px 12px 16px;color:#b7cbd5;font-size:12px;line-height:1.4;text-align:center}
.cot-guide__figure figcaption{padding:9px 14px;border-top:1px solid #28363d;color:#8ea3ae;font-size:11px;letter-spacing:.04em}
.cot-guide__figure [data-part]{opacity:.36;transition:opacity .15s}.cot-guide__figure [data-part].active{opacity:1}
.cot-guide__steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.cot-guide__step{display:flex;align-items:center;gap:10px;text-align:left;min-width:0;padding:12px;color:#b5c5cd;background:#101a20;border:1px solid #34434a;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;line-height:1.4}
.cot-guide__step b{display:grid;place-items:center;flex:none;width:25px;height:25px;border:1px solid currentColor;border-radius:50%;font-size:12px}
.cot-guide__step[aria-pressed='true']{color:#ffd27a;border-color:#d99939;background:#332718}
.cot-guide__step:focus-visible{outline:2px solid #ffce78;outline-offset:3px}
.cot-guide__detail{padding:17px 19px;border-left:2px solid #e9a346;background:#111b21;min-height:112px}
.cot-guide__detail h3{margin:0 0 7px;color:#eef3f5;font-size:15px;line-height:1.4}.cot-guide__detail p{margin:0;color:#b9c9d2;font-size:14px;line-height:1.7}
.cot-info-modal__recipe summary{cursor:pointer;padding:13px 0;color:#9fb4c0;font-size:13px}
body[data-cot-width='phone'] .cot-guide__steps{grid-template-columns:1fr;gap:5px}
body[data-cot-width='phone'] .cot-guide__step{padding:9px 12px}body[data-cot-width='phone'] .cot-guide__overview{font-size:14px}
body[data-cot-width='phone'] .cot-guide__detail{padding:13px;min-height:0}
.cot-guide__photo{position:relative;aspect-ratio:16/9;container-type:inline-size;isolation:isolate}
.cot-guide__image-error{padding:20px;color:#b9c9d2;font-size:14px}
.cot-guide__photo>img{display:block;width:100%;height:100%;object-fit:contain}
.cot-guide__photo>svg{position:absolute;inset:0;width:100%;height:100%;max-height:none;pointer-events:none;z-index:1;filter:drop-shadow(0 1px 2px #000)}
.cot-guide__photo svg path,.cot-guide__photo svg ellipse{stroke-width:2;vector-effect:non-scaling-stroke}
.cot-guide__photo [data-part]{opacity:.65}.cot-guide__photo [data-part].active{opacity:1}
.cot-guide__pin{position:absolute;z-index:2;transform:translate(-20px,-50%);display:flex;align-items:center;gap:6px;max-width:27%;min-height:44px;padding:6px 9px 6px 6px;border:1px solid #bacbd45c;background:#071217ed;color:var(--pin-color);font-family:inherit;font-weight:600;cursor:pointer;border-radius:4px;text-align:left}
.cot-guide__photo button[data-part]{opacity:1}
.cot-guide__pin b{display:grid;place-items:center;width:25px;height:25px;border:1px solid currentColor;border-radius:50%;flex:none;font-size:12px}
.cot-guide__pin span{font-size:12px;line-height:1.35}.cot-guide__pin[aria-pressed='true']{border-color:var(--pin-color);box-shadow:0 0 0 1px #071217}
.cot-guide__pin:focus-visible{outline:2px solid #fff;outline-offset:3px;opacity:1}
.cot-guide__technical summary{padding:15px;border:1px solid #34434a;background:#101a20;color:#d1dce2;cursor:pointer;font-size:14px}
.cot-guide__technical[open] summary{border-bottom:0}
@container (max-width:540px){.cot-guide__pin{max-width:none;width:44px;height:44px;padding:0;justify-content:center;background:#071217db}.cot-guide__pin span{display:none}}
@media(prefers-reduced-motion:reduce){.cot-guide__figure [data-part]{transition:none}}
`;
const line = (d: string, color = '#78c7d4', dash = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const box = (x: number, y: number, w: number, h: number, color = '#78c7d4') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${color}18" stroke="${color}" stroke-width="2"/>`;
const circle = (x: number, y: number, r: number, color = '#78c7d4') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}18" stroke="${color}" stroke-width="2"/>`;
const tank = (x: number, y: number, scale = 1, rotate = 0) => `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})">${box(-52,-36,104,72,'#9aaeb4')}${box(-60,-42,16,84,'#9aaeb4')}${box(44,-42,16,84,'#9aaeb4')}${box(-26,-22,52,44)}${line('M 0 -22 V -82','#e9a346')}</g>`;
const side = (x: number, y: number, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})">${line('M -102 20 L -85 -12 H 62 L 104 15 L 85 45 H -78 Z','#a8b8bd')}${line('M -42 -12 L -27 -43 H 28 L 46 -12 M 28 -34 H 144','#a8b8bd')}${[-65,-35,-5,25,55].map(v=>circle(v,27,10,'#718a93')).join('')}</g>`;
const badge = (n: number,x:number,y:number) => `<circle cx="${x}" cy="${y}" r="15" fill="#edaa46"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="#10171b" font-size="15" font-weight="800">${n}</text>`;
const part = (n:number,body:string,x:number,y:number) => `<g data-part="${n}">${body}${badge(n+1,x,y)}</g>`;
const arrow = (x:number,y:number) => line(`M ${x} ${y} h 60 m -12 -8 l 12 8 -12 8`);

/** Schematic geometry only: never a replacement for the selected vehicle's combat volumes. */
export function guideDiagram(id: InfoGuideId): string {
  switch (INFO_GUIDE_DIAGRAMS[id]) {
    case 'smoke': return side(110,200,.6)+part(0,line('M 130 180 Q 260 10 400 190','#edaa46','7 5'),260,70)+part(1,[450,510,570].map(x=>circle(x,160,48)).join(''),510,70)+part(2,line('M 640 240 H 155','#9ab67c','9 6'),650,210);
    case 'concealment': return tank(95,145,.65,90)+tank(557,145,.9,-90)+
      part(0,box(500,106,115,79,'#9ab67c')+line('M 507 113 l 37 23 -28 29 46 12 38 -40','#9ab67c'),620,87)+
      part(1,line('M 152 145 H 500','#78c7d4','8 6')+[[-25,0],[0,-15],[20,12]].map(([x,y])=>circle(330+x,145+y,30,'#9ab67c')).join(''),330,85)+
      part(2,line('M 460 145 l -28 -10 10 20 -30 4 35 8 -17 22 31 -16','#ffad68')+`<circle cx="557" cy="145" r="115" fill="none" stroke="#edaa46" stroke-dasharray="6 8"/><text x="557" y="250" text-anchor="middle" fill="#edaa46" font-size="15">15 m</text>`,442,226);
    case 'map': return line('M 25 236 Q 200 100 325 175 T 695 80','#5e757e')+
      part(0,line('M 40 95 C 130 220 210 20 290 90 S 420 200 480 105','#edaa46','9 6')+tank(95,128,.45,40),92,53)+
      part(1,line('M 250 236 L 360 83 457 231 M 320 235 L 366 156 408 231','#9ab67c')+side(387,111,.4),364,53)+
      part(2,line('M 530 15 Q 475 110 552 167 T 570 266','#78c7d4')+line('M 590 15 Q 535 110 612 167 T 630 266','#78c7d4')+line('M 488 199 H 667','#edaa46','7 5'),649,155);
    case 'armor': return part(0,side(143,170,.75)+line('M 202 148 l 20 13 -12 14','#edaa46'),140,74)+
      part(1,`<g transform="translate(354 150) rotate(30)">${box(-13,-75,26,150,'#edaa46')}</g>`+line('M 256 150 H 434')+line('M 309 75 L 399 225','#728b95','5 5'),352,45)+
      part(2,tank(563,158,.75,25)+line('M 495 232 L 551 157','#edaa46'),597,61);
    case 'ammo': return part(0,line('M 60 182 V 70 H 190 M 60 182 H 210 M 70 100 L 190 145','#78c7d4')+line('M 70 100 H 190','#728b95','5 4'),115,222)+
      part(1,line('M 275 150 H 350 M 335 140 L 350 150 335 160')+box(363,85,16,132,'#edaa46')+line('M 380 150 l 50 -30 M 380 150 l 58 8 M 380 150 l 45 43','#edaa46'),348,47)+
      part(2,circle(576,148,57)+line('M 576 108 V 148 L 612 168','#edaa46')+arrow(523,235),576,52);
    case 'articulation': return part(0,tank(120,153,.8)+line('M 52 124 A 82 82 0 0 1 175 84','#edaa46'),116,45)+
      part(1,side(343,161,.72)+line('M 363 136 L 444 97 M 363 136 L 444 177','#edaa46')+line('M 419 109 A 65 65 0 0 1 419 164','#edaa46'),347,55)+
      part(2,line('M 488 225 L 592 121 697 225','#9ab67c')+`<g transform="rotate(-18 566 142)">${side(566,142,.48)}</g>`,621,72);
    case 'internals': return side(354,165,2)+part(0,line('M 35 130 H 590','#edaa46','9 5'),88,101)+part(1,box(215,158,74,48,'#78c7d4')+box(415,139,53,62,'#e9a346'),252,239)+part(2,box(294,87,70,47,'#c6a4e0')+line('M 330 90 V 45 H 455','#c6a4e0'),479,44);
    case 'crew': return side(356,164,2)+part(0,[310,355].map(x=>circle(x,111,14,'#c6a4e0')).join(''),342,56)+part(1,circle(460,164,14,'#78c7d4')+line('M 460 183 V 227 H 546'),569,227)+part(2,circle(261,165,14,'#edaa46')+line('M 247 175 L 177 228 H 128','#edaa46'),101,228);
    case 'mobility': return part(0,side(126,155,.75)+line('M 23 217 H 223 M 30 87 H 69 M 42 68 H 82','#edaa46'),135,61)+part(1,tank(354,150,.7,90)+line('M 422 169 C 447 242 293 249 299 192','#edaa46'),354,58)+part(2,tank(573,185,.48)+line('M 573 145 L 495 45 Q 573 4 652 45 Z','#78c7d4'),665,77);
    case 'equipment': return tank(357,143,1.35,90)+[0,1,2].map((n)=>part(n,box(72+n*231,204,113,42,['#edaa46','#78c7d4','#c6a4e0'][n])+line(`M ${127+n*231} 204 V 180 L 357 150`),127+n*231,228)).join('');
    case 'dossier': return part(0,box(37,57,164,167)+[90,125,160].map((y,i)=>line(`M 56 ${y} h ${110-i*25}`,'#edaa46')).join(''),120,239)+part(1,side(350,156,.8)+box(253,57,190,167),350,239)+part(2,tank(581,141,.76)+box(495,57,171,167),580,239);
    case 'layers': return [0,1,2].map((n)=>part(n,`<g transform="translate(${125+n*232} 141)">${box(-74,-83,148,165)}${tank(0,0,.6)}${n===1?box(-18,-13,36,38,'#c6a4e0'):n===2?line('M -44 19 L -5 -35 39 22 Z','#edaa46'):''}</g>`,125+n*232,241)).join('');
    case 'markup': return part(0,line('M 43 193 L 118 62 222 188 Z M 118 62 L 138 190 M 43 193 L 176 134','#78c7d4')+`<path d="M 43 193 L 118 62 138 190 Z" fill="#edaa4655"/>`,90,236)+part(1,box(280,66,146,141)+line('M 299 94 H 397 M 299 121 H 382 M 299 148 H 400'),352,236)+part(2,box(508,72,134,88)+box(551,118,121,86,'#edaa46'),593,236);
    case 'camera': return part(0,tank(350,154,.72,30)+`<ellipse cx="350" cy="155" rx="220" ry="102" stroke="#78c7d4" stroke-dasharray="6 7" fill="none"/>`,340,31)+part(1,box(46,149,71,52,'#edaa46')+line('M 117 174 L 313 100 M 117 174 L 314 219','#edaa46'),78,228)+part(2,box(529,79,143,127)+line('M 544 95 h 22 m -22 0 v 20 M 658 190 h -22 m 22 0 v -20'),600,239);
    case 'environment': return part(0,line('M 28 226 L 144 98 246 226 M 70 226 L 157 155 227 226','#9ab67c'),128,69)+part(1,circle(345,93,35,'#edaa46')+line('M 280 181 H 430 M 305 199 H 405 M 337 218 H 370','#edaa46'),357,252)+part(2,[527,562,598,633].map(x=>line(`M ${x} 87 l -20 61 M ${x+10} 170 l -20 61`)).join(''),599,49);
    case 'actors': return part(0,tank(114,156,.65,30)+line('M 44 52 h 30 m -15 -15 v 30','#edaa46'),113,238)+part(1,tank(350,151,.83)+line('M 288 107 A 80 80 0 0 1 417 125','#edaa46'),350,238)+part(2,tank(570,155,.64,75)+tank(633,86,.38,75),585,238);
    case 'effects': return part(0,side(123,161,.68)+line('M 224 138 l 28 -13 -9 15 20 11 -35 -3','#edaa46'),124,229)+part(1,line('M 283 83 V 218 H 450 M 300 199 H 320 V 137 H 340 V 199 H 415','#78c7d4'),360,62)+part(2,line('M 507 210 l 30 -44 -7 -52 35 37 17 -62 15 68 36 -27 -7 47 31 33 Z','#edaa46'),580,49);
    case 'timeline': return line('M 35 218 H 683','#728b95')+[0,1,2].map(n=>part(n,box(53+n*231,64,150,95)+line(`M ${129+n*231} 177 V 233`)+circle(129+n*231,218,6,'#edaa46')+ (n===1?line('M 235 108 C 271 40 375 193 460 104','#edaa46'):''),129+n*231,36)).join('');
    case 'output': return part(0,box(35,74,166,120)+line('M 47 85 l 30 0 m -30 0 v 30 M 188 181 h -30 m 30 0 v -30'),116,235)+arrow(217,136)+part(1,box(297,90,114,85)+`<path d="M 334 110 L 334 155 370 132 Z" fill="#edaa46"/>`,353,235)+arrow(434,136)+part(2,box(536,62,121,149)+line('M 556 93 H 637 M 556 124 H 619 M 556 155 H 637 M 556 186 H 600'),597,235);
    case 'recipe': return part(0,box(43,51,132,164)+line('M 66 84 H 146 M 66 119 H 133 M 66 154 H 146 M 66 189 H 120'),108,247)+arrow(203,133)+part(1,box(302,83,113,108)+tank(355,138,.48,35),356,247)+arrow(445,133)+part(2,box(546,68,136,117)+line('M 557 171 l 36 -43 28 22 21 -37 30 58','#9ab67c'),612,247);
    case 'cycle': return [0,1,2].map(n=>part(n,circle(125+n*231,143,54)+ (n===0?line('M 102 143 l 17 17 31 -40','#9ab67c'):n===1?line('M 350 101 l -23 49 28 -10 -8 40 34 -55 -31 12','#edaa46'):line('M 586 104 V 143 L 615 157'))+(n<2?arrow(195+n*231,143):''),125+n*231,233)).join('');
  }
}

let sequence = 0;
export function createInfoGuide(id: InfoGuideId, vehicle: { id: string; name: string } | null = null): HTMLElement {
  if (!document.getElementById('cot-info-guide-css')) {
    const style = document.createElement('style'); style.id = 'cot-info-guide-css'; style.textContent = CSS; document.head.append(style);
  }
  const root = document.createElement('section'); root.className = 'cot-guide'; root.dataset.guide = id;
  const overview = document.createElement('p'); overview.className = 'cot-guide__overview'; overview.textContent = t(`fieldGuide.${id}.overview`);
  const photo = createGuidePhoto(id, index => choose(index));
  const figure = photo?.figure ?? document.createElement('figure');
  if (!photo) {
  figure.className = 'cot-guide__figure';
  figure.innerHTML = `<svg viewBox="0 0 720 280" xmlns="http://www.w3.org/2000/svg" role="img">${guideDiagram(id)}</svg>`;
  figure.querySelector('svg')!.setAttribute('aria-label', overview.textContent);
  const legend = document.createElement('div'); legend.className = 'cot-guide__legend';
  for (let i = 0; i < 3; i++) {
    const label = document.createElement('span'); label.textContent = t(`fieldGuide.${id}.${i}.label`); legend.append(label);
  }
  figure.append(legend);
  const caption = document.createElement('figcaption'); caption.textContent = t('fieldGuide.diagram'); figure.append(caption);
  }
  // The authored diagrams use this tank's real armor/module/crew volumes.
  const views = id === 'crew' ? ['crew_side', 'modules_side', 'armor_side']
    : id === 'protection' ? ['armor_side', 'modules_side', 'crew_side']
    : ['modules_side', 'crew_side', 'armor_side'];
  let vehicleImage: HTMLImageElement | null = null;
  let technicalDetails: HTMLDetailsElement | null = null;
  if (vehicle && VEHICLE_TECHNICAL_GUIDES.has(id)) {
    technicalDetails = document.createElement('details'); technicalDetails.className = 'cot-guide__technical';
    const summary = document.createElement('summary'); summary.textContent = t('fieldGuide.capture.selected', { vehicle: vehicle.name });
    const technicalFigure = document.createElement('figure'); technicalFigure.className = 'cot-guide__figure';
    technicalDetails.append(summary, technicalFigure);
    vehicleImage = document.createElement('img');
    vehicleImage.style.cssText = 'display:block;width:100%;height:auto;max-height:480px;object-fit:contain';
    vehicleImage.alt = vehicle.name; vehicleImage.loading = 'lazy';
    vehicleImage.dataset.vehicleId = vehicle.id;
    const vehicleCaption = document.createElement('figcaption');
    vehicleCaption.textContent = vehicle.name + ' · ' + t('garage.dossier.dossier.techViews');
    const diagramControls = document.createElement('div'); diagramControls.className = 'cot-guide__steps';
    const labels: Record<string, string> = { armor_side: 'armorSide', modules_side: 'modulesSide', crew_side: 'crewSide' };
    for (const view of views) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cot-guide__step';
      button.textContent = t(`garage.dossier.image.${labels[view]}`);
      button.setAttribute('aria-pressed', String(view === views[0]));
      button.addEventListener('click', () => {
        vehicleImage!.src = iconUrl(vehicle.id, view);
        vehicleImage!.alt = `${vehicle.name} · ${button.textContent}`;
        for (const other of diagramControls.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
      });
      diagramControls.append(button);
    }
    vehicleImage.src = iconUrl(vehicle.id, views[0]);
    vehicleImage.alt = `${vehicle.name} · ${t(`garage.dossier.image.${labels[views[0]]}`)}`;
    technicalFigure.append(vehicleImage, vehicleCaption, diagramControls);
  }
  const steps = document.createElement('div'); steps.className = 'cot-guide__steps'; steps.setAttribute('role','group'); steps.setAttribute('aria-label',t('fieldGuide.steps'));
  const detail = document.createElement('div'); detail.className = 'cot-guide__detail'; detail.id = `cot-guide-detail-${++sequence}`; detail.setAttribute('aria-live','polite'); detail.setAttribute('aria-atomic','true');
  const heading = document.createElement('h3'); const paragraph = document.createElement('p'); detail.append(heading,paragraph);
  const choose = (index:number) => {
    photo?.select(index);
    steps.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed', String(i===index)));
    figure.querySelectorAll<SVGGElement>('[data-part]').forEach(part=>part.classList.toggle('active',part.dataset.part===String(index)));
    heading.textContent = t(`fieldGuide.${id}.${index}.title`); paragraph.textContent = t(`fieldGuide.${id}.${index}.body`);
  };
  for(let i=0;i<3;i++) {
    const button = document.createElement('button'); button.type='button'; button.className='cot-guide__step'; button.setAttribute('aria-controls',detail.id);
    const number = document.createElement('b'); number.textContent=String(i+1); number.setAttribute('aria-hidden','true');
    const label = document.createElement('span'); label.textContent=t(`fieldGuide.${id}.${i}.title`); button.append(number,label);
    button.addEventListener('click',()=>choose(i)); steps.append(button);
  }
  choose(0); root.append(overview,figure,steps,detail); if (technicalDetails) root.append(technicalDetails); return root;
}
