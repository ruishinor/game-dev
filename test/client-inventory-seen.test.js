import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../client/src/ui.js';

test('Seen remains server-confirmed across delayed private sheets',()=>{
  const ui=Object.create(UI.prototype), sent=[];
  let redraws=0;
  const old={inventoryRev:4,unseenItems:['field_emitter']};
  Object.assign(ui,{sheet:old,unseenItems:new Set(old.unseenItems),
    a:{itemSeen:(...args)=>sent.push(args)},updateItemIndicators:()=>redraws++});
  assert.equal(ui.acknowledgeItem('unknown'),false);
  assert.equal(ui.acknowledgeItem('field_emitter'),true);
  assert.deepEqual(sent,[['field_emitter',4]]);
  assert.ok(ui.unseenItems.has('field_emitter'),'no optimistic clear before confirmation');
  ui.setSheet({...old});
  assert.ok(ui.unseenItems.has('field_emitter'));
  ui.setSheet({...old,unseenItems:[]});
  assert.equal(ui.unseenItems.has('field_emitter'),false);
  assert.equal(redraws,2);
  assert.equal(ui.acknowledgeItem('field_emitter'),false);
  assert.equal(sent.length,1);
});

test('world reset clears character-specific panel contents and indicators',()=>{
  const ui=Object.create(UI.prototype);
  let clears=0, redraws=0;
  const body=()=>({replaceChildren:()=>clears++});
  Object.assign(ui,{sheet:{inventoryRev:8},unseenItems:new Set(['field_emitter']),
    workshopSite:'sanctum',buildLock:'combat',panelBody:body(),inventoryBody:body(),
    workshopBody:body(),updateItemIndicators:()=>redraws++});
  ui.resetInventoryPresentation();
  assert.equal(ui.sheet,null);
  assert.equal(ui.unseenItems.size,0);
  assert.equal(ui.workshopSite,null);
  assert.equal(ui.buildLock,'');
  assert.equal(clears,3);
  assert.equal(redraws,1);
  assert.equal(ui.acknowledgeItem('field_emitter'),false);
});
