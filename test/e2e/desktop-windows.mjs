// Desktop/TV core window audit. Uses the normal game, HUD and input handlers.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
import {ITEMS} from '../../shared/content.js';
import {INVENTORY_PAGE_SIZE,MAX_VISIBLE_VACANCIES,visibleVacancies} from '../../client/src/inventory-blueprint-page.js';
const modes={desktop:[1280,800,1],hd:[1920,1080,1],qhd:[2560,1440,1],tv:[3840,2160,1],tvScaled:[2560,1440,1.5]};
const mode=process.env.ATTUNEMENT_WINDOW_TEST_MODE||'desktop';
assert.ok(Object.hasOwn(modes,mode));
const [width,height,deviceScaleFactor]=modes[mode];
const server=await startServer({port:0,dataFile:null});
let browser;
try{
 await mkdir('window-evidence/'+mode,{recursive:true});
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor,reducedMotion:'reduce'});
 page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.port+'/?q=0&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=0.25':''));
 await page.click('#gate-guest-link');await page.fill('#name','Window Tester');await page.click('#enter');
 const player=await liveFixturePlayer(page,server,'Window Tester',60000);const charId=player.char.id;
 const sync=async()=>{const live=await liveFixturePlayer(page,server,'Window Tester',60000);assert.equal(live.char.id,charId);return live;};
 // Fixture only supplies ownership for a growing inventory, not a gameplay grant.
 player.char.inventory=[...new Set([...player.char.inventory,...Object.keys(ITEMS)])];
 server.game.markDirty(player);
 await page.waitForFunction(()=>window.__attune.state().sheet?.inventory.length>17);
 const focus=()=>page.locator('#view').focus();
 const open=async(key,selector)=>{await sync();await focus();await page.keyboard.press(key);const p=page.locator(selector);await p.waitFor({state:'visible'});return p;};
 const fits=async(p,selectors)=>{
   const report=await p.evaluate((node,selectors)=>{
    const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const bounds=box(node);const outside=selectors.flatMap(sel=>[...node.querySelectorAll(sel)].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>{
      const b=box(el);return {sel,b,ok:b.left>=bounds.left-2&&b.right<=bounds.right+2&&b.top>=bounds.top-2&&b.bottom<=bounds.bottom+2};
    })).filter(x=>!x.ok);
    return {bounds,outside,viewport:[innerWidth,innerHeight],controls:[...node.querySelectorAll('.window-controls button')].map(el=>({label:el.getAttribute('aria-label'),title:el.title,svg:!!el.querySelector('svg'),size:box(el)})),scrolls:[...node.querySelectorAll('*')].filter(el=>el.clientHeight>0&&el.scrollHeight>el.clientHeight+3&&['auto','scroll'].includes(getComputedStyle(el).overflowY)).map(el=>({className:String(el.className),excess:el.scrollHeight-el.clientHeight}))};
   },selectors);
   console.log(mode,JSON.stringify(report));
   const b=report.bounds;assert.ok(b.left>=-2&&b.top>=-2&&b.right<=width+2&&b.bottom<=height+2,'window within viewport');
   assert.equal(report.controls.length,5,'all five layout actions');
   assert.ok(report.controls.every(c=>c.svg&&c.label&&c.title&&c.size.width>=28&&c.size.height>=28),'icon accessibility');
   assert.deepEqual(report.outside,[],'core controls must fit');
 };
 const shot=async(p,name)=>{if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(true));try{await p.screenshot({path:'window-evidence/'+mode+'/'+name+'.png'});}finally{if(SOFTWARE_GL)await page.evaluate(()=>window.__attune.pause(false));}};
 const close=async(p)=>{const before=await page.evaluate(()=>window.__attune.state().myId);const live=await sync();if(await p.isHidden()){assert.notEqual(live.id,before,'window unexpectedly closed without reconnection');return;}await p.locator('.close').first().click();await p.waitFor({state:'hidden'});};
 const character=await open('KeyC','.panel.build');
 await fits(character,['.window-controls button','.doll-tabs button']);await shot(character,'character');
 const move=character.locator('[data-window-action="move"]'),size=character.locator('[data-window-action="resize"]'),lock=character.locator('[data-window-action="lock"]'),reset=character.locator('[data-window-action="reset"]');
 await move.focus();await move.press('ArrowRight');
 assert.equal(await character.getAttribute('data-window-custom'),'true');
 await size.focus();await size.press('ArrowDown');
 await lock.click();assert.equal(await lock.getAttribute('aria-pressed'),'true');assert.ok(await move.isDisabled());assert.ok(await size.isDisabled());
 await reset.click();assert.equal(await character.getAttribute('data-window-custom'),null);assert.ok(await move.isEnabled());
 await close(character);
 const inv=await open('KeyI','.inventory-window');
 await fits(inv,['.window-controls button','.inventory-tabs button','.inventory-grid','.inventory-pagination']);
 // The approved compact bag shows up to 36 carried stacks per page,
 // at most five decorative vacant slots, and actual page navigation.
 const filled=await inv.locator('.inventory-grid .item-cell:not(.vacant)').count();
 const vacant=await inv.locator('.inventory-grid .vacant').count();
 assert.ok(filled>0&&filled<=INVENTORY_PAGE_SIZE,'compact blueprint page size');
 assert.ok(vacant<=MAX_VISIBLE_VACANCIES&&vacant===visibleVacancies(filled),'no fictitious storage capacity');
 const before=await inv.locator('.inventory-grid button').first().getAttribute('aria-label');
 const nextPage=inv.getByRole('button',{name:'Next page'});
 assert.ok(await nextPage.isEnabled(),'fixture contains more than one compact bag page');
 await nextPage.click();
 assert.notEqual(await inv.locator('.inventory-grid button').first().getAttribute('aria-label'),before);
 await inv.getByRole('button',{name:'Previous page'}).click();
 assert.equal(await inv.locator('.inventory-grid button').first().getAttribute('aria-label'),before);
 const alpha=inv.locator('[data-window-action="opacity"]');await alpha.click();
 assert.equal(await inv.evaluate(el=>el.style.getPropertyValue('--inventory-alpha')),'0.8');
 await inv.locator('[data-window-action="reset"]').click();await shot(inv,'inventory');await close(inv);
 const workshop=await open('KeyB','.workshop-window');
 const tutorial=workshop.getByRole('button',{name:'Hide tutorial'});if(await tutorial.count())await tutorial.click();
 await workshop.getByRole('button',{name:'Build Planner',exact:true}).click();
 await fits(workshop,['.window-controls button','.workshop-tabs button','.planner-slot select']);await shot(workshop,'planner');
 await workshop.getByRole('button',{name:'Workshop',exact:true}).click();
 await fits(workshop,['.window-controls button','.workshop-tabs button','.recipe-search']);await shot(workshop,'fabrication');await close(workshop);
 const codex=await open('KeyJ','.codex-window');
 await fits(codex,['.window-controls button','.codex-search']);await shot(codex,'codex');await close(codex);
 const quest=await open('KeyL','.quest-journal');
 await fits(quest,['.window-controls button','.quest-filters button']);await shot(quest,'journal');await close(quest);
 const atlas=await open('KeyM','.world-atlas');
 await fits(atlas,['.window-controls button','.atlas-tabs button','.atlas-controls button']);await shot(atlas,'atlas');
 await atlas.getByRole('button',{name:'Full screen'}).click();
 assert.ok(await atlas.locator('[data-window-action="move"]').isDisabled());
 await atlas.locator('[data-window-action="reset"]').click();
 assert.ok(await atlas.locator('[data-window-action="move"]').isEnabled());
 await atlas.getByRole('button',{name:'Close',exact:true}).click();
 assert.deepEqual(errors,[]);
 console.log('PASS desktop/TV window interaction gate: '+mode);
}finally{await browser?.close();await server.close();}
