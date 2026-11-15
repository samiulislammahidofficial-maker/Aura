import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const file of readdirSync(new URL('.',import.meta.url)).filter(f=>/\.(mjs|js)$/.test(f))){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit',cwd:new URL('.',import.meta.url)});if(r.status!==0)process.exit(r.status||1);}
console.log('All JavaScript syntax checks passed.');
