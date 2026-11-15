// Provider contracts are capability based: metadata never grants playback permission.
export const providers = {
  audius:{name:'Audius',search:true,metadata:true,playlists:true,playback:'audio',lyrics:false},
  local:{name:'Local files',search:true,metadata:true,playlists:true,playback:'audio',lyrics:false},
  youtube:{name:'YouTube',search:true,metadata:true,playlists:true,playback:'youtube-embed',lyrics:false},
  spotify:{name:'Spotify',search:false,metadata:false,playlists:false,playback:null,lyrics:false},
  jamendo:{name:'Jamendo',search:false,metadata:false,playlists:false,playback:null,lyrics:false}
};
export const AudiusProvider={...providers.audius,id:'audius',search:q=>`/api/search?q=${encodeURIComponent(q)}`,discover:genre=>`/api/discover${genre?'?genre='+encodeURIComponent(genre):''}`,metadata:(type,id)=>`/api/${type}/${encodeURIComponent(id)}`,playlist:id=>`/api/album/${encodeURIComponent(id)}`};
export const YouTubeProvider={...providers.youtube,id:'youtube',search:q=>`/api/youtube/search?q=${encodeURIComponent(q)}`};
export const LocalMusicProvider={...providers.local,id:'local',search:(query,tracks)=>tracks.filter(t=>t.file&&`${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase()))};
export function searchRequests(query,genre,configuration){return [query?AudiusProvider.search(query):AudiusProvider.discover(genre),...(query&&configuration.some(p=>p.id==='youtube'&&p.enabled)?[YouTubeProvider.search(query)]:[])];}
export function isPlayable(t){return !!t && (t.file instanceof Blob || (t.playable===true && ['audio','youtube-embed'].includes(t.playbackType || (t.provider==='audius'?'audio':null))));}
export const lyricsProvider={async get(){return {available:false,reason:'Synchronized lyrics are unavailable: no licensed lyrics provider is configured.'};}};
const words=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/);
const similarity=(a,b)=>{const x=new Set(words(a)),y=new Set(words(b));return [...x].filter(t=>y.has(t)).length/Math.max(x.size,y.size,1);};
export function matchTrack(a,b){
  const variants=s=>['remix','live','acoustic','instrumental','karaoke','cover','radio','extended'].filter(v=>words(s).includes(v)).join(',');
  const versionMatch=variants(a.title)===variants(b.title);
  const durationMatch=!!a.duration&&!!b.duration&&Math.abs(a.duration-b.duration)<=5;
  const score=.55*similarity(a.title,b.title)+.35*similarity(a.artist,b.artist)+.1*Number(durationMatch);
  return {score,versionMatch,durationMatch,suggest:versionMatch&&durationMatch&&score>=.85,requiresConfirmation:true};
}
