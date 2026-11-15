const VERSION='aura-shell-v1';
const ASSETS=['/','/index.html','/style.css','/app.js','/providers.js','/playback.js','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('aura-shell-')&&k!==VERSION).map(k=>caches.delete(k)))));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Explicit static allowlist: no API metadata, streams, artwork, or third-party content.
  if(event.request.method!=='GET'||url.origin!==location.origin||!ASSETS.includes(url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request)));
});
