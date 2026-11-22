// Page carried stacks, not storage capacity; reserve one visible drop target.
export const INVENTORY_PAGE_SIZE=17;
export function inventoryPage(entries,index=0){
 const total=entries.length,pages=Math.max(1,Math.ceil(total/INVENTORY_PAGE_SIZE));
 const page=Math.max(0,Math.min(pages-1,Number.isSafeInteger(index)?index:0));
 return {entries:entries.slice(page*INVENTORY_PAGE_SIZE,(page+1)*INVENTORY_PAGE_SIZE),total,page,pages};
}
