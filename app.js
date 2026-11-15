import {PlaybackController} from './playback.js';
import {isPlayable,lyricsProvider,searchRequests,matchTrack,LocalMusicProvider} from './providers.js';
const $ = (id) => document.getElementById(id);
const audio = new PlaybackController($('audio'),$('video-panel'));
const listening={starts:0,failures:0,buffering:0,startupMs:[]};
let history=[],savedAlbums=[],favoriteArtists=[],providerConfig=[],searchStarted=0,searchLatency=0;
let backendStatus='Checking backend…';
let providerRefresh=null,providerRetry=null,providerRetryCount=0;
async function refreshProviders(){
  if(providerRefresh)return providerRefresh;
  const option=$('source').querySelector('[value="youtube"]');
  providerRefresh=(async()=>{
    try{
      const data=await requestJSON('/api/providers',AbortSignal.timeout(6000));
      if(!Array.isArray(data.providers))throw new Error('Aura backend returned invalid provider status.');
      providerConfig=data.providers;const youtube=providerConfig.find(p=>p.id==='youtube');
      const streamx=providerConfig.find(p=>p.id==='streamx');let streamxOption=$('source').querySelector('[value="streamx"]');if(streamx?.enabled&&!streamxOption){streamxOption=document.createElement('option');streamxOption.value='streamx';streamxOption.textContent='StreamX audio library';$('source').append(streamxOption);}if(streamxOption)streamxOption.disabled=!streamx?.enabled;
      option.disabled=!youtube?.enabled;option.textContent=youtube?.enabled?'YouTube Music':'YouTube Music (setup required)';option.title=youtube?.message||'YouTube Music is not configured.';
      clearTimeout(providerRetry);providerRetryCount=0;
      try{const health=await requestJSON('/api/health',AbortSignal.timeout(6000));backendStatus=`Backend connected · revision ${health.revision}`;}catch{backendStatus='Provider backend connected; revision check unavailable.';}
    }catch(error){
      const message=error.name==='TimeoutError'?'Provider check timed out. The backend may be starting; retry using Music services.':error.message;
      option.disabled=true;option.textContent='YouTube Music (backend check failed)';option.title=message;
      providerConfig=[{id:'youtube',enabled:false,message}];backendStatus=message;
      if(navigator.onLine&&providerRetryCount++<3)providerRetry=setTimeout(()=>refreshProviders(),15000);
    }
  })();
  try{await providerRefresh;}finally{providerRefresh=null;}
}
let metadataDirty=true;
let unshuffledQueue=[];
function shuffleUpcoming(){const start=queueIndex+1;const tail=queue.slice(start);for(let i=tail.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tail[i],tail[j]]=[tail[j],tail[i]];}queue=[...queue.slice(0,start),...tail];}
let db, tracks = [], playlists = [], queue = [], current = null, view = 'home', filter = 'all', shuffle = false, repeat = false, currentURL, toastTimer;
let discovery = [], catalogIds = [], catalogStatus = 'idle', catalogError = '', catalogDetails = null, searchTimer, searchRequest, queueIndex = -1, playVersion = 0, retryCount = 0, savedPosition = 0;
const byId = id => tracks.find(t => t.id === id);
const canPlay = isPlayable;
async function requestJSON(url, signal) {
  const response = await fetch(url,{signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)});
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Aura backend is missing or outdated. Run npm start or deploy the Node web service; static hosting cannot serve /api routes.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Catalog request failed');
  return result;
}
function mergeCatalog(items) {
  const keep=new Set([...discovery,...catalogIds,...queue,...history.map(h=>h.id),...playlists.flatMap(p=>p.tracks),current,...items.map(t=>t.id)]);
  tracks=tracks.filter(t=>t.file||t.liked||keep.has(t.id));
  items.forEach(t => { const existing = byId(t.id); if (existing) Object.assign(existing,t); else tracks.push({...t,liked:false}); });metadataDirty=true;
}
async function loadCatalog(query = '') {
  searchRequest?.abort(); const controller = new AbortController(); searchRequest = controller;
  const started=performance.now();searchStarted=searchStarted||started;
  catalogIds=query||$('source').value==='local'?LocalMusicProvider.search(query,tracks).map(t=>t.id):[];catalogDetails={artists:[],albums:[]};
  catalogStatus = 'loading'; catalogError = ''; render();
  const requests=searchRequests(query,$('genre').value,providerConfig,$('source').value);
  const results=await Promise.allSettled(requests.map(async url=>{
    const data=await requestJSON(url,controller.signal);if(controller.signal.aborted)return;
    mergeCatalog(data.tracks);catalogIds=[...new Set([...catalogIds,...data.tracks.map(t=>t.id)])];
    catalogDetails.artists.push(...data.artists||[]);catalogDetails.albums.push(...data.albums||[]);
    if(!query)discovery=[...catalogIds];searchLatency=Math.round(performance.now()-searchStarted);render();
  }));
  if(controller.signal.aborted)return;
  const failures=results.filter(p=>p.status==='rejected');
  catalogStatus=requests.length&&failures.length===requests.length?'error':'ready';catalogError=failures.map(p=>p.reason.message).join(' ');
  if(failures.length&&catalogStatus==='ready')toast(`Partial results: ${catalogError}`);
  searchStarted=0;
  render();
}
async function openCatalogDetail(type,id,provider='audius') {
  searchRequest?.abort(); const controller=new AbortController();searchRequest=controller;
  view='detail';catalogStatus='loading';catalogDetails=null;catalogIds=[];render();
  try { const data=await requestJSON(`/api/${provider==='youtube'?'youtube/':''}${type}/${encodeURIComponent(id)}`,controller.signal); if(controller.signal.aborted)return; mergeCatalog(data.tracks);catalogIds=data.tracks.map(t=>t.id);catalogDetails={...data,type,id,provider};catalogStatus='ready'; }
  catch(error){if(controller.signal.aborted)return;catalogStatus='error';catalogError=error.message;}
  render();
}
function savePlayer() {
  if (!db) return;
    const tx=db.transaction('player','readwrite');
  tx.objectStore('player').put({id:'state',current,queue,queueIndex,position:audio.src?audio.currentTime:savedPosition,shuffle,repeat,volume:audio.volume,muted:audio.muted,history,savedAlbums,favoriteArtists,unshuffledQueue});
  // Persist remote metadata, never expiring stream URLs or downloaded remote audio.
  tx.onerror=()=>{};
  if(metadataDirty){const tt=db.transaction('tracks','readwrite');tracks.filter(t=>t.provider && t.provider!=='local' && (t.id===current || queue.includes(t.id) || history.some(h=>h.id===t.id) || t.liked || playlists.some(p=>p.tracks.includes(t.id)))).forEach(t=>tt.objectStore('tracks').put(t));tt.onerror=()=>{metadataDirty=true;};metadataDirty=false;}
}
const time = (n) => Number.isFinite(n) ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '0:00';
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message) { $('toast').textContent = message; $('toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').style.display = 'none', 4000); }
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rea-music', 2);
    request.onupgradeneeded = () => { for(const name of ['tracks','playlists','player']) if(!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' }); };
    request.onblocked = () => toast('Close older music app tabs to finish updating your library.');
    request.onsuccess = () => {request.result.onversionchange=()=>{request.result.close();db=null;toast('Your library was updated in another tab. Reload Aura.');};resolve(request.result);};
    request.onerror = () => reject(request.error);
  });
}
function store(name, operation, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, operation === 'getAll' ? 'readonly' : 'readwrite');
    const request = tx.objectStore(name)[operation](value);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}
