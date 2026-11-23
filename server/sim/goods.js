import {GOODS,goodsCap,sanitizeGoods} from '../../shared/goods.js';
export function grantGoods(game,p,id,count=1){
 if(!Object.hasOwn(GOODS,id)||!Number.isSafeInteger(count)||count<1)return false;
 const goods=sanitizeGoods(p.char.goods);
 if(count>goodsCap(id)-(goods[id]||0))return false;
 goods[id]=(goods[id]||0)+count;
 p.char.goods=goods;
 game.economy?.observe('goods_granted',p,count,id);
 game.message(p,'gain','Recovered: '+GOODS[id].name+(count>1?' × '+count:'')+'.');
 game.markDirty(p);
 return true;
}
