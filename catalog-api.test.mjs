import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogRoute,normalize,playable} from './catalog-api.mjs';

test('availability is explicit; gated or unavailable tracks cannot play',()=>{
  assert.equal(playable({is_streamable:true}),true);
  for(const t of [{},{is_streamable:true,is_stream_gated:true},{is_streamable:true,is_available:false},{is_streamable:true,access:{stream:false}}])assert.equal(playable(t),false);
  const t=normalize({id:'abc',title:'Song',duration:120,is_streamable:true,user:{id:'artist',name:'Artist'},artwork:{'480x480':'https://example.org/art.jpg'}});
  assert.equal(t.id,'audius:abc');assert.equal(t.artist,'Artist');assert.equal(t.duration,120);assert.equal(t.playable,true);
  assert.equal(t.stream,undefined,'Expiring remote streams are not persisted');
});
test('stream route revalidates access and only redirects eligible public tracks',async()=>{
  const original=globalThis.fetch;let gated=true,requests=0;
  globalThis.fetch=async()=>{requests++;return {ok:true,json:async()=>({data:{id:'abc',is_streamable:true,is_stream_gated:gated}})};};
  const result=()=>({writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}});
  try {
    let res=result();await catalogRoute(new URL('http://localhost/api/stream/abc'),res);assert.equal(res.status,403);assert.equal(res.headers.Location,undefined);
    gated=false;res=result();await catalogRoute(new URL('http://localhost/api/stream/abc'),res);assert.equal(res.status,302);assert.equal(new URL(res.headers.Location).hostname,'api.audius.co');assert.equal(requests,2);
    res=result();await catalogRoute(new URL('http://localhost/api/stream/https%3A%2F%2Fexample.com'),res);assert.equal(res.status,404);assert.equal(requests,2);
  } finally {globalThis.fetch=original;}
});
test('provider rate limits produce an actionable response',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>({ok:false,status:429});
  const res={writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}};
  try {await catalogRoute(new URL('http://localhost/api/discover'),res);assert.equal(res.status,429);assert.match(res.body.error,/rate limit/);}finally{globalThis.fetch=original;}
});
