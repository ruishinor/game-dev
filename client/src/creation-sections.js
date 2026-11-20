// Viewport-sized, non-scrolling account character creation.
// All existing input nodes and handlers are preserved; only their presentation
// is divided into three accessible, bounded sections.
export function setupCreationSections(){
 const fields=document.querySelector('#creation-fields');
 if(!fields)throw new Error('Creation controls are missing');
 if(fields.dataset.sectionsReady==='true')return null;
 const name=document.querySelector('#name');
 const identity=document.createElement('section');
 const body=document.createElement('section');
 const details=document.createElement('section');
 const panes={identity,body,details};
 const navigation=document.createElement('nav');
 navigation.className='creation-screen-tabs';
 navigation.setAttribute('aria-label','Character creation sections');
 const tabs={};
 for(const [key,label] of [['identity','1. Identity'],['body','2. Body'],['details','3. Details']]){
  const btn=document.createElement('button');
  btn.type='button';btn.className='creation-screen-tab';btn.textContent=label;
  btn.dataset.creationTab=key;
  btn.setAttribute('aria-controls','creation-step-'+key);
  btn.setAttribute('aria-selected','false');
  tabs[key]=btn;
  navigation.append(btn);
  panes[key].id='creation-step-'+key;
  panes[key].className='creation-screen-step';
  panes[key].setAttribute('role','region');
  panes[key].setAttribute('aria-label',label);
 }
 const heading=fields.querySelector('.creation-section-heading');
 const back=fields.querySelector('#creation-back');
 const label=fields.querySelector('label[for="name"]');
 const classes=fields.querySelector('#classes');
 const calling=classes.previousElementSibling;
 const outfit=fields.querySelector('#look-row');
 const appearance=fields.querySelector('#appearance');
 if(!name||!label||!classes||!calling||!appearance||!outfit)throw Error('Creation form layout changed');
 identity.append(label,name,calling,classes,outfit);
 body.append(appearance);
 const detailFieldset=document.createElement('fieldset');
 detailFieldset.className='appearance creation-details';
 const legend=document.createElement('legend');
 legend.className='label';legend.textContent='Hair and colour';
 detailFieldset.append(legend);
 for(const id of ['ap-hair','ap-colour']){
  const node=document.getElementById(id);
  if(!node)throw Error('Missing creation choice '+id);
  detailFieldset.append(node.closest('.ap-row'));
 }
 details.append(detailFieldset);
 fields.append(navigation,identity,body,details);
 // Keep title and Back button in their original positions.
 if(heading)fields.insertBefore(navigation,heading.nextSibling);
 if(back)fields.insertBefore(back,heading?.nextSibling??fields.firstChild);
 let current='identity';
 function show(step){
  if(!panes[step])return;
  current=step;fields.dataset.creationStep=step;
  for(const [key,pane] of Object.entries(panes)){
   const selected=key===step;
   pane.hidden=!selected;
   tabs[key].setAttribute('aria-selected',String(selected));
   tabs[key].tabIndex=selected?0:-1;
  }
 }
 for(const [key,btn] of Object.entries(tabs)){
  btn.addEventListener('click',()=>show(key));
  btn.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
   e.preventDefault();
   const keys=Object.keys(tabs);
   const next=keys[(keys.indexOf(key)+(e.key==='ArrowRight'?1:keys.length-1))%keys.length];
   show(next);tabs[next].focus({preventScroll:true});
  });
 }
 // A hidden required name input must not create a browser 'not focusable'
 // validation failure on submission from the Body/Details sections.
 document.querySelector('#enter').addEventListener('click',()=>{
  if(!document.body.classList.contains('character-create-mode'))return;
  if(!name.checkValidity()){
   show('identity');
   name.focus({preventScroll:true});
  }
 },true);
 fields.dataset.sectionsReady='true';
 show('identity');
 return {show,get current(){return current}};
}
