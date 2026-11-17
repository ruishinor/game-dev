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
  const res=await fetch(url,{method:'HEAD'});assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'audio/mpeg');assert.ok(Number(res.headers.get('content-length'))>0);const part=await fetch(url,{headers:{Range:'bytes=0-127'}});assert.equal(part.status,206);assert.equal((await part.arrayBuffer()).byteLength,128);assert.match(part.headers.get('content-range'),/^bytes 0-127\//);
 }
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({reducedMotion:'no-preference'});
 await page.route(origin+'/radio-test-host',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="stylesheet" href="/client/style.css"><main id="hud"><div class="side"><div class="tracker" style="margin-top:220px">Quest</div></div></main>'}));
 await page.goto(origin+'/radio-test-host');
 await page.evaluate(async()=>{window.synthCalls=0;if(window.speechSynthesis)window.speechSynthesis.speak=()=>{window.synthCalls++;};localStorage.setItem('attunement.radioVoice','0');localStorage.removeItem('attunement.radioVolume');const {RadioPanel}=await import('/client/src/radio.js');window.radio=new RadioPanel(document.querySelector('#hud'),{tracker:document.querySelector('.tracker')});document.body.append(window.radio.settings());});
 const show=id=>{const d=getRadioDialogue(id);return page.evaluate(d=>window.radio.receive(d.source,d.transcript,d.id),d);};
 const playing=async()=>{try{await page.waitForFunction(()=>window.radio.recorded.audio?.currentTime>0.1&&window.radio.playing,{},{timeout:12000});}catch(e){console.error('Media diagnostic',await page.evaluate(()=>({status:window.radio.status?.textContent,mode:window.radio.prefs.mode,media:window.radio.recorded.audio?{time:window.radio.recorded.audio.currentTime,ready:window.radio.recorded.audio.readyState,network:window.radio.recorded.audio.networkState,error:window.radio.recorded.audio.error?.message}:null,mp3:new Audio().canPlayType('audio/mpeg')})));throw e;}};
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
 await page.getByRole('combobox',{name:'Dialogue voice'}).selectOption('off');assert.ok(await page.getByRole('button',{name:'Play voice'}).isDisabled());await page.evaluate(()=>window.radio.play());assert.equal(await page.evaluate(()=>window.radio.recorded.audio),null);
 await page.getByRole('button',{name:'Unlock transmission position'}).click();const box=await page.locator('.radio-head').boundingBox();await page.mouse.move(box.x+10,box.y+8);await page.mouse.down();await page.mouse.move(100,150,{steps:5});await page.mouse.up();assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('attunement.radioPrefs')).pos!==null));await page.getByRole('button',{name:'Lock transmission position'}).click();await page.getByRole('button',{name:'Cycle transmission background opacity'}).click();assert.equal(await page.evaluate(()=>window.radio.prefs.opacity),80);
 await page.evaluate(()=>{window.radio.clear();window.radio.setMode('auto');window.radio.receive('kernel','Unrecorded transcript');});assert.equal(await page.evaluate(()=>window.synthCalls),0);assert.match(await page.locator('.radio-status').innerText(),/Recording not yet available/);
 await page.close();
 console.log('Four exact approved MP3s decoded and played by Chromium; amplitude, unity default, volume persistence, clear and missing-asset fallback verified');
}finally{await browser?.close();await server.close();}
