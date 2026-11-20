// Compact, non-scrolling settings view for the account character selector.
// Reuses the existing controls, labels, callbacks, and values; does not alter
// settings persistence or gameplay controls.
export function setupRosterSettingsPages(panel){
 if(panel.dataset.menuPages==='true')return;
 const close=panel.querySelector(':scope > button.close');
 const title=panel.querySelector(':scope > h2');
 const children=[...panel.children].filter(node=>node!==close&&node!==title);
 const navigation=document.createElement('nav');
 navigation.className='settings-screen-tabs';
 navigation.setAttribute('role','tablist');
 navigation.setAttribute('aria-label','Settings categories');
 const pages=Array.from({length:3},(_,i)=>{
  const page=document.createElement('section');
  page.className='settings-screen-page';
  page.id='settings-screen-page-'+i;
  page.setAttribute('role','tabpanel');
  page.setAttribute('aria-label',['Graphics and effects','Interface and audio','Other options'][i]);
  return page;
 });
 // The UI constructor appends graphics/effects first, followed by audio,
 // interface and extended settings. Group at existing control boundaries.
 const size=children.length;
 const cuts=size<=10?[Math.ceil(size/2),size]:[8,Math.min(size,13)];
 children.forEach((child,i)=>pages[i<cuts[0]?0:i<cuts[1]?1:2].append(child));
 const labels=['Graphics','Interface','More'];
 const tabs=labels.map((label,i)=>{
  const btn=document.createElement('button');
  btn.type='button';btn.textContent=label;
  btn.id='settings-screen-tab-'+i;
  btn.setAttribute('role','tab');
  btn.setAttribute('aria-controls',pages[i].id);
  btn.setAttribute('aria-selected',String(i===0));
  pages[i].setAttribute('aria-labelledby',btn.id);
  btn.addEventListener('click',()=>activate(i));
  navigation.append(btn);
  return btn;
 });
 function activate(i){
  tabs.forEach((tab,k)=>{
   tab.setAttribute('aria-selected',String(k===i));
   tab.tabIndex=k===i?0:-1;
   pages[k].hidden=k!==i;
  });
 }
 if(title)title.after(navigation,...pages);
 else panel.append(navigation,...pages);
 activate(0);panel.dataset.menuPages='true';
}
