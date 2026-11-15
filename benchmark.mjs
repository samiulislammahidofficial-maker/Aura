// Small live measurements, not a load test. Do not infer global/provider performance from these samples.
import {writeFile} from 'node:fs/promises';
const base=process.env.AURA_URL||'http://localhost:5173';const samples=[];
for(const route of ['/api/search?q=chill','/api/search?q=chill','/api/discover','/api/discover']){
  const start=performance.now();try{const r=await fetch(base+route,{signal:AbortSignal.timeout(20000)});const d=await r.json();samples.push({route,status:r.status,ms:Math.round(performance.now()-start),tracks:d.tracks?.length||0});}catch(error){samples.push({route,error:error.name,ms:Math.round(performance.now()-start)});}
}
const discovery=await(await fetch(base+'/api/discover')).json();const t=discovery.tracks?.find(t=>t.playable);
if(t){const start=performance.now();const r=await fetch(base+'/api/stream/'+t.providerId,{redirect:'manual',signal:AbortSignal.timeout(15000)});samples.push({route:'/api/stream/:id authorization + local redirect',status:r.status,ms:Math.round(performance.now()-start)});if(r.status===302){const streamStart=performance.now();const s=await fetch(r.headers.get('location'),{signal:AbortSignal.timeout(15000)});const reader=s.body.getReader();const chunk=await reader.read();await reader.cancel();samples.push({route:'official stream redirect chain + first bytes',status:s.status,ms:Math.round(performance.now()-streamStart),bytes:chunk.value?.length||0});}}
const report={measuredAt:new Date().toISOString(),samples};console.log(JSON.stringify(report,null,2));if(process.argv.includes('--save'))await writeFile('benchmark-results.json',JSON.stringify(report,null,2)+'\n');
