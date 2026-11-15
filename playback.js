// One persistent audio element; a separate, visible official player owns YouTube playback.
export class PlaybackController extends EventTarget {
  constructor(element,panel){super();this.element=element;this.panel=panel;this.mode='audio';this.video=null;this.videoId=null;this.timer=null;this.videoPaused=true;this.selection=0;
    for(const name of ['play','pause','playing','waiting','canplay','error','ended','timeupdate','loadedmetadata'])element.addEventListener(name,()=>{if(this.mode==='audio')this.emit(name);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.mode==='youtube')this.pause();});
  }
  emit(name){this.dispatchEvent(new Event(name));this[`on${name}`]?.();}
  get paused(){return this.mode==='audio'?this.element.paused:this.videoPaused;}
  get duration(){return this.mode==='audio'?this.element.duration:(this.video?.getDuration?.()||NaN);}
  get currentTime(){return this.mode==='audio'?this.element.currentTime:(this.video?.getCurrentTime?.()||0);}
  set currentTime(value){if(this.mode==='audio')this.element.currentTime=value;else this.video?.seekTo(value,true);}
  get volume(){return this.element.volume;} set volume(v){this.element.volume=v;this.video?.setVolume?.(v*100);}
  get muted(){return this.element.muted;} set muted(v){this.element.muted=v;if(v)this.video?.mute?.();else this.video?.unMute?.();}
  get playbackRate(){return this.element.playbackRate;}
  get src(){return this.mode==='audio'?this.element.src:this.videoId;}
  set src(url){this.pause();this.selection++;this.mode='audio';this.panel.hidden=true;clearInterval(this.timer);this.element.src=url;}
  get error(){return this.mode==='audio'?this.element.error:null;}
  load(){if(this.mode==='audio')this.element.load();}
  removeAttribute(name){if(name==='src'){this.pause();this.selection++;this.mode='audio';this.panel.hidden=true;this.videoId=null;}this.element.removeAttribute(name);}
  async useVideo(id){
    if(!/^[\w-]{11}$/.test(id))throw new Error('Invalid YouTube video ID');
    this.pause();const selection=++this.selection;this.element.removeAttribute('src');this.element.load();this.mode='youtube';this.panel.hidden=false;this.videoId=null;
    await this.ensureVideo();if(selection!==this.selection||this.mode!=='youtube')throw new DOMException('Playback selection changed','AbortError');this.videoId=id;
    this.panel.scrollIntoView?.({block:'center',behavior:'instant'});
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>this.rejectCue?.(new Error('YouTube video did not become ready. Retry or open it on YouTube.')),12000);const finish=callback=>value=>{clearTimeout(timeout);this.resolveCue=null;this.rejectCue=null;callback(value);};this.resolveCue=finish(resolve);this.rejectCue=finish(reject);this.video.cueVideoById(id);});
  }
  ensureVideo(){
    if(this.videoReady)return this.videoReady;if(this.video)return Promise.resolve();
    this.videoReady=new Promise((resolve,reject)=>{
      let settled=false;
      const fail=message=>{if(settled)return;settled=true;clearTimeout(timeout);this.video?.destroy?.();this.video=null;this.videoReady=null;document.querySelector?.('script[data-youtube]')?.remove();reject(new Error(message));};
      const timeout=setTimeout(()=>fail('YouTube player timed out. Retry or choose Audius.'),12000);
      const create=()=>{if(settled)return;
        if(document.getElementById&&!document.getElementById('youtube-player')){const target=document.createElement('div');target.id='youtube-player';this.panel.append(target);}
        this.video=new YT.Player('youtube-player',{height:'270',width:'480',playerVars:{origin:location.origin,playsinline:1},events:{onReady:()=>{if(settled)return;settled=true;clearTimeout(timeout);this.video?.setVolume?.(this.volume*100);if(this.muted)this.video?.mute?.();resolve();},onError:event=>{if(this.mode!=='youtube')return;this.videoPaused=true;const error=new Error(`YouTube playback failed (code ${event.data}). The video or client may be restricted; open it on YouTube.`);this.rejectCue?.(error);this.rejectVideo?.(error);this.emit('error');},onAutoplayBlocked:()=>{this.videoPaused=true;this.rejectVideo?.(new Error('Press Play in the official YouTube player.'));this.emit('pause');},onStateChange:e=>{
          if(this.mode!=='youtube')return;
          if(e.data===1){this.videoPaused=false;this.resolveCue?.();this.resolveVideo?.();this.emit('play');this.emit('playing');clearInterval(this.timer);this.timer=setInterval(()=>this.emit('timeupdate'),500);}
          else if(e.data===0||e.data===2){this.videoPaused=true;clearInterval(this.timer);this.emit(e.data===0?'ended':'pause');}
          else if(e.data===3)this.emit('waiting');else if(e.data===5){this.resolveCue?.();this.emit('loadedmetadata');}
        }}});};
      if(window.YT?.Player)create();else{window.onYouTubeIframeAPIReady=create;if(!document.querySelector('script[data-youtube]')){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.dataset.youtube='true';s.onerror=()=>fail('Could not load YouTube player. Retry or choose Audius.');document.head.append(s);}}
    });return this.videoReady;
  }
  async play(){
    if(this.mode==='audio')return this.element.play();if(document.hidden)throw new Error('YouTube playback requires a visible player.');const selection=this.selection;await this.ensureVideo();if(this.mode!=='youtube'||selection!==this.selection)throw new DOMException('Playback selection changed','AbortError');this.rejectVideo?.(new DOMException('Playback superseded','AbortError'));
    return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>this.rejectVideo?.(new Error('YouTube playback did not start. Use the official player or retry.')),12000);const finish=callback=>value=>{clearTimeout(timeout);this.resolveVideo=null;this.rejectVideo=null;callback(value);};this.resolveVideo=finish(resolve);this.rejectVideo=finish(reject);this.video.playVideo();});
  }
  pause(){this.rejectCue?.(new DOMException('Playback paused','AbortError'));this.rejectVideo?.(new DOMException('Playback paused','AbortError'));if(this.mode==='audio')this.element.pause();else{this.video?.pauseVideo?.();this.videoPaused=true;this.emit('pause');}clearInterval(this.timer);}
}
