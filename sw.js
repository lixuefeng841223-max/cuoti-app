// 错题管家 PWA Service Worker
// v2：首页改为「网络优先」，应用更新发布后刷新即可拿到新版，无需手动清缓存
const CACHE_NAME = 'cuoti-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isPageReq(req){
  return req.mode === 'navigate' || /\/index\.html$/.test(new URL(req.url).pathname);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  // 只处理同源 GET，其它直接走网络
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 页面/首页：网络优先，失败才用缓存 —— 保证更新能及时生效
  if (isPageReq(req)) {
    e.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() =>
        caches.match(req).then(c => c || caches.match('./index.html'))
      )
    );
    return;
  }

  // 其它静态资源：缓存优先（图标等基本不变）
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (!resp || resp.status !== 200 || req.url.includes('/.well-known/')) return resp;
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return resp;
      }).catch(() => cached);
    })
  );
});
