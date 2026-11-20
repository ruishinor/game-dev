import test from 'node:test';
import assert from 'node:assert/strict';
import {CharacterStore,MAX_ACCOUNT_CHARACTERS} from '../server/store.js';
import {WORLD,zoneAt} from '../shared/world.js';

test('character selection projects only account-owned data with real visual state',async()=>{
 const store=new CharacterStore(null);
 const a=(await store.registerAccount('selection_owner','TemporaryUniquePassword2026!')).account;
 const b=(await store.registerAccount('selection_other','TemporaryUniquePassword2026!')).account;
 const one=store.createForAccount(a,'Sera One','vanguard',null,null).char;
 const two=store.createForAccount(b,'Sera Two','surveyor',null,null).char;
 assert.ok(one&&two);
 assert.equal(store.listCharacters(a).length,1);
 assert.equal(store.listCharacters(b)[0].name,'Sera Two');
 assert.equal(store.listCharacters(a)[0].initiationSeen,false);
 assert.equal(store.listCharacters(a)[0].location,'Character Initiation');
 assert.equal(store.listCharacters(a)[0].credits,0);
 assert.equal(store.listCharacters(a)[0].wv,null);
 assert.equal(store.listCharacters(a)[0].er,null);
 assert.ok(!('inventory' in store.listCharacters(a)[0]));
 assert.ok(!('pos' in store.listCharacters(a)[0]));
 assert.ok(!('accountId' in store.listCharacters(a)[0]));
 assert.equal(MAX_ACCOUNT_CHARACTERS,6);

 // The selected character's persisted equipment uses the same allowlisted
 // renderer metadata as the in-world entity, not an invented visual loadout.
 one.initiationSeen=true;
 one.pos={x:WORLD.spawn.x,z:WORLD.spawn.z};
 one.credits=2450;one.xp=133;
 one.inventory=['electrical_combat_rod','vanguard_field_set_chest'];
 one.equipped={weapon:'electrical_combat_rod',chest:'vanguard_field_set_chest'};
 one.electricalRodMode='dual';
 let [row]=store.listCharacters(a);
 assert.equal(row.name,'Sera One');
 assert.equal(row.credits,2450);
 assert.equal(row.xp,133);
 assert.equal(row.location,zoneAt(WORLD.spawn.x,WORLD.spawn.z));
 assert.equal(row.av.chest,'vanguard_field_set_chest');
 assert.equal(row.er,2);
 assert.equal(row.sv,null);
 assert.equal(row.wv,null);
 assert.equal(store.listCharacters(b).length,1);
 assert.equal(store.deleteOwned(b,one.id,one.name).error,'Character deletion was not authorised.');
 assert.equal(store.listCharacters(a).length,1);

 // Invisible/unowned equipment is never projected.
 one.inventory=[];row=store.listCharacters(a)[0];
 assert.equal(row.av,null);assert.equal(row.er,null);
});
