import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const server=await startServer({port:0,dataFile:null});let browser;
try{
 fs.mkdirSync('strider-evidence',{recursive:true});browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1100,height:750}});page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
 await page.fill('#name','Strider Tester');await page.click('.classcard[data-cls="surveyor"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='surveyor'&&s.drawn>=2;});
 const p=await liveFixturePlayer(page,server,'Strider Tester');
 // Fixture unlocks requirements, grants inputs and stages station only.
 p.char.level=4;p.char.attunements=['resonance'];p.char.survey='signal_done';p.char.brineStage=3;
 p.char.materials={sentinel_alloy:4,mire_fibre:2,resonance_fragment:1};p.x=49;p.z=-36.5;
 server.game.refreshStats(p);server.game.markDirty(p);
 await page.waitForFunction(()=>{const s=window.__attune.state();return s.you.workshop==='brine_engineering'&&s.sheet.level===4;});
 await page.getByRole('button',{name:'Open field Workshop [B]',exact:true}).click();
 const workshop=page.getByRole('dialog',{name:'Build Planner and Workshop'});
 await workshop.locator('[data-recipe="survey_strider_link"]').click();
 await workshop.locator('[data-craft="survey_strider_link"]').click();
 await page.waitForFunction(()=>window.__attune.state().sheet.striderLearned===true);
 assert.deepEqual(p.char.materials,{});assert.equal(p.companion,null);
 await workshop.waitFor({state:'hidden'});await page.locator('.production-status').waitFor({state:'hidden'});await page.locator('#view').focus();
 await page.keyboard.press('Digit5');
 await page.waitForFunction(()=>{const s=window.__attune.state();return s.compId&&s.ents.some(e=>e.id===s.compId&&e.c==='survey_strider'&&e.model==='glb')&&!s.sheet.equipped.device;});
 assert.ok(p.companion);assert.equal(p.companion.owner,p.id);
 await page.getByRole('button',{name:'Stay',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().ents.some(e=>e.id===window.__attune.state().compId&&e.row.md==='stay'));
 await page.getByRole('button',{name:'Follow',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().ents.some(e=>e.id===window.__attune.state().compId&&e.row.md==='follow'));
 await page.evaluate(()=>window.__attune.view({yaw:Math.PI*.75,pitch:.25,dist:6,face:0}));
 assert.ok(await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('strider:survey-instruments')));
 await page.screenshot({path:'strider-evidence/01-strider.png'});
 // Actual command click; its scan logic and cover are separately unit tested.
 await page.getByRole('button',{name:'Analyze target',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().ents.some(e=>e.id===window.__attune.state().compId&&e.row.md==='assist'));
 await page.getByRole('button',{name:'Menu [M]',exact:true}).click();
 await page.getByRole('button',{name:'Companion Sheet',exact:true}).click();
 await page.getByRole('button',{name:'Dismiss Survey Strider',exact:true}).click();
 await page.waitForFunction(()=>{const s=window.__attune.state();return !s.compId&&!s.ents.some(e=>e.c==='survey_strider')&&!s.sheet.equipped.device&&s.sheet.striderLearned;});
 assert.equal(p.companion,null);assert.deepEqual(errors,[]);
 console.log('PASS Survey Strider browser learn/summon, live rig/mast, owner commands and dismissal');
}finally{await browser?.close();await server.close();}
