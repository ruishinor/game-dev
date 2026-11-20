// Accessibility and interaction gate for the compact HUD; isolated temp account.
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const work=await mkdtemp(join(tmpdir(),'attune-hud-ui-')),server=await startServer({port:0,dataFile:join(work,'characters.json')});
let browser;
try{
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1280,height:860},reducedMotion:'reduce'});
 page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.port+'/?q=0&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=0.25':''));
 await page.fill('#name','Hud Tester');await page.click('#enter');
 await liveFixturePlayer(page,server,'Hud Tester',60000);
 const frames=await page.evaluate(()=>{
  const read=sel=>{const n=document.querySelector(sel),css=n&&getComputedStyle(n);return {width:n?.getBoundingClientRect().width||0,height:n?.getBoundingClientRect().height||0,hidden:n?.hidden,visibility:css?.visibility,fontSize:css?.fontSize}};
  return {main:read('.actionbar .slot:not(.empty)'),pet:read('.petbar .slot.small'),map:read('.minimap'),day:read('.map-day'),name:read('.frame.player .name'),portrait:read('.frame.player .unit-portrait'),empty:read('.actionbar .slot.empty')};
 });
 assert.ok(frames.main.width>=50,'Primary hotbar must be legible');
 assert.ok(frames.pet.width>=41,'Companion hotbar must be legible');
 assert.ok(Math.abs(frames.pet.width/frames.main.width-.85)<.03,'Companion controls must be about 85% of the main slots');
 assert.ok(frames.map.width>=220,'Minimap must be legible on a desktop viewport');
 assert.equal(frames.day.hidden,false,'The day/night indicator must remain visible when the preview is not active');
 assert.ok(frames.portrait.width>=60,'Head-focused portrait must be legible');
 assert.ok(parseFloat(frames.name.fontSize)>=14,'Status names must not collapse to tiny text');
 assert.ok(frames.empty.width>0,'Logical empty slots must be present');
 const iconText=await page.locator('.map-day').textContent();assert.match(iconText,/☀|☾/);
 const companionActive=await page.evaluate(()=>Boolean(window.__attune?.state().compId));
 if(companionActive){
  await page.locator('.actionbar .slot[aria-label="Dismiss companion"]').click();
  await page.waitForFunction(()=>window.__attune?.state().compId===0);
  await page.waitForFunction(()=>document.querySelector('.actionbar .slot[aria-label^="Summon"]')!==null);
 }
 // Focused action buttons must not swallow gameplay shortcuts, and Tab
 // must remain available for native keyboard navigation.
 await page.locator('.actionbar .slot:not(.empty)').first().click();
 const keyboardIsolation=await page.evaluate(()=>{
   const check=(code,key)=>{
     const e=new KeyboardEvent('keydown',{code,key,bubbles:true,cancelable:true});
     window.dispatchEvent(e);
     return e.defaultPrevented;
   };
   return {ability:check('Digit1','1'),tab:check('Tab','Tab')};
 });
 assert.equal(keyboardIsolation.ability,true,'Combat shortcuts must work after clicking an action button');
 assert.equal(keyboardIsolation.tab,false,'Tab must remain native while an action button is focused');
 // Regression: a focused equipment slot must not swallow I (inventory),
 // even though the build panel is itself a dialog.
 await page.locator('#view').focus();await page.keyboard.press('KeyC');
 await page.locator('.panel.build').waitFor({state:'visible'});
 await page.locator('.doll-tabs [data-tab="gear"]').click();
 await page.locator('.equipment-slot-grid .doll-slot').first().click();
 await page.keyboard.press('KeyI');
 await page.locator('.inventory-window').waitFor({state:'visible'});
 await page.locator('.inventory-window .close').click();
 await page.locator('#view').focus();await page.keyboard.press('KeyO');
 const settings=page.locator('.settings-panel');await settings.waitFor({state:'visible'});
 await page.selectOption('#empty-slot-mode','hidden');
 assert.equal(await page.locator('.actionbar .slot.empty').first().evaluate(n=>getComputedStyle(n).visibility),'hidden');
 await page.selectOption('#empty-slot-mode','visible');
 assert.equal(await page.locator('.actionbar .slot.empty').first().evaluate(n=>getComputedStyle(n).visibility),'visible');
 await settings.getByRole('button',{name:'Configure combat and companion hotkeys'}).click();
 const panel=page.locator('.keybindings-panel');await panel.waitFor({state:'visible'});
 const slot1=panel.getByRole('button',{name:'Change Primary bar 1'});
 await slot1.click();await slot1.press('Shift+Digit7');
 assert.match(await slot1.textContent(),/⇧\+7/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('attunement.keybindings.v1'))['ability:1']),'Shift+Digit7');
 await panel.getByRole('button',{name:'Restore default hotkeys'}).click();
 assert.equal((await slot1.textContent()).trim(),'1');
 await panel.getByRole('button',{name:'Back to Settings'}).click();
 await page.locator('.settings-panel .close').click();
 await mkdir('test/e2e/out',{recursive:true});
 await page.screenshot({path:'test/e2e/out/hud-accessibility.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS readable HUD, head portrait frame, visible day/night, companion summon/dismiss, slot visibility and hotkeys');
}finally{await browser?.close();await server.close();await rm(work,{recursive:true,force:true});}
