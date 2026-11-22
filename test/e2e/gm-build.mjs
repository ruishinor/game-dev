// Real owner sign-in, chat, and inventory actions; no production data.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CharacterStore} from '../../server/store.js';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';
import {SKILL_NAMES} from '../../shared/content.js';

const dir=await mkdtemp(join(tmpdir(),'attune-gm-build-browser-'));
const file=join(dir,'characters.json'),store=new CharacterStore(file);
const handle='build_preview_validator',password='SyntheticPreviewPassphrase2026!';
const owner=await store.registerAccount(handle,password);
const character=store.createForAccount(owner.account,'GM Build Tester','vanguard').char;
character.inventory.push('keeper_prism');
store.markDirty();store.flush();
const previous=process.env.ATTUNEMENT_GM_ACCOUNT_IDS;
process.env.ATTUNEMENT_GM_ACCOUNT_IDS=owner.account.id;
let server,browser;
try{
 server=await startServer({port:0,dataFile:file});
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1366,height:850},reducedMotion:'reduce'});
 page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.port+'/?q=0&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=0.25':''));
 await page.fill('#account-handle',handle);
 await page.fill('#account-password',password);
 await page.click('#account-signin');
 await page.locator('#character-roster').waitFor({state:'visible'});
 await page.locator('#roster-list .roster-select').first().click();
 await page.click('#roster-enter');
 await liveFixturePlayer(page,server,character.name,60000);
 const state=()=>page.evaluate(()=>window.__attune.state().sheet);
 const baseline=await state();
 const command=async line=>{
   await page.locator('#view').focus();
   await page.keyboard.press('Enter');
   await page.locator('.chat').fill(line);
   await page.keyboard.press('Enter');
 };
 const inventory=page.locator('.inventory-window');
 const context=page.locator('.player-context');
 const prism=inventory.getByRole('button',{name:'Hinge Projection Prism',exact:true});
 const openInventory=async()=>{
   await page.locator('#view').focus();
   await page.keyboard.press('KeyI');
   await inventory.waitFor({state:'visible'});
 };
 const checkEquipButton=async enabled=>{
   await prism.click({button:'right'});
   const equip=context.getByRole('button',{name:'Equip',exact:true});
   await equip.waitFor({state:'visible'});
   assert.equal(await equip.isEnabled(),enabled);
   await page.keyboard.press('Escape');
 };
 await openInventory();
 await checkEquipButton(false);
 await inventory.locator('.close').click();
 await command('/gm stats 25');
 await page.waitForFunction(()=>window.__attune.state().sheet?.buildPreview?.attributeBonus===25);
 const boosted=await state();
 for(const key of Object.keys(SKILL_NAMES))assert.equal(boosted.stats.skills[key],baseline.stats.skills[key]+25);
 await command('/gm class unlock');
 await page.waitForFunction(()=>window.__attune.state().sheet?.buildPreview?.classUnlocked===true);
 await openInventory();
 await checkEquipButton(true);
 await prism.click({button:'right'});
 await context.getByRole('button',{name:'Equip',exact:true}).click();
 await page.waitForFunction(()=>window.__attune.state().sheet?.equipped.device==='keeper_prism');
 assert.equal((await state()).cls,'vanguard');
 await inventory.locator('.close').click();
 await command('/gm class lock');
 await page.waitForFunction(()=>{const s=window.__attune.state().sheet;return s?.buildPreview?.classUnlocked===false&&!s.equipped.device;});
 await command('/gm stats reset');
 await page.waitForFunction(()=>!window.__attune.state().sheet?.buildPreview);
 assert.deepEqual((await state()).stats.skills,baseline.stats.skills);
 await openInventory();
 await checkEquipButton(false);
 assert.deepEqual(errors,[]);
 console.log('PASS owner GM build preview: authenticated chat, private sheet, inventory controls, equip, lock and reset');
}finally{
 if(previous===undefined)delete process.env.ATTUNEMENT_GM_ACCOUNT_IDS;
 else process.env.ATTUNEMENT_GM_ACCOUNT_IDS=previous;
 await browser?.close();await server?.close();await rm(dir,{recursive:true,force:true});
}
