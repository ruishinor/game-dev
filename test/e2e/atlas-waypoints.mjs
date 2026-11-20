// End-to-end personal cartography and map accessibility checks.
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';

const dir=await mkdtemp(join(tmpdir(),'attune-waypoint-'));
const srv=await startServer({port:0,dataFile:join(dir,'characters.json')});
let browser;
try {
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1366,height:850},reducedMotion:'reduce'});
 page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+srv.port+'/?q=0&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=0.25':''));
 await page.fill('#name','Atlas Tester');await page.click('#enter');
 await liveFixturePlayer(page,srv,'Atlas Tester',60000);
 await page.locator('.map-open').click();
 const atlas=page.locator('.world-atlas');
 await atlas.waitFor({state:'visible'});
 await atlas.getByRole('button',{name:'Full screen'}).click();
 assert.equal(await atlas.evaluate(el=>el.classList.contains('atlas-fullscreen')),true);
 const canvas=atlas.locator('.atlas-view canvas');
 await canvas.click({position:{x:320,y:255}});
 await page.waitForFunction(()=>document.querySelector('.map-waypoint-brief')?.hidden===false);
 assert.match(await page.locator('.map-waypoint-brief').textContent(),/Custom waypoint/);
 assert.match(await page.locator('.atlas-waypoint-details').textContent(),/straight-line/);
 await atlas.getByRole('button',{name:'Clear waypoint'}).click();
 assert.equal(await page.locator('.map-waypoint-brief').isHidden(),true);
 await atlas.locator('input[type=search]').fill('Lattice Sanctum');
 await atlas.locator('.atlas-results button').first().click();
 assert.equal(await atlas.getByRole('button',{name:'Mark selected place'}).isEnabled(),true);
 await atlas.getByRole('button',{name:'Mark selected place'}).click();
 assert.match(await page.locator('.map-waypoint-brief').textContent(),/Lattice Sanctum/);
 await atlas.getByRole('button',{name:'Center on player'}).click();
 await atlas.getByRole('button',{name:'Restore window'}).click();
 await atlas.getByRole('button',{name:'Close'}).click();
 assert.equal(await atlas.isHidden(),true);
 await page.locator('.map-waypoint-brief').click();
 await atlas.waitFor({state:'visible'});
 assert.match(await page.locator('.atlas-waypoint-details').textContent(),/Lattice Sanctum/);
 await mkdir('test/e2e/out',{recursive:true});
 await page.screenshot({path:'test/e2e/out/atlas-waypoints.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS fullscreen cartography, click-to-mark, place search, clear, minimap feedback and re-open');
} finally {
 await browser?.close();await srv.close();await rm(dir,{recursive:true,force:true});
}
