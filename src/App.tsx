import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Editor, getCachedDoc, setCachedDoc, revealLine, openFindPanel, openGotoLine, type CursorInfo } from "./Editor";
import { setWorkspaceFiles } from "./editor/imports";
import { HyperEditor, HYPER_COUNT } from "./HyperEditor";
import { SAMPLE_FILES, type SampleFile } from "./samples";
import { languageFor } from "./editor/languages";
import { applyCodeScale } from "./editor/scale";
import { isRunnable, runCode, runCommandLabel } from "./editor/run";
import { openRepo, parseRepoInput, fetchBlob, fetchBlobB64, b64ToBytes, listBranches, listCommits, fetchFileAtCommit, searchCode, type GhTree, type GhBranch, type GhFileDelta, type GhCodeHit, type GhCommit } from "./github";
import { SyncEngine, loadSnapshot, saveSnapshot, repoKey, saveDraft, deleteDraft, loadDrafts, draftKey, recordLocalVersion, loadLocalHistory, type LocalVersion, type SyncState } from "./syncengine";
import { cacheGet, cacheGetMany, cachePut } from "./ghcache";
import { Preloader, type PreloadTarget } from "./preload";
import { brainScore, brainRecordOpen, brainStats, brainSuccessors } from "./preload-brain";
import { Loader } from "./Loader";
import colorModeIcon from "./assets/codicons/color-mode.svg";
import searchIcon from "./assets/codicons/search.svg";
import arrowRightIcon from "./assets/codicons/arrow-right.svg";
import newFileIcon from "./assets/codicons/new-file.svg";
import newFolderIcon from "./assets/codicons/new-folder.svg";
import refreshIcon from "./assets/codicons/refresh.svg";
import collapseAllIcon from "./assets/codicons/collapse-all.svg";
import playIcon from "./assets/codicons/play.svg";
import splitIcon from "./assets/codicons/split-horizontal.svg";
import trashIcon from "./assets/codicons/trash.svg";
import copyIcon from "./assets/codicons/copy.svg";
import closeIcon from "./assets/codicons/close.svg";
import checkIcon from "./assets/codicons/check.svg";
import addIcon from "./assets/codicons/add.svg";
import ellipsisIcon from "./assets/codicons/ellipsis.svg";
import pwshIcon from "./assets/codicons/terminal-powershell.svg";
import layoutPanelIcon from "./assets/codicons/layout-panel.svg";
import openPreviewIcon from "./assets/codicons/open-preview.svg";
import logoGlyph from "./assets/logo-glyph.png";
import layoutPanelOffIcon from "./assets/codicons/layout-panel-off.svg";
import cloudUploadIcon from "./assets/codicons/cloud-upload.svg";
import gitBranchIcon from "./assets/codicons/git-branch.svg";
import repoIcon from "./assets/codicons/repo.svg";
import historyIcon from "./assets/codicons/history.svg";
interface Command {
  id: string;
  label: string;
  hint?: string;
  fileIcon?: string;
  icon?: string;
  group?: string;
  loc?: string;
  snippet?: string;
  run: () => void;
}

type MarkdownRenderer = (source: string) => string;

let markdownRendererPromise: Promise<MarkdownRenderer> | null = null;

function loadMarkdownRenderer(): Promise<MarkdownRenderer> {
  if (!markdownRendererPromise) {
    markdownRendererPromise = Promise.all([import("marked"), import("dompurify")])
      .then(([{ marked }, { default: DOMPurify }]) =>
        (source: string) => DOMPurify.sanitize(marked.parse(source, { async: false }) as string)
      )
      .catch((error: unknown) => {
        markdownRendererPromise = null;
        throw error;
      });
  }
  return markdownRendererPromise;
}

function highlightMatch(text: string, q: string): React.ReactNode {
  const needle = q.trim().toLowerCase();
  if (!needle) return text;
  const idx = text.toLowerCase().indexOf(needle);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + needle.length)}</mark>
      {text.slice(idx + needle.length)}
    </>
  );
}
interface Renaming {
  kind: "file" | "folder";
  id: string;
  isNew: boolean;
}
 
interface CtxItem {
  label?: string;
  hint?: string;
  danger?: boolean;
  sep?: boolean;
  checked?: boolean;
  run?: () => void;
}
 
interface ConsoleLine {
  kind: "cmd" | "out" | "err" | "info";
  text: string;
  ok?: boolean;
}
 
interface CtxMenu {
  x: number;
  y: number;
  items: CtxItem[];
}

interface SearchHit {
  fileId: string;
  name: string;
  dir?: string;
  line: number;
  text: string;
  start: number;
  end: number;
}

interface DirNode {
  name: string;
  path: string;
  dirs: DirNode[];
  files: SampleFile[];
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "ico", "webp", "bmp", "avif"]);
interface TrailingTask {
  timer: number;
  deadline: number;
}

function scheduleTrailing(
  tasks: Map<string, TrailingTask>,
  key: string,
  delay: number,
  run: (key: string) => void
): void {
  const deadline = Date.now() + delay;
  const current = tasks.get(key);
  if (current) {
    current.deadline = deadline;
    return;
  }
  const task: TrailingTask = { timer: 0, deadline };
  const flush = () => {
    const remaining = task.deadline - Date.now();
    if (remaining > 0) {
      task.timer = window.setTimeout(flush, remaining);
      return;
    }
    tasks.delete(key);
    run(key);
  };
  task.timer = window.setTimeout(flush, delay);
  tasks.set(key, task);
}

function cancelTrailing(tasks: Map<string, TrailingTask>): void {
  for (const task of tasks.values()) window.clearTimeout(task.timer);
  tasks.clear();
}

/** 无法作为文本编辑的二进制文件：编辑器区显示占位 + 下载按钮 */
const BINARY_EXTS = new Set([
  "exe", "dll", "so", "dylib", "bin", "o", "a", "lib", "obj", "class", "wasm", "pdb",
  "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "jar", "apk", "ipa", "deb", "rpm", "dmg", "iso", "msi",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "mp3", "mp4", "wav", "ogg", "flac", "avi", "mov", "mkv", "webm",
  "ttf", "otf", "woff", "woff2", "eot",
  "db", "sqlite", "sqlite3", "dat", "pak", "psd", "blend",
]);
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
const IMAGE_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  ico: "image/x-icon", webp: "image/webp", bmp: "image/bmp", avif: "image/avif",
};
function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}
function ancestorDirs(dir: string): string[] {
  const out: string[] = [];
  let d = dir;
  while (d) {
    out.push(d);
    const i = d.lastIndexOf("/");
    d = i < 0 ? "" : d.slice(0, i);
  }
  return out;
}
 
const HAS_SAVED_REPO = localStorage.getItem("lumen.gh.repo") !== null;

/** 最近打开的仓库（本地记录，最多 8 个） */
interface RecentRepo {
  repo: string;
  branch: string;
  at: number;
}
const RECENTS_KEY = "lumen.recent.repos";
function loadRecents(): RecentRepo[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as RecentRepo[];
    return Array.isArray(list) ? list.filter((r) => typeof r?.repo === "string") : [];
  } catch {
    return [];
  }
}
function pushRecent(repo: string, branch: string): RecentRepo[] {
  const list = loadRecents().filter((r) => !(r.repo === repo && r.branch === branch));
  list.unshift({ repo, branch, at: Date.now() });
  const out = list.slice(0, 8);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(out));
  return out;
}

interface CursorStore {
  getSnapshot: () => CursorInfo;
  subscribe: (listener: () => void) => () => void;
  set: (cursor: CursorInfo) => void;
}

