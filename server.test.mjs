import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';
test('production server exposes backend, revalidated assets and disabled services correctly',async()=>{
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'23617',HOST:'0.0.0.0',NODE_ENV:'production',YOUTUBE_API_KEY:'',COMMIT_SHA:'test-build'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  try{
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server exited');}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timeout')),5000).unref())]);
    const base='http://127.0.0.1:23617';const health=await(await fetch(base+'/api/health')).json();assert.equal(health.revision,'test-build');assert.equal(health.backend,true);
    const assets={'/':'text/html','/app.js':'text/javascript','/providers.js':'text/javascript','/playback.js':'text/javascript','/style.css':'text/css','/sw.js':'text/javascript','/manifest.webmanifest':'application/manifest+json','/icon.svg':'image/svg+xml'};
    for(const [url,type]of Object.entries(assets)){const r=await fetch(base+url);assert.equal(r.status,200,url);assert(r.headers.get('content-type').startsWith(type));assert.match(r.headers.get('cache-control'),/must-revalidate/);assert.equal(r.headers.get('x-aura-revision'),'test-build');await r.arrayBuffer();}
    const providers=await(await fetch(base+'/api/providers')).json();assert.equal(providers.providers.find(p=>p.id==='youtube').enabled,false);
    assert.equal((await fetch(base+'/api/youtube/search?q=test')).status,503);
    assert.equal((await fetch(base+'/api/not-a-route')).status,404);
  }finally{const exited=once(child,'exit');child.kill();await exited;}
});
