import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const server=await startServer({port:0,dataFile:null});let browser;
try{
 fs.mkdirSync('rift-evidence',{recursive:true});browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1100,height:750}});page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:'+server.port+'/?q=1&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=1':''));
 await page.fill('#name','Rift Tester');await page.click('.classcard[data-cls="vanguard"]');await page.click('#enter');
 await page.waitForFunction(()=>{const s=window.__attune?.state();return s?.myId&&s.sheet?.cls==='vanguard'&&s.drawn>=2;});
 const p=await liveFixturePlayer(page,server,'Rift Tester'),f=server.game.rift;assert.ok(f);
 p.char.level=3;p.char.attunements=['resonance'];server.game.refreshStats(p);server.game.markDirty(p);
 async function move(o,z=1.7){p.x=o.x;p.z=o.z+z;await page.waitForFunction(([x,z])=>{const s=window.__attune.state();return Math.hypot(s.you.x-x,s.you.z-z)<.5&&Math.hypot(s.pos.x-x,s.pos.z-z)<1;},[p.x,p.z]);}
 await move(f.indexer);
 await page.evaluate(()=>window.__attune.view({yaw:Math.PI/2,pitch:.22,dist:10,face:Math.PI/2}));
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf==='opening');
 await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf==='unstable');
 assert.ok(await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('rift:interference-membrane')));
 // Keep the fixture outside the hazard and use normal F interaction to stabilize.
 await page.screenshot({path:'rift-evidence/01-open.png'});
 await move(f.regulator);
 await page.waitForFunction(()=>{const a=window.__attune.state().ents.find(e=>e.c==='phase_scar');return a?.row.rf==='unstable'&&a.row.rw===0;});
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().ents.find(e=>e.c==='phase_scar')?.row.rf==='stabilized');
 await page.evaluate(()=>window.__attune.view({yaw:-Math.PI/2,pitch:.22,dist:10,face:-Math.PI/2}));
 await page.screenshot({path:'rift-evidence/02-stabilized.png'});
 assert.equal(f.phase,'stabilized');
 await page.waitForFunction(()=>window.__attune.state().sheet.fieldQuests?.some(q=>q.id==='field:rift_calibration'&&q.progress==='1 / 2 stages'));
 await move(f.core,3.6);
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().sheet.materials.resonance_fragment===1);
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 assert.equal(p.char.materials.resonance_fragment,1);
 await page.locator('#view').focus();await page.keyboard.press('KeyL');
 const journal=page.getByRole('dialog',{name:'Quest Journal'});
 await journal.locator('[data-quest="field:rift_calibration"]').click();
 assert.match(await journal.locator('.quest-rewards').innerText(),/Resonance fragment/);
 assert.equal(await journal.locator('[data-quest="field:rift_calibration"]').getAttribute('data-status'),'completed');
 await page.screenshot({path:'rift-evidence/03-calibration.png'});
 await page.locator('#view').focus();await page.keyboard.press('KeyL');
 await move(f.entry,-1.7);
 // The calibrated gate can be used in dormant, cooling or stabilized phases.
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().you.x>200);
 assert.ok(server.game.enemies.some(e=>e.name==='Displaced Sentinel'));
 assert.ok(await page.evaluate(()=>window.__attune.state().ents.filter(e=>e.c==='rift_entry'||e.c==='rift_return').every(e=>e.model==='glb')&&!!window.__attune.gfx.scene.getObjectByName('rift:licensed-frame')));
 assert.ok(await page.evaluate(()=>!!window.__attune.gfx.scene.getObjectByName('rift:annex-deck')));
 await page.screenshot({path:'rift-evidence/04-annex.png'});
 assert.equal(server.game.enemies.filter(e=>e.home.x>200).length,4);
 assert.ok(await page.evaluate(()=>{let walls=0;window.__attune.gfx.scene.traverse(o=>{if(o.name==='annex:bulkhead')walls++});return walls===4;}));
 await page.locator('#view').focus();await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.__attune.state().you.x<100);
 assert.deepEqual(errors,[]);
 console.log('PASS actual rift interaction, synchronized phases and Three membrane');
}finally{await browser?.close();await server.close();}
