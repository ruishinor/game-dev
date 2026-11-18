// Setup only: never mutate a disconnected or replaced simulation entity.
// Wait for the browser's current snapshot and the server's current authenticated
// session to agree. A reconnect before fixture setup is reported, not concealed.
import {setTimeout as delay} from 'node:timers/promises';
export async function liveFixturePlayer(page,server,name,timeout=30000){
 const end=Date.now()+timeout;let diag=null,misses=0;
 do{
  const client=await page.evaluate(()=>{const s=window.__attune?.state();return s?{id:s.myId,name:s.sheet?.name,snaps:s.snaps,hasYou:!!s.you,hasSelf:s.ents.some(e=>e.id===s.myId),status:document.querySelector('#status')?.hidden?'':document.querySelector('#status')?.textContent}:null;});
  const p=server.game.players.get(client?.id),conn=p?server.net.sessions.get(p.char.id):null;
  if(client?.name===name&&client.snaps>0&&client.hasYou&&client.hasSelf&&!client.status&&p?.name===name&&conn?.player===p&&conn.ws.readyState===1){
   if(misses)console.log('[fixture] authenticated entity synchronized after '+misses+' observations');
   return p;
  }
  diag={client,server:[...server.game.players.values()].map(x=>({id:x.id,name:x.name})),connection:conn?.ws.readyState??null};misses++;
  await delay(100);
 }while(Date.now()<end);
 throw Error('No matching live authenticated fixture: '+JSON.stringify(diag));
}
