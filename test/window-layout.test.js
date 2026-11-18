import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeWindowLayout,constrainWindow} from '../client/src/window-layout.js';

test('layout defaults and rejects malformed persisted data',()=>{
 assert.deepEqual(sanitizeWindowLayout(null),{locked:false,opacity:100,rect:null});
 assert.equal(sanitizeWindowLayout({locked:1,opacity:0,rect:{x:0,y:0,w:-2,h:5}}).rect,null);
 assert.equal(sanitizeWindowLayout({opacity:80,locked:true}).opacity,80);
 assert.equal(sanitizeWindowLayout({rect:{x:Infinity,y:0,w:500,h:300}}).rect,null);
});
test('bounds preserve visibility after viewport resize and constrain minimum size',()=>{
 assert.deepEqual(constrainWindow({x:-300,y:900,w:20,h:10},{w:1200,h:720}),{x:8,y:472,w:480,h:240});
 assert.deepEqual(constrainWindow({x:900,y:800,w:1000,h:800},{w:320,h:200}),{x:8,y:8,w:304,h:184});
 assert.deepEqual(constrainWindow({x:100,y:80,w:700,h:500},{w:1200,h:720}),{x:100,y:80,w:700,h:500});
});
