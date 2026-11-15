import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { catalogRoute } from './catalog-api.mjs';
import {youtubeSearch,youtubeDetail,providerStatus} from './youtube-api.mjs';
import {ytmusic} from './ytmusic-bridge.mjs';
if(process.env.YTMUSIC_ENABLED!=='false')await ytmusic.start();
import {execFileSync} from 'node:child_process';
let revision=process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'unknown';
if(revision==='unknown')try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:rootDirectory(),encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
function rootDirectory(){return fileURLToPath(new URL('.',import.meta.url));}
const root = fileURLToPath(new URL('.', import.meta.url));
const files = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/style.css', 'style.css']]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
for(const name of ['providers.js','playback.js','sw.js','manifest.webmanifest','icon.svg'])files.set('/'+name,name);
Object.assign(types,{'.webmanifest':'application/manifest+json','.svg':'image/svg+xml'});
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Aura-Revision',revision);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if(url.pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({app:'Aura',revision,backend:true}));return;}
  if(url.pathname==='/api/providers'){if(process.env.YTMUSIC_ENABLED!=='false'&&ytmusic.configured&&!ytmusic.available)await ytmusic.start();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({providers:providerStatus()}));return;}
  if(url.pathname==='/api/youtube/search'){
    try{const result=await youtubeSearch((url.searchParams.get('q')||'').trim().slice(0,160));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}
    catch(e){res.writeHead(e.status||502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;
  }
  const youtubeMatch=url.pathname.match(/^\/api\/youtube\/(artist|album|playlist)\/([A-Za-z0-9_-]{1,160})$/);
  if(youtubeMatch){try{const data=await youtubeDetail(youtubeMatch[1],youtubeMatch[2]);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}catch(error){res.writeHead(error.status||502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}return;}
  if (url.pathname.startsWith('/api/')) return catalogRoute(url, res);
  const file = files.get(url.pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try { const body=await readFile(path.join(root,file));res.writeHead(200, { 'Content-Type': `${types[path.extname(file)]}; charset=utf-8`,'Cache-Control':'no-cache, must-revalidate',...(file==='sw.js'?{'Service-Worker-Allowed':'/'}:{}) }); res.end(body); }
  catch { res.writeHead(500); res.end('Unable to load application'); }
}).listen(Number(process.env.PORT) || 5173, process.env.HOST || (process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1'), () => console.log(`Aura: http://localhost:${process.env.PORT || 5173} · ${revision.slice(0,7)}`));
