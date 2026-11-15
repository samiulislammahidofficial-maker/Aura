// One persistent audio element; a separate, visible official player owns YouTube playback.
export class PlaybackController extends EventTarget {
  constructor(element,panel){super();this.element=element;this.panel=panel;this.mode='audio';this.video=null;this.videoId=null;this.timer=null;this.videoPaused=true;
    for(const name of ['play','pause','playing','waiting','canplay','error','ended','timeupdate','loadedmetadata'])element.addEventListener(name,()=>{if(this.mode==='audio')this.emit(name);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.mode==='youtube')this.pause();});
  }
  emit(name){this.dispatchEvent(new Event(name));this[`on${name}`]?.();}
  get paused(){return this.mode==='audio'?this.element.paused:this.videoPaused;}
  get duration(){return this.mode==='audio'?this.element.duration:(this.video?.getDuration?.()||NaN);}
  get currentTime(){return this.mode==='audio'?this.element.currentTime:(this.video?.getCurrentTime?.()||0);}
  set currentTime(value){if(this.mode==='audio')this.element.currentTime=value;else this.video?.seekTo(value,true);}
  get volume(){return this.element.volume;} set volume(v){this.element.volume=v;this.video?.setVolume(v*100);}
  get muted(){return this.element.muted;} set muted(v){this.element.muted=v;if(v)this.video?.mute();else this.video?.unMute();}
  get playbackRate(){return this.element.playbackRate;}
  get src(){return this.mode==='audio'?this.element.src:this.videoId;}
  set src(url){this.pause();this.mode='audio';this.panel.hidden=true;clearInterval(this.timer);this.element.src=url;}
  get error(){return this.mode==='audio'?this.element.error:null;}
  load(){if(this.mode==='audio')this.element.load();}
  removeAttribute(name){this.element.removeAttribute(name);}
  async useVideo(id){
    if(!/^[\w-]{11}$/.test(id))throw new Error('Invalid YouTube video ID');
    this.pause();this.element.removeAttribute('src');this.element.load();this.mode='youtube';this.panel.hidden=false;this.videoId=id;
    await this.ensureVideo();this.video.cueVideoById(id);
  }
  ensureVideo(){
    if(this.videoReady)return this.videoReady;if(this.video)return Promise.resolve();
    this.videoReady=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{this.videoReady=null;reject(new Error('YouTube player timed out. Retry or choose Audius.'));},12000);
      const create=()=>{this.video=new YT.Player('youtube-player',{height:'270',width:'480',playerVars:{origin:location.origin,playsinline:1},events:{onReady:()=>{clearTimeout(timeout);resolve();},onError:()=>{this.videoPaused=true;this.emit('error');},onStateChange:e=>{this.videoPaused=e.data!==1;const names={0:'ended',1:'playing',2:'pause',3:'waiting',5:'loadedmetadata'};if(e.data===1)this.emit('play');if(names[e.data])this.emit(names[e.data]);}}});};
      if(window.YT?.Player)create();else{window.onYouTubeIframeAPIReady=create;if(!document.querySelector('script[data-youtube]')){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.dataset.youtube='true';s.onerror=()=>{clearTimeout(timeout);this.videoReady=null;reject(new Error('Could not load YouTube player.'));};document.head.append(s);}}
    });return this.videoReady;
  }
  async play(){if(this.mode==='audio')return this.element.play();if(document.hidden)throw new Error('YouTube playback requires a visible player.');await this.ensureVideo();this.video.playVideo();clearInterval(this.timer);this.timer=setInterval(()=>this.emit('timeupdate'),500);}
  pause(){if(this.mode==='audio')this.element.pause();else{this.video?.pauseVideo();this.videoPaused=true;this.emit('pause');}clearInterval(this.timer);}
}
