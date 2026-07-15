/** 自学习预加载模型 v2（纯前端、微秒级打分、localStorage 持久化）。
 *
 * 三个互补的信号源：
 * 1. 在线逻辑回归（SGD）：特征 = 扩展名 / 目录链 / 文件名词元 / 深度 / 大小桶，
 *    打开的文件作正样本、同目录未打开的文件作负样本，实时梯度更新。
 * 2. 马尔可夫转移链：学「打开 A 之后通常会开 B」，命中时把后继文件插队预加载。
 * 3. 指数衰减频率：每个路径的历史打开次数按半衰期约 3 天衰减，常开常新。
 *
 * 反馈：打开已预加载的文件 = 猜对（hit）；打开时要转圈 = 猜错（miss），
 * miss 的样本用双倍学习率纠偏。 */

const KEY = "lumen.preload.brain.v2";
const LR = 0.15;
const L2 = 0.0005;
const MAX_WEIGHTS = 600;
const MAX_PATHS = 200;
const MAX_SUCC = 8;
const HALF_LIFE_MS = 3 * 24 * 3600 * 1000;

interface PathStat {
  /** 衰减后的打开次数累计 */
  f: number;
  /** 上次打开时间戳 */
  t: number;
  /** 后继转移计数：打开本文件后接着打开的文件 */
  next: Record<string, number>;
}

interface BrainState {
  w: Record<string, number>;
  paths: Record<string, PathStat>;
  hits: number;
  misses: number;
}

function load(): BrainState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<BrainState>;
      return { w: s.w ?? {}, paths: s.paths ?? {}, hits: s.hits ?? 0, misses: s.misses ?? 0 };
    }
  } catch {
    /* 损坏则重置 */
  }
  return { w: {}, paths: {}, hits: 0, misses: 0 };
}

const state = load();
let lastOpened: string | null = null;
let saveTimer: number | undefined;

function scheduleSave(): void {
  if (saveTimer !== undefined) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    prune();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* 存储满时忽略 */
    }
  }, 500);
}

function prune(): void {
  const wKeys = Object.keys(state.w);
  if (wKeys.length > MAX_WEIGHTS) {
    wKeys
      .sort((a, b) => Math.abs(state.w[a]) - Math.abs(state.w[b]))
      .slice(0, wKeys.length - MAX_WEIGHTS)
      .forEach((k) => delete state.w[k]);
  }
  const pKeys = Object.keys(state.paths);
  if (pKeys.length > MAX_PATHS) {
    pKeys
      .sort((a, b) => state.paths[a].f - state.paths[b].f)
      .slice(0, pKeys.length - MAX_PATHS)
      .forEach((k) => delete state.paths[k]);
  }
}

/** 特征抽取：稀疏 one-hot，键即特征。 */
function features(path: string, size?: number): string[] {
  const lower = path.toLowerCase();
  const parts = lower.split("/");
  const name = parts[parts.length - 1];
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const out: string[] = ["bias"];
  if (ext) out.push(`ext:${ext}`);
  out.push(`depth:${Math.min(parts.length - 1, 4)}`);
  let dir = "";
  for (let i = 0; i < Math.min(parts.length - 1, 3); i++) {
    dir = dir ? `${dir}/${parts[i]}` : parts[i];
    out.push(`dir:${dir}`);
  }
  const stem = dot > 0 ? name.slice(0, dot) : name;
  for (const tok of stem.split(/[^a-z0-9\u4e00-\u9fff]+/).filter((t) => t.length >= 2).slice(0, 4)) {
    out.push(`tok:${tok.replace(/\d+$/, "#")}`);
  }
  if (size !== undefined && size > 0) out.push(`size:${Math.min(Math.floor(Math.log2(size / 256 + 1)), 8)}`);
  return out;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function predict(feats: string[]): number {
  let z = 0;
  for (const f of feats) z += state.w[f] ?? 0;
  return sigmoid(z);
}

function sgd(feats: string[], label: number, lr: number): void {
  const g = predict(feats) - label;
  for (const f of feats) {
    const w = state.w[f] ?? 0;
    state.w[f] = w - lr * g - lr * L2 * w;
  }
}

function decayedFreq(p: PathStat, now: number): number {
  return p.f * Math.pow(0.5, (now - p.t) / HALF_LIFE_MS);
}

/** 综合得分：逻辑回归概率 + 衰减频率 + 马尔可夫后继，越高越先预加载。 */
export function brainScore(path: string, size?: number): number {
  const now = Date.now();
  let s = predict(features(path, size)) * 6;
  const p = state.paths[path.toLowerCase()];
  if (p) s += Math.min(decayedFreq(p, now), 10) * 2;
  if (lastOpened) {
    const prev = state.paths[lastOpened];
    const n = prev?.next[path.toLowerCase()];
    if (n) s += Math.min(n, 6) * 1.5;
  }
  return s;
}

/** 用户真实打开文件时上报。negatives 传同目录里没被打开的路径用作负样本。 */
export function brainRecordOpen(path: string, wasLoaded: boolean, negatives: string[] = []): void {
  const lower = path.toLowerCase();
  const now = Date.now();
  if (wasLoaded) state.hits++;
  else state.misses++;

  sgd(features(path), 1, wasLoaded ? LR : LR * 2);
  for (const n of negatives.slice(0, 3)) {
    if (n.toLowerCase() !== lower) sgd(features(n), 0, LR * 0.3);
  }

  const p = state.paths[lower] ?? { f: 0, t: now, next: {} };
  p.f = decayedFreq(p, now) + 1;
  p.t = now;
  state.paths[lower] = p;

  if (lastOpened && lastOpened !== lower) {
    const prev = state.paths[lastOpened];
    if (prev) {
      prev.next[lower] = (prev.next[lower] ?? 0) + 1;
      const keys = Object.keys(prev.next);
      if (keys.length > MAX_SUCC) {
        keys.sort((a, b) => prev.next[a] - prev.next[b]).slice(0, keys.length - MAX_SUCC).forEach((k) => delete prev.next[k]);
      }
    }
  }
  lastOpened = lower;
  scheduleSave();
}

/** 打开某文件后最可能接着打开的文件，用于立即插队预加载。 */
export function brainSuccessors(path: string): string[] {
  const p = state.paths[path.toLowerCase()];
  if (!p) return [];
  return Object.entries(p.next)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/** 命中率统计，用于日志诊断。 */
export function brainStats(): { hits: number; misses: number; accuracy: number } {
  const total = state.hits + state.misses;
  return { hits: state.hits, misses: state.misses, accuracy: total === 0 ? 1 : state.hits / total };
}