function visibleTracks() {
  const remoteView = ['home','search','detail'].includes(view) && filter === 'all';
  const ids = view === 'home' && !$('search').value ? discovery : catalogIds;
  let result = remoteView ? ids.map(byId).filter(Boolean) : tracks.filter(t=>t.file || t.liked || playlists.some(p=>p.tracks.includes(t.id)));
  if(view==='history')result=history.map(h=>byId(h.id)).filter(Boolean);
  if (view === 'liked' || filter === 'favorites') result = result.filter(t => t.liked);
  const playlist = playlists.find(p => p.id === view);
  if (playlist) result = playlist.tracks.map(byId).filter(Boolean);
  if($('source').value!=='all')result=result.filter(t=>(t.provider||'local')===$('source').value);
  if(filter==='favorites')result=result.filter(t=>t.liked);
  const query = $('search').value.toLowerCase().trim();
  if (query && !remoteView) result = result.filter(t => `${t.title} ${t.artist} ${t.filename || ''} ${t.album || ''}`.toLowerCase().includes(query));
  return remoteView || playlist || view==='history' ? result : result.sort((a,b) => b.added - a.added);
}
function render() {
  const playlist = playlists.find(p => p.id === view);
  $('page-title').textContent = playlist?.name || ({home:'Find your frequency.', search:'Find your next favorite.', library:'Your music, all here.', liked:'A little love goes a long way.',history:'Recently played'}[view] || 'Your music');
  if(view==='detail' && catalogDetails?.name) $('page-title').textContent=catalogDetails.name;
  $('page-subtitle').textContent = playlist ? `${playlist.tracks.length} songs · Your personal playlist` : 'A soundtrack for every version of you.';
  if(view==='detail') $('page-subtitle').textContent=catalogDetails?.description || catalogDetails?.artist || 'Audius collection';
  $('hero').hidden = view !== 'home' || !!$('search').value;
  $('moods-section').hidden = view !== 'home' || !!$('search').value;
  $('tracks-title').textContent = playlist?.name || (view === 'liked' ? 'Liked songs' : view === 'home' ? 'Made for your rotation' : 'Your collection');
  $('like-count').textContent = tracks.filter(t => t.liked).length;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('selected', b.dataset.filter === filter));
  $('playlist-nav').innerHTML = playlists.map(p => `<button class="playlist-link ${p.id === view ? 'active' : ''}" data-playlist="${p.id}">♫ &nbsp; ${escape(p.name)}</button>`).join('');
  $('playlist-actions').innerHTML = playlist ? '<button id="add-library">＋ Add songs from library</button><button id="delete-playlist">Delete playlist</button>' : '';
  const list = visibleTracks();
  $('track-count').textContent = `${list.length} ${list.length === 1 ? 'song' : 'songs'}`;
  $('tracks').innerHTML = list.length ? list.map((t, index) => `<div class="track-row ${t.id === current ? 'current' : ''}"><button class="track-index" data-play="${t.id}" aria-label="Play ${escape(t.title)}">${t.id === current && !audio.paused ? '♫' : index + 1}</button><div class="track-info"><button class="cover" style="--hue:${t.hue}" data-play="${t.id}" aria-label="Play ${escape(t.title)}">≋</button><div><strong>${escape(t.title)}</strong><small>${escape(t.artist)}</small></div></div><span class="album-column">${playlist ? escape(playlist.name) : 'Local collection'}</span><span class="track-time">${time(t.duration)}</span><div class="row-actions"><button data-like="${t.id}" class="${t.liked ? 'liked' : ''}" aria-label="${t.liked ? 'Unlike' : 'Like'} ${escape(t.title)}">${t.liked ? '♥' : '♡'}</button><button data-enqueue="${t.id}" aria-label="Add ${escape(t.title)} to queue" title="Add to queue">＋</button><button data-options="${t.id}" aria-label="Options for ${escape(t.title)}">⋯</button></div></div>`).join('') : `<div class="empty"><strong>${$('search').value ? 'No matching songs' : view === 'liked' ? 'Keep your favorites close.' : playlist ? 'Every playlist starts with one song.' : 'Your next favorite is already yours.'}</strong><p>${$('search').value ? 'Try a different title or artist.' : view === 'liked' ? 'Tap the heart beside a song to save it here.' : playlist ? 'Add songs from your library to build this playlist.' : 'Import audio files from your device and make this space your own. Your library stays in this browser.'}</p>${!tracks.length ? '<button id="empty-import">＋ Import your first songs</button>' : ''}</div>`;
  renderQueue(); updatePlayer();
  document.querySelectorAll('.track-row').forEach((row,i)=>{
    const t=list[i];
    if(t.artwork){const img=document.createElement('img');img.src=t.artwork;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';row.querySelector('.cover').replaceChildren(img);}
    if(t.provider) {
      const subtitle=row.querySelector('.track-info small');
      subtitle.textContent=`${t.artist} · ${t.provider==='streamx'?'StreamX audio':t.provider==='local'?'Local file':t.provider==='youtube'?'YouTube video':canPlay(t)?'Audius stream':'Metadata only · unavailable'}`;
      if(t.artistId){subtitle.dataset.artist=t.artistId;subtitle.dataset.provider=t.provider;subtitle.tabIndex=0;subtitle.setAttribute('role','button');}
      row.querySelector('.album-column').textContent=t.album || t.genre || (t.provider==='local'?'Local collection':t.provider==='streamx'?'StreamX library':t.provider==='youtube'?'YouTube Music':'Audius');
      row.querySelectorAll('[data-play]').forEach(b=>b.disabled=!canPlay(t));
    }
  });
  const remote=['home','search','detail'].includes(view)&&filter==='all';
  $('catalog-status').textContent=!navigator.onLine?'Offline · imported music and saved interface remain available':remote ? catalogStatus==='loading' ? 'Loading music…' : catalogStatus==='error' ? catalogError : `Music provided by Audius${providerConfig.some(p=>p.id==='youtube'&&p.enabled)?' and YouTube':''} · availability varies by track` : '';
  $('catalog-retry').hidden=!(remote&&catalogStatus==='error');
  $('tracks').setAttribute('aria-busy',remote&&catalogStatus==='loading');
  if(remote&&!list.length) $('tracks').innerHTML=`<div class="empty"><strong>${catalogStatus==='loading'?'Finding your sound…':catalogStatus==='error'?'Could not load music':'No matching tracks'}</strong><p>${catalogStatus==='error'?escape(catalogError):catalogStatus==='loading'?'Connecting to the music catalog.':'Try a different song, artist, or album. You can also import your own audio.'}</p></div>`;
  $('catalog-results').replaceChildren();
  if(remote&&catalogDetails){
    for(const [key,type] of [['artists','artist'],['albums','album']]) for(const item of catalogDetails[key]||[]) {
      const b=document.createElement('button');b.className='catalog-chip';b.textContent=`${key==='artists'?'Artist':item.isAlbum?'Album':'Playlist'} · ${item.name}`;b.onclick=()=>item.url?window.open(item.url,'_blank','noopener,noreferrer'):openCatalogDetail(item.provider==='youtube'&&type==='album'&&!item.isAlbum?'playlist':type,item.id,item.provider);$('catalog-results').append(b);
    }
  }
  if(view==='library')for(const item of [...savedAlbums,...favoriteArtists]){const b=document.createElement('button');b.className='catalog-chip';b.textContent=`${item.type==='artist'?'Favorite artist':'Saved collection'} · ${item.name}`;b.onclick=()=>openCatalogDetail(item.type,item.id,item.provider);$('catalog-results').append(b);}
  if(view==='detail'&&catalogDetails?.name){const b=document.createElement('button');b.className='catalog-chip';b.textContent='Save / unsave collection or artist';b.onclick=()=>saveDetail();$('catalog-results').append(b);}
}
function updatePlayer() {
  const t = tracks.find(t => t.id === current);
  $('now-title').textContent = t?.title || 'Your soundtrack starts here';
  $('now-artist').textContent = t?.artist || 'Import music to start listening';
  $('player-like').textContent = t?.liked ? '♥' : '♡';
  $('player-like').disabled = !t;
  $('play').textContent = audio.paused ? '▶' : 'Ⅱ';
  $('play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  if($('mini-art').dataset.track!==current){$('mini-art').dataset.track=current||'';$('mini-art').replaceChildren();if(t?.artwork){const img=document.createElement('img');img.src=t.artwork;img.alt='';$('mini-art').append(img);}else $('mini-art').textContent='≋';}
  if('mediaSession' in navigator){
    navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
    if(t && 'MediaMetadata' in window) navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:t.album || 'Aura',artwork:t.artwork?[{src:t.artwork}]:[]});
  }
}
async function play(id, replaceQueue = true) {
  const t = byId(id); if (!canPlay(t)) return toast('This track is metadata only or unavailable for streaming.');
  const version=++playVersion;
  const started=performance.now();const changed=current!==id;listening.starts++;
  if(changed)savedPosition=0;
  if(audio.error)audio.load();
  if (replaceQueue) { queue = visibleTracks().filter(canPlay).map(t => t.id);unshuffledQueue=[...queue];queueIndex=queue.indexOf(id);if(shuffle)shuffleUpcoming(); }
  else if(queue[queueIndex]!==id) queueIndex=queue.indexOf(id);
  if (current !== id || !audio.src) {
    audio.pause(); if (currentURL) URL.revokeObjectURL(currentURL);
    current = id;metadataDirty=true;
    if(t.provider==='youtube'){try{await audio.useVideo(t.providerId);}catch(error){if(version===playVersion&&error.name!=='AbortError')toast(error.message);return;}if(version!==playVersion)return;}
    else {currentURL = t.file ? URL.createObjectURL(t.file) : null; audio.src = currentURL || `/api/${t.provider==='streamx'?'streamx/stream':'stream'}/${encodeURIComponent(t.providerId)}`;}
    if(savedPosition){const position=savedPosition;savedPosition=0;audio.addEventListener('loadedmetadata',()=>{if(version===playVersion&&Number.isFinite(audio.duration))audio.currentTime=Math.min(position,audio.duration);},{once:true});}
  }
  try { await audio.play(); if(version!==playVersion)return; retryCount=0;listening.startupMs.push(Math.round(performance.now()-started));listening.startupMs=listening.startupMs.slice(-30);history=[{id,at:Date.now()},...history.filter(h=>h.id!==id)].slice(0,100); } catch(error) { if(version!==playVersion||error.name==='AbortError')return;listening.failures++; toast(error.name==='NotAllowedError'?'Tap Play to resume audio.':t.provider==='youtube'?error.message:'Playback failed. Check your connection or retry this track.'); }
  savePlayer();
  render();
}
async function togglePlay() { if (!current) { const t = visibleTracks().find(canPlay); if (t) await play(t.id); else $('import').click(); } else if (audio.paused) await play(current, false); else audio.pause(); }
function advance(direction = 1) {
  if (!queue.length) return;
  if (direction === -1 && audio.currentTime > 3) { audio.currentTime = 0; return; }
  let index = queueIndex + direction;
  if (index >= queue.length || index < 0) { if (!repeat) return; index = (index + queue.length) % queue.length; }
  queueIndex=index; savedPosition=0;play(queue[index], false);
}
async function like(id) {
  const t = tracks.find(t => t.id === id); if (!t) return;
  const updated = {...t, liked: !t.liked};
  try { await store('tracks', 'put', updated); Object.assign(t, updated); render(); } catch { toast('Could not save this favorite. Check browser storage.'); }
}
function renderQueue() {
  $('queue-list').innerHTML = queue.length ? queue.map((id,i) => { const t = tracks.find(t => t.id === id); return t ? `<div class="queue-item"><button data-queue-index="${i}" data-queue-play="${id}">${id === current ? '♫ ' : ''}${escape(t.title)}</button><button data-remove-queue="${i}" aria-label="Remove ${escape(t.title)} from queue">✕</button></div>` : ''; }).join('') : '<p>Your queue is quiet. Play a song or add one with ＋.</p>';
}
function changeView(next) { searchRequest?.abort();clearTimeout(searchTimer);view = next; filter = 'all'; $('search').value = '';catalogDetails=null; if(next==='home'){catalogIds=[...discovery];catalogStatus='ready';} render(); if (next === 'search') {$('search').focus();catalogIds=[...discovery];render();} if(['home','search'].includes(next)&&!discovery.length)loadCatalog(); }
let pendingTrack = null;
function playlistDialog(trackId = null, name = '') {
  pendingTrack = trackId; $('playlist-name').value = name; $('playlist-dialog').showModal(); $('playlist-name').focus();
}
document.addEventListener('click', async e => {
  if(e.target.closest('.brand')){e.preventDefault();changeView('home');return;}
  const artist=e.target.closest('[data-artist]');if(artist){openCatalogDetail('artist',artist.dataset.artist,artist.dataset.provider);return;}
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.view) changeView(b.dataset.view);
  if (b.dataset.playlist) changeView(b.dataset.playlist);
  if (b.dataset.filter) { filter = b.dataset.filter; render(); }
  if (b.dataset.play) await play(b.dataset.play);
  if (b.dataset.like) await like(b.dataset.like);
  if (b.dataset.enqueue) { if(!canPlay(byId(b.dataset.enqueue)))return toast('This track is unavailable for streaming.');queue.splice(queueIndex+1,0,b.dataset.enqueue);unshuffledQueue=[...queue];savePlayer();renderQueue(); toast('Added next in queue'); }
  if (b.dataset.mood) {changeView('search');$('search').value=b.dataset.mood;loadCatalog(b.dataset.mood);}
  if (b.dataset.queuePlay) {queueIndex=Number(b.dataset.queueIndex);await play(b.dataset.queuePlay, false);}
  if (b.dataset.removeQueue) { const index=Number(b.dataset.removeQueue);queue.splice(index,1);unshuffledQueue=[...queue];if(index<=queueIndex)queueIndex--;savePlayer();renderQueue(); }
  if (b.dataset.options) showSongOptions(b.dataset.options);
  if (b.id === 'empty-import') $('import').click();
  if (b.id === 'add-library') showLibraryPicker();
  if (b.id === 'delete-playlist') {
    if (confirm('Delete this playlist? Your audio files will stay in your library.')) {
      try { await store('playlists','delete',view); playlists = playlists.filter(p => p.id !== view); changeView('library'); } catch { toast('Could not delete playlist.'); }
    }
  }
});
function picker(title, items, onSelect) {
  const dialog = document.createElement('dialog');
  const heading = document.createElement('h2'); heading.textContent = title; dialog.append(heading);
  items.forEach(item => { const button = document.createElement('button'); button.textContent = item.label; button.className = 'playlist-link'; button.onclick = async () => { dialog.close(); dialog.remove(); await onSelect(item.id); }; dialog.append(button); });
  const close = document.createElement('button'); close.textContent = 'Close'; close.onclick = () => dialog.close(); dialog.append(close);
  dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
}
function showInfo(title,lines){
  const dialog=document.createElement('dialog'),heading=document.createElement('h2'),close=document.createElement('button');heading.textContent=title;dialog.append(heading);
  for(const line of lines){const p=document.createElement('p');p.textContent=line;dialog.append(p);}
  close.textContent='Close';close.onclick=()=>dialog.close();dialog.append(close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
}
document.querySelector('.avatar').onclick=()=>showInfo('Your local profile',['Your music library is saved in this browser.','Aura has no cloud account or multi-device sync configured.']);
function saveDetail(){
  const {id,name,type,provider}=catalogDetails;const list=type==='artist'?favoriteArtists:savedAlbums;const index=list.findIndex(i=>i.id===id&&i.provider===provider);
  if(index>=0)list.splice(index,1);else list.push({id,name,type,provider});savePlayer();toast(index>=0?'Removed from collection':'Saved to your library');
}
$('source').onchange=()=>{if(['home','search','detail'].includes(view)){view='search';loadCatalog($('search').value.trim());}else render();};
$('genre').onchange=()=>{view='home';$('search').value='';loadCatalog();};
$('history-button').onclick=()=>{changeView('history');$('page-title').textContent='Recently played';};
$('lyrics-button').onclick=async()=>toast((await lyricsProvider.get()).reason);
$('providers-button').onclick=async()=>{await refreshProviders();showInfo('Music services',[backendStatus,...providerConfig.map(p=>`${p.id}: ${p.message}`)]);};
$('diagnostics-button').onclick=()=>showInfo('Playback details (this session)',[backendStatus,`Last search to results: ${searchLatency} ms`,`Playback attempts: ${listening.starts}; rejected attempts: ${listening.failures}`,`Buffering events: ${listening.buffering}`,`Recent startup times (ms): ${listening.startupMs.join(', ')||'none'}`]);
function showSongOptions(id) {
  const choices = playlists.map(p => ({id:p.id,label:`Add to ${p.name}`}));
  choices.push({id:'new',label:'Create a new playlist'});
  choices.push({id:'similar',label:'Explore this genre'},{id:'matches',label:'Compare matching recordings'});
  if (playlists.some(p => p.id === view)) choices.push({id:'remove',label:'Remove from this playlist'});
  choices.push({id:'delete',label:'Delete song from library'});
  picker('Song options', choices, async choice => {
    if (choice === 'new') return playlistDialog(id);
    if(choice==='similar'){const t=byId(id);changeView('search');$('search').value=t.genre||t.artist;return loadCatalog($('search').value);}
    if(choice==='matches'){
      const selected=byId(id);const matches=tracks.filter(t=>t.id!==id&&canPlay(t)&&matchTrack(selected,t).suggest);
      if(!matches.length)return toast('No close recording matches in the loaded catalog. Try a song search first.');
      return picker('Choose a recording (no automatic substitution)',matches.map(t=>({id:t.id,label:`${t.title} · ${t.artist} · ${t.provider||'local'}`})),choice=>{const t=byId(choice);if(confirm(`Play this recording instead? ${t.title} by ${t.artist} (${t.provider||'local'})`))play(choice);});
    }
    try {
      if (choice === 'delete') {
        if (!confirm('Delete this song from the browser library? The original file on your device is unaffected.')) return;
        // One transaction keeps playlist references and song storage consistent.
        await new Promise((resolve,reject) => {
          const tx = db.transaction(['tracks','playlists'],'readwrite');
          tx.objectStore('tracks').delete(id);
          playlists.forEach(p => tx.objectStore('playlists').put({...p,tracks:p.tracks.filter(t => t !== id)}));
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
        tracks = tracks.filter(t => t.id !== id); playlists.forEach(p => p.tracks = p.tracks.filter(t => t !== id)); queue = queue.filter(t => t !== id);queueIndex=queue.indexOf(current);
        if (current === id) { audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(currentURL); current = null; }
      } else {
        const p = playlists.find(p => p.id === (choice === 'remove' ? view : choice));
        const updated = {...p,tracks:choice === 'remove' ? p.tracks.filter(t => t !== id) : [...new Set([...p.tracks,id])]};
        if(choice!=='remove')await store('tracks','put',byId(id));
        await store('playlists','put',updated); Object.assign(p,updated); toast(choice === 'remove' ? 'Removed from playlist' : 'Added to playlist');
      }
      render();savePlayer();
    } catch { toast('Could not save your changes. Check browser storage.'); }
  });
}
function showLibraryPicker() {
  const p = playlists.find(p => p.id === view);
  const available = tracks.filter(t => !p.tracks.includes(t.id));
  if (!available.length) return toast(tracks.length ? 'All your songs are already in this playlist.' : 'Import some music first.');
  picker('Add a song', available.map(t => ({id:t.id,label:t.title})), async id => {
    const updated = {...p,tracks:[...p.tracks,id]};
    try { await store('tracks','put',byId(id));await store('playlists','put',updated); Object.assign(p,updated); render(); toast('Added to playlist'); } catch { toast('Could not save playlist.'); }
  });
}
function metadata(file) {
  return new Promise(resolve => {
    const a = document.createElement('audio'), url = URL.createObjectURL(file);
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); const duration = Number.isFinite(a.duration) ? a.duration : 0; a.removeAttribute('src'); a.load(); URL.revokeObjectURL(url); resolve(duration); };
    const timer = setTimeout(finish, 4000); a.onloadedmetadata = finish; a.onerror = finish; a.src = url;
  });
}
$('import').onchange = async e => {
  if (!db) return toast('Browser storage is unavailable. Try a normal browser window.');
  const files = [...e.target.files]; let imported = 0, duplicates = 0, failed = 0;
  toast('Importing your music…');
  for (const file of files) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|flac|aac|opus|webm)$/i.test(file.name)) { failed++; continue; }
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
    if (tracks.some(t => t.fingerprint === fingerprint)) { duplicates++; continue; }
    const stem = file.name.replace(/\.[^.]+$/, ''), parts = stem.split(' - ');
    const id=crypto.randomUUID();const t = {id,provider:'local',providerId:id,playbackType:'audio',playable:true,restrictions:'User-imported audio',title:parts.length > 1 ? parts.slice(1).join(' - ') : stem, artist:parts.length > 1 ? parts[0] : 'Local artist',filename:file.name,fingerprint,file,liked:false,added:Date.now(),duration:await metadata(file),hue:Math.floor(Math.random()*360)};
    try { await store('tracks','put',t); tracks.push(t); imported++; } catch { failed++; }
  }
  e.target.value = ''; render(); toast(`${imported} songs imported${duplicates ? ` · ${duplicates} duplicates skipped` : ''}${failed ? ` · ${failed} failed (format or storage limit)` : ''}`);
};
$('playlist-form').onsubmit = async e => {
  e.preventDefault(); const name = $('playlist-name').value.trim(); if (!name) return;
  const p = {id:crypto.randomUUID(), name, tracks:pendingTrack ? [pendingTrack] : []};
  try { if(pendingTrack)await store('tracks','put',byId(pendingTrack));await store('playlists','put',p); playlists.push(p); $('playlist-dialog').close(); changeView(p.id); toast('Playlist created'); } catch { toast('Could not save playlist. Check browser storage.'); }
};
$('create-playlist').onclick = () => playlistDialog();
$('cancel-dialog').onclick = () => $('playlist-dialog').close();
$('search').oninput = () => {searchStarted=performance.now();clearTimeout(searchTimer);searchRequest?.abort();if(['home','search','detail'].includes(view)){view='search';catalogIds=[];catalogStatus='loading';catalogDetails=null;render();searchTimer=setTimeout(()=>loadCatalog($('search').value.trim()),300);}else render();};
$('catalog-retry').onclick=()=>view==='detail'?changeView('home')||loadCatalog():loadCatalog($('search').value.trim());
$('play').onclick = togglePlay; $('hero-play').onclick = togglePlay;
$('next').onclick = () => advance(); $('previous').onclick = () => advance(-1);
$('player-like').onclick = () => like(current);
$('shuffle').onclick = () => { shuffle = !shuffle;if(shuffle){unshuffledQueue=[...queue];shuffleUpcoming();}else if(unshuffledQueue.length){queue=[...unshuffledQueue.filter(id=>byId(id))];queueIndex=queue.indexOf(current);} $('shuffle').setAttribute('aria-pressed', shuffle);savePlayer();renderQueue(); };
$('repeat').onclick = () => { repeat = !repeat; $('repeat').setAttribute('aria-pressed', repeat);savePlayer(); };
$('queue-toggle').onclick = () => $('queue-panel').hidden = !$('queue-panel').hidden;
$('close-queue').onclick = () => $('queue-panel').hidden = true;
audio.volume = .7;
$('volume').oninput = e => { audio.volume = Number(e.target.value); audio.muted = false; $('mute').textContent = '♪';savePlayer(); };
$('mute').onclick = () => { audio.muted = !audio.muted; $('mute').textContent = audio.muted ? '×' : '♪'; $('mute').setAttribute('aria-label',audio.muted ? 'Unmute' : 'Mute');savePlayer(); };
$('seek').oninput = e => { if (Number.isFinite(audio.duration)) {audio.currentTime = audio.duration * Number(e.target.value)/100;savePlayer();} };
audio.ontimeupdate = () => { $('elapsed').textContent = time(audio.currentTime); $('duration').textContent = time(audio.duration); $('seek').value = audio.duration ? audio.currentTime/audio.duration*100 : 0; };
audio.onplay = () => {updatePlayer();savePlayer();}; audio.onpause = () => {updatePlayer();savePlayer();}; audio.onended = () => { advance(); updatePlayer(); };
audio.onwaiting=()=>{listening.buffering++;$('playback-status').textContent='Buffering…';};
audio.onplaying=()=>{$('playback-status').textContent='';};
audio.oncanplay=()=>{$('playback-status').textContent='';};
audio.onerror = () => { if (!current)return;$('playback-status').textContent='Playback unavailable. Tap Play to retry.';if(audio.error?.code===2&&retryCount<1){retryCount++;const position=audio.currentTime,version=playVersion;audio.load();audio.addEventListener('loadedmetadata',()=>{if(version!==playVersion)return;audio.currentTime=position;audio.play().catch(()=>toast('Connection lost. Tap Play to retry.'));},{once:true});}else toast('Unable to play this track. It may be unavailable or your connection was interrupted.'); };
audio.addEventListener('timeupdate',()=>{if('mediaSession' in navigator&&navigator.mediaSession.setPositionState&&Number.isFinite(audio.duration)&&audio.duration>0)navigator.mediaSession.setPositionState({duration:audio.duration,position:Math.min(audio.currentTime,audio.duration),playbackRate:audio.playbackRate});});
setInterval(()=>{if(!audio.paused)savePlayer();},5000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)savePlayer();});
window.addEventListener('pagehide',event=>{savePlayer();if(currentURL&&!event.persisted)URL.revokeObjectURL(currentURL);});
if('mediaSession' in navigator){
  const handlers={play:()=>play(current,false),pause:()=>audio.pause(),nexttrack:()=>advance(),previoustrack:()=>advance(-1),seekto:d=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(d.seekTime,audio.duration);},seekbackward:d=>{audio.currentTime=Math.max(0,audio.currentTime-(d.seekOffset||10));},seekforward:d=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+(d.seekOffset||10));},stop:()=>{audio.pause();audio.currentTime=0;}};
  Object.entries(handlers).forEach(([action,handler])=>{try{navigator.mediaSession.setActionHandler(action,handler);}catch{}});
}
document.addEventListener('keydown', e => {
  if(e.key==='Enter'&&document.activeElement.dataset.artist){openCatalogDetail('artist',document.activeElement.dataset.artist,document.activeElement.dataset.provider);return;}
  if (['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  if (e.key === '/') { e.preventDefault(); $('search').focus(); }
});
try {
  db = await openDB(); [tracks,playlists] = await Promise.all([store('tracks','getAll'),store('playlists','getAll')]);
  const saved=(await store('player','getAll'))[0];
  if(saved){current=byId(saved.current)?.id||null;queue=(saved.queue||[]).filter(id=>byId(id));queueIndex=Math.min(saved.queueIndex??queue.indexOf(current),queue.length-1);savedPosition=Number(saved.position)||0;shuffle=!!saved.shuffle;repeat=!!saved.repeat;unshuffledQueue=saved.unshuffledQueue||[...queue];history=saved.history||[];savedAlbums=saved.savedAlbums||[];favoriteArtists=saved.favoriteArtists||[];audio.volume=Math.min(1,Math.max(0,saved.volume??.7));audio.muted=!!saved.muted;$('volume').value=audio.volume;$('shuffle').setAttribute('aria-pressed',shuffle);$('repeat').setAttribute('aria-pressed',repeat);$('elapsed').textContent=time(savedPosition);}
} catch { toast('Library storage is unavailable. Streaming remains available; imports and saving require browser storage.'); }
render();
loadCatalog();
refreshProviders();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>reg.update().catch(()=>{})).catch(()=>{});
window.addEventListener('online',()=>{refreshProviders();render();if(['home','search'].includes(view))loadCatalog($('search').value.trim());});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)refreshProviders();});
window.addEventListener('offline',render);
