/** 预加载调度器：优先级队列 + 并发抓取 + 悬停插队，配合 sha 内容缓存做到点开零等待。 */

import { fetchBlob, type GhRepoRef } from "./github";
import { cachePut } from "./ghcache";

export interface PreloadTarget {
  path: string;
  sha: string;
  size: number;
}

/** 初始优先级：README / 根目录 / src 优先，浅目录、小文件优先。 */
export function preloadScore(t: PreloadTarget): number {
  const lower = t.path.toLowerCase();
  const depth = lower.split("/").length - 1;
  let s = t.size / 1024 + depth * 24;
  if (/(^|\/)readme(\.|$)/.test(lower)) s -= 1000;
  if (depth === 0) s -= 120;
  if (/^(src|lib|app|source|include)\//.test(lower)) s -= 60;
  if (/(^|\/)(package\.json|cargo\.toml|pyproject\.toml|go\.mod|makefile|cmakelists\.txt)$/.test(lower)) s -= 200;
  return s;
}

export class Preloader {
  private queue: PreloadTarget[] = [];
  private active = 0;
  private stopped = false;

  constructor(
    private ref: GhRepoRef,
    private concurrency: number,
    private isDone: (path: string) => boolean,
    private onText: (path: string, sha: string, text: string) => void
  ) {}

  start(targets: PreloadTarget[]): void {
    this.queue = [...targets].sort((a, b) => preloadScore(a) - preloadScore(b));
    this.pump();
  }

  /** 悬停/展开目录时插队到最前，最先抓取。 */
  boost(paths: string[]): void {
    if (this.stopped || paths.length === 0) return;
    const want = new Set(paths);
    const front: PreloadTarget[] = [];
    const rest: PreloadTarget[] = [];
    for (const t of this.queue) (want.has(t.path) ? front : rest).push(t);
    if (front.length === 0) return;
    this.queue = [...front, ...rest];
    this.pump();
  }

  stop(): void {
    this.stopped = true;
    this.queue = [];
  }

  private pump(): void {
    while (!this.stopped && this.active < this.concurrency) {
      let next: PreloadTarget | undefined;
      while ((next = this.queue.shift())) {
        if (!this.isDone(next.path)) break;
      }
      if (!next) return;
      this.active++;
      const t = next;
      void fetchBlob(this.ref, t.sha)
        .then((text) => {
          if (this.stopped || this.isDone(t.path)) return;
          cachePut(t.sha, text);
          this.onText(t.path, t.sha, text);
        })
        .catch(() => {
          /* 预取失败忽略，打开时再拉 */
        })
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}
