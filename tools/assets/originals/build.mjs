import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOriginals } from './catalog.mjs';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../client/art-assets');
const args=process.argv.slice(2);
if(args.some(a=>a!=='--check'))throw Error('usage: build.mjs [--check]');
const check=args.includes('--check'),files=generateOriginals(),problems=[];
if(!check)fs.mkdirSync(dir,{recursive:true});
for(const [rel,buf] of files){
 const dest=path.join(dir,rel);
 if(check){if(!fs.existsSync(dest)||!fs.readFileSync(dest).equals(buf))problems.push(rel);}
 else {fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,buf);}
}
if(fs.existsSync(dir))for(const rel of fs.readdirSync(dir,{recursive:true}).map(x=>x.split(path.sep).join('/'))){if(fs.statSync(path.join(dir,rel)).isFile()&&!files.has(rel))problems.push('unlisted:'+rel);}
if(problems.length){console.error('Original art discrepancy:',problems.join(', '));process.exitCode=1;}
else console.log((check?'Verified ':'Generated ')+files.size+' original art files');
