import test from 'node:test';
import assert from 'node:assert/strict';
import {previewGrid,MAX_PREVIEW_ITEMS,MAX_PREVIEW_EDGE,MAX_PREVIEW_PIXELS} from '../client/src/preview-grid.js';
const q=s=>previewGrid(new URLSearchParams(s));
test('normal contact sheets retain columns, cell and camera values',()=>{
 const x=q('items=mender,skitter&cols=2&cell=320&yaw=2.6&pitch=.22');
 assert.deepEqual([x.cols,x.rows,x.cell,x.W,x.H,x.yaw,x.pitch],[2,1,320,640,320,2.6,.22]);
});
test('invalid and extreme preview queries cannot allocate an empty or oversized buffer',()=>{
 for(const s of ['items=,,,','cols=-1&cell=0','cols=NaN&cell=Infinity','cols=1e30&cell=1e30','cols=1&cell=1024&items='+Array(400).fill('mender').join(','),'cols=0&cell=-99&yaw=Infinity']){
 const x=q(s);
 assert.ok(x.items.length>0&&x.items.length<=MAX_PREVIEW_ITEMS);
 assert.ok(Number.isSafeInteger(x.W)&&Number.isSafeInteger(x.H)&&x.W>0&&x.H>0);
 assert.ok(x.W<=MAX_PREVIEW_EDGE&&x.H<=MAX_PREVIEW_EDGE&&x.W*x.H<=MAX_PREVIEW_PIXELS);
 assert.ok(Number.isFinite(x.yaw));
 }
});
