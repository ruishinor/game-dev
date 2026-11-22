// Keep the existing compact inventory window. Show up to four rows per page;
// the reference's empty grid is conceptual capacity, not a UI requirement.
export const INVENTORY_PAGE_SIZE=36;
export const MAX_VISIBLE_VACANCIES=5;
export function visibleVacancies(visibleCount){
 const count=Number.isSafeInteger(visibleCount)?visibleCount:0;
 return Math.min(MAX_VISIBLE_VACANCIES,Math.max(0,INVENTORY_PAGE_SIZE-count));
}
export function inventoryPage(entries,index=0){
 const total=entries.length,pages=Math.max(1,Math.ceil(total/INVENTORY_PAGE_SIZE));
 const page=Math.max(0,Math.min(pages-1,Number.isSafeInteger(index)?index:0));
 return {entries:entries.slice(page*INVENTORY_PAGE_SIZE,(page+1)*INVENTORY_PAGE_SIZE),total,page,pages};
}
