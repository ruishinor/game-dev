import {ITEMS} from '../../shared/content.js';
import {MATERIALS} from '../../shared/crafting.js';
import {GOODS,sanitizeGoods} from '../../shared/goods.js';

// Carried equipment excludes installed slots; materials are distinct stacks.
export function inventoryView(sheet,filter='all'){
 const equipment=(sheet.inventory||[]).filter(id=>Object.hasOwn(ITEMS,id)&&sheet.equipped?.[ITEMS[id].slot]!==id)
   .map(id=>({id,kind:'equipment',category:ITEMS[id].slot,quantity:1}));
 const materials=Object.keys(MATERIALS).filter(id=>Number.isSafeInteger(sheet.materials?.[id])&&sheet.materials[id]>0)
   .map(id=>({id,kind:'material',category:'materials',quantity:sheet.materials[id]}));
 const goods=Object.entries(sanitizeGoods(sheet.goods)).map(([id,quantity])=>({id,kind:'goods',category:GOODS[id].category,quantity}));
 const all=[...equipment,...materials,...goods];
 return {entries:filter==='all'?all:all.filter(e=>e.category===filter),total:all.length,equipment:equipment.length,materialStacks:materials.length,materialUnits:materials.reduce((n,e)=>n+e.quantity,0),goodsStacks:goods.length,goodsUnits:goods.reduce((n,e)=>n+e.quantity,0)};
}
