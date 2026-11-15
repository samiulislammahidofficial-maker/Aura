import test from 'node:test';import assert from 'node:assert/strict';import {YTMusicBridge} from './ytmusic-bridge.mjs';
test('Python metadata worker starts, rejects unsupported actions and cleans up requests',async t=>{
  const bridge=new YTMusicBridge();try{if(!await bridge.start()){t.skip('Python/ytmusicapi not installed');return;}assert(bridge.available);await assert.rejects(bridge.request('get_audio_url','not-supported'),/metadata is temporarily unavailable/);assert.equal(bridge.pending.size,0);}finally{bridge.stop();}assert.equal(bridge.available,false);assert.equal(bridge.child,null);
});
