import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestCache} from './request-cache.mjs';
import {matchTrack,isPlayable,searchRequests,lyricsProvider} from './providers.js';
import {youtubeSearch,providerStatus} from './youtube-api.mjs';
test('metadata requests deduplicate and expire without retaining failures',async()=>{
  const c=new RequestCache({ttl:15,max:2});let calls=0;
  const loader=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return calls;};
  assert.deepEqual(await Promise.all([c.get('a',loader),c.get('a',loader)]),[1,1]);assert.equal(await c.get('a',loader),1);assert.equal(calls,1);
  await new Promise(r=>setTimeout(r,20));assert.equal(await c.get('a',loader),2);
  await assert.rejects(c.get('bad',()=>{throw new Error('outage');}));assert.equal(await c.get('bad',()=>3),3);
  await c.get('c',()=>4);assert(c.entries.size<=2);
});
test('recording comparisons reject incompatible versions and durations',()=>{
  const t={title:'My Song',artist:'The Artist',duration:180};
  assert(matchTrack(t,{...t,title:'my song'}).suggest);
  assert(!matchTrack(t,{...t,title:'My Song (Live)'}).suggest);
  assert(!matchTrack(t,{...t,duration:210}).suggest);
  assert(!isPlayable({...t,provider:'spotify',playable:true}));assert(!isPlayable({...t,provider:'audius',playable:false,playbackType:'audio'}));
  assert.equal(searchRequests('x','',[]).length,1);assert.equal(searchRequests('x','',[{id:'youtube',enabled:true}]).length,2);
  assert.equal(searchRequests('x','',[],'local').length,0,'Local search must not request a remote catalog');
  assert.deepEqual(searchRequests('x','',[{id:'youtube',enabled:true}],'youtube'),['/api/youtube/search?q=x']);
});
test('lyrics and unconfigured services state their missing requirements',async()=>{
  assert.equal((await lyricsProvider.get()).available,false);assert.equal(providerStatus().find(p=>p.id==='spotify').enabled,false);
});
test('official YouTube discovery maps durations and respects embedding restrictions',async()=>{
  const original=globalThis.fetch,oldKey=process.env.YOUTUBE_API_KEY;process.env.YOUTUBE_API_KEY='test-only-not-a-real-secret';let calls=0;
  globalThis.fetch=async url=>{assert.equal(url.hostname,'www.googleapis.com');calls++;return {ok:true,json:async()=>url.pathname.endsWith('/search')?{items:[{id:{videoId:'abcdefghijk'},snippet:{title:'Test song',channelTitle:'Artist',thumbnails:{}}}]}:{items:[{id:'abcdefghijk',contentDetails:{duration:'PT3M2S'},status:{embeddable:false}}]}};};
  try{const d=await youtubeSearch('fixture');assert.equal(d.tracks[0].duration,182);assert.equal(d.tracks[0].playable,false);assert.equal(d.tracks[0].playbackType,'youtube-embed');assert.equal(d.tracks[0].stream,undefined);assert.equal(calls,2);}finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.YOUTUBE_API_KEY;else process.env.YOUTUBE_API_KEY=oldKey;}
});
