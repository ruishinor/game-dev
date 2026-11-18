import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GOODS,GOODS_CAP,sanitizeGoods} from '../shared/goods.js';
import {grantGoods} from '../server/sim/goods.js';
import {CharacterStore} from '../server/store.js';
import {ITEMS} from '../shared/content.js';
import {MATERIALS} from '../shared/crafting.js';
import {inventoryView} from '../client/src/inventory-view.js';
import {makeGame,makeChar} from './helpers.js';
test('trade goods are separate, bounded and never usable as equipment or recipe materials',()=>{
 for(const id of Object.keys(GOODS)){assert.equal(Object.hasOwn(ITEMS,id),false);assert.equal(Object.hasOwn(MATERIALS,id),false);}
 assert.deepEqual(sanitizeGoods(JSON.parse('{"spent_contact":100,"mire_husk":-1,"__proto__":4,"unknown":2}')),{spent_contact:GOODS_CAP});
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard'));
 assert.equal(grantGoods(g,p,'unknown'),false);
 assert.equal(grantGoods(g,p,'spent_contact',0),false);
 assert.equal(grantGoods(g,p,'spent_contact',GOODS_CAP),true);
 assert.equal(grantGoods(g,p,'spent_contact',1),false);
 assert.equal(grantGoods(g,p,'mire_husk',0.5),false);
 assert.deepEqual(g.sheet(p).goods,{spent_contact:GOODS_CAP});
 assert.deepEqual(p.char.inventory,[]);
 assert.deepEqual(inventoryView(g.sheet(p),'junk').entries,[{id:'spent_contact',kind:'goods',category:'junk',quantity:GOODS_CAP}]);
});
test('old saves default safely; new trade stacks persist independently',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-goods-')),file=path.join(dir,'characters.json');
 try{
  const store=new CharacterStore(file),{char,token}=store.create('Goods Tester','vanguard');
  assert.deepEqual(char.goods,{});
  char.goods={spent_contact:4};store.markDirty();store.flush();
  assert.deepEqual(new CharacterStore(file).authenticate(token).goods,{spent_contact:4});
  const data=JSON.parse(fs.readFileSync(file,'utf8'));delete data.characters[0].goods;fs.writeFileSync(file,JSON.stringify(data));
  assert.deepEqual(new CharacterStore(file).authenticate(token).goods,{});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
