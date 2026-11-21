// Stable, viewport-sized creation screens: never relocate form nodes on click.
export function setupCreationSections(){
 const fields=document.getElementById('creation-fields');
 const name=document.getElementById('name');
 const submit=document.getElementById('enter');
 const keys=['identity','body','details'];
 const panes=Object.fromEntries(keys.map(k=>[k,document.getElementById('creation-step-'+k)]));
 const tabs=Object.fromEntries(keys.map(k=>[k,document.getElementById('creation-tab-'+k)]));
 if(!fields||!name||!submit||keys.some(k=>!panes[k]||!tabs[k]))throw Error('Character creation markup is incomplete');
 let current='identity';
 const show=step=>{
  if(!panes[step])return;
  current=step;fields.dataset.creationStep=step;
  for(const k of keys){
   const selected=k===step;
   panes[k].hidden=!selected;
   tabs[k].setAttribute('aria-selected',String(selected));
   tabs[k].tabIndex=selected?0:-1;
  }
 };
 for(const key of keys){
  tabs[key].addEventListener('click',()=>show(key));
  tabs[key].addEventListener('keydown',e=>{
   if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
   e.preventDefault();
   const next=keys[(keys.indexOf(key)+(e.key==='ArrowRight'?1:keys.length-1))%keys.length];
   show(next);tabs[next].focus({preventScroll:true});
  });
 }
 submit.addEventListener('click',()=>{
  if(!name.checkValidity()){show('identity');name.focus({preventScroll:true});}
 },true);
 fields.dataset.sectionsReady='true';
 show('identity');
 return {show,get current(){return current}};
}
