// Shared native-vector product marks. Run with --check to verify shipped assets.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const C={white:'#edf3f7',amber:'#f0a030',cyan:'#45c7ff',red:'#ff4d62',dark:'#0b131c',steel:'#7893a5'};
const path=(d,fill='none',stroke=C.white,w=2)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
const circle=(x,y,r,fill,stroke='none',w=1.5)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
const group=(body,transform='',attrs='')=>`<g${transform?` transform="${transform}"`:''} ${attrs}>${body}</g>`;
const defs=`<defs>
 <linearGradient id="steel" x2=".3" y2="1"><stop stop-color="#4d687b"/><stop offset=".5" stop-color="#263e50"/><stop offset="1" stop-color="#12202d"/></linearGradient>
 <linearGradient id="cyan" x2=".3" y2="1"><stop stop-color="#99e7ff"/><stop offset="1" stop-color="#2385b3"/></linearGradient>
 <linearGradient id="amber" x2=".2" y2="1"><stop stop-color="#ffda88"/><stop offset="1" stop-color="#dc881c"/></linearGradient>
 <linearGradient id="red" x2=".3" y2="1"><stop stop-color="#ff9eaa"/><stop offset="1" stop-color="#c9304c"/></linearGradient>
</defs>`;
const chassis=()=>path('M5 39 10 34H44L53 39 49 48H11L5 43Z',C.dark)+path('M8 39H49', 'none',C.steel,1.3)+[13,22,31,40].map(x=>circle(x,43,3.2,'url(#steel)',C.steel,1.2)).join('')+path('M11 48H48','none',C.cyan,1.2);
const turret=(tone='cyan',kind='mbt')=>kind==='wedge'
 ?path('M7 33 15 25H38L45 34Z','url(#'+tone+')')+path('M35 27 58 22','none',C.white,2.8)
 :path('M12 34 18 29H42L49 35Z','url(#steel)')+path(kind==='round'?'M20 28Q20 18 30 19Q39 19 41 28Z':'M18 28 23 19H36L43 28Z','url(#'+tone+')')+path('M36 22 58 17','none',C.white,2.8)+path('M43 20.4 57 17.2','none',C.amber,1.4)+path('M26 18V15H33V18','none',C.steel,1.6)+path('M23 25H35','none',C.white,1);
