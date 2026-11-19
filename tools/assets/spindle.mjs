// Parametric Spindle based on the owner-supplied Precision Machine study.
// The inferred dimensions use metres. The axle is X, forward is +Z, and the
// ground plane is Y=0. All bearings and housings are modelled on both faces.
import { Document } from '@gltf-transform/core';
import { RigidMesh, radians, polar } from './lib/spindle-geometry.mjs';
import { spindleMaterial, finish as f } from './lib/spindle-surfaces.mjs';

const TURN=2*Math.PI, R=.64;
const at=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const translate=(p,d)=>p.map((v,i)=>v+d[i]);

function bearing(part,x,radius,width,material,origin=[0,0,0],segments=24,bore=radius*.70) {
  const b=Math.min(width*.19,radius*.09),x0=x-width/2,x1=x+width/2;
  part.arc([[x0,radius-b],[x0+b,radius],[x1-b,radius],[x1,radius-b],
    [x1,bore],[x0,bore]],0,TURN,material,{origin,steps:segments});
}

function pin(part,p,radius,length) {
  const [x,y,z]=p,axis=(t)=>[x+t,y,z];
  part.rod(axis(-length/2),axis(length/2),radius,radius,f.graphite,18);
  for(const side of [-1,1]) {
    const tip=length/2*side;
    part.rod(axis(tip),axis(tip+.004*side),radius*.77,radius*.7,f.iron,12);
    part.rod(axis(tip+.004*side),axis(tip+.006*side),radius*.43,radius*.43,f.bronze,6);
  }
}

function sectorOutline(angle, points) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return points.map(([radius,tangent])=>[radius*c-tangent*s,radius*s+tangent*c]);
}

// A removable lock saddle ties the two wheel halves together. The bridge,
// short cover and castellated cheek sit at different axial depths so the
// mechanism reads from the edge as well as from the tool side.
function lockSaddle(part,start,end,major) {
  const a=radians(start),b=radians(end);
  const crown=[[-.145,.596],[-.126,.629],[-.109,.636],[.108,.636],[.133,.629],
    [.155,.597],[.155,.564],[.126,.546],[-.125,.546],[-.145,.565]];
  part.arc(crown,a,b,[f.ochre,f.bronze,f.yellow,f.ochre,f.ochre,
    f.ochre,f.patina,f.graphite,f.gunmetal,f.patina],{steps:10,
    insets:crown.map(([,r])=>[.35*(.638-r),.72*(.638-r)]),
    uvRows:[.03,.13,.25,.72,.83,.89,.97,.99,.96,.90]});
  const mid=(a+b)/2;
  for(const side of [-1,1]){
    const cheek=[[.466,-.036],[.503,-.067],[.574,-.062],[.600,-.041],
      [.595,.043],[.565,.064],[.484,.049],[.468,.027]];
    part.plate(.152*side,.037,sectorOutline(mid,cheek),major?f.ochre:f.iron,f.patina,.006);
    const lug=polar(.175*side,.525,mid);
    part.rod(lug,translate(lug,[side*.010,0,0]),.026,.024,f.graphite,14);
    part.rod(translate(lug,[side*.010,0,0]),translate(lug,[side*.014,0,0]),.015,.014,f.bronze,6);
    // The smaller half of the latch is a ribbed removable inspection cover.
    for(const delta of [-.049,-.012,.025]){
      const relief=[[.551,delta],[.576,delta],[.579,delta+.009],[.552,delta+.009]];
      part.plate(.173*side,.007,sectorOutline(mid,relief),f.gunmetal,f.patina,.001);
    }
  }
  // Narrow dark seam across the deck and bright anti-slip ribs on only one
  // saddle. The tread never leaves the two outer rolling surfaces.
  if(major) for(const t of [.25,.32,.39]){
    const startAngle=a+(b-a)*t;
    part.arc([[-.082,.635],[-.078,.639],[.076,.639],[.082,.635],[.077,.632],[-.075,.632]],
      startAngle,startAngle+.016,f.patina,{steps:2});
  }
}