function createCursorStore(): CursorStore {
  let current: CursorInfo = { line: 1, col: 1, length: 0, selections: 1 };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      if (next.line === current.line && next.col === current.col && next.length === current.length && next.selections === current.selections) return;
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

function CursorPosition({ store, locale = false }: { store: CursorStore; locale?: boolean }) {
  const cursor = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <span className="status-item">行 {locale ? cursor.line.toLocaleString() : cursor.line}，列 {cursor.col}</span>;
}

function relTime(iso: string): string {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return "刚刚";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`;
  if (d < 30 * 86_400_000) return `${Math.floor(d / 86_400_000)} 天前`;
  return new Date(iso).toLocaleDateString();
}

export default function App() {
  const [openIds, setOpenIds] = useState<string[]>(HAS_SAVED_REPO ? [] : ["program", "hyper"]);
  const [activeId, setActiveId] = useState(HAS_SAVED_REPO ? "" : "program");
  const cursorStoreRef = useRef<CursorStore | null>(null);
  cursorStoreRef.current ??= createCursorStore();
  const cursorStore = cursorStoreRef.current;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hlIndex, setHlIndex] = useState(0);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [dark, setDark] = useState(false);
  const [files, setFiles] = useState<SampleFile[]>(HAS_SAVED_REPO ? [] : SAMPLE_FILES);
  const [ghRestoring, setGhRestoring] = useState(HAS_SAVED_REPO);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [treeOpen, setTreeOpen] = useState(true);
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const [renameText, setRenameText] = useState("");
  const [menu, setMenu] = useState<CtxMenu | null>(null);
  const [autoSave, setAutoSave] = useState(true);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleTab, setConsoleTab] = useState<"problems" | "output" | "logs" | "terminal" | "ports">("terminal");
  const [logLines, setLogLines] = useState<ConsoleLine[]>([]);
  const [consoleHeight, setConsoleHeight] = useState(260);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem("lumen.sidebar.width"));
    return saved >= 140 && saved <= 600 ? saved : 216;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [running, setRunning] = useState(false);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const dragTabId = useRef<string | null>(null);
  const [dropZone, setDropZone] = useState<null | "main-right" | "main-full" | "split-full">(null);
  const [openMenubar, setOpenMenubar] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutClosing, setAboutClosing] = useState(false);
  const closeAbout = useCallback(() => {
    setAboutClosing(true);
    window.setTimeout(() => {
      setAboutOpen(false);
      setAboutClosing(false);
    }, 180);
  }, []);
  const [ghOpen, setGhOpen] = useState(false);
  const [ghStep, setGhStep] = useState(0);
  const [ghRepoInput, setGhRepoInput] = useState("");
  const [ghTokenInput, setGhTokenInput] = useState(() => localStorage.getItem("lumen.gh.token") ?? "");
  const [ghBranchInput, setGhBranchInput] = useState("");
  const [ghBusy, setGhBusy] = useState(false);
  const [ghError, setGhError] = useState("");
  const [ghTree, setGhTree] = useState<GhTree | null>(null);
  const ghMeta = useRef(new Map<string, { path: string; sha: string; baseContent: string; loaded: boolean }>());
  const [ghLoadingId, setGhLoadingId] = useState<string | null>(null);
  const ghInflight = useRef(new Set<string>());
  const [ghLoadedTick, setGhLoadedTick] = useState(0);
  const [commitError, setCommitError] = useState("");
  const [mdPreviewIds, setMdPreviewIds] = useState<Set<string>>(new Set());
  const [markdownRenderer, setMarkdownRenderer] = useState<MarkdownRenderer | null>(null);
  const preloader = useRef<Preloader | null>(null);
  const [ghImages, setGhImages] = useState<Map<string, string>>(new Map());
  const [ghBins, setGhBins] = useState<Map<string, { url: string; size: number }>>(new Map());
  const [commitFor, setCommitFor] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const engine = useRef<SyncEngine | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ state: SyncState; pending: number }>({ state: "synced", pending: 0 });
  const [branches, setBranches] = useState<GhBranch[] | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [recents, setRecents] = useState<RecentRepo[]>(loadRecents);
  // 提交历史（path 为空 = 分支提交树；有 path = 单文件修改历史）
  const [historyFor, setHistoryFor] = useState<null | { path?: string }>(null);
  const [historyList, setHistoryList] = useState<GhCommit[] | null>(null);
  const [historyEnd, setHistoryEnd] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPreview, setHistoryPreview] = useState<null | { sha: string; content: string | null }>(null);
  const [historyLocal, setHistoryLocal] = useState<LocalVersion[] | null>(null);
  const historyCache = useRef(new Map<string, { list: GhCommit[]; end: boolean }>());
  const historyBlobCache = useRef(new Map<string, string>());
  const localSnapAt = useRef(new Map<string, number>());
  const handleDeltasRef = useRef<(deltas: GhFileDelta[], newHead: string) => void>(() => {});
  const untitledCount = useRef(0);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const consoleEndRef = useRef<HTMLDivElement>(null);
 
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = dark ? "dark" : "light";
    const t = window.setTimeout(() => root.classList.remove("theme-switching"), 300);
    return () => window.clearTimeout(t);
  }, [dark]);
 
  useEffect(() => {
    applyCodeScale();
    window.addEventListener("resize", applyCodeScale);
    return () => window.removeEventListener("resize", applyCodeScale);
  }, []);
 
  const filesById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);
  useEffect(() => {
    setWorkspaceFiles(files.map((f) => (f.dir ? `${f.dir}/${f.name}` : f.name)));
  }, [files]);
  const active = openIds.includes(activeId) ? filesById.get(activeId) : undefined;
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    paletteRef.current?.querySelector(".palette-item.hl")?.scrollIntoView({ block: "nearest" });
  }, [hlIndex]);
 
  const dirs = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) if (f.dir) for (const d of ancestorDirs(f.dir)) set.add(d);
    for (const d of extraFolders) set.add(d);
    return [...set].sort();
  }, [files, extraFolders]);

  const ghRoot = useMemo(() => {
    if (!ghTree) return null;
    const root: DirNode = { name: "", path: "", dirs: [], files: [] };
    const map = new Map<string, DirNode>([["", root]]);
    const getDir = (path: string): DirNode => {
      const hit = map.get(path);
      if (hit) return hit;
      const i = path.lastIndexOf("/");
      const parent = getDir(i < 0 ? "" : path.slice(0, i));
      const node: DirNode = { name: i < 0 ? path : path.slice(i + 1), path, dirs: [], files: [] };
      parent.dirs.push(node);
      map.set(path, node);
      return node;
    };
    for (const f of files) getDir(f.dir ?? "").files.push(f);
    const sortNode = (n: DirNode) => {
      n.dirs.sort((a, b) => a.name.localeCompare(b.name));
      n.files.sort((a, b) => a.name.localeCompare(b.name));
      n.dirs.forEach(sortNode);
    };
    sortNode(root);
    return root;
  }, [ghTree, files]);
 
  const rootFiles = useMemo(
    () => files.filter((f) => !f.dir).sort((a, b) => a.name.localeCompare(b.name)),
    [files]
  );
 
  const openFile = useCallback((id: string) => {
    setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setActiveId(id);
  }, []);

  const loadGhFile = useCallback(
    (id: string) => {
      const meta = ghMeta.current.get(id);
      if (meta?.loaded && meta.baseContent) {
        setFiles((fs) => fs.map((f) => (f.id === id && f.content === "" ? { ...f, content: meta.baseContent } : f)));
      }
      const tree = ghTreeRef.current;
      if (!meta || meta.loaded || !tree || ghInflight.current.has(id)) return;
      ghInflight.current.add(id);
      setGhLoadingId(id);
      void (async () => {
        try {
          const ext = fileExt(meta.path);
          if (IMAGE_EXTS.has(ext)) {
            let b64 = await cacheGet(meta.sha);
            if (b64 === null) {
              b64 = await fetchBlobB64(tree.ref, meta.sha);
              cachePut(meta.sha, b64);
            }
            const bytes = b64ToBytes(b64);
            const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: IMAGE_MIME[ext] }));
            setGhImages((m) => new Map(m).set(id, url));
            meta.loaded = true;
            setGhLoadedTick((n) => n + 1);
          } else if (BINARY_EXTS.has(ext)) {
            let b64 = await cacheGet(meta.sha);
            if (b64 === null) {
              b64 = await fetchBlobB64(tree.ref, meta.sha);
              cachePut(meta.sha, b64);
            }
            const bytes = b64ToBytes(b64);
            const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" }));
            setGhBins((m) => new Map(m).set(id, { url, size: bytes.length }));
            meta.loaded = true;
            setGhLoadedTick((n) => n + 1);
          } else {
            let text = await cacheGet(meta.sha);
            if (text === null) {
              text = await fetchBlob(tree.ref, meta.sha);
              cachePut(meta.sha, text);
            }
            meta.baseContent = text;
            meta.loaded = true;
            setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, content: text } : f)));
          }
        } catch (e) {
          setConsoleOpen(true);
          setConsoleLines((prev) => [...prev, { kind: "err", text: `GitHub：读取文件失败 — ${(e as Error).message}` }]);
        } finally {
          ghInflight.current.delete(id);
          setGhLoadingId((cur) => (cur === id ? null : cur));
        }
      })();
    },
    []
  );

  const loadGhFileRef = useRef(loadGhFile);
  loadGhFileRef.current = loadGhFile;

  useEffect(() => {
    for (const id of [activeId, splitId]) {
      if (id && ghMeta.current.has(id) && !ghMeta.current.get(id)!.loaded) loadGhFile(id);
    }
  }, [activeId, splitId, ghLoadedTick, loadGhFile]);

  const openFileSmart = useCallback(
    (id: string) => {
      const meta = ghMeta.current.get(id);
      if (meta) {
        const dir = meta.path.includes("/") ? meta.path.slice(0, meta.path.lastIndexOf("/") + 1) : "";
        const negatives: string[] = [];
        for (const m of ghMeta.current.values()) {
          if (negatives.length >= 3) break;
          if (m.path !== meta.path && m.path.startsWith(dir) && !m.path.slice(dir.length).includes("/")) negatives.push(m.path);
        }
        brainRecordOpen(meta.path, meta.loaded, negatives);
        const succ = brainSuccessors(meta.path).filter((p) => !(ghMeta.current.get(`gh:${p}`)?.loaded ?? true));
        if (succ.length > 0) preloader.current?.boost(succ);
      }
      loadGhFile(id);
      openFile(id);
    },
    [loadGhFile, openFile]
  );
  const openFileSmartRef = useRef(openFileSmart);
  openFileSmartRef.current = openFileSmart;
 
  const closeFile = useCallback((id: string) => {
    setOpenIds((ids) => {
      const next = ids.filter((x) => x !== id);
      setActiveId((cur) => {
        if (cur !== id) return cur;
        const idx = ids.indexOf(id);
        return next[Math.max(0, idx - 1)] ?? "";
      });
      return next;
    });
  }, []);
 
  const closeOthers = useCallback((id: string) => {
    setOpenIds([id]);
    setActiveId(id);
  }, []);
 
  const closeToRight = useCallback((id: string) => {
    setOpenIds((ids) => {
      const idx = ids.indexOf(id);
      const next = ids.slice(0, idx + 1);
      setActiveId((cur) => (next.includes(cur) ? cur : id));
      return next;
    });
  }, []);
 
  const closeAll = useCallback(() => {
    setOpenIds([]);
    setActiveId("");
  }, []);
 
  const reorderTab = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setOpenIds((ids) => {
      const from = ids.indexOf(fromId);
      const to = ids.indexOf(toId);
      if (from < 0 || to < 0) return ids;
      const next = [...ids];
      next.splice(from, 1);
      next.splice(to, 0, fromId);
      return next;
    });
  }, []);
 
  const autoPushTimers = useRef(new Map<string, TrailingTask>());
  const draftTimers = useRef(new Map<string, TrailingTask>());
  const ghTreeRef = useRef<GhTree | null>(null);

  const persistDraft = useCallback((fileId: string) => {
    const meta = ghMeta.current.get(fileId);
    const tree = ghTreeRef.current;
    if (!meta || !tree) return;
    const repo = repoKey(tree.ref);
    const content = getCachedDoc(fileId, meta.baseContent);
    const key = draftKey(repo, meta.path);
    if (meta.loaded && content === meta.baseContent) void deleteDraft(key);
    else {
      void saveDraft({ key, repoKey: repo, path: meta.path, content, savedAt: Date.now() });
      // 本地编辑历史：每个文件最多每 30s 留存一份版本快照
      const now = Date.now();
      if (now - (localSnapAt.current.get(meta.path) ?? 0) >= 30_000) {
        localSnapAt.current.set(meta.path, now);
        void recordLocalVersion(repo, meta.path, content, "save");
      }
    }
  }, []);

  const scheduleDraft = useCallback((fileId: string) => {
    if (!ghMeta.current.has(fileId) || !ghTreeRef.current) return;
    scheduleTrailing(draftTimers.current, fileId, 350, persistDraft);
  }, [persistDraft]);

  const autoPush = useCallback((fileId: string) => {
    const meta = ghMeta.current.get(fileId);
    const currentEngine = engine.current;
    const tree = ghTreeRef.current;
    if (!meta?.loaded || !currentEngine || !tree) return;
    const content = getCachedDoc(fileId, meta.baseContent);
    if (content === meta.baseContent) return;
    void recordLocalVersion(repoKey(tree.ref), meta.path, content, "commit", `Update ${meta.path}`);
    void currentEngine.enqueue({
      path: meta.path,
      baseSha: meta.sha,
      baseContent: meta.baseContent,
      content,
      message: `Update ${meta.path}`,
    });
  }, []);

  const onDocChange = useCallback((fileId: string) => {
    scheduleDraft(fileId);
    if (!autoSaveRef.current) {
      setDirty((d) => (d.has(fileId) ? d : new Set(d).add(fileId)));
      return;
    }
    const meta = ghMeta.current.get(fileId);
    if (!meta || !meta.loaded || !engine.current) return;
    scheduleTrailing(autoPushTimers.current, fileId, 2500, autoPush);
  }, [scheduleDraft, autoPush]);

  useEffect(() => () => {
    cancelTrailing(draftTimers.current);
    cancelTrailing(autoPushTimers.current);
  }, []);
 
  const appendConsole = useCallback((lines: ConsoleLine[]) => {
    setConsoleLines((prev) => [...prev, ...lines]);
  }, []);

  const appendLog = useCallback((lines: ConsoleLine[]) => {
    setLogLines((prev) => [...prev, ...lines]);
  }, []);
 
  const consoleBodyRef = useRef<HTMLDivElement>(null);
  const consoleScrollPos = useRef(new Map<string, number>());
  const cursorMap = useRef(new Map<string, { line: number; col: number }>());
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const splitIdRef = useRef(splitId);
  splitIdRef.current = splitId;
  const onMainCursor = useCallback((cursor: CursorInfo) => {
    cursorStore.set(cursor);
    cursorMap.current.set(activeIdRef.current, { line: cursor.line, col: cursor.col });
  }, [cursorStore]);
  const onSplitCursor = useCallback((cursor: CursorInfo) => {
    cursorStore.set(cursor);
    const id = splitIdRef.current;
    if (id) cursorMap.current.set(id, { line: cursor.line, col: cursor.col });
  }, [cursorStore]);
  const sidebarScrollRef = useRef(0);
  const treeNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = consoleBodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) consoleEndRef.current?.scrollIntoView({ block: "end" });
  }, [consoleLines, logLines]);

  useEffect(() => {
    const el = consoleBodyRef.current;
    if (!el) return;
    const saved = consoleScrollPos.current.get(consoleTab);
    el.scrollTop = saved ?? el.scrollHeight;
  }, [consoleTab, consoleOpen]);
 
  const searchHits = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    void ghLoadedTick;
    const needle = q.toLowerCase();
    const hits: SearchHit[] = [];
    for (const f of files) {
      if (f.hyper || IMAGE_EXTS.has(fileExt(f.name)) || BINARY_EXTS.has(fileExt(f.name))) continue;
      const meta = ghMeta.current.get(f.id);
      const content = getCachedDoc(f.id, meta ? meta.baseContent : f.content);
      if (!content) continue;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].toLowerCase().indexOf(needle);
        if (idx < 0) continue;
        hits.push({
          fileId: f.id,
          name: f.name,
          dir: f.dir,
          line: i + 1,
          text: lines[i].trim().slice(0, 80),
          start: idx,
          end: idx + q.length,
        });
        if (hits.length >= 30) return hits;
      }
    }
    return hits;
  }, [query, files, ghLoadedTick]);

  const [ghSearchHits, setGhSearchHits] = useState<GhCodeHit[]>([]);
  useEffect(() => {
    setGhSearchHits([]);
    const q = query.trim();
    if (!paletteOpen || q.length < 3 || !ghTree) return;
    const t = window.setTimeout(() => {
      void searchCode(ghTree.ref, q)
        .then((hits) => setGhSearchHits(hits))
        .catch(() => {});
    }, 700);
    return () => window.clearTimeout(t);
  }, [query, paletteOpen, ghTree]);

  const [copiedTick, setCopiedTick] = useState(false);
  const copyAllOutput = useCallback(() => {
    const src = consoleTab === "logs" ? logLines : consoleLines;
    if (src.length === 0) return;
    const text = src.map((l) => (l.kind === "cmd" ? `$ ${l.text}` : l.text)).join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedTick(true);
      window.setTimeout(() => setCopiedTick(false), 1200);
    });
  }, [consoleTab, logLines, consoleLines]);
  const copyAllOutputRef = useRef(copyAllOutput);
  copyAllOutputRef.current = copyAllOutput;
  const consoleOpenRef = useRef(consoleOpen);
  consoleOpenRef.current = consoleOpen;

  const revealFirstMatch = useCallback((fileId: string, q: string, attempts = 30) => {
    const meta = ghMeta.current.get(fileId);
    const content = getCachedDoc(fileId, meta?.loaded ? meta.baseContent : "");
    if (!content) {
      if (attempts > 0) window.setTimeout(() => revealFirstMatch(fileId, q, attempts - 1), 100);
      return;
    }
    const lines = content.split("\n");
    const needle = q.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].toLowerCase().indexOf(needle);
      if (idx >= 0) {
        revealLine(fileId, i + 1, idx);
        return;
      }
    }
  }, []);

  const termHistory = useRef<Array<{ label: string; fileId: string }>>([]);
  const [termInput, setTermInput] = useState("");
  const termHistIdx = useRef(-1);
  const termInputRef = useRef<HTMLInputElement>(null);

  const runFile = useCallback(async (f: (typeof files)[number] | undefined) => {
    if (!f) return;
    setConsoleOpen(true);
    if (f.hyper) {
      appendConsole([{ kind: "info", text: "该文件为演示用超大文件，无法运行。" }]);
      return;
    }
    const lang = languageFor(f.name);
    if (!isRunnable(lang.id)) {
      appendConsole([{ kind: "info", text: `暂不支持运行 ${lang.label} 文件。` }]);
      return;
    }
    setRunning(true);
    setConsoleTab("terminal");
    const cmdLabel = runCommandLabel(lang.id, `${f.dir ? `${f.dir}/` : ""}${f.name}`);
    termHistory.current = [...termHistory.current.filter((h) => h.label !== cmdLabel), { label: cmdLabel, fileId: f.id }];
    appendConsole([{ kind: "cmd", text: cmdLabel }]);
    try {
      const r = await runCode(lang.id, getCachedDoc(f.id, f.content));
      const out: ConsoleLine[] = [];
      if (r.compileOutput.trim()) out.push({ kind: r.ok ? "out" : "err", text: r.compileOutput.trimEnd() });
      if (r.output.trim()) out.push({ kind: r.ok ? "out" : "err", text: r.output.trimEnd() });
      out.push({ kind: "info", text: `进程已结束，退出代码 ${r.code ?? "未知"}` });
      setConsoleLines((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].kind === "cmd") { next[i] = { ...next[i], ok: r.ok }; break; }
        }
        return [...next, ...out];
      });
    } catch {
      appendConsole([{ kind: "err", text: "运行失败：无法连接运行服务，请检查网络。" }]);
    } finally {
      setRunning(false);
    }
  }, [appendConsole]);
 
  const runActive = useCallback(() => {
    void runFile(openIds.includes(activeId) ? filesById.get(activeId) : undefined);
  }, [runFile, filesById, activeId, openIds]);
 
  const saveFile = useCallback((id?: string) => {
    setDirty((d) => {
      if (!id) return new Set();
      const next = new Set(d);
      next.delete(id);
      return next;
    });
  }, []);
 
  const startEngine = useCallback(
    (tree: GhTree) => {
      engine.current?.stop();
      const e = new SyncEngine(tree.ref, tree.headSha, {
        onDeltas: (deltas, newHead) => handleDeltasRef.current(deltas, newHead),
        onTransactionDone: (tx, r) => {
          const id = `gh:${tx.path}`;
          const meta = ghMeta.current.get(id);
          const committed = r.committedContent ?? tx.content;
          if (meta) {
            if (r.newSha) meta.sha = r.newSha;
            meta.baseContent = committed;
          }
          // 三方合并改变了内容：把合并结果回写到编辑器（若用户提交后又输入了新内容则不覆盖）
          if (r.committedContent !== undefined) {
            const current = getCachedDoc(id, tx.content);
            if (current === tx.content) {
              setCachedDoc(id, committed);
              setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, content: committed } : f)));
            } else {
              appendLog([{ kind: "info", text: `GitHub：${tx.path} 合并结果与编辑器当前内容不同（提交后有新输入），远端为合并版，编辑器保留本地` }]);
            }
          }
          void deleteDraft(draftKey(repoKey(tree.ref), tx.path));
          setDirty((d) => {
            if (!d.has(id)) return d;
            const next = new Set(d);
            next.delete(id);
            return next;
          });
          appendLog([{ kind: "info", text: `GitHub：${tx.path} ${r.message}` }]);
        },
        onTransactionError: (tx, err, willRetry) => {
          if (willRetry) {
            appendLog([{ kind: "info", text: `同步引擎：${tx.path} 提交暂时失败（${err.message}），事务已保留，恢复后自动重试` }]);
          } else {
            setConsoleOpen(true);
            setConsoleTab("logs");
            appendLog([{ kind: "err", text: `GitHub：${tx.path} 提交失败 — ${err.message}` }]);
          }
        },
        onState: (state, pending) => setSyncStatus({ state, pending }),
        onInfo: (text) => appendLog([{ kind: "info", text }]),
        onConflict: (tx, err) => {
          setConsoleOpen(true);
          setConsoleTab("logs");
          appendLog([{ kind: "err", text: `GitHub：${tx.path} 与远端冲突（${err.message}），提交已挂起、内容已保留；同步到最新版本后重新保存即可重提` }]);
        },
      });
      engine.current = e;
      void e.start();
    },
    [appendLog]
  );

  /** 将一棵仓库树应用到编辑器（全量/本地引导共用），并启动同步引擎。 */
  const applyTree = useCallback(
    async (tree: GhTree) => {
      const bootT0 = performance.now();
      ghMeta.current.clear();
      const fs: SampleFile[] = tree.entries.map((e) => {
        const slash = e.path.lastIndexOf("/");
        const id = `gh:${e.path}`;
        ghMeta.current.set(id, { path: e.path, sha: e.sha, baseContent: "", loaded: false });
        return {
          id,
          name: slash < 0 ? e.path : e.path.slice(slash + 1),
          dir: slash < 0 ? undefined : e.path.slice(0, slash),
          content: "",
        };
      });
      setGhTree(tree);
      ghTreeRef.current = tree;
      setFiles(fs);
      const repo = repoKey(tree.ref);
      const idSet = new Set(fs.map((f) => f.id));
      let openRestored: string[] = [];
      let activeRestored = "";
      let splitRestored: string | null = null;
      try {
        const raw = localStorage.getItem(`lumen.session.${repo}`);
        if (raw) {
          const s = JSON.parse(raw) as {
            open?: string[];
            active?: string;
            split?: string | null;
            cursors?: Record<string, { line: number; col: number }>;
            consoleOpen?: boolean;
            consoleHeight?: number;
            consoleTab?: string;
            consoleScroll?: Record<string, number>;
            sidebarScroll?: number;
          };
          openRestored = (s.open ?? []).filter((x) => idSet.has(x));
          activeRestored = s.active && idSet.has(s.active) ? s.active : openRestored[0] ?? "";
          splitRestored = s.split && idSet.has(s.split) ? s.split : null;
          if (s.cursors) cursorMap.current = new Map(Object.entries(s.cursors));
          if (typeof s.consoleHeight === "number") setConsoleHeight(Math.min(Math.max(s.consoleHeight, 120), Math.max(120, window.innerHeight - 160)));
          if (typeof s.consoleOpen === "boolean") setConsoleOpen(s.consoleOpen);
          if (s.consoleTab === "problems" || s.consoleTab === "output" || s.consoleTab === "logs" || s.consoleTab === "terminal" || s.consoleTab === "ports") setConsoleTab(s.consoleTab);
          if (s.consoleScroll) consoleScrollPos.current = new Map(Object.entries(s.consoleScroll));
          if (typeof s.sidebarScroll === "number") {
            sidebarScrollRef.current = s.sidebarScroll;
            window.setTimeout(() => {
              if (treeNavRef.current) treeNavRef.current.scrollTop = sidebarScrollRef.current;
            }, 80);
          }
        }
      } catch {
        /* 无效会话数据则忽略 */
      }
      setOpenIds(openRestored);
      setActiveId(activeRestored);
      setSplitId(splitRestored);
      const toLoad = [...new Set([...openRestored, ...(splitRestored ? [splitRestored] : [])])];
      if (toLoad.length > 0) {
        window.setTimeout(() => {
          for (const id of toLoad) loadGhFileRef.current(id);
        }, 0);
      }
      setExtraFolders([]);
      const drafts = (await loadDrafts(repo)).filter((d) => ghMeta.current.has(`gh:${d.path}`));
      for (const d of drafts) setCachedDoc(`gh:${d.path}`, d.content);
      setDirty(new Set(drafts.map((d) => `gh:${d.path}`)));
      if (drafts.length > 0) {
        appendLog([{ kind: "info", text: `已恢复 ${drafts.length} 个未提交的本地草稿（内容保留在编辑器中，提交后清除）` }]);
      }
      setGhImages((m) => {
        for (const url of m.values()) URL.revokeObjectURL(url);
        return new Map();
      });
      setGhBins((m) => {
        for (const b of m.values()) URL.revokeObjectURL(b.url);
        return new Map();
      });
      setCollapsed(new Set(fs.flatMap((f) => (f.dir ? ancestorDirs(f.dir) : []))));
      setGhOpen(false);
      appendLog([{ kind: "info", text: `GitHub：已打开 ${tree.ref.owner}/${tree.ref.repo}@${tree.ref.branch}（${fs.length} 个文件）` }]);
      setRecents(pushRecent(`${tree.ref.owner}/${tree.ref.repo}`, tree.ref.branch));
      historyCache.current.clear();

      startEngine(tree);
      void saveSnapshot({ key: repoKey(tree.ref), headSha: tree.headSha, entries: tree.entries, updatedAt: Date.now() });
      setBranches(null);
      void listBranches(tree.ref).then(setBranches).catch(() => {});

      const token = tree.ref.token;
      preloader.current?.stop();
      const candidates: PreloadTarget[] = tree.entries.filter(
        (e2) => !IMAGE_EXTS.has(fileExt(e2.path)) && !BINARY_EXTS.has(fileExt(e2.path)) && e2.size <= 300 * 1024
      );
      const cached = await cacheGetMany(candidates.map((c) => c.sha));
      let hits = 0;
      for (const c of candidates) {
        const text = cached.get(c.sha);
        if (text === undefined) continue;
        const m = ghMeta.current.get(`gh:${c.path}`);
        if (m && !m.loaded) {
          m.baseContent = text;
          m.loaded = true;
          hits++;
        }
      }
      if (hits > 0) setGhLoadedTick((n) => n + 1);
      const remaining = candidates.filter((c) => !ghMeta.current.get(`gh:${c.path}`)?.loaded);
      const concurrency = token ? 8 : 4;
      appendLog([{ kind: "info", text: `开屏诊断：文件树 ${fs.length} 个文件，内容缓存命中 ${hits}/${candidates.length}，待预加载 ${remaining.length} 个（并发 ${concurrency}），引导耗时 ${Math.round(performance.now() - bootT0)} ms` }]);
      const p = new Preloader(
        tree.ref,
        concurrency,
        (path) => ghMeta.current.get(`gh:${path}`)?.loaded ?? true,
        (path, _sha, text) => {
          const m = ghMeta.current.get(`gh:${path}`);
          if (!m || m.loaded) return;
          m.baseContent = text;
          m.loaded = true;
          setGhLoadedTick((n) => n + 1);
        },
        (stats) => {
          const b = brainStats();
          const acc = b.hits + b.misses === 0 ? "暂无数据" : `${Math.round(b.accuracy * 100)}%（猜对 ${b.hits} / 猜错 ${b.misses}）`;
          appendLog([{ kind: "info", text: `预加载完成：${stats.fetched} 个文件 / ${Math.round(stats.bytes / 1024)} KB，耗时 ${(stats.ms / 1000).toFixed(1)} s；预加载模型累计命中率 ${acc}` }]);
        }
      );
      preloader.current = p;
      p.start(remaining.slice(0, token ? 1000 : 40), brainScore);
    },
    [appendLog, startEngine]
  );

  const openGithubRepo = useCallback(async (repoInput: string, tokenInput: string, branchInput: string): Promise<boolean> => {
    const parsed = parseRepoInput(repoInput);
    if (!parsed) {
      setGhError("无法识别仓库地址，支持 owner/repo 或完整 GitHub URL");
      return false;
    }
    setGhBusy(true);
    setGhError("");
    try {
      const token = tokenInput.trim() || undefined;
      const tree = await openRepo(parsed.owner, parsed.repo, token, branchInput);
      if (token) localStorage.setItem("lumen.gh.token", token);
      else localStorage.removeItem("lumen.gh.token");
      localStorage.setItem("lumen.gh.repo", `${parsed.owner}/${parsed.repo}`);
      localStorage.setItem("lumen.gh.branch", tree.ref.branch);
      await applyTree(tree);
      return true;
    } catch (e) {
      setGhError((e as Error).message);
      return false;
    } finally {
      setGhBusy(false);
    }
  }, [applyTree]);

  const boostPreload = useCallback((paths: string[]) => {
    preloader.current?.boost(paths.filter((p) => !(ghMeta.current.get(`gh:${p}`)?.loaded ?? true)));
  }, []);

  const connectGithub = useCallback(
    () => openGithubRepo(ghRepoInput, ghTokenInput, ghBranchInput),
    [openGithubRepo, ghRepoInput, ghTokenInput, ghBranchInput]
  );

  const buildSession = useCallback(
    () => ({
      open: openIds,
      active: activeId,
      split: splitId,
      cursors: Object.fromEntries(cursorMap.current),
      consoleOpen,
      consoleHeight,
      consoleTab,
      consoleScroll: Object.fromEntries(consoleScrollPos.current),
      sidebarScroll: sidebarScrollRef.current,
    }),
    [openIds, activeId, splitId, consoleOpen, consoleHeight, consoleTab]
  );
  const buildSessionRef = useRef(buildSession);
  buildSessionRef.current = buildSession;

  useEffect(() => {
    if (!ghTree) return;
    localStorage.setItem(`lumen.session.${repoKey(ghTree.ref)}`, JSON.stringify(buildSession()));
  }, [ghTree, buildSession]);

  useEffect(() => {
    const save = () => {
      const tree = ghTreeRef.current;
      if (tree) localStorage.setItem(`lumen.session.${repoKey(tree.ref)}`, JSON.stringify(buildSessionRef.current()));
    };
    window.addEventListener("beforeunload", save);
    return () => window.removeEventListener("beforeunload", save);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const c = cursorMap.current.get(activeId);
    if (c) revealLine(activeId, c.line, Math.max(0, c.col - 1));
  }, [activeId]);

  const restoredRepo = useRef(false);
  useEffect(() => {
    if (restoredRepo.current) return;
    restoredRepo.current = true;
    // 链接参数快捷打开：?mode=text 纯文本在线编辑；?open=owner/repo[&branch=..][&file=..] 快开仓库
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    if (mode === "text") {
      const id = "quicktext";
      setFiles([{ id, name: params.get("name")?.trim() || "untitled.txt", content: "" }]);
      setOpenIds([id]);
      setActiveId(id);
      setGhRestoring(false);
      appendLog([{ kind: "info", text: "快捷打开：文本在线编辑模式" }]);
      return;
    }
    const quickOpen = params.get("open") || params.get("repo");
    if (quickOpen && parseRepoInput(quickOpen)) {
      const branch = params.get("branch") ?? "";
      const file = params.get("file") ?? "";
      const token = localStorage.getItem("lumen.gh.token") ?? "";
      setGhRestoring(true);
      setGhRepoInput(quickOpen);
      setGhBranchInput(branch);
      appendLog([{ kind: "info", text: `快捷打开：正在打开 ${quickOpen}${branch ? `@${branch}` : ""}…` }]);
      void (async () => {
        const ok = await openGithubRepo(quickOpen, token, branch);
        if (ok && file) {
          const id = `gh:${file}`;
          if (ghMeta.current.has(id)) void openFileSmartRef.current(id);
          else appendLog([{ kind: "err", text: `快捷打开：仓库里没有文件 ${file}` }]);
        }
        if (!ok) appendLog([{ kind: "err", text: `快捷打开：打开 ${quickOpen} 失败` }]);
        setGhRestoring(false);
      })();
      return;
    }
    const repo = localStorage.getItem("lumen.gh.repo");
    if (!repo) {
      setGhRestoring(false);
      return;
    }
    const branch = localStorage.getItem("lumen.gh.branch") ?? "";
    const token = localStorage.getItem("lumen.gh.token") ?? "";
    setGhRepoInput(repo);
    setGhBranchInput(branch);
    void (async () => {
      // 本地引导（local bootstrap）：先从 IndexedDB 快照秒开，再由同步引擎增量追平
      const parsed = parseRepoInput(repo);
      if (parsed) {
        const br = branch.trim() || localStorage.getItem("lumen.gh.branch") || "";
        if (br) {
          const snap = await loadSnapshot(`${parsed.owner}/${parsed.repo}@${br}`);
          if (snap) {
            await applyTree({
              ref: { owner: parsed.owner, repo: parsed.repo, branch: br, token: token.trim() || undefined },
              entries: snap.entries,
              headSha: snap.headSha,
            });
            appendLog([{ kind: "info", text: "同步引擎：本地引导完成，正在后台增量同步…" }]);
            setGhRestoring(false);
            void engine.current?.pollOnce();
            return;
          }
        }
      }
      const ok = await openGithubRepo(repo, token, branch);
      if (!ok) {
        setFiles(SAMPLE_FILES);
        setOpenIds(["program", "hyper"]);
        setActiveId("program");
      }
      setGhRestoring(false);
    })();
  }, [openGithubRepo, applyTree, appendLog]);

  const closeGithub = useCallback(() => {
    cancelTrailing(draftTimers.current);
    cancelTrailing(autoPushTimers.current);
    preloader.current?.stop();
    preloader.current = null;
    engine.current?.stop();
    engine.current = null;
    ghTreeRef.current = null;
    setBranches(null);
    setBranchMenuOpen(false);
    setSyncStatus({ state: "synced", pending: 0 });
    localStorage.removeItem("lumen.gh.repo");
    localStorage.removeItem("lumen.gh.branch");
    ghMeta.current.clear();
    setGhImages((m) => {
      for (const url of m.values()) URL.revokeObjectURL(url);
      return new Map();
    });
    setGhBins((m) => {
      for (const b of m.values()) URL.revokeObjectURL(b.url);
      return new Map();
    });
    setGhTree(null);
    setFiles(SAMPLE_FILES);
    setOpenIds([]);
    setActiveId("");
    setSplitId(null);
    setCollapsed(new Set());
    setDirty(new Set());
  }, []);

  const doCommit = useCallback(async () => {
    if (!commitFor || !ghTree) return;
    const meta = ghMeta.current.get(commitFor);
    const f = filesById.get(commitFor);
    if (!meta || !f) return;
    if (!ghTree.ref.token) {
      setCommitError("未填写访问令牌（ghp_…），无法提交。请在 File → 打开 GitHub 仓库 里填入后重新打开仓库。");
      return;
    }
    if (!engine.current) return;
    setCommitBusy(true);
    setCommitError("");
    const content = getCachedDoc(f.id, f.content);
    void recordLocalVersion(repoKey(ghTree.ref), meta.path, content, "commit", commitMsg.trim() || `Update ${meta.path}`);
    await engine.current.enqueue({
      path: meta.path,
      baseSha: meta.sha,
      baseContent: meta.baseContent,
      content,
      message: commitMsg.trim() || `Update ${meta.path}`,
    });
    setConsoleOpen(true);
    if (!navigator.onLine) {
      appendLog([{ kind: "info", text: `同步引擎：${meta.path} 已入队（当前离线，联网后自动提交）` }]);
    }
    setCommitBusy(false);
    setCommitFor(null);
  }, [commitFor, ghTree, filesById, commitMsg, appendLog]);

  /** 应用远端 delta packets：文件树、元数据、打开中的文件实时热更新。 */
  handleDeltasRef.current = (deltas, newHead) => {
    const tree = ghTree;
    if (!tree) return;
    const notes: string[] = [];
    const removedIds: string[] = [];
    for (const d of deltas) {
      const oldPath = d.status === "renamed" ? d.previousPath : d.status === "removed" ? d.path : undefined;
      if (oldPath) {
        const rid = `gh:${oldPath}`;
        ghMeta.current.delete(rid);
        removedIds.push(rid);
        if (d.status === "removed") {
          notes.push(`删除 ${oldPath}`);
          continue;
        }
      }
      const id = `gh:${d.path}`;
      const meta = ghMeta.current.get(id);
      if (meta && meta.sha === d.sha) continue; // 本地事务的回声，跳过
      notes.push(`${d.status === "added" ? "新增" : d.status === "renamed" ? `重命名 ${d.previousPath} → ` : "更新"} ${d.path}`);
      const slash = d.path.lastIndexOf("/");
      if (!meta) {
        ghMeta.current.set(id, { path: d.path, sha: d.sha, baseContent: "", loaded: false });
        setFiles((fs) =>
          fs.some((f) => f.id === id)
            ? fs
            : [...fs, { id, name: slash < 0 ? d.path : d.path.slice(slash + 1), dir: slash < 0 ? undefined : d.path.slice(0, slash), content: "" }]
        );
        continue;
      }
      const localEdit =
        dirty.has(id) ||
        (engine.current?.hasPendingFor(d.path) ?? false) ||
        (meta.loaded && getCachedDoc(id, meta.baseContent) !== meta.baseContent);
      meta.sha = d.sha;
      meta.loaded = false;
      if (localEdit) {
        notes.push(`${d.path} 本地有未提交修改，保留本地版本（提交时自动三方合并）`);
        continue;
      }
      meta.baseContent = "";
      setGhImages((m) => {
        const url = m.get(id);
        if (!url) return m;
        URL.revokeObjectURL(url);
        const next = new Map(m);
        next.delete(id);
        return next;
      });
      setGhBins((m) => {
        const b = m.get(id);
        if (!b) return m;
        URL.revokeObjectURL(b.url);
        const next = new Map(m);
        next.delete(id);
        return next;
      });
      const isOpen = openIds.includes(id) || splitId === id;
      if (isOpen && !IMAGE_EXTS.has(fileExt(d.path)) && !BINARY_EXTS.has(fileExt(d.path))) {
        void (async () => {
          try {
            const text = await fetchBlob(tree.ref, d.sha);
            cachePut(d.sha, text);
            const m2 = ghMeta.current.get(id);
            if (!m2 || m2.sha !== d.sha) return;
            m2.baseContent = text;
            m2.loaded = true;
            setCachedDoc(id, text);
            setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, content: text } : f)));
            setGhLoadedTick((n) => n + 1);
          } catch {
            /* 打开时再拉 */
          }
        })();
      } else {
        setGhLoadedTick((n) => n + 1);
      }
    }
    if (removedIds.length > 0) {
      const gone = new Set(removedIds);
      setFiles((fs) => fs.filter((f) => !gone.has(f.id)));
      setOpenIds((ids) => ids.filter((x) => !gone.has(x)));
      setActiveId((cur) => (gone.has(cur) ? "" : cur));
      setSplitId((s) => (s && gone.has(s) ? null : s));
    }
    const entries = [...ghMeta.current.values()].map((m) => ({ path: m.path, sha: m.sha, size: 0 }));
    setGhTree((t) => (t ? { ...t, headSha: newHead, entries } : t));
    void saveSnapshot({ key: repoKey(tree.ref), headSha: newHead, entries, updatedAt: Date.now() });
    if (notes.length > 0) appendLog(notes.slice(0, 12).map((text) => ({ kind: "info" as const, text: `同步：${text}` })));
  };

  /** 提交历史：分支提交树 / 单文件修改历史，页面级缓存 + 增量加载 */
  const loadHistoryPage = useCallback(
    async (path: string | undefined, reset: boolean) => {
      const tree = ghTreeRef.current;
      if (!tree) return;
      const key = `${repoKey(tree.ref)}|${path ?? ""}`;
      if (reset) {
        const cached = historyCache.current.get(key);
        if (cached) {
          setHistoryList(cached.list);
          setHistoryEnd(cached.end);
          return;
        }
      }
      setHistoryLoading(true);
      try {
        const prev = reset ? [] : (historyCache.current.get(key)?.list ?? []);
        const page = Math.floor(prev.length / 30) + 1;
        const batch = await listCommits(tree.ref, { path, page, perPage: 30 });
        const seen = new Set(prev.map((c) => c.sha));
        const list = [...prev, ...batch.filter((c) => !seen.has(c.sha))];
        const end = batch.length < 30;
        historyCache.current.set(key, { list, end });
        setHistoryList(list);
        setHistoryEnd(end);
      } catch (e) {
        appendLog([{ kind: "err", text: `GitHub：加载提交历史失败 — ${(e as Error).message}` }]);
        if (reset) setHistoryList([]);
        setHistoryEnd(true);
      } finally {
        setHistoryLoading(false);
      }
    },
    [appendLog]
  );

  const openHistory = useCallback(
    (path?: string) => {
      setBranchMenuOpen(false);
      setHistoryFor({ path });
      setHistoryPreview(null);
      setHistoryList(null);
      setHistoryEnd(false);
      setHistoryLocal(null);
      const tree = ghTreeRef.current;
      if (path && tree) void loadLocalHistory(repoKey(tree.ref), path).then(setHistoryLocal);
      void loadHistoryPage(path, true);
    },
    [loadHistoryPage]
  );

  const previewHistoryVersion = useCallback(
    async (sha: string) => {
      const tree = ghTreeRef.current;
      const path = historyFor?.path;
      if (!tree || !path) return;
      const cacheKey = `${sha}:${path}`;
      const cached = historyBlobCache.current.get(cacheKey);
      if (cached !== undefined) {
        setHistoryPreview({ sha, content: cached });
        return;
      }
      setHistoryPreview({ sha, content: null });
      try {
        const text = await fetchFileAtCommit(tree.ref, path, sha);
        historyBlobCache.current.set(cacheKey, text);
        setHistoryPreview((p) => (p?.sha === sha ? { sha, content: text } : p));
      } catch (e) {
        appendLog([{ kind: "err", text: `GitHub：读取历史版本失败 — ${(e as Error).message}` }]);
        setHistoryPreview((p) => (p?.sha === sha ? null : p));
      }
    },
    [historyFor, appendLog]
  );

  const restoreHistoryVersion = useCallback(() => {
    const path = historyFor?.path;
    const content = historyPreview?.content;
    if (!path || content === undefined || content === null) return;
    const id = `gh:${path}`;
    // 恢复前把当前编辑器内容留存为本地版本，防误操作丢内容
    const tree = ghTreeRef.current;
    if (tree) {
      const meta = ghMeta.current.get(id);
      const current = getCachedDoc(id, meta?.baseContent ?? "");
      if (current !== content) void recordLocalVersion(repoKey(tree.ref), path, current, "restore", "恢复前自动留存");
    }
    setCachedDoc(id, content);
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, content } : f)));
    setDirty((d) => new Set(d).add(id));
    openFile(id);
    setHistoryFor(null);
    setHistoryPreview(null);
    appendLog([{ kind: "info", text: `历史：已将 ${path} 恢复到 ${historyPreview!.sha.includes(":") ? "本地版本" : historyPreview!.sha.slice(0, 7)}（未提交，Ctrl+S 提交）` }]);
  }, [historyFor, historyPreview, openFile, appendLog]);

  /** 文件历史时间线：本地编辑版本 + GitHub 提交合并，按时间倒序 */
  const historyTimeline = useMemo(() => {
    if (!historyFor?.path) return null;
    const items: Array<{ key: string; time: number; commit?: GhCommit; local?: LocalVersion }> = [];
    for (const v of historyLocal ?? []) items.push({ key: v.id, time: v.savedAt, local: v });
    for (const c of historyList ?? []) items.push({ key: c.sha, time: c.date ? Date.parse(c.date) : 0, commit: c });
    return items.sort((a, b) => b.time - a.time);
  }, [historyFor, historyLocal, historyList]);

  const switchBranch = useCallback(
    async (name: string) => {
      setBranchMenuOpen(false);
      if (!ghTree || name === ghTree.ref.branch || branchBusy) return;
      setBranchBusy(true);
      appendLog([{ kind: "info", text: `GitHub：正在切换到分支 ${name}…` }]);
      const ok = await openGithubRepo(`${ghTree.ref.owner}/${ghTree.ref.repo}`, ghTree.ref.token ?? "", name);
      if (ok) setGhBranchInput(name);
      else appendLog([{ kind: "err", text: `GitHub：切换分支 ${name} 失败` }]);
      setBranchBusy(false);
    },
    [ghTree, branchBusy, openGithubRepo, appendLog]
  );

  const toggleSplit = useCallback(() => {
    setSplitId((s) => (s ? null : activeId || null));
  }, [activeId]);
 
  const runActiveRef = useRef(() => {});
  const saveActiveRef = useRef(() => {});
  runActiveRef.current = runActive;
  saveActiveRef.current = () => {
    if (!active) return;
    saveFile(active.id);
    if (ghTree && ghMeta.current.has(active.id)) {
      const meta = ghMeta.current.get(active.id)!;
      setCommitMsg(`Update ${meta.path}`);
      setCommitFor(active.id);
    }
  };
 
  const newFile = useCallback((dir?: string) => {
    untitledCount.current += 1;
    const id = `untitled-${untitledCount.current}`;
    setFiles((fs) => [...fs, { id, name: "", dir, content: "" }]);
    if (dir) setCollapsed((c) => {
      const next = new Set(c);
      next.delete(dir);
      return next;
    });
    setRenaming({ kind: "file", id, isNew: true });
    setRenameText("");
  }, []);
 
  const newFolder = useCallback(() => {
    untitledCount.current += 1;
    const id = `__newdir-${untitledCount.current}`;
    setExtraFolders((ds) => [...ds, id]);
    setRenaming({ kind: "folder", id, isNew: true });
    setRenameText("");
  }, []);
 
  const startRenameFile = useCallback((f: SampleFile) => {
    setRenaming({ kind: "file", id: f.id, isNew: false });
    setRenameText(f.name);
  }, []);
 
  const startRenameFolder = useCallback((dir: string) => {
    setRenaming({ kind: "folder", id: dir, isNew: false });
    setRenameText(dir.startsWith("__newdir-") ? "" : dir);
  }, []);
 
  const deleteFile = useCallback(
    (id: string) => {
      setFiles((fs) => fs.filter((f) => f.id !== id));
      closeFile(id);
    },
    [closeFile]
  );
 
  const deleteFolder = useCallback(
    (dir: string) => {
      for (const f of files) if (f.dir === dir) closeFile(f.id);
      setFiles((fs) => fs.filter((f) => f.dir !== dir));
      setExtraFolders((ds) => ds.filter((d) => d !== dir));
    },
    [files, closeFile]
  );
 
  const commitRename = useCallback(() => {
    if (!renaming) return;
    const name = renameText.trim();
    if (renaming.kind === "file") {
      if (!name) {
        if (renaming.isNew) setFiles((fs) => fs.filter((f) => f.id !== renaming.id));
      } else {
        setFiles((fs) => fs.map((f) => (f.id === renaming.id ? { ...f, name } : f)));
        if (renaming.isNew) openFile(renaming.id);
      }
    } else {
      if (!name) {
        if (renaming.isNew) setExtraFolders((ds) => ds.filter((d) => d !== renaming.id));
      } else {
        setFiles((fs) => fs.map((f) => (f.dir === renaming.id ? { ...f, dir: name } : f)));
        setExtraFolders((ds) => ds.map((d) => (d === renaming.id ? name : d)));
      }
    }
    setRenaming(null);
  }, [renaming, renameText, openFile]);
 
  const cancelRename = useCallback(() => {
    if (renaming?.isNew) {
      if (renaming.kind === "file") setFiles((fs) => fs.filter((f) => f.id !== renaming.id));
      else setExtraFolders((ds) => ds.filter((d) => d !== renaming.id));
    }
    setRenaming(null);
  }, [renaming]);
 
  const collapseAll = useCallback(() => {
    setCollapsed(new Set(dirs));
  }, [dirs]);
 
  const toggleDir = useCallback((dir: string) => {
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }, []);
 
  const commands = useMemo<Command[]>(
    () => [
      ...files.map((f) => ({
        id: `open-${f.id}`,
        label: `打开 ${f.dir ? `${f.dir}/` : ""}${f.name}`,
        hint: f.hyper ? "1000 万行" : languageFor(f.name).label,
        fileIcon: languageFor(f.name).icon,
        run: () => void openFileSmart(f.id),
      })),
      { id: "github", label: "打开 GitHub 仓库…", icon: repoIcon, run: () => { setGhError(""); setGhStep(0); setGhOpen(true); } },
      ...recents.slice(0, 5).map((r, i) => ({
        id: `recent-${i}`,
        label: `最近打开 ${r.repo}@${r.branch}`,
        hint: relTime(new Date(r.at).toISOString()),
        icon: repoIcon,
        run: () => {
          setGhRepoInput(r.repo);
          setGhBranchInput(r.branch);
          void openGithubRepo(r.repo, localStorage.getItem("lumen.gh.token") ?? "", r.branch);
        },
      })),
      ...(ghTree
        ? [
            { id: "commits", label: "查看分支提交树", icon: gitBranchIcon, run: () => openHistory() },
            ...(activeId && ghMeta.current.has(activeId)
              ? [{ id: "filehistory", label: `文件修改历史 ${ghMeta.current.get(activeId)!.path}`, icon: historyIcon, run: () => openHistory(ghMeta.current.get(activeId)!.path) }]
              : []),
          ]
        : []),
      { id: "newfile", label: "新建文件", icon: newFileIcon, run: () => newFile() },
      { id: "theme", label: dark ? "切换到浅色主题" : "切换到深色主题", icon: colorModeIcon, run: () => setDark((d) => !d) },
      { id: "find", label: "文件内查找", hint: "Ctrl F", icon: searchIcon, run: () => { if (activeId) window.setTimeout(() => openFindPanel(activeId), 30); } },
      { id: "gotoline", label: "跳转到行", hint: "Ctrl G", icon: arrowRightIcon, run: () => { if (activeId) window.setTimeout(() => openGotoLine(activeId), 30); } },
    ],
    [files, openFileSmart, dark, newFile, activeId, recents, ghTree, openHistory, openGithubRepo]
  );
 
  const searchCommands = useMemo<Command[]>(() => {
    const q = query.trim();
    const local = searchHits.map((h) => ({
      id: `hit-${h.fileId}-${h.line}`,
      label: `${h.dir ? `${h.dir}/` : ""}${h.name}:${h.line}  ·  ${h.text}`,
      group: "全文搜索",
      loc: `${h.dir ? `${h.dir}/` : ""}${h.name}:${h.line}`,
      snippet: h.text,
      fileIcon: languageFor(h.name).icon,
      run: () => {
        openFileSmart(h.fileId);
        revealLine(h.fileId, h.line, h.start);
      },
    }));
    const seen = new Set(searchHits.map((h) => h.fileId));
    const remote = ghSearchHits
      .filter((h) => !seen.has(`gh:${h.path}`) && ghMeta.current.has(`gh:${h.path}`))
      .map((h) => {
        const frag = h.fragment.split("\n").find((l) => l.toLowerCase().includes(q.toLowerCase()))?.trim() ?? h.fragment.trim();
        return {
          id: `ghhit-${h.path}`,
          label: `${h.path}  ·  ${frag.slice(0, 80)}`,
          group: "GitHub 搜索",
          loc: h.path,
          snippet: frag.slice(0, 80),
          fileIcon: languageFor(h.path).icon,
          run: () => {
            openFileSmart(`gh:${h.path}`);
            revealFirstMatch(`gh:${h.path}`, q);
          },
        };
      });
    return [...local, ...remote];
  }, [searchHits, ghSearchHits, query, openFileSmart, revealFirstMatch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q ? commands : commands.filter((c) => c.label.toLowerCase().includes(q));
    return [...base, ...searchCommands];
  }, [commands, query, searchCommands]);
 
  useEffect(() => setHlIndex(0), [query, paletteOpen]);
 
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runActiveRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveActiveRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c" && consoleOpenRef.current) {
        e.preventDefault();
        copyAllOutputRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setMenu(null);
        setOpenMenubar(null);
        setHistoryFor(null);
        setHistoryPreview(null);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) setPaletteOpen(false);
      if (!(e.target as HTMLElement).closest?.(".menubar")) setOpenMenubar(null);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);
 
  const runCommand = (c: Command) => {
    setPaletteOpen(false);
    setQuery("");
    c.run();
  };
 
  const openMenu = (e: React.MouseEvent, items: CtxMenu["items"], prefer?: "above") => {
    e.preventDefault();
    e.stopPropagation();
    const itemH = 28;
    const estH = items.reduce((h, it) => h + (it.sep ? 9 : itemH), 12);
    let y = e.clientY;
    if (prefer === "above" && y - estH >= 8) y = y - estH - 4;
    else if (y + estH > window.innerHeight - 8) y = Math.max(8, y - estH);
    const x = Math.min(e.clientX, window.innerWidth - 238);
    setMenu({ x, y, items });
  };
 
  const renameInput = (
    <input
      className="rename-input"
      autoFocus
      value={renameText}
      onChange={(e) => setRenameText(e.target.value)}
      onBlur={commitRename}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelRename();
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      spellCheck={false}
    />
  );
 
  const menubarMenus: Array<{ name: string; items: CtxItem[] }> = [
    {
      name: "File",
      items: [
        { label: "新建文件…", run: () => newFile() },
        { label: "新建文件夹…", run: () => newFolder() },
        { sep: true },
        { label: "保存", hint: "Ctrl+S", run: () => saveActiveRef.current() },
        { label: "全部保存", run: () => saveFile() },
        { sep: true },
        { label: "打开 GitHub 仓库…", run: () => { setGhError(""); setGhStep(0); setGhOpen(true); } },
        ...recents.slice(0, 5).map((r) => ({
          label: `最近：${r.repo}@${r.branch}`,
          run: () => {
            setGhRepoInput(r.repo);
            setGhBranchInput(r.branch);
            void openGithubRepo(r.repo, localStorage.getItem("lumen.gh.token") ?? "", r.branch);
          },
        })),
        ...(ghTree ? [{ label: `关闭仓库 ${ghTree.ref.owner}/${ghTree.ref.repo}`, run: closeGithub }] : []),
        { sep: true },
        { label: "自动保存", checked: autoSave, run: () => setAutoSave((v) => { if (!v) setDirty(new Set()); return !v; }) },
        { sep: true },
        { label: "关闭编辑器", hint: "Ctrl+W", run: () => active && closeFile(active.id) },
      ],
    },
    {
      name: "Edit",
      items: [
        { label: "撤销", hint: "Ctrl+Z", run: () => document.execCommand("undo") },
        { label: "重做", hint: "Ctrl+Y", run: () => document.execCommand("redo") },
        { sep: true },
        { label: "剪切", hint: "Ctrl+X", run: () => document.execCommand("cut") },
        { label: "复制", hint: "Ctrl+C", run: () => document.execCommand("copy") },
        { label: "粘贴", hint: "Ctrl+V", run: () => navigator.clipboard.readText().then((t) => document.execCommand("insertText", false, t)) },
      ],
    },
    {
      name: "Selection",
      items: [{ label: "全选", hint: "Ctrl+A", run: () => document.execCommand("selectAll") }],
    },
    {
      name: "View",
      items: [
        { label: "命令面板…", hint: "Ctrl+K", run: () => setPaletteOpen(true) },
        { label: dark ? "浅色主题" : "深色主题", run: () => setDark((d) => !d) },
        { sep: true },
        { label: "侧边栏", hint: "Ctrl+B", checked: sidebarOpen, run: () => setSidebarOpen((o) => !o) },
        { label: "拆分编辑器", checked: !!splitId, run: toggleSplit },
        { sep: true },
        { label: "控制台面板", checked: consoleOpen, run: () => setConsoleOpen((o) => !o) },
      ],
    },
    {
      name: "Go",
      items: [
        { label: "跳转到定义", hint: "Ctrl+点击", run: () => {} },
        { label: "跳转到文件…", hint: "Ctrl+K", run: () => setPaletteOpen(true) },
      ],
    },
    {
      name: "Run",
      items: [{ label: running ? "运行中…" : "运行当前文件", hint: "Ctrl+Enter", run: runActive }],
    },
    {
      name: "Terminal",
      items: [
        { label: "切换控制台", checked: consoleOpen, run: () => setConsoleOpen((o) => !o) },
        { label: "清空控制台", run: () => setConsoleLines([]) },
      ],
    },
    {
      name: "Help",
      items: [{ label: "关于 Lumen", run: () => setAboutOpen(true) }],
    },
  ];
 
  const renderFileRow = (f: SampleFile, indent: boolean, padLeft?: number) => {
    const isRenaming = renaming?.kind === "file" && renaming.id === f.id;
    return (
      <button
        key={f.id}
        className={`tree-item${f.id === activeId ? " active" : ""}${indent ? " indent" : ""}`}
        style={padLeft !== undefined ? { paddingLeft: padLeft } : undefined}
        onMouseEnter={() => ghTree && boostPreload([f.dir ? `${f.dir}/${f.name}` : f.name])}
        draggable={!isRenaming}
        onDragStart={(e) => {
          dragTabId.current = f.id;
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          dragTabId.current = null;
          setDropZone(null);
        }}
        onClick={() => !isRenaming && void openFileSmart(f.id)}
        onContextMenu={(e) =>
          openMenu(e, [
            { label: "打开", run: () => void openFileSmart(f.id) },
            ...(ghMeta.current.has(f.id)
              ? [{ label: "修改历史…", run: () => openHistory(ghMeta.current.get(f.id)!.path) }]
              : []),
            { sep: true },
            { label: "重命名…", hint: "F2", run: () => startRenameFile(f) },
            { label: "删除", hint: "Delete", danger: true, run: () => deleteFile(f.id) },
          ])
        }
      >
        <img className="ficon" src={languageFor(isRenaming ? renameText || f.name : f.name).icon} alt="" />
        {isRenaming ? renameInput : f.name}
        {!isRenaming && f.badge && <span className="badge">{f.badge}</span>}
        {ghLoadingId === f.id && <span className="tree-loader"><Loader size={13} /></span>}
      </button>
    );
  };

  const subtreePaths = (node: DirNode, limit: number): string[] => {
    const out: string[] = [];
    const walk = (n: DirNode) => {
      for (const f of n.files) {
        if (out.length >= limit) return;
        out.push(f.dir ? `${f.dir}/${f.name}` : f.name);
      }
      for (const d of n.dirs) {
        if (out.length >= limit) return;
        walk(d);
      }
    };
    walk(node);
    return out;
  };

  const renderGhDir = (node: DirNode, depth: number): React.ReactNode => (
    <div key={node.path}>
      <button
        className="tree-item folder"
        style={{ paddingLeft: 10 + depth * 12 }}
        onMouseEnter={() => boostPreload(subtreePaths(node, 40))}
        onClick={() => toggleDir(node.path)}
      >
        <span className={`twist${collapsed.has(node.path) ? "" : " open"}`} />
        {node.name}
      </button>
      {!collapsed.has(node.path) && (
        <>
          {node.dirs.map((d) => renderGhDir(d, depth + 1))}
          {node.files.map((f) => renderFileRow(f, false, 10 + (depth + 1) * 12 + 15))}
        </>
      )}
    </div>
  );
 
  return (
    <div className="shell">
      <header className="titlebar">
        <div className="brand" onDoubleClick={() => setAboutOpen(true)}>
          <span className="brand-glyph" style={{ "--icon": `url("${logoGlyph}")` } as React.CSSProperties} />
          Lumen
        </div>
        <nav className="menubar" onMouseLeave={() => {}}>
          {menubarMenus.map((m) => (
            <div key={m.name} className="menubar-wrap">
              <button
                className={`menubar-btn${openMenubar === m.name ? " open" : ""}`}
                onClick={() => setOpenMenubar((cur) => (cur === m.name ? null : m.name))}
                onMouseEnter={() => setOpenMenubar((cur) => (cur ? m.name : cur))}
              >
                {m.name}
              </button>
              {openMenubar === m.name && (
                <div className="ctx-menu menubar-menu">
                  {m.items.map((item, i) =>
                    item.sep ? (
                      <div key={`sep-${i}`} className="ctx-sep" />
                    ) : (
                      <button
                        key={item.label}
                        className={`ctx-item${item.danger ? " danger" : ""}`}
                        onClick={() => {
                          setOpenMenubar(null);
                          item.run?.();
                        }}
                      >
                        <span className="ctx-check">
                        {item.checked && (
                          <span className="cicon" style={{ "--icon": `url("${checkIcon}")` } as React.CSSProperties} />
                        )}
                      </span>
                        {item.label}
                        {item.hint && <span className="ctx-hint">{item.hint}</span>}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="titlebar-center">
          <button className="cmdk-btn" onClick={() => setPaletteOpen(true)}>
            搜索文件与命令…
            <kbd>Ctrl K</kbd>
          </button>
        </div>
        <div className="titlebar-actions">
        <button
          className="icon-btn"
          title="切换面板"
          onClick={() => setConsoleOpen((o) => !o)}
        >
          <span className="cicon lg" style={{ "--icon": `url("${consoleOpen ? layoutPanelIcon : layoutPanelOffIcon}")` } as React.CSSProperties} />
        </button>
        <button
          className="icon-btn"
          title="切换主题"
          onClick={() => setDark((d) => !d)}
        >
          {dark ? (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        </div>
      </header>
      <div className="workbench">
        {sidebarOpen && (<>
        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <div className="explorer-section">
            <div className="explorer-head" onClick={() => setTreeOpen((o) => !o)}>
              <span className={`twist${treeOpen ? " open" : ""}`} />
              <span className="explorer-title">{ghTree ? `${ghTree.ref.repo}` : "Lumen-Demo"}</span>
              {ghTree && <span className="badge">GitHub</span>}
              <span className="explorer-actions" onClick={(e) => e.stopPropagation()}>
                <button className="mini-btn" title="新建文件" onClick={() => newFile()}>
                  <span className="cicon" style={{ "--icon": `url("${newFileIcon}")` } as React.CSSProperties} />
                </button>
                <button className="mini-btn" title="新建文件夹" onClick={newFolder}>
                  <span className="cicon" style={{ "--icon": `url("${newFolderIcon}")` } as React.CSSProperties} />
                </button>
                <button className="mini-btn" title="刷新资源管理器" onClick={() => { setFiles((fs) => [...fs]); void engine.current?.forcePoll(); }}>
                  <span className="cicon" style={{ "--icon": `url("${refreshIcon}")` } as React.CSSProperties} />
                </button>
                <button className="mini-btn" title="全部折叠" onClick={collapseAll}>
                  <span className="cicon" style={{ "--icon": `url("${collapseAllIcon}")` } as React.CSSProperties} />
                </button>
              </span>
            </div>
            {treeOpen && (
              <nav
                className="tree"
                ref={treeNavRef}
                onScroll={() => {
                  if (treeNavRef.current) sidebarScrollRef.current = treeNavRef.current.scrollTop;
                }}
                onContextMenu={(e) =>
                  openMenu(e, [
                    { label: "新建文件…", run: () => newFile() },
                    { label: "新建文件夹…", run: () => newFolder() },
                  ])
                }
              >
                {ghRoot ? (
                  <>
                    {ghRoot.dirs.map((d) => renderGhDir(d, 0))}
                    {ghRoot.files.map((f) => renderFileRow(f, false))}
                  </>
                ) : (<>
                {dirs.map((dir) => {
                  const isRenaming = renaming?.kind === "folder" && renaming.id === dir;
                  return (
                    <div key={dir}>
                      <button
                        className="tree-item folder"
                        onClick={() => !isRenaming && toggleDir(dir)}
                        onContextMenu={(e) =>
                          openMenu(e, [
                            { label: "新建文件…", run: () => newFile(dir) },
                            { sep: true },
                            { label: "重命名…", hint: "F2", run: () => startRenameFolder(dir) },
                            { label: "删除", hint: "Delete", danger: true, run: () => deleteFolder(dir) },
                          ])
                        }
                      >
                        <span className={`twist${collapsed.has(dir) ? "" : " open"}`} />
                        {isRenaming ? renameInput : dir}
                      </button>
                      {!collapsed.has(dir) &&
                        files
                          .filter((f) => f.dir === dir)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((f) => renderFileRow(f, true))}
                    </div>
                  );
                })}
                {rootFiles.map((f) => renderFileRow(f, false))}
                </>)}
              </nav>
            )}
          </div>
        </aside>
        <div
          className="sidebar-resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = sidebarWidth;
            const onMove = (ev: MouseEvent) => {
              const w = Math.min(Math.max(startW + (ev.clientX - startX), 140), 600);
              setSidebarWidth(w);
              localStorage.setItem("lumen.sidebar.width", String(w));
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
        </>)}
        <main className="main">
          <div className="editor-area">
          <div className="editor-col" style={splitId ? { flex: `${splitRatio} 1 0` } : undefined}>
          <div className="tabstrip">
            {openIds
              .map((id) => filesById.get(id))
              .filter((f): f is SampleFile => Boolean(f))
              .map((f) => (
                <div
                  key={f.id}
                  role="tab"
                  className={`tab${f.id === activeId ? " active" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    dragTabId.current = f.id;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    dragTabId.current = null;
                    setDropZone(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const dragId = dragTabId.current;
                    if (dragId) {
                      if (!openIds.includes(dragId)) {
                        setOpenIds((ids) => {
                          const idx = ids.indexOf(f.id);
                          const next = [...ids];
                          next.splice(idx, 0, dragId);
                          return next;
                        });
                        if (dragId === splitId) setSplitId(null);
                        setActiveId(dragId);
                      } else {
                        reorderTab(dragId, f.id);
                      }
                    }
                    dragTabId.current = null;
                    setDropZone(null);
                  }}
                  onClick={() => setActiveId(f.id)}
                  onAuxClick={(e) => e.button === 1 && closeFile(f.id)}
                  onContextMenu={(e) => {
                    const path = `${f.dir ? `${f.dir}/` : ""}${f.name}`;
                    openMenu(e, [
                      { label: "关闭", hint: "Ctrl+W", run: () => closeFile(f.id) },
                      { label: "关闭其他", run: () => closeOthers(f.id) },
                      { label: "关闭右侧", run: () => closeToRight(f.id) },
                      { label: "全部关闭", run: () => closeAll() },
                      { sep: true },
                      { label: "复制路径", run: () => void navigator.clipboard.writeText(path) },
                      { sep: true },
                      { label: "向右拆分", run: () => setSplitId(f.id) },
                    ]);
                  }}
                >
                  <img className="ficon" src={languageFor(f.name).icon} alt="" />
                  {f.name}
                  {dirty.has(f.id) && <span className="dirty" />}
                  <span
                    className="tab-close"
                    title="关闭"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeFile(f.id);
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                  </span>
                </div>
              ))}
            <div className="tab-actions">
              <button
                className="icon-btn run-btn"
                title={running ? "运行中…" : "运行当前文件 (Ctrl+Enter)"}
                disabled={running}
                onClick={runActive}
              >
                <span className="cicon" style={{ "--icon": `url("${playIcon}")` } as React.CSSProperties} />
              </button>
              <button className="icon-btn" title="拆分编辑器" onClick={toggleSplit}>
                <span className="cicon" style={{ "--icon": `url("${splitIcon}")` } as React.CSSProperties} />
              </button>
              {active && fileExt(active.name) === "md" && (
                <button
                  className="icon-btn"
                  title={mdPreviewIds.has(active.id) ? "返回编辑" : "Markdown 预览"}
                  onPointerEnter={() => { void loadMarkdownRenderer(); }}
                  onFocus={() => { void loadMarkdownRenderer(); }}
                  onClick={() => {
                    if (mdPreviewIds.has(active.id)) {
                      setMdPreviewIds((s) => {
                        const n = new Set(s);
                        n.delete(active.id);
                        return n;
                      });
                      return;
                    }
                    void loadMarkdownRenderer().then((renderer) => {
                      setMarkdownRenderer(() => renderer);
                      setMdPreviewIds((s) => {
                      const n = new Set(s);
                      n.add(active.id);
                      return n;
                      });
                    }, (error: unknown) => console.error("Failed to load Markdown preview", error));
                  }}
                >
                  <span className="cicon" style={{ "--icon": `url("${openPreviewIcon}")` } as React.CSSProperties} />
                </button>
              )}
            </div>
          </div>
          <div
            className="editor-host"
            onDragOver={(e) => {
              if (!dragTabId.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              const zone = e.clientX > rect.left + rect.width / 2 ? "main-right" : "main-full";
              setDropZone((z) => (z === zone ? z : zone));
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropZone((z) => (z === "main-right" || z === "main-full" ? null : z));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragTabId.current;
              dragTabId.current = null;
              const rect = e.currentTarget.getBoundingClientRect();
              const right = e.clientX > rect.left + rect.width / 2;
              setDropZone(null);
              if (!id) return;
              if (right) {
                if (id !== splitId) {
                  if (openIds.length > 1 && openIds.includes(id)) closeFile(id);
                  loadGhFile(id);
                  setSplitId(id);
                }
              } else {
                openFileSmart(id);
                if (id === splitId) setSplitId(null);
              }
            }}
            onContextMenu={(e) => {
              if (!(e.target as HTMLElement).closest(".cm-editor")) return;
              openMenu(e, [
                { label: "剪切", hint: "Ctrl+X", run: () => document.execCommand("cut") },
                { label: "复制", hint: "Ctrl+C", run: () => document.execCommand("copy") },
                {
                  label: "粘贴",
                  hint: "Ctrl+V",
                  run: () => {
                    navigator.clipboard.readText().then((text) => {
                      document.execCommand("insertText", false, text);
                    });
                  },
                },
                { sep: true },
                { label: "全选", hint: "Ctrl+A", run: () => document.execCommand("selectAll") },
                { sep: true },
                { label: "命令面板…", hint: "Ctrl+K", run: () => setPaletteOpen(true) },
              ]);
            }}
          >
          {ghRestoring ? (
            <div className="loading-pane"><Loader size={22} /></div>
          ) : !active ? (
            <div className="empty-pane" />
          ) : ghMeta.current.has(active.id) && !ghMeta.current.get(active.id)!.loaded ? (
            <div className="loading-pane"><Loader size={22} /></div>
          ) : ghImages.has(active.id) ? (
            <div className="img-view">
              <img src={ghImages.get(active.id)} alt={active.name} />
            </div>
          ) : ghBins.has(active.id) ? (
            <div className="bin-view">
              <img className="bin-icon" src={languageFor(active.name).icon} alt="" />
              <div className="bin-name">{active.name}</div>
              <div className="bin-size">二进制文件 · {fmtSize(ghBins.get(active.id)!.size)}</div>
              <a className="bin-download" href={ghBins.get(active.id)!.url} download={active.name}>下载</a>
            </div>
          ) : fileExt(active.name) === "md" && mdPreviewIds.has(active.id) && markdownRenderer ? (
            <div
              className="md-preview"
              dangerouslySetInnerHTML={{
                __html: markdownRenderer(getCachedDoc(active.id, active.content)),
              }}
            />
          ) : active.hyper ? (
            <HyperEditor dark={dark} onCursor={cursorStore.set} />
          ) : (
            <Editor
              key={active.id}
              fileId={active.id}
              filename={active.dir ? `${active.dir}/${active.name}` : active.name}
              initialDoc={active.content}
              dark={dark}
              onDocChange={onDocChange}
              onCursor={onMainCursor}
            />
          )}
          {dropZone === "main-right" && <div className="drop-overlay right" />}
          {dropZone === "main-full" && <div className="drop-overlay full" />}
          </div>
          </div>
          {splitId && (() => {
            const sf = filesById.get(splitId);
            return (
              <>
              <div
                className="split-resizer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const area = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  const onMove = (ev: MouseEvent) => {
                    const r = (ev.clientX - area.left) / area.width;
                    setSplitRatio(Math.min(Math.max(r, 0.2), 0.8));
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              />
              <div
                className="editor-host split-pane"
                style={{ flex: `${1 - splitRatio} 1 0` }}
                onDragOver={(e) => {
                  if (!dragTabId.current) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropZone((z) => (z === "split-full" ? z : "split-full"));
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropZone((z) => (z === "split-full" ? null : z));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = dragTabId.current;
                  dragTabId.current = null;
                  setDropZone(null);
                  if (id && id !== splitId) {
                    if (openIds.length > 1 && openIds.includes(id)) closeFile(id);
                    loadGhFile(id);
                    setSplitId(id);
                  }
                }}
              >
                <div className="tabstrip">
                  {sf && (
                    <div
                      role="tab"
                      className="tab active"
                      draggable
                      onDragStart={(e) => {
                        dragTabId.current = sf.id;
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        dragTabId.current = null;
                        setDropZone(null);
                      }}
                      onClick={() => setActiveId(sf.id)}
                    >
                      <img className="ficon" src={languageFor(sf.name).icon} alt="" />
                      {sf.name}
                      {dirty.has(sf.id) && <span className="dirty" />}
                      <span
                        className="tab-close"
                        title="关闭"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSplitId(null);
                        }}
                      >
                        <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                        </svg>
                      </span>
                    </div>
                  )}
                  <div className="tab-actions">
                    <button
                      className="icon-btn run-btn"
                      title={running ? "运行中…" : "运行此文件"}
                      disabled={running}
                      onClick={() => void runFile(sf)}
                    >
                      <span className="cicon" style={{ "--icon": `url("${playIcon}")` } as React.CSSProperties} />
                    </button>
                  </div>
                </div>
                {!sf ? (
                  <div className="empty-pane" />
                ) : ghMeta.current.has(sf.id) && !ghMeta.current.get(sf.id)!.loaded ? (
                  <div className="loading-pane"><Loader size={22} /></div>
                ) : ghImages.has(sf.id) ? (
                  <div className="img-view">
                    <img src={ghImages.get(sf.id)} alt={sf.name} />
                  </div>
                ) : ghBins.has(sf.id) ? (
                  <div className="bin-view">
                    <img className="bin-icon" src={languageFor(sf.name).icon} alt="" />
                    <div className="bin-name">{sf.name}</div>
                    <div className="bin-size">二进制文件 · {fmtSize(ghBins.get(sf.id)!.size)}</div>
                    <a className="bin-download" href={ghBins.get(sf.id)!.url} download={sf.name}>下载</a>
                  </div>
                ) : sf.hyper ? (
                  <HyperEditor dark={dark} onCursor={cursorStore.set} />
                ) : (
                  <Editor
                    key={`split-${sf.id}`}
                    fileId={sf.id}
                    filename={sf.dir ? `${sf.dir}/${sf.name}` : sf.name}
                    initialDoc={sf.content}
                    dark={dark}
                    onDocChange={onDocChange}
                    onCursor={onSplitCursor}
                  />
                )}
                {dropZone === "split-full" && <div className="drop-overlay full" />}
              </div>
              </>
            );
          })()}
          </div>
 
          {consoleOpen && (
            <div className="console-panel" style={{ height: consoleHeight }}>
              <div
                className="console-resizer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const startY = e.clientY;
                  const startH = consoleHeight;
                  const onMove = (ev: MouseEvent) => {
                    const h = startH + (startY - ev.clientY);
                    setConsoleHeight(Math.min(Math.max(h, 80), window.innerHeight - 160));
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              />
              <div className="console-head">
                {([
                  ["problems", "问题"],
                  ["output", "输出"],
                  ["logs", "日志"],
                  ["terminal", "终端"],
                  ["ports", "端口"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    className={`console-tab${consoleTab === id ? " active" : ""}`}
                    onClick={() => setConsoleTab(id)}
                  >
                    {label}
                  </button>
                ))}
                <span className="console-actions">
                  <button className="icon-btn sm" title="新建终端" onClick={() => setConsoleTab("terminal")}>
                    <span className="cicon" style={{ "--icon": `url("${addIcon}")` } as React.CSSProperties} />
                  </button>
                  <button className="icon-btn sm" title="复制全部输出 (Ctrl+Shift+C)" onClick={copyAllOutput}>
                    <span className="cicon" style={{ "--icon": `url("${copiedTick ? checkIcon : copyIcon}")` } as React.CSSProperties} />
                  </button>
                  <button className="icon-btn sm" title="清空" onClick={() => (consoleTab === "logs" ? setLogLines([]) : setConsoleLines([]))}>
                    <span className="cicon" style={{ "--icon": `url("${trashIcon}")` } as React.CSSProperties} />
                  </button>
                  <button className="icon-btn sm" title="更多操作">
                    <span className="cicon" style={{ "--icon": `url("${ellipsisIcon}")` } as React.CSSProperties} />
                  </button>
                  <button className="icon-btn sm" title="关闭面板" onClick={() => setConsoleOpen(false)}>
                    <span className="cicon" style={{ "--icon": `url("${closeIcon}")` } as React.CSSProperties} />
                  </button>
                </span>
              </div>
              <div className="console-main">
                <div
                  className="console-body"
                  ref={consoleBodyRef}
                  onScroll={() => {
                    const el = consoleBodyRef.current;
                    if (el) consoleScrollPos.current.set(consoleTab, el.scrollTop);
                  }}
                  onMouseUp={() => {
                    if (consoleTab !== "terminal" || running) return;
                    const sel = window.getSelection();
                    if (sel && !sel.isCollapsed) return;
                    termInputRef.current?.focus({ preventScroll: true });
                  }}
                >
                  {consoleTab === "problems" ? (
                    <div className="console-empty">目前尚未在工作区检测到问题。</div>
                  ) : consoleTab === "output" ? (
                    <div className="console-empty">没有要显示的输出。</div>
                  ) : consoleTab === "logs" ? (
                    logLines.length === 0 ? (
                      <div className="console-empty">暂无日志。</div>
                    ) : (
                      <>
                        {logLines.map((l, i) => (
                          <pre key={i} className={`console-line ${l.kind}`}>{l.text}</pre>
                        ))}
                        <div ref={consoleEndRef} />
                      </>
                    )
                  ) : consoleTab === "ports" ? (
                    <div className="console-empty">尚未转发任何端口。</div>
                  ) : (
                    <>
                      {consoleLines.map((l, i) =>
                        l.kind === "cmd" ? (
                          <pre key={i} className="console-line cmd">
                            <span
                              className={`cmd-dot${l.ok === false ? " fail" : l.ok ? " ok" : ""}`}
                              onClick={(e) => {
                                const outLines: string[] = [];
                                for (let j = i + 1; j < consoleLines.length && consoleLines[j].kind !== "cmd"; j++) {
                                  outLines.push(consoleLines[j].text);
                                }
                                const output = outLines.join("\n");
                                openMenu(e, [
                                  { label: "重新运行命令", run: () => void runActive() },
                                  { sep: true },
                                  { label: "复制命令", run: () => void navigator.clipboard.writeText(l.text) },
                                  { label: "复制命令和输出", run: () => void navigator.clipboard.writeText(`${l.text}\n${output}`) },
                                  { label: "复制输出", run: () => void navigator.clipboard.writeText(output) },
                                ], "above");
                              }}
                            />
                            <span className="console-prompt">wandbox:~$</span> {l.text}
                          </pre>
                        ) : (
                          <pre key={i} className={`console-line ${l.kind}`}>{l.text}</pre>
                        )
                      )}
                      {running && (
                        <pre className="console-line info run-wait">
                          <Loader size={13} />
                          <span>Running…</span>
                        </pre>
                      )}
                      {!running && (
                        <pre className="console-line cmd console-input-line">
                          <span className="console-prompt">wandbox:~$</span>{" "}
                          <input
                            ref={termInputRef}
                            className="console-input"
                            value={termInput}
                            spellCheck={false}
                            onChange={(e) => {
                              setTermInput(e.target.value);
                              termHistIdx.current = -1;
                            }}
                            onKeyDown={(e) => {
                              const hist = termHistory.current;
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                if (hist.length === 0) return;
                                const idx = termHistIdx.current < 0 ? hist.length - 1 : Math.max(0, termHistIdx.current - 1);
                                termHistIdx.current = idx;
                                setTermInput(hist[idx].label);
                              } else if (e.key === "ArrowDown") {
                                e.preventDefault();
                                if (termHistIdx.current < 0) return;
                                const idx = termHistIdx.current + 1;
                                if (idx >= hist.length) {
                                  termHistIdx.current = -1;
                                  setTermInput("");
                                } else {
                                  termHistIdx.current = idx;
                                  setTermInput(hist[idx].label);
                                }
                              } else if (e.key === "Enter") {
                                e.preventDefault();
                                const cmd = termInput.trim();
                                termHistIdx.current = -1;
                                setTermInput("");
                                if (!cmd) return;
                                const hit = hist.find((h) => h.label === cmd);
                                if (hit) {
                              void runFile(filesById.get(hit.fileId));
                                } else {
                                  appendConsole([
                                    { kind: "cmd", text: cmd },
                                    { kind: "err", text: `命令未找到：${cmd}（按 ↑ 可翻出历史命令）` },
                                  ]);
                                }
                              }
                            }}
                          />
                        </pre>
                      )}
                      <div ref={consoleEndRef} />
                    </>
                  )}
                </div>
                {consoleTab === "terminal" && (
                  <div className="console-sessions">
                    <div className="console-session active">
                      <span className="cicon" style={{ "--icon": `url("${pwshIcon}")` } as React.CSSProperties} />
                      pwsh
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
 
        </main>
      </div>
 
      <footer className="statusbar">
        {ghTree ? (
          <>
            <button
              className={`status-item status-btn branch-btn${branchMenuOpen ? " open" : ""}`}
              title="切换分支"
              onClick={() => setBranchMenuOpen((v) => !v)}
            >
              {branchBusy ? <Loader size={11} /> : <span className="cicon status-cicon" style={{ "--icon": `url("${gitBranchIcon}")` } as React.CSSProperties} />}
              {ghTree.ref.owner}/{ghTree.ref.repo} · {ghTree.ref.branch}
            </button>
            <button className="status-item status-btn" title="查看分支提交树" onClick={() => openHistory()}>
              <span className="cicon status-cicon" style={{ "--icon": `url("${historyIcon}")` } as React.CSSProperties} />
              提交
            </button>
            <span className="status-item sync-item" title="GitHub 超级同步引擎">
              {syncStatus.state === "syncing" ? (
                <>
                  <Loader size={11} /> 同步中…
                </>
              ) : syncStatus.state === "pending" ? (
                <>
                  <span className="cicon status-cicon" style={{ "--icon": `url("${cloudUploadIcon}")` } as React.CSSProperties} />
                  {syncStatus.pending} 待提交
                </>
              ) : syncStatus.state === "conflict" ? (
                `⚠ 冲突 · ${syncStatus.pending} 个提交挂起`
              ) : syncStatus.state === "offline" ? (
                `离线${syncStatus.pending > 0 ? ` · ${syncStatus.pending} 个事务待重放` : ""}`
              ) : (
                `已同步 ${ghTree.headSha.slice(0, 7)}`
              )}
            </span>
          </>
        ) : (
          <span className="status-item">main</span>
        )}
        <span className="status-spacer" />
        {active?.hyper ? (
          <>
            <CursorPosition store={cursorStore} locale />
            <span className="status-item">{HYPER_COUNT.toLocaleString()} 行</span>
            <span className="status-item">Spaces: 4</span>
            <span className="status-item">UTF-8</span>
            <span className="status-item">C#</span>
          </>
        ) : active ? (
          <>
            <CursorPosition store={cursorStore} />
            <span className="status-item">Spaces: 4</span>
            <span className="status-item">UTF-8</span>
            <span className="status-item">{languageFor(active.name).label}</span>
          </>
        ) : null}
      </footer>
 
      {branchMenuOpen && ghTree && (
        <div className="ctx-overlay" onMouseDown={() => setBranchMenuOpen(false)}>
          <div className="branch-menu" onMouseDown={(e) => e.stopPropagation()}>
            <div className="branch-menu-title">
              切换分支 — {ghTree.ref.owner}/{ghTree.ref.repo}
              <button className="branch-menu-commits" onClick={() => openHistory()}>
                <span className="cicon status-cicon" style={{ "--icon": `url("${historyIcon}")` } as React.CSSProperties} />
                提交树
              </button>
            </div>
            <div className="branch-menu-list">
              {branches === null ? (
                <div className="branch-menu-empty">
                  <Loader size={14} /> 正在加载分支列表…
                </div>
              ) : branches.length === 0 ? (
                <div className="branch-menu-empty">没有找到分支</div>
              ) : (
                branches.map((b) => (
                  <button
                    key={b.name}
                    className={`branch-menu-item${b.name === ghTree.ref.branch ? " active" : ""}`}
                    onClick={() => void switchBranch(b.name)}
                  >
                    <span className="cicon status-cicon" style={{ "--icon": `url("${gitBranchIcon}")` } as React.CSSProperties} />
                    <span className="branch-name">{b.name}</span>
                    <span className="branch-sha">{b.sha.slice(0, 7)}</span>
                    {b.name === ghTree.ref.branch && <img className="branch-check" src={checkIcon} alt="" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {historyFor && ghTree && (
        <div className="ghq-overlay" onMouseDown={() => { setHistoryFor(null); setHistoryPreview(null); }}>
          <div className={`history-modal${historyFor.path && historyPreview ? " with-preview" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
            <div className="ghq-titlebar">
              <span className="ghq-titletext">
                {historyFor.path ? `修改历史 · ${historyFor.path}` : `提交树 · ${ghTree.ref.owner}/${ghTree.ref.repo}@${ghTree.ref.branch}`}
              </span>
              <button className="ghq-nav ghq-close" onClick={() => { setHistoryFor(null); setHistoryPreview(null); }}>
                <span className="cicon" style={{ "--icon": `url("${closeIcon}")` } as React.CSSProperties} />
              </button>
            </div>
            <div className="history-body">
              <div className="history-list">
                {historyFor.path && historyTimeline ? (
                  historyTimeline.length === 0 && historyList !== null ? (
                    <div className="branch-menu-empty">还没有任何历史记录</div>
                  ) : (
                    <>
                      {historyTimeline.map((it, i) => (
                        <button
                          key={it.key}
                          className={`history-item${historyPreview?.sha === (it.local ? it.local.id : it.commit!.sha) ? " active" : ""}`}
                          onClick={() => {
                            if (it.local) setHistoryPreview({ sha: it.local.id, content: it.local.content });
                            else void previewHistoryVersion(it.commit!.sha);
                          }}
                        >
                          <span className="history-rail">
                            <span className={`history-dot${it.local ? " local" : it.commit!.parents.length > 1 ? " merge" : ""}`} />
                            {i < historyTimeline.length - 1 && <span className="history-line" />}
                          </span>
                          <span className="history-main">
                            <span className="history-msg">
                              {it.local
                                ? it.local.label || (it.local.kind === "save" ? "本地编辑快照" : it.local.kind === "commit" ? "提交前留存" : "恢复前留存")
                                : it.commit!.message.split("\n")[0]}
                            </span>
                            <span className="history-meta">
                              {it.local ? (
                                <>本地 · {relTime(new Date(it.local.savedAt).toISOString())}</>
                              ) : (
                                <>
                                  {it.commit!.avatar && <img className="history-avatar" src={it.commit!.avatar} alt="" />}
                                  {it.commit!.author} · {relTime(it.commit!.date)}
                                  {it.commit!.parents.length > 1 && <span className="history-mergetag">merge</span>}
                                </>
                              )}
                            </span>
                          </span>
                          {it.local ? (
                            <span className="history-localtag">本地</span>
                          ) : (
                            <span className="history-sha">{it.commit!.sha.slice(0, 7)}</span>
                          )}
                        </button>
                      ))}
                      {historyList === null ? (
                        <div className="branch-menu-empty"><Loader size={14} /> 正在加载 GitHub 提交…</div>
                      ) : (
                        !historyEnd && (
                          <button className="history-more" disabled={historyLoading} onClick={() => void loadHistoryPage(historyFor.path, false)}>
                            {historyLoading ? <><Loader size={12} /> 加载中…</> : "加载更早的提交"}
                          </button>
                        )
                      )}
                    </>
                  )
                ) : historyList === null ? (
                  <div className="branch-menu-empty"><Loader size={14} /> 正在加载提交历史…</div>
                ) : historyList.length === 0 ? (
                  <div className="branch-menu-empty">没有提交记录</div>
                ) : (
                  <>
                    {historyList.map((c, i) => (
                      <button
                        key={c.sha}
                        className={`history-item${historyPreview?.sha === c.sha ? " active" : ""}`}
                        onClick={() => { if (historyFor.path) void previewHistoryVersion(c.sha); }}
                      >
                        <span className="history-rail">
                          <span className={`history-dot${c.parents.length > 1 ? " merge" : ""}`} />
                          {i < historyList.length - 1 && <span className="history-line" />}
                        </span>
                        <span className="history-main">
                          <span className="history-msg">{c.message.split("\n")[0]}</span>
                          <span className="history-meta">
                            {c.avatar && <img className="history-avatar" src={c.avatar} alt="" />}
                            {c.author} · {relTime(c.date)}
                            {c.parents.length > 1 && <span className="history-mergetag">merge</span>}
                          </span>
                        </span>
                        <span className="history-sha">{c.sha.slice(0, 7)}</span>
                      </button>
                    ))}
                    {!historyEnd && (
                      <button className="history-more" disabled={historyLoading} onClick={() => void loadHistoryPage(historyFor.path, false)}>
                        {historyLoading ? <><Loader size={12} /> 加载中…</> : "加载更早的提交"}
                      </button>
                    )}
                  </>
                )}
              </div>
              {historyFor.path && historyPreview && (
                <div className="history-preview">
                  <div className="history-preview-head">
                    <span>{historyFor.path} @ {historyPreview.sha.includes(":") ? "本地版本" : historyPreview.sha.slice(0, 7)}</span>
                    <button className="history-restore" disabled={historyPreview.content === null} onClick={restoreHistoryVersion}>
                      恢复此版本到编辑器
                    </button>
                  </div>
                  {historyPreview.content === null ? (
                    <div className="branch-menu-empty"><Loader size={14} /> 正在读取历史版本…</div>
                  ) : (
                    <pre className="history-code">{historyPreview.content}</pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {menu && (
        <div className="ctx-overlay" onMouseDown={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()}>
          <div
            className="ctx-menu"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {menu.items.map((item, i) =>
              item.sep ? (
                <div key={`sep-${i}`} className="ctx-sep" />
              ) : (
                <button
                  key={item.label}
                  className={`ctx-item${item.danger ? " danger" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setMenu(null);
                    item.run?.();
                  }}
                >
                  {item.label}
                  {item.hint && <span className="ctx-hint">{item.hint}</span>}
                </button>
              )
            )}
          </div>
        </div>
      )}
      {paletteOpen && (
        <div
          ref={paletteRef}
          className="palette"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHlIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHlIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && filtered[hlIndex]) {
              runCommand(filtered[hlIndex]);
            }
          }}
        >
          <input
            className="palette-input"
            placeholder="输入命令或文件名…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="palette-list">
            {filtered.length === 0 && <div className="palette-empty">没有匹配的命令</div>}
            {filtered.map((c, i) => (
              <Fragment key={c.id}>
                {c.group && (i === 0 || filtered[i - 1].group !== c.group) && (
                  <div className="palette-group">{c.group}</div>
                )}
                <button
                  className={`palette-item${i === hlIndex ? " hl" : ""}`}
                  onMouseEnter={() => setHlIndex(i)}
                  onClick={() => runCommand(c)}
                >
                  {c.fileIcon ? (
                    <img className="ficon" src={c.fileIcon} alt="" />
                  ) : (
                    <span className="cicon" style={{ "--icon": `url("${c.icon}")` } as React.CSSProperties} />
                  )}
                  {c.snippet !== undefined ? (
                    <span className="plabel presult">
                      <span className="ploc">{c.loc}</span>
                      <span className="psnippet">{highlightMatch(c.snippet, query)}</span>
                    </span>
                  ) : (
                    <span className="plabel">{c.label}</span>
                  )}
                  {c.hint && <span className="hint">{c.hint}</span>}
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      )}
      {aboutOpen && (
        <div className={`about-overlay${aboutClosing ? " closing" : ""}`} onMouseDown={closeAbout}>
          <div className="about-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="about-main">
              <span className="about-logo" style={{ "--icon": `url("${logoGlyph}")` } as React.CSSProperties} />
              <div className="about-name">Lumen</div>
              <div className="about-sub">Code Editor</div>
              <div className="about-ver">版本 1.0.0</div>
            </div>
            <div className="about-quote">
              <p>"Programs must be written for people to read, and only incidentally for machines to execute."</p>
              <span className="about-quote-by">— Harold Abelson</span>
            </div>
          </div>
        </div>
      )}
      {ghOpen && (() => {
        const steps = [
          { title: "打开 GitHub 仓库", placeholder: "owner/repo 或 https://github.com/owner/repo", value: ghRepoInput, set: setGhRepoInput, password: false },
          { title: "访问令牌", placeholder: "ghp_…（公开仓库可留空，Enter 跳过）", value: ghTokenInput, set: setGhTokenInput, password: true },
          { title: "分支", placeholder: "留空使用默认分支（Enter 打开）", value: ghBranchInput, set: setGhBranchInput, password: false },
        ] as const;
        const s = steps[ghStep];
        const next = () => {
          if (ghBusy) return;
          setGhError("");
          if (ghStep === 0 && !parseRepoInput(ghRepoInput)) {
            setGhError("无法识别仓库地址，支持 owner/repo 或完整 GitHub URL");
            return;
          }
          if (ghStep < 2) setGhStep(ghStep + 1);
          else void connectGithub();
        };
        const back = () => {
          if (ghBusy) return;
          setGhError("");
          if (ghStep > 0) setGhStep(ghStep - 1);
          else setGhOpen(false);
        };
        return (
          <div className="ghq-overlay" onMouseDown={() => !ghBusy && setGhOpen(false)}>
            <div className="ghq" onMouseDown={(e) => e.stopPropagation()}>
              <div className="ghq-titlebar">
                <span className="ghq-titletext">{s.title}（{ghStep + 1}/3）</span>
              </div>
              <input
                key={ghStep}
                className="palette-input"
                type={s.password ? "password" : "text"}
                placeholder={s.placeholder}
                value={s.value}
                onChange={(e) => s.set(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") next();
                  else if (e.key === "Escape") { e.stopPropagation(); back(); }
                }}
                autoFocus
                spellCheck={false}
                disabled={ghBusy}
              />
              <div className="ghq-list">
                {ghError ? (
                  <div className="ghq-error">{ghError}</div>
                ) : ghBusy ? (
                  <div className="palette-item hl ghq-action"><Loader size={14} />正在打开 {ghRepoInput}…</div>
                ) : (
                  <>
                    <button className="palette-item hl ghq-action" onClick={next}>
                      {ghStep === 0 ? "继续" : ghStep === 1 ? (ghTokenInput ? "使用此令牌继续" : "跳过（公开仓库）") : `打开 ${ghRepoInput}`}
                      <span className="hint">Enter</span>
                    </button>
                    {ghStep === 0 && recents.length > 0 && (
                      <>
                        <div className="palette-group">最近打开</div>
                        {recents.slice(0, 5).map((r) => (
                          <button
                            key={`${r.repo}@${r.branch}`}
                            className="palette-item ghq-action"
                            onClick={() => {
                              setGhRepoInput(r.repo);
                              setGhBranchInput(r.branch);
                              void openGithubRepo(r.repo, ghTokenInput, r.branch);
                            }}
                          >
                            <span className="cicon" style={{ "--icon": `url("${repoIcon}")` } as React.CSSProperties} />
                            {r.repo}@{r.branch}
                            <span className="hint">{relTime(new Date(r.at).toISOString())}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {commitFor && ghTree && (
        <div className="ghq-overlay" onMouseDown={() => { if (!commitBusy) { setCommitFor(null); setCommitError(""); } }}>
          <div className="ghq" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ghq-titlebar">
              <span className="ghq-titletext">提交到 {ghTree.ref.owner}/{ghTree.ref.repo}@{ghTree.ref.branch} · {ghMeta.current.get(commitFor)?.path}</span>
            </div>
            <input
              className="palette-input"
              placeholder={`提交信息（留空使用 Update ${ghMeta.current.get(commitFor)?.path ?? ""}）`}
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void doCommit();
                else if (e.key === "Escape") { e.stopPropagation(); if (!commitBusy) { setCommitFor(null); setCommitError(""); } }
              }}
              autoFocus
              spellCheck={false}
              disabled={commitBusy}
            />
            <div className="ghq-list">
              {commitError ? (
                <div className="ghq-error">{commitError}</div>
              ) : commitBusy ? (
                <div className="palette-item hl ghq-action"><Loader size={14} />提交中…</div>
              ) : (
                <>
                  <button className="palette-item hl ghq-action" onClick={() => void doCommit()}>
                    <span className="cicon" style={{ "--icon": `url("${cloudUploadIcon}")` } as React.CSSProperties} />
                    提交并推送
                    <span className="hint">Enter</span>
                  </button>
                  <button className="palette-item ghq-action" onClick={() => setCommitFor(null)}>
                    仅本地保存
                    <span className="hint">Esc</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
