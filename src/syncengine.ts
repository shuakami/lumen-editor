/**
 * GitHub 超级同步引擎 —— 参考 Linear Sync Engine（LSE）的架构：
 *
 * - **lastSyncId ↔ head commit sha**：分支 head 作为全库版本号，客户端据此判断是否落后。
 * - **本地引导（local bootstrap）**：树快照 + 元数据持久化在 IndexedDB，重新打开时先从本地
 *   秒开，再与远端做增量同步，而不是每次全量拉取。
 * - **delta packets**：通过 compare API 拿到 base...head 的文件级 sync actions（I/U/D/R），
 *   逐条应用到本地库与内存模型。
 * - **事务队列（TransactionQueue）**：本地提交封装为事务，先写入 IndexedDB 的
 *   __transactions 表缓存，串行发送；断网/关闭页面不丢失，恢复连接后自动重放。
 * - **last-writer-wins + rebase**：提交遇到远端更新时三方合并，冲突行以本地为准。
 */

import {
  commitFile,
  compareCommits,
  getHeadSha,
  type CommitResult,
  type GhEntry,
  type GhFileDelta,
  type GhRepoRef,
} from "./github";

const DB_NAME = "lumen-sync";
const META_STORE = "meta";
const TX_STORE = "transactions";
const DRAFT_STORE = "drafts";

export function repoKey(ref: GhRepoRef): string {
  return `${ref.owner}/${ref.repo}@${ref.branch}`;
}

export interface RepoSnapshot {
  key: string;
  headSha: string;
  entries: GhEntry[];
  updatedAt: number;
}

export interface CommitTransaction {
  id: string;
  repoKey: string;
  path: string;
  baseSha?: string;
  baseContent: string;
  content: string;
  message: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        if (!db.objectStoreNames.contains(TX_STORE)) db.createObjectStore(TX_STORE);
        if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idbGet<T>(store: string, key: string): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = db.transaction(store, "readonly").objectStore(store).get(key);
          req.onsuccess = () => resolve((req.result as T) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

function idbPut(store: string, key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) return resolve();
        try {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      })
  );
}

function idbDelete(store: string, key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) return resolve();
        try {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      })
  );
}

function idbGetAll<T>(store: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve) => {
        if (!db) return resolve([]);
        try {
          const req = db.transaction(store, "readonly").objectStore(store).getAll();
          req.onsuccess = () => resolve((req.result as T[]) ?? []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      })
  );
}

/** 未提交的编辑草稿：输入即持久化，刷新/断电不丢。 */
export interface Draft {
  key: string;
  repoKey: string;
  path: string;
  content: string;
  savedAt: number;
}

export function draftKey(repo: string, path: string): string {
  return `${repo}:${path}`;
}

export function saveDraft(draft: Draft): Promise<void> {
  return idbPut(DRAFT_STORE, draft.key, draft);
}

export function deleteDraft(key: string): Promise<void> {
  return idbDelete(DRAFT_STORE, key);
}

export function loadDrafts(repo: string): Promise<Draft[]> {
  return idbGetAll<Draft>(DRAFT_STORE).then((all) => all.filter((d) => d.repoKey === repo));
}

/** 本地引导：从 IndexedDB 读取仓库树快照，秒开无网络。 */
export function loadSnapshot(key: string): Promise<RepoSnapshot | null> {
  return idbGet<RepoSnapshot>(META_STORE, key);
}

export function saveSnapshot(snap: RepoSnapshot): Promise<void> {
  return idbPut(META_STORE, snap.key, snap);
}

export type SyncState = "synced" | "syncing" | "pending" | "offline";

export interface SyncEvents {
  onDeltas: (deltas: GhFileDelta[], newHeadSha: string) => void;
  onTransactionDone: (tx: CommitTransaction, result: CommitResult) => void;
  onTransactionError: (tx: CommitTransaction, error: Error, willRetry: boolean) => void;
  onState: (state: SyncState, pendingCount: number) => void;
  onInfo: (text: string) => void;
}

/**
 * 同步引擎：增量拉取（delta packets）+ 持久化事务队列（transactions）。
 */
export class SyncEngine {
  private timer = 0;
  private stopped = false;
  private headSha: string;
  private queue: CommitTransaction[] = [];
  private flushing = false;
  private polling = false;
  private onlineHandler = () => {
    this.emitState();
    void this.flush();
    void this.pollOnce();
  };

