import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
export function streamxBase(){
  if(!process.env.STREAMX_API_URL)return null;
  const url=new URL(process.env.STREAMX_API_URL);
  if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw new Error('STREAMX_API_URL must be an HTTP(S) API base without credentials or query parameters.');
  if(!url.pathname.endsWith('/'))url.pathname+='/';return url;
}
export function streamxStatus(){try{return {id:'streamx',enabled:!!streamxBase(),message:streamxBase()?'Configured StreamX audio library; connection checked when searching.':'Requires a running StreamX server and STREAMX_API_URL.'};}catch(error){return {id:'streamx',enabled:false,message:error.message};}}
export function normalizeStreamx(t,base){
  const id=String(t.id||t._id||'');if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))return null;
  const a=t.audio||{},type=t.type||a.type;
  let artwork=t.cover_url||t.spotify?.cover_url||'';try{const url=new URL(artwork,base);artwork=artwork&&['http:','https:'].includes(url.protocol)?url.href:'';}catch{artwork='';}
  return {id:`streamx:${id}`,provider:'streamx',providerId:id,title:t.title||a.title||'Untitled',artist:t.artist||a.artist||a.performer||'Unknown artist',album:t.album||a.album||'',artwork,duration:Number(t.duration_sec??a.duration_sec)||0,playable:!t.deleted&&type!=='youtube',playbackType:'audio',restrictions:'Stored StreamX library audio; use only content you are authorized to stream.',hue:100,added:Number(t.created_at)||0};
}
export async function streamxRoute(url,req,res){
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
    const base=streamxBase();if(!base)return json({error:'Configure STREAMX_API_URL with your running StreamX server. A GitHub URL is not a media server.'},503);
    if(url.pathname==='/api/streamx/search'){
      const q=(url.searchParams.get('q')||'').trim().slice(0,160);const endpoint=new URL(q?'search':'tracks',base);endpoint.searchParams.set('limit','24');if(q)endpoint.searchParams.set('q',q);
      const upstream=await fetch(endpoint,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!upstream.ok)return json({error:`StreamX search returned HTTP ${upstream.status}. Check its server URL and access settings.`},502);
      const data=await upstream.json();if(!Array.isArray(data.items))return json({error:'StreamX did not return an items list. Check the API base path.'},502);
      return json({tracks:data.items.map(t=>normalizeStreamx(t,base)).filter(Boolean),artists:[],albums:[]});
    }
    const match=url.pathname.match(/^\/api\/streamx\/stream\/([A-Za-z0-9_-]{1,200})$/);if(!match)return json({error:'Unknown StreamX route'},404);
    const controller=new AbortController();const close=()=>controller.abort();res.once('close',close);const timeout=setTimeout(close,15000);
    try{
      const upstream=await fetch(new URL(`tracks/${encodeURIComponent(match[1])}/stream`,base),{method:req.method,headers:req.headers.range?{Range:req.headers.range}:{},signal:controller.signal,redirect:'error'});clearTimeout(timeout);
      if(upstream.status!==200&&upstream.status!==206)return json({error:`StreamX playback returned HTTP ${upstream.status}.`},upstream.status===416?416:502);
      const type=upstream.headers.get('content-type')||'';if(!/^(audio\/|application\/octet-stream)/i.test(type))return json({error:'StreamX returned a non-audio response.'},502);
      const headers={'Content-Type':type,'Cache-Control':'no-store'};for(const key of ['content-length','content-range','accept-ranges'])if(upstream.headers.has(key))headers[key]=upstream.headers.get(key);
      res.writeHead(upstream.status,headers);if(req.method==='HEAD'){res.end();return;}await pipeline(Readable.fromWeb(upstream.body),res);
    }finally{clearTimeout(timeout);res.off('close',close);controller.abort();}
  }catch(error){if(res.destroyed)return;if(res.headersSent){res.destroy();return;}json({error:error.name==='TimeoutError'?'StreamX timed out. Retry shortly.':'Could not reach StreamX. Check STREAMX_API_URL and the server connection.'},502);}
}
