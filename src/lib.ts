/**
 * Lumen —— 可复用库入口（超级库）。
 *
 * 按需引入四大块能力：
 *
 * 1. 编辑器组件：`Editor`（CodeMirror 6 封装，多文件文档缓存/光标恢复/查找面板）、
 *    `HyperEditor`（千万行虚拟滚动编辑器）、`Loader`。
 * 2. GitHub 接入层：`openRepo` / `fetchBlob` / `listCommits` / `commitFile`（自动三方合并）等
 *    无依赖纯函数 API。
 * 3. 同步引擎：`SyncEngine`（增量 delta 轮询 + 持久化事务队列 + 冲突挂起），
 *    IndexedDB 草稿/快照/本地编辑历史。
 * 4. 智能预加载：`Preloader` + 行为学习模型（brain*）。
 *
 * ```tsx
 * import { Editor, openRepo, SyncEngine } from "lumenedit";
 * ```
 */

// ── 编辑器组件 ──────────────────────────────────────────────
export {
  Editor,
  getCachedDoc,
  setCachedDoc,
  revealLine,
  openFindPanel,
  openGotoLine,
  type CursorInfo,
} from "./Editor";
export { HyperEditor, HYPER_COUNT } from "./HyperEditor";
export { Loader } from "./Loader";

// ── 编辑器底层（自定义扩展时使用）────────────────────────────
export { editorSetup } from "./editor/setup";
export { editorTheme } from "./editor/theme";
export { languageFor } from "./editor/languages";
export { applyCodeScale } from "./editor/scale";
export { isRunnable, runCode, runCommandLabel } from "./editor/run";

// ── GitHub 接入层 ───────────────────────────────────────────
export {
  parseRepoInput,
  openRepo,
  getHeadSha,
  compareCommits,
  listBranches,
  listCommits,
  fetchBlob,
  fetchBlobB64,
  fetchFileAtCommit,
  b64ToBytes,
  searchCode,
  commitFile,
  type GhRepoRef,
  type GhEntry,
  type GhTree,
  type GhFileDelta,
  type GhBranch,
  type GhCommit,
  type GhCodeHit,
  type CommitResult,
} from "./github";

// ── 同步引擎 + 本地持久化 ───────────────────────────────────
export {
  SyncEngine,
  repoKey,
  loadSnapshot,
  saveSnapshot,
  saveDraft,
  deleteDraft,
  loadDrafts,
  draftKey,
  recordLocalVersion,
  loadLocalHistory,
  type RepoSnapshot,
  type CommitTransaction,
  type Draft,
  type LocalVersion,
  type SyncState,
  type SyncEvents,
} from "./syncengine";
export { cacheGet, cacheGetMany, cachePut } from "./ghcache";

// ── 智能预加载 ──────────────────────────────────────────────
export { Preloader, type PreloadTarget } from "./preload";
export { brainScore, brainRecordOpen, brainStats, brainSuccessors } from "./preload-brain";
