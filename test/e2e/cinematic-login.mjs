// Real browser gate for the owner-approved login artwork and account/guest flows.
// Screenshots are evidence of actual rendering, not owner visual approval.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../../server/index.js';
import {launchBrowser,SOFTWARE_GL} from '../../tools/browser.mjs';

const temp=await mkdtemp(join(tmpdir(),'attune-cinematic-login-'));
const out=join(import.meta.dirname,'out');
await mkdir(out,{recursive:true});
const server=await startServer({port:0,dataFile:join(temp,'characters.json')});
const url='http://127.0.0.1:'+server.port+'/?q=0&qlock=1&nolock=1'+(SOFTWARE_GL?'&rfps=0.25':'');
const sizes=[[320,568],[390,844],[844,390],[1280,720],[1366,768],[1920,1080],[2560,1080],[2560,1440]];
let browser;
try{
 browser=await launchBrowser();
 const art=await (await browser.newPage()).request.get('http://127.0.0.1:'+server.port+'/client/login/gate-2560.webp');
 assert.equal(art.status(),200,'owner key art should be served');
 assert.match(art.headers()['content-type']||'',/image\/webp/);
 const font=await (await browser.newPage()).request.get('http://127.0.0.1:'+server.port+'/client/login/cinzel-latin-600-normal.woff2');
 assert.equal(font.status(),200,'Cinzel font should be served');
 assert.match(font.headers()['content-type']||'',/font\/woff2/);
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  page.setDefaultTimeout(45000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#account-handle').waitFor({state:'visible'});
  await page.evaluate(()=>document.fonts.ready);
  const image=await page.evaluate(async()=>{
   const i=new Image();i.src='/client/login/gate-2560.webp';
   await i.decode();return [i.naturalWidth,i.naturalHeight];
  });
  assert.deepEqual(image,[2560,1440],'the approved high-resolution key art must decode');
  const check=async(mode)=>{
   const metrics=await page.evaluate(()=>{
    const box=s=>{const n=document.querySelector(s),r=n?.getBoundingClientRect();return r&&{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,visible:!!(r.width&&r.height)};};
    const login=document.querySelector('#login');
    return {vw:innerWidth,vh:innerHeight,document:document.documentElement.scrollHeight,body:document.body.scrollHeight,
      loginScroll:login.scrollHeight,loginClient:login.clientHeight,
      form:box('#account-form'),footer:box('.gate-foot'),
      controls:['#account-handle','#account-password','#account-reveal','#account-signin','#account-register','#gate-guest-link'].map(box)};
   });
   const {vw,vh,form,footer,controls}=metrics;
   for(const [index,rect] of [form,footer,...controls].entries()){
    assert.ok(rect?.visible,`${mode} ${width}x${height}: control ${index} absent`);
    assert.ok(rect.x>=-3&&rect.right<=vw+3&&rect.y>=-3&&rect.bottom<=vh+3,
      `${mode} ${width}x${height}: control ${index} outside viewport: ${JSON.stringify(rect)}`);
   }
   assert.ok(form.bottom<=footer.y+2,`${mode} ${width}x${height}: form overlaps footer`);
   assert.ok(metrics.document<=vh+2&&metrics.body<=vh+2,
     `${mode} ${width}x${height}: document scrolls ${JSON.stringify(metrics)}`);
   assert.ok(metrics.loginScroll<=metrics.loginClient+2,
     `${mode} ${width}x${height}: login panel scrolls ${JSON.stringify(metrics)}`);
   return metrics;
  };
  await check('signin');
  await page.screenshot({path:join(out,`login-gate-${width}x${height}.png`),animations:'disabled'});
  await page.click('#account-register');
  assert.equal(await page.locator('#account-form').getAttribute('data-mode'),'register');
  assert.equal((await page.locator('#account-signin').textContent()).trim(),'Create account');
  await check('register');
  await page.screenshot({path:join(out,`login-register-${width}x${height}.png`),animations:'disabled'});
  await page.click('#account-register');
  assert.equal(await page.locator('#account-form').getAttribute('data-mode'),'signin');
  await page.click('#account-reveal');
  assert.equal(await page.locator('#account-password').getAttribute('type'),'text');
  assert.equal(await page.locator('#account-reveal').getAttribute('aria-pressed'),'true');
  await page.click('#account-reveal');
  assert.equal(await page.locator('#account-password').getAttribute('type'),'password');
  await page.click('#account-help-toggle');
  assert.equal(await page.locator('#account-help').isVisible(),true);
  await page.click('#account-help-toggle');
  await page.click('#gate-guest-link');
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('gate-guest-open')),true);
  assert.equal(await page.locator('#guest-resume-key').isVisible(),true);
  assert.equal(await page.locator('#login-form').isVisible(),true);
  await page.click('#gate-back-to-login');
  assert.equal(await page.locator('#account-handle').isVisible(),true);
  assert.equal(await page.locator('#gate-guest-link').evaluate(n=>n===document.activeElement),true);
  assert.deepEqual(errors,[],`no JS exceptions at ${width}x${height}`);
  await page.close();
 }
 // Server-authoritative registration, signout and subsequent sign-in.
 const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
 page.setDefaultTimeout(60000);
 await page.goto(url);
 await page.fill('#account-handle','gate_validator');
 await page.fill('#account-password','UniqueCinematicLoginTestPassphrase2026!');
 await page.click('#account-register');
 await page.click('#account-signin');
 await page.locator('#character-roster').waitFor({state:'visible'});
 assert.ok([...server.net.conns].some(c=>c.account?.handle==='gate_validator'),
   'registration must produce a server-owned authenticated session');
 await page.click('#account-signout');
 await page.locator('#account-handle').waitFor({state:'visible'});
 await page.fill('#account-handle','gate_validator');
 await page.fill('#account-password','UniqueCinematicLoginTestPassphrase2026!');
 await page.click('#account-signin');
 await page.locator('#character-roster').waitFor({state:'visible'});
 console.log('PASS cinematic login: eight viewport pairs, registration, sign-in, guest route, key art and Cinzel MIME');
} finally {
 await browser?.close();
 await server.close();
 await rm(temp,{recursive:true,force:true});
}
