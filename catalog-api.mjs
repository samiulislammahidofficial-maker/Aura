// Only documented Audius endpoints are exposed. No arbitrary URL proxy or credentials in the browser.
export async function audius(resource, query = {}) {
  const url = new URL(`https://api.audius.co/v1/${resource}`);
  url.searchParams.set('app_name', 'Aura');
  if (process.env.AUDIUS_API_KEY) url.searchParams.set('api_key', process.env.AUDIUS_API_KEY);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: {Accept:'application/json'} });
  if (!response.ok) throw Object.assign(new Error(response.status === 429 ? 'Catalog rate limit reached. Try again shortly.' : 'Music provider is temporarily unavailable.'), {status:response.status === 429 ? 429 : 502});
  const body = await response.json();
  if (!('data' in body)) throw new Error('Invalid catalog response');
  return body.data;
}
export function playable(track) {
  return track.is_streamable === true && track.is_available !== false && !track.is_stream_gated && track.access?.stream !== false;
}
export function normalize(t) {
  return {id:`audius:${t.id}`, provider:'audius', providerId:t.id,title:t.title,artist:t.user?.name || 'Unknown artist',artistId:t.user?.id,album:t.album_backlink?.playlist_name || '',albumId:t.album_backlink?.playlist_id,artwork:t.artwork?.['480x480'] || t.artwork?.['150x150'] || '',duration:Number(t.duration)||0,description:t.description || '',genre:t.genre || '',playable:playable(t),permalink:t.permalink ? `https://audius.co${t.permalink}` : '',hue:100,added:0};
}
export async function catalogRoute(url, res) {
  const json = (data, status=200) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const query = url.searchParams.get('q')?.trim().slice(0,160) || '';
  try {
    if (url.pathname === '/api/discover') return json({tracks:(await audius('tracks/trending',{limit:24})).map(normalize)});
    if (url.pathname === '/api/search') {
      if (!query) return json({tracks:[],artists:[],albums:[]});
      const data = await audius('search/full',{query,limit:24});
      return json({tracks:(data.tracks || []).map(normalize),artists:(data.users || []).map(a=>({id:a.id,name:a.name,bio:a.bio,artwork:a.profile_picture?.['150x150']})),albums:[...(data.albums || []),...(data.playlists || [])].map(p=>({id:p.id,name:p.playlist_name,artist:p.user?.name,isAlbum:p.is_album,artwork:p.artwork?.['150x150']}))});
    }
    const match = url.pathname.match(/^\/api\/(artist|album|track|stream)\/([A-Za-z0-9]+)$/);
    if (!match) return json({error:'Unknown catalog endpoint'},404);
    const [,type,id] = match;
    if (type === 'artist') {
      const [artist,tracks,albums] = await Promise.all([audius(`users/${id}`),audius(`users/${id}/tracks`,{limit:50}),audius(`users/${id}/albums`,{limit:12})]);
      return json({name:artist.name,description:artist.bio,artwork:artist.profile_picture?.['480x480'],tracks:tracks.map(normalize),albums:albums.map(p=>({id:p.id,name:p.playlist_name,isAlbum:true}))});
    }
    if (type === 'album') {
      const [albums,tracks] = await Promise.all([audius(`playlists/${id}`),audius(`playlists/${id}/tracks`)]);
      const album = Array.isArray(albums) ? albums[0] : albums;
      return json({name:album.playlist_name,description:album.description,artist:album.user?.name,tracks:tracks.map(normalize)});
    }
    const track = await audius(`tracks/${id}`);
    if (type === 'track') return json({track:normalize(track)});
    if (!playable(track)) return json({error:'This track is unavailable or requires provider authorization.'},403);
    // Revalidate authorization on each play; let the official stream endpoint enforce provider restrictions.
    const stream = new URL(`https://api.audius.co/v1/tracks/${id}/stream`);
    stream.searchParams.set('app_name','Aura');
    res.writeHead(302, {Location:stream.href,'Cache-Control':'no-store'});res.end();
  } catch (error) { json({error:error.message || 'Catalog connection failed. Please retry.'},error.status || 502); }
}