function armour(part,side,start,end,material,{frontTrim=0,backTrim=0}={}) {
  // Stamped C-channel wraps the flank and turns over onto the contact band.
  let profile=[[.022,.621],[.084,.634],[.145,.620],[.168,.596],[.182,.555],
    [.191,.498],[.179,.463],[.144,.453],[.125,.480],[.113,.565],[.077,.597],[.022,.605]];
  let tiles=[material,material,f.repair,material,material,material,f.iron,f.iron,f.patina,f.gunmetal,f.gunmetal,f.patina];
  let insets=profile.map(([,r])=>[radians(frontTrim*(.641-r)/.15),radians(backTrim*(.64-r)/.15)]);
  if(side<0) {
    profile=profile.map(([x,r])=>[-x,r]).reverse();
    tiles=tiles.map((_,i)=>tiles[(tiles.length-2-i+tiles.length)%tiles.length]);
    insets.reverse();
  }
  const uvRows=[.02,.26,.45,.55,.67,.84,.96,.99,.90,.72,.38,.03];
  if(side<0)uvRows.reverse();
  const shape=([x,r],row,t)=>{
    // Broad pressed crowns and an undercut at the exposed end leave a
    // substantial casting shoulder. The adjacent segment meets at a plain seam.
    const endBlend=frontTrim?1-t:t;
    const notch=Math.max(0,Math.min(1,(endBlend-.56)/.36));
    const inner=Math.max(0,(.593-r)/.14);
    return [x+side*.009*Math.sin(t*Math.PI)*inner,r+notch*.044*inner];
  };
  part.arc(profile,radians(start),radians(end),tiles,{insets,uvRows,shape,steps:Math.ceil((end-start)/3)});
  for(const angle of [start+5+frontTrim*.65,end-5-backTrim*.65]) {
    const a=radians(angle),p=polar(side*.190,.535,a);
    part.rod(p,translate(p,[side*.0035,0,0]),.0105,.0093,f.patina,6);
    part.rod(translate(p,[side*.0035,0,0]),translate(p,[side*.0045,0,0]),.0038,.0038,f.recess,6);
  }
}

function wheel(part) {
  // Parallel contact tyres flank a recessed ring gear with a continuous
  // bearing race. The hubs and service arm never inherit this rotation.
  part.arc([[-.106,.595],[.106,.595],[.109,.558],[.082,.486],[-.082,.486],[-.109,.558]],
    0,TURN,[f.graphite,f.iron,f.gunmetal,f.iron,f.gunmetal,f.iron],{steps:72});
  for(const x of [-.055,.055]) {
    for(const [a,b] of [[4,108],[112,230],[235,359]]) {
      const rail=[[x-.011,.488],[x+.011,.488],[x+.009,.481],[x+.005,.478],
        [x-.006,.478],[x-.011,.482]];
      part.arc(rail,radians(a),radians(b),[f.gunmetal,f.graphite,f.iron,f.patina,f.iron,f.graphite],
        {steps:Math.ceil((b-a)/5)});
    }
  }
  lockSaddle(part,279,313,true);
  lockSaddle(part,53,76,false);
  lockSaddle(part,174,193,false);
  for(const side of [-1,1]) {
    const x=side*.054;
    part.arc([[x-.032,.621],[x-.023,R],[x-.011,R],[x-.006,.637],[x+.006,.637],
      [x+.011,R],[x+.023,R],[x+.032,.621],[x+.031,.594],[x-.031,.594]],
      0,TURN,[f.belt,f.rubber,f.belt,f.belt,f.belt,f.rubber,f.belt,f.belt,f.graphite,f.belt],{steps:84});
    bearing(part,side*.102,.506,.019,f.iron,[0,0,0],60,.483);
    for(let i=0;i<3;i++) {
      const center=[4,126,246][i],start=center-[49,39,43][i],end=center+[44,44,34][i];
      const seam=start+(end-start)*[.51,.63,.42][i];
      armour(part,side,start,seam-.5,[f.chalk,f.ivory,f.bone][i],{frontTrim:9});
      armour(part,side,seam+.5,end,[f.ivory,f.repair,f.ivory][i],{backTrim:12});
      const mount=radians(i===2?end-10:start+14);
      // A service lug overlaps one panel corner. Small plates at different
      // radii break the perfect annular outline while preserving road contact.
      const lug=[[.470,-.028],[.520,-.045],[.550,-.038],[.562,.012],
        [.547,.032],[.483,.037],[.462,.014]];
      part.plate(side*.181,.026,sectorOutline(mount,lug),i===2?f.yellow:f.repair,f.iron,.005);
      const socket=polar(side*.196,.507,mount);
      part.rod(socket,translate(socket,[side*.005,0,0]),.012,.009,f.graphite,8);
    }
  }
}

