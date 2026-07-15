/** 自学习预加载模型：极小的在线学习打分器（localStorage 持久化）。
 * 用户每次打开文件即为一次反馈：已预加载 = 猜对（hit），要转圈 = 猜错（miss）。
 * 权重按 精确路径 > 扩展名 > 顶层目录 学习，随时间衰减，始终保持轻量。 */

const KEY = "lumen.preload.brain";
const MAX_W = 40;
const DECAY = 0.995;

interface BrainState {
  w: Record<string, number>;
  hits: number;
  misses: number;
}

function load(): BrainState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<BrainState>;
      return { w: s.w ?? {}, hits: s.hits ?? 0, misses: s.misses ?? 0 };
    }
  } catch {
    /* 损坏则重置 */
  }
  return { w: {}, hits: 0, misses: 0 };
}

const state = load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 存储满时忽略 */
  }
}

function features(path: string): Array<{ key: string; lr: number }> {
  const lower = path.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  const top = lower.includes("/") ? lower.slice(0, lower.indexOf("/")) : "";
  const out: Array<{ key: string; lr: number }> = [{ key: `p:${lower}`, lr: 4 }];
  if (ext) out.push({ key: `e:${ext}`, lr: 1.5 });
  if (top) out.push({ key: `d:${top}`, lr: 1 });
  return out;
}

/** 文件的学习得分：越高越应该优先预加载。 */
export function brainScore(path: string): number {
  let s = 0;
  for (const f of features(path)) s += state.w[f.key] ?? 0;
  return s;
}

/** 用户真实打开文件时上报：wasLoaded=true 表示预加载猜对了。 */
export function brainRecordOpen(path: string, wasLoaded: boolean): void {
  if (wasLoaded) state.hits++;
  else state.misses++;
  for (const k of Object.keys(state.w)) {
    state.w[k] *= DECAY;
    if (Math.abs(state.w[k]) < 0.01) delete state.w[k];
  }
  const bonus = wasLoaded ? 1 : 2;
  for (const f of features(path)) {
    state.w[f.key] = Math.min(MAX_W, (state.w[f.key] ?? 0) + f.lr * bonus);
  }
  save();
}

/** 命中率统计，用于日志诊断。 */
export function brainStats(): { hits: number; misses: number; accuracy: number } {
  const total = state.hits + state.misses;
  return { hits: state.hits, misses: state.misses, accuracy: total === 0 ? 1 : state.hits / total };
}
