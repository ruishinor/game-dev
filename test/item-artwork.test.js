import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../shared/content.js';
import { MATERIALS } from '../shared/crafting.js';
import { GOODS } from '../shared/goods.js';
import { itemArt } from '../client/src/journal-ui.js';
import { REFINED_ART_IDS, refinedItemMotif } from '../client/src/item-artwork.js';
test('refined motifs target only existing item IDs and remain distinct',()=>{
  assert.ok(REFINED_ART_IDS.length>=15);
  const fragments=REFINED_ART_IDS.map(id=>{
    assert.ok(Object.hasOwn(ITEMS,id),id);
    const fragment=refinedItemMotif(id);
    assert.ok(fragment&&!/<(?:script|image|foreignObject)|\bon\w+=|href\s*=/i.test(fragment),id);
    return fragment;
  });
  assert.equal(new Set(fragments).size,fragments.length);
  for(const id of ['constructor','toString','__proto__','<img src=x>',null])assert.equal(refinedItemMotif(id),null);
});
test('item-art DOM contract uses static fragments for every current item and material',()=>{
  const original=globalThis.document;
  globalThis.document={createElement:()=>({dataset:{}})};
  try{
    const icons=[];
    for(const id of [...Object.keys(ITEMS),...Object.keys(MATERIALS),...Object.keys(GOODS)]){
      const el=itemArt(id);
      assert.equal(el.dataset.art,id);
      assert.ok(el.innerHTML.startsWith('<svg ')&&el.innerHTML.endsWith('</svg>'),id);
      icons.push(el.innerHTML);
    }
    assert.equal(new Set(icons).size,icons.length,'all current items and materials must have distinct artwork');
    assert.ok(!itemArt('<img src=x>').innerHTML.includes('<img'));
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});

import {cataloguePortrait,PORTRAIT_IDS} from '../client/src/catalogue-portraits.js';
test('every live catalogue identity has a distinct intentional object portrait',()=>{
 const ids=[...Object.keys(ITEMS),...Object.keys(MATERIALS),...Object.keys(GOODS)];
 const fragments=ids.map(id=>{const f=cataloguePortrait(id);assert.ok(f,'missing original portrait '+id);assert.ok(!/<(?:script|image|foreignObject)|\\bon\\w+=|href\\s*=/i.test(f));return f;});
 assert.equal(new Set(fragments).size,ids.length);assert.equal(new Set(PORTRAIT_IDS).size,PORTRAIT_IDS.length);assert.equal(cataloguePortrait('__proto__'),null);
});