// Three bearing shoes hold the levelling carriage inside the race. Their
// staggered YZ beams leave sightlines through the lower opening in the study.
function carriage(part) {
  // Gear cradle follows the upper bearing race, leaving the lower quadrant
  // open. A recessed bronze gasket separates its stepped steel casting from
  // the relieved enamel lid. This component stays level as the wheel rolls.
  const cradle=[[-.105,.316],[-.083,.364],[.025,.384],[.087,.378],[.129,.349],
    [.140,.312],[.134,.276],[.112,.257],[.065,.253],[-.102,.257]];
  part.arc(cradle,radians(-83),radians(38),
    [f.gunmetal,f.graphite,f.iron,f.gunmetal,f.iron,f.gunmetal,f.patina,f.bronze,f.recess,f.graphite],
    {steps:22,insets:cradle.map(([,r])=>[(.385-r)*1.35,(.385-r)*2.1])});
  const lid=[[.011,.372],[.037,.397],[.090,.392],[.127,.369],[.149,.329],
    [.143,.305],[.127,.297],[.105,.330],[.060,.356],[.011,.357]];
  part.arc(lid,radians(-70),radians(20),
    [f.patina,f.ochre,f.ochre,f.repair,f.ivory,f.bronze,f.iron,f.gunmetal,f.gunmetal,f.gunmetal],
    {steps:17,insets:lid.map(([,r])=>[(.4-r)*1.7,(.4-r)*1.4])});
  for(const angle of [-53,-29,1]){
    const p=polar(.145,.332,radians(angle));
    part.rod(p,translate(p,[.008,0,0]),.009,.008,f.iron,6);
  }
  for(const angle of [-38,78,180]){
    const angleRad=radians(angle),shape=[[.19,-.10],[.245,-.10],[.458,-.049],[.496,-.044],
      [.501,.044],[.43,.045],[.29,.028],[.228,.082]];
    const outline=shape.map(([r,t])=>[r*Math.cos(angleRad)-t*Math.sin(angleRad),r*Math.sin(angleRad)+t*Math.cos(angleRad)]);
    part.plate(-.047,.096,outline,f.gunmetal,f.iron,.008);
    const cheek=[[.263,-.041],[.311,-.033],[.384,-.027],[.439,-.042],[.477,-.035],
      [.481,.026],[.438,.053],[.388,.043],[.316,.018],[.265,.030]];
    part.plate(.025,.049,sectorOutline(angleRad,cheek),f.iron,f.graphite,.006);
    const shoe=[];
    for(const [r,t] of [[.343,-.038],[.444,-.031],[.468,-.021],[.461,.001],[.354,.006]]) {
      shoe.push([r*Math.cos(angleRad)-t*Math.sin(angleRad),r*Math.sin(angleRad)+t*Math.cos(angleRad)]);
    }
    part.plate(.007,.014,shoe,f.iron,f.patina,.003);
    const lower=polar(.014,.242,angleRad+.12),upper=polar(.014,.462,angleRad+.03);
    part.rod(lower,at(lower,upper,.55),.019,.023,f.graphite);
    part.rod(at(lower,upper,.5),upper,.010,.010,f.nickel);
    pin(part,polar(-.037,.462,angleRad),.039,.16);
    // Independent idler edges are visible through the annulus below the bonnet.
    for(const axleAngle of [-.084,.084]) {
      const roller=polar(-.010,.453,angleRad+axleAngle);
      bearing(part,.013,.035,.055,f.belt,roller,14);
      part.rod(translate(roller,[-.023,0,0]),translate(roller,[.045,0,0]),.014,.014,f.bronze,8);
    }
  }
  part.rod([-.218,0,0],[.351,0,0],.134,.127,f.gunmetal,36);
  // Stepped axial transmission, with an exposed polished band between seals.
  for(const [x,r,w,mat] of [[-.19,.201,.045,f.iron],[-.144,.219,.043,f.graphite],[-.1,.207,.019,f.bronze],
    [-.043,.221,.079,f.gunmetal],[.023,.216,.031,f.patina],[.066,.191,.029,f.iron],
    [.102,.17,.034,f.nickel],[.139,.184,.018,f.graphite],[.169,.157,.023,f.patina],
    [.207,.144,.041,f.iron],[.246,.152,.015,f.ochre],[.29,.143,.025,f.graphite],
    [.333,.122,.017,f.iron],[.373,.086,.048,f.graphite]])bearing(part,x,r,w,mat);

  // Split domed cowling, cut away on each side to expose the axial seals.
  const skin=[[.018,.218],[.034,.239],[.085,.250],[.12,.248],[.181,.233],
    [.245,.207],[.312,.172],[.365,.127],[.394,.088],[.384,.081],
    [.351,.114],[.302,.153],[.233,.187],[.165,.211],[.088,.228],[.027,.211]];
  for(const [start,end,mat] of [[-88,-8,f.ivory],[-7.2,85,f.chalk],[91,189,f.bone],[190,266,f.repair]]) {
    // Two maintenance windows open into the flanks of the nacelle. The
    // plating converges again at each end, keeping a continuous nose assembly.
    const opening=x=>Math.sin(Math.PI*Math.max(0,Math.min(1,(x-.018)/.376)))**1.65;
    const insets=skin.map(([x])=>[radians((start===-88||start===91?31:0)*opening(x)),
      radians((end===85||end===266?33:0)*opening(x))]);
    const uvRows=skin.map(([x])=>.04+.92*(x-.018)/.376);
    part.arc(skin,radians(start),radians(end),skin.map((_,i)=>i<9?mat:f.patina),{insets,uvRows,steps:12});
  }
  // Nose flange and cheek sockets carry the tool's bending load into the body.
  bearing(part,.370,.125,.012,f.patina,[0,0,0],28,.105);
  bearing(part,.395,.088,.016,f.iron,[0,0,0],24,.061);
  for(const side of [-1,1]){
    const p=[.211,0,side*.156],direction=[0,0,side];
    for(const [near,far,r0,r1,mat] of [[-.014,.016,.062,.060,f.graphite],
      [.016,.026,.055,.051,f.iron],[.026,.036,.038,.037,f.patina],[.036,.042,.025,.024,f.gunmetal]]) {
      part.rod(translate(p,direction.map(v=>v*near)),translate(p,direction.map(v=>v*far)),r0,r1,mat,18);
    }
    for(const angle of [.5,2.1,3.7,5.2]) {
      const bolt=[p[0]+.043*Math.cos(angle),p[1]+.043*Math.sin(angle),p[2]+side*.028];
      part.rod(bolt,translate(bolt,[0,0,side*.004]),.006,.006,f.bronze,6);
    }
    // Ribbed seal visible between a flange and the cowling edge. The
    // tapering steel carrier and union nuts explain where the axle terminates.
    if(side<0){
      const start=translate(p,[0,0,-.036]),end=[.087,.024,-.414];
      // The geared shaft runs inboard to a crosshead fixed on the negative-Z
      // bearing shoe. Both terminal collars have seats and axial retention.
      const crosshead=[[.331,-.048],[.379,-.077],[.444,-.065],[.469,-.034],
        [.455,.023],[.408,.061],[.342,.044],[.324,.009]];
      part.plate(.028,.111,sectorOutline(radians(-86),crosshead),f.gunmetal,f.iron,.008);
      part.plate(.089,.024,sectorOutline(radians(-86),crosshead.map(([r,t])=>[.400+(r-.400)*.83,t*.79])),f.bronze,f.iron,.004);
      pin(part,polar(.030,.421,radians(-89)),.028,.157);
      part.rod(start,end,.037,.035,f.iron,18);
      for(const [near,far,r0,r1,mat] of [[.00,.13,.056,.054,f.graphite],
        [.13,.20,.051,.051,f.bronze],[.20,.25,.046,.043,f.nickel],
        [.25,.32,.040,.040,f.graphite],[.32,.39,.048,.047,f.iron],
        [.39,.44,.042,.040,f.nickel],[.44,.49,.040,.039,f.graphite],
        [.49,.64,.047,.050,f.iron],[.66,.71,.044,.043,f.graphite],
        [.72,.80,.049,.054,f.patina],[.80,.96,.054,.057,f.gunmetal],
        [.96,1.05,.057,.054,f.iron]]) {
        part.rod(at(start,end,near),at(start,end,far),r0,r1,mat,18);
      }
    }
    const pipe=[[.14,.11,.16],[.11,.16,.206],[.068,.172,.242],
      [.030,.158,.253],[-.020,.133,.255]].map(([x,y,z])=>[x,y,z*side]);
    part.hose(pipe,.007,f.rubber,12);
  }
  // Split access rail follows the bonnet taper. Its chamfered shoulders and
  // transverse end fasteners remain legible even when the tool is folded.
  const access=[[.069,.247],[.082,.257],[.111,.260],[.143,.254],
    [.183,.240],[.222,.221],[.230,.210],[.213,.202],[.073,.231]];
  part.arc(access,radians(-32),radians(18),
    [f.patina,f.repair,f.repair,f.ivory,f.ivory,f.iron,f.patina,f.graphite,f.patina],
    {steps:9,insets:access.map(([x])=>[.73*(x-.069),.42*(.23-x)])});
  for(const a of [-23,10]) {
    const angle=radians(a),p=polar(.118,.258,angle);
    const normal=[0,.006*Math.cos(angle),.006*Math.sin(angle)];
    part.rod(p,translate(p,normal),.007,.006,f.bronze,6);
  }
  // The nose is a removable split casting, retained by a full ring behind
  // the shoulder joint. A screw cap and dark rebate are visible around it.
  bearing(part,.350,.146,.010,f.iron,[0,0,0],32,.132);
  for(const a of [-111,-11,69,160]){
    const p=polar(.367,.122,radians(a));
    part.rod(p,translate(p,[.009,0,0]),.006,.005,f.bronze,6);
  }
  // The close-packed end of the counterweight is visible on the reverse face.
  const back=[[ -.333,.080],[-.327,.121],[-.299,.160],[-.270,.191],[-.226,.209],[-.198,.205],
    [-.195,.157],[-.239,.142],[-.298,.101],[-.325,.071]];
  for(const [s,e,mat] of [[-47,61,f.ivory],[68,180,f.bone],[188,305,f.repair]])part.arc(back,radians(s),radians(e),mat);
  part.rod([-.338,0,0],[-.329,0,0],.079,.087,f.graphite,28);
  bearing(part,-.341,.065,.009,f.iron,[0,0,0],22);
  part.rod([-.348,0,0],[-.343,0,0],.029,.03,f.bronze,6);
  for(let i=0;i<6;i++) {
    const a=i*TURN/6;
    const p=polar(-.282,.171,a);
    part.rod(p,translate(p,[-.005,0,0]),.009,.008,f.graphite,6);
  }
  for(const a of [-75,100]) {
    const ps=[[.333,.132,a],[.22,.185,a+3],[.14,.213,a+12],[.041,.24,a+6],[-.012,.221,a]];
    part.hose(ps.map(([x,r,ang])=>polar(x,r,radians(ang))),.010,f.rubber,12);
  }
  part.rod([.335,0,0],[.429,0,.025],.079,.059,f.iron,24);
}

