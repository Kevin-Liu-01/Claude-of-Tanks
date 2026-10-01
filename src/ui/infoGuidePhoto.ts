import { t } from './i18n.ts';
import type { InfoGuideId } from './infoGuideTypes.ts';
import { INFO_GUIDE_CAPTURES, guideCaptureUrl } from './infoGuideCaptures.ts';

export function createGuidePhoto(id: InfoGuideId, onSelect: (index: number) => void) {
  const capture = INFO_GUIDE_CAPTURES[id];
  if (!capture) return null;
  const figure = document.createElement('figure'); figure.className = 'cot-guide__figure cot-guide__photograph';
  const stage = document.createElement('div'); stage.className = 'cot-guide__photo';
  const image = document.createElement('img'); image.width = 1600; image.height = 900;
  image.src = guideCaptureUrl(capture.stepFiles?.[0] ?? capture.file);
  image.alt = t(`fieldGuide.${id}.photoAlt`); image.decoding = 'async';
  stage.append(image);
  const failure = document.createElement('p'); failure.className='cot-guide__image-error'; failure.hidden=true; failure.textContent=t('fieldGuide.unavailable'); failure.setAttribute('role','status');
  image.addEventListener('error',()=>{stage.hidden=true;failure.hidden=false;});
  image.addEventListener('load',()=>{stage.hidden=false;failure.hidden=true;});
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox','0 0 100 100');
  svg.setAttribute('preserveAspectRatio','none'); svg.setAttribute('aria-hidden','true');
  const colors = ['#ffcf77','#8ae3f0','#bef395'];
  capture.annotations.forEach((annotation,index) => {
    const group = document.createElementNS(svgNS,'g'); group.dataset.part = String(index);
    group.setAttribute('stroke',colors[index]!); group.setAttribute('fill','none');
    const leader = document.createElementNS(svgNS,'path');
    leader.setAttribute('d',`M ${annotation.at.join(' ')} L ${annotation.target.join(' ')}`);group.append(leader);
    for (const d of annotation.paths ?? []) {
      const path = document.createElementNS(svgNS,'path');path.setAttribute('d',d);path.setAttribute('stroke-dasharray','7 5');group.append(path);
    }
    const target = document.createElementNS(svgNS,'ellipse'); target.setAttribute('cx',String(annotation.target[0]));target.setAttribute('cy',String(annotation.target[1]));target.setAttribute('rx','1');target.setAttribute('ry','1.78');group.append(target);
    svg.append(group);
    const button = document.createElement('button');button.type='button';button.className='cot-guide__pin';button.dataset.part=String(index);
    button.style.left=`${annotation.at[0]}%`;button.style.top=`${annotation.at[1]}%`;button.style.setProperty('--pin-color',colors[index]!);
    button.setAttribute('aria-label',`${index+1}. ${t(`fieldGuide.${id}.${index}.title`)}`);
    const number=document.createElement('b');number.textContent=String(index+1);
    const label=document.createElement('span');label.textContent=t(`fieldGuide.${id}.${index}.label`);
    button.append(number,label);button.addEventListener('click',()=>onSelect(index));stage.append(button);
  });
  stage.append(svg);
  const caption=document.createElement('figcaption');caption.textContent=t(id==='maps'?'fieldGuide.capture.map':'fieldGuide.capture.vehicle');
  figure.append(stage,failure,caption);
  function select(index:number) {
    image.src=guideCaptureUrl(capture!.stepFiles?.[index]??capture!.file);
    image.alt=t(id==='smoke'&&index===0?'fieldGuide.smoke.launchAlt':`fieldGuide.${id}.photoAlt`);
    stage.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  }
  return {figure,select};
}
