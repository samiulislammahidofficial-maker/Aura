const $ = (id) => document.getElementById(id);
const audio = $('audio');
let db, tracks = [], playlists = [], queue = [], current = null, view = 'home', filter = 'all', shuffle = false, repeat = false, currentURL, toastTimer;
let discovery = [], catalogIds = [], catalogStatus = 'idle', catalogError = '', catalogDetails = null, searchTimer, searchRequest, queueIndex = -1, playVersion = 0, retryCount = 0, savedPosition = 0;
const byId = id => tracks.find(t => t.id === id);
const canPlay = t => t && (t.file instanceof Blob || (t.provider === 'audius' && t.playable));
async function requestJSON(url, signal) {
  const response = await fetch(url,{signal:signal || AbortSignal.timeout(20000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Catalog request failed');
  return result;
}
function mergeCatalog(items) {
  items.forEach(t => { const existing = byId(t.id); if (existing) Object.assign(existing,t); else tracks.push({...t,liked:false}); });
}
async function loadCatalog(query = '') {
  searchRequest?.abort(); const controller = new AbortController(); searchRequest = controller;
  catalogStatus = 'loading'; catalogError = ''; render();
  try {
    const data = await requestJSON(query ? `/api/search?q=${encodeURIComponent(query)}` : '/api/discover',controller.signal);
    if (controller.signal.aborted) return;
    mergeCatalog(data.tracks); catalogIds = data.tracks.map(t=>t.id);
    if (!query) discovery = [...catalogIds];
    catalogDetails = query ? data : null; catalogStatus = 'ready';
    if (data.partial) toast('Some catalog results are temporarily unavailable.');
  } catch(error) { if(controller.signal.aborted) return; catalogStatus='error';catalogError=error.message; }
  render();
}
async function openCatalogDetail(type,id) {
  searchRequest?.abort(); const controller=new AbortController();searchRequest=controller;
  view='detail';catalogStatus='loading';catalogDetails=null;catalogIds=[];render();
  try { const data=await requestJSON(`/api/${type}/${encodeURIComponent(id)}`,controller.signal); if(controller.signal.aborted)return; mergeCatalog(data.tracks);catalogIds=data.tracks.map(t=>t.id);catalogDetails=data;catalogStatus='ready'; }
  catch(error){if(controller.signal.aborted)return;catalogStatus='error';catalogError=error.message;}
  render();
}
function savePlayer() {
  if (!db) return;
  const tx=db.transaction('player','readwrite');
  tx.objectStore('player').put({id:'state',current,queue,queueIndex,position:audio.currentTime || savedPosition,shuffle,repeat,volume:audio.volume,muted:audio.muted});
  // Persist remote metadata, never expiring stream URLs or downloaded remote audio.
  const tt=db.transaction('tracks','readwrite');
  tracks.filter(t=>t.provider==='audius' && (t.id===current || queue.includes(t.id) || t.liked || playlists.some(p=>p.tracks.includes(t.id)))).forEach(t=>tt.objectStore('tracks').put(t));
  tx.onerror=tt.onerror=()=>{};
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
  if (view === 'liked' || filter === 'favorites') result = result.filter(t => t.liked);
  const playlist = playlists.find(p => p.id === view);
  if (playlist) result = playlist.tracks.map(byId).filter(Boolean);
  const query = $('search').value.toLowerCase().trim();
  if (query && !remoteView) result = result.filter(t => `${t.title} ${t.artist} ${t.filename || ''} ${t.album || ''}`.toLowerCase().includes(query));
  return remoteView || playlist ? result : result.sort((a,b) => b.added - a.added);
}
function render() {
  const playlist = playlists.find(p => p.id === view);
  $('page-title').textContent = playlist?.name || ({home:'Find your frequency.', search:'Find your next favorite.', library:'Your music, all here.', liked:'A little love goes a long way.'}[view] || 'Your music');
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
    if(t.provider==='audius') {
      const subtitle=row.querySelector('.track-info small');
      subtitle.textContent=`${t.artist} · ${canPlay(t) ? 'Audius stream' : 'Metadata only · unavailable'}`;
      if(t.artistId){subtitle.dataset.artist=t.artistId;subtitle.tabIndex=0;subtitle.setAttribute('role','button');}
      row.querySelector('.album-column').textContent=t.album || t.genre || 'Audius';
      row.querySelectorAll('[data-play]').forEach(b=>b.disabled=!canPlay(t));
    }
  });
  const remote=['home','search','detail'].includes(view)&&filter==='all';
  $('catalog-status').textContent=remote ? catalogStatus==='loading' ? 'Loading music…' : catalogStatus==='error' ? catalogError : 'Music provided by Audius · availability varies by track' : '';
  $('catalog-retry').hidden=!(remote&&catalogStatus==='error');
  $('tracks').setAttribute('aria-busy',remote&&catalogStatus==='loading');
  if(remote&&!list.length) $('tracks').innerHTML=`<div class="empty"><strong>${catalogStatus==='loading'?'Finding your sound…':catalogStatus==='error'?'Could not load music':'No matching tracks'}</strong><p>${catalogStatus==='error'?escape(catalogError):catalogStatus==='loading'?'Connecting to the music catalog.':'Try a different song, artist, or album. You can also import your own audio.'}</p></div>`;
  $('catalog-results').replaceChildren();
  if(remote&&catalogDetails){
    for(const [key,type] of [['artists','artist'],['albums','album']]) for(const item of catalogDetails[key]||[]) {
      const b=document.createElement('button');b.className='catalog-chip';b.textContent=`${key==='artists'?'Artist':item.isAlbum?'Album':'Playlist'} · ${item.name}`;b.onclick=()=>openCatalogDetail(type,item.id);$('catalog-results').append(b);
    }
  }
}
function updatePlayer() {
  const t = tracks.find(t => t.id === current);
  $('now-title').textContent = t?.title || 'Your soundtrack starts here';
  $('now-artist').textContent = t?.artist || 'Import music to start listening';
  $('player-like').textContent = t?.liked ? '♥' : '♡';
  $('player-like').disabled = !t;
  $('play').textContent = audio.paused ? '▶' : 'Ⅱ';
  $('play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  $('mini-art').replaceChildren();
  if(t?.artwork){const img=document.createElement('img');img.src=t.artwork;img.alt='';$('mini-art').append(img);}else $('mini-art').textContent='≋';
  if('mediaSession' in navigator){
    navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
    if(t && 'MediaMetadata' in window) navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:t.album || 'Aura',artwork:t.artwork?[{src:t.artwork}]:[]});
  }
}
async function play(id, replaceQueue = true) {
  const t = byId(id); if (!canPlay(t)) return toast('This track is metadata only or unavailable for streaming.');
  const version=++playVersion;
  if(audio.error)audio.load();
  if (replaceQueue) { queue = visibleTracks().filter(canPlay).map(t => t.id);queueIndex=queue.indexOf(id); }
  else if(queue[queueIndex]!==id) queueIndex=queue.indexOf(id);
  if (current !== id || !audio.src) {
    audio.pause(); if (currentURL) URL.revokeObjectURL(currentURL);
    current = id; currentURL = t.file ? URL.createObjectURL(t.file) : null; audio.src = currentURL || `/api/stream/${encodeURIComponent(t.providerId)}`;
    if(savedPosition){const position=savedPosition;savedPosition=0;audio.addEventListener('loadedmetadata',()=>{if(version===playVersion&&Number.isFinite(audio.duration))audio.currentTime=Math.min(position,audio.duration);},{once:true});}
  }
  try { await audio.play(); if(version!==playVersion)return; retryCount=0; } catch(error) { if(version!==playVersion||error.name==='AbortError')return; toast(error.name==='NotAllowedError'?'Tap Play to resume audio.':'Playback failed. Check your connection or retry this track.'); }
  savePlayer();
  render();
}
async function togglePlay() { if (!current) { const t = visibleTracks()[0]; if (t) await play(t.id); else $('import').click(); } else if (audio.paused) await play(current, false); else audio.pause(); }
function advance(direction = 1) {
  if (!queue.length) return;
  if (direction === -1 && audio.currentTime > 3) { audio.currentTime = 0; return; }
  let index = queueIndex + direction;
  if (shuffle && queue.length > 1) { const options = queue.filter(id => id !== current); return play(options[Math.floor(Math.random() * options.length)], false); }
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
  const artist=e.target.closest('[data-artist]');if(artist){openCatalogDetail('artist',artist.dataset.artist);return;}
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.view) changeView(b.dataset.view);
  if (b.dataset.playlist) changeView(b.dataset.playlist);
  if (b.dataset.filter) { filter = b.dataset.filter; render(); }
  if (b.dataset.play) await play(b.dataset.play);
  if (b.dataset.like) await like(b.dataset.like);
  if (b.dataset.enqueue) { if(!canPlay(byId(b.dataset.enqueue)))return toast('This track is unavailable for streaming.');queue.splice(queueIndex+1,0,b.dataset.enqueue);savePlayer();renderQueue(); toast('Added next in queue'); }
  if (b.dataset.mood) playlistDialog(null, b.dataset.mood);
  if (b.dataset.queuePlay) {queueIndex=Number(b.dataset.queueIndex);await play(b.dataset.queuePlay, false);}
  if (b.dataset.removeQueue) { const index=Number(b.dataset.removeQueue);queue.splice(index,1);if(index<=queueIndex)queueIndex--;savePlayer();renderQueue(); }
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
function showSongOptions(id) {
  const choices = playlists.map(p => ({id:p.id,label:`Add to ${p.name}`}));
  choices.push({id:'new',label:'Create a new playlist'});
  if (playlists.some(p => p.id === view)) choices.push({id:'remove',label:'Remove from this playlist'});
  choices.push({id:'delete',label:'Delete song from library'});
  picker('Song options', choices, async choice => {
    if (choice === 'new') return playlistDialog(id);
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
    try { await store('playlists','put',updated); Object.assign(p,updated); render(); toast('Added to playlist'); } catch { toast('Could not save playlist.'); }
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
    const t = {id:crypto.randomUUID(), title:parts.length > 1 ? parts.slice(1).join(' - ') : stem, artist:parts.length > 1 ? parts[0] : 'Local artist',filename:file.name,fingerprint,file,liked:false,added:Date.now(),duration:await metadata(file),hue:Math.floor(Math.random()*360)};
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
$('search').oninput = () => {clearTimeout(searchTimer);searchRequest?.abort();if(['home','search','detail'].includes(view)){view='search';catalogIds=[];catalogStatus='loading';catalogDetails=null;render();searchTimer=setTimeout(()=>loadCatalog($('search').value.trim()),300);}else render();};
$('catalog-retry').onclick=()=>view==='detail'?changeView('home')||loadCatalog():loadCatalog($('search').value.trim());
$('play').onclick = togglePlay; $('hero-play').onclick = togglePlay;
$('next').onclick = () => advance(); $('previous').onclick = () => advance(-1);
$('player-like').onclick = () => like(current);
$('shuffle').onclick = () => { shuffle = !shuffle; $('shuffle').setAttribute('aria-pressed', shuffle);savePlayer(); };
$('repeat').onclick = () => { repeat = !repeat; $('repeat').setAttribute('aria-pressed', repeat);savePlayer(); };
$('queue-toggle').onclick = () => $('queue-panel').hidden = !$('queue-panel').hidden;
$('close-queue').onclick = () => $('queue-panel').hidden = true;
audio.volume = .7;
$('volume').oninput = e => { audio.volume = Number(e.target.value); audio.muted = false; $('mute').textContent = '♪';savePlayer(); };
$('mute').onclick = () => { audio.muted = !audio.muted; $('mute').textContent = audio.muted ? '×' : '♪'; $('mute').setAttribute('aria-label',audio.muted ? 'Unmute' : 'Mute');savePlayer(); };
$('seek').oninput = e => { if (Number.isFinite(audio.duration)) {audio.currentTime = audio.duration * Number(e.target.value)/100;savePlayer();} };
audio.ontimeupdate = () => { $('elapsed').textContent = time(audio.currentTime); $('duration').textContent = time(audio.duration); $('seek').value = audio.duration ? audio.currentTime/audio.duration*100 : 0; };
audio.onplay = () => {updatePlayer();savePlayer();}; audio.onpause = () => {updatePlayer();savePlayer();}; audio.onended = () => { advance(); updatePlayer(); };
audio.onwaiting=()=>{$('playback-status').textContent='Buffering…';};
audio.onplaying=()=>{$('playback-status').textContent='';};
audio.oncanplay=()=>{$('playback-status').textContent='';};
audio.onerror = () => { if (!current)return;$('playback-status').textContent='Playback unavailable. Tap Play to retry.';if(audio.error?.code===2&&retryCount<1){retryCount++;const position=audio.currentTime;audio.load();audio.addEventListener('loadedmetadata',()=>{audio.currentTime=position;audio.play().catch(()=>toast('Connection lost. Tap Play to retry.'));},{once:true});}else toast('Unable to play this track. It may be unavailable or your connection was interrupted.'); };
audio.addEventListener('timeupdate',()=>{if('mediaSession' in navigator&&navigator.mediaSession.setPositionState&&Number.isFinite(audio.duration)&&audio.duration>0)navigator.mediaSession.setPositionState({duration:audio.duration,position:Math.min(audio.currentTime,audio.duration),playbackRate:audio.playbackRate});});
setInterval(()=>{if(!audio.paused)savePlayer();},5000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)savePlayer();});
window.addEventListener('pagehide',event=>{savePlayer();if(currentURL&&!event.persisted)URL.revokeObjectURL(currentURL);});
if('mediaSession' in navigator){
  const handlers={play:()=>play(current,false),pause:()=>audio.pause(),nexttrack:()=>advance(),previoustrack:()=>advance(-1),seekto:d=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(d.seekTime,audio.duration);},seekbackward:d=>{audio.currentTime=Math.max(0,audio.currentTime-(d.seekOffset||10));},seekforward:d=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+(d.seekOffset||10));},stop:()=>{audio.pause();audio.currentTime=0;}};
  Object.entries(handlers).forEach(([action,handler])=>{try{navigator.mediaSession.setActionHandler(action,handler);}catch{}});
}
document.addEventListener('keydown', e => {
  if(e.key==='Enter'&&document.activeElement.dataset.artist){openCatalogDetail('artist',document.activeElement.dataset.artist);return;}
  if (['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName) || document.querySelector('dialog[open]')) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  if (e.key === '/') { e.preventDefault(); $('search').focus(); }
});
try {
  db = await openDB(); [tracks,playlists] = await Promise.all([store('tracks','getAll'),store('playlists','getAll')]);
  const saved=(await store('player','getAll'))[0];
  if(saved){current=byId(saved.current)?.id||null;queue=(saved.queue||[]).filter(id=>byId(id));queueIndex=Math.min(saved.queueIndex??queue.indexOf(current),queue.length-1);savedPosition=Number(saved.position)||0;shuffle=!!saved.shuffle;repeat=!!saved.repeat;audio.volume=Math.min(1,Math.max(0,saved.volume??.7));audio.muted=!!saved.muted;$('volume').value=audio.volume;$('shuffle').setAttribute('aria-pressed',shuffle);$('repeat').setAttribute('aria-pressed',repeat);$('elapsed').textContent=time(savedPosition);}
} catch { toast('Library storage is unavailable. Streaming remains available; imports and saving require browser storage.'); }
render();
loadCatalog();
