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
 await page.click('#gate-guest-link');await page.fill('#name','Atlas Tester');await page.click('#enter');
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
 await page.waitForFunction(()=>document.querySelector('.world-atlas canvas')?.dataset.terrainSource==='authored');
 const terrainSource=await canvas.getAttribute('data-terrain-source');
 assert.equal(terrainSource,'authored','Reach must render the source-grounded hand-authored SVG chart');
 // Prevent a regression to the near-black overhead photo rejected in the
 // owner playtest. Sample across the terrain, not HUD or sidebar chrome.
 const visibility=await canvas.evaluate(node=>{
  const {width,height}=node,rgba=node.getContext('2d').getImageData(0,0,width,height).data;
  let count=0,tooDark=0;
  for(let y=24;y<height-24;y+=12)for(let x=24;x<width-24;x+=12){
   const offset=(y*width+x)*4;
   const luminance=(rgba[offset]+rgba[offset+1]+rgba[offset+2])/3;
   if(luminance<50)tooDark++;
   count++;
  }
  return {tooDark,count};
 });
 assert.ok(visibility.count>100&&visibility.tooDark/visibility.count<.75,
  'World atlas has become unreadably dark; most terrain must remain visually distinguishable regardless of game time');
 const initialCaptureCount=await canvas.getAttribute('data-terrain-capture-count');
 assert.equal(initialCaptureCount,'0','Reach must not use a lighting-sensitive 3D scene capture');
 // Keyboard-only map interaction: focus, pan, zoom and mark center.
 await canvas.focus();
 assert.equal(await canvas.evaluate(el=>document.activeElement===el),true);
 const markerBefore=await atlas.locator('.atlas-player-marker').evaluate(el=>el.style.left);
 await page.keyboard.press('ArrowRight');
 const markerAfter=await atlas.locator('.atlas-player-marker').evaluate(el=>el.style.left);
 assert.notEqual(markerAfter,markerBefore,'Arrow keys pan the canvas without moving the character');
 const beforeZoom=await canvas.getAttribute('data-paint-count');
 const playerBeforeZoom=await atlas.locator('.atlas-player-marker').evaluate(el=>({left:el.style.left,top:el.style.top}));
 await page.keyboard.press('+');
 const playerAfterZoom=await atlas.locator('.atlas-player-marker').evaluate(el=>({left:el.style.left,top:el.style.top}));
 assert.notDeepEqual(playerAfterZoom,playerBeforeZoom,'Keyboard zoom changes projected marker position');
 assert.notEqual(await canvas.getAttribute('data-paint-count'),beforeZoom,'Keyboard zoom redraws the terrain at the new scale');
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.map-waypoint-brief')?.hidden===false);
 assert.match(await page.locator('.map-waypoint-brief').textContent(),/Custom waypoint/);
 await atlas.getByRole('button',{name:'Clear waypoint'}).click();
 await atlas.getByRole('button',{name:'Reset view'}).click();
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
 await atlas.getByRole('button',{name:'Saved',exact:true}).click();
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
    const side=node.querySelector('.atlas-tools');
    const panel=side.getBoundingClientRect();
    const active=node.querySelector('.atlas-tool-panel:not([hidden])');
    const map=node.querySelector('.atlas-view canvas').getBoundingClientRect();
    return {panelWidth:panel.width,mapWidth:map.width,mapRight:map.right,
      viewport:innerWidth,scrollExcess:side.scrollHeight-side.clientHeight,
      activeOverflow:active.scrollHeight-active.clientHeight};
  });
  assert.ok(layout.panelWidth>=100&&layout.mapWidth>=100,'Sidebar and map must remain usable at '+viewport.width);
  assert.ok(layout.mapRight<=layout.viewport+2,'Atlas cannot escape the viewport');
  assert.ok(layout.scrollExcess<=2&&layout.activeOverflow<=2,
    'Atlas controls must fit without sidebar scrolling at '+viewport.width);
  await atlas.screenshot({path:'test/e2e/out/atlas-'+viewport.width+'-blueprint.png'});
 }
 await atlas.getByRole('button',{name:'Map',exact:true}).click();
 const mapPanelLayout=await atlas.evaluate(node=>{
  const side=node.querySelector('.atlas-tools'),active=node.querySelector('.atlas-tool-panel:not([hidden])');
  return {sideOverflow:side.scrollHeight-side.clientHeight,contentOverflow:active.scrollHeight-active.clientHeight};
 });
 assert.ok(mapPanelLayout.sideOverflow<=2&&mapPanelLayout.contentOverflow<=2,
   'Map tab must fit without a scroll bar');
 await page.setViewportSize({width:1366,height:850});
 await page.screenshot({path:'test/e2e/out/atlas-waypoints.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS fullscreen cartography, click-to-mark, place search, clear, minimap feedback and re-open');
} finally {
 await browser?.close();await srv.close();await rm(dir,{recursive:true,force:true});
}
