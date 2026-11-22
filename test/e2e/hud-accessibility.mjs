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
 await page.click('#gate-guest-link');await page.fill('#name','Hud Tester');await page.click('#enter');
 await liveFixturePlayer(page,server,'Hud Tester',60000);
 const frames=await page.evaluate(()=>{
  const read=sel=>{const n=document.querySelector(sel),css=n&&getComputedStyle(n);return {width:n?.getBoundingClientRect().width||0,height:n?.getBoundingClientRect().height||0,hidden:n?.hidden,visibility:css?.visibility,fontSize:css?.fontSize}};
  return {main:read('.actionbar .slot:not(.empty)'),pet:read('.petbar .slot.small'),map:read('.minimap'),day:read('.map-day'),name:read('.frame.player .name'),portrait:read('.frame.player .unit-portrait'),empty:read('.actionbar .slot.empty')};
 });
 assert.ok(frames.main.width>=39&&frames.main.width<=52,'Primary hotbar should remain compact without becoming unreadable');
 assert.ok(frames.pet.width>=32&&frames.pet.width<=40,'Companion hotbar must be compact but usable');
 assert.ok(frames.pet.width/frames.main.width>=.78&&frames.pet.width/frames.main.width<=.90,'Companion bar must remain subordinate to the primary bar');
 assert.ok(frames.map.width>=95&&frames.map.width<=146,'Reference minimap should be compact on desktop');
 assert.equal(frames.day.hidden,false,'The day/night indicator must remain visible when the preview is not active');
 assert.ok(frames.portrait.width>=46&&frames.portrait.width<=58,'Character portrait must be legible and compact');
 assert.ok(parseFloat(frames.name.fontSize)>=12,'Status names must remain readable without dominating the world');
 assert.ok(frames.empty.width>0,'Logical empty slots must be present');
 const neutralTrims=await page.evaluate(()=>['.frame.player','.frame.pet','.minimap'].map(selector=>{
   const node=document.querySelector(selector);
   if(!node||node.hidden)return null;
   return getComputedStyle(node).borderTopColor.match(/\d+/g)?.slice(0,3).map(Number);
  }));
  for(const rgb of neutralTrims.filter(Boolean)){
   const [red,green,blue]=rgb;
   assert.ok(red<=green&&green<=blue,'Portrait/minimap trim must be cool neutral, not gold or beige');
  }
  const presentation=await page.evaluate(()=>{
   const el=selector=>document.querySelector(selector);
   const bar=el('.actionbar'),player=el('.frame.player'),map=el('.minimap');
   const frame=player?.getBoundingClientRect(),m=map?.getBoundingClientRect();
   return {barWidth:bar?.getBoundingClientRect().width||0,playerWidth:frame?.width||0,
     overlaps:!!(frame&&m&&frame.right>m.left),
     defaults:bar?.dataset.emptyMode};
 });
 assert.ok(presentation.playerWidth<=270,'Player portrait must not become a dashboard card');
 assert.ok(presentation.barWidth<=500,'Hotbar must remain compact at a desktop viewport');
 assert.equal(presentation.overlaps,false,'Portrait and map should occupy distinct corners');
 assert.equal(presentation.defaults,'transparent','New characters should not start with prominent empty slots');
 // Rendered screenshots are functional evidence, not artistic acceptance.
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
 // The independent Ability Matrix can recover assignments after Ctrl-drag removal.
 await page.locator('#view').focus();await page.keyboard.press('KeyP');
 const matrix=page.locator('.ability-matrix');await matrix.waitFor({state:'visible'});
 assert.ok((await matrix.locator('.ability-matrix-entry').count())>=1,'Known class abilities must be recoverable');
 await matrix.getByRole('button',{name:'Close Ability Matrix'}).click();
 await matrix.waitFor({state:'hidden'});
 // Owner-approved HUD: there must not be a second summon/dismiss control
 // underneath the character and companion portraits.
 assert.equal(await page.locator('.summon-pet').count(),0);
 const characterIcon=page.getByRole('button',{name:'Character (C)'});
 const menuIcon=page.getByRole('button',{name:'Menu (Esc)'});
 const helpIcon=page.getByRole('button',{name:'Help (H)'});
 for(const control of [characterIcon,menuIcon,helpIcon]){
  assert.equal(await control.locator('svg').count(),1,'Corner control must use a real icon');
  assert.equal((await control.textContent()).trim(),'','Corner controls must not repeat labels in-game');
 }
 await page.locator('#view').focus();
 await page.keyboard.press('KeyM');
 await page.locator('.world-atlas').waitFor({state:'visible'});
 await page.keyboard.press('KeyM');
 await page.locator('.world-atlas').waitFor({state:'hidden'});
 await page.locator('#view').focus();await page.keyboard.press('KeyM');
 await page.locator('.world-atlas').waitFor({state:'visible'});
 await page.keyboard.press('Escape');
 await page.locator('.world-atlas').waitFor({state:'hidden'});
 await page.locator('#view').focus();
 await page.keyboard.press('Escape');
 await page.locator('.menu-items').waitFor({state:'visible'});
 await page.keyboard.press('Escape');
 await page.locator('.menu-items').waitFor({state:'hidden'});
 await mkdir('test/e2e/out',{recursive:true});
 for(const viewport of [{width:1280,height:860},{width:1366,height:768},{width:1920,height:1080},{width:320,height:720}]){
   await page.setViewportSize(viewport);
   const layout=await page.evaluate(()=>{
     const box=s=>document.querySelector(s)?.getBoundingClientRect();
     const player=box('.frame.player'),portrait=box('.frame.player .unit-portrait');
     const map=box('.minimap'),action=box('.action-row');
     const chat=box('.logwrap'),bars=box('.bars');
     const chatHotbarOverlap=!!(chat&&bars&&chat.left<bars.right&&chat.right>bars.left&&chat.top<bars.bottom&&chat.bottom>bars.top);
     const width=window.innerWidth;
     return {width,playerRight:player?.right??0,portraitLeft:portrait?.left??0,
       mapLeft:map?.left??0,mapRight:map?.right??0,
       actionLeft:action?.left??0,actionRight:action?.right??0,chatHotbarOverlap};
   });
   assert.ok(layout.playerRight<layout.mapLeft,'Unit strip and minimap must not overlap at '+viewport.width);
   assert.ok(layout.portraitLeft>=-2,'Portrait must remain visible at '+viewport.width);
   assert.ok(layout.mapRight<=layout.width+2,'Minimap must not clip at '+viewport.width);
   const mapSize=await page.locator('.minimap').boundingBox();
   assert.ok(mapSize.width<=(viewport.width<=700?104:viewport.width>=1600?146:120),'Minimap must remain blueprint-scale at '+viewport.width);
   assert.ok(layout.actionLeft>=-2&&layout.actionRight<=layout.width+2,'Main hotbar must fit at '+viewport.width);
   if(viewport.width>=1200)assert.equal(layout.chatHotbarOverlap,false,'Default chat must not obstruct centered combat controls at '+viewport.width);
   await page.screenshot({path:'test/e2e/out/hud-'+viewport.width+'x'+viewport.height+'.png'});
 }
 await page.setViewportSize({width:1280,height:860});
 await page.screenshot({path:'test/e2e/out/hud-accessibility.png'});
 // Functional hotbar checks run after the approved visual evidence is captured.
 const slot=i=>page.locator('.actionbar .slot[data-slot-index="'+i+'"]');
 const first=await slot(0).getAttribute('data-ability');
 const second=await slot(1).getAttribute('data-ability');
 assert.ok(first&&second,'Two assigned abilities are needed for swap validation');
 const ctrlDrag=async(from,to)=>{
   const origin=await slot(from).boundingBox();
   assert.ok(origin,'Source ability must have a visible slot');
   const source=await page.evaluate(({x,y,from})=>{
     const node=document.querySelector('.actionbar [data-slot-index="'+from+'"]');
     const style=getComputedStyle(node);
     const elements=document.elementsFromPoint(x,y).slice(0,8).map(el=>({tag:el.tagName,className:typeof el.className==='string'?el.className:null,slot:el.dataset?.slotIndex??null}));
     const rect=node.getBoundingClientRect();
     return {from,cls:node.className,hidden:node.hidden,disabled:node.disabled,
       ability:node.dataset.ability??null,barMode:node.parentElement?.dataset.emptyMode??null,
       style:{display:style.display,visibility:style.visibility,opacity:style.opacity,pointerEvents:style.pointerEvents},
       rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},elements};
   },{x:origin.x+origin.width/2,y:origin.y+origin.height/2,from});
   // The preceding pointerup reconstructs the bar synchronously. Chromium's
   // hit-test tree may lag that DOM update by a rendering frame, even though
   // the relocated ability is visible, enabled and has pointer-events:auto.
   // Wait for a genuinely pointer-hit-testable slot instead of using a fixed
   // delay, dispatching synthetic pointer events or weakening drag assertions.
   const start=Date.now();
   const hitReady=await page.waitForFunction(({from})=>{
     const el=document.querySelector('.actionbar [data-slot-index="'+from+'"]');
     if(!el)return false;
     const r=el.getBoundingClientRect();
     return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.actionbar [data-slot-index]')===el;
   },{from},{timeout:4000,polling:50}).then(()=>true,()=>false);
   assert.equal(hitReady,true,'Ctrl-drag source never became hit-testable: '+JSON.stringify(source));
   const settled=await slot(from).boundingBox();
   console.log('[hud] Ctrl-drag source '+from+' hit-tested after '+(Date.now()-start)+'ms');
   await page.keyboard.down('Control');
   await page.mouse.move(settled.x+settled.width/2,settled.y+settled.height/2);
   await page.mouse.down();
   assert.equal(await page.locator('.actionbar').getAttribute('data-rearranging'),'true');
   const dest=to===null?{x:Math.floor(page.viewportSize().width/2),y:Math.floor(page.viewportSize().height/2)}:await slot(to).boundingBox();
   assert.ok(dest,'Drop target must be reachable');
   await page.mouse.move(to===null?dest.x:dest.x+dest.width/2,to===null?dest.y:dest.y+dest.height/2,{steps:8});
   await page.mouse.up();
   await page.keyboard.up('Control');
 };
 await ctrlDrag(0,7);
 assert.equal(await slot(7).getAttribute('data-ability'),first,'Ctrl-drag into empty slot moves the assigned ability');
 assert.equal(await slot(0).getAttribute('data-ability'),null,'Source slot must be empty after relocation');
 await ctrlDrag(7,1);
 assert.equal(await slot(1).getAttribute('data-ability'),first,'Occupied slot must receive the dragged ability');
 assert.equal(await slot(7).getAttribute('data-ability'),second,'Occupied-slot swap must preserve the displaced ability');
 // Escape cancels the drag even if the pointer is already outside the bar.
 const from=await slot(1).boundingBox();
 await page.keyboard.down('Control');
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
 await page.mouse.down();
 await page.mouse.move(640,300,{steps:8});
 await page.keyboard.press('Escape');
 await page.mouse.up();
 await page.keyboard.up('Control');
 assert.equal(await slot(1).getAttribute('data-ability'),first,'Esc must cancel without unassigning');
 await ctrlDrag(1,null);
 assert.equal(await slot(1).getAttribute('data-ability'),null,'Intentional Ctrl-drop outside removes only the hotbar assignment');
 await page.locator('#view').focus();
 await page.keyboard.press('KeyP');
 await matrix.waitFor({state:'visible'});
 const recovery=matrix.locator('.ability-matrix-entry').first();
 await recovery.locator('select').selectOption('8');
 await recovery.getByRole('button',{name:/Assign/}).click();
 assert.equal(await slot(8).getAttribute('data-ability'),first,'P matrix must recover the learned ability into a valid slot');
 const saved=await page.evaluate(()=>Object.entries(localStorage).find(([k])=>k.startsWith('attunement.hotbar.v1.'))?.[1]??null);
 assert.ok(saved,'Character-scoped hotbar must persist in browser storage');
 assert.equal(JSON.parse(saved)[8],first);
 await matrix.getByRole('button',{name:'Close Ability Matrix'}).click();
 assert.deepEqual(errors,[]);
 console.log('PASS readable HUD, head portrait frame, visible day/night, companion summon/dismiss, slot visibility and hotkeys');
}finally{await browser?.close();await server.close();await rm(work,{recursive:true,force:true});}
