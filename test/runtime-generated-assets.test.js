// Generated donor GLBs must be ready before a client can open a socket or HTTP
// request. Startup may validate the owner archive; HTTP resolution never builds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from '../server/index.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CACHE=path.join(ROOT,'.asset-cache');
const MODELS=[
  ['/client/assets/depths-recovery-cache.glb',path.join(CACHE,'depths-recovery-cache.glb')],
  ['/client/assets/sanctum-warden-carbine.glb',path.join(CACHE,'pipeline','warden_rifles','sanctum-warden-carbine.glb')],
  ['/client/assets/sanctum-warden-marksman.glb',path.join(CACHE,'pipeline','warden_rifles','sanctum-warden-marksman.glb')],
];

test('source-derived models are prebuilt before the server accepts requests',async()=>{
  const srv=await startServer({port:0,dataFile:null});
  try {
    const base='http://127.0.0.1:'+srv.port;
    for(const [url,file] of MODELS){
      assert.ok(fs.statSync(file).size>28,url+' must be materialized before first request');
      const bytes=fs.readFileSync(file);
      assert.equal(bytes.toString('ascii',0,4),'glTF');
      const res=await fetch(base+url);
      assert.equal(res.status,200,url+' is served from the prebuilt cache');
      assert.match(res.headers.get('content-type')||'',/model\/gltf-binary/);
      assert.equal(res.headers.get('content-length'),String(bytes.length));
      assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes);
      const head=await fetch(base+url,{method:'HEAD'});
      assert.equal(head.status,200);
      assert.equal(head.headers.get('content-length'),String(bytes.length));
    }
    const unmounted=await fetch(base+'/assets/source-archives/glb-low-poly-models-building-blocks.zip');
    assert.equal(unmounted.status,404,'original source archive must remain outside web mounts');
  } finally {
    await srv.close();
  }
});
