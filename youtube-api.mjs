import {metadataCache} from './request-cache.mjs';
import {ytmusic} from './ytmusic-bridge.mjs';
export const providerStatus=()=>[
  {id:'audius',enabled:true,message:'Public audio streams'},
  {id:'youtube',enabled:ytmusic.available||!!process.env.YOUTUBE_API_KEY,message:ytmusic.available?'YouTube Music discovery via ytmusicapi (unofficial); official embedded playback':process.env.YOUTUBE_API_KEY?'YouTube Data API discovery; official embedded playback':'Install Python dependencies to enable YouTube Music, or configure YOUTUBE_API_KEY'},
  {id:'spotify',enabled:false,message:'Not connected. Requires an approved developer app, OAuth, and Premium for SDK playback.'},
  {id:'jamendo',enabled:false,message:'Not enabled. Requires client ID and confirmation of application and track license compatibility.'}
];
async function google(resource,params){
  const url=new URL(`https://www.googleapis.com/youtube/v3/${resource}`);Object.entries({...params,key:process.env.YOUTUBE_API_KEY}).forEach(([k,v])=>url.searchParams.set(k,v));
  return metadataCache.get(url.href,async()=>{const r=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Object.assign(new Error(r.status===403?'YouTube quota or API access unavailable.':'YouTube is temporarily unavailable.'),{status:503});return r.json();});
}
const duration=s=>{const m=String(s).match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);return m?Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0):0;};
export async function youtubeSearch(query){
  if(ytmusic.configured)return query?metadataCache.get('ytmusic:search:'+query,()=>ytmusic.request('search',query)):{tracks:[],artists:[],albums:[]};
  if(!process.env.YOUTUBE_API_KEY)throw Object.assign(new Error('YouTube discovery requires YOUTUBE_API_KEY on the server.'),{status:503});
  if(!query)return {tracks:[],artists:[],albums:[]};
  const data=await google('search',{part:'snippet',q:`${query} music`,type:'video,channel,playlist',maxResults:15});
  const videoIds=data.items.filter(i=>i.id.videoId).map(i=>i.id.videoId);
  const details=videoIds.length?await google('videos',{part:'contentDetails,status',id:videoIds.join(',')}):{items:[]};
  const videos=new Map(details.items.map(v=>[v.id,v]));
  return {tracks:data.items.filter(i=>i.id.videoId).map(i=>{const v=videos.get(i.id.videoId);return {id:`youtube:${i.id.videoId}`,provider:'youtube',providerId:i.id.videoId,title:i.snippet.title,artist:i.snippet.channelTitle,album:'YouTube video',artwork:i.snippet.thumbnails?.medium?.url||'',duration:duration(v?.contentDetails?.duration),playable:v?.status?.embeddable===true,playbackType:'youtube-embed',restrictions:'Official visible YouTube player only; ads and background restrictions apply',hue:100,added:0,permalink:`https://www.youtube.com/watch?v=${i.id.videoId}`};}),artists:data.items.filter(i=>i.id.channelId).map(i=>({id:i.id.channelId,name:i.snippet.title,url:`https://www.youtube.com/channel/${i.id.channelId}`})),albums:data.items.filter(i=>i.id.playlistId).map(i=>({id:i.id.playlistId,name:i.snippet.title,url:`https://www.youtube.com/playlist?list=${i.id.playlistId}`,isAlbum:false}))};
}
export async function youtubeDetail(type,id){
  if(!ytmusic.configured)throw Object.assign(new Error('YouTube Music metadata worker is unavailable.'),{status:503});
  return metadataCache.get(`ytmusic:${type}:${id}`,()=>ytmusic.request(type,id));
}
