import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser, SOFTWARE_GL} from '../../tools/browser.mjs';
import {liveFixturePlayer} from './live-fixture.mjs';

const temp=await mkdtemp(join(tmpdir(),'attunement-initiation-'));
const dataFile=join(temp,'characters.json');
const server=await startServer({port:0,dataFile});
let browser;
try{
  browser=await launchBrowser();
  const page=await browser.newPage({viewport:{width:1100,height:850},reducedMotion:'reduce'});
  page.setDefaultTimeout(45000);
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.port+'/?q=0&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=0.25':''));
  await page.click('#gate-guest-link');await page.fill('#name','Arrival Tester');
  const creation=page.locator('#creation-preview');
  await creation.locator('canvas').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#creation-preview')?.dataset.model==='glb');
  // Creation is now a tabbed single-character preview. The old "Compare frames"
  // camera button was deliberately removed from this screen; test the actual
  // body-frame UI and the same live GLB preview instead of a retired selector.
  await page.getByRole('tab',{name:'2. Body'}).click();
  const frames=page.locator('#ap-frame button');
  assert.deepEqual(await frames.allTextContents(),['Masculine','Feminine']);
  const selected=await page.locator('#ap-frame [aria-pressed="true"]').getAttribute('data-value');
  assert.ok(selected==='m'||selected==='f','a real body frame is selected');
  const alternate=selected==='m'?'f':'m';
  await page.locator('#ap-frame [data-value="'+alternate+'"]').click();
  await page.waitForFunction(frame=>
    document.querySelector('#creation-preview')?.dataset.appearance?.startsWith(frame+'.'),
    alternate);
  assert.equal(await page.locator('#ap-frame [aria-pressed="true"]').getAttribute('data-value'),alternate);
  assert.equal(await creation.locator('[data-preview-frames]').isHidden(),true,
    'character creation preserves its approved single-model preview');
  await page.click('#enter');

  const player=await liveFixturePlayer(page,server,'Arrival Tester',45000);
  const terminal=server.game.objects.find(object=>object.type==='initiation_terminal');
  player.x=terminal.x+1.5;
  player.z=terminal.z;
  await page.waitForFunction(([x,z])=>{
    const state=window.__attune.state();
    return Math.hypot(state.pos.x-x,state.pos.z-z)<1;
  },[player.x,player.z]);
  await page.evaluate(()=>window.__attune.view({yaw:-Math.PI/2,pitch:.2,dist:4,face:-Math.PI/2}));
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  const editor=page.locator('.initiation-controls');
  await editor.waitFor();
  await editor.getByRole('button',{name:'Compare frames'}).click();
  const frame=editor.getByLabel('Body frame',{exact:true});
  const value=await frame.inputValue()==='m'?'f':'m';
  await editor.locator('[data-preview-frames] [data-frame="'+value+'"]').click();
  assert.equal(await frame.inputValue(),value);
  await page.waitForFunction(value=>document.querySelector('.hall-preview [data-preview-frames] [aria-pressed="true"]')?.dataset.frame===value,value);
  await editor.locator('canvas').scrollIntoViewIfNeeded();
  await page.waitForFunction(value=>document.querySelector('.hall-preview')?.dataset.appearance?.startsWith(value+'.'),value);
  assert.notEqual(player.char.appearance[0],value);
  await editor.getByRole('button',{name:'Apply appearance'}).click();
  await page.getByText('Applied to your in-world character and saved.').waitFor();
  const characters=JSON.parse(await readFile(dataFile,'utf8')).characters;
  assert.ok(characters.find(character=>character.name==='Arrival Tester').appearance.startsWith(value+'.'));
  await page.waitForFunction(value=>window.__attune.state().sheet.appearance.startsWith(value+'.'),value);
  assert.deepEqual(pageErrors,[]);
  console.log('PASS full-body frame comparison, local hall edit and durable appearance acknowledgement');
}finally{
  await browser?.close();
  await server.close();
  await rm(temp,{recursive:true,force:true});
}
