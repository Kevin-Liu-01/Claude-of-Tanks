// Polish removable protection layouts. Data only: safe for the ghillie registry.
import type {GhillieConfig} from './ghillieSuit.ts';

export const POLISH_PROTECTION_LAYOUTS = [
  {id:'pl_t80u_modern', hullX:2.33, hullBottom:.83, hullTop:1.38,
    hullPanels:[[-2.42,-1.10],[-.90,.59],[.80,2.32]],
    turretX:1.91, turretBottom:.33, turretTop:.60, turretPanels:[[-1.65,-.58]],
    rearZ:-2.55, rearHalf:1.29, rearBottom:.43, rearTop:.73, rearSeatZ:-1.72, rearSeatY:.465},
  {id:'pl_t72b3m_modern', hullX:2.42, hullBottom:.73, hullTop:1.40,
    hullPanels:[[-2.70,-1.50],[-1.32,-.12],[.17,1.28],[1.46,2.68]],
    turretX:2.04, turretBottom:.35, turretTop:.67, turretPanels:[[-1.83,-.75],[-.57,.43]],
    rearZ:-2.62, rearHalf:1.37, rearBottom:.44, rearTop:.77, rearSeatZ:-1.98, rearSeatY:.515},
  {id:'pl_t72b3_modern', hullX:2.30, hullBottom:.94, hullTop:1.37,
    hullPanels:[[-2.32,-.92],[-.72,.56],[.89,2.30]],
    turretX:1.81, turretBottom:.33, turretTop:.53, turretPanels:[[-1.38,-.40]],
    rearZ:-2.11, rearHalf:1.13, rearBottom:.41, rearTop:.65, rearSeatZ:-1.50, rearSeatY:.415},
  {id:'pl_t72b3_zubr_ii', hullX:2.35, hullBottom:.72, hullTop:1.34,
    hullPanels:[[-2.43,-1.25],[-1.07,.11],[.29,1.47],[1.65,2.68]],
    turretX:2.05, turretBottom:.38, turretTop:.72, turretPanels:[[-1.98,-1.24],[-1.08,-.34]],
    rearZ:-2.99, rearHalf:1.34, rearBottom:.44, rearTop:.78, rearSeatZ:-2.18, rearSeatY:.51},
] as const;

// Covers are stitched to the new screen frames, not draped across hatches,
// optics or launch areas. Leaving alternate hull panels bare makes the ERA
// array legible and retains Polish ordered modularity beneath the scrim.
export const NATIONAL_POLAND_GHILLIE_CONFIGS: Readonly<Record<string,GhillieConfig>> = Object.fromEntries(
  POLISH_PROTECTION_LAYOUTS.map((d,m)=>[d.id,{
    id:d.id,seed:7400+m*97,style:'ulcans',density:.87,leafScale:.66,
    light:[0x68724b,0x73744d,0x657547,0x747852][m]!,dark:0x35412c,
    netColor:'rgba(49,61,37,0.88)',
    hull:{side:[-1,1].flatMap(side=>d.hullPanels.filter((_,i)=>i!==1||m===2).map(([a,b],i)=>({
      side,z0:a+.06,z1:b-.06,nz:12,ny:5,topAt:()=>d.hullTop-.026,
      bottomAt:()=>d.hullBottom+.027,outAt:()=>d.hullX+.027,seed:51+m*11+i+side,
    })))},
    turret:{
      side:[-1,1].flatMap(side=>d.turretPanels.map(([a,b],i)=>({
        side,z0:a+.045,z1:b-.045,nz:10,ny:4,topAt:()=>d.turretTop-.025,
        bottomAt:()=>d.turretBottom+.025,outAt:()=>d.turretX+.027,seed:111+m*13+i+side,
      }))),
      face:[{z:d.rearZ-.027,x0:-d.rearHalf+.05,x1:d.rearHalf-.05,
        y0:d.rearBottom+.025,y1:d.rearTop-.025,nx:20,ny:4,seat:'Polish rear cage crossbars',seatGapM:.027,seed:211+m*17}],
    },
  } satisfies GhillieConfig]),
);
