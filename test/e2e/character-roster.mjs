// Account and character selection browser gate. No production data is modified.
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
const temp=await mkdtemp(join(tmpdir(),'attune-roster-'));
const server=await startServer({port:0,dataFile:join(temp,'characters.json')});
const evidence=process.env.ATTUNEMENT_ROSTER_EVIDENCE_DIR||null;
if(evidence)await mkdir(evidence,{recursive:true});
let browser;
try{
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1360,height:850},reducedMotion:'reduce'});
 page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 const entry='http://127.0.0.1:'+server.port+'/?q=0&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=0.25':'');
 // Check the static markup before any JavaScript module attaches account handlers.
 const entryHtml=await (await page.request.get(entry)).text();
 assert.ok(entryHtml.includes('id="account-signin" type="submit" class="primary" disabled>'));
 assert.ok(entryHtml.includes('id="account-register" type="button" disabled>'));
 await page.goto(entry);
 // Do not wait on an internal client hook; the actual control readiness gates first use.
 await page.fill('#account-handle','roster_validator');
 await page.fill('#account-password','TemporaryUniqueRosterTestPassphrase2026!');
 await page.click('#account-register',{timeout:120000});
 await page.locator('#character-roster').waitFor({state:'visible'});
 const rosterConn=[...server.net.conns].find(conn=>conn.account?.handle==='roster_validator');
 assert.ok(rosterConn,'authenticated account connection exists before entering world');
 await new Promise(resolve=>setTimeout(resolve,16000));
 assert.ok(server.net.conns.has(rosterConn) && rosterConn.ws.readyState===1,'authenticated roster connection survives the unauthenticated 15-second timeout');
 assert.equal(await page.locator('#login-form').isHidden(),true);
 assert.equal(await page.locator('#roster-enter').isDisabled(),true);
 assert.match(await page.locator('#roster-capacity').textContent(),/0 \/ 6/);
 assert.equal(await page.locator('#roster-list .roster-select').count(),0,'no invented characters');
 assert.equal(await page.locator('#roster-list .roster-slot-vacant').count(),1,'one creation action, not six redundant cards');
 assert.equal(await page.locator('#roster-create').isEnabled(),true);
 assert.equal(await page.locator('#roster-settings').isVisible(),true);
 // The exact owner-supplied source image (optimized WebP) must actually be
 // served and visible behind a transparent, centered gameplay-model canvas.
 const bgResponse=await page.request.get('http://127.0.0.1:'+server.port+'/client/assets/character-selection-gate.webp');
 assert.equal(bgResponse.status(),200);
 assert.match(bgResponse.headers()['content-type'],/image\/webp/);
 assert.ok((await bgResponse.body()).length>4000);
 const backdrop=await page.locator('#roster-preview').evaluate(el=>getComputedStyle(el).backgroundImage);
 assert.match(backdrop,/character-selection-gate\.webp/);
 const fitsViewport=()=>document.documentElement.scrollHeight<=innerHeight+2
   &&document.body.scrollHeight<=innerHeight+2;
 await page.waitForFunction(
  ()=>document.querySelector('#roster-preview')?.dataset.sceneAsset==='reference-image',
  null,{timeout:90000}
 );
 await page.waitForFunction(
  ()=>document.querySelector('#roster-preview')?.dataset.frameReady==='yes',
  null,{timeout:90000}
 );
 const viewport=await page.locator('#roster-preview canvas').boundingBox();
 assert.ok(viewport.width>1000 && viewport.height>700,'3D preview must occupy the viewport');
 assert.equal(await page.evaluate(fitsViewport),true,'roster has zero page scrolling');
 if(evidence)await page.screenshot({path:join(evidence,'empty-roster-desktop.png')});
 await page.click('#roster-create');
 assert.equal(await page.locator('#character-roster').isHidden(),true);
 assert.equal(await page.locator('#creation-fields').isVisible(),true);
 assert.equal(await page.evaluate(fitsViewport),true,'creation page must not scroll');
 assert.equal(await page.locator('.creation-screen-tab').count(),3);
 assert.equal(await page.locator('#creation-step-identity').isVisible(),true);
 assert.equal(await page.locator('#creation-step-body').isHidden(),true);
 await page.getByRole('button',{name:'2. Body'}).click();
 assert.equal(await page.locator('#appearance').isVisible(),true);
 assert.equal(await page.locator('#creation-step-identity').isHidden(),true);
 assert.equal(await page.evaluate(fitsViewport),true);
 await page.getByRole('button',{name:'3. Details'}).click();
 assert.equal(await page.locator('#ap-hair').isVisible(),true);
 assert.equal(await page.locator('#ap-colour').isVisible(),true);
 assert.equal(await page.evaluate(fitsViewport),true);
 await page.getByRole('button',{name:'1. Identity'}).click();
 assert.equal(await page.locator('#name').isVisible(),true);
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('character-create-mode')),true);
 const creationCanvas=await page.locator('#creation-preview canvas').boundingBox();
 assert.ok(creationCanvas.width>1000&&creationCanvas.height>700,'creation must retain the entire cinematic environment');
 await page.waitForFunction(
  ()=>document.querySelector('#creation-preview')?.dataset.sceneAsset==='reference-image',
  null,{timeout:90000}
 );
 await page.waitForFunction(
  ()=>document.querySelector('#creation-preview')?.dataset.frameReady==='yes'
    &&document.querySelector('#creation-preview')?.dataset.modelCount==='1',
  null,{timeout:90000}
 );
 assert.equal(await page.locator('#creation-preview [data-preview-mode="frames"]').count(),0,
   'cinematic creation must not split the scene into overlapping frame previews');
 assert.equal(await page.locator('#creation-preview .preview-controls').isHidden(),true,'creation camera tools collapse by default');
 await page.click('#creation-preview [data-preview-inspect]');
 assert.equal(await page.locator('#creation-preview [data-preview-inspect]').getAttribute('aria-expanded'),'true');
 const creationCamera=await page.locator('#creation-preview .preview-controls').boundingBox();
 const creationSubmit=await page.locator('#enter').boundingBox();
 assert.ok(creationCamera.y+creationCamera.height+12<creationSubmit.y,
  'creation camera tools must not overlap primary creation action');
 assert.ok(creationCamera.x>creationCanvas.width*.55,'inspection panel must stay to the right of the character');
 await page.click('#creation-preview [data-preview-inspect]');
 assert.equal(await page.locator('#creation-preview .preview-controls').isHidden(),true);
 if(evidence)await page.screenshot({path:join(evidence,'character-creation-fullscreen.png')});
 assert.equal(await page.locator('#login-form').isVisible(),true);
 await page.click('#creation-back');
 assert.equal(await page.locator('#character-roster').isVisible(),true);
 await page.click('#roster-create');
 await page.fill('#name','Roster Tester');
 await page.click('#enter');
 await liveFixturePlayer(page,server,'Roster Tester',60000);
 await page.locator('#world-entry-curtain').waitFor({state:'hidden',timeout:90000});
 await page.locator('.menu').getByRole('button',{name:'Menu (Esc)'}).click();
 await page.locator('.menu-items').getByRole('button',{name:'Characters',exact:true}).click();
 await page.locator('#character-roster').waitFor({state:'visible'});
 await page.locator('#roster-list .roster-select').first().waitFor();
 assert.match(await page.locator('#roster-details').textContent(),/Roster Tester/);
 assert.match(await page.locator('#roster-details').textContent(),/Kinetic Vanguard|Symbiotech Conductor|Aegis Keeper|Brine Surveyor/);
 assert.match(await page.locator('#roster-details').textContent(),/Location/);
 assert.equal(await page.locator('#roster-list .roster-select[aria-pressed="true"]').count(),1);
 assert.ok(await page.locator('#roster-preview').getAttribute('data-character-id'),'selected account character id is bound to 3D preview');
 await page.locator('#roster-preview canvas').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>!!document.querySelector('#roster-preview')?.dataset.model);
 assert.equal(await page.locator('.roster-cards .roster-preview-controls').isHidden(),true,'selection inspector is collapsed');
 await page.click('.roster-cards [data-preview-inspect]');
 const rosterCamera=await page.locator('.roster-cards .roster-preview-controls').boundingBox();
 const sidebar=await page.locator('.roster-cards').boundingBox();
 const facts=await page.locator('.roster-facts').boundingBox();
 assert.ok(rosterCamera.x>=sidebar.x-2 && rosterCamera.x+rosterCamera.width<=sidebar.x+sidebar.width+2,
  'inspection controls stay within the right roster panel');
 assert.ok(rosterCamera.x>facts.x+facts.width+16,
  'inspection controls must never overlap character identity, race or location');
 assert.equal(await page.locator('#roster-preview').getAttribute('data-model-count'),'1',
  'the account selection is exactly one persisted gameplay model');
 assert.equal(await page.evaluate(fitsViewport),true,'populated roster cannot scroll');
 await page.click('.roster-cards [data-preview-inspect]');
 assert.equal(await page.locator('.roster-cards .roster-preview-controls').isHidden(),true);
 // Turning the character must leave the camera and architecture fixed.
 const yawBefore=await page.locator('#roster-preview').getAttribute('data-yaw');
 await page.locator('#roster-preview canvas').focus();
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(
  before=>document.querySelector('#roster-preview')?.dataset.yaw!==before,
  yawBefore
 );
 assert.equal(await page.locator('#roster-preview').getAttribute('data-scene-asset'),'reference-image');
 assert.equal(await page.locator('#roster-enter').isEnabled(),true);
 if(evidence){
  await page.screenshot({path:join(evidence,'selected-character-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(fitsViewport),true,'mobile roster cannot scroll');
  await page.screenshot({path:join(evidence,'selected-character-mobile.png')});
  await page.setViewportSize({width:1360,height:850});
 }
 await page.click('#roster-enter');
 await liveFixturePlayer(page,server,'Roster Tester',60000);
 await page.locator('#world-entry-curtain').waitFor({state:'hidden',timeout:90000});
 await page.locator('.menu').getByRole('button',{name:'Menu (Esc)'}).click();
 await page.locator('.menu-items').getByRole('button',{name:'Characters',exact:true}).click();
 await page.locator('#character-roster').waitFor({state:'visible'});
 await page.click('#roster-delete');
 await page.fill('#roster-delete-name','Wrong Name');
 assert.equal(await page.locator('#roster-delete-submit').isDisabled(),true);
 await page.fill('#roster-delete-name','Roster Tester');
 assert.equal(await page.locator('#roster-delete-submit').isEnabled(),true);
 await page.click('#roster-delete-submit');
 await page.waitForFunction(()=>document.querySelector('#roster-capacity')?.textContent?.includes('0 / 6'));
 assert.equal(await page.locator('#roster-enter').isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS account roster > creation > game > preview > world reentry > typed deletion');
}finally{await browser?.close();await server.close();await rm(temp,{recursive:true,force:true});}
