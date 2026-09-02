const CACHE='the-bg-web-v1.2';
const STATIC_ASSETS=['/','/app.js','/style.css','/manifest.json'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(STATIC_ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys
          .filter(key=>key!==CACHE)
          .map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const url=new URL(event.request.url);

  // NEVER cache API responses.
  if(
    url.origin===self.location.origin &&
    url.pathname.startsWith('/api/')
  ) return;

  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(
          response.ok &&
          url.origin===self.location.origin
        ){
          const copy=response.clone();

          caches.open(CACHE)
            .then(cache=>cache.put(event.request,copy))
            .catch(()=>{});
        }

        return response;
      })
      .catch(()=>
        caches.match(event.request)
          .then(response=>
            response || caches.match('/')
          )
      )
  );
});
