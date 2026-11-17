import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startServer } from '../../server/index.js';
import { launchBrowser,describeGraphics } from '../../tools/browser.mjs';
const server=await startServer({port:0,dataFile:null});
let browser;
try{
 browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1000,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/client/art-preview.html');
 await page.waitForFunction(()=>window.__artPreview?.ready,{},{timeout:30000});
 const ids=await page.evaluate(()=>window.__artPreview.ids);assert.equal(ids.length,45);
 console.log('Graphics:',await describeGraphics(page));
 await fs.mkdir('art-evidence',{recursive:true});
 for(const id of ids){const result=await page.evaluate(async id=>{await window.__artPreview.select(id);return {ready:window.__artPreview.ready,triangles:window.__artPreview.triangles,error:window.__artPreview.error};},id);assert.ok(result.ready&&result.triangles>0&&!result.error,id+': '+JSON.stringify(result));if(['backpack_research','mender:visual','aegis:base','colony_mature','research_workstation'].includes(id))await page.locator('#view').screenshot({path:'art-evidence/'+id.replace(':','_')+'.png'});}
 assert.deepEqual(errors,[]);console.log('Rendered '+ids.length+' authoring previews');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
