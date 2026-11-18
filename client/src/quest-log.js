// Read-only presentation of already available or discovered objectives.
// Progress is never calculated as authority or mutated by this view.
import {CLASSES,DIRECTIVES,ITEMS,directiveFor} from '../../shared/content.js';
import {sanitizeDirectiveReceipts} from '../../shared/directive-receipts.js';
import {SURVEY,BRINE_ROUTES,BRINE_REWARD_XP,surveyState,brineStage,brineHint} from '../../shared/survey.js';

// The server supplies only the discovered field entries and their current
// objective text. This is display sanitization, never progression authority.
function fieldEntries(sheet){
 const rows=Array.isArray(sheet.fieldQuests)?sheet.fieldQuests.slice(0,12):[],seen=new Set(),out=[];
 for(const q of rows){
  if(!q||typeof q.id!=='string'||!/^field:[a-z0-9_:-]{1,60}$/.test(q.id)||seen.has(q.id)||!['active','completed','available'].includes(q.status))continue;
  if(!['title','group','text','progress'].every(k=>typeof q[k]==='string'&&q[k].length<=1200))continue;
  const rewards=Array.isArray(q.rewards)?q.rewards.slice(0,8).filter(r=>typeof r==='string'&&r.length>0&&r.length<=160):[];
  seen.add(q.id);out.push({id:q.id,title:q.title,group:q.group,status:q.status,text:q.text,progress:q.progress,rewards});
 }
 return out;
}
const investigationRewards=()=>[BRINE_REWARD_XP.investigation+' XP','Access to Brineworks commissioning'];
function directiveRewards(d,cls){
 const rewards=[],item=d.reward.classItem?.[cls];
 if(d.reward.xp)rewards.push(d.reward.xp+' XP');
 if(item&&Object.hasOwn(ITEMS,item))rewards.push(ITEMS[item].name);
 return rewards;
}
export function questLog(sheet,trial=null){
 if(!sheet||!Object.hasOwn(CLASSES,sheet.cls)||!Number.isInteger(sheet.quest?.step)||sheet.quest.step<0||sheet.quest.step>DIRECTIVES.length)return [];
 const entries=[],step=sheet.quest.step;
 const receipts=new Map(sanitizeDirectiveReceipts(sheet.directiveReceipts,sheet.cls,step).map(r=>[r.id,r]));
 for(let i=0;i<DIRECTIVES.length&&i<=step;i++){
  const d=directiveFor(sheet.cls,i),done=i<step,count=d.goal.count;
  const progress=Number.isSafeInteger(sheet.quest.progress)?Math.max(0,sheet.quest.progress):0;
  const receipt=done?receipts.get(d.id):null,received=[];
  if(receipt){
   if(d.reward.xp)received.push(receipt.xp+' XP credited');
   if(d.reward.classItem?.[sheet.cls])received.push(receipt.item?ITEMS[receipt.item].name:'No additional item granted');
  }
  entries.push({id:'directive:'+d.id,title:d.title,group:'Directive',status:done?'completed':'active',text:d.text,rewards:directiveRewards(d,sheet.cls),...(received.length?{received}:{}),
   progress:Number.isSafeInteger(count)&&count>0?(done?count:Math.min(progress,count))+' / '+count+' '+(d.goal.ability?'successful strikes':'defeated'):''});
 }
 const survey=surveyState(sheet.survey);
 if(!survey){
  entries.push({id:'brine:investigation',title:'Brineworks field investigation',group:'Field investigation',status:'available',text:brineHint(null,0,null),progress:'',rewards:investigationRewards()});
  return entries.concat(fieldEntries(sheet));
 }
 const reported=survey.endsWith('_done'),key=reported?survey.slice(0,-5):survey;
 entries.push({id:'brine:investigation',title:SURVEY[key].title,group:'Field investigation',status:reported?'completed':'active',text:reported?'Evidence reported to Archivist Venn.':brineHint(survey,0,null),progress:'',rewards:investigationRewards()});
 if(reported){
  const stage=brineStage(sheet.brineStage);
  entries.push({id:'brine:commissioning',title:'Commission Brineworks',group:'Field investigation',status:stage===3?'completed':'active',text:brineHint(survey,stage,trial),progress:stage+' / 3 stages',rewards:[BRINE_REWARD_XP.commissioning+' XP',ITEMS[BRINE_ROUTES[key].reward].name,'Access to Brineworks services and eligible fabrication']});
 }
 return entries.concat(fieldEntries(sheet));
}
