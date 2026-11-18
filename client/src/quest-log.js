// Read-only presentation of already available or discovered objectives.
// Progress is never calculated as authority or mutated by this view.
import {CLASSES,DIRECTIVES,directiveFor} from '../../shared/content.js';
import {SURVEY,surveyState,brineStage,brineHint} from '../../shared/survey.js';

export function questLog(sheet,trial=null){
 if(!sheet||!Object.hasOwn(CLASSES,sheet.cls)||!Number.isInteger(sheet.quest?.step)||sheet.quest.step<0||sheet.quest.step>DIRECTIVES.length)return [];
 const entries=[],step=sheet.quest.step;
 for(let i=0;i<DIRECTIVES.length&&i<=step;i++){
  const d=directiveFor(sheet.cls,i),done=i<step,count=d.goal.count;
  const progress=Number.isSafeInteger(sheet.quest.progress)?Math.max(0,sheet.quest.progress):0;
  entries.push({id:'directive:'+d.id,title:d.title,group:'Directive',status:done?'completed':'active',text:d.text,
   progress:Number.isSafeInteger(count)&&count>0?(done?count:Math.min(progress,count))+' / '+count+' '+(d.goal.ability?'successful strikes':'defeated'):''});
 }
 const survey=surveyState(sheet.survey);
 if(!survey){
  entries.push({id:'brine:investigation',title:'Brineworks field investigation',group:'Field investigation',status:'available',text:brineHint(null,0,null),progress:''});
  return entries;
 }
 const reported=survey.endsWith('_done'),key=reported?survey.slice(0,-5):survey;
 entries.push({id:'brine:investigation',title:SURVEY[key].title,group:'Field investigation',status:reported?'completed':'active',text:reported?'Evidence reported to Archivist Venn.':brineHint(survey,0,null),progress:''});
 if(reported){
  const stage=brineStage(sheet.brineStage);
  entries.push({id:'brine:commissioning',title:'Commission Brineworks',group:'Field investigation',status:stage===3?'completed':'active',text:brineHint(survey,stage,trial),progress:stage+' / 3 stages'});
 }
 return entries;
}
