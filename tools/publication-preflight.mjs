// Public-repository PR guard: review NEW text only. Not a substitute for making proprietary source private.
// Never print a matched line: CI logs and artifacts are themselves publicly observable.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function disclosureSignal(text) {
  if (typeof text !== 'string') return false;
  const odds = /\b(?:drop|loot|blueprint|reward|rare|roll|probability|chance|encounter)\b[^\n]{0,90}\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*%[^\n]{0,90}\b(?:drop|loot|blueprint|reward|rare|roll|probability|chance|encounter)\b/i;
  const codeOdds = /\b(?:chance|probability|dropRate|lootRate|rollThreshold)\s*[:=]\s*(?:0?\.\d+|\d+\s*\/\s*\d+)/i;
  return odds.test(text) || codeOdds.test(text);
}

export function addedLines(diff) {
  return String(diff).split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line=>line.slice(1));
}

export function publicationFindings(body, diff, paths) {
  const findings=[];
  if(disclosureSignal(body)) findings.push('pull request description');
  if(addedLines(diff).some(disclosureSignal)) findings.push('added source or documentation');
  // Public server-only execution remains readable as public source. Require private
  // storage before adding or changing proprietary reward tables.
  if((paths||[]).some(p=>/^server\/sim\/loot-tables\.js$/.test(p))) findings.push('restricted reward table changed in public repository');
  return findings;
}

function main(){
  const eventFile=process.env.GITHUB_EVENT_PATH;
  if(!eventFile) {console.error('GITHUB_EVENT_PATH required');process.exitCode=2;return;}
  const event=JSON.parse(readFileSync(eventFile,'utf8'));
  if(event.repository?.private!==false){console.log('Private-repository publication gate not applicable');return;}
  const base=event.pull_request?.base?.sha;
  if(!/^[0-9a-f]{40}$/.test(base||'')){console.error('Cannot establish trusted PR base SHA');process.exitCode=2;return;}
  const diff=execFileSync('git',['diff','--no-ext-diff','--unified=0',base,'HEAD'],{encoding:'utf8',maxBuffer:16*1024*1024});
  const names=execFileSync('git',['diff','--name-only',base,'HEAD'],{encoding:'utf8'}).trim().split('\n');
  const findings=publicationFindings(event.pull_request?.body||'',diff,names);
  if(findings.length){console.error('POTENTIAL PUBLIC DISCLOSURE: '+findings.join('; ')+'. Keep sensitive changes out of public Git history; use an access-controlled repository.');process.exitCode=1;return;}
  console.log('No high-signal disclosure patterns in this PR delta. This is not a confidentiality guarantee.');
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main();