  constructor(
    private ref: GhRepoRef,
    headSha: string,
    private events: SyncEvents,
    private intervalMs = 5000
  ) {
    this.headSha = headSha;
    window.addEventListener("online", this.onlineHandler);
  }

  get key(): string {
    return repoKey(this.ref);
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  /** 引导时重放缓存事务（对应 LSE 的 loadPersistedTransactions）。 */
  async start(): Promise<void> {
    const all = await idbGetAll<CommitTransaction>(TX_STORE);
    this.queue = all.filter((t) => t.repoKey === this.key).sort((a, b) => a.createdAt - b.createdAt);
    if (this.queue.length > 0) {
      this.events.onInfo(`同步引擎：发现 ${this.queue.length} 个未完成的提交事务，正在重放…`);
      void this.flush();
    }
    this.emitState();
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    window.removeEventListener("online", this.onlineHandler);
  }

  /** 入队一个提交事务：先持久化再执行，离线也不丢。 */
  async enqueue(tx: Omit<CommitTransaction, "id" | "repoKey" | "createdAt">): Promise<void> {
    const full: CommitTransaction = {
      ...tx,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      repoKey: this.key,
      createdAt: Date.now(),
    };
    // 同一文件的旧事务被新事务覆盖（同 LSE 的 batch 合并语义）
    const stale = this.queue.filter((t) => t.path === full.path);
    for (const s of stale) void idbDelete(TX_STORE, s.id);
    this.queue = [...this.queue.filter((t) => t.path !== full.path), full];
    await idbPut(TX_STORE, full.id, full);
    this.emitState();
    void this.flush();
  }

  hasPendingFor(path: string): boolean {
    return this.queue.some((t) => t.path === path);
  }

  /** 串行执行事务队列（对应 LSE 的 executingTransactions）。 */
  private async flush(): Promise<void> {
    if (this.flushing || this.stopped) return;
    this.flushing = true;
    this.emitState();
    while (this.queue.length > 0 && !this.stopped) {
      if (!navigator.onLine) break;
      const tx = this.queue[0];
      try {
        const r = await commitFile(this.ref, tx.path, tx.content, tx.baseSha, tx.baseContent, tx.message);
        this.queue.shift();
        await idbDelete(TX_STORE, tx.id);
        this.events.onTransactionDone(tx, r);
      } catch (e) {
        const err = e as Error & { status?: number };
        const permanent = err.status === 401 || err.status === 403 || err.status === 404 || err.status === 422;
        if (permanent) {
          this.queue.shift();
          await idbDelete(TX_STORE, tx.id);
          this.events.onTransactionError(tx, err, false);
        } else {
          this.events.onTransactionError(tx, err, true);
          break; // 网络类错误：保留事务，等待下次机会
        }
      }
    }
    this.flushing = false;
    this.emitState();
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = window.setTimeout(() => {
      void this.pollOnce().finally(() => this.schedule());
    }, this.intervalMs);
  }

  /** 拉取增量：head 变化时应用 delta packets 并推进本地版本号。 */
  async pollOnce(): Promise<void> {
    if (this.stopped || this.polling || !navigator.onLine) return;
    this.polling = true;
    try {
      const remote = await getHeadSha(this.ref);
      if (remote !== this.headSha) {
        const deltas = await compareCommits(this.ref, this.headSha, remote);
        const base = this.headSha;
        this.headSha = remote;
        this.events.onDeltas(deltas, remote);
        this.events.onInfo(`同步引擎：${base.slice(0, 7)} → ${remote.slice(0, 7)}，${deltas.length} 个文件变更`);
      }
    } catch {
      /* 轮询失败静默，下轮重试 */
    } finally {
      this.polling = false;
      if (this.queue.length > 0) void this.flush();
      this.emitState();
    }
  }

  advanceHead(sha: string): void {
    this.headSha = sha;
  }

  get head(): string {
    return this.headSha;
  }

  private emitState(): void {
    const state: SyncState = !navigator.onLine
      ? "offline"
      : this.flushing
        ? "syncing"
        : this.queue.length > 0
          ? "pending"
          : "synced";
    this.events.onState(state, this.queue.length);
  }
}
