import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from '../../server/index.js';
import { launchBrowser,describeGraphics } from '../../tools/browser.mjs';
const server=await startServer({port:0,dataFile:null});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1000,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error|VALIDATE_STATUS/i.test(m.text()))errors.push(m.text());});
 await page.goto('http://127.0.0.1:'+server.port+'/client/art-preview.html');
 await page.waitForFunction(()=>window.__artPreview?.ready,{},{timeout:30000});
 const ids=await page.evaluate(()=>window.__artPreview.ids);assert.equal(ids.length,45);
 console.log('Graphics:',await describeGraphics(page));
 await fs.mkdir('art-evidence',{recursive:true});
 for(const id of ids){const result=await page.evaluate(async id=>{await window.__artPreview.select(id);return {ready:window.__artPreview.ready,triangles:window.__artPreview.triangles,error:window.__artPreview.error};},id);assert.ok(result.ready&&result.triangles>0&&!result.error,id+': '+JSON.stringify(result));await page.locator('#view').screenshot({path:'art-evidence/'+id.replace(':','_')+'.png'});}
 await page.evaluate(()=>window.__artPreview.select('backpack_research'));await page.locator('#view').screenshot({path:'art-evidence/backpack_research_rear.png'});await page.locator('#yaw').evaluate(e=>{e.value='34';e.dispatchEvent(new Event('input'));});await page.locator('#view').screenshot({path:'art-evidence/backpack_research_wearer.png'});
 const reviewIds=await page.evaluate(()=>window.__artPreview.reviewIds);assert.equal(reviewIds.length,65);
 // Capture every flat item and verify decoded images, rather than treating a
 // successfully selected dropdown value as proof that the image loaded.
 for(const id of reviewIds.filter(x=>!ids.includes(x))){
  await page.evaluate(id=>window.__artPreview.select(id),id);
  const pane=page.locator('#flat-preview');
  await pane.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  await pane.screenshot({path:'art-evidence/'+id.replace(':','_')+'.png'});
 }
 // Two distinct phases expose effect motion and fading in the evidence.
 for(const id of ids.filter(x=>x.includes(':')&&!x.startsWith('mender:'))){
  await page.evaluate(id=>window.__artPreview.select(id),id);
  for(const phase of [20,75]){
   await page.locator('#phase').evaluate((e,p)=>{e.value=String(p);e.dispatchEvent(new Event('input'));},phase);
   await page.locator('#view').screenshot({path:'art-evidence/'+id.replace(':','_')+'_phase'+phase+'.png'});
  }
 }
 await page.locator('#phase').evaluate(e=>{e.value='42';e.dispatchEvent(new Event('input'));});
 await page.evaluate(()=>window.__artPreview.select('backpack_research'));
 await page.locator('input[name="review-decision"][value="modify"]').check();
 await page.locator('#review-note').fill('Check silhouette');
 await page.evaluate(()=>window.__artPreview.select('engineering_workstation'));
 assert.ok(await page.locator('input[name="review-decision"][value="unreviewed"]').isChecked());
 await page.locator('input[name="review-decision"][value="accepted"]').check();
 await page.evaluate(()=>window.__artPreview.select('glyph:aegis'));
 await page.locator('input[name="review-decision"][value="not-accepted"]').check();
 await page.reload();await page.waitForFunction(()=>window.__artPreview?.ready);
 await page.evaluate(()=>window.__artPreview.select('backpack_research'));
 assert.ok(await page.locator('input[name="review-decision"][value="modify"]').isChecked());assert.equal(await page.locator('#review-note').inputValue(),'Check silhouette');
 await page.locator('#review-filter').selectOption('accepted');
 assert.deepEqual(await page.locator('#asset option').evaluateAll(opts=>opts.map(o=>o.value)),['backpack_research','engineering_workstation']);
 const downloadEvent=page.waitForEvent('download');await page.locator('#review-export').click();const download=await downloadEvent;const payload=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 assert.equal(payload.records.length,65);assert.equal(payload.records.find(r=>r.id==='glyph:aegis').status,'not-accepted');
 assert.deepEqual(errors,[]);console.log('Rendered '+ids.length+' authoring previews');
}finally{await browser?.close();await server.close();}
