import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('combat profiling harness parses as a Node module without opening a browser',()=>{
 const file=fileURLToPath(new URL('../tools/profile-combat.mjs',import.meta.url));
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',file],{timeout:10000,stdio:'pipe'}));
});
