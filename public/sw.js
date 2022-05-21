
const cacheName = 'mainCache';
const version = '1.0.4';

self.addEventListener("install", async (e) => {
    e.waitUntil(
        caches.open(cacheName).then(async (cache) => {
            let keys = await cache.keys();
            keys.forEach(function(item) {
                caches.delete(item);
            })
            return cache
        }).then((cache) => {
            cache.addAll([
                '/',
                '/favicon.png'
            ]);
        }).then(() =>{
            self.skipWaiting();
        })
    );
});

self.addEventListener("message", async (e) => {
    if(typeof e.data.cachePosts !== "undefined") {
        const cache = await caches.open(cacheName);
        if(typeof e.data.recache !== "undefined" && typeof e.data.recache.url !== "undefined") {
            e.data.cachePosts.push(e.data.recache.url);
        }
        e.data.cachePosts.forEach(async function(item) {
            //console.log(`${item} Added to Offline Mode`);
            return cache.add(item);
        })
    }
})
self.addEventListener('fetch', async function(e) {
    if(e.request.method === "GET" && e.request.url.startsWith(self.location.origin)) {
        e.respondWith(
            caches.match(e.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return caches.open(cacheName).then(async (cache) => {
                    const newRequest = new Request(e.request, {
                        mode: 'cors',
                        credentials: 'omit',
                        headers: {
                            'x-service': true
                        }
                    })
                    return fetch(newRequest).then(response => {
                        // Put a copy of the response in the runtime cache.
                        return cache.put(e.request, response.clone()).then(() => {
                            return response;
                        });
                    });
                });
            })
        )
        }
});
self.addEventListener('activate', function(event) {
    self.clients.matchAll({
        includeUncontrolled: true
    }).then(function(clientList) {
        var urls = clientList.map(function(client) {
            return client.url;
        });
        console.log('[ServiceWorker] Matching clients:', urls.join(', '));
    });
    
    self.clients.claim();
});