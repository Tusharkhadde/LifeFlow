const CACHE = "lifeflow-shell-v1";
const SHELL = ["/offline", "/manifest.json"];
const DB_NAME = "lifeflow-offline";
const STORE = "outbox";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached || caches.match("/offline");
    })
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "lifeflow-outbox") event.waitUntil(flushOutbox());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_OUTBOX") event.waitUntil(flushOutbox());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function allItems(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function removeItem(db, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function updateItem(db, item) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function flushOutbox() {
  const db = await openDb();
  const items = await allItems(db);
  for (const item of items) {
    try {
      const response = await fetch(item.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(item.payload),
      });
      if (response.ok || response.status === 409) await removeItem(db, item.id);
      else await updateItem(db, { ...item, retries: (item.retries || 0) + 1 });
    } catch {
      await updateItem(db, { ...item, retries: (item.retries || 0) + 1 });
      break;
    }
  }
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "OUTBOX_UPDATED" });
}
