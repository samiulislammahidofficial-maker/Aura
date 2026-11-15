import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {once} from 'node:events';
import {streamxRoute,normalizeStreamx,streamxStatus} from './streamx-api.mjs';
test('StreamX normalizes real stored audio separately from virtual YouTube references',()=>{
  assert.equal(normalizeStreamx({_id:'abc',audio:{title:'Song',artist:'Artist',duration_sec:120,type:'mp3'}}).playbackType,'audio');
  assert.equal(normalizeStreamx({_id:'abc',audio:{type:'youtube'}}).playable,false);
  assert.equal(normalizeStreamx({_id:'../bad'}),null);
});
test('StreamX proxy preserves audio bytes, range seeking, errors and setup boundaries',async()=>{
  const old=process.env.STREAMX_API_URL;const bytes=Buffer.from('test-authorized-audio-bytes');let range;
  const source=http.createServer((req,res)=>{
    if(req.url.startsWith('/api/search')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({items:[{id:'test_audio',title:'Test Song',artist:'Test Artist',duration_sec:8,type:'wav'}]}));return;}
    if(req.url==='/api/tracks/test_audio/stream'){range=req.headers.range;const body=range?bytes.subarray(2,6):bytes;res.writeHead(range?206:200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':body.length,...(range?{'Content-Range':`bytes 2-5/${bytes.length}`}:{})});res.end(body);return;}
    res.writeHead(403);res.end('Access denied');
  });source.listen(0,'127.0.0.1');await once(source,'listening');
  const aura=http.createServer((req,res)=>streamxRoute(new URL(req.url,'http://localhost'),req,res));aura.listen(0,'127.0.0.1');await once(aura,'listening');const base=`http://127.0.0.1:${aura.address().port}`;
  try{
    delete process.env.STREAMX_API_URL;assert.equal(streamxStatus().enabled,false);assert.equal((await fetch(base+'/api/streamx/search')).status,503);
    process.env.STREAMX_API_URL=`http://127.0.0.1:${source.address().port}/api/`;
    const results=await(await fetch(base+'/api/streamx/search?q=test')).json();assert.equal(results.tracks[0].id,'streamx:test_audio');assert.equal(results.tracks[0].playable,true);
    const stream=await fetch(base+'/api/streamx/stream/test_audio',{headers:{Range:'bytes=2-5'}});assert.equal(stream.status,206);assert.equal(range,'bytes=2-5');assert.equal(await stream.text(),bytes.subarray(2,6).toString());assert.equal(stream.headers.get('content-range'),`bytes 2-5/${bytes.length}`);
    assert.equal((await fetch(base+'/api/streamx/stream/denied')).status,502,'Denied content must not be streamed');
  }finally{source.closeAllConnections();aura.closeAllConnections();await Promise.all([new Promise(r=>source.close(r)),new Promise(r=>aura.close(r))]);if(old===undefined)delete process.env.STREAMX_API_URL;else process.env.STREAMX_API_URL=old;}
});
