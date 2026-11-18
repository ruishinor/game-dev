import test from 'node:test';
import assert from 'node:assert/strict';
import {characterPortraitMeta,portraitCacheKey,createPortraitCache,PORTRAIT_CACHE_LIMIT} from '../client/src/portrait-identity.js';

test('paperdoll passes the exact private character appearance and identity to the live model factory',()=>{
 const sheet={name:'Test Player',cls:'vanguard',look:'vanguard_plate',appearance:'f.mirekin.2.crop.3',credits:99};
 const meta=characterPortraitMeta(sheet);
 assert.deepEqual(meta,{k:'p',c:'vanguard',a:'vanguard_plate',n:'Test Player',ap:'f.mirekin.2.crop.3'});
 const key=portraitCacheKey(meta,'portrait',true);
 for(const alternate of [{n:'Other'},{ap:'m.human.3.crop.1'},{a:'red_rucker'}])
  assert.notEqual(portraitCacheKey({...meta,...alternate},'portrait',true),key);
 assert.notEqual(portraitCacheKey(meta,'sketch',true),key);
 assert.notEqual(portraitCacheKey(meta,'portrait',false),key);
 assert.equal(portraitCacheKey({...meta},'portrait',true),key);
 assert.notEqual(portraitCacheKey({...meta,ap:undefined},'portrait',true),key);
});
test('portrait cache is bounded and evicts least recently used captures',()=>{
 const cache=createPortraitCache(2);
 cache.set('a','one');cache.set('b','two');
 assert.equal(cache.get('a'),'one');
 cache.set('c','three');
 assert.equal(cache.get('b'),undefined);assert.equal(cache.get('a'),'one');assert.equal(cache.get('c'),'three');
 const actual=createPortraitCache();
 for(let i=0;i<=PORTRAIT_CACHE_LIMIT;i++)actual.set(i,String(i));
 assert.equal(actual.get(0),undefined);assert.equal(actual.get(PORTRAIT_CACHE_LIMIT),String(PORTRAIT_CACHE_LIMIT));
});
