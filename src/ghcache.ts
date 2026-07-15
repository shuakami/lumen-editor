/** 本地内容缓存：以 blob sha 为键（sha 即内容哈希，天然不失效），刷新后零请求恢复。 */

const DB_NAME = "lumen-gh-cache";
const STORE = "blobs";
const MAX_ENTRIES = 4000;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** 批量读取缓存（一次事务），返回命中的 sha → 内容。 */
export async function cacheGetMany(shas: string[]): Promise<Map<string, string>> {
  const db = await openDb();
  const out = new Map<string, string>();
  if (!db || shas.length === 0) return out;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      for (const sha of shas) {
        const req = store.get(sha);
        req.onsuccess = () => {
          if (typeof req.result === "string") out.set(sha, req.result);
        };
      }
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => resolve(out);
    } catch {
      resolve(out);
    }
  });
}

export async function cacheGet(sha: string): Promise<string | null> {
  const m = await cacheGetMany([sha]);
  return m.get(sha) ?? null;
}

let pending: Array<[string, string]> = [];
let flushTimer = 0;

/** 写入缓存（合并批量、空闲时写，不阻塞交互）。 */
export function cachePut(sha: string, content: string): void {
  if (content.length > 512 * 1024) return;
  pending.push([sha, content]);
  if (flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = 0;
    const batch = pending;
    pending = [];
    void (async () => {
      const db = await openDb();
      if (!db) return;
      try {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const [k, v] of batch) store.put(v, k);
        const countReq = store.count();
        countReq.onsuccess = () => {
          if (countReq.result > MAX_ENTRIES) {
            void openDb().then((d) => {
              if (!d) return;
              const clearTx = d.transaction(STORE, "readwrite");
              clearTx.objectStore(STORE).clear();
            });
          }
        };
      } catch {
        /* 缓存失败不影响功能 */
      }
    })();
  }, 300);
}
