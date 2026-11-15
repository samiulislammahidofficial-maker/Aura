import test from 'node:test';import assert from 'node:assert/strict';import {PlaybackController} from './playback.js';
test('player switches sources without concurrent audio and forbids hidden video playback',async()=>{
  const previous={document:globalThis.document,window:globalThis.window,YT:globalThis.YT,location:globalThis.location};
  const doc={hidden:false,addEventListener(){}};globalThis.document=doc;globalThis.window={};globalThis.location={origin:'http://localhost:5173'};
  const element=new EventTarget();Object.assign(element,{paused:true,volume:.7,muted:false,src:'',pause(){this.paused=true;},load(){},removeAttribute(){this.src='';},async play(){this.paused=false;}});
  class Player{constructor(_,options){this.options=options;queueMicrotask(()=>options.events.onReady());}cueVideoById(id){this.id=id;}playVideo(){this.options.events.onStateChange({data:1});}pauseVideo(){this.options.events.onStateChange({data:2});}getCurrentTime(){return 5;}getDuration(){return 180;}}
  globalThis.YT={Player};window.YT=globalThis.YT;const panel={hidden:true},p=new PlaybackController(element,panel);
  try{p.src='local-fixture';await p.play();assert(!element.paused);await p.useVideo('abcdefghijk');assert(element.paused);assert.equal(panel.hidden,false);await p.play();assert(!p.paused);doc.hidden=true;await assert.rejects(p.play(),/visible/);p.src='second-local';assert(panel.hidden);assert.equal(p.mode,'audio');}
  finally{p.pause();for(const [k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
