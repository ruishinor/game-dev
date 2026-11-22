// Nine columns by eight rows; preserve a bounded pageable bag on desktop and TV.
export const INVENTORY_PAGE_SIZE=72;
export function inventoryPage(entries,index=0){
 const total=entries.length,pages=Math.max(1,Math.ceil(total/INVENTORY_PAGE_SIZE));
 const page=Math.max(0,Math.min(pages-1,Number.isSafeInteger(index)?index:0));
 return {entries:entries.slice(page*INVENTORY_PAGE_SIZE,(page+1)*INVENTORY_PAGE_SIZE),total,page,pages};
}
