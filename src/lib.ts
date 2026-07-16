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

export * from "./entries/editor";
export * from "./entries/github";
export * from "./entries/sync";
export * from "./entries/preload";