function link(part,end,pivotRadius,bodyWidth,paint) {
  const [ex,ey,ez]=end,len=Math.hypot(ey,ez),ny=-ez/len,nz=ey/len;
  const toolPoint=(t,w,x)=>[ex*t+x,t*ey+w*bodyWidth*ny,t*ez+w*bodyWidth*nz];
  // A tapered web and an open slot behind each bright piston keep the arm
  // light. The forked barrel ends enter their joint bosses at both ends.
  const outline=[[.08,-.66],[.17,-.94],[.28,-.49],[.64,-.36],[.84,-.61],
    [.95,-.28],[.93,.5],[.82,.72],[.69,.36],[.27,.45],[.18,.94],[.10,.65]]
    .map(([t,w])=>toolPoint(t,w,0).slice(1));
  part.plate(ex/2,.043,outline,paint,f.patina,.004);
  pin(part,[0,0,0],pivotRadius,.082);
  for(const side of [-1,1]){
    const start=toolPoint(.13,side*.95,.018),tip=toolPoint(.87,side*.84,.018);
    const barrelEnd=side<0?.44:.31;
    part.rod(start,at(start,tip,barrelEnd),.012,.012,f.iron,12);
    part.rod(at(start,tip,barrelEnd-.06),at(start,tip,barrelEnd+.04),.014,.013,f.bronze,10);
    part.rod(at(start,tip,barrelEnd+.03),at(start,tip,.90),.007,.007,f.nickel,10);
    part.rod(at(start,tip,.87),tip,.012,.012,f.graphite,10);
    for(const [t,w] of [[.13,.95],[.87,.84]]){
      const heel=toolPoint(t,side*w,.018);
      part.rod(heel,toolPoint(t,side*.41,0),.012,.014,f.iron,8);
    }
  }
  part.hose([toolPoint(.13,-.1,-.019),toolPoint(.31,-.91,-.028),
    toolPoint(.65,-.88,-.028),toolPoint(.85,-.12,-.018)],.005,f.rubber,8);
}

