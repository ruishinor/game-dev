import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeWindowLayout,constrainWindow,resizeWindow} from '../client/src/window-layout.js';

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

test('resize preserves opposite edges with minimum and viewport bounds',()=>{
 const v={w:1200,h:800},r={x:300,y:200,w:600,h:400},min={w:320,h:240};
 assert.deepEqual(resizeWindow(r,'nw',80,40,v,min),{x:380,y:240,w:520,h:360});
 assert.deepEqual(resizeWindow(r,'se',1000,1000,v,min),{x:300,y:200,w:892,h:592});
 assert.deepEqual(resizeWindow(r,'w',500,0,v,min),{x:580,y:200,w:320,h:400});
 assert.deepEqual(resizeWindow(r,'n',0,-900,v,min),{x:300,y:8,w:600,h:592});
 assert.deepEqual(resizeWindow(r,'se',-1000,-1000,{w:260,h:200},min),{x:8,y:8,w:244,h:184});
});
