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
 await page.keyboard.press('KeyM');
 await atlas.waitFor({state:'hidden'});
 await page.locator('#view').focus();await page.keyboard.press('KeyM');
 await atlas.waitFor({state:'visible'});
 await atlas.getByRole('button',{name:'Full screen'}).click();
 assert.equal(await atlas.evaluate(el=>el.classList.contains('atlas-fullscreen')),true);
 const canvas=atlas.locator('.atlas-view canvas');
 const terrainSource=await canvas.getAttribute('data-terrain-source');
 assert.equal(terrainSource,'scene','The world atlas must show genuine textured terrain captured from the in-game 3D scene');
 const initialCaptureCount=await canvas.getAttribute('data-terrain-capture-count');
 assert.equal(initialCaptureCount,'1','The static 3D terrain must be captured once per region');
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
 // Player notes are locally persisted per authenticated character and never
 // auto-transmitted to the server; arbitrary text is displayed as text.
 await atlas.locator('.atlas-marker-title').fill('Sanctum staging point');
 await atlas.locator('.atlas-marker-note').fill('Return for crafting after patrol.');
 await atlas.getByRole('button',{name:'Save point and note'}).click();
 assert.match(await atlas.locator('.atlas-saved-point').first().textContent(),/Sanctum staging point/);
 assert.match(await atlas.locator('.atlas-saved-point').first().textContent(),/Return for crafting/);
 const storage=await page.evaluate(()=>{
  const key=Object.keys(localStorage).find(k=>k.startsWith('attunement.atlas.saved.v1.'));
  return key?JSON.parse(localStorage.getItem(key)):null;
 });
 assert.equal(storage?.length,1);
 assert.equal(storage[0].note,'Return for crafting after patrol.');
 // Static geographic rendering must not repaint solely for a live state tick.
 const paintCount=await canvas.getAttribute('data-paint-count');
 await page.waitForTimeout(650);
 assert.equal(await canvas.getAttribute('data-paint-count'),paintCount,'Live state may only move the player marker, not repaint the atlas');
 assert.equal(await canvas.getAttribute('data-terrain-capture-count'),initialCaptureCount,'Live movement must not re-render the static world scene');
 assert.equal(await atlas.locator('.atlas-player-marker').isVisible(),true);
 await mkdir('test/e2e/out',{recursive:true});
 const plate=await canvas.evaluate(node=>{
  const g=node.getContext('2d'),at=(px,py)=>[...g.getImageData(px,py,1,1).data];
  return {left:at(Math.floor(node.width*.15),Math.floor(node.height*.4)),
    right:at(Math.floor(node.width*.85),Math.floor(node.height*.6))};
 });
 assert.equal(plate.left[3],255,'Atlas covers the left map region');
 assert.equal(plate.right[3],255,'Atlas covers the right map region');
 assert.notDeepEqual(plate.left.slice(0,3),plate.right.slice(0,3),'Atlas must have terrain variation');
 const toolbar=atlas.locator('.atlas-controls');
 assert.equal(await toolbar.getByRole('button',{name:'Full screen'}).count(),1,'Fullscreen control belongs in the vertical map tools');
 for(const viewport of [{width:1366,height:850},{width:1920,height:1080},{width:320,height:720}]){
  await page.setViewportSize(viewport);
  const layout=await atlas.evaluate(node=>{
    const panel=node.querySelector('.atlas-tools').getBoundingClientRect();
    const map=node.querySelector('.atlas-view canvas').getBoundingClientRect();
    return {panelWidth:panel.width,mapWidth:map.width,mapRight:map.right,viewport:innerWidth};
  });
  assert.ok(layout.panelWidth>=100&&layout.mapWidth>=100,'Sidebar and map must remain usable at '+viewport.width);
  assert.ok(layout.mapRight<=layout.viewport+2,'Atlas cannot escape the viewport');
  await atlas.screenshot({path:'test/e2e/out/atlas-'+viewport.width+'-blueprint.png'});
 }
 await page.setViewportSize({width:1366,height:850});
 await page.screenshot({path:'test/e2e/out/atlas-waypoints.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS fullscreen cartography, click-to-mark, place search, clear, minimap feedback and re-open');
} finally {
 await browser?.close();await srv.close();await rm(dir,{recursive:true,force:true});
}