export async function createSpindle() {
  const doc=new Document(); doc.createBuffer();
  const scene=doc.createScene('Precision Machine'); doc.getRoot().setDefaultScene(scene);
  const root=doc.createNode('Spindle'); scene.addChild(root);
  const mat=await spindleMaterial(doc);
  const make=(name,parent,offset)=>new RigidMesh(doc,mat,name,parent,offset);
  const roll=make('Roll',root,[0,R,0]),housing=make('Housing',root,[0,R,0]);
  wheel(roll);carriage(housing);
  const shoulder=make('Shoulder',housing.pivot,[.427,0,.025]),upper=[.008,.276,.096];
  const elbow=make('Elbow',shoulder.pivot,upper),fore=[.010,.053,.291];
  const wrist=make('Wrist',elbow.pivot,fore),distal=[.005,-.158,.259];
  link(shoulder,upper,.061,.033,f.iron);link(elbow,fore,.047,.030,f.bronze);
  link(wrist,distal,.045,.026,f.ivory);
  const collet=translate(distal,[0,-.031,.031]);
  const chuck=at([0,0,0],distal,.80);
  wrist.rod(chuck,collet,.023,.018,f.iron,12);
  for(const [near,far,r0,r1,mat,count] of [[.09,.26,.027,.028,f.graphite,10],
    [.28,.39,.025,.025,f.nickel,12],[.41,.67,.027,.024,f.bronze,6],
    [.69,.78,.022,.021,f.graphite,10],[.79,.93,.023,.019,f.nickel,12]]) {
    wrist.rod(at(chuck,collet,near),at(chuck,collet,far),r0,r1,mat,count);
  }
  pin(wrist,collet,.019,.054);
  const jaws=[];
  for(const [side,name] of [[-1,'JawA'],[1,'JawB']]) {
    const jaw=make(name,wrist.pivot,translate(collet,[side*.017,0,0]));
    const knuckle=[side*.029,-.032,.034],tip=[side*.018,-.101,.085];
    jaw.rod([0,0,0],knuckle,.014,.013,f.graphite,8);
    const boltStart=translate(knuckle,[-.014,0,0]),boltEnd=translate(knuckle,[.014,0,0]);
    jaw.rod(boltStart,boltEnd,.015,.015,f.iron,12);
    jaw.rod(boltEnd,translate(boltEnd,[.002,0,0]),.008,.008,f.bronze,6);
    jaw.rod(knuckle,tip,.014,.0032,f.yellow,7);
    jaw.rod(tip,translate(tip,[-side*.004,-.014,.008]),.004,.0016,f.nickel,6);
    jaws.push(jaw);
  }
  for(const part of [roll,housing,shoulder,elbow,wrist,...jaws])part.finish();
  return doc;
}
