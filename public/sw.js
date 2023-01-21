
const cacheName = 'mainCache';
const version = '1.0.5';

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
        e.data.cachePosts.forEach(async function(item) {
            let matchCache = await cache.match(item);
            if(matchCache === undefined) {
                console.log(`${item} Added to Offline Mode`);
                return cache.add(item);
            }
        })
    }
})

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