const tank=(tone='cyan',kind='mbt')=>chassis()+turret(tone,kind);
const burst=()=>path('m32 17 4 10 10-4-5 10 11 4-12 3 2 11-9-7-8 8 1-12-11-3 12-3Z','url(#amber)','none')+path('m32 27 3 6 6-2-3 6 5 3-7 1-3 6-1-7-6-2 5-4Z','url(#red)','none');
const icons={};
function add(kind,name,label,body){const width=kind==='nav'?96:64;icons[`${kind}/${name}`]=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 64" role="img" aria-label="${label}">\n${defs}\n<g stroke-linecap="round" stroke-linejoin="round">${body}</g>\n</svg>\n`;}
add('features','play','Play armored combat',circle(32,24,19,C.dark,C.amber,2.5)+path('M18 12A19 19 0 0 1 45 10','none','#ffda88',1.3)+path('M28 14 42 24 28 33Z',C.white,'none')+group(tank(),'translate(6 26) scale(.84 .61)'));
add('nav','docs','Docs — armored vehicle field manual',path('M7 10 38 8Q45 8 48 12Q51 8 58 8L89 10V54L57 52Q51 52 48 56Q45 52 39 52L7 54Z','url(#steel)')+path('M11 14 38 12Q44 12 48 16Q52 12 58 12L85 14V49L57 47Q52 47 48 51Q44 47 38 47L11 49Z',C.dark,C.steel,1)+path('M48 16V51','none',C.amber,1.4)+path('M16 20H31M66 20H80M16 43H30M66 43H80','none',C.cyan,1.7)+group(tank(),'translate(17 5) scale(1 .88)','id="docs-m1a2" data-vehicle="m1a2"')+path('M48 53V60L53 57','none',C.red,2.5));
add('nav','tank-gallery','Tank Gallery — three distinct armored vehicle profiles',group(tank('cyan','wedge'),'translate(1 -5) scale(.78)','data-vehicle="strv103a" opacity=".78"')+group(tank('red','round'),'translate(22 9) scale(.82)','data-vehicle="t90m"')+group(tank('steel'),'translate(42 23) scale(.86)','data-vehicle="m1a2"'));
add('nav','studio','Scene Studio — tank turret thrown by an explosion',group(group(chassis(),'translate(6 6) scale(1.5 1)','id="studio-hull" data-separation="turret-ring"')+group(turret('red'),'translate(13 -12) rotate(-10 32 28) scale(1.12)','id="studio-turret" data-separation="turret-ring"'),'','data-vehicle="leclerc"')+group(burst(),'translate(17 7) scale(.85)')+path('M18 34 10 30M73 31 81 25M22 19 20 13M78 41 87 43','none',C.cyan,2)+circle(71,18,1.6,C.amber)+circle(13,44,1.5,C.amber));
add('nav','garage','Garage — workshop crane lifting a tank turret',path('M10 58V9H86V58M5 9H91','none',C.amber,2.6)+path('M10 20 21 9M75 9 86 20','none',C.steel,1.7)+path('M41 5H55V14H41Z','url(#steel)')+path('M44 14V21L34 29M52 14V21L62 29','none',C.white,1.5)+group(group(turret(),'translate(12 -1) scale(1.1 .9)','id="garage-turret" data-separation="turret-ring"')+group(chassis(),'translate(12 13) scale(1.3 .9)','id="garage-hull" data-separation="turret-ring"'),'','data-vehicle="leclerc"')+path('M5 59H91','none',C.steel,2));
add('nav','home','Home — tank parked in a garage bay',path('M7 27 48 4 89 27','none',C.amber,3)+path('M16 23V58H80V23','url(#steel)')+path('M23 58V29H73V58',C.dark,C.steel,1.5)+path('M25 31H71M25 35H71','none',C.steel,1)+group(tank(),'translate(24 17) scale(.84)','id="home-bay" data-vehicle="m1a2"')+path('M11 59H85','none',C.amber,2));
add('features','vehicle','Modern main battle tank',group(tank(),'translate(0 4)')+path('M9 17H18M13.5 12.5V21.5','none',C.red,1.8)+path('M46 53H56','none',C.amber,1.5));
add('features','modules','Internal tank systems and removable modules',path('M6 36H46L57 43 52 55H13L6 47Z','url(#steel)')+path('M13 35 20 28H40L47 35','none',C.white,2)+path('M12 40H49V50H14Z',C.dark,C.steel,1)+circle(21,45,4.4,'url(#cyan)')+path('M30 40H36V50H30Z','url(#amber)','none')+path('M42 40 47 48H39Z','url(#red)','none')+path('M20 24V7M15 12 20 7 25 12','none',C.cyan,2.3)+path('M36 24V7M31 12 36 7 41 12','none',C.amber,2.3)+path('M15 57H49','none',C.steel,1.5));
add('features','armor','Layered armor and shell penetration',path('M35 5 56 13V27Q56 46 35 59Q14 46 14 27V13Z','url(#steel)')+path('M35 12 49 17V28Q49 40 35 50','none',C.cyan,2)+path('M35 18 43 21V29Q43 37 35 43','none',C.steel,1.4)+path('M3 30H25L31 34 25 38H3Z','url(#amber)','none')+path('M35 25V44','none',C.white,1.5)+group(burst(),'translate(18 17) scale(.5)')+path('M44 10 51 13','none',C.white,1));
add('features','battlefield','Battlefield map and objective',path('M5 14 22 8 41 14 59 8V50L42 56 22 50 5 56Z','url(#steel)')+path('M22 9V50M42 15V55','none',C.steel,1.5)+path('M9 24 15 20 20 24M27 43 34 39 40 42M47 44 55 41','none',C.steel,1.2)+path('M12 45C20 31 25 45 33 31','none',C.cyan,2.2)+path('M45 21C45 14 31 14 31 21C31 28 38 34 38 34S45 28 45 21Z','url(#amber)',C.amber,1.5)+circle(38,21,2.5,C.dark));
add('features','live-combat','Live armored combat',group(tank(),'translate(1 21) scale(.9 .72)')+path('M7 7H36V28H7Z','url(#steel)',C.steel,1.5)+path('M18 12 29 17.5 18 23Z','url(#red)','none')+path('M43 30 50 28','none',C.amber,1.6)+group(burst(),'translate(40 16) scale(.36)')+circle(8,32,1.5,C.red));
add('features','multiplayer','Connected opposing armored teams',group(tank('cyan'),'translate(0 29) scale(.52)')+group(tank('red'),'translate(64 29) scale(-.52 .52)')+circle(32,13,5,'url(#amber)')+circle(12,21,3.5,'url(#steel)',C.white,1.5)+circle(52,21,3.5,'url(#steel)',C.white,1.5)+path('M17 20 26 16M38 16 47 20M32 20V30M12 27V32M52 27V32','none',C.steel,1.8)+path('M26 35 32 29 38 35','none',C.amber,1.8));
add('features','gpu','Graphics processor and renderer',path('M16 15H48V49H16Z','url(#steel)')+path('M23 22H41V42H23Z',C.dark,C.cyan,1.5)+path('M27 27H37V37H27Z','url(#cyan)','none')+[21,28,36,43].map(n=>path(`M${n} 9V14M${n} 50V55M9 ${n}H15M49 ${n}H55`,'none',C.steel,2)).join('')+path('M43 19H45V23','none',C.amber,1.6));
add('features','missile','Guided missile and flight path',path('M8 52Q29 54 30 38','none',C.cyan,2)+path('M6 46Q19 47 23 38','none',C.steel,1.4)+group(path('M28 12 32 5 36 12V37L32 43 28 37Z','url(#steel)')+path('M28 12 32 5 36 12Z','url(#amber)','none')+path('M28 26 21 35V39L28 36M36 26 43 35V39L36 36','url(#cyan)')+path('M30 43 32 53 34 43','url(#red)','none'),'rotate(38 32 29)')+path('M47 7H55V15M52 10H60','none',C.amber,1.3));
add('features','screenshots','In-engine screenshot capture',path('M7 16H20L24 10H40L44 16H57V52H7Z','url(#steel)')+circle(32,34,12,C.dark,C.white,2)+circle(32,34,7,'url(#cyan)',C.cyan,1)+path('M28 32 34 27','none',C.white,1.5)+path('M46 22H51','none',C.amber,2.5)+path('M11 44V48H17','none',C.steel,1.3));
add('features','camera-paths','Directed camera paths',path('M12 48C-1 22 54 11 52 34S31 58 26 44','none',C.cyan,2)+path('M15 48 10 51 9 44','none',C.cyan,2)+path('M22 23H38V36H22Z','url(#steel)')+path('M38 27 47 22V37L38 32Z','url(#amber)')+circle(26,19,4,C.dark,C.white,1.7)+circle(35,18,5,C.dark,C.white,1.7)+circle(13,30,3,'url(#red)')+circle(45,48,3,'url(#amber)'));
let stale=0;
for(const [name,svg] of Object.entries(icons)){
 const file=fileURLToPath(new URL(`../public/brand/${name}.svg`,import.meta.url));
 if(process.argv.includes('--check')){if(readFileSync(file,'utf8')!==svg){console.error(`Stale product icon: ${name}`);stale++;}}
 else writeFileSync(file,svg);
}
if(stale)process.exitCode=1;
else console.log(`${Object.keys(icons).length} product icons ${process.argv.includes('--check')?'verified':'generated'}`);
