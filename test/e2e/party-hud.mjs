// Two authenticated live guest sessions: party frames reflect actual membership.
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
import {SEVERANCE_POCKET,travelRegionAt} from '../../shared/world.js';
const dir=await mkdtemp(join(tmpdir(),'attune-party-hud-'));
const server=await startServer({port:0,dataFile:join(dir,'characters.json')});
let browser;
try {
 browser=await launchBrowser();
 const errors=[];
 async function join(name,slot){
   const ctx=await browser.newContext({viewport:{width:1366,height:850},reducedMotion:'reduce'});
   const page=await ctx.newPage();page.setDefaultTimeout(65000);
   page.on('pageerror',e=>errors.push(name+': '+e.message));
   await page.goto('http://127.0.0.1:'+server.port+'/?q=0&qlock=1&nolock=1&slot='+slot+(SOFTWARE_GL?'&rfps=0.25':''));
   await page.fill('#name',name);await page.click('#enter');
   const player=await liveFixturePlayer(page,server,name,65000);
   return {page,player,ctx};
 }
 const first=await join('Party Vanguard','party-a'),second=await join('Party Healer','party-b');
 const A=first.page,B=second.page;
 // Both start in the Reach; no player or party data is directly forged.
 await A.locator('#view').focus();await A.keyboard.press('KeyP');
 await A.locator('.party-panel').waitFor({state:'visible'});
 await A.locator('.party-panel .party-member').filter({hasText:'Party Healer'}).getByRole('button',{name:'Invite'}).click();
 await B.locator('#view').focus();await B.keyboard.press('KeyP');
 await B.locator('.party-panel').waitFor({state:'visible'});
 await B.locator('.party-panel').getByRole('button',{name:'Accept'}).click();
 await A.waitForFunction(()=>window.__attune?.state()?.you?.party?.members?.length===2);
 await A.waitForFunction(()=>document.querySelectorAll('.party-frame-stacks .party .frame.ally:not(.party-member-unavailable)').length===1);
 assert.equal(await A.locator('.party-frame-stacks .party .frame.ally').count(),1);
 assert.equal(await A.locator('.party-frame-stacks .nearby-players .frame.ally').count(),0);
 // This is a synthetic authorized fixture effect for verifying appearance only.
 second.player.buffs.push({k:'ward',until:server.game.time+30000});
 await A.waitForFunction(()=>document.querySelector('.party-frame-stacks .party .buff-chip[data-effect="ward"]')!==null);
 const icon=A.locator('.party-frame-stacks .party .buff-chip[data-effect="ward"]');
 assert.match(await icon.getAttribute('aria-label'),/Kinetic Ward/);
 assert.equal(await icon.locator('.buff-icon svg').count(),1);
 // Snapshot visibility follows travel region, not distance within the Reach.
 // Moving a member to a different region preserves party membership but hides
 // unobserved live health, buffs and portraits.
 second.player.x=SEVERANCE_POCKET.arrival.x;second.player.z=SEVERANCE_POCKET.arrival.z;
 assert.notEqual(travelRegionAt(first.player.x,first.player.z),travelRegionAt(second.player.x,second.player.z),'fixture must leave the shared region');
 await A.waitForFunction(id=>!window.__attune.state().ents.some(e=>e.id===id),second.player.id,{timeout:45000});
 await A.waitForFunction(()=>document.querySelector('.party-frame-stacks .party .party-member-unavailable')!==null);
 assert.match(await A.locator('.party-member-unavailable .sub').textContent(),/Out of visible range/);
 assert.equal(await A.locator('.party-member-unavailable .bar').count(),0);
 assert.equal(await A.locator('.party-member-unavailable .unit-portrait').count(),0);
 await mkdir('test/e2e/out',{recursive:true});
 await A.screenshot({path:'test/e2e/out/party-status.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS actual party order, unique buff icon and non-fabricated out-of-range row');
 await first.ctx.close();await second.ctx.close();
}finally{await browser?.close();await server.close();await rm(dir,{recursive:true,force:true});}
