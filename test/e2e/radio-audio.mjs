import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startServer} from '../../server/index.js';
import {getRadioDialogue} from '../../shared/dialogue.js';
import {APPROVED_RADIO_ASSETS} from '../../client/src/radio-assets.js';

const ids=['kernel.directive.relay','kestrel.log17','sinter.instruction.vanguard','brine.evidence.signal'];
const server=await startServer({port:0,dataFile:null});
let browser;
try{
 const origin='http://127.0.0.1:'+server.port;
 for(const id of ids){
  const asset=APPROVED_RADIO_ASSETS[id];assert.ok(asset,id);
  const url=origin+'/client/assets/voice/'+id+'.mp3?v='+asset.sha256.slice(0,16);
  const res=await fetch(url,{method:'HEAD'});assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'audio/mpeg');assert.ok(Number(res.headers.get('content-length'))>0);
 }
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({reducedMotion:'no-preference'});
 await page.route(origin+'/radio-test-host',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main id="hud"></main>'}));
 await page.goto(origin+'/radio-test-host');
 await page.evaluate(async()=>{localStorage.setItem('attunement.radioVoice','0');localStorage.removeItem('attunement.radioVolume');const {RadioPanel}=await import('/client/src/radio.js');window.radio=new RadioPanel(document.querySelector('#hud'));});
 const show=id=>{const d=getRadioDialogue(id);return page.evaluate(d=>window.radio.receive(d.source,d.transcript,d.id),d);};
 const playing=()=>page.waitForFunction(()=>window.radio.recorded.audio?.currentTime>0.1&&window.radio.playing,{},{timeout:10000});
 for(const id of ids){
  await page.evaluate(()=>window.radio.clear());
  assert.equal(await show(id),true);
  await page.getByRole('button',{name:'Play voice'}).click();
  await playing();
  const info=await page.evaluate(()=>({state:window.radio.el.dataset.recorded,level:window.radio.bars[8].style.getPropertyValue('--level'),volume:window.radio.recorded.audio.volume}));
  assert.equal(info.state,'true');assert.ok(Number(info.level)>0);assert.equal(info.volume,1);
 }
 await page.locator('input[aria-label="Dialogue volume"]').evaluate(el=>{el.value='.5';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>window.radio.recorded.audio.volume),.5);
 await page.evaluate(()=>window.radio.clear());
 assert.equal(await page.evaluate(()=>window.radio.recorded.audio),null);
 assert.equal(await page.evaluate(()=>localStorage.getItem('attunement.radioVolume')),'0.5');
 // Actual missing media: transcript remains visible and explicit retry available.
 await page.route('**/client/assets/voice/kestrel.log17.mp3*',route=>route.abort());
 await show('kestrel.log17');await page.getByRole('button',{name:'Play voice'}).click();
 await page.waitForFunction(()=>window.radio.status.textContent.includes('unavailable'));
 assert.match(await page.locator('.radio-transcript').innerText(),/Kestrel log 17/);
 assert.equal(await page.evaluate(()=>window.radio.recorded.audio),null);
 await page.close();
 console.log('Four exact approved MP3s decoded and played by Chromium; amplitude, unity default, volume persistence, clear and missing-asset fallback verified');
}finally{await browser?.close();await server.close();}
