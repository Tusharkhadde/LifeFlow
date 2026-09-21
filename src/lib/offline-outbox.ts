"use client";

const DB_NAME = "lifeflow-offline";
const STORE = "outbox";

export interface OutboxItem {
  id: string;
  type: "knowledge" | "task" | "expense" | "inbox";
  path: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
}

function openDb(): Promise<IDBDatabase> {
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

export async function enqueueOffline(
  type: OutboxItem["type"],
  path: string,
  payload: Record<string, unknown>
) {
  const db = await openDb();
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    type,
    path,
    payload,
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).add(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    };
    await syncRegistration.sync?.register("lifeflow-outbox").catch(() => {});
  }
  window.dispatchEvent(new Event("lifeflow-outbox"));
  return item;
}

export async function listOfflineItems(): Promise<OutboxItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function flushOfflineItems() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: "FLUSH_OUTBOX" });
}

export async function captureOrQueue(
  type: OutboxItem["type"],
  path: string,
  payload: Record<string, unknown>
) {
  if (!navigator.onLine) {
    await enqueueOffline(type, path, payload);
    return { queuedOffline: true };
  }
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Capture failed");
    return await response.json();
  } catch {
    await enqueueOffline(type, path, payload);
    return { queuedOffline: true };
  }
}
