// Render the shipped bundle through the game's loader. Review imagery stays local.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {startServer} from '../../server/index.js';
import {launchBrowser, describeGraphics} from '../browser.mjs';

const out = path.resolve(process.argv[2] || 'docs/evidence/spindle/studio');
await fs.mkdir(out, {recursive:true});
const server = await startServer({port:0, dataFile:null});
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({viewport:{width:840,height:720}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/review-studio', route => route.fulfill({contentType:'text/html', body:
    '<style>*{margin:0}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three-addons/"}}</script>'}));
  await page.goto('http://127.0.0.1:' + server.port + '/review-studio');
  const stats = await page.evaluate(async () => {
    const T = await import('three');
    const {Assets} = await import('/client/src/assets.js');
    const renderer = new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(840,720);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    document.body.append(renderer.domElement);
    const assets = await new Assets().init();
    const bundle = await assets.bundle('spindle');
    if (!bundle) throw Error('Spindle GLB missing: ' + assets.failed.get('spindle'));
    const model = assets.instance('spindle');
    const scene = new T.Scene();
    scene.background = new T.Color('#d1c9b9');
    // Large softbox reflections give painted and bare metal readable edges.
    const env = new T.Scene();
    env.background = new T.Color('#a49c91');
    for (const [x,y,z,w,h,power] of [[-2,4,3,5,3,4],[3,1,-3,2,4,2.5]]) {
      const panel = new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(power,power,power),side:T.DoubleSide}));
      panel.position.set(x,y,z); panel.lookAt(0,0,0); env.add(panel);
    }
    const generator = new T.PMREMGenerator(renderer);
    scene.environment = generator.fromScene(env).texture;
    scene.environmentIntensity = .7;
    scene.add(new T.HemisphereLight(0xfff3de,0x979081,1));
    const key = new T.DirectionalLight(0xfff3e2,2.35);
    key.position.set(3,5,2); key.castShadow=true;
    Object.assign(key.shadow.camera,{left:-2,right:2,top:2,bottom:-2,far:14});
    key.shadow.mapSize.set(1024,1024); key.shadow.normalBias=.002;
    scene.add(key);
    const back = new T.DirectionalLight(0xe5eeff,1.05);
    back.position.set(-3,2,-2); scene.add(back);
    const floor = new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:'#ccc6b9',roughness:1}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-.007; floor.receiveShadow=true;
    scene.add(floor,model);
    const camera = new T.OrthographicCamera(-1,1,1,-1,.02,80);
    function cameraAt(dir, target=[.08,.65,.19], height=1.67) {
      const center=new T.Vector3(...target);
      camera.position.copy(center).addScaledVector(new T.Vector3(...dir).normalize(),5);
      camera.left=-height*840/720/2; camera.right=-camera.left;
      camera.top=height/2; camera.bottom=-height/2;
      camera.up.set(0,1,0); camera.lookAt(center); camera.updateProjectionMatrix();
    }
    const materials=new Set(), textures=new Set(), geometries=new Set();
    model.traverse(o=>{
      if (!o.isMesh) return;
      geometries.add(o.geometry);
      for (const m of [].concat(o.material)) {
        materials.add(m);
        for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
      }
    });
    const wire=new T.MeshBasicMaterial({color:0x35322d,wireframe:true});
    const clay=new T.MeshStandardMaterial({color:0xa9a6a1,roughness:.64});
    const meshes=[]; model.traverse(o=>{if(o.isMesh) meshes.push([o,o.material]);});
    const {createSpindle} = await import('/client/src/spindle.js');
    const rig = createSpindle(model,()=>{});
    window.studio = {model,scene,assets,renderer,cameraAt,rig,draw:(dir,target,height,style)=>{
      cameraAt(dir,target,height);
      floor.visible=dir[1]>=0;
      for(const [o,m] of meshes) o.material=style==='wire'?wire:style==='clay'?clay:m;
      renderer.render(scene,camera);
    },profile:async (count,kind='spindle')=>{
      const copies=[];
      const baseline=kind==='survey_strider';
      const striders=[];
      if(baseline)await assets.bundle('creatures');
      const {makeCreature}=await import('/client/src/characters.js');
      for(let i=baseline?0:1;i<count;i++){
        const unit=baseline?makeCreature(assets,'survey_strider'):null;
        if(baseline && !unit)throw Error('Missing Survey Strider comparison');
        if(unit)striders.push(unit);
        const copy=unit?.group ?? assets.instance('spindle');
        copy.position.x=i%2*1.2;
        copy.position.z=Math.floor(i/2)*1.4;
        scene.add(copy);copies.push(copy);
      }
      model.visible=!baseline && count>0;
      cameraAt([1,.6,1],[.6,.5,.6],4.5);
      const gl=renderer.getContext(), pixel=new Uint8Array(4);
      const measure=()=>{const t=performance.now(); renderer.render(scene,camera);gl.readPixels(420,360,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return performance.now()-t;};
      measure();
      const samples=Array.from({length:7}, measure).sort((a,b)=>a-b);
      const result={kind,count,medianMs:samples[3],rangeMs:[samples[0],samples[6]],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
      for(const c of copies)scene.remove(c);
      for(const s of striders)s.dispose();
      model.visible=true;
      return result;
    }};
    return {loadMs:assets.stats.loadMs,bytes:assets.stats.bytes,geometryObjects:geometries.size,materialCount:materials.size,
      textures:[...textures].map(t=>[t.image.width,t.image.height]), meshNodes:meshes.length,
      triangles:meshes.reduce((sum,[o])=>sum+(o.geometry.index?.count || o.geometry.attributes.position.count)/3,0),
      bounds:new T.Box3().setFromObject(model).getSize(new T.Vector3()).toArray()};
  });
  const hero=[2.55,.46,-1.85];
  const views = [
    ['hero', hero], ['front',[0,.001,1]], ['rear',[0,.001,-1]],
    ['tool-side',[1,.001,0]], ['opposite-side',[-1,.001,0]], ['top',[0,1,.0001]],
    ['rear-quarter',[-1.6,.65,-1]], ['undercarriage',[-1,-.35,.76]],
    ['hub',[1,.21,-.32],[.18,.64,.01],.75],
    ['tool',[1,.34,.55],[.36,.73,.57],.95], ['armour',[1,.55,-.4],[.08,.96,-.09],.73],
    ['wire',hero,undefined,undefined,'wire'], ['clay',hero,undefined,undefined,'clay']
  ];
  for(const [name,dir,target,height,style] of views) {
    await page.evaluate(([dir,target,height,style])=>{window.studio.draw(dir,target??undefined,height??undefined,style)},[dir,target,height,style]);
    await page.screenshot({path:path.join(out,name+'.png')});
  }
  // Advance the same rig as gameplay a fixed frame at a time. Avoid screenshot
  // timing or software WebGL throughput affecting wheel angle and tool position.
  const frames=[];
  for (const [label,mode,act,speed] of [
    ['ready','follow','idle',0], ['transport','follow','idle',2],
    ['standby','stay','idle',0], ['deployed','inspect','inspecting',0],
    ['retracted','stay','idle',0]
  ]) {
    await page.evaluate(([hero,mode,act,speed])=>{
      for(let i=0;i<60;i++)window.studio.rig.update(1/60,{mode,act,speed,travel:speed/60,interval:0});
      window.studio.draw(hero);
    },[hero,mode,act,speed]);
    const file=path.join(out,label+'.png');
    await page.screenshot({path:file});
    const input=await sharp(file).resize(280,240).extend({bottom:28,background:'#eeeae2'})
      .composite([{input:Buffer.from('<svg width="280" height="28"><text x="8" y="19" font-family="Arial" font-size="14">'+label+'</text></svg>'),top:240,left:0}]).png().toBuffer();
    frames.push({input,top:0,left:frames.length*280});
  }
  await sharp({create:{width:280*frames.length,height:268,channels:3,background:'#eeeae2'}})
    .composite(frames).png().toFile(path.join(out,'motion-states.png'));
  // A turntable shot of the actual mesh. The orbit and scripted inspection
  // are studio inputs; live owner/observer behavior is captured by the E2E.
  const orbit=[];
  for(let frame=0;frame<48;frame++) {
    const png=await page.evaluate(([frame,hero])=>{
      const angle=frame*Math.PI*2/48+Math.atan2(hero[0],hero[2]);
      const mode=frame<12||frame>=38?'stay':'inspect';
      for(let i=0;i<5;i++)window.studio.rig.update(1/60,{mode,act:mode==='stay'?'idle':'inspecting',speed:0,travel:0,interval:0});
      window.studio.draw([Math.sin(angle),.23,Math.cos(angle)]);
      return window.studio.renderer.domElement.toDataURL('image/png').split(',')[1];
    },[frame,hero]);
    orbit.push(await sharp(Buffer.from(png,'base64')).resize(560,480).png().toBuffer());
  }
  await sharp(orbit,{join:{animated:true}}).webp({delay:85,loop:0,quality:85}).toFile(path.join(out,'turntable.webp'));
  // Restore production materials before measurements.
  await page.evaluate(dir=>window.studio.draw(dir),hero);
  stats.graphics=await describeGraphics(page);
  stats.profile=[];
  for(const count of [0,1,4]) stats.profile.push(await page.evaluate(n=>window.studio.profile(n),count));
  for(const count of [1,4]) stats.profile.push(await page.evaluate(n=>window.studio.profile(n,'survey_strider'),count));
  if(errors.length) throw Error(errors.join('\n'));
  await fs.writeFile(path.join(out,'metrics.json'),JSON.stringify(stats,null,2)+'\n');
  const cells = await Promise.all(views.map(async ([name],index)=>{
    const cell=await sharp(path.join(out,name+'.png')).resize(336,288).extend({bottom:30,background:'#eeeae2'}).composite([
      {input:Buffer.from('<svg width="336" height="30"><text x="12" y="21" font-family="Arial" font-size="15" fill="#393632">'+name+'</text></svg>'),left:0,top:288}
    ]).png().toBuffer();
    return {input:cell,left:index%4*336,top:Math.floor(index/4)*318};
  }));
  await sharp({create:{width:1344,height:Math.ceil(cells.length/4)*318,channels:3,background:'#eeeae2'}}).composite(cells).png().toFile(path.join(out,'views.png'));
  console.log(out,JSON.stringify(stats));
} finally {
  await browser?.close();
  await server.close();
}
